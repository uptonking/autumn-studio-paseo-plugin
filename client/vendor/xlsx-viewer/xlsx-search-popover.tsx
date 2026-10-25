'use client';

import * as React from 'react';
import { useXlsxViewer, type XlsxTableHeaderMenuRenderProps } from '@extend-ai/react-xlsx';
import { ArrowRight, ChevronLeft, MoreHorizontal, Search, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { cn } from '../lib/utils';
import {
  cellAddressToA1,
  findXlsxSearchResults,
  scrollXlsxCellIntoView,
  type XlsxSearchResult,
} from './xlsx-search-utils';

const XLSX_SEARCH_DEBOUNCE_MS = 250;

export function WorkbookTableHeaderMenu({
  direction,
  sortAscending,
  sortDescending,
  triggerIcon,
  triggerProps,
}: XlsxTableHeaderMenuRenderProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          {...triggerProps}
          type='button'
          variant='ghost'
          size='icon-sm'
          className={cn('size-6 rounded-sm', triggerProps.className)}
          aria-label='Column menu'
        >
          {triggerIcon ?? <MoreHorizontal className='size-3.5' />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='z-40 w-40'>
        <DropdownMenuRadioGroup
          value={direction ?? ''}
          onValueChange={(value) => {
            if (value === 'ascending') {
              sortAscending();
            } else {
              sortDescending();
            }
            setOpen(false);
          }}
        >
          <DropdownMenuRadioItem value='ascending'>Sort ascending</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='descending'>Sort descending</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkbookSearchPopover({
  viewportRef,
  openRequest = 0,
}: {
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  openRequest?: number;
}) {
  const controller = useXlsxViewer();
  const [open, setOpen] = React.useState(false);
  const [searchDraft, setSearchDraft] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<XlsxSearchResult[]>([]);
  const [activeResultIndex, setActiveResultIndex] = React.useState(0);
  const [isSearching, setIsSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const controllerRef = React.useRef(controller);
  const searchRequestIdRef = React.useRef(0);
  const appliedResultKeyRef = React.useRef('');
  const activeResult = searchResults[activeResultIndex] ?? null;
  const activeResultKey = activeResult
    ? `${activeResult.workbookSheetIndex}:${activeResult.cell.row}:${activeResult.cell.col}`
    : '';
  const controlsDisabled =
    controller.isLoading || Boolean(controller.error) || !controller.sheets.length;
  const hasActiveQuery = Boolean(searchQuery.trim());
  const resultLabel = isSearching
    ? 'Searching…'
    : !hasActiveQuery
      ? 'Type to search cells & formulas'
      : searchResults.length
        ? `${activeResultIndex + 1} / ${searchResults.length}`
        : 'No results';

  React.useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  React.useEffect(() => {
    if (!openRequest || controlsDisabled) return;
    setOpen(true);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [controlsDisabled, openRequest]);

  const runSearch = React.useCallback((rawQuery: string) => {
    const nextQuery = rawQuery.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    appliedResultKeyRef.current = '';
    setSearchQuery(nextQuery);
    setActiveResultIndex(0);

    if (!nextQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    void findXlsxSearchResults(controllerRef.current, nextQuery)
      .then((nextResults) => {
        if (searchRequestIdRef.current !== requestId) return;
        setSearchResults(nextResults);
      })
      .catch(() => {
        if (searchRequestIdRef.current !== requestId) return;
        setSearchResults([]);
      })
      .finally(() => {
        if (searchRequestIdRef.current !== requestId) return;
        setIsSearching(false);
      });
  }, []);

  React.useEffect(() => {
    if (!searchDraft.trim()) return;
    const timeoutId = window.setTimeout(() => {
      runSearch(searchDraft);
    }, XLSX_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [runSearch, searchDraft]);

  const handleSearchDraftChange = (nextDraft: string) => {
    searchRequestIdRef.current += 1;
    setSearchDraft(nextDraft);
    if (!nextDraft.trim()) {
      runSearch('');
      return;
    }
    setIsSearching(true);
  };

  const clearSearch = React.useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchDraft('');
    setSearchQuery('');
    setSearchResults([]);
    setActiveResultIndex(0);
    setIsSearching(false);
    appliedResultKeyRef.current = '';
    controller.clearSelection();
  }, [controller]);

  const goToRelativeResult = React.useCallback(
    (direction: 1 | -1) => {
      if (!searchResults.length) return;
      setActiveResultIndex(
        (currentIndex) => (currentIndex + direction + searchResults.length) % searchResults.length,
      );
    },
    [searchResults.length],
  );

  React.useEffect(() => {
    if (!activeResult) return;

    if (controller.activeSheetIndex !== activeResult.sheetIndex) {
      appliedResultKeyRef.current = '';
      controller.setActiveSheetIndex(activeResult.sheetIndex);
      return;
    }

    if (appliedResultKeyRef.current === activeResultKey) return;
    appliedResultKeyRef.current = activeResultKey;
    controller.selectCell(activeResult.cell);

    const frame = window.requestAnimationFrame(() => {
      scrollXlsxCellIntoView({
        controller,
        result: activeResult,
        viewport: viewportRef?.current ?? null,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeResult, activeResultKey, controller, controller.activeSheetIndex, viewportRef]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          data-testid='xlsx-search-trigger'
          aria-label='Search workbook'
          title='Search workbook (Cmd/Ctrl+F)'
          disabled={controlsDisabled}
          className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
        >
          <Search className='size-3.5' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='z-40 w-72 p-3'>
        <div className='space-y-2.5'>
          <div className='relative flex items-center'>
            <Input
              ref={inputRef}
              data-testid='xlsx-search-input'
              placeholder='Search workbook…'
              value={searchDraft}
              onChange={(event) => handleSearchDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                  return;
                }
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (event.shiftKey && searchResults.length) {
                  goToRelativeResult(-1);
                } else if (searchResults.length) {
                  goToRelativeResult(1);
                } else if (searchDraft.trim()) {
                  runSearch(searchDraft);
                }
              }}
              className='h-7 pr-7 text-xs'
            />
            {searchDraft ? (
              <button
                type='button'
                aria-label='Clear search'
                onClick={clearSearch}
                className='absolute right-1.5 inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground'
              >
                <X className='size-3' />
              </button>
            ) : null}
          </div>

          <div className='flex items-center justify-between gap-2'>
            <div className='min-w-0 text-[11px] text-muted-foreground'>
              <div className='truncate' data-testid='xlsx-search-status'>
                {resultLabel}
              </div>
              {activeResult ? (
                <div
                  className='mt-0.5 truncate font-mono text-[10px] text-foreground'
                  data-testid='xlsx-search-active-match'
                >
                  {activeResult.sheetName}!{cellAddressToA1(activeResult.cell)}
                </div>
              ) : null}
            </div>

            <div className='flex shrink-0 items-center gap-1'>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                aria-label='Previous result'
                data-testid='xlsx-search-prev'
                disabled={isSearching || searchResults.length === 0}
                onClick={() => goToRelativeResult(-1)}
              >
                <ChevronLeft className='size-3.5' />
              </Button>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                aria-label='Next result'
                data-testid='xlsx-search-next'
                disabled={isSearching || searchResults.length === 0}
                onClick={() => goToRelativeResult(1)}
              >
                <ArrowRight className='size-3.5' />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
