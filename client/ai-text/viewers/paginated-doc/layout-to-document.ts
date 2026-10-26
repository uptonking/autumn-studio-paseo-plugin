/**
 * Maps the extracted AI Text layout blocks into the Paginated Text Doc block
 * tree, one page per PDF page: blocks are grouped by `pageNumber`, explicit
 * page breaks keep page N of the paginated document aligned with page N of
 * the original PDF, and empty pages are preserved as blank pages.
 */

import type { AiTextLayoutBlock, AiTextLayoutDocument } from '../../../../shared/ai-text/layout.ts';
import { sanitizeAssetRelativePath } from '../../../../shared/asset-paths.ts';
import { parseHtmlTableRows } from '../../../viewers/markdown-blocks.ts';
import type { DocumentBlock, ParagraphBlock, TextRun } from './document-input.ts';
import { textToParagraphBlocks } from './document-input.ts';

export interface LayoutToDocumentOptions {
  /** Render image/chart blocks (and scanned table crops) from version assets. */
  includeImages?: boolean;
}

function textRun(text: string): TextRun {
  return { kind: 'text', text };
}

function clampHeadingLevel(level: number | undefined, fallback: number): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return fallback;
  return Math.min(6, Math.max(1, Math.round(level)));
}

function imageBlockFromPath(rawPath: string | undefined, alt: string): DocumentBlock | null {
  const assetPath = rawPath ? sanitizeAssetRelativePath(rawPath) : null;
  if (!assetPath) return null;
  return { kind: 'image', alt, assetPath };
}

/** Maps one extracted block onto zero or more document blocks. */
function layoutBlockToDocumentBlocks(
  block: AiTextLayoutBlock,
  options: LayoutToDocumentOptions,
): DocumentBlock[] {
  const includeImages = options.includeImages ?? true;

  switch (block.type) {
    case 'doc_title':
      return [{ kind: 'heading', level: 1, runs: [textRun(block.text)] }];
    case 'paragraph_title':
      return [
        { kind: 'heading', level: clampHeadingLevel(block.level, 2), runs: [textRun(block.text)] },
      ];
    case 'code':
      return block.text.trim()
        ? [{ kind: 'code_block', text: block.text.replace(/\r\n/g, '\n') }]
        : [];
    case 'image':
    case 'chart': {
      if (!includeImages) {
        return textToParagraphBlocks(block.text);
      }
      const image = imageBlockFromPath(block.imagePath, block.text || 'Image');
      return image ? [image] : textToParagraphBlocks(block.text);
    }
    case 'table': {
      if (includeImages) {
        const crop = imageBlockFromPath(block.imagePath, block.text || 'Table');
        if (crop) return [crop];
      }
      if (block.html) {
        const parsed = parseHtmlTableRows(block.html);
        if (parsed) {
          return [{ kind: 'table', headers: parsed.headers, rows: parsed.rows }];
        }
      }
      return textToParagraphBlocks(block.text);
    }
    default:
      return textToParagraphBlocks(block.text);
  }
}

/** Groups blocks by page, 1..pageCount, in original page order. */
export function groupLayoutBlocksByPage(
  layout: AiTextLayoutDocument,
): Map<number, AiTextLayoutBlock[]> {
  const grouped = new Map<number, AiTextLayoutBlock[]>();
  let maxPage = Math.max(0, layout.pageCount);
  for (const block of layout.blocks) {
    maxPage = Math.max(maxPage, block.pageNumber);
    const list = grouped.get(block.pageNumber);
    if (list) list.push(block);
    else grouped.set(block.pageNumber, [block]);
  }
  const pages = new Map<number, AiTextLayoutBlock[]>();
  for (let pageNumber = 1; pageNumber <= maxPage; pageNumber += 1) {
    pages.set(pageNumber, grouped.get(pageNumber) ?? []);
  }
  return pages;
}

export function layoutToDocumentBlocks(
  layout: AiTextLayoutDocument,
  options: LayoutToDocumentOptions = {},
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const pages = groupLayoutBlocksByPage(layout);

  for (const [pageNumber, pageBlocks] of pages) {
    if (pageNumber > 1) {
      blocks.push({ kind: 'page_break' });
    }
    const pageContent: DocumentBlock[] = [];
    for (const block of pageBlocks) {
      pageContent.push(...layoutBlockToDocumentBlocks(block, options));
    }
    // A page with no renderable content still needs a block so the explicit
    // page break keeps this page separate from its neighbours.
    if (pageContent.length === 0) {
      const emptyParagraph: ParagraphBlock = { kind: 'paragraph', runs: [] };
      blocks.push(emptyParagraph);
    } else {
      blocks.push(...pageContent);
    }
  }

  if (blocks.length === 0) {
    return [{ kind: 'paragraph', runs: [] }];
  }
  return blocks;
}
