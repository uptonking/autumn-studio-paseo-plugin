'use client';

import * as React from 'react';
import { BegoniaBrowserEditor, type BrowserEditorController } from '@datalking/begonia-react/v1';
import { Loader2 } from 'lucide-react';
import { DEFAULT_DOCX_SETTINGS, type DocxFlowMode } from '../../../shared/settings';
import type { FileEditSession } from '../../editing/use-file-edit-session';
import type { FileSurfaceRole } from '../../viewers/provider-catalog';
import { Button } from '../components/ui/button';
import type { FileSystemDocxSettings } from '../file-system/types';
import { cn } from '../lib/utils';
import { BEGONIA_EDITOR_THEME } from './begonia-theme';
import {
  DOCX_MIME_TYPE,
  fetchDocxArrayBuffer,
  parseDocxDocument,
  replaceEditorDocument,
  saveDocxFromEditor,
} from './docx-io';
import { DocxToolbar } from './docx-toolbar';

interface ResolvedDocxRuntimeSettings {
  defaultFlowMode: DocxFlowMode;
  showDownloadButton: boolean;
}

function resolveDocxRuntimeSettings(
  docxSettings: FileSystemDocxSettings | undefined,
): ResolvedDocxRuntimeSettings {
  return {
    defaultFlowMode: docxSettings?.defaultFlowMode ?? DEFAULT_DOCX_SETTINGS.defaultFlowMode,
    showDownloadButton:
      docxSettings?.showDownloadButton ?? DEFAULT_DOCX_SETTINGS.showDownloadButton,
  };
}

export interface BegoniaDocxSurfaceProps {
  src?: string;
  fileName?: string;
  role: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  docxSettings?: FileSystemDocxSettings;
  showToolbar?: boolean;
  /** Opens the host settings page at the Docx/Doc format section. */
  onOpenEditorSettings?: () => void;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

export function BegoniaDocxSurface({
  src,
  fileName = 'Document.docx',
  role,
  canSwitchRole = true,
  onRoleChange,
  onPreloadRole,
  editSession,
  docxSettings,
  showToolbar = true,
  onOpenEditorSettings,
  extraMenuItems,
  toolbarActions,
  className,
}: BegoniaDocxSurfaceProps) {
  const settings = React.useMemo(() => resolveDocxRuntimeSettings(docxSettings), [docxSettings]);

  const [docxBuffer, setDocxBuffer] = React.useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isPreparing, setIsPreparing] = React.useState<boolean>(Boolean(src));
  const [reloadNonce, setReloadNonce] = React.useState(0);

  React.useEffect(() => {
    if (!src) {
      setDocxBuffer(null);
      setLoadError(null);
      setIsPreparing(false);
      return;
    }

    const abort = new AbortController();
    setIsPreparing(true);
    setLoadError(null);

    fetchDocxArrayBuffer(src, abort.signal)
      .then((buffer) => {
        setDocxBuffer(buffer);
        setIsPreparing(false);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Failed to load Word document');
        setIsPreparing(false);
      });

    return () => {
      abort.abort();
    };
  }, [src, reloadNonce]);

  if (loadError) {
    return (
      <DocxSurfaceError
        message={loadError}
        fileName={fileName}
        src={src}
        onRetry={() => setReloadNonce((nonce) => nonce + 1)}
        className={className}
      />
    );
  }

  if (!src) {
    return (
      <div
        data-testid='docx-surface-empty'
        className={cn(
          'grid h-full min-h-0 w-full place-items-center bg-background p-6 text-xs text-muted-foreground',
          className,
        )}
      >
        No Word document is open.
      </div>
    );
  }

  if (isPreparing || !docxBuffer) {
    return (
      <div
        data-testid='docx-surface-loading'
        className={cn(
          'grid h-full min-h-0 w-full place-items-center bg-background p-6 text-xs text-muted-foreground',
          className,
        )}
      >
        <div className='inline-flex items-center gap-2'>
          <Loader2 className='size-4 animate-spin' />
          <span>Loading Word document…</span>
        </div>
      </div>
    );
  }

  return (
    <LoadedDocxSurface
      docxBuffer={docxBuffer}
      fileName={fileName}
      src={src}
      role={role}
      canSwitchRole={canSwitchRole}
      onRoleChange={onRoleChange}
      onPreloadRole={onPreloadRole}
      editSession={editSession}
      settings={settings}
      showToolbar={showToolbar}
      onOpenEditorSettings={onOpenEditorSettings}
      extraMenuItems={extraMenuItems}
      toolbarActions={toolbarActions}
      className={className}
    />
  );
}

const DOCX_PARTICIPANT = {
  id: 'autumn-studio',
  name: 'Autumn Studio',
  color: '#0d9488',
} as const;

