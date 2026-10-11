import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const fileOpenModeSchema = z.enum(["in-place", "dialog", "new-tab"]);
export type FileOpenMode = z.infer<typeof fileOpenModeSchema>;

export const fileExplorerViewModeSchema = z.enum([
  "list",
  "icons",
  "columns",
  "gallery",
]);
export type FileExplorerViewMode = z.infer<typeof fileExplorerViewModeSchema>;

export const pdfDefaultZoomSchema = z.enum([
  "fit-width",
  "fit-page",
  "100",
  "125",
  "150",
]);
export type PdfDefaultZoom = z.infer<typeof pdfDefaultZoomSchema>;

export const generalSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  fileOpenMode: fileOpenModeSchema.default("in-place"),
  defaultViewMode: fileExplorerViewModeSchema.default("list"),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const pdfSettingsSchema = z.object({
  showThumbnailsByDefault: z.boolean().default(false),
  defaultZoom: pdfDefaultZoomSchema.default("fit-width"),
  showRotateControls: z.boolean().default(true),
  showDownloadButton: z.boolean().default(true),
});
export type PdfSettings = z.infer<typeof pdfSettingsSchema>;

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  enabled: true,
  fileOpenMode: "in-place",
  defaultViewMode: "list",
};

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  showThumbnailsByDefault: false,
  defaultZoom: "fit-width",
  showRotateControls: true,
  showDownloadButton: true,
};

export const fileExplorerSettingsSchema = z.object({
  general: generalSettingsSchema.default(DEFAULT_GENERAL_SETTINGS),
  pdf: pdfSettingsSchema.default(DEFAULT_PDF_SETTINGS),
  /**
   * Extensible map for future file format viewers/editors
   * (e.g. markdown, code, docx, pptx, xlsx, image).
   */
  formats: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type FileExplorerSettingsValues = z.infer<
  typeof fileExplorerSettingsSchema
>;

export const DEFAULT_FILE_EXPLORER_SETTINGS: FileExplorerSettingsValues = {
  general: DEFAULT_GENERAL_SETTINGS,
  pdf: DEFAULT_PDF_SETTINGS,
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

export interface TextViewerSettings {
  showLineNumbers: boolean;
  wordWrap: boolean;
}

export const DEFAULT_TEXT_VIEWER_SETTINGS: TextViewerSettings = {
  showLineNumbers: true,
  wordWrap: true,
};

export function getTextViewerSettings(
  values: FileExplorerSettingsValues,
): TextViewerSettings {
  const raw = values.formats?.text;
  return {
    showLineNumbers:
      typeof raw?.showLineNumbers === "boolean"
        ? raw.showLineNumbers
        : DEFAULT_TEXT_VIEWER_SETTINGS.showLineNumbers,
    wordWrap:
      typeof raw?.wordWrap === "boolean"
        ? raw.wordWrap
        : DEFAULT_TEXT_VIEWER_SETTINGS.wordWrap,
  };
}

export function withTextViewerSettings(
  values: FileExplorerSettingsValues,
  patch: Partial<TextViewerSettings>,
): FileExplorerSettingsValues {
  const current = getTextViewerSettings(values);
  return {
    ...values,
    formats: {
      ...values.formats,
      text: {
        ...values.formats?.text,
        ...current,
        ...patch,
      },
    },
  };
}

