import * as React from 'react';

import { Button } from '../components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { IconPlaceholder } from '../icon-placeholder';
import { cn } from '../lib/utils';
import {
  DATE_FILTER_PRESETS,
  FILE_TYPE_FILTER_GROUPS,
  FILTER_OPERATOR_LABELS,
  FILTER_TYPE_LABELS,
  filterOperatorChoices,
  isCustomDateRangeValue,
  type FileSystemDateFilterType,
  type FileSystemFilter,
  type FileSystemFilterOperator,
  type FileTypeFilterOption,
} from './filter-types';
import { Calendar03Glyph, File01Glyph, FileTypeIcon } from './icons';
import {
  SORT_OPTIONS,
  TOOLBAR_ICON_BUTTON_CLASSNAME,
  type FileSystemSortKey,
  type FileSystemSortState,
} from './types';

export function FileSystemSearchField({
  inputRef,
  isExpanded,
  layout,
  onExpandedChange,
  onValueChange,
  value,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isExpanded: boolean;
  layout: 'full' | 'compact' | 'minimal';
  onExpandedChange: (isExpanded: boolean) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const isInline = layout === 'full';

  React.useEffect(() => {
    if (!isInline && isExpanded) inputRef.current?.focus();
  }, [inputRef, isExpanded, isInline]);

  const input = (
    <div
      className={cn(
        'relative flex h-7 min-w-0 flex-1 items-center rounded-lg border border-input bg-popover text-sm text-foreground shadow-xs/5 transition-shadow outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-focus-within:before:shadow-[0_1px_--theme(--color-black/4%)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background dark:bg-input/32 dark:not-focus-within:before:shadow-[0_-1px_--theme(--color-white/6%)]',
        isInline && 'max-w-56',
      )}
    >
      <IconPlaceholder
        lucide='Search'
        tabler='IconSearch'
        hugeicons='Search01Icon'
        phosphor='MagnifyingGlassIcon'
        remixicon='RiSearchLine'
        className='pointer-events-none absolute left-2 size-3.5 text-muted-foreground'
      />
      <input
        ref={inputRef}
        type='text'
        role='searchbox'
        aria-label='Search files'
        placeholder='Search'
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          if (value) {
            onValueChange('');
          } else {
            onExpandedChange(false);
            event.currentTarget.blur();
          }
        }}
        className='h-full w-full min-w-0 rounded-[inherit] bg-transparent pr-6 pl-7 outline-none placeholder:text-muted-foreground'
      />
      {value ? (
        <button
          type='button'
          aria-label='Clear search'
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
          className='absolute right-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        >
          <IconPlaceholder
            lucide='X'
            tabler='IconX'
            hugeicons='Cancel01Icon'
            phosphor='XIcon'
            remixicon='RiCloseLine'
            className='size-3'
          />
        </button>
      ) : null}
    </div>
  );

  if (isInline) {
    return <div className='flex w-56 min-w-32 items-center'>{input}</div>;
  }

  return (
    <Popover open={isExpanded} onOpenChange={onExpandedChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Search'
          title='Search'
          className={cn(TOOLBAR_ICON_BUTTON_CLASSNAME, 'relative')}
        >
          <IconPlaceholder
            lucide='Search'
            tabler='IconSearch'
            hugeicons='Search01Icon'
            phosphor='MagnifyingGlassIcon'
            remixicon='RiSearchLine'
            className='size-4'
          />
          {value ? (
            <span className='absolute top-1 right-1 size-1.5 rounded-full bg-primary' />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' sideOffset={6} className='w-64 p-1'>
        {input}
      </PopoverContent>
    </Popover>
  );
}

export function FileSystemSortSelect({
  layout,
  onKeyChange,
  showLabel,
  sort,
}: {
  layout: 'full' | 'compact' | 'minimal';
  onKeyChange: (key: FileSystemSortKey) => void;
  showLabel: boolean;
  sort: FileSystemSortState;
}) {
  const activeOption = SORT_OPTIONS.find((option) => option.key === sort.key);

  return (
    <Select value={sort.key} onValueChange={(value) => onKeyChange(value as FileSystemSortKey)}>
      <SelectTrigger
        size='sm'
        aria-label='Sort by'
        title='Sort by'
        className='h-7 min-h-7 w-auto min-w-0 shrink-0 [&_svg]:size-4'
      >
        <SelectValue>
          <span className='flex items-center gap-1.5'>
            <IconPlaceholder
              lucide='ArrowUpDown'
              tabler='IconArrowsUpDown'
              hugeicons='ArrowUpDownIcon'
              phosphor='ArrowsDownUpIcon'
              remixicon='RiArrowUpDownLine'
              className='size-4'
            />
            {layout === 'full' && showLabel ? activeOption?.triggerLabel : null}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align='end' alignItemWithTrigger={false}>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FileSystemFileTypeCommand({
  checkedMimes,
  onToggle,
  options,
}: {
  checkedMimes: string[];
  onToggle: (mime: string, checked: boolean) => void;
  options: FileTypeFilterOption[];
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Command
      className='-m-1 w-[calc(100%+--spacing(2))] bg-transparent'
      onKeyDown={(event) => {
        if (event.key !== 'Escape' && event.key !== 'Tab') {
          event.stopPropagation();
        }
      }}
    >
      <CommandInput ref={inputRef} placeholder='Search file types…' className='h-9' />
      <CommandList className='max-h-none'>
        <CommandEmpty>No file types found.</CommandEmpty>
        <ScrollArea orientation='vertical' className='h-auto max-h-64'>
          {FILE_TYPE_FILTER_GROUPS.map((group) => {
            const groupOptions = options.filter((option) => option.group === group);

            if (groupOptions.length === 0) return null;

            return (
              <CommandGroup key={group} heading={group}>
                {groupOptions.map((option) => {
                  const isChecked = checkedMimes.includes(option.mime);

                  return (
                    <CommandItem
                      key={option.mime}
                      value={option.label}
                      keywords={[option.mime]}
                      onSelect={() => onToggle(option.mime, !isChecked)}
                    >
                      <IconPlaceholder
                        lucide='Check'
                        tabler='IconCheck'
                        hugeicons='Tick02Icon'
                        phosphor='CheckIcon'
                        remixicon='RiCheckLine'
                        className={cn('size-4 text-foreground', !isChecked && 'opacity-0')}
                      />
                      <FileTypeIcon fileName={option.iconFileName} className='size-4' />
                      {option.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </ScrollArea>
      </CommandList>
    </Command>
  );
}

export function FileSystemFilterMenu({
  fileTypeOptions,
  filters,
  onOpenCustomRange,
  onSelectDatePreset,
  onToggleFileType,
}: {
  fileTypeOptions: FileTypeFilterOption[];
  filters: FileSystemFilter[];
  onOpenCustomRange: (type: FileSystemDateFilterType) => void;
  onSelectDatePreset: (type: FileSystemDateFilterType, preset: string) => void;
  onToggleFileType: (mime: string, checked: boolean) => void;
}) {
  const fileTypeFilter = filters.find((filter) => filter.type === 'fileType');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label='Filter'
          title='Filter'
          className='relative size-7 sm:size-7'
        >
          <IconPlaceholder
            lucide='Filter'
            tabler='IconFilter'
            hugeicons='FilterIcon'
            phosphor='FunnelIcon'
            remixicon='RiFilterLine'
            className='size-4'
          />
          {filters.length > 0 ? (
            <span className='absolute top-1 right-1 size-1.5 rounded-full bg-primary' />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-44'>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconPlaceholder
              lucide='FileArchiveIcon'
              tabler='IconFileZip'
              hugeicons='File01Icon'
              phosphor='FileZipIcon'
              remixicon='RiFileZipLine'
              className='size-4 text-muted-foreground'
            />
            File type
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='w-60'>
            <FileSystemFileTypeCommand
              checkedMimes={fileTypeFilter?.value ?? []}
              onToggle={onToggleFileType}
              options={fileTypeOptions}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {(['dateModified', 'dateCreated'] as const).map((type) => (
          <DropdownMenuSub key={type}>
            <DropdownMenuSubTrigger>
              <IconPlaceholder
                lucide='Calendar'
                tabler='IconCalendar'
                hugeicons='Calendar03Icon'
                phosphor='CalendarIcon'
                remixicon='RiCalendarLine'
                className='size-4 text-muted-foreground'
              />
              {FILTER_TYPE_LABELS[type]}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ScrollArea orientation='vertical' className='h-auto max-h-72'>
                {DATE_FILTER_PRESETS.map((preset) => (
                  <DropdownMenuItem key={preset} onClick={() => onSelectDatePreset(type, preset)}>
                    {preset}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => onOpenCustomRange(type)}>
                  Custom date range…
                </DropdownMenuItem>
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FILTER_PILL_SEGMENT_CLASSNAME =
  'flex h-5 items-center gap-1 border border-l-0 bg-background px-1.5 whitespace-nowrap text-foreground';

const FILTER_PILL_BUTTON_CLASSNAME = cn(
  FILTER_PILL_SEGMENT_CLASSNAME,
  'transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
);

export function FileSystemFilterPill({
  fileTypeOptions,
  filter,
  onOpenCustomRange,
  onOperatorChange,
  onRemove,
  onSelectDatePreset,
  onToggleFileType,
}: {
  fileTypeOptions: FileTypeFilterOption[];
  filter: FileSystemFilter;
  onOpenCustomRange?: () => void;
  onOperatorChange: (operator: FileSystemFilterOperator) => void;
  onRemove: () => void;
  onSelectDatePreset: (preset: string) => void;
  onToggleFileType: (mime: string, checked: boolean) => void;
}) {
  const isCustomRange = filter.type !== 'fileType' && isCustomDateRangeValue(filter.value);
  const selectedTypeLabels =
    filter.type === 'fileType'
      ? filter.value.map(
          (mime) => fileTypeOptions.find((option) => option.mime === mime)?.label ?? mime,
        )
      : [];

  return (
    <div className='flex items-center text-xs'>
      <span className={cn(FILTER_PILL_SEGMENT_CLASSNAME, 'rounded-l-md border-l text-primary')}>
        {filter.type === 'fileType' ? (
          <File01Glyph className='size-3' />
        ) : (
          <Calendar03Glyph className='size-3' />
        )}
        {FILTER_TYPE_LABELS[filter.type]}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type='button' className={cn(FILTER_PILL_BUTTON_CLASSNAME, 'text-primary')}>
            {FILTER_OPERATOR_LABELS[filter.operator]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='min-w-28'>
          {filterOperatorChoices(filter).map((operator) => (
            <DropdownMenuItem key={operator} onClick={() => onOperatorChange(operator)}>
              {FILTER_OPERATOR_LABELS[operator]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {filter.type === 'fileType' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              title={selectedTypeLabels.join(', ')}
              className={FILTER_PILL_BUTTON_CLASSNAME}
            >
              {filter.value.length === 1
                ? selectedTypeLabels[0]
                : `${filter.value.length} selected`}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='w-60'>
            <FileSystemFileTypeCommand
              checkedMimes={filter.value}
              onToggle={onToggleFileType}
              options={fileTypeOptions}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : isCustomRange ? (
        <button type='button' onClick={onOpenCustomRange} className={FILTER_PILL_BUTTON_CLASSNAME}>
          {filter.value.map((value) => new Date(value).toLocaleDateString('en-US')).join(' – ')}
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type='button' className={FILTER_PILL_BUTTON_CLASSNAME}>
              {filter.value[0]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <ScrollArea orientation='vertical' className='h-auto max-h-72'>
              {DATE_FILTER_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset} onClick={() => onSelectDatePreset(preset)}>
                  {preset}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={onOpenCustomRange}>Custom date range…</DropdownMenuItem>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button
        type='button'
        aria-label={`Remove ${FILTER_TYPE_LABELS[filter.type]} filter`}
        onClick={onRemove}
        className={cn(
          FILTER_PILL_BUTTON_CLASSNAME,
          'rounded-r-md px-1 text-muted-foreground hover:text-foreground',
        )}
      >
        <IconPlaceholder
          lucide='X'
          tabler='IconX'
          hugeicons='Cancel01Icon'
          phosphor='XIcon'
          remixicon='RiCloseLine'
          className='size-3'
        />
      </button>
    </div>
  );
}
