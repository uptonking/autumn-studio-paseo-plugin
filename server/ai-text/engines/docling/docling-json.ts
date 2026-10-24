import {
  aiTextLayoutBlockSchema,
  aiTextLayoutDocumentSchema,
  type AiTextLayoutBlock,
  type AiTextLayoutBlockType,
  type AiTextLayoutDocument,
} from "../../../../shared/ai-text/layout.ts";

interface JsonRecord {
  [key: string]: unknown;
}

interface RefRecord {
  $ref?: unknown;
}

export interface DoclingPictureRef {
  /** Version-relative asset path such as `images/image_000000.png`. */
  assetPath: string;
  /** URI exactly as written by Docling, relative to the output directory. */
  sourceUri: string;
  pageNumber: number;
}

export interface DoclingLayoutResult {
  layout: AiTextLayoutDocument;
  pictures: DoclingPictureRef[];
}

const LABEL_TO_TYPE: Record<string, AiTextLayoutBlockType> = {
  title: "doc_title",
  section_header: "paragraph_title",
  paragraph: "text",
  text: "text",
  caption: "text",
  list_item: "list",
  formula: "equation",
  code: "code",
  reference: "ref_text",
  footnote: "page_footnote",
  page_header: "header",
  page_footer: "footer",
  document_index: "index",
  table: "table",
  picture: "image",
  chart: "chart",
  checkbox_selected: "text",
  checkbox_unselected: "text",
  form: "text",
  key_value_region: "text",
  handwritten_text: "text",
  empty_value: "text",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function refOf(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const ref = value.$ref;
  return typeof ref === "string" ? ref : null;
}

function pageSize(
  pages: JsonRecord,
  pageNumber: number,
): { width: number; height: number } | null {
  const page = pages[String(pageNumber)] ?? pages[pageNumber];
  if (!isRecord(page)) return null;
  const size = page.size;
  if (!isRecord(size)) return null;
  const width = asFiniteNumber(size.width);
  const height = asFiniteNumber(size.height);
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { width, height };
}

function normalizeBbox(
  prov: unknown,
  pages: JsonRecord,
): { pageNumber: number; bbox: [number, number, number, number] } | null {
  if (!Array.isArray(prov)) return null;
  for (const entry of prov) {
    if (!isRecord(entry)) continue;
    const pageNumber = asFiniteNumber(entry.page_no);
    if (!pageNumber || pageNumber < 1) continue;
    const bbox = entry.bbox;
    if (!isRecord(bbox)) continue;
    const left = asFiniteNumber(bbox.l);
    const top = asFiniteNumber(bbox.t);
    const right = asFiniteNumber(bbox.r);
    const bottom = asFiniteNumber(bbox.b);
    if (left === null || top === null || right === null || bottom === null) {
      continue;
    }
    const size = pageSize(pages, pageNumber);
    if (!size) continue;
    const origin = asString(bbox.coord_origin).toUpperCase();
    let y0: number;
    let y1: number;
    if (origin === "BOTTOMLEFT") {
      y0 = 1 - Math.max(top, bottom) / size.height;
      y1 = 1 - Math.min(top, bottom) / size.height;
    } else {
      y0 = Math.min(top, bottom) / size.height;
      y1 = Math.max(top, bottom) / size.height;
    }
    const x0 = clampUnit(Math.min(left, right) / size.width);
    const x1 = clampUnit(Math.max(left, right) / size.width);
    const clampedY0 = clampUnit(y0);
    const clampedY1 = clampUnit(y1);
    if (x1 - x0 <= 0 || clampedY1 - clampedY0 <= 0) continue;
    return {
      pageNumber: Math.round(pageNumber),
      bbox: [x0, clampedY0, x1, clampedY1],
    };
  }
  return null;
}

function escapeMarkdownCell(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface TableCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  columnHeader: boolean;
}

function tableCells(data: unknown): TableCell[] {
  if (!isRecord(data)) return [];
  const raw = data.table_cells;
  if (!Array.isArray(raw)) return [];
  const cells: TableCell[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const row = asFiniteNumber(entry.start_row_offset_idx);
    const col = asFiniteNumber(entry.start_col_offset_idx);
    if (row === null || col === null) continue;
    const rowEnd = asFiniteNumber(entry.end_row_offset_idx);
    const colEnd = asFiniteNumber(entry.end_col_offset_idx);
    const rowSpan = Math.max(1, Math.round(asFiniteNumber(entry.row_span) ?? 1));
    const colSpan = Math.max(1, Math.round(asFiniteNumber(entry.col_span) ?? 1));
    cells.push({
      row: Math.max(0, Math.round(row)),
      col: Math.max(0, Math.round(col)),
      rowSpan: rowEnd !== null ? Math.max(1, Math.round(rowEnd - row)) : rowSpan,
      colSpan: colEnd !== null ? Math.max(1, Math.round(colEnd - col)) : colSpan,
      text: asString(entry.text),
      columnHeader: entry.column_header === true,
    });
  }
  return cells;
}

function buildTableMarkdown(cells: TableCell[]): string {
  if (cells.length === 0) return "";
  const rowCount =
    Math.max(...cells.map((cell) => cell.row + cell.rowSpan), 1);
  const colCount =
    Math.max(...cells.map((cell) => cell.col + cell.colSpan), 1);
  const grid: string[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => ""),
  );
  for (const cell of cells) {
    // Spanned cells stay in their start slot; the grid keeps Markdown valid.
    grid[cell.row]![cell.col] = escapeMarkdownCell(cell.text);
  }
  const headerRow = 0;
  const lines = [
    `| ${grid[headerRow]!.join(" | ")} |`,
    `| ${grid[headerRow]!.map(() => "---").join(" | ")} |`,
  ];
  for (let row = 1; row < rowCount; row += 1) {
    lines.push(`| ${grid[row]!.join(" | ")} |`);
  }
  return lines.join("\n");
}

