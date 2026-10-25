import * as React from 'react';
import type { Rect, Rotation } from '@embedpdf/models';
import {
  ScrollStrategy,
  useScrollPlugin,
  type PageLayout,
  type ScrollerLayout,
} from '@embedpdf/plugin-scroll/react';
import { useSelectionCapability, useSelectionPlugin } from '@embedpdf/plugin-selection/react';
import {
  useIsViewportGated,
  useViewportCapability,
  useViewportElement,
  useViewportRef,
  ViewportElementContext,
} from '@embedpdf/plugin-viewport/react';

import { PDFViewerScrollArea } from './thumbnails';
import {
  applyPageRotationDeltasToScrollerLayout,
  TEXT_SELECTION_BACKGROUND,
  type PageRotationDeltas,
} from './types';

export function PDFViewerScrollAreaViewport({
  children,
  className,
  documentId,
}: {
  children: React.ReactNode;
  className?: string;
  documentId: string;
}) {
  const viewportRef = useViewportRef(documentId);
  const { provides: viewport } = useViewportCapability();
  const isGated = useIsViewportGated(documentId);
  const viewportGap = viewport?.getViewportGap() ?? 0;

  return (
    <ViewportElementContext.Provider value={viewportRef}>
      <PDFViewerScrollArea
        className={className}
        viewportClassName='relative select-none selection:bg-transparent selection:text-inherit'
        viewportProps={{
          style: {
            padding: viewportGap,
          },
        }}
        viewportRef={viewportRef}
      >
        {isGated ? null : children}
      </PDFViewerScrollArea>
    </ViewportElementContext.Provider>
  );
}

export function PDFViewerViewportBridge({
  viewportElementRef,
}: {
  viewportElementRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const elementRef = useViewportElement();

  React.useEffect(() => {
    viewportElementRef.current = elementRef?.current ?? null;
  });

  return null;
}

export function PDFViewerTextSelectionLayer({
  documentId,
  pageIndex,
  scale,
}: {
  documentId: string;
  pageIndex: number;
  scale: number;
}) {
  const { plugin: selectionPlugin } = useSelectionPlugin();
  const [rects, setRects] = React.useState<Rect[]>([]);

  React.useEffect(() => {
    if (!selectionPlugin) return;

    return selectionPlugin.registerSelectionOnPage({
      documentId,
      pageIndex,
      onRectsChange: ({ rects: nextRects }) => {
        setRects(nextRects);
      },
    });
  }, [documentId, pageIndex, selectionPlugin]);

  if (!rects.length) return null;

  return (
    <>
      {rects.map((rect, index) => (
        <div
          key={`${index}-${rect.origin.x}-${rect.origin.y}`}
          className='pointer-events-none absolute'
          style={{
            background: TEXT_SELECTION_BACKGROUND,
            height: rect.size.height * scale,
            left: rect.origin.x * scale,
            top: rect.origin.y * scale,
            width: rect.size.width * scale,
          }}
        />
      ))}
    </>
  );
}

export function PDFViewerSelectionReleaseGuard({ documentId }: { documentId: string }) {
  const { plugin: selectionPlugin } = useSelectionPlugin();
  const { provides: selection } = useSelectionCapability();
  const lastSelectionModeIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!selection) return;

    return selection.forDocument(documentId).onBeginSelection(({ modeId }) => {
      lastSelectionModeIdRef.current = modeId;
    });
  }, [documentId, selection]);

  React.useEffect(() => {
    if (!selection) return;

    let cleanupFrame = 0;
    const finalizeIfStillSelecting = () => {
      window.cancelAnimationFrame(cleanupFrame);
      cleanupFrame = window.requestAnimationFrame(() => {
        const selectionState = selection.getState(documentId);

        if (!selectionState.selecting) return;

        if (selectionState.selection && selectionPlugin) {
          const pluginWithEndSelection = selectionPlugin as unknown as {
            endSelection?: (documentId: string, modeId: string) => void;
          };

          pluginWithEndSelection.endSelection?.(
            documentId,
            lastSelectionModeIdRef.current ?? 'pointerMode',
          );
          return;
        }

        if (!selectionState.selection) {
          selection.clear(documentId);
        }
      });
    };

    window.addEventListener('pointerup', finalizeIfStillSelecting);
    window.addEventListener('pointercancel', finalizeIfStillSelecting);
    window.addEventListener('blur', finalizeIfStillSelecting);

    return () => {
      window.cancelAnimationFrame(cleanupFrame);
      window.removeEventListener('pointerup', finalizeIfStillSelecting);
      window.removeEventListener('pointercancel', finalizeIfStillSelecting);
      window.removeEventListener('blur', finalizeIfStillSelecting);
    };
  }, [documentId, selection, selectionPlugin]);

  return null;
}

function isEditableCopyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

export function PDFViewerSelectionCopyShortcut({ documentId }: { documentId: string }) {
  const { provides: selection } = useSelectionCapability();

  React.useEffect(() => {
    if (!selection) return;

    const copySelectedPdfText = (event: Event) => {
      if (isEditableCopyTarget(event.target)) return;
      if (!selection.getState(documentId).selection) return;

      event.preventDefault();
      selection.copyToClipboard(documentId);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'c') return;
      if (!event.metaKey && !event.ctrlKey) return;

      copySelectedPdfText(event);
    };

    document.addEventListener('copy', copySelectedPdfText);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('copy', copySelectedPdfText);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [documentId, selection]);

  return null;
}

export function PDFViewerScroller({
  documentId,
  pageRotationDeltas,
  basePageRotations,
  renderPage,
}: {
  documentId: string;
  pageRotationDeltas: PageRotationDeltas;
  basePageRotations: Rotation[];
  renderPage: (props: PageLayout) => React.ReactNode;
}) {
  const { plugin: scrollPlugin } = useScrollPlugin();
  const [layoutData, setLayoutData] = React.useState<{
    docId: string | null;
    layout: ScrollerLayout | null;
  }>({ docId: null, layout: null });

  React.useEffect(() => {
    if (!scrollPlugin || !documentId) return;
    let frame = 0;

    const setCurrentLayout = () => {
      try {
        setLayoutData({
          docId: documentId,
          layout: scrollPlugin.getScrollerLayout(documentId),
        });
      } catch {
        setLayoutData({ docId: documentId, layout: null });
      }
    };

    const unsubscribe = scrollPlugin.onScrollerData(documentId, (layout) => {
      setLayoutData({ docId: documentId, layout });
    });

    frame = window.requestAnimationFrame(setCurrentLayout);

    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe();
      setLayoutData({ docId: null, layout: null });
      scrollPlugin.clearLayoutReady(documentId);
    };
  }, [documentId, scrollPlugin]);

  const scrollerLayout = React.useMemo(() => {
    if (layoutData.docId !== documentId || !layoutData.layout) return null;

    return applyPageRotationDeltasToScrollerLayout({
      basePageRotations,
      layout: layoutData.layout,
      pageRotationDeltas,
    });
  }, [basePageRotations, documentId, layoutData, pageRotationDeltas]);

  React.useLayoutEffect(() => {
    if (!scrollPlugin || !documentId || !scrollerLayout) return;
    scrollPlugin.setLayoutReady(documentId);
  }, [documentId, scrollPlugin, scrollerLayout]);

  if (!scrollerLayout) return null;

  return (
    <div
      style={{
        width: `${scrollerLayout.totalWidth}px`,
        height: `${scrollerLayout.totalHeight}px`,
        position: 'relative',
        boxSizing: 'border-box',
        margin: '0 auto',
        ...(scrollerLayout.strategy === ScrollStrategy.Horizontal && {
          display: 'flex',
          flexDirection: 'row',
        }),
      }}
    >
      <div
        style={
          scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                width: scrollerLayout.startSpacing,
                height: '100%',
                flexShrink: 0,
              }
            : {
                height: scrollerLayout.startSpacing,
                width: '100%',
              }
        }
      />
      <div
        style={{
          gap: scrollerLayout.pageGap,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          boxSizing: 'border-box',
          ...(scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                flexDirection: 'row',
                minHeight: '100%',
              }
            : {
                flexDirection: 'column',
                minWidth: 'fit-content',
              }),
        }}
      >
        {scrollerLayout.items.map((item) => (
          <div
            key={item.pageNumbers[0]}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: scrollerLayout.pageGap,
            }}
          >
            {item.pageLayouts.map((layout) => (
              <div
                key={layout.pageNumber}
                style={{
                  width: `${layout.rotatedWidth}px`,
                  height: `${layout.rotatedHeight}px`,
                  position: 'relative',
                  zIndex: layout.elevated ? 1 : undefined,
                }}
              >
                {renderPage(layout)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={
          scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                width: scrollerLayout.endSpacing,
                height: '100%',
                flexShrink: 0,
              }
            : {
                height: scrollerLayout.endSpacing,
                width: '100%',
              }
        }
      />
    </div>
  );
}
