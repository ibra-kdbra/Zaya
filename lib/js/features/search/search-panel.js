/**
 * Search panel – the whole UI of the "Search" tab of the Navigator.
 *
 * The Navigator hands in the pane element (`features/navigator/panes.js` builds the frame); this
 * module fills it with the form, the status line, the results list and the offer to recognise
 * pages that carry no text layer, and drives `PdfTextSearch` and the OCR engine.
 *
 * Nothing in here renders pages: painting the hits onto a page texture stays behind the engine
 * facade, which this module reaches through the `onHighlight` / `onRefreshHighlights` callbacks.
 */

import { PdfTextSearch } from './pdf-search.js';
import { OcrEngine, OcrStore, LANG_CHOICES, choiceLabel, preferredLanguage, rememberLanguage, languageLabel } from './ocr.js';

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

/** The class the Navigator puts on whichever pane is showing. */
const VISIBLE = 'nav-pane-visible';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {object} opts
 * @param {Element} opts.container   the Search pane, already in the DOM
 * @param {object} opts.pdfDocument  pdf.js document proxy
 * @param {string} [opts.docKey]     key the recognised text is stored under
 * @param {number} [opts.pageCount]  book pages, used to clamp navigation
 * @param {() => number} [opts.activePage]        page being read, so recognition starts there
 * @param {(pdfPage:number) => number} [opts.toBookPage]  PDF page number → flipbook page number
 * @param {(query:string) => void} [opts.onHighlight]     set (or clear with "") the painted query
 * @param {() => void} [opts.onRefreshHighlights]         repaint visible pages, new text arrived
 * @param {(bookPage:number) => void} [opts.onGotoPage]   turn the book to a page
 * @returns {{controller: PdfTextSearch, input: HTMLInputElement, dispose: () => void}}
 */
