import {
  aiTextLayoutBlockSchema,
  aiTextLayoutBlockTypeSchema,
  aiTextLayoutDocumentSchema,
  type AiTextLayoutBlock,
  type AiTextLayoutBlockType,
  type AiTextLayoutDocument,
  type AiTextLayoutSource,
} from "../../shared/ai-text-layout.ts";

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(asFiniteNumber);
  if (numbers.some((n) => n === null)) return null;
  const [x0, y0, x1, y1] = numbers as number[];
  const bbox: [number, number, number, number] = [
    clampUnit(x0),
    clampUnit(y0),
    clampUnit(x1),
    clampUnit(y1),
  ];
  if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return null;
  return bbox;
}

function normalizeAssetPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normalized || normalized.startsWith("/")) return undefined;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return undefined;
  }
  if (segments[0] !== "images") return undefined;
  return normalized;
}

function flattenInlineContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenInlineContent(item).trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (isRecord(value)) {
    if (typeof value.content === "string") return value.content;
    if (value.content !== undefined) return flattenInlineContent(value.content);
  }
  return "";
}

function stripHtmlForPreview(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function getChildBlocks(block: JsonRecord): JsonRecord[] {
  if (!Array.isArray(block.content)) return [];
  return block.content.filter(isRecord);
}

function findVisualBody(block: JsonRecord): JsonRecord | null {
  const children = getChildBlocks(block);
  const expectedType =
    block.type === "image"
      ? "image_body"
      : block.type === "table"
        ? "table_body"
        : block.type === "chart"
          ? "chart_body"
          : block.type === "code"
            ? "code_body"
            : null;
  if (!expectedType) return null;
  return children.find((child) => child.type === expectedType) ?? null;
}

function readBlockText(block: JsonRecord): string {
  const body = findVisualBody(block);
  const children = getChildBlocks(block);
  const nonBodyChildren = body
    ? children.filter((child) => child !== body)
    : children;

  if (block.type === "list") {
    return nonBodyChildren
      .map((child) => flattenInlineContent(child.content))
      .filter(Boolean)
      .join("\n");
  }

  if (body) {
    const bodyContent =
      typeof body.content === "string"
        ? body.content
        : flattenInlineContent(body.content);
    if (block.type === "table" || block.type === "chart") {
      const captions = nonBodyChildren
        .map((child) => flattenInlineContent(child.content))
        .filter(Boolean)
        .join(" ");
      const tableText = stripHtmlForPreview(bodyContent);
      return [tableText, captions].filter(Boolean).join("\n").trim();
    }
    if (block.type === "code") {
      return bodyContent.trim();
    }
    return nonBodyChildren
      .map((child) => flattenInlineContent(child.content))
      .filter(Boolean)
      .join(" ");
  }

  return flattenInlineContent(block.content).trim();
}

function readBlockHtml(block: JsonRecord, body: JsonRecord | null): string | undefined {
  if (!body || typeof body.content !== "string") return undefined;
  if (block.type === "table") return body.content;
  if (block.type === "code") return body.content;
  return undefined;
}

function readBlockImagePath(
  block: JsonRecord,
  body: JsonRecord | null,
): string | undefined {
  return (
    normalizeAssetPath(body?.image_path) ??
    normalizeAssetPath(block.image_path)
  );
}

function readBlockLevel(block: JsonRecord): number | undefined {
  const level = asFiniteNumber(block.level);
  if (level === null || level < 1 || level > 6) return undefined;
  return Math.round(level);
}

function readBlockConfidence(block: JsonRecord): number | undefined {
  for (const key of ["confidence", "score", "probability"]) {
    const value = asFiniteNumber(block[key]);
    if (value !== null && value >= 0 && value <= 1) return value;
  }
  return undefined;
}

function readBlockType(value: unknown): AiTextLayoutBlockType {
  const parsed = aiTextLayoutBlockTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

function normalizeTopLevelBlock(input: {
  block: JsonRecord;
  pageNumber: number;
  index: number;
}): AiTextLayoutBlock | null {
  const bbox = normalizeBbox(input.block.bbox);
  if (!bbox) return null;
  const body = findVisualBody(input.block);
  const type = readBlockType(input.block.type);
  const html = readBlockHtml(input.block, body);
  const level = readBlockLevel(input.block);
  const imagePath = readBlockImagePath(input.block, body);
  const confidence = readBlockConfidence(input.block);
  const block = {
    id: `p${input.pageNumber}-b${input.index}`,
    pageNumber: input.pageNumber,
    type,
    bbox,
    text: readBlockText(input.block),
    ...(html ? { html } : {}),
    ...(level !== undefined ? { level } : {}),
    ...(imagePath ? { imagePath } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
  const parsed = aiTextLayoutBlockSchema.safeParse(block);
  return parsed.success ? parsed.data : null;
}

/**
 * Converts MinerU 4 `middle_json.json` into the flat, normalized layout
 * document used by the Blocks panel and the PDF overlay. Nested body blocks
 * are folded into their parent; blocks without usable geometry are skipped.
 */
export function normalizeMineruMiddleJson(input: {
  middleJson: unknown;
  source: AiTextLayoutSource;
  parserId: string;
  producedAt?: string;
}): AiTextLayoutDocument | null {
  if (!isRecord(input.middleJson)) return null;
  const pages = input.middleJson.pages;
  if (!Array.isArray(pages)) return null;

  const blocks: AiTextLayoutBlock[] = [];
  const counters = new Map<number, number>();
  for (const page of pages) {
    if (!isRecord(page)) continue;
    const pageIdx = asFiniteNumber(page.page_idx);
    if (pageIdx === null || pageIdx < 0) continue;
    const pageNumber = Math.floor(pageIdx) + 1;
    if (!Array.isArray(page.blocks)) continue;
    for (const rawBlock of page.blocks) {
      if (!isRecord(rawBlock)) continue;
      const normalized = normalizeTopLevelBlock({
        block: rawBlock,
        pageNumber,
        index: counters.get(pageNumber) ?? 0,
      });
      if (!normalized) continue;
      counters.set(pageNumber, (counters.get(pageNumber) ?? 0) + 1);
      blocks.push(normalized);
    }
  }

  if (blocks.length === 0) return null;

  blocks.sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.bbox[1] - b.bbox[1] ||
      a.bbox[0] - b.bbox[0],
  );

  const pageNumbers = new Set(blocks.map((block) => block.pageNumber));
  const maxPageNumber = blocks.reduce(
    (max, block) => Math.max(max, block.pageNumber),
    0,
  );
  // `pages` also counts parsed pages with no extractable blocks, which the
  // blocks list cannot see.
  const pageCount = Math.max(pages.length, maxPageNumber, pageNumbers.size);
  const document = {
    schemaVersion: 1 as const,
    source: input.source,
    parserId: input.parserId,
    producedAt: input.producedAt ?? new Date().toISOString(),
    pageCount,
    blockCount: blocks.length,
    blocks,
  };
  const parsed = aiTextLayoutDocumentSchema.safeParse(document);
  return parsed.success ? parsed.data : null;
}
