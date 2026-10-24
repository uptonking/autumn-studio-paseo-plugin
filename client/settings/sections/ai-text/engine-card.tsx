import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSelect } from "@getpaseo/plugin/client/ui";
import {
  isAiTextEngineOperationVisible,
  revealAiTextPath,
  type AiTextEngineDescriptor,
  type AiTextEngineEnvironment,
  type AiTextEngineOperation,
  type AiTextProfile,
} from "../../../../shared/contracts.js";
import {
  EngineOperationPanel,
  type useEngineOperation,
} from "./engine-operation-task.js";
import {
  AiTextAction,
  AiTextBadge,
  AiTextHint,
  AiTextPanel,
  AiTextRow,
  formatAiTextBytes,
  type AiTextTheme,
  type AiTextTone,
} from "./ui.js";

export type EnvironmentState =
  /** `previous` keeps the card populated and its sort position stable while a
   *  refresh runs, instead of dropping to "loading" and jumping around. */
  | { status: "loading"; previous?: AiTextEngineEnvironment }
  | { status: "ready"; environment: AiTextEngineEnvironment }
  | { status: "error"; message: string };

export type EngineOperationApi = ReturnType<typeof useEngineOperation>;

export function environmentOf(
  state: EnvironmentState | undefined,
): AiTextEngineEnvironment | null {
  if (!state) return null;
  if (state.status === "ready") return state.environment;
  if (state.status === "loading") return state.previous ?? null;
  return null;
}

function environmentTone(
  environment: AiTextEngineEnvironment | null,
): AiTextTone {
  if (!environment) return "default";
  if (environment.status === "ready") return "success";
  if (environment.status === "needs-setup") return "warning";
  if (environment.status === "unavailable") return "danger";
  return "default";
}

