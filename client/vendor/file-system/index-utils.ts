import type {
  FileEntry,
  FileSystemEntry,
  FileSystemFileItem,
  FileSystemIndex,
  FileSystemItem,
  FileSystemSortKey,
  FileSystemSortState,
  FolderEntry,
} from "./types.ts"

export function normalizeFolderPath(path: string) {
  if (!path || path === "/") return ""
  return path.endsWith("/") ? path : `${path}/`
}

export function pathName(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const separatorIndex = trimmed.lastIndexOf("/")
  return separatorIndex === -1 ? trimmed : trimmed.slice(separatorIndex + 1)
}

export function pathParent(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const separatorIndex = trimmed.lastIndexOf("/")
  return separatorIndex === -1 ? "" : trimmed.slice(0, separatorIndex + 1)
}

export function fileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".")
  return dotIndex === -1 ? "" : name.slice(dotIndex + 1).toLowerCase()
}

const FILE_KIND_LABELS: Record<string, string> = {
  css: "CSS Stylesheet",
  csv: "CSV Document",
  doc: "Word Document",
  docx: "Word Document",
  gif: "GIF Image",
  go: "Go Source",
  jpeg: "JPEG Image",
  jpg: "JPEG Image",
  js: "JavaScript Source",
  json: "JSON Document",
  jsx: "JavaScript Source",
  md: "Markdown Document",
  mdx: "MDX Document",
  pdf: "PDF Document",
  png: "PNG Image",
  ppt: "PowerPoint Presentation",
  pptx: "PowerPoint Presentation",
  py: "Python Script",
  rs: "Rust Source",
  sh: "Shell Script",
  sql: "SQL Script",
  svg: "SVG Image",
  ts: "TypeScript Source",
  tsv: "TSV Document",
  tsx: "TypeScript Source",
  txt: "Plain Text",
  webp: "WebP Image",
  xls: "Excel Workbook",
  xlsx: "Excel Workbook",
  yaml: "YAML Document",
  yml: "YAML Document",
  zip: "ZIP Archive",
}

export function fileKindLabel(file: FileEntry) {
  const byExtension = FILE_KIND_LABELS[fileExtension(file.name)]

  if (byExtension) return byExtension
  if (file.contentType?.startsWith("image/")) return "Image"

  return file.contentType ?? "Document"
}

export function entryKindLabel(entry: FileSystemEntry) {
  return entry.kind === "folder" ? "Folder" : fileKindLabel(entry)
}

