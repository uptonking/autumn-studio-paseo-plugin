import * as React from 'react';
import { BookOpen, Code2, Eye, FileText, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { AiTextViewerRegistration } from './viewers/index.js';
import { listAiTextViewers } from './viewers/index.js';
import { cn } from '../vendor/lib/utils.js';
import type { AiTextLayoutStatus } from './ai-text-types.js';

const BASE_MODE_CLASS =
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors disabled:opacity-40';

const VIEWER_ICONS: Record<string, LucideIcon> = {
  text: Eye,
  'layout-blocks': LayoutGrid,
  'paginated-doc': BookOpen,
  source: Code2,
};

function modeClass(isActive: boolean): string {
  return cn(
    BASE_MODE_CLASS,
    isActive
      ? 'bg-background text-foreground shadow-xs'
      : 'text-muted-foreground hover:text-foreground',
  );
}

function viewerIcon(viewer: AiTextViewerRegistration): LucideIcon {
  return VIEWER_ICONS[viewer.descriptor.id] ?? FileText;
}

export function AiTextViewModeToggle({
  displayMode,
  canShowLayout,
  layoutStatus,
  onChoose,
}: {
  displayMode: string;
  canShowLayout: boolean;
  layoutStatus: AiTextLayoutStatus;
  onChoose(viewerId: string): void;
}) {
  const viewers = listAiTextViewers();
  return (
    <div
      role='group'
      aria-label='AI text view mode'
      className='inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-[11px]'
    >
      {viewers.map((viewer, index) => {
        const Icon = viewerIcon(viewer);
        const unavailable = viewer.descriptor.capabilities.requiresLayout && !canShowLayout;
        // A subtle divider splits the read-only views (Text, Blocks) from the
        // editing views (Pages, Source).
        const showDivider =
          index > 0 &&
          viewer.descriptor.capabilities.editable !==
            viewers[index - 1]?.descriptor.capabilities.editable;
        return (
          <React.Fragment key={viewer.descriptor.id}>
            {showDivider ? <span aria-hidden className='mx-0.5 h-4 w-px bg-border' /> : null}
            <button
              type='button'
              data-testid={`ai-text-mode-${viewer.descriptor.id}`}
              aria-pressed={displayMode === viewer.descriptor.id}
              disabled={unavailable}
              title={
                unavailable
                  ? layoutStatus === 'loading'
                    ? 'Layout blocks are loading'
                    : 'This version has no layout blocks'
                  : viewer.descriptor.description
              }
              onClick={() => onChoose(viewer.descriptor.id)}
              className={modeClass(displayMode === viewer.descriptor.id)}
            >
              <Icon className='size-3' />
              <span>{viewer.descriptor.shortLabel ?? viewer.descriptor.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
