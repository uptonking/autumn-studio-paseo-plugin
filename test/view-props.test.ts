import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  clearWorkspaceBlobUrls,
  getOrCreateFileBlobUrl,
  replaceCachedFileBlobUrl,
} from '../client/blob-url-cache.ts';
import { flattenTree, dataUriToObjectUrl, fileBlobCacheKey } from '../client/view-props.ts';
import {
  closeAllFileTabsInStore,
  closeFileTabInStore,
  getWorkspaceOpenedTabs,
  openFileTabInStore,
  resetOpenedTabsStore,
  setActiveFileTabInStore,
} from '../client/opened-tabs-store.ts';
import {
  getFormatSurfaceProviders,
  registerSurfaceProviderMeta,
  resolveSurfaceProviderMeta,
} from '../client/viewers/provider-catalog.ts';
import { persistSerializedFile } from '../client/editing/use-file-edit-session.ts';
import { serializeEditedPdfBytes } from '../client/vendor/pdf-viewer/pdf-save.ts';
import { type FileNode } from '../shared/contracts.ts';

describe('view-props: flattenTree', () => {
  it('returns empty array for undefined', () => {
    assert.deepEqual(flattenTree(undefined), []);
  });

  it("skips root folder '/' and flattens nested items", () => {
    const tree: FileNode = {
      kind: 'folder',
      path: '/',
      name: 'root',
      children: [
        {
          kind: 'folder',
          path: 'docs/',
          name: 'docs',
          children: [
            {
              kind: 'file',
              path: 'docs/spec.pdf',
              name: 'spec.pdf',
              size: 2048,
              mtime: 1700000000000,
              contentType: 'application/pdf',
            },
          ],
        },
        {
          kind: 'file',
          path: 'README.md',
          name: 'README.md',
          size: 512,
          mtime: 1700000000000,
          contentType: 'text/markdown',
        },
      ],
    };

    const flat = flattenTree(tree);
    assert.equal(flat.length, 3);
    assert.deepEqual(flat[0], { kind: 'folder', path: 'docs/', name: 'docs' });
    assert.deepEqual(flat[1], {
      kind: 'file',
      path: 'docs/spec.pdf',
      name: 'spec.pdf',
      size: 2048,
      updatedAt: new Date(1700000000000).toISOString(),
      contentType: 'application/pdf',
    });
    assert.deepEqual(flat[2], {
      kind: 'file',
      path: 'README.md',
      name: 'README.md',
      size: 512,
      updatedAt: new Date(1700000000000).toISOString(),
      contentType: 'text/markdown',
    });
  });

  it('handles empty folder tree', () => {
    const tree: FileNode = {
      kind: 'folder',
      path: '/',
      name: 'empty',
      children: [],
    };
    assert.deepEqual(flattenTree(tree), []);
  });
});

describe('view-props: dataUriToObjectUrl', () => {
  it('converts data URI to blob object URL', async () => {
    // Provide minimal mock for fetch/URL in Node test environment if needed
    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    let createdUrl = '';
    globalThis.URL.createObjectURL = (blob: any) => {
      createdUrl = `blob:mock-uuid-${blob.size}`;
      return createdUrl;
    };

    try {
      const dataUri = 'data:text/plain;base64,aGVsbG8='; // "hello"
      const url = await dataUriToObjectUrl(dataUri);
      assert.ok(url.startsWith('blob:mock-uuid-'));
    } finally {
      if (prevCreateObjectURL) {
        globalThis.URL.createObjectURL = prevCreateObjectURL;
      }
    }
  });
});

