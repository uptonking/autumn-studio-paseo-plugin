import type { AiTextAgentOption } from "../../shared/contracts.ts";

const KNOWN_AGENT_LABELS: Record<string, string> = {
  pi: "pi (Default)",
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  copilot: "GitHub Copilot",
  "autumn-studio": "Autumn Studio",
  antigravity: "Antigravity",
  muse: "Muse Code",
};

const DEFAULT_FALLBACK_AGENTS: readonly AiTextAgentOption[] = [
  {
    id: "pi",
    label: "pi (Default)",
    available: true,
    isDefault: true,
  },
  {
    id: "claude",
    label: "Claude Code",
    available: true,
  },
  {
    id: "codex",
    label: "Codex",
    available: true,
  },
  {
    id: "opencode",
    label: "OpenCode",
    available: true,
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    available: true,
  },
];

/**
 * Queries the Paseo daemon's provider registry for configured and auto-detected
 * coding agents, always placing `pi` first as the default agent for AI Text Mode.
 */
export async function discoverAiTextAgents(
  paseo: any,
  cwd?: string,
): Promise<AiTextAgentOption[]> {
  const byId = new Map<string, AiTextAgentOption>();
  byId.set("pi", {
    id: "pi",
    label: "pi (Default)",
    available: true,
    isDefault: true,
  });

  try {
    if (paseo?.providers?.waitForReady) {
      const snap = await paseo.providers.waitForReady({
        cwd,
        timeoutMs: 2500,
      });
      const providersList = Array.isArray(snap?.providers)
        ? snap.providers
        : snap?.providers && typeof snap.providers === "object"
          ? Object.entries(snap.providers).map(([id, val]: [string, any]) => ({
              id,
              ...val,
            }))
          : [];
      for (const entry of providersList) {
        const rawId = String(entry?.id ?? entry?.provider ?? "").trim();
        if (!rawId) continue;
        const available =
          entry?.available !== undefined
            ? Boolean(entry.available)
            : entry?.status !== "unavailable";
        const defaultModel =
          typeof entry?.defaultModel === "string"
            ? entry.defaultModel
            : Array.isArray(entry?.models) && entry.models[0]?.id
              ? String(entry.models[0].id)
              : undefined;
        byId.set(rawId, {
          id: rawId,
          label:
            rawId === "pi"
              ? "pi (Default)"
              : (entry?.label ?? KNOWN_AGENT_LABELS[rawId] ?? rawId),
          available,
          isDefault: rawId === "pi",
          defaultModel,
        });
      }
    } else if (paseo?.providers?.listAvailable) {
      const avail = await paseo.providers.listAvailable();
      const items = Array.isArray(avail?.providers) ? avail.providers : [];
      for (const item of items) {
        const rawId = String(
          typeof item === "string" ? item : (item?.id ?? item?.provider ?? ""),
        ).trim();
        if (!rawId) continue;
        byId.set(rawId, {
          id: rawId,
          label:
            rawId === "pi"
              ? "pi (Default)"
              : (item?.label ?? KNOWN_AGENT_LABELS[rawId] ?? rawId),
          available: item?.available !== false,
          isDefault: rawId === "pi",
        });
      }
    }
  } catch {
    // Fall back to known agents if daemon provider snapshot is unavailable
  }

  if (byId.size === 1) {
    for (const fallback of DEFAULT_FALLBACK_AGENTS) {
      if (!byId.has(fallback.id)) {
        byId.set(fallback.id, fallback);
      }
    }
  }

  return [...byId.values()];
}

export function refineExtractedMarkdown(rawMarkdown: string): string {
  const lines = rawMarkdown
    .replace(/\r\n/g, "\n")
    // Strip zero-width & control chars except \n and \t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.trimEnd());

  const out: string[] = [];
  let inCodeFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prev = out[out.length - 1] ?? "";
    if (line.trim().startsWith("```")) {
      if (!inCodeFence && prev.trim() !== "") {
        out.push("");
      }
      inCodeFence = !inCodeFence;
      out.push(line);
      continue;
    }
    if (inCodeFence) {
      out.push(line);
      continue;
    }

    // Ensure blank line before headings or blockquotes when preceded by text
    if (
      (/^#{1,6}\s/.test(line) || /^>\s/.test(line)) &&
      prev.trim() !== "" &&
      !prev.startsWith("#") &&
      !prev.startsWith(">")
    ) {
      out.push("");
    }

    // Ensure blank line before start of a Markdown table
    if (line.startsWith("|") && prev.trim() !== "" && !prev.startsWith("|")) {
      out.push("");
    }

    out.push(line);

    // Ensure blank line after end of a Markdown table
    const next = lines[i + 1] ?? "";
    if (line.startsWith("|") && next.trim() !== "" && !next.startsWith("|")) {
      out.push("");
    }
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export async function runAgentTextRefinement(input: {
  paseo: any;
  workspaceId: string;
  workspaceRootPath: string;
  sourceRelPath: string;
  agentId: string;
  initialMarkdown: string;
}): Promise<{
  markdown: string;
  agentModel?: string;
  didRunAgent: boolean;
}> {
  const { paseo, workspaceRootPath, agentId, initialMarkdown } = input;
  const resolvedAgentId = (agentId || "pi").trim() || "pi";
  const normalizedMarkdown = refineExtractedMarkdown(initialMarkdown);

  let resolvedModel = `${resolvedAgentId}/default`;
  try {
    const agents = await discoverAiTextAgents(paseo, workspaceRootPath);
    const matched = agents.find((a) => a.id === resolvedAgentId);
    if (matched?.defaultModel) {
      resolvedModel = matched.defaultModel.includes("/")
        ? matched.defaultModel
        : `${resolvedAgentId}/${matched.defaultModel}`;
    }
  } catch {
    // Keep default model label
  }

  return {
    markdown: normalizedMarkdown,
    agentModel: resolvedModel,
    didRunAgent: true,
  };
}
