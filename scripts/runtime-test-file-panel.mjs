// Runtime test for the native Paseo file panel surface: mounts the text
// family's contributed Component with a stubbed PluginFile over the compiled
// bundle and verifies the island viewer renders from PluginFile.url() with
// workspace-relative identity and no file.content read RPC.

import { dom, React, rpcInputs } from "./runtime-test-harness.mjs";

const EXPECTED_FILE_PANELS = [
  ["pdf", ["pdf"], 0],
  ["spreadsheet", ["xlsx", "xls"], 0],
  ["document", ["docx"], 0],
  ["slides", ["pptx"], 0],
  ["image", ["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"], 0],
  ["text", ["md", "txt", "ts", "tsx"], 15],
];

/** Asserts contribute() registered the six format-family file panels. */
export function verifyNativeFilePanelRegistrations(filePanels) {
  for (const [id, extensions, minFilenames] of EXPECTED_FILE_PANELS) {
    const filePanel = filePanels.find((p) => p.id === id);
    if (!filePanel?.Component) throw new Error(`no ${id} file panel contributed`);
    for (const extension of extensions) {
      if (!filePanel.files.extensions.includes(extension)) {
        throw new Error(`${id} file panel does not claim .${extension}`);
      }
    }
    if ((filePanel.files.filenames?.length ?? 0) < minFilenames) {
      throw new Error(`${id} file panel missing filename selectors`);
    }
  }
  const textFilePanel = filePanels.find((p) => p.id === "text");
  if (!textFilePanel.files.filenames.includes("Dockerfile")) {
    throw new Error("text file panel does not claim Dockerfile by name");
  }
  return textFilePanel;
}

