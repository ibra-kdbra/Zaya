/**
 * Search panel – the whole UI of the "Search" tab of the Navigator.
 *
 * The flipbook engine owns the `.df-search-container` element (it needs the engine's stage to
 * suppress orbiting and scroll while the pointer is over the drawer) and hands it here; this
 * module fills it with the form, the status line, the results list and the offer to recognise
 * pages that carry no text layer, and drives `PdfTextSearch` and the OCR engine.
 *
 * Nothing in here renders pages: painting the hits onto a page texture stays in the engine,
 * which calls back through `onHighlight` / `onRefreshHighlights`.
 */

import { PdfTextSearch } from './pdf-search.js';
import { OcrEngine, OcrStore, LANG_CHOICES, choiceLabel, preferredLanguage, rememberLanguage, languageLabel } from './ocr.js';

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

/**
 * @param {object} opts
 * @param {object} opts.container    jQuery `.df-search-container`, already in the DOM
 * @param {object} opts.pdfDocument  pdf.js document proxy
 * @param {string} [opts.docKey]     key the recognised text is stored under
 * @param {number} [opts.pageCount]  book pages, used to clamp navigation
 * @param {() => number} [opts.activePage]        page being read, so recognition starts there
 * @param {(pdfPage:number) => number} [opts.toBookPage]  PDF page number → flipbook page number
 * @param {(query:string) => void} [opts.onHighlight]     set (or clear with "") the painted query
 * @param {() => void} [opts.onRefreshHighlights]         repaint visible pages, new text arrived
 * @param {(bookPage:number) => void} [opts.onGotoPage]   turn the book to a page
 * @param {() => void} [opts.onClose]                     the panel's close button was pressed
 * @returns {{controller: PdfTextSearch, input: object, dispose: () => void}}
 */
