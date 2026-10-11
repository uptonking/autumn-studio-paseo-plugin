// Runtime test: evaluate the compiled client bundle the way the app's
// evaluate.ts does, mount the plugin contributions with react-dom in jsdom,
// and assert:
// 1. Left sidebar header item ("File Explorer") opens the settings screen.
// 2. Settings screen renders General and PDF sections.
// 3. File Explorer panel renders inside its ShadowRoot.
// 4. Clicking a file opens it in-place by default with a Go Back button and
//    top-right More (...) menu ("Open file in dialog", "Open file in new tab").
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const PLUGIN_DIR = join(fileURLToPath(new URL("../", import.meta.url)));
const bundleText =
  process.env.CLIENT_BUNDLE ?? "/tmp/fe-client-bundle.js";
const text2 = readFileSync(bundleText, "utf-8");

// --- jsdom as the renderer environment -------------------------------------
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.customElements = dom.window.customElements;
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (/^(HTML|SVG|CSS|DOM|Event|Pointer|Touch|UI|Range|Node|Element|Text|Attr|NamedNodeMap|MutationObserver|IntersectionObserver|CustomElementRegistry|ShadowRoot|DocumentFragment|Comment|Document|Window|Image|Blob|File|FormData|URL|URLSearchParams|Headers|Request|Response|AbortController|ReadableStream|WritableStream)/.test(key)) {
    try {
      Object.defineProperty(globalThis, key, {
        value: dom.window[key],
        configurable: true,
        writable: true,
      });
    } catch {}
  }
}
globalThis.matchMedia =
  dom.window.matchMedia ??
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }));
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
if (!globalThis.Element.prototype.getAnimations) {
  globalThis.Element.prototype.getAnimations = () => [];
}
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:http://localhost/fake-blob";
}

// --- host module map (mirrors evaluate.ts runtimeRequire) ------------------
const pluginRequire = createRequire(join(PLUGIN_DIR, "package.json"));
const React = pluginRequire("react");

const View = "div";
const Text = "span";
const ScrollView = "div";
const ReactNative = { Platform: { OS: "web" }, View, Text, ScrollView };

const fakeTree = {
  kind: "folder",
  path: "/",
  name: "ws",
  children: [
    {
      kind: "folder",
      path: "docs/",
      name: "docs/",
      children: [
        {
          kind: "file",
          path: "docs/guide.pdf",
          name: "guide.pdf",
          size: 12345,
          mtime: Date.now(),
          contentType: "application/pdf",
        },
      ],
    },
    {
      kind: "file",
      path: "preview.png",
      name: "preview.png",
      size: 512,
      mtime: Date.now(),
      contentType: "image/png",
    },
    {
      kind: "file",
      path: "README.md",
      name: "README.md",
      size: 42,
      mtime: Date.now(),
      contentType: "text/markdown",
    },
  ],
};

let currentSettingsData = {
  general: {
    enabled: true,
    fileOpenMode: "in-place",
    defaultViewMode: "icons",
  },
  pdf: {
    showThumbnailsByDefault: false,
    defaultZoom: "fit-width",
    showRotateControls: true,
    showDownloadButton: true,
  },
  formats: {},
};

