/**
 * Parsing for the AI Text output root setting. The same rules run in the
 * settings UI (live preview) and on the server (path resolution), so the
 * preview can never lie about what the daemon will use.
 */
export const DEFAULT_AI_TEXT_OUTPUT_ROOT = ".autumn";

export type AiTextOutputRootParse =
  | { ok: true; kind: "workspace-relative" | "absolute"; value: string }
  | { ok: false; reason: string };

const WINDOWS_DRIVE = /^[A-Za-z]:/;

/**
 * Accepts a workspace-relative folder (`.autumn`, `docs/extracted`) or an
 * absolute path (`/data/ai-text`, `~/ai-text`, `D:\ai-text`). Rejects `..`
 * segments and degenerate roots; the caller decides what an absolute root
 * means on disk (the server namespaces it per workspace).
 */
export function parseAiTextOutputRoot(value: string): AiTextOutputRootParse {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return { ok: false, reason: "The directory is empty." };
  }
  if (normalized.includes("\0")) {
    return { ok: false, reason: "The directory contains a NUL character." };
  }
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.includes("..")) {
    return { ok: false, reason: 'Path segments cannot include "..".' };
  }
  const absolute =
    normalized.startsWith("/") ||
    normalized.startsWith("~") ||
    WINDOWS_DRIVE.test(normalized);
  if (absolute && segments.length <= 1) {
    return {
      ok: false,
      reason: "Choose a directory below the filesystem or home root.",
    };
  }
  return {
    ok: true,
    kind: absolute ? "absolute" : "workspace-relative",
    value: absolute ? normalized : segments.join("/"),
  };
}

/** Sanitized stored value, or the default when it cannot be parsed. */
export function normalizeAiTextOutputRootDir(value: string | undefined): string {
  const parsed = parseAiTextOutputRoot(
    value && value.trim() ? value : DEFAULT_AI_TEXT_OUTPUT_ROOT,
  );
  return parsed.ok ? parsed.value : DEFAULT_AI_TEXT_OUTPUT_ROOT;
}
