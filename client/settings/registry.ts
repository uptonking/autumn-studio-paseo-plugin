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

export interface SettingsSectionDescriptor {
  /** Unique section id (e.g. "general", "pdf", "markdown", "code", "docx"). */
  id: string;
  /** Display heading for the section. */
  title: string;
  /** Sort order (lower renders higher on the page). */
  order: number;
  /** Optional visibility predicate given current settings values. */
  isVisible?: (values: FileExplorerSettingsValues) => boolean;
  /** Section UI component. */
  Component: ComponentType<SettingsSectionComponentProps>;
}
