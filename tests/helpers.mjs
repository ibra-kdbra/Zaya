import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const SAMPLE_PDF = readFileSync(new URL('./fixtures/sample.pdf', import.meta.url));
export const SAMPLE_PDF_PATH = new URL('./fixtures/sample.pdf', import.meta.url).pathname;

/** Serve the bundled fixture for any remote PDF so the tests never touch the network. */
export async function stubNetwork(page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    if (/\.pdf($|\?)/i.test(url) || /ufs\.sh\//.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: SAMPLE_PDF,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    return route.fulfill({ status: 204, body: '' }); // fonts.googleapis, youtube, etc.
  });
}

export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

/** Wait until the flipbook has rendered something. */
export async function waitForBook(page) {
  await expect(page.locator('#flipbookContainer canvas, #flipbookContainer .df-book-page').first())
    .toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!(window.ZayaBook && window.ZayaBook.isReady)), { timeout: 15_000 })
    .toBe(true);
}

/** Open the control panel and select one of its tabs (Document | Notes | Media | Settings). */
export async function openPanel(page, tab = 'Document') {
  const panel = page.locator('#unifiedPanel');
  if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
    await page.locator('#toggleUnifiedPanelBtn').click();
  }
  const tabBtn = page.locator(`#panelTab${tab}`);
  if (await tabBtn.count()) await tabBtn.click();
  await expect(panel).toHaveClass(/open/);
}

export async function activePage(page) {
  return page.evaluate(() => (window.ZayaBook && window.ZayaBook.current ? window.ZayaBook.current.activePage : null));
}

/** Turn to `n` and wait until page memory has stored it for `key`. */
export async function goToPage(page, n, key) {
  await page.evaluate((target) => window.ZayaBook.current.gotoPage(target), n);
  await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(n);
  if (key) {
    await expect.poll(() => page.evaluate((k) => window.getLastPage(k), key), { timeout: 15_000 }).toBe(n);
  }
}

/**
 * A same-origin page that runs none of the app, so a test can prepare IndexedDB before the first
 * load. The static server's directory listing is enough.
 */
export async function blankPage(page) {
  await page.goto('/tests/fixtures/');
}

/** Seed the four databases Zaya used before everything moved into one. */
export async function seedLegacyDatabases(page, seed) {
  await page.evaluate(async (data) => {
    const open = (name, version, upgrade) => new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (e) => upgrade(e.target.result, e.target.transaction);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const write = (db, store, rows) => new Promise((resolve, reject) => {
      const t = db.transaction([store], 'readwrite');
      const s = t.objectStore(store);
      rows.forEach((r) => (r.key !== undefined ? s.put(r.value, r.key) : s.put(r.value)));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });

    const pages = await open('FlipBookPageMemory', 1, (db) => db.createObjectStore('pages'));
    await write(pages, 'pages', [{ key: data.pageKey, value: data.page }]);
    pages.close();

    const quotes = await open('QuotesDB', 3, (db) => {
      const store = db.createObjectStore('quotes', { keyPath: 'id', autoIncrement: true });
      store.createIndex('pdfUrl', 'pdfUrl', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
      db.createObjectStore('settings', { keyPath: 'id' });
    });
    await write(quotes, 'quotes', [{ value: { id: 1, quote: data.quote, pdfUrl: data.docKey, pdfName: data.docKey, pageNumber: 2, timestamp: new Date().toISOString() } }]);
    await write(quotes, 'settings', [{ value: { id: 'user_settings', theme: 'nord', autoHide: true, volume: 42 } }]);
    quotes.close();

    const files = await open('ZayaLocalDocs', 1, (db) => db.createObjectStore('files', { keyPath: 'name' }).createIndex('savedAt', 'savedAt'));
    await write(files, 'files', [{ value: { name: data.docKey, size: 9, type: 'application/pdf', lastModified: 0, savedAt: Date.now(), blob: new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }) } }]);
    files.close();

    const ocr = await open('ZayaOcr', 1, (db) => db.createObjectStore('pages', { keyPath: 'id' }).createIndex('doc', 'doc'));
    await write(ocr, 'pages', [{ value: { id: `${data.docKey} 1`, doc: data.docKey, page: 1, lang: 'eng', lines: [{ words: [{ s: 'legacy', x: 1, y: 1, w: 10, h: 5 }] }], at: Date.now() } }]);
    ocr.close();
  }, seed);
}

/** The IndexedDB databases this origin holds, by name. */
export function databaseNames(page) {
  return page.evaluate(() => (indexedDB.databases ? indexedDB.databases().then((l) => l.map((d) => d.name)) : []));
}

export function readState(page) {
  return page.evaluate(() => ({
    ...window.appState.getState(),
    storedPdf: localStorage.getItem('lastOpenedPDF'),
    storedType: localStorage.getItem('lastOpenedPDFType'),
    storedTheme: localStorage.getItem('theme'),
    storedRTL: localStorage.getItem('isRTL'),
    storedVolume: localStorage.getItem('mediaVolume'),
    storedLoop: localStorage.getItem('mediaLoop'),
    storedMode: localStorage.getItem('mediaMode')
  }));
}

/** A tiny but valid mono 8-bit PCM WAV, `seconds` long. */
export function wavFixture(seconds = 1) {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples, 40);
  for (let i = 0; i < samples; i++) buf[44 + i] = 128 + Math.round(60 * Math.sin(i / 12));
  return { name: 'tone.wav', mimeType: 'audio/wav', buffer: buf };
}
