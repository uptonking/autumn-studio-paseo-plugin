import * as React from "react";
import { Bot, FileText, RefreshCw, X } from "lucide-react";
import {
  AI_TEXT_PARSER_CATALOG,
  type AiTextAgentOption,
  type AiTextParserProviderId,
  type AiTextVersionRecord,
} from "../../shared/contracts.js";
import { Button } from "../vendor/components/ui/button.js";
import { cn } from "../vendor/lib/utils.js";
import type { AiTextExtractOptions } from "./ai-text-context.js";

function formatShortTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  } catch {
    return iso;
  }
}

function formatStructureStatsSummary(version: AiTextVersionRecord): string | null {
  const { headingCount, tableCount, codeBlockCount } = version.provenance;
  const parts: string[] = [];
  if (typeof headingCount === "number" && headingCount > 0) {
    parts.push(`${headingCount} ${headingCount === 1 ? "heading" : "headings"}`);
  }
  if (typeof tableCount === "number" && tableCount > 0) {
    parts.push(`${tableCount} ${tableCount === 1 ? "table" : "tables"}`);
  }
  if (typeof codeBlockCount === "number" && codeBlockCount > 0) {
    parts.push(`${codeBlockCount} ${codeBlockCount === 1 ? "code block" : "code blocks"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface AiTextMetadataPanelProps {
  activeVersion: AiTextVersionRecord;
  isSourceStale: boolean;
  isExtracting: boolean;
  availableAgents: readonly AiTextAgentOption[];
  selectedParserOverride: AiTextParserProviderId;
  selectedAgentOverride: string;
  onChangeParserOverride(next: AiTextParserProviderId): void;
  onChangeAgentOverride(next: string): void;
  onTriggerAiText(options?: AiTextExtractOptions): void;
  onClose(): void;
}

export function AiTextMetadataPanel({
  activeVersion,
  isSourceStale,
  isExtracting,
  availableAgents,
  selectedParserOverride,
  selectedAgentOverride,
  onChangeParserOverride,
  onChangeAgentOverride,
  onTriggerAiText,
  onClose,
}: AiTextMetadataPanelProps) {
  const agentOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; label: string }[] = [];
    for (const agent of availableAgents) {
      if (!agent.id || seen.has(agent.id)) continue;
      seen.add(agent.id);
      list.push({ id: agent.id, label: agent.id });
    }
    for (const fallbackId of [
      "pi",
      "claude",
      "codex",
      "autumn-studio",
      "opencode",
      "copilot",
    ]) {
      if (!seen.has(fallbackId)) {
        seen.add(fallbackId);
        list.push({ id: fallbackId, label: fallbackId });
      }
    }
    return list;
  }, [availableAgents]);

  const statsSummary = formatStructureStatsSummary(activeVersion);

  return (
    <div
      data-testid="ai-text-metadata-panel"
      role="region"
      aria-label="AI text metadata"
      className="mx-2 mb-2 flex shrink-0 flex-col gap-1.5 rounded-lg border border-border/80 bg-popover/95 px-2.5 py-2 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="ai-text-provenance-version"
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
        >
          v{activeVersion.versionNumber}
        </span>
        <span
          data-testid="ai-text-provenance-parser"
          className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-medium text-foreground"
        >
          <FileText className="size-3 text-muted-foreground" />
          <span>
            Parser: {activeVersion.provenance.parserLabel}
            {activeVersion.provenance.parserMode
              ? ` (${activeVersion.provenance.parserMode})`
              : ""}
          </span>
        </span>
        <span
          data-testid="ai-text-provenance-agent"
          className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-medium text-foreground"
        >
          <Bot className="size-3 text-muted-foreground" />
          <span>Agent: {activeVersion.provenance.agentId}</span>
        </span>
        {activeVersion.provenance.ocrEnabled ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            OCR
          </span>
        ) : null}
        {activeVersion.provenance.formulaEnabled ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            LaTeX
          </span>
        ) : null}
        {activeVersion.provenance.tableEnabled ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            Tables
          </span>
        ) : null}
        {statsSummary ? (
          <span
            data-testid="ai-text-provenance-stats"
            className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {statsSummary}
          </span>
        ) : null}
        {isSourceStale ? (
          <button
            type="button"
            data-testid="ai-text-provenance-stale"
            onClick={() =>
              onTriggerAiText({
                parserId: selectedParserOverride,
                agentId: selectedAgentOverride,
              })
            }
            title="Source file was modified after this text version was extracted. Click to re-parse."
            className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <RefreshCw className="size-2.5" />
            <span>Source modified</span>
          </button>
        ) : null}
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {formatShortTimestamp(activeVersion.createdAt)} ·{" "}
          {activeVersion.durationMs}ms
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="ai-text-provenance-path"
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
          title={activeVersion.relPath}
        >
          {activeVersion.relPath}
        </span>
        <select
          data-testid="ai-text-reparse-parser-select"
          aria-label="Parser for next AI text run"
          value={selectedParserOverride}
          disabled={isExtracting}
          onChange={(e) =>
            onChangeParserOverride(e.target.value as AiTextParserProviderId)
          }
          className="h-6 rounded border border-border/70 bg-background px-1.5 text-[10px] font-medium text-foreground outline-none"
        >
          {AI_TEXT_PARSER_CATALOG.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
        <select
          data-testid="ai-text-reparse-agent-select"
          aria-label="Agent for next AI text run"
          value={selectedAgentOverride}
          disabled={isExtracting}
          onChange={(e) => onChangeAgentOverride(e.target.value)}
          className="h-6 rounded border border-border/70 bg-background px-1.5 text-[10px] font-medium text-foreground outline-none"
        >
          {agentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="ai-text-reparse-run-button"
          disabled={isExtracting}
          onClick={() =>
            onTriggerAiText({
              parserId: selectedParserOverride,
              agentId: selectedAgentOverride,
            })
          }
          title="Run AI text again with selected parser and agent"
          className="inline-flex h-6 items-center gap-1 rounded border border-border/80 bg-background px-1.5 text-[10px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-2.5", isExtracting && "animate-spin")}
          />
          <span>Re-parse</span>
        </button>
        <Button
          type="button"
          data-testid="ai-text-metadata-close"
          variant="ghost"
          size="icon-sm"
          aria-label="Close AI text metadata"
          title="Close AI text metadata"
          onClick={onClose}
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
