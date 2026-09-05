# Changelog

All notable changes to Zaya are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0] - 2026-09-04

The reading interface was rebuilt around the document: a quieter theme, a real search, and a
touch-first layout. The version number jumps to 6.0.0 because the look, the layout rules and the
navigation model all changed.

### Added
- **Navigator and control panel**: the two side drawers were rebuilt: a titled Navigator with Pages (tile grid, two columns on phones), Outline (tree with indent lines) and Search tabs; a control panel with Document / Notes / Media / Settings tabs whose actions are labelled and show their state, a document header with page count, and a footer with the version.
- **Navigation model by device class**: on screens 1200px and wider the drawers dock beside the book, which re-centres in the remaining space, and both can stay open; between 768px and 1199px they overlay with a scrim and never stack; below 768px each is a full-width sheet. The section switcher is a vertical icon rail on the drawer's outer edge at desk sizes and a thumb-reachable bottom tab bar on phones. Drawer surfaces are fully opaque in every theme, and the tab lists carry `role=tablist` with arrow-key navigation in both axes.
- **Theme picker**: grouped into Dark / Light / Coloured / Editors, compact tiles with a single swatch strip, search, keyboard navigation and a close button.
- **Error state**: a plain-language message with "Try again" and "Open another document" replaces the raw engine error; a document you opened yourself that fails no longer silently swaps in the default document.

