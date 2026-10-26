import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBegoniaSchema } from '@datalking/begonia-document-model';
import {
  PAGE_BREAK_MARKER,
  collectImageAssetPaths,
  countPageBreaks,
  markdownContainsPageBreakMarkers,
  resolvePaginatedDocSource,
  type DocumentBlock,
  type InlineRun,
} from '../client/ai-text/viewers/paginated-doc/document-input.ts';
import { markdownToDocumentBlocks } from '../client/ai-text/viewers/paginated-doc/markdown-to-document.ts';
import { layoutToDocumentBlocks } from '../client/ai-text/viewers/paginated-doc/layout-to-document.ts';
import {
  buildDocumentFromBlocks,
  countDocumentPages,
} from '../client/ai-text/viewers/paginated-doc/build-document.ts';
import { serializeDocumentToMarkdown } from '../client/ai-text/viewers/paginated-doc/document-to-markdown.ts';
import type { AiTextLayoutBlock, AiTextLayoutDocument } from '../shared/ai-text/layout.ts';

function layoutDocument(blocks: AiTextLayoutBlock[], pageCount: number): AiTextLayoutDocument {
  return {
    schemaVersion: 1,
    source: 'mineru-cloud',
    parserId: 'test',
    producedAt: '2026-01-01T00:00:00.000Z',
    pageCount,
    blockCount: blocks.length,
    blocks,
  };
}

function layoutBlock(overrides: Partial<AiTextLayoutBlock>): AiTextLayoutBlock {
  return {
    id: 'block-1',
    pageNumber: 1,
    type: 'text',
    bbox: [0, 0, 1, 1],
    text: '',
    ...overrides,
  };
}

const schema = createBegoniaSchema();

function roundTrip(markdown: string): {
  first: DocumentBlock[];
  second: DocumentBlock[];
  serialized: string;
} {
  const first = markdownToDocumentBlocks(markdown);
  // The viewer resolves every image asset before building the document; give
  // the round trip the same stub data URLs so image blocks survive.
  const assets = new Map(
    collectImageAssetPaths(first).map((assetPath) => [assetPath, 'data:image/png;base64,TEST']),
  );
  const document = buildDocumentFromBlocks(schema, first, assets);
  const serialized = serializeDocumentToMarkdown(document);
  const second = markdownToDocumentBlocks(serialized);
  return { first, second, serialized };
}

describe('paginated doc bridge: markdown → blocks', () => {
  it('parses headings, paragraphs, and inline marks', () => {
    const blocks = markdownToDocumentBlocks(
      '# Title\n\nplain text\n\n**bold** and *em* and `code` and ~~gone~~ and [link](https://example.com)\n',
    );
    assert.deepEqual(blocks[0], {
      kind: 'heading',
      level: 1,
      runs: [{ kind: 'text', text: 'Title' }],
    });
    assert.deepEqual(blocks[1], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'plain text' }],
    });
    const runs = (blocks[2] as { runs: InlineRun[] }).runs;
    assert.deepEqual(runs, [
      { kind: 'text', text: 'bold', bold: true },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'em', italic: true },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'code', code: true },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'gone', strike: true },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'link', href: 'https://example.com' },
    ]);

    // ***text*** is bold+italic; without the dedicated pattern the outer
    // stars would detach and the emphasis would not round-trip.
    const combined = markdownToDocumentBlocks('***both marks***');
    assert.deepEqual((combined[0] as { runs: InlineRun[] }).runs, [
      { kind: 'text', text: 'both marks', bold: true, italic: true },
    ]);
    const { first, second, serialized } = roundTrip('***both marks***');
    assert.ok(serialized.includes('***both marks***'));
    assert.deepEqual(second, first);
  });

  it('turns page markers into page breaks', () => {
    const markdown = `first\n\n${PAGE_BREAK_MARKER}\n\nsecond`;
    const blocks = markdownToDocumentBlocks(markdown);
    assert.equal(countPageBreaks(blocks), 1);
    assert.equal(markdownContainsPageBreakMarkers(markdown), true);
    assert.deepEqual(blocks[1], { kind: 'page_break' });
    assert.deepEqual(blocks[2], { kind: 'paragraph', runs: [{ kind: 'text', text: 'second' }] });
  });

  it('parses pipe tables and html tables into table blocks', () => {
    const pipe = markdownToDocumentBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |');
    assert.deepEqual(pipe[0], {
      kind: 'table',
      headers: ['a', 'b'],
      rows: [['1', '2']],
    });

    const html = markdownToDocumentBlocks(
      '<table><tr><th>h1</th><th>h2</th></tr><tr><td>c1</td><td>c2</td></tr></table>',
    );
    assert.deepEqual(html[0], {
      kind: 'table',
      headers: ['h1', 'h2'],
      rows: [['c1', 'c2']],
    });
  });

  it('parses code fences, rules, quotes, and lists', () => {
    const blocks = markdownToDocumentBlocks(
      '```\nconst x = 1;\n```\n\n---\n\n> quoted line\n\n- one\n- two\n\n1. first\n2. second',
    );
    assert.deepEqual(blocks[0], { kind: 'code_block', text: 'const x = 1;' });
    assert.deepEqual(blocks[1], { kind: 'hr' });
    assert.deepEqual(blocks[2], {
      kind: 'blockquote',
      runs: [{ kind: 'text', text: 'quoted line' }],
    });
    assert.deepEqual(blocks[3], {
      kind: 'list',
      ordered: false,
      items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]],
    });
    assert.deepEqual(blocks[4], {
      kind: 'list',
      ordered: true,
      items: [[{ kind: 'text', text: 'first' }], [{ kind: 'text', text: 'second' }]],
    });
  });

  it('keeps only version-relative image paths and falls back for the rest', () => {
    const blocks = markdownToDocumentBlocks(
      '![good](images/a.png)\n\n![bad](https://cdn.example.com/a.png)\n\ninline ![ok](images/nested/b.jpg) run',
    );
    assert.deepEqual(blocks[0], { kind: 'image', alt: 'good', assetPath: 'images/a.png' });
    // Remote URLs do not resolve through the version asset store, so the alt
    // text (or the raw line) survives instead of a broken image block.
    const fallback = blocks[1] as { kind: string; runs: Array<{ kind: string; text?: string }> };
    assert.equal(fallback.kind, 'paragraph');
    assert.deepEqual(collectImageAssetPaths(blocks), ['images/a.png', 'images/nested/b.jpg']);
    const inlineRuns = (blocks[2] as { runs: Array<{ kind: string; assetPath?: string }> }).runs;
    assert.ok(
      inlineRuns.some((run) => run.kind === 'image' && run.assetPath === 'images/nested/b.jpg'),
    );
  });
});

