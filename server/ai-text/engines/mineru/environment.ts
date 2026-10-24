import { realpath } from "node:fs/promises";
import type { AiTextEngineEnvironment } from "../../../../shared/ai-text/task.ts";
import type { MineruConfig } from "../../../../shared/ai-text/engine-configs.ts";
import { runProcess } from "../../command-runner.ts";
import {
  resolveExecutable,
  uvToolDirFromExecutablePath,
} from "../../executable.ts";
import { computeDirectorySize } from "../../disk.ts";
import {
  compareVersions,
  fetchLatestEngineVersion,
} from "../../engine-versions.ts";
import { normalizeModelTier, probeModels } from "./environment-models.ts";

export {
  normalizeModelTier,
  parseModelRepos,
  parseModelsShowOutput,
  parseModelsVerifyOutput,
} from "./environment-models.ts";
export type {
  MineruModelRepoStatus,
  MineruModelsInfo,
} from "./environment-models.ts";

const ENVIRONMENT_CACHE_MS = 60_000;
const VERSION_TIMEOUT_MS = 15_000;
const LOCAL_API_TIMEOUT_MS = 2_500;

export type MineruCliKind =
  | "mineru-kit"
  | "mineru-doclib"
  | "mineru-legacy"
  | "uv"
  | "unknown";

export interface MineruCliInfo {
  command: string;
  resolvedPath: string | null;
  available: boolean;
  version: string | null;
  pythonVersion: string | null;
  kind: MineruCliKind;
}

interface CacheEntry {
  key: string;
  checkedAtMs: number;
  environment: AiTextEngineEnvironment;
}

// Detection depends on the profile config (custom CLI path, API URLs, tier),
// so profiles with different configs must not evict each other's result.
const environmentCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 8;
const inflight = new Map<string, Promise<AiTextEngineEnvironment>>();

function emptyCliInfo(
  command: string,
  kind: MineruCliKind,
): MineruCliInfo {
  return {
    command,
    resolvedPath: null,
    available: false,
    version: null,
    pythonVersion: null,
    kind,
  };
}

