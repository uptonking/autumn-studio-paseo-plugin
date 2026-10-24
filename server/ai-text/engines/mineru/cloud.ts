import { basename, extname } from "node:path";
import { unzipSync } from "fflate";

export interface MineruCloudSettings {
  apiBaseUrl: string;
  apiToken: string;
  enableOcr: boolean;
  enableFormula: boolean;
  enableTable: boolean;
  language: string;
  timeoutMs: number;
}

const MAX_ZIP_BYTES = 512 * 1024 * 1024;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_ASSETS_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 32 * 1024 * 1024;
const MAX_MIDDLE_JSON_BYTES = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES =
  MAX_ASSETS_TOTAL_BYTES + MAX_MARKDOWN_BYTES + MAX_MIDDLE_JSON_BYTES;
const MAX_HTTP_ERROR_CHARS = 300;
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
]);

export interface MineruZipAsset {
  path: string;
  data: Uint8Array;
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

function withStepTimeout(
  signal: AbortSignal | undefined,
  ms: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function abortError(signal?: AbortSignal): Error {
  return (
    signal?.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

/** Sleep that resolves with the caller's abort and clears its timer. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function totalTimeoutMs(settings: MineruCloudSettings): number {
  const timeout = Number(settings.timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) return 900_000;
  return Math.max(30_000, Math.min(timeout, 3_600_000));
}

async function httpFailure(label: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.text()).trim();
    if (body) detail = `: ${body.slice(0, MAX_HTTP_ERROR_CHARS)}`;
  } catch {
    // The status code is still useful when the body cannot be read.
  }
  return new Error(`${label} (HTTP ${res.status})${detail}`);
}

/** Reads a download while enforcing a size cap instead of buffering it whole. */
async function readResponseCapped(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes} byte limit`);
  }
  if (!res.body) {
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes} byte limit`);
    }
    return buffer;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`${label} exceeds the ${maxBytes} byte limit`);
    }
    chunks.push(value);
  }

  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function normalizeZipEntryPath(raw: string): string | null {
  let normalized = raw.replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/^\/+/, "");
  if (!normalized) return null;
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return normalized;
}

export interface ParsedMineruZip {
  markdown: string;
  middleJson: unknown | null;
  assets: MineruZipAsset[];
  warnings: string[];
}

