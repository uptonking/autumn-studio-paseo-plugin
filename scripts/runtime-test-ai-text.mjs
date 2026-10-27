// Runtime test helpers for AI Text Mode settings, toolbar button state machine,
// right-hand split view, multi-version .autumn/ storage, and version switching.

import {
  verifyAiTextMetadataPanel,
  verifyAiTextSplitPaneToggles,
} from './runtime-test-ai-text-chrome.mjs';

import { handleAiTextRpc, simulatedAutumnDocs } from './runtime-test-ai-text-mocks.mjs';

import { verifyAiTextTextPagesViewer } from './runtime-test-ai-text-text-pages.mjs';

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
  const byTestId = (testId) => settingsHost.querySelector(`[data-testid="${testId}"]`);
  const getSection = (title) =>
    settingsHost.querySelector(`[data-testid="settings-section-${title}"]`);
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value = predicate();
      if (value) return value;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const optionsOf = (select) =>
    [...select.querySelectorAll('option')].map((option) => option.value);

  const navAiText = byTestId('autumn-studio-settings-nav-ai-text');
  if (!navAiText) {
    throw new Error('Settings sidebar missing AI Text Mode navigation item');
  }
  if (!(navAiText.textContent ?? '').includes('On')) {
    throw new Error(
      `Expected AI Text Mode sidebar item to display 'On' badge, got '${navAiText.textContent}'`,
    );
  }
  click(navAiText);
  await sleep(80);

  const aiTextSection = getSection('AI Text Mode');
  if (!aiTextSection) {
    throw new Error(
      'Clicking AI Text Mode in settings sidebar did not render the AI Text Mode section',
    );
  }
  for (const tab of ['general', 'profiles', 'engines', 'advanced']) {
    if (!byTestId(`autumn-studio-ai-text-tab-${tab}`)) {
      throw new Error(`AI Text settings is missing the ${tab} tab`);
    }
  }

  const defaultViewerSelect = byTestId('settings-select-Default AI Text viewer')?.querySelector(
    'select',
  );
  if (!defaultViewerSelect || defaultViewerSelect.value !== 'text') {
    throw new Error(
      `Expected Default AI Text viewer to default to 'text', got '${defaultViewerSelect?.value}'`,
    );
  }
  const viewerOptions = optionsOf(defaultViewerSelect);
  assertIncludes(viewerOptions, 'text', 'Default AI Text viewer');
  assertIncludes(viewerOptions, 'layout-blocks', 'Default AI Text viewer');

  const defaultProfileSelect = byTestId('settings-select-Default parsing profile')?.querySelector(
    'select',
  );
  if (!defaultProfileSelect || defaultProfileSelect.value !== 'mineru-cloud-free') {
    throw new Error(
      `Expected Default parsing profile to default to 'mineru-cloud-free', got '${defaultProfileSelect?.value}'`,
    );
  }
  const profileOptions = optionsOf(defaultProfileSelect);
  assertIncludes(profileOptions, 'mineru-cloud-free', 'Default parsing profile');

  const openSplitSwitch = byTestId('settings-switch-Open split view by default')?.querySelector(
    'input[type="checkbox"]',
  );
  if (!openSplitSwitch || openSplitSwitch.checked) {
    throw new Error(
      "Expected 'Open split view by default' switch to be present and default to off",
    );
  }

  // Profiles tab: cards, editor, and preset creation.
  click(byTestId('autumn-studio-ai-text-tab-profiles'));
  await waitFor(() => getSection('Parsing profiles'), 'the Parsing profiles tab');
  if (
    !byTestId('autumn-studio-ai-text-profile-mineru-cloud-free') ||
    byTestId('autumn-studio-ai-text-profile-delete-mineru-cloud-free') ||
    byTestId('autumn-studio-ai-text-profile-docling-standard')
  ) {
    throw new Error(
      'The built-in cloud-free profile should exist, be marked non-deletable, and be the only pre-created profile',
    );
  }

  click(byTestId('autumn-studio-ai-text-profile-edit-mineru-cloud-free'));
  const editor = await waitFor(() => getSection('Profile'), 'the profile editor');
  if (!editor.querySelector('[data-testid="settings-select-Engine"] select')) {
    throw new Error('Profile editor is missing the engine select');
  }
  if (!editor.querySelector('[data-testid="settings-select-Route"] select')) {
    throw new Error('Profile editor is missing the route select');
  }
  click(byTestId('autumn-studio-setting-ai-text-profile-cancel'));
  await waitFor(
    () => getSection('Parsing profiles'),
    'the profile list after cancelling the editor',
  );

  // The preset trigger must hug its content instead of filling the card.
  const presetTrigger = byTestId('autumn-studio-setting-ai-text-profile-new');
  if (presetTrigger?.style?.alignSelf !== 'flex-start') {
    throw new Error(
      `'New profile from preset' should hug its content, got alignSelf '${presetTrigger?.style?.alignSelf}'`,
    );
  }
  click(presetTrigger);
  await waitFor(
    () => byTestId('autumn-studio-setting-ai-text-profile-preset-docling-vlm'),
    'the new-profile preset list',
  );
  click(byTestId('autumn-studio-setting-ai-text-profile-preset-docling-vlm'));
  await waitFor(() => getSection('Profile'), 'the preset profile editor');
  click(byTestId('autumn-studio-setting-ai-text-profile-cancel'));
  await waitFor(
    () => getSection('Parsing profiles'),
    'the profile list after cancelling the preset editor',
  );

  // Engines tab: fixed-order engine tabs and one panel at a time.
  click(byTestId('autumn-studio-ai-text-tab-engines'));
  await waitFor(() => getSection('Engines & setup'), 'the Engines & setup tab');
  if (!byTestId('autumn-studio-ai-text-engine-tabs')) {
    throw new Error('Engines tab is missing the engine tab bar');
  }
  // Fixed catalog order puts MinerU first; its panel is selected by default
  // and its details section starts expanded.
  const mineruCard = await waitFor(
    () => byTestId('autumn-studio-ai-text-engine-mineru'),
    'the MinerU engine panel',
  );
  const status = await waitFor(
    () => byTestId('autumn-studio-ai-text-engine-status-mineru'),
    'the MinerU environment status',
  );
  if (!(status.textContent ?? '').includes('Ready')) {
    throw new Error(`Expected MinerU environment to report Ready, got '${status.textContent}'`);
  }
  if (!(mineruCard.textContent ?? '').includes('4.0.12')) {
    throw new Error('MinerU engine panel did not render the detected version');
  }
  const detailsToggle = byTestId('autumn-studio-ai-text-engine-toggle-mineru');
  if (!(detailsToggle?.textContent ?? '').includes('▾')) {
    throw new Error('Engine details toggle should be a down-chevron when expanded');
  }
  if (byTestId('autumn-studio-ai-text-engine-op-docling-cli.update')) {
    throw new Error("Only the selected engine's panel should render its operations");
  }

  click(byTestId('autumn-studio-ai-text-engine-op-mineru-models.download'));
  await waitFor(() => {
    const card = byTestId('autumn-studio-ai-text-engine-mineru');
    return (card?.textContent ?? '').includes('Finished. Detection refreshed.');
  }, 'the MinerU operation to finish');

  click(byTestId('autumn-studio-ai-text-engine-tab-docling'));
  await waitFor(() => byTestId('autumn-studio-ai-text-engine-docling'), 'the Docling engine panel');
  const doclingUpdateBadge = await waitFor(
    () => byTestId('autumn-studio-ai-text-engine-update-docling'),
    'the Docling update badge',
  );
  if (!(doclingUpdateBadge.textContent ?? '').includes('2.142.0')) {
    throw new Error('Docling update badge did not show the latest version');
  }
  if (!byTestId('autumn-studio-ai-text-engine-storage-models-docling')) {
    throw new Error('Docling panel is missing the model cache storage row');
  }
  // Installed engines pin their version inputs to the installed release
  // instead of offering "latest".
  const doclingVersionInput = document.querySelector(
    '[data-testid="settings-input-Install · Version (blank = latest)"] input',
  );
  if (!doclingVersionInput || doclingVersionInput.value !== '2.53.0') {
    throw new Error(
      `Expected the installed Docling version input to hold '2.53.0', got '${doclingVersionInput?.value}'`,
    );
  }
  if (!byTestId('autumn-studio-ai-text-engine-op-docling-cli.update')) {
    throw new Error('Update action is missing while an update is available');
  }

  click(byTestId('autumn-studio-ai-text-engine-tab-local-ocr'));
  await waitFor(
    () => byTestId('autumn-studio-ai-text-engine-local-ocr'),
    'the local-ocr engine panel',
  );
  if (byTestId('autumn-studio-ai-text-engine-op-local-ocr-cli.uninstall')) {
    throw new Error('local-ocr must not offer engine lifecycle actions');
  }

  // Advanced tab: output root, PyPI mirror, and the storage dashboard.
  click(byTestId('autumn-studio-ai-text-tab-advanced'));
  const advanced = await waitFor(() => getSection('Storage'), 'the Advanced tab (Storage section)');
  const outputRoot = advanced.querySelector(
    '[data-testid="settings-input-Output root directory"] input',
  );
  if (!outputRoot || outputRoot.value !== '.autumn') {
    throw new Error(
      `Expected output root directory to default to '.autumn', got '${outputRoot?.value}'`,
    );
  }
  if (!advanced.textContent?.includes('Inside the workspace')) {
    throw new Error('Output root preview is missing for a relative root');
  }
  const statsRow = await waitFor(
    () => byTestId('autumn-studio-ai-text-stats-row-0'),
    'the storage dashboard stats row',
  );
  if (!(statsRow.textContent ?? '').includes('docs/report.pdf')) {
    throw new Error('Stats row is missing the source file');
  }
  if (!byTestId('autumn-studio-ai-text-stats-refresh')) {
    throw new Error('Storage dashboard is missing the Recalculate button');
  }
  const pypiSection = await waitFor(() => getSection('Package index'), 'the Package index section');
  const pypiSelect = pypiSection.querySelector(
    '[data-testid="settings-select-PyPI source"] select',
  );
  if (!pypiSelect || pypiSelect.value !== '') {
    throw new Error(`PyPI source should default to the official index, got '${pypiSelect?.value}'`);
  }
  // Settings render outside the plugin shadow root, so plugin Tailwind classes
  // do not load there. Custom rows must use inline RN/theme styles instead.
  if (advanced.querySelector('[class]')) {
    throw new Error('AI Text settings must not rely on plugin Tailwind classes in settings');
  }

  click(byTestId('autumn-studio-ai-text-tab-general'));
  await waitFor(() => getSection('AI Text Mode'), 'the General tab');
}

