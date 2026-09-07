# Changelog

All notable changes to Zaya are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **A book is called by its own name.** The header showed the host a link came from — every book
  from one site was called `example.com` — or the name of the file on disk. A PDF usually carries
  its own title, and that is now what is shown, falling back to the file at the end of the link
  rather than the host it came from. The browser's title bar says it too, so a bookmark or a second
  window names the book. This is a label only: a document is still identified internally by its
  link or by its file name and size, so notes, remembered pages and stored copies are untouched.

### Fixed
- **A page turn is quicker, and does less work while it runs.** The turn took 700ms with a curve
  that eased in and out of it, which read as floaty rather than smooth; it now takes 480ms. Two
  costs it carried on every frame are gone: the sheet's material is unlit, so the vertex normals
  being recomputed for both sheets were read by nothing, and the vertices are now written straight
  into the geometry's array rather than through three bounds-checked accessors each. Neither of
  those changed the frame rate measurably on the machine this was tested on, where the frame rate
  is set by a software renderer rather than by the page; they are removals of work that was doing
  nothing, and the shorter turn is the part a reader will feel.
- **The wheel zooms again.** It did nothing unless the control key was held, which left both the
  magnification and the panning that depends on it out of reach — a page could only be enlarged by
  double-clicking it. The wheel now zooms on its own, and a notch is a step rather than a leap: one
  notch used to multiply the page by half again, crossing the whole range in three, and now moves
  it about a tenth. The control key still works, since a trackpad pinch arrives that way. Dragging
  a page that is larger than the window moves it, as it always did — it was simply unreachable.

## [7.1.0] - 2026-09-07

### Added
- **The reader works offline after one visit rather than two.** A service worker takes control of a
  page only after that page has already fetched its scripts, so a first visit used to leave nothing
  behind but the handful of files precached at install: a reader who came once, then opened Zaya
  again with no connection, got an empty shell. The page now tells the worker what it actually
  loaded — the application's own scripts, the page-turn engine, three.js and pdf.js with its worker —
  and the worker keeps them. One ordinary visit is now enough to open a book from disk with the
  network switched off entirely. Files already held are skipped, so this costs nothing on later
  visits, and the re-request is answered from the browser's own cache rather than the network. The
  engine names the two files it fetches only when it first draws — its WebGL renderer and three.js —
  so a reader who never opened a book before losing the connection still gets the real engine rather
  than the plainer 2D fallback.

### Fixed
- **A link with `?rtl=1` sometimes opened the book left to right**, and the arrow keys then turned
  the pages the wrong way. The reading direction in the address is applied when the application
  finishes starting, but the first book was opened from a timer that could fire before that, so
  which one won depended on how quickly the scripts arrived. The first book now waits for the
  application to be ready, which is what the timer was standing in for. Present since 7.0.0.

### Removed
- `vendor/js/marked.min.js`. The changelog page parsed its Markdown with `marked` until it grew its
  own parser; the file had been shipped to every reader since, referenced by nothing.

## [7.0.0] - 2026-09-07

Zaya has its own engine now. Every page you turn is drawn by `engine-next/`, written for this
project from the contract in `docs/engine-api.md` and from first principles. The engine it
replaces was a fork of DearFlip Lite, which Zaya had run on since its first release; that fork,
and the libraries that existed only to feed it, are out of the repository. Nothing you can see or
do was meant to change in the move — the same spreads, the same turn, the same drawers, the same
shortcuts — and where something did change it is listed below, mostly because the reader's own
code now draws what the engine used to.

That matters most for the licence. Until 6.3.0 part of this repository was not free to use: the
page-turn engine was distributed under CC BY-NC-ND 4.0, personal and non-commercial use only and
no derivatives, which the README and the third-party notices both warned about, and which is why
replacing the engine was the one milestone everything else waited on. With the fork deleted that
component is gone. Zaya's own code, the new engine included, is MIT, and the third-party code it
still vendors is permissively licensed — three.js under MIT, pdf.js and Tesseract under
Apache-2.0, the icon and text fonts under OFL and CC BY — each with its licence beside the files
it covers, and all of it listed in `docs/THIRD_PARTY_NOTICES.md`. The credit to DFlip stays, as
the engine Zaya ran on for years; the new one derives nothing from it, having been written from
the contract rather than from the code.

