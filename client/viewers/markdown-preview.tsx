import * as React from "react";
import { cn } from "../vendor/lib/utils.js";
import { isMarkdownFileName } from "../view-props.js";

export { isMarkdownFileName };

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith("`") && raw.endsWith("`")) {
      tokens.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"
        >
          {raw.slice(1, -1)}
        </code>,
      );
    } else if (
      (raw.startsWith("**") && raw.endsWith("**")) ||
      (raw.startsWith("__") && raw.endsWith("__"))
    ) {
      tokens.push(
        <strong key={key++} className="font-semibold text-foreground">
          {raw.slice(2, -2)}
        </strong>,
      );
    } else if (raw.startsWith("~~") && raw.endsWith("~~")) {
      tokens.push(
        <del key={key++} className="text-muted-foreground line-through">
          {raw.slice(2, -2)}
        </del>,
      );
    } else if (
      (raw.startsWith("*") && raw.endsWith("*")) ||
      (raw.startsWith("_") && raw.endsWith("_"))
    ) {
      tokens.push(
        <em key={key++} className="italic">
          {raw.slice(1, -1)}
        </em>,
      );
    } else if (raw.startsWith("[")) {
      const closeBracket = raw.indexOf("](");
      const label = raw.slice(1, closeBracket);
      const href = raw.slice(closeBracket + 2, -1);
      tokens.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
        >
          {label}
        </a>,
      );
    } else {
      tokens.push(raw);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

export function MarkdownPreview({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = React.useMemo(() => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? "";

      if (line.trim().startsWith("```")) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
          codeLines.push(lines[i] ?? "");
          i += 1;
        }
        i += 1;
        elements.push(
          <pre
            key={`code-${i}`}
            className="my-2.5 overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-5"
          >
            {lang ? (
              <div className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase select-none">
                {lang}
              </div>
            ) : null}
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        continue;
      }

      if (!line.trim()) {
        i += 1;
        continue;
      }

      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1]!.length;
        const text = headingMatch[2]!;
        const sizeClass =
          level === 1
            ? "mt-3 mb-2 border-b border-border/60 pb-1.5 text-lg font-semibold"
            : level === 2
              ? "mt-3 mb-1.5 text-base font-semibold"
              : "mt-2.5 mb-1 text-sm font-semibold";
        elements.push(
          <div key={`h-${i}`} className={cn("text-foreground", sizeClass)}>
            {renderInlineMarkdown(text)}
          </div>,
        );
        i += 1;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        elements.push(
          <hr key={`hr-${i}`} className="my-3 border-border/70" />,
        );
        i += 1;
        continue;
      }

      if (line.trim().startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
          quoteLines.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
          i += 1;
        }
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-2 border-l-2 border-primary/50 pl-3 text-xs leading-5 text-muted-foreground italic"
          >
            {renderInlineMarkdown(quoteLines.join(" "))}
          </blockquote>,
        );
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? "")) {
          listItems.push(
            (lines[i] ?? "").replace(/^\s*([-*+]|\d+\.)\s+/, ""),
          );
          i += 1;
        }
        elements.push(
          <ul
            key={`ul-${i}`}
            className="my-2 list-disc space-y-1 pl-5 text-xs leading-5"
          >
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      elements.push(
        <p key={`p-${i}`} className="my-1.5 text-xs leading-5 text-foreground/90">
          {renderInlineMarkdown(line)}
        </p>,
      );
      i += 1;
    }

    return elements;
  }, [content]);

  return (
    <div
      data-testid="markdown-preview"
      className={cn("min-h-0 flex-1 overflow-auto p-4 text-xs", className)}
    >
      {blocks.length > 0 ? (
        blocks
      ) : (
        <p className="text-xs text-muted-foreground italic">Empty document</p>
      )}
    </div>
  );
}
