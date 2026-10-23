import dns from "node:dns";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { MineruSettings } from "../../shared/contracts.ts";
import type { AiTextLayoutDocument } from "../../shared/ai-text-layout.ts";
import {
  extractDocxMarkdownFromBuffer,
  extractHtmlMarkdownFromBuffer,
} from "./document-extractors.ts";
import {
  extractPdfStreamsPureJs,
  extractPdfWithPopplerAndVision,
} from "./pdf-local-ocr.ts";
import { buildProcessError, runProcess } from "./command-runner.ts";
import { resolveExecutable } from "./executable.ts";
import { getMineruEnvironment } from "./environment.ts";
import { normalizeMineruMiddleJson } from "./layout-normalizer.ts";
import {
  parseMineruZipBuffer,
  runMineruCloudFree,
  runMineruCloudToken,
  type CloudTokenResult,
} from "./mineru-cloud.ts";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported by runtime
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
  modeUsed: string;
  warnings: string[];
  fallbackReason?: string;
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
  settings: MineruSettings;
  signal?: AbortSignal;
  onProgress?: (update: MineruParseProgress) => void;
  onLog?: (line: string) => void;
}

function emptyLocalResult(
  markdown: string,
  modeUsed: string,
): MineruParseResult {
  return {
    markdown,
    layout: null,
    assets: [],
    modeUsed,
    warnings: [],
  };
}

/**
 * Synchronous local document text extractor used for DOCX, HTML, or pure-JS
 * PDF stream fallback.
 */
export function extractLocalDocumentFallback(
  buffer: Buffer,
  fileName: string,
): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    const docxMarkdown = extractDocxMarkdownFromBuffer(buffer, fileName);
    if (docxMarkdown) return docxMarkdown;
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return extractHtmlMarkdownFromBuffer(buffer, fileName);
  }

  const pdfStreamMarkdown = extractPdfStreamsPureJs(buffer, fileName);
  if (pdfStreamMarkdown) {
    return pdfStreamMarkdown;
  }

  return [
    `# ${fileName}`,
    "",
    `Extracted document summary for **${fileName}** (${buffer.byteLength} bytes).`,
    "",
    "## Content",
    "",
    "Document parsed into AI Text Mode.",
    "",
  ].join("\n");
}

export async function extractLocalDocumentWithOcr(input: {
  filePath?: string;
  fileName: string;
  buffer: Buffer;
  enableOcr?: boolean;
  enableTable?: boolean;
  signal?: AbortSignal;
}): Promise<MineruParseResult> {
  const lower = input.fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdfRes = await extractPdfWithPopplerAndVision({
      filePath: input.filePath,
      fileName: input.fileName,
      buffer: input.buffer,
      enableOcr: input.enableOcr,
      enableTable: input.enableTable,
      signal: input.signal,
    });
    if (pdfRes) {
      return emptyLocalResult(pdfRes.markdown, pdfRes.modeUsed);
    }
  }
  return emptyLocalResult(
    extractLocalDocumentFallback(input.buffer, input.fileName),
    "local-fallback",
  );
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
  settings: MineruSettings;
  useLocalApi: boolean;
}): string[] {
  const { settings } = input;
  const args = [
    "parse",
    input.filePath,
    "-o",
    input.outputPath,
    "-f",
    input.format,
  ];

  if (settings.tier) args.push("--tier", settings.tier);
  if (settings.ocrMode) args.push("--ocr-mode", settings.ocrMode);
  if (settings.pages.trim()) args.push("--pages", settings.pages.trim());
  if (settings.disableImageAnalysis) args.push("--disable-image-analysis");

  const remoteUrl = input.useLocalApi
    ? settings.localApiUrl.trim()
    : settings.remoteUrl.trim();
  if (remoteUrl) args.push("--remote-url", remoteUrl);
  if (remoteUrl && !input.useLocalApi && settings.remoteApiKey.trim()) {
    args.push("--api-key", settings.remoteApiKey.trim());
  }
  args.push(...tokenizeArgs(settings.extraArgs));
  return args;
}

