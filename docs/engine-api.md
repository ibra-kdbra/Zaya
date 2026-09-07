# The engine contract

Zaya draws its pages with an engine, and this file is everything the application is allowed to
know about it. It is a specification rather than a description: it was written from the outside
so that an engine could be built from it alone, and that is what happened — `engine-next/` was
written against this page and now draws every page the reader sees. The fork it replaced was
deleted in 7.0.0 and no code of it remains in the tree.

Everything below is stated as *what the application asks for* and *what it must observe in
return*, never as a description of how the engine happens to be built. Where the fork and its
replacement answered a question differently, the answer recorded here is the one that holds.

Two files enforce it:

- **`lib/js/core/book.js`** implements the contract as `window.ZayaBook`, by translating it onto
  `engine-next/`. It is the only file under `lib/` allowed to know how the engine is put
  together, and it is where anything the engine leaves to the application — saving a download,
  showing the share box, painting search marks, building the Navigator's panes — is arranged.
- **`tests/engine-contract.spec.mjs`** exercises every KEEP member through `window.ZayaBook` on
  the fixtures. It asserts behaviour, not markup, so another engine would run the same file.

Each member is marked **KEEP** (part of the contract; the app may rely on it) or **INTERNAL**
(the app must not touch it; listed here so that what was migrated away is on the record).

---

## 1. The namespace

`window.ZayaBook` is a classic script, listed in `lib/js/app.js` straight after the engine. It
publishes the namespace only; the engine itself is looked up when a document is opened. The
engine is a set of ES modules, so one line of module — `lib/js/core/engine.js` — imports it and
leaves the constructor on `window.ZayaEngine`; the loader runs that before the facade's first
`create`, and nothing else in `lib/` reads it.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `create` | `(container, source, options) → Handle` | Opens `source` inside `container` (an element or a selector) and returns a handle. The handle also becomes `ZayaBook.current`. Throws synchronously if the container does not exist or the engine has not loaded. **`lib/js/core/load.js` is the only caller.** | `core/load.js` | KEEP |
| `current` | getter → `Handle \| null` | The open document, or `null` when none is open. Reading it is cheap and safe at any time, including before the first load and after a teardown. | every feature | KEEP |
| `isReady` | getter → `boolean` | True while a document is open *and* its pages can be turned. `current` may be non-null a moment before this becomes true. | `tests/helpers.mjs`, `core/load.js` | KEEP |
| `dispose` | `() → void` | Tears down `current`, if any. Equivalent to `current.dispose()`. | — | KEEP |
| `stageSelector` | `string` | A CSS selector matching the stage element(s) of an open book, and nothing when none is open. It exists so that a leak check — which has no API left to ask — can stay engine-agnostic; a replacement engine names its own root class here. | `tests/engine-contract.spec.mjs` | KEEP |

### Construction options

`create` takes exactly the options below. Anything else is passed through untouched, so a
replacement engine may accept more, but must not *require* more.

