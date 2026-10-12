import * as React from "react"
import { prepareFileTreeInput } from "@pierre/trees"
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react"

import { FileSystemEmptyState } from "./file-visual"
import { FileSystemListColumnHeader } from "./header"
import {
  buildFileTreeIconConfig,
  buildFileTreeUnsafeCss,
  createFileTreeSortComparator,
  FILE_TREE_STYLE_VARS,
  renderFileTreeRowDecoration,
} from "./tree-helpers"
import {
  directoryPathsOf,
  normalizeFolderPath,
  type FileSystemEntry,
  type FileSystemIndex,
  type FileSystemSortState,
  type FileSystemViewProps,
} from "./types"
import { isTypeAheadKey, useEntryTypeAhead } from "./virtual-window"

export function FileSystemListView({
  currentPath,
  fileFilter,
  headerLayout = "full",
  index,
  onOpen,
  onSelect,
  onSortColumnClick,
  searchQuery,
  selectedPath,
  sort,
  treeExpansionRef,
}: FileSystemViewProps) {
  const relativePaths = React.useMemo(() => {
    const paths: string[] = []

    for (const [path, file] of index.files) {
      if (currentPath === "" || path.startsWith(currentPath)) {
        const relativePath = path.slice(currentPath.length)

        if (!relativePath) continue
        if (fileFilter && !fileFilter(file)) continue
        paths.push(relativePath)
      }
    }
    return paths.sort()
  }, [currentPath, fileFilter, index])

  if (relativePaths.length === 0) {
    return (
      <FileSystemEmptyState
        label={
          fileFilter
            ? "No items match the active filters"
            : "This folder is empty"
        }
      />
    )
  }

  return (
    <div className="flex size-full flex-col">
      <div className="flex shrink-0 items-center border-b py-1 pr-6 pl-[46px] text-xs font-medium text-muted-foreground">
        <FileSystemListColumnHeader
          className="flex-1 justify-start"
          label="Name"
          onClick={onSortColumnClick}
          sort={sort}
          sortKey="name"
        />
        {headerLayout === "full" ? (
          <>
            <FileSystemListColumnHeader
              className="w-44 justify-start"
              label="Date Modified"
              onClick={onSortColumnClick}
              sort={sort}
              sortKey="updatedAt"
            />
            <FileSystemListColumnHeader
              className="w-20 justify-start"
              label="Size"
              onClick={onSortColumnClick}
              sort={sort}
              sortKey="size"
            />
          </>
        ) : null}
      </div>
      <FileSystemPierreTree
        key={currentPath}
        currentPath={currentPath}
        hasActiveFilters={fileFilter !== null}
        headerLayout={headerLayout}
        index={index}
        initialSelectedPath={
          selectedPath?.startsWith(currentPath)
            ? selectedPath.slice(currentPath.length).replace(/\/$/, "")
            : null
        }
        onOpen={onOpen}
        onSelect={onSelect}
        relativePaths={relativePaths}
        searchQuery={searchQuery}
        sort={sort}
        treeExpansionRef={treeExpansionRef}
      />
    </div>
  )
}

