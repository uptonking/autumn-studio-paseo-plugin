import { useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { locateWorkspaceFile } from "../shared/contracts.js";
import {
  isAbsoluteLikePath,
  normalizeWorkspaceRelPath,
} from "../shared/path-identity.ts";

export type WorkspaceRelPathState =
  | { status: "loading" }
  | { status: "ready"; relPath: string }
  | { status: "outside" };

const relPathCache = new Map<string, string | null>();

export function resetWorkspaceRelPathCache(): void {
  relPathCache.clear();
}

/**
 * Resolves the workspace-relative identity of a native file tab.
 *
 * Paseo's `params.path` is workspace-relative for explorer opens (fast path,
 * no RPC) but absolute for link opens; absolute paths map through the
 * plugin's `files.locate` RPC once per (workspace, path) and cache the
 * result, so AI Text documents and edit-session keys share identities with
 * the workspace-panel surface regardless of how the tab was opened.
 */
export function useWorkspaceRelPath(input: {
  workspaceId: string;
  paramsPath: string;
  absolutePath: string;
}): WorkspaceRelPathState {
  const { workspaceId, paramsPath, absolutePath } = input;
  const fetchLocate = useRpc(locateWorkspaceFile);
  const cacheKey = `${workspaceId}::${absolutePath}`;
  const [resolved, setResolved] = useState<string | null | undefined>(() =>
    isAbsoluteLikePath(paramsPath) ? relPathCache.get(cacheKey) : undefined,
  );

  useEffect(() => {
    if (!isAbsoluteLikePath(paramsPath)) return;
    const cached = relPathCache.get(cacheKey);
    if (cached !== undefined) {
      setResolved(cached);
      return;
    }
    let cancelled = false;
    setResolved(undefined);
    void fetchLocate({ workspaceId, absPath: absolutePath })
      .then((result) => {
        relPathCache.set(cacheKey, result.relPath);
        if (!cancelled) setResolved(result.relPath);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, paramsPath, absolutePath, workspaceId, fetchLocate]);

  if (!isAbsoluteLikePath(paramsPath)) {
    const relPath = normalizeWorkspaceRelPath(paramsPath);
    return relPath ? { status: "ready", relPath } : { status: "outside" };
  }
  if (resolved === undefined) return { status: "loading" };
  return resolved === null
    ? { status: "outside" }
    : { status: "ready", relPath: resolved };
}