describe('paginated doc bridge: layout → blocks', () => {
  it('maps one PDF page to one paginated page with explicit page breaks', () => {
    const layout = layoutDocument(
      [
        layoutBlock({ id: 'a', pageNumber: 1, type: 'doc_title', text: 'Report' }),
        layoutBlock({ id: 'b', pageNumber: 1, type: 'text', text: 'first page body' }),
        layoutBlock({ id: 'c', pageNumber: 3, type: 'text', text: 'third page body' }),
      ],
      3,
    );
    const blocks = layoutToDocumentBlocks(layout);
    // Page 2 is empty but still present: two page breaks keep page 3 aligned.
    assert.equal(countPageBreaks(blocks), 2);
    assert.deepEqual(blocks[0], {
      kind: 'heading',
      level: 1,
      runs: [{ kind: 'text', text: 'Report' }],
    });
    assert.deepEqual(blocks[1], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'first page body' }],
    });
    assert.deepEqual(blocks[2], { kind: 'page_break' });
    assert.deepEqual(blocks[3], { kind: 'paragraph', runs: [] });
    assert.deepEqual(blocks[4], { kind: 'page_break' });
    assert.deepEqual(blocks[5], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'third page body' }],
    });
  });

  it('maps block types onto document blocks', () => {
    const layout = layoutDocument(
      [
        layoutBlock({ id: 't', type: 'paragraph_title', text: 'Section', level: 3 }),
        layoutBlock({ id: 'c', type: 'code', text: 'print(1)' }),
        layoutBlock({ id: 'i', type: 'image', imagePath: 'images/pic.jpg', text: 'Figure' }),
        layoutBlock({
          id: 'tb',
          type: 'table',
          html: '<table><tr><th>x</th></tr><tr><td>1</td></tr></table>',
        }),
        layoutBlock({ id: 'sc', type: 'table', imagePath: 'images/scan.jpg', text: 'Scanned' }),
        layoutBlock({ id: 'm', type: 'text', text: 'line one\nline two' }),
      ],
      1,
    );
    const blocks = layoutToDocumentBlocks(layout);
    assert.deepEqual(blocks[0], {
      kind: 'heading',
      level: 3,
      runs: [{ kind: 'text', text: 'Section' }],
    });
    assert.deepEqual(blocks[1], { kind: 'code_block', text: 'print(1)' });
    assert.deepEqual(blocks[2], { kind: 'image', alt: 'Figure', assetPath: 'images/pic.jpg' });
    assert.deepEqual(blocks[3], { kind: 'table', headers: ['x'], rows: [['1']] });
    assert.deepEqual(blocks[4], { kind: 'image', alt: 'Scanned', assetPath: 'images/scan.jpg' });
    // Multi-line text becomes one paragraph per line.
    assert.deepEqual(blocks[5], { kind: 'paragraph', runs: [{ kind: 'text', text: 'line one' }] });
    assert.deepEqual(blocks[6], { kind: 'paragraph', runs: [{ kind: 'text', text: 'line two' }] });
  });

  it('drops images when the setting is off', () => {
    const layout = layoutDocument(
      [
        layoutBlock({ id: 'i', type: 'image', imagePath: 'images/pic.jpg', text: 'Figure' }),
        layoutBlock({
          id: 'tb',
          type: 'table',
          imagePath: 'images/scan.jpg',
          html: '<table><tr><th>x</th></tr></table>',
        }),
      ],
      1,
    );
    const blocks = layoutToDocumentBlocks(layout, { includeImages: false });
    assert.deepEqual(blocks[0], { kind: 'paragraph', runs: [{ kind: 'text', text: 'Figure' }] });
    assert.deepEqual(blocks[1], { kind: 'table', headers: ['x'], rows: [] });
  });
});

