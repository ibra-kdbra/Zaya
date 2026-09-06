# The engine contract

Zaya draws its pages with an engine it does not own: the fork under `engine/`, derived from
DearFlip Lite and licensed CC BY-NC-ND 4.0. Replacing it with permissively-licensed code is the
one structural change the project is still waiting on, and this file is the specification that
replacement is to be written from.

It is written from the outside. Everything below is stated as *what the application asks for* and
*what it must observe in return* — never as a description of how the fork happens to be built —
so that an engine written against this page owes nothing to the fork's code or structure.

Two files enforce it:

- **`lib/js/core/book.js`** implements the contract as `window.ZayaBook`, today by delegating to
  the fork. It is the only file under `lib/` allowed to know how the engine is put together.
- **`tests/engine-contract.spec.mjs`** exercises every KEEP member through `window.ZayaBook` on
  the fixtures. It asserts behaviour, not markup, so a replacement engine runs the same file.

Each member is marked **KEEP** (part of the contract; the app may rely on it) or **INTERNAL**
(the app must not touch it; listed here so that what was migrated away is on the record).

---

## 1. The namespace

`window.ZayaBook` is a classic script, listed in `lib/js/app.js` straight after the engine. It
publishes the namespace only; the engine itself is looked up when a document is opened.

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
| `duration` | `number` | Milliseconds one page turn takes. Zaya passes `700`. | KEEP |
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

Options the fork also reads — `webgl`, `pageMode`, `singlePageMode`, `pageSize`, `transparent`,
`forceFit`, `autoPlay`, `search`, `icons`, `mockupjsSrc`, `pdfjsSrc`, `soundFile`,
`imagesLocation`, `cMapUrl`, `enableDownload`, `controlsPosition` — are **INTERNAL**: Zaya passes
none of them, and a replacement engine owes nothing for them. Asset locations in particular are
the engine's own business; the fork resolves them from its module URL and nothing in `lib/`
supplies them.

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
| `activePage` | getter → `number` | The page now open — the left-hand page of the spread in double mode. `1` before anything is open. | control bar, print, text pane, page memory | KEEP |
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
| `toBookPage(pdfPage)` | `(number) → number` | The inverse: identity for an ordinary document, `pdfPage * 2 − 1` beyond PDF page 2 when `spreadPerPdfPage`. Clamped into `1…pageCount`. | search results | KEEP |
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

The engine builds three side panels — thumbnails, outline and search — because they need the
stage to suppress orbiting and scrolling while the pointer is over them. Zaya's Navigator
(`features/controls/custom-controls.js`) re-parents them into its own drawer as tabs; the Text
pane beside them is Zaya's own and no concern of the engine's.

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `ensurePanel(name)` | `("thumbs"\|"outline"\|"search") → Element \| null` | Build the panel if it does not exist, and return its root element. Idempotent — a second call builds nothing. `null` for an unknown name, and for a panel the document cannot support (no outline, no text). | Navigator | KEEP |
| `panel(name)` | `("thumbs"\|"outline"\|"search") → Element \| null` | The panel's root element if it has been built, else `null`. | Navigator | KEEP |
| `setPanelActive(name, on)` | `(string, boolean) → void` | Tell the engine's own toolbar which panel the app considers open, so its buttons agree with the drawer. Silently does nothing for an unknown name. | Navigator | KEEP |
| `updateUi(force)` | `(boolean?) → void` | Redraw the engine's own chrome — page numbers, button states — after the app has changed something behind its back. `force` redraws even when nothing looks changed. | Navigator, `core/load.js` | KEEP |

### The DOM contract

A panel root must be an element that:

