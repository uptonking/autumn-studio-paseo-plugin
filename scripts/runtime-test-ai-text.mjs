// Runtime test helpers for AI Text Mode settings, toolbar button state machine,
// right-hand split view, multi-version .autumn/ storage, and version switching.

import {
  verifyAiTextMetadataPanel,
  verifyAiTextSplitPaneToggles,
} from "./runtime-test-ai-text-chrome.mjs";

import {
  handleAiTextRpc,
  simulatedAutumnDocs,
} from "./runtime-test-ai-text-mocks.mjs";

export { handleAiTextRpc, simulatedAutumnDocs };

function assertIncludes(list, value, label) {
  if (!list.includes(value)) {
    throw new Error(`${label} is missing option '${value}'`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyAiTextSettingsSection(settingsHost) {

  const navAiText = settingsHost.querySelector(
    '[data-testid="file-explorer-settings-nav-ai-text"]',
  );
  if (!navAiText) {
    throw new Error("Settings sidebar missing AI Text Mode navigation item");
  }
  if (!(navAiText.textContent ?? "").includes("On")) {
    throw new Error(
      `Expected AI Text Mode sidebar item to display 'On' badge, got '${navAiText.textContent}'`,
    );
  }
  navAiText.click();
  await new Promise((r) => setTimeout(r, 60));

  const aiTextSection = settingsHost.querySelector(
    '[data-testid="settings-section-AI Text Mode"]',
  );
  const parsingSection = settingsHost.querySelector(
    '[data-testid="settings-section-Text Parsing Options"]',
  );
  if (!aiTextSection || !parsingSection) {
    throw new Error(
      "Clicking AI Text Mode in settings sidebar did not render AI Text Mode and Text Parsing Options sections",
    );
  }

  const agentSelect = aiTextSection.querySelector(
    '[data-testid="settings-select-Default AI agent"] select',
  );
  if (!agentSelect || agentSelect.value !== "pi") {
    throw new Error(
      `Expected Default AI agent select to default to 'pi', got '${agentSelect?.value}'`,
    );
  }

  const openSplitSwitch = aiTextSection.querySelector(
    '[data-testid="settings-switch-Open split view by default"] input[type="checkbox"]',
  );
  if (!openSplitSwitch || openSplitSwitch.checked) {
    throw new Error(
      "Expected 'Open split view by default' switch to be present and default to off",
    );
  }

  const defaultViewerSelect = aiTextSection.querySelector(
    '[data-testid="settings-select-Default AI Text viewer"] select',
  );
  if (!defaultViewerSelect || defaultViewerSelect.value !== "text") {
    throw new Error(
      `Expected Default AI Text viewer to default to 'text', got '${defaultViewerSelect?.value}'`,
    );
  }
  const defaultViewerOptions = [
    ...defaultViewerSelect.querySelectorAll("option"),
  ].map((opt) => opt.value);
  assertIncludes(defaultViewerOptions, "text", "Default AI Text viewer");
  assertIncludes(defaultViewerOptions, "layout-blocks", "Default AI Text viewer");

  const parserSelect = parsingSection.querySelector(
    '[data-testid="settings-select-Text parsing service"] select',
  );
  if (!parserSelect || parserSelect.value !== "mineru") {
    throw new Error(
      `Expected Text parsing service select to default to 'mineru', got '${parserSelect?.value}'`,
    );
  }
  const parserOptionValues = [...parserSelect.querySelectorAll("option")].map(
    (opt) => opt.value,
  );
  for (const expectedParser of [
    "mineru",
    "agent-vlm",
    "llamaparse",
    "azure-document-intelligence",
    "datalab",
  ]) {
    assertIncludes(parserOptionValues, expectedParser, "Text parsing service");
  }

  const has = (root, testId) =>
    Boolean(root?.querySelector(`[data-testid="${testId}"]`));
  const getSection = (title) =>
    settingsHost.querySelector(`[data-testid="settings-section-${title}"]`);

  const engineSection = getSection("MinerU Engine");
  const extractionSection = getSection("MinerU Extraction");
  if (!engineSection || !extractionSection) {
    throw new Error(
      "MinerU settings must render separate Engine and Extraction sections",
    );
  }

  const modeSelect = engineSection.querySelector(
    '[data-testid="settings-select-MinerU execution mode"] select',
  );
  if (!modeSelect || modeSelect.value !== "cloud-free") {
    throw new Error(
      `Expected MinerU execution mode to default to 'cloud-free', got '${modeSelect?.value}'`,
    );
  }
  if (has(extractionSection, "settings-switch-Extract layout metadata")) {
    throw new Error(
      "Cloud-free mode must not offer layout extraction; the free API is Markdown-only",
    );
  }
  if (!has(extractionSection, "settings-switch-Enable OCR")) {
    throw new Error("Cloud-free mode must expose cloud OCR settings");
  }
  if (has(extractionSection, "settings-select-MinerU model tier")) {
    throw new Error(
      "Cloud-free mode must not expose the local model tier setting",
    );
  }
  if (getSection("MinerU Advanced")) {
    throw new Error("Cloud-free mode must not render local advanced settings");
  }

  const view = settingsHost.ownerDocument.defaultView;
  const setMode = async (mode) => {
    const select = settingsHost.querySelector(
      '[data-testid="settings-select-MinerU execution mode"] select',
    );
    if (!select) {
      throw new Error("MinerU execution mode select disappeared");
    }
    const valueSetter = Object.getOwnPropertyDescriptor(
      view.HTMLSelectElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(select, mode);
    select.dispatchEvent(new view.Event("change", { bubbles: true }));
    await sleep(80);
  };

  await setMode("local-cli");
  const localEngine = getSection("MinerU Engine");
  const localExtraction = getSection("MinerU Extraction");
  if (!has(localEngine, "settings-input-MinerU Kit command")) {
    throw new Error("Local CLI mode must expose the MinerU Kit command");
  }
  if (has(localEngine, "settings-input-Local MinerU API URL")) {
    throw new Error("Local CLI mode must not expose the local API URL");
  }
  if (!has(localExtraction, "settings-select-MinerU model tier")) {
    throw new Error("Local CLI mode must expose the model tier");
  }
  if (!has(localExtraction, "settings-select-MinerU OCR mode")) {
    throw new Error("Local CLI mode must expose MinerU OCR mode");
  }
  if (!has(localExtraction, "settings-switch-Extract layout metadata")) {
    throw new Error("Local CLI mode must expose layout extraction");
  }
  if (has(localExtraction, "settings-switch-Enable OCR")) {
    throw new Error(
      "Local CLI mode must not show the cloud-only Enable OCR switch",
    );
  }
  if (!getSection("MinerU Advanced")) {
    throw new Error("Local CLI mode must render advanced local settings");
  }

  await setMode("local-api");
  const apiEngine = getSection("MinerU Engine");
  if (!has(apiEngine, "settings-input-MinerU Kit command")) {
    throw new Error(
      "Local API mode still needs mineru-kit as the client executable",
    );
  }
  if (!has(apiEngine, "settings-input-Local MinerU API URL")) {
    throw new Error("Local API mode must expose the local API URL");
  }
  if (has(getSection("MinerU Advanced"), "settings-input-Remote MinerU server URL")) {
    throw new Error("Local API mode must not expose the remote Server URL");
  }

  await setMode("cloud-token");
  const tokenEngine = getSection("MinerU Engine");
  const tokenExtraction = getSection("MinerU Extraction");
  if (!has(tokenEngine, "settings-input-MinerU API token")) {
    throw new Error("Token mode must expose the MinerU API token");
  }
  if (!has(tokenEngine, "settings-input-MinerU cloud endpoint")) {
    throw new Error("Token mode must expose the MinerU cloud endpoint");
  }
  if (!has(tokenExtraction, "settings-switch-Extract layout metadata")) {
    throw new Error("Token mode must expose layout extraction");
  }
  if (!has(tokenExtraction, "settings-switch-Enable OCR")) {
    throw new Error("Token mode must expose cloud OCR settings");
  }
  if (has(tokenExtraction, "settings-select-MinerU model tier")) {
    throw new Error("Token mode must not expose the local model tier");
  }
  if (getSection("MinerU Advanced")) {
    throw new Error("Token mode must not render local advanced settings");
  }

  await setMode("auto");
  const autoEngine = getSection("MinerU Engine");
  if (!has(autoEngine, "settings-input-MinerU Kit command")) {
    throw new Error("Auto mode must expose the MinerU Kit command");
  }
  if (!has(autoEngine, "settings-input-Local MinerU API URL")) {
    throw new Error("Auto mode must expose the local API URL");
  }
  if (!has(autoEngine, "settings-input-MinerU API token (optional)")) {
    throw new Error("Auto mode must allow an optional cloud token");
  }

  // Restore the default so later runtime checks see the original settings.
  await setMode("cloud-free");

  const environmentSection = settingsHost.querySelector(
    '[data-testid="settings-section-MinerU Environment"]',
  );
  if (!environmentSection) {
    throw new Error("MinerU Environment section was not rendered in settings");
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (settingsHost.querySelector('[data-testid="mineru-environment-status"]')) {
      break;
    }
    await sleep(50);
  }
  const environmentStatus = settingsHost.querySelector(
    '[data-testid="mineru-environment-status"]',
  );
  if (!environmentStatus) {
    throw new Error(
      "MinerU Environment status card never rendered detected values",
    );
  }
  const environmentText = environmentStatus.textContent ?? "";
  for (const expected of ["4.0.12", "uv-tool", "standard"]) {
    if (!environmentText.includes(expected)) {
      throw new Error(
        `Expected MinerU environment to show '${expected}', got '${environmentText}'`,
      );
    }
  }
  // Settings render outside the plugin shadow root, so Tailwind utilities do
  // not load there. The status must use inline RN/theme styles instead.
  if (environmentStatus.querySelectorAll("[style]").length < 2) {
    throw new Error("MinerU Environment status rows are missing host styles");
  }
  if (environmentSection.querySelector("[class]")) {
    throw new Error(
      "MinerU Environment must not rely on plugin Tailwind classes in settings",
    );
  }
}

export async function verifyAiTextSplitViewAndMultiVersion({
  shadow,
  dom,
  simulatedDiskFiles,
}) {
  // Return to file tree if currently in an in-place file
  const existingBackBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  if (existingBackBtn) {
    existingBackBtn.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 150));
  }

  // AI Text Mode is PDF-only: unsupported formats must hide the toolbar button.
  const htmlBtn = [...shadow.querySelectorAll("button")].find((btn) =>
    (btn.textContent ?? "").includes("report.html"),
  );
  if (!htmlBtn) {
    throw new Error("report.html button not found in File Explorer icons view");
  }
  htmlBtn.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  if (shadow.querySelector('[data-testid="ai-text-mode-button"]')) {
    throw new Error(
      "AI Text Mode button must be hidden for non-PDF files such as report.html",
    );
  }

  const htmlBackBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  htmlBackBtn?.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 150));

  // Open guide.pdf (the only format the AI Text Mode UI supports for now)
  const pdfBtn = [...shadow.querySelectorAll("button")].find((btn) =>
    (btn.textContent ?? "").includes("guide.pdf"),
  );
  if (!pdfBtn) {
    throw new Error("guide.pdf button not found in File Explorer icons view");
  }
  pdfBtn.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));

  const aiTextBtn = shadow.querySelector('[data-testid="ai-text-mode-button"]');
  if (!aiTextBtn) {
    throw new Error(
      "AI Text Mode button not rendered on toolbar for supported PDF guide.pdf",
    );
  }
  if (
    !(aiTextBtn.textContent ?? "").includes("AI Text Mode") ||
    aiTextBtn.getAttribute("data-split-open") !== "false"
  ) {
    throw new Error(
      `Expected initial button label 'AI Text Mode' with data-split-open='false', got '${aiTextBtn.textContent}'`,
    );
  }

  // 1st click: parses document into .autumn/ and opens right split view
  aiTextBtn.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 220));

  const splitLayout = shadow.querySelector(
    '[data-testid="ai-text-split-layout"]',
  );
  const originalPane = shadow.querySelector(
    '[data-testid="ai-text-original-pane"]',
  );
  const splitResizer = shadow.querySelector(
    '[data-testid="ai-text-split-resizer"]',
  );
  const rightSplitPane = shadow.querySelector(
    '[data-testid="ai-text-split-pane"]',
  );
  if (!splitLayout || !originalPane || !splitResizer || !rightSplitPane) {
    throw new Error(
      "Clicking AI Text Mode did not open side-by-side split layout with original file on left, resizer, and AI text pane on right",
    );
  }

  const aiTextBtnAfterOpen = shadow.querySelector(
    '[data-testid="ai-text-mode-button"]',
  );
  if (
    !aiTextBtnAfterOpen ||
    !(aiTextBtnAfterOpen.textContent ?? "").includes("AI text again") ||
    aiTextBtnAfterOpen.getAttribute("data-split-open") !== "true"
  ) {
    throw new Error(
      `Expected toolbar button to change to 'AI text again' while split view is showing, got '${aiTextBtnAfterOpen?.textContent}'`,
    );
  }

  if (
    !(rightSplitPane.textContent ?? "").includes(
      "Extracted v1 for guide.pdf",
    )
  ) {
    throw new Error(
      `Expected right split pane to display extracted v1 content, got '${rightSplitPane.textContent}'`,
    );
  }

  const renderedTable = rightSplitPane.querySelector(
    '[data-testid="markdown-table"]',
  );
  if (
    !renderedTable ||
    !(renderedTable.textContent ?? "").includes("Firefox")
  ) {
    throw new Error(
      "Expected MarkdownPreview in right split pane to render Markdown pipe tables as [data-testid='markdown-table']",
    );
  }

  const blocksButton = rightSplitPane.querySelector(
    '[data-testid="ai-text-mode-blocks"]',
  );
  if (!blocksButton) {
    throw new Error(
      "Expected Blocks toggle in the AI Text toolbar when the version has layout metadata",
    );
  }
  blocksButton.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await sleep(200);

  const blocksPanel = rightSplitPane.querySelector(
    '[data-testid="ai-text-layout-blocks"]',
  );
  if (!blocksPanel) {
    throw new Error("Clicking Blocks did not render the layout blocks panel");
  }
  if (!rightSplitPane.querySelector('[data-testid="ai-text-layout-page-1"]')) {
    throw new Error("Layout blocks panel is missing the page 1 group");
  }
  if (!(blocksPanel.textContent ?? "").includes("4 blocks")) {
    throw new Error(
      `Expected layout blocks header to report 4 blocks, got '${blocksPanel.textContent}'`,
    );
  }

  const textBlock = rightSplitPane.querySelector(
    '[data-testid="ai-text-layout-block-p1-b1"]',
  );
  if (!textBlock) {
    throw new Error("Layout blocks panel is missing the p1-b1 text block");
  }
  textBlock.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await sleep(80);
  if (textBlock.getAttribute("aria-pressed") !== "true") {
    throw new Error(
      "Clicking a layout block did not mark it as the active block",
    );
  }

  const imageBlock = rightSplitPane.querySelector(
    '[data-testid="ai-text-layout-block-p1-b2"]',
  );
  const assetImage = imageBlock?.querySelector(
    '[data-testid="ai-text-asset-image"]',
  );
  if (!imageBlock || !assetImage) {
    throw new Error(
      "Image layout block did not render a real AiTextAssetImage thumbnail",
    );
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (imageBlock.querySelector('[data-testid="ai-text-asset-image-loaded"]')) {
      break;
    }
    await sleep(50);
  }
  if (!imageBlock.querySelector('[data-testid="ai-text-asset-image-loaded"]')) {
    throw new Error(
      "Image layout block never loaded its image asset through ai_text.asset.get",
    );
  }

  const previewButton = rightSplitPane.querySelector(
    '[data-testid="ai-text-mode-preview"]',
  );
  previewButton?.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await sleep(80);

  await verifyAiTextMetadataPanel({ shadow, dom, rightSplitPane });

  // 2nd click ("AI text again"): generates v2 in .autumn/ and switches right split pane to v2
  aiTextBtnAfterOpen.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 200));

  if (
    !(rightSplitPane.textContent ?? "").includes(
      "Extracted v2 for guide.pdf",
    )
  ) {
    throw new Error(
      "Clicking 'AI text again' did not update right split pane to newly generated v2 text file",
    );
  }

  const versionSelect = rightSplitPane.querySelector(
    '[data-testid="ai-text-version-select"]',
  );
  if (!versionSelect || versionSelect.querySelectorAll("option").length !== 2) {
    throw new Error(
      `Expected version selector in right split pane to have 2 versions, found ${versionSelect?.querySelectorAll("option").length}`,
    );
  }

  // Switch back to v1 in the right split pane
  const v1Option = [...versionSelect.querySelectorAll("option")].find((opt) =>
    opt.value.includes("_v1_"),
  );
  if (!v1Option) {
    throw new Error("v1 option missing from version selector dropdown");
  }
  versionSelect.value = v1Option.value;
  versionSelect.dispatchEvent(
    new dom.window.Event("change", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 150));

  if (
    !(rightSplitPane.textContent ?? "").includes(
      "Extracted v1 for guide.pdf",
    )
  ) {
    throw new Error(
      "Selecting v1 in version dropdown did not switch right split pane content back to v1",
    );
  }

  // Test 1-click quick version pill switching back to v2
  const v2Pill = rightSplitPane.querySelector(
    '[data-testid="ai-text-version-pill-v2"]',
  );
  if (!v2Pill) {
    throw new Error("Quick version pill v2 missing in right split pane");
  }
  v2Pill.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  if (
    !(rightSplitPane.textContent ?? "").includes(
      "Extracted v2 for guide.pdf",
    )
  ) {
    throw new Error("Clicking v2 version pill did not switch back to v2");
  }

  await verifyAiTextSplitPaneToggles({ shadow, dom });

  // Close split pane and verify button reverts to "AI Text Mode" with badge "2"
  const closeSplitBtn = shadow.querySelector(
    '[data-testid="ai-text-split-pane"] [data-testid="ai-text-split-close"]',
  );
  if (!closeSplitBtn) {
    throw new Error("Close split view button missing in right split pane");
  }
  closeSplitBtn.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 120));

  if (shadow.querySelector('[data-testid="ai-text-split-pane"]')) {
    throw new Error("Right split pane did not close after clicking close button");
  }
  const aiTextBtnAfterClose = shadow.querySelector(
    '[data-testid="ai-text-mode-button"]',
  );
  const versionBadge = shadow.querySelector(
    '[data-testid="ai-text-button-version-badge"]',
  );
  if (
    !aiTextBtnAfterClose ||
    !(aiTextBtnAfterClose.textContent ?? "").includes("AI Text Mode") ||
    versionBadge?.textContent !== "2"
  ) {
    throw new Error(
      `Expected button after closing split to be 'AI Text Mode' with badge '2', got '${aiTextBtnAfterClose?.textContent}'`,
    );
  }

  // Return to file tree so subsequent tests see the expected state
  const backBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  backBtn?.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 120));
}
