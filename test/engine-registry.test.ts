import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  getEngineConfigSchema,
  parseEngineConfig,
} from "../shared/ai-text/engine-configs.ts";
import { AI_TEXT_ENGINE_CATALOG } from "../shared/ai-text/engine-catalog.ts";
import {
  engineSupportsFormat,
  getEngineCapabilities,
  visibleEngineFields,
} from "../shared/ai-text/engines.ts";
import {
  assertEngineSupportsFormat,
  detectEngineEnvironment,
  getAiTextEngine,
  listAiTextEngineDescriptors,
  registerAiTextEngine,
  resolveEngineConfig,
  runEngineOperation,
} from "../server/ai-text/engine-registry.ts";
import { registerAiTextEngines } from "../server/ai-text/engines/index.ts";

describe("ai-text engine registry: catalog and registration", () => {
  before(() => {
    registerAiTextEngines();
    registerAiTextEngines();
  });

  it("registers every catalog engine exactly once", () => {
    const descriptors = listAiTextEngineDescriptors();
    assert.deepEqual(
      descriptors.map((descriptor) => descriptor.id).sort(),
      AI_TEXT_ENGINE_CATALOG.map((descriptor) => descriptor.id).sort(),
    );
    assert.equal(descriptors.length, AI_TEXT_ENGINE_CATALOG.length);
  });

  it("exposes parse and detect for each engine", () => {
    for (const descriptor of AI_TEXT_ENGINE_CATALOG) {
      const engine = getAiTextEngine(descriptor.id);
      assert.ok(engine, `${descriptor.id} should be registered`);
      assert.equal(typeof engine.parse, "function");
      assert.equal(typeof engine.detect, "function");
      assert.deepEqual(engine.descriptor, descriptor);
    }
    assert.equal(getAiTextEngine("marker"), null);
  });

  it("gives every catalog engine a config schema and matching defaults", () => {
    for (const descriptor of AI_TEXT_ENGINE_CATALOG) {
      assert.ok(
        getEngineConfigSchema(descriptor.id),
        `${descriptor.id} needs a config schema`,
      );
      assert.deepEqual(
        parseEngineConfig(descriptor.id, {}),
        descriptor.configDefaults,
      );
    }
  });

  it("declares fields that exist in the engine config", () => {
    for (const descriptor of AI_TEXT_ENGINE_CATALOG) {
      const keys = new Set(Object.keys(descriptor.configDefaults));
      const routeIds = new Set(descriptor.routes.map((route) => route.id));
      for (const field of descriptor.fields) {
        assert.ok(
          keys.has(field.key),
          `${descriptor.id}.${field.key} is not a config key`,
        );
        if (field.kind === "select") {
          assert.ok(
            (field.options?.length ?? 0) > 0,
            `${descriptor.id}.${field.key} needs select options`,
          );
        }
        if (field.kind === "number") {
          assert.ok(field.min !== undefined && field.max !== undefined);
          assert.ok(field.min! <= field.max!);
        }
        for (const route of field.routes ?? []) {
          assert.ok(
            routeIds.has(route),
            `${descriptor.id}.${field.key} references unknown route ${route}`,
          );
        }
        if (field.visibleWhen) {
          assert.ok(
            keys.has(field.visibleWhen.key),
            `${descriptor.id}.${field.key} depends on unknown key`,
          );
        }
      }
    }
  });

  it("declares a valid default route and well-formed operations", () => {
    for (const descriptor of AI_TEXT_ENGINE_CATALOG) {
      assert.ok(
        descriptor.routes.some(
          (route) => route.id === descriptor.defaultRoute,
        ),
        `${descriptor.id} defaultRoute must exist`,
      );
      const operationIds = new Set<string>();
      for (const operation of descriptor.operations) {
        assert.ok(
          !operationIds.has(operation.id),
          `${descriptor.id} duplicate operation ${operation.id}`,
        );
        operationIds.add(operation.id);
        for (const option of operation.options) {
          if (option.kind === "select") {
            assert.ok(option.options.length > 0);
            assert.ok(
              option.options.some(
                (item) => item.value === option.defaultValue,
              ),
              `${descriptor.id}.${operation.id}.${option.key} default is not an option`,
            );
          }
        }
      }
    }
  });

  it("marks which engines produce layout and install locally", () => {
    const local = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "local-ocr",
    )!;
    assert.equal(local.capabilities.layout, false);
    assert.equal(local.capabilities.assets, false);
    assert.equal(local.capabilities.localInstall, false);
    assert.deepEqual(local.operations, []);
    assert.deepEqual(local.fields, []);

    const mineru = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "mineru",
    )!;
    assert.equal(mineru.capabilities.layout, true);
    assert.equal(mineru.capabilities.pageRange, true);
    assert.equal(mineru.capabilities.localInstall, true);

    const docling = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "docling",
    )!;
    assert.equal(docling.capabilities.layout, true);
    assert.equal(docling.capabilities.pageRange, false);
    assert.equal(docling.capabilities.imageAnalysis, false);
  });

  it("applies route capability overrides and falls back to base", () => {
    const mineru = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "mineru",
    )!;
    assert.equal(getEngineCapabilities(mineru, "auto").pageRange, true);
    assert.equal(getEngineCapabilities(mineru, "cloud-free").layout, false);
    assert.equal(getEngineCapabilities(mineru, "cloud-free").pageRange, false);
    assert.equal(getEngineCapabilities(mineru, "cloud-free").ocr, true);
    assert.equal(getEngineCapabilities(mineru, "local-cli").formula, false);
    assert.equal(getEngineCapabilities(mineru, null).formula, true);
    assert.equal(getEngineCapabilities(mineru, "missing-route").ocr, true);

    const docling = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "docling",
    )!;
    assert.equal(getEngineCapabilities(docling, "standard").tables, false);
    assert.equal(getEngineCapabilities(docling, "vlm").ocr, false);
    assert.equal(getEngineCapabilities(docling, "vlm").layout, true);
  });
});

