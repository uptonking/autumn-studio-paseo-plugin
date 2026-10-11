import { readFile, stat } from "fs/promises";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  fileExplorerSettings,
  getFileContent,
  getFileTree,
  getPdfWasm,
} from "./shared/contracts.js";
import { safeResolve, workspaceRoot } from "./server/paths.js";
import { contentTypeFor, scanWorkspaceTree } from "./server/scan.js";
import { pdfiumWasmBase64 } from "./server/generated/pdfium-wasm.js";

/** Refuse to buffer more than 32MB into a data URI — the WebSocket and the
 * renderer's blob both pay for it. Larger files report a readable error. */
const MAX_CONTENT_BYTES = 32 * 1024 * 1024;

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
    return { dataUri: `data:${contentType};base64,${buffer.toString("base64")}` };
  });

  // The wasm ships inside this bundle (scripts/inline-wasm.js): the daemon
  // evals server bundles with no usable __filename, so node_modules paths
  // cannot be resolved at runtime. Serving it keeps PDF viewing offline.
  server.handle(getPdfWasm, async () => {
    return { dataUri: `data:application/wasm;base64,${pdfiumWasmBase64}` };
  });

  return () => {};
}
