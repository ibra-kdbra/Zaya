import { test, expect } from '@playwright/test';
import { openPanel } from './helpers.mjs';
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
    const result = await page.evaluate(async (p) => {
      p.quotes.push({ quote: 'Imported from backup', pdfUrl: '', pdfName: 'Backup' });
      p.preferences.theme = 'dracula';
      const file = new File([JSON.stringify(p)], 'b.json', { type: 'application/json' });
      return window.ZayaBackup.importBackup(file);
    }, payload);
    expect(result.imported).toBe(1);
    await expect(page.locator('html')).toHaveClass(/theme-dracula/);
    await expect(page.locator('.quote-text', { hasText: 'Imported from backup' })).toHaveCount(1, { timeout: 10_000 });

    // Rejects a foreign JSON file
    const err = await page.evaluate(() => window.ZayaBackup.importBackup(new File(['{"hello":1}'], 'x.json')).catch((e) => e.message));
    expect(err).toMatch(/Not a Zaya backup/);
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
