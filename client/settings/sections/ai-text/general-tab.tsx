import { useMemo } from "react";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  createDefaultAiTextSettings,
} from "../../../../shared/contracts.js";
import { getDefaultableAiTextViewerDescriptors } from "../../../ai-text/viewers/catalog.js";
import type { AiTextTabProps } from "../ai-text-section.js";

export function GeneralTab({ aiText, disabled, update }: AiTextTabProps) {
  const viewerOptions = useMemo(() => {
    const options = getDefaultableAiTextViewerDescriptors().map(
      (descriptor) => ({
        label: descriptor.label,
        value: descriptor.id,
      }),
    );
    if (!options.some((option) => option.value === aiText.defaultViewerId)) {
      options.unshift({
        label: `${aiText.defaultViewerId || "Unknown"} (unavailable)`,
        value: aiText.defaultViewerId,
      });
    }
    return options;
  }, [aiText.defaultViewerId]);

  const profileOptions = useMemo(() => {
    const options = aiText.profiles.map((profile) => ({
      label: profile.name,
      value: profile.id,
    }));
    if (!options.some((option) => option.value === aiText.defaultProfileId)) {
      options.unshift({
        label: `${aiText.defaultProfileId || "None"} (missing)`,
        value: aiText.defaultProfileId,
      });
    }
    return options;
  }, [aiText.defaultProfileId, aiText.profiles]);

  return (
    <>
      <SettingsSection
        title="AI Text Mode"
        testID="file-explorer-settings-ai-text-general"
      >
        <SettingsCard>
          <SettingsSwitch
            label="Enable AI Text Mode"
            hint="Show the AI Text Mode button for PDFs next to Viewer/Editor in the toolbar, and extract text into .autumn/ for the split view."
            value={aiText.enabled}
            disabled={disabled}
            onValueChange={(enabled) => update({ enabled })}
            testID="file-explorer-setting-ai-text-enabled"
          />
          <SettingsSelect
            label="Default AI Text viewer"
            hint="Which AI Text pane opens by default. Registered viewers appear here; an unavailable viewer falls back to Text."
            value={aiText.defaultViewerId}
            options={viewerOptions}
            disabled={disabled || !aiText.enabled}
            onValueChange={(defaultViewerId) => update({ defaultViewerId })}
            testID="file-explorer-setting-ai-text-default-viewer"
          />
          <SettingsSelect
            label="Default parsing profile"
            hint="Profile used when the split view extracts without an explicit selection. Switch profiles inside the split view to re-parse with a different engine."
            value={aiText.defaultProfileId}
            options={profileOptions}
            disabled={disabled || !aiText.enabled}
            onValueChange={(defaultProfileId) => update({ defaultProfileId })}
            testID="file-explorer-setting-ai-text-default-profile"
          />
          <SettingsSwitch
            label="Open split view by default"
            hint="When a PDF already has extracted AI text, open it with the original PDF on the left and the AI text on the right."
            value={aiText.openSplitViewByDefault}
            disabled={disabled || !aiText.enabled}
            onValueChange={(openSplitViewByDefault) =>
              update({ openSplitViewByDefault })
            }
            testID="file-explorer-setting-ai-text-open-split-default"
          />
          <SettingsSwitch
            label="Show layout block outlines on the PDF"
            hint="Draw subtle boxes around every extracted block while the AI Text split is open. The selected block is always highlighted in amber."
            value={aiText.showLayoutBlockOverlays}
            disabled={disabled || !aiText.enabled}
            onValueChange={(showLayoutBlockOverlays) =>
              update({ showLayoutBlockOverlays })
            }
            testID="file-explorer-setting-ai-text-layout-outlines"
          />
          <SettingsSwitch
            label="Auto-scroll PDF to the selected block"
            hint="Scroll the original PDF to the page and area of the block you click in the Blocks view."
            value={aiText.autoScrollToLayoutBlock}
            disabled={disabled || !aiText.enabled}
            onValueChange={(autoScrollToLayoutBlock) =>
              update({ autoScrollToLayoutBlock })
            }
            testID="file-explorer-setting-ai-text-layout-autoscroll"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Reset" testID="file-explorer-settings-reset-ai-text">
        <SettingsCard>
          <SettingsAction
            label="Restore default AI Text Mode settings"
            hint="Reset AI Text Mode preferences, profiles, and storage options back to their defaults."
            actionLabel="Reset AI Text Mode defaults"
            disabled={disabled}
            onPress={() => update(createDefaultAiTextSettings())}
            testID="file-explorer-setting-reset-ai-text"
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
