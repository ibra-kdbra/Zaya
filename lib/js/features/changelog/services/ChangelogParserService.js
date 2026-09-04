/**
 * Keep a Changelog parser
 *
 * Turns CHANGELOG.md into plain data:
 *   { releases: [ { version, label, date, summary: [string], groups: [ { name, items: [string] } ] } ] }
 *
 * It understands `## [1.2.3] - 2026-09-04`, `## [Unreleased]` and `### Added`
 * style group headings, plus list items that wrap onto indented lines.
 */

import { GROUP_ORDER, UNRELEASED_LABEL } from '../utils/ChangelogConfig.js';

const RELEASE_HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s*[-–]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const GROUP_HEADING = /^###\s+(.+?)\s*$/;
const LIST_ITEM = /^[-*]\s+(.*)$/;

export class ChangelogParserService {
  /**
   * Parse a Keep a Changelog document.
   * @param {string} markdown - Raw file contents.
   * @returns {{releases: Array<Object>}} Structured releases, newest first.
   */
  static parseChangelog(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const releases = [];

    let release = null;
    let group = null;
    let item = null;

    const flushItem = () => {
      if (item && group) group.items.push(item.trim());
      item = null;
    };
    const flushGroup = () => {
      flushItem();
      if (group && group.items.length && release) release.groups.push(group);
      group = null;
    };
    const flushRelease = () => {
      flushGroup();
      if (release) releases.push(release);
      release = null;
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');

      const releaseMatch = line.startsWith('## ') && RELEASE_HEADING.exec(line);
      if (releaseMatch) {
        flushRelease();
        const name = releaseMatch[1];
        const isUnreleased = name.toLowerCase() === UNRELEASED_LABEL.toLowerCase();
        release = {
          version: isUnreleased ? UNRELEASED_LABEL : name,
          label: isUnreleased ? UNRELEASED_LABEL : null,
          date: releaseMatch[2] || '',
          summary: [],
          groups: []
        };
        continue;
      }

      if (!release) continue;

      const groupMatch = line.startsWith('### ') && GROUP_HEADING.exec(line);
      if (groupMatch) {
        flushGroup();
        group = { name: ChangelogParserService.normaliseGroup(groupMatch[1]), items: [] };
        continue;
      }

      const itemMatch = LIST_ITEM.exec(line);
      if (itemMatch && group) {
        flushItem();
        item = itemMatch[1];
        continue;
      }

      if (!line.trim()) {
        flushItem();
        continue;
      }

      if (item) {
        item += ` ${line.trim()}`;
      } else if (!group) {
        const previous = release.summary[release.summary.length - 1];
        if (previous === undefined || previous === '') release.summary.push(line.trim());
        else release.summary[release.summary.length - 1] = `${previous} ${line.trim()}`;
      }
    }

    flushRelease();

    return { releases: releases.map(ChangelogParserService.sortGroups) };
  }

  /**
   * Match a heading against the known group names, case-insensitively.
   * @param {string} name - Raw heading text.
   * @returns {string} Canonical group name, or the heading as written.
   */
  static normaliseGroup(name) {
    const canonical = GROUP_ORDER.find((known) => known.toLowerCase() === name.trim().toLowerCase());
    return canonical || name.trim();
  }

  /**
   * Order a release's groups the way Keep a Changelog lists them.
   * @param {Object} release - A parsed release.
   * @returns {Object} The same release with ordered groups.
   */
  static sortGroups(release) {
    const rank = (name) => {
      const index = GROUP_ORDER.indexOf(name);
      return index === -1 ? GROUP_ORDER.length : index;
    };
    release.groups.sort((a, b) => rank(a.name) - rank(b.name));
    return release;
  }
}
