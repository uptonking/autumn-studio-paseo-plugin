'use client';

import * as React from 'react';
import {
  useXlsxViewerController,
  XlsxViewer,
  XlsxViewerProvider,
  type XlsxScrollerRenderProps,
} from '@extend-ai/react-xlsx';
import { Loader2 } from 'lucide-react';
import { DEFAULT_XLSX_SETTINGS, toXlsxViewerZoom } from '../../../shared/settings';
import type { FileEditSession } from '../../editing/use-file-edit-session';
import type { FileSurfaceRole } from '../../viewers/provider-catalog';
import { ScrollArea } from '../components/ui/scroll-area';
import type { FileSystemXlsxSettings } from '../file-system/types';
import { cn } from '../lib/utils';
import { ensureXlsxWasmReady, fetchWorkbookArrayBuffer } from './wasm-loader';
import { XlsxFormulaBar } from './xlsx-formula-bar';
import { WorkbookTableHeaderMenu } from './xlsx-search-popover';
import { XlsxSheetTabs } from './xlsx-sheet-tabs';
import { XlsxToolbar } from './xlsx-toolbar';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ResolvedXlsxRuntimeSettings {
  defaultZoom: number;
  showFormulaBar: boolean;
  showHiddenSheets: boolean;
  showDownloadButton: boolean;
}

export interface ExtendXlsxSurfaceProps {
  src?: string;
  fileName?: string;
  role: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  xlsxSettings?: FileSystemXlsxSettings;
  showToolbar?: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

export function ExtendXlsxSurface({
  src,
  fileName = 'Workbook.xlsx',
  role,
  canSwitchRole = true,
  onRoleChange,
  onPreloadRole,
  editSession,
  xlsxSettings,
  showToolbar = true,
  extraMenuItems,
  toolbarActions,
  className,
}: ExtendXlsxSurfaceProps) {
  const resolvedSettings: ResolvedXlsxRuntimeSettings = React.useMemo(
    () => ({
      defaultZoom:
        typeof xlsxSettings?.defaultZoom === 'number'
          ? xlsxSettings.defaultZoom
          : toXlsxViewerZoom(DEFAULT_XLSX_SETTINGS.defaultZoom),
      showFormulaBar: xlsxSettings?.showFormulaBar ?? DEFAULT_XLSX_SETTINGS.showFormulaBar,
      showHiddenSheets: xlsxSettings?.showHiddenSheets ?? DEFAULT_XLSX_SETTINGS.showHiddenSheets,
      showDownloadButton:
        xlsxSettings?.showDownloadButton ?? DEFAULT_XLSX_SETTINGS.showDownloadButton,
    }),
    [xlsxSettings],
  );

  const [workbookBuffer, setWorkbookBuffer] = React.useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isPreparing, setIsPreparing] = React.useState<boolean>(Boolean(src));

