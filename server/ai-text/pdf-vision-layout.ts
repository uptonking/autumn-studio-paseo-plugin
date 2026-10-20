import {
  formatSingleColumnVisionPage,
  groupBoxesIntoRows,
  normalizeCjkOcrText,
  type NormalizedBox,
  type RowGroup,
} from "./pdf-vision-single-column.ts";

export { normalizeCjkOcrText };

export interface VisionOcrLine {
  page: number;
  col?: number;
  colCount?: number;
  sidebar?: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COMPOUND_HYPHEN_PREFIXES = new Set([
  "north", "south", "east", "west", "carrier", "battle", "pattern", "high",
  "low", "near", "second", "third", "first", "well", "self", "time", "hard",
  "non", "anti", "counter", "cross", "mid", "multi", "over", "post", "pre",
  "semi", "sub", "super", "trans", "ultra", "under", "one", "two", "three",
  "four", "five", "six", "seven", "eight", "nine", "ten", "half", "full",
  "all", "co", "ex", "re", "general", "operation", "conflict", "trade",
]);

function normalizeEnglishOcrLine(text: string): string {
  return text
    .trim()
    .replace(/^[ẠỊA-Z]{1,2}(?=['"‘’]?The\b)/, "'")
    .replace(/^'T'm\b/, "'I'm")
    .replace(/^"([A-Z][^"]*')/, "'$1")
    .replace(/\b(\d[\d,]*)o\b/g, "$10")
    .replace(/\bI(\d{3})\b/g, "1$1")
    .replace(/\b1I(\d{1,3})\b/g, "11$1")
    .replace(/\(\s*=\s*[1'‘’](\w)/g, "(= '$1")
    .replace(/\s+/g, " ");
}

function joinProseLines(lines: readonly string[]): string {
  if (lines.some((l) => /[\u4e00-\u9fff]/.test(l))) {
    let out = "";
    for (const raw of lines) {
      const line = normalizeCjkOcrText(raw);
      if (!line) continue;
      if (!out) out = line;
      else {
        const needsSpace = /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(line);
        out = normalizeCjkOcrText(`${out}${needsSpace ? " " : ""}${line}`);
      }
    }
    return out;
  }

  let out = "";
  for (const raw of lines) {
    const line = normalizeEnglishOcrLine(raw);
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const hyphenMatch = out.match(/([A-Za-z]{2,})-$/) ;
    const nextWordMatch = line.match(/^([a-z]{2,})\b/);
    if (hyphenMatch?.[1] && nextWordMatch?.[1]) {
      const prefix = hyphenMatch[1].toLowerCase();
      out = COMPOUND_HYPHEN_PREFIXES.has(prefix)
        ? `${out}${line}`
        : `${out.slice(0, -1)}${line}`;
    } else {
      out = `${out} ${line}`;
    }
  }
  return out;
}

function detectImplicitTwoColumns(boxes: NormalizedBox[]): NormalizedBox[] {
  if (boxes.length < 12 || boxes.some((b) => b.colCount === 2)) return boxes;
  let bestG = 0.5, bestCount = 0;
  for (const g of [0.48, 0.5, 0.508, 0.52]) {
    const left = boxes.filter((b) => b.x2 <= g + 0.008).length;
    const right = boxes.filter((b) => b.x1 >= g - 0.008).length;
    if (left >= 6 && right >= 6 && left + right > bestCount) {
      bestCount = left + right;
      bestG = g;
    }
  }
  if (bestCount < boxes.length * 0.75) return boxes;
  return boxes.map((b) => {
    if (b.x2 <= bestG + 0.01) {
      return { ...b, col: 0, colCount: 2, x1: b.x1 / bestG, x2: Math.min(1, b.x2 / bestG) };
    }
    if (b.x1 >= bestG - 0.01) {
      const w = 1 - bestG;
      return { ...b, col: 1, colCount: 2, x1: Math.max(0, (b.x1 - bestG) / w), x2: Math.min(1, (b.x2 - bestG) / w) };
    }
    return b;
  });
}

function formatInfographicClusterBand(topBoxes: readonly NormalizedBox[]): string[] {
  if (topBoxes.length === 0) return [];
  const sortedByX = [...topBoxes].sort((a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2);
  const clusters: NormalizedBox[][] = [];
  for (const box of sortedByX) {
    const cx = (box.x1 + box.x2) / 2;
    const last = clusters[clusters.length - 1];
    if (!last || cx - last.reduce((acc, b) => acc + (b.x1 + b.x2) / 2, 0) / last.length > 0.14) {
      clusters.push([box]);
    } else {
      last.push(box);
    }
  }
  const items: string[] = [];
  for (const cluster of clusters) {
    cluster.sort((a, b) => a.topY - b.topY);
    const badgeParts: string[] = [], descParts: string[] = [];
    let inDesc = false;
    for (const b of cluster) {
      const t = b.text.trim();
      if (!inDesc && (b.h >= 0.025 || t.length <= 4)) badgeParts.push(t);
      else { inDesc = true; descParts.push(t); }
    }
    let badge = "";
    for (const part of badgeParts) {
      if (!badge) badge = part;
      else if (/\d/.test(part) && /\d/.test(badge)) badge += ` / ${part}`;
      else badge += part;
    }
    const cleanBadge = normalizeCjkOcrText(badge), cleanDesc = joinProseLines(descParts);
    if (cleanBadge && cleanDesc) items.push(`- **${cleanBadge}**：${cleanDesc}`);
    else if (cleanBadge || cleanDesc) items.push(`- ${cleanBadge || cleanDesc}`);
  }
  return items.length > 0 ? [items.join("\n")] : [];
}

function tryFormatZonedTwoColumnPage(rawPageBoxes: readonly NormalizedBox[]): string[] | null {
  if (rawPageBoxes.some((b) => b.colCount === 2)) return null;
  const spanningHeadings = rawPageBoxes
    .filter((b) => {
      const w = b.x2 - b.x1, cx = (b.x1 + b.x2) / 2;
      if (!(b.topY >= 0.15 && b.topY <= 0.75 && b.x1 < 0.45 && b.x2 > 0.55 && w >= 0.12 && w <= 0.55 && Math.abs(cx - 0.5) <= 0.08)) return false;
      return !rawPageBoxes.some((other) => other !== b && Math.abs(other.topY - b.topY) <= 0.06 && (other.x2 < 0.38 || other.x1 > 0.62));
    })
    .sort((a, b) => a.topY - b.topY);
  if (spanningHeadings.length === 0) return null;

  const firstHeadingY = spanningHeadings[0]!.topY;
  const lastHeading = spanningHeadings[spanningHeadings.length - 1]!;
  const bottomBoxes = rawPageBoxes.filter((b) => b.topY > lastHeading.topY + lastHeading.h + 0.01);
  const mappedBottom = detectImplicitTwoColumns(bottomBoxes);
  if (!mappedBottom.some((b) => b.colCount === 2)) return null;

  const out: string[] = [];
  const topBoxes = rawPageBoxes.filter((b) => b.topY < firstHeadingY - 0.01);
  if (topBoxes.length > 0 && topBoxes.every((b) => b.x2 - b.x1 <= 0.25)) {
    out.push(...formatInfographicClusterBand(topBoxes));
  }
  spanningHeadings.forEach((hBox, idx) => out.push(`${idx === 0 ? "##" : "###"} ${normalizeCjkOcrText(hBox.text)}`));
  out.push(...formatTwoColumnPage(mappedBottom));
  return out;
}

interface ColumnParagraphBlock {
  kind: "heading" | "paragraph";
  text: string;
  startsIndented: boolean;
  endsFullWidth: boolean;
}

function segmentSingleColumnProse(rows: readonly RowGroup[]): ColumnParagraphBlock[] {
  const filtered = rows.filter((r) => {
    const t = r.cells.map((c) => c.text.trim()).join(" ").trim();
    return Boolean(t) && !((r.topY < 0.06 || r.topY > 0.92) && /^\d{1,4}$/.test(t));
  });
  if (filtered.length === 0) return [];

  const x1Sorted = filtered.map((r) => r.x1).sort((a, b) => a - b);
  const x2Sorted = filtered.map((r) => r.x2).sort((a, b) => a - b);
  const leftMargin = x1Sorted[Math.floor(x1Sorted.length * 0.2)] ?? 0.08;
  const rightMargin = x2Sorted[Math.floor(x2Sorted.length * 0.8)] ?? 0.92;

  const steps: number[] = [];
  for (let i = 1; i < filtered.length; i++) {
    const dy = filtered[i]!.topY - filtered[i - 1]!.topY;
    if (dy > 0.005 && dy < 0.04) steps.push(dy);
  }
  steps.sort((a, b) => a - b);
  const medianStep = steps[Math.floor(steps.length / 2)] ?? 0.019;

  const out: ColumnParagraphBlock[] = [];
  let paraLines: string[] = [];
  let paraStartsIndented = false;
  let prevRow: RowGroup | null = null;

  const flushPara = () => {
    if (paraLines.length > 0) {
      const joined = joinProseLines(paraLines);
      if (joined) {
        out.push({
          kind: "paragraph",
          text: joined,
          startsIndented: paraStartsIndented,
          endsFullWidth: prevRow ? prevRow.x2 >= rightMargin - 0.08 : false,
        });
      }
      paraLines = [];
    }
  };

  for (const row of filtered) {
    const rawRowText = row.cells.map((c) => c.text.trim()).join(" ");
    const lineText = /[\u4e00-\u9fff]/.test(rawRowText)
      ? normalizeCjkOcrText(rawRowText)
      : normalizeEnglishOcrLine(rawRowText);
    const dy = prevRow ? row.topY - prevRow.topY : 0;
    const isAllCapsHeading =
      lineText.length >= 3 &&
      lineText.length <= 48 &&
      /^[A-Z][A-Z0-9\s,'&-]+$/.test(lineText) &&
      !/[.;:]$/.test(lineText) &&
      (row.x1 > leftMargin + 0.07 || dy > medianStep * 1.6);

    if (isAllCapsHeading) {
      flushPara();
      out.push({ kind: "heading", text: `## ${lineText}`, startsIndented: false, endsFullWidth: false });
      prevRow = null;
      continue;
    }

    const isIndented = row.x1 > leftMargin + 0.013;
    const prevEndedShort = prevRow !== null && prevRow.x2 < rightMargin - 0.12;
    const hasParaGap = prevRow !== null && dy > medianStep * 1.55;

    if (paraLines.length === 0 || isIndented || prevEndedShort || hasParaGap) {
      if (paraLines.length > 0) flushPara();
      paraStartsIndented = isIndented;
      paraLines.push(lineText);
    } else {
      paraLines.push(lineText);
    }
    prevRow = row;
  }
  flushPara();
  return out;
}

function formatSidebarGlossaryRows(rows: readonly RowGroup[]): string[] {
  const filtered = rows.filter((r) => {
    const t = r.cells.map((c) => c.text.trim()).join(" ").trim();
    return Boolean(t) && !((r.topY < 0.06 || r.topY > 0.92) && /^\d{1,4}$/.test(t));
  });
  if (filtered.length === 0) return [];
  const entries: string[] = [];
  let buf: string[] = [];
  let prevTopY = 0;
  const flushEntry = () => {
    if (buf.length === 0) return;
    const joined = joinProseLines(buf);
    const m = joined.match(/^([a-z]+\s+\([^)]+\)|[a-z]+)\s+(.+)$/i);
    entries.push(m?.[1] && m[2] ? `- **${m[1]}**: ${m[2]}` : `- ${joined}`);
    buf = [];
  };
  for (const row of filtered) {
    const text = row.cells.map((c) => c.text.trim()).join(" ");
    if (buf.length > 0 && row.topY - prevTopY >= 0.0205) flushEntry();
    buf.push(text);
    prevTopY = row.topY;
  }
  flushEntry();
  return entries.length > 0 ? [`> **Vocabulary**\n${entries.map((e) => `> ${e}`).join("\n")}`] : [];
}

function formatTwoColumnPage(pageBoxes: readonly NormalizedBox[]): string[] {
  let col0Rows = groupBoxesIntoRows(pageBoxes.filter((b) => b.col === 0));
  let col1Rows = groupBoxesIntoRows(pageBoxes.filter((b) => b.col === 1));
  if (pageBoxes.some((b) => b.sidebar === 1)) {
    const mainBlocks = segmentSingleColumnProse(col0Rows).map((b) => b.text);
    const sideBlocks = formatSidebarGlossaryRows(col1Rows);
    return [...mainBlocks, ...sideBlocks];
  }
  const blocks: string[] = [];

  if ((col0Rows[0]?.topY ?? 0) > 0.25 && (col1Rows[0]?.topY ?? 0) > 0.25) {
    const findGap = (rows: RowGroup[]) => {
      for (let i = 0; i < Math.min(5, rows.length - 1); i++) {
        if (rows[i + 1]!.topY - rows[i]!.topY >= 0.032) return i + 1;
      }
      return -1;
    };
    const split0 = findGap(col0Rows);
    const split1 = findGap(col1Rows);
    if (split0 > 0 && split1 > 0) {
      const capLines = [...col0Rows.slice(0, split0), ...col1Rows.slice(0, split1)].map((r) =>
        r.cells.map((c) => c.text.trim()).join(" "),
      );
      const caption = joinProseLines(capLines);
      if (caption) blocks.push(`> ${caption}`);
      col0Rows = col0Rows.slice(split0);
      col1Rows = col1Rows.slice(split1);
    }
  }

  const b0 = segmentSingleColumnProse(col0Rows);
  const b1 = segmentSingleColumnProse(col1Rows);

  if (b0.length > 0 && b1.length > 0) {
    const last0 = b0[b0.length - 1]!;
    const first1 = b1[0]!;
    if (
      last0.kind === "paragraph" &&
      first1.kind === "paragraph" &&
      last0.endsFullWidth &&
      !first1.startsIndented &&
      !/[.?!:。！？；;"'”’)]$/.test(last0.text) &&
      (/^[a-z]/.test(first1.text) || /^[\u4e00-\u9fff]/.test(first1.text))
    ) {
      last0.text = joinProseLines([last0.text, first1.text]);
      b1.shift();
    }
  }

  for (const item of [...b0, ...b1]) blocks.push(item.text);
  return blocks;
}

export function formatVisionOcrLinesToMarkdown(
  ocrLines: readonly VisionOcrLine[],
  fileName: string,
  cleanCodeBlocks: readonly string[] = [],
): string {
  const blocks: string[] = [`# ${fileName}`];
  const byPage = new Map<number, NormalizedBox[]>();

  for (const item of ocrLines) {
    const raw = item.text.trim();
    if (!raw) continue;
    const list = byPage.get(item.page) ?? [];
    list.push({
      page: item.page,
      col: item.col ?? 0,
      colCount: item.colCount ?? 1,
      sidebar: item.sidebar ?? 0,
      text: raw,
      x1: item.x,
      x2: item.x + item.w,
      topY: 1 - item.y - item.h,
      h: item.h,
    });
    byPage.set(item.page, list);
  }

  const codeBlockIdxRef = { index: 0 };

  for (const [, rawPageBoxes] of byPage) {
    const zonedBlocks = tryFormatZonedTwoColumnPage(rawPageBoxes);
    if (zonedBlocks) {
      blocks.push(...zonedBlocks);
      continue;
    }

    const pageBoxes = detectImplicitTwoColumns(rawPageBoxes);
    if (pageBoxes.some((b) => b.colCount === 2)) {
      blocks.push(...formatTwoColumnPage(pageBoxes));
      continue;
    }

    blocks.push(
      ...formatSingleColumnVisionPage(pageBoxes, cleanCodeBlocks, codeBlockIdxRef),
    );
  }

  return `${blocks.join("\n\n").trim()}\n`;
}
