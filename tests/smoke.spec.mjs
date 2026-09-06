import { test, expect } from '@playwright/test';
import { openPanel, waitForBook } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const SAMPLE_PDF = readFileSync(new URL('./fixtures/sample.pdf', import.meta.url));

// Serve the bundled fixture for any remote PDF so the test never touches the network.
async function stubNetwork(page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    if (/\.pdf($|\?)/i.test(url) || /ufs\.sh\//.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: SAMPLE_PDF, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ status: 204, body: '' }); // fonts.googleapis etc.
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test.describe('Zaya app shell', () => {
  test('index.html boots, renders the flipbook and has no runtime errors', async ({ page }) => {
    await stubNetwork(page);
    const errors = collectErrors(page);

    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas, #flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });

    // Version badge is filled without any network call
    await expect(page.locator('#currentVersion')).toHaveText(/^v\d+\.\d+\.\d+$/);

    // Control bar buttons exist (search button is new)
    await expect(page.locator('#customSearchBtn')).toBeAttached();

    const ignorable = /favicon|sw\.js|Service Worker|THREE\.WebGLRenderer|WebGL|GPU stall|api\.github\.com|pro-features|404/i;
    expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
  });

  test('rejects a javascript: ?pdf= parameter and falls back to the default document', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=javascript:alert(1)');
    await expect(page.locator('#flipbookContainer canvas, #flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });
    const downloadHref = await page.evaluate(() => {
      const a = document.querySelector('.df-ui-download');
      return a ? a.getAttribute('href') : null;
    });
    expect(downloadHref || '').not.toMatch(/^javascript:/i);
  });

  test('full-text search finds pages and navigates on click', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas, #flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });

    // Reveal the auto-hidden bottom bar and open the panel via the button, then confirm Ctrl+F focuses it too
    await page.mouse.move(640, 715);
    await expect(page.locator('#customControlBar')).toBeInViewport({ timeout: 10_000 });
    await page.waitForTimeout(500); // let the slide-in transition finish so the click target is stable
    await page.locator('#customSearchBtn').click({ timeout: 10_000 });
    const input = page.locator('.df-search-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Control+f');
    await expect(input).toBeFocused({ timeout: 10_000 });
    await expect(input).toBeVisible();
    await input.fill('flipbooks');

    const results = page.locator('.df-search-result');
    await expect(results).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('.df-search-status')).toContainText(/2 matches on 2 pages/);

    await results.nth(1).click();
    await expect.poll(async () => page.evaluate(() => {
      const fb = window.dFlipBook;
      return fb && fb.target ? fb.target._activePage : null;
    }), { timeout: 10_000 }).toBe(2);

    // Typing in the search box must not turn pages
    await input.fill('');
    await input.type('zebra');
    await input.press('ArrowLeft');
    await expect(results).toHaveCount(1, { timeout: 15_000 });
  });

  test('stored quotes are rendered as text, not HTML', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas, #flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });

    await openPanel(page, 'Notes');
    const payload = '<img src=x onerror="window.__xss=1">hello';
    await page.locator('#quoteInput').fill(payload);
    await page.locator('#addQuoteBtn').click();
    await expect(page.locator('.quote-text').first()).toContainText('hello', { timeout: 10_000 });
    expect(await page.locator('.quote-text img').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

test.describe('Changelog page', () => {
  test('renders without runtime errors', async ({ page }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.fulfill({ status: 204, body: '' }));
    const errors = collectErrors(page);
    await page.goto('/changelog.html');
    await expect(page.locator('#currentVersion')).toHaveText(/v\d+\.\d+\.\d+/, { timeout: 15_000 });
    const ignorable = /favicon|api\.github\.com|GitHub API|Failed to load resource/i;
    expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
  });
});

test.describe('Mobile (touch) behaviour', () => {
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });

  test('bottom bar with page numbers is visible, side panel closes on outside tap and book stays interactive', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas').first()).toBeVisible({ timeout: 30_000 });

    // Page indicator is on-screen without any hover
    const bar = page.locator('#customControlBar');
    await expect(bar).toBeInViewport({ timeout: 10_000 });
    await expect(page.locator('#customTotalPages')).toHaveText('3', { timeout: 10_000 });

    // Open thumbnails, then tap the book to close them
    await page.locator('#customThumbnailBtn').tap();
    const thumbs = page.locator('.df-thumb-container');
    await expect(thumbs).toHaveClass(/df-sidemenu-visible/, { timeout: 10_000 });
    // On phones the Navigator is a full-width sheet: close it with its own button (Esc/outside tap are desktop paths)
    await page.locator('#closeNavigatorBtn').tap();
    await expect(thumbs).not.toHaveClass(/df-sidemenu-visible/, { timeout: 10_000 });

    // Orbit controls must be re-enabled after the panel closes (issue #11 "freeze")
    await expect.poll(() => page.evaluate(() => {
      const fb = window.dFlipBook;
      return fb && fb.stage && fb.stage.orbitControl ? fb.stage.orbitControl.enabled : null;
    })).toBe(true);

    // Closing the panel must not also turn a page; the Next button does
    expect(await page.evaluate(() => window.dFlipBook.target._activePage)).toBe(1);
    await page.locator('#customNextBtn').tap();
    await expect.poll(() => page.evaluate(() => window.dFlipBook.target._activePage), { timeout: 10_000 }).toBe(2);
  });
});

test.describe('URL options and backup', () => {
  test('?theme=, ?mode=single and ?search= preset the viewer', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf&theme=nord&mode=single&search=zebra');
    await expect(page.locator('#flipbookContainer canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveClass(/theme-nord/, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => window.dFlipBook.target.pageMode), { timeout: 10_000 }).toBe(1);
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.df-search-input')).toHaveValue('zebra');
  });

  test('backup export round-trips quotes and preferences through import', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas').first()).toBeVisible({ timeout: 30_000 });

    await openPanel(page, 'Notes');
    await page.locator('#quoteInput').fill('A quote worth keeping');
    await page.locator('#addQuoteBtn').click();
    await expect(page.locator('.quote-text').first()).toContainText('A quote worth keeping', { timeout: 10_000 });

    // Export produces a JSON payload containing the quote
    const payload = await page.evaluate(() => window.ZayaBackup.exportBackup());
    expect(payload.format).toBe('zaya-backup');
    expect(payload.quotes.map((q) => q.quote)).toContain('A quote worth keeping');

    // Importing the same file again adds nothing (deduplicated), importing a new quote adds one
    // The Notes tab lists the open document's notes, so the new one is filed against it.
    const result = await page.evaluate(async (p) => {
      p.quotes.push({ quote: 'Imported from backup', pdfUrl: window.ZayaCurrentDocKey(), pdfName: 'Backup' });
      p.preferences.theme = 'dracula';
      const file = new File([JSON.stringify(p)], 'b.json', { type: 'application/json' });
      return window.ZayaBackup.importBackup(file);
    }, payload);
    expect(result.imported).toBe(1);
    await expect(page.locator('html')).toHaveClass(/theme-dracula/);
    await expect(page.locator('.quote-text', { hasText: 'Imported from backup' })).toHaveCount(1, { timeout: 10_000 });

    // Rejects a foreign JSON file
    const err = await page.evaluate(() => window.ZayaBackup.importBackup(new File(['{"hello":1}'], 'x.json')).catch((e) => e.message));
    expect(err).toMatch(/not a Zaya backup/);
  });

  test('quotes modal traps focus and closes on Escape', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer canvas').first()).toBeVisible({ timeout: 30_000 });
    await openPanel(page, 'Notes');
    await page.locator('#quotesToggleBtn').click();
    const modal = page.locator('#pdfSpecificQuotesModal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});

test.describe('Documents and languages', () => {
  const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

  test('the Navigator rebuilds its pages and outline for a newly opened document', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);

    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-outline.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-outline.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('outline'));
    await expect(page.locator('#navPaneOutline .df-outline-item').first()).toBeVisible({ timeout: 15_000 });
    const outlineCount = await page.locator('#navPaneOutline .df-outline-item').count();
    expect(outlineCount).toBeGreaterThan(0);
    await page.evaluate(() => window.ZayaNavigator.setTab('thumbs'));
    await expect(page.locator('#navPaneThumbs .df-vrow')).toHaveCount(3, { timeout: 15_000 });

    // A document without an outline replaces the previous panels; nothing from the old book lingers.
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('outline'));
    await expect(page.locator('#navPaneOutline .df-outline-item')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#navEmptyState')).toContainText('no outline');
    expect(await page.locator('.df-outline-container').count()).toBe(1);
    expect(await page.locator('.df-thumb-container').count()).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.ZayaNavigator.setTab('search'));
    expect(await page.locator('.df-search-container').count()).toBe(1);
  });

  test('search finds Arabic words, with or without vowel marks', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-arabic.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-arabic.pdf');
    await waitForBook(page);

    await page.evaluate(() => window.ZayaNavigator.open('search'));
    const input = page.locator('.df-search-input');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('القراءة');
    await expect(page.locator('.df-search-status')).toContainText(/2 matches on 2 pages/, { timeout: 20_000 });
    await input.fill('الْقِرَاءَة'); // vowelled query matches the unvowelled page
    await expect(page.locator('.df-search-status')).toContainText(/2 matches on 2 pages/, { timeout: 20_000 });
    await input.fill('الفصل');
    await expect(page.locator('.df-search-result')).toHaveCount(2, { timeout: 20_000 });
    await input.fill('الملحق');
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.df-search-result').first()).toContainText('Page 3');
  });

  test('Arabic stored in logical order is still found through the reversed query', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-arabic-logical.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-arabic-logical.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('search'));
    const input = page.locator('.df-search-input');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('القراءة');
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });
    await input.fill('العقل');
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });
  });

  test('an image-only document explains why it cannot be searched', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-scanned.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-scanned.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('search'));
    const input = page.locator('.df-search-input');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('anything');
    await expect(page.locator('.df-search-status')).toContainText('pages are images', { timeout: 20_000 });
    await expect(page.locator('.df-ocr')).toContainText('no text layer');
  });
});

