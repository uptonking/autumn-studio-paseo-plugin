// Runtime helpers for the AI Text view chrome: the floating metadata panel,
// the right-pane actions menu, and hiding/showing the original viewer.

const click = (dom, element) =>
  element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function verifyAiTextMetadataPanel({ shadow, dom, rightSplitPane }) {
  const metadataPanel = rightSplitPane.querySelector(
    '[data-testid="ai-text-metadata-panel"]',
  );
  if (
    !metadataPanel ||
    !(metadataPanel.textContent ?? "").includes("MinerU · Cloud Free") ||
    !(metadataPanel.textContent ?? "").includes("Auto formatting")
  ) {
    throw new Error(
      "AI text metadata panel in right split pane did not display the profile and refinement provenance",
    );
  }

  const profileSelect = metadataPanel.querySelector(
    '[data-testid="ai-text-reparse-profile-select"]',
  );
  if (
    !profileSelect ||
    ![...profileSelect.querySelectorAll("option")].some(
      (option) => option.value === "mineru-cloud-free",
    )
  ) {
    throw new Error(
      "AI text metadata panel did not offer the configured profiles for re-parsing",
    );
  }
  if (!metadataPanel.querySelector('[data-testid="ai-text-reparse-run-button"]')) {
    throw new Error("AI text metadata panel is missing the Re-parse button");
  }

  // Close the metadata panel; it must disappear from the AI text view.
  const metadataCloseBtn = metadataPanel.querySelector(
    '[data-testid="ai-text-metadata-close"]',
  );
  if (!metadataCloseBtn) {
    throw new Error("AI text metadata panel close button missing");
  }
  click(dom, metadataCloseBtn);
  await wait(80);
  if (rightSplitPane.querySelector('[data-testid="ai-text-metadata-panel"]')) {
    throw new Error(
      "AI text metadata panel did not close after clicking its close icon",
    );
  }

  // Re-open it from the right pane's three-dots menu.
  const rightActionsTrigger = rightSplitPane.querySelector(
    '[data-testid="ai-text-view-actions"]',
  );
  if (!rightActionsTrigger) {
    throw new Error("AI text view three-dots actions button missing");
  }
  click(dom, rightActionsTrigger);
  await wait(80);
  const showMetadataItem = shadow.querySelector(
    '[data-testid="ai-text-show-metadata-menu-item"]',
  );
  if (!showMetadataItem) {
    throw new Error(
      "'Show AI text metadata' menu item missing from AI text view actions menu",
    );
  }
  click(dom, showMetadataItem);
  await wait(80);
  if (!rightSplitPane.querySelector('[data-testid="ai-text-metadata-panel"]')) {
    throw new Error(
      "AI text metadata panel did not reopen from the three-dots menu",
    );
  }
}

export async function verifyAiTextSplitPaneToggles({ shadow, dom }) {
  // Left original viewer: "Close this viewer" hides it, leaving only AI text.
  const pdfActionsTrigger = shadow.querySelector(
    '[data-testid="ai-text-original-pane"] [aria-label="Open PDF actions"]',
  );
  if (!pdfActionsTrigger) {
    throw new Error("PDF actions menu trigger missing in original pane");
  }
  click(dom, pdfActionsTrigger);
  await wait(80);
  const closeThisViewerItem = shadow.querySelector(
    '[data-testid="ai-text-original-close-menu-item"]',
  );
  if (!closeThisViewerItem) {
    throw new Error(
      "'Close this viewer' menu item missing from the original PDF actions menu",
    );
  }
  click(dom, closeThisViewerItem);
  await wait(150);

  if (shadow.querySelector('[data-testid="ai-text-original-pane"]')) {
    throw new Error(
      "Original viewer did not hide after clicking 'Close this viewer'",
    );
  }
  if (!shadow.querySelector('[data-testid="ai-text-split-pane"]')) {
    throw new Error(
      "AI text pane disappeared when the original viewer was hidden",
    );
  }

  // Right AI text view: "Show original file" restores the left viewer.
  const rightActionsTriggerAfterHide = shadow.querySelector(
    '[data-testid="ai-text-split-pane"] [data-testid="ai-text-view-actions"]',
  );
  if (!rightActionsTriggerAfterHide) {
    throw new Error(
      "AI text view actions button missing after hiding the original viewer",
    );
  }
  click(dom, rightActionsTriggerAfterHide);
  await wait(80);
  const showOriginalItem = shadow.querySelector(
    '[data-testid="ai-text-show-original-menu-item"]',
  );
  if (!showOriginalItem) {
    throw new Error(
      "'Show original file' menu item missing from AI text view actions menu",
    );
  }
  click(dom, showOriginalItem);
  await wait(200);

  if (!shadow.querySelector('[data-testid="ai-text-original-pane"]')) {
    throw new Error(
      "Original viewer did not reappear after clicking 'Show original file'",
    );
  }
  if (!shadow.querySelector('[data-testid="ai-text-split-resizer"]')) {
    throw new Error("Split resizer did not reappear with the original viewer");
  }
}