function parseVersionText(
  text: string,
): { version: string | null; pythonVersion: string | null } {
  const labeled = /MinerU version:\s*([^\s]+)/i.exec(text);
  const python = /Python version:\s*([^\s]+)/i.exec(text);
  if (labeled) {
    return { version: labeled[1] ?? null, pythonVersion: python?.[1] ?? null };
  }
  const generic = /(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?)/.exec(text);
  return {
    version: generic?.[1] ?? null,
    pythonVersion: python?.[1] ?? null,
  };
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function probeCli(input: {
  command: string;
  kind: MineruCliKind;
  versionArgs?: string[];
}): Promise<MineruCliInfo> {
  const resolvedPath = await resolveExecutable(input.command);
  if (!resolvedPath) return emptyCliInfo(input.command, input.kind);

  let info: MineruCliInfo = {
    command: input.command,
    resolvedPath,
    available: true,
    version: null,
    pythonVersion: null,
    kind: input.kind,
  };

  const attempts = [input.versionArgs ?? ["--version"], ["version", "--json"]];
  for (const args of attempts) {
    try {
      const result = await runProcess({
        command: resolvedPath,
        args,
        timeoutMs: VERSION_TIMEOUT_MS,
      });
      if (result.code !== 0) continue;
      const json = extractJsonObject(result.stdout);
      if (json && typeof json === "object") {
        const record = json as Record<string, unknown>;
        const version =
          typeof record.mineru_version === "string"
            ? record.mineru_version
            : typeof record.version === "string"
              ? record.version
              : null;
        const pythonVersion =
          typeof record.python_version === "string"
            ? record.python_version
            : null;
        if (version) {
          info = { ...info, version, pythonVersion };
          break;
        }
      }
      const parsed = parseVersionText(`${result.stdout}\n${result.stderr}`);
      if (parsed.version) {
        info = { ...info, ...parsed };
        break;
      }
    } catch {
      // Try the next invocation shape.
    }
  }

  if (input.kind === "mineru-doclib" && info.version) {
    const major = Number.parseInt(info.version.split(".")[0] ?? "", 10);
    if (Number.isFinite(major) && major < 4) {
      info = { ...info, kind: "mineru-legacy" };
    }
  }
  return info;
}

interface LocalApiProbe {
  url: string;
  reachable: boolean;
  version: string | null;
  tiers: string[];
}

async function probeLocalApi(url: string): Promise<LocalApiProbe> {
  const base = url.replace(/\/+$/, "");
  if (!base) return { url, reachable: false, version: null, tiers: [] };

  let version: string | null = null;
  try {
    const health = await fetch(`${base}/v1/health`, {
      signal: AbortSignal.timeout(LOCAL_API_TIMEOUT_MS),
    });
    if (!health.ok) return { url, reachable: false, version: null, tiers: [] };
    const body = (await health.json()) as { version?: unknown };
    version = typeof body.version === "string" ? body.version : null;
  } catch {
    return { url, reachable: false, version: null, tiers: [] };
  }

  let tiers: string[] = [];
  try {
    const tierRes = await fetch(`${base}/v1/tiers`, {
      signal: AbortSignal.timeout(LOCAL_API_TIMEOUT_MS),
    });
    if (tierRes.ok) {
      // Shape: { object: "list", data: [{ id, description, ... }] }
      const body = (await tierRes.json()) as {
        data?: Array<{ id?: unknown }>;
      };
      tiers = (body.data ?? [])
        .map((entry) => (typeof entry.id === "string" ? entry.id : null))
        .filter((id): id is string => Boolean(id));
    }
  } catch {
    // Health already established reachability.
  }

  return { url: base, reachable: true, version, tiers };
}

/**
 * `uv tool install` exposes a shim in `~/.local/bin` that points into
 * `~/.local/share/uv/tools/mineru`. Classify the real target so the repair
 * action knows it can use uv.
 */
export async function detectInstallKind(
  kitPath: string | null,
): Promise<"uv-tool" | "pip" | "unknown"> {
  if (!kitPath) return "unknown";
  const resolved = await realpath(kitPath).catch(() => kitPath);
  const candidates = [kitPath, resolved].map((path) => path.replace(/\\/g, "/"));
  if (
    candidates.some(
      (path) =>
        path.includes("/uv/tools/mineru/") ||
        path.includes("/uv/tools/mineru-"),
    )
  ) {
    return "uv-tool";
  }
  return "pip";
}

export async function getMineruEnvironment(input: {
  config: MineruConfig;
  indexUrl?: string;
  refresh?: boolean;
}): Promise<AiTextEngineEnvironment> {
  const kitCommand = input.config.kitCommand.trim() || "mineru-kit";
  const indexUrl = input.indexUrl?.trim() ?? "";
  const key = [
    kitCommand,
    input.config.localApiUrl,
    input.config.apiBaseUrl,
    input.config.tier,
    input.config.apiToken.trim() ? "token" : "no-token",
    indexUrl,
  ].join("|");
  const cached = input.refresh ? undefined : environmentCache.get(key);
  if (cached && Date.now() - cached.checkedAtMs < ENVIRONMENT_CACHE_MS) {
    return cached.environment;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const probe = probeMineruEnvironment(key, input.config, kitCommand, indexUrl);
  inflight.set(key, probe);
  try {
    return await probe;
  } finally {
    if (inflight.get(key) === probe) inflight.delete(key);
  }
}

async function probeMineruEnvironment(
  key: string,
  config: MineruConfig,
  kitCommand: string,
  indexUrl: string,
): Promise<AiTextEngineEnvironment> {
  const [kit, mineruCli, uv] = await Promise.all([
    probeCli({
      command: kitCommand,
      kind: "mineru-kit",
      versionArgs: ["version", "--json"],
    }),
    probeCli({ command: "mineru", kind: "mineru-doclib" }),
    probeCli({ command: "uv", kind: "uv" }),
  ]);

  const [models, localApi] = await Promise.all([
    probeModels(kit.resolvedPath, config.tier),
    probeLocalApi(config.localApiUrl),
  ]);

  const installKind = await detectInstallKind(kit.resolvedPath);
  const adjustedTier = normalizeModelTier(config.tier).adjusted;
  const hasToken = Boolean(config.apiToken.trim());
  const modelsReady = Boolean(models?.tierReady);

  const routes = [
    {
      id: "auto",
      label: "Auto",
      status: "ready" as const,
      message: modelsReady
        ? "Local models are ready."
        : "Falls back to the local API or MinerU cloud.",
    },
    {
      id: "local-cli",
      label: "Local CLI",
      status: kit.available && modelsReady ? ("ready" as const) : ("needs-setup" as const),
      message: !kit.available
        ? "mineru-kit was not found."
        : !modelsReady
          ? "Models are missing for this tier."
          : null,
    },
    {
      id: "local-api",
      label: "Local API",
      status: localApi.reachable ? ("ready" as const) : ("needs-setup" as const),
      message: localApi.reachable
        ? localApi.tiers.length > 0
          ? `Tiers: ${localApi.tiers.join(", ")}`
          : null
        : `No mineru-kit api-server at ${config.localApiUrl}.`,
    },
    {
      id: "cloud-token",
      label: "Cloud API (token)",
      status: hasToken ? ("ready" as const) : ("needs-setup" as const),
      message: hasToken ? null : "Add an API token in the profile.",
    },
    {
      id: "cloud-free",
      label: "Cloud API (free)",
      status: "ready" as const,
      message: "Markdown only; no layout blocks.",
    },
  ];

  const recommendations: string[] = [];
  if (!kit.available) {
    recommendations.push(
      'Install MinerU 4 with "uv tool install mineru", then refresh this card.',
    );
  }
  if (kit.available && models && !models.tierReady) {
    recommendations.push(
      `Download the standard models with "mineru-kit models download --tier standard" or the Download models action.`,
    );
  }
  if (adjustedTier) {
    recommendations.push(
      `The ${config.tier} tier is not a downloadable model set; model checks use standard.`,
    );
  }
  if (mineruCli.available && mineruCli.kind === "mineru-doclib") {
    recommendations.push(
      '"mineru" on PATH is the MinerU 4 document-library CLI. Use "mineru-kit" for layout metadata.',
    );
  }
  if (kit.available && models && !models.tierReady && !localApi.reachable) {
    recommendations.push(
      'Start the local API with "mineru-kit api-server --port 8000" to parse without loading models in this process.',
    );
  }
  if (!hasToken) {
    recommendations.push(
      "A MinerU cloud token enables layout geometry without local models.",
    );
  }

  const status: AiTextEngineEnvironment["status"] =
    kit.available || localApi.reachable || hasToken
      ? "ready"
      : "needs-setup";

  const details: Record<string, string> = {
    tier: config.tier,
    installKind,
  };
  if (models?.baseDir) details.modelBaseDir = models.baseDir;
  if (models?.source) details.modelSource = models.source;
  if (models?.smallBackend) details.smallBackend = models.smallBackend;
  if (models?.vlmEngine) details.vlmEngine = models.vlmEngine;
  if (localApi.version) details.localApiVersion = localApi.version;
  if (localApi.reachable) details.localApiUrl = localApi.url;
  if (adjustedTier) details.modelCheckTier = "standard";

  const installedVersion = kit.version ?? mineruCli.version ?? null;
  // The release check is fail-soft: unreachable index → null, no update badge.
  const latestVersion = installedVersion
    ? await fetchLatestEngineVersion("mineru", indexUrl)
    : null;
  const updateAvailable = Boolean(
    latestVersion &&
      installedVersion &&
      compareVersions(installedVersion, latestVersion) < 0,
  );

  const kitRealPath = kit.resolvedPath
    ? await realpath(kit.resolvedPath).catch(() => kit.resolvedPath)
    : null;
  const enginePath =
    installKind === "uv-tool"
      ? uvToolDirFromExecutablePath(kitRealPath)
      : null;
  const modelPath = models?.baseDir ?? null;
  const [engineBytes, modelBytes] = await Promise.all([
    enginePath
      ? computeDirectorySize(enginePath, { maxEntries: 10_000 })
      : Promise.resolve(null),
    modelPath
      ? computeDirectorySize(modelPath, { maxEntries: 10_000 })
      : Promise.resolve(null),
  ]);
  const storage =
    enginePath || modelPath
      ? {
          engineBytes: enginePath ? engineBytes : null,
          enginePath,
          modelBytes: modelPath ? modelBytes : null,
          modelPath,
        }
      : null;

  const environment: AiTextEngineEnvironment = {
    engineId: "mineru",
    checkedAt: new Date().toISOString(),
    status,
    version: installedVersion,
    latestVersion,
    updateAvailable,
    storage,
    routes,
    components: [
      {
        id: "mineru-kit",
        label: "mineru-kit",
        status: kit.available ? "ready" : "missing",
        version: kit.version,
        detail: kit.resolvedPath,
      },
      {
        id: "models",
        label: `${config.tier} models`,
        status: models ? (models.tierReady ? "ready" : "missing") : "unknown",
        version: null,
        detail: models?.baseDir ?? null,
      },
      {
        id: "local-api",
        label: "Local API",
        status: localApi.reachable ? "ready" : "missing",
        version: localApi.version,
        detail: localApi.reachable ? localApi.url : null,
      },
      {
        id: "uv",
        label: "uv",
        status: uv.available ? "ready" : "missing",
        version: uv.version,
        detail: uv.resolvedPath,
      },
      {
        id: "python",
        label: "Python",
        status: kit.pythonVersion ? "ready" : "unknown",
        version: kit.pythonVersion,
        detail: null,
      },
    ],
    recommendations,
    details,
  };

  environmentCache.set(key, {
    key,
    checkedAtMs: Date.now(),
    environment,
  });
  if (environmentCache.size > MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [candidateKey, entry] of environmentCache) {
      if (entry.checkedAtMs < oldestAt) {
        oldestAt = entry.checkedAtMs;
        oldestKey = candidateKey;
      }
    }
    if (oldestKey !== null && oldestKey !== key) {
      environmentCache.delete(oldestKey);
    }
  }
  return environment;
}

/** Test seam: forces the next detection to run. */
export function clearMineruEnvironmentCache(): void {
  environmentCache.clear();
}
