import type * as React from "react";
import type { PDFViewerHandle } from "../vendor/pdf-viewer/types.js";
import type {
  AiTextAgentOption,
  AiTextDocumentMetadata,
  AiTextEnvironment,
  AiTextLayoutBlock,
  AiTextLayoutDocument,
  AiTextParserProviderId,
  AiTextSettings,
  AiTextTaskKind,
  AiTextTaskSnapshot,
  AiTextVersionRecord,
} from "../../shared/contracts.js";

export interface AiTextExtractOptions {
  parserId?: AiTextParserProviderId;
  agentId?: string;
}

export interface AiTextTaskStartOptions extends AiTextExtractOptions {
  tier?: string;
  source?: string;
}

export type AiTextLayoutStatus = "idle" | "loading" | "ready" | "missing";

/** Shown until provider discovery answers, and when it fails. */
export const DEFAULT_SPLIT_PANE_AGENTS: readonly AiTextAgentOption[] = [
  { id: "pi", label: "pi (Default)", available: true, isDefault: true },
  { id: "claude", label: "Claude Code", available: true },
  { id: "codex", label: "Codex", available: true },
  { id: "autumn-studio", label: "Autumn Studio", available: true },
  { id: "opencode", label: "OpenCode", available: true },
  { id: "copilot", label: "GitHub Copilot", available: true },
];

/** Client-side view of the daemon RPCs used by AI Text Mode. */
export interface AiTextBridge {
  enabled: boolean;
  settings: AiTextSettings;
  getMetadata(relPath: string): Promise<{
    metadata: AiTextDocumentMetadata | null;
    activeContent: string | null;
  }>;
  startTask(input: {
    kind: AiTextTaskKind;
    relPath?: string;
  } & AiTextTaskStartOptions): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<{ task: AiTextTaskSnapshot }>;
  cancelTask(taskId: string): Promise<{ cancelled: boolean }>;
  getLayout(
    relPath: string,
    versionId: string,
  ): Promise<{
    versionId: string;
    layout: AiTextLayoutDocument | null;
    message?: string;
  }>;
  getAsset(
    relPath: string,
    versionId: string,
    assetPath: string,
  ): Promise<{ mimeType: string; base64: string }>;
  getEnvironment(options?: { refresh?: boolean }): Promise<{
    environment: AiTextEnvironment;
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
  task: AiTextTaskSnapshot | null;
  metadata: AiTextDocumentMetadata | null;
  activeVersion: AiTextVersionRecord | null;
  activeContent: string | null;
  availableAgents: readonly AiTextAgentOption[];
  settings: AiTextSettings;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  layout: AiTextLayoutDocument | null;
  layoutStatus: AiTextLayoutStatus;
  layoutMessage: string | null;
  activeBlockId: string | null;
  activeBlock: AiTextLayoutBlock | null;
  defaultViewer: AiTextSettings["defaultAiTextViewer"];
  showLayoutBlockOverlays: boolean;
  autoScrollToLayoutBlock: boolean;
  pdfHandleRef: React.RefObject<PDFViewerHandle | null>;
  onTriggerAiText(options?: AiTextExtractOptions): void;
  onRetryExtraction(): void;
  onCancelExtraction(): void;
  onDownloadModels(): void;
  onSelectVersion(versionId: string): void;
  onDeleteVersion(versionId: string): void;
  onCloseSplit(): void;
  onHideOriginal(): void;
  onShowOriginal(): void;
  onUpdateActiveContent(nextContent: string): void;
  onFocusLayoutBlock(block: AiTextLayoutBlock): void;
  onClearActiveLayoutBlock(): void;
  getAsset(assetPath: string): Promise<{ mimeType: string; base64: string }>;
}
