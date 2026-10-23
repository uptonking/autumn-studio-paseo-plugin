import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  AI_TEXT_PARSER_CATALOG,
  DEFAULT_AI_TEXT_SETTINGS,
  getAiTextSettings,
  getExternalParserConfig,
  listAiTextAgents,
  withAiTextSettings,
  type AiTextAgentOption,
  type AiTextParserProviderId,
  type AiTextViewerMode,
  type MineruSettings,
} from "../../../shared/contracts.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";
import { AiTextMineruEnvironmentSection } from "./ai-text-mineru-environment.js";
import { AiTextMineruFields } from "./ai-text-mineru-fields.js";

const FALLBACK_AGENT_OPTIONS: readonly AiTextAgentOption[] = [
  { id: "pi", label: "pi (Default)", available: true, isDefault: true },
  { id: "claude", label: "Claude Code", available: true },
  { id: "codex", label: "Codex", available: true },
  { id: "opencode", label: "OpenCode", available: true },
  { id: "copilot", label: "GitHub Copilot", available: true },
];

const PARSER_SELECT_OPTIONS: readonly {
  label: string;
  value: AiTextParserProviderId;
}[] = AI_TEXT_PARSER_CATALOG.map((entry) => ({
  label: entry.label,
  value: entry.id,
}));

const AI_TEXT_VIEWER_OPTIONS: readonly {
  label: string;
  value: AiTextViewerMode;
}[] = [
    { label: "Text (Default)", value: "text" },
    { label: "Layout Blocks", value: "layout-blocks" },
  ];

