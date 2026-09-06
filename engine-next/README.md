# engine-next

The replacement for `engine/`. It is written from scratch against the interface the reader
already uses — nothing was copied, adapted or read from the DearFlip-derived code it replaces —
so it carries the repository's own MIT licence and the commercial restriction goes away with the
old directory.

It is not wired into the reader. `engine-next/demo.html` is the only thing that loads it today:
open it with `?pdf=…&render=webgl|css&dir=ltr|rtl&mode=single|double&hard=none|cover|all&duration=…`,
and `&internal=1` for a scan of an open book, `&text=0` to drop the text layer.
Its default document is `tests/fixtures/sample.pdf`, which `.vercelignore` keeps out of a deploy, so
on the deployed site the demo needs a `?pdf=` of its own.

## Design

Nine modules, each with one job, no jQuery and no globals:

| Module | What it owns |
| --- | --- |
| `index.js` | `ZayaBook`: the public object, the events, and the decisions between the parts below. |
| `document.js` | Everything pdf.js touches: opening a document, rasterising a page, the page cache. |
| `layout.js` | Which pages are on screen and where they live in the file. No DOM, no pdf.js — plain arithmetic, which is why it is the easy part to test and the easy part to get wrong. |
| `renderer-webgl.js` | three.js. Two flat meshes for the spread, two more for the sheet in flight. |
| `renderer-css.js` | The same picture in DOM, for machines without WebGL. Same methods, so the engine never asks which it has. |
| `gestures.js` | Pointer, wheel and touch: turns raw events into intentions — turn, tap, pan, zoom — and knows nothing about pages. Both renderers share it, so a gesture is defined once. |
| `text-layer.js` | The transparent, selectable text over the pages. |
| `data.js` | What the application's panels need and cannot work out for themselves: thumbnails, the outline with its destinations resolved, page labels. No DOM. |
| `sound.js` | The optional page-turn sound. |

Four ideas are worth stating plainly, because everything else follows from them.

**Book pages and PDF pages are different numbers.** A book page is a leaf as the reader counts
it; a PDF page is a page of the file. They coincide for an ordinary document and do not for a
scan of an open book, where every page after the cover carries two book pages side by side
(`doubleInternal`). `layout.js` holds both mappings and the engine uses nothing else;
`pdfPageForBookPage` and `bookPageForPdfPage` are on the book for the application's benefit.

**A turn moves one sheet.** Sheet *s* has book page 2s-1 on its front and 2s on its back, so the
spread `[2k, 2k+1]` is the back of one sheet and the front of the next. A turn draws the two
pages that stay put, then animates the sheet between them. That is the whole animation model,
and it is why hard covers, right-to-left order and single-page mode are three lines each rather
than three code paths.

**Paper is a deformation, not a rotation.** The WebGL sheet is a plane of 28 segments whose
vertices are rewritten every frame: each is placed by its distance from the spine and a bulge out
of the sheet's plane that peaks halfway through the turn and halfway along the sheet, and
vanishes at both ends. A small `onBeforeCompile` chunk darkens the inside of that bulge. A stiff
sheet — a hard cover — is the same code with the bulge set to zero.

**Zoom is the lens, not the paper.** Neither renderer scales its geometry: the 2D one puts a
`transform` on the spread and the WebGL one brings the camera in and slides it sideways. Both
therefore answer the same question the same way — *where is this page on the stage, right now?* —
which is exactly what the text layer needs to sit over it, magnified or not.

The renderers paint on demand: after a change, and on every frame of a turn, and never otherwise.

## Using it

```js
import { ZayaBook } from "./engine-next/index.js";

const book = ZayaBook.create(container, "book.pdf", {
  direction: "ltr",          // or "rtl", or dFlip's 1 and 2
  openPage: 1,
  hard: "cover",             // "none" | "cover" | "all"
  duration: 700,             // milliseconds for a turn
  paddingTop: 0,
  paddingBottom: 0,
  backgroundColor: "#20232a",
  soundEnable: false,
  soundUrl: "",
  singlePageMode: null,      // null follows the viewport; pageMode overrides both
  pageMode: null,            // "single" | "double"
  renderMode: "auto",        // "auto" | "webgl" | "css"
  textLayer: true,           // a selectable text layer over the pages, at rest
  readback: false,           // keep the WebGL drawing buffer readable (tests, screenshots)
  paintPage: (ctx, viewport, pdfPage) => {},   // called after a page is rendered
  onReady: (book) => {},
  onPageChange: (page, pdfPages) => {},
  zoomChange: (isZoomed, level) => {},
  onFullscreenChange: (isFullscreen) => {},
});
await book.ready;
```

