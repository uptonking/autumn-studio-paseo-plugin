import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT_FAMILIES,
  TEXT_VIEWABLE_BASENAMES,
  TEXT_VIEWABLE_EXTENSIONS,
} from "../client/viewers/format-families.ts";
import { viewerKindForFile } from "../client/vendor/file-system/types.ts";

function fileNamed(name: string) {
  return { kind: "file" as const, path: `dir/${name}`, name };
}

describe("format-families: registration shape", () => {
  it("has one family per viewer kind with unique ids", () => {
    const ids = FORMAT_FAMILIES.map((family) => family.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.match(id, /^[a-z][a-z0-9-]*$/);
    }
    const kinds = FORMAT_FAMILIES.map((family) => family.kind);
    assert.equal(new Set(kinds).size, kinds.length);
  });

  it("claims at least one selector per family with normalized extensions", () => {
    for (const family of FORMAT_FAMILIES) {
      assert.ok(
        family.extensions.length > 0 || (family.filenames?.length ?? 0) > 0,
        `family ${family.id} claims nothing`,
      );
      for (const extension of family.extensions) {
        assert.ok(!extension.startsWith("."), extension);
        assert.equal(extension, extension.toLowerCase(), extension);
      }
    }
  });

  it("keeps extension claims disjoint across families", () => {
    const seen = new Map<string, string>();
    for (const family of FORMAT_FAMILIES) {
      for (const extension of family.extensions) {
        const owner = seen.get(extension);
        assert.equal(
          owner,
          undefined,
          `extension ${extension} claimed by ${owner} and ${family.id}`,
        );
        seen.set(extension, family.id);
      }
    }
  });
});

describe("format-families: parity with viewerKindForFile", () => {
  it("every claimed extension renders as the family's viewer kind", () => {
    for (const family of FORMAT_FAMILIES) {
      for (const extension of family.extensions) {
        assert.equal(
          viewerKindForFile(fileNamed(`sample.${extension}`)),
          family.kind,
          `extension ${extension} must render as ${family.kind}`,
        );
      }
    }
  });

  it("every claimed filename renders as the family's viewer kind", () => {
    const textFamily = FORMAT_FAMILIES.find(
      (family) => family.id === "text",
    );
    assert.ok(textFamily?.filenames);
    for (const filename of textFamily.filenames) {
      assert.equal(
        viewerKindForFile(fileNamed(filename)),
        "text",
        `filename ${filename} must render as text`,
      );
    }
  });

  it("text lists keep the detection sets' members claimable", () => {
    for (const basename of TEXT_VIEWABLE_BASENAMES) {
      assert.equal(viewerKindForFile(fileNamed(basename)), "text", basename);
    }
    for (const extension of TEXT_VIEWABLE_EXTENSIONS) {
      assert.equal(
        viewerKindForFile(fileNamed(`sample.${extension}`)),
        "text",
        extension,
      );
    }
  });
});
