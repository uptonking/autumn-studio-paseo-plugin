'use client';

import * as React from 'react';
import { EditorSaveControls, SurfaceModeSwitcher } from '../../editing/surface-mode-controls';
import type { FileEditSession } from '../../editing/use-file-edit-session';
import type { FileSurfaceRole } from '../../viewers/provider-catalog';
import { cn } from '../lib/utils';
import { PDFViewer, type PDFViewerProps } from '../pdf-viewer';
import type { PDFViewerHandle } from './types';
import {
  type DraftPointerAction,
  PdfEditorPageOverlayView,
  PdfEditorToolStrip,
} from './pdf-editor-overlay';
import {
  EMPTY_PDF_EDIT_STATE,
  hasPdfEdits,
  type PdfAnnotationItem,
  type PdfEditState,
  type PdfEditorTool,
  preloadPdfLib,
  serializeEditedPdfBytes,
} from './pdf-save';
import {
  downloadBlob,
  downloadPdfWithPageRotations,
  type PDFViewerPageOverlayProps,
} from './types';

export interface PDFEditorProps extends PDFViewerProps {
  role?: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  viewerRef?: React.Ref<PDFViewerHandle>;
  /** Composed after editor annotations; used by the AI Text layout overlay. */
  extraPageOverlay?: (props: PDFViewerPageOverlayProps) => React.ReactNode;
}

