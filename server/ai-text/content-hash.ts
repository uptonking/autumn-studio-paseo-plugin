import { createHash } from 'node:crypto';

/** SHA-256 of the Markdown text, used as the version's extraction fingerprint. */
export function hashAiTextContent(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

/**
 * Whether the stored Markdown still matches what the extractor wrote.
 * `null` means the version predates fingerprinting, so nothing can be proven
 * and the legacy heuristics decide.
 */
export function isContentEditedSinceExtraction(
  recordedHash: string | undefined,
  content: string | null,
): boolean | null {
  if (!recordedHash || content === null) return null;
  return hashAiTextContent(content) !== recordedHash;
}

/**
 * Resolves whether the stored Markdown outranks the extraction layout for a
 * version record:
 * - `contentHash` present: the file differs from what the extractor wrote;
 * - only `savedContentHash` (pre-fingerprint version saved by the app): the
 *   stored Markdown is exactly what the user saved, so it stays authoritative
 *   even after a restart;
 * - neither: unknown, keep the legacy source resolution.
 */
export function resolveActiveContentEdited(
  version: { contentHash?: string; savedContentHash?: string } | null | undefined,
  content: string | null,
): boolean | null {
  if (!version || content === null) return null;
  if (version.contentHash) return hashAiTextContent(content) !== version.contentHash;
  if (version.savedContentHash) return true;
  return null;
}
