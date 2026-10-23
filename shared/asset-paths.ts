/**
 * Largest image the daemon will read and send over the asset RPC. Persistence
 * uses the same limit so a stored image is always readable.
 */
export const MAX_SERVED_ASSET_BYTES = 20 * 1024 * 1024;

/**
 * Version-relative image asset path, shared by the daemon (persistence and
 * asset reads) and the app (Markdown image rendering). Both sides must accept
 * exactly the same set, otherwise a stored image renders as a placeholder.
 *
 * Accepts `images/a.png` and `images/nested/a.png`; rejects absolute paths,
 * traversal, empty segments, and anything outside `images/`.
 */
export function sanitizeAssetRelativePath(rawPath: string): string | null {
  let normalized = rawPath.replace(/\\/g, "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith("//")) return null;
  normalized = normalized.replace(/^\/+/, "");
  if (!normalized) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  if (segments[0] !== "images" || segments.length < 2) return null;
  return normalized;
}
