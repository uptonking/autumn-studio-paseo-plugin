import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_TEXT_BUILTIN_VIEWERS,
  AI_TEXT_VIEWER_EDIT,
  AI_TEXT_VIEWER_LAYOUT_BLOCKS,
  AI_TEXT_VIEWER_RAW,
  AI_TEXT_VIEWER_TEXT,
  DEFAULT_AI_TEXT_VIEWER_ID,
  aiTextViewerDescriptorSchema,
  getBuiltinAiTextViewer,
  parseAiTextViewerDescriptor,
} from "../shared/ai-text/viewers.ts";

describe("ai-text viewers: built-in catalog", () => {
  it("has unique ids and stable ordering", () => {
    const ids = AI_TEXT_BUILTIN_VIEWERS.map((viewer) => viewer.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, [
      AI_TEXT_VIEWER_TEXT,
      AI_TEXT_VIEWER_LAYOUT_BLOCKS,
      AI_TEXT_VIEWER_RAW,
      AI_TEXT_VIEWER_EDIT,
    ]);
    assert.equal(DEFAULT_AI_TEXT_VIEWER_ID, AI_TEXT_VIEWER_TEXT);
  });

  it("allows Text and Layout Blocks as the default viewer", () => {
    const defaultable = AI_TEXT_BUILTIN_VIEWERS.filter(
      (viewer) => viewer.selectableAsDefault,
    ).map((viewer) => viewer.id);
    assert.deepEqual(defaultable, [
      AI_TEXT_VIEWER_TEXT,
      AI_TEXT_VIEWER_LAYOUT_BLOCKS,
    ]);
  });

  it("requires layout only for the Blocks viewer", () => {
    for (const viewer of AI_TEXT_BUILTIN_VIEWERS) {
      assert.equal(
        viewer.capabilities.requiresLayout,
        viewer.id === AI_TEXT_VIEWER_LAYOUT_BLOCKS,
      );
    }
    assert.equal(
      getBuiltinAiTextViewer(AI_TEXT_VIEWER_LAYOUT_BLOCKS)?.capabilities
        .requiresLayout,
      true,
    );
  });

  it("marks the editor as editable and save-driven", () => {
    const edit = getBuiltinAiTextViewer(AI_TEXT_VIEWER_EDIT);
    assert.equal(edit?.capabilities.editable, true);
    assert.equal(edit?.capabilities.usesSaveAction, true);
    assert.equal(getBuiltinAiTextViewer(AI_TEXT_VIEWER_EDIT)?.selectableAsDefault, false);
  });

  it("parses descriptors with capability defaults filled in", () => {
    const descriptor = aiTextViewerDescriptorSchema.parse({
      id: "custom",
      label: "Custom",
      capabilities: {},
    });
    assert.equal(descriptor.order, 0);
    assert.equal(descriptor.selectableAsDefault, false);
    assert.equal(descriptor.capabilities.requiresContent, true);
    assert.equal(descriptor.capabilities.requiresLayout, false);
    assert.equal(descriptor.capabilities.editable, false);
    assert.equal(descriptor.capabilities.usesSaveAction, false);
  });
});

describe("ai-text viewers: registration descriptors", () => {
  it("normalizes custom descriptors so settings can rely on every field", () => {
    const descriptor = parseAiTextViewerDescriptor({
      id: "markdown-editor",
      label: "Editor",
    });
    assert.equal(descriptor.order, 0);
    assert.equal(descriptor.selectableAsDefault, false);
    assert.equal(descriptor.description, "");
    assert.equal(descriptor.capabilities.requiresContent, true);
  });

  it("rejects descriptors without an id", () => {
    assert.throws(
      () => parseAiTextViewerDescriptor({ label: "Broken" }),
      /Invalid AI Text viewer descriptor/,
    );
  });

  it("returns null when a built-in viewer does not exist", () => {
    assert.equal(getBuiltinAiTextViewer("markdown-editor"), null);
  });
});
