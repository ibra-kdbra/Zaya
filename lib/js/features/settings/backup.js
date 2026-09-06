/**
 * Backup & restore: exports every quote, the user's preferences, the recent documents list and the
 * text recognised from scanned pages as one JSON file, and imports such a file back (quotes and
 * recent entries are merged, never duplicated).
 *
 * Format 2 adds `recent` and `ocr`. Files themselves are never part of a backup: a restored file
 * entry is metadata, so it reads as "not kept" until the reader picks the file again. Recognised
 * text can be large, so it is left out (with a note in the file) beyond OCR_MAX_BYTES.
 * Format 1 files are still accepted; they simply carry neither section.
 */
import { getAllQuotes, addOrUpdateQuote, getSettings, updateSettings } from '../quotes/db.js';
import { OcrStore } from '../search/ocr.js';

const PREF_KEYS = ['theme', 'isRTL', 'mediaVolume', 'mediaLoop', 'mediaMode'];
const FORMAT = 'zaya-backup';
const FORMAT_VERSION = 2;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const OCR_MAX_BYTES = 20 * 1024 * 1024;

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

function toast(text, color) {
  if (window.Toastify) {
    const opts = { text, duration: 4000, gravity: 'bottom', position: 'right' };
    if (color) opts.backgroundColor = color;
    window.Toastify(opts).showToast();
  }
}

function collectPreferences() {
  const prefs = {};
  if (window.appState) PREF_KEYS.forEach((k) => { prefs[k] = window.appState.get(k); });
  try { prefs.bottomPanelAlwaysShown = localStorage.getItem('bottomPanelAlwaysShown') === 'true'; } catch (e) { /* storage unavailable */ }
  return prefs;
}

/** Recognised pages, unless they would make the backup unreasonably large. */
function collectOcr() {
  return OcrStore.all().then((rows) => {
    if (!rows.length) return { ocr: [], notes: [] };
    const size = JSON.stringify(rows).length;
    if (size > OCR_MAX_BYTES) {
      return { ocr: [], notes: [t('backup.ocrTooLarge', { size: Math.round(size / (1024 * 1024)) })] };
    }
    return { ocr: rows, notes: [] };
  }).catch(() => ({ ocr: [], notes: [] }));
}

