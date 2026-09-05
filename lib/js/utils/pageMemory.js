(function() {
    // Page persistence: the last page read of every document, in the shared `Zaya` database.
    const STORE = 'pages';

    function db() {
        return window.ZayaDB ? window.ZayaDB : null;
    }

    /**
     * Get the last saved page number for a specific PDF
     * @param {string} pdfKey - Unique identifier for the PDF (URL or name)
     * @returns {Promise<number|null>} Last page number or null if not found
     */
    function getLastPage(pdfKey) {
        if (!pdfKey || typeof pdfKey !== 'string' || !db()) return Promise.resolve(null);
        return db().get(STORE, pdfKey)
            .then((page) => (Number.isFinite(page) ? page : null))
            .catch(() => null); // no database, no memory: reading simply starts at page one
    }

    /**
     * Save the last viewed page number for a specific PDF
     * @param {string} pdfKey - Unique identifier for the PDF (URL or name)
     * @param {number} pageNum - Page number to save
     * @returns {Promise<void>}
     */
    function saveLastPage(pdfKey, pageNum) {
        const page = parseInt(pageNum, 10);
        if (!pdfKey || typeof pdfKey !== 'string' || !Number.isFinite(page) || page < 1 || !db()) return Promise.resolve();
        return db().put(STORE, page, pdfKey, 'the page you are on').catch((err) => {
            if (!window.ZayaDB.isQuotaError(err)) console.warn('Failed to save page:', err);
        });
    }

    /**
     * The single identity used for a document across page memory and quotes.
     * Local files keep their filename (their blob: URL is gone after a reload);
     * everything else is keyed by its URL.
     * @param {string} pdfUrl
     * @param {string} pdfType - 'local' or 'url'
     * @param {string} pdfName
     * @returns {string}
     */
    function documentKey(pdfUrl, pdfType, pdfName) {
        const isLocal = pdfType === 'local' || (typeof pdfUrl === 'string' && pdfUrl.startsWith('blob:'));
        if (isLocal) return pdfName || pdfUrl || '';
        return pdfUrl || '';
    }

    /** documentKey() for whatever AppState currently holds. */
    function currentDocumentKey() {
        if (!window.appState) return '';
        return documentKey(
            window.appState.get('currentPdf'),
            window.appState.get('currentPdfType'),
            window.appState.get('currentPdfName')
        );
    }

    // Attach to window for global access
    window.getLastPage = getLastPage;
    window.saveLastPage = saveLastPage;
    window.ZayaDocKey = documentKey;
    window.ZayaCurrentDocKey = currentDocumentKey;
})();