| Option | Type | Meaning | KEEP |
| --- | --- | --- | --- |
| `height` | `string \| number` | The stage height. Zaya passes `"100%"`; a bare number is pixels. | KEEP |
| `paddingTop` | `number` | Pixels kept clear at the top of the stage, so the app header does not sit over the page. Zaya passes `56`. | KEEP |
| `paddingBottom` | `number` | Pixels kept clear at the bottom, for the control bar. Zaya passes `40`. | KEEP |
| `duration` | `number` | Milliseconds one page turn takes. Zaya passes `480`. | KEEP |
| `backgroundColor` | CSS colour | The colour behind the book. | KEEP |
| `direction` | `"ltr" \| "rtl"` | Reading direction, fixed for the life of the book: changing it reopens the document (§3). | KEEP |
| `openPage` | `number` | The book page to open on, 1-based. Out-of-range values are clamped, never rejected. | KEEP |
| `pdfId` | `string` | The key page memory and notes are filed under. Opaque to the engine; it only hands it back with page changes. | KEEP |
| `hard` | `"none" \| "cover" \| "all"` | How many sheets are stiff: none, the outer cover only, or every sheet. Load-time only (§8). | KEEP |
| `soundEnable` | `boolean` | Whether a page turn makes a sound. May be changed later through `setSoundEnabled` (§7). | KEEP |
| `text` | `object` | The engine's own labels, already translated: `toggleSound`, `toggleThumbnails`, `toggleOutline`, `previousPage`, `nextPage`, `toggleFullscreen`, `zoomIn`, `zoomOut`, `toggleHelp`, `singlePageMode`, `doublePageMode`, `downloadPDFFile`, `gotoFirstPage`, `gotoLastPage`, `play`, `pause`, `share`, `mailSubject`, `mailBody`, `loading`. Missing keys fall back to the engine's own wording. Built by `engineText()` in `core/load.js` from the `engine.*` i18n keys. | KEEP |
| `onReady` | `(handle) => void` | Called once, when the document is open and its first spread has been laid out. Receives the **handle**, never an engine object. | KEEP |
| `onPageChanged` | `(bookPage) => void` | Called on every page turn, with the book page now open. The facade wraps this to write page memory and `AppState`, so a replacement engine needs to know nothing about either. | KEEP |
| `zoomChange` | `(isZoomed) => void` | Called when the reader zooms in or back out. Zaya uses it to stop the document scrolling behind a zoomed page. | KEEP |

Anything else an engine offers is **INTERNAL**. `engine-next` takes several options of its own —
`renderMode`, `soundUrl`, `paintPage`, `textLayer`, `pageMode`, `doubleInternal`, `readback` —
and `core/book.js` fills them in from the contract's options, from `?render=`, and from the
sound the application ships; nothing outside that file passes them. Asset locations are the
engine's own business: it resolves them from its module URL and nothing in `lib/` supplies them.

Two of those deserve a note, because they used to be nobody's decision:

- **the renderer.** `window.ZAYA_RENDER_MODE` and `?render=` (§8) are read by the facade, not by
  the engine, and arrive as an option. The application still does not *choose* the renderer;
  it only passes on what the page or the URL asked for.
- **the sound.** The engine plays a page turn; which file it plays comes from the application,
  which is what ships it (`lib/sound/`).

---

## 2. Lifecycle

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `dispose()` | `() → void` | Closes the document: stops rendering, releases the PDF, removes every element the engine added to the container, and hands the container element back unmarked — no leftover classes, no leftover inline sizing. Calling it twice is a no-op. Afterwards the handle answers quietly (`activePage` 1, `pageCount` 0, `pdfDocument` null, `isReady()` false, `disposed` true) rather than throwing, and `ZayaBook.current` is `null`. | `core/load.js`, `utils/memory-manager.js` | KEEP |
| `disposed` | getter → `boolean` | Whether this handle has been torn down. | contract tests | KEEP |
| `resize()` | `() → void` | Re-measure the stage and re-lay the book. Called after anything changes the size of the reading area: a docked drawer opening, a fullscreen change. Safe to call before the document is ready and after it is disposed. | `core/load.js`, `features/controls/` | KEEP |
| `isReady()` | `() → boolean` | Whether pages can be turned yet. | `tests/helpers.mjs` | KEEP |
| `source` | getter → `string \| null` | The source the book was opened with, as given. `null` once disposed. | `core/load.js` | KEEP |
| `createdWith` | getter → `object \| null` | The options `create` was given, for a handle that `create` made; `null` for a book adopted from elsewhere. | contract tests | KEEP |
| `engine` | getter | The underlying engine object. **INTERNAL** — it exists for `core/book.js` itself and its tests; nothing else in `lib/` may read it. | — | INTERNAL |

**No leaks.** After `dispose()` — and after opening a second document — the page must hold exactly
one stage (`ZayaBook.stageSelector`) for one open book and none for none, and no canvases left
under `#flipbookContainer`. The contract test opens four documents in a row and checks this after
each.

---

## 3. Navigation

