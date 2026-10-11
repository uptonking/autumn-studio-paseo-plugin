import { lazy, Suspense, useCallback, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import {
  DEFAULT_FILE_EXPLORER_SETTINGS,
  fileExplorerSettings,
  getFileContent,
  getPdfWasm,
  getTextViewerSettings,
  toPdfViewerZoom,
} from "../shared/contracts.js";
import {
  getOrCreateFileBlobUrl,
  getOrCreatePdfWasmBlobUrl,
} from "./blob-url-cache.js";
import {
  closeAllFileTabsInStore,
  closeFileTabInStore,
  setActiveFileTabInStore,
  useWorkspaceOpenedTabs,
} from "./opened-tabs-store.js";
import type { FileOpenRef, FileViewerViewProps } from "./view-props.js";

const FileViewerIsland = lazy(() =>
  import("./file-viewer-island.web.js").then((m) => ({
    default: m.FileViewerIsland,
  })),
);

export function FileViewerPanel(
  props: PluginWorkspacePanelProps & {
    onOpenExplorer?: (workspaceId: string) => void;
    onOpenSettings?: (workspaceId: string) => void;
  },
) {
  const isWeb = Platform.OS === "web";
  const fetchContent = useRpc(getFileContent);
  const fetchPdfWasm = useRpc(getPdfWasm);
  const settingsState = useSettings(fileExplorerSettings);
  const settings =
    settingsState.status === "ready"
      ? settingsState.values
      : DEFAULT_FILE_EXPLORER_SETTINGS;

  const { tabs, activePath } = useWorkspaceOpenedTabs(props.workspaceId);

  const getPdfWasmUrl = useCallback(
    () => getOrCreatePdfWasmBlobUrl(() => fetchPdfWasm({})),
    [fetchPdfWasm],
  );

  const getFileUrl = useCallback(
    (file: FileOpenRef) =>
      getOrCreateFileBlobUrl(props.workspaceId, file, (relPath) =>
        fetchContent({ workspaceId: props.workspaceId, relPath }),
      ),
    [props.workspaceId, fetchContent],
  );

  const pdfSettings = useMemo(
    () => ({
      showThumbnailsByDefault: settings.pdf.showThumbnailsByDefault,
      defaultZoom: toPdfViewerZoom(settings.pdf.defaultZoom),
      showRotateControls: settings.pdf.showRotateControls,
      showDownloadButton: settings.pdf.showDownloadButton,
    }),
    [
      settings.pdf.showThumbnailsByDefault,
      settings.pdf.defaultZoom,
      settings.pdf.showRotateControls,
      settings.pdf.showDownloadButton,
    ],
  );

  const textSettings = useMemo(
    () => getTextViewerSettings(settings),
    [settings],
  );

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

  const handleCloseAllTabs = useCallback(() => {
    closeAllFileTabsInStore(props.workspaceId);
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
      enabled: settings.general.enabled,
      pdfSettings,
      textSettings,
      getFileUrl,
      getPdfWasmUrl,
      onSelectTab: handleSelectTab,
      onCloseTab: handleCloseTab,
      onCloseAllTabs: handleCloseAllTabs,
      onOpenExplorer: props.onOpenExplorer ? handleOpenExplorer : undefined,
      onOpenSettings: props.onOpenSettings ? handleOpenSettings : undefined,
    }),
    [
      tabs,
      activePath,
      settings.general.enabled,
      pdfSettings,
      textSettings,
      getFileUrl,
      getPdfWasmUrl,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
      props.onOpenExplorer,
      handleOpenExplorer,
      props.onOpenSettings,
      handleOpenSettings,
    ],
  );

  if (!isWeb) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 15, opacity: 0.7, textAlign: "center" }}>
          File Viewer is available on desktop and web only.
        </Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, opacity: 0.6 }}>Loading viewer…</Text>
        </View>
      }
    >
      <FileViewerIsland {...props} view={view} />
    </Suspense>
  );
}
