// Runtime test: evaluate the compiled client bundle inside JSDOM (sidebar, settings, FileSystem, docx).
import { readFileSync } from 'fs';
import { hostProps } from './runtime-test-host-props.mjs';
import {
  deletedDiskPaths,
  dom,
  pluginRequire,
  React,
  registerSimulatedFile,
  rpcInputs,
  runtimeRequire,
  simulatedDiskFiles,
  verifySettingsSidebarNavigation,
} from './runtime-test-harness.mjs';
import { verifyAiTextSplitViewAndMultiVersion } from './runtime-test-ai-text.mjs';
import {
  verifyNativeFilePanelAiTextPersistence,
  verifyNativeFilePanelMount,
  verifyNativeFilePanelRegistrations,
} from './runtime-test-file-panel.mjs';
import {
  createMinimalDocxBuffer,
  DOCX_FIXTURE_NAME,
  verifyDocxEditorSurface,
} from './runtime-test-docx.mjs';

// The Begonia .docx fixture must be on the simulated disk before the first
// tree fetch: the explorer's items are flattened from the initial RPC result.
{
  const { buffer, contentType } = await createMinimalDocxBuffer();
  registerSimulatedFile(DOCX_FIXTURE_NAME, buffer, contentType);
}
const bundleText = process.env.CLIENT_BUNDLE ?? '/tmp/fe-client-bundle.js';
const text2 = readFileSync(bundleText, 'utf-8');

// --- evaluate the bundle exactly like the app ------------------------------
const factory = eval(text2);
const exports = factory(runtimeRequire);
const contribute = exports.default;
if (typeof contribute !== 'function') throw new Error('bundle default export missing');

const fakeClient = {
  panels: [],
  filePanels: [],
  sidebarHeaderItems: [],
  screens: [],
  settingsScreens: [],
  commands: [],
  openedPanels: [],
  addWorkspacePanel: (c) => (fakeClient.panels.push(c), () => {}),
  addFilePanel: (c) => (fakeClient.filePanels.push(c), () => {}),
  addSidebarHeaderItem: (c) => (fakeClient.sidebarHeaderItems.push(c), () => {}),
  addScreen: (c) => (fakeClient.screens.push(c), () => {}),
  addSettingsScreen: (c) => (fakeClient.settingsScreens.push(c), () => {}),
  addCommandCenterItem: (c) => (fakeClient.commands.push(c), () => {}),
  openPanel: (id, options) => {
    fakeClient.openedPanels.push({ id, options });
  },
};
contribute(fakeClient);

const sidebarItem = fakeClient.sidebarHeaderItems.find((s) => s.id === 'autumn-studio');
if (!sidebarItem?.Component) throw new Error('no sidebar header item contributed');
console.log('✓ contributed sidebar header item:', sidebarItem.id, sidebarItem.title);

const screen = fakeClient.screens.find((s) => s.id === 'settings');
if (!screen?.Component) throw new Error('no settings screen contributed');
console.log('✓ contributed screen:', screen.id, screen.title);

const settingsScreen = fakeClient.settingsScreens.find((s) => s.id === 'settings');
if (!settingsScreen?.Component) throw new Error('no settingsScreen contributed');
console.log('✓ contributed settings screen:', settingsScreen.id, settingsScreen.title);

const panel = fakeClient.panels.find((p) => p.id === 'explorer');
const viewerPanel = fakeClient.panels.find((p) => p.id === 'file-viewer');
if (!panel?.Component) throw new Error('no explorer panel contributed');
if (!viewerPanel?.Component) throw new Error('no file-viewer panel contributed');
console.log('✓ contributed panels:', panel.id, 'and', viewerPanel.id);

// --- native file panel registrations ---------------------------------------
const textFilePanel = verifyNativeFilePanelRegistrations(fakeClient.filePanels);
console.log(
  `✓ contributed ${fakeClient.filePanels.length} native file panels (pdf, spreadsheet, document, slides, image, text)`,
);

