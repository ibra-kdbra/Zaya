# engine-next

The replacement for `engine/`. It is written from scratch against the interface the reader
already uses — nothing was copied, adapted or read from the DearFlip-derived code it replaces —
so it carries the repository's own MIT licence and the commercial restriction goes away with the
old directory.

It is not wired into the reader. `engine-next/demo.html` is the only thing that loads it today:
open it with `?pdf=…&render=webgl|css&dir=ltr|rtl&mode=single|double&hard=none|cover|all&duration=…`.
Its default document is `tests/fixtures/sample.pdf`, which `.vercelignore` keeps out of a deploy, so
on the deployed site the demo needs a `?pdf=` of its own.

## Design

Six modules, each with one job, no jQuery and no globals:

| Module | What it owns |
| --- | --- |
| `index.js` | `ZayaBook`: the public object, the events, and the decisions between the parts below. |
| `document.js` | Everything pdf.js touches: opening a document, rasterising a page, the page cache. |
| `layout.js` | Which pages are on screen and where they live in the file. No DOM, no pdf.js — plain arithmetic, which is why it is the easy part to test and the easy part to get wrong. |
| `renderer-webgl.js` | three.js. Two flat meshes for the spread, two more for the sheet in flight. |
| `renderer-css.js` | The same picture in DOM, for machines without WebGL. Same methods, so the engine never asks which it has. |
| `sound.js` | The optional page-turn sound. |

Three ideas are worth stating plainly, because everything else follows from them.

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
  paintPage: (ctx, viewport, pdfPage) => {},   // called after a page is rendered
  onReady: (book) => {},
  onPageChange: (page, pdfPages) => {},
});
await book.ready;
```

`engine.css` must be on the page. The document is loaded behind the call: the book comes back
straight away and `book.ready` resolves once the first spread is painted.

The events go to `document`, so a part of the application holding no reference can still follow:
`zaya:pdfLoaded` (`{pageCount}`), `zaya:bookReady`, `zaya:pageChanged` (`{page, pdfPages}`).

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
* Turning: `next`, `prev`, `gotoPage`, with an animated turn between neighbouring spreads and a
  straight cut for a jump. `prefers-reduced-motion` snaps.
* Drag or click on either half of the stage to turn.
* Hard covers, the page-turn sound, the padding and background options.
* Both renderers, with the 2D one taking over automatically when WebGL is missing.
* The `paintPage` hook, the search-highlight refresh, and the two page-number mappings.
* An LRU page cache bounded by pixels rather than by count.

## What remains

In rough order of how much the reader would miss it:

* **Zoom.** There is no magnification at all: no pinch, no double-tap, no zoom control. The
  camera fits the spread and stays there.
* **The text layer.** Nothing is selectable. The old engine positions a DOM text layer over the
  page; this one has no equivalent yet, so the Text pane's selection features have nothing to
  attach to.
* **Thumbnails and outline.** The panels ask the old engine for page images and the document
  outline. Neither is exposed here yet; both are small (`renderPage` at a low scale, and
  `pdfDocument.getOutline`) but neither is written.
* **Share and lightbox parity.** The reader's share links, the lightbox and the fullscreen
  chrome all reach into the old engine's DOM. They will need an interface rather than a
  reach-in.
* **A live drag preview.** A drag decides the turn on release; the sheet does not follow the
  finger while it moves, because the neighbouring textures are not built until the turn starts.
* **Double-internal scans** are implemented in the layout and the renderer but have no fixture,
  so they are untested.
* **Page flip sound assets** are not shipped; `soundUrl` has to be pointed at one.

### Performance notes

* Textures are rendered at the container's size times the device pixel ratio, capped at two, and
  the scale is rounded to a twentieth so a few pixels of resize do not throw the cache away.
* The cache holds about 48 million pixels — roughly a dozen full-screen pages — and evicts the
  least recently used. A canvas still on screen can in principle be evicted; the budget makes it
  unlikely rather than impossible, and the fix, if it ever bites, is to pin the visible keys.
* `preserveDrawingBuffer` is on so a test or a screenshot can read the WebGL canvas back. It
  costs a little on some drivers and could be made conditional before switch-over.
* Neighbouring spreads are not pre-rendered. Turning to a page that is not in the cache waits for
  pdf.js. Pre-rendering the next spread during idle time is the obvious next step.

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
