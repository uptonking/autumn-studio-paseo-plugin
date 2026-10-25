import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  DEFAULT_DOCX_SETTINGS,
  autumnStudioSettings,
  autumnStudioSettingsSchema,
  docxSettingsSchema,
  getDocxSettings,
  getFormatBehaviorConfig,
  migrateAutumnStudioSettings,
  withDocxSettings,
  withFormatBehaviorConfig,
} from '../shared/settings.ts';

describe('docx settings: schema', () => {
  it('defaults to the Begonia editor with the paginated layout', () => {
    const parsed = docxSettingsSchema.parse({});
    assert.deepEqual(parsed, DEFAULT_DOCX_SETTINGS);
    // Docx is the only format whose default open behavior is the editor.
    assert.equal(parsed.defaultOpenBehavior, 'editor');
    assert.equal(parsed.defaultViewer, 'begonia-docx-viewer');
    assert.equal(parsed.defaultEditor, 'begonia-docx-editor');
    assert.equal(parsed.defaultFlowMode, 'paginated');
    assert.equal(parsed.showDownloadButton, true);
  });

  it('parses empty settings into the dedicated docx block', () => {
    const parsed = autumnStudioSettingsSchema.parse({});
    assert.deepEqual(parsed.docx, DEFAULT_DOCX_SETTINGS);
    assert.deepEqual(parsed, DEFAULT_AUTUMN_STUDIO_SETTINGS);
  });

  it('rejects unknown flow modes', () => {
    assert.throws(() => docxSettingsSchema.parse({ defaultFlowMode: 'book' }));
  });

  it('exposes the current settings schema version', () => {
    assert.equal(autumnStudioSettings.version, 3);
  });
});

describe('docx settings: migration', () => {
  it('passes stored v2 values through so zod defaults fill the docx block', () => {
    const storedV2 = { general: { enabled: true }, formats: { docx: { legacy: true } } };
    assert.deepEqual(migrateAutumnStudioSettings(storedV2, 2), storedV2);
    const parsed = autumnStudioSettingsSchema.parse(migrateAutumnStudioSettings(storedV2, 2));
    assert.deepEqual(parsed.docx, DEFAULT_DOCX_SETTINGS);
  });

  it('runs the v1 migration for older stored versions', () => {
    const storedV1 = { aiText: { profiles: [{ id: '', name: 'broken' }] } };
    const migrated = migrateAutumnStudioSettings(storedV1, 1);
    assert.notDeepEqual(migrated, storedV1);
    assert.ok(Array.isArray((migrated as { aiText: { profiles: unknown[] } }).aiText.profiles));
  });
});

describe('docx settings: behavior config', () => {
  it('reads the dedicated docx block instead of the generic formats map', () => {
    const values = autumnStudioSettingsSchema.parse({
      docx: { defaultOpenBehavior: 'viewer' },
      formats: { docx: { defaultOpenBehavior: 'editor' } },
    });
    assert.deepEqual(getFormatBehaviorConfig(values, 'docx'), {
      defaultOpenBehavior: 'viewer',
      defaultViewer: 'begonia-docx-viewer',
      defaultEditor: 'begonia-docx-editor',
    });
  });

  it('defaults to editor when no docx settings are stored', () => {
    const values = autumnStudioSettingsSchema.parse({});
    assert.equal(getFormatBehaviorConfig(values, 'docx').defaultOpenBehavior, 'editor');
  });

  it('updates the dedicated docx block and leaves the formats map untouched', () => {
    const values = autumnStudioSettingsSchema.parse({ formats: { docx: { legacy: true } } });
    const updated = withFormatBehaviorConfig(values, 'docx', {
      defaultOpenBehavior: 'viewer',
      defaultEditor: 'custom-docx-editor',
    });
    assert.equal(updated.docx.defaultOpenBehavior, 'viewer');
    assert.equal(updated.docx.defaultEditor, 'custom-docx-editor');
    assert.deepEqual(updated.formats.docx, { legacy: true });
  });

  it('merges partial docx settings over defaults', () => {
    const values = autumnStudioSettingsSchema.parse({});
    const updated = withDocxSettings(values, { defaultFlowMode: 'web' });
    assert.deepEqual(getDocxSettings(updated), {
      ...DEFAULT_DOCX_SETTINGS,
      defaultFlowMode: 'web',
    });
    // The input values object is not mutated.
    assert.equal(values.docx.defaultFlowMode, 'paginated');
  });
});
