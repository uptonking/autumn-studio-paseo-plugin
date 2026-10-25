import { doclingConfigSchema } from '../../../../shared/ai-text/engine-configs.ts';
import { getAiTextEngineDescriptor } from '../../../../shared/ai-text/engine-catalog.ts';
import { registerAiTextEngine, type AiTextEngine } from '../../engine-registry.ts';
import { parseWithDocling } from './adapter.ts';
import { getDoclingEnvironment } from './environment.ts';
import { runDoclingOperation } from './operations.ts';

export function createDoclingEngine(): AiTextEngine {
  const descriptor = getAiTextEngineDescriptor('docling');
  if (!descriptor) throw new Error('Docling engine descriptor is missing');

  return {
    descriptor,
    async parse(ctx) {
      const config = doclingConfigSchema.parse(ctx.config);
      const result = await parseWithDocling({
        filePath: ctx.sourceAbsPath,
        fileName: ctx.fileName,
        route: ctx.route,
        config,
        extraction: ctx.extraction,
        signal: ctx.signal,
        onProgress: ctx.onProgress,
        onLog: ctx.onLog,
      });
      return {
        markdown: result.markdown,
        layout: result.layout,
        assets: result.assets,
        routeUsed: result.routeUsed,
        engineVersion: result.engineVersion,
        warnings: result.warnings,
      };
    },
    async detect({ config, indexUrl, refresh }) {
      return await getDoclingEnvironment({
        config: doclingConfigSchema.parse(config),
        indexUrl,
        refresh,
      });
    },
    async runOperation(operationId, ctx) {
      await runDoclingOperation(operationId, ctx);
    },
  };
}

export function registerDoclingEngine(): void {
  registerAiTextEngine(createDoclingEngine());
}
