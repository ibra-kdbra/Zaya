/*
 * Right-hand control panel (Document / Notes / Media / Settings) and the document-opening
 * controls that live inside it. Plain DOM: the flipbook engine keeps jQuery to itself.
 */
(function () {
    const PANEL_TABS = ["Document", "Notes", "Media", "Settings"];
    let isPanelOpen = false;
    let panelInvoker = null;

    const el = (id) => document.getElementById(id);
    const closestFrom = (target, selector) => (target && target.closest ? target.closest(selector) : null);
    const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

    /*
     * Drawer state lives in AppState so that link presets and backup/restore can drive it.
     * Older profiles (and builds without those fields) fall back to the localStorage keys the
     * drawers have always used.
     */
    const hasDrawerState = () => !!(window.appState && typeof window.appState.get === "function"
        && window.appState.get("navigatorTab") !== undefined);

    function readStored(key, fallbackKey, allowed, fallbackValue) {
        if (hasDrawerState()) {
            const value = window.appState.get(key);
            return allowed.indexOf(value) !== -1 ? value : fallbackValue;
        }
        try {
            const value = localStorage.getItem(fallbackKey);
            return allowed.indexOf(value) !== -1 ? value : fallbackValue;
        } catch (e) { return fallbackValue; }
    }

    function storedPanelTab() {
        return readStored("panelTab", "zayaPanelTab", PANEL_TABS, "Document");
    }

    function rememberPanelTab(name) {
        if (hasDrawerState()) window.appState.set({ panelTab: name });
        try { localStorage.setItem("zayaPanelTab", name); } catch (e) { /* storage unavailable */ }
    }

    function rememberPanelOpen(open) {
        // `panelOpen` has always been part of AppState, so it is safe to write either way.
        if (window.appState && typeof window.appState.set === "function"
            && window.appState.get("panelOpen") !== open) {
            window.appState.set({ panelOpen: open });
        }
    }

    function setPanelTab(name, focusTab) {
        if (PANEL_TABS.indexOf(name) === -1) return;
        rememberPanelTab(name);
        PANEL_TABS.forEach((tab) => {
            const btn = el("panelTab" + tab);
            const pane = el("panelPane" + tab);
            const on = tab === name;
            if (btn) {
                btn.setAttribute("aria-selected", on ? "true" : "false");
                btn.tabIndex = on ? 0 : -1;
            }
            if (pane) pane.hidden = !on;
        });
        const active = el("panelTab" + name);
        if (focusTab && active) active.focus();
        const body = document.querySelector("#unifiedPanel .panel-body");
        if (body) body.scrollTop = 0;
    }

    function setPanelOpen(open, from) {
        isPanelOpen = open;
        const panel = el("unifiedPanel");
        const toggleBtn = el("toggleUnifiedPanelBtn");
        if (!panel) return;
        panel.classList.toggle("open", open);
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        panel.inert = !open; // closed drawers leave the tab order entirely
        document.body.classList.toggle("panel-open", open);
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
        rememberPanelOpen(open);
        if (window.ZayaDrawers) { window.ZayaDrawers.syncDock(); window.ZayaDrawers.syncScrim(); }

        if (open) {
            panelInvoker = from || document.activeElement;
            // Two overlaying drawers would sit on top of each other; only docked ones share the screen
            if (!isDocked() && window.ZayaNavigator) window.ZayaNavigator.close({ force: true });
            setPanelTab(storedPanelTab(), false);
            if (isSheet() && window.ZayaA11y) {
                window.ZayaA11y.trap(panel, { onEscape: () => setPanelOpen(false) });
            } else {
                const active = panel.querySelector('[role="tab"][aria-selected="true"]');
                if (active) active.focus();
            }
        } else {
            if (window.ZayaA11y) window.ZayaA11y.release(panel);
            if (panelInvoker && document.contains(panelInvoker)) {
                try { panelInvoker.focus(); } catch (e) { /* ignore */ }
            }
            panelInvoker = null;
        }
    }

    const isSheet = () => (window.ZayaDrawers ? window.ZayaDrawers.isSheet() : window.matchMedia("(max-width: 767.98px)").matches);
    const isOverlay = () => (window.ZayaDrawers ? window.ZayaDrawers.isOverlay() : true);
    const isDocked = () => (window.ZayaDrawers ? window.ZayaDrawers.isDocked() : window.matchMedia("(min-width: 1200px)").matches);

    function toggleUnifiedPanel(from) {
        setPanelOpen(!isPanelOpen, from);
    }
    window.ZayaPanel = {
        open: (tab) => { setPanelOpen(true); if (tab) setPanelTab(tab, false); },
        close: () => setPanelOpen(false),
        toggle: toggleUnifiedPanel,
        isOpen: () => isPanelOpen
    };

    function onClick(id, handler) {
        const node = el(id);
        if (node) node.addEventListener("click", handler);
    }

    onClick("toggleUnifiedPanelBtn", function () { toggleUnifiedPanel(this); });
    onClick("closeUnifiedPanelBtn", function () { setPanelOpen(false); });
    onClick("drawerScrim", function () {
        setPanelOpen(false);
        if (window.ZayaNavigator) window.ZayaNavigator.close({ force: true });
    });

    document.addEventListener("click", function (event) {
        const tabBtn = closestFrom(event.target, "#unifiedPanel [data-panel-tab]");
        if (!tabBtn) return;
        setPanelTab(tabBtn.getAttribute("data-panel-tab"), true);
    });

    // Arrow-key navigation across the panel tabs
    document.addEventListener("keydown", function (event) {
        const tabBtn = closestFrom(event.target, "#unifiedPanel [data-panel-tab]");
        if (!tabBtn) return;
        const idx = PANEL_TABS.indexOf(tabBtn.getAttribute("data-panel-tab"));
        let next = -1;
        // Up/Down walk the vertical rail, Left/Right the phone tab bar; both work in either mode
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (idx + 1) % PANEL_TABS.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (idx + PANEL_TABS.length - 1) % PANEL_TABS.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = PANEL_TABS.length - 1;
        if (next < 0) return;
        event.preventDefault();
        setPanelTab(PANEL_TABS[next], true);
    });

    // Outside click closes the panel (the drawer keeps focus while it is being used)
    document.addEventListener("click", function (event) {
        if (!isPanelOpen) return;
        if (!isOverlay()) return; // a docked panel is layout, not an overlay: it stays until dismissed
        if (closestFrom(event.target, "#unifiedPanel, #toggleUnifiedPanelBtn, .modal-container, .theme-modal, [role=dialog]")) return;
        setPanelOpen(false);
    });

    // The share/download shortcuts in the Document tab reuse the flipbook UI
    onClick("panelShareBtn", function () { const b = el("customShareBtn"); if (b) b.click(); });
    onClick("panelDownloadBtn", function () { const b = el("menuDownloadBtn"); if (b) b.click(); });

    function resetAutoHideTimer() { /* the panel no longer auto-hides: it closes on outside click or Esc */ }

    function toast(text, backgroundColor, duration) {
        Toastify({
            text,
            duration: duration || 3000,
            gravity: "bottom",
            position: "right",
            backgroundColor
        }).showToast();
    }

    /** Swap a button's contents for a spinner; returns a function that puts them back. */
    function busy(button) {
        const saved = Array.from(button.childNodes);
        const spinner = document.createElement("i");
        spinner.className = "fas fa-spinner fa-spin";
        button.replaceChildren(spinner);
        button.disabled = true;
        return () => {
            button.replaceChildren(...saved);
            button.disabled = false;
        };
    }

    /** The dimmed "Loading PDF…" cover over the book, built from elements, never from markup. */
    function showLoadingOverlay() {
        const host = el("flipbookContainer");
        if (!host || el("loadingOverlay")) return;
        const overlay = document.createElement("div");
        overlay.id = "loadingOverlay";
        overlay.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
            "z-index:1000;background:rgba(0,0,0,0.7);color:#fff;opacity:1;transition:opacity 300ms ease";
        const box = document.createElement("div");
        box.style.textAlign = "center";
        const icon = document.createElement("i");
        icon.className = "fas fa-spinner fa-spin";
        icon.style.cssText = "font-size:2rem;margin-bottom:1rem";
        const label = document.createElement("div");
        label.textContent = t("doc.loadingOverlay");
        box.append(icon, label);
        overlay.appendChild(box);
        host.appendChild(overlay);
    }

    function hideLoadingOverlay() {
        const overlay = el("loadingOverlay");
        if (!overlay) return;
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 320);
    }
    window.ZayaLoadingOverlay = { show: showLoadingOverlay, hide: hideLoadingOverlay };

    // Load PDF from URL
    onClick("loadPdfUrlBtn", function () {
        const button = this;
        const input = el("pdfUrl");
        const rawUrl = (input && input.value ? input.value : "").trim();

        if (!rawUrl) {
            toast(t("doc.invalidUrl"), "#ef4444");
            return;
        }

        // Enhanced URL validation with security checks
        const urlValidation = window.ValidationUtils.validateAndSanitizeUrl(rawUrl);
        if (!urlValidation.isValid) {
            toast(urlValidation.error, "#ef4444", 4000);
            return;
        }

        const newPdfUrl = urlValidation.sanitizedUrl;

        // Optional PDF extension warning (but still allow loading)
        if (!window.ValidationUtils.isValidPdfUrl(newPdfUrl)) {
            toast(t("doc.notPdfUrl"), "#f59e0b");
            // Still allow loading as it might be a valid PDF with different extension
        }

        // Show loading state
        const restore = busy(button);
        const field = button.closest(".input-field");
        const fieldInputs = field ? Array.from(field.querySelectorAll("input")) : [];
        fieldInputs.forEach((node) => { node.disabled = true; });
        showLoadingOverlay();

        openRemoteUrl(newPdfUrl).then(function () {
            // Restore button after PDF starts loading
            setTimeout(() => {
                restore();
                fieldInputs.forEach((node) => { node.disabled = false; });
                hideLoadingOverlay();
            }, 1000);
        });

        resetAutoHideTimer();
    });

    // Load PDF from local file - opens file picker automatically
    onClick("loadPdfFileBtn", function () {
        const picker = el("pdfFile");
        if (picker) picker.click();
        resetAutoHideTimer();
    });

    // Handle file selection
    const filePicker = el("pdfFile");
    if (filePicker) {
        filePicker.addEventListener("change", function () {
            const file = this.files[0];
            const validation = window.ValidationUtils.validatePdfFile(file);

            if (!validation.isValid) {
                toast(validation.error, "#ef4444", 4000);
                return;
            }

            openLocalFile(file);
            // Allow re-selecting the same file later
            this.value = "";
        });
    }

    /** Open a File picked from disk (or restored from the local store) and remember it. */
    function openLocalFile(file, opts) {
        const fileName = file.name;
        const fileUrl = URL.createObjectURL(file);
        window.appState.updatePdfContext(fileUrl, 'local', fileName);
        if (window.ZayaLocalDocs && !(opts && opts.skipSave)) {
            window.ZayaLocalDocs.saveFile(file).then((kept) => {
                if (!kept && file.size > window.ZayaLocalDocs.MAX_FILE_BYTES) {
                    Toastify({ text: t("doc.tooLargeToKeep"), duration: 5000, gravity: "bottom", position: "right" }).showToast();
                }
            });
        }
        return window.getLastPage(fileName).catch(() => null).then(function (storedPage) {
            return loadFlipbook(fileUrl, window.appState.get('isRTL'), storedPage || 1, fileName)
                .catch((err) => console.error('Failed to load local PDF:', err));
        });
    }

    /** Open a remote PDF by URL (already validated) and remember it. */
    function openRemoteUrl(newPdfUrl) {
        let hostname = '';
        try { hostname = new URL(newPdfUrl).hostname; } catch (e) { hostname = 'remote-pdf'; }
        window.appState.updatePdfContext(newPdfUrl, 'url', hostname);
        return window.getLastPage(newPdfUrl).catch(() => null).then(function (storedPage) {
            return loadFlipbook(newPdfUrl, window.appState.get('isRTL'), storedPage || 1, newPdfUrl)
                .catch((err) => console.error('Failed to load PDF from URL:', err));
        });
    }

    window.ZayaDocuments = { openLocalFile, openRemoteUrl };

    // Reading direction: a labelled toggle that always spells out the current direction
    function syncDirectionLabel() {
        const isRTL = !!(window.appState && window.appState.get('isRTL'));
        const label = el("directionLabel");
        if (label) label.textContent = t(isRTL ? "panel.document.rtl" : "panel.document.ltr");
        const btn = el("toggleDirectionBtn");
        if (btn) {
            btn.setAttribute("aria-pressed", isRTL ? "true" : "false");
            btn.setAttribute("title", t(isRTL ? "panel.document.toLtr" : "panel.document.toRtl"));
        }
    }

    onClick("toggleDirectionBtn", function () {
        window.appState.toggleRTL();  // toggle state, the listener in load.js handles the rest
        syncDirectionLabel();
        resetAutoHideTimer();
    });

    if (window.appState && window.appState.subscribe) window.appState.subscribe('isRTL', syncDirectionLabel);
    // The label spells out the direction, so it is one of the strings a language switch redraws.
    document.addEventListener('zaya:languageChanged', syncDirectionLabel);
    syncDirectionLabel();

    /*
     * Stiff pages: the engine's `hard` option, applied at load time by core/load.js. Both the
     * WebGL and the CSS renderer honour it, so there is no mode-only caveat to spell out.
     */
    const HARD_COVER_MODES = ["none", "cover", "all"];

    function currentHardCover() {
        const value = window.appState ? window.appState.get("hardCover") : "none";
        return HARD_COVER_MODES.indexOf(value) === -1 ? "none" : value;
    }

    function syncHardCoverSwitch() {
        const active = currentHardCover();
        HARD_COVER_MODES.forEach((value) => {
            const btn = document.querySelector(`#hardCoverSwitch [data-hard-cover="${value}"]`);
            if (btn) btn.setAttribute("aria-selected", value === active ? "true" : "false");
        });
    }

    document.addEventListener("click", function (event) {
        const btn = closestFrom(event.target, "#hardCoverSwitch [data-hard-cover]");
        if (!btn) return;
        const value = btn.getAttribute("data-hard-cover");
        if (value === currentHardCover()) return;
        // The listener in load.js reopens the document on the same page, as the RTL toggle does.
        window.appState.setHardCover(value);
        syncHardCoverSwitch();
    });

    if (window.appState && window.appState.subscribe) window.appState.subscribe('hardCover', syncHardCoverSwitch);
    syncHardCoverSwitch();

    // Keyboard shortcuts (Left/Right Arrow page turns, F for Fullscreen, Escape, Cmd+K)
    document.addEventListener("keydown", function (event) {
        // Don't trigger page turns when typing in inputs/textareas
        const active = document.activeElement;
        const activeTag = active ? active.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(activeTag) || (active && active.isContentEditable)) {
            return;
        }

        // Left / Right arrow page turns are handled by the flipbook UI (keyup in dflip/ui/ui.js)
        if (event.key === "f" || event.key === "F") {
            if (!event.ctrlKey && !event.metaKey) {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                }
            }
        }

        // Ctrl/Cmd + K to toggle panel
        if ((event.ctrlKey || event.metaKey) && event.key === "k") {
            event.preventDefault();
            toggleUnifiedPanel();
        }

        // Escape to close panel
        if (event.key === "Escape" && isPanelOpen) {
            setPanelOpen(false);
        }
    });

    // Dispatch zaya:toolbarReady event
    document.dispatchEvent(new CustomEvent('zaya:toolbarReady'));

    // Initialize panel as closed, on the remembered tab
    setPanelTab(storedPanelTab(), false);
    const panel = el("unifiedPanel");
    if (panel) panel.classList.remove("open");

    /*
     * A drawer left open is only restored where it is layout rather than an overlay: on a phone
     * or a tablet a remembered drawer would hide the document the reader came for. It waits for
     * `zaya:init`, by which time ZayaDrawers exists to publish the docked width.
     */
    document.addEventListener("zaya:init", function restoreDrawer() {
        if (isDocked() && window.appState && window.appState.get("panelOpen") === true) {
            setPanelOpen(true);
        } else if (window.ZayaDrawers) {
            window.ZayaDrawers.syncDock();
        }
    }, { once: true });
})();

