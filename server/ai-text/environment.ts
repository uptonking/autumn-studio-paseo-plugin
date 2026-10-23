import { realpath } from "node:fs/promises";
import type {
  AiTextCliInfo,
  AiTextEnvironment,
  AiTextInstallKind,
  AiTextLocalApiInfo,
  AiTextModelRepoStatus,
  AiTextModelsInfo,
} from "../../shared/ai-text-task.ts";
import { aiTextEnvironmentSchema } from "../../shared/ai-text-task.ts";
import { runProcess } from "./command-runner.ts";
import { resolveExecutable } from "./executable.ts";

const ENVIRONMENT_CACHE_MS = 60_000;
const VERSION_TIMEOUT_MS = 15_000;
const MODELS_TIMEOUT_MS = 45_000;
const LOCAL_API_TIMEOUT_MS = 2_500;

interface CacheEntry {
  key: string;
  checkedAtMs: number;
  environment: AiTextEnvironment;
}

let cache: CacheEntry | null = null;
const inflight = new Map<string, Promise<AiTextEnvironment>>();

function emptyCliInfo(command: string, kind: AiTextCliInfo["kind"]): AiTextCliInfo {
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
    return {
      version: labeled[1] ?? null,
      pythonVersion: python?.[1] ?? null,
    };
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

async function probeCli(input: {
  command: string;
  kind: AiTextCliInfo["kind"];
  versionArgs?: string[];
}): Promise<AiTextCliInfo> {
  const resolvedPath = await resolveExecutable(input.command);
  if (!resolvedPath) return emptyCliInfo(input.command, input.kind);

  let info: AiTextCliInfo = {
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

function appendMissingPaths(repo: AiTextModelRepoStatus, raw: string): void {
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) repo.missingPaths.push(trimmed);
  }
}

/**
 * Reads the `Repos:` section of `mineru-kit models show`. The real output puts
 * the status on the repo line and the path on the following parenthesized
 * line, so a line-oriented parser is more reliable than one regex.
 */
export function parseModelRepos(text: string): AiTextModelRepoStatus[] {
  const lines = text.split(/\r?\n/);
  const repos: AiTextModelRepoStatus[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match =
      /^\s{2,}([A-Za-z0-9._-]+):\s+(ready|missing)\s*(?:\((.+)\))?\s*$/.exec(
        line,
      );
    if (!match?.[1] || !match[2]) continue;
    let repoPath = match[3]?.trim() || null;
    if (!repoPath) {
      const pathMatch = /^\s*\((.+)\)\s*$/.exec(lines[index + 1] ?? "");
      if (pathMatch?.[1]) {
        repoPath = pathMatch[1].trim();
        index += 1;
      }
    }
    repos.push({
      name: match[1],
      ready: match[2] === "ready",
      path: repoPath,
      missingPaths: [],
    });
  }
  return repos;
}

export function parseModelsShowOutput(
  text: string,
  tier: string,
): AiTextModelsInfo | null {
  const readField = (key: string): string | null => {
    const match = new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(text);
    const value = match?.[1]?.trim() ?? "";
    return value && value !== "(unset)" ? value : null;
  };

  const baseDir = readField("model\\.base_dir");
  const source = readField("model\\.source");
  const smallBackend =
    readField("Effective small backend") ?? readField("model\\.small_backend");
  const vlmEngine =
    readField("Effective VLM engine") ?? readField("model\\.vlm\\.engine");

  const repos = parseModelRepos(text);
  if (!baseDir && repos.length === 0) return null;

  let tierReady = false;
  const tierLine = new RegExp(`^\\s+${tier}:\\s*(.+)$`, "m").exec(text);
  if (tierLine?.[1]) {
    const names = tierLine[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    tierReady =
      names.length > 0 &&
      names.every((name) => repos.some((repo) => repo.name === name && repo.ready));
  } else if (repos.length > 0) {
    tierReady = repos.every((repo) => repo.ready);
  }

  return {
    baseDir,
    tier,
    tierReady,
    source,
    smallBackend,
    vlmEngine,
    repos,
  };
}

/**
 * Reads `mineru-kit models verify` output. Missing paths wrap onto unindented
 * continuation lines, so everything after a repo header belongs to that repo
 * until a blank line or the next header.
 */
export function parseModelsVerifyOutput(text: string): AiTextModelRepoStatus[] {
  const repos: AiTextModelRepoStatus[] = [];
  let current: AiTextModelRepoStatus | null = null;
  for (const line of text.split(/\r?\n/)) {
    const start =
      /^\s*([A-Za-z0-9._-]+):\s*missing key paths?:\s*(.*)$/i.exec(line);
    if (start?.[1]) {
      current = {
        name: start[1],
        ready: false,
        path: null,
        missingPaths: [],
      };
      repos.push(current);
      if (start[2]) appendMissingPaths(current, start[2]);
      continue;
    }
    if (!current) continue;
    if (!line.trim()) {
      current = null;
      continue;
    }
    appendMissingPaths(current, line);
  }
  return repos;
}

async function probeModels(
  kitPath: string | null,
  tier: string,
): Promise<AiTextModelsInfo | null> {
  if (!kitPath) return null;

  try {
    const show = await runProcess({
      command: kitPath,
      args: ["models", "show"],
      timeoutMs: MODELS_TIMEOUT_MS,
    });
    if (show.code === 0) {
      const parsed = parseModelsShowOutput(
        `${show.stdout}\n${show.stderr}`,
        tier,
      );
      if (parsed) return parsed;
    }
  } catch {
    // Fall through to `models verify`.
  }

  try {
    const verify = await runProcess({
      command: kitPath,
      args: ["models", "verify", "--tier", tier],
      timeoutMs: MODELS_TIMEOUT_MS,
    });
    const repos = parseModelsVerifyOutput(
      `${verify.stdout}\n${verify.stderr}`,
    );
    const missing = repos.some((repo) => repo.missingPaths.length > 0);
    return {
      baseDir: null,
      tier,
      tierReady: verify.code === 0 && !missing,
      source: null,
      smallBackend: null,
      vlmEngine: null,
      repos:
        repos.length > 0
          ? repos
          : verify.code === 0
            ? []
            : [
                {
                  name: `tier ${tier}`,
                  ready: false,
                  path: null,
                  missingPaths: [],
                },
              ],
    };
  } catch {
    return null;
  }
}

async function probeLocalApi(url: string): Promise<AiTextLocalApiInfo> {
  const base = url.replace(/\/+$/, "");
  if (!base) {
    return { url, reachable: false, version: null, tiers: [] };
  }

  let reachable = false;
  let version: string | null = null;
  let tiers: string[] = [];

  try {
    const health = await fetch(`${base}/v1/health`, {
      signal: AbortSignal.timeout(LOCAL_API_TIMEOUT_MS),
    });
    if (!health.ok) {
      return { url, reachable: false, version: null, tiers: [] };
    }
    reachable = true;
    const body = (await health.json()) as { version?: unknown };
    version = typeof body.version === "string" ? body.version : null;
  } catch {
    return { url, reachable: false, version: null, tiers: [] };
  }

  try {
    const tierRes = await fetch(`${base}/v1/tiers`, {
      signal: AbortSignal.timeout(LOCAL_API_TIMEOUT_MS),
    });
    if (tierRes.ok) {
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

  return { url: base, reachable, version, tiers };
}

/**
 * `uv tool install` exposes a shim in `~/.local/bin` that points into
 * `~/.local/share/uv/tools/mineru`. Classify the real target, otherwise a
 * standard uv install looks like a pip install and the reinstall action is
 * hidden. Exported for tests.
 */
export async function detectInstallKind(
  kitPath: string | null,
): Promise<AiTextInstallKind> {
  if (!kitPath) return "unknown";
  const resolved = await realpath(kitPath).catch(() => kitPath);
  const candidates = [kitPath, resolved].map((path) =>
    path.replace(/\\/g, "/"),
  );
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
  kitCommand?: string;
  localApiUrl: string;
  tier: string;
  refresh?: boolean;
}): Promise<AiTextEnvironment> {
  const kitCommand = input.kitCommand?.trim() || "mineru-kit";
  const key = `${kitCommand}|${input.localApiUrl}|${input.tier}`;
  if (
    !input.refresh &&
    cache &&
    cache.key === key &&
    Date.now() - cache.checkedAtMs < ENVIRONMENT_CACHE_MS
  ) {
    return cache.environment;
  }

  // Settings render on mount and on every refresh tap; dedupe so a double
  // render never spawns two full `mineru-kit` probe rounds.
  const pending = inflight.get(key);
  if (pending) return pending;

  const probe = probeMineruEnvironment(key, input, kitCommand);
  inflight.set(key, probe);
  try {
    return await probe;
  } finally {
    if (inflight.get(key) === probe) inflight.delete(key);
  }
}

async function probeMineruEnvironment(
  key: string,
  input: { localApiUrl: string; tier: string },
  kitCommand: string,
): Promise<AiTextEnvironment> {
  const [kit, mineruCli, uv] = await Promise.all([
    probeCli({ command: kitCommand, kind: "mineru-kit" }),
    probeCli({ command: "mineru", kind: "mineru-doclib" }),
    probeCli({ command: "uv", kind: "uv" }),
  ]);

  const [models, localApi] = await Promise.all([
    probeModels(kit.resolvedPath, input.tier),
    probeLocalApi(input.localApiUrl),
  ]);

  const installKind = await detectInstallKind(kit.resolvedPath);
  const recommendations: string[] = [];
  if (!kit.available) {
    recommendations.push(
      'Install MinerU v4 with "uv tool install mineru", then refresh this card.',
    );
  }
  if (kit.available && models && !models.tierReady) {
    recommendations.push(
      `Download the ${input.tier} models with "mineru-kit models download --tier ${input.tier}" or use the button below.`,
    );
  }
  if (mineruCli.available && mineruCli.kind === "mineru-doclib") {
    recommendations.push(
      '"mineru" in MinerU 4 is the document-library CLI. Use "mineru-kit" for layout metadata.',
    );
  }
  if (kit.available && models && !models.tierReady && !localApi.reachable) {
    recommendations.push(
      `Start the local API with "mineru-kit api-server --port 8000" to parse without loading models in this process.`,
    );
  }

  const environment: AiTextEnvironment = {
    checkedAt: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    kit,
    mineru: mineruCli,
    uv,
    models,
    localApi,
    installKind,
    recommendations,
  };

  const parsed = aiTextEnvironmentSchema.safeParse(environment);
  const finalEnvironment = parsed.success ? parsed.data : environment;
  cache = {
    key,
    checkedAtMs: Date.now(),
    environment: finalEnvironment,
  };
  return finalEnvironment;
}

/** Test seam: forces the next detection to run. */
export function clearMineruEnvironmentCache(): void {
  cache = null;
}