const rpcInputs = [];
const sdkClient = {
  useRpc: () => async (input) => {
    rpcInputs.push(input);
    return input.relPath !== undefined
      ? { dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
      : { tree: fakeTree, truncated: false };
  },
  useSettings: () => ({
    status: "ready",
    values: currentSettingsData,
    revision: "rev-1",
    saving: false,
    saveError: null,
    save: async (nextValues) => {
      currentSettingsData = nextValues;
      return true;
    },
    reset: async () => true,
    reload: async () => {},
  }),
  useToast: () => ({ show() {}, error() {} }),
  copyText: async () => {},
};

const sdkClientUi = {
  SidebarRow: ({ icon, label, active, onPress }) =>
    React.createElement(
      "button",
      {
        "data-testid": "sidebar-row",
        "data-icon": icon,
        "data-active": String(Boolean(active)),
        onClick: onPress,
      },
      label
    ),
  SettingsSection: ({ title, description, children }) =>
    React.createElement(
      "section",
      { "data-testid": `settings-section-${title}` },
      React.createElement("h2", null, title),
      description ? React.createElement("p", null, description) : null,
      children
    ),
  SettingsCard: ({ children }) =>
    React.createElement("div", { "data-testid": "settings-card" }, children),
  SettingsSwitch: ({ label, title, hint, description, value, onValueChange }) => {
    const displayLabel = label ?? title;
    const displayHint = hint ?? description;
    return React.createElement(
      "label",
      { "data-testid": `settings-switch-${displayLabel}` },
      React.createElement("span", null, displayLabel),
      displayHint ? React.createElement("span", null, displayHint) : null,
      React.createElement("input", {
        type: "checkbox",
        checked: value,
        onChange: (e) => onValueChange(e.target.checked),
      })
    );
  },
  SettingsSelect: ({ label, title, hint, description, value, options, onValueChange }) => {
    const displayLabel = label ?? title;
    const displayHint = hint ?? description;
    return React.createElement(
      "div",
      { "data-testid": `settings-select-${displayLabel}` },
      React.createElement("span", null, displayLabel),
      displayHint ? React.createElement("span", null, displayHint) : null,
      React.createElement(
        "select",
        {
          value,
          onChange: (e) => onValueChange(e.target.value),
        },
        options.map((opt) =>
          React.createElement("option", { key: opt.value, value: opt.value }, opt.label)
        )
      )
    );
  },
  SettingsAction: ({ label, title, hint, description, actionLabel, onPress }) => {
    const displayLabel = label ?? title;
    const displayHint = hint ?? description;
    return React.createElement(
      "div",
      { "data-testid": `settings-action-${displayLabel}` },
      React.createElement("span", null, displayLabel),
      displayHint ? React.createElement("span", null, displayHint) : null,
      React.createElement("button", { onClick: onPress }, actionLabel)
    );
  },
  Button: ({ label, onPress }) =>
    React.createElement("button", { onClick: onPress }, label),
};

const runtimeRequire = (name) => {
  switch (name) {
    case "react":
      return pluginRequire("react");
    case "react/jsx-runtime":
      return pluginRequire("react/jsx-runtime");
    case "react-native":
      return ReactNative;
    case "@tanstack/react-query":
      return pluginRequire("@tanstack/react-query");
    case "zod":
      return pluginRequire("zod");
    case "@getpaseo/plugin":
      return {
        defineRpc: (d) => d,
        defineSettings: (d) => d,
      };
    case "@getpaseo/plugin/client":
      return sdkClient;
    case "@getpaseo/plugin/client/ui":
      return sdkClientUi;
    default:
      throw new Error(`unexpected require: ${name}`);
  }
};

// --- evaluate the bundle exactly like the app ------------------------------
const factory = eval(text2);
const exports = factory(runtimeRequire);
const contribute = exports.default;
if (typeof contribute !== "function") throw new Error("bundle default export missing");

const fakeClient = {
  panels: [],
  sidebarHeaderItems: [],
  screens: [],
  settingsScreens: [],
  commands: [],
  openedPanels: [],
  addWorkspacePanel: (c) => (fakeClient.panels.push(c), () => {}),
  addSidebarHeaderItem: (c) => (fakeClient.sidebarHeaderItems.push(c), () => {}),
  addScreen: (c) => (fakeClient.screens.push(c), () => {}),
  addSettingsScreen: (c) => (fakeClient.settingsScreens.push(c), () => {}),
  addCommandCenterItem: (c) => (fakeClient.commands.push(c), () => {}),
  openPanel: (id, options) => {
    fakeClient.openedPanels.push({ id, options });
  },
};
contribute(fakeClient);

const sidebarItem = fakeClient.sidebarHeaderItems.find((s) => s.id === "file-explorer");
if (!sidebarItem?.Component) throw new Error("no sidebar header item contributed");
console.log("✓ contributed sidebar header item:", sidebarItem.id, sidebarItem.title);

const screen = fakeClient.screens.find((s) => s.id === "settings");
if (!screen?.Component) throw new Error("no settings screen contributed");
console.log("✓ contributed screen:", screen.id, screen.title);

const settingsScreen = fakeClient.settingsScreens.find((s) => s.id === "settings");
if (!settingsScreen?.Component) throw new Error("no settingsScreen contributed");
console.log("✓ contributed settings screen:", settingsScreen.id, settingsScreen.title);

const panel = fakeClient.panels.find((p) => p.id === "file-explorer");
const viewerPanel = fakeClient.panels.find((p) => p.id === "file-viewer");
if (!panel?.Component) throw new Error("no file-explorer panel contributed");
if (!viewerPanel?.Component) throw new Error("no file-viewer panel contributed");
console.log("✓ contributed panels:", panel.id, "and", viewerPanel.id);

// --- render sidebar item & settings screen ---------------------------------
const { createRoot } = pluginRequire("react-dom/client");
const { QueryClient, QueryClientProvider } = pluginRequire("@tanstack/react-query");

const hostProps = {
  host: { id: "host-1", label: "Local" },
  theme: {
    colors: {
      surface0: "#ffffff",
      surface1: "#f4f4f5",
      surface2: "#e4e4e7",
      border: "#dddddd",
      foreground: "#18181b",
      foregroundMuted: "#71717a",
      accent: "#2563eb",
      accentForeground: "#ffffff",
      statusSuccess: "#22c55e",
      statusWarning: "#f59e0b",
      statusDanger: "#ef4444",
    },
  },
  layout: { compact: false, platform: "web" },
};

const sidebarHost = document.createElement("div");
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
  })
);
await new Promise((r) => setTimeout(r, 80));
const sidebarBtn = sidebarHost.querySelector('[data-testid="sidebar-row"]');
if (!sidebarBtn || sidebarBtn.textContent !== "File Explorer") {
  throw new Error("SidebarRow for File Explorer not rendered");
}
sidebarBtn.click();
if (!openedScreenInput || openedScreenInput.screenId !== "settings") {
  throw new Error("Clicking File Explorer sidebar item did not open settings screen");
}
console.log("✓ clicking File Explorer sidebar item opens settings screen");

