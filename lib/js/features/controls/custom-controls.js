/*
 * The bottom control bar, its More menu, and the two side drawers.
 * Plain DOM throughout: the flipbook engine still hands out jQuery objects (`fb.ui.*`,
 * `fb.target.searchContainer`), so those are unwrapped with `[0]` at the boundary.
 */
function zayaWhenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
}

zayaWhenReady(function () {
    const el = (id) => document.getElementById(id);
    const closestFrom = (target, selector) => (target && target.closest ? target.closest(selector) : null);

    const alwaysShownToggle = el("bottomPanelAlwaysShown");
    // Touch-only devices have no hover, so the bottom bar must stay visible there (issue #11 / #8)
    const isTouchDevice = (window.matchMedia && window.matchMedia('(hover: none)').matches) || navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches;
    document.body.classList.toggle('touch-device', isTouchDevice);

    const barAlwaysShown = () => !!(alwaysShownToggle && alwaysShownToggle.checked);

    // Visibility Logic
    function updateVisibilityMode() {
        const isAlwaysShown = barAlwaysShown() || isTouchDevice;
        const controlBar = el("customControlBar");
        const hoverTrigger = el("bottomHoverTrigger");

        if (controlBar) {
            controlBar.classList.toggle("always-shown", isAlwaysShown);
            if (isAlwaysShown) controlBar.classList.remove("visible");
            else controlBar.classList.remove("always-shown", "visible");
        }
        if (hoverTrigger) hoverTrigger.style.display = isAlwaysShown ? "none" : "";

        try { localStorage.setItem("bottomPanelAlwaysShown", barAlwaysShown()); } catch (e) { /* storage unavailable */ }
        // The switch says what it does, in words, next to itself
        const label = el("bottomBarModeLabel");
        if (label) label.textContent = barAlwaysShown() ? "Always visible" : "Auto-hide";
    }

    // Toggle event listener
    document.addEventListener("change", function (e) {
        if (closestFrom(e.target, "#bottomPanelAlwaysShown")) updateVisibilityMode();
    });

    // Reliable hover detection using mousemove (throttled to one pass per animation frame)
    let mouseMoveScheduled = false;
    document.addEventListener("mousemove", function (e) {
        if (isTouchDevice || mouseMoveScheduled) return;
        if (barAlwaysShown()) return;
        mouseMoveScheduled = true;
        requestAnimationFrame(() => { mouseMoveScheduled = false; });

        const controlBar = el("customControlBar");
        const moreMenu = el("customMoreMenu");
        if (!controlBar) return;

        const mouseY = e.clientY;
        const windowHeight = window.innerHeight;
        const threshold = 80;

        // Check if mouse is within bar bounds manually
        const barRect = controlBar.getBoundingClientRect();
        const isHoveringBar = (
            e.clientX >= barRect.left &&
            e.clientX <= barRect.right &&
            e.clientY >= barRect.top &&
            e.clientY <= barRect.bottom
        );
        const isMoreMenuOpen = !!moreMenu && moreMenu.classList.contains("show");

        controlBar.classList.toggle("visible", mouseY > windowHeight - threshold || isHoveringBar || isMoreMenuOpen);

        // Zoom fix: the engine's orbit control must let go while the pointer is over a side panel
        const isHoveringSidebar = !!closestFrom(e.target, '.df-sidemenu');
        const fb = getFlipbook();
        if (fb && fb.stage && fb.stage.orbitControl) {
            // LOCK rotation/pan over the panel, but leave the global scroll wheel free to zoom
            fb.stage.orbitControl.enabled = !isHoveringSidebar;
        }
    });

    // Flipbook Integration Helper
    function getFlipbook() {
        // More exhaustive check for the flipbook instance
        if (window.dFlipBook) return window.dFlipBook;
        const container = document.querySelector(".df-container");
        const fromData = container && window.jQuery ? window.jQuery(container).data("dFlip") : null;
        return fromData || window.dfActiveLightBoxBook || (window.DFLIP && window.DFLIP.activeBook) || null;
    }

    // MutationObserver to prevent the library from removing our UI
    const observer = new MutationObserver(function () {
        const bar = el('customControlBar');
        const trigger = el('bottomHoverTrigger');
        if (!bar || !trigger) return;

        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        const targetParent = isFullscreen ? (document.fullscreenElement || document.webkitFullscreenElement) : document.body;

        if (bar.parentElement !== targetParent) {
            targetParent.appendChild(bar);
        }
        if (trigger.parentElement !== targetParent) {
            targetParent.appendChild(trigger);
        }
    });

    observer.observe(document.body, { childList: true });

    // Explicitly handle fullscreen changes to ensure visibility
    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((evt) => {
        document.addEventListener(evt, function () {
            const controlBar = el("customControlBar");
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

            if (controlBar) {
                // Re-append to the fullscreen element if possible, or fall back to the body
                const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
                const host = isFullscreen ? fsElem : document.body;
                if (host && controlBar.parentElement !== host) host.appendChild(controlBar);
            }
            syncUI();
        });
    });

    // --- ONE DELEGATED CLICK HANDLER FOR THE WHOLE BAR ---
    const BAR_ACTIONS = {
        customPrevBtn: (fb) => { if (fb.target && fb.target.prev) fb.target.prev(); else if (fb.prev) fb.prev(); },
        customNextBtn: (fb) => { if (fb.target && fb.target.next) fb.target.next(); else if (fb.next) fb.next(); },
        customZoomInBtn: (fb) => fb.zoom(1),
        customZoomOutBtn: (fb) => fb.zoom(-1),
        customFullscreenBtn: (fb) => { if (fb.ui) fb.ui.switchFullscreen(); },
        menuFullscreenBtn: (fb) => { if (fb.ui) fb.ui.switchFullscreen(); },
        customShareBtn: (fb) => { if (fb.ui && fb.ui.share && fb.ui.share[0]) fb.ui.share[0].click(); },
        menuDownloadBtn: (fb) => {
            if (fb.ui && fb.ui.download && fb.ui.download[0]) {
                fb.ui.download[0].click();
            } else if (fb.options && fb.options.source) {
                const src = String(fb.options.source);
                if (/^(https?:|blob:)/i.test(src)) window.open(src, '_blank', 'noopener');
            }
        },
        menuPageModeBtn: (fb) => {
            const isSingle = fb.target.pageMode === 1;
            fb.setPageMode(!isSingle, true);
            rememberPageMode(!isSingle ? 'single' : 'double');
            syncUI();
        },
        menuFirstPageBtn: (fb) => fb.start(),
        menuLastPageBtn: (fb) => fb.end(),
        menuSoundBtn: (fb) => {
            if (!fb.options) return;
            const on = !isSoundOn(fb);
            fb.options.soundEnable = on;
            if (fb.ui && fb.ui.updateSound) fb.ui.updateSound();
            rememberSound(on);
            syncUI();
        }
    };

    const NAV_BUTTONS = { customOutlineBtn: "outline", customThumbnailBtn: "thumbs", customSearchBtn: "search" };

    document.addEventListener("click", function (e) {
        const button = closestFrom(e.target, "#customPrevBtn, #customNextBtn, #customZoomInBtn, #customZoomOutBtn, " +
            "#customFullscreenBtn, #menuFullscreenBtn, #customShareBtn, #menuDownloadBtn, #menuPageModeBtn, " +
            "#menuFirstPageBtn, #menuLastPageBtn, #menuSoundBtn, #customOutlineBtn, #customThumbnailBtn, #customSearchBtn");
        if (!button) return;

        const navTab = NAV_BUTTONS[button.id];
        if (navTab) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.ZayaNavigator.toggle(navTab, button);
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb) BAR_ACTIONS[button.id](fb);
    });

    // Ctrl/Cmd+F opens the in-document search instead of the browser's find bar
    document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            window.ZayaNavigator.open("search", { focusSearch: true });
        }
    });

    // Page Input Logic
    function gotoTypedPage(input) {
        const fb = getFlipbook();
        if (!fb) return;
        const page = parseInt(input.value, 10);
        if (isNaN(page)) return;
        if (fb.target && fb.target.gotoPage) fb.target.gotoPage(page);
        else if (fb.gotoPage) fb.gotoPage(page);
    }

    const pageInput = el("customCurrentPageInput");
    if (pageInput) {
        pageInput.addEventListener("keydown", (e) => e.stopPropagation()); // Prevent flipbook shortcuts
        pageInput.addEventListener("focus", () => pageInput.select());
        pageInput.addEventListener("change", () => gotoTypedPage(pageInput));
        pageInput.addEventListener("keyup", function (e) {
            e.stopPropagation();
            if (e.key !== "Enter") return;
            gotoTypedPage(pageInput);
            pageInput.blur();
        });
    }

    // Global wheel interceptor: scrolling a side panel must not also scroll the book
    window.addEventListener("wheel", (e) => {
        if (!closestFrom(e.target, '.df-sidemenu')) return;
        // Allow Ctrl+Wheel (zoom) through, block a plain wheel from bubbling to the book
        if (e.ctrlKey) return;
        e.stopImmediatePropagation();
    }, true);

    document.addEventListener("click", function (e) {
        const menu = el("customMoreMenu");
        if (!menu) return;
        if (closestFrom(e.target, "#customMoreBtn")) {
            e.preventDefault();
            e.stopPropagation();
            menu.classList.toggle("show");
            return;
        }
        menu.classList.remove("show");
    });

    /*
     * More-menu preferences the engine itself forgets between documents: the reader's page-mode
     * override and whether page turns make a sound. Applied by `applyTo` once a book is ready.
     */
    const PAGE_MODE_KEY = "zayaPageMode";
    const SOUND_KEY = "zayaSoundEnabled";

    function readPref(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writePref(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
    }
    function rememberPageMode(mode) { writePref(PAGE_MODE_KEY, mode); }
    function rememberSound(on) { writePref(SOUND_KEY, on ? "true" : "false"); }
    function isSoundOn(fb) {
        const value = fb.options ? fb.options.soundEnable : true;
        return !(value === false || value === "false");
    }

    window.ZayaBookPrefs = {
        pageMode: () => (readPref(PAGE_MODE_KEY) === "single" ? "single" : (readPref(PAGE_MODE_KEY) === "double" ? "double" : null)),
        soundEnabled: () => { const v = readPref(SOUND_KEY); return v === null ? null : v === "true"; },
        /** Re-apply the remembered More-menu choices to a freshly opened book. */
        applyTo(book) {
            if (!book) return;
            const sound = this.soundEnabled();
            if (sound !== null && book.options) {
                book.options.soundEnable = sound;
                if (book.ui && book.ui.updateSound) book.ui.updateSound();
            }
            const mode = this.pageMode();
            if (mode && typeof book.setPageMode === "function") {
                const wantSingle = mode === "single";
                const isSingle = book.target && book.target.pageMode === 1;
                if (wantSingle !== isSingle) book.setPageMode(wantSingle, true);
            }
            syncUI();
        }
    };

    function setIcon(id, className) {
        const node = el(id);
        const icon = node ? node.querySelector("i") : null;
        if (icon) icon.className = className;
    }
    function setLabel(id, text) {
        const node = el(id);
        const span = node ? node.querySelector("span") : null;
        if (span) span.textContent = text;
    }
    function setText(id, text) {
        const node = el(id);
        if (node) node.textContent = text;
    }

    // Update UI State
    function syncUI() {
        const fb = getFlipbook();
        if (!fb) return;

        // Get current page from target or instance
        const current = (fb.target && fb.target._activePage) || fb._activePage || 1;

        // Get total pages from multiple possible locations
        let total = 1;
        if (fb.target && fb.target.pageCount) total = fb.target.pageCount;
        else if (fb.pageCount) total = fb.pageCount;
        else if (fb.contentProvider && fb.contentProvider.pageCount) total = fb.contentProvider.pageCount;

        const input = el("customCurrentPageInput");
        if (input && document.activeElement !== input) input.value = current;
        setText("customTotalPages", total);

        // Sync Page Mode
        const pageMode = (fb.target && fb.target.pageMode) || fb.pageMode;
        const isSingle = pageMode === 1;
        setLabel("menuPageModeBtn", isSingle ? "Double Page Mode" : "Single Page Mode");
        setIcon("menuPageModeBtn", isSingle ? "fas fa-book-open" : "fas fa-file-alt");

        // Sync Sound
        const soundOn = isSoundOn(fb);
        setLabel("menuSoundBtn", soundOn ? "Page-turn sound on" : "Page-turn sound off");
        setIcon("menuSoundBtn", soundOn ? "fas fa-volume-up" : "fas fa-volume-mute");

        // Document meta shown in the control panel header: "12 of 199 pages"
        setText("panelPageNow", current);
        setText("panelPageCount", total);
        setText("navPageNow", current);
        setText("navPageCount", total);

        // Sync Fullscreen Icon
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        setIcon("customFullscreenBtn", isFullscreen ? "fas fa-compress" : "fas fa-expand");
        setIcon("menuFullscreenBtn", isFullscreen ? "fas fa-compress" : "fas fa-expand");
        setLabel("menuFullscreenBtn", isFullscreen ? "Exit Fullscreen" : "Fullscreen");
    }

    // Initialize state
    const storedBarMode = readPref("bottomPanelAlwaysShown");
    const savedAlwaysShown = storedBarMode === null ? true : storedBarMode === "true";
    if (alwaysShownToggle) alwaysShownToggle.checked = savedAlwaysShown;
    setTimeout(updateVisibilityMode, 500);

    // Constant maintenance loop
    setInterval(syncUI, 500);
});

