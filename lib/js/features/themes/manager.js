// Theme Manager
class ThemeManager {
    constructor() {
        this.currentTheme = 'default';
        this.themes = [
            'default', 'dark', 'light', 'purple', 'green', 'red', 'orange', 'pink',
            'cyan', 'indigo', 'yellow', 'gray', 'emerald', 'teal', 'violet', 'rose',
            'amber', 'lime', 'sky', 'fuchsia', 'slate', 'zinc', 'neutral', 'stone',
            'dracula', 'nord', 'gruvbox', 'solarized', 'monokai', 'tomorrow',
            'github', 'material', 'vscode', 'atom', 'xcode', 'sublime', 'jetbrains',
            'notepad', 'terminal', 'matrix', 'cyberpunk', 'ocean', 'forest', 'sunset',
            'midnight', 'cherry', 'lavender', 'mint', 'coffee', 'neon', 'gold',
            'silver', 'bronze', 'platinum'
        ];
        this.init();
    }

    init() {
        this.loadSavedTheme();
        this.applyTheme(this.currentTheme);
    }

    loadSavedTheme() {
        // AppState (localStorage) is the source of truth for the active theme; the copy in
        // IndexedDB is only a fallback for a profile that has never picked one, so a late
        // database read can never override what the reader is already looking at.
        let stored = null;
        try { stored = localStorage.getItem('theme'); } catch (e) { /* storage unavailable */ }
        if (stored && this.themes.includes(stored)) {
            this.currentTheme = stored;
            if (window.appState && window.appState.get('theme') !== stored) window.appState.setTheme(stored);
            return;
        }

        import('../quotes/db.js').then(({ getSettings }) => {
            getSettings((settings) => {
                const fromDb = settings && settings.theme;
                // A theme chosen meanwhile (user, ?theme=, backup import) always wins over the late read.
                if (this.themeChosen) return;
                if (fromDb && fromDb !== this.currentTheme && this.themes.includes(fromDb)) {
                    this.setTheme(fromDb);
                }
            });
        }).catch(() => {
            // Fallback if database not available
        });
    }

    formatThemeName(theme) {
        return theme.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    setTheme(themeName) {
        if (!this.themes.includes(themeName)) {
            console.warn('[themeManager] Unknown theme ignored:', themeName);
            return;
        }
        this.currentTheme = themeName;
        this.themeChosen = true;
        this.applyTheme(themeName);
        this.saveTheme(themeName);

        // Show success feedback
        if (window.Toastify) {
            window.Toastify({
                text: (window.ZayaI18n ? window.ZayaI18n.t('theme.changed', { name: this.formatThemeName(themeName) })
                    : `Theme changed to ${this.formatThemeName(themeName)}`),
                duration: 3000,
                gravity: "bottom",
                position: "right",}).showToast();
        }
    }

    applyTheme(themeName) {
        // Remove existing theme classes from document element and body
        document.documentElement.className = document.documentElement.className.replace(/\btheme-\S+/g, '').trim();
        document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();

        // Add new theme class to root and body for full CSS variable cascading
        document.documentElement.classList.add(`theme-${themeName}`);
        document.body.classList.add(`theme-${themeName}`, 'theme-applied');

        // Update theme selection button text if available
        const themeBtn = document.getElementById('openThemeSelectorBtn');
        if (themeBtn) {
            const span = themeBtn.querySelector('span');
            if (span) {
                span.textContent = window.ZayaI18n
                    ? window.ZayaI18n.t('settings.theme', { name: this.formatThemeName(themeName) })
                    : `Theme: ${this.formatThemeName(themeName)}`;
            }
        }

        // Trigger the zaya event; the legacy `themeChanged` jQuery event stays for older plugins.
        document.dispatchEvent(new CustomEvent('zaya:themeChanged', { detail: { theme: themeName } }));
        if (window.jQuery) {
            window.jQuery(document).trigger('themeChanged', [themeName]);
        }
    }

    saveTheme(themeName) {
        // Save to app state first (real-time update)
        if (window.appState) {
            window.appState.setTheme(themeName);
        }

        // Also save to database for persistence
        if (window.dbInitialized) {
            import('../quotes/db.js').then(({ getSettings, updateSettings }) => {
                getSettings((settings) => {
                    const updatedSettings = { ...settings, theme: themeName };
                    updateSettings(updatedSettings, () => {
                        // console.log('Theme saved to database:', themeName);
                    });
                });
            }).catch(() => {
                // Silently fail if database not available
            });
        }
    }

    getAllThemes() {
        return this.themes;
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Initialize theme manager when DOM is ready
function startThemeManager() {
    window.themeManager = new ThemeManager();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startThemeManager);
else startThemeManager();
