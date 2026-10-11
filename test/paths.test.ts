import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { safeResolve, workspaceRoot } from "../server/paths.ts";

describe("paths: safeResolve", () => {
  let tempDir: string;
  let outsideDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "paseo-paths-test-"));
    await mkdir(join(tempDir, "sub"), { recursive: true });
    await writeFile(join(tempDir, "file.txt"), "hello");
    await writeFile(join(tempDir, "sub", "nested.txt"), "nested");

    // Outside directory with existing file for containment test
    outsideDir = await mkdtemp(join(tmpdir(), "paseo-outside-test-"));
    await writeFile(join(outsideDir, "secret.txt"), "secret");

    // Internal symlink
    await symlink(join(tempDir, "file.txt"), join(tempDir, "internal-symlink.txt"));
    // Escaping symlink
    await symlink(join(outsideDir, "secret.txt"), join(tempDir, "escape-symlink.txt"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it("resolves valid path inside root", async () => {
    const resolved = await safeResolve(tempDir, "file.txt");
    const expected = await realpath(join(tempDir, "file.txt"));
    assert.equal(resolved, expected);
  });

  it("resolves valid nested path inside root", async () => {
    const resolved = await safeResolve(tempDir, "sub/nested.txt");
    const expected = await realpath(join(tempDir, "sub", "nested.txt"));
    assert.equal(resolved, expected);
  });

  it("resolves internal symlink inside root", async () => {
    const resolved = await safeResolve(tempDir, "internal-symlink.txt");
    const expected = await realpath(join(tempDir, "file.txt"));
    assert.equal(resolved, expected);
  });

  it("rejects traversal to existing outside file", async () => {
    const relToSecret = join("..", basename(outsideDir), "secret.txt");
    await assert.rejects(
      () => safeResolve(tempDir, relToSecret),
      /Path escapes the workspace/
    );
  });

  it("rejects traversal through nested directory to existing outside file", async () => {
    const relToSecret = join("sub", "..", "..", basename(outsideDir), "secret.txt");
    await assert.rejects(
      () => safeResolve(tempDir, relToSecret),
      /Path escapes the workspace/
    );
  });

  it("rejects paths with null bytes", async () => {
    await assert.rejects(
      () => safeResolve(tempDir, "file\0.txt"),
      /Invalid path/
    );
  });

  it("rejects symlink pointing outside the workspace", async () => {
    await assert.rejects(
      () => safeResolve(tempDir, "escape-symlink.txt"),
      /Path escapes the workspace/
    );
  });
});

describe("paths: workspaceRoot", () => {
  it("resolves workspaceDirectory from mock Paseo client", async () => {
    const mockDir = await mkdtemp(join(tmpdir(), "paseo-ws-root-"));
    try {
      const mockPaseo = {
        workspaces: {
          list: async () => ({
            entries: [{ id: "ws-1", workspaceDirectory: mockDir }],
          }),
        },
      };
      const root = await workspaceRoot(mockPaseo, "ws-1");
      const expected = await realpath(mockDir);
      assert.equal(root, expected);
    } finally {
      await rm(mockDir, { recursive: true, force: true });
    }
  });

  it("falls back to projectRootPath", async () => {
    const mockDir = await mkdtemp(join(tmpdir(), "paseo-ws-proj-"));
    try {
      const mockPaseo = {
        workspaces: {
          list: async () => ({
            entries: [{ id: "ws-2", projectRootPath: mockDir }],
          }),
        },
      };
      const root = await workspaceRoot(mockPaseo, "ws-2");
      const expected = await realpath(mockDir);
      assert.equal(root, expected);
    } finally {
      await rm(mockDir, { recursive: true, force: true });
    }
  });

  it("throws on unknown workspace id", async () => {
    const mockPaseo = {
      workspaces: {
        list: async () => ({ entries: [] }),
      },
    };
    await assert.rejects(
      () => workspaceRoot(mockPaseo, "unknown"),
      /Unknown workspace: unknown/
    );
  });

  it("throws when workspace has no directory", async () => {
    const mockPaseo = {
      workspaces: {
        list: async () => ({ entries: [{ id: "ws-empty" }] }),
      },
    };
    await assert.rejects(
      () => workspaceRoot(mockPaseo, "ws-empty"),
      /Workspace ws-empty has no directory on disk/
    );
  });
});
