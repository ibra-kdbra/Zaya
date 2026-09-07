/**
 * ZayaBook — the clean-room page-turn engine.
 *
 * `ZayaBook.create(container, source, options)` hands back a book straight away and loads the
 * document behind it; `book.ready` resolves once the first spread is on screen. Everything the
 * reader application needs is on that object, and the engine announces what it does on
 * `document` so parts of the application that never held a reference can follow along:
 *
 *   zaya:pdfLoaded  { pageCount }              the document opened
 *   zaya:bookReady  { }                        the first spread is painted
 *   zaya:pageChanged{ page, pdfPages }         the reader is looking at something else
 *   zaya:zoomChanged{ zoomed, level }          the reader magnified a page, or came back to fit
 *
 * The engine owns four things and no more: which pages are on screen, how they are drawn, how a
 * turn is animated, and how close the reader is standing to the paper. Search, thumbnails,
 * outline, print and the rest live in the application; what they cannot work out for themselves —
 * a picture of a page, the document's outline, the text over a bitmap — the engine supplies as
 * data, and the application decides what it looks like.
 */

import { loadDocument, renderPage, PageCache } from "./document.js";
import { Layout, pageModeFor, normaliseDirection, HARD_MODES } from "./layout.js";
import { CssRenderer } from "./renderer-css.js";
import { PageSound } from "./sound.js";
import { Gestures } from "./gestures.js";
import { TextLayers } from "./text-layer.js";
import { ThumbnailCache, thumbnail, outline, pageLabel } from "./data.js";

const DEFAULTS = {
  direction: "ltr",
  openPage: 1,
  hard: "none",
  duration: 700,
  paddingTop: 0,
  paddingBottom: 0,
  backgroundColor: "#20232a",
  soundEnable: false,
  soundUrl: "",
  singlePageMode: null,
  pageMode: null,
  doubleInternal: false,
  renderMode: "auto",
  textLayer: true,
  readback: false,
  paintPage: null,
  onReady: null,
  onPageChange: null,
  zoomChange: null,
  onFullscreenChange: null,
  text: {},
};

/** Zoom runs from fit to four times it, in steps a reader can follow. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
/** A double tap goes straight to this, which is the useful magnification for reading a scan. */
const DOUBLE_TAP_ZOOM = 2;
/** How long to wait after the last zoom before re-rendering the pages at the new scale. */
const RESHARPEN_MS = 180;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    return false;
  }
}

function emit(name, detail) {
  if (typeof document === "undefined" || !document.dispatchEvent) return;
  document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

/** Run `fn` when the browser is not busy, or soon, for a browser without idle callbacks. */
function whenIdle(fn) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(fn, { timeout: 1200 });
  }
  return setTimeout(fn, 120);
}

function cancelIdle(handle) {
  if (handle == null) return;
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
  else clearTimeout(handle);
}

export class ZayaBook {
  /**
   * @param {HTMLElement} container
   * @param {string|Blob|ArrayBuffer|object} source
   * @param {object} [options] see DEFAULTS
   */
  constructor(container, source, options = {}) {
    if (!container) throw new Error("engine-next: no container");
    this.options = { ...DEFAULTS, ...options };
    this.options.direction = normaliseDirection(this.options.direction);
    if (!HARD_MODES.includes(this.options.hard)) this.options.hard = "none";

    this.container = container;
    this.source = source;
    this.direction = this.options.direction;
    this.renderMode = "css";
    this.pageCount = 0;
    this.activePage = 1;
    this.pageMode = "double";
    this.pdfDocument = null;
    this.busy = false;
    this.disposed = false;
    this.error = null;
    /** Frames and milliseconds the last turn took; the demo and the tests read it. */
    this.lastTurn = null;

    this.cache = new PageCache();
    this.thumbnails = new ThumbnailCache();
    this.sound = new PageSound({ enabled: this.options.soundEnable, url: this.options.soundUrl });
    this.highlightQuery = "";
    this.layout = null;
    this.renderer = null;
    this.gestures = null;
    this.text = null;
    this.pageAspect = 0.72;
    this.scale = 1;
    this.turnToken = 0;
    this.interactive = true;
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.dragTurn = null;
    this.idleHandle = null;
    this.resharpenTimer = null;
    this.pageLabels = null;
    this.outlineData = null;

    this.container.classList.add("zn-book");
    this.container.style.backgroundColor = this.options.backgroundColor;
    this.stage = document.createElement("div");
    this.stage.className = "zn-stage";
    this.container.appendChild(this.stage);

    this.onResize = this.onResize.bind(this);
    this.onFullscreenChange = this.onFullscreenChange.bind(this);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    this.ready = this.boot();
    this.ready.catch(() => { /* reported through book.error */ });
  }