function buildTableHtml(cells: TableCell[]): string {
  if (cells.length === 0) return "";
  const rowCount =
    Math.max(...cells.map((cell) => cell.row + cell.rowSpan), 1);
  const rows: string[] = [];
  let currentRow = -1;
  let currentCells: string[] = [];
  const ordered = [...cells].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );
  for (const cell of ordered) {
    if (cell.row !== currentRow) {
      if (currentRow >= 0) rows.push(`<tr>${currentCells.join("")}</tr>`);
      currentRow = cell.row;
      currentCells = [];
    }
    const tag = cell.columnHeader ? "th" : "td";
    const rowspan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
    const colspan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
    currentCells.push(
      `<${tag}${rowspan}${colspan}>${escapeHtml(cell.text)}</${tag}>`,
    );
  }
  if (currentRow >= 0) rows.push(`<tr>${currentCells.join("")}</tr>`);
  return `<table>${rows.join("")}</table>`;
}

function pictureAssetPath(uri: string): string {
  const leaf = uri.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  const safe = leaf
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return `images/${safe || "image.png"}`;
}

function getImageUri(item: JsonRecord): string {
  const image = item.image;
  if (!isRecord(image)) return "";
  return asString(image.uri);
}

export function doclingLabelToBlockType(label: string): AiTextLayoutBlockType {
  return LABEL_TO_TYPE[label] ?? "unknown";
}

/**
 * Converts a DoclingDocument JSON export into the shared layout shape while
 * preserving Docling's reading order. Items without page provenance are kept
 * out of the layout (the Markdown still contains them).
 */
