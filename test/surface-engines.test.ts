import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearWorkspaceBlobUrls,
  disposeAllBlobUrls,
  getOrCreateFileBlobUrl,
  getOrCreateXlsxWasmDataUri,
  hashFileBytes,
  isInAppSavedBlobUrl,
  replaceCachedFileBlobUrl,
  trackWorkspaceFileSave,
} from "../client/blob-url-cache.ts";
import {
  findTextSearchMatches,
  groupTextMatchesByLine,
} from "../client/viewers/text-search-utils.ts";
import { fileMatchesFilter } from "../client/vendor/file-system/filter-types.ts";
import { isMarkdownFileName, isTextViewableFile } from "../client/view-props.ts";
import { lazyWithPreload } from "../client/lazy-with-preload.ts";
import {
  EMPTY_PDF_EDIT_STATE,
  hasPdfEdits,
  preloadPdfLib,
  sanitizePdfAnnotationText,
} from "../client/vendor/pdf-viewer/pdf-save.ts";
import { clearPdfThumbnailCaches } from "../client/vendor/lib/pdf-thumbnail-utils.ts";
import { buildFileSystemIndex } from "../client/vendor/file-system/index-utils.ts";
import {
  buildFileTreeIconConfig,
  createFileTreeSortComparator,
  renderFileTreeRowDecoration,
} from "../client/vendor/file-system/tree-helpers.ts";
import {
  cellAddressToA1,
  findXlsxSearchResults,
} from "../client/vendor/xlsx-viewer/xlsx-search-utils.ts";
import {
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  getFormatBehaviorConfig,
  getXlsxSettings,
  toXlsxViewerZoom,
  withFormatBehaviorConfig,
  withXlsxSettings,
} from "../shared/contracts.ts";

