import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearEngineVersionCache,
  compareVersions,
  fetchLatestEngineVersion,
  isStableVersion,
  parseSimpleIndexVersions,
  parseVersionFromFilename,
  parseVersionSpec,
  uvIndexArgs,
} from "../server/ai-text/engine-versions.ts";
import {
  runDoclingOperation,
} from "../server/ai-text/engines/docling/operations.ts";
import {
  runMineruOperation,
} from "../server/ai-text/engines/mineru/operations.ts";
import { isAiTextEngineOperationVisible } from "../shared/ai-text/task.ts";
import type { AiTextEngineEnvironment } from "../shared/ai-text/task.ts";
import { DEFAULT_MINERU_CONFIG } from "../shared/ai-text/engine-configs.ts";

describe("engine versions: ordering and parsing", () => {
  it("compares dotted versions numerically", () => {
    assert.equal(compareVersions("2.50.0", "2.9.0") > 0, true);
    assert.equal(compareVersions("2.50.0", "2.50.0"), 0);
    assert.equal(compareVersions("2.50.0", "2.50.1") < 0, true);
    assert.equal(compareVersions("1.0", "1.0.0") < 0, true);
  });

  it("normalizes user-typed version specs", () => {
    assert.equal(parseVersionSpec(""), null);
    assert.equal(parseVersionSpec("v1.2.3"), "1.2.3");
    assert.equal(parseVersionSpec("==1.2.3"), "1.2.3");
    assert.equal(parseVersionSpec("latest"), null);
    assert.equal(parseVersionSpec("1.2.3rc1"), "1.2.3rc1");
  });

  it("derives uv --index-url args from the mirror setting", () => {
    assert.deepEqual(uvIndexArgs(""), []);
    assert.deepEqual(uvIndexArgs("  https://mirror.example/simple/ "), [
      "--index-url",
      "https://mirror.example/simple/",
    ]);
  });

  it("extracts versions from PEP 503 filenames", () => {
    assert.equal(
      parseVersionFromFilename("docling-2.142.1-py3-none-any.whl", "docling"),
      "2.142.1",
    );
    assert.equal(
      parseVersionFromFilename("docling-2.100.0.tar.gz", "Docling"),
      "2.100.0",
    );
    assert.equal(
      parseVersionFromFilename("other-1.0.0.tar.gz", "docling"),
      null,
    );
    assert.equal(parseVersionFromFilename("docling.zip", "docling"), null);
  });

  it("parses a simple-index page and picks the newest release", () => {
    const html = `
      <a href="../../packages/docling-2.142.0-py3-none-any.whl#sha256=abc">docling-2.142.0-py3-none-any.whl</a>
      <a href="../../packages/docling-2.142.1-py3-none-any.whl">docling-2.142.1-py3-none-any.whl</a>
      <a href="../../packages/docling-2.100.0.tar.gz">docling-2.100.0.tar.gz</a>
    `;
    assert.deepEqual(parseSimpleIndexVersions(html, "docling"), [
      "2.100.0",
      "2.142.0",
      "2.142.1",
    ]);
  });
});

describe("engine versions: latest release lookup", () => {
  const originalFetch = global.fetch;
  let calls: string[] = [];

  before(() => {
    clearEngineVersionCache();
  });

  beforeEach(() => {
    clearEngineVersionCache();
    calls = [];
  });

  after(() => {
    global.fetch = originalFetch;
    clearEngineVersionCache();
  });

  it("reads the official PyPI JSON API", async () => {
    global.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ info: { version: "2.142.1" } }),
      } as Response;
    }) as typeof fetch;
    assert.equal(await fetchLatestEngineVersion("docling", ""), "2.142.1");
    assert.ok(calls[0]!.startsWith("https://pypi.org/pypi/docling/"));
  });

  it("parses the mirror simple index", async () => {
    global.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return {
        ok: true,
        text: async () =>
          '<a href="x">docling-2.140.0-py3-none-any.whl</a><a href="y">docling-2.141.0.tar.gz</a>',
      } as Response;
    }) as typeof fetch;
    assert.equal(
      await fetchLatestEngineVersion(
        "docling",
        "https://mirror.example/simple/",
      ),
      "2.141.0",
    );
    assert.equal(calls[0], "https://mirror.example/simple/docling/");
  });

  it("caches results per package and index", async () => {
    global.fetch = (async () => {
      calls.push("hit");
      return {
        ok: true,
        json: async () => ({ info: { version: "1.0.0" } }),
      } as Response;
    }) as typeof fetch;
    await fetchLatestEngineVersion("mineru", "");
    await fetchLatestEngineVersion("mineru", "");
    assert.equal(calls.length, 1);
  });

  it("fails soft to null on any error", async () => {
    global.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    assert.equal(await fetchLatestEngineVersion("mineru", ""), null);
  });

  it("prefers stable releases over higher prereleases on mirrors", async () => {
    global.fetch = (async () =>
      ({
        ok: true,
        text: async () =>
          '<a href="a">docling-2.142.1-py3-none-any.whl</a>' +
          '<a href="b">docling-2.143.0rc1-py3-none-any.whl</a>',
      }) as Response) as typeof fetch;
    assert.equal(
      await fetchLatestEngineVersion("docling", "https://mirror.example/simple/"),
      "2.142.1",
    );
  });

  it("falls back to the newest prerelease when nothing is stable", async () => {
    global.fetch = (async () =>
      ({
        ok: true,
        text: async () =>
          '<a href="a">docling-2.143.0b2-py3-none-any.whl</a>' +
          '<a href="b">docling-2.143.0rc1-py3-none-any.whl</a>',
      }) as Response) as typeof fetch;
    assert.equal(
      await fetchLatestEngineVersion("docling", "https://mirror.example/simple/"),
      "2.143.0rc1",
    );
    assert.equal(isStableVersion("2.143.0rc1"), false);
    assert.equal(isStableVersion("2.143.0"), true);
  });
});

