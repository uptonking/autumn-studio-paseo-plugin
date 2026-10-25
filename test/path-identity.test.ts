import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsoluteLikePath, normalizeWorkspaceRelPath } from '../shared/path-identity.ts';

describe('path-identity: isAbsoluteLikePath', () => {
  it('accepts POSIX and Windows absolute paths', () => {
    assert.equal(isAbsoluteLikePath('/Users/me/repo/file.md'), true);
    assert.equal(isAbsoluteLikePath('C:/repo/file.md'), true);
    assert.equal(isAbsoluteLikePath('C:\\repo\\file.md'), true);
  });

  it('rejects workspace-relative paths', () => {
    assert.equal(isAbsoluteLikePath('docs/report.pdf'), false);
    assert.equal(isAbsoluteLikePath('./notes.md'), false);
    assert.equal(isAbsoluteLikePath(''), false);
  });
});

describe('path-identity: normalizeWorkspaceRelPath', () => {
  it('normalizes leading slashes and dot segments', () => {
    assert.equal(normalizeWorkspaceRelPath('docs/report.pdf'), 'docs/report.pdf');
    assert.equal(normalizeWorkspaceRelPath('/docs/report.pdf'), 'docs/report.pdf');
    assert.equal(normalizeWorkspaceRelPath('./docs//report.pdf'), 'docs/report.pdf');
  });

  it('collapses inner .. segments that stay inside the workspace', () => {
    assert.equal(normalizeWorkspaceRelPath('docs/../notes.md'), 'notes.md');
    assert.equal(normalizeWorkspaceRelPath('a/b/../c.txt'), 'a/c.txt');
  });

  it('rejects escapes, home paths, and empty input', () => {
    assert.equal(normalizeWorkspaceRelPath('../secret.txt'), null);
    assert.equal(normalizeWorkspaceRelPath('docs/../../secret.txt'), null);
    assert.equal(normalizeWorkspaceRelPath('~/notes.md'), null);
    assert.equal(normalizeWorkspaceRelPath('~'), null);
    assert.equal(normalizeWorkspaceRelPath('/'), null);
    assert.equal(normalizeWorkspaceRelPath('   '), null);
  });
});
