import { FileText } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Lightweight tile for gallery `stage` previews. Kept in its own module with no
 * begonia imports so rendering preview tiles never loads the docx vendor chunk:
 * mounting a full Begonia editor (ProseMirror + docx import) per visible tile
 * would be prohibitively heavy.
 */
export function DocxStagePreview({
  fileName,
  className,
}: {
  fileName?: string;
  className?: string;
}) {
  return (
    <div
      data-testid='begonia-docx-stage'
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center',
        className,
      )}
    >
      <FileText className='size-8 text-muted-foreground' />
      <p className='line-clamp-2 text-xs font-medium text-foreground'>{fileName}</p>
      <p className='text-[10px] text-muted-foreground'>Word document</p>
    </div>
  );
}
