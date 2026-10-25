import * as React from 'react';

import type { FileEntry, FileSystemEntry, FileSystemFileItem } from './types';

export function useVirtualWindow({
  count,
  horizontal = false,
  itemStride,
  leadingPx = 0,
  overscan = 8,
  viewportRef,
}: {
  count: number;
  horizontal?: boolean;
  itemStride: number;
  leadingPx?: number;
  overscan?: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [window_, setWindow] = React.useState(() => ({
    end: Math.min(count, overscan * 2),
    start: 0,
  }));

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || itemStride <= 0) return;

    const update = () => {
      const scrollStart = (horizontal ? viewport.scrollLeft : viewport.scrollTop) - leadingPx;
      const viewportSize = horizontal ? viewport.clientWidth : viewport.clientHeight;
      const firstVisible = Math.max(0, Math.floor(scrollStart / itemStride));
      const lastVisible = Math.min(count, Math.ceil((scrollStart + viewportSize) / itemStride));

      setWindow((previous) => {
        if (
          previous.end <= count &&
          previous.start <= Math.max(0, firstVisible - 1) &&
          previous.end >= Math.min(count, lastVisible + 1)
        ) {
          return previous;
        }
        return {
          end: Math.min(count, lastVisible + overscan),
          start: Math.max(0, firstVisible - overscan),
        };
      });
    };

    update();
    viewport.addEventListener('scroll', update, { passive: true });

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);

    observer?.observe(viewport);
    return () => {
      viewport.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [count, horizontal, itemStride, leadingPx, overscan, viewportRef]);

  return window_;
}

export function scrollIndexIntoView({
  horizontal = false,
  index,
  itemSize,
  itemStride,
  leadingPx = 0,
  viewport,
}: {
  horizontal?: boolean;
  index: number;
  itemSize: number;
  itemStride: number;
  leadingPx?: number;
  viewport: HTMLDivElement | null;
}) {
  if (!viewport || index < 0) return;

  const start = leadingPx + index * itemStride;
  const end = start + itemSize;
  const scrollStart = horizontal ? viewport.scrollLeft : viewport.scrollTop;
  const viewportSize = horizontal ? viewport.clientWidth : viewport.clientHeight;

  let nextScrollStart: number | null = null;

  if (start < scrollStart) {
    nextScrollStart = start;
  } else if (end > scrollStart + viewportSize) {
    nextScrollStart = end - viewportSize;
  }
  if (nextScrollStart === null) return;
  if (horizontal) {
    viewport.scrollLeft = nextScrollStart;
  } else {
    viewport.scrollTop = nextScrollStart;
  }
}

export function fileUrlCacheKey(file: { path: string; updatedAt?: string; size?: number }): string {
  return `${file.path}::${file.updatedAt ?? ''}::${file.size ?? ''}`;
}

