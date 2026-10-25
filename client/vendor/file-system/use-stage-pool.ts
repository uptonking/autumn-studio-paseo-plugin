import * as React from 'react';
import { flushActiveFileEditSession } from '../../editing/use-file-edit-session';
import { preloadFileSurfaceForKind } from '../../viewers/registry';
import {
  GALLERY_STAGE_ATTACHED_COUNT,
  GALLERY_STAGE_POOL_SIZE,
  viewerKindForFile,
  type FileEntry,
  type FileSystemDocxSettings,
  type FileSystemFormatSettingsMap,
  type FileSystemIndex,
  type FileSystemOpenMode,
  type FileSystemPdfSettings,
  type FileSystemProps,
  type FileSystemTextSettings,
  type FileSystemViewerKind,
  type FileSystemXlsxSettings,
} from './types';
import { fileUrlCacheKey } from './virtual-window';

export function useStagePool({ index }: { index: FileSystemIndex }) {
  const [stagePool, setStagePool] = React.useState<string[]>([]);
  const [stageRecency] = React.useState(() => new Map<string, number>());
  const stageClockRef = React.useRef(0);
  const [stageContainers] = React.useState(() => new Map<string, HTMLDivElement>());
  const [stageHosts] = React.useState(() => new Map<string, HTMLElement>());
  const [, bumpStageHosts] = React.useState(0);
  const [stageVersion, setStageVersion] = React.useState(0);

  const registerStageHost = React.useCallback(
    (path: string, element: HTMLElement | null) => {
      if (element) {
        if (stageHosts.get(path) === element) return;
        stageHosts.set(path, element);
      } else {
        if (!stageHosts.has(path)) return;
        stageHosts.delete(path);
      }
      bumpStageHosts((version) => version + 1);
    },
    [stageHosts],
  );

  const poolStagePath = React.useCallback(
    (path: string) => {
      if (!index.files.has(path)) return;
      if (!stageContainers.has(path)) {
        const container = document.createElement('div');

        container.className =
          'flex size-full min-h-0 min-w-0 items-center justify-center contain-layout contain-paint';
        stageContainers.set(path, container);
      }

      stageRecency.set(path, ++stageClockRef.current);
      setStageVersion((version) => version + 1);
      setStagePool((previous) => {
        if (previous.includes(path)) return previous;

        const next = [...previous, path];

        if (next.length <= GALLERY_STAGE_POOL_SIZE) return next;

        let evicted = next[0];

        for (const candidate of next) {
          if (candidate === path) continue;
          if ((stageRecency.get(candidate) ?? 0) < (stageRecency.get(evicted) ?? 0)) {
            evicted = candidate;
          }
        }
        return next.filter((candidate) => candidate !== evicted);
      });
    },
    [index, stageContainers, stageRecency],
  );

  const attachedStagePaths = React.useMemo(() => {
    void stageVersion;

    return [...stagePool]
      .sort((a, b) => (stageRecency.get(b) ?? 0) - (stageRecency.get(a) ?? 0))
      .slice(0, GALLERY_STAGE_ATTACHED_COUNT);
  }, [stagePool, stageRecency, stageVersion]);

  React.useLayoutEffect(() => {
    for (const [path, container] of stageContainers) {
      if (!stagePool.includes(path)) {
        container.remove();
        stageContainers.delete(path);
        continue;
      }

      const target = attachedStagePaths.includes(path) ? (stageHosts.get(path) ?? null) : null;

      if (!target) {
        if (container.parentElement) container.remove();
      } else if (container.parentElement !== target) {
        target.appendChild(container);
      }
    }
  });

  return {
    attachedStagePaths,
    poolStagePath,
    registerStageHost,
    stageContainers,
    stagePool,
  };
}

