import {
  readFile,
  rm,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, join, posix } from "node:path";
import {
  aiTextDocumentMetadataSchema,
  aiTextLayoutDocumentSchema,
  computeMarkdownStructureStats,
  toAutumnDocFolderSlug,
  type AiTextDocumentMetadata,
  type AiTextLayoutDocument,
  type AiTextVersionAssetsRef,
  type AiTextVersionLayoutRef,
  type AiTextVersionProvenance,
  type AiTextVersionRecord,
} from "../../shared/contracts.ts";
import { safeResolve } from "../paths.ts";
import {
  writeFileAtomically,
  writeVersionAssets,
  type ExtractedAssetInput,
} from "./version-assets.ts";

const METADATA_FILE_NAME = "metadata.json";

/**
 * Generated version ids are timestamp + counter + sanitized parser/agent
 * tokens. Rejecting anything else keeps every derived artifact path inside the
 * document folder, even when `metadata.json` was edited by hand.
 */
const VERSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type { ExtractedAssetInput } from "./version-assets.ts";

function versionArtifactPaths(docFolderRelPath: string, versionId: string) {
  const mdFileName = `${versionId}.md`;
  const layoutFileName = `${versionId}.layout.json`;
  return {
    mdFileName,
    mdRelPath: `${docFolderRelPath}/${mdFileName}`,
    layoutFileName,
    layoutRelPath: `${docFolderRelPath}/${layoutFileName}`,
    assetsDirName: `${versionId}.assets`,
  };
}

function sanitizeOutputRootDir(outputRootDir?: string): string {
  const trimmed = (outputRootDir ?? ".autumn")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\0")) {
    return ".autumn";
  }
  return trimmed;
}

function detectFormatKind(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    return "xlsx";
  }
  return "text";
}

function formatTimestampCompact(date: Date): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function sanitizeToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "default";
}

export interface AutumnDocPaths {
  normalizedSourceRelPath: string;
  sourceFileName: string;
  formatKind: string;
  docSlug: string;
  outputRootRelPath: string;
  docFolderRelPath: string;
  docFolderAbsPath: string;
  metadataAbsPath: string;
}

export function resolveAutumnDocPaths(
  workspaceRootPath: string,
  sourceRelPath: string,
  outputRootDir = ".autumn",
): AutumnDocPaths {
  const normalizedSourceRelPath = sourceRelPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const sourceFileName =
    posix.basename(normalizedSourceRelPath) || "document.pdf";
  const formatKind = detectFormatKind(normalizedSourceRelPath);
  const docSlug = toAutumnDocFolderSlug(normalizedSourceRelPath);
  const outputRootRelPath = sanitizeOutputRootDir(outputRootDir);
  const docFolderRelPath = `${outputRootRelPath}/${docSlug}`;
  const docFolderAbsPath = join(workspaceRootPath, ...docFolderRelPath.split("/"));
  const metadataAbsPath = join(docFolderAbsPath, METADATA_FILE_NAME);
  return {
    normalizedSourceRelPath,
    sourceFileName,
    formatKind,
    docSlug,
    outputRootRelPath,
    docFolderRelPath,
    docFolderAbsPath,
    metadataAbsPath,
  };
}