Book pages are 1-based and count *faces*, not sheets: a three-page PDF is three book pages,
whether the reader sees them one at a time or as spreads.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `activePage` | getter → `number` | The page now open. `1` before anything is open. `gotoPage(n)` makes it exactly `n`; a turn made with `next` or `prev` lands on the **recto** of the spread it reaches — the odd-numbered leaf — so turning forward from the cover of a three-page book reports `3`, and the reader sees pages two and three. | control bar, print, text pane, page memory | KEEP |
| `pageCount` | getter → `number` | Book pages in the document. `0` when none is open. | control bar, print, search panel | KEEP |
| `gotoPage(n)` | `(number) → number` | Turn to page `n`, animating. `n` is clamped into `1…pageCount`; a non-number is treated as `1`. Returns the page the book is on when the call returns (the animation may still be running). | control bar, search results, tests | KEEP |
| `next()` | `() → void` | Turn one page (one spread in double mode) forward *in reading order*: leftward in a right-to-left book. No-op at the end. | control bar | KEEP |
| `prev()` | `() → void` | The same, backwards. No-op at the start. | control bar | KEEP |
| `first()` | `() → void` | Turn to the first page. | More menu | KEEP |
| `last()` | `() → void` | Turn to the last page. | More menu | KEEP |
| `pageMode` | getter → `"single" \| "double"` | Whether one page or a spread is on screen. | control bar, print, text pane, URL options | KEEP |
| `setPageMode(isSingle, fromUser)` | `(boolean, boolean) → "single" \| "double"` | Switch layout. `fromUser` marks the choice as the reader's own, so the engine's own viewport heuristic must not override it afterwards. Returns the mode in force. Re-lays the book and keeps the reader on the page they were on. | More menu, `?mode=`, remembered prefs | KEEP |
| `direction` | getter → `"ltr" \| "rtl"` | Reading direction. **Read-only:** direction is fixed at construction, so the app changes it by disposing the book and calling `create` again with the new `direction` and the same `openPage` (see `reopenOnSamePage` in `core/load.js`). | `core/load.js` | KEEP |

Turning a page must call `options.onPageChanged(bookPage)` — once per settled page, not once per
animation frame. `AppState` turns that into the `zaya:pageChanged` event (§9).

**INTERNAL, migrated away:** `book.target.gotoPage`, `book.target.next`, `book.target.prev`,
`book.target._activePage`, `book.target.pageCount`, `book.target.pageMode`,
`book.target.direction`, `book.start()`, `book.end()`, and the numeric direction and page-mode
codes (`1`/`2`). These were read directly by `core/load.js`, `features/controls/custom-controls.js`,
`features/print/print.js`, `features/text/text-pane.js`, `utils/url-options.js` and
`tests/helpers.mjs`; all now go through the members above.

---

## 4. The document

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `pdfDocument` | getter → `PDFDocumentProxy \| null` | The pdf.js document proxy for the open PDF, so the app can render pages itself. Zaya prints from it (`features/print/print.js`) and indexes its text for search and the Text pane. `null` before the document is open and after teardown. The engine owns the proxy's lifetime: it must stay usable until `dispose()`. | print, search, text pane | KEEP |
| `spreadPerPdfPage` | getter → `boolean` | Whether one PDF page carries a whole two-page spread — a scanned booklet, where the page count of the book is roughly twice the page count of the PDF. | text pane, print | KEEP |
| `toPdfPage(bookPage)` | `(number) → number` | Book page → PDF page. Identity for an ordinary document. When `spreadPerPdfPage`, book pages 1 and 2 are the covers on PDF pages 1 and 2, and from book page 3 on each PDF page carries two: `ceil((bookPage − 1) / 2) + 1`. Always returns at least `1` and never more than `pdfDocument.numPages`. | text pane, print | KEEP |
| `toBookPage(pdfPage)` | `(number) → number` | The inverse: identity for an ordinary document, `pdfPage * 2 − 1` beyond PDF page 2 when `spreadPerPdfPage`. That is the right-hand of the two leaves the scanned page carries; the left-hand one would do as well, since both are on the same spread, and this is simply the answer the application and its tests have always used. Clamped into `1…pageCount`. | search results | KEEP |
| `visiblePdfPages()` | `() → number[]` | The PDF pages on screen right now, in reading order, with duplicates removed: one page in single mode, the pair of the spread in double mode (the even page and the odd one after it), mapped through `toPdfPage`. Empty before the document is ready. | text pane | KEEP |

