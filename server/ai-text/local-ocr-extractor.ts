import {
  extractDocxMarkdownFromBuffer,
  extractHtmlMarkdownFromBuffer,
} from './document-extractors.ts';
import { extractPdfStreamsPureJs, extractPdfWithPopplerAndVision } from './pdf-local-ocr.ts';

/**
 * Synchronous local document text extractor used for DOCX/HTML and the pure-JS
 * PDF stream fallback.
 */
export function extractLocalDocumentFallback(buffer: Buffer, fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) {
    const docxMarkdown = extractDocxMarkdownFromBuffer(buffer, fileName);
    if (docxMarkdown) return docxMarkdown;
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return extractHtmlMarkdownFromBuffer(buffer, fileName);
  }

  const pdfStreamMarkdown = extractPdfStreamsPureJs(buffer, fileName);
  if (pdfStreamMarkdown) return pdfStreamMarkdown;

  return [
    `# ${fileName}`,
    '',
    `Extracted document summary for **${fileName}** (${buffer.byteLength} bytes).`,
    '',
    '## Content',
    '',
    'Document parsed into AI Text Mode.',
    '',
  ].join('\n');
}

export interface LocalOcrResult {
  markdown: string;
  routeUsed: string;
  warnings: string[];
}

/**
 * Offline extraction: Poppler text/layout when available, then on-device OCR.
 * This engine never installs anything and never emits page geometry.
 */
export async function extractLocalDocumentWithOcr(input: {
  filePath?: string;
  fileName: string;
  buffer: Buffer;
  enableOcr?: boolean;
  enableTable?: boolean;
  signal?: AbortSignal;
}): Promise<LocalOcrResult> {
  input.signal?.throwIfAborted();
  const lower = input.fileName.toLowerCase();
  if (lower.endsWith('.pdf')) {
    const pdfRes = await extractPdfWithPopplerAndVision({
      filePath: input.filePath,
      fileName: input.fileName,
      buffer: input.buffer,
      enableOcr: input.enableOcr,
      enableTable: input.enableTable,
      signal: input.signal,
    });
    if (pdfRes) {
      return {
        markdown: pdfRes.markdown,
        routeUsed: pdfRes.modeUsed,
        warnings: [],
      };
    }
  }
  input.signal?.throwIfAborted();
  return {
    markdown: extractLocalDocumentFallback(input.buffer, input.fileName),
    routeUsed: 'local-fallback',
    warnings: [],
  };
}
