// Provides enhanced mobile user experience and touch interactions

class MobileSupport {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.minSwipeDistance = 50;
        this.maxVerticalMovement = 100;

        this.init();
    }

    init() {
        this.detectMobile();
        // Swipe/tap page turning is owned by the flipbook stage (preview-stage.js);
        // a second gesture handler here caused double or reversed page turns.
        this.optimizeForMobile();
        this.addMobileSpecificFeatures();
    }

    /**
     * Detect if the current device is mobile
     * @returns {boolean} - True if mobile device
     */
    detectMobile() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        window.innerWidth <= 768;

        window.isMobile = isMobile;

        if (isMobile) {
            document.body.classList.add('mobile-device');
            console.log('Mobile device detected, enabling mobile optimizations');
        }

        return isMobile;
    }

    /**
     * Set up touch gesture handlers for page turning
     */
    setupTouchGestures() {
        if (!window.isMobile) return;

        const container = document.getElementById('flipbookContainer');
        if (!container) return;

        // Touch start
        container.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: false });

        // Touch end
        container.addEventListener('touchend', (e) => {
            this.touchEndX = e.changedTouches[0].clientX;
            this.touchEndY = e.changedTouches[0].clientY;
            this.handleSwipe();
        }, { passive: false });

        console.log('Touch gestures enabled for mobile devices');
    }

    /**
     * Handle swipe gestures for page turning
     */
    handleSwipe() {
        const deltaX = this.touchEndX - this.touchStartX;
        const deltaY = Math.abs(this.touchEndY - this.touchStartY);

        // Check if swipe is horizontal and not too vertical
        if (Math.abs(deltaX) > this.minSwipeDistance && deltaY < this.maxVerticalMovement) {
            if (deltaX > 0) {
                // Swipe right - previous page (LTR) or next page (RTL)
                this.navigatePage('previous');
            } else {
                // Swipe left - next page (LTR) or previous page (RTL)
                this.navigatePage('next');
            }
        }
    }

    /**
     * Navigate to next or previous page based on swipe direction
     * @param {string} direction - 'next' or 'previous'
     */
    navigatePage(direction) {
        // Find the flipbook navigation buttons
        const nextBtn = document.querySelector('.df-next-button, .flipbook-next');
        const prevBtn = document.querySelector('.df-prev-button, .flipbook-prev');

        // For RTL mode, swap the directions
        const isRTL = window.appState ? window.appState.get('isRTL') : false;

        if (direction === 'next') {
            if (isRTL) {
                prevBtn && prevBtn.click();
            } else {
                nextBtn && nextBtn.click();
            }
        } else if (direction === 'previous') {
            if (isRTL) {
                nextBtn && nextBtn.click();
            } else {
                prevBtn && prevBtn.click();
            }
        }

        // Provide haptic feedback if available
        this.triggerHapticFeedback();
    }

    /**
     * Trigger haptic feedback on mobile devices
     */
    triggerHapticFeedback() {
        if (navigator.vibrate) {
            navigator.vibrate(50); // 50ms vibration
        }
    }

    /**
     * Apply mobile-specific optimizations
     */
    optimizeForMobile() {
        if (!window.isMobile) return;

        // Add mobile-specific CSS
        const style = document.createElement('style');
        style.textContent = `
            .mobile-device .panel-container {
                width: 100vw !important;
                max-width: none !important;
                padding-bottom: 96px; /* keep the last section clear of the control bar */
            }

            .mobile-device .unified-panel-toggle {
                bottom: 20px !important;
                right: 20px !important;
            }

            .mobile-device #flipbookContainer canvas,
            .mobile-device #flipbookContainer .df-book-stage {
                touch-action: none;
            }

            .mobile-device #flipbookContainer .df-sidemenu,
            .mobile-device #flipbookContainer .df-thumb-wrapper,
            .mobile-device #flipbookContainer .df-outline-wrapper,
            .mobile-device #flipbookContainer .df-search-results {
                touch-action: pan-y;
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
            }

            .mobile-device .panel-input {
                font-size: 16px; /* Prevent zoom on iOS */
            }
        `;
        document.head.appendChild(style);

        // Adjust panel auto-hide for mobile
        this.adjustPanelForMobile();
    }

    /**
     * Adjust panel behavior for mobile devices
     */
    adjustPanelForMobile() {
        if (!window.isMobile) return;

        // Increase auto-hide time for mobile
        const originalStart = window.startAutoHideTimer;
        if (originalStart) {
            window.startAutoHideTimer = () => {
                clearTimeout(window.panelAutoHideTimer);
                window.panelAutoHideTimer = setTimeout(() => {
                    if (window.isPanelOpen) {
                        window.toggleUnifiedPanel();
                    }
                }, 10000); // 10 seconds for mobile
            };
        }
    }

    /**
     * Add mobile-specific UI features
     */
    addMobileSpecificFeatures() {
        if (!window.isMobile) return;

        // Add pull-to-refresh hint for mobile
        this.addPullToRefreshHint();

        // Add double-tap to toggle panel
        this.addDoubleTapToToggle();

        // Optimize scrolling behavior
        this.optimizeScrolling();
    }

    /**
     * Add pull-to-refresh hint
     */
    addPullToRefreshHint() {
        const hint = document.createElement('div');
        hint.id = 'mobileHint';
        hint.innerHTML = `
            <div style="
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                z-index: 1001;
                display: none;
            ">
                💡 Tap panel button for controls
            </div>
        `;
        document.body.appendChild(hint);

        // Show hint briefly on load
        setTimeout(() => {
            const hintEl = document.getElementById('mobileHint');
            if (hintEl) {
                hintEl.style.display = 'block';
                setTimeout(() => {
                    hintEl.style.display = 'none';
                }, 3000);
            }
        }, 2000);
    }

    /**
     * Add double-tap gesture to toggle panel
     */
    addDoubleTapToToggle() {
        let lastTap = 0;
        const container = document.getElementById('flipbookContainer');

        if (container) {
            let lastX = 0, lastY = 0;
            container.addEventListener('touchend', (e) => {
                if (e.target.closest('.df-sidemenu, #customControlBar')) return;
                const touch = e.changedTouches && e.changedTouches[0];
                if (!touch) return;
                const currentTime = Date.now();
                const tapLength = currentTime - lastTap;
                const close = Math.abs(touch.clientX - lastX) < 30 && Math.abs(touch.clientY - lastY) < 30;

                if (tapLength < 350 && tapLength > 0 && close) {
                    // Double tap in the same spot toggles the control panel
                    if (e.cancelable) e.preventDefault();
                    const btn = document.getElementById('toggleUnifiedPanelBtn');
                    if (btn) btn.click();
                    this.triggerHapticFeedback();
                    lastTap = 0;
                    return;
                }

                lastTap = currentTime;
                lastX = touch.clientX;
                lastY = touch.clientY;
            }, { passive: false });
        }
    }

    /**
     * Optimize scrolling behavior for mobile
     */
    optimizeScrolling() {
        // Prevent overscroll on mobile
        document.addEventListener('touchmove', (e) => {
            if (!e.target.closest('#flipbookContainer')) return;
            // Scrollable panels and the control bar must keep native touch scrolling
            if (e.target.closest('.df-sidemenu, .df-thumb-wrapper, .df-outline-wrapper, .df-search-results, #customControlBar, .panel-container')) return;
            if (e.cancelable) e.preventDefault();
        }, { passive: false });

        // Add viewport meta tag optimization
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
    }

    /**
     * Show mobile-optimized loading indicators
     */
    showMobileLoading() {
        if (!window.isMobile) return;

        const loading = document.createElement('div');
        loading.id = 'mobileLoading';
        loading.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                color: white;
            ">
                <div style="text-align: center;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">📚</div>
                    <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">Loading Zaya</div>
                    <div style="font-size: 1rem; opacity: 0.8;">Preparing your reading experience...</div>
                </div>
            </div>
        `;
        document.body.appendChild(loading);

        // Hide loading after 2 seconds
        setTimeout(() => {
            const loadingEl = document.getElementById('mobileLoading');
            if (loadingEl) {
                loadingEl.style.opacity = '0';
                setTimeout(() => loadingEl.remove(), 500);
            }
        }, 2000);
    }
}

// Initialize mobile support
const mobileSupport = new MobileSupport();

// Make available globally
window.mobileSupport = mobileSupport;

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileSupport;
}
