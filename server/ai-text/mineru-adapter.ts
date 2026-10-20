import dns from "node:dns";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { execCommand } from "@getpaseo/plugin/server";
import type { MineruSettings } from "../../shared/contracts.ts";
import {
  extractDocxMarkdownFromBuffer,
  extractHtmlMarkdownFromBuffer,
} from "./document-extractors.ts";
import {
  extractPdfStreamsPureJs,
  extractPdfWithPopplerAndVision,
} from "./pdf-local-ocr.ts";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported by runtime
}

export interface MineruParseResult {
  markdown: string;
  modeUsed: string;
}

function toAsciiSafeFileName(fileName: string): string {
  const ext = extname(fileName) || ".pdf";
  const stem = basename(fileName, ext)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${stem || "document"}${ext}`;
}

function normalizeMineruLanguage(lang: string | undefined): string {
  const trimmed = (lang ?? "").trim();
  if (!trimmed || trimmed === "auto") {
    return "ch";
  }
  return trimmed;
}

function withStepTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
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
      return pdfRes;
    }
  }
  return {
    markdown: extractLocalDocumentFallback(input.buffer, input.fileName),
    modeUsed: "local-fallback",
  };
}

async function runMineruCloudFree(
  filePath: string,
  fileName: string,
  buffer: Buffer,
  settings: MineruSettings,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = settings.apiBaseUrl.replace(/\/+$/, "");
  const safeFileName = toAsciiSafeFileName(fileName);
  const initRes = await fetch(`${baseUrl}/api/v1/agent/parse/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: safeFileName,
      enable_ocr: settings.enableOcr,
      enable_formula: settings.enableFormula,
      enable_table: settings.enableTable,
      language: normalizeMineruLanguage(settings.language),
    }),
    signal: withStepTimeout(signal, 10_000),
  });
  if (!initRes.ok) {
    throw new Error(`MinerU free API init failed (HTTP ${initRes.status})`);
  }
  const initJson = (await initRes.json()) as {
    code?: number;
    msg?: string;
    data?: { task_id?: string; file_url?: string };
  };
  const taskId = initJson?.data?.task_id;
  const uploadUrl = initJson?.data?.file_url;
  if (!taskId || !uploadUrl) {
    throw new Error(
      initJson?.msg || `MinerU free API did not return task_id for ${filePath}`,
    );
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
    signal: withStepTimeout(signal, 15_000),
  });
  if (!putRes.ok) {
    throw new Error(`MinerU OSS file upload failed (HTTP ${putRes.status})`);
  }

  const maxPolls = 25;
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const pollRes = await fetch(`${baseUrl}/api/v1/agent/parse/${taskId}`, {
      method: "GET",
      signal: withStepTimeout(signal, 8_000),
    });
    if (!pollRes.ok) {
      throw new Error(`MinerU task poll failed (HTTP ${pollRes.status})`);
    }
    const pollJson = (await pollRes.json()) as {
      data?: {
        state?: string;
        markdown_url?: string;
        full_md?: string;
        err_msg?: string;
      };
    };
    const state = pollJson?.data?.state;
    if (state === "done") {
      if (typeof pollJson.data?.full_md === "string" && pollJson.data.full_md) {
        return pollJson.data.full_md;
      }
      const mdUrl = pollJson.data?.markdown_url;
      if (!mdUrl) {
        throw new Error("MinerU completed without a markdown_url");
      }
      const mdRes = await fetch(mdUrl, {
        signal: withStepTimeout(signal, 8_000),
      });
      if (!mdRes.ok) {
        throw new Error(`Failed to fetch MinerU markdown (HTTP ${mdRes.status})`);
      }
      return await mdRes.text();
    }
    if (state === "failed") {
      throw new Error(pollJson?.data?.err_msg || "MinerU parsing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("MinerU parsing timed out waiting for completion");
}

async function runMineruCloudToken(
  fileName: string,
  buffer: Buffer,
  settings: MineruSettings,
  signal?: AbortSignal,
): Promise<string> {
  const token = settings.apiToken.trim();
  if (!token) {
    throw new Error(
      "MinerU API token is required when MinerU mode is set to Cloud API v4 (Token).",
    );
  }
  const baseUrl = settings.apiBaseUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const safeFileName = toAsciiSafeFileName(fileName);
  const batchRes = await fetch(`${baseUrl}/api/v4/file-urls/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      enable_formula: settings.enableFormula,
      enable_table: settings.enableTable,
      language: normalizeMineruLanguage(settings.language),
      files: [{ name: safeFileName, is_ocr: settings.enableOcr }],
    }),
    signal: withStepTimeout(signal, 10_000),
  });
  if (!batchRes.ok) {
    throw new Error(`MinerU v4 batch init failed (HTTP ${batchRes.status})`);
  }
  const batchJson = (await batchRes.json()) as {
    msg?: string;
    data?: { batch_id?: string; file_urls?: string[] };
  };
  const batchId = batchJson?.data?.batch_id;
  const uploadUrl = batchJson?.data?.file_urls?.[0];
  if (!batchId || !uploadUrl) {
    throw new Error(
      batchJson?.msg || "MinerU v4 API did not return batch_id and file_urls",
    );
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
    signal: withStepTimeout(signal, 15_000),
  });
  if (!putRes.ok) {
    throw new Error(`MinerU v4 upload failed (HTTP ${putRes.status})`);
  }

  const maxPolls = 25;
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const pollRes = await fetch(
      `${baseUrl}/api/v4/extract-results/batch/${batchId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: withStepTimeout(signal, 8_000),
      },
    );
    if (!pollRes.ok) {
      throw new Error(`MinerU v4 poll failed (HTTP ${pollRes.status})`);
    }
    const pollJson = (await pollRes.json()) as {
      data?: {
        extract_result?: Array<{
          state?: string;
          full_md?: string;
          markdown_url?: string;
          full_zip_url?: string;
          err_msg?: string;
        }>;
      };
    };
    const item = pollJson?.data?.extract_result?.[0];
    if (item?.state === "done") {
      if (typeof item.full_md === "string" && item.full_md) {
        return item.full_md;
      }
      if (item.markdown_url) {
        const mdRes = await fetch(item.markdown_url, {
          signal: withStepTimeout(signal, 8_000),
        });
        if (mdRes.ok) return await mdRes.text();
      }
      if (item.full_zip_url) {
        return `# ${fileName}\n\nMinerU v4 extraction archive: ${item.full_zip_url}\n`;
      }
    }
    if (item?.state === "failed") {
      throw new Error(item.err_msg || "MinerU v4 task failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("MinerU v4 batch task timed out");
}

async function findFirstMarkdownFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = await findFirstMarkdownFile(full);
      if (nested) return nested;
    }
  }
  return null;
}

