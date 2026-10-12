import { Suspense } from "react";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSurfaceProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { FileExplorerPanel } from "./client/file-explorer-panel.js";
import { FileViewerPanel } from "./client/file-viewer-panel.js";
import { lazyWithPreload } from "./client/lazy-with-preload.js";
import { openFileTabInStore } from "./client/opened-tabs-store.js";
import {
  FileExplorerSidebarItem,
  openFileExplorerSettingsScreen,
  setSettingsScreenPreloader,
} from "./client/sidebar-item.js";
import type { FileOpenRef } from "./client/view-props.js";

const LazyFileExplorerSettingsPage = lazyWithPreload(() =>
  import("./client/settings/settings-screen.js").then((m) => ({
    default: m.FileExplorerSettingsPage,
  })),
);

const LazyFileExplorerSettingsContent = lazyWithPreload(() =>
  import("./client/settings/settings-screen.js").then((m) => ({
    default: m.FileExplorerSettingsContent,
  })),
);

setSettingsScreenPreloader(() => {
  void LazyFileExplorerSettingsPage.preload();
  void LazyFileExplorerSettingsContent.preload();
});

function FileExplorerSettingsPageWrapper(props: PluginScreenProps) {
  return (
    <Suspense fallback={null}>
      <LazyFileExplorerSettingsPage {...props} />
    </Suspense>
  );
}

function FileExplorerSettingsContentWrapper(props: PluginSurfaceProps) {
  return (
    <Suspense fallback={null}>
      <LazyFileExplorerSettingsContent {...props} />
    </Suspense>
  );
}

function pathBasename(filePath: string): string {
  const trimmed = filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
  const slashIndex = trimmed.lastIndexOf("/");
  return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

export default function contribute(client: PluginClientContext) {
  const handleOpenFileInNewTab = (
    workspaceId: string,
    file: FileOpenRef,
    options?: { maxOpenTabs?: number },
  ) => {
    openFileTabInStore(
      workspaceId,
      {
        path: file.path,
        name: file.name ?? pathBasename(file.path),
        contentType: file.contentType,
        size: file.size,
        updatedAt: file.updatedAt,
      },
      options,
    );
    client.openPanel("file-viewer", { workspaceId, location: "workspace" });
  };

  const BoundFileExplorerPanel = (props: PluginWorkspacePanelProps) => (
    <FileExplorerPanel
      {...props}
      onOpenFileInNewTab={handleOpenFileInNewTab}
      onOpenSettings={() => openFileExplorerSettingsScreen()}
    />
  );

  const BoundFileViewerPanel = (props: PluginWorkspacePanelProps) => (
    <FileViewerPanel
      {...props}
      onOpenExplorer={(workspaceId) =>
        client.openPanel("file-explorer", { workspaceId, location: "explorer" })
      }
      onOpenSettings={() => openFileExplorerSettingsScreen()}
    />
  );

  const removeSidebarHeaderItem = client.addSidebarHeaderItem({
    id: "file-explorer",
    title: "File Explorer",
    Component: FileExplorerSidebarItem,
  });

  const removeScreen = client.addScreen({
    id: "settings",
    title: "File Explorer",
    Component: FileExplorerSettingsPageWrapper,
  });

  const removeSettingsScreen = client.addSettingsScreen({
    id: "settings",
    title: "File Explorer",
    icon: "FolderTree",
    Component: FileExplorerSettingsContentWrapper,
  });

  const removeExplorerPanel = client.addWorkspacePanel({
    id: "file-explorer",
    title: "Explorer",
    icon: "FolderTree",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: BoundFileExplorerPanel,
  });

  const removeViewerPanel = client.addWorkspacePanel({
    id: "file-viewer",
    title: "File Viewer",
    icon: "FileText",
    context: "workspace",
    locations: ["workspace"],
    Component: BoundFileViewerPanel,
  });

  const removeExplorerCommand = client.addCommandCenterItem({
    id: "open-file-explorer",
    title: "Open file explorer",
    icon: "FolderTree",
    context: "workspace",
    keywords: ["files", "tree", "browse", "navigate", "pdf"],
    onSelect({ openPanel }) {
      openPanel("file-explorer");
    },
  });

  const removeViewerCommand = client.addCommandCenterItem({
    id: "open-file-viewer",
    title: "Open file viewer tab",
    icon: "FileText",
    context: "workspace",
    keywords: ["files", "viewer", "pdf", "tab"],
    onSelect({ openPanel }) {
      openPanel("file-viewer", { location: "workspace" });
    },
  });

  return () => {
    removeSidebarHeaderItem();
    removeScreen();
    removeSettingsScreen();
    removeExplorerPanel();
    removeViewerPanel();
    removeExplorerCommand();
    removeViewerCommand();
  };
}
