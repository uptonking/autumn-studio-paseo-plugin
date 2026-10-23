import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendExtractedVersion,
  deleteExtractedVersion,
  readDocumentMetadata,
} from "../server/ai-text/metadata-store.ts";
import { sanitizeAssetRelativePath } from "../shared/asset-paths.ts";
import {
  readExtractedVersionAsset,
  readExtractedVersionLayout,
} from "../server/ai-text/version-artifacts.ts";
import type { AiTextLayoutDocument } from "../shared/ai-text-layout.ts";

const SAMPLE_LAYOUT: AiTextLayoutDocument = {
  schemaVersion: 1,
  source: "mineru-kit",
  parserId: "mineru",
  producedAt: "2026-10-21T00:00:00.000Z",
  pageCount: 1,
  blockCount: 2,
  blocks: [
    {
      id: "p1-b0",
      pageNumber: 1,
      type: "text",
      bbox: [0.1, 0.1, 0.9, 0.3],
      text: "Hello layout",
    },
    {
      id: "p1-b1",
      pageNumber: 1,
      type: "image",
      bbox: [0.1, 0.4, 0.6, 0.8],
      text: "Diagram",
      imagePath: "images/pixel.png",
    },
  ],
};

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("ai-text artifacts: layout and assets", () => {
  let workspaceRoot: string;

  before(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "paseo-ai-text-artifacts-"));
  });

  after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("rejects unsafe asset paths", () => {
    assert.equal(sanitizeAssetRelativePath("images/a.png"), "images/a.png");
    assert.equal(
      sanitizeAssetRelativePath("./images/nested/a.jpg"),
      "images/nested/a.jpg",
    );
    assert.equal(sanitizeAssetRelativePath("/images/a.png"), "images/a.png");
    assert.equal(
      sanitizeAssetRelativePath("images/nested/deep/a.png"),
      "images/nested/deep/a.png",
    );
    for (const unsafe of [
      "../images/a.png",
      "//images/a.png",
      "images/../../a.png",
      "images//a.png",
      "files/a.png",
      "a.png",
      "",
    ]) {
      assert.equal(sanitizeAssetRelativePath(unsafe), null, unsafe);
    }
  });

  it("persists layout, assets, and metadata together and serves them back", async () => {
    const appended = await appendExtractedVersion({
      workspaceRootPath: workspaceRoot,
      sourceRelPath: "docs/guide.pdf",
      sourceSize: 2048,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Guide\n\nHello layout\n",
      durationMs: 120,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU",
        agentId: "pi",
        usedAgentRefinement: false,
        modeUsed: "local-cli",
        warnings: [],
      },
      layout: SAMPLE_LAYOUT,
      assets: [
        { path: "images/pixel.png", data: new Uint8Array(PIXEL_PNG) },
        { path: "../escape.png", data: new Uint8Array([1, 2, 3]) },
      ],
    });

    const version = appended.newVersion;
    assert.equal(version.provenance.modeUsed, "local-cli");
    assert.equal(version.provenance.warnings?.length, 1);
    assert.match(version.provenance.warnings![0]!, /unsafe asset path/);
    assert.equal(version.layout?.blockCount, 2);
    assert.equal(version.layout?.pageCount, 1);
    assert.equal(version.layout?.source, "mineru-kit");
    assert.equal(version.assets?.imageCount, 1);
    assert.ok(version.assets!.totalBytes > 0);

    const layoutResult = await readExtractedVersionLayout(
      workspaceRoot,
      "docs/guide.pdf",
      version.id,
    );
    assert.equal(layoutResult.message, undefined);
    assert.deepEqual(layoutResult.layout, SAMPLE_LAYOUT);

    const asset = await readExtractedVersionAsset(
      workspaceRoot,
      "docs/guide.pdf",
      version.id,
      "images/pixel.png",
    );
    assert.equal(asset.mimeType, "image/png");
    assert.deepEqual(Buffer.from(asset.base64, "base64"), PIXEL_PNG);

    const assetDir = await readdir(
      join(workspaceRoot, ".autumn", "docs__guide.pdf", version.assets!.dirName, "images"),
    );
    assert.deepEqual(assetDir, ["pixel.png"]);

    await assert.rejects(
      readExtractedVersionAsset(
        workspaceRoot,
        "docs/guide.pdf",
        version.id,
        "../metadata.json",
      ),
      /Invalid image asset path/,
    );
  });

  it("degrades to a clear message when a version has no layout", async () => {
    const appended = await appendExtractedVersion({
      workspaceRootPath: workspaceRoot,
      sourceRelPath: "docs/plain.pdf",
      sourceSize: 10,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Plain\n",
      durationMs: 10,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU",
        agentId: "pi",
        usedAgentRefinement: false,
      },
    });

    const result = await readExtractedVersionLayout(
      workspaceRoot,
      "docs/plain.pdf",
      appended.newVersion.id,
    );
    assert.equal(result.layout, null);
    assert.match(result.message ?? "", /no layout metadata/);

    const metadata = await readDocumentMetadata(workspaceRoot, "docs/plain.pdf");
    assert.equal(metadata.metadata?.versions[0]?.layout, null);
  });

  it("stores nested and duplicate image paths once", async () => {
    const appended = await appendExtractedVersion({
      workspaceRootPath: workspaceRoot,
      sourceRelPath: "docs/nested.pdf",
      sourceSize: 10,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Nested\n",
      durationMs: 10,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU",
        agentId: "pi",
        usedAgentRefinement: false,
      },
      assets: [
        { path: "images/nested/deep/pixel.png", data: new Uint8Array(PIXEL_PNG) },
        { path: "images/nested/deep/pixel.png", data: new Uint8Array(PIXEL_PNG) },
      ],
    });

    const version = appended.newVersion;
    assert.equal(version.assets?.imageCount, 1);
    assert.match(
      version.provenance.warnings?.join("\n") ?? "",
      /duplicate image asset/,
    );

    const asset = await readExtractedVersionAsset(
      workspaceRoot,
      "docs/nested.pdf",
      version.id,
      "images/nested/deep/pixel.png",
    );
    assert.deepEqual(Buffer.from(asset.base64, "base64"), PIXEL_PNG);
  });

  it("clears missing layout and asset refs on read, and deletes them with the version", async () => {
    const appended = await appendExtractedVersion({
      workspaceRootPath: workspaceRoot,
      sourceRelPath: "docs/removable.pdf",
      sourceSize: 10,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Removable\n",
      durationMs: 10,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU",
        agentId: "pi",
        usedAgentRefinement: false,
      },
      layout: SAMPLE_LAYOUT,
      assets: [
        { path: "images/pixel.png", data: new Uint8Array(PIXEL_PNG) },
      ],
    });
    const version = appended.newVersion;
    const docFolder = join(workspaceRoot, ".autumn", "docs__removable.pdf");

    await rm(join(docFolder, version.layout!.fileName));
    const withoutLayout = await readDocumentMetadata(
      workspaceRoot,
      "docs/removable.pdf",
    );
    assert.equal(withoutLayout.metadata?.versions[0]?.layout, null);
    assert.ok(withoutLayout.metadata?.versions[0]?.assets);

    await deleteExtractedVersion(workspaceRoot, "docs/removable.pdf", version.id);
    assert.equal(
      await readdir(docFolder).then(
        () => true,
        () => false,
      ),
      false,
    );

    const deleted = await readDocumentMetadata(
      workspaceRoot,
      "docs/removable.pdf",
    );
    assert.equal(deleted.metadata, null);
  });

  it("ignores tampered metadata paths instead of deleting workspace files", async () => {
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });
    const sentinelPath = join(workspaceRoot, "docs", "keep.txt");
    await writeFile(sentinelPath, "keep me");

    const appended = await appendExtractedVersion({
      workspaceRootPath: workspaceRoot,
      sourceRelPath: "docs/tamper.pdf",
      sourceSize: 10,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Tamper\n",
      durationMs: 10,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU",
        agentId: "pi",
        usedAgentRefinement: false,
      },
      layout: SAMPLE_LAYOUT,
      assets: [
        { path: "images/pixel.png", data: new Uint8Array(PIXEL_PNG) },
      ],
    });
    const version = appended.newVersion;
    const docFolder = join(workspaceRoot, ".autumn", "docs__tamper.pdf");
    const metadataPath = join(docFolder, "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));

    // A record whose Markdown path points at an unrelated workspace file is
    // skipped, so deleting the version cannot unlink that file.
    metadata.versions[0] = {
      ...metadata.versions[0],
      fileName: "keep.txt",
      relPath: "docs/keep.txt",
    };
    await writeFile(metadataPath, JSON.stringify(metadata));

    const hidden = await readDocumentMetadata(workspaceRoot, "docs/tamper.pdf");
    assert.equal(hidden.metadata, null);
    const untouched = await deleteExtractedVersion(
      workspaceRoot,
      "docs/tamper.pdf",
      version.id,
    );
    assert.equal(untouched.metadata, null);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep me");
    assert.ok((await stat(docFolder)).isDirectory());

    // Layout and asset refs are derived from the version id, so hostile refs
    // cannot redirect the read or turn `delete` into a recursive delete of
    // `.autumn` or the workspace.
    metadata.versions[0] = {
      ...metadata.versions[0],
      fileName: version.fileName,
      relPath: version.relPath,
      layout: {
        ...version.layout!,
        fileName: "keep.txt",
        relPath: "docs/keep.txt",
      },
      assets: { ...version.assets!, dirName: ".." },
    };
    await writeFile(metadataPath, JSON.stringify(metadata));

    const normalized = await readDocumentMetadata(
      workspaceRoot,
      "docs/tamper.pdf",
    );
    assert.equal(
      normalized.metadata?.versions[0]?.layout?.relPath,
      version.layout?.relPath,
    );
    assert.equal(
      normalized.metadata?.versions[0]?.assets?.dirName,
      version.assets?.dirName,
    );

    await deleteExtractedVersion(workspaceRoot, "docs/tamper.pdf", version.id);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep me");
    assert.ok((await stat(join(workspaceRoot, ".autumn"))).isDirectory());
    assert.equal(
      await readdir(docFolder).then(
        () => true,
        () => false,
      ),
      false,
    );
  });
});
