// Runtime test: exercise the Begonia Word (.docx) viewer/editor end to end —
// provider resolution, lazy vendor chunk, docx import, toolbar flow-mode
// toggle round-trip through the live editor controller.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const JSZip = require('jszip');

export const DOCX_FIXTURE_NAME = 'notes.docx';
export const DOCX_FIXTURE_TEXT = 'Hello Autumn';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Smallest valid Word document the begonia importer accepts: package
 * relationships plus one body paragraph. STORE-compressed for determinism. */
export async function createMinimalDocxBuffer(text = DOCX_FIXTURE_TEXT) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '</Types>',
    ].join(''),
  );
  zip.file(
    '_rels/.rels',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      '</Relationships>',
    ].join(''),
  );
  zip.file(
    'word/document.xml',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body><w:p><w:r><w:t>',
      text,
      '</w:t></w:r></w:p></w:body>',
      '</w:document>',
    ].join(''),
  );
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
    mimeType: DOCX_MIME_TYPE,
  });
  return { buffer, contentType: DOCX_MIME_TYPE };
}

/** Edits the imported text through the ProseMirror DOM (MutationObserver
 * path) and verifies the debounced autosave round-trip: onTransaction ->
 * reportChange -> exportDocx -> file.save RPC with valid .docx bytes. */
async function verifyDocxEditAutosave({ shadow, dom, rpcInputs }) {
  const editorEl = shadow.querySelector('[data-testid="begonia-docx-editor"] .ald-editor');
  const textNode = [...(editorEl?.querySelectorAll('p') ?? [])]
    .flatMap((p) => [...p.childNodes])
    .find((node) => node.nodeType === 3 && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT));
  if (!textNode) throw new Error('imported docx text node not found for edit simulation');

  const updatedText = `${DOCX_FIXTURE_TEXT} Edited`;
  textNode.data = updatedText;
  textNode.parentElement?.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  const saveCall = await waitFor(
    () =>
      rpcInputs.find(
        (call) => call.name === 'file.save' && call.input?.relPath === DOCX_FIXTURE_NAME,
      ),
    { timeoutMs: 6000, label: 'debounced docx autosave RPC' },
  );

  if (saveCall.input.encoding !== 'base64') {
    throw new Error(`docx save used unexpected encoding '${saveCall.input.encoding}'`);
  }
  const savedBytes = Buffer.from(saveCall.input.content, 'base64');
  const savedZip = await JSZip.loadAsync(savedBytes);
  const documentXml = await savedZip.file('word/document.xml')?.async('string');
  if (!documentXml || !documentXml.includes(updatedText)) {
    throw new Error('saved .docx does not contain the edited text in word/document.xml');
  }
  console.log(
    '✓ docx edit round-trip: DOM edit -> dirty -> exportDocx -> autosave RPC with valid .docx bytes',
  );
}

