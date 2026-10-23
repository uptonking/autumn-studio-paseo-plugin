import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { buildMineruKitArgs, parseWithMineru } from "../server/ai-text/mineru-adapter.ts";
import { DEFAULT_MINERU_SETTINGS } from "../shared/ai-text-settings.ts";
import type { MineruSettings } from "../shared/ai-text-settings.ts";

function settings(overrides: Partial<MineruSettings> = {}): MineruSettings {
  return { ...DEFAULT_MINERU_SETTINGS, ...overrides };
}

function build(overrides: Partial<MineruSettings>, useLocalApi = false): string[] {
  return buildMineruKitArgs({
    filePath: "/docs/guide.pdf",
    outputPath: "/tmp/result.zip",
    format: "zip",
    settings: settings(overrides),
    useLocalApi,
  });
}

describe("MinerU Kit argument building", () => {
  it("passes the core v4 parse flags", () => {
    const args = build({
      tier: "basic",
      ocrMode: "ocr",
      pages: "1-3",
      disableImageAnalysis: true,
    });
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
  it("rejects an aborted parse instead of falling back to local OCR", async () => {
    const reason = new Error("stop now");
    await assert.rejects(
      parseWithMineru({
        filePath: "/docs/guide.pdf",
        fileName: "guide.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        settings: settings({ mode: "cloud-free" }),
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
      settings: settings({
        mode: "cloud-token",
        apiToken: "token",
        apiBaseUrl: "https://mineru.test",
        extractLayout,
      }),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("MinerU cloud token layout option", () => {
  it("skips layout when Extract layout metadata is off", async () => {
    const result = await parseCloudToken(false);
    assert.equal(result.modeUsed, "cloud-token");
    assert.equal(result.layout, null);
    assert.equal(result.assets.length, 1);
    assert.ok(result.markdown.includes("# Cloud"));
  });

  it("keeps layout and assets when Extract layout metadata is on", async () => {
    const result = await parseCloudToken(true);
    assert.equal(result.modeUsed, "cloud-token");
    assert.ok(result.layout);
    assert.equal(result.layout.blockCount, 1);
    assert.equal(result.layout.blocks[0]?.text, "Cloud layout block");
    assert.equal(result.assets.length, 1);
  });
});
