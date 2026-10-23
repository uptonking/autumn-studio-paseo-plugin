import type { ReactNode } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type {
  AiTextEnvironment,
  MineruTier,
} from "../../../shared/contracts.js";

export type EnvironmentTheme = PluginSurfaceProps["theme"];
type StatusTone = "ok" | "warn" | "danger" | "muted";

const rowStyle: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  paddingVertical: 16,
  paddingHorizontal: 16,
};

const labelColumnStyle: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 180,
  minWidth: 0,
};

const valueColumnStyle: ViewStyle = {
  alignItems: "flex-end",
  flexShrink: 1,
  maxWidth: "100%",
};

const valueLineStyle: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  gap: 6,
};

const rowTitleStyle: TextStyle = {
  fontSize: 14,
  fontWeight: "500",
};

const rowHintStyle: TextStyle = {
  fontSize: 12,
  lineHeight: 17,
  marginTop: 2,
};

const valueTextStyle: TextStyle = {
  flexShrink: 1,
  fontSize: 14,
  fontWeight: "600",
  textAlign: "right",
};

const detailTextStyle: TextStyle = {
  fontSize: 12,
  lineHeight: 17,
  marginTop: 2,
  textAlign: "right",
};

const calloutStyle: ViewStyle = {
  marginHorizontal: 16,
  marginVertical: 12,
  padding: 12,
  borderWidth: 1,
  borderRadius: 10,
  gap: 8,
};

const errorBlockStyle: ViewStyle = {
  marginHorizontal: 16,
  marginVertical: 12,
  padding: 12,
  borderWidth: 1,
  borderRadius: 10,
};

