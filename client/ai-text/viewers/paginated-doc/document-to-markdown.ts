/**
 * Serializes the edited Begonia document back into the AI Text Markdown
 * subset. Explicit page breaks become `<!-- page-break -->` marker lines so
 * the pagination survives a save/reopen round trip; image nodes keep their
 * version-relative asset path (the `name` attr), never the data URL.
 */

import { escapeMarkdownCellText } from '../../../viewers/markdown-blocks.ts';
import type { BegoniaMark, BegoniaNode } from './build-document.ts';
import { PAGE_BREAK_MARKER } from './document-input.ts';

/** Escapes characters that would re-parse as inline markdown tokens. */
function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_[\]~<])/g, '\\$1');
}

interface RunStyle {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  href: string | null;
}

function runStyleFromMarks(marks: readonly BegoniaMark[]): RunStyle {
  const style: RunStyle = { bold: false, italic: false, strike: false, code: false, href: null };
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'strong':
        style.bold = true;
        break;
      case 'em':
        style.italic = true;
        break;
      case 'strike':
        style.strike = true;
        break;
      case 'code':
        style.code = true;
        break;
      case 'link':
        style.href = typeof mark.attrs.href === 'string' ? mark.attrs.href : null;
        break;
    }
  }
  return style;
}

function applyRunStyle(text: string, style: RunStyle): string {
  let result = style.code ? `\`${text}\`` : text;
  if (style.bold) result = `**${result}**`;
  if (style.italic) result = `*${result}*`;
  if (style.strike) result = `~~${result}~~`;
  if (style.href) result = `[${result}](${style.href})`;
  return result;
}

/** Serializes inline content (text, marks, hard breaks, inline images). */
function serializeInlineContent(node: BegoniaNode): string {
  let result = '';
  node.forEach((child) => {
    switch (child.type.name) {
      case 'text': {
        const style = runStyleFromMarks(child.marks);
        const raw = child.text ?? '';
        result += style.code
          ? applyRunStyle(raw, style)
          : applyRunStyle(escapeInlineText(raw), style);
        break;
      }
      case 'hard_break':
        // The bridge's Markdown is line-per-paragraph; a hard break degrades
        // to a space so it does not split the paragraph on re-parse.
        result += ' ';
        break;
      case 'inline_image':
        result += serializeImageNode(child);
        break;
      default:
        result += escapeInlineText(child.textContent);
    }
  });
  return result;
}

function serializeImageNode(node: BegoniaNode): string {
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const name = typeof node.attrs.name === 'string' && node.attrs.name ? node.attrs.name : null;
  if (!name) {
    return alt;
  }
  return `![${alt.replace(/[[\]]/g, '')}](${name})`;
}

function serializeTableNode(node: BegoniaNode): string {
  const rows: string[][] = [];
  node.forEach((rowNode) => {
    const cells: string[] = [];
    rowNode.forEach((cellNode) => {
      cells.push(escapeMarkdownCellText(cellNode.textContent.replace(/\s+/g, ' ').trim()));
    });
    if (cells.length > 0) rows.push(cells);
  });
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push('');
    return padded;
  });
  const [header = [], ...body] = normalized;
  const separator = Array.from({ length: width }, () => '---');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

/**
 * Serializes a list, including nested lists the user created in the editor:
 * each item's paragraph becomes the item line and nested lists are indented
 * by two spaces per level, so no text is lost even though the bridge's
 * Markdown parser re-reads nesting as a flat list (matching the Text view).
 */
function serializeListNode(node: BegoniaNode, ordered: boolean, indent = ''): string {
  const lines: string[] = [];
  let index = 1;
  node.forEach((itemNode) => {
    const marker = `${indent}${ordered ? `${index}.` : '-'}`;
    let hasContent = false;
    itemNode.forEach((child) => {
      if (child.type.name === 'paragraph') {
        const text = serializeInlineContent(child).trim();
        lines.push(hasContent ? `${indent}  ${text}` : `${marker} ${text}`.trimEnd());
        hasContent = true;
        return;
      }
      if (child.type.name === 'bullet_list' || child.type.name === 'ordered_list') {
        lines.push(serializeListNode(child, child.type.name === 'ordered_list', `${indent}  `));
        hasContent = true;
        return;
      }
      const text = child.textContent.trim();
      if (text) {
        const escaped = escapeInlineText(text);
        lines.push(hasContent ? `${indent}  ${escaped}` : `${marker} ${escaped}`);
        hasContent = true;
      }
    });
    if (!hasContent) {
      lines.push(marker);
    }
    index += 1;
  });
  return lines.join('\n');
}

function serializeBlockquoteNode(node: BegoniaNode): string {
  const lines: string[] = [];
  node.forEach((child) => {
    const text =
      child.type.name === 'paragraph' ? serializeInlineContent(child) : child.textContent;
    for (const line of text.split('\n')) {
      lines.push(`> ${line}`.trimEnd());
    }
  });
  return lines.length > 0 ? lines.join('\n') : '>';
}

/** Serializes one top-level block into markdown (may be multi-line). */
function serializeBlock(node: BegoniaNode): string | null {
  switch (node.type.name) {
    case 'paragraph': {
      const text = serializeInlineContent(node).trim();
      return text.length > 0 ? text : null;
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
      const text = serializeInlineContent(node).trim();
      return text.length > 0 ? `${'#'.repeat(level)} ${text}` : null;
    }
    case 'code_block':
      return `\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``;
    case 'blockquote':
      return serializeBlockquoteNode(node);
    case 'bullet_list':
      return serializeListNode(node, false);
    case 'ordered_list':
      return serializeListNode(node, true);
    case 'table':
      return serializeTableNode(node);
    case 'image':
      return serializeImageNode(node);
    case 'horizontal_rule':
      return '---';
    case 'page_break':
      return PAGE_BREAK_MARKER;
    default: {
      // Unknown blocks degrade to their text content instead of vanishing.
      const text = node.textContent.trim();
      return text.length > 0 ? escapeInlineText(text) : null;
    }
  }
}

export function serializeDocumentToMarkdown(doc: BegoniaNode): string {
  const parts: string[] = [];
  doc.forEach((node) => {
    const serialized = serializeBlock(node);
    if (serialized !== null && serialized.length > 0) {
      parts.push(serialized);
    }
  });
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}
