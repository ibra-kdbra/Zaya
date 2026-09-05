$(document).ready(function () {
    const alwaysShownToggle = $("#bottomPanelAlwaysShown");
    // Touch-only devices have no hover, so the bottom bar must stay visible there (issue #11 / #8)
    const isTouchDevice = (window.matchMedia && window.matchMedia('(hover: none)').matches) || navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches;
    document.body.classList.toggle('touch-device', isTouchDevice);

    // Visibility Logic
    function updateVisibilityMode() {
        const isAlwaysShown = alwaysShownToggle.is(":checked") || isTouchDevice;
        const controlBar = $("#customControlBar");
        const hoverTrigger = $("#bottomHoverTrigger");

        if (isAlwaysShown) {
            controlBar.addClass("always-shown").removeClass("visible");
            if (hoverTrigger.length) hoverTrigger.hide();
        } else {
            controlBar.removeClass("always-shown visible");
            if (hoverTrigger.length) hoverTrigger.show();
        }
        try { localStorage.setItem("bottomPanelAlwaysShown", alwaysShownToggle.is(":checked")); } catch (e) { /* storage unavailable */ }
        // The switch says what it does, in words, next to itself
        $("#bottomBarModeLabel").text(alwaysShownToggle.is(":checked") ? "Always visible" : "Auto-hide");
    }

    // Toggle event listener
    $(document).on("change", "#bottomPanelAlwaysShown", function() {
        updateVisibilityMode();
    });

    // Reliable hover detection using mousemove (throttled to one pass per animation frame)
    let mouseMoveScheduled = false;
    $(document).on("mousemove", function (e) {
        if (isTouchDevice || mouseMoveScheduled) return;
        if ($("#bottomPanelAlwaysShown").is(":checked")) return;
        mouseMoveScheduled = true;
        requestAnimationFrame(() => { mouseMoveScheduled = false; });

        const controlBar = $("#customControlBar");
        const moreMenu = $("#customMoreMenu");
        if (!controlBar.length) return;

        const mouseY = e.clientY; 
        const windowHeight = $(window).height();
        const threshold = 80; 

        // Check if mouse is within bar bounds manually
        const barRect = controlBar[0].getBoundingClientRect();
        const isHoveringBar = (
            e.clientX >= barRect.left &&
            e.clientX <= barRect.right &&
            e.clientY >= barRect.top &&
            e.clientY <= barRect.bottom
        );
        const isMoreMenuOpen = moreMenu.hasClass("show");

        if (mouseY > windowHeight - threshold || isHoveringBar || isMoreMenuOpen) {
            controlBar.addClass("visible");
        } else {
            controlBar.removeClass("visible");
        }

        // Pro-grade Zoom Fix: Global Interceptor
        const isHoveringSidebar = $(e.target).closest('.df-sidemenu').length > 0;
        const fb = getFlipbook();
        if (fb) {
            if (isHoveringSidebar) {
                // LOCK: Disable OrbitControls (Rotation/Pan) but keep global scrollWheel enabled for Zoom
                if (fb.stage && fb.stage.orbitControl) fb.stage.orbitControl.enabled = false;
                // if (fb.options) fb.options.scrollWheel = false; // Keep this enabled to allow Zoom logic
            } else {
                // UNLOCK: Restore interactions
                if (fb.stage && fb.stage.orbitControl) fb.stage.orbitControl.enabled = true;
                // if (fb.options) fb.options.scrollWheel = true;
            }
        }
    });

    // Flipbook Integration Helper
    function getFlipbook() {
        // More exhaustive check for the flipbook instance
        return window.dFlipBook || 
               $(".df-container").data("dFlip") || 
               (window.dfActiveLightBoxBook) ||
               (window.DFLIP && window.DFLIP.activeBook);
    }

    // MutationObserver to prevent the library from removing our UI
    const observer = new MutationObserver(function(mutations) {
        const bar = document.getElementById('customControlBar');
        const trigger = document.getElementById('bottomHoverTrigger');
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

    const config = { childList: true };
    observer.observe(document.body, config);

    // Explicitly handle fullscreen changes to ensure visibility
    $(document).on("fullscreenchange webkitfullscreenchange mozfullscreenchange MSFullscreenChange", function() {
        const controlBar = $("#customControlBar");
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        
        if (isFullscreen) {
            // Re-append to the fullscreen element if possible, or just force z-index
            const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsElem && controlBar[0].parentElement !== fsElem) {
                fsElem.appendChild(controlBar[0]);
            }
        } else {
            if (controlBar[0].parentElement !== document.body) {
                document.body.appendChild(controlBar[0]);
            }
        }
        syncUI();
    });

    // --- EVENT DELEGATION FOR BUTTONS ---
    $(document).on("click", "#customPrevBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) {
            if(fb.target && fb.target.prev) fb.target.prev();
            else if(fb.prev) fb.prev();
        } 
    });
    $(document).on("click", "#customNextBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) {
            if(fb.target && fb.target.next) fb.target.next();
            else if(fb.next) fb.next();
        } 
    });
    $(document).on("click", "#customZoomInBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) fb.zoom(1); 
    });
    $(document).on("click", "#customZoomOutBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) fb.zoom(-1); 
    });
    $(document).on("click", "#customFullscreenBtn, #menuFullscreenBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb && fb.ui) fb.ui.switchFullscreen(); 
    });

    $(document).on("click", "#customOutlineBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        window.ZayaNavigator.toggle("outline", this);
    });

    $(document).on("click", "#customThumbnailBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        window.ZayaNavigator.toggle("thumbs", this);
    });

    $(document).on("click", "#customSearchBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        window.ZayaNavigator.toggle("search", this);
    });

    // Ctrl/Cmd+F opens the in-document search instead of the browser's find bar
    $(document).on("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            window.ZayaNavigator.open("search", { focusSearch: true });
        }
    });

    $(document).on("click", "#customShareBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.share) {
            fb.ui.share.trigger("click");
        }
    });

    // Page Input Logic
    $(document).on("keydown", "#customCurrentPageInput", function(e) {
        e.stopPropagation(); // Prevent flipbook shortcuts
    });

    $(document).on("focus", "#customCurrentPageInput", function() {
        $(this).select();
    });

    $(document).on("change", "#customCurrentPageInput", function() {
        const fb = getFlipbook();
        if (fb) {
            let page = parseInt($(this).val(), 10);
            if (!isNaN(page)) {
                if(fb.target && fb.target.gotoPage) fb.target.gotoPage(page);
                else if(fb.gotoPage) fb.gotoPage(page);
            }
        }
    });

    $(document).on("keyup", "#customCurrentPageInput", function(e) {
        e.stopPropagation();
        if (e.keyCode === 13) {
            const fb = getFlipbook();
            if (fb) {
                let page = parseInt($(this).val(), 10);
                if (!isNaN(page)) {
                    if(fb.target && fb.target.gotoPage) fb.target.gotoPage(page);
                    else if(fb.gotoPage) fb.gotoPage(page);
                }
            }
            $(this).blur();
        }
    });

    // Global Wheel Interceptor for Pro-grade fix
    const stopPropagation = (e) => {
        if ($(e.target).closest('.df-sidemenu').length > 0) {
            // Allow Ctrl+Wheel (Zoom) to propagate, but block normal Wheel (Scroll) from bubbling to the book
            if (e.ctrlKey) return;
            e.stopImmediatePropagation();
        }
    };
    window.addEventListener("wheel", stopPropagation, true); 

    $(document).on("click", "#customMoreBtn", function (e) {
        e.preventDefault(); e.stopPropagation();
        $("#customMoreMenu").toggleClass("show");
    });

    $(document).on("click", function (e) {
        if (!$(e.target).closest('#customMoreBtn').length) {
            $("#customMoreMenu").removeClass("show");
        }
    });

    // More Menu Actions
    $(document).on("click", "#menuDownloadBtn", function () {
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.download) {
            fb.ui.download[0].click();
        } else if (fb && fb.options && fb.options.source) {
            const src = String(fb.options.source);
            if (/^(https?:|blob:)/i.test(src)) window.open(src, '_blank', 'noopener');
        }
    });

    $(document).on("click", "#menuPageModeBtn", function () {
        const fb = getFlipbook();
        if (fb) {
            const isSingle = fb.target.pageMode === 1; 
            fb.setPageMode(!isSingle, true);
            syncUI();
        }
    });

    $(document).on("click", "#menuFirstPageBtn", function () { const fb = getFlipbook(); if (fb) fb.start(); });
    $(document).on("click", "#menuLastPageBtn", function () { const fb = getFlipbook(); if (fb) fb.end(); });

    $(document).on("click", "#menuSoundBtn", function () {
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.sound) {
            fb.ui.sound.trigger("click");
            syncUI();
        }
    });

    // Update UI State
    function syncUI() {
        const fb = getFlipbook();
        if (fb) {
            // Get current page from target or instance
            const current = (fb.target && fb.target._activePage) || fb._activePage || 1;
            
            // Get total pages from multiple possible locations
            let total = 1;
            if (fb.target && fb.target.pageCount) total = fb.target.pageCount;
            else if (fb.pageCount) total = fb.pageCount;
            else if (fb.contentProvider && fb.contentProvider.pageCount) total = fb.contentProvider.pageCount;
            
            if (!$("#customCurrentPageInput").is(":focus")) {
                $("#customCurrentPageInput").val(current);
            }
            $("#customTotalPages").text(total);

            // Sync Page Mode
            const pageMode = (fb.target && fb.target.pageMode) || fb.pageMode;
            const isSingle = pageMode === 1; 
            $("#menuPageModeBtn span").text(isSingle ? "Double Page Mode" : "Single Page Mode");
            $("#menuPageModeBtn i").attr('class', isSingle ? "fas fa-book-open" : "fas fa-file-alt");

            // Sync Sound
            const isSoundEnabled = (fb.options && fb.options.soundEnable);
            $("#menuSoundBtn span").text(isSoundEnabled ? "Sound: On" : "Sound: Off");
            $("#menuSoundBtn i").attr('class', isSoundEnabled ? "fas fa-volume-up" : "fas fa-volume-mute");
            
            // Document meta shown in the control panel header: "12 of 199 pages"
            $("#panelPageNow").text(current);
            $("#panelPageCount").text(total);

            // Sync Fullscreen Icon
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            $("#customFullscreenBtn i").attr('class', isFullscreen ? "fas fa-compress" : "fas fa-expand");
            $("#menuFullscreenBtn i").attr('class', isFullscreen ? "fas fa-compress" : "fas fa-expand");
            $("#menuFullscreenBtn span").text(isFullscreen ? "Exit Fullscreen" : "Fullscreen");
        }
    }

    // Initialize state
    const savedAlwaysShown = localStorage.getItem("bottomPanelAlwaysShown") === "true";
    alwaysShownToggle.prop("checked", savedAlwaysShown);
    setTimeout(updateVisibilityMode, 500);

    // Constant maintenance loop
    setInterval(syncUI, 500);
});

