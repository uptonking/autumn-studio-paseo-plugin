import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileNodeSchema,
  getFileTree,
  getFileContent,
  saveFileContent,
  getPdfWasm,
  getXlsxWasm,
  autumnStudioSettings,
  autumnStudioSettingsSchema,
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  DEFAULT_TEXT_VIEWER_SETTINGS,
  DEFAULT_XLSX_SETTINGS,
  DEFAULT_DOCX_SETTINGS,
  getTextViewerSettings,
  withTextViewerSettings,
  getFormatBehaviorConfig,
  withFormatBehaviorConfig,
  toPdfViewerZoom,
  toXlsxViewerZoom,
} from '../shared/contracts.ts';

describe('contracts: fileNodeSchema', () => {
  it('parses valid folder node with nested children', () => {
    const raw = {
      kind: 'folder',
      path: '/',
      name: 'root',
      children: [
        {
          kind: 'folder',
          path: 'src/',
          name: 'src',
          children: [
            {
              kind: 'file',
              path: 'src/index.ts',
              name: 'index.ts',
              size: 1024,
              mtime: 1700000000000,
              contentType: 'text/typescript',
            },
          ],
        },
      ],
    };
    const parsed = fileNodeSchema.parse(raw);
    assert.deepEqual(parsed, raw);
  });

  it('parses file node without optional contentType', () => {
    const raw = {
      kind: 'file',
      path: 'notes.txt',
      name: 'notes.txt',
      size: 42,
      mtime: 1700000000000,
    };
    const parsed = fileNodeSchema.parse(raw);
    assert.deepEqual(parsed, raw);
  });

  it('rejects node with invalid kind', () => {
    const raw = {
      kind: 'symlink',
      path: 'link',
      name: 'link',
    };
    assert.throws(() => fileNodeSchema.parse(raw));
  });

  it('rejects file node with missing size or mtime', () => {
    assert.throws(() =>
      fileNodeSchema.parse({
        kind: 'file',
        path: 'test.txt',
        name: 'test.txt',
      }),
    );
  });
});

describe('contracts: getFileTree RPC', () => {
  it('validates input workspaceId', () => {
    assert.equal(getFileTree.input.parse({ workspaceId: 'ws-test' }).workspaceId, 'ws-test');
    assert.throws(() => getFileTree.input.parse({}));
    assert.throws(() => getFileTree.input.parse({ workspaceId: 123 }));
  });

  it('validates output structure with tree and truncated flag', () => {
    const validOutput = {
      tree: { kind: 'folder', path: '/', name: 'ws', children: [] },
      truncated: false,
    };
    const parsed = getFileTree.output.parse(validOutput);
    assert.equal(parsed.truncated, false);
    assert.equal(parsed.tree.kind, 'folder');

    assert.throws(() => getFileTree.output.parse({ tree: validOutput.tree }));
  });
});

describe('contracts: getFileContent RPC', () => {
  it('validates input workspaceId and relPath', () => {
    const input = { workspaceId: 'ws-1', relPath: 'docs/spec.pdf' };
    assert.deepEqual(getFileContent.input.parse(input), input);
    assert.throws(() => getFileContent.input.parse({ workspaceId: 'ws-1' }));
  });

  it('validates output dataUri', () => {
    const output = { dataUri: 'data:application/pdf;base64,JVBERi0xLjQK' };
    assert.deepEqual(getFileContent.output.parse(output), output);
    assert.throws(() => getFileContent.output.parse({}));
  });
});

describe('contracts: saveFileContent RPC', () => {
  it('validates input workspaceId, relPath, content, and encoding', () => {
    const input = {
      workspaceId: 'ws-1',
      relPath: 'reports/budget.xlsx',
      content: 'UEsDBBQAAAA=',
      encoding: 'base64' as const,
    };
    assert.deepEqual(saveFileContent.input.parse(input), input);
    assert.throws(() =>
      saveFileContent.input.parse({
        workspaceId: 'ws-1',
        relPath: 'reports/budget.xlsx',
        content: 'abc',
        encoding: 'invalid',
      }),
    );
  });

  it('validates output path, size, and mtime', () => {
    const output = {
      path: 'reports/budget.xlsx',
      size: 4096,
      mtime: 1700000001000,
    };
    assert.deepEqual(saveFileContent.output.parse(output), output);
    assert.throws(() => saveFileContent.output.parse({ path: 'a' }));
  });
});

describe('contracts: getPdfWasm and getXlsxWasm RPCs', () => {
  it('accepts empty object input', () => {
    assert.deepEqual(getPdfWasm.input.parse({}), {});
    assert.deepEqual(getXlsxWasm.input.parse({}), {});
  });

  it('validates output dataUri', () => {
    const output = { dataUri: 'data:application/wasm;base64,AGFzbQEAAAA=' };
    assert.deepEqual(getPdfWasm.output.parse(output), output);
    assert.deepEqual(getXlsxWasm.output.parse(output), output);
    assert.throws(() => getPdfWasm.output.parse({}));
    assert.throws(() => getXlsxWasm.output.parse({}));
  });
});

