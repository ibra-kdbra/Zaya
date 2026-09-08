# Architecture

Zaya is a static site. There is no bundler and no build step at deploy time: every file is served
exactly as it sits in the repository, so a path in the tree *is* a URL. That single fact shapes
everything below.

## The four roots

| Root | What it is | Licence |
| --- | --- | --- |
| the top level | The served entry points and nothing else: `index.html`, `changelog.html`, `sw.js` (a service worker only controls pages at or below its own path, so it has to live here), `config.js` for per-deployment settings, plus the repository's own metadata. | MIT |
| `lib/` | The first-party application: `lib/js/app.js` (the loader), `lib/js/core/load.js`, `lib/js/ui/`, `lib/js/features/`, `lib/js/utils/`, `lib/js/i18n/`, the stylesheets under `lib/css/`, and the images and sounds the app itself ships. | MIT |
| `engine-next/` | **The page-turn engine.** Written clean-room from the contract below and from first principles — no line of it derives from the fork it replaced. Self-contained ES modules over pdf.js 4 and three.js r169 from `vendor/pdfjs/` and `vendor/three/`, with its own `engine.css` and a demo page. Reached only through the facade below. See `engine-next/README.md`. | MIT |
| `vendor/` | Third-party runtime code, unmodified: `vendor/three` and `vendor/pdfjs` (the ESM builds `engine-next/` uses), `vendor/js` (Toastify), `vendor/css`, `vendor/fonts` and `vendor/ocr` (Tesseract and its language packs). Each licence sits beside the files it covers. | various, all permissive, all noted |

Three roots are not served at all: `docs/` (these notes, contributing, security, design and the
third-party notices), `tools/` (eslint, playwright and tailwind configuration and the two check
scripts) and `tests/` (Playwright). `.vercelignore` keeps them out of a deploy.

## Where a new file goes

Ask one question at a time, in this order:

1. **Did somebody else write it?** Then `vendor/`, with its licence file beside it and a row added
   to `docs/THIRD_PARTY_NOTICES.md`. It must be permissively licensed — the repository carries no
   non-commercial or no-derivatives component and is not to acquire one. Never a CDN either: the
   site must work offline and under a strict Content-Security-Policy.
2. **Is it part of the page-turn engine?** Then `engine-next/`, and only if there is no way to do
   it from the outside: the engine draws pages and takes pointer input, and everything else — a
   panel, a button, a keyboard shortcut, a stored preference — belongs to the application.
   Whatever the answer, the new file does not talk to the engine directly — see the facade rule
   below.
3. **Does the browser fetch it?** Then somewhere under `lib/` — `lib/js/features/<feature>/` for a
   feature, `lib/js/utils/` for something several features share, `lib/js/ui/` for the chrome,
   `lib/css/page/` for a stylesheet, and register it in the loader (below).
4. **Otherwise** it is `docs/`, `tools/` or `tests/`, and it must not be reachable over HTTP.

## The engine facade

**Only `lib/js/core/book.js` may reference or otherwise know about `engine-next/`.** It publishes
`window.ZayaBook`; everything else in `lib/` works through that and through nothing else. No
other file may read `window.dFlipBook` or `window.flipbookInstance`, or reach past the handle
into the engine object behind it.

The engine is a set of ES modules and the facade is a classic script, so one line of module sits
between them: `lib/js/core/engine.js` imports `engine-next/index.js` and leaves the constructor
on `window.ZayaEngine`. The loader runs it in the batch before the first document is opened. It
exists only so that the facade can stay a classic script and keep publishing `ZayaBook`
synchronously; it translates nothing.

`docs/engine-api.md`, beside this file, is the contract `ZayaBook` publishes: it was written from
the application's usage and the engine's observable behaviour rather than from any engine's
internals, precisely so that a clean-room replacement could be written from it — which is what
`engine-next/` is. Each member is marked as part of the contract or as internal.
`tests/engine-contract.spec.mjs` exercises every kept member through `ZayaBook` alone and asserts
behaviour rather than markup, which is how the same file ran unchanged against both engines.

The engine draws pages and nothing else. The Navigator's Pages, Outline and Search panes are the
application's own (`lib/js/features/navigator/panes.js` and `lib/js/features/search/`), built
from the three pieces of data only the engine can supply: a picture of a page, the outline with
its destinations resolved, and what a page calls itself. Saving a download, the share box, the
arrow keys and the page-turn sound file are the application's too.

Two consequences. Replacing the engine is a rewrite of one file under `lib/` plus whatever
replaces `engine-next/` — not a pass over every feature. And a feature that finds itself wanting
something the contract does not offer adds it to `ZayaBook` and to `engine-api.md`, rather than
reaching past them; that addition is then a requirement on the replacement, so it is worth being
sure it is needed.