Both mappings are total functions: they never throw and never leave the document, whatever number
— zero, negative, fractional, past the end — they are handed.

**INTERNAL, migrated away:** `book.contentProvider.pdfDocument`, `book.contentProvider.pageCount`,
`book.contentProvider.options.pageSize`.

---

## 5. Search

Zaya indexes the text itself (`lib/js/features/search/`) and can recognise pages that carry no
text layer. What the engine owes is the drawer element the panel lives in, and the ability to
paint marks into the page as it is rendered — marks live in the page texture, so they show
identically in whichever renderer is running.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `searchController` | getter → `PdfTextSearch \| null` | The index, once built. `null` until `ensureSearch()` or the search panel has been asked for. | text pane, tests | KEEP |
| `ensureSearch()` | `() → PdfTextSearch \| null` | Build the search panel and its index if they do not exist yet, and return the controller. Idempotent: calling it repeatedly returns the same controller and builds nothing twice. `null` for a document that has no text to index. | text pane | KEEP |
| `setSearchHighlight(query)` | `(string) → void` | Set the query whose hits are painted onto the pages, or clear it with `""`. A query shorter than two characters counts as cleared. Repaints whatever is visible. | search panel | KEEP |
| `drawSearchHighlights(ctx, viewport, pdfPage)` | `(CanvasRenderingContext2D, PageViewport, number) → boolean` | Paint the current query's hits for `pdfPage` onto any 2D context, using the pdf.js viewport to place them. Returns whether anything was drawn — `false` when no query is set or the page has no hits. The app calls this when it renders a page itself, so a printed sheet carries the same marks as the screen. | print | KEEP |
| `refreshVisiblePages()` | `() → void` | Re-render the pages on screen. Called when newly recognised text means the marks have changed under the reader. | search panel, text pane | KEEP |
| `searchInput()` | `() → HTMLInputElement \| null` | The search field, so the app can focus it or read it back. | text pane, URL options | KEEP |
| `openSearch(query)` | `(string?) → void` | Open the search panel and, with a query, fill the field and start the search. Called by `?search=` and by "Search this selection" in the Text pane. | `?search=`, text pane | KEEP |

**INTERNAL, migrated away:** `book.contentProvider.searchController`,
`book.contentProvider.initSearch`, `book.contentProvider.setSearchHighlight`,
`book.contentProvider.drawSearchHighlights`, `book.contentProvider.refreshVisiblePages`,
`book.target.searchInput`, `book.target.searchContainer`, `book.ui.searchPanel`.

---

## 6. Panels

The engine builds no interface at all. The Navigator's four tabs are the application's own:
`features/navigator/panes.js` builds the Pages and Outline panes from the data in §6a and hosts
the Search pane that `features/search/search-panel.js` fills, and `features/text/text-pane.js`
builds the Text pane beside them. The three members below are what the facade publishes so that
the Navigator does not have to know which module builds what.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `ensurePanel(name)` | `("thumbs"\|"outline"\|"search") → Element \| null` | Build the pane if it does not exist, and return its root element. Idempotent — a second call builds nothing. `null` for an unknown name, and before a document is open. | Navigator | KEEP |
| `panel(name)` | `("thumbs"\|"outline"\|"search") → Element \| null` | The pane's root element if it has been built, else `null`. | Navigator | KEEP |
| `setPanelActive(name, on)` | `(string, boolean) → void` | Mark which pane the application considers open. Silently does nothing for an unknown name. | Navigator | KEEP |
| `updateUi(force)` | `(boolean?) → void` | Redraw the engine's own chrome after the app has changed something behind its back. `engine-next` draws none, so this does nothing; it stays because an engine that drew its own controls would need telling. | Navigator, `core/load.js` | KEEP |

### The DOM contract

A pane root is an element that:

- carries `nav-pane`, and `nav-pane-visible` exactly while it is showing. The Navigator toggles
  that second class to open and close a tab, and watches it so that a pane opened from elsewhere
  (`?search=`, "search this selection" in the Text pane) opens the drawer too;
