import * as React from "react"

import { ScrollArea } from "../components/ui/scroll-area"
import { ScrollAreaContent } from "../document-scroll-content"
import { IconPlaceholder } from "../icon-placeholder"
import { cn } from "../lib/utils"
import { FileSystemInformation, FileVisual } from "./file-visual"
import { FileSystemFolderGlyph, FileTypeIcon } from "./icons"
import {
  fileKindLabel,
  filePreviewUrls,
  folderHasChildren,
  formatByteSize,
  pathParent,
  type FileEntry,
  type FileSystemEntry,
  type FileSystemIndex,
  type FileSystemViewProps,
} from "./types"
import {
  ARROW_KEYS,
  scrollIndexIntoView,
  useEntryTypeAhead,
  useVirtualWindow,
} from "./virtual-window"

export function FileSystemColumnsView(props: FileSystemViewProps) {
  const {
    currentPath,
    index,
    loadPreviewImageUrl,
    loadingFolders,
    onOpen,
    onSelect,
    pageUrlCache,
    renderFilePreview,
    selectedEntry,
    selectedPath,
  } = props
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>())

  const deferredSelectedEntry = React.useDeferredValue(selectedEntry)
  const deferredSelectedPath = React.useDeferredValue(selectedPath)
  const pendingFocusPathRef = React.useRef<string | null>(null)
  const typeAhead = useEntryTypeAhead()

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!ARROW_KEYS.has(event.key)) {
      const siblings =
        selectedEntry && selectedPath?.startsWith(currentPath)
          ? (index.children.get(selectedEntry.parentPath) ?? [])
          : (index.children.get(currentPath) ?? [])
      const match = typeAhead(
        event,
        siblings,
        siblings.findIndex((sibling) => sibling.path === selectedPath)
      )

      if (match) {
        onSelect(match)

        const row = rowRefs.current.get(match.path)

        if (row) {
          row.focus()
        } else {
          pendingFocusPathRef.current = match.path
        }
      }
      return
    }

    let nextEntry: FileSystemEntry | null | undefined

    if (!selectedEntry || !selectedPath?.startsWith(currentPath)) {
      nextEntry = index.children.get(currentPath)?.[0]
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const siblings = index.children.get(selectedEntry.parentPath) ?? []
      const currentIndex = siblings.findIndex(
        (sibling) => sibling.path === selectedEntry.path
      )

      nextEntry = siblings[currentIndex + (event.key === "ArrowUp" ? -1 : 1)]
    } else if (event.key === "ArrowLeft") {
      if (selectedEntry.parentPath !== currentPath) {
        nextEntry = index.folders.get(selectedEntry.parentPath)
      }
    } else if (selectedEntry.kind === "folder") {
      nextEntry = index.children.get(selectedEntry.path)?.[0]
    }

    if (!nextEntry) return

    onSelect(nextEntry)

    const row = rowRefs.current.get(nextEntry.path)

    if (row) {
      pendingFocusPathRef.current = null
      row.focus()
    } else {
      pendingFocusPathRef.current = nextEntry.path
    }
    event.preventDefault()
  }

  React.useEffect(() => {
    const path = pendingFocusPathRef.current

    if (!path) return

    const row = rowRefs.current.get(path)

    if (row) {
      pendingFocusPathRef.current = null
      row.focus()
    }
  })

  const columnPaths = React.useMemo(() => {
    const paths = [currentPath]

    if (!deferredSelectedPath?.startsWith(currentPath)) return paths

    const targetFolder =
      deferredSelectedEntry?.kind === "folder"
        ? deferredSelectedEntry.path
        : (deferredSelectedEntry?.parentPath ?? currentPath)
    const relativePath = targetFolder.slice(currentPath.length)
    let walkedPath = currentPath

    for (const segment of relativePath.split("/")) {
      if (!segment) continue
      walkedPath = `${walkedPath}${segment}/`
      paths.push(walkedPath)
    }
    return paths
  }, [currentPath, deferredSelectedEntry, deferredSelectedPath])

  const tabStopPath = React.useMemo(() => {
    if (selectedPath) {
      for (const columnPath of columnPaths) {
        if (
          index.children
            .get(columnPath)
            ?.some((entry) => entry.path === selectedPath)
        ) {
          return selectedPath
        }
      }
    }
    return index.children.get(columnPaths[0] ?? "")?.[0]?.path ?? null
  }, [columnPaths, index, selectedPath])
  const selectedFile =
    deferredSelectedEntry?.kind === "file"
      ? (deferredSelectedEntry as FileEntry)
      : null
  const selectedFileSize = selectedFile
    ? formatByteSize(selectedFile.size)
    : null

  React.useEffect(() => {
    const container = scrollContainerRef.current

    if (container) container.scrollLeft = container.scrollWidth
  }, [columnPaths.length, deferredSelectedPath])

  return (
    <ScrollArea
      orientation="horizontal"
      viewportRef={scrollContainerRef}
      viewportClassName="overscroll-x-contain"
    >
      <ScrollAreaContent
        className="flex h-full w-max"
        style={{ minWidth: "100%" }}
        onKeyDown={handleKeyDown}
      >
        {columnPaths.map((columnPath, columnIndex) => (
          <FileSystemColumn
            key={columnPath || "(root)"}
            entries={index.children.get(columnPath) ?? []}
            index={index}
            isLoading={loadingFolders.has(columnPath)}
            onOpen={onOpen}
            onSelect={onSelect}
            rowRefs={rowRefs}
            selectedChildPath={
              selectedPath && pathParent(selectedPath) === columnPath
                ? selectedPath
                : null
            }
            tabStopChildPath={
              tabStopPath && pathParent(tabStopPath) === columnPath
                ? tabStopPath
                : null
            }
            trailChildPath={columnPaths[columnIndex + 1] ?? null}
          />
        ))}
        {selectedFile ? (
          <ScrollArea
            orientation="vertical"
            className="min-w-60 flex-1 contain-inline-size"
            viewportClassName="flex justify-center p-4"
          >
            <div className="flex w-full max-w-lg flex-col items-stretch gap-3">
              <div
                className="mx-auto w-full shrink-0"
                style={{
                  maxWidth: `min(100%, ${(selectedFile.previewAspectRatio ?? 0.78) * 20}rem)`,
                }}
              >
                <FileVisual
                  file={selectedFile}
                  className="w-full"
                  loadPreviewImageUrl={loadPreviewImageUrl}
                  pageable
                  pageUrlCache={pageUrlCache}
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold break-words">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fileKindLabel(selectedFile)}
                  {selectedFileSize ? ` - ${selectedFileSize}` : null}
                </div>
              </div>
              <FileSystemInformation entry={selectedFile} index={index} />
            </div>
          </ScrollArea>
        ) : null}
      </ScrollAreaContent>
    </ScrollArea>
  )
}

