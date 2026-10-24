import { z } from "zod";
import {
  DEFAULT_DOCLING_CONFIG,
  DEFAULT_MINERU_CONFIG,
  parseEngineConfig,
  validateEngineConfig,
} from "./engine-configs.ts";
import {
  AI_TEXT_ENGINE_CATALOG,
  getAiTextEngineDescriptor,
} from "./engine-catalog.ts";
import type { AiTextEngineDescriptor } from "./engines.ts";
import { getEngineCapabilities } from "./engines.ts";
import {
  AI_TEXT_REFINEMENT_PROMPT_PRESETS,
  DEFAULT_AI_TEXT_REFINEMENT,
  aiTextRefinementSettingsSchema,
  type AiTextRefinementSettings,
} from "./refinement.ts";

export const aiTextExtractionSettingsSchema = z.object({
  ocr: z.boolean().default(true),
  formula: z.boolean().default(true),
  tables: z.boolean().default(true),
  /** `auto` passes no language, letting the engine detect it. */
  language: z.string().default("auto"),
  /** Optional page range such as `1-5,8`; empty parses every page. */
  pages: z.string().default(""),
  layout: z.boolean().default(true),
  imageAnalysis: z.boolean().default(false),
  timeoutMs: z.number().int().min(10_000).max(7_200_000).default(900_000),
});
export type AiTextExtractionSettings = z.infer<
  typeof aiTextExtractionSettingsSchema
>;

export const DEFAULT_AI_TEXT_EXTRACTION: AiTextExtractionSettings =
  aiTextExtractionSettingsSchema.parse({});

export const aiTextProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  engineId: z.string().min(1),
  route: z.string().min(1),
  /** Validated against the engine config schema before use. */
  config: z.record(z.string(), z.unknown()).default({}),
  extraction: aiTextExtractionSettingsSchema.default(
    DEFAULT_AI_TEXT_EXTRACTION,
  ),
  refinement: aiTextRefinementSettingsSchema.default(
    DEFAULT_AI_TEXT_REFINEMENT,
  ),
});
export type AiTextProfile = z.infer<typeof aiTextProfileSchema>;

const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PAGE_RANGE_TOKEN = /^(?:all|r?\d+(?:-r?\d+)?)$/;

/**
 * MinerU accepts physical ranges (`1-5,8`), reverse ranges (`r3-r1`), and
 * `all`. Engines without page support never reach the pattern because the
 * capability check below rejects the value first.
 */
export function isValidAiTextPageRange(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const tokens = trimmed.split(",").map((token) => token.trim());
  if (tokens.length === 1 && tokens[0] === "all") return true;
  return tokens.every((token) => PAGE_RANGE_TOKEN.test(token) && token !== "all");
}

export function isValidAiTextProfileId(id: string): boolean {
  return PROFILE_ID_PATTERN.test(id);
}

export function defaultExtractionForEngine(
  engineId: string,
): AiTextExtractionSettings {
  const base = aiTextExtractionSettingsSchema.parse({});
  if (engineId === "local-ocr") {
    return {
      ...base,
      formula: false,
      layout: false,
      timeoutMs: 600_000,
    };
  }
  if (engineId === "docling") {
    return { ...base, timeoutMs: 1_800_000 };
  }
  return base;
}

export interface AiTextProfilePreset {
  id: string;
  label: string;
  description: string;
  engineId: string;
  route: string;
  config: Record<string, unknown>;
  extraction: AiTextExtractionSettings;
  refinement: AiTextRefinementSettings;
}

function preset(input: {
  id: string;
  label: string;
  description: string;
  engineId: string;
  route: string;
  config: Record<string, unknown>;
  extraction?: Partial<AiTextExtractionSettings>;
  refinement?: Partial<AiTextRefinementSettings>;
}): AiTextProfilePreset {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    engineId: input.engineId,
    route: input.route,
    config: { ...input.config },
    extraction: {
      ...defaultExtractionForEngine(input.engineId),
      ...input.extraction,
    },
    refinement: { ...DEFAULT_AI_TEXT_REFINEMENT, ...input.refinement },
  };
}

