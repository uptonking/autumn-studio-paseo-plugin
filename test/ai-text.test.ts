import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AI_TEXT_EXTRACTION,
  DEFAULT_AI_TEXT_SETTINGS,
  DEFAULT_AUTUMN_STUDIO_SETTINGS,
  aiTextSettingsSchema,
  autumnStudioSettingsSchema,
  getAiTextSettings,
  isAiTextSupportedFormat,
  migrateAiTextSettingsV1,
  normalizeAiTextDocumentMetadata,
  shouldAutoOpenAiTextSplit,
  toAutumnDocFolderSlug,
  withAiTextSettings,
  type AiTextDocumentMetadata,
  type AiTextVersionProvenance,
  type AutumnStudioSettingsValues,
} from "../shared/contracts.ts";
import { extractLocalDocumentFallback } from "../server/ai-text/local-ocr-extractor.ts";
import {
  formatLayoutPdfTextToMarkdown,
  formatVisionOcrLinesToMarkdown,
} from "../server/ai-text/pdf-local-ocr.ts";

function sampleProvenance(
  overrides: Partial<AiTextVersionProvenance> = {},
): AiTextVersionProvenance {
  return {
    profileId: "mineru-auto",
    profileName: "MinerU · Auto",
    profileFingerprint: "fingerprint",
    requestedEngineId: "mineru",
    effectiveEngineId: "mineru",
    engineLabel: "MinerU",
    route: "local-cli",
    extraction: DEFAULT_AI_TEXT_EXTRACTION,
    refinement: { mode: "local", didRun: false },
    warnings: [],
    ...overrides,
  };
}

function sampleMetadata(): AiTextDocumentMetadata {
  return {
    schemaVersion: 2,
    sourceRelPath: "docs/paper.pdf",
    sourceFileName: "paper.pdf",
    formatKind: "pdf",
    docFolderRelPath: ".autumn/docs__paper.pdf",
    activeVersionId: "v1",
    versions: [
      {
        id: "v1",
        versionNumber: 1,
        fileName: "v1.md",
        relPath: ".autumn/docs__paper.pdf/v1.md",
        createdAt: "2026-01-01T00:00:00.000Z",
        durationMs: 10,
        size: 10,
        sourceSize: 10,
        sourceMtimeMs: 0,
        provenance: sampleProvenance(),
      },
    ],
  };
}

