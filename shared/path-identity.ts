/**
 * Pure path-identity helpers for the native file-panel surface. Kept free of
 * SDK imports so they run in both runtimes and under node:test.
 */

/** True for host-absolute paths (POSIX root or Windows drive). */
export function isAbsoluteLikePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/**
 * Normalizes a workspace-relative path from a native file tab's params:
 * strips leading "./" and "/" segments, rejects escapes (".." past the root),
 * home-relative ("~") and empty paths. Returns null when the input cannot be
 * a workspace-relative path — callers treat that as outside the workspace.
 */
export function normalizeWorkspaceRelPath(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "~" || trimmed.startsWith("~/")) return null;
  const segments: string[] = [];
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}
