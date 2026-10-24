// Runtime-test mocks for AI Text Mode RPCs: in-memory .autumn storage,
// profile-driven task snapshots, layout documents, image assets, and engine
// environments.

export const simulatedAutumnDocs = new Map();

const DEFAULT_EXTRACTION = {
  ocr: true,
  formula: true,
  tables: true,
  language: "auto",
  pages: "",
  layout: true,
  imageAnalysis: false,
  timeoutMs: 900000,
};

const MINERU_PROFILE = {
  id: "mineru-auto",
  name: "MinerU · Auto",
  engineId: "mineru",
  route: "auto",
  config: {
    kitCommand: "mineru-kit",
    localApiUrl: "http://127.0.0.1:8000",
    apiBaseUrl: "https://mineru.net",
    apiToken: "",
    tier: "standard",
    ocrMode: "auto",
    remoteUrl: "",
    remoteApiKey: "",
    extraArgs: "",
  },
  extraction: DEFAULT_EXTRACTION,
  refinement: {
    mode: "local",
    agentId: "pi",
    model: "",
    promptPresetId: "faithful",
    prompt: "",
  },
};

const DOCLING_PROFILE = {
  id: "docling-standard",
  name: "Docling · Standard",
  engineId: "docling",
  route: "standard",
  config: {
    doclingCommand: "docling",
    doclingToolsCommand: "docling-tools",
    artifactsPath: "",
    device: "auto",
    numThreads: 0,
    ocrEngine: "",
    ocrLangs: "",
    tableMode: "accurate",
    vlmModel: "granite_docling",
    extraArgs: "",
  },
  extraction: { ...DEFAULT_EXTRACTION, layout: true },
  refinement: {
    mode: "none",
    agentId: "pi",
    model: "",
    promptPresetId: "faithful",
    prompt: "",
  },
};

const MINERU_CLOUD_FREE_PROFILE = {
  ...MINERU_PROFILE,
  id: "mineru-cloud-free",
  name: "MinerU · Cloud Free",
  route: "cloud-free",
};

const DEFAULT_PROFILES = [MINERU_CLOUD_FREE_PROFILE];

import { ENGINE_DESCRIPTORS } from "./runtime-test-ai-text-engines.mjs";


