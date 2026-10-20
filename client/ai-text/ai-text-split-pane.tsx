import * as React from "react";
import {
  Check,
  Copy,
  Ellipsis,
  Eye,
  FileText,
  Info,
  Loader2,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { AiTextParserProviderId } from "../../shared/contracts.js";
import { Button } from "../vendor/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../vendor/components/ui/dropdown-menu.js";
import { cn } from "../vendor/lib/utils.js";
import { MarkdownPreview } from "../viewers/markdown-preview.js";
import type {
  FileSaveCallbackInput,
  FileSaveCallbackResult,
} from "../viewers/registry.js";
import type { FileAiTextContextValue } from "./ai-text-context.js";
import { AiTextMetadataPanel } from "./ai-text-metadata-panel.js";

type SplitTextDisplayMode = "preview" | "raw" | "edit";

export interface AiTextSplitPaneProps {
  fileName: string;
  aiTextState: FileAiTextContextValue;
  autoSaveEdits?: boolean;
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>;
}

export function AiTextSplitPane({
  fileName,
  aiTextState,
  onSaveFile,
}: AiTextSplitPaneProps) {
  const {
    isExtracting,
    error,
    metadata,
    activeVersion,
    activeContent,
    availableAgents,
    settings,
    sourceUpdatedAt,
    sourceFileSize,
    isOriginalHidden,
    onTriggerAiText,
    onSelectVersion,
    onDeleteVersion,
    onCloseSplit,
    onShowOriginal,
    onUpdateActiveContent,
  } = aiTextState;

  const isSourceStale = Boolean(
    activeVersion &&
      ((sourceUpdatedAt !== undefined &&
        sourceUpdatedAt > activeVersion.sourceMtimeMs + 1000) ||
        (sourceFileSize !== undefined &&
          sourceFileSize > 0 &&
          sourceFileSize !== activeVersion.sourceSize)),
  );

  const [displayMode, setDisplayMode] =
    React.useState<SplitTextDisplayMode>("preview");
  const [selectedParserOverride, setSelectedParserOverride] =
    React.useState<AiTextParserProviderId>(settings.defaultParser);
  const [selectedAgentOverride, setSelectedAgentOverride] =
    React.useState<string>(settings.defaultAgent || "pi");
  const [draftText, setDraftText] = React.useState<string>(activeContent ?? "");
  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [savedFeedback, setSavedFeedback] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [isMetadataPanelOpen, setIsMetadataPanelOpen] = React.useState(true);

  React.useEffect(() => {
    setSelectedParserOverride(settings.defaultParser);
    setSelectedAgentOverride(settings.defaultAgent || "pi");
  }, [settings.defaultAgent, settings.defaultParser]);

  React.useEffect(() => {
    setDraftText(activeContent ?? "");
    setIsDirty(false);
  }, [activeContent, activeVersion?.id]);

  const versions = metadata?.versions ?? [];

  const handleSaveEditedMarkdown = React.useCallback(async () => {
    if (!onSaveFile || !activeVersion || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveFile({
        relPath: activeVersion.relPath,
        contentType: "text/markdown",
        payload: {
          encoding: "utf8",
          data: draftText,
          mimeType: "text/markdown;charset=utf-8",
        },
      });
      onUpdateActiveContent(draftText);
      setIsDirty(false);
      setSavedFeedback(true);
      window.setTimeout(() => setSavedFeedback(false), 1500);
    } finally {
      setIsSaving(false);
    }
  }, [activeVersion, draftText, isSaving, onSaveFile, onUpdateActiveContent]);

  const handleCopy = React.useCallback(() => {
    const textToCopy = displayMode === "edit" ? draftText : (activeContent ?? "");
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [activeContent, displayMode, draftText]);

  return (
    <div className="flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Top toolbar of the right AI Text split pane */}
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-1.5 border-b bg-muted/30 px-2.5 py-1.5 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground">
            <Sparkles className="size-3.5 text-amber-500" />
            <span>AI Text</span>
          </span>

          {versions.length > 0 ? (
            <select
              data-testid="ai-text-version-select"
              aria-label="Select extracted text version"
              value={activeVersion?.id ?? ""}
              disabled={isExtracting}
              onChange={(e) => onSelectVersion(e.target.value)}
              className="h-7 min-w-[110px] max-w-[210px] flex-1 truncate rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {versions.map((ver) => (
                <option key={ver.id} value={ver.id}>
                  {`v${ver.versionNumber} · ${ver.provenance.parserId} + ${ver.provenance.agentId} (${ver.fileName})`}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-muted-foreground">{fileName}</span>
          )}

          {versions.length > 1 ? (
            <div
              role="group"
              aria-label="Quick switch text version"
              data-testid="ai-text-version-pills"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
            >
              {versions.slice(0, 5).map((ver) => {
                const isActive = ver.id === activeVersion?.id;
                return (
                  <button
                    key={ver.id}
                    type="button"
                    data-testid={`ai-text-version-pill-v${ver.versionNumber}`}
                    aria-pressed={isActive}
                    disabled={isExtracting}
                    title={`Switch to v${ver.versionNumber} (${ver.provenance.parserId} + ${ver.provenance.agentId})`}
                    onClick={() => onSelectVersion(ver.id)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                      isActive
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {`v${ver.versionNumber}`}
                  </button>
                );
              })}
            </div>
          ) : null}

          {versions.length > 1 ? (
            <span
              data-testid="ai-text-version-count"
              className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {versions.length} versions
            </span>
          ) : null}

          {activeVersion ? (
            <Button
              type="button"
              data-testid="ai-text-version-delete"
              variant="ghost"
              size="icon-sm"
              disabled={isExtracting}
              aria-label={`Delete v${activeVersion.versionNumber}`}
              title={`Delete v${activeVersion.versionNumber} (${activeVersion.fileName})`}
              onClick={() => onDeleteVersion(activeVersion.id)}
              className="size-6 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {displayMode === "edit" && onSaveFile && activeVersion ? (
            <Button
              type="button"
              data-testid="ai-text-save-button"
              variant={isDirty ? "default" : "outline"}
              size="xs"
              disabled={isSaving}
              onClick={() => void handleSaveEditedMarkdown()}
              className="h-7 gap-1 px-2 text-xs"
            >
              {isSaving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : savedFeedback && !isDirty ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Save className="size-3" />
              )}
              <span>
                {isSaving ? "Saving…" : savedFeedback && !isDirty ? "Saved" : "Save"}
              </span>
            </Button>
          ) : null}

          <div
            role="group"
            aria-label="AI text view mode"
            className="inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-[11px]"
          >
            <button
              type="button"
              data-testid="ai-text-mode-preview"
              aria-pressed={displayMode === "preview"}
              onClick={() => setDisplayMode("preview")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
                displayMode === "preview"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              data-testid="ai-text-mode-raw"
              aria-pressed={displayMode === "raw"}
              onClick={() => setDisplayMode("raw")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
                displayMode === "raw"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileText className="size-3" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              data-testid="ai-text-mode-edit"
              aria-pressed={displayMode === "edit"}
              onClick={() => setDisplayMode("edit")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
                displayMode === "edit"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3" />
              <span>Edit</span>
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Copy extracted text"
            title="Copy extracted text"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                data-testid="ai-text-view-actions"
                variant="ghost"
                size="icon-sm"
                aria-label="AI text view actions"
                title="AI text view actions"
              >
                <Ellipsis className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                data-testid="ai-text-show-original-menu-item"
                title={
                  isOriginalHidden
                    ? "Show the original file next to the AI text"
                    : "Original file is already visible"
                }
                onClick={onShowOriginal}
              >
                <PanelLeftOpen className="size-4" />
                Show original file
              </DropdownMenuItem>
              {activeVersion ? (
                <DropdownMenuItem
                  data-testid="ai-text-show-metadata-menu-item"
                  title={
                    isMetadataPanelOpen
                      ? "AI text metadata is already visible"
                      : "Show AI text metadata"
                  }
                  onClick={() => setIsMetadataPanelOpen(true)}
                >
                  <Info className="size-4" />
                  Show AI text metadata
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            data-testid="ai-text-split-close"
            variant="ghost"
            size="icon-sm"
            aria-label="Close AI Text split view"
            title="Close AI Text split view"
            onClick={onCloseSplit}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Extraction in-progress banner when re-parsing with existing content */}
      {isExtracting && activeContent !== null ? (
        <div
          data-testid="ai-text-reparse-banner"
          className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span>
            Generating new AI text version with{" "}
            <strong>{selectedParserOverride}</strong> +{" "}
            <strong>{selectedAgentOverride}</strong> into{" "}
            <code>{settings.outputRootDir}/</code>…
          </span>
        </div>
      ) : null}

      {/* Error banner */}
      {error ? (
        <div
          role="alert"
          data-testid="ai-text-error-banner"
          className="flex items-center justify-between gap-2 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="truncate">{error}</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onTriggerAiText()}
            className="h-6 gap-1 px-2 text-xs"
          >
            <RefreshCw className="size-3" />
            <span>Retry</span>
          </Button>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isExtracting && activeContent === null ? (
          <div
            data-testid="ai-text-extracting-state"
            className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Extracting AI Text for “{fileName}”…
              </p>
              <p className="text-xs text-muted-foreground">
                Parser: <span className="font-medium">{settings.defaultParser}</span>{" "}
                · Agent: <span className="font-medium">{settings.defaultAgent}</span>{" "}
                · Output: <code>{settings.outputRootDir}/</code>
              </p>
            </div>
          </div>
        ) : activeContent === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              No extracted text available yet
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => onTriggerAiText()}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="size-3.5" />
              <span>Extract AI Text</span>
            </Button>
          </div>
        ) : displayMode === "edit" ? (
          <textarea
            data-testid="ai-text-editor-textarea"
            aria-label="Edit extracted AI text"
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              setIsDirty(true);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void handleSaveEditedMarkdown();
              }
            }}
            spellCheck={false}
            className="size-full min-h-0 flex-1 resize-none bg-background p-4 font-mono text-xs leading-5 text-foreground outline-none"
          />
        ) : displayMode === "raw" ? (
          <pre
            data-testid="ai-text-raw-content"
            className="size-full min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-foreground"
          >
            {activeContent}
          </pre>
        ) : (
          <div
            data-testid="ai-text-preview-content"
            className="flex size-full min-h-0 flex-1 overflow-hidden"
          >
            <MarkdownPreview content={activeContent} />
          </div>
        )}
      </div>

      {activeVersion && isMetadataPanelOpen ? (
        <AiTextMetadataPanel
          activeVersion={activeVersion}
          isSourceStale={isSourceStale}
          isExtracting={isExtracting}
          availableAgents={availableAgents}
          selectedParserOverride={selectedParserOverride}
          selectedAgentOverride={selectedAgentOverride}
          onChangeParserOverride={setSelectedParserOverride}
          onChangeAgentOverride={setSelectedAgentOverride}
          onTriggerAiText={onTriggerAiText}
          onClose={() => setIsMetadataPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}
