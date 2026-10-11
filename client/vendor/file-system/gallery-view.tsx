import * as React from "react"

import { ScrollArea } from "../components/ui/scroll-area"
import { Spinner } from "../components/ui/spinner"
import { cn } from "../lib/utils"
import { FileSystemInformation, FileVisual } from "./file-visual"
import { FileSystemFolderGlyph } from "./icons"
import {
  fileKindLabel,
  formatByteSize,
  type FileSystemViewProps,
} from "./types"
import {
  scrollIndexIntoView,
  useEntryTypeAhead,
  useSettledValue,
  useVirtualWindow,
} from "./virtual-window"

const GALLERY_STRIP_PADDING = 8 // p-2
const GALLERY_TILE_SIZE = 56 // size-14
const GALLERY_TILE_GAP = 6 // gap-1.5
const GALLERY_TILE_STRIDE = GALLERY_TILE_SIZE + GALLERY_TILE_GAP

export function FileSystemGalleryView(props: FileSystemViewProps) {
  const {
    attachedStagePaths,
    entries,
    index,
    onOpen,
    onSelect,
    poolStagePath,
    registerStageHost,
    renderFilePreview,
    selectedEntry,
    selectedPath,
  } = props
  const stripRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const stripViewportRef = React.useRef<HTMLDivElement | null>(null)
  const typeAhead = useEntryTypeAhead()
  const activeEntry =
    selectedEntry && entries.some((entry) => entry.path === selectedEntry.path)
      ? selectedEntry
      : (entries[0] ?? null)
  const activeFile = activeEntry?.kind === "file" ? activeEntry : null
  const settledPath = useSettledValue(activeEntry?.path ?? null, 200)

  React.useEffect(() => {
    if (settledPath) poolStagePath(settledPath)
  }, [poolStagePath, settledPath])

  const stageHostRefs = React.useMemo(
    () =>
      new Map(
        attachedStagePaths.map(
          (path) =>
            [
              path,
              (element: HTMLElement | null) => registerStageHost(path, element),
            ] as const
        )
      ),
    [attachedStagePaths, registerStageHost]
  )

  const activeFileSize = activeFile ? formatByteSize(activeFile.size) : null

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (entries.length === 0) return

    const currentIndex = activeEntry
      ? entries.findIndex((entry) => entry.path === activeEntry.path)
      : -1

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      const match = typeAhead(event, entries, currentIndex)

      if (match) {
        onSelect(match)
        requestAnimationFrame(() => stripRefs.current.get(match.path)?.focus())
      }
      return
    }

    const nextEntry =
      entries[
        currentIndex === -1
          ? 0
          : currentIndex + (event.key === "ArrowLeft" ? -1 : 1)
      ]

    if (!nextEntry) return

    onSelect(nextEntry)
    stripRefs.current.get(nextEntry.path)?.focus()
    event.preventDefault()
  }

  const { end: stripEnd, start: stripStart } = useVirtualWindow({
    count: entries.length,
    horizontal: true,
    itemStride: GALLERY_TILE_STRIDE,
    leadingPx: GALLERY_STRIP_PADDING,
    overscan: 8,
    viewportRef: stripViewportRef,
  })

  const activePath = activeEntry?.path ?? null

  React.useLayoutEffect(() => {
    if (!activePath) return

    scrollIndexIntoView({
      horizontal: true,
      index: entries.findIndex((entry) => entry.path === activePath),
      itemSize: GALLERY_TILE_SIZE,
      itemStride: GALLERY_TILE_STRIDE,
      leadingPx: GALLERY_STRIP_PADDING,
      viewport: stripViewportRef.current,
    })
  }, [activePath, entries])

  return (
    <div className="flex size-full flex-col" onKeyDown={handleKeyDown}>
      <ScrollArea
        orientation="horizontal"
        className="order-last h-auto w-full shrink-0 border-t"
        viewportRef={stripViewportRef}
        viewportClassName="p-2"
      >
        <div
          className="relative h-14 min-w-full"
          style={{
            width: entries.length
              ? entries.length * GALLERY_TILE_STRIDE - GALLERY_TILE_GAP
              : undefined,
          }}
        >
          <div
            role="listbox"
            aria-label="Files"
            className="absolute inset-y-0 flex items-center gap-1.5"
            style={{ left: stripStart * GALLERY_TILE_STRIDE }}
          >
            {entries.slice(stripStart, stripEnd).map((entry) => {
              const isActive =
                entry.path === (activeEntry?.path ?? selectedPath)

              return (
                <button
                  key={entry.path}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  ref={(element) => {
                    if (element) {
                      stripRefs.current.set(entry.path, element)
                    } else {
                      stripRefs.current.delete(entry.path)
                    }
                  }}
                  onClick={() => onSelect(entry)}
                  onDoubleClick={() => onOpen(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpen(entry)
                  }}
                  title={entry.name}
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center rounded-md border border-transparent p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "border-ring/40 bg-accent"
                  )}
                >
                  {entry.kind === "folder" ? (
                    <FileSystemFolderGlyph className="h-9 w-auto" />
                  ) : (
                    <FileVisual
                      file={entry}
                      className="w-9 rounded-sm"
                      previewAspectRatio={0.78}
                      renderFilePreview={renderFilePreview}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </ScrollArea>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3">
          {activeEntry?.kind === "folder" ? (
            <FileSystemFolderGlyph className="h-40 max-h-full w-auto drop-shadow-md" />
          ) : activeFile && !attachedStagePaths.includes(activeFile.path) ? (
            <Spinner className="size-6 text-muted-foreground" />
          ) : null}
          {attachedStagePaths.map((path) => {
            const isActiveStage = path === activeFile?.path

            return (
              <div
                key={path}
                ref={stageHostRefs.get(path)}
                inert={!isActiveStage || undefined}
                className={cn(
                  "absolute inset-0 flex items-center justify-center p-3",
                  !isActiveStage && "invisible opacity-0"
                )}
              />
            )
          })}
        </div>
        {activeEntry ? (
          <ScrollArea
            orientation="vertical"
            className="hidden w-64 shrink-0 border-l sm:block"
            viewportClassName="flex flex-col gap-3 p-4"
          >
            <div className="flex items-center gap-3">
              {activeFile ? (
                <FileVisual
                  file={activeFile}
                  className={cn(
                    "shrink-0 rounded-sm",
                    (activeFile.previewAspectRatio ?? 0.78) > 1.2
                      ? "w-16"
                      : "w-9"
                  )}
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              ) : (
                <FileSystemFolderGlyph className="h-8 w-auto shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold break-words">
                  {activeEntry.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeFile ? fileKindLabel(activeFile) : "Folder"}
                  {activeFileSize ? ` - ${activeFileSize}` : null}
                </div>
              </div>
            </div>
            <FileSystemInformation entry={activeEntry} index={index} />
          </ScrollArea>
        ) : null}
      </div>
    </div>
  )
}
