// Modern Theme Selector - Monkeytype Inspired
// Creates a visionary interactive modal for theme selection

function ThemeSelectorModal() {
    this.colorCache = {};
    this.searchDebounceTimer = null;
    this.modalElement = null;
    this.gridElement = null;
    this.searchInput = null;
    this.init();
}

ThemeSelectorModal.prototype.init = function() {
    this.createStyles();
    this.createModal();
    this.bindEvents();
};

ThemeSelectorModal.prototype.createStyles = function() {
    if (document.getElementById('themeSelectorStyles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'themeSelectorStyles';
    styleEl.textContent = `
        .tm-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 2000000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .tm-modal-overlay.active {
            display: flex;
            opacity: 1;
        }

        .tm-modal-content {
            width: 90%;
            max-width: 900px;
            height: 80vh;
            background: #111 !important;
            border-radius: 16px !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .tm-modal-overlay.active .tm-modal-content {
            transform: scale(1);
        }

        .tm-modal-header {
            padding: 2rem;
            background: #161616;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .tm-search-container {
            position: relative;
            width: 100%;
        }

        .tm-search-input {
            width: 100%;
            background: #1e1e1e;
            border: 2px solid transparent;
            border-radius: 12px;
            padding: 1rem 1rem 1rem 3rem;
            color: #fff;
            font-size: 1.1rem;
            outline: none;
            transition: all 0.2s ease;
            font-family: 'Inter', sans-serif;
            box-sizing: border-box;
        }

        .tm-search-input:focus {
            border-color: #3b82f6;
            background: #252525;
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        .tm-search-icon {
            position: absolute;
            left: 1.25rem;
            top: 50%;
            transform: translateY(-50%);
            color: #666;
            font-size: 1.2rem;
        }

        .tm-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 2rem;
            scrollbar-width: thin;
            scrollbar-color: #333 transparent;
        }

        .tm-modal-body::-webkit-scrollbar {
            width: 6px;
        }

        .tm-modal-body::-webkit-scrollbar-thumb {
            background: #333;
            border-radius: 10px;
        }

        .tm-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 1.5rem !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }

        @media (max-width: 850px) {
            .tm-grid {
                grid-template-columns: 1fr 1fr !important;
            }
        }

        @media (max-width: 550px) {
            .tm-grid {
                grid-template-columns: 1fr !important;
            }
        }

        .tm-card {
            background: #1a1a1a;
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 1.25rem;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            position: relative;
            overflow: hidden;
        }

        .tm-card:hover {
            background: #222;
            border-color: #3b82f6;
            transform: translateY(-4px);
            box-shadow: 0 12px 24px -10px rgba(59, 130, 246, 0.3);
        }

        .tm-card.active {
            border-color: #3b82f6;
            background: #1e2530;
        }

        .tm-card.active::after {
            content: '✓';
            position: absolute;
            top: 0.5rem;
            right: 0.75rem;
            color: #3b82f6;
            font-weight: bold;
        }

        .tm-card-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .tm-card-name {
            font-weight: 600;
            font-size: 0.95rem;
            color: #eee;
            text-transform: capitalize;
        }

        .tm-swatch {
            display: flex;
            gap: 4px;
            background: #000;
            padding: 6px;
            border-radius: 20px;
            width: fit-content;
        }

        .tm-swatch-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }

        .tm-preview-strip {
            display: flex;
            height: 30px;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .tm-preview-part {
            flex: 1;
        }

        .tm-no-results {
            grid-column: 1 / -1;
            text-align: center;
            padding: 3rem;
            color: #666;
            font-size: 1.1rem;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .tm-card {
            animation: fadeIn 0.3s ease forwards;
        }
    `;
    document.head.appendChild(styleEl);
};

ThemeSelectorModal.prototype.createModal = function() {
    if (document.getElementById('themeSelectorOverlay')) {
        this.modalElement = document.getElementById('themeSelectorOverlay');
        this.gridElement = document.getElementById('themeGrid');
        this.searchInput = this.modalElement.querySelector('.tm-search-input');
        return;
    }

    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'themeSelectorOverlay';
    modalWrapper.className = 'tm-modal-overlay';
    modalWrapper.setAttribute('role', 'dialog');
    modalWrapper.setAttribute('aria-label', 'Theme Selector Modal');

    modalWrapper.innerHTML = `
        <div class="tm-modal-content">
            <div class="tm-modal-header">
                <div class="tm-search-container">
                    <i class="fas fa-search tm-search-icon"></i>
                    <input type="text" class="tm-search-input" placeholder="Type to search themes..." spellcheck="false" aria-label="Search themes">
                </div>
            </div>
            <div class="tm-modal-body">
                <div id="themeGrid" class="tm-grid"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modalWrapper);
    this.modalElement = modalWrapper;
    this.gridElement = modalWrapper.querySelector('#themeGrid');
    this.searchInput = modalWrapper.querySelector('.tm-search-input');
};

ThemeSelectorModal.prototype.getThemeColors = function(themeName) {
    if (this.colorCache[themeName]) {
        return this.colorCache[themeName];
    }

    const fallbacks = {
        'default': { bg: '#1a1a1a', text: '#e5e7eb', accent: '#3b82f6' },
        'dark': { bg: '#0f0f0f', text: '#f5f5f5', accent: '#3b82f6' },
        'light': { bg: '#ffffff', text: '#1a1a1a', accent: '#3b82f6' },
        'dracula': { bg: '#282a36', text: '#f8f8f2', accent: '#8be9fd' },
        'nord': { bg: '#2e3440', text: '#eceff4', accent: '#88c0d0' },
        'monokai': { bg: '#272822', text: '#f8f8f2', accent: '#f92672' },
        'matrix': { bg: '#0d0d0d', text: '#00ff00', accent: '#00ff00' },
        'cyberpunk': { bg: '#0a0a0a', text: '#ff1493', accent: '#ff1493' },
        'purple': { bg: '#1a1a2e', text: '#e2e8f0', accent: '#9333ea' },
        'green': { bg: '#0f291e', text: '#e6f4ea', accent: '#10b981' }
    };

    let colors = fallbacks[themeName];
    if (!colors) {
        // Fast probe without DOM tree insertion loops
        const probe = document.createElement('div');
        probe.className = `theme-${themeName}`;
        probe.style.display = 'none';
        document.body.appendChild(probe);

        const computed = getComputedStyle(probe);
        const bg = computed.getPropertyValue('--bg-primary').trim();
        const text = computed.getPropertyValue('--text-primary').trim();
        const accent = computed.getPropertyValue('--text-accent').trim();

        colors = {
            bg: bg || '#222222',
            text: text || '#eeeeee',
            accent: accent || '#3b82f6'
        };

        document.body.removeChild(probe);
    }

    this.colorCache[themeName] = colors;
    return colors;
};

ThemeSelectorModal.prototype.renderThemes = function(filter = '') {
    if (!this.gridElement) return;
    this.gridElement.innerHTML = '';

    const allThemes = window.themeManager?.getAllThemes() || [];
    const currentTheme = window.themeManager?.getCurrentTheme();
    const query = filter.toLowerCase().trim();

    const filtered = allThemes.filter(t => t.toLowerCase().includes(query));

    if (filtered.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'tm-no-results';
        noRes.textContent = 'No themes match your search';
        this.gridElement.appendChild(noRes);
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach((theme, index) => {
        const colors = this.getThemeColors(theme);
        const displayName = theme.replace(/-/g, ' ');
        const isActive = theme === currentTheme;

        const card = document.createElement('div');
        card.className = `tm-card ${isActive ? 'active' : ''}`;
        card.dataset.theme = theme;
        card.style.animationDelay = `${Math.min(index * 0.015, 0.3)}s`;

        card.innerHTML = `
            <div class="tm-card-info">
                <span class="tm-card-name">${displayName}</span>
                <div class="tm-swatch">
                    <div class="tm-swatch-dot" style="background: ${colors.bg}"></div>
                    <div class="tm-swatch-dot" style="background: ${colors.text}"></div>
                    <div class="tm-swatch-dot" style="background: ${colors.accent}"></div>
                </div>
            </div>
            <div class="tm-preview-strip">
                <div class="tm-preview-part" style="background: ${colors.bg}"></div>
                <div class="tm-preview-part" style="background: ${colors.text}"></div>
                <div class="tm-preview-part" style="background: ${colors.accent}"></div>
            </div>
        `;

        fragment.appendChild(card);
    });

    this.gridElement.appendChild(fragment);
};

ThemeSelectorModal.prototype.bindEvents = function() {
    const self = this;

    // Open button via delegation
    document.addEventListener('click', function(e) {
        const openBtn = e.target.closest('#openThemeSelectorBtn');
        if (openBtn) {
            self.show();
        }
    });

    // Close on overlay click
    if (this.modalElement) {
        this.modalElement.addEventListener('click', function(e) {
            if (e.target === self.modalElement) {
                self.hide();
            }
        });
    }

    // Debounced search input
    if (this.searchInput) {
        this.searchInput.addEventListener('input', function(e) {
            clearTimeout(self.searchDebounceTimer);
            const val = e.target.value;
            self.searchDebounceTimer = setTimeout(() => {
                self.renderThemes(val);
            }, 100);
        });
    }

    // Theme card selection delegation
    if (this.gridElement) {
        this.gridElement.addEventListener('click', function(e) {
            const card = e.target.closest('.tm-card');
            if (card && card.dataset.theme) {
                const theme = card.dataset.theme;
                if (window.themeManager) {
                    window.themeManager.setTheme(theme);
                    self.hide();
                }
            }
        });
    }

    // Keyboard escape
    document.addEventListener('keydown', function(e) {
        if (!self.modalElement || !self.modalElement.classList.contains('active')) return;
        if (e.key === 'Escape') {
            self.hide();
        }
    });
};

ThemeSelectorModal.prototype.show = function() {
    if (!this.modalElement) return;
    const filterVal = this.searchInput ? this.searchInput.value : '';
    this.renderThemes(filterVal);
    this.modalElement.classList.add('active');
    this.modalElement.style.display = 'flex';
    this.modalElement.setAttribute('role', 'dialog');
    this.modalElement.setAttribute('aria-label', 'Choose a theme');
    if (window.ZayaA11y) window.ZayaA11y.trap(this.modalElement, { onEscape: () => this.hide() });
    setTimeout(() => {
        if (this.searchInput) this.searchInput.focus();
    }, 100);
    document.body.style.overflow = 'hidden';
};

ThemeSelectorModal.prototype.hide = function() {
    if (!this.modalElement) return;
    if (window.ZayaA11y) window.ZayaA11y.release(this.modalElement);
    this.modalElement.classList.remove('active');
    setTimeout(() => {
        if (!this.modalElement.classList.contains('active')) {
            this.modalElement.style.display = 'none';
        }
    }, 300);
    document.body.style.overflow = '';
};

// Initialize modal on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.themeSelectorModal = new ThemeSelectorModal();
    });
} else {
    window.themeSelectorModal = new ThemeSelectorModal();
}
