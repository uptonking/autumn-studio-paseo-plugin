import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fileNodeSchema,
  getFileTree,
  getFileContent,
  getPdfWasm,
  fileExplorerSettings,
  fileExplorerSettingsSchema,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_TEXT_VIEWER_SETTINGS,
  getTextViewerSettings,
  withTextViewerSettings,
  toPdfViewerZoom,
} from "../shared/contracts.ts";

describe("contracts: fileNodeSchema", () => {
  it("parses valid folder node with nested children", () => {
    const raw = {
      kind: "folder",
      path: "/",
      name: "root",
      children: [
        {
          kind: "folder",
          path: "src/",
          name: "src",
          children: [
            {
              kind: "file",
              path: "src/index.ts",
              name: "index.ts",
              size: 1024,
              mtime: 1700000000000,
              contentType: "text/typescript",
            },
          ],
        },
      ],
    };
    const parsed = fileNodeSchema.parse(raw);
    assert.deepEqual(parsed, raw);
  });

  it("parses file node without optional contentType", () => {
    const raw = {
      kind: "file",
      path: "notes.txt",
      name: "notes.txt",
      size: 42,
      mtime: 1700000000000,
    };
    const parsed = fileNodeSchema.parse(raw);
    assert.deepEqual(parsed, raw);
  });

  it("rejects node with invalid kind", () => {
    const raw = {
      kind: "symlink",
      path: "link",
      name: "link",
    };
    assert.throws(() => fileNodeSchema.parse(raw));
  });

  it("rejects file node with missing size or mtime", () => {
    assert.throws(() =>
      fileNodeSchema.parse({
        kind: "file",
        path: "test.txt",
        name: "test.txt",
      })
    );
  });
});

describe("contracts: getFileTree RPC", () => {
  it("validates input workspaceId", () => {
    assert.equal(getFileTree.input.parse({ workspaceId: "ws-test" }).workspaceId, "ws-test");
    assert.throws(() => getFileTree.input.parse({}));
    assert.throws(() => getFileTree.input.parse({ workspaceId: 123 }));
  });

  it("validates output structure with tree and truncated flag", () => {
    const validOutput = {
      tree: { kind: "folder", path: "/", name: "ws", children: [] },
      truncated: false,
    };
    const parsed = getFileTree.output.parse(validOutput);
    assert.equal(parsed.truncated, false);
    assert.equal(parsed.tree.kind, "folder");

    assert.throws(() => getFileTree.output.parse({ tree: validOutput.tree }));
  });
});

describe("contracts: getFileContent RPC", () => {
  it("validates input workspaceId and relPath", () => {
    const input = { workspaceId: "ws-1", relPath: "docs/spec.pdf" };
    assert.deepEqual(getFileContent.input.parse(input), input);
    assert.throws(() => getFileContent.input.parse({ workspaceId: "ws-1" }));
  });

  it("validates output dataUri", () => {
    const output = { dataUri: "data:application/pdf;base64,JVBERi0xLjQK" };
    assert.deepEqual(getFileContent.output.parse(output), output);
    assert.throws(() => getFileContent.output.parse({}));
  });
});

describe("contracts: getPdfWasm RPC", () => {
  it("accepts empty object input", () => {
    assert.deepEqual(getPdfWasm.input.parse({}), {});
  });

  it("validates output dataUri", () => {
    const output = { dataUri: "data:application/wasm;base64,AGFzbQEAAAA=" };
    assert.deepEqual(getPdfWasm.output.parse(output), output);
    assert.throws(() => getPdfWasm.output.parse({}));
  });
});

describe("contracts: fileExplorerSettings", () => {
  it("parses empty object into default settings", () => {
    const parsed = fileExplorerSettingsSchema.parse({});
    assert.deepEqual(parsed, DEFAULT_FILE_EXPLORER_SETTINGS);
    assert.equal(parsed.general.enabled, true);
    assert.equal(parsed.general.fileOpenMode, "in-place");
    assert.equal(parsed.general.defaultViewMode, "list");
    assert.equal(parsed.pdf.showThumbnailsByDefault, false);
    assert.equal(parsed.pdf.defaultZoom, "fit-width");
    assert.equal(parsed.pdf.showRotateControls, true);
    assert.equal(parsed.pdf.showDownloadButton, true);
  });

  it("validates custom general and pdf settings and format extensions", () => {
    const custom = {
      general: {
        enabled: false,
        fileOpenMode: "new-tab",
        defaultViewMode: "gallery",
      },
      pdf: {
        showThumbnailsByDefault: true,
        defaultZoom: "125",
        showRotateControls: false,
        showDownloadButton: false,
      },
      formats: {
        markdown: { previewByDefault: true },
      },
    };
    const parsed = fileExplorerSettingsSchema.parse(custom);
    assert.deepEqual(parsed, custom);
    assert.equal(fileExplorerSettings.id, "preferences");
    assert.equal(fileExplorerSettings.scope, "host");
    assert.equal(fileExplorerSettings.version, 1);
  });

  it("maps PdfDefaultZoom values to PDFViewerZoomLevel", () => {
    assert.equal(toPdfViewerZoom("fit-width"), "fit-width");
    assert.equal(toPdfViewerZoom("fit-page"), "fit-page");
    assert.equal(toPdfViewerZoom("100"), 1);
    assert.equal(toPdfViewerZoom("125"), 1.25);
    assert.equal(toPdfViewerZoom("150"), 1.5);
  });

  it("reads and updates extensible Code & Text viewer settings under formats.text", () => {
    const defaults = fileExplorerSettingsSchema.parse({});
    assert.deepEqual(getTextViewerSettings(defaults), DEFAULT_TEXT_VIEWER_SETTINGS);

    const updated = withTextViewerSettings(defaults, {
      showLineNumbers: false,
      wordWrap: false,
    });
    assert.deepEqual(getTextViewerSettings(updated), {
      showLineNumbers: false,
      wordWrap: false,
    });
  });
});

