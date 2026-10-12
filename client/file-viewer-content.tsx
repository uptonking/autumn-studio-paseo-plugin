import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileViewerTabBar,
  RecentFilesQuickList,
} from "./file-viewer-tab-bar.js";
import {
  formatFileLoadError,
  isFileNotFoundError,
} from "./opened-tabs-store.js";
import { Spinner } from "./vendor/components/ui/spinner.js";
import {
  FileSystemIconSpriteSheet,
  FileTypeIcon,
} from "./vendor/file-system/icons.js";
import { viewerKindForFile } from "./vendor/file-system/types.js";
import { fileUrlCacheKey } from "./vendor/file-system/virtual-window.js";
import { setPdfiumWasmResolver } from "./vendor/lib/pdf-thumbnail-utils.js";
import { setXlsxWasmResolver } from "./vendor/xlsx-viewer/wasm-loader.js";
import {
  preloadFileSurfaceForKind,
  RegisteredFileViewer,
  type FileSaveCallbackInput,
} from "./viewers/registry.js";
import type { FileViewerViewProps } from "./view-props.js";

export function FileViewerContent({ view }: { view: FileViewerViewProps }) {
  const [urlByKey, setUrlByKey] = useState<Record<string, string>>({});
  const [urlByPath, setUrlByPath] = useState<Record<string, string>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  if (view.getPdfWasmUrl) {
    setPdfiumWasmResolver(view.getPdfWasmUrl);
  }
  if (view.getXlsxWasmDataUri) {
    setXlsxWasmResolver(view.getXlsxWasmDataUri);
  }

  const activeTab =
    view.tabs.find((tab) => tab.path === view.activePath) ??
    view.tabs[0] ??
    null;

  const activeTabPath = activeTab?.path ?? null;
  const activeCacheKey = activeTab ? fileUrlCacheKey(activeTab) : null;
  const validatedKeyByPathRef = useRef<Record<string, string>>({});
  const previousActivePathRef = useRef<string | null>(null);

  if (previousActivePathRef.current !== activeTabPath) {
    if (activeTabPath) {
      delete validatedKeyByPathRef.current[activeTabPath];
    }
    previousActivePathRef.current = activeTabPath;
  }

  useEffect(() => {
    const openPaths = new Set(view.tabs.map((tab) => tab.path));
    const openKeys = new Set(view.tabs.map((tab) => fileUrlCacheKey(tab)));
    for (const path of Object.keys(validatedKeyByPathRef.current)) {
      if (!openPaths.has(path)) {
        delete validatedKeyByPathRef.current[path];
      }
    }
    setUrlByPath((prev) => {
      const stalePaths = Object.keys(prev).filter((p) => !openPaths.has(p));
      if (stalePaths.length === 0) return prev;
      const next = { ...prev };
      for (const p of stalePaths) delete next[p];
      return next;
    });
    setUrlByKey((prev) => {
      const staleKeys = Object.keys(prev).filter((k) => !openKeys.has(k));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      for (const k of staleKeys) delete next[k];
      return next;
    });
    setErrorByKey((prev) => {
      const staleKeys = Object.keys(prev).filter((k) => !openKeys.has(k));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      for (const k of staleKeys) delete next[k];
      return next;
    });
  }, [view.tabs]);

  useEffect(() => {
    if (view.enabled === false) return;
    if (!activeTab || !activeCacheKey) return;
    if (
      validatedKeyByPathRef.current[activeTab.path] === activeCacheKey &&
      urlByKey[activeCacheKey]
    ) {
      return;
    }

    let cancelled = false;
    setLoadingKey(activeCacheKey);
    setErrorByKey((prev) => {
      if (!prev[activeCacheKey]) return prev;
      const next = { ...prev };
      delete next[activeCacheKey];
      return next;
    });

    const tabKind = viewerKindForFile({
      kind: "file",
      path: activeTab.path,
      name: activeTab.name,
      contentType: activeTab.contentType,
    });

    const isAlreadyOpenTab = Boolean(
      validatedKeyByPathRef.current[activeTab.path],
    );

    Promise.all([
      view.getFileUrl(activeTab, {
        forceRefresh: true,
        reuseIfUnchanged: isAlreadyOpenTab,
      }),
      tabKind
        ? preloadFileSurfaceForKind(tabKind, {
            pdfSettings: view.pdfSettings,
            xlsxSettings: view.xlsxSettings,
            textSettings: view.textSettings,
            formatSettings: view.formatSettings,
          })
        : Promise.resolve(),
    ])
      .then(([resolvedUrl]) => {
        if (cancelled) return;
        validatedKeyByPathRef.current[activeTab.path] = activeCacheKey;
        setUrlByKey((prev) => ({ ...prev, [activeCacheKey]: resolvedUrl }));
        setUrlByPath((prev) => ({ ...prev, [activeTab.path]: resolvedUrl }));
        setLoadingKey((prev) => (prev === activeCacheKey ? null : prev));
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load file";
        setErrorByKey((prev) => ({ ...prev, [activeCacheKey]: message }));
        setLoadingKey((prev) => (prev === activeCacheKey ? null : prev));
      });

    return () => {
      cancelled = true;
    };
  }, [activeCacheKey, activeTab, retryNonce, urlByKey, view]);

  useEffect(() => {
    if (view.enabled === false || !activeTab || typeof window === "undefined") {
      return;
    }
    const revalidateActiveTab = () => {
      const currentKey = fileUrlCacheKey(activeTab);
      void view
        .getFileUrl(activeTab, { forceRefresh: true, reuseIfUnchanged: true })
        .then((nextUrl) => {
          validatedKeyByPathRef.current[activeTab.path] = currentKey;
          setUrlByKey((prev) =>
            prev[currentKey] === nextUrl
              ? prev
              : { ...prev, [currentKey]: nextUrl },
          );
          setUrlByPath((prev) =>
            prev[activeTab.path] === nextUrl
              ? prev
              : { ...prev, [activeTab.path]: nextUrl },
          );
        })
        .catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") revalidateActiveTab();
    };
    window.addEventListener("focus", revalidateActiveTab);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", revalidateActiveTab);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeTab, view]);

  const handleSaveFile = useCallback(
    async (input: FileSaveCallbackInput) => {
      if (!view.onSaveFile) {
        throw new Error("File save handler is not configured");
      }
      const saved = await view.onSaveFile(input);
      const nextCacheKey = fileUrlCacheKey({
        path: saved.path,
        size: saved.size,
        updatedAt: new Date(saved.mtime).toISOString(),
      });
      validatedKeyByPathRef.current[saved.path] = nextCacheKey;
      queueMicrotask(() => {
        setUrlByKey((prev) => ({ ...prev, [nextCacheKey]: saved.blobUrl }));
        setUrlByPath((prev) => ({ ...prev, [saved.path]: saved.blobUrl }));
      });
      return saved;
    },
    [view],
  );

  const handleActiveTabDirtyChange = useCallback(
    (isDirty: boolean) => {
      if (!activeTabPath) return;
      view.onTabDirtyChange?.(activeTabPath, isDirty);
    },
    [activeTabPath, view],
  );

  const openPathSet = useMemo(
    () => new Set(view.tabs.map((tab) => tab.path)),
    [view.tabs],
  );

  const activeError = activeCacheKey
    ? (errorByKey[activeCacheKey] ?? null)
    : null;
  const isMissingFileError = Boolean(
    activeError && isFileNotFoundError(activeError),
  );

  useEffect(() => {
    if (isMissingFileError && activeTabPath) {
      view.onRemoveRecentFile?.(activeTabPath);
    }
  }, [activeTabPath, isMissingFileError, view]);

  if (view.enabled === false) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          File Explorer is disabled
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Enable File Explorer in Settings to browse and preview workspace
          files.
        </p>
        {view.onOpenSettings ? (
          <button
            type="button"
            onClick={view.onOpenSettings}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Open settings
          </button>
        ) : null}
      </div>
    );
  }

  if (!activeTab) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileSystemIconSpriteSheet />
        <p className="text-sm font-medium text-foreground">
          No file open in tab
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Click a file in File Explorer or choose “Open file in new tab” from
          the top-right more menu.
        </p>
        {view.onOpenExplorer ? (
          <button
            type="button"
            onClick={view.onOpenExplorer}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Open File Explorer
          </button>
        ) : null}
        {view.onOpenRecentFile ? (
          <RecentFilesQuickList
            recentFiles={view.recentFiles ?? []}
            openPathSet={openPathSet}
            testId="file-viewer-empty-recent-files"
            itemTestIdPrefix="file-viewer-empty-recent-item-"
            onSelectFile={(file) => view.onOpenRecentFile?.(file)}
            onClearRecentFiles={view.onClearRecentFiles}
          />
        ) : null}
      </div>
    );
  }

  const activeUrl =
    (activeCacheKey ? urlByKey[activeCacheKey] : undefined) ??
    urlByPath[activeTab.path] ??
    null;
  const isResolving = loadingKey === activeCacheKey && !activeUrl;
  const viewerKind = viewerKindForFile({
    kind: "file",
    path: activeTab.path,
    name: activeTab.name,
    contentType: activeTab.contentType,
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <FileSystemIconSpriteSheet />
      <FileViewerTabBar view={view} activeTab={activeTab} />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeError ? (
          isMissingFileError ? (
            <div
              data-testid="file-viewer-missing-file"
              className="flex h-full w-full flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
                <FileTypeIcon fileName={activeTab.name} className="size-6" />
              </div>
              <div className="flex max-w-md flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  “{activeTab.name}” was moved or deleted
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  The file at{" "}
                  <span className="font-mono text-foreground/80">
                    {activeTab.path}
                  </span>{" "}
                  could not be found on the filesystem.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  data-testid="file-viewer-missing-close-tab"
                  onClick={() => view.onCloseTab(activeTab.path)}
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  Close tab
                </button>
                {view.onOpenExplorer ? (
                  <button
                    type="button"
                    onClick={view.onOpenExplorer}
                    className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    Open File Explorer
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="file-viewer-missing-retry"
                  onClick={() => {
                    delete validatedKeyByPathRef.current[activeTab.path];
                    setRetryNonce((count) => count + 1);
                  }}
                  className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Retry
                </button>
              </div>
              <RecentFilesQuickList
                recentFiles={view.recentFiles ?? []}
                excludePath={activeTab.path}
                openPathSet={openPathSet}
                testId="file-viewer-missing-recent-files"
                itemTestIdPrefix="file-viewer-missing-recent-item-"
                onSelectFile={(file) => {
                  const missingPath = activeTab.path;
                  if (view.onOpenRecentFile) {
                    view.onOpenRecentFile(file);
                  } else {
                    view.onSelectTab(file.path);
                  }
                  if (file.path !== missingPath) {
                    view.onCloseTab(missingPath);
                  }
                }}
                onClearRecentFiles={view.onClearRecentFiles}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">
                {formatFileLoadError(activeError, activeTab.name)}
              </p>
              <button
                type="button"
                onClick={() => {
                  delete validatedKeyByPathRef.current[activeTab.path];
                  setRetryNonce((count) => count + 1);
                }}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Retry
              </button>
            </div>
          )
        ) : isResolving || !activeUrl ? (
          <div className="grid h-full flex-1 place-items-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : viewerKind ? (
          <RegisteredFileViewer
            key={activeTab.path}
            kind={viewerKind}
            src={activeUrl}
            filePath={activeTab.path}
            fileName={activeTab.name}
            contentType={activeTab.contentType}
            variant="tab"
            autoSaveEdits={view.autoSaveEdits}
            pdfSettings={view.pdfSettings}
            xlsxSettings={view.xlsxSettings}
            textSettings={view.textSettings}
            formatSettings={view.formatSettings}
            onSaveFile={view.onSaveFile ? handleSaveFile : undefined}
            onDirtyChange={
              view.onTabDirtyChange ? handleActiveTabDirtyChange : undefined
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              Preview not available for {activeTab.name}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
