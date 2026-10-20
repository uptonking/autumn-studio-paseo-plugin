const COMPOUND_HYPHEN_PREFIXES = new Set([
  "north", "south", "east", "west", "carrier", "battle", "pattern", "high", "low", "near",
  "second", "third", "first", "well", "self", "time", "hard", "non", "anti", "counter",
  "cross", "mid", "multi", "over", "post", "pre", "semi", "sub", "super", "trans", "ultra",
  "under", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "half", "full", "all", "co", "ex", "general", "operation", "conflict", "trade", "grow",
  "user", "standards", "built", "client", "server", "object", "real", "read", "open", "long", "inter",
]);

const TITLE_STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "with",
]);

function normalizePdfLigatures(text: string): string {
  return text.replace(/\uFB00/g, "ff").replace(/\uFB01/g, "fi").replace(/\uFB02/g, "fl").replace(/\uFB03/g, "ffi").replace(/\uFB04/g, "ffl");
}

export function isGarbledPdfText(text: string): boolean {
  const nonSpace = text.replace(/\s+/g, "");
  if (nonSpace.length === 0) return true;
  const count = nonSpace.match(/[\u0300-\u036F\u0460-\u1FFF\uA000-\uABFF\uFFF0-\uFFFF]/g)?.length ?? 0;
  return count >= 8 && count / nonSpace.length >= 0.06;
}

export function isDefectiveEmbeddedPdfText(rawText: string, fileName: string): boolean {
  if (isGarbledPdfText(rawText)) return true;
  if (/[\u4e00-\u9fff]/.test(fileName)) {
    return (rawText.match(/[\u4e00-\u9fff]/g) ?? []).length < 15;
  }
  return false;
}

