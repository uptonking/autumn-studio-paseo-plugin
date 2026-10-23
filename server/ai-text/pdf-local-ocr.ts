import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { execCommand } from "@getpaseo/plugin/server";
import {
  formatVisionOcrLinesToMarkdown,
  type VisionOcrLine,
} from "./pdf-vision-layout.ts";
import {
  extractCleanCodeBlocksFromPdfText,
  formatLayoutPdfTextToMarkdown,
  formatTwoColumnLayoutPageToMarkdown,
  isDefectiveEmbeddedPdfText,
  isGarbledPdfText,
} from "./pdf-two-column-layout.ts";

export {
  extractCleanCodeBlocksFromPdfText,
  formatLayoutPdfTextToMarkdown,
  formatTwoColumnLayoutPageToMarkdown,
  formatVisionOcrLinesToMarkdown,
  isDefectiveEmbeddedPdfText,
  isGarbledPdfText,
  type VisionOcrLine,
};

export interface LocalPdfExtractionResult {
  markdown: string;
  modeUsed: string;
}

const PDFTOTEXT_CANDIDATES = [
  "/opt/homebrew/bin/pdftotext",
  "/usr/local/bin/pdftotext",
  "/usr/bin/pdftotext",
  "pdftotext",
];

/**
 * A multi-page scan can need several regional Vision passes (full page, then
 * each detected column or sidebar), so 35s was not enough for dense scans.
 */
const VISION_OCR_TIMEOUT_MS = 120_000;

async function findExecutable(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate.startsWith("/")) return candidate;
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

const MACOS_VISION_SWIFT_SOURCE = `
import Foundation
import PDFKit
import Vision
import AppKit

func runOcr(_ cgImg: CGImage, langs: [String], roi: CGRect) -> [VNRecognizedTextObservation] {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = true
  req.recognitionLanguages = langs
  req.regionOfInterest = roi
  try? VNImageRequestHandler(cgImage: cgImg, options: [:]).perform([req])
  return req.results ?? []
}

let args = CommandLine.arguments
guard args.count > 1, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { exit(1) }
var output: [[String: Any]] = []
let fullRoi = CGRect(x: 0, y: 0, width: 1, height: 1)

for pageIdx in 0..<doc.pageCount {
  guard let page = doc.page(at: pageIdx) else { continue }
  let rect = page.bounds(for: .mediaBox)
  let scale: CGFloat = 3.0
  let w = max(Int(rect.width * scale), 1), h = max(Int(rect.height * scale), 1)
  guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
        let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  guard let cgImg = ctx.makeImage() else { continue }

  let defaultLangs = ["zh-Hans", "zh-Hant", "en-US", "ja-JP", "ko-KR"]
  let pass1 = runOcr(cgImg, langs: defaultLangs, roi: fullRoi)
  var cjkCount = 0, latinCount = 0
  for obs in pass1 {
    guard let s = obs.topCandidates(1).first?.string else { continue }
    for scalar in s.unicodeScalars {
      if scalar.value >= 0x4E00 && scalar.value <= 0x9FFF { cjkCount += 1 }
      else if (scalar.value >= 0x41 && scalar.value <= 0x5A) || (scalar.value >= 0x61 && scalar.value <= 0x7A) { latinCount += 1 }
    }
  }
  let langs = (cjkCount <= 3 && latinCount >= 40) ? ["en-US"] : defaultLangs

  var bestGutter: CGFloat = 0.50, bestSplitCount = 0, bestSpanCount = 0, bestCenteredSpan = 0
  for g in [CGFloat(0.46), 0.48, 0.50, 0.508, 0.52, 0.54] {
    var left = 0, right = 0, span = 0, centeredSpan = 0
    for obs in pass1 {
      let b = obs.boundingBox
      if b.maxX <= g + 0.008 { left += 1 }
      else if b.minX >= g - 0.008 { right += 1 }
      else if b.minX < g - 0.025 && b.maxX > g + 0.025 {
        span += 1
        if b.minX >= 0.22 && b.maxX <= 0.78 { centeredSpan += 1 }
      }
    }
    if left >= 6 && right >= 6 && (left + right) > bestSplitCount {
      bestSplitCount = left + right; bestSpanCount = span; bestCenteredSpan = centeredSpan; bestGutter = g
    }
  }

  var rMain = 0, rSide = 0, rSpan = 0, lMain = 0, lSide = 0, lSpan = 0
  for obs in pass1 {
    let b = obs.boundingBox
    if b.minX >= 0.08 && b.maxX <= 0.788 { rMain += 1 }
    else if b.minX >= 0.785 && b.maxX <= 0.96 { rSide += 1 }
    else if b.minX < 0.76 && b.maxX > 0.80 { rSpan += 1 }
    if b.minX >= 0.205 && b.maxX <= 0.92 { lMain += 1 }
    else if b.minX >= 0.03 && b.maxX <= 0.205 { lSide += 1 }
    else if b.minX < 0.19 && b.maxX > 0.23 { lSpan += 1 }
  }

  let isTwoCol = pass1.count >= 12 && bestSplitCount * 10 >= pass1.count * 7 && bestSpanCount <= max(2, pass1.count / 12) && bestCenteredSpan == 0
  let isRightSidebar = !isTwoCol && rMain >= 16 && rSide >= 4 && rSpan <= 3
  let isLeftSidebar = !isTwoCol && !isRightSidebar && lMain >= 16 && lSide >= 4 && lSpan <= 3

  if isTwoCol {
    let rois = [CGRect(x: 0, y: 0, width: bestGutter, height: 1), CGRect(x: bestGutter, y: 0, width: 1 - bestGutter, height: 1)]
    for (colIdx, roi) in rois.enumerated() {
      for obs in runOcr(cgImg, langs: langs, roi: roi) {
        if let top = obs.topCandidates(1).first {
          let b = obs.boundingBox
          output.append(["page": pageIdx + 1, "col": colIdx, "colCount": 2, "sidebar": 0, "text": top.string, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height])
        }
      }
    }
  } else if isRightSidebar || isLeftSidebar {
    let rois = isRightSidebar
      ? [CGRect(x: 0, y: 0, width: 0.785, height: 1), CGRect(x: 0.785, y: 0, width: 0.215, height: 1)]
      : [CGRect(x: 0.21, y: 0, width: 0.79, height: 1), CGRect(x: 0, y: 0, width: 0.21, height: 1)]
    for (colIdx, roi) in rois.enumerated() {
      for obs in runOcr(cgImg, langs: langs, roi: roi) {
        if let top = obs.topCandidates(1).first {
          let b = obs.boundingBox
          output.append(["page": pageIdx + 1, "col": colIdx, "colCount": 2, "sidebar": colIdx, "text": top.string, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height])
        }
      }
    }
  } else {
    let finalObs = (langs[0] == "en-US") ? runOcr(cgImg, langs: langs, roi: fullRoi) : pass1
    for obs in finalObs {
      if let top = obs.topCandidates(1).first {
        let b = obs.boundingBox
        output.append(["page": pageIdx + 1, "col": 0, "colCount": 1, "sidebar": 0, "text": top.string, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height])
      }
    }
  }
}
if let data = try? JSONSerialization.data(withJSONObject: output), let s = String(data: data, encoding: .utf8) { print(s) }
`;

