import { z } from "zod";

/** MinerU v4 (`mineru-kit`) configuration. Tokens live in the profile. */
export const mineruConfigSchema = z.object({
  kitCommand: z.string().default("mineru-kit"),
  localApiUrl: z.string().default("http://127.0.0.1:8000"),
  apiBaseUrl: z.string().default("https://mineru.net"),
  apiToken: z.string().default(""),
  tier: z.enum(["flash", "basic", "standard", "advanced"]).default("standard"),
  ocrMode: z.enum(["auto", "txt", "ocr"]).default("auto"),
  remoteUrl: z.string().default(""),
  remoteApiKey: z.string().default(""),
  extraArgs: z.string().default(""),
});
export type MineruConfig = z.infer<typeof mineruConfigSchema>;

/** Docling 2.x configuration. */
export const doclingConfigSchema = z.object({
  doclingCommand: z.string().default("docling"),
  doclingToolsCommand: z.string().default("docling-tools"),
  artifactsPath: z.string().default(""),
  device: z.enum(["auto", "cpu", "cuda", "mps"]).default("auto"),
  /** 0 leaves `--num-threads` off so Docling chooses. */
  numThreads: z.number().int().min(0).max(128).default(0),
  /** Empty leaves `--ocr-engine` off so Docling chooses its platform default. */
  ocrEngine: z
    .enum(["", "easyocr", "tesserocr", "tesseract", "ocrmac", "rapidocr"])
    .default(""),
  /** Comma-separated language tags passed as repeated `--ocr-lang`. */
  ocrLangs: z.string().default(""),
  tableMode: z.enum(["accurate", "fast"]).default("accurate"),
  vlmModel: z.string().default("granite_docling"),
  extraArgs: z.string().default(""),
});
export type DoclingConfig = z.infer<typeof doclingConfigSchema>;

/** Local OCR has no install or model lifecycle; the config is a reserved bag. */
export const localOcrConfigSchema = z.object({
  extraArgs: z.string().default(""),
});
export type LocalOcrConfig = z.infer<typeof localOcrConfigSchema>;

const engineConfigSchemas: Record<string, z.ZodType> = {
  mineru: mineruConfigSchema,
  docling: doclingConfigSchema,
  "local-ocr": localOcrConfigSchema,
};

export function getEngineConfigSchema(
  engineId: string,
): z.ZodType | null {
  return engineConfigSchemas[engineId] ?? null;
}

/**
 * Fills defaults and drops unknown keys. Unknown engines keep their config so
 * a future registered engine does not lose its settings before registration.
 */
export function parseEngineConfig(
  engineId: string,
  config: unknown,
): Record<string, unknown> {
  const schema = getEngineConfigSchema(engineId);
  if (!schema) {
    return isPlainRecord(config) ? config : {};
  }
  const parsed = schema.safeParse(isPlainRecord(config) ? config : {});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}

/** Returns human-readable problems for the profile editor. */
export function validateEngineConfig(
  engineId: string,
  config: unknown,
): string[] {
  const schema = getEngineConfigSchema(engineId);
  if (!schema) return [];
  const parsed = schema.safeParse(isPlainRecord(config) ? config : {});
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const DEFAULT_MINERU_CONFIG: MineruConfig =
  mineruConfigSchema.parse({});
export const DEFAULT_DOCLING_CONFIG: DoclingConfig =
  doclingConfigSchema.parse({});
export const DEFAULT_LOCAL_OCR_CONFIG: LocalOcrConfig =
  localOcrConfigSchema.parse({});

/** Config with every default filled, used as descriptor `configDefaults`. */
export function engineConfigDefaults(
  engineId: string,
): Record<string, unknown> {
  const schema = getEngineConfigSchema(engineId);
  if (!schema) return {};
  const parsed = schema.safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}
