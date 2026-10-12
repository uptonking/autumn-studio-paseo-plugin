import { useCallback, useMemo } from "react";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_FILE_EXPLORER_SETTINGS,
  fileExplorerSettings,
  getFileContent,
  getPdfWasm,
  getTextViewerSettings,
  getXlsxWasm,
  saveFileContent,
  toPdfViewerZoom,
  toXlsxViewerZoom,
} from "../shared/contracts.js";
import {
  getOrCreateFileBlobUrl,
  getOrCreatePdfWasmBlobUrl,
  getOrCreateXlsxWasmDataUri,
} from "./blob-url-cache.js";
import { persistSerializedFile } from "./editing/use-file-edit-session.js";
import type { FileSaveCallbackInput } from "./viewers/registry.js";
import type { FileOpenRef, GetFileUrlOptions } from "./view-props.js";

export function useWorkspaceFileBridge(workspaceId: string) {
  const queryClient = useQueryClient();
  const fetchContent = useRpc(getFileContent);
  const fetchPdfWasm = useRpc(getPdfWasm);
  const fetchXlsxWasm = useRpc(getXlsxWasm);
  const callSaveFile = useRpc(saveFileContent);
  const settingsState = useSettings(fileExplorerSettings);
  const settings =
    settingsState.status === "ready"
      ? settingsState.values
      : DEFAULT_FILE_EXPLORER_SETTINGS;

  const getPdfWasmUrl = useCallback(
    () => getOrCreatePdfWasmBlobUrl(() => fetchPdfWasm({})),
    [fetchPdfWasm],
  );

  const getXlsxWasmDataUri = useCallback(
    () => getOrCreateXlsxWasmDataUri(() => fetchXlsxWasm({})),
    [fetchXlsxWasm],
  );

  const getFileUrl = useCallback(
    (file: FileOpenRef, options?: GetFileUrlOptions) =>
      getOrCreateFileBlobUrl(
        workspaceId,
        file,
        async (relPath) => {
          const result = await fetchContent({
            workspaceId,
            relPath,
          });
          if (options?.forceRefresh) {
            const mtimeIso =
              typeof result.mtime === "number"
                ? new Date(result.mtime).toISOString()
                : undefined;
            if (
              (typeof result.size === "number" &&
                file.size !== undefined &&
                result.size !== file.size) ||
              (mtimeIso !== undefined &&
                file.updatedAt !== undefined &&
                mtimeIso !== file.updatedAt)
            ) {
              void queryClient.invalidateQueries({
                queryKey: ["file-explorer:tree", workspaceId],
              });
            }
          }
          return result;
        },
        options,
      ),
    [workspaceId, fetchContent, queryClient],
  );

  const handleSaveFile = useCallback(
    (input: FileSaveCallbackInput) =>
      persistSerializedFile({
        workspaceId,
        relPath: input.relPath,
        contentType: input.contentType,
        payload: input.payload,
        callSaveRpc: callSaveFile,
        onSaved: () => {
          void queryClient.invalidateQueries({
            queryKey: ["file-explorer:tree", workspaceId],
          });
        },
      }),
    [callSaveFile, workspaceId, queryClient],
  );

  const pdfSettings = useMemo(
    () => ({
      defaultOpenBehavior: settings.pdf.defaultOpenBehavior,
      defaultViewer: settings.pdf.defaultViewer,
      defaultEditor: settings.pdf.defaultEditor,
      showThumbnailsByDefault: settings.pdf.showThumbnailsByDefault,
      defaultZoom: toPdfViewerZoom(settings.pdf.defaultZoom),
      showRotateControls: settings.pdf.showRotateControls,
      showDownloadButton: settings.pdf.showDownloadButton,
    }),
    [
      settings.pdf.defaultOpenBehavior,
      settings.pdf.defaultViewer,
      settings.pdf.defaultEditor,
      settings.pdf.showThumbnailsByDefault,
      settings.pdf.defaultZoom,
      settings.pdf.showRotateControls,
      settings.pdf.showDownloadButton,
    ],
  );

  const xlsxSettings = useMemo(
    () => ({
      defaultOpenBehavior: settings.xlsx.defaultOpenBehavior,
      defaultViewer: settings.xlsx.defaultViewer,
      defaultEditor: settings.xlsx.defaultEditor,
      defaultZoom: toXlsxViewerZoom(settings.xlsx.defaultZoom),
      showFormulaBar: settings.xlsx.showFormulaBar,
      showHiddenSheets: settings.xlsx.showHiddenSheets,
      showDownloadButton: settings.xlsx.showDownloadButton,
    }),
    [
      settings.xlsx.defaultOpenBehavior,
      settings.xlsx.defaultViewer,
      settings.xlsx.defaultEditor,
      settings.xlsx.defaultZoom,
      settings.xlsx.showFormulaBar,
      settings.xlsx.showHiddenSheets,
      settings.xlsx.showDownloadButton,
    ],
  );

  const textSettings = useMemo(
    () => getTextViewerSettings(settings),
    [settings],
  );

  return {
    settings,
    pdfSettings,
    xlsxSettings,
    textSettings,
    getFileUrl,
    getPdfWasmUrl,
    getXlsxWasmDataUri,
    handleSaveFile,
  };
}