export function parseMineruZipBuffer(
  zipBytes: Uint8Array,
): ParsedMineruZip | null {
  if (zipBytes.byteLength > MAX_ZIP_BYTES) return null;

  const warnings: string[] = [];
  let uncompressedBytes = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes, {
      filter: (file) => {
        const name = normalizeZipEntryPath(file.name);
        if (!name) return false;
        const isMarkdown = name.toLowerCase().endsWith(".md");
        const isMiddleJson =
          name === "middle_json.json" ||
          name.toLowerCase().endsWith("middle_json.json") ||
          name.toLowerCase().endsWith("_middle.json");
        const isImage =
          name.startsWith("images/") || name.includes("/images/");
        if (!isMarkdown && !isMiddleJson && !isImage) return false;

        if (isImage && !ALLOWED_IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
          return false;
        }
        if (isMarkdown && file.originalSize > MAX_MARKDOWN_BYTES) {
          warnings.push(`Skipped oversized Markdown entry ${name}`);
          return false;
        }
        if (isMiddleJson && file.originalSize > MAX_MIDDLE_JSON_BYTES) {
          warnings.push(`Skipped oversized layout entry ${name}`);
          return false;
        }
        if (isImage && file.originalSize > MAX_ASSET_BYTES) {
          warnings.push(`Skipped oversized image asset ${name}`);
          return false;
        }
        if (uncompressedBytes + file.originalSize > MAX_UNCOMPRESSED_BYTES) {
          warnings.push("Skipped zip entries over the extraction memory cap");
          return false;
        }
        uncompressedBytes += file.originalSize;
        return true;
      },
    });
  } catch {
    return null;
  }

  // `filter` only decides inclusion; fflate keeps the archive's raw names.
  // Normalize here so `./markdown.md` and `images\\a.png` stay discoverable.
  const normalized = new Map<string, Uint8Array>();
  for (const [rawName, data] of Object.entries(entries)) {
    const name = normalizeZipEntryPath(rawName);
    if (!name) continue;
    if (normalized.has(name)) {
      warnings.push(`Ignored duplicate zip entry ${name}`);
      continue;
    }
    normalized.set(name, data);
  }

  const names = [...normalized.keys()];
  const markdownCandidates = names.filter(
    (name) =>
      name.toLowerCase().endsWith(".md") &&
      !/(^|\/)readme\.md$/i.test(name),
  );
  const markdownPool =
    markdownCandidates.length > 0
      ? markdownCandidates
      : names.filter((name) => name.toLowerCase().endsWith(".md"));
  const markdownName =
    markdownPool.find((name) => name === "markdown.md") ??
    markdownPool.sort((a, b) => a.length - b.length)[0];
  if (!markdownName) return null;

  // Some archives wrap the output in a folder. Rebase paths so Markdown image
  // references (`images/x.png`) match the assets next to the Markdown file.
  const rootPrefix = markdownName.includes("/")
    ? markdownName.slice(0, markdownName.lastIndexOf("/") + 1)
    : "";
  const view = new Map<string, Uint8Array>();
  if (rootPrefix) {
    for (const [name, data] of normalized) {
      if (name.startsWith(rootPrefix)) {
        view.set(name.slice(rootPrefix.length), data);
      }
    }
  } else {
    for (const [name, data] of normalized) view.set(name, data);
  }

  // A wrapper folder is common, but metadata and images can still sit at the
  // archive root. Look through both views so a nested Markdown file does not
  // hide root-level layout JSON or image assets.
  const lookupEntry = (name: string): Uint8Array | undefined =>
    view.get(name) ?? normalized.get(name);

  const viewNames = [...view.keys()];
  const middleName =
    viewNames.find((name) => name === "middle_json.json") ??
    viewNames.find((name) => name.toLowerCase().endsWith("middle_json.json")) ??
    viewNames.find((name) => name.toLowerCase().endsWith("_middle.json")) ??
    names.find((name) => name === "middle_json.json") ??
    names.find((name) => name.toLowerCase().endsWith("middle_json.json")) ??
    names.find((name) => name.toLowerCase().endsWith("_middle.json"));

  const assetEntries = new Map<string, Uint8Array>();
  const addAsset = (path: string, data: Uint8Array): void => {
    if (!path.startsWith("images/") || assetEntries.has(path)) return;
    assetEntries.set(path, data);
  };
  for (const [name, data] of view) addAsset(name, data);
  for (const [name, data] of normalized) {
    addAsset(
      rootPrefix && name.startsWith(rootPrefix)
        ? name.slice(rootPrefix.length)
        : name,
      data,
    );
  }

  let totalAssetBytes = 0;
  const assets: MineruZipAsset[] = [];
  for (const [name, data] of assetEntries) {
    if (data.byteLength > MAX_ASSET_BYTES) {
      warnings.push(`Skipped oversized image asset ${name}`);
      continue;
    }
    if (totalAssetBytes + data.byteLength > MAX_ASSETS_TOTAL_BYTES) {
      warnings.push("Skipped remaining image assets over the 512MB version cap");
      break;
    }
    totalAssetBytes += data.byteLength;
    assets.push({ path: name, data });
  }

  let middleJson: unknown | null = null;
  if (middleName) {
    try {
      const bytes = lookupEntry(middleName);
      middleJson = bytes
        ? JSON.parse(Buffer.from(bytes).toString("utf8"))
        : null;
      if (!bytes) warnings.push("MinerU layout JSON could not be read");
    } catch {
      warnings.push("MinerU middle_json.json could not be parsed");
    }
  }

  const markdownBytes = lookupEntry(markdownName.slice(rootPrefix.length));
  if (!markdownBytes) return null;
  return {
    markdown: Buffer.from(markdownBytes).toString("utf8"),
    middleJson,
    assets,
    warnings,
  };
}

