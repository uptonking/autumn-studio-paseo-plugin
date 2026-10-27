/**
 * Maps the editor caret back to the layout block the node under it was
 * derived from.
 *
 * build-document.ts reports one SourceRange per layout-derived top-level
 * node; resolving the caret is a binary search over those ranges. Ranges are
 * used instead of ids stamped on nodes because they cover every block kind
 * (paragraphs, headings, lists, tables, quotes, code blocks, images — several
 * of which have no writable identity attr in the Begonia schema) and cannot
 * collide with Begonia's own block identity. Ranges are kept current through
 * edits by mapping them through each ProseMirror transaction.
 */

import type { AiTextLayoutBlock, AiTextLayoutDocument } from '../../../../shared/ai-text/layout.ts';

/** Structural slice of Begonia's EditorSelectionSnapshot the resolver needs. */
export interface SelectionSnapshotLike {
  range?: {
    range?: {
      head?: {
        /** Root document position of the selection head. */
        offset?: number;
        /** Only the plain body story maps onto layout blocks. */
        story?: { storyType?: unknown };
      };
    };
  };
}

/** Reads the body-story caret position from the selection snapshot, or null. */
export function readBodyCaretPosition(selection: SelectionSnapshotLike | null): number | null {
  const head = selection?.range?.range?.head;
  if (typeof head?.offset !== 'number' || !Number.isInteger(head.offset)) return null;
  if (head.story && head.story.storyType !== 'body') return null;
  return head.offset;
}

/** Root document span of one top-level node derived from a layout block. */
export interface SourceRange {
  from: number;
  to: number;
  sourceId: string;
}

/** Minimal slice of ProseMirror's Mapping needed to keep ranges current. */
export interface TransactionMappingLike {
  mapResult(position: number, assoc?: number): { pos: number; deleted: boolean };
}

/**
 * Maps every range through one transaction. A range whose endpoints were
 * deleted (the block was removed or joined away) is dropped; everything else
 * keeps pointing at the same content after inserted/removed text.
 */
export function mapSourceRanges(
  ranges: readonly SourceRange[],
  mapping: TransactionMappingLike,
): SourceRange[] {
  const mapped: SourceRange[] = [];
  for (const range of ranges) {
    const from = mapping.mapResult(range.from, -1);
    const to = mapping.mapResult(range.to, 1);
    if (from.deleted || to.deleted || to.pos <= from.pos) continue;
    mapped.push({ from: from.pos, to: to.pos, sourceId: range.sourceId });
  }
  return mapped;
}

/** Index of the last range starting at or before `position`, or -1. */
function findRangeIndex(ranges: readonly SourceRange[], position: number): number {
  let low = 0;
  let high = ranges.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (range && range.from <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Layout block id whose top-level node contains `position`, or null. Shared
 * boundaries resolve to the following block (its range starts there).
 */
export function findSourceIdAtPosition(
  ranges: readonly SourceRange[],
  position: number,
): string | null {
  if (!Number.isInteger(position) || position < 0 || ranges.length === 0) return null;
  const index = findRangeIndex(ranges, position);
  const range = index >= 0 ? ranges[index] : undefined;
  return range && position <= range.to ? range.sourceId : null;
}

/**
 * Resolves the caret's root document position to its source layout block.
 * Positions outside every range (user-created blocks, page breaks, documents
 * rebuilt from plain Markdown) resolve to null so the page-level follow stays
 * in charge.
 */
export function resolveCaretSourceBlock(
  ranges: readonly SourceRange[],
  caretPosition: number,
  layout: AiTextLayoutDocument | null,
): AiTextLayoutBlock | null {
  if (!layout) return null;
  const sourceId = findSourceIdAtPosition(ranges, caretPosition);
  if (!sourceId) return null;
  return layout.blocks.find((block) => block.id === sourceId) ?? null;
}
