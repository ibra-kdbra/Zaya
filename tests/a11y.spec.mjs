/**
 * Accessibility sweep (issue #28).
 *
 * axe-core runs over the reader at rest and over every surface a reader actually opens — the four
 * control-panel tabs, the four Navigator tabs, the theme picker, the notes modal, the More menu
 * and the print dialog — in both interface languages and at both a desk width and a phone width.
 * Anything axe rates serious or critical fails the run.
 *
 * Two rules are excluded, both for the vendored flipbook engine rather than for Zaya's own markup:
 *
 *   scrollable-region-focusable  the engine's thumbnail and outline wrappers are scroll containers
 *                                it builds itself; every item inside them is a real focusable
 *                                control, so the list is reachable from the keyboard without the
 *                                container being a tab stop of its own.
 *   aria-allowed-attr            the engine puts `aria-*` state on a few of its own nodes whose
 *                                roles it also owns; the markup is not ours to change while
 *                                `engine/` stays a fork (see docs/THIRD_PARTY_NOTICES.md).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { stubNetwork, waitForBook, openPanel } from './helpers.mjs';

const EXCLUDED_RULES = ['scrollable-region-focusable', 'aria-allowed-attr'];
const BLOCKING = new Set(['serious', 'critical']);

const WIDTHS = [
  { name: 'desk', width: 1440, height: 900 },
  { name: 'phone', width: 412, height: 915 }
];

const LANGUAGES = ['en', 'ar'];

/** Run axe over the page and return only the violations that block: serious and critical. */
async function scan(page, context) {
  const results = await new AxeBuilder({ page }).disableRules(EXCLUDED_RULES).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact));
  return blocking.map((v) => ({
    where: context,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' '))
  }));
}

/** Wait until an element's fade has finished, so axe measures the settled colours, not a frame of it. */
async function settled(page, selector) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && getComputedStyle(el).opacity === '1';
  }, selector);
}

async function openReader(page, lang, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  // Motion is a hint, not content: with it off, every surface is scanned in its final state.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubNetwork(page);
  await page.goto(`/index.html?pdf=https://example.com/sample.pdf&lang=${lang}`);
  await waitForBook(page);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

for (const lang of LANGUAGES) {
  for (const size of WIDTHS) {
    test(`no serious or critical axe violations — ${lang} at ${size.width}px`, async ({ page }) => {
      test.slow();
      await openReader(page, lang, size);

      const found = [];
      found.push(...await scan(page, 'reader at rest'));

      // Every tab of the control panel
      for (const tab of ['Document', 'Notes', 'Media', 'Settings']) {
        await openPanel(page, tab);
        found.push(...await scan(page, `panel: ${tab}`));
      }

      // The notes modal, opened from the Notes tab
      await openPanel(page, 'Notes');
      await page.locator('#quotesToggleBtn').click();
      await expect(page.locator('#pdfSpecificQuotesModal')).toHaveClass(/open/);
      await settled(page, '#pdfSpecificQuotesModal');
      await settled(page, '#pdfSpecificQuotesModal .modal-content');
      found.push(...await scan(page, 'notes modal'));
      await page.locator('#pdfSpecificQuotesModal .modal-close').click();

      // The theme picker, opened from Settings
      await openPanel(page, 'Settings');
      await page.locator('#openThemeSelectorBtn').click();
      await expect(page.locator('#themeSelectorOverlay')).toHaveClass(/active/);
      await settled(page, '#themeSelectorOverlay');
      found.push(...await scan(page, 'theme picker'));
      await page.keyboard.press('Escape');
      await expect(page.locator('#themeSelectorOverlay')).not.toHaveClass(/active/);
      await page.locator('#closeUnifiedPanelBtn').click();

      // Every tab of the Navigator, the Text pane among them
      for (const tab of ['thumbs', 'outline', 'search', 'text']) {
        await page.evaluate((t) => window.ZayaNavigator.open(t, { focusSearch: false }), tab);
        await page.waitForTimeout(400);
        found.push(...await scan(page, `navigator: ${tab}`));
      }
      await page.evaluate(() => window.ZayaNavigator.close({ force: true }));

      // The More menu on the bottom bar
      await page.locator('#customMoreBtn').click();
      await expect(page.locator('#customMoreMenu')).toHaveClass(/show/);
      found.push(...await scan(page, 'more menu'));

      // The print dialog, opened from that same menu
      await page.locator('#menuPrintBtn').click();
      await expect(page.locator('#printDialog')).toBeVisible();
      // The custom field carries the label, the hint and the error line, so it is scanned open.
      await page.locator('#printRangeCustom').click();
      await expect(page.locator('#printCustomField')).toBeVisible();
      await page.locator('#printRangeInput').fill('0-9, x');
      await expect(page.locator('#printRangeError')).toBeVisible();
      found.push(...await scan(page, 'print dialog'));
      await page.keyboard.press('Escape');
      await expect(page.locator('#printDialog')).toBeHidden();

      expect(found, JSON.stringify(found, null, 2)).toEqual([]);
    });
  }
}

test('the interface language can be switched from the keyboard alone', async ({ page }) => {
  test.slow();
  await openReader(page, 'en', WIDTHS[0]);
  await openPanel(page, 'Settings');

  // Reach the Arabic option with the keyboard and pick it: the radio group is one tab stop
  await page.locator('#languageEn').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#languageAr')).toBeFocused();
  await expect(page.locator('#panelTabSettings .switch-label')).toHaveText('الإعدادات');

  // Both features merged in from main speak Arabic too: the More menu's Print… and the Text tab.
  await expect(page.locator('#navTabText .switch-label')).toHaveText('النص');
  await page.locator('#customMoreBtn').click();
  await expect(page.locator('#customMoreMenu')).toHaveClass(/show/);
  await expect(page.locator('#menuPrintBtn span')).toHaveText('طباعة…');
  await page.locator('#customMoreBtn').click();
  await expect(page.locator('#customMoreMenu')).not.toHaveClass(/show/);
  await openPanel(page, 'Settings');
  await page.locator('#languageAr').focus();

  // And back again, with no reload in between
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#panelTabSettings .switch-label')).toHaveText('Settings');
});

test('the drawers, the theme picker and Escape are reachable with the keyboard', async ({ page }) => {
  test.slow();
  await openReader(page, 'en', WIDTHS[0]);

  // The Navigator opens from its header button and Escape gives focus back to it
  await page.locator('#toggleNavigatorBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#navigatorDrawer')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#navigatorDrawer')).not.toHaveClass(/open/);
  await expect(page.locator('#toggleNavigatorBtn')).toBeFocused();

  // The control panel: the tab rail is walked with the arrows, no trap along the way
  await page.locator('#toggleUnifiedPanelBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#unifiedPanel')).toHaveClass(/open/);
  await expect(page.locator('#panelTabDocument')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#panelTabNotes')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#panelTabSettings')).toBeFocused();

  // The theme picker traps focus while it is open and hands it back on Escape
  await page.locator('#openThemeSelectorBtn').click();
  await expect(page.locator('#themeSelectorOverlay')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#themeSelectorOverlay')).not.toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#unifiedPanel')).not.toHaveClass(/open/);
});
