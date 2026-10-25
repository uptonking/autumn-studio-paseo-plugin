import type * as React from 'react';
import type { PdfDocumentObject, Rotation } from '@embedpdf/models';
import {
  ScrollStrategy,
  type PageLayout,
  type ScrollerLayout,
  type VirtualItem,
} from '@embedpdf/plugin-scroll/react';
import type { ThumbMeta } from '@embedpdf/plugin-thumbnail/react';

export type PageRotationDeltas = Map<number, Rotation>;
export type ThumbnailSelectionMode = 'replace' | 'toggle' | 'range';

export function getPageIndexRange(from: number, to: number): Set<number> {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const range = new Set<number>();

  for (let pageIndex = start; pageIndex <= end; pageIndex += 1) {
    range.add(pageIndex);
  }

  return range;
}

export function arePageIndexSetsEqual(left: Set<number>, right: Set<number>) {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}

export function normalizeRotation(rotation: number): Rotation {
  return (((rotation % 4) + 4) % 4) as Rotation;
}

export function rotationToDegrees(rotation: Rotation) {
  return (rotation as number) * 90;
}

export function normalizeDegrees(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function ensurePdfExtension(fileName: string) {
  return fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
}

export function getPdfDownloadFileName(fileName: string | undefined, src: string) {
  if (fileName?.trim()) return ensurePdfExtension(fileName.trim());

  const pathname = src.split(/[?#]/)[0] ?? '';
  const rawName = pathname.split('/').pop() || 'document.pdf';

  try {
    return ensurePdfExtension(decodeURIComponent(rawName));
  } catch {
    return ensurePdfExtension(rawName);
  }
}

function getRotatedPdfDownloadFileName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '-rotated.pdf');
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadPdfWithPageRotations({
  fileName,
  pageRotationDeltas,
  src,
}: {
  fileName: string;
  pageRotationDeltas: PageRotationDeltas;
  src: string;
}) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status})`);
  }

  if (pageRotationDeltas.size === 0) {
    downloadBlob(await response.blob(), fileName);
    return;
  }

  const [{ PDFDocument, degrees }, pdfBytes] = await Promise.all([
    import('pdf-lib'),
    response.arrayBuffer(),
  ]);
  const pdfDocument = await PDFDocument.load(pdfBytes);

  pdfDocument.getPages().forEach((page, pageIndex) => {
    const rotationDelta = pageRotationDeltas.get(pageIndex);

    if (!rotationDelta) return;

    page.setRotation(
      degrees(normalizeDegrees(page.getRotation().angle + rotationToDegrees(rotationDelta))),
    );
  });

  const nextPdfBytes = await pdfDocument.save();
  const nextPdfBuffer = new ArrayBuffer(nextPdfBytes.byteLength);
  new Uint8Array(nextPdfBuffer).set(nextPdfBytes);

  downloadBlob(
    new Blob([nextPdfBuffer], { type: 'application/pdf' }),
    getRotatedPdfDownloadFileName(fileName),
  );
}

export function getThumbnailMetaForPage({
  page,
  pageIndex,
  rotation,
  width,
  imagePadding,
  labelHeight,
  top,
}: {
  page: PdfDocumentObject['pages'][number];
  pageIndex: number;
  rotation: Rotation;
  width: number;
  imagePadding: number;
  labelHeight: number;
  top: number;
}): ThumbMeta {
  const innerWidth = Math.max(1, width - imagePadding * 2);
  const pageWidth = rotation % 2 === 1 ? page.size.height : page.size.width;
  const pageHeight = rotation % 2 === 1 ? page.size.width : page.size.height;
  const imageHeight = Math.round(innerWidth * (pageHeight / pageWidth));
  const wrapperHeight = imagePadding + imageHeight + imagePadding + labelHeight;

  return {
    pageIndex,
    width: innerWidth,
    height: imageHeight,
    wrapperHeight,
    top,
    labelHeight,
    padding: imagePadding,
  };
}

export function buildThumbnailLayout({
  basePageRotations,
  pageRotationDeltas,
  pdfDocument,
  width,
  gap,
  imagePadding,
  labelHeight,
  paddingY,
}: {
  basePageRotations: Rotation[];
  pageRotationDeltas: PageRotationDeltas;
  pdfDocument: PdfDocumentObject | null;
  width: number;
  gap: number;
  imagePadding: number;
  labelHeight: number;
  paddingY: number;
}) {
  if (!pdfDocument) return null;

  let top = paddingY;
  const items = pdfDocument.pages.map((page, pageIndex) => {
    const basePageRotation = basePageRotations[pageIndex] ?? normalizeRotation(page.rotation);
    const pageRotation = normalizeRotation(
      basePageRotation + (pageRotationDeltas.get(pageIndex) ?? 0),
    );
    const meta = getThumbnailMetaForPage({
      page,
      pageIndex,
      rotation: pageRotation,
      width,
      imagePadding,
      labelHeight,
      top,
    });

    top += meta.wrapperHeight + gap;
    return meta;
  });

  return {
    items,
    totalHeight: items.length ? top - gap + paddingY : paddingY * 2,
  };
}

export function getVisibleThumbnailItems({
  buffer,
  clientHeight,
  items,
  scrollTop,
}: {
  buffer: number;
  clientHeight: number;
  items: ThumbMeta[];
  scrollTop: number;
}) {
  if (items.length === 0) return [];
  if (clientHeight <= 0) return items.slice(0, Math.min(items.length, buffer * 2));

  const viewportBottom = scrollTop + clientHeight;
  let start = items.findIndex((item) => item.top + item.wrapperHeight >= scrollTop);

  if (start === -1) start = items.length - 1;

  let end = start;
  while (end < items.length && items[end].top <= viewportBottom) {
    end += 1;
  }

  return items.slice(Math.max(0, start - buffer), Math.min(items.length, end + buffer));
}

export function setPdfViewerRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;

  if (typeof ref === 'function') {
    ref(value);
  } else {
    ref.current = value;
  }
}

export function isQuarterTurn(rotation: Rotation) {
  return rotation % 2 === 1;
}

export function getRotatedDimensions({
  height,
  rotation,
  width,
}: {
  height: number;
  rotation: Rotation;
  width: number;
}) {
  return isQuarterTurn(rotation) ? { height: width, width: height } : { height, width };
}

export function getRotatedPageDimensions(page: PageLayout, rotation: Rotation) {
  return getRotatedDimensions({
    height: page.height,
    rotation,
    width: page.width,
  });
}

export function applyPageRotationDeltasToScrollerLayout({
  basePageRotations,
  layout,
  pageRotationDeltas,
}: {
  basePageRotations: Rotation[];
  layout: ScrollerLayout;
  pageRotationDeltas: PageRotationDeltas;
}): ScrollerLayout {
  if (pageRotationDeltas.size === 0) return layout;

  let maxWidth = 0;
  let maxHeight = 0;
  let offset = 0;
  const pageGap = layout.pageGap;
  let startSpacingAdjustment = 0;
  const items: VirtualItem[] = layout.items.map((item, itemIndex) => {
    let pageOffset = 0;
    let itemWidth = 0;
    let itemHeight = 0;
    const pageLayouts = item.pageLayouts.map((page) => {
      const basePageRotation = basePageRotations[page.pageIndex] ?? normalizeRotation(0);
      const pageRotation = normalizeRotation(
        basePageRotation + (pageRotationDeltas.get(page.pageIndex) ?? 0),
      );
      const rotatedSize = getRotatedPageDimensions(page, pageRotation);
      const oldScrollAxisSize =
        layout.strategy === ScrollStrategy.Horizontal ? page.rotatedWidth : page.rotatedHeight;
      const newScrollAxisSize =
        layout.strategy === ScrollStrategy.Horizontal ? rotatedSize.width : rotatedSize.height;

      if (
        layout.startSpacing === 0 &&
        itemIndex === 0 &&
        pageOffset === 0 &&
        newScrollAxisSize < oldScrollAxisSize
      ) {
        startSpacingAdjustment = Math.max(
          startSpacingAdjustment,
          (oldScrollAxisSize - newScrollAxisSize) / 2,
        );
      }

      const nextPageLayout = {
        ...page,
        rotatedHeight: rotatedSize.height,
        rotatedWidth: rotatedSize.width,
        x: layout.strategy === ScrollStrategy.Horizontal ? 0 : pageOffset,
        y: layout.strategy === ScrollStrategy.Horizontal ? pageOffset : 0,
      };

      pageOffset +=
        (layout.strategy === ScrollStrategy.Horizontal ? rotatedSize.height : rotatedSize.width) +
        pageGap;
      itemWidth =
        layout.strategy === ScrollStrategy.Horizontal
          ? Math.max(itemWidth, rotatedSize.width)
          : itemWidth + rotatedSize.width;
      itemHeight =
        layout.strategy === ScrollStrategy.Horizontal
          ? itemHeight + rotatedSize.height
          : Math.max(itemHeight, rotatedSize.height);

      return nextPageLayout;
    });

    if (pageLayouts.length > 1) {
      if (layout.strategy === ScrollStrategy.Horizontal) {
        itemHeight -= pageGap;
      } else {
        itemWidth -= pageGap;
      }
    }

    const nextItem = {
      ...item,
      height: itemHeight,
      offset,
      pageLayouts,
      width: itemWidth,
      x: layout.strategy === ScrollStrategy.Horizontal ? offset : item.x,
      y: layout.strategy === ScrollStrategy.Horizontal ? item.y : offset,
    };

    if (layout.strategy === ScrollStrategy.Horizontal) {
      offset += itemWidth + pageGap;
      maxHeight = Math.max(maxHeight, itemHeight);
    } else {
      offset += itemHeight + pageGap;
      maxWidth = Math.max(maxWidth, itemWidth);
    }

    return nextItem;
  });

  if (items.length > 0) {
    offset -= pageGap;
  }

  return {
    ...layout,
    endSpacing: layout.endSpacing,
    items,
    startSpacing: layout.startSpacing + startSpacingAdjustment,
    totalHeight:
      layout.strategy === ScrollStrategy.Horizontal
        ? maxHeight
        : layout.startSpacing + startSpacingAdjustment + offset + layout.endSpacing,
    totalWidth:
      layout.strategy === ScrollStrategy.Horizontal
        ? layout.startSpacing + startSpacingAdjustment + offset + layout.endSpacing
        : maxWidth,
  };
}
