import { test, expect } from '@playwright/test';
import {
  stubNetwork, collectErrors, waitForBook, openPanel, activePage, goToPage, readState, wavFixture, SAMPLE_PDF_PATH
} from './helpers.mjs';

// A same-origin PDF (served by the test web server) and a stubbed remote one.
const LOCAL_URL_PDF = '/tests/fixtures/sample.pdf';
const REMOTE_PDF = 'https://example.com/sample.pdf';

const keyFor = (page, path) => page.evaluate((p) => new URL(p, location.href).href, path);

test.describe('Page memory', () => {
  test('remembers the page of a URL document and restores it on reload', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);

    const key = await keyFor(page, LOCAL_URL_PDF);
    await goToPage(page, 2, key);

    // The document is stored once, as its URL, by AppState alone.
    const state = await readState(page);
    expect(state.storedPdf).toBe(key);
    expect(state.storedType).toBe('url');
    expect(state.currentPdf).toBe(key);

    await page.reload();
    await waitForBook(page);
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(2);
  });

  test('?page= overrides the remembered page and an invalid ?page= is ignored', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    const key = await keyFor(page, LOCAL_URL_PDF);
    await goToPage(page, 2, key);

    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}&page=3`);
    await waitForBook(page);
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);

    // Junk is ignored, so the remembered page (now 3) wins again.
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}&page=not-a-number`);
    await waitForBook(page);
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);
  });

  test('toggling RTL reloads the same document on the same page', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await goToPage(page, 2, await keyFor(page, LOCAL_URL_PDF));

    await page.evaluate(() => window.appState.toggleRTL());
    await expect.poll(() => page.evaluate(() => window.flipbookInstance && window.flipbookInstance.direction), { timeout: 20_000 }).toBe(2);
    await expect.poll(() => activePage(page), { timeout: 20_000 }).toBe(2);
    expect((await readState(page)).storedRTL).toBe('true');

    // ...and the preference itself survives a reload.
    await page.reload();
    await waitForBook(page);
    expect(await page.evaluate(() => window.appState.get('isRTL'))).toBe(true);
  });

  test('each document keeps its own remembered page', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await goToPage(page, 3, await keyFor(page, LOCAL_URL_PDF));

    await page.goto(`/index.html?pdf=${REMOTE_PDF}`);
    await waitForBook(page);
    expect(await activePage(page)).toBe(1);
    await goToPage(page, 2, REMOTE_PDF);

    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await expect.poll(() => activePage(page), { timeout: 15_000 }).toBe(3);
  });
});

test.describe('Local files', () => {
  test('a local file is remembered by name, asks for a re-pick after reload and restores its page', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);

    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', SAMPLE_PDF_PATH);
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfType')), { timeout: 20_000 }).toBe('local');
    await waitForBook(page);
    await goToPage(page, 2, 'sample.pdf');

    // Stored as the filename, never as the (dead-on-reload) blob URL.
    const state = await readState(page);
    expect(state.storedPdf).toBe('sample.pdf');
    expect(state.storedType).toBe('local');

    // After a reload the blob is gone: the default document opens and the reader is prompted.
    await page.reload();
    await waitForBook(page);
    await expect(page.locator('.toastify')).toContainText('Please re-select it', { timeout: 10_000 });
    expect(await activePage(page)).toBe(1);
    // The default document keeps its own memory; the local file's page is untouched by it.
    const defaultKey = await page.evaluate(() => window.appState.constructor.getDefaultPdfUrl());
    expect(await page.evaluate((k) => window.getLastPage(k), defaultKey)).toBe(1);
    expect(await page.evaluate(() => window.getLastPage('sample.pdf'))).toBe(2);

    // Re-picking the same file restores where the reader left off.
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', SAMPLE_PDF_PATH);
    await waitForBook(page);
    await expect.poll(() => activePage(page), { timeout: 20_000 }).toBe(2);
  });

  test('switching documents disposes the book once and revokes the blob URL', async ({ page }) => {
    await stubNetwork(page);
    await page.addInitScript(() => {
      window.__revoked = [];
      const real = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => { window.__revoked.push(url); return real(url); };
    });
    const errors = collectErrors(page);

    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', SAMPLE_PDF_PATH);
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfType')), { timeout: 20_000 }).toBe('local');
    await waitForBook(page);
    const blobUrl = await page.evaluate(() => window.appState.get('currentPdf'));
    expect(blobUrl).toMatch(/^blob:/);

    // Reloading the same document (RTL toggle) must keep the blob alive.
    await page.evaluate(() => window.appState.toggleRTL());
    await expect.poll(() => page.evaluate(() => window.flipbookInstance && window.flipbookInstance.direction), { timeout: 20_000 }).toBe(2);
    expect(await page.evaluate(() => window.__revoked)).not.toContain(blobUrl);

    // Switching to another document releases it, and leaves exactly one live pdf resource.
    await page.locator('#pdfUrl').fill(REMOTE_PDF);
    await page.locator('#loadPdfUrlBtn').click();
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdf')), { timeout: 20_000 }).toBe(REMOTE_PDF);
    await expect.poll(() => page.evaluate((b) => window.__revoked.includes(b), blobUrl), { timeout: 20_000 }).toBe(true);
    expect(await page.evaluate(() =>
      Array.from(window.memoryManager.resources).filter((r) => r._resourceType === 'pdf').length)).toBe(1);
    expect(errors.filter((e) => /disposing|cleaning up/i.test(e))).toEqual([]);
  });
});

