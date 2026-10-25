import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_AI_TEXT_OUTPUT_ROOT,
  parseAiTextOutputRoot,
} from '../shared/ai-text/output-root.ts';
import { appendExtractedVersion, readDocumentMetadata } from '../server/ai-text/metadata-store.ts';
import { resolveAutumnDocPaths, resolveOutputBase } from '../server/ai-text/metadata-paths.ts';
import { listAiTextStorageStats } from '../server/ai-text/output-stats.ts';
import { buildRevealCommand } from '../server/ai-text/reveal.ts';
import {
  assertClearableCacheDir,
  clearCacheDirectory,
  computeDirectorySize,
} from '../server/ai-text/disk.ts';
import { DEFAULT_AI_TEXT_EXTRACTION } from '../shared/ai-text/profiles.ts';
import type { AiTextVersionProvenance } from '../shared/ai-text/settings.ts';

function sampleProvenance(
  overrides: Partial<AiTextVersionProvenance> = {},
): AiTextVersionProvenance {
  return {
    profileId: 'mineru-auto',
    profileName: 'MinerU · Auto',
    profileFingerprint: 'abcd1234',
    requestedEngineId: 'mineru',
    effectiveEngineId: 'mineru',
    engineLabel: 'MinerU',
    engineVersion: null,
    route: 'auto',
    extraction: DEFAULT_AI_TEXT_EXTRACTION,
    refinement: { mode: 'none', didRun: false },
    ...overrides,
  };
}

describe('ai-text output root: parsing', () => {
  it('accepts workspace-relative folders', () => {
    assert.deepEqual(parseAiTextOutputRoot('.autumn'), {
      ok: true,
      kind: 'workspace-relative',
      value: '.autumn',
    });
    assert.deepEqual(parseAiTextOutputRoot('docs/extracted/'), {
      ok: true,
      kind: 'workspace-relative',
      value: 'docs/extracted',
    });
  });

  it('accepts absolute paths including ~ and windows drives', () => {
    assert.deepEqual(parseAiTextOutputRoot('/data/ai-text/'), {
      ok: true,
      kind: 'absolute',
      value: '/data/ai-text',
    });
    assert.deepEqual(parseAiTextOutputRoot('~/ai-text'), {
      ok: true,
      kind: 'absolute',
      value: '~/ai-text',
    });
    assert.deepEqual(parseAiTextOutputRoot('D:\\ai-text'), {
      ok: true,
      kind: 'absolute',
      value: 'D:/ai-text',
    });
  });

  it('rejects empty, traversal, and degenerate roots', () => {
    assert.equal(parseAiTextOutputRoot('   ').ok, false);
    assert.equal(parseAiTextOutputRoot('../outside').ok, false);
    assert.equal(parseAiTextOutputRoot('docs/../outside').ok, false);
    assert.equal(parseAiTextOutputRoot('/').ok, false);
    assert.equal(parseAiTextOutputRoot('~').ok, false);
    assert.equal(parseAiTextOutputRoot('a\0b').ok, false);
    assert.equal(DEFAULT_AI_TEXT_OUTPUT_ROOT, '.autumn');
  });
});

describe('ai-text output root: resolution', () => {
  it('keeps relative roots inside the workspace', () => {
    const base = resolveOutputBase('/tmp/ws', '.autumn', 'ws_1');
    assert.equal(base.kind, 'workspace-relative');
    assert.equal(base.docRootAbsPath, join('/tmp/ws', '.autumn'));
    assert.equal(base.artifactBaseAbsPath, '/tmp/ws');
  });

  it('namespaces absolute roots per workspace', () => {
    const base = resolveOutputBase('/tmp/ws', '~/ai-text', 'ws_1');
    assert.equal(base.kind, 'absolute');
    assert.ok(base.docRootAbsPath.endsWith(join('ai-text', 'ws_1')));
    assert.equal(base.docRootAbsPath, base.artifactBaseAbsPath);
  });

  it('stores absolute doc folder paths in docFolderRelPath', () => {
    const paths = resolveAutumnDocPaths('/tmp/ws', 'docs/paper.pdf', '/data/ai-text', 'ws_1');
    assert.equal(paths.outputRootKind, 'absolute');
    assert.equal(paths.docFolderRelPath, `${paths.docRootAbsPath}/docs__paper.pdf`);
  });
});