- lives in `#navigatorBody` and carries an id (`navPaneThumbs` / `navPaneOutline` /
  `navPaneSearch` / `navPaneText`), `role="tabpanel"`, `tabindex` and `data-nav-tab`;
- is rebuilt per document, and the old one discarded. Exactly one of each kind may exist.

The Navigator decides whether a pane is empty by looking inside it, so these names are shared
between `panes.js`, `search-panel.js` and the stylesheets, and are changed in one pass or not at
all:

| Selector | What it marks |
| --- | --- |
| `.nav-pages`, `.nav-page` | the Pages pane, and one page tile in it |
| `.nav-outline`, `.nav-outline-item` | the Outline pane, and one entry in it |
| `.nav-search`, `.nav-search-result` | the Search pane, and one result in it |
| `.nav-pane`, `.nav-pane-visible` | any pane, and the one showing |

The engine's own markup is entirely its business. `engine-next` marks the container it was given
`zn-book`, puts a `zn-stage` inside it, and names everything below that `zn-*`; the application
styles none of it, and `ZayaBook.stageSelector` is the only place any of it is written down.

## 6a. Data for panels

The panels in §6 are the fork's, and they are the last part of the engine that builds interface.
A replacement engine builds none: it exposes the three things only it can work out, and the
Navigator renders them in Zaya's own markup. Every member here is **KEEP**; the engine ships no
DOM for any of them.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `getThumbnail(pdfPage, width)` | `(number, number?) → Promise<HTMLCanvasElement>` | A picture of one PDF page, at most `width` CSS pixels across (default 160, clamped into 16…600). The canvas belongs to the engine's own small cache: two calls with the same page and width give back the *same* canvas, and two callers asking at once share one render rather than racing. The caller may put it in the document but must not resize or draw on it. `pdfPage` is clamped into `1…pdfDocument.numPages`. | Navigator's Pages pane | KEEP |
| `getOutline()` | `() → Promise<Array<{title, pdfPage, children}>>` | The document's outline, as plain data: `title` a string, `pdfPage` a 1-based PDF page with **named and explicit destinations already resolved**, and `children` the same shape, recursively. An entry whose destination cannot be resolved reports `pdfPage: 0`, which the panel shows as a heading rather than a link. `[]` for a document with no outline, and for one whose outline will not load — never a rejection. Built once and remembered. | Navigator's Outline pane | KEEP |
| `getPageLabel(pdfPage)` | `(number) → Promise<string>` | What a page calls itself: the entry from the document's page-labels table (`"iv"`, `"A-3"`) when it has one, and the page number as a string when it has not. Total: any number, clamped. | Navigator's Pages pane, page field | KEEP |

Turning to an outline entry or a thumbnail is the application's job: map the PDF page with
`toBookPage` (§4) and call `gotoPage`. The engine offers no navigation of its own here.

---

## 7. Chrome, sound and zoom

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `toggleFullscreen()` | `() → void` | Enter or leave fullscreen, through whatever mechanism the engine uses, so its own stage follows. | control bar | KEEP |
| `share()` | `() → void` | Show the share box for the page now open. The engine works out the address — this page's, with `?page=` on it — and the facade puts the box on screen (`ui/share-box.js`). | control bar | KEEP |
| `download()` | `() → boolean` | Offer the open document for download. Returns whether anything was started. The engine resolves the document to a URL or a blob and the facade saves it; with no book open it falls back to opening `source` in a new tab. | More menu | KEEP |
| `zoom(delta)` | `(number) → void` | Zoom in (`+1`) or out (`−1`) one step. Zooming past the fit-to-page step calls the `zoomChange` option. | control bar | KEEP |
| `setInteractive(on)` | `(boolean) → void` | Let the stage go, or take it back. The app switches this off while the pointer is over a drawer, so dragging in a panel does not orbit the book beneath it, and back on when the pointer leaves. A renderer with nothing to orbit may ignore it. | control bar | KEEP |
| `interactive` | getter → `boolean` | Whether the stage is currently taking pointer input. A renderer with nothing to orbit reports `true`. | contract tests | KEEP |
| `soundEnabled` | getter → `boolean` | Whether page turns make a sound. Defaults to the `soundEnable` option, `true` when unset. | More menu | KEEP |
| `setSoundEnabled(on)` | `(boolean) → void` | Turn the page-turn sound on or off. The app remembers the choice itself (`zayaSoundEnabled`) and re-applies it to each new book, because the engine forgets it between documents. | More menu | KEEP |
| `fullscreen` | getter → `boolean` | Whether the book's own container is the fullscreen element. Follows the browser's `fullscreenchange`, so it is right even when the reader leaves fullscreen with the keyboard. | control bar | KEEP |
| `setTextLayerEnabled(on)` | `(boolean) → void` | Whether the pages carry a transparent, selectable text layer over them. On by default. Selection is a reader's setting and a printing concern, not a rendering one, so the app may switch it off — for a scan with no text worth selecting, say — without the engine deciding for it. | settings, Text pane | KEEP |
| `textLayerEnabled` | getter → `boolean` | Whether that layer is on. | settings | KEEP |

