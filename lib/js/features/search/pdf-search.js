/**
 * PdfTextSearch – full-text search over a pdf.js document.
 *
 * Extracts each page's text once (lazily, with a small concurrency pool and
 * cancellation), then answers queries synchronously from the in-memory index.
 * Page numbers are 1-based PDF page numbers; the caller maps them to flipbook
 * pages (see TextureLibrary.initSearch).
 */

const NORMALIZE = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  " ": " ", "‐": "-", "‑": "-", "–": "-", "—": "-",
};
const NORMALIZE_RE = new RegExp("[" + Object.keys(NORMALIZE).join("") + "]", "g");

// Arabic: harakat, tanween, shadda, sukun, superscript alef, and tatweel are dropped; the alef
// variants collapse to bare alef. A word typed without vowel marks then matches a vowelled page.
const ARABIC_MARKS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ALEF_RE = /[\u0622\u0623\u0625\u0671]/g;
// Zero-width joiners, non-joiners, marks, BOM and the bidi controls pdf.js sometimes emits
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Canonical form for both the indexed text and the query. NFKC maps Arabic presentation forms
 * (the shaped glyphs many PDFs expose as text) back to their base letters, and folds ligatures.
 */
export function normalizeText(str) {
  let s = String(str || "");
  try { s = s.normalize("NFKC"); } catch (e) { /* older engines */ }
  return s
    .replace(NORMALIZE_RE, (ch) => NORMALIZE[ch])
    .replace(INVISIBLE_RE, "")
    .replace(ARABIC_MARKS_RE, "")
    .replace(ALEF_RE, "\u0627")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether two consecutive text items are separate words. pdf.js splits a run into several items
 * when the font, direction or positioning changes, which for shaped scripts can be every glyph;
 * gluing those back together keeps a word searchable. A gap wider than a fraction of the line
 * height, or a change of line, is a real word boundary.
 */
function separatedFrom(prev, item) {
  if (!prev) return false;
  const h = Math.max(Math.abs(item.transform[3]) || item.height || 0, 1);
  const sameLine = Math.abs(item.transform[5] - prev.transform[5]) < h * 0.5;
  if (!sameLine) return true;
  const rtl = item.dir === "rtl" || prev.dir === "rtl";
  const gap = rtl
    ? prev.transform[4] - (item.transform[4] + item.width)
    : item.transform[4] - (prev.transform[4] + prev.width);
  return gap > h * 0.12 || gap < -h; // a large negative gap is a new run somewhere else on the line
}

const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g;

/**
 * The forms a query must be looked for. Some producers store right-to-left text in logical
 * order, others in visual order, and pdf.js cannot always tell which; a reversed copy of an
 * RTL query catches the pages that came out backwards.
 */
export function queryVariants(query) {
  const q = normalizeText(query).toLowerCase();
  if (q.length < 2) return [];
  const variants = [q];
  if (RTL_RE.test(q)) {
    const reversed = Array.from(q).reverse().join("");
    if (reversed !== q) variants.push(reversed);
  }
  return variants;
}

/** Every [start, end) occurrence of any variant in `lower`, sorted and de-duplicated. */
function findAll(lower, variants) {
  const found = [];
  for (const v of variants) {
    let idx = lower.indexOf(v);
    while (idx !== -1) {
      found.push([idx, idx + v.length]);
      idx = lower.indexOf(v, idx + v.length);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  return found.filter((m, i) => i === 0 || m[0] >= found[i - 1][1]);
}

export class PdfTextSearch {
  /**
   * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDocument
   * @param {{ concurrency?: number }} [opts]
   */
  constructor(pdfDocument, opts = {}) {
    this.doc = pdfDocument;
    this.numPages = pdfDocument ? pdfDocument.numPages : 0;
    this.concurrency = Math.max(1, opts.concurrency || 4);
    /** @type {Array<{raw:string, lower:string}|undefined>} index by page number */
    this.pages = new Array(this.numPages + 1);
    this.indexed = 0;
    this.generation = 0;
    this.indexing = null;
  }

  /** Abort an in-flight index() run. Already-extracted pages are kept. */
  cancel() {
    this.generation++;
    this.indexing = null;
  }

  dispose() {
    this.cancel();
    this.pages = [];
    this.doc = null;
  }

  get isComplete() {
    return this.indexed >= this.numPages;
  }

  /**
   * What the text layer looks like once indexed: how many pages carry text at all, and how many
   * of those are glyph codes without a Unicode mapping (unsearchable no matter what is typed).
   */
  stats() {
    let withText = 0, unreadable = 0, ocr = 0;
    for (let p = 1; p <= this.numPages; p++) {
      const e = this.pages[p];
      if (!e || !e.raw) continue;
      withText++;
      if (e.unreadable) unreadable++;
      if (e.ocr) ocr++;
    }
    return { pages: this.numPages, indexed: this.indexed, withText, unreadable, ocr };
  }

  /** Whether a page carries usable text (its own or recognised). */
  hasUsableText(pageNum) {
    const e = this.pages[pageNum];
    return !!(e && e.raw && !e.unreadable);
  }

  /** Pages (1-based) that have been indexed and still have nothing searchable: candidates for OCR. */
  pagesNeedingText() {
    const out = [];
    for (let p = 1; p <= this.numPages; p++) {
      const e = this.pages[p];
      if (e && !this.hasUsableText(p)) out.push(p);
    }
    return out;
  }

  /**
   * Replace a page's text with recognised lines of words in PDF user space
   * ([{ words: [{ s, x, y, w, h, rtl }] }], see ocr.js). Words become spans exactly like text-layer
   * runs, so highlights and snippets need no special casing.
   */
  setPageFromLines(pageNum, lines) {
    if (pageNum < 1 || pageNum > this.numPages) return;
    let raw = "";
    const spans = [];
    for (const line of lines || []) {
      for (const w of line.words || []) {
        const t = normalizeText(w.s);
        if (!t) continue;
        if (raw) raw += " ";
        const start = raw.length;
        raw += t;
        const h = Math.max(w.h || 0, 1);
        spans.push({ start, end: raw.length, transform: [h, 0, 0, h, w.x, w.y], width: w.w, height: h, rtl: !!w.rtl });
      }
    }
    const fresh = !this.pages[pageNum];
    this.pages[pageNum] = { raw, lower: raw.toLowerCase(), spans, unreadable: false, ocr: true };
    if (fresh) this.indexed++;
  }

  /**
   * Extract text for every page not yet indexed.
   * @param {(done:number, total:number)=>void} [onProgress]
   * @returns {Promise<boolean>} true when the run completed, false when cancelled
   */
  index(onProgress) {
    if (this.indexing) return this.indexing;
    if (!this.doc || this.isComplete) return Promise.resolve(true);

    const gen = ++this.generation;
    const self = this;
    let next = 1;

    const extractOne = async (pageNum) => {
      if (self.pages[pageNum]) return;
      let page;
      try {
        page = await self.doc.getPage(pageNum);
        if (gen !== self.generation) return;
        const content = await page.getTextContent({ normalizeWhitespace: true });
        if (gen !== self.generation) return;
        // Build the page string item by item and remember where each item lands, so a match
        // offset can be mapped back to the glyph box of the text run(s) that contain it.
        let raw = "";
        const spans = [];
        let prev = null;
        for (const item of content.items) {
          const t = normalizeText(item.str);
          if (!t) { if (/\s/.test(item.str || "")) prev = null; continue; }
          if (raw && (prev === null || separatedFrom(prev, item) || /\s$/.test(item.str) || /^\s/.test(item.str))) raw += " ";
          const start = raw.length;
          raw += t;
          spans.push({ start, end: raw.length, transform: item.transform, width: item.width, height: item.height, rtl: item.dir === "rtl" });
          prev = item;
        }
        const privateUse = (raw.match(PRIVATE_USE_RE) || []).length;
        self.pages[pageNum] = { raw, lower: raw.toLowerCase(), spans, unreadable: raw.length > 0 && privateUse > raw.length / 3 };
      } catch (err) {
        // A single broken page must not kill the whole index.
        self.pages[pageNum] = { raw: "", lower: "" };
      } finally {
        if (page && typeof page.cleanup === "function") {
          try { page.cleanup(); } catch (e) { /* ignore */ }
        }
      }
      self.indexed++;
      if (onProgress) onProgress(self.indexed, self.numPages);
    };

    const worker = async () => {
      while (next <= self.numPages && gen === self.generation) {
        const n = next++;
        await extractOne(n);
      }
    };

    this.indexing = Promise.all(Array.from({ length: this.concurrency }, worker))
      .then(() => gen === self.generation)
      .finally(() => { if (gen === self.generation) self.indexing = null; });
    return this.indexing;
  }

  /**
   * Rectangles (PDF user space, [x, y, w, h], y up) covering every occurrence of `query` on a page.
   * Partial runs are approximated proportionally by character count.
   * @param {number} pageNum 1-based PDF page number
   * @param {string} query
   * @returns {Array<[number, number, number, number]>}
   */
  getHighlightRects(pageNum, query) {
    const entry = this.pages[pageNum];
    const variants = queryVariants(query);
    if (!entry || !entry.spans || !variants.length) return [];
    const rects = [];
    for (const [mStart, mEnd] of findAll(entry.lower, variants)) {
      for (const s of entry.spans) {
        if (s.end <= mStart || s.start >= mEnd) continue;
        const len = s.end - s.start;
        const f0 = Math.max(0, mStart - s.start) / len;
        const f1 = Math.min(len, mEnd - s.start) / len;
        const x = s.transform[4], y = s.transform[5];
        const h = s.height || Math.abs(s.transform[3]) || 10;
        const left = s.rtl ? x + s.width * (1 - f1) : x + s.width * f0;
        rects.push([left, y - h * 0.2, s.width * (f1 - f0), h * 1.2]);
      }
    }
    return rects;
  }

  /**
   * Search the indexed pages.
   * @param {string} query
   * @param {{ maxSnippetsPerPage?: number, context?: number }} [opts]
   * @returns {Array<{page:number, count:number, snippets:Array<{before:string, match:string, after:string}>}>}
   */
  search(query, opts = {}) {
    const variants = queryVariants(query);
    if (!variants.length) return [];
    const maxSnippets = opts.maxSnippetsPerPage || 3;
    const context = opts.context || 40;
    const results = [];

    for (let p = 1; p <= this.numPages; p++) {
      const entry = this.pages[p];
      if (!entry || !entry.lower) continue;
      const matches = findAll(entry.lower, variants);
      if (!matches.length) continue;
      const snippets = [];
      for (const [idx, end0] of matches) {
        if (snippets.length >= maxSnippets) break;
        const start = Math.max(0, idx - context);
        const end = Math.min(entry.raw.length, end0 + context);
        snippets.push({
          before: (start > 0 ? "…" : "") + entry.raw.slice(start, idx),
          match: entry.raw.slice(idx, end0),
          after: entry.raw.slice(end0, end) + (end < entry.raw.length ? "…" : ""),
        });
      }
      results.push({ page: p, count: matches.length, snippets });
    }
    return results;
  }
}
