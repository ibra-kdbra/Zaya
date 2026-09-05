/**
 * Side panels – the thumbnail and outline drawers.
 *
 * Both are `.df-sidemenu` containers built next to the book and later re-parented into the
 * Navigator drawer by the app shell. They are glue between the texture library (which renders
 * the thumbnails) and the virtual list / bookmark viewer, so they live here rather than in
 * texture-library.js, which is about textures and page rendering.
 *
 * Each function takes the TextureLibrary instance (`lib`) and stores what it builds on it and
 * on `lib.targetObject`, exactly as before: `lib.thumblist`, `lib.outlineViewer`,
 * `targetObject.thumbContainer`, `targetObject.outlineContainer`.
 */

import { ThumbList } from './thumb-list.js';
import { BookMarkViewer } from './bookmark.js';

/** Turn orbiting off while the pointer is over a drawer, and back on when it leaves. */
function orbitGuards(lib) {
  const set = (enabled) => {
    if (lib.targetObject && lib.targetObject.stage && lib.targetObject.stage.orbitControl) {
      lib.targetObject.stage.orbitControl.enabled = enabled;
    }
  };
  return { disableOrbit: () => set(false), enableOrbit: () => set(true) };
}

/**
 * Build the thumbnail panel: a virtual list of page tiles that loads its images from the
 * texture library's thumbnail cache and follows the page being read.
 * @param {object} lib TextureLibrary instance
 */
