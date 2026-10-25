import { runProcess } from '../../command-runner.ts';

const MODELS_TIMEOUT_MS = 45_000;

export interface MineruModelRepoStatus {
  name: string;
  ready: boolean;
  path: string | null;
  missingPaths: string[];
}

export interface MineruModelsInfo {
  baseDir: string | null;
  tier: string;
  tierReady: boolean;
  source: string | null;
  smallBackend: string | null;
  vlmEngine: string | null;
  repos: MineruModelRepoStatus[];
}

function appendMissingPaths(repo: MineruModelRepoStatus, raw: string): void {
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed) repo.missingPaths.push(trimmed);
  }
}

/**
 * Reads the `Repos:` section of `mineru-kit models show`. The status sits on
 * the repo line and the path on the following parenthesized line.
 */
export function parseModelRepos(text: string): MineruModelRepoStatus[] {
  const lines = text.split(/\r?\n/);
  const repos: MineruModelRepoStatus[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^\s{2,}([A-Za-z0-9._-]+):\s+(ready|missing)\s*(?:\((.+)\))?\s*$/.exec(line);
    if (!match?.[1] || !match[2]) continue;
    let repoPath = match[3]?.trim() || null;
    if (!repoPath) {
      const pathMatch = /^\s*\((.+)\)\s*$/.exec(lines[index + 1] ?? '');
      if (pathMatch?.[1]) {
        repoPath = pathMatch[1].trim();
        index += 1;
      }
    }
    repos.push({
      name: match[1],
      ready: match[2] === 'ready',
      path: repoPath,
      missingPaths: [],
    });
  }
  return repos;
}

export function parseModelsShowOutput(text: string, tier: string): MineruModelsInfo | null {
  const readField = (key: string): string | null => {
    const match = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm').exec(text);
    const value = match?.[1]?.trim() ?? '';
    return value && value !== '(unset)' ? value : null;
  };

  const baseDir = readField('model\\.base_dir');
  const source = readField('model\\.source');
  const smallBackend = readField('Effective small backend') ?? readField('model\\.small_backend');
  const vlmEngine = readField('Effective VLM engine') ?? readField('model\\.vlm\\.engine');

  const repos = parseModelRepos(text);
  if (!baseDir && repos.length === 0) return null;

  let tierReady = false;
  const tierLine = new RegExp(`^\\s+${tier}:\\s*(.+)$`, 'm').exec(text);
  if (tierLine?.[1]) {
    const names = tierLine[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    tierReady =
      names.length > 0 &&
      names.every((name) => repos.some((repo) => repo.name === name && repo.ready));
  } else if (repos.length > 0) {
    tierReady = repos.every((repo) => repo.ready);
  }

  return { baseDir, tier, tierReady, source, smallBackend, vlmEngine, repos };
}

/**
 * Reads `mineru-kit models verify` output. Missing paths wrap onto unindented
 * continuation lines, so everything after a repo header belongs to that repo
 * until a blank line or the next header.
 */
export function parseModelsVerifyOutput(text: string): MineruModelRepoStatus[] {
  const repos: MineruModelRepoStatus[] = [];
  let current: MineruModelRepoStatus | null = null;
  for (const line of text.split(/\r?\n/)) {
    const start = /^\s*([A-Za-z0-9._-]+):\s*missing key paths?:\s*(.*)$/i.exec(line);
    if (start?.[1]) {
      current = {
        name: start[1],
        ready: false,
        path: null,
        missingPaths: [],
      };
      repos.push(current);
      if (start[2]) appendMissingPaths(current, start[2]);
      continue;
    }
    if (!current) continue;
    if (!line.trim()) {
      current = null;
      continue;
    }
    appendMissingPaths(current, line);
  }
  return repos;
}

/**
 * `models verify` and `models download` only accept basic/standard. Parse can
 * request flash/advanced tiers; verification still uses the standard set.
 */
export function normalizeModelTier(tier: string): {
  tier: 'basic' | 'standard';
  adjusted: boolean;
} {
  const normalized = tier.trim().toLowerCase();
  if (normalized === 'basic') return { tier: 'basic', adjusted: false };
  if (normalized === 'standard') return { tier: 'standard', adjusted: false };
  return { tier: 'standard', adjusted: true };
}

export async function probeModels(
  kitPath: string | null,
  tier: string,
): Promise<MineruModelsInfo | null> {
  if (!kitPath) return null;

  try {
    // `models show` reads the current config; it takes no --tier/--source.
    const show = await runProcess({
      command: kitPath,
      args: ['models', 'show'],
      timeoutMs: MODELS_TIMEOUT_MS,
    });
    if (show.code === 0) {
      const parsed = parseModelsShowOutput(`${show.stdout}\n${show.stderr}`, tier);
      if (parsed) return parsed;
    }
  } catch {
    // Fall through to `models verify`.
  }

  try {
    const normalizedTier = normalizeModelTier(tier).tier;
    const verify = await runProcess({
      command: kitPath,
      args: ['models', 'verify', '--tier', normalizedTier],
      timeoutMs: MODELS_TIMEOUT_MS,
    });
    const repos = parseModelsVerifyOutput(`${verify.stdout}\n${verify.stderr}`);
    const missing = repos.some((repo) => repo.missingPaths.length > 0);
    return {
      baseDir: null,
      tier,
      tierReady: verify.code === 0 && !missing,
      source: null,
      smallBackend: null,
      vlmEngine: null,
      repos:
        repos.length > 0
          ? repos
          : verify.code === 0
            ? []
            : [
                {
                  name: `tier ${tier}`,
                  ready: false,
                  path: null,
                  missingPaths: [],
                },
              ],
    };
  } catch {
    return null;
  }
}
