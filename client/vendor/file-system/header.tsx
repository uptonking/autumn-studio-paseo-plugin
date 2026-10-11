import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs"
import { IconPlaceholder } from "../icon-placeholder"
import { cn } from "../lib/utils"
import type {
  FileSystemDateFilterType,
  FileSystemFilter,
  FileSystemFilterOperator,
  FileTypeFilterOption,
} from "./filter-types"
import {
  ArrowDown01Glyph,
  ArrowUp01Glyph,
  FileTypeIcon,
  RefreshGlyph,
  VIEW_OPTIONS,
} from "./icons"
import {
  FileSystemFilterMenu,
  FileSystemFilterPill,
  FileSystemSearchField,
  FileSystemSortSelect,
} from "./toolbar-controls"
import {
  TOOLBAR_ICON_BUTTON_CLASSNAME,
  type FileEntry,
  type FileSystemOpenMode,
  type FileSystemSortKey,
  type FileSystemSortState,
  type FileSystemView,
} from "./types"

export function FileSystemListColumnHeader({
  className,
  label,
  onClick,
  sort,
  sortKey,
}: {
  className?: string
  label: string
  onClick: (key: FileSystemSortKey) => void
  sort: FileSystemSortState
  sortKey: FileSystemSortKey
}) {
  const isActive = sort.key === sortKey

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "flex items-center gap-0.5 rounded-sm py-0.5 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "text-foreground",
        className
      )}
    >
      {label}
      {isActive ? (
        sort.direction === "asc" ? (
          <ArrowUp01Glyph className="size-3 shrink-0" />
        ) : (
          <ArrowDown01Glyph className="size-3 shrink-0" />
        )
      ) : null}
    </button>
  )
}

export function renderOpenModeMenuItems({
  currentMode,
  onOpenFileInNewTab,
  openFileWithMode,
  targetFile,
}: {
  currentMode: "in-place" | "dialog" | "tree"
  onOpenFileInNewTab?: (file: FileEntry, url: string) => void
  openFileWithMode: (file: FileEntry, mode?: FileSystemOpenMode) => void
  targetFile: FileEntry
}) {
  return (
    <>
      {currentMode !== "in-place" ? (
        <DropdownMenuItem
          onClick={() => openFileWithMode(targetFile, "in-place")}
        >
          <IconPlaceholder lucide="PanelLeft" className="size-4" />
          Open file in-place
        </DropdownMenuItem>
      ) : null}
      {currentMode !== "dialog" ? (
        <DropdownMenuItem
          onClick={() => openFileWithMode(targetFile, "dialog")}
        >
          <IconPlaceholder lucide="Maximize2" className="size-4" />
          Open file in dialog
        </DropdownMenuItem>
      ) : null}
      {onOpenFileInNewTab ? (
        <DropdownMenuItem
          onClick={() => openFileWithMode(targetFile, "new-tab")}
        >
          <IconPlaceholder lucide="ExternalLink" className="size-4" />
          Open file in new tab
        </DropdownMenuItem>
      ) : null}
    </>
  )
}

