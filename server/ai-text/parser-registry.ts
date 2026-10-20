import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  AI_TEXT_PARSER_CATALOG,
  type AiTextDocumentMetadata,
  type AiTextParserProviderId,
  type AiTextSettings,
  type AiTextVersionProvenance,
  type AiTextVersionRecord,
} from "../../shared/contracts.ts";
import {
  discoverAiTextAgents,
  runAgentTextRefinement,
} from "./agent-runner.ts";
import { appendExtractedVersion } from "./metadata-store.ts";
import { parseWithExternalProvider } from "./document-extractors.ts";
import {
  extractLocalDocumentWithOcr,
  parseWithMineru,
} from "./mineru-adapter.ts";

export interface DocumentParserContext {
  workspaceId: string;
  workspaceRootPath: string;
  sourceRelPath: string;
  sourceAbsPath: string;
  fileName: string;
  buffer: Buffer;
  settings: AiTextSettings;
  paseo: any;
  signal?: AbortSignal;
}

export interface DocumentParserOutput {
  markdown: string;
  parserMode?: string;
}

export interface DocumentParserAdapter {
  id: AiTextParserProviderId;
  label: string;
  supportedFormats: readonly string[];
  parse(ctx: DocumentParserContext): Promise<DocumentParserOutput>;
}

const parserAdapters = new Map<AiTextParserProviderId, DocumentParserAdapter>();

export function registerDocumentParser(adapter: DocumentParserAdapter): void {
  parserAdapters.set(adapter.id, adapter);
}

export function getDocumentParser(
  id: AiTextParserProviderId,
): DocumentParserAdapter | undefined {
  return parserAdapters.get(id) ?? parserAdapters.get("mineru");
}

export function listRegisteredDocumentParsers(): DocumentParserAdapter[] {
  return [...parserAdapters.values()];
}

registerDocumentParser({
  id: "mineru",
  label: "MinerU",
  supportedFormats: ["pdf", "docx", "html"],
  parse: async (ctx) => {
    const res = await parseWithMineru({
      filePath: ctx.sourceAbsPath,
      fileName: ctx.fileName,
      buffer: ctx.buffer,
      settings: ctx.settings.mineru,
      signal: ctx.signal,
    });
    return {
      markdown: res.markdown,
      parserMode: res.modeUsed,
    };
  },
});

registerDocumentParser({
  id: "agent-vlm",
  label: "Agent VLM / OCR Direct",
  supportedFormats: ["pdf", "docx", "html"],
  parse: async (ctx) => {
    const localRes = await extractLocalDocumentWithOcr({
      filePath: ctx.sourceAbsPath,
      fileName: ctx.fileName,
      buffer: ctx.buffer,
      enableOcr: ctx.settings.mineru.enableOcr,
      enableTable: ctx.settings.mineru.enableTable,
      signal: ctx.signal,
    });
    return {
      markdown: localRes.markdown,
      parserMode: `vlm-${localRes.modeUsed}`,
    };
  },
});

for (const externalId of [
  "llamaparse",
  "azure-document-intelligence",
  "datalab",
] as const) {
  const catalogMeta = AI_TEXT_PARSER_CATALOG.find((c) => c.id === externalId);
  registerDocumentParser({
    id: externalId,
    label: catalogMeta?.label ?? externalId,
    supportedFormats: catalogMeta?.supportedFormats ?? ["pdf", "docx"],
    parse: async (ctx) => {
      const fallbackRes = await extractLocalDocumentWithOcr({
        filePath: ctx.sourceAbsPath,
        fileName: ctx.fileName,
        buffer: ctx.buffer,
        enableOcr: ctx.settings.mineru.enableOcr,
        enableTable: ctx.settings.mineru.enableTable,
        signal: ctx.signal,
      });
      return await parseWithExternalProvider({
        parserId: externalId,
        fileName: ctx.fileName,
        buffer: ctx.buffer,
        settings: ctx.settings,
        fallbackMarkdown: fallbackRes.markdown,
        signal: ctx.signal,
      });
    },
  });
}

export async function runAiTextExtractionPipeline(input: {
  paseo: any;
  workspaceId: string;
  workspaceRootPath: string;
  sourceRelPath: string;
  sourceAbsPath: string;
  settings: AiTextSettings;
  parserIdOverride?: AiTextParserProviderId;
  agentIdOverride?: string;
  signal?: AbortSignal;
}): Promise<{
  metadata: AiTextDocumentMetadata;
  newVersion: AiTextVersionRecord;
  content: string;
}> {
  const startTime = Date.now();
  const [fileStats, buffer] = await Promise.all([
    stat(input.sourceAbsPath),
    readFile(input.sourceAbsPath),
  ]);
  const fileName = basename(input.sourceAbsPath);
  const selectedParserId =
    input.parserIdOverride ?? input.settings.defaultParser;
  const parserAdapter =
    getDocumentParser(selectedParserId) ?? getDocumentParser("mineru")!;

  const parsed = await parserAdapter.parse({
    workspaceId: input.workspaceId,
    workspaceRootPath: input.workspaceRootPath,
    sourceRelPath: input.sourceRelPath,
    sourceAbsPath: input.sourceAbsPath,
    fileName,
    buffer,
    settings: input.settings,
    paseo: input.paseo,
    signal: input.signal,
  });

  const agentId =
    (
      input.agentIdOverride ||
      input.settings.defaultAgent ||
      "pi"
    ).trim() || "pi";
  const shouldRunAgent =
    input.settings.useAgentRefinement ||
    parserAdapter.id === "agent-vlm";

  let finalMarkdown = parsed.markdown;
  let agentModel: string | undefined = `${agentId}/default`;
  if (shouldRunAgent) {
    const refined = await runAgentTextRefinement({
      paseo: input.paseo,
      workspaceId: input.workspaceId,
      workspaceRootPath: input.workspaceRootPath,
      sourceRelPath: input.sourceRelPath,
      agentId,
      initialMarkdown: parsed.markdown,
    });
    finalMarkdown = refined.markdown;
    agentModel = refined.agentModel;
  }

  const durationMs = Math.max(1, Date.now() - startTime);
  const provenance: AiTextVersionProvenance = {
    parserId: parserAdapter.id,
    parserLabel: parserAdapter.label,
    parserMode: parsed.parserMode,
    agentId,
    agentModel,
    usedAgentRefinement: shouldRunAgent,
    ocrEnabled: input.settings.mineru.enableOcr,
    formulaEnabled: input.settings.mineru.enableFormula,
    tableEnabled: input.settings.mineru.enableTable,
    language: input.settings.mineru.language,
  };

  return await appendExtractedVersion({
    workspaceRootPath: input.workspaceRootPath,
    sourceRelPath: input.sourceRelPath,
    sourceSize: fileStats.size,
    sourceMtimeMs: fileStats.mtimeMs,
    markdownContent: finalMarkdown,
    durationMs,
    provenance,
    outputRootDir: input.settings.outputRootDir,
  });
}

export { discoverAiTextAgents };