let cachedVisionBinPromise: Promise<string | null> | null = null;

async function ensureMacosVisionBinary(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  if (cachedVisionBinPromise) return cachedVisionBinPromise;
  cachedVisionBinPromise = (async () => {
    const binPath = join(tmpdir(), "paseo-vision-ocr-bin-v5");
    try {
      await access(binPath);
      return binPath;
    } catch {
      // Compile once with swiftc
    }
    const srcPath = join(tmpdir(), `paseo-vision-ocr-v5-${process.pid}.swift`);
    try {
      await writeFile(srcPath, MACOS_VISION_SWIFT_SOURCE, "utf8");
      await execCommand("/usr/bin/swiftc", ["-O", srcPath, "-o", binPath], { timeout: 45_000 });
      return binPath;
    } catch {
      cachedVisionBinPromise = null;
      return null;
    } finally {
      await rm(srcPath, { force: true }).catch(() => undefined);
    }
  })();
  return cachedVisionBinPromise;
}

async function runMacosVisionOcr(
  pdfPath: string,
  fileName: string,
  cleanCodeBlocks: readonly string[] = [],
  signal?: AbortSignal,
): Promise<string | null> {
  const binPath = await ensureMacosVisionBinary();
  if (!binPath) return null;
  try {
    const res = await execCommand(binPath, [pdfPath], {
      timeout: VISION_OCR_TIMEOUT_MS,
      signal,
    });
    const stdout = res.stdout.trim();
    if (!stdout.startsWith("[")) return null;
    const parsed = JSON.parse(stdout) as VisionOcrLine[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return formatVisionOcrLinesToMarkdown(parsed, fileName, cleanCodeBlocks);
  } catch {
    return null;
  }
}

const MAC_ROMAN_HIGH_BYTES: Record<number, string> = {
  0x80: "Ä", 0x81: "Å", 0x82: "Ç", 0x83: "É", 0x84: "Ñ", 0x85: "Ö", 0x86: "Ü",
  0x8e: "é", 0x92: "’", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—", 0xa5: "•",
  0xa8: "®", 0xa9: "©", 0xd0: "–", 0xd1: "—", 0xd2: "“", 0xd3: "”", 0xd4: "‘", 0xd5: "’",
};

export function decodePdfLiteralString(raw: string): string {
  const unescaped = raw
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
  let decoded = "";
  for (let i = 0; i < unescaped.length; i++) {
    decoded += MAC_ROMAN_HIGH_BYTES[unescaped.charCodeAt(i)] ?? unescaped[i];
  }
  return decoded;
}

export function extractPdfStreamsPureJs(buffer: Buffer, fileName: string): string | null {
  if (buffer.byteLength > 512 * 1024) return null;
  const rawLatin1 = buffer.toString("latin1");
  const extractStream = (streamText: string): string[] => {
    const fragments: string[] = [];
    for (const match of streamText.matchAll(/\((?:\\.|[^\\()]){1,1000}\)\s*Tj/g)) {
      const token = match[0];
      const openIdx = token.indexOf("(");
      const closeIdx = token.lastIndexOf(")");
      if (openIdx >= 0 && closeIdx > openIdx) {
        const text = decodePdfLiteralString(token.slice(openIdx + 1, closeIdx)).trim();
        if (text) fragments.push(text);
      }
    }
    for (const match of streamText.matchAll(/\[((?:\\.|[^\\\]]){1,2000})\]\s*TJ/g)) {
      const inner = match[1] ?? "";
      const parts: string[] = [];
      for (const sub of inner.matchAll(/\((?:\\.|[^\\()]){1,500}\)/g)) {
        parts.push(decodePdfLiteralString(sub[0].slice(1, -1)));
      }
      const joined = parts.join("").trim();
      if (joined) fragments.push(joined);
    }
    return fragments;
  };

  const collected = [...extractStream(rawLatin1)];
  for (const match of rawLatin1.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = match[1];
    if (!body) continue;
    try {
      const inflated = inflateSync(Buffer.from(body, "latin1")).toString("latin1");
      collected.push(...extractStream(inflated));
    } catch {
      // Non-zlib stream
    }
  }
  const lines = collected.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length === 0 || isDefectiveEmbeddedPdfText(lines.join("\n"), fileName)) return null;
  return [`# ${fileName}`, "", ...lines.map((line) => `${line}\n`)].join("\n");
}