function FileSystemPierreTree({
  currentPath,
  hasActiveFilters,
  headerLayout = "full",
  index,
  initialSelectedPath,
  onOpen,
  onSelect,
  relativePaths,
  searchQuery,
  sort,
  treeExpansionRef,
}: {
  currentPath: string
  hasActiveFilters: boolean
  headerLayout?: "full" | "compact" | "minimal"
  index: FileSystemIndex
  initialSelectedPath: string | null
  onOpen: (entry: FileSystemEntry) => void
  onSelect: (entry: FileSystemEntry | null) => void
  relativePaths: string[]
  searchQuery: string
  sort: FileSystemSortState
  treeExpansionRef: React.RefObject<Map<string, readonly string[]>>
}) {
  const sortComparator = React.useMemo(
    () => createFileTreeSortComparator(currentPath, index, sort),
    [currentPath, index, sort]
  )
  const preparedInput = React.useMemo(
    () => prepareFileTreeInput(relativePaths, { sort: sortComparator }),
    [relativePaths, sortComparator]
  )
  const icons = React.useMemo(
    () => buildFileTreeIconConfig(currentPath, index, relativePaths),
    [currentPath, index, relativePaths]
  )
  const { model } = useFileTree({
    flattenEmptyDirectories: false,
    icons,
    initialExpansion: "closed",
    initialSearchQuery: searchQuery || null,
    initialSelectedPaths: initialSelectedPath ? [initialSelectedPath] : [],
    itemHeight: 28,
    overscan: 12,
    preparedInput,
    renderRowDecoration:
      headerLayout === "full"
        ? ({ row }) => renderFileTreeRowDecoration(currentPath, index, row)
        : undefined,
    unsafeCSS: buildFileTreeUnsafeCss(headerLayout),
    onSelectionChange: (selectedPaths) => {
      const relativePath = selectedPaths[0]

      if (!relativePath) {
        onSelect(null)
        return
      }

      const absolutePath = `${currentPath}${relativePath}`
      const entry =
        index.files.get(absolutePath) ??
        index.folders.get(normalizeFolderPath(absolutePath)) ??
        null

      onSelect(entry)
    },
  })

  React.useEffect(() => {
    model.setIcons(icons)
  }, [icons, model])

  const collectExpandedDirectories = React.useCallback(
    (paths: readonly string[]) => {
      const expandedPaths: string[] = []

      for (const directoryPath of directoryPathsOf(paths)) {
        const item =
          model.getItem(directoryPath) ?? model.getItem(`${directoryPath}/`)

        if (item && "isExpanded" in item && item.isExpanded()) {
          expandedPaths.push(directoryPath)
        }
      }
      return expandedPaths
    },
    [model]
  )

  const expandDirectories = React.useCallback(
    (directoryPaths: Iterable<string>) => {
      for (const directoryPath of directoryPaths) {
        const item =
          model.getItem(directoryPath) ?? model.getItem(`${directoryPath}/`)

        if (item && "isExpanded" in item && !item.isExpanded()) {
          item.toggle()
        }
      }
    },
    [model]
  )

  const appliedPreparedInputRef = React.useRef(preparedInput)
  const hasActiveFiltersRef = React.useRef(hasActiveFilters)
  const filteredAtLastResetRef = React.useRef(hasActiveFilters)
  const preFilterExpansionRef = React.useRef<readonly string[] | null>(null)

  React.useEffect(() => {
    hasActiveFiltersRef.current = hasActiveFilters
  })

  React.useEffect(() => {
    const previousPreparedInput = appliedPreparedInputRef.current

    if (previousPreparedInput === preparedInput) return
    appliedPreparedInputRef.current = preparedInput

    const wasFiltered = filteredAtLastResetRef.current

    filteredAtLastResetRef.current = hasActiveFilters

    let expandedPaths: readonly string[]

    if (hasActiveFilters) {
      if (!wasFiltered) {
        preFilterExpansionRef.current = collectExpandedDirectories(
          previousPreparedInput.paths
        )
      }
      expandedPaths = [...directoryPathsOf(preparedInput.paths)]
    } else if (wasFiltered) {
      expandedPaths = preFilterExpansionRef.current ?? []
      preFilterExpansionRef.current = null
    } else {
      expandedPaths = collectExpandedDirectories(previousPreparedInput.paths)
    }

    const searchValue = model.getSearchValue()

    model.resetPaths(undefined as unknown as readonly string[], {
      initialExpandedPaths: expandedPaths,
      preparedInput,
    })
    if (searchValue) model.setSearch(searchValue)
  }, [collectExpandedDirectories, hasActiveFilters, model, preparedInput])

  React.useLayoutEffect(() => {
    const expansionStore = treeExpansionRef.current
    const savedExpansion = expansionStore.get(currentPath) ?? []

    if (hasActiveFiltersRef.current) {
      preFilterExpansionRef.current = savedExpansion
      expandDirectories(directoryPathsOf(appliedPreparedInputRef.current.paths))
    } else {
      expandDirectories(savedExpansion)
    }

    return () => {
      expansionStore.set(
        currentPath,
        hasActiveFiltersRef.current
          ? (preFilterExpansionRef.current ?? [])
          : collectExpandedDirectories(appliedPreparedInputRef.current.paths)
      )
    }
  }, [
    collectExpandedDirectories,
    currentPath,
    expandDirectories,
    treeExpansionRef,
  ])

  React.useEffect(() => {
    model.setSearch(searchQuery || null)
  }, [model, searchQuery])

  React.useEffect(() => {
    let lastFocusedPath = model.getFocusedPath()

    return model.subscribe(() => {
      const focusedPath = model.getFocusedPath()

      if (focusedPath === lastFocusedPath) return

      lastFocusedPath = focusedPath

      if (!focusedPath) return

      const item = model.getItem(focusedPath)

      if (!item || item.isSelected()) return

      for (const path of model.getSelectedPaths()) {
        model.getItem(path)?.deselect()
      }
      item.select()
    })
  }, [model])

  const entryFromEvent = (event: React.SyntheticEvent) => {
    for (const target of event.nativeEvent.composedPath()) {
      if (!(target instanceof HTMLElement)) continue

      const relativePath = target.dataset?.itemPath

      if (!relativePath) continue

      const absolutePath = `${currentPath}${relativePath}`

      return (
        index.files.get(absolutePath) ??
        index.folders.get(normalizeFolderPath(absolutePath)) ??
        null
      )
    }
    return null
  }

  const resolveTreeItem = (relativePath: string) =>
    model.getItem(relativePath) ??
    model.getItem(
      relativePath.endsWith("/")
        ? relativePath.slice(0, -1)
        : `${relativePath}/`
    )

  const collectVisibleEntries = () => {
    const visibleEntries: FileSystemEntry[] = []
    const walk = (folderPath: string) => {
      const children = index.children.get(folderPath) ?? []

      for (const child of children) {
        if (child.kind !== "folder") continue

        const item = resolveTreeItem(child.path.slice(currentPath.length))

        if (!item) continue
        visibleEntries.push(child)
        if ("isExpanded" in item && item.isExpanded()) walk(child.path)
      }
      for (const child of children) {
        if (child.kind === "file") visibleEntries.push(child)
      }
    }

    walk(currentPath)
    return visibleEntries
  }

  const typeAhead = useEntryTypeAhead()

  return (
    <PierreFileTree
      model={model}
      className="block min-h-0 flex-1"
      onClick={(event) => {
        const entry = entryFromEvent(event)

        if (entry?.kind === "file") onOpen(entry)
      }}
      onDoubleClick={(event) => {
        const entry = entryFromEvent(event)

        if (entry) onOpen(entry)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          const entry = entryFromEvent(event)

          if (entry) {
            event.preventDefault()
            onOpen(entry)
          }
          return
        }

        if (!isTypeAheadKey(event)) return

        const visibleEntries = collectVisibleEntries()
        const focusedPath = model.getFocusedPath()?.replace(/\/$/, "") ?? null
        const focusedIndex = visibleEntries.findIndex(
          (entry) =>
            entry.path.slice(currentPath.length).replace(/\/$/, "") ===
            focusedPath
        )
        const match = typeAhead(event, visibleEntries, focusedIndex)

        if (!match) return

        const item = resolveTreeItem(match.path.slice(currentPath.length))

        if (item) {
          model.scrollToPath(item.getPath())
          item.focus()
        }
      }}
      style={FILE_TREE_STYLE_VARS}
    />
  )
}
