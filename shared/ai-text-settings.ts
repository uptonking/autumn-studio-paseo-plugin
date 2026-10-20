import { z } from "zod";

export const aiTextParserProviderIdSchema = z.enum([
  "mineru",
  "agent-vlm",
  "llamaparse",
  "azure-document-intelligence",
  "datalab",
]);
export type AiTextParserProviderId = z.infer<
  typeof aiTextParserProviderIdSchema
>;

export const externalParserConfigSchema = z.object({
  apiKey: z.string().default(""),
  endpointUrl: z.string().default(""),
});
export type ExternalParserConfig = z.infer<typeof externalParserConfigSchema>;

export function getExternalParserConfig(
  settings: AiTextSettings,
  parserId: AiTextParserProviderId,
): ExternalParserConfig {
  const raw = settings.parsers?.[parserId];
  const parsed = externalParserConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { apiKey: "", endpointUrl: "" };
}

export const mineruExecutionModeSchema = z.enum([
  "cloud-free",
  "cloud-token",
  "local-cli",
]);
export type MineruExecutionMode = z.infer<typeof mineruExecutionModeSchema>;

export const mineruSettingsSchema = z.object({
  mode: mineruExecutionModeSchema.default("cloud-free"),
  apiBaseUrl: z.string().default("https://mineru.net"),
  apiToken: z.string().default(""),
  cliCommand: z.string().default("mineru"),
  enableOcr: z.boolean().default(true),
  enableFormula: z.boolean().default(true),
  enableTable: z.boolean().default(true),
  language: z.string().default("auto"),
});
export type MineruSettings = z.infer<typeof mineruSettingsSchema>;

export const DEFAULT_MINERU_SETTINGS: MineruSettings = {
  mode: "cloud-free",
  apiBaseUrl: "https://mineru.net",
  apiToken: "",
  cliCommand: "mineru",
  enableOcr: true,
  enableFormula: true,
  enableTable: true,
  language: "auto",
};

export const aiTextSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  openSplitViewByDefault: z.boolean().default(false),
  defaultAgent: z.string().default("pi"),
  useAgentRefinement: z.boolean().default(true),
  defaultParser: aiTextParserProviderIdSchema.default("mineru"),
  outputRootDir: z.string().default(".autumn"),
  mineru: mineruSettingsSchema.default(DEFAULT_MINERU_SETTINGS),
  parsers: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});
export type AiTextSettings = z.infer<typeof aiTextSettingsSchema>;

export const DEFAULT_AI_TEXT_SETTINGS: AiTextSettings = {
  enabled: true,
  openSplitViewByDefault: false,
  defaultAgent: "pi",
  useAgentRefinement: true,
  defaultParser: "mineru",
  outputRootDir: ".autumn",
  mineru: DEFAULT_MINERU_SETTINGS,
  parsers: {},
};

export const aiTextVersionProvenanceSchema = z.object({
  parserId: aiTextParserProviderIdSchema,
  parserLabel: z.string(),
  parserMode: z.string().optional(),
  agentId: z.string(),
  agentModel: z.string().optional(),
  usedAgentRefinement: z.boolean(),
  ocrEnabled: z.boolean().optional(),
  formulaEnabled: z.boolean().optional(),
  tableEnabled: z.boolean().optional(),
  language: z.string().optional(),
  lineCount: z.number().int().min(0).optional(),
  headingCount: z.number().int().min(0).optional(),
  tableCount: z.number().int().min(0).optional(),
  codeBlockCount: z.number().int().min(0).optional(),
});
export type AiTextVersionProvenance = z.infer<
  typeof aiTextVersionProvenanceSchema
>;

export function computeMarkdownStructureStats(markdown: string): {
  lineCount: number;
  headingCount: number;
  tableCount: number;
  codeBlockCount: number;
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let headingCount = 0;
  let tableCount = 0;
  let fenceMarkers = 0;
  let inCode = false;
  let inTable = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      fenceMarkers++;
      inCode = !inCode;
      inTable = false;
      continue;
    }
    if (inCode) continue;
    if (/^#{1,6}\s+\S/.test(trimmed)) {
      headingCount++;
      inTable = false;
    } else if (/^\|.+\|$/.test(trimmed)) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }

  return {
    lineCount: lines.length,
    headingCount,
    tableCount,
    codeBlockCount: Math.floor(fenceMarkers / 2),
  };
}

export const aiTextVersionRecordSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int().min(1),
  fileName: z.string(),
  relPath: z.string(),
  createdAt: z.string(),
  durationMs: z.number().min(0),
  size: z.number().min(0),
  sourceSize: z.number().min(0),
  sourceMtimeMs: z.number(),
  provenance: aiTextVersionProvenanceSchema,
});
export type AiTextVersionRecord = z.infer<typeof aiTextVersionRecordSchema>;

