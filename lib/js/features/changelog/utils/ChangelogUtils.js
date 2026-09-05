/**
 * Changelog utilities
 * Date formatting and a very small inline-markdown tokenizer.
 *
 * Nothing here produces HTML strings: the renderer turns tokens into text nodes
 * and elements, so changelog content can never be interpreted as markup.
 */

import { ISSUE_URL_BASE } from './ChangelogConfig.js';

const INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(?:(?<![\w#])#(\d+)\b)/g;

export class ChangelogUtils {
  /**
   * Format an ISO date as `4 September 2026`.
   * @param {string} iso - Date in `YYYY-MM-DD` form.
   * @returns {string} Human readable date, or the input when it is not a date.
   */
  static formatDate(iso) {
    if (!iso) return '';
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    });
  }

  /**
   * Split inline markdown into tokens the renderer can build nodes from.
   * Supported: `code`, **strong**, [text](url) and bare `#123` issue references.
   * @param {string} text - Raw inline markdown.
   * @returns {Array<{type: string, value: string, href?: string}>} Token list.
   */
  static tokenizeInline(text) {
    const tokens = [];
    const source = String(text || '');
    let cursor = 0;

    INLINE_PATTERN.lastIndex = 0;
    let match = INLINE_PATTERN.exec(source);
    while (match) {
      if (match.index > cursor) {
        tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
      }

      if (match[1]) {
        tokens.push({ type: 'code', value: match[1].slice(1, -1) });
      } else if (match[2]) {
        tokens.push({ type: 'strong', value: match[2].slice(2, -2) });
      } else if (match[3]) {
        const split = match[3].indexOf('](');
        tokens.push({
          type: 'link',
          value: match[3].slice(1, split),
          href: ChangelogUtils.safeHref(match[3].slice(split + 2, -1))
        });
      } else if (match[4]) {
        tokens.push({ type: 'link', value: `#${match[4]}`, href: ISSUE_URL_BASE + match[4] });
      }

      cursor = match.index + match[0].length;
      match = INLINE_PATTERN.exec(source);
    }

    if (cursor < source.length) {
      tokens.push({ type: 'text', value: source.slice(cursor) });
    }
    return tokens;
  }

  /**
   * Allow only http(s) links; anything else becomes a plain fragment.
   * @param {string} href - Candidate URL.
   * @returns {string} A safe href.
   */
  static safeHref(href) {
    return /^https?:\/\//i.test(href) ? href : '#';
  }

  /**
   * Turn a version into an anchor id (`6.0.0` -> `v6-0-0`).
   * @param {string} version - Version or label.
   * @returns {string} DOM id.
   */
  static slug(version) {
    return `v${String(version).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }
}