export async function readDocumentMetadata(
  workspaceRootPath: string,
  sourceRelPath: string,
  outputRootDir = ".autumn",
): Promise<{
  metadata: AiTextDocumentMetadata | null;
  activeContent: string | null;
}> {
  const paths = resolveAutumnDocPaths(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
  );
  let rawJson: string;
  try {
    rawJson = await readFile(paths.metadataAbsPath, "utf8");
  } catch {
    return { metadata: null, activeContent: null };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawJson);
  } catch {
    return { metadata: null, activeContent: null };
  }

  const parsedResult = aiTextDocumentMetadataSchema.safeParse(parsedUnknown);
  if (!parsedResult.success) {
    return { metadata: null, activeContent: null };
  }

  const validVersions: AiTextVersionRecord[] = [];
  for (const version of parsedResult.data.versions) {
    if (!VERSION_ID_PATTERN.test(version.id)) continue;
    const artifactPaths = versionArtifactPaths(
      paths.docFolderRelPath,
      version.id,
    );
    if (
      version.fileName !== artifactPaths.mdFileName ||
      version.relPath !== artifactPaths.mdRelPath
    ) {
      continue;
    }
    try {
      const absMdPath = await safeResolve(
        workspaceRootPath,
        artifactPaths.mdRelPath,
      );
      const st = await stat(absMdPath);
      if (!st.isFile()) continue;

      // Derive layout and asset locations from the version id instead of
      // trusting the stored refs: a stale or hand-edited metadata file must
      // never point reads or deletes at another workspace path.
      let layout = version.layout
        ? {
            ...version.layout,
            fileName: artifactPaths.layoutFileName,
            relPath: artifactPaths.layoutRelPath,
          }
        : null;
      if (layout) {
        try {
          const absLayoutPath = await safeResolve(
            workspaceRootPath,
            artifactPaths.layoutRelPath,
          );
          const layoutStats = await stat(absLayoutPath);
          if (!layoutStats.isFile()) layout = null;
        } catch {
          layout = null;
        }
      }

      let assets = version.assets
        ? { ...version.assets, dirName: artifactPaths.assetsDirName }
        : null;
      if (assets) {
        try {
          const absAssetsDir = await safeResolve(
            workspaceRootPath,
            `${paths.docFolderRelPath}/${artifactPaths.assetsDirName}`,
          );
          const assetStats = await stat(absAssetsDir);
          if (!assetStats.isDirectory()) assets = null;
        } catch {
          assets = null;
        }
      }

      validVersions.push({
        ...version,
        fileName: artifactPaths.mdFileName,
        relPath: artifactPaths.mdRelPath,
        size: st.size,
        layout: layout ?? null,
        assets: assets ?? null,
      });
    } catch {
      // Skip deleted version files
    }
  }

  if (validVersions.length === 0) {
    return { metadata: null, activeContent: null };
  }

  // Sort versions newest first (descending by versionNumber)
  validVersions.sort((a, b) => b.versionNumber - a.versionNumber);

  const activeVersion =
    validVersions.find((v) => v.id === parsedResult.data.activeVersionId) ??
    validVersions[0]!;

  let activeContent: string | null = null;
  try {
    const absMdPath = await safeResolve(
      workspaceRootPath,
      activeVersion.relPath,
    );
    activeContent = await readFile(absMdPath, "utf8");
  } catch {
    activeContent = null;
  }

  const metadata: AiTextDocumentMetadata = {
    schemaVersion: 1,
    sourceRelPath: paths.normalizedSourceRelPath,
    sourceFileName: paths.sourceFileName,
    formatKind: paths.formatKind,
    docFolderRelPath: paths.docFolderRelPath,
    activeVersionId: activeVersion.id,
    versions: validVersions,
  };

  return { metadata, activeContent };
}

