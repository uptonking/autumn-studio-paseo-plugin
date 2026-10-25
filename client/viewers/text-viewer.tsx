import * as React from 'react';
import { EditorSaveControls, SurfaceModeSwitcher } from '../editing/surface-mode-controls.js';
import type { FileEditSession } from '../editing/use-file-edit-session.js';
import { Button } from '../vendor/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../vendor/components/ui/dropdown-menu.js';
import { Spinner } from '../vendor/components/ui/spinner.js';
import { IconPlaceholder } from '../vendor/icon-placeholder.js';
import { cn } from '../vendor/lib/utils.js';
import { isTextViewableFile } from '../view-props.js';
import { isMarkdownFileName, MarkdownPreview } from './markdown-preview.js';
import type { FileSurfaceRole } from './provider-catalog.js';
import { renderLineWithHighlights } from './text-search-render.js';
import { findTextSearchMatches, groupTextMatchesByLine } from './text-search-utils.js';

export { isTextViewableFile };

export interface TextViewerProps {
  src: string;
  fileName?: string;
  className?: string;
  role?: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  defaultShowLineNumbers?: boolean;
  defaultWordWrap?: boolean;
  showLineNumbers?: boolean;
  wordWrap?: boolean;
  showToolbar?: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export function TextViewer({
  src,
  fileName,
  className,
  role = 'viewer',
  canSwitchRole = true,
  onRoleChange,
  editSession,
  defaultShowLineNumbers = true,
  defaultWordWrap = true,
  showLineNumbers: showLineNumbersProp,
  wordWrap: wordWrapProp,
  showToolbar = true,
  extraMenuItems,
  toolbarActions,
}: TextViewerProps) {
  const isEditor = role === 'editor';
  const isMarkdown = React.useMemo(() => isMarkdownFileName(fileName), [fileName]);
  const initialLines = showLineNumbersProp ?? defaultShowLineNumbers;
  const initialWrap = wordWrapProp ?? defaultWordWrap;
  const [content, setContent] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = React.useState(initialLines);
  const [wordWrap, setWordWrap] = React.useState(initialWrap);
  const [showMarkdownPreview, setShowMarkdownPreview] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(0);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const viewerScrollRef = React.useRef<HTMLDivElement | null>(null);
  const loadedFileNameRef = React.useRef<string | undefined>(fileName);
  const contentRef = React.useRef<string | null>(null);
  contentRef.current = content;

  React.useEffect(() => {
    setShowLineNumbers(initialLines);
  }, [initialLines]);

  React.useEffect(() => {
    setWordWrap(initialWrap);
  }, [initialWrap]);

  React.useEffect(() => {
    let cancelled = false;
    const isDifferentFile = loadedFileNameRef.current !== fileName;
    loadedFileNameRef.current = fileName;
    if (isDifferentFile || contentRef.current === null) {
      setContent(null);
    }
    setError(null);

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          contentRef.current = text;
          setContent(text);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read text');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileName, src]);

  const lines = React.useMemo(() => (content !== null ? content.split(/\r?\n/) : []), [content]);

  const searchMatches = React.useMemo(
    () => (searchOpen && searchQuery ? findTextSearchMatches(content, searchQuery) : []),
    [content, searchOpen, searchQuery],
  );

  const matchesByLine = React.useMemo(() => groupTextMatchesByLine(searchMatches), [searchMatches]);

  React.useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  const clampedMatchIndex =
    searchMatches.length > 0 ? Math.min(activeMatchIndex, searchMatches.length - 1) : 0;

  const focusMatch = React.useCallback(
    (targetIndex: number, focusTextarea = false) => {
      const match = searchMatches[targetIndex];
      if (!match) return;
      if (isEditor) {
        const el = textareaRef.current;
        if (el && focusTextarea) {
          el.focus();
          el.setSelectionRange(match.startOffset, match.endOffset);
        }
      } else {
        const rowEl = viewerScrollRef.current?.querySelector<HTMLElement>(
          `[data-line-index="${match.lineIndex}"]`,
        );
        rowEl?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    [isEditor, searchMatches],
  );

  React.useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    focusMatch(clampedMatchIndex, false);
  }, [clampedMatchIndex, focusMatch, searchMatches.length, searchOpen]);

  const stepSearchMatch = React.useCallback(
    (delta: 1 | -1, focusTextarea = false) => {
      if (searchMatches.length === 0) return;
      const next = (clampedMatchIndex + delta + searchMatches.length) % searchMatches.length;
      setActiveMatchIndex(next);
      focusMatch(next, focusTextarea);
    },
    [clampedMatchIndex, focusMatch, searchMatches.length],
  );

  const openSearchBar = React.useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const handleTextChange = React.useCallback(
    (nextText: string) => {
      contentRef.current = nextText;
      setContent(nextText);
      editSession?.reportChange(() => ({
        encoding: 'utf8',
        data: nextText,
        mimeType: isMarkdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
      }));
    },
    [editSession, isMarkdown],
  );

  const flushTextareaValue = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!isEditor || !textarea || !editSession) return;
    if (textarea.value !== contentRef.current) {
      handleTextChange(textarea.value);
    }
  }, [editSession, handleTextChange, isEditor]);

