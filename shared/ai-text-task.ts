import { z } from "zod";
import {
  aiTextDocumentMetadataSchema,
  aiTextVersionRecordSchema,
} from "./ai-text-settings.ts";

export const aiTextTaskKindSchema = z.enum([
  "parse",
  "models.download",
  "cli.reinstall",
]);
export type AiTextTaskKind = z.infer<typeof aiTextTaskKindSchema>;

export const aiTextTaskStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AiTextTaskStatus = z.infer<typeof aiTextTaskStatusSchema>;

export const aiTextCliKindSchema = z.enum([
  "mineru-kit",
  "mineru-doclib",
  "mineru-legacy",
  "uv",
  "unknown",
]);
export type AiTextCliKind = z.infer<typeof aiTextCliKindSchema>;

export const aiTextCliInfoSchema = z.object({
  command: z.string(),
  resolvedPath: z.string().nullable(),
  available: z.boolean(),
  version: z.string().nullable(),
  pythonVersion: z.string().nullable(),
  kind: aiTextCliKindSchema,
});
export type AiTextCliInfo = z.infer<typeof aiTextCliInfoSchema>;

export const aiTextModelRepoStatusSchema = z.object({
  name: z.string(),
  ready: z.boolean(),
  path: z.string().nullable(),
  missingPaths: z.array(z.string()),
});
export type AiTextModelRepoStatus = z.infer<
  typeof aiTextModelRepoStatusSchema
>;

export const aiTextModelsInfoSchema = z.object({
  baseDir: z.string().nullable(),
  tier: z.string(),
  tierReady: z.boolean(),
  source: z.string().nullable(),
  smallBackend: z.string().nullable(),
  vlmEngine: z.string().nullable(),
  repos: z.array(aiTextModelRepoStatusSchema),
});
export type AiTextModelsInfo = z.infer<typeof aiTextModelsInfoSchema>;

export const aiTextLocalApiInfoSchema = z.object({
  url: z.string(),
  reachable: z.boolean(),
  version: z.string().nullable(),
  tiers: z.array(z.string()),
});
export type AiTextLocalApiInfo = z.infer<typeof aiTextLocalApiInfoSchema>;

export const aiTextInstallKindSchema = z.enum(["uv-tool", "pip", "unknown"]);
export type AiTextInstallKind = z.infer<typeof aiTextInstallKindSchema>;

export const aiTextEnvironmentSchema = z.object({
  checkedAt: z.string(),
  os: z.string(),
  arch: z.string(),
  kit: aiTextCliInfoSchema.nullable(),
  mineru: aiTextCliInfoSchema.nullable(),
  uv: aiTextCliInfoSchema.nullable(),
  models: aiTextModelsInfoSchema.nullable(),
  localApi: aiTextLocalApiInfoSchema.nullable(),
  installKind: aiTextInstallKindSchema,
  recommendations: z.array(z.string()),
});
export type AiTextEnvironment = z.infer<typeof aiTextEnvironmentSchema>;

const parseTaskResultSchema = z.object({
  metadata: aiTextDocumentMetadataSchema,
  newVersion: aiTextVersionRecordSchema,
  content: z.string(),
});

export const aiTextTaskSnapshotSchema = z.object({
  id: z.string(),
  kind: aiTextTaskKindSchema,
  status: aiTextTaskStatusSchema,
  /** Short human-readable phase such as "Parsing pages". */
  phase: z.string(),
  message: z.string(),
  progressPercent: z.number().min(0).max(100).nullable(),
  logTail: z.array(z.string()),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  elapsedMs: z.number().min(0),
  error: z.string().nullable(),
  parseResult: parseTaskResultSchema.nullable().optional(),
  environment: aiTextEnvironmentSchema.nullable().optional(),
});
export type AiTextTaskSnapshot = z.infer<typeof aiTextTaskSnapshotSchema>;
