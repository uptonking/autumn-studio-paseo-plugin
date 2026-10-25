import { useSyncExternalStore } from 'react';

export const DEFAULT_MAX_OPEN_TABS = 8;
export const MAX_RECENT_FILES = 8;

export interface OpenedFileTab {
  path: string;
  name: string;
  contentType?: string;
  size?: number;
  updatedAt?: string;
  lastAccessedAt?: number;
  pinned?: boolean;
  isDirty?: boolean;
}

export interface OpenFileTabOptions {
  maxOpenTabs?: number;
}

export interface WorkspaceOpenedTabsState {
  tabs: OpenedFileTab[];
  activePath: string | null;
  recentFiles: OpenedFileTab[];
}

const EMPTY_STATE: WorkspaceOpenedTabsState = {
  tabs: [],
  activePath: null,
  recentFiles: [],
};

const stateByWorkspace = new Map<string, WorkspaceOpenedTabsState>();
const maxOpenTabsByWorkspace = new Map<string, number>();
const listeners = new Set<() => void>();
let accessSequence = 0;

function nextAccessStamp(): number {
  accessSequence += 1;
  return accessSequence;
}

function normalizeMaxOpenTabs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_OPEN_TABS;
  }
  return Math.min(50, Math.max(1, Math.floor(value)));
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function upsertRecentFile(
  recentFiles: readonly OpenedFileTab[],
  file: OpenedFileTab,
): OpenedFileTab[] {
  const existing = recentFiles.find((entry) => entry.path === file.path);
  const merged: OpenedFileTab = {
    path: file.path,
    name: file.name || existing?.name || file.path.split('/').pop() || file.path,
    contentType: file.contentType ?? existing?.contentType,
    size: file.size ?? existing?.size,
    updatedAt: file.updatedAt ?? existing?.updatedAt,
    lastAccessedAt: file.lastAccessedAt ?? existing?.lastAccessedAt,
  };
  const rest = recentFiles.filter((entry) => entry.path !== file.path);
  return [merged, ...rest].slice(0, MAX_RECENT_FILES);
}

function evictExcessTabs(
  tabs: readonly OpenedFileTab[],
  activePath: string | null,
  maxOpenTabs: number,
): OpenedFileTab[] {
  const limit = normalizeMaxOpenTabs(maxOpenTabs);
  if (tabs.length <= limit) {
    return [...tabs];
  }

  const countToEvict = tabs.length - limit;
  const candidates = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => tab.path !== activePath && !tab.pinned && !tab.isDirty);

  const fallbackDirtyUnpinned =
    candidates.length < countToEvict
      ? tabs
          .map((tab, index) => ({ tab, index }))
          .filter(({ tab }) => tab.path !== activePath && !tab.pinned && Boolean(tab.isDirty))
      : [];

  const sortByOldestAccess = (
    a: { tab: OpenedFileTab; index: number },
    b: { tab: OpenedFileTab; index: number },
  ) => {
    const accessDiff = (a.tab.lastAccessedAt ?? 0) - (b.tab.lastAccessedAt ?? 0);
    return accessDiff !== 0 ? accessDiff : a.index - b.index;
  };

  candidates.sort(sortByOldestAccess);
  fallbackDirtyUnpinned.sort(sortByOldestAccess);

  const orderedPool = [...candidates, ...fallbackDirtyUnpinned];
  const pathsToEvict = new Set(orderedPool.slice(0, countToEvict).map((entry) => entry.tab.path));

  if (pathsToEvict.size === 0) {
    return [...tabs];
  }

  return tabs.filter((tab) => !pathsToEvict.has(tab.path));
}

export function getDisambiguatedTabLabels(
  items: readonly { path: string; name: string }[],
): Map<string, { name: string; folderHint: string | null }> {
  const countsByName = new Map<string, number>();
  for (const item of items) {
    countsByName.set(item.name, (countsByName.get(item.name) ?? 0) + 1);
  }
  const result = new Map<string, { name: string; folderHint: string | null }>();
  for (const item of items) {
    if ((countsByName.get(item.name) ?? 0) <= 1) {
      result.set(item.path, { name: item.name, folderHint: null });
      continue;
    }
    const normalized = item.path.replace(/^\/+/, '');
    const slashIdx = normalized.lastIndexOf('/');
    const parentDir = slashIdx > 0 ? normalized.slice(0, slashIdx) : '/';
    result.set(item.path, { name: item.name, folderHint: parentDir });
  }
  return result;
}

export function getWorkspaceOpenedTabs(workspaceId: string): WorkspaceOpenedTabsState {
  return stateByWorkspace.get(workspaceId) ?? EMPTY_STATE;
}

export function recordRecentFileInStore(workspaceId: string, file: OpenedFileTab): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const stamp = nextAccessStamp();
  const nextRecentFiles = upsertRecentFile(current.recentFiles, {
    ...file,
    lastAccessedAt: stamp,
  });
  stateByWorkspace.set(workspaceId, {
    ...current,
    recentFiles: nextRecentFiles,
  });
  emitChange();
}

