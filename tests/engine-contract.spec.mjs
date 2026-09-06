/**
 * The engine contract (issue #21, step E1).
 *
 * Every member `docs/engine-api.md` marks KEEP is exercised here through `window.ZayaBook` and
 * nothing else. The assertions are about behaviour -- pages turn, mappings hold, teardown leaves
 * no stage behind -- never about the shapes of whatever draws the pages, so a clean-room engine
 * can be pointed at this same file and told to make it pass.
 *
 * The one exception is the leak check, which counts stage elements by class name because a leaked
 * stage has no API to ask. It reads them from `ZayaBook.stageSelector` (published by the facade
 * for exactly this reason), so a replacement engine names its own.
 */
import { test, expect } from '@playwright/test';
import { stubNetwork, collectErrors } from './helpers.mjs';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

/** Wait until a document is open and its pages can be turned, asking only the facade. */
async function ready(page) {
  await expect
    .poll(() => page.evaluate(() => !!(window.ZayaBook && window.ZayaBook.isReady)), { timeout: 30_000 })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.ZayaBook.current.pageCount), { timeout: 30_000 })
    .toBeGreaterThan(0);
}

/** Read a set of properties off the open book in one round trip. */
function stateOf(page) {
  return page.evaluate(() => {
    const b = window.ZayaBook.current;
    return {
      activePage: b.activePage,
      pageCount: b.pageCount,
      pageMode: b.pageMode,
      direction: b.direction,
      renderMode: b.renderMode,
      hardCover: b.hardCover,
      source: b.source,
      soundEnabled: b.soundEnabled,
      isReady: b.isReady(),
      disposed: b.disposed,
      visiblePdfPages: b.visiblePdfPages()
    };
  });
}

const activePage = (page) => page.evaluate(() => window.ZayaBook.current.activePage);

/** Open a fixture through the app's own file picker and wait for it. */
async function openFixture(page, name) {
  const panel = page.locator('#unifiedPanel');
  if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
    await page.locator('#toggleUnifiedPanelBtn').click();
  }
  const tab = page.locator('#panelTabDocument');
  if (await tab.count()) await tab.click();
  await page.setInputFiles('#pdfFile', FIXTURES + name);
  await expect
    .poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 25_000 })
    .toBe(name);
  await ready(page);
}

