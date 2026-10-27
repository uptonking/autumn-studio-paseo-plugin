import { z } from 'zod';

const aiTextViewerCapabilitiesSchema = z.object({
  requiresContent: z.boolean().default(true),
  requiresLayout: z.boolean().default(false),
  editable: z.boolean().default(false),
  usesSaveAction: z.boolean().default(false),
});

// zod applies a default value verbatim, so it must already carry the nested
// field defaults; `.default({})` would leave every capability undefined.
const DEFAULT_AI_TEXT_VIEWER_CAPABILITIES = aiTextViewerCapabilitiesSchema.parse({});

/**
 * Metadata for an AI Text pane renderer. Renderers themselves live in the
 * client registry; settings and the split pane only need this light catalog.
 */
export const aiTextViewerDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().optional(),
  description: z.string().default(''),
  order: z.number().default(0),
  /** Only these appear in the default-viewer setting. */
  selectableAsDefault: z.boolean().default(false),
  capabilities: aiTextViewerCapabilitiesSchema.default(DEFAULT_AI_TEXT_VIEWER_CAPABILITIES),
});
export type AiTextViewerDescriptor = z.infer<typeof aiTextViewerDescriptorSchema>;

export const AI_TEXT_VIEWER_TEXT = 'text';
export const AI_TEXT_VIEWER_SOURCE = 'source';
export const AI_TEXT_VIEWER_LAYOUT_BLOCKS = 'layout-blocks';
export const AI_TEXT_VIEWER_TEXT_PAGES = 'text-pages';
export const DEFAULT_AI_TEXT_VIEWER_ID = AI_TEXT_VIEWER_TEXT;

export const AI_TEXT_BUILTIN_VIEWERS: readonly AiTextViewerDescriptor[] = [
  {
    id: AI_TEXT_VIEWER_TEXT,
    label: 'Text',
    shortLabel: 'Text',
    description: 'Rendered Markdown with images and table formatting.',
    order: 0,
    selectableAsDefault: true,
    capabilities: {
      requiresContent: true,
      requiresLayout: false,
      editable: false,
      usesSaveAction: false,
    },
  },
  {
    id: AI_TEXT_VIEWER_LAYOUT_BLOCKS,
    label: 'Layout Blocks',
    shortLabel: 'Blocks',
    description:
      'Extracted blocks grouped by page. Selecting a block highlights it on the original PDF.',
    order: 1,
    selectableAsDefault: true,
    capabilities: {
      requiresContent: true,
      requiresLayout: true,
      editable: false,
      usesSaveAction: false,
    },
  },
  {
    id: AI_TEXT_VIEWER_TEXT_PAGES,
    label: 'Text Pages View',
    shortLabel: 'Pages',
    description:
      'A paginated Word-like view that mirrors the PDF pages; clicking or moving the caret highlights the matching PDF section. Editable; saves back to the stored Markdown version.',
    order: 2,
    selectableAsDefault: true,
    capabilities: {
      requiresContent: true,
      requiresLayout: false,
      editable: true,
      usesSaveAction: true,
    },
  },
  {
    id: AI_TEXT_VIEWER_SOURCE,
    label: 'Source',
    shortLabel: 'Source',
    description: 'Edit the raw Markdown source of this version and save it in place.',
    order: 3,
    selectableAsDefault: false,
    capabilities: {
      requiresContent: true,
      requiresLayout: false,
      editable: true,
      usesSaveAction: true,
    },
  },
];

export function getBuiltinAiTextViewer(viewerId: string): AiTextViewerDescriptor | null {
  return AI_TEXT_BUILTIN_VIEWERS.find((viewer) => viewer.id === viewerId) ?? null;
}

/**
 * Validates a descriptor before it reaches a registry and fills defaults.
 * Descriptor mistakes are programmer errors, so registration fails loudly
 * instead of leaving a viewer that silently never appears.
 */
export function parseAiTextViewerDescriptor(input: unknown): AiTextViewerDescriptor {
  const result = aiTextViewerDescriptorSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
  throw new Error(
    `Invalid AI Text viewer descriptor${where}: ${issue?.message ?? 'invalid descriptor'}`,
  );
}
