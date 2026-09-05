// Provides comprehensive browser support checking and graceful degradation

/**
 * Comprehensive browser compatibility check
 * @returns {Object} - Detailed compatibility report
 */
function checkBrowserCompatibility() {
    const compatibility = {
        supported: true,
        warnings: [],
        errors: [],
        features: {}
    };

    // Core Web APIs
    compatibility.features.webgl = checkWebGLSupport();
    compatibility.features.fileApi = checkFileAPISupport();
    compatibility.features.indexeddb = checkIndexedDBSupport();
    compatibility.features.localstorage = checkLocalStorageSupport();
    compatibility.features.url = checkURLSupport();
    compatibility.features.fetch = checkFetchSupport();
    compatibility.features.promises = checkPromiseSupport();

    // PDF.js specific requirements
    compatibility.features.pdfJs = checkPDFJsRequirements();

    // Modern JavaScript features
    compatibility.features.es6 = checkES6Support();
    compatibility.features.async = checkAsyncSupport();

    // Check for critical features
    if (!compatibility.features.webgl.supported) {
        compatibility.errors.push('WebGL is not supported. 3D flipbook effects will not work.');
        compatibility.supported = false;
    }

    if (!compatibility.features.fileApi.supported) {
        compatibility.warnings.push('File API not supported. Local PDF upload will not work.');
    }

    if (!compatibility.features.indexeddb.supported) {
        compatibility.warnings.push('IndexedDB not supported. Page memory and quotes will use fallback storage.');
    }

    if (!compatibility.features.localstorage.supported) {
        compatibility.warnings.push('LocalStorage not supported. Settings will not persist.');
    }

    if (!compatibility.features.fetch.supported) {
        compatibility.warnings.push('Fetch API not supported. Some features may not work properly.');
    }

    return compatibility;
}

/**
 * Check WebGL support for 3D effects
 * @returns {Object} - WebGL support status
 */
function checkWebGLSupport() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return {
            supported: !!gl,
            version: gl ? 'WebGL' : null,
            vendor: gl ? gl.getParameter(gl.VENDOR) : null,
            renderer: gl ? gl.getParameter(gl.RENDERER) : null
        };
    } catch (e) {
        return {
            supported: false,
            error: e.message
        };
    }
}

/**
 * Check File API support for local PDF uploads
 * @returns {Object} - File API support status
 */
function checkFileAPISupport() {
    return {
        supported: !!(window.File && window.FileReader && window.FileList && window.Blob),
        file: !!window.File,
        fileReader: !!window.FileReader,
        fileList: !!window.FileList,
        blob: !!window.Blob
    };
}

/**
 * Check IndexedDB support for advanced storage
 * @returns {Object} - IndexedDB support status
 */
function checkIndexedDBSupport() {
    return {
        supported: !!(window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB),
        native: !!window.indexedDB,
        moz: !!window.mozIndexedDB,
        webkit: !!window.webkitIndexedDB,
        ms: !!window.msIndexedDB
    };
}

/**
 * Check LocalStorage support
 * @returns {Object} - LocalStorage support status
 */
function checkLocalStorageSupport() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return {
            supported: true
        };
    } catch (e) {
        return {
            supported: false,
            error: e.message
        };
    }
}

/**
 * Check URL API support
 * @returns {Object} - URL API support status
 */
function checkURLSupport() {
    return {
        supported: !!(window.URL && window.URL.createObjectURL),
        url: !!window.URL,
        createObjectURL: !!(window.URL && window.URL.createObjectURL),
        revokeObjectURL: !!(window.URL && window.URL.revokeObjectURL)
    };
}

/**
 * Check Fetch API support
 * @returns {Object} - Fetch API support status
 */
function checkFetchSupport() {
    return {
        supported: !!(window.fetch && window.Request && window.Response),
        fetch: !!window.fetch,
        request: !!window.Request,
        response: !!window.Response
    };
}

/**
 * Check Promise support
 * @returns {Object} - Promise support status
 */
function checkPromiseSupport() {
    return {
        supported: !!(window.Promise && typeof window.Promise.resolve === 'function'),
        native: !!window.Promise,
        polyfill: !!(window.Promise && window.Promise._babelPolyfill) // Detect polyfill
    };
}

