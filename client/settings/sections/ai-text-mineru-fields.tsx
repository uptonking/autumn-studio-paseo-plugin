import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type {
  MineruExecutionMode,
  MineruOcrMode,
  MineruSettings,
  MineruTier,
} from "../../../shared/contracts.js";
import { getMineruModeCapabilities } from "../../../shared/ai-text-mineru-modes.js";

export const MINERU_MODE_OPTIONS: readonly {
  label: string;
  value: MineruExecutionMode;
}[] = [
  { label: "Auto (prefer ready local MinerU)", value: "auto" },
  { label: "Local MinerU Kit CLI", value: "local-cli" },
  { label: "Local MinerU API daemon", value: "local-api" },
  { label: "MinerU Cloud API v4 (API token)", value: "cloud-token" },
  { label: "Free Cloud API (Markdown only)", value: "cloud-free" },
];

const MINERU_TIER_OPTIONS: readonly { label: string; value: MineruTier }[] = [
  { label: "Flash (fastest, lowest accuracy)", value: "flash" },
  { label: "Basic", value: "basic" },
  { label: "Standard (Default)", value: "standard" },
  { label: "Advanced (slowest, highest accuracy)", value: "advanced" },
];

const MINERU_OCR_MODE_OPTIONS: readonly {
  label: string;
  value: MineruOcrMode;
}[] = [
  { label: "Auto (Default)", value: "auto" },
  { label: "Text layer only (txt)", value: "txt" },
  { label: "Force OCR", value: "ocr" },
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

const MODE_HINTS: Record<MineruExecutionMode, string> = {
  auto: "Tries a ready local Kit, then a local API daemon, then the token API, then the free API. The free API returns Markdown only; choose a local or token mode when Blocks is required.",
  "local-cli":
    "Runs MinerU Kit on this machine. Produces Markdown, layout geometry, and images.",
  "local-api":
    "Uses the local mineru-kit client against a running MinerU API daemon. Produces the same layout and images as a local Kit run.",
  "cloud-token":
    "Uploads the document to the MinerU cloud API with your token. Produces Markdown, layout geometry, and images.",
  "cloud-free":
    "Uses the free MinerU cloud API without a token. Returns Markdown only; Layout Blocks is unavailable in this mode.",
};

export function AiTextMineruFields({
  mineru,
  disabled,
  onUpdate,
}: {
  mineru: MineruSettings;
  disabled: boolean;
  onUpdate(patch: Partial<MineruSettings>): void;
}) {
  const caps = getMineruModeCapabilities(mineru.mode);

  return (
    <>
      <SettingsSection
        title="MinerU Engine"
        info="Connection settings for the selected execution mode. Local CLI uses the models listed in MinerU Environment; the local API uses its daemon's models."
        testID="file-explorer-settings-ai-text-mineru-engine"
      >
        <SettingsCard>
          <SettingsSelect
            label="MinerU execution mode"
            hint={MODE_HINTS[mineru.mode]}
            value={mineru.mode}
            options={MINERU_MODE_OPTIONS}
            disabled={disabled}
            onValueChange={(mode) => onUpdate({ mode })}
            testID="file-explorer-setting-mineru-mode"
          />
          {caps.usesKit ? (
            <SettingsInput
              label="MinerU Kit command"
              hint={
                mineru.mode === "local-api"
                  ? "Executable name or absolute path. Local API mode still uses mineru-kit as the client that talks to the daemon."
                  : mineru.mode === "auto"
                    ? "Executable name or absolute path. Auto checks this client for both the local run and the local API route."
                    : "Executable name or absolute path. Auto-detection checks PATH, ~/.local/bin, and the uv tool environment."
              }
              initialValue={mineru.kitCommand}
              placeholder="mineru-kit"
              disabled={disabled}
              onChangeText={(kitCommand) =>
                onUpdate({ kitCommand: kitCommand.trim() || "mineru-kit" })
              }
              testID="file-explorer-setting-mineru-kit-command"
            />
          ) : null}
          {caps.usesLocalApi ? (
            <SettingsInput
              label="Local MinerU API URL"
              hint="MinerU API daemon started with `mineru-kit api-server --port 8000`."
              initialValue={mineru.localApiUrl}
              placeholder="http://127.0.0.1:8000"
              disabled={disabled}
              onChangeText={(localApiUrl) =>
                onUpdate({
                  localApiUrl: localApiUrl.trim() || "http://127.0.0.1:8000",
                })
              }
              testID="file-explorer-setting-mineru-local-api-url"
            />
          ) : null}
          {caps.showsCloudEndpoint ? (
            <SettingsInput
              label="MinerU cloud endpoint"
              hint="Override only when using a proxy or regional endpoint."
              initialValue={mineru.apiBaseUrl}
              placeholder="https://mineru.net"
              disabled={disabled}
              onChangeText={(apiBaseUrl) => onUpdate({ apiBaseUrl })}
              testID="file-explorer-setting-mineru-api-base-url"
            />
          ) : null}
          {caps.showsToken ? (
            <SettingsInput
              label={
                mineru.mode === "auto"
                  ? "MinerU API token (optional)"
                  : "MinerU API token"
              }
              hint={
                mineru.mode === "auto"
                  ? "Set a token to let Auto try the token API before the free API. Leave empty to skip it."
                  : "Bearer token from the mineru.net API management console."
              }
              initialValue={mineru.apiToken}
              placeholder="Paste MinerU API token"
              secureTextEntry
              disabled={disabled}
              onChangeText={(apiToken) => onUpdate({ apiToken })}
              testID="file-explorer-setting-mineru-token"
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="MinerU Extraction"
        info="Only the controls that affect the selected mode are shown. Local MinerU recognizes formulas and tables as part of its layout pipeline; the cloud API exposes them as separate options."
        testID="file-explorer-settings-ai-text-mineru-extraction"
      >
        <SettingsCard>
          {caps.showsLocalExtraction ? (
            <>
              <SettingsSelect
                label="MinerU model tier"
                hint="Used for local MinerU runs. Standard is the default local tier; higher tiers are slower and larger."
                value={mineru.tier}
                options={MINERU_TIER_OPTIONS}
                disabled={disabled}
                onValueChange={(tier) => onUpdate({ tier })}
                testID="file-explorer-setting-mineru-tier"
              />
              <SettingsSelect
                label="MinerU OCR mode"
                hint="The only OCR control for local runs. Auto uses the text layer when present and OCR otherwise; force OCR for scans with a broken text layer."
                value={mineru.ocrMode}
                options={MINERU_OCR_MODE_OPTIONS}
                disabled={disabled}
                onValueChange={(ocrMode) => onUpdate({ ocrMode })}
                testID="file-explorer-setting-mineru-ocr-mode"
              />
            </>
          ) : null}
          {caps.showsLayoutSwitch ? (
            <SettingsSwitch
              label="Extract layout metadata"
              hint="Keep block geometry and images. Needed for the Blocks view and PDF block highlighting."
              value={mineru.extractLayout}
              disabled={disabled}
              onValueChange={(extractLayout) => onUpdate({ extractLayout })}
              testID="file-explorer-setting-mineru-layout"
            />
          ) : null}
          {caps.showsLocalExtraction ? (
            <>
              <SettingsInput
                label="Page range"
                hint="Optional MinerU page selection such as 1-10 or 1,3,5. Leave empty for all pages."
                initialValue={mineru.pages}
                placeholder="All pages"
                disabled={disabled}
                onChangeText={(pages) => onUpdate({ pages })}
                testID="file-explorer-setting-mineru-pages"
              />
              <SettingsSwitch
                label="Disable MinerU image analysis"
                hint="Skips VLM image captioning for illustration blocks. Faster, but image blocks keep only their extracted thumbnails."
                value={mineru.disableImageAnalysis}
                disabled={disabled}
                onValueChange={(disableImageAnalysis) =>
                  onUpdate({ disableImageAnalysis })
                }
                testID="file-explorer-setting-mineru-disable-image-analysis"
              />
            </>
          ) : null}
          {caps.showsCloudExtraction ? (
            <>
              <SettingsSwitch
                label="Enable OCR"
                hint="Ask the cloud API to OCR scanned pages. Off uses the document text layer only."
                value={mineru.enableOcr}
                disabled={disabled}
                onValueChange={(enableOcr) => onUpdate({ enableOcr })}
                testID="file-explorer-setting-mineru-ocr"
              />
              <SettingsSwitch
                label="Formula recognition"
                hint="Ask the cloud API to convert mathematical equations into LaTeX blocks."
                value={mineru.enableFormula}
                disabled={disabled}
                onValueChange={(enableFormula) => onUpdate({ enableFormula })}
                testID="file-explorer-setting-mineru-formula"
              />
              <SettingsSwitch
                label="Table recognition"
                hint="Ask the cloud API to preserve multi-column tables as structured Markdown tables."
                value={mineru.enableTable}
                disabled={disabled}
                onValueChange={(enableTable) => onUpdate({ enableTable })}
                testID="file-explorer-setting-mineru-table"
              />
              <SettingsSelect
                label="Document OCR language"
                hint="Language hint sent to the cloud API. Local MinerU auto-detects instead."
                value={mineru.language}
                options={OCR_LANGUAGE_OPTIONS}
                disabled={disabled}
                onValueChange={(language) => onUpdate({ language })}
                testID="file-explorer-setting-mineru-language"
              />
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {caps.showsLocalExtraction ? (
        <SettingsSection
          title="MinerU Advanced"
          info="Optional tuning for local runs. Leave these at their defaults unless you need a remote parse server or custom flags."
          testID="file-explorer-settings-ai-text-mineru-advanced"
        >
          <SettingsCard>
            <SettingsInput
              label="Extra MinerU arguments"
              hint="Advanced: space-separated flags passed through to mineru-kit parse, for example --device cpu."
              initialValue={mineru.extraArgs}
              placeholder="--device cpu"
              disabled={disabled}
              onChangeText={(extraArgs) => onUpdate({ extraArgs })}
              testID="file-explorer-setting-mineru-extra-args"
            />
            <SettingsInput
              label="Local run timeout (ms)"
              hint="How long a local parse may run before it is cancelled. Default 900000 (15 minutes)."
              initialValue={String(mineru.timeoutMs)}
              placeholder="900000"
              disabled={disabled}
              onChangeText={(text) => {
                const parsed = Number.parseInt(text, 10);
                if (!Number.isFinite(parsed)) return;
                onUpdate({
                  timeoutMs: Math.max(30_000, Math.min(3_600_000, parsed)),
                });
              }}
              testID="file-explorer-setting-mineru-timeout"
            />
            {caps.usesRemoteServer ? (
              <>
                <SettingsInput
                  label="Remote MinerU server URL"
                  hint="Optional: send the local Kit parse to a remote MinerU server with --remote-url instead of running models locally."
                  initialValue={mineru.remoteUrl}
                  placeholder="https://mineru.example.com"
                  disabled={disabled}
                  onChangeText={(remoteUrl) => onUpdate({ remoteUrl })}
                  testID="file-explorer-setting-mineru-remote-url"
                />
                {mineru.remoteUrl.trim() ? (
                  <SettingsInput
                    label="Remote MinerU API key"
                    hint="Sent with --api-key when a remote MinerU server URL is set."
                    initialValue={mineru.remoteApiKey}
                    placeholder="Optional remote API key"
                    secureTextEntry
                    disabled={disabled}
                    onChangeText={(remoteApiKey) =>
                      onUpdate({ remoteApiKey })
                    }
                    testID="file-explorer-setting-mineru-remote-key"
                  />
                ) : null}
              </>
            ) : null}
          </SettingsCard>
        </SettingsSection>
      ) : null}
    </>
  );
}
