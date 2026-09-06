/**
 * The selectable text layer.
 *
 * A page on screen is a bitmap, so on its own it offers the reader nothing to select. The layer
 * built here is the usual answer: one transparent span per run of text, placed over the bitmap
 * where the glyphs are, so a browser's own selection, its find-in-page and the clipboard all work
 * on a picture of a page.
 *
 * Two decisions keep it simple.
 *
 * **Spans are laid out once, at the page's natural size, and the whole layer is then scaled.**
 * pdf.js reports a run's placement as a matrix in PDF user space; combined with a scale-1
 * viewport that gives a position in CSS pixels for a page drawn at its natural size. The layer's
 * host is then scaled to whatever the page happens to occupy on screen, so resizing the window
 * or zooming moves one `transform` rather than rewriting every span.
 *
 * **A run is stretched, not re-fitted.** The browser has no idea what a PDF's embedded font
 * looks like, so a span rendered in a fallback face is almost never the width of the run it
 * stands for. The span is measured once and given a horizontal scale that makes it exactly the
 * right width; the selection then follows the glyphs under it closely enough to select a word by
 * double-clicking it. Vertical text is placed by its own matrix and rotated the same way.
 *
 * Right-to-left runs carry `dir="rtl"`, so the copied text comes out in logical order and a
 * selection dragged across a line behaves as an Arabic or Hebrew reader expects.
 */

import { pdfjsLib } from "./document.js";

/** Font families a PDF's own family string is mapped onto; the browser has nothing better. */
function familyFor(style) {
  const name = String((style && style.fontFamily) || "").toLowerCase();
  if (name.indexOf("mono") !== -1) return "monospace";
  if (name.indexOf("serif") !== -1 && name.indexOf("sans") === -1) return "serif";
  return "sans-serif";
}

/**
 * Build the spans for one PDF page into `host`, laid out for the page at its natural size.
 *
 * @param {object} pdfPage a pdf.js page proxy
 * @param {HTMLElement} host an empty, positioned element
 * @returns {Promise<{width: number, height: number}>} the page's natural size in CSS pixels
 */
export async function buildTextLayer(pdfPage, host) {
  const viewport = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  const styles = content.styles || {};

  host.style.width = `${viewport.width}px`;
  host.style.height = `${viewport.height}px`;

  const spans = [];
  for (const item of content.items) {
    if (!item.str) continue;
    // A run with no advance is a positioning artefact, not text the reader can select.
    if (!item.width && !item.height && item.str.trim() === "") continue;

    const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(m[1], m[0]);
    const style = styles[item.fontName];
    const vertical = !!(style && style.vertical);
    // The matrix's scale down the text's own y axis is the run's font size on screen.
    const fontSize = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
    if (!(fontSize > 0)) continue;

    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.fontSize = `${fontSize}px`;
    span.style.fontFamily = familyFor(style);
    // The matrix places the run's baseline; the span is placed by its top-left corner.
    span.style.left = `${m[4]}px`;
    span.style.top = `${m[5] - fontSize}px`;
    if (angle) {
      span.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
      span.style.transformOrigin = "0% 100%";
    }
    if (item.dir === "rtl") span.dir = "rtl";
    host.appendChild(span);
    // `width` is the run's advance in PDF user units, which a scale-1 viewport keeps as pixels.
    spans.push({ span, target: vertical ? item.height : item.width, angle, vertical });
  }

  // Measure every span, then write every correction: two passes, one layout.
  const widths = spans.map(({ span }) => span.getBoundingClientRect().width);
  spans.forEach(({ span, target, angle, vertical }, index) => {
    if (vertical || !(target > 0)) return;
    const actual = widths[index];
    if (!(actual > 0)) return;
    const factor = target / actual;
    if (Math.abs(factor - 1) < 0.01) return;
    const rotation = angle ? `rotate(${(angle * 180) / Math.PI}deg) ` : "";
    span.style.transform = `${rotation}scaleX(${factor.toFixed(4)})`;
    span.style.transformOrigin = angle ? "0% 100%" : "0% 0%";
  });

  return { width: viewport.width, height: viewport.height };
}

