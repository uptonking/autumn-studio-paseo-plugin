import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  aiTextAgentOptionSchema,
  aiTextDocumentMetadataSchema,
  aiTextVersionRecordSchema,
} from "./ai-text/settings.ts";
import { aiTextLayoutDocumentSchema } from "./ai-text/layout.ts";
import { aiTextEngineDescriptorSchema } from "./ai-text/engines.ts";
import {
  aiTextEngineEnvironmentSchema,
  aiTextTaskKindSchema,
  aiTextTaskSnapshotSchema,
} from "./ai-text/task.ts";

/**
 * Workspace files as a nested tree. Folder paths carry a trailing slash
 * (root is "/"), file paths never do — the same convention extend-ui's
 * FileSystem manifest uses.
 *
 * The type is declared ahead of the schema: annotating the schema with
 * z.infer of itself is a circular reference under zod v4.
 */
export type FileNode =
  | { kind: "folder"; path: string; name: string; children: FileNode[] }
  | {
      kind: "file";
      path: string;
      name: string;
      size: number;
      mtime: number;
      contentType?: string;
    };

export const fileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("folder"),
      path: z.string(),
      name: z.string(),
      children: z.array(fileNodeSchema),
    }),
    z.object({
      kind: z.literal("file"),
      path: z.string(),
      name: z.string(),
      size: z.number(),
      mtime: z.number(),
      contentType: z.string().optional(),
    }),
  ])
);

export const getFileTree = defineRpc({
  name: "files.tree",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ tree: fileNodeSchema, truncated: z.boolean() }),
});

/** One file's bytes as a data URI. The client converts it to a blob URL. */
export const getFileContent = defineRpc({
  name: "file.content",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
  }),
  output: z.object({
    dataUri: z.string(),
    size: z.number().optional(),
    mtime: z.number().optional(),
  }),
});

/** Saves edited file content directly back to the workspace file system. */
export const saveFileContent = defineRpc({
  name: "file.save",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
    content: z.string(),
    encoding: z.enum(["base64", "utf8"]).default("base64"),
  }),
  output: z.object({
    path: z.string(),
    size: z.number(),
    mtime: z.number(),
  }),
});

/**
 * Maps an absolute host path (a native file tab's PluginFile.path) to its
 * workspace-relative form, using the same realpath containment discipline as
 * file.content. Null when the file lives outside the workspace — those files
 * still view and edit through the file handle, but workspace-keyed features
 * (AI Text, RPC save) do not apply to them.
 */
export const locateWorkspaceFile = defineRpc({
  name: "files.locate",
  input: z.object({
    workspaceId: z.string(),
    absPath: z.string(),
  }),
  output: z.object({
    relPath: z.string().nullable(),
  }),
});

/** Local pdfium.wasm binary bytes as a data URI for 100% offline PDF viewing. */
export const getPdfWasm = defineRpc({
  name: "files.pdf_wasm",
  input: z.object({}),
  output: z.object({ dataUri: z.string() }),
});

/** Local duke_sheets_wasm_bg.wasm binary bytes as a data URI for 100% offline Excel viewing/editing. */
export const getXlsxWasm = defineRpc({
  name: "files.xlsx_wasm",
  input: z.object({}),
  output: z.object({ dataUri: z.string() }),
});

/** Lists configured and auto-detected Paseo coding agents for AI Text Mode (with `pi` as default). */
export const listAiTextAgents = defineRpc({
  name: "ai_text.agents.list",
  input: z.object({
    workspaceId: z.string().optional(),
  }),
  output: z.object({
    agents: z.array(aiTextAgentOptionSchema),
  }),
});

/** Loads `.autumn/<doc-slug>/metadata.json` and the active extracted Markdown content for a file. */
export const getAiTextMetadata = defineRpc({
  name: "ai_text.metadata.get",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
  }),
  output: z.object({
    metadata: aiTextDocumentMetadataSchema.nullable(),
    activeContent: z.string().nullable(),
  }),
});

/**
 * Starts a long-running AI Text job. Parsing can take minutes when a local
 * model download or OCR pass is involved, so callers poll `task.get` instead of
 * holding one RPC open.
 */
export const startAiTextTask = defineRpc({
  name: "ai_text.task.start",
  input: z.object({
    /** Required for `parse`; optional for global operations started from settings. */
    workspaceId: z.string().optional(),
    relPath: z.string().optional(),
    kind: aiTextTaskKindSchema,
    /** Parse: profile to run. Omitted falls back to the default profile. */
    profileId: z.string().optional(),
    /** Engine operation target. */
    engineId: z.string().optional(),
    operationId: z.string().optional(),
    /** Engine config override for operations (defaults to the matching profile). */
    config: z.record(z.string(), z.unknown()).optional(),
    operationOptions: z.record(z.string(), z.string()).optional(),
  }),
  output: z.object({
    taskId: z.string(),
  }),
});

/** Registered extraction engines and their JSON-safe descriptors. */
export const listAiTextEngines = defineRpc({
  name: "ai_text.engines.list",
  input: z.object({}),
  output: z.object({
    engines: z.array(aiTextEngineDescriptorSchema),
  }),
});

