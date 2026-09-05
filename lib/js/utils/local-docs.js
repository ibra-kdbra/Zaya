/**
 * Documents the reader has opened: a recent list for links and files, and the files themselves.
 *
 * A file picked from disk only exists as a blob: URL for the life of the page, so its bytes are
 * copied into IndexedDB (as a Blob) under its filename. On the next visit the last file is reopened
 * from there, and any recent file can be reopened from the Document tab. The store keeps the most
 * recent MAX_FILES files and evicts the oldest; a file larger than MAX_FILE_BYTES is not kept.
 *
 * The recent list (links and files) lives in localStorage under `zayaRecentDocs`.
 */
(function () {
    const DB_NAME = 'ZayaLocalDocs';
    const STORE = 'files';
    const DB_VERSION = 1;
    const MAX_FILES = 6;
    const MAX_FILE_BYTES = 120 * 1024 * 1024;
    const RECENT_KEY = 'zayaRecentDocs';
    const MAX_RECENT = 8;

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => { dbPromise = null; reject(req.error); };
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'name' }).createIndex('savedAt', 'savedAt');
                }
            };
        });
        return dbPromise;
    }

    function tx(mode, fn) {
        return openDB().then((db) => new Promise((resolve, reject) => {
            const t = db.transaction([STORE], mode);
            const store = t.objectStore(STORE);
            let result;
            try { result = fn(store); } catch (err) { reject(err); return; }
            t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('aborted'));
        }));
    }

    /** Keep a copy of `file` so it can be reopened after a reload. Resolves false when it was not kept. */
    function saveFile(file) {
        if (!file || !file.name || file.size > MAX_FILE_BYTES) return Promise.resolve(false);
        const record = { name: file.name, size: file.size, type: file.type || 'application/pdf', lastModified: file.lastModified || 0, savedAt: Date.now(), blob: file };
        return tx('readwrite', (store) => { store.put(record); })
            .then(() => evictOldFiles())
            .then(() => true)
            .catch((err) => { console.warn('Could not keep the local file:', err); return false; });
    }

    function getFile(name) {
        if (!name) return Promise.resolve(null);
        return tx('readonly', (store) => store.get(name))
            .then((rec) => (rec && rec.blob ? rec : null))
            .catch(() => null);
    }

    function deleteFile(name) {
        if (!name) return Promise.resolve();
        return tx('readwrite', (store) => { store.delete(name); }).catch(() => {});
    }

    function listFiles() {
        return tx('readonly', (store) => store.getAll())
            .then((all) => (all || []).map((r) => ({ name: r.name, size: r.size, savedAt: r.savedAt })).sort((a, b) => b.savedAt - a.savedAt))
            .catch(() => []);
    }

    function evictOldFiles() {
        return listFiles().then((files) => Promise.all(files.slice(MAX_FILES).map((f) => deleteFile(f.name))));
    }

    /* ---- Recent list (links and files) ------------------------------------------------------- */

    function readRecent() {
        try {
            const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(raw) ? raw.filter((r) => r && typeof r.key === 'string' && (r.type === 'url' || r.type === 'local')) : [];
        } catch (e) { return []; }
    }

    function writeRecent(list) {
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) { /* storage unavailable */ }
        document.dispatchEvent(new CustomEvent('zaya:recentChanged'));
    }

    /**
     * Record a document as opened. `key` is the document key (URL, or filename for local files).
     * @param {{key:string, type:'url'|'local', name:string, size?:number}} entry
     */
    function touch(entry) {
        if (!entry || !entry.key) return;
        const list = readRecent().filter((r) => r.key !== entry.key);
        list.unshift({ key: entry.key, type: entry.type, name: entry.name || entry.key, size: entry.size || 0, openedAt: Date.now() });
        writeRecent(list);
    }

    function forget(key) {
        writeRecent(readRecent().filter((r) => r.key !== key));
        return deleteFile(key);
    }

    window.ZayaLocalDocs = {
        saveFile, getFile, deleteFile, listFiles,
        recent: readRecent, touch, forget,
        MAX_FILE_BYTES
    };
})();
