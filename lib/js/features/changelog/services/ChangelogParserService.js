/**
 * Changelog Parser Service
 * Handles parsing CHANGELOG.md content into structured data
 */

import {
  CHANGELOG_SECTIONS,
  CHANGELOG_HEADERS,
  SUBSECTION_PREFIXES,
  REGEX_PATTERNS
} from '../utils/ChangelogConfig.js';
import { ChangelogUtils } from '../utils/ChangelogUtils.js';

export class ChangelogParserService {
  /**
   * Parse the entire CHANGELOG.md content
   * @param {string} markdown - Raw markdown content
   * @returns {Object} Parsed changelog data
   */
  static parseChangelog(markdown) {
    const lines = markdown.split('\n');
    const data = {
      recent: [],
      features: {},
      technical: {},
      bugfixes: {},
      versions: [],
      notes: []
    };

    let currentSection = '';
    let currentSubsection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect main sections
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

      // Check for version entries anywhere in the file
      if (line.startsWith('###') && line.includes('v')) {
        this.parseVersionsSection(line, i, data, lines);
      }

      // Parse section content
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
    if (line.startsWith('- `')) {
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

    // Check for subsection headers
    if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.FEATURES])) {
      newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
      // Initialize subsection array if not exists
      if (!data.features[newSubsection]) {
        data.features[newSubsection] = [];
      }
    }
    // Check for feature items
    else if (ChangelogUtils.isItemLine(line)) {
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

    // Check for subsection headers
    if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.TECHNICAL])) {
      newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
      // Initialize subsection array if not exists
      if (!data.technical[newSubsection]) {
        data.technical[newSubsection] = [];
      }
    }
    // Check for technical items
    else if (ChangelogUtils.isItemLine(line) && newSubsection) {
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

    // Check for subsection headers
    if (ChangelogUtils.isSubsectionLine(line, SUBSECTION_PREFIXES[CHANGELOG_SECTIONS.BUGFIXES])) {
      newSubsection = ChangelogUtils.cleanSubsectionTitle(line);
      // Initialize subsection array if not exists
      if (!data.bugfixes[newSubsection]) {
        data.bugfixes[newSubsection] = [];
      }
    }
    // Check for bug fix items
    else if (ChangelogUtils.isItemLine(line) && newSubsection) {
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
    if (line.startsWith('###')) {
      const match = line.match(/(v\d+\.\d+\.\d+)/);
      if (match) {
        const verStr = match[1];
        if (data.versions.some(v => v.version === verStr)) return;

        const version = {
          version: verStr,
          status: line.includes('Latest') ? 'Latest Release' : 'Release',
          features: []
        };

        // Collect features for this version
        let j = lineIndex + 1;
        while (j < allLines.length && !allLines[j].startsWith('###') && !allLines[j].startsWith('---') && !allLines[j].startsWith('##')) {
          const featureLine = allLines[j].trim();
          if (featureLine.startsWith('- ')) {
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
    if (line.startsWith('- ')) {
      let note = line.substring(2).replace(/^\*\*(.+)\*\*$/, '$1'); // Strip ** if present
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
}
