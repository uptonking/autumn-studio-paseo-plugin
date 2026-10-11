"use client"

import * as React from "react"

import { FileSystemColumnsView } from "./file-system/columns-view"
import { FileSystemDateRangeDialog } from "./file-system/date-range-dialog"
import { FileSystemEmptyState } from "./file-system/file-visual"
import { FileSystemGalleryView } from "./file-system/gallery-view"
import {
  FileSystemInPlaceHeader,
  FileSystemToolbarHeader,
} from "./file-system/header"
import { FileSystemIconSpriteSheet } from "./file-system/icons"
import { FileSystemIconsView } from "./file-system/icons-view"
import { FileSystemListView } from "./file-system/list-view"
import {
  buildFileSystemIndex,
  IPAD_MIN_WIDTH,
  normalizeFolderPath,
  pathName,
  viewerKindForFile,
  type FileEntry,
  type FileSystemEntry,
  type FileSystemItem,
  type FileSystemOpenMode,
  type FileSystemProps,
  type FileSystemView,
  type FileSystemViewerKind,
  type FileSystemViewProps,
} from "./file-system/types"
import { useFileSystemFilters } from "./file-system/use-file-system-filters"
import { useStagePool } from "./file-system/use-stage-pool"
import { FileSystemViewerDialogAndPool } from "./file-system/viewer-stage"
import { fileUrlCacheKey } from "./file-system/virtual-window"
import { cn } from "./lib/utils"

export type {
  FileSystemView,
  FileSystemFolderItem,
  FileSystemFileItem,
  FileSystemItem,
  FileSystemLoadChildrenArgs,
  FileSystemLoadChildrenResult,
  FileSystemOpenMode,
  FileSystemPdfSettings,
  FileSystemTextSettings,
  FileSystemProps,
  FileSystemSortKey,
} from "./file-system/types"
export type { FileSystemFilterType } from "./file-system/filter-types"

