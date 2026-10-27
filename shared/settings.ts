import { defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';
import {
  aiTextSettingsSchema,
  createDefaultAiTextSettings,
  migrateAutumnStudioSettingsV1,
  migrateAutumnStudioSettingsV3,
  type AiTextSettings,
} from './ai-text/settings.ts';
import {
  aiTextProfileSchema,
  createDefaultAiTextProfiles,
  isValidAiTextProfileId,
  normalizeAiTextProfile,
  type AiTextProfile,
} from './ai-text/profiles.ts';
import { normalizeAiTextOutputRootDir } from './ai-text/output-root.ts';

export * from './ai-text/settings.ts';

export const fileOpenModeSchema = z.enum(['in-place', 'dialog', 'new-tab']);
export type FileOpenMode = z.infer<typeof fileOpenModeSchema>;

export const explorerViewModeSchema = z.enum(['list', 'icons', 'columns', 'gallery']);
export type ExplorerViewMode = z.infer<typeof explorerViewModeSchema>;

export const fileFormatOpenBehaviorSchema = z.enum(['viewer', 'editor']);
export type FileFormatOpenBehavior = z.infer<typeof fileFormatOpenBehaviorSchema>;

export const pdfDefaultZoomSchema = z.enum(['fit-width', 'fit-page', '100', '125', '150']);
export type PdfDefaultZoom = z.infer<typeof pdfDefaultZoomSchema>;

export const xlsxDefaultZoomSchema = z.enum(['50', '75', '100', '125', '150', '200']);
export type XlsxDefaultZoom = z.infer<typeof xlsxDefaultZoomSchema>;

export const docxFlowModeSchema = z.enum(['paginated', 'web']);
export type DocxFlowMode = z.infer<typeof docxFlowModeSchema>;

export const DEFAULT_MAX_OPEN_TABS = 8;

export const generalSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  fileOpenMode: fileOpenModeSchema.default('in-place'),
  maxOpenTabs: z.number().int().min(1).max(50).default(DEFAULT_MAX_OPEN_TABS),
  defaultViewMode: explorerViewModeSchema.default('list'),
  autoSaveEdits: z.boolean().default(true),
  fileTreeDeprecationDismissed: z.boolean().default(false),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const pdfSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default('viewer'),
  defaultViewer: z.string().default('embedpdf-viewer'),
  defaultEditor: z.string().default('embedpdf-editor'),
  showThumbnailsByDefault: z.boolean().default(false),
  defaultZoom: pdfDefaultZoomSchema.default('fit-width'),
  showRotateControls: z.boolean().default(true),
  showDownloadButton: z.boolean().default(true),
});
export type PdfSettings = z.infer<typeof pdfSettingsSchema>;

export const xlsxSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default('viewer'),
  defaultViewer: z.string().default('extend-xlsx-viewer'),
  defaultEditor: z.string().default('extend-xlsx-editor'),
  defaultZoom: xlsxDefaultZoomSchema.default('100'),
  showFormulaBar: z.boolean().default(true),
  showHiddenSheets: z.boolean().default(false),
  showDownloadButton: z.boolean().default(true),
});
export type XlsxSettings = z.infer<typeof xlsxSettingsSchema>;

export const docxSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default('viewer'),
  defaultViewer: z.string().default('begonia-docx-viewer'),
  defaultEditor: z.string().default('begonia-docx-editor'),
  defaultFlowMode: docxFlowModeSchema.default('paginated'),
  showDownloadButton: z.boolean().default(true),
});
export type DocxSettings = z.infer<typeof docxSettingsSchema>;

export const textSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default('viewer'),
  defaultViewer: z.string().default('code-text-viewer'),
  defaultEditor: z.string().default('code-text-editor'),
  showLineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
});
export type TextViewerSettings = z.infer<typeof textSettingsSchema>;

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  enabled: true,
  fileOpenMode: 'in-place',
  maxOpenTabs: DEFAULT_MAX_OPEN_TABS,
  defaultViewMode: 'list',
  autoSaveEdits: true,
  fileTreeDeprecationDismissed: false,
};

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  defaultOpenBehavior: 'viewer',
  defaultViewer: 'embedpdf-viewer',
  defaultEditor: 'embedpdf-editor',
  showThumbnailsByDefault: false,
  defaultZoom: 'fit-width',
  showRotateControls: true,
  showDownloadButton: true,
};

export const DEFAULT_XLSX_SETTINGS: XlsxSettings = {
  defaultOpenBehavior: 'viewer',
  defaultViewer: 'extend-xlsx-viewer',
  defaultEditor: 'extend-xlsx-editor',
  defaultZoom: '100',
  showFormulaBar: true,
  showHiddenSheets: false,
  showDownloadButton: true,
};

export const DEFAULT_DOCX_SETTINGS: DocxSettings = {
  defaultOpenBehavior: 'viewer',
  defaultViewer: 'begonia-docx-viewer',
  defaultEditor: 'begonia-docx-editor',
  defaultFlowMode: 'paginated',
  showDownloadButton: true,
};