export function normalizeDoclingDocument(
  raw: unknown,
  fileName: string,
): DoclingLayoutResult {
  const empty = aiTextLayoutDocumentSchema.parse({
    schemaVersion: 1,
    source: "docling",
    parserId: "docling",
    producedAt: new Date().toISOString(),
    pageCount: 0,
    blockCount: 0,
    blocks: [],
  });
  if (!isRecord(raw)) return { layout: empty, pictures: [] };

  const pages = isRecord(raw.pages) ? raw.pages : {};
  const items = new Map<string, JsonRecord>();
  for (const key of [
    "texts",
    "tables",
    "pictures",
    "groups",
    "key_value_items",
    "form_items",
  ]) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!isRecord(item)) continue;
      const selfRef = asString(item.self_ref);
      if (selfRef) items.set(selfRef, item);
    }
  }
  for (const key of ["body", "furniture"]) {
    const start = raw[key];
    if (isRecord(start)) {
      const selfRef = asString(start.self_ref);
      if (selfRef) items.set(selfRef, start);
    }
  }

  const visited = new Set<string>();
  const ordered: JsonRecord[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 64) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    const ref = refOf(value);
    if (ref) {
      if (visited.has(ref)) return;
      const target = items.get(ref);
      if (!target) return;
      // Do not mark the ref visited here: the target marks its own self_ref,
      // and marking it early would make the recursion skip the item itself.
      visit(target, depth + 1);
      return;
    }
    const selfRef = asString(value.self_ref);
    if (selfRef && visited.has(selfRef)) return;
    if (selfRef) visited.add(selfRef);
    const children = value.children;
    if (Array.isArray(children) && children.length > 0) {
      visit(children, depth + 1);
      return;
    }
    ordered.push(value);
  };

  visit(raw.body, 0);
  for (const key of [
    "texts",
    "tables",
    "pictures",
    "key_value_items",
    "form_items",
  ]) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isRecord(item)) visit(item, 0);
    }
  }
  // Furniture last: page headers and footers belong at the end of the reading
  // order even when the body is missing or has no children.
  visit(raw.furniture, 0);

  const blocks: AiTextLayoutBlock[] = [];
  const pictures: DoclingPictureRef[] = [];
  const usedAssetPaths = new Set<string>();
  let blockIndex = 0;

  for (const item of ordered) {
    const label = asString(item.label);
    if (label === "table" || label === "picture" || label === "chart") {
      const location = normalizeBbox(item.prov, pages);
      if (label === "picture" || label === "chart") {
        const uri = getImageUri(item);
        if (uri && location) {
          let assetPath = pictureAssetPath(uri);
          if (usedAssetPaths.has(assetPath)) {
            const dot = assetPath.lastIndexOf(".");
            assetPath = `${assetPath.slice(0, dot)}-${blockIndex}${assetPath.slice(dot)}`;
          }
          usedAssetPaths.add(assetPath);
          pictures.push({
            assetPath,
            sourceUri: uri,
            pageNumber: location.pageNumber,
          });
          blocks.push(
            aiTextLayoutBlockSchema.parse({
              id: `docling-${blockIndex++}`,
              pageNumber: location.pageNumber,
              type: label === "chart" ? "chart" : "image",
              bbox: location.bbox,
              text: "",
              imagePath: assetPath,
            }),
          );
        }
      } else if (location) {
        const cells = tableCells(item.data);
        blocks.push(
          aiTextLayoutBlockSchema.parse({
            id: `docling-${blockIndex++}`,
            pageNumber: location.pageNumber,
            type: "table",
            bbox: location.bbox,
            text: buildTableMarkdown(cells),
            ...(cells.length > 0 ? { html: buildTableHtml(cells) } : {}),
          }),
        );
      }
      continue;
    }

    const text = asString(item.text);
    if (!text.trim()) continue;
    const location = normalizeBbox(item.prov, pages);
    if (!location) continue;
    const type = doclingLabelToBlockType(label);
    const level =
      type === "paragraph_title" ? asFiniteNumber(item.level) : null;
    blocks.push(
      aiTextLayoutBlockSchema.parse({
        id: `docling-${blockIndex++}`,
        pageNumber: location.pageNumber,
        type,
        bbox: location.bbox,
        text,
        ...(level !== null
          ? { level: Math.min(6, Math.max(1, Math.round(level))) }
          : {}),
      }),
    );
  }

  const pageNumbers = Object.keys(pages)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value));
  const pageCount = pageNumbers.length
    ? Math.max(...pageNumbers)
    : blocks.reduce((max, block) => Math.max(max, block.pageNumber), 0);

  const layout = aiTextLayoutDocumentSchema.parse({
    schemaVersion: 1,
    source: "docling",
    parserId: "docling",
    producedAt: new Date().toISOString(),
    pageCount,
    blockCount: blocks.length,
    blocks,
  });
  void fileName;
  return { layout, pictures };
}
