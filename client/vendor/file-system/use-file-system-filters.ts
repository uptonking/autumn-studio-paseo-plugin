import * as React from 'react';

import {
  fileMatchesFilter,
  fileTypeFilterGroup,
  isCustomDateRangeValue,
  MIME_TYPE_LABELS,
  mimeTypeForFile,
  type FileSystemDateFilterType,
  type FileSystemFilter,
  type FileTypeFilterOption,
} from './filter-types';
import {
  compareEntriesBySort,
  DEFAULT_SORT,
  defaultSortDirection,
  normalizeSearchQuery,
  pathParent,
  type FileEntry,
  type FileSystemEntry,
  type FileSystemIndex,
  type FileSystemSortKey,
} from './types';

export function useFileSystemFilters({
  currentPath,
  index,
}: {
  currentPath: string;
  index: FileSystemIndex;
}) {
  const [searchInput, setSearchInput] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const searchQuery = normalizeSearchQuery(searchInput);
  const isSearching = searchQuery.length > 0;

  const [sort, setSort] = React.useState(DEFAULT_SORT);
  const [filters, setFilters] = React.useState<FileSystemFilter[]>([]);
  const hasActiveFilters = filters.length > 0;

  const fileFilter = React.useMemo(() => {
    if (filters.length === 0) return null;
    return (file: FileEntry) => filters.every((filter) => fileMatchesFilter(file, filter));
  }, [filters]);

  const visiblePaths = React.useMemo(() => {
    if (!isSearching && !fileFilter) return null;

    const visible = new Set<string>();
    const markVisible = (path: string) => {
      while (path && path !== currentPath && !visible.has(path)) {
        visible.add(path);
        path = pathParent(path);
      }
    };
    const matchesQuery = (path: string) =>
      !isSearching || path.slice(currentPath.length).toLowerCase().includes(searchQuery);

    for (const [path, file] of index.files) {
      if (path === currentPath) continue;
      if (currentPath && !path.startsWith(currentPath)) continue;
      if (!matchesQuery(path)) continue;
      if (fileFilter && !fileFilter(file)) continue;
      markVisible(path);
    }
    if (!fileFilter) {
      for (const path of index.folders.keys()) {
        if (path === currentPath) continue;
        if (currentPath && !path.startsWith(currentPath)) continue;
        if (matchesQuery(path)) markVisible(path);
      }
    }
    return visible;
  }, [currentPath, fileFilter, index, isSearching, searchQuery]);

  const visibleIndex = React.useMemo(() => {
    if (!visiblePaths) return index;

    const children = new Map<string, FileSystemEntry[]>();

    for (const [parentPath, parentChildren] of index.children) {
      const visibleChildren = parentChildren.filter((entry) => visiblePaths.has(entry.path));

      if (visibleChildren.length) children.set(parentPath, visibleChildren);
    }
    return { ...index, children };
  }, [index, visiblePaths]);

  const sortedIndex = React.useMemo(() => {
    if (sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction) {
      return visibleIndex;
    }

    const children = new Map<string, FileSystemEntry[]>();

    for (const [parentPath, parentChildren] of visibleIndex.children) {
      children.set(
        parentPath,
        [...parentChildren].sort((left, right) => compareEntriesBySort(left, right, sort)),
      );
    }
    return { ...visibleIndex, children };
  }, [sort, visibleIndex]);

  const applySortKey = React.useCallback((key: FileSystemSortKey) => {
    setSort((previous) =>
      previous.key === key ? previous : { direction: defaultSortDirection(key), key },
    );
  }, []);

  const toggleSortColumn = React.useCallback((key: FileSystemSortKey) => {
    setSort((previous) =>
      previous.key === key
        ? { direction: previous.direction === 'asc' ? 'desc' : 'asc', key }
        : { direction: defaultSortDirection(key), key },
    );
  }, []);

  const fileTypeOptions = React.useMemo(() => {
    const byMime = new Map<string, FileTypeFilterOption>();

    for (const file of index.files.values()) {
      const mime = mimeTypeForFile(file);

      if (!byMime.has(mime)) {
        const dotIndex = file.name.lastIndexOf('.');
        const extension = dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : '';

        byMime.set(mime, {
          group: fileTypeFilterGroup(mime),
          iconFileName: extension ? `file.${extension}` : file.name,
          label: MIME_TYPE_LABELS[mime] ?? mime,
          mime,
        });
      }
    }
    return [...byMime.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [index]);

  const filterIdRef = React.useRef(0);
  const [dateRangeDialog, setDateRangeDialog] = React.useState<{
    initialRange?: { from: Date; to: Date };
    type: FileSystemDateFilterType;
  } | null>(null);

  const toggleFileTypeFilterValue = React.useCallback((mime: string, checked: boolean) => {
    const id = `filter-${++filterIdRef.current}`;

    setFilters((previous) => {
      const existing = previous.find((filter) => filter.type === 'fileType');

      if (!existing) {
        if (!checked) return previous;
        return [
          ...previous,
          {
            id,
            operator: 'is' as const,
            type: 'fileType' as const,
            value: [mime],
          },
        ];
      }

      const value = checked
        ? [...new Set([...existing.value, mime])]
        : existing.value.filter((entry) => entry !== mime);

      if (value.length === 0) {
        return previous.filter((filter) => filter !== existing);
      }

      const operator =
        existing.operator === 'is' || existing.operator === 'is-any-of'
          ? value.length > 1
            ? ('is-any-of' as const)
            : ('is' as const)
          : existing.operator;

      return previous.map((filter) =>
        filter === existing ? { ...filter, operator, value } : filter,
      );
    });
  }, []);

  const setDatePresetFilter = React.useCallback(
    (type: FileSystemDateFilterType, preset: string) => {
      const id = `filter-${++filterIdRef.current}`;

      setFilters((previous) => [
        ...previous.filter((filter) => filter.type !== type),
        { id, operator: 'after', type, value: [preset] },
      ]);
    },
    [],
  );

  const openDateRangeDialog = React.useCallback(
    (type: FileSystemDateFilterType) => {
      const existing = filters.find((filter) => filter.type === type);

      setDateRangeDialog({
        initialRange:
          existing && isCustomDateRangeValue(existing.value)
            ? {
                from: new Date(existing.value[0]),
                to: new Date(existing.value[1]),
              }
            : undefined,
        type,
      });
    },
    [filters],
  );

  const applyCustomDateRange = React.useCallback(
    (type: FileSystemDateFilterType, from: Date, to: Date) => {
      const id = `filter-${++filterIdRef.current}`;

      setFilters((previous) => {
        const existing = previous.find((filter) => filter.type === type);

        return [
          ...previous.filter((filter) => filter.type !== type),
          {
            id,
            operator:
              existing?.operator === 'not-in-range'
                ? ('not-in-range' as const)
                : ('in-range' as const),
            type,
            value: [from.toISOString(), to.toISOString()],
          },
        ];
      });
    },
    [],
  );

  return {
    applyCustomDateRange,
    applySortKey,
    dateRangeDialog,
    fileFilter,
    fileTypeOptions,
    filters,
    hasActiveFilters,
    isSearchExpanded,
    isSearching,
    openDateRangeDialog,
    searchInput,
    searchInputRef,
    searchQuery,
    setDatePresetFilter,
    setDateRangeDialog,
    setFilters,
    setIsSearchExpanded,
    setSearchInput,
    sort,
    sortedIndex,
    toggleFileTypeFilterValue,
    toggleSortColumn,
    visiblePaths,
  };
}
