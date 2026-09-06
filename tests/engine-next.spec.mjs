/**
 * engine-next — the clean-room page-turn engine, driven through its demo page.
 *
 * Nothing here touches the reader: `engine-next/demo.html` loads the engine on its own with
 * `tests/fixtures/sample.pdf` (three pages), which is the point of the demo existing.
 */

import { test, expect } from '@playwright/test';

const DEMO = '/engine-next/demo.html';

/** Console noise is a failure; the demo asks for nothing it does not ship. */
function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page, query = '') {
  await page.goto(`${DEMO}${query}`);
  await page.waitForFunction(
    () => window.zayaDemo && window.zayaDemo.book && window.zayaDemo.book.pageCount > 0,
    null, { timeout: 30_000 });
  await page.evaluate(() => window.zayaDemo.ready);
  return page.evaluate(() => window.zayaDemo.book.renderMode);
}

const state = (page) => page.evaluate(() => {
  const b = window.zayaDemo.book;
  return {
    pageCount: b.pageCount, activePage: b.activePage, pageMode: b.pageMode,
    direction: b.direction, renderMode: b.renderMode, pdfPages: b.visiblePdfPages(),
  };
});

const pageChanges = (page) => page.evaluate(() => window.zayaDemo.events
  .filter((e) => e.type === 'zaya:pageChanged').map((e) => e.detail));

/** Wait until something has actually been drawn, then describe the bitmaps on screen. */
async function samples(page) {
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.zayaDemo.sample());
    return s.length && s.every((c) => c.colours > 3) ? 'drawn' : JSON.stringify(s);
  }, { timeout: 15_000 }).toBe('drawn');
  return page.evaluate(() => window.zayaDemo.sample());
}

