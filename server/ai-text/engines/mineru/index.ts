import { mineruConfigSchema } from "../../../../shared/ai-text/engine-configs.ts";
import { getAiTextEngineDescriptor } from "../../../../shared/ai-text/engine-catalog.ts";
import {
  registerAiTextEngine,
  type AiTextEngine,
} from "../../engine-registry.ts";
import { parseWithMineru } from "./adapter.ts";
import { getMineruEnvironment } from "./environment.ts";
import { runMineruOperation } from "./operations.ts";

export function createMineruEngine(): AiTextEngine {
  const descriptor = getAiTextEngineDescriptor("mineru");
  if (!descriptor) throw new Error("MinerU engine descriptor is missing");

  return {
    descriptor,
    async parse(ctx) {
      const config = mineruConfigSchema.parse(ctx.config);
      const result = await parseWithMineru({
        filePath: ctx.sourceAbsPath,
        fileName: ctx.fileName,
        buffer: ctx.buffer,
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
      return await getMineruEnvironment({
        config: mineruConfigSchema.parse(config),
        indexUrl,
        refresh,
      });
    },
    async runOperation(operationId, ctx) {
      await runMineruOperation(operationId, ctx);
    },
  };
}

export function registerMineruEngine(): void {
  registerAiTextEngine(createMineruEngine());
}