/*
 * Navigator: one left drawer hosting the engine's thumbnail, outline and search panels as tabs,
 * plus the Text pane, which is ours (features/text/text-pane.js) rather than the engine's.
 * The engine keeps building `.df-sidemenu` containers; we re-parent them into the drawer body and
 * keep `df-sidemenu-visible` on exactly one of them, so all existing engine logic still applies.
 */
window.ZayaNavigator = (function () {
    const TABS = ["thumbs", "outline", "search", "text"];
    // Only the first three are the engine's; "text" is built by features/text/text-pane.js.
    const ENGINE_TABS = ["thumbs", "outline", "search"];
    const SELECTOR = { thumbs: ".df-thumb-container", outline: ".df-outline-container", search: ".df-search-container", text: "#navPaneText" };
    const PANE_ID = { thumbs: "navPaneThumbs", outline: "navPaneOutline", search: "navPaneSearch", text: "navPaneText" };
    const TAB_ID = { thumbs: "navTabThumbs", outline: "navTabOutline", search: "navTabSearch", text: "navTabText" };
    const BAR_ID = { thumbs: "customThumbnailBtn", outline: "customOutlineBtn", search: "customSearchBtn" };
    const UI_KEY = { thumbs: "thumbnail", outline: "outline", search: "searchPanel" };
    const EMPTY = {
        thumbs: { icon: "fas fa-images", text: "Page thumbnails are still being prepared." },
        outline: { icon: "fas fa-stream", text: "This document has no outline, so there are no chapters to jump to." },
        search: { icon: "fas fa-magnifying-glass-minus", text: "Search is not available for this document." },
        text: { icon: "fas fa-align-left", text: "The text of the pages you are reading will appear here." }
    };
    const textPane = () => window.ZayaTextPane || null;

    /*
     * Which tab is showing, and whether the drawer is open, are published through AppState so a
     * link preset or a restored backup can drive them. Profiles from before those fields exist
     * fall back to the localStorage key the Navigator has always used.
     */
    const hasDrawerState = () => !!(window.appState && typeof window.appState.get === "function"
        && window.appState.get("navigatorTab") !== undefined);

    let activeTab = "thumbs";
    let isOpen = false;
    let invoker = null;
    if (hasDrawerState()) {
        const stored = window.appState.get("navigatorTab");
        if (TABS.indexOf(stored) !== -1) activeTab = stored;
    } else {
        try {
            const stored = localStorage.getItem("zayaNavigatorTab");
            if (TABS.indexOf(stored) !== -1) activeTab = stored;
        } catch (e) { /* storage unavailable */ }
    }

    function rememberTab(tab) {
        if (hasDrawerState()) window.appState.set({ navigatorTab: tab });
        try { localStorage.setItem("zayaNavigatorTab", tab); } catch (e) { /* storage unavailable */ }
    }

    function rememberOpen(open) {
        if (hasDrawerState() && window.appState.get("navigatorOpen") !== open) {
            window.appState.set({ navigatorOpen: open });
        }
    }

    const el = (id) => document.getElementById(id);
    const drawer = () => el("navigatorDrawer");
    const bodyEl = () => el("navigatorBody");
    const pane = (tab) => document.querySelector(SELECTOR[tab]);
    const book = () => window.dFlipBook || (window.DFLIP && window.DFLIP.activeBook) || null;
    const isSheet = () => (window.ZayaDrawers ? window.ZayaDrawers.isSheet() : window.matchMedia("(max-width: 767.98px)").matches);
    const isDocked = () => (window.ZayaDrawers ? window.ZayaDrawers.isDocked() : window.matchMedia("(min-width: 1200px)").matches);

    function adopt() {
        const host = bodyEl();
        if (!host) return;
        ENGINE_TABS.forEach((tab) => {
            const all = Array.from(document.querySelectorAll(SELECTOR[tab]));
            if (!all.length) return;
            // A new document builds fresh panels inside the engine container; they replace the
            // ones adopted from the previous document instead of hiding behind them.
            const fresh = all.find((p) => p.parentElement !== host) || all[0];
            all.forEach((p) => { if (p !== fresh) p.remove(); });
            if (fresh.parentElement === host) return;
            host.appendChild(fresh);
            fresh.id = PANE_ID[tab];
            fresh.setAttribute("role", "tabpanel");
            fresh.setAttribute("aria-labelledby", TAB_ID[tab]);
            fresh.setAttribute("tabindex", "0");
            fresh.dataset.navTab = tab;
        });
    }

    /** Drop every adopted panel: called before another document is loaded. */
    function reset() {
        const host = bodyEl();
        if (host) host.querySelectorAll("[data-nav-tab]").forEach((p) => { if (p.id !== PANE_ID.text) p.remove(); });
        if (textPane()) textPane().reset();
        updateEmptyState();
    }

    function ensure(tab) {
        if (tab === "text") { if (textPane()) textPane().ensure(); return; }
        const fb = book();
        const cp = fb && fb.contentProvider;
        if (!cp) return;
        if (tab === "thumbs" && !pane("thumbs") && cp.initThumbs) cp.initThumbs();
        if (tab === "outline" && !pane("outline") && cp.initOutline) cp.initOutline();
        if (tab === "search" && !pane("search") && cp.initSearch) cp.initSearch();
        adopt();
    }

    function updateEmptyState() {
        const box = el("navEmptyState");
        if (!box) return;
        const p = pane(activeTab);
        let state = null;
        if (!p) state = EMPTY[activeTab];
        else if (activeTab === "outline" && !p.querySelector(".df-outline-item")) state = EMPTY.outline;
        else if (activeTab === "thumbs" && !p.querySelector(".df-vrow")) state = EMPTY.thumbs;
        // The Text pane speaks for itself: it shows its own reading and no-text states.
        if (activeTab === "text" && p) state = null;
        box.textContent = "";
        if (state) {
            const icon = document.createElement("i");
            icon.className = state.icon;
            icon.setAttribute("aria-hidden", "true");
            const line = document.createElement("p");
            line.textContent = state.text;
            box.appendChild(icon);
            box.appendChild(line);
        }
        box.hidden = !state;
    }

    function syncEngine() {
        const fb = book();
        ENGINE_TABS.forEach((tab) => {
            const on = isOpen && tab === activeTab;
            const btn = el(BAR_ID[tab]);
            if (btn) btn.classList.toggle("active", on);
            // `fb.ui.*` are jQuery-wrapped engine elements; unwrap before touching classes
            const uiEl = fb && fb.ui && fb.ui[UI_KEY[tab]] ? fb.ui[UI_KEY[tab]][0] : null;
            if (uiEl) uiEl.classList.toggle("df-active", on);
        });
        if (fb && fb.ui && fb.ui.update) fb.ui.update(true);
    }

    function paint() {
        TABS.forEach((tab) => {
            const p = pane(tab);
            if (p) p.classList.toggle("df-sidemenu-visible", isOpen && tab === activeTab);
            const t = el(TAB_ID[tab]);
            if (t) {
                const on = tab === activeTab;
                t.setAttribute("aria-selected", on ? "true" : "false");
                t.tabIndex = on ? 0 : -1;
            }
        });
        if (textPane()) textPane().setVisible(isOpen && activeTab === "text");
        const d = drawer();
        if (d) {
            d.classList.toggle("open", isOpen);
            d.setAttribute("aria-hidden", isOpen ? "false" : "true");
        }
        const toggleBtn = el("toggleNavigatorBtn");
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        document.body.classList.toggle("navigator-open", isOpen);
        if (window.ZayaDrawers) { window.ZayaDrawers.syncDock(); window.ZayaDrawers.syncScrim(); }
        updateEmptyState();
        syncEngine();
    }

    function setTab(tab, opts) {
        if (TABS.indexOf(tab) === -1) return;
        activeTab = tab;
        rememberTab(tab);
        ensure(tab);
        paint();
        if (opts && opts.focusTab) { const t = el(TAB_ID[tab]); if (t) t.focus(); }
        if (tab === "search") {
            const input = document.querySelector(".df-search-input");
            if (input && (!opts || opts.focusSearch !== false)) setTimeout(() => input.focus(), 60);
        }
    }

    function open(tab, opts) {
        const options = opts || {};
        if (options.invoker) invoker = options.invoker;
        else if (!isOpen) invoker = document.activeElement;
        isOpen = true;
        rememberOpen(true);
        if (drawer()) drawer().inert = false;
        // Two overlaying drawers would sit on top of each other; only docked ones share the screen
        if (window.ZayaDrawers && window.ZayaDrawers.isOverlay() && window.ZayaPanel) window.ZayaPanel.close();
        setTab(tab || activeTab, { focusSearch: options.focusSearch });
        if (options.restore) return; // a drawer reopened on load must not take focus from the book
        if (isSheet() && window.ZayaA11y) window.ZayaA11y.trap(drawer(), { onEscape: close });
        else if (!options.focusSearch) { const t = el(TAB_ID[activeTab]); if (t) t.focus(); }
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        rememberOpen(false);
        if (window.ZayaA11y) window.ZayaA11y.release(drawer());
        paint();
        if (drawer()) drawer().inert = true;
        if (invoker && typeof invoker.focus === "function" && document.contains(invoker)) {
            try { invoker.focus(); } catch (e) { /* ignore */ }
        }
        invoker = null;
    }

    /*
     * The engine (dflip/ui/ui.js) and the scrim both call `close()` to mean "the reader tapped
     * outside me". That is only a dismissal while the drawer overlays the book: a docked drawer
     * is layout and stays put. Explicit closes -- the close button, Esc, the toggles -- call the
     * internal `close()` directly, so they always work.
     */
    function requestClose(opts) {
        if (!(opts && opts.force) && window.ZayaDrawers && !window.ZayaDrawers.isOverlay()) return;
        close();
    }

    function toggle(tab, from) {
        if (isOpen && (!tab || tab === activeTab)) close();
        else open(tab, { invoker: from });
    }

    function init() {
        adopt();

        // The engine rebuilds its panels for every document; adopt them as soon as they appear.
        const host = document.getElementById("flipbookContainer");
        if (host) {
            new MutationObserver(() => {
                const orphan = TABS.some((tab) => { const p = pane(tab); return p && p.parentElement !== bodyEl(); });
                if (orphan) { adopt(); paint(); }
            }).observe(host, { childList: true, subtree: true });
        }

        // Engine-driven opens (?search=, autoEnableThumbnail, engine toolbar) toggle the class directly.
        const nb = bodyEl();
        if (nb) {
            new MutationObserver((records) => {
                records.forEach((r) => {
                    const t = r.target && r.target.dataset ? r.target.dataset.navTab : null;
                    if (!t) return;
                    const visible = r.target.classList.contains("df-sidemenu-visible");
                    if (visible && !(isOpen && activeTab === t)) open(t, { focusSearch: false });
                    else if (!visible && isOpen && activeTab === t) {
                        // A docked drawer is layout: the engine's own "tap the book to dismiss"
                        // must not take it away, so re-assert instead of closing.
                        if (window.ZayaDrawers && !window.ZayaDrawers.isOverlay()) paint();
                        else close();
                    }
                });
            }).observe(nb, { attributes: true, attributeFilter: ["class"], subtree: true });
        }

        // Fullscreen re-parents the control bar; the drawer has to follow or it would be invisible.
        ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) => document.addEventListener(evt, () => {
            const fsHost = document.fullscreenElement || document.webkitFullscreenElement || document.body;
            const d = drawer();
            const scrim = el("drawerScrim");
            if (d && d.parentElement !== fsHost) fsHost.appendChild(d);
            if (scrim && scrim.parentElement !== fsHost) fsHost.appendChild(scrim);
        }));

        document.addEventListener("click", (e) => {
            const target = e.target && e.target.closest ? e.target : null;
            if (!target) return;
            if (target.closest("#toggleNavigatorBtn")) { e.preventDefault(); toggle(null, target.closest("#toggleNavigatorBtn")); return; }
            if (target.closest("#closeNavigatorBtn")) { close(); return; }
            // Scoped to the switcher: the panes themselves also carry data-nav-tab, and a click
            // inside one (selecting text, tapping a thumbnail) must not move focus to a tab.
            const tabBtn = target.closest("#navigatorDrawer .drawer-switch [data-nav-tab]");
            if (tabBtn) { setTab(tabBtn.dataset.navTab, { focusTab: true }); return; }
            if (!isOpen) return;
            if (window.ZayaDrawers && !window.ZayaDrawers.isOverlay()) return; // docked drawers stay put
            if (target.closest("#navigatorDrawer, #customControlBar, #appHeader, .modal-container, .theme-modal, #unifiedPanel, .text-actions")) return;
            close();
        });

        // Capture phase: the engine's panels stop keydown propagation for page-turn safety.
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape" || !isOpen) return;
            // Esc closes the drawer you are in: with both docked open, it must not take both
            if (e.target && e.target.closest && e.target.closest("#unifiedPanel")) return;
            close();
        }, true);

        document.addEventListener("keydown", (e) => {
            const tabBtn = e.target && e.target.closest ? e.target.closest("#navigatorDrawer .drawer-switch [data-nav-tab]") : null;
            if (!tabBtn) return;
            const idx = TABS.indexOf(tabBtn.dataset.navTab);
            let next = -1;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % TABS.length;
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx + TABS.length - 1) % TABS.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = TABS.length - 1;
            if (next < 0) return;
            e.preventDefault();
            setTab(TABS[next], { focusTab: true, focusSearch: false });
        });

        paint();

        /*
         * A drawer left open is only reopened where it is layout rather than an overlay: on a
         * phone or a tablet it would cover the document the reader came for, so only the tab is
         * remembered there. It waits for `zaya:init`, by which time every script is in place.
         */
        document.addEventListener("zaya:init", function restoreDrawer() {
            if (isDocked() && hasDrawerState() && window.appState.get("navigatorOpen") === true) {
                open(activeTab, { focusSearch: false, restore: true });
            }
        }, { once: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { open, close: requestClose, toggle, setTab, adopt, reset, isOpen: () => isOpen, activeTab: () => activeTab, refresh: () => { adopt(); updateEmptyState(); } };
})();

