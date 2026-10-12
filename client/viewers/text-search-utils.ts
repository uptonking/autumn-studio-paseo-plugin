export interface TextSearchMatch {
  matchIndex: number;
  startOffset: number;
  endOffset: number;
  lineIndex: number;
  lineStartCol: number;
  lineEndCol: number;
}

export function findTextSearchMatches(
  content: string | null,
  query: string,
  maxMatches = 2000,
): TextSearchMatch[] {
  if (!content || !query) return [];
  const needle = query.toLowerCase();
  const needleLen = needle.length;
  if (needleLen === 0) return [];

  const matches: TextSearchMatch[] = [];
  let lineIndex = 0;
  let lineStartOffset = 0;
  const totalLen = content.length;

  while (lineStartOffset <= totalLen && matches.length < maxMatches) {
    let lineEndOffset = content.indexOf("\n", lineStartOffset);
    let hasCr = false;
    if (lineEndOffset === -1) {
      lineEndOffset = totalLen;
    } else if (
      lineEndOffset > lineStartOffset &&
      content.charCodeAt(lineEndOffset - 1) === 13
    ) {
      hasCr = true;
    }
    const contentEnd = hasCr ? lineEndOffset - 1 : lineEndOffset;
    const lineText = content.slice(lineStartOffset, contentEnd);
    const lowerLine = lineText.toLowerCase();

    let searchFrom = 0;
    while (
      searchFrom <= lowerLine.length - needleLen &&
      matches.length < maxMatches
    ) {
      const col = lowerLine.indexOf(needle, searchFrom);
      if (col === -1) break;
      const startOffset = lineStartOffset + col;
      matches.push({
        matchIndex: matches.length,
        startOffset,
        endOffset: startOffset + needleLen,
        lineIndex,
        lineStartCol: col,
        lineEndCol: col + needleLen,
      });
      searchFrom = col + needleLen;
    }

    if (lineEndOffset === totalLen) break;
    lineStartOffset = lineEndOffset + 1;
    lineIndex += 1;
  }

  return matches;
}

export function groupTextMatchesByLine(
  matches: readonly TextSearchMatch[],
): Map<number, TextSearchMatch[]> {
  const byLine = new Map<number, TextSearchMatch[]>();
  for (const match of matches) {
    let list = byLine.get(match.lineIndex);
    if (!list) {
      list = [];
      byLine.set(match.lineIndex, list);
    }
    list.push(match);
  }
  return byLine;
}
