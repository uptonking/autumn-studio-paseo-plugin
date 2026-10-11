import {
  dataUriToObjectUrl,
  fileBlobCacheKey,
  type FileOpenRef,
} from "./view-props.js";

interface CachedBlobEntry {
  cacheKey: string;
  promise: Promise<string>;
}

const workspaceFileCache = new Map<string, Map<string, CachedBlobEntry>>();
let sharedWasmUrlPromise: Promise<string> | null = null;

function revokePromiseUrl(promise: Promise<string>): void {
  promise
    .then((url) => {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    })
    .catch(() => {});
}

export function getOrCreateFileBlobUrl(
  workspaceId: string,
  file: FileOpenRef,
  fetchDataUri: (relPath: string) => Promise<{ dataUri: string }>,
): Promise<string> {
  let wsMap = workspaceFileCache.get(workspaceId);
  if (!wsMap) {
    wsMap = new Map<string, CachedBlobEntry>();
    workspaceFileCache.set(workspaceId, wsMap);
  }

  const nextKey = fileBlobCacheKey(file);
  const existing = wsMap.get(file.path);
  if (existing) {
    if (existing.cacheKey === nextKey || !file.updatedAt) {
      return existing.promise;
    }
    revokePromiseUrl(existing.promise);
    wsMap.delete(file.path);
  }

  const promise = fetchDataUri(file.path).then((result) =>
    dataUriToObjectUrl(result.dataUri),
  );
  const entry: CachedBlobEntry = { cacheKey: nextKey, promise };
  wsMap.set(file.path, entry);

  promise.catch(() => {
    const current = wsMap?.get(file.path);
    if (current === entry) {
      wsMap?.delete(file.path);
    }
  });

  return promise;
}

export function clearWorkspaceBlobUrls(workspaceId: string): void {
  const wsMap = workspaceFileCache.get(workspaceId);
  if (!wsMap) return;
  for (const entry of wsMap.values()) {
    revokePromiseUrl(entry.promise);
  }
  wsMap.clear();
  workspaceFileCache.delete(workspaceId);
}

export function getOrCreatePdfWasmBlobUrl(
  fetchWasmDataUri: () => Promise<{ dataUri: string }>,
): Promise<string> {
  if (!sharedWasmUrlPromise) {
    const promise = fetchWasmDataUri().then((result) =>
      dataUriToObjectUrl(result.dataUri),
    );
    sharedWasmUrlPromise = promise;
    promise.catch(() => {
      if (sharedWasmUrlPromise === promise) {
        sharedWasmUrlPromise = null;
      }
    });
  }
  return sharedWasmUrlPromise;
}

export function disposeAllBlobUrls(): void {
  for (const workspaceId of [...workspaceFileCache.keys()]) {
    clearWorkspaceBlobUrls(workspaceId);
  }
  if (sharedWasmUrlPromise) {
    revokePromiseUrl(sharedWasmUrlPromise);
    sharedWasmUrlPromise = null;
  }
}
