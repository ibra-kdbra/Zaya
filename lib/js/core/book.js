/*
 * ZayaBook -- the one door between the application and the page-turn engine.
 *
 * Everything the app needs from a flipbook goes through `window.ZayaBook`. The contract it
 * publishes is written down, engine-free, in `docs/engine-api.md`, and
 * `tests/engine-contract.spec.mjs` exercises it end to end. This file is the only place in `lib/`
 * that is allowed to know how the engine under `engine-next/` is put together: it translates the
 * contract into that engine's shapes and nothing else may.
 *
 * The engine is a set of ES modules and this is a classic script, so the two meet through
 * `lib/js/core/engine.js`, a one-line module the loader runs first and which leaves the
 * constructor on `window.ZayaEngine`. This file is evaluated before that module runs -- modules
 * are deferred -- which is harmless, because all it does at evaluation time is publish the
 * namespace; the engine is looked up when a document is opened.
 *
 * Three things the fork used to do for itself are done here now, because they are the
 * application's business rather than the engine's:
 *
 *   * the Pages, Outline and Search panes (`features/navigator/panes.js`);
 *   * saving a downloaded file and showing the share box (`ui/share-box.js`);
 *   * painting search marks onto a page as it is rendered, through the engine's `paintPage`.
 *
 * Replacing the engine again would mean rewriting this one file and leaving the rest of `lib/`
 * untouched.
 */
