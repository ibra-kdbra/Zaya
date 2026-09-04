# Zaya Roadmap & Business Plan

_Last updated: 2026-09-04. This document is the decision record for how Zaya grows from a
side project into a sustainable product. It supersedes the roadmap section of `premium-plan.md`._

---

## 1. Where the project stands

**Strengths.** A working 3D flipbook with a genuinely good feature set (themes, quotes, media
player, page memory, PWA shell, RTL, plugin hooks), a live deployment, real external users filing
thoughtful issues, and now: full-text search, hardened core, CI, and tests.

**What v5.5.0 fixed** (see `CHANGELOG.md`): the load path threw on every PDF, state listeners and
plugin events never fired, stored quotes were an XSS vector, `?pdf=` accepted `javascript:` URLs,
the service worker grew without bound, thumbnails re-rendered on every scroll, touch devices had no
visible controls, and closing a side panel froze the book.

**The one blocker nobody can code around: licensing.**

| Component | Origin | License | Consequence |
| --- | --- | --- | --- |
| `lib/js/core/dflip/**`, `lib/js/libs/mockup.min.js`, `lib/css/min.css` | DearFlip (dFlip) **Lite 1.7.3.5** | **CC BY‑NC‑ND 4.0** | Personal / non‑commercial use only. *No derivatives* – the modular refactor already exceeds what the license allows. |
| everything else | this project | MIT | Fine. |

Consequences:

1. **Zaya cannot be sold, licensed, or offered as a paid SaaS while the DearFlip-derived engine is
   inside it.** A commercial DearFlip JS license (annual from about $49, lifetime from about $149 per
   site) covers *using* their unmodified build on a site; it does not cover redistributing a
   modified fork, and it does not cover a hosted multi-tenant service.
2. The repository's `LICENSE` (MIT) is currently inaccurate for those files. `THIRD_PARTY_NOTICES.md`
   now states this explicitly; it should stay until the engine is replaced.
3. Sponsorship/donations for the *open-source* project are fine (non-commercial use), which is why
   the recommendation below starts there.

---

## 2. SaaS vs. donations: the recommendation

### Market snapshot (Sept 2026)

| Product | Entry price | Notes |
| --- | --- | --- |
| Heyzine | $4/mo (annual $49) | cheapest no-watermark tier, custom domain from $14/mo |
| FlipHTML5 | free w/ watermark, Pro ≈ $12–14/mo | analytics gated behind Platinum $25/mo |
| FlippingBook | $20–65/mo | per-publication pricing, no free tier |
| DearFlip JS (self-host) | $49/yr, $149 lifetime | the engine Zaya is currently forked from |

The hosted flipbook market is crowded and price-anchored at **$4–15/month**. A new entrant wins on
(a) self-hosting/privacy, (b) reading experience (3D, themes, quotes, media), (c) developer-friendly
embedding, not on being another upload-and-host site.

### Realistic revenue by model

| Model | Typical outcome for a project this size | Effort | Requires engine replacement? |
| --- | --- | --- | --- |
| GitHub Sponsors / Open Collective only | $0–500/mo; median OSS project earns nothing | very low | **No** |
| Open-core self-hosted "Pro" (one-time or yearly license key) | $1–5k/mo is attainable with a few hundred customers; no infra to run | medium | **Yes** |
| Hosted SaaS (upload, hosting, analytics, custom domain) | higher ceiling but needs auth, billing, storage, abuse handling, support, uptime | high | **Yes** |

### Decision

**Phase A (now – engine replaced): donations + reputation.**
Turn on GitHub Sponsors and Open Collective, add a "Sponsor" button and a `FUNDING.yml`, ship
releases with proper notes, and keep answering issues fast. Zero legal risk, builds the audience the
paid tier will need.

**Phase B (after engine replacement): open-core, self-hosted Pro first, SaaS only if pulled.**
Sell a *license key* for the Pro plugin bundle (private repo) that drops into the open-source app.
No servers, no PII, Stripe/Lemon Squeezy checkout, `$49/yr` or `$129` lifetime per domain. Add the
hosted offering later only if Pro customers ask for hosting, since hosting is the expensive part.

**Do not** start a SaaS on the current engine. The first competitor or DearHive email ends it.

---

## 3. Engine replacement plan (the critical path)

Goal: remove every CC BY‑NC‑ND file while keeping the look and feel.

