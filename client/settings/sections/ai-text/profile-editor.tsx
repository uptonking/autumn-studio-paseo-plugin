import { View } from 'react-native';
import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from '@getpaseo/plugin/client/ui';
import {
  AI_TEXT_ENGINE_CATALOG,
  AI_TEXT_REFINEMENT_PROMPT_PRESETS,
  defaultExtractionForEngine,
  getAiTextEngineDescriptor,
  getEngineCapabilities,
  type AiTextAgentOption,
  type AiTextProfile,
} from '../../../../shared/contracts.js';
import { EngineFields } from './engine-fields.js';
import { AiTextAction, AiTextBadge, AiTextHint, AiTextPanel, type AiTextTheme } from './ui.js';

const OCR_LANGUAGE_OPTIONS = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'English (en)', value: 'en' },
  { label: 'Chinese (ch)', value: 'ch' },
  { label: 'Japanese (ja)', value: 'ja' },
  { label: 'Korean (ko)', value: 'ko' },
  { label: 'German (de)', value: 'de' },
  { label: 'French (fr)', value: 'fr' },
  { label: 'Spanish (es)', value: 'es' },
];

const REFINEMENT_MODE_OPTIONS = [
  { label: 'None (store engine output)', value: 'none' },
  { label: 'Auto formatting (built-in, no model)', value: 'local' },
  { label: 'Agent pass (opt-in)', value: 'agent' },
];

const ENGINE_OPTIONS = AI_TEXT_ENGINE_CATALOG.map((engine) => ({
  label: engine.label,
  value: engine.id,
}));

