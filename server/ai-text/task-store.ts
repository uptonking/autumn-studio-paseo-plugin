import { randomUUID } from "node:crypto";
import type {
  AiTextEnvironment,
  AiTextTaskKind,
  AiTextTaskSnapshot,
} from "../../shared/ai-text-task.ts";
import type {
  AiTextParserProviderId,
  AiTextSettings,
} from "../../shared/ai-text-settings.ts";
import { mineruTierSchema } from "../../shared/ai-text-settings.ts";
import { buildProcessError, runProcess } from "./command-runner.ts";
import { getMineruEnvironment } from "./environment.ts";
import { resolveExecutable } from "./executable.ts";
import { runAiTextExtractionPipeline } from "./parser-registry.ts";

const MAX_LOG_LINES = 40;
const MAX_LOG_LINE_LENGTH = 500;
const MAX_TASKS = 40;
const TERMINAL_TASK_TTL_MS = 10 * 60 * 1000;
const MODELS_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const REINSTALL_TIMEOUT_MS = 10 * 60 * 1000;

interface TaskRecord {
  snapshot: AiTextTaskSnapshot;
  controller: AbortController;
  workspaceId: string;
  relPath?: string;
  kind: AiTextTaskKind;
  logLines: string[];
  message: string;
  progressPercent: number | null;
  finishedAtMs: number | null;
}

export interface StartAiTextTaskInput {
  paseo: unknown;
  workspaceId: string;
  relPath?: string;
  workspaceRootPath?: string;
  sourceAbsPath?: string;
  kind: AiTextTaskKind;
  settings: AiTextSettings;
  parserId?: AiTextParserProviderId;
  agentId?: string;
  tier?: string;
  source?: string;
}

