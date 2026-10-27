import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBegoniaSchema } from '@datalking/begonia-document-model';
import {
  PAGE_BREAK_MARKER,
  collectImageAssetPaths,
  countPageBreaks,
  markdownContainsPageBreakMarkers,
  resolveTextPagesSource,
  type DocumentBlock,
  type InlineRun,
  type TextRun,
} from '../client/ai-text/viewers/text-pages/document-input.ts';
import { markdownToDocumentBlocks } from '../client/ai-text/viewers/text-pages/markdown-to-document.ts';
import { layoutToDocumentBlocks } from '../client/ai-text/viewers/text-pages/layout-to-document.ts';
import {
  buildDocument,
  buildDocumentFromBlocks,
  countDocumentPages,
} from '../client/ai-text/viewers/text-pages/build-document.ts';
import { serializeDocumentToMarkdown } from '../client/ai-text/viewers/text-pages/document-to-markdown.ts';
import {
  findSourceIdAtPosition,
  mapSourceRanges,
  readBodyCaretPosition,
  resolveCaretSourceBlock,
  type SourceRange,
  type TransactionMappingLike,
} from '../client/ai-text/viewers/text-pages/selection-source.ts';
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

describe('text pages bridge: markdown → blocks', () => {
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

describe('text pages bridge: layout → blocks', () => {
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
      sourceId: 'a',
    });
    assert.deepEqual(blocks[1], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'first page body' }],
      sourceId: 'b',
    });
    assert.deepEqual(blocks[2], { kind: 'page_break' });
    assert.deepEqual(blocks[3], { kind: 'paragraph', runs: [] });
    assert.deepEqual(blocks[4], { kind: 'page_break' });
    assert.deepEqual(blocks[5], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'third page body' }],
      sourceId: 'c',
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
      sourceId: 't',
    });
    assert.deepEqual(blocks[1], { kind: 'code_block', text: 'print(1)', sourceId: 'c' });
    assert.deepEqual(blocks[2], {
      kind: 'image',
      alt: 'Figure',
      assetPath: 'images/pic.jpg',
      sourceId: 'i',
    });
    assert.deepEqual(blocks[3], {
      kind: 'table',
      headers: ['x'],
      rows: [['1']],
      sourceId: 'tb',
    });
    assert.deepEqual(blocks[4], {
      kind: 'image',
      alt: 'Scanned',
      assetPath: 'images/scan.jpg',
      sourceId: 'sc',
    });
    // Multi-line text becomes one paragraph per line.
    assert.deepEqual(blocks[5], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'line one' }],
      sourceId: 'm',
    });
    assert.deepEqual(blocks[6], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'line two' }],
      sourceId: 'm',
    });
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
    assert.deepEqual(blocks[0], {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'Figure' }],
      sourceId: 'i',
    });
    assert.deepEqual(blocks[1], { kind: 'table', headers: ['x'], rows: [], sourceId: 'tb' });
  });
});