export function AiTextSettingsSection({
  values,
  disabled,
  theme,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const aiText = useMemo(() => getAiTextSettings(values), [values]);
  const controlsDisabled = disabled || !general.enabled;
  const subControlsDisabled = controlsDisabled || !aiText.enabled;

  const fetchAgents = useRpc(listAiTextAgents);
  const fetchAgentsRef = useRef(fetchAgents);
  fetchAgentsRef.current = fetchAgents;
  const [discoveredAgents, setDiscoveredAgents] = useState<
    readonly AiTextAgentOption[]
  >(FALLBACK_AGENT_OPTIONS);

  useEffect(() => {
    // Discovery only needs to run when the section mounts. The RPC handle is
    // not guaranteed to keep a stable identity across renders, and re-fetching
    // would replace the agent list on every render.
    let cancelled = false;
    fetchAgentsRef.current({})
      .then((res) => {
        if (!cancelled && res.agents.length > 0) {
          setDiscoveredAgents(res.agents);
        }
      })
      .catch(() => {
        // Keep fallback options if provider discovery is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDefaultAiTextViewerChange = useCallback(
    (defaultAiTextViewer: AiTextViewerMode) => {
      updateValues((current) =>
        withAiTextSettings(current, { defaultAiTextViewer }),
      );
    },
    [updateValues],
  );

  const handleShowLayoutOutlinesChange = useCallback(
    (showLayoutBlockOverlays: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, { showLayoutBlockOverlays }),
      );
    },
    [updateValues],
  );

  const handleAutoScrollToBlockChange = useCallback(
    (autoScrollToLayoutBlock: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, { autoScrollToLayoutBlock }),
      );
    },
    [updateValues],
  );

  const agentSelectOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const seen = new Set<string>();
    for (const agent of discoveredAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      options.push({
        label: agent.label || agent.id,
        value: agent.id,
      });
    }
    if (!seen.has("pi")) {
      options.unshift({ label: "pi (Default)", value: "pi" });
      seen.add("pi");
    }
    if (aiText.defaultAgent && !seen.has(aiText.defaultAgent)) {
      options.push({
        label: aiText.defaultAgent,
        value: aiText.defaultAgent,
      });
    }
    return options;
  }, [aiText.defaultAgent, discoveredAgents]);

  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      updateValues((current) => withAiTextSettings(current, { enabled }));
    },
    [updateValues],
  );

  const handleOpenSplitViewByDefaultChange = useCallback(
    (openSplitViewByDefault: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, { openSplitViewByDefault }),
      );
    },
    [updateValues],
  );

  const handleDefaultAgentChange = useCallback(
    (defaultAgent: string) => {
      updateValues((current) => withAiTextSettings(current, { defaultAgent }));
    },
    [updateValues],
  );

  const handleAgentRefinementChange = useCallback(
    (useAgentRefinement: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, { useAgentRefinement }),
      );
    },
    [updateValues],
  );

  const handleDefaultParserChange = useCallback(
    (defaultParser: AiTextParserProviderId) => {
      updateValues((current) => withAiTextSettings(current, { defaultParser }));
    },
    [updateValues],
  );

  const updateMineruSettings = useCallback(
    (patch: Partial<MineruSettings>) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, ...patch },
        }),
      );
    },
    [updateValues],
  );

  const isExternalCloudParser =
    aiText.defaultParser === "llamaparse" ||
    aiText.defaultParser === "azure-document-intelligence" ||
    aiText.defaultParser === "datalab";

  const activeExternalConfig = useMemo(
    () => getExternalParserConfig(aiText, aiText.defaultParser),
    [aiText],
  );

  const handleExternalApiKeyChange = useCallback(
    (apiKey: string) => {
      updateValues((current) => {
        const curAi = getAiTextSettings(current);
        const existing = getExternalParserConfig(curAi, curAi.defaultParser);
        return withAiTextSettings(current, {
          parsers: {
            ...curAi.parsers,
            [curAi.defaultParser]: { ...existing, apiKey },
          },
        });
      });
    },
    [updateValues],
  );

  const handleExternalEndpointChange = useCallback(
    (endpointUrl: string) => {
      updateValues((current) => {
        const curAi = getAiTextSettings(current);
        const existing = getExternalParserConfig(curAi, curAi.defaultParser);
        return withAiTextSettings(current, {
          parsers: {
            ...curAi.parsers,
            [curAi.defaultParser]: { ...existing, endpointUrl },
          },
        });
      });
    },
    [updateValues],
  );

  return (
    <>
      <SettingsSection
        title="AI Text Mode"
        testID="file-explorer-settings-ai-text"
      >
        <SettingsCard>
          <SettingsSwitch
            label="Enable AI Text Mode"
            hint="Show the AI Text Mode button for PDFs next to Viewer/Editor in the toolbar to extract document text into .autumn/ and open it in a right-hand split view."
            value={aiText.enabled}
            disabled={controlsDisabled}
            onValueChange={handleEnabledChange}
            testID="file-explorer-setting-ai-text-enabled"
          />
          <SettingsSelect
            label="Default AI Text viewer"
            hint="Which AI Text pane opens by default: rendered Markdown text or the layout blocks used for PDF-to-text highlighting. Blocks fall back to Text when a version has no layout metadata."
            value={aiText.defaultAiTextViewer}
            options={AI_TEXT_VIEWER_OPTIONS}
            disabled={subControlsDisabled}
            onValueChange={handleDefaultAiTextViewerChange}
            testID="file-explorer-setting-ai-text-default-viewer"
          />
          <SettingsSwitch
            label="Open split view by default"
            hint="When a PDF already has extracted AI text, open it with the original PDF on the left and the AI text on the right. Off by default."
            value={aiText.openSplitViewByDefault}
            disabled={subControlsDisabled}
            onValueChange={handleOpenSplitViewByDefaultChange}
            testID="file-explorer-setting-ai-text-open-split-default"
          />
          <SettingsSwitch
            label="Show layout block outlines on the PDF"
            hint="Draw subtle boxes around every extracted block while the AI Text split is open. The selected block is always highlighted in amber."
            value={aiText.showLayoutBlockOverlays}
            disabled={subControlsDisabled}
            onValueChange={handleShowLayoutOutlinesChange}
            testID="file-explorer-setting-ai-text-layout-outlines"
          />
          <SettingsSwitch
            label="Auto-scroll PDF to the selected block"
            hint="Scroll the original PDF to the page and area of the block you click in the Blocks view."
            value={aiText.autoScrollToLayoutBlock}
            disabled={subControlsDisabled}
            onValueChange={handleAutoScrollToBlockChange}
            testID="file-explorer-setting-ai-text-layout-autoscroll"
          />
          <SettingsSelect
            label="Default AI agent"
            hint="Agent used for VLM/OCR document understanding and Markdown structure refinement. Uses pi by default and supports configured or auto-detected agents."
            value={aiText.defaultAgent}
            options={agentSelectOptions}
            disabled={subControlsDisabled}
            onValueChange={handleDefaultAgentChange}
            testID="file-explorer-setting-ai-text-agent"
          />
          <SettingsSwitch
            label="Use agent VLM & Markdown refinement"
            hint="Allow the selected agent to refine headings, tables, and formulas after parser extraction."
            value={aiText.useAgentRefinement}
            disabled={subControlsDisabled}
            onValueChange={handleAgentRefinementChange}
            testID="file-explorer-setting-ai-text-agent-refine"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Text Parsing Options"
        testID="file-explorer-settings-ai-text-parsing"
      >
        <SettingsCard>
          <SettingsSelect
            label="Text parsing service"
            hint="Document parser / OCR engine used to extract text into .autumn/. Uses free MinerU by default; LlamaParse, Azure Document Intelligence, and Datalab are also supported."
            value={aiText.defaultParser}
            options={PARSER_SELECT_OPTIONS}
            disabled={subControlsDisabled}
            onValueChange={handleDefaultParserChange}
            testID="file-explorer-setting-ai-text-parser"
          />
          {isExternalCloudParser ? (
            <>
              <SettingsInput
                key={`key-${aiText.defaultParser}`}
                label="Parser API key"
                hint={`API key for ${aiText.defaultParser}. Falls back to local extraction when empty.`}
                initialValue={activeExternalConfig.apiKey}
                placeholder="Paste parser API key"
                secureTextEntry
                disabled={subControlsDisabled}
                onChangeText={handleExternalApiKeyChange}
                testID="file-explorer-setting-external-parser-key"
              />
              <SettingsInput
                key={`url-${aiText.defaultParser}`}
                label="Parser endpoint URL"
                hint="Optional custom endpoint URL (required for Azure Document Intelligence resource URL)."
                initialValue={activeExternalConfig.endpointUrl}
                placeholder="https://..."
                disabled={subControlsDisabled}
                onChangeText={handleExternalEndpointChange}
                testID="file-explorer-setting-external-parser-endpoint"
              />
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {aiText.defaultParser === "mineru" ? (
        <>
          <AiTextMineruFields
            mineru={aiText.mineru}
            disabled={subControlsDisabled}
            onUpdate={updateMineruSettings}
          />
          <AiTextMineruEnvironmentSection
            tier={aiText.mineru.tier}
            enabled={aiText.enabled}
            theme={theme}
          />
        </>
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
    "Extract PDF text into .autumn/ with MinerU OCR and AI agents, and compare versions side-by-side in a right-hand split view.",
  resetSection: (current) => ({
    ...current,
    aiText: {
      ...DEFAULT_AI_TEXT_SETTINGS,
      mineru: { ...DEFAULT_AI_TEXT_SETTINGS.mineru },
      parsers: {},
    },
  }),
  Component: AiTextSettingsSection,
};
