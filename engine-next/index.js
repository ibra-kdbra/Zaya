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
 *
 * The engine owns three things and no more: which pages are on screen, how they are drawn, and
 * how a turn is animated. Search, thumbnails, outline, print and the rest live in the
 * application and reach the page through `options.paintPage` and `pdfDocument`.
 */

import { loadDocument, renderPage, PageCache } from "./document.js";
import { Layout, pageModeFor, normaliseDirection, HARD_MODES } from "./layout.js";
import { CssRenderer } from "./renderer-css.js";
import { PageSound } from "./sound.js";

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
  paintPage: null,
  onReady: null,
  onPageChange: null,
  text: {},
};

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
    this.sound = new PageSound({ enabled: this.options.soundEnable, url: this.options.soundUrl });
    this.highlightQuery = "";
    this.layout = null;
    this.renderer = null;
    this.pageAspect = 0.72;
    this.scale = 1;
    this.turnToken = 0;

    this.container.classList.add("zn-book");
    this.container.style.backgroundColor = this.options.backgroundColor;
    this.stage = document.createElement("div");
    this.stage.className = "zn-stage";
    this.container.appendChild(this.stage);

    this.onResize = this.onResize.bind(this);
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

  /** How many device pixels a page is worth right now, as a pdf.js scale. */
  scaleFor() {
    const across = this.pageMode === "single" ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const byWidth = (Math.max(1, this.stage.clientWidth) / across) * dpr / Math.max(1, this.baseWidth);
    const byHeight = Math.max(1, this.stage.clientHeight) * dpr / Math.max(1, this.baseHeight);
    const scale = Math.min(byWidth, byHeight);
    // Rounded, so a few pixels of resize do not throw the whole cache away.
    return Math.max(0.3, Math.min(4, Math.round(scale * 20) / 20));
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
    const [leftCanvas, rightCanvas] = await Promise.all([this.textureFor(left), this.textureFor(right)]);
    if (this.disposed) return;
    this.renderer.showSpread(leftCanvas, rightCanvas, this.pageMode === "single");
  }

  /* ---- navigation ------------------------------------------------------------------------ */

  /**
   * Turn to a book page. Adjacent spreads animate; a jump lands without one.
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
   * The sheet that moves between two spreads and the pages on either side of it, then hand it
   * all to the renderer.
   */
  async animateTo(from, to, token) {
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
    if (this.disposed || this.turnToken !== token) return;

    this.renderer.showSpread(leftCanvas, rightCanvas, single);
    this.sound.play();
    this.lastTurn = await this.renderer.animateTurn({
      front: frontCanvas,
      back: backCanvas,
      side,
      hard: this.layout.isHardSheet(sheet),
      backwards,
      duration: Math.max(0, this.options.duration || 0),
    });
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

  announce() {
    const detail = { page: this.activePage, pdfPages: this.visiblePdfPages() };
    emit("zaya:pageChanged", detail);
    if (typeof this.options.onPageChange === "function") this.options.onPageChange(detail.page, detail.pdfPages);
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
    const wanted = this.scaleFor();
    if (changed || wanted !== this.scale) {
      this.paintSpread().then(() => { if (changed) this.announce(); });
    }
  }

  resize() {
    this.onResize();
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
    if (this.resizeObserver) this.resizeObserver.disconnect();
    else window.removeEventListener("resize", this.onResize);
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    this.sound.dispose();
    this.cache.clear();
    if (this.pdfDocument) {
      try { this.pdfDocument.destroy(); } catch (err) { /* already gone */ }
      this.pdfDocument = null;
    }
    if (this.stage.parentNode) this.stage.parentNode.removeChild(this.stage);
    this.container.classList.remove("zn-book", "zn-failed");
    this.container.style.backgroundColor = "";
  }
}

export default ZayaBook;
