import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getDisambiguatedTabLabels,
  MAX_RECENT_FILES,
  type OpenedFileTab,
} from './opened-tabs-store.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './vendor/components/ui/dropdown-menu.js';
import { FileTypeIcon } from './vendor/file-system/icons.js';
import { viewerKindForFile } from './vendor/file-system/types.js';
import { IconPlaceholder } from './vendor/icon-placeholder.js';
import { cn } from './vendor/lib/utils.js';
import { preloadFileSurfaceForKind } from './viewers/registry.js';
import type { FileViewerViewProps } from './view-props.js';

export function RecentFilesDropdownSection({
  recentFiles,
  openPathSet,
  activePath,
  testId = 'file-viewer-recent-files',
  itemTestIdPrefix = 'file-viewer-recent-item-',
  clearTestId = 'file-viewer-clear-recent-files',
  onSelectFile,
  onPreloadFile,
  onClearRecentFiles,
}: {
  recentFiles: readonly OpenedFileTab[];
  openPathSet?: ReadonlySet<string>;
  activePath?: string | null;
  testId?: string;
  itemTestIdPrefix?: string;
  clearTestId?: string;
  onSelectFile: (file: OpenedFileTab) => void;
  onPreloadFile?: (file: OpenedFileTab) => void;
  onClearRecentFiles?: () => void;
}) {
  const capped = useMemo(() => recentFiles.slice(0, MAX_RECENT_FILES), [recentFiles]);
  const recentLabels = useMemo(() => getDisambiguatedTabLabels(capped), [capped]);
  if (capped.length === 0) return null;

  return (
    <DropdownMenuGroup data-testid={testId}>
      <DropdownMenuLabel>Recent files</DropdownMenuLabel>
      {capped.map((file) => {
        const isCurrentlyOpen = openPathSet?.has(file.path) ?? false;
        const isCurrentActive = activePath === file.path;
        const recentLabel = recentLabels.get(file.path);
        return (
          <DropdownMenuItem
            key={file.path}
            data-testid={`${itemTestIdPrefix}${file.path}`}
            title={file.path}
            onPointerEnter={() => onPreloadFile?.(file)}
            onClick={() => onSelectFile(file)}
          >
            <FileTypeIcon fileName={file.name} className='size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate'>
              {recentLabel?.name ?? file.name}
              {recentLabel?.folderHint ? (
                <span className='ms-1 text-xs text-muted-foreground'>
                  · {recentLabel.folderHint}
                </span>
              ) : null}
            </span>
            {isCurrentActive ? (
              <DropdownMenuShortcut>Active</DropdownMenuShortcut>
            ) : isCurrentlyOpen ? (
              <DropdownMenuShortcut>Open</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        );
      })}
      {onClearRecentFiles ? (
        <DropdownMenuItem
          data-testid={clearTestId}
          onClick={onClearRecentFiles}
          className='text-muted-foreground'
        >
          <IconPlaceholder lucide='Trash2' className='size-4' />
          Clear recent files
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuGroup>
  );
}

export function RecentFilesQuickList({
  recentFiles,
  excludePath,
  openPathSet,
  testId = 'file-viewer-empty-recent-files',
  itemTestIdPrefix = 'file-viewer-quick-recent-item-',
  onSelectFile,
  onClearRecentFiles,
}: {
  recentFiles: readonly OpenedFileTab[];
  excludePath?: string | null;
  openPathSet?: ReadonlySet<string>;
  testId?: string;
  itemTestIdPrefix?: string;
  onSelectFile: (file: OpenedFileTab) => void;
  onClearRecentFiles?: () => void;
}) {
  const filtered = useMemo(
    () =>
      recentFiles
        .filter((file) => !excludePath || file.path !== excludePath)
        .slice(0, MAX_RECENT_FILES),
    [excludePath, recentFiles],
  );
  const recentLabels = useMemo(() => getDisambiguatedTabLabels(filtered), [filtered]);
  if (filtered.length === 0) return null;

  return (
    <div data-testid={testId} className='mt-2 flex w-full max-w-md flex-col items-center gap-2'>
      <div className='flex w-full items-center justify-between px-1'>
        <p className='text-xs font-medium text-muted-foreground'>Recent files</p>
        {onClearRecentFiles ? (
          <button
            type='button'
            onClick={onClearRecentFiles}
            className='text-[11px] text-muted-foreground transition-colors hover:text-foreground'
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className='flex w-full flex-col gap-1'>
        {filtered.map((file) => {
          const label = recentLabels.get(file.path);
          const isOpen = openPathSet?.has(file.path) ?? false;
          const normalized = file.path.replace(/^\/+/, '');
          const slashIdx = normalized.lastIndexOf('/');
          const parentFolder = slashIdx > 0 ? normalized.slice(0, slashIdx) : null;
          return (
            <button
              key={file.path}
              type='button'
              data-testid={`${itemTestIdPrefix}${file.path}`}
              title={file.path}
              onClick={() => onSelectFile(file)}
              className='flex w-full items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent'
            >
              <FileTypeIcon fileName={file.name} className='size-4 shrink-0' />
              <span className='min-w-0 flex-1 truncate font-medium'>
                {label?.name ?? file.name}
                {(label?.folderHint ?? parentFolder) ? (
                  <span className='ms-1.5 font-normal text-muted-foreground'>
                    · {label?.folderHint ?? parentFolder}
                  </span>
                ) : null}
              </span>
              {isOpen ? (
                <span className='shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground'>
                  Open
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FileViewerTabBar({
  view,
  activeTab,
}: {
  view: FileViewerViewProps;
  activeTab: OpenedFileTab;
}) {
  const tabElementByPathRef = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const activeNode = tabElementByPathRef.current[activeTab.path];
    if (activeNode && typeof activeNode.scrollIntoView === 'function') {
      activeNode.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeTab.path]);

  const preloadTabOrRecentFile = useCallback(
    (file: OpenedFileTab) => {
      if (file.path === activeTab.path) return;
      void view.getFileUrl(file).catch(() => {});
      const kind = viewerKindForFile({
        kind: 'file',
        path: file.path,
        name: file.name,
        contentType: file.contentType,
      });
      if (kind) {
        void preloadFileSurfaceForKind(kind, {
          pdfSettings: view.pdfSettings,
          xlsxSettings: view.xlsxSettings,
          docxSettings: view.docxSettings,
          textSettings: view.textSettings,
          formatSettings: view.formatSettings,
        });
      }
    },
    [activeTab.path, view],
  );

  const tabLabels = useMemo(() => getDisambiguatedTabLabels(view.tabs), [view.tabs]);

  const recentFiles = useMemo(
    () => (view.recentFiles ?? []).slice(0, MAX_RECENT_FILES),
    [view.recentFiles],
  );

  const openPathSet = useMemo(() => new Set(view.tabs.map((tab) => tab.path)), [view.tabs]);

  const activeIndex = view.tabs.findIndex((tab) => tab.path === activeTab.path);
  const hasClosableOtherTabs = view.tabs.some((tab) => tab.path !== activeTab.path && !tab.pinned);
  const hasClosableTabsToRight =
    activeIndex !== -1 && view.tabs.slice(activeIndex + 1).some((tab) => !tab.pinned);

  const hasTabActionSection = Boolean(
    view.onTogglePinTab ||
    view.onCloseOtherTabs ||
    view.onCloseTabsToRight ||
    (view.onCloseAllTabs && view.tabs.length > 0),
  );
  const hasNavigationSection = Boolean(view.onOpenExplorer || view.onOpenSettings);
  const hasRecentSection = recentFiles.length > 0;
  const hasMoreMenu = hasTabActionSection || hasNavigationSection || hasRecentSection;

  return (
    <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2'>
      <div
        role='tablist'
        aria-label='Opened files'
        onKeyDown={(event) => {
          if (view.tabs.length <= 1 || activeIndex === -1) return;
          let targetIdx = -1;
          if (event.key === 'ArrowRight') {
            targetIdx = (activeIndex + 1) % view.tabs.length;
          } else if (event.key === 'ArrowLeft') {
            targetIdx = (activeIndex - 1 + view.tabs.length) % view.tabs.length;
          } else if (event.key === 'Home') {
            targetIdx = 0;
          } else if (event.key === 'End') {
            targetIdx = view.tabs.length - 1;
          }
          if (targetIdx !== -1 && view.tabs[targetIdx]) {
            event.preventDefault();
            view.onSelectTab(view.tabs[targetIdx].path);
          }
        }}
        className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'
      >
        {view.tabs.map((tab) => {
          const isActive = tab.path === activeTab.path;
          const label = tabLabels.get(tab.path);
          return (
            <div
              key={tab.path}
              ref={(node) => {
                tabElementByPathRef.current[tab.path] = node;
              }}
              data-testid={`file-viewer-tab-${tab.path}`}
              data-pinned={tab.pinned ? 'true' : undefined}
              data-dirty={tab.isDirty ? 'true' : undefined}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  event.stopPropagation();
                  view.onCloseTab(tab.path);
                }
              }}
              className={cn(
                'group flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                isActive
                  ? 'border-border bg-background font-medium text-foreground shadow-xs'
                  : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {view.onTogglePinTab ? (
                <button
                  type='button'
                  aria-label={tab.pinned ? `Unpin ${tab.name}` : `Pin ${tab.name}`}
                  title={tab.pinned ? `Unpin ${tab.name}` : `Pin ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    view.onTogglePinTab?.(tab.path);
                  }}
                  className={cn(
                    'flex size-4 items-center justify-center rounded-sm transition-opacity hover:bg-accent hover:text-foreground',
                    tab.pinned
                      ? 'text-primary opacity-100'
                      : 'text-muted-foreground opacity-0 group-hover:opacity-70 focus-visible:opacity-100',
                  )}
                >
                  <IconPlaceholder lucide='Bookmark' className='size-3' />
                </button>
              ) : null}
              <button
                type='button'
                role='tab'
                aria-selected={isActive}
                onClick={() => view.onSelectTab(tab.path)}
                onMouseEnter={() => preloadTabOrRecentFile(tab)}
                className='flex max-w-48 items-center gap-1.5 truncate text-left outline-none'
                title={tab.path}
              >
                <FileTypeIcon fileName={tab.name} className='size-3.5 shrink-0' />
                <span className='truncate'>{label?.name ?? tab.name}</span>
                {label?.folderHint ? (
                  <span
                    data-testid={`file-viewer-tab-folder-${tab.path}`}
                    className='shrink-0 text-[11px] font-normal text-muted-foreground/80'
                  >
                    · {label.folderHint}
                  </span>
                ) : null}
              </button>
              {tab.isDirty ? (
                <span
                  aria-label='Unsaved changes'
                  title='Unsaved changes'
                  data-testid={`file-viewer-tab-dirty-${tab.path}`}
                  className='size-1.5 shrink-0 rounded-full bg-amber-500'
                />
              ) : null}
              <button
                type='button'
                aria-label={`Close ${tab.name}`}
                title={`Close ${tab.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  view.onCloseTab(tab.path);
                }}
                className='flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground'
              >
                <IconPlaceholder lucide='X' className='size-3' />
              </button>
            </div>
          );
        })}
      </div>
      {hasMoreMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              aria-label='More actions'
              title='More actions'
              className='flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
            >
              <IconPlaceholder lucide='Ellipsis' className='size-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-60'>
            {view.onTogglePinTab ? (
              <DropdownMenuItem onClick={() => view.onTogglePinTab?.(activeTab.path)}>
                <IconPlaceholder lucide='Bookmark' className='size-4' />
                {activeTab.pinned ? 'Unpin active tab' : 'Pin active tab'}
              </DropdownMenuItem>
            ) : null}
            {view.onCloseOtherTabs ? (
              <DropdownMenuItem
                disabled={!hasClosableOtherTabs}
                onClick={() => view.onCloseOtherTabs?.(activeTab.path)}
              >
                <IconPlaceholder lucide='X' className='size-4' />
                Close other tabs
              </DropdownMenuItem>
            ) : null}
            {view.onCloseTabsToRight ? (
              <DropdownMenuItem
                disabled={!hasClosableTabsToRight}
                onClick={() => view.onCloseTabsToRight?.(activeTab.path)}
              >
                <IconPlaceholder lucide='ArrowRight' className='size-4' />
                Close tabs to the right
              </DropdownMenuItem>
            ) : null}
            {view.onCloseAllTabs && view.tabs.length > 0 ? (
              <DropdownMenuItem onClick={view.onCloseAllTabs}>
                <IconPlaceholder lucide='X' className='size-4' />
                Close all tabs
              </DropdownMenuItem>
            ) : null}
            {hasTabActionSection && (hasNavigationSection || hasRecentSection) ? (
              <DropdownMenuSeparator />
            ) : null}
            {view.onOpenExplorer ? (
              <DropdownMenuItem onClick={view.onOpenExplorer}>
                <IconPlaceholder lucide='PanelLeft' className='size-4' />
                Open explorer
              </DropdownMenuItem>
            ) : null}
            {view.onOpenSettings ? (
              <DropdownMenuItem onClick={() => view.onOpenSettings?.()}>
                <IconPlaceholder lucide='Settings' className='size-4' />
                Autumn Studio settings
              </DropdownMenuItem>
            ) : null}
            {hasNavigationSection && hasRecentSection ? <DropdownMenuSeparator /> : null}
            <RecentFilesDropdownSection
              recentFiles={recentFiles}
              openPathSet={openPathSet}
              activePath={activeTab.path}
              onPreloadFile={preloadTabOrRecentFile}
              onSelectFile={(file) => {
                if (view.onOpenRecentFile) {
                  view.onOpenRecentFile(file);
                } else {
                  view.onSelectTab(file.path);
                }
              }}
              onClearRecentFiles={view.onClearRecentFiles}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