/**
 * Check PDF.js specific requirements
 * @returns {Object} - PDF.js compatibility status
 */
function checkPDFJsRequirements() {
    const requirements = {
        supported: true,
        issues: []
    };

    // Check for required APIs
    if (!checkFetchSupport().supported && !window.XMLHttpRequest) {
        requirements.supported = false;
        requirements.issues.push('No HTTP request API available');
    }

    if (!checkPromiseSupport().supported) {
        requirements.supported = false;
        requirements.issues.push('Promises not supported');
    }

    if (!checkURLSupport().supported) {
        requirements.supported = false;
        requirements.issues.push('URL API not supported');
    }

    return requirements;
}

/**
 * Check ES6 features support
 * @returns {Object} - ES6 support status
 */
function checkES6Support() {
    const features = {
        supported: true,
        arrowFunctions: true,
        templateLiterals: true,
        destructuring: true,
        promises: checkPromiseSupport().supported,
        modules: checkModuleSupport()
    };

    // This file itself is written in ES2015+ syntax: if it parsed and is executing, arrow functions,
    // template literals and destructuring are supported. No eval() needed (keeps the CSP strict).
    return features;
}

/**
 * Check async/await support
 * @returns {Object} - Async/await support status
 */
function checkAsyncSupport() {
    return {
        supported: checkAsyncFunctionSupport(),
        async: checkAsyncFunctionSupport(),
        await: checkAsyncFunctionSupport()
    };
}

/**
 * Check if async functions are supported
 * @returns {boolean} - Async function support
 */
function checkAsyncFunctionSupport() {
    // The app loader (lib/js/app.js) is an async function; reaching this code proves support.
    return typeof Promise !== 'undefined' && typeof Symbol !== 'undefined' && typeof Symbol.asyncIterator !== 'undefined';
}

/**
 * Check ES6 module support
 * @returns {Object} - Module support status
 */
function checkModuleSupport() {
    // lib/js/app.js is loaded with type="module"; browsers without module support never run it.
    const supported = 'noModule' in document.createElement('script');
    return { supported, import: supported, export: supported };
}

/**
 * Initialize compatibility checks and show warnings if needed
 */
function initializeCompatibilityChecks() {
    const compatibility = checkBrowserCompatibility();

    if (!compatibility.supported) {
        console.error('Browser compatibility issues detected:', compatibility.errors);
        showCompatibilityError(compatibility.errors);
    }

    if (compatibility.warnings.length > 0) {
        console.warn('Browser compatibility warnings:', compatibility.warnings);
        showCompatibilityWarnings(compatibility.warnings);
    }

    // Store compatibility info globally
    window.browserCompatibility = compatibility;

    return compatibility;
}

/**
 * Show compatibility errors to user
 * @param {Array} errors - List of error messages
 */
function showCompatibilityError(errors) {
    const errorMessage = errors.join('\n• ');
    Toastify({
        text: `Browser Compatibility Issues:\n• ${errorMessage}`,
        duration: 10000,
        gravity: "top",
        position: "center",
        backgroundColor: "#dc2626",
        style: {
            whiteSpace: "pre-line",
            maxWidth: "500px"
        }
    }).showToast();
}

/**
 * Show compatibility warnings to user
 * @param {Array} warnings - List of warning messages
 */
function showCompatibilityWarnings(warnings) {
    const warningMessage = warnings.join('\n• ');
    Toastify({
        text: `Compatibility Warnings:\n• ${warningMessage}`,
        duration: 8000,
        gravity: "top",
        position: "right",
        backgroundColor: "#f59e0b",
        style: {
            whiteSpace: "pre-line",
            maxWidth: "400px"
        }
    }).showToast();
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkBrowserCompatibility,
        initializeCompatibilityChecks
    };
}

// Make available globally
window.BrowserCompatibility = {
    checkBrowserCompatibility,
    initializeCompatibilityChecks,
    checkWebGLSupport,
    checkFileAPISupport,
    checkIndexedDBSupport,
    checkLocalStorageSupport
};
