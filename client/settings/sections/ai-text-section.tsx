import { useCallback, useMemo, useState } from "react";
import {
  SettingsCard,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import {
  getAiTextSettings,
  withAiTextSettings,
  type AiTextSettings,
} from "../../../shared/contracts.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";
import { AdvancedTab } from "./ai-text/advanced-tab.js";
import { EnginesTab } from "./ai-text/engines-tab.js";
import { GeneralTab } from "./ai-text/general-tab.js";
import { ProfilesTab } from "./ai-text/profiles-tab.js";
import {
  AiTextSettingsTabs,
  type AiTextSettingsTab,
} from "./ai-text/ui.js";

export interface AiTextTabProps {
  aiText: AiTextSettings;
  disabled: boolean;
  theme: SettingsSectionComponentProps["theme"];
  update(patch: Partial<AiTextSettings>): void;
  /** Engines tab → Profiles tab navigation: open this profile in the editor. */
  onOpenProfile?(profileId: string): void;
}

export function AiTextSettingsSection({
  values,
  disabled,
  theme,
  updateValues,
}: SettingsSectionComponentProps) {
  const aiText = useMemo(() => getAiTextSettings(values), [values]);
  const [activeTab, setActiveTab] = useState<AiTextSettingsTab>("general");
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);

  const update = useCallback(
    (patch: Partial<AiTextSettings>) => {
      updateValues((current) => withAiTextSettings(current, patch));
    },
    [updateValues],
  );

  const openProfile = useCallback((profileId: string) => {
    setPendingProfileId(profileId);
    setActiveTab("profiles");
  }, []);

  const consumePendingProfile = useCallback(() => {
    setPendingProfileId(null);
  }, []);

  const globallyDisabled = disabled || !values.general.enabled;
  const subControlsDisabled = globallyDisabled || !aiText.enabled;

  return (
    <>
      <SettingsSection
        title="AI Text Mode"
        info="Extract document text into .autumn/ with a named parsing profile, then compare it with the original file in a right-hand split view."
        testID="file-explorer-settings-ai-text"
      >
        <SettingsCard>
          <AiTextSettingsTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            theme={theme}
          />
        </SettingsCard>
      </SettingsSection>

      {activeTab === "general" ? (
        <GeneralTab
          aiText={aiText}
          disabled={globallyDisabled}
          theme={theme}
          update={update}
        />
      ) : null}
      {activeTab === "profiles" ? (
        <ProfilesTab
          aiText={aiText}
          disabled={subControlsDisabled}
          theme={theme}
          update={update}
          autoEditProfileId={pendingProfileId}
          onAutoEditConsumed={consumePendingProfile}
        />
      ) : null}
      {activeTab === "engines" ? (
        <EnginesTab
          aiText={aiText}
          disabled={subControlsDisabled}
          theme={theme}
          update={update}
          onOpenProfile={openProfile}
        />
      ) : null}
      {activeTab === "advanced" ? (
        <AdvancedTab
          aiText={aiText}
          disabled={subControlsDisabled}
          theme={theme}
          update={update}
        />
      ) : null}
    </>
  );
}

export const aiTextSectionDescriptor: SettingsSectionDescriptor = {
  id: "ai-text",
  title: "AI Text Mode",
  order: 25,
  sidebarGroup: "primary",
  extensions: [".pdf"],
  description:
    "Extract PDF text with MinerU, Docling, or built-in OCR using named parsing profiles, and compare versions side-by-side in a split view.",
  // Reset lives inside the General tab, not under every tab.
  Component: AiTextSettingsSection,
};