export const AI_TEXT_PROFILE_PRESETS: readonly AiTextProfilePreset[] = [
  preset({
    id: "mineru-auto",
    label: "MinerU · Auto",
    description:
      "Local models and local API when available, then cloud routes — including the free API. Zero setup, layout blocks when a local engine provides them.",
    engineId: "mineru",
    route: "auto",
    config: DEFAULT_MINERU_CONFIG,
    refinement: { mode: "local" },
  }),
  preset({
    id: "mineru-cloud-free",
    label: "MinerU · Cloud Free",
    description:
      "MinerU's free cloud API. No local install and no token; Markdown only, no layout blocks.",
    engineId: "mineru",
    route: "cloud-free",
    config: DEFAULT_MINERU_CONFIG,
    refinement: { mode: "local" },
  }),
  preset({
    id: "mineru-cloud-token",
    label: "MinerU · Cloud (token)",
    description:
      "MinerU cloud token API. Needs an API token; returns layout geometry and images.",
    engineId: "mineru",
    route: "cloud-token",
    config: DEFAULT_MINERU_CONFIG,
    refinement: { mode: "local" },
  }),
  preset({
    id: "mineru-local-kit",
    label: "MinerU · Local (mineru-kit)",
    description:
      "Runs mineru-kit on this machine. Best quality per page when models are installed.",
    engineId: "mineru",
    route: "local-cli",
    config: DEFAULT_MINERU_CONFIG,
    refinement: { mode: "local" },
  }),
  preset({
    id: "mineru-local-api",
    label: "MinerU · Local API",
    description:
      'Sends the document to a local mineru-kit api-server (start it with "mineru-kit api-server").',
    engineId: "mineru",
    route: "local-api",
    config: DEFAULT_MINERU_CONFIG,
    refinement: { mode: "local" },
  }),
  preset({
    id: "docling-standard",
    label: "Docling · Standard",
    description:
      "Docling layout and table models with OCR. Local install required on first use.",
    engineId: "docling",
    route: "standard",
    config: DEFAULT_DOCLING_CONFIG,
    refinement: { mode: "none" },
  }),
  preset({
    id: "docling-vlm",
    label: "Docling · VLM",
    description:
      "Docling vision-language pipeline. Slower, downloads the Granite Docling model, and can read hard layouts.",
    engineId: "docling",
    route: "vlm",
    config: DEFAULT_DOCLING_CONFIG,
    extraction: { timeoutMs: 3_600_000 },
    refinement: { mode: "none" },
  }),
  preset({
    id: "local-ocr",
    label: "Offline text extraction",
    description:
      "Offline PDF text layer plus on-device OCR. No layout blocks and no installs.",
    engineId: "local-ocr",
    route: "auto",
    config: {},
    refinement: { mode: "none" },
  }),
];

export function getAiTextProfilePreset(
  presetId: string,
): AiTextProfilePreset | null {
  return AI_TEXT_PROFILE_PRESETS.find((item) => item.id === presetId) ?? null;
}

function profileFromPreset(
  source: AiTextProfilePreset,
  overrides: Partial<AiTextProfile> = {},
): AiTextProfile {
  return aiTextProfileSchema.parse({
    id: source.id,
    name: source.label,
    engineId: source.engineId,
    route: source.route,
    config: source.config,
    extraction: source.extraction,
    refinement: source.refinement,
    ...overrides,
  });
}

export function createAiTextProfileFromPreset(
  presetId: string,
  existingProfiles: readonly AiTextProfile[],
  overrides: Partial<AiTextProfile> = {},
): AiTextProfile {
  const source = getAiTextProfilePreset(presetId) ?? AI_TEXT_PROFILE_PRESETS[0]!;
  const id = overrides.id ?? nextAiTextProfileId(existingProfiles, source.id);
  return profileFromPreset(source, { ...overrides, id });
}

/**
 * The one profile that ships pre-created. The plugin bundles no local engine,
 * and the free MinerU API needs no token and no install, so Cloud Free is the
 * only recipe that works out of the box — every other route is one click away
 * in "New profile from preset".
 */
export function createDefaultAiTextProfiles(): AiTextProfile[] {
  return [profileFromPreset(getAiTextProfilePreset("mineru-cloud-free")!)];
}

export function nextAiTextProfileId(
  profiles: readonly AiTextProfile[],
  base: string,
): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const root = slug || "profile";
  const taken = new Set(profiles.map((profile) => profile.id));
  if (!taken.has(root)) return root;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${root}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function duplicateAiTextProfile(
  profile: AiTextProfile,
  existingProfiles: readonly AiTextProfile[],
): AiTextProfile {
  return aiTextProfileSchema.parse({
    ...profile,
    id: nextAiTextProfileId(existingProfiles, profile.id),
    name: `${profile.name} copy`,
    config: { ...profile.config },
    extraction: { ...profile.extraction },
    refinement: { ...profile.refinement },
  });
}

