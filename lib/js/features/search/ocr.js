/**
 * OCR for scanned pages, entirely on the reader's device.
 *
 * Tesseract (WebAssembly, vendored under lib/ocr/) reads a rendered page image and returns words
 * with pixel boxes. The boxes are mapped back into PDF user space so the words slot into the same
 * search index as a real text layer: results, snippets and on-page highlights work unchanged.
 * Recognised pages are stored in IndexedDB per document, so a book is only recognised once.
 *
 * Nothing leaves the browser: the engine, its language packs and the page images stay local.
 */

const OCR_BASE = 'lib/ocr/';
const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);
// Tesseract's own language codes, with the key each one is labelled by in the dictionaries.
const LANGS = { ara: 'ocr.langArabic', eng: 'ocr.langEnglish' };
export const LANG_CHOICES = [
  { id: 'ara+eng', key: 'ocr.langBoth' },
  { id: 'ara', key: 'ocr.langArabic' },
  { id: 'eng', key: 'ocr.langEnglish' },
];

/** The label a choice shows on its button, in the interface language. */
export function choiceLabel(choice) {
  return t(choice.key);
}
const LANG_KEY = 'zayaOcrLang';
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
// The LSTM models read best at roughly 200-300 dpi of the printed page: enough for 10pt body text,
// while every extra pixel costs recognition time about linearly. PDF user space is 72 dpi.
const TARGET_DPI = 220;
const MAX_DIMENSION = 2400;

/** Workers to run side by side: one per spare core, capped so memory stays sane on phones. */
export function defaultConcurrency() {
  const cores = navigator.hardwareConcurrency || 2;
  const coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const deviceMem = navigator.deviceMemory; // GB, Chromium only
  let n = Math.max(1, Math.min(4, cores - 1));
  if (coarse) n = Math.min(n, 2);
  if (Number.isFinite(deviceMem) && deviceMem <= 2) n = 1;
  return n;
}

// Tesseract retries a page with inverted colours whenever it is unsure, which doubles the time on
// exactly the faint scans that are slow already. Scans of print are never white-on-black.
const ENGINE_PARAMS = { tessedit_do_invert: '0', user_defined_dpi: String(TARGET_DPI) };

const abs = (rel) => new URL(rel, document.baseURI).href;
const versioned = (rel) => abs(rel) + (window.ZAYA_VERSION ? `?v=${window.ZAYA_VERSION}` : '');

export function preferredLanguage() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && LANG_CHOICES.some((c) => c.id === stored)) return stored;
  } catch (e) { /* storage unavailable */ }
  return 'ara+eng';
}

export function rememberLanguage(id) {
  try { localStorage.setItem(LANG_KEY, id); } catch (e) { /* ignore */ }
}

export function languageLabel(id) {
  return String(id || '').split('+').map((l) => (LANGS[l] ? t(LANGS[l]) : l)).join(' + ');
}

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = versioned(OCR_BASE + 'tesseract.min.js');
    s.async = true;
    s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract did not initialise')));
    s.onerror = () => { tesseractLoading = null; reject(new Error('The text-recognition engine could not be downloaded.')); };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

export class OcrEngine {
  /**
   * @param {string} langs e.g. 'ara+eng'
   * @param {(info:{stage:string, progress:number})=>void} [onProgress]
   * @param {{ concurrency?: number }} [opts]
   */
  constructor(langs, onProgress, opts = {}) {
    this.langs = langs || preferredLanguage();
    this.onProgress = onProgress || (() => {});
    this.concurrency = Math.max(1, opts.concurrency || defaultConcurrency());
    this.workers = [];      // every live worker
    this.idle = [];         // workers waiting for a page
    this.waiters = [];      // recognise() calls waiting for a worker
    this.starting = null;
    this.disposed = false;
  }

  createWorker(T) {
    return T.createWorker(this.langs, 1, {
      workerPath: versioned(OCR_BASE + 'worker.min.js'),
      corePath: abs(OCR_BASE + 'core'),
      langPath: abs(OCR_BASE + 'lang'),
      workerBlobURL: false,
      logger: (m) => {
        if (!m || typeof m.status !== 'string') return;
        this.onProgress({ stage: m.status, progress: Number.isFinite(m.progress) ? m.progress : 0 });
      },
    }).then((worker) => worker.setParameters(ENGINE_PARAMS).then(() => worker));
  }

  /** Bring up the first worker (the language data is fetched once), then the rest in parallel. */
  start() {
    if (this.starting) return this.starting;
    this.starting = loadTesseract().then(async (T) => {
      const first = await this.createWorker(T);
      if (this.disposed) { first.terminate(); throw new Error('cancelled'); }
      this.adopt(first);
      const rest = await Promise.all(Array.from({ length: this.concurrency - 1 }, () => this.createWorker(T).catch(() => null)));
      rest.filter(Boolean).forEach((w) => { if (this.disposed) w.terminate(); else this.adopt(w); });
      return this.workers.length;
    }).catch((err) => { this.starting = null; throw err; });
    return this.starting;
  }

