import { z } from 'zod';

/**
 * JSON-safe description of an extraction engine. The daemon registers the
 * implementation; the settings UI renders from this descriptor so adding an
 * engine never means editing settings components.
 */
export const aiTextEngineCapabilitiesSchema = z.object({
  /** Emits page geometry that the Blocks viewer and PDF overlays can use. */
  layout: z.boolean(),
  /** Stores figure/table images beside the Markdown version. */
  assets: z.boolean(),
  ocr: z.boolean(),
  formula: z.boolean(),
  tables: z.boolean(),
  language: z.boolean(),
  pageRange: z.boolean(),
  imageAnalysis: z.boolean(),
  /** Installs or repairs a local dependency from the Engines tab. */
  localInstall: z.boolean(),
});
export type AiTextEngineCapabilities = z.infer<typeof aiTextEngineCapabilitiesSchema>;

export const aiTextEngineRouteKindSchema = z.enum(['auto', 'local', 'cloud', 'builtin']);
export type AiTextEngineRouteKind = z.infer<typeof aiTextEngineRouteKindSchema>;

export const aiTextEngineRouteSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  kind: aiTextEngineRouteKindSchema,
});
export type AiTextEngineRoute = z.infer<typeof aiTextEngineRouteSchema>;

export const aiTextEngineFieldKindSchema = z.enum([
  'text',
  'password',
  'number',
  'switch',
  'select',
]);
export type AiTextEngineFieldKind = z.infer<typeof aiTextEngineFieldKindSchema>;

export const aiTextEngineFieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type AiTextEngineFieldOption = z.infer<typeof aiTextEngineFieldOptionSchema>;

/** Show a field only when another config value matches exactly. */
export const aiTextEngineFieldVisibilitySchema = z.object({
  key: z.string(),
  equals: z.union([z.string(), z.number(), z.boolean()]),
});
export type AiTextEngineFieldVisibility = z.infer<typeof aiTextEngineFieldVisibilitySchema>;

export const aiTextEngineFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: aiTextEngineFieldKindSchema,
  placeholder: z.string().optional(),
  options: z.array(aiTextEngineFieldOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  visibleWhen: aiTextEngineFieldVisibilitySchema.optional(),
  /** Restrict the field to specific engine routes; omitted means all routes. */
  routes: z.array(z.string()).optional(),
});
export type AiTextEngineField = z.infer<typeof aiTextEngineFieldSchema>;

export const aiTextEngineOperationOptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['select', 'text']),
  defaultValue: z.string().default(''),
  options: z.array(aiTextEngineFieldOptionSchema).default([]),
});
export type AiTextEngineOperationOption = z.infer<typeof aiTextEngineOperationOptionSchema>;

/**
 * When the operation button is visible. The client evaluates the condition
 * against the engine's environment snapshot (installed = a version was
 * detected, models-present = the storage probe found a model cache).
 */
export const aiTextEngineOperationShowWhenSchema = z.enum([
  'always',
  'installed',
  'not-installed',
  'update-available',
  'models-present',
]);
export type AiTextEngineOperationShowWhen = z.infer<typeof aiTextEngineOperationShowWhenSchema>;

export const aiTextEngineOperationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  requiresConfirmation: z.boolean().default(false),
  showWhen: aiTextEngineOperationShowWhenSchema.default('always'),
  options: z.array(aiTextEngineOperationOptionSchema).default([]),
});
export type AiTextEngineOperation = z.infer<typeof aiTextEngineOperationSchema>;

export const aiTextEngineDescriptorSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().default(''),
    /** Lowercase extensions without the dot. */
    formats: z.array(z.string()).default([]),
    capabilities: aiTextEngineCapabilitiesSchema,
    routes: z.array(aiTextEngineRouteSchema).min(1),
    defaultRoute: z.string().min(1),
    /** Per-route overrides for capabilities that only some routes honor. */
    routeCapabilities: z.record(z.string(), aiTextEngineCapabilitiesSchema.partial()).default({}),
    fields: z.array(aiTextEngineFieldSchema).default([]),
    /** Defaults merged into every new profile that selects this engine. */
    configDefaults: z.record(z.string(), z.unknown()).default({}),
    /**
     * PyPI project the engine is installed from (`uv tool install <pkg>`).
     * Null for engines without a local install lifecycle.
     */
    pythonPackage: z.string().nullable().default(null),
    operations: z.array(aiTextEngineOperationSchema).default([]),
  })
  .superRefine((descriptor, context) => {
    if (!descriptor.routes.some((route) => route.id === descriptor.defaultRoute)) {
      context.addIssue({
        code: 'custom',
        message: `defaultRoute "${descriptor.defaultRoute}" is not in routes`,
        path: ['defaultRoute'],
      });
    }
    for (const routeId of Object.keys(descriptor.routeCapabilities)) {
      if (!descriptor.routes.some((route) => route.id === routeId)) {
        context.addIssue({
          code: 'custom',
          message: `routeCapabilities contains unknown route "${routeId}"`,
          path: ['routeCapabilities', routeId],
        });
      }
    }
  });
export type AiTextEngineDescriptor = z.infer<typeof aiTextEngineDescriptorSchema>;

export function engineSupportsFormat(
  descriptor: AiTextEngineDescriptor,
  formatKind: string,
): boolean {
  const normalized = formatKind.trim().toLowerCase().replace(/^\./, '');
  return descriptor.formats.includes(normalized);
}

export function getEngineRoute(
  descriptor: AiTextEngineDescriptor,
  routeId: string,
): AiTextEngineRoute | null {
  return descriptor.routes.find((route) => route.id === routeId) ?? null;
}

/**
 * Capabilities that apply to one route. Routes honor different subsets of the
 * engine's switches (MinerU's cloud API has no page range; Docling's VLM
 * pipeline ignores OCR flags), so the settings UI and validation must ask the
 * route instead of the engine.
 */
export function getEngineCapabilities(
  descriptor: AiTextEngineDescriptor,
  routeId?: string | null,
): AiTextEngineCapabilities {
  const override = routeId ? descriptor.routeCapabilities[routeId] : undefined;
  return override ? { ...descriptor.capabilities, ...override } : descriptor.capabilities;
}

/** Fields visible for the current route and config; hidden fields stay stored. */
export function visibleEngineFields(
  descriptor: AiTextEngineDescriptor,
  config: Record<string, unknown>,
  routeId?: string,
): AiTextEngineField[] {
  return descriptor.fields.filter((field) => {
    if (field.routes && routeId && !field.routes.includes(routeId)) {
      return false;
    }
    const condition = field.visibleWhen;
    if (!condition) return true;
    return config[condition.key] === condition.equals;
  });
}
