import type {
  FileExplorerViewMode,
  FileNode,
  FileOpenMode,
  TextViewerSettings,
} from "../shared/contracts.js";
import type { OpenedFileTab } from "./opened-tabs-store.js";

export interface PdfViewerPreferences {
  showThumbnailsByDefault?: boolean;
  defaultZoom?: "fit-page" | "fit-width" | number;
  showRotateControls?: boolean;
  showDownloadButton?: boolean;
}

/**
  * Everything the island needs to draw the explorer. The panel (host React
  * tree) owns the RPC calls, settings, and query — context does not cross the
  * island's separate react-dom root, so the island stays purely presentational
  * and receives this snapshot plus plain callbacks as props.
  */
export interface FileExplorerViewProps {
  items: FileSystemItemView[];
  isLoading: boolean;
  truncated?: boolean;
  /** Human-readable load failure, when any. */
  error: string | null;
  enabled?: boolean;
  defaultFileOpenMode?: FileOpenMode;
  defaultViewMode?: FileExplorerViewMode;
  pdfSettings?: PdfViewerPreferences;
  textSettings?: TextViewerSettings;
  onRetry(): void;
  /** Resolves a blob URL for a file's bytes; rejects on failure. */
  getFileUrl(file: FileOpenRef): Promise<string>;
  /** Resolves a blob URL for local pdfium.wasm for offline PDF viewing. */
  getPdfWasmUrl?(): Promise<string>;
  /** Opens a file in the File Viewer workspace tab. */
  onOpenFileInNewTab?(file: FileOpenRef): void;
  /** Opens the File Explorer settings page. */
  onOpenSettings?(): void;
}

export interface FileViewerViewProps {
  tabs: OpenedFileTab[];
  activePath: string | null;
  enabled?: boolean;
  pdfSettings?: PdfViewerPreferences;
  textSettings?: TextViewerSettings;
  getFileUrl(file: FileOpenRef): Promise<string>;
  getPdfWasmUrl?(): Promise<string>;
  onSelectTab(path: string): void;
  onCloseTab(path: string): void;
  onCloseAllTabs?(): void;
  onOpenExplorer?(): void;
  onOpenSettings?(): void;
}

export interface FileSystemItemView {
  kind: "folder" | "file";
  path: string;
  name: string;
  size?: number;
  updatedAt?: string;
  contentType?: string;
}

export type FileSystemFileViewItem = Extract<FileSystemItemView, { kind: "file" }>;

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
    if (n.kind === "folder") {
      if (n.path !== "/") items.push({ kind: "folder", path: n.path, name: n.name });
      for (const child of n.children) walk(child);
    } else {
      items.push({
        kind: "file",
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
  return `${file.path}::${file.updatedAt ?? ""}::${file.size ?? ""}`;
}

/** data: → blob:. fetch handles the base64 decode natively, which is far
 * faster than atob for the multi-megabyte PDFs the viewer pulls. */
export async function dataUriToObjectUrl(dataUri: string): Promise<string> {
  const blob = await (await fetch(dataUri)).blob();
  return URL.createObjectURL(blob);
}
