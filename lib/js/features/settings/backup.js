/**
 * Backup & restore: exports every quote and the user's preferences as one JSON file,
 * and imports such a file back (quotes are merged, never duplicated).
 */
import { getAllQuotes, addOrUpdateQuote, getSettings, updateSettings } from '../quotes/db.js';

const PREF_KEYS = ['theme', 'isRTL', 'mediaVolume', 'mediaLoop', 'mediaMode'];
const FORMAT = 'zaya-backup';
const FORMAT_VERSION = 1;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

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

export function exportBackup() {
  return new Promise((resolve) => {
    getAllQuotes((quotes) => {
      getSettings((settings) => {
        const payload = {
          format: FORMAT,
          version: FORMAT_VERSION,
          exportedAt: new Date().toISOString(),
          app: window.ZAYA_VERSION || null,
          preferences: collectPreferences(),
          settings: settings || null,
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
        const n = payload.quotes.length;
        toast(`Exported ${n} quote${n === 1 ? '' : 's'} and your preferences`);
        resolve(payload);
      });
    });
  });
}

function validate(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT) return 'Not a Zaya backup file.';
  if (typeof data.version !== 'number' || data.version > FORMAT_VERSION) return 'This backup was made with a newer version of Zaya.';
  if (!Array.isArray(data.quotes)) return 'Backup contains no quotes list.';
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
    if (!file) return reject(new Error('No file selected.'));
    if (file.size > MAX_FILE_BYTES) return reject(new Error('Backup file is larger than 20 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { return reject(new Error('The file is not valid JSON.')); }
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
          toast(`Imported ${incoming.length} new quote${incoming.length === 1 ? '' : 's'}`);
          document.dispatchEvent(new CustomEvent('zaya:quotesChanged'));
          resolve({ imported: incoming.length, skipped: data.quotes.length - incoming.length });
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
