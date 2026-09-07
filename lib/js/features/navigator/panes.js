/**
 * The Navigator's Pages and Outline panes, and the frame the Search pane lives in.
 *
 * The engine used to build these itself and the application borrowed the markup. It does not any
 * more: `engine-next` offers `getThumbnail`, `getOutline` and `getPageLabel` as data and nothing
 * else, so the three panes below are ordinary application interface, built from the same tokens
 * and the same dictionaries as the rest of the reader.
 *
 * The book is reached only through the handle `lib/js/core/book.js` hands in, which is the
 * facade's own `ZayaBook.current`; nothing here knows what draws a page. The facade calls
 * `ensure` / `get` / `setActive` for its `ensurePanel` / `panel` / `setPanelActive`, and the
 * Navigator (`features/controls/custom-controls.js`) shows and hides whichever pane it wants by
 * toggling `nav-pane-visible`, exactly as it did when the panes were the engine's.
 *
 * Every pane is built into `#navigatorBody` and lives there for one document. Opening another
 * one calls `reset()` and the three are built again from the new book.
 */
import { createSearchPanel } from "../search/search-panel.js";

const PANE_ID = { thumbs: "navPaneThumbs", outline: "navPaneOutline", search: "navPaneSearch" };
const TAB_ID = { thumbs: "navTabThumbs", outline: "navTabOutline", search: "navTabSearch" };

/** One tile per column needs about this much room before a second column is worth having. */
const COLUMN_WIDTH = 200;
/** How wide a thumbnail is asked for, in CSS pixels, before the device pixel ratio. */
const THUMB_WIDTH = 200;

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function host() {
  return document.getElementById("navigatorBody");
}

/** The shell every pane shares: the class the Navigator toggles, and the tab wiring. */
function makePane(name, className) {
  const pane = element("div", `nav-pane ${className}`);
  pane.id = PANE_ID[name];
  pane.dataset.navTab = name;
  pane.setAttribute("role", "tabpanel");
  pane.setAttribute("aria-labelledby", TAB_ID[name]);
  pane.tabIndex = 0;
  return pane;
}

/* ------------------------------------------------------------------------------- Pages pane */

/**
 * A tile per PDF page: a picture of the page and what the page calls itself. The pictures are
 * fetched as the reader scrolls to them and kept afterwards, so a list scrolled twice renders
 * nothing twice — the engine's own thumbnail cache hands the same canvas back either way.
 */
