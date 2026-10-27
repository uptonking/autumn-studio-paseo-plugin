import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PluginFile } from '@getpaseo/plugin/client';
import { clearWorkspaceBlobUrls, getOrCreateFileBlobUrl } from '../client/blob-url-cache.ts';
import {
  openFileTabInStore,
  getWorkspaceOpenedTabs,
  resetOpenedTabsStore,
} from '../client/opened-tabs-store.ts';
import { saveSerializedFileViaPluginFile } from '../client/editing/plugin-file-save.ts';
import {
  classifySaveError,
  serializedPayloadToBytes,
} from '../client/editing/use-file-edit-session.ts';

function makeStubFile(options?: { size?: number; modifiedAt?: string; writeError?: Error }): {
  file: PluginFile;
  writes: { bytes: Uint8Array; force?: boolean }[];
} {
  const writes: { bytes: Uint8Array; force?: boolean }[] = [];
  const file = {
    path: '/ws/docs/a.md',
    name: 'a.md',
    extension: 'md',
    size: options?.size ?? 11,
    modifiedAt: options?.modifiedAt ?? new Date(2000).toISOString(),
    mimeType: 'text/markdown',
    readText: async () => '',
    readBytes: async () => new Uint8Array(),
    url: async () => 'blob:new-version',
    writeText: async () => {},
    writeBytes: async (bytes: Uint8Array, opts?: { force?: boolean }) => {
      if (options?.writeError) throw options.writeError;
      writes.push({ bytes, force: opts?.force });
    },
    watch: () => () => {},
  } as unknown as PluginFile;
  return { file, writes };
}

describe('editing: serializedPayloadToBytes', () => {
  it('converts utf8, bytes, and base64 payloads', async () => {
    const utf8 = serializedPayloadToBytes({
      encoding: 'utf8',
      data: 'héllo',
    });
    assert.deepEqual(Array.from(utf8), Array.from(new TextEncoder().encode('héllo')));

    const raw = new Uint8Array([1, 2, 3]);
    assert.equal(serializedPayloadToBytes({ encoding: 'bytes', bytes: raw }), raw);

    const base64 = Buffer.from('abc').toString('base64');
    assert.deepEqual(
      Array.from(serializedPayloadToBytes({ encoding: 'base64', data: base64 })),
      Array.from(Buffer.from('abc')),
    );
  });
});

describe('editing: classifySaveError', () => {
  it('recognizes PluginFile conflict and deleted errors', () => {
    const conflict = new Error('changed');
    conflict.name = 'PluginFileConflictError';
    const deleted = new Error('gone');
    deleted.name = 'PluginFileDeletedError';
    assert.equal(classifySaveError(conflict), 'conflict');
    assert.equal(classifySaveError(deleted), 'deleted');
    assert.equal(classifySaveError(new Error('boom')), 'other');
    assert.equal(classifySaveError('str'), 'other');
  });
});

