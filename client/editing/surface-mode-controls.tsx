import * as React from "react";
import { Check, Eye, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "../vendor/components/ui/button.js";
import { cn } from "../vendor/lib/utils.js";
import type { FileSurfaceRole } from "../viewers/provider-catalog.js";
import type { FileEditSession } from "./use-file-edit-session.js";

export const FileSurfacePreloadContext = React.createContext<
  ((role: FileSurfaceRole) => void) | null
>(null);

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
  const handleSelectRole = onRoleChange ?? onChangeRole;
  const handlePreloadRole = onPreloadRole ?? contextPreloadRole;
  if (!canEdit || !handleSelectRole) return null;

  return (
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

  const { isDirty, saveState, saveError, saveNow } = editSession;
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
      {saveError ? (
        <span
          role="alert"
          className="max-w-36 truncate text-[11px] text-destructive"
          title={saveError}
        >
          {saveError}
        </span>
      ) : null}
    </div>
  );
}
