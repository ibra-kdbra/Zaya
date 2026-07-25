/**
 * Changelog API Service
 * Handles all external data fetching operations
 */

import { GITHUB_REPO_INFO, DEFAULT_VALUES } from '../utils/ChangelogConfig.js';

export class ChangelogApiService {
  /**
   * Fetch CHANGELOG.md content
   * @returns {Promise<string>} The raw markdown content
   */
  static async fetchChangelog() {
    try {
      const response = await fetch('CHANGELOG.md');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.warn('Fetching CHANGELOG.md via fetch API failed (e.g. file:// protocol or network), using fallback markdown:', error);
      return this.getFallbackMarkdown();
    }
  }

  static getFallbackMarkdown() {
    return `# 📋 ZAYA - PDF FLIPBOOK CHANGELOG

## 🎯 Recent Updates (Latest commits)

- \`core-perf\` - 60fps Theme Engine & Vanilla JS Refactor (2026-07-25)
- \`plugin-arch\` - Added ZayaPlugins & ZayaUI Slot API (2026-07-25)
- \`keyboard-nav\` - Arrow keys navigation & Fullscreen shortcuts (2026-07-25)
- \`zaya-rebrand\` - Global rebranding to Zaya (2026-04-03)

### ✨ Latest Major Update - v5.4.0 Core Performance Overhaul & Plugin Extension Architecture (2026-07-25)

- **Theme Engine Optimization**: Completely removed \`$('*')\` DOM tree class manipulation in \`manager.js\`. Themes now apply to root \`document.documentElement\` for zero layout reflow lag and 60fps instant theme transitions via CSS custom properties.
- **Theme Selector Performance Refactoring**: Pre-calculated and cached theme palette colors in \`selector.js\`, eliminating temporary DOM insertion loops during theme search. Refactored modal to pure Vanilla JS with 100ms search input debouncing.
- **Zaya Core Plugin Registry (\`ZayaPlugins\`)**: Introduced an event-driven plugin extension system in \`app-state.js\` emitting standardized events.
- **Zaya UI Extension Slots (\`ZayaUI\`)**: Implemented \`ZayaUI.registerToolbarButton()\` and \`ZayaUI.registerPanelTab()\` slot APIs in \`controls.js\`.
- **Keyboard Navigation Shortcuts**: Added Left (\`←\`) and Right (\`→\`) arrow keys for page turns, \`F\` key for Fullscreen toggle, and \`Cmd+K\` for the control panel.

## 🚀 Major Features & Improvements

### ⚡ Performance & Analytics
- **Live Monitoring**: Real-time tracking of memory usage and rendering performance via \`PerformanceMonitor\`.
- **Core Refactoring**: Complete modernization of the DFlip core into ES6 modules for improved reliability.

### 📱 Mobile & UX Experience
- **Multi-Modal Media**: Unified YouTube and Local Audio player with a sleek switcher UI.
- **Touch Gesture Support**: Optimized swipe navigation for tablets and smartphones.

## 🔧 Technical Improvements

### 🛡️ Security Architecture
- **Input Validation Framework**: Comprehensive sanitization for all URLs and file uploads.
- **State Management System**: Centralized, event-driven \`AppState\` class replacing global variables.

## 🐛 Bug Fixes & Maintenance

### ✅ Critical Bug Fixes
- **Zoom Conflict**: Fixed major issue where scrolling thumbnail/bookmark lists triggered book zooming.
- **Persistence Bugs**: Fixed theme and PDF state loss during page transitions.

## 🔄 Version History

### v5.4.0 (2026-07-25)
- Core Performance Overhaul & Plugin Extension Architecture
- 60fps Theme Engine & Vanilla JS Refactor
- Keyboard Navigation & UI Slot APIs

### v5.3.0 (2026-04-03)
- Global Rebranding to Zaya
- Integrated Media Loop for Audio/Video
- Service Worker system refactored into sw-manager.js

### v5.1.1 (2026-02-06)
- Cinematic Single Page Mode
- Unified Media Player

### v5.0.0 (2026-01-12)
- Library Modularization
- UI & Icon Modernization
`;
  }

