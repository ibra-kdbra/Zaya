import { test, expect } from '@playwright/test';
import { stubNetwork, waitForBook } from './helpers.mjs';

/** Record every window.print() call instead of opening the browser's print dialogue. */
async function stubPrint(page) {
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });
}

async function openReader(page) {
  await stubNetwork(page);
  await stubPrint(page);
  await page.goto('/index.html?pdf=https://example.com/sample.pdf');
  await waitForBook(page);
}

/** Open the More menu and choose Print… */
async function openPrintDialog(page) {
  await page.locator('#customMoreBtn').click();
  await expect(page.locator('#customMoreMenu')).toHaveClass(/show/);
  await page.locator('#menuPrintBtn').click();
  await expect(page.locator('#printDialog')).toBeVisible();
}

test.describe('Print pages', () => {
  test('the More menu opens the dialog and a custom range prints those pages', async ({ page }) => {
    await openReader(page);
    await openPrintDialog(page);

    await expect(page.locator('#printDialogPanel')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#printDialogPanel')).toHaveAttribute('aria-modal', 'true');

    await page.locator('#printRangeCustom').click();
    await expect(page.locator('#printCustomField')).toBeVisible();
    await page.locator('#printRangeInput').fill('1, 3');
    await expect(page.locator('#printSummary')).toHaveText('2 pages');

    await page.locator('#printConfirmBtn').click();

    await expect.poll(() => page.evaluate(() => window.__printCalls), { timeout: 30_000 }).toBe(1);
    const images = page.locator('#printSheet img');
    await expect(images).toHaveCount(2);
    await expect(images.nth(0)).toHaveAttribute('alt', 'Page 1');
    await expect(images.nth(1)).toHaveAttribute('alt', 'Page 3');
    await expect(page.locator('#printDialog')).toBeHidden();
  });

  test('an invalid range shows the error and disables Print', async ({ page }) => {
    await openReader(page);
    await openPrintDialog(page);

    await page.locator('#printRangeCustom').click();
    await page.locator('#printRangeInput').fill('0-2, x');

    await expect(page.locator('#printRangeError')).toBeVisible();
    await expect(page.locator('#printRangeError')).not.toBeEmpty();
    await expect(page.locator('#printRangeInput')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#printConfirmBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.__printCalls)).toBe(0);
  });

  test('print media shows only the rendered sheet', async ({ page }) => {
    await openReader(page);
    await expect.poll(() => page.evaluate(() => window.ZayaPrint.print('2')), { timeout: 30_000 }).toBe(true);
    await expect(page.locator('#printSheet img')).toHaveCount(1);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#printSheet')).toBeVisible();
    await expect(page.locator('#appHeader')).toBeHidden();
    await expect(page.locator('#customControlBar')).toBeHidden();

    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('#printSheet')).toBeHidden();
  });

  test('Escape closes the dialog and returns focus to the menu button', async ({ page }) => {
    await openReader(page);
    await openPrintDialog(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#printDialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('menuPrintBtn');
  });

  test('Ctrl+P opens the dialog instead of the browser print dialogue', async ({ page }) => {
    await openReader(page);
    await page.keyboard.press('Control+p');
    await expect(page.locator('#printDialog')).toBeVisible();
    expect(await page.evaluate(() => window.__printCalls)).toBe(0);
  });

  test('the page order follows the range as typed, in a right-to-left book too', async ({ page }) => {
    await openReader(page);
    await page.evaluate(() => window.appState.set({ isRTL: true }));
    await waitForBook(page);

    await expect.poll(() => page.evaluate(() => window.ZayaPrint.print('3, 1')), { timeout: 30_000 }).toBe(true);
    const alts = await page.locator('#printSheet img').evaluateAll((nodes) => nodes.map((n) => n.alt));
    expect(alts).toEqual(['Page 3', 'Page 1']);
  });
});