**Zoom.** `zoom(delta)` above is a step in or out, and that is what the application asks for.
An engine is free to speak in absolute levels instead — `engine-next` does, with `zoom(level)`,
`zoomIn()`, `zoomOut()` and `resetZoom()`, `1` meaning fit-to-stage — and `core/book.js` maps
the contract's `±1` onto its `zoomIn` / `zoomOut`. Whatever the spelling, three things are the
contract: the `zoomChange` option fires **once** on each crossing of the fit boundary and not
once per step; a magnified page is re-rendered at the magnified scale rather than merely
stretched; and the reader can pan a magnified page and get back to fit.

| `tilt` | getter → `{pitch, yaw, tilted}` | How far the book is tipped away from flat, in radians: `pitch` above or below it, `yaw` to one side. `tilted` is false when it lies flat. | control bar | KEEP |
| `setTilt(pitch, yaw)` | `(number, number) → tilt` | Tip the book. An engine clamps the angles to what stays readable and returns what it applied, so a caller can follow. | control bar | KEEP |
| `resetTilt()` | `() → tilt` | Lay it flat again. | control bar | KEEP |

The reader tips the book by holding shift and dragging, or by dragging with the right button, and
lays it flat again with shift and a double click. It needs a gesture of its own because an ordinary
drag anywhere on the stage turns a page — including the space beside the book, which is where a
reader reaches to flick a corner. An engine that cannot tip a book keeps these members and reports
a flat one.

> **Why this is written down.** This capability was lost in 7.0.0 and restored in the release after
> it. The first version of this contract recorded only `book.stage.orbitControl.enabled` under the
> internal members below, because the application's sole use of the old engine's orbit control was
> to switch it *off* while the pointer was over a drawer. Read from the call sites alone it looked
> like plumbing; it was in fact the only way a reader could tip the book, and freezing the contract
> from what the application called rather than from what the reader could do let it fall out of the
> rebuild unnoticed. A capability with no call site is exactly the kind this document exists to
> protect.

**INTERNAL, migrated away:** `book.ui.switchFullscreen`, `book.ui.share`, `book.ui.download`,
`book.ui.updateSound`, `book.options.soundEnable`, `book.options.source`,
`book.stage.orbitControl.enabled` (its *capability* is now the `tilt` members above).

---

## 8. Render modes and stiff pages