The other half of the release finishes making a document a document: everything Zaya keeps about
a book — where you stopped reading, your notes, the text it recognised, the copy of the file, the
soundtrack you read it with — is filed against one identity, so two different files called
`notes.pdf` no longer share a single memory.

### Added

- **The page-turn engine is Zaya's own (issue #21)**: `engine-next/` loads a document with
  pdf.js 4, lays out single and double spreads in either reading direction, maps book pages to PDF
  pages — including scans that carry two book pages on one — and turns a sheet with three.js by
  moving the sheet's own vertices so the paper curls, with a plain-DOM renderer of the same shape
  for a machine with no working WebGL. The sheet follows your finger: a drag builds the page as
  the press begins and moves it with the pointer, settling forward past halfway or on a flick and
  falling back otherwise. `?render=css` and `?render=webgl` still pin a renderer for testing.
- **The text on the page can be selected**: the runs of text on the pages currently on screen are
  placed over them as transparent spans, so a passage can be selected, copied and found with the
  browser's own search. Right-to-left runs are marked so they copy in logical order, and the layer
  steps out of the way while a sheet is in flight. Search marks are still painted into the page
  itself, so they print exactly as they look.
- **Zoom, on the page you are reading**: the control key with the wheel, two fingers, a double
  click or a double tap magnifies the spread, and a drag pans it once magnified — in both
  renderers, with the page re-rendered at the magnified scale a moment after the magnification
  arrives, so the text stays crisp rather than growing blurry. Turning the page comes back to fit,
  because a pan belongs to the spread it was chosen on.
- **Notes, by page, for the document you are reading**: the Notes tab lists the open document's
  notes grouped under the page they were taken on. The pages on screen come first and are marked,
  a group heading counts its notes, each note has a **Go to page** action that turns the book to
  it, and the line above the list says how many notes are on this page. A note taken from the Text
  pane's selection behaves exactly like one typed into the tab, and the per-document list behind
  **All notes** shows the same notes in page order.
- **Every document remembers a little more of itself**: the page-mode override chosen while a book
  was open, and the soundtrack it was last read with (the YouTube link, or that it was on a local
  audio file), come back when that document is opened again — with the last choice of all as the
  default for a document that has none of its own. Nothing starts playing by itself. Both travel
  in a backup, in a new `documents` section of the format-2 file.
- **The engine's contract is written down**: `docs/engine-api.md` specifies everything the
  application asks of a page-turn engine — construction and its options, teardown and resizing,
  navigation, the page-mode and direction rules, the pdf.js document and the mapping between PDF
  pages and book pages, the search hooks, the data the side panels are built from, the render
  modes, sound, zoom, and the order the `zaya:*` events arrive in. It was written from the
  outside, from what the application asks for and what it must observe in return, which is what
  made a clean-room replacement possible. `tests/engine-contract.spec.mjs` exercises every member
  of it through `window.ZayaBook` alone and asserts behaviour rather than markup, which is how the
  same file ran unchanged against both engines.

### Changed

- **The Navigator's Pages and Outline panes are the reader's own**: they used to be built by the
  engine and borrowed by the application, which is why they were the last part of the interface
  not written in Zaya's own markup. They are now built from the three things only an engine can
  work out — a picture of a page, the outline with its destinations resolved, and what a page
  calls itself. The tiles, the page numbers, the two columns on a phone, the collapsible chapters
  and their chevrons, the ring on the page you are reading and the touch scrolling that never
  freezes the book are all as they were. Opening another document with the drawer open replaces
  the pane rather than emptying it: the pages of the last book stay on screen until the new one
  can draw its own, and a document is announced as open when it starts opening rather than when it
  was picked, so nothing follows a new name over an old book.
- **A file from disk is a document, not a filename**: everything kept on the device — the
  remembered page, notes, recognised text, the stored copy of the file, the recent entry — is
  filed under one document key: a link by its URL with the `#fragment` and tracking parameters
  taken off, a file by its name *and its size*. Two different files called `notes.pdf` used to
  share a page, a note list and their recognised text; they are now two documents. Nothing is lost
  in the change: the first time such a file is opened from disk again, everything it was filed
  under by its bare name moves across to the new key. The format is written down in
  `docs/ARCHITECTURE.md`.
