import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_BREAK_MARKER,
  resolveTextPagesSource,
  type DocumentBlock,
} from '../client/ai-text/viewers/text-pages/document-input.ts';
import {
  attachLayoutSourceAnchors,
  textSimilarity,
} from '../client/ai-text/viewers/text-pages/layout-anchor.ts';
import {
  hashAiTextContent,
  isContentEditedSinceExtraction,
} from '../server/ai-text/content-hash.ts';
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

function paragraph(text: string): DocumentBlock {
  return { kind: 'paragraph', runs: [{ kind: 'text', text }] };
}

describe('text pages anchors: source resolution with saved edits', () => {
  it('prefers saved Markdown over the layout even without page-break markers', () => {
    // Single-page PDFs produce no marker, so the fingerprint is the only
    // signal that the stored Markdown is newer than the extraction layout.
    assert.deepEqual(resolveTextPagesSource('plain', 'plain', true, true), {
      source: 'markdown',
      markdown: 'plain',
    });
    // Untouched extraction: the layout still gives the 1:1 page mapping.
    assert.deepEqual(resolveTextPagesSource('plain', 'plain', true, false), {
      source: 'layout',
      markdown: 'plain',
    });
    // Unknown fingerprint (older versions) keeps the legacy behavior.
    assert.deepEqual(resolveTextPagesSource('plain', 'plain', true, null), {
      source: 'layout',
      markdown: 'plain',
    });
    // A dirty draft always wins.
    assert.deepEqual(resolveTextPagesSource('plain', 'draft', true, true), {
      source: 'draft',
      markdown: 'draft',
    });
  });
});

describe('text pages anchors: textSimilarity', () => {
  it('scores identical text 1 and unrelated text near 0', () => {
    assert.equal(textSimilarity('Hello World', 'hello   world!'), 1);
    assert.ok(textSimilarity('Introduction to JavaScript', 'Netscape Navigator') < 0.2);
    assert.equal(textSimilarity('', 'anything'), 0);
  });

  it('tolerates word-level edits and reordering', () => {
    const original = 'BROWSER ECMASCRIPT COMPLIANCE Netscape Navigator Edition 1';
    const edited = 'BROWSER COMPLIANCE ECMASCRIPT Netscape Navigator Edition 1';
    assert.ok(textSimilarity(original, edited) > 0.9);
  });

  it('compares CJK text through character bigrams', () => {
    // Without bigrams a whole Chinese paragraph is one whitespace token, so a
    // single edited character would score the block as unrelated.
    const original = '贾府上的焦大，也不爱林妹妹的。';
    const edited = '贾府上的焦大也不爱林妹妹';
    assert.ok(textSimilarity(original, edited) > 0.9);
    assert.ok(textSimilarity(original, '鲁迅论红楼梦研究资料选辑') < 0.4);
  });
});