async function waitFor(predicate, { timeoutMs = 8000, intervalMs = 100, label } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(label ? `Timed out waiting for ${label}` : 'Timed out waiting');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Opens the .docx fixture from the file tree in-place and verifies the Begonia
 * surface: the read-only paginated view is the default open, then the
 * Paginated/Web editing modes toggle the flow (prop -> controller.setViewState
 * -> onStateChange -> React) and return to the preview-only viewer.
 */
export async function verifyDocxEditorSurface({ shadow, dom, rpcInputs, reopenFileName }) {
  // A previous step may have left a file open in the in-place viewer; return
  // to the tree so the .docx entry is visible and clickable.
  const activeBack = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  if (activeBack) {
    activeBack.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const docxButton = await waitFor(
    () =>
      [...shadow.querySelectorAll('button')].find((btn) =>
        (btn.textContent ?? '').includes(DOCX_FIXTURE_NAME),
      ),
    { label: `${DOCX_FIXTURE_NAME} button in file tree` },
  );
  const saveRpcCountBefore = rpcInputs.filter((call) => call.name === 'file.save').length;
  docxButton.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));

  // The read-only viewer is the docx default: the surface mounts with the
  // paginated projection promoted to the visible document.
  const viewerSurfaceDefault = await waitFor(
    () => shadow.querySelector('[data-testid="begonia-docx-viewer"]'),
    { label: 'begonia-docx-viewer surface (default open behavior)' },
  );
  await waitFor(() => !shadow.querySelector('[data-testid="docx-surface-importing"]'), {
    label: 'docx import to finish',
  });
  await waitFor(
    () => {
      const node = viewerSurfaceDefault.querySelector('.ald-editor');
      return node && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT) ? node : null;
    },
    { label: `imported text "${DOCX_FIXTURE_TEXT}" in the viewer` },
  );
  // Viewer mode is preview-only: no Begonia toolbar, and the editable column
  // is moved offscreen (docx-preview-only) while staying mounted as the
  // projection's measurement source.
  if (viewerSurfaceDefault.querySelector('[role="toolbar"]')) {
    throw new Error('Begonia formatting toolbar must be hidden in read-only viewer mode');
  }
  if (!viewerSurfaceDefault.querySelector('.docx-preview-only')) {
    throw new Error('viewer surface should promote the paginated projection (docx-preview-only)');
  }
  if (!viewerSurfaceDefault.querySelector('[data-begonia-theme="microsoft-word"]')) {
    throw new Error('docx viewer did not apply the microsoft-word begonia theme');
  }
  const defaultViewerButton = viewerSurfaceDefault.querySelector(
    '[data-testid="docx-mode-viewer"]',
  );
  if (!defaultViewerButton || defaultViewerButton.getAttribute('aria-pressed') !== 'true') {
    throw new Error('Viewer mode button should be pressed on the default open');
  }

  // Switch into editing via the Paginated mode button.
  const defaultPaginatedButton = viewerSurfaceDefault.querySelector(
    '[data-testid="docx-mode-paginated"]',
  );
  if (!defaultPaginatedButton)
    throw new Error('viewer surface is missing the Paginated mode button');
  defaultPaginatedButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const editorSurface = await waitFor(
    () => shadow.querySelector('[data-testid="begonia-docx-editor"]'),
    {
      label: 'begonia-docx-editor surface',
    },
  );
  await waitFor(
    () => {
      const node = editorSurface.querySelector('.ald-editor');
      return node && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT) ? node : null;
    },
    { label: `imported text "${DOCX_FIXTURE_TEXT}" in the editor` },
  );

  // The microsoft-word theme is the default editor look.
  if (!editorSurface.querySelector('[data-begonia-theme="microsoft-word"]')) {
    throw new Error('docx editor did not apply the microsoft-word begonia theme');
  }

  // Editor mode shows Begonia's formatting toolbar; the duplicate Web/Paged
  // view controls are hidden (the toolbar owns Viewer/Paginated/Web). The
  // view-controls group is recognizable by its "View"/"Layout" labels.
  const begoniaToolbar = editorSurface.querySelector('[role="toolbar"]');
  if (!begoniaToolbar) {
    throw new Error('Begonia formatting toolbar missing in editor mode');
  }
  if (/View|Layout/.test(begoniaToolbar.textContent ?? '')) {
    throw new Error('Begonia view controls should be hidden in favor of the toolbar mode switch');
  }
  // Editing is a single continuous surface: no second paginated column.
  if (editorSurface.querySelector('.docx-preview-only')) {
    throw new Error('Editor mode should not render the paginated preview column');
  }

  const paginatedBtn = editorSurface.querySelector('[data-testid="docx-mode-paginated"]');
  const webBtn = editorSurface.querySelector('[data-testid="docx-mode-web"]');
  const viewerBtn = editorSurface.querySelector('[data-testid="docx-mode-viewer"]');
  if (!paginatedBtn || !webBtn || !viewerBtn) throw new Error('docx mode switcher missing');
  if (paginatedBtn.getAttribute('aria-pressed') !== 'true') {
    throw new Error('docx editor should default to the paginated editing mode');
  }
  if (viewerBtn.getAttribute('aria-pressed') !== 'false') {
    throw new Error('Viewer must not be pressed while editing');
  }

  // Toggle to web: React state -> flowMode prop -> controller.setViewState ->
  // controller state -> onStateChange -> aria reflects the controller.
  webBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitFor(
    () =>
      webBtn.getAttribute('aria-pressed') === 'true' &&
      paginatedBtn.getAttribute('aria-pressed') === 'false',
    { label: 'flow mode toggle to round-trip through the controller' },
  );
  paginatedBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => paginatedBtn.getAttribute('aria-pressed') === 'true', {
    label: 'flow mode toggle back to paginated',
  });

  // Read-only Viewer mode swaps back to the preview-only surface, and the
  // mode switch offers the way back into editing.
  viewerBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const viewerSurface = await waitFor(
    () => shadow.querySelector('[data-testid="begonia-docx-viewer"]'),
    { label: 'begonia-docx-viewer surface after switching to Viewer' },
  );
  await waitFor(
    () => {
      const node = viewerSurface.querySelector('.ald-editor');
      return node && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT) ? node : null;
    },
    { label: 'viewer surface to display the imported document' },
  );
  const viewerModePaginated = viewerSurface.querySelector('[data-testid="docx-mode-paginated"]');
  if (!viewerModePaginated) throw new Error('viewer surface is missing the Paginated mode button');
  viewerModePaginated.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const editorSurfaceAgain = await waitFor(
    () => shadow.querySelector('[data-testid="begonia-docx-editor"]'),
    { label: 'return to editor surface from viewer mode' },
  );
  // The editor remount re-imports the document; wait for it before editing.
  await waitFor(
    () => {
      const node = editorSurfaceAgain.querySelector('.ald-editor');
      return node && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT) ? node : null;
    },
    { label: `re-imported text "${DOCX_FIXTURE_TEXT}" after returning to editor mode` },
  );

  // Opening the file and switching layout only must not report dirtiness:
  // selection/viewport transactions never schedule a save.
  await new Promise((resolve) => setTimeout(resolve, 800));
  const saveRpcCountAfter = rpcInputs.filter((call) => call.name === 'file.save').length;
  if (saveRpcCountAfter !== saveRpcCountBefore) {
    throw new Error(
      `Spurious docx save: file.save was called ${saveRpcCountAfter - saveRpcCountBefore} time(s) without any document edits`,
    );
  }

  await verifyDocxEditAutosave({ shadow, dom, rpcInputs });

  const backBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  if (backBtn) {
    backBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  // The surrounding test flow expects another file to be open afterwards.
  if (reopenFileName) {
    const reopenBtn = [...shadow.querySelectorAll('button')].find((btn) =>
      (btn.textContent ?? '').includes(reopenFileName),
    );
    if (!reopenBtn) throw new Error(`${reopenFileName} button missing after docx verification`);
    reopenBtn.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.log(
    '✓ Word document opens in the preview-only paginated viewer by default, imports, round-trips Viewer/Paginated/Web modes with no spurious saves',
  );
}
