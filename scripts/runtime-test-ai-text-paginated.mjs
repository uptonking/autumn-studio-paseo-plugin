// Runtime test: end-to-end verification of the Paginated Text Doc AI Text
// viewer — layout-built pages, the page indicator, and the draft-flush save
// path (Save inside the debounce window must not lose the latest edit).

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRuntime(
  predicate,
  { timeoutMs = 8000, intervalMs = 100, label } = {},
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(label ? `Timed out waiting for ${label}` : 'Timed out waiting');
    }
    await sleep(intervalMs);
  }
}

/**
 * Switches the right split pane to the Paginated Text Doc viewer and verifies
 * the end-to-end flow: the Begonia editor mounts, the document builds from the
 * version's layout blocks with one explicit page break per PDF page, the page
 * indicator reflects the built pages, and an edit through the ProseMirror DOM
 * lands in the shared draft Markdown together with the page-break markers.
 */
export async function verifyAiTextPaginatedDocViewer({ shadow, dom, rpcInputs }) {
  const rightSplitPane = shadow.querySelector('[data-testid="ai-text-split-pane"]');
  if (!rightSplitPane) throw new Error('AI text split pane missing for paginated doc check');

  const pagesToggle = rightSplitPane.querySelector('[data-testid="ai-text-mode-paginated-doc"]');
  if (!pagesToggle) {
    throw new Error('Paginated Text Doc toggle missing from the AI text view mode group');
  }
  pagesToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const container = await waitForRuntime(
    () => shadow.querySelector('[data-testid="ai-text-paginated-doc"]'),
    { label: 'Paginated Text Doc viewer mount' },
  );

  // The build resolves the image asset before replacing the document, so the
  // layout content (title, page-1 text, page-2 table) arrives asynchronously.
  const editorEl = await waitForRuntime(
    () => {
      const node = container.querySelector('.ald-editor');
      const text = node?.textContent ?? '';
      return node &&
        text.includes('Guide') &&
        text.includes('Opening paragraph') &&
        text.includes('Firefox')
        ? node
        : null;
    },
    { label: 'paginated document build from layout blocks' },
  );

  if (!container.querySelector('.ald-page-break, [data-ald-page-break]')) {
    throw new Error('paginated document missing the explicit page break between PDF pages 1 and 2');
  }

  // The Paginated Text Doc shares the docx editor's Word-like theme.
  if (!container.querySelector('[data-begonia-theme="microsoft-word"]')) {
    throw new Error('paginated doc editor did not apply the microsoft-word begonia theme');
  }

  // JSDOM has no layout engine, so the viewport may report no visible page;
  // the total still comes from the explicit page breaks.
  const pagesIndicator = container.querySelector('[data-testid="ai-text-paginated-doc-pages"]');
  if (!(pagesIndicator?.textContent ?? '').includes('of 2')) {
    throw new Error(`page indicator should report 2 pages, got '${pagesIndicator?.textContent}'`);
  }

  // Edit through the ProseMirror DOM (MutationObserver path, like the docx
  // runtime test), then click Save BEFORE the 150ms debounced draft sync can
  // fire: the pane must flush the viewer's draft synchronously, or the saved
  // version would lose the last edit.
  const textNode = [...editorEl.querySelectorAll('p')]
    .flatMap((p) => [...p.childNodes])
    .find((node) => node.nodeType === 3 && (node.textContent ?? '').includes('Opening paragraph'));
  if (!textNode) throw new Error('paginated paragraph text node not found for edit simulation');
  textNode.data = 'Opening paragraph edited in the paginated doc';
  textNode.parentElement?.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await sleep(60);

  const saveButton = rightSplitPane.querySelector('[data-testid="ai-text-save-button"]');
  if (!saveButton) throw new Error('Save button missing while the Paginated Text Doc is editing');
  saveButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const savedCall = await waitForRuntime(
    () =>
      rpcInputs.find(
        (call) =>
          call.name === 'file.save' &&
          typeof call.input?.relPath === 'string' &&
          call.input.relPath.includes('guide.pdf') &&
          call.input.relPath.includes('_v2_'),
      ),
    { label: 'paginated doc save RPC' },
  );
  const savedMarkdown = savedCall.input.content;
  if (!savedMarkdown.includes('edited in the paginated doc')) {
    throw new Error(
      `Save inside the debounce window lost the latest edit (draft flush not wired): '${savedMarkdown}'`,
    );
  }
  if (!savedMarkdown.includes('<!-- page-break -->')) {
    throw new Error(`Saved paginated doc Markdown lost the page-break markers: '${savedMarkdown}'`);
  }

  // The shared draft (and thus the Markdown Source editor) stays in sync with
  // the flushed document after the save.
  const sourceToggle = rightSplitPane.querySelector('[data-testid="ai-text-mode-source"]');
  if (!sourceToggle) throw new Error('Source toggle missing after paginated doc edit');
  sourceToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);

  const textarea = rightSplitPane.querySelector('[data-testid="ai-text-editor-textarea"]');
  const draft = textarea?.value ?? '';
  if (!draft.includes('edited in the paginated doc')) {
    throw new Error(`paginated doc edit did not reach the shared draft Markdown: '${draft}'`);
  }
  if (!draft.includes('<!-- page-break -->')) {
    throw new Error(`paginated doc draft is missing the page-break markers: '${draft}'`);
  }

  console.log(
    '✓ Paginated Text Doc: layout-built pages with explicit page break, page indicator, and Save inside the debounce window flushes edits + page-break markers into the stored Markdown',
  );
}