export function createSearchPanel(opts) {
  const container = opts.container;
  const pdfDocument = opts.pdfDocument;
  const docKey = opts.docKey || "";
  const pageCount = opts.pageCount || 0;
  const activePage = opts.activePage || (() => 1);
  const toBookPage = opts.toBookPage || ((p) => p);
  const onHighlight = opts.onHighlight || (() => {});
  const onRefreshHighlights = opts.onRefreshHighlights || (() => {});
  const onGotoPage = opts.onGotoPage || (() => {});

  const wrapper = element("div", "nav-search-wrapper");
  const form = element("form", "nav-search-form");
  form.setAttribute("role", "search");
  const input = element("input", "nav-search-input");
  input.type = "search";
  input.placeholder = t("search.placeholder");
  input.setAttribute("aria-label", t("search.label"));
  input.autocomplete = "off";
  input.spellcheck = false;
  const status = element("div", "nav-search-status");
  status.setAttribute("aria-live", "polite");
  const results = element("div", "nav-search-results");
  results.setAttribute("role", "list");
  // Pages without a text layer can be recognised on this device (see features/search/ocr.js)
  const ocrBox = element("div", "nav-ocr");
  ocrBox.hidden = true;
  const ocrText = element("p", "nav-ocr-text");
  const ocrRow = element("div", "nav-ocr-row");
  // Language as a segmented control: a native <select> inside the drawer misbehaves on several
  // browsers, and three choices need no menu.
  let ocrLangValue = preferredLanguage();
  const ocrLang = element("div", "nav-ocr-langs");
  ocrLang.setAttribute("role", "radiogroup");
  ocrLang.setAttribute("aria-label", t("ocr.language"));
  const ocrLangButtons = LANG_CHOICES.map((c) => {
    const b = element("button", "nav-ocr-langbtn", choiceLabel(c));
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.lang = c.id;
    b.setAttribute("aria-checked", String(c.id === ocrLangValue));
    return b;
  });
  ocrLangButtons.forEach((b) => ocrLang.appendChild(b));
  const ocrHint = element("p", "nav-ocr-hint", t("ocr.hint"));
  const ocrRun = element("button", "ui-btn ui-btn-primary nav-ocr-run", t("ocr.recognise"));
  ocrRun.type = "button";
  const ocrProgress = element("p", "nav-ocr-progress");
  ocrProgress.setAttribute("aria-live", "polite");
  ocrRow.appendChild(ocrRun);
  ocrBox.append(ocrText, ocrLang, ocrHint, ocrRow, ocrProgress);

  const setOcrLang = (id) => {
    ocrLangValue = id;
    ocrLangButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === id)));
    rememberLanguage(id);
  };
  ocrLang.addEventListener("click", (e) => {
    const btn = e.target.closest ? e.target.closest("[data-lang]") : null;
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    setOcrLang(btn.dataset.lang);
  });
  ocrLang.addEventListener("keydown", (e) => {
    const btn = e.target.closest ? e.target.closest("[data-lang]") : null;
    if (!btn) return;
    const ids = LANG_CHOICES.map((c) => c.id);
    const i = ids.indexOf(btn.dataset.lang);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i + ids.length - 1) % ids.length;
    if (next < 0) return;
    e.preventDefault(); e.stopPropagation();
    setOcrLang(ids[next]);
    ocrLangButtons[next].focus();
  });

  form.appendChild(input);
  wrapper.append(form, status, ocrBox, results);
  container.appendChild(wrapper);

  const controller = new PdfTextSearch(pdfDocument);
  let disposed = false;
  let ocrEngine = null;
  let ocrRunning = false;
  let ocrCancel = false;
  const isCurrent = () => !disposed;

  const bumpHighlights = () => {
    onRefreshHighlights();
  };

  const show = (node, on) => { node.style.display = on ? "" : "none"; };

  const updateOcrBox = () => {
    if (!isCurrent()) return;
    if (ocrRunning) return;
    if (!controller.isComplete) { ocrBox.hidden = true; return; }
    const need = controller.pagesNeedingText();
    const st = controller.stats();
    if (!need.length) {
      if (!st.ocr) { ocrBox.hidden = true; return; }
      ocrBox.hidden = false;
      ocrText.textContent = t("ocr.done", { n: st.ocr });
      show(ocrRow, false); show(ocrLang, false); show(ocrHint, false);
      return;
    }
    ocrBox.hidden = false;
    show(ocrRow, true); show(ocrLang, true); show(ocrHint, true);
    ocrText.textContent = need.length === st.pages
      ? t("ocr.noTextLayer")
      : t("ocr.someNoTextLayer", { n: need.length, pages: st.pages });
    ocrRun.textContent = need.length === st.pages ? t("ocr.recognise") : t("ocr.recognisePages", { n: need.length });
  };

  // Recognised text from an earlier visit joins the index straight away.
  OcrStore.load(docKey).then((cached) => {
    if (!cached.size || !isCurrent()) return;
    cached.forEach((v, p) => controller.setPageFromLines(p, v.lines));
    if (lastQuery.trim().length >= 2) render(lastQuery);
    bumpHighlights();
    updateOcrBox();
  });

  const runOcr = async () => {
    if (ocrRunning || !isCurrent()) return;
    const pages = controller.pagesNeedingText();
    if (!pages.length) return;
    const lang = ocrLangValue;
    rememberLanguage(lang);
    ocrRunning = true;
    ocrCancel = false;
    ocrRun.textContent = t("ocr.stop");
    ocrLangButtons.forEach((b) => { b.disabled = true; });
    show(ocrHint, false);
    ocrProgress.textContent = t("ocr.loadingEngine");
    let loadingShown = true;
    const engine = new OcrEngine(lang, (info) => {
      if (!ocrRunning || !loadingShown) return;
      if (info.stage.indexOf("loading") === 0 || info.stage.indexOf("initializ") === 0) {
        ocrProgress.textContent = t("ocr.loadingLanguage", { lang: languageLabel(lang) });
      }
    });
    ocrEngine = engine;
    // Start at the page being read, then continue through the rest of the book.
    const current = Math.max(1, Math.min(pageCount || 1, activePage() || 1));
    const queue = pages.filter((p) => p >= current).concat(pages.filter((p) => p < current));
    const total = queue.length;
    let done = 0;
    const startedAt = Date.now();
    const eta = () => {
      if (done < 2) return "";
      const perPage = (Date.now() - startedAt) / done;
      const left = Math.round((perPage * (total - done)) / 1000);
      if (left < 60) return t("ocr.etaSeconds", { n: Math.max(5, Math.round(left / 5) * 5) });
      return t("ocr.etaMinutes", { n: Math.max(1, Math.round(left / 60)) });
    };
    const report = (busy) => {
      loadingShown = false;
      const inFlight = busy.size
        ? t("ocr.progressPages", { n: busy.size, list: Array.from(busy).sort((a, b) => a - b).join(", ") })
        : "";
      ocrProgress.textContent = t("ocr.progress", { pages: inFlight, done, total, eta: eta() });
    };
    const busy = new Set();
    const stopped = () => ocrCancel || !isCurrent();
    const lane = async () => {
      while (queue.length && !stopped()) {
        const p = queue.shift();
        busy.add(p);
        report(busy);
        try {
          const page = await pdfDocument.getPage(p);
          const lines = await engine.recognizePage(page);
          if (stopped()) break;
          // Stored even when empty: a blank page is not offered for recognition again.
          controller.setPageFromLines(p, lines);
          OcrStore.save(docKey, p, lang, lines);
          done++;
          if (lastQuery.trim().length >= 2) render(lastQuery);
          bumpHighlights();
        } finally {
          busy.delete(p);
        }
        report(busy);
      }
    };
    try {
      await engine.start();
      const lanes = Math.max(1, Math.min(engine.workers.length || 1, total));
      await Promise.all(Array.from({ length: lanes }, lane));
    } catch (err) {
      if (!ocrCancel) {
        console.warn("Text recognition failed:", err);
        ocrProgress.textContent = t("ocr.failed", { reason: (err && err.message) || t("ocr.unknownError") });
      }
    } finally {
      engine.terminate();
      if (ocrEngine === engine) ocrEngine = null;
      ocrRunning = false;
      ocrLangButtons.forEach((b) => { b.disabled = false; });
      const secs = Math.round((Date.now() - startedAt) / 1000);
      const took = secs >= 90 ? t("ocr.tookMinutes", { n: Math.round(secs / 60) }) : t("ocr.tookSeconds", { n: secs });
      if (done) ocrProgress.textContent = ocrCancel ? t("ocr.stopped", { n: done }) : t("ocr.finished", { n: done, took });
      else if (ocrCancel) ocrProgress.textContent = "";
      updateOcrBox();
    }
  };

  ocrRun.addEventListener("click", (e) => {
    e.stopPropagation();
    if (ocrRunning) {
      ocrCancel = true;
      ocrProgress.textContent = t("ocr.stopping");
      if (ocrEngine) ocrEngine.terminate();
    } else {
      runOcr();
    }
  });

  // Index as soon as the panel is shown, so the offer to recognise pages appears without a query.
  let indexKicked = false;
  const kickIndex = () => {
    if (indexKicked || !isCurrent()) return;
    indexKicked = true;
    controller.index().then(updateOcrBox);
  };
  const observer = new MutationObserver(() => { if (container.classList.contains(VISIBLE)) kickIndex(); });
  observer.observe(container, { attributes: true, attributeFilter: ["class"] });
  if (container.classList.contains(VISIBLE)) kickIndex();

  let debounce = null;
  let lastQuery = "";

  const render = (query) => {
    results.replaceChildren();
    const hits = controller.search(query);
    const total = hits.reduce((n, h) => n + h.count, 0);
    const done = controller.isComplete;
    if (!hits.length) {
      if (!done) { status.textContent = t("search.searching"); return; }
      const st = controller.stats();
      if (st.withText === 0) {
        status.textContent = t("search.noTextLayer");
      } else if (st.unreadable >= Math.max(1, st.withText / 2)) {
        status.textContent = t("search.glyphCodes");
      } else if (st.withText < st.pages / 2) {
        status.textContent = t("search.partialText", { withText: st.withText, pages: st.pages });
      } else {
        status.textContent = t("search.noMatches");
      }
      return;
    }
    status.textContent = t("search.matches", { n: total }) + " " + t("search.onPages", { n: hits.length })
      + (done ? "" : t("search.indexing"));
    const frag = document.createDocumentFragment();
    for (const hit of hits) {
      const item = element("div", "nav-search-result");
      item.setAttribute("role", "listitem");
      item.tabIndex = 0;
      item.dataset.page = String(hit.page);

      const head = element("div", "nav-search-result-head", t("search.resultPage", { n: hit.page }));
      const badge = element("span", "nav-search-result-count", String(hit.count));
      head.appendChild(badge);
      item.appendChild(head);

      for (const sn of hit.snippets) {
        const line = element("div", "nav-search-snippet");
        line.appendChild(document.createTextNode(sn.before));
        const mark = document.createElement("mark");
        mark.textContent = sn.match;
        line.appendChild(mark);
        line.appendChild(document.createTextNode(sn.after));
        item.appendChild(line);
      }
      frag.appendChild(item);
    }
    results.appendChild(frag);
  };

  const runQuery = (query) => {
    lastQuery = query;
    if (query.trim().length < 2) {
      results.replaceChildren();
      status.textContent = query.trim().length ? t("search.typeMore") : "";
      onHighlight("");
      return;
    }
    render(query);
    onHighlight(query);
    if (!controller.isComplete) {
      let lastPaint = 0;
      controller.index((done, total) => {
        const now = Date.now();
        if (now - lastPaint > 150 || done === total) {
          lastPaint = now;
          if (lastQuery === query) render(query);
        }
      }).then(() => {
        updateOcrBox();
        if (lastQuery !== query) return;
        render(query);
        // pages shown before their text was indexed get their marks now
        onRefreshHighlights(true);
      });
    }
  };

  input.addEventListener("input", function () {
    clearTimeout(debounce);
    const q = this.value;
    debounce = setTimeout(() => runQuery(q), 250);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(debounce);
    runQuery(input.value);
    const first = results.querySelector(".nav-search-result");
    if (first) first.click();
  });

  const navigate = (el) => {
    const page = parseInt(el.dataset.page, 10);
    if (!isNaN(page)) onGotoPage(toBookPage(page));
    results.querySelectorAll(".nav-search-result").forEach((r) => r.classList.remove("is-current"));
    el.classList.add("is-current");
  };
  results.addEventListener("click", (e) => {
    const item = e.target.closest ? e.target.closest(".nav-search-result") : null;
    if (!item) return;
    e.stopPropagation();
    navigate(item);
  });
  results.addEventListener("keydown", (e) => {
    const item = e.target.closest ? e.target.closest(".nav-search-result") : null;
    if (!item) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(item);
    }
  });

  container.addEventListener("transitionend", () => {
    if (container.classList.contains(VISIBLE)) input.focus();
  });

  /*
   * The pane is built here rather than in the markup, so a language switch has to redraw its
   * own labels: the form, the recognition offer and whatever the status line last said.
   */
  const onLanguageChanged = () => {
    if (disposed) return;
    input.placeholder = t("search.placeholder");
    input.setAttribute("aria-label", t("search.label"));
    ocrLang.setAttribute("aria-label", t("ocr.language"));
    ocrLangButtons.forEach((b, i) => { b.textContent = choiceLabel(LANG_CHOICES[i]); });
    ocrHint.textContent = t("ocr.hint");
    if (!ocrRunning) updateOcrBox();
    if (lastQuery.trim().length >= 2) render(lastQuery);
    else status.textContent = lastQuery.trim().length ? t("search.typeMore") : "";
  };
  document.addEventListener("zaya:languageChanged", onLanguageChanged);

  return {
    controller,
    input,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(debounce);
      document.removeEventListener("zaya:languageChanged", onLanguageChanged);
      observer.disconnect();
      if (ocrEngine) {
        ocrEngine.terminate();
        ocrEngine = null;
      }
      controller.dispose();
    },
  };
}
