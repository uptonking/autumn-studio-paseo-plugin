import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { AiTextVersionRecord } from '../../shared/contracts.js';
import { Button } from '../vendor/components/ui/button.js';
import { cn } from '../vendor/lib/utils.js';

export function AiTextVersionToolbar({
  fileName,
  versions,
  activeVersion,
  isExtracting,
  onSelectVersion,
  onDeleteVersion,
}: {
  fileName: string;
  versions: readonly AiTextVersionRecord[];
  activeVersion: AiTextVersionRecord | null;
  isExtracting: boolean;
  onSelectVersion(versionId: string): void;
  onDeleteVersion(versionId: string): void;
}) {
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimer = React.useCallback(() => {
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearConfirmTimer(), [clearConfirmTimer]);

  React.useEffect(() => {
    if (confirmingDeleteId && confirmingDeleteId !== activeVersion?.id) {
      clearConfirmTimer();
      setConfirmingDeleteId(null);
    }
  }, [activeVersion?.id, clearConfirmTimer, confirmingDeleteId]);

  const requestDelete = React.useCallback(
    (versionId: string) => {
      if (confirmingDeleteId === versionId) {
        clearConfirmTimer();
        setConfirmingDeleteId(null);
        onDeleteVersion(versionId);
        return;
      }
      clearConfirmTimer();
      setConfirmingDeleteId(versionId);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmingDeleteId(null);
      }, 3000);
    },
    [clearConfirmTimer, confirmingDeleteId, onDeleteVersion],
  );

  if (versions.length === 0) {
    return <span className='truncate text-muted-foreground'>{fileName}</span>;
  }
  const isConfirmingDelete =
    confirmingDeleteId !== null && confirmingDeleteId === activeVersion?.id;

  return (
    <>
      <select
        data-testid='ai-text-version-select'
        aria-label='Select extracted text version'
        value={activeVersion?.id ?? ''}
        disabled={isExtracting}
        onChange={(e) => onSelectVersion(e.target.value)}
        className='h-7 min-w-[110px] max-w-[210px] flex-1 truncate rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring'
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {`v${version.versionNumber} · ${version.provenance.profileName} (${version.fileName})`}
          </option>
        ))}
      </select>

      {versions.length > 1 ? (
        <span
          data-testid='ai-text-version-count'
          title={`${versions.length} extracted versions — switch with the selector`}
          className='shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground'
        >
          {versions.length} Ver.
        </span>
      ) : null}

      {activeVersion ? (
        <Button
          type='button'
          data-testid='ai-text-version-delete'
          data-confirming={isConfirmingDelete ? 'true' : undefined}
          variant='ghost'
          size='icon-sm'
          disabled={isExtracting}
          aria-label={
            isConfirmingDelete
              ? `Confirm delete v${activeVersion.versionNumber}`
              : `Delete v${activeVersion.versionNumber}`
          }
          title={
            isConfirmingDelete
              ? 'Click again to delete this version'
              : `Delete v${activeVersion.versionNumber} (${activeVersion.fileName})`
          }
          onClick={() => requestDelete(activeVersion.id)}
          className={cn(
            'size-6 gap-1 px-1',
            isConfirmingDelete
              ? 'w-auto bg-destructive/10 text-destructive'
              : 'text-muted-foreground hover:text-destructive',
          )}
        >
          <Trash2 className='size-3' />
          {isConfirmingDelete ? (
            <span className='text-[10px] font-semibold'>Confirm delete</span>
          ) : null}
        </Button>
      ) : null}
    </>
  );
}
