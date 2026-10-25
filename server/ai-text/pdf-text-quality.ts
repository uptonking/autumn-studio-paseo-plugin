// Text-quality heuristics shared by the PDF layout formatting pipeline:
// garbled/detected-embedded-text detection, ligature normalization, and
// clean-ASCII code block extraction.

export const COMPOUND_HYPHEN_PREFIXES = new Set([
  'north',
  'south',
  'east',
  'west',
  'carrier',
  'battle',
  'pattern',
  'high',
  'low',
  'near',
  'second',
  'third',
  'first',
  'well',
  'self',
  'time',
  'hard',
  'non',
  'anti',
  'counter',
  'cross',
  'mid',
  'multi',
  'over',
  'post',
  'pre',
  'semi',
  'sub',
  'super',
  'trans',
  'ultra',
  'under',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'half',
  'full',
  'all',
  'co',
  'ex',
  'general',
  'operation',
  'conflict',
  'trade',
  'grow',
  'user',
  'standards',
  'built',
  'client',
  'server',
  'object',
  'real',
  'read',
  'open',
  'long',
  'inter',
]);

export const TITLE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

export function normalizePdfLigatures(text: string): string {
  return text
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl');
}

export function isGarbledPdfText(text: string): boolean {
  const nonSpace = text.replace(/\s+/g, '');
  if (nonSpace.length === 0) return true;
  const count =
    nonSpace.match(/[\u0300-\u036F\u0460-\u1FFF\uA000-\uABFF\uFFF0-\uFFFF]/g)?.length ?? 0;
  return count >= 8 && count / nonSpace.length >= 0.06;
}

export function isDefectiveEmbeddedPdfText(rawText: string, fileName: string): boolean {
  if (isGarbledPdfText(rawText)) return true;
  if (/[\u4e00-\u9fff]/.test(fileName)) {
    return (rawText.match(/[\u4e00-\u9fff]/g) ?? []).length < 15;
  }
  return false;
}

export function isCleanAsciiCodeLine(trimmed: string): boolean {
  if (!trimmed || !/^[\x20-\x7E]+$/.test(trimmed)) return false;
  if (/^bool\s*\(/i.test(trimmed) || /#(?:True|False)\b/.test(trimmed)) return true;
  if (/^[a-zA-Z_]\w*\s*=\s*(?:None|True|False|\d+|['"[\]{}])/i.test(trimmed)) return true;
  return /^\d+\s*[<>!=]=?\s*\d+\s+(?:and|or)\s+\d+/i.test(trimmed);
}

export function extractCleanCodeBlocksFromPdfText(rawText: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };
  for (const line of rawText.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (isCleanAsciiCodeLine(trimmed)) current.push(trimmed);
    else flush();
  }
  flush();
  return blocks;
}