interface LoadedDocxSurfaceProps {
  docxBuffer: ArrayBuffer;
  src?: string;
  fileName: string;
  role: FileSurfaceRole;
  canSwitchRole: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  settings: ResolvedDocxRuntimeSettings;
  showToolbar: boolean;
  onOpenEditorSettings?: () => void;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

function LoadedDocxSurface({
  docxBuffer,
  fileName,
  src,
  role,
  canSwitchRole,
  onRoleChange,
  onPreloadRole,
  editSession,
  settings,
  showToolbar,
  onOpenEditorSettings,
  extraMenuItems,
  toolbarActions,
  className,
}: LoadedDocxSurfaceProps) {
  const [controller, setController] = React.useState<BrowserEditorController | null>(null);
  const [flowMode, setFlowMode] = React.useState<DocxFlowMode>(settings.defaultFlowMode);
  const [isImporting, setIsImporting] = React.useState(true);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  // Viewer mode's paginated preview fills the pane, so its virtualization
  // height tracks the measured scroll host.
  const scrollHostRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHeight, setPreviewHeight] = React.useState(480);
  React.useEffect(() => {
    const element = scrollHostRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const height = Math.round(entries[0]?.contentRect.height ?? element.clientHeight);
      if (height > 0) {
        setPreviewHeight((prev) => (prev === height ? prev : height));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Settings can resolve after the surface mounts (host settings load
  // asynchronously); only a flow mode the user actually picked may override
  // the stored default once it arrives.
  const userPickedFlowModeRef = React.useRef(false);

  // Only transactions that mutate the document mark the file dirty; selection
  // and viewport transactions must not. The import's own replaceDocument does
  // not pass through onTransaction, but the flag guards any feature that
  // commits a document-wide change right after load.
  const importReadyRef = React.useRef(false);
  // Latest-value refs keep the Begonia callbacks referentially stable, so the
  // mount controller syncs input instead of recreating the editor surface.
  const roleRef = React.useRef(role);
  roleRef.current = role;
  const editSessionRef = React.useRef(editSession);
  editSessionRef.current = editSession;
  const controllerRef = React.useRef<BrowserEditorController | null>(null);
  const importGenerationRef = React.useRef(0);

  const handleControllerChange = React.useCallback((next: BrowserEditorController | null) => {
    controllerRef.current = next;
    setController(next);
  }, []);

  const handleEditorTransaction = React.useCallback((transaction: { docChanged: boolean }) => {
    if (!importReadyRef.current || !transaction.docChanged) {
      return;
    }
    const session = editSessionRef.current;
    const currentController = controllerRef.current;
    if (!session || roleRef.current !== 'editor' || !currentController) {
      return;
    }
    session.reportChange(async () => ({
      encoding: 'bytes',
      bytes: await saveDocxFromEditor(currentController),
      mimeType: DOCX_MIME_TYPE,
    }));
  }, []);

  // Begonia's built-in view controls also switch flow mode on the controller;
  // mirror controller state back so the toolbar toggle never goes stale. A
  // mirrored value that differs from the React state means the change came
  // from Begonia's own controls (not our prop sync), i.e. the user picked it;
  // matching values are React no-ops and are skipped by the mount controller,
  // so this cannot loop.
  const flowModeRef = React.useRef(flowMode);
  flowModeRef.current = flowMode;
  const handleEditorStateChange = React.useCallback((state: { flowMode?: DocxFlowMode } | null) => {
    if (state?.flowMode === 'paginated' || state?.flowMode === 'web') {
      if (state.flowMode !== flowModeRef.current) {
        userPickedFlowModeRef.current = true;
        setFlowMode(state.flowMode);
      }
    }
  }, []);

  // Apply a late-arriving settings default unless the user already switched
  // flow mode through the toolbar or Begonia's own view controls.
  React.useEffect(() => {
    if (!userPickedFlowModeRef.current) {
      setFlowMode(settings.defaultFlowMode);
    }
  }, [settings.defaultFlowMode]);

  const handleFlowModeChange = React.useCallback((nextFlowMode: DocxFlowMode) => {
    userPickedFlowModeRef.current = true;
    setFlowMode(nextFlowMode);
  }, []);

  // Import the file bytes once the controller exists. Re-runs when the surface
  // reloads from a fresh src (e.g. the file changed on disk or edits were
  // discarded) or the user retries. Only the newest generation may apply its
  // document, so a stale import can never overwrite newer content.
  React.useEffect(() => {
    if (!controller || !docxBuffer) {
      return;
    }
    const generation = ++importGenerationRef.current;
    importReadyRef.current = false;
    setIsImporting(true);
    setImportError(null);

    parseDocxDocument(docxBuffer)
      .then((document) => {
        if (generation !== importGenerationRef.current) {
          return;
        }
        replaceEditorDocument(controller, document);
        importReadyRef.current = true;
        setIsImporting(false);
      })
      .catch((error: unknown) => {
        if (generation !== importGenerationRef.current) {
          return;
        }
        setIsImporting(false);
        setImportError(
          error instanceof Error ? error.message : 'Failed to import the Word document',
        );
      });

    return () => {
      importGenerationRef.current += 1;
      importReadyRef.current = false;
    };
  }, [controller, docxBuffer, retryNonce]);

  // Support Cmd/Ctrl+S while the surface holds focus.
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's' &&
        role === 'editor' &&
        editSession
      ) {
        event.preventDefault();
        void editSession.saveNow();
      }
    },
    [editSession, role],
  );

  if (importError) {
    return (
      <DocxSurfaceError
        message={importError}
        hint='Some Word features may be unsupported by the importer.'
        fileName={fileName}
        src={src}
        onRetry={() => setRetryNonce((nonce) => nonce + 1)}
        className={className}
      />
    );
  }

  return (
    <div
      tabIndex={-1}
      data-testid={role === 'editor' ? 'begonia-docx-editor' : 'begonia-docx-viewer'}
      data-surface-role={role}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground outline-none',
        className,
      )}
    >
      {showToolbar ? (
        <DocxToolbar
          fileName={fileName}
          role={role}
          canSwitchRole={canSwitchRole}
          onRoleChange={onRoleChange}
          onPreloadRole={onPreloadRole}
          editSession={editSession}
          flowMode={flowMode}
          onFlowModeChange={handleFlowModeChange}
          showDownloadButton={settings.showDownloadButton}
          src={src}
          onOpenEditorSettings={onOpenEditorSettings}
          extraMenuItems={extraMenuItems}
          toolbarActions={toolbarActions}
        />
      ) : null}