/*
 * Shared drawer helpers. One navigation model, three device classes:
 *   LARGE  (>=1200px) the drawers dock: the reading area shrinks, no scrim, both may be open.
 *   MEDIUM (768-1199)  they overlay with a scrim, section switcher still a vertical rail.
 *   SMALL  (<768px)    a full-width sheet whose switcher is a bottom tab bar.
 */
window.ZayaDrawers = window.ZayaDrawers || {
    DOCK_QUERY: "(min-width: 1200px)",
    SHEET_QUERY: "(max-width: 767.98px)",

    isDocked() { return window.matchMedia(this.DOCK_QUERY).matches; },
    isSheet() { return window.matchMedia(this.SHEET_QUERY).matches; },

    /* A docked drawer is part of the layout, so it never needs a scrim or an outside-tap close. */
    isOverlay() { return !this.isDocked(); },

    syncScrim() {
        const scrim = document.getElementById("drawerScrim");
        if (!scrim) return;
        const anyOpen = document.body.classList.contains("navigator-open") || document.body.classList.contains("panel-open");
        // Overlaying drawers (sheet and medium) get the scrim; docked ones are layout, not modality
        const show = anyOpen && this.isOverlay();
        scrim.hidden = !show;
        requestAnimationFrame(() => scrim.classList.toggle("visible", show));
    },

    /* Re-lay the book after the drawers changed the width of the reading area. */
    resizeBook() {
        const fb = window.dFlipBook || (window.DFLIP && window.DFLIP.activeBook) || null;
        if (fb && typeof fb.resize === "function") fb.resize();
        else window.dispatchEvent(new Event("resize"));
    },

    /* Body classes carry the docked widths to #flipbookContainer and the bottom bar (shell.css). */
    syncDock() {
        const body = document.body;
        const docked = this.isDocked();
        const left = docked && body.classList.contains("navigator-open");
        const right = docked && body.classList.contains("panel-open");
        const changed = left !== body.classList.contains("dock-left") || right !== body.classList.contains("dock-right");
        body.classList.toggle("dock-left", left);
        body.classList.toggle("dock-right", right);
        this.syncSwitchers();
        if (!changed) return;
        clearTimeout(this._dockTimer);
        // After the 180ms margin transition, so the engine measures the settled stage
        this._dockTimer = setTimeout(() => this.resizeBook(), 200);
    },

    /* The same tablist is a vertical rail at desk sizes and a horizontal tab bar on a phone. */
    syncSwitchers() {
        const orientation = this.isSheet() ? "horizontal" : "vertical";
        document.querySelectorAll(".drawer-switch[role='tablist']").forEach((list) => {
            list.setAttribute("aria-orientation", orientation);
        });
    }
};

window.addEventListener("resize", () => {
    window.ZayaDrawers.syncDock();
    window.ZayaDrawers.syncScrim();
});

/* Document loading state: shown until the engine paints the first page (or reports an error). */
(function () {
    function update() {
        const box = document.getElementById("docLoadingState");
        const host = document.getElementById("flipbookContainer");
        if (!box || !host) return;
        const ready = !!host.querySelector("canvas, .df-book-page") || host.textContent.trim().length > 0;
        box.hidden = ready;
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", update);
    else update();
    setInterval(update, 300);
})();