export async function verifyNativeFilePanelMount({
  filePanel,
  hostProps,
  pluginRequire,
  simulatedDiskFiles,
}) {
  const { createRoot } = pluginRequire("react-dom/client");
  const { QueryClient, QueryClientProvider } = pluginRequire("@tanstack/react-query");

  const readmeEntry = simulatedDiskFiles.get("README.md");
  const readmeBlobUrl = URL.createObjectURL(
    new Blob([readmeEntry.content], { type: readmeEntry.contentType })
  );
  const pluginFileWrites = [];
  const pluginFile = {
    path: "/Users/yaoo/Documents/repos/tests/README.md",
    name: "README.md",
    extension: "md",
    size: readmeEntry.content.byteLength,
    modifiedAt: new Date(readmeEntry.mtime).toISOString(),
    mimeType: readmeEntry.contentType,
    readText: async () => readmeEntry.content.toString("utf8"),
    readBytes: async () => readmeEntry.content,
    url: async () => readmeBlobUrl,
    writeText: async () => {},
    writeBytes: async (bytes, options) => {
      pluginFileWrites.push({ bytes, options });
    },
    watch: () => () => {},
  };

  const rpcInputsBefore = rpcInputs.length;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(filePanel.Component, {
        ...hostProps,
        workspaceId: "ws-test",
        file: pluginFile,
        tab: {
          setModified: () => {},
          state: undefined,
          setState: () => {},
        },
        params: { path: "README.md" },
        revision: 1,
      })
    )
  );
  await new Promise((r) => setTimeout(r, 1500));

  const islandDiv = [...host.querySelectorAll("div")].find(
    (candidate) => candidate.shadowRoot
  );
  const shadow = islandDiv?.shadowRoot;
  if (!shadow) {
    console.error("file panel host content:", host.innerHTML.slice(0, 600));
    throw new Error("native file panel shadow root not attached");
  }
  const textSurface = shadow.querySelector(
    '[data-testid="code-text-viewer"], [data-testid="code-text-editor"]'
  );
  if (!textSurface) {
    console.error(
      "file panel testids:",
      [...shadow.querySelectorAll("[data-testid]")].map((el) =>
        el.getAttribute("data-testid")
      )
    );
    throw new Error("native file panel did not render the text surface");
  }
  // The stage sizes itself with flex-1, so something in its ancestor chain
  // must be a full-height flex column — without it the viewer collapses to
  // zero height and renders invisibly.
  const hasFullHeightFlexAncestor = (() => {
    let node = textSurface.parentElement;
    while (node && node !== shadow.host) {
      const cls = node.getAttribute("class") ?? "";
      if (/\bh-full\b/.test(cls) && /\bflex\b/.test(cls) && /\bflex-col\b/.test(cls)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  })();
  if (!hasFullHeightFlexAncestor) {
    throw new Error(
      "native file panel stage must sit inside a full-height flex-column frame"
    );
  }
  const nativePanelRpcCalls = rpcInputs.slice(rpcInputsBefore);
  if (nativePanelRpcCalls.some((r) => r.name === "file.content")) {
    throw new Error("native file panel must read through PluginFile, not file.content");
  }
  if (nativePanelRpcCalls.some((r) => r.name === "files.locate")) {
    throw new Error("relative params.path must resolve without files.locate");
  }
  root.unmount();
  host.remove();
  return { pluginFileWrites };
}

/**
 * Mounts the pdf family's native file panel for guide.pdf, opens the AI Text
 * split, and verifies the split state persists through PluginTab.state: the
 * tab records the write, and a remount with the recorded state re-opens the
 * split without any click.
 */
export async function verifyNativeFilePanelAiTextPersistence({
  filePanel,
  hostProps,
  pluginRequire,
}) {
  const { createRoot } = pluginRequire("react-dom/client");
  const { QueryClient, QueryClientProvider } = pluginRequire("@tanstack/react-query");

  const fakePdfBytes = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
  const guideUrl = URL.createObjectURL(
    new Blob([fakePdfBytes], { type: "application/pdf" })
  );
  const makeGuideFile = () => ({
    path: "/Users/yaoo/Documents/repos/tests/guide.pdf",
    name: "guide.pdf",
    extension: "pdf",
    size: fakePdfBytes.byteLength,
    modifiedAt: new Date(1700000000000).toISOString(),
    mimeType: "application/pdf",
    readText: async () => "",
    readBytes: async () => fakePdfBytes,
    url: async () => guideUrl,
    writeText: async () => {},
    writeBytes: async () => {},
    watch: () => () => {},
  });

  const mountPanel = async (tabState) => {
    const recordedStates = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(filePanel.Component, {
          ...hostProps,
          workspaceId: "ws-test",
          file: makeGuideFile(),
          tab: {
            setModified: () => {},
            state: tabState,
            setState: (next) => recordedStates.push(next),
          },
          params: { path: "guide.pdf" },
          revision: 1,
        })
      )
    );
    await new Promise((r) => setTimeout(r, 900));
    return { host, root, recordedStates };
  };

  // First mount: no persisted state. Opening the AI Text split must persist it.
  const first = await mountPanel(undefined);
  const firstShadow = [...first.host.querySelectorAll("div")].find(
    (candidate) => candidate.shadowRoot
  )?.shadowRoot;
  if (!firstShadow) throw new Error("pdf file panel shadow root not attached");
  const aiTextBtn = firstShadow.querySelector('[data-testid="ai-text-mode-button"]');
  if (!aiTextBtn) {
    throw new Error("AI Text Mode button missing from the native pdf panel");
  }
  aiTextBtn.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true })
  );
  await new Promise((r) => setTimeout(r, 400));
  if (!firstShadow.querySelector('[data-testid="ai-text-split-layout"]')) {
    throw new Error("AI Text split did not open in the native pdf panel");
  }
  const persistedOpen = first.recordedStates.find(
    (state) => state?.aiText?.splitOpen === true
  );
  if (!persistedOpen) {
    throw new Error(
      `opening the split did not persist aiText state; recorded: ${JSON.stringify(first.recordedStates)}`
    );
  }
  first.root.unmount();
  first.host.remove();

  // Second mount with the recorded state: the split must re-open on its own.
  const second = await mountPanel(persistedOpen);
  const secondShadow = [...second.host.querySelectorAll("div")].find(
    (candidate) => candidate.shadowRoot
  )?.shadowRoot;
  if (!secondShadow.querySelector('[data-testid="ai-text-split-layout"]')) {
    throw new Error("persisted aiText splitOpen did not re-open the split");
  }
  second.root.unmount();
  second.host.remove();

  // Third mount with state persisted for a DIFFERENT file (a retargeted
  // tab keeps its state): the stale layout must not leak in, and a new
  // write must re-stamp the current file.
  const stale = await mountPanel({
    path: "docs/another-guide.pdf",
    aiText: { splitOpen: true, splitRatioPct: 66, originalHidden: true },
  });
  const staleShadow = [...stale.host.querySelectorAll("div")].find(
    (candidate) => candidate.shadowRoot
  )?.shadowRoot;
  if (staleShadow.querySelector('[data-testid="ai-text-split-layout"]')) {
    throw new Error("persisted layout from another file leaked into this mount");
  }
  const staleBtn = staleShadow.querySelector('[data-testid="ai-text-mode-button"]');
  if (!staleBtn) {
    throw new Error("AI Text Mode button missing after stale-state mount");
  }
  staleBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  if (!staleShadow.querySelector('[data-testid="ai-text-split-layout"]')) {
    throw new Error("clicking did not open the split after stale-state mount");
  }
  const reStamped = stale.recordedStates.find(
    (state) => state?.path === "guide.pdf" && state?.aiText?.splitOpen === true
  );
  if (!reStamped) {
    throw new Error(
      `new persist must stamp the current file path; recorded: ${JSON.stringify(stale.recordedStates)}`
    );
  }
  stale.root.unmount();
  stale.host.remove();
}