export const aiTextDocumentMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  sourceRelPath: z.string(),
  sourceFileName: z.string(),
  formatKind: z.string(),
  docFolderRelPath: z.string(),
  activeVersionId: z.string().nullable(),
  versions: z.array(aiTextVersionRecordSchema),
});
export type AiTextDocumentMetadata = z.infer<
  typeof aiTextDocumentMetadataSchema
>;

export const aiTextAgentOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  available: z.boolean(),
  isDefault: z.boolean().optional(),
  defaultModel: z.string().optional(),
});
export type AiTextAgentOption = z.infer<typeof aiTextAgentOptionSchema>;

export interface AiTextParserDescriptor {
  id: AiTextParserProviderId;
  label: string;
  description: string;
  isDefault?: boolean;
  isBuiltinReady: boolean;
  supportedFormats: readonly string[];
}

export const AI_TEXT_PARSER_CATALOG: readonly AiTextParserDescriptor[] = [
  {
    id: "mineru",
    label: "MinerU (Free Default)",
    description:
      "High-accuracy PDF/document extraction with OCR, formula, and table structure recognition via MinerU Cloud API or local CLI.",
    isDefault: true,
    isBuiltinReady: true,
    supportedFormats: ["pdf", "docx", "html"],
  },
  {
    id: "agent-vlm",
    label: "Agent VLM / OCR Direct",
    description:
      "Uses the selected Paseo coding agent and its VLM/document tools directly to extract structured Markdown.",
    isBuiltinReady: true,
    supportedFormats: ["pdf", "docx", "html"],
  },
  {
    id: "llamaparse",
    label: "LlamaParse",
    description:
      "LlamaCloud document parsing API for PDF and Office documents.",
    isBuiltinReady: false,
    supportedFormats: ["pdf", "docx", "pptx"],
  },
  {
    id: "azure-document-intelligence",
    label: "Azure Document Intelligence",
    description:
      "Microsoft Azure Layout & Read OCR model for PDFs and scanned forms.",
    isBuiltinReady: false,
    supportedFormats: ["pdf", "docx"],
  },
  {
    id: "datalab",
    label: "Datalab Marker",
    description:
      "Datalab Marker API for converting PDFs and Office docs to Markdown.",
    isBuiltinReady: false,
    supportedFormats: ["pdf", "docx", "html"],
  },
];

/**
 * AI Text Mode is exposed for PDFs only for now. Server-side extraction still
 * supports DOCX/HTML through the parser catalog; widen these sets when the UI
 * is ready to show those formats again.
 */
const SUPPORTED_AI_TEXT_KINDS = new Set(["pdf"]);
const SUPPORTED_AI_TEXT_EXTENSIONS = new Set(["pdf"]);

export function isAiTextSupportedFormat(
  kind: string,
  fileNameOrPath?: string,
): boolean {
  if (SUPPORTED_AI_TEXT_KINDS.has(kind)) return true;
  if (!fileNameOrPath) return false;
  const clean = fileNameOrPath.trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return false;
  return SUPPORTED_AI_TEXT_EXTENSIONS.has(clean.slice(dot + 1));
}

export interface AiTextAutoOpenSplitInput {
  openSplitViewByDefault: boolean;
  metadata: AiTextDocumentMetadata | null;
  activeContent: string | null;
  filePath?: string;
  lastAutoOpenedFilePath?: string | null;
}

/**
 * Decides whether opening a document should land directly in the split view.
 * The last-opened guard keeps the setting from fighting a user who closes the
 * split manually: the metadata effect re-runs when settings change identity.
 */
export function shouldAutoOpenAiTextSplit({
  openSplitViewByDefault,
  metadata,
  activeContent,
  filePath,
  lastAutoOpenedFilePath,
}: AiTextAutoOpenSplitInput): boolean {
  if (!openSplitViewByDefault) return false;
  if (!filePath) return false;
  if (lastAutoOpenedFilePath === filePath) return false;
  if (!metadata || metadata.versions.length === 0) return false;
  return activeContent !== null;
}

/**
 * Converts a workspace-relative file path into a deterministic, collision-safe
 * subfolder slug inside `.autumn/`.
 * Examples:
 * - "report.pdf" -> "report.pdf"
 * - "docs/2026/report.pdf" -> "docs__2026__report.pdf"
 */
export function toAutumnDocFolderSlug(relPath: string): string {
  const normalized = relPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const safe = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^\p{L}\p{N}._-]/gu, "_"))
    .join("__");
  return safe || "document";
}