function toneColor(theme: EnvironmentTheme, tone: StatusTone): string {
  switch (tone) {
    case "ok":
      return theme.colors.statusSuccess;
    case "warn":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

export function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EnvironmentRow({
  label,
  hint,
  value,
  detail,
  tone,
  theme,
  first,
}: {
  label: string;
  hint: string;
  value: string;
  detail?: string;
  tone: StatusTone;
  theme: EnvironmentTheme;
  first?: boolean;
}) {
  const color = toneColor(theme, tone);
  return (
    <View
      style={[
        rowStyle,
        first
          ? null
          : { borderTopWidth: 1, borderTopColor: theme.colors.border },
      ]}
    >
      <View style={labelColumnStyle}>
        <Text style={[rowTitleStyle, { color: theme.colors.foreground }]}>
          {label}
        </Text>
        <Text style={[rowHintStyle, { color: theme.colors.foregroundMuted }]}>
          {hint}
        </Text>
      </View>
      <View style={valueColumnStyle}>
        <View style={valueLineStyle}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: color,
            }}
          />
          <Text style={[valueTextStyle, { color }]}>{value}</Text>
        </View>
        {detail ? (
          <Text
            style={[
              detailTextStyle,
              { color: theme.colors.foregroundMuted },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function InsetBlock({
  title,
  titleColor,
  theme,
  children,
  testID,
}: {
  title: string;
  titleColor?: string;
  theme: EnvironmentTheme;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        calloutStyle,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
        },
      ]}
    >
      <Text
        style={{
          color: titleColor ?? theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function MineruEnvironmentLoading({
  theme,
}: {
  theme: EnvironmentTheme;
}) {
  return (
    <View style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
        }}
      >
        Detecting MinerU, uv, models, and the local API…
      </Text>
    </View>
  );
}

export function MineruEnvironmentError({
  message,
  theme,
  testID,
}: {
  message: string;
  theme: EnvironmentTheme;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        errorBlockStyle,
        {
          borderColor: theme.colors.statusDanger,
          backgroundColor: theme.colors.surface0,
        },
      ]}
    >
      <Text
        style={{
          color: theme.colors.statusDanger,
          fontSize: 12,
          lineHeight: 17,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export function MineruEnvironmentStatus({
  environment,
  tier,
  theme,
}: {
  environment: AiTextEnvironment;
  tier: MineruTier;
  theme: EnvironmentTheme;
}) {
  const missingRepos =
    environment.models?.repos.filter((repo) => !repo.ready) ?? [];

  return (
    <View testID="mineru-environment-status">
      <EnvironmentRow
        first
        theme={theme}
        label="MinerU Kit"
        hint="Batch parser used for local layout extraction."
        value={
          environment.kit?.available
            ? (environment.kit.version ?? "Installed")
            : "Not installed"
        }
        detail={
          environment.kit?.available
            ? (environment.kit.resolvedPath ?? "Path resolved")
            : "Install with uv tool install mineru."
        }
        tone={environment.kit?.available ? "ok" : "warn"}
      />
      <EnvironmentRow
        theme={theme}
        label="mineru CLI"
        hint="Document-library CLI. Layout extraction uses MinerU Kit."
        value={
          environment.mineru?.available
            ? (environment.mineru.version ?? "Detected")
            : "Not detected"
        }
        detail={
          environment.mineru?.available
            ? environment.mineru.kind
            : "Optional for local parsing."
        }
        tone={environment.mineru?.available ? "ok" : "muted"}
      />
      <EnvironmentRow
        theme={theme}
        label="uv"
        hint="Needed to install or repair MinerU."
        value={
          environment.uv?.available
            ? (environment.uv.version ?? "Detected")
            : "Not detected"
        }
        detail={
          environment.uv?.available
            ? (environment.uv.resolvedPath ?? "Path resolved")
            : "Install uv to manage MinerU."
        }
        tone={environment.uv?.available ? "ok" : "muted"}
      />
      <EnvironmentRow
        theme={theme}
        label="Install kind"
        hint="Detected from the resolved MinerU Kit path."
        value={environment.installKind}
        detail={
          environment.installKind === "uv-tool"
            ? "Reinstall is available below."
            : environment.installKind === "unknown"
              ? "Install MinerU with uv to enable repair."
              : "Repair with the package manager that installed it."
        }
        tone={environment.installKind === "unknown" ? "warn" : "ok"}
      />
      <EnvironmentRow
        theme={theme}
        label="Models"
        hint={`Model set used for ${tier} tier parsing.`}
        value={
          !environment.models
            ? "Not detected"
            : environment.models.tierReady
              ? "Ready"
              : "Incomplete"
        }
        detail={
          environment.models
            ? `${environment.models.tier} tier${
                environment.models.baseDir
                  ? ` · ${environment.models.baseDir}`
                  : ""
              }`
            : "Install MinerU Kit, then refresh."
        }
        tone={environment.models?.tierReady ? "ok" : "warn"}
      />
      <EnvironmentRow
        theme={theme}
        label="Local API"
        hint="Optional. Used when local models are not ready."
        value={environment.localApi?.reachable ? "Reachable" : "Not reachable"}
        detail={
          environment.localApi
            ? `${environment.localApi.url}${
                environment.localApi.version
                  ? ` · ${environment.localApi.version}`
                  : ""
              }`
            : "Not configured"
        }
        tone={environment.localApi?.reachable ? "ok" : "muted"}
      />

      {missingRepos.length > 0 ? (
        <InsetBlock
          title="Missing model files"
          titleColor={theme.colors.statusWarning}
          theme={theme}
          testID="mineru-environment-missing-models"
        >
          {missingRepos.map((repo) => (
            <View key={repo.name} style={{ gap: 2 }}>
              <Text
                style={{
                  color: theme.colors.foreground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {repo.name}
              </Text>
              <Text
                style={{
                  color: theme.colors.foregroundMuted,
                  fontSize: 12,
                  lineHeight: 17,
                }}
              >
                {repo.missingPaths.length > 0
                  ? repo.missingPaths.join("\n")
                  : "Run Download / repair models to restore this repository."}
              </Text>
            </View>
          ))}
        </InsetBlock>
      ) : null}

      {environment.recommendations.length > 0 ? (
        <InsetBlock
          title="Recommendations"
          theme={theme}
          testID="mineru-environment-recommendations"
        >
          {environment.recommendations.map((recommendation, idx) => (
            <Text
              key={idx}
              style={{
                color: theme.colors.foregroundMuted,
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              • {recommendation}
            </Text>
          ))}
        </InsetBlock>
      ) : null}
    </View>
  );
}

