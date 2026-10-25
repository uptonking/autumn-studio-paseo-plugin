import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { SettingsCard, SettingsSection } from '@getpaseo/plugin/client/ui';
import {
  AI_TEXT_ENGINE_CATALOG,
  getAiTextEngineEnvironment,
  listAiTextEngines,
  type AiTextEngineDescriptor,
} from '../../../../shared/contracts.js';
import type { AiTextTabProps } from '../ai-text-section.js';
import { EngineCard, environmentOf, type EnvironmentState } from './engine-card.js';
import { useEngineOperation } from './engine-operation-task.js';
import type { AiTextTheme } from './ui.js';

/** Traffic-light dot color for one engine's tab, from its detection state. */
function statusDotColor(state: EnvironmentState | undefined, theme: AiTextTheme): string {
  if (state?.status === 'error') return theme.colors.statusDanger;
  const environment = environmentOf(state);
  if (!environment) return theme.colors.foregroundMuted;
  switch (environment.status) {
    case 'ready':
      return theme.colors.statusSuccess;
    case 'needs-setup':
      return theme.colors.statusWarning;
    case 'unavailable':
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

export function EnginesTab({ aiText, disabled, theme, onOpenProfile }: AiTextTabProps) {
  const listEngines = useRpc(listAiTextEngines);
  const fetchEnvironment = useRpc(getAiTextEngineEnvironment);

  const [descriptors, setDescriptors] =
    useState<readonly AiTextEngineDescriptor[]>(AI_TEXT_ENGINE_CATALOG);
  const [environments, setEnvironments] = useState<Record<string, EnvironmentState>>({});

  const profilesRef = useRef(aiText.profiles);
  profilesRef.current = aiText.profiles;
  const defaultProfileIdRef = useRef(aiText.defaultProfileId);
  defaultProfileIdRef.current = aiText.defaultProfileId;
  const fetchEnvironmentRef = useRef(fetchEnvironment);
  fetchEnvironmentRef.current = fetchEnvironment;
  // Detection runs independently per engine, so a stale response can only be
  // discarded by comparing against that engine's latest request.
  const environmentGenerationRef = useRef<Record<string, number>>({});
  const unmountedRef = useRef(false);

  const configForEngine = useCallback((engineId: string) => {
    const profiles = profilesRef.current;
    // Detection should reflect the profile the user actually parses with by
    // default, not whichever profile happens to be listed first.
    const profile =
      profiles.find(
        (item) => item.id === defaultProfileIdRef.current && item.engineId === engineId,
      ) ?? profiles.find((item) => item.engineId === engineId);
    return profile?.config ?? {};
  }, []);

  const loadEnvironment = useCallback(
    async (engineId: string, refresh = false) => {
      const generation = (environmentGenerationRef.current[engineId] ?? 0) + 1;
      environmentGenerationRef.current[engineId] = generation;
      const isCurrent = () =>
        !unmountedRef.current && environmentGenerationRef.current[engineId] === generation;

      setEnvironments((current) => {
        // Keep the last snapshot while detecting so the card does not blank
        // out and its sort position does not jump on every refresh.
        const previous =
          current[engineId]?.status === 'ready'
            ? current[engineId].environment
            : current[engineId]?.status === 'loading'
              ? current[engineId].previous
              : undefined;
        return {
          ...current,
          [engineId]: previous ? { status: 'loading', previous } : { status: 'loading' },
        };
      });
      try {
        const result = await fetchEnvironmentRef.current({
          engineId,
          config: configForEngine(engineId),
          ...(refresh ? { refresh: true } : {}),
        });
        if (!isCurrent()) return;
        setEnvironments((current) => ({
          ...current,
          [engineId]: { status: 'ready', environment: result.environment },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        setEnvironments((current) => ({
          ...current,
          [engineId]: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not detect this engine.',
          },
        }));
      }
    },
    [configForEngine],
  );

  const refreshAfterOperation = useCallback(
    (engineId: string) => {
      void loadEnvironment(engineId, true);
    },
    [loadEnvironment],
  );

  const operation = useEngineOperation({
    configForEngine,
    onFinished: refreshAfterOperation,
  });

  useEffect(() => {
    // Descriptors come from the daemon so a newly registered engine appears in
    // settings without a client change.
    listEngines({})
      .then((result) => {
        if (result.engines.length > 0) setDescriptors(result.engines);
      })
      .catch(() => {
        // Keep the shared catalog.
      });
  }, []);

  useEffect(() => {
    for (const descriptor of descriptors) {
      void loadEnvironment(descriptor.id);
    }
  }, [descriptors, loadEnvironment]);

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    [],
  );

  // Fixed catalog order (MinerU, Docling, then everything else) — health
  // changes as engines are installed or removed, which would reshuffle the
  // tabs mid-session; the per-tab status dot carries health instead.
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(null);
  const selected =
    descriptors.find((descriptor) => descriptor.id === selectedEngineId) ?? descriptors[0];

  return (
    <SettingsSection
      title='Engines & setup'
      info='Healthy engines come first. Install, update, or remove the selected engine; parse-time behavior is configured per profile.'
      testID='autumn-studio-settings-ai-text-engines'
    >
      <SettingsCard>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
          testID='autumn-studio-ai-text-engine-tabs'
        >
          {descriptors.map((descriptor) => {
            const active = descriptor.id === selected?.id;
            const dot = statusDotColor(environments[descriptor.id], theme);
            return (
              <Pressable
                key={descriptor.id}
                accessibilityRole='tab'
                accessibilityState={{ selected: active }}
                testID={`autumn-studio-ai-text-engine-tab-${descriptor.id}`}
                onPress={() => setSelectedEngineId(descriptor.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 7,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: active ? theme.colors.surface2 : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: dot,
                  }}
                />
                <Text
                  style={{
                    color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {descriptor.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SettingsCard>

      {selected ? (
        <EngineCard
          key={selected.id}
          descriptor={selected}
          state={environments[selected.id]}
          disabled={disabled}
          theme={theme}
          profiles={aiText.profiles}
          defaultProfileId={aiText.defaultProfileId}
          operation={operation}
          onRefresh={() => void loadEnvironment(selected.id, true)}
          onOpenProfile={(profileId) => onOpenProfile?.(profileId)}
        />
      ) : null}
    </SettingsSection>
  );
}