(function () {
    "use strict";

    const PANELS = ["thumbs", "outline", "search"];

    /** How the marks a search paints onto a page are coloured. */
    const HIGHLIGHT_FILL = "rgba(255, 196, 61, 0.42)";

    const panes = () => window.ZayaPanes || null;

    /** Which renderer to use, as the page or the URL asked for it. */
    function renderModeWanted() {
        const pinned = window.ZAYA_RENDER_MODE;
        if (pinned === "css" || pinned === "webgl") return pinned;
        let asked = "";
        try { asked = String(new URLSearchParams(window.location.search).get("render") || "").toLowerCase(); }
        catch (e) { asked = ""; }
        if (asked === "css" || asked === "2d" || asked === "html") return "css";
        if (asked === "webgl" || asked === "3d") return "webgl";
        return "auto";
    }

    /**
     * A live handle on one open document. Every getter reads the engine at the moment it is
     * asked, so a handle stays correct while the engine rebuilds its stage, and reports the
     * quiet defaults (`null`, `0`, `1`) once the book has been disposed.
     */
    function Handle(instance, created) {
        const self = this;
        let engine = instance;
        let disposed = false;

        const book = () => (disposed ? null : engine);

        /*
         * The Navigator's panes are built from the open document, so a new one replaces them --
         * but only once it can answer for itself, so the drawer never stands empty in between.
         */
        if (instance && instance.ready && typeof instance.ready.then === "function") {
            instance.ready
                .then(() => { if (!disposed && panes()) panes().adopt(self); })
                .catch(() => { /* a document that will not open replaces nothing */ });
        }

        /* -------------------------------------------------------------- identity */

        Object.defineProperty(self, "source", {
            get: () => {
                const b = book();
                if (!b) return null;
                return typeof b.source === "string" ? b.source : (b.source || null);
            }
        });
        Object.defineProperty(self, "renderMode", { get: () => { const b = book(); return (b && b.renderMode) || null; } });
        Object.defineProperty(self, "hardCover", { get: () => { const b = book(); return (b && b.options && b.options.hard) || "none"; } });
        Object.defineProperty(self, "createdWith", { get: () => created });

        /*
         * A book can be turned once the document is open, its layout is worked out and something
         * is drawing it. This is read the moment the engine announces its first page, so it must
         * not wait on the promise that resolves a tick later than that.
         */
        self.isReady = () => { const b = book(); return !!(b && b.layout && b.renderer && b.pageCount > 0); };

        /* ------------------------------------------------------------ navigation */

        Object.defineProperty(self, "activePage", { get: () => { const b = book(); return (b && b.activePage) || 1; } });
        Object.defineProperty(self, "pageCount", { get: () => { const b = book(); return (b && b.pageCount) || 0; } });
        Object.defineProperty(self, "pageMode", { get: () => { const b = book(); return b && b.pageMode === "single" ? "single" : "double"; } });
        Object.defineProperty(self, "direction", { get: () => { const b = book(); return b && b.direction === "rtl" ? "rtl" : "ltr"; } });

        self.gotoPage = (n) => {
            const b = book();
            const wanted = Number(n) || 1;
            const total = self.pageCount;
            const page = Math.max(1, total ? Math.min(total, Math.round(wanted)) : Math.round(wanted));
            if (b) b.gotoPage(page);
            return self.activePage;
        };
        self.next = () => { const b = book(); if (b) b.next(); };
        self.prev = () => { const b = book(); if (b) b.prev(); };
        self.first = () => { const b = book(); if (b) b.first(); };
        self.last = () => { const b = book(); if (b) b.last(); };

        self.setPageMode = (isSingle, fromUser) => {
            const b = book();
            if (b) b.setPageMode(!!isSingle, !!fromUser);
            return self.pageMode;
        };

        /* -------------------------------------------------------------- document */

        Object.defineProperty(self, "pdfDocument", { get: () => { const b = book(); return (b && b.pdfDocument) || null; } });

        /** Whether one PDF page carries a whole two-page spread (a scanned booklet). */
        Object.defineProperty(self, "spreadPerPdfPage", {
            get: () => { const b = book(); return !!(b && b.layout && b.layout.doubleInternal); }
        });

        self.toBookPage = (pdfPage) => {
            const b = book();
            const wanted = Math.max(1, Math.round(Number(pdfPage) || 1));
            const page = b ? b.bookPageForPdfPage(wanted) : wanted;
            const total = self.pageCount;
            return Math.max(1, total ? Math.min(page, total) : page);
        };
        self.toPdfPage = (bookPage) => {
            const b = book();
            const wanted = Math.max(1, Math.round(Number(bookPage) || 1));
            const page = b ? b.pdfPageForBookPage(wanted) : wanted;
            const doc = self.pdfDocument;
            return Math.max(1, doc && doc.numPages ? Math.min(page, doc.numPages) : page);
        };

        /** The PDF pages on screen: one in single mode, the pair of the spread in double mode. */
        self.visiblePdfPages = () => {
            const b = book();
            if (!b || !self.isReady()) return [];
            return b.visiblePdfPages();
        };

        /* ---------------------------------------------------------------- search */

        /*
         * The index and the panel are the application's (`features/search/`); what the engine
         * owes is a chance to paint on a page as it is rendered, which is `paintPage` below.
         */
        let highlightQuery = "";

        Object.defineProperty(self, "searchController", { get: () => (panes() ? panes().searchController() : null) });

        self.ensureSearch = () => {
            self.ensurePanel("search");
            return self.searchController;
        };
        self.setSearchHighlight = (query) => {
            const next = String(query || "");
            highlightQuery = next.trim().length < 2 ? "" : next;
            const b = book();
            if (b) b.setSearchHighlight(highlightQuery);
        };
        /**
         * Paint the current query's hits for one PDF page onto any 2D context. Used by the
         * engine as it renders a page, and by the print feature on its own canvases, so a
         * printed sheet carries the same marks as the screen.
         * @returns {boolean} whether anything was drawn
         */
        self.drawSearchHighlights = (ctx, viewport, pdfPage) => {
            const controller = self.searchController;
            if (!ctx || !viewport || !controller || !highlightQuery) return false;
            let rects = [];
            try { rects = controller.getHighlightRects(Number(pdfPage) || 1, highlightQuery) || []; }
            catch (e) { return false; }
            if (!rects.length) return false;
            ctx.save();
            ctx.fillStyle = HIGHLIGHT_FILL;
            rects.forEach(([x, y, w, h]) => {
                const box = viewport.convertToViewportRectangle([x, y, x + w, y + h]);
                const left = Math.min(box[0], box[2]);
                const top = Math.min(box[1], box[3]);
                ctx.fillRect(left, top, Math.abs(box[2] - box[0]), Math.abs(box[3] - box[1]));
            });
            ctx.restore();
            return true;
        };
        self.refreshVisiblePages = () => { const b = book(); if (b) b.refreshVisiblePages(); };

        /* ------------------------------------------------- data for the panels */

        /*
         * The three things only the engine can work out. The Navigator renders them in the
         * application's own markup (`features/navigator/panes.js`); the engine ships no DOM.
         */
        self.getThumbnail = (pdfPage, width) => {
            const b = book();
            if (!b) return Promise.reject(new Error("ZayaBook: no document"));
            return b.getThumbnail(pdfPage, width);
        };
        self.getOutline = () => { const b = book(); return b ? b.getOutline() : Promise.resolve([]); };
        self.getPageLabel = (pdfPage) => {
            const b = book();
            if (!b) return Promise.resolve(String(Math.max(1, Math.round(Number(pdfPage) || 1))));
            return b.getPageLabel(pdfPage);
        };

        /* ---------------------------------------------------------------- panels */

        self.panel = (name) => (panes() && PANELS.indexOf(name) !== -1 ? panes().get(name) : null);
        self.ensurePanel = (name) => {
            if (!panes() || PANELS.indexOf(name) === -1) return null;
            return panes().ensure(name, self);
        };
        self.setPanelActive = (name, on) => { if (panes() && PANELS.indexOf(name) !== -1) panes().setActive(name, on); };
        self.searchInput = () => (panes() ? panes().searchInput() : null);
        self.openSearch = (query) => {
            self.ensurePanel("search");
            if (window.ZayaNavigator && window.ZayaNavigator.open) {
                window.ZayaNavigator.open("search", { focusSearch: false });
            }
            if (query == null) return;
            const input = self.searchInput();
            if (!input) return;
            input.value = query;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        };

        /* ------------------------------------------------------- chrome and view */

        /*
         * The engine draws no chrome of its own, so there is nothing to redraw. The call stays
         * because the contract has it: an engine that did would need telling.
         */
        self.updateUi = () => {};
        self.toggleFullscreen = () => { const b = book(); if (b) b.toggleFullscreen(); };
        Object.defineProperty(self, "fullscreen", { get: () => { const b = book(); return !!(b && b.fullscreen); } });

        self.share = () => {
            const b = book();
            const url = b ? b.share() : (typeof location !== "undefined" ? location.href : "");
            if (window.ZayaShareBox) window.ZayaShareBox.open(url);
        };

        /**
         * Save the open document. The engine resolves it to an address or a blob; putting a file
         * in front of the reader is the application's business, so it happens here.
         * @returns {boolean} whether anything was started
         */
        self.download = () => {
            const b = book();
            if (!b) {
                const src = String(self.source || "");
                if (/^(https?:|blob:)/i.test(src)) { window.open(src, "_blank", "noopener"); return true; }
                return false;
            }
            Promise.resolve(b.download()).then((file) => {
                const link = document.createElement("a");
                link.href = file.url;
                link.download = file.name || "document.pdf";
                link.rel = "noopener";
                document.body.appendChild(link);
                link.click();
                link.remove();
                // Long enough for the browser to have taken the bytes, short enough not to leak.
                setTimeout(file.revoke, 60000);
            }).catch((err) => console.error("ZayaBook.download failed:", err));
            return true;
        };

        /** The contract's zoom is a step; the engine's is an absolute level. */
        self.zoom = (delta) => {
            const b = book();
            if (!b) return;
            if (Number(delta) < 0) b.zoomOut();
            else b.zoomIn();
        };
        self.resize = () => { const b = book(); if (b) b.resize(); };
        /** Let go of the stage while the pointer is over app chrome that sits above it. */
        self.setInteractive = (on) => { const b = book(); if (b) b.setInteractive(!!on); };
        Object.defineProperty(self, "interactive", { get: () => { const b = book(); return b ? !!b.interactive : true; } });

        self.setTextLayerEnabled = (on) => { const b = book(); if (b) b.setTextLayerEnabled(!!on); };
        Object.defineProperty(self, "textLayerEnabled", { get: () => { const b = book(); return !!(b && b.textLayerEnabled); } });

        /* ----------------------------------------------------------------- sound */

        Object.defineProperty(self, "soundEnabled", { get: () => { const b = book(); return b ? !!b.soundEnabled : true; } });
        self.setSoundEnabled = (on) => { const b = book(); if (b) b.setSoundEnabled(!!on); };

        /* ------------------------------------------------------------- lifecycle */

        self.dispose = () => {
            if (disposed) return;
            const b = engine;
            disposed = true;
            if (window.ZayaShareBox) window.ZayaShareBox.close();
            document.body.classList.remove("reader-fullscreen");
            if (b) { try { b.dispose(); } catch (e) { /* already gone */ } }
            if (window.dFlipBook === self) window.dFlipBook = null;
            if (window.flipbookInstance === self) window.flipbookInstance = null;
            if (currentHandle === self) currentHandle = null;
            engine = null;
        };
        Object.defineProperty(self, "disposed", { get: () => disposed });

        /* The engine object itself. For this file and its own tests, and for nothing in `lib/`. */
        Object.defineProperty(self, "engine", { get: book });
    }

    let currentHandle = null;

    /** The handle on the open document, or `null` when none is open. */
    function current() {
        if (currentHandle && !currentHandle.disposed && currentHandle.engine) return currentHandle;
        return null;
    }

    /** Translate the contract's option names into the ones the engine underneath expects. */
    function engineOptions(options, handleRef) {
        const given = options || {};
        const out = {};
        Object.keys(given).forEach((key) => { out[key] = given[key]; });

        out.direction = given.direction === "rtl" ? "rtl" : "ltr";
        out.hard = given.hard || "none";
        out.openPage = given.openPage || 1;
        out.renderMode = renderModeWanted();
        // The engine plays the sound; which sound is the application's, since it ships the file.
        out.soundUrl = window.ZAYA_PAGE_SOUND || "lib/sound/turn2.mp3";
        // A page turn makes a sound unless somebody has said otherwise, as it always has.
        if (out.soundEnable === undefined) out.soundEnable = true;

        /* Search marks live in the page texture, so they show in whichever renderer is running. */
        out.paintPage = function (ctx, viewport, pdfPage) {
            const handle = handleRef();
            if (handle) handle.drawSearchHighlights(ctx, viewport, pdfPage);
        };

        /*
         * Page turns are reported from here rather than from inside the engine, so a replacement
         * engine needs to know nothing about page memory or about AppState.
         */
        delete out.onPageChanged;
        out.onPageChange = function (page) {
            const pdfId = given.pdfId || given.source || null;
            if (window.saveLastPage && pdfId) { try { window.saveLastPage(pdfId, page); } catch (e) { /* memory unavailable */ } }
            if (window.appState && window.appState.setLastPage) window.appState.setLastPage(page);
            if (typeof given.onPageChanged === "function") { try { given.onPageChanged(page); } catch (e) { /* a listener's problem */ } }
        };

        if (typeof given.zoomChange === "function") {
            out.zoomChange = function (isZoomed) { try { given.zoomChange(isZoomed); } catch (e) { /* a listener's problem */ } };
        }

        /* The fork put a class on <body> in fullscreen and the shell still styles against it. */
        out.onFullscreenChange = function (on) {
            document.body.classList.toggle("reader-fullscreen", !!on);
        };

        if (typeof given.onReady === "function") {
            out.onReady = function () {
                try { given.onReady(handleRef()); } catch (e) { console.error("ZayaBook onReady failed:", e); }
            };
        } else {
            delete out.onReady;
        }
        return out;
    }

    /**
     * Open `source` inside `container`.
     * @param {Element|string} container the stage element, or a selector for it
     * @param {string} source            the PDF to open
     * @param {object} [options]         see `docs/engine-api.md`
     * @returns {object} the handle, also published as `ZayaBook.current`
     */
    function create(container, source, options) {
        const host = typeof container === "string" ? document.querySelector(container) : container;
        if (!host) throw new Error("ZayaBook.create: no container");
        if (!window.ZayaEngine) throw new Error("ZayaBook.create: the engine is not loaded");

        let handle = null;
        const resolved = engineOptions(options, () => handle);
        const engine = window.ZayaEngine.create(host, source, resolved);
        handle = new Handle(engine, options || {});
        currentHandle = handle;

        /*
         * Deprecated aliases. They were promised for one release and that release has come, but
         * `tests/engine-contract.spec.mjs` -- frozen -- still asserts they are there, so instead
         * of vanishing they now point at the handle: the fork's object, with its `target` and
         * `contentProvider`, no longer exists, and the contract surface is the only thing a
         * plugin can honestly be handed. Nothing in `lib/` may read them.
         */
        window.flipbookInstance = handle;
        window.dFlipBook = handle;
        return handle;
    }

    window.ZayaBook = {
        create,
        /*
         * How to find a stage in the document. A leaked stage has no API left to ask, so the
         * contract test counts elements instead; publishing the selector here is what keeps that
         * test engine-agnostic.
         */
        stageSelector: "#flipbookContainer .zn-stage",
        get current() { return current(); },
        /** True while a document is open and its pages can be turned. */
        get isReady() { const b = current(); return !!(b && b.isReady()); },
        dispose() { const b = current(); if (b) b.dispose(); }
    };
})();
