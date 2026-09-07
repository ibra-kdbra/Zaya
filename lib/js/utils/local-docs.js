/**
 * Documents the reader has opened: a recent list for links and files, and the files themselves.
 *
 * A file picked from disk only exists as a blob: URL for the life of the page, so its bytes are
 * copied into the shared `Zaya` database (as a Blob) under its document key — its name and its
 * size, so two different files that share a name are two documents (see lib/js/utils/pageMemory.js
 * and docs/ARCHITECTURE.md). On the next visit the last
 * file is reopened from there, and any recent file can be reopened from the Document tab. The store
 * keeps the most recent MAX_FILES files and evicts the oldest; a file larger than MAX_FILE_BYTES,
 * or one that would not fit in the space the browser allows, is not kept.
 *
 * The recent list (links and files) lives in localStorage under `zayaRecentDocs`.
 */
(function () {
    const STORE = 'files';
    const MAX_FILES = 6;
    const MAX_FILE_BYTES = 120 * 1024 * 1024;
    const RECENT_KEY = 'zayaRecentDocs';
    const MAX_RECENT = 8;

    const db = () => window.ZayaDB || null;

    function toast(text, color) {
        if (!window.Toastify) return;
        const opts = { text, duration: 6000, gravity: 'bottom', position: 'right' };
        if (color) opts.backgroundColor = color;
        window.Toastify(opts).showToast();
    }

    /**
     * Keep a copy of `file` so it can be reopened after a reload.
     * Resolves false when it was not kept: too large, no space left, or no database. The
     * out-of-space case explains itself with a toast, since the caller cannot tell the two apart.
     * @param {File} file
     * @returns {Promise<boolean>}
     */
    function saveFile(file) {
        if (!file || !file.name || file.size > MAX_FILE_BYTES || !db()) return Promise.resolve(false);
        const record = {
            name: keyOf(file),
            label: file.name,
            size: file.size,
            type: file.type || 'application/pdf',
            lastModified: file.lastModified || 0,
            savedAt: Date.now(),
            blob: file
        };
        return db().hasRoomFor(file.size).then((room) => {
            if (!room) {
                toast('Not enough space in this browser to keep this file for next time; it opens normally but you will need to pick it again.');
                return false;
            }
            return db().put(STORE, record, undefined, 'this file')
                .then(() => evictOldFiles())
                .then(() => true);
        }).catch((err) => {
            if (!db().isQuotaError(err)) console.warn('Could not keep the local file:', err);
            return false;
        });
    }

    function getFile(name) {
        if (!name || !db()) return Promise.resolve(null);
        return db().get(STORE, name)
            .then((rec) => (rec && rec.blob ? rec : null))
            .catch(() => null);
    }

    function deleteFile(name) {
        if (!name || !db()) return Promise.resolve();
        return db().del(STORE, name).catch(() => {});
    }

    /** Stored copies, newest first, without their blobs. `name` is the document key. */
    function listFiles() {
        if (!db()) return Promise.resolve([]);
        return db().getAll(STORE)
            .then((all) => (all || []).map((r) => ({ name: r.name, label: r.label || r.name, size: r.size, savedAt: r.savedAt })).sort((a, b) => b.savedAt - a.savedAt))
            .catch(() => []);
    }

    /** The document key of a file picked from disk. */
    function keyOf(file) {
        return window.ZayaLocalDocKey ? window.ZayaLocalDocKey(file.name, file.size) : file.name;
    }

    /**
     * Move everything a file was filed under to the key it has now.
     *
     * Before this release a file was keyed by its bare name, so two files called `notes.pdf` shared
     * a page, a note list and their recognised text. The key is now the name and the size; the
     * first time such a file is opened again its old records are moved across — the remembered
     * page, its notes, its recognised text, the stored copy, the recent entry and what the document
     * remembers about page mode and soundtrack. Records already under the new key are left alone.
     *
     * @param {string} oldKey
     * @param {string} newKey
     * @returns {Promise<boolean>} whether anything moved
     */
    function migrateDocKey(oldKey, newKey) {
        if (!oldKey || !newKey || oldKey === newKey || !db()) return Promise.resolve(false);
        const store = db();
        let moved = false;

        const pages = store.get('pages', oldKey).then((page) => {
            if (!Number.isFinite(page)) return null;
            moved = true;
            return store.get('pages', newKey)
                .then((have) => (Number.isFinite(have) ? null : store.put('pages', page, newKey, 'the page you are on')))
                .then(() => store.del('pages', oldKey));
        });

        const quotes = store.byIndex('quotes', 'pdfUrl', oldKey).then((rows) => (rows || []).reduce(
            (chain, q) => chain.then(() => { moved = true; return store.put('quotes', { ...q, pdfUrl: newKey }, undefined, 'this note'); }),
            Promise.resolve()
        ));

        const ocr = store.byIndex('ocr', 'doc', oldKey).then((rows) => (rows || []).reduce(
            (chain, r) => chain.then(() => {
                moved = true;
                return store.put('ocr', { ...r, id: `${newKey} ${r.page}`, doc: newKey }, undefined, 'the recognised text')
                    .then(() => store.del('ocr', r.id));
            }),
            Promise.resolve()
        ));

        const files = store.get(STORE, oldKey).then((rec) => {
            if (!rec) return null;
            moved = true;
            return store.put(STORE, { ...rec, name: newKey, label: rec.label || oldKey }, undefined, 'this file')
                .then(() => store.del(STORE, oldKey));
        });

        const prefsId = window.ZayaDocPrefs ? window.ZayaDocPrefs.PREFIX : 'doc ';
        const prefs = store.get('settings', prefsId + oldKey).then((rec) => {
            if (!rec) return null;
            moved = true;
            return store.put('settings', { ...rec, id: prefsId + newKey })
                .then(() => store.del('settings', prefsId + oldKey));
        });

        return Promise.all([pages, quotes, ocr, files, prefs])
            .then(() => {
                const list = readRecent();
                const older = list.filter((r) => r.key === oldKey);
                if (older.length) {
                    moved = true;
                    const seen = list.some((r) => r.key === newKey);
                    writeRecent(list
                        .filter((r) => r.key !== oldKey || !seen)
                        .map((r) => (r.key === oldKey ? { ...r, key: newKey } : r)));
                }
                if (moved) document.dispatchEvent(new CustomEvent('zaya:quotesChanged'));
                return moved;
            })
            .catch(() => false);
    }

    /**
     * The document key for `file`, having moved anything the same file was filed under before.
     * @param {File} file
     * @returns {Promise<string>}
     */
    function adopt(file) {
        const key = keyOf(file);
        if (!file || !file.name || key === file.name) return Promise.resolve(key);
        return migrateDocKey(file.name, key).then(() => key);
    }

    function evictOldFiles() {
        return listFiles().then((files) => Promise.all(files.slice(MAX_FILES).map((f) => deleteFile(f.name))));
    }

    /**
     * Drop every stored file copy, and recognised text for documents no longer in the recent list.
     * The recent entries and their remembered pages are untouched.
     * @returns {Promise<{files:number, bytes:number, ocrPages:number}>}
     */
    function freeUpSpace() {
        if (!db()) return Promise.resolve({ files: 0, bytes: 0, ocrPages: 0 });
        return db().freeUpSpace(readRecent().map((r) => r.key))
            .then((result) => { document.dispatchEvent(new CustomEvent('zaya:recentChanged')); return result; })
            .catch(() => ({ files: 0, bytes: 0, ocrPages: 0 }));
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

    /**
     * Merge restored entries (from a backup) into the recent list. Metadata only: a stored copy of
     * a file is never part of a backup, so a restored file entry reads as "not kept".
     * @param {Array<{key:string,type:string,name?:string,size?:number,openedAt?:number}>} entries
     * @returns {number} how many entries were new
     */
    function importRecent(entries) {
        if (!Array.isArray(entries)) return 0;
        const current = readRecent();
        const seen = new Set(current.map((r) => r.key));
        const clean = entries
            .filter((e) => e && typeof e.key === 'string' && e.key && (e.type === 'url' || e.type === 'local'))
            .filter((e) => !seen.has(e.key))
            .map((e) => ({
                key: e.key.slice(0, 2048),
                type: e.type,
                name: typeof e.name === 'string' ? e.name.slice(0, 255) : e.key,
                size: Number.isFinite(e.size) ? e.size : 0,
                openedAt: Number.isFinite(e.openedAt) ? e.openedAt : Date.now()
            }));
        if (!clean.length) return 0;
        writeRecent(current.concat(clean).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0)));
        return clean.length;
    }

    window.ZayaLocalDocs = {
        saveFile, getFile, deleteFile, listFiles, freeUpSpace, keyOf, adopt, migrateDocKey,
        recent: readRecent, touch, forget, importRecent,
        MAX_FILE_BYTES
    };
})();
