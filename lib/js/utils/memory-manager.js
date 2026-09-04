// Handles proper disposal of resources to prevent memory leaks

class MemoryManager {
    constructor() {
        this.resources = new Set();
        this.cleanupTasks = [];
        this.performanceMonitor = null;
    }

    /**
     * Register a resource for cleanup
     * @param {Object} resource - Resource object with cleanup method
     * @param {string} type - Type of resource (pdf, youtube, etc.)
     */
    registerResource(resource, type) {
        if (resource && typeof resource === 'object') {
            resource._memoryId = Date.now() + Math.random();
            resource._resourceType = type;
            this.resources.add(resource);

            // console.log(`Registered ${type} resource:`, resource._memoryId);
        }
    }

    /**
     * Unregister a resource
     * @param {Object} resource - Resource to unregister
     */
    unregisterResource(resource) {
        if (resource && this.resources.has(resource)) {
            this.resources.delete(resource);
            // console.log(`Unregistered resource:`, resource._memoryId);
        }
    }

    /**
     * Add a cleanup task to be executed
     * @param {Function} task - Cleanup function
     * @param {string} description - Description for logging
     */
    addCleanupTask(task, description = 'cleanup task') {
        this.cleanupTasks.push({ task, description });
    }

    /**
     * Execute all cleanup tasks
     */
    cleanup() {
        // console.log(`Starting memory cleanup. ${this.resources.size} resources registered.`);

        // Execute cleanup tasks
        this.cleanupTasks.forEach(({ task, description }) => {
            try {
                task();
                // console.log(`Executed cleanup: ${description}`);
            } catch (error) {
                console.error(`Error during cleanup (${description}):`, error);
            }
        });

        // Clear cleanup tasks
        this.cleanupTasks = [];

        // Force garbage collection if available (development only)
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
            // console.log('Forced garbage collection');
        }

        // console.log('Memory cleanup completed');
    }

    /**
     * Clean up PDF-specific resources
     * @param {Object} [options]
     * @param {boolean} [options.revokeBlobs=true] - revoke blob: URLs owned by those resources.
     *   Pass false when the same document is being reloaded (RTL toggle): its blob URL must survive.
     */
    cleanupPDF(options = {}) {
        const revokeBlobs = options.revokeBlobs !== false;
        // Find and clean up PDF resources
        const pdfResources = Array.from(this.resources).filter(r => r._resourceType === 'pdf');

        pdfResources.forEach(resource => {
            try {
                if (resource.dispose && typeof resource.dispose === 'function') {
                    resource.dispose();
                }
                if (resource.destroy && typeof resource.destroy === 'function') {
                    resource.destroy();
                }
                // Clean up blob URLs
                if (revokeBlobs && resource.url && resource.url.startsWith('blob:')) {
                    URL.revokeObjectURL(resource.url);
                }
                this.unregisterResource(resource);
            } catch (error) {
                console.error('Error cleaning up PDF resource:', error);
            }
        });

        // Clear flipbook container
        const container = document.getElementById('flipbookContainer');
        if (container) {
            container.innerHTML = '';
        }

        // console.log(`Cleaned up ${pdfResources.length} PDF resources`);
    }

    /**
     * Clean up YouTube player resources
     */
    cleanupYouTube() {
        // Find and clean up YouTube resources
        const youtubeResources = Array.from(this.resources).filter(r => r._resourceType === 'youtube');

        youtubeResources.forEach(resource => {
            try {
                if (resource.destroy && typeof resource.destroy === 'function') {
                    resource.destroy();
                }
                this.unregisterResource(resource);
            } catch (error) {
                console.error('Error cleaning up YouTube resource:', error);
            }
        });

        // Reset YouTube player iframe
        const player = document.getElementById('youtubePlayer');
        if (player) {
            player.src = '';
        }

        // console.log(`Cleaned up ${youtubeResources.length} YouTube resources`);
    }

    /**
     * Clean up all resources
     */
    cleanupAll() {
        this.cleanupPDF();
        this.cleanupYouTube();

        // Clean up any remaining resources
        this.resources.forEach(resource => {
            try {
                if (resource.dispose && typeof resource.dispose === 'function') {
                    resource.dispose();
                }
                if (resource.destroy && typeof resource.destroy === 'function') {
                    resource.destroy();
                }
                if (resource.cleanup && typeof resource.cleanup === 'function') {
                    resource.cleanup();
                }
            } catch (error) {
                console.error('Error cleaning up resource:', error);
            }
        });

        this.resources.clear();
        this.cleanup();

        // console.log('All resources cleaned up');
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        if (typeof PerformanceObserver !== 'undefined') {
            this.performanceMonitor = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (entry.entryType === 'measure') {
                        console.log(`Performance: ${entry.name} took ${entry.duration}ms`);
                    }
                });
            });

            this.performanceMonitor.observe({ entryTypes: ['measure'] });
            // console.log('Performance monitoring started');
        }
    }

    /**
     * Stop performance monitoring
     */
    stopPerformanceMonitoring() {
        if (this.performanceMonitor) {
            this.performanceMonitor.disconnect();
            this.performanceMonitor = null;
            // console.log('Performance monitoring stopped');
        }
    }

    /**
     * Measure performance of a function
     * @param {Function} fn - Function to measure
     * @param {string} name - Name for the measurement
     * @returns {*} - Return value of the function
     */
    measurePerformance(fn, name = 'anonymous') {
        if (typeof performance !== 'undefined' && performance.mark) {
            const startMark = `${name}-start`;
            const endMark = `${name}-end`;

            performance.mark(startMark);
            const result = fn();
            performance.mark(endMark);
            performance.measure(name, startMark, endMark);

            return result;
        } else {
            // Fallback for browsers without performance.mark
            const start = Date.now();
            const result = fn();
            const duration = Date.now() - start;
            console.log(`Performance: ${name} took ${duration}ms`);
            return result;
        }
    }

    /**
     * Get memory usage information
     * @returns {Object} - Memory usage stats
     */
    getMemoryUsage() {
        if (typeof performance !== 'undefined' && performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }

        return {
            available: false,
            message: 'Memory monitoring not available in this browser'
        };
    }

    /**
     * Log current memory usage
     */
    logMemoryUsage() {
        const memory = this.getMemoryUsage();
        if (memory.available) {
            // console.log(`Memory Usage: ${memory.usedMB}MB / ${memory.totalMB}MB (Limit: ${memory.limitMB}MB)`);
        } else {
            // console.log('Memory monitoring not available');
        }
    }
}

// Create global instance
const memoryManager = new MemoryManager();

// Make available globally
window.memoryManager = memoryManager;

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryManager;
}

// Auto-cleanup on page unload
window.addEventListener('beforeunload', () => {
    memoryManager.cleanupAll();
});

// Auto-cleanup on page visibility change (when tab becomes hidden)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, do light cleanup
        memoryManager.cleanup();
    }
});
