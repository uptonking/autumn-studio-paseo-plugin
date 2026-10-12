import { readFile, stat } from "fs/promises";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  fileExplorerSettings,
  getFileContent,
  getFileTree,
  getPdfWasm,
  getXlsxWasm,
  saveFileContent,
} from "./shared/contracts.js";
import { atomicWriteFile, safeResolve, workspaceRoot } from "./server/paths.js";
import { contentTypeFor, scanWorkspaceTree } from "./server/scan.js";

/** Refuse to buffer more than 32MB into a data URI — the WebSocket and the
 * renderer's blob both pay for it. Larger files report a readable error. */
const MAX_CONTENT_BYTES = 32 * 1024 * 1024;

let pdfWasmPayloadPromise: Promise<{ dataUri: string }> | null = null;
let xlsxWasmPayloadPromise: Promise<{ dataUri: string }> | null = null;

/**
 * Every handler resolves the workspace root from its id and re-checks the
 * path, rather than trusting anything the client sent. Plugin backends are
 * unsandboxed, so this runs before any file is opened.
 */
async function locate(paseo: unknown, workspaceId: string, relPath: string) {
  const root = await workspaceRoot(paseo, workspaceId);
  return await safeResolve(root, relPath);
}

export default function contribute(server: PluginServerContext) {
  server.registerSettings(fileExplorerSettings);

  server.handle(getFileTree, async ({ workspaceId }, { paseo }) => {
    const root = await workspaceRoot(paseo, workspaceId);
    const { tree, truncated } = await scanWorkspaceTree(root);
    return { tree, truncated };
  });

  server.handle(getFileContent, async ({ workspaceId, relPath }, { paseo }) => {
    const file = await locate(paseo, workspaceId, relPath);
    const stats = await stat(file);
    if (stats.size > MAX_CONTENT_BYTES) {
      throw new Error(
        `File is too large to preview (${Math.round(stats.size / 1024 / 1024)}MB, limit 32MB)`
      );
    }
    const buffer = await readFile(file);
    const contentType =
      contentTypeFor(file) ?? "application/octet-stream";
    return {
      dataUri: `data:${contentType};base64,${buffer.toString("base64")}`,
      size: stats.size,
      mtime: stats.mtimeMs,
    };
  });

  server.handle(
    saveFileContent,
    async ({ workspaceId, relPath, content, encoding }, { paseo }) => {
      const file = await locate(paseo, workspaceId, relPath);
      const buffer =
        encoding === "utf8"
          ? Buffer.from(content, "utf8")
          : Buffer.from(content, "base64");
      if (buffer.byteLength > MAX_CONTENT_BYTES) {
        throw new Error(
          `File is too large to save (${Math.round(buffer.byteLength / 1024 / 1024)}MB, limit 32MB)`
        );
      }
      const updatedStats = await atomicWriteFile(file, buffer);
      return {
        path: relPath,
        size: updatedStats.size,
        mtime: updatedStats.mtimeMs,
      };
    }
  );

  // The wasm ships inside this bundle (scripts/inline-wasm.js): the daemon
  // evals server bundles with no usable __filename, so node_modules paths
  // cannot be resolved at runtime. Dynamic imports keep both 6MB base64
  // strings lazy until a PDF or Excel file is actually opened.
  server.handle(getPdfWasm, async () => {
    if (!pdfWasmPayloadPromise) {
      pdfWasmPayloadPromise = import("./server/generated/pdfium-wasm.js")
        .then(({ pdfiumWasmBase64 }) => ({
          dataUri: `data:application/wasm;base64,${pdfiumWasmBase64}`,
        }))
        .catch((err) => {
          pdfWasmPayloadPromise = null;
          throw err;
        });
    }
    return await pdfWasmPayloadPromise;
  });

  server.handle(getXlsxWasm, async () => {
    if (!xlsxWasmPayloadPromise) {
      xlsxWasmPayloadPromise = import("./server/generated/xlsx-wasm.js")
        .then(({ xlsxWasmBase64 }) => ({
          dataUri: `data:application/wasm;base64,${xlsxWasmBase64}`,
        }))
        .catch((err) => {
          xlsxWasmPayloadPromise = null;
          throw err;
        });
    }
    return await xlsxWasmPayloadPromise;
  });

  return () => {};
}
