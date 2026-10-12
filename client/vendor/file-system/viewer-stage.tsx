import * as React from "react"
import { createPortal } from "react-dom"

import {
  FileViewerLoadingFallback,
  RegisteredFileViewer,
  type FileSaveCallbackInput,
  type FileSaveCallbackResult,
} from "../../viewers/registry"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "../components/ui/dialog"
import { Spinner } from "../components/ui/spinner"
import { IconPlaceholder } from "../icon-placeholder"
import { cn } from "../lib/utils"
import { FileVisual } from "./file-visual"
import { renderOpenModeMenuItems } from "./header"
import {
  VIEWER_DIALOG_CLASSNAMES,
  viewerKindForFile,
  type FileEntry,
  type FileSystemFileItem,
  type FileSystemFormatSettingsMap,
  type FileSystemIndex,
  type FileSystemOpenMode,
  type FileSystemPdfSettings,
  type FileSystemTextSettings,
  type FileSystemViewerKind,
  type FileSystemXlsxSettings,
} from "./types"
import { fileUrlCacheKey, useResolvedFileUrl } from "./virtual-window"

export const FileSystemViewerLoading = FileViewerLoadingFallback

export function FileSystemGalleryStage({
  activeUrl,
  autoSaveEdits,
  extraMenuItems,
  file,
  formatSettings,
  getFileUrl,
  loadPreviewImageUrl,
  onSaveFile,
  pageUrlCache,
  pdfSettings,
  renderFilePreview,
  textSettings,
  toolbarActions,
  urlCache,
  variant = "stage",
  xlsxSettings,
}: {
  activeUrl?: string | null
  autoSaveEdits?: boolean
  extraMenuItems?: React.ReactNode
  file: FileEntry
  formatSettings?: FileSystemFormatSettingsMap
  getFileUrl?: (
    file: FileSystemFileItem,
    options?: { forceRefresh?: boolean }
  ) => string | Promise<string>
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>
  pageUrlCache?: Map<string, string>
  pdfSettings?: FileSystemPdfSettings
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
  textSettings?: FileSystemTextSettings
  /** Rendered in the viewer toolbar in the `"dialog"` or `"in-place"` variant. */
  toolbarActions?: React.ReactNode
  urlCache: Map<string, string>
  /** `"stage"` is toolbar-less in a bordered tile; `"dialog"` and `"in-place"` show the full viewer chrome. */
  variant?: "dialog" | "in-place" | "stage"
  xlsxSettings?: FileSystemXlsxSettings
}) {
  const viewerKind = viewerKindForFile(file)
  const { isResolving, url: resolvedUrl } = useResolvedFileUrl(
    viewerKind ? file : null,
    getFileUrl,
    urlCache
  )
  const [savedUrlState, setSavedUrlState] = React.useState<{
    path: string
    oldCacheKey: string
    newCacheKey: string
    url: string
  } | null>(null)
  const hasFullChrome = variant === "dialog" || variant === "in-place"
  const viewerFrameClassName = cn(
    "size-full",
    !hasFullChrome && viewerKind !== "image" && "overflow-hidden rounded-lg border",
    !hasFullChrome && viewerKind === "image" && "flex items-center justify-center"
  )

  const handleSaveFile = React.useCallback(
    async (input: FileSaveCallbackInput) => {
      if (!onSaveFile) {
        throw new Error("File save handler is not configured")
      }
      const saved = await onSaveFile(input)
      const oldCacheKey = fileUrlCacheKey(file)
      const newCacheKey = fileUrlCacheKey({
        path: file.path,
        size: saved.size,
        updatedAt: new Date(saved.mtime).toISOString(),
      })
      urlCache.set(oldCacheKey, saved.blobUrl)
      urlCache.set(newCacheKey, saved.blobUrl)
      setSavedUrlState({
        path: file.path,
        oldCacheKey,
        newCacheKey,
        url: saved.blobUrl,
      })
      return saved
    },
    [file, onSaveFile, urlCache]
  )

  const currentCacheKey = fileUrlCacheKey(file)
  if (
    activeUrl &&
    (!savedUrlState ||
      savedUrlState.path !== file.path ||
      savedUrlState.url !== activeUrl)
  ) {
    setSavedUrlState({
      path: file.path,
      oldCacheKey: currentCacheKey,
      newCacheKey: currentCacheKey,
      url: activeUrl,
    })
  }

  const url =
    activeUrl ??
    (savedUrlState &&
    savedUrlState.path === file.path &&
    (currentCacheKey === savedUrlState.oldCacheKey ||
      currentCacheKey === savedUrlState.newCacheKey)
      ? savedUrlState.url
      : resolvedUrl)

  if (viewerKind && isResolving && !url) {
    return <Spinner className="size-6 text-muted-foreground" />
  }
  if (viewerKind && url) {
    return (
      <div className={viewerFrameClassName}>
        <RegisteredFileViewer
          kind={viewerKind}
          src={url}
          filePath={file.path}
          fileName={file.name}
          contentType={file.contentType}
          variant={variant}
          pdfSettings={pdfSettings}
          xlsxSettings={xlsxSettings}
          textSettings={textSettings}
          formatSettings={formatSettings}
          autoSaveEdits={autoSaveEdits}
          onSaveFile={onSaveFile ? handleSaveFile : undefined}
          extraMenuItems={extraMenuItems}
          toolbarActions={toolbarActions}
        />
      </div>
    )
  }
  return (
    <FileVisual
      file={file}
      className="w-56 max-w-full"
      loadPreviewImageUrl={loadPreviewImageUrl}
      pageable
      pageUrlCache={pageUrlCache}
      previewAspectRatio={0.78}
      renderFilePreview={renderFilePreview}
    />
  )
}

