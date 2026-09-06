/*
 * The Text pane (issue #26).
 *
 * The flipbook paints its pages onto canvases and WebGL textures, so nothing on the page itself
 * can be selected. This pane puts the text of the pages currently on screen into the Navigator as
 * real, selectable text: one section per visible page, paragraphs rebuilt from the line geometry
 * the search index already holds, and a small action bar over any selection with "Add as note",
 * "Copy" and "Search".
 *
 * The text comes from the search controller (features/search/pdf-search.js), so a page whose text
 * was recognised on the device reads exactly like one with a text layer. Unlike the other three
 * Navigator panes, this one is not the engine's: the module builds it, and ZayaNavigator drives
 * it through `ensure` / `setVisible` / `reset`.
 */
window.ZayaTextPane = (function () {
    "use strict";

    const PANE_ID = "navPaneText";

    let pane = null;          // the pane element, once built
    let list = null;          // the scrolling column of page sections
    let bar = null;           // the floating action bar
    let visible = false;
    let renderedKey = "";     // the spread + text state last painted, so a repaint is cheap
    let indexRequested = false;
    let selectionPage = null; // the page the current selection came from
    let selectionText = "";

    const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

    function toast(text, backgroundColor, duration) {
        if (typeof Toastify !== "function") return;
        Toastify({
            text,
            duration: duration || 3000,
            gravity: "bottom",
            position: "right",
            backgroundColor
        }).showToast();
    }

    const book = () => (window.ZayaBook ? window.ZayaBook.current : null);

    /**
     * The search index, created on demand: the Text pane may be the first thing the reader opens,
     * and the search panel is only built when its own tab is asked for.
     */
    function controller() {
        const fb = book();
        if (!fb) return null;
        const had = !!fb.searchController;
        const ctrl = fb.ensureSearch();
        if (ctrl && !had && window.ZayaNavigator) window.ZayaNavigator.adopt();
        return ctrl;
    }

    /** The PDF pages of the spread on screen: one page in single mode, the pair in double mode. */
    function visiblePdfPages() {
        const fb = book();
        return fb ? fb.visiblePdfPages() : [];
    }

    /**
     * Lines into paragraphs. A line that starts noticeably further down the page than the last
     * one ended -- more than about half a line of extra leading -- begins a new paragraph.
     */
    function paragraphsFrom(lines) {
        const paras = [];
        let current = [];
        let prev = null;
        lines.forEach((line) => {
            const gap = prev ? prev.y - line.y : 0;
            const lead = Math.max(prev ? prev.height : line.height, 1);
            // A negative gap means the run moved back up the page: a column or a new block.
            const broken = prev && (gap > lead * 1.6 || gap < -lead * 0.5);
            if (broken && current.length) { paras.push(current.join(" ")); current = []; }
            current.push(line.text);
            prev = line;
        });
        if (current.length) paras.push(current.join(" "));
        return paras;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function build() {
        const host = document.getElementById("navigatorBody");
        if (!host || document.getElementById(PANE_ID)) return;
        pane = element("div", "df-sidemenu text-pane");
        pane.id = PANE_ID;
        pane.dataset.navTab = "text";
        pane.setAttribute("role", "tabpanel");
        pane.setAttribute("aria-labelledby", "navTabText");
        pane.tabIndex = 0;
        list = element("div", "text-pane-list");
        pane.appendChild(list);
        host.appendChild(pane);
        buildActionBar();
    }

    /* ------------------------------------------------------------ the states */

    function showState(iconClass, message, action) {
        list.replaceChildren();
        const box = element("div", "text-pane-state");
        const icon = element("i", iconClass);
        icon.setAttribute("aria-hidden", "true");
        box.appendChild(icon);
        box.appendChild(element("p", null, message));
        if (action) {
            const btn = element("button", "text-pane-link", action.label);
            btn.type = "button";
            btn.addEventListener("click", action.onClick);
            box.appendChild(btn);
        }
        list.appendChild(box);
    }

    /* --------------------------------------------------------- page sections */

    function pageSection(pdfPage, paragraphs) {
        const section = element("section", "text-page");
        section.dataset.page = String(pdfPage);

        const head = element("div", "text-page-head");
        head.appendChild(element("h3", "text-page-title", t("text.pageHeading", { n: pdfPage })));
        const copy = element("button", "text-page-copy");
        copy.type = "button";
        copy.title = t("text.copyPage");
        const copyIcon = element("i", "fas fa-copy");
        copyIcon.setAttribute("aria-hidden", "true");
        copy.append(copyIcon, element("span", null, t("text.copyPage")));
        copy.addEventListener("click", () => copyPage(pdfPage, copy));
        head.appendChild(copy);
        section.appendChild(head);

        paragraphs.forEach((text) => {
            const p = element("p", "text-page-para", text);
            p.setAttribute("dir", "auto");
            section.appendChild(p);
        });
        if (!paragraphs.length) {
            section.appendChild(element("p", "text-page-blank", t("text.blankPage")));
        }
        return section;
    }

    function pageTextOf(pdfPage) {
        const ctrl = controller();
        if (!ctrl || typeof ctrl.getPageText !== "function") return null;
        return ctrl.getPageText(pdfPage);
    }

    function copyPage(pdfPage, button) {
        const lines = pageTextOf(pdfPage) || [];
        const text = paragraphsFrom(lines).join("\n\n");
        writeClipboard(text).then((ok) => {
            const label = button.querySelector("span");
            if (!label) return;
            label.textContent = t(ok ? "text.copied" : "text.copyFailed");
            toast(t(ok ? "text.copiedToast" : "text.copyFailedToast"), ok ? "#22c55e" : "#ef4444");
            setTimeout(() => { label.textContent = t("text.copyPage"); }, 1600);
        });
    }

    function writeClipboard(text) {
        if (!text) return Promise.resolve(false);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(() => true, () => false);
        }
        return Promise.resolve(false);
    }

    /* ------------------------------------------------------------- rendering */

    function render(force) {
        if (!pane) return;
        const pages = visiblePdfPages();
        const ctrl = controller();
        if (!ctrl) {
            renderedKey = "";
            showState("fas fa-align-left", t("nav.empty.text"));
            return;
        }

        const texts = pages.map((p) => pageTextOf(p));
        const key = pages.map((p, i) => p + ":" + (texts[i] === null ? "?" : texts[i].length)).join(",");
        if (!force && key === renderedKey) return;
        renderedKey = key;

        // Nothing indexed for these pages yet: ask for the index and say so quietly.
        if (texts.every((t) => t === null)) {
            showState("fas fa-hourglass-half", t("text.reading"));
            requestIndex();
            return;
        }

        const stats = ctrl.stats();
        if (ctrl.isComplete && stats.withText === 0) {
            showState("fas fa-image", t("text.noText"),
                { label: t("text.openSearch"), onClick: () => { if (window.ZayaNavigator) window.ZayaNavigator.setTab("search"); } });
            return;
        }

        const frag = document.createDocumentFragment();
        pages.forEach((p, i) => {
            const lines = texts[i];
            frag.appendChild(pageSection(p, lines === null ? [] : paragraphsFrom(lines)));
            if (lines === null) requestIndex();
        });
        list.replaceChildren(frag);
        list.scrollTop = 0;
    }

    function requestIndex() {
        const ctrl = controller();
        if (!ctrl || indexRequested || ctrl.isComplete) return;
        indexRequested = true;
        ctrl.index().then(() => { indexRequested = false; if (visible) render(true); },
            () => { indexRequested = false; });
    }

    /* ---------------------------------------------------- the selection's bar */

    function buildActionBar() {
        if (bar) return;
        bar = element("div", "text-actions");
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", t("text.selection"));
        bar.hidden = true;

        const make = (iconClass, label, onClick) => {
            const btn = element("button", "text-action");
            btn.type = "button";
            btn.title = label;
            const icon = element("i", iconClass);
            icon.setAttribute("aria-hidden", "true");
            btn.append(icon, element("span", null, label));
            btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
            btn.addEventListener("click", onClick);
            return btn;
        };

        bar.append(
            make("fas fa-quote-left", t("text.addNote"), () => addNote()),
            make("fas fa-copy", t("text.copy"), () => {
                const text = selectionText;
                writeClipboard(text).then((ok) => {
                    hideBar();
                    toast(t(ok ? "text.copiedToast" : "text.copyFailedToast"), ok ? "#22c55e" : "#ef4444");
                });
            }),
            make("fas fa-search", t("text.search"), () => {
                const query = selectionText;
                hideBar();
                if (!window.ZayaNavigator) return;
                window.ZayaNavigator.setTab("search");
                setTimeout(() => {
                    const fb = book();
                    if (!fb) return;
                    fb.openSearch(query);
                    const input = fb.searchInput();
                    if (input) input.focus();
                }, 80);
            })
        );
        document.body.appendChild(bar);
    }

    function addNote() {
        const text = selectionText;
        const page = selectionPage;
        hideBar();
        if (!text) return;
        if (!window.ZayaQuotes || !window.ZayaQuotes.add) return;
        // ZayaQuotes speaks for itself when the note is refused; only the saved case is ours.
        window.ZayaQuotes.add(text, page, (saved) => {
            if (saved) toast(t("text.noteAdded"), "#22c55e");
        });
    }

    function hideBar() {
        if (bar) bar.hidden = true;
        selectionText = "";
        selectionPage = null;
    }

    function placeBar(rect) {
        bar.hidden = false;
        // Measured after it is shown, so the width is the real one.
        const box = bar.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left + (rect.width - box.width) / 2));
        let top = rect.top - box.height - 8;
        if (top < 8) top = Math.min(window.innerHeight - box.height - 8, rect.bottom + 8);
        bar.style.left = Math.round(left) + "px";
        bar.style.top = Math.round(top) + "px";
    }

    /** The reader's selection, but only when it lies inside a page section of this pane. */
    function readSelection() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        const text = sel.toString().trim();
        if (!text) return null; // whitespace only: nothing worth acting on
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const host = (node.nodeType === 1 ? node : node.parentElement);
        const section = host && host.closest ? host.closest("#" + PANE_ID + " .text-page") : null;
        if (!section) return null;
        const rect = range.getBoundingClientRect();
        return { text, page: Number(section.dataset.page) || null, rect };
    }

    function syncSelection() {
        if (!visible || !bar) return;
        const found = readSelection();
        if (!found) { hideBar(); return; }
        selectionText = found.text;
        selectionPage = found.page;
        const rect = found.rect;
        if (!rect || (!rect.width && !rect.height)) { hideBar(); return; }
        placeBar(rect);
    }

    /* ----------------------------------------------------------------- wiring */

    function setVisible(on) {
        visible = !!on;
        if (pane) pane.classList.toggle("df-sidemenu-visible", visible);
        if (!visible) { hideBar(); return; }
        render(true);
    }

    function ensure() {
        build();
        render(false);
    }

    /** A new document: drop what was painted so the next render starts from the new book. */
    function reset() {
        renderedKey = "";
        indexRequested = false;
        hideBar();
        if (list) list.replaceChildren();
    }

    function onPageChanged() {
        hideBar(); // an action bar left over the old page would file the wrong note
        if (visible) render(false);
    }

    function init() {
        build();
        document.addEventListener("zaya:pageChanged", onPageChanged);
        // The pane and its bar draw their own words, so both are rebuilt when the language changes.
        document.addEventListener("zaya:languageChanged", () => {
            hideBar();
            if (bar) { bar.remove(); bar = null; buildActionBar(); }
            if (pane) render(true);
        });
        document.addEventListener("zaya:pdfLoaded", () => { reset(); if (visible) render(true); });
        // Recognition landing on a page that is on screen fills it in without a page turn.
        document.addEventListener("zaya:pageTextChanged", (e) => {
            if (!visible) return;
            const page = e.detail && e.detail.page;
            if (page && visiblePdfPages().indexOf(page) === -1) return;
            render(true);
        });

        document.addEventListener("selectionchange", () => {
            if (!visible) return;
            // After the pointer is up, so a drag does not move the bar on every frame.
            clearTimeout(init._selTimer);
            init._selTimer = setTimeout(syncSelection, 60);
        });

        // On the window, in the capture phase: it has to run before the Navigator's own Esc
        // handler on `document`, so Esc clears the bar instead of closing the drawer under it.
        window.addEventListener("keydown", (e) => {
            if (!visible || !bar || bar.hidden) return;
            if (e.key === "Escape") { e.stopPropagation(); hideBar(); return; }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "N" || e.key === "n")) {
                e.preventDefault();
                e.stopPropagation();
                addNote();
            }
        }, true);

        // The pane scrolls under a fixed bar, so the bar follows the selection or goes away.
        document.addEventListener("scroll", () => { if (visible && bar && !bar.hidden) syncSelection(); }, true);
        window.addEventListener("resize", () => { if (visible && bar && !bar.hidden) syncSelection(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return {
        ensure,
        reset,
        setVisible,
        refresh: () => render(true),
        isVisible: () => visible,
        visiblePages: visiblePdfPages
    };
})();