export function ProfileEditor({
  draft,
  disabled,
  agentOptions,
  errors,
  onChange,
  onSave,
  onCancel,
  theme,
}: {
  draft: AiTextProfile;
  disabled: boolean;
  agentOptions: readonly AiTextAgentOption[];
  errors: readonly string[];
  onChange(next: AiTextProfile): void;
  onSave(): void;
  onCancel(): void;
  theme: AiTextTheme;
}) {
  const descriptor = getAiTextEngineDescriptor(draft.engineId);
  const caps = descriptor ? getEngineCapabilities(descriptor, draft.route) : null;
  const routeOptions = descriptor
    ? descriptor.routes.map((route) => ({
        label: route.label,
        value: route.id,
      }))
    : [];
  const routeDescription =
    descriptor?.routes.find((route) => route.id === draft.route)?.description ?? '';

  const agentSelectOptions = agentOptions
    .filter((agent) => agent.available)
    .map((agent) => ({ label: agent.label || agent.id, value: agent.id }));
  if (
    draft.refinement.agentId &&
    !agentSelectOptions.some((option) => option.value === draft.refinement.agentId)
  ) {
    agentSelectOptions.unshift({
      label: draft.refinement.agentId,
      value: draft.refinement.agentId,
    });
  }
  if (!agentSelectOptions.some((option) => option.value === 'pi')) {
    agentSelectOptions.unshift({ label: 'pi (Default)', value: 'pi' });
  }

  const setExtraction = (patch: Partial<AiTextProfile['extraction']>) => {
    onChange({
      ...draft,
      extraction: { ...draft.extraction, ...patch },
    });
  };

  const setRefinement = (patch: Partial<AiTextProfile['refinement']>) => {
    onChange({
      ...draft,
      refinement: { ...draft.refinement, ...patch },
    });
  };

  return (
    <>
      <SettingsSection
        title='Profile'
        info='A profile is a named parsing recipe: engine, route, engine settings, extraction options, and refinement.'
        testID='autumn-studio-settings-ai-text-profile-editor'
      >
        <SettingsCard>
          <SettingsInput
            key={`${draft.id}:name`}
            label='Profile name'
            initialValue={draft.name}
            placeholder='Profile name'
            disabled={disabled}
            onChangeText={(name) => onChange({ ...draft, name })}
            testID='autumn-studio-setting-ai-text-profile-name'
          />
          <SettingsSelect
            label='Engine'
            hint={descriptor?.description}
            value={draft.engineId}
            options={ENGINE_OPTIONS}
            disabled={disabled}
            onValueChange={(engineId) => {
              const nextDescriptor = getAiTextEngineDescriptor(engineId);
              if (!nextDescriptor) return;
              const route = nextDescriptor.routes.some(
                (item) => item.id === nextDescriptor.defaultRoute,
              )
                ? nextDescriptor.defaultRoute
                : (nextDescriptor.routes[0]?.id ?? draft.route);
              onChange({
                ...draft,
                engineId,
                route,
                config: { ...nextDescriptor.configDefaults },
                extraction: defaultExtractionForEngine(engineId),
              });
            }}
            testID='autumn-studio-setting-ai-text-profile-engine'
          />
          <SettingsSelect
            label='Route'
            hint={routeDescription}
            value={draft.route}
            options={routeOptions}
            disabled={disabled}
            onValueChange={(routeId) => {
              const nextCaps = descriptor ? getEngineCapabilities(descriptor, routeId) : null;
              // The page field disappears on routes that ignore it; clear the
              // value so a hidden setting cannot fail validation on save.
              const pages = nextCaps && !nextCaps.pageRange ? { pages: '' } : {};
              onChange({
                ...draft,
                route: routeId,
                extraction: { ...draft.extraction, ...pages },
              });
            }}
            testID='autumn-studio-setting-ai-text-profile-route'
          />
          <EngineFields
            profile={draft}
            disabled={disabled}
            onChange={(config) => onChange({ ...draft, config })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title='Extraction'
        info='Only options the selected engine supports are shown.'
        testID='autumn-studio-settings-ai-text-profile-extraction'
      >
        <SettingsCard>
          {caps?.ocr ? (
            <SettingsSwitch
              label='OCR'
              hint='Read scanned pages with OCR instead of relying only on the text layer.'
              value={draft.extraction.ocr}
              disabled={disabled}
              onValueChange={(ocr) => setExtraction({ ocr })}
              testID='autumn-studio-setting-ai-text-profile-ocr'
            />
          ) : null}
          {caps?.formula ? (
            <SettingsSwitch
              label='Formula recognition'
              hint='Convert equations into LaTeX.'
              value={draft.extraction.formula}
              disabled={disabled}
              onValueChange={(formula) => setExtraction({ formula })}
              testID='autumn-studio-setting-ai-text-profile-formula'
            />
          ) : null}
          {caps?.tables ? (
            <SettingsSwitch
              label='Table recognition'
              hint='Preserve tables as structured Markdown tables.'
              value={draft.extraction.tables}
              disabled={disabled}
              onValueChange={(tables) => setExtraction({ tables })}
              testID='autumn-studio-setting-ai-text-profile-tables'
            />
          ) : null}
          {caps?.language ? (
            <SettingsSelect
              label='Document language'
              hint='Hint for OCR and layout models. Auto lets the engine detect it.'
              value={draft.extraction.language}
              options={OCR_LANGUAGE_OPTIONS}
              disabled={disabled}
              onValueChange={(language) => setExtraction({ language })}
              testID='autumn-studio-setting-ai-text-profile-language'
            />
          ) : null}
          {caps?.pageRange ? (
            <SettingsInput
              key={`${draft.id}:pages`}
              label='Page range'
              hint='Optional pages such as "1-5,8", "all", or reverse "r3-r1". Leave empty for all pages.'
              initialValue={draft.extraction.pages}
              placeholder='All pages'
              disabled={disabled}
              onChangeText={(pages) => setExtraction({ pages })}
              testID='autumn-studio-setting-ai-text-profile-pages'
            />
          ) : null}
          {caps?.layout ? (
            <SettingsSwitch
              label='Extract layout geometry'
              hint='Keep block geometry for the Blocks view and PDF highlighting. Off stores Markdown only.'
              value={draft.extraction.layout}
              disabled={disabled}
              onValueChange={(layout) => setExtraction({ layout })}
              testID='autumn-studio-setting-ai-text-profile-layout'
            />
          ) : null}
          {caps?.imageAnalysis ? (
            <SettingsSwitch
              label='Image analysis'
              hint="Caption illustrations with the engine's vision model. Slower."
              value={draft.extraction.imageAnalysis}
              disabled={disabled}
              onValueChange={(imageAnalysis) => setExtraction({ imageAnalysis })}
              testID='autumn-studio-setting-ai-text-profile-image-analysis'
            />
          ) : null}
          <SettingsInput
            key={`${draft.id}:timeout`}
            label='Timeout (ms)'
            hint='Cancels the parse after this long. Default 900000 (15 minutes).'
            initialValue={String(draft.extraction.timeoutMs)}
            placeholder='900000'
            disabled={disabled}
            onChangeText={(text) => {
              const parsed = Number.parseInt(text, 10);
              if (!Number.isFinite(parsed)) return;
              setExtraction({
                timeoutMs: Math.min(7_200_000, Math.max(10_000, parsed)),
              });
            }}
            testID='autumn-studio-setting-ai-text-profile-timeout'
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title='Refinement'
        info='Post-processing applied before the Markdown version is stored. Agent refinement is an explicit opt-in and falls back to parser output with a warning.'
        testID='autumn-studio-settings-ai-text-profile-refinement'
      >
        <SettingsCard>
          <SettingsSelect
            label='Mode'
            value={draft.refinement.mode}
            options={REFINEMENT_MODE_OPTIONS}
            disabled={disabled}
            onValueChange={(mode) =>
              setRefinement({
                mode: mode as AiTextProfile['refinement']['mode'],
              })
            }
            testID='autumn-studio-setting-ai-text-profile-refinement-mode'
          />
          {draft.refinement.mode === 'agent' ? (
            <>
              <SettingsSelect
                label='Agent'
                hint='Paseo agent that receives the parsed Markdown. The run is auto-archived.'
                value={draft.refinement.agentId}
                options={agentSelectOptions}
                disabled={disabled}
                onValueChange={(agentId) => setRefinement({ agentId })}
                testID='autumn-studio-setting-ai-text-profile-refinement-agent'
              />
              <SettingsInput
                key={`${draft.id}:model`}
                label='Model'
                hint='Optional model id for the agent, e.g. claude-sonnet-4-5. Empty uses the provider default.'
                initialValue={draft.refinement.model}
                placeholder='Provider default'
                disabled={disabled}
                onChangeText={(model) => setRefinement({ model })}
                testID='autumn-studio-setting-ai-text-profile-refinement-model'
              />
              <SettingsSelect
                label='Prompt preset'
                value={draft.refinement.promptPresetId}
                options={AI_TEXT_REFINEMENT_PROMPT_PRESETS.map((preset) => ({
                  label: preset.label,
                  value: preset.id,
                }))}
                disabled={disabled}
                onValueChange={(promptPresetId) => setRefinement({ promptPresetId })}
                testID='autumn-studio-setting-ai-text-profile-refinement-preset'
              />
              {draft.refinement.promptPresetId === 'custom' ? (
                <SettingsInput
                  key={`${draft.id}:prompt`}
                  label='Custom prompt'
                  hint='Include the {{markdown}} token; {{fileName}} and {{language}} are also available.'
                  initialValue={draft.refinement.prompt}
                  placeholder='Repair this document…'
                  disabled={disabled}
                  onChangeText={(prompt) => setRefinement({ prompt })}
                  testID='autumn-studio-setting-ai-text-profile-refinement-prompt'
                />
              ) : null}
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {errors.length > 0 ? (
        <AiTextPanel theme={theme} testID='autumn-studio-ai-text-profile-errors'>
          <AiTextBadge label='Profile needs attention' tone='danger' theme={theme} />
          {errors.map((error, index) => (
            <AiTextHint key={index} theme={theme} tone='danger'>
              • {error}
            </AiTextHint>
          ))}
        </AiTextPanel>
      ) : null}

      <SettingsSection title='Save' testID='autumn-studio-ai-text-profile-actions'>
        <SettingsCard>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <AiTextAction
              label='Save profile'
              onPress={onSave}
              disabled={disabled}
              tone='accent'
              theme={theme}
              testID='autumn-studio-setting-ai-text-profile-save'
            />
            <AiTextAction
              label='Cancel'
              onPress={onCancel}
              disabled={disabled}
              theme={theme}
              testID='autumn-studio-setting-ai-text-profile-cancel'
            />
          </View>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
