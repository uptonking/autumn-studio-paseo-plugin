import * as React from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useSearch } from '@embedpdf/plugin-search/react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { IconPlaceholder } from '../icon-placeholder';
import { ToolbarTooltip } from './toolbar';
import { PDF_SEARCH_DEBOUNCE_MS } from './types';

export function PDFViewerSearchControl({
  documentId,
  controlsDisabled,
  openRequest = 0,
}: {
  documentId: string;
  controlsDisabled: boolean;
  openRequest?: number;
}) {
  const { state, provides } = useSearch(documentId);
  const { provides: scroll } = useScroll(documentId);
  const [open, setOpen] = React.useState(false);
  const [searchDraft, setSearchDraft] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const providesRef = React.useRef(provides);
  const scrollRef = React.useRef(scroll);
  const searchRequestIdRef = React.useRef(0);
  const hasActiveQuery = Boolean(searchQuery.trim());
  const resultLabel = isSearching
    ? 'Searching'
    : !hasActiveQuery
      ? 'No search'
      : state.total
        ? `${state.activeResultIndex + 1} / ${state.total}`
        : 'No results';

  React.useEffect(() => {
    if (!openRequest || controlsDisabled) return;
    setOpen(true);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [controlsDisabled, openRequest]);

  const scrollToResult = React.useCallback(
    (index: number) => {
      const result = state.results[index];

      if (!result || !scroll) return;

      const firstRect = result.rects[0];

      scroll.scrollToPage({
        pageNumber: result.pageIndex + 1,
        ...(firstRect
          ? {
              pageCoordinates: {
                x: firstRect.origin.x,
                y: firstRect.origin.y,
              },
              alignY: 30,
            }
          : {}),
        behavior: 'auto',
      });
    },
    [scroll, state.results],
  );

  React.useEffect(() => {
    providesRef.current = provides;
    scrollRef.current = scroll;
  }, [provides, scroll]);

  const runSearch = React.useCallback((rawQuery: string) => {
    const query = rawQuery.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setSearchQuery(query);

    const searchProvider = providesRef.current;
    const scrollProvider = scrollRef.current;

    if (!searchProvider) {
      setIsSearching(false);
      return;
    }

    if (!query) {
      searchProvider.stopSearch();
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchProvider.startSearch();
    searchProvider.searchAllPages(query).wait(
      (result) => {
        if (searchRequestIdRef.current !== requestId) return;

        const firstResult = result.results[0];

        if (firstResult && scrollProvider) {
          searchProvider.goToResult(0);
          const firstRect = firstResult.rects[0];

          scrollProvider.scrollToPage({
            pageNumber: firstResult.pageIndex + 1,
            ...(firstRect
              ? {
                  pageCoordinates: {
                    x: firstRect.origin.x,
                    y: firstRect.origin.y,
                  },
                  alignY: 30,
                }
              : {}),
            behavior: 'auto',
          });
        }
        setIsSearching(false);
      },
      () => {
        if (searchRequestIdRef.current !== requestId) return;
        setIsSearching(false);
      },
    );
  }, []);

  React.useEffect(() => {
    if (!searchDraft.trim()) return;

    const timeoutId = window.setTimeout(() => {
      runSearch(searchDraft);
    }, PDF_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [runSearch, searchDraft]);

  const handleSearchDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextDraft = event.target.value;

      setSearchDraft(nextDraft);

      if (nextDraft.trim()) {
        setIsSearching(true);
        return;
      }

      searchRequestIdRef.current += 1;
      setSearchQuery('');
      setIsSearching(false);
      provides?.stopSearch();
    },
    [provides],
  );

  const clearSearch = React.useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchDraft('');
    setSearchQuery('');
    setIsSearching(false);
    provides?.stopSearch();
  }, [provides]);

  const navigate = React.useCallback(
    (direction: 1 | -1) => {
      if (!provides || state.total === 0) return;

      const index = direction === 1 ? provides.nextResult() : provides.previousResult();

      scrollToResult(index);
    },
    [provides, scrollToResult, state.total],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarTooltip label='Search text (Cmd/Ctrl+F)'>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Search text'
            disabled={controlsDisabled}
          >
            <IconPlaceholder
              lucide='Search'
              tabler='IconSearch'
              hugeicons='Search01Icon'
              phosphor='MagnifyingGlassIcon'
              remixicon='RiSearchLine'
              className='size-4'
            />
          </Button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent align='end' className='w-72'>
        <div className='space-y-3'>
          <Input
            ref={inputRef}
            data-testid='pdf-search-input'
            placeholder='Search text'
            value={searchDraft}
            onChange={handleSearchDraftChange}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                return;
              }
              if (event.key !== 'Enter') return;

              event.preventDefault();
              if (event.shiftKey && state.total) {
                navigate(-1);
              } else if (state.total) {
                navigate(1);
              } else if (searchDraft.trim()) {
                runSearch(searchDraft);
              }
            }}
          />
          <div className='flex items-center justify-between gap-2'>
            <div className='min-w-0 text-xs text-muted-foreground'>
              <div className='truncate'>
                {state.total ? (
                  <>
                    <span className='text-primary'>{state.activeResultIndex + 1}</span>
                    {` / ${state.total}`}
                  </>
                ) : (
                  resultLabel
                )}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                aria-label='Previous result'
                disabled={isSearching || state.total === 0}
                onClick={() => navigate(-1)}
              >
                <IconPlaceholder
                  lucide='ChevronLeft'
                  tabler='IconChevronLeft'
                  hugeicons='ArrowLeft01Icon'
                  phosphor='CaretLeftIcon'
                  remixicon='RiArrowLeftSLine'
                  className='size-4'
                />
              </Button>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                aria-label='Next result'
                disabled={isSearching || state.total === 0}
                onClick={() => navigate(1)}
              >
                <IconPlaceholder
                  lucide='ArrowRight'
                  tabler='IconArrowRight'
                  hugeicons='ArrowRight01Icon'
                  phosphor='ArrowRightIcon'
                  remixicon='RiArrowRightLine'
                  className='size-4'
                />
              </Button>
            </div>
          </div>
          <div className='flex justify-end'>
            <Button type='button' variant='outline' size='sm' onClick={clearSearch}>
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