describe('paginated doc bridge: document round trip', () => {
  it('markdown → document → markdown → blocks keeps the block structure', () => {
    const markdown = [
      '# Heading',
      '',
      'Paragraph with **bold**, *em*, `code`, ~~strike~~, and [a link](https://example.com).',
      '',
      PAGE_BREAK_MARKER,
      '',
      '- one',
      '- two',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```',
      'let code = true;',
      '```',
      '',
      '![fig](images/fig.png)',
    ].join('\n');

    const { first, second, serialized } = roundTrip(markdown);
    assert.deepEqual(second, first);
    // The serialized markdown keeps the page marker and the image reference.
    assert.ok(serialized.includes(PAGE_BREAK_MARKER));
    assert.ok(serialized.includes('![fig](images/fig.png)'));
    assert.ok(!serialized.includes('data:'));
  });

  it('escapes literal characters so they do not re-parse as markdown', () => {
    const { second } = roundTrip('5 * 3 and a_b and [brackets] and <tags>');
    assert.deepEqual(second[0], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: '5 * 3 and a_b and [brackets] and <tags>' }],
    });
  });

  it('serializes edited documents with images keeping their asset paths', () => {
    const first = markdownToDocumentBlocks('![fig](images/fig.png)');
    const dataUrls = new Map([['images/fig.png', 'data:image/png;base64,AAAA']]);
    const document = buildDocumentFromBlocks(schema, first, dataUrls);
    const markdown = serializeDocumentToMarkdown(document);
    assert.equal(markdown.trim(), '![fig](images/fig.png)');
    const imageNode = document.firstChild;
    assert.equal(imageNode?.type.name, 'image');
    assert.equal(imageNode?.attrs.src, 'data:image/png;base64,AAAA');
    assert.equal(imageNode?.attrs.name, 'images/fig.png');
  });

  it('degrades missing image assets to alt text instead of broken nodes', () => {
    const first = markdownToDocumentBlocks('![fig](images/missing.png)');
    const document = buildDocumentFromBlocks(schema, first, new Map());
    const markdown = serializeDocumentToMarkdown(document);
    assert.equal(markdown.trim(), 'fig');
  });

  it('builds a valid single-block document from an empty source', () => {
    const document = buildDocumentFromBlocks(schema, markdownToDocumentBlocks(''));
    assert.equal(document.childCount, 1);
    assert.equal(document.firstChild?.type.name, 'paragraph');
  });

  it('counts pages from explicit page breaks', () => {
    const single = buildDocumentFromBlocks(schema, markdownToDocumentBlocks('only page'));
    assert.equal(countDocumentPages(single), 1);

    const paged = buildDocumentFromBlocks(
      schema,
      markdownToDocumentBlocks(
        `one\n\n${PAGE_BREAK_MARKER}\n\ntwo\n\n${PAGE_BREAK_MARKER}\n\nthree`,
      ),
    );
    assert.equal(countDocumentPages(paged), 3);

    const empty = buildDocumentFromBlocks(schema, []);
    assert.equal(countDocumentPages(empty), 1);
  });

  it('serializes nested lists created in the editor without losing text', () => {
    const paragraph = (text: string) =>
      schema.nodes.paragraph.create(null, text ? [schema.text(text)] : []);
    const nested = schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create(null, [paragraph('nested')]),
    ]);
    const outer = schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create(null, [paragraph('one'), nested]),
      schema.nodes.list_item.create(null, [paragraph('two')]),
    ]);
    const document = schema.nodes.doc.create(null, [outer]);

    const markdown = serializeDocumentToMarkdown(document);
    assert.equal(markdown.trim(), ['- one', '  - nested', '- two'].join('\n'));

    // Re-parsing flattens the nesting (matching the Text view) but keeps all
    // the item text.
    const reparsed = markdownToDocumentBlocks(markdown);
    assert.deepEqual(reparsed[0], {
      kind: 'list',
      ordered: false,
      items: [
        [{ kind: 'text', text: 'one' }],
        [{ kind: 'text', text: 'nested' }],
        [{ kind: 'text', text: 'two' }],
      ],
    });
  });
});

describe('paginated doc bridge: source resolution', () => {
  it('prefers a dirty draft, then markers, then layout, then plain markdown', () => {
    assert.deepEqual(resolvePaginatedDocSource('saved', 'draft', true), {
      source: 'draft',
      markdown: 'draft',
    });
    const withMarkers = `page one\n${PAGE_BREAK_MARKER}\npage two`;
    assert.deepEqual(resolvePaginatedDocSource(withMarkers, withMarkers, true), {
      source: 'markdown',
      markdown: withMarkers,
    });
    assert.deepEqual(resolvePaginatedDocSource('plain', 'plain', true), {
      source: 'layout',
      markdown: 'plain',
    });
    assert.deepEqual(resolvePaginatedDocSource('plain', 'plain', false), {
      source: 'markdown',
      markdown: 'plain',
    });
  });
});
