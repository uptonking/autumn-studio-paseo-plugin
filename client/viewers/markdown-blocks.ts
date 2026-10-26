/**
 * Pure Markdown table and inline-token parsing shared by the rendered Text
 * viewer (markdown-preview.tsx) and the Paginated Text Doc bridge. Kept free
 * of React and DOM types so both the island bundle and node tests can use it.
 */

export function parseMarkdownTableCells(rowLine: string): string[] {
  const trimmed = rowLine.trim();
  const inner =
    trimmed.startsWith('|') && trimmed.endsWith('|')
      ? trimmed.slice(1, -1)
      : trimmed.startsWith('|')
        ? trimmed.slice(1)
        : trimmed;
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

export function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = parseMarkdownTableCells(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function parseHtmlTableRows(tableHtml: string): {
  headers: string[];
  rows: string[][];
} | null {
  const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (trMatches.length === 0) return null;
  const allRows: { isHeader: boolean; cells: string[] }[] = [];
  for (const tr of trMatches) {
    const trBody = tr[1] ?? '';
    const thMatches = [...trBody.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
    if (thMatches.length > 0) {
      allRows.push({
        isHeader: true,
        cells: thMatches.map((m) =>
          (m[1] ?? '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      });
      continue;
    }
    const tdMatches = [...trBody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tdMatches.length > 0) {
      allRows.push({
        isHeader: false,
        cells: tdMatches.map((m) =>
          (m[1] ?? '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      });
    }
  }
  if (allRows.length === 0) return null;
  const first = allRows[0];
  return {
    headers: first.cells,
    rows: allRows.slice(1).map((r) => r.cells),
  };
}

/** Reverses `escapeInlineText`: `\*` becomes a literal `*`, and so on. */
export function unescapeInlineText(text: string): string {
  return text.replace(/\\([\\`*_[\]~<>])/g, '$1');
}

/**
 * Inline markdown tokens in priority order: images, code spans, bold+italic,
 * bold, italic, strikethrough, and links. Mirrors what markdown-preview.tsx
 * renders. `***text***` must be tried before `**` or the outer stars would
 * detach and the emphasis would not round-trip.
 */
export const INLINE_MARKDOWN_PATTERN =
  /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;

export interface InlineMarkdownImage {
  kind: 'image';
  alt: string;
  src: string;
}

export interface InlineMarkdownSpan {
  kind: 'span';
  /** Raw markdown source of the token. */
  raw: string;
  /** `***`, `**`/`__`, `*`/`_`, `~~`, backtick, `[label](href)`, or `text`. */
  style: 'bold-italic' | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'text';
  /** Label for links; inner text for the other styles. */
  text: string;
  href: string | null;
}

export type InlineMarkdownToken = InlineMarkdownImage | InlineMarkdownSpan;

/** Splits a single markdown line into ordered inline tokens. */
export function tokenizeInlineMarkdown(text: string): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INLINE_MARKDOWN_PATTERN.source, 'g');

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      tokens.push({
        kind: 'span',
        raw: plain,
        style: 'text',
        text: unescapeInlineText(plain),
        href: null,
      });
    }
    const raw = match[0];
    if (raw.startsWith('![')) {
      const closeBracket = raw.indexOf('](');
      tokens.push({
        kind: 'image',
        alt: raw.slice(2, closeBracket),
        src: raw.slice(closeBracket + 2, -1),
      });
    } else if (raw.startsWith('`')) {
      // Backslash escapes are literal inside code spans.
      tokens.push({ kind: 'span', raw, style: 'code', text: raw.slice(1, -1), href: null });
    } else if (raw.startsWith('***')) {
      tokens.push({
        kind: 'span',
        raw,
        style: 'bold-italic',
        text: unescapeInlineText(raw.slice(3, -3)),
        href: null,
      });
    } else if (raw.startsWith('**') || raw.startsWith('__')) {
      tokens.push({
        kind: 'span',
        raw,
        style: 'bold',
        text: unescapeInlineText(raw.slice(2, -2)),
        href: null,
      });
    } else if (raw.startsWith('~~')) {
      tokens.push({
        kind: 'span',
        raw,
        style: 'strike',
        text: unescapeInlineText(raw.slice(2, -2)),
        href: null,
      });
    } else if (raw.startsWith('*') || raw.startsWith('_')) {
      tokens.push({
        kind: 'span',
        raw,
        style: 'italic',
        text: unescapeInlineText(raw.slice(1, -1)),
        href: null,
      });
    } else if (raw.startsWith('[')) {
      const closeBracket = raw.indexOf('](');
      tokens.push({
        kind: 'span',
        raw,
        style: 'link',
        text: unescapeInlineText(raw.slice(1, closeBracket)),
        href: raw.slice(closeBracket + 2, -1),
      });
    } else {
      tokens.push({ kind: 'span', raw, style: 'text', text: raw, href: null });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex);
    tokens.push({
      kind: 'span',
      raw: plain,
      style: 'text',
      text: unescapeInlineText(plain),
      href: null,
    });
  }
  return tokens;
}

/** Escapes characters that would re-parse as inline markdown or break cells. */
export function escapeMarkdownCellText(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
