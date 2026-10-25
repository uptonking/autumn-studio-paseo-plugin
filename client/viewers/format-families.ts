/**
 * Single source of truth for the format families the plugin can render.
 *
 * `FORMAT_FAMILIES` drives the native Paseo file-panel registrations in
 * `index.client.tsx` (`client.addFilePanel` selectors), while the text lists
 * below feed `isTextViewableFile`/`viewerKindForFile` so the claimed
 * extensions can never drift from what the island actually renders.
 */

export type NativeFileFamilyKind =
  | "pdf"
  | "xlsx"
  | "docx"
  | "pptx"
  | "image"
  | "text";

export interface NativeFileFamily {
  /** Contribution id for `addFilePanel`; matches /^[a-z][a-z0-9-]*$/. */
  id: string;
  /** Label in the panel picker, the Open with menu, and Settings > Files. */
  title: string;
  /** Lucide icon name; the host validates it at registration. */
  icon: string;
  /** Viewer kind the family's files resolve to inside the island. */
  kind: NativeFileFamilyKind;
  /** Extensions without the dot, lowercase; matched case-insensitively. */
  extensions: readonly string[];
  /** Exact basenames (case-sensitive) for files without a claimable extension. */
  filenames?: readonly string[];
}

export const TEXT_VIEWABLE_EXTENSIONS = [
  "c", "cc", "cfg", "cjs", "conf", "cpp", "css", "csv", "cts", "env",
  "gitignore", "go", "graphql", "gql", "h", "hpp", "htm", "html", "ini",
  "java", "js", "json", "jsonc", "jsonl", "jsx", "kt", "less", "lock", "log",
  "lua", "md", "mdx", "mjs", "mts", "php", "pl", "prisma", "py", "r", "rb",
  "rs", "sass", "scala", "scss", "sh", "sql", "svelte", "swift", "tf", "toml",
  "ts", "tsv", "tsx", "txt", "vue", "xml", "yaml", "yml", "zig", "zsh",
] as const;

export const TEXT_VIEWABLE_BASENAMES = [
  ".babelrc", ".dockerignore", ".editorconfig", ".env", ".env.example",
  ".env.local", ".eslintrc", ".gitattributes", ".gitignore", ".npmrc",
  ".nvmrc", ".prettierrc", "agents.md", "cargo.lock", "cargo.toml",
  "claude.md", "cmakelists.txt", "dockerfile", "gemfile", "go.mod", "go.sum",
  "justfile", "license", "makefile", "procfile", "rakefile", "readme",
] as const;

/** Paseo matches filenames with case, while detection lowercases first. */
const CAPITALIZED_TEXT_BASENAMES = [
  "AGENTS.md", "CLAUDE.md", "CMakeLists.txt", "Cargo.lock", "Cargo.toml",
  "Dockerfile", "Gemfile", "Justfile", "LICENSE", "License", "Makefile",
  "Procfile", "Rakefile", "README", "Readme",
] as const;

export const IMAGE_VIEWABLE_EXTENSIONS = [
  "avif", "gif", "jpeg", "jpg", "png", "svg", "webp",
] as const;

export const FORMAT_FAMILIES: readonly NativeFileFamily[] = [
  {
    id: "pdf",
    title: "Autumn Studio PDF",
    icon: "FileText",
    kind: "pdf",
    extensions: ["pdf"],
  },
  {
    id: "spreadsheet",
    title: "Autumn Studio Spreadsheet",
    icon: "Table",
    kind: "xlsx",
    extensions: ["xlsx", "xls"],
  },
  {
    id: "document",
    title: "Autumn Studio Document",
    icon: "File",
    kind: "docx",
    extensions: ["docx"],
  },
  {
    id: "slides",
    title: "Autumn Studio Slides",
    icon: "Presentation",
    kind: "pptx",
    extensions: ["pptx"],
  },
  {
    id: "image",
    title: "Autumn Studio Image",
    icon: "Image",
    kind: "image",
    extensions: IMAGE_VIEWABLE_EXTENSIONS,
  },
  {
    id: "text",
    title: "Autumn Studio Text",
    icon: "Code",
    kind: "text",
    extensions: TEXT_VIEWABLE_EXTENSIONS,
    filenames: [...TEXT_VIEWABLE_BASENAMES, ...CAPITALIZED_TEXT_BASENAMES],
  },
];
