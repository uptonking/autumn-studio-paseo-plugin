export type PdfEditorTool = 'select' | 'text' | 'highlight' | 'rect' | 'ink';

export interface PdfTextAnnotation {
  id: string;
  kind: 'text';
  pageNumber: number;
  /** Normalized 0..1 coordinates from top-left of the page */
  xRatio: number;
  yRatio: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface PdfHighlightAnnotation {
  id: string;
  kind: 'highlight';
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  color: string;
}

export interface PdfRectAnnotation {
  id: string;
  kind: 'rect';
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  color: string;
  strokeWidth: number;
}

export interface PdfInkAnnotation {
  id: string;
  kind: 'ink';
  pageNumber: number;
  points: Array<{ xRatio: number; yRatio: number }>;
  color: string;
  strokeWidth: number;
}

export type PdfAnnotationItem =
  | PdfTextAnnotation
  | PdfHighlightAnnotation
  | PdfRectAnnotation
  | PdfInkAnnotation;

export interface PdfEditState {
  /** 1-based page number -> clockwise rotation delta in degrees (0, 90, 180, 270) */
  pageRotations: Record<number, number>;
  /** 1-based page numbers marked for deletion */
  deletedPages: number[];
  /** Page annotations added in the editor */
  annotations: PdfAnnotationItem[];
}

export const EMPTY_PDF_EDIT_STATE: PdfEditState = {
  pageRotations: {},
  deletedPages: [],
  annotations: [],
};

export function hasPdfEdits(state: PdfEditState): boolean {
  if (state.annotations.length > 0 || state.deletedPages.length > 0) {
    return true;
  }
  return Object.values(state.pageRotations).some((deg) => normalizeDegrees(deg) !== 0);
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, '').trim();
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
    const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
    const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return { r, g, b };
    }
  }
  return { r: 0.07, g: 0.09, b: 0.15 };
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

const UNICODE_ASCII_FALLBACKS: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u2194': '<->',
  '\u21D2': '=>',
  '\u2013': '-',
  '\u2014': '--',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u00A0': ' ',
};

export function sanitizePdfAnnotationText(
  text: string,
  canEncodeChar?: (char: string) => boolean,
): string {
  let normalized = '';
  for (const ch of text) {
    normalized += UNICODE_ASCII_FALLBACKS[ch] ?? ch;
  }
  let out = '';
  for (const ch of normalized) {
    if (ch === '\r' || ch === '\n' || ch === '\t') {
      out += ' ';
      continue;
    }
    if (canEncodeChar) {
      try {
        if (canEncodeChar(ch)) {
          out += ch;
        } else {
          out += '?';
        }
      } catch {
        out += '?';
      }
    } else {
      const code = ch.codePointAt(0) ?? 0;
      out += code >= 0x20 && code <= 0xff ? ch : '?';
    }
  }
  return out.trim();
}

let pdfLibPromise: Promise<typeof import('pdf-lib')> | null = null;

export function preloadPdfLib(): Promise<typeof import('pdf-lib')> {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib').catch((err) => {
      pdfLibPromise = null;
      throw err;
    });
  }
  return pdfLibPromise;
}

export async function serializeEditedPdfBytes(
  src: string,
  state: PdfEditState,
): Promise<Uint8Array> {
  const [{ degrees, PDFDocument, rgb, StandardFonts }, response] = await Promise.all([
    preloadPdfLib(),
    fetch(src),
  ]);
  if (!response.ok) {
    throw new Error(`Failed to read source PDF (${response.status})`);
  }
  const sourceBuffer = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();

  pages.forEach((page, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const { width, height } = page.getSize();

    // 1. Apply rotation delta if any
    const rotationDelta = state.pageRotations[pageNumber] ?? 0;
    if (rotationDelta !== 0) {
      const nextAngle = normalizeDegrees(page.getRotation().angle + rotationDelta);
      page.setRotation(degrees(nextAngle));
    }

    // 2. Render annotations for this page
    const pageAnnotations = state.annotations.filter((item) => item.pageNumber === pageNumber);

    for (const annotation of pageAnnotations) {
      const { r, g, b } = parseHexToRgb(annotation.color);
      const color = rgb(r, g, b);

      if (annotation.kind === 'highlight') {
        const rectWidth = Math.max(4, annotation.widthRatio * width);
        const rectHeight = Math.max(4, annotation.heightRatio * height);
        const x = annotation.xRatio * width;
        const y = height - annotation.yRatio * height - rectHeight;
        page.drawRectangle({
          x,
          y,
          width: rectWidth,
          height: rectHeight,
          color,
          opacity: 0.32,
        });
      } else if (annotation.kind === 'rect') {
        const rectWidth = Math.max(4, annotation.widthRatio * width);
        const rectHeight = Math.max(4, annotation.heightRatio * height);
        const x = annotation.xRatio * width;
        const y = height - annotation.yRatio * height - rectHeight;
        page.drawRectangle({
          x,
          y,
          width: rectWidth,
          height: rectHeight,
          color,
          opacity: 0.08,
          borderColor: color,
          borderWidth: annotation.strokeWidth || 2,
          borderOpacity: 0.9,
        });
      } else if (annotation.kind === 'text') {
        const safeText = sanitizePdfAnnotationText(annotation.text, (ch) => {
          helveticaFont.encodeText(ch);
          return true;
        });
        if (!safeText) {
          continue;
        }
        const fontSize = annotation.fontSize || 14;
        const x = annotation.xRatio * width;
        const y = Math.max(4, height - annotation.yRatio * height - fontSize);
        page.drawText(safeText, {
          x,
          y,
          size: fontSize,
          font: helveticaFont,
          color,
        });
      } else if (annotation.kind === 'ink') {
        if (annotation.points.length < 2) {
          continue;
        }
        for (let idx = 1; idx < annotation.points.length; idx += 1) {
          const prev = annotation.points[idx - 1];
          const curr = annotation.points[idx];
          page.drawLine({
            start: {
              x: prev.xRatio * width,
              y: height - prev.yRatio * height,
            },
            end: {
              x: curr.xRatio * width,
              y: height - curr.yRatio * height,
            },
            thickness: annotation.strokeWidth || 2,
            color,
            opacity: 0.9,
          });
        }
      }
    }
  });

  // 3. Remove deleted pages in descending index order (keep at least 1 page)
  const sortedDeleted = Array.from(new Set(state.deletedPages))
    .filter((pageNum) => pageNum >= 1 && pageNum <= pages.length)
    .sort((a, b) => b - a);

  for (const pageNumber of sortedDeleted) {
    if (pdfDoc.getPageCount() <= 1) {
      break;
    }
    pdfDoc.removePage(pageNumber - 1);
  }

  return await pdfDoc.save();
}
