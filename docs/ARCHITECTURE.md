# Architecture

Zaya is a static site. There is no bundler and no build step at deploy time: every file is served
exactly as it sits in the repository, so a path in the tree *is* a URL. That single fact shapes
everything below.

## The four roots

| Root | What it is | Licence |
| --- | --- | --- |
| the top level | The served entry points and nothing else: `index.html`, `changelog.html`, `sw.js` (a service worker only controls pages at or below its own path, so it has to live here), `config.js` for per-deployment settings, plus the repository's own metadata. | MIT |
| `lib/` | The first-party application: `lib/js/app.js` (the loader), `lib/js/core/load.js`, `lib/js/ui/`, `lib/js/features/`, `lib/js/utils/`, `lib/js/i18n/`, the stylesheets under `lib/css/`, and the images and sounds the app itself ships. | MIT |
| `engine/` | The page-turn engine: a fork of DearFlip Lite, modularised into ES modules, with its own stylesheet as `engine/engine.css`. It is neither ours nor a library we merely use, which is why it has a root of its own — it is the one part of the tree we intend to delete. Reached only through the facade below. | CC BY-NC-ND 4.0, non-commercial only |
| `engine-next/` | The clean-room replacement for `engine/`, written from the public interface the reader uses and from first principles — no line of it derives from the fork it replaces. Self-contained ES modules over pdf.js 4 and three.js r169 from `vendor/pdfjs/` and `vendor/three/`, with its own `engine.css` and a demo page. Nothing in the reader loads it yet; it stays behind that flag until the switch-over, when `engine/` and `vendor/js/mockup.min.js` are deleted and the licence restriction goes with them. See `engine-next/README.md`. | MIT |
| `vendor/` | Third-party runtime code, unmodified but for the patches recorded in `THIRD_PARTY_NOTICES.md`: `vendor/js` (jQuery, three.js, pdf.js and its worker and CMaps, marked, Toastify, the engine's mockup build), `vendor/three` and `vendor/pdfjs` (the ESM builds `engine-next/` uses), `vendor/css`, `vendor/fonts` and `vendor/ocr` (Tesseract and its language packs). Each licence sits beside the files it covers. | various, all noted |

Three roots are not served at all: `docs/` (these notes, contributing, security, design and the
third-party notices), `tools/` (eslint, playwright and tailwind configuration and the two check
scripts) and `tests/` (Playwright). `.vercelignore` keeps them out of a deploy.

## Where a new file goes

Ask one question at a time, in this order:

1. **Did somebody else write it?** Then `vendor/`, with its licence file beside it and a row added
   to `docs/THIRD_PARTY_NOTICES.md`. Never a CDN: the site must work offline and under a strict
   Content-Security-Policy.
2. **Is it part of the page-turn engine?** Then `engine/`, and only if there is no way to do it
   from the outside. The engine is on its way out; every line added to it is a line to port later.
   Whatever the answer, the new file does not talk to it directly — see the facade rule below.
3. **Does the browser fetch it?** Then somewhere under `lib/` — `lib/js/features/<feature>/` for a
   feature, `lib/js/utils/` for something several features share, `lib/js/ui/` for the chrome,
   `lib/css/page/` for a stylesheet, and register it in the loader (below).
4. **Otherwise** it is `docs/`, `tools/` or `tests/`, and it must not be reachable over HTTP.

## The engine facade

**Only `lib/js/core/book.js` may import, reference or otherwise know about `engine/`.** It
publishes `window.ZayaBook`; everything else in `lib/` works through that and through nothing
else. No other file may read `window.dFlipBook`, `window.flipbookInstance`, `DFLIP.activeBook`,
or reach into a book's `target`, `contentProvider`, `ui`, `stage` or `options`.

`docs/engine-api.md`, beside this file, is the contract `ZayaBook` publishes: it is written from
the application's usage and the engine's observable behaviour rather than from the fork's
internals, precisely so that a clean-room replacement can be written from it. Each member is
marked as part of the contract or as internal. `tests/engine-contract.spec.mjs` exercises every
kept member through `ZayaBook` alone and asserts behaviour rather than markup, so the same file
runs against the replacement.

Two consequences. Replacing the engine is a rewrite of one file under `lib/` plus whatever
replaces `engine/` — not a pass over every feature. And a feature that finds itself wanting
something the contract does not offer adds it to `ZayaBook` and to `engine-api.md`, rather than
reaching past them; that addition is then a requirement on the replacement, so it is worth being
sure it is needed.

`window.dFlipBook` and `window.flipbookInstance` survive as deprecated aliases for one release,
for plugins written before the facade existed. They are not for `lib/`.

## The ordered loader

`index.html` includes exactly one script of its own, `lib/js/app.js`, as a module. That file owns
load order and nothing else. It appends `<script>` elements with `async = false`, so the browser
fetches them in parallel and runs them in the order they were appended, in three batches:

1. **Vendored libraries** — jQuery, Toastify, three.js, pdf.js and the engine's mockup build.
   `pdf.worker.min.js` is deliberately absent: pdf.js spawns it as a Web Worker itself, from the
   path the engine hands it.
2. **Utilities, state, i18n and the engine** — `lib/js/utils/*`, the dictionaries, then
   `engine/index.js` and `lib/js/core/book.js`. Entries listed in the `MODULES` set are loaded as
   `type="module"`, which the browser defers, so they run after the classic scripts of the same
   batch — which is why the facade, a classic script, may be listed after the engine and still run
   before it: it only publishes `ZayaBook`, and looks the engine up when a book is opened.
3. **The application** — `core/load.js`, the UI and every feature.

Two consequences worth knowing. Everything is a global on `window` unless it is in `MODULES`;
that is why `tools/eslint.config.mjs` turns `no-undef` off for `lib/js` and lists the module
directories separately, and why `tools/check-syntax.mjs` keeps its own list of which files to parse
as ESM. And the engine resolves its own asset locations at load time from `import.meta.url`:
`engine/index.js` walks up to the site root and points the engine at `vendor/js/…` for its
libraries, worker and CMaps, and at `lib/images` and `lib/sound` for its images and page-turn
sound. Moving `engine/index.js` means fixing that walk.

## Versioning

One rule: **any change to a served path or asset bumps the version.** Asset URLs carry `?v=<version>`
for cache busting, the service worker names its cache after the version, and `index.html` carries
the release it was built with in `data-zaya-version` so a stale script can notice it was served for
different markup, drop every cache and reload once.

The version appears in `package.json`, `lib/js/app.js` (`ZAYA_VERSION`), `sw.js` (`VERSION`), the
`?v=` parameters and `data-zaya-version` in both HTML files, and the deploy-guard expectations in
`tests/persistence.spec.mjs`. `npm run check` runs `tools/check-version.mjs`, which fails the build
if any of them disagree. A layout change like 6.3.0 — where nothing behaved differently but every
URL moved — is exactly the case this rule exists for.

## The deferred slicing

`lib/js` is still organised the way it is served rather than the way it is written: `features/`,
`ui/` and `utils/` side by side under one `js/` directory, with no boundary between what a feature
owns and what it borrows. The intended shape is `src/features/<feature>/`, each feature holding its
own scripts, styles and strings.

That move is deliberately held back until the engine is replaced. Both changes rewrite the same set
of URLs, and doing them together means one round of cache invalidation, one version bump and one
pass over the loader, rather than two. Until then, keep new work inside the existing feature
directories so that the eventual move is a rename rather than a redesign.
