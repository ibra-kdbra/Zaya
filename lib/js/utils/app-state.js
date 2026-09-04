// Centralized state management to replace global variables

class AppState {
    // Centralized default PDF URL - single source of truth
    // Can be overridden by setting window.ZAYA_DEFAULT_PDF before app loads
    static DEFAULT_PDF_URL = (typeof window.ZAYA_DEFAULT_PDF === 'string' && window.ZAYA_DEFAULT_PDF.trim() !== '')
        ? window.ZAYA_DEFAULT_PDF
        : 'https://7uzx5yn03h.ufs.sh/f/aLxFAGHMpUDr7glzEnWNqVtFBPY42CWdxE7m9GwsRJXi6Anr';
    
    constructor() {
        this.state = {
            isRTL: false,
            currentPdf: AppState.DEFAULT_PDF_URL,
            currentPdfType: 'url',
            currentPdfName: '',
            lastPage: 1,
            theme: 'default',
            mediaVolume: 50,
            mediaLoop: false,
            mediaMode: 'youtube',
            panelOpen: false
        };

        this.listeners = {};
        this.loadFromStorage();
    }

    // Static getter for easy access
    static getDefaultPdfUrl() {
        return AppState.DEFAULT_PDF_URL;
    }

    // Get current state
    getState() {
        return { ...this.state };
    }

    // Get specific state value
    get(key) {
        return this.state[key];
    }