/**
 * The text layers for the pages on screen.
 *
 * The engine hands this object a box for each visible book page — where that page sits on the
 * stage, in CSS pixels — and it keeps one scaled layer over each. Boxes change constantly (a
 * resize, a zoom, a pan); the spans inside them are built once per page and only re-scaled.
 */
export class TextLayers {
  /**
   * @param {HTMLElement} stage the element the layers are positioned inside
   * @param {(bookPage:number) => {pdfPage:number, half:('left'|'right'|null)}} resolve
   * @param {(pdfPage:number) => Promise<object>} getPage
   */
  constructor(stage, resolve, getPage) {
    this.stage = stage;
    this.resolve = resolve;
    this.getPage = getPage;
    this.enabled = true;
    this.disposed = false;
    /** @type {Map<number, {host: HTMLElement, inner: HTMLElement, size: object|null}>} */
    this.layers = new Map();
    this.root = document.createElement("div");
    this.root.className = "zn-textlayers";
    this.stage.appendChild(this.root);
    this.token = 0;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.root.hidden = !this.enabled;
    if (!this.enabled) this.clear();
  }

  /** Hide the layers without throwing them away — a sheet is in flight over them. */
  setVisible(on) {
    this.root.style.visibility = on ? "" : "hidden";
  }

  clear() {
    this.layers.forEach((layer) => { layer.host.remove(); });
    this.layers.clear();
  }

  /**
   * Show text over exactly these pages, each in the box given.
   * @param {Array<{bookPage: number, x: number, y: number, width: number, height: number}>} boxes
   * @returns {Promise<void>} resolves once every layer's spans exist
   */
  async update(boxes) {
    if (this.disposed || !this.enabled) return;
    const token = ++this.token;
    const wanted = new Set(boxes.map((b) => b.bookPage));
    this.layers.forEach((layer, bookPage) => {
      if (wanted.has(bookPage)) return;
      layer.host.remove();
      this.layers.delete(bookPage);
    });

    for (const box of boxes) {
      let layer = this.layers.get(box.bookPage);
      if (!layer) {
        const host = document.createElement("div");
        host.className = "zn-textlayer";
        const inner = document.createElement("div");
        inner.className = "zn-textlayer-inner";
        host.appendChild(inner);
        this.root.appendChild(host);
        layer = { host, inner, size: null, building: null, half: null };
        this.layers.set(box.bookPage, layer);
      }
      // The host goes where the page is straight away; the spans follow when they exist.
      this.place(layer, box);
      if (!layer.size && !layer.building) {
        const { pdfPage, half } = this.resolve(box.bookPage);
        layer.half = half;
        layer.building = this.getPage(pdfPage)
          .then((page) => buildTextLayer(page, layer.inner))
          .then((size) => { layer.size = size; })
          .catch(() => { /* a page whose text will not come costs the layer, not the reader */ })
          .then(() => { layer.building = null; });
      }
      if (layer.building) await layer.building;
      if (this.disposed || this.token !== token) return;
      this.place(layer, box);
    }
  }

  /** Put one layer's host where its page is, and scale its spans to match. */
  place(layer, box) {
    const host = layer.host;
    host.style.left = `${box.x}px`;
    host.style.top = `${box.y}px`;
    host.style.width = `${box.width}px`;
    host.style.height = `${box.height}px`;
    if (!layer.size) return;
    // A `doubleInternal` page holds two book pages, so the layer covers half its width and the
    // spans are slid sideways to bring the right-hand half into that window.
    const halves = layer.half === "left" || layer.half === "right" ? 2 : 1;
    const natural = layer.size.width / halves;
    const scale = natural > 0 ? box.width / natural : 1;
    const shift = layer.half === "right" ? -natural : 0;
    layer.inner.style.transform = `scale(${scale.toFixed(5)}) translateX(${shift}px)`;
  }

  dispose() {
    this.disposed = true;
    this.clear();
    this.root.remove();
  }
}