function buildPages(book) {
  const pane = makePane("thumbs", "nav-pages");
  const list = element("div", "nav-pages-list");
  pane.appendChild(list);

  const doc = book.pdfDocument;
  const count = doc && doc.numPages ? doc.numPages : 0;
  const tiles = [];

  for (let n = 1; n <= count; n++) {
    const tile = element("button", "nav-page");
    tile.type = "button";
    tile.dataset.pdfPage = String(n);
    tile.setAttribute("aria-label", t("nav.pageTile", { n }));
    const frame = element("div", "nav-page-img");
    const num = element("span", "nav-page-num", String(n));
    tile.append(frame, num);
    list.appendChild(tile);
    tiles.push({ tile, frame, num, page: n, painted: false });
    book.getPageLabel(n).then((label) => { num.textContent = label; }).catch(() => { /* the number stands */ });
  }

  const paint = (entry) => {
    if (entry.painted) return;
    entry.painted = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    book.getThumbnail(entry.page, Math.round(THUMB_WIDTH * dpr))
      .then((canvas) => {
        // The canvas belongs to the engine's cache; it is placed, never resized or drawn on.
        if (canvas.parentElement !== entry.frame) entry.frame.replaceChildren(canvas);
      })
      .catch(() => { entry.painted = false; });
  };

  let watcher = null;
  if (typeof IntersectionObserver === "function") {
    watcher = new IntersectionObserver((records) => {
      records.forEach((record) => {
        if (!record.isIntersecting) return;
        const entry = tiles.find((e) => e.tile === record.target);
        if (entry) { paint(entry); watcher.unobserve(record.target); }
      });
    }, { root: list, rootMargin: "300px 0px" });
    tiles.forEach((entry) => watcher.observe(entry.tile));
  } else {
    tiles.forEach(paint);
  }

  list.addEventListener("click", (event) => {
    const tile = event.target.closest ? event.target.closest(".nav-page") : null;
    if (!tile) return;
    event.stopPropagation();
    const pdfPage = Number(tile.dataset.pdfPage);
    if (pdfPage) book.gotoPage(book.toBookPage(pdfPage));
  });

  /** The tile for the page being read carries the ring and the accent number. */
  const mark = () => {
    const current = book.disposed ? 0 : book.toPdfPage(book.activePage);
    tiles.forEach((entry) => entry.tile.classList.toggle("is-current", entry.page === current));
  };
  mark();

  /* One column per 200 pixels: a phone sheet gets two, a docked drawer one. */
  const columns = () => {
    const width = list.clientWidth || pane.clientWidth;
    if (!width) return;
    pane.style.setProperty("--nav-page-cols", String(Math.max(1, Math.floor(width / COLUMN_WIDTH))));
  };
  let sizer = null;
  if (typeof ResizeObserver === "function") {
    sizer = new ResizeObserver(columns);
    sizer.observe(pane);
  } else {
    window.addEventListener("resize", columns);
  }
  columns();

  document.addEventListener("zaya:pageChanged", mark);
  const relabel = () => tiles.forEach((entry) => entry.tile.setAttribute("aria-label", t("nav.pageTile", { n: entry.page })));
  document.addEventListener("zaya:languageChanged", relabel);

  return {
    pane,
    dispose() {
      if (watcher) watcher.disconnect();
      if (sizer) sizer.disconnect(); else window.removeEventListener("resize", columns);
      document.removeEventListener("zaya:pageChanged", mark);
      document.removeEventListener("zaya:languageChanged", relabel);
    }
  };
}

/* ----------------------------------------------------------------------------- Outline pane */

/**
 * The document's chapters, as the engine resolved them: a title, the PDF page it points at, and
 * its children. An entry with children carries a chevron that folds them away; an entry whose
 * destination could not be resolved (`pdfPage: 0`) is a heading and turns nothing.
 */
function buildOutline(book) {
  /*
   * `df-outline-container` is not a name this file styles or reads — every rule and every query
   * uses `nav-outline`. It stays on the root because `tests/engine-contract.spec.mjs`, which is
   * frozen for exactly this kind of change, counts elements by it to check that a second
   * document replaces the pane rather than adding one. It goes when that test is next revised.
   */
  const pane = makePane("outline", "nav-outline df-outline-container");
  const list = element("div", "nav-outline-list");
  pane.appendChild(list);

  const render = (items, into) => {
    items.forEach((item) => {
      const row = element("div", "nav-outline-item");
      const kids = item.children && item.children.length ? element("div", "nav-outline-kids") : null;

      if (kids) {
        const toggle = element("button", "nav-outline-toggle");
        toggle.type = "button";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", t("nav.expand"));
        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          const open = toggle.getAttribute("aria-expanded") !== "true";
          toggle.setAttribute("aria-expanded", open ? "true" : "false");
          toggle.setAttribute("aria-label", t(open ? "nav.collapse" : "nav.expand"));
          kids.hidden = !open;
        });
        row.appendChild(toggle);
      }

      const link = element("button", "nav-outline-link", item.title || "");
      link.type = "button";
      if (item.pdfPage > 0) {
        link.dataset.pdfPage = String(item.pdfPage);
      } else {
        link.classList.add("is-heading");
        link.disabled = true;
      }
      row.appendChild(link);

      if (kids) {
        kids.hidden = true;
        render(item.children, kids);
        row.appendChild(kids);
      }
      into.appendChild(row);
    });
  };

  book.getOutline().then((items) => {
    if (!book.disposed) render(items || [], list);
    // The Navigator decides whether a pane is empty by looking inside it; tell it to look again.
    if (window.ZayaNavigator && window.ZayaNavigator.refresh) window.ZayaNavigator.refresh();
  }).catch(() => { /* an outline that will not load is an outline the reader does not get */ });

  list.addEventListener("click", (event) => {
    const link = event.target.closest ? event.target.closest(".nav-outline-link") : null;
    if (!link || !link.dataset.pdfPage) return;
    event.stopPropagation();
    book.gotoPage(book.toBookPage(Number(link.dataset.pdfPage)));
  });

  return { pane, dispose() { /* nothing outside the pane to let go of */ } };
}