describe("engine operations: uv argv (fake uv on PATH)", () => {
  let binDir: string;
  let captureFile: string;
  const originalPath = process.env.PATH;

  const capturedArgs = async (): Promise<string[]> => {
    const raw = await readFile(captureFile, "utf8");
    return raw.split("\n").filter((line) => line.length > 0);
  };

  before(async () => {
    binDir = await mkdtemp(join(tmpdir(), "fe-uvbin-"));
    captureFile = join(binDir, "captured.txt");
    const uv = join(binDir, "uv");
    await writeFile(
      uv,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${captureFile}"\necho ok\n`,
    );
    await chmod(uv, 0o755);
    process.env.PATH = `${binDir}:${process.env.PATH ?? ""}`;
  });

  after(async () => {
    process.env.PATH = originalPath;
    await rm(binDir, { recursive: true, force: true });
  });

  it("installs the latest release by default", async () => {
    await runMineruOperation("cli.install", {
      config: DEFAULT_MINERU_CONFIG,
      options: { version: "" },
      indexUrl: "",
    });
    assert.deepEqual(await capturedArgs(), ["tool", "install", "mineru"]);
  });

  it("pins a version and honors the configured mirror", async () => {
    await runMineruOperation("cli.install", {
      config: DEFAULT_MINERU_CONFIG,
      options: { version: "1.2.3" },
      indexUrl: "https://mirror.example/simple/",
    });
    assert.deepEqual(await capturedArgs(), [
      "tool",
      "install",
      "--index-url",
      "https://mirror.example/simple/",
      "mineru==1.2.3",
    ]);
  });

  it("rejects a version that is not a version", async () => {
    await assert.rejects(
      runMineruOperation("cli.install", {
        config: DEFAULT_MINERU_CONFIG,
        options: { version: "latest" },
        indexUrl: "",
      }),
      /does not look like a release version/,
    );
  });

  it("reinstalls with --reinstall", async () => {
    await runDoclingOperation("cli.reinstall", {
      config: {},
      options: { version: "" },
      indexUrl: "",
    });
    assert.deepEqual(await capturedArgs(), [
      "tool",
      "install",
      "--reinstall",
      "docling",
    ]);
  });

  it("updates with --upgrade and the mirror", async () => {
    await runDoclingOperation("cli.update", {
      config: {},
      options: {},
      indexUrl: "https://mirror.example/simple/",
    });
    assert.deepEqual(await capturedArgs(), [
      "tool",
      "install",
      "--upgrade",
      "--index-url",
      "https://mirror.example/simple/",
      "docling",
    ]);
  });

  it("uninstalls the tool", async () => {
    await runMineruOperation("cli.uninstall", {
      config: DEFAULT_MINERU_CONFIG,
      options: {},
      indexUrl: "",
    });
    assert.deepEqual(await capturedArgs(), ["tool", "uninstall", "mineru"]);
  });

  it("clears the model cache resolved from a fake mineru-kit", async () => {
    const modelsDir = join(binDir, "fake-models");
    await (await import("node:fs/promises")).mkdir(modelsDir, {
      recursive: true,
    });
    await (await import("node:fs/promises")).writeFile(
      join(modelsDir, "layout-model.bin"),
      "xx",
    );
    const kit = join(binDir, "mineru-kit");
    await (await import("node:fs/promises")).writeFile(
      kit,
      `#!/bin/sh\nprintf 'model.base_dir: ${modelsDir}\\n'\\necho "  pipeline-small: ready"\\n`,
    );
    await (await import("node:fs/promises")).chmod(kit, 0o755);

    await runMineruOperation("models.clear", {
      config: { ...DEFAULT_MINERU_CONFIG, kitCommand: kit },
      options: {},
      indexUrl: "",
    });
    const remaining = await (await import("node:fs/promises")).readdir(
      modelsDir,
    );
    assert.deepEqual(remaining, []);
  });
});

describe("engine operations: visibility conditions", () => {
  const base: AiTextEngineEnvironment = {
    engineId: "docling",
    checkedAt: new Date().toISOString(),
    status: "ready",
    version: "2.100.0",
    latestVersion: "2.142.0",
    updateAvailable: true,
    storage: {
      engineBytes: 1024,
      enginePath: "/uv/tools/docling",
      modelBytes: 2048,
      modelPath: "/cache/docling/models",
    },
    routes: [],
    components: [],
    recommendations: [],
    details: {},
  };

  it("shows update only when a newer release is known", () => {
    const op = { id: "cli.update", showWhen: "update-available" } as never;
    assert.equal(isAiTextEngineOperationVisible(op, base), true);
    assert.equal(
      isAiTextEngineOperationVisible(op, { ...base, updateAvailable: false }),
      false,
    );
    assert.equal(isAiTextEngineOperationVisible(op, null), false);
  });

  it("shows uninstall only when installed, clear only with models", () => {
    const uninstall = { id: "cli.uninstall", showWhen: "installed" } as never;
    const clear = { id: "models.clear", showWhen: "models-present" } as never;
    assert.equal(isAiTextEngineOperationVisible(uninstall, base), true);
    assert.equal(
      isAiTextEngineOperationVisible(uninstall, { ...base, version: null }),
      false,
    );
    assert.equal(isAiTextEngineOperationVisible(clear, base), true);
    assert.equal(
      isAiTextEngineOperationVisible(clear, {
        ...base,
        storage: { ...base.storage!, modelBytes: null },
      }),
      false,
    );
  });
});
