// Initialize browser compatibility checks
window.BrowserCompatibility.initializeCompatibilityChecks();

// Constants - now centralized in app-state.js for single source of truth
const DEFAULT_PDF_URL = window.appState.constructor.getDefaultPdfUrl();

// Subscribe to AppState changes for RTL and PDF updates
window.appState.subscribe('isRTL', (newValue) => {
    // Update flipbook direction if needed when RTL changes
    if (typeof window.flipbookInstance !== 'undefined' && window.flipbookInstance && !isCurrentlyLoading) {
        // Check current flipbook direction to avoid redundant reloads
        const currentDirection = window.flipbookInstance.direction || 
                                 (window.flipbookInstance.target ? window.flipbookInstance.target.direction : null);
        const targetDirection = newValue ? 2 : 1;

        if (currentDirection === targetDirection) return;

        const currentPdf = window.appState.get('currentPdf');
        const pdfId = window.ZayaCurrentDocKey();
        
        let currentPage = 1;
        if (window.flipbookInstance.target && window.flipbookInstance.target._activePage) {
            currentPage = window.flipbookInstance.target._activePage;
        } else if (window.flipbookInstance._activePage) {
            currentPage = window.flipbookInstance._activePage;
        }

        console.log('AppState RTL change detected, reloading flipbook for direction sync');
        
        // Clean up properly before direction toggle reload
        if (window.flipbookInstance.dispose) {
            try { window.flipbookInstance.dispose(); } catch(e) {}
        }
        $("#flipbookContainer").empty();
        
        loadFlipbook(currentPdf, newValue, currentPage, pdfId);
    }
});

let isCurrentlyLoading = false;
let loadingStartedAt = 0;

// Safety net: release the lock if a load never reported back.
setInterval(() => {
    if (isCurrentlyLoading && Date.now() - loadingStartedAt > 30000) {
        console.warn('Safety check: isCurrentlyLoading was stuck, resetting...');
        isCurrentlyLoading = false;
    }
}, 15000);

/**
 * Pre-flight check to see if a URL is reachable
 * @param {string} url - URL to check
 * @returns {Promise<boolean>}
 */
async function isUrlReachable(url) {
    if (!url) return false;
    if (url.startsWith('blob:')) return true; // Blob URLs are local and expected to be valid during session

    try {
        // HEAD keeps the pre-flight cheap. With no-cors the status is opaque, so "did not throw"
        // is the only signal available here; a real failure is caught by the load watchdog below.
        await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        return true;
    } catch (error) {
        console.warn('URL pre-flight check failed:', url, error);
        return false;
    }
}

