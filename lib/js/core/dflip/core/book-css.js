/**
 * DFlip Book CSS Class
 *
 * The 2D renderer, used when WebGL is unavailable or when the CSS mode is forced
 * (`?render=css`, or `window.ZAYA_RENDER_MODE = "css"`). It builds the same DOM the
 * stylesheet in `lib/css/min.css` already describes -- a `.df-book-stage` holding a
 * `.df-book-wrapper` with `.df-book-page` leaves, each carrying a `.df-page-front` and a
 * `.df-page-back` -- and offers the texture library exactly the interface the WebGL `Book`
 * offers, so `TextureLibrary.setPage()` paints both renderers through the same code path.
 *
 * A leaf is one sheet of paper: sheet `s` carries page `2s+1` on its back and page `2s+2` on
 * its front, which is the numbering `TextureLibrary.setPage()` assumes. Only a handful of
 * leaves exist at a time; they are re-assigned to sheet numbers as the reader moves, keeping
 * already-painted neighbours so a page turn does not re-render what is already there.
 */

import { DIRECTION, PAGE_MODE, SINGLE_PAGE_MODE } from '../constants.js';
import { isMobile, isHardPage, getBasePage, limitAt } from '../utils.js';

/** How many sheets are kept alive around the spread being read. */
const SLOT_COUNT = 4;

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One sheet of paper. `front` shows an even page (the left half of a spread), `back` an odd
 * page (the right half), matching the WebGL geometry the texture library writes to.
 */
class CSSPage {
  constructor(index) {
    const $ = jQuery;
    this.index = index;
    this.name = "-1";
    this.visible = false;
    this.isFlipping = false;
    this.skipFlip = false;
    this.isHard = false;
    this.frontTextureLoaded = false;
    this.backTextureLoaded = false;
    this.frontPageStamp = "-1";
    this.backPageStamp = "-1";
    this.side = null;

    this.element = $("<div>").addClass("df-book-page df-css-page");
    this.front = CSSPage.createFace("df-page-front");
    this.back = CSSPage.createFace("df-page-back");
    // The back face is painted first so the front sits above it in source order; which of the
    // two the reader sees is decided by the 3D rotation applied in `setSide()`.
    this.element.append(this.back.face).append(this.front.face);
    this.element[0].style.display = "none";
  }

  static createFace(className) {
    const $ = jQuery;
    const face = $("<div>").addClass(className);
    const content = $("<div>").addClass("df-page-content");
    face.append(content);
    return { face, content };
  }

  /**
   * Which half of the spread this leaf occupies. The faces are counter-rotated so that the
   * face the reader should see is the one facing them while the leaf sits at 0deg.
   * @param {"left"|"right"} side
   */
  setSide(side) {
    if (this.side === side) return;
    this.side = side;
    const isLeft = side === "left";
    this.element.removeClass("df-left-side df-right-side").addClass(isLeft ? "df-left-side" : "df-right-side");
    this.element[0].style.transformOrigin = isLeft ? "right center" : "left center";
    this.front.face[0].style.transform = isLeft ? "rotateY(0deg)" : "rotateY(180deg)";
    this.back.face[0].style.transform = isLeft ? "rotateY(180deg)" : "rotateY(0deg)";
  }

  show(visible) {
    this.element[0].style.display = visible ? "" : "none";
  }

  /** Paint the face that carries even pages. */
  frontImage(data, callback) {
    this.paint(this.front, data, callback);
  }

  /** Paint the face that carries odd pages. */
  backImage(data, callback) {
    this.paint(this.back, data, callback);
  }

  /**
   * A texture is either a URL (an object URL from `canvas.toBlob`, or an image source), a
   * freshly rendered `<canvas>` (used while a search highlight is painted into the page), or
   * the "blank" placeholder, which clears the face.
   */
  paint(target, data, callback) {
    const el = target.face[0];
    const old = el.querySelector("canvas");
    if (data == null || data === "blank") {
      el.style.backgroundImage = "";
      if (old) old.remove();
    } else if (typeof data === "string") {
      if (old) old.remove();
      el.style.backgroundImage = 'url("' + data.replace(/"/g, '\\"') + '")';
    } else if (data.nodeName) {
      el.style.backgroundImage = "";
      if (old !== data) {
        if (old) old.remove();
        el.insertBefore(data, el.firstChild);
      }
    }
    if (callback) callback(data, null);
  }

  /** Stop an in-flight turn and leave the leaf where the layout wants it. */
  clearTween() {
    if (this.flipTimer) {
      clearTimeout(this.flipTimer);
      this.flipTimer = null;
    }
    this.isFlipping = false;
    this.element[0].style.transition = "";
    this.element[0].style.transform = "";
    this.element.removeClass("df-flipping");
  }
}

export class BookCSS {
  constructor(options, container) {
    const self = this;
    const $ = jQuery;
    self.type = "BookCSS";
    self.images = options.images || [];
    self.pageCount = options.pageCount || 1;
    self.foldSense = 50;
    self.stackCount = SLOT_COUNT;
    self.mode = "css";
    self.pages = [];
    self.children = self.pages;
    self.duration = options.duration;
    self.container = $(container);
    self.options = options;
    self.drag = -1; // d.none
    self.pageMode = options.pageMode || (isMobile || self.pageCount <= 2 ? PAGE_MODE.SINGLE : PAGE_MODE.DOUBLE);
    self.singlePageMode = options.singlePageMode || (isMobile ? SINGLE_PAGE_MODE.BOOKLET : SINGLE_PAGE_MODE.ZOOM);
    self.swipe_threshold = isMobile ? 15 : 50;
    self.direction = options.direction || DIRECTION.LTR;
    self.startPage = 1;
    self.endPage = self.pageCount;
    self._activePage = options.openPage || self.startPage;
    self.hardConfig = options.hard;
    self.left = 0;
    self.top = 0;
    self.oldBaseNumber = null;

    self.init(options);
  }