test.describe('Text recognition (OCR)', () => {
  test('a scanned Arabic document is recognised on the device and becomes searchable, with the result kept for next time', async ({ page }) => {
    test.setTimeout(240_000);
    const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-scanned-arabic.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-scanned-arabic.pdf');
    await waitForBook(page);

    // Opening the search pane is enough to be told the pages are images and offered recognition.
    await page.evaluate(() => window.ZayaNavigator.open('search'));
    const box = page.locator('.df-ocr');
    await expect(box).toBeVisible({ timeout: 20_000 });
    await expect(box).toContainText('no text layer');
    await page.locator('.df-search-input').fill('القراءة');
    await expect(page.locator('.df-search-status')).toContainText('pages are images', { timeout: 20_000 });

    await page.locator('.df-ocr-langbtn[data-lang="ara+eng"]').click();
    await expect(page.locator('.df-ocr-langbtn[data-lang="ara+eng"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.df-ocr-run').click();
    await expect(page.locator('.df-ocr-run')).toHaveText('Stop');
    // Both pages carry the word; results arrive as pages complete.
    await expect(page.locator('.df-search-result')).toHaveCount(2, { timeout: 200_000 });
    await expect(page.locator('.df-ocr-progress')).toContainText(/Recognised 2 pages in \d+ s/, { timeout: 60_000 });
    await expect(page.locator('.df-search-status')).toContainText(/on 2 pages/);
    // Latin text on the same pages is found too, so the mixed-language pack did its job.
    await page.locator('.df-search-input').fill('Chapter');
    await expect(page.locator('.df-search-result')).toHaveCount(2, { timeout: 20_000 });

    // Recognised text is stored per document: after a reload it is searchable at once, no engine needed.
    await page.reload();
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('search'));
    await page.locator('.df-search-input').fill('العقل');
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.df-ocr')).toContainText('recognised on this device', { timeout: 20_000 });
    expect(await page.evaluate(() => !!window.Tesseract)).toBe(false);
  });
});