export function handleAiTextRpc(rpcName, input, currentSettingsData, simulatedDiskFiles) {
  if (rpcName === "ai_text.stats.list") {
    return {
      outputRootDisplayPath: "/Users/test/workspace/.autumn",
      generatedAt: "2026-10-21T12:00:00.000Z",
      truncated: false,
      rows: [
        {
          sourceRelPath: "docs/report.pdf",
          docFolderRelPath: "docs__report.pdf",
          docFolderDisplayPath: "/Users/test/workspace/.autumn/docs__report.pdf",
          versionCount: 2,
          activeVersionId: "v2",
          totalBytes: 4096,
          markdownBytes: 2048,
          assetBytes: 2048,
          lastParsedAt: "2026-10-20T10:00:00.000Z",
          engines: ["MinerU"],
        },
      ],
    };
  }
  if (rpcName === "ai_text.path.reveal") {
    return {
      opened: true,
      message: `Opened (simulated) ${input.kind}`,
    };
  }
  if (rpcName === "ai_text.agents.list") {
    return {
      agents: [
        { id: "pi", label: "pi (Default)", available: true, isDefault: true },
        { id: "claude", label: "Claude Code", available: true },
        { id: "codex", label: "Codex", available: true },
      ],
    };
  }
  if (rpcName === "ai_text.engines.list") {
    return { engines: ENGINE_DESCRIPTORS };
  }
  if (rpcName === "ai_text.engine.environment.get") {
    return { environment: environmentForEngine(input.engineId) };
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
  if (rpcName === "ai_text.task.start") {
    const taskId = `task-${++simulatedTaskSequence}`;
    const now = new Date(1700000000000 + simulatedTaskSequence * 1000).toISOString();
    if (input.kind === "parse") {
      const result = simulateAiTextParse(
        input,
        currentSettingsData,
        simulatedDiskFiles,
      );
      simulatedAiTextTasks.set(taskId, {
        id: taskId,
        kind: input.kind,
        status: "succeeded",
        phase: "Done",
        message: "Extraction complete",
        progressPercent: 100,
        logTail: ["parse complete"],
        startedAt: now,
        finishedAt: now,
        elapsedMs: 140,
        error: null,
        profileId: result.newVersion.provenance.profileId,
        profileName: result.newVersion.provenance.profileName,
        engineId: result.newVersion.provenance.effectiveEngineId,
        parseResult: result,
      });
    } else {
      simulatedAiTextTasks.set(taskId, {
        id: taskId,
        kind: input.kind,
        status: "succeeded",
        phase: "Done",
        message: `${input.operationId} complete`,
        progressPercent: 100,
        logTail: ["done"],
        startedAt: now,
        finishedAt: now,
        elapsedMs: 90,
        error: null,
        engineId: input.engineId ?? null,
        operationId: input.operationId ?? null,
        environment: environmentForEngine(input.engineId),
      });
    }
    return { taskId };
  }
  if (rpcName === "ai_text.task.get") {
    const task = simulatedAiTextTasks.get(input.taskId);
    if (!task) {
      throw new Error(`Unknown AI Text task ${input.taskId}`);
    }
    return { task };
  }
  if (rpcName === "ai_text.task.cancel") {
    const task = simulatedAiTextTasks.get(input.taskId);
    if (task) {
      task.status = "cancelled";
      task.phase = "Cancelled";
      task.message = "Task cancelled";
    }
    return { cancelled: Boolean(task) };
  }
  if (rpcName === "ai_text.layout.get") {
    const layout = simulatedLayouts.get(
      `${input.relPath}::${input.versionId}`,
    );
    return layout
      ? { versionId: input.versionId, layout }
      : {
          versionId: input.versionId,
          layout: null,
          message: "This version has no layout metadata.",
        };
  }
  if (rpcName === "ai_text.asset.get") {
    return {
      mimeType: "image/png",
      base64: SAMPLE_LAYOUT_PNG_BASE64,
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
    simulatedLayouts.delete(`${input.relPath}::${input.versionId}`);
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

const simulatedAiTextTasks = new Map();
const simulatedLayouts = new Map();
let simulatedTaskSequence = 0;
const SAMPLE_LAYOUT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function environmentForEngine(engineId) {
  const base = {
    engineId: engineId ?? "mineru",
    checkedAt: "2026-10-21T00:00:00.000Z",
    status: "ready",
    version: null,
    latestVersion: null,
    updateAvailable: false,
    storage: null,
    routes: [],
    components: [],
    recommendations: [],
    details: {},
  };
  if (engineId === "docling") {
    return {
      ...base,
      version: "2.53.0",
      latestVersion: "2.142.0",
      updateAvailable: true,
      storage: {
        engineBytes: 1_200_000_000,
        enginePath: "/Users/test/.local/share/uv/tools/docling",
        modelBytes: 3_400_000_000,
        modelPath: "/Users/test/.cache/docling/models",
      },
      routes: [
        { id: "standard", label: "Standard", status: "ready", message: null },
        { id: "vlm", label: "VLM", status: "ready", message: null },
      ],
      components: [
        {
          id: "docling",
          label: "Docling",
          status: "ready",
          version: "2.53.0",
          detail: "/usr/local/bin/docling",
        },
      ],
      details: { Models: "/Users/test/.cache/docling/models" },
    };
  }
  if (engineId === "local-ocr") {
    return {
      ...base,
      routes: [
        { id: "auto", label: "Local", status: "ready", message: null },
      ],
      components: [
        {
          id: "builtin-ocr",
          label: "On-device OCR",
          status: "ready",
          version: null,
          detail: null,
        },
      ],
    };
  }
  return {
    ...base,
    version: "4.0.12",
    routes: [
      { id: "auto", label: "Auto", status: "ready", message: null },
      { id: "local-cli", label: "Local CLI", status: "ready", message: null },
      { id: "cloud-free", label: "Cloud API (free)", status: "ready", message: null },
    ],
    components: [
      {
        id: "mineru-kit",
        label: "MinerU Kit",
        status: "ready",
        version: "4.0.12",
        detail: "/Users/test/.local/bin/mineru-kit",
      },
    ],
    recommendations: ["MinerU Kit 4.0.12 detected with standard models ready."],
    details: { "Model tier": "standard" },
  };
}

function makeSimulatedLayout(relPath, versionId) {
  return {
    schemaVersion: 1,
    source: "mineru-kit",
    parserId: "mineru",
    producedAt: new Date(1700000000000).toISOString(),
    pageCount: 2,
    blockCount: 4,
    blocks: [
      {
        id: "p1-b0",
        pageNumber: 1,
        type: "doc_title",
        bbox: [0.1, 0.05, 0.9, 0.15],
        text: "Guide",
        confidence: 0.98,
      },
      {
        id: "p1-b1",
        pageNumber: 1,
        type: "text",
        bbox: [0.1, 0.2, 0.9, 0.4],
        text: `Opening paragraph for ${relPath} about Firefox compliance.`,
        confidence: 0.95,
      },
      {
        id: "p1-b2",
        pageNumber: 1,
        type: "image",
        bbox: [0.1, 0.45, 0.6, 0.75],
        text: "Compliance diagram",
        imagePath: "images/sample.png",
        confidence: 0.9,
      },
      {
        id: "p2-b0",
        pageNumber: 2,
        type: "table",
        bbox: [0.1, 0.1, 0.9, 0.5],
        text: "Browser Compliance Firefox Edition 3",
        html: "<table><tr><td>Firefox</td><td>Edition 3</td></tr></table>",
        confidence: 0.92,
      },
    ],
  };
}

function resolveProfile(input, settingsData) {
  const profiles = settingsData?.aiText?.profiles ?? DEFAULT_PROFILES;
  const requested =
    input.profileId ?? settingsData?.aiText?.defaultProfileId ?? profiles[0]?.id;
  const profile =
    profiles.find((item) => item.id === requested) ?? profiles[0] ?? MINERU_PROFILE;
  return profile;
}

function simulateAiTextParse(input, settingsData, diskFiles) {
  const slug = input.relPath.replace(/\//g, "__");
  let entry = simulatedAutumnDocs.get(input.relPath);
  if (!entry) {
    entry = {
      metadata: {
        schemaVersion: 2,
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
  const profile = resolveProfile(input, settingsData);
  const id = `20261012-12000${versionNumber}_v${versionNumber}_${profile.id}`;
  const fileName = `${id}.md`;
  const relPath = `.autumn/${slug}/${fileName}`;
  const content = [
    `# Extracted v${versionNumber} for ${input.relPath}`,
    "",
    `Parsed by ${profile.name} (${profile.engineId} · ${profile.route}, run #${versionNumber}).`,
    "",
    "| Browser | Compliance |",
    "| --- | --- |",
    "| Firefox | Edition 3 |",
    "",
  ].join("\n");

  const layout = makeSimulatedLayout(input.relPath, id);
  simulatedLayouts.set(`${input.relPath}::${id}`, layout);

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
    layout: {
      fileName: `${id}.layout.json`,
      relPath: `.autumn/${slug}/${id}.layout.json`,
      blockCount: layout.blockCount,
      pageCount: layout.pageCount,
      source: layout.source,
    },
    assets: {
      dirName: `${id}.assets`,
      imageCount: 1,
      totalBytes: 67,
    },
    provenance: {
      profileId: profile.id,
      profileName: profile.name,
      profileFingerprint: "runtime-fingerprint",
      requestedEngineId: profile.engineId,
      effectiveEngineId: profile.engineId,
      engineLabel: profile.engineId === "mineru" ? "MinerU" : profile.name,
      engineVersion: profile.engineId === "mineru" ? "4.0.12" : "2.53.0",
      route: profile.route,
      extraction: profile.extraction,
      refinement: {
        mode: profile.refinement.mode,
        agentId: profile.refinement.agentId,
        didRun: false,
      },
      lineCount: 8,
      headingCount: 1,
      tableCount: 1,
      codeBlockCount: 0,
      warnings: [],
    },
  };

  entry.contentsById.set(id, content);
  diskFiles.set(relPath, {
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