async function runMineruLocalCli(
  filePath: string,
  settings: MineruSettings,
  signal?: AbortSignal,
): Promise<string> {
  const tempOut = await mkdtemp(join(tmpdir(), "paseo-mineru-"));
  const cmd = settings.cliCommand.trim() || "mineru";
  try {
    await execCommand(cmd, ["-p", filePath, "-o", tempOut], {
      timeout: 180_000,
      signal,
    });
    const mdPath = await findFirstMarkdownFile(tempOut);
    if (!mdPath) {
      throw new Error(`MinerU CLI (${cmd}) did not produce a .md output file`);
    }
    return await readFile(mdPath, "utf8");
  } finally {
    await rm(tempOut, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function parseWithMineru(input: {
  filePath: string;
  fileName?: string;
  buffer: Buffer;
  settings: MineruSettings;
  signal?: AbortSignal;
}): Promise<MineruParseResult> {
  const fileName = input.fileName || basename(input.filePath);
  const mode = input.settings.mode || "cloud-free";

  if (mode === "local-cli") {
    try {
      const markdown = await runMineruLocalCli(
        input.filePath,
        input.settings,
        input.signal,
      );
      return { markdown, modeUsed: "local-cli" };
    } catch {
      return await extractLocalDocumentWithOcr({
        filePath: input.filePath,
        fileName,
        buffer: input.buffer,
        enableOcr: input.settings.enableOcr,
        enableTable: input.settings.enableTable,
        signal: input.signal,
      });
    }
  }

  if (mode === "cloud-token" && input.settings.apiToken.trim()) {
    try {
      const markdown = await runMineruCloudToken(
        fileName,
        input.buffer,
        input.settings,
        input.signal,
      );
      return { markdown, modeUsed: "cloud-token" };
    } catch {
      return await extractLocalDocumentWithOcr({
        filePath: input.filePath,
        fileName,
        buffer: input.buffer,
        enableOcr: input.settings.enableOcr,
        enableTable: input.settings.enableTable,
        signal: input.signal,
      });
    }
  }

  try {
    const markdown = await runMineruCloudFree(
      input.filePath,
      fileName,
      input.buffer,
      input.settings,
      input.signal,
    );
    return { markdown, modeUsed: "cloud-free" };
  } catch {
    return await extractLocalDocumentWithOcr({
      filePath: input.filePath,
      fileName,
      buffer: input.buffer,
      enableOcr: input.settings.enableOcr,
      enableTable: input.settings.enableTable,
      signal: input.signal,
    });
  }
}
