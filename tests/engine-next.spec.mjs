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

/* -------------------------------------------------------------------------------------------
 * Zoom
 * ---------------------------------------------------------------------------------------- */

const zoomState = (page) => page.evaluate(() => {
  const b = window.zayaDemo.book;
  return { level: b.zoomLevel, zoomed: b.zoomed, panX: b.panX, panY: b.panY, scale: b.scale };
});

for (const renderMode of ['webgl', 'css']) {
  test.describe(`${renderMode} zoom`, () => {
    const q = `?render=${renderMode}`;

    test('zoom, zoomIn, zoomOut and resetZoom move between fit and four times it', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, q);
      expect(await zoomState(page)).toMatchObject({ level: 1, zoomed: false });

      expect(await page.evaluate(() => window.zayaDemo.book.zoom(2))).toBe(2);
      expect((await zoomState(page)).zoomed).toBe(true);

      // The steps are multiplicative, and both ends are clamped rather than refused.
      await page.evaluate(() => window.zayaDemo.book.zoomIn());
      expect((await zoomState(page)).level).toBeCloseTo(3, 5);
      await page.evaluate(() => window.zayaDemo.book.zoomOut());
      expect((await zoomState(page)).level).toBeCloseTo(2, 5);
      expect(await page.evaluate(() => window.zayaDemo.book.zoom(99))).toBe(4);
      expect(await page.evaluate(() => window.zayaDemo.book.zoom(0.1))).toBe(1);

      expect(await page.evaluate(() => window.zayaDemo.book.resetZoom())).toBe(1);
      expect(await zoomState(page)).toMatchObject({ level: 1, zoomed: false, panX: 0, panY: 0 });
      expect(errors).toEqual([]);
    });

    test('zoomChange fires once each way, not once per step', async ({ page }) => {
      await open(page, q);
      await page.evaluate(() => {
        const b = window.zayaDemo.book;
        b.zoom(1.5); b.zoomIn(); b.zoomIn(); b.resetZoom();
      });
      expect(await page.evaluate(() => window.zayaDemo.zoomChanges))
        .toEqual([{ zoomed: true, level: 1.5 }, { zoomed: false, level: 1 }]);
      // And the engine announces the same thing on `document`, for a listener holding no handle.
      const events = await page.evaluate(() => window.zayaDemo.events
        .filter((e) => e.type === 'zaya:zoomChanged').map((e) => e.detail.zoomed));
      expect(events).toEqual([true, false]);
    });

    test('a magnified page is drawn bigger and can be panned', async ({ page }) => {
      await open(page, q);
      const before = await page.evaluate(() => window.zayaDemo.book.renderer.pageBoxes());
      await page.evaluate(() => window.zayaDemo.book.zoom(2));
      const after = await page.evaluate(() => window.zayaDemo.book.renderer.pageBoxes());
      expect(after[0].width).toBeCloseTo(before[0].width * 2, 0);

      // Panning moves the page, and stops at the edge rather than letting it drift away.
      await page.evaluate(() => window.zayaDemo.book.pan(-120, -60));
      const panned = await page.evaluate(() => window.zayaDemo.book.renderer.pageBoxes());
      expect(panned[0].x).toBeLessThan(after[0].x);
      await page.evaluate(() => window.zayaDemo.book.pan(-100000, -100000));
      const state = await zoomState(page);
      expect(Math.abs(state.panX)).toBeLessThan(10000);
      expect(Math.abs(state.panY)).toBeLessThan(10000);

      // Panning at fit does nothing at all.
      await page.evaluate(() => { window.zayaDemo.book.resetZoom(); window.zayaDemo.book.pan(50, 50); });
      expect(await zoomState(page)).toMatchObject({ panX: 0, panY: 0 });
    });

    test('the pages are re-rendered at the magnified scale', async ({ page }) => {
      await open(page, q);
      const before = (await zoomState(page)).scale;
      await page.evaluate(() => window.zayaDemo.book.zoom(2));
      await expect.poll(async () => (await zoomState(page)).scale, { timeout: 10_000 })
        .toBeGreaterThan(before);
      // Whatever the magnification, a texture stays inside the cache's budget.
      expect((await zoomState(page)).scale).toBeLessThanOrEqual(4);
    });

    test('the wheel with a modifier zooms about the pointer, and a double click toggles', async ({ page }) => {
      await open(page, q);
      const box = await page.locator('#book').boundingBox();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
      await page.mouse.wheel(0, -400);
      expect((await zoomState(page)).level).toBe(1);   // no modifier: the wheel is not ours

      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -400);
      await page.keyboard.up('Control');
      await expect.poll(async () => (await zoomState(page)).zoomed).toBe(true);

      await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.4);
      await expect.poll(async () => (await zoomState(page)).zoomed).toBe(false);
      await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.4);
      await expect.poll(async () => (await zoomState(page)).level).toBe(2);
    });

    test('two fingers pinch the page', async ({ page }) => {
      await open(page, q);
      await page.evaluate(() => {
        const stage = document.querySelector('.zn-stage');
        const rect = stage.getBoundingClientRect();
        const at = (id, x, y, type) => stage.dispatchEvent(new PointerEvent(type, {
          pointerId: id, pointerType: 'touch', bubbles: true, isPrimary: id === 1,
          clientX: rect.left + x, clientY: rect.top + y,
        }));
        at(1, 500, 400, 'pointerdown');
        at(2, 600, 400, 'pointerdown');
        at(1, 400, 400, 'pointermove');
        at(2, 700, 400, 'pointermove');
        at(1, 300, 400, 'pointermove');
        at(2, 800, 400, 'pointermove');
        at(1, 300, 400, 'pointerup');
        at(2, 800, 400, 'pointerup');
      });
      expect((await zoomState(page)).zoomed).toBe(true);
    });

    test('a page turn brings the book back to fit', async ({ page }) => {
      await open(page, `${q}&duration=60`);
      await page.evaluate(() => window.zayaDemo.book.zoom(3));
      expect((await zoomState(page)).zoomed).toBe(true);
      await page.evaluate(() => window.zayaDemo.book.next());
      expect(await zoomState(page)).toMatchObject({ level: 1, zoomed: false, panX: 0, panY: 0 });
      expect((await state(page)).activePage).toBe(2);
    });
  });
}