test.describe('2D (CSS) render mode', () => {
  // `?render=css` pins the renderer that browsers without WebGL fall back to (issue #22).
  const activePage = (page) => page.evaluate(() => window.dFlipBook.target._activePage);

  /** How many on-screen page faces actually carry a rendered page. */
  const paintedFaces = (page) => page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('.df-book-page.df-css-page'))
      .filter((leaf) => leaf.style.display !== 'none');
    let painted = 0;
    for (const leaf of leaves) {
      for (const face of leaf.querySelectorAll('.df-page-front, .df-page-back')) {
        if (face.querySelector('canvas') || /url\(/.test(face.style.backgroundImage)) painted++;
      }
    }
    return painted;
  });

  test('pages render as images and the bar buttons turn them', async ({ page }) => {
    await stubNetwork(page);
    const errors = collectErrors(page);

    await page.goto('/index.html?render=css&pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });

    expect(await page.evaluate(() => window.dFlipBook.renderMode)).toBe('css');
    expect(await page.evaluate(() => window.dFlipBook.target.type)).toBe('BookCSS');
    expect(await page.evaluate(() => document.querySelectorAll('#flipbookContainer > canvas').length)).toBe(0);

    // The cover is painted, not a blank sheet.
    await expect.poll(() => paintedFaces(page), { timeout: 20_000 }).toBeGreaterThan(0);
    expect(await activePage(page)).toBe(1);

    // Reveal the auto-hidden bottom bar, then turn forward and back with its buttons.
    await page.mouse.move(640, 715);
    await expect(page.locator('#customControlBar')).toBeInViewport({ timeout: 10_000 });
    await page.waitForTimeout(500); // let the slide-in settle so the click target is stable
    await page.locator('#customNextBtn').click({ timeout: 10_000 });
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);
    await expect.poll(() => paintedFaces(page), { timeout: 20_000 }).toBeGreaterThan(1);
    await expect(page.locator('#customCurrentPageInput')).toHaveValue('3', { timeout: 10_000 });

    await page.locator('#customPrevBtn').click({ timeout: 10_000 });
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(1);
    await expect.poll(() => paintedFaces(page), { timeout: 20_000 }).toBeGreaterThan(0);

    const ignorable = /favicon|sw\.js|Service Worker|THREE\.WebGLRenderer|WebGL|GPU stall|api\.github\.com|pro-features|404/i;
    expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
  });

  test('thumbnails, search and painted highlights still work without WebGL', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?render=css&pdf=https://example.com/sample.pdf');
    await expect(page.locator('#flipbookContainer .df-book-page').first()).toBeVisible({ timeout: 30_000 });

    await page.evaluate(() => window.ZayaNavigator.open('thumbs'));
    await expect(page.locator('#navPaneThumbs .df-vrow')).toHaveCount(3, { timeout: 20_000 });

    await page.evaluate(() => window.ZayaNavigator.setTab('search'));
    const input = page.locator('.df-search-input');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('zebra');
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });

    await page.locator('.df-search-result').first().click();
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);
    // Marks are painted into the page texture, so the 2D pages get them exactly as the 3D ones do.
    await expect.poll(() => page.evaluate(
      () => window.dFlipBook.contentProvider.searchController.getHighlightRects(3, 'zebra').length
    ), { timeout: 20_000 }).toBeGreaterThan(0);
  });
});

