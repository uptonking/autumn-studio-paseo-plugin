// Runtime test: end-to-end verification of the Text Pages View AI Text
// viewer — layout-built pages, the caret-follow gate and PDF block focus,
// the page indicator, and the draft-flush save path (Save inside the debounce
// window must not lose the latest edit).

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

function waitBuiltTextPagesEditor(shadow) {
  return waitForRuntime(
    () => {
      const node = shadow.querySelector('[data-testid="ai-text-text-pages"] .ald-editor');
      const text = node?.textContent ?? '';
      return node && text.includes('Guide') && text.includes('Opening paragraph') ? node : null;
    },
    { label: 'text pages document build from layout blocks' },
  );
}

/**
 * Switches the right split pane to the Text Pages View viewer and verifies
 * the end-to-end flow: the Begonia editor mounts, the document builds from the
 * version's layout blocks with one explicit page break per PDF page, the page
 * indicator reflects the built pages, the caret-follow stays quiet until the
 * editor is focused, a focused edit focuses the caret's block on the PDF
 * through the same pane state the Blocks view drives, and the edit lands in
 * the shared draft Markdown together with the page-break markers.
 */
export async function verifyAiTextTextPagesViewer({ shadow, dom, rpcInputs }) {
  const rightSplitPane = shadow.querySelector('[data-testid="ai-text-split-pane"]');
  if (!rightSplitPane) throw new Error('AI text split pane missing for text pages check');

  const pagesToggle = rightSplitPane.querySelector('[data-testid="ai-text-mode-text-pages"]');
  if (!pagesToggle) {
    throw new Error('Text Pages View toggle missing from the AI text view mode group');
  }
  pagesToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const container = await waitForRuntime(
    () => shadow.querySelector('[data-testid="ai-text-text-pages"]'),
    { label: 'Text Pages View viewer mount' },
  );

  // The build resolves the image asset before replacing the document, so the
  // layout content (title, page-1 text, page-2 table) arrives asynchronously.
  await waitForRuntime(
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

  // The Text Pages View shares the docx editor's Word-like theme.
  if (!container.querySelector('[data-begonia-theme="microsoft-word"]')) {
    throw new Error('text pages editor did not apply the microsoft-word begonia theme');
  }

  // JSDOM has no layout engine, so the viewport may report no visible page;
  // the total still comes from the explicit page breaks.
  const pagesIndicator = container.querySelector('[data-testid="ai-text-text-pages-pages"]');
  if (!(pagesIndicator?.textContent ?? '').includes('of 2')) {
    throw new Error(`page indicator should report 2 pages, got '${pagesIndicator?.textContent}'`);
  }

  // Caret-follow gate: the document-open settle events carry a doc-start
  // selection; before any editor interaction they must not mark any block
  // active. Observable through the Blocks view, which renders the pane's
  // active-block state without clicking anything there.
  const blocksToggle = rightSplitPane.querySelector('[data-testid="ai-text-mode-layout-blocks"]');
  if (!blocksToggle) throw new Error('Blocks toggle missing for the caret-follow gate check');
  blocksToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitForRuntime(
    () => rightSplitPane.querySelector('[data-testid="ai-text-layout-blocks"]'),
    { label: 'blocks panel for the caret-follow gate check' },
  );
  if (rightSplitPane.querySelector('[data-testid="ai-text-layout-block"][aria-pressed="true"]')) {
    throw new Error('caret-follow fired on the document-open settle event before any focus');
  }
  const pagesToggleAgain = rightSplitPane.querySelector('[data-testid="ai-text-mode-text-pages"]');
  if (!pagesToggleAgain) throw new Error('Text Pages View toggle missing after the gate check');
  pagesToggleAgain.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const editorAgain = waitBuiltTextPagesEditor(shadow);

  // Edit through the ProseMirror DOM (MutationObserver path, like the docx
  // runtime test) after focusing the editor — focusing arms the caret-follow,
  // and the edit's real editor transaction reports the caret position, so the
  // focused block must become the pane's active block. Then click Save BEFORE
  // the 150ms debounced draft sync can fire: the pane must flush the viewer's
  // draft synchronously, or the saved version would lose the last edit.
  const rebuiltEditor = await editorAgain;
  const editorHost = rebuiltEditor.closest('[contenteditable]') ?? rebuiltEditor;
  editorHost.focus();
  const textNode = [...rebuiltEditor.querySelectorAll('p')]
    .flatMap((p) => [...p.childNodes])
    .find((node) => node.nodeType === 3 && (node.textContent ?? '').includes('Opening paragraph'));
  if (!textNode) throw new Error('text pages paragraph text node not found for edit simulation');
  textNode.data = 'Opening paragraph edited in the text pages view';
  textNode.parentElement?.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await sleep(60);

  const saveButton = rightSplitPane.querySelector('[data-testid="ai-text-save-button"]');
  if (!saveButton) throw new Error('Save button missing while the Text Pages View is editing');
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
    { label: 'text pages save RPC' },
  );
  const savedMarkdown = savedCall.input.content;
  if (savedCall.input.relPath.toLowerCase().endsWith('.pdf')) {
    throw new Error(
      `Save wrote the AI text Markdown into the source PDF (${savedCall.input.relPath}); the panel must save the version Markdown by relPath`,
    );
  }
  if (!savedMarkdown.includes('edited in the text pages view')) {
    throw new Error(
      `Save inside the debounce window lost the latest edit (draft flush not wired): '${savedMarkdown}'`,
    );
  }
  if (!savedMarkdown.includes('<!-- page-break -->')) {
    throw new Error(`Saved text pages Markdown lost the page-break markers: '${savedMarkdown}'`);
  }

  // Saving refreshes the document metadata; the toolbar badge must show that
  // the stored Markdown now differs from the AI extraction.
  await waitForRuntime(() => rightSplitPane.querySelector('[data-testid="ai-text-edited-badge"]'), {
    label: 'edited badge after saving text pages edits',
  });

  // The shared draft (and thus the Markdown Source editor) stays in sync with
  // the flushed document after the save.
  const sourceToggle = rightSplitPane.querySelector('[data-testid="ai-text-mode-source"]');
  if (!sourceToggle) throw new Error('Source toggle missing after text pages edit');
  sourceToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);

  const textarea = rightSplitPane.querySelector('[data-testid="ai-text-editor-textarea"]');
  const draft = textarea?.value ?? '';
  if (!draft.includes('edited in the text pages view')) {
    throw new Error(`text pages edit did not reach the shared draft Markdown: '${draft}'`);
  }
  if (!draft.includes('<!-- page-break -->')) {
    throw new Error(`text pages draft is missing the page-break markers: '${draft}'`);
  }

  // Caret-follow result: the focused edit's caret sits in the document-start
  // heading ("Guide", layout block p1-b0), so that block must be the pane's
  // active block — visible in the Blocks view without clicking anything there.
  const blocksToggleAgain = rightSplitPane.querySelector(
    '[data-testid="ai-text-mode-layout-blocks"]',
  );
  if (!blocksToggleAgain) throw new Error('Blocks toggle missing after the text pages edit');
  blocksToggleAgain.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitForRuntime(
    () =>
      rightSplitPane.querySelector(
        '[data-testid="ai-text-layout-block-p1-b0"][aria-pressed="true"]',
      ),
    { label: 'caret-focused block p1-b0 becoming the active pane block' },
  );

  // Reopening the viewer must rebuild from the saved Markdown, not from the
  // extraction layout; otherwise a save would appear to revert.
  const pagesToggleLast = rightSplitPane.querySelector('[data-testid="ai-text-mode-text-pages"]');
  if (!pagesToggleLast) throw new Error('Text Pages View toggle missing for the reopen check');
  pagesToggleLast.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitForRuntime(
    () => {
      const node = shadow.querySelector('[data-testid="ai-text-text-pages"] .ald-editor');
      return node && (node.textContent ?? '').includes('edited in the text pages view')
        ? node
        : null;
    },
    { label: 'saved edit surviving a viewer remount' },
  );

  console.log(
    '✓ Text Pages View: layout-built pages with page break, page indicator, caret-follow stays gated until focus and then focuses the caret block, Save inside the debounce window flushes edits + page-break markers into the stored Markdown, and the saved edit survives a viewer remount',
  );
}