async function runMineruKit(
  input: MineruParseInput,
  useLocalApi: boolean,
): Promise<MineruParseResult> {
  const { settings } = input;
  const requestedCommand = settings.kitCommand.trim() || "mineru-kit";
  const command = await resolveExecutable(requestedCommand);
  if (!command) {
    throw new Error(
      `MinerU Kit CLI "${requestedCommand}" was not found. Install it with "uv tool install mineru" or set an absolute path in AI Text Mode settings.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "paseo-mineru-"));
  const wantsLayout = settings.extractLayout;
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
        settings,
        useLocalApi,
      }),
      timeoutMs: settings.timeoutMs,
      signal: input.signal,
      onLog: input.onLog,
    });
    if (result.aborted) {
      throw new Error("MinerU parsing was cancelled");
    }
    if (result.code !== 0) {
      throw new Error(buildProcessError("mineru-kit parse", result));
    }

    if (!wantsLayout) {
      const info = await stat(outputPath);
      if (info.size > MAX_LOCAL_MARKDOWN_BYTES) {
        throw new Error("MinerU Markdown output exceeds the 32MB limit");
      }
      const markdown = await readFile(outputPath, "utf8");
      return {
        markdown,
        layout: null,
        assets: [],
        modeUsed: useLocalApi ? "local-api" : "local-cli",
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
      throw new Error(
        "MinerU produced an archive without a readable markdown.md",
      );
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
      modeUsed: useLocalApi ? "local-api" : "local-cli",
      warnings,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveAutoModes(settings: MineruSettings): Promise<string[]> {
  const environment = await getMineruEnvironment({
    kitCommand: settings.kitCommand,
    localApiUrl: settings.localApiUrl,
    tier: settings.tier,
  });
  const modes: string[] = [];
  if (environment.kit?.available && environment.models?.tierReady) {
    modes.push("local-cli");
  }
  // Keep the local API as a second local route: a ready CLI can still fail on
  // a per-document problem, and the daemon may load models differently.
  if (environment.localApi?.reachable) {
    modes.push("local-api");
  }
  if (settings.apiToken.trim()) modes.push("cloud-token");
  modes.push("cloud-free");
  return modes;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new Error("AI text extraction was cancelled");
}

async function runConfiguredMode(
  input: MineruParseInput,
  mode: string,
): Promise<MineruParseResult> {
  throwIfAborted(input.signal);
  if (mode === "local-cli") {
    return await runMineruKit(input, false);
  }
  if (mode === "local-api") {
    if (!input.settings.localApiUrl.trim()) {
      throw new Error(
        'Local MinerU API mode needs a URL such as "http://127.0.0.1:8000".',
      );
    }
    return await runMineruKit(input, true);
  }
  if (mode === "cloud-token" || mode === "cloud-free") {
    if (!input.settings.apiBaseUrl.trim()) {
      throw new Error("MinerU cloud endpoint is empty.");
    }
  }
  if (mode === "cloud-token") {
    const fileName = input.fileName || basename(input.filePath);
    const wantsLayout = input.settings.extractLayout;
    const cloud = await runMineruCloudToken(
      fileName,
      input.buffer,
      input.settings,
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
          modeUsed: "cloud-token",
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
      cloud.warnings.push(
        "MinerU archive could not be read; using Markdown only",
      );
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
      modeUsed: "cloud-token",
      warnings: cloud.warnings,
    };
  }

  const fileName = input.fileName || basename(input.filePath);
  const markdown = await runMineruCloudFree(
    input.filePath,
    fileName,
    input.buffer,
    input.settings,
    input.signal,
  );
  return {
    markdown,
    layout: null,
    assets: [],
    modeUsed: "cloud-free",
    warnings: [
      "The free MinerU API returns Markdown without layout geometry. Use MinerU Kit or the token API to enable Blocks.",
    ],
  };
}

async function runLocalFallback(
  input: MineruParseInput,
  fallbackReason: string,
  warnings: string[],
): Promise<MineruParseResult> {
  throwIfAborted(input.signal);
  const fileName = input.fileName || basename(input.filePath);
  const local = await extractLocalDocumentWithOcr({
    filePath: input.filePath,
    fileName,
    buffer: input.buffer,
    enableOcr: input.settings.enableOcr,
    enableTable: input.settings.enableTable,
    signal: input.signal,
  });
  return {
    ...local,
    warnings: [...warnings, fallbackReason],
    fallbackReason,
  };
}

export async function parseWithMineru(
  input: MineruParseInput,
): Promise<MineruParseResult> {
  throwIfAborted(input.signal);
  const requestedMode = input.settings.mode || "cloud-free";
  const warnings: string[] = [];

  if (requestedMode === "auto") {
    // Detection is an optimization, not a prerequisite: a failed probe must
    // still leave the cloud routes usable.
    let detected: string[] = [];
    try {
      detected = await resolveAutoModes(input.settings);
    } catch (error) {
      warnings.push(
        `Local MinerU detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const candidates = [
      ...detected,
      ...(input.settings.apiToken.trim() ? ["cloud-token"] : []),
      "cloud-free",
    ].filter((mode, index, list) => list.indexOf(mode) === index);

    for (const mode of candidates) {
      throwIfAborted(input.signal);
      try {
        input.onProgress?.({
          phase: "Preparing",
          message: `Trying ${mode}`,
        });
        return await runConfiguredMode(input, mode);
      } catch (error) {
        throwIfAborted(input.signal);
        warnings.push(
          `${mode} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return await runLocalFallback(
      input,
      "All MinerU routes failed; used local OCR fallback",
      warnings,
    );
  }

  try {
    return await runConfiguredMode(input, requestedMode);
  } catch (error) {
    throwIfAborted(input.signal);
    const reason = `${requestedMode} failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return await runLocalFallback(
      input,
      `${reason}. Used local OCR fallback.`,
      warnings,
    );
  }
}
