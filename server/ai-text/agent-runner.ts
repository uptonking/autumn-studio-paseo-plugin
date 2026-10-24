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
