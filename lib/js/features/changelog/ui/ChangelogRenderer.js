/**
 * Changelog renderer
 *
 * Builds DOM nodes from parsed data. Text always arrives through
 * `document.createTextNode`, so nothing in CHANGELOG.md can inject markup.
 */

import { GROUP_MODIFIERS, SELECTORS, UNRELEASED_LABEL } from '../utils/ChangelogConfig.js';
import { ChangelogUtils } from '../utils/ChangelogUtils.js';

/**
 * Create an element with optional class and text.
 * @param {string} tag - Tag name.
 * @param {string} [className] - Class attribute.
 * @param {string} [text] - Text content.
 * @returns {HTMLElement} The new element.
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export class ChangelogRenderer {
  /**
   * Write the current version into the header badge.
   * @param {string} version - Version number without the `v`.
   */
  static updateVersion(version) {
    const badge = document.getElementById(SELECTORS.version);
    if (badge) badge.textContent = version ? `v${version}` : '';
  }

  /** Hide the loading placeholder. */
  static hideLoading() {
    const loading = document.getElementById(SELECTORS.loading);
    if (loading) loading.hidden = true;
  }

  /**
   * Replace the page body with an error message.
   * @param {string} message - Text to show the reader.
   */
  static showError(message) {
    ChangelogRenderer.hideLoading();
    const target = document.getElementById(SELECTORS.error);
    if (!target) return;
    target.hidden = false;
    target.textContent = message;
  }

  /**
   * Render inline markdown tokens into a parent node.
   * @param {Node} parent - Node to append to.
   * @param {string} text - Raw inline markdown.
   * @param {number} [depth] - Recursion guard for nested emphasis.
   */
  static appendInline(parent, text, depth = 0) {
    for (const token of ChangelogUtils.tokenizeInline(text)) {
      if (token.type === 'code') {
        parent.appendChild(el('code', 'cl-code', token.value));
      } else if (token.type === 'strong') {
        const strong = el('strong', 'cl-strong');
        if (depth < 2) ChangelogRenderer.appendInline(strong, token.value, depth + 1);
        else strong.textContent = token.value;
        parent.appendChild(strong);
      } else if (token.type === 'link') {
        const link = el('a', 'cl-link', token.value);
        link.href = token.href;
        link.rel = 'noopener noreferrer';
        parent.appendChild(link);
      } else {
        parent.appendChild(document.createTextNode(token.value));
      }
    }
  }

  /**
   * Build one release section.
   * @param {Object} release - Parsed release.
   * @returns {HTMLElement} The `<section>` for this release.
   */
  static buildRelease(release) {
    const section = el('section', 'cl-release');
    section.id = ChangelogUtils.slug(release.version);

    const header = el('header', 'cl-release__head');
    const heading = el('h2', 'cl-release__version', release.label ? release.label : `v${release.version}`);
    header.appendChild(heading);

    if (release.date) {
      const time = el('time', 'cl-release__date', ChangelogUtils.formatDate(release.date));
      time.dateTime = release.date;
      header.appendChild(time);
    }
    section.appendChild(header);

    for (const paragraph of release.summary) {
      const p = el('p', 'cl-release__summary');
      ChangelogRenderer.appendInline(p, paragraph);
      section.appendChild(p);
    }

    if (!release.groups.length) {
      section.appendChild(el('p', 'cl-release__empty', 'Nothing here yet.'));
      return section;
    }

    for (const group of release.groups) {
      const block = el('div', 'cl-group');
      const modifier = GROUP_MODIFIERS[group.name];
      const label = el('h3', `cl-group__label${modifier ? ` cl-group__label--${modifier}` : ''}`, group.name);
      block.appendChild(label);

      const list = el('ul', 'cl-group__list');
      for (const item of group.items) {
        const li = el('li', 'cl-entry');
        ChangelogRenderer.appendInline(li, item);
        list.appendChild(li);
      }
      block.appendChild(list);
      section.appendChild(block);
    }

    return section;
  }

  /**
   * Render every release plus the version index.
   * @param {{releases: Array<Object>}} data - Parsed changelog.
   */
  static renderChangelog(data) {
    const releases = data.releases || [];
    const list = document.getElementById(SELECTORS.releases);
    const index = document.getElementById(SELECTORS.index);
    const select = document.getElementById(SELECTORS.indexSelect);

    if (list) {
      list.replaceChildren(...releases.map((release) => ChangelogRenderer.buildRelease(release)));
    }

    if (index) index.replaceChildren();
    if (select) select.replaceChildren();

    for (const release of releases) {
      const href = `#${ChangelogUtils.slug(release.version)}`;
      const name = release.label ? release.label : `v${release.version}`;

      if (index) {
        const li = el('li', 'cl-index__item');
        const link = el('a', 'cl-index__link');
        link.href = href;
        link.appendChild(el('span', 'cl-index__version', name));
        if (release.date) link.appendChild(el('span', 'cl-index__date', release.date));
        li.appendChild(link);
        index.appendChild(li);
      }

      if (select) {
        const option = el('option', null, release.date ? `${name} — ${release.date}` : name);
        option.value = href;
        select.appendChild(option);
      }
    }

    ChangelogRenderer.hideLoading();
  }

  /**
   * Find the newest released (dated, non-Unreleased) version.
   * @param {{releases: Array<Object>}} data - Parsed changelog.
   * @returns {string} Version number, or an empty string.
   */
  static latestVersion(data) {
    const release = (data.releases || []).find((entry) => entry.version !== UNRELEASED_LABEL);
    return release ? release.version : '';
  }
}
