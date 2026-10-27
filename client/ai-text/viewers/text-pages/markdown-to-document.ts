/**
 * Parses the AI Text stored Markdown into the Text Pages View block tree.
 *
 * The accepted subset mirrors what the Text viewer renders (see
 * client/viewers/markdown-preview.tsx): headings, one paragraph per line, pipe
 * tables, `<table>` HTML blocks emitted by extraction engines, code fences,
 * horizontal rules, blockquotes, lists, images, and inline bold/italic/strike/
 * code/link marks. `<!-- page-break -->` lines become explicit page breaks so
 * pagination survives a Markdown round trip.
 */

import { sanitizeAssetRelativePath } from '../../../../shared/asset-paths.ts';
import {
  isMarkdownTableSeparator,
  parseHtmlTableRows,
  parseMarkdownTableCells,
  tokenizeInlineMarkdown,
} from '../../../viewers/markdown-blocks.ts';
import type { DocumentBlock, InlineRun, TextRun } from './document-input.ts';
import { isPageBreakMarkerLine } from './document-input.ts';

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const HR_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/;
const IMAGE_ONLY_PATTERN = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const BULLET_ITEM_PATTERN = /^\s*([-*+])\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\s*(\d+)\.\s+(.*)$/;
const CODE_FENCE_PATTERN = /^\s*```/;

function isTextRun(run: InlineRun): run is TextRun {
  return run.kind === 'text';
}

function tokensToRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const token of tokenizeInlineMarkdown(text)) {
    if (token.kind === 'image') {
      const assetPath = sanitizeAssetRelativePath(token.src);
      if (assetPath) {
        runs.push({ kind: 'image', alt: token.alt, assetPath });
        continue;
      }
      runs.push(textRun(token.alt));
      continue;
    }
    switch (token.style) {
      case 'bold-italic':
        runs.push({ ...textRun(token.text), bold: true, italic: true });
        break;
      case 'bold':
        runs.push({ ...textRun(token.text), bold: true });
        break;
      case 'italic':
        runs.push({ ...textRun(token.text), italic: true });
        break;
      case 'strike':
        runs.push({ ...textRun(token.text), strike: true });
        break;
      case 'code':
        runs.push({ ...textRun(token.text), code: true });
        break;
      case 'link':
        runs.push({ ...textRun(token.text), href: token.href });
        break;
      default:
        runs.push(textRun(token.text));
    }
  }
  return runs.length > 0 ? runs : [];
}

function textRun(text: string): TextRun {
  return { kind: 'text', text };
}

function parseTableBlock(
  lines: readonly string[],
  startIndex: number,
): {
  block: DocumentBlock;
  nextIndex: number;
} {
  const headers = parseMarkdownTableCells(lines[startIndex] ?? '');
  let i = startIndex + 2;
  const rows: string[][] = [];
  while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
    rows.push(parseMarkdownTableCells(lines[i] ?? ''));
    i += 1;
  }
  return { block: { kind: 'table', headers, rows }, nextIndex: i };
}

function parseHtmlTableBlock(
  lines: readonly string[],
  startIndex: number,
): {
  block: DocumentBlock | null;
  nextIndex: number;
} {
  const htmlLines: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    htmlLines.push(current);
    i += 1;
    if (/<\/table>/i.test(current)) break;
  }
  const parsed = parseHtmlTableRows(htmlLines.join('\n'));
  return {
    block: parsed ? { kind: 'table', headers: parsed.headers, rows: parsed.rows } : null,
    nextIndex: i,
  };
}

export function markdownToDocumentBlocks(markdown: string): DocumentBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocumentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isPageBreakMarkerLine(line)) {
      blocks.push({ kind: 'page_break' });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const imageOnly = IMAGE_ONLY_PATTERN.exec(line);
    if (imageOnly) {
      const assetPath = sanitizeAssetRelativePath(imageOnly[2] ?? '');
      if (assetPath) {
        blocks.push({ kind: 'image', alt: imageOnly[1] ?? '', assetPath });
        i += 1;
        continue;
      }
    }

    if (CODE_FENCE_PATTERN.test(line)) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !CODE_FENCE_PATTERN.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code_block', text: codeLines.join('\n') });
      continue;
    }

    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1] ?? '')
    ) {
      const { block, nextIndex } = parseTableBlock(lines, i);
      blocks.push(block);
      i = nextIndex;
      continue;
    }

    if (/^\s*<table\b/i.test(line)) {
      const { block, nextIndex } = parseHtmlTableBlock(lines, i);
      if (block) {
        blocks.push(block);
        i = nextIndex;
        continue;
      }
      // Not a recognizable table: fall through to paragraph handling below
      // without consuming the block, so its text is not silently dropped.
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length,
        runs: tokensToRuns(heading[2] ?? '').filter(isTextRun),
      });
      i += 1;
      continue;
    }

    if (HR_PATTERN.test(line.trim())) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'blockquote', runs: tokensToRuns(quoteLines.join(' ')) });
      continue;
    }

    const bullet = BULLET_ITEM_PATTERN.exec(line);
    const ordered = bullet ? null : ORDERED_ITEM_PATTERN.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: InlineRun[][] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const itemMatch = isOrdered
          ? ORDERED_ITEM_PATTERN.exec(current)
          : BULLET_ITEM_PATTERN.exec(current);
        if (!itemMatch) break;
        items.push(tokensToRuns(itemMatch[2] ?? ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    blocks.push({ kind: 'paragraph', runs: tokensToRuns(line) });
    i += 1;
  }

  return blocks;
}
