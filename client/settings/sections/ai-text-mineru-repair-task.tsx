import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import type { AiTextTaskSnapshot } from "../../../shared/contracts.js";
import { formatTaskElapsed } from "../../ai-text/ai-text-task-progress.js";
import type { EnvironmentTheme } from "./ai-text-mineru-environment-parts.js";

const repairBlockStyle: ViewStyle = {
  padding: 16,
  gap: 8,
};

const progressTrackStyle: ViewStyle = {
  height: 4,
  borderRadius: 2,
  overflow: "hidden",
};

const logBoxStyle: ViewStyle = {
  maxHeight: 120,
  borderWidth: 1,
  borderRadius: 8,
};

function taskStatusLabel(task: AiTextTaskSnapshot): string {
  switch (task.status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Complete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return task.status;
  }
}

export function MineruRepairTaskBlock({
  task,
  theme,
  onCancel,
}: {
  task: AiTextTaskSnapshot;
  theme: EnvironmentTheme;
  onCancel: () => void;
}) {
  const active = task.status === "queued" || task.status === "running";
  const statusColor =
    task.status === "succeeded"
      ? theme.colors.statusSuccess
      : task.status === "failed"
        ? theme.colors.statusDanger
        : active
          ? theme.colors.statusWarning
          : theme.colors.foregroundMuted;
  const percent =
    task.progressPercent === null || !Number.isFinite(task.progressPercent)
      ? null
      : Math.max(0, Math.min(100, task.progressPercent));

  return (
    <View testID="mineru-repair-task" style={repairBlockStyle}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text
          style={{
            flex: 1,
            color: theme.colors.foreground,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {task.phase || "MinerU repair"}
        </Text>
        <Text style={{ color: statusColor, fontSize: 12, fontWeight: "600" }}>
          {taskStatusLabel(task)}
        </Text>
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatTaskElapsed(task.elapsedMs)}
        </Text>
      </View>
      {task.error || task.message ? (
        <Text
          style={{
            color: task.error
              ? theme.colors.statusDanger
              : theme.colors.foregroundMuted,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {task.error ?? task.message}
        </Text>
      ) : null}
      {percent !== null ? (
        <View
          style={[
            progressTrackStyle,
            { backgroundColor: theme.colors.surface2 },
          ]}
        >
          <View
            style={{
              height: "100%",
              width: `${percent}%`,
              backgroundColor: theme.colors.statusWarning,
            }}
          />
        </View>
      ) : null}
      {task.logTail.length > 0 ? (
        <ScrollView
          style={[
            logBoxStyle,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface0,
            },
          ]}
        >
          <Text
            style={{
              padding: 8,
              color: theme.colors.foregroundMuted,
              fontFamily: Platform.select({
                ios: "Menlo",
                android: "monospace",
                default: "monospace",
              }),
              fontSize: 11,
              lineHeight: 15,
            }}
          >
            {task.logTail.slice(-8).join("\n")}
          </Text>
        </ScrollView>
      ) : null}
      {active ? (
        <Pressable
          testID="mineru-repair-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface0,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Cancel
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
