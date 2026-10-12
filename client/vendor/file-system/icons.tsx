import * as React from "react"

import { IconPlaceholder } from "../icon-placeholder"
import type { RegistryIconProps } from "../lib/registry-icon-props"
import { cn } from "../lib/utils"
import {
  CUSTOM_FILE_ICON_SYMBOLS_SVG,
  FILE_ICON_COLOR_CSS,
  FILE_ICON_SPRITE_SHEET,
  resolveFileTypeIcon,
} from "./file-icon-resolver"
import {
  fileExtension,
  FOLDER_GLYPH_DATA_URL,
  FOLDER_GLYPH_SVG,
  type FileEntry,
  type FileSystemView,
} from "./types"

export { FOLDER_GLYPH_DATA_URL, FOLDER_GLYPH_SVG, resolveFileTypeIcon }

export function ArrowDown01Glyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="ChevronDown"
      tabler="IconChevronDown"
      hugeicons="ArrowDown01Icon"
      phosphor="CaretDownIcon"
      remixicon="RiArrowDownSLine"
      {...props}
    />
  )
}

export function ArrowUp01Glyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="ChevronUp"
      tabler="IconChevronUp"
      hugeicons="ArrowUp01Icon"
      phosphor="CaretUpIcon"
      remixicon="RiArrowUpSLine"
      {...props}
    />
  )
}

export function Calendar03Glyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="Calendar"
      tabler="IconCalendar"
      hugeicons="Calendar03Icon"
      phosphor="CalendarIcon"
      remixicon="RiCalendarLine"
      {...props}
    />
  )
}

export function File01Glyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="FileArchiveIcon"
      tabler="IconFileZip"
      hugeicons="File01Icon"
      phosphor="FileZipIcon"
      remixicon="RiFileZipLine"
      {...props}
    />
  )
}

export function GalleryThumbnailsGlyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="GalleryThumbnails"
      tabler="IconLayoutBottombar"
      hugeicons="GalleryThumbnailsIcon"
      phosphor="ImagesIcon"
      remixicon="RiGalleryView"
      {...props}
    />
  )
}

export function GridViewGlyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="LayoutGrid"
      tabler="IconLayoutGrid"
      hugeicons="GridViewIcon"
      phosphor="SquaresFourIcon"
      remixicon="RiLayoutGridLine"
      {...props}
    />
  )
}

export function LayoutThreeColumnGlyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="Columns3"
      tabler="IconColumns3"
      hugeicons="LayoutThreeColumnIcon"
      phosphor="ColumnsIcon"
      remixicon="RiLayoutColumnLine"
      {...props}
    />
  )
}

export function LeftToRightListBulletGlyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="Columns3Icon"
      tabler="IconLayoutColumns"
      hugeicons="LeftToRightListBulletIcon"
      phosphor="ColumnsIcon"
      remixicon="RiLayoutColumnLine"
      {...props}
    />
  )
}

export function RefreshGlyph(props: RegistryIconProps) {
  return (
    <IconPlaceholder
      lucide="RotateCw"
      tabler="IconRefresh"
      hugeicons="RotateRight01Icon"
      phosphor="ArrowClockwiseIcon"
      remixicon="RiRefreshLine"
      {...props}
    />
  )
}

export const VIEW_OPTIONS: Array<{
  icon: React.ComponentType<RegistryIconProps>
  label: string
  value: FileSystemView
}> = [
  { icon: GridViewGlyph, label: "Grid", value: "icons" },
  { icon: LeftToRightListBulletGlyph, label: "List", value: "list" },
  { icon: LayoutThreeColumnGlyph, label: "Columns", value: "columns" },
  { icon: GalleryThumbnailsGlyph, label: "Gallery", value: "gallery" },
]

export function FileSystemFolderGlyph({ className }: { className?: string }) {
  return (
    <img
      src={FOLDER_GLYPH_DATA_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  )
}

export function FileSystemIconSpriteSheet() {
  return (
    <>
      <span
        aria-hidden="true"
        className="hidden"
        dangerouslySetInnerHTML={{
          __html: FILE_ICON_SPRITE_SHEET + CUSTOM_FILE_ICON_SYMBOLS_SVG,
        }}
      />
      <style>{FILE_ICON_COLOR_CSS}</style>
    </>
  )
}

export function FileTypeIcon({
  fileName,
  className,
}: {
  fileName: string
  className?: string
}) {
  const icon = resolveFileTypeIcon(fileName)

  return (
    <svg
      aria-hidden="true"
      data-icon-name={icon.name}
      data-icon-token={icon.token}
      viewBox={icon.viewBox ?? "0 0 16 16"}
      className={cn("shrink-0 text-muted-foreground", className)}
      style={
        icon.token
          ? {
              color: `var(--fs-file-icon-${icon.token}, var(--color-muted-foreground))`,
            }
          : undefined
      }
    >
      <use href={`#${icon.name}`} />
    </svg>
  )
}

export function FileGenericPreview({ file }: { file: FileEntry }) {
  const extension = fileExtension(file.name)

  return (
    <div
      data-file-system-on-light=""
      className="flex size-full flex-col items-center justify-center gap-1.5 bg-white text-neutral-400 dark:bg-neutral-100"
    >
      <FileTypeIcon fileName={file.name} className="size-1/3 min-h-4 min-w-4" />
      {extension ? (
        <span className="text-[min(0.625rem,18cqw)] font-semibold tracking-wide uppercase">
          {extension}
        </span>
      ) : null}
    </div>
  )
}
