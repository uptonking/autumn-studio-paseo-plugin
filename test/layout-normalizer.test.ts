import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { layoutBlockToArea } from "../shared/ai-text-layout.ts";
import { normalizeMineruMiddleJson } from "../server/ai-text/layout-normalizer.ts";

const PRODUCED_AT = "2026-10-21T00:00:00.000Z";

function normalize(middleJson: unknown) {
  return normalizeMineruMiddleJson({
    middleJson,
    source: "mineru-kit",
    parserId: "mineru",
    producedAt: PRODUCED_AT,
  });
}

describe("layout-normalizer: MinerU 4 middle_json", () => {
  it("flattens pages into ordered blocks with clamped geometry and body metadata", () => {
    const layout = normalize({
      schema: "docvortex.middle",
      pages: [
        {
          page_idx: 0,
          blocks: [
            {
              type: "text",
              bbox: [0.1, 0.2, 0.9, 0.4],
              content: [
                { type: "text", content: "See " },
                {
                  type: "hyperlink",
                  content: [{ type: "text", content: "the docs" }],
                },
              ],
              confidence: 0.97,
            },
            {
              type: "doc_title",
              bbox: [0.1, 0.05, 0.9, 0.15],
              content: "Guide Title",
              level: 1,
            },
            {
              type: "list",
              bbox: [0.1, 0.45, 0.9, 0.6],
              content: [
                { type: "list_item", content: [{ type: "text", content: "One" }] },
                { type: "list_item", content: [{ type: "text", content: "Two" }] },
              ],
            },
            {
              type: "table",
              bbox: [0.1, 0.65, 0.9, 0.9],
              content: [
                {
                  type: "table_body",
                  content: "<table><tr><td>Firefox</td></tr></table>",
                  image_path: "images/table.jpg",
                },
                { type: "table_caption", content: "Browsers" },
              ],
            },
            {
              type: "image",
              bbox: [0.5, 0.5, 1.4, 1.6],
              content: [{ type: "image_body", image_path: "images/clamped.png" }],
            },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            {
              type: "image",
              bbox: [0.2, 0.2, 0.8, 0.7],
              content: [
                {
                  type: "image_body",
                  image_path: "images/picture.webp",
                  content: "",
                },
                { type: "image_caption", content: "Architecture" },
              ],
            },
            { type: "text", bbox: [1, 1, 1, 1], content: "zero area" },
            { type: "text", bbox: [0.1, 0.2] as unknown as number[], content: "bad bbox" },
          ],
        },
      ],
    });

    assert.ok(layout);
    assert.equal(layout.schemaVersion, 1);
    assert.equal(layout.source, "mineru-kit");
    assert.equal(layout.parserId, "mineru");
    assert.equal(layout.producedAt, PRODUCED_AT);
    assert.equal(layout.pageCount, 2);
    assert.equal(layout.blockCount, 6);

    const ids = layout.blocks.map((block) => block.id);
    assert.deepEqual(ids, ["p1-b1", "p1-b0", "p1-b2", "p1-b4", "p1-b3", "p2-b0"]);

    const title = layout.blocks[0]!;
    assert.equal(title.type, "doc_title");
    assert.equal(title.text, "Guide Title");
    assert.equal(title.level, 1);

    const text = layout.blocks[1]!;
    assert.equal(text.pageNumber, 1);
    assert.equal(text.type, "text");
    assert.equal(text.text, "See the docs");
    assert.equal(text.confidence, 0.97);

    const list = layout.blocks[2]!;
    assert.equal(list.type, "list");
    assert.equal(list.text, "One\nTwo");

    const table = layout.blocks[4]!;
    assert.equal(table.type, "table");
    assert.equal(table.html, "<table><tr><td>Firefox</td></tr></table>");
    assert.match(table.text, /Firefox/);
    assert.match(table.text, /Browsers/);
    assert.equal(table.imagePath, "images/table.jpg");

    const clamped = layout.blocks[3]!;
    assert.deepEqual(clamped.bbox, [0.5, 0.5, 1, 1]);
    assert.equal(clamped.imagePath, "images/clamped.png");

    const picture = layout.blocks[5]!;
    assert.equal(picture.pageNumber, 2);
    assert.equal(picture.imagePath, "images/picture.webp");
    assert.match(picture.text, /Architecture/);
  });

  it("assigns contiguous ids per page when blocks are skipped", () => {
    const layout = normalize({
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", bbox: [0.1, 0.1, 0.9, 0.2], content: "one" },
            { type: "text", bbox: [1, 1, 1, 1], content: "skipped" },
            { type: "text", bbox: [0.1, 0.3, 0.9, 0.4], content: "two" },
          ],
        },
        {
          // Repeated page_idx must not produce duplicate ids.
          page_idx: 0,
          blocks: [
            { type: "text", bbox: [0.1, 0.5, 0.9, 0.6], content: "three" },
          ],
        },
      ],
    });

    assert.ok(layout);
    assert.deepEqual(
      layout.blocks.map((block) => block.id),
      ["p1-b0", "p1-b1", "p1-b2"],
    );
  });

  it("counts parsed pages that had no extractable blocks", () => {
    const layout = normalize({
      pages: [
        {
          page_idx: 0,
          blocks: [{ type: "text", bbox: [0.1, 0.1, 0.9, 0.2], content: "one" }],
        },
        { page_idx: 1, blocks: [] },
        {
          page_idx: 2,
          blocks: [{ type: "text", bbox: [0.1, 0.1, 0.9, 0.2], content: "three" }],
        },
      ],
    });

    assert.ok(layout);
    assert.equal(layout.blockCount, 2);
    assert.equal(layout.pageCount, 3);
  });

  it("returns null for unusable middle_json payloads", () => {
    assert.equal(normalize(null), null);
    assert.equal(normalize({ pages: "nope" }), null);
    assert.equal(normalize({ pages: [{ page_idx: 0, blocks: [] }] }), null);
    assert.equal(
      normalize({
        pages: [
          {
            page_idx: 0,
            blocks: [{ type: "text", bbox: [0.2, 0.2, 0.1, 0.3], content: "x" }],
          },
        ],
      }),
      null,
    );
  });

  it("drops unsafe image paths and unknown block types", () => {
    const layout = normalize({
      pages: [
        {
          page_idx: 0,
          blocks: [
            {
              type: "image",
              bbox: [0.1, 0.1, 0.5, 0.5],
              content: [{ type: "image_body", image_path: "../secret.png" }],
            },
            {
              type: "mystery",
              bbox: [0.1, 0.6, 0.5, 0.9],
              content: "Unknown but valid",
            },
          ],
        },
      ],
    });

    assert.ok(layout);
    assert.equal(layout.blocks[0]!.type, "image");
    assert.equal(layout.blocks[0]!.imagePath, undefined);
    assert.equal(layout.blocks[1]!.type, "unknown");
    assert.equal(layout.blocks[1]!.text, "Unknown but valid");
  });

  it("converts normalized bboxes into percentage areas for PDF overlays", () => {
    const area = layoutBlockToArea({
      id: "p1-b0",
      pageNumber: 1,
      type: "text",
      bbox: [0.1, 0.2, 0.6, 0.55],
      text: "x",
    });
    assert.equal(area.top, 20);
    assert.equal(area.left, 10);
    assert.equal(area.width, 50);
    assert.ok(Math.abs(area.height - 35) < 1e-9);
  });
});
