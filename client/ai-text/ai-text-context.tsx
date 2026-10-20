import * as React from "react";
import {
  DEFAULT_AI_TEXT_SETTINGS,
  isAiTextSupportedFormat,
  shouldAutoOpenAiTextSplit,
  type AiTextAgentOption,
  type AiTextDocumentMetadata,
  type AiTextParserProviderId,
  type AiTextSettings,
  type AiTextVersionRecord,
} from "../../shared/contracts.js";
import { lazyWithPreload } from "../lazy-with-preload.js";
import { Spinner } from "../vendor/components/ui/spinner.js";
import { cn } from "../vendor/lib/utils.js";
import type {
  FileSaveCallbackInput,
  FileSaveCallbackResult,
} from "../viewers/registry.js";

const LazyAiTextSplitPane = lazyWithPreload(() =>
  import("./ai-text-split-pane.js").then((mod) => ({
    default: mod.AiTextSplitPane,
  })),
);

const DEFAULT_SPLIT_PANE_AGENTS: readonly AiTextAgentOption[] = [
  { id: "pi", label: "pi (Default)", available: true, isDefault: true },
  { id: "claude", label: "Claude Code", available: true },
  { id: "codex", label: "Codex", available: true },
  { id: "autumn-studio", label: "Autumn Studio", available: true },
  { id: "opencode", label: "OpenCode", available: true },
  { id: "copilot", label: "GitHub Copilot", available: true },
];

export interface AiTextExtractOptions {
  parserId?: AiTextParserProviderId;
  agentId?: string;
}

export interface AiTextBridge {
  enabled: boolean;
  settings: AiTextSettings;
  getMetadata(relPath: string): Promise<{
    metadata: AiTextDocumentMetadata | null;
    activeContent: string | null;
  }>;
  extractText(
    relPath: string,
    options?: AiTextExtractOptions,
  ): Promise<{
    metadata: AiTextDocumentMetadata;
    newVersion: AiTextVersionRecord;
    content: string;
  }>;
  selectVersion(
    relPath: string,
    versionId: string,
  ): Promise<{
    metadata: AiTextDocumentMetadata;
    activeVersion: AiTextVersionRecord | null;
    content: string | null;
  }>;
  deleteVersion?(
    relPath: string,
    versionId: string,
  ): Promise<{
    metadata: AiTextDocumentMetadata | null;
    activeVersion: AiTextVersionRecord | null;
    content: string | null;
  }>;
  listAgents?(): Promise<AiTextAgentOption[]>;
}

export interface FileAiTextContextValue {
  enabled: boolean;
  supported: boolean;
  isSplitOpen: boolean;
  isOriginalHidden: boolean;
  isExtracting: boolean;
  isLoadingMetadata: boolean;
  error: string | null;
  metadata: AiTextDocumentMetadata | null;
  activeVersion: AiTextVersionRecord | null;
  activeContent: string | null;
  availableAgents: readonly AiTextAgentOption[];
  settings: AiTextSettings;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  onTriggerAiText(options?: AiTextExtractOptions): void;
  onSelectVersion(versionId: string): void;
  onDeleteVersion(versionId: string): void;
  onCloseSplit(): void;
  onHideOriginal(): void;
  onShowOriginal(): void;
  onUpdateActiveContent(nextContent: string): void;
}

export const FileAiTextContext =
  React.createContext<FileAiTextContextValue | null>(null);

export interface AiTextSurfaceSplitWrapperProps {
  kind: string;
  filePath?: string;
  fileName?: string;
  variant?: string;
  aiText?: AiTextBridge;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  autoSaveEdits?: boolean;
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>;
  children: React.ReactNode;
}

export function AiTextSurfaceSplitWrapper({
  kind,
  filePath,
  fileName,
  variant = "in-place",
  aiText,
  sourceUpdatedAt,
  sourceFileSize,
  autoSaveEdits = true,
  onSaveFile,
  children,
}: AiTextSurfaceSplitWrapperProps) {
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
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [metadata, setMetadata] = React.useState<AiTextDocumentMetadata | null>(
    null,
  );
  const [activeContent, setActiveContent] = React.useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = React.useState<
    readonly AiTextAgentOption[]
  >(DEFAULT_SPLIT_PANE_AGENTS);
  const splitContainerRef = React.useRef<HTMLDivElement | null>(null);
  const autoOpenedFilePathRef = React.useRef<string | null>(null);

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
    setIsSplitOpen(false);
    setIsOriginalHidden(false);
    setIsExtracting(false);
    setError(null);
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
  }, [enabled, filePath, getMetadata, supported]);

  React.useEffect(() => {
    if (!enabled && isSplitOpen) {
      setIsSplitOpen(false);
      setIsOriginalHidden(false);
    }
  }, [enabled, isSplitOpen]);

  const runExtraction = React.useCallback(
    async (options?: AiTextExtractOptions) => {
      if (!aiText || !filePath || isExtracting) return;
      const targetPath = filePath;
      void LazyAiTextSplitPane.preload();
      setIsSplitOpen(true);
      setIsExtracting(true);
      setError(null);
      try {
        const res = await aiText.extractText(targetPath, options);
        if (currentFilePathRef.current !== targetPath) return;
        setMetadata(res.metadata);
        setActiveContent(res.content);
      } catch (err) {
        if (currentFilePathRef.current !== targetPath) return;
        setError(
          err instanceof Error ? err.message : "Failed to extract AI text",
        );
      } finally {
        if (currentFilePathRef.current === targetPath) {
          setIsExtracting(false);
        }
      }
    },
    [aiText, filePath, isExtracting],
  );

  const handleTriggerAiText = React.useCallback(
    (options?: AiTextExtractOptions) => {
      if (!enabled || !supported || !filePath || !aiText) return;
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
    [aiText, filePath],
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
    [aiText, filePath],
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

  const activeVersion = React.useMemo(() => {
    if (!metadata || metadata.versions.length === 0) return null;
    return (
      metadata.versions.find((v) => v.id === metadata.activeVersionId) ??
      metadata.versions[0] ??
      null
    );
  }, [metadata]);

  const handleStartResize = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;
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
      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
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
      metadata,
      activeVersion,
      activeContent,
      availableAgents,
      settings,
      sourceUpdatedAt,
      sourceFileSize,
      onTriggerAiText: handleTriggerAiText,
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
    }),
    [
      activeContent,
      activeVersion,
      availableAgents,
      enabled,
      error,
      handleCloseSplit,
      handleDeleteVersion,
      handleHideOriginal,
      handleSelectVersion,
      handleShowOriginal,
      handleTriggerAiText,
      isExtracting,
      isLoadingMetadata,
      isOriginalHidden,
      isSplitOpen,
      metadata,
      settings,
      sourceFileSize,
      sourceUpdatedAt,
      supported,
    ],
  );

  return (
    <FileAiTextContext.Provider value={contextValue}>
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
                autoSaveEdits={autoSaveEdits}
                onSaveFile={onSaveFile}
              />
            </React.Suspense>
          </div>
        </div>
      ) : (
        children
      )}
    </FileAiTextContext.Provider>
  );
}