| Step | What | Notes |
| --- | --- | --- |
| E1 | Freeze the public API of the engine (`flipBook(source, options)`, `target.gotoPage/next/prev`, `contentProvider.pdfDocument`, `ui.update`, `zaya:*` events) | Already mostly true; write it down as `docs/engine-api.md` and add tests against it. |
| E2 | Build `zaya-engine` (MIT) on **three.js r160+** and **pdf.js 4.x** | Page geometry = a bent plane (same idea as `MOCKUP.Paper`), textures rendered by pdf.js, CSS3D fallback. Use `page-flip` (StPageFlip, MIT) for the 2D/mobile mode instead of writing one. |
| E3 | Port UI wrappers (`ui.js`, side panels, search, thumbnails) to the new engine | These are already Zaya code and survive the swap. |
| E4 | Delete `lib/js/core/dflip`, `mockup.min.js`, `min.css`; update `THIRD_PARTY_NOTICES.md` and `LICENSE` | Repo becomes cleanly MIT. |

Estimated effort: 4–6 focused weeks for a first cut. It is the single highest-value piece of work
in the project because it unlocks every monetisation path.

---

## 4. Public / private repository split

Keep the public repo as the product people use and contribute to; keep Pro in a private repo that
*contains* the public one and syncs outward. Bootstrap files live in `.github/private-repo/`.

```
zaya-pro (private, source of truth)         ibra-kdbra/Zaya (public)
├── everything in public              ──►   synced by sync_public.yml on push to main
├── pro/                              ✗     never leaves the private repo
│   ├── index.js  → lib/js/pro-features/index.js at build time
│   ├── auth/ watermark/ analytics/ branding/ narration/ pdf-tools/
├── docs/ (internal)                  ✗
└── .github/workflows/sync_public.yml ✗
```

Rules that keep it safe:

- Pro code only touches core through `window.ZayaPlugins.register()` and `window.ZayaUI` slots plus
  the `zaya:*` events. The sync job fails if any `pro-features/` reference leaks.
- Vercel builds from the private repo (Pro build); the public repo stays the OSS build.
- License-key check for Pro is done client-side with an Ed25519 signature over `domain + expiry`.
  It keeps honest customers honest; it is not DRM.

### Pro feature backlog (private repo), in order of customer pull

| # | Module | Why it sells |
| --- | --- | --- |
| 1 | `pro-branding` | white-label, custom logo, hide GitHub badge — asked for first by agencies |
| 2 | `pro-auth` | password / expiring share links for catalogues, price lists |
| 3 | `pro-analytics` | per-page dwell time, heatmap, CSV export — the feature competitors gate hardest |
| 4 | `pro-watermark` | viewer email/IP overlay for confidential docs |
| 5 | `pro-narration` | synced audio + Web Speech TTS |
| 6 | `pro-pdf-tools` | reorder/extract/merge client-side |
| 7 | `pro-collab` | presenter mode, live page sync (needs a websocket service: SaaS-only) |

---

## 5. Public roadmap (open source)

### v5.5.x — stabilise (this release)
- [x] Full-text search (#16)
- [x] Thumbnails: wheel-zoom leak, re-render on scroll, touch scrolling (#11)
- [x] Mobile: visible controls & page numbers, tap/swipe fixes, panel auto-hide, no freeze (#11, #8)
- [x] Security: CSP, `isEvalSupported:false`, URL validation, escaped output, SW cache versioning
- [x] Tooling: syntax check, eslint, Playwright smoke tests, CI, issue templates, security policy
- [ ] Release notes + GitHub Release with `v5.5.0` tag

### v5.6 — polish
- Keyboard-accessible everything: focus trap in modals, ARIA on side panels, skip links
- Page-turn sound/animation refinements; hardcover option
- Settings export/import (quotes + preferences as JSON)
- `?theme=` and `?mode=single|double` URL parameters for embedding
- Replace remaining jQuery in `controls.js` / `custom-controls.js` with vanilla DOM

### v6.0 — new engine
- MIT engine per section 3; pdf.js 4.x (fixes the 2019 pdf.js build we ship today)
- Text selection & copy on pages; search highlights on the page itself
- Print / download of page ranges
- i18n of the UI strings

### Later
- Annotations (highlights, notes) stored with quotes
- Embeddable `<zaya-book>` web component + npm package
- Optional hosted service (only if Pro customers ask)

---

## 6. Housekeeping decisions already taken

- Third-party assets are vendored (`lib/js/libs`, `lib/css/vendor`, `lib/fonts/webfonts`) and
  Tailwind is precompiled: no runtime CDN, strict CSP, works offline.
- `config.js` is the supported place for deployment settings (`window.ZAYA_DEFAULT_PDF`).
- Version lives in exactly three places that must move together: `package.json`, `lib/js/app.js`
  (`ZAYA_VERSION`), `sw.js` (`VERSION`). The CI could enforce this; add a check when convenient.
- `docs/` is git-ignored and reserved for private notes in the private repo.
