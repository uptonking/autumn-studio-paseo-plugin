# paseo-file-explorer plugin

An intuitive file explorer and file viewer/editor for Paseo — desktop/web only. 
Built with react , Tailwind CSS v4, and modularized extend-ui components, isolated from the host UI inside a Shadow DOM island.

## Features

- **PDF**: Toggle page thumbnail sidebar by default, default zoom level
  ( `fit-width` , `fit-page` , `100%` , `125%` , `150%` ), rotation controls, and
  download button.
- **Code & Text**: Toggle line numbers and word wrapping for source code, 
  Markdown, JSON, YAML, TOML, SQL, shell scripts, and plain text files.
- **Extensible Format Sections**: Register additional format sections in
`client/settings/registry.ts` backed by `settings.formats.<formatId>` .

## AI Text Mode (beta)

Click **AI Text Mode** on a PDF to extract Markdown into `.autumn/` and open a
split view with the original page on the left and the extraction on the right.
**Default AI Text viewer** in settings chooses whether the right pane starts as
rendered **Text** or **Layout Blocks**.

When the extraction includes layout metadata, the right toolbar gains a
**Blocks** toggle. Blocks are grouped by page, filterable by type and text, and
clicking one highlights its area on the PDF. Image, chart, and scanned-table
blocks show the image MinerU exported; a placeholder appears only when the
archive contains no image.

### MinerU setup

The parser settings support these MinerU paths:

| Mode | Use it for |
| --- | --- |
| `auto` | Prefer ready local Kit models, then a local API daemon, then cloud. |
| `local-cli` | Run `mineru-kit` on this machine. |
| `local-api` | Call a local API daemon (`mineru-kit api-server` or `mineru-api`), default `http://127.0.0.1:8000`. |
| `cloud-token` | MinerU Cloud API v4 with an API token; returns layout and images. |
| `cloud-free` | Free cloud API; Markdown only, so Blocks stays unavailable. |

Local modes show **MinerU model tier**, **MinerU OCR mode**, and **Extract layout
metadata**; `cloud-token` also exposes **Extract layout metadata**, while
`cloud-free` hides it because the free response has no geometry. The local Kit
CLI has no separate Enable OCR, formula, or table switches: `--ocr-mode`
controls OCR, and formula/table recognition is part of the layout pipeline.
Those three switches appear only for the cloud modes, where the API accepts
them as request options. `local-api` still uses `mineru-kit` as the client that
talks to the daemon.

Install the v4 CLI with uv and fetch models once:

```bash
uv tool install mineru
mineru-kit models download --tier standard
```

The first local parse loads models and can take minutes. The split pane shows
the current phase, elapsed time, a collapsible log tail, and a **Cancel** button.
Failures offer **Retry**, and model-related failures offer **Download models**
before retrying.

**MinerU Environment** shows what was detected on this machine: Kit and
`mineru` versions, uv, install kind, model repositories, and the local API
daemon. **Download / repair models** runs `mineru-kit models download` for the
selected tier. **Reinstall MinerU CLI** appears only for uv-tool installs and
runs `uv tool install --reinstall mineru` as a cancellable task.

### Storage

Each version writes next to its Markdown inside `.autumn/<doc-slug>/`:

- `<versionId>.md` — Markdown.
- `<versionId>.layout.json` — normalized page and block geometry.
- `<versionId>.assets/images/<name>` — exported images, served lazily to the
  renderer through a base64 RPC and capped at 20 MB per file.

Deleting a version removes all three. Versions extracted before layout support
open as Text; re-parse them to enable Blocks. Layout metadata is capped at 64 MB
per version and image assets at 512 MB per extraction; individual images over
20 MB are skipped because the asset RPC could not serve them.

## Build & Verification

```bash
npm install                # also runs scripts/patch-embedpdf.js
npm run build              # build:wasm (embed pdfium) + build:css (Tailwind → generated TS)
npm run typecheck          # tsc --noEmit
npm test                   # node:test unit suite (test/*.test.ts)
npm run check              # typecheck + unit tests + real Paseo plugin compiler
npm run test:runtime       # jsdom runtime test against the compiled client bundle
```

## License

[AGPL-3.0](./LICENSE.md)
