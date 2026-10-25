import type {
  ExplorerViewMode,
  FileFormatOpenBehavior,
  FileNode,
  FileOpenMode,
  TextViewerSettings,
} from '../shared/contracts.js';
import type { AiTextBridge } from './ai-text/ai-text-context.js';
import type { OpenedFileTab } from './opened-tabs-store.js';
import type { SurfacePersistenceHandle } from './surface-persistence.ts';
import { TEXT_VIEWABLE_BASENAMES, TEXT_VIEWABLE_EXTENSIONS } from './viewers/format-families.ts';
import type { FileSaveCallbackInput, FileSaveCallbackResult } from './viewers/registry.js';

export interface PdfViewerPreferences {
  defaultOpenBehavior?: FileFormatOpenBehavior;
  defaultViewer?: string;
  defaultEditor?: string;
  showThumbnailsByDefault?: boolean;
  defaultZoom?: 'fit-page' | 'fit-width' | number;
  showRotateControls?: boolean;
  showDownloadButton?: boolean;
}

export interface XlsxViewerPreferences {
  defaultOpenBehavior?: FileFormatOpenBehavior;
  defaultViewer?: string;
  defaultEditor?: string;
  defaultZoom?: number;
  showFormulaBar?: boolean;
  showHiddenSheets?: boolean;
  showDownloadButton?: boolean;
}

export interface GetFileUrlOptions {
  forceRefresh?: boolean;
  reuseIfUnchanged?: boolean;
}

/**
 * Everything the island needs to draw the explorer. The panel (host React
 * tree) owns the RPC calls, settings, and query — context does not cross the
 * island's separate react-dom root, so the island stays purely presentational
 * and receives this snapshot plus plain callbacks as props.
 */
export interface ExplorerViewProps {
  items: FileSystemItemView[];
  recentFiles?: OpenedFileTab[];
  isLoading: boolean;
  truncated?: boolean;
  /** Human-readable load failure, when any. */
  error: string | null;
  enabled?: boolean;
  defaultFileOpenMode?: FileOpenMode;
  defaultViewMode?: ExplorerViewMode;
  autoSaveEdits?: boolean;
  pdfSettings?: PdfViewerPreferences;
  xlsxSettings?: XlsxViewerPreferences;
  textSettings?: TextViewerSettings;
  formatSettings?: Record<string, Record<string, unknown>>;
  aiText?: AiTextBridge;
  onRetry(): void;
  /** Resolves a blob URL for a file's bytes; rejects on failure. */
  getFileUrl(file: FileOpenRef, options?: GetFileUrlOptions): Promise<string>;
  /** Resolves a blob URL for local pdfium.wasm for offline PDF viewing. */
  getPdfWasmUrl?(): Promise<string>;
  /** Resolves a data URI for local duke_sheets_wasm_bg.wasm for offline Excel viewing/editing. */
  getXlsxWasmDataUri?(): Promise<string>;
  /** Persists edited file bytes/text back to the workspace file system. */
  onSaveFile?(input: FileSaveCallbackInput): Promise<FileSaveCallbackResult>;
  /** Opens a file in the File Viewer workspace tab. */
  onOpenFileInNewTab?(file: FileOpenRef): void;
  /** Records a file in the workspace's 8-item recent files list. */
  onRecordRecentFile?(file: FileOpenRef): void;
  /** Removes a single missing/stale file from the recent files list. */
  onRemoveRecentFile?(path: string): void;
  /** Clears the workspace's recent files list. */
  onClearRecentFiles?(): void;
  /** Opens the Autumn Studio settings page. */
  onOpenSettings?(): void;
  /** True once the user dismissed the tree deprecation banner. */
  treeDeprecationDismissed?: boolean;
  /** Persists the tree deprecation banner dismissal in host settings. */
  onDismissTreeDeprecation?(): void;
}