test.describe('ZayaBook contract', () => {
  test('the facade is the app-facing surface and reports the open document', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    const shape = await page.evaluate(() => {
      const api = window.ZayaBook;
      const b = api.current;
      const kind = (name) => typeof b[name];
      return {
        namespace: ['create', 'current', 'isReady', 'dispose'].every((k) => k in api),
        createIsFunction: typeof api.create === 'function',
        methods: ['gotoPage', 'next', 'prev', 'first', 'last', 'setPageMode', 'toBookPage', 'toPdfPage',
          'visiblePdfPages', 'ensureSearch', 'setSearchHighlight', 'drawSearchHighlights',
          'refreshVisiblePages', 'ensurePanel', 'panel', 'setPanelActive', 'searchInput', 'openSearch',
          'updateUi', 'toggleFullscreen', 'share', 'download', 'zoom', 'resize', 'setInteractive',
          'setSoundEnabled', 'dispose', 'isReady'].map(kind),
        properties: ['source', 'renderMode', 'hardCover', 'activePage', 'pageCount', 'pageMode',
          'direction', 'pdfDocument', 'spreadPerPdfPage', 'searchController', 'soundEnabled',
          'interactive', 'disposed'].filter((k) => !(k in b))
      };
    });
    expect(shape.namespace).toBe(true);
    expect(shape.createIsFunction).toBe(true);
    expect(shape.methods.every((t) => t === 'function')).toBe(true);
    expect(shape.properties).toEqual([]);

    const state = await stateOf(page);
    expect(state.pageCount).toBe(3);
    expect(state.activePage).toBe(1);
    expect(state.pageMode).toBe('double');
    expect(state.direction).toBe('ltr');
    expect(state.hardCover).toBe('none');
    expect(state.isReady).toBe(true);
    expect(state.disposed).toBe(false);
    expect(String(state.source)).toContain('sample.pdf');
    expect(['webgl', 'css']).toContain(state.renderMode);

    // The pdf.js proxy is the document itself, and agrees with the book about its length.
    expect(await page.evaluate(() => window.ZayaBook.current.pdfDocument.numPages)).toBe(3);
  });

  test('navigation turns pages and the page-change event follows', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    // Every page turn is announced on `document` as zaya:pageChanged.
    await page.evaluate(() => {
      window.__pages = [];
      document.addEventListener('zaya:pageChanged', (e) => window.__pages.push(e.detail.page));
    });

    expect(await page.evaluate(() => window.ZayaBook.current.gotoPage(3))).toBeGreaterThan(0);
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);

    await page.evaluate(() => window.ZayaBook.current.prev());
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(1);

    await page.evaluate(() => window.ZayaBook.current.next());
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);

    await page.evaluate(() => window.ZayaBook.current.first());
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(1);

    await page.evaluate(() => window.ZayaBook.current.last());
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBeGreaterThan(1);

    // A page beyond the end is clamped rather than accepted.
    await page.evaluate(() => window.ZayaBook.current.gotoPage(9999));
    await expect
      .poll(() => page.evaluate(() => window.ZayaBook.current.activePage <= window.ZayaBook.current.pageCount))
      .toBe(true);

    await expect.poll(() => page.evaluate(() => window.__pages.length), { timeout: 15_000 }).toBeGreaterThan(1);
  });

  test('page mode switches and the pdf-to-book mapping holds in both modes', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    // Double mode: the spread is the even page and the odd one after it.
    await page.evaluate(() => window.ZayaBook.current.gotoPage(2));
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(2);
    let state = await stateOf(page);
    expect(state.pageMode).toBe('double');
    expect(state.visiblePdfPages).toEqual([2, 3]);

    expect(await page.evaluate(() => window.ZayaBook.current.setPageMode(true, true))).toBe('single');
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current.pageMode), { timeout: 15_000 }).toBe('single');
    state = await stateOf(page);
    expect(state.visiblePdfPages).toEqual([state.activePage]);

    expect(await page.evaluate(() => window.ZayaBook.current.setPageMode(false, true))).toBe('double');
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current.pageMode), { timeout: 15_000 }).toBe('double');

    // A document laid out one page per sheet maps book pages and PDF pages one to one, both ways.
    const mapping = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      const rows = [];
      for (let n = 1; n <= b.pageCount; n++) rows.push([n, b.toPdfPage(n), b.toBookPage(b.toPdfPage(n))]);
      return { spread: b.spreadPerPdfPage, rows };
    });
    expect(mapping.spread).toBe(false);
    for (const [book, pdf, back] of mapping.rows) {
      expect(pdf).toBe(book);
      expect(back).toBe(book);
    }

    // The mapping is a total function: it never leaves the document, whatever it is handed.
    const edges = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      return [0, -3, 1.5, NaN, b.pageCount + 50].map((n) => [b.toPdfPage(n), b.toBookPage(n)]);
    });
    for (const [pdf, book] of edges) {
      expect(pdf).toBeGreaterThanOrEqual(1);
      expect(book).toBeGreaterThanOrEqual(1);
    }
  });

  test('right-to-left is reported and survives a reopen on the same page', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf&rtl=1');
    await ready(page);
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current.direction), { timeout: 25_000 }).toBe('rtl');

    // An Arabic document reads the same way; the direction is the app's, not the document's.
    await openFixture(page, 'sample-arabic.pdf');
    expect((await stateOf(page)).direction).toBe('rtl');

    // Toggling back reopens the book, on the page it was left at.
    await page.evaluate(() => window.ZayaBook.current.gotoPage(2));
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(2);
    await page.evaluate(() => window.appState.set({ isRTL: false }));
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current && window.ZayaBook.current.direction), { timeout: 30_000 }).toBe('ltr');
    await ready(page);
    expect(await activePage(page)).toBeGreaterThan(1);
  });

  test('the outline and thumbnail panels are built on demand and rebuilt per document', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await ready(page);
    await openFixture(page, 'sample-outline.pdf');

    const panels = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      const before = { thumbs: !!b.panel('thumbs'), outline: !!b.panel('outline') };
      const built = { thumbs: !!b.ensurePanel('thumbs'), outline: !!b.ensurePanel('outline'), search: !!b.ensurePanel('search') };
      // Asking twice must not build a second one.
      b.ensurePanel('thumbs');
      b.ensurePanel('outline');
      return { before, built, unknown: b.ensurePanel('nonsense') };
    });
    expect(panels.built.thumbs).toBe(true);
    expect(panels.built.outline).toBe(true);
    expect(panels.built.search).toBe(true);
    expect(panels.unknown).toBe(null);

    // One panel of each kind, wherever the app has re-parented it.
    const counts = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      return ['thumbs', 'outline', 'search'].map((name) => document.querySelectorAll(
        b.panel(name) ? b.panel(name).className.split(/\s+/).filter(Boolean).map((c) => '.' + c).join('') : ':not(*)'
      ).length);
    });
    for (const n of counts) expect(n).toBe(1);

    // A document with no outline replaces the panels rather than keeping the old ones.
    await openFixture(page, 'sample.pdf');
    await page.evaluate(() => window.ZayaBook.current.ensurePanel('outline'));
    expect(await page.locator('.df-outline-container').count()).toBe(1);
  });

  test('search: the controller indexes, highlights repaint and marks are drawable', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    // ensureSearch is idempotent and hands back the same controller.
    const same = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      const first = b.ensureSearch();
      return !!first && first === b.ensureSearch() && first === b.searchController;
    });
    expect(same).toBe(true);

    await page.evaluate(() => window.ZayaBook.current.searchController.index());
    await expect
      .poll(() => page.evaluate(() => window.ZayaBook.current.searchController.getHighlightRects(3, 'zebra').length), { timeout: 25_000 })
      .toBeGreaterThan(0);

    // Setting a query repaints the visible pages, and clearing it repaints them again.
    await page.evaluate(() => {
      const b = window.ZayaBook.current;
      b.setSearchHighlight('zebra');
      b.refreshVisiblePages();
    });
    await page.evaluate(() => window.ZayaBook.current.gotoPage(3));
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);

    // The marks a printed sheet carries are drawn through the same call, onto any 2D context.
    const painted = await page.evaluate(async () => {
      const b = window.ZayaBook.current;
      const pdfPage = await b.pdfDocument.getPage(3);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      const withQuery = b.drawSearchHighlights(ctx, viewport, 3);
      b.setSearchHighlight('');
      const withoutQuery = b.drawSearchHighlights(ctx, viewport, 3);
      return { withQuery, withoutQuery };
    });
    expect(painted.withQuery).toBe(true);
    expect(painted.withoutQuery).toBe(false);

    // openSearch fills the panel's own field, whichever module built it.
    await page.evaluate(() => window.ZayaBook.current.openSearch('zebra'));
    await expect
      .poll(() => page.evaluate(() => { const i = window.ZayaBook.current.searchInput(); return i ? i.value : null; }), { timeout: 15_000 })
      .toBe('zebra');
  });

  test('sound, zoom, resize and the chrome hooks are all callable', async ({ page }) => {
    await stubNetwork(page);
    const errors = collectErrors(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    const sound = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      b.setSoundEnabled(false);
      const off = b.soundEnabled;
      b.setSoundEnabled(true);
      return { off, on: b.soundEnabled };
    });
    expect(sound.off).toBe(false);
    expect(sound.on).toBe(true);

    const interactive = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      b.setInteractive(false);
      const locked = b.interactive;
      b.setInteractive(true);
      return { locked, free: b.interactive };
    });
    // A renderer with no orbiting stage reports itself interactive throughout, which is fine.
    expect(typeof interactive.locked).toBe('boolean');
    expect(interactive.free).toBe(true);

    // Zoom, resize and the panel-state hooks must be safe to call and must not throw.
    await page.evaluate(() => {
      const b = window.ZayaBook.current;
      b.zoom(1);
      b.zoom(-1);
      b.resize();
      b.updateUi(true);
      b.setPanelActive('thumbs', true);
      b.setPanelActive('thumbs', false);
      b.setPanelActive('nonsense', true);
    });
    await ready(page);
    expect(await activePage(page)).toBeGreaterThan(0);

    const ignorable = /favicon|sw\.js|Service Worker|THREE|WebGL|GPU|api\.github\.com|pro-features|404|Failed to load resource/i;
    expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
  });

  test('dispose tears the book down and leaves no stage behind', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);

    const before = await page.evaluate(() => ({
      stages: document.querySelectorAll(window.ZayaBook.stageSelector).length,
      canvases: document.querySelectorAll('#flipbookContainer canvas').length
    }));
    expect(before.stages).toBe(1);

    const after = await page.evaluate(() => {
      const b = window.ZayaBook.current;
      b.dispose();
      const twice = (() => { b.dispose(); return true; })(); // disposing twice is a no-op
      return {
        twice,
        disposed: b.disposed,
        current: window.ZayaBook.current,
        isReady: window.ZayaBook.isReady,
        // A disposed handle answers quietly instead of throwing.
        activePage: b.activePage,
        pageCount: b.pageCount,
        pdfDocument: b.pdfDocument,
        source: b.source,
        stillReady: b.isReady(),
        stages: document.querySelectorAll(window.ZayaBook.stageSelector).length,
        canvases: document.querySelectorAll('#flipbookContainer canvas').length
      };
    });
    expect(after.twice).toBe(true);
    expect(after.disposed).toBe(true);
    expect(after.current).toBe(null);
    expect(after.isReady).toBe(false);
    expect(after.activePage).toBe(1);
    expect(after.pageCount).toBe(0);
    expect(after.pdfDocument).toBe(null);
    expect(after.source).toBe(null);
    expect(after.stillReady).toBe(false);
    expect(after.stages).toBe(0);
    expect(after.canvases).toBe(0);
  });

  test('reopening a document leaves exactly one stage behind it', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await ready(page);
    const stages = () => page.evaluate(() => document.querySelectorAll(window.ZayaBook.stageSelector).length);
    expect(await stages()).toBe(1);

    await openFixture(page, 'sample-outline.pdf');
    expect(await stages()).toBe(1);
    await openFixture(page, 'sample-arabic.pdf');
    expect(await stages()).toBe(1);
    await openFixture(page, 'sample.pdf');
    expect(await stages()).toBe(1);
  });

  test('the renderer can be pinned with ?render=css and the contract is unchanged', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?render=css&pdf=https://example.com/sample.pdf');
    await ready(page);

    expect(await page.evaluate(() => window.ZayaBook.current.renderMode)).toBe('css');
    // No WebGL stage: the 2D renderer paints without one.
    expect(await page.evaluate(() => document.querySelectorAll('#flipbookContainer > canvas').length)).toBe(0);

    // Everything the contract promises still holds in the other renderer.
    const state = await stateOf(page);
    expect(state.pageCount).toBe(3);
    expect(state.pageMode).toBe('double');

    await page.evaluate(() => window.ZayaBook.current.next());
    await expect.poll(() => activePage(page), { timeout: 20_000 }).toBe(3);
    await page.evaluate(() => window.ZayaBook.current.setPageMode(true, true));
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current.pageMode), { timeout: 15_000 }).toBe('single');
    await page.evaluate(() => window.ZayaBook.current.ensureSearch().index());
    await expect
      .poll(() => page.evaluate(() => window.ZayaBook.current.searchController.getHighlightRects(3, 'zebra').length), { timeout: 25_000 })
      .toBeGreaterThan(0);
  });

  test('the stiff-page option is applied and reported at load time', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);
    expect((await stateOf(page)).hardCover).toBe('none');

    await page.evaluate(() => window.appState.setHardCover('cover'));
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current && window.ZayaBook.current.hardCover), { timeout: 30_000 }).toBe('cover');
    await ready(page);
    expect(await page.evaluate(() => document.querySelectorAll(window.ZayaBook.stageSelector).length)).toBe(1);

    await page.evaluate(() => window.appState.setHardCover('all'));
    await expect.poll(() => page.evaluate(() => window.ZayaBook.current && window.ZayaBook.current.hardCover), { timeout: 30_000 }).toBe('all');
    await ready(page);
    // The book still turns pages with stiff sheets.
    await page.evaluate(() => window.ZayaBook.current.next());
    await expect.poll(() => activePage(page), { timeout: 20_000 }).toBeGreaterThan(1);
  });

  test('the deprecated globals still point at the open book', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await ready(page);
    // Kept for one release so plugins written against them keep working; nothing in lib/ reads them.
    expect(await page.evaluate(() => !!window.dFlipBook)).toBe(true);
    expect(await page.evaluate(() => window.dFlipBook === window.flipbookInstance)).toBe(true);
  });
});
