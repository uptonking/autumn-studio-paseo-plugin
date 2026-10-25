'use client';

import * as React from 'react';
import {
  Highlighter,
  MousePointer,
  PenTool,
  Redo2,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { PdfEditorTool } from './pdf-save';

export const PDF_EDITOR_COLOR_SWATCHES = [
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Emerald', value: '#10B981' },
  { label: 'Slate', value: '#111827' },
] as const;

export const PDF_EDITOR_FONT_SIZES = [12, 14, 18, 24] as const;

export interface PdfEditorToolStripProps {
  tool: PdfEditorTool;
  activeColor: string;
  activeFontSize: number;
  isActivePageDeleted: boolean;
  canDeletePage: boolean;
  canUndo: boolean;
  canRedo: boolean;
  annotationCount: number;
  onSelectTool: (tool: PdfEditorTool) => void;
  onSelectColor: (color: string) => void;
  onSelectFontSize: (fontSize: number) => void;
  onRotatePage: (deltaDegrees: number) => void;
  onToggleDeletePage: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function PdfEditorToolStrip({
  tool,
  activeColor,
  activeFontSize,
  isActivePageDeleted,
  canDeletePage,
  canUndo,
  canRedo,
  annotationCount,
  onSelectTool,
  onSelectColor,
  onSelectFontSize,
  onRotatePage,
  onToggleDeletePage,
  onUndo,
  onRedo,
}: PdfEditorToolStripProps) {
  return (
    <div
      data-testid='pdf-editor-toolbar'
      className='flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-1 text-xs select-none'
    >
      <div className='flex flex-wrap items-center gap-1'>
        <EditorToolButton
          testId='pdf-editor-tool-select'
          active={tool === 'select'}
          label='Select & Move'
          onClick={() => onSelectTool('select')}
        >
          <MousePointer className='size-3.5' />
          <span>Select</span>
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-tool-text'
          active={tool === 'text'}
          label='Add Text (click page)'
          onClick={() => onSelectTool('text')}
        >
          <Type className='size-3.5' />
          <span>Add Text</span>
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-tool-highlight'
          active={tool === 'highlight'}
          label='Highlight (drag on page)'
          onClick={() => onSelectTool('highlight')}
        >
          <Highlighter className='size-3.5' />
          <span>Highlight</span>
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-tool-rect'
          active={tool === 'rect'}
          label='Box Callout (drag on page)'
          onClick={() => onSelectTool('rect')}
        >
          <Square className='size-3.5' />
          <span>Box</span>
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-tool-ink'
          active={tool === 'ink'}
          label='Draw Ink (drag on page)'
          onClick={() => onSelectTool('ink')}
        >
          <PenTool className='size-3.5' />
          <span>Draw</span>
        </EditorToolButton>

        <div className='mx-1 h-4 w-px bg-border/70' />

        <div className='flex items-center gap-1'>
          {PDF_EDITOR_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type='button'
              title={swatch.label}
              aria-label={`Color ${swatch.label}`}
              onClick={() => onSelectColor(swatch.value)}
              className={cn(
                'size-4 rounded-full border transition-transform',
                activeColor === swatch.value
                  ? 'scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background'
                  : 'border-border/80 opacity-80 hover:opacity-100',
              )}
              style={{ backgroundColor: swatch.value }}
            />
          ))}
        </div>

        <select
          data-testid='pdf-editor-font-size'
          aria-label='Text font size'
          title='Text font size'
          value={String(activeFontSize)}
          onChange={(e) => onSelectFontSize(Number(e.target.value))}
          className='ml-1 h-6.5 rounded-md border border-border/70 bg-background px-1.5 text-[11px] font-medium text-foreground outline-none focus:ring-1 focus:ring-ring'
        >
          {PDF_EDITOR_FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
        </select>

        <div className='mx-1 h-4 w-px bg-border/70' />

        <EditorToolButton
          testId='pdf-editor-rotate-ccw'
          label='Rotate active page -90°'
          onClick={() => onRotatePage(-90)}
        >
          <RotateCcw className='size-3.5' />
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-rotate-cw'
          label='Rotate active page +90°'
          onClick={() => onRotatePage(90)}
        >
          <RotateCw className='size-3.5' />
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-delete-page'
          active={isActivePageDeleted}
          disabled={!canDeletePage}
          label={isActivePageDeleted ? 'Restore active page' : 'Delete active page'}
          onClick={onToggleDeletePage}
        >
          <Trash2 className='size-3.5' />
          <span>{isActivePageDeleted ? 'Restore Page' : 'Delete Page'}</span>
        </EditorToolButton>

        <div className='mx-1 h-4 w-px bg-border/70' />

        <EditorToolButton
          testId='pdf-editor-undo'
          disabled={!canUndo}
          label='Undo last PDF edit (Cmd/Ctrl+Z)'
          onClick={onUndo}
        >
          <Undo2 className='size-3.5' />
          <span>Undo</span>
        </EditorToolButton>
        <EditorToolButton
          testId='pdf-editor-redo'
          disabled={!canRedo}
          label='Redo PDF edit (Cmd/Ctrl+Shift+Z)'
          onClick={onRedo}
        >
          <Redo2 className='size-3.5' />
          <span>Redo</span>
        </EditorToolButton>
      </div>

      <div className='text-[11px] text-muted-foreground'>
        {tool === 'text'
          ? 'Click anywhere on a page to insert text'
          : tool === 'highlight'
            ? 'Drag across a page region to highlight'
            : tool === 'rect'
              ? 'Drag across a page region to draw a box'
              : tool === 'ink'
                ? 'Drag on a page to draw freehand ink'
                : `${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`}
      </div>
    </div>
  );
}

function EditorToolButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type='button'
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-secondary text-foreground shadow-2xs ring-1 ring-border/80'
          : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
