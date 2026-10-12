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

## Build & Verification

```bash
npm install                # also runs scripts/patch-embedpdf.js
npm run build              # build:wasm (embed pdfium) + build:css (Tailwind → generated TS)
npm run typecheck          # tsc --noEmit
npm test                   # node:test unit suite (test/*.test.ts)
npm run check              # typecheck + unit tests + real Paseo plugin compiler + jsdom runtime test
```

## License

[AGPL-3.0](./LICENSE.md)
