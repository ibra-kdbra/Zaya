# Zaya — Architecture, Free Core Optimization & Premium Plan

This document outlines the architectural strategy for separating **Zaya Core (Public Open Source)** and **Zaya Pro (Private Repo)**, along with critical free-tier performance fixes, Vanilla JS refactoring, and feature modularization.

---

## 🎯 Architecture Overview: Public / Private Separation

### 1. Dual Repository Setup

* **Public Repository (`ibra-kdbra/Zaya`)**: Contains the light, open-source core application. Clean, zero private references, fully functional out-of-the-box.
* **Private Repository (`zaya-private`)**: The **Single Source of Truth** containing Core code + `pro-features/` directory + `.github/workflows/sync_public.yml`.

```
zaya-private (Private Monorepo)
├── assets/
├── docs/
│   ├── ai-thoughts.md
│   ├── premium_features.md
│   └── premium-plan.md
├── lib/
│   ├── js/
│   │   ├── core/           # Zaya Core (Public)
│   │   ├── ui/             # Controls & UI Slots (Public)
│   │   ├── utils/          # State & PluginRegistry (Public)
│   │   └── pro-features/   # 🔒 Premium Plugins (Private Only)
├── .github/
│   └── workflows/
│       └── sync_public.yml # 🔒 Sync Action (Private Only)
└── index.html
```

### 2. Automated Sync Strategy

* Developers commit & develop features in `zaya-private`.
* Hosted builds (Vercel/Netlify) deploy directly from `zaya-private` with full Pro functionality.
* A GitHub Action in `zaya-private` runs `rsync` on push to `main`, stripping `pro-features/` and private internal docs before pushing to `ibra-kdbra/Zaya` (Public).

---

## 🔌 Core Extension Architecture (Plugin System)

To ensure **zero code leaks** and prevent Pro features from modifying core files, Zaya Core exposes a lightweight **Vanilla JS Plugin Registry**:

### 1. Core Event Hooks (`AppState` / `ZayaCore`)

Core emits standard custom events:

* `zaya:init` — Application initialized.
* `zaya:pdfLoaded` — PDF opened (passes `{ url, type, pageCount }`).
* `zaya:pageChanged` — Page changed (passes `{ page, total }`).
* `zaya:themeChanged` — Theme changed (passes `{ theme }`).
* `zaya:toolbarReady` — UI toolbar loaded and ready for button injection.

### 2. UI Extension Slots

`controls.js` provides a public interface for Pro features to inject custom UI components without altering `index.html` or core JS:

* `ZayaUI.registerToolbarButton({ id, icon, tooltip, onClick, position })`
* `ZayaUI.registerPanelTab({ id, title, icon, renderContent })`
* `ZayaUI.registerOverlayComponent({ id, mount })`

---

## ⚡ Free / Open-Source Core Fixes & Enhancements

Before creating `zaya-private`, the following performance bugs and architectural debt must be resolved in Zaya Core:

### 1. 🐛 Fix Theme Selector & Theme Manager Performance Lag

* **Root Cause 1 (`manager.js`)**: `applyTheme()` executes `$('*')` across the *entire DOM tree* on theme change, matching regexes and modifying classes on thousands of nodes.
  * **Fix**: Use CSS variable inheritance on `document.documentElement` (`<html data-theme="...">`). Removing all `$('*')` DOM iteration will eliminate layout reflow lag.
* **Root Cause 2 (`selector.js`)**: `getThemeColors()` creates, appends, and removes temporary DOM elements inside a synchronous loop over 54 themes on every search input keypress.
  * **Fix**: Pre-calculate or cache theme palette colors statically in JavaScript. Implement input debouncing for search.

### 2. 🧹 Vanilla JS Refactoring & Component Modularization

* **Goal**: Shift custom UI components from jQuery spaghetti code to modern, framework-free **Vanilla ES6 Classes & Web Components**.
* **Target Files for Refactoring**:
  * `lib/js/features/themes/selector.js` → Pure Vanilla DOM Modal.
  * `lib/js/ui/controls.js` → Vanilla UI Controller with Slot APIs.
  * `lib/js/features/quotes/ui.js` → Modular Quote Component.
* **Benefits**: Faster load times, reduced third-party runtime overhead, cleaner code structure for open-source contributors.

### 3. 🎁 Open-Source Free Feature Upgrades

* **Keyboard Navigation**: Arrow Key shortcuts (`←` / `→`) for page turns, `F` for Fullscreen, `M` for Media toggle.
* **Accessibility (a11y)**: Proper ARIA roles (`role="dialog"`, `aria-label`, focus trapping) for modals.
* **Service Worker / PWA Offline Foundation**: Improved caching strategy for core UI assets.

---

## 🔒 Roadmap for Premium Features (Private Repo)

| Priority | Feature Module | Technical Implementation |
| :--- | :--- | :--- |
| 🔴 **Phase 1** | **`pro-auth`** | Password-protected flipbooks, JWT access tokens, expiring share links |
| 🔴 **Phase 2** | **`pro-watermark`** | Canvas-level text overlay (user email/IP) rendered onto PDF page textures |
| 🔴 **Phase 3** | **`pro-analytics`** | Reading heatmaps, per-page duration tracking, CSV drop-off exports |
| 🟡 **Phase 4** | **`pro-branding`** | White-label UI, custom logo slot, branded domain routing |
| 🟡 **Phase 5** | **`pro-narration`** | Per-page synchronized audio player & Web Speech API TTS reader |
| 🟡 **Phase 6** | **`pro-pdf-tools`** | Client-side page reordering, page extraction, PDF merge tools |
| 🟢 **Phase 7** | **`pro-collaboration`** | WebSockets live cursor and presenter page synchronization |

---

## 📋 Step-by-Step Implementation Roadmap

1. **Step 1 (Free Core)**: Fix `manager.js` `$('*')` DOM bug and `selector.js` temporary DOM creation lag.
2. **Step 2 (Free Core)**: Refactor `ThemeSelectorModal` and `Controls` into modular Vanilla JS components.
3. **Step 3 (Free Core)**: Implement `ZayaCore` / `AppState` Plugin Registry & UI Slot APIs.
4. **Step 4 (Free Core)**: Implement optional/graceful `pro-features` loader in `app.js`.
5. **Step 5 (Repo Split)**: Create `zaya-private` repo on GitHub, migrate `.github/workflows/sync_public.yml`, and test automated push to `ibra-kdbra/Zaya`.