export function PDFEditor({
  src,
  fileName,
  role = 'editor',
  canSwitchRole = true,
  onRoleChange,
  editSession,
  toolbarActions,
  className,
  viewerRef,
  extraPageOverlay,
  ...viewerProps
}: PDFEditorProps) {
  const [tool, setTool] = React.useState<PdfEditorTool>('select');
  const [activeColor, setActiveColor] = React.useState<string>('#F59E0B');
  const [activeFontSize, setActiveFontSize] = React.useState<number>(14);
  const [activePage, setActivePage] = React.useState<number>(1);
  const [numPages, setNumPages] = React.useState<number>(1);
  const [editState, setEditState] = React.useState<PdfEditState>(EMPTY_PDF_EDIT_STATE);
  const [history, setHistory] = React.useState<PdfEditState[]>([]);
  const [redoStack, setRedoStack] = React.useState<PdfEditState[]>([]);
  const [draftAction, setDraftAction] = React.useState<DraftPointerAction | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = React.useState<string | null>(null);

  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const editStateRef = React.useRef<PdfEditState>(editState);
  editStateRef.current = editState;
  const draftActionRef = React.useRef<DraftPointerAction | null>(draftAction);
  draftActionRef.current = draftAction;
  const historyRef = React.useRef<PdfEditState[]>(history);
  historyRef.current = history;
  const redoRef = React.useRef<PdfEditState[]>(redoStack);
  redoRef.current = redoStack;

  React.useEffect(() => {
    void preloadPdfLib().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    editStateRef.current = EMPTY_PDF_EDIT_STATE;
    historyRef.current = [];
    redoRef.current = [];
    setEditState(EMPTY_PDF_EDIT_STATE);
    setHistory([]);
    setRedoStack([]);
    setDraftAction(null);
    setSelectedAnnotationId(null);
  }, [src]);

  const reportPdfState = React.useCallback(
    (state: PdfEditState) => {
      if (src && editSession) {
        editSession.reportChange(async () => ({
          encoding: 'bytes',
          bytes: await serializeEditedPdfBytes(src, state),
          mimeType: 'application/pdf',
        }));
      }
    },
    [editSession, src],
  );

  const commitEditState = React.useCallback(
    (updater: (prev: PdfEditState) => PdfEditState) => {
      const prev = editStateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      editStateRef.current = next;
      const nextHistory = [...historyRef.current.slice(-24), prev];
      historyRef.current = nextHistory;
      redoRef.current = [];
      setEditState(next);
      setHistory(nextHistory);
      setRedoStack([]);
      reportPdfState(next);
    },
    [reportPdfState],
  );

  const handleUndo = React.useCallback(() => {
    const prevHistory = historyRef.current;
    if (prevHistory.length === 0) return;
    const nextHistory = prevHistory.slice(0, -1);
    const restored = prevHistory[prevHistory.length - 1];
    const current = editStateRef.current;
    const nextRedo = [...redoRef.current.slice(-24), current];
    editStateRef.current = restored;
    historyRef.current = nextHistory;
    redoRef.current = nextRedo;
    setEditState(restored);
    setHistory(nextHistory);
    setRedoStack(nextRedo);
    reportPdfState(restored);
  }, [reportPdfState]);

  const handleRedo = React.useCallback(() => {
    const prevRedo = redoRef.current;
    if (prevRedo.length === 0) return;
    const nextRedo = prevRedo.slice(0, -1);
    const restored = prevRedo[prevRedo.length - 1];
    const current = editStateRef.current;
    const nextHistory = [...historyRef.current.slice(-24), current];
    editStateRef.current = restored;
    historyRef.current = nextHistory;
    redoRef.current = nextRedo;
    setEditState(restored);
    setHistory(nextHistory);
    setRedoStack(nextRedo);
    reportPdfState(restored);
  }, [reportPdfState]);

  const handleSelectColor = React.useCallback(
    (color: string) => {
      setActiveColor(color);
      if (selectedAnnotationId) {
        commitEditState((prev) => ({
          ...prev,
          annotations: prev.annotations.map((ann) =>
            ann.id === selectedAnnotationId ? { ...ann, color } : ann,
          ),
        }));
      }
    },
    [commitEditState, selectedAnnotationId],
  );

  const handleSelectFontSize = React.useCallback(
    (fontSize: number) => {
      setActiveFontSize(fontSize);
      if (selectedAnnotationId) {
        commitEditState((prev) => ({
          ...prev,
          annotations: prev.annotations.map((ann) =>
            ann.id === selectedAnnotationId && ann.kind === 'text' ? { ...ann, fontSize } : ann,
          ),
        }));
      }
    },
    [commitEditState, selectedAnnotationId],
  );

  const rotateActivePage = React.useCallback(
    (deltaDegrees: number) => {
      commitEditState((prev) => {
        const current = prev.pageRotations[activePage] ?? 0;
        const nextAngle = (((current + deltaDegrees) % 360) + 360) % 360;
        const nextRotations = { ...prev.pageRotations };
        if (nextAngle === 0) {
          delete nextRotations[activePage];
        } else {
          nextRotations[activePage] = nextAngle;
        }
        return {
          ...prev,
          pageRotations: nextRotations,
        };
      });
    },
    [activePage, commitEditState],
  );

  const toggleDeleteActivePage = React.useCallback(() => {
    commitEditState((prev) => {
      const isDeleted = prev.deletedPages.includes(activePage);
      if (isDeleted) {
        return {
          ...prev,
          deletedPages: prev.deletedPages.filter((p) => p !== activePage),
        };
      }
      if (numPages - prev.deletedPages.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        deletedPages: [...prev.deletedPages, activePage],
      };
    });
  }, [activePage, commitEditState, numPages]);

  const addTextAnnotationAt = React.useCallback(
    (pageNumber: number, xRatio: number, yRatio: number) => {
      const id = `pdf-ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nextAnnotation: PdfAnnotationItem = {
        id,
        kind: 'text',
        pageNumber,
        xRatio: Math.min(0.85, Math.max(0.04, xRatio)),
        yRatio: Math.min(0.92, Math.max(0.04, yRatio)),
        text: 'Note',
        color: activeColor === '#F59E0B' ? '#2563EB' : activeColor,
        fontSize: activeFontSize,
      };
      commitEditState((prev) => ({
        ...prev,
        annotations: [...prev.annotations, nextAnnotation],
      }));
      setSelectedAnnotationId(id);
      setTool('select');
    },
    [activeColor, activeFontSize, commitEditState],
  );

  const updateTextAnnotation = React.useCallback(
    (id: string, text: string) => {
      commitEditState((prev) => ({
        ...prev,
        annotations: prev.annotations.map((ann) =>
          ann.id === id && ann.kind === 'text' ? { ...ann, text } : ann,
        ),
      }));
    },
    [commitEditState],
  );

  const moveAnnotation = React.useCallback(
    (id: string, xRatio: number, yRatio: number) => {
      commitEditState((prev) => ({
        ...prev,
        annotations: prev.annotations.map((ann) =>
          ann.id === id && ann.kind !== 'ink' ? { ...ann, xRatio, yRatio } : ann,
        ),
      }));
    },
    [commitEditState],
  );

  const removeAnnotation = React.useCallback(
    (id: string) => {
      commitEditState((prev) => ({
        ...prev,
        annotations: prev.annotations.filter((ann) => ann.id !== id),
      }));
      setSelectedAnnotationId((curr) => (curr === id ? null : curr));
    },
    [commitEditState],
  );

  const commitAnnotation = React.useCallback(
    (annotation: PdfAnnotationItem) => {
      commitEditState((prev) => ({
        ...prev,
        annotations: [...prev.annotations, annotation],
      }));
    },
    [commitEditState],
  );

  const flushActivePdfEditorInputs = React.useCallback(() => {
    if (typeof document !== 'undefined') {
      const root = editorRootRef.current;
      const active = document.activeElement;
      if (
        root &&
        active instanceof HTMLElement &&
        root.contains(active) &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
      ) {
        active.blur();
      }
    }
    const pendingDraft = draftActionRef.current;
    if (!pendingDraft) return;
    draftActionRef.current = null;
    setDraftAction(null);
    const id = `pdf-ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (pendingDraft.kind === 'highlight' || pendingDraft.kind === 'rect') {
      const xRatio = Math.min(pendingDraft.startX, pendingDraft.currentX);
      const yRatio = Math.min(pendingDraft.startY, pendingDraft.currentY);
      const widthRatio = Math.max(0.06, Math.abs(pendingDraft.currentX - pendingDraft.startX));
      const heightRatio = Math.max(0.025, Math.abs(pendingDraft.currentY - pendingDraft.startY));
      commitAnnotation(
        pendingDraft.kind === 'highlight'
          ? {
              id,
              kind: 'highlight',
              pageNumber: pendingDraft.pageNumber,
              xRatio,
              yRatio,
              widthRatio,
              heightRatio,
              color: activeColor,
            }
          : {
              id,
              kind: 'rect',
              pageNumber: pendingDraft.pageNumber,
              xRatio,
              yRatio,
              widthRatio,
              heightRatio,
              color: activeColor,
              strokeWidth: 2,
            },
      );
    } else if (pendingDraft.kind === 'ink' && pendingDraft.points.length >= 2) {
      commitAnnotation({
        id,
        kind: 'ink',
        pageNumber: pendingDraft.pageNumber,
        points: pendingDraft.points,
        color: activeColor,
        strokeWidth: 2.2,
      });
    }
  }, [activeColor, commitAnnotation]);

  React.useEffect(() => {
    if (!editSession) return undefined;
    return editSession.registerBeforeSaveFlush(flushActivePdfEditorInputs);
  }, [editSession, flushActivePdfEditorInputs]);

  const handleDownloadEditedPdf = React.useCallback(
    async (defaultFileName: string) => {
      if (viewerProps.onDownloadPdf) {
        flushActivePdfEditorInputs();
        await viewerProps.onDownloadPdf(defaultFileName);
        return;
      }
      if (!src) return;
      flushActivePdfEditorInputs();
      const currentState = editStateRef.current;
      if (!hasPdfEdits(currentState)) {
        await downloadPdfWithPageRotations({
          fileName: defaultFileName,
          pageRotationDeltas: new Map(),
          src,
        });
        return;
      }
      const editedBytes = await serializeEditedPdfBytes(src, currentState);
      const copy = new Uint8Array(editedBytes.byteLength);
      copy.set(editedBytes);
      downloadBlob(new Blob([copy], { type: 'application/pdf' }), defaultFileName);
    },
    [flushActivePdfEditorInputs, src, viewerProps],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        if (editSession) {
          event.preventDefault();
          void editSession.saveNow();
        }
        return;
      }

      if (!isTextInput && (event.metaKey || event.ctrlKey)) {
        const key = event.key.toLowerCase();
        if (key === 'z' && event.shiftKey) {
          event.preventDefault();
          handleRedo();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          handleRedo();
          return;
        }
        if (key === 'z') {
          event.preventDefault();
          handleUndo();
          return;
        }
      }

      if (
        !isTextInput &&
        (event.key === 'Backspace' || event.key === 'Delete') &&
        selectedAnnotationId
      ) {
        event.preventDefault();
        removeAnnotation(selectedAnnotationId);
        return;
      }

      if (event.key === 'Escape') {
        setTool('select');
        setSelectedAnnotationId(null);
      }
    },
    [editSession, handleRedo, handleUndo, removeAnnotation, selectedAnnotationId],
  );

  const renderPageOverlay = React.useCallback(
    (props: PDFViewerPageOverlayProps) => (
      <>
        <PdfEditorPageOverlayView
          pageNumber={props.pageNumber}
          tool={tool}
          activeColor={activeColor}
          editState={editState}
          draftAction={draftAction}
          selectedAnnotationId={selectedAnnotationId}
          onSetDraftAction={setDraftAction}
          onSelectAnnotation={setSelectedAnnotationId}
          onAddTextAnnotation={addTextAnnotationAt}
          onUpdateTextAnnotation={updateTextAnnotation}
          onMoveAnnotation={moveAnnotation}
          onRemoveAnnotation={removeAnnotation}
          onCommitAnnotation={commitAnnotation}
          onToggleDeleteActivePage={toggleDeleteActivePage}
        />
        {extraPageOverlay?.(props)}
      </>
    ),
    [
      activeColor,
      addTextAnnotationAt,
      commitAnnotation,
      draftAction,
      editState,
      extraPageOverlay,
      moveAnnotation,
      removeAnnotation,
      selectedAnnotationId,
      toggleDeleteActivePage,
      tool,
      updateTextAnnotation,
    ],
  );

  const isActivePageDeleted = editState.deletedPages.includes(activePage);
  const canDeletePage = isActivePageDeleted || numPages - editState.deletedPages.length > 1;

  const combinedToolbarActions = (
    <div className='flex items-center gap-1.5'>
      {editSession ? <EditorSaveControls editSession={editSession} /> : null}
      {onRoleChange ? (
        <SurfaceModeSwitcher role={role} canEdit={canSwitchRole} onRoleChange={onRoleChange} />
      ) : null}
      {toolbarActions}
    </div>
  );

  return (
    <div
      ref={editorRootRef}
      data-testid='embedpdf-editor'
      data-surface-role={role}
      onKeyDown={handleKeyDown}
      className={cn('flex h-full min-h-0 w-full flex-col overflow-hidden bg-background', className)}
    >
      <PdfEditorToolStrip
        tool={tool}
        activeColor={activeColor}
        activeFontSize={activeFontSize}
        isActivePageDeleted={isActivePageDeleted}
        canDeletePage={canDeletePage}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        annotationCount={editState.annotations.length}
        onSelectTool={setTool}
        onSelectColor={handleSelectColor}
        onSelectFontSize={handleSelectFontSize}
        onRotatePage={rotateActivePage}
        onToggleDeletePage={toggleDeleteActivePage}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className='min-h-0 flex-1 overflow-hidden'>
        <PDFViewer
          {...viewerProps}
          ref={viewerRef}
          src={src}
          fileName={fileName}
          showRotateControls={false}
          toolbarActions={combinedToolbarActions}
          renderPageOverlay={renderPageOverlay}
          onDownloadPdf={handleDownloadEditedPdf}
          onActivePageChange={(page) => {
            setActivePage(page);
            viewerProps.onActivePageChange?.(page);
          }}
          onDocumentLoadSuccess={(pages) => {
            setNumPages(pages);
            viewerProps.onDocumentLoadSuccess?.(pages);
          }}
          className='h-full min-h-0'
        />
      </div>
    </div>
  );
}
