import { useEffect } from "react";
import { Platform } from "react-native";
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

let latestOpenScreen: PluginSidebarItemProps["openScreen"] | null = null;
let settingsPreloader: (() => void) | null = null;

export function setSettingsScreenPreloader(preload: () => void): void {
  settingsPreloader = preload;
}

export function openFileExplorerSettingsScreen(section?: string): void {
  settingsPreloader?.();
  latestOpenScreen?.(
    section
      ? { screenId: "settings", params: { section } }
      : { screenId: "settings" },
  );
}

export function FileExplorerSidebarItem({
  currentScreen,
  openScreen,
}: PluginSidebarItemProps) {
  useEffect(() => {
    latestOpenScreen = openScreen;
    settingsPreloader?.();
    return () => {
      if (latestOpenScreen === openScreen) {
        latestOpenScreen = null;
      }
    };
  }, [openScreen]);

  if (Platform.OS !== "web") return null;

  const isActive = currentScreen?.screenId === "settings";

  return (
    <SidebarRow
      icon="FolderTree"
      label="File Explorer"
      active={isActive}
      onPress={() => {
        settingsPreloader?.();
        openScreen({ screenId: "settings" });
      }}
    />
  );
}