`engine.css` must be on the page. The document is loaded behind the call: the book comes back
straight away and `book.ready` resolves once the first spread is painted.

The events go to `document`, so a part of the application holding no reference can still follow:
`zaya:pdfLoaded` (`{pageCount}`), `zaya:bookReady`, `zaya:pageChanged` (`{page, pdfPages}`),
`zaya:zoomChanged` (`{zoomed, level}`), `zaya:fullscreenChanged` (`{fullscreen}`).

`options.paintPage` is how search marks land on a page: the engine calls it with the page's
canvas context and the pdf.js viewport it was rendered with, so `viewport.convertToPdfPoint`
maps a hit's rectangle in PDF user space onto the pixels. `book.drawSearchHighlights` calls the
same hook, for the print feature, which renders its own canvases.

The full list of properties and methods is in `docs/engine-api.md`.

## What is done

* Loading from a URL, a blob or bytes, with the CMaps and the standard fonts, under the site's
  Content-Security-Policy (the demo page carries a copy of it, so a regression shows up there).
* Single and double spreads, chosen by the viewport unless the reader has said otherwise.
* Left-to-right and right-to-left ordering.
* Turning: `next`, `prev`, `first`, `last`, `gotoPage`, with an animated turn between neighbouring
  spreads and a straight cut for a jump. `prefers-reduced-motion` snaps.
* **A live drag preview.** The sheet is built when the press begins and follows the pointer;
  on release it settles forward past halfway, or on a flick that has already lifted it a
  quarter of the way, and falls back where it came from otherwise. A plain click still turns
  the side it landed on.
* **Zoom**: `zoom(level)`, `zoomIn`, `zoomOut`, `resetZoom`, `pan`, the `zoomChange` callback,
  the control key with the wheel, two fingers, and a double click or double tap to toggle.
  Both renderers, and the pages are re-rendered at the magnified scale.
* **A selectable text layer** over the pages at rest, in both renderers, with right-to-left runs
  marked so they copy in logical order. `setTextLayerEnabled` turns it off.
* **Data for the application's panels**: `getThumbnail`, `getOutline` with its destinations
  resolved, `getPageLabel`. No panel DOM: that is the reader's own.
* **Chrome actions**: `toggleFullscreen` with the state exposed and followed, `download`
  resolving a URL or a blob for the application to save, `share` returning this address with
  `?page=`, `setInteractive`, `setSoundEnabled`, `resize`.
* `doubleInternal` scans, with a fixture (`tests/fixtures/sample-double-internal.pdf`) and
  tests for the mapping, the half-page textures and the text layer over each half.
* Hard covers, the page-turn sound, the padding and background options.
* Both renderers, with the 2D one taking over automatically when WebGL is missing.
* The `paintPage` hook, the search-highlight refresh, and the two page-number mappings.
* An LRU page cache bounded by pixels rather than by count, with the visible pages pinned, and
  the neighbouring spreads pre-rendered in idle time.

### Two decisions worth knowing about

**Turning a page comes back to fit.** A magnified spread is a place the reader chose *on that
spread*; carrying the magnification and the pan onto the next one lands them somewhere they did
not ask to be, usually a blank margin. So `gotoPage`, `next`, `prev` and `setPageMode` reset the
zoom before the turn. The alternative — keeping the level and re-centring — reads well only for
a document whose pages are laid out identically, which is exactly the assumption a reader of a
scanned book cannot make.

**A click on a run of text waits before it turns the page.** The text layer takes pointer input
so text can be selected, which puts a click on a paragraph in two minds: turn, or select. It
waits `300 ms`, the same way the browser resolves click against double-click, and turns only if
no second click and no selection arrived. A press that lands between two lines reaches the stage
directly and turns at once.