function environmentLabel(environment: AiTextEngineEnvironment | null): string {
  if (!environment) return "Unknown";
  switch (environment.status) {
    case "ready":
      return "Ready";
    case "needs-setup":
      return "Needs setup";
    case "unavailable":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function StorageRow({
  label,
  bytes,
  path,
  disabled,
  theme,
  onOpen,
  testID,
  openTestID,
}: {
  label: string;
  bytes: number | null;
  path: string;
  disabled: boolean;
  theme: AiTextTheme;
  onOpen(): void;
  testID: string;
  openTestID: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
        <AiTextRow
          label={label}
          detail={path}
          value={formatAiTextBytes(bytes)}
          theme={theme}
        />
      </View>
      <AiTextAction
        label="Open"
        onPress={onOpen}
        disabled={disabled}
        theme={theme}
        testID={openTestID}
      />
    </View>
  );
}

export function EngineCard({
  descriptor,
  state,
  disabled,
  theme,
  profiles,
  defaultProfileId,
  operation,
  onRefresh,
  onOpenProfile,
}: {
  descriptor: AiTextEngineDescriptor;
  state: EnvironmentState | undefined;
  disabled: boolean;
  theme: AiTextTheme;
  profiles: readonly AiTextProfile[];
  defaultProfileId: string;
  operation: EngineOperationApi;
  onRefresh(): void;
  onOpenProfile(profileId: string): void;
}) {
  const reveal = useRpc(revealAiTextPath);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  // Details start open; the toggle only remembers an explicit choice.
  const [userToggledDetails, setUserToggledDetails] = useState<
    boolean | null
  >(null);

  const environment = environmentOf(state);
  const detailsOpen = userToggledDetails ?? true;

  const relatedProfiles = profiles.filter(
    (profile) => profile.engineId === descriptor.id,
  );
  const visibleOperations = descriptor.operations.filter((op) =>
    isAiTextEngineOperationVisible(op, environment),
  );

  const handleReveal = useCallback(
    (kind: "engine-tool" | "engine-models") => {
      setRevealMessage(null);
      reveal({ kind, engineId: descriptor.id }).then(
        (result) => setRevealMessage(result.message),
        (error: unknown) =>
          setRevealMessage(
            error instanceof Error
              ? error.message
              : "Could not open the folder.",
          ),
      );
    },
    [descriptor.id, reveal],
  );

  const storage = environment?.storage ?? null;
  const activeRun =
    operation.operationRun &&
    operation.operationRun.engineId === descriptor.id
      ? operation.operationRun
      : null;
  // An installed engine pins its version inputs to the installed release, so
  // the card never offers "latest" for something that already has a version.
  // Not-installed engines keep the blank-means-latest default.
  const installedVersion = environment?.version ?? null;
  const optionDefaults: Record<string, string> | undefined = installedVersion
    ? { version: installedVersion }
    : undefined;
  const effectiveOptionValue = (
    op: AiTextEngineOperation,
    optionKey: string,
    fallback: string,
  ): string =>
    operation.operationOptions[`${descriptor.id}:${op.id}:${optionKey}`] ??
    optionDefaults?.[optionKey] ??
    fallback;

  return (
    <AiTextPanel
      theme={theme}
      testID={`file-explorer-ai-text-engine-${descriptor.id}`}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 14,
            fontWeight: "700",
          }}
        >
          {descriptor.label}
        </Text>
        <AiTextBadge
          label={environmentLabel(environment)}
          tone={environmentTone(environment)}
          theme={theme}
          testID={`file-explorer-ai-text-engine-status-${descriptor.id}`}
        />
        {environment?.version ? (
          <AiTextBadge label={`v${environment.version}`} theme={theme} />
        ) : null}
        {environment?.updateAvailable && environment.latestVersion ? (
          <AiTextBadge
            label={`v${environment.version ?? "?"} → ${environment.latestVersion}`}
            tone="warning"
            theme={theme}
            testID={`file-explorer-ai-text-engine-update-${descriptor.id}`}
          />
        ) : null}
        <View style={{ flexGrow: 1 }} />
        <AiTextAction
          label={detailsOpen ? "▾" : "▸"}
          onPress={() => setUserToggledDetails(!detailsOpen)}
          theme={theme}
          testID={`file-explorer-ai-text-engine-toggle-${descriptor.id}`}
        />
      </View>
      <AiTextHint theme={theme}>{descriptor.description}</AiTextHint>

      {state?.status === "loading" ? (
        <AiTextHint theme={theme}>Detecting…</AiTextHint>
      ) : null}
      {state?.status === "error" ? (
        <AiTextHint theme={theme} tone="danger">
          {state.message}
        </AiTextHint>
      ) : null}

      {detailsOpen && environment ? (
        <>
          {environment.components.map((component) => (
            <AiTextRow
              key={component.id}
              label={component.label}
              detail={component.detail}
              value={
                component.version ?? component.status.replace("-", " ")
              }
              tone={
                component.status === "ready"
                  ? "success"
                  : component.status === "outdated"
                    ? "warning"
                    : component.status === "missing"
                      ? "danger"
                      : "default"
              }
              theme={theme}
            />
          ))}
          {environment.routes.map((route) => (
            <AiTextRow
              key={route.id}
              label={route.label}
              detail={route.message}
              value={route.status.replace("-", " ")}
              tone={
                route.status === "ready"
                  ? "success"
                  : route.status === "needs-setup"
                    ? "warning"
                    : route.status === "unavailable"
                      ? "danger"
                      : "default"
              }
              theme={theme}
            />
          ))}
          {Object.entries(environment.details).map(([key, value]) => (
            <AiTextRow key={key} label={key} value={value} theme={theme} />
          ))}
          {environment.recommendations.length > 0 ? (
            <View style={{ gap: 2 }}>
              {environment.recommendations.map((recommendation, index) => (
                <AiTextHint key={index} theme={theme} tone="warning">
                  • {recommendation}
                </AiTextHint>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {storage?.enginePath ? (
        <StorageRow
          label="Engine files"
          bytes={storage.engineBytes}
          path={storage.enginePath}
          disabled={disabled}
          theme={theme}
          onOpen={() => handleReveal("engine-tool")}
          testID={`file-explorer-ai-text-engine-storage-engine-${descriptor.id}`}
          openTestID={`file-explorer-ai-text-engine-open-engine-${descriptor.id}`}
        />
      ) : null}
      {storage?.modelPath ? (
        <StorageRow
          label="Model cache"
          bytes={storage.modelBytes}
          path={storage.modelPath}
          disabled={disabled}
          theme={theme}
          onOpen={() => handleReveal("engine-models")}
          testID={`file-explorer-ai-text-engine-storage-models-${descriptor.id}`}
          openTestID={`file-explorer-ai-text-engine-open-models-${descriptor.id}`}
        />
      ) : null}
      {revealMessage ? (
        <AiTextHint theme={theme}>{revealMessage}</AiTextHint>
      ) : null}

      {relatedProfiles.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AiTextHint theme={theme}>Profiles using this engine:</AiTextHint>
          {relatedProfiles.map((profile) => (
            <AiTextAction
              key={profile.id}
              label={
                profile.id === defaultProfileId
                  ? `${profile.name} (default)`
                  : profile.name
              }
              onPress={() => onOpenProfile(profile.id)}
              disabled={disabled}
              theme={theme}
              testID={`file-explorer-ai-text-engine-profile-${descriptor.id}-${profile.id}`}
            />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <AiTextAction
          label="Refresh"
          onPress={onRefresh}
          disabled={disabled || state?.status === "loading"}
          theme={theme}
          testID={`file-explorer-ai-text-engine-refresh-${descriptor.id}`}
        />
        {visibleOperations.map((op) => {
          const key = `${descriptor.id}:${op.id}`;
          const isConfirming = operation.confirmOperation === key;
          return (
            <AiTextAction
              key={op.id}
              label={isConfirming ? `Confirm: ${op.label}` : op.label}
              onPress={() =>
                operation.handleOperationPress(descriptor, op, optionDefaults)
              }
              disabled={disabled || operation.operationBusy}
              tone={isConfirming ? "danger" : "default"}
              theme={theme}
              testID={`file-explorer-ai-text-engine-op-${descriptor.id}-${op.id}`}
            />
          );
        })}
      </View>
      {visibleOperations
        .filter((op) => op.options.length > 0)
        .map((op: AiTextEngineOperation) => (
          <View key={`${op.id}:options`} style={{ gap: 6 }}>
            {op.options.map((option) => {
              const key = `${descriptor.id}:${op.id}:${option.key}`;
              const value = effectiveOptionValue(
                op,
                option.key,
                option.defaultValue,
              );
              if (option.kind === "text") {
                return (
                  <SettingsInput
                    // Remount when detection pins a version so the
                    // uncontrolled input adopts it; typing never changes this
                    // key, so focus is kept while editing.
                    key={`${key}:${installedVersion ?? ""}`}
                    label={`${op.label} · ${option.label}`}
                    initialValue={value}
                    placeholder={value || "latest"}
                    disabled={disabled || operation.operationBusy}
                    onChangeText={(next: string) =>
                      operation.setOperationOptions((current) => ({
                        ...current,
                        [key]: next,
                      }))
                    }
                    testID={`file-explorer-ai-text-engine-op-option-${descriptor.id}-${op.id}-${option.key}`}
                  />
                );
              }
              return (
                <SettingsSelect
                  key={key}
                  label={`${op.label} · ${option.label}`}
                  value={value}
                  options={option.options}
                  disabled={disabled || operation.operationBusy}
                  onValueChange={(next: string) =>
                    operation.setOperationOptions((current) => ({
                      ...current,
                      [key]: next,
                    }))
                  }
                  testID={`file-explorer-ai-text-engine-op-option-${descriptor.id}-${op.id}-${option.key}`}
                />
              );
            })}
          </View>
        ))}

      {activeRun ? (
        <EngineOperationPanel
          descriptor={descriptor}
          run={activeRun}
          onCancel={operation.cancelOperation}
          theme={theme}
        />
      ) : null}
    </AiTextPanel>
  );
}
