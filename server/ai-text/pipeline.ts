import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type {
  AiTextDocumentMetadata,
  AiTextVersionProvenance,
  AiTextVersionRecord,
} from "../../shared/ai-text/settings.ts";
import {
  computeAiTextProfileFingerprint,
  resolveAiTextProfile,
  validateAiTextProfile,
  type AiTextExtractionSettings,
  type AiTextProfile,
} from "../../shared/ai-text/profiles.ts";
import { getEngineCapabilities } from "../../shared/ai-text/engines.ts";
import type { AiTextSettings } from "../../shared/ai-text/settings.ts";
import type { AiTextEngineEnvironment } from "../../shared/ai-text/task.ts";
import {
  assertEngineSupportsFormat,
  getAiTextEngine,
  type AiTextEngine,
  type AiTextParseProgress,
} from "./engine-registry.ts";
import { appendExtractedVersion } from "./metadata-store.ts";
import { refineAiTextMarkdown } from "./refinement.ts";

export interface AiTextPipelineInput {
  paseo: any;
  workspaceRootPath: string;
  /** Namespaces doc folders when the output root is outside the workspace. */
  workspaceId?: string;
  sourceRelPath: string;
  sourceAbsPath: string;
  settings: AiTextSettings;
  /** Explicit profile id from the split view; omitted uses the default. */
  profileId?: string | null;
  signal?: AbortSignal;
  onProgress?: (update: AiTextParseProgress) => void;
  onLog?: (line: string) => void;
}

export interface AiTextPipelineResult {
  metadata: AiTextDocumentMetadata;
  newVersion: AiTextVersionRecord;
  content: string;
}

const LOCAL_FALLBACK_ENGINE_ID = "local-ocr";

function detectFormatKind(relPath: string): string {
  const clean = relPath.toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1) : "text";
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("AI text extraction was cancelled");
  }
}

async function parseWithEngine(input: {
  engine: AiTextEngine;
  profile: AiTextProfile;
  workspaceRootPath: string;
  sourceRelPath: string;
  sourceAbsPath: string;
  fileName: string;
  buffer: Buffer;
  signal?: AbortSignal;
  onProgress?: (update: AiTextParseProgress) => void;
  onLog?: (line: string) => void;
}) {
  return await input.engine.parse({
    workspaceRootPath: input.workspaceRootPath,
    sourceRelPath: input.sourceRelPath,
    sourceAbsPath: input.sourceAbsPath,
    fileName: input.fileName,
    buffer: input.buffer,
    route: input.profile.route,
    config: input.profile.config,
    extraction: input.profile.extraction,
    signal: input.signal,
    onProgress: input.onProgress,
    onLog: input.onLog,
  });
}

