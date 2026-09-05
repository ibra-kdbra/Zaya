/**
 * One database for everything Zaya keeps on the device.
 *
 * Zaya used to open four IndexedDB databases through four hand-written copies of the same
 * boilerplate: page memory, quotes, local files and recognised text. They are now object stores in
 * a single database, `Zaya`, opened once and shared by every module through `window.ZayaDB`.
 *
 * The first time this runs, records from the four older databases are copied across and the old
 * databases are deleted. The copy is keyed, so running it again changes nothing; a database that is
 * missing, or held open by another tab, is skipped and tried again on the next visit.
 *
 * Every write also watches for the browser refusing to store more: a quota failure is reported once
 * as a toast instead of surfacing as an unhandled rejection.
 */
(function () {
    const DB_NAME = 'Zaya';
    const DB_VERSION = 1;

    const STORES = {
        pages: 'pages',       // last read page, keyed by document key (out-of-line keys)
        quotes: 'quotes',     // keyPath id (autoIncrement), index pdfUrl
        settings: 'settings', // keyPath id
        files: 'files',       // keyPath name, index savedAt
        ocr: 'ocr'            // keyPath id ("<doc> <page>"), index doc
    };
    const ALL_STORES = Object.keys(STORES);

    const MIGRATION_ID = '_zayaMigration';
    const LEGACY_TIMEOUT = 4000;

    // Older databases, in the shape they had before the merge.
    const LEGACY = [
        { db: 'FlipBookPageMemory', copies: [{ from: 'pages', to: 'pages', outOfLine: true }] },
        { db: 'QuotesDB', copies: [{ from: 'quotes', to: 'quotes' }, { from: 'settings', to: 'settings' }] },
        { db: 'ZayaLocalDocs', copies: [{ from: 'files', to: 'files' }] },
        { db: 'ZayaOcr', copies: [{ from: 'pages', to: 'ocr' }] }
    ];

    /* ---- Promise wrappers ------------------------------------------------------------------- */

    function isQuotaError(err) {
        if (!err) return false;
        return err.name === 'QuotaExceededError' || err.code === 22 || /quota/i.test(err.message || '');
    }

    let lastQuotaToast = 0;
    /** One toast, however many writes failed at once. */
    function reportQuota(what) {
        const now = Date.now();
        if (now - lastQuotaToast < 10000) return;
        lastQuotaToast = now;
        const text = `There is no room left in this browser to save ${what}. Use "Free up space" under Recent to make some.`;
        if (window.Toastify) {
            window.Toastify({ text, duration: 6000, gravity: 'bottom', position: 'right', backgroundColor: '#ef4444' }).showToast();
        } else {
            console.warn(text);
        }
    }

    /* ---- Opening and migration --------------------------------------------------------------- */

    let dbPromise = null;

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onblocked = () => console.warn('Zaya database upgrade is blocked by another open tab.');
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORES.pages)) db.createObjectStore(STORES.pages);
                if (!db.objectStoreNames.contains(STORES.quotes)) {
                    const quotes = db.createObjectStore(STORES.quotes, { keyPath: 'id', autoIncrement: true });
                    quotes.createIndex('pdfUrl', 'pdfUrl', { unique: false });
                    quotes.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORES.files)) {
                    db.createObjectStore(STORES.files, { keyPath: 'name' }).createIndex('savedAt', 'savedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORES.ocr)) {
                    db.createObjectStore(STORES.ocr, { keyPath: 'id' }).createIndex('doc', 'doc', { unique: false });
                }
            };
        });
    }

    /** Open a legacy database only if it is really there. Resolves null when it is not, or is busy. */
    function openLegacy(name) {
        return new Promise((resolve) => {
            let settled = false;
            let fresh = false;
            const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
            const timer = setTimeout(() => finish(null), LEGACY_TIMEOUT);
            let req;
            try { req = indexedDB.open(name); } catch (e) { clearTimeout(timer); return finish(null); }
            req.onupgradeneeded = () => { fresh = true; }; // it did not exist; this call has just made it
            req.onerror = () => { clearTimeout(timer); finish(null); };
            req.onblocked = () => { clearTimeout(timer); finish(null); };
            req.onsuccess = () => {
                clearTimeout(timer);
                const db = req.result;
                if (settled) { db.close(); return; }
                if (fresh || db.objectStoreNames.length === 0) {
                    db.close();
                    try { indexedDB.deleteDatabase(name); } catch (e) { /* nothing to remove */ }
                    return finish(null);
                }
                finish(db);
            };
        });
    }

    function dropDatabase(name) {
        return new Promise((resolve) => {
            let done = false;
            const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
            const timer = setTimeout(() => finish(false), LEGACY_TIMEOUT);
            let req;
            try { req = indexedDB.deleteDatabase(name); } catch (e) { clearTimeout(timer); return finish(false); }
            req.onsuccess = () => { clearTimeout(timer); finish(true); };
            req.onerror = () => { clearTimeout(timer); finish(false); };
            req.onblocked = () => { clearTimeout(timer); finish(false); };
        });
    }

    /** Every record of one legacy store, with its key when the store used out-of-line keys. */
    function readLegacyStore(db, storeName, outOfLine) {
        if (!db.objectStoreNames.contains(storeName)) return Promise.resolve([]);
        return new Promise((resolve, reject) => {
            const rows = [];
            const t = db.transaction([storeName], 'readonly');
            const req = t.objectStore(storeName).openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return;
                rows.push(outOfLine ? { key: cursor.key, value: cursor.value } : { value: cursor.value });
                cursor.continue();
            };
            t.oncomplete = () => resolve(rows);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('aborted'));
        });
    }

    /** Which legacy databases exist, when the browser can tell us without opening them. */
    function knownDatabaseNames() {
        if (!indexedDB.databases) return Promise.resolve(null);
        return indexedDB.databases()
            .then((list) => (Array.isArray(list) ? list.map((d) => d && d.name).filter(Boolean) : null))
            .catch(() => null);
    }

    function migrateLegacy(db) {
        return knownDatabaseNames().then((names) => {
            const pending = names ? LEGACY.filter((l) => names.indexOf(l.db) !== -1) : LEGACY.slice();
            if (!pending.length) return true;
            return pending.reduce((chain, legacy) => chain.then((ok) => migrateOne(db, legacy).then((one) => ok && one)), Promise.resolve(true));
        });
    }

    function migrateOne(db, legacy) {
        return openLegacy(legacy.db).then((old) => {
            if (!old) return true; // absent, or another tab is holding it: nothing to do this visit
            return Promise.all(legacy.copies.map((c) => readLegacyStore(old, c.from, c.outOfLine).then((rows) => ({ c, rows }))))
                .then((sets) => new Promise((resolve, reject) => {
                    const targets = sets.map((s) => s.c.to).filter((v, i, a) => a.indexOf(v) === i);
                    if (!targets.length) return resolve();
                    const t = db.transaction(targets, 'readwrite');
                    sets.forEach(({ c, rows }) => {
                        const store = t.objectStore(c.to);
                        rows.forEach((row) => {
                            try { c.outOfLine ? store.put(row.value, row.key) : store.put(row.value); } catch (e) { /* skip an unusable record */ }
                        });
                    });
                    t.oncomplete = resolve;
                    t.onerror = () => reject(t.error);
                    t.onabort = () => reject(t.error || new Error('aborted'));
                }))
                .then(() => { old.close(); return dropDatabase(legacy.db); })
                .catch((err) => { try { old.close(); } catch (e) { /* already closed */ } throw err; });
        });
    }

    function markMigrated(db) {
        return new Promise((resolve) => {
            const t = db.transaction([STORES.settings], 'readwrite');
            t.objectStore(STORES.settings).put({ id: MIGRATION_ID, legacyImported: true, at: Date.now() });
            t.oncomplete = resolve;
            t.onerror = resolve;
            t.onabort = resolve;
        });
    }

    function alreadyMigrated(db) {
        return new Promise((resolve) => {
            const t = db.transaction([STORES.settings], 'readonly');
            const req = t.objectStore(STORES.settings).get(MIGRATION_ID);
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
            t.onabort = () => resolve(false);
        });
    }

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = openDatabase()
            .then((db) => alreadyMigrated(db).then((done) => {
                if (done) return db;
                return migrateLegacy(db)
                    .then((complete) => (complete ? markMigrated(db) : null))
                    .catch((err) => { console.warn('Could not import data from the older Zaya databases:', err); })
                    .then(() => db);
            }))
            .catch((err) => { dbPromise = null; throw err; });
        return dbPromise;
    }

    /* ---- Small helpers ----------------------------------------------------------------------- */

    /**
     * Run `fn(store)` (or `fn(store, transaction)` for several stores) in one transaction.
     * Resolves with the request's result once the transaction commits.
     * @param {string|string[]} names
     * @param {'readonly'|'readwrite'} mode
     * @param {(store: IDBObjectStore, tx: IDBTransaction) => any} fn
     */
    function run(names, mode, fn) {
        const list = Array.isArray(names) ? names : [names];
        return open().then((db) => new Promise((resolve, reject) => {
            const t = db.transaction(list, mode);
            let out;
            try { out = fn(t.objectStore(list[0]), t); } catch (err) { reject(err); return; }
            t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('aborted'));
        }));
    }

    /** A write that turns a full-storage failure into one toast rather than a broken promise. */
    function guardedWrite(what, names, fn) {
        return run(names, 'readwrite', fn).catch((err) => {
            if (isQuotaError(err)) { reportQuota(what); throw err; }
            throw err;
        });
    }

    const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
    const getAll = (store, query, count) => run(store, 'readonly', (s) => s.getAll(query, count)).then((r) => r || []);
    const getAllKeys = (store) => run(store, 'readonly', (s) => s.getAllKeys()).then((r) => r || []);
    const put = (store, value, key, what) => guardedWrite(what || 'this', store, (s) => (key === undefined ? s.put(value) : s.put(value, key)));
    const add = (store, value, what) => guardedWrite(what || 'this', store, (s) => s.add(value));
    const del = (store, key) => guardedWrite('this', store, (s) => s.delete(key));
    const clear = (store) => guardedWrite('this', store, (s) => s.clear());
    const byIndex = (store, index, key) => run(store, 'readonly', (s) => s.index(index).getAll(key)).then((r) => r || []);

    /** Delete every record an index points at, with a cursor (no getAll of the values first). */
    function deleteByIndex(store, index, key) {
        return guardedWrite('this', store, (s) => {
            const req = s.index(index).openCursor(IDBKeyRange.only(key));
            req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
            return null;
        });
    }

    /** Walk one index and delete the records `keep(record)` rejects. Resolves with how many went. */
    function deleteWhere(store, index, keep) {
        let removed = 0;
        return guardedWrite('this', store, (s) => {
            const source = index ? s.index(index) : s;
            const req = source.openCursor();
            req.onsuccess = () => {
                const c = req.result;
                if (!c) return;
                if (!keep(c.value)) { c.delete(); removed++; }
                c.continue();
            };
            return null;
        }).then(() => removed);
    }

    /* ---- Storage quota ----------------------------------------------------------------------- */

    /**
     * How much the origin is using and may use.
     * @returns {Promise<{supported:boolean, usage:number, quota:number, available:number}>}
     */
    function estimate() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return Promise.resolve({ supported: false, usage: 0, quota: 0, available: Infinity });
        }
        return navigator.storage.estimate().then((e) => {
            const usage = Number(e && e.usage) || 0;
            const quota = Number(e && e.quota) || 0;
            return { supported: quota > 0, usage, quota, available: Math.max(0, quota - usage) };
        }).catch(() => ({ supported: false, usage: 0, quota: 0, available: Infinity }));
    }

    /** Keep a little headroom: a store that is exactly full fails on the next small write. */
    const QUOTA_HEADROOM = 8 * 1024 * 1024;

    /** True when `bytes` still fit, or when the browser will not say. */
    function hasRoomFor(bytes) {
        const size = Number(bytes) || 0;
        return estimate().then((e) => (!e.supported ? true : size + QUOTA_HEADROOM <= e.available));
    }

    /**
     * Drop the space the reader can spare: every stored file copy (the recent entries and their
     * remembered pages stay), and recognised text for documents that are no longer in `keepDocs`.
     * @param {string[]} keepDocs document keys whose recognised text is kept
     * @returns {Promise<{files:number, bytes:number, ocrPages:number}>}
     */
    function freeUpSpace(keepDocs) {
        const keep = new Set(Array.isArray(keepDocs) ? keepDocs : []);
        return getAll(STORES.files)
            .then((files) => {
                const bytes = files.reduce((sum, f) => sum + (Number(f && f.size) || 0), 0);
                return clear(STORES.files).then(() => ({ files: files.length, bytes }));
            })
            .catch(() => ({ files: 0, bytes: 0 }))
            .then((filesResult) => deleteWhere(STORES.ocr, null, (row) => keep.has(row && row.doc))
                .catch(() => 0)
                .then((ocrPages) => ({ ...filesResult, ocrPages })));
    }

    const ZayaDB = {
        NAME: DB_NAME,
        VERSION: DB_VERSION,
        STORES,
        ALL_STORES,
        open,
        run,
        get,
        getAll,
        getAllKeys,
        put,
        add,
        del,
        clear,
        byIndex,
        deleteByIndex,
        deleteWhere,
        isQuotaError,
        reportQuota,
        estimate,
        hasRoomFor,
        freeUpSpace,
        QUOTA_HEADROOM
    };

    window.ZayaDB = ZayaDB;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZayaDB;
})();
