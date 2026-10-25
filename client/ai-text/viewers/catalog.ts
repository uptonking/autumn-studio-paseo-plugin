import {
  AI_TEXT_BUILTIN_VIEWERS,
  parseAiTextViewerDescriptor,
  type AiTextViewerDescriptor,
} from '../../../shared/ai-text/viewers.js';

/**
 * Light registry of viewer metadata. Settings imports only this module, so
 * registering a viewer never pulls its renderer (and its document libraries)
 * into the settings bundle.
 */
const descriptors = new Map<string, AiTextViewerDescriptor>(
  AI_TEXT_BUILTIN_VIEWERS.map((descriptor) => [descriptor.id, descriptor]),
);

export function registerAiTextViewerDescriptor(descriptor: AiTextViewerDescriptor): () => void {
  const normalized = parseAiTextViewerDescriptor(descriptor);
  descriptors.set(normalized.id, normalized);
  return () => {
    // A later registration for the same id owns the entry now.
    if (descriptors.get(normalized.id) === normalized) {
      descriptors.delete(normalized.id);
    }
  };
}

export function listAiTextViewerDescriptors(): AiTextViewerDescriptor[] {
  return [...descriptors.values()].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );
}

export function getAiTextViewerDescriptor(viewerId: string): AiTextViewerDescriptor | null {
  return descriptors.get(viewerId) ?? null;
}

export function getDefaultableAiTextViewerDescriptors(): AiTextViewerDescriptor[] {
  return listAiTextViewerDescriptors().filter((descriptor) => descriptor.selectableAsDefault);
}
