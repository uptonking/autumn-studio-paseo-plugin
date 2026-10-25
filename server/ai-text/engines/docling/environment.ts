import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AiTextEngineEnvironment } from '../../../../shared/ai-text/task.ts';
import type { DoclingConfig } from '../../../../shared/ai-text/engine-configs.ts';
import { runProcess } from '../../command-runner.ts';
import { resolveExecutable, uvToolDirFromExecutablePath } from '../../executable.ts';
import { computeDirectorySize } from '../../disk.ts';
import { compareVersions, fetchLatestEngineVersion } from '../../engine-versions.ts';

const ENVIRONMENT_CACHE_MS = 60_000;
const VERSION_TIMEOUT_MS = 20_000;
const MIN_DOCLING_VERSION = '2.50.0';

interface CacheEntry {
  at: number;
  value: AiTextEngineEnvironment;
}

const cache = new Map<string, CacheEntry>();

export function clearDoclingEnvironmentCache(): void {
  cache.clear();
}

export function parseDoclingVersion(output: string): string | null {
  const match = /Docling version:\s*([0-9]+(?:\.[0-9]+){1,3})/i.exec(output);
  return match?.[1] ?? null;
}

export function isDoclingVersionSupported(version: string | null): boolean {
  if (!version) return false;
  return compareVersions(version, MIN_DOCLING_VERSION) >= 0;
}

/** Model cache location: configured artifacts path, env override, or default. */
export async function resolveModelPath(config: DoclingConfig): Promise<{
  path: string;
  populated: boolean;
}> {
  const configured = config.artifactsPath.trim() || process.env.DOCLING_ARTIFACTS_PATH?.trim();
  const path = configured || join(homedir(), '.cache', 'docling', 'models');
  try {
    const entries = await readdir(path);
    return { path, populated: entries.length > 0 };
  } catch {
    return { path, populated: false };
  }
}

function cacheKey(config: DoclingConfig, indexUrl: string): string {
  return JSON.stringify({
    command: config.doclingCommand,
    tools: config.doclingToolsCommand,
    artifactsPath: config.artifactsPath,
    indexUrl,
  });
}

export async function getDoclingEnvironment(input: {
  config: DoclingConfig;
  indexUrl?: string;
  refresh?: boolean;
}): Promise<AiTextEngineEnvironment> {
  const indexUrl = input.indexUrl?.trim() ?? '';
  const key = cacheKey(input.config, indexUrl);
  const cached = cache.get(key);
  if (!input.refresh && cached && Date.now() - cached.at < ENVIRONMENT_CACHE_MS) {
    return cached.value;
  }

  const command = input.config.doclingCommand.trim() || 'docling';
  const toolsCommand = input.config.doclingToolsCommand.trim() || 'docling-tools';
  const [doclingPath, toolsPath, uvPath, modelDir] = await Promise.all([
    resolveExecutable(command),
    resolveExecutable(toolsCommand),
    resolveExecutable('uv'),
    resolveModelPath(input.config),
  ]);

  let version: string | null = null;
  if (doclingPath) {
    const result = await runProcess({
      command: doclingPath,
      args: ['--version'],
      timeoutMs: VERSION_TIMEOUT_MS,
    });
    version = parseDoclingVersion(`${result.stdout}\n${result.stderr}`);
  }

  const cliReady = Boolean(doclingPath);
  const supported = isDoclingVersionSupported(version);
  const cliComponentStatus = !cliReady
    ? 'missing'
    : !version
      ? 'unknown'
      : supported
        ? 'ready'
        : 'outdated';
  const components: AiTextEngineEnvironment['components'] = [
    {
      id: 'docling',
      label: 'docling CLI',
      status: cliComponentStatus,
      version,
      detail: cliReady ? doclingPath : `Run "uv tool install docling".`,
    },
    {
      id: 'docling-tools',
      label: 'docling-tools CLI',
      status: toolsPath ? 'ready' : 'missing',
      version: null,
      detail: toolsPath ?? `Installed with Docling; run "uv tool install docling".`,
    },
    {
      id: 'models',
      label: 'Model cache',
      status: modelDir.populated ? 'ready' : 'unknown',
      version: null,
      detail: modelDir.populated
        ? modelDir.path
        : `No models cached at ${modelDir.path}. Docling downloads them on first parse.`,
    },
    {
      id: 'uv',
      label: 'uv',
      status: uvPath ? 'ready' : 'missing',
      version: null,
      detail: uvPath ?? 'Needed to install or repair Docling.',
    },
  ];

  const routeStatus: AiTextEngineEnvironment['routes'][number]['status'] = !cliReady
    ? 'needs-setup'
    : !version
      ? 'unknown'
      : supported
        ? 'ready'
        : 'needs-setup';
  const routeMessage = (firstParse: string): string => {
    if (!cliReady) return 'Install Docling first.';
    if (!version) {
      return 'Could not read the Docling version; conversion may fail.';
    }
    if (!supported) {
      return `Upgrade Docling to ${MIN_DOCLING_VERSION} or newer.`;
    }
    return firstParse;
  };
  const routes: AiTextEngineEnvironment['routes'] = [
    {
      id: 'standard',
      label: 'Standard',
      status: routeStatus,
      message: routeMessage('First parse downloads the layout, table, and OCR models.'),
    },
    {
      id: 'vlm',
      label: 'VLM',
      status: routeStatus,
      message: routeMessage('First VLM parse downloads the Granite Docling model.'),
    },
  ];

  const recommendations: string[] = [];
  if (!cliReady) {
    recommendations.push('Install Docling with "uv tool install docling".');
  } else if (!version) {
    recommendations.push(
      'Docling is installed but its version could not be read. Check that "docling --version" prints "Docling version: x.y.z".',
    );
  } else if (!supported) {
    recommendations.push(
      `Docling ${version} is older than ${MIN_DOCLING_VERSION}. Upgrade with "uv tool install --reinstall docling".`,
    );
  }
  if (!modelDir.populated) {
    recommendations.push('Download models ahead of time with "docling-tools models download".');
  }

  // The release check is fail-soft: unreachable index → null, no update badge.
  const latestVersion = version ? await fetchLatestEngineVersion('docling', indexUrl) : null;
  const updateAvailable = Boolean(
    latestVersion && version && compareVersions(version, latestVersion) < 0,
  );

  const doclingRealPath = doclingPath ? await realpath(doclingPath).catch(() => doclingPath) : null;
  const enginePath = uvToolDirFromExecutablePath(doclingRealPath);
  const [engineBytes, modelBytes] = await Promise.all([
    enginePath ? computeDirectorySize(enginePath, { maxEntries: 10_000 }) : Promise.resolve(null),
    modelDir.populated
      ? computeDirectorySize(modelDir.path, { maxEntries: 10_000 })
      : Promise.resolve(null),
  ]);
  const storage = {
    engineBytes: enginePath ? engineBytes : null,
    enginePath,
    modelBytes: modelDir.populated ? modelBytes : null,
    modelPath: modelDir.path,
  };

  const value: AiTextEngineEnvironment = {
    engineId: 'docling',
    checkedAt: new Date().toISOString(),
    status: !cliReady ? 'needs-setup' : !version ? 'unknown' : supported ? 'ready' : 'needs-setup',
    version,
    latestVersion,
    updateAvailable,
    storage,
    routes,
    components,
    recommendations,
    details: {
      modelPath: modelDir.path,
      minimumVersion: MIN_DOCLING_VERSION,
    },
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
