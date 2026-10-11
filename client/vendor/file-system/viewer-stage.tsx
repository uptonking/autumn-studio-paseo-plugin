import * as React from "react"
import { createPortal } from "react-dom"

import {
  FileViewerLoadingFallback,
  RegisteredFileViewer,
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
  type FileSystemIndex,
  type FileSystemOpenMode,
  type FileSystemPdfSettings,
  type FileSystemTextSettings,
  type FileSystemViewerKind,
} from "./types"
import { useResolvedFileUrl } from "./virtual-window"

export const FileSystemViewerLoading = FileViewerLoadingFallback

export function FileSystemGalleryStage({
  extraMenuItems,
  file,
  getFileUrl,
  loadPreviewImageUrl,
  pageUrlCache,
  pdfSettings,
  renderFilePreview,
  textSettings,
  toolbarActions,
  urlCache,
  variant = "stage",
}: {
  extraMenuItems?: React.ReactNode
  file: FileEntry
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  pageUrlCache?: Map<string, string>
  pdfSettings?: FileSystemPdfSettings
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
  textSettings?: FileSystemTextSettings
  /** Rendered in the viewer toolbar in the `"dialog"` or `"in-place"` variant. */
  toolbarActions?: React.ReactNode
  urlCache: Map<string, string>
  /** `"stage"` is toolbar-less in a bordered tile; `"dialog"` and `"in-place"` show the full viewer chrome. */
  variant?: "dialog" | "in-place" | "stage"
}) {
  const viewerKind = viewerKindForFile(file)
  const { isResolving, url } = useResolvedFileUrl(
    viewerKind ? file : null,
    getFileUrl,
    urlCache
  )
  const hasFullChrome = variant === "dialog" || variant === "in-place"
  const viewerFrameClassName = cn(
    "size-full",
    !hasFullChrome && viewerKind !== "image" && "overflow-hidden rounded-lg border",
    !hasFullChrome && viewerKind === "image" && "flex items-center justify-center"
  )

  if (viewerKind && isResolving) {
    return <Spinner className="size-6 text-muted-foreground" />
  }
  if (viewerKind && url) {
    return (
      <div className={viewerFrameClassName}>
        <RegisteredFileViewer
          kind={viewerKind}
          src={url}
          fileName={file.name}
          variant={variant}
          pdfSettings={pdfSettings}
          textSettings={textSettings}
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
  dialogStageHostRef,
  getFileUrl,
  index,
  loadPreviewImageUrl,
  onCloseDialog,
  onOpenFileInNewTab,
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
}: {
  dialogStageHostRef: (element: HTMLDivElement | null) => void
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  index: FileSystemIndex
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  onCloseDialog: () => void
  onOpenFileInNewTab?: (file: FileSystemFileItem, url: string) => void
  openedFile: {
    file: FileEntry
    kind: FileSystemViewerKind
    mode: "in-place" | "dialog"
    url: string
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
}) {
  const isOpenedInDialog = openedFile?.mode === "dialog"
  const isOpenedInPlace = openedFile?.mode === "in-place"

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
          showCloseButton={
            openedFile.kind !== "pdf" &&
            openedFile.kind !== "text" &&
            openedFile.kind !== "image"
          }
        >
          <DialogTitle className="sr-only">{openedFileName}</DialogTitle>
          <div
            ref={dialogStageHostRef}
            className="flex h-full min-h-0 flex-1 flex-col"
          />
        </DialogContent>
      ) : null}
      {stagePool.map((path) => {
        const file = index.files.get(path)
        const container = stageContainers.get(path)

        if (!file || !container) return null

        const isDialogTarget =
          isOpenedInDialog &&
          openedFile !== null &&
          openedFile.file.path === path
        const isInPlaceTarget =
          isOpenedInPlace &&
          openedFile !== null &&
          openedFile.file.path === path

        return createPortal(
          <FileSystemGalleryStage
            extraMenuItems={
              isDialogTarget
                ? renderOpenModeMenuItems({
                    currentMode: "dialog",
                    onOpenFileInNewTab,
                    openFileWithMode,
                    targetFile: file,
                  })
                : isInPlaceTarget
                  ? renderOpenModeMenuItems({
                      currentMode: "in-place",
                      onOpenFileInNewTab,
                      openFileWithMode,
                      targetFile: file,
                    })
                  : undefined
            }
            file={file}
            getFileUrl={getFileUrl}
            loadPreviewImageUrl={loadPreviewImageUrl}
            pageUrlCache={pageUrlCache}
            pdfSettings={pdfSettings}
            renderFilePreview={renderFilePreview}
            textSettings={textSettings}
            toolbarActions={
              isDialogTarget ? viewerCloseToolbarAction : undefined
            }
            urlCache={resolvedUrlCache}
            variant={
              isDialogTarget
                ? "dialog"
                : isInPlaceTarget
                  ? "in-place"
                  : "stage"
            }
          />,
          container,
          path
        )
      })}
    </Dialog>
  )
}