/* -------------------------------------------------------------------------------------------
 * The text layer
 * ---------------------------------------------------------------------------------------- */

const spans = (page) => page.evaluate(() => [...document.querySelectorAll('.zn-textlayer span')]
  .map((s) => ({ dir: s.dir, text: s.textContent })));

/** Wait for the text over the pages on screen to exist. */
async function textReady(page, atLeast = 1) {
  await expect.poll(async () => (await spans(page)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(atLeast);
  return spans(page);
}

for (const renderMode of ['webgl', 'css']) {
  test.describe(`${renderMode} text layer`, () => {
    const q = `?render=${renderMode}`;

    test('the page carries selectable text, placed over the glyphs', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, q);
      const runs = await textReady(page);
      expect(runs[0].text).toContain('Zaya smoke test document');

      // The run sits inside the page it belongs to, not somewhere else on the stage.
      const placed = await page.evaluate(() => {
        const box = window.zayaDemo.book.renderer.pageBoxes()[0];
        const stage = document.querySelector('.zn-stage').getBoundingClientRect();
        const rect = document.querySelector('.zn-textlayer span').getBoundingClientRect();
        return {
          left: rect.left - stage.left, top: rect.top - stage.top, width: rect.width, box,
        };
      });
      expect(placed.left).toBeGreaterThanOrEqual(placed.box.x - 2);
      expect(placed.top).toBeGreaterThan(placed.box.y);
      expect(placed.top).toBeLessThan(placed.box.y + placed.box.height);
      // Stretched to the run's real advance rather than to whatever the fallback font is.
      expect(placed.width).toBeGreaterThan(placed.box.width * 0.5);
      expect(errors).toEqual([]);
    });

    test('a word can be selected and copied', async ({ page }) => {
      await open(page, q);
      await textReady(page);
      const target = await page.evaluate(() => {
        const rect = document.querySelector('.zn-textlayer span').getBoundingClientRect();
        return { x: rect.left + 12, y: rect.top + rect.height / 2 };
      });
      await page.mouse.dblclick(target.x, target.y);
      const selected = await page.evaluate(() => window.getSelection().toString());
      expect(selected.trim().length).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.querySelector('.zn-textlayer span').textContent))
        .toContain(selected.trim());
    });

    test('right-to-left runs are marked so they copy in logical order', async ({ page }) => {
      await open(page, `${q}&dir=rtl&pdf=../tests/fixtures/sample-arabic.pdf`);
      const runs = await textReady(page);
      expect(runs.some((r) => r.dir === 'rtl')).toBe(true);
    });

    test('setTextLayerEnabled takes the text away and puts it back', async ({ page }) => {
      await open(page, q);
      await textReady(page);
      await page.evaluate(() => window.zayaDemo.book.setTextLayerEnabled(false));
      expect(await page.evaluate(() => window.zayaDemo.book.textLayerEnabled)).toBe(false);
      expect(await spans(page)).toEqual([]);
      await page.evaluate(() => window.zayaDemo.book.setTextLayerEnabled(true));
      await textReady(page);
    });

    test('the text is hidden while a sheet is in flight and comes back at rest', async ({ page }) => {
      await open(page, `${q}&duration=900`);
      await textReady(page);
      const mid = await page.evaluate(async () => {
        const turn = window.zayaDemo.book.next();
        await new Promise((done) => setTimeout(done, 300));
        const seen = document.querySelector('.zn-textlayers').style.visibility;
        await turn;
        return seen;
      });
      expect(mid).toBe('hidden');
      await textReady(page, 2);   // the spread [2, 3] carries a run on each page
      expect(await page.evaluate(() => document.querySelector('.zn-textlayers').style.visibility))
        .not.toBe('hidden');
    });

    test('the text follows the page when it is magnified', async ({ page }) => {
      await open(page, q);
      await textReady(page);
      const measure = () => page.evaluate(() => {
        const stage = document.querySelector('.zn-stage').getBoundingClientRect();
        const rect = document.querySelector('.zn-textlayer span').getBoundingClientRect();
        return { left: rect.left - stage.left, width: rect.width };
      });
      const before = await measure();
      await page.evaluate(() => window.zayaDemo.book.zoom(2));
      const after = await measure();
      expect(after.width).toBeCloseTo(before.width * 2, -1);
    });
  });
}

