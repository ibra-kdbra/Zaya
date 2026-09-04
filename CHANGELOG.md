# 📋 ZAYA - PDF FLIPBOOK CHANGELOG

## 🎯 Recent Updates (Latest commits)

- `search` - Full-text PDF search panel with snippets and Ctrl+F shortcut (2026-09-04)
- `mobile-fixes` - Visible controls, page numbers, tap/swipe and side-panel fixes on touch devices (2026-09-04)
- `hardening` - CSP, URL validation, escaped output, versioned service worker, vendored assets (2026-09-04)
- `core-perf` - 60fps Theme Engine & Vanilla JS Refactor (2026-07-25)
- `plugin-arch` - Added ZayaPlugins & ZayaUI Slot API (2026-07-25)
- `keyboard-nav` - Arrow keys navigation & Fullscreen shortcuts (2026-07-25)
- `zaya-rebrand` - Global rebranding to Zaya (2026-04-03)

### ✨ Latest Major Update - v5.5.0 Search, Mobile Fixes & Security Hardening (2026-09-04)

- **Full-Text Search (#16)**: New search panel next to thumbnails and outline. Text is extracted once per document with a small concurrency pool and cancellation, results list every matching page with highlighted snippets, and clicking a result jumps to the page. `Ctrl/Cmd+F` opens it.
- **Thumbnail Panel (#11)**: Wheel and touchpad scrolling inside the panel no longer zooms the book (guarded at the source in the stage, not only in the app layer). Thumbnail rows are cached and painted from the image cache, so scrolling back never re-renders; preloading starts sooner with two parallel renders.
- **Mobile & Touch (#11, #8)**: The bottom bar (with page numbers) is pinned on touch devices instead of relying on mouse hover. Tap-to-turn works on touch, swipes are measured from the gesture origin with a direction check, and the duplicate gesture handler that clicked non-existent buttons was removed. Side panels close on an outside tap, overlay the book on narrow screens instead of squeezing it, and closing a panel can no longer leave the book frozen (orbit controls now follow panel state).
- **Core Bug Fixes**: `loadFlipbook` threw a `ReferenceError` after every successful load, which also kept the loading lock stuck; `AppState.updatePdfContext` passed the new state as the previous state so no listener or `zaya:pdfLoaded` event ever fired; `zaya:pageChanged` is now emitted on page turns; the arrow-key handler ignores typing in inputs.
- **Security Hardening**: strict Content-Security-Policy on both pages (no `unsafe-eval`, no inline scripts), pdf.js loaded with `isEvalSupported:false`, `?pdf=` and stored URLs restricted to `http(s)`, all user-controlled text escaped before rendering (quotes were a stored-XSS vector), YouTube IDs URL-encoded, download links limited to `http(s)`/`blob:`, `eval()`-based feature probes removed.
- **Service Worker**: versioned cache name, best-effort precache (one missing file no longer blocks install), stale-while-revalidate for static assets, network-first for pages, PDFs and cross-origin requests never cached, message handler replies safely.
- **Performance**: scripts fetched in parallel with ordered execution, the 845 KB pdf.js worker is no longer executed on the main thread, no per-load cache-busting (assets are versioned by release), Tailwind precompiled instead of the runtime CDN, the changelog bundle and the GitHub API call removed from the main page, throttled mousemove handler, narrower MutationObserver.
- **Self-contained Assets**: Toastify, marked, Font Awesome and the compiled Tailwind CSS are vendored; the app has no runtime CDN dependency and works offline. Per-deployment settings moved to `config.js`.
- **Storage Robustness**: quotes database upgrades are additive (no more data loss on version bumps), open errors resolve instead of hanging forever, delete failures are reported, page memory retries after a failed open, `localStorage` writes are guarded.
- **Project Tooling**: `npm run check` (syntax), `npm run lint` (eslint), `npm test` (Playwright smoke tests incl. a mobile emulation), GitHub Actions CI, issue and PR templates, `SECURITY.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `ROADMAP.md`, and private-repo bootstrap templates under `.github/private-repo/`.
- **Backup & Restore**: Settings → Backup exports every quote plus preferences (theme, direction, volume, loop, bottom-bar mode) to a JSON file, and imports such a file with validation and de-duplication.
- **URL Presets**: `?theme=`, `?mode=single|double`, `?search=` and `?rtl=` parameters for shareable, embeddable links (values are allow-listed).
- **Accessibility**: focus trapping and Escape handling for the quotes and theme dialogs, `role`/`aria-label` on side panels and the control panel, icon-only buttons get `aria-label` from their tooltip.
- **Fixed**: the theme manager imported the quotes database from a wrong relative path, so theme changes were never persisted to IndexedDB.
- **Removed**: the 214 KB `flipbook.js.bak`, dead cache-purge code, the unused `#storedPage` writes, and `premium-plan.md` (moved to the private repository).

### ✨ Previous Major Update - v5.4.0 Core Performance Overhaul & Plugin Extension Architecture (2026-07-25)

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

### v5.5.0 - Search, Mobile Fixes & Security Hardening (2026-09-04)

- Full-text PDF search panel (issue #16)
- Thumbnail, touch, page-number and side-panel fixes (issues #11, #8)
- Strict CSP, input validation, escaped output, versioned service worker
- Vendored third-party assets and precompiled Tailwind; no runtime CDN
- CI, lint, syntax check and Playwright smoke tests

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
