import * as React from "react"
import { createPluginRegistration } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/react"
import {
  DocumentManagerPluginPackage,
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react"
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react"
import { RenderPluginPackage } from "@embedpdf/plugin-render/react"
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react"
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react"
import { SearchPluginPackage } from "@embedpdf/plugin-search/react"
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react"
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react"
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react"
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react"
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react"

import { Button } from "./components/ui/button"
import { IconPlaceholder } from "./icon-placeholder"
import { cn } from "./lib/utils"
import {
  PDFViewerLoadingSkeleton,
  PDFViewerToolbar,
  ToolbarTooltip,
} from "./pdf-viewer/toolbar"
import {
  DEFAULT_ZOOM,
  PAGE_GAP,
  PDFViewerScrollAreaResolverContext,
  resolveDefaultScrollAreaViewport,
  THUMBNAIL_GAP,
  THUMBNAIL_IMAGE_PADDING,
  THUMBNAIL_LABEL_HEIGHT,
  THUMBNAIL_PANE_PADDING_Y,
  THUMBNAIL_WIDTH,
  toZoomLevel,
  useSharedPdfEngine,
  ZOOM_OPTIONS,
  type PDFViewerHandle,
  type PDFViewerInnerProps,
  type PDFViewerPageOverlayProps,
  type PDFViewerProps,
  type PDFViewerScrollAreaViewportResolver,
  type PDFViewerZoomLevel,
} from "./pdf-viewer/types"
import { PDFViewerInner } from "./pdf-viewer/viewer-inner"

export type {
  PDFViewerHandle,
  PDFViewerPageOverlayProps,
  PDFViewerProps,
  PDFViewerScrollAreaViewportResolver,
  PDFViewerZoomLevel,
}

function PDFViewerFallbackShell({
  className,
  defaultZoom,
  errorMessage = "Unable to load the PDF preview.",
  extraMenuItems,
  showDownload,
  showRotateControls,
  showToolbar,
  showUpload,
  sidebarOpen,
  state,
  toolbarActions,
  onUploadFile,
}: {
  className?: string
  defaultZoom: PDFViewerZoomLevel
  errorMessage?: string
  extraMenuItems?: React.ReactNode
  showDownload: boolean
  showRotateControls: boolean
  showToolbar: boolean
  showUpload: boolean
  sidebarOpen: boolean
  state: "loading" | "error" | "empty"
  toolbarActions?: React.ReactNode
  onUploadFile?: (file: File) => void
}) {
  return (
    <div
      data-slot="pdf-viewer"
      className={cn(
        "flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden bg-background",
        className
      )}
    >
      {showToolbar ? (
        <PDFViewerToolbar
          activePage={1}
          controlsDisabled
          currentZoomLevel={
            typeof defaultZoom === "number" ? defaultZoom : DEFAULT_ZOOM
          }
          extraMenuItems={extraMenuItems}
          zoomLevel={toZoomLevel(defaultZoom)}
          numPages={0}
          searchControl={
            <ToolbarTooltip label="Search text">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Search text"
                disabled
              >
                <IconPlaceholder
                  lucide="Search"
                  tabler="IconSearch"
                  hugeicons="Search01Icon"
                  phosphor="MagnifyingGlassIcon"
                  remixicon="RiSearchLine"
                  className="size-4"
                />
              </Button>
            </ToolbarTooltip>
          }
          sidebarOpen={sidebarOpen}
          showDownload={showDownload}
          showRotateControls={showRotateControls}
          showUpload={showUpload}
          toolbarActions={toolbarActions}
          onPageChange={() => undefined}
          onRotate={() => undefined}
          onToggleSidebar={() => undefined}
          onUploadFile={onUploadFile}
          onZoomChange={() => undefined}
        />
      ) : null}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-muted/30">
        {state === "loading" ? (
          <PDFViewerLoadingSkeleton sidebarInline sidebarOpen={sidebarOpen} />
        ) : null}
        {state === "error" ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background p-6 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        ) : null}
        {state === "empty" ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground">
            <div className="max-w-sm space-y-3">
              <div className="font-medium text-foreground">
                Upload a PDF to preview
              </div>
              <div>
                Pass a PDF URL with the <code>src</code> prop or use the upload
                control.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PDFViewerDocumentLoader({
  pdfFile,
  onDocumentLoadSuccess,
  ...innerProps
}: {
  pdfFile: string
  onDocumentLoadSuccess?: (numPages: number) => void
} & Omit<PDFViewerInnerProps, "pdfFile" | "documentId" | "document">) {
  const { provides: documentManager } = useDocumentManagerCapability()
  const { activeDocumentId, activeDocument } = useActiveDocument()
  const [loadError, setLoadError] = React.useState(false)
  const openedFileRef = React.useRef<string | null>(null)
  const onDocumentLoadSuccessRef = React.useRef(onDocumentLoadSuccess)

  React.useEffect(() => {
    onDocumentLoadSuccessRef.current = onDocumentLoadSuccess
  })

  React.useEffect(() => {
    if (!documentManager || !pdfFile) return
    if (openedFileRef.current === pdfFile) return

    openedFileRef.current = pdfFile
    setLoadError(false)

    const previousDocumentIds = documentManager
      .getOpenDocuments()
      .map((openDocument) => openDocument.id)
    const handleOpenError = () => {
      if (openedFileRef.current === pdfFile) setLoadError(true)
    }

    documentManager
      .openDocumentUrl({
        url: pdfFile,
        mode: pdfFile.startsWith("blob:") ? "full-fetch" : "auto",
      })
      .wait((response) => {
        response.task.wait((openedDocument) => {
          onDocumentLoadSuccessRef.current?.(openedDocument.pageCount)
          previousDocumentIds.forEach((documentIdToClose) => {
            documentManager.closeDocument(documentIdToClose).wait(
              () => undefined,
              () => undefined
            )
          })
        }, handleOpenError)
      }, handleOpenError)
  }, [documentManager, pdfFile])

  const document =
    activeDocument?.status === "loaded" ? activeDocument.document : null
  const documentFailed = loadError || activeDocument?.status === "error"

  if (!activeDocumentId || documentFailed || !pdfFile) {
    return (
      <PDFViewerFallbackShell
        className={innerProps.className}
        defaultZoom={innerProps.defaultZoom}
        extraMenuItems={innerProps.extraMenuItems}
        showDownload={innerProps.showDownload}
        showRotateControls={innerProps.showRotateControls}
        showToolbar={innerProps.showToolbar}
        showUpload={innerProps.showUpload}
        sidebarOpen={innerProps.defaultSidebarOpen}
        state={!pdfFile ? "empty" : documentFailed ? "error" : "loading"}
        toolbarActions={innerProps.toolbarActions}
        onUploadFile={(file) => {
          innerProps.onUploadFile(file)
          innerProps.onPdfUpload?.(file)
        }}
      />
    )
  }

  return (
    <PDFViewerInner
      key={activeDocumentId}
      {...innerProps}
      pdfFile={pdfFile}
      documentId={activeDocumentId}
      document={document}
    />
  )
}

export const PDFViewer = React.forwardRef<PDFViewerHandle, PDFViewerProps>(
  function PDFViewer(
    {
      className,
      defaultSidebarOpen = false,
      defaultZoom = DEFAULT_ZOOM,
      extraMenuItems,
      fileName,
      resolveScrollAreaViewport,
      showDownload = true,
      showRotateControls = true,
      showToolbar = true,
      showUpload = true,
      src,
      toolbarActions,
      pageClassName,
      renderPageOverlay,
      onActivePageChange,
      onDocumentLoadSuccess,
      onDownloadPdf,
      onPdfUpload,
      onPagePointerDown,
      onPagePointerMove,
      onPagePointerUp,
      onPagePointerCancel,
    },
    ref
  ) {
    const { engine, error: engineError } = useSharedPdfEngine()
    const [uploadedPdfFile, setUploadedPdfFile] = React.useState<{
      src: string | undefined
      url: string | null
    }>(() => ({ src, url: null }))
    const uploadedPdfUrl =
      uploadedPdfFile.src === src ? uploadedPdfFile.url : null
    const pdfFile = uploadedPdfUrl ?? src ?? ""

    React.useEffect(
      () => () => {
        if (uploadedPdfUrl) URL.revokeObjectURL(uploadedPdfUrl)
      },
      [uploadedPdfUrl]
    )

    const handleUploadFile = React.useCallback(
      (nextFile: File) => {
        const nextUrl = URL.createObjectURL(nextFile)

        setUploadedPdfFile({ src, url: nextUrl })
      },
      [src]
    )

    // Plugin registrations are created once per viewer instance.
    const [plugins] = React.useState(() => [
      createPluginRegistration(DocumentManagerPluginPackage),
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap: PAGE_GAP,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultPageGap: PAGE_GAP,
        defaultBufferSize: 2,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 2.5,
        extraRings: 0,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, {
        marquee: { enabled: false },
      }),
      createPluginRegistration(SearchPluginPackage, {
        showAllResults: true,
      }),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: THUMBNAIL_WIDTH,
        gap: THUMBNAIL_GAP,
        imagePadding: THUMBNAIL_IMAGE_PADDING,
        labelHeight: THUMBNAIL_LABEL_HEIGHT,
        paddingY: THUMBNAIL_PANE_PADDING_Y,
        buffer: 3,
        autoScroll: true,
        scrollBehavior: "auto",
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: toZoomLevel(defaultZoom),
        minZoom: ZOOM_OPTIONS[0],
        maxZoom: ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1],
      }),
      createPluginRegistration(RotatePluginPackage),
    ])

    if (engineError) {
      return (
        <PDFViewerFallbackShell
          className={className}
          defaultZoom={defaultZoom}
          errorMessage="Unable to load the PDF engine."
          extraMenuItems={extraMenuItems}
          showDownload={showDownload}
          showRotateControls={showRotateControls}
          showToolbar={showToolbar}
          showUpload={showUpload}
          sidebarOpen={defaultSidebarOpen}
          state="error"
          toolbarActions={toolbarActions}
          onUploadFile={(file) => {
            handleUploadFile(file)
            onPdfUpload?.(file)
          }}
        />
      )
    }

    if (!engine) {
      return (
        <PDFViewerFallbackShell
          className={className}
          defaultZoom={defaultZoom}
          extraMenuItems={extraMenuItems}
          showDownload={showDownload}
          showRotateControls={showRotateControls}
          showToolbar={showToolbar}
          showUpload={showUpload}
          sidebarOpen={defaultSidebarOpen}
          state="loading"
          toolbarActions={toolbarActions}
          onUploadFile={(file) => {
            handleUploadFile(file)
            onPdfUpload?.(file)
          }}
        />
      )
    }

    return (
      <PDFViewerScrollAreaResolverContext.Provider
        value={resolveScrollAreaViewport ?? resolveDefaultScrollAreaViewport}
      >
        <EmbedPDF engine={engine} plugins={plugins}>
          <PDFViewerDocumentLoader
            viewerRef={ref}
            pdfFile={pdfFile}
            defaultSidebarOpen={defaultSidebarOpen}
            defaultZoom={defaultZoom}
            extraMenuItems={extraMenuItems}
            className={className}
            fileName={fileName}
            showDownload={showDownload}
            showToolbar={showToolbar}
            showRotateControls={showRotateControls}
            showUpload={showUpload}
            toolbarActions={toolbarActions}
            pageClassName={pageClassName}
            renderPageOverlay={renderPageOverlay}
            onActivePageChange={onActivePageChange}
            onDocumentLoadSuccess={onDocumentLoadSuccess}
            onDownloadPdf={onDownloadPdf}
            onPdfUpload={onPdfUpload}
            onPagePointerDown={onPagePointerDown}
            onPagePointerMove={onPagePointerMove}
            onPagePointerUp={onPagePointerUp}
            onPagePointerCancel={onPagePointerCancel}
            onUploadFile={handleUploadFile}
          />
        </EmbedPDF>
      </PDFViewerScrollAreaResolverContext.Provider>
    )
  }
)
