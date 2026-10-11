import { useCallback } from "react";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type {
  FileExplorerViewMode,
  FileOpenMode,
} from "../../../shared/settings.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

const FILE_OPEN_MODE_OPTIONS: readonly {
  label: string;
  value: FileOpenMode;
}[] = [
  { label: "In-place viewer (Default)", value: "in-place" },
  { label: "Popup dialog", value: "dialog" },
  { label: "New tab", value: "new-tab" },
];

const DEFAULT_VIEW_OPTIONS: readonly {
  label: string;
  value: FileExplorerViewMode;
}[] = [
  { label: "List (Tree)", value: "list" },
  { label: "Icons", value: "icons" },
  { label: "Columns", value: "columns" },
  { label: "Gallery", value: "gallery" },
];

export function GeneralSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;

  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      updateValues((current) => ({
        ...current,
        general: { ...current.general, enabled },
      }));
    },
    [updateValues]
  );

  const handleOpenModeChange = useCallback(
    (fileOpenMode: FileOpenMode) => {
      updateValues((current) => ({
        ...current,
        general: { ...current.general, fileOpenMode },
      }));
    },
    [updateValues]
  );

  const handleDefaultViewChange = useCallback(
    (defaultViewMode: FileExplorerViewMode) => {
      updateValues((current) => ({
        ...current,
        general: { ...current.general, defaultViewMode },
      }));
    },
    [updateValues]
  );

  return (
    <SettingsSection title="General" testID="file-explorer-settings-general">
      <SettingsCard>
        <SettingsSwitch
          label="Enable File Explorer"
          hint="Turn on the desktop/web File Explorer and built-in file viewers for workspaces."
          value={general.enabled}
          disabled={disabled}
          onValueChange={handleEnabledChange}
          testID="file-explorer-setting-enabled"
        />
        <SettingsSelect
          label="File open mode"
          hint="Choose how files open when clicked in the file tree. You can always open a file in another mode from the top-right More (…) menu."
          value={general.fileOpenMode}
          options={FILE_OPEN_MODE_OPTIONS}
          disabled={disabled || !general.enabled}
          onValueChange={handleOpenModeChange}
          testID="file-explorer-setting-open-mode"
        />
        <SettingsSelect
          label="Default file tree view"
          hint="Initial layout used when opening the File Explorer."
          value={general.defaultViewMode}
          options={DEFAULT_VIEW_OPTIONS}
          disabled={disabled || !general.enabled}
          onValueChange={handleDefaultViewChange}
          testID="file-explorer-setting-default-view"
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const generalSectionDescriptor: SettingsSectionDescriptor = {
  id: "general",
  title: "General",
  order: 10,
  Component: GeneralSettingsSection,
};
