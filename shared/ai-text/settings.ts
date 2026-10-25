import { z } from 'zod';
import { DEFAULT_AI_TEXT_REFINEMENT } from './refinement.ts';
import {
  DEFAULT_AI_TEXT_EXTRACTION,
  aiTextExtractionSettingsSchema,
  aiTextProfileSchema,
  createAiTextProfileFromPreset,
  createDefaultAiTextProfiles,
} from './profiles.ts';
import { aiTextVersionAssetsRefSchema, aiTextVersionLayoutRefSchema } from './layout.ts';
import { DEFAULT_AI_TEXT_VIEWER_ID } from './viewers.ts';

const aiTextProfilesSchema = z
  .array(aiTextProfileSchema)
  .default(() => createDefaultAiTextProfiles());

export const aiTextSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  openSplitViewByDefault: z.boolean().default(false),
  /** Whether the split view's docked metadata panel starts open. */
  showMetadataPanelByDefault: z.boolean().default(false),
  /** Free-form viewer id; unknown ids fall back to the default pane. */
  defaultViewerId: z.string().default(DEFAULT_AI_TEXT_VIEWER_ID),
  showLayoutBlockOverlays: z.boolean().default(true),
  autoScrollToLayoutBlock: z.boolean().default(true),
  defaultProfileId: z.string().default('mineru-cloud-free'),
  profiles: aiTextProfilesSchema,
  outputRootDir: z.string().default('.autumn'),
  /** Empty uses the official PyPI index; otherwise a mirror/simple-index URL. */
  pypiIndexUrl: z.string().default(''),
});
export type AiTextSettings = z.infer<typeof aiTextSettingsSchema>;

export function createDefaultAiTextSettings(): AiTextSettings {
  return aiTextSettingsSchema.parse({});
}

export const DEFAULT_AI_TEXT_SETTINGS: AiTextSettings = createDefaultAiTextSettings();

export const aiTextRefinementProvenanceSchema = z.object({
  mode: z.enum(['none', 'local', 'agent']),
  agentId: z.string().optional(),
  model: z.string().optional(),
  promptPresetId: z.string().optional(),
  /** True only when an agent process actually ran and its output was stored. */
  didRun: z.boolean(),
  fallbackReason: z.string().optional(),
});
export type AiTextRefinementProvenance = z.infer<typeof aiTextRefinementProvenanceSchema>;

export const aiTextVersionProvenanceSchema = z.object({
  profileId: z.string(),
  profileName: z.string(),
  profileFingerprint: z.string(),
  requestedEngineId: z.string(),
  effectiveEngineId: z.string(),
  engineLabel: z.string(),
  engineVersion: z.string().nullable().optional(),
  route: z.string(),
  extraction: aiTextExtractionSettingsSchema,
  refinement: aiTextRefinementProvenanceSchema,
  /** Set when a different engine produced the stored text. */
  fallbackReason: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  lineCount: z.number().int().min(0).optional(),
  headingCount: z.number().int().min(0).optional(),
  tableCount: z.number().int().min(0).optional(),
  codeBlockCount: z.number().int().min(0).optional(),
});
export type AiTextVersionProvenance = z.infer<typeof aiTextVersionProvenanceSchema>;

export function computeMarkdownStructureStats(markdown: string): {
  lineCount: number;
  headingCount: number;
  tableCount: number;
  codeBlockCount: number;
} {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let headingCount = 0;
  let tableCount = 0;
  let fenceMarkers = 0;
  let inCode = false;
  let inTable = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('```')) {
      fenceMarkers++;
      inCode = !inCode;
      inTable = false;
      continue;
    }
    if (inCode) continue;
    if (/^#{1,6}\s+\S/.test(trimmed)) {
      headingCount++;
      inTable = false;
    } else if (/^\|.+\|$/.test(trimmed)) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }

  return {
    lineCount: lines.length,
    headingCount,
    tableCount,
    codeBlockCount: Math.floor(fenceMarkers / 2),
  };
}

export const aiTextVersionRecordSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int().min(1),
  fileName: z.string(),
  relPath: z.string(),
  createdAt: z.string(),
  durationMs: z.number().min(0),
  size: z.number().min(0),
  sourceSize: z.number().min(0),
  sourceMtimeMs: z.number(),
  provenance: aiTextVersionProvenanceSchema,
  layout: aiTextVersionLayoutRefSchema.nullable().optional(),
  assets: aiTextVersionAssetsRefSchema.nullable().optional(),
});
export type AiTextVersionRecord = z.infer<typeof aiTextVersionRecordSchema>;

export const aiTextDocumentMetadataSchema = z.object({
  schemaVersion: z.literal(2),
  sourceRelPath: z.string(),
  sourceFileName: z.string(),
  formatKind: z.string(),
  docFolderRelPath: z.string(),
  activeVersionId: z.string().nullable(),
  versions: z.array(aiTextVersionRecordSchema),
});
export type AiTextDocumentMetadata = z.infer<typeof aiTextDocumentMetadataSchema>;

