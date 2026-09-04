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
  " ": " ", "‐": "-", "‑": "-", "–": "-", "—": "-",
};
const NORMALIZE_RE = new RegExp("[" + Object.keys(NORMALIZE).join("") + "]", "g");

export function normalizeText(str) {
  return String(str || "")
    .replace(NORMALIZE_RE, (ch) => NORMALIZE[ch])
    .replace(/\s+/g, " ")
    .trim();
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
        const raw = normalizeText(content.items.map((i) => i.str).join(" "));
        self.pages[pageNum] = { raw, lower: raw.toLowerCase() };
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
   * Search the indexed pages.
   * @param {string} query
   * @param {{ maxSnippetsPerPage?: number, context?: number }} [opts]
   * @returns {Array<{page:number, count:number, snippets:Array<{before:string, match:string, after:string}>}>}
   */
  search(query, opts = {}) {
    const q = normalizeText(query).toLowerCase();
    if (q.length < 2) return [];
    const maxSnippets = opts.maxSnippetsPerPage || 3;
    const context = opts.context || 40;
    const results = [];

    for (let p = 1; p <= this.numPages; p++) {
      const entry = this.pages[p];
      if (!entry || !entry.lower) continue;
      let idx = entry.lower.indexOf(q);
      if (idx === -1) continue;
      let count = 0;
      const snippets = [];
      while (idx !== -1) {
        count++;
        if (snippets.length < maxSnippets) {
          const start = Math.max(0, idx - context);
          const end = Math.min(entry.raw.length, idx + q.length + context);
          snippets.push({
            before: (start > 0 ? "…" : "") + entry.raw.slice(start, idx),
            match: entry.raw.slice(idx, idx + q.length),
            after: entry.raw.slice(idx + q.length, end) + (end < entry.raw.length ? "…" : ""),
          });
        }
        idx = entry.lower.indexOf(q, idx + q.length);
      }
      results.push({ page: p, count, snippets });
    }
    return results;
  }
}
