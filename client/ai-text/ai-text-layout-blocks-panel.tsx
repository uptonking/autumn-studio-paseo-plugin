import * as React from 'react';
import { EyeOff, Search } from 'lucide-react';
import {
  isAiTextPageFurniture,
  type AiTextLayoutBlock,
  type AiTextLayoutBlockType,
  type AiTextLayoutDocument,
} from '../../shared/contracts.js';
import { cn } from '../vendor/lib/utils.js';
import { AiTextAssetImage } from './ai-text-asset-image.js';

const BLOCK_TYPE_LABELS: Record<AiTextLayoutBlockType, string> = {
  image: 'Image',
  table: 'Table',
  chart: 'Chart',
  text: 'Text',
  equation: 'Equation',
  list: 'List',
  index: 'Index',
  code: 'Code',
  ref_text: 'Reference',
  header: 'Header',
  footer: 'Footer',
  page_number: 'Page number',
  aside_text: 'Aside',
  page_footnote: 'Footnote',
  doc_title: 'Title',
  paragraph_title: 'Heading',
  unknown: 'Unknown',
};

const VISUAL_BLOCK_TYPES = new Set<AiTextLayoutBlockType>([
  'image',
  'chart',
  // Tables with `image_path` are scanned table crops; showing the crop is
  // more useful than the stripped-text preview.
  'table',
]);

export interface AiTextLayoutBlocksPanelProps {
  layout: AiTextLayoutDocument;
  activeBlockId: string | null;
  onFocusBlock(block: AiTextLayoutBlock): void;
  loadAsset: (assetPath: string) => Promise<{
    mimeType: string;
    base64: string;
  }>;
}

function blockTypeLabel(type: AiTextLayoutBlockType): string {
  return BLOCK_TYPE_LABELS[type] ?? type;
}

export function AiTextLayoutBlocksPanel({
  layout,
  activeBlockId,
  onFocusBlock,
  loadAsset,
}: AiTextLayoutBlocksPanelProps) {
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<AiTextLayoutBlockType | 'all'>('all');
  const [hideFurniture, setHideFurniture] = React.useState(true);
  const activeRef = React.useRef<HTMLButtonElement | null>(null);

  const typeOptions = React.useMemo(() => {
    const seen = new Set<AiTextLayoutBlockType>();
    for (const block of layout.blocks) seen.add(block.type);
    return [...seen].sort((a, b) => blockTypeLabel(a).localeCompare(blockTypeLabel(b)));
  }, [layout]);

  // A filter chosen for one version must not silently match nothing after the
  // active layout changes.
  React.useEffect(() => {
    if (typeFilter !== 'all' && !typeOptions.includes(typeFilter)) {
      setTypeFilter('all');
    }
  }, [typeFilter, typeOptions]);

  const filteredBlocks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return layout.blocks.filter((block) => {
      if (hideFurniture && isAiTextPageFurniture(block.type)) return false;
      if (typeFilter !== 'all' && block.type !== typeFilter) return false;
      if (!normalizedQuery) return true;
      return (
        block.text.toLowerCase().includes(normalizedQuery) ||
        block.type.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [hideFurniture, layout, query, typeFilter]);

  const pages = React.useMemo(() => {
    const grouped = new Map<number, AiTextLayoutBlock[]>();
    for (const block of filteredBlocks) {
      const list = grouped.get(block.pageNumber);
      if (list) list.push(block);
      else grouped.set(block.pageNumber, [block]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [filteredBlocks]);

  React.useEffect(() => {
    const node = activeRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeBlockId]);

  return (
    <div
      data-testid='ai-text-layout-blocks'
      className='flex size-full min-h-0 flex-1 flex-col overflow-hidden'
    >
      {/* Block and page counts live only in the bottom metadata panel — the
          per-page section headers below carry the local counts. */}
      <div className='flex shrink-0 items-center gap-1.5 border-b bg-muted/20 px-2.5 py-2'>
        <label className='relative flex min-w-0 flex-1 items-center'>
          <Search className='pointer-events-none absolute left-2 size-3 text-muted-foreground' />
          <input
            data-testid='ai-text-layout-search'
            type='search'
            value={query}
            placeholder='Search blocks'
            onChange={(event) => setQuery(event.target.value)}
            className='h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring'
          />
        </label>
        <select
          data-testid='ai-text-layout-type-filter'
          aria-label='Filter blocks by type'
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as AiTextLayoutBlockType | 'all')}
          className='h-7 max-w-[110px] rounded-md border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring'
        >
          <option value='all'>All types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {blockTypeLabel(type)}
            </option>
          ))}
        </select>
        <button
          type='button'
          data-testid='ai-text-layout-hide-furniture'
          aria-pressed={hideFurniture}
          title={
            hideFurniture
              ? 'Show headers, footers, and page numbers'
              : 'Hide headers, footers, and page numbers'
          }
          onClick={() => setHideFurniture((current) => !current)}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors',
            hideFurniture
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          <EyeOff className='size-3' />
          <span>Furniture</span>
        </button>
      </div>

      <div className='min-h-0 flex-1 overflow-auto'>
        {pages.length === 0 ? (
          <p className='p-4 text-center text-xs text-muted-foreground'>
            No blocks match this filter.
          </p>
        ) : (
          pages.map(([pageNumber, blocks]) => (
            <section key={pageNumber} data-testid={`ai-text-layout-page-${pageNumber}`}>
              <div className='sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur'>
                <span>Page {pageNumber}</span>
                <span>{blocks.length} blocks</span>
              </div>
              <div className='flex flex-col gap-1 p-1.5'>
                {blocks.map((block) => {
                  const isActive = block.id === activeBlockId;
                  const showThumbnail =
                    Boolean(block.imagePath) && VISUAL_BLOCK_TYPES.has(block.type);
                  return (
                    <button
                      key={block.id}
                      ref={isActive ? activeRef : undefined}
                      type='button'
                      data-testid={`ai-text-layout-block-${block.id}`}
                      aria-pressed={isActive}
                      onClick={() => onFocusBlock(block)}
                      style={{
                        contentVisibility: 'auto',
                        containIntrinsicSize: '72px',
                      }}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-md border px-2 py-1.5 text-left transition-colors',
                        isActive
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border/70 bg-background hover:border-border hover:bg-muted/30',
                      )}
                    >
                      <span className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
                        <span
                          className={cn(
                            'rounded px-1 py-0.5 font-medium',
                            isActive ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {blockTypeLabel(block.type)}
                        </span>
                        <span>p{block.pageNumber}</span>
                        {block.level ? <span>h{block.level}</span> : null}
                        {block.confidence !== undefined ? (
                          <span className='ml-auto tabular-nums'>
                            {Math.round(block.confidence * 100)}%
                          </span>
                        ) : null}
                      </span>
                      {showThumbnail && block.imagePath ? (
                        <AiTextAssetImage
                          assetPath={block.imagePath}
                          alt={block.text || blockTypeLabel(block.type)}
                          loadAsset={loadAsset}
                          className='max-h-40 w-full object-contain'
                        />
                      ) : null}
                      {block.text ? (
                        <span className='line-clamp-4 text-[11px] leading-4 whitespace-pre-wrap text-foreground/90'>
                          {block.text}
                        </span>
                      ) : !showThumbnail ? (
                        <span className='text-[11px] italic text-muted-foreground'>
                          No text content
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
