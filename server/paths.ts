import { realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

/**
 * Resolves a workspace id to its directory on disk.
 *
 * The backend looks this up itself rather than accepting a path from the
 * client, so a compromised or buggy surface cannot widen the plugin's reach
 * by asking for a different root.
 */
export async function workspaceRoot(paseo: any, workspaceId: string): Promise<string> {
  const { entries } = await paseo.workspaces.list();
  const ws = entries.find((w: any) => w.id === workspaceId);
  if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);
  const dir = ws.workspaceDirectory ?? ws.projectRootPath;
  if (!dir) throw new Error(`Workspace ${workspaceId} has no directory on disk`);
  return await realpath(dir);
}

/**
 * Resolves a workspace-relative path and refuses anything outside the root.
 *
 * realpath runs before the containment check so that a symlink pointing out
 * of the tree is caught, not just a `../` in the literal path. Plugin
 * backends are unsandboxed, so this is the only thing keeping the viewer
 * scoped to the workspace.
 */
export async function safeResolve(root: string, relPath: string): Promise<string> {
  if (relPath.includes("\0")) throw new Error("Invalid path");
  const realRoot = await realpath(root);
  const normalizedRel = relPath.replace(/^\/+/, "");
  let target: string;
  try {
    target = await realpath(resolve(realRoot, normalizedRel));
  } catch (err: any) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      throw new Error(`ENOENT: File not found: ${normalizedRel}`);
    }
    throw err;
  }
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
  if (target !== realRoot && !target.startsWith(rootPrefix)) {
    throw new Error("Path escapes the workspace");
  }
  return target;
}

/**
 * Atomically replaces an existing file by writing to a sibling temporary file
 * with preserved permissions and renaming it over the target path. This
 * prevents external file watchers and macOS apps from observing truncated or
 * partially written files.
 */
export async function atomicWriteFile(
  filePath: string,
  data: Buffer | Uint8Array,
  mode?: number,
): Promise<{ size: number; mtimeMs: number }> {
  const existingStats = await stat(filePath);
  if (existingStats.isDirectory()) {
    throw new Error("Cannot overwrite a directory");
  }
  const dir = dirname(filePath);
  const base = basename(filePath);
  const tempPath = join(
    dir,
    `.${base}.paseo-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  try {
    await writeFile(tempPath, data, {
      mode: mode ?? existingStats.mode,
    });
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

