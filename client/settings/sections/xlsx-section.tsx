import { useCallback } from "react";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_XLSX_SETTINGS,
  getXlsxSettings,
  withXlsxSettings,
  type XlsxDefaultZoom,
} from "../../../shared/settings.js";
import { FormatOpenBehaviorFields } from "../components/format-open-behavior-fields.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

const XLSX_ZOOM_OPTIONS: readonly { label: string; value: XlsxDefaultZoom }[] =
  [
    { label: "50%", value: "50" },
    { label: "75%", value: "75" },
    { label: "100% (Default)", value: "100" },
    { label: "125%", value: "125" },
    { label: "150%", value: "150" },
    { label: "200%", value: "200" },
  ];

export function XlsxSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const xlsx = getXlsxSettings(values);
  const controlsDisabled = disabled || !general.enabled;

  const handleDefaultZoomChange = useCallback(
    (defaultZoom: XlsxDefaultZoom) => {
      updateValues((current) => withXlsxSettings(current, { defaultZoom }));
    },
    [updateValues]
  );

  const handleFormulaBarChange = useCallback(
    (showFormulaBar: boolean) => {
      updateValues((current) => withXlsxSettings(current, { showFormulaBar }));
    },
    [updateValues]
  );

  const handleHiddenSheetsChange = useCallback(
    (showHiddenSheets: boolean) => {
      updateValues((current) =>
        withXlsxSettings(current, { showHiddenSheets })
      );
    },
    [updateValues]
  );

  const handleDownloadButtonChange = useCallback(
    (showDownloadButton: boolean) => {
      updateValues((current) =>
        withXlsxSettings(current, { showDownloadButton })
      );
    },
    [updateValues]
  );

  return (
    <SettingsSection title="Excel" testID="autumn-studio-settings-xlsx">
      <SettingsCard>
        <FormatOpenBehaviorFields
          kind="xlsx"
          formatLabel="Excel"
          values={values}
          disabled={controlsDisabled}
          updateValues={updateValues}
        />
        <SettingsSelect
          label="Default zoom level"
          hint="Initial zoom scale applied when an Excel (.xlsx / .xls) workbook opens."
          value={xlsx.defaultZoom}
          options={XLSX_ZOOM_OPTIONS}
          disabled={controlsDisabled}
          onValueChange={handleDefaultZoomChange}
          testID="autumn-studio-setting-xlsx-zoom"
        />
        <SettingsSwitch
          label="Show formula bar"
          hint="Display the active cell reference and formula bar above the spreadsheet grid."
          value={xlsx.showFormulaBar}
          disabled={controlsDisabled}
          onValueChange={handleFormulaBarChange}
          testID="autumn-studio-setting-xlsx-formula-bar"
        />
        <SettingsSwitch
          label="Show hidden sheets"
          hint="Include hidden and very hidden worksheet tabs in the bottom sheet switcher."
          value={xlsx.showHiddenSheets}
          disabled={controlsDisabled}
          onValueChange={handleHiddenSheetsChange}
          testID="autumn-studio-setting-xlsx-hidden-sheets"
        />
        <SettingsSwitch
          label="Show download action"
          hint="Include the Export / Download options in the Excel toolbar."
          value={xlsx.showDownloadButton}
          disabled={controlsDisabled}
          onValueChange={handleDownloadButtonChange}
          testID="autumn-studio-setting-xlsx-download"
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const xlsxSectionDescriptor: SettingsSectionDescriptor = {
  id: "xlsx",
  title: "Excel",
  order: 25,
  sidebarGroup: "primary",
  formatKind: "xlsx",
  extensions: [".xlsx", ".xls", ".csv"],
  description:
    "Default spreadsheet viewer and editor engines, zoom scale, formula bar, and hidden sheet visibility.",
  resetSection: (current) => ({
    ...current,
    xlsx: { ...DEFAULT_XLSX_SETTINGS },
  }),
  Component: XlsxSettingsSection,
};
