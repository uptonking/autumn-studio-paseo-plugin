import * as React from "react"
import { ZoomMode } from "@embedpdf/plugin-zoom/react"

import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { Input } from "../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"
import { Separator } from "../components/ui/separator"
import { Spinner } from "../components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import { DocumentViewerSidebarSkeleton } from "../document-viewer-sidebar"
import { IconPlaceholder } from "../icon-placeholder"
import {
  isZoomMode,
  THUMBNAIL_SIDEBAR_WIDTH_CLASS,
  ZOOM_MODE_LABELS,
  ZOOM_OPTIONS,
} from "./types"

export function ToolbarTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function PDFViewerLoadingSkeleton({
  sidebarOpen,
  sidebarInline,
}: {
  sidebarOpen: boolean
  sidebarInline: boolean
}) {
  return (
    <div className="absolute inset-0 z-20 flex bg-muted/30">
      {sidebarOpen ? (
        <DocumentViewerSidebarSkeleton
          className={THUMBNAIL_SIDEBAR_WIDTH_CLASS}
          inline={sidebarInline}
        />
      ) : null}
      <div className="grid min-w-0 flex-1 place-items-center">
        <Spinner className="size-4" />
      </div>
    </div>
  )
}

export function PDFViewerFileActionsMenu({
  downloadDisabled,
  extraMenuItems,
  isPreparingDownload = false,
  onDownload,
  onUploadFile,
  showDownload = false,
  showUpload = false,
}: {
  downloadDisabled?: boolean
  extraMenuItems?: React.ReactNode
  isPreparingDownload?: boolean
  onDownload?: () => void
  onUploadFile?: (file: File) => void
  showDownload?: boolean
  showUpload?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hasBuiltInItems = showDownload || Boolean(showUpload && onUploadFile)

  if (!hasBuiltInItems && !extraMenuItems) return null

  return (
    <>
      {showUpload && onUploadFile ? (
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const nextFile = event.target.files?.[0]

            if (nextFile) {
              onUploadFile(nextFile)
              event.currentTarget.value = ""
            }
          }}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open PDF actions"
          >
            <IconPlaceholder
              lucide="Ellipsis"
              tabler="IconDots"
              hugeicons="MoreHorizontalIcon"
              phosphor="DotsThreeIcon"
              remixicon="RiMoreLine"
              className="size-4"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {extraMenuItems}
          {extraMenuItems && hasBuiltInItems ? <DropdownMenuSeparator /> : null}
          {showDownload ? (
            <DropdownMenuItem disabled={downloadDisabled} onClick={onDownload}>
              {isPreparingDownload ? (
                <Spinner className="size-4" />
              ) : (
                <IconPlaceholder
                  lucide="Download"
                  tabler="IconDownload"
                  hugeicons="Download01Icon"
                  phosphor="DownloadSimpleIcon"
                  remixicon="RiDownload2Line"
                  className="size-4"
                />
              )}
              Download
            </DropdownMenuItem>
          ) : null}
          {showUpload && onUploadFile ? (
            <DropdownMenuItem onClick={() => inputRef.current?.click()}>
              <IconPlaceholder
                lucide="Upload"
                tabler="IconUpload"
                hugeicons="Upload01Icon"
                phosphor="UploadSimpleIcon"
                remixicon="RiUpload2Line"
                className="size-4"
              />
              Upload
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function PDFViewerPageNumberControl({
  activePage,
  controlsDisabled,
  numPages,
  onPageChange,
}: {
  activePage: number
  controlsDisabled: boolean
  numPages: number
  onPageChange: (pageNumber: number) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const displayPage = numPages ? activePage : 1
  const [isEditing, setIsEditing] = React.useState(false)
  const [draftPage, setDraftPage] = React.useState(() => String(displayPage))

  React.useEffect(() => {
    if (!isEditing) return

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  const applyPageDraft = React.useCallback(
    (value: string) => {
      const trimmedValue = value.trim()

      if (!trimmedValue) return

      const parsedPage = Number(trimmedValue)

      if (!Number.isInteger(parsedPage)) return

      onPageChange(Math.min(Math.max(parsedPage, 1), Math.max(numPages, 1)))
    },
    [numPages, onPageChange]
  )

  return (
    <div className="flex items-center text-sm whitespace-nowrap text-primary">
      <span>Page</span>
      {isEditing ? (
        <Input
          ref={inputRef}
          aria-label="Page number"
          inputMode="numeric"
          pattern="[0-9]*"
          size="sm"
          value={draftPage}
          className="mx-1 w-14 min-w-14 rounded-md [&_[data-slot=input]]:text-center"
          onBlur={() => setIsEditing(false)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const nextValue = event.target.value

            setDraftPage(nextValue)
            applyPageDraft(nextValue)
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="font-normal"
          aria-label={`Current page ${displayPage}. Edit page number`}
          disabled={controlsDisabled || !numPages}
          onClick={() => {
            setDraftPage(String(displayPage))
            setIsEditing(true)
          }}
        >
          {displayPage}
        </Button>
      )}
      <span>of {numPages || "–"}</span>
    </div>
  )
}

export function PDFViewerToolbar({
  activePage,
  controlsDisabled,
  currentZoomLevel,
  downloadDisabled = controlsDisabled,
  extraMenuItems,
  isPreparingDownload = false,
  numPages,
  searchControl,
  sidebarOpen,
  showDownload,
  showRotateControls,
  showUpload,
  toolbarActions,
  onDownload,
  onPageChange,
  onRotate,
  onToggleSidebar,
  onUploadFile,
  onZoomChange,
  zoomLevel,
}: {
  activePage: number
  controlsDisabled: boolean
  currentZoomLevel: number
  downloadDisabled?: boolean
  extraMenuItems?: React.ReactNode
  isPreparingDownload?: boolean
  numPages: number
  searchControl: React.ReactNode
  sidebarOpen: boolean
  showDownload: boolean
  showRotateControls: boolean
  showUpload: boolean
  toolbarActions?: React.ReactNode
  onDownload?: () => void
  onPageChange: (pageNumber: number) => void
  onRotate: (direction: 1 | -1) => void
  onToggleSidebar: () => void
  onUploadFile?: (file: File) => void
  onZoomChange: (zoomLevel: ZoomMode | number) => void
  zoomLevel: ZoomMode | number
}) {
  const selectValue = isZoomMode(zoomLevel)
    ? zoomLevel
    : String(Number(currentZoomLevel.toFixed(2)))
  const zoomOptions = ZOOM_OPTIONS.includes(Number(currentZoomLevel.toFixed(2)))
    ? ZOOM_OPTIONS
    : [...ZOOM_OPTIONS, Number(currentZoomLevel.toFixed(2))].sort(
        (left, right) => left - right
      )

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <TooltipProvider>
          <ToolbarTooltip label="Pages sidebar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Pages sidebar"
              aria-pressed={sidebarOpen}
              data-active={sidebarOpen ? "" : undefined}
              className={cn(
                sidebarOpen &&
                  "bg-accent text-accent-foreground ring-1 ring-ring/40 ring-inset"
              )}
              disabled={controlsDisabled}
              onClick={onToggleSidebar}
            >
              <IconPlaceholder
                lucide="PanelLeft"
                tabler="IconLayoutSidebar"
                hugeicons="SidebarLeftIcon"
                phosphor="SidebarIcon"
                remixicon="RiLayoutLeftLine"
                className="size-4"
              />
            </Button>
          </ToolbarTooltip>
        </TooltipProvider>
        <PDFViewerPageNumberControl
          activePage={activePage}
          controlsDisabled={controlsDisabled}
          numPages={numPages}
          onPageChange={onPageChange}
        />
      </div>
      <TooltipProvider>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          {showRotateControls ? (
            <>
              <div className="flex flex-none items-center gap-1">
                <ToolbarTooltip label="Rotate counterclockwise">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Rotate counterclockwise"
                    disabled={controlsDisabled}
                    onClick={() => onRotate(-1)}
                  >
                    <IconPlaceholder
                      lucide="RotateCw"
                      tabler="IconRotateClockwise"
                      hugeicons="RotateClockwiseIcon"
                      phosphor="ArrowClockwiseIcon"
                      remixicon="RiClockwiseLine"
                      className="size-4"
                    />
                  </Button>
                </ToolbarTooltip>
                <ToolbarTooltip label="Rotate clockwise">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Rotate clockwise"
                    disabled={controlsDisabled}
                    onClick={() => onRotate(1)}
                  >
                    <IconPlaceholder
                      lucide="RotateCw"
                      tabler="IconRotateClockwise"
                      hugeicons="RotateClockwiseIcon"
                      phosphor="ArrowClockwiseIcon"
                      remixicon="RiClockwiseLine"
                      className="size-4 -scale-x-100"
                    />
                  </Button>
                </ToolbarTooltip>
              </div>
              <Separator
                orientation="vertical"
                className="mx-1 h-4 self-center"
              />
            </>
          ) : null}
          <div className="flex flex-none items-center gap-1">
            <ToolbarTooltip label="Zoom out">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                disabled={
                  controlsDisabled || currentZoomLevel <= ZOOM_OPTIONS[0]
                }
                onClick={() => {
                  const nextZoom = [...ZOOM_OPTIONS]
                    .reverse()
                    .find((option) => option < currentZoomLevel)

                  onZoomChange(nextZoom ?? ZOOM_OPTIONS[0])
                }}
              >
                <IconPlaceholder
                  lucide="CircleMinus"
                  tabler="IconCircleMinus"
                  hugeicons="MinusSignCircleIcon"
                  phosphor="MinusCircleIcon"
                  remixicon="RiIndeterminateCircleLine"
                  className="size-4"
                />
              </Button>
            </ToolbarTooltip>
            <Select
              value={selectValue}
              onValueChange={(value) => {
                const next = String(value)
                onZoomChange(isZoomMode(next) ? next : Number(next))
              }}
              disabled={controlsDisabled}
              modal={false}
            >
              <SelectTrigger
                size="sm"
                className="w-[104px] min-w-[104px]"
                aria-label="Zoom level"
              >
                <SelectValue placeholder="Zoom">
                  {Math.round(currentZoomLevel * 100)}%
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {(Object.keys(ZOOM_MODE_LABELS) as ZoomMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {ZOOM_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
                {zoomOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {Math.round(option * 100)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToolbarTooltip label="Zoom in">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                disabled={
                  controlsDisabled ||
                  currentZoomLevel >= ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]
                }
                onClick={() => {
                  const nextZoom = ZOOM_OPTIONS.find(
                    (option) => option > currentZoomLevel
                  )

                  onZoomChange(
                    nextZoom ?? ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]
                  )
                }}
              >
                <IconPlaceholder
                  lucide="CirclePlusIcon"
                  tabler="IconCirclePlusFilled"
                  hugeicons="PlusSignCircleIcon"
                  phosphor="PlusCircleIcon"
                  remixicon="RiAddCircleFill"
                  className="size-4"
                />
              </Button>
            </ToolbarTooltip>
          </div>
          <Separator orientation="vertical" className="mx-1 h-4 self-center" />
          {searchControl}
          {toolbarActions ? (
            <>
              <Separator
                orientation="vertical"
                className="mx-1 h-4 self-center"
              />
              {toolbarActions}
            </>
          ) : null}
          {showDownload || showUpload || extraMenuItems ? (
            <>
              <Separator
                orientation="vertical"
                className="mx-1 h-4 self-center"
              />
              <PDFViewerFileActionsMenu
                downloadDisabled={downloadDisabled}
                extraMenuItems={extraMenuItems}
                isPreparingDownload={isPreparingDownload}
                onDownload={onDownload}
                onUploadFile={onUploadFile}
                showDownload={showDownload}
                showUpload={showUpload}
              />
            </>
          ) : null}
        </div>
      </TooltipProvider>
    </div>
  )
}
