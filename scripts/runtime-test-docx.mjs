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
 * surface: default editor mode, completed import, Paginated/Web toggle
 * round-trip (prop -> controller.setViewState -> onStateChange -> React).
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

  // Editor mode is the docx default; the surface mounts the Begonia editor.
  await waitFor(() => shadow.querySelector('[data-testid="begonia-docx-editor"]'), {
    label: 'begonia-docx-editor surface',
  });
  await waitFor(() => !shadow.querySelector('[data-testid="docx-surface-importing"]'), {
    label: 'docx import to finish',
  });

  const editorSurface = shadow.querySelector('[data-testid="begonia-docx-editor"]');
  await waitFor(
    () => {
      const node = editorSurface.querySelector('.ald-editor');
      return node && (node.textContent ?? '').includes(DOCX_FIXTURE_TEXT) ? node : null;
    },
    { label: `imported text "${DOCX_FIXTURE_TEXT}" in the editor` },
  );

  const paginatedBtn = editorSurface.querySelector('[data-testid="docx-flow-mode-paginated"]');
  const webBtn = editorSurface.querySelector('[data-testid="docx-flow-mode-web"]');
  if (!paginatedBtn || !webBtn) throw new Error('docx flow-mode switcher missing');
  if (paginatedBtn.getAttribute('aria-pressed') !== 'true') {
    throw new Error('docx flow mode should default to paginated');
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
    '✓ Word document opened in Begonia editor, imported, flow-mode toggle round-tripped, no spurious saves',
  );
}
