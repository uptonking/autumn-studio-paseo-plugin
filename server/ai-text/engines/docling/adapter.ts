import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type {
  AiTextExtractionSettings,
} from "../../../../shared/ai-text/profiles.ts";
import type { DoclingConfig } from "../../../../shared/ai-text/engine-configs.ts";
import type { AiTextLayoutDocument } from "../../../../shared/ai-text/layout.ts";
import type {
  AiTextAsset,
  AiTextParseProgress,
} from "../../engine-registry.ts";
import { buildProcessError, runProcess } from "../../command-runner.ts";
import { resolveExecutable } from "../../executable.ts";
import { getDoclingEnvironment } from "./environment.ts";
import { collectDoclingAssets } from "./assets.ts";
import {
  normalizeDoclingDocument,
  type DoclingPictureRef,
} from "./docling-json.ts";

const MAX_MARKDOWN_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024 * 1024;

export interface DoclingParseInput {
  filePath: string;
  fileName: string;
  route: string;
  config: DoclingConfig;
  extraction: AiTextExtractionSettings;
  signal?: AbortSignal;
  onProgress?: (update: AiTextParseProgress) => void;
  onLog?: (line: string) => void;
}

export interface DoclingParseResult {
  markdown: string;
  layout: AiTextLayoutDocument | null;
  assets: AiTextAsset[];
  routeUsed: string;
  engineVersion: string | null;
  warnings: string[];
}

