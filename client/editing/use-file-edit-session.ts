import * as React from 'react';
import { replaceCachedFileBlobUrl, trackWorkspaceFileSave } from '../blob-url-cache.ts';
import { updateFileTabMetadataInStore } from '../opened-tabs-store.ts';

export type SerializedFilePayload =
  | {
      encoding: 'bytes';
      bytes: Uint8Array;
      mimeType?: string;
    }
  | {
      encoding: 'base64';
      data: string;
      bytes?: Uint8Array;
      mimeType?: string;
    }
  | {
      encoding: 'utf8';
      data: string;
      mimeType?: string;
    };

export type FileSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Why a save failed: version conflict, deleted file, or anything else. */
export type SaveErrorKind = 'conflict' | 'deleted' | 'other' | null;

/** Classifies a save failure by the PluginFile error names the SDK throws. */
export function classifySaveError(err: unknown): SaveErrorKind {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    if (name === 'PluginFileConflictError') return 'conflict';
    if (name === 'PluginFileDeletedError') return 'deleted';
  }
  return 'other';
}

export interface FileEditSession {
  /** Current workspace-relative path */
  path: string;
  /** Whether the document has unsaved changes */
  isDirty: boolean;
  /** Current save status */
  saveState: FileSaveState;
  /** Last saved timestamp (ms) */
  lastSavedAt: number | null;
  /** Error message if the most recent save failed */
  saveError: string | null;
  /** Classification of the most recent save failure */
  saveErrorKind: SaveErrorKind;
  /**Whether automatic file-system save is enabled */
  autoSave: boolean;
  /**
   * Report a document mutation with a lazy serializer.
   * When `autoSave` is true (default), schedules a debounced write to the file system.
   */
  reportChange: (serialize: () => Promise<SerializedFilePayload> | SerializedFilePayload) => void;
  /** Immediately flush pending changes (or an explicit payload) to the file system */
  saveNow: (
    explicitPayload?:
      | SerializedFilePayload
      | (() => Promise<SerializedFilePayload> | SerializedFilePayload),
    options?: { force?: boolean },
  ) => Promise<boolean>;
  /**
   * Register a synchronous callback that commits any active UI input (e.g. a
   * focused spreadsheet cell `<input>` or draft annotation) before saving,
   * switching roles, or unmounting.
   */
  registerBeforeSaveFlush: (flush: () => void) => () => void;
  /** Synchronously invokes all registered `beforeSaveFlush` callbacks. */
  flushBeforeSave: () => void;
  /**
   * Drops pending edits without saving: clears the dirty state and save
   * error. The host surface re-initializes its renderer from the current
   * file URL afterwards.
   */
  discardPendingChanges: () => void;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Payload bytes for a save, regardless of how the surface serialized it. */
export function serializedPayloadToBytes(payload: SerializedFilePayload): Uint8Array {
  if (payload.encoding === 'utf8') {
    return new TextEncoder().encode(payload.data);
  }
  if (payload.encoding === 'bytes') {
    return payload.bytes;
  }
  return payload.bytes ?? base64ToUint8Array(payload.data);
}

export interface PersistFileChangeOptions {
  workspaceId: string;
  relPath: string;
  contentType?: string;
  payload: SerializedFilePayload;
  callSaveRpc: (input: {
    workspaceId: string;
    relPath: string;
    content: string;
    encoding: 'base64' | 'utf8';
  }) => Promise<{ path: string; size: number; mtime: number }>;
  onSaved?: (info: { path: string; size: number; mtime: number; blobUrl: string }) => void;
}

export async function persistSerializedFile({
  workspaceId,
  relPath,
  contentType,
  payload,
  callSaveRpc,
  onSaved,
}: PersistFileChangeOptions): Promise<{
  path: string;
  size: number;
  mtime: number;
  blobUrl: string;
}> {
  return trackWorkspaceFileSave(workspaceId, relPath, async () => {
    let rpcEncoding: 'base64' | 'utf8';
    let rpcContent: string;
    const resolvedMime = payload.mimeType ?? contentType ?? 'application/octet-stream';

    if (payload.encoding === 'utf8') {
      rpcEncoding = 'utf8';
      rpcContent = payload.data;
    } else if (payload.encoding === 'bytes') {
      rpcEncoding = 'base64';
      rpcContent = uint8ArrayToBase64(payload.bytes);
    } else {
      rpcEncoding = 'base64';
      rpcContent = payload.data;
    }
    const nextBytes = serializedPayloadToBytes(payload);

    const saved = await callSaveRpc({
      workspaceId,
      relPath,
      content: rpcContent,
      encoding: rpcEncoding,
    });

    const updatedAt = new Date(saved.mtime).toISOString();
    const nextBlobUrl = replaceCachedFileBlobUrl(
      workspaceId,
      { path: relPath, size: saved.size, updatedAt },
      nextBytes,
      resolvedMime,
    );
    updateFileTabMetadataInStore(workspaceId, relPath, {
      size: saved.size,
      updatedAt,
    });
    onSaved?.({
      path: saved.path,
      size: saved.size,
      mtime: saved.mtime,
      blobUrl: nextBlobUrl,
    });

    return {
      path: saved.path,
      size: saved.size,
      mtime: saved.mtime,
      blobUrl: nextBlobUrl,
    };
  });
}

export interface UseFileEditSessionOptions {
  path: string;
  autoSave?: boolean;
  debounceMs?: number;
  onSavePayload?: (payload: SerializedFilePayload, options?: { force?: boolean }) => Promise<void>;
}

const activeFlushersByPath = new Map<string, Set<() => Promise<boolean>>>();

export async function flushActiveFileEditSession(path: string): Promise<boolean> {
  const flushers = activeFlushersByPath.get(path);
  if (!flushers || flushers.size === 0) {
    return false;
  }
  let didSave = false;
  // Snapshot: a flush may unregister itself from the Set mid-iteration.
  // eslint-disable-next-line unicorn/no-useless-spread
  for (const flush of [...flushers]) {
    try {
      if (await flush()) {
        didSave = true;
      }
    } catch {
      // Ignore individual flush errors
    }
  }
  return didSave;
}

export function useFileEditSession({
  path,
  autoSave = true,
  debounceMs = 650,
  onSavePayload,
}: UseFileEditSessionOptions): FileEditSession {
  const [isDirty, setIsDirty] = React.useState(false);
  const [saveState, setSaveState] = React.useState<FileSaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = React.useState<SaveErrorKind>(null);

  const pendingSerializerRef = React.useRef<
    (() => Promise<SerializedFilePayload> | SerializedFilePayload) | null
  >(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = React.useRef(0);
  const onSavePayloadRef = React.useRef(onSavePayload);
  onSavePayloadRef.current = onSavePayload;

  const autoSaveRef = React.useRef(autoSave);
  autoSaveRef.current = autoSave;
  const beforeSaveFlushesRef = React.useRef<Set<() => void>>(new Set());

  const registerBeforeSaveFlush = React.useCallback((flush: () => void) => {
    beforeSaveFlushesRef.current.add(flush);
    return () => {
      beforeSaveFlushesRef.current.delete(flush);
    };
  }, []);

  const flushBeforeSave = React.useCallback(() => {
    for (const flush of beforeSaveFlushesRef.current) {
      try {
        flush();
      } catch {
        // Ignore individual flush errors
      }
    }
  }, []);

  const discardPendingChanges = React.useCallback(() => {
    pendingSerializerRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    saveGenerationRef.current += 1;
    setIsDirty(false);
    setSaveState('idle');
    setSaveError(null);
    setSaveErrorKind(null);
  }, []);

  const flushPendingOnCleanup = React.useCallback(() => {
    flushBeforeSave();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const serializer = pendingSerializerRef.current;
    const saveHandler = onSavePayloadRef.current;
    if (autoSaveRef.current && serializer && saveHandler) {
      pendingSerializerRef.current = null;
      try {
        const payloadOrPromise = serializer();
        if (payloadOrPromise instanceof Promise) {
          void payloadOrPromise.then((payload) => saveHandler(payload)).catch(() => {});
        } else {
          void saveHandler(payloadOrPromise).catch(() => {});
        }
      } catch {
        // Ignore serialization failure during unmount cleanup
      }
    }
  }, [flushBeforeSave]);

  React.useEffect(() => {
    setIsDirty(false);
    setSaveState('idle');
    setLastSavedAt(null);
    setSaveError(null);
    setSaveErrorKind(null);
    pendingSerializerRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      flushPendingOnCleanup();
    };
  }, [flushPendingOnCleanup, path]);

  const saveNow = React.useCallback(
    async (
      explicitPayload?:
        | SerializedFilePayload
        | (() => Promise<SerializedFilePayload> | SerializedFilePayload),
      options?: { force?: boolean },
    ): Promise<boolean> => {
      if (!explicitPayload) {
        flushBeforeSave();
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const saveHandler = onSavePayloadRef.current;
      const serializer =
        typeof explicitPayload === 'function'
          ? explicitPayload
          : explicitPayload
            ? () => explicitPayload
            : pendingSerializerRef.current;

      if (!saveHandler || !serializer) {
        return false;
      }

      const currentGen = ++saveGenerationRef.current;
      setSaveState('saving');
      setSaveError(null);
      setSaveErrorKind(null);

      try {
        const payloadOrPromise = serializer();
        const saveTask =
          payloadOrPromise instanceof Promise
            ? payloadOrPromise.then((payload) => saveHandler(payload, { force: options?.force }))
            : saveHandler(payloadOrPromise, { force: options?.force });
        await saveTask;
        if (currentGen === saveGenerationRef.current) {
          pendingSerializerRef.current = null;
          setIsDirty(false);
          setSaveState('saved');
          setLastSavedAt(Date.now());
        }
        return true;
      } catch (err) {
        if (currentGen === saveGenerationRef.current) {
          setSaveState('error');
          setSaveError(err instanceof Error ? err.message : String(err));
          setSaveErrorKind(classifySaveError(err));
        }
        return false;
      }
    },
    [flushBeforeSave],
  );

  const reportChange = React.useCallback(
    (serialize: () => Promise<SerializedFilePayload> | SerializedFilePayload) => {
      pendingSerializerRef.current = serialize;
      saveGenerationRef.current += 1;
      setIsDirty(true);
      setSaveState('dirty');
      setSaveError(null);
      setSaveErrorKind(null);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (autoSave && onSavePayloadRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void saveNow();
        }, debounceMs);
      }
    },
    [autoSave, debounceMs, saveNow],
  );

  React.useEffect(() => {
    if (!path) return;
    const flusher = async () => {
      flushBeforeSave();
      if (autoSaveRef.current && pendingSerializerRef.current) {
        return await saveNow();
      }
      return false;
    };
    let set = activeFlushersByPath.get(path);
    if (!set) {
      set = new Set();
      activeFlushersByPath.set(path, set);
    }
    set.add(flusher);
    return () => {
      const currentSet = activeFlushersByPath.get(path);
      if (currentSet) {
        currentSet.delete(flusher);
        if (currentSet.size === 0) {
          activeFlushersByPath.delete(path);
        }
      }
    };
  }, [flushBeforeSave, path, saveNow]);

  return React.useMemo(
    () => ({
      path,
      isDirty,
      saveState,
      lastSavedAt,
      saveError,
      saveErrorKind,
      autoSave,
      reportChange,
      saveNow,
      registerBeforeSaveFlush,
      flushBeforeSave,
      discardPendingChanges,
    }),
    [
      autoSave,
      discardPendingChanges,
      flushBeforeSave,
      isDirty,
      lastSavedAt,
      path,
      registerBeforeSaveFlush,
      reportChange,
      saveError,
      saveErrorKind,
      saveNow,
      saveState,
    ],
  );
}
