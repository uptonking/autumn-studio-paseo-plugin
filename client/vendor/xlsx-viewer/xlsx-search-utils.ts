import type { XlsxCellAddress, XlsxSheetData, XlsxViewerController } from '@extend-ai/react-xlsx';

const XLSX_SEARCH_BATCH_ROW_COUNT = 500;
const XLSX_GRID_HEADER_HEIGHT = 24;
const XLSX_GRID_ROW_HEADER_WIDTH = 40;

export interface XlsxSearchResult {
  cell: XlsxCellAddress;
  displayValue: string;
  formula?: string;
  sheetIndex: number;
  sheetName: string;
  workbookSheetIndex: number;
}

interface XlsxBatchCell {
  col?: unknown;
  formula?: unknown;
  value?: unknown;
}

interface XlsxBatchRow {
  cells?: unknown;
  index?: unknown;
}

function normalizeSearchText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function cellValueToSearchText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return normalizeSearchText(value);
  }

  const record = value as {
    asBoolean?: () => boolean | null;
    asError?: () => string | null;
    asNumber?: () => number | null;
    asText?: () => string | null;
    is_boolean?: boolean;
    is_empty?: boolean;
    is_error?: boolean;
    is_number?: boolean;
    is_text?: boolean;
  };

  if (record.is_empty) return '';
  if (record.is_error) return record.asError?.() ?? '';
  if (record.is_text) return record.asText?.() ?? '';
  if (record.is_number) return normalizeSearchText(record.asNumber?.());
  if (record.is_boolean) return record.asBoolean?.() ? 'TRUE' : 'FALSE';

  return normalizeSearchText(value);
}

export function cellAddressToA1({ col, row }: XlsxCellAddress): string {
  let columnNumber = col + 1;
  let columnName = '';

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return `${columnName}${row + 1}`;
}

function getCellSearchText(
  controller: XlsxViewerController,
  sheet: XlsxSheetData,
  row: number,
  col: number,
) {
  const worksheet = controller.workbook?.getSheet(sheet.workbookSheetIndex);
  if (!worksheet) {
    return { displayValue: '', formula: '' };
  }

  const formula = worksheet.getFormulaAt(row, col) ?? '';
  const cachedFormulaValue = formula
    ? sheet.cachedFormulaValues[cellAddressToA1({ row, col })]
    : undefined;
  const formatted = worksheet.getFormattedValueAt(row, col);

  if (formatted && !(formula && cachedFormulaValue !== undefined && formatted.startsWith('#'))) {
    return { displayValue: formatted, formula };
  }

  const calculated = worksheet.getCalculatedValueAt(row, col);
  const displayValue =
    formula && cachedFormulaValue !== undefined && calculated.is_error
      ? cachedFormulaValue
      : cellValueToSearchText(calculated);

  return { displayValue, formula };
}

function getBatchRows(rows: unknown): XlsxBatchRow[] {
  return Array.isArray(rows) ? (rows as XlsxBatchRow[]) : [];
}

function getBatchCells(row: XlsxBatchRow): XlsxBatchCell[] {
  return Array.isArray(row.cells) ? (row.cells as XlsxBatchCell[]) : [];
}

function cellMatchesQuery(displayValue: string, formula: string, query: string): boolean {
  return displayValue.toLowerCase().includes(query) || formula.toLowerCase().includes(query);
}