function isCleanAsciiCodeLine(trimmed: string): boolean {
  if (!trimmed || !/^[\x20-\x7E]+$/.test(trimmed)) return false;
  if (/^bool\s*\(/i.test(trimmed) || /#(?:True|False)\b/.test(trimmed)) return true;
  if (/^[a-zA-Z_]\w*\s*=\s*(?:None|True|False|\d+|['"[\]{}])/i.test(trimmed)) return true;
  return /^\d+\s*[<>!=]=?\s*\d+\s+(?:and|or)\s+\d+/i.test(trimmed);
}

export function extractCleanCodeBlocksFromPdfText(rawText: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) { blocks.push(current.join("\n")); current = []; }
  };
  for (const line of rawText.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (isCleanAsciiCodeLine(trimmed)) current.push(trimmed);
    else flush();
  }
  flush();
  return blocks;
}

export function isTwoColumnProseLayout(layoutText: string): boolean {
  let wideTwoColLines = 0;
  for (const line of layoutText.replace(/\r\n/g, "\n").split("\n")) {
    const parts = line.trim().split(/\s{3,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0]!.length >= 36 && parts[1]!.length >= 36 && /[a-z]{3,}/.test(parts[0]!) && /[a-z]{3,}/.test(parts[1]!)) {
      wideTwoColLines++;
    }
  }
  return wideTwoColLines >= 6;
}

interface LineSegment { start: number; end: number; text: string }

function extractLineSegments(line: string): LineSegment[] {
  const segs: LineSegment[] = [];
  for (const m of line.matchAll(/\S+(?:\s{1,2}\S+)*/g)) {
    const start = m.index ?? 0;
    segs.push({ start, end: start + m[0].length, text: m[0] });
  }
  return segs;
}

function joinColumnProseLines(lines: readonly string[]): string {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const hyphenMatch = out.match(/([A-Za-z0-9]{2,})-$/) ;
    const nextWordMatch = line.match(/^([a-z]{2,})\b/);
    if (hyphenMatch?.[1] && nextWordMatch?.[1]) {
      const prefix = hyphenMatch[1];
      const lowerPrefix = prefix.toLowerCase();
      const nextWord = nextWordMatch[1].toLowerCase();
      const isCompound =
        /^[A-Z0-9]{2,}$/.test(prefix) ||
        /Script$/i.test(prefix) ||
        (COMPOUND_HYPHEN_PREFIXES.has(lowerPrefix) &&
          !(lowerPrefix === "counter" && nextWord === "example")) ||
        (lowerPrefix === "re" && /^[ae]/.test(nextWord));
      out = isCompound ? `${out}${line}` : `${out.slice(0, -1)}${line}`;
    } else if (
      /[\u4e00-\u9fff《》“”‘’（）、，。！？；：]$/.test(out) &&
      /^[\u4e00-\u9fff《》“”‘’（）、，。！？；：]/.test(line)
    ) {
      out += line;
    } else {
      out += ` ${line}`;
    }
  }
  return out;
}

function matchAcademicHeading(trimmed: string): { level: number; text: string } | null {
  if (/^(ABSTRACT|INTRODUCTION|CONCLUSION|CONCLUSIONS|REFERENCES|ACKNOWLEDGMENTS|ACKNOWLEDGEMENTS)$/i.test(trimmed)) {
    return { level: 2, text: trimmed.toUpperCase() };
  }
  const secMatch = trimmed.match(/^(\d+)\s+([A-Z][A-Z0-9\s:,-]{2,60})$/);
  if (secMatch?.[1] && secMatch[2]) {
    return { level: 2, text: `${secMatch[1]} ${secMatch[2].replace(/\s+/g, " ").trim()}` };
  }
  const subSecMatch = trimmed.match(/^(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z0-9\s:,-]{2,70})$/);
  if (subSecMatch?.[1] && subSecMatch[2] && !/[.;]$/.test(trimmed)) {
    return { level: 3, text: `${subSecMatch[1]} ${subSecMatch[2].replace(/\s+/g, " ").trim()}` };
  }
  return null;
}

interface SlicedColLine {
  indent: number;
  text: string;
  width: number;
}

interface ColumnBlock {
  kind: "heading" | "figure" | "paragraph";
  text: string;
  startsIndented: boolean;
  endsFullWidth: boolean;
}

function parseSlicedColumn(colLines: readonly SlicedColLine[]): ColumnBlock[] {
  const blocks: ColumnBlock[] = [];
  let startIdx = 0;

  let figCaptionIdx = -1;
  for (let i = 0; i < Math.min(55, colLines.length); i++) {
    if (/^(Figure|Fig\.)\s+\d+\s*[:.]/i.test(colLines[i]!.text)) {
      figCaptionIdx = i;
      break;
    }
  }
  if (figCaptionIdx >= 0) {
    const preLines = colLines.slice(0, figCaptionIdx).filter((l) => l.text.length > 0);
    if (!preLines.some((l) => matchAcademicHeading(l.text) !== null)) {
      const subCaptions = preLines
        .map((l) => l.text.replace(/\s+/g, " ").trim())
        .filter((t) => /^\(?[a-z]\)\s+[A-Z]/.test(t) || /^Subscripts denote\b/i.test(t));
      const figCaption = colLines[figCaptionIdx]!.text.replace(/\s+/g, " ").trim();
      const quoteLines = [`> **${figCaption}**`, ...subCaptions.map((s) => `> - ${s}`)];
      blocks.push({ kind: "figure", text: quoteLines.join("\n"), startsIndented: false, endsFullWidth: false });
      startIdx = figCaptionIdx + 1;
    }
  }

  const nonEmptyWidths = colLines.slice(startIdx).map((l) => l.width).filter((w) => w >= 35).sort((a, b) => a - b);
  const fullWidthRef = nonEmptyWidths[Math.floor(nonEmptyWidths.length * 0.7)] ?? 64;

  let paraLines: string[] = [];
  let paraStartsIndented = false;
  let lastLineWidth = 0;
  let lastLineText = "";
  let sawBlankLine = false;

  const flushPara = () => {
    if (paraLines.length > 0) {
      const joined = joinColumnProseLines(paraLines);
      if (joined) {
        blocks.push({
          kind: "paragraph",
          text: joined,
          startsIndented: paraStartsIndented,
          endsFullWidth: lastLineWidth >= fullWidthRef - 8,
        });
      }
      paraLines = [];
    }
    sawBlankLine = false;
  };

  for (let i = startIdx; i < colLines.length; i++) {
    const item = colLines[i]!;
    if (!item.text) {
      sawBlankLine = true;
      continue;
    }
    if (/^\d{1,4}$/.test(item.text) && i >= colLines.length - 2) {
      flushPara();
      continue;
    }
    const heading = matchAcademicHeading(item.text);
    if (heading) {
      flushPara();
      blocks.push({ kind: "heading", text: `${"#".repeat(heading.level)} ${heading.text}`, startsIndented: false, endsFullWidth: false });
      continue;
    }

    const isIndented = item.indent >= 2 && item.indent <= 8;
    const prevEndedParagraph =
      sawBlankLine && lastLineWidth < fullWidthRef - 6 && /[.!?]["'”’)]*$/.test(lastLineText);

    if (paraLines.length === 0 || isIndented || prevEndedParagraph) {
      if (paraLines.length > 0) flushPara();
      paraStartsIndented = isIndented;
      paraLines.push(item.text);
    } else {
      paraLines.push(item.text);
    }
    lastLineWidth = item.width;
    lastLineText = item.text;
    sawBlankLine = false;
  }
  flushPara();
  return blocks;
}

export function formatTwoColumnLayoutPageToMarkdown(pageText: string): string[] {
  const lines = pageText.replace(/\r\n/g, "\n").split("\n");
  const lineSegs = lines.map(extractLineSegments);

  const leftStarts: number[] = [];
  const rightStarts: number[] = [];
  for (const segs of lineSegs) {
    const proseSegs = segs.filter((s) => s.text.length >= 28 && /[a-z]{3,}/i.test(s.text));
    if (proseSegs.length === 2) {
      leftStarts.push(proseSegs[0]!.start);
      rightStarts.push(proseSegs[1]!.start);
    }
  }
  leftStarts.sort((a, b) => a - b);
  rightStarts.sort((a, b) => a - b);
  const leftBaseCol = leftStarts[0] ?? 0;
  const rightBaseCol = rightStarts[0] ?? 80;
  const splitCol = Math.max(leftBaseCol + 20, rightBaseCol - 2);

  let firstColLineIdx = 0;
  for (let i = 0; i < lineSegs.length; i++) {
    if (lineSegs[i]!.some((s) => Math.abs(s.start - leftBaseCol) <= 5)) {
      firstColLineIdx = i;
      break;
    }
  }

  const outBlocks: string[] = [];
  const topLines = lines.slice(0, firstColLineIdx).map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (topLines.length > 0) {
    outBlocks.push(`## ${topLines[0]}`);
    if (topLines.length > 1) outBlocks.push(topLines.slice(1).join(" · "));
  }

  const marginNotes: string[] = [];
  if (leftBaseCol >= 12) {
    for (let i = firstColLineIdx; i < lines.length; i++) {
      const marginSlice = lines[i]!.slice(0, Math.max(0, leftBaseCol - 1)).trim();
      if (marginSlice.length >= 6) marginNotes.push(marginSlice.replace(/\s+/g, " "));
    }
  }
  if (marginNotes.length > 0) outBlocks.push(`> ${marginNotes.join(" ")}`);

  const leftColLines: SlicedColLine[] = [];
  const rightColLines: SlicedColLine[] = [];
  for (let i = firstColLineIdx; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const leftRaw = raw.slice(leftBaseCol, splitCol);
    const leftTrim = leftRaw.trim();
    const leftLead = leftTrim ? leftRaw.search(/\S/) : 0;
    leftColLines.push({ indent: Math.max(0, leftLead), text: leftTrim, width: leftTrim.length + Math.max(0, leftLead) });

    const rightStart = Math.min(raw.length, rightBaseCol);
    const rightSliceOrigin = raw.slice(splitCol, rightBaseCol).trim().length > 0 ? splitCol : rightStart;
    const rightRaw = raw.slice(rightSliceOrigin);
    const rightTrim = rightRaw.trim();
    const rightLead = rightTrim ? rightRaw.search(/\S/) : 0;
    rightColLines.push({ indent: Math.max(0, rightLead), text: rightTrim, width: rightTrim.length + Math.max(0, rightLead) });
  }

  const b0 = parseSlicedColumn(leftColLines);
  const b1 = parseSlicedColumn(rightColLines);
  const last0Idx = b0.length - 1;
  const first1ProseIdx = b1.findIndex((b) => b.kind === "paragraph");
  if (last0Idx >= 0 && first1ProseIdx >= 0) {
    const last0 = b0[last0Idx]!;
    const first1 = b1[first1ProseIdx]!;
    if (
      last0.kind === "paragraph" &&
      first1.kind === "paragraph" &&
      b1.slice(0, first1ProseIdx).every((b) => b.kind === "figure") &&
      !first1.startsIndented &&
      !/[.?!:;"'”’)]$/.test(last0.text)
    ) {
      last0.text = joinColumnProseLines([last0.text, first1.text]);
      b1.splice(first1ProseIdx, 1);
    }
  }
  for (const block of [...b0, ...b1]) outBlocks.push(block.text);
  return outBlocks;
}

function findColumnStarts(headerLine: string): number[] {
  const starts: number[] = [];
  let inToken = false, spaceRun = 0;
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] !== " ") {
      if (!inToken && (starts.length === 0 || spaceRun >= 2)) starts.push(i);
      inToken = true;
      spaceRun = 0;
    } else {
      inToken = false;
      spaceRun++;
    }
  }
  return starts;
}