export async function runAiTextPipeline(
  input: AiTextPipelineInput,
): Promise<AiTextPipelineResult> {
  const startedAt = Date.now();
  assertNotAborted(input.signal);

  const profile = resolveAiTextProfile(input.settings.profiles, {
    profileId: input.profileId,
    defaultProfileId: input.settings.defaultProfileId,
  });
  if (!profile) {
    throw new Error(
      input.profileId
        ? `The AI Text profile "${input.profileId}" no longer exists. Pick another profile.`
        : "No AI Text profiles are configured. Add one in AI Text settings.",
    );
  }
  const validation = validateAiTextProfile(profile);
  if (!validation.ok) {
    throw new Error(
      `The AI Text profile "${profile.name}" is invalid: ${validation.errors.join(" ")}`,
    );
  }
  const resolvedProfile = validation.profile;

  const engine = getAiTextEngine(resolvedProfile.engineId);
  if (!engine) {
    throw new Error(
      `Extraction engine "${resolvedProfile.engineId}" is not available in this daemon.`,
    );
  }
  const formatKind = detectFormatKind(input.sourceRelPath);
  assertEngineSupportsFormat(engine, formatKind);

  const [fileStats, buffer] = await Promise.all([
    stat(input.sourceAbsPath),
    readFile(input.sourceAbsPath),
  ]);
  const fileName = basename(input.sourceAbsPath);

  let parseResult: Awaited<ReturnType<typeof parseWithEngine>> | null = null;
  let effectiveEngine = engine;
  let effectiveExtraction: AiTextExtractionSettings = resolvedProfile.extraction;
  let fallbackReason: string | undefined;

  input.onProgress?.({ phase: "Preparing", message: `Running ${engine.descriptor.label}` });
  try {
    parseResult = await parseWithEngine({
      engine,
      profile: resolvedProfile,
      workspaceRootPath: input.workspaceRootPath,
      sourceRelPath: input.sourceRelPath,
      sourceAbsPath: input.sourceAbsPath,
      fileName,
      buffer,
      signal: input.signal,
      onProgress: input.onProgress,
      onLog: input.onLog,
    });
  } catch (error) {
    if (input.signal?.aborted) assertNotAborted(input.signal);
    const failedReason = error instanceof Error ? error.message : String(error);
    if (resolvedProfile.engineId === LOCAL_FALLBACK_ENGINE_ID) {
      throw error;
    }
    const fallbackEngine = getAiTextEngine(LOCAL_FALLBACK_ENGINE_ID);
    if (!fallbackEngine) throw error;
    input.onLog?.(
      `${engine.descriptor.label} failed (${failedReason}); using local extraction`,
    );
    fallbackReason = `${engine.descriptor.label} failed: ${failedReason}. This version came from local text extraction.`;
    const fallbackProfile: AiTextProfile = {
      ...resolvedProfile,
      engineId: LOCAL_FALLBACK_ENGINE_ID,
      route: fallbackEngine.descriptor.defaultRoute,
      config: {},
      extraction: {
        ...resolvedProfile.extraction,
        formula: false,
        layout: false,
        imageAnalysis: false,
      },
    };
    try {
      parseResult = await parseWithEngine({
        engine: fallbackEngine,
        profile: fallbackProfile,
        workspaceRootPath: input.workspaceRootPath,
        sourceRelPath: input.sourceRelPath,
        sourceAbsPath: input.sourceAbsPath,
        fileName,
        buffer,
        signal: input.signal,
        onProgress: input.onProgress,
        onLog: input.onLog,
      });
    } catch (fallbackError) {
      if (input.signal?.aborted) assertNotAborted(input.signal);
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      throw new Error(
        `${engine.descriptor.label} failed: ${failedReason} Local fallback (${fallbackEngine.descriptor.label}) also failed: ${fallbackMessage}`,
      );
    }
    effectiveEngine = fallbackEngine;
    effectiveExtraction = fallbackProfile.extraction;
  }

  assertNotAborted(input.signal);
  if (!parseResult) {
    throw new Error("The extraction engine returned no result.");
  }

  const parseWarnings = [...parseResult.warnings];
  const requestedPages = effectiveExtraction.pages.trim();
  if (requestedPages) {
    const routeCapabilities = getEngineCapabilities(
      effectiveEngine.descriptor,
      parseResult.routeUsed,
    );
    if (!routeCapabilities.pageRange) {
      parseWarnings.push(
        `${effectiveEngine.descriptor.label} route "${parseResult.routeUsed}" ignores the page range "${requestedPages}"; every page was parsed.`,
      );
    }
  }

  const refinement = await refineAiTextMarkdown({
    paseo: input.paseo,
    settings: resolvedProfile.refinement,
    workspaceRootPath: input.workspaceRootPath,
    fileName,
    language: resolvedProfile.extraction.language,
    markdown: parseResult.markdown,
    timeoutMs: Math.min(resolvedProfile.extraction.timeoutMs, 5 * 60 * 1000),
    signal: input.signal,
    onProgress: (message) =>
      input.onProgress?.({ phase: "Refining", message }),
    onLog: input.onLog,
  });
  assertNotAborted(input.signal);

  const warnings = [...parseWarnings, ...refinement.warnings].slice(0, 20);
  const provenance: AiTextVersionProvenance = {
    profileId: resolvedProfile.id,
    profileName: resolvedProfile.name,
    profileFingerprint: computeAiTextProfileFingerprint(resolvedProfile),
    requestedEngineId: resolvedProfile.engineId,
    effectiveEngineId: effectiveEngine.descriptor.id,
    engineLabel: effectiveEngine.descriptor.label,
    engineVersion: parseResult.engineVersion,
    route: parseResult.routeUsed,
    extraction: effectiveExtraction,
    refinement: refinement.provenance,
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  return await appendExtractedVersion({
    workspaceRootPath: input.workspaceRootPath,
    workspaceId: input.workspaceId,
    sourceRelPath: input.sourceRelPath,
    sourceSize: fileStats.size,
    sourceMtimeMs: fileStats.mtimeMs,
    markdownContent: refinement.markdown,
    durationMs: Math.max(1, Date.now() - startedAt),
    provenance,
    layout: parseResult.layout,
    assets: parseResult.assets,
    outputRootDir: input.settings.outputRootDir,
  });
}

export async function getProfileEngineEnvironment(
  settings: AiTextSettings,
  engineId: string,
): Promise<AiTextEngineEnvironment> {
  const engine = getAiTextEngine(engineId);
  if (!engine) throw new Error(`Unknown extraction engine "${engineId}".`);
  // Prefer the profile the user actually parses with so detection reflects
  // the command path, tokens, and device that profile will use.
  const profilesForEngine = settings.profiles.filter(
    (item) => item.engineId === engineId,
  );
  const profile =
    profilesForEngine.find(
      (item) => item.id === settings.defaultProfileId,
    ) ?? profilesForEngine[0];
  return await engine.detect({
    config: profile?.config ?? engine.descriptor.configDefaults,
    indexUrl: settings.pypiIndexUrl,
    refresh: true,
  });
}