  /** Whether any leaf is mid-turn; the texture library waits for this to settle. */
  isFlipping() {
    for (let i = 0; i < this.pages.length; i++) {
      if (this.pages[i].isFlipping) return true;
    }
    return false;
  }

  init(options) {
    const $ = jQuery;
    this.stage = $("<div class='df-book-stage'>");
    this.wrapper = $("<div class='df-book-wrapper'>");
    this.shadow = $("<div class='df-book-shadow'>");
    this.container.append(this.stage);
    this.stage.append(this.wrapper);
    this.wrapper.append(this.shadow);
    this.createStack(options);
  }

  createStack() {
    for (let i = 0; i < this.stackCount; i++) {
      const page = new CSSPage(i);
      page.setSide(i < this.stackCount / 2 ? "left" : "right");
      this.pages.push(page);
      this.wrapper.append(page.element);
    }
  }

  /** Total sheets in the book: two pages to a sheet. */
  get sheetCount() {
    return Math.ceil(this.pageCount / 2);
  }

  /** The leaf carrying `pageNum`, or null. Mirrors `Book.getPageByNumber`. */
  getPageByNumber(pageNum) {
    const idx = Math.floor((pageNum - 1) / 2);
    const name = idx.toString();
    for (let i = 0; i < this.pages.length; i++) {
      if (this.pages[i].name === name) return this.pages[i];
    }
    return null;
  }

  /** The `.df-page-content` overlay of a page, used for annotations and the loading state. */
  getContentLayer(pageNum) {
    const page = this.getPageByNumber(pageNum);
    if (!page) return null;
    const isBack = pageNum % 2 !== 0;
    return (isBack ? page.back : page.front).content[0];
  }

  isPageHard(pageNum) {
    return isHardPage(this.hardConfig, pageNum, this.pageCount);
  }

  activePage(pageNum) {
    if (pageNum == null) return this._activePage;
    this.gotoPage(pageNum);
  }

  gotoPage(pageNum) {
    pageNum = parseInt(pageNum, 10);
    if (isNaN(pageNum)) return;
    this._activePage = limitAt(pageNum, this.startPage, this.endPage);
    if (this.autoPlay == true && this.previewObject) {
      this.previewObject.setAutoPlay(this.autoPlay);
    }
    this.updatePage(this._activePage);
    if (this.thumblist && this.thumblist.review) this.thumblist.review();
  }

  moveBy(delta) {
    let targetPage = this._activePage + delta;
    targetPage = limitAt(targetPage, this.startPage, this.endPage);
    if (this.firstFlipped != true && this.previewObject) {
      this.previewObject.analytics({ eventAction: "First Page Flip", options: this.previewObject.options });
      this.firstFlipped = true;
    }
    this.gotoPage(targetPage);
  }

  next(delta) {
    if (delta == null) delta = this.direction == DIRECTION.RTL ? -this.pageMode : this.pageMode;
    this.moveBy(delta);
  }

  prev(delta) {
    if (delta == null) delta = this.direction == DIRECTION.RTL ? this.pageMode : -this.pageMode;
    this.moveBy(delta);
  }

  refresh() {
    this.updatePage(this._activePage);
    if (this.flipCallback != null) this.flipCallback();
  }