  /** @returns {ZayaBook} */
  static create(container, source, options) {
    return new ZayaBook(container, source, options);
  }

  /* ---- boot ------------------------------------------------------------------------------ */

  async boot() {
    try {
      this.pdfDocument = await loadDocument(this.source);
      if (this.disposed) return this;

      this.layout = new Layout({
        pdfPageCount: this.pdfDocument.numPages,
        doubleInternal: !!this.options.doubleInternal,
        direction: this.direction,
        hard: this.options.hard,
      });
      this.pageCount = this.layout.pageCount;
      emit("zaya:pdfLoaded", { pageCount: this.pageCount });

      await this.measurePage();
      if (this.disposed) return this;

      this.renderer = await this.makeRenderer();
      this.renderMode = this.renderer.mode;
      this.renderer.setPageAspect(this.pageAspect);

      this.pageMode = pageModeFor(this.options, this.stage.clientWidth, this.stage.clientHeight);
      this.layout.pageMode = this.pageMode;
      this.activePage = this.layout.clamp(this.options.openPage || 1);

      this.text = new TextLayers(
        this.stage,
        (bookPage) => ({
          pdfPage: this.pdfPageForBookPage(bookPage),
          half: this.layout.halfForBookPage(bookPage),
        }),
        (pdfPage) => this.pdfDocument.getPage(pdfPage),
      );
      this.text.setEnabled(this.options.textLayer !== false);

      this.wireGestures();
      this.observe();
      this.renderer.resize();
      await this.paintSpread();
      if (this.disposed) return this;

      emit("zaya:bookReady", { pageCount: this.pageCount });
      emit("zaya:pageChanged", { page: this.activePage, pdfPages: this.visiblePdfPages() });
      if (typeof this.options.onReady === "function") this.options.onReady(this);
      return this;
    } catch (err) {
      this.error = err;
      this.container.classList.add("zn-failed");
      throw err;
    }
  }

  /** Pick a renderer: WebGL unless it is unavailable or the caller asked for the other one. */
  async makeRenderer() {
    const wanted = this.options.renderMode;
    if (wanted !== "css") {
      try {
        const webgl = await import("./renderer-webgl.js");
        if (wanted === "webgl" || webgl.isSupported()) return new webgl.WebglRenderer(this, this.stage);
      } catch (err) {
        console.warn("engine-next: falling back to the 2D renderer", err);
      }
    }
    return new CssRenderer(this, this.stage);
  }

  /**
   * The shape of one book page. For a scan whose pages already hold two book pages, that is
   * half of a PDF page, so the first interior page is the one to measure.
   */
  async measurePage() {
    const probe = this.layout.doubleInternal && this.pdfDocument.numPages > 1 ? 2 : 1;
    const page = await this.pdfDocument.getPage(probe);
    const viewport = page.getViewport({ scale: 1 });
    const width = this.layout.doubleInternal && probe === 2 ? viewport.width / 2 : viewport.width;
    this.baseWidth = width;
    this.baseHeight = viewport.height;
    this.pageAspect = viewport.height ? width / viewport.height : 0.72;
  }

