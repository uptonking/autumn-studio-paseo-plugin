import { z } from "zod";

/**
 * Top-level block types emitted by MinerU 4 `middle_json`. Nested body blocks
 * (`image_body`, `table_body`, ...) are folded into their parent before this
 * schema is used, so they are not listed here.
 */
export const AI_TEXT_LAYOUT_BLOCK_TYPES = [
  "image",
  "table",
  "chart",
  "text",
  "equation",
  "list",
  "index",
  "code",
  "ref_text",
  "header",
  "footer",
  "page_number",
  "aside_text",
  "page_footnote",
  "doc_title",
  "paragraph_title",
  "unknown",
] as const;

export const aiTextLayoutBlockTypeSchema = z.enum(
  AI_TEXT_LAYOUT_BLOCK_TYPES
);
export type AiTextLayoutBlockType = z.infer<
  typeof aiTextLayoutBlockTypeSchema
>;

/** Page furniture that the Blocks panel can hide in one click. */
export const AI_TEXT_PAGE_FURNITURE_TYPES: ReadonlySet<AiTextLayoutBlockType> =
  new Set(["header", "footer", "page_number", "aside_text"]);

const normalizedCoordinateSchema = z.number().min(0).max(1);

export const aiTextLayoutBboxSchema = z.tuple([
  normalizedCoordinateSchema,
  normalizedCoordinateSchema,
  normalizedCoordinateSchema,
  normalizedCoordinateSchema,
]);
export type AiTextLayoutBbox = z.infer<typeof aiTextLayoutBboxSchema>;

export const aiTextLayoutBlockSchema = z.object({
  id: z.string(),
  /** 1-based page number. */
  pageNumber: z.number().int().min(1),
  type: aiTextLayoutBlockTypeSchema,
  /** Normalized [x0, y0, x1, y1] with a top-left origin. */
  bbox: aiTextLayoutBboxSchema,
  text: z.string().default(""),
  /** `table_body` HTML or `code_body` source. */
  html: z.string().optional(),
  level: z.number().int().min(1).max(6).optional(),
  /** Version-relative asset path such as `images/abc.jpg`. */
  imagePath: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type AiTextLayoutBlock = z.infer<typeof aiTextLayoutBlockSchema>;

export const aiTextLayoutSourceSchema = z.enum([
  "mineru-kit",
  "mineru-local-api",
  "mineru-cloud",
]);
export type AiTextLayoutSource = z.infer<typeof aiTextLayoutSourceSchema>;

export const aiTextLayoutDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  source: aiTextLayoutSourceSchema,
  parserId: z.string(),
  producedAt: z.string(),
  pageCount: z.number().int().min(0),
  blockCount: z.number().int().min(0),
  blocks: z.array(aiTextLayoutBlockSchema),
});
export type AiTextLayoutDocument = z.infer<
  typeof aiTextLayoutDocumentSchema
>;

export const aiTextVersionLayoutRefSchema = z.object({
  fileName: z.string(),
  relPath: z.string(),
  blockCount: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  source: aiTextLayoutSourceSchema,
});
export type AiTextVersionLayoutRef = z.infer<
  typeof aiTextVersionLayoutRefSchema
>;

export const aiTextVersionAssetsRefSchema = z.object({
  dirName: z.string(),
  imageCount: z.number().int().min(0),
  totalBytes: z.number().int().min(0),
});
export type AiTextVersionAssetsRef = z.infer<
  typeof aiTextVersionAssetsRefSchema
>;

export const AI_TEXT_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export function isAiTextPageFurniture(
  type: AiTextLayoutBlockType
): boolean {
  return AI_TEXT_PAGE_FURNITURE_TYPES.has(type);
}

/**
 * Returns the normalized rectangle as percentage units for the PDF overlay
 * and `scrollToPageArea`.
 */
export function layoutBlockToArea(block: AiTextLayoutBlock): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const [x0, y0, x1, y1] = block.bbox;
  return {
    top: y0 * 100,
    left: x0 * 100,
    width: Math.max(0, x1 - x0) * 100,
    height: Math.max(0, y1 - y0) * 100,
  };
}
