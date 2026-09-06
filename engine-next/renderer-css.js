/**
 * The 2D renderer: the same book in plain DOM, for machines without WebGL and for anyone who
 * asks for it with `renderMode: 'css'`.
 *
 * The spread is two absolutely-positioned halves. A turn adds a sheet hinged on the spine and
 * rotates it about Y; its two faces are back-to-back with `backface-visibility: hidden`, so the
 * front hands over to the back exactly at ninety degrees. There is no curl — a flat sheet is an
 * honest fallback, and faking paper without a mesh looks worse than not trying.
 *
 * Zoom is a transform on the spread, which is what a browser is good at: the page bitmaps are
 * re-rendered at the larger scale behind it, so the sharpening arrives a moment after the
 * magnification rather than instead of it.
 *
 * The interface is the WebGL renderer's, method for method, so the engine never asks which it has.
 */

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function element(className) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

export class CssRenderer {
  /**
   * @param {object} book the ZayaBook
   * @param {HTMLElement} stage element to draw into
   */
  constructor(book, stage) {
    this.book = book;
    this.stage = stage;
    this.mode = "css";
    this.disposed = false;
    this.pageW = 0.72;
    this.pageH = 1;
    this.frame = 0;
    this.zoom = { level: 1, x: 0, y: 0 };

    this.spread = element("zn-spread");
    this.left = element("zn-page zn-page-left");
    this.right = element("zn-page zn-page-right");
    this.spread.appendChild(this.left);
    this.spread.appendChild(this.right);
    this.stage.appendChild(this.spread);
    this.sheet = null;

    this.setBackground(book.options.backgroundColor);
  }

  setBackground(color) {
    this.stage.style.backgroundColor = color || "#20232a";
  }

  setPageAspect(aspect) {
    this.pageH = 1;
    this.pageW = Math.max(0.2, Math.min(4, aspect || 0.72));
  }

  /** Put a rendered canvas inside a page element, replacing whatever was there. */
  static fill(host, canvas) {
    host.textContent = "";
    if (!canvas) { host.hidden = true; return; }
    host.hidden = false;
    canvas.className = "zn-canvas";
    host.appendChild(canvas);
  }

  showSpread(leftCanvas, rightCanvas, single) {
    this.single = !!single;
    if (single) {
      CssRenderer.fill(this.left, leftCanvas || rightCanvas);
      CssRenderer.fill(this.right, null);
    } else {
      CssRenderer.fill(this.left, leftCanvas);
      CssRenderer.fill(this.right, rightCanvas);
    }
    this.frame++;
    this.layout();
  }

  /** Size the spread to fit the stage, respecting the padding options. */
  resize() {
    if (this.disposed) return;
    this.layout();
  }

  layout() {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const options = this.book.options;
    const padTop = Math.max(0, options.paddingTop || 0);
    const padBottom = Math.max(0, options.paddingBottom || 0);
    const usable = Math.max(1, height - padTop - padBottom);

    const single = this.book.pageMode === "single";
    const across = single ? 1 : 2;
    const margin = 0.94;
    const scale = Math.min((width * margin) / (across * this.pageW), (usable * margin) / this.pageH);
    const pageWidth = Math.round(this.pageW * scale);
    const pageHeight = Math.round(this.pageH * scale);

    this.spread.style.width = `${pageWidth * across}px`;
    this.spread.style.height = `${pageHeight}px`;
    this.spread.style.left = `${Math.round((width - pageWidth * across) / 2)}px`;
    this.spread.style.top = `${Math.round(padTop + (usable - pageHeight) / 2)}px`;

    [this.left, this.right].forEach((host, index) => {
      host.style.width = `${pageWidth}px`;
      host.style.height = `${pageHeight}px`;
      host.style.left = single ? "0px" : `${index * pageWidth}px`;
    });
    this.pageWidthPx = pageWidth;
    this.pageHeightPx = pageHeight;
    this.applyZoom();
    if (this.sheet) this.placeSheet();
  }

  /* ---- zoom ------------------------------------------------------------------------------- */

  /**
   * Magnify the spread about the middle of the stage and shift it by a pan in CSS pixels.
   * @param {number} level 1 is fit-to-stage
   * @param {number} x pan, CSS pixels
   * @param {number} y pan, CSS pixels
   */
  setZoom(level, x, y) {
    this.zoom = { level: level || 1, x: x || 0, y: y || 0 };
    this.applyZoom();
  }

  applyZoom() {
    const { level, x, y } = this.zoom;
    this.spread.style.transformOrigin = "50% 50%";
    this.spread.style.transform = level === 1 && !x && !y
      ? "" : `translate(${x}px, ${y}px) scale(${level})`;
  }

