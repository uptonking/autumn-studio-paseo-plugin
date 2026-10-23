import * as React from "react";
import {
  DEFAULT_AI_TEXT_SETTINGS,
  isAiTextSupportedFormat,
  shouldAutoOpenAiTextSplit,
  type AiTextAgentOption,
  type AiTextDocumentMetadata,
  type AiTextLayoutBlock,
  type AiTextLayoutDocument,
} from "../../shared/contracts.js";
import { lazyWithPreload } from "../lazy-with-preload.js";
import type { PDFViewerHandle } from "../vendor/pdf-viewer/types.js";
import { Spinner } from "../vendor/components/ui/spinner.js";
import { cn } from "../vendor/lib/utils.js";
import type {
  FileSaveCallbackInput,
  FileSaveCallbackResult,
} from "../viewers/registry.js";
import type {
  AiTextBridge,
  AiTextExtractOptions,
  AiTextLayoutStatus,
  FileAiTextContextValue,
} from "./ai-text-types.js";
import { DEFAULT_SPLIT_PANE_AGENTS } from "./ai-text-types.js";
import { useAiTextLayout } from "./use-ai-text-layout.js";
import { useAiTextTask } from "./use-ai-text-task.js";

export type {
  AiTextBridge,
  AiTextExtractOptions,
  AiTextLayoutStatus,
  AiTextTaskStartOptions,
  FileAiTextContextValue,
} from "./ai-text-types.js";

const LazyAiTextSplitPane = lazyWithPreload(() =>
  import("./ai-text-split-pane.js").then((mod) => ({
    default: mod.AiTextSplitPane,
  })),
);

/**
 * Surface-only facts shared with the original-file viewer. Kept separate from
 * `FileAiTextContext` so the PDF overlay can subscribe to block focus without
 * re-rendering the whole split pane.
 */
export interface AiTextSurfaceContextValue {
  layout: AiTextLayoutDocument | null;
  activeBlock: AiTextLayoutBlock | null;
  showOutlines: boolean;
  pdfHandleRef: React.RefObject<PDFViewerHandle | null>;
  onFocusLayoutBlock(block: AiTextLayoutBlock): void;
  onClearActiveLayoutBlock(): void;
}

export const FileAiTextContext =
  React.createContext<FileAiTextContextValue | null>(null);

export const AiTextSurfaceContext =
  React.createContext<AiTextSurfaceContextValue | null>(null);

export function useAiTextSurface(): AiTextSurfaceContextValue | null {
  return React.useContext(AiTextSurfaceContext);
}

