/**
 * Changelog page controller
 * Reads CHANGELOG.md, renders the release timeline and wires the mobile index.
 */

import { FALLBACK_MESSAGE, SELECTORS } from './utils/ChangelogConfig.js';
import { ChangelogApiService } from './services/ChangelogApiService.js';
import { ChangelogParserService } from './services/ChangelogParserService.js';
import { ChangelogRenderer } from './ui/ChangelogRenderer.js';

/**
 * Make the mobile `<select>` jump to the chosen release.
 */
function bindVersionSelect() {
  const select = document.getElementById(SELECTORS.indexSelect);
  if (!select) return;
  select.addEventListener('change', () => {
    const target = document.querySelector(select.value);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', select.value);
    }
  });
}

/**
 * Load, parse and render the changelog.
 * @returns {Promise<void>} Resolves once the page is rendered.
 */
async function initializeChangelog() {
  bindVersionSelect();

  try {
    const markdown = await ChangelogApiService.fetchChangelog();
    const data = ChangelogParserService.parseChangelog(markdown);
    ChangelogRenderer.updateVersion(ChangelogRenderer.latestVersion(data));
    ChangelogRenderer.renderChangelog(data);
  } catch (error) {
    console.warn('Changelog unavailable:', error);
    ChangelogRenderer.showError(FALLBACK_MESSAGE);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeChangelog);
} else {
  initializeChangelog();
}
