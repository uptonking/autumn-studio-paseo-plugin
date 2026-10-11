import * as React from "react"
import type { PdfDocumentObject, Rotation } from "@embedpdf/models"
import {
  ThumbImg,
  useThumbnailPlugin,
  type ThumbMeta,
} from "@embedpdf/plugin-thumbnail/react"

import { cn } from "../lib/utils"
import { ScrollArea } from "../components/ui/scroll-area"
import {
  buildThumbnailLayout,
  DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR,
  getVisibleThumbnailItems,
  PDFViewerScrollAreaResolverContext,
  rotationToDegrees,
  setPdfViewerRef,
  THUMBNAIL_FOCUS_RING_CLASS,
  THUMBNAIL_GAP,
  THUMBNAIL_LABEL_HEIGHT,
  THUMBNAIL_WIDTH,
  type PageRotationDeltas,
  type ThumbnailSelectionMode,
} from "./types"

export function PDFViewerScrollArea({
  children,
  className,
  viewportClassName,
  viewportProps,
  viewportRef,
}: {
  children: React.ReactNode
  className?: string
  viewportClassName?: string
  viewportProps?: React.HTMLAttributes<HTMLDivElement>
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  const resolveScrollAreaViewport = React.useContext(
    PDFViewerScrollAreaResolverContext
  )
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const { className: viewportPropsClassName, ...resolvedViewportProps } =
    viewportProps ?? {}

  const setViewportRef = React.useCallback(
    (viewport: HTMLDivElement | null) => {
      setPdfViewerRef(viewportRef, viewport)
    },
    [viewportRef]
  )

  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewport = resolveScrollAreaViewport(container)

    if (!viewport) {
      console.error(
        `PDFViewer could not resolve the scroll viewport. Add ${DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR} to your ScrollArea viewport or pass resolveScrollAreaViewport.`
      )
      return
    }

    setViewportRef(viewport)

    return () => setViewportRef(null)
  }, [resolveScrollAreaViewport, setViewportRef])

  return (
    <div
      ref={containerRef}
      data-slot="pdf-viewer-scroll-area"
      className={cn("size-full min-h-0", className)}
    >
      <ScrollArea className="size-full min-h-0">
        <div
          {...resolvedViewportProps}
          data-slot="pdf-viewer-scroll-content"
          className={cn(
            "min-h-full",
            viewportPropsClassName,
            viewportClassName
          )}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}

