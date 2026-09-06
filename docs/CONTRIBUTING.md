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

| Path | What lives there |
| --- | --- |
| `index.html`, `changelog.html` | The two pages of the site |
| `lib/js/app.js` | Ordered script loader (the only place load order is defined) |
| `lib/js/core/dflip/` | The flipbook engine (modularised DearFlip 1.7.x fork, see licensing note below) |
| `lib/js/core/load.js` | Glue between the UI, `AppState` and the flipbook |
| `lib/js/ui/`, `lib/js/features/` | Control panel, bottom bar, media, quotes, themes, changelog, search |
| `lib/js/utils/` | State store, plugin registry, validation, service-worker manager |
| `lib/css/` | Styles; theme tokens are CSS custom properties in `lib/css/themes/themes.css` |
| `sw.js` | Service worker (must stay at the site root) |
| `tests/` | Playwright smoke tests |
| `tools/` | Dev configuration and checks (eslint, playwright, tailwind, `check-syntax.mjs`, `check-version.mjs`) |
| `docs/` | Contributing, security, design and third-party notes |

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

- Vanilla ES2020+, no framework. jQuery is still present for the flipbook engine and legacy UI; new code should not add new jQuery usage.
- Never insert untrusted text with `innerHTML` / `.html()`. Use `textContent`, or `window.ValidationUtils.escapeHtml()` when building markup.
- Keep everything relative-path based so the site works from a sub-folder and from `file://`.

## Licensing note

Zaya's own code is MIT. The flipbook engine under `lib/js/core/dflip/` and `lib/js/libs/mockup.min.js` derive from DearFlip Lite, which is distributed under CC BY-NC-ND 4.0 (non-commercial, no derivatives). See `THIRD_PARTY_NOTICES.md`, beside this file. Contributions that replace those components with permissively-licensed code are very welcome.
