import { doclingConfigSchema } from '../../../../shared/ai-text/engine-configs.ts';
import { buildProcessError, runProcess } from '../../command-runner.ts';
import { resolveExecutable } from '../../executable.ts';
import { clearCacheDirectory } from '../../disk.ts';
import { parseVersionSpec, uvIndexArgs } from '../../engine-versions.ts';
import type { AiTextEngineOperationContext } from '../../engine-registry.ts';
import { resolveModelPath } from './environment.ts';

const MODELS_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const UNINSTALL_TIMEOUT_MS = 60_000;

async function requireUv(): Promise<string> {
  const uvPath = await resolveExecutable('uv');
  if (!uvPath) {
    throw new Error('uv was not found. Install uv first, then run "uv tool install docling".');
  }
  return uvPath;
}

async function runChecked(input: {
  label: string;
  command: string;
  args: string[];
  timeoutMs: number;
  ctx: AiTextEngineOperationContext;
  phase: string;
}): Promise<void> {
  const result = await runProcess({
    command: input.command,
    args: input.args,
    timeoutMs: input.timeoutMs,
    signal: input.ctx.signal,
    onLog: input.ctx.onLog,
  });
  if (result.aborted) throw new Error(`${input.phase} was cancelled`);
  if (result.code !== 0) {
    throw new Error(buildProcessError(input.label, result));
  }
}

function requireValidVersion(ctx: AiTextEngineOperationContext): string | null {
  const requested = (ctx.options.version ?? '').trim();
  const version = parseVersionSpec(requested);
  if (requested && !version) {
    throw new Error(
      `"${requested}" does not look like a release version. Try a form like 2.142.0.`,
    );
  }
  return version;
}

async function installDocling(
  ctx: AiTextEngineOperationContext,
  mode: 'install' | 'reinstall' | 'update',
): Promise<void> {
  const uvPath = await requireUv();
  const version = requireValidVersion(ctx);
  const args = ['tool', 'install'];
  if (mode === 'reinstall') args.push('--reinstall');
  if (mode === 'update') args.push('--upgrade');
  args.push(...uvIndexArgs(ctx.indexUrl));
  args.push(version ? `docling==${version}` : 'docling');
  const phase =
    mode === 'reinstall'
      ? 'Repairing Docling'
      : mode === 'update'
        ? 'Updating Docling'
        : `Installing Docling${version ? ` ${version}` : ''}`;
  await runChecked({
    label: 'uv tool install',
    command: uvPath,
    args,
    timeoutMs: INSTALL_TIMEOUT_MS,
    ctx,
    phase,
  });
}

async function downloadModels(ctx: AiTextEngineOperationContext): Promise<void> {
  const config = doclingConfigSchema.parse(ctx.config);
  const command = config.doclingToolsCommand.trim() || 'docling-tools';
  const toolsPath = await resolveExecutable(command);
  if (!toolsPath) {
    throw new Error(
      `docling-tools "${command}" was not found. Install Docling with "uv tool install docling".`,
    );
  }
  const runDownload = async (models: string[]): Promise<void> => {
    const args = ['models', 'download'];
    if (config.artifactsPath.trim()) {
      args.push('--output-dir', config.artifactsPath.trim());
    }
    args.push(...models);
    await runChecked({
      label: 'docling-tools models download',
      command: toolsPath,
      args,
      timeoutMs: MODELS_DOWNLOAD_TIMEOUT_MS,
      ctx,
      phase: 'Downloading models',
    });
  };

  await runDownload([]);
  if (ctx.options.includeVlm === 'true') {
    await runDownload(['granitedocling']);
  }
}

async function clearModels(ctx: AiTextEngineOperationContext): Promise<void> {
  const config = doclingConfigSchema.parse(ctx.config);
  const modelDir = await resolveModelPath(config);
  ctx.onLog?.(`Clearing ${modelDir.path}`);
  await clearCacheDirectory(modelDir.path);
  ctx.onLog?.('Model cache cleared. Models re-download on the next parse.');
}

export async function runDoclingOperation(
  operationId: string,
  ctx: AiTextEngineOperationContext,
): Promise<void> {
  switch (operationId) {
    case 'cli.install':
      await installDocling(ctx, 'install');
      return;
    case 'cli.reinstall':
      await installDocling(ctx, 'reinstall');
      return;
    case 'cli.update':
      await installDocling(ctx, 'update');
      return;
    case 'cli.uninstall': {
      const uvPath = await requireUv();
      await runChecked({
        label: 'uv tool uninstall',
        command: uvPath,
        args: ['tool', 'uninstall', 'docling'],
        timeoutMs: UNINSTALL_TIMEOUT_MS,
        ctx,
        phase: 'Uninstalling Docling',
      });
      return;
    }
    case 'models.download':
      await downloadModels(ctx);
      return;
    case 'models.clear':
      await clearModels(ctx);
      return;
    default:
      throw new Error(`Unknown Docling operation "${operationId}".`);
  }
}