for (const renderMode of ['webgl', 'css']) {
  test.describe(`${renderMode} renderer`, () => {
    const q = `?render=${renderMode}`;

    test('opens the document and reports its pages', async ({ page }) => {
      const errors = collectErrors(page);
      expect(await open(page, q)).toBe(renderMode);

      const events = await page.evaluate(() => window.zayaDemo.events.map((e) => e.type));
      expect(events).toContain('zaya:pdfLoaded');
      expect(events).toContain('zaya:bookReady');

      const loaded = await page.evaluate(() => window.zayaDemo.events
        .find((e) => e.type === 'zaya:pdfLoaded').detail);
      expect(loaded.pageCount).toBe(3);

      const s = await state(page);
      expect(s.pageCount).toBe(3);
      expect(s.activePage).toBe(1);
      expect(s.pageMode).toBe('double');
      expect(errors).toEqual([]);
    });

    test('paints the spread', async ({ page }) => {
      await open(page, q);
      const drawn = await samples(page);
      expect(drawn.length).toBeGreaterThan(0);
      for (const canvas of drawn) {
        expect(canvas.colours).toBeGreaterThan(3); // not one flat colour: a page is on it
        expect(canvas.mean).toBeGreaterThan(20);
      }
    });

    test('next, prev and gotoPage announce the right pages in double mode', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, q);

      await page.evaluate(() => window.zayaDemo.book.next());
      expect((await state(page)).activePage).toBe(2);
      // Three pages make two spreads: the cover, then [2, 3]. Nothing follows the last one.
      await page.evaluate(() => window.zayaDemo.book.next());
      expect((await state(page)).activePage).toBe(2);

      await page.evaluate(() => window.zayaDemo.book.prev());
      expect((await state(page)).activePage).toBe(1);

      // A page on a spread already open is a move without a turn, and is still announced.
      await page.evaluate(() => window.zayaDemo.book.gotoPage(3));
      expect((await state(page)).activePage).toBe(3);
      await page.evaluate(() => window.zayaDemo.book.gotoPage(1));
      expect((await state(page)).activePage).toBe(1);

      const changes = await pageChanges(page);
      expect(changes.map((c) => c.page)).toEqual([1, 2, 1, 3, 1]);
      // Page 2 sits on the spread [2, 3]; page 1 is the cover, alone.
      expect(changes[0].pdfPages).toEqual([1]);
      expect(changes[1].pdfPages).toEqual([2, 3]);
      expect(changes[3].pdfPages).toEqual([2, 3]);
      expect(errors).toEqual([]);
    });

    test('single mode turns one page at a time', async ({ page }) => {
      await open(page, `${q}&mode=single`);
      expect((await state(page)).pageMode).toBe('single');
      expect((await state(page)).pdfPages).toEqual([1]);

      await page.evaluate(() => window.zayaDemo.book.next());
      let s = await state(page);
      expect(s.activePage).toBe(2);
      expect(s.pdfPages).toEqual([2]);

      await page.evaluate(() => window.zayaDemo.book.next());
      expect((await state(page)).activePage).toBe(3);
      await page.evaluate(() => window.zayaDemo.book.prev());
      s = await state(page);
      expect(s.activePage).toBe(2);
      expect(s.pdfPages).toEqual([2]);
    });

    test('right to left reverses the spread', async ({ page }) => {
      await open(page, `${q}&dir=rtl&page=2`);
      const s = await state(page);
      expect(s.direction).toBe('rtl');
      // The same spread, laid out the other way round: page 3 on the left, page 2 on the right.
      expect(s.pdfPages).toEqual([3, 2]);
      expect(await page.evaluate(() => window.zayaDemo.book.layout.screenPair(2))).toEqual([3, 2]);
      expect(await page.evaluate(() => window.zayaDemo.book.layout.screenPair(1))).toEqual([1, 0]);
      await samples(page);
    });

    test('setPageMode lays the book out again', async ({ page }) => {
      await open(page, q);
      await page.evaluate(() => window.zayaDemo.book.gotoPage(2));
      expect((await state(page)).pdfPages).toEqual([2, 3]);

      await page.evaluate(() => window.zayaDemo.book.setPageMode(true, true));
      let s = await state(page);
      expect(s.pageMode).toBe('single');
      expect(s.pdfPages).toEqual([2]);
      await samples(page);

      await page.evaluate(() => window.zayaDemo.book.setPageMode(false, true));
      s = await state(page);
      expect(s.pageMode).toBe('double');
      expect(s.pdfPages).toEqual([2, 3]);
      await samples(page);
    });

    test('the paintPage hook gets a viewport that maps back to PDF points', async ({ page }) => {
      await open(page, q);
      const calls = await page.evaluate(() => window.zayaDemo.paintCalls);
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0];
      expect(call.pdfPage).toBe(1);
      expect(call.scale).toBeGreaterThan(0);
      // The fixture's pages are A4: 595.28 × 841.89 points, y up.
      expect(call.topLeft[0]).toBeCloseTo(0, 1);
      expect(call.topLeft[1]).toBeCloseTo(841.89, 0);
      expect(call.bottomRight[0]).toBeCloseTo(595.28, 0);
      expect(call.bottomRight[1]).toBeCloseTo(0, 1);
      // The canvas is the page at that scale, so the mapping is consistent with its size.
      expect(call.width / call.scale).toBeCloseTo(595.28, 0);
      expect(call.height / call.scale).toBeCloseTo(841.89, 0);
    });

    test('a turn finishes within its duration', async ({ page }) => {
      await open(page, `${q}&duration=1000`);
      const turn = await page.evaluate(async () => {
        const started = performance.now();
        await window.zayaDemo.book.next();
        return { wall: performance.now() - started, ...window.zayaDemo.book.lastTurn };
      });
      // Animated rather than snapped. A headless machine on a software rasteriser is nowhere
      // near sixty frames a second, so the floor is low; the point is that frames were drawn.
      expect(turn.frames).toBeGreaterThanOrEqual(5);
      expect(turn.ms).toBeGreaterThan(900);             // it ran for its full duration
      expect(turn.wall).toBeLessThan(1000 + 800);       // and no longer, give or take
    });

    test('dispose leaves nothing behind', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, q);
      await samples(page);
      const after = await page.evaluate(() => {
        window.zayaDemo.book.dispose();
        const host = document.getElementById('book');
        return {
          children: host.children.length,
          canvases: host.querySelectorAll('canvas').length,
          classes: host.className,
          disposed: window.zayaDemo.book.disposed,
        };
      });
      expect(after.children).toBe(0);
      expect(after.canvases).toBe(0);
      expect(after.classes).toBe('');
      expect(after.disposed).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

test('the 2D renderer is what a machine without WebGL gets', async ({ page }) => {
  // `renderMode: 'auto'` with WebGL taken away: the engine must fall back, not fail.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (typeof type === 'string' && type.indexOf('webgl') === 0) return null;
      return original.call(this, type, ...rest);
    };
  });
  await open(page);
  expect((await state(page)).renderMode).toBe('css');
  await samples(page);
});

test('a narrow viewport opens the book on a single page', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await open(page, '?render=css');
  expect((await state(page)).pageMode).toBe('single');
});
