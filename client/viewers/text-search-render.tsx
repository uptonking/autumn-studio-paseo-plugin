import * as React from 'react';

import { cn } from '../vendor/lib/utils.js';
import type { TextSearchMatch } from './text-search-utils.js';

export function renderLineWithHighlights(
  line: string,
  lineMatches: readonly TextSearchMatch[] | undefined,
  activeMatchIndex: number,
): React.ReactNode {
  if (!lineMatches || lineMatches.length === 0) {
    return line || '\u200B';
  }
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of lineMatches) {
    if (match.lineStartCol > cursor) {
      nodes.push(line.slice(cursor, match.lineStartCol));
    }
    const isActive = match.matchIndex === activeMatchIndex;
    nodes.push(
      <mark
        key={match.matchIndex}
        data-active-match={isActive ? 'true' : undefined}
        className={cn(
          'rounded-xs px-0.5 text-foreground',
          isActive ? 'bg-amber-500/70 ring-1 ring-amber-500' : 'bg-amber-400/35',
        )}
      >
        {line.slice(match.lineStartCol, match.lineEndCol)}
      </mark>,
    );
    cursor = match.lineEndCol;
  }
  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }
  return nodes.length > 0 ? nodes : '\u200B';
}
