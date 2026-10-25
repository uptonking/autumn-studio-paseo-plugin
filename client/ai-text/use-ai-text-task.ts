import * as React from 'react';
import type { AiTextTaskKind, AiTextTaskSnapshot } from '../../shared/contracts.js';
import type { AiTextBridge, AiTextTaskStartOptions } from './ai-text-types.js';

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
  onParseResult?(result: NonNullable<AiTextTaskSnapshot['parseResult']>): void;
  /** Fired for engine operations so the settings card can refresh its status. */
  onOperationSucceeded?(task: AiTextTaskSnapshot): void;
}

/**
 * Owns one AI Text task at a time: starts it, polls the server snapshot, and
 * exposes progress plus cancel. Parses and engine setup operations share the
 * same lifecycle, so both render the same progress card.
 */
export function useAiTextTask(bridge: AiTextBridge | undefined) {
  const [task, setTask] = React.useState<AiTextTaskSnapshot | null>(null);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const generationRef = React.useRef(0);
  const activeTaskIdRef = React.useRef<string | null>(null);
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
          ...(input.options.profileId ? { profileId: input.options.profileId } : {}),
          ...(input.options.engineId ? { engineId: input.options.engineId } : {}),
          ...(input.options.operationId ? { operationId: input.options.operationId } : {}),
          ...(input.options.config ? { config: input.options.config } : {}),
          ...(input.options.operationOptions
            ? { operationOptions: input.options.operationOptions }
            : {}),
        });
        activeTaskIdRef.current = started.taskId;

        for (;;) {
          const snapshot = await getTask(started.taskId);
          if (generationRef.current !== generation) return;
          setTask(snapshot.task);

          if (snapshot.task.status === 'queued' || snapshot.task.status === 'running') {
            await delay(TASK_POLL_INTERVAL_MS);
            if (generationRef.current !== generation) return;
            continue;
          }

          if (snapshot.task.status === 'succeeded') {
            if (input.kind === 'parse') {
              if (snapshot.task.parseResult) {
                callbacks?.onParseResult?.(snapshot.task.parseResult);
              } else {
                setError('The AI text task finished without a result. Try again.');
              }
            } else {
              callbacks?.onOperationSucceeded?.(snapshot.task);
            }
          } else if (snapshot.task.status === 'failed') {
            setError(snapshot.task.error ?? 'AI Text task failed');
          }
          return;
        }
      } catch (err) {
        if (generationRef.current !== generation) return;
        setError(err instanceof Error ? err.message : 'Failed to run AI Text task');
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

  return {
    task,
    isExtracting,
    error,
    setError,
    runTask,
    cancel,
    resetTaskState,
  };
}