**`renderMode`** — getter → `"webgl" | "css"`, **KEEP**. Which renderer is drawing: the 3D one, or
the 2D fallback for machines whose WebGL is missing or unusable. The app does not choose it;
it reports it (issue #22), and every other member of this contract behaves identically in both.

The renderer can be pinned, for a browser with broken WebGL and for testing:

- `window.ZAYA_RENDER_MODE = "css" | "webgl"` — set by the page, wins over everything;
- `?render=css` (also `2d`, `html`) or `?render=webgl` (also `3d`) — read at construction.

Anything else leaves the choice to whether WebGL works. The value is documented in
`lib/js/utils/url-options.js` and read by the engine when the book is built, not by the app.

**`hardCover`** — getter → `"none" | "cover" | "all"`, **KEEP**. Which sheets are stiff, as passed
in the `hard` option. It is a **load-time** option in both renderers: changing it means disposing
the book and calling `create` again on the same page, which is what
`window.appState.subscribe('hardCover', …)` in `core/load.js` does. The getter exists so the app
can tell what the open book was given.

---

## 9. Events

Four events are dispatched on `document`. **None of them is the engine's** — this is the boundary
the facade draws. An engine that wants to announce itself must do so under a name of its own:
`engine-next` uses a `zaya-engine:` prefix, and nothing in `lib/` listens to it. They are listed because
they are the contract's observable side and the plugin API's (`docs/CONTRIBUTING.md`).

| Event | Dispatched by | Detail | When |
| --- | --- | --- | --- |
| `zaya:init` | `lib/js/app.js` | `{ version }` | Once, after every script has loaded and run. Everything on `window` exists by now, so restoring drawers and applying `?theme=` / `?lang=` waits for it. |
| `zaya:toolbarReady` | `lib/js/ui/controls.js` | — | When the app's own chrome is wired. Fires while `controls.js` is running, i.e. **before** `zaya:init`. |
| `zaya:pdfLoaded` | `lib/js/utils/app-state.js` | `{ url, type, name }` | When the open document changes, driven by `core/load.js` calling `appState.updatePdfContext()`. Fires per document, not per render. |
| `zaya:pageChanged` | `lib/js/utils/app-state.js` | `{ page }` | When the page settles on a new one, driven by the `onPageChanged` construction option through `appState.setLastPage()`. Turning to the page already open fires nothing. |

Ordering over one document's life: `zaya:toolbarReady` → `zaya:init` → `zaya:pdfLoaded` →
`zaya:pageChanged` (repeatedly). A second document repeats the last two. `onReady` fires between
`zaya:pdfLoaded` and the first `zaya:pageChanged`.

Zaya also emits `zaya:themeChanged`, `zaya:languageChanged`, `zaya:pageTextChanged`,
`zaya:quotesChanged` and `zaya:recentChanged`; none has anything to do with the engine.

---

## 9a. What the reader can do to the stage

Every row below is part of the contract, exactly as the members above are. They are listed
separately because they are the ones easiest to lose: none of them has a call site in the
application, so an engine rebuilt from this document's member tables alone would satisfy every
test and still take them away. Three were in fact lost in 7.0.0 and restored afterwards — the
wheel, panning, and tipping the book.

| Gesture | At rest | Magnified |
| --- | --- | --- |
| click or tap | turns the side that was clicked | nothing |
| press and drag | the sheet follows the pointer and settles by where it was let go | the page pans |
| the wheel | zooms about the pointer, a notch at a time | the same |
| control and the wheel | the same — it is how a trackpad pinch and the keyboard zoom arrive | the same |
| two fingers apart or together | zooms about their midpoint | the same, and pans with them |
| double-click or double-tap | zooms in on that point | back to fit |
| shift and drag, or the right button | tips the book away from flat | the same |
| shift and double-click | lays a tipped book flat | the same |
| a press on a run of text | selects it, and never turns a page | the same |

Two rules behind the table. A gesture on the book and a gesture beside it do the same thing: the
space around a page is where a reader reaches to flick its corner, so it cannot be given to
anything else. And a magnified page keeps its own gestures — panning replaces the page turn while
it is magnified, rather than the two competing.

Keyboard navigation is the application's, not the engine's: arrow keys, `Home` and `End` are bound
in `lib/js/ui/controls.js`. What the engine owes is not to swallow them — a text layer that takes
the arrow keys for its own is a defect.

---

## 10. What the engine may not do

An engine reads and writes nothing outside its own container and its own construction options.
It does not call `window.saveLastPage`, `window.appState`, `window.ZayaNavigator`,
`window.ZayaDocumentError` or `window.ZayaCurrentDocKey`; it does not close a drawer; it does not
decide what a failed load looks like. Everything it has to say it says through the callbacks in
§1, and the facade decides what the application does about it.

The fork under `engine/` broke that rule in three places — it wrote page memory directly, closed
the Navigator itself, and reported document errors through a global — which is why the rule is
written down rather than assumed. `engine-next` breaks it nowhere: its only reference to the page
outside its container is `document.fullscreenchange`, which is where the browser puts it.
