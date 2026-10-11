import * as React from "react";
import { Button } from "../vendor/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../vendor/components/ui/dropdown-menu.js";
import { Spinner } from "../vendor/components/ui/spinner.js";
import { IconPlaceholder } from "../vendor/icon-placeholder.js";
import { cn } from "../vendor/lib/utils.js";

const TEXT_VIEWABLE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cfg",
  "cjs",
  "conf",
  "cpp",
  "css",
  "csv",
  "cts",
  "env",
  "gitignore",
  "go",
  "graphql",
  "gql",
  "h",
  "hpp",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsonc",
  "jsonl",
  "jsx",
  "kt",
  "less",
  "lock",
  "log",
  "lua",
  "md",
  "mdx",
  "mjs",
  "mts",
  "php",
  "pl",
  "prisma",
  "py",
  "r",
  "rb",
  "rs",
  "sass",
  "scala",
  "scss",
  "sh",
  "sql",
  "svelte",
  "swift",
  "tf",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zig",
  "zsh",
]);

const TEXT_VIEWABLE_BASENAMES = new Set([
  ".babelrc",
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".env.example",
  ".env.local",
  ".eslintrc",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  "agents.md",
  "cargo.lock",
  "cargo.toml",
  "claude.md",
  "cmakelists.txt",
  "dockerfile",
  "gemfile",
  "go.mod",
  "go.sum",
  "justfile",
  "license",
  "makefile",
  "procfile",
  "rakefile",
  "readme",
]);

export function isTextViewableFile(file: {
  name?: string;
  path: string;
  contentType?: string;
}): boolean {
  const type = file.contentType?.toLowerCase() ?? "";
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/ld+json" ||
    type === "application/javascript" ||
    type === "application/typescript" ||
    type === "application/xml" ||
    type === "application/x-yaml" ||
    type === "application/toml" ||
    type === "application/sql" ||
    type === "application/x-sh"
  ) {
    return true;
  }

  const rawName = (file.name ?? file.path.split("/").pop() ?? "").toLowerCase();
  if (!rawName) return false;
  if (TEXT_VIEWABLE_BASENAMES.has(rawName)) return true;

  const dotIndex = rawName.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  const ext = rawName.slice(dotIndex + 1);
  return TEXT_VIEWABLE_EXTENSIONS.has(ext);
}

export interface TextViewerProps {
  src: string;
  fileName?: string;
  className?: string;
  defaultShowLineNumbers?: boolean;
  defaultWordWrap?: boolean;
  showLineNumbers?: boolean;
  wordWrap?: boolean;
  showToolbar?: boolean;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export function TextViewer({
  src,
  fileName,
  className,
  defaultShowLineNumbers = true,
  defaultWordWrap = true,
  showLineNumbers: showLineNumbersProp,
  wordWrap: wordWrapProp,
  showToolbar = true,
  extraMenuItems,
  toolbarActions,
}: TextViewerProps) {
  const initialLines = showLineNumbersProp ?? defaultShowLineNumbers;
  const initialWrap = wordWrapProp ?? defaultWordWrap;
  const [content, setContent] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = React.useState(initialLines);
  const [wordWrap, setWordWrap] = React.useState(initialWrap);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setShowLineNumbers(initialLines);
  }, [initialLines]);

  React.useEffect(() => {
    setWordWrap(initialWrap);
  }, [initialWrap]);

  React.useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to read text");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  const lines = React.useMemo(
    () => (content !== null ? content.split(/\r?\n/) : []),
    [content],
  );

  const handleCopy = React.useCallback(() => {
    if (content === null) return;
    navigator.clipboard?.writeText(content).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [content]);

  const handleDownload = React.useCallback(() => {
    const link = document.createElement("a");
    link.href = src;
    link.download = fileName ?? "file.txt";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [fileName, src]);

  if (error) {
    return (
      <div
        className={cn(
          "flex size-full min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div
        className={cn(
          "grid size-full min-h-0 flex-1 place-items-center",
          className,
        )}
      >
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      data-slot="text-viewer"
      className={cn(
        "flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {showToolbar ? (
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 text-xs">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {fileName ? (
              <span className="truncate font-medium text-foreground">
                {fileName}
              </span>
            ) : null}
            <span>{lines.length} lines</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant={showLineNumbers ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowLineNumbers((prev) => !prev)}
            >
              Lines
            </Button>
            <Button
              type="button"
              variant={wordWrap ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setWordWrap((prev) => !prev)}
            >
              Wrap
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCopy}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More file actions"
                >
                  <IconPlaceholder lucide="Ellipsis" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {extraMenuItems ? (
                  <>
                    {extraMenuItems}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem onClick={handleDownload}>
                  <IconPlaceholder lucide="Download" className="size-4" />
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {toolbarActions}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/40">
                {showLineNumbers ? (
                  <td className="w-10 pr-3 text-right align-top text-muted-foreground/60 select-none">
                    {idx + 1}
                  </td>
                ) : null}
                <td
                  className={cn(
                    "align-top",
                    wordWrap
                      ? "break-words whitespace-pre-wrap"
                      : "whitespace-pre",
                  )}
                >
                  {line || "\u200B"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