export function initThumbPanel(lib) {
  const self = lib;
  const $ = jQuery;
  if (self.cache[self.thumbsize] == null) self.cache[self.thumbsize] = [];
  let timer;

  const scheduleReview = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = setTimeout(review, self.waitPeriod / 2);
    }, self.waitPeriod);
  };

  const review = () => {
    let count = 0;
    if (Date.now() - self.thumblist.lastScrolled < 100) {
      count = 1;
    } else {
      // The thumb container is re-parented into the Navigator drawer, so query it directly.
      const thumbRoot = self.targetObject.thumbContainer || self.targetObject.container.find(".df-thumb-container");
      thumbRoot
        .find(".df-vrow")
        .each(function () {
          const row = $(this);
          if (!row.hasClass("df-thumb-loaded")) {
            const pageIdx = parseInt(row.attr("id").replace("df-thumb", ""), 10);
            const cached = self.getCache(pageIdx, true);
            if (cached) {
              // Already rendered earlier: paint synchronously, no request needed
              row.addClass("df-thumb-loaded");
              self.setPage(pageIdx, cached, null, true);
              return;
            }
            count++;
            self.getPage(pageIdx, scheduleReview, true);
            row.addClass("df-thumb-loaded");
            if (count >= 3) return false; // a few requests in flight at once
          }
        });
      if (count == 0) clearTimeout(timer);
    }
    if (count > 0) scheduleReview();

    if (self.activeThumb != self.targetObject._activePage) {
      const isVisible = self.targetObject.thumbContainer != null && self.targetObject.thumbContainer.hasClass("df-sidemenu-visible");
      if (isVisible) {
        const container = self.thumblist.container;
        const scrollTop = container.scrollTop;
        const height = container.getBoundingClientRect().height;
        const selected = self.targetObject.thumbContainer.find("#df-thumb" + self.targetObject._activePage);
        if (selected.length > 0) {
          self.targetObject.thumbContainer.find(".df-selected").removeClass("df-selected");
          selected.addClass("df-selected");
          const el = selected[0];
          if (scrollTop + height < el.offsetTop + el.scrollHeight) {
            el.scrollIntoView();
          } else if (scrollTop > el.offsetTop) {
            el.scrollIntoView();
          }
          self.activeThumb = self.targetObject._activePage;
        } else {
          $(container).scrollTop(Math.floor((self.targetObject._activePage - 1) / self.thumblist.columns) * self.thumblist.itemHeight);
          scheduleReview();
        }
      }
    }
  };

  // One page tile per row. The row height is the single source of truth: the CSS in
  // custom-ui.css derives the tile from `--thumb-row-h`, which is set on the container below.
  // Phones show two tiles per row (the sheet is full width); the desktop drawer shows one.
  const isNarrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const thumbColumns = isNarrow ? 2 : 1;
  const thumbRowHeight = isNarrow ? 266 : 232;

  self.thumblist = self.targetObject.thumblist = new ThumbList({
    h: 500,
    addFn: () => {},
    scrollFn: scheduleReview,
    itemHeight: thumbRowHeight,
    columns: thumbColumns,
    totalRows: self.pageCount,
    generatorFn: (idx) => {
      const div = document.createElement("div");
      const pageNum = idx + 1;
      div.id = "df-thumb" + pageNum;
      const cached = self.getCache(pageNum, true);
      if (cached) {
        div.style.backgroundImage = "url(" + cached + ")";
        div.classList.add("df-thumb-loaded");
      }
      const inner = document.createElement("div");
      inner.textContent = pageNum;
      div.appendChild(inner);
      return div;
    },
  });

  self.thumblist.lastScrolled = Date.now();
  self.thumblist.review = scheduleReview;

  // Background preloading of all thumbnails once, with a small concurrency window,
  // so scrolling the panel later is instant (issue #11).
  const preloadAllThumbs = () => {
    let currentIdx = 1;
    const CONCURRENCY = 2;
    const loadNext = () => {
      if (!self || !self.thumblist) return;
      if (currentIdx > self.pageCount) return;
      const idx = currentIdx++;
      if (self.getCache(idx, true)) {
        loadNext();
      } else {
        self.getPage(idx, () => setTimeout(loadNext, 30), true);
      }
    };
    setTimeout(() => { for (let i = 0; i < CONCURRENCY; i++) loadNext(); }, 400);
  };
  preloadAllThumbs();

  scheduleReview();

  const thumbContainer = $("<div>").addClass("df-thumb-container df-sidemenu-visible df-sidemenu")
    .attr({ role: "complementary", "aria-label": "Page thumbnails" });
  thumbContainer[0].style.setProperty("--thumb-row-h", thumbRowHeight + "px");
  thumbContainer[0].style.setProperty("--thumb-cols", String(thumbColumns));

  // Disable orbiting and the scroll-wheel option while the pointer is over the panel
  const { disableOrbit, enableOrbit } = orbitGuards(self);
  thumbContainer.on("mouseenter", disableOrbit).on("mouseleave", enableOrbit);
  thumbContainer[0].addEventListener("wheel", (e) => { if (!e.ctrlKey) e.stopPropagation(); }, { capture: true });
  thumbContainer[0].addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });

  thumbContainer.append($(self.thumblist.container).addClass("df-thumb-wrapper"));
  self.targetObject.thumbContainer = thumbContainer;
  self.targetObject.container.append(thumbContainer);
  const closeBtn = $("<div>").addClass("df-ui-btn df-ui-sidemenu-close ti-close")
    .on("click", (e) => {
      e.stopPropagation();
      enableOrbit();
      thumbContainer.removeClass("df-sidemenu-visible");
      if (self.targetObject.ui && self.targetObject.ui.thumbnail) {
        self.targetObject.ui.thumbnail.removeClass("df-active");
      }
      if (self.targetObject.ui && self.targetObject.ui.update) self.targetObject.ui.update();
    });
  thumbContainer.append(closeBtn);
  self.thumblist.reset($(self.thumblist.container).height());

  thumbContainer.on("click", ".df-vrow", function (e) {
    e.stopPropagation();
    const pageIdx = $(this).attr("id").replace("df-thumb", "");
    self.targetObject.gotoPage(parseInt(pageIdx, 10));
  });
}

/**
 * Build the outline (table of contents) panel from the PDF's bookmarks plus any
 * entries supplied through the `outline` option.
 * @param {object} lib TextureLibrary instance
 */
