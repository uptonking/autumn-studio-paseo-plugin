import { useCallback, useMemo } from "react";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import {
  getFormatBehaviorConfig,
  withFormatBehaviorConfig,
  type FileExplorerSettingsValues,
  type FileFormatOpenBehavior,
} from "../../../shared/settings.js";
import type { FileSystemViewerKind } from "../../vendor/file-system/types.js";
import {
  getFormatSurfaceProviders,
  resolveSurfaceProviderMeta,
} from "../../viewers/provider-catalog.js";

const OPEN_BEHAVIOR_OPTIONS: readonly {
  label: string;
  value: FileFormatOpenBehavior;
}[] = [
  { label: "Open with default viewer (Default)", value: "viewer" },
  { label: "Open with default editor", value: "editor" },
];

export interface FormatOpenBehaviorFieldsProps {
  kind: FileSystemViewerKind;
  formatLabel: string;
  values: FileExplorerSettingsValues;
  disabled: boolean;
  updateValues: (
    updater: (current: FileExplorerSettingsValues) => FileExplorerSettingsValues
  ) => void;
}

export function FormatOpenBehaviorFields({
  kind,
  formatLabel,
  values,
  disabled,
  updateValues,
}: FormatOpenBehaviorFieldsProps) {
  const behaviorConfig = useMemo(
    () => getFormatBehaviorConfig(values, kind),
    [kind, values]
  );

  const viewerProviders = useMemo(
    () => getFormatSurfaceProviders(kind, "viewer"),
    [kind]
  );
  const editorProviders = useMemo(
    () => getFormatSurfaceProviders(kind, "editor"),
    [kind]
  );

  const viewerOptions = useMemo(
    () =>
      viewerProviders.map((provider) => ({
        label: provider.label,
        value: provider.id,
      })),
    [viewerProviders]
  );

  const editorOptions = useMemo(
    () =>
      editorProviders.map((provider) => ({
        label: provider.label,
        value: provider.id,
      })),
    [editorProviders]
  );

  const resolvedViewerId =
    resolveSurfaceProviderMeta(kind, "viewer", behaviorConfig.defaultViewer)
      ?.id ??
    viewerOptions[0]?.value ??
    "";
  const resolvedEditorId =
    resolveSurfaceProviderMeta(kind, "editor", behaviorConfig.defaultEditor)
      ?.id ??
    editorOptions[0]?.value ??
    "";

  const handleOpenBehaviorChange = useCallback(
    (defaultOpenBehavior: FileFormatOpenBehavior) => {
      updateValues((current) =>
        withFormatBehaviorConfig(current, kind, { defaultOpenBehavior })
      );
    },
    [kind, updateValues]
  );

  const handleDefaultViewerChange = useCallback(
    (defaultViewer: string) => {
      updateValues((current) =>
        withFormatBehaviorConfig(current, kind, { defaultViewer })
      );
    },
    [kind, updateValues]
  );

  const handleDefaultEditorChange = useCallback(
    (defaultEditor: string) => {
      updateValues((current) =>
        withFormatBehaviorConfig(current, kind, { defaultEditor })
      );
    },
    [kind, updateValues]
  );

  return (
    <>
      <SettingsSelect
        label="Default open behavior"
        hint={`Choose whether ${formatLabel} files open in the viewer or editor UX by default when clicked.`}
        value={behaviorConfig.defaultOpenBehavior}
        options={OPEN_BEHAVIOR_OPTIONS}
        disabled={disabled}
        onValueChange={handleOpenBehaviorChange}
        testID={`file-explorer-setting-${kind}-open-behavior`}
      />
      {viewerOptions.length > 0 ? (
        <SettingsSelect
          label={`Default ${formatLabel} viewer`}
          hint={`Viewer engine used when opening ${formatLabel} files in viewer mode.`}
          value={resolvedViewerId}
          options={viewerOptions}
          disabled={disabled}
          onValueChange={handleDefaultViewerChange}
          testID={`file-explorer-setting-${kind}-default-viewer`}
        />
      ) : null}
      {editorOptions.length > 0 ? (
        <SettingsSelect
          label={`Default ${formatLabel} editor`}
          hint={`Editor engine used when opening ${formatLabel} files in editor mode.`}
          value={resolvedEditorId}
          options={editorOptions}
          disabled={disabled}
          onValueChange={handleDefaultEditorChange}
          testID={`file-explorer-setting-${kind}-default-editor`}
        />
      ) : null}
    </>
  );
}
