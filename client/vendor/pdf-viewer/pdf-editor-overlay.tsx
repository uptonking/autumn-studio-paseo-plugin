"use client";

import * as React from "react";
import { GripVertical, X } from "lucide-react";
import { cn } from "../lib/utils";
import {
  PDF_EDITOR_COLOR_SWATCHES,
  PDF_EDITOR_FONT_SIZES,
  PdfEditorToolStrip,
  type PdfEditorToolStripProps,
} from "./pdf-editor-toolbar";
import type {
  PdfAnnotationItem,
  PdfEditState,
  PdfEditorTool,
} from "./pdf-save";

export {
  PDF_EDITOR_COLOR_SWATCHES,
  PDF_EDITOR_FONT_SIZES,
  PdfEditorToolStrip,
  type PdfEditorToolStripProps,
};

export interface DraftPointerAction {
  kind: "highlight" | "rect" | "ink";
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: Array<{ xRatio: number; yRatio: number }>;
}

interface DragAnnotationState {
  id: string;
  startClientX: number;
  startClientY: number;
  pageWidth: number;
  pageHeight: number;
  origXRatio: number;
  origYRatio: number;
  currentXRatio: number;
  currentYRatio: number;
}

export interface PdfEditorPageOverlayViewProps {
  pageNumber: number;
  tool: PdfEditorTool;
  activeColor: string;
  editState: PdfEditState;
  draftAction: DraftPointerAction | null;
  selectedAnnotationId: string | null;
  onSetDraftAction: React.Dispatch<
    React.SetStateAction<DraftPointerAction | null>
  >;
  onSelectAnnotation: (id: string | null) => void;
  onAddTextAnnotation: (
    pageNumber: number,
    xRatio: number,
    yRatio: number,
  ) => void;
  onUpdateTextAnnotation: (id: string, text: string) => void;
  onMoveAnnotation: (id: string, xRatio: number, yRatio: number) => void;
  onRemoveAnnotation: (id: string) => void;
  onCommitAnnotation: (annotation: PdfAnnotationItem) => void;
  onToggleDeleteActivePage: () => void;
}

