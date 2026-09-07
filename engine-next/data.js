/**
 * Data for the application's panels.
 *
 * The engine does not build a thumbnails strip, an outline tree or a page-label ribbon: those
 * are the reader's own furniture, and the reader already knows how it wants them to look. What
 * the engine owes is the part only it can supply — a picture of a page, the document's outline
 * with its destinations already resolved to page numbers, and whatever a page calls itself.
 *
 * Everything here is read-only with respect to the book: nothing in this file turns a page,
 * touches the stage, or writes to the page cache the renderers share.
 */

import { renderPage } from "./document.js";

/** Thumbnails are small and numerous, so they get their own cache rather than the page one. */
export class ThumbnailCache {
  /** @param {number} [limit] how many thumbnails to keep */
  constructor(limit = 64) {
    this.limit = Math.max(1, limit | 0);
    /** @type {Map<string, HTMLCanvasElement>} insertion order is the LRU order */
    this.entries = new Map();
    /** @type {Map<string, Promise<HTMLCanvasElement>>} renders already in flight */
    this.pending = new Map();
  }

  static key(pdfPageNumber, width) {
    return `${pdfPageNumber}@${Math.round(width)}`;
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return null;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key, canvas) {
    this.entries.set(key, canvas);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      const victim = this.entries.get(oldest);
      this.entries.delete(oldest);
      victim.width = victim.height = 0;
    }
    return canvas;
  }

  clear() {
    this.entries.forEach((c) => { c.width = c.height = 0; });
    this.entries.clear();
    this.pending.clear();
  }
}

/**
 * A picture of one PDF page, at most `width` CSS pixels across.
 *
 * Two calls for the same page and width share one render rather than racing each other, which
 * matters when a thumbnails panel scrolls quickly and asks again for what it has just asked for.
 *
 * @param {object} pdfDocument a pdf.js document proxy
 * @param {ThumbnailCache} cache
 * @param {number} pdfPageNumber 1-based
 * @param {number} [width] target width in CSS pixels
 * @returns {Promise<HTMLCanvasElement>}
 */
export function thumbnail(pdfDocument, cache, pdfPageNumber, width = 160) {
  const number = Math.max(1, Math.min(pdfDocument.numPages, Math.round(pdfPageNumber) || 1));
  const target = Math.max(16, Math.min(600, Math.round(width) || 160));
  const key = ThumbnailCache.key(number, target);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inFlight = cache.pending.get(key);
  if (inFlight) return inFlight;

  const work = pdfDocument.getPage(number)
    .then((page) => {
      const base = page.getViewport({ scale: 1 });
      const scale = target / Math.max(1, base.width);
      return renderPage(page, scale, { background: "#ffffff" });
    })
    .then((canvas) => {
      cache.pending.delete(key);
      return cache.set(key, canvas);
    })
    .catch((err) => {
      cache.pending.delete(key);
      throw err;
    });
  cache.pending.set(key, work);
  return work;
}

/** The page index a pdf.js destination points at, or 0 when it cannot be worked out. */
async function pageForDestination(pdfDocument, dest) {
  let target = dest;
  if (typeof target === "string") {
    target = await pdfDocument.getDestination(target);
  }
  if (!Array.isArray(target) || !target.length) return 0;
  const ref = target[0];
  if (ref && typeof ref === "object") {
    const index = await pdfDocument.getPageIndex(ref);
    return index + 1;
  }
  // An explicit page index, as a few writers emit it.
  if (typeof ref === "number" && isFinite(ref)) return Math.max(1, Math.round(ref) + 1);
  return 0;
}

/**
 * The document's outline, with every destination already resolved to a PDF page number.
 *
 * The shape is deliberately plain — `{title, pdfPage, children}` and nothing else — so the panel
 * that renders it never needs a pdf.js object of its own. An entry whose destination cannot be
 * resolved keeps `pdfPage: 0`; the panel can show it as a heading rather than a link.
 *
 * @param {object} pdfDocument
 * @returns {Promise<Array<{title: string, pdfPage: number, children: Array}>>} empty for a
 *          document with no outline
 */
export async function outline(pdfDocument) {
  const raw = await pdfDocument.getOutline();
  if (!Array.isArray(raw) || !raw.length) return [];

  const convert = async (items) => {
    const out = [];
    for (const item of items) {
      let pdfPage = 0;
      try {
        pdfPage = await pageForDestination(pdfDocument, item.dest);
      } catch (err) {
        pdfPage = 0;                        // a broken destination costs the entry its link, no more
      }
      out.push({
        title: String(item.title == null ? "" : item.title),
        pdfPage,
        children: Array.isArray(item.items) && item.items.length ? await convert(item.items) : [],
      });
    }
    return out;
  };
  return convert(raw);
}

/**
 * What a PDF page calls itself: the label from the document's page-labels table when it has one,
 * and the page number as a string when it has not.
 *
 * @param {string[]|null} labels the array pdf.js hands back from `getPageLabels()`
 * @param {number} pdfPageNumber 1-based
 * @param {number} pageCount
 * @returns {string}
 */
export function pageLabel(labels, pdfPageNumber, pageCount) {
  const number = Math.max(1, Math.min(pageCount || 1, Math.round(pdfPageNumber) || 1));
  const label = Array.isArray(labels) ? labels[number - 1] : null;
  return label ? String(label) : String(number);
}
