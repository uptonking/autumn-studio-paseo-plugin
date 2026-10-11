# File Explorer Plugin

A nested-tree file navigator and multi-format file viewer for Paseo — desktop/web
only. Built on `react-dom`, Tailwind CSS v4, and modularized extend-ui
components, isolated from the host UI inside a Shadow DOM island.

## Features

- **Left Sidebar Entry (`File Explorer`)**: Contributes a `SidebarRow` below
  Paseo's built-in sidebar items (`History`, `Search`, `Schedules`) that opens
  the File Explorer settings page. Also registered under **Settings → Plugins →
  File Explorer**.
- **Modular Settings Registry (`client/settings/`)**:
  - **General**: Enable/disable File Explorer, configure default file open mode
    (`in-place`, `dialog`, `new-tab`), and default explorer view (`list`,
    `icons`, `columns`, `gallery`).
  - **PDF**: Toggle page thumbnail sidebar by default, default zoom level
    (`fit-width`, `fit-page`, `100%`, `125%`, `150%`), rotation controls, and
    download button.
  - **Code & Text**: Toggle line numbers and word wrapping for source code,
    Markdown, JSON, YAML, TOML, SQL, shell scripts, and plain text files.
  - **Extensible Format Sections**: Register additional format sections in
    `client/settings/registry.ts` backed by `settings.formats.<formatId>`.
- **Three File Open Modes & Top-Right More (`...`) Menu**:
  - **In-Place (Default)**: Opens the file viewer directly in place of the file
    tree with a **Go Back** button (`Alt/Cmd+Backspace` or click) and a
    top-right **More (`...`)** menu (`Open file in dialog`, `Open file in new
    tab`, `File Explorer settings`).
  - **Popup Dialog**: Opens the file in a modal dialog with a top-right **More
    (`...`)** menu (`Open file in-place`, `Open file in new tab`). Switching
    between `in-place` and `dialog` reparents the live DOM viewer container
    without reloading or re-parsing the document.
  - **New Tab**: Opens files in Paseo's center workspace `File Viewer` panel
    with a multi-tab strip, per-tab close buttons, and a top-right **More
    (`...`)** menu.

## Architecture

```
index.client.tsx                ← Contributes sidebar item, settings screens, panels, commands
index.server.ts                 ← Registers host settings + files.tree / file.content / files.pdf_wasm RPCs
shared/
  contracts.ts                  ← Zod RPC schemas + settings re-exports
  settings.ts                   ← Host settings schema (General, PDF, Code & Text, extensible formats)
server/
  paths.ts                      ← workspaceRoot + safeResolve (realpath containment)
  scan.ts                       ← Tree walk: skips dot-dirs, symlinks, node_modules…
client/
  blob-url-cache.ts             ← Shared mtime/size-aware Blob URL & PDFium WASM URL cache
  file-explorer-panel.tsx       ← Host wrapper for File Explorer panel
  file-viewer-panel.tsx         ← Host wrapper for File Viewer (new-tab) workspace panel
  shadow-island.web.tsx         ← Reusable ShadowRoot island with Tailwind CSS + theme vars
  file-explorer-island.web.tsx  ← File Explorer ShadowRoot island entry
  file-viewer-island.web.tsx    ← File Viewer ShadowRoot island entry
  file-explorer-content.tsx     ← Tree query flattening + FileSystem wiring
  file-viewer-content.tsx       ← Multi-tab File Viewer content inside ShadowRoot
  opened-tabs-store.ts          ← Per-workspace store for files opened in new tabs
  sidebar-item.tsx              ← Left sidebar "File Explorer" SidebarRow contribution
  settings/                     ← Modular settings screen & section registry (General, PDF, Code & Text)
  viewers/
    registry.tsx                ← Pluggable viewer registry shared by FileSystem and FileViewer
    image-viewer.tsx            ← Interactive Image viewer (zoom, fit/100%, rotate, download)
    text-viewer.tsx             ← Built-in Code & Text viewer (line numbers, wrap, copy, download)
  vendor/
    file-system.tsx             ← Root FileSystem component (<600 lines)
    file-system/                ← Modularized views, header, filters, stage pool, virtual window
    pdf-viewer.tsx              ← Root PDFViewer component (<600 lines)
    pdf-viewer/                 ← Modularized PDF toolbar, search, scroller, thumbnails, engine
```

### Context boundary (the load-bearing rule)

The Shadow DOM island renders in its own `react-dom` root, and React context
does not cross a root boundary — the app's `PluginRpcProvider` and
`QueryClientProvider` are invisible inside it:

- `file-explorer-panel.tsx` and `file-viewer-panel.tsx` (host tree) own
  `useRpc`, `useSettings`, queries, and the shared `blob-url-cache.ts`.
- `file-explorer-island.web.tsx`, `file-explorer-content.tsx`, and
  `file-viewer-content.tsx` receive plain props and callbacks across the island
  boundary.

## Build & Verification

```bash
npm install                # also runs scripts/patch-embedpdf.js
npm run build              # build:wasm (embed pdfium) + build:css (Tailwind → generated TS)
npm run typecheck          # tsc --noEmit
npm test                   # node:test unit suite (test/*.test.ts)
npm run check              # typecheck + unit tests + real Paseo plugin compiler + jsdom runtime test
```