describe("surface-engines: lazy boundaries, Excel search, tree helpers & sync", () => {
  it("keeps heavy vendor engines and server WASM behind dynamic import boundaries", async () => {
    const mod1 = await preloadPdfLib();
    const mod2 = await preloadPdfLib();
    assert.equal(mod1, mod2);
    assert.equal(typeof mod1.PDFDocument?.load, "function");

    const pluginRoot = path.resolve(import.meta.dirname, "..");
    const wasmLoaderSrc = readFileSync(
      path.join(pluginRoot, "client/vendor/xlsx-viewer/wasm-loader.ts"),
      "utf8",
    );
    const pdfSaveSrc = readFileSync(
      path.join(pluginRoot, "client/vendor/pdf-viewer/pdf-save.ts"),
      "utf8",
    );
    const serverSrc = readFileSync(
      path.join(pluginRoot, "index.server.ts"),
      "utf8",
    );

    assert.equal(
      /^import\s+.*from\s+["']@extend-ai\/react-xlsx["']/m.test(wasmLoaderSrc),
      false,
    );
    assert.equal(
      wasmLoaderSrc.includes('import("@extend-ai/react-xlsx")'),
      true,
    );
    assert.equal(
      /^import\s+.*from\s+["']pdf-lib["']/m.test(pdfSaveSrc),
      false,
    );
    assert.equal(pdfSaveSrc.includes('import("pdf-lib")'), true);
    assert.equal(
      /^import\s+.*from\s+["']\.\/server\/generated\//m.test(serverSrc),
      false,
    );
    assert.equal(
      serverSrc.includes('import("./server/generated/pdfium-wasm.js")'),
      true,
    );
    assert.equal(
      serverSrc.includes('import("./server/generated/xlsx-wasm.js")'),
      true,
    );

    let loadCalls = 0;
    let shouldFail = true;
    const LazyDummy = lazyWithPreload(async () => {
      loadCalls += 1;
      if (shouldFail) {
        throw new Error("transient load failure");
      }
      return { default: () => null };
    });

    await assert.rejects(() => LazyDummy.preload(), /transient load failure/);
    assert.equal(loadCalls, 1);

    shouldFail = false;
    await LazyDummy.preload();
    await LazyDummy.preload();
    assert.equal(loadCalls, 2);
  });

  it("supports Excel zoom presets (50%-200%), extensible format behavior helpers, and workbook search", async () => {
    assert.equal(toXlsxViewerZoom("50"), 50);
    assert.equal(toXlsxViewerZoom("75"), 75);
    assert.equal(toXlsxViewerZoom("100"), 100);
    assert.equal(toXlsxViewerZoom("125"), 125);
    assert.equal(toXlsxViewerZoom("150"), 150);
    assert.equal(toXlsxViewerZoom("200"), 200);

    const updatedXlsx = withXlsxSettings(DEFAULT_AUTUMN_STUDIO_SETTINGS, {
      defaultZoom: "200",
      defaultOpenBehavior: "editor",
      showHiddenSheets: true,
    });
    assert.equal(getXlsxSettings(updatedXlsx).defaultZoom, "200");
    assert.equal(getXlsxSettings(updatedXlsx).defaultOpenBehavior, "editor");
    assert.equal(getXlsxSettings(updatedXlsx).showHiddenSheets, true);

    const updatedImage = withFormatBehaviorConfig(updatedXlsx, "image", {
      defaultOpenBehavior: "editor",
      defaultViewer: "image-viewer",
      defaultEditor: "custom-image-editor",
    });
    assert.deepEqual(getFormatBehaviorConfig(updatedImage, "image"), {
      defaultOpenBehavior: "editor",
      defaultViewer: "image-viewer",
      defaultEditor: "custom-image-editor",
    });

    assert.equal(cellAddressToA1({ row: 0, col: 0 }), "A1");
    assert.equal(cellAddressToA1({ row: 9, col: 25 }), "Z10");
    assert.equal(cellAddressToA1({ row: 4, col: 26 }), "AA5");

    const fakeController: any = {
      sheets: [
        {
          name: "Revenue",
          workbookSheetIndex: 0,
          minUsedRow: 0,
          maxUsedRow: 2,
          minUsedCol: 0,
          maxUsedCol: 2,
          visibleRows: [0, 1, 2],
          visibleCols: [0, 1, 2],
          cachedFormulaValues: {},
        },
      ],
      getRowsBatchAsync: async () => [
        {
          index: 0,
          cells: [
            { col: 0, value: "Quarter", formula: "" },
            { col: 1, value: "Amount", formula: "" },
          ],
        },
        {
          index: 1,
          cells: [
            { col: 0, value: "Q4 Total", formula: "" },
            { col: 1, value: "12500", formula: "=SUM(B2:B5)" },
          ],
        },
      ],
    };

    const valueMatches = await findXlsxSearchResults(fakeController, "q4");
    assert.equal(valueMatches.length, 1);
    assert.deepEqual(valueMatches[0]?.cell, { row: 1, col: 0 });
    assert.equal(valueMatches[0]?.sheetName, "Revenue");

    const formulaMatches = await findXlsxSearchResults(fakeController, "sum(");
    assert.equal(formulaMatches.length, 1);
    assert.deepEqual(formulaMatches[0]?.cell, { row: 1, col: 1 });
  });

  it("serializes in-flight saves before disk reads and reuses unchanged blob URLs", async () => {
    assert.equal(isMarkdownFileName("README.md"), true);
    assert.equal(isMarkdownFileName("guide.mdx"), true);
    assert.equal(isMarkdownFileName("sheet.xlsx"), false);
    assert.equal(isTextViewableFile({ path: "src/app.tsx" }), true);
    assert.equal(isTextViewableFile({ path: ".gitignore" }), true);
    assert.equal(isTextViewableFile({ path: "archive.zip" }), false);
    assert.equal(
      sanitizePdfAnnotationText("Step 1 \u2192 “Done” 🚀", (ch) =>
        (ch.codePointAt(0) ?? 0) <= 0xff,
      ),
      'Step 1 -> "Done" ?',
    );
    assert.equal(hasPdfEdits(EMPTY_PDF_EDIT_STATE), false);
    assert.equal(
      hasPdfEdits({ ...EMPTY_PDF_EDIT_STATE, pageRotations: { 1: 360 } }),
      false,
    );
    assert.equal(
      hasPdfEdits({ ...EMPTY_PDF_EDIT_STATE, pageRotations: { 1: 90 } }),
      true,
    );
    assert.equal(
      hasPdfEdits({ ...EMPTY_PDF_EDIT_STATE, deletedPages: [2] }),
      true,
    );
    clearPdfThumbnailCaches();

    const fsIndex = buildFileSystemIndex([
      { kind: "file", path: "docs/a.md", size: 1200, previewImageUrl: "blob:thumb-a" },
      { kind: "file", path: "docs/b.md", size: 400 },
    ]);
    assert.equal(
      createFileTreeSortComparator("docs/", fsIndex, { key: "name", direction: "asc" }),
      "default",
    );
    const sizeComp = createFileTreeSortComparator("docs/", fsIndex, {
      key: "size",
      direction: "desc",
    });
    assert.equal(typeof sizeComp, "function");
    const iconCfg = buildFileTreeIconConfig("docs/", fsIndex, ["a.md", "b.md"]);
    assert.ok(iconCfg.byFileName["a.md"]);
    assert.deepEqual(
      renderFileTreeRowDecoration("docs/", fsIndex, { kind: "file", path: "a.md" })?.text,
      "1.2 KB",
    );
    assert.notEqual(
      hashFileBytes(new Uint8Array([1, 2, 3])),
      hashFileBytes(new Uint8Array([1, 2, 4])),
    );

    const prevCreate = globalThis.URL.createObjectURL;
    let seq = 0;
    globalThis.URL.createObjectURL = () => `blob:sync-${++seq}`;
    const wsId = "ws-sync-test";
    try {
      let diskBytes = new Uint8Array([10, 20, 30]);
      const savedUrl = replaceCachedFileBlobUrl(
        wsId,
        { path: "notes.md", size: 3, updatedAt: "2026-01-01T00:00:01.000Z" },
        diskBytes,
        "text/markdown",
      );
      assert.equal(isInAppSavedBlobUrl(savedUrl), true);

      const reusedUrl = await getOrCreateFileBlobUrl(
        wsId,
        { path: "notes.md", size: 3, updatedAt: "2026-01-01T00:00:01.000Z" },
        async () => ({
          dataUri: `data:text/markdown;base64,${Buffer.from(diskBytes).toString("base64")}`,
          size: diskBytes.byteLength,
          mtime: Date.parse("2026-01-01T00:00:01.000Z"),
        }),
        { forceRefresh: true, reuseIfUnchanged: true },
      );
      assert.equal(reusedUrl, savedUrl);

      let saveCompleted = false;
      const savePromise = trackWorkspaceFileSave(wsId, "notes.md", async () => {
        await new Promise((r) => setTimeout(r, 25));
        diskBytes = new Uint8Array([99, 100, 101, 102]);
        saveCompleted = true;
      });
      const readUrl = await getOrCreateFileBlobUrl(
        wsId,
        { path: "notes.md", size: 3, updatedAt: "2026-01-01T00:00:01.000Z" },
        async () => {
          assert.equal(saveCompleted, true);
          return {
            dataUri: `data:text/markdown;base64,${Buffer.from(diskBytes).toString("base64")}`,
            size: diskBytes.byteLength,
            mtime: Date.parse("2026-01-01T00:00:05.000Z"),
          };
        },
        { forceRefresh: true, reuseIfUnchanged: true },
      );
      await savePromise;
      assert.notEqual(readUrl, savedUrl);
      assert.equal(isInAppSavedBlobUrl(readUrl), false);
    } finally {
      clearWorkspaceBlobUrls(wsId);
      globalThis.URL.createObjectURL = prevCreate;
    }
  });

  it("computes CRLF-aware text search offsets and line groupings", () => {
    const sample = "Alpha beta\r\nbeta gamma BETA\nno match\nbeta";
    const matches = findTextSearchMatches(sample, "beta");
    assert.equal(matches.length, 4);
    assert.deepEqual(
      matches.map((m) => ({
        lineIndex: m.lineIndex,
        lineStartCol: m.lineStartCol,
        lineEndCol: m.lineEndCol,
        slice: sample.slice(m.startOffset, m.endOffset).toLowerCase(),
      })),
      [
        { lineIndex: 0, lineStartCol: 6, lineEndCol: 10, slice: "beta" },
        { lineIndex: 1, lineStartCol: 0, lineEndCol: 4, slice: "beta" },
        { lineIndex: 1, lineStartCol: 11, lineEndCol: 15, slice: "beta" },
        { lineIndex: 3, lineStartCol: 0, lineEndCol: 4, slice: "beta" },
      ],
    );
    const byLine = groupTextMatchesByLine(matches);
    assert.equal(byLine.get(0)?.length, 1);
    assert.equal(byLine.get(1)?.length, 2);
    assert.equal(byLine.get(2), undefined);
    assert.equal(byLine.get(3)?.length, 1);
  });

  it("memoizes Excel WASM data URI across session and recovers after transient RPC errors", async () => {
    disposeAllBlobUrls();
    let calls = 0;
    await assert.rejects(
      () =>
        getOrCreateXlsxWasmDataUri(async () => {
          calls += 1;
          throw new Error("transient wasm rpc error");
        }),
      /transient wasm rpc error/,
    );
    assert.equal(calls, 1);

    const uri1 = await getOrCreateXlsxWasmDataUri(async () => {
      calls += 1;
      return { dataUri: "data:application/wasm;base64,AA==" };
    });
    const uri2 = await getOrCreateXlsxWasmDataUri(async () => {
      calls += 1;
      return { dataUri: "data:application/wasm;base64,BB==" };
    });
    assert.equal(uri1, "data:application/wasm;base64,AA==");
    assert.equal(uri2, "data:application/wasm;base64,AA==");
    assert.equal(calls, 2);
    disposeAllBlobUrls();
  });

  it("falls back to updatedAt when filtering by dateCreated on mtime-only files", () => {
    const fileWithoutCreatedAt = {
      kind: "file" as const,
      key: "src/index.ts",
      parentPath: "src",
      path: "src/index.ts",
      name: "index.ts",
      updatedAt: new Date().toISOString(),
    };
    assert.equal(
      fileMatchesFilter(fileWithoutCreatedAt, {
        id: "f1",
        type: "dateCreated",
        operator: "after",
        value: ["1 day ago"],
      }),
      true,
    );
  });
});