  React.useEffect(() => {
    if (!isEditor || !editSession) return undefined;
    return editSession.registerBeforeSaveFlush(flushTextareaValue);
  }, [editSession, flushTextareaValue, isEditor]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'f'
      ) {
        if (showToolbar) {
          event.preventDefault();
          event.stopPropagation();
          openSearchBar();
          return;
        }
      }
      if (
        isEditor &&
        editSession &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault();
        flushTextareaValue();
        void editSession.saveNow();
      }
    },
    [editSession, flushTextareaValue, isEditor, openSearchBar, showToolbar],
  );

  const handleCopy = React.useCallback(() => {
    if (content === null) return;
    navigator.clipboard?.writeText(content).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [content]);

  const handleDownload = React.useCallback(() => {
    const downloadUrl =
      content !== null
        ? URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
        : src;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName ?? 'file.txt';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (downloadUrl !== src) {
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    }
  }, [content, fileName, src]);

  if (error) {
    return (
      <div
        className={cn(
          'flex size-full min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center',
          className,
        )}
      >
        <p className='text-sm text-destructive'>{error}</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className={cn('grid size-full min-h-0 flex-1 place-items-center', className)}>
        <Spinner className='size-5 text-muted-foreground' />
      </div>
    );
  }

  return (
    <div
      tabIndex={-1}
      data-slot='text-viewer'
      data-testid={isEditor ? 'code-text-editor' : 'code-text-viewer'}
      data-surface-role={role}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground outline-none',
        className,
      )}
    >
      {showToolbar ? (
        <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 text-xs'>
          <div className='flex min-w-0 items-center gap-2 text-muted-foreground'>
            {fileName ? (
              <span className='truncate font-medium text-foreground'>{fileName}</span>
            ) : null}
            <span>{lines.length} lines</span>
          </div>
          <div className='flex shrink-0 items-center gap-1.5'>
            {isEditor && editSession ? <EditorSaveControls editSession={editSession} /> : null}
            {isMarkdown ? (
              <Button
                type='button'
                data-testid='markdown-preview-toggle'
                variant={showMarkdownPreview ? 'secondary' : 'ghost'}
                size='sm'
                className='h-7 px-2 text-xs'
                onClick={() => setShowMarkdownPreview((prev) => !prev)}
              >
                {isEditor ? 'Split Preview' : 'Preview'}
              </Button>
            ) : null}
            <Button
              type='button'
              variant={showLineNumbers ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={() => setShowLineNumbers((prev) => !prev)}
            >
              Lines
            </Button>
            <Button
              type='button'
              variant={wordWrap ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={() => setWordWrap((prev) => !prev)}
            >
              Wrap
            </Button>
            <Button
              type='button'
              data-testid='text-search-toggle'
              variant={searchOpen ? 'secondary' : 'ghost'}
              size='icon-sm'
              aria-label='Find in file'
              title='Find in file (Cmd/Ctrl+F)'
              onClick={() => (searchOpen ? setSearchOpen(false) : openSearchBar())}
            >
              <IconPlaceholder lucide='Search' className='size-3.5' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {onRoleChange ? (
              <SurfaceModeSwitcher
                role={role}
                canEdit={canSwitchRole}
                onRoleChange={onRoleChange}
              />
            ) : null}
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
      ) : null}
      {showToolbar && searchOpen ? (
        <div
          data-testid='text-search-bar'
          className='flex h-9 shrink-0 items-center justify-end gap-1.5 border-b bg-muted/20 px-3 text-xs'
        >
          <input
            ref={searchInputRef}
            data-testid='text-search-input'
            type='text'
            aria-label='Find in file'
            placeholder='Find in file…'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setSearchOpen(false);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                stepSearchMatch(event.shiftKey ? -1 : 1, isEditor);
              }
            }}
            className='h-6 w-48 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring'
          />
          <span className='min-w-14 text-center tabular-nums text-muted-foreground'>
            {!searchQuery
              ? '0 / 0'
              : searchMatches.length > 0
                ? `${clampedMatchIndex + 1} / ${searchMatches.length}`
                : 'No results'}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Previous match'
            disabled={searchMatches.length === 0}
            onClick={() => stepSearchMatch(-1, isEditor)}
          >
            <IconPlaceholder lucide='ChevronUp' className='size-3.5' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Next match'
            disabled={searchMatches.length === 0}
            onClick={() => stepSearchMatch(1, isEditor)}
          >
            <IconPlaceholder lucide='ChevronDown' className='size-3.5' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Close find bar'
            onClick={() => setSearchOpen(false)}
          >
            <IconPlaceholder lucide='X' className='size-3.5' />
          </Button>
        </div>
      ) : null}
      {isEditor ? (
        <div className='flex min-h-0 flex-1 overflow-hidden'>
          <div className='flex min-h-0 min-w-0 flex-1 overflow-hidden'>
            {showLineNumbers ? (
              <div
                aria-hidden='true'
                className='w-11 shrink-0 overflow-hidden border-r border-border/60 bg-muted/20 py-3 pr-2.5 text-right font-mono text-xs leading-5 text-muted-foreground/60 select-none'
              >
                {lines.map((_, idx) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              data-testid='code-text-editor-textarea'
              aria-label={fileName ? `Edit ${fileName}` : 'Edit text file'}
              value={content}
              onChange={(event) => handleTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault();
                  const el = event.currentTarget;
                  const start = el.selectionStart ?? 0;
                  const end = el.selectionEnd ?? start;
                  const next = `${content.slice(0, start)}  ${content.slice(end)}`;
                  handleTextChange(next);
                  requestAnimationFrame(() => {
                    el.selectionStart = start + 2;
                    el.selectionEnd = start + 2;
                  });
                }
              }}
              spellCheck={false}
              wrap={wordWrap ? 'soft' : 'off'}
              className={cn(
                'h-full min-h-0 w-full flex-1 resize-none bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none',
                wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre',
              )}
            />
          </div>
          {isMarkdown && showMarkdownPreview ? (
            <MarkdownPreview content={content} className='border-l border-border/60 bg-muted/10' />
          ) : null}
        </div>
      ) : isMarkdown && showMarkdownPreview ? (
        <MarkdownPreview content={content} />
      ) : (
        <div
          ref={viewerScrollRef}
          className='min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5'
        >
          <table className='w-full border-collapse'>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} data-line-index={idx} className='hover:bg-muted/40'>
                  {showLineNumbers ? (
                    <td className='w-10 pr-3 text-right align-top text-muted-foreground/60 select-none'>
                      {idx + 1}
                    </td>
                  ) : null}
                  <td
                    className={cn(
                      'align-top',
                      wordWrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre',
                    )}
                  >
                    {renderLineWithHighlights(
                      line,
                      matchesByLine.get(idx),
                      searchMatches.length > 0 ? clampedMatchIndex : -1,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TextEditor(props: Omit<TextViewerProps, 'role'>) {
  return <TextViewer {...props} role='editor' />;
}