export function useResolvedFileUrl(
  file: FileEntry | null,
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>,
  cache?: Map<string, string>,
) {
  const cacheKey = file ? fileUrlCacheKey(file) : null;
  const [state, setState] = React.useState<{
    isResolving: boolean;
    path: string | null;
    url: string | null;
  }>(() => ({
    isResolving: false,
    path: file?.path ?? null,
    url: file ? (file.url ?? (cacheKey ? cache?.get(cacheKey) : null) ?? null) : null,
  }));
  const fileRef = React.useRef(file);

  React.useEffect(() => {
    fileRef.current = file;
  });

  const fileUrl = file?.url ?? null;

  React.useEffect(() => {
    const currentFile = fileRef.current;
    const currentPath = currentFile?.path ?? null;
    const knownUrl = fileUrl ?? (cacheKey ? (cache?.get(cacheKey) ?? null) : null);

    if (!currentFile || knownUrl || !getFileUrl || !cacheKey) {
      setState({ isResolving: false, path: currentPath, url: knownUrl });
      return;
    }

    let isCurrent = true;

    setState((previous) => {
      if (previous.path === currentPath && previous.url !== null) {
        return previous;
      }
      return { isResolving: true, path: currentPath, url: null };
    });
    void Promise.resolve(getFileUrl(currentFile))
      .then((url) => {
        if (url) cache?.set(cacheKey, url);
        if (isCurrent) setState({ isResolving: false, path: currentPath, url });
      })
      .catch(() => {
        if (isCurrent) {
          setState((previous) =>
            previous.path === currentPath && previous.url !== null
              ? { ...previous, isResolving: false }
              : { isResolving: false, path: currentPath, url: null },
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [cache, cacheKey, fileUrl, getFileUrl]);

  return state;
}

export function useSettledValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    if (Object.is(settled, value)) return;

    const timeout = window.setTimeout(() => setSettled(value), delay);

    return () => window.clearTimeout(timeout);
  }, [delay, settled, value]);

  return settled;
}

export const ARROW_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);

const TYPE_AHEAD_RESET_MS = 700;

export function isTypeAheadKey(event: React.KeyboardEvent) {
  return (
    event.key.length === 1 &&
    /^[\p{L}\p{N}]$/u.test(event.key) &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}

export function useEntryTypeAhead() {
  const stateRef = React.useRef({ buffer: '', timeout: 0 });

  React.useEffect(() => {
    const state = stateRef.current;

    return () => window.clearTimeout(state.timeout);
  }, []);

  return React.useCallback(
    (event: React.KeyboardEvent, entries: readonly FileSystemEntry[], currentIndex: number) => {
      if (!isTypeAheadKey(event) || entries.length === 0) return null;

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return null;
      }

      const state = stateRef.current;

      window.clearTimeout(state.timeout);
      state.timeout = window.setTimeout(() => {
        state.buffer = '';
      }, TYPE_AHEAD_RESET_MS);
      state.buffer += event.key.toLowerCase();

      const startIndex = currentIndex < 0 ? 0 : currentIndex + (state.buffer.length === 1 ? 1 : 0);

      for (let step = 0; step < entries.length; step += 1) {
        const entry = entries[(startIndex + step) % entries.length];

        if (entry.name.toLowerCase().startsWith(state.buffer)) {
          event.preventDefault();
          return entry;
        }
      }
      event.preventDefault();
      return null;
    },
    [],
  );
}

export function moveGridSelection({
  entries,
  itemRefs,
  key,
  onSelect,
  selectedPath,
}: {
  entries: FileSystemEntry[];
  itemRefs: Map<string, HTMLButtonElement>;
  key: string;
  onSelect: (entry: FileSystemEntry | null) => void;
  selectedPath: string | null;
}) {
  if (entries.length === 0) return false;

  const currentIndex = entries.findIndex((entry) => entry.path === selectedPath);
  let nextEntry: FileSystemEntry | undefined;

  if (currentIndex === -1) {
    nextEntry = entries[0];
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    nextEntry = entries[currentIndex + (key === 'ArrowLeft' ? -1 : 1)];
  } else {
    const currentElement = itemRefs.get(entries[currentIndex].path);

    if (!currentElement) return false;

    const currentRect = currentElement.getBoundingClientRect();
    let bestScore = Infinity;

    for (const entry of entries) {
      if (entry.path === selectedPath) continue;

      const rect = itemRefs.get(entry.path)?.getBoundingClientRect();

      if (!rect) continue;

      const rowDelta =
        key === 'ArrowDown' ? rect.top - currentRect.top : currentRect.top - rect.top;

      if (rowDelta <= 1) continue;

      const score = rowDelta * 1000 + Math.abs(rect.left - currentRect.left);

      if (score < bestScore) {
        bestScore = score;
        nextEntry = entry;
      }
    }
  }

  if (!nextEntry) return false;

  onSelect(nextEntry);
  itemRefs.get(nextEntry.path)?.focus();
  return true;
}