test.describe('Quotes', () => {
  test('a quote records the page it was taken on', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await goToPage(page, 2, await keyFor(page, LOCAL_URL_PDF));

    await openPanel(page, 'Notes');
    await page.locator('#quoteInput').fill('Noted on the second page');
    await page.locator('#addQuoteBtn').click();
    await expect(page.locator('.quote-item').first()).toContainText('p.2', { timeout: 10_000 });

    // Editing the text keeps the page and the document it belongs to.
    await page.locator('.editQuoteBtn').first().click();
    await expect(page.locator('#quoteInput')).toHaveValue('Noted on the second page', { timeout: 10_000 });
    await page.locator('#quoteInput').fill('Edited on another page');
    await goToPage(page, 3);
    await page.locator('#addQuoteBtn').click();
    await expect(page.locator('.quote-item').first()).toContainText('Edited on another page', { timeout: 10_000 });
    await expect(page.locator('.quote-item').first()).toContainText('p.2');
    expect(await page.locator('.quote-item').count()).toBe(1);
  });

  test('quotes filed against a local file survive a reload and reach the per-PDF modal', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', SAMPLE_PDF_PATH);
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfType')), { timeout: 20_000 }).toBe('local');
    await waitForBook(page);

    await openPanel(page, 'Notes');
    await page.locator('#quoteInput').fill('A note about the local file');
    await page.locator('#addQuoteBtn').click();
    await expect(page.locator('.quote-text').first()).toContainText('A note about the local file', { timeout: 10_000 });

    // Filed under the filename, not the blob URL that dies with the page.
    const stored = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('QuotesDB');
      req.onsuccess = () => {
        const all = req.result.transaction('quotes', 'readonly').objectStore('quotes').getAll();
        all.onsuccess = () => resolve(all.result);
      };
    }));
    expect(stored.map((q) => q.pdfUrl)).toContain('sample.pdf');

    await page.reload();
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', SAMPLE_PDF_PATH);
    await waitForBook(page);
    await openPanel(page, 'Notes');
    await page.locator('#quotesToggleBtn').click();
    await expect(page.locator('.modal-quote-text')).toContainText('A note about the local file', { timeout: 10_000 });
  });
});

