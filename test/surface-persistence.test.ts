import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SURFACE_PERSISTENCE,
  DEFAULT_SPLIT_RATIO_PCT,
  SPLIT_RATIO_MAX_PCT,
  SPLIT_RATIO_MIN_PCT,
  clampSplitRatioPct,
  createSurfacePersistenceHandle,
  surfacePersistenceSchema,
  type SurfacePersistence,
} from '../client/surface-persistence.ts';

function makeSource(
  initial: SurfacePersistence,
  filePath: string,
): {
  handle: ReturnType<typeof createSurfacePersistenceHandle>;
  stored: () => SurfacePersistence;
} {
  let stored = initial;
  return {
    handle: createSurfacePersistenceHandle({
      filePath,
      readState: () => stored,
      write: (next) => {
        stored = next;
      },
    }),
    stored: () => stored,
  };
}

describe('surface-persistence: clampSplitRatioPct', () => {
  it("clamps into the split pane's legal range", () => {
    assert.equal(clampSplitRatioPct(SPLIT_RATIO_MIN_PCT - 5), SPLIT_RATIO_MIN_PCT);
    assert.equal(clampSplitRatioPct(SPLIT_RATIO_MAX_PCT + 5), SPLIT_RATIO_MAX_PCT);
    assert.equal(clampSplitRatioPct(61.4), 61);
    assert.equal(clampSplitRatioPct(50), 50);
  });

  it('falls back to the default ratio for non-finite input', () => {
    assert.equal(clampSplitRatioPct(Number.NaN), DEFAULT_SPLIT_RATIO_PCT);
    assert.equal(clampSplitRatioPct(Number.POSITIVE_INFINITY), DEFAULT_SPLIT_RATIO_PCT);
  });
});

describe('surface-persistence: schema', () => {
  it('parses persisted state and tolerates absence', () => {
    assert.deepEqual(surfacePersistenceSchema.parse({}), DEFAULT_SURFACE_PERSISTENCE);
    const parsed = surfacePersistenceSchema.parse({
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true, splitRatioPct: 60, originalHidden: true },
    });
    assert.deepEqual(parsed, {
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true, splitRatioPct: 60, originalHidden: true },
    });
  });

  it('keeps unknown fields out of the persisted state', () => {
    const parsed = surfacePersistenceSchema.parse({
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true, viewerId: 'blocks' },
    });
    assert.deepEqual(parsed, {
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true },
    });
  });
});

describe('surface-persistence: handle', () => {
  it('merges aiText changes and stamps the current file path', () => {
    const { handle, stored } = makeSource({}, 'docs/guide.pdf');
    handle.updateAiText({ splitOpen: true, splitRatioPct: 55 });
    assert.deepEqual(stored(), {
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true, splitRatioPct: 55 },
    });
    handle.updateAiText({ originalHidden: true });
    assert.deepEqual(stored(), {
      path: 'docs/guide.pdf',
      aiText: { splitOpen: true, splitRatioPct: 55, originalHidden: true },
    });
    assert.equal(handle.state.aiText?.splitOpen, true);
  });

  it('ignores state persisted for a different file', () => {
    const { handle, stored } = makeSource(
      {
        path: 'docs/other.pdf',
        aiText: { splitOpen: true, splitRatioPct: 66 },
      },
      'docs/guide.pdf',
    );
    assert.deepEqual(handle.state, DEFAULT_SURFACE_PERSISTENCE);
    handle.updateAiText({ originalHidden: true });
    assert.deepEqual(stored(), {
      path: 'docs/guide.pdf',
      aiText: { originalHidden: true },
    });
  });

  it('treats a snapshot without a path as foreign', () => {
    const { handle } = makeSource({ aiText: { splitOpen: true } }, 'docs/guide.pdf');
    assert.deepEqual(handle.state, DEFAULT_SURFACE_PERSISTENCE);
  });
});