export const aiTextAgentOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  available: z.boolean(),
  isDefault: z.boolean().optional(),
  defaultModel: z.string().optional(),
});
export type AiTextAgentOption = z.infer<typeof aiTextAgentOptionSchema>;

/**
 * AI Text Mode is exposed for PDFs only for now. Server-side extraction still
 * understands other formats, so widen these sets when the UI is ready.
 */
const SUPPORTED_AI_TEXT_KINDS = new Set(['pdf']);
const SUPPORTED_AI_TEXT_EXTENSIONS = new Set(['pdf']);

export function isAiTextSupportedFormat(kind: string, fileNameOrPath?: string): boolean {
  if (SUPPORTED_AI_TEXT_KINDS.has(kind)) return true;
  if (!fileNameOrPath) return false;
  const clean = fileNameOrPath.trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return false;
  return SUPPORTED_AI_TEXT_EXTENSIONS.has(clean.slice(dot + 1));
}

export interface AiTextAutoOpenSplitInput {
  openSplitViewByDefault: boolean;
  metadata: AiTextDocumentMetadata | null;
  activeContent: string | null;
  filePath?: string;
  lastAutoOpenedFilePath?: string | null;
}

/**
 * Decides whether opening a document should land directly in the split view.
 * The last-opened guard keeps the setting from fighting a user who closes the
 * split manually: the metadata effect re-runs when settings change identity.
 */
export function shouldAutoOpenAiTextSplit({
  openSplitViewByDefault,
  metadata,
  activeContent,
  filePath,
  lastAutoOpenedFilePath,
}: AiTextAutoOpenSplitInput): boolean {
  if (!openSplitViewByDefault) return false;
  if (!filePath) return false;
  if (lastAutoOpenedFilePath === filePath) return false;
  if (!metadata || metadata.versions.length === 0) return false;
  return activeContent !== null;
}

/**
 * Converts a workspace-relative file path into a deterministic, collision-safe
 * subfolder slug inside `.autumn/`.
 * Examples:
 * - "report.pdf" -> "report.pdf"
 * - "docs/2026/report.pdf" -> "docs__2026__report.pdf"
 */
export function toAutumnDocFolderSlug(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const safe = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      // `.` and `..` are valid characters but not valid folder segments:
      // joining them would let the doc folder escape `.autumn/`.
      if (segment === '.' || segment === '..') return '_';
      return segment.replace(/[^\p{L}\p{N}._-]/gu, '_');
    })
    .join('__');
  return safe || 'document';
}

// COMPAT(metadata-v1): stored versions from before profiles. Remove when no
// `.autumn` folder in the wild still has `schemaVersion: 1`.
const legacyProvenanceSchema = z.object({
  parserId: z.string(),
  parserLabel: z.string().default(''),
  parserMode: z.string().optional(),
  agentId: z.string().optional(),
  agentModel: z.string().optional(),
  usedAgentRefinement: z.boolean().optional(),
  ocrEnabled: z.boolean().optional(),
  formulaEnabled: z.boolean().optional(),
  tableEnabled: z.boolean().optional(),
  language: z.string().optional(),
  modeUsed: z.string().optional(),
  fallbackReason: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

const legacyVersionRecordSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int().min(1),
  fileName: z.string(),
  relPath: z.string(),
  createdAt: z.string(),
  durationMs: z.number().min(0),
  size: z.number().min(0),
  sourceSize: z.number().min(0),
  sourceMtimeMs: z.number(),
  provenance: legacyProvenanceSchema,
  layout: aiTextVersionLayoutRefSchema.nullable().optional(),
  assets: aiTextVersionAssetsRefSchema.nullable().optional(),
});

const legacyDocumentMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  sourceRelPath: z.string(),
  sourceFileName: z.string(),
  formatKind: z.string(),
  docFolderRelPath: z.string(),
  activeVersionId: z.string().nullable(),
  versions: z.array(legacyVersionRecordSchema),
});

