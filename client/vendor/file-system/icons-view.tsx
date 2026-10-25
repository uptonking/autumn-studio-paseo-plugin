import * as React from 'react';

import { ScrollArea } from '../components/ui/scroll-area';
import { cn } from '../lib/utils';
import { FileVisual } from './file-visual';
import { FileSystemFolderGlyph } from './icons';
import type { FileSystemViewProps } from './types';
import {
  ARROW_KEYS,
  moveGridSelection,
  scrollIndexIntoView,
  useEntryTypeAhead,
  useVirtualWindow,
} from './virtual-window';

const ICON_GRID_PADDING = 12; // p-3
const ICON_MIN_TILE_WIDTH = 104; // 6.5rem
const ICON_TILE_GAP_X = 4; // gap-x-1
const ICON_TILE_HEIGHT = 102; // h-16 glyph box + gap-1.5 + two text-xs lines
const ICON_ROW_GAP = 12; // gap-y-3
const ICON_ROW_STRIDE = ICON_TILE_HEIGHT + ICON_ROW_GAP;

export function FileSystemIconsView({
  entries,
  onOpen,
  onSelect,
  renderFilePreview,
  selectedPath,
}: FileSystemViewProps) {
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const typeAhead = useEntryTypeAhead();
  const [columnCount, setColumnCount] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || typeof ResizeObserver === 'undefined') return;

    const update = () => {
      const available = viewport.clientWidth - ICON_GRID_PADDING * 2;

      setColumnCount(
        Math.max(
          1,
          Math.floor((available + ICON_TILE_GAP_X) / (ICON_MIN_TILE_WIDTH + ICON_TILE_GAP_X)),
        ),
      );
    };
    const observer = new ResizeObserver(update);

    update();
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const resolvedColumnCount = columnCount ?? 1;
  const rowCount = Math.ceil(entries.length / resolvedColumnCount);
  const { end, start } = useVirtualWindow({
    count: rowCount,
    itemStride: ICON_ROW_STRIDE,
    leadingPx: ICON_GRID_PADDING,
    overscan: 4,
    viewportRef,
  });
  const visibleEntries = entries.slice(start * resolvedColumnCount, end * resolvedColumnCount);

  React.useLayoutEffect(() => {
    if (!selectedPath) return;

    const entryIndex = entries.findIndex((entry) => entry.path === selectedPath);

    if (entryIndex === -1) return;

    scrollIndexIntoView({
      index: Math.floor(entryIndex / resolvedColumnCount),
      itemSize: ICON_TILE_HEIGHT,
      itemStride: ICON_ROW_STRIDE,
      leadingPx: ICON_GRID_PADDING,
      viewport: viewportRef.current,
    });
  }, [entries, resolvedColumnCount, selectedPath]);

  const tabStopPath = visibleEntries.some((entry) => entry.path === selectedPath)
    ? selectedPath
    : (visibleEntries[0]?.path ?? null);

  return (
    <ScrollArea
      orientation='vertical'
      viewportRef={viewportRef}
      viewportClassName='p-3'
      viewportProps={{
        onClick: (event) => {
          if (event.target === event.currentTarget) onSelect(null);
        },
      }}
    >
      <div
        className='relative'
        style={{
          height:
            columnCount !== null && rowCount
              ? rowCount * ICON_ROW_STRIDE - ICON_ROW_GAP
              : undefined,
        }}
      >
        <div
          role='listbox'
          aria-label='Files'
          className='absolute inset-x-0 grid gap-x-1 gap-y-3'
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(6.5rem, 1fr))',
            top: start * ICON_ROW_STRIDE,
          }}
          onKeyDown={(event) => {
            if (!ARROW_KEYS.has(event.key)) {
              const match = typeAhead(
                event,
                entries,
                entries.findIndex((entry) => entry.path === selectedPath),
              );

              if (match) {
                onSelect(match);
                requestAnimationFrame(() => itemRefs.current.get(match.path)?.focus());
              }
              return;
            }
            if (
              moveGridSelection({
                entries,
                itemRefs: itemRefs.current,
                key: event.key,
                onSelect,
                selectedPath,
              })
            ) {
              event.preventDefault();
            }
          }}
        >
          {visibleEntries.map((entry) => {
            const isSelected = entry.path === selectedPath;

            return (
              <button
                key={entry.path}
                type='button'
                role='option'
                aria-selected={isSelected}
                tabIndex={entry.path === tabStopPath ? 0 : -1}
                ref={(element) => {
                  if (element) {
                    itemRefs.current.set(entry.path, element);
                  } else {
                    itemRefs.current.delete(entry.path);
                  }
                }}
                onClick={() => onSelect(entry)}
                onDoubleClick={() => onOpen(entry)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(entry);
                }}
                className='group flex h-[6.375rem] flex-col items-center gap-1.5 outline-none'
              >
                <span
                  className={cn(
                    'flex h-16 w-20 shrink-0 items-center justify-center rounded-lg p-1 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring',
                    isSelected && 'bg-accent',
                  )}
                >
                  {entry.kind === 'folder' ? (
                    <FileSystemFolderGlyph className='h-13 w-auto drop-shadow-sm' />
                  ) : (
                    <FileVisual
                      file={entry}
                      className={cn(
                        'rounded-sm shadow-xs',
                        (entry.previewAspectRatio ?? 0.78) > 1.2 ? 'w-[4.75rem]' : 'w-12',
                      )}
                      previewAspectRatio={0.78}
                      renderFilePreview={renderFilePreview}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    'max-w-full rounded-sm px-1.5 py-px text-center text-xs leading-tight break-words',
                    isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  <span className='line-clamp-2'>{entry.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