/*
 * Navigator: one left drawer hosting the engine's thumbnail, outline and search panels as tabs.
 * The engine keeps building `.df-sidemenu` containers; we re-parent them into the drawer body and
 * keep `df-sidemenu-visible` on exactly one of them, so all existing engine logic still applies.
 */
window.ZayaNavigator = (function () {
    const TABS = ["thumbs", "outline", "search"];
    const SELECTOR = { thumbs: ".df-thumb-container", outline: ".df-outline-container", search: ".df-search-container" };
    const PANE_ID = { thumbs: "navPaneThumbs", outline: "navPaneOutline", search: "navPaneSearch" };
    const TAB_ID = { thumbs: "navTabThumbs", outline: "navTabOutline", search: "navTabSearch" };
    const BAR_ID = { thumbs: "customThumbnailBtn", outline: "customOutlineBtn", search: "customSearchBtn" };
    const UI_KEY = { thumbs: "thumbnail", outline: "outline", search: "searchPanel" };
    const EMPTY = {
        thumbs: { icon: "fas fa-images", text: "Page thumbnails are still being prepared." },
        outline: { icon: "fas fa-stream", text: "This document has no outline, so there are no chapters to jump to." },
        search: { icon: "fas fa-magnifying-glass-minus", text: "Search is not available for this document." }
    };

    let activeTab = "thumbs";
    let isOpen = false;
    let invoker = null;
    try {
        const stored = localStorage.getItem("zayaNavigatorTab");
        if (TABS.indexOf(stored) !== -1) activeTab = stored;
    } catch (e) { /* storage unavailable */ }

    const el = (id) => document.getElementById(id);
    const drawer = () => el("navigatorDrawer");
    const bodyEl = () => el("navigatorBody");
    const pane = (tab) => document.querySelector(SELECTOR[tab]);
    const book = () => window.dFlipBook || (window.DFLIP && window.DFLIP.activeBook) || null;
    const isSheet = () => window.matchMedia("(max-width: 768px)").matches;

    function adopt() {
        const host = bodyEl();
        if (!host) return;
        TABS.forEach((tab) => {
            const p = pane(tab);
            if (!p || p.parentElement === host) return;
            host.appendChild(p);
            p.id = PANE_ID[tab];
            p.setAttribute("role", "tabpanel");
            p.setAttribute("aria-labelledby", TAB_ID[tab]);
            p.setAttribute("tabindex", "0");
            p.dataset.navTab = tab;
        });
    }

    function ensure(tab) {
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
        TABS.forEach((tab) => {
            const on = isOpen && tab === activeTab;
            const btn = el(BAR_ID[tab]);
            if (btn) btn.classList.toggle("active", on);
            if (fb && fb.ui && fb.ui[UI_KEY[tab]]) fb.ui[UI_KEY[tab]].toggleClass("df-active", on);
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
        const d = drawer();
        if (d) {
            d.classList.toggle("open", isOpen);
            d.setAttribute("aria-hidden", isOpen ? "false" : "true");
        }
        const toggleBtn = el("toggleNavigatorBtn");
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        document.body.classList.toggle("navigator-open", isOpen);
        if (window.ZayaDrawers) window.ZayaDrawers.syncScrim();
        updateEmptyState();
        syncEngine();
    }

    function setTab(tab, opts) {
        if (TABS.indexOf(tab) === -1) return;
        activeTab = tab;
        try { localStorage.setItem("zayaNavigatorTab", tab); } catch (e) { /* storage unavailable */ }
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
        if (isSheet() && window.ZayaPanel) window.ZayaPanel.close();
        setTab(tab || activeTab, { focusSearch: options.focusSearch });
        if (isSheet() && window.ZayaA11y) window.ZayaA11y.trap(drawer(), { onEscape: close });
        else if (!options.focusSearch) { const t = el(TAB_ID[activeTab]); if (t) t.focus(); }
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        if (window.ZayaA11y) window.ZayaA11y.release(drawer());
        paint();
        if (invoker && typeof invoker.focus === "function" && document.contains(invoker)) {
            try { invoker.focus(); } catch (e) { /* ignore */ }
        }
        invoker = null;
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
                    else if (!visible && isOpen && activeTab === t) close();
                });
            }).observe(nb, { attributes: true, attributeFilter: ["class"], subtree: true });
        }

        // Fullscreen re-parents the control bar; the drawer has to follow or it would be invisible.
        ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) => document.addEventListener(evt, () => {
            const host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
            const d = drawer();
            const scrim = el("drawerScrim");
            if (d && d.parentElement !== host) host.appendChild(d);
            if (scrim && scrim.parentElement !== host) host.appendChild(scrim);
        }));

        document.addEventListener("click", (e) => {
            if (e.target.closest("#toggleNavigatorBtn")) { e.preventDefault(); toggle(null, e.target.closest("#toggleNavigatorBtn")); return; }
            if (e.target.closest("#closeNavigatorBtn")) { close(); return; }
            const tabBtn = e.target.closest("#navigatorDrawer [data-nav-tab]");
            if (tabBtn) { setTab(tabBtn.dataset.navTab, { focusTab: true }); return; }
            if (!isOpen) return;
            if (e.target.closest("#navigatorDrawer, #customControlBar, #appHeader, .modal-container, .theme-modal, #unifiedPanel")) return;
            close();
        });

        // Capture phase: the engine's panels stop keydown propagation for page-turn safety.
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isOpen) { close(); }
        }, true);

        document.addEventListener("keydown", (e) => {
            const tabBtn = e.target.closest && e.target.closest("#navigatorDrawer [data-nav-tab]");
            if (!tabBtn) return;
            const idx = TABS.indexOf(tabBtn.dataset.navTab);
            let next = -1;
            if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
            else if (e.key === "ArrowLeft") next = (idx + TABS.length - 1) % TABS.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = TABS.length - 1;
            if (next < 0) return;
            e.preventDefault();
            setTab(TABS[next], { focusTab: true, focusSearch: false });
        });

        paint();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { open, close, toggle, setTab, adopt, isOpen: () => isOpen, activeTab: () => activeTab, refresh: () => { adopt(); updateEmptyState(); } };
})();

/* Shared drawer helpers: the scrim is visible while either drawer is open on a phone-sized screen. */
window.ZayaDrawers = window.ZayaDrawers || {
    syncScrim() {
        const scrim = document.getElementById("drawerScrim");
        if (!scrim) return;
        const anyOpen = document.body.classList.contains("navigator-open") || document.body.classList.contains("panel-open");
        const show = anyOpen && window.matchMedia("(max-width: 768px)").matches;
        scrim.hidden = !show;
        requestAnimationFrame(() => scrim.classList.toggle("visible", show));
    }
};

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
