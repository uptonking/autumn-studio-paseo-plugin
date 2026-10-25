import { useEffect, useState } from 'react';
import { formatFileLoadError, isFileNotFoundError } from './opened-tabs-store.js';
import { FileSystem, preloadFileSystemView } from './vendor/file-system.js';
import { setPdfiumWasmResolver } from './vendor/lib/pdf-thumbnail-utils.js';
import { setXlsxWasmResolver } from './vendor/xlsx-viewer/wasm-loader.js';
import type { ExplorerViewProps, FileOpenRef } from './view-props.js';

/**
 * Presentational island content. All fetching happens in the host-tree panel;
 * this component only renders state and calls back through plain functions.
 */
export function ExplorerContent({ view }: { view: ExplorerViewProps }) {
  const [unsupported, setUnsupported] = useState<FileOpenRef | null>(null);

  if (view.getPdfWasmUrl) {
    setPdfiumWasmResolver(view.getPdfWasmUrl);
  }
  if (view.getXlsxWasmDataUri) {
    setXlsxWasmResolver(view.getXlsxWasmDataUri);
  }

  useEffect(() => {
    preloadFileSystemView(view.defaultViewMode ?? 'list');
  }, [view.defaultViewMode]);

  useEffect(() => {
    if (!unsupported) return;
    const timer = window.setTimeout(() => setUnsupported(null), 3000);
    return () => window.clearTimeout(timer);
  }, [unsupported]);

  if (view.enabled === false) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center'>
        <p className='text-sm font-medium text-foreground'>Autumn Studio is disabled</p>
        <p className='max-w-xs text-xs text-muted-foreground'>
          Enable Autumn Studio in the plugin settings to browse and preview workspace files.
        </p>
        {view.onOpenSettings ? (
          <button
            type='button'
            onClick={view.onOpenSettings}
            className='rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent'
          >
            Open explorer Settings
          </button>
        ) : null}
      </div>
    );
  }

  if (view.error) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 p-6 text-center'>
        <p className='text-sm text-destructive'>{view.error}</p>
        <button
          onClick={view.onRetry}
          className='rounded-md border px-3 py-1.5 text-xs hover:bg-accent'
        >
          Retry
        </button>
      </div>
    );
  }

  if (view.isLoading) {
    return (
      <div className='flex h-full items-center justify-center'>
        <p className='text-sm text-muted-foreground'>Loading workspace files…</p>
      </div>
    );
  }

  return (
    <div className='relative flex h-full w-full flex-col'>
      {view.treeDeprecationDismissed !== true && view.onDismissTreeDeprecation ? (
        <div
          data-testid='autumn-studio-deprecation-banner'
          className='flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2'
        >
          <p className='min-w-0 text-[11px] leading-snug text-amber-600 dark:text-amber-400'>
            This file tree is deprecated. Open files from Paseo&apos;s Files tab — the Autumn Studio
            viewer now opens there. The tree may be removed in a future release.
          </p>
          <button
            type='button'
            onClick={view.onDismissTreeDeprecation}
            className='shrink-0 rounded-md border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300'
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {view.truncated ? (
        <div className='absolute top-1 right-2 z-20 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20'>
          File limit reached (partial tree)
        </div>
      ) : null}
      <div className='relative min-h-0 flex-1'>
        <FileSystem
          items={view.items}
          recentFiles={view.recentFiles}
          title='Explorer'
          defaultView={view.defaultViewMode ?? 'list'}
          defaultFileOpenMode={view.defaultFileOpenMode ?? 'in-place'}
          autoSaveEdits={view.autoSaveEdits}
          pdfSettings={view.pdfSettings}
          xlsxSettings={view.xlsxSettings}
          textSettings={view.textSettings}
          formatSettings={view.formatSettings}
          aiText={view.aiText}
          onSaveFile={view.onSaveFile}
          className='h-full w-full rounded-none border-0'
          getFileUrl={view.getFileUrl}
          onRefresh={view.onRetry}
          onOpenSettings={view.onOpenSettings}
          onRecordRecentFile={view.onRecordRecentFile}
          onClearRecentFiles={view.onClearRecentFiles}
          onOpenFileInNewTab={
            view.onOpenFileInNewTab
              ? (file) =>
                  view.onOpenFileInNewTab?.({
                    path: file.path,
                    name: file.name,
                    contentType: file.contentType,
                    size: file.size,
                    updatedAt: file.updatedAt,
                  })
              : undefined
          }
          onOpenUnsupported={(file, error) => {
            if (error && isFileNotFoundError(error)) {
              view.onRemoveRecentFile?.(file.path);
            }
            setUnsupported({ path: file.path, name: file.name, error });
          }}
        />
      </div>
      {unsupported ? (
        <div className='pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-[90%] truncate rounded-lg border bg-popover px-3 py-2 text-center text-xs text-popover-foreground shadow-md'>
          {unsupported.error
            ? formatFileLoadError(unsupported.error, unsupported.name ?? unsupported.path)
            : `No preview for ${unsupported.name ?? unsupported.path} yet`}
        </div>
      ) : null}
    </div>
  );
}
