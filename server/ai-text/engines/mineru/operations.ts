import { mineruConfigSchema } from "../../../../shared/ai-text/engine-configs.ts";
import { buildProcessError, runProcess } from "../../command-runner.ts";
import { resolveExecutable } from "../../executable.ts";
import { clearCacheDirectory } from "../../disk.ts";
import {
  parseVersionSpec,
  uvIndexArgs,
} from "../../engine-versions.ts";
import type { AiTextEngineOperationContext } from "../../engine-registry.ts";
import { normalizeModelTier } from "./environment.ts";
import { probeModels } from "./environment-models.ts";

const MODELS_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const UNINSTALL_TIMEOUT_MS = 60_000;
const VALID_SOURCES = new Set(["auto", "huggingface", "modelscope"]);

async function requireUv(): Promise<string> {
  const uvPath = await resolveExecutable("uv");
  if (!uvPath) {
    throw new Error(
      'uv was not found. Install uv first, then run "uv tool install mineru".',
    );
  }
  return uvPath;
}

async function requireKit(command: string): Promise<string> {
  const kitPath = await resolveExecutable(command.trim() || "mineru-kit");
  if (!kitPath) {
    throw new Error(
      `mineru-kit "${command}" was not found. Install it with "uv tool install mineru".`,
    );
  }
  return kitPath;
}

async function runChecked(input: {
  label: string;
  command: string;
  args: string[];
  timeoutMs: number;
  ctx: AiTextEngineOperationContext;
  phase: string;
}): Promise<void> {
  const result = await runProcess({
    command: input.command,
    args: input.args,
    timeoutMs: input.timeoutMs,
    signal: input.ctx.signal,
    onLog: input.ctx.onLog,
  });
  if (result.aborted) throw new Error(`${input.phase} was cancelled`);
  if (result.code !== 0) {
    throw new Error(buildProcessError(input.label, result));
  }
}

function requireValidVersion(ctx: AiTextEngineOperationContext): string | null {
  const requested = (ctx.options.version ?? "").trim();
  const version = parseVersionSpec(requested);
  if (requested && !version) {
    throw new Error(
      `"${requested}" does not look like a release version. Try a form like 2.0.0.`,
    );
  }
  return version;
}

export async function runMineruOperation(
  operationId: string,
  ctx: AiTextEngineOperationContext,
): Promise<void> {
  const config = mineruConfigSchema.parse(ctx.config);

  if (operationId === "cli.install" || operationId === "cli.reinstall") {
    const uvPath = await requireUv();
    const version = requireValidVersion(ctx);
    const args = ["tool", "install"];
    if (operationId === "cli.reinstall") args.push("--reinstall");
    args.push(...uvIndexArgs(ctx.indexUrl));
    args.push(version ? `mineru==${version}` : "mineru");
    await runChecked({
      label: "uv tool install",
      command: uvPath,
      args,
      timeoutMs: INSTALL_TIMEOUT_MS,
      ctx,
      phase:
        operationId === "cli.reinstall"
          ? "Repairing MinerU"
          : `Installing MinerU${version ? ` ${version}` : ""}`,
    });
    return;
  }

  if (operationId === "cli.update") {
    const uvPath = await requireUv();
    await runChecked({
      label: "uv tool install --upgrade",
      command: uvPath,
      args: ["tool", "install", "--upgrade", ...uvIndexArgs(ctx.indexUrl), "mineru"],
      timeoutMs: INSTALL_TIMEOUT_MS,
      ctx,
      phase: "Updating MinerU",
    });
    return;
  }

  if (operationId === "cli.uninstall") {
    const uvPath = await requireUv();
    await runChecked({
      label: "uv tool uninstall",
      command: uvPath,
      args: ["tool", "uninstall", "mineru"],
      timeoutMs: UNINSTALL_TIMEOUT_MS,
      ctx,
      phase: "Uninstalling MinerU",
    });
    return;
  }

  if (operationId === "models.download") {
    const requestedTier =
      (ctx.options.tier ?? "").trim() || config.tier;
    const normalized = normalizeModelTier(requestedTier);
    const source = (ctx.options.source ?? "auto").trim() || "auto";
    if (!VALID_SOURCES.has(source)) {
      throw new Error(`Unsupported MinerU model source "${source}".`);
    }
    if (normalized.adjusted) {
      ctx.onLog?.(
        `Tier "${requestedTier}" has no separate model set; downloading the standard models instead.`,
      );
    }
    const kitPath = await requireKit(config.kitCommand);
    await runChecked({
      label: "mineru-kit models download",
      command: kitPath,
      args: [
        "models",
        "download",
        "--tier",
        normalized.tier,
        "--source",
        source,
      ],
      timeoutMs: MODELS_DOWNLOAD_TIMEOUT_MS,
      ctx,
      phase: "Downloading models",
    });
    return;
  }

  if (operationId === "models.clear") {
    const kitPath = await requireKit(config.kitCommand);
    ctx.onLog?.('Reading the model cache location with "mineru-kit models show".');
    const models = await probeModels(kitPath, config.tier);
    const target = models?.baseDir ?? null;
    if (!target) {
      throw new Error(
        'Could not read the MinerU model cache location. Run "mineru-kit models show" in a terminal once, then retry.',
      );
    }
    ctx.onLog?.(`Clearing ${target}`);
    await clearCacheDirectory(target);
    ctx.onLog?.("Model cache cleared. Models re-download on the next parse.");
    return;
  }

  throw new Error(`Unknown MinerU operation "${operationId}".`);
}
