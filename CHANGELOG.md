# Changelog

All notable changes to Zaya are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **One place for everything kept on the device**: page memory, quotes, files opened from disk and recognised text now live in a single IndexedDB database (`Zaya`) instead of four. The first load after upgrading copies every record across from the old databases and removes them; a database that another tab is holding open is left alone and tried again next time, so nothing is lost.
- **Storage space is visible and manageable**: the Recent group shows how much of the space this browser allows Zaya is using, and a **Free up space** action (with an inline confirmation, not a browser dialogue) drops the stored copies of files and recognised text for documents no longer in the list. The recent entries and their remembered pages are kept. Each file entry says whether its bytes are still kept in this browser and how large it is, and the list can be walked entirely from the keyboard.
- **Backups keep more**: the backup file is now format 2 and carries the recent documents list (metadata only, never the files themselves) and recognised text for scanned pages, up to 20 MB of it; beyond that the text is left out with a note in the file. Backups written by the previous release are still imported.
- **Drawer state in AppState**: `navigatorOpen`, `navigatorTab` (`thumbs` | `outline` | `search`), `panelOpen` and `panelTab` (`Document` | `Notes` | `Media` | `Settings`) are stored and restored like the other preferences, so both drawers reopen where the reader left them (issue #24).
- **More-menu choices are remembered**: the page-mode override (single or double) and the page-turn sound survive a reload and a change of document, alongside the bottom-bar mode that was already kept. An explicit `?mode=` still wins over the remembered choice.

### Changed
- **The app layer no longer uses jQuery**: `ui/controls.js`, `features/controls/custom-controls.js` and the DOM work in `core/load.js` are plain DOM — the same ids, `zaya:*` events, `ZayaPanel` / `ZayaNavigator` / `ZayaDrawers` / `ZayaDocuments` APIs, keyboard shortcuts and drawer model, with the engine's jQuery objects unwrapped only where the flipbook itself hands them over. jQuery remains a dependency of the vendored engine.
- **No user text is ever built into markup**: the notes list and its modal, the delete confirmation, the theme picker, the mobile hints and the "re-select the file" toast are all built from elements, so a quote, a filename or a document name reaches the page as text and never through `innerHTML`. A plugin's `ZayaUI.registerPanelTab({ content })` now takes a node or plain text; markup goes through `renderContent`.
- **Drawer state reads and writes AppState**: the Navigator and the control panel take their open state and selected tab from `navigatorOpen` / `navigatorTab` / `panelOpen` / `panelTab`, so link presets and a restored backup drive them. Drawers that were left open are only reopened where they are layout rather than an overlay (1200px and wider); on smaller screens the tab is remembered but the drawer starts closed.
- **The legacy panel stylesheet is retired**: `lib/css/page/panel.css` is gone. What was still in use — the bottom bar, the More menu, the notes modal, the toggle switch and the volume slider — moved to the top of `page/shell.css`, and everything a later sheet already restyled was dropped.
- **The flipbook engine is split by responsibility**: the search pane (query, results, and the offer to recognise scanned pages) is now `lib/js/features/search/search-panel.js`, the thumbnail and outline drawers are `lib/js/core/dflip/features/side-panels.js`, and `texture-library.js` is left with textures and page rendering — half its previous size, with no change to what the panels do.

### Fixed
- **Pages are visible without WebGL**: the 2D renderer never received page images, so a browser with no working WebGL (or `?render=css`) showed a blank book. It now paints every page face, turns pages with a real fold-free flip, and keeps thumbnails, search and painted search marks working; the renderer can be pinned with `?render=css` or `?render=webgl` for testing (issue #22).
- **A full browser no longer fails silently**: a file that would not fit is not stored, and the reader is told it opens normally but will need to be picked again. Every write that runs out of space raises one clear message instead of an unhandled error.

## [6.1.0] - 2026-09-05

Two weeks of reader feedback on the 6.0 preview: the drawers now behave differently on a desk, a
tablet and a phone; files opened from disk come back after a reload; and Arabic is a first-class
citizen in search, including scanned books, which are recognised on the device.

### Added
- **Navigation model by device class**: on screens 1200px and wider the drawers dock beside the book, which re-centres in the remaining space, and both can stay open; between 768px and 1199px they overlay with a scrim and never stack; below 768px each is a full-width sheet. The section switcher is a vertical icon rail on the drawer's outer edge at desk sizes and a thumb-reachable bottom tab bar on phones. Drawer surfaces are fully opaque in every theme, and the tab lists carry `role=tablist` with arrow-key navigation in both axes.
- **Local files survive a reload**: a PDF opened from this device is kept in the browser (IndexedDB, the six most recent files up to 120 MB each) and reopens on the same page next time, instead of falling back to the default document with a "re-select it" prompt. A **Recent** list in the Document tab shows links and files opened before; a file reopens from the store, a link from the network, and entries can be removed or cleared.
- **Arabic search**: queries and page text are normalised the same way (Unicode NFKC, so the shaped presentation forms many Arabic PDFs expose as text match the letters you type; vowel marks, tatweel and alef variants are folded), glyph-split runs are glued back into words, a right-to-left query is also looked for in reverse (some producers store Arabic in the opposite order), and highlights on right-to-left runs are mirrored correctly. When a document has no text layer or its text is unmapped glyph codes, the search panel says so instead of a bare "No matches".
- **Text recognition for scanned pages (OCR)**: when a document has no text layer, the search pane offers to recognise its pages on the device with Tesseract (WebAssembly; Arabic and English language packs are vendored, so it works offline and nothing is uploaded). Recognition runs several pages at once (one worker per spare core, fewer on phones), skips the engine's slow inverted-image retry and sizes the page image to what the model needs, so a 200-page book takes minutes rather than tens of minutes on a laptop. It starts at the page being read, shows which pages are in flight and how long is left, can be stopped at any time, and recognised text (blank pages included) is kept per document in IndexedDB so a book is only processed once. Results and on-page highlights appear as each page completes.

### Changed
- **Changelog page header**: one row that never wraps; the brand links to the repository with a small GitHub mark, the back link is plain accent text, and the version moved out of the header into a "Latest release" line above the title.
- **Reader header**: the Zaya wordmark links to the repository (the More menu entry stays).
- **Service worker**: scripts and stylesheets are always fetched from the network while online, even when their URL carries the release version; only fonts, images, sounds, CMaps and the OCR engine are served cache-first. A deploy within one version can no longer run new markup on old code or styles.
- **Search status**: when nothing matches because the document has no text layer or its text is unmapped glyph codes, the panel says so.
- **Recognition language** is a three-way segmented control (Arabic + English, Arabic, English) instead of a native dropdown, which several browsers refused to open inside the drawer. One language is about twice as fast as two, and the panel says so.

### Fixed
- **Navigator stale after opening another document**: the previous book was never disposed, so its Pages, Outline and Search panels stayed in the drawer and the new document's panels were hidden behind them. The engine is now torn down properly and the drawer replaces its panels with the new document's.
- **Changelog page empty on Vercel**: `.vercelignore` excluded every Markdown file, so `CHANGELOG.md` was a 404 on deploys. It is now shipped, and the version badge stays hidden until the log has loaded.
- **Control-panel width on tablets**: a user-agent check forced the panel to the full viewport width on any tablet browser and never released it; the override now applies only below 768px.

## [6.0.0] - 2026-09-04

The reading interface was rebuilt around the document: a quieter theme, a real search, and a
touch-first layout. The version number jumps to 6.0.0 because the look, the layout rules and the
navigation model all changed.

### Added
- **Navigator and control panel**: the two side drawers were rebuilt: a titled Navigator with Pages (tile grid, two columns on phones), Outline (tree with indent lines) and Search tabs; a control panel with Document / Notes / Media / Settings tabs whose actions are labelled and show their state, a document header with page count, and a footer with the version.
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
