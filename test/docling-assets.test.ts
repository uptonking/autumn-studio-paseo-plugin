import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectDoclingAssets,
  directoryHasFiles,
} from "../server/ai-text/engines/docling/assets.ts";
import type { DoclingPictureRef } from "../server/ai-text/engines/docling/docling-json.ts";
import { MAX_ASSET_BYTES } from "../server/ai-text/version-assets.ts";

function picture(
  assetPath: string,
  sourceUri: string,
  pageNumber = 1,
): DoclingPictureRef {
  return { assetPath, sourceUri, pageNumber };
}

describe("docling: collectDoclingAssets", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "paseo-docling-assets-"));
    await mkdir(join(tempDir, "artifacts"), { recursive: true });
    await mkdir(join(tempDir, "other"), { recursive: true });
    await writeFile(join(tempDir, "artifacts", "image_000000.png"), "PNG-A");
    await writeFile(join(tempDir, "other", "image_000001.png"), "PNG-B");
    await writeFile(join(tempDir, "artifacts", "notes.txt"), "not an image");
    await writeFile(join(tempDir, "big.png"), "");
    await truncate(join(tempDir, "big.png"), MAX_ASSET_BYTES + 1);
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("copies referenced images and rewrites full paths and basenames", async () => {
    const warnings: string[] = [];
    const result = await collectDoclingAssets({
      outputDir: tempDir,
      pictures: [
        picture("images/image_000000.png", "artifacts/image_000000.png"),
        picture("images/image_000001.png", "other/image_000001.png"),
      ],
      markdown: [
        "![full](artifacts/image_000000.png)",
        "![base](image_000001.png)",
      ].join("\n"),
      warnings,
    });

    assert.deepEqual(warnings, []);
    assert.equal(result.assets.length, 2);
    assert.equal(result.assets[0]!.path, "images/image_000000.png");
    assert.equal(
      Buffer.from(result.assets[0]!.data).toString("utf8"),
      "PNG-A",
    );
    assert.equal(result.assets[1]!.path, "images/image_000001.png");
    assert.equal(
      result.markdown,
      [
        "![full](images/image_000000.png)",
        "![base](images/image_000001.png)",
      ].join("\n"),
    );
  });

  it("does not rewrite an already rewritten images/ path twice", async () => {
    const result = await collectDoclingAssets({
      outputDir: tempDir,
      pictures: [
        picture("images/image_000000.png", "artifacts/image_000000.png"),
      ],
      markdown: "![x](artifacts/image_000000.png) and ![y](image_000000.png)",
      warnings: [],
    });
    assert.equal(
      result.markdown,
      "![x](images/image_000000.png) and ![y](images/image_000000.png)",
    );
  });

  it("skips absolute, file URI, traversal, and data URI sources", async () => {
    const warnings: string[] = [];
    const result = await collectDoclingAssets({
      outputDir: tempDir,
      pictures: [
        picture("images/a.png", "/etc/passwd.png"),
        picture("images/b.png", `file://${join(tempDir, "artifacts", "image_000000.png")}`),
        picture("images/c.png", "../outside.png"),
        picture("images/d.png", "data:image/png;base64,AAAA"),
      ],
      markdown: "unchanged",
      warnings,
    });
    assert.deepEqual(result.assets, []);
    assert.equal(result.markdown, "unchanged");
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((warning) => warning.includes("Skipped Docling image")));
  });

  it("skips non-image files and oversized images", async () => {
    const warnings: string[] = [];
    const result = await collectDoclingAssets({
      outputDir: tempDir,
      pictures: [
        picture("images/notes.txt", "artifacts/notes.txt"),
        picture("images/big.png", "big.png"),
      ],
      markdown: "",
      warnings,
    });
    assert.deepEqual(result.assets, []);
    assert.ok(warnings.some((warning) => warning.includes("non-image")));
    assert.ok(warnings.some((warning) => warning.includes("oversized")));
  });

  it("warns when a referenced image cannot be read", async () => {
    const warnings: string[] = [];
    const result = await collectDoclingAssets({
      outputDir: tempDir,
      pictures: [picture("images/missing.png", "artifacts/missing.png")],
      markdown: "![missing](artifacts/missing.png)",
      warnings,
    });
    assert.deepEqual(result.assets, []);
    assert.equal(result.markdown, "![missing](artifacts/missing.png)");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /Could not read Docling image/);
  });

  it("reports whether a directory has files", async () => {
    assert.equal(await directoryHasFiles(tempDir), true);
    await mkdir(join(tempDir, "empty"));
    assert.equal(await directoryHasFiles(join(tempDir, "empty")), false);
    assert.equal(await directoryHasFiles(join(tempDir, "missing")), false);
  });
});

describe("docling: copied asset bytes", () => {
  it("reads the image bytes unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paseo-docling-bytes-"));
    try {
      await writeFile(join(dir, "figure.png"), Buffer.from([1, 2, 3, 4]));
      const result = await collectDoclingAssets({
        outputDir: dir,
        pictures: [picture("images/figure.png", "figure.png")],
        markdown: "",
        warnings: [],
      });
      assert.deepEqual(Array.from(result.assets[0]!.data), [1, 2, 3, 4]);
      assert.equal(
        (await readFile(join(dir, "figure.png"))).byteLength,
        4,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
