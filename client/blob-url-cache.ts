import { clearPdfThumbnailCaches } from "./vendor/lib/pdf-thumbnail-utils.ts";
import {
  dataUriToObjectUrl,
  fileBlobCacheKey,
  type FileOpenRef,
  type GetFileUrlOptions,
} from "./view-props.ts";

interface CachedBlobEntry {
  cacheKey: string;
  updatedAtMs: number | null;
  byteLength: number | null;
  byteHash: number | null;
  promise: Promise<string>;
}

export function hashFileBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function decodeDataUriBytes(dataUri: string): {
  bytes: Uint8Array;
  mimeType: string;
} {
  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new Error("Malformed data URI");
  }
  const header = dataUri.slice(0, comma);
  const body = dataUri.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)/i.exec(header);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  if (/;base64/i.test(header)) {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(body, "base64");
      const out = new Uint8Array(buf.byteLength);
      out.set(buf);
      return { bytes: out, mimeType };
    }
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return { bytes: out, mimeType };
  }
  return {
    bytes: new TextEncoder().encode(decodeURIComponent(body)),
    mimeType,
  };
}

function parseUpdatedAtMs(updatedAt?: string): number | null {
  if (!updatedAt) return null;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

const workspaceFileCache = new Map<string, Map<string, CachedBlobEntry>>();
const workspaceRetiredUrls = new Map<string, Set<Promise<string>>>();
const workspaceInFlightSaves = new Map<string, Map<string, Promise<unknown>>>();
const inAppSavedBlobUrls = new Set<string>();
let sharedWasmUrlPromise: Promise<string> | null = null;
let sharedXlsxWasmDataUriPromise: Promise<string> | null = null;

export function isInAppSavedBlobUrl(url: string | null | undefined): boolean {
  return Boolean(url && inAppSavedBlobUrls.has(url));
}

export function trackWorkspaceFileSave<T>(
  workspaceId: string,
  filePath: string,
  task: () => Promise<T>,
): Promise<T> {
  let wsSaves = workspaceInFlightSaves.get(workspaceId);
  if (!wsSaves) {
    wsSaves = new Map<string, Promise<unknown>>();
    workspaceInFlightSaves.set(workspaceId, wsSaves);
  }
  const previous = wsSaves.get(filePath);
  const chained = (
    previous ? previous.catch(() => undefined) : Promise.resolve()
  ).then(task);
  wsSaves.set(filePath, chained);
  void chained
    .finally(() => {
      if (wsSaves?.get(filePath) === chained) {
        wsSaves.delete(filePath);
      }
    })
    .catch(() => undefined);
  return chained;
}

function revokePromiseUrl(promise: Promise<string>): void {
  promise
    .then((url) => {
      inAppSavedBlobUrls.delete(url);
      if (
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(url);
      }
    })
    .catch(() => {});
}

function retireWorkspaceUrl(
  workspaceId: string,
  promise: Promise<string>,
): void {
  let retired = workspaceRetiredUrls.get(workspaceId);
  if (!retired) {
    retired = new Set<Promise<string>>();
    workspaceRetiredUrls.set(workspaceId, retired);
  }
  retired.add(promise);
}

export function getOrCreateFileBlobUrl(
  workspaceId: string,
  file: FileOpenRef,
  fetchDataUri: (
    relPath: string,
  ) => Promise<{ dataUri: string; size?: number; mtime?: number }>,
  options?: GetFileUrlOptions,
): Promise<string> {
  let wsMap = workspaceFileCache.get(workspaceId);
  if (!wsMap) {
    wsMap = new Map<string, CachedBlobEntry>();
    workspaceFileCache.set(workspaceId, wsMap);
  }

  const inFlightSave = workspaceInFlightSaves.get(workspaceId)?.get(file.path);
  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh && !inFlightSave) {
    const nextKey = fileBlobCacheKey(file);
    const nextUpdatedAtMs = parseUpdatedAtMs(file.updatedAt);
    const existing = wsMap.get(file.path);
    if (existing) {
      if (
        existing.cacheKey === nextKey ||
        !file.updatedAt ||
        (existing.updatedAtMs !== null &&
          nextUpdatedAtMs !== null &&
          nextUpdatedAtMs < existing.updatedAtMs)
      ) {
        return existing.promise;
      }
      retireWorkspaceUrl(workspaceId, existing.promise);
      wsMap.delete(file.path);
    }
  }

  const loadBlobUrl = async (): Promise<string> => {
    const pendingSave = workspaceInFlightSaves.get(workspaceId)?.get(file.path);
    if (pendingSave) {
      await pendingSave.catch(() => undefined);
    }

    const currentMap = workspaceFileCache.get(workspaceId) ?? wsMap;
    const nextKey = fileBlobCacheKey(file);
    const nextUpdatedAtMs = parseUpdatedAtMs(file.updatedAt);
    const existing = currentMap.get(file.path);

    if (!forceRefresh && existing) {
      if (
        existing.cacheKey === nextKey ||
        !file.updatedAt ||
        (existing.updatedAtMs !== null &&
          nextUpdatedAtMs !== null &&
          nextUpdatedAtMs < existing.updatedAtMs)
      ) {
        return existing.promise;
      }
    }

    const result = await fetchDataUri(file.path);
    let decodedPayload: { bytes: Uint8Array; mimeType: string } | null = null;
    let nextByteLength: number | null = null;
    let nextByteHash: number | null = null;
    try {
      decodedPayload = decodeDataUriBytes(result.dataUri);
      nextByteLength = decodedPayload.bytes.byteLength;
      nextByteHash = hashFileBytes(decodedPayload.bytes);
    } catch {
      // Fallback to dataUriToObjectUrl if dataUri is non-standard
    }

    const resolvedUpdatedAt =
      typeof result.mtime === "number"
        ? new Date(result.mtime).toISOString()
        : file.updatedAt;
    const resolvedSize =
      typeof result.size === "number"
        ? result.size
        : (nextByteLength ?? file.size);
    const resolvedKey = fileBlobCacheKey({
      path: file.path,
      updatedAt: resolvedUpdatedAt,
      size: resolvedSize,
    });
    const resolvedUpdatedAtMs =
      typeof result.mtime === "number" ? result.mtime : nextUpdatedAtMs;

    const latestExisting = currentMap.get(file.path);
    if (
      options?.reuseIfUnchanged &&
      latestExisting &&
      nextByteLength !== null &&
      nextByteHash !== null &&
      latestExisting.byteLength === nextByteLength &&
      latestExisting.byteHash === nextByteHash
    ) {
      latestExisting.cacheKey = resolvedKey;
      latestExisting.updatedAtMs = resolvedUpdatedAtMs;
      return latestExisting.promise;
    }

    if (latestExisting) {
      retireWorkspaceUrl(workspaceId, latestExisting.promise);
      currentMap.delete(file.path);
    }

    let objectUrl: string;
    if (decodedPayload) {
      const copy = new Uint8Array(decodedPayload.bytes.byteLength);
      copy.set(decodedPayload.bytes);
      objectUrl = URL.createObjectURL(
        new Blob([copy], { type: decodedPayload.mimeType }),
      );
    } else {
      objectUrl = await dataUriToObjectUrl(result.dataUri);
    }
    currentMap.set(file.path, {
      cacheKey: resolvedKey,
      updatedAtMs: resolvedUpdatedAtMs,
      byteLength: nextByteLength,
      byteHash: nextByteHash,
      promise: Promise.resolve(objectUrl),
    });
    return objectUrl;
  };

  const existingBeforeLoad = wsMap.get(file.path);
  const promise = loadBlobUrl();
  if (!forceRefresh) {
    const nextKey = fileBlobCacheKey(file);
    const nextUpdatedAtMs = parseUpdatedAtMs(file.updatedAt);
    const entry: CachedBlobEntry = {
      cacheKey: nextKey,
      updatedAtMs: nextUpdatedAtMs,
      byteLength: existingBeforeLoad?.byteLength ?? null,
      byteHash: existingBeforeLoad?.byteHash ?? null,
      promise,
    };
    wsMap.set(file.path, entry);

    promise.catch(() => {
      const current = wsMap?.get(file.path);
      if (current === entry) {
        wsMap?.delete(file.path);
      }
    });
  }

  return promise;
}

