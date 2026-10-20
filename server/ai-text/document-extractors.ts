import { inflateRawSync } from "node:zlib";
import {
  getExternalParserConfig,
  type AiTextParserProviderId,
  type AiTextSettings,
} from "../../shared/contracts.ts";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readZipEntryFromBuffer(
  zipBuffer: Buffer,
  targetEntryName: string,
): Buffer | null {
  // Scan Central Directory headers (0x02014b50) first for reliable sizes
  let offset = 0;
  while (offset + 46 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig === 0x02014b50) {
      const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
      const compressedSize = zipBuffer.readUInt32LE(offset + 20);
      const nameLen = zipBuffer.readUInt16LE(offset + 28);
      const extraLen = zipBuffer.readUInt16LE(offset + 30);
      const commentLen = zipBuffer.readUInt16LE(offset + 32);
      const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
      const entryName = zipBuffer
        .subarray(offset + 46, offset + 46 + nameLen)
        .toString("utf8");
      if (
        entryName === targetEntryName &&
        localHeaderOffset + 30 <= zipBuffer.length
      ) {
        const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd <= zipBuffer.length) {
          const slice = zipBuffer.subarray(dataStart, dataEnd);
          if (compressionMethod === 0) return slice;
          if (compressionMethod === 8) return inflateRawSync(slice);
        }
      }
      offset += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    offset += 1;
  }

  // Fallback: scan Local File Headers (0x04034b50) directly
  offset = 0;
  while (offset + 30 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLen + extraLen;
    const entryName = zipBuffer
      .subarray(offset + 30, offset + 30 + nameLen)
      .toString("utf8");
    const dataEnd = dataStart + compressedSize;
    if (entryName === targetEntryName && dataEnd <= zipBuffer.length) {
      const slice = zipBuffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return slice;
      if (compressionMethod === 8) return inflateRawSync(slice);
    }
    offset = dataEnd > offset ? dataEnd : offset + 30;
  }

  return null;
}

function extractParagraphText(pXml: string): string {
  const runs: string[] = [];
  for (const rMatch of pXml.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const rBody = rMatch[1] ?? "";
    const texts: string[] = [];
    for (const tMatch of rBody.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      if (tMatch[1]) texts.push(decodeXmlEntities(tMatch[1]));
    }
    const rawRun = texts.join("");
    if (!rawRun) continue;
    const isCode = /<w:rFonts[^>]+(?:Consolas|Courier|Menlo|Monaco|Monospace)/i.test(rBody);
    const isBold = /<w:b(?:\s+w:val="(?:true|1)"|\s*\/)>/i.test(rBody);
    const isItalic = /<w:i(?:\s+w:val="(?:true|1)"|\s*\/)>/i.test(rBody);
    const trimmed = rawRun.trim();
    if (!trimmed) {
      runs.push(rawRun);
      continue;
    }
    const lead = rawRun.startsWith(" ") ? " " : "";
    const trail = rawRun.endsWith(" ") ? " " : "";
    if (isCode) {
      runs.push(`${lead}\`${trimmed}\`${trail}`);
    } else if (isBold && isItalic) {
      runs.push(`${lead}***${trimmed}***${trail}`);
    } else if (isBold) {
      runs.push(`${lead}**${trimmed}**${trail}`);
    } else if (isItalic) {
      runs.push(`${lead}*${trimmed}*${trail}`);
    } else {
      runs.push(rawRun);
    }
  }

  if (runs.length === 0) {
    for (const match of pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      if (match[1]) runs.push(decodeXmlEntities(match[1]));
    }
  }

  const text = runs.join("").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const styleMatch = pXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i);
  const styleVal = (styleMatch?.[1] ?? "").toLowerCase();
  const cleanHeadingText = text.replace(/^\*\*([\s\S]+)\*\*$/, "$1");
  if (styleVal === "title" || styleVal === "heading1" || styleVal === "1") {
    return `# ${cleanHeadingText}`;
  }
  if (styleVal === "subtitle" || styleVal === "heading2" || styleVal === "2") {
    return `## ${cleanHeadingText}`;
  }
  if (styleVal === "heading3" || styleVal === "3") {
    return `### ${cleanHeadingText}`;
  }
  if (styleVal === "heading4" || styleVal === "4") {
    return `#### ${cleanHeadingText}`;
  }
  if (styleVal === "quote" || styleVal === "intensequote" || styleVal === "blockquote") {
    return `> ${text}`;
  }
  if (/<w:numPr[\s>]/i.test(pXml) || styleVal.includes("list")) {
    return `- ${text}`;
  }
  return text;
}

