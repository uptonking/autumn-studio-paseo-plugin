import {
  AI_TEXT_REFINEMENT_MAX_INPUT_CHARS,
  composeRefinementPrompt,
  refineMarkdownLocally,
  validateRefinedMarkdown,
  type AiTextRefinementSettings,
} from "../../shared/ai-text/refinement.ts";
import type { AiTextRefinementProvenance } from "../../shared/ai-text/settings.ts";
import { discoverAiTextAgents } from "./agent-runner.ts";

const AGENT_REFINEMENT_TIMEOUT_MS = 5 * 60 * 1000;

interface AgentProviderResolution {
  provider?: string;
  model?: string;
  reason?: string;
}

/**
 * The Paseo agent API requires `provider/model`. When the profile leaves the
 * model empty, resolve the provider's default instead of passing a bare
 * provider string that the SDK rejects.
 */
async function resolveAgentProvider(
  input: AiTextRefinementInput,
  agentId: string,
): Promise<AgentProviderResolution> {
  const explicitModel = input.settings.model.trim();
  if (explicitModel) {
    return { provider: `${agentId}/${explicitModel}`, model: explicitModel };
  }
  const agents = await discoverAiTextAgents(input.paseo, input.workspaceRootPath);
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) {
    return { reason: `agent "${agentId}" was not found on this host` };
  }
  if (!agent.available) {
    return { reason: `agent "${agentId}" is not available on this host` };
  }
  const defaultModel = agent.defaultModel?.trim();
  if (!defaultModel) {
    return {
      reason: `agent "${agentId}" has no default model; set a model in the profile`,
    };
  }
  return { provider: `${agentId}/${defaultModel}`, model: defaultModel };
}

export interface AiTextRefinementOutcome {
  markdown: string;
  provenance: AiTextRefinementProvenance;
  warnings: string[];
}

export interface AiTextRefinementInput {
  paseo: any;
  settings: AiTextRefinementSettings;
  workspaceRootPath: string;
  fileName: string;
  language: string;
  markdown: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onLog?: (line: string) => void;
}

class RefinementAbortError extends Error {
  constructor() {
    super("AI text refinement was cancelled");
  }
}

function abortError(): Error {
  return new RefinementAbortError();
}

async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return await promise;
  if (signal.aborted) throw abortError();
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Applies the profile's refinement mode. Agent refinement is opt-in and falls
 * back to the parser output with an explicit reason, never silently.
 */
export async function refineAiTextMarkdown(
  input: AiTextRefinementInput,
): Promise<AiTextRefinementOutcome> {
  const { settings } = input;
  if (settings.mode === "none") {
    return {
      markdown: input.markdown,
      provenance: { mode: "none", didRun: false },
      warnings: [],
    };
  }

  if (settings.mode === "local") {
    return {
      markdown: refineMarkdownLocally(input.markdown),
      provenance: { mode: "local", didRun: false },
      warnings: [],
    };
  }

  const baseProvenance: AiTextRefinementProvenance = {
    mode: "agent",
    agentId: settings.agentId,
    ...(settings.model.trim() ? { model: settings.model.trim() } : {}),
    promptPresetId: settings.promptPresetId,
    didRun: false,
  };
  let activeProvenance = baseProvenance;
  const fallback = (reason: string): AiTextRefinementOutcome => ({
    markdown: refineMarkdownLocally(input.markdown),
    provenance: { ...activeProvenance, fallbackReason: reason },
    warnings: [`Agent refinement was skipped: ${reason}`],
  });

  if (input.markdown.length > AI_TEXT_REFINEMENT_MAX_INPUT_CHARS) {
    return fallback(
      `the parsed document is larger than ${AI_TEXT_REFINEMENT_MAX_INPUT_CHARS.toLocaleString()} characters`,
    );
  }
  if (!settings.agentId.trim()) {
    return fallback("no agent is selected in this profile");
  }
  if (input.signal?.aborted) throw abortError();

  const { systemPrompt, prompt } = composeRefinementPrompt({
    presetId: settings.promptPresetId,
    customPrompt: settings.prompt,
    fileName: input.fileName,
    language: input.language,
    markdown: input.markdown,
  });

  input.onProgress?.("Refining with agent");
  const resolution = await raceAbort(
    resolveAgentProvider(input, settings.agentId.trim()),
    input.signal,
  );
  if (!resolution.provider) {
    return fallback(
      resolution.reason ?? "no usable model is available for this agent",
    );
  }
  const provenance: AiTextRefinementProvenance = resolution.model
    ? { ...baseProvenance, model: resolution.model }
    : baseProvenance;
  activeProvenance = provenance;

  let handle: any = null;
  try {
    const createPromise = input.paseo.agents.create({
      config: { provider: resolution.provider, systemPrompt },
      cwd: input.workspaceRootPath,
      title: `AI Text refinement · ${input.fileName}`,
      labels: { "autumn-studio.role": "ai-text-refinement" },
      autoArchive: true,
      prompt,
    });
    // Aborting while `create` is in flight otherwise leaves an agent the
    // caller never sees and never archives.
    void Promise.resolve(createPromise).then(
      (lateHandle: any) => {
        if (input.signal?.aborted) {
          void Promise.resolve(lateHandle?.archive?.()).catch(() => undefined);
        }
      },
      () => undefined,
    );
    handle = await raceAbort(createPromise, input.signal);
    const result = (await raceAbort(
      handle.waitForFinish(
        input.timeoutMs ?? AGENT_REFINEMENT_TIMEOUT_MS,
      ),
      input.signal,
    )) as {
      status: string;
      error?: string | null;
      lastMessage?: string | null;
    };
    if (result.status === "timeout") {
      return fallback("the agent did not finish within the time limit");
    }
    if (result.status !== "idle") {
      return fallback(
        result.error?.trim() || `the agent reported ${result.status}`,
      );
    }
    const raw = typeof result.lastMessage === "string" ? result.lastMessage : "";
    if (!raw.trim()) {
      return fallback("the agent returned no text");
    }
    const validation = validateRefinedMarkdown(input.markdown, raw);
    if (!validation.ok) {
      return fallback(validation.error ?? "the agent output was not usable");
    }
    return {
      markdown: validation.markdown.endsWith("\n")
        ? validation.markdown
        : `${validation.markdown}\n`,
      provenance: { ...provenance, didRun: true },
      warnings: [],
    };
  } catch (error) {
    if (input.signal?.aborted || error instanceof RefinementAbortError) {
      throw abortError();
    }
    return fallback(error instanceof Error ? error.message : String(error));
  } finally {
    if (handle?.archive) {
      await handle.archive().catch(() => undefined);
    }
  }
}

export { RefinementAbortError };
