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
  on the page itself (`Ctrl/Cmd+F`)
- Thumbnails and outline/bookmark side panels that overlay the book on narrow screens
- 50+ colour themes built on one set of design tokens (see `DESIGN.md`)
- Quotes notebook stored locally in IndexedDB, and the last page remembered per document
- Built-in media player: YouTube videos and playlists or local audio, with loop
- Backup and restore: export every quote and preference to JSON and import it on another device
  (Settings → Backup)
- Shareable links: `?theme=`, `?mode=`, `?search=`, `?rtl=` presets for embedding
- Touch-first: pinned bottom bar with page numbers, tap-to-turn, swipes, 44px controls
- Keyboard accessible dialogs (focus trapping, Escape) and labelled controls
- Works offline as a PWA; every third-party asset is vendored
- Strict Content-Security-Policy, validated URLs and escaped output

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | previous / next page |
| `Ctrl/Cmd + F` | open in-document search |
| `F` | toggle fullscreen |
| `Ctrl/Cmd + K` | toggle control panel |
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
See `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md` and `DESIGN.md`.

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
    └── 📁assets
    └── 📁lib
        └── 📁css
            └── 📁page        chrome.css, panel.css, custom-ui.css, changelog.css
            └── 📁themes      themes.css (all colour themes and design tokens)
            └── 📁vendor      fonts.css, tailwind.css, fontawesome, toastify (compiled/vendored)
        └── 📁fonts           self-hosted IBM Plex Sans/Mono
        └── 📁images
        └── 📁js
            └── 📁core
                └── 📁dflip   modular flipbook engine
                ├── load.js
            └── 📁features
                └── 📁changelog
                    └── 📁services  ChangelogApiService.js, ChangelogParserService.js
                    └── 📁ui        ChangelogRenderer.js
                    └── 📁utils     ChangelogConfig.js, ChangelogUtils.js
                    ├── changelog.js
                    ├── changelog.bundle.js  (built by `npm run build:changelog`)
                └── 📁media
                └── 📁quotes
                └── 📁search
                └── 📁settings
                └── 📁themes
            └── 📁libs        jquery, three, pdf.js, marked, toastify (vendored)
            └── 📁ui          controls.js
            └── 📁utils       app-state.js, validation.js, mobile-support.js, …
            ├── app.js        the only script the pages include; loads everything else in order
        └── 📁sound
```

</details>

## Libraries and tools

- **[PDF.js](https://mozilla.github.io/pdf.js/)** — renders PDF files in the browser.
- **[Three.js](https://threejs.org/)** — the WebGL layer behind the page-turn animation.
- **[DFlip](https://github.com/dearhive/dearflip-js-flipbook)** — the flipbook engine Zaya's core is
  derived from, refactored into ES modules under `lib/js/core/dflip/`.

Full attribution and licences are in `THIRD_PARTY_NOTICES.md`.

## Licence

MIT. See `LICENSE`.