describe('ai-text output root: absolute storage', () => {
  let workspaceA: string;
  let workspaceB: string;
  let outputRoot: string;

  before(async () => {
    workspaceA = await mkdtemp(join(tmpdir(), 'fe-ws-a-'));
    workspaceB = await mkdtemp(join(tmpdir(), 'fe-ws-b-'));
    outputRoot = await mkdtemp(join(tmpdir(), 'fe-out-'));
  });

  after(async () => {
    await Promise.all([
      rm(workspaceA, { recursive: true, force: true }),
      rm(workspaceB, { recursive: true, force: true }),
      rm(outputRoot, { recursive: true, force: true }),
    ]);
  });

  it('writes under <root>/<workspace id>/ and keeps workspaces apart', async () => {
    const cases = [
      { root: workspaceA, id: 'ws_a' },
      { root: workspaceB, id: 'ws_b' },
    ];
    for (const { root, id } of cases) {
      await appendExtractedVersion({
        workspaceRootPath: root,
        workspaceId: id,
        sourceRelPath: 'docs/paper.pdf',
        sourceSize: 42,
        sourceMtimeMs: 1_700_000_000_000,
        markdownContent: '# Paper\n\nSame name, different workspace.',
        durationMs: 10,
        provenance: sampleProvenance(),
        outputRootDir: outputRoot,
      });
    }

    // Each workspace id gets its own namespace under the absolute root.
    assert.deepEqual(await readdir(outputRoot), ['ws_a', 'ws_b']);
    for (const { root, id } of cases) {
      const result = await readDocumentMetadata(root, 'docs/paper.pdf', outputRoot, id);
      assert.equal(result.metadata?.versions.length, 1);
      assert.ok(result.activeContent?.includes('# Paper'));
    }
    // A different workspace id sees nothing — no cross-workspace mixing.
    const stranger = await readDocumentMetadata(
      workspaceA,
      'docs/paper.pdf',
      outputRoot,
      'ws_other',
    );
    assert.equal(stranger.metadata, null);
  });

  it('reports stats rows with on-disk sizes for the workspace', async () => {
    const stats = await listAiTextStorageStats({
      workspaceRootPath: workspaceA,
      workspaceId: 'ws_a',
      outputRootDir: outputRoot,
    });
    assert.equal(stats.truncated, false);
    assert.equal(stats.rows.length, 1);
    const row = stats.rows[0];
    assert.equal(row.sourceRelPath, 'docs/paper.pdf');
    assert.equal(row.versionCount, 1);
    assert.equal(row.engines[0], 'MinerU');
    assert.ok(row.totalBytes > 0);
    assert.ok(row.markdownBytes > 0);
    assert.ok(row.docFolderRelPath === 'docs__paper.pdf');
  });
});

describe('ai-text storage: disk helpers', () => {
  it('computes directory sizes and skips symlinks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fe-size-'));
    try {
      await writeFile(join(dir, 'a.txt'), '0123456789');
      await mkdir(join(dir, 'nested'));
      await writeFile(join(dir, 'nested', 'b.txt'), '0123456789');
      assert.equal(await computeDirectorySize(dir), 20);
      assert.equal(await computeDirectorySize(join(dir, 'missing')), null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('guards cache clearing against unrelated roots', async () => {
    assert.throws(() => assertClearableCacheDir('/data'), Error);
    assert.throws(() => assertClearableCacheDir('relative/path'), Error);
    const home = await import('node:os').then((os) => os.homedir());
    assert.throws(() => assertClearableCacheDir(home), Error);
    // Shallow home paths are too broad to wipe even though they exist.
    assert.throws(() => assertClearableCacheDir(join(home, 'Library', 'Caches')), Error);
    assert.throws(() => assertClearableCacheDir(join(home, '.cache')), Error);
    // A deep cache or an explicitly named model directory is fine.
    assert.doesNotThrow(() => assertClearableCacheDir(join(home, '.cache', 'docling', 'models')));
    assert.doesNotThrow(() => assertClearableCacheDir(join(home, 'mineru-models')));

    const cacheDir = join(tmpdir(), 'fe-cache-models');
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'model.bin'), 'xx');
    await clearCacheDirectory(cacheDir);
    assert.deepEqual(await readdir(cacheDir), []);
  });
});

describe('ai-text storage: reveal commands', () => {
  it('builds the platform opener', () => {
    assert.deepEqual(buildRevealCommand('darwin', '/tmp/x'), {
      command: 'open',
      args: ['-R', '/tmp/x'],
    });
    assert.deepEqual(buildRevealCommand('win32', 'C:\\x'), {
      command: 'explorer',
      args: ['/select,C:\\x'],
    });
    assert.deepEqual(buildRevealCommand('linux', '/tmp/x'), {
      command: 'xdg-open',
      args: ['/tmp/x'],
    });
  });
});
