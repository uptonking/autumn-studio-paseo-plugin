import * as React from 'react';
import { BookOpen, Download, Ellipsis, WrapText } from 'lucide-react';
import type { DocxFlowMode } from '../../../shared/settings';
import { EditorSaveControls, SurfaceModeSwitcher } from '../../editing/surface-mode-controls.js';
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
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

const FLOW_MODE_OPTIONS: readonly { value: DocxFlowMode; label: string; icon: typeof BookOpen }[] =
  [
    { value: 'paginated', label: 'Paginated', icon: BookOpen },
    { value: 'web', label: 'Web', icon: WrapText },
  ];

/** Segmented Paginated/Web switch backed by Begonia's flow modes. */
export function DocxFlowModeSwitcher({
  flowMode,
  onFlowModeChange,
}: {
  flowMode: DocxFlowMode;
  onFlowModeChange: (flowMode: DocxFlowMode) => void;
}) {
  return (
    <div
      role='group'
      aria-label='Document layout'
      data-testid='docx-flow-mode-switcher'
      className='inline-flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 text-xs'
    >
      {FLOW_MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type='button'
          data-testid={`docx-flow-mode-${value}`}
          aria-label={`Switch to ${label} layout`}
          aria-pressed={flowMode === value}
          onClick={() => onFlowModeChange(value)}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
            flowMode === value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className='size-3.5' />
          <span>{label}</span>
        </button>
      ))}
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

  return (
    <div className='flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1 text-xs'>
      <div className='flex min-w-0 items-center gap-2'>
        {fileName ? <span className='truncate font-medium text-foreground'>{fileName}</span> : null}
      </div>
      <div className='flex flex-wrap items-center gap-1.5'>
        <DocxFlowModeSwitcher flowMode={flowMode} onFlowModeChange={onFlowModeChange} />
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
        {canSwitchRole && onRoleChange ? (
          <SurfaceModeSwitcher
            role={role}
            canEdit={canSwitchRole}
            onRoleChange={onRoleChange}
            onPreloadRole={onPreloadRole}
          />
        ) : null}
        {toolbarActions}
        {extraMenuItems ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type='button' variant='ghost' size='icon-sm' aria-label='More file actions'>
                <Ellipsis className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              {extraMenuItems}
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
