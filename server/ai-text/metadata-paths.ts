import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  normalizeAiTextDocumentMetadata,
  toAutumnDocFolderSlug,
} from "../../shared/contracts.ts";
import {
  DEFAULT_AI_TEXT_OUTPUT_ROOT,
  parseAiTextOutputRoot,
} from "../../shared/ai-text/output-root.ts";
import { expandHomePath } from "./executable.ts";

export const METADATA_FILE_NAME = "metadata.json";

/**
 * Generated version ids are timestamp + counter + sanitized parser/agent
 * tokens. Rejecting anything else keeps every derived artifact path inside the
 * document folder, even when `metadata.json` was edited by hand.
 */
export const VERSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function versionArtifactPaths(docFolderRelPath: string, versionId: string) {
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

function isAbsolutePathLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value)
  );
}

export interface OutputBase {
  /** Directory whose children are the per-document folders. */
  docRootAbsPath: string;
  /**
   * Base that relative artifact rel paths resolve against — the workspace
   * root for workspace-relative output (rel paths carry the output root
   * prefix), or the output base for absolute output roots (rel paths are
   * absolute already).
   */
  artifactBaseAbsPath: string;
  kind: "workspace-relative" | "absolute";
  /** The configured output-root string (display + tree visibility). */
  name: string;
}

/**
 * Settings are host-scoped, so one output root serves every workspace. An
 * absolute root namespaces doc folders per workspace id; otherwise the same
 * file name in two workspaces would share one doc folder and mix versions.
 */
export function resolveOutputBase(
  workspaceRootPath: string,
  outputRootDir: string | undefined,
  workspaceId?: string,
): OutputBase {
  const raw = outputRootDir?.trim() || DEFAULT_AI_TEXT_OUTPUT_ROOT;
  const parsed = parseAiTextOutputRoot(raw);
  if (parsed.ok && parsed.kind === "absolute") {
    const segment = sanitizeToken(workspaceId ?? "default");
    const docRootAbsPath = join(expandHomePath(parsed.value), segment);
    return {
      docRootAbsPath,
      artifactBaseAbsPath: docRootAbsPath,
      kind: "absolute",
      name: parsed.value,
    };
  }
  const name = parsed.ok ? parsed.value : DEFAULT_AI_TEXT_OUTPUT_ROOT;
  return {
    docRootAbsPath: join(workspaceRootPath, ...name.split("/")),
    artifactBaseAbsPath: workspaceRootPath,
    kind: "workspace-relative",
    name,
  };
}

/**
 * Resolves an artifact path and refuses anything outside its base. Relative
 * `relPath` values are workspace-root-relative (they carry the output root
 * prefix); absolute values come from absolute output roots. The containment
 * check still applies either way, so a hand-edited `metadata.json` cannot
 * point reads or deletes at an unrelated directory.
 */
export async function resolveOutputArtifactPath(
  artifactBaseAbsPath: string,
  relPath: string,
): Promise<string> {
  if (relPath.includes("\0")) throw new Error("Invalid artifact path");
  const target = isAbsolutePathLike(relPath)
    ? expandHomePath(relPath)
    : join(artifactBaseAbsPath, ...relPath.split("/"));
  const resolvedTarget = await realpath(target).catch(() => target);
  const resolvedBase = await realpath(artifactBaseAbsPath).catch(
    () => artifactBaseAbsPath,
  );
  const normalizedBase = resolvedBase.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedTarget = resolvedTarget
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (
    normalizedTarget !== normalizedBase &&
    !normalizedTarget.startsWith(`${normalizedBase}/`)
  ) {
    throw new Error(
      `"${relPath}" escapes the AI Text output root.`,
    );
  }
  return resolvedTarget;
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

export function formatTimestampCompact(date: Date): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function sanitizeToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "default";
}

