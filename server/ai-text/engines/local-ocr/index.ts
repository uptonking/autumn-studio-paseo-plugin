import { getAiTextEngineDescriptor } from '../../../../shared/ai-text/engine-catalog.ts';
import type { AiTextEngineEnvironment } from '../../../../shared/ai-text/task.ts';
import { registerAiTextEngine, type AiTextEngine } from '../../engine-registry.ts';
import { resolveExecutable } from '../../executable.ts';
import { extractLocalDocumentWithOcr } from '../../local-ocr-extractor.ts';

async function detectLocalOcr(): Promise<AiTextEngineEnvironment> {
  const pdftotext = await resolveExecutable('pdftotext');
  return {
    engineId: 'local-ocr',
    checkedAt: new Date().toISOString(),
    status: 'ready',
    version: null,
    latestVersion: null,
    updateAvailable: false,
    storage: null,
    routes: [
      {
        id: 'auto',
        label: 'Local',
        status: 'ready',
        message: pdftotext
          ? 'Poppler text extraction with on-device OCR fallback.'
          : 'Uses the built-in PDF parser and on-device OCR.',
      },
    ],
    components: [
      {
        id: 'pdftotext',
        label: 'Poppler (pdftotext)',
        status: pdftotext ? 'ready' : 'missing',
        version: null,
        detail: pdftotext,
      },
      {
        id: 'builtin-ocr',
        label: 'On-device OCR',
        status: 'ready',
        version: null,
        detail: null,
      },
    ],
    recommendations: pdftotext
      ? []
      : ['Install Poppler for better text-layer extraction. The built-in fallback still works.'],
    details: {},
  };
}

export function createLocalOcrEngine(): AiTextEngine {
  const descriptor = getAiTextEngineDescriptor('local-ocr');
  if (!descriptor) throw new Error('Local OCR engine descriptor is missing');

  return {
    descriptor,
    async parse(ctx) {
      const timeoutSignal = AbortSignal.timeout(ctx.extraction.timeoutMs);
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeoutSignal]) : timeoutSignal;
      try {
        const result = await extractLocalDocumentWithOcr({
          filePath: ctx.sourceAbsPath,
          fileName: ctx.fileName,
          buffer: ctx.buffer,
          enableOcr: ctx.extraction.ocr,
          enableTable: ctx.extraction.tables,
          signal,
        });
        return {
          markdown: result.markdown,
          layout: null,
          assets: [],
          routeUsed: result.routeUsed,
          engineVersion: null,
          warnings: result.warnings,
        };
      } catch (error) {
        if (timeoutSignal.aborted && !ctx.signal?.aborted) {
          throw new Error(`Local text extraction timed out after ${ctx.extraction.timeoutMs} ms`, {
            cause: error,
          });
        }
        throw error;
      }
    },
    async detect() {
      return await detectLocalOcr();
    },
  };
}

export function registerLocalOcrEngine(): void {
  registerAiTextEngine(createLocalOcrEngine());
}
