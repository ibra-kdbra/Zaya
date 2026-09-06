/**
 * Document loading and page rasterisation for the new engine.
 *
 * Everything pdf.js touches lives here: opening a document from a URL, a blob or bytes,
 * turning a page into a canvas at a given scale, and keeping the most recent canvases
 * around under a pixel budget so turning back a spread does not re-render it.
 *
 * The engine never talks to pdf.js anywhere else.
 */

import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

/** Vendor directory, resolved from this module's own URL so the tree can move as a unit. */
const PDFJS_DIR = new URL("../vendor/pdfjs/", import.meta.url).href;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_DIR + "pdf.worker.min.mjs";

/** Where a document may come from. */
function sourceToParameters(source) {
  if (!source) throw new Error("engine-next: no document source");
  if (typeof source === "string") return { url: source };
  if (source instanceof ArrayBuffer) return { data: new Uint8Array(source) };
  if (ArrayBuffer.isView(source)) return { data: new Uint8Array(source.buffer, source.byteOffset, source.byteLength) };
  if (typeof Blob !== "undefined" && source instanceof Blob) return { blob: source };
  if (typeof source === "object" && (source.url || source.data)) return { ...source };
  throw new Error("engine-next: unsupported document source");
}

/**
 * Open a PDF.
 * @param {string|Blob|ArrayBuffer|ArrayBufferView|object} source
 * @param {{onProgress?: (loaded:number, total:number)=>void}} [opts]
 * @returns {Promise<object>} a pdf.js document proxy
 */
export async function loadDocument(source, opts = {}) {
  let params = sourceToParameters(source);
  if (params.blob) {
    const buffer = await params.blob.arrayBuffer();
    params = { data: new Uint8Array(buffer) };
  }
  const task = pdfjsLib.getDocument({
    ...params,
    cMapUrl: PDFJS_DIR + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: PDFJS_DIR + "standard_fonts/",
    // The site runs under a Content-Security-Policy without 'unsafe-eval'.
    isEvalSupported: false,
  });
  if (opts.onProgress) {
    task.onProgress = ({ loaded, total }) => opts.onProgress(loaded, total || 0);
  }
  return task.promise;
}

/**
 * Rasterise one PDF page.
 *
 * The page is always rendered whole, so the viewport handed to `paint` maps
 * `convertToPdfPoint` for the entire page; only afterwards is a half cut out, for documents
 * whose pages already hold two book pages.
 *
 * @param {object} pdfPage a pdf.js page proxy
 * @param {number} scale   CSS-pixels per PDF point
 * @param {{half?: 'left'|'right'|null,
 *          background?: string,
 *          paint?: (ctx: CanvasRenderingContext2D, viewport: object, pdfPage: number) => void}} [opts]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPage(pdfPage, scale, opts = {}) {
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = opts.background || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;

  if (typeof opts.paint === "function") {
    ctx.save();
    try {
      opts.paint(ctx, viewport, pdfPage.pageNumber);
    } catch (err) {
      // A painter that throws must not cost the reader the page.
      console.warn("engine-next: paintPage failed", err);
    }
    ctx.restore();
  }

  if (opts.half !== "left" && opts.half !== "right") return canvas;

  const halfWidth = Math.max(1, Math.round(canvas.width / 2));
  const cut = document.createElement("canvas");
  cut.width = halfWidth;
  cut.height = canvas.height;
  const cutCtx = cut.getContext("2d", { alpha: false });
  cutCtx.drawImage(canvas, opts.half === "left" ? 0 : canvas.width - halfWidth, 0, halfWidth, canvas.height,
    0, 0, halfWidth, canvas.height);
  canvas.width = canvas.height = 0; // free the full-page bitmap
  return cut;
}

/**
 * Least-recently-used cache of rendered canvases, bounded by total pixels rather than by
 * count: one spread of a big page costs as much as a dozen thumbnails, and the budget is
 * really about memory.
 */
export class PageCache {
  /** @param {number} [pixelBudget] total pixels to keep, roughly four bytes each */
  constructor(pixelBudget = 48e6) {
    this.budget = pixelBudget;
    this.pixels = 0;
    /** @type {Map<string, HTMLCanvasElement>} insertion order is the LRU order */
    this.entries = new Map();
    this.generation = 0;
  }

  static key(pdfPageNumber, scale, half, generation) {
    return `${pdfPageNumber}|${Math.round(scale * 100)}|${half || "-"}|${generation}`;
  }

  /** Everything rendered so far is stale (the painted search query changed). */
  invalidate() {
    this.generation++;
    this.clear();
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return null;
    this.entries.delete(key);      // re-insert: most recently used goes last
    this.entries.set(key, hit);
    return hit;
  }

  set(key, canvas) {
    const cost = canvas.width * canvas.height;
    if (cost > this.budget) return canvas; // too big to keep; hand it back uncached
    this.entries.set(key, canvas);
    this.pixels += cost;
    while (this.pixels > this.budget && this.entries.size > 1) {
      const oldest = this.entries.keys().next().value;
      const victim = this.entries.get(oldest);
      this.entries.delete(oldest);
      this.pixels -= victim.width * victim.height;
      victim.width = victim.height = 0;
    }
    return canvas;
  }

  clear() {
    this.entries.forEach((c) => { c.width = c.height = 0; });
    this.entries.clear();
    this.pixels = 0;
  }
}

export { pdfjsLib };
