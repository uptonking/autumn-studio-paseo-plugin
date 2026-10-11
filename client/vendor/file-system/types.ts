import type * as React from "react"
import { isTextViewableFile } from "../../viewers/text-viewer"

export type FileSystemView = "icons" | "list" | "columns" | "gallery"

export type FileSystemFolderItem = {
  kind: "folder"
  /** Folder prefix, e.g. `"invoices/2026/"`. A trailing slash is added when missing. */
  path: string
  name?: string
  parentPath?: string
  /** Set when children exist but are not in `items` yet; enables `loadChildren`. */
  hasChildren?: boolean
  createdAt?: string
  updatedAt?: string
}

export type FileSystemFileItem = {
  kind: "file"
  /** Display/canonical path, e.g. `"invoices/2026/jan.pdf"`. */
  path: string
  /** Original object key (S3/R2). Defaults to `path`. */
  key?: string
  name?: string
  parentPath?: string
  contentType?: string
  size?: number
  createdAt?: string
  updatedAt?: string
  etag?: string
  /** Optional if already public/presigned. Otherwise resolved via `getFileUrl`. */
  url?: string
  /** Externally generated thumbnail. The component never renders documents itself. */
  previewImageUrl?: string | null
  /**
   * Externally generated page thumbnails (first entry is the cover). When a
   * file has more than one page, large thumbnails show a hover pager.
   */
  previewImageUrls?: string[] | null
  /**
   * Total page count when it exceeds `previewImageUrls.length`; the pager
   * loads the remaining pages on demand via `loadPreviewImageUrl`.
   */
  previewPageCount?: number
  /** Thumbnail aspect ratio (width / height). Defaults to a portrait page. */
  previewAspectRatio?: number
  metadata?: Record<string, string>
}

export type FileSystemItem = FileSystemFolderItem | FileSystemFileItem

export type FileSystemLoadChildrenArgs = {
  path: string
  cursor: string | null
}

export type FileSystemLoadChildrenResult = {
  items: FileSystemItem[]
  nextCursor?: string | null
}

export type FileSystemOpenMode = "in-place" | "dialog" | "new-tab"

export type FileSystemPdfSettings = {
  defaultZoom?: "fit-page" | "fit-width" | number
  showDownloadButton?: boolean
  showRotateControls?: boolean
  showThumbnailsByDefault?: boolean
}

export type FileSystemTextSettings = {
  showLineNumbers?: boolean
  wordWrap?: boolean
}

export type FileSystemProps = {
  /** Flat manifest. Folders are optional; missing prefixes are inferred from file paths. */
  items: FileSystemItem[]
  className?: string
  /** Label for the root folder. */
  title?: string
  defaultView?: FileSystemView
  view?: FileSystemView
  onViewChange?: (view: FileSystemView) => void
  /** Default mode when opening a file from the file tree. Defaults to `"in-place"`. */
  defaultFileOpenMode?: FileSystemOpenMode
  /** Callback to open a file in a new workspace tab. */
  onOpenFileInNewTab?: (file: FileSystemFileItem, url: string) => void
  /** Callback to open the File Explorer settings page. */
  onOpenSettings?: () => void
  /** PDF viewer preferences from File Explorer settings. */
  pdfSettings?: FileSystemPdfSettings
  /** Code & text viewer preferences from File Explorer settings. */
  textSettings?: FileSystemTextSettings
  /** Folder prefix to open initially, e.g. `"invoices/"`. */
  defaultPath?: string
  onSelectionChange?: (item: FileSystemItem | null) => void
  /** Called on file open, replacing the built-in behavior. */
  onFileOpen?: (file: FileSystemFileItem, url: string | null) => void
  /**
   * Called for files the built-in viewers cannot show and that would otherwise
   * fall through to `window.open`, or when resolving the file content/URL fails.
   */
  onOpenUnsupported?: (file: FileSystemFileItem, error?: string) => void
  /** Optional callback to refresh the file tree. */
  onRefresh?: () => void
  /** Resolve a URL (e.g. presigned) for a file without one. */
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  /** Lazily fetch children for folders with `hasChildren` and no loaded entries. */
  loadChildren?: (
    args: FileSystemLoadChildrenArgs
  ) => Promise<FileSystemLoadChildrenResult>
  /** Custom preview node for files without `previewImageUrl`. */
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
  /**
   * Lazily render a page thumbnail beyond the eagerly provided
   * `previewImageUrls` (the pager calls this as pages come into view).
   */
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
}

