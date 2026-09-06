# Zaya

Zaya is a PDF reader that presents a document as a book. Point it at a PDF — a URL, a local file, or
a default set in `config.js` — and it renders a 3D page-turning flipbook with search, thumbnails,
bookmarks, quotes and 50+ themes. It is a static site: no build step at deploy time, no runtime CDN,
and it works offline as a PWA.

**[Live demo](https://zaya.vercel.app/)** · **[Changelog](https://zaya.vercel.app/changelog.html)**

## Screenshots

| Reader | Search | Themes |
| --- | --- | --- |
| ![Reader](/assets/captured.png) | _screenshot to add_ | _screenshot to add_ |

## Features

- Realistic 3D page turning (WebGL) with a CSS fallback; single and double page modes, RTL support
- **Full-text search** across the whole PDF, with highlighted snippets in the panel and marks painted
  on the page itself (`Ctrl/Cmd+F`). Arabic is handled: shaped glyphs, vowel marks and either storage order
- **Text recognition for scanned books**: pages without a text layer are recognised on the reader's
  device (Tesseract in WebAssembly, Arabic and English packs vendored), kept per document in the
  browser, and searched and highlighted like real text. Nothing is uploaded.
- **Selectable page text**: a **Text** tab in the Navigator shows the text of the pages on screen as
  real text — copy a page, or select a passage and keep it as a note, copy it, or search for it.
  Recognised pages read exactly like pages with a text layer, and Arabic reads right to left
- **Print page ranges**: pick the current page, the whole document or a range like `3-7, 10, 12-14`
  (`Ctrl/Cmd+P`); the pages are rendered at about 150 dpi, one per sheet, optionally with the
  current search marks painted on them
- Stiff pages: soft, hard cover, or every page as a board (Settings → Pages)
- Thumbnails and outline/bookmark side panels that overlay the book on narrow screens
- 50+ colour themes built on one set of design tokens (see `docs/DESIGN.md`)
- Notes kept with the document and grouped by the page they were taken on, stored locally in
  IndexedDB, with the last page remembered per document — a file from disk by its name and size, so
  two books of the same name stay apart
- Built-in media player: YouTube videos and playlists or local audio, with loop, remembered per
  document
- Backup and restore: export every quote and preference to JSON and import it on another device
  (Settings → Backup)
- **English and Arabic interface**: every label, message and tooltip is translated, and Arabic
  mirrors the whole layout — drawers, icon rail, bottom bar, text alignment and directional arrows.
  The language is picked up from the browser on a first visit, chosen in Settings, or set with
  `?lang=`. The document's own reading direction stays a separate setting.
- Shareable links: `?theme=`, `?mode=`, `?search=`, `?rtl=`, `?lang=` presets for embedding
- Touch-first: pinned bottom bar with page numbers, tap-to-turn, swipes, 44px controls
- Keyboard accessible dialogs (focus trapping, Escape) and labelled controls, checked against
  axe-core in both languages and at both desk and phone widths (`npm test`)
- Works offline as a PWA; every third-party asset is vendored
- Strict Content-Security-Policy, validated URLs and escaped output

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | previous / next page |
| `Ctrl/Cmd + F` | open in-document search |
| `F` | toggle fullscreen |
| `Ctrl/Cmd + K` | toggle control panel |
| `Ctrl/Cmd + Shift + N` | keep the text selected in the Text tab as a note |
| `Ctrl/Cmd + P` | print a range of pages |
| `Esc` | close panel / leave fullscreen |

## Development

```bash
npm install     # dev tooling only (eslint, playwright, tailwind, http-server)
npm start       # http://localhost:8080
npm run check   # syntax-check every script and verify the version is consistent
npm run lint    # eslint
npm test        # Playwright smoke tests (desktop + mobile emulation)
npm run build:assets   # recompile Tailwind CSS and the changelog bundle (outputs are committed)
```

Scripts are loaded and ordered by `lib/js/app.js` — there is nothing to include by hand in the HTML.
See `docs/CONTRIBUTING.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and
`docs/engine-api.md` (the contract between the app and the page-turn engine).

## Roadmap

Open milestones, in the order they matter:

- **Replace the flipbook engine** ([issue #21](https://github.com/ibra-kdbra/Zaya/issues/21)). The
  page-turn engine under `engine/` is a fork of DearFlip Lite and carries a non-commercial licence
  (see `docs/THIRD_PARTY_NOTICES.md`). A permissively-licensed replacement is the one change the
  rest of the project waits on. The contract that replacement is to be written from is frozen in
  `docs/engine-api.md`, the app reaches the engine only through `window.ZayaBook`
  (`lib/js/core/book.js`), and `tests/engine-contract.spec.mjs` is the engine-agnostic suite the
  replacement has to pass.
- **Slice the app into `src/features`.** The first-party code under `lib/js` still follows the
  served layout rather than the shape of the features. Reorganising it is deferred until the engine
  is replaced, so that both moves land as one change of URL.
- **More recognition languages.** Only Arabic and English packs are vendored today; the language
  packs and the picker are ready for more.
- **Selection on the page itself.** Text can be selected in the Navigator's Text tab; selecting it
  on the rendered page, where the reader is looking, is still to come.

## Tech Stack

[![Tech Stack](https://skillicons.dev/icons?i=threejs,js,jquery,css,html,tailwindcss,svg)](https://skillicons.dev)

## Custom default PDF

### Method 1: edit `config.js`

`config.js` is loaded before the app and is the place for per-deployment settings (inline scripts in
`index.html` are blocked by the Content-Security-Policy). Uncomment and set the URL:

```js
window.ZAYA_DEFAULT_PDF = "https://your-server.com/your-document.pdf";
```

A relative path works too, if the PDF is served from the same origin:

```js
window.ZAYA_DEFAULT_PDF = "./documents/my-book.pdf";
```

### Method 2: URL parameter

```
https://your-site.com/index.html?pdf=https://example.com/document.pdf&page=5
```

### All URL parameters

| Parameter | Example | Effect |
| --- | --- | --- |
| `pdf` | `?pdf=https://example.com/a.pdf` | document to open (http/https only) |
| `page` | `&page=5` | page to open |
| `theme` | `&theme=nord` | any built-in theme name |
| `mode` | `&mode=single` | `single` or `double` page layout |
| `search` | `&search=invoice` | open the search panel with a query |
| `rtl` | `&rtl=1` | right-to-left reading direction |
| `lang` | `&lang=ar` | interface language: `en` or `ar` (Arabic also mirrors the layout) |

> **Note:** remote PDFs must have CORS enabled on their server for cross-origin loading to work. If
> pages stay blank for a linked PDF, that is almost always the cause.

## Media loop

The media player loops both local audio files and YouTube videos/playlists. Toggle **Media Loop** in
the control panel (Settings → Media Loop). The setting is remembered across sessions.

## Project layout

<details>
<summary>Click to expand</summary>

```
└── 📁Zaya
    ├── index.html            reader
    ├── changelog.html        release notes, rendered from CHANGELOG.md
    ├── config.js             per-deployment settings
    ├── sw.js                 service worker
    └── 📁assets              favicons and the screenshot used above
    └── 📁engine              the flipbook engine (DearFlip fork, non-commercial licence)
        └── 📁core            book, pages, textures, the preview stage
        └── 📁features        thumbnails, outline, find, annotations, links
        └── 📁ui              toolbar, lightbox, popup, share
        ├── index.js  factory.js  constants.js  utils.js  tween.js
        ├── engine.css        the engine's own stylesheet
    └── 📁lib                 first-party application code
        └── 📁css
            └── 📁page        shell.css, chrome.css, custom-ui.css, storage.css, text-pane.css,
            │                 print.css, changelog.css
            └── 📁themes      themes.css (all colour themes and design tokens)
            ├── style.css     the sheet that pulls the others together
        └── 📁images
        └── 📁js
            └── 📁core        book.js — ZayaBook, the one facade over the engine
            │                 load.js — glue between the UI, AppState and ZayaBook
            └── 📁features
                └── 📁changelog
                    └── 📁services  ChangelogApiService.js, ChangelogParserService.js
                    └── 📁ui        ChangelogRenderer.js
                    └── 📁utils     ChangelogConfig.js, ChangelogUtils.js
                    ├── changelog.js
                    ├── changelog.bundle.js  (built by `npm run build:changelog`)
                └── 📁controls  📁documents  📁media  📁print  📁quotes
                └── 📁search    📁settings    📁text    📁themes
            └── 📁i18n        en.js, ar.js, i18n.js
            └── 📁ui          controls.js
            └── 📁utils       app-state.js, validation.js, mobile-support.js, …
            ├── app.js        the only script the pages include; loads everything else in order
        └── 📁sound
    └── 📁vendor              third-party runtime code, licences beside it
        └── 📁css             tailwind.css, fontawesome, toastify, themify, fonts.css
        └── 📁fonts           IBM Plex, Font Awesome and Themify faces
        └── 📁js              jquery, three, pdf.js (+ worker, cmaps), marked, toastify, mockup
        └── 📁ocr             Tesseract in WebAssembly and its Arabic/English packs
    └── 📁docs                ARCHITECTURE, CONTRIBUTING, SECURITY, DESIGN, THIRD_PARTY_NOTICES
    └── 📁tools               eslint, playwright and tailwind config; the check scripts
    └── 📁tests               Playwright suites
```

</details>

## Libraries and tools

- **[PDF.js](https://mozilla.github.io/pdf.js/)** — renders PDF files in the browser.
- **[Three.js](https://threejs.org/)** — the WebGL layer behind the page-turn animation.
- **[DFlip](https://github.com/dearhive/dearflip-js-flipbook)** — the flipbook engine Zaya's core is
  derived from, refactored into ES modules under `engine/`.
- **[Tesseract.js](https://tesseract.projectnaptha.com/)** — on-device text recognition for scanned pages
  (`vendor/ocr/`, loaded on demand).

Full attribution and licences are in `docs/THIRD_PARTY_NOTICES.md`.

## Licence

MIT. See `LICENSE`.
