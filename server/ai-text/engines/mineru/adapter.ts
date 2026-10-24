import dns from "node:dns";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  AiTextExtractionSettings,
  AiTextLayoutDocument,
} from "../../../../shared/contracts.ts";
import type { MineruConfig } from "../../../../shared/ai-text/engine-configs.ts";
import { buildProcessError, runProcess } from "../../command-runner.ts";
import { resolveExecutable } from "../../executable.ts";
import { getMineruEnvironment, probeCli } from "./environment.ts";
import { normalizeMineruMiddleJson } from "./layout-normalizer.ts";
import {
  parseMineruZipBuffer,
  runMineruCloudFree,
  runMineruCloudToken,
} from "./cloud.ts";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported by runtime.
}

const MAX_LOCAL_MARKDOWN_BYTES = 32 * 1024 * 1024;
const MAX_LOCAL_ZIP_BYTES = 512 * 1024 * 1024;

export interface MineruAsset {
  /** Version-relative POSIX path such as `images/abc.jpg`. */
  path: string;
  data: Uint8Array;
}

export interface MineruParseResult {
  markdown: string;
  layout: AiTextLayoutDocument | null;
  assets: MineruAsset[];
  routeUsed: string;
  engineVersion: string | null;
  warnings: string[];
}

export interface MineruParseProgress {
  phase?: string;
  message?: string;
  percent?: number | null;
}

export interface MineruParseInput {
  filePath: string;
  fileName?: string;
  buffer: Buffer;
  route: string;
  config: MineruConfig;
  extraction: AiTextExtractionSettings;
  signal?: AbortSignal;
  onProgress?: (update: MineruParseProgress) => void;
  onLog?: (line: string) => void;
}