export async function appendExtractedVersion(input: {
  workspaceRootPath: string;
  sourceRelPath: string;
  sourceSize: number;
  sourceMtimeMs: number;
  markdownContent: string;
  durationMs: number;
  provenance: AiTextVersionProvenance;
  layout?: AiTextLayoutDocument | null;
  assets?: ExtractedAssetInput[];
  outputRootDir?: string;
  now?: Date;
}): Promise<{
  metadata: AiTextDocumentMetadata;
  newVersion: AiTextVersionRecord;
  content: string;
}> {
  const now = input.now ?? new Date();
  const paths = resolveAutumnDocPaths(
    input.workspaceRootPath,
    input.sourceRelPath,
    input.outputRootDir,
  );
  const existing = await readDocumentMetadata(
    input.workspaceRootPath,
    input.sourceRelPath,
    input.outputRootDir,
  );
  const existingVersions = existing.metadata?.versions ?? [];
  const maxVersionNumber = existingVersions.reduce(
    (max, v) => Math.max(max, v.versionNumber),
    0,
  );
  const nextVersionNumber = maxVersionNumber + 1;
  const ts = formatTimestampCompact(now);
  const parserToken = sanitizeToken(input.provenance.parserId);
  const agentToken = sanitizeToken(input.provenance.agentId);
  const versionId = `${ts}_v${nextVersionNumber}_${parserToken}_${agentToken}`;
  const artifactPaths = versionArtifactPaths(paths.docFolderRelPath, versionId);
  const { mdFileName, mdRelPath } = artifactPaths;
  const mdAbsPath = join(paths.docFolderAbsPath, mdFileName);

  const written = await writeFileAtomically(
    mdAbsPath,
    input.markdownContent,
  );

  // Verify containment via safeResolve
  await safeResolve(input.workspaceRootPath, mdRelPath);

  const warnings = [...(input.provenance.warnings ?? [])];

  let assetsRef: AiTextVersionAssetsRef | null = null;
  if (input.assets && input.assets.length > 0) {
    assetsRef = await writeVersionAssets({
      workspaceRootPath: input.workspaceRootPath,
      docFolderAbsPath: paths.docFolderAbsPath,
      docFolderRelPath: paths.docFolderRelPath,
      assetsDirName: artifactPaths.assetsDirName,
      assets: input.assets,
      warnings,
    });
  }

  let layoutRef: AiTextVersionLayoutRef | null = null;
  if (input.layout && input.layout.blocks.length > 0) {
    const { layoutFileName, layoutRelPath } = artifactPaths;
    try {
      const layoutAbsPath = join(paths.docFolderAbsPath, layoutFileName);
      const serialized = aiTextLayoutDocumentSchema.parse(input.layout);
      await writeFileAtomically(
        layoutAbsPath,
        `${JSON.stringify(serialized)}\n`,
      );
      await safeResolve(input.workspaceRootPath, layoutRelPath);
      layoutRef = {
        fileName: layoutFileName,
        relPath: layoutRelPath,
        blockCount: serialized.blockCount,
        pageCount: serialized.pageCount,
        source: serialized.source,
      };
    } catch (error) {
      warnings.push(
        `Layout metadata could not be stored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const stats = computeMarkdownStructureStats(input.markdownContent);
  const enrichedProvenance: AiTextVersionProvenance = {
    ...stats,
    ...input.provenance,
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  const newVersion: AiTextVersionRecord = {
    id: versionId,
    versionNumber: nextVersionNumber,
    fileName: mdFileName,
    relPath: mdRelPath,
    createdAt: now.toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    size: written.size,
    sourceSize: input.sourceSize,
    sourceMtimeMs: input.sourceMtimeMs,
    provenance: enrichedProvenance,
    layout: layoutRef,
    assets: assetsRef,
  };

  const nextVersions = [newVersion, ...existingVersions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  const nextMetadata: AiTextDocumentMetadata = {
    schemaVersion: 1,
    sourceRelPath: paths.normalizedSourceRelPath,
    sourceFileName: paths.sourceFileName,
    formatKind: paths.formatKind,
    docFolderRelPath: paths.docFolderRelPath,
    activeVersionId: newVersion.id,
    versions: nextVersions,
  };

  await writeFileAtomically(
    paths.metadataAbsPath,
    `${JSON.stringify(nextMetadata, null, 2)}\n`,
  );

  return {
    metadata: nextMetadata,
    newVersion,
    content: input.markdownContent,
  };
}

export async function selectActiveVersion(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = ".autumn",
): Promise<{
  metadata: AiTextDocumentMetadata;
  activeVersion: AiTextVersionRecord | null;
  content: string | null;
}> {
  const paths = resolveAutumnDocPaths(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
  );
  const current = await readDocumentMetadata(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
  );
  if (!current.metadata) {
    const empty: AiTextDocumentMetadata = {
      schemaVersion: 1,
      sourceRelPath: paths.normalizedSourceRelPath,
      sourceFileName: paths.sourceFileName,
      formatKind: paths.formatKind,
      docFolderRelPath: paths.docFolderRelPath,
      activeVersionId: null,
      versions: [],
    };
    return { metadata: empty, activeVersion: null, content: null };
  }

  const target =
    current.metadata.versions.find((v) => v.id === versionId) ??
    current.metadata.versions[0] ??
    null;

  const updatedMetadata: AiTextDocumentMetadata = {
    ...current.metadata,
    activeVersionId: target?.id ?? null,
  };

  await writeFileAtomically(
    paths.metadataAbsPath,
    `${JSON.stringify(updatedMetadata, null, 2)}\n`,
  );

  let content: string | null = null;
  if (target) {
    try {
      const absMdPath = await safeResolve(workspaceRootPath, target.relPath);
      content = await readFile(absMdPath, "utf8");
    } catch {
      content = null;
    }
  }

  return {
    metadata: updatedMetadata,
    activeVersion: target,
    content,
  };
}

export async function deleteExtractedVersion(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = ".autumn",
): Promise<{
  metadata: AiTextDocumentMetadata | null;
  activeVersion: AiTextVersionRecord | null;
  content: string | null;
}> {
  const paths = resolveAutumnDocPaths(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
  );
  const current = await readDocumentMetadata(
    workspaceRootPath,
    sourceRelPath,
    outputRootDir,
  );
  if (!current.metadata) {
    return { metadata: null, activeVersion: null, content: null };
  }

  const targetToDelete = current.metadata.versions.find(
    (v) => v.id === versionId,
  );
  if (targetToDelete) {
    const artifactPaths = versionArtifactPaths(
      paths.docFolderRelPath,
      targetToDelete.id,
    );
    try {
      const absMdPath = await safeResolve(
        workspaceRootPath,
        artifactPaths.mdRelPath,
      );
      await unlink(absMdPath);
    } catch {
      // Ignore if already removed
    }
    // Remove every derived artifact even when the record lost its optional
    // refs, so half-written or hand-edited metadata cannot leave files behind.
    try {
      const absLayoutPath = await safeResolve(
        workspaceRootPath,
        artifactPaths.layoutRelPath,
      );
      await unlink(absLayoutPath);
    } catch {
      // Ignore if already removed
    }
    try {
      const absAssetsDir = await safeResolve(
        workspaceRootPath,
        `${paths.docFolderRelPath}/${artifactPaths.assetsDirName}`,
      );
      await rm(absAssetsDir, { recursive: true, force: true });
    } catch {
      // Ignore if already removed
    }
  }

  const remaining = current.metadata.versions.filter((v) => v.id !== versionId);
  if (remaining.length === 0) {
    await unlink(paths.metadataAbsPath).catch(() => undefined);
    // Removing the last version should not leave an empty `.autumn/<slug>/`.
    await rmdir(paths.docFolderAbsPath).catch(() => undefined);
    return { metadata: null, activeVersion: null, content: null };
  }

  const nextActive =
    remaining.find((v) => v.id === current.metadata?.activeVersionId) ??
    remaining[0]!;

  const updatedMetadata: AiTextDocumentMetadata = {
    ...current.metadata,
    activeVersionId: nextActive.id,
    versions: remaining,
  };

  await writeFileAtomically(
    paths.metadataAbsPath,
    `${JSON.stringify(updatedMetadata, null, 2)}\n`,
  );

  let content: string | null = null;
  try {
    const absMdPath = await safeResolve(workspaceRootPath, nextActive.relPath);
    content = await readFile(absMdPath, "utf8");
  } catch {
    content = null;
  }

  return {
    metadata: updatedMetadata,
    activeVersion: nextActive,
    content,
  };
}
