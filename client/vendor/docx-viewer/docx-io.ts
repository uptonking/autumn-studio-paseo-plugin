import { exportDocx, importDocx } from '@datalking/begonia-docx-bridge';
import {
  readBrowserEditorDocument,
  replaceBrowserEditorDocument,
  type BrowserEditorController,
} from '@datalking/begonia-browser/v1';

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** ProseMirror document produced by the docx importer; inferred from the
 * begonia API so this module never imports prosemirror types directly. */
export type ImportedDocxDocument = Awaited<ReturnType<typeof importDocx>>;

function dataUriToArrayBuffer(dataUri: string): ArrayBuffer {
  const comma = dataUri.indexOf(',');
  if (comma === -1) {
    throw new Error('Invalid data URI for Word document');
  }
  const base64 = dataUri.slice(comma + 1);
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(base64, 'base64');
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    return copy.buffer;
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function fetchDocxArrayBuffer(
  src: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (src.startsWith('data:')) {
    return dataUriToArrayBuffer(src);
  }
  const response = await fetch(src, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load Word document (${response.status})`);
  }
  return await response.arrayBuffer();
}

/** Parses .docx bytes into a ProseMirror document. Pure: nothing is applied to
 * an editor, so callers can discard stale results before replacing content. */
export async function parseDocxDocument(
  source: ArrayBuffer | Uint8Array,
): Promise<ImportedDocxDocument> {
  return await importDocx(source);
}

/** Replaces the mounted editor's document. Throws when the editor surface is
 * not ready, so content is never silently dropped. */
export function replaceEditorDocument(
  controller: BrowserEditorController,
  document: ImportedDocxDocument,
): void {
  const replaced = replaceBrowserEditorDocument(controller, document);
  if (!replaced) {
    throw new Error('The editor is not ready to display this document.');
  }
}

/** Serializes the editor's current document back to .docx bytes. */
export async function saveDocxFromEditor(controller: BrowserEditorController): Promise<Uint8Array> {
  const document = readBrowserEditorDocument(controller);
  if (!document) {
    throw new Error('The document is not ready to save.');
  }
  return exportDocx(document);
}
