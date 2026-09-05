// Provides secure validation for URLs, files, and user inputs

/*
 * Validation messages reach the reader as toasts, so they are translated. This file loads before
 * the dictionaries, hence the English fallback on every call: it is only ever used if something
 * validates before `ZayaI18n` exists.
 */
function tr(key, vars, fallback) {
    return window.ZayaI18n ? window.ZayaI18n.t(key, vars) : fallback;
}

/**
 * Validates if a string is a valid URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        const urlObj = new URL(url);
        // Check for valid protocols
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (e) {
        return false;
    }
}

/**
 * Validates if a URL points to a PDF file
 * @param {string} url - The URL to check
 * @returns {boolean} - True if likely a PDF URL
 */
function isValidPdfUrl(url) {
    if (!isValidUrl(url)) {
        return false;
    }

    // Check file extension or common PDF patterns
    const pdfPatterns = [
        /\.pdf(\?.*)?$/i,  // .pdf extension
        /\/pdf\//i,        // Common PDF directory
        /document/i,       // Generic document patterns
        /file/i
    ];

    return pdfPatterns.some(pattern => pattern.test(url));
}

/**
 * Validates file input for PDF uploads with enhanced security
 * @param {File} file - The file object to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result with isValid boolean and error message
 */
function validatePdfFile(file, options = {}) {
    const result = {
        isValid: false,
        error: null
    };

    // Default options
    const defaults = {
        maxSize: 150 * 1024 * 1024, // 150MB
        minSize: 1024, // 1KB minimum
        allowedTypes: ['application/pdf', 'application/x-pdf'],
        allowedExtensions: ['.pdf']
    };

    const config = { ...defaults, ...options };

    if (!file) {
        result.error = tr('validate.noFile', null, "No file selected.");
        return result;
    }

    // Check file type - stricter validation
    if (!config.allowedTypes.includes(file.type)) {
        // Also check MIME type spoofing via file extension
        const fileName = file.name.toLowerCase();
        const hasValidExtension = config.allowedExtensions.some(ext => fileName.endsWith(ext));

        if (!hasValidExtension) {
            result.error = tr('validate.notPdf', null, "That is not a PDF file. Choose a file ending in .pdf.");
            return result;
        }

        // Warn about potential MIME type spoofing
        console.warn('File extension matches PDF but MIME type is:', file.type);
    }

    // Enhanced file size validation
    if (file.size > config.maxSize) {
        const maxSizeMB = (config.maxSize / (1024 * 1024)).toFixed(1);
        result.error = tr('validate.tooBig', { n: maxSizeMB }, `The file has to be smaller than ${maxSizeMB} MB.`);
        return result;
    }

    if (file.size < config.minSize) {
        const minSizeKB = (config.minSize / 1024).toFixed(0);
        result.error = tr('validate.tooSmall', { n: minSizeKB }, `The file looks too small to be a PDF (under ${minSizeKB} KB).`);
        return result;
    }

    // Check file name for suspicious patterns
    const suspiciousNamePatterns = [
        /<script/i,
        /javascript/i,
        /on\w+\s*=/i,
        /\.\./,  // Directory traversal
        /[<>:"|?*\x00-\x1F]/  // Invalid filename characters
    ];

    if (suspiciousNamePatterns.some(pattern => pattern.test(file.name))) {
        result.error = tr('validate.badFilename', null, "The filename contains characters that cannot be used.");
        return result;
    }

    // Check file name length
    if (file.name.length > 255) {
        result.error = tr('validate.longFilename', null, "The filename is too long.");
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Sanitizes user input with comprehensive security measures
 * @param {string} input - The input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    let sanitized = input.trim();

    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    // Strip protocol handlers that could be abused if the text ever ends up in an href
    sanitized = sanitized.replace(/(?:javascript|data|vbscript):/gi, '');

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');

    // Limit length to prevent DoS attacks
    if (sanitized.length > 2000) {
        sanitized = sanitized.substring(0, 2000) + '...';
    }

    return sanitized;
}

/**
 * Validates and sanitizes URL with enhanced security checks
 * @param {string} url - The URL to validate and sanitize
 * @returns {Object} - Result with isValid, sanitizedUrl, and error message
 */
function validateAndSanitizeUrl(url) {
    const result = {
        isValid: false,
        sanitizedUrl: '',
        error: null
    };

    if (!url || typeof url !== 'string') {
        result.error = tr('validate.urlRequired', null, 'Enter an address.');
        return result;
    }

    try {
        const urlObj = new URL(url);

        // Enhanced protocol validation
        const allowedProtocols = ['http:', 'https:'];
        if (!allowedProtocols.includes(urlObj.protocol)) {
            result.error = tr('validate.schemeOnly', null, 'Only http and https addresses can be opened.');
            return result;
        }

        // Check for suspicious hostnames
        const suspiciousPatterns = [
            /localhost/i,
            /127\.0\.0\.1/i,
            /0\.0\.0\.0/i,
            /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // Basic IP detection
            /internal/i,
            /admin/i,
            /config/i
        ];

        // Allow localhost for development but warn
        const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';

        if (suspiciousPatterns.some(pattern => pattern.test(urlObj.hostname)) && !isLocalhost) {
            result.error = tr('validate.suspicious', null, 'That address contains something Zaya will not open.');
            return result;
        }

        // Check hostname length (reasonable limits)
        if (urlObj.hostname.length > 253) {
            result.error = tr('validate.hostTooLong', null, 'The host name in that address is too long.');
            return result;
        }

        // Validate port (if specified)
        if (urlObj.port && (parseInt(urlObj.port) < 1 || parseInt(urlObj.port) > 65535)) {
            result.error = tr('validate.badPort', null, 'That address has an invalid port number.');
            return result;
        }

        result.sanitizedUrl = urlObj.href;
        result.isValid = true;

    } catch (e) {
        result.error = tr('validate.badUrl', null, 'That address is not valid.');
    }

    return result;
}

/**
 * Validates YouTube URL with enhanced patterns
 * @param {string} url - The YouTube URL to validate
 * @returns {Object} - Validation result with isValid, videoId, playlistId
 */
function validateYouTubeUrl(url) {
    const result = {
        isValid: false,
        videoId: null,
        playlistId: null,
        error: null
    };

    if (!url || typeof url !== 'string') {
        result.error = tr('validate.badUrl', null, 'That address is not valid.');
        return result;
    }

    try {
        const urlObj = new URL(url);

        // Must be youtube.com or youtu.be
        if (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be')) {
            result.error = tr('validate.badYoutube', null, 'That is not a YouTube address.');
            return result;
        }

        // Enhanced video ID extraction
        const videoPatterns = [
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
            /youtube\.com\/embed\/([^"&?\/\s]{11})/i,
            /youtube\.com\/v\/([^"&?\/\s]{11})/i
        ];

        for (let pattern of videoPatterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                result.videoId = match[1];
                break;
            }
        }

        // Playlist ID extraction
        const playlistMatch = url.match(/[?&]list=([^"&?\/\s]+)/i);
        if (playlistMatch) {
            result.playlistId = playlistMatch[1];
        }

        // Direct v= parameter fallback
        if (!result.videoId) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) {
                result.videoId = vParam;
            }
        }

        if (result.videoId || result.playlistId) {
            result.isValid = true;
        } else {
            result.error = tr('validate.noYoutubeId', null, 'No video or playlist could be found in that address.');
        }

    } catch (e) {
        result.error = tr('validate.badUrl', null, 'That address is not valid.');
    }

    return result;
}

/**
 * Checks if the current browser supports required features
 * @returns {Object} - Support status for each feature
 */
function checkBrowserSupport() {
    return {
        webgl: (() => {
            try {
                const canvas = document.createElement('canvas');
                return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
            } catch (e) {
                return false;
            }
        })(),
        fileApi: !!(window.File && window.FileReader && window.FileList && window.Blob),
        indexeddb: !!(window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB),
        localstorage: (() => {
            try {
                const test = '__storage_test__';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return true;
            } catch (e) {
                return false;
            }
        })()
    };
}

/**
 * Escape a string for safe insertion into HTML markup.
 * Use this (or textContent) every time untrusted text is placed into innerHTML / jQuery.html().
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Validate a PDF URL that arrived from an untrusted source (query string, storage).
 * Only http(s) is accepted; anything else returns null.
 * @param {string} url
 * @returns {string|null}
 */
function safePdfUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) return null;
    if (/[\x00-\x1F\x7F<>"'`]/.test(trimmed)) return null;
    try {
        const parsed = new URL(trimmed, window.location.href);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch (e) {
        return null;
    }
}

// Make available globally for non-module scripts
window.ValidationUtils = {
    isValidUrl,
    isValidPdfUrl,
    validatePdfFile,
    sanitizeInput,
    validateAndSanitizeUrl,
    validateYouTubeUrl,
    checkBrowserSupport,
    escapeHtml,
    safePdfUrl
};
