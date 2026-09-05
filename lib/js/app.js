// Main entry point
// Loads all scripts in dependency order. Load order is the only thing this file owns.

// Bump on every release: it versions the static asset URLs (cache busting) and is shown in the UI.
const ZAYA_VERSION = '6.0.0';
window.ZAYA_VERSION = ZAYA_VERSION;

// Deploy guard: the HTML carries the release it was built with. If this script belongs to another
// release we were served from a stale cache; drop every cache and reload once so HTML and JS match.
(function guardStaleBuild() {
    const htmlVersion = document.documentElement.getAttribute('data-zaya-version');
    if (!htmlVersion || htmlVersion === ZAYA_VERSION) return;
    let attempted = false;
    try { attempted = sessionStorage.getItem('zaya:reloaded-for') === htmlVersion; } catch (e) { /* ignore */ }
    if (attempted) return;
    try { sessionStorage.setItem('zaya:reloaded-for', htmlVersion); } catch (e) { /* ignore */ }
    const purge = ('caches' in window) ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) : Promise.resolve();
    const unregister = ('serviceWorker' in navigator)
        ? navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())))
        : Promise.resolve();
    Promise.all([purge, unregister]).catch(() => {}).then(() => window.location.reload());
    throw new Error(`Zaya ${ZAYA_VERSION} script served for ${htmlVersion} markup; reloading`);
})();

const MODULES = new Set([
    'lib/js/core/dflip/index.js',
    'lib/js/features/themes/manager.js',
    'lib/js/features/themes/selector.js',
    'lib/js/features/quotes/main.js',
    'lib/js/features/quotes/ui.js',
    'lib/js/features/settings/backup.js'
]);

function loadScript(src, { module = MODULES.has(src), integrity = null, versioned = true } = {}) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (versioned && !/^https?:/i.test(src)) {
            script.src = `${src}${src.includes('?') ? '&' : '?'}v=${ZAYA_VERSION}`;
        } else {
            script.src = src;
        }
        script.async = false; // preserves execution order while still fetching in parallel
        if (module) script.type = 'module';
        if (integrity) {
            script.integrity = integrity;
            script.crossOrigin = 'anonymous';
        }
        script.onload = () => resolve(src);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

// Scripts are appended in order with async=false, so the browser fetches them in parallel
// but executes them sequentially. We only await the whole batch.
function loadInOrder(list) {
    return Promise.all(list.map((entry) => (typeof entry === 'string' ? loadScript(entry) : loadScript(entry.src, entry))));
}

async function loadApplication() {
    try {
        // 1. Vendored libraries. pdf.worker.min.js is NOT loaded here: pdf.js spawns it as a Web Worker itself.
        await loadInOrder([
            'lib/js/libs/jquery.min.js',
            'lib/js/libs/toastify.min.js',
            'lib/js/libs/three.min.js',
            'lib/js/libs/pdf.min.js',
            'lib/js/libs/mockup.min.js'
        ]);

        // 2. Utilities, state, flipbook core, UI and features. ES modules (see MODULES) are deferred
        //    by the browser, so they execute after the classic scripts in this batch.
        await loadInOrder([
            'lib/js/utils/theme-utils.js',
            'lib/js/utils/validation.js',
            'lib/js/utils/browser-compatibility.js',
            'lib/js/utils/mobile-support.js',
            'lib/js/utils/memory-manager.js',
            'lib/js/utils/sw-manager.js',
            'lib/js/utils/app-state.js',
            'lib/js/utils/pageMemory.js',
            'lib/js/utils/local-docs.js',
            'lib/js/utils/url-options.js',
            'lib/js/utils/a11y.js',
            'lib/js/core/dflip/index.js'
        ]);

        await loadInOrder([
            'lib/js/core/load.js',
            'lib/js/ui/controls.js',
            'lib/js/features/documents/recent.js',
            'lib/js/features/controls/custom-controls.js',
            'lib/js/features/media/media.js',
            'lib/js/features/themes/manager.js',
            'lib/js/features/themes/selector.js',
            // quotes/db.js is imported by these two modules; loading it separately created a second DB connection
            'lib/js/features/quotes/main.js',
            'lib/js/features/quotes/ui.js',
            'lib/js/features/settings/backup.js'
        ]);

        // 3. Optional Pro features: the private build sets window.ZAYA_PRO = true in config.js.
        if (window.ZAYA_PRO === true) {
            try {
                await loadScript('lib/js/pro-features/index.js', { module: true });
            } catch (proErr) {
                console.warn('Pro features could not be loaded:', proErr);
            }
        }

        initializeApp();

        if (typeof window.updateCurrentPdfContext === 'function') {
            window.updateCurrentPdfContext();
        }
    } catch (error) {
        console.error('Failed to load application:', error);
        showFatalError(error);
    }
}

function initializeApp() {
    const versionEl = document.getElementById('currentVersion');
    if (versionEl && !versionEl.textContent.trim()) versionEl.textContent = `v${ZAYA_VERSION}`;
    console.log(`Zaya v${ZAYA_VERSION} initialized`);
    document.dispatchEvent(new CustomEvent('zaya:init', { detail: { version: ZAYA_VERSION } }));
}

function showFatalError(error) {
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#f87171;font-family:system-ui,Arial,sans-serif;background:#111827;padding:24px 32px;border-radius:12px;border:1px solid #374151;max-width:90vw;';
    const h = document.createElement('h2');
    h.textContent = 'Failed to load application';
    const p = document.createElement('p');
    p.textContent = error && error.message ? error.message : String(error);
    const hint = document.createElement('p');
    hint.textContent = 'Please refresh the page to try again.';
    box.append(h, p, hint);
    document.body.replaceChildren(box);
}

loadApplication();
