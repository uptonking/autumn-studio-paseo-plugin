import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import {
  clearRecentFilesInStore,
  closeAllFileTabsInStore,
  closeFileTabInStore,
  closeFileTabsToRightInStore,
  closeOtherFileTabsInStore,
  enforceMaxOpenTabsInStore,
  openFileTabInStore,
  removeRecentFileInStore,
  setActiveFileTabInStore,
  setFileTabDirtyInStore,
  togglePinFileTabInStore,
  useWorkspaceOpenedTabs,
  type OpenedFileTab,
} from './opened-tabs-store.js';
import { useWorkspaceFileBridge } from './use-workspace-file-bridge.js';
import type { FileViewerViewProps } from './view-props.js';

const FileViewerIsland = lazy(() =>
  import('./file-viewer-island.web.js').then((m) => ({
    default: m.FileViewerIsland,
  })),
);

export function FileViewerPanel(
  props: PluginWorkspacePanelProps & {
    onOpenExplorer?: (workspaceId: string) => void;
    onOpenSettings?: (workspaceId: string) => void;
  },
) {
  const isWeb = Platform.OS === 'web';
  const {
    settings,
    pdfSettings,
    xlsxSettings,
    textSettings,
    aiText,
    getFileUrl,
    getPdfWasmUrl,
    getXlsxWasmDataUri,
    handleSaveFile,
  } = useWorkspaceFileBridge(props.workspaceId);

  const { tabs, activePath, recentFiles } = useWorkspaceOpenedTabs(props.workspaceId);
  const maxOpenTabs = settings.general.maxOpenTabs;

  useEffect(() => {
    enforceMaxOpenTabsInStore(props.workspaceId, maxOpenTabs);
  }, [maxOpenTabs, props.workspaceId]);

  const handleSelectTab = useCallback(
    (path: string) => {
      setActiveFileTabInStore(props.workspaceId, path);
    },
    [props.workspaceId],
  );

  const handleCloseTab = useCallback(
    (path: string) => {
      closeFileTabInStore(props.workspaceId, path);
    },
    [props.workspaceId],
  );

  const handleCloseOtherTabs = useCallback(
    (keepPath: string) => {
      closeOtherFileTabsInStore(props.workspaceId, keepPath);
    },
    [props.workspaceId],
  );

  const handleCloseTabsToRight = useCallback(
    (fromPath: string) => {
      closeFileTabsToRightInStore(props.workspaceId, fromPath);
    },
    [props.workspaceId],
  );

  const handleCloseAllTabs = useCallback(() => {
    closeAllFileTabsInStore(props.workspaceId);
  }, [props.workspaceId]);

  const handleTogglePinTab = useCallback(
    (path: string) => {
      togglePinFileTabInStore(props.workspaceId, path);
    },
    [props.workspaceId],
  );

  const handleTabDirtyChange = useCallback(
    (path: string, isDirty: boolean) => {
      setFileTabDirtyInStore(props.workspaceId, path, isDirty);
    },
    [props.workspaceId],
  );

  const handleOpenRecentFile = useCallback(
    (file: OpenedFileTab) => {
      openFileTabInStore(props.workspaceId, file, { maxOpenTabs });
    },
    [maxOpenTabs, props.workspaceId],
  );

  const handleRemoveRecentFile = useCallback(
    (path: string) => {
      removeRecentFileInStore(props.workspaceId, path);
    },
    [props.workspaceId],
  );

  const handleClearRecentFiles = useCallback(() => {
    clearRecentFilesInStore(props.workspaceId);
  }, [props.workspaceId]);

  const handleOpenExplorer = useCallback(() => {
    props.onOpenExplorer?.(props.workspaceId);
  }, [props.onOpenExplorer, props.workspaceId]);

  const handleOpenSettings = useCallback(() => {
    props.onOpenSettings?.(props.workspaceId);
  }, [props.onOpenSettings, props.workspaceId]);

  const view: FileViewerViewProps = useMemo(
    () => ({
      tabs,
      activePath,
      recentFiles,
      maxOpenTabs,
      enabled: settings.general.enabled,
      autoSaveEdits: settings.general.autoSaveEdits,
      pdfSettings,
      xlsxSettings,
      textSettings,
      formatSettings: settings.formats,
      aiText,
      getFileUrl,
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      onSaveFile: handleSaveFile,
      onSelectTab: handleSelectTab,
      onCloseTab: handleCloseTab,
      onCloseOtherTabs: handleCloseOtherTabs,
      onCloseTabsToRight: handleCloseTabsToRight,
      onCloseAllTabs: handleCloseAllTabs,
      onTogglePinTab: handleTogglePinTab,
      onTabDirtyChange: handleTabDirtyChange,
      onOpenRecentFile: handleOpenRecentFile,
      onRemoveRecentFile: handleRemoveRecentFile,
      onClearRecentFiles: handleClearRecentFiles,
      onOpenExplorer: props.onOpenExplorer ? handleOpenExplorer : undefined,
      onOpenSettings: props.onOpenSettings ? handleOpenSettings : undefined,
    }),
    [
      tabs,
      activePath,
      recentFiles,
      maxOpenTabs,
      settings.general.enabled,
      settings.general.autoSaveEdits,
      pdfSettings,
      xlsxSettings,
      textSettings,
      settings.formats,
      aiText,
      getFileUrl,
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      handleSaveFile,
      handleSelectTab,
      handleCloseTab,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      handleCloseAllTabs,
      handleTogglePinTab,
      handleTabDirtyChange,
      handleOpenRecentFile,
      handleRemoveRecentFile,
      handleClearRecentFiles,
      props.onOpenExplorer,
      handleOpenExplorer,
      props.onOpenSettings,
      handleOpenSettings,
    ],
  );

  if (!isWeb) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text style={{ fontSize: 15, opacity: 0.7, textAlign: 'center' }}>
          File Viewer is available on desktop and web only.
        </Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, opacity: 0.6 }}>Loading viewer…</Text>
        </View>
      }
    >
      <FileViewerIsland {...props} view={view} />
    </Suspense>
  );
}
