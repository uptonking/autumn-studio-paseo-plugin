import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_AI_TEXT_EXTRACTION,
  type AiTextExtractionSettings,
} from '../shared/ai-text/profiles.ts';
import { DEFAULT_DOCLING_CONFIG, type DoclingConfig } from '../shared/ai-text/engine-configs.ts';
import { buildDoclingArgs, parseWithDocling } from '../server/ai-text/engines/docling/adapter.ts';
import {
  clearDoclingEnvironmentCache,
  getDoclingEnvironment,
  isDoclingVersionSupported,
  parseDoclingVersion,
} from '../server/ai-text/engines/docling/environment.ts';

function build(
  configOverrides: Partial<DoclingConfig> = {},
  extractionOverrides: Partial<AiTextExtractionSettings> = {},
  route = 'standard',
): string[] {
  return buildDoclingArgs({
    filePath: '/docs/guide.pdf',
    outputDir: '/tmp/docling-out',
    route,
    config: { ...DEFAULT_DOCLING_CONFIG, ...configOverrides },
    extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, ...extractionOverrides },
  });
}

function pairValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

describe('docling: buildDoclingArgs', () => {
  it('builds the standard pipeline with Markdown and JSON output', () => {
    const args = build();
    assert.deepEqual(args.slice(0, 5), ['/docs/guide.pdf', '--from', 'pdf', '--to', 'md']);
    assert.equal(args.filter((arg) => arg === '--to').length, 2);
    assert.equal(pairValue(args, '--output'), '/tmp/docling-out');
    assert.equal(pairValue(args, '--image-export-mode'), 'referenced');
    assert.equal(pairValue(args, '--pipeline'), 'standard');
    assert.ok(args.includes('--ocr'));
    assert.equal(pairValue(args, '--table-mode'), 'accurate');
    assert.ok(args.includes('--enrich-formula'));
    assert.ok(!args.includes('--vlm-model'));
    // Defaults leave device and thread count to Docling.
    assert.ok(!args.includes('--device'));
    assert.ok(!args.includes('--num-threads'));
    assert.equal(pairValue(args, '--document-timeout'), '900');
  });

  it('omits OCR engine and languages when OCR is disabled', () => {
    const args = build({ ocrEngine: 'easyocr', ocrLangs: 'en,de' }, { ocr: false });
    assert.ok(args.includes('--no-ocr'));
    assert.ok(!args.includes('--ocr'));
    assert.ok(!args.includes('--ocr-engine'));
    assert.ok(!args.includes('--ocr-lang'));
    // Table extraction still runs in the standard pipeline.
    assert.equal(pairValue(args, '--table-mode'), 'accurate');
  });

  it('passes one --ocr-lang per language tag', () => {
    const args = build({ ocrEngine: 'tesserocr', ocrLangs: 'en; de, fr' });
    assert.equal(pairValue(args, '--ocr-engine'), 'tesserocr');
    const langs = args.flatMap((arg, index) => (arg === '--ocr-lang' ? [args[index + 1]] : []));
    assert.deepEqual(langs, ['en', 'de', 'fr']);
  });

  it('switches to the VLM pipeline with the model and drops standard-only flags', () => {
    const args = build(
      { vlmModel: 'smoldocling', ocrEngine: 'easyocr', tableMode: 'fast' },
      { ocr: true, formula: true },
      'vlm',
    );
    assert.equal(pairValue(args, '--pipeline'), 'vlm');
    assert.equal(pairValue(args, '--vlm-model'), 'smoldocling');
    assert.ok(!args.includes('--ocr'));
    assert.ok(!args.includes('--no-ocr'));
    assert.ok(!args.includes('--ocr-engine'));
    assert.ok(!args.includes('--table-mode'));
    assert.ok(!args.includes('--enrich-formula'));
  });

  it('falls back to the default VLM model when the field is empty', () => {
    const args = build({ vlmModel: '  ' }, {}, 'vlm');
    assert.equal(pairValue(args, '--vlm-model'), 'granite_docling');
  });

  it('passes device, threads, artifacts, and tokenized extra arguments', () => {
    const args = build({
      device: 'mps',
      numThreads: 4,
      artifactsPath: '/models/docling',
      extraArgs: '--foo "two words" --bar=1',
    });
    assert.equal(pairValue(args, '--device'), 'mps');
    assert.equal(pairValue(args, '--num-threads'), '4');
    assert.equal(pairValue(args, '--artifacts-path'), '/models/docling');
    assert.deepEqual(args.slice(-3), ['--foo', 'two words', '--bar=1']);
  });

  it('only enables formula enrichment when extraction asks for it', () => {
    const args = build({}, { formula: false });
    assert.ok(!args.includes('--enrich-formula'));
  });

  it('clamps the document timeout to at least 30 seconds', () => {
    const args = build({}, { timeoutMs: 10_000 });
    assert.equal(pairValue(args, '--document-timeout'), '30');
  });

  it('rejects page ranges because Docling has no page-range route', () => {
    assert.throws(() => build({}, { pages: '1-3' }), /do not support page ranges/);
  });

  it('rejects page ranges for the VLM route too', () => {
    assert.throws(() => build({}, { pages: '2' }, 'vlm'), /do not support page ranges/);
  });

  it('ignores unknown routes and uses the standard pipeline', () => {
    const args = build({}, {}, 'something-else');
    assert.equal(pairValue(args, '--pipeline'), 'standard');
  });
});

const FAKE_DOCLING_SCRIPT = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Docling version: 2.53.0"
  exit 0
fi
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--output" ]; then out="$arg"; fi
  prev="$arg"
done
if [ -z "$out" ]; then
  echo "missing --output" >&2
  exit 2
