import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  useSettings,
  type PluginScreenProps,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_FILE_EXPLORER_SETTINGS,
  fileExplorerSettings,
  type FileExplorerSettingsValues,
} from "../../shared/settings.js";
import type { ReadyFileExplorerSettings } from "./registry.js";
import { getSettingsSections } from "./sections/index.js";

function SettingsSectionsList({
  settings,
  theme,
}: {
  settings: ReadyFileExplorerSettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const sections = useMemo(() => getSettingsSections(), []);
  const values: FileExplorerSettingsValues = useMemo(
    () => ({
      general: {
        ...DEFAULT_FILE_EXPLORER_SETTINGS.general,
        ...settings.values?.general,
      },
      pdf: {
        ...DEFAULT_FILE_EXPLORER_SETTINGS.pdf,
        ...settings.values?.pdf,
      },
      xlsx: {
        ...DEFAULT_FILE_EXPLORER_SETTINGS.xlsx,
        ...settings.values?.xlsx,
      },
      text: {
        ...DEFAULT_FILE_EXPLORER_SETTINGS.text,
        ...settings.values?.text,
      },
      formats: {
        ...DEFAULT_FILE_EXPLORER_SETTINGS.formats,
        ...settings.values?.formats,
      },
    }),
    [settings.values]
  );

  const updateValues = useCallback(
    (
      updater: (
        current: FileExplorerSettingsValues
      ) => FileExplorerSettingsValues
    ) => {
      const next = updater(values);
      void settings.save(next, settings.revision);
    },
    [settings, values]
  );

  const errorTextStyle = useMemo(
    () => ({
      color: theme.colors.statusDanger,
      fontSize: 13,
      marginBottom: 12,
    }),
    [theme.colors.statusDanger]
  );

  return (
    <View testID="file-explorer-settings-sections">
      {settings.saveError ? (
        <Text accessibilityRole="alert" style={errorTextStyle}>
          {settings.saveError}
        </Text>
      ) : null}
      {sections.map((section) => {
        if (section.isVisible && !section.isVisible(values)) return null;
        const SectionComponent = section.Component;
        return (
          <SectionComponent
            key={section.id}
            settings={settings}
            values={values}
            disabled={settings.saving}
            theme={theme}
            updateValues={updateValues}
          />
        );
      })}
      <SettingsSection title="Reset" testID="file-explorer-settings-reset">
        <SettingsCard>
          <SettingsAction
            label="Restore default settings"
            hint="Reset all File Explorer and PDF viewer preferences back to their defaults."
            actionLabel="Reset to defaults"
            disabled={settings.saving}
            onPress={() => {
              void settings.reset();
            }}
            testID="file-explorer-setting-reset"
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}

/**
 * Used by `client.addSettingsScreen` inside Settings -> Plugins -> File Explorer,
 * where the host already provides the outer scroll view and page padding.
 */
export function FileExplorerSettingsContent({ theme }: PluginSurfaceProps) {
  const settings = useSettings(fileExplorerSettings);
  const textStyle = useMemo(
    () => ({ color: theme.colors.foreground, fontSize: 14 }),
    [theme.colors.foreground]
  );

  if (settings.status === "loading") {
    return <Text style={textStyle}>Loading File Explorer settings…</Text>;
  }

  if (settings.status !== "ready") {
    return (
      <SettingsSection title="File Explorer">
        <SettingsCard>
          <SettingsAction
            label={settings.error || "Unable to load File Explorer settings"}
            actionLabel="Reload"
            onPress={() => {
              void settings.reload();
            }}
          />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="Stored settings do not match the current schema"
              actionLabel="Reset to defaults"
              onPress={() => {
                void settings.reset();
              }}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }

  return <SettingsSectionsList settings={settings} theme={theme} />;
}

/**
 * Used by `client.addScreen({ id: "settings" })` when clicking the "File Explorer"
 * menu item in the left sidebar. Wraps the settings sections in a centered ScrollView.
 */
export function FileExplorerSettingsPage(props: PluginScreenProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
      contentContainerStyle={{
        paddingHorizontal: props.layout.compact ? 16 : 28,
        paddingVertical: 24,
        maxWidth: 760,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <FileExplorerSettingsContent {...props} />
    </ScrollView>
  );
}
