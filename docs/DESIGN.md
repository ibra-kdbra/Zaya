# Zaya design notes

Zaya is a reading tool. The document is the content; everything else is chrome and should stay
out of the way until it is needed. These notes describe the visual system used by `index.html`
and the CSS under `lib/css/`, and they are the checklist for any UI change.

## Product context

- **Who:** people reading a PDF as a book: catalogues, magazines, manuals, novels. Many arrive
  on a phone from a shared link. A smaller group embeds Zaya on their own site.
- **Job:** open a document fast, read comfortably for a long time, find things (search, outline,
  thumbnails), keep notes (quotes), and come back later to the same page.
- **Constraints:** static site, no build at deploy time, strict CSP, works offline, 50+ user
  selectable themes that all share the same token names.

## Principles

1. **The page is the hero.** Chrome uses quiet surfaces close to the background, one accent, and
   sits at the edges. Nothing floats over the book except the side panels the reader opened.
2. **One accent.** The default theme uses a warm brass (`--text-accent: #e0b260`) on ink-dark,
   slightly cool neutrals (`--bg-primary: #17181c`). Accent marks the active or focused control and
   the search hits. It is never a background wash, never a gradient, never a glow.
3. **Neutral elevation.** Shadows are black at low opacity, offset downward. No tinted glows, no
   hairline border paired with a wide blur.
4. **Type with a voice.** `IBM Plex Sans` for interface text, `IBM Plex Mono` for numbers, page
   counters and the version label. Self hosted (`vendor/css/fonts.css`). Interface text is
   never below 12px; controls are 13–14px; section labels are 12px uppercase with 0.08em tracking.
5. **Touch first.** Every control is at least 44×44px. Hover is a hint, not a requirement: on touch
   devices the bottom bar is pinned and side panels close on an outside tap.
6. **Motion explains state.** 150ms colour transitions on hover/focus; the panel and bar slide
   because they are physically arriving. No lift-on-hover, no bounce, no scale. Reduced-motion
   users get instant changes.
7. **Keyboard parity.** Everything reachable by Tab, visible `:focus-visible` ring in the accent,
   `Esc` closes whatever opened last, `Ctrl/Cmd+F` searches, arrows turn pages.

## Tokens

Defined once in `lib/css/themes/themes.css` (`:root` and each `.theme-*`):

| Token | Role |
| --- | --- |
| `--bg-primary` | page background |
| `--bg-secondary` | panels and bars (94% opaque, blurred) |
| `--bg-tertiary` | hover surface, inputs |
| `--bg-accent` / `-hover` / `-active` | accent washes for the active control only |
| `--border-primary` / `-secondary` / `-accent` | edges, in three strengths |
| `--text-primary` / `-secondary` / `-accent` | ink, muted ink, accent |
| `--text-success` / `-warning` / `-error` | status only |
| `--shadow-primary` | neutral elevation for panels |
| `--font-sans` / `--font-mono` | type |

Themes may change colours but must keep the roles. A theme that turns `--bg-accent` into a
gradient or `--shadow-primary` into a coloured glow is wrong.

## Where things live

- `lib/css/page/chrome.css` – the fixed controls around the book (top-right cluster, version
  label, bottom bar, side-panel skins, focus rings). Loaded last, wins by order not by `!important`.
- `lib/css/page/custom-ui.css` – the search panel, thumbnails and outline skins.
- `vendor/css/tailwind.css` – utilities used by the markup, precompiled (`npm run build:css`).

## Navigation model by device class

Both drawers — the Navigator (Pages / Outline / Search / Text) on the left and the control panel
(Document / Notes / Media / Settings) on the right — use one system. Only two things change with
the viewport: whether the drawer overlays the book or takes space from it, and where the section
switcher sits.

| | **Large** ≥1200px | **Medium** 768–1199px | **Small** <768px |
| --- | --- | --- | --- |
| Drawer | **docks**: the reading area shrinks | overlays with a scrim | full-width sheet |
| Width | Navigator 340px, panel 380px | 380px / 420px | 100vw |
| Both open at once | yes | no — the other yields | no — the other yields |
| Switcher | vertical icon rail, 68px, on the drawer's **outer** edge | same rail | **bottom tab bar**, 56px, above the app bar |
| Dismissal | close button, Esc | + scrim and outside tap | + scrim and outside tap |
| Focus | normal | normal | `ZayaA11y.trap` (the sheet is modal) |