describe('text pages anchors: attachLayoutSourceAnchors', () => {
  it('anchors Markdown paragraphs to their layout sections despite page furniture', () => {
    const layout = layoutDocument(
      [
        layoutBlock({ id: 'p1-b0', type: 'page_number', text: '6' }),
        layoutBlock({ id: 'p1-b1', type: 'header', text: 'CHAPTER 1 WHAT IS JAVASCRIPT?' }),
        layoutBlock({ id: 'p1-b2', text: 'Introduction to JavaScript' }),
        layoutBlock({ id: 'p1-b3', text: 'Netscape updated its JavaScript implementation' }),
      ],
      1,
    );
    // MinerU's Markdown omits the page furniture, so the first paragraph
    // matches the third layout block after skipping two.
    const blocks = [
      paragraph('Introduction to JavaScript'),
      paragraph('Netscape updated its JavaScript implementation'),
    ];
    const anchored = attachLayoutSourceAnchors(blocks, layout);
    assert.equal(anchored[0]?.sourceId, 'p1-b2');
    assert.equal(anchored[1]?.sourceId, 'p1-b3');
    // Input is not mutated.
    assert.equal(blocks[0]?.sourceId, undefined);
  });

  it('keeps anchors through local edits and leaves user-written text unanchored', () => {
    const layout = layoutDocument(
      [
        layoutBlock({
          id: 'p1-b0',
          text: 'Netscape opted to update its JavaScript implementation',
        }),
        layoutBlock({ id: 'p1-b1', text: 'The table lists ECMAScript support in web browsers' }),
      ],
      1,
    );
    const blocks = [
      paragraph('Netscape updated its JavaScript implementation'),
      paragraph('A brand new note the user typed'),
      paragraph('Something else entirely, unrelated to the source'),
      paragraph('The table lists ECMAScript support in web browsers'),
    ];
    const anchored = attachLayoutSourceAnchors(blocks, layout);
    // A small edit keeps a high token overlap and stays anchored.
    assert.equal(anchored[0]?.sourceId, 'p1-b0');
    // Text that does not exist in the PDF gets no PDF section.
    assert.equal(anchored[1]?.sourceId, undefined);
    assert.equal(anchored[2]?.sourceId, undefined);
    // The following untouched block still matches after skipping ahead.
    assert.equal(anchored[3]?.sourceId, 'p1-b1');
  });

  it('maps page 2 blocks to page 2 layout blocks only', () => {
    const layout = layoutDocument(
      [
        layoutBlock({ id: 'p1-b0', pageNumber: 1, text: 'First page paragraph' }),
        layoutBlock({ id: 'p2-b0', pageNumber: 2, text: 'Second page paragraph' }),
      ],
      2,
    );
    const blocks: DocumentBlock[] = [
      paragraph('First page paragraph'),
      { kind: 'page_break' },
      paragraph('Second page paragraph'),
    ];
    const anchored = attachLayoutSourceAnchors(blocks, layout);
    assert.equal(anchored[0]?.sourceId, 'p1-b0');
    assert.equal(anchored[1]?.kind, 'page_break');
    assert.equal(anchored[2]?.sourceId, 'p2-b0');
  });

  it('keeps section anchors when the pagination diverged from the layout', () => {
    const layout = layoutDocument(
      [
        layoutBlock({
          id: 'p1-b0',
          pageNumber: 1,
          text: 'Netscape updated its JavaScript implementation',
        }),
        layoutBlock({
          id: 'p2-b0',
          pageNumber: 2,
          text: 'BROWSER ECMASCRIPT COMPLIANCE table',
        }),
      ],
      2,
    );
    // The user added page breaks (or edited the file outside the app): page N
    // of the document no longer maps to page N of the PDF, but section ids are
    // still reliable in document order.
    const blocks: DocumentBlock[] = [
      paragraph('Netscape updated its JavaScript implementation'),
      { kind: 'page_break' },
      paragraph('BROWSER ECMASCRIPT COMPLIANCE table'),
      { kind: 'page_break' },
      paragraph('A paragraph the user appended after the save'),
    ];
    const anchored = attachLayoutSourceAnchors(blocks, layout);
    assert.equal(anchored[0]?.sourceId, 'p1-b0');
    assert.equal(anchored[1]?.kind, 'page_break');
    assert.equal(anchored[2]?.sourceId, 'p2-b0');
    assert.equal(anchored[3]?.kind, 'page_break');
    // Appended text has no PDF counterpart and stays unanchored.
    assert.equal(anchored[4]?.sourceId, undefined);
  });

  it('anchors edited Chinese paragraphs to their layout section', () => {
    const layout = layoutDocument(
      [layoutBlock({ id: 'p1-b0', text: '贾府上的焦大，也不爱林妹妹的。' })],
      1,
    );
    const anchored = attachLayoutSourceAnchors([paragraph('贾府上的焦大也不爱林妹妹')], layout);
    assert.equal(anchored[0]?.sourceId, 'p1-b0');
  });

  it('anchors tables and images by their text content', () => {
    const layout = layoutDocument(
      [
        layoutBlock({
          id: 'p1-b0',
          type: 'table',
          text: 'BROWSER ECMASCRIPT COMPLIANCE Netscape Navigator 2',
        }),
        layoutBlock({ id: 'p1-b1', type: 'image', text: 'A scanned figure of the browser chart' }),
      ],
      1,
    );
    const blocks: DocumentBlock[] = [
      {
        kind: 'table',
        headers: ['BROWSER', 'ECMASCRIPT COMPLIANCE'],
        rows: [['Netscape Navigator 2']],
      },
      { kind: 'image', alt: 'A scanned figure of the browser chart', assetPath: 'images/f.png' },
    ];
    const anchored = attachLayoutSourceAnchors(blocks, layout);
    assert.equal(anchored[0]?.sourceId, 'p1-b0');
    assert.equal(anchored[1]?.sourceId, 'p1-b1');
  });

  it('returns the page-break structure untouched for an empty layout', () => {
    const blocks = [paragraph('one'), { kind: 'page_break' }, paragraph('two')] as DocumentBlock[];
    assert.deepEqual(attachLayoutSourceAnchors(blocks, layoutDocument([], 0)), blocks);
  });
});

describe('ai text content hash', () => {
  it('fingerprints the extraction output and detects later edits', () => {
    const extracted = '# Title\n\nBody';
    const hash = hashAiTextContent(extracted);
    assert.equal(hash, hashAiTextContent('# Title\n\nBody'));
    assert.equal(isContentEditedSinceExtraction(hash, '# Title\n\nBody'), false);
    assert.equal(isContentEditedSinceExtraction(hash, '# Title\n\nBody!'), true);
    // Older versions carry no fingerprint; the caller falls back to legacy rules.
    assert.equal(isContentEditedSinceExtraction(undefined, 'anything'), null);
    assert.equal(isContentEditedSinceExtraction(hash, null), null);
  });

  it('matches the saved Markdown across a page-break round trip', () => {
    const markdown = ['page one', PAGE_BREAK_MARKER, 'page two'].join('\n');
    assert.equal(isContentEditedSinceExtraction(hashAiTextContent(markdown), markdown), false);
  });
});