describe("ai-text engine registry: config helpers", () => {
  it("drops unknown config keys and keeps known values", () => {
    const config = resolveEngineConfig("mineru", {
      tier: "basic",
      nope: true,
    });
    assert.equal(config.tier, "basic");
    assert.equal(config.ocrMode, "auto");
    assert.ok(!("nope" in config));
  });

  it("returns an empty object when a known engine receives invalid config", () => {
    assert.deepEqual(resolveEngineConfig("docling", { device: "quantum" }), {});
  });

  it("filters fields by route", () => {
    const mineru = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "mineru",
    )!;
    const cloud = visibleEngineFields(
      mineru,
      mineru.configDefaults,
      "cloud-token",
    ).map((field) => field.key);
    assert.ok(cloud.includes("apiToken"));
    assert.ok(cloud.includes("apiBaseUrl"));
    assert.ok(!cloud.includes("kitCommand"));
    assert.ok(!cloud.includes("tier"));

    const docling = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "docling",
    )!;
    const standard = visibleEngineFields(
      docling,
      docling.configDefaults,
      "standard",
    ).map((field) => field.key);
    const vlm = visibleEngineFields(
      docling,
      docling.configDefaults,
      "vlm",
    ).map((field) => field.key);
    assert.ok(standard.includes("ocrEngine"));
    assert.ok(!standard.includes("vlmModel"));
    assert.ok(vlm.includes("vlmModel"));
    assert.ok(!vlm.includes("ocrEngine"));
  });

  it("matches engine formats", () => {
    const docling = AI_TEXT_ENGINE_CATALOG.find(
      (descriptor) => descriptor.id === "docling",
    )!;
    assert.equal(engineSupportsFormat(docling, "pdf"), true);
    assert.equal(engineSupportsFormat(docling, ".PDF"), true);
    assert.equal(engineSupportsFormat(docling, "docx"), false);
    assert.throws(
      () => assertEngineSupportsFormat(getAiTextEngine("docling")!, "docx"),
      /does not support docx/,
    );
  });
});

describe("ai-text engine registry: operations", () => {
  it("rejects unknown engines and operations before running anything", async () => {
    await assert.rejects(
      runEngineOperation({
        engineId: "marker",
        operationId: "cli.install",
        config: {},
        options: {},
      }),
      /Unknown extraction engine/,
    );
    await assert.rejects(
      runEngineOperation({
        engineId: "mineru",
        operationId: "models.delete",
        config: {},
        options: {},
      }),
      /has no operation/,
    );
    await assert.rejects(
      detectEngineEnvironment({ engineId: "marker", config: {} }),
      /Unknown extraction engine/,
    );
  });

  it("reports engines without operations instead of pretending to run one", async () => {
    registerAiTextEngine({
      descriptor: {
        ...AI_TEXT_ENGINE_CATALOG.find(
          (descriptor) => descriptor.id === "local-ocr",
        )!,
        id: "no-operations",
      },
      parse: async () => {
        throw new Error("not used");
      },
      detect: async () => {
        throw new Error("not used");
      },
    });
    await assert.rejects(
      runEngineOperation({
        engineId: "no-operations",
        operationId: "anything",
        config: {},
        options: {},
      }),
      /has no operation/,
    );
  });
});
