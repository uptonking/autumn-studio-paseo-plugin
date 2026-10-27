import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  readBrowserEditorDocument,
  replaceBrowserEditorDocument,
  type BrowserEditorController,
  type BrowserEditorState,
} from '@datalking/begonia-browser/v1';
import { BegoniaBrowserEditor } from '@datalking/begonia-react/v1';
import { BEGONIA_EDITOR_THEME } from '../../../vendor/docx-viewer/begonia-theme.js';
import { AiTextSurfaceContext } from '../../ai-text-context.js';
import { buildDocument, countDocumentPages } from './build-document.js';
import {
  collectImageAssetPaths,
  markdownContainsPageBreakMarkers,
  resolveTextPagesSource,
  type DocumentBlock,
} from './document-input.js';
import { serializeDocumentToMarkdown } from './document-to-markdown.js';
import { attachLayoutSourceAnchors } from './layout-anchor.js';
import { layoutToDocumentBlocks } from './layout-to-document.js';
import { markdownToDocumentBlocks } from './markdown-to-document.js';
import {
  mapSourceRanges,
  readBodyCaretPosition,
  resolveCaretSourceBlock,
  type SelectionSnapshotLike,
  type SourceRange,
  type TransactionMappingLike,
} from './selection-source.js';
import type { AiTextViewerProps } from '../registry.js';

/** How long typing waits before the draft Markdown is refreshed. */
const DRAFT_SYNC_DEBOUNCE_MS = 150;

const TEXT_PAGES_PARTICIPANT = {
  id: 'autumn-studio-ai-text',
  name: 'Autumn Studio',
  color: '#d97706',
} as const;

/** Live paginated page preview; shorter than the docx one for the split pane. */
const TEXT_PAGES_PREVIEW_OPTIONS = {
  height: 560,
  virtualize: true,
} as const;

/**
 * Approximate rendered width (CSS px) of one A4 page plus the editor card
 * chrome at 100% zoom; the denominator for the computed fit percent.
 */
const TEXT_PAGES_ZOOM_BASE_PX = 874;

/**
 * How long after a pointerdown its caret update still counts as a block
 * click, so clicking the active block re-syncs the PDF while a stale click
 * without a selection change cannot.
 */
const CLICK_FOCUS_WINDOW_MS = 500;

export interface TextPagesViewerOptions {
  /** Fit pages to the pane width instead of a 100% zoom. */
  fitWidth: boolean;
  /** Render image blocks from version assets. */
  includeImages: boolean;
  /** Scroll the original PDF to the page the paginated editor shows. */
  followPdfPage: boolean;
}

export const DEFAULT_TEXT_PAGES_OPTIONS: TextPagesViewerOptions = {
  fitWidth: true,
  includeImages: true,
  followPdfPage: true,
};

async function loadAssetDataUrls(
  assetPaths: readonly string[],
  loadAsset: (assetPath: string) => Promise<{ mimeType: string; base64: string }>,
): Promise<Map<string, string>> {
  const results = await Promise.allSettled(
    assetPaths.map(async (assetPath) => {
      const asset = await loadAsset(assetPath);
      return [assetPath, `data:${asset.mimeType};base64,${asset.base64}`] as const;
    }),
  );
  const dataUrls = new Map<string, string>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [assetPath, dataUrl] = result.value;
      dataUrls.set(assetPath, dataUrl);
    }
  }
  return dataUrls;
}

