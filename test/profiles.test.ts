import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_TEXT_PROFILE_PRESETS,
  computeAiTextProfileFingerprint,
  createAiTextProfileFromPreset,
  createDefaultAiTextProfiles,
  defaultExtractionForEngine,
  duplicateAiTextProfile,
  getAiTextProfile,
  nextAiTextProfileId,
  normalizeAiTextProfile,
  resolveAiTextProfile,
  validateAiTextProfile,
  type AiTextProfile,
} from "../shared/ai-text/profiles.ts";
import { DEFAULT_AI_TEXT_EXTRACTION } from "../shared/ai-text/profiles.ts";

function validProfile(): AiTextProfile {
  return createAiTextProfileFromPreset("mineru-auto", []);
}

describe("ai-text profiles: defaults and presets", () => {
  it("ships exactly one ready-to-use profile: MinerU Cloud Free", () => {
    const profiles = createDefaultAiTextProfiles();
    assert.deepEqual(
      profiles.map((profile) => profile.id),
      ["mineru-cloud-free"],
    );
    assert.equal(profiles[0]!.engineId, "mineru");
    assert.equal(profiles[0]!.route, "cloud-free");
    assert.equal(profiles[0]!.refinement.mode, "local");
  });

  it("produces a valid profile for every preset", () => {
    for (const preset of AI_TEXT_PROFILE_PRESETS) {
      const profile = createAiTextProfileFromPreset(preset.id, []);
      const validation = validateAiTextProfile(profile);
      assert.equal(
        validation.ok,
        true,
        `${preset.id} should be valid: ${validation.errors.join("; ")}`,
      );
      assert.equal(profile.engineId, preset.engineId);
      assert.equal(profile.route, preset.route);
    }
  });

  it("gives the VLM preset a longer timeout and no refinement", () => {
    const profile = createAiTextProfileFromPreset("docling-vlm", []);
    assert.equal(profile.route, "vlm");
    assert.equal(profile.extraction.timeoutMs, 3_600_000);
    assert.equal(profile.refinement.mode, "none");
  });

  it("uses engine-specific extraction defaults", () => {
    const local = defaultExtractionForEngine("local-ocr");
    assert.equal(local.formula, false);
    assert.equal(local.layout, false);
    assert.equal(local.timeoutMs, 600_000);
    const docling = defaultExtractionForEngine("docling");
    assert.equal(docling.timeoutMs, 1_800_000);
    assert.equal(docling.formula, true);
    const mineru = defaultExtractionForEngine("mineru");
    assert.deepEqual(mineru, DEFAULT_AI_TEXT_EXTRACTION);
  });

  it("generates unique ids instead of overwriting an existing preset id", () => {
    const existing = createDefaultAiTextProfiles();
    assert.equal(
      nextAiTextProfileId(existing, "mineru-cloud-free"),
      "mineru-cloud-free-2",
    );
    const created = createAiTextProfileFromPreset("mineru-cloud-free", existing);
    assert.equal(created.id, "mineru-cloud-free-2");
    const slugged = nextAiTextProfileId([], "My New Profile!");
    assert.equal(slugged, "my-new-profile");
  });

  it("duplicates a profile with a changed id and name", () => {
    const source = validProfile();
    const copy = duplicateAiTextProfile(source, [source]);
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.name, `${source.name} copy`);
    assert.deepEqual(copy.config, source.config);
    assert.notEqual(copy.config, source.config);
  });
});

describe("ai-text profiles: resolution", () => {
  function defaultsWithDocling() {
    return [
      ...createDefaultAiTextProfiles(),
      createAiTextProfileFromPreset("docling-standard", []),
    ];
  }

  it("uses an explicit profile id when it exists", () => {
    const profiles = defaultsWithDocling();
    const resolved = resolveAiTextProfile(profiles, {
      profileId: "docling-standard",
      defaultProfileId: "mineru-cloud-free",
    });
    assert.equal(resolved?.id, "docling-standard");
  });

  it("returns null for an explicit id that no longer exists", () => {
    const profiles = createDefaultAiTextProfiles();
    assert.equal(
      resolveAiTextProfile(profiles, { profileId: "deleted-profile" }),
      null,
    );
  });

  it("falls back to the default, then the first profile", () => {
    const profiles = defaultsWithDocling();
    assert.equal(
      resolveAiTextProfile(profiles, { defaultProfileId: "docling-standard" })
        ?.id,
      "docling-standard",
    );
    assert.equal(
      resolveAiTextProfile(profiles, { defaultProfileId: "missing" })?.id,
      "mineru-cloud-free",
    );
    assert.equal(resolveAiTextProfile([]), null);
  });

  it("looks profiles up by id", () => {
    const profiles = defaultsWithDocling();
    assert.equal(getAiTextProfile(profiles, "docling-standard")?.engineId, "docling");
    assert.equal(getAiTextProfile(profiles, "nope"), null);
    assert.equal(getAiTextProfile(profiles, null), null);
  });
});