- **Full-text search (#16)**: a search panel beside thumbnails and outline. Text is extracted once
  per document with a small concurrency pool and cancellation, every matching page is listed with a
  highlighted snippet, and clicking a result jumps to that page. `Ctrl/Cmd+F` opens it.
- **Search hits on the page**: matches are painted onto the rendered page itself in both the 3D and
  the 2D renderer, not only listed in the panel. Marks follow what you type and clear when the panel
  closes.
- **Backup and restore**: Settings → Backup writes every quote plus your preferences (theme,
  direction, volume, loop, bottom-bar mode) to a JSON file, and imports such a file with validation
  and de-duplication.
- **Shareable link presets**: `?theme=`, `?mode=single|double`, `?search=` and `?rtl=` for embedding
  and sharing. Values are allow-listed.
- **Project tooling**: `npm run check` (syntax), `npm run lint` (ESLint), `npm test` (Playwright
  smoke tests including a mobile emulation), GitHub Actions CI, issue and pull-request templates,
  `SECURITY.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md` and `ROADMAP.md`.

### Changed

- **Visual refresh**: a quieter, warmer default theme — ink-dark tinted neutrals, one brass accent,
  neutral shadows. Self-hosted IBM Plex Sans and Mono replace Inter, controls are flat and 44px,
  nothing lifts or glows on hover, no interface text sits below 12px, keyboard focus is visible and
  reduced-motion preferences are respected. The rationale and the tokens live in `DESIGN.md`; the
  other 53 themes keep their palettes with neutralised shadows.
- **Mobile layout (#11, #8)**: page mode follows the viewport rather than the user-agent string.
  Portrait phones get a single page filling the width; landscape tablets and desktops get the
  spread. An explicit choice from the menu or `?mode=` still wins. The version label no longer hides
  under the control bar on small screens.
- **Touch controls (#11, #8)**: the bottom bar and its page numbers stay pinned on touch devices
  instead of waiting for a mouse hover. Tap-to-turn works, swipes are measured from the gesture
  origin with a direction check, and side panels overlay the book on narrow screens instead of
  squeezing it and close on an outside tap.
- **Thumbnail panel (#11)**: wheel and touchpad scrolling inside the panel no longer zooms the book
  — it is guarded in the stage itself, not only in the app layer. Thumbnail rows are cached and
  repainted from the image cache, so scrolling back never re-renders, and preloading starts earlier
  with two parallel renders.
- **Performance**: scripts are fetched in parallel and executed in order, the 845 KB pdf.js worker
  is no longer executed on the main thread, per-load cache-busting is gone (assets are versioned per
  release), Tailwind is precompiled instead of pulled from a runtime CDN, and the mousemove handler
  is throttled with a narrower MutationObserver.
- **Self-contained assets**: Toastify, marked, Font Awesome and the compiled Tailwind CSS are
  vendored. The app has no runtime CDN dependency and works offline. Per-deployment settings moved
  to `config.js`.
- **Service worker**: a versioned cache name, best-effort precaching so one missing file cannot
  block install, stale-while-revalidate for static assets, network-first for pages. PDFs and
  cross-origin requests are never cached and the message handler replies safely.
- **Storage robustness**: quotes database upgrades are additive so version bumps no longer drop
  data, open errors resolve instead of hanging forever, delete failures are reported, page memory
  retries after a failed open, and `localStorage` writes are guarded.
- **Accessibility**: focus trapping and Escape handling for the quotes and theme dialogs,
  `role` and `aria-label` on side panels and the control panel, and icon-only buttons take their
  `aria-label` from their tooltip.
- **Changelog page**: rebuilt on the reader's own theme tokens and typography. It reads this file
  and renders a release timeline with a version index; the fake telemetry dashboard and the
  commit counter are gone.

### Fixed

- `loadFlipbook` threw a `ReferenceError` after every successful load, which also left the loading
  lock stuck.
- `AppState.updatePdfContext` passed the new state as the previous state, so no listener and no
  `zaya:pdfLoaded` event ever fired.
- `zaya:pageChanged` is now emitted on page turns.
- The arrow-key handler no longer steals keystrokes while you are typing in an input.
- Closing a side panel could leave the book frozen; orbit controls now follow panel state.
- A duplicate gesture handler that clicked non-existent buttons was removed.
- The theme manager imported the quotes database from the wrong relative path, so theme changes were
  never persisted to IndexedDB.

### Security

- A strict Content-Security-Policy on both pages: no `unsafe-eval`, no inline scripts.
- pdf.js is loaded with `isEvalSupported: false`, and the `eval()`-based feature probes were removed.
- `?pdf=` and stored URLs are restricted to `http(s)`; download links to `http(s)` and `blob:`.
- All user-controlled text is escaped before rendering — quotes were a stored-XSS vector — and
  YouTube IDs are URL-encoded.

### Removed

- The 214 KB `flipbook.js.bak`, the dead cache-purge code, the unused `#storedPage` writes and
  `premium-plan.md` (moved to the private repository).
- The GitHub API call and the changelog bundle from the reader page.

## [5.4.0] - 2026-07-25

### Added

- **Plugin registry (`ZayaPlugins`)**: an event-driven extension system in `app-state.js` emitting
  `zaya:pdfLoaded`, `zaya:pageChanged`, `zaya:themeChanged`, `zaya:toolbarReady` and `zaya:init`.
- **UI extension slots (`ZayaUI`)**: `ZayaUI.registerToolbarButton()` and `ZayaUI.registerPanelTab()`
  in `controls.js`, so private plugins can inject UI without touching core HTML or JS.
- **Keyboard shortcuts**: `←` and `→` turn pages, `F` toggles fullscreen, `Cmd/Ctrl+K` opens the
  control panel.
- **Optional Pro loader**: a non-blocking loader in `app.js` for `lib/js/pro-features/index.js`.

### Changed

- **Theme engine**: `$('*')` class manipulation across the DOM tree is gone from `manager.js`.
  Themes apply to `document.documentElement` instead, so switching is a custom-property change with
  no layout reflow.
- **Theme selector**: palette colours are pre-calculated and cached in `selector.js`, removing the
  temporary `<div class="theme-...">` insertion loop during search. The modal is plain JavaScript
  with a 100ms input debounce.

## [5.3.0] - 2026-04-03

### Added

- **Media loop**: persistent "Auto Repeat" controls inside the audio player and the video modal.
- **Configuration**: support for `window.ZAYA_DEFAULT_PDF` and URL-based loading via `?pdf=`.

### Changed

- **Rebranding**: the complete transition from Paginis to Zaya, with a new logo and a single naming
  convention across variables and assets.
- **Service worker**: split into `sw-manager.js` (UI thread) and `sw.js` (background worker).

### Fixed

- `ReferenceError` crashes during local file imports in `media.js`.
- 404 errors for the root service-worker file, which had disabled offline support.
- Race conditions during IndexedDB initialisation in `db.js`.

## [5.1.1] - 2026-02-06

### Added

- **Local audio**: local file import for audio playback with progress tracking and synchronised
  volume controls.
- **Device adaptation**: automatic detection choosing booklet or zoom mode for the device.

### Changed

- **Media player**: redesigned around a mode switcher and a themed audio player, so audio no longer
  opens a separate window.

### Fixed

- 3D camera centring in single-page mode, with lighting synchronised to the focused page.
- UI arrows and keyboard shortcuts, by restoring the navigation methods missing from the modular
  factory.

## [5.0.0] - 2026-01-12

### Added

- **Page number entry** in the bottom bar.
- **Performance dashboard** on the changelog page (removed again in 6.0.0).

### Changed

- **Library modularisation**: the DFlip core was refactored into modular ES6 files.
- **Icons**: legacy emoji replaced by a consistent Font Awesome set.
- **Themes**: universal theme toggling across the whole project structure.
- **Control panel and bottom bar**: restyled, including the quotes module.
- **Styles**: absolute paths removed and persistent styles consolidated into one modular entry point.

### Fixed

- Scrolling the thumbnail or bookmark list no longer triggers zoom or a page turn.

### Removed

- Legacy unused code and deprecated event listeners.

## [4.5.0] - 2026-01-03

### Changed

- Legacy colour schemes replaced by a theme-aware system built on CSS custom properties.
- Flipbook controls migrated into the bottom panel.

### Fixed

- Theme and PDF state are preserved across reloads.

### Removed

- Hardcoded hex colours.

## [4.4.0] - 2025-12-22

### Changed

- Improved the PDF fallback system.
- Configuration centralised in `app-state.js`.

### Fixed

- RTL/LTR toggle synchronisation.

## [4.0.0] - 2025-11-01

### Added

- Mobile support: touch gesture navigation, hover-aware sidebars and haptic feedback.

### Changed

- Memory management: automatic cleanup of heavy PDF and YouTube instances.
- Centralised, event-driven `AppState` replacing global variables.

### Security

- An input validation framework covering URLs and file uploads.

## [1.0.0] - 2024-10-24

### Added

- Initial release: the basic flipbook and its core integration.
