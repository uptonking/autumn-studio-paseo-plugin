/**
 * Lifecycle for engine setup operations (install, model download): start,
 * poll, cancel, and the inline progress panel each engine card renders.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import {
  cancelAiTextTask,
  getAiTextTask,
  startAiTextTask,
  type AiTextEngineDescriptor,
  type AiTextEngineOperation,
  type AiTextTaskSnapshot,
} from "../../../../shared/contracts.js";
import {
  AiTextAction,
  AiTextHint,
  AiTextPanel,
  type AiTextTheme,
} from "./ui.js";

export interface AiTextOperationRun {
  engineId: string;
  operationId: string;
  taskId: string | null;
  task: AiTextTaskSnapshot | null;
  error: string | null;
  done: boolean;
  cancelled: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface UseEngineOperationInput {
  /** Config the operation should run with, from the engine's default profile. */
  configForEngine(engineId: string): Record<string, unknown>;
  /** Called when an operation succeeds so detection can refresh. */
  onFinished(engineId: string): void;
}

export function useEngineOperation({
  configForEngine,
  onFinished,
}: UseEngineOperationInput) {
  const startTask = useRpc(startAiTextTask);
  const getTask = useRpc(getAiTextTask);
  const cancelTask = useRpc(cancelAiTextTask);

  const [operationRun, setOperationRun] = useState<AiTextOperationRun | null>(
    null,
  );
  const [confirmOperation, setConfirmOperation] = useState<string | null>(null);
  const [operationOptions, setOperationOptions] = useState<
    Record<string, string>
  >({});

  const getTaskRef = useRef(getTask);
  getTaskRef.current = getTask;
  // Bumped on unmount or a newer operation start so stale poll loops stop.
  const generationRef = useRef(0);

  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  const pollTask = useCallback(
    async (engineId: string, taskId: string, generation: number) => {
      for (;;) {
        const snapshot = await getTaskRef.current({ taskId });
        if (generationRef.current !== generation) return;
        setOperationRun((current) =>
          current && current.taskId === taskId
            ? { ...current, task: snapshot.task }
            : current,
        );
        if (
          snapshot.task.status === "queued" ||
          snapshot.task.status === "running"
        ) {
          await delay(800);
          if (generationRef.current !== generation) return;
          continue;
        }
        if (snapshot.task.status === "succeeded") {
          setOperationRun((current) =>
            current && current.taskId === taskId
              ? { ...current, done: true }
              : current,
          );
          onFinished(engineId);
        } else if (snapshot.task.status === "failed") {
          setOperationRun((current) =>
            current && current.taskId === taskId
              ? {
                  ...current,
                  error: snapshot.task.error ?? "Engine operation failed.",
                }
              : current,
          );
        } else if (snapshot.task.status === "cancelled") {
          setOperationRun((current) =>
            current && current.taskId === taskId
              ? { ...current, done: true, cancelled: true }
              : current,
          );
        }
        return;
      }
    },
    [onFinished],
  );

  const runOperation = useCallback(
    async (
      descriptor: AiTextEngineDescriptor,
      operation: AiTextEngineOperation,
      optionDefaults?: Record<string, string>,
    ) => {
      const key = `${descriptor.id}:${operation.id}`;
      setConfirmOperation(null);
      setOperationRun({
        engineId: descriptor.id,
        operationId: operation.id,
        taskId: null,
        task: null,
        error: null,
        done: false,
        cancelled: false,
      });
      const generation = ++generationRef.current;
      const options: Record<string, string> = {};
      for (const option of operation.options) {
        options[option.key] =
          operationOptions[`${key}:${option.key}`] ??
          optionDefaults?.[option.key] ??
          option.defaultValue;
      }
      try {
        const started = await startTask({
          kind: "engine.operation",
          engineId: descriptor.id,
          operationId: operation.id,
          config: configForEngine(descriptor.id),
          operationOptions: options,
        });
        if (generationRef.current !== generation) return;
        setOperationRun((current) =>
          current && current.operationId === operation.id
            ? { ...current, taskId: started.taskId }
            : current,
        );
        await pollTask(descriptor.id, started.taskId, generation);
      } catch (error) {
        if (generationRef.current !== generation) return;
        setOperationRun((current) =>
          current
            ? {
                ...current,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not start the engine operation.",
              }
            : current,
        );
      }
    },
    [configForEngine, operationOptions, pollTask, startTask],
  );

  const handleOperationPress = useCallback(
    (
      descriptor: AiTextEngineDescriptor,
      operation: AiTextEngineOperation,
      optionDefaults?: Record<string, string>,
    ) => {
      const key = `${descriptor.id}:${operation.id}`;
      if (operation.requiresConfirmation && confirmOperation !== key) {
        setConfirmOperation(key);
        return;
      }
      void runOperation(descriptor, operation, optionDefaults);
    },
    [confirmOperation, runOperation],
  );

  const cancelOperation = useCallback(() => {
    const taskId = operationRun?.taskId;
    if (!taskId) return;
    void cancelTask({ taskId }).catch(() => undefined);
  }, [cancelTask, operationRun?.taskId]);

  const operationBusy = Boolean(
    operationRun && !operationRun.done && operationRun.error === null,
  );

  return {
    operationRun,
    confirmOperation,
    operationOptions,
    setOperationOptions,
    handleOperationPress,
    cancelOperation,
    operationBusy,
  };
}

export function EngineOperationPanel({
  descriptor,
  run,
  onCancel,
  theme,
}: {
  descriptor: AiTextEngineDescriptor;
  run: AiTextOperationRun;
  onCancel(): void;
  theme: AiTextTheme;
}) {
  return (
    <AiTextPanel theme={theme}>
      <AiTextHint theme={theme} tone="default">
        {descriptor.operations.find(
          (operation) => operation.id === run.operationId,
        )?.label ?? run.operationId}
      </AiTextHint>
      {run.error ? (
        <AiTextHint theme={theme} tone="danger">
          {run.error}
        </AiTextHint>
      ) : run.done ? (
        <AiTextHint
          theme={theme}
          tone={run.cancelled ? "warning" : "success"}
        >
          {run.cancelled
            ? "Operation cancelled."
            : "Finished. Detection refreshed."}
        </AiTextHint>
      ) : (
        <>
          <AiTextHint theme={theme}>
            {run.task
              ? `${run.task.phase} — ${run.task.message}`
              : "Starting…"}
          </AiTextHint>
          {run.task?.progressPercent !== null &&
          run.task?.progressPercent !== undefined ? (
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.surface2,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 4,
                  width: `${run.task.progressPercent}%`,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          ) : null}
          {run.task?.logTail.length ? (
            <AiTextHint theme={theme}>
              {run.task.logTail.slice(-3).join("\n")}
            </AiTextHint>
          ) : null}
          <AiTextAction
            label="Cancel operation"
            onPress={onCancel}
            disabled={!run.taskId}
            tone="danger"
            theme={theme}
            testID={`autumn-studio-ai-text-engine-op-cancel-${descriptor.id}`}
          />
        </>
      )}
    </AiTextPanel>
  );
}