export function PdfEditorPageOverlayView({
  pageNumber,
  tool,
  activeColor,
  editState,
  draftAction,
  selectedAnnotationId,
  onSetDraftAction,
  onSelectAnnotation,
  onAddTextAnnotation,
  onUpdateTextAnnotation,
  onMoveAnnotation,
  onRemoveAnnotation,
  onCommitAnnotation,
  onToggleDeleteActivePage,
}: PdfEditorPageOverlayViewProps) {
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = React.useState<DragAnnotationState | null>(
    null,
  );
  const pageAnnotations = editState.annotations.filter(
    (ann) => ann.pageNumber === pageNumber,
  );
  const isDeleted = editState.deletedPages.includes(pageNumber);
  const rotationDelta = editState.pageRotations[pageNumber] ?? 0;
  const isInteractiveTool = tool !== "select";

  const startAnnotationDrag = (
    event: React.PointerEvent<HTMLElement>,
    ann: { id: string; xRatio: number; yRatio: number },
  ) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectAnnotation(ann.id);
    setDragState({
      id: ann.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pageWidth: rect.width,
      pageHeight: rect.height,
      origXRatio: ann.xRatio,
      origYRatio: ann.yRatio,
      currentXRatio: ann.xRatio,
      currentYRatio: ann.yRatio,
    });
  };

  const updateAnnotationDrag = (event: React.PointerEvent<HTMLElement>) => {
    setDragState((prev) => {
      if (!prev) return null;
      const dx = (event.clientX - prev.startClientX) / prev.pageWidth;
      const dy = (event.clientY - prev.startClientY) / prev.pageHeight;
      return {
        ...prev,
        currentXRatio: Math.min(0.94, Math.max(0.01, prev.origXRatio + dx)),
        currentYRatio: Math.min(0.94, Math.max(0.01, prev.origYRatio + dy)),
      };
    });
  };

  const finishAnnotationDrag = () => {
    if (!dragState) return;
    const finished = dragState;
    setDragState(null);
    if (
      Math.abs(finished.currentXRatio - finished.origXRatio) > 0.002 ||
      Math.abs(finished.currentYRatio - finished.origYRatio) > 0.002
    ) {
      onMoveAnnotation(
        finished.id,
        finished.currentXRatio,
        finished.currentYRatio,
      );
    }
  };

  return (
    <div
      ref={overlayRef}
      data-testid={`pdf-editor-overlay-page-${pageNumber}`}
      className={cn(
        "absolute inset-0 z-10 select-none",
        isInteractiveTool
          ? "pointer-events-auto cursor-crosshair"
          : "pointer-events-none",
      )}
      onPointerDown={(event) => {
        if (!isInteractiveTool) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const xRatio = (event.clientX - rect.left) / rect.width;
        const yRatio = (event.clientY - rect.top) / rect.height;

        if (tool === "text") {
          event.stopPropagation();
          onAddTextAnnotation(pageNumber, xRatio, yRatio);
          return;
        }

        if (tool === "highlight" || tool === "rect" || tool === "ink") {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onSetDraftAction({
            kind: tool,
            pageNumber,
            startX: xRatio,
            startY: yRatio,
            currentX: xRatio,
            currentY: yRatio,
            points: [{ xRatio, yRatio }],
          });
        }
      }}
      onPointerMove={(event) => {
        if (!draftAction || draftAction.pageNumber !== pageNumber) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const xRatio = Math.min(
          1,
          Math.max(0, (event.clientX - rect.left) / rect.width),
        );
        const yRatio = Math.min(
          1,
          Math.max(0, (event.clientY - rect.top) / rect.height),
        );
        onSetDraftAction((prev) =>
          prev
            ? {
                ...prev,
                currentX: xRatio,
                currentY: yRatio,
                points:
                  prev.kind === "ink"
                    ? [...prev.points, { xRatio, yRatio }]
                    : prev.points,
              }
            : null,
        );
      }}
      onPointerUp={() => {
        if (!draftAction || draftAction.pageNumber !== pageNumber) return;
        const completed = draftAction;
        onSetDraftAction(null);
        const id = `pdf-ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        if (completed.kind === "highlight" || completed.kind === "rect") {
          const xRatio = Math.min(completed.startX, completed.currentX);
          const yRatio = Math.min(completed.startY, completed.currentY);
          const widthRatio = Math.max(
            0.06,
            Math.abs(completed.currentX - completed.startX),
          );
          const heightRatio = Math.max(
            0.025,
            Math.abs(completed.currentY - completed.startY),
          );
          onCommitAnnotation(
            completed.kind === "highlight"
              ? {
                  id,
                  kind: "highlight",
                  pageNumber,
                  xRatio,
                  yRatio,
                  widthRatio,
                  heightRatio,
                  color: activeColor,
                }
              : {
                  id,
                  kind: "rect",
                  pageNumber,
                  xRatio,
                  yRatio,
                  widthRatio,
                  heightRatio,
                  color: activeColor,
                  strokeWidth: 2,
                },
          );
        } else if (completed.kind === "ink" && completed.points.length >= 2) {
          onCommitAnnotation({
            id,
            kind: "ink",
            pageNumber,
            points: completed.points,
            color: activeColor,
            strokeWidth: 2.2,
          });
        }
      }}
    >
      {isDeleted ? (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-destructive/20 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-background/95 px-3 py-1.5 text-xs font-medium text-destructive shadow-md">
            <span>Page {pageNumber} marked for deletion</span>
            <button
              type="button"
              onClick={onToggleDeleteActivePage}
              className="rounded bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold hover:bg-destructive/20"
            >
              Restore
            </button>
          </div>
        </div>
      ) : null}

      {rotationDelta !== 0 ? (
        <div className="pointer-events-none absolute top-2 right-2 rounded bg-background/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground shadow-xs ring-1 ring-border">
          Rotated +{rotationDelta}°
        </div>
      ) : null}

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {pageAnnotations
          .filter((ann) => ann.kind === "ink")
          .map((ann) => (
            <polyline
              key={ann.id}
              fill="none"
              stroke={ann.color}
              strokeWidth={0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={ann.points
                .map((pt) => `${pt.xRatio * 100},${pt.yRatio * 100}`)
                .join(" ")}
            />
          ))}
        {draftAction &&
        draftAction.pageNumber === pageNumber &&
        draftAction.kind === "ink" ? (
          <polyline
            fill="none"
            stroke={activeColor}
            strokeWidth={0.45}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={draftAction.points
              .map((pt) => `${pt.xRatio * 100},${pt.yRatio * 100}`)
              .join(" ")}
          />
        ) : null}
      </svg>

      {pageAnnotations
        .filter((ann) => ann.kind === "highlight" || ann.kind === "rect")
        .map((ann) => {
          const isDragging = dragState?.id === ann.id;
          const xRatio = isDragging ? dragState.currentXRatio : ann.xRatio;
          const yRatio = isDragging ? dragState.currentYRatio : ann.yRatio;
          const isSelected = selectedAnnotationId === ann.id;
          const isRect = ann.kind === "rect";
          return (
            <div
              key={ann.id}
              data-testid={
                isRect ? `pdf-rect-${ann.id}` : `pdf-highlight-${ann.id}`
              }
              style={{
                left: `${xRatio * 100}%`,
                top: `${yRatio * 100}%`,
                width: `${ann.widthRatio * 100}%`,
                height: `${ann.heightRatio * 100}%`,
                backgroundColor: isRect ? `${ann.color}18` : ann.color,
                borderColor: isRect ? ann.color : undefined,
              }}
              onPointerDown={(e) => startAnnotationDrag(e, ann)}
              onPointerMove={updateAnnotationDrag}
              onPointerUp={finishAnnotationDrag}
              className={cn(
                "group pointer-events-auto absolute cursor-move rounded-xs",
                isRect ? "border-2" : "opacity-40 hover:opacity-55",
                isSelected && "ring-2 ring-primary",
              )}
            >
              <button
                type="button"
                title={isRect ? "Remove box" : "Remove highlight"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAnnotation(ann.id);
                }}
                className="absolute -top-2 -right-2 hidden size-4 items-center justify-center rounded-full bg-background text-foreground opacity-100 shadow-xs ring-1 ring-border group-hover:inline-flex"
              >
                <X className="size-2.5" />
              </button>
            </div>
          );
        })}

      {draftAction &&
      draftAction.pageNumber === pageNumber &&
      (draftAction.kind === "highlight" || draftAction.kind === "rect") ? (
        <div
          style={{
            left: `${Math.min(draftAction.startX, draftAction.currentX) * 100}%`,
            top: `${Math.min(draftAction.startY, draftAction.currentY) * 100}%`,
            width: `${Math.max(0.02, Math.abs(draftAction.currentX - draftAction.startX)) * 100}%`,
            height: `${Math.max(0.02, Math.abs(draftAction.currentY - draftAction.startY)) * 100}%`,
            backgroundColor:
              draftAction.kind === "rect" ? `${activeColor}18` : activeColor,
            borderColor: draftAction.kind === "rect" ? activeColor : undefined,
          }}
          className={cn(
            "pointer-events-none absolute rounded-xs",
            draftAction.kind === "rect" ? "border-2" : "opacity-35",
          )}
        />
      ) : null}

      {pageAnnotations
        .filter((ann) => ann.kind === "text")
        .map((ann) => {
          const isDragging = dragState?.id === ann.id;
          const xRatio = isDragging ? dragState.currentXRatio : ann.xRatio;
          const yRatio = isDragging ? dragState.currentYRatio : ann.yRatio;
          const isSelected = selectedAnnotationId === ann.id;
          return (
            <div
              key={ann.id}
              data-testid={`pdf-text-annotation-${ann.id}`}
              style={{
                left: `${xRatio * 100}%`,
                top: `${yRatio * 100}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
              }}
              className={cn(
                "pointer-events-auto absolute flex items-center gap-0.5 rounded bg-background/95 px-1 py-0.5 shadow-sm ring-1",
                isSelected ? "ring-primary" : "ring-border/80",
              )}
            >
              <button
                type="button"
                aria-label="Drag text annotation"
                title="Drag to move"
                onPointerDown={(e) => startAnnotationDrag(e, ann)}
                onPointerMove={updateAnnotationDrag}
                onPointerUp={finishAnnotationDrag}
                className="inline-flex size-4 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="size-3" />
              </button>
              <input
                type="text"
                aria-label="PDF text annotation"
                value={ann.text}
                onChange={(e) =>
                  onUpdateTextAnnotation(ann.id, e.target.value)
                }
                style={{
                  color: ann.color,
                  fontSize: `${Math.max(11, Math.min(24, ann.fontSize || 14))}px`,
                }}
                className="min-w-[80px] bg-transparent font-semibold outline-none"
              />
              <button
                type="button"
                aria-label="Delete text annotation"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAnnotation(ann.id);
                }}
                className="inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
    </div>
  );
}
