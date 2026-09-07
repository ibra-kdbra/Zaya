# Contributing to Zaya

Thanks for helping. Zaya is a static site: there is no build step at deploy time. Tailwind CSS and the changelog bundle are precompiled with `npm run build:assets` and the outputs are committed.

## Getting started

```bash
git clone https://github.com/ibra-kdbra/Zaya
cd Zaya
npm install          # dev tooling only (eslint, playwright, a static server)
npm start            # serves the app on http://localhost:8080
```

Open http://localhost:8080 in a browser. Any PDF can be loaded with `?pdf=<url>`.

## Before you open a pull request

```bash
npm run check   # syntax-check every first-party script
npm run lint    # eslint
npm test        # headless smoke test: pages load without console errors
```

Please keep pull requests focused. One fix or feature per PR makes review and changelog entries much easier.

## Project layout

`ARCHITECTURE.md`, beside this file, explains why the tree is shaped this way and where a new
file belongs. In short:

| Path | What lives there |
| --- | --- |
| `index.html`, `changelog.html` | The two pages of the site |
| `lib/js/app.js` | Ordered script loader (the only place load order is defined) |
| `engine-next/` | The page-turn engine: first-party ES modules over pdf.js and three.js |
| `lib/js/core/book.js` | `window.ZayaBook`, the one facade over the engine — the only file in `lib/` allowed to touch it |
| `lib/js/core/load.js` | Glue between the UI, `AppState` and the flipbook; the only caller of `ZayaBook.create` |
| `lib/js/ui/`, `lib/js/features/` | Control panel, bottom bar, media, quotes, themes, changelog, search |
| `lib/js/utils/` | State store, plugin registry, validation, service-worker manager |
| `lib/css/` | Styles; theme tokens are CSS custom properties in `lib/css/themes/themes.css` |
| `vendor/` | Third-party runtime code, with its licences beside it |
| `sw.js` | Service worker (must stay at the site root) |
| `tests/` | Playwright smoke tests |
| `tools/` | Dev configuration and checks (eslint, playwright, tailwind, `check-syntax.mjs`, `check-version.mjs`) |
| `docs/` | Architecture, contributing, security, design, the engine contract and third-party notes |

## Talking to the flipbook

Everything the app asks of the page-turn engine goes through `window.ZayaBook`, and
`docs/engine-api.md` is the contract it publishes. `lib/js/core/book.js` is the only file allowed
to know that `engine-next/` exists; never read `window.dFlipBook` or `window.flipbookInstance`,
which survive only as deprecated aliases for old plugins, and never reach past the handle into the
engine object behind it. If the contract is missing something your feature needs, add it to
`lib/js/core/book.js` and to `docs/engine-api.md` in the same change, and cover it in
`tests/engine-contract.spec.mjs`.

## Plugin / extension API

Core emits `zaya:init`, `zaya:pdfLoaded`, `zaya:pageChanged`, `zaya:themeChanged` and `zaya:toolbarReady` on `document`.
UI slots are exposed on `window.ZayaUI` (`registerToolbarButton`, `registerPanelTab`) and plugins register through `window.ZayaPlugins.register({ id, name, init })`.
Prefer building on these hooks over editing core files, so features stay independently testable.

## Adding a user-visible string

Every word a reader sees is translated. To add one:

1. Put the key in **both** `lib/js/i18n/en.js` and `lib/js/i18n/ar.js`. Keys are dotted and stable
   (`panel.document.openFile`, `search.placeholder`); the value is a string, or an object of plural
   forms for anything counted — `{ one, other }` in English, `{ zero, one, two, few, many, other }`
   in Arabic. Placeholders are `{name}` and are filled by the caller.
2. In markup, name the key on the element: `data-i18n` for its text, `data-i18n-title`,
   `data-i18n-placeholder`, `data-i18n-aria-label` or `data-i18n-empty` for those attributes.
   `ZayaI18n.apply()` fills them in, on load and on every language switch.
3. In a script, call `t('the.key', { n: 3 })` — most modules define
   `const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);` at the top.
   If the string is drawn by your own code rather than by `apply()`, redraw it on the
   `zaya:languageChanged` event.

British English for the English strings; natural Modern Standard Arabic, short labels rather than
literal translations, for the Arabic ones. Anything positional in the CSS that goes with the string
should use logical properties, so it mirrors under `dir="rtl"` (see `DESIGN.md`, beside this file).

## Coding conventions

- Vanilla ES2020+, no framework and no jQuery: it was removed in 7.0.0 and nothing is to bring it back.
- Never insert untrusted text with `innerHTML`. Use `textContent`, or `window.ValidationUtils.escapeHtml()` when building markup.
- Keep everything relative-path based so the site works from a sub-folder and from `file://`.

## Licensing note

Zaya is MIT throughout, and the third-party code it vendors is permissively licensed — three.js
under MIT, pdf.js and Tesseract under Apache-2.0, and the rest as listed in
`THIRD_PARTY_NOTICES.md` beside this file. Until 6.3.0 the page-turn engine was a fork of DearFlip
Lite under CC BY-NC-ND 4.0; it was replaced and deleted in 7.0.0.

Please keep it that way: a contribution that vendors third-party code must add its licence file
beside it and a row to `THIRD_PARTY_NOTICES.md`, and nothing under a non-commercial or
no-derivatives licence can be accepted.
