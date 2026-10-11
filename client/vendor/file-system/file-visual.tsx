import * as React from "react"

import { FileThumbnail } from "../file-thumbnail"
import { IconPlaceholder } from "../icon-placeholder"
import { cn } from "../lib/utils"
import { FileGenericPreview } from "./icons"
import {
  filePreviewUrls,
  formatByteSize,
  formatTimestamp,
  type FileEntry,
  type FileSystemEntry,
  type FileSystemFileItem,
  type FileSystemIndex,
} from "./types"

export function FileVisual({
  file,
  className,
  loadPreviewImageUrl,
  pageable = false,
  pageUrlCache,
  previewAspectRatio,
  previewClassName,
  renderFilePreview,
}: {
  file: FileEntry
  className?: string
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  /** Show a hover pager over multi-page thumbnails. */
  pageable?: boolean
  /**
   * Shared `"path#pageIndex"` → URL cache so pages fetched by one pager
   * (gallery stage, columns preview) are reused by every other instance.
   */
  pageUrlCache?: Map<string, string>
  previewAspectRatio?: number
  previewClassName?: string
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
}) {
  const previewUrls = filePreviewUrls(file)
  const canLoadLazily = pageable && Boolean(loadPreviewImageUrl)
  const totalPages = Math.max(
    previewUrls.length,
    canLoadLazily ? (file.previewPageCount ?? 0) : 0
  )
  const [pageIndex, setPageIndex] = React.useState(0)
  const [lazyPageUrls, setLazyPageUrls] = React.useState<
    Record<number, string>
  >({})
  const clampedPageIndex = Math.min(pageIndex, Math.max(totalPages - 1, 0))
  const previewUrl =
    previewUrls[clampedPageIndex] ??
    lazyPageUrls[clampedPageIndex] ??
    pageUrlCache?.get(`${file.path}#${clampedPageIndex}`) ??
    null
  const resolvedAspectRatio = file.previewAspectRatio ?? previewAspectRatio
  const isLazyPagePending =
    canLoadLazily && !previewUrl && clampedPageIndex < totalPages

  const fileRef = React.useRef(file)

  React.useEffect(() => {
    fileRef.current = file
  })

  const [previousFilePath, setPreviousFilePath] = React.useState(file.path)
  if (!Object.is(previousFilePath, file.path)) {
    setPreviousFilePath(file.path)
    setPageIndex(0)
    setLazyPageUrls({})
  }

  React.useEffect(() => {
    if (!isLazyPagePending || !loadPreviewImageUrl) return

    let isCurrent = true

    void loadPreviewImageUrl(fileRef.current, clampedPageIndex)
      .then((url) => {
        if (url) pageUrlCache?.set(`${file.path}#${clampedPageIndex}`, url)
        if (isCurrent && url) {
          setLazyPageUrls((previous) => ({
            ...previous,
            [clampedPageIndex]: url,
          }))
        }
      })
      .catch(() => {})

    return () => {
      isCurrent = false
    }
  }, [
    clampedPageIndex,
    file.path,
    isLazyPagePending,
    loadPreviewImageUrl,
    pageUrlCache,
  ])

  const customPreview =
    !previewUrl && !isLazyPagePending ? renderFilePreview?.(file) : null
  const showPager = pageable && totalPages > 1
  const thumbnail = (
    <FileThumbnail
      file={{ name: file.name, type: file.contentType ?? "" }}
      className={cn("@container", !showPager && className)}
      previewAspectRatio={resolvedAspectRatio}
      previewClassName={cn("bg-white dark:bg-neutral-100", previewClassName)}
      previewImageUrl={previewUrl ?? undefined}
      isLoading={isLazyPagePending}
      previewContent={
        previewUrl || isLazyPagePending
          ? undefined
          : (customPreview ?? <FileGenericPreview file={file} />)
      }
    />
  )

  if (!showPager) return thumbnail

  return (
    <div className={cn("group/pager relative", className)}>
      {thumbnail}
      <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1 opacity-0 transition-opacity group-focus-within/pager:opacity-100 group-hover/pager:opacity-100">
        <button
          type="button"
          aria-label="Previous page"
          tabIndex={-1}
          disabled={clampedPageIndex === 0}
          onClick={(event) => {
            event.stopPropagation()
            setPageIndex((previous) => Math.max(0, previous - 1))
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="flex size-6 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur-sm transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <IconPlaceholder
            lucide="ChevronLeft"
            tabler="IconChevronLeft"
            hugeicons="ArrowLeft01Icon"
            phosphor="CaretLeftIcon"
            remixicon="RiArrowLeftSLine"
            className="size-3.5"
          />
        </button>
        <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums shadow-xs backdrop-blur-sm">
          {clampedPageIndex + 1}/{totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          tabIndex={-1}
          disabled={clampedPageIndex >= totalPages - 1}
          onClick={(event) => {
            event.stopPropagation()
            setPageIndex((previous) => Math.min(totalPages - 1, previous + 1))
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="flex size-6 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur-sm transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <IconPlaceholder
            lucide="ArrowRight"
            tabler="IconArrowRight"
            hugeicons="ArrowRight01Icon"
            phosphor="ArrowRightIcon"
            remixicon="RiArrowRightLine"
            className="size-3.5"
          />
        </button>
      </div>
    </div>
  )
}

export function FileSystemEmptyState({
  label,
  isLoading = false,
}: {
  label: string
  isLoading?: boolean
}) {
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center text-sm text-muted-foreground",
        isLoading && "animate-pulse motion-reduce:animate-none"
      )}
    >
      {label}
    </div>
  )
}

export function FileSystemInformation({
  entry,
  index,
}: {
  entry: FileSystemEntry
  index: FileSystemIndex
}) {
  const rows: Array<[string, string]> = []
  const created = formatTimestamp(entry.createdAt)
  const updated = formatTimestamp(entry.updatedAt)

  if (created) rows.push(["Created", created])
  if (updated) rows.push(["Modified", updated])
  if (entry.kind === "file") {
    const size = formatByteSize(entry.size)

    if (size) rows.push(["Size", size])
  } else {
    const childCount = index.children.get(entry.path)?.length

    if (childCount !== undefined) {
      rows.push(["Items", `${childCount}`])
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="border-t pt-3">
      <div className="mb-1.5 text-xs font-semibold">Information</div>
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="text-right" suppressHydrationWarning>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
