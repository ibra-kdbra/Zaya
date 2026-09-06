/**
 * Layout: what the reader is looking at, in book pages, and where those pages live in the PDF.
 *
 * Two page numberings run through the engine and they are not the same thing:
 *
 *   * a **book page** is a leaf of the book as the reader counts it, 1-based;
 *   * a **PDF page** is a page of the file, also 1-based.
 *
 * They coincide for an ordinary document. They do not when the file is a scan of an open book,
 * so that every page after the cover carries two book pages side by side — `doubleInternal`.
 * There, PDF page 1 is book page 1 (the cover) and PDF page *p* holds book pages 2p-2 and 2p-1.
 *
 * Sheets are the third thing worth naming: sheet *s* (1-based) has book page 2s-1 on its front
 * and 2s on its back, so the spread [2k, 2k+1] is the back of sheet k and the front of sheet k+1.
 * A turn moves exactly one sheet.
 */

/** Below this container width a spread is too cramped to read, so the book opens single. */
export const SINGLE_PAGE_MAX_WIDTH = 700;

export const HARD_MODES = ["none", "cover", "all"];

export class Layout {
  /**
   * @param {{pdfPageCount: number, doubleInternal?: boolean,
   *          direction?: 'ltr'|'rtl', hard?: 'none'|'cover'|'all'}} opts
   */
  constructor(opts) {
    this.pdfPageCount = Math.max(1, opts.pdfPageCount | 0);
    this.doubleInternal = !!opts.doubleInternal;
    this.direction = opts.direction === "rtl" ? "rtl" : "ltr";
    this.hard = HARD_MODES.includes(opts.hard) ? opts.hard : "none";
    this.pageMode = "double";
  }

  /** Book pages in the whole book. */
  get pageCount() {
    return this.doubleInternal ? Math.max(1, this.pdfPageCount * 2 - 1) : this.pdfPageCount;
  }

  /** Sheets in the whole book; a turn animates one of them. */
  get sheetCount() {
    return Math.ceil(this.pageCount / 2);
  }

  clamp(bookPage) {
    return Math.max(1, Math.min(this.pageCount, Math.round(bookPage) || 1));
  }

  /** Book page → PDF page. */
  pdfPageForBookPage(bookPage) {
    const n = this.clamp(bookPage);
    if (!this.doubleInternal) return n;
    return n > 2 ? Math.ceil((n - 1) / 2) + 1 : n;
  }

  /**
   * PDF page → book page. For a `doubleInternal` document this is the *left* of the two book
   * pages the PDF page carries, which is where a search hit should turn the book to.
   */
  bookPageForPdfPage(pdfPage) {
    const p = Math.max(1, Math.min(this.pdfPageCount, Math.round(pdfPage) || 1));
    if (!this.doubleInternal) return p;
    return p <= 2 ? p : p * 2 - 2;
  }

  /**
   * Which half of its PDF page a book page occupies, or `null` when it has the page to itself.
   * Inside a `doubleInternal` scan the even book page is always the left-hand image.
   */
  halfForBookPage(bookPage) {
    if (!this.doubleInternal) return null;
    const n = this.clamp(bookPage);
    if (n <= 2) return null;                    // the cover, and the page facing it, stand alone
    return n % 2 === 0 ? "left" : "right";
  }

  /**
   * The spread an active page belongs to, in reading order: `[verso, recto]`, where 0 means
   * "nothing there" — the blank facing the cover, or the blank after the last page.
   */
  spreadFor(bookPage) {
    const n = this.clamp(bookPage);
    if (this.pageMode === "single") return [n, 0];
    const verso = Math.floor(n / 2) * 2;         // even page, or 0 before the cover
    const recto = verso + 1;
    return [verso >= 1 ? verso : 0, recto <= this.pageCount ? recto : 0];
  }

  /**
   * The same spread as it is laid out on screen: `[left, right]`. A right-to-left book reads
   * from what a left-to-right reader would call the back, so the pair is mirrored.
   */
  screenPair(bookPage) {
    const [verso, recto] = this.spreadFor(bookPage);
    if (this.pageMode === "single") return [verso, 0];
    return this.direction === "rtl" ? [recto, verso] : [verso, recto];
  }

  /** The first book page of the spread that follows the one holding `bookPage`. */
  nextPage(bookPage) {
    const n = this.clamp(bookPage);
    const step = this.pageMode === "single" ? 1 : 2;
    const target = this.pageMode === "single" ? n + 1 : Math.floor(n / 2) * 2 + step;
    return target > this.pageCount ? null : this.clamp(target);
  }

  /** The first book page of the spread before the one holding `bookPage`. */
  prevPage(bookPage) {
    const n = this.clamp(bookPage);
    if (this.pageMode === "single") return n <= 1 ? null : n - 1;
    const verso = Math.floor(n / 2) * 2;
    if (verso <= 0) return null;                 // already on the cover spread
    return this.clamp(verso - 2 >= 1 ? verso - 2 : 1);
  }

  /** The sheet that turns when moving from `from` to `to` (1-based), or 0 if nothing turns. */
  sheetBetween(from, to) {
    if (to > from) return Math.floor(this.clamp(from) / 2) + 1;
    if (to < from) return Math.floor(this.clamp(to) / 2) + 1;
    return 0;
  }

  /** Whether a sheet turns as a stiff board rather than curling like paper. */
  isHardSheet(sheetIndex) {
    if (this.hard === "all") return true;
    if (this.hard !== "cover") return false;
    return sheetIndex === 1 || sheetIndex === this.sheetCount;
  }

  /** Book pages currently on screen, in screen order, blanks dropped. */
  visiblePages(bookPage) {
    return this.screenPair(bookPage).filter((p) => p >= 1);
  }
}

/**
 * Decide the page mode from the options and the space available.
 *
 * `pageMode` is an explicit answer and always wins. `singlePageMode: true` forces single as
 * well. Otherwise a container narrower than a spread can usefully be, or taller than it is
 * wide, gets one page.
 *
 * @returns {'single'|'double'}
 */
export function pageModeFor(options, width, height) {
  if (options.pageMode === "single" || options.pageMode === "double") return options.pageMode;
  if (options.singlePageMode === true) return "single";
  if (options.singlePageMode === false) return "double";
  if (!width || !height) return "double";
  if (width < SINGLE_PAGE_MAX_WIDTH) return "single";
  return width < height * 0.9 ? "single" : "double";
}

/** `direction` accepts dFlip's 1/2 as well as the readable names. */
export function normaliseDirection(value) {
  if (value === 2 || value === "2" || value === "rtl" || value === "RTL") return "rtl";
  return "ltr";
}
