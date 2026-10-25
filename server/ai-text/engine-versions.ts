const LATEST_CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4_000;

interface LatestEntry {
  at: number;
  version: string | null;
}

const latestCache = new Map<string, LatestEntry>();
const inflight = new Map<string, Promise<string | null>>();

export function normalizePackageName(pkg: string): string {
  return pkg
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, '-');
}

function versionSegments(value: string): (number | string)[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part));
}

/** Semver-ish ordering: numeric segments numerically, the rest lexically. */
export function compareVersions(a: string, b: string): number {
  const left = versionSegments(a);
  const right = versionSegments(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l < r ? -1 : 1;
      continue;
    }
    const cmp = String(l).localeCompare(String(r));
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Extracts the version from a PEP 503 filename (`pkg-1.2.3-py3-none-any.whl`,
 * `pkg-1.2.3.tar.gz`). Wheels carry five or six dash-separated groups; the
 * version is always the second.
 */
export function parseVersionFromFilename(filename: string, packageName: string): string | null {
  let stem: string;
  if (filename.endsWith('.whl')) {
    stem = filename.slice(0, -4);
  } else if (filename.endsWith('.tar.gz')) {
    stem = filename.slice(0, -7);
  } else if (filename.endsWith('.zip')) {
    stem = filename.slice(0, -4);
  } else {
    return null;
  }
  const parts = stem.split('-');
  const expectedParts = filename.endsWith('.whl') ? 5 : 2;
  if (parts.length < expectedParts) return null;
  if (normalizePackageName(parts[0] ?? '') !== normalizePackageName(packageName)) {
    return null;
  }
  const version = parts[1] ?? '';
  return /^\d/.test(version) ? version : null;
}

/** Versions listed on a PEP 503 simple-index page, deduplicated and sorted. */
export function parseSimpleIndexVersions(html: string, packageName: string): string[] {
  const versions = new Set<string>();
  for (const match of html.matchAll(/>([^<>]+)<\/a>/g)) {
    const version = parseVersionFromFilename((match[1] ?? '').trim(), packageName);
    if (version) versions.add(version);
  }
  return [...versions].sort(compareVersions);
}

async function fetchLatestFromOfficialIndex(pkg: string): Promise<string | null> {
  try {
    const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { info?: { version?: unknown } };
    const version = body.info?.version;
    return typeof version === 'string' && /^\d/.test(version) ? version : null;
  } catch {
    return null;
  }
}

/** `1.2.3` is stable; `1.2.3rc1`, `1.2.3a1`, `1.2.3-dev0` are not. */
export function isStableVersion(version: string): boolean {
  return /^\d+(?:\.\d+)*$/.test(version.trim());
}

async function fetchLatestFromSimpleIndex(pkg: string, indexUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${indexUrl}/${pkg}/`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const versions = parseSimpleIndexVersions(await response.text(), pkg);
    if (versions.length === 0) return null;
    // Prefer the newest stable release: mirror file lists include
    // prereleases, and offering "1.0.0rc2" as an update from "1.0.0" would
    // be wrong. Fall back to the overall maximum when nothing is stable.
    const stable = versions.filter((version) => isStableVersion(version));
    const pool = stable.length > 0 ? stable : versions;
    return pool.reduce((best, candidate) =>
      compareVersions(candidate, best) > 0 ? candidate : best,
    );
  } catch {
    return null;
  }
}

/**
 * Newest release of a package. Empty `indexUrl` queries the official PyPI
 * JSON API; otherwise the mirror's PEP 503 simple index. Always fail-soft:
 * null means "unknown", never an error — the UI just hides the update badge.
 */
export async function fetchLatestEngineVersion(
  packageName: string,
  indexUrl = '',
): Promise<string | null> {
  const pkg = normalizePackageName(packageName);
  if (!pkg) return null;
  const index = indexUrl.trim().replace(/\/+$/, '');
  const key = `${pkg}@${index || 'pypi.org'}`;

  const cached = latestCache.get(key);
  if (cached && Date.now() - cached.at < LATEST_CACHE_MS) return cached.version;
  const pending = inflight.get(key);
  if (pending) return pending;

  const probe = index ? fetchLatestFromSimpleIndex(pkg, index) : fetchLatestFromOfficialIndex(pkg);
  inflight.set(key, probe);
  try {
    const version = await probe;
    latestCache.set(key, { at: Date.now(), version });
    return version;
  } finally {
    if (inflight.get(key) === probe) inflight.delete(key);
  }
}

/** Test seam: forces the next version check to hit the network. */
export function clearEngineVersionCache(): void {
  latestCache.clear();
}

/**
 * Normalizes user-typed version input (``, `v1.2.3`, `==1.2.3`, `1.2.3`) to a
 * bare version string, or null when it is not a version at all.
 */
export function parseVersionSpec(value: string): string | null {
  const trimmed = value.trim().replace(/^[=vV]+/, '');
  return /^\d[A-Za-z0-9.+!]*$/.test(trimmed) ? trimmed : null;
}

/** uv `--index-url` arguments for a configured mirror; empty for official PyPI. */
export function uvIndexArgs(indexUrl: string): string[] {
  const trimmed = indexUrl.trim();
  return trimmed ? ['--index-url', trimmed] : [];
}
