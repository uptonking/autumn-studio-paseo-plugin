import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_AI_TEXT_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  aiTextSettingsSchema,
  fileExplorerSettingsSchema,
  getAiTextSettings,
  isAiTextSupportedFormat,
  shouldAutoOpenAiTextSplit,
  toAutumnDocFolderSlug,
  withAiTextSettings,
} from "../shared/contracts.ts";
import {
  appendExtractedVersion,
  deleteExtractedVersion,
  readDocumentMetadata,
  selectActiveVersion,
} from "../server/ai-text/metadata-store.ts";
import {
  discoverAiTextAgents,
  listRegisteredDocumentParsers,
  registerDocumentParser,
  runAiTextExtractionPipeline,
} from "../server/ai-text/parser-registry.ts";
import {
  extractLocalDocumentFallback,
} from "../server/ai-text/mineru-adapter.ts";
import {
  formatLayoutPdfTextToMarkdown,
  formatVisionOcrLinesToMarkdown,
} from "../server/ai-text/pdf-local-ocr.ts";
import { scanWorkspaceTree } from "../server/scan.ts";

describe("ai-text: settings schema and format helpers", () => {
  it("provides sensible defaults with MinerU free cloud API and pi agent", () => {
    const parsed = fileExplorerSettingsSchema.parse({});
    assert.equal(parsed.aiText.enabled, true);
    assert.equal(parsed.aiText.openSplitViewByDefault, false);
    assert.equal(parsed.aiText.defaultAgent, "pi");
    assert.equal(parsed.aiText.useAgentRefinement, true);
    assert.equal(parsed.aiText.defaultParser, "mineru");
    assert.equal(parsed.aiText.mineru.mode, "cloud-free");
    assert.equal(parsed.aiText.mineru.enableOcr, true);
    assert.equal(parsed.aiText.mineru.enableFormula, true);
    assert.equal(parsed.aiText.mineru.enableTable, true);
    assert.equal(aiTextSettingsSchema.parse({}).openSplitViewByDefault, false);
  });

  it("updates AI Text settings immutably via withAiTextSettings", () => {
    const updated = withAiTextSettings(DEFAULT_FILE_EXPLORER_SETTINGS, {
      enabled: false,
      defaultAgent: "claude",
      defaultParser: "agent-vlm",
      mineru: {
        ...DEFAULT_AI_TEXT_SETTINGS.mineru,
        mode: "local-cli",
      },
    });
    const aiText = getAiTextSettings(updated);
    assert.equal(aiText.enabled, false);
    assert.equal(aiText.defaultAgent, "claude");
    assert.equal(aiText.defaultParser, "agent-vlm");
    assert.equal(aiText.mineru.mode, "local-cli");
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
  });

  it("auto-opens the split only for an enabled default with cached content", () => {
    const metadata = {
      schemaVersion: 1 as const,
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
          provenance: {
            parserId: "mineru" as const,
            parserLabel: "MinerU",
            agentId: "pi",
            usedAgentRefinement: true,
          },
        },
      ],
    };

    const base = {
      openSplitViewByDefault: true,
      metadata,
      activeContent: "# Paper",
      filePath: "docs/paper.pdf",
      lastAutoOpenedFilePath: null,
    };

    assert.equal(shouldAutoOpenAiTextSplit(base), true);
    assert.equal(
      shouldAutoOpenAiTextSplit({ ...base, openSplitViewByDefault: false }),
      false,
    );
    assert.equal(
      shouldAutoOpenAiTextSplit({ ...base, metadata: null }),
      false,
    );
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
});