export function TextPagesViewer({
  content,
  contentEdited,
  layout,
  layoutStatus,
  activeBlockId,
  draftText,
  onDraftChange,
  onSaveRequest,
  onFocusBlock,
  onClearActiveLayoutBlock,
  onRequestParse,
  loadAsset,
  textPagesOptions = DEFAULT_TEXT_PAGES_OPTIONS,
  onRegisterDraftSync,
}: AiTextViewerProps) {
  const [controller, setController] = React.useState<BrowserEditorController | null>(null);
  const [isPreparing, setIsPreparing] = React.useState(true);
  const [prepareError, setPrepareError] = React.useState<string | null>(null);
  const [pageStatus, setPageStatus] = React.useState<{
    visible: number | null;
    total: number | null;
  }>({ visible: null, total: null });

  // Fit-to-width is computed here instead of Begonia's 'fit-width' zoom mode:
  // in fit-width mode the editor refits its zoom from viewport metrics the
  // paginated preview pushes back into it, and a non-converging fit can nest
  // editor publishes until React gives up (error #185). An integer percent
  // measured from the pane has no feedback path.
  const scrollHostRef = React.useRef<HTMLDivElement | null>(null);
  const [fitZoomPercent, setFitZoomPercent] = React.useState(100);
  React.useEffect(() => {
    const element = scrollHostRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth;
      if (width <= 0) return;
      const next = Math.min(100, Math.max(40, Math.floor((width / TEXT_PAGES_ZOOM_BASE_PX) * 100)));
      setFitZoomPercent((prev) => (prev === next ? prev : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const effectiveZoomPercent = textPagesOptions.fitWidth ? fitZoomPercent : 100;

  const controllerRef = React.useRef<BrowserEditorController | null>(null);
  const buildGenerationRef = React.useRef(0);
  // The Markdown text of the last draft this viewer emitted, plus the layout it
  // was serialized against. Only that exact pair may skip the rebuild: a save
  // round trip is not a user edit, but two versions can share identical text
  // while pointing at different layouts.
  const lastEmittedDraftRef = React.useRef<{ markdown: string; layoutKey: string } | null>(null);
  const hasUserEditsRef = React.useRef(false);
  const draftSyncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFollowedPdfPageRef = React.useRef<number | null>(null);
  // Root document span of every layout-derived block in the current document;
  // kept current through edits by mapping it through each transaction.
  const sourceRangesRef = React.useRef<SourceRange[]>([]);
  // A click re-syncs the PDF even when the caret stays inside the block that
  // is already active, matching a click on the active block in the Blocks
  // view. Typing never stamps this, so typing inside one block stays quiet.
  const forceCaretFocusAtRef = React.useRef(0);
  // The caret-follow only engages once the editor itself has focus: the
  // document-open settle events carry a doc-start selection that must not
  // highlight a block or yank the PDF away from wherever the user was reading.
  const caretFollowArmedRef = React.useRef(false);
  // The PDF follow only engages after the first real build: the starter
  // document's mount events must not scroll the PDF, and the freshly built
  // document's settle event (always page 1) must not yank the PDF away from
  // wherever the user was reading.
  const followArmedRef = React.useRef(false);
  const skipNextFollowRef = React.useRef(false);

  const surface = React.useContext(AiTextSurfaceContext);
  const surfaceRef = React.useRef(surface);
  surfaceRef.current = surface;

  const optionsRef = React.useRef(textPagesOptions);
  optionsRef.current = textPagesOptions;
  const loadAssetRef = React.useRef(loadAsset);
  loadAssetRef.current = loadAsset;
  const onDraftChangeRef = React.useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const onSaveRequestRef = React.useRef(onSaveRequest);
  onSaveRequestRef.current = onSaveRequest;
  const onRegisterDraftSyncRef = React.useRef(onRegisterDraftSync);
  onRegisterDraftSyncRef.current = onRegisterDraftSync;
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const onFocusBlockRef = React.useRef(onFocusBlock);
  onFocusBlockRef.current = onFocusBlock;
  const onClearActiveLayoutBlockRef = React.useRef(onClearActiveLayoutBlock);
  onClearActiveLayoutBlockRef.current = onClearActiveLayoutBlock;
  const activeBlockIdRef = React.useRef(activeBlockId);
  activeBlockIdRef.current = activeBlockId;

  const readEditorDocumentNode = React.useCallback(() => {
    const currentController = controllerRef.current;
    if (!currentController) return null;
    try {
      return readBrowserEditorDocument(currentController);
    } catch {
      // Reads throw once the Begonia runtime is torn down during editor
      // unmount; a destroyed editor has no draft to read.
      return null;
    }
  }, []);

  const readEditorDocument = React.useCallback((): string | null => {
    const document = readEditorDocumentNode();
    if (!document) return null;
    return serializeDocumentToMarkdown(document);
  }, [readEditorDocumentNode]);

  // Layout object identity churns on refetches; the primitive key keeps the
  // build effect stable for an unchanged layout. Declared before the flush so
  // the emitted draft records which layout its text was serialized against.
  const layoutKey = React.useMemo(
    () =>
      layout
        ? `${layout.source}:${layout.producedAt}:${layout.pageCount}:${layout.blockCount}`
        : '',
    [layout],
  );

  const flushDraftSync = React.useCallback((): string | null => {
    if (draftSyncTimerRef.current !== null) {
      clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
    }
    // Only real edits update the draft: serializing the freshly built document
    // (e.g. on unmount) would mark the version dirty and rewrite the stored
    // Markdown in normalized form even though nothing was edited.
    if (!hasUserEditsRef.current) return null;
    const markdown = readEditorDocument();
    if (markdown === null) return null;
    lastEmittedDraftRef.current = { markdown, layoutKey };
    onDraftChangeRef.current(markdown);
    return markdown;
  }, [layoutKey, readEditorDocument]);

  // The pane calls the registered flush right before Save/Copy so those
  // actions read the document synchronously instead of the debounced draft.
  React.useEffect(() => {
    const register = onRegisterDraftSyncRef.current;
    register?.({ flush: flushDraftSync });
    return () => {
      if (onRegisterDraftSyncRef.current === register) {
        register?.(null);
      }
    };
  }, [flushDraftSync]);

  const handleControllerChange = React.useCallback(
    (next: BrowserEditorController | null) => {
      if (next === null && controllerRef.current) {
        // The editor is tearing down. Begonia nulls the controller before
        // destroying the runtime, so a flush here still reads pending edits;
        // once destroyed, later flushes no-op instead of throwing.
        flushDraftSync();
      }
      controllerRef.current = next;
      setController(next);
    },
    [flushDraftSync],
  );

  const handleEditorTransaction = React.useCallback(
    (transaction: { docChanged: boolean; mapping?: TransactionMappingLike }) => {
      if (!transaction.docChanged) return;
      hasUserEditsRef.current = true;
      if (transaction.mapping) {
        sourceRangesRef.current = mapSourceRanges(sourceRangesRef.current, transaction.mapping);
      }
      // Inserting or deleting page breaks changes the page total; other edits
      // leave it stable, so the cheap top-level walk per transaction is fine.
      const document = readEditorDocumentNode();
      if (document) {
        const total = countDocumentPages(document);
        setPageStatus((prev) => (prev.total === total ? prev : { ...prev, total }));
      }
      if (draftSyncTimerRef.current !== null) {
        clearTimeout(draftSyncTimerRef.current);
      }
      draftSyncTimerRef.current = setTimeout(() => {
        draftSyncTimerRef.current = null;
        flushDraftSync();
      }, DRAFT_SYNC_DEBOUNCE_MS);
    },
    [flushDraftSync, readEditorDocumentNode],
  );

  // Focus or a keypress inside the editor arms the caret-follow: the
  // document-open settle events carry a doc-start selection that must not
  // highlight a block or yank the PDF away from wherever the user was reading.
  const handleEditorInteractionCapture = React.useCallback(() => {
    caretFollowArmedRef.current = true;
  }, []);

  // A click re-syncs the PDF even when the caret lands in the block that is
  // already active, matching a click on the active block in the Blocks view.
  // The timestamp window lets a click that produced no selection change expire
  // instead of forcing a scroll much later.
  const handleEditorPointerDown = React.useCallback(() => {
    caretFollowArmedRef.current = true;
    forceCaretFocusAtRef.current = Date.now();
  }, []);

  // The leading visible page drives the page indicator and the page-level
  // follow-the-PDF scroll; the PDF never scrolls the editor back, so this
  // cannot loop. The caret-follow runs first: a caret inside a layout-derived
  // node focuses the source block through the shared pane callback — highlight
  // always, area scroll gated by the shared auto-scroll setting — exactly like
  // clicking a block in the Blocks view. Deduped per block so typing stays
  // quiet.
  const handleEditorStateChange = React.useCallback((state: BrowserEditorState | null) => {
    const caretPosition = readBodyCaretPosition(
      (state as { selection?: SelectionSnapshotLike } | null)?.selection ?? null,
    );
    let focusedBlock = false;
    if (caretFollowArmedRef.current) {
      const clickFocusedBlock = Date.now() - forceCaretFocusAtRef.current < CLICK_FOCUS_WINDOW_MS;
      const sourceBlock =
        caretPosition === null
          ? null
          : resolveCaretSourceBlock(sourceRangesRef.current, caretPosition, layoutRef.current);
      if (sourceBlock && (clickFocusedBlock || sourceBlock.id !== activeBlockIdRef.current)) {
        // Optimistic: the pane's state lands on the next render, and this also
        // dedupes repeat state changes within the same tick.
        activeBlockIdRef.current = sourceBlock.id;
        // focusBlock's area scroll lands on this page; recording it keeps the
        // page-level follow below from re-scrolling right after.
        lastFollowedPdfPageRef.current = sourceBlock.pageNumber;
        onFocusBlockRef.current(sourceBlock);
        focusedBlock = true;
      } else if (caretPosition !== null && activeBlockIdRef.current !== null) {
        // The caret is in a block with no layout counterpart — user-written
        // text, a page break, or a section that no longer matches. Keep the
        // amber box from pointing at a section the caret has already left.
        activeBlockIdRef.current = null;
        onClearActiveLayoutBlockRef.current();
      }
      forceCaretFocusAtRef.current = 0;
    }

    const visible = state?.viewport?.visiblePageNumbers?.[0] ?? null;
    setPageStatus((prev) => (prev.visible === visible ? prev : { ...prev, visible }));
    // The block focus already placed the PDF at the caret's section, while the
    // viewport's page state can still describe the previous scroll position;
    // running the page follow here would drag the PDF back to it.
    if (focusedBlock) return;
    if (visible === null || !followArmedRef.current) return;
    if (skipNextFollowRef.current) {
      // The freshly built document settling on its first page is not a user
      // scroll; record it without moving the PDF.
      skipNextFollowRef.current = false;
      lastFollowedPdfPageRef.current = visible;
      return;
    }
    if (!optionsRef.current.followPdfPage) return;
    if (lastFollowedPdfPageRef.current === visible) return;
    lastFollowedPdfPageRef.current = visible;
    surfaceRef.current?.pdfHandleRef.current?.scrollToPage(visible);
  }, []);

  React.useEffect(
    () => () => {
      if (draftSyncTimerRef.current !== null) {
        clearTimeout(draftSyncTimerRef.current);
      }
      // A pending debounce must not lose the last edits from the draft.
      flushDraftSync();
    },
    [flushDraftSync],
  );

  // Build the document once the controller exists. Re-runs only when the
  // version content changes and is not our own emitted draft (a save round
  // trip), so user edits and the caret survive viewer re-renders. Memoized:
  // the pane re-renders on every debounced draft flush, and re-concatenating
  // the full content string each time would copy megabytes per keystroke.
  const buildKey = React.useMemo(() => `${content.length}::${content}`, [content]);
  React.useEffect(() => {
    if (!controller) return;
    const lastEmitted = lastEmittedDraftRef.current;
    if (lastEmitted && content === lastEmitted.markdown && layoutKey === lastEmitted.layoutKey) {
      return;
    }

    const hasDirtyDraft = draftText !== content;
    const hasMarkers = markdownContainsPageBreakMarkers(draftText);
    // While the layout is still loading and neither a dirty draft nor stored
    // page markers decide the pagination, wait: building the plain Markdown
    // first would flash a document without the PDF page mapping.
    if (!hasDirtyDraft && !hasMarkers && !layout && layoutStatus === 'loading') {
      // Discard any in-flight build of the previous version and reset the
      // page indicator; the layout arrival restarts this effect.
      buildGenerationRef.current += 1;
      hasUserEditsRef.current = false;
      lastFollowedPdfPageRef.current = null;
      sourceRangesRef.current = [];
      setPageStatus({ visible: null, total: null });
      setIsPreparing(true);
      return;
    }

    const generation = ++buildGenerationRef.current;
    // A fresh build has no user edits yet; the guard in flushDraftSync relies
    // on this reset so a rebuilt document does not emit a spurious draft.
    hasUserEditsRef.current = false;
    lastFollowedPdfPageRef.current = null;
    sourceRangesRef.current = [];
    const resolved = resolveTextPagesSource(content, draftText, Boolean(layout), contentEdited);
    const includeImages = optionsRef.current.includeImages;

    let blocks: DocumentBlock[];
    if (resolved.source === 'layout' && layout) {
      blocks = layoutToDocumentBlocks(layout, { includeImages });
    } else {
      blocks = markdownToDocumentBlocks(resolved.markdown);
      // Saved Markdown carries no section ids; re-match it against the
      // extraction layout so the caret can still highlight PDF sections.
      if (layout) {
        blocks = attachLayoutSourceAnchors(blocks, layout);
      }
    }

    setIsPreparing(true);
    setPrepareError(null);

    let schema: ReturnType<
      BrowserEditorController['documentService']['readDocument']
    >['type']['schema'];
    try {
      schema = controller.documentService.readDocument().type.schema;
    } catch {
      // The runtime can be torn down between the controller handoff and
      // this effect; building would throw inside the commit.
      setPrepareError('The editor is not ready to display this document.');
      setIsPreparing(false);
      return;
    }
    const finish = (dataUrls: Map<string, string>) => {
      const built = buildDocument(schema, blocks, dataUrls);
      const replaced = replaceBrowserEditorDocument(controller, built.doc);
      if (!replaced) {
        // A destroyed or not-yet-ready surface would silently drop the
        // document; surface it instead of leaving the starter document.
        setPrepareError('The editor is not ready to display this document.');
        setIsPreparing(false);
        return;
      }
      sourceRangesRef.current = built.sourceRanges;
      // `visible` recomputes from the new document's first viewport update.
      // Arm the PDF follow and skip that settle event so opening the viewer
      // never yanks the PDF to the document's first page.
      followArmedRef.current = true;
      skipNextFollowRef.current = true;
      setPageStatus({ visible: null, total: countDocumentPages(built.doc) });
      setIsPreparing(false);
    };

    const assetPaths = includeImages ? collectImageAssetPaths(blocks) : [];
    if (assetPaths.length === 0) {
      finish(new Map());
      return;
    }

    loadAssetDataUrls(assetPaths, (assetPath) => loadAssetRef.current(assetPath))
      .then((dataUrls) => {
        if (generation !== buildGenerationRef.current) return;
        finish(dataUrls);
      })
      .catch((error: unknown) => {
        if (generation !== buildGenerationRef.current) return;
        setIsPreparing(false);
        setPrepareError(
          error instanceof Error ? error.message : 'Failed to prepare the paginated document',
        );
      });
    // draftText and layout are deliberately excluded: the viewer itself emits
    // the draft, and the layoutKey primitive covers layout identity.
    // contentEdited is included because it flips the authoritative source
    // (layout vs saved Markdown) for identical content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, buildKey, layoutKey, layoutStatus, contentEdited]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault();
        flushDraftSync();
        // The pane's save closure reads the draft from its own state; defer
        // one macrotask so the flushed draft is committed before it runs.
        setTimeout(() => onSaveRequestRef.current(), 0);
      }
    },
    [flushDraftSync],
  );

  if (prepareError) {
    return (
      <div className='flex size-full flex-col items-center justify-center gap-3 p-6 text-center'>
        <p className='max-w-sm text-xs text-destructive'>{prepareError}</p>
        <button
          type='button'
          onClick={onRequestParse}
          className='rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent'
        >
          Re-parse document
        </button>
      </div>
    );
  }

  // A PDF page whose content overflows one editor page spans several real
  // pages, so the viewport's visible page can exceed the explicit page count.
  const displayTotal = Math.max(pageStatus.total ?? 0, pageStatus.visible ?? 0);
  const pageLabel = displayTotal
    ? `Page ${pageStatus.visible ?? '–'} of ${displayTotal}`
    : pageStatus.visible
      ? `Page ${pageStatus.visible}`
      : 'Preparing pages…';

  return (
    <div
      data-testid='ai-text-text-pages'
      onKeyDown={handleKeyDown}
      className='relative flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-muted/40 outline-none'
    >
      {/* Slim status row: only the page indicator. */}
      <div className='flex shrink-0 items-center justify-end px-3 pt-2 pb-1'>
        <span
          data-testid='ai-text-text-pages-pages'
          className='text-[11px] text-muted-foreground tabular-nums'
        >
          {pageLabel}
        </span>
      </div>
      {/* This wrapper is the scroll container: Begonia's root is a grid whose
          rows auto-size, so without an overflow-y-auto ancestor the editor
          card (and the paginated preview stacked below it in narrow panes)
          would overflow the pane with no way to scroll. */}
      <div
        ref={scrollHostRef}
        onFocusCapture={handleEditorInteractionCapture}
        onKeyDownCapture={handleEditorInteractionCapture}
        onPointerDownCapture={handleEditorPointerDown}
        className='min-h-0 flex-1 overflow-y-auto px-3 pb-3'
      >
        <BegoniaBrowserEditor
          className='min-h-full w-full'
          participant={TEXT_PAGES_PARTICIPANT}
          documentMode='editing'
          flowMode='paginated'
          theme={BEGONIA_EDITOR_THEME}
          // The live paginated projection gives the Word print-layout look —
          // real page boxes with gaps, one per PDF page. In the narrow split
          // pane Begonia stacks it below the editor.
          paginatedPreview={TEXT_PAGES_PREVIEW_OPTIONS}
          zoomMode='manual'
          zoomPercent={effectiveZoomPercent}
          trackingEnabled={false}
          viewSelect={false}
          showToolbar={false}
          showRichFormatControls={false}
          showViewControls={false}
          showReviewControls={false}
          showComments={false}
          showCommentDisplayControls={false}
          showReview={false}
          showReviewTimeline={false}
          showAdvancedOoxmlInspector={false}
          onControllerChange={handleControllerChange}
          onStateChange={handleEditorStateChange}
          onTransaction={handleEditorTransaction}
        />
      </div>
      {isPreparing || !controller ? (
        <div
          data-testid='ai-text-text-pages-preparing'
          className='pointer-events-none absolute inset-0 grid place-items-center bg-background/60 text-xs text-muted-foreground backdrop-blur-[1px]'
        >
          <div className='inline-flex items-center gap-2'>
            <Loader2 className='size-4 animate-spin' />
            <span>Preparing paginated document…</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