export async function verifyAiTextSplitViewAndMultiVersion({
  shadow,
  dom,
  rpcInputs,
  _simulatedDiskFiles,
}) {
  // Return to file tree if currently in an in-place file
  const existingBackBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  if (existingBackBtn) {
    existingBackBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
  }

  // AI Text Mode is PDF-only: unsupported formats must hide the toolbar button.
  const htmlBtn = [...shadow.querySelectorAll('button')].find((btn) =>
    (btn.textContent ?? '').includes('report.html'),
  );
  if (!htmlBtn) {
    throw new Error('report.html button not found in the explorer icons view');
  }
  htmlBtn.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  if (shadow.querySelector('[data-testid="ai-text-mode-button"]')) {
    throw new Error('AI Text Mode button must be hidden for non-PDF files such as report.html');
  }

  const htmlBackBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  htmlBackBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));

  // Open guide.pdf (the only format the AI Text Mode UI supports for now)
  const pdfBtn = [...shadow.querySelectorAll('button')].find((btn) =>
    (btn.textContent ?? '').includes('guide.pdf'),
  );
  if (!pdfBtn) {
    throw new Error('guide.pdf button not found in the explorer icons view');
  }
  pdfBtn.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));

  const aiTextBtn = shadow.querySelector('[data-testid="ai-text-mode-button"]');
  if (!aiTextBtn) {
    throw new Error('AI Text Mode button not rendered on toolbar for supported PDF guide.pdf');
  }
  if (
    !(aiTextBtn.textContent ?? '').includes('AI Text Mode') ||
    aiTextBtn.getAttribute('data-split-open') !== 'false'
  ) {
    throw new Error(
      `Expected initial button label 'AI Text Mode' with data-split-open='false', got '${aiTextBtn.textContent}'`,
    );
  }

  // 1st click: parses document into .autumn/ and opens right split view
  aiTextBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 220));

  const splitLayout = shadow.querySelector('[data-testid="ai-text-split-layout"]');
  const originalPane = shadow.querySelector('[data-testid="ai-text-original-pane"]');
  const splitResizer = shadow.querySelector('[data-testid="ai-text-split-resizer"]');
  const rightSplitPane = shadow.querySelector('[data-testid="ai-text-split-pane"]');
  if (!splitLayout || !originalPane || !splitResizer || !rightSplitPane) {
    throw new Error(
      'Clicking AI Text Mode did not open side-by-side split layout with original file on left, resizer, and AI text pane on right',
    );
  }

  const aiTextBtnAfterOpen = shadow.querySelector('[data-testid="ai-text-mode-button"]');
  if (
    !aiTextBtnAfterOpen ||
    !(aiTextBtnAfterOpen.textContent ?? '').includes('AI text again') ||
    aiTextBtnAfterOpen.getAttribute('data-split-open') !== 'true'
  ) {
    throw new Error(
      `Expected toolbar button to change to 'AI text again' while split view is showing, got '${aiTextBtnAfterOpen?.textContent}'`,
    );
  }

  if (!(rightSplitPane.textContent ?? '').includes('Extracted v1 for guide.pdf')) {
    throw new Error(
      `Expected right split pane to display extracted v1 content, got '${rightSplitPane.textContent}'`,
    );
  }

  const renderedTable = rightSplitPane.querySelector('[data-testid="markdown-table"]');
  if (!renderedTable || !(renderedTable.textContent ?? '').includes('Firefox')) {
    throw new Error(
      "Expected MarkdownPreview in right split pane to render Markdown pipe tables as [data-testid='markdown-table']",
    );
  }

  const blocksButton = rightSplitPane.querySelector('[data-testid="ai-text-mode-layout-blocks"]');
  if (!blocksButton) {
    throw new Error(
      'Expected Blocks toggle in the AI Text toolbar when the version has layout metadata',
    );
  }
  blocksButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(200);

  const blocksPanel = rightSplitPane.querySelector('[data-testid="ai-text-layout-blocks"]');
  if (!blocksPanel) {
    throw new Error('Clicking Blocks did not render the layout blocks panel');
  }
  if (!rightSplitPane.querySelector('[data-testid="ai-text-layout-page-1"]')) {
    throw new Error('Layout blocks panel is missing the page 1 group');
  }
  // The panel no longer repeats the version-wide "N blocks · M pages" summary;
  // page headers carry local counts and the metadata panel owns the totals.
  const panelText = blocksPanel.textContent ?? '';
  if (panelText.includes(' pages'))
    throw new Error(`Blocks panel duplicates the pages summary: ${panelText}`);
  const pageOneHeader = rightSplitPane.querySelector('[data-testid="ai-text-layout-page-1"] > div');
  if (!(pageOneHeader?.textContent ?? '').includes('3 blocks')) {
    throw new Error(`Page 1 header should report 3 blocks, got '${pageOneHeader?.textContent}'`);
  }

  const textBlock = rightSplitPane.querySelector('[data-testid="ai-text-layout-block-p1-b1"]');
  if (!textBlock) {
    throw new Error('Layout blocks panel is missing the p1-b1 text block');
  }
  textBlock.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  if (textBlock.getAttribute('aria-pressed') !== 'true') {
    throw new Error('Clicking a layout block did not mark it as the active block');
  }

  const imageBlock = rightSplitPane.querySelector('[data-testid="ai-text-layout-block-p1-b2"]');
  const assetImage = imageBlock?.querySelector('[data-testid="ai-text-asset-image"]');
  if (!imageBlock || !assetImage) {
    throw new Error('Image layout block did not render a real AiTextAssetImage thumbnail');
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (imageBlock.querySelector('[data-testid="ai-text-asset-image-loaded"]')) {
      break;
    }
    await sleep(50);
  }
  if (!imageBlock.querySelector('[data-testid="ai-text-asset-image-loaded"]')) {
    throw new Error('Image layout block never loaded its image asset through ai_text.asset.get');
  }

  const previewButton = rightSplitPane.querySelector('[data-testid="ai-text-mode-text"]');
  previewButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(80);

  await verifyAiTextMetadataPanel({ shadow, dom, rightSplitPane });

  // 2nd click ("AI text again"): generates v2 in .autumn/ and switches right split pane to v2
  aiTextBtnAfterOpen.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  if (!(rightSplitPane.textContent ?? '').includes('Extracted v2 for guide.pdf')) {
    throw new Error(
      "Clicking 'AI text again' did not update right split pane to newly generated v2 text file",
    );
  }

  const versionSelect = rightSplitPane.querySelector('[data-testid="ai-text-version-select"]');
  if (!versionSelect || versionSelect.querySelectorAll('option').length !== 2) {
    throw new Error(
      `Expected version selector in right split pane to have 2 versions, found ${versionSelect?.querySelectorAll('option').length}`,
    );
  }

  // Switch back to v1 in the right split pane
  const v1Option = [...versionSelect.querySelectorAll('option')].find((opt) =>
    opt.value.includes('_v1_'),
  );
  if (!v1Option) {
    throw new Error('v1 option missing from version selector dropdown');
  }
  versionSelect.value = v1Option.value;
  versionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  if (!(rightSplitPane.textContent ?? '').includes('Extracted v1 for guide.pdf')) {
    throw new Error('Selecting v1 in version dropdown did not switch content back to v1');
  }

  // Quick-switch pills are gone: the dropdown is the single switcher and the
  // count chip is compact.
  if (rightSplitPane.querySelector('[data-testid="ai-text-version-pills"]')) {
    throw new Error('Quick version pills should be removed in favor of the dropdown');
  }
  const countChip = rightSplitPane.querySelector('[data-testid="ai-text-version-count"]');
  if (!(countChip?.textContent ?? '').includes('2 Ver.')) {
    throw new Error(`Version count chip should read '2 Ver.', got '${countChip?.textContent}'`);
  }
  const v2Option = [...versionSelect.querySelectorAll('option')].find((opt) =>
    opt.value.includes('_v2_'),
  );
  if (!v2Option) throw new Error('v2 option missing from version selector dropdown');
  versionSelect.value = v2Option.value;
  versionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  if (!(rightSplitPane.textContent ?? '').includes('Extracted v2 for guide.pdf')) {
    throw new Error('Dropdown did not switch back to v2 after switching to v1');
  }

  await verifyAiTextSplitPaneToggles({ shadow, dom });

  await verifyAiTextTextPagesViewer({ shadow, dom, rpcInputs });

  // Close split pane and verify button reverts to "AI Text Mode" with badge "2"
  const closeSplitBtn = shadow.querySelector(
    '[data-testid="ai-text-split-pane"] [data-testid="ai-text-split-close"]',
  );
  if (!closeSplitBtn) {
    throw new Error('Close split view button missing in right split pane');
  }
  closeSplitBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));

  if (shadow.querySelector('[data-testid="ai-text-split-pane"]')) {
    throw new Error('Right split pane did not close after clicking close button');
  }
  const aiTextBtnAfterClose = shadow.querySelector('[data-testid="ai-text-mode-button"]');
  const versionBadge = shadow.querySelector('[data-testid="ai-text-button-version-badge"]');
  if (
    !aiTextBtnAfterClose ||
    !(aiTextBtnAfterClose.textContent ?? '').includes('AI Text Mode') ||
    versionBadge?.textContent !== '2'
  ) {
    throw new Error(
      `Expected button after closing split to be 'AI Text Mode' with badge '2', got '${aiTextBtnAfterClose?.textContent}'`,
    );
  }

  // Return to file tree so subsequent tests see the expected state
  const backBtn = shadow.querySelector(
    '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
  );
  backBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
}
