/**
 * The Language control in Settings: a two-option segmented control (English / العربية) that
 * switches the interface live. `ZayaI18n` does the work — re-translating the markup, setting
 * `<html lang>` and `dir`, and announcing `zaya:languageChanged`; this only reflects and sets it.
 *
 * The option labels are each written in their own language, so they are never translated and
 * carry their own `lang` attribute in the markup.
 */
(function () {
    const group = () => document.getElementById('languageSwitch');
    const buttons = () => Array.from(document.querySelectorAll('#languageSwitch [data-language]'));

    function sync() {
        const active = window.ZayaI18n ? window.ZayaI18n.lang : 'en';
        buttons().forEach((btn) => {
            const on = btn.dataset.language === active;
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            btn.classList.toggle('media-mode-active', on);
            btn.tabIndex = on ? 0 : -1;
        });
    }

    function choose(code, focus) {
        if (!window.ZayaI18n) return;
        window.ZayaI18n.setLanguage(code);
        sync();
        if (!focus) return;
        const btn = buttons().find((b) => b.dataset.language === code);
        if (btn) btn.focus();
    }

    function init() {
        const box = group();
        if (!box) return;

        box.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-language]');
            if (!btn) return;
            e.preventDefault();
            choose(btn.dataset.language, false);
        });

        // A radio group is one tab stop: the arrows move between the options and pick as they go.
        box.addEventListener('keydown', (e) => {
            const btn = e.target.closest('[data-language]');
            if (!btn) return;
            const codes = buttons().map((b) => b.dataset.language);
            const i = codes.indexOf(btn.dataset.language);
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % codes.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i + codes.length - 1) % codes.length;
            if (next < 0) return;
            e.preventDefault();
            choose(codes[next], true);
        });

        document.addEventListener('zaya:languageChanged', sync);
        sync();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
