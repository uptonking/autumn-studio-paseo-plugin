import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { SettingsCard, SettingsSection, SettingsSelect } from '@getpaseo/plugin/client/ui';
import {
  AI_TEXT_PROFILE_PRESETS,
  createAiTextProfileFromPreset,
  getAiTextEngineDescriptor,
  listAiTextAgents,
  validateAiTextProfile,
  type AiTextAgentOption,
  type AiTextProfile,
} from '../../../../shared/contracts.js';
import type { AiTextTabProps } from '../ai-text-section.js';
import { ProfileEditor } from './profile-editor.js';
import { AiTextAction, AiTextBadge, AiTextHint, AiTextPanel, type AiTextTone } from './ui.js';

const FALLBACK_AGENTS: readonly AiTextAgentOption[] = [
  { id: 'pi', label: 'pi (Default)', available: true, isDefault: true },
  { id: 'claude', label: 'Claude Code', available: true },
  { id: 'codex', label: 'Codex', available: true },
  { id: 'opencode', label: 'OpenCode', available: true },
  { id: 'copilot', label: 'GitHub Copilot', available: true },
];

function refinementSummary(profile: AiTextProfile): string {
  if (profile.refinement.mode === 'none') return 'No refinement';
  if (profile.refinement.mode === 'local') return 'Auto formatting';
  return `Agent · ${profile.refinement.agentId}`;
}

function profileSummary(profile: AiTextProfile): string {
  const descriptor = getAiTextEngineDescriptor(profile.engineId);
  const route =
    descriptor?.routes.find((item) => item.id === profile.route)?.label ?? profile.route;
  return `${descriptor?.label ?? profile.engineId} · ${route}`;
}