export function FileSystem({
  items,
  className,
  title = "Files",
  defaultView = "icons",
  view: viewProp,
  onViewChange,
  defaultFileOpenMode = "in-place",
  onOpenFileInNewTab,
  onOpenSettings,
  pdfSettings,
  textSettings,
  defaultPath = "",
  onSelectionChange,
  onFileOpen,
  onOpenUnsupported,
  onRefresh,
  getFileUrl,
  loadChildren,
  loadPreviewImageUrl,
  renderFilePreview,
}: FileSystemProps) {
  const [internalView, setInternalView] = React.useState(defaultView)
  React.useEffect(() => {
    if (viewProp === undefined) {
      setInternalView(defaultView)
    }
  }, [defaultView, viewProp])
  const view = viewProp ?? internalView
  const setView = React.useCallback(
    (nextView: FileSystemView) => {
      setInternalView(nextView)
      onViewChange?.(nextView)
    },
    [onViewChange]
  )

  const [loadedItems, setLoadedItems] = React.useState<FileSystemItem[]>([])
  const allItems = React.useMemo(
    () => (loadedItems.length ? [...items, ...loadedItems] : items),
    [items, loadedItems]
  )
  const index = React.useMemo(() => buildFileSystemIndex(allItems), [allItems])

  const [history, setHistory] = React.useState(() => ({
    index: 0,
    stack: [normalizeFolderPath(defaultPath)],
  }))
  const currentPath = history.stack[history.index] ?? ""
  const canGoBack = history.index > 0
  const canGoForward = history.index < history.stack.length - 1

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
  const selectedEntry = React.useMemo(() => {
    if (selectedPath === null) return null

    return (
      index.files.get(selectedPath) ?? index.folders.get(selectedPath) ?? null
    )
  }, [index, selectedPath])

  const {
    applyCustomDateRange,
    applySortKey,
    dateRangeDialog,
    fileFilter,
    fileTypeOptions,
    filters,
    hasActiveFilters,
    isSearchExpanded,
    isSearching,
    openDateRangeDialog,
    searchInput,
    searchInputRef,
    searchQuery,
    setDatePresetFilter,
    setDateRangeDialog,
    setFilters,
    setIsSearchExpanded,
    setSearchInput,
    sort,
    sortedIndex,
    toggleFileTypeFilterValue,
    toggleSortColumn,
    visiblePaths,
  } = useFileSystemFilters({ currentPath, index })

  const selectedPathRef = React.useRef<string | null>(null)
  const selectEntry = React.useCallback(
    (entry: FileSystemEntry | null) => {
      const path = entry?.path ?? null

      if (selectedPathRef.current === path) return
      selectedPathRef.current = path
      setSelectedPath(path)
      onSelectionChange?.(entry)
    },
    [onSelectionChange]
  )

  React.useEffect(() => {
    if (!visiblePaths || !selectedPath) return
    if (!visiblePaths.has(selectedPath)) selectEntry(null)
  }, [selectEntry, selectedPath, visiblePaths])

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [headerLayout, setHeaderLayout] = React.useState<
    "full" | "compact" | "minimal"
  >("full")
  const [isBelowIpadWidth, setIsBelowIpadWidth] = React.useState(false)

  React.useEffect(() => {
    const root = rootRef.current

    if (!root || typeof ResizeObserver === "undefined") return

    const applyWidth = (width: number | undefined) => {
      if (width === undefined) return

      setHeaderLayout(
        width < 360 ? "minimal" : width < 560 ? "compact" : "full"
      )
      setIsBelowIpadWidth(width < IPAD_MIN_WIDTH)
    }
    const observer = new ResizeObserver((observerEntries) =>
      applyWidth(observerEntries[0]?.contentRect.width)
    )

    applyWidth(root.clientWidth)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const requestedFoldersRef = React.useRef(new Set<string>())
  const [loadingFolders, setLoadingFolders] = React.useState<Set<string>>(
    () => new Set()
  )
  const ensureChildren = React.useCallback(
    (folderPath: string) => {
      if (!loadChildren) return

      const folder = index.folders.get(folderPath)

      if (!folder?.hasChildren) return
      if (index.children.get(folderPath)?.length) return
      if (requestedFoldersRef.current.has(folderPath)) return

      requestedFoldersRef.current.add(folderPath)
      setLoadingFolders((previous) => new Set(previous).add(folderPath))

      void (async () => {
        try {
          let cursor: string | null = null

          do {
            const result = await loadChildren({ cursor, path: folderPath })

            if (result.items.length) {
              setLoadedItems((previous) => [...previous, ...result.items])
            }
            cursor = result.nextCursor ?? null
          } while (cursor)
        } catch {
          requestedFoldersRef.current.delete(folderPath)
        } finally {
          setLoadingFolders((previous) => {
            const next = new Set(previous)

            next.delete(folderPath)
            return next
          })
        }
      })()
    },
    [index, loadChildren]
  )

  const navigateTo = React.useCallback(
    (folderPath: string) => {
      const path = normalizeFolderPath(folderPath)

      setHistory((previous) => {
        if (previous.stack[previous.index] === path) return previous

        const stack = [...previous.stack.slice(0, previous.index + 1), path]

        return { index: stack.length - 1, stack }
      })
      setSearchInput("")
      selectEntry(null)
      ensureChildren(path)
    },
    [ensureChildren, selectEntry, setSearchInput]
  )

  React.useEffect(() => {
    ensureChildren(currentPath)
  }, [currentPath, ensureChildren])

  const previousPathRef = React.useRef(currentPath)

  React.useEffect(() => {
    if (previousPathRef.current === currentPath) return

    previousPathRef.current = currentPath
    const root = rootRef.current

    if (root && document.activeElement === document.body) {
      root.focus({ preventScroll: true })
    }
  }, [currentPath])

  const [openedFile, setOpenedFile] = React.useState<{
    file: FileEntry
    kind: FileSystemViewerKind
    mode: "in-place" | "dialog"
    url: string
  } | null>(null)

  const [resolvedUrlCache] = React.useState(() => new Map<string, string>())
  const [pageUrlCache] = React.useState(() => new Map<string, string>())

  const {
    attachedStagePaths,
    dialogStageHostRef,
    inPlaceStageHostRef,
    poolStagePath,
    registerStageHost,
    stageContainers,
    stagePool,
  } = useStagePool({ index, openedFile })

  const openFileWithMode = React.useCallback(
    (file: FileEntry, modeOverride?: FileSystemOpenMode) => {
      void (async () => {
        const cacheKey = fileUrlCacheKey(file)
        let url = file.url ?? resolvedUrlCache.get(cacheKey) ?? null
        let fetchError: string | undefined

        if (!url && getFileUrl) {
          try {
            url = await getFileUrl(file)
            if (url) resolvedUrlCache.set(cacheKey, url)
          } catch (err) {
            url = null
            fetchError = err instanceof Error ? err.message : String(err)
          }
        }
        if (onFileOpen && !modeOverride) {
          onFileOpen(file, url)
          return
        }

        const kind = viewerKindForFile(file)
        const effectiveMode = modeOverride ?? defaultFileOpenMode

        if (kind && url) {
          if (effectiveMode === "new-tab" && onOpenFileInNewTab) {
            setOpenedFile((previous) =>
              previous?.file.path === file.path ? null : previous
            )
            onOpenFileInNewTab(file, url)
            return
          }

          const targetMode = effectiveMode === "dialog" ? "dialog" : "in-place"
          poolStagePath(file.path)
          setOpenedFile({ file, kind, mode: targetMode, url })
        } else if (onOpenUnsupported) {
          onOpenUnsupported(file, fetchError)
        } else if (url && typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer")
        }
      })()
    },
    [
      defaultFileOpenMode,
      getFileUrl,
      onFileOpen,
      onOpenFileInNewTab,
      onOpenUnsupported,
      poolStagePath,
      resolvedUrlCache,
    ]
  )

  const openEntry = React.useCallback(
    (entry: FileSystemEntry) => {
      if (entry.kind === "folder") {
        navigateTo(entry.path)
      } else {
        openFileWithMode(entry)
      }
    },
    [navigateTo, openFileWithMode]
  )

  const selectAndPrefetchEntry = React.useCallback(
    (entry: FileSystemEntry | null) => {
      selectEntry(entry)
      if (entry?.kind === "folder") ensureChildren(entry.path)
    },
    [ensureChildren, selectEntry]
  )

  const goBack = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.max(0, previous.index - 1),
    }))
    setSearchInput("")
    selectEntry(null)
  }, [selectEntry, setSearchInput])

  const goForward = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.min(previous.stack.length - 1, previous.index + 1),
    }))
    setSearchInput("")
    selectEntry(null)
  }, [selectEntry, setSearchInput])

  const currentEntries = sortedIndex.children.get(currentPath) ?? []
  const currentFolderName =
    currentPath === "" ? title : pathName(currentPath) || title
  const isLoadingCurrentFolder = loadingFolders.has(currentPath)
  const treeExpansionRef = React.useRef(new Map<string, readonly string[]>())

  const viewProps: FileSystemViewProps = {
    attachedStagePaths,
    currentPath,
    entries: currentEntries,
    fileFilter,
    getFileUrl,
    headerLayout,
    index: sortedIndex,
    loadPreviewImageUrl,
    loadingFolders,
    onOpen: openEntry,
    onSelect: selectAndPrefetchEntry,
    onSortColumnClick: toggleSortColumn,
    pageUrlCache,
    poolStagePath,
    registerStageHost,
    renderFilePreview,
    searchQuery,
    selectedEntry,
    selectedPath,
    sort,
    treeExpansionRef,
  }

  const openedFileName = openedFile
    ? (openedFile.file.name ?? openedFile.file.path)
    : ""
  const isOpenedInPlace = openedFile?.mode === "in-place"
  const selectedFileEntry =
    selectedEntry?.kind === "file" ? selectedEntry : null

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-slot="file-system"
      onKeyDown={(event) => {
        if (
          !isOpenedInPlace &&
          (event.metaKey || event.ctrlKey) &&
          event.key === "f"
        ) {
          event.preventDefault()
          setIsSearchExpanded(true)
          searchInputRef.current?.focus()
        } else if (
          isOpenedInPlace &&
          event.key === "Backspace" &&
          (event.metaKey || event.altKey)
        ) {
          event.preventDefault()
          setOpenedFile(null)
        }
      }}
      className={cn(
        "flex h-[480px] min-h-0 flex-col overflow-hidden rounded-xl border bg-background text-foreground outline-none",
        className
      )}
    >
      <FileSystemIconSpriteSheet />
      {isOpenedInPlace && openedFile ? (
        <>
          <FileSystemInPlaceHeader
            file={openedFile.file}
            fileName={openedFileName}
            onBack={() => setOpenedFile(null)}
            onOpenFileInNewTab={onOpenFileInNewTab}
            onOpenSettings={onOpenSettings}
            openFileWithMode={openFileWithMode}
          />
          <div
            data-slot="file-system-inplace-stage"
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
          >
            <div
              ref={inPlaceStageHostRef}
              className="flex size-full min-h-0 flex-1 flex-col"
            />
          </div>
        </>
      ) : (
        <>
          <FileSystemToolbarHeader
            applySortKey={applySortKey}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            currentFolderName={currentFolderName}
            fileTypeOptions={fileTypeOptions}
            filters={filters}
            goBack={goBack}
            goForward={goForward}
            hasActiveFilters={hasActiveFilters}
            headerLayout={headerLayout}
            isBelowIpadWidth={isBelowIpadWidth}
            isSearchExpanded={isSearchExpanded}
            onOpenFileInNewTab={onOpenFileInNewTab}
            onOpenSettings={onOpenSettings}
            onRefresh={onRefresh}
            openDateRangeDialog={openDateRangeDialog}
            openFileWithMode={openFileWithMode}
            searchInput={searchInput}
            searchInputRef={searchInputRef}
            selectedFileEntry={selectedFileEntry}
            setDatePresetFilter={setDatePresetFilter}
            setFilters={setFilters}
            setIsSearchExpanded={setIsSearchExpanded}
            setSearchInput={setSearchInput}
            setView={setView}
            sort={sort}
            toggleFileTypeFilterValue={toggleFileTypeFilterValue}
            view={view}
          />
          <div className="relative min-h-0 flex-1">
            {isLoadingCurrentFolder && currentEntries.length === 0 ? (
              <FileSystemEmptyState label="Loading…" isLoading />
            ) : currentEntries.length === 0 &&
              (view !== "columns" || isSearching || hasActiveFilters) ? (
              <FileSystemEmptyState
                label={
                  isSearching
                    ? `No results for “${searchInput.trim()}”`
                    : hasActiveFilters
                      ? "No items match the active filters"
                      : "This folder is empty"
                }
              />
            ) : view === "icons" ? (
              <FileSystemIconsView {...viewProps} />
            ) : view === "list" ? (
              <FileSystemListView {...viewProps} />
            ) : view === "columns" ? (
              <FileSystemColumnsView {...viewProps} />
            ) : (
              <FileSystemGalleryView {...viewProps} />
            )}
          </div>
          <div
            aria-live="polite"
            className="flex h-7 shrink-0 items-center justify-center gap-1 border-t bg-muted/40 px-3 text-xs text-muted-foreground"
          >
            <span>
              {currentEntries.length}{" "}
              {isSearching
                ? currentEntries.length === 1
                  ? "result"
                  : "results"
                : currentEntries.length === 1
                  ? "item"
                  : "items"}
            </span>
            {selectedEntry ? (
              <span>· “{selectedEntry.name}” selected</span>
            ) : null}
          </div>
        </>
      )}
      <FileSystemViewerDialogAndPool
        dialogStageHostRef={dialogStageHostRef}
        getFileUrl={getFileUrl}
        index={index}
        loadPreviewImageUrl={loadPreviewImageUrl}
        onCloseDialog={() => setOpenedFile(null)}
        onOpenFileInNewTab={onOpenFileInNewTab}
        openedFile={openedFile}
        openedFileName={openedFileName}
        openFileWithMode={openFileWithMode}
        pageUrlCache={pageUrlCache}
        pdfSettings={pdfSettings}
        renderFilePreview={renderFilePreview}
        resolvedUrlCache={resolvedUrlCache}
        stageContainers={stageContainers}
        stagePool={stagePool}
        textSettings={textSettings}
      />
      {dateRangeDialog ? (
        <FileSystemDateRangeDialog
          initialRange={dateRangeDialog.initialRange}
          onApply={(from, to) => {
            applyCustomDateRange(dateRangeDialog.type, from, to)
            setDateRangeDialog(null)
          }}
          onClose={() => setDateRangeDialog(null)}
        />
      ) : null}
    </div>
  )
}