/* -------------------------------------------------------------------------------------------
 * Data for the application's panels
 * ---------------------------------------------------------------------------------------- */

test.describe('data for panels', () => {
  const OUTLINE = '?render=css&pdf=../tests/fixtures/sample-outline.pdf';

  test('getOutline resolves every destination to a page number', async ({ page }) => {
    await open(page, OUTLINE);
    expect(await page.evaluate(() => window.zayaDemo.book.getOutline())).toEqual([
      {
        title: 'Chapter One',
        pdfPage: 1,
        children: [{ title: 'Section 1.1 The fox', pdfPage: 1, children: [] }],
      },
      { title: 'Chapter Two', pdfPage: 2, children: [] },
      { title: 'Appendix', pdfPage: 3, children: [] },
    ]);
    // Asked twice, built once.
    expect(await page.evaluate(async () => {
      const b = window.zayaDemo.book;
      return (await b.getOutline()) === (await b.getOutline());
    })).toBe(true);
  });

  test('a document with no outline reports an empty one rather than failing', async ({ page }) => {
    await open(page, '?render=css');
    expect(await page.evaluate(() => window.zayaDemo.book.getOutline())).toEqual([]);
  });

  test('getThumbnail draws a page at the width asked for, and caches it', async ({ page }) => {
    await open(page, OUTLINE);
    const shot = await page.evaluate(async () => {
      const canvas = await window.zayaDemo.book.getThumbnail(2, 120);
      const probe = document.createElement('canvas');
      probe.width = probe.height = 20;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, 20, 20);
      const data = ctx.getImageData(0, 0, 20, 20).data;
      const colours = new Set();
      for (let i = 0; i < data.length; i += 4) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return { width: canvas.width, height: canvas.height, colours: colours.size };
    });
    expect(shot.width).toBe(120);
    expect(shot.height).toBeGreaterThan(120);        // A4 is taller than it is wide
    expect(shot.colours).toBeGreaterThan(1);         // something was drawn on it

    expect(await page.evaluate(async () => {
      const b = window.zayaDemo.book;
      return (await b.getThumbnail(2, 120)) === (await b.getThumbnail(2, 120));
    })).toBe(true);
    // Two callers asking at once share one render rather than racing.
    expect(await page.evaluate(async () => {
      const b = window.zayaDemo.book;
      const [a, c] = await Promise.all([b.getThumbnail(3, 64), b.getThumbnail(3, 64)]);
      return a === c;
    })).toBe(true);
  });

  test('getPageLabel names a page, and clamps whatever it is handed', async ({ page }) => {
    await open(page, OUTLINE);
    expect(await page.evaluate(async () => {
      const b = window.zayaDemo.book;
      return [await b.getPageLabel(1), await b.getPageLabel(3), await b.getPageLabel(99), await b.getPageLabel(-4)];
    })).toEqual(['1', '3', '3', '1']);
  });
});