  observe() {
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener("resize", this.onResize);
    }
  }

  /* ---- pages ----------------------------------------------------------------------------- */

  pdfPageForBookPage(bookPage) {
    return this.layout ? this.layout.pdfPageForBookPage(bookPage) : bookPage;
  }

  bookPageForPdfPage(pdfPage) {
    return this.layout ? this.layout.bookPageForPdfPage(pdfPage) : pdfPage;
  }

  /** PDF pages behind the spread on screen, in screen order, each listed once. */
  visiblePdfPages() {
    if (!this.layout) return [];
    const out = [];
    this.layout.visiblePages(this.activePage).forEach((bookPage) => {
      const pdf = this.pdfPageForBookPage(bookPage);
      if (out.indexOf(pdf) === -1) out.push(pdf);
    });
    return out;
  }

  /**
   * How many device pixels a page is worth right now, as a pdf.js scale.
   * The device pixel ratio is capped at two: a phone claiming three or four would triple the
   * cost of every page for a sharpness nobody can see at arm's length.
   */
  scaleFor() {
    const across = this.pageMode === "single" ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const byWidth = (Math.max(1, this.stage.clientWidth) / across) * dpr / Math.max(1, this.baseWidth);
    const byHeight = Math.max(1, this.stage.clientHeight) * dpr / Math.max(1, this.baseHeight);
    const scale = Math.min(byWidth, byHeight) * Math.max(1, this.zoomLevel);
    // Rounded, so a few pixels of resize do not throw the whole cache away.
    return Math.max(0.3, Math.min(4, Math.round(scale * 20) / 20));
  }

  /** The cache key a book page has at the scale in force. */
  cacheKey(bookPage) {
    return PageCache.key(this.pdfPageForBookPage(bookPage), this.scale,
      this.layout.halfForBookPage(bookPage), this.cache.generation);
  }

  /**
   * The canvas for one book page, from the cache when it is there.
   * @returns {Promise<HTMLCanvasElement|null>} null for a blank (before the cover, past the end)
   */
  async textureFor(bookPage) {
    if (!this.pdfDocument || bookPage < 1 || bookPage > this.pageCount) return null;
    const pdfNumber = this.pdfPageForBookPage(bookPage);
    const half = this.layout.halfForBookPage(bookPage);
    const scale = this.scale;
    const key = PageCache.key(pdfNumber, scale, half, this.cache.generation);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const page = await this.pdfDocument.getPage(pdfNumber);
    const canvas = await renderPage(page, scale, {
      half,
      background: "#ffffff",
      paint: this.options.paintPage ? (ctx, viewport, number) => this.drawSearchHighlights(ctx, viewport, number) : null,
    });
    if (this.disposed) return canvas;
    return this.cache.set(key, canvas);
  }

  /** The hook the application fills in; also called directly by the print feature. */
  drawSearchHighlights(ctx, viewport, pdfPageNumber) {
    if (typeof this.options.paintPage !== "function") return;
    this.options.paintPage(ctx, viewport, pdfPageNumber);
  }

  /** Draw the spread the active page belongs to, with no animation. */
  async paintSpread() {
    if (!this.renderer || this.disposed) return;
    this.scale = this.scaleFor();
    const [left, right] = this.layout.screenPair(this.activePage);
    // The pages on screen may not be evicted by a pre-render running behind them.
    this.cache.pin([left, right].filter((p) => p >= 1).map((p) => this.cacheKey(p)));
    const [leftCanvas, rightCanvas] = await Promise.all([this.textureFor(left), this.textureFor(right)]);
    if (this.disposed) return;
    this.renderer.showSpread(leftCanvas, rightCanvas, this.pageMode === "single");
    await this.refreshTextLayer();
    this.prerenderNeighbours();
  }

  /**
   * Render the spreads on either side of this one while the browser has nothing better to do,
   * so turning to one of them does not wait for pdf.js.
   */
  prerenderNeighbours() {
    cancelIdle(this.idleHandle);
    if (this.disposed || !this.layout) return;
    this.idleHandle = whenIdle(() => {
      this.idleHandle = null;
      if (this.disposed || this.busy) return;
      const wanted = [];
      [this.layout.nextPage(this.activePage), this.layout.prevPage(this.activePage)]
        .filter((p) => p)
        .forEach((page) => {
          this.layout.screenPair(page).forEach((p) => { if (p >= 1 && wanted.indexOf(p) === -1) wanted.push(p); });
        });
      wanted.reduce(
        (chain, page) => chain.then(() => (this.disposed || this.busy ? null : this.textureFor(page))),
        Promise.resolve(),
      ).catch(() => { /* a pre-render that fails costs nothing */ });
    });
  }

  /* ---- navigation ------------------------------------------------------------------------ */

  /**
   * Turn to a book page. Adjacent spreads animate; a jump lands without one.
   *
   * A book that is magnified comes back to fit first: the pan the reader had chosen belongs to
   * the spread they were reading, and carrying it onto the next one lands them somewhere they
   * did not ask to be.
   *
   * @returns {Promise<void>}
   */
  async gotoPage(target, opts = {}) {
    if (!this.layout || this.disposed) return;
    const to = this.layout.clamp(target);
    const from = this.activePage;
    const sameSpread = this.layout.spreadFor(from).join() === this.layout.spreadFor(to).join();
    if (sameSpread) {
      if (to !== from) {
        this.activePage = to;
        this.announce();
      }
      return;
    }
    if (this.zoomed) this.resetZoom();

    const token = ++this.turnToken;
    if (this.busy) return;                       // one turn at a time; the last request wins
    this.busy = true;
    try {
      const step = this.pageMode === "single" ? 1 : 2;
      const adjacent =
        Math.abs(this.layout.spreadFor(to)[0] - this.layout.spreadFor(from)[0]) === step;
      const animate = opts.animate !== false && adjacent && !prefersReducedMotion();
      if (animate) await this.animateTo(from, to, token);
      this.activePage = to;
      await this.paintSpread();
      if (this.turnToken !== token || this.disposed) return;
      this.announce();
    } finally {
      this.busy = false;
    }
  }

  /**
   * The sheet that moves between two spreads, the pages on either side of it, and where each of
   * them sits on screen. The renderers take it from there.
   *
   * @returns {Promise<object|null>} the spec, or null when the turn cannot be built
   */
  async prepareTurn(from, to, token) {
    const backwards = to < from;
    const sheet = this.layout.sheetBetween(from, to);
    const single = this.pageMode === "single";
    let frontPage, backPage, staticLeft, staticRight;

    if (single) {
      frontPage = from;
      backPage = to;
      staticLeft = to;
      staticRight = 0;
    } else {
      frontPage = sheet * 2 - 1;                 // the recto of the sheet in flight
      backPage = sheet * 2;                      // its verso
      const lower = this.layout.spreadFor(Math.min(from, to));
      const upper = this.layout.spreadFor(Math.max(from, to));
      staticLeft = lower[0];                     // the page that stays put on the near side
      staticRight = upper[1];
    }

    const rtl = this.direction === "rtl";
    const side = rtl ? -1 : 1;
    const [screenLeft, screenRight] = rtl ? [staticRight, staticLeft] : [staticLeft, staticRight];

    this.scale = this.scaleFor();
    const [leftCanvas, rightCanvas, frontCanvas, backCanvas] = await Promise.all([
      this.textureFor(screenLeft), this.textureFor(screenRight),
      this.textureFor(frontPage), this.textureFor(backPage),
    ]);
    if (this.disposed || this.turnToken !== token) return null;

    this.renderer.showSpread(leftCanvas, rightCanvas, single);
    return {
      front: frontCanvas,
      back: backCanvas,
      side,
      hard: this.layout.isHardSheet(sheet),
      backwards,
      duration: Math.max(0, this.options.duration || 0),
    };
  }

  /** Build the turn and let the renderer run it to the end. */
  async animateTo(from, to, token) {
    const spec = await this.prepareTurn(from, to, token);
    if (!spec) return;
    if (this.text) this.text.setVisible(false);
    this.sound.play();
    this.lastTurn = await this.renderer.animateTurn(spec);
  }

  next() {
    if (!this.layout) return Promise.resolve();
    const target = this.layout.nextPage(this.activePage);
    return target ? this.gotoPage(target) : Promise.resolve();
  }

  prev() {
    if (!this.layout) return Promise.resolve();
    const target = this.layout.prevPage(this.activePage);
    return target ? this.gotoPage(target) : Promise.resolve();
  }

  first() {
    return this.gotoPage(1, { animate: false });
  }

  last() {
    return this.gotoPage(this.pageCount, { animate: false });
  }

  announce() {
    const detail = { page: this.activePage, pdfPages: this.visiblePdfPages() };
    emit("zaya:pageChanged", detail);
    if (typeof this.options.onPageChange === "function") this.options.onPageChange(detail.page, detail.pdfPages);
  }

  /* ---- the drag preview ------------------------------------------------------------------- */

  /**
   * Begin a turn the reader will move by hand. The sheet is built now and held at rest, so the
   * first pixel of movement already has something to move.
   *
   * @param {boolean} forward
   * @returns {Promise<boolean>} whether a sheet is under the pointer
   */
  async beginDragTurn(forward) {
    if (this.busy || this.disposed || !this.layout || this.dragTurn) return false;
    const target = forward ? this.layout.nextPage(this.activePage) : this.layout.prevPage(this.activePage);
    if (!target) return false;
    if (this.zoomed) return false;
    this.busy = true;
    const token = ++this.turnToken;
    const from = this.activePage;
    const spec = await this.prepareTurn(from, target, token);
    if (!spec || this.disposed) { this.busy = false; return false; }
    // A backward turn starts with the sheet already lying over the near page, so the drag runs
    // its progress from one down to zero; the gestures report 0 → 1 either way.
    this.dragTurn = { spec, from, target, token, backwards: spec.backwards, progress: 0 };
    if (this.text) this.text.setVisible(false);
    this.renderer.beginTurn(spec, spec.backwards ? 1 : 0);
    return true;
  }

  /** Move the sheet a drag is holding: `progress` runs 0 (at rest) to 1 (turned). */
  moveDragTurn(progress) {
    const drag = this.dragTurn;
    if (!drag || this.disposed) return;
    drag.progress = Math.max(0, Math.min(1, progress));
    this.renderer.updateTurn(drag.backwards ? 1 - drag.progress : drag.progress);
  }

  /**
   * Let go. The sheet settles forward when it is past halfway or was flicked hard enough, and
   * falls back where it came from otherwise.
   *
   * @param {number} progress 0 … 1
   * @param {number} velocity progress per second at the moment of release
   */
  async endDragTurn(progress, velocity) {
    const drag = this.dragTurn;
    if (!drag) return;
    this.dragTurn = null;
    if (this.disposed) { this.busy = false; return; }
    // Past halfway the sheet goes over; short of that it takes a flick, and a flick has to have
    // moved the sheet somewhere before its speed counts for anything.
    const complete = progress > 0.5 || (progress > 0.25 && velocity > 1.2);
    const held = drag.backwards ? 1 - Math.max(0, Math.min(1, progress)) : Math.max(0, Math.min(1, progress));
    const end = drag.backwards ? (complete ? 0 : 1) : (complete ? 1 : 0);
    const distance = Math.abs(end - held);
    const duration = prefersReducedMotion() ? 0 : Math.max(0, this.options.duration || 0) * distance;
    if (complete) this.sound.play();
    try {
      this.lastTurn = await this.renderer.settleTurn(held, end, duration);
      if (this.disposed || this.turnToken !== drag.token) return;
      if (complete) this.activePage = drag.target;
      await this.paintSpread();
      if (complete) this.announce();
    } finally {
      this.busy = false;
      if (this.text) this.text.setVisible(true);
    }
  }

  /* ---- zoom ------------------------------------------------------------------------------- */

  /** Whether the reader is magnified past fit. */
  get zoomed() {
    return this.zoomLevel > 1.001;
  }

  /**
   * Magnify to an absolute level: 1 is fit-to-stage, 4 the closest the engine will go.
   * @param {number} level
   * @param {{about?: {x: number, y: number}}} [opts] the stage point to keep still
   * @returns {number} the level in force
   */
  zoom(level, opts = {}) {
    if (!this.renderer || this.disposed) return this.zoomLevel;
    const wanted = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(level) || MIN_ZOOM));
    const before = this.zoomed;
    const previous = this.zoomLevel;
    if (Math.abs(wanted - previous) < 1e-4) return this.zoomLevel;

    const origin = this.zoomOrigin();
    const about = opts.about || origin;
    // Keep the point under the pointer where it is: the pan absorbs the change in magnification.
    const factor = wanted / previous;
    this.panX += (1 - factor) * (about.x - origin.x - this.panX);
    this.panY += (1 - factor) * (about.y - origin.y - this.panY);
    this.zoomLevel = wanted;
    if (wanted === MIN_ZOOM) { this.panX = 0; this.panY = 0; }
    this.clampPan();
    this.renderer.setZoom(this.zoomLevel, this.panX, this.panY);
    this.refreshTextLayer();
    this.scheduleResharpen();
    if (this.zoomed !== before) this.announceZoom();
    return this.zoomLevel;
  }

  zoomIn() { return this.zoom(this.zoomLevel * ZOOM_STEP); }

  zoomOut() { return this.zoom(this.zoomLevel / ZOOM_STEP); }

  resetZoom() {
    if (!this.renderer) return MIN_ZOOM;
    const before = this.zoomed;
    this.zoomLevel = MIN_ZOOM;
    this.panX = 0;
    this.panY = 0;
    this.renderer.setZoom(MIN_ZOOM, 0, 0);
    this.refreshTextLayer();
    this.scheduleResharpen();
    if (before) this.announceZoom();
    return MIN_ZOOM;
  }

  /** Shift a magnified page by a distance in CSS pixels. */
  pan(dx, dy) {
    if (!this.zoomed || !this.renderer || this.disposed) return;
    this.panX += dx || 0;
    this.panY += dy || 0;
    this.clampPan();
    this.renderer.setZoom(this.zoomLevel, this.panX, this.panY);
    this.refreshTextLayer();
  }

  /** The stage point a zoom happens about when nothing else is said. */
  zoomOrigin() {
    if (this.renderer && typeof this.renderer.zoomOrigin === "function") return this.renderer.zoomOrigin();
    return { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 };
  }

  /** Keep the magnified spread over the stage rather than letting it wander off the edge. */
  clampPan() {
    const fit = this.renderer && typeof this.renderer.fitSize === "function" ? this.renderer.fitSize() : null;
    if (!fit) return;
    const maxX = Math.max(0, (fit.width * this.zoomLevel - this.stage.clientWidth) / 2);
    const maxY = Math.max(0, (fit.height * this.zoomLevel - this.stage.clientHeight) / 2);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  announceZoom() {
    const detail = { zoomed: this.zoomed, level: this.zoomLevel };
    emit("zaya:zoomChanged", detail);
    if (typeof this.options.zoomChange === "function") this.options.zoomChange(detail.zoomed, detail.level);
  }

  /**
   * Re-render the pages at the magnified scale, once the reader has stopped moving. Doing it on
   * every wheel notch would rasterise the same page a dozen times on the way to one answer.
   */
  scheduleResharpen() {
    clearTimeout(this.resharpenTimer);
    if (this.disposed) return;
    this.resharpenTimer = setTimeout(() => {
      this.resharpenTimer = null;
      if (this.disposed || this.busy) return;
      if (this.scaleFor() === this.scale) return;
      this.paintSpread();
    }, RESHARPEN_MS);
  }

  /* ---- the text layer --------------------------------------------------------------------- */

  /**
   * Whether the pages carry a selectable text layer. On by default, and only ever shown while
   * the book is at rest: a sheet in flight has nothing stable underneath it to select.
   * @param {boolean} on
   */
  setTextLayerEnabled(on) {
    this.options.textLayer = !!on;
    if (!this.text) return Promise.resolve();
    this.text.setEnabled(!!on);
    return this.refreshTextLayer();
  }

  get textLayerEnabled() {
    return !!(this.text && this.text.enabled);
  }

  /** Put the text layers back over the pages, wherever those have ended up. */
  refreshTextLayer() {
    if (!this.text || !this.renderer || this.disposed) return Promise.resolve();
    if (!this.text.enabled) return Promise.resolve();
    if (typeof this.renderer.pageBoxes !== "function") return Promise.resolve();
    const pair = this.layout.screenPair(this.activePage);
    const boxes = this.renderer.pageBoxes()
      .map((box) => ({ ...box, bookPage: box.side === "left" ? pair[0] : pair[1] }))
      .filter((box) => box.bookPage >= 1 && box.width > 0 && box.height > 0);
    this.text.setVisible(true);
    return this.text.update(boxes);
  }

  /* ---- data for the application's panels --------------------------------------------------- */

  /**
   * A picture of one PDF page, at most `width` CSS pixels across, from a small cache of its own.
   * @param {number} pdfPage 1-based
   * @param {number} [width]
   * @returns {Promise<HTMLCanvasElement>}
   */
  getThumbnail(pdfPage, width = 160) {
    if (!this.pdfDocument) return Promise.reject(new Error("engine-next: no document"));
    return thumbnail(this.pdfDocument, this.thumbnails, pdfPage, width);
  }

  /**
   * The document's outline, with named and explicit destinations already resolved to PDF page
   * numbers. Built once and remembered.
   * @returns {Promise<Array<{title: string, pdfPage: number, children: Array}>>}
   */
  getOutline() {
    if (!this.pdfDocument) return Promise.resolve([]);
    if (!this.outlineData) {
      this.outlineData = outline(this.pdfDocument).catch(() => []);
    }
    return this.outlineData;
  }

  /**
   * What a PDF page calls itself — "iv", "A-3", or just its number.
   * @param {number} pdfPage 1-based
   * @returns {Promise<string>}
   */
  async getPageLabel(pdfPage) {
    const count = this.pdfDocument ? this.pdfDocument.numPages : 0;
    if (this.pageLabels === null && this.pdfDocument) {
      try {
        this.pageLabels = await this.pdfDocument.getPageLabels();
      } catch (err) {
        this.pageLabels = [];
      }
    }
    return pageLabel(this.pageLabels, pdfPage, count);
  }

  /* ---- chrome ------------------------------------------------------------------------------ */

  /** Whether the container is the fullscreen element. */
  get fullscreen() {
    return typeof document !== "undefined" && document.fullscreenElement === this.container;
  }

  /**
   * Enter fullscreen on the container, or leave it.
   * @returns {Promise<boolean>} whether the book is fullscreen when the call settles
   */
  toggleFullscreen() {
    if (typeof document === "undefined") return Promise.resolve(false);
    const done = this.fullscreen
      ? (document.exitFullscreen ? document.exitFullscreen() : Promise.resolve())
      : (this.container.requestFullscreen ? this.container.requestFullscreen() : Promise.reject(new Error("engine-next: fullscreen unavailable")));
    return Promise.resolve(done).then(() => this.fullscreen).catch(() => this.fullscreen);
  }

  onFullscreenChange() {
    if (this.disposed) return;
    this.container.classList.toggle("zn-fullscreen", this.fullscreen);
    this.resize();
    if (typeof this.options.onFullscreenChange === "function") this.options.onFullscreenChange(this.fullscreen);
    emit("zaya:fullscreenChanged", { fullscreen: this.fullscreen });
  }

  /**
   * Resolve the open document to something the application can save. The engine does not put a
   * file in front of the reader itself: saving is the application's decision, and its chrome.
   *
   * @returns {Promise<{url: string, name: string, revoke: () => void}>}
   */
  async download() {
    const source = this.source;
    const name = (() => {
      const raw = typeof source === "string" ? source.split(/[?#]/)[0].split("/").pop() : "";
      return raw && /\.pdf$/i.test(raw) ? decodeURIComponent(raw) : "document.pdf";
    })();
    if (typeof source === "string") return { url: source, name, revoke: () => {} };
    let blob = null;
    if (typeof Blob !== "undefined" && source instanceof Blob) blob = source;
    // Bytes handed to pdf.js are transferred to its worker, so the buffer the caller passed is
    // detached by now; the document itself is the only place the file still exists.
    else if (this.pdfDocument) blob = new Blob([await this.pdfDocument.getData()], { type: "application/pdf" });
    if (!blob) throw new Error("engine-next: nothing to download");
    const url = URL.createObjectURL(blob);
    return { url, name, revoke: () => URL.revokeObjectURL(url) };
  }

  /**
   * The address of the page now open, for a reader who wants to send it to somebody. The engine
   * builds the link; putting it in front of anyone is the application's business.
   * @returns {string}
   */
  share() {
    const here = typeof location !== "undefined" ? location.href : "";
    let url;
    try {
      url = new URL(here);
    } catch (err) {
      return here;
    }
    url.searchParams.set("page", String(this.activePage));
    return url.toString();
  }

  /**
   * Let the stage go, or take it back. The application switches this off while the pointer is
   * over a drawer of its own, so a drag there does not turn a page underneath it.
   * @param {boolean} on
   */
  setInteractive(on) {
    this.interactive = !!on;
    this.stage.classList.toggle("zn-inert", !this.interactive);
  }

  get soundEnabled() {
    return !!this.options.soundEnable;
  }

  setSoundEnabled(on) {
    this.options.soundEnable = !!on;
    if (this.sound) this.sound.setEnabled(!!on);
  }

  /* ---- modes and size -------------------------------------------------------------------- */

  /**
   * One page or two.
   * @param {boolean} isSingle
   * @param {boolean} [fromUser] true when a reader asked, which pins the choice against the
   *                             automatic switch that follows the viewport
   */
  setPageMode(isSingle, fromUser) {
    const mode = isSingle ? "single" : "double";
    if (fromUser) this.options.pageMode = mode;
    if (mode === this.pageMode) return Promise.resolve();
    this.pageMode = mode;
    if (this.layout) this.layout.pageMode = mode;
    if (!this.renderer) return Promise.resolve();
    this.resetZoom();
    this.renderer.resize();
    return this.paintSpread().then(() => { this.announce(); });
  }

  /** Direction can change with the interface language. */
  setDirection(direction) {
    const next = normaliseDirection(direction);
    if (next === this.direction) return Promise.resolve();
    this.direction = next;
    this.options.direction = next;
    if (this.layout) this.layout.direction = next;
    return this.paintSpread();
  }

  onResize() {
    if (this.disposed || !this.renderer) return;
    const mode = pageModeFor(this.options, this.stage.clientWidth, this.stage.clientHeight);
    const changed = mode !== this.pageMode;
    this.pageMode = mode;
    if (this.layout) this.layout.pageMode = mode;
    this.renderer.resize();
    this.clampPan();
    this.renderer.setZoom(this.zoomLevel, this.panX, this.panY);
    const wanted = this.scaleFor();
    if (changed || wanted !== this.scale) {
      this.paintSpread().then(() => { if (changed) this.announce(); });
    } else {
      this.refreshTextLayer();
    }
  }

  /** Re-fit the camera or the layout, and redraw at the right scale for this screen. */
  resize() {
    this.onResize();
  }

  /* ---- input ------------------------------------------------------------------------------- */

  wireGestures() {
    this.gestures = new Gestures(this.stage, {
      isZoomed: () => this.zoomed,
      isInteractive: () => this.interactive && !this.disposed,
      isBusy: () => this.busy,
      direction: () => this.direction,
      onTap: (forward) => { if (forward) this.next(); else this.prev(); },
      onDragStart: (forward) => this.beginDragTurn(forward),
      onDragMove: (progress) => this.moveDragTurn(progress),
      onDragEnd: (progress, velocity) => this.endDragTurn(progress, velocity),
      onPan: (dx, dy) => this.pan(dx, dy),
      onZoomAt: (factor, x, y) => this.zoom(this.zoomLevel * factor, { about: { x, y } }),
      onDoubleTap: (x, y) => {
        if (this.zoomed) this.resetZoom();
        else this.zoom(DOUBLE_TAP_ZOOM, { about: { x, y } });
      },
    });
  }

  /* ---- search hooks ---------------------------------------------------------------------- */

  /** Paint (or with an empty string stop painting) a query on the pages. */
  setSearchHighlight(query) {
    const next = String(query || "");
    if (next === this.highlightQuery) return Promise.resolve();
    this.highlightQuery = next;
    return this.refreshVisiblePages();
  }

  /** Throw the rendered pages away and draw the spread again. */
  refreshVisiblePages() {
    this.cache.invalidate();
    return this.paintSpread();
  }

  /* ---- teardown -------------------------------------------------------------------------- */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelIdle(this.idleHandle);
    clearTimeout(this.resharpenTimer);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    else window.removeEventListener("resize", this.onResize);
    if (this.gestures) this.gestures.dispose();
    this.gestures = null;
    if (this.text) this.text.dispose();
    this.text = null;
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    this.sound.dispose();
    this.cache.clear();
    this.thumbnails.clear();
    if (this.pdfDocument) {
      try { this.pdfDocument.destroy(); } catch (err) { /* already gone */ }
      this.pdfDocument = null;
    }
    if (this.stage.parentNode) this.stage.parentNode.removeChild(this.stage);
    this.container.classList.remove("zn-book", "zn-failed", "zn-fullscreen");
    this.container.style.backgroundColor = "";
  }
}

export default ZayaBook;
