import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  doclingLabelToBlockType,
  normalizeDoclingDocument,
} from '../server/ai-text/engines/docling/docling-json.ts';

function assertClose(actual: readonly number[], expected: readonly number[]): void {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < 1e-9,
      `coordinate ${index}: ${actual[index]} != ${expected[index]}`,
    );
  }
}

function sampleDocument(): Record<string, unknown> {
  return {
    schema_name: 'DoclingDocument',
    version: '1.0.0',
    pages: {
      '1': { size: { width: 600, height: 800 } },
      '2': { size: { width: 600, height: 800 } },
    },
    body: {
      self_ref: '#/body',
      children: [
        { $ref: '#/texts/0' },
        { $ref: '#/groups/0' },
        { $ref: '#/tables/0' },
        { $ref: '#/pictures/0' },
      ],
    },
    furniture: {
      self_ref: '#/furniture',
      children: [{ $ref: '#/texts/2' }],
    },
    texts: [
      {
        self_ref: '#/texts/0',
        label: 'title',
        text: 'Hello World',
        prov: [
          {
            page_no: 1,
            bbox: { l: 60, t: 40, r: 540, b: 100, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/1',
        label: 'section_header',
        text: 'Intro',
        level: 2,
        prov: [
          {
            page_no: 2,
            bbox: { l: 60, t: 760, r: 540, b: 700, coord_origin: 'BOTTOMLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/2',
        label: 'page_footer',
        text: 'Page 1',
        prov: [
          {
            page_no: 1,
            bbox: { l: 250, t: 780, r: 350, b: 800, coord_origin: 'TOPLEFT' },
          },
        ],
      },
    ],
    groups: [
      {
        self_ref: '#/groups/0',
        label: 'section',
        children: [{ $ref: '#/texts/1' }],
      },
    ],
    tables: [
      {
        self_ref: '#/tables/0',
        label: 'table',
        prov: [
          {
            page_no: 1,
            bbox: { l: 60, t: 200, r: 540, b: 400, coord_origin: 'TOPLEFT' },
          },
        ],
        data: {
          table_cells: [
            {
              start_row_offset_idx: 0,
              start_col_offset_idx: 0,
              text: 'Name',
              column_header: true,
            },
            {
              start_row_offset_idx: 0,
              start_col_offset_idx: 1,
              text: 'Value',
              column_header: true,
            },
            {
              start_row_offset_idx: 1,
              start_col_offset_idx: 0,
              text: 'A|B',
            },
            {
              start_row_offset_idx: 1,
              start_col_offset_idx: 1,
              text: '2',
            },
          ],
        },
      },
    ],
    pictures: [
      {
        self_ref: '#/pictures/0',
        label: 'picture',
        prov: [
          {
            page_no: 2,
            bbox: { l: 100, t: 100, r: 300, b: 250, coord_origin: 'TOPLEFT' },
          },
        ],
        image: { uri: 'artifacts/image_000000.png' },
      },
    ],
  };
}

describe('docling: normalizeDoclingDocument', () => {
  it('follows body reading order and appends furniture', () => {
    const { layout } = normalizeDoclingDocument(sampleDocument(), 'guide.pdf');
    assert.equal(layout.source, 'docling');
    assert.equal(layout.parserId, 'docling');
    assert.equal(layout.pageCount, 2);
    assert.equal(layout.blockCount, 5);
    assert.deepEqual(
      layout.blocks.map((block) => block.type),
      ['doc_title', 'paragraph_title', 'table', 'image', 'footer'],
    );
    assert.deepEqual(
      layout.blocks.map((block) => block.id),
      ['docling-0', 'docling-1', 'docling-2', 'docling-3', 'docling-4'],
    );
  });

  it('converts TOPLEFT and BOTTOMLEFT boxes to normalized top-left units', () => {
    const { layout } = normalizeDoclingDocument(sampleDocument(), 'guide.pdf');
    const title = layout.blocks[0];
    assertClose(title.bbox, [0.1, 0.05, 0.9, 0.125]);
    const header = layout.blocks[1];
    assert.equal(header.pageNumber, 2);
    assertClose(header.bbox, [0.1, 0.05, 0.9, 0.125]);
    assert.equal(header.level, 2);
  });

  it('builds Markdown and HTML table blocks', () => {
    const { layout } = normalizeDoclingDocument(sampleDocument(), 'guide.pdf');
    const table = layout.blocks[2];
    assert.equal(table.type, 'table');
    assert.equal(table.text, '| Name | Value |\n| --- | --- |\n| A\\|B | 2 |');
    assert.equal(
      table.html,
      '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A|B</td><td>2</td></tr></table>',
    );
  });

  it('maps picture references to version-relative images and exposes them', () => {
    const { layout, pictures } = normalizeDoclingDocument(sampleDocument(), 'guide.pdf');
    const image = layout.blocks[3];
    assert.equal(image.type, 'image');
    assert.equal(image.imagePath, 'images/image_000000.png');
    assert.deepEqual(pictures, [
      {
        assetPath: 'images/image_000000.png',
        sourceUri: 'artifacts/image_000000.png',
        pageNumber: 2,
      },
    ]);
  });

  it('skips items without page provenance but still counts pages', () => {
    const document = sampleDocument();
    (document.texts as Array<Record<string, unknown>>)[0].prov = [];
    const { layout } = normalizeDoclingDocument(document, 'guide.pdf');
    assert.equal(layout.pageCount, 2);
    assert.equal(layout.blockCount, 4);
    assert.equal(layout.blocks[0].type, 'paragraph_title');
  });

  it('clamps boxes outside the page and drops zero-area boxes', () => {
    const document = sampleDocument();
    const texts = document.texts as Array<Record<string, unknown>>;
    texts[0] = {
      self_ref: '#/texts/0',
      label: 'text',
      text: 'Clamped',
      prov: [
        {
          page_no: 1,
          bbox: { l: -50, t: -20, r: 700, b: 300, coord_origin: 'TOPLEFT' },
        },
      ],
    };
    (document.texts as Array<Record<string, unknown>>)[2].prov = [
      {
        page_no: 1,
        bbox: { l: 100, t: 100, r: 100, b: 100, coord_origin: 'TOPLEFT' },
      },
    ];
    const { layout } = normalizeDoclingDocument(document, 'guide.pdf');
    const clamped = layout.blocks.find((block) => block.text === 'Clamped');
    assert.ok(clamped);
    assert.deepEqual(clamped.bbox, [0, 0, 1, 0.375]);
    assert.ok(!layout.blocks.some((block) => block.text === 'Page 1'));
  });

  it('deduplicates picture file names while keeping both references', () => {
    const document = sampleDocument();
    document.pictures = [
      ...(document.pictures as Array<Record<string, unknown>>),
      {
        self_ref: '#/pictures/1',
        label: 'picture',
        prov: [
          {
            page_no: 2,
            bbox: { l: 300, t: 300, r: 400, b: 400, coord_origin: 'TOPLEFT' },
          },
        ],
        image: { uri: 'artifacts/other/image_000000.png' },
      },
    ];
    (document.body as Record<string, unknown>).children = [
      { $ref: '#/pictures/0' },
      { $ref: '#/pictures/1' },
    ];
    const { layout, pictures } = normalizeDoclingDocument(document, 'guide.pdf');
    assert.equal(pictures.length, 2);
    assert.equal(pictures[0].assetPath, 'images/image_000000.png');
    assert.equal(pictures[1].assetPath, 'images/image_000000-1.png');
    assert.equal(layout.blocks[1].imagePath, 'images/image_000000-1.png');
  });

  it('never builds a picture path outside images/ for dot URIs', () => {
    for (const [uri, expected] of [
      ['..', 'images/image.png'],
      ['.', 'images/image.png'],
      ['../images/photo.png', 'images/photo.png'],
      ['/', 'images/image.png'],
    ] as const) {
      const document = sampleDocument();
      (document.pictures as Array<Record<string, unknown>>)[0].image = {
        uri,
      };
      const { layout, pictures } = normalizeDoclingDocument(document, 'guide.pdf');
      assert.equal(pictures[0].assetPath, expected, uri);
      const image = layout.blocks.find((block) => block.type === 'image');
      assert.equal(image?.imagePath, expected);
    }
  });

  it('falls back to the item arrays when the body has no children', () => {
    const document = sampleDocument();
    (document.body as Record<string, unknown>).children = undefined;
    const { layout } = normalizeDoclingDocument(document, 'guide.pdf');
    // Without body order, the mapper walks texts, then tables, then pictures.
    assert.deepEqual(
      layout.blocks.map((block) => block.type),
      ['doc_title', 'paragraph_title', 'footer', 'table', 'image'],
    );
  });

  it('returns an empty layout for malformed input', () => {
    const { layout, pictures } = normalizeDoclingDocument(null, 'guide.pdf');
    assert.equal(layout.pageCount, 0);
    assert.equal(layout.blockCount, 0);
    assert.deepEqual(pictures, []);
  });

  it('maps Docling labels to layout block types', () => {
    assert.equal(doclingLabelToBlockType('title'), 'doc_title');
    assert.equal(doclingLabelToBlockType('list_item'), 'list');
    assert.equal(doclingLabelToBlockType('formula'), 'equation');
    assert.equal(doclingLabelToBlockType('page_header'), 'header');
    assert.equal(doclingLabelToBlockType('chart'), 'chart');
    assert.equal(doclingLabelToBlockType('not_a_label'), 'unknown');
  });
});

describe('docling: table spans', () => {
  it('emits rowspan and colspan in HTML for spanned cells', () => {
    const document = sampleDocument();
    document.tables = [
      {
        self_ref: '#/tables/0',
        label: 'table',
        prov: [
          {
            page_no: 1,
            bbox: { l: 60, t: 200, r: 540, b: 400, coord_origin: 'TOPLEFT' },
          },
        ],
        data: {
          table_cells: [
            {
              start_row_offset_idx: 0,
              start_col_offset_idx: 0,
              end_row_offset_idx: 2,
              end_col_offset_idx: 2,
              text: 'Merged',
              column_header: true,
            },
            { start_row_offset_idx: 2, start_col_offset_idx: 0, text: 'Tail' },
          ],
        },
      },
    ];
    (document.body as Record<string, unknown>).children = [{ $ref: '#/tables/0' }];
    const { layout } = normalizeDoclingDocument(document, 'guide.pdf');
    const table = layout.blocks[0];
    assert.equal(
      table.html,
      '<table><tr><th rowspan="2" colspan="2">Merged</th></tr><tr><td>Tail</td></tr></table>',
    );
    assert.equal(table.text, '| Merged |  |\n| --- | --- |\n|  |  |\n| Tail |  |');
  });
});
