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
  extraMenuItems,
  toolbarActions,
  className,
}: LoadedDocxSurfaceProps) {
  const [controller, setController] = React.useState<BrowserEditorController | null>(null);
  const [flowMode, setFlowMode] = React.useState<DocxFlowMode>(settings.defaultFlowMode);
  const [isImporting, setIsImporting] = React.useState(true);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);

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
  // mirror controller state back so the toolbar toggle never goes stale. Setting
  // the same value is a React no-op, and a matching flowMode prop is skipped by
  // the mount controller, so this cannot loop.
  const handleEditorStateChange = React.useCallback((state: { flowMode?: DocxFlowMode } | null) => {
    if (state?.flowMode === 'paginated' || state?.flowMode === 'web') {
      setFlowMode(state.flowMode);
    }
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
          onFlowModeChange={setFlowMode}
          showDownloadButton={settings.showDownloadButton}
          src={src}
          extraMenuItems={extraMenuItems}
          toolbarActions={toolbarActions}
        />
      ) : null}

      <div className='relative min-h-0 flex-1 overflow-y-auto'>
        <BegoniaBrowserEditor
          className='min-h-full w-full'
          participant={DOCX_PARTICIPANT}
          documentMode={role === 'editor' ? 'editing' : 'viewing'}
          flowMode={flowMode}
          trackingEnabled={false}
          showToolbar={showToolbar}
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