/** Detects one engine's CLI, models, and routes. */
export const getAiTextEngineEnvironment = defineRpc({
  name: "ai_text.engine.environment.get",
  input: z.object({
    engineId: z.string(),
    /** Optional config override; omitted uses the first profile for the engine. */
    config: z.record(z.string(), z.unknown()).optional(),
    refresh: z.boolean().optional(),
  }),
  output: z.object({
    environment: aiTextEngineEnvironmentSchema,
  }),
});

/** Snapshot of a running or finished AI Text task. */
export const getAiTextTask = defineRpc({
  name: "ai_text.task.get",
  input: z.object({
    taskId: z.string(),
  }),
  output: z.object({
    task: aiTextTaskSnapshotSchema,
  }),
});

/** Cancels a running task and terminates any child process it owns. */
export const cancelAiTextTask = defineRpc({
  name: "ai_text.task.cancel",
  input: z.object({
    taskId: z.string(),
  }),
  output: z.object({
    cancelled: z.boolean(),
  }),
});

/** Loads the stored layout blocks for one extracted version. */
export const getAiTextLayout = defineRpc({
  name: "ai_text.layout.get",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
    versionId: z.string(),
  }),
  output: z.object({
    versionId: z.string(),
    layout: aiTextLayoutDocumentSchema.nullable(),
    message: z.string().optional(),
  }),
});

/** Returns one version image asset as base64 for a blob URL. */
export const getAiTextAsset = defineRpc({
  name: "ai_text.asset.get",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
    versionId: z.string(),
    assetPath: z.string(),
  }),
  output: z.object({
    mimeType: z.string(),
    base64: z.string(),
  }),
});

/** Switches the active extracted Markdown version for a file in `.autumn/<doc-slug>/metadata.json`. */
export const selectAiTextVersion = defineRpc({
  name: "ai_text.version.select",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
    versionId: z.string(),
  }),
  output: z.object({
    metadata: aiTextDocumentMetadataSchema,
    activeVersion: aiTextVersionRecordSchema.nullable(),
    content: z.string().nullable(),
  }),
});

/** Deletes a specific extracted Markdown version from `.autumn/<doc-slug>/` and updates `metadata.json`. */
export const deleteAiTextVersion = defineRpc({
  name: "ai_text.version.delete",
  input: z.object({
    workspaceId: z.string(),
    relPath: z.string(),
    versionId: z.string(),
  }),
  output: z.object({
    metadata: aiTextDocumentMetadataSchema.nullable(),
    activeVersion: aiTextVersionRecordSchema.nullable(),
    content: z.string().nullable(),
  }),
});

export const aiTextStorageStatsRowSchema = z.object({
  sourceRelPath: z.string(),
  /** Doc folder path relative to the output base (reveal key). */
  docFolderRelPath: z.string(),
  /** Absolute doc folder path for display. */
  docFolderDisplayPath: z.string(),
  versionCount: z.number().int().min(0),
  activeVersionId: z.string().nullable(),
  totalBytes: z.number().min(0),
  markdownBytes: z.number().min(0),
  assetBytes: z.number().min(0),
  lastParsedAt: z.string().nullable(),
  engines: z.array(z.string()),
});
export type AiTextStorageStatsRow = z.infer<
  typeof aiTextStorageStatsRowSchema
>;

/**
 * Recomputed per document under the output root: versions, sizes, and which
 * engines produced them. Never cached server-side; `refresh` is kept in the
 * contract so a future cache has a forced-recalculate path from day one.
 */
export const listAiTextStorageStats = defineRpc({
  name: "ai_text.stats.list",
  input: z.object({
    workspaceId: z.string(),
    refresh: z.boolean().optional(),
  }),
  output: z.object({
    outputRootDisplayPath: z.string(),
    generatedAt: z.string(),
    truncated: z.boolean(),
    rows: z.array(aiTextStorageStatsRowSchema),
  }),
});

/**
 * Opens a plugin-managed folder in the OS file manager. Targets are keyed, not
 * raw paths: the server resolves each target from its own knowledge (output
 * base, engine detection) so the client can never ask it to open an arbitrary
 * location.
 */
export const revealAiTextPath = defineRpc({
  name: "ai_text.path.reveal",
  input: z.object({
    kind: z.enum(["output-root", "doc-folder", "engine-tool", "engine-models"]),
    workspaceId: z.string().optional(),
    /** doc-folder only: doc folder path relative to the output base. */
    docPath: z.string().optional(),
    /** engine-tool / engine-models only. */
    engineId: z.string().optional(),
  }),
  output: z.object({
    opened: z.boolean(),
    message: z.string(),
  }),
});

export * from "./settings.ts";
export * from "./ai-text/layout.ts";
export * from "./ai-text/task.ts";
export * from "./ai-text/engines.ts";
export * from "./ai-text/engine-configs.ts";
export * from "./ai-text/engine-catalog.ts";
export * from "./ai-text/output-root.ts";
export * from "./ai-text/profiles.ts";
export * from "./ai-text/refinement.ts";
export * from "./ai-text/viewers.ts";


