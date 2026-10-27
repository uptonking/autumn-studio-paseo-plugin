/**
 * Builds a Begonia ProseMirror document from the plain-data block tree.
 *
 * Types are inferred from the begonia schema factory so this module never
 * imports prosemirror-model directly (the vendor bundler only maps the
 * @datalking/* packages). At runtime the schema comes from the mounted
 * editor's controller; tests construct one via createBegoniaSchema().
 *
 * Layout-derived blocks also yield the root document span of the node they
 * produced (SourceRange), which is what maps an editor caret back to a PDF
 * section; code blocks and images carry no layout metadata in the document
 * itself, so the span is the only anchor they can have.
 */

import type { createBegoniaSchema } from '@datalking/begonia-document-model';
import type { DocumentBlock, InlineRun, TextRun } from './document-input.ts';
import type { SourceRange } from './selection-source.ts';

export type BegoniaSchema = ReturnType<typeof createBegoniaSchema>;
export type BegoniaNode = ReturnType<BegoniaSchema['node']>;
export type BegoniaMark = ReturnType<BegoniaSchema['mark']>;

/**
 * A4 content width in CSS pixels (794px page minus default 88px margins).
 * Block images get an explicit width so extraction-resolution crops do not
 * overflow the paginated page.
 */
const BLOCK_IMAGE_WIDTH_PX = 600;

export interface BuildDocumentOptions {
  imageWidthPx?: number;
}

/** Version-relative asset path → data URL. */
export type DocumentAssetMap = ReadonlyMap<string, string>;

function marksForTextRun(schema: BegoniaSchema, run: TextRun): BegoniaMark[] {
  const marks: BegoniaMark[] = [];
  if (run.bold && schema.marks.strong) marks.push(schema.marks.strong.create());
  if (run.italic && schema.marks.em) marks.push(schema.marks.em.create());
  if (run.strike && schema.marks.strike) marks.push(schema.marks.strike.create());
  if (run.code && schema.marks.code) marks.push(schema.marks.code.create());
  if (run.href && schema.marks.link) {
    marks.push(schema.marks.link.create({ href: run.href }));
  }
  return marks;
}

function inlineRunsToNodes(schema: BegoniaSchema, runs: readonly TextRun[]): BegoniaNode[] {
  const nodes: BegoniaNode[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    nodes.push(schema.text(run.text, marksForTextRun(schema, run)));
  }
  return nodes;
}

function imageRunToNodes(
  schema: BegoniaSchema,
  run: { kind: 'image'; alt: string; assetPath: string },
  assets: DocumentAssetMap,
): BegoniaNode[] {
  const src = assets.get(run.assetPath);
  if (!src) {
    return run.alt ? [schema.text(run.alt)] : [];
  }
  if (!schema.nodes.inline_image) {
    return run.alt ? [schema.text(run.alt)] : [];
  }
  return [
    schema.nodes.inline_image.create({
      src,
      alt: run.alt,
      name: run.assetPath,
      mime: mimeFromDataUrl(src),
    }),
  ];
}

function mimeFromDataUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+)/.exec(dataUrl);
  return match ? (match[1] ?? null) : null;
}

function paragraphFromRuns(
  schema: BegoniaSchema,
  runs: readonly InlineRun[],
  assets: DocumentAssetMap,
): BegoniaNode {
  const nodes: BegoniaNode[] = [];
  for (const run of runs) {
    if (run.kind === 'image') {
      nodes.push(...imageRunToNodes(schema, run, assets));
    } else if (run.text) {
      nodes.push(schema.text(run.text, marksForTextRun(schema, run)));
    }
  }
  return schema.nodes.paragraph.create(null, nodes);
}

function tableToNodes(
  schema: BegoniaSchema,
  block: Extract<DocumentBlock, { kind: 'table' }>,
): BegoniaNode {
  const rows = [block.headers, ...block.rows].filter((row) => row.length > 0);
  if (rows.length === 0) {
    return schema.nodes.paragraph.create();
  }
  const rowNodes = rows.map((row) =>
    schema.nodes.table_row.create(
      null,
      row.map((cell) =>
        schema.nodes.table_cell.create(null, [
          schema.nodes.paragraph.create(null, cell ? [schema.text(cell)] : []),
        ]),
      ),
    ),
  );
  return schema.nodes.table.create(null, rowNodes);
}

