import type { PluginFile } from '@getpaseo/plugin/client';
import { invalidateWorkspaceFileBlobUrl, trackWorkspaceFileSave } from '../blob-url-cache.ts';
import { updateFileTabMetadataInStore } from '../opened-tabs-store.ts';
import { serializedPayloadToBytes, type SerializedFilePayload } from './use-file-edit-session.ts';

export interface PluginFileSaveOptions {
  workspaceId: string;
  /**
   * The viewer's file identity: workspace-relative when the file is inside
   * the workspace (matching the workspace surface's keys), otherwise the
   * absolute path. Cross-surface bookkeeping calls are no-ops for paths the
   * workspace surface does not know.
   */
  filePath: string;
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
 */
export async function saveSerializedFileViaPluginFile({
  workspaceId,
  filePath,
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
  // Serialized with the workspace surface's per-path save chain so native
  // writes and RPC saves of the same file never interleave, and workspace
  // reads wait for the in-flight write.
  return trackWorkspaceFileSave(workspaceId, filePath, async () => {
    const bytes = serializedPayloadToBytes(payload);
    await file.writeBytes(bytes, { force });

    // The handle's stat fields hold the latest version Paseo knows,
    // including its own writes; the fresh url() resolves for exactly those
    // bytes.
    const size = file.size;
    const mtime = Date.parse(file.modifiedAt) || Date.now();
    const updatedAt = new Date(mtime).toISOString();
    const blobUrl = await file.url();

    invalidateWorkspaceFileBlobUrl(workspaceId, filePath);
    updateFileTabMetadataInStore(workspaceId, filePath, { size, updatedAt });

    const result = { path: filePath, size, mtime, blobUrl };
    onSaved?.(result);
    return result;
  });
}