`window.dFlipBook` and `window.flipbookInstance` survive as deprecated aliases for plugins
written before the facade existed. They no longer point at an engine object — nothing shaped like
the fork's exists any more — but at the `ZayaBook` handle, which is the only thing a plugin can
honestly be handed. They are not for `lib/`.

## The ordered loader

`index.html` includes exactly one script of its own, `lib/js/app.js`, as a module. That file owns
load order and nothing else. It appends `<script>` elements with `async = false`, so the browser
fetches them in parallel and runs them in the order they were appended, in three batches:

1. **Vendored libraries** — Toastify, and nothing else. The engine brings its own three.js and
   pdf.js as ES modules and imports them itself, so neither is listed here; the pdf.js worker is
   absent too, because pdf.js spawns it as a Web Worker of its own.
2. **Utilities, state, i18n and the engine** — `lib/js/utils/*`, the dictionaries, then
   `lib/js/core/engine.js` and `lib/js/core/book.js`. Entries listed in the `MODULES` set are
   loaded as `type="module"`, which the browser defers, so they run after the classic scripts of
   the same batch — which is why the facade, a classic script, may be listed after the engine
   module and still run before it: it only publishes `ZayaBook`, and looks the engine up when a
   book is opened.
3. **The application** — `core/load.js`, the UI and every feature.

Two consequences worth knowing. Everything is a global on `window` unless it is in `MODULES`;
that is why `tools/eslint.config.mjs` turns `no-undef` off for `lib/js` and lists the module
directories separately, and why `tools/check-syntax.mjs` keeps its own list of which files to
parse as ESM. And the engine resolves its own asset locations from `import.meta.url`, so moving
`engine-next/` moves nothing else with it. Its stylesheet is reached the other way round, as an
`@import` at the top of `lib/css/style.css`, which is what puts it before the application's own
sheets in the cascade.

One loose end the version rule below does not quite cover: `?v=` is appended by the loader, so
`lib/js/core/engine.js` carries it, but the engine modules it imports do not, because a static
`import` resolves against the module's path and drops its query. It costs nothing today — the
immutable year-long cache header is set on `/lib/` alone, and the service worker fetches every
script from the network while it is online and names its cache after the release — and it is
written down here rather than worked around.

## The document key

Everything Zaya keeps is filed against one identity, computed in `lib/js/utils/pageMemory.js`
(`window.ZayaDocKey`, and `window.ZayaCurrentDocKey` for whatever is open):

| The document | Its key |
| --- | --- |
| a link | the URL with its `#fragment` and its tracking parameters (`utm_*`, `gclid`, `fbclid`, `igshid`, `si` and their kind) removed. Everything else — path, port, remaining query — is part of the identity, because a query string often is what selects the file. |
| a file from disk | `"<filename>::<size in bytes>"`. Its `blob:` URL dies with the page, and a name alone is not an identity: two different files called `notes.pdf` used to share one remembered page, one note list and one recognised text. |

That one key is the key of the `pages` record, the `pdfUrl` of every note, the `doc` of every
recognised page, the `name` of the stored copy of a file (which also carries its `label`, the name
the reader sees), the `key` of the recent entry, and the id — prefixed `doc ` — of the `settings`
record where a document remembers its page mode and the soundtrack it was last read with.

A file whose size is not known keeps the bare filename: a profile written before this release, or
one restored from an older backup. Those records are not lost and they are not migrated in bulk
either — the first time that file is opened from disk again, `ZayaLocalDocs.adopt()` moves the
remembered page, the notes, the recognised text, the stored copy, the recent entry and the
per-document record across to the new key, and only then does the document open.

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

That move was deliberately held back until the engine was replaced. Both changes rewrite the same
set of URLs, and separating them from the engine work kept 7.0.0 to one subject. It is now the next
milestone; until it happens, keep new work inside the existing feature directories so that the move
is a rename rather than a redesign.

## Caching, and why first-party code is never pinned

Served code is addressed with `?v=<release>`. That query carries the **release**, not the build, so
two deploys of one release serve different bytes at identical URLs. Anything told to keep such a URL
is therefore told to keep whichever build it happened to see first.

`/lib/` was once served `max-age=31536000, immutable` on the assumption that its address changes
whenever its contents do. It does not, and the consequence is worse than a stale asset: a fix could
be deployed, be correct, pass every check, and still never reach a reader who had visited before.
Only a version bump dislodged it, because a browser holding a response it believes fresh for a year
does not ask again whatever a later header says.

So first-party code — `/lib/` and `/engine-next/`, the latter imported by path with no query at all
— revalidates. One conditional request per file, answered with a 304 when nothing changed. The
service worker is what makes the reader work offline, and always was; the HTTP cache was never
carrying that weight.

`vercel.json` is checked by `npm run check` (`tools/check-deploy-config.mjs`), both for keys the
schema will reject — it accepts no property it does not know, and a deployment that fails leaves the
preview URL quietly serving the last build that worked — and for a cache header that would pin
first-party code again.