  React.useEffect(() => {
    if (!src) {
      setWorkbookBuffer(null);
      setLoadError(null);
      setIsPreparing(false);
      return;
    }

    let cancelled = false;
    setIsPreparing(true);
    setLoadError(null);

    void Promise.all([ensureXlsxWasmReady(), fetchWorkbookArrayBuffer(src)])
      .then(([, buffer]) => {
        if (cancelled) {
          return;
        }
        setWorkbookBuffer(buffer);
        setIsPreparing(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Failed to load Excel file');
        setIsPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loadError) {
    return (
      <div
        data-testid='xlsx-surface-error'
        className={cn(
          'grid h-full min-h-0 w-full place-items-center bg-background p-6 text-sm text-destructive',
          className,
        )}
      >
        <div className='max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center'>
          <p className='font-medium'>Unable to open Excel workbook</p>
          <p className='mt-1 text-xs text-muted-foreground'>{loadError}</p>
        </div>
      </div>
    );
  }

  if (isPreparing || !workbookBuffer) {
    return (
      <div
        data-testid='xlsx-surface-loading'
        className={cn(
          'grid h-full min-h-0 w-full place-items-center bg-background p-6 text-xs text-muted-foreground',
          className,
        )}
      >
        <div className='inline-flex items-center gap-2'>
          <Loader2 className='size-4 animate-spin' />
          <span>Loading Excel workbook…</span>
        </div>
      </div>
    );
  }

  return (
    <LoadedWorkbookSurface
      workbookBuffer={workbookBuffer}
      fileName={fileName}
      role={role}
      canSwitchRole={canSwitchRole}
      onRoleChange={onRoleChange}
      onPreloadRole={onPreloadRole}
      editSession={editSession}
      settings={resolvedSettings}
      showToolbar={showToolbar}
      extraMenuItems={extraMenuItems}
      toolbarActions={toolbarActions}
      className={className}
    />
  );
}

interface LoadedWorkbookSurfaceProps {
  workbookBuffer: ArrayBuffer;
  fileName: string;
  role: FileSurfaceRole;
  canSwitchRole: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  settings: ResolvedXlsxRuntimeSettings;
  showToolbar: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

function LoadedWorkbookSurface({
  workbookBuffer,
  fileName,
  role,
  canSwitchRole,
  onRoleChange,
  onPreloadRole,
  editSession,
  settings,
  showToolbar,
  extraMenuItems,
  toolbarActions,
  className,
}: LoadedWorkbookSurfaceProps) {
  const isReadOnly = role !== 'editor';
  const targetDefaultZoom = settings.defaultZoom;
  const surfaceRootRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [searchOpenRequest, setSearchOpenRequest] = React.useState(0);

  const renderSearchableScroller = React.useCallback(
    ({ children, viewportProps }: XlsxScrollerRenderProps) => (
      <ScrollArea
        className='h-full min-h-0 w-full min-w-0 flex-1'
        viewportProps={viewportProps}
        viewportRef={viewportRef}
      >
        {children}
      </ScrollArea>
    ),
    [],
  );

  const controllerOptions = React.useMemo(
    () => ({
      allowResizeInReadOnly: true,
      file: workbookBuffer,
      fileName,
      readOnly: isReadOnly,
      showHiddenSheets: settings.showHiddenSheets,
      useWorker: false,
    }),
    [fileName, isReadOnly, settings.showHiddenSheets, workbookBuffer],
  );

  const controller = useXlsxViewerController(controllerOptions);
  const { error, isLoading, revision, setZoomScale, workbook } = controller;

  const initialRevisionRef = React.useRef<number | null>(null);
  const lastReportedRevisionRef = React.useRef<number | null>(null);
  const appliedZoomRef = React.useRef<number | null>(null);

  const reportWorkbookChange = React.useCallback(() => {
    if (role !== 'editor' || !editSession || !controller.workbook) {
      return;
    }
    editSession.reportChange(() => {
      const currentWorkbook = controller.workbook;
      if (!currentWorkbook) {
        throw new Error('Workbook is not available for saving');
      }
      return {
        encoding: 'bytes',
        bytes: currentWorkbook.saveXlsxBytes(),
        mimeType: XLSX_MIME_TYPE,
      };
    });
  }, [controller, editSession, role]);

  // Wrap mutating controller actions so edits are reported synchronously even
  // if the surface unmounts on the same interaction (e.g. clicking Go Back while
  // a cell <input> blurs and commits).
  const trackedController = React.useMemo(() => {
    const wrapSync = <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => {
      return (...args: TArgs): TResult => {
        const result = fn(...args);
        reportWorkbookChange();
        return result;
      };
    };

    return {
      ...controller,
      setCellValue: wrapSync(controller.setCellValue),
      setCellFormula: wrapSync(controller.setCellFormula),
      setCellStyle: wrapSync(controller.setCellStyle),
      setRangeStyle: wrapSync(controller.setRangeStyle),
      setSelectedCellStyle: wrapSync(controller.setSelectedCellStyle),
      clearSelectedCells: wrapSync(controller.clearSelectedCells),
      fillSelection: wrapSync(controller.fillSelection),
      mergeSelection: wrapSync(controller.mergeSelection),
      unmergeSelection: wrapSync(controller.unmergeSelection),
      addSheet: wrapSync(controller.addSheet),
      removeActiveSheet: wrapSync(controller.removeActiveSheet),
      sortTable: wrapSync(controller.sortTable),
      pasteText: wrapSync(controller.pasteText),
      undo: wrapSync(controller.undo),
      redo: wrapSync(controller.redo),
      resizeColumn: wrapSync(controller.resizeColumn),
      resizeRow: wrapSync(controller.resizeRow),
      pasteFromClipboard: async () => {
        const pasted = await controller.pasteFromClipboard();
        if (pasted) {
          reportWorkbookChange();
        }
        return pasted;
      },
    };
  }, [controller, reportWorkbookChange]);

  const commitFocusedWorkbookInput = React.useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = surfaceRootRef.current;
    const active = document.activeElement;
    if (
      root &&
      active instanceof HTMLElement &&
      root.contains(active) &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    ) {
      active.blur();
    }
  }, []);

  React.useEffect(() => {
    if (role !== 'editor') {
      return undefined;
    }
    const unregister = editSession?.registerBeforeSaveFlush(commitFocusedWorkbookInput);
    return () => {
      unregister?.();
      commitFocusedWorkbookInput();
    };
  }, [commitFocusedWorkbookInput, editSession, role]);

  // Reset revision baseline when a new workbook buffer loads
  React.useEffect(() => {
    initialRevisionRef.current = null;
    lastReportedRevisionRef.current = null;
    appliedZoomRef.current = null;
  }, [workbookBuffer]);

  // Apply configured default zoom level when workbook is ready or setting changes
  React.useEffect(() => {
    if (!workbook || isLoading) {
      return;
    }
    if (appliedZoomRef.current !== targetDefaultZoom) {
      appliedZoomRef.current = targetDefaultZoom;
      setZoomScale(targetDefaultZoom);
    }
  }, [isLoading, setZoomScale, targetDefaultZoom, workbook]);

  // Report workbook mutations to FileEditSession so edits auto-save to the file system
  React.useEffect(() => {
    if (!workbook || isLoading) {
      return;
    }
    if (initialRevisionRef.current === null) {
      initialRevisionRef.current = revision;
      lastReportedRevisionRef.current = revision;
      return;
    }
    if (role !== 'editor' || !editSession || revision === lastReportedRevisionRef.current) {
      return;
    }
    lastReportedRevisionRef.current = revision;
    reportWorkbookChange();
  }, [editSession, isLoading, reportWorkbookChange, revision, role, workbook]);

  // Support Cmd/Ctrl+S and Cmd/Ctrl+F keyboard shortcuts
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (role === 'editor' && editSession && !event.shiftKey && key === 's') {
          event.preventDefault();
          commitFocusedWorkbookInput();
          void editSession.saveNow();
          return;
        }
        if (showToolbar && !event.shiftKey && key === 'f') {
          event.preventDefault();
          event.stopPropagation();
          setSearchOpenRequest((count) => count + 1);
        }
      }
    },
    [commitFocusedWorkbookInput, editSession, role, showToolbar],
  );

