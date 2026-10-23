import { readFile, stat } from "fs/promises";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  cancelAiTextTask,
  DEFAULT_AI_TEXT_SETTINGS,
  deleteAiTextVersion,
  fileExplorerSettings,
  getAiTextAsset,
  getAiTextEnvironment,
  getAiTextLayout,
  getAiTextMetadata,
  getAiTextSettings,
  getAiTextTask,
  getFileContent,
  getFileTree,
  getPdfWasm,
  getXlsxWasm,
  listAiTextAgents,
  saveFileContent,
  selectAiTextVersion,
  startAiTextTask,
} from "./shared/contracts.js";
import {
  deleteExtractedVersion,
  readDocumentMetadata,
  selectActiveVersion,
} from "./server/ai-text/metadata-store.js";
import {
  readExtractedVersionAsset,
  readExtractedVersionLayout,
} from "./server/ai-text/version-artifacts.js";
import { getMineruEnvironment } from "./server/ai-text/environment.js";
import { discoverAiTextAgents } from "./server/ai-text/parser-registry.js";
import { createAiTextTaskStore } from "./server/ai-text/task-store.js";
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
  const settingsHandle = server.registerSettings(fileExplorerSettings);
  const aiTextTasks = createAiTextTaskStore();

  async function resolveAiTextSettings() {
    try {
      const state = await settingsHandle.read();
      if (state?.status === "ready") {
        return getAiTextSettings(state.values);
      }
    } catch {
      // Fall back to default AI Text settings
    }
    return DEFAULT_AI_TEXT_SETTINGS;
  }

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

  server.handle(listAiTextAgents, async ({ workspaceId }, { paseo }) => {
    let cwd: string | undefined;
    if (workspaceId) {
      cwd = await workspaceRoot(paseo, workspaceId).catch(() => undefined);
    }
    const agents = await discoverAiTextAgents(paseo, cwd);
    return { agents };
  });

  server.handle(
    getAiTextMetadata,
    async ({ workspaceId, relPath }, { paseo }) => {
      const root = await workspaceRoot(paseo, workspaceId);
      const aiSettings = await resolveAiTextSettings();
      return await readDocumentMetadata(
        root,
        relPath,
        aiSettings.outputRootDir,
      );
    },
  );

  server.handle(
    startAiTextTask,
    async (
      { workspaceId, relPath, kind, parserId, agentId, tier, source },
      { paseo },
    ) => {
      if (kind === "parse" && !workspaceId) {
        throw new Error("workspaceId is required to parse a file");
      }
      const root = workspaceId
        ? await workspaceRoot(paseo, workspaceId)
        : undefined;
      const sourceAbsPath =
        root && relPath ? await safeResolve(root, relPath) : undefined;
      const aiSettings = await resolveAiTextSettings();
      return aiTextTasks.start({
        paseo,
        workspaceId: workspaceId ?? "",
        relPath,
        workspaceRootPath: root,
        sourceAbsPath,
        kind,
        settings: aiSettings,
        parserId,
        agentId,
        tier,
        source,
      });
    },
  );

  server.handle(getAiTextTask, async ({ taskId }) => {
    const task = aiTextTasks.get(taskId);
    if (!task) {
      throw new Error("AI Text task not found or expired");
    }
    return { task };
  });

  server.handle(cancelAiTextTask, async ({ taskId }) => ({
    cancelled: aiTextTasks.cancel(taskId),
  }));

  server.handle(
    getAiTextLayout,
    async ({ workspaceId, relPath, versionId }, { paseo }) => {
      const root = await workspaceRoot(paseo, workspaceId);
      const aiSettings = await resolveAiTextSettings();
      return await readExtractedVersionLayout(
        root,
        relPath,
        versionId,
        aiSettings.outputRootDir,
      );
    },
  );

  server.handle(
    getAiTextAsset,
    async (
      { workspaceId, relPath, versionId, assetPath },
      { paseo },
    ) => {
      const root = await workspaceRoot(paseo, workspaceId);
      const aiSettings = await resolveAiTextSettings();
      return await readExtractedVersionAsset(
        root,
        relPath,
        versionId,
        assetPath,
        aiSettings.outputRootDir,
      );
    },
  );

  server.handle(
    getAiTextEnvironment,
    async ({ refresh }) => {
      const aiSettings = await resolveAiTextSettings();
      const environment = await getMineruEnvironment({
        kitCommand: aiSettings.mineru.kitCommand,
        localApiUrl: aiSettings.mineru.localApiUrl,
        tier: aiSettings.mineru.tier,
        refresh: refresh ?? false,
      });
      return { environment };
    },
  );

  server.handle(
    selectAiTextVersion,
    async ({ workspaceId, relPath, versionId }, { paseo }) => {
      const root = await workspaceRoot(paseo, workspaceId);
      const aiSettings = await resolveAiTextSettings();
      return await selectActiveVersion(
        root,
        relPath,
        versionId,
        aiSettings.outputRootDir,
      );
    },
  );

  server.handle(
    deleteAiTextVersion,
    async ({ workspaceId, relPath, versionId }, { paseo }) => {
      const root = await workspaceRoot(paseo, workspaceId);
      const aiSettings = await resolveAiTextSettings();
      return await deleteExtractedVersion(
        root,
        relPath,
        versionId,
        aiSettings.outputRootDir,
      );
    },
  );

  return () => {};
}
