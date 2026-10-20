import { useCallback, useEffect, useMemo, useState } from "react";
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
  type MineruExecutionMode,
} from "../../../shared/contracts.js";
import type {
  SettingsSectionComponentProps,
  SettingsSectionDescriptor,
} from "../registry.js";

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

const MINERU_MODE_OPTIONS: readonly {
  label: string;
  value: MineruExecutionMode;
}[] = [
  { label: "Free Cloud API (Zero-config default)", value: "cloud-free" },
  { label: "MinerU Cloud API v4 (API Token)", value: "cloud-token" },
  { label: "Local MinerU CLI (mineru)", value: "local-cli" },
];

const OCR_LANGUAGE_OPTIONS: readonly { label: string; value: string }[] = [
  { label: "Auto-detect (Default)", value: "auto" },
  { label: "English (en)", value: "en" },
  { label: "Chinese (ch)", value: "ch" },
  { label: "Japanese (ja)", value: "ja" },
  { label: "Korean (ko)", value: "ko" },
  { label: "German (de)", value: "de" },
  { label: "French (fr)", value: "fr" },
  { label: "Spanish (es)", value: "es" },
];

export function AiTextSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const aiText = useMemo(() => getAiTextSettings(values), [values]);
  const controlsDisabled = disabled || !general.enabled;
  const subControlsDisabled = controlsDisabled || !aiText.enabled;

  const fetchAgents = useRpc(listAiTextAgents);
  const [discoveredAgents, setDiscoveredAgents] = useState<
    readonly AiTextAgentOption[]
  >(FALLBACK_AGENT_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    fetchAgents({})
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
  }, [fetchAgents]);

  const agentSelectOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const seen = new Set<string>();
    for (const agent of discoveredAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      options.push({
        label: agent.label,
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

  const handleMineruModeChange = useCallback(
    (mode: MineruExecutionMode) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, mode },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruOcrChange = useCallback(
    (enableOcr: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, enableOcr },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruFormulaChange = useCallback(
    (enableFormula: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, enableFormula },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruTableChange = useCallback(
    (enableTable: boolean) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, enableTable },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruTokenChange = useCallback(
    (apiToken: string) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, apiToken },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruCliChange = useCallback(
    (cliCommand: string) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: {
            ...getAiTextSettings(current).mineru,
            cliCommand: cliCommand.trim() || "mineru",
          },
        }),
      );
    },
    [updateValues],
  );

  const handleMineruLanguageChange = useCallback(
    (language: string) => {
      updateValues((current) =>
        withAiTextSettings(current, {
          mineru: { ...getAiTextSettings(current).mineru, language },
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
          <SettingsSwitch
            label="Open split view by default"
            hint="When a PDF already has extracted AI text, open it with the original PDF on the left and the AI text on the right. Off by default."
            value={aiText.openSplitViewByDefault}
            disabled={subControlsDisabled}
            onValueChange={handleOpenSplitViewByDefaultChange}
            testID="file-explorer-setting-ai-text-open-split-default"
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
          {aiText.defaultParser === "mineru" ? (
            <>
              <SettingsSelect
                label="MinerU execution mode"
                hint="Free Cloud API works out of the box without an API key. Switch to Cloud API v4 for authenticated batch runs or Local CLI to use a local mineru binary."
                value={aiText.mineru.mode}
                options={MINERU_MODE_OPTIONS}
                disabled={subControlsDisabled}
                onValueChange={handleMineruModeChange}
                testID="file-explorer-setting-mineru-mode"
              />
              {aiText.mineru.mode === "cloud-token" ? (
                <SettingsInput
                  label="MinerU API token"
                  hint="Bearer token from mineru.net API management console."
                  initialValue={aiText.mineru.apiToken}
                  placeholder="Paste MinerU API token"
                  secureTextEntry
                  disabled={subControlsDisabled}
                  onChangeText={handleMineruTokenChange}
                  testID="file-explorer-setting-mineru-token"
                />
              ) : null}
              {aiText.mineru.mode === "local-cli" ? (
                <SettingsInput
                  label="MinerU CLI command"
                  hint="Local executable name or path (e.g. mineru or magic-pdf)."
                  initialValue={aiText.mineru.cliCommand}
                  placeholder="mineru"
                  disabled={subControlsDisabled}
                  onChangeText={handleMineruCliChange}
                  testID="file-explorer-setting-mineru-cli"
                />
              ) : null}
            </>
          ) : null}
          {isExternalCloudParser ? (
            <>
              <SettingsInput
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
          <SettingsSelect
            label="Document OCR language"
            hint="Primary language hint for OCR and layout recognition."
            value={aiText.mineru.language}
            options={OCR_LANGUAGE_OPTIONS}
            disabled={subControlsDisabled}
            onValueChange={handleMineruLanguageChange}
            testID="file-explorer-setting-mineru-language"
          />
          <SettingsSwitch
            label="Enable OCR"
            hint="Run optical character recognition on scanned PDF pages and images."
            value={aiText.mineru.enableOcr}
            disabled={subControlsDisabled}
            onValueChange={handleMineruOcrChange}
            testID="file-explorer-setting-mineru-ocr"
          />
          <SettingsSwitch
            label="Formula recognition"
            hint="Convert mathematical equations into LaTeX blocks in extracted Markdown."
            value={aiText.mineru.enableFormula}
            disabled={subControlsDisabled}
            onValueChange={handleMineruFormulaChange}
            testID="file-explorer-setting-mineru-formula"
          />
          <SettingsSwitch
            label="Table recognition"
            hint="Preserve multi-column tables as structured Markdown tables."
            value={aiText.mineru.enableTable}
            disabled={subControlsDisabled}
            onValueChange={handleMineruTableChange}
            testID="file-explorer-setting-mineru-table"
          />
        </SettingsCard>
      </SettingsSection>
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