export function openFileTabInStore(
  workspaceId: string,
  file: OpenedFileTab,
  options?: OpenFileTabOptions,
): void {
  if (options?.maxOpenTabs !== undefined) {
    maxOpenTabsByWorkspace.set(workspaceId, normalizeMaxOpenTabs(options.maxOpenTabs));
  }
  const maxOpenTabs =
    options?.maxOpenTabs !== undefined
      ? normalizeMaxOpenTabs(options.maxOpenTabs)
      : (maxOpenTabsByWorkspace.get(workspaceId) ?? DEFAULT_MAX_OPEN_TABS);

  const current = getWorkspaceOpenedTabs(workspaceId);
  const stamp = nextAccessStamp();
  const existingIndex = current.tabs.findIndex((tab) => tab.path === file.path);

  const openedTab: OpenedFileTab =
    existingIndex === -1
      ? { ...file, lastAccessedAt: stamp }
      : {
          ...current.tabs[existingIndex],
          ...file,
          pinned: file.pinned ?? current.tabs[existingIndex].pinned,
          isDirty: file.isDirty ?? current.tabs[existingIndex].isDirty,
          lastAccessedAt: stamp,
        };

  const rawTabs =
    existingIndex === -1
      ? [...current.tabs, openedTab]
      : current.tabs.map((tab, index) => (index === existingIndex ? openedTab : tab));

  const nextTabs = evictExcessTabs(rawTabs, file.path, maxOpenTabs);
  const nextRecentFiles = upsertRecentFile(current.recentFiles, openedTab);

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: file.path,
    recentFiles: nextRecentFiles,
  });
  emitChange();
}

export function setActiveFileTabInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const targetIndex = current.tabs.findIndex((tab) => tab.path === path);
  if (targetIndex === -1) {
    return;
  }
  const stamp = nextAccessStamp();
  const updatedTab: OpenedFileTab = {
    ...current.tabs[targetIndex],
    lastAccessedAt: stamp,
  };
  const nextTabs = current.tabs.map((tab, idx) => (idx === targetIndex ? updatedTab : tab));
  const nextRecentFiles = upsertRecentFile(current.recentFiles, updatedTab);

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: path,
    recentFiles: nextRecentFiles,
  });
  emitChange();
}

export function enforceMaxOpenTabsInStore(workspaceId: string, maxOpenTabs: number): void {
  const limit = normalizeMaxOpenTabs(maxOpenTabs);
  maxOpenTabsByWorkspace.set(workspaceId, limit);
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (current.tabs.length <= limit) {
    return;
  }
  const nextTabs = evictExcessTabs(current.tabs, current.activePath, limit);
  if (nextTabs.length === current.tabs.length) {
    return;
  }
  const nextActivePath =
    current.activePath && nextTabs.some((t) => t.path === current.activePath)
      ? current.activePath
      : (nextTabs[nextTabs.length - 1]?.path ?? null);

  stateByWorkspace.set(workspaceId, {
    ...current,
    tabs: nextTabs,
    activePath: nextActivePath,
  });
  emitChange();
}

export function togglePinFileTabInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const targetIndex = current.tabs.findIndex((tab) => tab.path === path);
  if (targetIndex === -1) return;

  const target = current.tabs[targetIndex];
  const toggled: OpenedFileTab = { ...target, pinned: !target.pinned };
  const updated = current.tabs.map((tab, idx) => (idx === targetIndex ? toggled : tab));
  const pinnedTabs = updated.filter((tab) => tab.pinned);
  const unpinnedTabs = updated.filter((tab) => !tab.pinned);

  stateByWorkspace.set(workspaceId, {
    ...current,
    tabs: [...pinnedTabs, ...unpinnedTabs],
  });
  emitChange();
}

export function setFileTabDirtyInStore(workspaceId: string, path: string, isDirty: boolean): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const targetIndex = current.tabs.findIndex((tab) => tab.path === path);
  if (targetIndex === -1) return;
  if (Boolean(current.tabs[targetIndex].isDirty) === isDirty) return;

  const nextTabs = current.tabs.map((tab, idx) =>
    idx === targetIndex ? { ...tab, isDirty } : tab,
  );
  stateByWorkspace.set(workspaceId, {
    ...current,
    tabs: nextTabs,
  });
  emitChange();
}

export function updateFileTabMetadataInStore(
  workspaceId: string,
  path: string,
  patch: Partial<OpenedFileTab>,
): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const hasTab = current.tabs.some((tab) => tab.path === path);
  const hasRecent = current.recentFiles.some((file) => file.path === path);
  if (!hasTab && !hasRecent) return;

  const nextTabs = hasTab
    ? current.tabs.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab))
    : current.tabs;
  const nextRecentFiles = hasRecent
    ? current.recentFiles.map((file) => (file.path === path ? { ...file, ...patch } : file))
    : current.recentFiles;

  stateByWorkspace.set(workspaceId, {
    ...current,
    tabs: nextTabs,
    recentFiles: nextRecentFiles,
  });
  emitChange();
}

