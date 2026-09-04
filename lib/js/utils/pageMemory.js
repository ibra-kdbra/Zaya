(function() {
    // Page persistence module using IndexedDB
    const PAGE_DB_NAME = 'FlipBookPageMemory';
    const PAGE_STORE_NAME = 'pages';
    const DB_VERSION = 1;

    let dbPromise;

    /**
     * Initialize IndexedDB database
     * @returns {Promise<IDBDatabase>} Database instance promise
     */
    function initDB() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(PAGE_DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.warn('Failed to open page memory database:', request.error);
                dbPromise = null; // allow a later retry instead of caching the failure forever
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(PAGE_STORE_NAME)) {
                    db.createObjectStore(PAGE_STORE_NAME);
                }
            };
        });

        return dbPromise;
    }

    /**
     * Get the last saved page number for a specific PDF
     * @param {string} pdfKey - Unique identifier for the PDF (URL or name)
     * @returns {Promise<number|null>} Last page number or null if not found
     */
    function getLastPage(pdfKey) {
        if (!pdfKey || typeof pdfKey !== 'string') return Promise.resolve(null);
        return initDB().then(db => {
            return new Promise((resolve) => {
                const transaction = db.transaction([PAGE_STORE_NAME], 'readonly');
                const store = transaction.objectStore(PAGE_STORE_NAME);
                const request = store.get(pdfKey);

                request.onerror = () => {
                    console.warn('Failed to retrieve page:', request.error);
                    resolve(null);
                };

                request.onsuccess = () => {
                    resolve(request.result || null);
                };
            });
        }).catch(() => {
            // Silently fail and return null if DB is unavailable
            return null;
        });
    }

    /**
     * Save the last viewed page number for a specific PDF
     * @param {string} pdfKey - Unique identifier for the PDF (URL or name)
     * @param {number} pageNum - Page number to save
     */
    function saveLastPage(pdfKey, pageNum) {
        const page = parseInt(pageNum, 10);
        if (!pdfKey || typeof pdfKey !== 'string' || !Number.isFinite(page) || page < 1) return;

        initDB().then(db => {
            const transaction = db.transaction([PAGE_STORE_NAME], 'readwrite');
            const request = transaction.objectStore(PAGE_STORE_NAME).put(page, pdfKey);
            request.onerror = () => console.warn('Failed to save page:', request.error);
        }).catch(() => {
            // Silently fail if DB is unavailable
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
