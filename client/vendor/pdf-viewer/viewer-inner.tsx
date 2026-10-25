import * as React from 'react';
import { refreshPages } from '@embedpdf/core';
import { useRegistry } from '@embedpdf/core/react';
import { GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { useScroll, type PageLayout } from '@embedpdf/plugin-scroll/react';
import { CopyToClipboard } from '@embedpdf/plugin-selection/react';
import { useThumbnailCapability, useThumbnailPlugin } from '@embedpdf/plugin-thumbnail/react';
import { useZoom } from '@embedpdf/plugin-zoom/react';
import { flushSync } from 'react-dom';

import { cn } from '../lib/utils';
import {
  DocumentViewerThumbnailSidebar,
  useElementWidth,
  useInlineThumbnailSidebar,
} from '../document-viewer-sidebar';
import { PDFViewerPageLayer } from './page-layer';
import {
  PDFViewerScroller,
  PDFViewerScrollAreaViewport,
  PDFViewerSelectionCopyShortcut,
  PDFViewerSelectionReleaseGuard,
  PDFViewerViewportBridge,
} from './scroller';
import { PDFViewerSearchControl } from './search-control';
import { PDFViewerThumbnails } from './thumbnails';
import { PDFViewerLoadingSkeleton, PDFViewerToolbar } from './toolbar';
import {
  arePageIndexSetsEqual,
  downloadPdfWithPageRotations,
  getPageIndexRange,
  getPdfDownloadFileName,
  getRotatedDimensions,
  normalizeRotation,
  THUMBNAIL_SIDEBAR_CLOSED_CLASS,
  THUMBNAIL_SIDEBAR_WIDTH_CLASS,
  toZoomLevel,
  type PageRotationDeltas,
  type PDFViewerInnerProps,
  type ThumbnailSelectionMode,
} from './types';

export function PDFViewerInner({
  viewerRef,
  pdfFile,
  documentId,
  document: pdfDocument,
  defaultSidebarOpen,
  defaultZoom,
  extraMenuItems,
  className,
  fileName,
  showDownload,
  showToolbar,
  showRotateControls,
  showUpload,
  toolbarActions,
  pageClassName,
  renderPageOverlay,
  onActivePageChange,
  onDownloadPdf,
  onPdfUpload,
  onPagePointerDown,
  onPagePointerMove,
  onPagePointerUp,
  onPagePointerCancel,
  onUploadFile,
}: PDFViewerInnerProps) {
  const { registry } = useRegistry();
  const { state: scrollState, provides: scroll } = useScroll(documentId);
  const { state: zoomState, provides: zoom } = useZoom(documentId);
  const { provides: thumbnails } = useThumbnailCapability();
  const { plugin: thumbnailPlugin } = useThumbnailPlugin();
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen);
  const [searchOpenRequest, setSearchOpenRequest] = React.useState(0);

  React.useEffect(() => {
    setSidebarOpen(defaultSidebarOpen);
  }, [defaultSidebarOpen]);

  const prevDefaultZoomRef = React.useRef(defaultZoom);
  React.useEffect(() => {
    if (prevDefaultZoomRef.current === defaultZoom) return;
    prevDefaultZoomRef.current = defaultZoom;
    zoom?.requestZoom(toZoomLevel(defaultZoom));
  }, [defaultZoom, zoom]);
  const [isPreparingDownload, setIsPreparingDownload] = React.useState(false);
  const [pageRotationDeltas, setPageRotationDeltas] = React.useState<PageRotationDeltas>(
    () => new Map(),
  );
  const [selectedPageIndexes, setSelectedPageIndexes] = React.useState<Set<number>>(
    () => new Set(),
  );
  const basePageRotations = React.useMemo(
    () => pdfDocument?.pages.map((page) => normalizeRotation(page.rotation)) ?? [],
    [pdfDocument],
  );
  const [viewerShellRef, viewerShellWidth] = useElementWidth<HTMLDivElement>();
  const sidebarInline = useInlineThumbnailSidebar(viewerShellWidth);
  const viewportElementRef = React.useRef<HTMLDivElement | null>(null);
  const pageRotationDeltasRef = React.useRef(pageRotationDeltas);
  const selectedPageIndexesRef = React.useRef(selectedPageIndexes);
  const selectionAnchorPageIndexRef = React.useRef<number | null>(null);
  const suppressActivePageSelectionSyncRef = React.useRef<number | null>(null);
  const initializedSelectionDocumentRef = React.useRef<string | null>(null);

  const activePage = scrollState.currentPage;
  const numPages = pdfDocument?.pageCount ?? 0;
  const isLoading = !pdfDocument;
  const controlsDisabled = !numPages;
  const downloadDisabled = controlsDisabled || isPreparingDownload;
  const thumbnailSidebarVisible = sidebarOpen && !isLoading;
  const currentZoomLevel = zoomState.currentZoomLevel;
  const alignedThumbnailSidebarDocumentRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    pageRotationDeltasRef.current = pageRotationDeltas;
  }, [pageRotationDeltas]);

  React.useEffect(() => {
    selectedPageIndexesRef.current = selectedPageIndexes;
  }, [selectedPageIndexes]);

  React.useEffect(() => {
    if (activePage > 0) onActivePageChange?.(activePage);
  }, [activePage, onActivePageChange]);

  React.useEffect(() => {
    if (activePage < 1 || numPages < 1) return;

    const activePageIndex = activePage - 1;
    const suppressedPageIndex = suppressActivePageSelectionSyncRef.current;

    suppressActivePageSelectionSyncRef.current = null;

    if (suppressedPageIndex === activePageIndex) return;

    const nextSelection = new Set([activePageIndex]);

    selectionAnchorPageIndexRef.current = activePageIndex;
    selectedPageIndexesRef.current = nextSelection;
    setSelectedPageIndexes((previousSelection) =>
      arePageIndexSetsEqual(previousSelection, nextSelection) ? previousSelection : nextSelection,
    );
  }, [activePage, numPages]);

  React.useEffect(() => {
    if (numPages < 1 || initializedSelectionDocumentRef.current === documentId) {
      return;
    }

    const initialPageIndex = Math.max(0, (activePage > 0 ? activePage : 1) - 1);
    const initialSelection = new Set([initialPageIndex]);

    initializedSelectionDocumentRef.current = documentId;
    selectionAnchorPageIndexRef.current = initialPageIndex;
    selectedPageIndexesRef.current = initialSelection;
    setSelectedPageIndexes(initialSelection);
  }, [activePage, documentId, numPages]);

  React.useEffect(() => {
    if (!thumbnailSidebarVisible) {
      alignedThumbnailSidebarDocumentRef.current = null;
      return;
    }

    if (
      activePage < 1 ||
      !thumbnails ||
      alignedThumbnailSidebarDocumentRef.current === documentId
    ) {
      return;
    }

    alignedThumbnailSidebarDocumentRef.current = documentId;
    const frame = window.requestAnimationFrame(() => {
      thumbnails.forDocument(documentId).scrollToThumb(activePage - 1);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePage, documentId, thumbnailSidebarVisible, thumbnails]);

  const initialZoomDocumentRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pdfDocument || !zoom) return;
    if (initialZoomDocumentRef.current === documentId) return;

    initialZoomDocumentRef.current = documentId;
    zoom.requestZoom(toZoomLevel(defaultZoom));
  }, [defaultZoom, documentId, pdfDocument, zoom]);

  const scrollToPage = React.useCallback(
    (pageNumber: number, options?: ScrollIntoViewOptions) => {
      scroll?.scrollToPage({
        pageNumber,
        behavior: options?.behavior === 'smooth' ? 'smooth' : 'auto',
      });
    },
    [scroll],
  );

  const selectThumbnailPage = React.useCallback(
    (pageNumber: number, mode: ThumbnailSelectionMode) => {
      const pageIndex = pageNumber - 1;

      if (pageIndex < 0 || pageIndex >= numPages) return;

      suppressActivePageSelectionSyncRef.current = pageIndex;

      setSelectedPageIndexes((previousSelection) => {
        let nextSelection: Set<number>;

        if (mode === 'range') {
          const anchorPageIndex =
            selectionAnchorPageIndexRef.current ?? (activePage > 0 ? activePage - 1 : pageIndex);

          nextSelection = getPageIndexRange(anchorPageIndex, pageIndex);
        } else if (mode === 'toggle') {
          nextSelection = new Set(previousSelection);

          if (nextSelection.has(pageIndex)) {
            nextSelection.delete(pageIndex);
          } else {
            nextSelection.add(pageIndex);
          }

          selectionAnchorPageIndexRef.current = pageIndex;
        } else {
          nextSelection = new Set([pageIndex]);
          selectionAnchorPageIndexRef.current = pageIndex;
        }

        selectedPageIndexesRef.current = nextSelection;
        return nextSelection;
      });

      scrollToPage(pageNumber);
    },
    [activePage, numPages, scrollToPage],
  );

  React.useImperativeHandle(
    viewerRef,
    () => ({
      scrollToPage,
      scrollToPageArea: (pageNumber, area, options) => {
        const pageSize = pdfDocument?.pages[pageNumber - 1]?.size;

        scroll?.scrollToPage({
          pageNumber,
          ...(pageSize
            ? {
                pageCoordinates: {
                  x: ((area.left ?? 0) / 100) * pageSize.width,
                  y: (area.top / 100) * pageSize.height,
                },
                alignY: 25,
              }
            : {}),
          behavior: options?.behavior === 'smooth' ? 'smooth' : 'auto',
        });
      },
      getViewportElement: () => viewportElementRef.current,
    }),
    [pdfDocument, scroll, scrollToPage],
  );

  const handleDownload = React.useCallback(async () => {
    if (!pdfFile || isPreparingDownload) return;

    const resolvedFileName = getPdfDownloadFileName(fileName, pdfFile);
    setIsPreparingDownload(true);

    try {
      if (onDownloadPdf) {
        await onDownloadPdf(resolvedFileName);
      } else {
        await downloadPdfWithPageRotations({
          fileName: resolvedFileName,
          pageRotationDeltas,
          src: pdfFile,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsPreparingDownload(false);
    }
  }, [fileName, isPreparingDownload, onDownloadPdf, pageRotationDeltas, pdfFile]);

  const rotateSelectedPages = React.useCallback(
    (direction: -1 | 1) => {
      if (!pdfDocument || !registry || activePage < 1) return;

      const documentState = registry.getStore().getState().core.documents[documentId];
      const currentDocument = documentState?.document ?? pdfDocument;
      const selectedTargetPageIndexes = Array.from(selectedPageIndexesRef.current).filter(
        (pageIndex) => currentDocument.pages[pageIndex],
      );
      const fallbackPageIndex = activePage - 1;
      const targetPageIndexes = (
        selectedTargetPageIndexes.length ? selectedTargetPageIndexes : [fallbackPageIndex]
      )
        .filter((pageIndex) => currentDocument.pages[pageIndex])
        .sort((a, b) => a - b);

      if (targetPageIndexes.length === 0) return;

      const previousDeltas = pageRotationDeltasRef.current;
      const nextDeltas = new Map(previousDeltas);
      const referencePageIndex =
        activePage > 0 && currentDocument.pages[activePage - 1]
          ? activePage - 1
          : targetPageIndexes[0];
      let scrollDelta = 0;

      for (const pageIndex of targetPageIndexes) {
        const currentPage = currentDocument.pages[pageIndex];
        if (!currentPage) continue;

        const previousDelta = previousDeltas.get(pageIndex) ?? 0;
        const nextDelta = normalizeRotation(previousDelta + direction);
        const basePageRotation =
          basePageRotations[pageIndex] ?? normalizeRotation(currentPage.rotation);
        const previousPageRotation = normalizeRotation(basePageRotation + previousDelta);
        const nextPageRotation = normalizeRotation(basePageRotation + nextDelta);
        const previousRotatedSize = getRotatedDimensions({
          height: currentPage.size.height * currentZoomLevel,
          rotation: previousPageRotation,
          width: currentPage.size.width * currentZoomLevel,
        });
        const nextRotatedSize = getRotatedDimensions({
          height: currentPage.size.height * currentZoomLevel,
          rotation: nextPageRotation,
          width: currentPage.size.width * currentZoomLevel,
        });
        const heightDelta = nextRotatedSize.height - previousRotatedSize.height;

        if (pageIndex < referencePageIndex) {
          scrollDelta += heightDelta;
        } else if (pageIndex === referencePageIndex) {
          scrollDelta += heightDelta / 2;
        }

        if (nextDelta) {
          nextDeltas.set(pageIndex, nextDelta);
        } else {
          nextDeltas.delete(pageIndex);
        }
      }

      const store = registry.getStore();
      const viewport = viewportElementRef.current;

      pageRotationDeltasRef.current = nextDeltas;
      flushSync(() => {
        setPageRotationDeltas(nextDeltas);
        store.dispatchToCore(refreshPages(documentId, targetPageIndexes));
      });

      if (viewport && scrollDelta !== 0) {
        viewport.scrollTop += scrollDelta;
      }
      (
        thumbnailPlugin as {
          calculateWindowState?: (documentId: string) => void;
        } | null
      )?.calculateWindowState?.(documentId);
    },
    [
      activePage,
      basePageRotations,
      currentZoomLevel,
      documentId,
      pdfDocument,
      registry,
      thumbnailPlugin,
    ],
  );

  const handleUpload = React.useCallback(
    (file: File) => {
      onUploadFile(file);
      onPdfUpload?.(file);
    },
    [onPdfUpload, onUploadFile],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        showToolbar &&
        !controlsDisabled &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpenRequest((count) => count + 1);
      }
    },
    [controlsDisabled, showToolbar],
  );

  const renderPage = React.useCallback(
    (page: PageLayout) => (
      <PDFViewerPageLayer
        basePageRotations={basePageRotations}
        currentZoomLevel={currentZoomLevel}
        documentId={documentId}
        page={page}
        pageClassName={pageClassName}
        pageRotationDeltas={pageRotationDeltas}
        pdfDocument={pdfDocument}
        renderPageOverlay={renderPageOverlay}
        onPagePointerDown={onPagePointerDown}
        onPagePointerMove={onPagePointerMove}
        onPagePointerUp={onPagePointerUp}
        onPagePointerCancel={onPagePointerCancel}
      />
    ),
    [
      basePageRotations,
      currentZoomLevel,
      documentId,
      onPagePointerCancel,
      onPagePointerDown,
      onPagePointerMove,
      onPagePointerUp,
      pageClassName,
      pageRotationDeltas,
      pdfDocument,
      renderPageOverlay,
    ],
  );

  return (
    <div
      data-slot='pdf-viewer'
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden bg-background outline-none',
        className,
      )}
    >
      {showToolbar ? (
        <PDFViewerToolbar
          activePage={activePage}
          controlsDisabled={controlsDisabled}
          currentZoomLevel={currentZoomLevel}
          downloadDisabled={downloadDisabled}
          isPreparingDownload={isPreparingDownload}
          numPages={numPages}
          searchControl={
            <PDFViewerSearchControl
              key={documentId}
              documentId={documentId}
              controlsDisabled={controlsDisabled}
              openRequest={searchOpenRequest}
            />
          }
          sidebarOpen={sidebarOpen}
          extraMenuItems={extraMenuItems}
          showDownload={showDownload}
          showRotateControls={showRotateControls}
          showUpload={showUpload}
          toolbarActions={toolbarActions}
          onDownload={handleDownload}
          onPageChange={scrollToPage}
          onRotate={rotateSelectedPages}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onUploadFile={handleUpload}
          onZoomChange={(zoomLevel) => zoom?.requestZoom(zoomLevel)}
          zoomLevel={zoomState.zoomLevel}
        />
      ) : null}
      <div
        ref={viewerShellRef}
        className='relative flex min-h-0 flex-1 overflow-hidden bg-muted/30'
      >
        {isLoading ? (
          <PDFViewerLoadingSkeleton sidebarInline={sidebarInline} sidebarOpen={sidebarOpen} />
        ) : null}
        <div className='flex h-full max-h-full min-h-0 w-full flex-1 overflow-hidden'>
          <DocumentViewerThumbnailSidebar
            closedInlineClassName={THUMBNAIL_SIDEBAR_CLOSED_CLASS}
            inline={sidebarInline}
            open={thumbnailSidebarVisible}
            widthClassName={THUMBNAIL_SIDEBAR_WIDTH_CLASS}
          >
            {thumbnailSidebarVisible ? (
              <PDFViewerThumbnails
                basePageRotations={basePageRotations}
                documentId={documentId}
                activePage={activePage}
                pageCount={numPages}
                pageRotationDeltas={pageRotationDeltas}
                pdfDocument={pdfDocument}
                selectedPageIndexes={selectedPageIndexes}
                onSelectPage={selectThumbnailPage}
              />
            ) : null}
          </DocumentViewerThumbnailSidebar>
          <PDFViewerScrollAreaViewport
            documentId={documentId}
            className='relative h-full max-h-full min-h-0 min-w-0 flex-1'
          >
            <PDFViewerViewportBridge viewportElementRef={viewportElementRef} />
            <PDFViewerSelectionCopyShortcut documentId={documentId} />
            <PDFViewerSelectionReleaseGuard documentId={documentId} />
            <GlobalPointerProvider documentId={documentId}>
              <PDFViewerScroller
                basePageRotations={basePageRotations}
                documentId={documentId}
                pageRotationDeltas={pageRotationDeltas}
                renderPage={renderPage}
              />
            </GlobalPointerProvider>
            <CopyToClipboard />
          </PDFViewerScrollAreaViewport>
        </div>
      </div>
    </div>
  );
}