function tokenizeArgs(raw: string): string[] {
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
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
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

function splitLanguages(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildDoclingArgs(input: {
  filePath: string;
  outputDir: string;
  route: string;
  config: DoclingConfig;
  extraction: AiTextExtractionSettings;
}): string[] {
  const { config, extraction } = input;
  const route = input.route === "vlm" ? "vlm" : "standard";
  if (extraction.pages.trim()) {
    throw new Error(
      "Docling profiles do not support page ranges. Clear the page range or use a MinerU profile.",
    );
  }

  const args = [
    input.filePath,
    "--from",
    "pdf",
    "--to",
    "md",
    "--to",
    "json",
    "--output",
    input.outputDir,
    "--image-export-mode",
    "referenced",
    "--pipeline",
    route,
  ];

  if (route === "vlm") {
    args.push("--vlm-model", config.vlmModel.trim() || "granite_docling");
  } else {
    args.push(extraction.ocr ? "--ocr" : "--no-ocr");
    if (extraction.ocr) {
      if (config.ocrEngine) args.push("--ocr-engine", config.ocrEngine);
      for (const language of splitLanguages(config.ocrLangs)) {
        args.push("--ocr-lang", language);
      }
    }
    args.push("--table-mode", config.tableMode);
    if (extraction.formula) args.push("--enrich-formula");
  }

  if (config.device !== "auto") args.push("--device", config.device);
  if (config.numThreads > 0) {
    args.push("--num-threads", String(config.numThreads));
  }
  if (config.artifactsPath.trim()) {
    args.push("--artifacts-path", config.artifactsPath.trim());
  }
  args.push(
    "--document-timeout",
    String(Math.max(30, Math.ceil(extraction.timeoutMs / 1000))),
  );
  args.push(...tokenizeArgs(config.extraArgs));
  return args;
}

async function findOutputFile(
  outputDir: string,
  fileName: string,
  extension: ".md" | ".json",
): Promise<string | null> {
  const stem = basename(fileName, extname(fileName));
  const expected = join(outputDir, `${stem}${extension}`);
  try {
    const stats = await stat(expected);
    if (stats.isFile()) return expected;
  } catch {
    // Fall through to directory scan.
  }
  try {
    const entries = await readdir(outputDir);
    const match = entries.find(
      (entry) => entry.toLowerCase().endsWith(extension) && !entry.startsWith("."),
    );
    return match ? join(outputDir, match) : null;
  } catch {
    return null;
  }
}

async function readBoundedText(
  path: string,
  limit: number,
  label: string,
): Promise<string> {
  const stats = await stat(path);
  if (stats.size > limit) {
    throw new Error(
      `${label} is larger than the ${Math.round(limit / 1024 / 1024)}MB cap`,
    );
  }
  return await readFile(path, "utf8");
}

export async function parseWithDocling(
  input: DoclingParseInput,
): Promise<DoclingParseResult> {
  const command = input.config.doclingCommand.trim() || "docling";
  const doclingPath = await resolveExecutable(command);
  if (!doclingPath) {
    throw new Error(
      `Docling CLI "${command}" was not found. Install it with "uv tool install docling", then retry.`,
    );
  }

  const route = input.route === "vlm" ? "vlm" : "standard";
  const environment = await getDoclingEnvironment({ config: input.config });
  if (environment.status === "needs-setup" && !environment.version) {
    throw new Error(
      environment.recommendations[0] ??
        "Docling needs setup. Open AI Text settings, Engines & Setup.",
    );
  }

  const warnings: string[] = [];
  if (environment.status === "unknown") {
    warnings.push(
      "Docling version could not be read; the installed CLI may be older than 2.50.0.",
    );
  } else if (
    environment.version &&
    environment.status === "needs-setup"
  ) {
    warnings.push(
      `Docling ${environment.version} is older than 2.50.0; some conversion flags may be unavailable.`,
    );
  }
  if (!input.extraction.tables) {
    warnings.push(
      "Docling always extracts tables in the Standard pipeline; the tables switch is ignored.",
    );
  }
  if (input.extraction.imageAnalysis) {
    warnings.push("Docling does not run the image-analysis model; the switch is ignored.");
  }

  const outputDir = await mkdtemp(join(tmpdir(), "paseo-docling-"));
  try {
    input.onProgress?.({ phase: "Parsing document", message: "Running Docling" });
    const result = await runProcess({
      command: doclingPath,
      args: buildDoclingArgs({
        filePath: input.filePath,
        outputDir,
        route,
        config: input.config,
        extraction: input.extraction,
      }),
      timeoutMs: input.extraction.timeoutMs,
      signal: input.signal,
      onLog: input.onLog,
    });
    if (result.aborted) throw new Error("Docling conversion was cancelled");
    if (result.timedOut) throw new Error("Docling conversion timed out");
    if (result.code !== 0) {
      throw new Error(buildProcessError("docling", result));
    }

    const markdownPath = await findOutputFile(
      outputDir,
      input.fileName,
      ".md",
    );
    const jsonPath = await findOutputFile(outputDir, input.fileName, ".json");
    if (!markdownPath) {
      throw new Error(
        "Docling finished without a Markdown file. Check the task log for conversion errors.",
      );
    }
    const markdown = await readBoundedText(
      markdownPath,
      MAX_MARKDOWN_BYTES,
      "Docling Markdown",
    );

    let layout: AiTextLayoutDocument | null = null;
    let pictures: DoclingPictureRef[] = [];
    if (jsonPath) {
      try {
        const rawJson = await readBoundedText(
          jsonPath,
          MAX_JSON_BYTES,
          "Docling JSON",
        );
        const normalized = normalizeDoclingDocument(
          JSON.parse(rawJson),
          input.fileName,
        );
        // JSON is always read for picture references, but the profile decides
        // whether geometry is stored.
        pictures = normalized.pictures;
        if (input.extraction.layout) {
          layout = normalized.layout;
        }
      } catch (error) {
        warnings.push(
          `Docling layout could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      warnings.push("Docling did not produce JSON output; layout blocks are unavailable.");
    }

    input.onProgress?.({ phase: "Collecting images", message: "Collecting images" });
    const collected = await collectDoclingAssets({
      outputDir,
      pictures,
      markdown,
      warnings,
    });

    return {
      markdown: collected.markdown,
      layout,
      assets: collected.assets,
      routeUsed: route,
      engineVersion: environment.version,
      warnings,
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