- carries `df-sidemenu`, and `df-sidemenu-visible` exactly while it is showing. The Navigator
  toggles that second class to open and close a tab, and watches it so that a panel the engine
  opens by itself (`?search=`, the engine's own toolbar) opens the drawer too;
- survives being moved into another parent. The Navigator appends it to `#navigatorBody` and
  gives it an id (`navPaneThumbs` / `navPaneOutline` / `navPaneSearch`), `role="tabpanel"`,
  `tabindex` and `data-nav-tab`; the engine must not move it back or re-create it in place;
- is rebuilt per document, and the old one discarded. Exactly one of each kind may exist.

The Navigator recognises panels, and decides whether one is empty, by these class names. They are
part of the contract until the panels are rebuilt as Zaya's own, and a replacement engine must
produce them:

| Selector | What it marks |
| --- | --- |
| `.df-thumb-container` | the thumbnails panel root |
| `.df-vrow` | one thumbnail row inside it |
| `.df-outline-container` | the outline panel root |
| `.df-outline-item` | one outline entry |
| `.df-search-container` | the search panel root, which the app fills |
| `.df-sidemenu`, `.df-sidemenu-visible` | any panel, and the one showing |

Also styled by the app or queried by tests, and so equally part of the DOM contract:
`.df-container` (the stage root, on `#flipbookContainer` itself), `.df-book-page`,
`.df-book-stage`, `.df-book-wrapper`, `.df-css-page`, `.df-page-front`, `.df-page-back`,
`.df-ui` and its buttons (`.df-ui-btn`, `.df-ui-page`, `.df-ui-download`, `.df-ui-controls`),
`.df-next-button` / `.df-prev-button`, `.df-share-*`, `.df-fullscreen-active`, `.df-rtl`.
A replacement engine is free to rename all of these, provided it renames them in
`lib/css/page/shell.css`, `custom-ui.css` and `chrome.css`, in the Navigator's selector table and
in `ZayaBook.stageSelector` at the same time. The contract tests do not depend on them.

The search panel's own contents (`.df-search-input`, `.df-search-result`, `.df-search-status`,
`.df-ocr*`) are built by `lib/js/features/search/search-panel.js` and are **not** the engine's.

**INTERNAL, migrated away:** `book.contentProvider.initThumbs`,
`book.contentProvider.initOutline`, `book.ui.thumbnail`, `book.ui.outline`, `book.ui.update`.

---

## 7. Chrome, sound and zoom

| Member | Signature | Semantics | Used by | |
| --- | --- | --- | --- | --- |
| `toggleFullscreen()` | `() → void` | Enter or leave fullscreen, through whatever mechanism the engine uses, so its own stage follows. | control bar | KEEP |
| `share()` | `() → void` | Open the engine's share box for the current page. | control bar | KEEP |
| `download()` | `() → boolean` | Offer the open document for download. Returns whether anything happened; falls back to opening `source` in a new tab when the engine has no download control of its own. | More menu | KEEP |
| `zoom(delta)` | `(number) → void` | Zoom in (`+1`) or out (`−1`) one step. Zooming past the fit-to-page step calls the `zoomChange` option. | control bar | KEEP |
| `setInteractive(on)` | `(boolean) → void` | Let the stage go, or take it back. The app switches this off while the pointer is over a drawer, so dragging in a panel does not orbit the book beneath it, and back on when the pointer leaves. A renderer with nothing to orbit may ignore it. | control bar | KEEP |
| `interactive` | getter → `boolean` | Whether the stage is currently taking pointer input. A renderer with nothing to orbit reports `true`. | contract tests | KEEP |
| `soundEnabled` | getter → `boolean` | Whether page turns make a sound. Defaults to the `soundEnable` option, `true` when unset. | More menu | KEEP |
| `setSoundEnabled(on)` | `(boolean) → void` | Turn the page-turn sound on or off, and update whatever the engine shows for it. The app remembers the choice itself (`zayaSoundEnabled`) and re-applies it to each new book, because the engine forgets it between documents. | More menu | KEEP |

**INTERNAL, migrated away:** `book.ui.switchFullscreen`, `book.ui.share`, `book.ui.download`,
`book.ui.updateSound`, `book.options.soundEnable`, `book.options.source`,
`book.stage.orbitControl.enabled`.

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
the facade draws, and a replacement engine dispatches nothing at all. They are listed because
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

## 10. What the engine may not do

The fork still reaches out of its own root in four places. Three are contract violations that a
replacement engine must not repeat; the fourth is allowed.

| Site | What it does | Verdict |
| --- | --- | --- |
| `engine/factory.js` | reports page turns through `options.onPageChanged` | **allowed** — that is the contract hook |
| `engine/factory.js` | falls back to `window.saveLastPage` / `window.appState` when no `onPageChanged` is given | INTERNAL, for books opened by the engine's own lightbox; a replacement engine drops it |
| `engine/ui/ui.js` | calls `window.ZayaNavigator.close()` | INTERNAL — a replacement engine reports the dismissal and lets the app decide |
| `engine/core/texture-library.js` | calls `window.ZayaDocumentError()` on a failed load, and `window.ZayaCurrentDocKey()` for the search panel's storage key | INTERNAL — both belong in construction options or a failure callback |

Untangling those three is step E2. They are recorded here so the replacement is not written
against them by accident.
