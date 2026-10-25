import type { ComponentType } from 'react';
import type { PluginSurfaceProps, SettingsState } from '@getpaseo/plugin/client';
import type { autumnStudioSettings, AutumnStudioSettingsValues } from '../../shared/settings.js';

export type ReadyAutumnStudioSettings = Extract<
  SettingsState<typeof autumnStudioSettings.schema>,
  { status: 'ready' }
>;

export interface SettingsSectionComponentProps {
  settings: ReadyAutumnStudioSettings;
  values: AutumnStudioSettingsValues;
  disabled: boolean;
  theme: PluginSurfaceProps['theme'];
  updateValues: (
    updater: (current: AutumnStudioSettingsValues) => AutumnStudioSettingsValues,
  ) => void;
}

export type SettingsSidebarGroup = 'primary' | 'more';

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
  isVisible?: (values: AutumnStudioSettingsValues) => boolean;
  /** Optional section-scoped reset updater. */
  resetSection?: (current: AutumnStudioSettingsValues) => AutumnStudioSettingsValues;
  /** Section UI component. */
  Component: ComponentType<SettingsSectionComponentProps>;
}