/* -------------------------------------------------------------------------------------------
 * Chrome: fullscreen, download, share, interactivity and sound
 * ---------------------------------------------------------------------------------------- */

test.describe('chrome actions', () => {
  test('toggleFullscreen puts the container in and out, and reports the state', async ({ page }) => {
    // Headless Chromium will not grant real fullscreen, so the browser's side of the API is
    // emulated: what is under test is the engine's use of it and the state it publishes.
    await page.addInitScript(() => {
      let element = null;
      Object.defineProperty(document, 'fullscreenElement', { get: () => element });
      const announce = () => document.dispatchEvent(new Event('fullscreenchange'));
      Element.prototype.requestFullscreen = function () { element = this; announce(); return Promise.resolve(); };
      document.exitFullscreen = () => { element = null; announce(); return Promise.resolve(); };
    });
    await open(page, '?render=css');
    expect(await page.evaluate(() => window.zayaDemo.book.fullscreen)).toBe(false);

    expect(await page.evaluate(() => window.zayaDemo.book.toggleFullscreen())).toBe(true);
    expect(await page.evaluate(() => document.getElementById('book').classList.contains('zn-fullscreen'))).toBe(true);
    expect(await page.evaluate(() => window.zayaDemo.events
      .filter((e) => e.type === 'zaya:fullscreenChanged').map((e) => e.detail.fullscreen))).toEqual([true]);

    expect(await page.evaluate(() => window.zayaDemo.book.toggleFullscreen())).toBe(false);
    expect(await page.evaluate(() => document.getElementById('book').classList.contains('zn-fullscreen'))).toBe(false);
  });

  test('download resolves the source for the application to save', async ({ page }) => {
    await open(page, '?render=css');
    const resolved = await page.evaluate(async () => {
      const { url, name } = await window.zayaDemo.book.download();
      return { url, name };
    });
    expect(resolved.name).toBe('sample.pdf');
    expect(resolved.url).toContain('sample.pdf');
  });

  test('download of a document opened from bytes hands back a blob', async ({ page }) => {
    await open(page, '?render=css');
    const resolved = await page.evaluate(async () => {
      const { ZayaBook } = await import('/engine-next/index.js');
      const bytes = await (await fetch('/tests/fixtures/sample.pdf')).arrayBuffer();
      const host = document.createElement('div');
      host.style.width = '600px';
      host.style.height = '400px';
      document.body.appendChild(host);
      const book = ZayaBook.create(host, bytes, { renderMode: 'css' });
      await book.ready;
      const out = await book.download();
      const size = (await (await fetch(out.url)).blob()).size;
      out.revoke();
      book.dispose();
      host.remove();
      return { url: out.url, name: out.name, size };
    });
    expect(resolved.url.startsWith('blob:')).toBe(true);
    expect(resolved.name).toBe('document.pdf');
    expect(resolved.size).toBeGreaterThan(500);
  });

  test('share is this address with the open page on it', async ({ page }) => {
    await open(page, '?render=css');
    expect(await page.evaluate(() => window.zayaDemo.book.share())).toContain('page=1');
    await page.evaluate(() => window.zayaDemo.book.gotoPage(3));
    const shared = await page.evaluate(() => window.zayaDemo.book.share());
    expect(shared).toContain('page=3');
    expect(shared).not.toContain('page=1');
  });

  test('setInteractive lets the stage go and takes it back', async ({ page }) => {
    await open(page, '?render=css&duration=60');
    const box = await page.locator('#book').boundingBox();
    await page.evaluate(() => window.zayaDemo.book.setInteractive(false));
    expect(await page.evaluate(() => window.zayaDemo.book.interactive)).toBe(false);
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
    expect((await state(page)).activePage).toBe(1);

    await page.evaluate(() => window.zayaDemo.book.setInteractive(true));
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
    await expect.poll(async () => (await state(page)).activePage).toBe(2);
  });

  test('setSoundEnabled is remembered and reported', async ({ page }) => {
    await open(page, '?render=css');
    expect(await page.evaluate(() => window.zayaDemo.book.soundEnabled)).toBe(false);
    await page.evaluate(() => window.zayaDemo.book.setSoundEnabled(true));
    expect(await page.evaluate(() => window.zayaDemo.book.soundEnabled)).toBe(true);
  });

  test('resize re-fits the book after the stage changes size', async ({ page }) => {
    await open(page, '?render=css');
    const before = await page.evaluate(() => window.zayaDemo.book.renderer.fitSize());
    await page.setViewportSize({ width: 900, height: 620 });
    await page.evaluate(() => window.zayaDemo.book.resize());
    await expect.poll(async () => {
      const after = await page.evaluate(() => window.zayaDemo.book.renderer.fitSize());
      return after.width < before.width;
    }).toBe(true);
    await samples(page);
  });
});

