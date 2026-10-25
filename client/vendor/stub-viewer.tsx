import * as React from 'react';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { IconPlaceholder } from './icon-placeholder';
import { cn } from './lib/utils';

export interface StubViewerProps {
  src?: string;
  fileName?: string;
  className?: string;
  showToolbar?: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export function PptxViewerPreview(props: StubViewerProps) {
  return <OfficeDocumentPlaceholder {...props} kind='PPTX' />;
}

function OfficeDocumentPlaceholder({
  src,
  fileName,
  kind,
  className,
  showToolbar = true,
  extraMenuItems,
  toolbarActions,
}: StubViewerProps & { kind: 'PPTX' }) {
  const handleDownload = React.useCallback(() => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName ?? `document.${kind.toLowerCase()}`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [fileName, kind, src]);

  return (
    <div
      data-slot={`${kind.toLowerCase()}-viewer`}
      className={cn(
        'flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground',
        className,
      )}
    >
      {showToolbar ? (
        <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 text-xs'>
          <div className='flex min-w-0 items-center gap-2'>
            {fileName ? (
              <span className='truncate font-medium text-foreground'>{fileName}</span>
            ) : null}
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {src ? (
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label='Download file'
                onClick={handleDownload}
              >
                <IconPlaceholder lucide='Download' className='size-3.5' />
              </Button>
            ) : null}
            {extraMenuItems ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label='More file actions'
                  >
                    <IconPlaceholder lucide='Ellipsis' className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-48'>
                  {extraMenuItems}
                  {src ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleDownload}>
                        <IconPlaceholder lucide='Download' className='size-4' />
                        Download
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {toolbarActions}
          </div>
        </div>
      ) : null}
      <div className='flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center'>
        <p className='text-sm font-medium text-foreground'>{kind} preview is coming soon</p>
        {fileName ? <p className='text-xs text-muted-foreground'>{fileName}</p> : null}
      </div>
    </div>
  );
}
