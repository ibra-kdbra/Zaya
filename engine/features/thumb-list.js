/**
 * DFlip Thumb List Class
 */

export class ThumbList {
  constructor(options) {
    const width = (options && options.w + "px") || "100%";
    const height = (options && options.h + "px") || "100%";
    const itemHeight = (this.itemHeight = options.itemHeight);
    // Tiles per row. Rows are still the virtualisation unit; a row holds `columns` items.
    this.columns = Math.max(1, options.columns | 0 || 1);
    this.items = options.items;
    this.generatorFn = options.generatorFn;
    this.totalRows = options.totalRows || (options.items && options.items.length);
    this.addFn = options.addFn;
    this.scrollFn = options.scrollFn;

    this.rows = new Map();
    const scroller = ThumbList.createScroller(itemHeight * Math.ceil(this.totalRows / this.columns));
    this.container = ThumbList.createContainer(width, height);
    this.container.appendChild(scroller);

    this.screenItemsLen = Math.ceil(options.h / itemHeight) * this.columns;
    this.offsetItems = this.screenItemsLen;
    this.cachedItemsLen = this.screenItemsLen + this.offsetItems * 2;
    this._renderChunk(this.container, 0);

    const self = this;
    self.lastRepaintY = 0;
    self.lastScrolled = 0;

    this.onScroll = (e) => {
      const scrollTop = e.target.scrollTop;
      if (!self.lastRepaintY || Math.abs(scrollTop - self.lastRepaintY) >= self.offsetItems * self.itemHeight) {
        const idx = parseInt(scrollTop / itemHeight, 10) * self.columns - self.offsetItems;
        self._renderChunk(self.container, idx < 0 ? 0 : idx);
        self.lastRepaintY = scrollTop;
      }
      self.lastScrolled = Date.now();
      if (self.scrollFn != null) {
        self.scrollFn();
      }
      // if (e.preventDefault) e.preventDefault(); // Scroll event cannot be prevented usually
    };

    const stopPropagation = (e) => {
      if (e.ctrlKey) return;
      e.stopPropagation();
    };

    this.stopPropagation = stopPropagation;
    this.container.addEventListener("scroll", this.onScroll);
    this.container.addEventListener("wheel", stopPropagation, { passive: false, capture: true });
    this.container.addEventListener("touchstart", stopPropagation, { passive: true });
    this.container.addEventListener("touchmove", stopPropagation, { passive: true });
  }

  dispose() {
    if (this.container) {
      if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container.removeEventListener("scroll", this.onScroll);
      this.container.removeEventListener("wheel", this.stopPropagation, { capture: true });
      this.container.removeEventListener("touchstart", this.stopPropagation);
      this.container.removeEventListener("touchmove", this.stopPropagation);
    }
    if (this.rows) this.rows.clear();
    this.generatorFn = null;
  }

  reset(height) {
    this.screenItemsLen = Math.ceil(height / this.itemHeight);
    this.cachedItemsLen = this.screenItemsLen + this.offsetItems * 2;
    const idx = parseInt(this.lastRepaintY / this.itemHeight, 10) * this.columns - this.offsetItems;
    this.needReset = true;
    this._renderChunk(this.container, Math.max(idx, 0));
  }

  createRow(idx) {
    // Rows are cached so scrolling back never re-creates (and re-loads) a thumbnail.
    let row = this.rows.get(idx);
    if (row) {
      row.style.top = Math.floor(idx / this.columns) * this.itemHeight + "px";
      row.style.setProperty("--thumb-col", String(idx % this.columns));
      return row;
    }
    if (this.generatorFn) {
      row = this.generatorFn(idx);
      row.classList.add("df-vrow");
      row.style.position = "absolute";
      row.style.top = Math.floor(idx / this.columns) * this.itemHeight + "px";
      row.style.setProperty("--thumb-col", String(idx % this.columns));
      row.setAttribute("index", idx);
      this.rows.set(idx, row);
      return row;
    }
    return null;
  }

  _renderChunk(container, startIdx) {
    const isInitial = this.range == null;
    this.range = this.range || { min: 0, max: this.cachedItemsLen };
    const range = this.range;
    const min = range.min, max = range.max;
    const isForward = isInitial ? true : startIdx >= min;

    if (!isInitial && startIdx == min && this.needReset == false) return;

    let start = isInitial ? min : isForward ? max : startIdx;
    start = start > this.totalRows ? this.totalRows : start < 0 ? 0 : start;
    let end = startIdx + this.cachedItemsLen;
    end = end > this.totalRows ? this.totalRows : end;

    for (let i = start; i < end; i++) {
      const row = this.createRow(i);
      if (!row) continue;
      if (isForward) container.appendChild(row);
      else container.insertBefore(row, container.childNodes[1 + i - start]);
      if (this.addFn != null) this.addFn(i);
    }

    this.needReset = false;
    if (!isInitial && container.childNodes.length > this.cachedItemsLen + 1) {
      const removeStart = isForward ? 1 : 1 + this.cachedItemsLen;
      const removeEnd = removeStart + (end - start);
      for (let i = removeEnd; i > removeStart; i--) {
        if (container.childNodes[removeStart]) this.container.removeChild(container.childNodes[removeStart]);
      }
    }
    this.range.min = startIdx;
    this.range.max = end;
  }

  static createContainer(width, height) {
    const div = document.createElement("div");
    div.style.width = width;
    div.style.height = height;
    div.style.overflow = "auto";
    div.style.position = "relative";
    div.style.padding = "0";
    return div;
  }

  static createScroller(height) {
    const div = document.createElement("div");
    div.style.opacity = "0";
    div.style.position = "absolute";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "1px";
    div.style.height = height + "px";
    return div;
  }
}
