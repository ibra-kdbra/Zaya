// Theme picker: a single dialog listing every theme, grouped and searchable.
// The trigger stays #openThemeSelectorBtn and the action stays window.themeManager.setTheme(name).

// Themes named after an editor or a terminal go in their own group; everything else is
// classified at runtime from the luminance and saturation of its own --bg-primary.
const EDITOR_THEMES = [
    'dracula', 'nord', 'gruvbox', 'solarized', 'monokai', 'tomorrow', 'github',
    'material', 'vscode', 'atom', 'xcode', 'sublime', 'jetbrains', 'notepad',
    'terminal', 'matrix', 'cyberpunk'
];

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

const GROUP_ORDER = [
    { id: 'dark', key: 'theme.group.dark' },
    { id: 'light', key: 'theme.group.light' },
    { id: 'coloured', key: 'theme.group.coloured' },
    { id: 'editors', key: 'theme.group.editors' }
];

function parseColor(value) {
    if (!value) return null;
    const text = value.trim();
    const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) return parts.slice(0, 3);
    }
    return null;
}

function classify(themeName, bg) {
    if (EDITOR_THEMES.indexOf(themeName) !== -1) return 'editors';
    const rgb = parseColor(bg);
    if (!rgb) return 'dark';
    const [r, g, b] = rgb;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luminance >= 0.5) return 'light';
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max + min === 0 ? 0 : (max - min) / (max + min);
    return saturation > 0.15 ? 'coloured' : 'dark';
}

function ThemeSelectorModal() {
    this.colorCache = null;
    this.searchDebounceTimer = null;
    this.modalElement = null;
    this.listElement = null;
    this.searchInput = null;
    this.options = [];
    this.activeIndex = -1;
    this.init();
}

ThemeSelectorModal.prototype.init = function () {
    this.createStyles();
    this.createModal();
    this.bindEvents();
};