// --- render sidebar item & settings screen ---------------------------------
const { createRoot } = pluginRequire('react-dom/client');
const { QueryClient, QueryClientProvider } = pluginRequire('@tanstack/react-query');

const sidebarHost = document.createElement('div');
document.body.appendChild(sidebarHost);
const sidebarRoot = createRoot(sidebarHost);
let openedScreenInput = null;
sidebarRoot.render(
  React.createElement(sidebarItem.Component, {
    ...hostProps,
    currentScreen: null,
    openScreen: (input) => {
      openedScreenInput = input;
    },
    openPopover: () => {},
  }),
);
await new Promise((r) => setTimeout(r, 80));
const sidebarBtn = sidebarHost.querySelector('[data-testid="sidebar-row"]');
if (!sidebarBtn || sidebarBtn.textContent !== 'Autumn Studio') {
  throw new Error('SidebarRow for Autumn Studio not rendered');
}
sidebarBtn.click();
if (!openedScreenInput || openedScreenInput.screenId !== 'settings') {
  throw new Error('Clicking Autumn Studio sidebar item did not open settings screen');
}
console.log('✓ clicking Autumn Studio sidebar item opens settings screen');

const settingsHost = document.createElement('div');
document.body.appendChild(settingsHost);
const settingsRoot = createRoot(settingsHost);
settingsRoot.render(
  React.createElement(screen.Component, {
    ...hostProps,
    params: {},
  }),
);
await new Promise((r) => setTimeout(r, 80));
await verifySettingsSidebarNavigation(settingsHost);
console.log(
  '✓ settings screen rendered left sidebar (General, PDF, Excel, More Formats) and switched sections on click',
);

// --- render the explorer panel with react-dom -------------------------
const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);

const props = {
  ...hostProps,
  context: 'workspace',
  workspaceId: 'ws-test',
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
root.render(
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(panel.Component, props),
  ),
);

await new Promise((r) => setTimeout(r, 600));

// --- assertions -------------------------------------------------------------
const islandDiv = host.querySelector('div');
if (!islandDiv) throw new Error('island div not rendered');
const shadow = islandDiv.shadowRoot;
if (!shadow) throw new Error('shadow root not attached');

const styleEl = [...shadow.querySelectorAll('style')].find(
  (el) => (el.textContent ?? '').length >= 10000,
);
if (!styleEl) {
  console.error(
    'shadow children:',
    [...shadow.children].map((c) => `${c.tagName}:${(c.textContent ?? '').length}`),
  );
  throw new Error('tailwind stylesheet missing from shadow root');
}
console.log(
  `✓ shadow root attached, stylesheet ${Math.round(styleEl.textContent.length / 1024)}KB`,
);

const fsRoot = shadow.querySelector('[data-slot="file-system"]');
if (!fsRoot) throw new Error('FileSystem root not rendered');
console.log('✓ FileSystem root rendered');

const treeRpcCall = rpcInputs.find((r) => r.name === 'files.tree');
if (!treeRpcCall || treeRpcCall.input?.workspaceId !== 'ws-test') {
  throw new Error('tree RPC not invoked with workspaceId');
}
console.log('✓ FileSystem structure rendered, RPC invoked for', treeRpcCall.input.workspaceId);

// --- test clicking a file opens it in-place with Go Back and More menu ------
const fileButtons = [...shadow.querySelectorAll('button')];
const previewBtn = fileButtons.find((btn) => (btn.textContent ?? '').includes('preview.png'));
if (!previewBtn) {
  throw new Error('preview.png file button not found in icons view');
}
previewBtn.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
await new Promise((r) => setTimeout(r, 300));

