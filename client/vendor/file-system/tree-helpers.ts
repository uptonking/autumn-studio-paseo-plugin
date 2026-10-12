import type * as React from "react"
import type { FileTreeSortComparator, FileTreeSortEntry } from "@pierre/trees"

import {
  compareEntriesBySort,
  DEFAULT_SORT,
  escapeXmlAttribute,
  filePreviewUrls,
  FOLDER_GLYPH_DATA_URL,
  formatByteSize,
  formatTimestamp,
  normalizeFolderPath,
  type FileSystemIndex,
  type FileSystemSortState,
} from "./types.ts"

const TREE_THUMBNAIL_SPRITE_LIMIT = 400

export function createFileTreeSortComparator(
  currentPath: string,
  index: FileSystemIndex,
  sort: FileSystemSortState
): "default" | FileTreeSortComparator {
  if (
    sort.key === DEFAULT_SORT.key &&
    sort.direction === DEFAULT_SORT.direction
  ) {
    return "default"
  }

  const indexFiles = index.files
  const indexFolders = index.folders
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
}

export function buildFileTreeIconConfig(
  currentPath: string,
  index: FileSystemIndex,
  relativePaths: readonly string[]
) {
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
}

export function buildFileTreeUnsafeCss(
  headerLayout: "full" | "compact" | "minimal"
): string {
  return `
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
    `
}

export function renderFileTreeRowDecoration(
  currentPath: string,
  index: FileSystemIndex,
  row: { kind: string; path: string }
) {
  const entry =
    row.kind === "file"
      ? index.files.get(`${currentPath}${row.path}`)
      : index.folders.get(normalizeFolderPath(`${currentPath}${row.path}`))

  if (!entry) return null

  const dateColumn = formatTimestamp(entry.updatedAt ?? entry.createdAt) ?? "—"

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

export const FILE_TREE_STYLE_VARS: React.CSSProperties = {
  "--trees-bg-override": "transparent",
  "--trees-border-color-override": "var(--color-border)",
  "--trees-fg-override": "var(--color-foreground)",
  "--trees-focus-ring-color-override": "var(--color-ring)",
  "--trees-focus-ring-width-override": "2px",
  "--trees-selected-bg-override": "var(--color-primary)",
  "--trees-selected-focused-border-color-override": "var(--color-ring)",
} as React.CSSProperties