export async function extractPdfWithPopplerAndVision(input: {
  filePath?: string;
  fileName: string;
  buffer: Buffer;
  enableOcr?: boolean;
  enableTable?: boolean;
  signal?: AbortSignal;
}): Promise<LocalPdfExtractionResult | null> {
  let tempDir: string | null = null;
  let pdfPath = input.filePath;
  try {
    if (pdfPath) {
      try {
        await access(pdfPath);
      } catch {
        pdfPath = undefined;
      }
    }
    if (!pdfPath) {
      tempDir = await mkdtemp(join(tmpdir(), "paseo-pdf-local-"));
      pdfPath = join(tempDir, input.fileName || "document.pdf");
      await writeFile(pdfPath, input.buffer);
    }

    let salvagedCodeBlocks: string[] = [];
    const pdftotextBin = await findExecutable(PDFTOTEXT_CANDIDATES);
    if (pdftotextBin) {
      try {
        const res = await execCommand(
          pdftotextBin,
          ["-layout", "-enc", "UTF-8", pdfPath, "-"],
          { timeout: 15_000, signal: input.signal },
        );
        const rawText = res.stdout ?? "";
        if (rawText.replace(/\f/g, "").trim().length >= 20) {
          if (isDefectiveEmbeddedPdfText(rawText, input.fileName)) {
            salvagedCodeBlocks = extractCleanCodeBlocksFromPdfText(rawText);
          } else {
            return {
              markdown: formatLayoutPdfTextToMarkdown(
                rawText,
                input.fileName,
                input.enableTable !== false,
              ),
              modeUsed: "local-pdftotext",
            };
          }
        }
      } catch {
        // Fall through to pure-JS stream or Vision OCR
      }
    }

    const pureJsText = extractPdfStreamsPureJs(input.buffer, input.fileName);
    if (pureJsText) {
      return { markdown: pureJsText, modeUsed: "local-pdf-stream" };
    }

    if (input.enableOcr !== false) {
      const visionMd = await runMacosVisionOcr(
        pdfPath,
        input.fileName,
        salvagedCodeBlocks,
        input.signal,
      );
      if (visionMd) {
        return { markdown: visionMd, modeUsed: "local-vision-ocr" };
      }
    }
    return null;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
