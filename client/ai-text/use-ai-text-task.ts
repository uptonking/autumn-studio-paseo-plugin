import * as React from "react";
import type {
  AiTextTaskKind,
  AiTextTaskSnapshot,
} from "../../shared/ai-text-task.js";
import type {
  AiTextBridge,
  AiTextTaskStartOptions,
} from "./ai-text-types.js";

const TASK_POLL_INTERVAL_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export interface AiTextTaskRunInput {
  kind: AiTextTaskKind;
  targetPath?: string;
  options: AiTextTaskStartOptions;
}

export interface AiTextTaskRunCallbacks {
  onParseResult?(result: NonNullable<AiTextTaskSnapshot["parseResult"]>): void;
  onModelDownloadSucceeded?(): void;
}

/**
 * Owns one AI Text task at a time: starts it, polls the server snapshot, and
 * exposes progress plus cancel. Parse and model-download tasks share the same
 * lifecycle, so the split pane renders the same progress card for both.
 */
export function useAiTextTask(bridge: AiTextBridge | undefined) {
  const [task, setTask] = React.useState<AiTextTaskSnapshot | null>(null);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const generationRef = React.useRef(0);
  const activeTaskIdRef = React.useRef<string | null>(null);
  const retryAfterModelDownloadRef = React.useRef(false);
  /**
   * `isExtracting` is state and can be stale within the same tick, so a second
   * click could start a duplicate task before React re-renders. This ref is the
   * synchronous guard.
   */
  const isRunningRef = React.useRef(false);

  const startTask = bridge?.startTask;
  const getTask = bridge?.getTask;
  const cancelTask = bridge?.cancelTask;

  const resetTaskState = React.useCallback(() => {
    generationRef.current += 1;
    activeTaskIdRef.current = null;
    retryAfterModelDownloadRef.current = false;
    isRunningRef.current = false;
    setIsExtracting(false);
    setTask(null);
    setError(null);
  }, []);

  React.useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  const runTask = React.useCallback(
    async (input: AiTextTaskRunInput, callbacks?: AiTextTaskRunCallbacks) => {
      if (!startTask || !getTask) return;
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      const generation = ++generationRef.current;
      setIsExtracting(true);
      setTask(null);
      setError(null);
      try {
        const started = await startTask({
          kind: input.kind,
          ...(input.targetPath ? { relPath: input.targetPath } : {}),
          ...(input.options.parserId
            ? { parserId: input.options.parserId }
            : {}),
          ...(input.options.agentId ? { agentId: input.options.agentId } : {}),
          ...(input.options.tier ? { tier: input.options.tier } : {}),
          ...(input.options.source ? { source: input.options.source } : {}),
        });
        activeTaskIdRef.current = started.taskId;

        for (;;) {
          const snapshot = await getTask(started.taskId);
          if (generationRef.current !== generation) return;
          setTask(snapshot.task);

          if (
            snapshot.task.status === "queued" ||
            snapshot.task.status === "running"
          ) {
            await delay(TASK_POLL_INTERVAL_MS);
            if (generationRef.current !== generation) return;
            continue;
          }

          if (snapshot.task.status === "succeeded") {
            if (input.kind === "parse") {
              if (snapshot.task.parseResult) {
                callbacks?.onParseResult?.(snapshot.task.parseResult);
              } else {
                setError(
                  "The AI text task finished without a result. Try again.",
                );
              }
            }
            if (input.kind === "models.download") {
              const shouldRetry = retryAfterModelDownloadRef.current;
              retryAfterModelDownloadRef.current = false;
              if (shouldRetry) {
                // The callback may start the parse task; release the guard first.
                isRunningRef.current = false;
                callbacks?.onModelDownloadSucceeded?.();
              }
            }
          } else if (snapshot.task.status === "failed") {
            retryAfterModelDownloadRef.current = false;
            setError(snapshot.task.error ?? "AI Text task failed");
          } else {
            retryAfterModelDownloadRef.current = false;
          }
          return;
        }
      } catch (err) {
        if (generationRef.current !== generation) return;
        setError(
          err instanceof Error ? err.message : "Failed to run AI Text task",
        );
      } finally {
        if (generationRef.current === generation) {
          activeTaskIdRef.current = null;
          isRunningRef.current = false;
          setIsExtracting(false);
        }
      }
    },
    [getTask, startTask],
  );

  const cancel = React.useCallback(() => {
    const taskId = activeTaskIdRef.current;
    if (!taskId || !cancelTask) return;
    void cancelTask(taskId).catch(() => undefined);
  }, [cancelTask]);

  const requestRetryAfterModelDownload = React.useCallback(
    (value: boolean) => {
      retryAfterModelDownloadRef.current = value;
    },
    [],
  );

  return {
    task,
    isExtracting,
    error,
    setError,
    runTask,
    cancel,
    resetTaskState,
    requestRetryAfterModelDownload,
  };
}
