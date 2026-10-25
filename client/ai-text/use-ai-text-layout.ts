import * as React from 'react';
import type {
  AiTextLayoutBlock,
  AiTextLayoutDocument,
  AiTextVersionRecord,
} from '../../shared/contracts.js';
import { layoutBlockToArea } from '../../shared/ai-text/layout.js';
import type { PDFViewerHandle } from '../vendor/pdf-viewer/types.js';
import type { AiTextBridge, AiTextLayoutStatus } from './ai-text-types.js';

export interface UseAiTextLayoutInput {
  filePath?: string;
  activeVersion: AiTextVersionRecord | null;
  getLayout: AiTextBridge['getLayout'] | undefined;
  getAsset: AiTextBridge['getAsset'] | undefined;
  autoScrollToLayoutBlock: boolean;
  pdfHandleRef: React.RefObject<PDFViewerHandle | null>;
}

/**
 * Loads the stored layout document for the active version and owns block
 * focus. Focus sets the overlay state first, then scrolls the PDF handle when
 * auto-scroll is enabled.
 */
export function useAiTextLayout({
  filePath,
  activeVersion,
  getLayout,
  getAsset,
  autoScrollToLayoutBlock,
  pdfHandleRef,
}: UseAiTextLayoutInput) {
  const [layout, setLayout] = React.useState<AiTextLayoutDocument | null>(null);
  const [layoutStatus, setLayoutStatus] = React.useState<AiTextLayoutStatus>('idle');
  const [layoutMessage, setLayoutMessage] = React.useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = React.useState<string | null>(null);
  const generationRef = React.useRef(0);
  const currentFilePathRef = React.useRef(filePath);
  currentFilePathRef.current = filePath;

  const versionLayoutRef = activeVersion?.layout;

  React.useEffect(() => {
    generationRef.current += 1;
    setActiveBlockId(null);
    if (!activeVersion || !filePath || !getLayout) {
      setLayout(null);
      setLayoutStatus('idle');
      setLayoutMessage(null);
      return;
    }
    if (!versionLayoutRef) {
      setLayout(null);
      setLayoutStatus('missing');
      setLayoutMessage(
        'This version has no layout metadata. Re-parse with MinerU Kit or the token API to enable Blocks.',
      );
      return;
    }

    const generation = generationRef.current;
    const targetPath = filePath;
    setLayout(null);
    setLayoutStatus('loading');
    setLayoutMessage(null);
    getLayout(targetPath, activeVersion.id)
      .then((result) => {
        if (generationRef.current !== generation) return;
        if (currentFilePathRef.current !== targetPath) return;
        if (result.layout) {
          setLayout(result.layout);
          setLayoutStatus('ready');
          setLayoutMessage(null);
        } else {
          setLayout(null);
          setLayoutStatus('missing');
          setLayoutMessage(result.message ?? 'Layout metadata is unavailable.');
        }
      })
      .catch((error) => {
        if (generationRef.current !== generation) return;
        setLayout(null);
        setLayoutStatus('missing');
        setLayoutMessage(
          error instanceof Error ? error.message : 'Layout metadata could not be loaded.',
        );
      });

    return () => {
      generationRef.current += 1;
    };
  }, [activeVersion, filePath, getLayout, versionLayoutRef]);

  const focusBlock = React.useCallback(
    (block: AiTextLayoutBlock) => {
      setActiveBlockId(block.id);
      if (!autoScrollToLayoutBlock) return;
      const handle = pdfHandleRef.current;
      if (!handle) return;
      handle.scrollToPageArea(block.pageNumber, layoutBlockToArea(block), {
        behavior: 'smooth',
      });
    },
    [autoScrollToLayoutBlock, pdfHandleRef],
  );

  const clearActiveBlock = React.useCallback(() => {
    setActiveBlockId(null);
  }, []);

  const activeBlock = React.useMemo(() => {
    if (!layout || !activeBlockId) return null;
    return layout.blocks.find((block) => block.id === activeBlockId) ?? null;
  }, [activeBlockId, layout]);

  const loadAsset = React.useCallback(
    async (assetPath: string) => {
      if (!filePath || !activeVersion || !getAsset) {
        throw new Error('No AI text version selected');
      }
      return getAsset(filePath, activeVersion.id, assetPath);
    },
    [activeVersion, filePath, getAsset],
  );

  return {
    layout,
    layoutStatus,
    layoutMessage,
    activeBlockId,
    activeBlock,
    focusBlock,
    clearActiveBlock,
    loadAsset,
  };
}