function listToNodes(
  schema: BegoniaSchema,
  block: Extract<DocumentBlock, { kind: 'list' }>,
): BegoniaNode {
  const listType = block.ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list;
  const items = block.items.map((runs) =>
    schema.nodes.list_item.create(null, [paragraphFromRuns(schema, runs, new Map())]),
  );
  return listType.create(null, items);
}

function blockToNode(
  schema: BegoniaSchema,
  block: DocumentBlock,
  assets: DocumentAssetMap,
  options: BuildDocumentOptions,
): BegoniaNode[] {
  switch (block.kind) {
    case 'heading':
      return [
        schema.nodes.heading.create({ level: block.level }, inlineRunsToNodes(schema, block.runs)),
      ];
    case 'paragraph':
      return [paragraphFromRuns(schema, block.runs, assets)];
    case 'code_block':
      return [schema.nodes.code_block.create(null, block.text ? [schema.text(block.text)] : [])];
    case 'blockquote':
      return [
        schema.nodes.blockquote.create(null, [paragraphFromRuns(schema, block.runs, assets)]),
      ];
    case 'list':
      return [listToNodes(schema, block)];
    case 'table':
      return [tableToNodes(schema, block)];
    case 'hr':
      return [schema.nodes.horizontal_rule.create()];
    case 'page_break':
      return schema.nodes.page_break ? [schema.nodes.page_break.create()] : [];
    case 'image': {
      const src = assets.get(block.assetPath);
      if (!src) {
        // A missing asset degrades to its alt text instead of a broken image.
        return [paragraphFromRuns(schema, [{ kind: 'text', text: block.alt }], assets)];
      }
      return [
        schema.nodes.image.create({
          src,
          alt: block.alt,
          name: block.assetPath,
          mime: mimeFromDataUrl(src),
          width: options.imageWidthPx ?? BLOCK_IMAGE_WIDTH_PX,
        }),
      ];
    }
  }
}

export interface BuiltDocument {
  doc: BegoniaNode;
  /** One span per layout-derived top-level node, in document order. */
  sourceRanges: SourceRange[];
}

export function buildDocument(
  schema: BegoniaSchema,
  blocks: readonly DocumentBlock[],
  assets: DocumentAssetMap = new Map(),
  options: BuildDocumentOptions = {},
): BuiltDocument {
  const children: BegoniaNode[] = [];
  const sourceRanges: SourceRange[] = [];
  let offset = 0;
  for (const block of blocks) {
    for (const node of blockToNode(schema, block, assets, options)) {
      if (block.sourceId) {
        sourceRanges.push({ from: offset, to: offset + node.nodeSize, sourceId: block.sourceId });
      }
      offset += node.nodeSize;
      children.push(node);
    }
  }
  // The `doc` node's content is `block+`: an empty source still needs one
  // block so the built document is structurally valid for the editor.
  if (children.length === 0) {
    children.push(schema.nodes.paragraph.create());
  }
  return { doc: schema.nodes.doc.create(null, children), sourceRanges };
}

/** Document-only convenience for callers that do not map carets (serialization). */
export function buildDocumentFromBlocks(
  schema: BegoniaSchema,
  blocks: readonly DocumentBlock[],
  assets: DocumentAssetMap = new Map(),
  options: BuildDocumentOptions = {},
): BegoniaNode {
  return buildDocument(schema, blocks, assets, options).doc;
}

/**
 * Page count of the paginated flow: top-level explicit page breaks split the
 * document, so the document always spans one more page than it has breaks.
 */
export function countDocumentPages(doc: BegoniaNode): number {
  let breaks = 0;
  doc.forEach((node) => {
    if (node.type.name === 'page_break') breaks += 1;
  });
  return breaks + 1;
}
