import type {
  PluginClientContext,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { FileExplorerPanel } from "./client/file-explorer-panel.js";
import { FileViewerPanel } from "./client/file-viewer-panel.js";
import { openFileTabInStore } from "./client/opened-tabs-store.js";
import {
  FileExplorerSettingsContent,
  FileExplorerSettingsPage,
} from "./client/settings/settings-screen.js";
import {
  FileExplorerSidebarItem,
  openFileExplorerSettingsScreen,
} from "./client/sidebar-item.js";
import type { FileOpenRef } from "./client/view-props.js";

function pathBasename(filePath: string): string {
  const trimmed = filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
  const slashIndex = trimmed.lastIndexOf("/");
  return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

export default function contribute(client: PluginClientContext) {
  const handleOpenFileInNewTab = (workspaceId: string, file: FileOpenRef) => {
    openFileTabInStore(workspaceId, {
      path: file.path,
      name: file.name ?? pathBasename(file.path),
      contentType: file.contentType,
      size: file.size,
      updatedAt: file.updatedAt,
    });
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
    Component: FileExplorerSettingsPage,
  });

  const removeSettingsScreen = client.addSettingsScreen({
    id: "settings",
    title: "File Explorer",
    icon: "FolderTree",
    Component: FileExplorerSettingsContent,
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