const settingsHost = document.createElement("div");
document.body.appendChild(settingsHost);
const settingsRoot = createRoot(settingsHost);
settingsRoot.render(
  React.createElement(screen.Component, {
    ...hostProps,
    params: {},
  })
);
await new Promise((r) => setTimeout(r, 80));
const generalSection = settingsHost.querySelector('[data-testid="settings-section-General"]');
const pdfSection = settingsHost.querySelector('[data-testid="settings-section-PDF"]');
const textSection = settingsHost.querySelector('[data-testid="settings-section-Code & Text"]');
if (!generalSection || !pdfSection || !textSection) {
  throw new Error("General, PDF, or Code & Text settings section missing from settings screen");
}
console.log("✓ settings screen rendered General, PDF, and Code & Text sections");

// --- render the File Explorer panel with react-dom -------------------------
const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);

const props = {
  ...hostProps,
  context: "workspace",
  workspaceId: "ws-test",
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
root.render(
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(panel.Component, props)
  )
);

await new Promise((r) => setTimeout(r, 600));

// --- assertions -------------------------------------------------------------
const islandDiv = host.querySelector("div");
if (!islandDiv) throw new Error("island div not rendered");
const shadow = islandDiv.shadowRoot;
if (!shadow) throw new Error("shadow root not attached");

const styleEl = [...shadow.querySelectorAll("style")].find(
  (el) => (el.textContent ?? "").length >= 10000
);
if (!styleEl) {
  console.error(
    "shadow children:",
    [...shadow.children].map((c) => `${c.tagName}:${(c.textContent ?? "").length}`)
  );
  throw new Error("tailwind stylesheet missing from shadow root");
}
console.log(`✓ shadow root attached, stylesheet ${Math.round(styleEl.textContent.length / 1024)}KB`);

const fsRoot = shadow.querySelector('[data-slot="file-system"]');
if (!fsRoot) throw new Error("FileSystem root not rendered");
console.log("✓ FileSystem root rendered");

if (rpcInputs.length === 0 || rpcInputs[0].workspaceId !== "ws-test") {
  throw new Error("tree RPC not invoked with workspaceId");
}
console.log("✓ FileSystem structure rendered, RPC invoked for", rpcInputs[0].workspaceId);

// --- test clicking a file opens it in-place with Go Back and More menu ------
const fileButtons = [...shadow.querySelectorAll("button")];
const previewBtn = fileButtons.find((btn) => (btn.textContent ?? "").includes("preview.png"));
if (!previewBtn) {
  throw new Error("preview.png file button not found in icons view");
}
// Double-click in icons view opens the file using defaultFileOpenMode ("in-place")
previewBtn.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
await new Promise((r) => setTimeout(r, 300));

const inPlaceHeader = shadow.querySelector('[data-slot="file-system-inplace-header"]');
if (!inPlaceHeader) {
  throw new Error("In-place viewer header did not render after opening preview.png");
}
const backBtn = inPlaceHeader.querySelector('[aria-label="Back to file tree"]');
const moreBtn = inPlaceHeader.querySelector('[aria-label="More actions"]');
if (!backBtn) throw new Error("Go Back button missing in in-place viewer header");
if (!moreBtn) throw new Error("More actions button missing in in-place viewer header");
console.log("✓ clicking file opened in-place viewer with Go Back button and top-right More button");

// Click Go Back button to return to the file tree
backBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
if (shadow.querySelector('[data-slot="file-system-inplace-header"]')) {
  throw new Error("In-place header should close after clicking Go Back button");
}
console.log("✓ Go Back button returns to the file tree UI");

// dark theme flips the flag
const mount = [...shadow.children].find((el) => el.tagName === "DIV");
if (!mount) throw new Error("mount div missing in shadow root");
root.render(
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(panel.Component, {
      ...props,
      theme: {
        colors: {
          ...props.theme.colors,
          surface0: "#18181b",
          foreground: "#e4e4e7",
        },
      },
    })
  )
);
await new Promise((r) => setTimeout(r, 120));
if (!mount.classList.contains("dark")) throw new Error("dark flag not applied for dark theme");
console.log("✓ dark flag flips with host theme");

// unmount cleans up
root.unmount();
sidebarRoot.unmount();
settingsRoot.unmount();
await new Promise((r) => setTimeout(r, 50));
console.log("RUNTIME TEST OK");
process.exit(0);
