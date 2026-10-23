import { Eye, FileText, LayoutGrid, Pencil } from "lucide-react";
import { cn } from "../vendor/lib/utils.js";
import type { AiTextLayoutStatus } from "./ai-text-types.js";

export type SplitTextDisplayMode = "preview" | "raw" | "edit" | "blocks";

const BASE_MODE_CLASS =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors";

function modeClass(isActive: boolean): string {
  return cn(
    BASE_MODE_CLASS,
    isActive
      ? "bg-background text-foreground shadow-xs"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function AiTextViewModeToggle({
  displayMode,
  canShowBlocks,
  layoutStatus,
  onChoose,
}: {
  displayMode: SplitTextDisplayMode;
  canShowBlocks: boolean;
  layoutStatus: AiTextLayoutStatus;
  onChoose(mode: SplitTextDisplayMode): void;
}) {
  return (
    <div
      role="group"
      aria-label="AI text view mode"
      className="inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-[11px]"
    >
      <button
        type="button"
        data-testid="ai-text-mode-preview"
        aria-pressed={displayMode === "preview"}
        onClick={() => onChoose("preview")}
        className={modeClass(displayMode === "preview")}
      >
        <Eye className="size-3" />
        <span>Preview</span>
      </button>
      <button
        type="button"
        data-testid="ai-text-mode-raw"
        aria-pressed={displayMode === "raw"}
        onClick={() => onChoose("raw")}
        className={modeClass(displayMode === "raw")}
      >
        <FileText className="size-3" />
        <span>Markdown</span>
      </button>
      <button
        type="button"
        data-testid="ai-text-mode-edit"
        aria-pressed={displayMode === "edit"}
        onClick={() => onChoose("edit")}
        className={modeClass(displayMode === "edit")}
      >
        <Pencil className="size-3" />
        <span>Edit</span>
      </button>
      {canShowBlocks ? (
        <button
          type="button"
          data-testid="ai-text-mode-blocks"
          aria-pressed={displayMode === "blocks"}
          title={
            layoutStatus === "ready"
              ? "Layout blocks extracted from the original pages"
              : "Layout blocks are loading or unavailable"
          }
          onClick={() => onChoose("blocks")}
          className={modeClass(displayMode === "blocks")}
        >
          <LayoutGrid className="size-3" />
          <span>Blocks</span>
        </button>
      ) : null}
    </div>
  );
}
