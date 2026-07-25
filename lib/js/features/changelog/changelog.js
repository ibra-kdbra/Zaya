/**
 * Changelog Main Controller
 * Modern, modular changelog system with clean architecture
 */

import { ChangelogApiService } from './services/ChangelogApiService.js';
import { ChangelogParserService } from './services/ChangelogParserService.js';
import { ChangelogRenderer } from './ui/ChangelogRenderer.js';
import { PerformanceRenderer } from './ui/PerformanceRenderer.js';

/**
 * Load and display latest version information
 * @returns {Promise<string>} Latest version string
 */
async function loadLatestVersion() {
  try {
    // Load comprehensive metadata (version, date, commit count)
    const metadata = await ChangelogApiService.loadChangelogMetadata();

    // Update UI with loaded data
    ChangelogRenderer.updateVersion(metadata.version);
    ChangelogRenderer.updateDate(metadata.date);
    ChangelogRenderer.updateFooterDate(metadata.date);
    ChangelogRenderer.updateCommitCount(metadata.commitCount);

    return metadata.version;
  } catch (error) {
    console.warn('Error loading changelog metadata:', error);

    // Load individual components with fallbacks
    try {
      const version = await ChangelogApiService.loadLatestVersion();
      ChangelogRenderer.updateVersion(version);

      const date = await ChangelogApiService.loadLatestDate();
      ChangelogRenderer.updateDate(date);
      ChangelogRenderer.updateFooterDate(date);

      const commitCount = await ChangelogApiService.loadCommitCount();
      ChangelogRenderer.updateCommitCount(commitCount);

      return version;
    } catch (fallbackError) {
      console.error('Both metadata and fallback failed:', fallbackError);

      // Ultimate fallback - set default values
      ChangelogRenderer.updateVersion('v5.4.0');
      ChangelogRenderer.updateDate('Jul 25, 2026');
      ChangelogRenderer.updateFooterDate('Jul 25, 2026');
      ChangelogRenderer.updateCommitCount(50);

      return 'v5.4.0';
    }
  }
}

/**
 * Load and render the complete changelog content
 */
async function loadChangelog() {
  try {
    // Fetch changelog content
    const changelogContent = await ChangelogApiService.fetchChangelog();

    // Parse into structured data
    const parsedData = ChangelogParserService.parseChangelog(changelogContent);

    // Render all content
    ChangelogRenderer.renderChangelog(parsedData);

  } catch (error) {
    console.error('Error loading changelog:', error);
    ChangelogRenderer.showError('Failed to load changelog', error);
  }
}

/**
 * Check if we're on the changelog page
 * @returns {boolean} Whether current page is changelog
 */
function isChangelogPage() {
  return document.getElementById('loadingState') !== null;
}

/**
 * Initialize changelog functionality
 */
function initializeChangelog() {
  // Always load version info for any page with changelog.js
  loadLatestVersion();

  // Only load full changelog if we're on the changelog page
  if (!isChangelogPage()) {
    return;
  }

  // Show initial loading state
  ChangelogRenderer.showLoading();

  // Initialize navigation and animations
  ChangelogRenderer.initializeNavigation();
  ChangelogRenderer.initializeAnimations();

  // Initialize performance visualization
  PerformanceRenderer.initialize();

  // Load the complete changelog
  loadChangelog();
}

// Make functions globally available for external access
window.loadLatestVersion = loadLatestVersion;
window.initializeChangelog = initializeChangelog;

// Initialize when DOM is ready (handles ES module deferred execution race condition)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeChangelog);
} else {
  initializeChangelog();
}