export function getAiTextProfile(
  profiles: readonly AiTextProfile[],
  profileId: string | null | undefined,
): AiTextProfile | null {
  if (!profileId) return null;
  return profiles.find((profile) => profile.id === profileId) ?? null;
}

/**
 * Resolution order: explicit id, configured default, first profile, then the
 * built-in catalog. An explicit missing id returns null so the caller can tell
 * the user instead of silently parsing with something else.
 */
export function resolveAiTextProfile(
  profiles: readonly AiTextProfile[],
  options: { profileId?: string | null; defaultProfileId?: string | null } = {},
): AiTextProfile | null {
  if (options.profileId) {
    return getAiTextProfile(profiles, options.profileId);
  }
  return (
    getAiTextProfile(profiles, options.defaultProfileId) ??
    profiles[0] ??
    null
  );
}

export function getAiTextEngineDescriptorForProfile(
  profile: AiTextProfile,
): AiTextEngineDescriptor | null {
  return getAiTextEngineDescriptor(profile.engineId);
}

/** Fills config and nested defaults, dropping keys the engine doesn't own. */
export function normalizeAiTextProfile(profile: AiTextProfile): AiTextProfile {
  return aiTextProfileSchema.parse({
    ...profile,
    config: parseEngineConfig(profile.engineId, profile.config),
    extraction: aiTextExtractionSettingsSchema.parse(profile.extraction),
    refinement: aiTextRefinementSettingsSchema.parse(profile.refinement),
  });
}

export interface AiTextProfileValidation {
  ok: boolean;
  errors: string[];
  profile: AiTextProfile;
}

export function validateAiTextProfile(
  profile: AiTextProfile,
): AiTextProfileValidation {
  const errors: string[] = [];
  if (!isValidAiTextProfileId(profile.id)) {
    errors.push(
      "Profile id must use letters, numbers, dashes, or underscores (max 64).",
    );
  }
  if (!profile.name.trim()) errors.push("Profile name is required.");

  const descriptor = getAiTextEngineDescriptor(profile.engineId);
  const route = descriptor?.routes.find((item) => item.id === profile.route);
  if (!descriptor) {
    errors.push(`Unknown engine "${profile.engineId}".`);
  } else if (!route) {
    errors.push(
      `Route "${profile.route}" is not available for ${descriptor.label}.`,
    );
  }

  errors.push(...validateEngineConfig(profile.engineId, profile.config));

  const extraction = aiTextExtractionSettingsSchema.safeParse(
    profile.extraction,
  );
  if (!extraction.success) {
    errors.push(
      ...extraction.error.issues.map((issue) => `Extraction: ${issue.message}`),
    );
  } else {
    const pages = extraction.data.pages.trim();
    if (pages && !isValidAiTextPageRange(pages)) {
      errors.push('Page range must look like "1-5,8", "all", or "r3-r1".');
    } else if (pages && descriptor && route) {
      const capabilities = getEngineCapabilities(descriptor, route.id);
      if (!capabilities.pageRange) {
        errors.push(
          `${descriptor.label} route "${route.label}" does not support a page range.`,
        );
      }
    }
  }

  const refinement = aiTextRefinementSettingsSchema.safeParse(
    profile.refinement,
  );
  if (!refinement.success) {
    errors.push(
      ...refinement.error.issues.map((issue) => `Refinement: ${issue.message}`),
    );
  } else if (refinement.data.mode === "agent") {
    if (!refinement.data.agentId.trim()) {
      errors.push("Agent refinement needs an agent.");
    }
    const presetId = refinement.data.promptPresetId;
    if (!AI_TEXT_REFINEMENT_PROMPT_PRESETS.some((preset) => preset.id === presetId)) {
      errors.push(`Unknown refinement prompt preset "${presetId}".`);
    } else if (presetId === "custom" && !refinement.data.prompt.trim()) {
      errors.push("The custom refinement prompt is empty.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    profile: normalizeAiTextProfile(profile),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = stableValue(record[key]);
  }
  return sorted;
}

/**
 * FNV-1a over a stable serialization. Stored in provenance so the UI can say
 * "this version came from a different profile configuration".
 */
export function computeAiTextProfileFingerprint(
  profile: AiTextProfile,
): string {
  const payload = JSON.stringify(
    stableValue({
      engineId: profile.engineId,
      route: profile.route,
      config: profile.config,
      extraction: profile.extraction,
      refinement: profile.refinement,
    }),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function isAiTextEngineId(engineId: string): boolean {
  return AI_TEXT_ENGINE_CATALOG.some((engine) => engine.id === engineId);
}