export type FolderEntry = FileSystemFolderItem & {
  name: string
  parentPath: string
}

export type FileEntry = FileSystemFileItem & {
  key: string
  name: string
  parentPath: string
}

export type FileSystemEntry = FolderEntry | FileEntry

export type FileSystemIndex = {
  children: Map<string, FileSystemEntry[]>
  files: Map<string, FileEntry>
  folders: Map<string, FolderEntry>
}

export type FileSystemSortKey =
  | "createdAt"
  | "kind"
  | "name"
  | "size"
  | "updatedAt"

export type FileSystemSortState = {
  direction: "asc" | "desc"
  key: FileSystemSortKey
}

export type FileSystemViewProps = {
  currentPath: string
  entries: FileSystemEntry[]
  fileFilter: ((file: FileEntry) => boolean) | null
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  headerLayout?: "full" | "compact" | "minimal"
  index: FileSystemIndex
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  loadingFolders: Set<string>
  onOpen: (entry: FileSystemEntry) => void
  onSelect: (entry: FileSystemEntry | null) => void
  onSortColumnClick: (key: FileSystemSortKey) => void
  /** Pooled paths currently attached to the DOM (reveal instantly). */
  attachedStagePaths: string[]
  /** `"path#pageIndex"` → thumbnail URL, shared by every pager. */
  pageUrlCache: Map<string, string>
  /** Admits a file into the root-owned keep-alive preview pool. */
  poolStagePath: (path: string) => void
  /** Mounts/unmounts the gallery host element for a pooled path. */
  registerStageHost: (path: string, element: HTMLElement | null) => void
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode
  searchQuery: string
  selectedEntry: FileSystemEntry | null
  selectedPath: string | null
  sort: FileSystemSortState
  /** Expanded tree folders per folder path, surviving view switches. */
  treeExpansionRef: React.RefObject<Map<string, readonly string[]>>
}

export const IPAD_MIN_WIDTH = 768
export const GALLERY_STAGE_POOL_SIZE = 4
export const GALLERY_STAGE_ATTACHED_COUNT = 3
export const TOOLBAR_ICON_BUTTON_CLASSNAME =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

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

export type FileSystemViewerKind =
  | "docx"
  | "image"
  | "pdf"
  | "pptx"
  | "text"
  | "xlsx"

export function viewerKindForFile(
  file: FileSystemFileItem
): FileSystemViewerKind | null {
  if (file.contentType?.startsWith("image/")) return "image"
  if (file.contentType === "application/pdf") return "pdf"
  if (
    file.contentType ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx"
  }

  const name = (file.name ?? file.path).toLowerCase()

  if (name.endsWith(".pdf")) return "pdf"
  if (name.endsWith(".docx")) return "docx"
  if (name.endsWith(".pptx")) return "pptx"
  if (name.endsWith(".xlsx")) return "xlsx"
  if (/\.(avif|gif|jpe?g|png|svg|webp)$/.test(name)) return "image"
  if (isTextViewableFile(file)) return "text"

  return null
}

export const VIEWER_DIALOG_CLASSNAMES: Record<FileSystemViewerKind, string> = {
  docx: "h-[88vh] w-[min(96vw,68rem)] max-w-none",
  image: "h-[85vh] w-[min(96vw,68rem)] max-w-none",
  pdf: "h-[88vh] w-[min(96vw,68rem)] max-w-none",
  pptx: "h-[88vh] w-[min(96vw,84rem)] max-w-none",
  text: "h-[85vh] w-[min(96vw,68rem)] max-w-none",
  xlsx: "h-[85vh] w-[min(96vw,100rem)] max-w-none",
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
