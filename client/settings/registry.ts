import type { ComponentType } from "react";
import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import type {
  fileExplorerSettings,
  FileExplorerSettingsValues,
} from "../../shared/settings.js";

export type ReadyFileExplorerSettings = Extract<
  SettingsState<typeof fileExplorerSettings.schema>,
  { status: "ready" }
>;

export interface SettingsSectionComponentProps {
  settings: ReadyFileExplorerSettings;
  values: FileExplorerSettingsValues;
  disabled: boolean;
  theme: PluginSurfaceProps["theme"];
  updateValues: (
    updater: (current: FileExplorerSettingsValues) => FileExplorerSettingsValues
  ) => void;
}

export type SettingsSidebarGroup = "primary" | "more";

export interface SettingsSectionDescriptor {
  /** Unique section id (e.g. "general", "pdf", "xlsx", "text", "image", "docx"). */
  id: string;
  /** Display heading for the section. */
  title: string;
  /** Sort order (lower renders higher on the page). */
  order: number;
  /**
   * "primary" renders as its own top-level item in the left sidebar
   * (e.g. General, PDF, Excel).
   * "more" groups the section under the "More Formats" sidebar menu item
   * (e.g. Code & Text, Images, and future formats).
   */
  sidebarGroup?: SettingsSidebarGroup;
  /** Short subtitle describing what this section configures. */
  description?: string;
  /** File extensions governed by this format section (e.g. [".pdf"]). */
  extensions?: readonly string[];
  /** Format kind key for open-behavior lookup (e.g. "pdf", "xlsx", "text", "image"). */
  formatKind?: string;
  /** Optional visibility predicate given current settings values. */
  isVisible?: (values: FileExplorerSettingsValues) => boolean;
  /** Optional section-scoped reset updater. */
  resetSection?: (
    current: FileExplorerSettingsValues
  ) => FileExplorerSettingsValues;
  /** Section UI component. */
  Component: ComponentType<SettingsSectionComponentProps>;
}
