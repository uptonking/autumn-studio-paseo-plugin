import type { FileFormatOpenBehavior } from '../../shared/settings.js';
import type { FileSystemViewerKind } from '../vendor/file-system/types.js';

export type FileSurfaceRole = FileFormatOpenBehavior;

export interface FileSurfaceProviderMeta {
  /** Unique provider ID, e.g. "embedpdf-viewer", "pdfjs-viewer", "embedpdf-editor", "extend-xlsx-viewer", "extend-xlsx-editor" */
  id: string;
  /** Target file format kind ("pdf", "xlsx", "text", "docx", "pptx", "image", "unknown") */
  kind: FileSystemViewerKind;
  /** Role this provider fulfills ("viewer" or "editor") */
  role: FileSurfaceRole;
  /** Human-readable label shown in Settings dropdowns & "Open with..." menus */
  label: string;
  /** Whether this provider is the built-in default for its (kind, role) */
  isDefault?: boolean;
}

const DEFAULT_SURFACE_PROVIDERS: FileSurfaceProviderMeta[] = [
  {
    id: 'embedpdf-viewer',
    kind: 'pdf',
    role: 'viewer',
    label: 'EmbedPDF Viewer (Default)',
    isDefault: true,
  },
  {
    id: 'embedpdf-editor',
    kind: 'pdf',
    role: 'editor',
    label: 'EmbedPDF Editor (Default)',
    isDefault: true,
  },
  {
    id: 'extend-xlsx-viewer',
    kind: 'xlsx',
    role: 'viewer',
    label: 'Extend Excel Viewer (Default)',
    isDefault: true,
  },
  {
    id: 'extend-xlsx-editor',
    kind: 'xlsx',
    role: 'editor',
    label: 'Extend Excel Editor (Default)',
    isDefault: true,
  },
  {
    id: 'code-text-viewer',
    kind: 'text',
    role: 'viewer',
    label: 'Code & Text Viewer (Default)',
    isDefault: true,
  },
  {
    id: 'code-text-editor',
    kind: 'text',
    role: 'editor',
    label: 'Code & Text Editor (Default)',
    isDefault: true,
  },
  {
    id: 'image-viewer',
    kind: 'image',
    role: 'viewer',
    label: 'Image Viewer (Default)',
    isDefault: true,
  },
  {
    id: 'begonia-docx-viewer',
    kind: 'docx',
    role: 'viewer',
    label: 'Begonia Word Viewer (Default)',
    isDefault: true,
  },
  {
    id: 'begonia-docx-editor',
    kind: 'docx',
    role: 'editor',
    label: 'Begonia Word Editor (Default)',
    isDefault: true,
  },
  {
    id: 'pptx-stub-viewer',
    kind: 'pptx',
    role: 'viewer',
    label: 'PowerPoint Preview (Default)',
    isDefault: true,
  },
];

const catalogById = new Map<string, FileSurfaceProviderMeta>(
  DEFAULT_SURFACE_PROVIDERS.map((entry) => [entry.id, entry]),
);

export function registerSurfaceProviderMeta(meta: FileSurfaceProviderMeta): () => void {
  catalogById.set(meta.id, meta);
  return () => {
    const defaultMatch = DEFAULT_SURFACE_PROVIDERS.find((entry) => entry.id === meta.id);
    if (defaultMatch) {
      catalogById.set(meta.id, defaultMatch);
    } else {
      catalogById.delete(meta.id);
    }
  };
}

export function getFormatSurfaceProviders(
  kind: FileSystemViewerKind,
  role?: FileSurfaceRole,
): FileSurfaceProviderMeta[] {
  const results: FileSurfaceProviderMeta[] = [];
  for (const meta of catalogById.values()) {
    if (meta.kind !== kind) continue;
    if (role && meta.role !== role) continue;
    results.push(meta);
  }
  return results;
}

export function resolveSurfaceProviderMeta(
  kind: FileSystemViewerKind,
  role: FileSurfaceRole,
  preferredProviderId?: string,
): FileSurfaceProviderMeta | null {
  const candidates = getFormatSurfaceProviders(kind, role);
  if (preferredProviderId) {
    const match = candidates.find((entry) => entry.id === preferredProviderId);
    if (match) return match;
  }
  const defaultEntry = candidates.find((entry) => entry.isDefault);
  return defaultEntry ?? candidates[0] ?? null;
}
