import type { ReactNode } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type AiTextTheme = PluginSurfaceProps["theme"];

export type AiTextSettingsTab = "general" | "profiles" | "engines" | "advanced";

const TABS: readonly { id: AiTextSettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "profiles", label: "Profiles" },
  { id: "engines", label: "Engines & Setup" },
  { id: "advanced", label: "Advanced" },
];

const tabBarStyle: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 4,
  padding: 4,
  borderWidth: 1,
  borderRadius: 10,
};

const tabButtonStyle: ViewStyle = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 7,
};

const tabTextStyle: TextStyle = {
  fontSize: 12,
  fontWeight: "600",
};

export function AiTextSettingsTabs({
  activeTab,
  onChange,
  theme,
}: {
  activeTab: AiTextSettingsTab;
  onChange(tab: AiTextSettingsTab): void;
  theme: AiTextTheme;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={[tabBarStyle, { borderColor: theme.colors.border }]}
    >
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={`file-explorer-ai-text-tab-${tab.id}`}
            onPress={() => onChange(tab.id)}
            style={[
              tabButtonStyle,
              active
                ? { backgroundColor: theme.colors.surface2 }
                : null,
            ]}
          >
            <Text
              style={[
                tabTextStyle,
                {
                  color: active
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type AiTextTone = "default" | "accent" | "danger" | "warning" | "success";

export function toneColor(theme: AiTextTheme, tone: AiTextTone): string {
  switch (tone) {
    case "accent":
      return theme.colors.accent;
    case "danger":
      return theme.colors.statusDanger;
    case "warning":
      return theme.colors.statusWarning;
    case "success":
      return theme.colors.statusSuccess;
    default:
      return theme.colors.foreground;
  }
}

/**
 * Soft, borderless tag. Tinted text on a quiet background — badges label
 * facts, they should not compete with controls for attention.
 */
export function AiTextBadge({
  label,
  tone = "default",
  theme,
  testID,
}: {
  label: string;
  tone?: AiTextTone;
  theme: AiTextTheme;
  testID?: string;
}) {
  const color = toneColor(theme, tone);
  return (
    <View
      testID={testID}
      style={{
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <Text style={{ color, fontSize: 10, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

/**
 * Soft filled button that hugs its content. Everything on these tabs used to
 * be a bordered pill, which made rows of actions read as boxes; only the
 * accent tone gets a fill, everything else sits on surface2.
 */
export function AiTextAction({
  label,
  onPress,
  disabled,
  tone = "default",
  theme,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  tone?: AiTextTone;
  theme: AiTextTheme;
  testID?: string;
  /** Spoken hover/hint name, for icon-only labels like "↗". */
  accessibilityLabel?: string;
}) {
  const filled = tone === "accent";
  const color = filled
    ? theme.colors.accentForeground
    : toneColor(theme, tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignSelf: "flex-start",
          borderRadius: 7,
          paddingHorizontal: 10,
          paddingVertical: 5,
          backgroundColor: filled
            ? theme.colors.accent
            : theme.colors.surface2,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export type AiTextHintTone = AiTextTone | "muted";

export function AiTextHint({
  children,
  theme,
  tone = "muted",
}: {
  children: ReactNode;
  theme: AiTextTheme;
  tone?: AiTextHintTone;
}) {
  const color =
    tone === "muted" ? theme.colors.foregroundMuted : toneColor(theme, tone);
  return (
    <Text style={{ color, fontSize: 12, lineHeight: 17 }}>{children}</Text>
  );
}

const cardStyle: ViewStyle = {
  borderWidth: 1,
  borderRadius: 10,
  padding: 12,
  gap: 10,
};

export function AiTextPanel({
  theme,
  children,
  testID,
}: {
  theme: AiTextTheme;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        cardStyle,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function AiTextRow({
  label,
  detail,
  value,
  tone = "default",
  theme,
}: {
  label: string;
  detail?: string | null;
  value: string;
  tone?: AiTextTone;
  theme: AiTextTheme;
}) {
  const color = toneColor(theme, tone);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>
          {label}
        </Text>
        {detail ? (
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 11,
              lineHeight: 16,
              marginTop: 2,
            }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          color,
          fontSize: 12,
          fontWeight: "600",
          flexShrink: 1,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Human byte size for storage rows ("1.2 GB", "840 KB", "—"). */
export function formatAiTextBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}