describe('contracts: autumnStudioSettings', () => {
  it('parses empty object into default settings', () => {
    const parsed = autumnStudioSettingsSchema.parse({});
    assert.deepEqual(parsed, DEFAULT_AUTUMN_STUDIO_SETTINGS);
    assert.equal(parsed.general.enabled, true);
    assert.equal(parsed.general.fileOpenMode, 'in-place');
    assert.equal(parsed.general.maxOpenTabs, 8);
    assert.equal(parsed.general.defaultViewMode, 'list');
    assert.equal(parsed.general.autoSaveEdits, true);
    assert.equal(parsed.general.fileTreeDeprecationDismissed, false);
    assert.equal(parsed.pdf.defaultOpenBehavior, 'viewer');
    assert.equal(parsed.pdf.defaultViewer, 'embedpdf-viewer');
    assert.equal(parsed.pdf.defaultEditor, 'embedpdf-editor');
    assert.equal(parsed.pdf.showThumbnailsByDefault, false);
    assert.equal(parsed.pdf.defaultZoom, 'fit-width');
    assert.equal(parsed.pdf.showRotateControls, true);
    assert.equal(parsed.pdf.showDownloadButton, true);
    assert.deepEqual(parsed.xlsx, DEFAULT_XLSX_SETTINGS);
    assert.deepEqual(parsed.docx, DEFAULT_DOCX_SETTINGS);
    assert.deepEqual(parsed.text, DEFAULT_TEXT_VIEWER_SETTINGS);
  });

  it('validates custom general, pdf, xlsx, text settings and format extensions', () => {
    const custom = {
      general: {
        enabled: false,
        fileOpenMode: 'new-tab' as const,
        maxOpenTabs: 12,
        defaultViewMode: 'gallery' as const,
        autoSaveEdits: false,
        fileTreeDeprecationDismissed: false,
      },
      pdf: {
        defaultOpenBehavior: 'editor' as const,
        defaultViewer: 'embedpdf-viewer',
        defaultEditor: 'embedpdf-editor',
        showThumbnailsByDefault: true,
        defaultZoom: '125' as const,
        showRotateControls: false,
        showDownloadButton: false,
      },
      xlsx: {
        defaultOpenBehavior: 'editor' as const,
        defaultViewer: 'extend-xlsx-viewer',
        defaultEditor: 'extend-xlsx-editor',
        defaultZoom: '150' as const,
        showFormulaBar: false,
        showHiddenSheets: true,
        showDownloadButton: false,
      },
      text: {
        defaultOpenBehavior: 'editor' as const,
        defaultViewer: 'code-text-viewer',
        defaultEditor: 'code-text-editor',
        showLineNumbers: false,
        wordWrap: false,
      },
      docx: {
        defaultOpenBehavior: 'viewer' as const,
        defaultViewer: 'begonia-docx-viewer',
        defaultEditor: 'begonia-docx-editor',
        defaultFlowMode: 'web' as const,
        showDownloadButton: false,
      },
      formats: {
        markdown: { previewByDefault: true },
      },
      aiText: DEFAULT_AUTUMN_STUDIO_SETTINGS.aiText,
    };
    const parsed = autumnStudioSettingsSchema.parse(custom);
    assert.deepEqual(parsed, custom);
    assert.equal(autumnStudioSettings.id, 'preferences');
    assert.equal(autumnStudioSettings.scope, 'host');
    assert.equal(autumnStudioSettings.version, 4);
  });

  it('maps PdfDefaultZoom and XlsxDefaultZoom values', () => {
    assert.equal(toPdfViewerZoom('fit-width'), 'fit-width');
    assert.equal(toPdfViewerZoom('fit-page'), 'fit-page');
    assert.equal(toPdfViewerZoom('100'), 1);
    assert.equal(toPdfViewerZoom('125'), 1.25);
    assert.equal(toPdfViewerZoom('150'), 1.5);

    assert.equal(toXlsxViewerZoom('75'), 75);
    assert.equal(toXlsxViewerZoom('100'), 100);
    assert.equal(toXlsxViewerZoom('125'), 125);
    assert.equal(toXlsxViewerZoom('150'), 150);
  });

  it('reads and updates Code & Text and per-format open behavior settings', () => {
    const defaults = autumnStudioSettingsSchema.parse({});
    assert.deepEqual(getTextViewerSettings(defaults), DEFAULT_TEXT_VIEWER_SETTINGS);

    const updated = withTextViewerSettings(defaults, {
      defaultOpenBehavior: 'editor',
      showLineNumbers: false,
      wordWrap: false,
    });
    assert.deepEqual(getTextViewerSettings(updated), {
      defaultOpenBehavior: 'editor',
      defaultViewer: 'code-text-viewer',
      defaultEditor: 'code-text-editor',
      showLineNumbers: false,
      wordWrap: false,
    });

    const withXlsxEditor = withFormatBehaviorConfig(updated, 'xlsx', {
      defaultOpenBehavior: 'editor',
    });
    assert.equal(getFormatBehaviorConfig(withXlsxEditor, 'xlsx').defaultOpenBehavior, 'editor');

    const withPptxEditor = withFormatBehaviorConfig(withXlsxEditor, 'pptx', {
      defaultOpenBehavior: 'editor',
      defaultViewer: 'custom-pptx-viewer',
      defaultEditor: 'custom-pptx-editor',
    });
    assert.deepEqual(getFormatBehaviorConfig(withPptxEditor, 'pptx'), {
      defaultOpenBehavior: 'editor',
      defaultViewer: 'custom-pptx-viewer',
      defaultEditor: 'custom-pptx-editor',
    });
  });
});
