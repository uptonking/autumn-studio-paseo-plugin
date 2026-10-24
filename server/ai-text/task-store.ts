import { randomUUID } from "node:crypto";
import type {
  AiTextTaskKind,
  AiTextTaskSnapshot,
} from "../../shared/ai-text/task.ts";
import {
  resolveAiTextProfile,
  type AiTextProfile,
} from "../../shared/ai-text/profiles.ts";
import type { AiTextSettings } from "../../shared/ai-text/settings.ts";
import {
  detectEngineEnvironment,
  listAiTextEngineDescriptors,
  resolveEngineConfig,
  runEngineOperation,
} from "./engine-registry.ts";
import { runAiTextPipeline } from "./pipeline.ts";

const MAX_LOG_LINES = 40;
const MAX_LOG_LINE_LENGTH = 500;
const MAX_TASKS = 40;
const TERMINAL_TASK_TTL_MS = 10 * 60 * 1000;

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
  profileId?: string;
  engineId?: string;
  operationId?: string;
  config?: Record<string, unknown>;
  operationOptions?: Record<string, string>;
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

function operationProfile(
  settings: AiTextSettings,
  engineId: string,
): AiTextProfile | null {
  // Prefer the profile the user parses with by default — the same policy the
  // settings tab uses for detection — falling back to any profile for the
  // engine when no default targets it.
  const forEngine = settings.profiles.filter(
    (profile) => profile.engineId === engineId,
  );
  return (
    forEngine.find((profile) => profile.id === settings.defaultProfileId) ??
    forEngine[0] ??
    null
  );
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
            : "Engine operation completed"
          : (error ?? record.message),
    };
    if (record.kind === "parse" && record.relPath) {
      runningParseKeys.delete(`${record.workspaceId}::${record.relPath}`);
    }
  }

  async function executeParse(
    record: TaskRecord,
    input: StartAiTextTaskInput,
  ): Promise<void> {
    if (!input.relPath || !input.workspaceRootPath) {
      throw new Error("Missing file path for parsing");
    }
    record.snapshot.phase = "Preparing";
    updateSnapshot(record);
    const result = await runAiTextPipeline({
      paseo: input.paseo,
      workspaceRootPath: input.workspaceRootPath,
      workspaceId: input.workspaceId,
      sourceRelPath: input.relPath,
      sourceAbsPath:
        input.sourceAbsPath ?? `${input.workspaceRootPath}/${input.relPath}`,
      settings: input.settings,
      profileId: input.profileId,
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
      profileId: result.newVersion.provenance.profileId,
      profileName: result.newVersion.provenance.profileName,
      engineId: result.newVersion.provenance.effectiveEngineId,
      parseResult: result,
    };
    finish(record, "succeeded", null);
  }

  async function executeOperation(
    record: TaskRecord,
    input: StartAiTextTaskInput,
  ): Promise<void> {
    const engineId = input.engineId?.trim();
    const operationId = input.operationId?.trim();
    if (!engineId || !operationId) {
      throw new Error("engineId and operationId are required for an engine operation");
    }
    const profile = operationProfile(input.settings, engineId);
    const config = resolveEngineConfig(
      engineId,
      input.config ?? profile?.config ?? {},
    );
    record.snapshot = {
      ...record.snapshot,
      engineId,
      operationId,
    };
    record.snapshot.phase = "Preparing";
    updateSnapshot(record);
    const indexUrl = input.settings.pypiIndexUrl.trim();
    await runEngineOperation({
      engineId,
      operationId,
      config,
      options: input.operationOptions ?? {},
      indexUrl,
      signal: record.controller.signal,
      onLog: (line) => addLog(record, line),
    });
    if (record.controller.signal.aborted) {
      throw new Error("Engine operation was cancelled");
    }
    record.snapshot.phase = "Checking environment";
    updateSnapshot(record);
    const environment = await detectEngineEnvironment({
      engineId,
      config,
      indexUrl,
      refresh: true,
    });
    record.snapshot = { ...record.snapshot, environment };
    finish(record, "succeeded", null);
  }

  async function execute(
    record: TaskRecord,
    input: StartAiTextTaskInput,
  ): Promise<void> {
    record.snapshot.status = "running";
    updateSnapshot(record);
    try {
      if (record.kind === "parse") {
        await executeParse(record, input);
      } else {
        await executeOperation(record, input);
      }
    } catch (error) {
      const cancelled = record.controller.signal.aborted;
      const message = error instanceof Error ? error.message : String(error);
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

      const resolvedProfile =
        input.kind === "parse"
          ? resolveAiTextProfile(input.settings.profiles, {
              profileId: input.profileId,
              defaultProfileId: input.settings.defaultProfileId,
            })
          : null;
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
          profileId: resolvedProfile?.id ?? input.profileId ?? null,
          profileName: resolvedProfile?.name ?? null,
          engineId:
            resolvedProfile?.engineId ?? input.engineId ?? null,
          operationId: input.operationId ?? null,
          engineIds: listAiTextEngineDescriptors().map((engine) => engine.id),
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
