import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  buildMineruKitArgs,
  parseWithMineru,
} from "../server/ai-text/engines/mineru/adapter.ts";
import {
  DEFAULT_MINERU_CONFIG,
  type MineruConfig,
} from "../shared/ai-text/engine-configs.ts";
import {
  DEFAULT_AI_TEXT_EXTRACTION,
  type AiTextExtractionSettings,
} from "../shared/ai-text/profiles.ts";

function build(
  configOverrides: Partial<MineruConfig>,
  extractionOverrides: Partial<AiTextExtractionSettings> = {},
  useLocalApi = false,
): string[] {
  return buildMineruKitArgs({
    filePath: "/docs/guide.pdf",
    outputPath: "/tmp/result.zip",
    format: "zip",
    config: { ...DEFAULT_MINERU_CONFIG, ...configOverrides },
    extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, ...extractionOverrides },
    useLocalApi,
  });
}

describe("MinerU Kit argument building", () => {
  it("passes the core v4 parse flags", () => {
    const args = build(
      { tier: "basic", ocrMode: "ocr" },
      {
        ocr: true,
        pages: "1-3",
        imageAnalysis: false,
      },
    );
    assert.deepEqual(args.slice(0, 6), [
      "parse",
      "/docs/guide.pdf",
      "-o",
      "/tmp/result.zip",
      "-f",
      "zip",
    ]);
    assert.deepEqual(args.slice(6), [
      "--tier",
      "basic",
      "--ocr-mode",
      "ocr",
      "--pages",
      "1-3",
      "--disable-image-analysis",
    ]);
  });

  it("forces the text layer when the profile turns OCR off", () => {
    const args = build(
      { ocrMode: "auto" },
      { ocr: false, imageAnalysis: true },
    );
    assert.deepEqual(args.slice(6, 8), ["--tier", "standard"]);
    assert.deepEqual(args.slice(-2), ["--ocr-mode", "txt"]);
  });

  it("only sends --api-key together with a remote URL", () => {
    const withoutUrl = build({ remoteApiKey: "secret" });
    assert.equal(withoutUrl.includes("--api-key"), false);

    const withUrl = build({
      remoteUrl: "https://mineru.example.com",
      remoteApiKey: "secret",
    });
    assert.deepEqual(withUrl.slice(-4), [
      "--remote-url",
      "https://mineru.example.com",
      "--api-key",
      "secret",
    ]);
  });

  it("uses the local API URL without leaking the remote key", () => {
    const args = build(
      {
        localApiUrl: "http://127.0.0.1:9000",
        remoteUrl: "https://mineru.example.com",
        remoteApiKey: "secret",
      },
      {},
      true,
    );
    assert.deepEqual(args.slice(-2), ["--remote-url", "http://127.0.0.1:9000"]);
    assert.equal(args.includes("--api-key"), false);
  });

  it("passes extra arguments through the tokenizer", () => {
    const args = build({ extraArgs: '--device cpu --label "two words"' });
    assert.deepEqual(args.slice(-4), ["--device", "cpu", "--label", "two words"]);
  });
});

describe("MinerU parse cancellation", () => {
  it("rejects an aborted parse instead of falling back to another route", async () => {
    const reason = new Error("stop now");
    await assert.rejects(
      parseWithMineru({
        filePath: "/docs/guide.pdf",
        fileName: "guide.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        route: "cloud-free",
        config: DEFAULT_MINERU_CONFIG,
        extraction: DEFAULT_AI_TEXT_EXTRACTION,
        signal: AbortSignal.abort(reason),
      }),
      /stop now/,
    );
  });
});

function cloudTokenZip(): Uint8Array {
  return zipSync({
    "markdown.md": strToU8("# Cloud\n"),
    "middle_json.json": strToU8(
      JSON.stringify({
        schema: "docvortex.middle",
        pages: [
          {
            page_idx: 0,
            blocks: [
              {
                type: "text",
                bbox: [0.1, 0.1, 0.9, 0.2],
                content: "Cloud layout block",
              },
            ],
          },
        ],
      }),
    ),
    "images/pixel.png": new Uint8Array([1, 2, 3]),
  });
}

async function parseCloudToken(extractLayout: boolean) {
  const originalFetch = globalThis.fetch;
  const zipBytes = cloudTokenZip();
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/api/v4/file-urls/batch")) {
      return new Response(
        JSON.stringify({
          data: {
            batch_id: "batch-1",
            file_urls: ["https://upload.test/file"],
          },
        }),
        { status: 200 },
      );
    }
    if (method === "PUT" && url === "https://upload.test/file") {
      return new Response("", { status: 200 });
    }
    if (method === "GET" && url.includes("/api/v4/extract-results/batch/")) {
      return new Response(
        JSON.stringify({
          data: {
            extract_result: [
              {
                state: "done",
                full_md: "# Cloud\n",
                full_zip_url: "https://zip.test/result.zip",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (method === "GET" && url === "https://zip.test/result.zip") {
      return new Response(zipBytes as unknown as BodyInit, { status: 200 });
    }
    throw new Error(`unexpected cloud fetch: ${method} ${url}`);
  }) as typeof fetch;

  try {
    return await parseWithMineru({
      filePath: "/docs/guide.pdf",
      fileName: "guide.pdf",
      buffer: Buffer.from("%PDF-1.4"),
      route: "cloud-token",
      config: {
        ...DEFAULT_MINERU_CONFIG,
        apiToken: "token",
        apiBaseUrl: "https://mineru.test",
      },
      extraction: {
        ...DEFAULT_AI_TEXT_EXTRACTION,
        layout: extractLayout,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("MinerU cloud token layout option", () => {
  it("skips layout when the profile turns layout extraction off", async () => {
    const result = await parseCloudToken(false);
    assert.equal(result.routeUsed, "cloud-token");
    assert.equal(result.layout, null);
    assert.equal(result.assets.length, 1);
    assert.ok(result.markdown.includes("# Cloud"));
  });

  it("keeps layout and assets when layout extraction is on", async () => {
    const result = await parseCloudToken(true);
    assert.equal(result.routeUsed, "cloud-token");
    assert.ok(result.layout);
    assert.equal(result.layout.blockCount, 1);
    assert.equal(result.layout.blocks[0]?.text, "Cloud layout block");
    assert.equal(result.assets.length, 1);
  });
});
