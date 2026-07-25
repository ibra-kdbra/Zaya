# 📋 ZAYA - PDF FLIPBOOK CHANGELOG

## 🎯 Recent Updates (Latest commits)

- `core-perf` - 60fps Theme Engine & Vanilla JS Refactor (2026-07-25)
- `plugin-arch` - Added ZayaPlugins & ZayaUI Slot API (2026-07-25)
- `keyboard-nav` - Arrow keys navigation & Fullscreen shortcuts (2026-07-25)
- `zaya-rebrand` - Global rebranding to Zaya (2026-04-03)

### ✨ Latest Major Update - v5.4.0 Core Performance Overhaul & Plugin Extension Architecture (2026-07-25)

- **Theme Engine Optimization**: Completely removed `$('*')` DOM tree class manipulation in `manager.js`. Themes now apply to root `document.documentElement` (`<html class="theme-...">`) for zero layout reflow lag and 60fps instant theme transitions via CSS custom properties.
- **Theme Selector Performance Refactoring**: Pre-calculated and cached theme palette colors in `selector.js`, eliminating temporary `$('<div class="theme-...">')` DOM insertion loops during theme search. Refactored modal to pure Vanilla JS with 100ms search input debouncing.
- **Zaya Core Plugin Registry (`ZayaPlugins`)**: Introduced an event-driven plugin extension system in `app-state.js` emitting standardized events: `zaya:pdfLoaded`, `zaya:pageChanged`, `zaya:themeChanged`, `zaya:toolbarReady`, and `zaya:init`.
- **Zaya UI Extension Slots (`ZayaUI`)**: Implemented `ZayaUI.registerToolbarButton()` and `ZayaUI.registerPanelTab()` slot APIs in `controls.js` to allow Pro/private plugins to inject UI components cleanly without touching core HTML/JS.
- **Keyboard Navigation Shortcuts**: Added Left (`←`) and Right (`→`) arrow keys for page turns, `F` key for Fullscreen toggle, and `Cmd+K` for the control panel.
- **Optional Pro Loader**: Integrated a non-blocking script loader in `app.js` (`lib/js/pro-features/index.js`) for seamless private repository feature integration.

### ✨ Previous Major Update - v5.3.0 The Zaya Transition (2026-04-03)

- **Global Rebranding**: Complete transition from Paginis to **Zaya**, including a new logo and a centralized naming convention for all variables and assets.
- **Integrated Media Loop**: Added persistent "Auto Repeat" controls directly within the Audio player and Video control modals for better contextual access.
- **Architectural Clarity**: Refactored the Service Worker system into a distinct `sw-manager.js` (UI-thread manager) and `sw.js` (background worker) for improved reliability and developer clarity.
- **Enhanced Configuration**: Implemented support for `window.ZAYA_DEFAULT_PDF` and URL-based PDF loading (`?pdf=`) for easier deployment.
- **Critical Stability Fixes**:
  - Resolved `ReferenceError` crashes during local file imports in `media.js`.
  - Fixed 404 errors for the root Service Worker file that prevented offline support.
  - Eliminated race conditions during IndexedDB initialization in `db.js`.

### ✨ Previous Major Update - v5.1.1 Feature Expansion & Navigation Polish (2026-02-06)

- **Cinematic Single Page Mode**: Fixed 3D camera centering and implemented synchronized dynamic lighting to ensure focused pages are perfectly illuminated.
- **Unified Media Player**: Redesigned the media section with a sleek mode switcher and custom themed audio player, eliminating unnecessary windows for audio content.
- **Local Audio Support**: Integrated local file imports for audio playback, featuring real-time progress tracking and synchronized volume controls.
- **Restored Navigation**: Resolved issues with UI arrows and keyboard shortcuts by implementing missing navigation methods in the modular factory.
- **Intelligent Device Adaptation**: Added automatic device detection to choose the optimal display mode (Booklet vs. Zoom) for mobile and desktop users.

### ✨ Previous Major Update - v5.0.0 Core Modernization & UI Enhancement (2026-01-12)

- **Library Modularization**: Completely refactored the DFlip core library into a modular ES6 structure, enabling easier bug fixing and feature development.
- **Critical Scroll Fix**: Resolved a major conflict where scrolling through the thumbnail or bookmark lists would accidentally trigger the flipbook's zoom or page-turn logic.
- **UI & Icon Modernization**: Replaced all legacy emojis with a cohesive set of colored Font Awesome icons for a professional, consistent look.
- **Theme System Overhaul**: Implemented universal theme toggling that works across the entire project structure, ensuring visual consistency in all modes.
- **Control Panel Redesign**: Major restyling of the right-side control panel and quotes module for better UX and modern aesthetics.
- **Bottom Panel Enhancement**: Applied a new theme and integrated advanced controls into the bottom bar, including the new page number entry system.
- **Style Refactoring**: Eliminated technical debt by removing absolute paths and consolidated persistent styles into a central, modular entry point.
- **Performance Analytics**: Integrated a real-time dashboard into the changelog, providing live metrics and optimization suggestions.
- **Code Cleanup**: Removed legacy unused code and deprecated event listeners to streamline the application skeleton.