describe('editing: saveSerializedFileViaPluginFile', () => {
  const workspaceId = 'ws-plugin-file-save-test';
  const filePath = 'docs/a.md';

  before(() => {
    openFileTabInStore(workspaceId, { path: filePath, name: 'a.md' });
  });

  after(() => {
    clearWorkspaceBlobUrls(workspaceId);
    resetOpenedTabsStore(workspaceId);
  });

  it('writes bytes, refreshes tab metadata, and invalidates the workspace blob cache', async () => {
    let fetchCount = 0;
    const fetchDataUri = async () => {
      fetchCount += 1;
      return {
        dataUri: 'data:text/markdown;base64,aGVsbG8=',
        size: 5,
        mtime: 1000,
      };
    };
    const staleMeta = {
      path: filePath,
      updatedAt: new Date(1000).toISOString(),
      size: 5,
    };
    await getOrCreateFileBlobUrl(workspaceId, staleMeta, fetchDataUri);
    assert.equal(fetchCount, 1);
    await getOrCreateFileBlobUrl(workspaceId, staleMeta, fetchDataUri);
    assert.equal(fetchCount, 1, 'cache hit before the plugin-file save');

    const { file, writes } = makeStubFile({
      size: 11,
      modifiedAt: new Date(2000).toISOString(),
    });
    const saved = await saveSerializedFileViaPluginFile({
      workspaceId,
      openFilePath: filePath,
      targetPath: filePath,
      file,
      payload: { encoding: 'utf8', data: 'hello world' },
    });

    assert.equal(writes.length, 1);
    assert.deepEqual(
      Array.from(writes[0].bytes),
      Array.from(new TextEncoder().encode('hello world')),
    );
    assert.equal(saved.path, filePath);
    assert.equal(saved.size, 11);
    assert.equal(saved.blobUrl, 'blob:new-version');

    const tab = getWorkspaceOpenedTabs(workspaceId).tabs.find((entry) => entry.path === filePath);
    assert.equal(tab?.size, 11);
    assert.equal(tab?.updatedAt, new Date(2000).toISOString());

    await getOrCreateFileBlobUrl(workspaceId, staleMeta, fetchDataUri);
    assert.equal(fetchCount, 2, 'cache entry retired by the plugin-file save');
  });

  it('forwards force to writeBytes', async () => {
    const { file, writes } = makeStubFile();
    await saveSerializedFileViaPluginFile({
      workspaceId,
      openFilePath: filePath,
      targetPath: filePath,
      file,
      payload: { encoding: 'utf8', data: 'again' },
      force: true,
    });
    assert.equal(writes[0]?.force, true);
  });

  it('propagates write failures', async () => {
    const conflict = new Error('The file changed on disk.');
    conflict.name = 'PluginFileConflictError';
    const { file } = makeStubFile({ writeError: conflict });
    await assert.rejects(
      () =>
        saveSerializedFileViaPluginFile({
          workspaceId,
          openFilePath: filePath,
          targetPath: filePath,
          file,
          payload: { encoding: 'utf8', data: 'x' },
        }),
      /changed on disk/,
    );
  });

  it('refuses to write a different path through the open file handle', async () => {
    const { file, writes } = makeStubFile();
    await assert.rejects(
      () =>
        saveSerializedFileViaPluginFile({
          workspaceId,
          openFilePath: filePath,
          targetPath: '.autumn/docs__a.pdf/v1.md',
          file,
          payload: { encoding: 'utf8', data: '# edited' },
        }),
      /Refusing to save/,
    );
    assert.equal(writes.length, 0, 'the open PDF must not receive the Markdown bytes');
  });

  it('serializes with workspace reads: an in-flight save blocks same-path refetches', async () => {
    const serializeWs = 'ws-plugin-file-save-serialize';
    const serializePath = 'docs/same.md';
    try {
      let resolveWrite: () => void = () => {};
      const writeGate = new Promise<void>((resolve) => {
        resolveWrite = resolve;
      });
      const gatedFile = {
        ...makeStubFile().file,
        writeBytes: async () => {
          await writeGate;
        },
      } as PluginFile;

      const savePromise = saveSerializedFileViaPluginFile({
        workspaceId: serializeWs,
        openFilePath: serializePath,
        targetPath: serializePath,
        file: gatedFile,
        payload: { encoding: 'utf8', data: 'slow save' },
      });
      await new Promise((r) => setTimeout(r, 20));

      let fetchCount = 0;
      const readPromise = getOrCreateFileBlobUrl(
        serializeWs,
        {
          path: serializePath,
          updatedAt: new Date(5000).toISOString(),
          size: 9,
        },
        async () => {
          fetchCount += 1;
          return {
            dataUri: 'data:text/markdown;base64,aGVsbG8=',
            size: 5,
            mtime: 5000,
          };
        },
      );
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(fetchCount, 0, 'read must wait for the in-flight native save');

      resolveWrite();
      await savePromise;
      await readPromise;
      assert.equal(fetchCount, 1);
    } finally {
      clearWorkspaceBlobUrls(serializeWs);
    }
  });
});
