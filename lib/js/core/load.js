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
        const pdfName = window.appState.get('currentPdfName');
        const pdfId = window.appState.get('currentPdfType') === 'local' ? pdfName : currentPdf;
        
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

window.appState.subscribe('currentPdfType', (newValue) => {
    if (newValue && window.dbInitialized) {
        updateCurrentPdfContext();
    }
});

let isCurrentlyLoading = false;

// Safety check for loading lock
setInterval(() => {
    if (isCurrentlyLoading) {
        console.log('Safety check: isCurrentlyLoading was stuck, resetting...');
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
        // Use HEAD request to minimize data usage
        const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        // With no-cors, we can't see the status, but if fetch doesn't throw, it's a good sign.
        // However, DFlip needs CORS for many PDFs. Let's try a regular fetch for metadata.
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

            loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, 'Default PDF');
            return;
        }
    }

    var options = {
        height: "100%",
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

    // Clean up previous PDF resources before loading new one
    if (window.flipbookInstance && window.flipbookInstance.options && window.flipbookInstance.options.source !== pdfUrl) {
        window.memoryManager.cleanupPDF();
    } else {
        if (window.flipbookInstance && window.flipbookInstance.dispose) {
            try { window.flipbookInstance.dispose(); } catch(e) {}
        }
        $("#flipbookContainer").empty();
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

                loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, 'Default PDF');
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
            loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, 'Default PDF');
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
    let storageValue = pdfUrl;

    if (pdfUrl.startsWith('blob:')) {
        pdfType = 'local';
        if (pdfId && (pdfId.startsWith('http') || pdfId.includes('/'))) {
            pdfName = window.appState.get('currentPdfName') || 'Local PDF';
        } else {
            pdfName = pdfId || 'Local PDF';
        }
        storageValue = pdfName;
    } else {
        pdfType = 'url';
        try {
            const url = new URL(pdfUrl);
            pdfName = url.hostname;
        } catch (e) {
            pdfName = pdfUrl.substring(0, 50) + '...';
        }
        storageValue = pdfUrl;
    }

    window.appState.updatePdfContext(pdfUrl, pdfType, pdfName);
    try {
        localStorage.setItem('lastOpenedPDF', storageValue);
        localStorage.setItem('lastOpenedPDFType', pdfType);
    } catch (e) {
        console.warn('Unable to persist last opened PDF:', e);
    }

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

function showThemedLocalFileToast(filename) {
    const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
    const themeColors = getThemeToastColors(currentTheme);
    const isPanelOpen = $("#unifiedPanel").hasClass("open");
    const toastPosition = isPanelOpen ? "left" : "right";

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
            " aria-label="Dismiss">×</button>
        </div>`,
        duration: 6000,
        gravity: "bottom",
        position: toastPosition,
        escapeMarkup: false,
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

function getThemeToastColors(theme) {
    if (!theme && window.themeManager) {
        theme = window.themeManager.getCurrentTheme();
    }
    
    const themeColors = {
        'default': {
            background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
            text: '#ffffff',
            border: '#2563eb',
            shadow: '0 8px 25px rgba(59, 130, 246, 0.3)'
        },
        'dark': {
            background: 'linear-gradient(135deg, #374151, #1f2937)',
            text: '#f9fafb',
            border: '#4b5563',
            shadow: '0 8px 25px rgba(0, 0, 0, 0.5)'
        },
        'light': {
            background: 'linear-gradient(135deg, #ffffff, #f8fafc)',
            text: '#1f2937',
            border: '#e2e8f0',
            shadow: '0 8px 25px rgba(0, 0, 0, 0.1)'
        },
        'purple': {
            background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
            text: '#ffffff',
            border: '#8b5cf6',
            shadow: '0 8px 25px rgba(147, 51, 234, 0.3)'
        },
        'green': {
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            text: '#ffffff',
            border: '#16a34a',
            shadow: '0 8px 25px rgba(34, 197, 94, 0.3)'
        },
        'red': {
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            text: '#ffffff',
            border: '#dc2626',
            shadow: '0 8px 25px rgba(239, 68, 68, 0.3)'
        },
        'orange': {
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            text: '#ffffff',
            border: '#ea580c',
            shadow: '0 8px 25px rgba(249, 115, 22, 0.3)'
        },
        'pink': {
            background: 'linear-gradient(135deg, #ec4899, #db2777)',
            text: '#ffffff',
            border: '#db2777',
            shadow: '0 8px 25px rgba(236, 72, 153, 0.3)'
        },
        'cyan': {
            background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
            text: '#ffffff',
            border: '#0891b2',
            shadow: '0 8px 25px rgba(6, 182, 212, 0.3)'
        },
        'indigo': {
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            text: '#ffffff',
            border: '#4f46e5',
            shadow: '0 8px 25px rgba(99, 102, 241, 0.3)'
        },
        'yellow': {
            background: 'linear-gradient(135deg, #eab308, #ca8a04)',
            text: '#1f2937',
            border: '#ca8a04',
            shadow: '0 8px 25px rgba(234, 179, 8, 0.3)'
        },
        'gray': {
            background: 'linear-gradient(135deg, #6b7280, #4b5563)',
            text: '#ffffff',
            border: '#4b5563',
            shadow: '0 8px 25px rgba(107, 114, 128, 0.3)'
        }
    };

    return themeColors[theme] || themeColors['default'];
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

    var lastOpenedPDF = localStorage.getItem('lastOpenedPDF');
    var lastOpenedPDFType = localStorage.getItem('lastOpenedPDFType');

    var pdfId;
    var pdfToLoad = window.appState.get('currentPdf') || DEFAULT_PDF_URL;

    if (pdfFromUrl) {
        pdfToLoad = pdfFromUrl;
        pdfId = pdfFromUrl;
    } else if (lastOpenedPDF && lastOpenedPDF.trim() !== '') {
        if (lastOpenedPDFType === 'local' || lastOpenedPDF.startsWith('blob:')) {
            showThemedLocalFileToast(lastOpenedPDF);
            pdfId = lastOpenedPDF;
            pdfToLoad = DEFAULT_PDF_URL;
            // Update app state to reflect fallback to default during refresh
            window.appState.updatePdfContext(DEFAULT_PDF_URL, 'url', 'Default PDF');
        } else {
            const safeStored = window.ValidationUtils.safePdfUrl(lastOpenedPDF);
            pdfToLoad = safeStored || DEFAULT_PDF_URL;
            pdfId = safeStored || 'Default PDF';
        }
    } else {
        pdfId = 'Default PDF';
        pdfToLoad = DEFAULT_PDF_URL;
    }

    if (!pdfToLoad || pdfToLoad.trim() === '') {
        pdfToLoad = DEFAULT_PDF_URL;
        pdfId = 'Default PDF';
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
