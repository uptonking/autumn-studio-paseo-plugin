import { lazy, Suspense, useCallback, useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { useRpc, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { useQuery } from '@tanstack/react-query';
import { getFileTree } from '../shared/contracts.js';
import {
  clearRecentFilesInStore,
  recordRecentFileInStore,
  removeRecentFileInStore,
  useWorkspaceOpenedTabs,
} from './opened-tabs-store.js';
import { useWorkspaceFileBridge } from './use-workspace-file-bridge.js';
import { flattenTree, type ExplorerViewProps, type FileOpenRef } from './view-props.js';

// The island pulls in react-dom and the whole DOM component tree; the dynamic
// import keeps all of it unevaluated on native, where it must never load.
const ExplorerIsland = lazy(() =>
  import('./explorer-island.web.js').then((m) => ({
    default: m.ExplorerIsland,
  })),
);

/**
 * Host-tree component: all context-dependent work (RPC, queries, settings, blob cache)
 * happens here, where the app's PluginRpcProvider and QueryClientProvider are
 * in scope. The island cannot use them — context does not cross its
 * separate react-dom root.
 */
export function ExplorerPanel(
  props: PluginWorkspacePanelProps & {
    onOpenFileInNewTab?: (
      workspaceId: string,
      file: FileOpenRef,
      options?: { maxOpenTabs?: number },
    ) => void;
    onOpenSettings?: (workspaceId: string, section?: string) => void;
  },
) {
  const isWeb = Platform.OS === 'web';
  const fetchTree = useRpc(getFileTree);
  const {
    settings,
    pdfSettings,
    xlsxSettings,
    docxSettings,
    textSettings,
    aiText,
    getFileUrl,
    getPdfWasmUrl,
    getXlsxWasmDataUri,
    handleSaveFile,
    treeDeprecationDismissed,
    dismissTreeDeprecation,
  } = useWorkspaceFileBridge(props.workspaceId);
  const { recentFiles } = useWorkspaceOpenedTabs(props.workspaceId);
  const isEnabled = settings.general.enabled;

  const query = useQuery({
    queryKey: ['autumn-studio:tree', props.workspaceId],
    queryFn: () => fetchTree({ workspaceId: props.workspaceId }),
    enabled: isWeb && isEnabled,
    refetchOnWindowFocus: true,
  });

  const handleOpenFileInNewTab = useCallback(
    (file: FileOpenRef) => {
      props.onOpenFileInNewTab?.(props.workspaceId, file, {
        maxOpenTabs: settings.general.maxOpenTabs,
      });
    },
    [props.onOpenFileInNewTab, props.workspaceId, settings.general.maxOpenTabs],
  );

  const handleRecordRecentFile = useCallback(
    (file: FileOpenRef) => {
      recordRecentFileInStore(props.workspaceId, {
        path: file.path,
        name: file.name ?? file.path.split('/').pop() ?? file.path,
        contentType: file.contentType,
        size: file.size,
        updatedAt: file.updatedAt,
      });
    },
    [props.workspaceId],
  );

  const handleClearRecentFiles = useCallback(() => {
    clearRecentFilesInStore(props.workspaceId);
  }, [props.workspaceId]);

  const handleRemoveRecentFile = useCallback(
    (path: string) => {
      removeRecentFileInStore(props.workspaceId, path);
    },
    [props.workspaceId],
  );

  const handleOpenSettings = useCallback(
    (section?: string) => {
      props.onOpenSettings?.(props.workspaceId, section);
    },
    [props.onOpenSettings, props.workspaceId],
  );

  const handleRetry = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  const flattenedItems = useMemo(() => flattenTree(query.data?.tree), [query.data?.tree]);

  const view: ExplorerViewProps = useMemo(
    () => ({
      items: flattenedItems,
      recentFiles,
      isLoading: query.isLoading,
      truncated: query.data?.truncated,
      error:
        query.error instanceof Error
          ? query.error.message
          : query.error
            ? 'Failed to load files'
            : null,
      enabled: isEnabled,
      defaultFileOpenMode: settings.general.fileOpenMode,
      defaultViewMode: settings.general.defaultViewMode,
      autoSaveEdits: settings.general.autoSaveEdits,
      pdfSettings,
      xlsxSettings,
      docxSettings,
      textSettings,
      formatSettings: settings.formats,
      aiText,
      onRetry: handleRetry,
      getFileUrl,
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      onSaveFile: handleSaveFile,
      onOpenFileInNewTab: props.onOpenFileInNewTab ? handleOpenFileInNewTab : undefined,
      onRecordRecentFile: handleRecordRecentFile,
      onRemoveRecentFile: handleRemoveRecentFile,
      onClearRecentFiles: handleClearRecentFiles,
      onOpenSettings: props.onOpenSettings ? handleOpenSettings : undefined,
      treeDeprecationDismissed,
      onDismissTreeDeprecation: dismissTreeDeprecation,
    }),
    [
      flattenedItems,
      recentFiles,
      query.isLoading,
      query.data?.truncated,
      query.error,
      isEnabled,
      settings.general.fileOpenMode,
      settings.general.defaultViewMode,
      settings.general.autoSaveEdits,
      pdfSettings,
      xlsxSettings,
      docxSettings,
      textSettings,
      settings.formats,
      aiText,
      handleRetry,
      getFileUrl,
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      handleSaveFile,
      props.onOpenFileInNewTab,
      handleOpenFileInNewTab,
      handleRecordRecentFile,
      handleRemoveRecentFile,
      handleClearRecentFiles,
      props.onOpenSettings,
      handleOpenSettings,
      treeDeprecationDismissed,
      dismissTreeDeprecation,
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
          Autumn Studio is available on desktop and web only.
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 13,
            opacity: 0.5,
            textAlign: 'center',
          }}
        >
          Use the Files panel for mobile access.
        </Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, opacity: 0.6 }}>Loading explorer…</Text>
        </View>
      }
    >
      <ExplorerIsland {...props} view={view} />
    </Suspense>
  );
}
