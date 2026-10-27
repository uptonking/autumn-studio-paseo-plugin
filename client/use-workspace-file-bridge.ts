import { useCallback, useMemo } from 'react';
import { useRpc, useSettings } from '@getpaseo/plugin/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  cancelAiTextTask,
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  deleteAiTextVersion,
  autumnStudioSettings,
  getAiTextAsset,
  getAiTextEngineEnvironment,
  getAiTextLayout,
  getAiTextMetadata,
  getAiTextSettings,
  getAiTextTask,
  getFileContent,
  getPdfWasm,
  getTextViewerSettings,
  getXlsxWasm,
  markAiTextVersionSaved,
  saveFileContent,
  selectAiTextVersion,
  startAiTextTask,
  toPdfViewerZoom,
  toXlsxViewerZoom,
} from '../shared/contracts.js';
import type { AiTextBridge } from './ai-text/ai-text-context.js';
import {
  getOrCreateFileBlobUrl,
  getOrCreatePdfWasmBlobUrl,
  getOrCreateXlsxWasmDataUri,
} from './blob-url-cache.js';
import { persistSerializedFile } from './editing/use-file-edit-session.js';
import type { FileSaveCallbackInput } from './viewers/registry.js';
import type { FileOpenRef, GetFileUrlOptions } from './view-props.js';