const inPlaceHeader = shadow.querySelector('[data-slot="file-system-inplace-header"]');
if (!inPlaceHeader) {
  throw new Error('In-place viewer header did not render after opening preview.png');
}
const backBtn = inPlaceHeader.querySelector('[aria-label="Back to file tree"]');
const moreBtn = inPlaceHeader.querySelector('[aria-label="More actions"]');
if (!backBtn) throw new Error('Go Back button missing in in-place viewer header');
if (!moreBtn) throw new Error('More actions button missing in in-place viewer header');
console.log('✓ clicking file opened in-place viewer with Go Back button and top-right More button');

backBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
if (shadow.querySelector('[data-slot="file-system-inplace-header"]')) {
  throw new Error('In-place header should close after clicking Go Back button');
}
console.log('✓ Go Back button returns to the file tree UI');

// --- test defaultOpenBehavior="editor" save -> Go Back -> reopen preserves edits ---
const findReadmeButton = () =>
  [...shadow.querySelectorAll('button')].find((btn) =>
    (btn.textContent ?? '').includes('README.md'),
  );
const readmeBtn = findReadmeButton();
if (!readmeBtn) throw new Error('README.md button not found in icons view');
readmeBtn.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));

const editorTextarea = shadow.querySelector('[data-testid="code-text-editor-textarea"]');
if (!editorTextarea) throw new Error('README.md did not open in default editor mode');
if (editorTextarea.value !== '# Hello Paseo') {
  throw new Error(
    `Expected initial README.md content '# Hello Paseo', got '${editorTextarea.value}'`,
  );
}

// Verify Markdown Split Preview toggle works in .md editor
const previewToggleBtn = shadow.querySelector('[data-testid="markdown-preview-toggle"]');
if (!previewToggleBtn)
  throw new Error('Markdown Split Preview toggle button missing for README.md');
previewToggleBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
const mdPreview = shadow.querySelector('[data-testid="markdown-preview"]');
if (!mdPreview || !(mdPreview.textContent ?? '').includes('Hello Paseo')) {
  throw new Error('Markdown Split Preview pane did not render README.md heading');
}
console.log('✓ Markdown Split Preview toggle renders live Markdown preview alongside editor');

// Simulate editing text and immediately clicking Go Back (before 650ms debounce)
// to verify unmount flush + trackWorkspaceFileSave serialization
const nativeValueSetter = Object.getOwnPropertyDescriptor(
  dom.window.HTMLTextAreaElement.prototype,
  'value',
)?.set;
nativeValueSetter.call(editorTextarea, '# Updated Paseo');
editorTextarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));

const readmeBackBtn = shadow.querySelector(
  '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
);
if (!readmeBackBtn) throw new Error('Go Back button missing after editing README.md');
readmeBackBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

// Reopen README.md and verify the saved edits are shown (not stale initial blob)
const readmeBtnAgain = findReadmeButton();
if (!readmeBtnAgain) throw new Error('README.md button missing after returning to file tree');
readmeBtnAgain.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));

const reopenedTextarea = shadow.querySelector('[data-testid="code-text-editor-textarea"]');
if (!reopenedTextarea) throw new Error('Reopened README.md did not render editor textarea');
if (reopenedTextarea.value !== '# Updated Paseo') {
  throw new Error(
    `Stale content after Go Back & reopen: expected '# Updated Paseo', got '${reopenedTextarea.value}'`,
  );
}
console.log(
  '✓ editing file in default editor mode, clicking Go Back immediately, and reopening preserves saved edits',
);

// --- test external Mac filesystem edit while file is open updates content on window focus ---
simulatedDiskFiles.set('README.md', {
  content: Buffer.from('# Live Synced from Mac App on Focus', 'utf8'),
  contentType: 'text/markdown',
  mtime: Date.now() + 5_000,
});
dom.window.dispatchEvent(new dom.window.Event('focus'));
await new Promise((r) => setTimeout(r, 200));