ThemeSelectorModal.prototype.createStyles = function () {
    if (document.getElementById('themeSelectorStyles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'themeSelectorStyles';
    styleEl.textContent = `
        .tm-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 12px;
            background: rgba(0, 0, 0, 0.45);
            opacity: 0;
            transition: opacity 180ms ease;
        }

        .tm-modal-overlay.active {
            display: flex;
            opacity: 1;
        }

        .tm-modal-content {
            width: 100%;
            max-width: 860px;
            max-height: 100%;
            height: 640px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--bg-primary);
            border: 1px solid var(--border-primary);
            border-radius: 10px;
            box-shadow: var(--shadow-primary);
        }

        .tm-modal-header {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-secondary);
        }

        .tm-title {
            margin: 0;
            flex: 0 0 auto;
            font-family: var(--font-sans);
            font-size: 15px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .tm-search-container {
            position: relative;
            flex: 1 1 160px;
            min-width: 0;
        }

        .tm-search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: var(--text-secondary);
            pointer-events: none;
        }

        .tm-search-input {
            width: 100%;
            min-height: 44px;
            box-sizing: border-box;
            padding: 0 12px 0 32px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            color: var(--text-primary);
            font-family: var(--font-sans);
            font-size: 13.5px;
            outline: none;
            transition: border-color 150ms ease;
        }

        .tm-search-input::placeholder { color: var(--text-secondary); }
        .tm-search-input:focus { border-color: var(--text-accent); }

        .tm-close {
            flex: 0 0 auto;
            width: 44px;
            height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 8px;
            color: var(--text-secondary);
            font-family: var(--font-sans);
            font-size: 15px;
            cursor: pointer;
            transition: color 150ms ease, background-color 150ms ease;
        }

        .tm-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
        .tm-close:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }

        .tm-modal-body {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 4px 10px 16px;
            outline: none;
            scrollbar-width: thin;
            scrollbar-color: var(--border-primary) transparent;
        }

        .tm-modal-body::-webkit-scrollbar { width: 6px; }
        .tm-modal-body::-webkit-scrollbar-thumb { background: var(--border-primary); border-radius: 6px; }

        .tm-group:first-child .tm-group-title { margin-top: 0; }

        .tm-group-title {
            margin: 16px 0 8px;
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-secondary);
        }

        .tm-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 8px;
        }

        .tm-option {
            min-height: 56px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 8px;
            padding: 8px 10px;
            background: transparent;
            border: 1px solid var(--border-secondary);
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 150ms ease, border-color 150ms ease;
        }

        .tm-option:hover {
            background: var(--bg-tertiary);
            border-color: var(--border-primary);
        }

        .tm-option.active {
            background: var(--bg-accent);
            border-color: var(--text-accent);
        }

        .tm-option.focused {
            outline: 2px solid var(--text-accent);
            outline-offset: 2px;
        }

        .tm-option-name {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-family: var(--font-sans);
            font-size: 13.5px;
            color: var(--text-primary);
            text-transform: capitalize;
        }

        .tm-check {
            flex: 0 0 auto;
            font-size: 12px;
            color: var(--text-accent);
            visibility: hidden;
        }

        .tm-option.active .tm-check { visibility: visible; }

        .tm-strip {
            display: flex;
            height: 12px;
            border-radius: 3px;
            overflow: hidden;
            border: 1px solid var(--border-secondary);
        }

        .tm-strip span { flex: 1 1 0; }

        .tm-no-results {
            padding: 32px 0;
            font-family: var(--font-sans);
            font-size: 13.5px;
            color: var(--text-secondary);
        }
    `;
    document.head.appendChild(styleEl);
};

ThemeSelectorModal.prototype.createModal = function () {
    const existing = document.getElementById('themeSelectorOverlay');
    if (existing) {
        this.modalElement = existing;
        this.listElement = existing.querySelector('#themeGrid');
        this.searchInput = existing.querySelector('.tm-search-input');
        return;
    }

    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'themeSelectorOverlay';
    modalWrapper.className = 'tm-modal-overlay';
    modalWrapper.setAttribute('role', 'dialog');
    modalWrapper.setAttribute('aria-labelledby', 'tmTitle');

    // Built from elements rather than a markup string, so nothing here can carry content
    // from a document or a reader's input.
    const content = document.createElement('div');
    content.className = 'tm-modal-content';

    const header = document.createElement('div');
    header.className = 'tm-modal-header';

    const heading = document.createElement('h2');
    heading.className = 'tm-title';
    heading.id = 'tmTitle';
    heading.textContent = t('theme.title');
    heading.dataset.i18n = 'theme.title';

    const searchContainer = document.createElement('div');
    searchContainer.className = 'tm-search-container';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fas fa-search tm-search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'tm-search-input';
    search.placeholder = t('theme.searchPlaceholder');
    search.dataset.i18nPlaceholder = 'theme.searchPlaceholder';
    search.spellcheck = false;
    search.setAttribute('aria-label', t('theme.searchLabel'));
    search.dataset.i18nAriaLabel = 'theme.searchLabel';
    search.setAttribute('aria-controls', 'themeGrid');
    searchContainer.append(searchIcon, search);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tm-close';
    close.setAttribute('aria-label', t('theme.close'));
    close.dataset.i18nAriaLabel = 'theme.close';
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeIcon.setAttribute('aria-hidden', 'true');
    close.appendChild(closeIcon);

    header.append(heading, searchContainer, close);

    const grid = document.createElement('div');
    grid.className = 'tm-modal-body';
    grid.id = 'themeGrid';
    grid.tabIndex = 0;
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-labelledby', 'tmTitle');

    content.append(header, grid);
    modalWrapper.appendChild(content);

    document.body.appendChild(modalWrapper);
    this.modalElement = modalWrapper;
    this.listElement = modalWrapper.querySelector('#themeGrid');
    this.searchInput = modalWrapper.querySelector('.tm-search-input');
};

// Reads --bg-primary / --text-primary / --text-accent straight out of themes.css by mounting
// one hidden probe per theme, so the picker never keeps a second copy of the palette.
ThemeSelectorModal.prototype.getThemeColors = function () {
    if (this.colorCache) return this.colorCache;

    const themes = (window.themeManager && window.themeManager.getAllThemes()) || [];
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'absolute';
    host.style.left = '-9999px';
    host.style.width = '0';
    host.style.height = '0';
    host.style.overflow = 'hidden';

    const probes = themes.map((theme) => {
        const probe = document.createElement('div');
        probe.className = `theme-${theme}`;
        host.appendChild(probe);
        return probe;
    });
    document.body.appendChild(host);

    const cache = {};
    themes.forEach((theme, i) => {
        const computed = getComputedStyle(probes[i]);
        cache[theme] = {
            bg: computed.getPropertyValue('--bg-primary').trim(),
            text: computed.getPropertyValue('--text-primary').trim(),
            accent: computed.getPropertyValue('--text-accent').trim()
        };
        cache[theme].group = classify(theme, cache[theme].bg);
    });

    document.body.removeChild(host);
    this.colorCache = cache;
    return cache;
};

ThemeSelectorModal.prototype.renderThemes = function (filter = '') {
    if (!this.listElement) return;
    this.listElement.textContent = '';
    this.options = [];

    const allThemes = (window.themeManager && window.themeManager.getAllThemes()) || [];
    const currentTheme = window.themeManager && window.themeManager.getCurrentTheme();
    const colors = this.getThemeColors();
    const query = filter.toLowerCase().trim();
    const filtered = allThemes.filter((t) => t.toLowerCase().includes(query));

    if (filtered.length === 0) {
        const noRes = document.createElement('p');
        noRes.className = 'tm-no-results';
        noRes.textContent = t('theme.noResults');
        this.listElement.appendChild(noRes);
        this.setActiveIndex(-1);
        return;
    }

    const fragment = document.createDocumentFragment();

    GROUP_ORDER.forEach((group) => {
        const members = filtered.filter((t) => (colors[t] ? colors[t].group : 'dark') === group.id);
        if (!members.length) return;

        /*
         * A listbox may only own options and groups, so the heading lives inside the group and
         * is hidden from assistive technology, which reads the group's own name instead. The
         * grid itself is presentational: the options belong to the group.
         */
        const section = document.createElement('div');
        section.className = 'tm-group';
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', t(group.key));

        const heading = document.createElement('h3');
        heading.className = 'tm-group-title';
        heading.id = `tm-group-${group.id}`;
        heading.textContent = t(group.key);
        heading.setAttribute('aria-hidden', 'true');
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'tm-grid';
        grid.setAttribute('role', 'presentation');

        members.forEach((theme) => {
            const palette = colors[theme] || {};
            const isActive = theme === currentTheme;

            const option = document.createElement('div');
            option.className = `tm-option${isActive ? ' active' : ''}`;
            option.id = `tm-option-${theme}`;
            option.dataset.theme = theme;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', isActive ? 'true' : 'false');

            const name = document.createElement('span');
            name.className = 'tm-option-name';
            const label = document.createElement('span');
            label.textContent = theme.replace(/-/g, ' ');
            const check = document.createElement('i');
            check.className = 'fas fa-check tm-check';
            check.setAttribute('aria-hidden', 'true');
            name.appendChild(label);
            name.appendChild(check);

            const strip = document.createElement('span');
            strip.className = 'tm-strip';
            [palette.bg, palette.text, palette.accent].forEach((color) => {
                const stop = document.createElement('span');
                if (color) stop.style.background = color;
                strip.appendChild(stop);
            });

            option.appendChild(name);
            option.appendChild(strip);
            grid.appendChild(option);
            this.options.push(option);
        });

        section.appendChild(grid);
        fragment.appendChild(section);
    });

    this.listElement.appendChild(fragment);

    const selected = this.options.findIndex((el) => el.classList.contains('active'));
    this.setActiveIndex(selected >= 0 ? selected : 0, false);
};

ThemeSelectorModal.prototype.setActiveIndex = function (index, scroll = true) {
    this.options.forEach((el) => el.classList.remove('focused'));
    this.activeIndex = index;
    const option = this.options[index];
    if (!option) {
        if (this.listElement) this.listElement.removeAttribute('aria-activedescendant');
        return;
    }
    option.classList.add('focused');
    if (this.listElement) this.listElement.setAttribute('aria-activedescendant', option.id);
    if (scroll) option.scrollIntoView({ block: 'nearest' });
};

// Up/Down step a row at a time by geometry, so the auto-fill grid stays navigable at any width.
ThemeSelectorModal.prototype.moveByRow = function (direction) {
    const current = this.options[this.activeIndex];
    if (!current) return this.setActiveIndex(0);
    const from = current.getBoundingClientRect();
    let best = -1;
    let bestScore = Infinity;
    this.options.forEach((el, i) => {
        const box = el.getBoundingClientRect();
        const rowDelta = (box.top - from.top) * direction;
        if (rowDelta <= 1) return;
        const score = rowDelta * 1000 + Math.abs(box.left - from.left);
        if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) this.setActiveIndex(best);
    else this.setActiveIndex(direction > 0 ? this.options.length - 1 : 0);
};

ThemeSelectorModal.prototype.selectActive = function () {
    const option = this.options[this.activeIndex];
    if (option && option.dataset.theme) this.apply(option.dataset.theme);
};

ThemeSelectorModal.prototype.apply = function (theme) {
    if (window.themeManager) window.themeManager.setTheme(theme);
    this.hide();
};

ThemeSelectorModal.prototype.bindEvents = function () {
    const self = this;

    document.addEventListener('click', function (e) {
        if (e.target.closest('#openThemeSelectorBtn')) self.show();
    });

    if (this.modalElement) {
        this.modalElement.addEventListener('click', function (e) {
            if (e.target === self.modalElement) self.hide();
            if (e.target.closest('.tm-close')) self.hide();
        });

        this.modalElement.addEventListener('keydown', function (e) {
            if (!self.options.length) return;
            if (e.target.closest('.tm-close')) return;
            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    self.setActiveIndex(Math.min(self.activeIndex + 1, self.options.length - 1));
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    self.setActiveIndex(Math.max(self.activeIndex - 1, 0));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    self.moveByRow(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    self.moveByRow(-1);
                    break;
                case 'Home':
                    e.preventDefault();
                    self.setActiveIndex(0);
                    break;
                case 'End':
                    e.preventDefault();
                    self.setActiveIndex(self.options.length - 1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    self.selectActive();
                    break;
                default:
                    break;
            }
        });
    }

    if (this.searchInput) {
        this.searchInput.addEventListener('input', function (e) {
            clearTimeout(self.searchDebounceTimer);
            const val = e.target.value;
            self.searchDebounceTimer = setTimeout(() => self.renderThemes(val), 100);
        });
    }

    if (this.listElement) {
        this.listElement.addEventListener('click', function (e) {
            const option = e.target.closest('.tm-option');
            if (option && option.dataset.theme) self.apply(option.dataset.theme);
        });
    }

    document.addEventListener('keydown', function (e) {
        if (!self.modalElement || !self.modalElement.classList.contains('active')) return;
        if (e.key === 'Escape') self.hide();
    });

    // The picker keeps its own markup, so it re-translates itself and redraws its group headings.
    document.addEventListener('zaya:languageChanged', function () {
        if (!self.modalElement) return;
        if (window.ZayaI18n) window.ZayaI18n.apply(self.modalElement);
        if (self.modalElement.classList.contains('active')) {
            self.renderThemes(self.searchInput ? self.searchInput.value : '');
        }
    });
};

ThemeSelectorModal.prototype.show = function () {
    if (!this.modalElement) return;
    // The bottom bar pins itself at the maximum z-index, so the dialog has to be the last
    // body child to paint over it.
    document.body.appendChild(this.modalElement);
    this.renderThemes(this.searchInput ? this.searchInput.value : '');
    this.modalElement.classList.add('active');
    if (window.ZayaA11y) window.ZayaA11y.trap(this.modalElement, { onEscape: () => this.hide() });
    setTimeout(() => {
        if (this.searchInput) this.searchInput.focus();
    }, 60);
    document.body.style.overflow = 'hidden';
};

ThemeSelectorModal.prototype.hide = function () {
    if (!this.modalElement) return;
    if (window.ZayaA11y) window.ZayaA11y.release(this.modalElement);
    this.modalElement.classList.remove('active');
    document.body.style.overflow = '';
};

// Initialize modal on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        window.themeSelectorModal = new ThemeSelectorModal();
    });
} else {
    window.themeSelectorModal = new ThemeSelectorModal();
}