export interface AiTextTaskStore {
  start(input: StartAiTextTaskInput): { taskId: string };
  get(taskId: string): AiTextTaskSnapshot | null;
  cancel(taskId: string): boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimLogLine(line: string): string {
  const trimmed = line.replace(/\s+$/g, "");
  return trimmed.length > MAX_LOG_LINE_LENGTH
    ? `${trimmed.slice(0, MAX_LOG_LINE_LENGTH)}…`
    : trimmed;
}

function detectPhase(line: string): string | null {
  if (/download(ing)?\s+(model|resource)/i.test(line)) {
    return "Downloading models";
  }
  if (/load(ing)?\s+(the\s+)?model|model(s)?\s+load/i.test(line)) {
    return "Loading models";
  }
  if (/pars(e|ing)\s+(page|document|pdf)|page\s+\d+/i.test(line)) {
    return "Parsing pages";
  }
  if (/writ(e|ing)\s+(result|output|version)|sav(e|ing)\s+(result|output)/i.test(
    line,
  )) {
    return "Writing version";
  }
  return null;
}

function detectPercent(line: string): number | null {
  const match = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function snapshotElapsed(record: TaskRecord): number {
  const started = Date.parse(record.snapshot.startedAt);
  if (!Number.isFinite(started)) return 0;
  const end = record.finishedAtMs ?? Date.now();
  return Math.max(0, end - started);
}

export function createAiTextTaskStore(): AiTextTaskStore {
  const records = new Map<string, TaskRecord>();
  const runningParseKeys = new Set<string>();

  function prune(): void {
    const now = Date.now();
    const terminal = [...records.values()]
      .filter((record) => record.finishedAtMs !== null)
      .sort((a, b) => (b.finishedAtMs ?? 0) - (a.finishedAtMs ?? 0));
    for (const record of terminal) {
      if (now - (record.finishedAtMs ?? now) > TERMINAL_TASK_TTL_MS) {
        records.delete(record.snapshot.id);
      }
    }
    const remainingTerminal = [...records.values()]
      .filter((record) => record.finishedAtMs !== null)
      .sort((a, b) => (b.finishedAtMs ?? 0) - (a.finishedAtMs ?? 0));
    for (const record of remainingTerminal.slice(MAX_TASKS)) {
      records.delete(record.snapshot.id);
    }
  }

  function updateSnapshot(record: TaskRecord): void {
    record.snapshot = {
      ...record.snapshot,
      phase: record.snapshot.phase,
      message: record.message,
      progressPercent: record.progressPercent,
      logTail: [...record.logLines],
      elapsedMs: snapshotElapsed(record),
    };
  }

  function addLog(record: TaskRecord, line: string): void {
    const trimmed = trimLogLine(line);
    if (!trimmed) return;
    record.logLines.push(trimmed);
    if (record.logLines.length > MAX_LOG_LINES) {
      record.logLines.splice(0, record.logLines.length - MAX_LOG_LINES);
    }
    const phase = detectPhase(trimmed);
    if (phase) record.snapshot.phase = phase;
    const percent = detectPercent(trimmed);
    if (percent !== null) record.progressPercent = percent;
    record.message = trimmed;
    updateSnapshot(record);
  }

  function finish(
    record: TaskRecord,
    status: "succeeded" | "failed" | "cancelled",
    error: string | null,
  ): void {
    record.finishedAtMs = Date.now();
    record.snapshot = {
      ...record.snapshot,
      status,
      error,
      finishedAt: nowIso(),
      elapsedMs: snapshotElapsed(record),
      logTail: [...record.logLines],
      progressPercent: record.progressPercent,
      message:
        status === "succeeded"
          ? record.snapshot.kind === "parse"
            ? "AI text version created"
            : "Task completed"
          : (error ?? record.message),
    };
    if (record.kind === "parse" && record.relPath) {
      runningParseKeys.delete(`${record.workspaceId}::${record.relPath}`);
    }
  }

  async function runModelsDownload(
    record: TaskRecord,
    settings: AiTextSettings,
    requestedTier: string,
    requestedSource: string,
  ): Promise<void> {
    const tier = mineruTierSchema.safeParse(requestedTier);
    // The RPC accepts a string, but only known tiers and simple source names
    // may reach the argv.
    const source = /^[a-z][a-z0-9-]{0,31}$/.test(requestedSource)
      ? requestedSource
      : "auto";
    const kitCommand = settings.mineru.kitCommand.trim() || "mineru-kit";
    const kitPath = await resolveExecutable(kitCommand);
    if (!kitPath) {
      throw new Error(
        `MinerU Kit CLI "${kitCommand}" was not found. Install it with "uv tool install mineru".`,
      );
    }
    record.snapshot.phase = "Downloading models";
    updateSnapshot(record);
    const result = await runProcess({
      command: kitPath,
      args: [
        "models",
        "download",
        "--tier",
        tier.success ? tier.data : settings.mineru.tier,
        "--source",
        source,
      ],
      timeoutMs: MODELS_DOWNLOAD_TIMEOUT_MS,
      signal: record.controller.signal,
      onLog: (line) => addLog(record, line),
    });
    if (result.aborted) throw new Error("Model download was cancelled");
    if (result.code !== 0) {
      throw new Error(buildProcessError("mineru-kit models download", result));
    }
  }

  async function runReinstall(record: TaskRecord): Promise<void> {
    const uvPath = await resolveExecutable("uv");
    if (!uvPath) {
      throw new Error(
        'uv was not found. Reinstall manually with "uv tool install --reinstall mineru".',
      );
    }
    record.snapshot.phase = "Reinstalling";
    updateSnapshot(record);
    const result = await runProcess({
      command: uvPath,
      args: ["tool", "install", "--reinstall", "mineru"],
      timeoutMs: REINSTALL_TIMEOUT_MS,
      signal: record.controller.signal,
      onLog: (line) => addLog(record, line),
    });
    if (result.aborted) throw new Error("Reinstall was cancelled");
    if (result.code !== 0) {
      throw new Error(buildProcessError("uv tool install", result));
    }
  }

  async function execute(
    record: TaskRecord,
    input: StartAiTextTaskInput,
  ): Promise<void> {
    record.snapshot.status = "running";
    updateSnapshot(record);
    try {
      if (record.kind === "parse") {
        if (!input.relPath || !input.workspaceRootPath) {
          throw new Error("Missing file path for parsing");
        }
        record.snapshot.phase = "Preparing";
        updateSnapshot(record);
        const result = await runAiTextExtractionPipeline({
          paseo: input.paseo,
          workspaceId: input.workspaceId,
          workspaceRootPath: input.workspaceRootPath,
          sourceRelPath: input.relPath,
          sourceAbsPath:
            input.sourceAbsPath ?? `${input.workspaceRootPath}/${input.relPath}`,
          settings: input.settings,
          parserIdOverride: input.parserId,
          agentIdOverride: input.agentId,
          signal: record.controller.signal,
          onProgress: (update) => {
            if (update.phase) record.snapshot.phase = update.phase;
            if (update.message) record.message = update.message;
            if (update.percent !== undefined) {
              record.progressPercent = update.percent;
            }
            updateSnapshot(record);
          },
          onLog: (line) => addLog(record, line),
        });
        if (record.controller.signal.aborted) {
          throw new Error("AI text extraction was cancelled");
        }
        record.snapshot = {
          ...record.snapshot,
          parseResult: result,
        };
        finish(record, "succeeded", null);
        return;
      }

      if (record.kind === "models.download") {
        await runModelsDownload(
          record,
          input.settings,
          input.tier?.trim() || input.settings.mineru.tier,
          input.source?.trim() || "auto",
        );
      } else {
        await runReinstall(record);
      }

      const environment: AiTextEnvironment = await getMineruEnvironment({
        kitCommand: input.settings.mineru.kitCommand,
        localApiUrl: input.settings.mineru.localApiUrl,
        tier: input.settings.mineru.tier,
        refresh: true,
      });
      record.snapshot = { ...record.snapshot, environment };
      finish(record, "succeeded", null);
    } catch (error) {
      const cancelled = record.controller.signal.aborted;
      const message =
        error instanceof Error ? error.message : String(error);
      finish(
        record,
        cancelled ? "cancelled" : "failed",
        cancelled ? "Cancelled" : message,
      );
    }
  }

  return {
    start(input) {
      prune();
      if (!input.relPath && input.kind === "parse") {
        throw new Error("relPath is required for a parse task");
      }
      if (input.kind === "parse" && input.relPath) {
        const key = `${input.workspaceId}::${input.relPath}`;
        if (runningParseKeys.has(key)) {
          throw new Error("An AI text extraction is already running for this file");
        }
        runningParseKeys.add(key);
      }

      const id = `aitask_${randomUUID()}`;
      const record: TaskRecord = {
        snapshot: {
          id,
          kind: input.kind,
          status: "queued",
          phase: "Queued",
          message: "Waiting to start",
          progressPercent: null,
          logTail: [],
          startedAt: nowIso(),
          finishedAt: null,
          elapsedMs: 0,
          error: null,
        },
        controller: new AbortController(),
        workspaceId: input.workspaceId,
        relPath: input.relPath,
        kind: input.kind,
        logLines: [],
        message: "Waiting to start",
        progressPercent: null,
        finishedAtMs: null,
      };
      records.set(id, record);
      void execute(record, input).catch(() => undefined);
      return { taskId: id };
    },

    get(taskId) {
      prune();
      const record = records.get(taskId);
      if (!record) return null;
      if (record.finishedAtMs !== null) {
        return {
          ...record.snapshot,
          elapsedMs: snapshotElapsed(record),
        };
      }
      return {
        ...record.snapshot,
        elapsedMs: snapshotElapsed(record),
      };
    },

    cancel(taskId) {
      const record = records.get(taskId);
      if (!record || record.finishedAtMs !== null) return false;
      record.controller.abort();
      record.message = "Cancelling…";
      updateSnapshot(record);
      return true;
    },
  };
}
