import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Ellipsis,
  Info,
  Loader2,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  AI_TEXT_VIEWER_TEXT,
  type AiTextProfile,
} from "../../shared/contracts.js";
import { Button } from "../vendor/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../vendor/components/ui/dropdown-menu.js";
import type {
  FileSaveCallbackInput,
  FileSaveCallbackResult,
} from "../viewers/registry.js";
import type { FileAiTextContextValue } from "./ai-text-context.js";
import { AiTextMetadataPanel } from "./ai-text-metadata-panel.js";
import { AiTextTaskProgress } from "./ai-text-task-progress.js";
import { AiTextVersionToolbar } from "./ai-text-version-toolbar.js";
import { AiTextViewModeToggle } from "./ai-text-view-mode-toggle.js";
import { copyTextToClipboard } from "./clipboard.js";
import { getAiTextViewer } from "./viewers/index.js";

export interface AiTextSplitPaneProps {
  fileName: string;
  aiTextState: FileAiTextContextValue;
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>;
  onOpenSettings?(): void;
}

function resolveViewerId(
  requestedId: string,
  canShowLayout: boolean,
): string {
  const viewer = getAiTextViewer(requestedId);
  if (!viewer) return AI_TEXT_VIEWER_TEXT;
  if (viewer.descriptor.capabilities.requiresLayout && !canShowLayout) {
    return AI_TEXT_VIEWER_TEXT;
  }
  return viewer.descriptor.id;
}

function resolveDefaultProfileId(profiles: readonly AiTextProfile[], profileId: string): string {
  return (
    profiles.find((profile) => profile.id === profileId)?.id ??
    profiles[0]?.id ??
    ""
  );
}

export function AiTextSplitPane({
  fileName,
  aiTextState,
  onSaveFile,
  onOpenSettings,
}: AiTextSplitPaneProps) {
  const {
    isExtracting,
    error,
    task,
    metadata,
    activeVersion,
    activeContent,
    settings,
    sourceUpdatedAt,
    sourceFileSize,
    isOriginalHidden,
    layout,
    layoutStatus,
    layoutMessage,
    activeBlockId,
    defaultViewerId,
    onTriggerAiText,
    onRetryExtraction,
    onCancelExtraction,
    onSelectVersion,
    onDeleteVersion,
    onCloseSplit,
    onShowOriginal,
    onUpdateActiveContent,
    onFocusLayoutBlock,
    getAsset,
  } = aiTextState;

  const profiles = settings.profiles;
  const defaultProfileId = resolveDefaultProfileId(
    profiles,
    settings.defaultProfileId,
  );

  const isSourceStale = Boolean(
    activeVersion &&
      ((sourceUpdatedAt !== undefined &&
        sourceUpdatedAt > activeVersion.sourceMtimeMs + 1000) ||
        (sourceFileSize !== undefined &&
          sourceFileSize > 0 &&
          sourceFileSize !== activeVersion.sourceSize)),
  );

  const canShowLayout =
    Boolean(activeVersion?.layout) ||
    layoutStatus === "ready" ||
    layoutStatus === "loading";

  const [viewerId, setViewerId] = React.useState<string>(() =>
    resolveViewerId(defaultViewerId, canShowLayout),
  );
  const hasUserChosenViewerRef = React.useRef(false);

  const [selectedProfileId, setSelectedProfileId] = React.useState<string>(
    () =>
      resolveDefaultProfileId(
        profiles,
        activeVersion
          ? activeVersion.provenance.profileId
          : settings.defaultProfileId,
      ),
  );

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

  const chooseViewer = React.useCallback((nextViewerId: string) => {
    hasUserChosenViewerRef.current = true;
    setViewerId(nextViewerId);
  }, []);

  // A viewer chosen for one document should not override the default after the
  // split switches to another file. Re-parsing keeps the choice.
  const sourceRelPath = metadata?.sourceRelPath ?? null;
  React.useEffect(() => {
    hasUserChosenViewerRef.current = false;
  }, [sourceRelPath]);

  React.useEffect(() => {
    setDraftText(activeContent ?? "");
    setIsDirty(false);
    setSaveError(null);
  }, [activeContent, activeVersion?.id]);

  React.useEffect(() => {
    const nextProfileId = activeVersion
      ? activeVersion.provenance.profileId
      : settings.defaultProfileId;
    setSelectedProfileId(resolveDefaultProfileId(profiles, nextProfileId));
  }, [activeVersion?.id, activeVersion?.provenance.profileId, profiles, settings.defaultProfileId]);

  React.useEffect(() => {
    if (hasUserChosenViewerRef.current) return;
    setViewerId(resolveViewerId(defaultViewerId, canShowLayout));
  }, [activeVersion?.id, canShowLayout, defaultViewerId, layoutStatus]);

  React.useEffect(() => {
    const active = getAiTextViewer(viewerId);
    if (
      active?.descriptor.capabilities.requiresLayout &&
      !canShowLayout
    ) {
      setViewerId(AI_TEXT_VIEWER_TEXT);
    }
  }, [canShowLayout, layoutStatus, viewerId]);

  const activeViewer =
    getAiTextViewer(viewerId) ?? getAiTextViewer(AI_TEXT_VIEWER_TEXT);

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
    const textToCopy =
      activeViewer?.descriptor.capabilities.editable ? draftText : (activeContent ?? "");
    if (!textToCopy) return;
    copyTextToClipboard(textToCopy).then(
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
      (error: unknown) =>
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not copy text to the clipboard",
        ),
    );
  }, [activeContent, activeViewer, draftText]);

  const handleReparse = React.useCallback(() => {
    onTriggerAiText(
      selectedProfileId ? { profileId: selectedProfileId } : undefined,
    );
  }, [onTriggerAiText, selectedProfileId]);

  const showSaveAction = Boolean(
    activeViewer?.descriptor.capabilities.usesSaveAction &&
      onSaveFile &&
      activeVersion,
  );

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
          {showSaveAction ? (
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
            displayMode={viewerId}
            canShowLayout={canShowLayout}
            layoutStatus={layoutStatus}
            onChoose={chooseViewer}
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
              Profile:{" "}
              <span className="font-medium">
                {profiles.find((profile) => profile.id === selectedProfileId)?.name ??
                  selectedProfileId}
              </span>{" "}
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
              onClick={handleReparse}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="size-3.5" />
              <span>Extract AI Text</span>
            </Button>
          </div>
        ) : activeViewer ? (
          <activeViewer.component
            content={activeContent}
            layout={layout}
            layoutStatus={layoutStatus}
            layoutMessage={layoutMessage}
            activeBlockId={activeBlockId}
            draftText={draftText}
            isSaving={isSaving}
            onDraftChange={(next) => {
              setDraftText(next);
              setIsDirty(true);
            }}
            onSaveRequest={() => {
              void handleSaveEditedMarkdown();
            }}
            onFocusBlock={onFocusLayoutBlock}
            onRequestParse={handleReparse}
            loadAsset={getAsset}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="size-5 text-muted-foreground" />
            <p className="max-w-sm text-xs text-muted-foreground">
              This view is unavailable. Choose another AI Text view.
            </p>
          </div>
        )}
      </div>

      {isMetadataPanelOpen && profiles.length > 0 ? (
        <AiTextMetadataPanel
          activeVersion={activeVersion}
          isSourceStale={isSourceStale}
          isExtracting={isExtracting}
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          defaultProfileId={defaultProfileId}
          onSelectProfile={setSelectedProfileId}
          onTriggerAiText={onTriggerAiText}
          onClose={() => setIsMetadataPanelOpen(false)}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </div>
  );
}
