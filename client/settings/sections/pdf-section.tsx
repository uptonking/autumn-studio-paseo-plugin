import { useCallback } from "react";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_PDF_SETTINGS,
  type PdfDefaultZoom,
} from "../../../shared/settings.js";
import { FormatOpenBehaviorFields } from "../components/format-open-behavior-fields.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

const PDF_ZOOM_OPTIONS: readonly { label: string; value: PdfDefaultZoom }[] = [
  { label: "Fit width", value: "fit-width" },
  { label: "Fit page", value: "fit-page" },
  { label: "100%", value: "100" },
  { label: "125%", value: "125" },
  { label: "150%", value: "150" },
];

export function PdfSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general, pdf } = values;
  const controlsDisabled = disabled || !general.enabled;

  const handleThumbnailsChange = useCallback(
    (showThumbnailsByDefault: boolean) => {
      updateValues((current) => ({
        ...current,
        pdf: { ...current.pdf, showThumbnailsByDefault },
      }));
    },
    [updateValues]
  );

  const handleDefaultZoomChange = useCallback(
    (defaultZoom: PdfDefaultZoom) => {
      updateValues((current) => ({
        ...current,
        pdf: { ...current.pdf, defaultZoom },
      }));
    },
    [updateValues]
  );

  const handleRotateControlsChange = useCallback(
    (showRotateControls: boolean) => {
      updateValues((current) => ({
        ...current,
        pdf: { ...current.pdf, showRotateControls },
      }));
    },
    [updateValues]
  );

  const handleDownloadButtonChange = useCallback(
    (showDownloadButton: boolean) => {
      updateValues((current) => ({
        ...current,
        pdf: { ...current.pdf, showDownloadButton },
      }));
    },
    [updateValues]
  );

  return (
    <SettingsSection title="PDF" testID="autumn-studio-settings-pdf">
      <SettingsCard>
        <FormatOpenBehaviorFields
          kind="pdf"
          formatLabel="PDF"
          values={values}
          disabled={controlsDisabled}
          updateValues={updateValues}
        />
        <SettingsSwitch
          label="Show page thumbnails by default"
          hint="Automatically open the left thumbnail side panel when viewing PDF documents."
          value={pdf.showThumbnailsByDefault}
          disabled={controlsDisabled}
          onValueChange={handleThumbnailsChange}
          testID="autumn-studio-setting-pdf-thumbnails"
        />
        <SettingsSelect
          label="Default zoom level"
          hint="Initial zoom applied when a PDF document opens."
          value={pdf.defaultZoom}
          options={PDF_ZOOM_OPTIONS}
          disabled={controlsDisabled}
          onValueChange={handleDefaultZoomChange}
          testID="autumn-studio-setting-pdf-zoom"
        />
        <SettingsSwitch
          label="Show page rotation controls"
          hint="Display clockwise and counterclockwise rotation buttons in the PDF toolbar."
          value={pdf.showRotateControls}
          disabled={controlsDisabled}
          onValueChange={handleRotateControlsChange}
          testID="autumn-studio-setting-pdf-rotate"
        />
        <SettingsSwitch
          label="Show download action"
          hint="Include the Download PDF option in the PDF toolbar's top-right More (…) menu."
          value={pdf.showDownloadButton}
          disabled={controlsDisabled}
          onValueChange={handleDownloadButtonChange}
          testID="autumn-studio-setting-pdf-download"
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const pdfSectionDescriptor: SettingsSectionDescriptor = {
  id: "pdf",
  title: "PDF",
  order: 20,
  sidebarGroup: "primary",
  formatKind: "pdf",
  extensions: [".pdf"],
  description:
    "Default viewer and editor engines, initial zoom level, and PDF toolbar controls.",
  resetSection: (current) => ({
    ...current,
    pdf: { ...DEFAULT_PDF_SETTINGS },
  }),
  Component: PdfSettingsSection,
};
