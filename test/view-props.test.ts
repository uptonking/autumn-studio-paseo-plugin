import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flattenTree,
  dataUriToObjectUrl,
  fileBlobCacheKey,
} from "../client/view-props.ts";
import {
  closeAllFileTabsInStore,
  closeFileTabInStore,
  getWorkspaceOpenedTabs,
  openFileTabInStore,
  setActiveFileTabInStore,
} from "../client/opened-tabs-store.ts";
import type { FileNode } from "../shared/contracts.ts";

describe("view-props: flattenTree", () => {
  it("returns empty array for undefined", () => {
    assert.deepEqual(flattenTree(undefined), []);
  });

  it("skips root folder '/' and flattens nested items", () => {
    const tree: FileNode = {
      kind: "folder",
      path: "/",
      name: "root",
      children: [
        {
          kind: "folder",
          path: "docs/",
          name: "docs",
          children: [
            {
              kind: "file",
              path: "docs/spec.pdf",
              name: "spec.pdf",
              size: 2048,
              mtime: 1700000000000,
              contentType: "application/pdf",
            },
          ],
        },
        {
          kind: "file",
          path: "README.md",
          name: "README.md",
          size: 512,
          mtime: 1700000000000,
          contentType: "text/markdown",
        },
      ],
    };

    const flat = flattenTree(tree);
    assert.equal(flat.length, 3);

    // First item: folder docs/
    assert.deepEqual(flat[0], {
      kind: "folder",
      path: "docs/",
      name: "docs",
    });

    // Second item: file docs/spec.pdf
    assert.deepEqual(flat[1], {
      kind: "file",
      path: "docs/spec.pdf",
      name: "spec.pdf",
      size: 2048,
      updatedAt: new Date(1700000000000).toISOString(),
      contentType: "application/pdf",
    });

    // Third item: file README.md
    assert.deepEqual(flat[2], {
      kind: "file",
      path: "README.md",
      name: "README.md",
      size: 512,
      updatedAt: new Date(1700000000000).toISOString(),
      contentType: "text/markdown",
    });
  });

  it("handles empty folder tree", () => {
    const tree: FileNode = {
      kind: "folder",
      path: "/",
      name: "empty",
      children: [],
    };
    assert.deepEqual(flattenTree(tree), []);
  });
});

describe("view-props: dataUriToObjectUrl", () => {
  it("converts data URI to blob object URL", async () => {
    // Provide minimal mock for fetch/URL in Node test environment if needed
    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    let createdUrl = "";
    globalThis.URL.createObjectURL = (blob: any) => {
      createdUrl = `blob:mock-uuid-${blob.size}`;
      return createdUrl;
    };

    try {
      const dataUri = "data:text/plain;base64,aGVsbG8="; // "hello"
      const url = await dataUriToObjectUrl(dataUri);
      assert.ok(url.startsWith("blob:mock-uuid-"));
    } finally {
      if (prevCreateObjectURL) {
        globalThis.URL.createObjectURL = prevCreateObjectURL;
      }
    }
  });
});

describe("opened-tabs-store & blob-url-cache & viewerKindForFile", () => {
  it("manages workspace tabs lifecycle including closeAllFileTabsInStore", () => {
    const wsId = "ws-test-tabs";
    closeAllFileTabsInStore(wsId);
    assert.deepEqual(getWorkspaceOpenedTabs(wsId), { tabs: [], activePath: null });

    openFileTabInStore(wsId, { path: "a.pdf", name: "a.pdf", contentType: "application/pdf" });
    openFileTabInStore(wsId, { path: "b.ts", name: "b.ts", contentType: "text/x-typescript" });
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 2);
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, "b.ts");

    setActiveFileTabInStore(wsId, "a.pdf");
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, "a.pdf");

    closeFileTabInStore(wsId, "a.pdf");
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 1);
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, "b.ts");

    closeAllFileTabsInStore(wsId);
    assert.deepEqual(getWorkspaceOpenedTabs(wsId), { tabs: [], activePath: null });
  });

  it("generates distinct cache keys when updatedAt or size changes", () => {
    const fileV1 = { path: "README.md", updatedAt: "2026-01-01T00:00:00Z", size: 5 };
    const fileV2 = { path: "README.md", updatedAt: "2026-01-02T00:00:00Z", size: 5 };
    const fileV3 = { path: "README.md", updatedAt: "2026-01-02T00:00:00Z", size: 6 };
    assert.notEqual(fileBlobCacheKey(fileV1), fileBlobCacheKey(fileV2));
    assert.notEqual(fileBlobCacheKey(fileV2), fileBlobCacheKey(fileV3));
  });
});
