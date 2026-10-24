import { readFile, stat } from "node:fs/promises";
import {
  aiTextLayoutDocumentSchema,
  type AiTextLayoutDocument,
} from "../../shared/contracts.ts";
import {
  MAX_SERVED_ASSET_BYTES,
  sanitizeAssetRelativePath,
} from "../../shared/asset-paths.ts";
import { contentTypeFor } from "../scan.ts";
import { readDocumentMetadata } from "./metadata-store.ts";
import {
  resolveAutumnDocPaths,
  resolveOutputArtifactPath,
} from "./metadata-paths.ts";

const MAX_LAYOUT_BYTES = 64 * 1024 * 1024;

export async function readExtractedVersionLayout(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = ".autumn",
  workspaceId?: string,
): Promise<{
  versionId: string;
  layout: AiTextLayoutDocument | null;
  message?: string;
}> {
  const base = resolveAutumnDocPaths(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
    workspaceId,
  ).artifactBaseAbsPath;
  const current = await readDocumentMetadata(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
    workspaceId,
  );
  if (!current.metadata) {
    return {
      versionId,
      layout: null,
      message: "No extracted text versions exist for this file.",
    };
  }

  const version = current.metadata.versions.find((item) => item.id === versionId);
  if (!version) {
    return {
      versionId,
      layout: null,
      message: "That text version no longer exists.",
    };
  }
  if (!version.layout) {
    return {
      versionId,
      layout: null,
      message:
        "This version has no layout metadata. Re-parse with a profile whose engine produces layout blocks.",
    };
  }

  try {
    const absLayoutPath = await resolveOutputArtifactPath(
      base,
      version.layout.relPath,
    );
    const stats = await stat(absLayoutPath);
    if (stats.size > MAX_LAYOUT_BYTES) {
      return {
        versionId,
        layout: null,
        message: "Layout metadata is too large to load.",
      };
    }
    const parsed = aiTextLayoutDocumentSchema.safeParse(
      JSON.parse(await readFile(absLayoutPath, "utf8")),
    );
    if (!parsed.success) {
      return {
        versionId,
        layout: null,
        message: "Layout metadata is corrupt; re-parse this version.",
      };
    }
    return { versionId, layout: parsed.data };
  } catch {
    return {
      versionId,
      layout: null,
      message: "Layout metadata could not be read; re-parse this version.",
    };
  }
}

export async function readExtractedVersionAsset(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  assetPath: string,
  outputRootDir = ".autumn",
  workspaceId?: string,
): Promise<{ mimeType: string; base64: string }> {
  const safeAssetPath = sanitizeAssetRelativePath(assetPath);
  if (!safeAssetPath) {
    throw new Error("Invalid image asset path");
  }

  const base = resolveAutumnDocPaths(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
    workspaceId,
  ).artifactBaseAbsPath;
  const current = await readDocumentMetadata(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
    workspaceId,
  );
  const version = current.metadata?.versions.find(
    (item) => item.id === versionId,
  );
  if (!version?.assets) {
    throw new Error("This text version has no stored image assets");
  }

  const absAssetPath = await resolveOutputArtifactPath(
    base,
    `${current.metadata!.docFolderRelPath}/${version.assets.dirName}/${safeAssetPath}`,
  );
  const stats = await stat(absAssetPath);
  if (!stats.isFile()) {
    throw new Error("Image asset not found");
  }
  if (stats.size > MAX_SERVED_ASSET_BYTES) {
    throw new Error(
      `Image asset is too large (${Math.round(stats.size / 1024 / 1024)}MB, limit 20MB)`,
    );
  }
  const buffer = await readFile(absAssetPath);
  return {
    mimeType: contentTypeFor(absAssetPath) ?? "application/octet-stream",
    base64: buffer.toString("base64"),
  };
}
