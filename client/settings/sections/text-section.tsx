import { useCallback } from "react";
import {
  SettingsCard,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  getTextViewerSettings,
  withTextViewerSettings,
} from "../../../shared/settings.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

export function TextSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const controlsDisabled = disabled || !general.enabled;
  const textSettings = getTextViewerSettings(values);

  const handleToggleLineNumbers = useCallback(
    (showLineNumbers: boolean) => {
      updateValues((prev) => withTextViewerSettings(prev, { showLineNumbers }));
    },
    [updateValues],
  );

  const handleToggleWordWrap = useCallback(
    (wordWrap: boolean) => {
      updateValues((prev) => withTextViewerSettings(prev, { wordWrap }));
    },
    [updateValues],
  );

  return (
    <SettingsSection title="Code & Text" testID="file-explorer-settings-text">
      <SettingsCard>
        <SettingsSwitch
          label="Show line numbers"
          hint="Display line numbers along the left gutter in text and code previews."
          value={textSettings.showLineNumbers}
          disabled={controlsDisabled}
          onValueChange={handleToggleLineNumbers}
          testID="file-explorer-setting-text-lines"
        />
        <SettingsSwitch
          label="Wrap long lines"
          hint="Soft-wrap lines that exceed the viewer width instead of scrolling horizontally."
          value={textSettings.wordWrap}
          disabled={controlsDisabled}
          onValueChange={handleToggleWordWrap}
          testID="file-explorer-setting-text-wrap"
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const textSectionDescriptor: SettingsSectionDescriptor = {
  id: "text",
  title: "Code & Text",
  order: 30,
  Component: TextSettingsSection,
};
