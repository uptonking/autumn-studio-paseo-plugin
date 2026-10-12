import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

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

export * from "./settings.ts";


