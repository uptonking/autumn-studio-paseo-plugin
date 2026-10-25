import * as React from 'react';
import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { ZoomMode } from '@embedpdf/plugin-zoom/react';

import { loadSharedPdfEngine } from '../lib/pdf-thumbnail-utils';

export * from './layout-utils';

export interface PDFViewerPageOverlayProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  rotation: number;
}

export interface PDFViewerHandle {
  scrollToPage: (pageNumber: number, options?: ScrollIntoViewOptions) => void;
  scrollToPageArea: (
    pageNumber: number,
    area: { top: number; left?: number; width?: number; height?: number },
    options?: ScrollToOptions,
  ) => void;
  getViewportElement: () => HTMLDivElement | null;
}

export type PDFViewerScrollAreaViewportResolver = (
  container: HTMLDivElement,
) => HTMLDivElement | null;

export type PDFViewerZoomLevel = number | 'fit-page' | 'fit-width' | 'automatic';

export interface PDFViewerProps {
  className?: string;
  defaultSidebarOpen?: boolean;
  defaultZoom?: PDFViewerZoomLevel;
  extraMenuItems?: React.ReactNode;
  fileName?: string;
  resolveScrollAreaViewport?: PDFViewerScrollAreaViewportResolver;
  showDownload?: boolean;
  showToolbar?: boolean;
  showRotateControls?: boolean;
  showUpload?: boolean;
  src?: string;
  toolbarActions?: React.ReactNode;
  pageClassName?: (pageNumber: number) => string | undefined;
  renderPageOverlay?: (props: PDFViewerPageOverlayProps) => React.ReactNode;
  onActivePageChange?: (pageNumber: number) => void;
  onDocumentLoadSuccess?: (numPages: number) => void;
  onDownloadPdf?: (defaultFileName: string) => Promise<void> | void;
  onPdfUpload?: (file: File) => void;
  onPagePointerDown?: (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => void;
  onPagePointerMove?: (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => void;
  onPagePointerUp?: (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => void;
  onPagePointerCancel?: (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => void;
}

export interface PDFViewerInnerProps {
  viewerRef: React.ForwardedRef<PDFViewerHandle>;
  pdfFile: string;
  documentId: string;
  document: PdfDocumentObject | null;
  defaultSidebarOpen: boolean;
  defaultZoom: PDFViewerZoomLevel;
  extraMenuItems?: React.ReactNode;
  className?: string;
  fileName?: string;
  showDownload: boolean;
  showToolbar: boolean;
  showRotateControls: boolean;
  showUpload: boolean;
  toolbarActions?: React.ReactNode;
  pageClassName?: (pageNumber: number) => string | undefined;
  renderPageOverlay?: (props: PDFViewerPageOverlayProps) => React.ReactNode;
  onActivePageChange?: (pageNumber: number) => void;
  onDownloadPdf?: (defaultFileName: string) => Promise<void> | void;
  onPdfUpload?: (file: File) => void;
  onPagePointerDown?: PDFViewerProps['onPagePointerDown'];
  onPagePointerMove?: PDFViewerProps['onPagePointerMove'];
  onPagePointerUp?: PDFViewerProps['onPagePointerUp'];
  onPagePointerCancel?: PDFViewerProps['onPagePointerCancel'];
  onUploadFile: (file: File) => void;
}

export const DEFAULT_ZOOM = 1;
export const ZOOM_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
export const PAGE_GAP = 24;
export const THUMBNAIL_PAGE_WIDTH = 92;
export const THUMBNAIL_IMAGE_PADDING = 8;
export const THUMBNAIL_WIDTH = THUMBNAIL_PAGE_WIDTH + THUMBNAIL_IMAGE_PADDING * 2;
export const THUMBNAIL_LABEL_HEIGHT = 24;
export const THUMBNAIL_GAP = 12;
export const THUMBNAIL_PANE_PADDING_Y = 16;
export const THUMBNAIL_SIDEBAR_WIDTH_CLASS = 'w-40';
export const THUMBNAIL_SIDEBAR_CLOSED_CLASS = '-ml-40';
export const PAGE_BASE_RENDER_MAX_SCALE = 1;
export const PAGE_BASE_RENDER_DPR = 1;
export const PDF_SEARCH_DEBOUNCE_MS = 300;
export const TEXT_SELECTION_BACKGROUND = 'rgba(59, 130, 246, 0.14)';
export const THUMBNAIL_FOCUS_RING_CLASS =
  'group-focus-visible/pdf-thumbnail-sidebar:ring-2 group-focus-visible/pdf-thumbnail-sidebar:ring-ring group-focus-visible/pdf-thumbnail-sidebar:ring-offset-1 group-focus-visible/pdf-thumbnail-sidebar:ring-offset-background';
export const DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]';
export const ZOOM_MODE_LABELS: Record<ZoomMode, string> = {
  [ZoomMode.FitPage]: 'Fit page',
  [ZoomMode.FitWidth]: 'Fit width',
  [ZoomMode.Automatic]: 'Automatic',
};

export function toZoomLevel(level: PDFViewerZoomLevel): ZoomMode | number {
  if (level === 'fit-page') return ZoomMode.FitPage;
  if (level === 'fit-width') return ZoomMode.FitWidth;
  if (level === 'automatic') return ZoomMode.Automatic;
  return level;
}

export function isZoomMode(value: unknown): value is ZoomMode {
  return value === ZoomMode.FitPage || value === ZoomMode.FitWidth || value === ZoomMode.Automatic;
}

export function resolveDefaultScrollAreaViewport(container: HTMLDivElement) {
  return container.querySelector<HTMLDivElement>(DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR);
}

export const PDFViewerScrollAreaResolverContext =
  React.createContext<PDFViewerScrollAreaViewportResolver>(resolveDefaultScrollAreaViewport);

export function useSharedPdfEngine() {
  const [engine, setEngine] = React.useState<PdfEngine | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    loadSharedPdfEngine().then(
      (loadedEngine) => {
        if (!cancelled) setEngine(loadedEngine);
      },
      (loadError: Error) => {
        if (!cancelled) setError(loadError);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return { engine, error };
}