  return (
    <XlsxViewerProvider controller={trackedController}>
      <div
        ref={surfaceRootRef}
        tabIndex={-1}
        data-testid={role === 'editor' ? 'extend-xlsx-editor' : 'extend-xlsx-viewer'}
        data-surface-role={role}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground outline-none',
          className,
        )}
      >
        {showToolbar ? (
          <XlsxToolbar
            role={role}
            canSwitchRole={canSwitchRole}
            onRoleChange={onRoleChange}
            onPreloadRole={onPreloadRole}
            editSession={editSession}
            showDownloadButton={settings.showDownloadButton}
            searchOpenRequest={searchOpenRequest}
            viewportRef={viewportRef}
            extraMenuItems={extraMenuItems}
            toolbarActions={toolbarActions}
          />
        ) : null}

        {showToolbar && settings.showFormulaBar ? <XlsxFormulaBar readOnly={isReadOnly} /> : null}

        <div className='min-h-0 flex-1 overflow-hidden bg-muted/15'>
          <XlsxViewer
            allowResizeInReadOnly
            className='h-full min-h-0 min-w-0'
            height='100%'
            readOnly={isReadOnly}
            renderScroller={renderSearchableScroller}
            renderTableHeaderMenu={WorkbookTableHeaderMenu}
            rounded={false}
            showDefaultToolbar={false}
            showImages
            errorState={
              <div className='grid h-full w-full place-items-center p-6 text-sm text-destructive'>
                {error?.message ?? 'Unable to render Excel workbook.'}
              </div>
            }
          />
        </div>

        <XlsxSheetTabs readOnly={isReadOnly} />
      </div>
    </XlsxViewerProvider>
  );
}

export function ExtendXlsxViewer(props: Omit<ExtendXlsxSurfaceProps, 'role'>) {
  return <ExtendXlsxSurface {...props} role='viewer' />;
}

export function ExtendXlsxEditor(props: Omit<ExtendXlsxSurfaceProps, 'role'>) {
  return <ExtendXlsxSurface {...props} role='editor' />;
}
