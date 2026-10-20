import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import {
  aiTextSettingsSchema,
  DEFAULT_AI_TEXT_SETTINGS,
  DEFAULT_MINERU_SETTINGS,
  type AiTextSettings,
  type MineruSettings,
} from "./ai-text-settings.ts";

export * from "./ai-text-settings.ts";

export const fileOpenModeSchema = z.enum(["in-place", "dialog", "new-tab"]);
export type FileOpenMode = z.infer<typeof fileOpenModeSchema>;

export const fileExplorerViewModeSchema = z.enum([
  "list",
  "icons",
  "columns",
  "gallery",
]);
export type FileExplorerViewMode = z.infer<typeof fileExplorerViewModeSchema>;

export const fileFormatOpenBehaviorSchema = z.enum(["viewer", "editor"]);
export type FileFormatOpenBehavior = z.infer<
  typeof fileFormatOpenBehaviorSchema
>;

export const pdfDefaultZoomSchema = z.enum([
  "fit-width",
  "fit-page",
  "100",
  "125",
  "150",
]);
export type PdfDefaultZoom = z.infer<typeof pdfDefaultZoomSchema>;

export const xlsxDefaultZoomSchema = z.enum([
  "50",
  "75",
  "100",
  "125",
  "150",
  "200",
]);
export type XlsxDefaultZoom = z.infer<typeof xlsxDefaultZoomSchema>;

export const DEFAULT_MAX_OPEN_TABS = 8;

export const generalSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  fileOpenMode: fileOpenModeSchema.default("in-place"),
  maxOpenTabs: z.number().int().min(1).max(50).default(DEFAULT_MAX_OPEN_TABS),
  defaultViewMode: fileExplorerViewModeSchema.default("list"),
  autoSaveEdits: z.boolean().default(true),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const pdfSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default("viewer"),
  defaultViewer: z.string().default("embedpdf-viewer"),
  defaultEditor: z.string().default("embedpdf-editor"),
  showThumbnailsByDefault: z.boolean().default(false),
  defaultZoom: pdfDefaultZoomSchema.default("fit-width"),
  showRotateControls: z.boolean().default(true),
  showDownloadButton: z.boolean().default(true),
});
export type PdfSettings = z.infer<typeof pdfSettingsSchema>;

export const xlsxSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default("viewer"),
  defaultViewer: z.string().default("extend-xlsx-viewer"),
  defaultEditor: z.string().default("extend-xlsx-editor"),
  defaultZoom: xlsxDefaultZoomSchema.default("100"),
  showFormulaBar: z.boolean().default(true),
  showHiddenSheets: z.boolean().default(false),
  showDownloadButton: z.boolean().default(true),
});
export type XlsxSettings = z.infer<typeof xlsxSettingsSchema>;

export const textSettingsSchema = z.object({
  defaultOpenBehavior: fileFormatOpenBehaviorSchema.default("viewer"),
  defaultViewer: z.string().default("code-text-viewer"),
  defaultEditor: z.string().default("code-text-editor"),
  showLineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
});
export type TextViewerSettings = z.infer<typeof textSettingsSchema>;

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  enabled: true,
  fileOpenMode: "in-place",
  maxOpenTabs: DEFAULT_MAX_OPEN_TABS,
  defaultViewMode: "list",
  autoSaveEdits: true,
};

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  defaultOpenBehavior: "viewer",
  defaultViewer: "embedpdf-viewer",
  defaultEditor: "embedpdf-editor",
  showThumbnailsByDefault: false,
  defaultZoom: "fit-width",
  showRotateControls: true,
  showDownloadButton: true,
};

export const DEFAULT_XLSX_SETTINGS: XlsxSettings = {
  defaultOpenBehavior: "viewer",
  defaultViewer: "extend-xlsx-viewer",
  defaultEditor: "extend-xlsx-editor",
  defaultZoom: "100",
  showFormulaBar: true,
  showHiddenSheets: false,
  showDownloadButton: true,
};

export const DEFAULT_TEXT_VIEWER_SETTINGS: TextViewerSettings = {
  defaultOpenBehavior: "viewer",
  defaultViewer: "code-text-viewer",
  defaultEditor: "code-text-editor",
  showLineNumbers: true,
  wordWrap: true,
};

export const fileExplorerSettingsSchema = z.object({
  general: generalSettingsSchema.default(DEFAULT_GENERAL_SETTINGS),
  pdf: pdfSettingsSchema.default(DEFAULT_PDF_SETTINGS),
  xlsx: xlsxSettingsSchema.default(DEFAULT_XLSX_SETTINGS),
  text: textSettingsSchema.default(DEFAULT_TEXT_VIEWER_SETTINGS),
  aiText: aiTextSettingsSchema.default(DEFAULT_AI_TEXT_SETTINGS),
  /**
   * Extensible map for additional file format viewers/editors
   * (e.g. docx, pptx, image, markdown).
   */
  formats: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type FileExplorerSettingsValues = z.infer<
  typeof fileExplorerSettingsSchema
>;

export const DEFAULT_FILE_EXPLORER_SETTINGS: FileExplorerSettingsValues = {
  general: DEFAULT_GENERAL_SETTINGS,
  pdf: DEFAULT_PDF_SETTINGS,
  xlsx: DEFAULT_XLSX_SETTINGS,
  text: DEFAULT_TEXT_VIEWER_SETTINGS,
  aiText: DEFAULT_AI_TEXT_SETTINGS,
  formats: {},
};

export const fileExplorerSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: fileExplorerSettingsSchema,
});

