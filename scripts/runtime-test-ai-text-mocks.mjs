// Runtime-test mocks for AI Text Mode RPCs: in-memory .autumn storage,
// task snapshots, layout documents, image assets, and MinerU environment.

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
        parseResult: result,
      });
    } else {
      simulatedAiTextTasks.set(taskId, {
        id: taskId,
        kind: input.kind,
        status: "succeeded",
        phase: "Done",
        message:
          input.kind === "models.download"
            ? "Models downloaded"
            : "MinerU reinstalled",
        progressPercent: 100,
        logTail: ["done"],
        startedAt: now,
        finishedAt: now,
        elapsedMs: 90,
        error: null,
        environment: simulatedMineruEnvironment,
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
  if (rpcName === "ai_text.environment.get") {
    return { environment: simulatedMineruEnvironment };
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

const simulatedMineruEnvironment = {
  checkedAt: "2026-10-21T00:00:00.000Z",
  os: "darwin",
  arch: "arm64",
  kit: {
    command: "mineru-kit",
    resolvedPath: "/Users/test/.local/bin/mineru-kit",
    available: true,
    version: "4.0.12",
    pythonVersion: "3.12.9",
    kind: "mineru-kit",
  },
  mineru: {
    command: "mineru",
    resolvedPath: "/Users/test/.local/bin/mineru",
    available: true,
    version: "4.0.12",
    pythonVersion: "3.12.9",
    kind: "mineru-doclib",
  },
  uv: {
    command: "uv",
    resolvedPath: "/opt/homebrew/bin/uv",
    available: true,
    version: "0.9.5",
    pythonVersion: null,
    kind: "uv",
  },
  models: {
    baseDir: "/Users/test/.cache/mineru",
    tier: "standard",
    tierReady: true,
    source: "auto",
    smallBackend: "transformers",
    vlmEngine: "vllm",
    repos: [
      {
        name: "layout",
        ready: true,
        path: "/Users/test/.cache/mineru/layout",
        missingPaths: [],
      },
    ],
  },
  localApi: {
    url: "http://127.0.0.1:8000",
    reachable: false,
    version: null,
    tiers: [],
  },
  installKind: "uv-tool",
  recommendations: ["MinerU Kit 4.0.12 detected with standard models ready."],
};

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

function simulateAiTextParse(input, settingsData, diskFiles) {
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
    input.parserId ?? settingsData?.aiText?.defaultParser ?? "mineru";
  const agentId = input.agentId ?? settingsData?.aiText?.defaultAgent ?? "pi";
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
      parserId,
      parserLabel: parserId === "mineru" ? "MinerU (Free Default)" : parserId,
      parserMode: "mineru-kit",
      agentId,
      agentModel: `${agentId}/default`,
      usedAgentRefinement: Boolean(
        settingsData?.aiText?.useAgentRefinement ?? true,
      ),
      ocrEnabled: true,
      formulaEnabled: true,
      tableEnabled: true,
      language: "auto",
      lineCount: 8,
      headingCount: 1,
      tableCount: 1,
      codeBlockCount: 0,
      modeUsed: "local-cli",
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

