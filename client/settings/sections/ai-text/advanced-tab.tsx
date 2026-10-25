import { useState } from "react";
import { View } from "react-native";
import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_AI_TEXT_OUTPUT_ROOT,
  parseAiTextOutputRoot,
} from "../../../../shared/contracts.js";
import type { AiTextTabProps } from "../ai-text-section.js";
import { StorageDashboard } from "./storage-dashboard.js";
import { AiTextHint } from "./ui.js";

const PYPI_INDEX_PRESETS = [
  { label: "Default (pypi.org)", value: "" },
  { label: "Aliyun", value: "https://mirrors.aliyun.com/pypi/simple/" },
  { label: "Douban", value: "http://pypi.douban.com/simple/" },
  {
    label: "Huawei Cloud",
    value: "https://repo.huaweicloud.com/repository/pypi/simple/",
  },
  {
    label: "TUNA (Tsinghua)",
    value: "https://pypi.tuna.tsinghua.edu.cn/simple/",
  },
  { label: "USTC", value: "https://pypi.mirrors.ustc.edu.cn/simple/" },
];
const CUSTOM_INDEX_VALUE = "__custom__";

export function AdvancedTab({
  aiText,
  disabled,
  update,
  theme,
}: AiTextTabProps) {
  const [draftRoot, setDraftRoot] = useState(aiText.outputRootDir);
  // The same parse runs on the server, so the preview can never diverge from
  // the directory the daemon will actually use.
  const parsedRoot = parseAiTextOutputRoot(
    draftRoot.trim() || DEFAULT_AI_TEXT_OUTPUT_ROOT,
  );

  const isCustomIndex = !PYPI_INDEX_PRESETS.some(
    (preset) => preset.value === aiText.pypiIndexUrl,
  );
  const indexSelectValue = isCustomIndex
    ? CUSTOM_INDEX_VALUE
    : aiText.pypiIndexUrl;

  return (
    <>
      <SettingsSection
        title="Storage"
        info="Where extracted Markdown, layout, and images are written. Parsing configuration belongs to Profiles."
        testID="autumn-studio-settings-ai-text-advanced"
      >
        <SettingsCard>
          <SettingsInput
            label="Output root directory"
            hint="A folder inside the workspace (default .autumn) or an absolute path like ~/ai-text or /data/ai-text."
            initialValue={draftRoot}
            placeholder={DEFAULT_AI_TEXT_OUTPUT_ROOT}
            disabled={disabled}
            onChangeText={(next: string) => {
              setDraftRoot(next);
              const trimmed = next.trim();
              const parsed = parseAiTextOutputRoot(
                trimmed || DEFAULT_AI_TEXT_OUTPUT_ROOT,
              );
              if (parsed.ok) update({ outputRootDir: parsed.value });
            }}
            testID="autumn-studio-setting-ai-text-output-root"
          />
          <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            {parsedRoot.ok ? (
              parsedRoot.kind === "workspace-relative" ? (
                <AiTextHint theme={theme}>
                  Inside the workspace at {parsedRoot.value}/ — visible in the
                  file tree.
                </AiTextHint>
              ) : (
                <AiTextHint theme={theme} tone="warning">
                  Outside the workspace: documents are written under{" "}
                  {parsedRoot.value}/&lt;workspace id&gt;/ — namespaced per
                  workspace and not shown in the file tree.
                </AiTextHint>
              )
            ) : (
              <AiTextHint theme={theme} tone="danger">
                {parsedRoot.reason} Keeping{" "}
                {aiText.outputRootDir || DEFAULT_AI_TEXT_OUTPUT_ROOT}.
              </AiTextHint>
            )}
          </View>
        </SettingsCard>
        <StorageDashboard disabled={disabled} theme={theme} />
      </SettingsSection>

      <SettingsSection
        title="Package index"
        info="Used when installing or updating engines and when checking for newer releases. Mirrors help when pypi.org is slow or unreachable."
        testID="autumn-studio-settings-ai-text-pypi"
      >
        <SettingsCard>
          <SettingsSelect
            label="PyPI source"
            value={indexSelectValue}
            options={[
              ...PYPI_INDEX_PRESETS,
              { label: "Custom…", value: CUSTOM_INDEX_VALUE },
            ]}
            disabled={disabled}
            onValueChange={(next: string) => {
              if (next !== CUSTOM_INDEX_VALUE) {
                update({ pypiIndexUrl: next });
              }
            }}
            testID="autumn-studio-setting-ai-text-pypi-index"
          />
          {isCustomIndex ? (
            <SettingsInput
              label="Custom index URL"
              hint="A PEP 503 simple index URL ending in /simple/."
              initialValue={aiText.pypiIndexUrl}
              placeholder="https://example.com/pypi/simple/"
              disabled={disabled}
              onChangeText={(next: string) =>
                update({ pypiIndexUrl: next.trim() })
              }
              testID="autumn-studio-setting-ai-text-pypi-custom"
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