/* -------------------------------------------------------------------------------------------
 * The drag preview
 * ---------------------------------------------------------------------------------------- */

for (const renderMode of ['webgl', 'css']) {
  test.describe(`${renderMode} drag`, () => {
    const q = `?render=${renderMode}&duration=200`;

    test('the sheet follows the pointer and settles forward when let go past halfway', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, q);
      const box = await page.locator('#book').boundingBox();
      const y = box.y + box.height / 2;

      await page.mouse.move(box.x + box.width * 0.9, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, y, { steps: 5 });
      // A sheet is in flight under the pointer before the drag is over.
      await expect.poll(async () => page.evaluate(() => !!window.zayaDemo.book.dragTurn)).toBe(true);
      const quarter = await page.evaluate(() => window.zayaDemo.book.dragTurn.progress);
      await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
      const most = await page.evaluate(() => window.zayaDemo.book.dragTurn.progress);
      expect(most).toBeGreaterThan(quarter);
      expect(most).toBeGreaterThan(0.5);

      await page.mouse.up();
      await expect.poll(async () => (await state(page)).activePage).toBe(2);
      expect(await page.evaluate(() => !!window.zayaDemo.book.dragTurn)).toBe(false);
      expect(errors).toEqual([]);
    });

    test('a sheet let go short of halfway falls back where it came from', async ({ page }) => {
      await open(page, q);
      const box = await page.locator('#book').boundingBox();
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width * 0.9, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.85, y, { steps: 4 });
      await expect.poll(async () => page.evaluate(() => !!window.zayaDemo.book.dragTurn)).toBe(true);
      await page.mouse.up();
      // The page it was on, still, and the engine free to take another drag.
      await expect.poll(async () => page.evaluate(() => window.zayaDemo.book.busy)).toBe(false);
      expect((await state(page)).activePage).toBe(1);
    });

    test('dragging the near edge turns backwards', async ({ page }) => {
      await open(page, `${q}&page=2`);
      const box = await page.locator('#book').boundingBox();
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width * 0.15, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, y, { steps: 6 });
      await expect.poll(async () => page.evaluate(() => !!window.zayaDemo.book.dragTurn)).toBe(true);
      await page.mouse.up();
      await expect.poll(async () => (await state(page)).activePage).toBe(1);
    });
  });
}