## What remains, for step E3

* **`bookPageForPdfPage` disagrees with the contract for a `doubleInternal` scan.** `layout.js`
  returns the *left* of the two book pages a scanned page carries (`p * 2 - 2`), because that is
  where a search hit should turn the book to; `docs/engine-api.md` §4 records the fork's
  `p * 2 - 1`, the right-hand one. Both round-trip through `toPdfPage`. E3 has to pick one and
  say so in the contract; nothing else depends on the choice.
* **Wiring it behind `lib/js/core/book.js`.** Every member the contract needs now exists, but
  under this engine's own names: `zoom(level)` rather than the contract's `zoom(delta)`,
  `download()` resolving a URL rather than saving a file, `share()` returning a link rather than
  opening a box. The facade is where those meet, and where the app's Navigator turns
  `getThumbnail` / `getOutline` into the Pages and Outline panes.
* **The search panel and its index** stay the application's (`lib/js/features/search/`); what the
  engine owes is `paintPage`, which is done. `ensureSearch`, `openSearch` and `searchInput` are
  facade concerns.
* **Keyboard navigation and focus.** The engine takes pointer input only. Arrow keys, `Home`,
  `End` and a focus ring on the stage are the application's chrome today and should stay there,
  but somebody has to check that the text layer does not swallow them.
* **Page flip sound assets** are not shipped; `soundUrl` has to be pointed at one.
* **A lightbox** has no equivalent and needs none: it is an application shell around a book.

### Performance notes

* Textures are rendered at the container's size times the device pixel ratio, capped at two, and
  the scale is rounded to a twentieth so a few pixels of resize do not throw the cache away. A
  magnified page multiplies that by the zoom level, and the whole thing is capped at four, which
  is the budget's real limit rather than an aesthetic one.
* Re-rendering at a new zoom level waits 180 ms after the reader stops moving. Doing it on every
  wheel notch would rasterise the same page a dozen times on the way to one answer; the browser
  stretches the old texture in the meantime, so the magnification is instant and the sharpness
  arrives a moment later.
* The cache holds about 48 million pixels — roughly a dozen full-screen pages — and evicts the
  least recently used **that is not on screen**: `paintSpread` pins the visible keys, so a
  pre-render running behind the reader cannot take the page out from under them.
* The spreads on either side of this one are rendered in idle time, so turning to one of them
  does not wait for pdf.js. The work is dropped the moment a turn starts.
* `preserveDrawingBuffer` is off unless `options.readback` is set. It costs a copy per frame on
  some drivers, and only a test or a screenshot tool needs it; the demo page sets it, which is
  how the tests sample the WebGL canvas.
* The text layer is built once per page at the page's natural size and then scaled, so a resize
  or a zoom moves one `transform` rather than rewriting every span.

## Content-Security-Policy

The policy in `index.html` already allows everything this engine needs, and nothing here asked
for a change. Checked on the demo page, which carries the same directives:

* `worker-src 'self' blob:` covers the pdf.js module worker. pdf.js 4 starts
  `vendor/pdfjs/pdf.worker.min.mjs` as a real `type: "module"` worker from our own origin —
  confirmed by watching the worker attach, so the silent fall back to a main-thread "fake worker"
  is not happening.
* `script-src 'self' 'wasm-unsafe-eval'` is enough with `isEvalSupported: false`, which
  `document.js` always passes. `'wasm-unsafe-eval'` stays needed for the OCR feature's
  WebAssembly, not for pdf.js.
* `img-src`, `connect-src` and `default-src` need nothing new: the CMaps and the standard fonts
  are fetched from `'self'`, and a document opened from disk arrives as bytes, not a `blob:` URL.

Two things the switch-over will have to do, neither of them a policy change:

* Add `?v=<version>` to the engine's own URLs and to `engine.css`, and register them in the
  loader, the same as every other served path.
* Decide what happens to the old `vendor/js/pdf.min.js`, its worker and its CMaps. Two copies of
  pdf.js can coexist — they are separate module scopes, and the OCR feature is happy with either —
  but shipping both is about 1.7 MB of CMaps twice over.