export function toPdfViewerZoom(
  zoom: PdfDefaultZoom
): "fit-width" | "fit-page" | number {
  switch (zoom) {
    case "fit-width":
      return "fit-width";
    case "fit-page":
      return "fit-page";
    case "100":
      return 1;
    case "125":
      return 1.25;
    case "150":
      return 1.5;
  }
}

export function toXlsxViewerZoom(zoom: XlsxDefaultZoom): number {
  switch (zoom) {
    case "50":
      return 50;
    case "75":
      return 75;
    case "100":
      return 100;
    case "125":
      return 125;
    case "150":
      return 150;
    case "200":
      return 200;
  }
}

export function getXlsxSettings(
  values: Partial<FileExplorerSettingsValues> | undefined
): XlsxSettings {
  return {
    ...DEFAULT_XLSX_SETTINGS,
    ...values?.xlsx,
  };
}

export function withXlsxSettings(
  values: FileExplorerSettingsValues,
  patch: Partial<XlsxSettings>
): FileExplorerSettingsValues {
  return {
    ...values,
    xlsx: {
      ...getXlsxSettings(values),
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
  values: Partial<FileExplorerSettingsValues> | undefined,
  kind: string
): FormatBehaviorConfig {
  if (kind === "pdf") {
    const pdf = { ...DEFAULT_PDF_SETTINGS, ...values?.pdf };
    return {
      defaultOpenBehavior: pdf.defaultOpenBehavior,
      defaultViewer: pdf.defaultViewer,
      defaultEditor: pdf.defaultEditor,
    };
  }
  if (kind === "xlsx") {
    const xlsx = { ...DEFAULT_XLSX_SETTINGS, ...values?.xlsx };
    return {
      defaultOpenBehavior: xlsx.defaultOpenBehavior,
      defaultViewer: xlsx.defaultViewer,
      defaultEditor: xlsx.defaultEditor,
    };
  }
  if (kind === "text") {
    const text = getTextViewerSettings(values);
    return {
      defaultOpenBehavior: text.defaultOpenBehavior,
      defaultViewer: text.defaultViewer,
      defaultEditor: text.defaultEditor,
    };
  }
  const raw = values?.formats?.[kind];
  const behavior =
    raw?.defaultOpenBehavior === "editor" ? "editor" : "viewer";
  return {
    defaultOpenBehavior: behavior,
    defaultViewer:
      typeof raw?.defaultViewer === "string" ? raw.defaultViewer : undefined,
    defaultEditor:
      typeof raw?.defaultEditor === "string" ? raw.defaultEditor : undefined,
  };
}

export function withFormatBehaviorConfig(
  values: FileExplorerSettingsValues,
  kind: string,
  patch: Partial<FormatBehaviorConfig>
): FileExplorerSettingsValues {
  if (kind === "pdf") {
    return {
      ...values,
      pdf: {
        ...DEFAULT_PDF_SETTINGS,
        ...values.pdf,
        ...patch,
      },
    };
  }
  if (kind === "xlsx") {
    return {
      ...values,
      xlsx: {
        ...DEFAULT_XLSX_SETTINGS,
        ...values.xlsx,
        ...patch,
      },
    };
  }
  if (kind === "text") {
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
  values: Partial<FileExplorerSettingsValues> | undefined
): TextViewerSettings {
  return {
    ...DEFAULT_TEXT_VIEWER_SETTINGS,
    ...values?.text,
  };
}

export function withTextViewerSettings(
  values: FileExplorerSettingsValues,
  patch: Partial<TextViewerSettings>
): FileExplorerSettingsValues {
  return {
    ...values,
    text: {
      ...getTextViewerSettings(values),
      ...patch,
    },
  };
}

export function getAiTextSettings(
  values: Partial<FileExplorerSettingsValues> | undefined
): AiTextSettings {
  const raw = values?.aiText;
  return {
    ...DEFAULT_AI_TEXT_SETTINGS,
    ...raw,
    mineru: {
      ...DEFAULT_MINERU_SETTINGS,
      ...raw?.mineru,
    },
    parsers: {
      ...DEFAULT_AI_TEXT_SETTINGS.parsers,
      ...raw?.parsers,
    },
  };
}

export function withAiTextSettings(
  values: FileExplorerSettingsValues,
  patch: Partial<Omit<AiTextSettings, "mineru">> & {
    mineru?: Partial<MineruSettings>;
  }
): FileExplorerSettingsValues {
  const current = getAiTextSettings(values);
  return {
    ...values,
    aiText: {
      ...current,
      ...patch,
      mineru: {
        ...current.mineru,
        ...patch.mineru,
      },
      parsers: {
        ...current.parsers,
        ...patch.parsers,
      },
    },
  };
}
