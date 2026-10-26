import * as React from 'react';
import { BookOpen, Download, Ellipsis, Eye, Settings2, WrapText } from 'lucide-react';
import type { DocxFlowMode } from '../../../shared/settings';
import { EditorSaveControls } from '../../editing/surface-mode-controls.js';
import type { FileEditSession } from '../../editing/use-file-edit-session.js';
import type { FileSurfaceRole } from '../../viewers/provider-catalog.js';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { cn } from '../lib/utils';

export interface DocxToolbarProps {
  fileName?: string;
  role: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  flowMode: DocxFlowMode;
  onFlowModeChange: (flowMode: DocxFlowMode) => void;
  showDownloadButton?: boolean;
  src?: string;
  /** Opens the host settings page at the Docx/Doc format section. */
  onOpenEditorSettings?: () => void;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export interface DocxModeSwitcherProps {
  role: FileSurfaceRole;
  flowMode: DocxFlowMode;
  /** False hides the Paginated/Web (editing) options, leaving Viewer only. */
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  onFlowModeChange: (flowMode: DocxFlowMode) => void;
}

/**
 * Single segmented mode switch: Viewer is the read-only mode; Paginated and
 * Web are editing modes that also pick the document layout, replacing the
 * previous separate Viewer/Editor and Paginated/Web button pairs.
 */
export function DocxModeSwitcher({
  role,
  flowMode,
  canSwitchRole = true,
  onRoleChange,
  onPreloadRole,
  onFlowModeChange,
}: DocxModeSwitcherProps) {
  const isViewer = role === 'viewer';

  const enterEditorMode = (nextFlowMode: DocxFlowMode) => {
    if (role !== 'editor') {
      onRoleChange?.('editor');
    }
    onFlowModeChange(nextFlowMode);
  };

  return (
    <div
      role='group'
      aria-label='Document mode'
      data-testid='docx-mode-switcher'
      className='inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-xs'
    >
      <button
        type='button'
        data-testid='docx-mode-viewer'
        aria-label='Switch to read-only Viewer'
        aria-pressed={isViewer}
        onPointerEnter={() => {
          if (!isViewer) onPreloadRole?.('viewer');
        }}
        onFocus={() => {
          if (!isViewer) onPreloadRole?.('viewer');
        }}
        onClick={() => onRoleChange?.('viewer')}
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
          isViewer
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Eye className='size-3.5' />
        <span>Viewer</span>
      </button>
      {canSwitchRole
        ? (['paginated', 'web'] as const).map((mode) => {
            const active = role === 'editor' && flowMode === mode;
            const label = mode === 'paginated' ? 'Paginated' : 'Web';
            const Icon = mode === 'paginated' ? BookOpen : WrapText;
            return (
              <button
                key={mode}
                type='button'
                data-testid={`docx-mode-${mode}`}
                aria-label={`Switch to ${label} editing`}
                aria-pressed={active}
                onPointerEnter={() => {
                  if (role !== 'editor') onPreloadRole?.('editor');
                }}
                onFocus={() => {
                  if (role !== 'editor') onPreloadRole?.('editor');
                }}
                onClick={() => enterEditorMode(mode)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className='size-3.5' />
                <span>{label}</span>
              </button>
            );
          })
        : null}
    </div>
  );
}

export function DocxToolbar({
  fileName,
  role,
  canSwitchRole,
  onRoleChange,
  onPreloadRole,
  editSession,
  flowMode,
  onFlowModeChange,
  showDownloadButton = true,
  src,
  onOpenEditorSettings,
  extraMenuItems,
  toolbarActions,
}: DocxToolbarProps) {
  const isEditor = role === 'editor';
  const handleDownload = React.useCallback(() => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName ?? 'document.docx';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [fileName, src]);

  // The ⋯ menu is always present when the toolbar renders so "Open Editor
  // Settings" is reachable even for plain files with no extra menu items.
  const hasMenuItems = Boolean(
    onOpenEditorSettings || extraMenuItems || (showDownloadButton && src),
  );

  return (
    <div className='flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1 text-xs'>
      <div className='flex min-w-0 items-center gap-2'>
        {fileName ? <span className='truncate font-medium text-foreground'>{fileName}</span> : null}
      </div>
      <div className='flex flex-wrap items-center gap-1.5'>
        <DocxModeSwitcher
          role={role}
          flowMode={flowMode}
          canSwitchRole={Boolean(canSwitchRole && onRoleChange)}
          onRoleChange={onRoleChange}
          onPreloadRole={onPreloadRole}
          onFlowModeChange={onFlowModeChange}
        />
        {isEditor && editSession ? <EditorSaveControls editSession={editSession} /> : null}
        {showDownloadButton && src ? (
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Download file'
            onClick={handleDownload}
          >
            <Download className='size-3.5' />
          </Button>
        ) : null}
        {toolbarActions}
        {hasMenuItems ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                data-testid='docx-more-menu'
                variant='ghost'
                size='icon-sm'
                aria-label='More file actions'
              >
                <Ellipsis className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              {onOpenEditorSettings ? (
                <DropdownMenuItem
                  data-testid='docx-open-editor-settings'
                  onClick={onOpenEditorSettings}
                >
                  <Settings2 className='size-4' />
                  Open Editor Settings
                </DropdownMenuItem>
              ) : null}
              {extraMenuItems ? (
                <>
                  {onOpenEditorSettings ? <DropdownMenuSeparator /> : null}
                  {extraMenuItems}
                </>
              ) : null}
              {showDownloadButton && src ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className='size-4' />
                    Download
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
