import { useMemo } from "react";
import {
  FileViewerTabBar,
  RecentFilesQuickList,
} from "./file-viewer-tab-bar.js";
import {
  FileViewerFrame,
  FileViewerStage,
  type FileSourceAdapter,
} from "./file-viewer-stage.js";
import { FileSystemIconSpriteSheet } from "./vendor/file-system/icons.js";
import type { FileViewerViewProps } from "./view-props.js";

/**
 * The workspace File Viewer tab: plugin-owned tab chrome around the shared
 * single-file stage. URL resolution, error states, and the registered viewer
 * (with the AI Text split wrapper) live in FileViewerStage.
 */
export function FileViewerContent({ view }: { view: FileViewerViewProps }) {
  const activeTab =
    view.tabs.find((tab) => tab.path === view.activePath) ??
    view.tabs[0] ??
    null;

  const openPathSet = useMemo(
    () => new Set(view.tabs.map((tab) => tab.path)),
    [view.tabs],
  );

  const source = useMemo<FileSourceAdapter>(
    () => ({
      getUrl: (tab, options) => view.getFileUrl(tab, options),
      revalidateOnFocus: true,
    }),
    [view.getFileUrl],
  );

  if (view.enabled === false) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Autumn Studio is disabled
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Enable Autumn Studio in Settings to browse and preview workspace
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
          Click a file in the explorer or choose “Open file in new tab” from
          the top-right more menu.
        </p>
        {view.onOpenExplorer ? (
          <button
            type="button"
            onClick={view.onOpenExplorer}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Open explorer
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

  return (
    <FileViewerFrame>
      <FileSystemIconSpriteSheet />
      <FileViewerTabBar view={view} activeTab={activeTab} />
      <FileViewerStage view={view} activeTab={activeTab} source={source} />
    </FileViewerFrame>
  );
}
