import * as React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { sanitizeAssetRelativePath } from '../../../shared/asset-paths.js';
import {
  AI_TEXT_VIEWER_EDIT,
  AI_TEXT_VIEWER_LAYOUT_BLOCKS,
  AI_TEXT_VIEWER_RAW,
  AI_TEXT_VIEWER_TEXT,
  getBuiltinAiTextViewer,
} from '../../../shared/ai-text/viewers.js';
import { Button } from '../../vendor/components/ui/button.js';
import { MarkdownPreview } from '../../viewers/markdown-preview.js';
import { AiTextAssetImage } from '../ai-text-asset-image.js';
import { AiTextLayoutBlocksPanel } from '../ai-text-layout-blocks-panel.js';
import { registerAiTextViewer, type AiTextViewerProps } from './registry.js';

function TextAiTextViewer({ content, loadAsset }: AiTextViewerProps) {
  const renderImage = React.useCallback(
    (src: string, alt: string) => {
      const assetPath = sanitizeAssetRelativePath(src);
      if (!assetPath) return null;
      return (
        <AiTextAssetImage
          assetPath={assetPath}
          alt={alt || 'Document image'}
          loadAsset={loadAsset}
          className='max-h-96 w-full object-contain'
        />
      );
    },
    [loadAsset],
  );
  return (
    <div
      data-testid='ai-text-preview-content'
      className='flex size-full min-h-0 flex-1 overflow-hidden'
    >
      <MarkdownPreview content={content} renderImage={renderImage} />
    </div>
  );
}

function RawAiTextViewer({ content }: AiTextViewerProps) {
  return (
    <pre
      data-testid='ai-text-raw-content'
      className='size-full min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-foreground'
    >
      {content}
    </pre>
  );
}

function EditAiTextViewer({
  draftText,
  isSaving,
  onDraftChange,
  onSaveRequest,
}: AiTextViewerProps) {
  return (
    <textarea
      data-testid='ai-text-editor-textarea'
      aria-label='Edit extracted AI text'
      value={draftText}
      disabled={isSaving}
      onChange={(event) => onDraftChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSaveRequest();
        }
      }}
      spellCheck={false}
      className='size-full min-h-0 flex-1 resize-none bg-background p-4 font-mono text-xs leading-5 text-foreground outline-none'
    />
  );
}

function LayoutBlocksAiTextViewer({
  layout,
  layoutStatus,
  layoutMessage,
  activeBlockId,
  onFocusBlock,
  onRequestParse,
  loadAsset,
}: AiTextViewerProps) {
  if (layoutStatus === 'ready' && layout) {
    return (
      <AiTextLayoutBlocksPanel
        layout={layout}
        activeBlockId={activeBlockId}
        onFocusBlock={onFocusBlock}
        loadAsset={loadAsset}
      />
    );
  }
  if (layoutStatus === 'loading') {
    return (
      <div className='grid size-full place-items-center'>
        <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
          <Loader2 className='size-3.5 animate-spin' />
          Loading layout blocks…
        </span>
      </div>
    );
  }
  return (
    <div className='flex size-full flex-col items-center justify-center gap-3 p-6 text-center'>
      <AlertTriangle className='size-5 text-muted-foreground' />
      <p className='max-w-sm text-xs text-muted-foreground'>
        {layoutMessage ?? 'Layout metadata is unavailable for this version.'}
      </p>
      <Button type='button' size='sm' onClick={onRequestParse} className='gap-1.5 text-xs'>
        <RefreshCw className='size-3.5' />
        <span>Re-parse for layout</span>
      </Button>
    </div>
  );
}

function descriptor(viewerId: string) {
  const found = getBuiltinAiTextViewer(viewerId);
  if (!found) throw new Error(`Built-in AI Text viewer "${viewerId}" is missing`);
  return found;
}

registerAiTextViewer(descriptor(AI_TEXT_VIEWER_TEXT), TextAiTextViewer);
registerAiTextViewer(descriptor(AI_TEXT_VIEWER_RAW), RawAiTextViewer);
registerAiTextViewer(descriptor(AI_TEXT_VIEWER_EDIT), EditAiTextViewer);
registerAiTextViewer(descriptor(AI_TEXT_VIEWER_LAYOUT_BLOCKS), LayoutBlocksAiTextViewer);