  /** The point a zoom happens about: the middle of the spread as it is laid out. */
  zoomOrigin() {
    return {
      x: this.spread.offsetLeft + this.spread.offsetWidth / 2,
      y: this.spread.offsetTop + this.spread.offsetHeight / 2,
    };
  }

  /** How big the spread is on screen before any magnification, in CSS pixels. */
  fitSize() {
    return { width: this.spread.offsetWidth, height: this.spread.offsetHeight };
  }

  /**
   * Where each half of the spread is on the stage, in CSS pixels, zoom and all.
   * @returns {Array<{side: 'left'|'right', x: number, y: number, width: number, height: number}>}
   */
  pageBoxes() {
    const stageRect = this.stage.getBoundingClientRect();
    const out = [];
    const single = this.book.pageMode === "single";
    const hosts = single ? [["left", this.left]] : [["left", this.left], ["right", this.right]];
    hosts.forEach(([side, host]) => {
      if (host.hidden) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      out.push({
        side,
        x: rect.left - stageRect.left,
        y: rect.top - stageRect.top,
        width: rect.width,
        height: rect.height,
      });
    });
    return out;
  }

  /* ---- the sheet in flight ------------------------------------------------------------------ */

  makeSheet(frontCanvas, backCanvas, side) {
    this.destroySheet();
    const sheet = element("zn-sheet");
    const front = element("zn-face zn-face-front");
    const back = element("zn-face zn-face-back");
    CssRenderer.fill(front, frontCanvas);
    CssRenderer.fill(back, backCanvas);
    sheet.appendChild(front);
    sheet.appendChild(back);
    this.spread.appendChild(sheet);
    this.sheet = sheet;
    this.sheetSide = side;
    this.placeSheet();
    return sheet;
  }

  placeSheet() {
    const single = this.book.pageMode === "single";
    const w = this.pageWidthPx || 0;
    this.sheet.style.width = `${w}px`;
    this.sheet.style.height = `${this.pageHeightPx || 0}px`;
    if (this.sheetSide > 0 || single) {
      this.sheet.style.left = single ? "0px" : `${w}px`;
      this.sheet.style.transformOrigin = "left center";
    } else {
      this.sheet.style.left = "0px";
      this.sheet.style.transformOrigin = "right center";
    }
  }

  destroySheet() {
    if (this.sheet && this.sheet.parentNode) this.sheet.parentNode.removeChild(this.sheet);
    this.sheet = null;
  }

  applyTurn(progress) {
    if (!this.sheet) return;
    const degrees = -180 * progress * (this.sheetSide > 0 ? 1 : -1);
    this.sheet.style.transform = `rotateY(${degrees}deg)`;
    this.frame++;
  }

  /** Build the sheet and hold it at `progress`, for a drag that will move it by hand. */
  beginTurn(spec, progress) {
    this.makeSheet(spec.front, spec.back, spec.side);
    this.applyTurn(progress || 0);
  }

  /** Move the sheet a drag is holding. */
  updateTurn(progress) {
    this.applyTurn(Math.max(0, Math.min(1, progress)));
  }

  /**
   * Let a dragged sheet settle to `to`, starting from where it is.
   * @returns {Promise<{frames: number, ms: number}>}
   */
  settleTurn(from, to, duration) {
    return this.run(from, to, duration);
  }

  /** @returns {Promise<{frames:number, ms:number}>} */
  animateTurn(spec) {
    this.makeSheet(spec.front, spec.back, spec.side);
    const from = spec.backwards ? 1 : 0;
    const to = spec.backwards ? 0 : 1;
    this.applyTurn(from);
    return this.run(from, to, spec.duration);
  }

  run(from, to, ms) {
    const duration = Math.max(0, ms || 0);
    const started = performance.now();
    let frames = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (this.disposed) return resolve({ frames, ms: 0 });
        const elapsed = performance.now() - started;
        const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
        this.applyTurn(from + (to - from) * easeInOutCubic(t));
        frames++;
        if (t < 1) requestAnimationFrame(step);
        else {
          this.destroySheet();
          resolve({ frames, ms: performance.now() - started });
        }
      };
      requestAnimationFrame(step);
    });
  }

  requestRender() { /* the DOM repaints itself */ }

  paint() { /* nothing to do */ }

  dispose() {
    this.disposed = true;
    this.destroySheet();
    if (this.spread.parentNode) this.spread.parentNode.removeChild(this.spread);
  }
}
