// Column slicing for two-column PDF pages: turns per-column raw lines into
// structured blocks (headings, figure captions, paragraphs).

import { COMPOUND_HYPHEN_PREFIXES } from './pdf-text-quality.ts';

interface LineSegment {
  start: number;
  end: number;
  text: string;
}

export function extractLineSegments(line: string): LineSegment[] {
  const segs: LineSegment[] = [];
  for (const m of line.matchAll(/\S+(?:\s{1,2}\S+)*/g)) {
    const start = m.index ?? 0;
    segs.push({ start, end: start + m[0].length, text: m[0] });
  }
  return segs;
}

export function joinColumnProseLines(lines: readonly string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const hyphenMatch = out.match(/([A-Za-z0-9]{2,})-$/);
    const nextWordMatch = line.match(/^([a-z]{2,})\b/);
    if (hyphenMatch?.[1] && nextWordMatch?.[1]) {
      const prefix = hyphenMatch[1];
      const lowerPrefix = prefix.toLowerCase();
      const nextWord = nextWordMatch[1].toLowerCase();
      const isCompound =
        /^[A-Z0-9]{2,}$/.test(prefix) ||
        /Script$/i.test(prefix) ||
        (COMPOUND_HYPHEN_PREFIXES.has(lowerPrefix) &&
          !(lowerPrefix === 'counter' && nextWord === 'example')) ||
        (lowerPrefix === 're' && /^[ae]/.test(nextWord));
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
  if (
    /^(ABSTRACT|INTRODUCTION|CONCLUSION|CONCLUSIONS|REFERENCES|ACKNOWLEDGMENTS|ACKNOWLEDGEMENTS)$/i.test(
      trimmed,
    )
  ) {
    return { level: 2, text: trimmed.toUpperCase() };
  }
  const secMatch = trimmed.match(/^(\d+)\s+([A-Z][A-Z0-9\s:,-]{2,60})$/);
  if (secMatch?.[1] && secMatch[2]) {
    return {
      level: 2,
      text: `${secMatch[1]} ${secMatch[2].replace(/\s+/g, ' ').trim()}`,
    };
  }
  const subSecMatch = trimmed.match(/^(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z0-9\s:,-]{2,70})$/);
  if (subSecMatch?.[1] && subSecMatch[2] && !/[.;]$/.test(trimmed)) {
    return {
      level: 3,
      text: `${subSecMatch[1]} ${subSecMatch[2].replace(/\s+/g, ' ').trim()}`,
    };
  }
  return null;
}

export interface SlicedColLine {
  indent: number;
  text: string;
  width: number;
}

export interface ColumnBlock {
  kind: 'heading' | 'figure' | 'paragraph';
  text: string;
  startsIndented: boolean;
  endsFullWidth: boolean;
}

export function parseSlicedColumn(colLines: readonly SlicedColLine[]): ColumnBlock[] {
  const blocks: ColumnBlock[] = [];
  let startIdx = 0;

  let figCaptionIdx = -1;
  for (let i = 0; i < Math.min(55, colLines.length); i++) {
    if (/^(Figure|Fig\.)\s+\d+\s*[:.]/i.test(colLines[i].text)) {
      figCaptionIdx = i;
      break;
    }
  }
  if (figCaptionIdx >= 0) {
    const preLines = colLines.slice(0, figCaptionIdx).filter((l) => l.text.length > 0);
    if (!preLines.some((l) => matchAcademicHeading(l.text) !== null)) {
      const subCaptions = preLines
        .map((l) => l.text.replace(/\s+/g, ' ').trim())
        .filter((t) => /^\(?[a-z]\)\s+[A-Z]/.test(t) || /^Subscripts denote\b/i.test(t));
      const figCaption = colLines[figCaptionIdx].text.replace(/\s+/g, ' ').trim();
      const quoteLines = [`> **${figCaption}**`, ...subCaptions.map((s) => `> - ${s}`)];
      blocks.push({
        kind: 'figure',
        text: quoteLines.join('\n'),
        startsIndented: false,
        endsFullWidth: false,
      });
      startIdx = figCaptionIdx + 1;
    }
  }

  const nonEmptyWidths = colLines
    .slice(startIdx)
    .map((l) => l.width)
    .filter((w) => w >= 35)
    .sort((a, b) => a - b);
  const fullWidthRef = nonEmptyWidths[Math.floor(nonEmptyWidths.length * 0.7)] ?? 64;

  let paraLines: string[] = [];
  let paraStartsIndented = false;
  let lastLineWidth = 0;
  let lastLineText = '';
  let sawBlankLine = false;

  const flushPara = () => {
    if (paraLines.length > 0) {
      const joined = joinColumnProseLines(paraLines);
      if (joined) {
        blocks.push({
          kind: 'paragraph',
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
    const item = colLines[i];
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
      blocks.push({
        kind: 'heading',
        text: `${'#'.repeat(heading.level)} ${heading.text}`,
        startsIndented: false,
        endsFullWidth: false,
      });
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
