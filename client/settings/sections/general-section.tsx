import { useCallback, useMemo } from "react";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_MAX_OPEN_TABS,
  type ExplorerViewMode,
  type FileOpenMode,
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

const MAX_OPEN_TABS_OPTIONS: readonly {
  label: string;
  value: string;
}[] = [
  { label: "4 tabs", value: "4" },
  { label: "6 tabs", value: "6" },
  { label: "8 tabs (Default)", value: "8" },
  { label: "10 tabs", value: "10" },
  { label: "12 tabs", value: "12" },
  { label: "15 tabs", value: "15" },
  { label: "20 tabs", value: "20" },
  { label: "30 tabs", value: "30" },
];

const DEFAULT_VIEW_OPTIONS: readonly {
  label: string;
  value: ExplorerViewMode;
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
  const currentMaxOpenTabs = String(
    general.maxOpenTabs ?? DEFAULT_MAX_OPEN_TABS,
  );
  const maxOpenTabsOptions = useMemo(() => {
    if (MAX_OPEN_TABS_OPTIONS.some((opt) => opt.value === currentMaxOpenTabs)) {
      return MAX_OPEN_TABS_OPTIONS;
    }
    return [
      { label: `${currentMaxOpenTabs} tabs`, value: currentMaxOpenTabs },
      ...MAX_OPEN_TABS_OPTIONS,
    ];
  }, [currentMaxOpenTabs]);

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

  const handleMaxOpenTabsChange = useCallback(
    (rawValue: string) => {
      const parsed = Number.parseInt(rawValue, 10);
      const maxOpenTabs = Number.isFinite(parsed)
        ? Math.min(50, Math.max(1, parsed))
        : DEFAULT_MAX_OPEN_TABS;
      updateValues((current) => ({
        ...current,
        general: { ...current.general, maxOpenTabs },
      }));
    },
    [updateValues]
  );

  const handleDefaultViewChange = useCallback(
    (defaultViewMode: ExplorerViewMode) => {
      updateValues((current) => ({
        ...current,
        general: { ...current.general, defaultViewMode },
      }));
    },
    [updateValues]
  );

  const handleAutoSaveChange = useCallback(
    (autoSaveEdits: boolean) => {
      updateValues((current) => ({
        ...current,
        general: { ...current.general, autoSaveEdits },
      }));
    },
    [updateValues]
  );

  return (
    <SettingsSection title="General" testID="autumn-studio-settings-general">
      <SettingsCard>
        <SettingsSwitch
          label="Enable Autumn Studio"
          hint="Turn on the desktop/web Autumn Studio explorer and built-in file viewers for workspaces."
          value={general.enabled}
          disabled={disabled}
          onValueChange={handleEnabledChange}
          testID="autumn-studio-setting-enabled"
        />
        <SettingsSelect
          label="File open mode"
          hint="Choose how files open when clicked in the file tree. You can always open a file in another mode from the top-right More (…) menu."
          value={general.fileOpenMode}
          options={FILE_OPEN_MODE_OPTIONS}
          disabled={disabled || !general.enabled}
          onValueChange={handleOpenModeChange}
          testID="autumn-studio-setting-open-mode"
        />
        <SettingsSelect
          label="Maximum open file tabs"
          hint="Maximum number of file sub-tabs kept open in the File Viewer. Least recently visited unpinned tabs are closed automatically when exceeded."
          value={currentMaxOpenTabs}
          options={maxOpenTabsOptions}
          disabled={disabled || !general.enabled}
          onValueChange={handleMaxOpenTabsChange}
          testID="autumn-studio-setting-max-open-tabs"
        />
        <SettingsSelect
          label="Default file tree view"
          hint="Initial layout used when opening the explorer."
          value={general.defaultViewMode}
          options={DEFAULT_VIEW_OPTIONS}
          disabled={disabled || !general.enabled}
          onValueChange={handleDefaultViewChange}
          testID="autumn-studio-setting-default-view"
        />
        <SettingsSwitch
          label="Save file edits to file system automatically"
          hint="Persist changes made in PDF, Excel, or text editors directly back to the workspace file on disk by default."
          value={general.autoSaveEdits ?? true}
          disabled={disabled || !general.enabled}
          onValueChange={handleAutoSaveChange}
          testID="autumn-studio-setting-auto-save"
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const generalSectionDescriptor: SettingsSectionDescriptor = {
  id: "general",
  title: "General",
  order: 10,
  sidebarGroup: "primary",
  description:
    "Configure workspace file tree behavior, maximum open file tabs, and automatic saving.",
  resetSection: (current) => ({
    ...current,
    general: { ...DEFAULT_GENERAL_SETTINGS },
  }),
  Component: GeneralSettingsSection,
};
