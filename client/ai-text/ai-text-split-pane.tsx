import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Ellipsis,
  Info,
  Loader2,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { sanitizeAssetRelativePath } from "../../shared/asset-paths.js";
import type { AiTextParserProviderId } from "../../shared/contracts.js";
import { Button } from "../vendor/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../vendor/components/ui/dropdown-menu.js";
import { MarkdownPreview } from "../viewers/markdown-preview.js";
import type {
  FileSaveCallbackInput,
  FileSaveCallbackResult,
} from "../viewers/registry.js";
import type { FileAiTextContextValue } from "./ai-text-context.js";
import { AiTextAssetImage } from "./ai-text-asset-image.js";
import { AiTextLayoutBlocksPanel } from "./ai-text-layout-blocks-panel.js";
import { AiTextMetadataPanel } from "./ai-text-metadata-panel.js";
import {
  AiTextTaskProgress,
  looksLikeModelProblem,
} from "./ai-text-task-progress.js";
import { AiTextVersionToolbar } from "./ai-text-version-toolbar.js";
import {
  AiTextViewModeToggle,
  type SplitTextDisplayMode,
} from "./ai-text-view-mode-toggle.js";

export interface AiTextSplitPaneProps {
  fileName: string;
  aiTextState: FileAiTextContextValue;
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
    task,
    metadata,
    activeVersion,
    activeContent,
    availableAgents,
    settings,
    sourceUpdatedAt,
    sourceFileSize,
    isOriginalHidden,
    layout,
    layoutStatus,
    layoutMessage,
    activeBlockId,
    defaultViewer,
    onTriggerAiText,
    onRetryExtraction,
    onCancelExtraction,
    onDownloadModels,
    onSelectVersion,
    onDeleteVersion,
    onCloseSplit,
    onShowOriginal,
    onUpdateActiveContent,
    onFocusLayoutBlock,
    getAsset,
  } = aiTextState;

  const isSourceStale = Boolean(
    activeVersion &&
      ((sourceUpdatedAt !== undefined &&
        sourceUpdatedAt > activeVersion.sourceMtimeMs + 1000) ||
        (sourceFileSize !== undefined &&
          sourceFileSize > 0 &&
          sourceFileSize !== activeVersion.sourceSize)),
  );

  const [displayMode, setDisplayMode] = React.useState<SplitTextDisplayMode>(
    () =>
      defaultViewer === "layout-blocks" && activeVersion?.layout
        ? "blocks"
        : "preview",
  );
  const hasUserChosenModeRef = React.useRef(false);
  const [selectedParserOverride, setSelectedParserOverride] =
    React.useState<AiTextParserProviderId>(settings.defaultParser);
  const [selectedAgentOverride, setSelectedAgentOverride] =
    React.useState<string>(settings.defaultAgent || "pi");
  const [draftText, setDraftText] = React.useState<string>(activeContent ?? "");
  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [savedFeedback, setSavedFeedback] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isMetadataPanelOpen, setIsMetadataPanelOpen] = React.useState(true);
  const savingRef = React.useRef(false);
  const savedFeedbackTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(
    () => () => {
      if (savedFeedbackTimerRef.current !== null) {
        clearTimeout(savedFeedbackTimerRef.current);
      }
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const chooseDisplayMode = React.useCallback((mode: SplitTextDisplayMode) => {
    hasUserChosenModeRef.current = true;
    setDisplayMode(mode);
  }, []);

  // A mode chosen for one document should not override the default viewer
  // after the split switches to another file. Re-parsing the same document
  // keeps the user's choice because `sourceRelPath` stays the same.
  const sourceRelPath = metadata?.sourceRelPath ?? null;
  React.useEffect(() => {
    hasUserChosenModeRef.current = false;
  }, [sourceRelPath]);

  React.useEffect(() => {
    setSelectedParserOverride(settings.defaultParser);
    setSelectedAgentOverride(settings.defaultAgent || "pi");
  }, [settings.defaultAgent, settings.defaultParser]);

  React.useEffect(() => {
    setDraftText(activeContent ?? "");
    setIsDirty(false);
    setSaveError(null);
  }, [activeContent, activeVersion?.id]);

  React.useEffect(() => {
    if (hasUserChosenModeRef.current) return;
    if (defaultViewer === "layout-blocks" && activeVersion?.layout) {
      setDisplayMode("blocks");
    } else if (defaultViewer === "text") {
      setDisplayMode("preview");
    }
  }, [activeVersion?.id, activeVersion?.layout, defaultViewer]);

  React.useEffect(() => {
    if (displayMode === "blocks" && !activeVersion?.layout && layoutStatus !== "loading") {
      setDisplayMode("preview");
    }
  }, [activeVersion?.layout, displayMode, layoutStatus]);

  const canShowBlocks =
    Boolean(activeVersion?.layout) ||
    layoutStatus === "ready" ||
    layoutStatus === "loading";

  const renderMarkdownImage = React.useCallback(
    (src: string, alt: string) => {
      const assetPath = sanitizeAssetRelativePath(src);
      if (!assetPath) return null;
      return (
        <AiTextAssetImage
          assetPath={assetPath}
          alt={alt || "Document image"}
          loadAsset={getAsset}
          className="max-h-96 w-full object-contain"
        />
      );
    },
    [getAsset],
  );

  const versions = metadata?.versions ?? [];

  const handleSaveEditedMarkdown = React.useCallback(async () => {
    if (!onSaveFile || !activeVersion || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
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
      if (savedFeedbackTimerRef.current !== null) {
        clearTimeout(savedFeedbackTimerRef.current);
      }
      savedFeedbackTimerRef.current = setTimeout(() => {
        savedFeedbackTimerRef.current = null;
        setSavedFeedback(false);
      }, 1500);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save AI text edits",
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [activeVersion, draftText, onSaveFile, onUpdateActiveContent]);

  const handleCopy = React.useCallback(() => {
    const textToCopy = displayMode === "edit" ? draftText : (activeContent ?? "");
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy).then(
      () => {
        setCopied(true);
        if (copiedTimerRef.current !== null) {
          clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = setTimeout(() => {
          copiedTimerRef.current = null;
          setCopied(false);
        }, 1500);
      },
      () => setSaveError("Could not copy text to the clipboard"),
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

          <AiTextVersionToolbar
            fileName={fileName}
            versions={versions}
            activeVersion={activeVersion}
            isExtracting={isExtracting}
            onSelectVersion={onSelectVersion}
            onDeleteVersion={onDeleteVersion}
          />
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

          <AiTextViewModeToggle
            displayMode={displayMode}
            canShowBlocks={canShowBlocks}
            layoutStatus={layoutStatus}
            onChoose={chooseDisplayMode}
          />

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

      {/* Extraction progress when re-parsing with existing content */}
      {isExtracting ? (
        <AiTextTaskProgress
          task={task}
          onCancel={onCancelExtraction}
          compact
        />
      ) : null}

      {/* Error banner */}
      {error ? (
        <div
          role="alert"
          data-testid="ai-text-error-banner"
          className="flex flex-wrap items-center justify-end gap-2 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="mr-auto min-w-0 flex-1 truncate" title={error}>
            {error}
          </span>
          {looksLikeModelProblem(error) ? (
            <Button
              type="button"
              data-testid="ai-text-download-models"
              variant="outline"
              size="xs"
              disabled={isExtracting}
              onClick={onDownloadModels}
              className="h-6 gap-1 px-2 text-xs"
            >
              <Download className="size-3" />
              <span>Download models</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isExtracting}
            onClick={onRetryExtraction}
            className="h-6 gap-1 px-2 text-xs"
          >
            <RefreshCw className="size-3" />
            <span>Retry</span>
          </Button>
        </div>
      ) : null}

      {/* Save/copy failures stay separate from extraction errors: "Retry
          extraction" is the wrong action for a failed file write. */}
      {saveError ? (
        <div
          role="alert"
          data-testid="ai-text-save-error"
          className="flex items-start gap-2 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span
            className="mr-auto min-w-0 flex-1 whitespace-pre-wrap break-words"
            title={saveError}
          >
            {saveError}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss error"
            title="Dismiss error"
            onClick={() => setSaveError(null)}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isExtracting && activeContent === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-4 p-6">
            <AiTextTaskProgress task={task} onCancel={onCancelExtraction} />
            <p className="text-[11px] text-muted-foreground">
              Parser: <span className="font-medium">{selectedParserOverride}</span>{" "}
              · Agent: <span className="font-medium">{selectedAgentOverride}</span>{" "}
              · Output: <code>{settings.outputRootDir}/</code>
            </p>
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
            disabled={isSaving}
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
        ) : displayMode === "blocks" ? (
          layoutStatus === "ready" && layout ? (
            <AiTextLayoutBlocksPanel
              layout={layout}
              activeBlockId={activeBlockId}
              onFocusBlock={onFocusLayoutBlock}
              loadAsset={getAsset}
            />
          ) : layoutStatus === "loading" ? (
            <div className="grid size-full place-items-center">
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading layout blocks…
              </span>
            </div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="size-5 text-muted-foreground" />
              <p className="max-w-sm text-xs text-muted-foreground">
                {layoutMessage ??
                  "Layout metadata is unavailable for this version."}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => onTriggerAiText()}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="size-3.5" />
                <span>Re-parse for layout</span>
              </Button>
            </div>
          )
        ) : (
          <div
            data-testid="ai-text-preview-content"
            className="flex size-full min-h-0 flex-1 overflow-hidden"
          >
            <MarkdownPreview
              content={activeContent}
              renderImage={renderMarkdownImage}
            />
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
