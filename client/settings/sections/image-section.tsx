import { SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { FormatOpenBehaviorFields } from "../components/format-open-behavior-fields.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

export function ImageSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const controlsDisabled = disabled || !general.enabled;

  return (
    <SettingsSection title="Images" testID="file-explorer-settings-image">
      <SettingsCard>
        <FormatOpenBehaviorFields
          kind="image"
          formatLabel="Image"
          values={values}
          disabled={controlsDisabled}
          updateValues={updateValues}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const imageSectionDescriptor: SettingsSectionDescriptor = {
  id: "image",
  title: "Images",
  order: 40,
  Component: ImageSettingsSection,
};
