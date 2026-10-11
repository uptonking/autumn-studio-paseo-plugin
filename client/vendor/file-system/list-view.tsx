import * as React from "react"
import {
  prepareFileTreeInput,
  type FileTreeSortComparator,
  type FileTreeSortEntry,
} from "@pierre/trees"
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react"

import { FileSystemEmptyState } from "./file-visual"
import { FileSystemListColumnHeader } from "./header"
import { FOLDER_GLYPH_DATA_URL } from "./icons"
import {
  compareEntriesBySort,
  DEFAULT_SORT,
  directoryPathsOf,
  escapeXmlAttribute,
  filePreviewUrls,
  formatByteSize,
  formatTimestamp,
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

const TREE_THUMBNAIL_SPRITE_LIMIT = 400

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
  const indexFiles = index.files
  const indexFolders = index.folders
  const sortComparator = React.useMemo<
    "default" | FileTreeSortComparator
  >(() => {
    if (
      sort.key === DEFAULT_SORT.key &&
      sort.direction === DEFAULT_SORT.direction
    ) {
      return "default"
    }

    const entryAtDepth = (sortEntry: FileTreeSortEntry, depth: number) => {
      const isDirectory =
        depth < sortEntry.segments.length - 1 || sortEntry.isDirectory
      const absolutePath = `${currentPath}${sortEntry.segments
        .slice(0, depth + 1)
        .join("/")}${isDirectory ? "/" : ""}`

      return isDirectory
        ? indexFolders.get(absolutePath)
        : indexFiles.get(absolutePath)
    }

    return (left, right) => {
      const sharedDepth = Math.min(left.segments.length, right.segments.length)

      for (let depth = 0; depth < sharedDepth; depth += 1) {
        if (left.segments[depth] === right.segments[depth]) continue

        const leftIsDirectory =
          depth < left.segments.length - 1 || left.isDirectory
        const rightIsDirectory =
          depth < right.segments.length - 1 || right.isDirectory

        if (leftIsDirectory !== rightIsDirectory) {
          return leftIsDirectory ? -1 : 1
        }

        const leftEntry = entryAtDepth(left, depth)
        const rightEntry = entryAtDepth(right, depth)

        if (leftEntry && rightEntry) {
          return compareEntriesBySort(leftEntry, rightEntry, sort)
        }
        return left.segments[depth] < right.segments[depth] ? -1 : 1
      }
      return left.segments.length - right.segments.length
    }
  }, [currentPath, indexFiles, indexFolders, sort])
  const preparedInput = React.useMemo(
    () => prepareFileTreeInput(relativePaths, { sort: sortComparator }),
    [relativePaths, sortComparator]
  )
  const icons = React.useMemo(() => {
    const byFileName: Record<string, { name: string; viewBox: string }> = {}
    const symbols: string[] = [
      `<symbol id="file-system-chevron" viewBox="0 0 24 24"><path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></symbol>`,
    ]

    let thumbnailCount = 0

    for (const relativePath of relativePaths) {
      if (thumbnailCount >= TREE_THUMBNAIL_SPRITE_LIMIT) break

      const file = index.files.get(`${currentPath}${relativePath}`)
      const coverUrl = file ? filePreviewUrls(file)[0] : undefined

      if (!file || !coverUrl) continue

      const baseName = file.name.toLowerCase()

      if (byFileName[baseName]) continue

      const symbolId = `file-system-thumbnail-${symbols.length}`

      symbols.push(
        `<symbol id="${symbolId}" viewBox="0 0 16 16"><clipPath id="${symbolId}-clip"><rect width="16" height="16" rx="2.5"/></clipPath><image href="${escapeXmlAttribute(coverUrl)}" width="16" height="16" preserveAspectRatio="xMidYMid slice" clip-path="url(#${symbolId}-clip)"/></symbol>`
      )
      byFileName[baseName] = { name: symbolId, viewBox: "0 0 16 16" }
      thumbnailCount += 1
    }

    return {
      byFileName,
      colored: true,
      remap: {
        "file-tree-icon-chevron": {
          name: "file-system-chevron",
          viewBox: "0 0 24 24",
        },
      },
      set: "complete" as const,
      spriteSheet: `<svg data-icon-sprite aria-hidden="true" width="0" height="0">${symbols.join("")}</svg>`,
    }
  }, [currentPath, index, relativePaths])
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
        ? ({ row }) => {
            const entry =
              row.kind === "file"
                ? index.files.get(`${currentPath}${row.path}`)
                : index.folders.get(
                    normalizeFolderPath(`${currentPath}${row.path}`)
                  )

            if (!entry) return null

            const dateColumn =
              formatTimestamp(entry.updatedAt ?? entry.createdAt) ?? "—"

            if (entry.kind === "folder") {
              const childCount = index.children.get(entry.path)?.length

              return {
                text:
                  childCount === undefined
                    ? "—"
                    : `${childCount} ${childCount === 1 ? "item" : "items"}`,
                title: dateColumn,
              }
            }

            return {
              text: formatByteSize(entry.size) ?? "—",
              title: dateColumn,
            }
          }
        : undefined,
    unsafeCSS: `
      button[data-type='item']:not([data-item-selected]):hover {
        background: color-mix(in oklab, var(--color-accent) 50%, transparent);
      }
      button[data-type='item'][data-item-selected] {
        background: var(--color-primary);
        color: var(--color-primary-foreground);
        color-scheme: var(--fs-selected-color-scheme, normal);
      }
      button[data-type='item'][data-item-selected] *:not([data-icon-token]):not([data-icon-token] *),
      button[data-type='item'][data-item-selected] [data-item-section]::before {
        color: var(--color-primary-foreground) !important;
      }
      ${
        headerLayout === "full"
          ? `
      [data-item-section='decoration'] > span {
        display: grid;
        grid-template-columns: 11rem 5rem;
        white-space: nowrap;
        text-align: right;
      }
      [data-item-section='decoration'] > span::before {
        content: attr(title);
        text-align: left;
      }
      `
          : `
      [data-item-section='decoration'] {
        display: none !important;
      }
      `
      }
      button[data-type='item'][data-item-type='folder'] [data-item-section='content'] {
        display: flex;
        align-items: center;
        min-width: 0;
      }
      button[data-type='item'][data-item-type='folder'] [data-item-section='content']::before {
        content: "";
        flex: none;
        width: 18px;
        height: 14px;
        margin-right: 4px;
        background: url("${FOLDER_GLYPH_DATA_URL}") center / contain no-repeat;
      }
    `,
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
      style={
        {
          "--trees-bg-override": "transparent",
          "--trees-border-color-override": "var(--color-border)",
          "--trees-fg-override": "var(--color-foreground)",
          "--trees-focus-ring-color-override": "var(--color-ring)",
          "--trees-focus-ring-width-override": "2px",
          "--trees-selected-bg-override": "var(--color-primary)",
          "--trees-selected-focused-border-color-override": "var(--color-ring)",
        } as React.CSSProperties
      }
    />
  )
}
