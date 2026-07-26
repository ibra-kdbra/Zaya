$(document).ready(function () {
    // Unified Panel Management
    let panelAutoHideTimer;
    let isPanelOpen = false;

    // Toggle unified panel
    function toggleUnifiedPanel() {
        const panel = $("#unifiedPanel");
        const toggleBtn = $("#toggleUnifiedPanelBtn");
        const body = $("body");

        isPanelOpen = !isPanelOpen;
        panel.toggleClass("open", isPanelOpen);
        body.toggleClass("panel-open", isPanelOpen);

        if (isPanelOpen) {
            toggleBtn.html('<i class="fas fa-times"></i>').attr("title", "Close Control Panel");
            startAutoHideTimer();
            panel.addClass("panel-enhanced");
            // Add slight delay for smooth animation
            setTimeout(() => {
                panel.addClass("panel-fade-in");
            }, 50);
        } else {
            toggleBtn.html('<i class="fas fa-bars"></i>').attr("title", "Open Control Panel");
            clearAutoHideTimer();
            body.removeClass("panel-open");
            panel.removeClass("panel-fade-in");
        }
    }

    // Start auto-hide timer
    function startAutoHideTimer() {
        clearAutoHideTimer();
        panelAutoHideTimer = setTimeout(() => {
            if (isPanelOpen) {
                toggleUnifiedPanel();
            }
        }, 5000);
    }

    // Clear auto-hide timer
    function clearAutoHideTimer() {
        if (panelAutoHideTimer) {
            clearTimeout(panelAutoHideTimer);
            panelAutoHideTimer = null;
        }
    }

    // Reset auto-hide timer on user activity
    function resetAutoHideTimer() {
        if (isPanelOpen) {
            startAutoHideTimer();
        }
    }

    // Panel event listeners
    $("#toggleUnifiedPanelBtn").click(toggleUnifiedPanel);
    $("#closeUnifiedPanelBtn").click(toggleUnifiedPanel);

    // Reset timer on panel interactions
    $("#unifiedPanel").on("mouseenter focusin", function() {
        clearAutoHideTimer();
    }).on("mouseleave focusout", function() {
        startAutoHideTimer();
    });

    // Handle clicks outside panel to close it
    $(document).on("click", function(event) {
        const panel = $("#unifiedPanel");
        const toggleBtn = $("#toggleUnifiedPanelBtn");

        if (isPanelOpen && !panel.is(event.target) && !panel.has(event.target).length &&
            !toggleBtn.is(event.target) && !toggleBtn.has(event.target).length) {
            toggleUnifiedPanel();
        }
    });

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

        // Update AppState with PDF context for URL
        let hostname = '';
        try {
            const urlObj = new URL(newPdfUrl);
            hostname = urlObj.hostname;
        } catch (e) {
            hostname = 'remote-pdf';
        }
        window.appState.updatePdfContext(newPdfUrl, 'url', hostname);

        window.getLastPage(newPdfUrl).then(function(storedPage) {
            $('#storedPage').text(storedPage || 'N/A');
            loadFlipbook(newPdfUrl, window.appState.get('isRTL'), storedPage || 1, newPdfUrl);
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

        const fileName = file.name;
        const fileUrl = URL.createObjectURL(file);
        // Update AppState with PDF context for local file
        window.appState.updatePdfContext(fileUrl, 'local', fileName);
        window.getLastPage(fileName).then(function(storedPage) {
            $('#storedPage').text(storedPage || 'N/A');
            loadFlipbook(fileUrl, window.appState.get('isRTL'), storedPage || 1, fileName);
        });
    });

    // Toggle between RTL and LTR
    $("#toggleDirectionBtn").click(function () {
        const newIsRTL = window.appState.toggleRTL();  // toggle state, the listener in load.js handles the rest
        resetAutoHideTimer();

        if (newIsRTL) {
            $(this).html('<i class="fas fa-exchange-alt"></i>').attr("title", "Switch to LTR");
        } else {
            $(this).html('<i class="fas fa-exchange-alt"></i>').attr("title", "Switch to RTL");
        }
    });

    // Keyboard shortcuts (Left/Right Arrow page turns, F for Fullscreen, Escape, Cmd+K)
    $(document).on("keydown", function(event) {
        // Don't trigger page turns when typing in inputs/textareas
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
            return;
        }

        // Left / Right Arrow keys for page navigation
        if (event.key === "ArrowLeft") {
            if (window.dfApp && typeof window.dfApp.prev === 'function') {
                window.dfApp.prev();
            }
        } else if (event.key === "ArrowRight") {
            if (window.dfApp && typeof window.dfApp.next === 'function') {
                window.dfApp.next();
            }
        } else if (event.key === "f" || event.key === "F") {
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
            toggleUnifiedPanel();
        }
    });

    // Dispatch zaya:toolbarReady event
    document.dispatchEvent(new CustomEvent('zaya:toolbarReady'));

    // Initialize panel as closed
    $("#unifiedPanel").removeClass("open");
});

// Zaya UI Extension Slots for Plugins & Pro Features
window.ZayaUI = window.ZayaUI || {
    registerToolbarButton(options) {
        if (!options || !options.id) return false;
        const container = document.querySelector('.custom-controls') || document.querySelector('.unified-panel-actions') || document.body;
        if (!container) return false;

        const btn = document.createElement('button');
        btn.id = options.id;
        btn.className = 'panel-button slot-button';
        btn.setAttribute('title', options.label || '');
        btn.setAttribute('aria-label', options.label || '');
        btn.innerHTML = `<i class="${options.icon || 'fas fa-cog'}"></i> ${options.label ? `<span>${options.label}</span>` : ''}`;
        
        if (typeof options.onClick === 'function') {
            btn.addEventListener('click', (e) => options.onClick(e, window.appState));
        }

        container.appendChild(btn);
        return true;
    },

    registerPanelTab(options) {
        if (!options || !options.id) return false;
        const panelBody = document.querySelector('#unifiedPanel .panel-body') || document.querySelector('#unifiedPanel');
        if (!panelBody) return false;

        const section = document.createElement('div');
        section.id = `panel-tab-${options.id}`;
        section.className = 'panel-section pro-panel-section';
        section.innerHTML = `<h3 class="panel-section-title"><i class="${options.icon || 'fas fa-puzzle-piece'}"></i> ${options.title}</h3>`;
        
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
