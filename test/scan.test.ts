import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { scanWorkspaceTree, contentTypeFor } from "../server/scan.ts";
import type { FileNode } from "../shared/contracts.ts";

/** assert.ok cannot narrow a re-fetched union across test blocks; this can. */
function expectFolder(node: FileNode): Extract<FileNode, { kind: "folder" }> {
  if (node.kind !== "folder") throw new Error(`expected folder, got ${node.kind}`);
  return node;
}

describe("scan: contentTypeFor", () => {
  it("determines correct MIME types for common files", () => {
    assert.equal(contentTypeFor("doc.pdf"), "application/pdf");
    assert.equal(contentTypeFor("image.png"), "image/png");
    assert.equal(contentTypeFor("photo.jpg"), "image/jpeg");
    assert.equal(contentTypeFor("notes.md"), "text/markdown");
    assert.equal(contentTypeFor("data.json"), "application/json");
  });

  it("maps developer source and config files instead of MPEG-TS video", () => {
    assert.equal(contentTypeFor("src/index.ts"), "text/x-typescript");
    assert.equal(contentTypeFor("src/App.tsx"), "text/x-typescript");
    assert.equal(contentTypeFor("main.rs"), "text/x-rust");
    assert.equal(contentTypeFor("main.go"), "text/x-go");
    assert.equal(contentTypeFor("script.py"), "text/x-python");
    assert.equal(contentTypeFor("Cargo.toml"), "application/toml");
    assert.equal(contentTypeFor("config.yaml"), "text/yaml");
    assert.equal(contentTypeFor(".env"), "text/plain");
    assert.equal(contentTypeFor("Dockerfile"), "text/plain");
  });

  it("handles case-insensitive extensions", () => {
    assert.equal(contentTypeFor("DOCUMENT.PDF"), "application/pdf");
    assert.equal(contentTypeFor("PICTURE.PNG"), "image/png");
  });

  it("returns undefined for unknown extensions without a fallback", () => {
    assert.equal(contentTypeFor("unknown.nonexistentextensionxyz123"), undefined);
  });
});

describe("scan: scanWorkspaceTree", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "paseo-scan-test-"));

    // Standard structure
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await writeFile(join(tempDir, "docs", "guide.pdf"), "pdf-bytes");
    await writeFile(join(tempDir, "README.md"), "# Hello");
    await writeFile(join(tempDir, ".env"), "SECRET=1");

    // Ignored directories
    await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "pkg", "index.js"), "code");
    await mkdir(join(tempDir, ".git", "objects"), { recursive: true });
    await writeFile(join(tempDir, ".git", "HEAD"), "ref: refs/heads/main");
    await mkdir(join(tempDir, "coverage"), { recursive: true });
    await writeFile(join(tempDir, "coverage", "lcov.info"), "data");
    await mkdir(join(tempDir, ".hidden-dir"), { recursive: true });
    await writeFile(join(tempDir, ".hidden-dir", "data.txt"), "data");

    // Ignored files
    await writeFile(join(tempDir, ".DS_Store"), "ds-store");
    await writeFile(join(tempDir, "docs", "Thumbs.db"), "thumbs");

    // Symlinks
    await symlink(join(tempDir, "README.md"), join(tempDir, "docs", "readme-link.md"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("scans workspace directory into nested FileNode tree", async () => {
    const { tree, truncated } = await scanWorkspaceTree(tempDir);
    assert.equal(truncated, false);
    assert.equal(tree.kind, "folder");
    assert.equal(tree.path, "/");
    assert.equal(tree.name, basename(tempDir));

    const children = tree.children;
    // Folders come before files
    assert.equal(children[0].kind, "folder");
    assert.equal(children[0].name, "docs");
    assert.equal(children[0].path, "docs/");

    // Check files inside docs
    const docsFolder = children[0];
    if (docsFolder.kind === "folder") {
      assert.equal(docsFolder.children.length, 1);
      const pdfNode = docsFolder.children[0];
      assert.equal(pdfNode.kind, "file");
      assert.equal(pdfNode.name, "guide.pdf");
      assert.equal(pdfNode.path, "docs/guide.pdf");
      assert.equal(pdfNode.contentType, "application/pdf");
      assert.equal(typeof pdfNode.size, "number");
      assert.equal(typeof pdfNode.mtime, "number");
    }

    // Root should have .env and README.md (dotfiles kept, skipped files omitted)
    const rootFileNames = children.filter((c) => c.kind === "file").map((c) => c.name);
    assert.ok(rootFileNames.includes(".env"), ".env dotfile should be included");
    assert.ok(rootFileNames.includes("README.md"), "README.md should be included");
    assert.ok(!rootFileNames.includes(".DS_Store"), ".DS_Store should be skipped");
  });

  it("skips node_modules, .git, and hidden directories", async () => {
    const { tree } = await scanWorkspaceTree(tempDir);
    const childNames = expectFolder(tree).children.map((c) => c.name);
    assert.ok(!childNames.includes("node_modules"));
    assert.ok(!childNames.includes(".git"));
    assert.ok(!childNames.includes("coverage"));
    assert.ok(!childNames.includes(".hidden-dir"));
  });

  it("skips symlinks", async () => {
    const { tree } = await scanWorkspaceTree(tempDir);
    const docs = expectFolder(tree).children.find((c) => c.name === "docs");
    assert.ok(docs && docs.kind === "folder");
    const docChildren = docs.children.map((c) => c.name);
    assert.ok(!docChildren.includes("readme-link.md"), "symlink should be skipped");
  });

  it("truncates scan when maxFiles limit is reached", async () => {
    const { truncated } = await scanWorkspaceTree(tempDir, 1);
    assert.equal(truncated, true);
  });
});
