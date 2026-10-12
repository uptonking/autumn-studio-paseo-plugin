import * as React from "react"
import type { PdfDocumentObject, Rotation } from "@embedpdf/models"
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react"
import { RenderLayer } from "@embedpdf/plugin-render/react"
import { Rotate } from "@embedpdf/plugin-rotate/react"
import type { PageLayout } from "@embedpdf/plugin-scroll/react"
import { SearchLayer } from "@embedpdf/plugin-search/react"
import { TilingLayer } from "@embedpdf/plugin-tiling/react"

import { cn } from "../lib/utils"
import { PDFViewerTextSelectionLayer } from "./scroller"
import {
  normalizeRotation,
  PAGE_BASE_RENDER_DPR,
  PAGE_BASE_RENDER_MAX_SCALE,
  rotationToDegrees,
  type PageRotationDeltas,
  type PDFViewerPageOverlayProps,
  type PDFViewerProps,
} from "./types"

export interface PDFViewerPageLayerProps {
  basePageRotations: Rotation[]
  currentZoomLevel: number
  documentId: string
  page: PageLayout
  pageClassName?: (pageNumber: number) => string | undefined
  pageRotationDeltas: PageRotationDeltas
  pdfDocument: PdfDocumentObject | null
  renderPageOverlay?: (props: PDFViewerPageOverlayProps) => React.ReactNode
  onPagePointerDown?: PDFViewerProps["onPagePointerDown"]
  onPagePointerMove?: PDFViewerProps["onPagePointerMove"]
  onPagePointerUp?: PDFViewerProps["onPagePointerUp"]
  onPagePointerCancel?: PDFViewerProps["onPagePointerCancel"]
}

export function PDFViewerPageLayer({
  basePageRotations,
  currentZoomLevel,
  documentId,
  page,
  pageClassName,
  pageRotationDeltas,
  pdfDocument,
  renderPageOverlay,
  onPagePointerDown,
  onPagePointerMove,
  onPagePointerUp,
  onPagePointerCancel,
}: PDFViewerPageLayerProps) {
  const pageNumber = page.pageNumber
  const basePageRotation =
    basePageRotations[page.pageIndex] ??
    pdfDocument?.pages[page.pageIndex]?.rotation ??
    normalizeRotation(0)
  const pageRotation = normalizeRotation(
    basePageRotation + (pageRotationDeltas.get(page.pageIndex) ?? 0)
  )

  return (
    <Rotate
      documentId={documentId}
      pageIndex={page.pageIndex}
      rotation={pageRotation}
    >
      <PagePointerProvider
        documentId={documentId}
        pageIndex={page.pageIndex}
        rotation={pageRotation}
        key={`${page.pageIndex}-${pageRotation}`}
        data-pdf-viewer-page={pageNumber}
        className={cn(
          "relative border border-transparent bg-transparent shadow-xs select-none selection:bg-transparent selection:text-inherit",
          pageClassName?.(pageNumber)
        )}
        style={{ backgroundColor: "transparent" }}
        onPointerDown={(event: React.PointerEvent<HTMLDivElement>) =>
          onPagePointerDown?.(event, pageNumber)
        }
        onPointerMove={(event: React.PointerEvent<HTMLDivElement>) =>
          onPagePointerMove?.(event, pageNumber)
        }
        onPointerUp={(event: React.PointerEvent<HTMLDivElement>) =>
          onPagePointerUp?.(event, pageNumber)
        }
        onPointerCancel={(event: React.PointerEvent<HTMLDivElement>) =>
          onPagePointerCancel?.(event, pageNumber)
        }
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white"
        />
        <RenderLayer
          documentId={documentId}
          pageIndex={page.pageIndex}
          scale={Math.min(currentZoomLevel, PAGE_BASE_RENDER_MAX_SCALE)}
          dpr={PAGE_BASE_RENDER_DPR}
          className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-100 blur-[0.35px] transition-none"
        />
        <TilingLayer
          documentId={documentId}
          pageIndex={page.pageIndex}
          key={`tiles-${page.pageIndex}-${pageRotation}`}
          className="pointer-events-none opacity-100 transition-none [&_img]:opacity-100 [&_img]:transition-none"
        />
        <SearchLayer
          documentId={documentId}
          pageIndex={page.pageIndex}
          className="pointer-events-none"
          highlightColor="rgba(253, 224, 71, 0.45)"
          activeHighlightColor="rgba(249, 115, 22, 0.55)"
        />
        <PDFViewerTextSelectionLayer
          documentId={documentId}
          pageIndex={page.pageIndex}
          scale={currentZoomLevel}
        />
        {renderPageOverlay?.({
          pageNumber,
          pageWidth: page.width,
          pageHeight: page.height,
          scale: currentZoomLevel,
          rotation: rotationToDegrees(pageRotation),
        })}
      </PagePointerProvider>
    </Rotate>
  )
}
