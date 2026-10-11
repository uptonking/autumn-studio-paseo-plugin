import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./vendor/components/ui/dropdown-menu.js";
import { Spinner } from "./vendor/components/ui/spinner.js";
import { viewerKindForFile } from "./vendor/file-system/types.js";
import { fileUrlCacheKey } from "./vendor/file-system/virtual-window.js";
import { IconPlaceholder } from "./vendor/icon-placeholder.js";
import { setPdfiumWasmResolver } from "./vendor/lib/pdf-thumbnail-utils.js";
import { cn } from "./vendor/lib/utils.js";
import { RegisteredFileViewer } from "./viewers/registry.js";
import type { FileViewerViewProps } from "./view-props.js";

export function FileViewerContent({ view }: { view: FileViewerViewProps }) {
  const [urlByKey, setUrlByKey] = useState<Record<string, string>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (view.getPdfWasmUrl) {
      setPdfiumWasmResolver(view.getPdfWasmUrl);
    }
  }, [view.getPdfWasmUrl]);

  const activeTab =
    view.tabs.find((tab) => tab.path === view.activePath) ?? view.tabs[0] ?? null;

  const activeCacheKey = activeTab ? fileUrlCacheKey(activeTab) : null;

  useEffect(() => {
    if (view.enabled === false) return;
    if (!activeTab || !activeCacheKey) return;
    if (urlByKey[activeCacheKey]) return;

    let cancelled = false;
    setLoadingKey(activeCacheKey);
    setErrorByKey((prev) => {
      if (!prev[activeCacheKey]) return prev;
      const next = { ...prev };
      delete next[activeCacheKey];
      return next;
    });

    view
      .getFileUrl(activeTab)
      .then((resolvedUrl) => {
        if (cancelled) return;
        setUrlByKey((prev) => ({ ...prev, [activeCacheKey]: resolvedUrl }));
        setLoadingKey((prev) => (prev === activeCacheKey ? null : prev));
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load file";
        setErrorByKey((prev) => ({ ...prev, [activeCacheKey]: message }));
        setLoadingKey((prev) => (prev === activeCacheKey ? null : prev));
      });

    return () => {
      cancelled = true;
    };
  }, [activeCacheKey, activeTab, urlByKey, view]);

  if (view.enabled === false) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          File Explorer is disabled
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Enable File Explorer in Settings to browse and preview workspace files.
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
        <p className="text-sm font-medium text-foreground">No file open in tab</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Click a file in File Explorer or choose “Open file in new tab” from the top-right more menu.
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
      </div>
    );
  }

  const activeUrl = activeCacheKey ? (urlByKey[activeCacheKey] ?? null) : null;
  const activeError = activeCacheKey ? (errorByKey[activeCacheKey] ?? null) : null;
  const isResolving = loadingKey === activeCacheKey && !activeUrl;
  const viewerKind = viewerKindForFile({
    kind: "file",
    path: activeTab.path,
    name: activeTab.name,
    contentType: activeTab.contentType,
  });

  const hasMoreMenu = Boolean(
    view.onCloseAllTabs || view.onOpenExplorer || view.onOpenSettings,
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2">
        <div
          role="tablist"
          aria-label="Opened files"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {view.tabs.map((tab) => {
            const isActive = tab.path === activeTab.path;
            return (
              <div
                key={tab.path}
                className={cn(
                  "group flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                  isActive
                    ? "border-border bg-background font-medium text-foreground shadow-xs"
                    : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => view.onSelectTab(tab.path)}
                  className="max-w-44 truncate text-left outline-none"
                  title={tab.path}
                >
                  {tab.name}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.name}`}
                  title={`Close ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    view.onCloseTab(tab.path);
                  }}
                  className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <IconPlaceholder lucide="X" className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        {hasMoreMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                title="More actions"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconPlaceholder lucide="Ellipsis" className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {view.onCloseAllTabs && view.tabs.length > 0 ? (
                <>
                  <DropdownMenuItem onClick={view.onCloseAllTabs}>
                    <IconPlaceholder lucide="X" className="size-4" />
                    Close all tabs
                  </DropdownMenuItem>
                  {view.onOpenExplorer || view.onOpenSettings ? (
                    <DropdownMenuSeparator />
                  ) : null}
                </>
              ) : null}
              {view.onOpenExplorer ? (
                <DropdownMenuItem onClick={view.onOpenExplorer}>
                  <IconPlaceholder lucide="PanelLeft" className="size-4" />
                  Open File Explorer
                </DropdownMenuItem>
              ) : null}
              {view.onOpenSettings ? (
                <DropdownMenuItem onClick={view.onOpenSettings}>
                  <IconPlaceholder lucide="Settings" className="size-4" />
                  File Explorer settings
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-destructive">{activeError}</p>
          </div>
        ) : isResolving || !activeUrl ? (
          <div className="grid h-full flex-1 place-items-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : viewerKind ? (
          <RegisteredFileViewer
            key={activeTab.path}
            kind={viewerKind}
            src={activeUrl}
            fileName={activeTab.name}
            variant="tab"
            pdfSettings={view.pdfSettings}
            textSettings={view.textSettings}
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