    // Update state and notify listeners
    set(updates) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...updates };
        this.persistToStorage();
        this.notifyListeners(prevState);
    }

    // Subscribe to state changes
    subscribe(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    // Notify listeners of state changes
    notifyListeners(prevState) {
        Object.keys(this.listeners).forEach(event => {
            if (prevState[event] !== this.state[event]) {
                this.listeners[event].forEach(callback => {
                    callback(this.state[event], prevState[event]);
                });
            }
        });

        // Dispatch standard CustomEvents for plugin compatibility
        if (prevState.currentPdf !== this.state.currentPdf) {
            document.dispatchEvent(new CustomEvent('zaya:pdfLoaded', {
                detail: { url: this.state.currentPdf, type: this.state.currentPdfType, name: this.state.currentPdfName }
            }));
        }
        if (prevState.lastPage !== this.state.lastPage) {
            document.dispatchEvent(new CustomEvent('zaya:pageChanged', {
                detail: { page: this.state.lastPage }
            }));
        }
    }

    // Load state from localStorage
    loadFromStorage() {
        try {
            const stored = {
                isRTL: localStorage.getItem('isRTL'),
                theme: localStorage.getItem('theme'),
                mediaVolume: localStorage.getItem('mediaVolume'),
                mediaLoop: localStorage.getItem('mediaLoop'),
                mediaMode: localStorage.getItem('mediaMode'),
                panelOpen: localStorage.getItem('panelOpen')
            };

            // Only update state with valid stored values
            Object.keys(stored).forEach(key => {
                if (stored[key] === null) return;
                if (key === 'isRTL' || key === 'panelOpen' || key === 'mediaLoop') {
                    this.state[key] = stored[key] === 'true';
                } else if (key === 'mediaVolume') {
                    const vol = parseInt(stored[key], 10);
                    this.state[key] = Number.isFinite(vol) ? Math.max(0, Math.min(100, vol)) : 50;
                } else if (key === 'mediaMode') {
                    this.state[key] = stored[key] === 'audio' ? 'audio' : 'youtube';
                } else {
                    this.state[key] = stored[key];
                }
            });

            // The document: `lastOpenedPDF` holds a filename for local files and a URL otherwise.
            // A local file cannot be reopened after a reload (its blob URL is gone), so keep only
            // the name; load.js turns that into the "re-select it" prompt.
            const storedPdf = localStorage.getItem('lastOpenedPDF');
            const storedType = localStorage.getItem('lastOpenedPDFType');
            if (storedPdf && storedPdf.trim() !== '') {
                if (storedType === 'local' || storedPdf.startsWith('blob:')) {
                    this.state.currentPdfType = 'local';
                    this.state.currentPdfName = storedPdf.startsWith('blob:') ? '' : storedPdf;
                    this.state.currentPdf = '';
                } else {
                    const safe = window.ValidationUtils && window.ValidationUtils.safePdfUrl
                        ? window.ValidationUtils.safePdfUrl(storedPdf)
                        : storedPdf;
                    if (safe) {
                        this.state.currentPdf = safe;
                        this.state.currentPdfType = 'url';
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load state from localStorage:', error);
        }
    }

    // Persist state to localStorage
    persistToStorage() {
        try {
            localStorage.setItem('isRTL', this.state.isRTL);
            localStorage.setItem('theme', this.state.theme);
            localStorage.setItem('mediaVolume', this.state.mediaVolume);
            localStorage.setItem('mediaLoop', this.state.mediaLoop);
            localStorage.setItem('mediaMode', this.state.mediaMode);
            localStorage.setItem('panelOpen', this.state.panelOpen);

            // The document is stored as a filename for local files and as a URL otherwise.
            // This is the only place `lastOpenedPDF` is written.
            localStorage.setItem('lastOpenedPDF', this.state.currentPdfType === 'local'
                ? (this.state.currentPdfName || '')
                : (this.state.currentPdf || ''));
            localStorage.setItem('lastOpenedPDFType', this.state.currentPdfType);
        } catch (error) {
            console.warn('Failed to persist state to localStorage:', error);
        }
    }

    // Update PDF context
    updatePdfContext(pdfUrl, pdfType, pdfName) {
        // Snapshot the previous state so listeners and zaya:* events fire on real changes.
        const prevState = { ...this.state };

        // If we have a blob URL, we must preserve it during toggles
        if (typeof pdfUrl === 'string' && pdfUrl.startsWith('blob:')) {
            this.state.currentPdf = pdfUrl;
            this.state.currentPdfType = 'local';
            this.state.currentPdfName = pdfName || this.state.currentPdfName;
        } else {
            this.state.currentPdf = pdfUrl;
            this.state.currentPdfType = pdfType;
            this.state.currentPdfName = pdfName || '';
        }
        
        this.persistToStorage();
        this.notifyListeners(prevState);
    }

    // Toggle RTL mode
    toggleRTL() {
        this.set({ isRTL: !this.state.isRTL });
        return this.state.isRTL;
    }

    // Update last page (in-memory only; persistence lives in pageMemory.js)
    setLastPage(page) {
        const num = parseInt(page, 10);
        if (isNaN(num) || num === this.state.lastPage) return;
        const prevState = { ...this.state };
        this.state = { ...this.state, lastPage: num };
        this.notifyListeners(prevState);
    }

    // Update theme
    setTheme(theme) {
        this.set({ theme });
    }

    // Update media volume
    setMediaVolume(volume) {
        this.set({ mediaVolume: volume });
    }

    // Toggle media loop
    setMediaLoop(loop) {
        this.set({ mediaLoop: loop });
    }

    // Remember which media source the reader last used ('youtube' | 'audio')
    setMediaMode(mode) {
        this.set({ mediaMode: mode === 'audio' ? 'audio' : 'youtube' });
    }

    // Toggle panel state
    setPanelOpen(isOpen) {
        this.set({ panelOpen: isOpen });
    }
}

// Global Plugin Registry for Zaya Extensions
class PluginRegistry {
    constructor() {
        this.plugins = new Map();
    }

    register(plugin) {
        if (!plugin || !plugin.id) {
            console.warn('[ZayaPlugins] Invalid plugin definition', plugin);
            return false;
        }
        if (this.plugins.has(plugin.id)) {
            console.warn(`[ZayaPlugins] Plugin ${plugin.id} is already registered.`);
            return false;
        }
        this.plugins.set(plugin.id, plugin);
        if (typeof plugin.init === 'function') {
            try {
                plugin.init(window.appState, window.ZayaUI);
            } catch (err) {
                console.error(`[ZayaPlugins] Error initializing plugin ${plugin.id}:`, err);
            }
        }
        console.log(`[ZayaPlugins] Registered plugin: ${plugin.name || plugin.id}`);
        return true;
    }

    get(id) {
        return this.plugins.get(id);
    }

    has(id) {
        return this.plugins.has(id);
    }

    getAll() {
        return Array.from(this.plugins.values());
    }
}

// Create global instances
const appState = new AppState();
window.appState = appState;
window.ZayaPlugins = window.ZayaPlugins || new PluginRegistry();

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState, PluginRegistry };
}
