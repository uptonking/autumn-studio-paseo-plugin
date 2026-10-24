import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_AI_TEXT_EXTRACTION,
  DEFAULT_AI_TEXT_SETTINGS,
  type AiTextVersionProvenance,
} from "../shared/contracts.ts";
import {
  appendExtractedVersion,
  deleteExtractedVersion,
  readDocumentMetadata,
  selectActiveVersion,
} from "../server/ai-text/metadata-store.ts";
import { discoverAiTextAgents } from "../server/ai-text/agent-runner.ts";
import { registerLocalOcrEngine } from "../server/ai-text/engines/local-ocr/index.ts";
import { registerMineruEngine } from "../server/ai-text/engines/mineru/index.ts";
import { runAiTextPipeline } from "../server/ai-text/pipeline.ts";
import { extractLocalDocumentFallback } from "../server/ai-text/local-ocr-extractor.ts";
import {
  formatLayoutPdfTextToMarkdown,
  formatVisionOcrLinesToMarkdown,
} from "../server/ai-text/pdf-local-ocr.ts";
import { scanWorkspaceTree } from "../server/scan.ts";

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

describe("ai-text: .autumn/ multi-version metadata store & workspace scan", () => {
  let tempDir: string;

  before(async () => {
    registerLocalOcrEngine();
    registerMineruEngine();
    tempDir = await mkdtemp(join(tmpdir(), "paseo-ai-text-test-"));
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await writeFile(
      join(tempDir, "docs", "paper.pdf"),
      "%PDF-1.4\n(Hello AI Text Mode PDF) Tj\n%%EOF",
    );
    await writeFile(
      join(tempDir, "docs", "article.html"),
      "<html><body><h1>Quarterly Review</h1><p>Revenue grew 42%.</p></body></html>",
    );
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty metadata before any extraction has run", async () => {
    const initial = await readDocumentMetadata(tempDir, "docs/paper.pdf");
    assert.equal(initial.metadata, null);
    assert.equal(initial.activeContent, null);
  });

  it("stores multiple extracted versions in .autumn/<doc-slug>/ with provenance metadata and switches versions", async () => {
    const v1Result = await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceSize: 42,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Paper v1\n\nExtracted with MinerU and pi.",
      durationMs: 420,
      provenance: sampleProvenance({
        profileName: "MinerU · Auto",
        route: "cloud-free",
        refinement: {
          mode: "agent",
          agentId: "pi",
          model: "pi/default",
          promptPresetId: "faithful",
          didRun: true,
        },
      }),
    });

    assert.equal(v1Result.newVersion.versionNumber, 1);
    assert.equal(v1Result.metadata.versions.length, 1);
    assert.equal(v1Result.metadata.activeVersionId, v1Result.newVersion.id);
    assert.ok(
      v1Result.newVersion.relPath.startsWith(".autumn/docs__paper.pdf/"),
    );
    assert.match(v1Result.newVersion.id, /mineru-auto/);

    const v2Result = await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceSize: 42,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Paper v2\n\nRe-parsed with AI text again (claude).",
      durationMs: 510,
      provenance: sampleProvenance({
        profileId: "mineru-cloud",
        profileName: "MinerU · Cloud API",
        route: "cloud-token",
        refinement: {
          mode: "agent",
          agentId: "claude",
          model: "claude/sonnet",
          promptPresetId: "faithful",
          didRun: true,
        },
      }),
    });

    assert.equal(v2Result.newVersion.versionNumber, 2);
    assert.equal(v2Result.metadata.versions.length, 2);
    assert.equal(v2Result.metadata.activeVersionId, v2Result.newVersion.id);
    assert.equal(v2Result.metadata.versions[0].versionNumber, 2);
    assert.equal(v2Result.metadata.versions[1].versionNumber, 1);
    assert.match(v2Result.newVersion.id, /mineru-cloud/);

    const switched = await selectActiveVersion(
      tempDir,
      "docs/paper.pdf",
      v1Result.newVersion.id,
    );
    assert.equal(switched.metadata.activeVersionId, v1Result.newVersion.id);
    assert.equal(switched.activeVersion?.versionNumber, 1);
    assert.ok(switched.content?.includes("# Paper v1"));

    const rawMeta = JSON.parse(
      await readFile(
        join(tempDir, ".autumn", "docs__paper.pdf", "metadata.json"),
        "utf8",
      ),
    );
    assert.equal(rawMeta.schemaVersion, 2);
    assert.equal(rawMeta.activeVersionId, v1Result.newVersion.id);
    assert.equal(rawMeta.versions.length, 2);
    assert.equal(v1Result.newVersion.provenance.headingCount, 1);

    const afterDeleteV1 = await deleteExtractedVersion(
      tempDir,
      "docs/paper.pdf",
      v1Result.newVersion.id,
    );
    assert.equal(afterDeleteV1.metadata?.versions.length, 1);
    assert.equal(afterDeleteV1.activeVersion?.id, v2Result.newVersion.id);
    assert.ok(afterDeleteV1.content?.includes("# Paper v2"));

    await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceSize: 42,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Paper v3\n\nRestored version.",
      durationMs: 310,
      provenance: sampleProvenance(),
    });
  });

  it("includes .autumn/ folder and generated .md files in scanWorkspaceTree", async () => {
    const { tree } = await scanWorkspaceTree(tempDir);
    assert.equal(tree.kind, "folder");
    const autumnFolder = tree.children.find(
      (child) => child.kind === "folder" && child.name === ".autumn",
    );
    assert.ok(autumnFolder, ".autumn folder should be visible in workspace tree");
    if (autumnFolder.kind === "folder") {
      const slugFolder = autumnFolder.children.find(
        (child) => child.kind === "folder" && child.name === "docs__paper.pdf",
      );
      assert.ok(slugFolder, ".autumn/docs__paper.pdf subfolder should be visible");
    }
  });

  it("separates documents whose paths collide on one folder slug", async () => {
    const firstSource = "a/b.pdf";
    const secondSource = "a__b.pdf";
    const first = await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: firstSource,
      sourceSize: 10,
      sourceMtimeMs: 1,
      markdownContent: "# First\n",
      durationMs: 1,
      provenance: sampleProvenance(),
    });
    const second = await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: secondSource,
      sourceSize: 20,
      sourceMtimeMs: 2,
      markdownContent: "# Second\n",
      durationMs: 1,
      provenance: sampleProvenance(),
    });
    assert.notEqual(
      first.metadata.docFolderRelPath,
      second.metadata.docFolderRelPath,
    );
    const firstRead = await readDocumentMetadata(tempDir, firstSource);
    const secondRead = await readDocumentMetadata(tempDir, secondSource);
    assert.equal(firstRead.metadata?.versions.length, 1);
    assert.equal(secondRead.metadata?.versions.length, 1);
    assert.equal(await firstRead.activeContent, "# First\n");
    assert.equal(await secondRead.activeContent, "# Second\n");
  });

  it("serializes concurrent appends so no version is lost", async () => {
    const source = "docs/concurrent.pdf";
    await Promise.all(
      [1, 2, 3].map((index) =>
        appendExtractedVersion({
          workspaceRootPath: tempDir,
          sourceRelPath: source,
          sourceSize: index,
          sourceMtimeMs: index,
          markdownContent: `# Version ${index}\n`,
          durationMs: 1,
          provenance: sampleProvenance(),
        }),
      ),
    );
    const read = await readDocumentMetadata(tempDir, source);
    assert.equal(read.metadata?.versions.length, 3);
    assert.deepEqual(
      read.metadata?.versions
        .map((version) => version.versionNumber)
        .sort((a, b) => a - b),
      [1, 2, 3],
    );
    // Ids must differ even when the timestamps land in the same second.
    assert.equal(
      new Set(read.metadata?.versions.map((version) => version.id)).size,
      3,
    );
  });

  it("discovers agents with pi first and runs a profile through the pipeline", async () => {
    const fakePaseo = {
      providers: {
        waitForReady: async () => ({
          providers: [
            { id: "claude", available: true },
            { id: "codex", available: true },
          ],
        }),
      },
    } as never;

    const agentDiscovery = await discoverAiTextAgents(fakePaseo, tempDir);
    assert.equal(agentDiscovery[0]?.id, "pi");
    assert.equal(agentDiscovery[0]?.isDefault, true);
    assert.ok(agentDiscovery.some((agent) => agent.id === "claude"));

    const settings = {
      ...DEFAULT_AI_TEXT_SETTINGS,
      defaultProfileId: "local-ocr",
      profiles: [
        {
          id: "local-ocr",
          name: "Local text extraction",
          engineId: "local-ocr",
          route: "auto",
          config: {},
          extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, layout: false },
          refinement: {
            mode: "none" as const,
            agentId: "pi",
            model: "",
            promptPresetId: "faithful",
            prompt: "",
          },
        },
      ],
    };

    const pipelineResult = await runAiTextPipeline({
      paseo: fakePaseo,
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
      settings,
    });
    assert.equal(
      pipelineResult.newVersion.provenance.profileId,
      "local-ocr",
    );
    assert.equal(
      pipelineResult.newVersion.provenance.requestedEngineId,
      "local-ocr",
    );
    assert.equal(
      pipelineResult.newVersion.provenance.effectiveEngineId,
      "local-ocr",
    );
    assert.ok(pipelineResult.content.length > 0);

    const overrideResult = await runAiTextPipeline({
      paseo: fakePaseo,
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
      settings: {
        ...settings,
        profiles: [
          settings.profiles[0]!,
          {
            ...settings.profiles[0]!,
            id: "local-ocr-second",
            name: "Local second",
          },
        ],
      },
      profileId: "local-ocr-second",
    });
    assert.equal(
      overrideResult.newVersion.versionNumber,
      pipelineResult.newVersion.versionNumber + 1,
    );
    assert.equal(
      overrideResult.newVersion.provenance.profileId,
      "local-ocr-second",
    );

    await assert.rejects(
      runAiTextPipeline({
        paseo: fakePaseo,
        workspaceRootPath: tempDir,
        sourceRelPath: "docs/paper.pdf",
        sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
        settings,
        profileId: "missing-profile",
      }),
      /no longer exists/,
    );
  });

  it("falls back to local extraction when the profile engine fails", async () => {
    const settings = {
      ...DEFAULT_AI_TEXT_SETTINGS,
      defaultProfileId: "missing-mineru",
      profiles: [
        {
          id: "missing-mineru",
          name: "Missing MinerU",
          engineId: "mineru",
          route: "local-cli",
          config: { kitCommand: "paseo-test-mineru-kit-not-installed" },
          extraction: DEFAULT_AI_TEXT_EXTRACTION,
          refinement: {
            mode: "none" as const,
            agentId: "pi",
            model: "",
            promptPresetId: "faithful",
            prompt: "",
          },
        },
      ],
    };
    const result = await runAiTextPipeline({
      paseo: { providers: {} },
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
      settings,
    });
    assert.equal(result.newVersion.provenance.requestedEngineId, "mineru");
    assert.equal(result.newVersion.provenance.effectiveEngineId, "local-ocr");
    assert.match(
      result.newVersion.provenance.fallbackReason ?? "",
      /was not found/,
    );
    // Provenance must describe what ran, not what the profile requested.
    assert.equal(result.newVersion.provenance.extraction.layout, false);
    assert.equal(result.newVersion.provenance.extraction.formula, false);
    assert.equal(
      result.newVersion.provenance.extraction.imageAnalysis,
      false,
    );
    assert.ok(result.content.length > 0);
  });

  it("errors clearly when no profile is configured or the profile is invalid", async () => {
    await assert.rejects(
      runAiTextPipeline({
        paseo: { providers: {} },
        workspaceRootPath: tempDir,
        sourceRelPath: "docs/paper.pdf",
        sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
        settings: {
          ...DEFAULT_AI_TEXT_SETTINGS,
          defaultProfileId: "gone",
          profiles: [],
        },
      }),
      /No AI Text profiles are configured/,
    );

    const invalidProfile = {
      id: "broken-profile",
      name: "Broken profile",
      engineId: "local-ocr",
      route: "auto",
      config: {},
      extraction: { ...DEFAULT_AI_TEXT_EXTRACTION, pages: "1-2,abc" },
      refinement: {
        mode: "none" as const,
        agentId: "pi",
        model: "",
        promptPresetId: "faithful",
        prompt: "",
      },
    };
    await assert.rejects(
      runAiTextPipeline({
        paseo: { providers: {} },
        workspaceRootPath: tempDir,
        sourceRelPath: "docs/paper.pdf",
        sourceAbsPath: join(tempDir, "docs", "paper.pdf"),
        settings: {
          ...DEFAULT_AI_TEXT_SETTINGS,
          defaultProfileId: "broken-profile",
          profiles: [invalidProfile],
        },
      }),
      /is invalid:.*Page range/,
    );
  });

  it("rejects a file the selected engine cannot parse", async () => {
    await assert.rejects(
      runAiTextPipeline({
        paseo: { providers: {} },
        workspaceRootPath: tempDir,
        sourceRelPath: "docs/article.html",
        sourceAbsPath: join(tempDir, "docs", "article.html"),
        settings: {
          ...DEFAULT_AI_TEXT_SETTINGS,
          defaultProfileId: "local-ocr",
          profiles: [
            {
              id: "local-ocr",
              name: "Local text extraction",
              engineId: "local-ocr",
              route: "auto",
              config: {},
              extraction: DEFAULT_AI_TEXT_EXTRACTION,
              refinement: {
                mode: "none" as const,
                agentId: "pi",
                model: "",
                promptPresetId: "faithful",
                prompt: "",
              },
            },
          ],
        },
      }),
      /does not support html files/,
    );
  });

  it("extracts structured Markdown (headings, lists, quotes, bold/code runs, and tables) from .docx and .html buffers", () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<w:document><w:body>",
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Review</w:t></w:r></w:p>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Executive</w:t></w:r><w:r><w:t> summary paragraph.</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First milestone completed</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>Key takeaway quote</w:t></w:r></w:p>',
      "<w:tbl>",
      "<w:tr><w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>",
      "<w:tr><w:tc><w:p><w:r><w:t>ARR</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>$12M</w:t></w:r></w:p></w:tc></w:tr>",
      "</w:tbl>",
      "</w:body></w:document>",
    ].join("");
    const entryName = Buffer.from("word/document.xml", "utf8");
    const payload = Buffer.from(xml, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(payload.length, 22);
    header.writeUInt16LE(entryName.length, 26);
    header.writeUInt16LE(0, 28);
    const docxBuffer = Buffer.concat([header, entryName, payload]);

    const markdown = extractLocalDocumentFallback(docxBuffer, "review.docx");
    assert.ok(markdown.includes("# Quarterly Review"));
    assert.ok(markdown.includes("**Executive** summary paragraph."));
    assert.ok(markdown.includes("- First milestone completed"));
    assert.ok(markdown.includes("> Key takeaway quote"));
    assert.ok(markdown.includes("| Metric | Value |"));
    assert.ok(markdown.includes("| ARR | $12M |"));

    const htmlBuf = Buffer.from(
      [
        "<html><body>",
        "<h1>System Spec</h1>",
        "<p>Supports <strong>MinerU</strong> and <code>pi</code> agent.</p>",
        "<ul><li>Fast OCR</li><li>Split view</li></ul>",
        "<table><tr><th>Engine</th><th>Mode</th></tr><tr><td>MinerU</td><td>cloud-free</td></tr></table>",
        "<pre><code>const ok = true;</code></pre>",
        "</body></html>",
      ].join(""),
      "utf8",
    );
    const htmlMd = extractLocalDocumentFallback(htmlBuf, "spec.html");
    assert.ok(htmlMd.includes("# System Spec"));
    assert.ok(htmlMd.includes("Supports **MinerU** and `pi` agent."));
    assert.ok(htmlMd.includes("- Fast OCR"));
    assert.ok(htmlMd.includes("| Engine | Mode |"));
    assert.ok(htmlMd.includes("| MinerU | cloud-free |"));
    assert.ok(htmlMd.includes("```\nconst ok = true;\n```"));
  });

  it("formats layout-preserved PDF text with multi-column tables and Vision OCR CJK lines into Markdown", () => {
    const sampleLayout = [
      "6   ❘ CHAPTER 1   WHAT IS JAVASCRIPT?",
      "",
      "      By 2008, the five major web browsers complied with the third edition of ECMA-262.",
      "",
      "        BROWSER                                               ECMASCRIPT COMPLIANCE",
      "",
      "        Netscape Navigator 2                                  —",
      "",
      "        Netscape Navigator 4.06–4.79                          Edition 1",
      "",
      "        Firefox 1.0–2.0                                       Edition 3",
    ].join("\n");

    const tableMd = formatLayoutPdfTextToMarkdown(
      sampleLayout,
      "pro-js-1page-table.pdf",
      true,
    );
    assert.ok(tableMd.includes("## CHAPTER 1 — WHAT IS JAVASCRIPT?"));
    assert.ok(tableMd.includes("| BROWSER | ECMASCRIPT COMPLIANCE |"));
    assert.ok(tableMd.includes("| Netscape Navigator 4.06–4.79 | Edition 1 |"));

    const ocrMd = formatVisionOcrLinesToMarkdown(
      [
        { page: 1, text: "鲁 迅论《红楼梦》", x: 0.35, y: 0.88, w: 0.3, h: 0.03 },
        {
          page: 1,
          text: "贾府上的焦大，也不爱林妹妹的。",
          x: 0.12,
          y: 0.72,
          w: 0.75,
          h: 0.02,
        },
        {
          page: 1,
          text: "《二心集。“硬译”与“文学 阶级性”》",
          x: 0.42,
          y: 0.65,
          w: 0.45,
          h: 0.02,
        },
      ],
      "红楼梦研究资料选辑_1974_鲁迅_page1.pdf",
    );
    assert.ok(ocrMd.includes("## 鲁迅论《红楼梦》"));
    assert.ok(ocrMd.includes("贾府上的焦大，也不爱林妹妹的。"));
    assert.ok(ocrMd.includes("> — 《二心集·“硬译”与“文学阶级性”》"));
  });
});