export function initOutlinePanel(lib) {
  const self = lib;
  const $ = jQuery;
  const container = $("<div>").addClass("df-outline-container df-sidemenu")
    .attr({ role: "complementary", "aria-label": "Table of contents" });
  const wrapper = $("<div>").addClass("df-outline-wrapper");

  // Disable orbiting while the pointer is over the panel (prevents accidental rotation)
  const { disableOrbit, enableOrbit } = orbitGuards(self);
  container.on("mouseenter", disableOrbit).on("mouseleave", enableOrbit);

  // Prevent scroll events from bubbling up to the flipbook (prevents unwanted zoom while scrolling)
  const stopPropagation = (e) => {
    if (e.ctrlKey) return; // Allow Ctrl+Wheel (Zoom) to propagate
    e.stopPropagation();
  };
  container[0].addEventListener("wheel", stopPropagation, { passive: false, capture: true });
  container[0].addEventListener("touchstart", stopPropagation, { passive: true });
  container[0].addEventListener("touchmove", stopPropagation, { passive: true });

  const closeBtn = $("<div>").addClass("df-ui-btn df-ui-sidemenu-close ti-close")
    .on("click", (e) => {
      e.stopPropagation();
      enableOrbit();
      container.removeClass("df-sidemenu-visible");
      if (self.targetObject.ui && self.targetObject.ui.outline) {
        self.targetObject.ui.outline.removeClass("df-active");
      }
      if (self.targetObject.ui && self.targetObject.ui.update) self.targetObject.ui.update();
    });
  container.append(closeBtn).append(wrapper);
  self.targetObject.container.append(container);
  self.targetObject.outlineContainer = container;

  self.outlineViewer = new BookMarkViewer({
    container: wrapper[0],
    linkService: self.linkService,
    outlineItemClass: "df-outline-item",
    outlineToggleClass: "df-outline-toggle",
    outlineToggleHiddenClass: "df-outlines-hidden",
  });

  const renderOutline = (outline) => {
    if (self.options.overwritePDFOutline == true) outline = [];
    outline = outline || [];
    if (self.outline) {
      for (let i = 0; i < self.outline.length; i++) {
        self.outline[i].custom = true;
        outline.push(self.outline[i]);
      }
    }
    if (outline.length === 0 && self.targetObject.ui.outline != null) {
      self.targetObject.ui.outline.hide();
    }
    self.outlineViewer.render({ outline });
  };

  if (self.pdfDocument) {
    self.pdfDocument.getOutline().then(renderOutline);
  } else {
    renderOutline([]);
  }

  if (self.options.autoEnableOutline == true) self.targetObject.ui.outline.trigger("click");
  if (self.options.autoEnableThumbnail == true) self.targetObject.ui.thumbnail.trigger("click");
}

/**
 * Build the `.df-search-container` shell: the drawer element itself, its pointer/scroll/keyboard
 * guards and the close button. The panel's contents are filled in by
 * `features/search/search-panel.js`.
 * @param {object} lib TextureLibrary instance
 * @returns {object} jQuery container, already appended to the book container
 */
export function createSearchContainer(lib) {
  const self = lib;
  const $ = jQuery;
  const container = $("<div>").addClass("df-search-container df-sidemenu")
    .attr({ role: "complementary", "aria-label": "Search in document" });

  const { disableOrbit, enableOrbit } = orbitGuards(self);
  container.on("mouseenter", disableOrbit).on("mouseleave", enableOrbit);

  const stopPropagation = (e) => {
    if (e.ctrlKey) return;
    e.stopPropagation();
  };
  container[0].addEventListener("wheel", stopPropagation, { passive: false, capture: true });
  container[0].addEventListener("touchstart", stopPropagation, { passive: true });
  container[0].addEventListener("touchmove", stopPropagation, { passive: true });
  // Keyboard events must not reach the document-level arrow-key page-turn handlers.
  container[0].addEventListener("keydown", (e) => e.stopPropagation());
  container[0].addEventListener("keyup", (e) => e.stopPropagation());

  const closeBtn = $("<div>").addClass("df-ui-btn df-ui-sidemenu-close ti-close")
    .attr({ role: "button", "aria-label": "Close search", tabindex: 0 })
    .on("click", (e) => {
      e.stopPropagation();
      container.removeClass("df-sidemenu-visible");
      self.setSearchHighlight("");
      if (self.targetObject.ui && self.targetObject.ui.searchPanel) {
        self.targetObject.ui.searchPanel.removeClass("df-active");
      }
      if (self.targetObject.ui && self.targetObject.ui.update) self.targetObject.ui.update();
    });

  container.append(closeBtn);
  self.targetObject.container.append(container);
  self.targetObject.searchContainer = container;
  return container;
}