describe('text pages bridge: layout source ranges', () => {
  const text = (value: string): TextRun => ({ kind: 'text', text: value });

  it('reports one document span per layout-derived node, whatever its kind', () => {
    const sourceIds = ['t', 'p', 'l', 'tb', 'q', 'c', 'i'];
    const blocks: DocumentBlock[] = [
      { kind: 'heading', level: 2, runs: [text('Section')], sourceId: 't' },
      { kind: 'paragraph', runs: [text('body')], sourceId: 'p' },
      { kind: 'list', ordered: false, items: [[text('one')], [text('two')]], sourceId: 'l' },
      { kind: 'table', headers: ['x'], rows: [['1']], sourceId: 'tb' },
      { kind: 'blockquote', runs: [text('aside')], sourceId: 'q' },
      { kind: 'code_block', text: 'print(1)', sourceId: 'c' },
      { kind: 'image', alt: 'Fig', assetPath: 'images/missing.jpg', sourceId: 'i' },
    ];
    const { doc, sourceRanges } = buildDocument(schema, blocks);

    // Every layout-derived block yields one span, contiguous from the root.
    // Code blocks and images have no writable identity attr in the schema,
    // which is why the span — not a node attr — is the anchor.
    const spans: { from: number; to: number }[] = [];
    let offset = 0;
    doc.forEach((node) => {
      spans.push({ from: offset, to: offset + node.nodeSize });
      offset += node.nodeSize;
    });
    assert.deepEqual(
      sourceRanges,
      spans.map((span, index) => ({ ...span, sourceId: sourceIds[index] })),
    );
    // No ids are stamped into the document itself.
    assert.equal(doc.child(0).attrs.paraId, null);
    assert.equal(doc.child(1).attrs.paraId, null);
  });

  it('gives every node derived from one block its own span', () => {
    // A multi-line extracted block becomes several paragraphs; each caret
    // must map back to the same layout block.
    const { sourceRanges } = buildDocument(schema, [
      { kind: 'paragraph', runs: [text('line one')], sourceId: 'p1-b0' },
      { kind: 'paragraph', runs: [text('line two')], sourceId: 'p1-b0' },
    ]);
    assert.deepEqual(
      sourceRanges.map((range) => range.sourceId),
      ['p1-b0', 'p1-b0'],
    );
    assert.ok(sourceRanges[0] && sourceRanges[1]);
    assert.notEqual(sourceRanges[0].from, sourceRanges[1].from);
  });

  it('reads the body caret position from the selection snapshot', () => {
    const snapshot = (offset: number, storyType = 'body') => ({
      range: { range: { head: { offset, story: { storyType } } } },
    });
    assert.equal(readBodyCaretPosition(snapshot(1)), 1);
    assert.equal(readBodyCaretPosition(snapshot(12)), 12);
    assert.equal(readBodyCaretPosition(snapshot(3, 'header')), null);
    assert.equal(readBodyCaretPosition({ range: { range: { head: { offset: 2 } } } }), 2);
    assert.equal(readBodyCaretPosition({ range: { range: {} } }), null);
    assert.equal(readBodyCaretPosition(null), null);
  });

  it('finds the span covering a position, preferring the following block', () => {
    const ranges: SourceRange[] = [
      { from: 0, to: 7, sourceId: 'a' },
      { from: 7, to: 13, sourceId: 'b' },
    ];
    assert.equal(findSourceIdAtPosition(ranges, 0), 'a');
    assert.equal(findSourceIdAtPosition(ranges, 6), 'a');
    // A shared boundary belongs to the block that starts there.
    assert.equal(findSourceIdAtPosition(ranges, 7), 'b');
    assert.equal(findSourceIdAtPosition(ranges, 13), 'b');
    assert.equal(findSourceIdAtPosition(ranges, 14), null);
    assert.equal(findSourceIdAtPosition([], 1), null);
    assert.equal(findSourceIdAtPosition(ranges, 1.5), null);
  });

  it('resolves caret positions to layout blocks, code blocks included', () => {
    // Top-level spans (position → node): heading "Guide" [0,7], paragraph
    // "body" [7,13], code_block "print(1)" [13,23], paragraph "user-added"
    // [23,35], paragraph "unanchored" [35,47].
    const { doc, sourceRanges } = buildDocument(schema, [
      { kind: 'heading', level: 1, runs: [text('Guide')], sourceId: 'p1-b0' },
      { kind: 'paragraph', runs: [text('body')], sourceId: 'p1-b1' },
      { kind: 'code_block', text: 'print(1)', sourceId: 'p1-b2' },
      { kind: 'paragraph', runs: [text('user-added')], sourceId: 'p2-b0' },
      { kind: 'paragraph', runs: [text('unanchored')] },
    ]);
    assert.equal(doc.childCount, 5);
    const layout = layoutDocument(
      [
        layoutBlock({ id: 'p1-b0', pageNumber: 1, type: 'doc_title', text: 'Guide' }),
        layoutBlock({ id: 'p1-b1', pageNumber: 1, type: 'text', text: 'body' }),
        layoutBlock({ id: 'p1-b2', pageNumber: 1, type: 'code', text: 'print(1)' }),
        layoutBlock({ id: 'p2-b0', pageNumber: 2, type: 'text', text: 'user-added' }),
      ],
      2,
    );

    assert.equal(resolveCaretSourceBlock(sourceRanges, 0, layout)?.id, 'p1-b0');
    assert.equal(resolveCaretSourceBlock(sourceRanges, 1, layout)?.id, 'p1-b0');
    assert.equal(resolveCaretSourceBlock(sourceRanges, 8, layout)?.id, 'p1-b1');
    // Code blocks carry no id attr; the span still maps their carets.
    assert.equal(resolveCaretSourceBlock(sourceRanges, 14, layout)?.id, 'p1-b2');
    assert.equal(resolveCaretSourceBlock(sourceRanges, 20, layout)?.id, 'p1-b2');
    assert.equal(resolveCaretSourceBlock(sourceRanges, 24, layout)?.id, 'p2-b0');
    // User-created nodes and positions past the document resolve to null.
    assert.equal(resolveCaretSourceBlock(sourceRanges, 36, layout), null);
    assert.equal(resolveCaretSourceBlock(sourceRanges, 48, layout), null);
    assert.equal(resolveCaretSourceBlock(sourceRanges, -1, layout), null);
    assert.equal(resolveCaretSourceBlock(sourceRanges, 1, null), null);
    // An anchor whose block is missing from the layout resolves to null.
    const partial = layoutDocument([layoutBlock({ id: 'p1-b0' })], 1);
    assert.equal(resolveCaretSourceBlock(sourceRanges, 8, partial), null);
    // Documents rebuilt from Markdown have no spans at all.
    assert.deepEqual(buildDocument(schema, markdownToDocumentBlocks('# Title')).sourceRanges, []);
  });

  it('keeps source ranges current through edit transactions', () => {
    const insertion = (at: number, size: number): TransactionMappingLike => ({
      mapResult(position, assoc = 1) {
        const after = position > at || (position === at && assoc > 0);
        return { pos: after ? position + size : position, deleted: false };
      },
    });
    const ranges: SourceRange[] = [
      { from: 0, to: 7, sourceId: 'a' },
      { from: 7, to: 13, sourceId: 'b' },
    ];
    // Text inserted inside the first block stretches its span and shifts the
    // following one; neither mapping loses the block association.
    assert.deepEqual(mapSourceRanges(ranges, insertion(3, 5)), [
      { from: 0, to: 12, sourceId: 'a' },
      { from: 12, to: 18, sourceId: 'b' },
    ]);

    // A span whose end lands inside a deleted range is dropped instead of
    // drifting onto whichever block follows.
    const deletion: TransactionMappingLike = {
      mapResult: (position) => ({ pos: position, deleted: position > 7 && position <= 13 }),
    };
    assert.deepEqual(mapSourceRanges(ranges, deletion), [{ from: 0, to: 7, sourceId: 'a' }]);
  });

  it('does not leak editor metadata into the serialized markdown', () => {
    const layout = layoutDocument([layoutBlock({ id: 'p1-b1', type: 'text', text: 'body' })], 1);
    const { doc } = buildDocument(schema, layoutToDocumentBlocks(layout));
    assert.equal(serializeDocumentToMarkdown(doc).trim(), 'body');
  });
});

describe('text pages bridge: document round trip', () => {
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

describe('text pages bridge: source resolution', () => {
  it('prefers a dirty draft, then markers, then layout, then plain markdown', () => {
    assert.deepEqual(resolveTextPagesSource('saved', 'draft', true), {
      source: 'draft',
      markdown: 'draft',
    });
    const withMarkers = `page one\n${PAGE_BREAK_MARKER}\npage two`;
    assert.deepEqual(resolveTextPagesSource(withMarkers, withMarkers, true), {
      source: 'markdown',
      markdown: withMarkers,
    });
    assert.deepEqual(resolveTextPagesSource('plain', 'plain', true), {
      source: 'layout',
      markdown: 'plain',
    });
    assert.deepEqual(resolveTextPagesSource('plain', 'plain', false), {
      source: 'markdown',
      markdown: 'plain',
    });
  });
});