export interface AutumnDocPaths {
  normalizedSourceRelPath: string;
  sourceFileName: string;
  formatKind: string;
  docSlug: string;
  /** Configured output-root string (relative folder name or absolute path). */
  outputRootName: string;
  /** Directory whose children are the per-document folders. */
  docRootAbsPath: string;
  /** Base that relative artifact rel paths resolve against. */
  artifactBaseAbsPath: string;
  outputRootKind: "workspace-relative" | "absolute";
  /**
   * Doc folder path relative to the workspace for relative roots, or the
   * absolute doc folder path for absolute roots. Stored in metadata.json.
   */
  docFolderRelPath: string;
  docFolderAbsPath: string;
  metadataAbsPath: string;
}

export function resolveAutumnDocPaths(
  workspaceRootPath: string,
  sourceRelPath: string,
  outputRootDir = ".autumn",
  workspaceId?: string,
): AutumnDocPaths {
  const normalizedSourceRelPath = sourceRelPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const sourceFileName =
    posix.basename(normalizedSourceRelPath) || "document.pdf";
  const formatKind = detectFormatKind(normalizedSourceRelPath);
  const docSlug = toAutumnDocFolderSlug(normalizedSourceRelPath);
  const base = resolveOutputBase(workspaceRootPath, outputRootDir, workspaceId);
  const docFolderRelPath =
    base.kind === "absolute"
      ? `${base.docRootAbsPath.replace(/\\/g, "/")}/${docSlug}`
      : `${base.name}/${docSlug}`;
  const docFolderAbsPath = join(base.docRootAbsPath, docSlug);
  const metadataAbsPath = join(docFolderAbsPath, METADATA_FILE_NAME);
  return {
    normalizedSourceRelPath,
    sourceFileName,
    formatKind,
    docSlug,
    outputRootName: base.name,
    docRootAbsPath: base.docRootAbsPath,
    artifactBaseAbsPath: base.artifactBaseAbsPath,
    outputRootKind: base.kind,
    docFolderRelPath,
    docFolderAbsPath,
    metadataAbsPath,
  };
}

export interface ResolvedDocFolder {
  docFolderRelPath: string;
  docFolderAbsPath: string;
  metadataAbsPath: string;
}

export function docFolderFromRelPath(
  workspaceRootPath: string,
  docFolderRelPath: string,
): ResolvedDocFolder {
  // Absolute output roots store the absolute doc folder path as the rel path.
  const docFolderAbsPath = isAbsolutePathLike(docFolderRelPath)
    ? expandHomePath(docFolderRelPath)
    : join(workspaceRootPath, ...docFolderRelPath.split("/"));
  return {
    docFolderRelPath,
    docFolderAbsPath,
    metadataAbsPath: join(docFolderAbsPath, METADATA_FILE_NAME),
  };
}

async function readMetadataSourceRelPath(
  metadataAbsPath: string,
): Promise<string | null> {
  try {
    const raw = await readFile(metadataAbsPath, "utf8");
    return (
      normalizeAiTextDocumentMetadata(JSON.parse(raw))?.sourceRelPath ?? null
    );
  } catch {
    return null;
  }
}

async function folderHasEntries(absPath: string): Promise<boolean> {
  try {
    return (await readdir(absPath)).length > 0;
  } catch {
    return false;
  }
}

/**
 * Two source paths can produce the same slug (`a/b.pdf` and `a__b.pdf`, or
 * case-only differences on a case-insensitive filesystem). The first source
 * keeps the readable slug; later colliding sources get a stable hash suffix so
 * their versions never mix.
 */
export async function resolveDocFolderForSource(
  workspaceRootPath: string,
  paths: AutumnDocPaths,
): Promise<ResolvedDocFolder> {
  const primary = docFolderFromRelPath(
    workspaceRootPath,
    paths.docFolderRelPath,
  );
  const primarySource = await readMetadataSourceRelPath(primary.metadataAbsPath);
  if (primarySource === paths.normalizedSourceRelPath) return primary;
  if (primarySource === null && !(await folderHasEntries(primary.docFolderAbsPath))) {
    return primary;
  }
  const suffix = createHash("sha256")
    .update(paths.normalizedSourceRelPath)
    .digest("hex")
    .slice(0, 12);
  return docFolderFromRelPath(
    workspaceRootPath,
    `${paths.docFolderRelPath}-${suffix}`,
  );
}