// Function to load the flipbook
async function loadFlipbook(pdfUrl, rtlMode, page, pdfId) {
    if (isCurrentlyLoading) {
        console.log('Already loading a PDF, skipping concurrent request');
        return;
    }
    isCurrentlyLoading = true;
    loadingStartedAt = Date.now();

    // Validate PDF URL
    if (!pdfUrl || pdfUrl.trim() === '') {
        console.error('Invalid PDF URL provided to loadFlipbook');
        handleLoadingError("Invalid PDF URL provided.");
        return;
    }

    // Pre-flight check for remote URLs (skip for default PDF to avoid CORS issues)
    if (!pdfUrl.startsWith('blob:') && pdfUrl !== DEFAULT_PDF_URL) {
        const isReachable = await isUrlReachable(pdfUrl);
        if (!isReachable) {
            console.log('PDF URL unreachable, falling back to default...');
            isCurrentlyLoading = false; // Reset lock for fallback
            
            // Clear any loading overlays
            $('#loadingOverlay').remove();
            
            Toastify({
                text: "Target PDF unreachable. Loading default...",
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#f59e0b"
            }).showToast();

            loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, DEFAULT_PDF_URL);
            return;
        }
    }

    var options = {
        height: "100%",
        paddingTop: 56,   // keep the page clear of the app header
        paddingBottom: 40,
        duration: 700,
        backgroundColor: "#2F2D2F",
        direction: rtlMode ? 2 : 1, // Use 2 for RTL and 1 for LTR
        zoomChange: function (isZoomed) {
            $("body").css("overflow", isZoomed ? "hidden" : "auto");
        },
        openPage: page || 1,
        pdfId: pdfId || pdfUrl,
        onReady: function(book) {
            if (book && typeof book.pageCount !== 'undefined') {
                console.log('PDF loaded successfully with', book.pageCount, 'pages');
            }
            if (window.ZayaUrlOptions) window.ZayaUrlOptions.applyToBook(window.flipbookInstance || book);
        },
    };

    $("#flipbookContainer").empty();

    // Clean up the previous document exactly once. Reloading the same document (RTL toggle)
    // must keep its blob: URL alive; switching documents revokes it.
    if (window.flipbookInstance) {
        const sameSource = !!(window.flipbookInstance.options && window.flipbookInstance.options.source === pdfUrl);
        window.memoryManager.cleanupPDF({ revokeBlobs: !sameSource });
        window.flipbookInstance = null;
    }

    // Add error handling for PDF loading
    let flipbookInstance = null;
    try {
        flipbookInstance = $("#flipbookContainer").flipBook(pdfUrl, options);
        window.flipbookInstance = flipbookInstance;

        if (flipbookInstance) {
            window.memoryManager.registerResource({
                url: pdfUrl,
                dispose: () => {
                    try {
                        if (flipbookInstance.destroy) {
                            flipbookInstance.destroy();
                        }
                        $("#flipbookContainer").empty();
                    } catch (e) {
                        console.error('Error disposing flipbook:', e);
                    }
                }
            }, 'pdf');
        }

    // Add fallback logic for when flipbook fails to load after initialization
    setTimeout(() => {
        if (isCurrentlyLoading && pdfUrl === window.appState.get('currentPdf')) {
            // If it's still "loading" according to our lock after 5s, check if content actually appeared
            const hasDFlipContent = $("#flipbookContainer").find(".df-book-stage, .df-book-wrapper, canvas, .df-book-page").length > 0;
            const hasError = $("#flipbookContainer").find('[style*="color: red"]').length > 0 || 
                             $("#flipbookContainer").text().includes("Cannot access file") ||
                             $("#flipbookContainer").text().includes("Not Found") ||
                             $("#flipbookContainer").text().includes("Error loading PDF");

            if ((hasError || !hasDFlipContent) && pdfUrl !== DEFAULT_PDF_URL) {
                console.log('Fallback triggered by watchdog');
                isCurrentlyLoading = false;
                
                // Clear any loading overlays
                $('#loadingOverlay').remove();
                
                Toastify({
                    text: "Failed to load PDF. Falling back to default...",
                    duration: 3000,
                    gravity: "bottom",
                    position: "right",
                    backgroundColor: "#ef4444"
                }).showToast();

                loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, DEFAULT_PDF_URL);
            } else if (!hasError && hasDFlipContent) {
                // Loading finished successfully, clear overlay just in case
                $('#loadingOverlay').fadeOut(300, function() { $(this).remove(); });
                isCurrentlyLoading = false;
            }
        }
    }, 7000); // Increased timeout slightly for better stability

    } catch (error) {
        console.error('Error initializing flipbook:', error);
        isCurrentlyLoading = false;
        
        // Clear any loading overlays
        $('#loadingOverlay').remove();

        if (pdfUrl !== DEFAULT_PDF_URL) {
            Toastify({
                text: "Initialization error. Loading default...",
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, DEFAULT_PDF_URL);
        } else {
            handleLoadingError("Default PDF failed to load.");
        }
        return;
    }

    // Update global PDF context
    updatePdfContext(pdfUrl, pdfId);
    
    if (flipbookInstance) {
        window.flipbookInstance = flipbookInstance;
    }
    
    if (window.flipbookInstance) {
        window.flipbookInstance.direction = rtlMode ? 2 : 1;
        if (window.flipbookInstance.ui && window.flipbookInstance.ui.update) {
            window.flipbookInstance.ui.update();
        }
        if (window.flipbookInstance.resize) {
            window.flipbookInstance.resize();
        }
    }
    isCurrentlyLoading = false;
}

function handleLoadingError(message) {
    $("#flipbookContainer").html(`
        <div style="color: red; padding: 20px; text-align: center;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i><br>
            ${message}<br>
            <small>Please try uploading a different PDF or check your connection.</small>
        </div>
    `);
    Toastify({
        text: message,
        duration: 4000,
        gravity: "bottom",
        position: "right",
        backgroundColor: "#ef4444"
    }).showToast();
    isCurrentlyLoading = false;
}

 // Function to update PDF context globally
function updatePdfContext(pdfUrl, pdfId) {
    let pdfType = 'url';
    let pdfName = '';

    if (pdfUrl.startsWith('blob:')) {
        pdfType = 'local';
        if (pdfId && (pdfId.startsWith('http') || pdfId.includes('/'))) {
            pdfName = window.appState.get('currentPdfName') || 'Local PDF';
        } else {
            pdfName = pdfId || 'Local PDF';
        }
    } else {
        pdfType = 'url';
        try {
            const url = new URL(pdfUrl);
            pdfName = url.hostname;
        } catch (e) {
            pdfName = pdfUrl.substring(0, 50) + '...';
        }
    }

    // AppState.persistToStorage() is the only writer of lastOpenedPDF / lastOpenedPDFType.
    window.appState.updatePdfContext(pdfUrl, pdfType, pdfName);

    if (window.updateCurrentPdfContext) {
        window.updateCurrentPdfContext();
    }

    updatePdfInfoDisplay(pdfName, pdfType);
}