/* -------------------------------------------------------------------------------------------
 * A scan of an open book: one PDF page, two book pages
 * ---------------------------------------------------------------------------------------- */

test.describe('doubleInternal', () => {
  const SCAN = '?render=css&internal=1&pdf=../tests/fixtures/sample-double-internal.pdf';

  test('a four-page scan is a seven-page book', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, SCAN);
    const mapped = await page.evaluate(() => {
      const b = window.zayaDemo.book;
      const rows = [];
      for (let p = 1; p <= b.pageCount; p++) {
        rows.push([p, b.pdfPageForBookPage(p), b.layout.halfForBookPage(p)]);
      }
      return { pageCount: b.pageCount, rows, aspect: b.pageAspect };
    });
    // Four PDF pages: the first is the cover pair, and each of the rest carries two leaves.
    expect(mapped.pageCount).toBe(7);
    expect(mapped.rows).toEqual([
      [1, 1, null], [2, 2, null], [3, 2, 'right'],
      [4, 3, 'left'], [5, 3, 'right'], [6, 4, 'left'], [7, 4, 'right'],
    ]);
    // A book page is half of a landscape scan, so it is taller than it is wide.
    expect(mapped.aspect).toBeLessThan(1);
    expect(mapped.aspect).toBeCloseTo(595 / 842, 1);
    expect(errors).toEqual([]);
  });

  test('the two halves of one scanned page are drawn as two pages', async ({ page }) => {
    await open(page, SCAN);
    await page.evaluate(() => window.zayaDemo.book.gotoPage(4));
    await expect.poll(async () => (await state(page)).activePage).toBe(4);
    // Both book pages come off PDF page 3, so the spread lists it once.
    expect((await state(page)).pdfPages).toEqual([3]);

    const drawn = await samples(page);
    expect(drawn.length).toBe(2);
    for (const canvas of drawn) {
      expect(canvas.width).toBeLessThan(canvas.height);   // cut in half, then portrait
      expect(canvas.colours).toBeGreaterThan(3);
    }
    // The halves are different pictures: the fixture tints the left one.
    expect(Math.abs(drawn[0].mean - drawn[1].mean)).toBeGreaterThan(1);
  });

  test('a search hit on a scanned page turns to the left of the two leaves it carries', async ({ page }) => {
    await open(page, SCAN);
    expect(await page.evaluate(() => [1, 2, 3, 4].map((p) => window.zayaDemo.book.bookPageForPdfPage(p))))
      .toEqual([1, 2, 4, 6]);
  });

  test('the text layer covers each half of a scanned page separately', async ({ page }) => {
    await open(page, SCAN);
    await page.evaluate(() => window.zayaDemo.book.gotoPage(4));
    await expect.poll(async () => (await spans(page)).length, { timeout: 15_000 }).toBeGreaterThan(1);
    const runs = await spans(page);
    expect(runs.some((r) => r.text.includes('Leaf five'))).toBe(true);
    expect(runs.some((r) => r.text.includes('Leaf six'))).toBe(true);
    // Each half's own text sits over that half: the layer is the width of one book page, and
    // the run belonging to it falls inside. The other half's runs are slid out of the window
    // and clipped away, which is what `overflow: hidden` on the layer is for.
    const placed = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('.zn-textlayer')];
      const where = (index, needle) => {
        const host = layers[index];
        const span = [...host.querySelectorAll('span')].find((s) => s.textContent.includes(needle));
        const layer = host.getBoundingClientRect();
        const rect = span.getBoundingClientRect();
        return {
          inside: rect.left >= layer.left - 2 && rect.right <= layer.right + 2,
          clipped: getComputedStyle(host).overflow === 'hidden',
          layerLeft: Math.round(layer.left),
        };
      };
      return { five: where(0, 'Leaf five'), six: where(1, 'Leaf six') };
    });
    expect(placed.five).toMatchObject({ inside: true, clipped: true });
    expect(placed.six).toMatchObject({ inside: true, clipped: true });
    // The two halves are two separate layers, side by side.
    expect(placed.six.layerLeft).toBeGreaterThan(placed.five.layerLeft);
  });
});
