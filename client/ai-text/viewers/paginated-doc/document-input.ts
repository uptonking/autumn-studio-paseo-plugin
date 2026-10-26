/**
 * Plain-data document tree shared by the Paginated Text Doc sources.
 *
 * Both producers — the stored Markdown (markdown-to-document.ts) and the
 * extracted layout blocks (layout-to-document.ts) — normalize into these
 * blocks. build-document.ts then turns the tree into a Begonia ProseMirror
 * document and document-to-markdown.ts serializes the edited document back
 * into Markdown, so the whole Markdown ↔ paginated document bridge stays
 * pure and unit-testable without an editor.
 */

/** Serialized as a standalone HTML comment line so rendered Markdown hides it. */
export const PAGE_BREAK_MARKER = '<!-- page-break -->';

const PAGE_BREAK_MARKER_PATTERN = /^\s*<!--\s*page-break\s*-->\s*$/;

export function isPageBreakMarkerLine(line: string): boolean {
  return PAGE_BREAK_MARKER_PATTERN.test(line);
}

export function markdownContainsPageBreakMarkers(markdown: string): boolean {
  return markdown.split(/\r?\n/).some(isPageBreakMarkerLine);
}

/** Flat inline run: ProseMirror marks map 1:1 onto the flag set. */
export interface TextRun {
  kind: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string | null;
}

export interface ImageRun {
  kind: 'image';
  alt: string;
  /** Version-relative asset path such as `images/abc.jpg`. */
  assetPath: string;
}

export type InlineRun = TextRun | ImageRun;

export interface HeadingBlock {
  kind: 'heading';
  level: number;
  runs: TextRun[];
}

export interface ParagraphBlock {
  kind: 'paragraph';
  runs: InlineRun[];
}

export interface CodeBlockBlock {
  kind: 'code_block';
  text: string;
}

export interface BlockquoteBlock {
  kind: 'blockquote';
  runs: InlineRun[];
}

export interface ListBlock {
  kind: 'list';
  ordered: boolean;
  /** One entry per item; runs may be empty for a blank item. */
  items: InlineRun[][];
}

export interface TableBlock {
  kind: 'table';
  headers: string[];
  rows: string[][];
}

export interface ImageBlock {
  kind: 'image';
  alt: string;
  /** Version-relative asset path such as `images/abc.jpg`. */
  assetPath: string;
}

export interface HorizontalRuleBlock {
  kind: 'hr';
}

export interface PageBreakBlock {
  kind: 'page_break';
}

export type DocumentBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlockBlock
  | BlockquoteBlock
  | ListBlock
  | TableBlock
  | ImageBlock
  | HorizontalRuleBlock
  | PageBreakBlock;

/** Version-relative asset paths referenced by image blocks and runs. */
export function collectImageAssetPaths(blocks: readonly DocumentBlock[]): string[] {
  const paths = new Set<string>();
  const visitRuns = (runs: readonly InlineRun[]) => {
    for (const run of runs) {
      if (run.kind === 'image' && run.assetPath) paths.add(run.assetPath);
    }
  };
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
      case 'blockquote':
        visitRuns(block.runs);
        break;
      case 'list':
        for (const item of block.items) visitRuns(item);
        break;
      case 'image':
        if (block.assetPath) paths.add(block.assetPath);
        break;
    }
  }
  return [...paths];
}

export function countPageBreaks(blocks: readonly DocumentBlock[]): number {
  return blocks.filter((block) => block.kind === 'page_break').length;
}

function splitParagraphText(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Layout block text becomes one paragraph per non-empty line. */
export function textToParagraphBlocks(text: string): ParagraphBlock[] {
  return splitParagraphText(text).map((line) => ({
    kind: 'paragraph',
    runs: [{ kind: 'text', text: line }],
  }));
}

export interface PaginatedDocSource {
  source: 'draft' | 'markdown' | 'layout';
  markdown: string;
}

/**
 * Chooses the source for the initial paginated document build:
 * 1. a dirty draft (edited in this or another pane) wins over everything,
 * 2. Markdown that already carries page markers keeps its pagination,
 * 3. layout blocks map PDF pages 1:1 onto paginated pages,
 * 4. plain Markdown degrades to a paginated document without page mapping.
 */
export function resolvePaginatedDocSource(
  content: string,
  draftText: string,
  hasLayout: boolean,
): PaginatedDocSource {
  if (draftText !== content) {
    return { source: 'draft', markdown: draftText };
  }
  if (markdownContainsPageBreakMarkers(draftText)) {
    return { source: 'markdown', markdown: draftText };
  }
  if (hasLayout) {
    return { source: 'layout', markdown: draftText };
  }
  return { source: 'markdown', markdown: draftText };
}