### ✨ Previous Major Update - v4.5.0 UI Modernization & Architecture Refinement (2026-01-03)

- **UI Overhaul & Modernization**: Replaced legacy color schemes with a dynamic, theme-aware system.
- **Bottom Panel Integration**: Migrated flipbook controls directly into the bottom panel for a unified experience.
- **Robust Persistence**: Fixed theme and PDF state management to ensure preferences are preserved across reloads.
- **Technical Debt Removal**: Eliminated hardcoded hex colors in favor of modular CSS custom properties.

---

## 🚀 Major Features & Improvements

### ⚡ Performance & Analytics

- **Live Monitoring**: Real-time tracking of memory usage and rendering performance via `PerformanceMonitor`.
- **Optimization Layer**: Automatic application of rendering optimizations for smoother flip transitions.
- **Core Refactoring**: Complete modernization of the DFlip core into ES6 modules for improved reliability.
- **Standardized Events**: Modern `wheel` event implementation for conflict-free sidebar scrolling.

### 📱 Mobile & UX Experience

- **Multi-Modal Media**: Unified YouTube and Local Audio player with a sleek switcher UI.
- **Touch Gesture Support**: Optimized swipe navigation for tablets and smartphones.
- **Smart Sidebars**: Hover-aware sidebars that prevent accidental interactions while providing quick access.
- **Custom Loaders**: Themed "flipping book" loading indicators for a branded experience.
- **Haptic Feedback**: Vibration support for mobile navigation events.

### ✨ Icon & Theme System

- **Icon Conversion**: Full migration from emojis to colored Font Awesome icon sets for all controls and headers.
- **Dynamic Variables**: Comprehensive CSS custom property system for effortless theme switching.
- **Relative Pathing**: Robust asset loading compatible with any deployment environment (local or server).

---

## 🔧 Technical Improvements

### 🛡️ Security & Architecture

- **Input Validation Framework**: Comprehensive sanitization for all URLs and file uploads.
- **State Management System**: Centralized, event-driven `AppState` class replacing global variables.
- **Modular Refactoring**: Clean separation of concerns with feature-based folder organization.
- **Browser Compatibility**: Robust feature detection and graceful degradation across all modules.

### ⚡ Performance Optimization

- **Memory Management**: Automatic resource cleanup for heavy PDF and YouTube instances.
- **Rendering Efficiency**: Applied Three.js and DFlip optimizations to fix rendering/loading stalls.
- **Script Loading**: Sequentially loaded dynamic scripts with cache-busting and error handling.

---

## 🐛 Bug Fixes & Maintenance

### ✅ Critical Bug Fixes

- **Zoom Conflict**: Fixed major issue where scrolling thumbnail/bookmark lists triggered book zooming.
- **CORS Issues**: Finalized resolution for cross-origin PDF loading across different environments.
- **Persistence Bugs**: Fixed theme and PDF state loss during page transitions.
- **Synchronization**: Resolved RTL/LTR toggle state desync issues.
- **Modal Layering**: Fixed z-index and race conditions for nested modal displays.

---

## 🔄 Version History

### v5.4.0 - Core Performance Overhaul & Plugin Extension Architecture (2026-07-25)

- 60fps Theme Engine refactoring with root CSS variable cascading
- Pure Vanilla JS Theme Selector with cached palette rendering and 100ms debouncing
- Zaya Core Plugin Registry (`ZayaPlugins`) & UI Slot APIs (`ZayaUI`)
- Arrow keys navigation & Fullscreen shortcuts

### v5.3.0 - Zaya Rebrand & Media Polish (2026-04-03)

- Global rebranding to Zaya
- Integrated Media Loop for Audio/Video
- Service Worker system refactored into `sw-manager.js`

### v5.1.1 - Feature Expansion (2026-02-06)

- Implemented Cinematic Single Page centering
- Added Unified Media Player with Local Audio support
- Fixed UI Arrow and Keyboard navigation
- Synchronized lighting with camera movement

### v5.0.0 - Core Modernization (2026-01-12)

- Modularized DFlip core for better maintainability
- Fixed scroll conflicts in sidebars
- Restyled control panel and bottom bar
- Implemented universal theme toggling
- Modernized all icons to Font Awesome
- Added performance analytics dashboard

### v4.5.0 - UI Modernization (2026-01-03)

- Replaced legacy color scheme with theme-aware system
- Integrated controls into bottom panel
- Fixed theme persistence bugs

### v4.4.0 - Architecture Cleanup (2025-12-22)

- Enhanced PDF fallback system
- Centralized configuration in `app-state.js`
- Fixed RTL/LTR toggle synchronization

### v4.0.0 - Major Overhaul (2025-11-01)

- Security hardening and input validation
- UX enhancement and mobile support

### v1.0.0 (2024-10-24)

- Initial release with basic flipbook and core integration

---

## 📝 Notes

- All changes since January 2026 are included in the v5.0.0 milestone.
- The project now follows a more modular, feature-oriented architecture.
- Core library dependencies have been optimized for better rendering performance.

---
