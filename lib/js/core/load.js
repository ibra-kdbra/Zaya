// Initialize browser compatibility checks
window.BrowserCompatibility.initializeCompatibilityChecks();

/*
 * The flipbook engine keeps its own labels in `options.text` (see core/dflip/constants.js); the
 * options are deep-merged, so handing it a translated block is enough for its tooltips, its share
 * mail and its loading line to speak the interface language.
 */
const ENGINE_TEXT_KEYS = ['toggleSound', 'toggleThumbnails', 'toggleOutline', 'previousPage',
    'nextPage', 'toggleFullscreen', 'zoomIn', 'zoomOut', 'toggleHelp', 'singlePageMode',
    'doublePageMode', 'downloadPDFFile', 'gotoFirstPage', 'gotoLastPage', 'play', 'pause',
    'share', 'mailSubject', 'mailBody', 'loading'];

function engineText() {
    const text = {};
    ENGINE_TEXT_KEYS.forEach((key) => { text[key] = ZayaT('engine.' + key); });
    return text;
}

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
        emptyFlipbookContainer();

        loadFlipbook(currentPdf, newValue, currentPage, pdfId);
    }
});

/*
 * Stiff pages are a load-time option of the engine (`hard`, honoured by both the WebGL and the
 * CSS renderers), so a change reopens the document on the same page, exactly as RTL does.
 */
window.appState.subscribe('hardCover', () => {
    if (typeof window.flipbookInstance === 'undefined' || !window.flipbookInstance || isCurrentlyLoading) return;

    const currentPdf = window.appState.get('currentPdf');
    const pdfId = window.ZayaCurrentDocKey();

    let currentPage = 1;
    if (window.flipbookInstance.target && window.flipbookInstance.target._activePage) {
        currentPage = window.flipbookInstance.target._activePage;
    } else if (window.flipbookInstance._activePage) {
        currentPage = window.flipbookInstance._activePage;
    }

    if (window.flipbookInstance.dispose) {
        try { window.flipbookInstance.dispose(); } catch (e) { /* already gone */ }
    }
    emptyFlipbookContainer();

    loadFlipbook(currentPdf, window.appState.get('isRTL'), currentPage, pdfId)
        .catch((err) => console.error('Failed to reopen after the stiff-page change:', err));
});

/** The stage the engine paints into; emptied before every load. */
function flipbookContainer() {
    return document.getElementById('flipbookContainer');
}
function emptyFlipbookContainer() {
    const host = flipbookContainer();
    if (host) host.replaceChildren();
}
function removeLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}
function fadeOutLoadingOverlay() {
    if (window.ZayaLoadingOverlay) window.ZayaLoadingOverlay.hide();
    else removeLoadingOverlay();
}

