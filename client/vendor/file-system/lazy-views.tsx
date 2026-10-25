'use client';

import { lazyWithPreload } from '../../lazy-with-preload';
import type { FileSystemView } from './types';

export const LazyFileSystemIconsView = lazyWithPreload(() =>
  import('./icons-view').then((m) => ({
    default: m.FileSystemIconsView,
  })),
);
export const LazyFileSystemColumnsView = lazyWithPreload(() =>
  import('./columns-view').then((m) => ({
    default: m.FileSystemColumnsView,
  })),
);
export const LazyFileSystemGalleryView = lazyWithPreload(() =>
  import('./gallery-view').then((m) => ({
    default: m.FileSystemGalleryView,
  })),
);
export const LazyFileSystemDateRangeDialog = lazyWithPreload(() =>
  import('./date-range-dialog').then((m) => ({
    default: m.FileSystemDateRangeDialog,
  })),
);

export function preloadFileSystemView(viewMode: FileSystemView): void {
  if (viewMode === 'icons') void LazyFileSystemIconsView.preload();
  else if (viewMode === 'columns') void LazyFileSystemColumnsView.preload();
  else if (viewMode === 'gallery') void LazyFileSystemGalleryView.preload();
}

export function preloadFileSystemDateRangeDialog(): void {
  void LazyFileSystemDateRangeDialog.preload();
}
