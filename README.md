# autumn-studio-paseo-plugin

Agent powered file viewer/editor for Paseo — desktop/web only.

Requires Paseo 0.13.0 or later on both the daemon and the app.

## Features

- **PDF**: support to get text with agent powered mineru/docling/...
- **Code & Text**: support Markdown, JSON, YAML, TOML, SQL, shell scripts, and plain text files.
- **Extensible Format Sections**: register additional format sections in
  `client/settings/registry.ts` backed by `settings.formats.<formatId>` .

## AI Text Mode (beta)

Click **AI Text Mode** on a PDF to extract Markdown into `.autumn/` and open a
split view with the original page on the left and the extraction on the right.
The docked bottom panel is the single home for a version's provenance and
stats (engine, refinement, structure, blocks/pages) and ends with the
**AI Text again:** row — a Profile select and a **Re-parse** button with an
inline confirmation (click again within four seconds) before starting. The
panel is hidden by default; **Show AI Text metadata** in AI Text Mode →
General opens it by default, and the view's ⋯ menu toggles it per session.
Re-parsing creates a new version; older versions stay selectable, switched
and deleted (with a confirm step) from the version selector.

The right toolbar is generated from the viewer registry: **Text** (rendered
Markdown), **Blocks** (page-grouped layout, enabled only when the version has
geometry), **Source** (raw Markdown), and **Edit** (edit and save the stored
version). **Default AI Text viewer** in settings chooses the initial pane and
lists only viewers that make sense as a default. An unknown viewer id falls
back to Text.

### Parsing profiles

A profile is a named recipe: engine, route, engine config, extraction switches,
and refinement. Exactly one profile ships ready to use: **MinerU · Cloud Free**
— the plugin bundles no local engine, and the free MinerU API needs no token
and no install — and it stays permanent so a valid default always exists.
Create and edit profiles in **AI Text → Profiles**; presets cover every MinerU route (Auto, Cloud Free,
Cloud token, Local mineru-kit, Local API), Docling Standard/VLM, and offline
text extraction.

The profile editor renders engine fields from the engine descriptor and hides
extraction switches the engine cannot honor. Each version records a profile
fingerprint; the bottom panel shows **Profile changed** when a profile was
edited after the version was parsed, and **Profile removed** when it was
deleted.

### Engines & setup

**AI Text → Engines & Setup** probes each engine, reports versions and route
status, and runs engine lifecycle operations as cancellable tasks: install
(pinned to the installed version by default, or a typed release), update
(shown only when a newer release exists on the configured package index),
uninstall, model download, and model cache clearing. Engines render as tabs
in fixed catalog order (MinerU, Docling, then others) with one panel at a
time — a status dot per tab carries health without reshuffling the order.
The panel shows engine and model-cache disk usage with an
open-in-file-manager action and lists the profiles using the engine.
Operations are descriptor-driven; adding an engine does not add UI code.

| Engine      | Routes                                                            | Notes                                                                                                                       |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mineru`    | `auto` , `local-cli` , `local-api` , `cloud-token` , `cloud-free` | Layout-aware extraction with OCR, formulas, tables, and geometry. Install `mineru-kit` with `uv tool install mineru` .      |
| `docling`   | `standard` , `vlm`                                                | Docling 2.x layout/table pipeline or VLM pipeline. Install with `uv tool install docling` ; models download on first parse. |
| `local-ocr` | `auto`                                                            | Built-in PDF text layer plus on-device OCR. No install, no layout geometry. Used as the automatic fallback.                 |

MinerU `auto` prefers ready local models, then a local API daemon, then cloud.
`cloud-free` returns Markdown only, so Blocks stays unavailable. `cloud-token`

accepts an API token in the profile. Docling `standard` passes `--ocr` ,
`--table-mode` , and `--enrich-formula` ; `vlm` passes `--vlm-model` . Docling has
no page-range support; clear the page range or use a MinerU profile.

If a profile's engine fails, the pipeline falls back to local text extraction
and records the requested engine, effective engine, and reason in provenance.
Cancel still wins: an aborted run does not fall back.

### Refinement

Refinement runs after parsing:

- `none` — store the engine output as-is.
- `local` (default for MinerU, shown as "Auto formatting") — repairs
  whitespace, heading, list, table, and code-fence spacing without a model.
- `agent` — opt-in Paseo agent pass with the profile prompt preset
  ( `faithful` , `tables` , or `custom` ), model, and a 5-minute cap. Agents run
  auto-archived. Timeouts, refusals, empty output, and output shorter than 30%
  of the source fall back to auto formatting with a visible warning.

Inputs above 150, 000 characters skip the agent pass.

### Storage

Each version writes next to its Markdown inside `.autumn/<doc-slug>/` :

- `<versionId>.md` — Markdown.
- `<versionId>.layout.json` — normalized page and block geometry.
- `<versionId>.assets/images/<name>` — exported images, served lazily to the
  renderer through a base64 RPC and capped at 20 MB per file.
- `metadata.json` — schema version 2, version records, active version, and
  provenance (profile, fingerprint, engines, route, extraction, refinement).

Version ids are timestamp + counter + profile slug. Deleting a version removes
its artifacts. Versions written by the pre-profile schema are read and
normalized to provenance v2. Layout metadata is capped at 64 MB per version and
image assets at 512 MB per extraction; individual images over 20 MB are skipped
because the asset RPC could not serve them.

**AI Text → Advanced** configures the output root and storage: the root can be
a workspace folder (default `.autumn` , visible in the file tree) or an absolute
path outside the workspace (namespaced per workspace id, hidden from the tree).
The storage dashboard lists every document with version count, disk size,
engines, and last-parsed time — sortable and filterable, with a Recalculate
button that always re-walks the disk and a per-row reveal in the OS file
manager. Advanced also selects the package index used by engine installs,
updates, and release checks: official PyPI by default, with common mirrors
(Aliyun, Douban, Huawei Cloud, TUNA, USTC) or a custom simple-index URL.

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
