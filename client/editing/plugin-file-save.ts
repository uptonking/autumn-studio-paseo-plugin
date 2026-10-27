import type { PluginFile } from '@getpaseo/plugin/client';
import { invalidateWorkspaceFileBlobUrl, trackWorkspaceFileSave } from '../blob-url-cache.ts';
import { updateFileTabMetadataInStore } from '../opened-tabs-store.ts';
import { serializedPayloadToBytes, type SerializedFilePayload } from './use-file-edit-session.ts';

export interface PluginFileSaveOptions {
  workspaceId: string;
  /**
   * The panel's own file identity: workspace-relative when the file is inside
   * the workspace (matching the workspace surface's keys), otherwise the
   * absolute path. This is the only file the PluginFile handle can write.
   */
  openFilePath: string;
  /**
   * Workspace-relative path the save targets. It must be `openFilePath`: the
   * AI Text pane saves its version Markdown by path, and routing that write
   * through the open document's handle would overwrite the open document.
   */
  targetPath: string;
  file: PluginFile;
  payload: SerializedFilePayload;
  /** Overwrite a file that changed on disk since the handle last read it. */
  force?: boolean;
  onSaved?: (info: { path: string; size: number; mtime: number; blobUrl: string }) => void;
}

/**
 * Saves through the native file panel's PluginFile handle instead of the
 * workspace RPC: version-checked writes (PluginFileConflictError on disk
 * changes), a fresh Paseo-owned URL for the new bytes, and cache/tab
 * bookkeeping so the workspace File Viewer surface sees the change too.
 *
 * The handle has no path parameter — `writeBytes` always replaces the file the
 * panel has open — so a mismatched `targetPath` is a programming error that
 * would corrupt an unrelated document. Callers that save other workspace files
 * must use the `file.save` RPC instead.
 */
export async function saveSerializedFileViaPluginFile({
  workspaceId,
  openFilePath,
  targetPath,
  file,
  payload,
  force,
  onSaved,
}: PluginFileSaveOptions): Promise<{
  path: string;
  size: number;
  mtime: number;
  blobUrl: string;
}> {
  if (targetPath !== openFilePath) {
    throw new Error(
      `Refusing to save "${targetPath}" through the native file handle for "${openFilePath}"`,
    );
  }
  // Serialized with the workspace surface's per-path save chain so native
  // writes and RPC saves of the same file never interleave, and workspace
  // reads wait for the in-flight write.
  return trackWorkspaceFileSave(workspaceId, openFilePath, async () => {
    const bytes = serializedPayloadToBytes(payload);
    await file.writeBytes(bytes, { force });

    // The handle's stat fields hold the latest version Paseo knows,
    // including its own writes; the fresh url() resolves for exactly those
    // bytes.
    const size = file.size;
    const mtime = Date.parse(file.modifiedAt) || Date.now();
    const updatedAt = new Date(mtime).toISOString();
    const blobUrl = await file.url();

    invalidateWorkspaceFileBlobUrl(workspaceId, openFilePath);
    updateFileTabMetadataInStore(workspaceId, openFilePath, { size, updatedAt });

    const result = { path: openFilePath, size, mtime, blobUrl };
    onSaved?.(result);
    return result;
  });
}
