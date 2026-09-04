let db;
let dbPromiseResolve;
const dbInitializedPromise = new Promise((resolve) => {
  dbPromiseResolve = resolve;
});

// Initialize IndexedDB with enhanced schema
const request = indexedDB.open("QuotesDB", 3); // Increment version to force upgrade

request.onupgradeneeded = function(event) {
  db = event.target.result;

  // Additive migrations only: never drop stores, users' quotes must survive version bumps.
  if (!db.objectStoreNames.contains("quotes")) {
    const quotesStore = db.createObjectStore("quotes", { keyPath: "id", autoIncrement: true });
    quotesStore.createIndex("pdfUrl", "pdfUrl", { unique: false });
    quotesStore.createIndex("timestamp", "timestamp", { unique: false });
  } else {
    const quotesStore = event.target.transaction.objectStore("quotes");
    if (!quotesStore.indexNames.contains("pdfUrl")) quotesStore.createIndex("pdfUrl", "pdfUrl", { unique: false });
    if (!quotesStore.indexNames.contains("timestamp")) quotesStore.createIndex("timestamp", "timestamp", { unique: false });
  }
  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "id" });
  }
};

request.onerror = function(event) {
  console.error("QuotesDB could not be opened:", event.target.error);
  window.dbInitialized = false;
  dbPromiseResolve(null);
};

request.onblocked = function() {
  console.warn("QuotesDB upgrade blocked by another open tab. Close other Zaya tabs and reload.");
};

request.onsuccess = function(event) {
  db = event.target.result;
  // Ensure the database is ready before interacting with it
  window.dbInitialized = true;
  dbPromiseResolve(db);
  initializeDefaultSettings();
};

async function waitForDb() {
  if (window.dbInitialized && db) return db;
  return dbInitializedPromise;
}

function initializeDefaultSettings() {
  if (window.dbInitialized) {
    const transaction = db.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");

    // Set default theme if not exists
    const getThemeRequest = store.get("user_settings");
    getThemeRequest.onsuccess = function(event) {
      if (!event.target.result) {
        store.add({
          id: "user_settings",
          theme: "default",
          autoHide: true,
          volume: 50
        });
      }
    };
  }
}

export async function getAllQuotes(callback) {
  const database = await waitForDb();
  if (database) {
    const transaction = database.transaction("quotes", "readonly");
    const store = transaction.objectStore("quotes");
    const request = store.getAll();

    request.onsuccess = function(event) {
      callback(event.target.result);
    };
  } else {
    console.error("Failed to initialize database.");
    callback([]);
  }
}

export async function getQuotesByPdf(pdfUrl, callback) {
  const database = await waitForDb();
  if (database) {
    try {
      const transaction = database.transaction("quotes", "readonly");
      const store = transaction.objectStore("quotes");

      // Check if index exists
      if (store.indexNames.contains("pdfUrl")) {
        try {
          const index = store.index("pdfUrl");
          const request = index.getAll(pdfUrl);

          request.onsuccess = function(event) {
            callback(event.target.result || []);
          };

          request.onerror = function(event) {
            console.error("Index query failed, using fallback method:", event.target.error);
            fallbackGetQuotesByPdf(pdfUrl, callback);
          };
        } catch (indexError) {
          console.error("Index access failed, using fallback:", indexError);
          fallbackGetQuotesByPdf(pdfUrl, callback);
        }
      } else {
        // console.log("Index not found, using fallback method");
        fallbackGetQuotesByPdf(pdfUrl, callback);
      }
    } catch (error) {
      console.error("Database transaction error:", error);
      callback([]);
    }
  } else {
    console.error("Failed to initialize database.");
    callback([]);
  }
}

function fallbackGetQuotesByPdf(pdfUrl, callback) {
  // Fallback method: get all quotes and filter manually
  try {
    const transaction = db.transaction("quotes", "readonly");
    const store = transaction.objectStore("quotes");
    const request = store.getAll();

    request.onsuccess = function(event) {
      const allQuotes = event.target.result || [];
      const filteredQuotes = allQuotes.filter(quote => quote.pdfUrl === pdfUrl);
      // console.log(`Fallback: Found ${filteredQuotes.length} quotes for PDF: ${pdfUrl}`);
      callback(filteredQuotes);
    };

    request.onerror = function(event) {
      console.error("Fallback query also failed:", event.target.error);
      callback([]);
    };
  } catch (error) {
    console.error("Fallback method error:", error);
    callback([]);
  }
}

export async function addOrUpdateQuote(id, quote, pdfUrl = null, pdfName = null, pageNumber = null, callback) {
  const database = await waitForDb();
  if (database) {
    const transaction = database.transaction("quotes", "readwrite");
    const store = transaction.objectStore("quotes");

    const quoteData = {
      quote,
      pdfUrl: pdfUrl || '',
      pdfName: pdfName || pdfUrl || '',
      timestamp: new Date().toISOString(),
      pageNumber: pageNumber || null
    };

    if (id) {
      // Editing only replaces the text: the document, page and original timestamp are kept,
      // so a quote does not silently move to whatever document happens to be open.
      const existing = store.get(id);
      existing.onsuccess = function() {
        const prev = existing.result;
        store.put(prev ? { ...prev, id, quote } : { ...quoteData, id });
      };
      existing.onerror = function() {
        store.put({ ...quoteData, id });
      };
    } else {
      store.add(quoteData);
    }

    transaction.oncomplete = function() {
      // console.log("Quote saved successfully:", quoteData);
      if (callback) callback();
    };

    transaction.onerror = function(event) {
      console.error("Error saving quote:", event.target.error);
      if (callback) callback();
    };
  } else {
    console.error("Failed to initialize database.");
    if (callback) callback();
  }
}

export async function deleteQuote(id, callback) {
  const database = await waitForDb();
  if (database) {
    const transaction = database.transaction("quotes", "readwrite");
    const store = transaction.objectStore("quotes");

    const req = store.delete(id);
    req.onsuccess = function() {
      callback();
    };
    req.onerror = function(event) {
      console.error("Failed to delete quote:", event.target.error);
      callback(event.target.error);
    };
  } else {
    console.error("Failed to initialize database.");
  }
}

export async function getQuoteById(id, callback) {
  const database = await waitForDb();
  if (database) {
    try {
      const transaction = database.transaction("quotes", "readonly");
      const store = transaction.objectStore("quotes");
      const request = store.get(id);

      request.onsuccess = function(event) {
        callback(event.target.result);
      };

      request.onerror = function(event) {
        console.error("Error retrieving quote by ID:", event.target.error);
        callback(null);
      };
    } catch (error) {
      console.error("Database transaction error:", error);
      callback(null);
    }
  } else {
    console.error("Failed to initialize database.");
    callback(null);
  }
}

export async function getSettings(callback) {
  const database = await waitForDb();
  if (database) {
    const transaction = database.transaction("settings", "readonly");
    const store = transaction.objectStore("settings");
    const request = store.get("user_settings");

    request.onsuccess = function(event) {
      callback(event.target.result || { theme: "default", autoHide: true, volume: 50 });
    };
  } else {
    console.error("Failed to initialize database.");
  }
}

export async function updateSettings(settings, callback) {
  const database = await waitForDb();
  if (database) {
    const transaction = database.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");

    settings.id = "user_settings";
    store.put(settings);

    transaction.oncomplete = function() {
      callback();
    };
  } else {
    console.error("Failed to initialize database.");
  }
}
