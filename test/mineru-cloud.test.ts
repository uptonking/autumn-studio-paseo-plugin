import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { parseMineruZipBuffer } from "../server/ai-text/engines/mineru/cloud.ts";

const MIDDLE_JSON = JSON.stringify({
  schema: "docvortex.middle",
  pages: [{ page_idx: 0, blocks: [] }],
});

function zip(entries: Record<string, string | Uint8Array>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    files[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(files);
}

describe("MinerU zip parsing", () => {
  it("normalizes ./ prefixes and backslash separators", () => {
    const parsed = parseMineruZipBuffer(
      zip({
        "./markdown.md": "# Guide\n",
        "./middle_json.json": MIDDLE_JSON,
        "images\\pixel.png": new Uint8Array([1, 2, 3]),
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed.markdown, "# Guide\n");
    assert.deepEqual(parsed.middleJson, JSON.parse(MIDDLE_JSON));
    assert.deepEqual(
      parsed.assets.map((asset) => asset.path),
      ["images/pixel.png"],
    );
    assert.deepEqual(parsed.warnings, []);
  });

  it("finds nested MinerU output directories", () => {
    const parsed = parseMineruZipBuffer(
      zip({
        "result/markdown.md": "# Nested\n",
        "result/middle_json.json": MIDDLE_JSON,
        "result/images/a.jpg": new Uint8Array([9]),
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed.markdown, "# Nested\n");
    assert.equal(parsed.middleJson !== null, true);
    assert.deepEqual(
      parsed.assets.map((asset) => asset.path),
      ["images/a.jpg"],
    );
  });

  it("keeps root-level layout and images beside a nested Markdown file", () => {
    const parsed = parseMineruZipBuffer(
      zip({
        "result/markdown.md": "# Nested\n",
        "middle_json.json": MIDDLE_JSON,
        "images/root.jpg": new Uint8Array([1]),
        "result/images/nested.jpg": new Uint8Array([2]),
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed.markdown, "# Nested\n");
    assert.deepEqual(parsed.middleJson, JSON.parse(MIDDLE_JSON));
    assert.deepEqual(
      parsed.assets.map((asset) => asset.path).sort(),
      ["images/nested.jpg", "images/root.jpg"],
    );
  });

  it("ignores README.md when choosing the extracted document", () => {
    const parsed = parseMineruZipBuffer(
      zip({
        "README.md": "# Archive notes\n",
        "docs/result/markdown.md": "# Real document\n",
        "docs/result/middle_json.json": MIDDLE_JSON,
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed.markdown, "# Real document\n");
    assert.equal(parsed.middleJson !== null, true);
  });

  it("rejects traversal entries and archives without Markdown", () => {
    assert.equal(
      parseMineruZipBuffer(
        zip({
          "../markdown.md": "# Escaped\n",
          "images/../../secret.png": new Uint8Array([1]),
        }),
      ),
      null,
    );
    assert.equal(parseMineruZipBuffer(zip({ "notes.txt": "x" })), null);
  });

  it("keeps Markdown and assets when layout JSON is corrupt", () => {
    const parsed = parseMineruZipBuffer(
      zip({
        "markdown.md": "# Partial\n",
        "middle_json.json": "{not json",
        "images/pixel.png": new Uint8Array([1]),
        "images/vector.pdf": new Uint8Array([2]),
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed.markdown, "# Partial\n");
    assert.equal(parsed.middleJson, null);
    assert.deepEqual(
      parsed.assets.map((asset) => asset.path),
      ["images/pixel.png"],
    );
    assert.ok(
      parsed.warnings.some((warning) => warning.includes("could not be parsed")),
    );
  });

  it("returns null for data that is not a zip", () => {
    assert.equal(parseMineruZipBuffer(strToU8("not a zip file")), null);
  });
});