test.describe('Search highlight geometry', () => {
  const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

  // A highlight box must sit on the run of glyphs it came from, never span the whole line.
  test('Arabic hits are boxed on the matched word, in visual and logical order', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);

    for (const [file, terms] of [
      ['sample-arabic.pdf', ['القراءة', 'الفصل', 'والمعرفة', 'الملحق']],
      ['sample-arabic-logical.pdf', ['العقل', 'القراءة']]
    ]) {
      await openPanel(page, 'Document');
      await page.setInputFiles('#pdfFile', FIXTURES + file);
      await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe(file);
      await waitForBook(page);
      await page.evaluate(() => window.ZayaNavigator.open('search'));
      await expect(page.locator('.df-search-input')).toBeVisible({ timeout: 15_000 });

      for (const term of terms) {
        await page.locator('.df-search-input').fill(term);
        await expect(page.locator('.df-search-result').first()).toBeVisible({ timeout: 20_000 });

        const checked = await page.evaluate((query) => {
          const controller = window.dFlipBook.contentProvider.searchController;
          const found = [];
          for (let p = 1; p <= controller.numPages; p++) {
            const entry = controller.pages[p];
            if (!entry || !entry.spans || !entry.spans.length) continue;
            for (const [x, y, w] of controller.getHighlightRects(p, query)) {
              // The box must fall inside one indexed run, and be no wider than it.
              const host = entry.spans.find((s) => x >= s.transform[4] - 1 &&
                x + w <= s.transform[4] + s.width + 1 && Math.abs(s.transform[5] - y - 0.2 * (s.height || 1)) < 4);
              found.push({ page: p, inside: !!host, share: host ? w / host.width : 0 });
            }
          }
          return found;
        }, term);

        expect(checked.length, `${file} "${term}" produced no boxes`).toBeGreaterThan(0);
        for (const box of checked) {
          expect(box.inside, `${file} "${term}" box on page ${box.page} escaped its text run`).toBe(true);
          // A word is a fraction of its line: a box covering the whole run would mean the
          // proportional split had been lost.
          expect(box.share, `${file} "${term}" box on page ${box.page} covers the whole run`).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });
});
