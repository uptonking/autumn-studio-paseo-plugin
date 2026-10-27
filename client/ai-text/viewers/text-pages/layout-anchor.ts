/**
 * Re-attaches layout source ids to a document built from edited Markdown.
 *
 * A document loaded from saved Markdown has no `sourceId`s, so the caret
 * cannot highlight the matching PDF section. The extraction layout still
 * describes the original sections, so each Markdown block is matched against
 * the layout blocks of the same page and adopts the id of its best match.
 * Matching is monotonic (a page's blocks never jump backwards), tolerant of
 * small edits (token overlap), and conservative: a block with no sufficiently
 * similar counterpart — text the user wrote — stays unanchored.
 *
 * When the Markdown carries exactly as many pages as the layout, matching
 * restarts per page so page N can only adopt page N's sections. If the
 * pagination diverged (a marker was added, removed, or the file was edited
 * outside the app), matching continues across the flattened layout instead:
 * the section ids remain correct even when page boundaries no longer line up,
 * and an unresolvable block simply stays unanchored.
 */

import type { AiTextLayoutBlock, AiTextLayoutDocument } from '../../../../shared/ai-text/layout.ts';
import { groupLayoutBlocksByPage } from './layout-to-document.ts';
import type { DocumentBlock } from './document-input.ts';

/** How many layout blocks one Markdown block may skip when matching. */
const LOOKAHEAD = 4;

/** Dice coefficient floor for accepting a match. */
const MIN_SIMILARITY = 0.62;

/** Text a document block contributes to the comparison. */
function documentBlockText(block: DocumentBlock): string {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
    case 'blockquote':
      return block.runs.map((run) => (run.kind === 'text' ? run.text : run.alt)).join(' ');
    case 'list':
      return block.items
        .map((item) => item.map((run) => (run.kind === 'text' ? run.text : run.alt)).join(' '))
        .join(' ');
    case 'table':
      return [...block.headers, ...block.rows.flat()].join(' ');
    case 'code_block':
      return block.text;
    case 'image':
      return block.alt;
    default:
      // Page breaks and horizontal rules carry no comparable text.
      return '';
  }
}

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .flatMap(tokenizeChunk)
    .filter((token) => token.length > 0);
}

/** Scripts written without spaces between words (Han, kana, Hangul). */
const UNSPACED_SCRIPT_RUN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

/**
 * Splits one whitespace-delimited chunk into comparison tokens. Latin text is
 * already word-segmented; an unspaced run is split into character bigrams so
 * Dice overlap still reflects how much of a Chinese/Japanese/Korean section
 * survived an edit (as one long token, a single changed character would score
 * the whole block as unrelated).
 */
function tokenizeChunk(chunk: string): string[] {
  const tokens: string[] = [];
  let lastIndex = 0;
  // matchAll clones the regex, so the shared pattern keeps no state.
  for (const match of chunk.matchAll(UNSPACED_SCRIPT_RUN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push(chunk.slice(lastIndex, index));
    const run = match[0];
    if (run.length === 1) {
      tokens.push(run);
    } else {
      for (let offset = 0; offset + 1 < run.length; offset += 1) {
        tokens.push(run.slice(offset, offset + 2));
      }
    }
    lastIndex = index + run.length;
  }
  if (lastIndex < chunk.length) tokens.push(chunk.slice(lastIndex));
  return tokens;
}

/**
 * Token-multiset Dice coefficient in `[0, 1]`: order-insensitive, so a table
 * whose Markdown cells and layout text flatten in different order still
 * matches, while a rewritten paragraph scores low.
 */
export function textSimilarity(left: string, right: string): number {
  const leftTokens = normalizeTokens(left);
  const rightTokens = normalizeTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of leftTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let overlap = 0;
  for (const token of rightTokens) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      counts.set(token, remaining - 1);
    }
  }
  return (2 * overlap) / (leftTokens.length + rightTokens.length);
}

/** Best match for `text` among `layoutBlocks` from `cursor` up to the window. */
function findLayoutMatch(
  text: string,
  layoutBlocks: readonly AiTextLayoutBlock[],
  cursor: number,
): { index: number; score: number } | null {
  const limit = Math.min(layoutBlocks.length, cursor + 1 + LOOKAHEAD);
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = cursor; index < limit; index += 1) {
    const candidate = layoutBlocks[index];
    if (!candidate) continue;
    const score = textSimilarity(text, candidate.text);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestScore < MIN_SIMILARITY) return null;
  return { index: bestIndex, score: bestScore };
}

function anchorBlocks(
  blocks: readonly DocumentBlock[],
  layoutBlocks: readonly AiTextLayoutBlock[],
): DocumentBlock[] {
  let cursor = 0;
  return blocks.map((block) => {
    const text = documentBlockText(block);
    if (text.length === 0) return block;
    const match = findLayoutMatch(text, layoutBlocks, cursor);
    if (!match) return block;
    const layoutBlock = layoutBlocks[match.index];
    if (!layoutBlock) return block;
    // The cursor stays on the matched block: one layout section can expand
    // into several paragraphs, and all of them belong to it.
    cursor = match.index;
    return { ...block, sourceId: layoutBlock.id };
  });
}

/** Splits a document block list into per-page groups, dropping the markers. */
function splitPages(blocks: readonly DocumentBlock[]): DocumentBlock[][] {
  const pages: DocumentBlock[][] = [[]];
  for (const block of blocks) {
    if (block.kind === 'page_break') {
      pages.push([]);
      continue;
    }
    pages[pages.length - 1]?.push(block);
  }
  return pages;
}

/**
 * Returns the blocks with layout ids attached wherever a block still
 * corresponds to an extracted section. The input is not mutated.
 */
export function attachLayoutSourceAnchors(
  blocks: readonly DocumentBlock[],
  layout: AiTextLayoutDocument,
): DocumentBlock[] {
  if (layout.blocks.length === 0) return [...blocks];
  const layoutPages = groupLayoutBlocksByPage(layout);
  const documentPages = splitPages(blocks);
  // Page boundaries line up: anchor page by page so page N can only adopt the
  // sections of PDF page N.
  if (documentPages.length === layoutPages.size) {
    const result: DocumentBlock[] = [];
    documentPages.forEach((pageBlocks, index) => {
      if (index > 0) result.push({ kind: 'page_break' });
      const layoutBlocks = layoutPages.get(index + 1) ?? [];
      result.push(...anchorBlocks(pageBlocks, layoutBlocks));
    });
    return result;
  }

  // Pagination diverged (a marker was added or removed, or the file was edited
  // outside the app). Section ids are still reliable in document order, so
  // match against the flattened layout instead of giving up entirely.
  return anchorBlocks(blocks, [...layoutPages.values()].flat());
}