export function PDFViewerThumbnails({
  basePageRotations,
  documentId,
  activePage,
  pageCount,
  pageRotationDeltas,
  pdfDocument,
  selectedPageIndexes,
  onSelectPage,
}: {
  basePageRotations: Rotation[]
  documentId: string
  activePage: number
  pageCount: number
  pageRotationDeltas: PageRotationDeltas
  pdfDocument: PdfDocumentObject | null
  selectedPageIndexes: Set<number>
  onSelectPage: (pageNumber: number, mode: ThumbnailSelectionMode) => void
}) {
  const thumbnailListboxId = React.useId()
  const activeDescendantId =
    activePage > 0 ? `${thumbnailListboxId}-page-${activePage}` : undefined

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (pageCount < 1) return

      const currentPage = activePage > 0 ? activePage : 1
      let nextPage: number | null = null

      if (event.key === "ArrowDown") {
        nextPage = Math.min(pageCount, currentPage + 1)
      } else if (event.key === "ArrowUp") {
        nextPage = Math.max(1, currentPage - 1)
      } else if (event.key === "Home") {
        nextPage = 1
      } else if (event.key === "End") {
        nextPage = pageCount
      } else if (event.key === " ") {
        event.preventDefault()
        onSelectPage(currentPage, "toggle")
        return
      }

      if (nextPage === null) return

      event.preventDefault()
      onSelectPage(nextPage, event.shiftKey ? "range" : "replace")
    },
    [activePage, onSelectPage, pageCount]
  )

  return (
    <PDFViewerThumbnailScrollArea
      activeDescendantId={activeDescendantId}
      basePageRotations={basePageRotations}
      documentId={documentId}
      onKeyDown={handleKeyDown}
      pageRotationDeltas={pageRotationDeltas}
      pdfDocument={pdfDocument}
    >
      {(meta: ThumbMeta) => {
        const pageNumber = meta.pageIndex + 1
        const isActive = pageNumber === activePage
        const isSelected = selectedPageIndexes.has(meta.pageIndex)
        const imagePadding = meta.padding ?? 0
        const pageRotationDelta = pageRotationDeltas.get(meta.pageIndex) ?? 0
        const thumbnailImageStyle: React.CSSProperties =
          pageRotationDelta % 2 === 1
            ? {
                height: meta.width,
                transform: `rotate(${rotationToDegrees(pageRotationDelta)}deg)`,
                width: meta.height,
              }
            : {
                height: meta.height,
                transform:
                  pageRotationDelta === 0
                    ? undefined
                    : `rotate(${rotationToDegrees(pageRotationDelta)}deg)`,
                width: meta.width,
              }

        return (
          <div
            key={meta.pageIndex}
            data-pdf-viewer-thumbnail={pageNumber}
            className={cn(
              "absolute right-0 left-0 flex justify-center",
              isActive && "z-10"
            )}
            style={{ top: meta.top, height: meta.wrapperHeight }}
          >
            <div
              id={`${thumbnailListboxId}-page-${pageNumber}`}
              role="option"
              data-pdf-viewer-thumbnail-option={pageNumber}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Page ${pageNumber}`}
              aria-posinset={pageNumber}
              aria-selected={isSelected}
              aria-setsize={pageCount}
              data-selected={isSelected ? "" : undefined}
              className={cn(
                "flex h-full w-full cursor-default flex-col items-center justify-between rounded-md px-2 py-0 text-xs transition-shadow outline-none select-none hover:bg-sidebar-accent",
                isActive || isSelected
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground",
                isActive && THUMBNAIL_FOCUS_RING_CLASS
              )}
              onClick={(event) => {
                const mode = event.shiftKey
                  ? "range"
                  : event.metaKey || event.ctrlKey
                    ? "toggle"
                    : "replace"

                onSelectPage(pageNumber, mode)
              }}
            >
              <span
                className="mt-0 flex items-center justify-center overflow-hidden rounded-md bg-transparent"
                style={{
                  width: meta.width + imagePadding * 2,
                  height: meta.height + imagePadding * 2,
                  padding: imagePadding,
                }}
              >
                <ThumbImg
                  documentId={documentId}
                  meta={meta}
                  className="block rounded-sm object-contain"
                  style={thumbnailImageStyle}
                />
              </span>
              <span
                className="flex items-center justify-center tabular-nums"
                style={{ height: meta.labelHeight }}
              >
                <span className="flex min-w-5 items-center justify-center px-1.5 text-center leading-5">
                  {pageNumber}
                </span>
              </span>
            </div>
          </div>
        )
      }}
    </PDFViewerThumbnailScrollArea>
  )
}

function PDFViewerThumbnailScrollArea({
  activeDescendantId,
  basePageRotations,
  children,
  documentId,
  onKeyDown,
  pageRotationDeltas,
  pdfDocument,
}: {
  activeDescendantId?: string
  basePageRotations: Rotation[]
  children: (meta: ThumbMeta) => React.ReactNode
  documentId: string
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>
  pageRotationDeltas: PageRotationDeltas
  pdfDocument: PdfDocumentObject | null
}) {
  const { plugin: thumbnailPlugin } = useThumbnailPlugin()
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [viewportMetrics, setViewportMetrics] = React.useState({
    clientHeight: 0,
    scrollTop: 0,
  })
  const thumbnailScope = React.useMemo(
    () => thumbnailPlugin?.provides().forDocument(documentId) ?? null,
    [documentId, thumbnailPlugin]
  )

  const windowState = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        if (!thumbnailScope) return () => undefined

        return thumbnailScope.onWindow(() => onStoreChange())
      },
      [thumbnailScope]
    ),
    React.useCallback(
      () => thumbnailScope?.getWindow() ?? null,
      [thumbnailScope]
    ),
    () => null
  )
  const hasWindowState = Boolean(windowState)
  const paddingY = thumbnailPlugin?.cfg.paddingY ?? 0
  const thumbnailLayout = React.useMemo(
    () =>
      buildThumbnailLayout({
        basePageRotations,
        pageRotationDeltas,
        pdfDocument,
        width: thumbnailPlugin?.cfg.width ?? THUMBNAIL_WIDTH,
        gap: thumbnailPlugin?.cfg.gap ?? THUMBNAIL_GAP,
        imagePadding: thumbnailPlugin?.cfg.imagePadding ?? 0,
        labelHeight: thumbnailPlugin?.cfg.labelHeight ?? THUMBNAIL_LABEL_HEIGHT,
        paddingY,
      }),
    [
      basePageRotations,
      pageRotationDeltas,
      pdfDocument,
      paddingY,
      thumbnailPlugin,
    ]
  )
  const effectiveWindowState = React.useMemo(() => {
    if (!thumbnailLayout) return windowState

    const items = getVisibleThumbnailItems({
      buffer: thumbnailPlugin?.cfg.buffer ?? 3,
      clientHeight: viewportMetrics.clientHeight,
      items: thumbnailLayout.items,
      scrollTop: viewportMetrics.scrollTop,
    })

    return {
      start: items[0]?.pageIndex ?? -1,
      end: items.at(-1)?.pageIndex ?? -1,
      items,
      totalHeight: thumbnailLayout.totalHeight,
    }
  }, [thumbnailLayout, thumbnailPlugin, viewportMetrics, windowState])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !thumbnailScope) return

    const updateWindow = () => {
      setViewportMetrics({
        clientHeight: viewport.clientHeight,
        scrollTop: viewport.scrollTop,
      })
      thumbnailScope.updateWindow(viewport.scrollTop, viewport.clientHeight)
    }

    viewport.addEventListener("scroll", updateWindow)
    const frame = window.requestAnimationFrame(updateWindow)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener("scroll", updateWindow)
    }
  }, [thumbnailScope])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !thumbnailScope) return

    const resizeObserver = new ResizeObserver(() => {
      setViewportMetrics({
        clientHeight: viewport.clientHeight,
        scrollTop: viewport.scrollTop,
      })
      thumbnailScope.updateWindow(viewport.scrollTop, viewport.clientHeight)
    })

    resizeObserver.observe(viewport)

    return () => resizeObserver.disconnect()
  }, [thumbnailScope])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !thumbnailScope) return

    thumbnailScope.updateWindow(viewport.scrollTop, viewport.clientHeight)
  }, [thumbnailLayout, thumbnailScope, windowState])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !thumbnailScope || !hasWindowState) return

    return thumbnailScope.onScrollTo(({ top, behavior }) => {
      viewport.scrollTo({ top, behavior })
    })
  }, [hasWindowState, thumbnailScope])

  return (
    <PDFViewerScrollArea
      className="h-full w-full"
      viewportClassName="group/pdf-thumbnail-sidebar px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
      viewportProps={{
        "aria-activedescendant": activeDescendantId,
        "aria-label": "PDF pages",
        "aria-multiselectable": true,
        onKeyDown,
        onMouseDown: (event) => {
          event.currentTarget.focus({ preventScroll: true })
        },
        role: "listbox",
        style: {
          paddingBottom: paddingY,
          paddingTop: paddingY,
        },
        tabIndex: 0,
      }}
      viewportRef={viewportRef}
    >
      <div
        className="relative"
        style={{ height: effectiveWindowState?.totalHeight ?? 0 }}
      >
        {effectiveWindowState?.items.map((meta) => children(meta))}
      </div>
    </PDFViewerScrollArea>
  )
}