export function createSearchPanel(opts) {
  const $ = jQuery;
  const container = opts.container;
  const pdfDocument = opts.pdfDocument;
  const docKey = opts.docKey || "";
  const pageCount = opts.pageCount || 0;
  const activePage = opts.activePage || (() => 1);
  const toBookPage = opts.toBookPage || ((p) => p);
  const onHighlight = opts.onHighlight || (() => {});
  const onRefreshHighlights = opts.onRefreshHighlights || (() => {});
  const onGotoPage = opts.onGotoPage || (() => {});

  const wrapper = $("<div>").addClass("df-search-wrapper");
  const form = $("<form>").addClass("df-search-form").attr("role", "search");
  const input = $("<input>").addClass("df-search-input")
    .attr({ type: "search", placeholder: t("search.placeholder"), "aria-label": t("search.label"), autocomplete: "off", spellcheck: "false" });
  const status = $("<div>").addClass("df-search-status").attr("aria-live", "polite");
  const results = $("<div>").addClass("df-search-results").attr("role", "list");
  // Pages without a text layer can be recognised on this device (see features/search/ocr.js)
  const ocrBox = $("<div>").addClass("df-ocr").attr("hidden", "hidden");
  const ocrText = $("<p>").addClass("df-ocr-text");
  const ocrRow = $("<div>").addClass("df-ocr-row");
  // Language as a segmented control: a native <select> inside the drawer misbehaves on several
  // browsers (the engine's pointer handlers swallow the popup), and three choices need no menu.
  let ocrLangValue = preferredLanguage();
  const ocrLang = $("<div>").addClass("df-ocr-langs").attr({ role: "radiogroup", "aria-label": t("ocr.language") });
  const ocrLangButtons = LANG_CHOICES.map((c) => $("<button>").attr({ type: "button", role: "radio", "data-lang": c.id, "aria-checked": String(c.id === ocrLangValue) }).addClass("df-ocr-langbtn").text(choiceLabel(c)));
  ocrLangButtons.forEach((b) => ocrLang.append(b));
  const ocrHint = $("<p>").addClass("df-ocr-hint").text(t("ocr.hint"));
  const ocrRun = $("<button>").attr("type", "button").addClass("ui-btn ui-btn-primary df-ocr-run").text(t("ocr.recognise"));
  const ocrProgress = $("<p>").addClass("df-ocr-progress").attr("aria-live", "polite");
  ocrRow.append(ocrRun);
  ocrBox.append(ocrText).append(ocrLang).append(ocrHint).append(ocrRow).append(ocrProgress);
  const setOcrLang = (id) => {
    ocrLangValue = id;
    ocrLangButtons.forEach((b) => b.attr("aria-checked", String(b.attr("data-lang") === id)));
    rememberLanguage(id);
  };
  ocrLang.on("click", "[data-lang]", function (e) { e.stopPropagation(); e.preventDefault(); setOcrLang(this.getAttribute("data-lang")); });
  ocrLang.on("keydown", "[data-lang]", function (e) {
    const ids = LANG_CHOICES.map((c) => c.id);
    const i = ids.indexOf(this.getAttribute("data-lang"));
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i + ids.length - 1) % ids.length;
    if (next < 0) return;
    e.preventDefault(); e.stopPropagation();
    setOcrLang(ids[next]);
    ocrLangButtons[next].trigger("focus");
  });
  form.append(input);
  wrapper.append(form).append(status).append(ocrBox).append(results);
  container.append(wrapper);

  const controller = new PdfTextSearch(pdfDocument);
  let disposed = false;
  let ocrEngine = null;
  let ocrRunning = false;
  let ocrCancel = false;
  const isCurrent = () => !disposed;

  const bumpHighlights = () => {
    onRefreshHighlights();
  };

  const updateOcrBox = () => {
    if (!isCurrent()) return;
    if (ocrRunning) return;
    if (!controller.isComplete) { ocrBox.attr("hidden", "hidden"); return; }
    const need = controller.pagesNeedingText();
    const st = controller.stats();
    if (!need.length) {
      if (!st.ocr) { ocrBox.attr("hidden", "hidden"); return; }
      ocrBox.removeAttr("hidden");
      ocrText.text(t("ocr.done", { n: st.ocr }));
      ocrRow.hide(); ocrLang.hide(); ocrHint.hide();
      return;
    }
    ocrBox.removeAttr("hidden");
    ocrRow.show(); ocrLang.show(); ocrHint.show();
    ocrText.text(need.length === st.pages
      ? t("ocr.noTextLayer")
      : t("ocr.someNoTextLayer", { n: need.length, pages: st.pages }));
    ocrRun.text(need.length === st.pages ? t("ocr.recognise") : t("ocr.recognisePages", { n: need.length }));
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
    ocrRun.text(t("ocr.stop"));
    ocrLang.find("button").prop("disabled", true);
    ocrHint.hide();
    ocrProgress.text(t("ocr.loadingEngine"));
    let loadingShown = true;
    const engine = new OcrEngine(lang, (info) => {
      if (!ocrRunning || !loadingShown) return;
      if (info.stage.indexOf("loading") === 0 || info.stage.indexOf("initializ") === 0) {
        ocrProgress.text(t("ocr.loadingLanguage", { lang: languageLabel(lang) }));
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
      ocrProgress.text(t("ocr.progress", { pages: inFlight, done, total, eta: eta() }));
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
        ocrProgress.text(t("ocr.failed", { reason: (err && err.message) || t("ocr.unknownError") }));
      }
    } finally {
      engine.terminate();
      if (ocrEngine === engine) ocrEngine = null;
      ocrRunning = false;
      ocrLang.find("button").prop("disabled", false);
      const secs = Math.round((Date.now() - startedAt) / 1000);
      const took = secs >= 90 ? t("ocr.tookMinutes", { n: Math.round(secs / 60) }) : t("ocr.tookSeconds", { n: secs });
      if (done) ocrProgress.text(ocrCancel ? t("ocr.stopped", { n: done }) : t("ocr.finished", { n: done, took }));
      else if (ocrCancel) ocrProgress.text("");
      updateOcrBox();
    }
  };

  ocrRun.on("click", (e) => {
    e.stopPropagation();
    if (ocrRunning) {
      ocrCancel = true;
      ocrProgress.text(t("ocr.stopping"));
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
  const observer = new MutationObserver(() => { if (container.hasClass("df-sidemenu-visible")) kickIndex(); });
  observer.observe(container[0], { attributes: true, attributeFilter: ["class"] });
  if (container.hasClass("df-sidemenu-visible")) kickIndex();

  let debounce = null;
  let lastQuery = "";

  const render = (query) => {
    results.empty();
    const hits = controller.search(query);
    const total = hits.reduce((n, h) => n + h.count, 0);
    const done = controller.isComplete;
    if (!hits.length) {
      if (!done) { status.text(t("search.searching")); return; }
      const st = controller.stats();
      if (st.withText === 0) {
        status.text(t("search.noTextLayer"));
      } else if (st.unreadable >= Math.max(1, st.withText / 2)) {
        status.text(t("search.glyphCodes"));
      } else if (st.withText < st.pages / 2) {
        status.text(t("search.partialText", { withText: st.withText, pages: st.pages }));
      } else {
        status.text(t("search.noMatches"));
      }
      return;
    }
    status.text(t("search.matches", { n: total }) + " " + t("search.onPages", { n: hits.length })
      + (done ? "" : t("search.indexing")));
    const frag = document.createDocumentFragment();
    for (const hit of hits) {
      const item = document.createElement("div");
      item.className = "df-search-result";
      item.setAttribute("role", "listitem");
      item.tabIndex = 0;
      item.dataset.page = String(hit.page);

      const head = document.createElement("div");
      head.className = "df-search-result-head";
      head.textContent = t("search.resultPage", { n: hit.page });
      const badge = document.createElement("span");
      badge.className = "df-search-result-count";
      badge.textContent = String(hit.count);
      head.appendChild(badge);
      item.appendChild(head);

      for (const sn of hit.snippets) {
        const line = document.createElement("div");
        line.className = "df-search-snippet";
        line.appendChild(document.createTextNode(sn.before));
        const mark = document.createElement("mark");
        mark.textContent = sn.match;
        line.appendChild(mark);
        line.appendChild(document.createTextNode(sn.after));
        item.appendChild(line);
      }
      frag.appendChild(item);
    }
    results[0].appendChild(frag);
  };

  const runQuery = (query) => {
    lastQuery = query;
    if (query.trim().length < 2) {
      results.empty();
      status.text(query.trim().length ? t("search.typeMore") : "");
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

  input.on("input", function () {
    clearTimeout(debounce);
    const q = this.value;
    debounce = setTimeout(() => runQuery(q), 250);
  });
  form.on("submit", (e) => {
    e.preventDefault();
    clearTimeout(debounce);
    runQuery(input.val());
    const first = results.find(".df-search-result").first();
    if (first.length) first.trigger("click");
  });

  const navigate = (el) => {
    const page = parseInt(el.dataset.page, 10);
    if (!isNaN(page)) onGotoPage(toBookPage(page));
    results.find(".df-search-result").removeClass("df-selected");
    el.classList.add("df-selected");
  };
  results.on("click", ".df-search-result", function (e) {
    e.stopPropagation();
    navigate(this);
  });
  results.on("keydown", ".df-search-result", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(this);
    }
  });

  container.on("transitionend", () => {
    if (container.hasClass("df-sidemenu-visible")) input.trigger("focus");
  });

  /*
   * The pane is built here rather than in the markup, so a language switch has to redraw its
   * own labels: the form, the recognition offer and whatever the status line last said.
   */
  const onLanguageChanged = () => {
    if (disposed) return;
    input.attr({ placeholder: t("search.placeholder"), "aria-label": t("search.label") });
    ocrLang.attr("aria-label", t("ocr.language"));
    ocrLangButtons.forEach((b, i) => b.text(choiceLabel(LANG_CHOICES[i])));
    ocrHint.text(t("ocr.hint"));
    if (!ocrRunning) updateOcrBox();
    if (lastQuery.trim().length >= 2) render(lastQuery);
    else status.text(lastQuery.trim().length ? t("search.typeMore") : "");
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
