import { useSyncExternalStore } from "react";

export interface OpenedFileTab {
  path: string;
  name: string;
  contentType?: string;
  size?: number;
  updatedAt?: string;
}

export interface WorkspaceOpenedTabsState {
  tabs: OpenedFileTab[];
  activePath: string | null;
}

const EMPTY_STATE: WorkspaceOpenedTabsState = {
  tabs: [],
  activePath: null,
};

const stateByWorkspace = new Map<string, WorkspaceOpenedTabsState>();
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getWorkspaceOpenedTabs(workspaceId: string): WorkspaceOpenedTabsState {
  return stateByWorkspace.get(workspaceId) ?? EMPTY_STATE;
}

export function openFileTabInStore(workspaceId: string, file: OpenedFileTab): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const existingIndex = current.tabs.findIndex((tab) => tab.path === file.path);
  const nextTabs =
    existingIndex === -1
      ? [...current.tabs, file]
      : current.tabs.map((tab, index) => (index === existingIndex ? { ...tab, ...file } : tab));

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: file.path,
  });
  emitChange();
}

export function setActiveFileTabInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (current.activePath === path || !current.tabs.some((tab) => tab.path === path)) {
    return;
  }
  stateByWorkspace.set(workspaceId, {
    ...current,
    activePath: path,
  });
  emitChange();
}

export function closeFileTabInStore(workspaceId: string, path: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  const targetIndex = current.tabs.findIndex((tab) => tab.path === path);
  if (targetIndex === -1) return;

  const nextTabs = current.tabs.filter((tab) => tab.path !== path);
  let nextActivePath = current.activePath;
  if (current.activePath === path) {
    const fallbackTab = nextTabs[targetIndex] ?? nextTabs[targetIndex - 1] ?? null;
    nextActivePath = fallbackTab?.path ?? null;
  }

  stateByWorkspace.set(workspaceId, {
    tabs: nextTabs,
    activePath: nextActivePath,
  });
  emitChange();
}

export function closeAllFileTabsInStore(workspaceId: string): void {
  const current = getWorkspaceOpenedTabs(workspaceId);
  if (current.tabs.length === 0 && current.activePath === null) return;
  stateByWorkspace.delete(workspaceId);
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
