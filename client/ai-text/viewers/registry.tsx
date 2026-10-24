import type { ComponentType } from "react";
import type {
  AiTextLayoutBlock,
  AiTextLayoutDocument,
} from "../../../shared/ai-text/layout.js";
import {
  parseAiTextViewerDescriptor,
  type AiTextViewerDescriptor,
} from "../../../shared/ai-text/viewers.js";
import type { AiTextLayoutStatus } from "../ai-text-types.js";
import { registerAiTextViewerDescriptor } from "./catalog.js";

export interface AiTextViewerProps {
  content: string;
  layout: AiTextLayoutDocument | null;
  layoutStatus: AiTextLayoutStatus;
  layoutMessage: string | null;
  activeBlockId: string | null;
  draftText: string;
  isSaving: boolean;
  onDraftChange(next: string): void;
  /** Editors with `usesSaveAction` call this on Cmd/Ctrl+S. */
  onSaveRequest(): void;
  onFocusBlock(block: AiTextLayoutBlock): void;
  onRequestParse(): void;
  loadAsset(assetPath: string): Promise<{ mimeType: string; base64: string }>;
}

export interface AiTextViewerRegistration {
  descriptor: AiTextViewerDescriptor;
  component: ComponentType<AiTextViewerProps>;
}

const components = new Map<string, ComponentType<AiTextViewerProps>>();
const descriptors = new Map<string, AiTextViewerDescriptor>();

/**
 * Registers an AI Text pane renderer. A custom viewer only needs its own
 * module plus one registration call; the toggle and default-viewer setting
 * read the catalog.
 */
export function registerAiTextViewer(
  descriptor: AiTextViewerDescriptor,
  component: ComponentType<AiTextViewerProps>,
): () => void {
  const normalized = parseAiTextViewerDescriptor(descriptor);
  const unregisterDescriptor = registerAiTextViewerDescriptor(normalized);
  descriptors.set(normalized.id, normalized);
  components.set(normalized.id, component);
  return () => {
    unregisterDescriptor();
    // A later registration for the same id owns the entry now.
    if (descriptors.get(normalized.id) === normalized) {
      descriptors.delete(normalized.id);
      components.delete(normalized.id);
    }
  };
}

export function listAiTextViewers(): AiTextViewerRegistration[] {
  return [...descriptors.values()]
    .filter((descriptor) => components.has(descriptor.id))
    .map((descriptor) => ({
      descriptor,
      component: components.get(descriptor.id)!,
    }))
    .sort(
      (a, b) =>
        a.descriptor.order - b.descriptor.order ||
        a.descriptor.label.localeCompare(b.descriptor.label),
    );
}

export function getAiTextViewer(
  viewerId: string,
): AiTextViewerRegistration | null {
  const descriptor = descriptors.get(viewerId);
  const component = components.get(viewerId);
  return descriptor && component ? { descriptor, component } : null;
}