export function AiTextSurfaceSplitWrapper({
  kind,
  filePath,
  fileName,
  variant = "in-place",
  aiText,
  sourceUpdatedAt,
  sourceFileSize,
  onSaveFile,
  children,
}: {
  kind: string;
  filePath?: string;
  fileName?: string;
  variant?: string;
  aiText?: AiTextBridge;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>;
  children: React.ReactNode;
}) {
  const settings = aiText?.settings ?? DEFAULT_AI_TEXT_SETTINGS;
  const enabled = Boolean(aiText ? aiText.enabled : settings.enabled);
  const supported =
    variant !== "stage" &&
    Boolean(filePath) &&
    isAiTextSupportedFormat(kind, filePath ?? fileName);

  const [isSplitOpen, setIsSplitOpen] = React.useState(false);
  const [isOriginalHidden, setIsOriginalHidden] = React.useState(false);
  const [splitRatioPct, setSplitRatioPct] = React.useState(50);
  const [isLoadingMetadata, setIsLoadingMetadata] = React.useState(false);
  const [metadata, setMetadata] = React.useState<AiTextDocumentMetadata | null>(
    null,
  );
  const [activeContent, setActiveContent] = React.useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = React.useState<
    readonly AiTextAgentOption[]
  >(DEFAULT_SPLIT_PANE_AGENTS);
  const splitContainerRef = React.useRef<HTMLDivElement | null>(null);
  const stopResizeRef = React.useRef<(() => void) | null>(null);
  const autoOpenedFilePathRef = React.useRef<string | null>(null);
  const pdfHandleRef = React.useRef<PDFViewerHandle | null>(null);
  const lastExtractOptionsRef = React.useRef<AiTextExtractOptions | undefined>(
    undefined,
  );
  const runExtractionRef = React.useRef<
    ((options?: AiTextExtractOptions) => void) | null
  >(null);

  const currentFilePathRef = React.useRef<string | undefined>(filePath);
  currentFilePathRef.current = filePath;

  // The bridge object is recreated whenever settings change. Depend on its
  // stable callbacks instead so editing a setting does not reset an open split.
  const getMetadata = aiText?.getMetadata;
  const listAgents = aiText?.listAgents;
  const openSplitViewByDefaultRef = React.useRef(
    Boolean(settings.openSplitViewByDefault),
  );
  openSplitViewByDefaultRef.current = Boolean(settings.openSplitViewByDefault);

  const {
    task,
    isExtracting,
    error,
    setError,
    runTask,
    cancel: cancelExtraction,
    resetTaskState,
    requestRetryAfterModelDownload,
  } = useAiTextTask(aiText);

  const activeVersion = React.useMemo(() => {
    if (!metadata || metadata.versions.length === 0) return null;
    return (
      metadata.versions.find((v) => v.id === metadata.activeVersionId) ??
      metadata.versions[0] ??
      null
    );
  }, [metadata]);

  const {
    layout,
    layoutStatus,
    layoutMessage,
    activeBlockId,
    activeBlock,
    focusBlock,
    clearActiveBlock,
    loadAsset,
  } = useAiTextLayout({
    filePath,
    activeVersion,
    getLayout: aiText?.getLayout,
    getAsset: aiText?.getAsset,
    autoScrollToLayoutBlock: settings.autoScrollToLayoutBlock,
    pdfHandleRef,
  });

  React.useEffect(() => {
    if (!enabled || !supported || !listAgents) return;
    let cancelled = false;
    listAgents()
      .then((agents) => {
        if (!cancelled && Array.isArray(agents) && agents.length > 0) {
          setAvailableAgents(agents);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, listAgents, supported]);

  React.useEffect(() => {
    autoOpenedFilePathRef.current = null;
  }, [enabled, filePath, getMetadata]);

  React.useEffect(() => {
    resetTaskState();
    setIsSplitOpen(false);
    setIsOriginalHidden(false);
    setMetadata(null);
    setActiveContent(null);

    if (!enabled || !supported || !filePath || !getMetadata) {
      setIsLoadingMetadata(false);
      return;
    }

    let cancelled = false;
    setIsLoadingMetadata(true);
    getMetadata(filePath)
      .then((res) => {
        if (cancelled) return;
        setMetadata(res.metadata);
        setActiveContent(res.activeContent);
        setIsLoadingMetadata(false);
        if (
          shouldAutoOpenAiTextSplit({
            openSplitViewByDefault: openSplitViewByDefaultRef.current,
            metadata: res.metadata,
            activeContent: res.activeContent,
            filePath,
            lastAutoOpenedFilePath: autoOpenedFilePathRef.current,
          })
        ) {
          autoOpenedFilePathRef.current = filePath;
          void LazyAiTextSplitPane.preload();
          setIsSplitOpen(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoadingMetadata(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, filePath, getMetadata, resetTaskState, supported]);

  React.useEffect(() => {
    if (!enabled && isSplitOpen) {
      setIsSplitOpen(false);
      setIsOriginalHidden(false);
    }
  }, [enabled, isSplitOpen]);

  const runExtraction = React.useCallback(
    async (options?: AiTextExtractOptions) => {
      if (!aiText || !filePath) return;
      lastExtractOptionsRef.current = options;
      requestRetryAfterModelDownload(false);
      const targetPath = filePath;
      void LazyAiTextSplitPane.preload();
      setIsSplitOpen(true);
      clearActiveBlock();
      await runTask(
        { kind: "parse", targetPath, options: options ?? {} },
        {
          onParseResult: (result) => {
            if (currentFilePathRef.current !== targetPath) return;
            setMetadata(result.metadata);
            setActiveContent(result.content);
          },
        },
      );
    },
    [aiText, clearActiveBlock, filePath, requestRetryAfterModelDownload, runTask],
  );

  runExtractionRef.current = (options) => {
    void runExtraction(options);
  };

  const handleDownloadModels = React.useCallback(() => {
    if (!aiText || isExtracting) return;
    requestRetryAfterModelDownload(true);
    void runTask(
      {
        kind: "models.download",
        options: { tier: settings.mineru.tier },
      },
      {
        onModelDownloadSucceeded: () => {
          runExtractionRef.current?.(lastExtractOptionsRef.current);
        },
      },
    );
  }, [
    aiText,
    isExtracting,
    requestRetryAfterModelDownload,
    runTask,
    settings.mineru.tier,
  ]);

  const handleRetryExtraction = React.useCallback(() => {
    void runExtraction(lastExtractOptionsRef.current);
  }, [runExtraction]);

  const handleTriggerAiText = React.useCallback(
    (options?: AiTextExtractOptions) => {
      if (!enabled || !supported || !filePath || !aiText) return;
      if (isExtracting) return;
      void LazyAiTextSplitPane.preload();

      // If split view is already open, clicking "AI text again" always runs a new parse
      if (isSplitOpen) {
        void runExtraction(options);
        return;
      }

      // If split view is closed and we already have parsed versions in .autumn/,
      // open the split view with the active cached version immediately.
      if (
        !options?.parserId &&
        !options?.agentId &&
        metadata &&
        metadata.versions.length > 0 &&
        activeContent !== null
      ) {
        setIsSplitOpen(true);
        return;
      }

      // First-time click: open split view and extract text into .autumn/
      void runExtraction(options);
    },
    [
      activeContent,
      aiText,
      enabled,
      filePath,
      isExtracting,
      isSplitOpen,
      metadata,
      runExtraction,
      supported,
    ],
  );

  const handleSelectVersion = React.useCallback(
    async (versionId: string) => {
      if (!aiText || !filePath) return;
      const targetPath = filePath;
      setError(null);
      try {
        const res = await aiText.selectVersion(targetPath, versionId);
        if (currentFilePathRef.current !== targetPath) return;
        setMetadata(res.metadata);
        setActiveContent(res.content);
      } catch (err) {
        if (currentFilePathRef.current !== targetPath) return;
        setError(
          err instanceof Error ? err.message : "Failed to switch text version",
        );
      }
    },
    [aiText, filePath, setError],
  );

  const handleDeleteVersion = React.useCallback(
    async (versionId: string) => {
      if (!aiText?.deleteVersion || !filePath) return;
      const targetPath = filePath;
      setError(null);
      try {
        const res = await aiText.deleteVersion(targetPath, versionId);
        if (currentFilePathRef.current !== targetPath) return;
        setMetadata(res.metadata);
        setActiveContent(res.content);
      } catch (err) {
        if (currentFilePathRef.current !== targetPath) return;
        setError(
          err instanceof Error ? err.message : "Failed to delete text version",
        );
      }
    },
    [aiText, filePath, setError],
  );

  const handleCloseSplit = React.useCallback(() => {
    setIsSplitOpen(false);
    setIsOriginalHidden(false);
    // Remember the dismissal so a settings-driven metadata reload does not
    // auto-open the split the user just closed.
    if (filePath) autoOpenedFilePathRef.current = filePath;
  }, [filePath]);

  const handleHideOriginal = React.useCallback(() => {
    setIsOriginalHidden(true);
  }, []);

  const handleShowOriginal = React.useCallback(() => {
    setIsOriginalHidden(false);
  }, []);

  React.useEffect(
    () => () => {
      stopResizeRef.current?.();
    },
    [],
  );

  const handleStartResize = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;
      stopResizeRef.current?.();
      const onMouseMove = (moveEvent: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) return;
        const rightWidth = rect.right - moveEvent.clientX;
        const pct = Math.min(
          72,
          Math.max(28, Math.round((rightWidth / rect.width) * 100)),
        );
        setSplitRatioPct(pct);
      };
      const stop = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", stop);
        window.removeEventListener("blur", stop);
        if (stopResizeRef.current === stop) stopResizeRef.current = null;
      };
      stopResizeRef.current = stop;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stop);
      window.addEventListener("blur", stop);
    },
    [],
  );

  const contextValue = React.useMemo<FileAiTextContextValue>(
    () => ({
      enabled,
      supported,
      isSplitOpen,
      isOriginalHidden,
      isExtracting,
      isLoadingMetadata,
      error,
      task,
      metadata,
      activeVersion,
      activeContent,
      availableAgents,
      settings,
      sourceUpdatedAt,
      sourceFileSize,
      layout,
      layoutStatus,
      layoutMessage,
      activeBlockId,
      activeBlock,
      defaultViewer: settings.defaultAiTextViewer,
      showLayoutBlockOverlays: settings.showLayoutBlockOverlays,
      autoScrollToLayoutBlock: settings.autoScrollToLayoutBlock,
      pdfHandleRef,
      onTriggerAiText: handleTriggerAiText,
      onRetryExtraction: handleRetryExtraction,
      onCancelExtraction: cancelExtraction,
      onDownloadModels: handleDownloadModels,
      onSelectVersion: (versionId: string) => {
        void handleSelectVersion(versionId);
      },
      onDeleteVersion: (versionId: string) => {
        void handleDeleteVersion(versionId);
      },
      onCloseSplit: handleCloseSplit,
      onHideOriginal: handleHideOriginal,
      onShowOriginal: handleShowOriginal,
      onUpdateActiveContent: setActiveContent,
      onFocusLayoutBlock: focusBlock,
      onClearActiveLayoutBlock: clearActiveBlock,
      getAsset: loadAsset,
    }),
    [
      activeBlock,
      activeBlockId,
      activeContent,
      activeVersion,
      availableAgents,
      cancelExtraction,
      clearActiveBlock,
      enabled,
      error,
      focusBlock,
      handleCloseSplit,
      handleDeleteVersion,
      handleDownloadModels,
      handleHideOriginal,
      handleRetryExtraction,
      handleSelectVersion,
      handleShowOriginal,
      handleTriggerAiText,
      isExtracting,
      isLoadingMetadata,
      isOriginalHidden,
      isSplitOpen,
      layout,
      layoutMessage,
      layoutStatus,
      loadAsset,
      metadata,
      settings,
      sourceFileSize,
      sourceUpdatedAt,
      supported,
      task,
    ],
  );

  const surfaceValue = React.useMemo<AiTextSurfaceContextValue>(
    () => ({
      layout: isSplitOpen ? layout : null,
      activeBlock,
      showOutlines: settings.showLayoutBlockOverlays,
      pdfHandleRef,
      onFocusLayoutBlock: focusBlock,
      onClearActiveLayoutBlock: clearActiveBlock,
    }),
    [
      activeBlock,
      clearActiveBlock,
      focusBlock,
      isSplitOpen,
      layout,
      settings.showLayoutBlockOverlays,
    ],
  );

  return (
    <FileAiTextContext.Provider value={contextValue}>
      <AiTextSurfaceContext.Provider value={surfaceValue}>
        {isSplitOpen && enabled && supported ? (
          <div
            ref={splitContainerRef}
            data-testid="ai-text-split-layout"
            className="flex size-full min-h-0 flex-1 flex-row overflow-hidden"
          >
            {!isOriginalHidden ? (
              <>
                <div
                  data-testid="ai-text-original-pane"
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  {children}
                </div>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize AI Text split view"
                  data-testid="ai-text-split-resizer"
                  title="Drag to resize split view (double-click to reset)"
                  onMouseDown={handleStartResize}
                  onDoubleClick={() => setSplitRatioPct(50)}
                  className="w-1 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-primary/50"
                />
              </>
            ) : null}
            <div
              data-testid="ai-text-split-pane"
              style={
                isOriginalHidden ? undefined : { width: `${splitRatioPct}%` }
              }
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden bg-background",
                isOriginalHidden
                  ? "min-w-0 flex-1"
                  : "min-w-[220px] max-w-[72%] shrink-0",
              )}
            >
              <React.Suspense
                fallback={
                  <div className="grid size-full place-items-center">
                    <Spinner className="size-4 text-muted-foreground" />
                  </div>
                }
              >
                <LazyAiTextSplitPane
                  fileName={fileName ?? filePath ?? "document"}
                  aiTextState={contextValue}
                  onSaveFile={onSaveFile}
                />
              </React.Suspense>
            </div>
          </div>
        ) : (
          children
        )}
      </AiTextSurfaceContext.Provider>
    </FileAiTextContext.Provider>
  );
}