export async function findXlsxSearchResults(
  controller: XlsxViewerController,
  rawQuery: string,
): Promise<XlsxSearchResult[]> {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return [];
  }

  const results: XlsxSearchResult[] = [];

  for (const [sheetIndex, sheet] of controller.sheets.entries()) {
    const startRow = Math.max(0, sheet.minUsedRow);
    const endRow = Math.max(startRow, sheet.maxUsedRow);
    const visibleCols = sheet.visibleCols.filter(
      (col) => col >= sheet.minUsedCol && col <= sheet.maxUsedCol,
    );
    const visibleRowSet = new Set(sheet.visibleRows);
    const visibleColSet = new Set(visibleCols);

    if (!visibleCols.length || sheet.maxUsedRow < sheet.minUsedRow) {
      continue;
    }

    const worksheet = controller.workbook?.getSheet(sheet.workbookSheetIndex);
    const worksheetWithBatch = worksheet as
      | {
          getRowsBatch?: (
            startRow: number,
            rowCount: number,
            options?: Record<string, unknown>,
          ) => unknown;
        }
      | undefined;

    for (
      let batchStartRow = startRow;
      batchStartRow <= endRow;
      batchStartRow += XLSX_SEARCH_BATCH_ROW_COUNT
    ) {
      const rowCount = Math.min(XLSX_SEARCH_BATCH_ROW_COUNT, endRow - batchStartRow + 1);
      const rows = controller.getRowsBatchAsync
        ? await controller.getRowsBatchAsync(sheet.workbookSheetIndex, batchStartRow, rowCount)
        : worksheetWithBatch?.getRowsBatch?.(batchStartRow, rowCount, {
            includeFormulas: true,
            useFormattedValues: true,
          });

      if (rows) {
        for (const rowEntry of getBatchRows(rows)) {
          const row = Number(rowEntry.index);
          if (!Number.isInteger(row) || !visibleRowSet.has(row)) {
            continue;
          }

          for (const cellEntry of getBatchCells(rowEntry)) {
            const col = Number(cellEntry.col);
            if (!Number.isInteger(col) || !visibleColSet.has(col)) {
              continue;
            }

            const displayValue = normalizeSearchText(cellEntry.value);
            const formula = normalizeSearchText(cellEntry.formula);
            if (!cellMatchesQuery(displayValue, formula, query)) {
              continue;
            }

            results.push({
              cell: { row, col },
              displayValue,
              formula,
              sheetIndex,
              sheetName: sheet.name,
              workbookSheetIndex: sheet.workbookSheetIndex,
            });
          }
        }
        continue;
      }

      if (!worksheet) {
        continue;
      }

      const batchEndRow = batchStartRow + rowCount - 1;
      for (const row of sheet.visibleRows) {
        if (row < batchStartRow || row > batchEndRow) {
          continue;
        }

        for (const col of visibleCols) {
          const { displayValue, formula } = getCellSearchText(controller, sheet, row, col);
          if (!cellMatchesQuery(displayValue, formula, query)) {
            continue;
          }

          results.push({
            cell: { row, col },
            displayValue,
            formula,
            sheetIndex,
            sheetName: sheet.name,
            workbookSheetIndex: sheet.workbookSheetIndex,
          });
        }
      }
    }
  }

  return results;
}

function sumAxisBefore(values: number[], endIndex: number, zoomFactor: number): number {
  let total = 0;
  for (let index = 0; index < endIndex; index += 1) {
    total += (values[index] ?? 0) * zoomFactor;
  }
  return total;
}

export function scrollXlsxCellIntoView({
  controller,
  result,
  viewport,
}: {
  controller: XlsxViewerController;
  result: XlsxSearchResult;
  viewport: HTMLDivElement | null;
}) {
  if (!viewport) return;

  const sheet = controller.sheets[result.sheetIndex];
  if (!sheet) return;

  const rowIndex = sheet.visibleRows.indexOf(result.cell.row);
  const colIndex = sheet.visibleCols.indexOf(result.cell.col);
  if (rowIndex < 0 || colIndex < 0) return;

  const zoomFactor = Math.max(0.1, controller.zoomScale / 100);
  const headerHeight = XLSX_GRID_HEADER_HEIGHT * zoomFactor;
  const rowHeaderWidth = XLSX_GRID_ROW_HEADER_WIDTH * zoomFactor;
  const rowStart = headerHeight + sumAxisBefore(sheet.rowHeights, rowIndex, zoomFactor);
  const colStart = rowHeaderWidth + sumAxisBefore(sheet.colWidths, colIndex, zoomFactor);
  const rowHeight = (sheet.rowHeights[rowIndex] ?? sheet.defaultRowHeightPx) * zoomFactor;
  const colWidth = (sheet.colWidths[colIndex] ?? sheet.defaultColWidthPx) * zoomFactor;
  const rowEnd = rowStart + rowHeight;
  const colEnd = colStart + colWidth;
  let nextTop = viewport.scrollTop;
  let nextLeft = viewport.scrollLeft;
  const visibleTop = viewport.scrollTop + headerHeight;
  const visibleLeft = viewport.scrollLeft + rowHeaderWidth;
  const visibleBottom = viewport.scrollTop + viewport.clientHeight;
  const visibleRight = viewport.scrollLeft + viewport.clientWidth;

  if (rowStart < visibleTop) {
    nextTop = rowStart - headerHeight;
  } else if (rowEnd > visibleBottom) {
    nextTop = rowEnd - viewport.clientHeight;
  }

  if (colStart < visibleLeft) {
    nextLeft = colStart - rowHeaderWidth;
  } else if (colEnd > visibleRight) {
    nextLeft = colEnd - viewport.clientWidth;
  }

  viewport.scrollTo?.({
    left: Math.max(0, nextLeft),
    top: Math.max(0, nextTop),
    behavior: 'auto',
  });
}