- **Docking.** `body.dock-left` / `body.dock-right` publish the drawer widths as `--dock-l` /
  `--dock-r`. `#flipbookContainer` takes them as margins (with `width:auto`, because the markup
  carries `w-full`), the bottom bar re-centres on the remaining area, and `ZayaDrawers.syncDock()`
  calls `dFlipBook.resize()` once the 180ms slide has settled. The margin itself is never
  animated: the WebGL stage would relayout on every frame. While docked, the engine's own
  side-menu shift in `preview-object.js` is skipped, so the book centres in what is left, and an
  outside tap no longer dismisses — a docked drawer is layout, not an overlay.
- **The rail.** 68px wide (enough for "Document" at 11px), items ≥52px tall, an 18px icon over an
  11px label, `title` for the tooltip. The active item takes a `--bg-accent` fill and a 3px
  `--text-accent` bar on the outer edge; its label stays `--text-primary`, because the accent
  alone fails 4.5:1 on the light and nord palettes. On a phone the same element becomes the
  bottom tab bar (12px labels), so there is one tablist, one set of ids, one keyboard model:
  `role=tablist/tab/tabpanel`, `aria-selected`, and arrows in both axes (Up/Down on the rail,
  Left/Right on the tab bar).
- **Surfaces.** Drawers are `--bg-primary` with a 1px `--border-primary` edge, never
  `--bg-secondary` — that token is 94–95% opaque and the page used to bleed through it.

## Language and direction

The interface is available in English and Arabic. One module owns both: `lib/js/i18n/i18n.js`,
with the strings in `en.js` and `ar.js` as flat objects of dotted keys. Static markup names its key
in `data-i18n` (or `data-i18n-title` / `-placeholder` / `-aria-label` / `-empty`) and `apply()`
translates it; anything a script builds goes through `t(key, vars)` and redraws on
`zaya:languageChanged`. Counted strings hold plural forms and are selected with `Intl.PluralRules`,
so Arabic gets its six categories rather than a bolted-on "s". Numbers stay in Western digits.

- **`lang` and `dir` live on `<html>`.** `setLanguage()` sets both, so the direction is a property
  of the document, not of a body class, and every logical property below follows it for free.
- **Logical properties, not a mirrored stylesheet.** `margin-inline-start`, `inset-inline-end`,
  `border-inline-end`, `text-align: start`, `border-start-end-radius`. There is no `[dir=rtl]`
  copy of the layout to keep in step. Two things a logical property cannot express — a transform
  and a `calc()` that has to know which way "outwards" points — read `--flip` (`1`, or `-1` under
  `dir="rtl"`). The drawers keep their `.drawer-left` / `.drawer-right` names: those name the two
  drawers, not two sides of the screen, and in Arabic the Navigator opens from the right.
- **Directional glyphs turn over, decorative ones do not.** Chevrons and page arrows are flipped
  with `scaleX(-1)`; a cog, a file or a quotation mark is not. Prev and next keep their spatial
  meaning: whichever button sits on the left points left.
- **Arabic type.** IBM Plex Sans carries no Arabic, so `:root[lang="ar"]` swaps `--font-sans` for
  a system stack (`Segoe UI`, `Noto Naskh Arabic`, `Noto Sans Arabic`, `Geeza Pro`, Tahoma) and
  raises the line height to 1.7: Arabic glyphs are taller at the same size and crowd otherwise.
- **The interface direction and the document's are separate.** `AppState.isRTL` is the book's
  reading direction and belongs to the document; `AppState.language` is the interface. An Arabic
  interface over a left-to-right book is a normal combination and neither setting touches the other.

## Floating action bar

One pattern floats over content rather than sitting at an edge: the bar the Text pane raises above
a selection. It is allowed because it is *about* something the reader is pointing at, and it leaves
with the selection.

- Anchored to the selection: centred over its box, above it, and below it only when there is no
  room above. It is fixed to the viewport, not to the drawer, because the drawer slides on a
  transform and a fixed child would be positioned against that instead.
- `--bg-secondary` with a 1px `--border-primary` edge and `--shadow-primary`. No tint and no glow:
  the accent appears only on the icon of the item under the pointer.
- Every action is an icon and a word, at least 44px tall, and the bar never carries more than three.
- It never appears for an empty or whitespace-only selection, and it is dismissed by `Esc`, by a
  page turn, and by the selection collapsing.

## Checks

`npx impeccable detect index.html changelog.html lib/css/page lib/css/themes` runs the
deterministic anti-pattern rules (undersized text, overused fonts, tinted glows, AI palettes).
Expected residual findings: the purple/violet palettes inside `themes.css` are user-selectable themes and stay; the blue gradient and glow in the vendored `toastify.min.css` are overridden at runtime by `chrome.css` (the detector reads the file statically). Everything else should be zero.