function splitRowByColumns(line: string, colStarts: number[]): string[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const multiSpaceParts = trimmed.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (multiSpaceParts.some((p) => p.startsWith("#"))) return null;
  if (multiSpaceParts.length === colStarts.length) return multiSpaceParts;
  if (colStarts.length === 2) {
    const targetSplit = colStarts[1] ?? 26;
    let bestSpaceIdx = -1, bestDist = Infinity;
    for (let i = 1; i < line.length - 1; i++) {
      if (line[i] === " ") {
        const dist = Math.abs(i - targetSplit);
        if (dist < bestDist && dist <= 6) {
          bestDist = dist;
          bestSpaceIdx = i;
        }
      }
    }
    if (bestSpaceIdx > 0) {
      const left = line.slice(0, bestSpaceIdx).trim();
      const right = line.slice(bestSpaceIdx + 1).trim();
      if (left && right && !right.startsWith("#")) return [left, right];
    }
  }
  return multiSpaceParts.length >= 2 ? multiSpaceParts : null;
}

function isLikelyHeadingLine(trimmed: string, leadIndent = 0, bodyIndent = 0): { level: number; text: string } | null {
  const runningLeft = trimmed.match(/^\d+\s*[|❘]\s*(.+)$/);
  if (runningLeft?.[1]) return { level: 2, text: runningLeft[1].replace(/\s{2,}/g, " — ").trim() };
  const runningRight = trimmed.match(/^(.+?)\s*[|❘]\s*\d+$/);
  if (runningRight?.[1]) return { level: 2, text: runningRight[1].replace(/\s{2,}/g, " — ").trim() };
  if (/^[➤•▪▸◦*-]\s/.test(trimmed) || /\s{3,}/.test(trimmed)) return null;
  if (/^CHAPTER\s+\d+\b/i.test(trimmed)) return { level: 2, text: trimmed };
  if (/^第[一二三四五六七八九十百千万0-9]+[章节回篇]\s+\S+/.test(trimmed)) return { level: 2, text: trimmed };
  if (/^Table\s+\d+[-.]\d+\s*:/i.test(trimmed)) return { level: 3, text: trimmed };
  const words = trimmed.split(/\s+/);
  if (trimmed.length >= 3 && trimmed.length <= 68 && !/[.,;:]$/.test(trimmed) && words.length <= 8) {
    if (
      /^[A-Z0-9][A-Z0-9\s?/-]+$/.test(trimmed) ||
      /^(ECMAScript|JavaScript|DOM|BOM|Summary|Introduction|Overview|ABSTRACT)\b/.test(trimmed)
    ) {
      return { level: 2, text: trimmed };
    }
    const isTitleCase =
      /^[A-Z]/.test(trimmed) &&
      words.every((w) => TITLE_STOPWORDS.has(w.toLowerCase()) || /^[A-Z0-9]/.test(w));
    if (isTitleCase && (leadIndent < bodyIndent || words.length <= 6)) {
      return { level: 2, text: trimmed };
    }
  }
  return null;
}

