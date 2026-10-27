import { readFile, rm, rmdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  aiTextLayoutDocumentSchema,
  computeMarkdownStructureStats,
  normalizeAiTextDocumentMetadata,
  type AiTextDocumentMetadata,
  type AiTextLayoutDocument,
  type AiTextVersionAssetsRef,
  type AiTextVersionLayoutRef,
  type AiTextVersionProvenance,
  type AiTextVersionRecord,
} from '../../shared/contracts.ts';
import { withDocLock } from './doc-lock.ts';
import { hashAiTextContent, resolveActiveContentEdited } from './content-hash.ts';
import {
  formatTimestampCompact,
  resolveAutumnDocPaths,
  resolveOutputArtifactPath,
  resolveDocFolderForSource,
  sanitizeToken,
  versionArtifactPaths,
  VERSION_ID_PATTERN,
} from './metadata-paths.ts';
import {
  writeFileAtomically,
  writeVersionAssets,
  type ExtractedAssetInput,
} from './version-assets.ts';

export type { ExtractedAssetInput } from './version-assets.ts';

export async function readDocumentMetadata(
  workspaceRootPath: string,
  sourceRelPath: string,
  outputRootDir = '.autumn',
  workspaceId?: string,
): Promise<{
  metadata: AiTextDocumentMetadata | null;
  activeContent: string | null;
  /**
   * True when the active version's Markdown differs from the extractor's
   * output; null when the version was extracted before content hashing.
   */
  activeContentEdited: boolean | null;
}> {
  const paths = resolveAutumnDocPaths(workspaceRootPath, sourceRelPath, outputRootDir, workspaceId);
  const folder = await resolveDocFolderForSource(workspaceRootPath, paths);
  let rawJson: string;
  try {
    rawJson = await readFile(folder.metadataAbsPath, 'utf8');
  } catch {
    return { metadata: null, activeContent: null, activeContentEdited: null };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawJson);
  } catch {
    return { metadata: null, activeContent: null, activeContentEdited: null };
  }

  const parsedResult = normalizeAiTextDocumentMetadata(parsedUnknown);
  if (!parsedResult) {
    return { metadata: null, activeContent: null, activeContentEdited: null };
  }

  const validVersions: AiTextVersionRecord[] = [];
  for (const version of parsedResult.versions) {
    if (!VERSION_ID_PATTERN.test(version.id)) continue;
    const artifactPaths = versionArtifactPaths(folder.docFolderRelPath, version.id);
    if (
      version.fileName !== artifactPaths.mdFileName ||
      version.relPath !== artifactPaths.mdRelPath
    ) {
      continue;
    }
    try {
      const absMdPath = await resolveOutputArtifactPath(
        paths.artifactBaseAbsPath,
        artifactPaths.mdRelPath,
      );
      const st = await stat(absMdPath);
      if (!st.isFile()) continue;

      // Derive layout and asset locations from the version id instead of
      // trusting the stored refs: a stale or hand-edited metadata file must
      // never point reads or deletes at another workspace path.
      let layout = version.layout
        ? {
            ...version.layout,
            fileName: artifactPaths.layoutFileName,
            relPath: artifactPaths.layoutRelPath,
          }
        : null;
      if (layout) {
        try {
          const absLayoutPath = await resolveOutputArtifactPath(
            paths.artifactBaseAbsPath,
            artifactPaths.layoutRelPath,
          );
          const layoutStats = await stat(absLayoutPath);
          if (!layoutStats.isFile()) layout = null;
        } catch {
          layout = null;
        }
      }

      let assets = version.assets
        ? { ...version.assets, dirName: artifactPaths.assetsDirName }
        : null;
      if (assets) {
        try {
          const absAssetsDir = await resolveOutputArtifactPath(
            paths.artifactBaseAbsPath,
            `${folder.docFolderRelPath}/${artifactPaths.assetsDirName}`,
          );
          const assetStats = await stat(absAssetsDir);
          if (!assetStats.isDirectory()) assets = null;
        } catch {
          assets = null;
        }
      }

      validVersions.push({
        ...version,
        fileName: artifactPaths.mdFileName,
        relPath: artifactPaths.mdRelPath,
        size: st.size,
        layout: layout ?? null,
        assets: assets ?? null,
      });
    } catch {
      // Skip deleted version files
    }
  }

  if (validVersions.length === 0) {
    return { metadata: null, activeContent: null, activeContentEdited: null };
  }

  // Sort versions newest first (descending by versionNumber)
  validVersions.sort((a, b) => b.versionNumber - a.versionNumber);

  const activeVersion =
    validVersions.find((v) => v.id === parsedResult.activeVersionId) ?? validVersions[0];

  let activeContent: string | null = null;
  try {
    const absMdPath = await resolveOutputArtifactPath(
      paths.artifactBaseAbsPath,
      activeVersion.relPath,
    );
    activeContent = await readFile(absMdPath, 'utf8');
  } catch {
    activeContent = null;
  }

  const metadata: AiTextDocumentMetadata = {
    schemaVersion: 2,
    sourceRelPath: paths.normalizedSourceRelPath,
    sourceFileName: paths.sourceFileName,
    formatKind: paths.formatKind,
    docFolderRelPath: folder.docFolderRelPath,
    activeVersionId: activeVersion.id,
    versions: validVersions,
  };

  return {
    metadata,
    activeContent,
    activeContentEdited: resolveActiveContentEdited(activeVersion, activeContent),
  };
}