export function useOpenedFileSession({
  defaultFileOpenMode,
  docxSettings,
  formatSettings,
  getFileUrl,
  index,
  onFileOpen,
  onOpenFileInNewTab,
  onOpenUnsupported,
  onRecordRecentFile,
  onSaveFile,
  pdfSettings,
  resolvedUrlCache,
  textSettings,
  xlsxSettings,
}: {
  defaultFileOpenMode?: FileSystemOpenMode;
  docxSettings?: FileSystemDocxSettings;
  formatSettings?: FileSystemFormatSettingsMap;
  getFileUrl?: FileSystemProps['getFileUrl'];
  index: FileSystemIndex;
  onFileOpen?: FileSystemProps['onFileOpen'];
  onOpenFileInNewTab?: FileSystemProps['onOpenFileInNewTab'];
  onOpenUnsupported?: FileSystemProps['onOpenUnsupported'];
  onRecordRecentFile?: FileSystemProps['onRecordRecentFile'];
  onSaveFile?: FileSystemProps['onSaveFile'];
  pdfSettings?: FileSystemPdfSettings;
  resolvedUrlCache: Map<string, string>;
  textSettings?: FileSystemTextSettings;
  xlsxSettings?: FileSystemXlsxSettings;
}) {
  const openSessionIdRef = React.useRef(0);
  const [openedFile, setOpenedFile] = React.useState<{
    file: FileEntry;
    kind: FileSystemViewerKind;
    mode: 'in-place' | 'dialog';
    url: string;
    sessionId: number;
  } | null>(null);
  const openedFilePathRef = React.useRef<string | null>(null);
  openedFilePathRef.current = openedFile?.file.path ?? null;

  const openFileWithMode = React.useCallback(
    (file: FileEntry, modeOverride?: FileSystemOpenMode) => {
      void (async () => {
        if (openedFilePathRef.current && openedFilePathRef.current !== file.path) {
          await flushActiveFileEditSession(openedFilePathRef.current);
        }
        await flushActiveFileEditSession(file.path);

        const cacheKey = fileUrlCacheKey(file);
        let url = file.url ?? null;
        let fetchError: string | undefined;

        if (!url && getFileUrl) {
          try {
            url = await getFileUrl(file, { forceRefresh: true });
            if (url) {
              resolvedUrlCache.set(cacheKey, url);
              resolvedUrlCache.set(file.path, url);
            }
          } catch (err) {
            url = null;
            fetchError = err instanceof Error ? err.message : String(err);
          }
        }
        if (onFileOpen && !modeOverride) {
          onRecordRecentFile?.(file);
          onFileOpen(file, url);
          return;
        }

        const kind = viewerKindForFile(file);
        const effectiveMode = modeOverride ?? defaultFileOpenMode;

        if (kind) {
          await preloadFileSurfaceForKind(kind, {
            pdfSettings,
            xlsxSettings,
            docxSettings,
            textSettings,
            formatSettings,
          });
        }

        if (kind && url) {
          onRecordRecentFile?.(file);
          if (effectiveMode === 'new-tab' && onOpenFileInNewTab) {
            setOpenedFile((previous) => (previous?.file.path === file.path ? null : previous));
            onOpenFileInNewTab(file, url);
            return;
          }

          const targetMode = effectiveMode === 'dialog' ? 'dialog' : 'in-place';
          const sessionId = ++openSessionIdRef.current;
          setOpenedFile({ file, kind, mode: targetMode, url, sessionId });
        } else if (onOpenUnsupported) {
          onOpenUnsupported(file, fetchError);
        } else if (url && typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      })();
    },
    [
      defaultFileOpenMode,
      docxSettings,
      formatSettings,
      getFileUrl,
      onFileOpen,
      onOpenFileInNewTab,
      onOpenUnsupported,
      onRecordRecentFile,
      pdfSettings,
      resolvedUrlCache,
      textSettings,
      xlsxSettings,
    ],
  );

  const handleSaveFile = React.useCallback(
    async (input: Parameters<NonNullable<FileSystemProps['onSaveFile']>>[0]) => {
      if (!onSaveFile) {
        throw new Error('File save handler is not configured');
      }
      const saved = await onSaveFile(input);
      resolvedUrlCache.set(saved.path, saved.blobUrl);
      queueMicrotask(() => {
        setOpenedFile((previous) =>
          previous && previous.file.path === saved.path
            ? { ...previous, url: saved.blobUrl }
            : previous,
        );
      });
      return saved;
    },
    [onSaveFile, resolvedUrlCache],
  );

  React.useEffect(() => {
    if (!openedFile || !getFileUrl || typeof window === 'undefined') return;
    const targetFile = index.files.get(openedFile.file.path) ?? openedFile.file;
    const currentUrl = openedFile.url;
    const revalidateFromDisk = () => {
      void Promise.resolve(getFileUrl(targetFile, { forceRefresh: true, reuseIfUnchanged: true }))
        .then((nextUrl) => {
          if (nextUrl && nextUrl !== currentUrl) {
            resolvedUrlCache.set(fileUrlCacheKey(targetFile), nextUrl);
            resolvedUrlCache.set(targetFile.path, nextUrl);
            setOpenedFile((prev) =>
              prev && prev.file.path === targetFile.path && prev.url !== nextUrl
                ? { ...prev, file: targetFile, url: nextUrl }
                : prev,
            );
          }
        })
        .catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') revalidateFromDisk();
    };
    window.addEventListener('focus', revalidateFromDisk);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', revalidateFromDisk);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [getFileUrl, index.files, openedFile, resolvedUrlCache]);

  return {
    handleSaveFile,
    openedFile,
    openFileWithMode,
    setOpenedFile,
  };
}
