import { createRequire } from "module";
import { join } from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

export const PLUGIN_DIR = join(fileURLToPath(new URL("../", import.meta.url)));

export const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.customElements = dom.window.customElements;
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (
    /^(HTML|SVG|CSS|DOM|Event|Pointer|Touch|UI|Range|Node|Element|Text|Attr|NamedNodeMap|MutationObserver|IntersectionObserver|CustomElementRegistry|ShadowRoot|DocumentFragment|Comment|Document|Window|Image|MouseEvent|KeyboardEvent|CustomEvent)/.test(
      key,
    )
  ) {
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
const blobMap = new Map();
let blobCounter = 0;
globalThis.URL.createObjectURL = (blob) => {
  const url = `blob:http://localhost/fake-blob-${++blobCounter}`;
  blobMap.set(url, blob);
  return url;
};
const origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (blobMap.has(url)) {
    const blob = blobMap.get(url);
    return {
      ok: true,
      status: 200,
      blob: async () => blob,
      text: async () =>
        typeof blob.text === "function"
          ? await blob.text()
          : Buffer.from(await blob.arrayBuffer()).toString("utf8"),
      arrayBuffer: async () => await blob.arrayBuffer(),
    };
  }
  return origFetch(input, init);
};

export const pluginRequire = createRequire(join(PLUGIN_DIR, "package.json"));
export const React = pluginRequire("react");

const View = ({ testID, style, children, ...rest }) =>
  React.createElement(
    "div",
    { ...rest, "data-testid": testID, style },
    children,
  );
const Text = ({ testID, style, children, ...rest }) =>
  React.createElement(
    "span",
    { ...rest, "data-testid": testID, style },
    children,
  );
const ScrollView = ({
  testID,
  style,
  contentContainerStyle,
  children,
  ...rest
}) =>
  React.createElement(
    "div",
    {
      ...rest,
      "data-testid": testID,
      style: { ...style, ...contentContainerStyle },
    },
    children,
  );
const ReactNative = { Platform: { OS: "web" }, View, Text, ScrollView };

export const fakeTree = {
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
    maxOpenTabs: 8,
    defaultViewMode: "icons",
    autoSaveEdits: true,
  },
  pdf: {
    defaultOpenBehavior: "viewer",
    defaultViewer: "embedpdf-viewer",
    defaultEditor: "embedpdf-editor",
    showThumbnailsByDefault: false,
    defaultZoom: "fit-width",
    showRotateControls: true,
    showDownloadButton: true,
  },
  xlsx: {
    defaultOpenBehavior: "viewer",
    defaultViewer: "extend-xlsx-viewer",
    defaultEditor: "extend-xlsx-editor",
    defaultZoom: "100",
    showFormulaBar: true,
    showHiddenSheets: false,
    showDownloadButton: true,
  },
  text: {
    defaultOpenBehavior: "editor",
    defaultViewer: "code-text-viewer",
    defaultEditor: "code-text-editor",
    showLineNumbers: true,
    wordWrap: true,
  },
  formats: {},
};

export const rpcInputs = [];
export const deletedDiskPaths = new Set();
export const simulatedDiskFiles = new Map([
  [
    "README.md",
    {
      content: Buffer.from("# Hello Paseo", "utf8"),
      contentType: "text/markdown",
      mtime: 1700000000000,
    },
  ],
]);

export const sdkClient = {
  useRpc: (rpcDef) => async (input) => {
    rpcInputs.push({ name: rpcDef?.name, input });
    if (rpcDef?.name === "file.save") {
      const nextBuffer =
        input.encoding === "utf8"
          ? Buffer.from(input.content, "utf8")
          : Buffer.from(input.content, "base64");
      const mtime = Date.now();
      const prev = simulatedDiskFiles.get(input.relPath);
      simulatedDiskFiles.set(input.relPath, {
        content: nextBuffer,
        contentType: prev?.contentType ?? "application/octet-stream",
        mtime,
      });
      return {
        path: input.relPath,
        size: nextBuffer.byteLength,
        mtime,
      };
    }
    if (
      rpcDef?.name === "files.pdf_wasm" ||
      rpcDef?.name === "files.xlsx_wasm"
    ) {
      return { dataUri: "data:application/wasm;base64,AGFzbQEAAAA=" };
    }
    if (input?.relPath !== undefined) {
      if (deletedDiskPaths.has(input.relPath)) {
        throw new Error(
          `Request failed: ENOENT: no such file or directory, realpath '/Users/yaoo/Documents/repos/tests/${input.relPath}' requestType=plugin.rpc.invoke.request code=handler_error`,
        );
      }
      const diskEntry = simulatedDiskFiles.get(input.relPath);
      if (diskEntry) {
        return {
          dataUri: `data:${diskEntry.contentType};base64,${diskEntry.content.toString("base64")}`,
          size: diskEntry.content.byteLength,
          mtime: diskEntry.mtime,
        };
      }
      return {
        dataUri:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      };
    }
    return { tree: fakeTree, truncated: false };
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

export const sdkClientUi = {
  SidebarRow: ({ icon, label, active, onPress }) =>
    React.createElement(
      "button",
      {
        "data-testid": "sidebar-row",
        "data-icon": icon,
        "data-active": String(Boolean(active)),
        onClick: onPress,
      },
      label,
    ),
  SettingsSection: ({ title, description, children }) =>
    React.createElement(
      "section",
      { "data-testid": `settings-section-${title}` },
      React.createElement("h2", null, title),
      description ? React.createElement("p", null, description) : null,
      children,
    ),
  SettingsCard: ({ children }) =>
    React.createElement("div", { "data-testid": "settings-card" }, children),
  SettingsSwitch: ({
    label,
    title,
    hint,
    description,
    value,
    onValueChange,
  }) => {
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
      }),
    );
  },
  SettingsSelect: ({
    label,
    title,
    hint,
    description,
    value,
    options,
    onValueChange,
  }) => {
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
          React.createElement(
            "option",
            { key: opt.value, value: opt.value },
            opt.label,
          ),
        ),
      ),
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
      React.createElement("button", { onClick: onPress }, actionLabel),
    );
  },
  Button: ({ label, onPress }) =>
    React.createElement("button", { onClick: onPress }, label),
};

export const runtimeRequire = (name) => {
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
