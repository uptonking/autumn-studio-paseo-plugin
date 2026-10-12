import { createFileTreeIconResolver, getBuiltInSpriteSheet } from "@pierre/trees"

import { fileExtension } from "./types.ts"

export const FILE_ICON_SPRITE_SHEET = getBuiltInSpriteSheet("complete")

const { resolveIcon: resolveFileIcon } = createFileTreeIconResolver({
  colored: true,
  set: "complete",
})

export const FILE_ICON_COLORS: Record<string, [light: string, dark: string]> = {
  astro: ["#a631be", "#d568ea"],
  babel: ["#d5a910", "#ffd452"],
  bash: ["#199f43", "#5ecc71"],
  biome: ["#1a85d4", "#69b1ff"],
  bootstrap: ["#693acf", "#9d6afb"],
  browserslist: ["#d5a910", "#ffd452"],
  bun: ["#594c5b", "#79697b"],
  c: ["#1a85d4", "#69b1ff"],
  claude: ["#d47628", "#ffa359"],
  cpp: ["#1a85d4", "#69b1ff"],
  css: ["#693acf", "#9d6afb"],
  database: ["#a631be", "#d568ea"],
  default: ["#84848a", "#adadb1"],
  docker: ["#1a85d4", "#69b1ff"],
  eslint: ["#693acf", "#9d6afb"],
  git: ["#ff8c5b", "#d5512f"],
  go: ["#1ca1c7", "#68cdf2"],
  graphql: ["#d32a61", "#ff678d"],
  html: ["#d47628", "#ffa359"],
  image: ["#d32a61", "#ff678d"],
  javascript: ["#d5a910", "#ffd452"],
  json: ["#d47628", "#ffa359"],
  markdown: ["#199f43", "#5ecc71"],
  mcp: ["#17a5af", "#64d1db"],
  npm: ["#d52c36", "#ff6762"],
  oxc: ["#1ca1c7", "#68cdf2"],
  pdf: ["#dc2626", "#f87171"],
  postcss: ["#d52c36", "#ff6762"],
  prettier: ["#17a5af", "#64d1db"],
  python: ["#1a85d4", "#69b1ff"],
  react: ["#1ca1c7", "#68cdf2"],
  ruby: ["#d52c36", "#ff6762"],
  rust: ["#d47628", "#ffa359"],
  sass: ["#d32a61", "#ff678d"],
  slides: ["#ea580c", "#fb923c"],
  svelte: ["#d52c36", "#ff6762"],
  svg: ["#d47628", "#ffa359"],
  svgo: ["#199f43", "#5ecc71"],
  swift: ["#d47628", "#ffa359"],
  table: ["#17a5af", "#64d1db"],
  tailwind: ["#1ca1c7", "#68cdf2"],
  terraform: ["#693acf", "#9d6afb"],
  text: ["#84848a", "#adadb1"],
  typescript: ["#1a85d4", "#69b1ff"],
  vite: ["#a631be", "#d568ea"],
  vscode: ["#1a85d4", "#69b1ff"],
  vue: ["#199f43", "#5ecc71"],
  wasm: ["#693acf", "#9d6afb"],
  webpack: ["#1a85d4", "#69b1ff"],
  word: ["#2563eb", "#60a5fa"],
  yml: ["#d52c36", "#ff6762"],
  zig: ["#d47628", "#ffa359"],
  zip: ["#d47628", "#ffa359"],
}

const CUSTOM_EXTENSION_ICONS: Record<
  string,
  { name: string; token: string; viewBox?: string }
> = {
  pdf: { name: "file-tree-custom-pdf", token: "pdf" },
  xlsx: { name: "file-tree-builtin-table", token: "table" },
  xls: { name: "file-tree-builtin-table", token: "table" },
  xlsm: { name: "file-tree-builtin-table", token: "table" },
  csv: { name: "file-tree-builtin-table", token: "table" },
  tsv: { name: "file-tree-builtin-table", token: "table" },
  ods: { name: "file-tree-builtin-table", token: "table" },
  docx: { name: "file-tree-custom-word", token: "word" },
  doc: { name: "file-tree-custom-word", token: "word" },
  odt: { name: "file-tree-custom-word", token: "word" },
  rtf: { name: "file-tree-custom-word", token: "word" },
  pptx: { name: "file-tree-custom-slides", token: "slides" },
  ppt: { name: "file-tree-custom-slides", token: "slides" },
  odp: { name: "file-tree-custom-slides", token: "slides" },
}

export const CUSTOM_FILE_ICON_SYMBOLS_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <symbol id="file-tree-custom-pdf" viewBox="0 0 16 16">
    <path fill="currentColor" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z" opacity=".35"/>
    <path fill="currentColor" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="currentColor" d="M3.5 8h1.9a1.2 1.2 0 0 1 0 2.4h-.9V12h-1V8zm1 .9v.65h.8a.33.33 0 0 0 0-.65h-.8zm2.25-.9h1.55a1.9 1.9 0 0 1 0 4H6.75V8zm1 .95v2.1h.5a1.05 1.05 0 0 0 0-2.1h-.5zM10.4 8h2.35v.95H11.4v.65h1.15v.9H11.4V12h-1V8z"/>
  </symbol>
  <symbol id="file-tree-custom-word" viewBox="0 0 16 16">
    <path fill="currentColor" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z" opacity=".35"/>
    <path fill="currentColor" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="currentColor" d="M4.2 8h1l.65 2.45L6.5 8h1l.65 2.45L8.8 8h1l-1.1 4h-1L7 9.7 6.3 12h-1L4.2 8z"/>
  </symbol>
  <symbol id="file-tree-custom-slides" viewBox="0 0 16 16">
    <path fill="currentColor" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z" opacity=".35"/>
    <path fill="currentColor" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="currentColor" d="M4.5 8h7a.5.5 0 0 1 .5.5v3.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V8.5a.5.5 0 0 1 .5-.5zm1 3.5h1V10h-1v1.5zm2 0h1V9h-1v2.5zm2 0h1v-1h-1v1z"/>
  </symbol>
</svg>`

function fileIconColorVariables(mode: 0 | 1) {
  return Object.entries(FILE_ICON_COLORS)
    .map(([token, colors]) => `--fs-file-icon-${token}: ${colors[mode]};`)
    .join(" ")
}

export const FILE_ICON_COLOR_CSS = `
:root, :host { ${fileIconColorVariables(0)} --fs-selected-color-scheme: dark; }
.dark { ${fileIconColorVariables(1)} --fs-selected-color-scheme: light; }
.dark [data-file-system-on-light] { ${fileIconColorVariables(0)} }
[data-file-system-on-primary] { ${fileIconColorVariables(1)} }
.dark [data-file-system-on-primary] { ${fileIconColorVariables(0)} }
`

export function resolveFileTypeIcon(fileName: string): {
  name: string
  token?: string
  viewBox?: string
} {
  const ext = fileExtension(fileName)
  if (ext && CUSTOM_EXTENSION_ICONS[ext]) {
    return CUSTOM_EXTENSION_ICONS[ext]
  }
  return resolveFileIcon("file-tree-icon-file", fileName)
}
