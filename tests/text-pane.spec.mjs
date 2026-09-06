import { test, expect } from '@playwright/test';
import { openPanel, stubNetwork, waitForBook } from './helpers.mjs';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

/** Open the Navigator on the Text tab and wait for the first page section. */
async function openTextPane(page) {
  await page.evaluate(() => window.ZayaNavigator.open('text'));
  await expect(page.locator('#navPaneText')).toBeVisible({ timeout: 15_000 });
}

/** Select every child of the nth paragraph in the pane, as a reader's drag would. */
async function selectParagraph(page, nth = 0) {
  await page.evaluate((i) => {
    const para = document.querySelectorAll('#navPaneText .text-page-para')[i];
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.selectAllChildren(para);
  }, nth);
  await expect(page.locator('.text-actions')).toBeVisible({ timeout: 10_000 });
}

test.describe('Text pane', () => {
  test('shows the text of the pages on screen and follows a page turn', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);

    await openTextPane(page);
    await expect(page.locator('#navTabText')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#navPaneText .text-page-title').first()).toHaveText('Page 1', { timeout: 20_000 });
    await expect(page.locator('#navPaneText')).toContainText('Zaya smoke test document', { timeout: 20_000 });
    await expect(page.locator('#navPaneText')).toContainText('flipbooks and search');

    // Paragraphs read in whichever direction their own script wants.
    await expect(page.locator('#navPaneText .text-page-para').first()).toHaveAttribute('dir', 'auto');

    // The tab is remembered like the other three.
    expect(await page.evaluate(() => window.appState.get('navigatorTab'))).toBe('text');

    await page.evaluate(() => window.dFlipBook.target.gotoPage(3));
    await expect(page.locator('#navPaneText')).toContainText('Third and final page', { timeout: 20_000 });
    await expect(page.locator('#navPaneText')).not.toContainText('Zaya smoke test document');
  });

  test('the tab list still walks with the arrow keys, now over four tabs', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.ZayaNavigator.open('thumbs'));
    await page.locator('#navTabThumbs').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#navTabText')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#navTabText')).toBeFocused();
    await page.keyboard.press('ArrowDown'); // wraps back to the first tab
    await expect(page.locator('#navTabThumbs')).toHaveAttribute('aria-selected', 'true');
  });

  test('a selection offers Add as note, and the note lands in Notes with its page', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.dFlipBook.target.gotoPage(2));
    await openTextPane(page);
    await expect(page.locator('#navPaneText')).toContainText('quick brown fox', { timeout: 20_000 });

    await selectParagraph(page);
    await expect(page.locator('.text-actions')).toContainText('Add as note');
    await page.locator('.text-action', { hasText: 'Add as note' }).click();
    await expect(page.locator('.text-actions')).toBeHidden();

    await openPanel(page, 'Notes');
    const note = page.locator('.quote-text', { hasText: 'quick brown fox' }).first();
    await expect(note).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.quote-page-info').first()).toContainText('p.2');
  });

  test('the action bar stays away from an empty selection and goes on a page turn', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);
    await openTextPane(page);
    await expect(page.locator('#navPaneText .text-page-para').first()).toBeVisible({ timeout: 20_000 });

    // A collapsed selection is not a selection.
    await page.evaluate(() => {
      const para = document.querySelector('#navPaneText .text-page-para');
      const range = document.createRange();
      range.setStart(para.firstChild, 3);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.text-actions')).toBeHidden();

    await selectParagraph(page);
    await page.evaluate(() => window.dFlipBook.target.gotoPage(3));
    await expect(page.locator('.text-actions')).toBeHidden({ timeout: 10_000 });
  });

  test('Escape clears the action bar and leaves the drawer open', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);
    await openTextPane(page);
    await expect(page.locator('#navPaneText .text-page-para').first()).toBeVisible({ timeout: 20_000 });
    await selectParagraph(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.text-actions')).toBeHidden();
    expect(await page.evaluate(() => window.ZayaNavigator.isOpen())).toBe(true);
  });

  test('Search hands the selection to the Search tab', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html?pdf=https://example.com/sample.pdf');
    await waitForBook(page);
    await page.evaluate(() => window.dFlipBook.target.gotoPage(3));
    await openTextPane(page);
    await expect(page.locator('#navPaneText')).toContainText('zebra', { timeout: 20_000 });

    // Select the single word, not the whole paragraph.
    await page.evaluate(() => {
      const para = Array.from(document.querySelectorAll('#navPaneText .text-page-para'))
        .find((el) => el.textContent.includes('zebra'));
      const text = para.firstChild;
      const at = para.textContent.indexOf('zebra');
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + 5);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await expect(page.locator('.text-actions')).toBeVisible({ timeout: 10_000 });
    await page.locator('.text-action', { hasText: 'Search' }).click();
    await expect(page.locator('#navTabSearch')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.df-search-input')).toHaveValue('zebra', { timeout: 10_000 });
    await expect(page.locator('.df-search-result')).toHaveCount(1, { timeout: 20_000 });
  });

  test('Arabic pages read right to left', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-arabic.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-arabic.pdf');
    await waitForBook(page);

    await openTextPane(page);
    const para = page.locator('#navPaneText .text-page-para').first();
    await expect(para).toBeVisible({ timeout: 20_000 });
    await expect(para).toHaveAttribute('dir', 'auto');
    // `dir=auto` on Arabic text resolves to rtl, which is the whole point of setting it.
    expect(await para.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  });

  test('a document of images says so and points at the Search tab', async ({ page }) => {
    await stubNetwork(page);
    await page.goto('/index.html');
    await waitForBook(page);
    await openPanel(page, 'Document');
    await page.setInputFiles('#pdfFile', FIXTURES + 'sample-scanned.pdf');
    await expect.poll(() => page.evaluate(() => window.appState.get('currentPdfName')), { timeout: 20_000 }).toBe('sample-scanned.pdf');
    await waitForBook(page);

    await openTextPane(page);
    await expect(page.locator('#navPaneText .text-pane-state')).toContainText('no text', { timeout: 25_000 });
    await page.locator('#navPaneText .text-pane-link').click();
    await expect(page.locator('#navTabSearch')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.df-ocr')).toContainText('no text layer', { timeout: 20_000 });
  });
});