  adopt(worker) {
    this.workers.push(worker);
    this.release(worker);
  }

  acquire() {
    if (this.disposed) return Promise.reject(new Error('cancelled'));
    if (this.idle.length) return Promise.resolve(this.idle.pop());
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  release(worker) {
    if (this.disposed) return;
    const next = this.waiters.shift();
    if (next) next.resolve(worker);
    else this.idle.push(worker);
  }

  /**
   * Recognise one pdf.js page. Resolves to lines of words in PDF user space:
   * [{ words: [{ s, x, y, w, h }] }] where (x, y) is the bottom-left corner, y up.
   * Calls run concurrently up to `concurrency`; each waits for a free worker.
   */
  async recognizePage(pdfPage) {
    await this.start();
    const base = pdfPage.getViewport({ scale: 1 });
    let scale = TARGET_DPI / 72;
    scale = Math.min(scale, MAX_DIMENSION / Math.max(base.width, base.height, 1));
    scale = Math.max(1, scale);
    const viewport = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    if (this.disposed) throw new Error('cancelled');

    const worker = await this.acquire();
    let data;
    try {
      ({ data } = await worker.recognize(canvas, {}, { text: false, blocks: true }));
    } finally {
      canvas.width = canvas.height = 0; // release the bitmap
      this.release(worker);
    }
    if (this.disposed) throw new Error('cancelled');
    return toLines(data && data.blocks, viewport);
  }

  terminate() {
    this.disposed = true;
    const all = this.workers;
    this.workers = [];
    this.idle = [];
    this.waiters.splice(0).forEach((w) => w.reject(new Error('cancelled')));
    this.starting = null;
    all.forEach((w) => { try { w.terminate(); } catch (e) { /* ignore */ } });
  }
}

function toLines(blocks, viewport) {
  const lines = [];
  if (!Array.isArray(blocks)) return lines;
  for (const block of blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words = [];
        for (const w of line.words || []) {
          const text = (w.text || '').trim();
          if (!text || !w.bbox) continue;
          if (w.confidence !== undefined && w.confidence < 20) continue; // noise, not letters
          const [x0, y0] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y1); // bottom-left
          const [x1, y1] = viewport.convertToPdfPoint(w.bbox.x1, w.bbox.y0); // top-right
          const left = Math.min(x0, x1), bottom = Math.min(y0, y1);
          words.push({ s: text, x: r2(left), y: r2(bottom), w: r2(Math.abs(x1 - x0)), h: r2(Math.abs(y1 - y0)), rtl: RTL_RE.test(text) });
        }
        if (words.length) lines.push({ words });
      }
    }
  }
  return lines;
}

const r2 = (n) => Math.round(n * 100) / 100;

/* ---- Per-document store ------------------------------------------------------------------- */

/**
 * Recognised pages live in the `ocr` store of the shared `Zaya` database (window.ZayaDB), one
 * record per page, keyed `"<document key> <page>"` and indexed by document.
 */
const OCR_STORE = 'ocr';
const db = () => window.ZayaDB || null;

export const OcrStore = {
  /** All recognised pages of a document: Map<pageNumber, {lang, lines}> */
  load(docKey) {
    if (!docKey || !db()) return Promise.resolve(new Map());
    return db().byIndex(OCR_STORE, 'doc', docKey)
      .then((rows) => new Map((rows || []).map((r) => [r.page, { lang: r.lang, lines: r.lines }])))
      .catch(() => new Map());
  },
  save(docKey, page, lang, lines) {
    if (!docKey || !db()) return Promise.resolve();
    return db().put(OCR_STORE, { id: `${docKey} ${page}`, doc: docKey, page, lang, lines, at: Date.now() }, undefined, 'the recognised text')
      .catch((err) => { if (!db().isQuotaError(err)) console.warn('Could not store recognised text:', err); });
  },
  clear(docKey) {
    if (!docKey || !db()) return Promise.resolve();
    return db().deleteByIndex(OCR_STORE, 'doc', docKey).catch(() => {});
  },
  /** Every recognised page in this browser, for a backup: [{doc, page, lang, lines}] */
  all() {
    if (!db()) return Promise.resolve([]);
    return db().getAll(OCR_STORE)
      .then((rows) => (rows || []).map((r) => ({ doc: r.doc, page: r.page, lang: r.lang, lines: r.lines })))
      .catch(() => []);
  },
};