export async function appendExtractedVersion(input: {
  workspaceRootPath: string;
  /** Namespaces doc folders when the output root is outside the workspace. */
  workspaceId?: string;
  sourceRelPath: string;
  sourceSize: number;
  sourceMtimeMs: number;
  markdownContent: string;
  durationMs: number;
  provenance: AiTextVersionProvenance;
  layout?: AiTextLayoutDocument | null;
  assets?: ExtractedAssetInput[];
  outputRootDir?: string;
  now?: Date;
}): Promise<{
  metadata: AiTextDocumentMetadata;
  newVersion: AiTextVersionRecord;
  content: string;
}> {
  const paths = resolveAutumnDocPaths(
    input.workspaceRootPath,
    input.sourceRelPath,
    input.outputRootDir,
    input.workspaceId,
  );
  return await withDocLock(`${input.workspaceRootPath}\0${paths.docFolderRelPath}`, async () => {
    const now = input.now ?? new Date();
    const folder = await resolveDocFolderForSource(input.workspaceRootPath, paths);
    const existing = await readDocumentMetadata(
      input.workspaceRootPath,
      input.sourceRelPath,
      input.outputRootDir,
      input.workspaceId,
    );
    const existingVersions = existing.metadata?.versions ?? [];
    const maxVersionNumber = existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
    const nextVersionNumber = maxVersionNumber + 1;
    const ts = formatTimestampCompact(now);
    const profileToken = sanitizeToken(input.provenance.profileId);
    const versionId = `${ts}_v${nextVersionNumber}_${profileToken}`;
    const artifactPaths = versionArtifactPaths(folder.docFolderRelPath, versionId);
    const { mdFileName, mdRelPath } = artifactPaths;
    const mdAbsPath = join(folder.docFolderAbsPath, mdFileName);

    const written = await writeFileAtomically(mdAbsPath, input.markdownContent);

    // Verify the write landed inside the output root.
    await resolveOutputArtifactPath(paths.artifactBaseAbsPath, mdRelPath);

    const warnings = [...(input.provenance.warnings ?? [])];

    let assetsRef: AiTextVersionAssetsRef | null = null;
    if (input.assets && input.assets.length > 0) {
      assetsRef = await writeVersionAssets({
        artifactBaseAbsPath: paths.artifactBaseAbsPath,
        docFolderAbsPath: folder.docFolderAbsPath,
        docFolderRelPath: folder.docFolderRelPath,
        assetsDirName: artifactPaths.assetsDirName,
        assets: input.assets,
        warnings,
      });
    }

    let layoutRef: AiTextVersionLayoutRef | null = null;
    if (input.layout && input.layout.blocks.length > 0) {
      const { layoutFileName, layoutRelPath } = artifactPaths;
      try {
        const layoutAbsPath = join(folder.docFolderAbsPath, layoutFileName);
        const serialized = aiTextLayoutDocumentSchema.parse(input.layout);
        await writeFileAtomically(layoutAbsPath, `${JSON.stringify(serialized)}\n`);
        await resolveOutputArtifactPath(paths.artifactBaseAbsPath, layoutRelPath);
        layoutRef = {
          fileName: layoutFileName,
          relPath: layoutRelPath,
          blockCount: serialized.blockCount,
          pageCount: serialized.pageCount,
          source: serialized.source,
        };
      } catch (error) {
        warnings.push(
          `Layout metadata could not be stored: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const stats = computeMarkdownStructureStats(input.markdownContent);
    const enrichedProvenance: AiTextVersionProvenance = {
      ...stats,
      ...input.provenance,
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    const newVersion: AiTextVersionRecord = {
      id: versionId,
      versionNumber: nextVersionNumber,
      fileName: mdFileName,
      relPath: mdRelPath,
      createdAt: now.toISOString(),
      durationMs: Math.max(0, Math.round(input.durationMs)),
      size: written.size,
      sourceSize: input.sourceSize,
      sourceMtimeMs: input.sourceMtimeMs,
      provenance: enrichedProvenance,
      layout: layoutRef,
      assets: assetsRef,
      contentHash: hashAiTextContent(input.markdownContent),
    };

    const nextVersions = [newVersion, ...existingVersions].sort(
      (a, b) => b.versionNumber - a.versionNumber,
    );

    const nextMetadata: AiTextDocumentMetadata = {
      schemaVersion: 2,
      sourceRelPath: paths.normalizedSourceRelPath,
      sourceFileName: paths.sourceFileName,
      formatKind: paths.formatKind,
      docFolderRelPath: folder.docFolderRelPath,
      activeVersionId: newVersion.id,
      versions: nextVersions,
    };

    await writeFileAtomically(folder.metadataAbsPath, `${JSON.stringify(nextMetadata, null, 2)}\n`);

    return {
      metadata: nextMetadata,
      newVersion,
      content: input.markdownContent,
    };
  });
}

export async function selectActiveVersion(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = '.autumn',
  workspaceId?: string,
): Promise<{
  metadata: AiTextDocumentMetadata;
  activeVersion: AiTextVersionRecord | null;
  content: string | null;
  activeContentEdited: boolean | null;
}> {
  const paths = resolveAutumnDocPaths(workspaceRootPath, sourceRelPath, outputRootDir, workspaceId);
  return await withDocLock(`${workspaceRootPath}\0${paths.docFolderRelPath}`, async () => {
    const folder = await resolveDocFolderForSource(workspaceRootPath, paths);
    const current = await readDocumentMetadata(
      workspaceRootPath,
      sourceRelPath,
      outputRootDir,
      workspaceId,
    );
    if (!current.metadata) {
      const empty: AiTextDocumentMetadata = {
        schemaVersion: 2,
        sourceRelPath: paths.normalizedSourceRelPath,
        sourceFileName: paths.sourceFileName,
        formatKind: paths.formatKind,
        docFolderRelPath: folder.docFolderRelPath,
        activeVersionId: null,
        versions: [],
      };
      return { metadata: empty, activeVersion: null, content: null, activeContentEdited: null };
    }

    const target =
      current.metadata.versions.find((v) => v.id === versionId) ??
      current.metadata.versions[0] ??
      null;

    const updatedMetadata: AiTextDocumentMetadata = {
      ...current.metadata,
      activeVersionId: target?.id ?? null,
    };

    await writeFileAtomically(
      folder.metadataAbsPath,
      `${JSON.stringify(updatedMetadata, null, 2)}\n`,
    );

    let content: string | null = null;
    if (target) {
      try {
        const absMdPath = await resolveOutputArtifactPath(
          paths.artifactBaseAbsPath,
          target.relPath,
        );
        content = await readFile(absMdPath, 'utf8');
      } catch {
        content = null;
      }
    }

    return {
      metadata: updatedMetadata,
      activeVersion: target,
      content,
      activeContentEdited: resolveActiveContentEdited(target, content),
    };
  });
}

/**
 * Records that the app just saved a version's Markdown. `contentHash` keeps
 * the extractor's immutable fingerprint; `savedContentHash` proves a user save
 * for versions extracted before fingerprinting, so a single-page document
 * still reopens from the edited Markdown instead of the layout.
 */
export async function markVersionSaved(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = '.autumn',
  workspaceId?: string,
): Promise<{
  metadata: AiTextDocumentMetadata;
  activeContentEdited: boolean | null;
}> {
  const paths = resolveAutumnDocPaths(workspaceRootPath, sourceRelPath, outputRootDir, workspaceId);
  return await withDocLock(`${workspaceRootPath}\0${paths.docFolderRelPath}`, async () => {
    const folder = await resolveDocFolderForSource(workspaceRootPath, paths);
    const current = await readDocumentMetadata(
      workspaceRootPath,
      sourceRelPath,
      outputRootDir,
      workspaceId,
    );
    if (!current.metadata) {
      throw new Error('No AI text metadata exists for this document');
    }
    const target = current.metadata.versions.find((version) => version.id === versionId);
    if (!target) {
      throw new Error(`AI text version "${versionId}" no longer exists`);
    }

    let content = target.id === current.metadata.activeVersionId ? current.activeContent : null;
    if (content === null) {
      try {
        const absMdPath = await resolveOutputArtifactPath(
          paths.artifactBaseAbsPath,
          target.relPath,
        );
        content = await readFile(absMdPath, 'utf8');
      } catch {
        content = null;
      }
    }
    if (content === null) {
      throw new Error('The saved version Markdown could not be read back');
    }

    const savedContentHash = hashAiTextContent(content);
    const nextMetadata: AiTextDocumentMetadata = {
      ...current.metadata,
      versions: current.metadata.versions.map((version) =>
        version.id === target.id ? { ...version, savedContentHash } : version,
      ),
    };
    await writeFileAtomically(folder.metadataAbsPath, `${JSON.stringify(nextMetadata, null, 2)}\n`);

    return {
      metadata: nextMetadata,
      activeContentEdited: resolveActiveContentEdited({ ...target, savedContentHash }, content),
    };
  });
}

export async function deleteExtractedVersion(
  workspaceRootPath: string,
  sourceRelPath: string,
  versionId: string,
  outputRootDir = '.autumn',
  workspaceId?: string,
): Promise<{
  metadata: AiTextDocumentMetadata | null;
  activeVersion: AiTextVersionRecord | null;
  content: string | null;
  activeContentEdited: boolean | null;
}> {
  const paths = resolveAutumnDocPaths(workspaceRootPath, sourceRelPath, outputRootDir, workspaceId);
  return await withDocLock(`${workspaceRootPath}\0${paths.docFolderRelPath}`, async () => {
    const folder = await resolveDocFolderForSource(workspaceRootPath, paths);
    const current = await readDocumentMetadata(
      workspaceRootPath,
      sourceRelPath,
      outputRootDir,
      workspaceId,
    );
    if (!current.metadata) {
      return { metadata: null, activeVersion: null, content: null, activeContentEdited: null };
    }

    const targetToDelete = current.metadata.versions.find((v) => v.id === versionId);
    if (targetToDelete) {
      const artifactPaths = versionArtifactPaths(folder.docFolderRelPath, targetToDelete.id);
      try {
        const absMdPath = await resolveOutputArtifactPath(
          paths.artifactBaseAbsPath,
          artifactPaths.mdRelPath,
        );
        await unlink(absMdPath);
      } catch {
        // Ignore if already removed
      }
      // Remove every derived artifact even when the record lost its optional
      // refs, so half-written or hand-edited metadata cannot leave files
      // behind.
      try {
        const absLayoutPath = await resolveOutputArtifactPath(
          paths.artifactBaseAbsPath,
          artifactPaths.layoutRelPath,
        );
        await unlink(absLayoutPath);
      } catch {
        // Ignore if already removed
      }
      try {
        const absAssetsDir = await resolveOutputArtifactPath(
          paths.artifactBaseAbsPath,
          `${folder.docFolderRelPath}/${artifactPaths.assetsDirName}`,
        );
        await rm(absAssetsDir, { recursive: true, force: true });
      } catch {
        // Ignore if already removed
      }
    }

    const remaining = current.metadata.versions.filter((v) => v.id !== versionId);
    if (remaining.length === 0) {
      await unlink(folder.metadataAbsPath).catch(() => undefined);
      // Removing the last version should not leave an empty `.autumn/<slug>/`.
      await rmdir(folder.docFolderAbsPath).catch(() => undefined);
      return { metadata: null, activeVersion: null, content: null, activeContentEdited: null };
    }

    const nextActive =
      remaining.find((v) => v.id === current.metadata?.activeVersionId) ?? remaining[0];

    const updatedMetadata: AiTextDocumentMetadata = {
      ...current.metadata,
      activeVersionId: nextActive.id,
      versions: remaining,
    };

    await writeFileAtomically(
      folder.metadataAbsPath,
      `${JSON.stringify(updatedMetadata, null, 2)}\n`,
    );

    let content: string | null = null;
    try {
      const absMdPath = await resolveOutputArtifactPath(
        paths.artifactBaseAbsPath,
        nextActive.relPath,
      );
      content = await readFile(absMdPath, 'utf8');
    } catch {
      content = null;
    }

    return {
      metadata: updatedMetadata,
      activeVersion: nextActive,
      content,
      activeContentEdited: resolveActiveContentEdited(nextActive, content),
    };
  });
}