const textareaAfterFocus = shadow.querySelector('[data-testid="code-text-editor-textarea"]');
if (!textareaAfterFocus || textareaAfterFocus.value !== '# Live Synced from Mac App on Focus') {
  throw new Error(
    `Expected open editor to sync on window focus, got '${textareaAfterFocus?.value}'`,
  );
}
console.log(
  '✓ external Mac filesystem edit while file is open syncs automatically on window focus',
);

// --- test external Mac filesystem edit after closing shows fresh disk content on reopen ---
const readmeBackBtn2 = shadow.querySelector(
  '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
);
if (!readmeBackBtn2) throw new Error('Go Back button missing before external Mac filesystem edit');
readmeBackBtn2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

simulatedDiskFiles.set('README.md', {
  content: Buffer.from('# Edited Externally on Mac Filesystem', 'utf8'),
  contentType: 'text/markdown',
  mtime: Date.now() + 10_000,
});

const readmeBtnAfterExternal = findReadmeButton();
if (!readmeBtnAfterExternal) {
  throw new Error('README.md button missing after external Mac filesystem edit');
}
readmeBtnAfterExternal.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));

const textareaAfterExternal = shadow.querySelector('[data-testid="code-text-editor-textarea"]');
if (!textareaAfterExternal) {
  throw new Error('README.md did not render editor textarea after external Mac edit');
}
if (textareaAfterExternal.value !== '# Edited Externally on Mac Filesystem') {
  throw new Error(
    `Stale cache after external Mac filesystem edit: expected '# Edited Externally on Mac Filesystem', got '${textareaAfterExternal.value}'`,
  );
}
console.log('✓ external Mac filesystem edit after in-app edit shows fresh content on reopen');

await verifyDocxEditorSurface({ shadow, dom, rpcInputs, reopenFileName: 'README.md' });

// Switch to Viewer mode and verify Cmd/Ctrl+F in-file text search + <mark> highlighting
const modeSwitcherBtn = [
  ...shadow.querySelectorAll('[data-testid="surface-mode-switcher"] button'),
].find((btn) => btn.textContent?.trim() === 'Viewer');
if (!modeSwitcherBtn) {
  throw new Error('Viewer mode button missing in SurfaceModeSwitcher');
}
modeSwitcherBtn.click();
await new Promise((r) => setTimeout(r, 150));

const findBtn = shadow.querySelector('[data-testid="text-search-toggle"]');
if (!findBtn) {
  throw new Error('In-file search toggle button missing in TextViewer toolbar');
}
findBtn.click();
await new Promise((r) => setTimeout(r, 80));

const searchInput = shadow.querySelector('[data-testid="text-search-input"]');
if (!searchInput) {
  throw new Error('In-file search input did not open in TextViewer');
}
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  'value',
)?.set;
nativeInputValueSetter.call(searchInput, 'Externally');
searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));

const marks = shadow.querySelectorAll('[data-testid="code-text-viewer"] mark');
if (marks.length !== 1 || marks[0]?.textContent !== 'Externally') {
  throw new Error(`Expected 1 highlighted <mark> for 'Externally', found ${marks.length}`);
}
console.log('✓ TextViewer in-file search highlights matches and supports navigation');

// dark theme flips the flag
const mount = [...shadow.children].find((el) => el.tagName === 'DIV');
if (!mount) throw new Error('mount div missing in shadow root');
root.render(
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(panel.Component, {
      ...props,
      theme: {
        colors: {
          ...props.theme.colors,
          surface0: '#18181b',
          foreground: '#e4e4e7',
        },
      },
    }),
  ),
);
await new Promise((r) => setTimeout(r, 120));
if (!mount.classList.contains('dark')) throw new Error('dark flag not applied for dark theme');
console.log('✓ dark flag flips with host theme');

// --- test File Viewer sub-tabs & Recent files in top-right More menu --------
const viewerHost = document.createElement('div');
document.body.appendChild(viewerHost);
const viewerRoot = createRoot(viewerHost);
viewerRoot.render(
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(viewerPanel.Component, props),
  ),
);
await new Promise((r) => setTimeout(r, 200));

