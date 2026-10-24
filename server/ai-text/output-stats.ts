import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  normalizeAiTextDocumentMetadata,
  type AiTextDocumentMetadata,
} from "../../shared/contracts.ts";
import { computeDirectorySize } from "./disk.ts";
import {
  METADATA_FILE_NAME,
  resolveOutputBase,
  type OutputBase,
} from "./metadata-paths.ts";

const MAX_DOCS = 500;
const PER_DOC_SIZE_ENTRY_CAP = 5_000;

export interface AiTextStorageStatsRow {
  sourceRelPath: string;
  /** Doc folder path relative to the output base (reveal key). */
  docFolderRelPath: string;
  /** Absolute doc folder path for display. */
  docFolderDisplayPath: string;
  versionCount: number;
  activeVersionId: string | null;
  totalBytes: number;
  markdownBytes: number;
  assetBytes: number;
  lastParsedAt: string | null;
  engines: string[];
}

export interface AiTextStorageStats {
  outputRootDisplayPath: string;
  generatedAt: string;
  truncated: boolean;
  rows: AiTextStorageStatsRow[];
}

/**
 * Recomputes storage per document under the output root on demand — there is
 * deliberately no cache, so Refresh in the UI always re-runs this walk.
 */
export async function listAiTextStorageStats(input: {
  workspaceRootPath: string;
  workspaceId?: string;
  outputRootDir?: string;
}): Promise<AiTextStorageStats> {
  const base: OutputBase = resolveOutputBase(
    input.workspaceRootPath,
    input.outputRootDir,
    input.workspaceId,
  );
  const rows: AiTextStorageStatsRow[] = [];
  let truncated = false;

  const entries = await readdir(base.docRootAbsPath).catch(() => [] as string[]);
  for (const slug of entries.sort()) {
    if (rows.length >= MAX_DOCS) {
      truncated = true;
      break;
    }
    const docFolderAbsPath = join(base.docRootAbsPath, slug);
    const metadata = await readDocMetadata(join(docFolderAbsPath, METADATA_FILE_NAME));
    if (!metadata) continue; // not a doc folder, or unreadable metadata

    // totalBytes re-walks the disk (truth); markdown/asset bytes come from
    // the recorded version refs (history), so externally deleted files show
    // up as a gap between the two rather than crashing the walk.
    const [totalBytes, markdownBytes, assetBytes] = await Promise.all([
      computeDirectorySize(docFolderAbsPath, {
        maxEntries: PER_DOC_SIZE_ENTRY_CAP,
      }),
      Promise.resolve(
        metadata.versions.reduce((sum, version) => sum + version.size, 0),
      ),
      Promise.resolve(
        metadata.versions.reduce(
          (sum, version) => sum + (version.assets?.totalBytes ?? 0),
          0,
        ),
      ),
    ]);

    let lastParsedAt: string | null = null;
    for (const version of metadata.versions) {
      if (!lastParsedAt || version.createdAt > lastParsedAt) {
        lastParsedAt = version.createdAt;
      }
    }
    const engines = [
      ...new Set(
        metadata.versions.map(
          (version) => version.provenance.engineLabel,
        ),
      ),
    ];

    rows.push({
      sourceRelPath: metadata.sourceRelPath,
      docFolderRelPath: slug,
      docFolderDisplayPath: docFolderAbsPath,
      versionCount: metadata.versions.length,
      activeVersionId: metadata.activeVersionId,
      totalBytes: totalBytes ?? 0,
      markdownBytes,
      assetBytes,
      lastParsedAt,
      engines,
    });
  }

  return {
    outputRootDisplayPath: base.docRootAbsPath,
    generatedAt: new Date().toISOString(),
    truncated,
    rows,
  };
}

async function readDocMetadata(
  metadataAbsPath: string,
): Promise<AiTextDocumentMetadata | null> {
  try {
    return normalizeAiTextDocumentMetadata(
      JSON.parse(await readFile(metadataAbsPath, "utf8")),
    );
  } catch {
    return null;
  }
}
