import * as React from "react";
import { Bot, FileText, RefreshCw, Settings2, X } from "lucide-react";
import {
  computeAiTextProfileFingerprint,
  getAiTextProfile,
  type AiTextProfile,
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

function refinementLabel(provenance: AiTextVersionRecord["provenance"]): string {
  const { refinement } = provenance;
  if (refinement.mode === "none") return "Refinement off";
  if (refinement.mode === "local") return "Auto formatting";
  // The profile asked for an agent but parser output was stored instead.
  if (!refinement.didRun) return "Auto formatting (agent skipped)";
  const agent = refinement.agentId?.trim() || "agent";
  const model = refinement.model ? ` · ${refinement.model}` : "";
  return `Agent ${agent}${model}`;
}

const CHIP =
  "inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-medium text-foreground";
const MUTED_CHIP = "rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium";

function VersionProvenance({
  version,
  profiles,
  isSourceStale,
  onReparse,
}: {
  version: AiTextVersionRecord;
  profiles: readonly AiTextProfile[];
  isSourceStale: boolean;
  onReparse(): void;
}) {
  const provenance = version.provenance;
  const activeProfile = getAiTextProfile(profiles, provenance.profileId);
  const profileChanged = activeProfile
    ? computeAiTextProfileFingerprint(activeProfile) !==
      provenance.profileFingerprint
    : true;
  const statsSummary = formatStructureStatsSummary(version);
  const routeSuffix = provenance.route ? ` · ${provenance.route}` : "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="ai-text-provenance-version"
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
        >
          v{version.versionNumber}
        </span>
        <span
          data-testid="ai-text-provenance-profile"
          title={`Fingerprint ${provenance.profileFingerprint}`}
          className={CHIP}
        >
          <FileText className="size-3 text-muted-foreground" />
          <span>{provenance.profileName}</span>
        </span>
        {profileChanged ? (
          <span
            data-testid="ai-text-provenance-profile-changed"
            title={
              activeProfile
                ? "This profile was edited after this version was parsed."
                : provenance.profileFingerprint
                  ? "This version's profile no longer exists in settings."
                  : "This version predates parsing profiles."
            }
            className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
          >
            {activeProfile
              ? "Profile changed"
              : provenance.profileFingerprint
                ? "Profile removed"
                : "Legacy version"}
          </span>
        ) : null}
        <span data-testid="ai-text-provenance-engine" className={CHIP}>
          <span>
            {provenance.engineLabel}
            {routeSuffix}
            {provenance.engineVersion ? ` · ${provenance.engineVersion}` : ""}
          </span>
        </span>
        <span data-testid="ai-text-provenance-refinement" className={CHIP}>
          <Bot className="size-3 text-muted-foreground" />
          <span>{refinementLabel(provenance)}</span>
        </span>
        {provenance.extraction.ocr ? (
          <span className={MUTED_CHIP}>OCR</span>
        ) : null}
        {provenance.extraction.formula ? (
          <span className={MUTED_CHIP}>LaTeX</span>
        ) : null}
        {provenance.extraction.tables ? (
          <span className={MUTED_CHIP}>Tables</span>
        ) : null}
        {statsSummary ? (
          <span
            data-testid="ai-text-provenance-stats"
            className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {statsSummary}
          </span>
        ) : null}
        {version.layout ? (
          <span
            data-testid="ai-text-provenance-layout"
            className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
          >
            {version.layout.blockCount} blocks · {version.layout.pageCount} pages
          </span>
        ) : null}
        {isSourceStale ? (
          <button
            type="button"
            data-testid="ai-text-provenance-stale"
            onClick={onReparse}
            title="Source file was modified after this text version was extracted. Click to re-parse."
            className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <RefreshCw className="size-2.5" />
            <span>Source modified</span>
          </button>
        ) : null}
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {formatShortTimestamp(version.createdAt)} · {version.durationMs}ms
        </span>
      </div>

      {provenance.fallbackReason ||
      (provenance.warnings?.length ?? 0) > 0 ||
      provenance.refinement.fallbackReason ? (
        <div
          data-testid="ai-text-provenance-warnings"
          className="flex flex-col gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-800 dark:text-amber-200"
        >
          {provenance.fallbackReason ? (
            <span>Fallback: {provenance.fallbackReason}</span>
          ) : null}
          {provenance.refinement.fallbackReason ? (
            <span>Refinement: {provenance.refinement.fallbackReason}</span>
          ) : null}
          {provenance.warnings?.map((warning, index) => (
            <span key={index}>{warning}</span>
          ))}
        </div>
      ) : null}

      {version.relPath ? (
        <span
          data-testid="ai-text-provenance-path"
          className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
          title={version.relPath}
        >
          {version.relPath}
        </span>
      ) : null}
    </>
  );
}

export interface AiTextMetadataPanelProps {
  activeVersion: AiTextVersionRecord | null;
  isSourceStale: boolean;
  isExtracting: boolean;
  profiles: readonly AiTextProfile[];
  selectedProfileId: string;
  defaultProfileId: string;
  onSelectProfile(profileId: string): void;
  onTriggerAiText(options?: AiTextExtractOptions): void;
  onClose(): void;
  onOpenSettings?(): void;
}

export function AiTextMetadataPanel({
  activeVersion,
  isSourceStale,
  isExtracting,
  profiles,
  selectedProfileId,
  defaultProfileId,
  onSelectProfile,
  onTriggerAiText,
  onClose,
  onOpenSettings,
}: AiTextMetadataPanelProps) {
  const reparse = React.useCallback(() => {
    onTriggerAiText(
      selectedProfileId ? { profileId: selectedProfileId } : undefined,
    );
  }, [onTriggerAiText, selectedProfileId]);

  return (
    <div
      data-testid="ai-text-metadata-panel"
      role="region"
      aria-label="AI text metadata"
      className="mx-2 mb-2 flex shrink-0 flex-col gap-1.5 rounded-lg border border-border/80 bg-popover/95 px-2.5 py-2 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm"
    >
      {activeVersion ? (
        <VersionProvenance
          version={activeVersion}
          profiles={profiles}
          isSourceStale={isSourceStale}
          onReparse={reparse}
        />
      ) : (
        <span className="font-medium text-foreground">
          Choose a parsing profile, then extract text.
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          data-testid="ai-text-reparse-profile-select"
          aria-label="Profile for the next AI text run"
          value={selectedProfileId}
          disabled={isExtracting || profiles.length === 0}
          onChange={(event) => onSelectProfile(event.target.value)}
          className="h-6 max-w-56 rounded border border-border/70 bg-background px-1.5 text-[10px] font-medium text-foreground outline-none"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
              {profile.id === defaultProfileId ? " (default)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="ai-text-reparse-run-button"
          disabled={isExtracting || !selectedProfileId}
          onClick={reparse}
          title="Run AI text again with the selected profile"
          className="inline-flex h-6 items-center gap-1 rounded border border-border/80 bg-background px-1.5 text-[10px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-2.5", isExtracting && "animate-spin")}
          />
          <span>Re-parse</span>
        </button>
        {onOpenSettings ? (
          <Button
            type="button"
            data-testid="ai-text-open-settings"
            variant="ghost"
            size="icon-sm"
            aria-label="Open AI Text settings"
            title="Open AI Text settings"
            onClick={onOpenSettings}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="size-3" />
          </Button>
        ) : null}
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
