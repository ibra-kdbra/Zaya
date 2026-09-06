/*
 * ZayaBook -- the one door between the application and the page-turn engine.
 *
 * Everything the app needs from a flipbook goes through `window.ZayaBook`. The contract it
 * publishes is written down, engine-free, in `docs/engine-api.md`, and
 * `tests/engine-contract.spec.mjs` exercises it end to end. This file is the only place in `lib/`
 * that is allowed to know how the engine under `engine/` is put together: it translates the
 * contract into that engine's shapes (`window.dFlipBook`, `book.target`, `book.contentProvider`,
 * `book.ui`) and nothing else may.
 *
 * Replacing the engine therefore means rewriting this one file and leaving the rest of `lib/`
 * untouched.
 *
 * Classic script, listed straight after `engine/index.js` in `lib/js/app.js`. It only publishes
 * the namespace, so running before the deferred engine module does no harm: the engine is looked
 * up when a document is opened, not when this file is evaluated.
 */
(function () {
    "use strict";

    /* The engine's own numbering, kept behind this boundary. */
    const ENGINE_LTR = 1;
    const ENGINE_RTL = 2;
    const ENGINE_SINGLE = 1;
    const ENGINE_DOUBLE_INTERNAL = 2;   // options.pageSize: one PDF page carries a whole spread

    const PANELS = {
        thumbs: { init: "initThumbs", selector: ".df-thumb-container", ui: "thumbnail" },
        outline: { init: "initOutline", selector: ".df-outline-container", ui: "outline" },
        search: { init: "initSearch", selector: ".df-search-container", ui: "searchPanel" }
    };

    /** Unwrap whatever the engine hands back: a jQuery set, a node list, or a plain element. */
    function node(value) {
        if (!value) return null;
        if (value.nodeType === 1) return value;
        return value[0] && value[0].nodeType === 1 ? value[0] : null;
    }

    function call(owner, name, args) {
        if (!owner || typeof owner[name] !== "function") return undefined;
        try { return owner[name].apply(owner, args || []); } catch (e) { return undefined; }
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
        const target = () => { const b = book(); return (b && b.target) || null; };
        const provider = () => { const b = book(); return (b && b.contentProvider) || null; };
        const ui = () => { const b = book(); return (b && b.ui) || null; };

        /* -------------------------------------------------------------- identity */

        Object.defineProperty(self, "source", { get: () => { const b = book(); return (b && b.options && b.options.source) || null; } });
        Object.defineProperty(self, "renderMode", { get: () => { const b = book(); return (b && b.renderMode) || null; } });
        Object.defineProperty(self, "hardCover", { get: () => { const b = book(); return (b && b.options && b.options.hard) || "none"; } });
        Object.defineProperty(self, "createdWith", { get: () => created });

        self.isReady = () => !!target();

        /* ------------------------------------------------------------ navigation */

        Object.defineProperty(self, "activePage", {
            get: () => { const t = target(); return (t && t._activePage) || 1; }
        });
        Object.defineProperty(self, "pageCount", {
            get: () => {
                const t = target();
                const cp = provider();
                return (t && t.pageCount) || (cp && cp.pageCount) || 0;
            }
        });
        Object.defineProperty(self, "pageMode", {
            get: () => { const t = target(); return t && t.pageMode === ENGINE_SINGLE ? "single" : "double"; }
        });
        Object.defineProperty(self, "direction", {
            get: () => {
                const b = book();
                const t = target();
                const value = (b && b.direction) || (t && t.direction) || ENGINE_LTR;
                return value === ENGINE_RTL ? "rtl" : "ltr";
            }
        });

        self.gotoPage = (n) => {
            const wanted = Number(n) || 1;
            const total = self.pageCount;
            const page = Math.max(1, total ? Math.min(total, wanted) : wanted);
            const t = target();
            if (t && t.gotoPage) call(t, "gotoPage", [page]);
            else call(book(), "gotoPage", [page]);
            return self.activePage;
        };
        self.next = () => { const t = target(); if (t && t.next) call(t, "next"); else call(book(), "next"); };
        self.prev = () => { const t = target(); if (t && t.prev) call(t, "prev"); else call(book(), "prev"); };
        self.first = () => { call(book(), "start"); };
        self.last = () => { call(book(), "end"); };

        self.setPageMode = (isSingle, fromUser) => {
            call(book(), "setPageMode", [!!isSingle, !!fromUser]);
            return self.pageMode;
        };

        /* -------------------------------------------------------------- document */

        Object.defineProperty(self, "pdfDocument", { get: () => { const cp = provider(); return (cp && cp.pdfDocument) || null; } });

        /** Whether one PDF page carries a whole two-page spread (a scanned booklet). */
        const doubleInternal = () => {
            const cp = provider();
            return !!(cp && cp.options && cp.options.pageSize === ENGINE_DOUBLE_INTERNAL);
        };
        Object.defineProperty(self, "spreadPerPdfPage", { get: doubleInternal });

        self.toBookPage = (pdfPage) => {
            let page = Math.max(1, Math.round(Number(pdfPage) || 1));
            if (doubleInternal() && page > 2) page = page * 2 - 1;
            const total = self.pageCount;
            return Math.max(1, total ? Math.min(page, total) : page);
        };
        self.toPdfPage = (bookPage) => {
            const page = Math.max(1, Math.round(Number(bookPage) || 1));
            if (doubleInternal() && page > 2) return Math.ceil((page - 1) / 2) + 1;
            const doc = self.pdfDocument;
            return doc && doc.numPages ? Math.min(page, doc.numPages) : page;
        };

        /** The PDF pages on screen: one in single mode, the pair of the spread in double mode. */
        self.visiblePdfPages = () => {
            if (!self.isReady()) return [];
            const total = self.pageCount || 1;
            const active = Math.max(1, Math.min(total, self.activePage));
            let pages = [active];
            if (self.pageMode !== "single") {
                const base = Math.floor(active / 2) * 2;
                pages = [base, base + 1];
            }
            const out = [];
            pages.forEach((p) => {
                if (p < 1 || p > total) return;
                const pdf = self.toPdfPage(p);
                if (out.indexOf(pdf) === -1) out.push(pdf);
            });
            return out;
        };

        /* ---------------------------------------------------------------- search */

        Object.defineProperty(self, "searchController", { get: () => { const cp = provider(); return (cp && cp.searchController) || null; } });

        self.ensureSearch = () => {
            const cp = provider();
            if (!cp) return null;
            if (!cp.searchController) call(cp, "initSearch");
            return cp.searchController || null;
        };
        self.setSearchHighlight = (query) => { call(provider(), "setSearchHighlight", [query || ""]); };
        self.drawSearchHighlights = (ctx, viewport, pdfPage) => !!call(provider(), "drawSearchHighlights", [ctx, viewport, pdfPage]);
        self.refreshVisiblePages = () => { call(provider(), "refreshVisiblePages"); };

        /* ---------------------------------------------------------------- panels */

        self.panel = (name) => {
            const spec = PANELS[name];
            return spec ? document.querySelector(spec.selector) : null;
        };
        self.ensurePanel = (name) => {
            const spec = PANELS[name];
            const cp = provider();
            if (!spec || !cp) return null;
            if (!self.panel(name)) call(cp, spec.init);
            return self.panel(name);
        };
        self.setPanelActive = (name, on) => {
            const spec = PANELS[name];
            const chrome = ui();
            const el = spec && chrome ? node(chrome[spec.ui]) : null;
            if (el) el.classList.toggle("df-active", !!on);
        };
        self.searchInput = () => {
            const t = target();
            return node(t && t.searchInput) || document.querySelector(".df-search-input");
        };
        self.openSearch = (query) => {
            self.ensurePanel("search");
            const chrome = ui();
            const opener = chrome ? node(chrome.searchPanel) : null;
            const panel = self.panel("search");
            if (opener && !(panel && panel.classList.contains("df-sidemenu-visible"))) opener.click();
            if (query == null) return;
            const input = self.searchInput();
            if (!input) return;
            input.value = query;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        };

        /* ------------------------------------------------------- chrome and view */

        self.updateUi = (force) => { call(ui(), "update", [force]); };
        self.toggleFullscreen = () => { call(ui(), "switchFullscreen"); };
        self.share = () => { const chrome = ui(); const el = chrome ? node(chrome.share) : null; if (el) el.click(); };
        self.download = () => {
            const chrome = ui();
            const el = chrome ? node(chrome.download) : null;
            if (el) { el.click(); return true; }
            const src = String(self.source || "");
            if (/^(https?:|blob:)/i.test(src)) { window.open(src, "_blank", "noopener"); return true; }
            return false;
        };
        self.zoom = (delta) => { call(book(), "zoom", [delta]); };
        self.resize = () => { call(book(), "resize"); };
        /** Let go of the stage while the pointer is over app chrome that sits above it. */
        self.setInteractive = (on) => {
            const b = book();
            if (b && b.stage && b.stage.orbitControl) b.stage.orbitControl.enabled = !!on;
        };
        Object.defineProperty(self, "interactive", {
            get: () => {
                const b = book();
                if (!b || !b.stage || !b.stage.orbitControl) return true;
                return !!b.stage.orbitControl.enabled;
            }
        });

        /* ----------------------------------------------------------------- sound */

        Object.defineProperty(self, "soundEnabled", {
            get: () => {
                const b = book();
                const value = b && b.options ? b.options.soundEnable : true;
                return !(value === false || value === "false");
            }
        });
        self.setSoundEnabled = (on) => {
            const b = book();
            if (!b || !b.options) return;
            b.options.soundEnable = !!on;
            call(ui(), "updateSound");
        };

        /* ------------------------------------------------------------- lifecycle */

        self.dispose = () => {
            if (disposed) return;
            const b = engine;
            const host = b ? node(b.container) : null;
            disposed = true;
            if (b) {
                if (typeof b.dispose === "function") { try { b.dispose(); } catch (e) { /* already gone */ } }
                else if (typeof b.destroy === "function") { try { b.destroy(); } catch (e) { /* already gone */ } }
            }
            /*
             * The engine marks and sizes the stage element it was given but does not unmark it,
             * so a disposed book would otherwise leave a stage-shaped host behind. Handing the
             * element back the way it was found is part of the contract's "no leaks".
             */
            if (host) {
                Array.from(host.classList).forEach((name) => { if (name.indexOf("df-") === 0) host.classList.remove(name); });
                ["position", "overflow", "background-color", "background-image", "height"].forEach((prop) => host.style.removeProperty(prop));
            }
            if (window.dFlipBook === b) window.dFlipBook = null;
            if (window.flipbookInstance === b) window.flipbookInstance = null;
            if (currentHandle === self) currentHandle = null;
            engine = null;
        };
        Object.defineProperty(self, "disposed", { get: () => disposed });

        /* The engine object itself. For this file and its own tests, and for nothing in `lib/`. */
        Object.defineProperty(self, "engine", { get: book });
    }

    let currentHandle = null;

    /** Whatever the engine currently regards as the open book, however it was opened. */
    function liveEngine() {
        return window.dFlipBook
            || window.dfActiveLightBoxBook
            || (window.DFLIP && window.DFLIP.activeBook)
            || null;
    }

    /**
     * The handle on the open document, or `null` when none is open. A book opened outside
     * `create` -- the engine's own lightbox, say -- is adopted the first time it is asked for.
     */
    function current() {
        if (currentHandle && !currentHandle.disposed && currentHandle.engine) return currentHandle;
        const live = liveEngine();
        if (!live) return null;
        currentHandle = new Handle(live, null);
        return currentHandle;
    }

    /** Translate the contract's option names into the ones the engine underneath expects. */
    function engineOptions(options, handleRef) {
        const given = options || {};
        const out = {};
        Object.keys(given).forEach((key) => { out[key] = given[key]; });

        const direction = given.direction;
        out.direction = (direction === "rtl" || direction === ENGINE_RTL) ? ENGINE_RTL : ENGINE_LTR;
        out.hard = given.hard || "none";
        out.openPage = given.openPage || 1;

        /*
         * Page turns are reported from here rather than from inside the engine, so a replacement
         * engine needs to know nothing about page memory or about AppState.
         */
        out.onPageChanged = function (page) {
            const pdfId = given.pdfId || given.source || null;
            if (window.saveLastPage && pdfId) { try { window.saveLastPage(pdfId, page); } catch (e) { /* memory unavailable */ } }
            if (window.appState && window.appState.setLastPage) window.appState.setLastPage(page);
            if (typeof given.onPageChanged === "function") { try { given.onPageChanged(page); } catch (e) { /* a listener's problem */ } }
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
        if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.flipBook) {
            throw new Error("ZayaBook.create: the engine is not loaded");
        }

        let handle = null;
        const resolved = engineOptions(options, () => handle);
        const engine = window.jQuery(host).flipBook(source, resolved);
        // The stage reads its own direction off the target; the instance carries it for everyone else.
        engine.direction = resolved.direction;
        handle = new Handle(engine, options || {});
        currentHandle = handle;

        // Deprecated aliases, kept for one release so plugins written against the old globals
        // keep working. Nothing in `lib/` may read them.
        window.flipbookInstance = engine;
        window.dFlipBook = engine;
        return handle;
    }

    window.ZayaBook = {
        create,
        /*
         * How to find a stage in the document. A leaked stage has no API left to ask, so the
         * contract test counts elements instead; publishing the selector here is what keeps that
         * test engine-agnostic. A replacement engine names its own root class and nothing else
         * changes.
         */
        stageSelector: "#flipbookContainer.df-container, #flipbookContainer .df-container",
        get current() { return current(); },
        /** True while a document is open and its pages can be turned. */
        get isReady() { const b = current(); return !!(b && b.isReady()); },
        dispose() { const b = current(); if (b) b.dispose(); }
    };
})();