export function FileSystemInPlaceHeader({
  file,
  fileName,
  onBack,
  onOpenFileInNewTab,
  onOpenSettings,
  openFileWithMode,
}: {
  file: FileEntry
  fileName: string
  onBack: () => void
  onOpenFileInNewTab?: (file: FileEntry, url: string) => void
  onOpenSettings?: () => void
  openFileWithMode: (file: FileEntry, mode?: FileSystemOpenMode) => void
}) {
  return (
    <div
      data-slot="file-system-inplace-header"
      className="relative flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Back to file tree"
          title="Back to file tree"
          onClick={onBack}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconPlaceholder lucide="ArrowLeft" className="size-4" />
        </button>
        <FileTypeIcon fileName={fileName} className="size-4 shrink-0" />
        <span className="truncate text-sm font-semibold">{fileName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              className={TOOLBAR_ICON_BUTTON_CLASSNAME}
            >
              <IconPlaceholder lucide="Ellipsis" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {renderOpenModeMenuItems({
              currentMode: "in-place",
              onOpenFileInNewTab,
              openFileWithMode,
              targetFile: file,
            })}
            {onOpenSettings ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenSettings}>
                  <IconPlaceholder lucide="Settings" className="size-4" />
                  File Explorer settings
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function FileSystemToolbarHeader({
  applySortKey,
  canGoBack,
  canGoForward,
  currentFolderName,
  fileTypeOptions,
  filters,
  goBack,
  goForward,
  hasActiveFilters,
  headerLayout,
  isBelowIpadWidth,
  isSearchExpanded,
  onOpenFileInNewTab,
  onOpenSettings,
  onRefresh,
  openDateRangeDialog,
  openFileWithMode,
  searchInput,
  searchInputRef,
  selectedFileEntry,
  setDatePresetFilter,
  setFilters,
  setIsSearchExpanded,
  setSearchInput,
  setView,
  sort,
  toggleFileTypeFilterValue,
  view,
}: {
  applySortKey: (key: FileSystemSortKey) => void
  canGoBack: boolean
  canGoForward: boolean
  currentFolderName: string
  fileTypeOptions: FileTypeFilterOption[]
  filters: FileSystemFilter[]
  goBack: () => void
  goForward: () => void
  hasActiveFilters: boolean
  headerLayout: "full" | "compact" | "minimal"
  isBelowIpadWidth: boolean
  isSearchExpanded: boolean
  onOpenFileInNewTab?: (file: FileEntry, url: string) => void
  onOpenSettings?: () => void
  onRefresh?: () => void
  openDateRangeDialog: (type: FileSystemDateFilterType) => void
  openFileWithMode: (file: FileEntry, mode?: FileSystemOpenMode) => void
  searchInput: string
  searchInputRef: React.RefObject<HTMLInputElement | null>
  selectedFileEntry: FileEntry | null
  setDatePresetFilter: (type: FileSystemDateFilterType, preset: string) => void
  setFilters: React.Dispatch<React.SetStateAction<FileSystemFilter[]>>
  setIsSearchExpanded: (expanded: boolean) => void
  setSearchInput: (value: string) => void
  setView: (view: FileSystemView) => void
  sort: FileSystemSortState
  toggleFileTypeFilterValue: (mime: string, checked: boolean) => void
  view: FileSystemView
}) {
  const activeViewOption = VIEW_OPTIONS.find((option) => option.value === view)

  return (
    <>
      <div className="relative grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b bg-muted/40 px-2">
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Back"
            title="Back"
            disabled={!canGoBack}
            onClick={goBack}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <IconPlaceholder
              lucide="ChevronLeft"
              tabler="IconChevronLeft"
              hugeicons="ArrowLeft01Icon"
              phosphor="CaretLeftIcon"
              remixicon="RiArrowLeftSLine"
              className="size-4.5"
            />
          </button>
          <button
            type="button"
            aria-label="Forward"
            title="Forward"
            disabled={!canGoForward}
            onClick={goForward}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <IconPlaceholder
              lucide="ArrowRight"
              tabler="IconArrowRight"
              hugeicons="ArrowRight01Icon"
              phosphor="ArrowRightIcon"
              remixicon="RiArrowRightLine"
              className="size-4.5"
            />
          </button>
          {onRefresh ? (
            <button
              type="button"
              aria-label="Refresh"
              title="Refresh"
              onClick={onRefresh}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshGlyph className="size-3.5" />
            </button>
          ) : null}
          {headerLayout !== "minimal" ? (
            <span className="ml-1.5 truncate text-sm font-semibold">
              {currentFolderName}
            </span>
          ) : null}
        </div>
        {headerLayout !== "full" || isBelowIpadWidth ? (
          <Select
            value={view}
            onValueChange={(value) => setView(value as FileSystemView)}
          >
            <SelectTrigger
              size="sm"
              aria-label="View"
              className="h-7 min-h-7 w-auto min-w-0 [&_svg]:size-4"
            >
              <SelectValue>
                {activeViewOption ? (
                  <activeViewOption.icon className="size-4" />
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <option.icon className="size-4" />
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as FileSystemView)}
            className="gap-0"
          >
            <TabsList className="h-8 p-0.5">
              {VIEW_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  aria-label={`${option.label} view`}
                  title={option.label}
                  className="h-7 grow-0 px-2.5 sm:h-7"
                >
                  <option.icon className="size-4" />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <FileSystemSortSelect
            layout={headerLayout}
            onKeyChange={applySortKey}
            showLabel={!isBelowIpadWidth}
            sort={sort}
          />
          <FileSystemFilterMenu
            fileTypeOptions={fileTypeOptions}
            filters={filters}
            onOpenCustomRange={openDateRangeDialog}
            onSelectDatePreset={setDatePresetFilter}
            onToggleFileType={toggleFileTypeFilterValue}
          />
          <FileSystemSearchField
            inputRef={searchInputRef}
            isExpanded={isSearchExpanded}
            layout={headerLayout}
            onExpandedChange={setIsSearchExpanded}
            onValueChange={setSearchInput}
            value={searchInput}
          />
          {selectedFileEntry || onOpenSettings ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  title="More actions"
                  className={TOOLBAR_ICON_BUTTON_CLASSNAME}
                >
                  <IconPlaceholder lucide="Ellipsis" className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {selectedFileEntry
                  ? renderOpenModeMenuItems({
                      currentMode: "tree",
                      onOpenFileInNewTab,
                      openFileWithMode,
                      targetFile: selectedFileEntry,
                    })
                  : null}
                {selectedFileEntry && onOpenSettings ? (
                  <DropdownMenuSeparator />
                ) : null}
                {onOpenSettings ? (
                  <DropdownMenuItem onClick={onOpenSettings}>
                    <IconPlaceholder lucide="Settings" className="size-4" />
                    File Explorer settings
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      {hasActiveFilters ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
          {filters.map((filter) => {
            const dateFilterType =
              filter.type === "fileType" ? null : filter.type

            return (
              <FileSystemFilterPill
                key={filter.id}
                fileTypeOptions={fileTypeOptions}
                filter={filter}
                onOpenCustomRange={
                  dateFilterType
                    ? () => openDateRangeDialog(dateFilterType)
                    : undefined
                }
                onOperatorChange={(operator: FileSystemFilterOperator) =>
                  setFilters((previous) =>
                    previous.map((entry) =>
                      entry.id === filter.id ? { ...entry, operator } : entry
                    )
                  )
                }
                onRemove={() =>
                  setFilters((previous) =>
                    previous.filter((entry) => entry.id !== filter.id)
                  )
                }
                onSelectDatePreset={(preset) =>
                  setFilters((previous) =>
                    previous.map((entry) =>
                      entry.id === filter.id
                        ? {
                            ...entry,
                            operator:
                              entry.operator === "before" ||
                              entry.operator === "after"
                                ? entry.operator
                                : "after",
                            value: [preset],
                          }
                        : entry
                    )
                  )
                }
                onToggleFileType={toggleFileTypeFilterValue}
              />
            )
          })}
          <button
            type="button"
            onClick={() => setFilters([])}
            className="rounded-md px-1.5 py-0.5 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        </div>
      ) : null}
    </>
  )
}
