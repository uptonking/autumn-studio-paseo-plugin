import { z } from "zod";
import type { AiTextEngineOperation } from "./engines.ts";
import { aiTextDocumentMetadataSchema, aiTextVersionRecordSchema } from "./settings.ts";

export const aiTextTaskKindSchema = z.enum(["parse", "engine.operation"]);
export type AiTextTaskKind = z.infer<typeof aiTextTaskKindSchema>;

export const aiTextTaskStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AiTextTaskStatus = z.infer<typeof aiTextTaskStatusSchema>;

export const aiTextEngineComponentStatusSchema = z.enum([
  "ready",
  "missing",
  "outdated",
  "unknown",
]);
export type AiTextEngineComponentStatus = z.infer<
  typeof aiTextEngineComponentStatusSchema
>;

export const aiTextEngineComponentSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: aiTextEngineComponentStatusSchema,
  version: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
});
export type AiTextEngineComponent = z.infer<
  typeof aiTextEngineComponentSchema
>;

export const aiTextEngineRouteStatusValueSchema = z.enum([
  "ready",
  "needs-setup",
  "unavailable",
  "unknown",
]);
export type AiTextEngineRouteStatusValue = z.infer<
  typeof aiTextEngineRouteStatusValueSchema
>;

export const aiTextEngineRouteStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: aiTextEngineRouteStatusValueSchema,
  message: z.string().nullable().default(null),
});
export type AiTextEngineRouteStatus = z.infer<
  typeof aiTextEngineRouteStatusSchema
>;

export const aiTextEngineEnvironmentStatusSchema = z.enum([
  "ready",
  "needs-setup",
  "unavailable",
  "unknown",
]);
export type AiTextEngineEnvironmentStatus = z.infer<
  typeof aiTextEngineEnvironmentStatusSchema
>;

/** On-disk footprint of an engine install, for the card's storage rows. */
export const aiTextEngineStorageSchema = z.object({
  /** Bytes under the uv tool directory; null when not uv-installed. */
  engineBytes: z.number().nullable().default(null),
  enginePath: z.string().nullable().default(null),
  /** Bytes of downloaded model caches; null when no cache was found. */
  modelBytes: z.number().nullable().default(null),
  modelPath: z.string().nullable().default(null),
});
export type AiTextEngineStorage = z.infer<typeof aiTextEngineStorageSchema>;

/** One detection snapshot; every engine reports the same shape. */
export const aiTextEngineEnvironmentSchema = z.object({
  engineId: z.string(),
  checkedAt: z.string(),
  status: aiTextEngineEnvironmentStatusSchema,
  version: z.string().nullable().default(null),
  /** Newest release on the configured package index, when the check succeeded. */
  latestVersion: z.string().nullable().default(null),
  updateAvailable: z.boolean().default(false),
  storage: aiTextEngineStorageSchema.nullable().default(null),
  routes: z.array(aiTextEngineRouteStatusSchema).default([]),
  components: z.array(aiTextEngineComponentSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  /** Engine-specific scalar facts for the card (model path, tier, ...). */
  details: z.record(z.string(), z.string()).default({}),
});
export type AiTextEngineEnvironment = z.infer<
  typeof aiTextEngineEnvironmentSchema
>;

/**
 * Evaluates an operation's `showWhen` condition against a detection snapshot
 * so the engine card only offers actions that make sense right now
 * (Update only when a newer release exists, Uninstall only when installed).
 */
export function isAiTextEngineOperationVisible(
  operation: AiTextEngineOperation,
  environment: AiTextEngineEnvironment | null,
): boolean {
  switch (operation.showWhen) {
    case "installed":
      return environment?.version != null;
    case "not-installed":
      return environment == null || environment.version == null;
    case "update-available":
      return environment?.updateAvailable === true;
    case "models-present":
      return (environment?.storage?.modelBytes ?? 0) > 0;
    default:
      return true;
  }
}

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
  profileId: z.string().nullable().optional(),
  profileName: z.string().nullable().optional(),
  engineId: z.string().nullable().optional(),
  operationId: z.string().nullable().optional(),
  /** Fill this after the operation engine finishes detection. */
  engineIds: z.array(z.string()).optional(),
  parseResult: parseTaskResultSchema.nullable().optional(),
  environment: aiTextEngineEnvironmentSchema.nullable().optional(),
});
export type AiTextTaskSnapshot = z.infer<typeof aiTextTaskSnapshotSchema>;
