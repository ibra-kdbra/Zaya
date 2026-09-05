/**
 * URL options: lets a deployment or a shared link preset the viewer.
 *
 *   ?pdf=<url>            document to open (validated in load.js)
 *   ?page=<n>             page to open
 *   ?theme=<name>         one of the built-in themes, e.g. ?theme=nord
 *   ?mode=single|double   page layout
 *   ?search=<term>        open the search panel with this query
 *   ?rtl=1                right-to-left reading direction
 *   ?render=css|webgl     force the 2D (CSS) or the WebGL renderer (read by the engine factory)
 *
 * All values are validated against allow-lists; nothing here is written to storage
 * except the theme and direction, which are user preferences.
 */
(function () {
    const params = new URLSearchParams(window.location.search);

    const theme = (params.get('theme') || '').toLowerCase();
    const mode = (params.get('mode') || '').toLowerCase();
    const search = (params.get('search') || '').slice(0, 200);
    const rtl = params.get('rtl');
    const RTL_ON = ['1', 'true', 'yes'];
    const RTL_OFF = ['0', 'false', 'no'];

    const options = {
        theme: /^[a-z][a-z0-9-]{1,30}$/.test(theme) ? theme : null,
        mode: mode === 'single' || mode === 'double' ? mode : null,
        search: search.trim() || null,
        // anything that is not a clear yes/no is ignored, leaving the stored preference alone
        rtl: RTL_ON.includes((rtl || '').toLowerCase()) ? true
            : (RTL_OFF.includes((rtl || '').toLowerCase()) ? false : null)
    };

    function applyTheme() {
        if (!options.theme || !window.themeManager) return;
        if (window.themeManager.getAllThemes().includes(options.theme) &&
            window.themeManager.getCurrentTheme() !== options.theme) {
            window.themeManager.setTheme(options.theme);
        }
    }

    function applyDirection() {
        if (options.rtl === null || !window.appState) return;
        if (window.appState.get('isRTL') !== options.rtl) {
            window.appState.set({ isRTL: options.rtl });
        }
    }

    // Called from load.js once the flipbook reports ready
    function applyToBook(book) {
        if (!book) return;
        if (options.mode && typeof book.setPageMode === 'function') {
            const wantSingle = options.mode === 'single';
            const isSingle = book.target && book.target.pageMode === 1;
            if (wantSingle !== isSingle) book.setPageMode(wantSingle, true);
        }
        if (options.search && book.ui && book.ui.searchPanel) {
            const term = options.search;
            // The engine hands out jQuery objects here, so unwrap before touching the DOM.
            setTimeout(() => {
                const container = book.target.searchContainer ? book.target.searchContainer[0] : null;
                if (!(container && container.classList.contains('df-sidemenu-visible'))) {
                    const opener = book.ui.searchPanel[0];
                    if (opener) opener.click();
                }
                const input = book.target.searchInput ? book.target.searchInput[0] : null;
                if (input) {
                    input.value = term;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 300);
        }
        options.search = null; // apply once
    }

    // themeManager is created on DOM ready, which runs a tick after zaya:init.
    function whenThemeManagerReady(fn, tries = 200) {
        if (window.themeManager) return fn();
        if (tries <= 0) return;
        setTimeout(() => whenThemeManagerReady(fn, tries - 1), 50);
    }

    document.addEventListener('zaya:init', () => {
        applyDirection();
        whenThemeManagerReady(applyTheme);
    });
    // The manager announces its initial theme; a ?theme= preset wins over the stored one exactly once.
    document.addEventListener('zaya:themeChanged', function onFirstTheme() {
        document.removeEventListener('zaya:themeChanged', onFirstTheme);
        applyTheme();
    });

    window.ZayaUrlOptions = { options, applyToBook };
})();