describe("ai-text profiles: validation", () => {
  it("accepts a valid preset", () => {
    const validation = validateAiTextProfile(validProfile());
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.ok, true);
  });

  it("rejects an unknown engine", () => {
    const profile = { ...validProfile(), engineId: "marker" };
    const validation = validateAiTextProfile(profile);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes("Unknown engine")));
  });

  it("rejects a route the engine does not expose", () => {
    const profile = { ...validProfile(), route: "bogus-route" };
    const validation = validateAiTextProfile(profile);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes("not available")));
  });

  it("rejects invalid engine config values", () => {
    const profile = {
      ...validProfile(),
      config: { ...validProfile().config, tier: "turbo" },
    };
    const validation = validateAiTextProfile(profile);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.startsWith("tier:")));
  });

  it("rejects malformed profile ids and empty names", () => {
    const profile = validProfile();
    assert.equal(
      validateAiTextProfile({ ...profile, id: "bad id!" }).ok,
      false,
    );
    assert.equal(validateAiTextProfile({ ...profile, name: "   " }).ok, false);
  });

  it("rejects page ranges Docling cannot honor", () => {
    const profile = createAiTextProfileFromPreset("mineru-auto", []);
    const withPages = {
      ...profile,
      extraction: { ...profile.extraction, pages: "1-5,abc" },
    };
    const validation = validateAiTextProfile(withPages);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes("Page range")));
  });

  it("accepts well-formed MinerU page ranges", () => {
    const profile = validProfile();
    for (const pages of ["1-5, 8", "all", "r3-r1", "1,3-4"]) {
      const withPages = {
        ...profile,
        extraction: { ...profile.extraction, pages },
      };
      assert.equal(
        validateAiTextProfile(withPages).ok,
        true,
        `${pages} should be valid`,
      );
    }
  });

  it("rejects a page range on a route that ignores it", () => {
    const profile = {
      ...validProfile(),
      route: "cloud-free",
      extraction: { ...validProfile().extraction, pages: "1-5" },
    };
    const validation = validateAiTextProfile(profile);
    assert.equal(validation.ok, false);
    assert.ok(
      validation.errors.some((error) => error.includes("does not support")),
    );

    const localOcr = createAiTextProfileFromPreset("local-ocr", []);
    const withPages = {
      ...localOcr,
      extraction: { ...localOcr.extraction, pages: "2" },
    };
    assert.equal(validateAiTextProfile(withPages).ok, false);
  });

  it("rejects an empty custom refinement prompt and unknown presets", () => {
    const profile = validProfile();
    const agent = {
      ...profile,
      refinement: {
        ...profile.refinement,
        mode: "agent" as const,
        promptPresetId: "custom",
        prompt: "   ",
      },
    };
    const validation = validateAiTextProfile(agent);
    assert.equal(validation.ok, false);
    assert.ok(
      validation.errors.some((error) => error.includes("custom refinement prompt")),
    );

    const unknownPreset = {
      ...agent,
      refinement: { ...agent.refinement, promptPresetId: "missing" },
    };
    assert.ok(
      validateAiTextProfile(unknownPreset).errors.some((error) =>
        error.includes("Unknown refinement prompt preset"),
      ),
    );
  });

  it("requires an agent for agent refinement", () => {
    const profile = validProfile();
    const withAgent = {
      ...profile,
      refinement: { ...profile.refinement, mode: "agent" as const, agentId: "" },
    };
    const validation = validateAiTextProfile(withAgent);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes("needs an agent")));
  });
});

describe("ai-text profiles: normalization and fingerprint", () => {
  it("fills engine defaults and drops unknown config keys", () => {
    const profile = {
      ...validProfile(),
      config: { kitCommand: "/opt/mineru-kit", notAnEngineKey: true },
    };
    const normalized = normalizeAiTextProfile(profile);
    assert.equal(normalized.config.kitCommand, "/opt/mineru-kit");
    assert.ok(!("notAnEngineKey" in normalized.config));
    assert.equal(normalized.config.tier, "standard");
  });

  it("keeps the fingerprint stable across config key order and identity", () => {
    const profile = validProfile();
    const reordered = {
      ...profile,
      name: "Renamed",
      id: "renamed",
      config: Object.fromEntries(
        Object.entries(profile.config).reverse(),
      ),
    };
    assert.equal(
      computeAiTextProfileFingerprint(profile),
      computeAiTextProfileFingerprint(reordered),
    );
  });

  it("changes the fingerprint when parsing settings change", () => {
    const profile = validProfile();
    const base = computeAiTextProfileFingerprint(profile);
    const changedExtraction = {
      ...profile,
      extraction: { ...profile.extraction, ocr: !profile.extraction.ocr },
    };
    assert.notEqual(
      base,
      computeAiTextProfileFingerprint(changedExtraction),
    );
    const changedRefinement = {
      ...profile,
      refinement: { ...profile.refinement, mode: "none" as const },
    };
    assert.notEqual(
      base,
      computeAiTextProfileFingerprint(changedRefinement),
    );
  });
});
