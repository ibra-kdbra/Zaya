(() => {
  // lib/js/features/changelog/utils/ChangelogConfig.js
  var CHANGELOG_SECTIONS = {
    RECENT: "recent",
    FEATURES: "features",
    TECHNICAL: "technical",
    BUGFIXES: "bugfixes",
    VERSIONS: "versions",
    NOTES: "notes"
  };
  var CHANGELOG_HEADERS = {
    [CHANGELOG_SECTIONS.RECENT]: "## \u{1F3AF} Recent Updates (Latest commits)",
    [CHANGELOG_SECTIONS.FEATURES]: "## \u{1F680} Major Features & Improvements",
    [CHANGELOG_SECTIONS.TECHNICAL]: "## \u{1F527} Technical Improvements",
    [CHANGELOG_SECTIONS.BUGFIXES]: "## \u{1F41B} Bug Fixes & Maintenance",
    [CHANGELOG_SECTIONS.VERSIONS]: "## \u{1F504} Version History",
    [CHANGELOG_SECTIONS.NOTES]: "## \u{1F4DD} Notes"
  };
  var SUBSECTION_PREFIXES = {
    [CHANGELOG_SECTIONS.FEATURES]: ["### \u2728", "### \u{1F4AC}", "### \u{1F4C4}", "### \u{1F3A8}", "### \u{1F512}", "### \u{1F3D7}\uFE0F", "### \u{1F4F1}", "### \u26A1"],
    [CHANGELOG_SECTIONS.TECHNICAL]: ["### \u{1F6E1}\uFE0F", "### \u{1F3DB}\uFE0F", "### \u{1F4C1}", "### \u26A1", "### \u{1F517}", "### \u26A1"],
    [CHANGELOG_SECTIONS.BUGFIXES]: ["### \u2705", "### \u{1F9F9}"]
  };
  var CATEGORY_ICONS = {
    // Feature categories
    "Icon System & UI Enhancement": { icon: "fa-palette", color: "emerald" },
    "Quotes System": { icon: "fa-quote-right", color: "sky" },
    "PDF & Media Features": { icon: "fa-file-pdf", color: "purple" },
    "UI/UX Improvements": { icon: "fa-user-experience", color: "yellow" },
    "Security & Input Validation Overhaul (Phase 1)": { icon: "fa-shield-alt", color: "red" },
    "Architecture & State Management Refactor (Phase 2)": { icon: "fa-building", color: "blue" },
    "Mobile & UX Experience Enhancement (Phase 3)": { icon: "fa-mobile-alt", color: "teal" },
    // Technical categories
    "Security Architecture": { icon: "fa-shield-alt", color: "emerald" },
    "System Architecture": { icon: "fa-building", color: "blue" },
    "Mobile-First Architecture": { icon: "fa-mobile-alt", color: "cyan" },
    "Code Organization": { icon: "fa-folder-tree", color: "yellow" },
    "Performance & Compatibility": { icon: "fa-tachometer-alt", color: "orange" },
    "URL & Share System": { icon: "fa-share-alt", color: "purple" },
    // Bug fix categories
    "Recent Fixes": { icon: "fa-wrench", color: "emerald" },
    "Code Cleanup": { icon: "fa-broom", color: "cyan" }
  };
  var GITHUB_REPO_INFO = {
    owner: "ibra-kdbra",
    repo: "Zaya",
    apiUrl: "https://api.github.com/repos/ibra-kdbra/Zaya"
  };
  var DEFAULT_VALUES = {
    VERSION: "6.0.0",
    DATE: "2026-04-03",
    COMMIT_COUNT: 142,
    LATEST_DATE_TEXT: "Latest: Apr 03, 2026",
    COMMIT_COUNT_TEXT: "140+ Commits"
  };
  var REGEX_PATTERNS = {
    VERSION: /### (v\d+\.\d+\.\d+)/,
    VERSION_WITH_STATUS: /### (v\d+\.\d+\.\d+)(?:\s*\(([^)]+)\))?/,
    COMMIT_LINE: /- `([^`]+)` - ([^(]+)\s*\(([^)]+)\)/,
    FEATURE_ITEM: /- ([^:]+): (.+)/,
    DATE_FROM_COMMIT: /\((\d{4}-\d{2}-\d{2})\)/,
    SUBSECTION_CLEAN: /^###\s*(💬|📄|🎨|📁|⚡|🔗|🛡️|🏛️|📱|✨|✅|🧹)\s*/
  };

  // lib/js/features/changelog/services/ChangelogApiService.js
  var ChangelogApiService = class {
    /**
     * Fetch CHANGELOG.md content
     * @returns {Promise<string>} The raw markdown content
     */
    static async fetchChangelog() {
      try {
        const response = await fetch("CHANGELOG.md");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
      } catch (error) {
        console.warn("Fetching CHANGELOG.md via fetch API failed (e.g. file:// protocol or network), using fallback markdown:", error);
        return this.getFallbackMarkdown();
      }
    }
    static getFallbackMarkdown() {
      return `# \u{1F4CB} ZAYA - PDF FLIPBOOK CHANGELOG

## \u{1F3AF} Recent Updates (Latest commits)

- \`core-perf\` - 60fps Theme Engine & Vanilla JS Refactor (2026-07-25)
- \`plugin-arch\` - Added ZayaPlugins & ZayaUI Slot API (2026-07-25)
- \`keyboard-nav\` - Arrow keys navigation & Fullscreen shortcuts (2026-07-25)
- \`zaya-rebrand\` - Global rebranding to Zaya (2026-04-03)

### \u2728 Latest Major Update - v5.4.0 Core Performance Overhaul & Plugin Extension Architecture (2026-07-25)

- **Theme Engine Optimization**: Completely removed \`$('*')\` DOM tree class manipulation in \`manager.js\`. Themes now apply to root \`document.documentElement\` for zero layout reflow lag and 60fps instant theme transitions via CSS custom properties.
- **Theme Selector Performance Refactoring**: Pre-calculated and cached theme palette colors in \`selector.js\`, eliminating temporary DOM insertion loops during theme search. Refactored modal to pure Vanilla JS with 100ms search input debouncing.
- **Zaya Core Plugin Registry (\`ZayaPlugins\`)**: Introduced an event-driven plugin extension system in \`app-state.js\` emitting standardized events.
- **Zaya UI Extension Slots (\`ZayaUI\`)**: Implemented \`ZayaUI.registerToolbarButton()\` and \`ZayaUI.registerPanelTab()\` slot APIs in \`controls.js\`.
- **Keyboard Navigation Shortcuts**: Added Left (\`\u2190\`) and Right (\`\u2192\`) arrow keys for page turns, \`F\` key for Fullscreen toggle, and \`Cmd+K\` for the control panel.

## \u{1F680} Major Features & Improvements

### \u26A1 Performance & Analytics
- **Live Monitoring**: Real-time tracking of memory usage and rendering performance via \`PerformanceMonitor\`.
- **Core Refactoring**: Complete modernization of the DFlip core into ES6 modules for improved reliability.

### \u{1F4F1} Mobile & UX Experience
- **Multi-Modal Media**: Unified YouTube and Local Audio player with a sleek switcher UI.
- **Touch Gesture Support**: Optimized swipe navigation for tablets and smartphones.

## \u{1F527} Technical Improvements

### \u{1F6E1}\uFE0F Security Architecture
- **Input Validation Framework**: Comprehensive sanitization for all URLs and file uploads.
- **State Management System**: Centralized, event-driven \`AppState\` class replacing global variables.

## \u{1F41B} Bug Fixes & Maintenance

### \u2705 Critical Bug Fixes
- **Zoom Conflict**: Fixed major issue where scrolling thumbnail/bookmark lists triggered book zooming.
- **Persistence Bugs**: Fixed theme and PDF state loss during page transitions.

## \u{1F504} Version History

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
        console.warn("Error fetching GitHub repo data:", error);
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
        console.warn("Error loading latest version:", error);
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
        console.warn("Error loading latest date:", error);
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
        return repoData.commitFallback || DEFAULT_VALUES.COMMIT_COUNT;
      } catch (error) {
        console.warn("Error loading commit count:", error);
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
        if (markdown.status === "fulfilled") {
          metadata.version = this.extractLatestVersion(markdown.value) || DEFAULT_VALUES.VERSION;
          metadata.date = this.extractLatestDate(markdown.value) || DEFAULT_VALUES.DATE;
        } else {
          metadata.version = DEFAULT_VALUES.VERSION;
          metadata.date = DEFAULT_VALUES.DATE;
        }
        if (repoData.status === "fulfilled") {
          metadata.commitCount = repoData.value.commitFallback || DEFAULT_VALUES.COMMIT_COUNT;
        } else {
          metadata.commitCount = DEFAULT_VALUES.COMMIT_COUNT;
        }
        return metadata;
      } catch (error) {
        console.warn("Error loading changelog metadata:", error);
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
      const lines = markdown.split("\n");
      let latestVersion = null;
      for (let line of lines) {
        if (line.startsWith("###") && line.includes("v")) {
          const match = line.match(/(v\d+\.\d+\.\d+)/);
          if (match) {
            latestVersion = match[1];
            break;
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
      const lines = markdown.split("\n");
      let latestDate = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("## \u{1F3AF} Recent Updates (Latest commits)")) {
          for (let j = i + 1; j < lines.length; j++) {
            const commitLine = lines[j].trim();
            if (commitLine.startsWith("- `") && commitLine.includes("(")) {
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
  };

  // lib/js/features/changelog/utils/ChangelogUtils.js
  var ChangelogUtils = class {
    /**
     * Format date for display
     * @param {string} dateString - Date in 'YYYY-MM-DD' format
     * @param {boolean} includeLatest - Whether to include "Latest:" prefix
     * @returns {string} Formatted date string
     */
    static formatDate(dateString, includeLatest = true) {
      if (!dateString) return "";
      const date = new Date(dateString);
      const options = { month: "short", day: "numeric", year: "numeric" };
      const formattedDate = date.toLocaleDateString("en-US", options);
      return includeLatest ? `Latest: ${formattedDate}` : formattedDate;
    }
    /**
     * Format commit count for display
     * @param {number} count - Number of commits
     * @returns {string} Formatted commit count string
     */
    static formatCommitCount(count) {
      return `${count}+ Commits`;
    }
    /**
     * Render markdown text with basic formatting
     * @param {string} text - Markdown text
     * @returns {string} HTML formatted text
     */
    static renderMarkdown(text) {
      if (!text) return "";
      let processedText = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      try {
        if (typeof marked !== "undefined") {
          return marked.parse(processedText);
        }
        return processedText;
      } catch (e) {
        return processedText;
      }
    }
    /**
     * Get contextual icon for technical improvements/features
     * @param {string} title - Item title
     * @param {string} description - Item description
     * @returns {string} FontAwesome icon class
     */
    static getContextualIcon(title, description) {
      const titleLower = title.toLowerCase();
      const descLower = description.toLowerCase();
      if (titleLower.includes("validation") || titleLower.includes("security") || descLower.includes("xss") || descLower.includes("sanitize") || descLower.includes("input")) {
        return "fa-shield-alt";
      }
      if (titleLower.includes("state") || titleLower.includes("management") || descLower.includes("global") || descLower.includes("memory")) {
        return "fa-brain";
      }
      if (titleLower.includes("mobile") || titleLower.includes("touch") || descLower.includes("gesture") || descLower.includes("responsive")) {
        return "fa-mobile-alt";
      }
      if (titleLower.includes("compatibility") || titleLower.includes("browser") || descLower.includes("feature") || descLower.includes("support")) {
        return "fa-globe";
      }
      if (titleLower.includes("performance") || descLower.includes("speed") || descLower.includes("optimization")) {
        return "fa-tachometer-alt";
      }
      if (titleLower.includes("error") || titleLower.includes("handling") || descLower.includes("exception") || descLower.includes("try-catch")) {
        return "fa-exclamation-triangle";
      }
      if (titleLower.includes("architecture") || titleLower.includes("system") || descLower.includes("framework")) {
        return "fa-building";
      }
      if (titleLower.includes("organization") || titleLower.includes("code") || descLower.includes("structure") || descLower.includes("module")) {
        return "fa-code";
      }
      return "fa-check";
    }
    /**
     * Clean subsection title by removing emoji prefix
     * @param {string} line - Raw subsection line
     * @returns {string} Cleaned title
     */
    static cleanSubsectionTitle(line) {
      return line.replace(/^###\s*[^\s]+\s*/, "").trim();
    }
    /**
     * Check if line matches a subsection pattern
     * @param {string} line - Line to check
     * @param {Array} prefixes - Array of prefixes to check against
     * @returns {boolean} Whether line matches any prefix
     */
    static isSubsectionLine(line, prefixes) {
      return prefixes.some((prefix) => line.startsWith(prefix));
    }
    /**
     * Check if line is a feature/bug item (starts with '- ')
     * @param {string} line - Line to check
     * @returns {boolean} Whether line is an item
     */
    static isItemLine(line) {
      return line.trim().startsWith("- ");
    }
    /**
     * Parse an item line into title and description
     * @param {string} line - Item line
     * @returns {Object} {title, description}
     */
    static parseItemLine(line) {
      const trimmedLine = line.substring(line.indexOf("- ") + 2).trim();
      const colonIndex = trimmedLine.indexOf(": ");
      if (colonIndex !== -1) {
        return {
          title: trimmedLine.substring(0, colonIndex).trim(),
          description: trimmedLine.substring(colonIndex + 2).trim()
        };
      }
      return {
        title: trimmedLine,
        description: ""
      };
    }
    /**
     * Group items by category
     * @param {Array} items - Array of items with category property
     * @returns {Object} Grouped items by category
     */
    static groupByCategory(items) {
      const categories = {};
      items.forEach((item) => {
        const category = item.category || "General";
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(item);
      });
      return categories;
    }
    /**
     * Get section parser based on section type
     * @param {string} sectionType - Type of section
     * @returns {Function} Parser function for the section
     */
    static getSectionParser(sectionType) {
      const parsers = {
        recent: (line, data) => {
          const match = line.match(/- `([^`]+)` - ([^(]+)\s*\(([^)]+)\)/);
          if (match) {
            data.recent.push({
              hash: match[1],
              message: match[2].trim(),
              time: match[3]
            });
          }
        },
        notes: (line, data) => {
          let note = line.substring(2).replace(/^\*\*(.+)\*\*$/, "$1");
          data.notes.push(note);
        }
      };
      return parsers[sectionType] || (() => {
      });
    }
    /**
     * Configure marked options if available
     */
    static configureMarked() {
      if (typeof marked !== "undefined") {
        marked.setOptions({
          breaks: true,
          gfm: true,
          sanitize: false
        });
      }
    }
  };

  // lib/js/features/changelog/services/ChangelogParserService.js
  var ChangelogParserService = class {
    /**
     * Parse the entire CHANGELOG.md content
     * @param {string} markdown - Raw markdown content
     * @returns {Object} Parsed changelog data
     */
    static parseChangelog(markdown) {
      const lines = markdown.split("\n");
      const data = {
        recent: [],
        features: {},
        technical: {},
        bugfixes: {},
        versions: [],
        notes: []
      };
      let currentSection = "";
      let currentSubsection = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.RECENT]) {
          currentSection = CHANGELOG_SECTIONS.RECENT;
        } else if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.FEATURES]) {
          currentSection = CHANGELOG_SECTIONS.FEATURES;
        } else if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.TECHNICAL]) {
          currentSection = CHANGELOG_SECTIONS.TECHNICAL;
        } else if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.BUGFIXES]) {
          currentSection = CHANGELOG_SECTIONS.BUGFIXES;
        } else if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.VERSIONS]) {
          currentSection = CHANGELOG_SECTIONS.VERSIONS;
        } else if (line === CHANGELOG_HEADERS[CHANGELOG_SECTIONS.NOTES]) {
          currentSection = CHANGELOG_SECTIONS.NOTES;
        }
        if (line.startsWith("###") && line.includes("v")) {
          this.parseVersionsSection(line, i, data, lines);
        }
        currentSubsection = this.parseSectionLine(line, currentSection, data, currentSubsection, i, lines);
      }
      return data;
    }
    /**
     * Parse individual lines based on current section
     * @param {string} line - Current line to parse
     * @param {string} currentSection - Current section being parsed
     * @param {Object} data - Data object to populate
     * @param {string} currentSubsection - Current subsection
     * @param {number} lineIndex - Current line index
     * @param {Array} allLines - All lines for context
     * @returns {string} Updated subsection
     */
    static parseSectionLine(line, currentSection, data, currentSubsection, lineIndex, allLines) {
      switch (currentSection) {
        case CHANGELOG_SECTIONS.RECENT:
          this.parseRecentSection(line, data);
          break;
        case CHANGELOG_SECTIONS.FEATURES:
          currentSubsection = this.parseFeaturesSection(line, data, currentSubsection);
          break;
        case CHANGELOG_SECTIONS.TECHNICAL:
          currentSubsection = this.parseTechnicalSection(line, data, currentSubsection);
          break;
        case CHANGELOG_SECTIONS.BUGFIXES:
          currentSubsection = this.parseBugFixesSection(line, data, currentSubsection);
          break;
        case CHANGELOG_SECTIONS.VERSIONS:
          this.parseVersionsSection(line, lineIndex, data, allLines);
          break;
        case CHANGELOG_SECTIONS.NOTES:
          this.parseNotesSection(line, data);
          break;
      }
      return currentSubsection;
    }
    /**
     * Parse recent updates section
     * @param {string} line - Line to parse
     * @param {Object} data - Data object to populate
     */
    static parseRecentSection(line, data) {
      if (line.startsWith("- `")) {
        const match = line.match(REGEX_PATTERNS.COMMIT_LINE);
        if (match) {
          data.recent.push({
            hash: match[1],
            message: match[2].trim(),
            time: match[3]
          });
        }
      }
    }
    /**
     * Parse features section
     * @param {string} line - Line to parse
     * @param {Object} data - Data object to populate
     * @param {string} currentSubsection - Current subsection
     * @returns {string} Updated subsection
     */
    static parseFeaturesSection(line, data, currentSubsection) {
      let newSubsection = currentSubsection;
      if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.FEATURES])) {
        newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
        if (!data.features[newSubsection]) {
          data.features[newSubsection] = [];
        }
      } else if (ChangelogUtils.isItemLine(line)) {
        if (newSubsection) {
          const item = ChangelogUtils.parseItemLine(line);
          if (item) {
            data.features[newSubsection].push({
              title: item.title,
              description: item.description
            });
          }
        }
      }
      return newSubsection;
    }
    /**
     * Parse technical improvements section
     * @param {string} line - Line to parse
     * @param {Object} data - Data object to populate
     * @param {string} currentSubsection - Current subsection
     * @returns {string} Updated subsection
     */
    static parseTechnicalSection(line, data, currentSubsection) {
      let newSubsection = currentSubsection;
      if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.TECHNICAL])) {
        newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
        if (!data.technical[newSubsection]) {
          data.technical[newSubsection] = [];
        }
      } else if (ChangelogUtils.isItemLine(line) && newSubsection) {
        const item = ChangelogUtils.parseItemLine(line);
        if (item) {
          data.technical[newSubsection].push({
            title: item.title,
            description: item.description
          });
        }
      }
      return newSubsection;
    }
    /**
     * Parse bug fixes section
     * @param {string} line - Line to parse
     * @param {Object} data - Data object to populate
     * @param {string} currentSubsection - Current subsection
     * @returns {string} Updated subsection
     */
    static parseBugFixesSection(line, data, currentSubsection) {
      let newSubsection = currentSubsection;
      if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.BUGFIXES])) {
        newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
        if (!data.bugfixes[newSubsection]) {
          data.bugfixes[newSubsection] = [];
        }
      } else if (ChangelogUtils.isItemLine(line) && newSubsection) {
        const item = ChangelogUtils.parseItemLine(line);
        if (item) {
          data.bugfixes[newSubsection].push({
            title: item.title,
            description: item.description
          });
        }
      }
      return newSubsection;
    }
    /**
     * Parse versions section
     * @param {string} line - Line to parse
     * @param {number} lineIndex - Current line index
     * @param {Object} data - Data object to populate
     * @param {Array} allLines - All lines for context
     */
    static parseVersionsSection(line, lineIndex, data, allLines) {
      if (line.startsWith("###")) {
        const match = line.match(/(v\d+\.\d+\.\d+)/);
        if (match) {
          const verStr = match[1];
          if (data.versions.some((v) => v.version === verStr)) return;
          const version = {
            version: verStr,
            status: line.includes("Latest") ? "Latest Release" : "Release",
            features: []
          };
          let j = lineIndex + 1;
          while (j < allLines.length && !allLines[j].startsWith("###") && !allLines[j].startsWith("---") && !allLines[j].startsWith("##")) {
            const featureLine = allLines[j].trim();
            if (featureLine.startsWith("- ")) {
              version.features.push(featureLine.substring(2));
            }
            j++;
          }
          data.versions.push(version);
        }
      }
    }
    /**
     * Parse notes section
     * @param {string} line - Line to parse
     * @param {Object} data - Data object to populate
     */
    static parseNotesSection(line, data) {
      if (line.startsWith("- ")) {
        let note = line.substring(2).replace(/^\*\*(.+)\*\*$/, "$1");
        data.notes.push(note);
      }
    }
    /**
     * Extract latest version from parsed data
     * @param {Object} parsedData - Already parsed changelog data
     * @returns {string|null} Latest version string
     */
    static extractLatestVersionFromData(parsedData) {
      if (parsedData.versions && parsedData.versions.length > 0) {
        return parsedData.versions[0].version;
      }
      return null;
    }
    /**
     * Extract latest date from parsed data
     * @param {Object} parsedData - Already parsed changelog data
     * @returns {string|null} Latest date string
     */
    static extractLatestDateFromData(parsedData) {
      if (parsedData.recent && parsedData.recent.length > 0) {
        return parsedData.recent[0].time;
      }
      return null;
    }
  };

  // lib/js/features/changelog/ui/ChangelogRenderer.js
  var ChangelogRenderer = class {
    /**
     * Update version display elements
     * @param {string} version - Version string to display
     */
    static updateVersion(version) {
      const versionElements = ["currentVersion", "footerVersion"];
      versionElements.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = version || "Unknown";
        } else {
        }
      });
    }
    /**
     * Update date display elements
     * @param {string} dateString - Date string to display
     */
    static updateDate(dateString) {
      const dateElement = document.getElementById("latestDate");
      if (dateElement) {
        dateElement.textContent = ChangelogUtils.formatDate(dateString);
      }
    }
    /**
     * Update commit count display elements
     * @param {number} count - Commit count to display
     */
    static updateCommitCount(count) {
      const commitElement = document.getElementById("commitCount");
      if (commitElement) {
        commitElement.textContent = ChangelogUtils.formatCommitCount(count);
      }
      const footerCommitsSpan = document.querySelector("#footerStatsCommits");
      if (footerCommitsSpan) {
        footerCommitsSpan.textContent = `${count}+`;
      }
    }
    /**
     * Update footer date display
     * @param {string} dateString - Date string to display
     */
    static updateFooterDate(dateString) {
      const footerDateSpan = document.querySelector("#footerStatsDate");
      if (footerDateSpan) {
        footerDateSpan.textContent = dateString ? ChangelogUtils.formatDate(dateString, false) : "Unknown";
      }
    }
    /**
     * Render the entire changelog content
     * @param {Object} data - Parsed changelog data
     */
    static renderChangelog(data = {}) {
      const loadingState = document.getElementById("loadingState");
      if (loadingState) {
        loadingState.style.display = "none";
      }
      try {
        this.renderRecentUpdates(data?.recent || []);
        this.renderFeatures(data?.features || {});
        this.renderTechnicalImprovements(data?.technical || {});
        this.renderBugFixes(data?.bugfixes || {});
        this.renderNotes(data?.notes || []);
        this.renderVersionTimeline(data?.versions || []);
        ChangelogUtils.configureMarked();
      } catch (err) {
        console.error("Error during ChangelogRenderer rendering:", err);
      }
    }
    /**
     * Render recent updates section
     * @param {Array} recent - Recent updates data
     */
    /**
     * Render recent updates section with enhanced design
     * @param {Array} recent - Recent updates data
     */
    static renderRecentUpdates(recent) {
      const container = document.getElementById("recentUpdates");
      if (!container) return;
      if (!recent || recent.length === 0) {
        container.innerHTML = '<p class="text-[#8b949e] italic text-xs">No recent commits logged.</p>';
        return;
      }
      container.innerHTML = recent.map((update) => `
      <div class="flex items-start justify-between p-3.5 bg-[#161b22] border border-[#30363d] rounded-md hover:border-[#8b949e] transition-colors">
        <div class="flex items-center space-x-3 min-w-0">
          <code class="px-2 py-0.5 bg-[#21262d] text-[#58a6ff] rounded font-mono text-xs border border-[#30363d] flex-shrink-0">${update.hash.substring(0, 8)}</code>
          <p class="text-xs text-gray-200 truncate">${update.message}</p>
        </div>
        <span class="text-[11px] font-mono text-[#8b949e] flex-shrink-0 ml-3">${update.time}</span>
      </div>
    `).join("");
    }
    static renderFeatures(features) {
      const container = document.getElementById("featuresGrid");
      if (!container) return;
      if (!features || features.length === 0) {
        container.innerHTML = '<p class="text-[#8b949e] text-xs col-span-full">No features available.</p>';
        return;
      }
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
      container.innerHTML = Object.entries(features).map(([subsectionName, items]) => {
        const config = CATEGORY_ICONS[subsectionName] || { icon: "fa-star", color: "emerald" };
        return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#3fb950] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} items</span>
            </div>

            <div class="space-y-3">
              ${items.map((item) => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
      }).join("");
    }
    static renderTechnicalImprovements(technical) {
      const container = document.getElementById("technicalImprovements");
      if (!container) return;
      if (!technical || technical.length === 0) {
        container.innerHTML = '<p class="text-[#8b949e] text-xs">No technical improvements available.</p>';
        return;
      }
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
      container.innerHTML = Object.entries(technical).map(([subsectionName, items]) => {
        const config = CATEGORY_ICONS[subsectionName] || { icon: "fa-cogs", color: "purple" };
        return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#bc8cff] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} items</span>
            </div>

            <div class="space-y-3">
              ${items.map((item) => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
      }).join("");
    }
    static renderBugFixes(bugfixes) {
      const container = document.getElementById("bugFixes");
      if (!container) return;
      if (!bugfixes || bugfixes.length === 0) {
        container.innerHTML = '<p class="text-[#8b949e] text-xs">No bug fixes available.</p>';
        return;
      }
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
      container.innerHTML = Object.entries(bugfixes).map(([subsectionName, items]) => {
        const config = CATEGORY_ICONS[subsectionName] || { icon: "fa-bug", color: "red" };
        return `
        <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col justify-between hover:border-[#8b949e] transition-all">
          <div>
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-2.5">
                <i class="fas ${config.icon} text-[#f85149] text-sm"></i>
                <h3 class="text-sm font-semibold text-white">${subsectionName}</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">${items.length} fixes</span>
            </div>

            <div class="space-y-3">
              ${items.map((item) => `
                <div class="p-2.5 rounded bg-[#0d1117] border border-[#21262d]">
                  <h4 class="text-xs font-semibold text-gray-200 mb-1">${ChangelogUtils.renderMarkdown(item.title)}</h4>
                  <p class="text-xs text-[#8b949e] leading-relaxed">${ChangelogUtils.renderMarkdown(item.description)}</p>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
      }).join("");
    }
    static renderNotes(notes) {
      const container = document.getElementById("notesSection");
      if (!container) return;
      if (!notes || notes.length === 0) {
        container.innerHTML = "";
        return;
      }
      container.innerHTML = `
      <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h3 class="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
          <i class="fas fa-info-circle text-[#58a6ff]"></i>
          <span>Release Notes</span>
        </h3>
        <div class="space-y-2 text-xs text-[#8b949e]">
          ${notes.map((note) => `<p>${ChangelogUtils.renderMarkdown(note)}</p>`).join("")}
        </div>
      </div>
    `;
    }
    static renderVersionTimeline(versions) {
      const container = document.getElementById("versionTimeline");
      if (!container) return;
      if (!versions || versions.length === 0) {
        container.innerHTML = '<p class="text-[#8b949e] text-xs">No version history available.</p>';
        return;
      }
      container.innerHTML = versions.map((version, index) => {
        const isLatest = index === 0;
        return `
        <div class="timeline-item ${isLatest ? "latest-release" : ""}">
          <div class="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#21262d]">
              <div class="flex items-center space-x-3">
                <span class="font-mono text-base font-bold text-white">${version.version}</span>
                ${isLatest ? '<span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#238636] text-white">LATEST</span>' : ""}
              </div>
              <span class="text-xs font-mono text-[#8b949e]">${version.status || ""}</span>
            </div>
            
            ${version.features && version.features.length > 0 ? `
              <ul class="space-y-2 text-xs text-gray-300">
                ${version.features.map((feature) => `
                  <li class="flex items-start space-x-2">
                    <span class="text-[#58a6ff] font-bold mt-0.5">\u2022</span>
                    <span class="leading-relaxed text-gray-300">${ChangelogUtils.renderMarkdown(feature)}</span>
                  </li>
                `).join("")}
              </ul>
            ` : ""}
          </div>
        </div>
      `;
      }).join("");
    }
    /**
     * Show loading state
     */
    static showLoading() {
      const loadingState = document.getElementById("loadingState");
      const changelogContent = document.getElementById("changelogContent");
      if (loadingState && changelogContent) {
        loadingState.style.display = "block";
      }
    }
    /**
     * Show error state
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    static showError(message, error) {
      const loadingState = document.getElementById("loadingState");
      if (loadingState) {
        loadingState.innerHTML = `
        <div class="text-center">
          <i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-4"></i>
          <h3 class="text-xl font-semibold text-white mb-2">Failed to Load Changelog</h3>
          <p class="text-gray-400">Please check the console for details or try refreshing the page.</p>
          <p class="text-sm text-gray-500 mt-2">Error: ${error?.message || message}</p>
        </div>
      `;
      }
    }
    /**
     * Initialize smooth scrolling for navigation
     */
    static initializeNavigation() {
      document.querySelectorAll('nav a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", function(e) {
          e.preventDefault();
          const target = document.querySelector(this.getAttribute("href"));
          if (target) {
            target.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          }
        });
      });
    }
    /**
     * Initialize scroll animations
     */
    static initializeAnimations() {
      const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
      };
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-slide-up");
          }
        });
      }, observerOptions);
      document.querySelectorAll("main > section").forEach((section) => {
        observer.observe(section);
      });
    }
  };

  // lib/js/features/changelog/ui/PerformanceRenderer.js
  var PerformanceRenderer = {
    /**
     * Initialize performance visualization
     */
    initialize() {
      const container = document.getElementById("performanceStats");
      if (!container) return;
      this.updateStats();
      this.interval = setInterval(() => this.updateStats(), 2e3);
    },
    /**
     * Update the stats UI with latest metrics
     */
    updateStats() {
      const container = document.getElementById("performanceStats");
      if (!container || !window.performanceMonitor) return;
      const metrics = window.performanceMonitor.getMetrics();
      const recommendations = window.performanceMonitor.getRecommendations();
      const stats = [
        {
          label: "Memory Usage",
          value: this.getLatestMemory(metrics),
          unit: "MB",
          icon: "fa-memory",
          color: "text-purple-400",
          progress: this.getMemoryProgress(metrics)
        },
        {
          label: "Frame Rate",
          value: this.getLatestFPS(metrics),
          unit: "FPS",
          icon: "fa-tachometer-alt",
          color: "text-green-400",
          progress: this.getLatestFPS(metrics) / 60 * 100
        },
        {
          label: "Page Load",
          value: this.getMetricValue(metrics.fcp),
          unit: "ms",
          icon: "fa-bolt",
          color: "text-yellow-400",
          progress: Math.min(this.getMetricValue(metrics.fcp) / 2e3 * 100, 100)
        }
      ];
      container.innerHTML = stats.map((stat) => `
      <div class="bg-gray-800/50 border border-gray-700 p-6 rounded-xl space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="p-2 bg-gray-700 rounded-lg ${stat.color}">
              <i class="fas ${stat.icon}"></i>
            </div>
            <span class="text-gray-300 font-medium">${stat.label}</span>
          </div>
          <span class="text-2xl font-bold text-white">${stat.value}<span class="text-xs text-gray-500 ml-1">${stat.unit}</span></span>
        </div>
        
        <div class="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500" 
               style="width: ${Math.min(stat.progress, 100)}%"></div>
        </div>
      </div>
    `).join("");
      if (recommendations.length > 0) {
        const recContainer = document.createElement("div");
        recContainer.className = "col-span-full mt-4 p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-yellow-200 text-sm";
        recContainer.innerHTML = `
            <div class="flex items-center space-x-2 mb-2">
                <i class="fas fa-lightbulb text-yellow-400"></i>
                <span class="font-bold uppercase tracking-wider">Optimization Suggestions</span>
            </div>
            <ul class="list-disc list-inside space-y-1 opacity-80">
                ${recommendations.map((rec) => `<li>${rec}</li>`).join("")}
            </ul>
        `;
        container.appendChild(recContainer);
      }
    },
    getMetricValue(metric) {
      return metric ? Math.round(metric.value) : 0;
    },
    getLatestMemory(metrics) {
      if (metrics.memoryStats && metrics.memoryStats.length > 0) {
        return metrics.memoryStats[metrics.memoryStats.length - 1].used;
      }
      return 0;
    },
    getMemoryProgress(metrics) {
      if (metrics.memoryStats && metrics.memoryStats.length > 0) {
        const latest = metrics.memoryStats[metrics.memoryStats.length - 1];
        return latest.used / latest.limit * 100;
      }
      return 0;
    },
    getLatestFPS(metrics) {
      if (metrics.fpsStats && metrics.fpsStats.length > 0) {
        return metrics.fpsStats[metrics.fpsStats.length - 1].fps;
      }
      return 60;
    }
  };

  // lib/js/features/changelog/changelog.js
  async function loadLatestVersion() {
    try {
      const metadata = await ChangelogApiService.loadChangelogMetadata();
      ChangelogRenderer.updateVersion(metadata.version);
      ChangelogRenderer.updateDate(metadata.date);
      ChangelogRenderer.updateFooterDate(metadata.date);
      ChangelogRenderer.updateCommitCount(metadata.commitCount);
      return metadata.version;
    } catch (error) {
      console.warn("Error loading changelog metadata:", error);
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
        console.error("Both metadata and fallback failed:", fallbackError);
        ChangelogRenderer.updateVersion("v5.4.0");
        ChangelogRenderer.updateDate("Jul 25, 2026");
        ChangelogRenderer.updateFooterDate("Jul 25, 2026");
        ChangelogRenderer.updateCommitCount(50);
        return "v5.4.0";
      }
    }
  }
  async function loadChangelog() {
    try {
      const changelogContent = await ChangelogApiService.fetchChangelog();
      const parsedData = ChangelogParserService.parseChangelog(changelogContent);
      ChangelogRenderer.renderChangelog(parsedData);
    } catch (error) {
      console.error("Error loading changelog:", error);
      ChangelogRenderer.showError("Failed to load changelog", error);
    }
  }
  function isChangelogPage() {
    return document.getElementById("loadingState") !== null;
  }
  function initializeChangelog() {
    loadLatestVersion();
    if (!isChangelogPage()) {
      return;
    }
    ChangelogRenderer.showLoading();
    ChangelogRenderer.initializeNavigation();
    ChangelogRenderer.initializeAnimations();
    PerformanceRenderer.initialize();
    loadChangelog();
  }
  window.loadLatestVersion = loadLatestVersion;
  window.initializeChangelog = initializeChangelog;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeChangelog);
  } else {
    initializeChangelog();
  }
})();
