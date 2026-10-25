import { lstat, readdir } from 'fs/promises';
import { basename, join } from 'path';
import mime from 'mime-types';
import type { FileNode } from '../shared/contracts.js';

/** Build directories that never help when browsing a workspace. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'out',
  'coverage',
  '.cache',
  '.next',
  '.turbo',
  '.vercel',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.gradle',
  '.idea',
]);

/** Operating system metadata files that clutter file trees. */
const SKIP_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.Spotlight-V100',
  '.Trashes',
]);

/** Dot-directories intentionally shown in the explorer tree. */
const VISIBLE_DOT_DIRS = new Set(['.autumn']);

const MAX_DEPTH = 24;

/**
 * Directory walk that skips symlinks (cycles, path escapes) and
 * dot-directories. `visibleDotDirs` extends the whitelist so a custom AI Text
 * output root (e.g. `.ai-text`) stays browsable like `.autumn` is.
 */
export async function scanWorkspaceTree(
  rootPath: string,
  maxFiles = 5000,
  visibleDotDirs: readonly string[] = [],
) {
  const visibleDirs = new Set([...VISIBLE_DOT_DIRS, ...visibleDotDirs]);
  let fileCount = 0;
  let truncated = false;

  async function scanDir(dirPath: string, relPath: string, depth: number): Promise<FileNode> {
    const name = relPath === '' ? basename(rootPath) : basename(dirPath);
    const path = relPath === '' ? '/' : `${relPath}/`;
    const children: FileNode[] = [];

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      return { kind: 'folder', path, name, children };
    }
    entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const pendingDirs: Array<{ fullPath: string; childRelPath: string }> = [];

    for (const entry of entries) {
      if (fileCount >= maxFiles) {
        truncated = true;
        break;
      }
      if (depth >= MAX_DEPTH) {
        truncated = true;
        break;
      }
      if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
      if (entry.includes('.paseo-') && entry.endsWith('.tmp')) continue;

      const fullPath = join(dirPath, entry);
      const childRelPath = relPath === '' ? entry : `${relPath}/${entry}`;

      let stats;
      try {
        stats = await lstat(fullPath);
      } catch {
        continue;
      }
      // Symlinks are skipped outright: a cycle would hang the walk, and an
      // out-of-tree link would fail safeResolve() later anyway.
      if (stats.isSymbolicLink()) continue;
      // Dot-files (.gitignore, .env) and whitelisted dot-directories (.autumn)
      // stay visible; other dot-directories stay hidden.
      if (stats.isDirectory() && entry.startsWith('.') && !visibleDirs.has(entry)) {
        continue;
      }

      if (stats.isDirectory()) {
        pendingDirs.push({ fullPath, childRelPath });
      } else if (stats.isFile()) {
        fileCount++;
        children.push({
          kind: 'file',
          path: childRelPath,
          name: entry,
          size: stats.size,
          mtime: stats.mtimeMs,
          contentType: contentTypeFor(entry),
        });
      }
    }

    for (const subDir of pendingDirs) {
      if (fileCount >= maxFiles) {
        truncated = true;
        break;
      }
      children.push(await scanDir(subDir.fullPath, subDir.childRelPath, depth + 1));
    }

    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return { kind: 'folder', path, name, children };
  }

  const tree = await scanDir(rootPath, '', 0);
  return { tree, truncated };
}

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  md: 'text/markdown',
  mdx: 'text/mdx',
  txt: 'text/plain',
  log: 'text/plain',
  env: 'text/plain',
  conf: 'text/plain',
  cfg: 'text/plain',
  ini: 'text/plain',
  json: 'application/json',
  jsonc: 'application/json',
  jsonl: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'application/toml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  scss: 'text/css',
  sass: 'text/css',
  less: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  jsx: 'text/jsx',
  ts: 'text/x-typescript',
  tsx: 'text/x-typescript',
  mts: 'text/x-typescript',
  cts: 'text/x-typescript',
  py: 'text/x-python',
  rs: 'text/x-rust',
  go: 'text/x-go',
  rb: 'text/x-ruby',
  java: 'text/x-java',
  kt: 'text/x-kotlin',
  swift: 'text/x-swift',
  c: 'text/x-c',
  cc: 'text/x-c',
  cpp: 'text/x-c',
  h: 'text/x-c',
  hpp: 'text/x-c',
  sh: 'application/x-sh',
  zsh: 'application/x-sh',
  bash: 'application/x-sh',
  sql: 'application/sql',
  graphql: 'text/plain',
  gql: 'text/plain',
  prisma: 'text/plain',
  vue: 'text/plain',
  svelte: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  wasm: 'application/wasm',
};

const BASENAME_MIME_MAP: Record<string, string> = {
  '.env': 'text/plain',
  '.env.local': 'text/plain',
  '.env.example': 'text/plain',
  '.gitignore': 'text/plain',
  '.gitattributes': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',
  '.npmrc': 'text/plain',
  '.nvmrc': 'text/plain',
  dockerfile: 'text/plain',
  makefile: 'text/plain',
  justfile: 'text/plain',
  license: 'text/plain',
  readme: 'text/plain',
};

export function contentTypeFor(filename: string): string | undefined {
  const base = basename(filename).toLowerCase();
  if (BASENAME_MIME_MAP[base]) return BASENAME_MIME_MAP[base];

  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1) : undefined;
  if (ext && MIME_MAP[ext]) return MIME_MAP[ext];

  const mimeType = mime.lookup(filename);
  if (typeof mimeType === 'string') return mimeType;
  return undefined;
}
