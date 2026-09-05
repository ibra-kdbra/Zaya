$(document).ready(function () {
    // Right-hand control panel: a tabbed drawer (Document / Notes / Media / Settings)
    const PANEL_TABS = ["Document", "Notes", "Media", "Settings"];
    let isPanelOpen = false;
    let panelInvoker = null;

    function storedPanelTab() {
        try {
            const t = localStorage.getItem("zayaPanelTab");
            return PANEL_TABS.indexOf(t) !== -1 ? t : "Document";
        } catch (e) { return "Document"; }
    }

    function setPanelTab(name, focusTab) {
        if (PANEL_TABS.indexOf(name) === -1) return;
        try { localStorage.setItem("zayaPanelTab", name); } catch (e) { /* storage unavailable */ }
        PANEL_TABS.forEach((tab) => {
            const btn = document.getElementById("panelTab" + tab);
            const pane = document.getElementById("panelPane" + tab);
            const on = tab === name;
            if (btn) {
                btn.setAttribute("aria-selected", on ? "true" : "false");
                btn.tabIndex = on ? 0 : -1;
            }
            if (pane) pane.hidden = !on;
        });
        const active = document.getElementById("panelTab" + name);
        if (focusTab && active) active.focus();
        const body = document.querySelector("#unifiedPanel .panel-body");
        if (body) body.scrollTop = 0;
    }

    function setPanelOpen(open, from) {
        isPanelOpen = open;
        const panel = document.getElementById("unifiedPanel");
        const toggleBtn = document.getElementById("toggleUnifiedPanelBtn");
        if (!panel) return;
        panel.classList.toggle("open", open);
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        panel.inert = !open; // closed drawers leave the tab order entirely
        document.body.classList.toggle("panel-open", open);
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (window.ZayaDrawers) { window.ZayaDrawers.syncDock(); window.ZayaDrawers.syncScrim(); }

        if (open) {
            panelInvoker = from || document.activeElement;
            // Two overlaying drawers would sit on top of each other; only docked ones share the screen
            if (!isDocked() && window.ZayaNavigator) window.ZayaNavigator.close();
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
    const isDocked = () => (window.ZayaDrawers ? window.ZayaDrawers.isDocked() : false);

    function toggleUnifiedPanel(from) {
        setPanelOpen(!isPanelOpen, from);
    }
    window.ZayaPanel = { open: (tab) => { setPanelOpen(true); if (tab) setPanelTab(tab, false); }, close: () => setPanelOpen(false), toggle: toggleUnifiedPanel };

    $("#toggleUnifiedPanelBtn").on("click", function () { toggleUnifiedPanel(this); });
    $("#closeUnifiedPanelBtn").on("click", function () { setPanelOpen(false); });
    $("#drawerScrim").on("click", function () { setPanelOpen(false); if (window.ZayaNavigator) window.ZayaNavigator.close(); });

    $(document).on("click", "#unifiedPanel [data-panel-tab]", function () {
        setPanelTab(this.getAttribute("data-panel-tab"), true);
    });

    // Arrow-key navigation across the panel tabs
    $(document).on("keydown", "#unifiedPanel [data-panel-tab]", function (e) {
        const idx = PANEL_TABS.indexOf(this.getAttribute("data-panel-tab"));
        let next = -1;
        // Up/Down walk the vertical rail, Left/Right the phone tab bar; both work in either mode
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % PANEL_TABS.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx + PANEL_TABS.length - 1) % PANEL_TABS.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = PANEL_TABS.length - 1;
        if (next < 0) return;
        e.preventDefault();
        setPanelTab(PANEL_TABS[next], true);
    });

    // Outside click closes the panel (the drawer keeps focus while it is being used)
    $(document).on("click", function (event) {
        if (!isPanelOpen) return;
        if (!isOverlay()) return; // a docked panel is layout, not an overlay: it stays until dismissed
        if ($(event.target).closest("#unifiedPanel, #toggleUnifiedPanelBtn, .modal-container, .theme-modal, [role=dialog]").length) return;
        setPanelOpen(false);
    });

    // The share/download shortcuts in the Document tab reuse the flipbook UI
    $("#panelShareBtn").on("click", function () { $("#customShareBtn").trigger("click"); });
    $("#panelDownloadBtn").on("click", function () { $("#menuDownloadBtn").trigger("click"); });

    function resetAutoHideTimer() { /* the panel no longer auto-hides: it closes on outside click or Esc */ }

    // Handle the PDF source selection
    // Load PDF from URL
    $("#loadPdfUrlBtn").click(function () {
        const button = $(this);
        const originalText = button.html();

        const rawUrl = $("#pdfUrl").val().trim();

        if (!rawUrl) {
            Toastify({
                text: "Please enter a PDF URL.",
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        // Enhanced URL validation with security checks
        const urlValidation = window.ValidationUtils.validateAndSanitizeUrl(rawUrl);
        if (!urlValidation.isValid) {
            Toastify({
                text: urlValidation.error,
                duration: 4000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        const newPdfUrl = urlValidation.sanitizedUrl;

        // Optional PDF extension warning (but still allow loading)
        if (!window.ValidationUtils.isValidPdfUrl(newPdfUrl)) {
            Toastify({
                text: "URL doesn't appear to point to a PDF file.",
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#f59e0b"
            }).showToast();
            // Still allow loading as it might be a valid PDF with different extension
        }

        // Show loading state
        button.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);
        button.closest('.input-field').find('input').prop('disabled', true);

        // Add loading overlay to flipbook container
        const container = $("#flipbookContainer");
        container.append(`
            <div id="loadingOverlay" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                color: white;
            ">
                <div style="text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <div>Loading PDF...</div>
                </div>
            </div>
        `);

        openRemoteUrl(newPdfUrl).then(function() {
            // Restore button after PDF starts loading
            setTimeout(() => {
                button.html(originalText).prop('disabled', false);
                button.closest('.input-field').find('input').prop('disabled', false);
                $('#loadingOverlay').fadeOut(300, function() { $(this).remove(); });
            }, 1000);
        });

        resetAutoHideTimer();
    });

    // Load PDF from local file - opens file picker automatically
    $("#loadPdfFileBtn").click(function () {
        $("#pdfFile").click();
        resetAutoHideTimer();
    });

    // Handle file selection
    $("#pdfFile").change(function () {
        const file = this.files[0];
        const validation = window.ValidationUtils.validatePdfFile(file);

        if (!validation.isValid) {
            Toastify({
                text: validation.error,
                duration: 4000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        openLocalFile(file);
        // Allow re-selecting the same file later
        this.value = '';
    });

    /** Open a File picked from disk (or restored from the local store) and remember it. */
    function openLocalFile(file, opts) {
        const fileName = file.name;
        const fileUrl = URL.createObjectURL(file);
        window.appState.updatePdfContext(fileUrl, 'local', fileName);
        if (window.ZayaLocalDocs && !(opts && opts.skipSave)) {
            window.ZayaLocalDocs.saveFile(file).then((kept) => {
                if (!kept && file.size > window.ZayaLocalDocs.MAX_FILE_BYTES) {
                    Toastify({ text: "This file is too large to keep for next time; you will need to open it again.", duration: 5000, gravity: "bottom", position: "right" }).showToast();
                }
            });
        }
        return window.getLastPage(fileName).catch(() => null).then(function(storedPage) {
            return loadFlipbook(fileUrl, window.appState.get('isRTL'), storedPage || 1, fileName)
                .catch((err) => console.error('Failed to load local PDF:', err));
        });
    }

    /** Open a remote PDF by URL (already validated) and remember it. */
    function openRemoteUrl(newPdfUrl) {
        let hostname = '';
        try { hostname = new URL(newPdfUrl).hostname; } catch (e) { hostname = 'remote-pdf'; }
        window.appState.updatePdfContext(newPdfUrl, 'url', hostname);
        return window.getLastPage(newPdfUrl).catch(() => null).then(function(storedPage) {
            return loadFlipbook(newPdfUrl, window.appState.get('isRTL'), storedPage || 1, newPdfUrl)
                .catch((err) => console.error('Failed to load PDF from URL:', err));
        });
    }

    window.ZayaDocuments = { openLocalFile, openRemoteUrl };

    // Reading direction: a labelled toggle that always spells out the current direction
    function syncDirectionLabel() {
        const isRTL = !!(window.appState && window.appState.get('isRTL'));
        $("#directionLabel").text(isRTL ? "Right to left" : "Left to right");
        $("#toggleDirectionBtn")
            .attr("aria-pressed", isRTL ? "true" : "false")
            .attr("title", isRTL ? "Switch to left-to-right reading" : "Switch to right-to-left reading");
    }

    $("#toggleDirectionBtn").click(function () {
        window.appState.toggleRTL();  // toggle state, the listener in load.js handles the rest
        syncDirectionLabel();
        resetAutoHideTimer();
    });

    if (window.appState && window.appState.subscribe) window.appState.subscribe('isRTL', syncDirectionLabel);
    syncDirectionLabel();

    // Keyboard shortcuts (Left/Right Arrow page turns, F for Fullscreen, Escape, Cmd+K)
    $(document).on("keydown", function(event) {
        // Don't trigger page turns when typing in inputs/textareas
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
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
    $("#unifiedPanel").removeClass("open");
});

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
        if (typeof options.renderContent === 'function') {
            options.renderContent(contentContainer, window.appState);
        } else if (typeof options.content === 'string') {
            contentContainer.innerHTML = options.content;
        }
        
        section.appendChild(contentContainer);
        panelBody.appendChild(section);
        return true;
    }
};