export interface FileViewerViewProps {
  tabs: OpenedFileTab[];
  activePath: string | null;
  recentFiles?: OpenedFileTab[];
  maxOpenTabs?: number;
  enabled?: boolean;
  autoSaveEdits?: boolean;
  /** Per-tab persisted view state; only the native file panel provides it. */
  surfacePersistence?: SurfacePersistenceHandle;
  pdfSettings?: PdfViewerPreferences;
  xlsxSettings?: XlsxViewerPreferences;
  textSettings?: TextViewerSettings;
  formatSettings?: Record<string, Record<string, unknown>>;
  aiText?: AiTextBridge;
  getFileUrl(file: FileOpenRef, options?: GetFileUrlOptions): Promise<string>;
  getPdfWasmUrl?(): Promise<string>;
  getXlsxWasmDataUri?(): Promise<string>;
  onSaveFile?(input: FileSaveCallbackInput): Promise<FileSaveCallbackResult>;
  onSelectTab(path: string): void;
  onCloseTab(path: string): void;
  onCloseOtherTabs?(keepPath: string): void;
  onCloseTabsToRight?(fromPath: string): void;
  onCloseAllTabs?(): void;
  onTogglePinTab?(path: string): void;
  onTabDirtyChange?(path: string, isDirty: boolean): void;
  onOpenRecentFile?(file: OpenedFileTab): void;
  onRemoveRecentFile?(path: string): void;
  onClearRecentFiles?(): void;
  onOpenExplorer?(): void;
  onOpenSettings?(): void;
}

export interface FileSystemItemView {
  kind: 'folder' | 'file';
  path: string;
  name: string;
  size?: number;
  updatedAt?: string;
  contentType?: string;
}

export type FileSystemFileViewItem = Extract<FileSystemItemView, { kind: 'file' }>;

/** Minimal shape the island hands back on open/unsupported — vendor item
 * types stay inside the island and both directions stay assignable. */
export interface FileOpenRef {
  path: string;
  name?: string;
  contentType?: string;
  size?: number;
  updatedAt?: string;
  error?: string;
}

/** Flatten the RPC tree into the flat manifest FileSystem expects. */
export function flattenTree(node: FileNode | undefined): FileSystemItemView[] {
  const items: FileSystemItemView[] = [];
  const walk = (n: FileNode) => {
    if (n.kind === 'folder') {
      if (n.path !== '/') items.push({ kind: 'folder', path: n.path, name: n.name });
      for (const child of n.children) walk(child);
    } else {
      items.push({
        kind: 'file',
        path: n.path,
        name: n.name,
        size: n.size,
        updatedAt: new Date(n.mtime).toISOString(),
        contentType: n.contentType,
      });
    }
  };
  if (node) walk(node);
  return items;
}

/** Cache key incorporating path, modification timestamp, and byte size so
 * modified files invalidate cached blob URLs automatically. */
export function fileBlobCacheKey(file: {
  path: string;
  updatedAt?: string;
  size?: number;
}): string {
  return `${file.path}::${file.updatedAt ?? ''}::${file.size ?? ''}`;
}

/** data: → blob:. fetch handles the base64 decode natively, which is far
 * faster than atob for the multi-megabyte PDFs the viewer pulls. */
export async function dataUriToObjectUrl(dataUri: string): Promise<string> {
  const blob = await (await fetch(dataUri)).blob();
  return URL.createObjectURL(blob);
}

export function isMarkdownFileName(fileName?: string): boolean {
  if (!fileName) return false;
  return /\.(md|mdx|markdown)$/i.test(fileName.trim());
}

const TEXT_VIEWABLE_EXTENSION_SET = new Set<string>(TEXT_VIEWABLE_EXTENSIONS);

const TEXT_VIEWABLE_BASENAME_SET = new Set<string>(TEXT_VIEWABLE_BASENAMES);

export function isTextViewableFile(file: {
  name?: string;
  path: string;
  contentType?: string;
}): boolean {
  const type = file.contentType?.toLowerCase() ?? '';
  if (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/ld+json' ||
    type === 'application/javascript' ||
    type === 'application/typescript' ||
    type === 'application/xml' ||
    type === 'application/x-yaml' ||
    type === 'application/toml' ||
    type === 'application/sql' ||
    type === 'application/x-sh'
  ) {
    return true;
  }

  const rawName = (file.name ?? file.path.split('/').pop() ?? '').toLowerCase();
  if (!rawName) return false;
  if (TEXT_VIEWABLE_BASENAME_SET.has(rawName)) return true;

  const dotIndex = rawName.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  const ext = rawName.slice(dotIndex + 1);
  return TEXT_VIEWABLE_EXTENSION_SET.has(ext);
}