function stripSideInsetFigures(rawLines: readonly string[]): {
  lines: string[];
  figuresByLine: Map<number, string>;
} {
  const mutable = [...rawLines];
  const dropLineIndices = new Set<number>();
  const figuresByLine = new Map<number, string>();

  for (let i = 0; i < mutable.length; i++) {
    const line = mutable[i] ?? "";
    const figMatch = line.match(/^(.*?\S)?(\s{10,}|\s{52,})((?:FIGURE|Figure|Fig\.)\s+\d+(?:[-.]\d+)?)\s*$/);
    if (!figMatch?.[3]) continue;
    if (line.lastIndexOf(figMatch[3]) < 50) continue;

    const labels: string[] = [];
    for (let j = Math.max(0, i - 22); j <= i; j++) {
      const cur = mutable[j] ?? "";
      if (j === i) {
        mutable[j] = (figMatch[1] ?? "").trimEnd();
        if (!mutable[j]) dropLineIndices.add(j);
        continue;
      }
      const rightOnly = cur.match(/^(\s{52,})(\S+(?:\s\S+){0,2})\s*$/);
      if (rightOnly?.[2] && rightOnly[2].length <= 24) {
        labels.push(rightOnly[2].trim());
        mutable[j] = "";
        dropLineIndices.add(j);
        continue;
      }
      const splitRight = cur.match(/^(.+?\S)\s{10,}(\S+(?:\s\S+){0,2})\s*$/);
      if (splitRight?.[1] && splitRight[2] && splitRight[2].length <= 24 && cur.lastIndexOf(splitRight[2]) >= 50) {
        labels.push(splitRight[2].trim());
        mutable[j] = splitRight[1].trimEnd();
      }
    }
    const figTitle = figMatch[3].trim();
    const figBody = labels.length > 0 ? `: \`${labels.join(" → ")}\`` : "";
    figuresByLine.set(i, `> **${figTitle}**${figBody}`);
  }

  const lines: string[] = [];
  const remappedFigures = new Map<number, string>();
  for (let i = 0; i < mutable.length; i++) {
    if (!dropLineIndices.has(i)) lines.push(mutable[i]!);
    const fig = figuresByLine.get(i);
    if (fig) remappedFigures.set(Math.max(0, lines.length - 1), fig);
  }
  return { lines, figuresByLine: remappedFigures };
}