// Use the in-place header More actions -> "Open file in new tab" on README.md (currently in Viewer mode)
const inPlaceMoreTrigger = shadow.querySelector(
  '[data-slot="file-system-inplace-header"] [aria-label="More actions"]',
);
if (!inPlaceMoreTrigger) {
  throw new Error('In-place More actions button not found for opening file in new tab');
}
inPlaceMoreTrigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));

const openInNewTabItem = [...shadow.querySelectorAll('[data-slot="dropdown-menu-item"]')].find(
  (el) => (el.textContent ?? '').includes('Open file in new tab'),
);
if (!openInNewTabItem) {
  throw new Error("'Open file in new tab' menu item not found in in-place More menu");
}
openInNewTabItem.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

// Also return to tree and open preview.png in a new tab via context menu or in-place menu
const backFromReadme = shadow.querySelector(
  '[data-slot="file-system-inplace-header"] [aria-label="Back to file tree"]',
);
backFromReadme?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));

// Verify explorer toolbar's own More actions menu also shows Recent files
const explorerMoreBtn = shadow.querySelector('[aria-label="More actions"]');
if (!explorerMoreBtn) throw new Error('explorer toolbar More actions button missing');
explorerMoreBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
const explorerRecentGroup = shadow.querySelector('[data-testid="file-system-recent-files"]');
if (!explorerRecentGroup) {
  throw new Error('Recent files section missing in explorer toolbar More actions menu');
}
// Close the menu before clicking preview.png
explorerMoreBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));

const previewBtnForTab = [...shadow.querySelectorAll('button')].find((btn) =>
  (btn.textContent ?? '').includes('preview.png'),
);
previewBtnForTab?.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

const previewMoreTrigger = shadow.querySelector(
  '[data-slot="file-system-inplace-header"] [aria-label="More actions"]',
);
previewMoreTrigger?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));

const openPreviewInTabItem = [...shadow.querySelectorAll('[data-slot="dropdown-menu-item"]')].find(
  (el) => (el.textContent ?? '').includes('Open file in new tab'),
);
openPreviewInTabItem?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));

const viewerShadow = viewerHost.querySelector('div')?.shadowRoot;
if (!viewerShadow) throw new Error('File Viewer shadow root not attached');

const closeReadmeTabBtn = viewerShadow.querySelector('[aria-label="Close README.md"]');
if (!closeReadmeTabBtn) {
  throw new Error('README.md sub-tab close button not found in File Viewer');
}
closeReadmeTabBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));

// Open the top-right More actions menu in File Viewer and verify Recent files lists closed README.md
const viewerTabBarMoreBtn = viewerShadow
  .querySelector('[role="tablist"]')
  ?.parentElement?.querySelector('[aria-label="More actions"]');
if (!viewerTabBarMoreBtn) {
  throw new Error('Top-right More actions button missing in File Viewer tab bar');
}
viewerTabBarMoreBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));

const recentFilesGroup = viewerShadow.querySelector('[data-testid="file-viewer-recent-files"]');
if (!recentFilesGroup) {
  throw new Error('Recent files section missing in File Viewer top-right More menu');
}
const closedReadmeRecentItem = viewerShadow.querySelector(
  '[data-testid="file-viewer-recent-item-README.md"]',
);
if (!closedReadmeRecentItem) {
  throw new Error('Closed README.md missing from Recent files section in File Viewer More menu');
}
const readmeRecentIcon = closedReadmeRecentItem.querySelector('svg[data-icon-token]');
const previewRecentIcon = viewerShadow.querySelector(
  '[data-testid="file-viewer-recent-item-preview.png"] svg[data-icon-token]',
);
if (
  readmeRecentIcon?.getAttribute('data-icon-token') !== 'markdown' ||
  previewRecentIcon?.getAttribute('data-icon-token') !== 'image'
) {
  throw new Error(
    `Expected distinct file-type icons in Recent files menu (markdown & image), got ${readmeRecentIcon?.getAttribute('data-icon-token')} and ${previewRecentIcon?.getAttribute('data-icon-token')}`,
  );
}
closedReadmeRecentItem.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