const COLUMN_PADDING = 6 // p-1.5
const COLUMN_ROW_HEIGHT = 28 // h-7
const COLUMN_ROW_GAP = 1 // gap-px
const COLUMN_ROW_STRIDE = COLUMN_ROW_HEIGHT + COLUMN_ROW_GAP

const FileSystemColumn = React.memo(function FileSystemColumn({
  entries,
  index,
  isLoading,
  onOpen,
  onSelect,
  rowRefs,
  selectedChildPath,
  tabStopChildPath,
  trailChildPath,
}: {
  entries: FileSystemEntry[]
  index: FileSystemIndex
  isLoading: boolean
  onOpen: (entry: FileSystemEntry) => void
  onSelect: (entry: FileSystemEntry | null) => void
  rowRefs: React.RefObject<Map<string, HTMLButtonElement>>
  selectedChildPath: string | null
  tabStopChildPath: string | null
  trailChildPath: string | null
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const { end, start } = useVirtualWindow({
    count: entries.length,
    itemStride: COLUMN_ROW_STRIDE,
    leadingPx: COLUMN_PADDING,
    overscan: 10,
    viewportRef,
  })

  React.useLayoutEffect(() => {
    if (!selectedChildPath) return

    scrollIndexIntoView({
      index: entries.findIndex((entry) => entry.path === selectedChildPath),
      itemSize: COLUMN_ROW_HEIGHT,
      itemStride: COLUMN_ROW_STRIDE,
      leadingPx: COLUMN_PADDING,
      viewport: viewportRef.current,
    })
  }, [entries, selectedChildPath])

  return (
    <ScrollArea
      orientation="vertical"
      className="w-60 shrink-0 border-r"
      viewportRef={viewportRef}
      viewportClassName="p-1.5"
      viewportProps={{ "aria-label": "Files", role: "listbox" }}
    >
      {isLoading && entries.length === 0 ? (
        <div className="animate-pulse px-2 py-1.5 text-xs text-muted-foreground motion-reduce:animate-none">
          Loading…
        </div>
      ) : (
        <div
          className="relative"
          style={{
            height: entries.length
              ? entries.length * COLUMN_ROW_STRIDE - COLUMN_ROW_GAP
              : undefined,
          }}
        >
          <div
            className="absolute inset-x-0 flex flex-col gap-px"
            style={{ top: start * COLUMN_ROW_STRIDE }}
          >
            {entries.slice(start, end).map((entry) => {
              const isSelected = entry.path === selectedChildPath
              const isOnTrail =
                entry.kind === "folder" && entry.path === trailChildPath

              const coverUrl =
                entry.kind === "file" ? filePreviewUrls(entry)[0] : undefined

              return (
                <button
                  key={entry.path}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-file-system-on-primary={isSelected ? "" : undefined}
                  tabIndex={entry.path === tabStopChildPath ? 0 : -1}
                  ref={(element) => {
                    if (element) {
                      rowRefs.current.set(entry.path, element)
                    } else {
                      rowRefs.current.delete(entry.path)
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse" && event.button === 0) {
                      onSelect(entry)
                    }
                  }}
                  onClick={() => onSelect(entry)}
                  onDoubleClick={() => onOpen(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpen(entry)
                  }}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isOnTrail
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                  )}
                >
                  {entry.kind === "folder" ? (
                    <FileSystemFolderGlyph className="h-3.5 w-auto shrink-0" />
                  ) : coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      draggable={false}
                      className="size-4 shrink-0 rounded-[3px] bg-white object-cover"
                    />
                  ) : (
                    <FileTypeIcon
                      fileName={entry.name}
                      className="size-4 shrink-0"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {entry.kind === "folder" &&
                  folderHasChildren(index, entry) ? (
                    <IconPlaceholder
                      lucide="ArrowRight"
                      tabler="IconArrowRight"
                      hugeicons="ArrowRight01Icon"
                      phosphor="ArrowRightIcon"
                      remixicon="RiArrowRightLine"
                      className={cn(
                        "size-3.5 shrink-0",
                        !isSelected && "text-muted-foreground/60"
                      )}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </ScrollArea>
  )
})
