import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import {
  cancelAiTextTask,
  getAiTextEnvironment,
  getAiTextTask,
  startAiTextTask,
  type AiTextEnvironment,
  type AiTextTaskSnapshot,
  type MineruTier,
} from "../../../shared/contracts.js";
import {
  formatCheckedAt,
  MineruEnvironmentError,
  MineruEnvironmentLoading,
  MineruEnvironmentStatus,
  type EnvironmentTheme,
} from "./ai-text-mineru-environment-parts.js";
import { MineruRepairTaskBlock } from "./ai-text-mineru-repair-task.js";

/**
 * Settings screens render in the host app's React Native tree, not the plugin
 * shadow root, so the plugin stylesheet (and its Tailwind utilities) is not
 * loaded here. Use RN primitives and host theme colors instead of className.
 */
export function AiTextMineruEnvironmentSection({
  tier,
  enabled,
  theme,
}: {
  tier: MineruTier;
  enabled: boolean;
  theme: EnvironmentTheme;
}) {
  const fetchEnvironment = useRpc(getAiTextEnvironment);
  const startRepairTask = useRpc(startAiTextTask);
  const fetchRepairTask = useRpc(getAiTextTask);
  const cancelRepairTask = useRpc(cancelAiTextTask);
  const [environment, setEnvironment] = useState<AiTextEnvironment | null>(
    null,
  );
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [isEnvironmentLoading, setIsEnvironmentLoading] = useState(false);
  const [repairTaskId, setRepairTaskId] = useState<string | null>(null);
  const [repairTask, setRepairTask] = useState<AiTextTaskSnapshot | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [confirmingReinstall, setConfirmingReinstall] = useState(false);
  const environmentRequestRef = useRef(0);

  const loadEnvironment = useCallback(
    async (refresh = false) => {
      const requestId = ++environmentRequestRef.current;
      setIsEnvironmentLoading(true);
      setEnvironmentError(null);
      try {
        const result = await fetchEnvironment(refresh ? { refresh: true } : {});
        if (requestId !== environmentRequestRef.current) return;
        setEnvironment(result.environment);
      } catch (error) {
        if (requestId !== environmentRequestRef.current) return;
        setEnvironmentError(
          error instanceof Error
            ? error.message
            : "Could not inspect the local MinerU install",
        );
      } finally {
        if (requestId === environmentRequestRef.current) {
          setIsEnvironmentLoading(false);
        }
      }
    },
    [fetchEnvironment],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadEnvironment();
    return () => {
      environmentRequestRef.current += 1;
    };
  }, [enabled, loadEnvironment]);

  useEffect(() => {
    if (!repairTaskId) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await fetchRepairTask({ taskId: repairTaskId });
        if (cancelled) return;
        setRepairTask(result.task);
        if (
          result.task.status === "queued" ||
          result.task.status === "running"
        ) {
          timer = window.setTimeout(() => {
            void poll();
          }, 800);
          return;
        }
        setRepairTaskId(null);
        if (result.task.status === "succeeded") {
          void loadEnvironment(true);
        }
      } catch (error) {
        if (cancelled) return;
        setRepairTaskId(null);
        setRepairTask(null);
        setRepairError(
          error instanceof Error ? error.message : "MinerU repair failed",
        );
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [fetchRepairTask, loadEnvironment, repairTaskId]);

  const handleStartRepair = useCallback(
    async (kind: "models.download" | "cli.reinstall") => {
      setRepairError(null);
      setRepairTask(null);
      setConfirmingReinstall(false);
      try {
        const result = await startRepairTask({
          kind,
          ...(kind === "models.download" ? { tier, source: "auto" } : {}),
        });
        setRepairTaskId(result.taskId);
      } catch (error) {
        setRepairError(
          error instanceof Error ? error.message : "Could not start the repair",
        );
      }
    },
    [startRepairTask, tier],
  );

  const handleCancelRepair = useCallback(() => {
    if (!repairTaskId) return;
    void cancelRepairTask({ taskId: repairTaskId }).catch(() => undefined);
  }, [cancelRepairTask, repairTaskId]);

  if (!enabled) return null;

  const canRepairModels = Boolean(environment?.kit?.available);
  const canReinstall =
    environment?.installKind === "uv-tool" && environment.uv?.available;
  const busy = repairTaskId !== null;

  return (
    <SettingsSection
      title="MinerU Environment"
      info="Detected on the machine that runs the Paseo daemon. Refresh after installing MinerU or downloading models."
      testID="file-explorer-settings-mineru-environment"
    >
      <SettingsCard>
        <SettingsAction
          label="Auto-detected on this machine"
          hint={
            environment
              ? `Checked at ${formatCheckedAt(environment.checkedAt)}. Detection runs on the daemon host.`
              : "Detection runs on the machine that hosts the Paseo daemon."
          }
          actionLabel={isEnvironmentLoading ? "Checking…" : "Refresh"}
          disabled={isEnvironmentLoading || busy}
          onPress={() => void loadEnvironment(true)}
          testID="mineru-environment-refresh"
        />

        {isEnvironmentLoading && !environment ? (
          <MineruEnvironmentLoading theme={theme} />
        ) : null}

        {environment ? (
          <MineruEnvironmentStatus
            environment={environment}
            tier={tier}
            theme={theme}
          />
        ) : null}

        {canRepairModels ? (
          <SettingsAction
            label="Model files"
            hint={`Download or repair the ${tier} model set. Safe to run again.`}
            actionLabel={busy ? "Working…" : "Download / repair"}
            disabled={busy}
            onPress={() => void handleStartRepair("models.download")}
            testID="mineru-environment-download-models"
          />
        ) : null}

        {canReinstall ? (
          <>
            <SettingsAction
              label="Reinstall MinerU CLI"
              hint={
                confirmingReinstall
                  ? "This runs uv tool install --reinstall mineru and replaces the current CLI."
                  : "Only offered for uv tool installs."
              }
              actionLabel={
                confirmingReinstall ? "Confirm reinstall" : "Reinstall"
              }
              disabled={busy}
              onPress={() => {
                if (confirmingReinstall) {
                  void handleStartRepair("cli.reinstall");
                } else {
                  setConfirmingReinstall(true);
                }
              }}
              testID={
                confirmingReinstall
                  ? "mineru-environment-reinstall-confirm"
                  : "mineru-environment-reinstall"
              }
            />
            {confirmingReinstall ? (
              <SettingsAction
                label="Cancel reinstall"
                hint="Leave the current MinerU CLI installation untouched."
                actionLabel="Cancel"
                disabled={busy}
                onPress={() => setConfirmingReinstall(false)}
                testID="mineru-environment-reinstall-cancel"
              />
            ) : null}
          </>
        ) : null}

        {repairTask ? (
          <MineruRepairTaskBlock
            task={repairTask}
            theme={theme}
            onCancel={handleCancelRepair}
          />
        ) : null}

        {environmentError ? (
          <MineruEnvironmentError
            message={environmentError}
            theme={theme}
            testID="mineru-environment-error"
          />
        ) : null}

        {repairError ? (
          <MineruEnvironmentError
            message={repairError}
            theme={theme}
            testID="mineru-repair-error"
          />
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