export function replaceCachedFileBlobUrl(
  workspaceId: string,
  file: FileOpenRef,
  bytes: Uint8Array,
  mimeType = "application/octet-stream",
): string {
  let wsMap = workspaceFileCache.get(workspaceId);
  if (!wsMap) {
    wsMap = new Map<string, CachedBlobEntry>();
    workspaceFileCache.set(workspaceId, wsMap);
  }

  const existing = wsMap.get(file.path);
  if (existing) {
    // Keep superseded URLs alive until workspace cleanup so an active editor
    // (such as PDFEditor re-reading its base sourceUrl) is never broken mid-session.
    retireWorkspaceUrl(workspaceId, existing.promise);
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const nextUrl = URL.createObjectURL(blob);
  inAppSavedBlobUrls.add(nextUrl);
  wsMap.set(file.path, {
    cacheKey: fileBlobCacheKey(file),
    updatedAtMs: parseUpdatedAtMs(file.updatedAt),
    byteLength: copy.byteLength,
    byteHash: hashFileBytes(copy),
    promise: Promise.resolve(nextUrl),
  });
  return nextUrl;
}

export function clearWorkspaceBlobUrls(workspaceId: string): void {
  const wsMap = workspaceFileCache.get(workspaceId);
  if (wsMap) {
    for (const entry of wsMap.values()) {
      revokePromiseUrl(entry.promise);
    }
    wsMap.clear();
    workspaceFileCache.delete(workspaceId);
  }
  const retired = workspaceRetiredUrls.get(workspaceId);
  if (retired) {
    for (const promise of retired) {
      revokePromiseUrl(promise);
    }
    retired.clear();
    workspaceRetiredUrls.delete(workspaceId);
  }
  workspaceInFlightSaves.delete(workspaceId);
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

export function getOrCreateXlsxWasmDataUri(
  fetchWasmDataUri: () => Promise<{ dataUri: string }>,
): Promise<string> {
  if (!sharedXlsxWasmDataUriPromise) {
    const promise = fetchWasmDataUri().then((result) => result.dataUri);
    sharedXlsxWasmDataUriPromise = promise;
    promise.catch(() => {
      if (sharedXlsxWasmDataUriPromise === promise) {
        sharedXlsxWasmDataUriPromise = null;
      }
    });
  }
  return sharedXlsxWasmDataUriPromise;
}

export function disposeAllBlobUrls(): void {
  clearPdfThumbnailCaches();
  const workspaceIds = new Set([
    ...workspaceFileCache.keys(),
    ...workspaceRetiredUrls.keys(),
  ]);
  for (const workspaceId of workspaceIds) {
    clearWorkspaceBlobUrls(workspaceId);
  }
  if (sharedWasmUrlPromise) {
    revokePromiseUrl(sharedWasmUrlPromise);
    sharedWasmUrlPromise = null;
  }
  sharedXlsxWasmDataUriPromise = null;
}