export function tokenizeArgs(raw: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let hasToken = false;

  for (const char of raw) {
    if (escaped) {
      current += char;
      escaped = false;
      hasToken = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      hasToken = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (escaped) current += "\\";
  if (hasToken) args.push(current);
  return args;
}

export function buildMineruKitArgs(input: {
  filePath: string;
  outputPath: string;
  format: "markdown" | "zip";
  config: MineruConfig;
  extraction: AiTextExtractionSettings;
  useLocalApi: boolean;
}): string[] {
  const { config, extraction } = input;
  const args = [
    "parse",
    input.filePath,
    "-o",
    input.outputPath,
    "-f",
    input.format,
  ];

  if (config.tier) args.push("--tier", config.tier);
  // OCR off means "use the text layer"; forcing `txt` is what the CLI does
  // when `--ocr-mode auto` would otherwise choose OCR.
  const ocrMode = extraction.ocr ? config.ocrMode : "txt";
  if (ocrMode) args.push("--ocr-mode", ocrMode);
  if (extraction.pages.trim()) args.push("--pages", extraction.pages.trim());
  if (!extraction.imageAnalysis) args.push("--disable-image-analysis");

  const remoteUrl = input.useLocalApi
    ? config.localApiUrl.trim()
    : config.remoteUrl.trim();
  if (remoteUrl) args.push("--remote-url", remoteUrl);
  if (remoteUrl && !input.useLocalApi && config.remoteApiKey.trim()) {
    args.push("--api-key", config.remoteApiKey.trim());
  }
  args.push(...tokenizeArgs(config.extraArgs));
  return args;
}

function cloudSettings(
  config: MineruConfig,
  extraction: AiTextExtractionSettings,
): {
  apiBaseUrl: string;
  apiToken: string;
  enableOcr: boolean;
  enableFormula: boolean;
  enableTable: boolean;
  language: string;
  timeoutMs: number;
} {
  return {
    apiBaseUrl: config.apiBaseUrl,
    apiToken: config.apiToken,
    enableOcr: extraction.ocr,
    enableFormula: extraction.formula,
    enableTable: extraction.tables,
    language: extraction.language,
    timeoutMs: extraction.timeoutMs,
  };
}

async function runMineruKit(
  input: MineruParseInput,
  useLocalApi: boolean,
  engineVersion: string | null,
): Promise<MineruParseResult> {
  const { config, extraction } = input;
  const requestedCommand = config.kitCommand.trim() || "mineru-kit";
  const command = await resolveExecutable(requestedCommand);
  if (!command) {
    throw new Error(
      `MinerU Kit CLI "${requestedCommand}" was not found. Install it with "uv tool install mineru" or set an absolute path in the profile.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "paseo-mineru-"));
  const wantsLayout = extraction.layout;
  const outputPath = join(tempDir, wantsLayout ? "result.zip" : "result.md");
  try {
    input.onProgress?.({
      phase: "Preparing",
      message: `Starting ${useLocalApi ? "MinerU local API" : "MinerU Kit"}`,
    });
    const result = await runProcess({
      command,
      args: buildMineruKitArgs({
        filePath: input.filePath,
        outputPath,
        format: wantsLayout ? "zip" : "markdown",
        config,
        extraction,
        useLocalApi,
      }),
      timeoutMs: extraction.timeoutMs,
      signal: input.signal,
      onLog: input.onLog,
    });
    if (result.aborted) throw new Error("MinerU parsing was cancelled");
    if (result.code !== 0) {
      throw new Error(buildProcessError("mineru-kit parse", result));
    }

    if (!wantsLayout) {
      const info = await stat(outputPath);
      if (info.size > MAX_LOCAL_MARKDOWN_BYTES) {
        throw new Error("MinerU Markdown output exceeds the 32MB limit");
      }
      return {
        markdown: await readFile(outputPath, "utf8"),
        layout: null,
        assets: [],
        routeUsed: useLocalApi ? "local-api" : "local-cli",
        engineVersion,
        warnings: [],
      };
    }

    input.onProgress?.({
      phase: "Extracting layout",
      message: "Reading MinerU layout blocks and images",
    });
    const outputInfo = await stat(outputPath);
    if (outputInfo.size > MAX_LOCAL_ZIP_BYTES) {
      throw new Error("MinerU archive exceeds the 512MB limit");
    }
    const zipBytes = new Uint8Array(await readFile(outputPath));
    const parsedZip = parseMineruZipBuffer(zipBytes);
    if (!parsedZip) {
      throw new Error("MinerU produced an archive without a readable markdown.md");
    }
    const warnings = [...parsedZip.warnings];
    const layout = parsedZip.middleJson
      ? normalizeMineruMiddleJson({
          middleJson: parsedZip.middleJson,
          source: useLocalApi ? "mineru-local-api" : "mineru-kit",
          parserId: "mineru",
        })
      : null;
    if (!layout) {
      warnings.push(
        "MinerU archive had no usable layout geometry; Blocks view is unavailable for this version",
      );
    }
    return {
      markdown: parsedZip.markdown,
      layout,
      assets: parsedZip.assets,
      routeUsed: useLocalApi ? "local-api" : "local-cli",
      engineVersion,
      warnings,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveAutoRoutes(
  input: MineruParseInput,
): Promise<{ routes: string[]; engineVersion: string | null }> {
  const environment = await getMineruEnvironment({
    config: input.config,
    refresh: false,
  });
  const routes: string[] = [];
  const localCli = environment.routes.find(
    (route) => route.id === "local-cli",
  );
  if (localCli?.status === "ready") routes.push("local-cli");
  const localApi = environment.routes.find(
    (route) => route.id === "local-api",
  );
  if (localApi?.status === "ready") routes.push("local-api");
  if (input.config.apiToken.trim()) routes.push("cloud-token");
  routes.push("cloud-free");
  return { routes, engineVersion: environment.version };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new Error("AI text extraction was cancelled");
}

async function runCloudFree(
  input: MineruParseInput,
  engineVersion: string | null,
): Promise<MineruParseResult> {
  if (!input.config.apiBaseUrl.trim()) {
    throw new Error("MinerU cloud endpoint is empty.");
  }
  const fileName = input.fileName || basename(input.filePath);
  const markdown = await runMineruCloudFree(
    input.filePath,
    fileName,
    input.buffer,
    cloudSettings(input.config, input.extraction),
    input.signal,
  );
  return {
    markdown,
    layout: null,
    assets: [],
    routeUsed: "cloud-free",
    engineVersion,
    warnings: [
      "The free MinerU API returns Markdown without layout geometry. Use MinerU Kit or the token API to enable Blocks.",
    ],
  };
}

async function runCloudToken(
  input: MineruParseInput,
  engineVersion: string | null,
): Promise<MineruParseResult> {
  if (!input.config.apiBaseUrl.trim()) {
    throw new Error("MinerU cloud endpoint is empty.");
  }
  const fileName = input.fileName || basename(input.filePath);
  const wantsLayout = input.extraction.layout;
  const cloud = await runMineruCloudToken(
    fileName,
    input.buffer,
    cloudSettings(input.config, input.extraction),
    input.signal,
  );
  if (cloud.zipBytes) {
    const parsedZip = parseMineruZipBuffer(cloud.zipBytes);
    if (parsedZip) {
      const layout =
        wantsLayout && parsedZip.middleJson
          ? normalizeMineruMiddleJson({
              middleJson: parsedZip.middleJson,
              source: "mineru-cloud",
              parserId: "mineru",
            })
          : null;
      return {
        markdown: parsedZip.markdown,
        layout,
        assets: parsedZip.assets,
        routeUsed: "cloud-token",
        engineVersion,
        warnings: [
          ...cloud.warnings,
          ...parsedZip.warnings,
          ...(wantsLayout && !layout
            ? [
                "MinerU archive had no usable layout geometry; Blocks view is unavailable for this version",
              ]
            : []),
        ],
      };
    }
    cloud.warnings.push("MinerU archive could not be read; using Markdown only");
  }
  if (!cloud.markdown.trim()) {
    throw new Error(
      "MinerU returned an unreadable archive and no Markdown fallback",
    );
  }
  return {
    markdown: cloud.markdown,
    layout: null,
    assets: [],
    routeUsed: "cloud-token",
    engineVersion,
    warnings: cloud.warnings,
  };
}

async function runRoute(
  input: MineruParseInput,
  route: string,
  engineVersion: string | null,
): Promise<MineruParseResult> {
  throwIfAborted(input.signal);
  switch (route) {
    case "local-cli":
      return await runMineruKit(input, false, engineVersion);
    case "local-api":
      if (!input.config.localApiUrl.trim()) {
        throw new Error(
          'Local MinerU API route needs a URL such as "http://127.0.0.1:8000".',
        );
      }
      return await runMineruKit(input, true, engineVersion);
    case "cloud-token":
      return await runCloudToken(input, engineVersion);
    case "cloud-free":
      return await runCloudFree(input, engineVersion);
    default:
      throw new Error(`Unknown MinerU route "${route}".`);
  }
}

export async function parseWithMineru(
  input: MineruParseInput,
): Promise<MineruParseResult> {
  throwIfAborted(input.signal);
  const requestedRoute = input.route || "auto";

  if (requestedRoute !== "auto") {
    let engineVersion: string | null = null;
    if (requestedRoute === "local-cli" || requestedRoute === "local-api") {
      try {
        const info = await probeCli({
          command: input.config.kitCommand.trim() || "mineru-kit",
          kind: "mineru-kit",
          versionArgs: ["version", "--json"],
        });
        engineVersion = info.version;
      } catch {
        // Version reporting is best-effort; the parse error is the real one.
      }
    }
    return await runRoute(input, requestedRoute, engineVersion);
  }

  const warnings: string[] = [];
  let engineVersion: string | null = null;
  let routes: string[] = [];
  try {
    const detected = await resolveAutoRoutes(input);
    routes = detected.routes;
    engineVersion = detected.engineVersion;
  } catch (error) {
    warnings.push(
      `Local MinerU detection failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    routes = [
      "local-cli",
      ...(input.config.localApiUrl.trim() ? ["local-api"] : []),
      ...(input.config.apiToken.trim() ? ["cloud-token"] : []),
      "cloud-free",
    ].filter((route, index, list) => list.indexOf(route) === index);
  }

  for (const route of routes) {
    throwIfAborted(input.signal);
    try {
      input.onProgress?.({
        phase: "Preparing",
        message: `Trying MinerU ${route}`,
      });
      const result = await runRoute(input, route, engineVersion);
      return {
        ...result,
        warnings: [...warnings, ...result.warnings],
      };
    } catch (error) {
      throwIfAborted(input.signal);
      warnings.push(
        `${route} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`Every MinerU route failed. ${warnings.join(" | ")}`);
}