function extractTableMarkdown(tblXml: string): string {
  const rows: string[][] = [];
  for (const trMatch of tblXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
    const cells: string[] = [];
    for (const tcMatch of trMatch[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)) {
      const cellParagraphs: string[] = [];
      for (const pMatch of tcMatch[0].matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
        const text = extractParagraphText(pMatch[0]).replace(/^#+\s+/, "");
        if (text) cellParagraphs.push(text);
      }
      cells.push(cellParagraphs.join(" ").replace(/\|/g, "\\|") || " ");
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push(" ");
    return padded;
  });
  const header = `| ${normalized[0]!.join(" | ")} |`;
  const divider = `| ${normalized[0]!.map(() => "---").join(" | ")} |`;
  const body = normalized
    .slice(1)
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
  return body ? `${header}\n${divider}\n${body}` : `${header}\n${divider}`;
}

export function extractDocxMarkdownFromBuffer(
  buffer: Buffer,
  fileName: string,
): string | null {
  try {
    const xmlBuf = readZipEntryFromBuffer(buffer, "word/document.xml");
    if (!xmlBuf) return null;
    const xml = xmlBuf.toString("utf8");
    const blocks: string[] = [];

    // Tokenize top-level tables and paragraphs in document order
    const blockRegex = /(<w:tbl[\s>][\s\S]*?<\/w:tbl>)|(<w:p[\s>][\s\S]*?<\/w:p>)/g;
    for (const match of xml.matchAll(blockRegex)) {
      if (match[1]) {
        const tableMd = extractTableMarkdown(match[1]);
        if (tableMd) blocks.push(tableMd);
      } else if (match[2]) {
        const paraMd = extractParagraphText(match[2]);
        if (paraMd) blocks.push(paraMd);
      }
    }

    if (blocks.length === 0) return null;
    const hasHeading = blocks.some((b) => b.startsWith("# "));
    return hasHeading
      ? `${blocks.join("\n\n")}\n`
      : `# ${fileName}\n\n${blocks.join("\n\n")}\n`;
  } catch {
    return null;
  }
}

function stripInlineHtmlTags(raw: string): string {
  return decodeXmlEntities(
    raw
      .replace(/<(?:strong|b)(?:\s[^>]*)?>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
      .replace(/<(?:em|i)(?:\s[^>]*)?>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
      .replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function convertHtmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  for (const trMatch of tableHtml.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of trMatch[1]!.matchAll(/<t[hd](?:\s[^>]*)?>([\s\S]*?)<\/t[hd]>/gi)) {
      cells.push(stripInlineHtmlTags(cellMatch[1] ?? "").replace(/\|/g, "\\|") || " ");
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < colCount) copy.push(" ");
    return copy;
  });
  const header = `| ${padded[0]!.join(" | ")} |`;
  const sep = `| ${padded[0]!.map(() => "---").join(" | ")} |`;
  const body = padded
    .slice(1)
    .map((r) => `| ${r.join(" | ")} |`)
    .join("\n");
  return body ? `\n${header}\n${sep}\n${body}\n` : `\n${header}\n${sep}\n`;
}

export function extractHtmlMarkdownFromBuffer(
  buffer: Buffer,
  fileName: string,
): string {
  const html = buffer.toString("utf8");
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<table(?:\s[^>]*)?>[\s\S]*?<\/table>/gi, (m) =>
      convertHtmlTableToMarkdown(m),
    )
    .replace(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
      const cleanCode = decodeXmlEntities(inner.replace(/<[^>]+>/g, "")).trim();
      return cleanCode ? `\n\`\`\`\n${cleanCode}\n\`\`\`\n` : "";
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
      const hashes = "#".repeat(Number(level) || 2);
      return `\n${hashes} ${stripInlineHtmlTags(inner)}\n`;
    })
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) => {
      const text = stripInlineHtmlTags(inner);
      return text ? `\n> ${text}\n` : "";
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => {
      const text = stripInlineHtmlTags(inner);
      return text ? `\n- ${text}` : "";
    })
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner: string) => {
      const text = stripInlineHtmlTags(inner);
      return text ? `\n${text}\n` : "";
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!stripped) {
    return `# ${fileName}\n\n_No text content found in HTML document._\n`;
  }
  return stripped.startsWith("# ")
    ? `${stripped}\n`
    : `# ${fileName}\n\n${stripped}\n`;
}

export async function parseWithExternalProvider(input: {
  parserId: AiTextParserProviderId;
  fileName: string;
  buffer: Buffer;
  settings: AiTextSettings;
  fallbackMarkdown: string;
  signal?: AbortSignal;
}): Promise<{ markdown: string; parserMode: string }> {
  const cfg = getExternalParserConfig(input.settings, input.parserId);
  const apiKey = cfg.apiKey.trim();
  if (!apiKey) {
    return {
      markdown: input.fallbackMarkdown,
      parserMode: "local-fallback",
    };
  }

  try {
    if (input.parserId === "datalab") {
      const endpoint =
        cfg.endpointUrl.trim() || "https://www.datalab.to/api/v1/marker";
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(input.buffer)]),
        input.fileName,
      );
      form.append("output_format", "markdown");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: form,
        signal: input.signal,
      });
      if (res.ok) {
        const json = (await res.json()) as { markdown?: string };
        if (typeof json.markdown === "string" && json.markdown.trim()) {
          return { markdown: json.markdown, parserMode: "cloud-api" };
        }
      }
    } else if (input.parserId === "llamaparse") {
      const base = (
        cfg.endpointUrl.trim() || "https://api.cloud.llamaindex.ai"
      ).replace(/\/+$/, "");
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(input.buffer)]),
        input.fileName,
      );
      const res = await fetch(`${base}/api/v1/parsing/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: input.signal,
      });
      if (res.ok) {
        const json = (await res.json()) as { markdown?: string };
        if (typeof json.markdown === "string" && json.markdown.trim()) {
          return { markdown: json.markdown, parserMode: "cloud-api" };
        }
      }
    } else if (input.parserId === "azure-document-intelligence") {
      const endpoint = cfg.endpointUrl.trim().replace(/\/+$/, "");
      if (endpoint) {
        const res = await fetch(
          `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-02-29-preview&outputContentFormat=markdown`,
          {
            method: "POST",
            headers: {
              "Ocp-Apim-Subscription-Key": apiKey,
              "Content-Type": "application/octet-stream",
            },
            body: new Uint8Array(input.buffer),
            signal: input.signal,
          },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            analyzeResult?: { content?: string };
          };
          const content = json.analyzeResult?.content;
          if (typeof content === "string" && content.trim()) {
            return { markdown: content, parserMode: "cloud-api" };
          }
        }
      }
    }
  } catch {
    // Fall back to local extraction when offline or endpoint unreachable
  }

  return {
    markdown: input.fallbackMarkdown,
    parserMode: "local-fallback",
  };
}