  /**
   * Fetch repository information from GitHub API
   * @returns {Promise<Object>} Repository data including commit count if available
   */
  static async fetchRepoData() {
    try {
      const response = await fetch(GITHUB_REPO_INFO.apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Error fetching GitHub repo data:', error);
      // Return fallback data instead of throwing
      return {
        pushed_at: DEFAULT_VALUES.DATE,
        commitFallback: DEFAULT_VALUES.COMMIT_COUNT
      };
    }
  }

  /**
   * Load latest version from CHANGELOG.md
   * @returns {Promise<string>} The latest version string
   */
  static async loadLatestVersion() {
    try {
      const markdown = await this.fetchChangelog();
      return this.extractLatestVersion(markdown);
    } catch (error) {
      console.warn('Error loading latest version:', error);
      return DEFAULT_VALUES.VERSION;
    }
  }

  /**
   * Load latest date from CHANGELOG.md
   * @returns {Promise<string>} The latest date string
   */
  static async loadLatestDate() {
    try {
      const markdown = await this.fetchChangelog();
      return this.extractLatestDate(markdown);
    } catch (error) {
      console.warn('Error loading latest date:', error);
      return DEFAULT_VALUES.DATE;
    }
  }

  /**
   * Load commit count from GitHub API
   * @returns {Promise<number>} The commit count
   */
  static async loadCommitCount() {
    try {
      const repoData = await this.fetchRepoData();
      // Note: GitHub API doesn't provide direct commit count in /repos endpoint
      // This uses a fallback approach
      return repoData.commitFallback || DEFAULT_VALUES.COMMIT_COUNT;
    } catch (error) {
      console.warn('Error loading commit count:', error);
      return DEFAULT_VALUES.COMMIT_COUNT;
    }
  }

  /**
   * Load comprehensive changelog data
   * @returns {Promise<Object>} Object with version, date, and commit count
   */
  static async loadChangelogMetadata() {
    try {
      const [markdown, repoData] = await Promise.allSettled([
        this.fetchChangelog(),
        this.fetchRepoData()
      ]);

      const metadata = {};

      if (markdown.status === 'fulfilled') {
        metadata.version = this.extractLatestVersion(markdown.value) || DEFAULT_VALUES.VERSION;
        metadata.date = this.extractLatestDate(markdown.value) || DEFAULT_VALUES.DATE;
      } else {
        metadata.version = DEFAULT_VALUES.VERSION;
        metadata.date = DEFAULT_VALUES.DATE;
      }

      if (repoData.status === 'fulfilled') {
        metadata.commitCount = repoData.value.commitFallback || DEFAULT_VALUES.COMMIT_COUNT;
      } else {
        metadata.commitCount = DEFAULT_VALUES.COMMIT_COUNT;
      }

      return metadata;
    } catch (error) {
      console.warn('Error loading changelog metadata:', error);
      return {
        version: DEFAULT_VALUES.VERSION,
        date: DEFAULT_VALUES.DATE,
        commitCount: DEFAULT_VALUES.COMMIT_COUNT
      };
    }
  }

  /**
   * Extract latest version from markdown content
   * @param {string} markdown - Raw markdown content
   * @returns {string|null} Latest version string or null if not found
   */
  static extractLatestVersion(markdown) {
    const lines = markdown.split('\n');
    let latestVersion = null;

    for (let line of lines) {
      if (line.startsWith('###') && line.includes('v')) {
        const match = line.match(/(v\d+\.\d+\.\d+)/);
        if (match) {
          latestVersion = match[1];
          break; // Take the first (latest) one
        }
      }
    }

    return latestVersion;
  }

  /**
   * Extract latest date from markdown content
   * @param {string} markdown - Raw markdown content
   * @returns {string|null} Latest date string or null if not found
   */
  static extractLatestDate(markdown) {
    const lines = markdown.split('\n');
    let latestDate = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('## 🎯 Recent Updates (Latest commits)')) {
        // Look for the first commit which should have the latest date
        for (let j = i + 1; j < lines.length; j++) {
          const commitLine = lines[j].trim();
          if (commitLine.startsWith('- `') && commitLine.includes('(')) {
            const dateMatch = commitLine.match(/\((\d{4}-\d{2}-\d{2})\)/);
            if (dateMatch) {
              latestDate = dateMatch[1];
              break;
            }
          }
        }
        break;
      }
    }

    return latestDate;
  }
}