// Zaya UI Extension Slots for Plugins & Pro Features
window.ZayaUI = window.ZayaUI || {
    registerToolbarButton(options) {
        if (!options || !options.id) return false;
        const container = document.querySelector('#customControlBar') || document.querySelector('.custom-controls') || document.body;
        if (!container) return false;
        if (document.getElementById(options.id)) return false;

        const btn = document.createElement('button');
        btn.id = options.id;
        btn.className = container.id === 'customControlBar' ? 'custom-ui-btn slot-button' : 'panel-button slot-button';
        btn.type = 'button';
        btn.setAttribute('title', options.label || '');
        btn.setAttribute('aria-label', options.label || '');
        const icon = document.createElement('i');
        icon.className = options.icon || 'fas fa-cog';
        btn.appendChild(icon);
        if (options.label && container.id !== 'customControlBar') {
            const span = document.createElement('span');
            span.textContent = ' ' + options.label;
            btn.appendChild(span);
        }

        if (typeof options.onClick === 'function') {
            btn.addEventListener('click', (e) => options.onClick(e, window.appState));
        }

        container.appendChild(btn);
        return true;
    },

    registerPanelTab(options) {
        if (!options || !options.id) return false;
        const panelBody = document.querySelector('#unifiedPanel #panelPaneSettings') || document.querySelector('#unifiedPanel .panel-body');
        if (!panelBody) return false;

        const section = document.createElement('div');
        section.id = `panel-tab-${options.id}`;
        section.className = 'panel-section pro-panel-section';
        const title = document.createElement('h3');
        title.className = 'panel-section-title';
        const titleIcon = document.createElement('i');
        titleIcon.className = options.icon || 'fas fa-puzzle-piece';
        title.appendChild(titleIcon);
        title.appendChild(document.createTextNode(' ' + (options.title || '')));
        section.appendChild(title);

        const contentContainer = document.createElement('div');
        contentContainer.className = 'panel-section-content';
        // `content` is a Node or plain text: a plugin that needs markup builds it in
        // `renderContent`, so no string ever reaches innerHTML.
        if (typeof options.renderContent === 'function') {
            options.renderContent(contentContainer, window.appState);
        } else if (options.content instanceof Node) {
            contentContainer.appendChild(options.content);
        } else if (typeof options.content === 'string') {
            contentContainer.textContent = options.content;
        }

        section.appendChild(contentContainer);
        panelBody.appendChild(section);
        return true;
    }
};
