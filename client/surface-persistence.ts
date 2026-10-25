import { z } from 'zod';

/**
 * Per-tab view state persisted through Paseo's PluginTab.state — the native
 * file panel remembers its layout across tab reopen and app restart. Only
 * explicit user actions are recorded; absence of a field keeps the surface's
 * automatic behavior (settings-driven auto-open, default ratio).
 */

export const SPLIT_RATIO_MIN_PCT = 28;
export const SPLIT_RATIO_MAX_PCT = 72;
export const DEFAULT_SPLIT_RATIO_PCT = 50;

/** Clamps a dragged or persisted ratio into the split pane's legal range. */
export function clampSplitRatioPct(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_RATIO_PCT;
  return Math.min(SPLIT_RATIO_MAX_PCT, Math.max(SPLIT_RATIO_MIN_PCT, Math.round(value)));
}

export const aiTextSplitPersistenceSchema = z.object({
  /** Explicit user decision on the split view; absent means auto behavior. */
  splitOpen: z.boolean().optional(),
  splitRatioPct: z.number().optional(),
  originalHidden: z.boolean().optional(),
});

export const surfacePersistenceSchema = z.object({
  /**
   * File identity the layout belongs to. A tab can be retargeted to another
   * file while keeping its persisted state, so snapshots saved for a
   * different path are ignored on read and every write re-stamps the
   * current path.
   */
  path: z.string().optional(),
  aiText: aiTextSplitPersistenceSchema.optional(),
});

export type AiTextSplitPersistence = z.infer<typeof aiTextSplitPersistenceSchema>;
export type SurfacePersistence = z.infer<typeof surfacePersistenceSchema>;

export const DEFAULT_SURFACE_PERSISTENCE: SurfacePersistence = {};

export interface SurfacePersistenceHandle {
  /** The path-scoped snapshot; empty when the persisted state is for another file. */
  readonly state: SurfacePersistence;
  /** Merges explicit user decisions into the persisted aiText section. */
  updateAiText(changes: AiTextSplitPersistence): void;
}

export interface SurfacePersistenceSource {
  /** File whose layout this persistence owns; writes are stamped with it. */
  filePath: string;
  /**
   * The latest raw persisted snapshot, including optimistic writes: the
   * caller must feed every `write` back through here so successive merges
   * in the same render frame compose instead of overwriting each other.
   */
  readState(): SurfacePersistence;
  write(next: SurfacePersistence): void;
}

/**
 * Path-scoped view over the per-tab persisted state.
 *
 * Paseo persists one state object per tab, and a tab can be retargeted to a
 * different file, so every write stamps the current file path and reads
 * ignore a snapshot saved for another file — a stale layout never leaks
 * across files. Snapshots without a path (or written before this field
 * existed) are treated as foreign, keeping fresh mounts on automatic
 * behavior.
 */
export function createSurfacePersistenceHandle({
  filePath,
  readState,
  write,
}: SurfacePersistenceSource): SurfacePersistenceHandle {
  return {
    get state(): SurfacePersistence {
      const current = readState();
      return current.path === filePath ? current : DEFAULT_SURFACE_PERSISTENCE;
    },
    updateAiText(changes) {
      const current = readState();
      const base = current.path === filePath ? current : DEFAULT_SURFACE_PERSISTENCE;
      write({
        ...base,
        path: filePath,
        aiText: { ...base.aiText, ...changes },
      });
    },
  };
}
