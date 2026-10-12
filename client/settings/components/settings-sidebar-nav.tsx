import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  getFormatBehaviorConfig,
  type FileExplorerSettingsValues,
} from "../../../shared/settings.js";
import type { SettingsSectionDescriptor } from "../registry.js";

export const MORE_FORMATS_NAV_ID = "more";

export interface ResolvedNavState {
  activeNavId: string;
  moreFilterId: string;
}

export function resolveNavStateFromSectionParam(
  sectionParam: string | undefined,
  primarySections: readonly SettingsSectionDescriptor[],
  moreSections: readonly SettingsSectionDescriptor[],
): ResolvedNavState {
  const defaultPrimaryId = primarySections[0]?.id ?? "general";
  if (!sectionParam) {
    return { activeNavId: defaultPrimaryId, moreFilterId: "all" };
  }
  if (sectionParam === MORE_FORMATS_NAV_ID && moreSections.length > 0) {
    return { activeNavId: MORE_FORMATS_NAV_ID, moreFilterId: "all" };
  }
  if (primarySections.some((section) => section.id === sectionParam)) {
    return { activeNavId: sectionParam, moreFilterId: "all" };
  }
  if (moreSections.some((section) => section.id === sectionParam)) {
    return { activeNavId: MORE_FORMATS_NAV_ID, moreFilterId: sectionParam };
  }
  return { activeNavId: defaultPrimaryId, moreFilterId: "all" };
}

export function SectionMetaBanner({
  section,
  theme,
}: {
  section: SettingsSectionDescriptor;
  theme: PluginSurfaceProps["theme"];
}) {
  if (
    !section.description &&
    (!section.extensions || section.extensions.length === 0)
  ) {
    return null;
  }
  return (
    <View
      testID={`file-explorer-settings-meta-${section.id}`}
      style={{
        marginBottom: 12,
        paddingHorizontal: 2,
      }}
    >
      {section.description ? (
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {section.description}
        </Text>
      ) : null}
      {section.extensions && section.extensions.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: section.description ? 8 : 0,
          }}
        >
          {section.extensions.map((ext) => (
            <View
              key={ext}
              style={{
                backgroundColor: theme.colors.surface1,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  color: theme.colors.foregroundMuted,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {ext}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function SettingsSidebarNav({
  primarySections,
  moreSections,
  activePrimarySectionId,
  isMoreActive,
  values,
  theme,
  compact,
  onSelectNav,
}: {
  primarySections: readonly SettingsSectionDescriptor[];
  moreSections: readonly SettingsSectionDescriptor[];
  activePrimarySectionId: string | null;
  isMoreActive: boolean;
  values: FileExplorerSettingsValues;
  theme: PluginSurfaceProps["theme"];
  compact?: boolean;
  onSelectNav: (navId: string) => void;
}) {
  const moreSubtitle = useMemo(
    () => moreSections.map((section) => section.title).join(", "),
    [moreSections],
  );

  return (
    <View
      testID="file-explorer-settings-sidebar"
      style={{
        width: compact ? "100%" : 220,
        flexShrink: 0,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 8,
        gap: 4,
      }}
    >
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          paddingHorizontal: 10,
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        Settings
      </Text>
      {primarySections.map((section) => {
        const isSelected =
          !isMoreActive && activePrimarySectionId === section.id;
        const behaviorBadge = section.formatKind
          ? getFormatBehaviorConfig(values, section.formatKind)
              .defaultOpenBehavior === "editor"
            ? "Editor"
            : "Viewer"
          : null;

        return (
          <Pressable
            key={section.id}
            testID={`file-explorer-settings-nav-${section.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelectNav(section.id)}
            style={
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                backgroundColor: isSelected
                  ? theme.colors.surface2
                  : "transparent",
                borderWidth: 0,
                outlineWidth: 0,
                outlineStyle: "none",
              } as never
            }
          >
            <Text
              style={{
                color: isSelected
                  ? theme.colors.foreground
                  : theme.colors.foregroundMuted,
                fontSize: 14,
                fontWeight: isSelected ? "600" : "500",
              }}
            >
              {section.title}
            </Text>
            {behaviorBadge ? (
              <View
                style={{
                  backgroundColor: theme.colors.surface0,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.foregroundMuted,
                    fontSize: 11,
                    fontWeight: "500",
                  }}
                >
                  {behaviorBadge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {moreSections.length > 0 ? (
        <>
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginVertical: 4,
              marginHorizontal: 6,
            }}
          />
          <Pressable
            testID="file-explorer-settings-nav-more"
            accessibilityRole="tab"
            accessibilityState={{ selected: isMoreActive }}
            onPress={() => onSelectNav(MORE_FORMATS_NAV_ID)}
            style={
              {
                flexDirection: "column",
                gap: 2,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                backgroundColor: isMoreActive
                  ? theme.colors.surface2
                  : "transparent",
                borderWidth: 0,
                outlineWidth: 0,
                outlineStyle: "none",
              } as never
            }
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: isMoreActive
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                  fontSize: 14,
                  fontWeight: isMoreActive ? "600" : "500",
                }}
              >
                More Formats
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.surface0,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.foregroundMuted,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {moreSections.length}
                </Text>
              </View>
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.foregroundMuted,
                fontSize: 11,
              }}
            >
              {moreSubtitle}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export function MoreFormatsFilterBar({
  moreSections,
  moreFilterId,
  theme,
  onSelectFilter,
}: {
  moreSections: readonly SettingsSectionDescriptor[];
  moreFilterId: string;
  theme: PluginSurfaceProps["theme"];
  onSelectFilter: (filterId: string) => void;
}) {
  return (
    <View
      testID="file-explorer-settings-more-filters"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}
    >
      <Pressable
        testID="file-explorer-settings-more-filter-all"
        accessibilityRole="tab"
        accessibilityState={{ selected: moreFilterId === "all" }}
        onPress={() => onSelectFilter("all")}
        style={
          {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor:
              moreFilterId === "all"
                ? theme.colors.surface2
                : theme.colors.surface1,
            outlineWidth: 0,
            outlineStyle: "none",
          } as never
        }
      >
        <Text
          style={{
            color:
              moreFilterId === "all"
                ? theme.colors.foreground
                : theme.colors.foregroundMuted,
            fontSize: 12,
            fontWeight: moreFilterId === "all" ? "600" : "500",
          }}
        >
          All ({moreSections.length})
        </Text>
      </Pressable>
      {moreSections.map((section) => {
        const isPillSelected = moreFilterId === section.id;
        return (
          <Pressable
            key={section.id}
            testID={`file-explorer-settings-more-filter-${section.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isPillSelected }}
            onPress={() => onSelectFilter(section.id)}
            style={
              {
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: isPillSelected
                  ? theme.colors.surface2
                  : theme.colors.surface1,
                outlineWidth: 0,
                outlineStyle: "none",
              } as never
            }
          >
            <Text
              style={{
                color: isPillSelected
                  ? theme.colors.foreground
                  : theme.colors.foregroundMuted,
                fontSize: 12,
                fontWeight: isPillSelected ? "600" : "500",
              }}
            >
              {section.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
