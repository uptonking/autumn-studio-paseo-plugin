import { homedir } from 'node:os';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_DEPTH = 24;

/**
 * Best-effort recursive byte size. Returns null when the root cannot be read
 * at all; returns the partial sum when the walk hits the entry cap so a huge
 * model cache still reports roughly instead of nothing. Symlinks are skipped
 * because their targets may live anywhere on disk.
 */
export async function computeDirectorySize(
  root: string,
  options: { maxEntries?: number } = {},
): Promise<number | null> {
  const maxEntries = options.maxEntries ?? 20_000;
  let entries = 0;
  let total = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const entry of dirents) {
      entries += 1;
      if (entries > maxEntries) return;
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const info = await stat(full).catch(() => null);
        if (info) total += info.size;
      }
    }
  }

  try {
    await walk(root, 0);
  } catch {
    return total > 0 ? total : null;
  }
  return total;
}

function normalizedSegments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
}

/**
 * Guards model-cache deletion. The path must be absolute, at least two
 * segments deep, and look like a cache: under the home directory it needs
 * three-plus segments (or an explicit "model" name), outside home it must
 * mention cache/model. This keeps a misconfigured artifact path from wiping
 * something broad like `~/Library/Caches` or `/data`.
 */
export function assertClearableCacheDir(dir: string): void {
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalizedSegments(normalized);
  if (!normalized.startsWith('/') || segments.length < 2) {
    throw new Error(`"${dir}" is not an absolute cache directory.`);
  }
  const home = homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized === home || normalized === '/' || normalized === `${home}/.cache`) {
    throw new Error(`Refusing to clear "${dir}" — it does not look like a model cache.`);
  }
  const mentionsModel = /model/i.test(normalized);
  if (normalized.startsWith(`${home}/`)) {
    const depthUnderHome = segments.length - normalizedSegments(home).length;
    if (depthUnderHome < 3 && !mentionsModel) {
      throw new Error(
        `Refusing to clear "${dir}" — home paths need three or more levels to look like a model cache.`,
      );
    }
    return;
  }
  if (!mentionsModel && !/cache/i.test(normalized)) {
    throw new Error(
      `Refusing to clear "${dir}" — it is outside the home directory and does not look like a model cache.`,
    );
  }
}

/** Deletes a guarded cache directory and recreates it empty. */
export async function clearCacheDirectory(dir: string): Promise<void> {
  assertClearableCacheDir(dir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