export function closeFileTabInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const targetIndex = current.tabs.findIndex((tab) => tab.path === path);
  if (targetIndex === -1) return;

  let nextTabs = current.tabs.filter((tab) => tab.path !== path);
  let nextActivePath = current.activePath;
  if (current.activePath === path) {
    const fallbackTab = nextTabs[targetIndex] ?? nextTabs[targetIndex - 1] ?? null;
    nextActivePath = fallbackTab?.path ?? null;
    if (nextActivePath) {
      const stamp = nextAccessStamp();
      nextTabs = nextTabs.map((tab) =>
        tab.path === nextActivePath ? { ...tab, lastAccessedAt: stamp } : tab,
      );
    }
  }

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: nextActivePath,
    recentFiles: current.recentFiles,
  });
  emitChange();
}

export function closeOtherFileTabsInStore(workspaceId: string, keepPath: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (!current.tabs.some((tab) => tab.path === keepPath)) return;
  const stamp = nextAccessStamp();
  const nextTabs = current.tabs
    .filter((tab) => tab.path === keepPath || tab.pinned)
    .map((tab) => (tab.path === keepPath ? { ...tab, lastAccessedAt: stamp } : tab));
  const keptEntry = nextTabs.find((tab) => tab.path === keepPath);
  const nextRecentFiles = keptEntry
    ? upsertRecentFile(current.recentFiles, keptEntry)
    : current.recentFiles;

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: keepPath,
    recentFiles: nextRecentFiles,
  });
  emitChange();
}

export function closeFileTabsToRightInStore(workspaceId: string, fromPath: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const fromIndex = current.tabs.findIndex((tab) => tab.path === fromPath);
  if (fromIndex === -1) return;

  const nextTabs = current.tabs.filter((tab, index) => index <= fromIndex || tab.pinned);
  if (nextTabs.length === current.tabs.length) return;

  const nextActivePath =
    current.activePath && nextTabs.some((tab) => tab.path === current.activePath)
      ? current.activePath
      : fromPath;

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: nextActivePath,
    recentFiles: current.recentFiles,
  });
  emitChange();
}

export function closeAllFileTabsInStore(workspaceId: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (current.tabs.length === 0 && current.activePath === null) return;
  if (current.recentFiles.length === 0) {
    stateByWorkspace.delete(workspaceId);
  } else {
    stateByWorkspace.set(workspaceId, {
      tabs: [],
      activePath: null,
      recentFiles: current.recentFiles,
    });
  }
  emitChange();
}

export function clearRecentFilesInStore(workspaceId: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (current.recentFiles.length === 0) return;
  if (current.tabs.length === 0 && current.activePath === null) {
    stateByWorkspace.delete(workspaceId);
  } else {
    stateByWorkspace.set(workspaceId, {
      ...current,
      recentFiles: [],
    });
  }
  emitChange();
}

export function removeRecentFileInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (!current.recentFiles.some((file) => file.path === path)) return;
  const nextRecentFiles = current.recentFiles.filter((file) => file.path !== path);
  if (current.tabs.length === 0 && current.activePath === null && nextRecentFiles.length === 0) {
    stateByWorkspace.delete(workspaceId);
  } else {
    stateByWorkspace.set(workspaceId, {
      ...current,
      recentFiles: nextRecentFiles,
    });
  }
  emitChange();
}

export function isFileNotFoundError(error: unknown): boolean {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string'
          ? error.code
          : '';
  return (
    /\bENOENT\b/i.test(text) ||
    /no such file or directory/i.test(text) ||
    /file not found/i.test(text)
  );
}

export function formatFileLoadError(error: unknown, fileNameOrPath?: string): string {
  if (isFileNotFoundError(error)) {
    const label = fileNameOrPath ? `“${fileNameOrPath}”` : 'This file';
    return `${label} was moved or deleted from the filesystem.`;
  }
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Failed to load file';
  return raw
    .replace(/^Request failed:\s*/i, '')
    .replace(/\s*requestType=\S+/gi, '')
    .replace(/\s*code=\S+/gi, '')
    .trim();
}

export function resetOpenedTabsStore(workspaceId?: string): void {
  if (workspaceId !== undefined) {
    stateByWorkspace.delete(workspaceId);
    maxOpenTabsByWorkspace.delete(workspaceId);
  } else {
    stateByWorkspace.clear();
    maxOpenTabsByWorkspace.clear();
  }
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWorkspaceOpenedTabs(workspaceId: string): WorkspaceOpenedTabsState {
  return useSyncExternalStore(
    subscribe,
    () => getWorkspaceOpenedTabs(workspaceId),
    () => EMPTY_STATE,
  );
}
