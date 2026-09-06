/**
 * The demo page's own script: not part of the engine, but the only place the engine is
 * driven end to end without the reader around it, so the tests use it too.
 *
 * Query string: ?pdf= ?render=webgl|css ?dir=ltr|rtl ?hard=none|cover|all ?mode=single|double
 *               ?page= ?duration= ?internal=1 ?padTop= ?padBottom= ?bg=
 */

import { ZayaBook } from "./index.js";

const params = new URLSearchParams(location.search);
const pdf = params.get("pdf") || "../tests/fixtures/sample.pdf";
const render = params.get("render") === "css" ? "css" : (params.get("render") === "webgl" ? "webgl" : "auto");
const container = document.getElementById("book");
const status = document.getElementById("status");

/** Everything the tests and a person poking at the page need. */
const demo = window.zayaDemo = {
  book: null,
  events: [],
  paintCalls: [],
  ready: null,
  /**
   * Are the page bitmaps actually carrying a document, or is the stage empty?
   * Every canvas in the container is sampled through a small 2D canvas, which works for the
   * WebGL drawing buffer (kept readable) as well as for the 2D renderer's page bitmaps.
   */
  sample() {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 40;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    const out = [];
    container.querySelectorAll("canvas").forEach((canvas) => {
      if (!canvas.width || !canvas.height) return;
      ctx.clearRect(0, 0, 40, 40);
      try { ctx.drawImage(canvas, 0, 0, 40, 40); } catch (err) { return; }
      const data = ctx.getImageData(0, 0, 40, 40).data;
      const seen = new Set();
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      out.push({ width: canvas.width, height: canvas.height, colours: seen.size, mean: sum / (data.length / 4 * 3) });
    });
    return out;
  },
};

["zaya:pdfLoaded", "zaya:bookReady", "zaya:pageChanged"].forEach((name) => {
  document.addEventListener(name, (event) => demo.events.push({ type: name, detail: event.detail }));
});

function paintPage(ctx, viewport, pdfPage) {
  // Stand-in for the search highlighter: the application paints in device pixels but works out
  // where to paint from PDF user space, so both directions of the mapping are recorded.
  const [x0, y0] = viewport.convertToPdfPoint(0, 0);
  const [x1, y1] = viewport.convertToPdfPoint(viewport.width, viewport.height);
  demo.paintCalls.push({
    pdfPage, width: viewport.width, height: viewport.height, scale: viewport.scale,
    topLeft: [x0, y0], bottomRight: [x1, y1],
  });
  ctx.fillStyle = "rgba(255, 214, 0, 0.35)";
  ctx.fillRect(viewport.width * 0.1, viewport.height * 0.1, viewport.width * 0.3, viewport.height * 0.05);
}

function start() {
  const book = ZayaBook.create(container, pdf, {
    renderMode: render,
    direction: params.get("dir") === "rtl" ? "rtl" : "ltr",
    hard: params.get("hard") || "none",
    duration: Number(params.get("duration") || 700),
    openPage: Number(params.get("page") || 1),
    pageMode: params.get("mode") === "single" ? "single" : (params.get("mode") === "double" ? "double" : null),
    doubleInternal: params.get("internal") === "1",
    paddingTop: Number(params.get("padTop") || 0),
    paddingBottom: Number(params.get("padBottom") || 0),
    backgroundColor: params.get("bg") || "#20232a",
    paintPage,
  });
  demo.book = book;
  demo.ready = book.ready.then(() => {
    document.getElementById("mode").value = book.pageMode;
    document.getElementById("dir").value = book.direction;
    document.getElementById("hard").value = book.options.hard;
    update();
    return book;
  }).catch((err) => {
    const box = document.getElementById("error");
    box.hidden = false;
    box.textContent = `Could not open the document: ${err && err.message}`;
    status.textContent = "failed";
    throw err;
  });
  return book;
}

function update() {
  const book = demo.book;
  if (!book || book.disposed) { status.textContent = "disposed"; return; }
  status.textContent = `${book.renderMode} · ${book.pageMode} · ${book.direction} · page ${book.activePage} of ${book.pageCount}`;
}

document.addEventListener("zaya:pageChanged", update);
document.getElementById("prev").addEventListener("click", () => demo.book && demo.book.prev().then(update));
document.getElementById("next").addEventListener("click", () => demo.book && demo.book.next().then(update));
document.getElementById("mode").addEventListener("change", (e) => {
  demo.book.setPageMode(e.target.value === "single", true).then(update);
});
document.getElementById("dir").addEventListener("change", (e) => {
  demo.book.setDirection(e.target.value).then(update);
});
document.getElementById("hard").addEventListener("change", (e) => {
  demo.book.options.hard = e.target.value;
  if (demo.book.layout) demo.book.layout.hard = e.target.value;
});
document.getElementById("dispose").addEventListener("click", () => { demo.book.dispose(); update(); });

start();