let isCurrentlyLoading = false;
// Once a document has been shown, a failed load reports an error instead of silently swapping in the default.
let hasLoadedOnce = false;
function failOrFallback(kind, pdfUrl, rtlMode) {
    isCurrentlyLoading = false;
    removeLoadingOverlay();
    if (hasLoadedOnce) {
        showDocumentError(kind, pdfUrl);
        if (window.ZayaPanel && window.ZayaPanel.close) window.ZayaPanel.close();
        return;
    }
    Toastify({ text: ZayaT("doc.fallbackToast"), duration: 4000, gravity: "bottom", position: "right", backgroundColor: "#f59e0b" }).showToast();
    loadFlipbook(DEFAULT_PDF_URL, rtlMode, 1, DEFAULT_PDF_URL);
}
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
    hideDocumentError();
    loadingStartedAt = Date.now();

    // Validate PDF URL
    if (!pdfUrl || pdfUrl.trim() === '') {
        console.error('Invalid PDF URL provided to loadFlipbook');
        handleLoadingError(ZayaT("doc.invalidUrlProvided"));
        return;
    }

    // Pre-flight check for remote URLs (skip for default PDF to avoid CORS issues)
    if (!pdfUrl.startsWith('blob:') && pdfUrl !== DEFAULT_PDF_URL) {
        const isReachable = await isUrlReachable(pdfUrl);
        if (!isReachable) {
            console.log('PDF URL unreachable');
            failOrFallback('unreachable', pdfUrl, rtlMode);
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
        hard: window.appState.get('hardCover') || 'none', // 'none' | 'cover' | 'all'
        zoomChange: function (isZoomed) {
            document.body.style.overflow = isZoomed ? "hidden" : "auto";
        },
        text: engineText(),
        openPage: page || 1,
        pdfId: pdfId || pdfUrl,
        onReady: function(book) {
            hasLoadedOnce = true;
            hideDocumentError();
            if (window.ZayaLocalDocs && pdfUrl !== DEFAULT_PDF_URL) {
                const isLocal = pdfUrl.startsWith('blob:');
                window.ZayaLocalDocs.touch({
                    key: isLocal ? (pdfId || '') : pdfUrl,
                    type: isLocal ? 'local' : 'url',
                    name: isLocal ? (pdfId || 'Local PDF') : pdfUrl
                });
            }
            if (book && typeof book.pageCount !== 'undefined') {
                console.log('PDF loaded successfully with', book.pageCount, 'pages');
            }
            // Remembered More-menu choices first, so an explicit ?mode= still wins over them.
            if (window.ZayaBookPrefs) window.ZayaBookPrefs.applyTo(window.flipbookInstance || book);
            if (window.ZayaUrlOptions) window.ZayaUrlOptions.applyToBook(window.flipbookInstance || book);
        },
    };

    emptyFlipbookContainer();
    if (window.ZayaNavigator && window.ZayaNavigator.reset) window.ZayaNavigator.reset();

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
                        // The engine's own teardown removes its side panels wherever the Navigator
                        // moved them, releases the pdf.js document and stops the render loop.
                        if (typeof flipbookInstance.dispose === 'function') flipbookInstance.dispose();
                        else if (typeof flipbookInstance.destroy === 'function') flipbookInstance.destroy();
                        emptyFlipbookContainer();
                    } catch (e) {
                        console.error('Error disposing flipbook:', e);
                    }
                }
            }, 'pdf');
        }

    // Add fallback logic for when flipbook fails to load after initialization
    setTimeout(() => {
        // Runs whether or not the loading lock is still held: what matters is what is on screen.
        if (pdfUrl === window.appState.get('currentPdf')) {
            const host = flipbookContainer();
            const stageText = host ? host.textContent : '';
            const hasDFlipContent = !!(host && host.querySelector(".df-book-stage, .df-book-wrapper, canvas, .df-book-page"));
            const hasError = !!(host && host.querySelector('[style*="color: red"]')) ||
                             stageText.includes("could not be opened") ||
                             stageText.includes("Not Found") ||
                             stageText.includes("Error loading PDF");

            if ((hasError || !hasDFlipContent) && pdfUrl !== DEFAULT_PDF_URL) {
                console.log('Fallback triggered by watchdog');
                failOrFallback(hasError ? 'cors' : 'unreachable', pdfUrl, rtlMode);
            } else if (!hasError && hasDFlipContent) {
                // Loading finished successfully, clear overlay just in case
                fadeOutLoadingOverlay();
                isCurrentlyLoading = false;
                hasLoadedOnce = true;
            }
        }
    }, 7000); // Increased timeout slightly for better stability

    } catch (error) {
        console.error('Error initializing flipbook:', error);
        isCurrentlyLoading = false;
        
        // Clear any loading overlays
        removeLoadingOverlay();

        if (pdfUrl !== DEFAULT_PDF_URL) {
            failOrFallback('unreachable', pdfUrl, rtlMode);
        } else {
            handleLoadingError(ZayaT("doc.defaultFailed"));
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

/* Document error overlay: one heading, one sentence, two ways out. */
function showDocumentError(kind, source) {
    let box = document.getElementById('docErrorState');
    if (!box) {
        box = document.createElement('div');
        box.id = 'docErrorState';
        box.className = 'doc-error';
        box.setAttribute('role', 'alert');
        document.body.appendChild(box);
    }
    box.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = ZayaT('doc.errorTitle');
    const p = document.createElement('p');
    p.textContent = kind === 'cors' ? ZayaT('doc.errorCors')
        : (kind === 'invalid' ? ZayaT('doc.errorInvalid') : ZayaT('doc.errorUnreachable'));
    const src = document.createElement('p');
    src.className = 'doc-error-source';
    src.textContent = source && !String(source).startsWith('blob:') ? String(source) : '';
    const actions = document.createElement('div');
    actions.className = 'doc-error-actions';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = ZayaT('action.tryAgain');
    retry.addEventListener('click', () => {
        hideDocumentError();
        if (source) loadFlipbook(source, window.appState.get('isRTL'), 1, source).catch(() => {});
    });
    const other = document.createElement('button');
    other.type = 'button'; other.className = 'primary'; other.textContent = ZayaT('doc.openAnother');
    other.addEventListener('click', () => {
        hideDocumentError();
        if (window.ZayaPanel && window.ZayaPanel.open) window.ZayaPanel.open('Document');
        const input = document.getElementById('pdfUrl');
        if (input) setTimeout(() => input.focus(), 250);
    });
    if (source) actions.appendChild(retry);
    actions.appendChild(other);
    box.append(h, p, src, actions);
    box.dataset.errorKind = kind || '';
    box.dataset.errorSource = source ? String(source) : '';
    box.hidden = false;
    const loading = document.getElementById('docLoadingState');
    if (loading) loading.hidden = true;
    // The message must be visible: close whatever sheet is covering the stage.
    if (window.ZayaPanel && window.ZayaPanel.close) window.ZayaPanel.close();
    if (window.ZayaNavigator && window.ZayaNavigator.close) window.ZayaNavigator.close();
}
function hideDocumentError() {
    const box = document.getElementById('docErrorState');
    if (box) box.hidden = true;
}
// The error state is a full screen of prose: redraw it when the language changes under it.
document.addEventListener('zaya:languageChanged', () => {
    const box = document.getElementById('docErrorState');
    if (box && !box.hidden) showDocumentError(box.dataset.errorKind, box.dataset.errorSource);
});

window.ZayaDocumentError = showDocumentError;
window.ZayaHideDocumentError = hideDocumentError;

function handleLoadingError(message) {
    showDocumentError('unreachable', window.appState.get('currentPdf'));
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
            element.textContent = pdfName;
            element.setAttribute('data-pdf-type', pdfType);
            element.style.display = '';
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
    const panel = document.getElementById('unifiedPanel');
    const isPanelOpen = !!panel && panel.classList.contains('open');

    // Built from elements: the filename is the reader's own and never goes through markup.
    const body = document.createElement('div');
    body.style.cssText = 'position:relative;padding-right:30px';
    const line = document.createElement('div');
    line.textContent = ZayaT('doc.reselect', { name: filename });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', ZayaT('action.dismiss'));
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = 'position:absolute;top:5px;right:5px;background:none;border:none;font-size:16px;' +
        'cursor:pointer;padding:2px;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;' +
        'justify-content:center;opacity:0.7;transition:opacity 0.2s;color:' + themeColors.text;
    body.append(line, closeBtn);

    const toast = Toastify({
        node: body,
        duration: 6000,
        gravity: "bottom",
        position: isPanelOpen ? "left" : "right",
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
            const target = event && event.target ? event.target : null;
            if (target && closeBtn.contains(target)) toast.hideToast();
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
            text: ZayaT("doc.badPdfParam"),
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
        // The blob URL died with the previous page load. If a copy of the file was kept it is
        // reopened from IndexedDB; otherwise show the default and ask for a re-pick.
        const store = window.ZayaLocalDocs;
        const restore = store ? store.getFile(storedName) : Promise.resolve(null);
        restore.then(function (rec) {
            if (rec && rec.blob) {
                const fileUrl = URL.createObjectURL(rec.blob);
                window.appState.updatePdfContext(fileUrl, 'local', storedName);
                return window.getLastPage(storedName).catch(() => null).then(function (storedPage) {
                    return loadFlipbook(fileUrl, window.appState.get('isRTL'), (!isNaN(pageFromUrl) && pageFromUrl) || storedPage || 1, storedName);
                });
            }
            showThemedLocalFileToast(storedName);
            window.appState.updatePdfContext(DEFAULT_PDF_URL, 'url', 'Default PDF');
            return window.getLastPage(DEFAULT_PDF_URL).catch(() => null).then(function (storedPage) {
                return loadFlipbook(DEFAULT_PDF_URL, window.appState.get('isRTL'), storedPage || 1, DEFAULT_PDF_URL);
            });
        }).catch((err) => console.error('Flipbook failed to start:', err));
        return;
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