      <div ref={scrollHostRef} className='relative min-h-0 flex-1 overflow-y-auto'>
        <BegoniaBrowserEditor
          className={cn(
            'min-h-full w-full',
            // Viewer mode promotes the paginated projection to the visible
            // document; the CSS keeps the editable column mounted offscreen
            // because the projection is measured from it.
            role === 'viewer' && 'docx-preview-only',
          )}
          participant={DOCX_PARTICIPANT}
          documentMode={role === 'editor' ? 'editing' : 'viewing'}
          flowMode={flowMode}
          theme={BEGONIA_EDITOR_THEME}
          trackingEnabled={false}
          // Only the read-only Viewer shows the paginated projection: editing
          // stays a single continuous surface, and reading gets the Word
          // print-layout look — real page boxes with gaps and explicit page
          // breaks rendered as page boundaries.
          paginatedPreview={role === 'viewer' ? { height: previewHeight, virtualize: true } : false}
          // Begonia's formatting toolbar only belongs to editing; read-only
          // viewing keeps a clean document surface. The Web/Paged view
          // controls stay hidden in both modes — the toolbar's Viewer /
          // Paginated / Web switch owns that state.
          showToolbar={showToolbar && role === 'editor'}
          showViewControls={false}
          showReviewControls={false}
          showComments={false}
          showReview={false}
          showReviewTimeline={false}
          showAdvancedOoxmlInspector={false}
          onControllerChange={handleControllerChange}
          onStateChange={handleEditorStateChange}
          onTransaction={handleEditorTransaction}
        />
        {isImporting ? (
          <div
            data-testid='docx-surface-importing'
            className='absolute inset-0 grid place-items-center bg-background/80 text-xs text-muted-foreground backdrop-blur-[1px]'
          >
            <div className='inline-flex items-center gap-2'>
              <Loader2 className='size-4 animate-spin' />
              <span>Importing Word document…</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DocxSurfaceError({
  message,
  hint,
  fileName,
  src,
  onRetry,
  className,
}: {
  message: string;
  hint?: string;
  fileName?: string;
  src?: string;
  onRetry: () => void;
  className?: string;
}) {
  const handleDownload = React.useCallback(() => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName ?? 'document.docx';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [fileName, src]);

  return (
    <div
      data-testid='docx-surface-error'
      className={cn(
        'grid h-full min-h-0 w-full place-items-center bg-background p-6 text-sm text-destructive',
        className,
      )}
    >
      <div className='max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center'>
        <p className='font-medium'>Unable to open Word document</p>
        <p className='mt-1 text-xs text-muted-foreground'>{message}</p>
        {hint ? <p className='mt-1 text-xs text-muted-foreground'>{hint}</p> : null}
        <div className='mt-3 flex items-center justify-center gap-2'>
          <Button type='button' variant='outline' size='xs' onClick={onRetry}>
            Retry
          </Button>
          {src ? (
            <Button type='button' variant='outline' size='xs' onClick={handleDownload}>
              Download
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BegoniaDocxViewer(props: Omit<BegoniaDocxSurfaceProps, 'role'>) {
  return <BegoniaDocxSurface {...props} role='viewer' />;
}

export function BegoniaDocxEditor(props: Omit<BegoniaDocxSurfaceProps, 'role'>) {
  return <BegoniaDocxSurface {...props} role='editor' />;
}