fi
mkdir -p "$out/artifacts"
printf 'PNG' > "$out/artifacts/image_000000.png"
cat > "$out/guide.md" <<'MARKDOWN'
# Guide

![figure](artifacts/image_000000.png)
MARKDOWN
cat > "$out/guide.json" <<'JSON'
{
  "schema_name": "DoclingDocument",
  "pages": { "1": { "size": { "width": 600, "height": 800 } } },
  "body": {
    "self_ref": "#/body",
    "children": [{ "$ref": "#/texts/0" }, { "$ref": "#/pictures/0" }]
  },
  "texts": [
    {
      "self_ref": "#/texts/0",
      "label": "text",
      "text": "Hello",
      "prov": [
        {
          "page_no": 1,
          "bbox": { "l": 10, "t": 10, "r": 100, "b": 30, "coord_origin": "TOPLEFT" }
        }
      ]
    }
  ],
  "pictures": [
    {
      "self_ref": "#/pictures/0",
      "label": "picture",
      "prov": [
        {
          "page_no": 1,
          "bbox": { "l": 10, "t": 40, "r": 100, "b": 80, "coord_origin": "TOPLEFT" }
        }
      ],
      "image": { "uri": "artifacts/image_000000.png" }
    }
  ]
}
JSON
`;

async function fakeDoclingWorkspace(): Promise<{
  dir: string;
  config: DoclingConfig;
  filePath: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'paseo-docling-test-'));
  const bin = join(dir, 'docling');
  await writeFile(bin, FAKE_DOCLING_SCRIPT, { mode: 0o755 });
  await chmod(bin, 0o755);
  const filePath = join(dir, 'guide.pdf');
  await writeFile(filePath, '%PDF-1.4');
  clearDoclingEnvironmentCache();
  return {
    dir,
    filePath,
    config: { ...DEFAULT_DOCLING_CONFIG, doclingCommand: bin },
  };
}

describe('docling: parseWithDocling layout toggle', () => {
  it('returns layout and copied images when layout is enabled', async () => {
    const workspace = await fakeDoclingWorkspace();
    try {
      const result = await parseWithDocling({
        filePath: workspace.filePath,
        fileName: 'guide.pdf',
        route: 'standard',
        config: workspace.config,
        extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, layout: true },
      });
      assert.ok(result.layout);
      assert.equal(result.layout?.blockCount, 2);
      assert.deepEqual(
        result.assets.map((asset) => asset.path),
        ['images/image_000000.png'],
      );
      assert.match(result.markdown, /images\/image_000000\.png/);
    } finally {
      await rm(workspace.dir, { recursive: true, force: true });
    }
  });

  it('stores Markdown and images without geometry when layout is off', async () => {
    const workspace = await fakeDoclingWorkspace();
    try {
      const result = await parseWithDocling({
        filePath: workspace.filePath,
        fileName: 'guide.pdf',
        route: 'standard',
        config: workspace.config,
        extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, layout: false },
      });
      assert.equal(result.layout, null);
      assert.deepEqual(
        result.assets.map((asset) => asset.path),
        ['images/image_000000.png'],
      );
      assert.match(result.markdown, /images\/image_000000\.png/);
    } finally {
      await rm(workspace.dir, { recursive: true, force: true });
    }
  });
});

describe('docling: environment status', () => {
  it('reports unknown when the installed CLI has no readable version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paseo-docling-test-'));
    try {
      const bin = join(dir, 'docling');
      await writeFile(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      await chmod(bin, 0o755);
      clearDoclingEnvironmentCache();
      const environment = await getDoclingEnvironment({
        config: { ...DEFAULT_DOCLING_CONFIG, doclingCommand: bin },
        refresh: true,
      });
      assert.equal(environment.status, 'unknown');
      const component = environment.components.find((item) => item.id === 'docling');
      assert.equal(component?.status, 'unknown');
      assert.ok(environment.recommendations.some((item) => item.includes('version')));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports needs-setup for a version below the minimum', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paseo-docling-test-'));
    try {
      const bin = join(dir, 'docling');
      await writeFile(bin, '#!/bin/sh\necho "Docling version: 2.10.0"\n', {
        mode: 0o755,
      });
      await chmod(bin, 0o755);
      clearDoclingEnvironmentCache();
      const environment = await getDoclingEnvironment({
        config: { ...DEFAULT_DOCLING_CONFIG, doclingCommand: bin },
        refresh: true,
      });
      assert.equal(environment.status, 'needs-setup');
      assert.ok(environment.recommendations.some((item) => item.includes('older than')));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('docling: version detection', () => {
  it('parses the version banner printed by docling --version', () => {
    assert.equal(parseDoclingVersion('Docling version: 2.53.0'), '2.53.0');
    assert.equal(parseDoclingVersion('docling 1.0\nDocling version: 2.142.1\n'), '2.142.1');
    assert.equal(parseDoclingVersion('Docling version: 2.50'), '2.50');
  });

  it('returns null when the banner is missing', () => {
    assert.equal(parseDoclingVersion('docling, version 2.1.0'), null);
    assert.equal(parseDoclingVersion(''), null);
  });

  it('requires the supported minimum version', () => {
    assert.equal(isDoclingVersionSupported('2.50.0'), true);
    assert.equal(isDoclingVersionSupported('2.53.0'), true);
    assert.equal(isDoclingVersionSupported('3.0.0'), true);
    assert.equal(isDoclingVersionSupported('2.49.9'), false);
    assert.equal(isDoclingVersionSupported('1.9.0'), false);
    assert.equal(isDoclingVersionSupported(null), false);
  });
});