if (!viewerShadow.querySelector('[data-testid="file-viewer-tab-README.md"]')) {
  throw new Error('Clicking closed README.md in Recent files menu did not reopen its tab');
}

// Verify ArrowLeft / ArrowRight keyboard navigation on the File Viewer tablist
const tablist = viewerShadow.querySelector('[role="tablist"]');
if (!tablist) throw new Error('File Viewer tablist missing');
tablist.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
const previewTabButton = viewerShadow.querySelector(
  '[data-testid="file-viewer-tab-preview.png"] [role="tab"]',
);
if (previewTabButton?.getAttribute('aria-selected') !== 'true') {
  throw new Error('ArrowLeft keydown on tablist did not switch active sub-tab to preview.png');
}

// Close README.md tab, simulate README.md being moved/deleted on filesystem, then click it in Recent files
viewerShadow
  .querySelector('[aria-label="Close README.md"]')
  ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
deletedDiskPaths.add('README.md');

viewerShadow
  .querySelector('[role="tablist"]')
  ?.parentElement?.querySelector('[aria-label="More actions"]')
  ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));

viewerShadow
  .querySelector('[data-testid="file-viewer-recent-item-README.md"]')
  ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

const missingFileNotice = viewerShadow.querySelector('[data-testid="file-viewer-missing-file"]');
if (!missingFileNotice || !(missingFileNotice.textContent ?? '').includes('was moved or deleted')) {
  throw new Error('Missing-file friendly reminder was not displayed for deleted README.md');
}
if ((missingFileNotice.textContent ?? '').includes('requestType=plugin.rpc.invoke.request')) {
  throw new Error('Raw RPC handler_error leaked into missing-file UI');
}
const missingRecentList = viewerShadow.querySelector(
  '[data-testid="file-viewer-missing-recent-files"]',
);
const missingRecentPreviewItem = viewerShadow.querySelector(
  '[data-testid="file-viewer-missing-recent-item-preview.png"]',
);
if (!missingRecentList || !missingRecentPreviewItem) {
  throw new Error(
    'Recent files list below missing-file notice did not render remaining recent files',
  );
}
missingRecentPreviewItem.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));
if (viewerShadow.querySelector('[data-testid="file-viewer-tab-README.md"]')) {
  throw new Error(
    'Clicking another recent file from missing-file notice should close the missing file tab',
  );
}
console.log(
  '✓ File Viewer top-right More menu shows file-type icons, reopens closed tabs, handles moved/deleted files with Recent files below, and supports keyboard tab navigation',
);

await verifyAiTextSplitViewAndMultiVersion({
  shadow,
  dom,
  simulatedDiskFiles,
});
console.log(
  "✓ AI Text Mode opens right-hand split view, switches button to 'AI text again', generates multiple .autumn/ versions with metadata, and switches versions",
);

// --- native file panel surface mounts over a PluginFile ---------------------
await verifyNativeFilePanelMount({
  filePanel: textFilePanel,
  hostProps,
  pluginRequire,
  simulatedDiskFiles,
});
console.log(
  '✓ native file panel renders the island viewer from PluginFile.url() (workspace-relative identity, no read RPC)',
);

await verifyNativeFilePanelAiTextPersistence({
  filePanel: fakeClient.filePanels.find((p) => p.id === 'pdf'),
  hostProps,
  pluginRequire,
});
console.log(
  '✓ native pdf panel persists the AI Text split through PluginTab.state and re-opens it on remount',
);

// unmount cleans up
viewerRoot.unmount();
root.unmount();
sidebarRoot.unmount();
settingsRoot.unmount();
await new Promise((r) => setTimeout(r, 50));
console.log('RUNTIME TEST OK');
process.exit(0);