export async function runMineruCloudFree(
  filePath: string,
  fileName: string,
  buffer: Buffer,
  settings: MineruCloudSettings,
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
    throw await httpFailure("MinerU free API init failed", initRes);
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
    signal: withStepTimeout(signal, Math.max(60_000, totalTimeoutMs(settings))),
  });
  if (!putRes.ok) {
    throw await httpFailure("MinerU OSS file upload failed", putRes);
  }

  const deadline = Date.now() + totalTimeoutMs(settings);
  while (Date.now() < deadline) {
    const pollRes = await fetch(`${baseUrl}/api/v1/agent/parse/${taskId}`, {
      method: "GET",
      signal: withStepTimeout(signal, 8_000),
    });
    if (!pollRes.ok) {
      throw await httpFailure("MinerU task poll failed", pollRes);
    }
    const pollJson = (await pollRes.json()) as {
      data?: {
        state?: string;
        markdown_url?: string;
        full_md?: string;
        err_msg?: string;
      };
    };
    const state = pollJson?.data?.state?.toLowerCase();
    if (state === "done") {
      if (typeof pollJson.data?.full_md === "string" && pollJson.data.full_md) {
        if (pollJson.data.full_md.length > MAX_MARKDOWN_BYTES) {
          throw new Error("MinerU returned Markdown over the 32MB limit");
        }
        return pollJson.data.full_md;
      }
      const mdUrl = pollJson.data?.markdown_url;
      if (!mdUrl) {
        throw new Error("MinerU completed without a markdown_url");
      }
      const mdRes = await fetch(mdUrl, {
        signal: withStepTimeout(signal, 30_000),
      });
      if (!mdRes.ok) {
        throw await httpFailure("Failed to fetch MinerU markdown", mdRes);
      }
      const bytes = await readResponseCapped(
        mdRes,
        MAX_MARKDOWN_BYTES,
        "MinerU Markdown",
      );
      return Buffer.from(bytes).toString("utf8");
    }
    if (state === "failed") {
      throw new Error(pollJson?.data?.err_msg || "MinerU parsing failed");
    }
    await sleep(1000, signal);
  }
  throw new Error("MinerU parsing timed out waiting for completion");
}

export interface CloudTokenResult {
  markdown: string;
  zipBytes: Uint8Array | null;
  warnings: string[];
}

export async function runMineruCloudToken(
  fileName: string,
  buffer: Buffer,
  settings: MineruCloudSettings,
  signal?: AbortSignal,
): Promise<CloudTokenResult> {
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
    throw await httpFailure("MinerU v4 batch init failed", batchRes);
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
    signal: withStepTimeout(signal, Math.max(60_000, totalTimeoutMs(settings))),
  });
  if (!putRes.ok) {
    throw await httpFailure("MinerU v4 upload failed", putRes);
  }

  const warnings: string[] = [];
  const deadline = Date.now() + totalTimeoutMs(settings);
  while (Date.now() < deadline) {
    const pollRes = await fetch(
      `${baseUrl}/api/v4/extract-results/batch/${batchId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: withStepTimeout(signal, 8_000),
      },
    );
    if (!pollRes.ok) {
      throw await httpFailure("MinerU v4 poll failed", pollRes);
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
    const state = item?.state?.toLowerCase();
    if (state === "done") {
      if (item?.full_zip_url) {
        try {
          const zipRes = await fetch(item.full_zip_url, {
            signal: withStepTimeout(signal, 120_000),
          });
          if (zipRes.ok) {
            return {
              // Keep the API Markdown as a fallback for archives this daemon
              // cannot read; the adapter prefers the archive when it parses.
              markdown:
                typeof item.full_md === "string" &&
                item.full_md.length <= MAX_MARKDOWN_BYTES
                  ? item.full_md
                  : "",
              zipBytes: await readResponseCapped(
                zipRes,
                MAX_ZIP_BYTES,
                "MinerU v4 archive",
              ),
              warnings,
            };
          }
          warnings.push(
            (await httpFailure("MinerU v4 archive download failed", zipRes))
              .message,
          );
        } catch (error) {
          // A cancel must abort the whole parse; only real download failures
          // may degrade to the Markdown-only result.
          if (signal?.aborted) throw abortError(signal);
          warnings.push(
            `MinerU v4 archive download failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      warnings.push(
        "MinerU v4 response had no downloadable archive; layout blocks are unavailable",
      );
      if (typeof item?.full_md === "string" && item.full_md) {
        if (item.full_md.length > MAX_MARKDOWN_BYTES) {
          throw new Error("MinerU v4 returned Markdown over the 32MB limit");
        }
        return { markdown: item.full_md, zipBytes: null, warnings };
      }
      if (item?.markdown_url) {
        const mdRes = await fetch(item.markdown_url, {
          signal: withStepTimeout(signal, 30_000),
        });
        if (mdRes.ok) {
          const bytes = await readResponseCapped(
            mdRes,
            MAX_MARKDOWN_BYTES,
            "MinerU v4 Markdown",
          );
          return {
            markdown: Buffer.from(bytes).toString("utf8"),
            zipBytes: null,
            warnings,
          };
        }
        warnings.push(
          (await httpFailure("MinerU v4 markdown download failed", mdRes))
            .message,
        );
      }
      throw new Error("MinerU v4 task completed without Markdown or archive");
    }
    if (state === "failed") {
      throw new Error(item?.err_msg || "MinerU v4 task failed");
    }
    await sleep(1500, signal);
  }
  throw new Error("MinerU v4 batch task timed out");
}
