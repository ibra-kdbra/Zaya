/**
 * URL options: lets a deployment or a shared link preset the viewer.
 *
 *   ?pdf=<url>            document to open (validated in load.js)
 *   ?page=<n>             page to open
 *   ?theme=<name>         one of the built-in themes, e.g. ?theme=nord
 *   ?mode=single|double   page layout
 *   ?search=<term>        open the search panel with this query
 *   ?rtl=1                right-to-left reading direction
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

    const options = {
        theme: /^[a-z][a-z0-9-]{1,30}$/.test(theme) ? theme : null,
        mode: mode === 'single' || mode === 'double' ? mode : null,
        search: search.trim() || null,
        rtl: rtl === null ? null : (rtl === '1' || rtl === 'true')
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
            if (wantSingle !== isSingle) book.setPageMode(wantSingle);
        }
        if (options.search && book.ui && book.ui.searchPanel) {
            const term = options.search;
            setTimeout(() => {
                if (!(book.target.searchContainer && book.target.searchContainer.hasClass('df-sidemenu-visible'))) {
                    book.ui.searchPanel.trigger('click');
                }
                if (book.target.searchInput) {
                    book.target.searchInput.val(term).trigger('input');
                }
            }, 300);
        }
        options.search = null; // apply once
    }

    // themeManager is created inside a jQuery ready callback, which runs a tick after zaya:init.
    function whenThemeManagerReady(fn, tries = 40) {
        if (window.themeManager) return fn();
        if (tries <= 0) return;
        setTimeout(() => whenThemeManagerReady(fn, tries - 1), 50);
    }

    document.addEventListener('zaya:init', () => {
        applyDirection();
        whenThemeManagerReady(applyTheme);
    });

    window.ZayaUrlOptions = { options, applyToBook };
})();
