import * as React from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import type { AiTextTaskSnapshot } from "../../shared/contracts.js";
import { Button } from "../vendor/components/ui/button.js";
import { cn } from "../vendor/lib/utils.js";

export function formatTaskElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function AiTextTaskProgress({
  task,
  onCancel,
  compact = false,
}: {
  task: AiTextTaskSnapshot | null;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [logsOpen, setLogsOpen] = React.useState(false);
  const phase = task?.phase ?? "Starting";
  const message = task?.message ?? "Preparing the AI text task…";
  const isOperation = task?.kind === "engine.operation";

  return (
    <div
      data-testid="ai-text-task-progress"
      className={cn(
        "flex flex-col gap-2 text-xs",
        compact
          ? "border-b bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200"
          : "w-full max-w-md rounded-lg border border-border bg-muted/20 p-4",
      )}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span className="font-medium">{phase}</span>
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
          {formatTaskElapsed(task?.elapsedMs ?? 0)}
        </span>
      </div>
      {task?.progressPercent !== null && task?.progressPercent !== undefined ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500 transition-[width]"
            style={{ width: `${task.progressPercent}%` }}
          />
        </div>
      ) : null}
      <p className="truncate text-[11px] text-muted-foreground" title={message}>
        {message}
      </p>
      {isOperation ? (
        <p className="text-[11px] text-muted-foreground">
          Engine setup can take several minutes while packages and models
          download. Keep this pane open; you can cancel safely.
        </p>
      ) : null}

      {task && task.logTail.length > 0 ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid="ai-text-task-logs-toggle"
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen((open) => !open)}
            className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                logsOpen && "rotate-180",
              )}
            />
            {logsOpen ? "Hide logs" : "Show logs"}
          </button>
          {logsOpen ? (
            <pre
              data-testid="ai-text-task-logs"
              className="max-h-32 overflow-auto rounded border border-border/70 bg-background/70 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words text-muted-foreground"
            >
              {task.logTail.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          data-testid="ai-text-task-cancel"
          variant="outline"
          size="xs"
          onClick={onCancel}
          className="h-6 gap-1 px-2 text-xs"
        >
          <X className="size-3" />
          <span>Cancel</span>
        </Button>
      </div>
    </div>
  );
}
