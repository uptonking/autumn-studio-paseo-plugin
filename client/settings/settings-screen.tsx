import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  useSettings,
  type PluginScreenParams,
  type PluginScreenProps,
  type PluginSurfaceProps,
} from '@getpaseo/plugin/client';
import { SettingsAction, SettingsCard, SettingsSection } from '@getpaseo/plugin/client/ui';
import {
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  autumnStudioSettings,
  getAiTextSettings,
  type AutumnStudioSettingsValues,
} from '../../shared/settings.js';
import {
  MORE_FORMATS_NAV_ID,
  MoreFormatsFilterBar,
  resolveNavStateFromSectionParam,
  SectionMetaBanner,
  SettingsSidebarNav,
} from './components/settings-sidebar-nav.js';
import { PlatformSupportNotice } from './platform-support-notice.js';
import type { ReadyAutumnStudioSettings } from './registry.js';
import { getSettingsSections } from './sections/index.js';

function SettingsSectionsWorkspace({
  settings,
  theme,
  compact,
  platform,
  params,
}: {
  settings: ReadyAutumnStudioSettings;
  theme: PluginSurfaceProps['theme'];
  compact?: boolean;
  platform?: PluginSurfaceProps['layout']['platform'];
  params?: PluginScreenParams;
}) {
  const allSections = useMemo(() => getSettingsSections(), []);
  const values: AutumnStudioSettingsValues = useMemo(
    () => ({
      general: {
        ...DEFAULT_AUTUMN_STUDIO_SETTINGS.general,
        ...settings.values?.general,
      },
      pdf: {
        ...DEFAULT_AUTUMN_STUDIO_SETTINGS.pdf,
        ...settings.values?.pdf,
      },
      xlsx: {
        ...DEFAULT_AUTUMN_STUDIO_SETTINGS.xlsx,
        ...settings.values?.xlsx,
      },
      text: {
        ...DEFAULT_AUTUMN_STUDIO_SETTINGS.text,
        ...settings.values?.text,
      },
      formats: {
        ...DEFAULT_AUTUMN_STUDIO_SETTINGS.formats,
        ...settings.values?.formats,
      },
      aiText: getAiTextSettings(settings.values),
    }),
    [settings.values],
  );

  const visibleSections = useMemo(
    () => allSections.filter((section) => (section.isVisible ? section.isVisible(values) : true)),
    [allSections, values],
  );

  const primarySections = useMemo(
    () => visibleSections.filter((section) => (section.sidebarGroup ?? 'more') === 'primary'),
    [visibleSections],
  );

  const moreSections = useMemo(
    () => visibleSections.filter((section) => (section.sidebarGroup ?? 'more') !== 'primary'),
    [visibleSections],
  );

  const initialNav = useMemo(
    () => resolveNavStateFromSectionParam(params?.section, primarySections, moreSections),
    [moreSections, params?.section, primarySections],
  );

  const [activeNavId, setActiveNavId] = useState<string>(initialNav.activeNavId);
  const [moreFilterId, setMoreFilterId] = useState<string>(initialNav.moreFilterId);

  useEffect(() => {
    if (!params?.section) return;
    const resolved = resolveNavStateFromSectionParam(params.section, primarySections, moreSections);
    setActiveNavId(resolved.activeNavId);
    setMoreFilterId(resolved.moreFilterId);
  }, [moreSections, params?.section, primarySections]);

  const updateValues = useCallback(
    (updater: (current: AutumnStudioSettingsValues) => AutumnStudioSettingsValues) => {
      const next = updater(values);
      void settings.save(next, settings.revision);
    },
    [settings, values],
  );

  const activePrimarySection = useMemo(
    () =>
      activeNavId === MORE_FORMATS_NAV_ID
        ? null
        : (primarySections.find((section) => section.id === activeNavId) ??
          primarySections[0] ??
          null),
    [activeNavId, primarySections],
  );

  const isMoreActive = activeNavId === MORE_FORMATS_NAV_ID && moreSections.length > 0;

  const displayedMoreSections = useMemo(() => {
    if (!isMoreActive) return [];
    if (moreFilterId === 'all') return moreSections;
    const matched = moreSections.find((section) => section.id === moreFilterId);
    return matched ? [matched] : moreSections;
  }, [isMoreActive, moreFilterId, moreSections]);

  const handleEnableNow = useCallback(() => {
    updateValues((current) => ({
      ...current,
      general: { ...current.general, enabled: true },
    }));
  }, [updateValues]);

  const handleResetActivePrimarySection = useCallback(() => {
    if (!activePrimarySection?.resetSection) return;
    updateValues(activePrimarySection.resetSection);
  }, [activePrimarySection, updateValues]);

  const handleResetDisplayedMoreSections = useCallback(() => {
    updateValues((current) => {
      let next = current;
      for (const section of displayedMoreSections) {
        if (section.resetSection) {
          next = section.resetSection(next);
        }
      }
      return next;
    });
  }, [displayedMoreSections, updateValues]);

  return (
    <View
      testID='autumn-studio-settings-sections'
      style={{
        flexDirection: compact ? 'column' : 'row',
        alignItems: 'flex-start',
        gap: compact ? 16 : 24,
        width: '100%',
      }}
    >
      <SettingsSidebarNav
        primarySections={primarySections}
        moreSections={moreSections}
        activePrimarySectionId={activePrimarySection?.id ?? null}
        isMoreActive={isMoreActive}
        values={values}
        theme={theme}
        compact={compact}
        onSelectNav={setActiveNavId}
      />

      <View
        testID='autumn-studio-settings-detail'
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
        }}
      >
        {settings.saveError ? (
          <Text
            accessibilityRole='alert'
            style={{
              color: theme.colors.statusDanger,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {settings.saveError}
          </Text>
        ) : null}

        {!values.general.enabled && (isMoreActive || activePrimarySection?.id !== 'general') ? (
          <View
            testID='autumn-studio-settings-disabled-banner'
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              backgroundColor: theme.colors.surface1,
              borderColor: theme.colors.border,
              borderWidth: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text
              style={{
                flex: 1,
                color: theme.colors.foregroundMuted,
                fontSize: 13,
              }}
            >
              Autumn Studio is currently disabled in General settings. Enable it to customize format
              viewers and editors.
            </Text>
            <Pressable
              testID='autumn-studio-settings-enable-shortcut'
              onPress={handleEnableNow}
              style={{
                backgroundColor: theme.colors.accent,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  color: theme.colors.accentForeground,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                Enable
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!isMoreActive && activePrimarySection ? (
          <View key={activePrimarySection.id}>
            <SectionMetaBanner section={activePrimarySection} theme={theme} />
            {activePrimarySection.id === 'general' ? (
              <PlatformSupportNotice theme={theme} platform={platform} />
            ) : null}
            <activePrimarySection.Component
              settings={settings}
              values={values}
              disabled={settings.saving}
              theme={theme}
              updateValues={updateValues}
            />
            {activePrimarySection.id === 'general' ? (
              <SettingsSection title='Reset' testID='autumn-studio-settings-reset'>
                <SettingsCard>
                  <SettingsAction
                    label='Restore default settings'
                    hint='Reset all Autumn Studio viewer and editor preferences back to their defaults.'
                    actionLabel='Reset to defaults'
                    disabled={settings.saving}
                    onPress={() => {
                      void settings.reset();
                    }}
                    testID='autumn-studio-setting-reset'
                  />
                </SettingsCard>
              </SettingsSection>
            ) : activePrimarySection.resetSection ? (
              <SettingsSection
                title='Reset'
                testID={`autumn-studio-settings-reset-${activePrimarySection.id}`}
              >
                <SettingsCard>
                  <SettingsAction
                    label={`Restore default ${activePrimarySection.title} settings`}
                    hint={`Reset ${activePrimarySection.title} viewer and editor preferences back to their defaults.`}
                    actionLabel={`Reset ${activePrimarySection.title} defaults`}
                    disabled={settings.saving}
                    onPress={handleResetActivePrimarySection}
                    testID={`autumn-studio-setting-reset-${activePrimarySection.id}`}
                  />
                </SettingsCard>
              </SettingsSection>
            ) : null}
          </View>
        ) : null}

        {isMoreActive ? (
          <View testID='autumn-studio-settings-more-pane'>
            <MoreFormatsFilterBar
              moreSections={moreSections}
              moreFilterId={moreFilterId}
              theme={theme}
              onSelectFilter={setMoreFilterId}
            />

            {displayedMoreSections.map((section) => {
              const SectionComponent = section.Component;
              return (
                <View key={section.id} style={{ marginBottom: 8 }}>
                  <SectionMetaBanner section={section} theme={theme} />
                  <SectionComponent
                    settings={settings}
                    values={values}
                    disabled={settings.saving}
                    theme={theme}
                    updateValues={updateValues}
                  />
                </View>
              );
            })}

            <SettingsSection title='Reset' testID='autumn-studio-settings-reset-more'>
              <SettingsCard>
                <SettingsAction
                  label={
                    moreFilterId === 'all'
                      ? 'Restore default More Formats settings'
                      : `Restore default ${displayedMoreSections[0]?.title ?? 'format'} settings`
                  }
                  hint='Reset the format preferences shown above back to their defaults.'
                  actionLabel='Reset format defaults'
                  disabled={settings.saving}
                  onPress={handleResetDisplayedMoreSections}
                  testID='autumn-studio-setting-reset-more'
                />
              </SettingsCard>
            </SettingsSection>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Used by `client.addSettingsScreen` inside Settings -> Plugins -> Autumn Studio,
 * where the host already provides the outer scroll view and page padding.
 */
export function AutumnStudioSettingsContent({
  theme,
  layout,
  params,
}: PluginSurfaceProps & { params?: PluginScreenParams }) {
  const settings = useSettings(autumnStudioSettings);
  const textStyle = useMemo(
    () => ({ color: theme.colors.foreground, fontSize: 14 }),
    [theme.colors.foreground],
  );

  if (settings.status === 'loading') {
    return <Text style={textStyle}>Loading Autumn Studio settings…</Text>;
  }

  if (settings.status !== 'ready') {
    return (
      <SettingsSection title='Autumn Studio'>
        <SettingsCard>
          <SettingsAction
            label={settings.error || 'Unable to load Autumn Studio settings'}
            actionLabel='Reload'
            onPress={() => {
              void settings.reload();
            }}
          />
          {settings.status === 'invalid' ? (
            <SettingsAction
              label='Stored settings do not match the current schema'
              actionLabel='Reset to defaults'
              onPress={() => {
                void settings.reset();
              }}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSectionsWorkspace
      settings={settings}
      theme={theme}
      compact={layout?.compact}
      platform={layout?.platform}
      params={params}
    />
  );
}

/**
 * Used by `client.addScreen({ id: "settings" })` when clicking the "Autumn Studio"
 * menu item in the left sidebar. Wraps the settings workspace in a centered ScrollView.
 */
export function AutumnStudioSettingsPage(props: PluginScreenProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
      contentContainerStyle={{
        paddingHorizontal: props.layout.compact ? 16 : 28,
        paddingVertical: 24,
        maxWidth: 980,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <AutumnStudioSettingsContent {...props} />
    </ScrollView>
  );
}
