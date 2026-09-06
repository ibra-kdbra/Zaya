/**
 * Interface language and direction.
 *
 * `window.ZayaI18n` is the only place that knows which language the interface is in:
 *
 *   t(key, vars)      one string, with `{name}` placeholders filled and plural forms chosen
 *   lang              the active code ('en' | 'ar')
 *   setLanguage(code) switch live: re-translate the markup, set <html lang/dir>, announce it
 *   languages         the codes on offer, with their own names
 *   apply(root)       translate every `data-i18n*` element under `root` (the document by default)
 *
 * Static markup carries the key in an attribute — `data-i18n` for the text, plus
 * `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-aria-label` and `data-i18n-empty` (the
 * `data-empty` attribute the CSS empty states read). Strings built in scripts go through `t()`
 * and are redrawn on the `zaya:languageChanged` event.
 *
 * The interface direction is separate from the document's own reading direction: `AppState.isRTL`
 * still belongs to the book, and switching the interface to Arabic never touches it.
 */
(function () {
    const DEFAULT = 'en';
    const LANGUAGES = [
        { code: 'en', name: 'English', dir: 'ltr' },
        { code: 'ar', name: 'العربية', dir: 'rtl' }
    ];
    const CODES = LANGUAGES.map((l) => l.code);
    const STORAGE_KEY = 'language';

    const dictionaries = window.ZayaMessages || {};
    let current = DEFAULT;
    const pluralRules = {};

    function messages(code) {
        return dictionaries[code] || dictionaries[DEFAULT] || {};
    }

    function rulesFor(code) {
        if (!pluralRules[code]) {
            try { pluralRules[code] = new Intl.PluralRules(code); } catch (e) { pluralRules[code] = null; }
        }
        return pluralRules[code];
    }

    /** Pick the plural form for `n`: Arabic uses all six categories, English only two. */
    function pluralForm(forms, n, code) {
        const rules = rulesFor(code);
        const category = rules ? rules.select(n) : (n === 1 ? 'one' : 'other');
        if (typeof forms[category] === 'string') return forms[category];
        if (category === 'zero' && typeof forms.other === 'string') return forms.other;
        return typeof forms.other === 'string' ? forms.other : '';
    }

    /** Fill `{name}` placeholders. Anything the caller did not supply is left as it stands. */
    function interpolate(text, vars) {
        if (!vars) return text;
        return text.replace(/\{(\w+)\}/g, (match, name) => (
            Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
        ));
    }

    function lookup(key, code) {
        const dict = messages(code);
        if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
        const fallback = messages(DEFAULT);
        if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
        return null;
    }

    /**
     * @param {string} key   a dotted key from the dictionaries
     * @param {object} [vars] placeholder values; `n` also picks the plural form
     * @returns {string} the translated string, or the key itself when it is missing
     */
    function t(key, vars) {
        const value = lookup(key, current);
        if (value === null) return key;
        if (typeof value === 'object') {
            const n = vars && Number.isFinite(Number(vars.n)) ? Number(vars.n) : 0;
            return interpolate(pluralForm(value, n, current), vars);
        }
        return interpolate(value, vars);
    }

    const ATTRIBUTES = [
        ['data-i18n-title', 'title'],
        ['data-i18n-placeholder', 'placeholder'],
        ['data-i18n-aria-label', 'aria-label'],
        ['data-i18n-empty', 'data-empty']
    ];

    /** Translate everything under `root` that carries a key. Safe to call as often as needed. */
    function apply(root) {
        const host = root || document;
        host.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        ATTRIBUTES.forEach(([source, target]) => {
            host.querySelectorAll('[' + source + ']').forEach((el) => {
                el.setAttribute(target, t(el.getAttribute(source)));
            });
        });
    }

    function directionOf(code) {
        const entry = LANGUAGES.find((l) => l.code === code);
        return entry ? entry.dir : 'ltr';
    }

    function paintDocument() {
        const root = document.documentElement;
        root.setAttribute('lang', current);
        root.setAttribute('dir', directionOf(current));
    }

    function remember(code) {
        try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* storage unavailable */ }
        if (window.appState && typeof window.appState.set === 'function'
            && window.appState.get('language') !== code) {
            window.appState.set({ language: code });
        }
    }

    /**
     * Switch the interface language. The markup is re-translated in place and everything that
     * renders its own text redraws on `zaya:languageChanged`; nothing reloads.
     */
    function setLanguage(code, options) {
        const next = CODES.indexOf(code) !== -1 ? code : DEFAULT;
        const changed = next !== current;
        current = next;
        if (!(options && options.silent)) remember(next);
        paintDocument();
        apply(document);
        if (changed || (options && options.announce)) {
            document.dispatchEvent(new CustomEvent('zaya:languageChanged', {
                detail: { lang: current, dir: directionOf(current) }
            }));
        }
        return current;
    }

    /** The stored preference, a `?lang=` preset, then the browser's own list of languages. */
    function resolveInitial() {
        const preset = window.ZayaUrlOptions && window.ZayaUrlOptions.options
            ? window.ZayaUrlOptions.options.lang : null;
        if (preset && CODES.indexOf(preset) !== -1) return { code: preset, remember: true };

        let stored = null;
        try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { stored = null; }
        if (stored && CODES.indexOf(stored) !== -1) return { code: stored, remember: false };

        // First visit: Arabic when the browser asks for it first, English otherwise.
        const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || '';
        const code = /^ar\b/i.test(preferred) ? 'ar' : DEFAULT;
        return { code, remember: true };
    }

    const initial = resolveInitial();
    current = initial.code;
    if (initial.remember) remember(current);
    paintDocument();

    /*
     * Classic scripts all share one global lexical scope, so `core/load.js` and `features/media`
     * cannot each declare a local `t`. They call this instead; modules keep their own local alias.
     */
    window.ZayaT = t;

    window.ZayaI18n = {
        t,
        apply,
        setLanguage,
        languages: LANGUAGES.slice(),
        get lang() { return current; },
        get dir() { return directionOf(current); },
        has(key) { return lookup(key, current) !== null; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => apply(document));
    } else {
        apply(document);
    }
})();