/** Reads either stored schema and always returns the current shape. */
export function normalizeAiTextDocumentMetadata(raw: unknown): AiTextDocumentMetadata | null {
  const current = aiTextDocumentMetadataSchema.safeParse(raw);
  if (current.success) return current.data;

  const legacy = legacyDocumentMetadataSchema.safeParse(raw);
  if (!legacy.success) return null;
  const data = legacy.data;
  return {
    schemaVersion: 2,
    sourceRelPath: data.sourceRelPath,
    sourceFileName: data.sourceFileName,
    formatKind: data.formatKind,
    docFolderRelPath: data.docFolderRelPath,
    activeVersionId: data.activeVersionId,
    versions: data.versions.map((version) => {
      const old = version.provenance;
      return {
        ...version,
        provenance: {
          profileId: 'legacy',
          profileName: old.parserLabel || old.parserId,
          profileFingerprint: '',
          requestedEngineId: old.parserId,
          effectiveEngineId: old.parserId,
          engineLabel: old.parserLabel || old.parserId,
          engineVersion: null,
          route: old.modeUsed ?? old.parserMode ?? 'legacy',
          extraction: {
            ...DEFAULT_AI_TEXT_EXTRACTION,
            ocr: old.ocrEnabled ?? true,
            formula: old.formulaEnabled ?? true,
            tables: old.tableEnabled ?? true,
            language: old.language ?? 'auto',
            layout: Boolean(version.layout),
          },
          refinement: {
            mode: old.usedAgentRefinement ? 'local' : 'none',
            agentId: old.agentId,
            model: old.agentModel,
            didRun: false,
          },
          ...(old.fallbackReason ? { fallbackReason: old.fallbackReason } : {}),
          ...(old.warnings ? { warnings: old.warnings } : {}),
        },
      };
    }),
  };
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** v1 MinerU route ids map onto the profile preset that covers them today. */
const LEGACY_ROUTE_TO_PRESET: Record<string, string> = {
  auto: 'mineru-auto',
  'local-cli': 'mineru-local-kit',
  'local-api': 'mineru-local-api',
  'cloud-token': 'mineru-cloud-token',
  'cloud-free': 'mineru-cloud-free',
};

/**
 * v1 stored one global MinerU block. It becomes the preset profile matching
 * the stored route, so the user's tokens, tier, and flags survive under a
 * familiar name instead of an "imported" one. External parser ids are gone;
 * their keys are dropped.
 */
export function migrateAiTextSettingsV1(raw: unknown): AiTextSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return createDefaultAiTextSettings();
  }
  const legacy = raw as Record<string, unknown>;
  const mineru = readRecord(legacy, 'mineru');
  const mode = readString(mineru, 'mode', 'auto');
  const presetId = LEGACY_ROUTE_TO_PRESET[mode] ?? 'mineru-auto';
  const useAgentRefinement = readBoolean(legacy, 'useAgentRefinement', true);
  const agentId = readString(legacy, 'defaultAgent', 'pi') || 'pi';

  const migratedProfile = createAiTextProfileFromPreset(presetId, [], {
    config: {
      kitCommand: readString(mineru, 'kitCommand', 'mineru-kit'),
      localApiUrl: readString(mineru, 'localApiUrl', 'http://127.0.0.1:8000'),
      apiBaseUrl: readString(mineru, 'apiBaseUrl', 'https://mineru.net'),
      apiToken: readString(mineru, 'apiToken', ''),
      tier: readString(mineru, 'tier', 'standard'),
      ocrMode: readString(mineru, 'ocrMode', 'auto'),
      remoteUrl: readString(mineru, 'remoteUrl', ''),
      remoteApiKey: readString(mineru, 'remoteApiKey', ''),
      extraArgs: readString(mineru, 'extraArgs', ''),
    },
    extraction: {
      ocr: readBoolean(mineru, 'enableOcr', true),
      formula: readBoolean(mineru, 'enableFormula', true),
      tables: readBoolean(mineru, 'enableTable', true),
      language: readString(mineru, 'language', 'auto'),
      pages: readString(mineru, 'pages', ''),
      layout: readBoolean(mineru, 'extractLayout', true),
      imageAnalysis: !readBoolean(mineru, 'disableImageAnalysis', false),
      timeoutMs: readNumber(mineru, 'timeoutMs', 900_000),
    },
    refinement: {
      ...DEFAULT_AI_TEXT_REFINEMENT,
      mode: useAgentRefinement ? 'local' : 'none',
      agentId,
    },
  });

  const profiles = createDefaultAiTextProfiles();
  const existingIndex = profiles.findIndex((profile) => profile.id === migratedProfile.id);
  if (existingIndex >= 0) {
    profiles[existingIndex] = migratedProfile;
  } else {
    profiles.unshift(migratedProfile);
  }
  const legacyViewer = readString(legacy, 'defaultAiTextViewer', 'text');

  return aiTextSettingsSchema.parse({
    enabled: readBoolean(legacy, 'enabled', true),
    openSplitViewByDefault: readBoolean(legacy, 'openSplitViewByDefault', false),
    defaultViewerId: legacyViewer === 'layout-blocks' ? 'layout-blocks' : 'text',
    showLayoutBlockOverlays: readBoolean(legacy, 'showLayoutBlockOverlays', true),
    autoScrollToLayoutBlock: readBoolean(legacy, 'autoScrollToLayoutBlock', true),
    defaultProfileId: migratedProfile.id,
    profiles,
    outputRootDir: readString(legacy, 'outputRootDir', '.autumn'),
  });
}

/**
 * Settings `migrate` hook body for `autumnStudioSettings` version 1 -> 2.
 * Sections other than `aiText` are carried through; the v2 schema fills them.
 */
export function migrateAutumnStudioSettingsV1(values: unknown): Record<string, unknown> {
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    return {};
  }
  const record = values as Record<string, unknown>;
  return {
    ...record,
    aiText: migrateAiTextSettingsV1(record.aiText),
  };
}

export { createDefaultAiTextProfiles };
