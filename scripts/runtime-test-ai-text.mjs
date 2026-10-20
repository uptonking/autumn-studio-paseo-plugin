// Runtime test helpers for AI Text Mode settings, toolbar button state machine,
// right-hand split view, multi-version .autumn/ storage, and version switching.

import {
  verifyAiTextMetadataPanel,
  verifyAiTextSplitPaneToggles,
} from "./runtime-test-ai-text-chrome.mjs";

export const simulatedAutumnDocs = new Map();

export function handleAiTextRpc(rpcName, input, currentSettingsData, simulatedDiskFiles) {
  if (rpcName === "ai_text.agents.list") {
    return {
      agents: [
        { id: "pi", label: "pi (Default)", available: true, isDefault: true },
        { id: "claude", label: "Claude Code", available: true },
        { id: "codex", label: "Codex", available: true },
      ],
    };
  }
  if (rpcName === "ai_text.metadata.get") {
    const entry = simulatedAutumnDocs.get(input.relPath);
    if (!entry) {
      return { metadata: null, activeContent: null };
    }
    const activeVersion =
      entry.metadata.versions.find(
        (v) => v.id === entry.metadata.activeVersionId,
      ) ?? entry.metadata.versions[0] ?? null;
    return {
      metadata: entry.metadata,
      activeContent: activeVersion
        ? (entry.contentsById.get(activeVersion.id) ?? null)
        : null,
    };
  }
  if (rpcName === "ai_text.extract") {
    const slug = input.relPath.replace(/\//g, "__");
    let entry = simulatedAutumnDocs.get(input.relPath);
    if (!entry) {
      entry = {
        metadata: {
          schemaVersion: 1,
          sourceRelPath: input.relPath,
          sourceFileName: input.relPath.split("/").pop() ?? input.relPath,
          formatKind: input.relPath.endsWith(".pdf") ? "pdf" : "html",
          docFolderRelPath: `.autumn/${slug}`,
          activeVersionId: null,
          versions: [],
        },
        contentsById: new Map(),
      };
      simulatedAutumnDocs.set(input.relPath, entry);
    }

    const versionNumber = entry.metadata.versions.length + 1;
    const parserId =
      input.parserId ?? currentSettingsData?.aiText?.defaultParser ?? "mineru";
    const agentId =
      input.agentId ?? currentSettingsData?.aiText?.defaultAgent ?? "pi";
    const id = `20261012-12000${versionNumber}_v${versionNumber}_${parserId}_${agentId}`;
    const fileName = `${id}.md`;
    const relPath = `.autumn/${slug}/${fileName}`;
    const content = [
      `# Extracted v${versionNumber} for ${input.relPath}`,
      "",
      `Parsed by ${parserId} + ${agentId} (run #${versionNumber}).`,
      "",
      "| Browser | Compliance |",
      "| --- | --- |",
      "| Firefox | Edition 3 |",
      "",
    ].join("\n");

    const newVersion = {
      id,
      versionNumber,
      fileName,
      relPath,
      createdAt: new Date(1700000000000 + versionNumber * 60000).toISOString(),
      durationMs: 320 + versionNumber * 10,
      size: Buffer.byteLength(content, "utf8"),
      sourceSize: 512,
      sourceMtimeMs: 1700000000000,
      provenance: {
        parserId,
        parserLabel:
          parserId === "mineru" ? "MinerU (Free Default)" : parserId,
        parserMode: "cloud-free",
        agentId,
        agentModel: `${agentId}/default`,
        usedAgentRefinement: Boolean(
          currentSettingsData?.aiText?.useAgentRefinement ?? true,
        ),
        ocrEnabled: true,
        formulaEnabled: true,
        tableEnabled: true,
        language: "auto",
        lineCount: 8,
        headingCount: 1,
        tableCount: 1,
        codeBlockCount: 0,
      },
    };

    entry.contentsById.set(id, content);
    simulatedDiskFiles.set(relPath, {
      content: Buffer.from(content, "utf8"),
      contentType: "text/markdown",
      mtime: Date.now(),
    });
    const nextVersions = [newVersion, ...entry.metadata.versions];
    entry.metadata = {
      ...entry.metadata,
      activeVersionId: id,
      versions: nextVersions,
    };
    return {
      metadata: entry.metadata,
      newVersion,
      content,
    };
  }
  if (rpcName === "ai_text.version.select") {
    const entry = simulatedAutumnDocs.get(input.relPath);
    if (!entry) {
      throw new Error(`No metadata for ${input.relPath}`);
    }
    const activeVersion =
      entry.metadata.versions.find((v) => v.id === input.versionId) ??
      entry.metadata.versions[0] ??
      null;
    entry.metadata = {
      ...entry.metadata,
      activeVersionId: activeVersion ? activeVersion.id : null,
    };
    return {
      metadata: entry.metadata,
      activeVersion,
      content: activeVersion
        ? (entry.contentsById.get(activeVersion.id) ?? null)
        : null,
    };
  }
  if (rpcName === "ai_text.version.delete") {
    const entry = simulatedAutumnDocs.get(input.relPath);
    if (!entry) {
      return { metadata: null, activeVersion: null, content: null };
    }
    entry.contentsById.delete(input.versionId);
    const remaining = entry.metadata.versions.filter(
      (v) => v.id !== input.versionId,
    );
    if (remaining.length === 0) {
      simulatedAutumnDocs.delete(input.relPath);
      return { metadata: null, activeVersion: null, content: null };
    }
    const nextActive =
      remaining.find((v) => v.id === entry.metadata.activeVersionId) ??
      remaining[0];
    entry.metadata = {
      ...entry.metadata,
      activeVersionId: nextActive.id,
      versions: remaining,
    };
    return {
      metadata: entry.metadata,
      activeVersion: nextActive,
      content: entry.contentsById.get(nextActive.id) ?? null,
    };
  }
  return undefined;
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
    if (!parserOptionValues.includes(expectedParser)) {
      throw new Error(
        `Missing expected parser option '${expectedParser}' in Text parsing service select`,
      );
    }
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
