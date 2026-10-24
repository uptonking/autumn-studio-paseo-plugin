import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import type { ExtractedAssetInput } from "../../version-assets.ts";
import { MAX_ASSET_BYTES, MAX_ASSETS_TOTAL_BYTES } from "../../version-assets.ts";
import type { DoclingPictureRef } from "./docling-json.ts";

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
]);

function stripFileUri(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return uri;
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Copies the pictures Docling referenced in its JSON output. Anything outside
 * the output directory, non-image files, and oversized files are skipped so a
 * hand-written `image.uri` cannot read arbitrary paths.
 */
export async function collectDoclingAssets(input: {
  outputDir: string;
  pictures: readonly DoclingPictureRef[];
  markdown: string;
  warnings: string[];
}): Promise<{ assets: ExtractedAssetInput[]; markdown: string }> {
  const assets: ExtractedAssetInput[] = [];
  const replacements = new Map<string, string>();
  let totalBytes = 0;
  const seen = new Set<string>();

  for (const picture of input.pictures) {
    const rawUri = stripFileUri(picture.sourceUri);
    if (!rawUri || rawUri.startsWith("data:") || isAbsolute(rawUri)) {
      input.warnings.push(
        `Skipped Docling image outside the output folder: ${picture.sourceUri}`,
      );
      continue;
    }
    const absPath = resolve(input.outputDir, rawUri);
    if (!isInside(resolve(input.outputDir), absPath)) {
      input.warnings.push(
        `Skipped Docling image outside the output folder: ${picture.sourceUri}`,
      );
      continue;
    }
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extname(absPath).toLowerCase())) {
      input.warnings.push(`Skipped non-image Docling asset: ${picture.sourceUri}`);
      continue;
    }
    if (seen.has(picture.assetPath)) continue;
    try {
      const stats = await stat(absPath);
      if (!stats.isFile()) continue;
      if (stats.size > MAX_ASSET_BYTES) {
        input.warnings.push(`Skipped oversized Docling image ${picture.sourceUri}`);
        continue;
      }
      if (totalBytes + stats.size > MAX_ASSETS_TOTAL_BYTES) {
        input.warnings.push(
          "Skipped remaining Docling images over the 512MB version cap",
        );
        break;
      }
      const data = await readFile(absPath);
      seen.add(picture.assetPath);
      totalBytes += data.byteLength;
      assets.push({ path: picture.assetPath, data });
      const sourceName = basename(rawUri);
      replacements.set(rawUri, picture.assetPath);
      replacements.set(sourceName, picture.assetPath);
    } catch (error) {
      input.warnings.push(
        `Could not read Docling image ${picture.sourceUri}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  let markdown = input.markdown;
  const ordered = [...replacements.entries()].sort(
    ([a], [b]) => b.length - a.length,
  );
  if (ordered.length > 0) {
    // Single pass: replacing the full URI first would otherwise let the
    // basename rule rewrite the new `images/` prefix it just produced.
    const pattern = new RegExp(
      ordered.map(([source]) => escapeRegExp(source)).join("|"),
      "g",
    );
    markdown = markdown.replace(
      pattern,
      (match) => replacements.get(match) ?? match,
    );
  }
  return { assets, markdown };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes Docling's temporary output once its Markdown and pictures are read. */
export async function directoryHasFiles(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length > 0;
  } catch {
    return false;
  }
}
