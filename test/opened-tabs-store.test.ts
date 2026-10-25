import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRecentFilesInStore,
  closeAllFileTabsInStore,
  closeFileTabInStore,
  closeFileTabsToRightInStore,
  closeOtherFileTabsInStore,
  enforceMaxOpenTabsInStore,
  formatFileLoadError,
  getDisambiguatedTabLabels,
  getWorkspaceOpenedTabs,
  isFileNotFoundError,
  openFileTabInStore,
  recordRecentFileInStore,
  removeRecentFileInStore,
  resetOpenedTabsStore,
  setActiveFileTabInStore,
  setFileTabDirtyInStore,
  togglePinFileTabInStore,
  updateFileTabMetadataInStore,
} from '../client/opened-tabs-store.ts';
import { resolveFileTypeIcon } from '../client/vendor/file-system/file-icon-resolver.ts';

describe('opened-tabs-store: LRU eviction, recentFiles, pin & dirty protection', () => {
  it('defaults to maxOpenTabs = 8 and evicts the least recently accessed tab on the 9th open', () => {
    const wsId = 'ws-lru-default';
    resetOpenedTabsStore(wsId);

    for (let i = 1; i <= 8; i++) {
      openFileTabInStore(wsId, {
        path: `file-${i}.md`,
        name: `file-${i}.md`,
      });
    }

    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 8);
    // Visit file-1.md so file-2.md becomes the least recently accessed
    setActiveFileTabInStore(wsId, 'file-1.md');

    openFileTabInStore(wsId, {
      path: 'file-9.md',
      name: 'file-9.md',
    });

    const state = getWorkspaceOpenedTabs(wsId);
    assert.equal(state.tabs.length, 8);
    assert.equal(state.activePath, 'file-9.md');
    const openPaths = state.tabs.map((t) => t.path);
    // Visual order is preserved; file-1.md stayed at index 0 and file-2.md was evicted
    assert.equal(openPaths[0], 'file-1.md');
    assert.ok(!openPaths.includes('file-2.md'));
    assert.equal(openPaths[openPaths.length - 1], 'file-9.md');

    // Recent files caps at 8 most-recently accessed (including closed/evicted if within top 8)
    assert.equal(state.recentFiles.length, 8);
    assert.equal(state.recentFiles[0]?.path, 'file-9.md');
    assert.equal(state.recentFiles[1]?.path, 'file-1.md');

    resetOpenedTabsStore(wsId);
  });

  it('protects pinned and dirty tabs from LRU eviction and lowers count via enforceMaxOpenTabsInStore', () => {
    const wsId = 'ws-lru-protected';
    resetOpenedTabsStore(wsId);

    openFileTabInStore(wsId, { path: 'a.ts', name: 'a.ts' }, { maxOpenTabs: 3 });
    openFileTabInStore(wsId, { path: 'b.ts', name: 'b.ts' }, { maxOpenTabs: 3 });
    openFileTabInStore(wsId, { path: 'c.ts', name: 'c.ts' }, { maxOpenTabs: 3 });

    // Pin a.ts (oldest) and mark b.ts (second oldest) dirty
    togglePinFileTabInStore(wsId, 'a.ts');
    setFileTabDirtyInStore(wsId, 'b.ts', true);

    // Opening d.ts with maxOpenTabs = 3 must evict c.ts (the only clean, unpinned tab)
    openFileTabInStore(wsId, { path: 'd.ts', name: 'd.ts' }, { maxOpenTabs: 3 });

    const afterOpen = getWorkspaceOpenedTabs(wsId);
    assert.deepEqual(
      afterOpen.tabs.map((t) => t.path),
      ['a.ts', 'b.ts', 'd.ts'],
    );
    // Evicted c.ts remains in recentFiles!
    assert.deepEqual(
      afterOpen.recentFiles.map((f) => f.path),
      ['d.ts', 'c.ts', 'b.ts', 'a.ts'],
    );

    // Clear dirty on b.ts and lower maxOpenTabs to 2 via enforceMaxOpenTabsInStore
    setFileTabDirtyInStore(wsId, 'b.ts', false);
    enforceMaxOpenTabsInStore(wsId, 2);

    const afterEnforce = getWorkspaceOpenedTabs(wsId);
    assert.deepEqual(
      afterEnforce.tabs.map((t) => t.path),
      ['a.ts', 'd.ts'],
    );
    resetOpenedTabsStore(wsId);
  });

  it('preserves up to 8 recentFiles across tab closes, updates metadata, and clears on demand', () => {
    const wsId = 'ws-recent-history';
    resetOpenedTabsStore(wsId);

    openFileTabInStore(wsId, {
      path: 'docs/guide.md',
      name: 'guide.md',
      size: 100,
    });
    openFileTabInStore(wsId, {
      path: 'src/app.ts',
      name: 'app.ts',
      size: 200,
    });
    openFileTabInStore(wsId, {
      path: 'README.md',
      name: 'README.md',
      size: 300,
    });

    closeFileTabInStore(wsId, 'docs/guide.md');
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).tabs.map((t) => t.path),
      ['src/app.ts', 'README.md'],
    );
    // Closed file is still in recentFiles
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).recentFiles.map((f) => f.path),
      ['README.md', 'src/app.ts', 'docs/guide.md'],
    );

    // Opening a file in-place or in a dialog via recordRecentFileInStore promotes it to top of recentFiles without adding a tab
    recordRecentFileInStore(wsId, {
      path: 'assets/logo.png',
      name: 'logo.png',
      contentType: 'image/png',
    });
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 2);
    assert.equal(getWorkspaceOpenedTabs(wsId).recentFiles[0]?.path, 'assets/logo.png');

    // Updating metadata updates both open tabs and recentFiles
    updateFileTabMetadataInStore(wsId, 'docs/guide.md', { size: 555 });
    assert.equal(
      getWorkspaceOpenedTabs(wsId).recentFiles.find((f) => f.path === 'docs/guide.md')?.size,
      555,
    );

    closeAllFileTabsInStore(wsId);
    assert.equal(getWorkspaceOpenedTabs(wsId).tabs.length, 0);
    assert.equal(getWorkspaceOpenedTabs(wsId).recentFiles.length, 4);

    clearRecentFilesInStore(wsId);
    assert.equal(getWorkspaceOpenedTabs(wsId).recentFiles.length, 0);
    resetOpenedTabsStore(wsId);
  });

  it('supports closeOtherFileTabsInStore, closeFileTabsToRightInStore, and getDisambiguatedTabLabels', () => {
    const wsId = 'ws-batch-close';
    resetOpenedTabsStore(wsId);

    openFileTabInStore(wsId, { path: 'pkg-a/index.ts', name: 'index.ts' });
    openFileTabInStore(wsId, { path: 'pkg-b/index.ts', name: 'index.ts' });
    openFileTabInStore(wsId, { path: 'README.md', name: 'README.md' });
    openFileTabInStore(wsId, { path: 'CHANGELOG.md', name: 'CHANGELOG.md' });

    const labels = getDisambiguatedTabLabels(getWorkspaceOpenedTabs(wsId).tabs);
    assert.deepEqual(labels.get('pkg-a/index.ts'), {
      name: 'index.ts',
      folderHint: 'pkg-a',
    });
    assert.deepEqual(labels.get('pkg-b/index.ts'), {
      name: 'index.ts',
      folderHint: 'pkg-b',
    });
    assert.deepEqual(labels.get('README.md'), {
      name: 'README.md',
      folderHint: null,
    });

    // Pin pkg-a/index.ts so batch close preserves it
    togglePinFileTabInStore(wsId, 'pkg-a/index.ts');

    closeFileTabsToRightInStore(wsId, 'pkg-b/index.ts');
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).tabs.map((t) => t.path),
      ['pkg-a/index.ts', 'pkg-b/index.ts'],
    );

    closeOtherFileTabsInStore(wsId, 'pkg-b/index.ts');
    // Pinned pkg-a/index.ts and kept pkg-b/index.ts both stay open
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).tabs.map((t) => t.path),
      ['pkg-a/index.ts', 'pkg-b/index.ts'],
    );

    resetOpenedTabsStore(wsId);
  });

  it('resolves distinct file-type icons for PDF, Excel, Word, PowerPoint, Markdown, and code files', () => {
    const pdfIcon = resolveFileTypeIcon('report.pdf');
    const xlsxIcon = resolveFileTypeIcon('budget.xlsx');
    const csvIcon = resolveFileTypeIcon('table.csv');
    const docxIcon = resolveFileTypeIcon('spec.docx');
    const pptxIcon = resolveFileTypeIcon('deck.pptx');
    const mdIcon = resolveFileTypeIcon('README.md');
    const tsIcon = resolveFileTypeIcon('index.ts');

    assert.equal(pdfIcon.token, 'pdf');
    assert.equal(pdfIcon.name, 'file-tree-custom-pdf');
    assert.equal(xlsxIcon.token, 'table');
    assert.equal(xlsxIcon.name, 'file-tree-builtin-table');
    assert.equal(csvIcon.token, 'table');
    assert.equal(docxIcon.token, 'word');
    assert.equal(docxIcon.name, 'file-tree-custom-word');
    assert.equal(pptxIcon.token, 'slides');
    assert.equal(pptxIcon.name, 'file-tree-custom-slides');
    assert.equal(mdIcon.token, 'markdown');
    assert.equal(mdIcon.name, 'file-tree-builtin-markdown');
    assert.equal(tsIcon.token, 'typescript');

    const distinctNames = new Set([
      pdfIcon.name,
      xlsxIcon.name,
      docxIcon.name,
      pptxIcon.name,
      mdIcon.name,
      tsIcon.name,
    ]);
    assert.equal(distinctNames.size, 6);
  });

  it('removes missing files from recentFiles and formats ENOENT errors cleanly', () => {
    const wsId = 'ws-missing-recent';
    resetOpenedTabsStore(wsId);

    recordRecentFileInStore(wsId, { path: 'docs/a.md', name: 'a.md' });
    recordRecentFileInStore(wsId, { path: 'docs/gone.md', name: 'gone.md' });
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).recentFiles.map((f) => f.path),
      ['docs/gone.md', 'docs/a.md'],
    );

    removeRecentFileInStore(wsId, 'docs/gone.md');
    assert.deepEqual(
      getWorkspaceOpenedTabs(wsId).recentFiles.map((f) => f.path),
      ['docs/a.md'],
    );

    const rawRpcError =
      "Request failed: ENOENT: no such file or directory, realpath '/Users/yaoo/Documents/repos/tests/office-docs/mdnote2/lib-editor-codemirror-dev.md' requestType=plugin.rpc.invoke.request code=handler_error";
    assert.equal(isFileNotFoundError(rawRpcError), true);
    assert.equal(
      formatFileLoadError(rawRpcError, 'lib-editor-codemirror-dev.md'),
      '“lib-editor-codemirror-dev.md” was moved or deleted from the filesystem.',
    );

    resetOpenedTabsStore(wsId);
  });
});