describe("ai-text: settings schema, profiles, and format helpers", () => {
  it("defaults to the ready-to-use MinerU Cloud Free profile", () => {
    const parsed = autumnStudioSettingsSchema.parse({});
    assert.equal(parsed.aiText.enabled, true);
    assert.equal(parsed.aiText.openSplitViewByDefault, false);
    assert.equal(parsed.aiText.showMetadataPanelByDefault, false);
    assert.equal(parsed.aiText.defaultViewerId, "text");
    assert.equal(parsed.aiText.showLayoutBlockOverlays, true);
    assert.equal(parsed.aiText.autoScrollToLayoutBlock, true);
    assert.equal(parsed.aiText.defaultProfileId, "mineru-cloud-free");
    assert.deepEqual(
      parsed.aiText.profiles.map((profile) => profile.id),
      ["mineru-cloud-free"],
    );

    const cloudFree = parsed.aiText.profiles[0]!;
    assert.equal(cloudFree.engineId, "mineru");
    assert.equal(cloudFree.route, "cloud-free");
    assert.equal(cloudFree.config.apiBaseUrl, "https://mineru.net");
    assert.equal(cloudFree.extraction.layout, true);
    assert.equal(cloudFree.extraction.ocr, true);
    assert.equal(cloudFree.refinement.mode, "local");
    assert.equal(
      aiTextSettingsSchema.parse({}).defaultProfileId,
      "mineru-cloud-free",
    );
  });

  it("updates AI Text settings immutably via withAiTextSettings", () => {
    const profile = {
      ...DEFAULT_AI_TEXT_SETTINGS.profiles[0]!,
      route: "local-cli",
    };
    const updated = withAiTextSettings(DEFAULT_AUTUMN_STUDIO_SETTINGS, {
      enabled: false,
      defaultViewerId: "layout-blocks",
      profiles: [profile],
      defaultProfileId: profile.id,
    });
    const aiText = getAiTextSettings(updated);
    assert.equal(aiText.enabled, false);
    assert.equal(aiText.defaultViewerId, "layout-blocks");
    assert.equal(aiText.profiles[0]?.route, "local-cli");
    assert.equal(aiText.defaultProfileId, profile.id);
  });

  it("salvages valid stored profiles and repairs a dangling default", () => {
    const valid = {
      ...DEFAULT_AI_TEXT_SETTINGS.profiles[0]!,
      id: "kept",
    };
    const malformed = { ...valid, id: "broken", engineId: "" };
    const settings = getAiTextSettings({
      aiText: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        profiles: [malformed, valid, { ...valid }],
        defaultProfileId: "missing-profile",
      },
    } as unknown as AutumnStudioSettingsValues);

    assert.deepEqual(
      settings.profiles.map((profile) => profile.id),
      ["kept"],
    );
    assert.equal(settings.defaultProfileId, "kept");
  });

  it("falls back to the built-in profiles when every stored profile is invalid", () => {
    const settings = getAiTextSettings({
      aiText: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        profiles: [{ id: "broken" }],
        defaultProfileId: "broken",
      },
    } as unknown as AutumnStudioSettingsValues);

    assert.deepEqual(
      settings.profiles.map((profile) => profile.id),
      ["mineru-cloud-free"],
    );
    assert.equal(settings.defaultProfileId, "mineru-cloud-free");
  });

  it("keeps scalar AI Text settings when individual profiles are malformed", () => {
    const settings = getAiTextSettings({
      aiText: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        enabled: false,
        outputRootDir: "custom-out",
        profiles: [{ id: "broken" }],
      }
    } as unknown as AutumnStudioSettingsValues);

    assert.equal(settings.enabled, false);
    assert.equal(settings.outputRootDir, "custom-out");
  });

  it("heals an unusable output root but preserves valid absolute roots", () => {
    const broken = getAiTextSettings({
      aiText: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        outputRootDir: "docs/../outside",
      }
    } as unknown as AutumnStudioSettingsValues);
    assert.equal(broken.outputRootDir, ".autumn");

    const absolute = getAiTextSettings({
      aiText: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        outputRootDir: "/data/ai-text/",
      }
    } as unknown as AutumnStudioSettingsValues);
    assert.equal(absolute.outputRootDir, "/data/ai-text");
  });

  it("migrates v1 MinerU settings into a profile and keeps tokens", () => {
    const migrated = migrateAiTextSettingsV1({
      enabled: false,
      openSplitViewByDefault: true,
      useAgentRefinement: true,
      defaultAgent: "claude",
      defaultParser: "agent-vlm",
      defaultAiTextViewer: "layout-blocks",
      mineru: {
        mode: "local-cli",
        apiToken: "secret-token",
        tier: "advanced",
        extractLayout: false,
        enableOcr: false,
        enableFormula: false,
        language: "zh",
      },
    });

    assert.equal(migrated.enabled, false);
    assert.equal(migrated.openSplitViewByDefault, true);
    assert.equal(migrated.defaultViewerId, "layout-blocks");
    // The v1 route maps onto the matching preset instead of a "migrated" name,
    // and the zero-setup Cloud Free profile is always present alongside it.
    assert.equal(migrated.defaultProfileId, "mineru-local-kit");
    assert.deepEqual(
      migrated.profiles.map((profile) => profile.id),
      ["mineru-local-kit", "mineru-cloud-free"],
    );

    const profile = migrated.profiles[0]!;
    assert.equal(profile.name, "MinerU · Local (mineru-kit)");
    assert.equal(profile.route, "local-cli");
    assert.equal(profile.config.apiToken, "secret-token");
    assert.equal(profile.config.tier, "advanced");
    assert.equal(profile.extraction.layout, false);
    assert.equal(profile.extraction.ocr, false);
    assert.equal(profile.extraction.formula, false);
    assert.equal(profile.extraction.language, "zh");
    assert.equal(profile.refinement.mode, "local");
    assert.equal(profile.refinement.agentId, "claude");
    // `agent-vlm` is gone; it must not leak into the migrated profile list.
    assert.equal(
      migrated.profiles.some((item) => item.engineId === "agent-vlm"),
      false,
    );
  });

  it("exposes AI Text Mode only for PDFs and builds collision-safe .autumn slugs", () => {
    assert.equal(isAiTextSupportedFormat("pdf", "docs/paper.pdf"), true);
    assert.equal(isAiTextSupportedFormat("docx", "specs/proposal.docx"), false);
    assert.equal(isAiTextSupportedFormat("text", "pages/index.html"), false);
    assert.equal(isAiTextSupportedFormat("text", "src/index.ts"), false);
    assert.equal(isAiTextSupportedFormat("image", "preview.png"), false);
    assert.equal(isAiTextSupportedFormat("pdf", "docs/PAPER.PDF"), true);

    assert.equal(toAutumnDocFolderSlug("paper.pdf"), "paper.pdf");
    assert.equal(toAutumnDocFolderSlug("docs/paper.pdf"), "docs__paper.pdf");
    assert.equal(
      toAutumnDocFolderSlug("nested/2026/report.docx"),
      "nested__2026__report.docx",
    );
    assert.equal(
      toAutumnDocFolderSlug("pdf/红楼梦研究资料选辑_1974_鲁迅_page1.pdf"),
      "pdf__红楼梦研究资料选辑_1974_鲁迅_page1.pdf",
    );
    assert.equal(toAutumnDocFolderSlug(".."), "_");
    assert.equal(toAutumnDocFolderSlug("."), "_");
    assert.equal(toAutumnDocFolderSlug("a/../b.pdf"), "a_____b.pdf");
  });

  it("auto-opens the split only for an enabled default with cached content", () => {
    const base = {
      openSplitViewByDefault: true,
      metadata: sampleMetadata(),
      activeContent: "# Paper",
      filePath: "docs/paper.pdf",
      lastAutoOpenedFilePath: null,
    };

    assert.equal(shouldAutoOpenAiTextSplit(base), true);
    assert.equal(
      shouldAutoOpenAiTextSplit({ ...base, openSplitViewByDefault: false }),
      false,
    );
    assert.equal(shouldAutoOpenAiTextSplit({ ...base, metadata: null }), false);
    assert.equal(
      shouldAutoOpenAiTextSplit({ ...base, activeContent: null }),
      false,
    );
    assert.equal(
      shouldAutoOpenAiTextSplit({
        ...base,
        lastAutoOpenedFilePath: "docs/paper.pdf",
      }),
      false,
    );
    assert.equal(
      shouldAutoOpenAiTextSplit({ ...base, filePath: undefined }),
      false,
    );
  });

  it("normalizes stored v1 metadata into provenance v2", () => {
    const legacy = {
      schemaVersion: 1,
      sourceRelPath: "docs/old.pdf",
      sourceFileName: "old.pdf",
      formatKind: "pdf",
      docFolderRelPath: ".autumn/docs__old.pdf",
      activeVersionId: "123_v1",
      versions: [
        {
          id: "123_v1",
          versionNumber: 1,
          fileName: "123_v1.md",
          relPath: ".autumn/docs__old.pdf/123_v1.md",
          createdAt: "2026-01-01T00:00:00.000Z",
          durationMs: 10,
          size: 10,
          sourceSize: 10,
          sourceMtimeMs: 0,
          provenance: {
            parserId: "mineru",
            parserLabel: "MinerU",
            modeUsed: "cloud-free",
            agentId: "pi",
            usedAgentRefinement: true,
            ocrEnabled: false,
            language: "en",
          },
        },
      ],
    };

    const normalized = normalizeAiTextDocumentMetadata(legacy);
    assert.equal(normalized?.schemaVersion, 2);
    const provenance = normalized?.versions[0]?.provenance;
    assert.equal(provenance?.profileId, "legacy");
    assert.equal(provenance?.profileName, "MinerU");
    assert.equal(provenance?.effectiveEngineId, "mineru");
    assert.equal(provenance?.route, "cloud-free");
    assert.equal(provenance?.extraction.ocr, false);
    assert.equal(provenance?.extraction.language, "en");
    assert.equal(provenance?.refinement.mode, "local");
    assert.equal(provenance?.refinement.agentId, "pi");
    assert.equal(normalizeAiTextDocumentMetadata({ nope: true }), null);
  });
});

