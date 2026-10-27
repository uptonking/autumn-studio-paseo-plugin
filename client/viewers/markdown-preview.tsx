import * as React from 'react';
import { cn } from '../vendor/lib/utils.js';
import { isMarkdownFileName } from '../view-props.js';
import {
  isMarkdownTableSeparator,
  parseHtmlTableRows,
  parseMarkdownTableCells,
  tokenizeInlineMarkdown,
} from './markdown-blocks.js';

export { isMarkdownFileName };

export type MarkdownImageRenderer = (src: string, alt: string) => React.ReactNode | null;

function renderInlineMarkdown(
  text: string,
  renderImage?: MarkdownImageRenderer,
): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let key = 0;

  for (const token of tokenizeInlineMarkdown(text)) {
    if (token.kind === 'image') {
      const rendered = renderImage?.(token.src, token.alt);
      tokens.push(rendered ?? token.alt);
    } else if (token.style === 'code') {
      tokens.push(
        <code
          key={key++}
          className='rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground'
        >
          {token.text}
        </code>,
      );
    } else if (token.style === 'bold-italic') {
      tokens.push(
        <strong key={key++} className='font-semibold text-foreground'>
          <em className='italic'>{token.text}</em>
        </strong>,
      );
    } else if (token.style === 'bold') {
      tokens.push(
        <strong key={key++} className='font-semibold text-foreground'>
          {token.text}
        </strong>,
      );
    } else if (token.style === 'strike') {
      tokens.push(
        <del key={key++} className='text-muted-foreground line-through'>
          {token.text}
        </del>,
      );
    } else if (token.style === 'italic') {
      tokens.push(
        <em key={key++} className='italic'>
          {token.text}
        </em>,
      );
    } else if (token.style === 'link' && token.href) {
      tokens.push(
        <a
          key={key++}
          href={token.href}
          target='_blank'
          rel='noopener noreferrer'
          className='font-medium text-primary underline underline-offset-2'
        >
          {token.text}
        </a>,
      );
    } else {
      tokens.push(token.raw);
    }
  }
  return tokens;
}

function renderTableElement(key: string, headers: string[], rows: string[][]): React.ReactNode {
  return (
    <div key={key} className='my-3 overflow-x-auto rounded-md border border-border/80'>
      <table data-testid='markdown-table' className='w-full border-collapse text-left text-xs'>
        <thead className='border-b border-border/80 bg-muted/50'>
          <tr>
            {headers.map((header, idx) => (
              <th key={idx} className='px-3 py-1.5 font-semibold text-foreground'>
                {renderInlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-border/60'>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className='hover:bg-muted/25'>
              {headers.map((_, cIdx) => (
                <td key={cIdx} className='px-3 py-1.5 align-top text-foreground/90'>
                  {renderInlineMarkdown(row[cIdx] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownPreview({
  content,
  className,
  renderImage,
}: {
  content: string;
  className?: string;
  renderImage?: MarkdownImageRenderer;
}) {
  const blocks = React.useMemo(() => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? '';

      const imageOnlyMatch = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
      if (imageOnlyMatch) {
        const alt = imageOnlyMatch[1] ?? '';
        const src = imageOnlyMatch[2] ?? '';
        const rendered = renderImage?.(src, alt);
        if (rendered) {
          elements.push(
            <div key={`img-${i}`} className='my-3'>
              {rendered}
            </div>,
          );
          i += 1;
          continue;
        }
      }

      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
          codeLines.push(lines[i] ?? '');
          i += 1;
        }
        i += 1;
        elements.push(
          <pre
            key={`code-${i}`}
            className='my-2.5 overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-5'
          >
            {lang ? (
              <div className='mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase select-none'>
                {lang}
              </div>
            ) : null}
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        continue;
      }

      if (!line.trim()) {
        i += 1;
        continue;
      }

      // Standalone HTML comments are invisible in rendered Markdown; the
      // Text Pages View uses one to persist page breaks.
      if (/^\s*<!--.*-->\s*$/.test(line)) {
        i += 1;
        continue;
      }

      // Markdown pipe table: | col1 | col2 | followed by | --- | --- |
      if (
        line.trim().startsWith('|') &&
        i + 1 < lines.length &&
        isMarkdownTableSeparator(lines[i + 1] ?? '')
      ) {
        const tableStart = i;
        const headers = parseMarkdownTableCells(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
          rows.push(parseMarkdownTableCells(lines[i] ?? ''));
          i += 1;
        }
        elements.push(renderTableElement(`table-${tableStart}`, headers, rows));
        continue;
      }

      // HTML <table>...</table> block (e.g. from MinerU)
      if (/^\s*<table\b/i.test(line)) {
        const tableStart = i;
        const htmlLines: string[] = [];
        while (i < lines.length) {
          const cur = lines[i] ?? '';
          htmlLines.push(cur);
          i += 1;
          if (/<\/table>/i.test(cur)) break;
        }
        const parsedHtmlTable = parseHtmlTableRows(htmlLines.join('\n'));
        if (parsedHtmlTable) {
          elements.push(
            renderTableElement(
              `html-table-${tableStart}`,
              parsedHtmlTable.headers,
              parsedHtmlTable.rows,
            ),
          );
          continue;
        }
      }

      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const sizeClass =
          level === 1
            ? 'mt-3 mb-2 border-b border-border/60 pb-1.5 text-lg font-semibold'
            : level === 2
              ? 'mt-3 mb-1.5 text-base font-semibold'
              : 'mt-2.5 mb-1 text-sm font-semibold';
        elements.push(
          <div key={`h-${i}`} className={cn('text-foreground', sizeClass)}>
            {renderInlineMarkdown(text, renderImage)}
          </div>,
        );
        i += 1;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        elements.push(<hr key={`hr-${i}`} className='my-3 border-border/70' />);
        i += 1;
        continue;
      }

      if (line.trim().startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
          quoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
          i += 1;
        }
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className='my-2 border-l-2 border-primary/50 pl-3 text-xs leading-5 text-muted-foreground italic'
          >
            {renderInlineMarkdown(quoteLines.join(' '), renderImage)}
          </blockquote>,
        );
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? '')) {
          listItems.push((lines[i] ?? '').replace(/^\s*([-*+]|\d+\.)\s+/, ''));
          i += 1;
        }
        elements.push(
          <ul key={`ul-${i}`} className='my-2 list-disc space-y-1 pl-5 text-xs leading-5'>
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item, renderImage)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      elements.push(
        <p key={`p-${i}`} className='my-1.5 text-xs leading-5 text-foreground/90'>
          {renderInlineMarkdown(line, renderImage)}
        </p>,
      );
      i += 1;
    }

    return elements;
  }, [content, renderImage]);

  return (
    <div
      data-testid='markdown-preview'
      className={cn('min-h-0 flex-1 overflow-auto p-4 text-xs', className)}
    >
      {blocks.length > 0 ? (
        blocks
      ) : (
        <p className='text-xs text-muted-foreground italic'>Empty document</p>
      )}
    </div>
  );
}
