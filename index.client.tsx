import { Suspense } from 'react';
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSurfaceProps,
  PluginWorkspacePanelProps,
} from '@getpaseo/plugin/client';
import { ExplorerPanel } from './client/explorer-panel.js';
import { FileViewerPanel } from './client/file-viewer-panel.js';
import { FilePanelSurface } from './client/file-panel/file-panel-surface.js';
import { FORMAT_FAMILIES } from './client/viewers/format-families.js';
import { lazyWithPreload } from './client/lazy-with-preload.js';
import { openFileTabInStore } from './client/opened-tabs-store.js';
import {
  AutumnStudioSidebarItem,
  openAutumnStudioSettingsScreen,
  setSettingsScreenPreloader,
} from './client/sidebar-item.js';
import type { FileOpenRef } from './client/view-props.js';

const LazyAutumnStudioSettingsPage = lazyWithPreload(() =>
  import('./client/settings/settings-screen.js').then((m) => ({
    default: m.AutumnStudioSettingsPage,
  })),
);

const LazyAutumnStudioSettingsContent = lazyWithPreload(() =>
  import('./client/settings/settings-screen.js').then((m) => ({
    default: m.AutumnStudioSettingsContent,
  })),
);

setSettingsScreenPreloader(() => {
  void LazyAutumnStudioSettingsPage.preload();
  void LazyAutumnStudioSettingsContent.preload();
});

function AutumnStudioSettingsPageWrapper(props: PluginScreenProps) {
  return (
    <Suspense fallback={null}>
      <LazyAutumnStudioSettingsPage {...props} />
    </Suspense>
  );
}

function AutumnStudioSettingsContentWrapper(props: PluginSurfaceProps) {
  return (
    <Suspense fallback={null}>
      <LazyAutumnStudioSettingsContent {...props} />
    </Suspense>
  );
}

function pathBasename(filePath: string): string {
  const trimmed = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
  const slashIndex = trimmed.lastIndexOf('/');
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
    client.openPanel('file-viewer', { workspaceId, location: 'workspace' });
  };

  const BoundExplorerPanel = (props: PluginWorkspacePanelProps) => (
    <ExplorerPanel
      {...props}
      onOpenFileInNewTab={handleOpenFileInNewTab}
      onOpenSettings={() => openAutumnStudioSettingsScreen()}
    />
  );

  const BoundFileViewerPanel = (props: PluginWorkspacePanelProps) => (
    <FileViewerPanel
      {...props}
      onOpenExplorer={(workspaceId) =>
        client.openPanel('explorer', { workspaceId, location: 'explorer' })
      }
      onOpenSettings={() => openAutumnStudioSettingsScreen()}
    />
  );

  const removeSidebarHeaderItem = client.addSidebarHeaderItem({
    id: 'autumn-studio',
    title: 'Autumn Studio',
    Component: AutumnStudioSidebarItem,
  });

  const removeScreen = client.addScreen({
    id: 'settings',
    title: 'Autumn Studio',
    Component: AutumnStudioSettingsPageWrapper,
  });

  const removeSettingsScreen = client.addSettingsScreen({
    id: 'settings',
    title: 'Autumn Studio',
    icon: 'FolderTree',
    Component: AutumnStudioSettingsContentWrapper,
  });

  const removeExplorerPanel = client.addWorkspacePanel({
    id: 'explorer',
    title: 'Explorer',
    icon: 'FolderTree',
    locations: ['workspace', 'explorer'],
    Component: BoundExplorerPanel,
  });

  const removeViewerPanel = client.addWorkspacePanel({
    id: 'file-viewer',
    title: 'File Viewer',
    icon: 'FileText',
    locations: ['workspace'],
    Component: BoundFileViewerPanel,
  });

  const removeExplorerCommand = client.addCommandCenterItem({
    id: 'open-explorer',
    title: 'Open Autumn Studio explorer (deprecated)',
    icon: 'FolderTree',
    context: 'workspace',
    keywords: ['files', 'tree', 'browse', 'navigate', 'pdf'],
    onSelect({ openPanel }) {
      openPanel('explorer');
    },
  });

  const removeViewerCommand = client.addCommandCenterItem({
    id: 'open-file-viewer',
    title: 'Open file viewer tab',
    icon: 'FileText',
    context: 'workspace',
    keywords: ['files', 'viewer', 'pdf', 'tab'],
    onSelect({ openPanel }) {
      openPanel('file-viewer', { location: 'workspace' });
    },
  });

  // Native Paseo file tabs: one registration per format family so Paseo's
  // picker, Open with menu, and per-extension associations stay meaningful.
  // The shared surface renders the same island viewer as the File Viewer
  // workspace panel.
  const removeFilePanels = FORMAT_FAMILIES.map((family) =>
    client.addFilePanel({
      id: family.id,
      title: family.title,
      icon: family.icon,
      files: {
        extensions: family.extensions,
        filenames: family.filenames,
      },
      Component: FilePanelSurface,
    }),
  );

  return () => {
    void removeSidebarHeaderItem();
    void removeScreen();
    void removeSettingsScreen();
    void removeExplorerPanel();
    void removeViewerPanel();
    void removeExplorerCommand();
    void removeViewerCommand();
    for (const removeFilePanel of removeFilePanels) {
      void removeFilePanel();
    }
  };
}