export function FileSystemViewerDialogAndPool({
  autoSaveEdits,
  formatSettings,
  getFileUrl,
  index,
  loadPreviewImageUrl,
  onCloseDialog,
  onOpenFileInNewTab,
  onSaveFile,
  openedFile,
  openedFileName,
  openFileWithMode,
  pageUrlCache,
  pdfSettings,
  renderFilePreview,
  resolvedUrlCache,
  stageContainers,
  stagePool,
  textSettings,
  xlsxSettings,
}: {
  autoSaveEdits?: boolean
  formatSettings?: FileSystemFormatSettingsMap
  getFileUrl?: (
    file: FileSystemFileItem,
    options?: { forceRefresh?: boolean; reuseIfUnchanged?: boolean }
  ) => string | Promise<string>
  index: FileSystemIndex
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  onCloseDialog: () => void
  onOpenFileInNewTab?: (file: FileSystemFileItem, url: string) => void
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>
  openedFile: {
    file: FileEntry
    kind: FileSystemViewerKind
    mode: "in-place" | "dialog"
    url: string
    sessionId: number
  } | null
  openedFileName: string
  openFileWithMode: (file: FileEntry, mode?: FileSystemOpenMode) => void
  pageUrlCache: Map<string, string>
  pdfSettings?: FileSystemPdfSettings
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
  resolvedUrlCache: Map<string, string>
  stageContainers: Map<string, HTMLDivElement>
  stagePool: string[]
  textSettings?: FileSystemTextSettings
  xlsxSettings?: FileSystemXlsxSettings
}) {
  const isOpenedInDialog = openedFile?.mode === "dialog"

  const viewerCloseToolbarAction = (
    <DialogClose
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close preview"
        >
          <IconPlaceholder
            lucide="X"
            tabler="IconX"
            hugeicons="Cancel01Icon"
            phosphor="XIcon"
            remixicon="RiCloseLine"
            className="size-4"
          />
        </Button>
      }
    ></DialogClose>
  )

  return (
    <Dialog
      open={isOpenedInDialog}
      onOpenChange={(open) => {
        if (!open) onCloseDialog()
      }}
    >
      {isOpenedInDialog && openedFile ? (
        <DialogContent
          className={cn(
            "overflow-hidden p-0",
            VIEWER_DIALOG_CLASSNAMES[openedFile.kind]
          )}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{openedFileName}</DialogTitle>
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <FileSystemGalleryStage
              key={`${openedFile.file.path}::${openedFile.sessionId}`}
              activeUrl={openedFile.url}
              autoSaveEdits={autoSaveEdits}
              extraMenuItems={renderOpenModeMenuItems({
                currentMode: "dialog",
                onOpenFileInNewTab,
                openFileWithMode,
                targetFile: openedFile.file,
              })}
              file={index.files.get(openedFile.file.path) ?? openedFile.file}
              formatSettings={formatSettings}
              getFileUrl={getFileUrl}
              loadPreviewImageUrl={loadPreviewImageUrl}
              onSaveFile={onSaveFile}
              pageUrlCache={pageUrlCache}
              pdfSettings={pdfSettings}
              renderFilePreview={renderFilePreview}
              textSettings={textSettings}
              toolbarActions={viewerCloseToolbarAction}
              urlCache={resolvedUrlCache}
              variant="dialog"
              xlsxSettings={xlsxSettings}
            />
          </div>
        </DialogContent>
      ) : null}
      {stagePool.map((path) => {
        if (openedFile?.file.path === path) return null
        const file = index.files.get(path)
        const container = stageContainers.get(path)

        if (!file || !container) return null

        return createPortal(
          <FileSystemGalleryStage
            activeUrl={resolvedUrlCache.get(path)}
            autoSaveEdits={autoSaveEdits}
            file={file}
            formatSettings={formatSettings}
            getFileUrl={getFileUrl}
            loadPreviewImageUrl={loadPreviewImageUrl}
            onSaveFile={onSaveFile}
            pageUrlCache={pageUrlCache}
            pdfSettings={pdfSettings}
            renderFilePreview={renderFilePreview}
            textSettings={textSettings}
            urlCache={resolvedUrlCache}
            variant="stage"
            xlsxSettings={xlsxSettings}
          />,
          container,
          path
        )
      })}
    </Dialog>
  )
}