export function formatByteSize(size: number | undefined) {
  if (size === undefined) return null
  if (size < 1000) return `${size} bytes`

  const units = ["KB", "MB", "GB", "TB"]
  let value = size

  for (const unit of units) {
    value /= 1000
    if (value < 1000 || unit === "TB") {
      return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "")} ${unit}`
    }
  }

  return null
}

export function formatTimestamp(value: string | undefined) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })

  return `${day} at ${time}`
}

export function directoryPathsOf(paths: readonly string[]) {
  const directoryPaths = new Set<string>()

  for (const relativePath of paths) {
    let slashIndex = relativePath.indexOf("/")

    while (slashIndex !== -1) {
      directoryPaths.add(relativePath.slice(0, slashIndex))
      slashIndex = relativePath.indexOf("/", slashIndex + 1)
    }
  }
  return directoryPaths
}

export function compareEntryNames(
  left: { name: string },
  right: { name: string }
) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export const SORT_OPTIONS: Array<{
  defaultDirection: "asc" | "desc"
  key: FileSystemSortKey
  label: string
  triggerLabel: string
}> = [
  { defaultDirection: "asc", key: "name", label: "Name", triggerLabel: "Name" },
  { defaultDirection: "asc", key: "kind", label: "Kind", triggerLabel: "Kind" },
  {
    defaultDirection: "desc",
    key: "createdAt",
    label: "Date created",
    triggerLabel: "Created",
  },
  {
    defaultDirection: "desc",
    key: "updatedAt",
    label: "Date modified",
    triggerLabel: "Modified",
  },
  {
    defaultDirection: "desc",
    key: "size",
    label: "Size",
    triggerLabel: "Size",
  },
]

export const DEFAULT_SORT: FileSystemSortState = {
  direction: "asc",
  key: "name",
}

export function defaultSortDirection(key: FileSystemSortKey) {
  return (
    SORT_OPTIONS.find((option) => option.key === key)?.defaultDirection ?? "asc"
  )
}

function entrySortTimestamp(
  entry: FileSystemEntry,
  key: "createdAt" | "updatedAt"
) {
  const value = entry[key]
  const time = value ? Date.parse(value) : Number.NaN

  return Number.isNaN(time) ? 0 : time
}

export function compareEntriesBySort(
  left: FileSystemEntry,
  right: FileSystemEntry,
  sort: FileSystemSortState
) {
  let result = 0

  if (sort.key === "name") {
    result = compareEntryNames(left, right)
  } else if (sort.key === "kind") {
    result = entryKindLabel(left).localeCompare(
      entryKindLabel(right),
      undefined,
      {
        sensitivity: "base",
      }
    )
  } else if (sort.key === "size") {
    const leftSize = left.kind === "file" ? (left.size ?? 0) : -1
    const rightSize = right.kind === "file" ? (right.size ?? 0) : -1

    result = leftSize - rightSize
  } else {
    result =
      entrySortTimestamp(left, sort.key) - entrySortTimestamp(right, sort.key)
  }

  if (result === 0) return compareEntryNames(left, right)
  return sort.direction === "asc" ? (result < 0 ? -1 : 1) : result < 0 ? 1 : -1
}

export function buildFileSystemIndex(items: FileSystemItem[]): FileSystemIndex {
  const folders = new Map<string, FolderEntry>()
  const files = new Map<string, FileEntry>()

  const ensureFolderChain = (folderPath: string) => {
    let path = normalizeFolderPath(folderPath)

    while (path && !folders.has(path)) {
      folders.set(path, {
        kind: "folder",
        name: pathName(path),
        parentPath: pathParent(path),
        path,
      })
      path = pathParent(path)
    }
  }

  for (const item of items) {
    if (item.kind === "folder") {
      const path = normalizeFolderPath(item.path)

      if (!path) continue

      folders.set(path, {
        ...item,
        name: item.name ?? pathName(path),
        parentPath: normalizeFolderPath(item.parentPath ?? pathParent(path)),
        path,
      })
      ensureFolderChain(pathParent(path))
    } else {
      if (!item.path) continue

      files.set(item.path, {
        ...item,
        key: item.key ?? item.path,
        name: item.name ?? pathName(item.path),
        parentPath: normalizeFolderPath(
          item.parentPath ?? pathParent(item.path)
        ),
      })
      ensureFolderChain(pathParent(item.path))
    }
  }

  const children = new Map<string, FileSystemEntry[]>()
  const pushChild = (entry: FileSystemEntry) => {
    const siblings = children.get(entry.parentPath)

    if (siblings) {
      siblings.push(entry)
    } else {
      children.set(entry.parentPath, [entry])
    }
  }

  for (const folder of folders.values()) pushChild(folder)
  for (const file of files.values()) pushChild(file)
  for (const siblings of children.values()) {
    siblings.sort(compareEntryNames)
  }

  const foldersDeepestFirst = [...folders.values()].sort(
    (left, right) => right.path.length - left.path.length
  )

  for (const folder of foldersDeepestFirst) {
    if (folder.updatedAt) continue

    let newestTime = Number.NEGATIVE_INFINITY
    let newestValue: string | undefined

    for (const child of children.get(folder.path) ?? []) {
      const value = child.updatedAt ?? child.createdAt
      const time = value ? Date.parse(value) : Number.NaN

      if (!Number.isNaN(time) && time > newestTime) {
        newestTime = time
        newestValue = value
      }
    }
    if (newestValue) folder.updatedAt = newestValue
  }

  return { children, files, folders }
}

export function folderHasChildren(index: FileSystemIndex, folder: FolderEntry) {
  return (
    (index.children.get(folder.path)?.length ?? 0) > 0 ||
    folder.hasChildren === true
  )
}

export function escapeXmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function filePreviewUrls(file: FileSystemFileItem) {
  if (file.previewImageUrls?.length) return file.previewImageUrls
  return file.previewImageUrl ? [file.previewImageUrl] : []
}

export function normalizeSearchQuery(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return ""
  return trimmed.replaceAll("\\", "/").toLowerCase()
}

export const FOLDER_GLYPH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 50" width="64" height="50"><defs><linearGradient id="fs-folder-back" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3dabf5"/><stop offset="1" stop-color="#1d84dd"/></linearGradient><linearGradient id="fs-folder-front" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7accfb"/><stop offset="1" stop-color="#37a0ef"/></linearGradient></defs><path d="M5 10c0-3.31 2.69-6 6-6h10.9c1.6 0 3.13.7 4.18 1.9l1.5 1.73a3.5 3.5 0 0 0 2.64 1.22H54c2.76 0 5 2.24 5 5V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V10Z" fill="url(#fs-folder-back)"/><path d="M5 15.5h54V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V15.5Z" fill="url(#fs-folder-front)"/></svg>`

export const FOLDER_GLYPH_DATA_URL = `data:image/svg+xml,${encodeURIComponent(FOLDER_GLYPH_SVG)}`