export function formatLayoutPdfTextToMarkdown(
  rawText: string,
  fileName: string,
  enableTable = true,
): string {
  const pages = normalizePdfLigatures(rawText)
    .replace(/\r\n/g, "\n")
    .split("\f")
    .map((p) => p.trimEnd())
    .filter((p) => p.trim().length > 0);
  const blocks: string[] = [`# ${fileName}`];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx]!;
    if (isTwoColumnProseLayout(page)) {
      blocks.push(...formatTwoColumnLayoutPageToMarkdown(page));
      continue;
    }
    const { lines, figuresByLine } = stripSideInsetFigures(page.split("\n"));
    const bodyIndents = lines
      .filter((l) => l.trim().length >= 55)
      .map((l) => l.search(/\S/))
      .filter((n) => n >= 0)
      .sort((a, b) => a - b);
    const bodyIndent = bodyIndents[Math.floor(bodyIndents.length / 2)] ?? 0;

    let paragraphBuf: string[] = [];
    let pendingFigures: string[] = [];
    let i = 0;
    const flushParagraph = () => {
      if (paragraphBuf.length > 0) {
        const joined = joinColumnProseLines(paragraphBuf);
        if (joined) {
          const noteMatch = joined.match(/^NOTE\s+([A-Z][\s\S]*)$/);
          blocks.push(noteMatch?.[1] ? `> **NOTE:** ${noteMatch[1]}` : joined);
        }
        paragraphBuf = [];
      }
      if (pendingFigures.length > 0) {
        blocks.push(...pendingFigures);
        pendingFigures = [];
      }
    };

    while (i < lines.length) {
      const rawLine = lines[i] ?? "";
      const trimmed = rawLine.trim();
      const figHere = figuresByLine.get(i);
      if (figHere) pendingFigures.push(figHere);

      if (!trimmed || (/^\d{1,4}$/.test(trimmed) && i >= lines.length - 2)) {
        flushParagraph();
        i++;
        continue;
      }

      if (
        pageIdx > 0 &&
        i === 0 &&
        (/^\d+\s*[|❘]\s*.+$/.test(trimmed) || /^.+?\s*[|❘]\s*\d+$/.test(trimmed))
      ) {
        i++;
        continue;
      }

      if (isCleanAsciiCodeLine(trimmed)) {
        flushParagraph();
        const codeLines: string[] = [];
        while (i < lines.length && isCleanAsciiCodeLine((lines[i] ?? "").trim())) {
          codeLines.push((lines[i] ?? "").trim());
          i++;
        }
        blocks.push(`\`\`\`python\n${codeLines.join("\n")}\n\`\`\``);
        continue;
      }

      const bulletMatch = trimmed.match(/^[➤•▪▸]\s+(.+)$/);
      if (bulletMatch?.[1]) {
        flushParagraph();
        const bulletItems: string[] = [];
        while (i < lines.length) {
          const bLine = (lines[i] ?? "").trim();
          const bMatch = bLine.match(/^[➤•▪▸]\s+(.+)$/);
          if (!bMatch?.[1]) break;
          const bLead = (lines[i] ?? "").search(/\S/);
          const itemLines = [bMatch[1].trim()];
          i++;
          while (i < lines.length) {
            const nextRaw = lines[i] ?? "";
            const nextTrim = nextRaw.trim();
            const nextLead = nextRaw.search(/\S/);
            if (!nextTrim || /^[➤•▪▸]\s/.test(nextTrim) || nextLead <= bLead) break;
            itemLines.push(nextTrim);
            i++;
          }
          bulletItems.push(`- ${joinColumnProseLines(itemLines)}`);
        }
        const prevBlock = blocks[blocks.length - 1];
        if (prevBlock?.startsWith("- ")) {
          blocks[blocks.length - 1] = `${prevBlock}\n${bulletItems.join("\n")}`;
        } else {
          blocks.push(bulletItems.join("\n"));
        }
        continue;
      }

      if (enableTable) {
        const colStarts = findColumnStarts(rawLine);
        const headerCells = trimmed.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
        if (
          colStarts.length >= 2 &&
          headerCells.length === colStarts.length &&
          headerCells.every((c) => c.length <= 40 && !c.startsWith("#") && !/^[➤•▪▸]/.test(c))
        ) {
          let cursor = i + 1;
          const rows: string[][] = [];
          while (cursor < lines.length) {
            const candidate = lines[cursor] ?? "";
            const candidateTrimmed = candidate.trim();
            if (!candidateTrimmed) {
              const nextCandidate = lines[cursor + 1] ?? "";
              const nextCells = nextCandidate.trim()
                ? splitRowByColumns(nextCandidate, colStarts)
                : null;
              if (nextCells && nextCells.length === headerCells.length) {
                cursor++;
                continue;
              }
              break;
            }
            if (/^\d{1,4}$/.test(candidateTrimmed) && cursor >= lines.length - 2) break;
            const cells = splitRowByColumns(candidate, colStarts);
            if (!cells || cells.length !== headerCells.length) break;
            rows.push(cells);
            cursor++;
          }
          if (rows.length >= 2) {
            flushParagraph();
            const mdHeader = `| ${headerCells.join(" | ")} |`;
            const mdSep = `| ${headerCells.map(() => "---").join(" | ")} |`;
            const mdRows = rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`);
            blocks.push([mdHeader, mdSep, ...mdRows].join("\n"));
            i = cursor;
            continue;
          }
        }
      }

      const leadIndent = Math.max(0, rawLine.search(/\S/));
      const heading = isLikelyHeadingLine(trimmed, leadIndent, bodyIndent);
      if (heading && (paragraphBuf.length === 0 || leadIndent < bodyIndent)) {
        flushParagraph();
        blocks.push(`${"#".repeat(heading.level)} ${heading.text}`);
        i++;
        continue;
      }

      paragraphBuf.push(trimmed);
      if (/[.!?。！？]["'”’)]*$/.test(trimmed) && rawLine.trimEnd().length < 82) {
        flushParagraph();
      }
      i++;
    }
    flushParagraph();
  }
  return `${blocks.join("\n\n").trim()}\n`;
}