test.describe('Settings and URL options', () => {
  test('a fresh profile starts with sane defaults', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    const state = await readState(page);
    expect(state.theme).toBe('default');
    expect(state.isRTL).toBe(false);
    expect(state.mediaVolume).toBe(50);
    expect(state.mediaLoop).toBe(false);
    expect(state.mediaMode).toBe('youtube');
    expect(state.currentPdfType).toBe('url');
    await expect(page.locator('html')).toHaveClass(/theme-default/);
  });

  test('theme, volume, loop and media mode survive a reload', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);

    await openPanel(page, 'Media');
    await page.locator('#switchAudioMode').click();
    await page.evaluate(() => {
      window.themeManager.setTheme('nord');
      $('#mediaLoopToggle').prop('checked', true).trigger('change');
      window.appState.setMediaVolume(23);
    });

    let state = await readState(page);
    expect(state.storedTheme).toBe('nord');
    expect(state.storedLoop).toBe('true');
    expect(state.storedVolume).toBe('23');
    expect(state.storedMode).toBe('audio');

    await page.reload();
    await waitForBook(page);
    state = await readState(page);
    expect(state.theme).toBe('nord');
    expect(state.mediaLoop).toBe(true);
    expect(state.mediaVolume).toBe(23);
    expect(state.mediaMode).toBe('audio');
    await expect(page.locator('html')).toHaveClass(/theme-nord/);
    // The theme stored in IndexedDB must not fight the one the reader picked.
    await page.waitForTimeout(500);
    await expect(page.locator('html')).toHaveClass(/theme-nord/);
    await openPanel(page, 'Media');
    await expect(page.locator('#audioInputGroup')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('localAudioPlayer').loop)).toBe(true);
  });

  test('invalid URL options are ignored and leave stored preferences alone', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}&rtl=1`);
    await waitForBook(page);
    await expect.poll(() => page.evaluate(() => window.appState.get('isRTL')), { timeout: 10_000 }).toBe(true);

    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}&theme=not-a-theme&mode=sideways&rtl=perhaps&page=0`);
    await waitForBook(page);
    await expect(page.locator('html')).toHaveClass(/theme-default/);
    expect(await page.evaluate(() => window.dFlipBook.target.pageMode)).toBe(2); // double, the default
    expect(await page.evaluate(() => window.appState.get('isRTL'))).toBe(true); // stored preference untouched
    expect(await activePage(page)).toBe(1); // page=0 clamped

    // ...and a valid value still switches it off again.
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}&rtl=0`);
    await waitForBook(page);
    await expect.poll(() => page.evaluate(() => window.appState.get('isRTL')), { timeout: 10_000 }).toBe(false);
  });

  test('an unreachable ?pdf= falls back to the default document', async ({ page }) => {
    await stubNetwork(page);
    // Registered last, so it wins for this host: the document simply is not there.
    await page.route((url) => url.hostname === 'broken.example', (route) => route.abort());
    await page.goto('/index.html?pdf=https://broken.example/missing.pdf');
    await waitForBook(page);
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdf')), { timeout: 20_000 })
      .toBe(await page.evaluate(() => window.appState.constructor.getDefaultPdfUrl()));
  });
});

test.describe('Media player', () => {
  test('YouTube URLs are validated before anything is embedded', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);

    const results = await page.evaluate(() => ['https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/playlist?list=PLabc123',
      'https://vimeo.com/12345',
      'not a url'].map((u) => window.ValidationUtils.validateYouTubeUrl(u)));
    expect(results[0]).toMatchObject({ isValid: true, videoId: 'dQw4w9WgXcQ' });
    expect(results[1]).toMatchObject({ isValid: true, videoId: 'dQw4w9WgXcQ' });
    expect(results[2]).toMatchObject({ isValid: true, playlistId: 'PLabc123' });
    expect(results[3].isValid).toBe(false);
    expect(results[4].isValid).toBe(false);

    await openPanel(page, 'Media');
    await page.locator('#youtubeUrl').fill('https://vimeo.com/12345');
    await page.locator('#loadYoutubeBtn').click();
    await expect(page.locator('.toastify')).toContainText('Not a valid YouTube URL', { timeout: 10_000 });
    expect(await page.evaluate(() => document.getElementById('youtubePlayer').getAttribute('src'))).toBe('');
  });

  test('videos and playlists build an embed URL that follows the loop toggle', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await openPanel(page, 'Media');

    await page.locator('#youtubeUrl').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('#loadYoutubeBtn').click();
    const src = page.locator('#youtubePlayer');
    await expect(src).toHaveAttribute('src', /embed\/dQw4w9WgXcQ\?autoplay=1/, { timeout: 10_000 });
    await expect(src).not.toHaveAttribute('src', /loop=1/);
    await expect(page.locator('#youtubePlayerContainer')).toBeVisible();

    // Loop on -> the next embed carries the loop params, and the choice is persisted.
    await page.evaluate(() => $('#videoMediaLoopToggle').prop('checked', true).trigger('change'));
    expect(await page.evaluate(() => localStorage.getItem('mediaLoop'))).toBe('true');
    await page.locator('#loadYoutubeBtn').click();
    await expect(src).toHaveAttribute('src', /loop=1&playlist=dQw4w9WgXcQ/, { timeout: 10_000 });

    await page.locator('#youtubeUrl').fill('https://www.youtube.com/playlist?list=PLabc123');
    await page.locator('#loadPlaylistBtn').click();
    await expect(src).toHaveAttribute('src', /videoseries\?list=PLabc123/, { timeout: 10_000 });
    await expect(page.locator('#youtubePlayerContainer')).toBeVisible();
    await expect(page.locator('#closeMediaContainer')).toBeVisible();
  });

  test('local audio plays, pauses, seeks and honours the saved volume and loop', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await openPanel(page, 'Media');
    await page.locator('#switchAudioMode').click();
    await page.evaluate(() => $('#mediaLoopToggle').prop('checked', true).trigger('change'));

    await page.setInputFiles('#localAudioFile', wavFixture(2));
    await expect(page.locator('#localAudioFileName')).toHaveText('tone.wav');
    await expect(page.locator('#customAudioPlayer')).toBeVisible();

    const audio = () => page.evaluate(() => {
      const a = document.getElementById('localAudioPlayer');
      return { src: a.getAttribute('src') || '', paused: a.paused, loop: a.loop, volume: a.volume, duration: a.duration };
    });
    await expect.poll(async () => (await audio()).duration > 0, { timeout: 10_000 }).toBe(true);
    expect((await audio()).src).toMatch(/^blob:/);
    expect((await audio()).loop).toBe(true);
    expect((await audio()).volume).toBeCloseTo(0.5, 2);

    // Play/pause button flips the state either way round (autoplay may be blocked).
    const before = (await audio()).paused;
    await page.locator('#audioPlayPauseBtn').click();
    await expect.poll(async () => (await audio()).paused, { timeout: 10_000 }).toBe(!before);

    // Volume slider writes through to the element and to storage.
    await page.locator('#volumeSlider').fill('30');
    await expect.poll(async () => (await audio()).volume, { timeout: 5_000 }).toBeCloseTo(0.3, 2);
    expect(await page.evaluate(() => localStorage.getItem('mediaVolume'))).toBe('30');

    // Progress slider seeks.
    await page.locator('#audioProgressSlider').fill('50');
    await expect.poll(() => page.evaluate(() => document.getElementById('localAudioPlayer').currentTime), { timeout: 5_000 })
      .toBeGreaterThan(0.5);
    await expect(page.locator('#audioTotalTime')).not.toHaveText('0:00');
  });
});

test.describe('Offline shell and backup', () => {
  test('the service worker registers, reports its version and never caches a PDF', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await page.evaluate(() => navigator.serviceWorker.ready);

    // A second load is controlled by the worker, so it can answer messages.
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);
    await expect.poll(() => page.evaluate(() => window.CacheManager.getVersion()), { timeout: 15_000 })
      .toBe(await page.evaluate(() => window.ZAYA_VERSION));

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const all = [];
      for (const n of names) all.push(...(await (await caches.open(n)).keys()).map((r) => r.url));
      return all;
    });
    expect(cached.filter((u) => /\.pdf$/i.test(new URL(u).pathname))).toEqual([]);
    expect(cached.some((u) => /app\.js/.test(u))).toBe(true);
  });

  test('a backup round-trips the settings, not just the quotes', async ({ page }) => {
    await stubNetwork(page);
    await page.goto(`/index.html?pdf=${LOCAL_URL_PDF}`);
    await waitForBook(page);

    await page.evaluate(() => {
      window.appState.set({ mediaVolume: 71, mediaLoop: true, mediaMode: 'audio', isRTL: false });
      window.themeManager.setTheme('gruvbox');
    });
    const payload = await page.evaluate(() => window.ZayaBackup.exportBackup());
    expect(payload.preferences).toMatchObject({ theme: 'gruvbox', mediaVolume: 71, mediaLoop: true, mediaMode: 'audio' });
    expect(payload.settings).toBeTruthy();

    // Reset, then import the same file back.
    await page.evaluate(() => {
      window.appState.set({ mediaVolume: 10, mediaLoop: false, mediaMode: 'youtube' });
      window.themeManager.setTheme('default');
    });
    await page.evaluate((p) => window.ZayaBackup.importBackup(new File([JSON.stringify(p)], 'b.json')), payload);
    const state = await readState(page);
    expect(state.mediaVolume).toBe(71);
    expect(state.mediaLoop).toBe(true);
    expect(state.mediaMode).toBe('audio');
    await expect(page.locator('html')).toHaveClass(/theme-gruvbox/);
  });
});

test.describe('Deploy guard', () => {
  test('a script from another release than the markup purges caches and recovers', async ({ page, context }) => {
    // Serve index.html stamped with a different release than app.js reports.
    await context.route(/\/index\.html(\?.*)?$/, async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace('data-zaya-version="6.0.0"', 'data-zaya-version="0.0.1"');
      await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html' } });
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.fulfill({ status: 204, body: '' }));
    await page.goto('/index.html');
    // The guard reloads exactly once, then boots normally on the second pass.
    await expect.poll(() => page.evaluate(() => { try { return sessionStorage.getItem('zaya:reloaded-for'); } catch (e) { return null; } }), { timeout: 15_000 }).toBe('0.0.1');
    await expect(page.locator('#currentVersion')).toHaveText(/v6\.0\.0/, { timeout: 30_000 });
    const cacheNames = await page.evaluate(async () => ('caches' in window) ? (await caches.keys()).filter((k) => k.startsWith('zaya-')) : []);
    // Only the freshly (re)installed worker's cache may exist; nothing from before the reload.
    expect(cacheNames.length).toBeLessThanOrEqual(1);
  });
});
