"use client";

import * as React from "react";
import {
  useXlsxViewer,
  useXlsxViewerEditing,
  useXlsxViewerThumbnails,
} from "@extend-ai/react-xlsx";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

const XLSX_SHEET_TAB_THUMBNAIL_OPTIONS = {
  includeHeaders: true,
  resolution: {
    maxHeight: 280,
    maxWidth: 440,
  },
} as const;

const PREVIEW_WIDTH = 220;
const PREVIEW_OPEN_DELAY_MS = 400;

export interface XlsxSheetTabsProps {
  readOnly: boolean;
}

export function XlsxSheetTabs({ readOnly }: XlsxSheetTabsProps) {
  const { activeSheet, activeSheetIndex, revision, setActiveSheetIndex, sheets } =
    useXlsxViewer();
  const { addSheet, removeActiveSheet } = useXlsxViewerEditing();
  const { thumbnails } = useXlsxViewerThumbnails(
    XLSX_SHEET_TAB_THUMBNAIL_OPTIONS,
  );
  const [thumbnailCache, setThumbnailCache] = React.useState<{
    revision: number;
    urls: Record<number, string>;
  }>(() => ({ revision, urls: {} }));
  const [visiblePreviewIndex, setVisiblePreviewIndex] = React.useState<
    number | null
  >(null);
  const [previewLeft, setPreviewLeft] = React.useState(8);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Record<number, HTMLButtonElement | null>>({});
  const openTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearOpenTimeout = React.useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearOpenTimeout();
      clearCloseTimeout();
    };
  }, [clearCloseTimeout, clearOpenTimeout]);

  // Paint a sheet thumbnail lazily only when its preview is open for the current revision,
  // and discard stale revision entries so cell edits never accumulate unbounded data URLs.
  React.useEffect(() => {
    if (
      typeof document === "undefined" ||
      sheets.length <= 1 ||
      visiblePreviewIndex === null
    ) {
      return;
    }
    const thumbnail = thumbnails.find(
      (entry) => entry.sheetIndex === visiblePreviewIndex,
    );
    if (!thumbnail) return;

    setThumbnailCache((current) => {
      const baseUrls = current.revision === revision ? current.urls : {};
      if (baseUrls[visiblePreviewIndex]) {
        return current.revision === revision
          ? current
          : { revision, urls: baseUrls };
      }
      const canvas = document.createElement("canvas");
      canvas.width = thumbnail.width;
      canvas.height = thumbnail.height;
      try {
        if (!thumbnail.paint(canvas)) {
          return current.revision === revision
            ? current
            : { revision, urls: baseUrls };
        }
        const dataUrl = canvas.toDataURL("image/png");
        if (!dataUrl || !dataUrl.startsWith("data:image/")) {
          return current.revision === revision
            ? current
            : { revision, urls: baseUrls };
        }
        return {
          revision,
          urls: {
            ...baseUrls,
            [visiblePreviewIndex]: dataUrl,
          },
        };
      } catch {
        return current.revision === revision
          ? current
          : { revision, urls: baseUrls };
      }
    });
  }, [revision, sheets.length, thumbnails, visiblePreviewIndex]);

  const computePreviewLeft = React.useCallback((sheetIndex: number) => {
    const item = itemRefs.current[sheetIndex];
    const container = containerRef.current;
    if (!item || !container) return 8;
    const itemRect = item.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const centered =
      itemRect.left - containerRect.left + itemRect.width / 2 - PREVIEW_WIDTH / 2;
    const maxLeft = Math.max(8, containerRect.width - PREVIEW_WIDTH - 8);
    return Math.max(8, Math.min(centered, maxLeft));
  }, []);

  const handleTabEnter = React.useCallback(
    (sheetIndex: number) => {
      if (sheets.length <= 1) return;
      clearCloseTimeout();
      const nextLeft = computePreviewLeft(sheetIndex);
      if (visiblePreviewIndex !== null) {
        clearOpenTimeout();
        setPreviewLeft(nextLeft);
        setVisiblePreviewIndex(sheetIndex);
        return;
      }
      clearOpenTimeout();
      openTimeoutRef.current = setTimeout(() => {
        setPreviewLeft(computePreviewLeft(sheetIndex));
        setVisiblePreviewIndex(sheetIndex);
      }, PREVIEW_OPEN_DELAY_MS);
    },
    [
      clearCloseTimeout,
      clearOpenTimeout,
      computePreviewLeft,
      sheets.length,
      visiblePreviewIndex,
    ],
  );

  const handleContainerLeave = React.useCallback(() => {
    clearOpenTimeout();
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setVisiblePreviewIndex(null);
    }, 80);
  }, [clearCloseTimeout, clearOpenTimeout]);

  if (!sheets.length) {
    return null;
  }

  const previewSheet =
    visiblePreviewIndex === null ? null : sheets[visiblePreviewIndex];
  const previewUrl =
    visiblePreviewIndex === null || thumbnailCache.revision !== revision
      ? null
      : (thumbnailCache.urls[visiblePreviewIndex] ?? null);

  return (
    <div
      ref={containerRef}
      data-testid="xlsx-sheet-tabs"
      onMouseLeave={handleContainerLeave}
      className="relative flex h-8 shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-2 text-xs select-none"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
        {sheets.map((sheet, index) => {
          const isActive = index === activeSheetIndex;
          return (
            <button
              key={`${sheet.workbookSheetIndex}-${sheet.name}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              data-testid={`xlsx-sheet-tab-${index}`}
              data-active={isActive ? "true" : "false"}
              onClick={() => setActiveSheetIndex(index)}
              onMouseEnter={() => handleTabEnter(index)}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <span className="max-w-[140px] truncate">{sheet.name}</span>
              {sheet.visibility !== "visible" ? (
                <span className="rounded bg-muted px-1 py-0.2 text-[9px] tracking-wider text-muted-foreground uppercase">
                  hidden
                </span>
              ) : null}
            </button>
          );
        })}

        {!readOnly ? (
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              data-testid="xlsx-add-sheet-button"
              title="Add sheet"
              aria-label="Add sheet"
              onClick={() => addSheet()}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
            {sheets.length > 1 ? (
              <button
                type="button"
                data-testid="xlsx-remove-sheet-button"
                title="Remove active sheet"
                aria-label="Remove active sheet"
                onClick={() => removeActiveSheet()}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeSheet ? (
        <div className="hidden shrink-0 items-center gap-2 text-[11px] text-muted-foreground sm:flex">
          <span>
            {activeSheet.rowCount.toLocaleString()} rows ×{" "}
            {activeSheet.colCount.toLocaleString()} cols
          </span>
        </div>
      ) : null}

      {previewSheet && visiblePreviewIndex !== null && previewUrl ? (
        <div
          data-testid="xlsx-sheet-tab-preview"
          style={{ left: previewLeft, width: PREVIEW_WIDTH }}
          className="pointer-events-none absolute bottom-full z-40 mb-2 overflow-hidden rounded-lg border bg-background/95 shadow-xl backdrop-blur-md"
        >
          <div className="relative aspect-[11/7] w-full overflow-hidden bg-muted/60">
            <img
              key={`${visiblePreviewIndex}-${previewUrl}`}
              src={previewUrl}
              alt={`${previewSheet.name} preview`}
              className="absolute inset-0 h-full w-full object-cover object-left-top"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
