/**
 * Quotes and the reader's stored settings.
 *
 * Both live in the shared `Zaya` database (`window.ZayaDB`, see lib/js/utils/idb.js): the `quotes`
 * store keyed by an auto-incrementing id with a `pdfUrl` index, and one `user_settings` record in
 * the `settings` store. The callback-style API below is unchanged, so quotes/main.js, quotes/ui.js,
 * the theme manager and backup.js keep working as they did.
 */

const QUOTES = 'quotes';
const SETTINGS = 'settings';
const SETTINGS_ID = 'user_settings';
const DEFAULT_SETTINGS = { id: SETTINGS_ID, theme: 'default', autoHide: true, volume: 50 };

function store() {
  return window.ZayaDB || null;
}

/** Resolves the shared database, or null when this browser will not give us one. */
function waitForDb() {
  const db = store();
  if (!db) {
    window.dbInitialized = false;
    return Promise.resolve(null);
  }
  return db.open().then((handle) => {
    window.dbInitialized = true;
    return handle;
  }).catch((err) => {
    console.error('The Zaya database could not be opened:', err);
    window.dbInitialized = false;
    return null;
  });
}

/** Write the default settings once, the first time this browser runs Zaya. */
function initializeDefaultSettings() {
  return waitForDb().then((db) => {
    if (!db) return;
    return store().get(SETTINGS, SETTINGS_ID).then((existing) => {
      if (!existing) return store().put(SETTINGS, { ...DEFAULT_SETTINGS }, undefined, 'your settings');
    });
  }).catch(() => {});
}

initializeDefaultSettings();

/** A write that never leaves an unhandled rejection behind; quota problems raise one toast. */
function quiet(promise, what) {
  return promise.catch((err) => {
    const db = store();
    if (!db || !db.isQuotaError(err)) console.error(`Could not save ${what}:`, err);
    return null;
  });
}

export async function getAllQuotes(callback) {
  const db = await waitForDb();
  if (!db) return callback([]);
  try {
    callback(await store().getAll(QUOTES));
  } catch (err) {
    console.error('Could not read the quotes:', err);
    callback([]);
  }
}

export async function getQuotesByPdf(pdfUrl, callback) {
  const db = await waitForDb();
  if (!db) return callback([]);
  try {
    callback(await store().byIndex(QUOTES, 'pdfUrl', pdfUrl));
  } catch (err) {
    // The index is created with the store, so this only happens on a damaged database: read all.
    console.error('Index query failed, using fallback method:', err);
    try {
      const all = await store().getAll(QUOTES);
      callback(all.filter((q) => q.pdfUrl === pdfUrl));
    } catch (e) {
      callback([]);
    }
  }
}

export async function addOrUpdateQuote(id, quote, pdfUrl = null, pdfName = null, pageNumber = null, callback) {
  const db = await waitForDb();
  const done = () => { if (callback) callback(); };
  if (!db) return done();

  const quoteData = {
    quote,
    pdfUrl: pdfUrl || '',
    pdfName: pdfName || pdfUrl || '',
    timestamp: new Date().toISOString(),
    pageNumber: pageNumber || null
  };

  if (!id) {
    await quiet(store().add(QUOTES, quoteData, 'this quote'), 'the quote');
    return done();
  }

  // Editing only replaces the text: the document, page and original timestamp are kept,
  // so a quote does not silently move to whatever document happens to be open.
  let previous = null;
  try { previous = await store().get(QUOTES, id); } catch (e) { previous = null; }
  await quiet(store().put(QUOTES, previous ? { ...previous, id, quote } : { ...quoteData, id }, undefined, 'this quote'), 'the quote');
  done();
}

export async function deleteQuote(id, callback) {
  const db = await waitForDb();
  if (!db) return;
  try {
    await store().del(QUOTES, id);
    callback();
  } catch (err) {
    console.error('Failed to delete quote:', err);
    callback(err);
  }
}

export async function getQuoteById(id, callback) {
  const db = await waitForDb();
  if (!db) return callback(null);
  try {
    callback(await store().get(QUOTES, id));
  } catch (err) {
    console.error('Error retrieving quote by ID:', err);
    callback(null);
  }
}

export async function getSettings(callback) {
  const db = await waitForDb();
  if (!db) return callback({ ...DEFAULT_SETTINGS });
  try {
    callback((await store().get(SETTINGS, SETTINGS_ID)) || { ...DEFAULT_SETTINGS });
  } catch (err) {
    callback({ ...DEFAULT_SETTINGS });
  }
}

export async function updateSettings(settings, callback) {
  const db = await waitForDb();
  if (!db) return callback && callback();
  settings.id = SETTINGS_ID;
  await quiet(store().put(SETTINGS, settings, undefined, 'your settings'), 'your settings');
  if (callback) callback();
}
