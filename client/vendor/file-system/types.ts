import type * as React from "react"
import type { AiTextBridge } from "../../ai-text/ai-text-context"
import { isTextViewableFile } from "../../view-props.ts"
import type { FileSaveCallbackInput, FileSaveCallbackResult } from "../../viewers/registry"

export * from "./index-utils.ts"

export type FileSystemView = "icons" | "list" | "columns" | "gallery"

export type FileSystemFolderItem = {
  kind: "folder"
  path: string
  name?: string
  parentPath?: string
  hasChildren?: boolean
  createdAt?: string
  updatedAt?: string
}

export type FileSystemFileItem = {
  kind: "file"
  path: string
  key?: string
  name?: string
  parentPath?: string
  contentType?: string
  size?: number
  createdAt?: string
  updatedAt?: string
  etag?: string
  url?: string
  previewImageUrl?: string | null
  previewImageUrls?: string[] | null
  previewPageCount?: number
  previewAspectRatio?: number
  metadata?: Record<string, string>
}

export type FileSystemItem = FileSystemFolderItem | FileSystemFileItem
export type FileSystemLoadChildrenArgs = { path: string; cursor: string | null }
export type FileSystemLoadChildrenResult = { items: FileSystemItem[]; nextCursor?: string | null }
export type FileSystemOpenMode = "in-place" | "dialog" | "new-tab"

export type FileSystemPdfSettings = {
  defaultOpenBehavior?: "viewer" | "editor"
  defaultViewer?: string
  defaultEditor?: string
  defaultZoom?: "fit-page" | "fit-width" | number
  showDownloadButton?: boolean
  showRotateControls?: boolean
  showThumbnailsByDefault?: boolean
}

export type FileSystemXlsxSettings = {
  defaultOpenBehavior?: "viewer" | "editor"
  defaultViewer?: string
  defaultEditor?: string
  defaultZoom?: number
  showFormulaBar?: boolean
  showHiddenSheets?: boolean
  showDownloadButton?: boolean
}

export type FileSystemTextSettings = {
  defaultOpenBehavior?: "viewer" | "editor"
  defaultViewer?: string
  defaultEditor?: string
  showLineNumbers?: boolean
  wordWrap?: boolean
}

export type FileSystemFormatBehaviorPreference = {
  defaultOpenBehavior?: "viewer" | "editor"
  defaultViewer?: string
  defaultEditor?: string
  [key: string]: unknown
}

export type FileSystemFormatSettingsMap = Record<
  string,
  FileSystemFormatBehaviorPreference
>

export type FileSystemProps = {
  /** Flat manifest. Folders are optional; missing prefixes are inferred from file paths. */
  items: FileSystemItem[]
  /** Recently opened/visited files in this workspace (capped at 8). */
  recentFiles?: readonly {
    path: string
    name: string
    contentType?: string
    size?: number
    updatedAt?: string
  }[]
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
  /** Callback invoked when any file is opened to record it in recent files. */
  onRecordRecentFile?: (file: FileSystemFileItem) => void
  /** Callback to clear recent files. */
  onClearRecentFiles?: () => void
  /** Callback to open the Autumn Studio settings page. */
  onOpenSettings?: () => void
  /** PDF viewer/editor preferences from Autumn Studio settings. */
  pdfSettings?: FileSystemPdfSettings
  /** Excel viewer/editor preferences from Autumn Studio settings. */
  xlsxSettings?: FileSystemXlsxSettings
  /** Code & text viewer/editor preferences from Autumn Studio settings. */
  textSettings?: FileSystemTextSettings
  /** Additional format preferences keyed by viewer kind (e.g. image, docx, pptx). */
  formatSettings?: FileSystemFormatSettingsMap
  /** AI Text Mode bridge for document extraction and side-by-side split view. */
  aiText?: AiTextBridge
  /** Whether file edits are automatically saved to the file system. */
  autoSaveEdits?: boolean
  /** Callback to persist edited file payloads back to the workspace file system. */
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>
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
  getFileUrl?: (
    file: FileSystemFileItem,
    options?: { forceRefresh?: boolean; reuseIfUnchanged?: boolean }
  ) => string | Promise<string>
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
  getFileUrl?: (
    file: FileSystemFileItem,
    options?: { forceRefresh?: boolean; reuseIfUnchanged?: boolean }
  ) => string | Promise<string>
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.contentType === "application/vnd.ms-excel"
  ) {
    return "xlsx"
  }
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
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx"
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
