(function() {
    // Page persistence: the last page read of every document, in the shared `Zaya` database.
    const STORE = 'pages';
    const SETTINGS = 'settings';

    // A file picked from disk is keyed by its name and its size, joined by this separator, so two
    // different files that happen to share a name keep their own notes, pages and recognised text.
    const LOCAL_SEP = '::';

    // Parameters that identify a campaign rather than a document; two links that differ only in
    // these are the same book, so they are dropped before a URL becomes a key.
    const TRACKING = /^(utm_[a-z_]+|gclid|dclid|fbclid|mc_cid|mc_eid|igshid|ref|ref_src|si|yclid|_ga)$/i;

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
     * A link, with everything that does not name the document taken off: the `#fragment` (which
     * only says where in a page to look) and the tracking parameters above. Anything that will not
     * parse as a URL keeps its text, minus the fragment.
     * @param {string} raw
     * @returns {string}
     */
    function normaliseUrl(raw) {
        const text = String(raw || '');
        if (!text) return '';
        let url;
        try { url = new URL(text, document.baseURI); } catch (e) { return text.split('#')[0]; }
        url.hash = '';
        const params = url.searchParams;
        const drop = Array.from(params.keys()).filter((k) => TRACKING.test(k));
        if (drop.length) {
            drop.forEach((k) => params.delete(k));
            const rest = params.toString();
            url.search = rest ? '?' + rest : '';
        }
        return url.href;
    }

    /**
     * The single identity a document is filed under, everywhere: page memory, notes, recognised
     * text, the stored copy of a file, the recent list and the per-document preferences.
     *
     *   a link   the URL with its `#fragment` and tracking parameters removed
     *   a file   `"<filename>::<size in bytes>"` — two files of the same name stay apart
     *
     * A file whose size is not known (a profile written before this release, or a restored backup)
     * keeps the bare filename as its key; the records move to the new key the first time that file
     * is opened from disk again. See docs/ARCHITECTURE.md.
     *
     * @param {string} pdfUrl
     * @param {string} pdfType - 'local' or 'url'
     * @param {string} pdfName
     * @param {number} [pdfSize] - the file's size in bytes, for a local file
     * @returns {string}
     */
    function documentKey(pdfUrl, pdfType, pdfName, pdfSize) {
        const isLocal = pdfType === 'local' || (typeof pdfUrl === 'string' && pdfUrl.startsWith('blob:'));
        if (isLocal) {
            const name = pdfName || '';
            if (!name) return pdfUrl || '';
            return localKey(name, pdfSize);
        }
        return normaliseUrl(pdfUrl || '');
    }

    /** The key a file of this name and size is filed under; the bare name when the size is unknown. */
    function localKey(name, size) {
        const bytes = Number(size);
        if (!name) return '';
        return Number.isFinite(bytes) && bytes > 0 ? name + LOCAL_SEP + bytes : String(name);
    }

    /** documentKey() for whatever AppState currently holds. */
    function currentDocumentKey() {
        if (!window.appState) return '';
        return documentKey(
            window.appState.get('currentPdf'),
            window.appState.get('currentPdfType'),
            window.appState.get('currentPdfName'),
            window.appState.get('currentPdfSize')
        );
    }

    /* ---- Per-document preferences ------------------------------------------------------------ */

    /**
     * Small things a document remembers besides its page: the page-mode override the reader chose
     * for it and the media source it was last read with. One record per document in the `settings`
     * store, `id` = `"doc <document key>"`, so it travels with the rest of the reader's data.
     */
    const DOC_PREFIX = 'doc ';

    function getDocPrefs(key) {
        if (!key || !db()) return Promise.resolve(null);
        return db().get(SETTINGS, DOC_PREFIX + key).then((rec) => rec || null).catch(() => null);
    }

    function setDocPrefs(key, patch) {
        if (!key || !patch || !db()) return Promise.resolve();
        return getDocPrefs(key).then((existing) => db().put(SETTINGS,
            { ...(existing || {}), ...patch, id: DOC_PREFIX + key }, undefined, 'what this document remembers'))
            .catch(() => {});
    }

    // Attach to window for global access
    window.getLastPage = getLastPage;
    window.saveLastPage = saveLastPage;
    window.ZayaDocKey = documentKey;
    window.ZayaLocalDocKey = localKey;
    window.ZayaCurrentDocKey = currentDocumentKey;
    window.ZayaDocPrefs = { get: getDocPrefs, set: setDocPrefs, PREFIX: DOC_PREFIX };
})();