- **Notes are filed against the PDF page being read**, the same numbering the Text pane, the print
  dialog and the page headings use, rather than the flipbook's own page number.
- **A change of document reaches every surface at once**: the notes list, the page counts in the
  bottom bar and the Navigator, the Text pane and the print range all follow the new document in
  the same event cycle instead of on the next turn of the interface loop.
- **The share box, the download and the arrow keys are the application's**: the engine works out
  the address of the page being read and resolves the open document to something saveable, and the
  reader shows the box and saves the file. A shared link now carries `?page=`, so it opens where
  the sender was, and the mail it offers to write actually has the address in it. `ArrowRight` and
  `ArrowLeft` move the book right and left on screen — forward and back in a left-to-right
  document, the other way round in a right-to-left one — and stay out of the way while a drawer, a
  dialog or a text field has focus.
- **The Search pane and the media pane are plain DOM**, like the rest of the reader: the search
  form, its results and its offer to recognise scanned pages, and the whole of the media pane —
  the mode switcher, the themed audio player with its transport, progress and volume, the
  local-file import and the two loop toggles that follow each other — are built with the DOM
  directly, under the same ids and with the same behaviour.
- **A page turn makes a sound again**: the engine is pointed at a page-turn sound the application
  already ships, so the setting in the More menu does something.
- **The page a search hit turns to, in a scanned book**: for a scan whose every page carries two
  book pages, the right-hand leaf is the answer, which is what the application and its tests have
  recorded since 6.1 and what the contract has always said. Both leaves are on the same spread, so
  a reader sees the same thing either way.
- **The application talks to the engine through one facade**: `lib/js/core/book.js` publishes
  `window.ZayaBook`, and every feature — the control bar and its More menu, the Navigator, print,
  the Text pane, URL options and the loader — goes through it. Reading direction and page mode are
  named (`"ltr"`/`"rtl"`, `"single"`/`"double"`) rather than numbered, and a disposed book hands
  its container back unmarked instead of leaving a stage-shaped element behind.
- `window.dFlipBook` and `window.flipbookInstance` now point at the `ZayaBook` handle rather than
  at an engine object, because nothing shaped like the fork's exists any more, and the handle is
  the only thing a plugin can honestly be handed. They remain deprecated.

### Removed

- **The DearFlip-derived engine and its stylesheet**, together with the vendored builds that
  existed only to feed it: the classic three.js and pdf.js with its worker, its compatibility shim
  and its CMaps, and `mockup.min.js`. The new engine imports pdf.js 4 and three.js r169 as ES
  modules from `vendor/pdfjs/` and `vendor/three/` and vendors its own CMaps beside them. About
  3 MB of files leave the repository.
- **jQuery**. Zaya no longer ships it: the last two files written in it, the media pane and the
  first-document loader, are the DOM directly, and a plugin that wants jQuery now brings its own.
  The reader loads one vendored script at startup instead of two.

## [6.3.0] - 2026-09-06