export function exportBackup() {
  return new Promise((resolve) => {
    getAllQuotes((quotes) => {
      getSettings((settings) => {
        collectOcr().then(({ ocr, notes }) => {
          const payload = {
            format: FORMAT,
            version: FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            app: window.ZAYA_VERSION || null,
            preferences: collectPreferences(),
            settings: settings || null,
            recent: window.ZayaLocalDocs ? window.ZayaLocalDocs.recent() : [],
            ocr,
            notes,
            quotes: (quotes || []).map((q) => {
              const copy = { ...q };
              delete copy.id;
              return copy;
            })
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `zaya-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          const notesPart = t('backup.notesCount', { n: payload.quotes.length });
          toast(payload.ocr.length
            ? t('backup.exportedWithOcr', { notes: notesPart, pages: t('backup.pagesCount', { n: payload.ocr.length }) })
            : t('backup.exported', { notes: notesPart }));
          if (notes.length) toast(notes[0]);
          resolve(payload);
        });
      });
    });
  });
}

function validate(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT) return t('backup.notZaya');
  if (typeof data.version !== 'number' || data.version > FORMAT_VERSION) return t('backup.newerVersion');
  if (!Array.isArray(data.quotes)) return t('backup.noNotesList');
  return null;
}

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

function sanitizeQuote(q) {
  if (!q || typeof q.quote !== 'string') return null;
  const text = q.quote.replace(CONTROL_CHARS, '').trim().slice(0, 2000);
  if (text.length < 3) return null;
  return {
    quote: text,
    pdfUrl: typeof q.pdfUrl === 'string' ? q.pdfUrl.slice(0, 2048) : '',
    pdfName: typeof q.pdfName === 'string' ? q.pdfName.slice(0, 255) : '',
    pageNumber: Number.isInteger(q.pageNumber) && q.pageNumber > 0 ? q.pageNumber : null
  };
}

/** Merge the recent list from a backup. Metadata only: no file ever travels in a backup. */
function applyRecent(recent) {
  if (!Array.isArray(recent) || !window.ZayaLocalDocs) return 0;
  return window.ZayaLocalDocs.importRecent(recent.slice(0, 50));
}

/** Put recognised pages back, so a restored document does not have to be recognised again. */
function applyOcr(ocr) {
  if (!Array.isArray(ocr) || !ocr.length) return Promise.resolve(0);
  const clean = ocr.filter((r) => r && typeof r.doc === 'string' && r.doc
    && Number.isInteger(r.page) && r.page > 0 && Array.isArray(r.lines)).slice(0, 20000);
  return clean.reduce(
    (chain, r) => chain.then(() => OcrStore.save(r.doc, r.page, typeof r.lang === 'string' ? r.lang : '', r.lines)),
    Promise.resolve()
  ).then(() => clean.length).catch(() => 0);
}

function applyPreferences(prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  const updates = {};
  if (typeof prefs.isRTL === 'boolean') updates.isRTL = prefs.isRTL;
  if (typeof prefs.mediaLoop === 'boolean') updates.mediaLoop = prefs.mediaLoop;
  if (Number.isFinite(prefs.mediaVolume)) updates.mediaVolume = Math.max(0, Math.min(100, prefs.mediaVolume));
  if (prefs.mediaMode === 'youtube' || prefs.mediaMode === 'audio') updates.mediaMode = prefs.mediaMode;
  if (window.appState && Object.keys(updates).length) window.appState.set(updates);
  if (typeof prefs.theme === 'string' && window.themeManager && window.themeManager.getAllThemes().includes(prefs.theme)) {
    window.themeManager.setTheme(prefs.theme);
  }
  if (typeof prefs.bottomPanelAlwaysShown === 'boolean') {
    try { localStorage.setItem('bottomPanelAlwaysShown', String(prefs.bottomPanelAlwaysShown)); } catch (e) { /* ignore */ }
    const toggle = document.getElementById('bottomPanelAlwaysShown');
    if (toggle) {
      toggle.checked = prefs.bottomPanelAlwaysShown;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

export function importBackup(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error(t('backup.noFile')));
    if (file.size > MAX_FILE_BYTES) return reject(new Error(t('backup.tooLarge')));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('backup.unreadable')));
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { return reject(new Error(t('backup.notJson'))); }
      const problem = validate(data);
      if (problem) return reject(new Error(problem));

      getAllQuotes((existing) => {
        const seen = new Set((existing || []).map((q) => `${q.pdfUrl} ${q.quote}`));
        const incoming = data.quotes.map(sanitizeQuote).filter(Boolean).filter((q) => !seen.has(`${q.pdfUrl} ${q.quote}`));
        let done = 0;
        const finish = () => {
          applyPreferences(data.preferences);
          if (data.settings && typeof data.settings === 'object') {
            getSettings((current) => updateSettings({ ...(current || {}), ...data.settings, id: 'user_settings' }, () => {}));
          }
          const recentAdded = applyRecent(data.recent);
          applyOcr(data.ocr).then((pages) => {
            const parts = [t('backup.newNotesCount', { n: incoming.length })];
            if (recentAdded) parts.push(t('backup.recentCount', { n: recentAdded }));
            if (pages) parts.push(t('backup.pagesCount', { n: pages }));
            toast(t('backup.imported', { parts: parts.join(t('list.separator')) }));
            document.dispatchEvent(new CustomEvent('zaya:quotesChanged'));
            resolve({ imported: incoming.length, skipped: data.quotes.length - incoming.length, recent: recentAdded, ocr: pages });
          });
        };
        if (!incoming.length) return finish();
        incoming.forEach((q) => {
          addOrUpdateQuote(null, q.quote, q.pdfUrl, q.pdfName, q.pageNumber, () => {
            if (++done === incoming.length) finish();
          });
        });
      });
    };
    reader.readAsText(file);
  });
}

function wireButtons() {
  const exportBtn = document.getElementById('exportBackupBtn');
  const importBtn = document.getElementById('importBackupBtn');
  const fileInput = document.getElementById('importBackupFile');
  if (exportBtn) exportBtn.addEventListener('click', () => exportBackup());
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      importBackup(file).catch((err) => toast(err.message, '#ef4444'));
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireButtons);
else wireButtons();

window.ZayaBackup = { exportBackup, importBackup };
