import type { AiTextEngineEnvironment } from '../../shared/ai-text/task.ts';
import type { AiTextEngineDescriptor } from '../../shared/ai-text/engines.ts';
import { engineSupportsFormat } from '../../shared/ai-text/engines.ts';
import type { AiTextExtractionSettings } from '../../shared/ai-text/profiles.ts';
import { parseEngineConfig } from '../../shared/ai-text/engine-configs.ts';
import type { AiTextLayoutDocument } from '../../shared/ai-text/layout.ts';

export interface AiTextAsset {
  /** Version-relative POSIX path such as `images/abc.jpg`. */
  path: string;
  data: Uint8Array;
}

export interface AiTextParseProgress {
  phase?: string;
  message?: string;
  percent?: number | null;
}

export interface AiTextEngineParseContext {
  workspaceRootPath: string;
  sourceRelPath: string;
  sourceAbsPath: string;
  fileName: string;
  buffer: Buffer;
  route: string;
  config: Record<string, unknown>;
  extraction: AiTextExtractionSettings;
  signal?: AbortSignal;
  onProgress?: (update: AiTextParseProgress) => void;
  onLog?: (line: string) => void;
}

export interface AiTextEngineParseOutput {
  markdown: string;
  layout: AiTextLayoutDocument | null;
  assets: AiTextAsset[];
  /** Concrete route after `auto` resolution. */
  routeUsed: string;
  engineVersion: string | null;
  warnings: string[];
}

export interface AiTextEngineOperationContext {
  config: Record<string, unknown>;
  options: Record<string, string>;
  /** Package index for install/update operations; empty means official PyPI. */
  indexUrl: string;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}

export interface AiTextEngine {
  descriptor: AiTextEngineDescriptor;
  parse(ctx: AiTextEngineParseContext): Promise<AiTextEngineParseOutput>;
  detect(input: {
    config: Record<string, unknown>;
    /** Package index used for the update-available check. */
    indexUrl?: string;
    refresh?: boolean;
  }): Promise<AiTextEngineEnvironment>;
  runOperation?(operationId: string, ctx: AiTextEngineOperationContext): Promise<void>;
}

const engines = new Map<string, AiTextEngine>();

export function registerAiTextEngine(engine: AiTextEngine): void {
  engines.set(engine.descriptor.id, engine);
}

export function getAiTextEngine(engineId: string): AiTextEngine | null {
  return engines.get(engineId) ?? null;
}

export function listAiTextEngines(): AiTextEngine[] {
  return [...engines.values()];
}

export function listAiTextEngineDescriptors(): AiTextEngineDescriptor[] {
  return listAiTextEngines().map((engine) => engine.descriptor);
}

export function assertEngineSupportsFormat(engine: AiTextEngine, formatKind: string): void {
  if (!engineSupportsFormat(engine.descriptor, formatKind)) {
    throw new Error(
      `${engine.descriptor.label} does not support ${formatKind} files. Pick another profile.`,
    );
  }
}

export function resolveEngineConfig(engineId: string, raw: unknown): Record<string, unknown> {
  return parseEngineConfig(engineId, raw);
}

export async function detectEngineEnvironment(input: {
  engineId: string;
  config: Record<string, unknown>;
  indexUrl?: string;
  refresh?: boolean;
}): Promise<AiTextEngineEnvironment> {
  const engine = getAiTextEngine(input.engineId);
  if (!engine) throw new Error(`Unknown extraction engine "${input.engineId}".`);
  return await engine.detect({
    config: resolveEngineConfig(input.engineId, input.config),
    indexUrl: input.indexUrl?.trim() ?? '',
    refresh: input.refresh,
  });
}

export async function runEngineOperation(input: {
  engineId: string;
  operationId: string;
  config: Record<string, unknown>;
  options: Record<string, string>;
  indexUrl?: string;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}): Promise<void> {
  const engine = getAiTextEngine(input.engineId);
  if (!engine) throw new Error(`Unknown extraction engine "${input.engineId}".`);
  const operation = engine.descriptor.operations.find((item) => item.id === input.operationId);
  if (!operation) {
    throw new Error(`${engine.descriptor.label} has no operation "${input.operationId}".`);
  }
  if (!engine.runOperation) {
    throw new Error(`${engine.descriptor.label} cannot run operations.`);
  }
  await engine.runOperation(input.operationId, {
    config: resolveEngineConfig(input.engineId, input.config),
    options: input.options,
    indexUrl: input.indexUrl?.trim() ?? '',
    signal: input.signal,
    onLog: input.onLog,
  });
}
