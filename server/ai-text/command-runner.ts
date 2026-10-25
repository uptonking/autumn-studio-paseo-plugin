import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnProcess, terminateProcess } from '@getpaseo/plugin/server';

export interface RunProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with each complete stdout/stderr line, in arrival order. */
  onLog?: (line: string) => void;
  /** Caps retained stdout and stderr; the log callback still sees every line. */
  maxBufferBytes?: number;
}

export interface RunProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
/** A single log line can be a progress-bar redraw; cap what we forward. */
const MAX_EMITTED_LINE_CHARS = 8 * 1024;
/** Keep a partial line bounded so a process without newlines cannot grow memory. */
const MAX_PENDING_CHARS = 16 * 1024;

class OutputCollector {
  readonly chunks: string[] = [];
  private bytes = 0;
  private pending = '';
  private readonly maxBytes: number;
  private readonly onLine?: (line: string) => void;

  constructor(maxBytes: number, onLine?: (line: string) => void) {
    this.maxBytes = maxBytes;
    this.onLine = onLine;
  }

  push(chunk: string): void {
    if (this.bytes < this.maxBytes) {
      const remaining = this.maxBytes - this.bytes;
      const slice = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
      this.chunks.push(slice);
      this.bytes += slice.length;
    }
    if (!this.onLine) return;
    this.pending += chunk;
    this.emitCompleteLines();
    if (this.pending.length > MAX_PENDING_CHARS) {
      this.pending = this.pending.slice(-MAX_PENDING_CHARS);
    }
  }

  flush(): void {
    if (this.onLine && this.pending.trim()) {
      this.emitLine(this.pending);
    }
    this.pending = '';
  }

  text(): string {
    return this.chunks.join('');
  }

  private emitCompleteLines(): void {
    // Progress bars redraw with `\r`; treat it as a line break so phase and
    // percentage detection sees each update instead of one giant line.
    const lines = this.pending.split(/\r\n|\r|\n/);
    this.pending = lines.pop() ?? '';
    for (const line of lines) this.emitLine(line);
  }

  private emitLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.onLine?.(
      trimmed.length > MAX_EMITTED_LINE_CHARS ? trimmed.slice(-MAX_EMITTED_LINE_CHARS) : trimmed,
    );
  }
}

/**
 * Spawns a CLI with piped output, streaming complete log lines while the
 * process runs. Resolves for any exit code; callers decide what failure means.
 */
export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const stdout = new OutputCollector(maxBufferBytes, options.onLog);
  const stderr = new OutputCollector(maxBufferBytes, options.onLog);

  if (options.signal?.aborted) {
    return {
      code: null,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      aborted: true,
    };
  }

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnProcess(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env,
      stdio: 'pipe',
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error(`Failed to start ${options.command}`);
  }

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => stdout.push(chunk));
  child.stderr.on('data', (chunk: string) => stderr.push(chunk));

  let timedOut = false;
  let aborted = false;
  let settled = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  const stopChild = () => {
    void terminateProcess(child, 'SIGTERM').catch(() => undefined);
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        void terminateProcess(child, 'SIGKILL').catch(() => undefined);
      }
    }, 3000).unref?.();
  };

  const onAbort = () => {
    aborted = true;
    stopChild();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  // The signal can flip between the check above and the listener; a missed
  // abort would leave the CLI running to completion.
  if (options.signal?.aborted) onAbort();

  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      stopChild();
    }, options.timeoutMs);
  }

  return await new Promise<RunProcessResult>((resolve, reject) => {
    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      options.signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(`Failed to run ${options.command}`));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.flush();
      stderr.flush();
      resolve({
        code,
        signal,
        stdout: stdout.text(),
        stderr: stderr.text(),
        timedOut,
        aborted,
      });
    });
  });
}

export function buildProcessError(command: string, result: RunProcessResult): string {
  if (result.timedOut) return `${command} timed out`;
  if (result.aborted) return `${command} was cancelled`;
  const detail = (result.stderr || result.stdout).trim().slice(-1200);
  return `${command} exited with code ${result.code ?? 'unknown'}${detail ? `: ${detail}` : ''}`;
}