### Added
- **The interface speaks Arabic (issue #27)**: every label, tooltip, message, empty state and toast the reader sees is translated, including the flipbook engine's own tooltips and the text-recognition pane. A **Language** control in Settings switches between English and العربية live — nothing reloads, and the choice is remembered. A first visit picks Arabic when the browser asks for it first, and `?lang=ar` (or `?lang=en`) presets it from a link. Counted lines use real plural forms, so Arabic gets its six grammatical categories rather than an English "s"; numbers stay in Western digits. The strings live in `lib/js/i18n/en.js` and `ar.js` under stable dotted keys, and the markup names its key in `data-i18n`.
- **The text of the page, as text (issue #26)**: the book is painted onto canvases, so nothing on the page itself can be selected. A fourth Navigator tab, **Text**, shows the text of the pages currently on screen as real, selectable text — one section per page, paragraphs rebuilt from the line spacing of the original, and `dir="auto"` so Arabic reads right to left. Each section has a **Copy page text** button, and selecting a passage raises a small bar over it with **Add as note** (filed against the document and the page, so it appears in Notes and in the per-document list), **Copy** and **Search** (which hands the selection to the Search tab). `Ctrl/Cmd+Shift+N` keeps the selection as a note, `Esc` dismisses the bar. Pages whose text was recognised on the device read exactly like pages with a text layer, and a document that is nothing but images says so and points at the recognition offer in Search.
- **Print pages**: **Print…** in the More menu (`Ctrl/Cmd+P`) opens a dialog to choose the current page or spread, the whole document, or a custom range typed as `3-7, 10, 12-14`, validated as you type. The chosen pages are rendered with pdf.js at about 150 dpi, one image per sheet on white with no theme colours, and handed to the browser's own print dialogue. Preparing shows which page it is on and can be stopped; a range over 100 pages asks for confirmation first; search marks can be printed with the pages; and the order follows the range as typed, so a right-to-left book prints in the order that was asked for. `window.ZayaPrint = { open(), print(range) }` drives the same thing from a script.
- **Stiff pages**: Settings → Pages chooses whether pages turn as a soft sheet, with a hard cover, or all as boards (the engine's `hard` option, honoured by both the WebGL and the CSS renderer). The choice is kept with the other preferences and the document reopens on the same page when it changes.
- **One place for everything kept on the device**: page memory, quotes, files opened from disk and recognised text now live in a single IndexedDB database (`Zaya`) instead of four. The first load after upgrading copies every record across from the old databases and removes them; a database that another tab is holding open is left alone and tried again next time, so nothing is lost.
- **Storage space is visible and manageable**: the Recent group shows how much of the space this browser allows Zaya is using, and a **Free up space** action (with an inline confirmation, not a browser dialogue) drops the stored copies of files and recognised text for documents no longer in the list. The recent entries and their remembered pages are kept. Each file entry says whether its bytes are still kept in this browser and how large it is, and the list can be walked entirely from the keyboard.
- **Backups keep more**: the backup file is now format 2 and carries the recent documents list (metadata only, never the files themselves) and recognised text for scanned pages, up to 20 MB of it; beyond that the text is left out with a note in the file. Backups written by the previous release are still imported.
- **Drawer state in AppState**: `navigatorOpen`, `navigatorTab` (`thumbs` | `outline` | `search`), `panelOpen` and `panelTab` (`Document` | `Notes` | `Media` | `Settings`) are stored and restored like the other preferences, so both drawers reopen where the reader left them (issue #24).
- **More-menu choices are remembered**: the page-mode override (single or double) and the page-turn sound survive a reload and a change of document, alongside the bottom-bar mode that was already kept. An explicit `?mode=` still wins over the remembered choice.

### Changed
- **The repository has four roots instead of one**: `index.html`, `changelog.html`, `sw.js` and `config.js` are all that is left at the top level. First-party application code stays under `lib/`; the DearFlip-derived page-turn engine moved to `engine/` (with its stylesheet as `engine/engine.css`) because it is a fork to be replaced rather than a library; every third-party runtime file moved to `vendor/` (`vendor/js`, `vendor/css`, `vendor/fonts`, `vendor/ocr`) with its licence beside it; the contributor documents moved to `docs/`, which now also holds `docs/ARCHITECTURE.md`; and the dev configuration and checks moved to `tools/`. Served paths changed, which is why this is a release of its own. The four remaining pre-6.0 page stylesheets (`button.css`, `input-panel-buttons.css`, `layout.css`, `quotes.css`) were retired, with the handful of rules still deciding a value gathered at the bottom of `page/shell.css`. The roadmap and the notes on the private build are no longer in this repository; `README.md` carries a short list of the open milestones instead.
- **The whole layout mirrors in Arabic (issue #27)**: with a right-to-left interface the brand moves to the right and the header actions to the left, the Navigator opens from the right and the control panel from the left (docked margins swapped with them), the icon rail stays on the drawer's outer edge, the bottom bar and the notes, Recent and search lists read from the right, and chevrons and page arrows turn over while a cog or a quote mark does not — a button on the left still goes left. This is done with CSS logical properties rather than a second, mirrored stylesheet, so there is only one set of rules to keep in step. Arabic text falls back to a system Arabic face with more leading, since IBM Plex Sans carries no Arabic. The document's own reading direction stays a separate setting from the interface's.
- **The app layer no longer uses jQuery**: `ui/controls.js`, `features/controls/custom-controls.js` and the DOM work in `core/load.js` are plain DOM — the same ids, `zaya:*` events, `ZayaPanel` / `ZayaNavigator` / `ZayaDrawers` / `ZayaDocuments` APIs, keyboard shortcuts and drawer model, with the engine's jQuery objects unwrapped only where the flipbook itself hands them over. jQuery remains a dependency of the vendored engine.
- **No user text is ever built into markup**: the notes list and its modal, the delete confirmation, the theme picker, the mobile hints and the "re-select the file" toast are all built from elements, so a quote, a filename or a document name reaches the page as text and never through `innerHTML`. A plugin's `ZayaUI.registerPanelTab({ content })` now takes a node or plain text; markup goes through `renderContent`.
- **Drawer state reads and writes AppState**: the Navigator and the control panel take their open state and selected tab from `navigatorOpen` / `navigatorTab` / `panelOpen` / `panelTab`, so link presets and a restored backup drive them. Drawers that were left open are only reopened where they are layout rather than an overlay (1200px and wider); on smaller screens the tab is remembered but the drawer starts closed.
- **The legacy panel stylesheet is retired**: `lib/css/page/panel.css` is gone. What was still in use — the bottom bar, the More menu, the notes modal, the toggle switch and the volume slider — moved to the top of `page/shell.css`, and everything a later sheet already restyled was dropped.
- **The flipbook engine is split by responsibility**: the search pane (query, results, and the offer to recognise scanned pages) is now `lib/js/features/search/search-panel.js`, the thumbnail and outline drawers are `engine/features/side-panels.js`, and `texture-library.js` is left with textures and page rendering — half its previous size, with no change to what the panels do.

### Fixed
- **Accessibility pass (issue #28)**: the More menu is a real menu (`role=menuitem` on its entries, `aria-haspopup` and `aria-expanded` on its button), the theme picker is labelled by its own heading instead of a duplicate label, the notes modal's close button has an accessible name, decorative icons inside labelled buttons are hidden from assistive technology, and every bottom-bar button is an explicit `type=button`. `<html>` carries the interface language and direction, so a screen reader announces Arabic as Arabic. A new `tests/a11y.spec.mjs` runs axe-core over the reader at rest, all four panel tabs, all three Navigator tabs, the theme picker, the notes modal and the More menu, in both languages and at 1440px and 412px, and fails on anything rated serious or critical; a keyboard-only walk of opening a document, searching, taking a note, changing theme and changing language is covered alongside it.
- **Pages are visible without WebGL**: the 2D renderer never received page images, so a browser with no working WebGL (or `?render=css`) showed a blank book. It now paints every page face, turns pages with a real fold-free flip, and keeps thumbnails, search and painted search marks working; the renderer can be pinned with `?render=css` or `?render=webgl` for testing (issue #22).
- **A full browser no longer fails silently**: a file that would not fit is not stored, and the reader is told it opens normally but will need to be picked again. Every write that runs out of space raises one clear message instead of an unhandled error.

## [6.1.0] - 2026-09-05

Two weeks of reader feedback on the 6.0 preview: the drawers now behave differently on a desk, a
tablet and a phone; files opened from disk come back after a reload; and Arabic is a first-class
citizen in search, including scanned books, which are recognised on the device.

### Added
- **Navigation model by device class**: on screens 1200px and wider the drawers dock beside the book, which re-centres in the remaining space, and both can stay open; between 768px and 1199px they overlay with a scrim and never stack; below 768px each is a full-width sheet. The section switcher is a vertical icon rail on the drawer's outer edge at desk sizes and a thumb-reachable bottom tab bar on phones. Drawer surfaces are fully opaque in every theme, and the tab lists carry `role=tablist` with arrow-key navigation in both axes.
- **Local files survive a reload**: a PDF opened from this device is kept in the browser (IndexedDB, the six most recent files up to 120 MB each) and reopens on the same page next time, instead of falling back to the default document with a "re-select it" prompt. A **Recent** list in the Document tab shows links and files opened before; a file reopens from the store, a link from the network, and entries can be removed or cleared.
- **Arabic search**: queries and page text are normalised the same way (Unicode NFKC, so the shaped presentation forms many Arabic PDFs expose as text match the letters you type; vowel marks, tatweel and alef variants are folded), glyph-split runs are glued back into words, a right-to-left query is also looked for in reverse (some producers store Arabic in the opposite order), and highlights on right-to-left runs are mirrored correctly. When a document has no text layer or its text is unmapped glyph codes, the search panel says so instead of a bare "No matches".
- **Text recognition for scanned pages (OCR)**: when a document has no text layer, the search pane offers to recognise its pages on the device with Tesseract (WebAssembly; Arabic and English language packs are vendored, so it works offline and nothing is uploaded). Recognition runs several pages at once (one worker per spare core, fewer on phones), skips the engine's slow inverted-image retry and sizes the page image to what the model needs, so a 200-page book takes minutes rather than tens of minutes on a laptop. It starts at the page being read, shows which pages are in flight and how long is left, can be stopped at any time, and recognised text (blank pages included) is kept per document in IndexedDB so a book is only processed once. Results and on-page highlights appear as each page completes.

### Changed
- **Changelog page header**: one row that never wraps; the brand links to the repository with a small GitHub mark, the back link is plain accent text, and the version moved out of the header into a "Latest release" line above the title.
- **Reader header**: the Zaya wordmark links to the repository (the More menu entry stays).
- **Service worker**: scripts and stylesheets are always fetched from the network while online, even when their URL carries the release version; only fonts, images, sounds, CMaps and the OCR engine are served cache-first. A deploy within one version can no longer run new markup on old code or styles.
- **Search status**: when nothing matches because the document has no text layer or its text is unmapped glyph codes, the panel says so.
- **Recognition language** is a three-way segmented control (Arabic + English, Arabic, English) instead of a native dropdown, which several browsers refused to open inside the drawer. One language is about twice as fast as two, and the panel says so.

### Fixed
- **Navigator stale after opening another document**: the previous book was never disposed, so its Pages, Outline and Search panels stayed in the drawer and the new document's panels were hidden behind them. The engine is now torn down properly and the drawer replaces its panels with the new document's.
- **Changelog page empty on Vercel**: `.vercelignore` excluded every Markdown file, so `CHANGELOG.md` was a 404 on deploys. It is now shipped, and the version badge stays hidden until the log has loaded.
- **Control-panel width on tablets**: a user-agent check forced the panel to the full viewport width on any tablet browser and never released it; the override now applies only below 768px.

## [6.0.0] - 2026-09-04

The reading interface was rebuilt around the document: a quieter theme, a real search, and a
touch-first layout. The version number jumps to 6.0.0 because the look, the layout rules and the
navigation model all changed.

### Added
- **Navigator and control panel**: the two side drawers were rebuilt: a titled Navigator with Pages (tile grid, two columns on phones), Outline (tree with indent lines) and Search tabs; a control panel with Document / Notes / Media / Settings tabs whose actions are labelled and show their state, a document header with page count, and a footer with the version.
- **Theme picker**: grouped into Dark / Light / Coloured / Editors, compact tiles with a single swatch strip, search, keyboard navigation and a close button.
- **Error state**: a plain-language message with "Try again" and "Open another document" replaces the raw engine error; a document you opened yourself that fails no longer silently swaps in the default document.

- **Full-text search (#16)**: a search panel beside thumbnails and outline. Text is extracted once
  per document with a small concurrency pool and cancellation, every matching page is listed with a
  highlighted snippet, and clicking a result jumps to that page. `Ctrl/Cmd+F` opens it.
- **Search hits on the page**: matches are painted onto the rendered page itself in both the 3D and
  the 2D renderer, not only listed in the panel. Marks follow what you type and clear when the panel
  closes.
- **Backup and restore**: Settings → Backup writes every quote plus your preferences (theme,
  direction, volume, loop, bottom-bar mode) to a JSON file, and imports such a file with validation
  and de-duplication.
- **Shareable link presets**: `?theme=`, `?mode=single|double`, `?search=` and `?rtl=` for embedding
  and sharing. Values are allow-listed.
- **Project tooling**: `npm run check` (syntax), `npm run lint` (ESLint), `npm test` (Playwright
  smoke tests including a mobile emulation), GitHub Actions CI, issue and pull-request templates,
  `docs/SECURITY.md`, `docs/CONTRIBUTING.md`, `docs/THIRD_PARTY_NOTICES.md` and a roadmap.

### Changed

- **Visual refresh**: a quieter, warmer default theme — ink-dark tinted neutrals, one brass accent,
  neutral shadows. Self-hosted IBM Plex Sans and Mono replace Inter, controls are flat and 44px,
  nothing lifts or glows on hover, no interface text sits below 12px, keyboard focus is visible and
  reduced-motion preferences are respected. The rationale and the tokens live in `docs/DESIGN.md`; the
  other 53 themes keep their palettes with neutralised shadows.
- **Mobile layout (#11, #8)**: page mode follows the viewport rather than the user-agent string.
  Portrait phones get a single page filling the width; landscape tablets and desktops get the
  spread. An explicit choice from the menu or `?mode=` still wins. The version label no longer hides
  under the control bar on small screens.
- **Touch controls (#11, #8)**: the bottom bar and its page numbers stay pinned on touch devices
  instead of waiting for a mouse hover. Tap-to-turn works, swipes are measured from the gesture
  origin with a direction check, and side panels overlay the book on narrow screens instead of
  squeezing it and close on an outside tap.
- **Thumbnail panel (#11)**: wheel and touchpad scrolling inside the panel no longer zooms the book
  — it is guarded in the stage itself, not only in the app layer. Thumbnail rows are cached and
  repainted from the image cache, so scrolling back never re-renders, and preloading starts earlier
  with two parallel renders.
- **Performance**: scripts are fetched in parallel and executed in order, the 845 KB pdf.js worker
  is no longer executed on the main thread, per-load cache-busting is gone (assets are versioned per
  release), Tailwind is precompiled instead of pulled from a runtime CDN, and the mousemove handler
  is throttled with a narrower MutationObserver.
- **Self-contained assets**: Toastify, marked, Font Awesome and the compiled Tailwind CSS are
  vendored. The app has no runtime CDN dependency and works offline. Per-deployment settings moved
  to `config.js`.
- **Service worker**: a versioned cache name, best-effort precaching so one missing file cannot
  block install, stale-while-revalidate for static assets, network-first for pages. PDFs and
  cross-origin requests are never cached and the message handler replies safely.
- **Storage robustness**: quotes database upgrades are additive so version bumps no longer drop
  data, open errors resolve instead of hanging forever, delete failures are reported, page memory
  retries after a failed open, and `localStorage` writes are guarded.
- **Accessibility**: focus trapping and Escape handling for the quotes and theme dialogs,
  `role` and `aria-label` on side panels and the control panel, and icon-only buttons take their
  `aria-label` from their tooltip.
- **Changelog page**: rebuilt on the reader's own theme tokens and typography. It reads this file
  and renders a release timeline with a version index; the fake telemetry dashboard and the
  commit counter are gone.

### Fixed

- `loadFlipbook` threw a `ReferenceError` after every successful load, which also left the loading
  lock stuck.
- `AppState.updatePdfContext` passed the new state as the previous state, so no listener and no
  `zaya:pdfLoaded` event ever fired.
- `zaya:pageChanged` is now emitted on page turns.
- The arrow-key handler no longer steals keystrokes while you are typing in an input.
- Closing a side panel could leave the book frozen; orbit controls now follow panel state.
- A duplicate gesture handler that clicked non-existent buttons was removed.
- The theme manager imported the quotes database from the wrong relative path, so theme changes were
  never persisted to IndexedDB.

### Security

- A strict Content-Security-Policy on both pages: no `unsafe-eval`, no inline scripts.
- pdf.js is loaded with `isEvalSupported: false`, and the `eval()`-based feature probes were removed.
- `?pdf=` and stored URLs are restricted to `http(s)`; download links to `http(s)` and `blob:`.
- All user-controlled text is escaped before rendering — quotes were a stored-XSS vector — and
  YouTube IDs are URL-encoded.

### Removed

- The 214 KB `flipbook.js.bak`, the dead cache-purge code, the unused `#storedPage` writes and
  `premium-plan.md` (moved to the private repository).
- The GitHub API call and the changelog bundle from the reader page.

## [5.4.0] - 2026-07-25

### Added

- **Plugin registry (`ZayaPlugins`)**: an event-driven extension system in `app-state.js` emitting
  `zaya:pdfLoaded`, `zaya:pageChanged`, `zaya:themeChanged`, `zaya:toolbarReady` and `zaya:init`.
- **UI extension slots (`ZayaUI`)**: `ZayaUI.registerToolbarButton()` and `ZayaUI.registerPanelTab()`
  in `controls.js`, so private plugins can inject UI without touching core HTML or JS.
- **Keyboard shortcuts**: `←` and `→` turn pages, `F` toggles fullscreen, `Cmd/Ctrl+K` opens the
  control panel.
- **Optional Pro loader**: a non-blocking loader in `app.js` for `lib/js/pro-features/index.js`.

### Changed

- **Theme engine**: `$('*')` class manipulation across the DOM tree is gone from `manager.js`.
  Themes apply to `document.documentElement` instead, so switching is a custom-property change with
  no layout reflow.
- **Theme selector**: palette colours are pre-calculated and cached in `selector.js`, removing the
  temporary `<div class="theme-...">` insertion loop during search. The modal is plain JavaScript
  with a 100ms input debounce.

## [5.3.0] - 2026-04-03

### Added

- **Media loop**: persistent "Auto Repeat" controls inside the audio player and the video modal.
- **Configuration**: support for `window.ZAYA_DEFAULT_PDF` and URL-based loading via `?pdf=`.

### Changed

- **Rebranding**: the complete transition from Paginis to Zaya, with a new logo and a single naming
  convention across variables and assets.
- **Service worker**: split into `sw-manager.js` (UI thread) and `sw.js` (background worker).

### Fixed

- `ReferenceError` crashes during local file imports in `media.js`.
- 404 errors for the root service-worker file, which had disabled offline support.
- Race conditions during IndexedDB initialisation in `db.js`.

## [5.1.1] - 2026-02-06

### Added

- **Local audio**: local file import for audio playback with progress tracking and synchronised
  volume controls.
- **Device adaptation**: automatic detection choosing booklet or zoom mode for the device.

### Changed

- **Media player**: redesigned around a mode switcher and a themed audio player, so audio no longer
  opens a separate window.

### Fixed

- 3D camera centring in single-page mode, with lighting synchronised to the focused page.
- UI arrows and keyboard shortcuts, by restoring the navigation methods missing from the modular
  factory.

## [5.0.0] - 2026-01-12

### Added

- **Page number entry** in the bottom bar.
- **Performance dashboard** on the changelog page (removed again in 6.0.0).

### Changed

- **Library modularisation**: the DFlip core was refactored into modular ES6 files.
- **Icons**: legacy emoji replaced by a consistent Font Awesome set.
- **Themes**: universal theme toggling across the whole project structure.
- **Control panel and bottom bar**: restyled, including the quotes module.
- **Styles**: absolute paths removed and persistent styles consolidated into one modular entry point.

### Fixed

- Scrolling the thumbnail or bookmark list no longer triggers zoom or a page turn.

### Removed

- Legacy unused code and deprecated event listeners.

## [4.5.0] - 2026-01-03

### Changed

- Legacy colour schemes replaced by a theme-aware system built on CSS custom properties.
- Flipbook controls migrated into the bottom panel.

### Fixed

- Theme and PDF state are preserved across reloads.

### Removed

- Hardcoded hex colours.

## [4.4.0] - 2025-12-22

### Changed

- Improved the PDF fallback system.
- Configuration centralised in `app-state.js`.

### Fixed

- RTL/LTR toggle synchronisation.

## [4.0.0] - 2025-11-01

### Added

- Mobile support: touch gesture navigation, hover-aware sidebars and haptic feedback.

### Changed

- Memory management: automatic cleanup of heavy PDF and YouTube instances.
- Centralised, event-driven `AppState` replacing global variables.

### Security

- An input validation framework covering URLs and file uploads.

## [1.0.0] - 2024-10-24

### Added

- Initial release: the basic flipbook and its core integration.
