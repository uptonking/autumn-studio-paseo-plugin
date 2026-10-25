import * as React from "react";
import { Check, Eye, Loader2, Pencil, Save, Sparkles } from "lucide-react";
import { FileAiTextContext } from "../ai-text/ai-text-context.js";
import { Button } from "../vendor/components/ui/button.js";
import { cn } from "../vendor/lib/utils.js";
import type { FileSurfaceRole } from "../viewers/provider-catalog.js";
import type { FileEditSession } from "./use-file-edit-session.js";

export const FileSurfacePreloadContext = React.createContext<
  ((role: FileSurfaceRole) => void) | null
>(null);

export function AiTextToolbarButton({ className }: { className?: string }) {
  const aiText = React.useContext(FileAiTextContext);
  if (!aiText || !aiText.enabled || !aiText.supported) return null;

  const { isSplitOpen, isExtracting, metadata, onTriggerAiText } = aiText;
  const versionCount = metadata?.versions.length ?? 0;
  const buttonLabel = isSplitOpen ? "AI text again" : "AI Text Mode";

  return (
    <Button
      type="button"
      data-testid="ai-text-mode-button"
      data-split-open={isSplitOpen ? "true" : "false"}
      variant={isSplitOpen ? "secondary" : "outline"}
      size="xs"
      disabled={isExtracting}
      onClick={() => onTriggerAiText()}
      aria-label={buttonLabel}
      title={
        isSplitOpen
          ? "Re-parse document with AI Text Mode and create a new text version in .autumn/"
          : "Extract document text into .autumn/ and open side-by-side split view"
      }
      className={cn("h-7 gap-1 px-2 text-xs font-medium", className)}
    >
      {isExtracting ? (
        <Loader2 className="size-3.5 animate-spin text-amber-500" />
      ) : (
        <Sparkles className="size-3.5 text-amber-500" />
      )}
      <span>{buttonLabel}</span>
      {!isSplitOpen && versionCount > 0 ? (
        <span
          data-testid="ai-text-button-version-badge"
          className="ml-0.5 rounded bg-muted px-1 py-0 text-[10px] font-semibold text-muted-foreground"
        >
          {versionCount}
        </span>
      ) : null}
    </Button>
  );
}

export interface SurfaceModeSwitcherProps {
  role: FileSurfaceRole;
  canEdit?: boolean;
  onRoleChange?: (nextRole: FileSurfaceRole) => void;
  onChangeRole?: (nextRole: FileSurfaceRole) => void;
  onPreloadRole?: (nextRole: FileSurfaceRole) => void;
  className?: string;
}

export function SurfaceModeSwitcher({
  role,
  canEdit = true,
  onRoleChange,
  onChangeRole,
  onPreloadRole,
  className,
}: SurfaceModeSwitcherProps) {
  const contextPreloadRole = React.useContext(FileSurfacePreloadContext);
  const aiText = React.useContext(FileAiTextContext);
  const handleSelectRole = onRoleChange ?? onChangeRole;
  const handlePreloadRole = onPreloadRole ?? contextPreloadRole;
  const showRoleButtons = Boolean(canEdit && handleSelectRole);
  const showAiTextButton = Boolean(aiText?.enabled && aiText?.supported);

  if (!showRoleButtons && !showAiTextButton) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      {showRoleButtons && handleSelectRole ? (
        <div
          role="group"
          aria-label="Document mode"
          data-slot="surface-mode-switcher"
          data-testid="surface-mode-switcher"
          className={cn(
            "inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-xs",
            className,
          )}
        >
          <button
            type="button"
            data-testid="surface-mode-viewer"
            aria-label="Switch to Viewer"
            aria-pressed={role === "viewer"}
            onPointerEnter={() => {
              if (role !== "viewer") handlePreloadRole?.("viewer");
            }}
            onFocus={() => {
              if (role !== "viewer") handlePreloadRole?.("viewer");
            }}
            onClick={() => handleSelectRole("viewer")}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors",
              role === "viewer"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="size-3.5" />
            <span>Viewer</span>
          </button>
          <button
            type="button"
            data-testid="surface-mode-editor"
            aria-label="Switch to Editor"
            aria-pressed={role === "editor"}
            onPointerEnter={() => {
              if (role !== "editor") handlePreloadRole?.("editor");
            }}
            onFocus={() => {
              if (role !== "editor") handlePreloadRole?.("editor");
            }}
            onClick={() => handleSelectRole("editor")}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors",
              role === "editor"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="size-3.5" />
            <span>Editor</span>
          </button>
        </div>
      ) : null}
      <AiTextToolbarButton />
    </div>
  );
}

export interface EditorSaveControlsProps {
  editSession?: FileEditSession;
  onManualSave?: () => void;
  className?: string;
}

export function EditorSaveControls({
  editSession,
  onManualSave,
  className,
}: EditorSaveControlsProps) {
  if (!editSession) return null;

  const { isDirty, saveState, saveError, saveErrorKind, saveNow } = editSession;
  const handleSaveClick = () => {
    if (onManualSave) {
      onManualSave();
    } else {
      void saveNow();
    }
  };

  return (
    <div
      data-slot="editor-save-controls"
      data-testid="editor-save-controls"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <Button
        type="button"
        data-testid="editor-save-button"
        variant={isDirty ? "default" : "outline"}
        size="xs"
        disabled={saveState === "saving"}
        onClick={handleSaveClick}
        aria-label="Save changes to file system"
        title={
          saveError
            ? `Save failed: ${saveError}`
            : "Save to file system (Cmd/Ctrl+S)"
        }
        className="h-7 gap-1 px-2 text-xs"
      >
        {saveState === "saving" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : saveState === "saved" && !isDirty ? (
          <Check className="size-3.5 text-emerald-500" />
        ) : (
          <Save className="size-3.5" />
        )}
        <span>
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved" && !isDirty
              ? "Saved"
              : "Save"}
        </span>
      </Button>
      {saveError && saveErrorKind === "conflict" ? (
        <>
          <Button
            type="button"
            data-testid="editor-save-reload"
            variant="outline"
            size="xs"
            disabled={saveState === "saving"}
            onClick={() => {
              editSession.discardPendingChanges();
            }}
            title="Discard your changes and reload the file from disk."
            className="h-7 px-2 text-xs"
          >
            Reload
          </Button>
          <Button
            type="button"
            data-testid="editor-save-overwrite"
            variant="outline"
            size="xs"
            disabled={saveState === "saving"}
            onClick={() => {
              void saveNow(undefined, { force: true });
            }}
            title="The file changed on disk. Overwrite it with your changes."
            className="h-7 px-2 text-xs"
          >
            Overwrite
          </Button>
        </>
      ) : null}
      {saveError ? (
        <span
          role="alert"
          className="max-w-36 truncate text-[11px] text-destructive"
          title={saveError}
        >
          {saveErrorKind === "deleted"
            ? "File was deleted — restore it to save"
            : saveError}
        </span>
      ) : null}
    </div>
  );
}
