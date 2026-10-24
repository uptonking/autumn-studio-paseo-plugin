import {
  mkdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AiTextVersionAssetsRef } from "../../shared/contracts.ts";
import {
  MAX_SERVED_ASSET_BYTES,
  sanitizeAssetRelativePath,
} from "../../shared/asset-paths.ts";
import { resolveOutputArtifactPath } from "./metadata-paths.ts";

/** One image is rejected above what the asset RPC can serve. */
export const MAX_ASSET_BYTES = MAX_SERVED_ASSET_BYTES;
export const MAX_ASSETS_TOTAL_BYTES = 512 * 1024 * 1024;

export interface ExtractedAssetInput {
  path: string;
  data: Uint8Array;
}

/**
 * Writes beside the target and renames into place, so a crash mid-write never
 * leaves a half-written Markdown, layout, or metadata file.
 */
export async function writeFileAtomically(
  filePath: string,
  data: Buffer | string,
): Promise<{ size: number; mtimeMs: number }> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const base = basename(filePath);
  const tempPath = join(
    dir,
    `.${base}.paseo-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  try {
    await writeFile(tempPath, buf, { mode: 0o644 });
    await rename(tempPath, filePath);
  } catch (err) {
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }
  const updatedStats = await stat(filePath);
  return { size: updatedStats.size, mtimeMs: updatedStats.mtimeMs };
}

export async function writeVersionAssets(input: {
  /** Output base the doc folder lives under (workspace root or absolute root). */
  artifactBaseAbsPath: string;
  docFolderAbsPath: string;
  docFolderRelPath: string;
  assetsDirName: string;
  assets: ExtractedAssetInput[];
  warnings: string[];
}): Promise<AiTextVersionAssetsRef | null> {
  const assetsDirRelPath = `${input.docFolderRelPath}/${input.assetsDirName}`;
  const assetsDirAbsPath = join(input.docFolderAbsPath, input.assetsDirName);
  const seen = new Set<string>();
  let imageCount = 0;
  let totalBytes = 0;

  try {
    await mkdir(assetsDirAbsPath, { recursive: true });
    for (const asset of input.assets) {
      const safePath = sanitizeAssetRelativePath(asset.path);
      if (!safePath) {
        input.warnings.push(`Skipped unsafe asset path ${asset.path}`);
        continue;
      }
      if (seen.has(safePath)) {
        input.warnings.push(`Skipped duplicate image asset ${safePath}`);
        continue;
      }
      if (asset.data.byteLength > MAX_ASSET_BYTES) {
        input.warnings.push(`Skipped oversized image asset ${safePath}`);
        continue;
      }
      if (totalBytes + asset.data.byteLength > MAX_ASSETS_TOTAL_BYTES) {
        input.warnings.push(
          "Skipped remaining image assets over the 512MB version cap",
        );
        break;
      }
      const assetRelPath = `${assetsDirRelPath}/${safePath}`;
      const assetParentRelPath = assetRelPath.slice(
        0,
        assetRelPath.lastIndexOf("/"),
      );
      const assetParentAbsPath = join(
        assetsDirAbsPath,
        ...safePath.split("/").slice(0, -1),
      );
      await mkdir(assetParentAbsPath, { recursive: true });
      const resolvedParent = await resolveOutputArtifactPath(
        input.artifactBaseAbsPath,
        assetParentRelPath,
      );
      await writeFileAtomically(
        join(resolvedParent, basename(safePath)),
        Buffer.from(asset.data),
      );
      seen.add(safePath);
      imageCount += 1;
      totalBytes += asset.data.byteLength;
    }
  } catch (error) {
    input.warnings.push(
      `Image assets could not be stored: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await rm(assetsDirAbsPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return null;
  }

  if (imageCount === 0) {
    await rm(assetsDirAbsPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return null;
  }
  return { dirName: input.assetsDirName, imageCount, totalBytes };
}