export function useWorkspaceFileBridge(workspaceId: string) {
  const queryClient = useQueryClient();
  const fetchContent = useRpc(getFileContent);
  const fetchPdfWasm = useRpc(getPdfWasm);
  const fetchXlsxWasm = useRpc(getXlsxWasm);
  const callSaveFile = useRpc(saveFileContent);
  const callGetAiTextMetadata = useRpc(getAiTextMetadata);
  const callStartAiTextTask = useRpc(startAiTextTask);
  const callGetAiTextTask = useRpc(getAiTextTask);
  const callCancelAiTextTask = useRpc(cancelAiTextTask);
  const callGetAiTextLayout = useRpc(getAiTextLayout);
  const callGetAiTextAsset = useRpc(getAiTextAsset);
  const callGetAiTextEngineEnvironment = useRpc(getAiTextEngineEnvironment);
  const callSelectAiTextVersion = useRpc(selectAiTextVersion);
  const callDeleteAiTextVersion = useRpc(deleteAiTextVersion);
  const callMarkAiTextVersionSaved = useRpc(markAiTextVersionSaved);
  const settingsState = useSettings(autumnStudioSettings);
  const settings =
    settingsState.status === 'ready' ? settingsState.values : DEFAULT_AUTUMN_STUDIO_SETTINGS;

  const dismissTreeDeprecation = useCallback(() => {
    if (settingsState.status !== 'ready') return;
    void settingsState.save(
      {
        ...settingsState.values,
        general: {
          ...settingsState.values.general,
          fileTreeDeprecationDismissed: true,
        },
      },
      settingsState.revision,
    );
  }, [settingsState]);

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
              typeof result.mtime === 'number' ? new Date(result.mtime).toISOString() : undefined;
            if (
              (typeof result.size === 'number' &&
                file.size !== undefined &&
                result.size !== file.size) ||
              (mtimeIso !== undefined &&
                file.updatedAt !== undefined &&
                mtimeIso !== file.updatedAt)
            ) {
              void queryClient.invalidateQueries({
                queryKey: ['autumn-studio:tree', workspaceId],
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
            queryKey: ['autumn-studio:tree', workspaceId],
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

  const docxSettings = useMemo(
    () => ({
      defaultOpenBehavior: settings.docx.defaultOpenBehavior,
      defaultViewer: settings.docx.defaultViewer,
      defaultEditor: settings.docx.defaultEditor,
      defaultFlowMode: settings.docx.defaultFlowMode,
      showDownloadButton: settings.docx.showDownloadButton,
    }),
    [
      settings.docx.defaultOpenBehavior,
      settings.docx.defaultViewer,
      settings.docx.defaultEditor,
      settings.docx.defaultFlowMode,
      settings.docx.showDownloadButton,
    ],
  );

  const textSettings = useMemo(() => getTextViewerSettings(settings), [settings]);

  const aiTextSettings = useMemo(() => getAiTextSettings(settings), [settings]);

  const getAiTextMetadataForFile = useCallback(
    (relPath: string) => callGetAiTextMetadata({ workspaceId, relPath }),
    [callGetAiTextMetadata, workspaceId],
  );

  const startAiTextTaskForFile = useCallback(
    (
      input: Omit<Parameters<AiTextBridge['startTask']>[0], 'relPath'> & {
        relPath?: string;
      },
    ) =>
      callStartAiTextTask({
        workspaceId,
        ...input,
      }),
    [callStartAiTextTask, workspaceId],
  );

  const getAiTextTaskSnapshot = useCallback(
    async (taskId: string) => {
      const result = await callGetAiTextTask({ taskId });
      if (
        result.task.status === 'succeeded' ||
        result.task.status === 'failed' ||
        result.task.status === 'cancelled'
      ) {
        void queryClient.invalidateQueries({
          queryKey: ['autumn-studio:tree', workspaceId],
        });
      }
      return result;
    },
    [callGetAiTextTask, queryClient, workspaceId],
  );

  const cancelAiTextTaskForWorkspace = useCallback(
    (taskId: string) => callCancelAiTextTask({ taskId }),
    [callCancelAiTextTask],
  );

  const getAiTextLayoutForFile = useCallback(
    (relPath: string, versionId: string) =>
      callGetAiTextLayout({ workspaceId, relPath, versionId }),
    [callGetAiTextLayout, workspaceId],
  );

  const getAiTextAssetForFile = useCallback(
    (relPath: string, versionId: string, assetPath: string) =>
      callGetAiTextAsset({
        workspaceId,
        relPath,
        versionId,
        assetPath,
      }),
    [callGetAiTextAsset, workspaceId],
  );

  const getAiTextEngineEnvironmentForWorkspace = useCallback(
    (engineId: string, options?: { config?: Record<string, unknown>; refresh?: boolean }) =>
      callGetAiTextEngineEnvironment({
        engineId,
        ...(options?.config ? { config: options.config } : {}),
        ...(options?.refresh ? { refresh: true } : {}),
      }),
    [callGetAiTextEngineEnvironment],
  );

  const selectAiTextVersionForFile = useCallback(
    (relPath: string, versionId: string) =>
      callSelectAiTextVersion({ workspaceId, relPath, versionId }),
    [callSelectAiTextVersion, workspaceId],
  );

  const markAiTextVersionSavedForFile = useCallback(
    (relPath: string, versionId: string) =>
      callMarkAiTextVersionSaved({ workspaceId, relPath, versionId }),
    [callMarkAiTextVersionSaved, workspaceId],
  );

  const deleteAiTextVersionForFile = useCallback(
    async (relPath: string, versionId: string) => {
      const result = await callDeleteAiTextVersion({
        workspaceId,
        relPath,
        versionId,
      });
      void queryClient.invalidateQueries({
        queryKey: ['autumn-studio:tree', workspaceId],
      });
      return result;
    },
    [callDeleteAiTextVersion, queryClient, workspaceId],
  );

  const aiText = useMemo<AiTextBridge>(
    () => ({
      enabled: aiTextSettings.enabled,
      settings: aiTextSettings,
      getMetadata: getAiTextMetadataForFile,
      startTask: startAiTextTaskForFile,
      getTask: getAiTextTaskSnapshot,
      cancelTask: cancelAiTextTaskForWorkspace,
      getLayout: getAiTextLayoutForFile,
      getAsset: getAiTextAssetForFile,
      getEngineEnvironment: getAiTextEngineEnvironmentForWorkspace,
      selectVersion: selectAiTextVersionForFile,
      deleteVersion: deleteAiTextVersionForFile,
      markVersionSaved: markAiTextVersionSavedForFile,
    }),
    [
      aiTextSettings,
      cancelAiTextTaskForWorkspace,
      deleteAiTextVersionForFile,
      getAiTextAssetForFile,
      getAiTextEngineEnvironmentForWorkspace,
      getAiTextLayoutForFile,
      getAiTextMetadataForFile,
      getAiTextTaskSnapshot,
      markAiTextVersionSavedForFile,
      selectAiTextVersionForFile,
      startAiTextTaskForFile,
    ],
  );

  return {
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
    treeDeprecationDismissed: settings.general.fileTreeDeprecationDismissed,
    dismissTreeDeprecation,
  };
}