function updatePdfInfoDisplay(pdfName, pdfType) {
    const pdfInfoElements = document.querySelectorAll('[data-pdf-info]');
    pdfInfoElements.forEach(element => {
        if (pdfName) {
            element.textContent = `${pdfType === 'local' ? '📁' : '🌐'} ${pdfName}`;
            element.style.display = 'inline';
        } else {
            element.style.display = 'none';
        }
    });
}

function themeToastColors() {
    const css = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
    return {
        background: pick('--bg-secondary', '#1f2937'),
        text: pick('--text-primary', '#f9fafb'),
        border: pick('--border-primary', '#374151'),
        shadow: pick('--shadow-primary', '0 8px 24px rgba(0,0,0,0.35)')
    };
}

function showThemedLocalFileToast(filename) {
    const themeColors = themeToastColors();
    const isPanelOpen = $("#unifiedPanel").hasClass("open");

    const toast = Toastify({
        text: `<div style="position: relative; padding-right: 30px;">
            <div>Last read: "${window.ValidationUtils.escapeHtml(filename)}". Please re-select it to continue.</div>
            <button id="toast-close-btn" style="
                position: absolute;
                top: 5px;
                right: 5px;
                background: none;
                border: none;
                color: ${themeColors.text};
                font-size: 16px;
                cursor: pointer;
                padding: 2px;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.7;
                transition: opacity 0.2s;
            " aria-label="Dismiss">\u00d7</button>
        </div>`,
        duration: 6000,
        gravity: "bottom",
        position: isPanelOpen ? "left" : "right",
        escapeMarkup: false,
        className: "zaya-local-file-toast",
        style: {
            background: themeColors.background,
            color: themeColors.text,
            border: `1px solid ${themeColors.border}`,
            borderRadius: "8px",
            boxShadow: themeColors.shadow,
            maxWidth: "400px",
            fontFamily: "inherit"
        },
        onClick: function(event) {
            const closeBtn = document.getElementById('toast-close-btn');
            const target = event && event.target ? event.target : null;
            if (closeBtn && target && closeBtn.contains(target)) {
                toast.hideToast();
            }
        }
    });

    toast.showToast();
}

    // Initial call to load the flipbook
$(document).ready(function () {
    var urlParams = new URLSearchParams(window.location.search);
    var rawPdfParam = urlParams.get('pdf');
    var pdfFromUrl = rawPdfParam ? window.ValidationUtils.safePdfUrl(rawPdfParam) : null;
    if (rawPdfParam && !pdfFromUrl) {
        console.warn('Ignoring invalid ?pdf= parameter');
        Toastify({
            text: "The ?pdf= link is not a valid http(s) URL. Loading default instead.",
            duration: 4000,
            gravity: "bottom",
            position: "right",
            backgroundColor: "#f59e0b"
        }).showToast();
    }
    var pageFromUrl = parseInt(urlParams.get('page'), 10);
    if (!isNaN(pageFromUrl) && pageFromUrl < 1) pageFromUrl = 1;

    // AppState already normalised what was stored: a URL for remote documents, a bare
    // filename (with type 'local') for a file the reader picked from disk.
    var storedType = window.appState.get('currentPdfType');
    var storedName = window.appState.get('currentPdfName');
    var storedPdf = window.appState.get('currentPdf');

    var pdfToLoad;
    var pdfId;   // page-memory / quotes key for the document actually being shown

    if (pdfFromUrl) {
        pdfToLoad = pdfFromUrl;
        pdfId = pdfFromUrl;
    } else if (storedType === 'local' && storedName) {
        // The blob URL died with the previous page load; show the default and ask for a re-pick.
        // The remembered page for that file is restored by the file picker in controls.js.
        showThemedLocalFileToast(storedName);
        pdfToLoad = DEFAULT_PDF_URL;
        pdfId = DEFAULT_PDF_URL;
        window.appState.updatePdfContext(DEFAULT_PDF_URL, 'url', 'Default PDF');
    } else {
        const safeStored = window.ValidationUtils.safePdfUrl(storedPdf);
        pdfToLoad = safeStored || DEFAULT_PDF_URL;
        pdfId = pdfToLoad;
    }

    const startLoad = (page) => loadFlipbook(pdfToLoad, window.appState.get('isRTL'), page, pdfId)
        .catch((err) => console.error('Flipbook failed to start:', err));

    if (!isNaN(pageFromUrl)) {
        startLoad(pageFromUrl);
    } else {
        window.getLastPage(pdfId).then(function(storedPage) {
            startLoad(storedPage || 1);
        }).catch(function() {
            startLoad(1);
        });
    }
});
