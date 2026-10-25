import * as React from 'react';
import { Button } from '../vendor/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../vendor/components/ui/dropdown-menu.js';
import { IconPlaceholder } from '../vendor/icon-placeholder.js';
import { cn } from '../vendor/lib/utils.js';

const IMAGE_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export interface ImageViewerProps {
  src: string;
  fileName?: string;
  className?: string;
  showToolbar?: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export function ImageViewer({
  src,
  fileName,
  className,
  showToolbar = true,
  extraMenuItems,
  toolbarActions,
}: ImageViewerProps) {
  const [zoom, setZoom] = React.useState<'fit' | number>('fit');
  const [rotation, setRotation] = React.useState(0);
  const [dimensions, setDimensions] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  React.useEffect(() => {
    setZoom('fit');
    setRotation(0);
    setDimensions(null);
  }, [src]);

  const handleZoomOut = React.useCallback(() => {
    setZoom((current) => {
      const numeric = typeof current === 'number' ? current : 1;
      for (let i = IMAGE_ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
        if (IMAGE_ZOOM_STEPS[i] < numeric - 0.001) {
          return IMAGE_ZOOM_STEPS[i];
        }
      }
      return IMAGE_ZOOM_STEPS[0];
    });
  }, []);

  const handleZoomIn = React.useCallback(() => {
    setZoom((current) => {
      const numeric = typeof current === 'number' ? current : 1;
      for (const step of IMAGE_ZOOM_STEPS) {
        if (step > numeric + 0.001) {
          return step;
        }
      }
      return IMAGE_ZOOM_STEPS[IMAGE_ZOOM_STEPS.length - 1];
    });
  }, []);

  const handleToggleFit = React.useCallback(() => {
    setZoom((current) => (current === 'fit' ? 1 : 'fit'));
  }, []);

  const handleRotate = React.useCallback(() => {
    setRotation((current) => (current + 90) % 360);
  }, []);

  const handleDownload = React.useCallback(() => {
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName ?? 'image';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [fileName, src]);

  if (!showToolbar) {
    return (
      <img
        src={src}
        alt={fileName ?? 'Image preview'}
        className={cn('max-h-full max-w-full rounded-lg object-contain', className)}
      />
    );
  }

  const isFit = zoom === 'fit';
  const zoomLabel = isFit ? 'Fit' : `${Math.round(zoom * 100)}%`;

  return (
    <div
      data-slot='image-viewer'
      className={cn(
        'flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground',
        className,
      )}
    >
      <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 text-xs'>
        <div className='flex min-w-0 items-center gap-2 text-muted-foreground'>
          {fileName ? (
            <span className='truncate font-medium text-foreground'>{fileName}</span>
          ) : null}
          {dimensions ? (
            <span>
              {dimensions.width} × {dimensions.height}
            </span>
          ) : null}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Zoom out'
            onClick={handleZoomOut}
          >
            <IconPlaceholder lucide='Minus' className='size-3.5' />
          </Button>
          <Button
            type='button'
            variant={isFit ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 min-w-12 px-2 text-xs tabular-nums'
            aria-label='Toggle fit or 100% zoom'
            onClick={handleToggleFit}
          >
            {zoomLabel}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Zoom in'
            onClick={handleZoomIn}
          >
            <IconPlaceholder lucide='Plus' className='size-3.5' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Rotate image'
            onClick={handleRotate}
          >
            <IconPlaceholder lucide='RotateCw' className='size-3.5' />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type='button' variant='ghost' size='icon-sm' aria-label='More file actions'>
                <IconPlaceholder lucide='Ellipsis' className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              {extraMenuItems ? (
                <>
                  {extraMenuItems}
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onClick={handleDownload}>
                <IconPlaceholder lucide='Download' className='size-4' />
                Download
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {toolbarActions}
        </div>
      </div>
      <div className='flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/10 p-4'>
        <img
          src={src}
          alt={fileName ?? 'Image preview'}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setDimensions({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }
          }}
          style={{
            transform:
              [
                rotation ? `rotate(${rotation}deg)` : '',
                typeof zoom === 'number' ? `scale(${zoom})` : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined,
            transformOrigin: 'center center',
          }}
          className={cn(
            'rounded-lg object-contain transition-transform duration-150',
            isFit && 'max-h-full max-w-full',
          )}
        />
      </div>
    </div>
  );
}