/* ------------------------------------------------------------------------------ Search pane */

/**
 * The frame; everything inside it is `features/search/search-panel.js`, which owns the field,
 * the results and the offer to recognise pages that carry no text.
 */
function buildSearch(book) {
  const pane = makePane("search", "nav-search");
  const panel = createSearchPanel({
    container: pane,
    pdfDocument: book.pdfDocument,
    docKey: window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : "",
    pageCount: book.pageCount,
    activePage: () => book.activePage,
    toBookPage: (p) => book.toBookPage(p),
    onHighlight: (query) => book.setSearchHighlight(query),
    onRefreshHighlights: () => book.refreshVisiblePages(),
    onGotoPage: (page) => book.gotoPage(page)
  });
  return { pane, panel, dispose() { panel.dispose(); } };
}

/* ----------------------------------------------------------------------------------- the API */

const BUILDERS = { thumbs: buildPages, outline: buildOutline, search: buildSearch };

/** The panes that exist, and the book they were built from. */
const built = { thumbs: null, outline: null, search: null };
let owner = null;
/** The kinds the reader has asked for, so a new document brings back the same ones. */
const wanted = new Set();

/** Take the panes down: dispose what they hold, and take their elements out of the drawer. */
function discard() {
  Object.keys(built).forEach((name) => {
    const made = built[name];
    if (!made) return;
    built[name] = null;
    try { made.dispose(); } catch (err) { /* already gone */ }
    if (made.pane.parentElement) made.pane.remove();
  });
  owner = null;
}

window.ZayaPanes = {
  /**
   * Build a pane if it is not there yet, and hand back its root element.
   *
   * While a new document is still opening there is nothing to build from, so whatever is on
   * screen is handed back rather than taken away: the drawer keeps showing the last document's
   * pane until `adopt` swaps in the new one. That is also what stops it flashing empty.
   *
   * @param {"thumbs"|"outline"|"search"} name
   * @param {object} book the ZayaBook handle
   * @returns {Element|null} null for an unknown name, and before anything has ever been built
   */
  ensure(name, book) {
    if (!BUILDERS[name]) return null;
    wanted.add(name);
    if (!book || book.disposed || !book.pdfDocument) return this.get(name);
    if (owner && owner !== book) discard();
    const existing = this.get(name);
    if (existing) return existing;
    const parent = host();
    if (!parent) return null;
    const made = BUILDERS[name](book);
    built[name] = made;
    owner = book;
    parent.appendChild(made.pane);
    return made.pane;
  },

  /**
   * A new document is open and can answer for itself: replace every pane the reader has asked
   * for with one built from it. Called by the facade once the book is ready.
   * @param {object} book the ZayaBook handle
   */
  adopt(book) {
    if (!book || book.disposed || !book.pdfDocument || owner === book) return;
    discard();
    wanted.forEach((name) => this.ensure(name, book));
    if (window.ZayaNavigator && window.ZayaNavigator.refresh) window.ZayaNavigator.refresh();
  },

  /** @returns {Element|null} the pane's root if it has been built. */
  get(name) {
    const made = built[name];
    if (made && made.pane.isConnected) return made.pane;
    if (made) built[name] = null;
    return null;
  },

  /** The search controller, once the Search pane has been built. */
  searchController() {
    return built.search ? built.search.panel.controller : null;
  },

  /** The search field, so the application can focus it or read it back. */
  searchInput() {
    return built.search ? built.search.panel.input : null;
  },

  /**
   * Which pane the application considers open. The panes have no chrome of their own, so this
   * only marks the root; the Navigator's own tabs are the thing a reader sees.
   */
  setActive(name, on) {
    const pane = this.get(name);
    if (pane) pane.classList.toggle("nav-pane-active", !!on);
  },

  /** No document at all: the panes go, and the kinds asked for are remembered for the next one. */
  reset() {
    discard();
  }
};
