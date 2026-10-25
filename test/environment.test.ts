import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectInstallKind,
  parseModelRepos,
  parseModelsShowOutput,
  parseModelsVerifyOutput,
} from '../server/ai-text/engines/mineru/environment.ts';

/**
 * Captured from `mineru-kit models show` on MinerU 4.0.12 with no models
 * installed. The path sits on the line after the repo name.
 */
const MODELS_SHOW = `mineru-kit model configuration
model.base_dir: /Users/yaoo/.mineru/models
model.source: auto
Effective small backend: torch
Effective VLM engine: llama-cpp
Repos:
  MinerU-4_models_torch: missing 
  (/Users/yaoo/.mineru/models/MinerU-4_models_torch)
  MinerU2.5-Pro-2605-1.2B-GGUF: missing 
  (/Users/yaoo/.mineru/models/MinerU2.5-Pro-2605-1.2B-GGUF)
Model tiers:
  basic: MinerU-4_models_torch
  standard: MinerU-4_models_torch, MinerU2.5-Pro-2605-1.2B-GGUF
`;

const MODELS_SHOW_READY = `model.base_dir: /models
model.source: auto
Effective small backend: torch
Effective VLM engine: llama-cpp
Repos:
  MinerU-4_models_torch: ready (/models/MinerU-4_models_torch)
  MinerU2.5-Pro-2605-1.2B-GGUF: ready (/models/MinerU2.5-Pro-2605-1.2B-GGUF)
Model tiers:
  standard: MinerU-4_models_torch, MinerU2.5-Pro-2605-1.2B-GGUF
`;

const MODELS_VERIFY = `MinerU-4_models_torch: missing key paths: Layout/PP-DocLayoutV2, 
MFR/pp_formulanet_plus_m/PP-FormulaNet_plus-M.pth, OCR/PP-OCRv5_server_det.pdmodel
MinerU2.5-Pro-2605-1.2B-GGUF: missing key paths: .mineru_complete
`;

describe('MinerU environment parsing', () => {
  it('reads repos whose path is on the next parenthesized line', () => {
    const repos = parseModelRepos(MODELS_SHOW);
    assert.deepEqual(
      repos.map((repo) => repo.name),
      ['MinerU-4_models_torch', 'MinerU2.5-Pro-2605-1.2B-GGUF'],
    );
    assert.equal(repos[0]?.ready, false);
    assert.equal(repos[0]?.path, '/Users/yaoo/.mineru/models/MinerU-4_models_torch');
  });

  it('reports a tier as not ready when any member repo is missing', () => {
    const models = parseModelsShowOutput(MODELS_SHOW, 'standard');
    assert.ok(models);
    assert.equal(models.tierReady, false);
    assert.equal(models.baseDir, '/Users/yaoo/.mineru/models');
    assert.equal(models.source, 'auto');
    assert.equal(models.smallBackend, 'torch');
    assert.equal(models.vlmEngine, 'llama-cpp');
    assert.equal(models.repos.length, 2);
  });

  it('reports a tier as ready when every listed repo is ready', () => {
    const models = parseModelsShowOutput(MODELS_SHOW_READY, 'standard');
    assert.ok(models);
    assert.equal(models.tierReady, true);
    assert.equal(models.repos[0]?.path, '/models/MinerU-4_models_torch');
  });

  it('collects missing paths that wrap onto continuation lines', () => {
    const repos = parseModelsVerifyOutput(MODELS_VERIFY);
    assert.equal(repos.length, 2);
    assert.deepEqual(repos[0]?.missingPaths, [
      'Layout/PP-DocLayoutV2',
      'MFR/pp_formulanet_plus_m/PP-FormulaNet_plus-M.pth',
      'OCR/PP-OCRv5_server_det.pdmodel',
    ]);
    assert.deepEqual(repos[1]?.missingPaths, ['.mineru_complete']);
  });

  it('returns null when the output carries no model information', () => {
    assert.equal(parseModelsShowOutput('command failed\n', 'standard'), null);
    assert.deepEqual(parseModelsVerifyOutput('command failed\n'), []);
  });
});

describe('MinerU install kind detection', () => {
  let root: string;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'paseo-mineru-install-'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('follows the ~/.local/bin shim into the uv tool environment', async () => {
    const target = join(root, 'uv', 'tools', 'mineru', 'bin', 'mineru-kit');
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, '#!/bin/sh\n');
    const shim = join(root, 'local', 'bin', 'mineru-kit');
    await mkdir(join(shim, '..'), { recursive: true });
    await symlink(target, shim);

    assert.equal(await detectInstallKind(shim), 'uv-tool');
  });

  it('classifies a standalone binary as a pip install', async () => {
    const path = join(root, 'venv', 'bin', 'mineru-kit');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '#!/bin/sh\n');

    assert.equal(await detectInstallKind(path), 'pip');
  });

  it('returns unknown when the binary was not found', async () => {
    assert.equal(await detectInstallKind(null), 'unknown');
  });
});
