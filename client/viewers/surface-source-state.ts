import * as React from 'react';
import { isInAppSavedBlobUrl } from '../blob-url-cache.js';

export interface SurfaceSourceState {
  filePath?: string;
  sessionKey: string;
  propSrc: string;
  activeSrc: string;
}

/**
 * The `src` a file surface actually renders.
 *
 * In-app saves mint new blob URLs that replace the prop `src`; a dirty editor
 * keeps rendering the last saved version, while viewers adopt every external
 * refresh. Role or provider switches re-resolve to the newest saved URL when
 * one exists. `discardPendingChanges` callers unpin by setting `activeSrc`
 * back to the current prop `src` through the returned setter.
 */
export function useSurfaceSourceState({
  filePath,
  src,
  sessionKey,
  isEditor,
}: {
  filePath?: string;
  src: string;
  sessionKey: string;
  isEditor: boolean;
}) {
  const latestSavedBlobUrlRef = React.useRef<string | null>(null);
  const savedBlobUrlsRef = React.useRef<Set<string>>(new Set());

  const [surfaceSourceState, setSurfaceSourceState] = React.useState<SurfaceSourceState>(() => ({
    filePath,
    sessionKey,
    propSrc: src,
    activeSrc: src,
  }));

  let activeSrc = surfaceSourceState.activeSrc;
  if (surfaceSourceState.filePath !== filePath) {
    latestSavedBlobUrlRef.current = null;
    savedBlobUrlsRef.current.clear();
    activeSrc = src;
    setSurfaceSourceState({
      filePath,
      sessionKey,
      propSrc: src,
      activeSrc: src,
    });
  } else if (surfaceSourceState.propSrc !== src || surfaceSourceState.sessionKey !== sessionKey) {
    const propSrcChanged = surfaceSourceState.propSrc !== src;
    const sessionChanged = surfaceSourceState.sessionKey !== sessionKey;
    const isInAppSavedSrc = savedBlobUrlsRef.current.has(src) || isInAppSavedBlobUrl(src);

    if (propSrcChanged && isInAppSavedSrc) {
      latestSavedBlobUrlRef.current = src;
      savedBlobUrlsRef.current.add(src);
    }

    if (propSrcChanged && !isInAppSavedSrc) {
      latestSavedBlobUrlRef.current = null;
      savedBlobUrlsRef.current.clear();
      activeSrc = src;
    } else if (sessionChanged) {
      activeSrc = latestSavedBlobUrlRef.current ?? src;
    } else if (propSrcChanged && !isEditor) {
      activeSrc = src;
    }

    setSurfaceSourceState({
      filePath,
      sessionKey,
      propSrc: src,
      activeSrc,
    });
  }

  return {
    activeSrc,
    latestSavedBlobUrlRef,
    savedBlobUrlsRef,
    setSurfaceSourceState,
  };
}