describe('opened-tabs-store & blob-url-cache & viewerKindForFile', () => {
  it('manages workspace tabs lifecycle including closeAllFileTabsInStore', () => {
    const wsId = 'ws-test-tabs';
    resetOpenedTabsStore(wsId);
    assert.deepEqual(getWorkspaceOpenedTabs(wsId), {
      tabs: [],
      activePath: null,
      recentFiles: [],
    });

    openFileTabInStore(wsId, {
      path: 'a.pdf',
      name: 'a.pdf',
      contentType: 'application/pdf',
    });
    openFileTabInStore(wsId, {
      path: 'b.ts',
      name: 'b.ts',
      contentType: 'text/x-typescript',
    });
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 2);
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, 'b.ts');

    setActiveFileTabInStore(wsId, 'a.pdf');
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, 'a.pdf');

    closeFileTabInStore(wsId, 'a.pdf');
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 1);
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, 'b.ts');

    closeAllFileTabsInStore(wsId);
    assert.deepEqual(getWorkspaceOpenedTabs(wsId).tabs, []);
    assert.equal(getWorkspaceOpenedTabs(wsId).activePath, null);
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).recentFiles.map((f) => f.path),
      ['a.pdf', 'b.ts'],
    );
    resetOpenedTabsStore(wsId);
  });

  it('generates distinct cache keys when updatedAt or size changes', () => {
    const fileV1 = {
      path: 'README.md',
      updatedAt: '2026-01-01T00:00:00Z',
      size: 5,
    };
    const fileV2 = {
      path: 'README.md',
      updatedAt: '2026-01-02T00:00:00Z',
      size: 5,
    };
    const fileV3 = {
      path: 'README.md',
      updatedAt: '2026-01-02T00:00:00Z',
      size: 6,
    };
    assert.notEqual(fileBlobCacheKey(fileV1), fileBlobCacheKey(fileV2));
    assert.notEqual(fileBlobCacheKey(fileV2), fileBlobCacheKey(fileV3));
  });

  it('supports multiple viewer and editor providers per file format', () => {
    // Built-in defaults for pdf, xlsx, and text
    assert.equal(resolveSurfaceProviderMeta('pdf', 'viewer')?.id, 'embedpdf-viewer');
    assert.equal(resolveSurfaceProviderMeta('pdf', 'editor')?.id, 'embedpdf-editor');
    assert.equal(resolveSurfaceProviderMeta('xlsx', 'viewer')?.id, 'extend-xlsx-viewer');
    assert.equal(resolveSurfaceProviderMeta('xlsx', 'editor')?.id, 'extend-xlsx-editor');
    assert.equal(resolveSurfaceProviderMeta('text', 'viewer')?.id, 'code-text-viewer');
    assert.equal(resolveSurfaceProviderMeta('text', 'editor')?.id, 'code-text-editor');

    // Registering a second PDF viewer provider (e.g., pdfjs-viewer) works alongside embedpdf-viewer
    const unregister = registerSurfaceProviderMeta({
      id: 'pdfjs-viewer',
      kind: 'pdf',
      role: 'viewer',
      label: 'PDF.js Viewer',
    });
    try {
      const pdfViewers = getFormatSurfaceProviders('pdf', 'viewer');
      assert.equal(pdfViewers.length, 2);
      assert.equal(resolveSurfaceProviderMeta('pdf', 'viewer')?.id, 'embedpdf-viewer');
      assert.equal(resolveSurfaceProviderMeta('pdf', 'viewer', 'pdfjs-viewer')?.id, 'pdfjs-viewer');
    } finally {
      unregister();
    }
    assert.equal(getFormatSurfaceProviders('pdf', 'viewer').length, 1);
  });

  it('persists serialized file payloads to the file system RPC and updates tab metadata', async () => {
    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    globalThis.URL.createObjectURL = (blob: Blob) => `blob:saved-${blob.size}`;

    const wsId = 'ws-save-test';
    closeAllFileTabsInStore(wsId);
    openFileTabInStore(wsId, {
      path: 'reports/q4.xlsx',
      name: 'q4.xlsx',
      size: 100,
      updatedAt: '2026-01-01T00:00:00.000Z',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const recordedRpcCalls: Array<{
      workspaceId: string;
      relPath: string;
      content: string;
      encoding: 'base64' | 'utf8';
    }> = [];

    try {
      const payloadBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x10, 0x20]);
      const result = await persistSerializedFile({
        workspaceId: wsId,
        relPath: 'reports/q4.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        payload: {
          encoding: 'bytes',
          bytes: payloadBytes,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        callSaveRpc: async (input) => {
          recordedRpcCalls.push(input);
          return {
            path: input.relPath,
            size: payloadBytes.byteLength,
            mtime: 1700000005000,
          };
        },
      });

      assert.equal(recordedRpcCalls.length, 1);
      assert.equal(recordedRpcCalls[0].encoding, 'base64');
      assert.equal(
        Buffer.from(recordedRpcCalls[0].content, 'base64').byteLength,
        payloadBytes.byteLength,
      );
      assert.equal(result.size, payloadBytes.byteLength);
      assert.equal(result.blobUrl, `blob:saved-${payloadBytes.byteLength}`);

      const tab = getWorkspaceOpenedTabs(wsId).tabs.find((t) => t.path === 'reports/q4.xlsx');
      assert.ok(tab);
      assert.equal(tab.size, payloadBytes.byteLength);
      assert.equal(tab.updatedAt, new Date(1700000005000).toISOString());
    } finally {
      closeAllFileTabsInStore(wsId);
      if (prevCreateObjectURL) {
        globalThis.URL.createObjectURL = prevCreateObjectURL;
      }
    }
  });

  it('serializes PDF page rotations, annotations, and page deletions via pdf-lib', async () => {
    const sourceDoc = await PDFDocument.create();
    sourceDoc.addPage([600, 800]);
    sourceDoc.addPage([600, 800]);
    const sourceBytes = await sourceDoc.save();
    const dataUri = `data:application/pdf;base64,${Buffer.from(sourceBytes).toString('base64')}`;

    const editedBytes = await serializeEditedPdfBytes(dataUri, {
      pageRotations: { 1: 90 },
      deletedPages: [2],
      annotations: [
        {
          id: 'txt-1',
          kind: 'text',
          pageNumber: 1,
          xRatio: 0.15,
          yRatio: 0.2,
          text: 'Reviewed & Approved',
          color: '#2563eb',
          fontSize: 16,
        },
        {
          id: 'hl-1',
          kind: 'highlight',
          pageNumber: 1,
          xRatio: 0.1,
          yRatio: 0.3,
          widthRatio: 0.4,
          heightRatio: 0.05,
          color: '#facc15',
        },
        {
          id: 'rect-1',
          kind: 'rect',
          pageNumber: 1,
          xRatio: 0.12,
          yRatio: 0.3,
          widthRatio: 0.25,
          heightRatio: 0.12,
          color: '#10b981',
          strokeWidth: 2,
        },
        {
          id: 'ink-1',
          kind: 'ink',
          pageNumber: 1,
          points: [
            { xRatio: 0.2, yRatio: 0.5 },
            { xRatio: 0.35, yRatio: 0.55 },
          ],
          color: '#ef4444',
          strokeWidth: 2.5,
        },
      ],
    });

    const reloaded = await PDFDocument.load(editedBytes);
    assert.equal(reloaded.getPageCount(), 1);
    assert.equal(reloaded.getPage(0).getRotation().angle, 90);
  });

  it('retains superseded blob URLs across sequential saves until workspace cleanup', async () => {
    const prevCreateObjectURL = globalThis.URL.createObjectURL;
    const prevRevokeObjectURL = globalThis.URL.revokeObjectURL;
    let counter = 0;
    const revoked: string[] = [];

    globalThis.URL.createObjectURL = () => `blob:test-${++counter}`;
    globalThis.URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    const wsId = 'ws-retire-test';
    try {
      const url1 = replaceCachedFileBlobUrl(
        wsId,
        { path: 'doc.pdf', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
        new Uint8Array([1, 2, 3]),
        'application/pdf',
      );
      const url2 = replaceCachedFileBlobUrl(
        wsId,
        { path: 'doc.pdf', size: 12, updatedAt: '2026-01-01T00:00:01.000Z' },
        new Uint8Array([1, 2, 3, 4]),
        'application/pdf',
      );

      assert.equal(url1, 'blob:test-1');
      assert.equal(url2, 'blob:test-2');

      // A caller with a stale pre-refetch timestamp must receive the newer saved blob URL
      const urlFromStaleRef = await getOrCreateFileBlobUrl(
        wsId,
        { path: 'doc.pdf', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
        async () => ({ dataUri: 'data:application/pdf;base64,AA==' }),
      );
      assert.equal(urlFromStaleRef, 'blob:test-2');

      // A caller with the refetched timestamp also receives the saved blob URL
      const urlFromRefetched = await getOrCreateFileBlobUrl(
        wsId,
        { path: 'doc.pdf', size: 12, updatedAt: '2026-01-01T00:00:01.000Z' },
        async () => ({ dataUri: 'data:application/pdf;base64,AA==' }),
      );
      assert.equal(urlFromRefetched, 'blob:test-2');

      // When the file is later edited externally on the Mac filesystem,
      // opening it with forceRefresh: true bypasses the stale client metadata
      // and fetches the latest bytes from disk.
      let diskFetchCount = 0;
      const urlAfterExternalEdit = await getOrCreateFileBlobUrl(
        wsId,
        { path: 'doc.pdf', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
        async () => {
          diskFetchCount += 1;
          return {
            dataUri: 'data:application/pdf;base64,AQIDBAUG',
            size: 6,
            mtime: Date.parse('2026-01-01T00:00:05.000Z'),
          };
        },
        { forceRefresh: true },
      );
      assert.equal(diskFetchCount, 1);
      assert.equal(urlAfterExternalEdit, 'blob:test-3');

      // Neither URL should be revoked while the workspace session is still active
      await Promise.resolve();
      assert.deepEqual(revoked, []);

      clearWorkspaceBlobUrls(wsId);
      await Promise.resolve();
      assert.deepEqual(revoked.sort(), ['blob:test-1', 'blob:test-2', 'blob:test-3']);
    } finally {
      globalThis.URL.createObjectURL = prevCreateObjectURL;
      globalThis.URL.revokeObjectURL = prevRevokeObjectURL;
    }
  });
});
