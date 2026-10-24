import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { AiTextHint, type AiTextTheme } from "./ui.js";

export interface WorkspaceOption {
  id: string;
  label: string;
  /** Sort key (latest chat or workspace activity ISO time); "" = unknown. */
  recencyKey: string;
}

/**
 * Searchable workspace picker: closed it shows the selected workspace like an
 * input, opened it lists recent workspaces (most recently used first) with a
 * search box on top. Selecting an item closes the list.
 */
export function WorkspacePicker({
  value,
  options,
  disabled,
  theme,
  onSelect,
}: {
  value: string;
  options: readonly WorkspaceOption[];
  disabled: boolean;
  theme: AiTextTheme;
  onSelect(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((option) => option.id === value);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.id.toLowerCase().includes(needle),
      )
    : options;

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 12, gap: 4 }}>
      <AiTextHint theme={theme} tone="default">
        Workspace
      </AiTextHint>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          setOpen((isOpen) => !isOpen);
          setQuery("");
        }}
        testID="file-explorer-ai-text-stats-workspace"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: theme.colors.surface2,
          borderRadius: 7,
          paddingHorizontal: 10,
          paddingVertical: 7,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: theme.colors.foreground,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {current?.label ?? "Select a workspace…"}
        </Text>
        <Text
          style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}
        >
          {open ? "▴" : "▾"}
        </Text>
      </Pressable>

      {open ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 7,
            padding: 6,
            gap: 4,
          }}
          testID="file-explorer-ai-text-stats-workspace-list"
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search workspaces…"
            placeholderTextColor={theme.colors.foregroundMuted}
            editable={!disabled}
            autoFocus
            style={{
              backgroundColor: theme.colors.surface2,
              borderRadius: 7,
              paddingHorizontal: 10,
              paddingVertical: 6,
              color: theme.colors.foreground,
              fontSize: 12,
            }}
            testID="file-explorer-ai-text-stats-workspace-search"
          />
          {filtered.slice(0, 8).map((option) => {
            const selected = option.id === value;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => {
                  onSelect(option.id);
                  setOpen(false);
                  setQuery("");
                }}
                testID={`file-explorer-ai-text-stats-workspace-option-${option.id}`}
                style={{
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: selected
                    ? theme.colors.surface2
                    : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: selected
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                    fontSize: 12,
                    fontWeight: selected ? "700" : "500",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
          {filtered.length === 0 ? (
            <AiTextHint theme={theme}>No matching workspace.</AiTextHint>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
