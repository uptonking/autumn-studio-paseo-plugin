import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import {
  aiTextDocumentMetadataSchema,
  computeMarkdownStructureStats,
  toAutumnDocFolderSlug,
  type AiTextDocumentMetadata,
  type AiTextVersionProvenance,
  type AiTextVersionRecord,
} from "../../shared/contracts.ts";
import { safeResolve } from "../paths.ts";

const METADATA_FILE_NAME = "metadata.json";

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

async function writeNewOrExistingFileAtomically(
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
  return {
    size: updatedStats.size,
    mtimeMs: updatedStats.mtimeMs,
  };
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
    try {
      const absMdPath = await safeResolve(workspaceRootPath, version.relPath);
      const st = await stat(absMdPath);
      if (st.isFile()) {
        validVersions.push({
          ...version,
          size: st.size,
        });
      }
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
  const mdFileName = `${versionId}.md`;
  const mdRelPath = `${paths.docFolderRelPath}/${mdFileName}`;
  const mdAbsPath = join(paths.docFolderAbsPath, mdFileName);

  const written = await writeNewOrExistingFileAtomically(
    mdAbsPath,
    input.markdownContent,
  );

  // Verify containment via safeResolve
  await safeResolve(input.workspaceRootPath, mdRelPath);

  const stats = computeMarkdownStructureStats(input.markdownContent);
  const enrichedProvenance: AiTextVersionProvenance = {
    ...stats,
    ...input.provenance,
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

  await writeNewOrExistingFileAtomically(
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

  await writeNewOrExistingFileAtomically(
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
    try {
      const absMdPath = await safeResolve(
        workspaceRootPath,
        targetToDelete.relPath,
      );
      await unlink(absMdPath);
    } catch {
      // Ignore if already removed
    }
  }

  const remaining = current.metadata.versions.filter((v) => v.id !== versionId);
  if (remaining.length === 0) {
    await unlink(paths.metadataAbsPath).catch(() => undefined);
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

  await writeNewOrExistingFileAtomically(
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