describe("ai-text: .autumn/ multi-version metadata store & workspace scan", () => {
  let tempDir: string;

  before(async () => {
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
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU (Free Cloud API)",
        parserMode: "cloud-free",
        agentId: "pi",
        agentModel: "pi/default",
        usedAgentRefinement: false,
        ocrEnabled: true,
        formulaEnabled: true,
        tableEnabled: true,
        language: "auto",
      },
    });

    assert.equal(v1Result.newVersion.versionNumber, 1);
    assert.equal(v1Result.metadata.versions.length, 1);
    assert.equal(v1Result.metadata.activeVersionId, v1Result.newVersion.id);
    assert.ok(
      v1Result.newVersion.relPath.startsWith(".autumn/docs__paper.pdf/"),
    );

    const v2Result = await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceSize: 42,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Paper v2\n\nRe-parsed with AI text again (claude).",
      durationMs: 510,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU (Free Cloud API)",
        parserMode: "cloud-free",
        agentId: "claude",
        agentModel: "claude/sonnet",
        usedAgentRefinement: true,
        ocrEnabled: true,
        formulaEnabled: true,
        tableEnabled: true,
        language: "auto",
      },
    });

    assert.equal(v2Result.newVersion.versionNumber, 2);
    assert.equal(v2Result.metadata.versions.length, 2);
    assert.equal(v2Result.metadata.activeVersionId, v2Result.newVersion.id);
    assert.equal(v2Result.metadata.versions[0].versionNumber, 2);
    assert.equal(v2Result.metadata.versions[1].versionNumber, 1);

    // Switch back to version 1
    const switched = await selectActiveVersion(
      tempDir,
      "docs/paper.pdf",
      v1Result.newVersion.id,
    );
    assert.equal(switched.metadata.activeVersionId, v1Result.newVersion.id);
    assert.equal(switched.activeVersion?.versionNumber, 1);
    assert.ok(switched.content?.includes("# Paper v1"));

    // Verify metadata.json is persisted on disk
    const rawMeta = JSON.parse(
      await readFile(
        join(tempDir, ".autumn", "docs__paper.pdf", "metadata.json"),
        "utf8",
      ),
    );
    assert.equal(rawMeta.activeVersionId, v1Result.newVersion.id);
    assert.equal(rawMeta.versions.length, 2);
    assert.equal(v1Result.newVersion.provenance.headingCount, 1);

    // Delete v1 and verify v2 becomes active automatically
    const afterDeleteV1 = await deleteExtractedVersion(
      tempDir,
      "docs/paper.pdf",
      v1Result.newVersion.id,
    );
    assert.equal(afterDeleteV1.metadata?.versions.length, 1);
    assert.equal(afterDeleteV1.activeVersion?.id, v2Result.newVersion.id);
    assert.ok(afterDeleteV1.content?.includes("# Paper v2"));

    // Restore v1 so subsequent scanWorkspaceTree test sees .autumn/docs__paper.pdf
    await appendExtractedVersion({
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/paper.pdf",
      sourceSize: 42,
      sourceMtimeMs: 1700000000000,
      markdownContent: "# Paper v3\n\nRestored version.",
      durationMs: 310,
      provenance: {
        parserId: "mineru",
        parserLabel: "MinerU (Free Cloud API)",
        parserMode: "cloud-free",
        agentId: "pi",
        agentModel: "pi/default",
        usedAgentRefinement: false,
      },
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

  it("discovers agents with pi as default and runs extensible extraction pipeline", async () => {
    const parsers = listRegisteredDocumentParsers();
    const parserIds = parsers.map((p) => p.id);
    assert.ok(parserIds.includes("mineru"));
    assert.ok(parserIds.includes("agent-vlm"));
    assert.ok(parserIds.includes("llamaparse"));
    assert.ok(parserIds.includes("azure-document-intelligence"));
    assert.ok(parserIds.includes("datalab"));

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
    assert.ok(agentDiscovery.some((a) => a.id === "claude"));

    // Register a custom parser behaviour and run the pipeline on HTML
    registerDocumentParser({
      id: "datalab",
      label: "Datalab Marker (Test)",
      supportedFormats: ["pdf", "docx", "html"],
      parse: async ({ sourceRelPath }) => ({
        markdown: `# Custom Datalab Output for ${sourceRelPath}\n\nRevenue grew 42%.`,
        parserMode: "test-stub",
      }),
    });

    const pipelineResult = await runAiTextExtractionPipeline({
      paseo: fakePaseo,
      workspaceId: "ws-1",
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/article.html",
      sourceAbsPath: join(tempDir, "docs", "article.html"),
      settings: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        defaultParser: "datalab",
        defaultAgent: "pi",
        useAgentRefinement: false,
      },
    });
    assert.equal(pipelineResult.newVersion.versionNumber, 1);
    assert.equal(pipelineResult.newVersion.provenance.parserId, "datalab");
    assert.equal(pipelineResult.newVersion.provenance.agentId, "pi");
    assert.ok(pipelineResult.content.includes("Revenue grew 42%."));

    // Verify per-run parserIdOverride and agentIdOverride
    const overrideResult = await runAiTextExtractionPipeline({
      paseo: fakePaseo,
      workspaceId: "ws-1",
      workspaceRootPath: tempDir,
      sourceRelPath: "docs/article.html",
      sourceAbsPath: join(tempDir, "docs", "article.html"),
      settings: {
        ...DEFAULT_AI_TEXT_SETTINGS,
        defaultParser: "mineru",
        defaultAgent: "pi",
        useAgentRefinement: false,
      },
      parserIdOverride: "datalab",
      agentIdOverride: "claude",
    });
    assert.equal(overrideResult.newVersion.versionNumber, 2);
    assert.equal(overrideResult.newVersion.provenance.parserId, "datalab");
    assert.equal(overrideResult.newVersion.provenance.agentId, "claude");
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
    header.writeUInt16LE(0, 8); // stored (uncompressed)
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
