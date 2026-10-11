import { lazy, Suspense, useCallback, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_FILE_EXPLORER_SETTINGS,
  fileExplorerSettings,
  getFileContent,
  getFileTree,
  getPdfWasm,
  getTextViewerSettings,
  toPdfViewerZoom,
} from "../shared/contracts.js";
import {
  getOrCreateFileBlobUrl,
  getOrCreatePdfWasmBlobUrl,
} from "./blob-url-cache.js";
import {
  flattenTree,
  type FileExplorerViewProps,
  type FileOpenRef,
} from "./view-props.js";

// The island pulls in react-dom and the whole DOM component tree; the dynamic
// import keeps all of it unevaluated on native, where it must never load.
const FileExplorerIsland = lazy(() =>
  import("./file-explorer-island.web.js").then((m) => ({
    default: m.FileExplorerIsland,
  })),
);

/**
 * Host-tree component: all context-dependent work (RPC, queries, settings, blob cache)
 * happens here, where the app's PluginRpcProvider and QueryClientProvider are
 * in scope. The island cannot use them — context does not cross its
 * separate react-dom root.
 */
export function FileExplorerPanel(
  props: PluginWorkspacePanelProps & {
    onOpenFileInNewTab?: (workspaceId: string, file: FileOpenRef) => void;
    onOpenSettings?: (workspaceId: string) => void;
  },
) {
  const isWeb = Platform.OS === "web";
  const fetchTree = useRpc(getFileTree);
  const fetchContent = useRpc(getFileContent);
  const fetchPdfWasm = useRpc(getPdfWasm);
  const settingsState = useSettings(fileExplorerSettings);
  const settings =
    settingsState.status === "ready"
      ? settingsState.values
      : DEFAULT_FILE_EXPLORER_SETTINGS;
  const isEnabled = settings.general.enabled;

  const query = useQuery({
    queryKey: ["file-explorer:tree", props.workspaceId],
    queryFn: () => fetchTree({ workspaceId: props.workspaceId }),
    enabled: isWeb && isEnabled,
  });

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

  const handleOpenFileInNewTab = useCallback(
    (file: FileOpenRef) => {
      props.onOpenFileInNewTab?.(props.workspaceId, file);
    },
    [props.onOpenFileInNewTab, props.workspaceId],
  );

  const handleOpenSettings = useCallback(() => {
    props.onOpenSettings?.(props.workspaceId);
  }, [props.onOpenSettings, props.workspaceId]);

  const handleRetry = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  const flattenedItems = useMemo(
    () => flattenTree(query.data?.tree),
    [query.data?.tree],
  );

  const view: FileExplorerViewProps = useMemo(
    () => ({
      items: flattenedItems,
      isLoading: query.isLoading,
      truncated: query.data?.truncated,
      error:
        query.error instanceof Error
          ? query.error.message
          : query.error
            ? "Failed to load files"
            : null,
      enabled: isEnabled,
      defaultFileOpenMode: settings.general.fileOpenMode,
      defaultViewMode: settings.general.defaultViewMode,
      pdfSettings,
      textSettings,
      onRetry: handleRetry,
      getFileUrl,
      getPdfWasmUrl,
      onOpenFileInNewTab: props.onOpenFileInNewTab
        ? handleOpenFileInNewTab
        : undefined,
      onOpenSettings: props.onOpenSettings ? handleOpenSettings : undefined,
    }),
    [
      flattenedItems,
      query.isLoading,
      query.data?.truncated,
      query.error,
      isEnabled,
      settings.general.fileOpenMode,
      settings.general.defaultViewMode,
      pdfSettings,
      textSettings,
      handleRetry,
      getFileUrl,
      getPdfWasmUrl,
      props.onOpenFileInNewTab,
      handleOpenFileInNewTab,
      props.onOpenSettings,
      handleOpenSettings,
    ],
  );

  if (!isWeb) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 15, opacity: 0.7, textAlign: "center" }}>
          File Explorer is available on desktop and web only.
        </Text>
        <Text style={{ marginTop: 8, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
          Use the Files panel for mobile access.
        </Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, opacity: 0.6 }}>Loading explorer…</Text>
        </View>
      }
    >
      <FileExplorerIsland {...props} view={view} />
    </Suspense>
  );
}