export const DEFAULT_TEXT_VIEWER_SETTINGS: TextViewerSettings = {
  defaultOpenBehavior: 'viewer',
  defaultViewer: 'code-text-viewer',
  defaultEditor: 'code-text-editor',
  showLineNumbers: true,
  wordWrap: true,
};

export const autumnStudioSettingsSchema = z.object({
  general: generalSettingsSchema.default(DEFAULT_GENERAL_SETTINGS),
  pdf: pdfSettingsSchema.default(DEFAULT_PDF_SETTINGS),
  xlsx: xlsxSettingsSchema.default(DEFAULT_XLSX_SETTINGS),
  docx: docxSettingsSchema.default(DEFAULT_DOCX_SETTINGS),
  text: textSettingsSchema.default(DEFAULT_TEXT_VIEWER_SETTINGS),
  aiText: aiTextSettingsSchema.default(() => createDefaultAiTextSettings()),
  /**
   * Extensible map for additional file format viewers/editors
   * (e.g. pptx, image, markdown).
   */
  formats: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type AutumnStudioSettingsValues = z.infer<typeof autumnStudioSettingsSchema>;

export const DEFAULT_AUTUMN_STUDIO_SETTINGS: AutumnStudioSettingsValues = {
  general: DEFAULT_GENERAL_SETTINGS,
  pdf: DEFAULT_PDF_SETTINGS,
  xlsx: DEFAULT_XLSX_SETTINGS,
  docx: DEFAULT_DOCX_SETTINGS,
  text: DEFAULT_TEXT_VIEWER_SETTINGS,
  aiText: createDefaultAiTextSettings(),
  formats: {},
};

/**
 * Converts a previous stored settings version to the current schema.
 * - v1 → v2: normalize the legacy AI Text block (`migrateAutumnStudioSettingsV1`).
 * - v2 → v3: adds the dedicated `docx` block; the zod schema default fills it,
 *   so no data transformation is required.
 * - v3 → v4: rename the AI Text Paginated Text Doc keys/viewer id to the
 *   Text Pages View names (`migrateAutumnStudioSettingsV3`).
 */
export function migrateAutumnStudioSettings(values: unknown, fromVersion: number): unknown {
  let current = values;
  if (fromVersion < 2) {
    current = migrateAutumnStudioSettingsV1(current);
  }
  if (fromVersion < 4) {
    current = migrateAutumnStudioSettingsV3(current);
  }
  return current;
}

export const autumnStudioSettings = defineSettings({
  id: 'preferences',
  scope: 'host',
  version: 4,
  schema: autumnStudioSettingsSchema,
  migrate: migrateAutumnStudioSettings,
});

export function toPdfViewerZoom(zoom: PdfDefaultZoom): 'fit-width' | 'fit-page' | number {
  switch (zoom) {
    case 'fit-width':
      return 'fit-width';
    case 'fit-page':
      return 'fit-page';
    case '100':
      return 1;
    case '125':
      return 1.25;
    case '150':
      return 1.5;
  }
}

export function toXlsxViewerZoom(zoom: XlsxDefaultZoom): number {
  switch (zoom) {
    case '50':
      return 50;
    case '75':
      return 75;
    case '100':
      return 100;
    case '125':
      return 125;
    case '150':
      return 150;
    case '200':
      return 200;
  }
}

export function getXlsxSettings(
  values: Partial<AutumnStudioSettingsValues> | undefined,
): XlsxSettings {
  return {
    ...DEFAULT_XLSX_SETTINGS,
    ...values?.xlsx,
  };
}

export function withXlsxSettings(
  values: AutumnStudioSettingsValues,
  patch: Partial<XlsxSettings>,
): AutumnStudioSettingsValues {
  return {
    ...values,
    xlsx: {
      ...getXlsxSettings(values),
      ...patch,
    },
  };
}

export function getDocxSettings(
  values: Partial<AutumnStudioSettingsValues> | undefined,
): DocxSettings {
  return {
    ...DEFAULT_DOCX_SETTINGS,
    ...values?.docx,
  };
}

export function withDocxSettings(
  values: AutumnStudioSettingsValues,
  patch: Partial<DocxSettings>,
): AutumnStudioSettingsValues {
  return {
    ...values,
    docx: {
      ...getDocxSettings(values),
      ...patch,
    },
  };
}

export interface FormatBehaviorConfig {
  defaultOpenBehavior: FileFormatOpenBehavior;
  defaultViewer?: string;
  defaultEditor?: string;
}

export function getFormatBehaviorConfig(
  values: Partial<AutumnStudioSettingsValues> | undefined,
  kind: string,
): FormatBehaviorConfig {
  if (kind === 'pdf') {
    const pdf = { ...DEFAULT_PDF_SETTINGS, ...values?.pdf };
    return {
      defaultOpenBehavior: pdf.defaultOpenBehavior,
      defaultViewer: pdf.defaultViewer,
      defaultEditor: pdf.defaultEditor,
    };
  }
  if (kind === 'xlsx') {
    const xlsx = { ...DEFAULT_XLSX_SETTINGS, ...values?.xlsx };
    return {
      defaultOpenBehavior: xlsx.defaultOpenBehavior,
      defaultViewer: xlsx.defaultViewer,
      defaultEditor: xlsx.defaultEditor,
    };
  }
  if (kind === 'docx') {
    const docx = getDocxSettings(values);
    return {
      defaultOpenBehavior: docx.defaultOpenBehavior,
      defaultViewer: docx.defaultViewer,
      defaultEditor: docx.defaultEditor,
    };
  }
  if (kind === 'text') {
    const text = getTextViewerSettings(values);
    return {
      defaultOpenBehavior: text.defaultOpenBehavior,
      defaultViewer: text.defaultViewer,
      defaultEditor: text.defaultEditor,
    };
  }
  const raw = values?.formats?.[kind];
  const behavior = raw?.defaultOpenBehavior === 'editor' ? 'editor' : 'viewer';
  return {
    defaultOpenBehavior: behavior,
    defaultViewer: typeof raw?.defaultViewer === 'string' ? raw.defaultViewer : undefined,
    defaultEditor: typeof raw?.defaultEditor === 'string' ? raw.defaultEditor : undefined,
  };
}

export function withFormatBehaviorConfig(
  values: AutumnStudioSettingsValues,
  kind: string,
  patch: Partial<FormatBehaviorConfig>,
): AutumnStudioSettingsValues {
  if (kind === 'pdf') {
    return {
      ...values,
      pdf: {
        ...DEFAULT_PDF_SETTINGS,
        ...values.pdf,
        ...patch,
      },
    };
  }
  if (kind === 'xlsx') {
    return {
      ...values,
      xlsx: {
        ...DEFAULT_XLSX_SETTINGS,
        ...values.xlsx,
        ...patch,
      },
    };
  }
  if (kind === 'docx') {
    return withDocxSettings(values, patch);
  }
  if (kind === 'text') {
    return withTextViewerSettings(values, patch);
  }
  const current = getFormatBehaviorConfig(values, kind);
  return {
    ...values,
    formats: {
      ...values.formats,
      [kind]: {
        ...values.formats?.[kind],
        ...current,
        ...patch,
      },
    },
  };
}

export function getTextViewerSettings(
  values: Partial<AutumnStudioSettingsValues> | undefined,
): TextViewerSettings {
  return {
    ...DEFAULT_TEXT_VIEWER_SETTINGS,
    ...values?.text,
  };
}

export function withTextViewerSettings(
  values: AutumnStudioSettingsValues,
  patch: Partial<TextViewerSettings>,
): AutumnStudioSettingsValues {
  return {
    ...values,
    text: {
      ...getTextViewerSettings(values),
      ...patch,
    },
  };
}

const aiTextScalarSettingsSchema = aiTextSettingsSchema.omit({
  profiles: true,
});

function normalizeStoredProfiles(rawProfiles: unknown): AiTextProfile[] {
  const defaults = createDefaultAiTextProfiles();
  if (!Array.isArray(rawProfiles)) return defaults;
  const seen = new Set<string>();
  const profiles: AiTextProfile[] = [];
  for (const candidate of rawProfiles) {
    const parsed = aiTextProfileSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const profile = parsed.data;
    if (!isValidAiTextProfileId(profile.id) || seen.has(profile.id)) continue;
    seen.add(profile.id);
    // Filling engine defaults here keeps settings, fingerprints, and the
    // pipeline looking at the same profile shape.
    profiles.push(normalizeAiTextProfile(profile));
  }
  return profiles.length > 0 ? profiles : defaults;
}

export function getAiTextSettings(
  values: Partial<AutumnStudioSettingsValues> | undefined,
): AiTextSettings {
  const raw = values?.aiText;
  const defaults = createDefaultAiTextSettings();
  const scalars = aiTextScalarSettingsSchema.safeParse(raw ?? {});
  const base = scalars.success ? scalars.data : aiTextScalarSettingsSchema.parse({});
  const profiles = normalizeStoredProfiles(
    typeof raw === 'object' && raw !== null ? raw.profiles : undefined,
  );
  const defaultProfileId = profiles.some((profile) => profile.id === base.defaultProfileId)
    ? base.defaultProfileId
    : (profiles[0]?.id ?? defaults.defaultProfileId);
  return {
    ...base,
    // Heal stored values the server would silently replace with the default,
    // so the settings UI and the daemon agree on the resolved folder.
    outputRootDir: normalizeAiTextOutputRootDir(base.outputRootDir),
    profiles,
    defaultProfileId,
  };
}

export function withAiTextSettings(
  values: AutumnStudioSettingsValues,
  patch: Partial<AiTextSettings>,
): AutumnStudioSettingsValues {
  const current = getAiTextSettings(values);
  return {
    ...values,
    aiText: {
      ...current,
      ...patch,
    },
  };
}
