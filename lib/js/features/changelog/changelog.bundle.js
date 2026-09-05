(() => {
  // lib/js/features/changelog/utils/ChangelogConfig.js
  var CHANGELOG_PATH = "CHANGELOG.md";
  var ISSUE_URL_BASE = "https://github.com/ibra-kdbra/Zaya/issues/";
  var GROUP_ORDER = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
  var GROUP_MODIFIERS = {
    Added: "added",
    Changed: "changed",
    Deprecated: "deprecated",
    Removed: "removed",
    Fixed: "fixed",
    Security: "security"
  };
  var UNRELEASED_LABEL = "Unreleased";
  var SELECTORS = {
    version: "currentVersion",
    releases: "releaseList",
    index: "versionIndex",
    indexSelect: "versionSelect",
    loading: "loadingState",
    error: "errorState"
  };
  var FALLBACK_MESSAGE = "The changelog could not be loaded. Open this page over http(s) so CHANGELOG.md can be fetched.";

  // lib/js/features/changelog/services/ChangelogApiService.js
  var ChangelogApiService = class {
    /**
     * Fetch the raw markdown of CHANGELOG.md.
     * @returns {Promise<string>} The document text.
     * @throws {Error} When the file cannot be read.
     */
    static async fetchChangelog() {
      const response = await fetch(CHANGELOG_PATH, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`CHANGELOG.md responded with ${response.status}`);
      }
      return response.text();
    }
  };

  // lib/js/features/changelog/services/ChangelogParserService.js
  var RELEASE_HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s*[-–]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
  var GROUP_HEADING = /^###\s+(.+?)\s*$/;
  var LIST_ITEM = /^[-*]\s+(.*)$/;
  var ChangelogParserService = class _ChangelogParserService {
    /**
     * Parse a Keep a Changelog document.
     * @param {string} markdown - Raw file contents.
     * @returns {{releases: Array<Object>}} Structured releases, newest first.
     */
    static parseChangelog(markdown) {
      const lines = String(markdown || "").split(/\r?\n/);
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
        const line = raw.replace(/\s+$/, "");
        const releaseMatch = line.startsWith("## ") && RELEASE_HEADING.exec(line);
        if (releaseMatch) {
          flushRelease();
          const name = releaseMatch[1];
          const isUnreleased = name.toLowerCase() === UNRELEASED_LABEL.toLowerCase();
          release = {
            version: isUnreleased ? UNRELEASED_LABEL : name,
            label: isUnreleased ? UNRELEASED_LABEL : null,
            date: releaseMatch[2] || "",
            summary: [],
            groups: []
          };
          continue;
        }
        if (!release) continue;
        const groupMatch = line.startsWith("### ") && GROUP_HEADING.exec(line);
        if (groupMatch) {
          flushGroup();
          group = { name: _ChangelogParserService.normaliseGroup(groupMatch[1]), items: [] };
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
          if (previous === void 0 || previous === "") release.summary.push(line.trim());
          else release.summary[release.summary.length - 1] = `${previous} ${line.trim()}`;
        }
      }
      flushRelease();
      return { releases: releases.map(_ChangelogParserService.sortGroups) };
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
  };

  // lib/js/features/changelog/utils/ChangelogUtils.js
  var INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(?:(?<![\w#])#(\d+)\b)/g;
  var ChangelogUtils = class _ChangelogUtils {
    /**
     * Format an ISO date as `4 September 2026`.
     * @param {string} iso - Date in `YYYY-MM-DD` form.
     * @returns {string} Human readable date, or the input when it is not a date.
     */
    static formatDate(iso) {
      if (!iso) return "";
      const date = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return iso;
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
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
      const source = String(text || "");
      let cursor = 0;
      INLINE_PATTERN.lastIndex = 0;
      let match = INLINE_PATTERN.exec(source);
      while (match) {
        if (match.index > cursor) {
          tokens.push({ type: "text", value: source.slice(cursor, match.index) });
        }
        if (match[1]) {
          tokens.push({ type: "code", value: match[1].slice(1, -1) });
        } else if (match[2]) {
          tokens.push({ type: "strong", value: match[2].slice(2, -2) });
        } else if (match[3]) {
          const split = match[3].indexOf("](");
          tokens.push({
            type: "link",
            value: match[3].slice(1, split),
            href: _ChangelogUtils.safeHref(match[3].slice(split + 2, -1))
          });
        } else if (match[4]) {
          tokens.push({ type: "link", value: `#${match[4]}`, href: ISSUE_URL_BASE + match[4] });
        }
        cursor = match.index + match[0].length;
        match = INLINE_PATTERN.exec(source);
      }
      if (cursor < source.length) {
        tokens.push({ type: "text", value: source.slice(cursor) });
      }
      return tokens;
    }
    /**
     * Allow only http(s) links; anything else becomes a plain fragment.
     * @param {string} href - Candidate URL.
     * @returns {string} A safe href.
     */
    static safeHref(href) {
      return /^https?:\/\//i.test(href) ? href : "#";
    }
    /**
     * Turn a version into an anchor id (`6.0.0` -> `v6-0-0`).
     * @param {string} version - Version or label.
     * @returns {string} DOM id.
     */
    static slug(version) {
      return `v${String(version).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    }
  };

  // lib/js/features/changelog/ui/ChangelogRenderer.js
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0 && text !== null) node.textContent = text;
    return node;
  }
  var ChangelogRenderer = class _ChangelogRenderer {
    /**
     * Write the current version into the header badge.
     * @param {string} version - Version number without the `v`.
     */
    static updateVersion(version) {
      const badge = document.getElementById(SELECTORS.version);
      if (badge) badge.textContent = version ? `v${version}` : "";
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
      _ChangelogRenderer.hideLoading();
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
        if (token.type === "code") {
          parent.appendChild(el("code", "cl-code", token.value));
        } else if (token.type === "strong") {
          const strong = el("strong", "cl-strong");
          if (depth < 2) _ChangelogRenderer.appendInline(strong, token.value, depth + 1);
          else strong.textContent = token.value;
          parent.appendChild(strong);
        } else if (token.type === "link") {
          const link = el("a", "cl-link", token.value);
          link.href = token.href;
          link.rel = "noopener noreferrer";
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
      const section = el("section", "cl-release");
      section.id = ChangelogUtils.slug(release.version);
      const header = el("header", "cl-release__head");
      const heading = el("h2", "cl-release__version", release.label ? release.label : `v${release.version}`);
      header.appendChild(heading);
      if (release.date) {
        const time = el("time", "cl-release__date", ChangelogUtils.formatDate(release.date));
        time.dateTime = release.date;
        header.appendChild(time);
      }
      section.appendChild(header);
      for (const paragraph of release.summary) {
        const p = el("p", "cl-release__summary");
        _ChangelogRenderer.appendInline(p, paragraph);
        section.appendChild(p);
      }
      if (!release.groups.length) {
        section.appendChild(el("p", "cl-release__empty", "Nothing here yet."));
        return section;
      }
      for (const group of release.groups) {
        const block = el("div", "cl-group");
        const modifier = GROUP_MODIFIERS[group.name];
        const label = el("h3", `cl-group__label${modifier ? ` cl-group__label--${modifier}` : ""}`, group.name);
        block.appendChild(label);
        const list = el("ul", "cl-group__list");
        for (const item of group.items) {
          const li = el("li", "cl-entry");
          _ChangelogRenderer.appendInline(li, item);
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
        list.replaceChildren(...releases.map((release) => _ChangelogRenderer.buildRelease(release)));
      }
      if (index) index.replaceChildren();
      if (select) select.replaceChildren();
      for (const release of releases) {
        const href = `#${ChangelogUtils.slug(release.version)}`;
        const name = release.label ? release.label : `v${release.version}`;
        if (index) {
          const li = el("li", "cl-index__item");
          const link = el("a", "cl-index__link");
          link.href = href;
          link.appendChild(el("span", "cl-index__version", name));
          if (release.date) link.appendChild(el("span", "cl-index__date", release.date));
          li.appendChild(link);
          index.appendChild(li);
        }
        if (select) {
          const option = el("option", null, release.date ? `${name} \u2014 ${release.date}` : name);
          option.value = href;
          select.appendChild(option);
        }
      }
      _ChangelogRenderer.hideLoading();
    }
    /**
     * Find the newest released (dated, non-Unreleased) version.
     * @param {{releases: Array<Object>}} data - Parsed changelog.
     * @returns {string} Version number, or an empty string.
     */
    static latestVersion(data) {
      const release = (data.releases || []).find((entry) => entry.version !== UNRELEASED_LABEL);
      return release ? release.version : "";
    }
  };

  // lib/js/features/changelog/changelog.js
  function bindVersionSelect() {
    const select = document.getElementById(SELECTORS.indexSelect);
    if (!select) return;
    select.addEventListener("change", () => {
      const target = document.querySelector(select.value);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", select.value);
      }
    });
  }
  async function initializeChangelog() {
    bindVersionSelect();
    try {
      const markdown = await ChangelogApiService.fetchChangelog();
      const data = ChangelogParserService.parseChangelog(markdown);
      ChangelogRenderer.updateVersion(ChangelogRenderer.latestVersion(data));
      ChangelogRenderer.renderChangelog(data);
    } catch (error) {
      console.warn("Changelog unavailable:", error);
      ChangelogRenderer.showError(FALLBACK_MESSAGE);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeChangelog);
  } else {
    initializeChangelog();
  }
})();
