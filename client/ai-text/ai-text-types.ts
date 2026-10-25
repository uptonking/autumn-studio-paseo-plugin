import type * as React from 'react';
import type { PDFViewerHandle } from '../vendor/pdf-viewer/types.js';
import type {
  AiTextDocumentMetadata,
  AiTextEngineEnvironment,
  AiTextLayoutBlock,
  AiTextLayoutDocument,
  AiTextSettings,
  AiTextTaskKind,
  AiTextTaskSnapshot,
  AiTextVersionRecord,
} from '../../shared/contracts.js';

export interface AiTextExtractOptions {
  /** Profile selected in the split view; omitted uses the default profile. */
  profileId?: string;
}

export interface AiTextTaskStartOptions {
  profileId?: string;
  engineId?: string;
  operationId?: string;
  config?: Record<string, unknown>;
  operationOptions?: Record<string, string>;
}

export type AiTextLayoutStatus = 'idle' | 'loading' | 'ready' | 'missing';

/** Client-side view of the daemon RPCs used by AI Text Mode. */
export interface AiTextBridge {
  enabled: boolean;
  settings: AiTextSettings;
  getMetadata(relPath: string): Promise<{
    metadata: AiTextDocumentMetadata | null;
    activeContent: string | null;
  }>;
  startTask(
    input: {
      kind: AiTextTaskKind;
      relPath?: string;
    } & AiTextTaskStartOptions,
  ): Promise<{ taskId: string }>;
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
  getEngineEnvironment(
    engineId: string,
    options?: { config?: Record<string, unknown>; refresh?: boolean },
  ): Promise<{ environment: AiTextEngineEnvironment }>;
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
  settings: AiTextSettings;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  layout: AiTextLayoutDocument | null;
  layoutStatus: AiTextLayoutStatus;
  layoutMessage: string | null;
  activeBlockId: string | null;
  activeBlock: AiTextLayoutBlock | null;
  defaultViewerId: string;
  showLayoutBlockOverlays: boolean;
  autoScrollToLayoutBlock: boolean;
  pdfHandleRef: React.RefObject<PDFViewerHandle | null>;
  onTriggerAiText(options?: AiTextExtractOptions): void;
  onRetryExtraction(): void;
  onCancelExtraction(): void;
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