  /**
   * Lay the leaves out around `pageNum`: assign sheet numbers, decide which two are on screen,
   * ask the texture library for anything not painted yet and animate the turn.
   */
  updatePage(pageNum) {
    const basePage = getBasePage(limitAt(pageNum, this.startPage, this.endPage));
    const rightSheet = basePage / 2;      // carries the odd page on the right half
    const leftSheet = rightSheet - 1;     // carries the even page on the left half
    const total = this.sheetCount;
    const previous = this.oldBaseNumber;

    // Sheets worth keeping in the DOM: the spread plus one on either side, so a turn in either
    // direction starts from an already-painted leaf.
    const wanted = [];
    for (let s = leftSheet - 1; s <= rightSheet + 1; s++) {
      if (s >= 0 && s < total) wanted.push(s);
    }
    while (wanted.length > this.stackCount) {
      // Drop whichever end is furthest from the spread.
      if (Math.abs(wanted[0] - rightSheet) >= Math.abs(wanted[wanted.length - 1] - rightSheet)) wanted.shift();
      else wanted.pop();
    }

    // Keep leaves already showing a wanted sheet; recycle the rest.
    const keep = new Set();
    const free = [];
    for (const page of this.pages) {
      const n = parseInt(page.name, 10);
      if (!isNaN(n) && wanted.indexOf(n) !== -1 && !keep.has(n)) keep.add(n);
      else free.push(page);
    }
    for (const sheet of wanted) {
      if (keep.has(sheet)) continue;
      const page = free.shift();
      if (!page) continue;
      this.assign(page, sheet);
    }
    for (const page of free) {
      page.name = "-1";
      page.visible = false;
      page.show(false);
    }

    // Position everything and work out which leaf, if any, is turning.
    const stepped = previous !== null && Math.abs(rightSheet - previous) === 1;
    const forward = rightSheet > (previous === null ? rightSheet : previous);
    const turning = stepped ? this.getPageBySheet(forward ? previous : previous - 1) : null;

    for (const page of this.pages) {
      const sheet = parseInt(page.name, 10);
      if (isNaN(sheet) || sheet < 0) continue;
      page.visible = sheet >= 0 && sheet < total;
      const onScreen = sheet === leftSheet || sheet === rightSheet;
      if (page === turning) continue; // the turn decides its own side and visibility
      page.clearTween();
      page.setSide(sheet <= leftSheet ? "left" : "right");
      page.show(onScreen);
    }

    if (turning) this.flip(turning, forward, leftSheet, rightSheet);

    this.oldBaseNumber = rightSheet;
    if (this.requestPage != null) this.requestPage();
    if (this.updatePageCallback != null) this.updatePageCallback();
  }

  getPageBySheet(sheet) {
    const name = String(sheet);
    for (const page of this.pages) {
      if (page.name === name) return page;
    }
    return null;
  }

  /** Point a leaf at a sheet and clear its textures so the library repaints it. */
  assign(page, sheet) {
    page.clearTween();
    page.name = sheet.toString();
    page.isHard = this.isPageHard(sheet);
    page.element.toggleClass("df-hard-page", !!page.isHard);
    page.skipFlip = false;
    const fallback = this.options ? this.options.textureLoadFallback : "blank";
    page.frontImage(fallback);
    page.backImage(fallback);
    page.frontPageStamp = "-1";
    page.backPageStamp = "-1";
    page.frontTextureLoaded = false;
    page.backTextureLoaded = false;
  }

  /**
   * Turn one leaf over. Forward, the right-hand leaf swings across to the left; backward, the
   * left-hand leaf swings back to the right. The faces are counter-rotated (see
   * `CSSPage.setSide`), so the page coming into view is simply the other side of the sheet.
   */
  flip(page, forward, leftSheet, rightSheet) {
    const self = this;
    const el = page.element[0];
    const duration = Math.max(0, parseInt(this.duration, 10) || 0);
    const sheet = parseInt(page.name, 10);
    const endSide = sheet <= leftSheet ? "left" : "right";
    const startSide = forward ? "right" : "left";

    page.clearTween();
    page.setSide(startSide);
    page.show(true);

    const settle = () => {
      page.flipTimer = null;
      page.isFlipping = false;
      el.style.transition = "";
      el.style.transform = "";
      page.element.removeClass("df-flipping");
      page.setSide(endSide);
      page.show(sheet === leftSheet || sheet === rightSheet);
      if (self.flipCallback != null) self.flipCallback();
    };

    if (duration === 0 || prefersReducedMotion()) {
      settle();
      return;
    }

    if (this.preFlipCallback != null) this.preFlipCallback();
    page.isFlipping = true;
    page.element.addClass("df-flipping");
    el.style.transition = "none";
    el.style.transform = "rotateY(0deg)";
    void el.offsetWidth; // commit the start state before the transition begins
    el.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    el.style.transform = forward ? "rotateY(-180deg)" : "rotateY(180deg)";
    page.flipTimer = setTimeout(settle, duration + 30);
  }

  /** Recentre after a resize; the wrapper offset itself is handled by PreviewObject.checkCenter. */
  reset() {
    for (const page of this.pages) {
      page.clearTween();
      page.name = "-1";
      page.visible = false;
      page.show(false);
    }
    this.oldBaseNumber = null;
    this.refresh();
  }

  dispose() {
    for (const page of this.pages) {
      page.clearTween();
      page.element.remove();
    }
    this.pages.length = 0;
    if (this.stage) this.stage.remove();
    this.stage = null;
    this.wrapper = null;
    this.shadow = null;
  }
}