export function ProfilesTab({
  aiText,
  disabled,
  update,
  theme,
  autoEditProfileId,
  onAutoEditConsumed,
}: AiTextTabProps & {
  /** Profile id requested by another tab (engine card); opens in the editor once. */
  autoEditProfileId?: string | null;
  onAutoEditConsumed?(): void;
}) {
  const fetchAgents = useRpc(listAiTextAgents);
  const fetchAgentsRef = useRef(fetchAgents);
  fetchAgentsRef.current = fetchAgents;
  const [agents, setAgents] = useState<readonly AiTextAgentOption[]>(FALLBACK_AGENTS);
  const [showPresets, setShowPresets] = useState(false);
  const [editingDraft, setEditingDraft] = useState<AiTextProfile | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const profilesRef = useRef(aiText.profiles);
  profilesRef.current = aiText.profiles;

  useEffect(() => {
    let cancelled = false;
    fetchAgentsRef
      .current({})
      .then((result) => {
        if (!cancelled && result.agents.length > 0) {
          setAgents(result.agents);
        }
      })
      .catch(() => {
        // Fall back to the built-in agent list.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileOptions = useMemo(
    () =>
      aiText.profiles.map((profile) => ({
        label: profile.name,
        value: profile.id,
      })),
    [aiText.profiles],
  );

  const startEdit = useCallback((profile: AiTextProfile) => {
    setEditingDraft({
      ...profile,
      config: { ...profile.config },
      extraction: { ...profile.extraction },
      refinement: { ...profile.refinement },
    });
    setErrors([]);
    setShowPresets(false);
  }, []);

  const startNew = useCallback((presetId: string) => {
    setEditingDraft(createAiTextProfileFromPreset(presetId, profilesRef.current));
    setErrors([]);
    setShowPresets(false);
  }, []);

  // Fires once per requested id: cross-tab navigation from an engine card.
  useEffect(() => {
    if (!autoEditProfileId) return;
    const profile = profilesRef.current.find((item) => item.id === autoEditProfileId);
    if (profile) startEdit(profile);
    onAutoEditConsumed?.();
  }, [autoEditProfileId, onAutoEditConsumed, startEdit]);

  const handleSave = useCallback(() => {
    if (!editingDraft) return;
    const result = validateAiTextProfile(editingDraft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const exists = aiText.profiles.some((profile) => profile.id === result.profile.id);
    const profiles = exists
      ? aiText.profiles.map((profile) =>
          profile.id === result.profile.id ? result.profile : profile,
        )
      : [...aiText.profiles, result.profile];
    const defaultProfileId = profiles.some((profile) => profile.id === aiText.defaultProfileId)
      ? aiText.defaultProfileId
      : (profiles[0]?.id ?? '');
    update({ profiles, defaultProfileId });
    setEditingDraft(null);
    setErrors([]);
  }, [aiText.defaultProfileId, aiText.profiles, editingDraft, update]);

  const handleDelete = useCallback(
    (profileId: string) => {
      if (deleteConfirmId !== profileId) {
        setDeleteConfirmId(profileId);
        return;
      }
      const profiles = aiText.profiles.filter((profile) => profile.id !== profileId);
      const defaultProfileId =
        aiText.defaultProfileId === profileId ? (profiles[0]?.id ?? '') : aiText.defaultProfileId;
      update({ profiles, defaultProfileId });
      setDeleteConfirmId(null);
      if (editingDraft?.id === profileId) setEditingDraft(null);
    },
    [aiText.defaultProfileId, aiText.profiles, deleteConfirmId, editingDraft?.id, update],
  );

  if (editingDraft) {
    return (
      <ProfileEditor
        key={editingDraft.id}
        draft={editingDraft}
        disabled={disabled}
        agentOptions={agents}
        errors={errors}
        onChange={setEditingDraft}
        onSave={handleSave}
        onCancel={() => {
          setEditingDraft(null);
          setErrors([]);
        }}
        theme={theme}
      />
    );
  }

  return (
    <>
      <SettingsSection
        title='Parsing profiles'
        info='Every extraction uses a profile. Switch the profile in the AI Text split view to re-parse without changing the global default.'
        testID='autumn-studio-settings-ai-text-profiles'
      >
        <SettingsCard>
          <SettingsSelect
            label='Default profile'
            value={aiText.defaultProfileId}
            options={profileOptions}
            disabled={disabled}
            onValueChange={(defaultProfileId) => update({ defaultProfileId })}
            testID='autumn-studio-setting-ai-text-profile-default'
          />
          <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <AiTextAction
              label={showPresets ? 'Close presets' : 'New profile from preset'}
              onPress={() => setShowPresets((open) => !open)}
              disabled={disabled}
              tone='accent'
              theme={theme}
              testID='autumn-studio-setting-ai-text-profile-new'
            />
          </View>
          {showPresets ? (
            <View style={{ paddingHorizontal: 12, marginTop: 4, paddingBottom: 8 }}>
              {AI_TEXT_PROFILE_PRESETS.map((preset, index) => (
                <View
                  key={preset.id}
                  style={{
                    gap: 3,
                    paddingVertical: 8,
                    ...(index < AI_TEXT_PROFILE_PRESETS.length - 1
                      ? {
                          borderBottomWidth: 1,
                          borderColor: theme.colors.border,
                        }
                      : {}),
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <AiTextHint theme={theme} tone='default'>
                      {preset.label}
                    </AiTextHint>
                    <AiTextAction
                      label='Create'
                      onPress={() => startNew(preset.id)}
                      disabled={disabled}
                      theme={theme}
                      testID={`autumn-studio-setting-ai-text-profile-preset-${preset.id}`}
                    />
                  </View>
                  <AiTextHint theme={theme}>{preset.description}</AiTextHint>
                </View>
              ))}
            </View>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {aiText.profiles.map((profile) => {
        const isDefault = profile.id === aiText.defaultProfileId;
        // The shipped profile is the floor: it is always a valid default, so
        // it stays permanent and marked instead of deletable.
        const isBuiltIn = profile.id === 'mineru-cloud-free';
        const isConfirmingDelete = deleteConfirmId === profile.id;
        const refinementTone: AiTextTone =
          profile.refinement.mode === 'agent' ? 'warning' : 'default';
        return (
          <AiTextPanel
            key={profile.id}
            theme={theme}
            testID={`autumn-studio-ai-text-profile-${profile.id}`}
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AiTextHint theme={theme}>
                <AiTextHint theme={theme} tone='default'>
                  {profile.name}
                </AiTextHint>
              </AiTextHint>
              {isBuiltIn ? <AiTextBadge label='Built-in' theme={theme} /> : null}
              {isDefault ? <AiTextBadge label='Default' tone='accent' theme={theme} /> : null}
              <AiTextBadge label={profileSummary(profile)} theme={theme} />
              <AiTextBadge label={refinementSummary(profile)} tone={refinementTone} theme={theme} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <AiTextAction
                label='Edit'
                onPress={() => startEdit(profile)}
                disabled={disabled}
                theme={theme}
                testID={`autumn-studio-ai-text-profile-edit-${profile.id}`}
              />
              {!isDefault ? (
                <AiTextAction
                  label='Set as default'
                  onPress={() => update({ defaultProfileId: profile.id })}
                  disabled={disabled}
                  theme={theme}
                  testID={`autumn-studio-ai-text-profile-make-default-${profile.id}`}
                />
              ) : null}
              {!isBuiltIn ? (
                <AiTextAction
                  label={isConfirmingDelete ? 'Click again to delete' : 'Delete'}
                  onPress={() => handleDelete(profile.id)}
                  disabled={disabled}
                  tone='danger'
                  theme={theme}
                  testID={`autumn-studio-ai-text-profile-delete-${profile.id}`}
                />
              ) : null}
            </View>
          </AiTextPanel>
        );
      })}
    </>
  );
}
