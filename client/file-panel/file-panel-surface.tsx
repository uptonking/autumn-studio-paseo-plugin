import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useTabState, type PluginFilePanelProps } from '@getpaseo/plugin/client';
import { saveSerializedFileViaPluginFile } from '../editing/plugin-file-save.js';
import type { OpenedFileTab } from '../opened-tabs-store.js';
import {
  createSurfacePersistenceHandle,
  DEFAULT_SURFACE_PERSISTENCE,
  surfacePersistenceSchema,
  type SurfacePersistence,
} from '../surface-persistence.js';
import { openAutumnStudioSettingsScreen } from '../sidebar-item.js';
import { useWorkspaceRelPath } from '../use-workspace-rel-path.js';
import { useWorkspaceFileBridge } from '../use-workspace-file-bridge.js';
import type { FileViewerViewProps } from '../view-props.js';
import type { FileSaveCallbackInput } from '../viewers/registry.js';

// The island pulls in react-dom and the whole DOM component tree; the dynamic
// import keeps all of it unevaluated on native, where it must never load.
const FilePanelIsland = lazy(() =>
  import('./file-panel-island.web.js').then((m) => ({
    default: m.FilePanelIsland,
  })),
);

/**
 * Host-tree surface for Paseo's native file tabs. Builds the same view-prop
 * bundle the workspace File Viewer builds, but for exactly one file: the
 * PluginFile handle owns reads and version-checked writes, the shared stage
 * renders the viewer (AI Text split included), and the tab's modified dot is
 * driven by the edit session's dirty state.
 */
export function FilePanelSurface(props: PluginFilePanelProps) {
  const isWeb = Platform.OS === 'web';
  const { workspaceId, file, tab, params } = props;
  const relPathState = useWorkspaceRelPath({
    workspaceId,
    paramsPath: params.path,
    absolutePath: file.path,
  });
  const {
    settings,
    pdfSettings,
    xlsxSettings,
    textSettings,
    aiText,
    getPdfWasmUrl,
    getXlsxWasmDataUri,
  } = useWorkspaceFileBridge(workspaceId);

  const [stat, setStat] = useState(() => ({
    size: file.size,
    updatedAt: file.modifiedAt,
  }));
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    setIsDeleted(false);
    setStat({ size: file.size, updatedAt: file.modifiedAt });
    return file.watch((event) => {
      if (event.type === 'changed') {
        setIsDeleted(false);
        setStat({ size: file.size, updatedAt: file.modifiedAt });
      } else {
        setIsDeleted(true);
      }
    });
  }, [file]);

  // Workspace-relative identity when the file is inside the workspace (so AI
  // Text documents and edit-session keys match the workspace surface);
  // otherwise the absolute path keys a viewer-only file.
  const filePath = relPathState.status === 'ready' ? relPathState.relPath : file.path;
  const insideWorkspace = relPathState.status === 'ready';

  // Paseo persists tab.state with the workspace layout, so the split view's
  // layout (open, ratio, hidden original) survives tab reopen and restarts —
  // scoped to this file, since a tab can be retargeted to a different one.
  const [surfaceState, persistSurfaceState] = useTabState(
    tab,
    surfacePersistenceSchema,
    DEFAULT_SURFACE_PERSISTENCE,
  );
  // The plugin is this tab's sole writer, so a pending write is recognized
  // by identity once the store round-trips it back as a prop; until then the
  // optimistic value keeps successive merges from racing a stale prop.
  const persistedStateRef = useRef(surfaceState);
  const pendingWriteRef = useRef<SurfacePersistence | null>(null);
  if (pendingWriteRef.current !== null && surfaceState === pendingWriteRef.current) {
    pendingWriteRef.current = null;
  }
  persistedStateRef.current = surfaceState;
  const surfacePersistence = useMemo(
    () =>
      createSurfacePersistenceHandle({
        filePath,
        readState: () => pendingWriteRef.current ?? persistedStateRef.current,
        write: (next) => {
          pendingWriteRef.current = next;
          persistedStateRef.current = next;
          persistSurfaceState(next);
        },
      }),
    [filePath, persistSurfaceState],
  );

  const handleSaveFile = useCallback(
    async (input: FileSaveCallbackInput) => {
      const saved = await saveSerializedFileViaPluginFile({
        workspaceId,
        filePath: input.relPath,
        file,
        payload: input.payload,
        force: input.force,
      });
      // The handle's own writes do not notify its watcher; bump the stat so
      // the stage resolves a fresh URL for the new bytes.
      setStat({
        size: saved.size,
        updatedAt: new Date(saved.mtime).toISOString(),
      });
      return saved;
    },
    [file, workspaceId],
  );

  const handleDirtyChange = useCallback(
    (_path: string, isDirty: boolean) => {
      tab.setModified(isDirty);
    },
    [tab],
  );

  const activeTab: OpenedFileTab = useMemo(
    () => ({
      path: filePath,
      name: file.name,
      contentType: file.mimeType,
      size: stat.size,
      updatedAt: stat.updatedAt,
    }),
    [filePath, file.name, file.mimeType, stat],
  );

  const view: FileViewerViewProps = useMemo(
    () => ({
      tabs: [activeTab],
      activePath: activeTab.path,
      enabled: settings.general.enabled,
      autoSaveEdits: settings.general.autoSaveEdits,
      pdfSettings,
      xlsxSettings,
      textSettings,
      formatSettings: settings.formats,
      // Out-of-workspace files have no workspace identity, so AI Text (which
      // keys documents by workspace-relative path) stays hidden for them.
      aiText: insideWorkspace ? aiText : undefined,
      surfacePersistence,
      getFileUrl: () =>
        Promise.reject(new Error('The native file panel reads through its PluginFile')),
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      onSaveFile: handleSaveFile,
      onSelectTab: () => {},
      onCloseTab: () => {},
      onTabDirtyChange: handleDirtyChange,
      onOpenSettings: () => openAutumnStudioSettingsScreen(),
    }),
    [
      activeTab,
      aiText,
      getPdfWasmUrl,
      getXlsxWasmDataUri,
      handleDirtyChange,
      handleSaveFile,
      insideWorkspace,
      pdfSettings,
      settings.formats,
      settings.general.autoSaveEdits,
      settings.general.enabled,
      surfacePersistence,
      textSettings,
      xlsxSettings,
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
          Autumn Studio viewer is available on desktop and web only.
        </Text>
      </View>
    );
  }

  if (!settings.general.enabled) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
        }}
      >
        <Text style={{ fontSize: 15, opacity: 0.7, textAlign: 'center' }}>
          Autumn Studio viewer is disabled in its settings.
        </Text>
        <Text
          accessibilityRole='button'
          onPress={() => openAutumnStudioSettingsScreen()}
          style={{
            fontSize: 13,
            opacity: 0.6,
            textDecorationLine: 'underline',
          }}
        >
          Open Autumn Studio settings
        </Text>
      </View>
    );
  }

  if (relPathState.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, opacity: 0.6 }}>Opening file…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isDeleted ? (
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: props.theme.colors.border,
            backgroundColor: props.theme.colors.surface1,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: props.theme.colors.statusWarning,
              textAlign: 'center',
            }}
          >
            This file was moved or deleted. Saving will fail until it is back.
          </Text>
        </View>
      ) : null}
      <Suspense
        fallback={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, opacity: 0.6 }}>Loading viewer…</Text>
          </View>
        }
      >
        <View style={{ flex: 1 }}>
          <FilePanelIsland {...props} view={view} activeTab={activeTab} />
        </View>
      </Suspense>
    </View>
  );
}
