# Third-party notices

| Component | Location | Version | License |
| --- | --- | --- | --- |
| DearFlip (dFlip) Lite, modularised | `lib/js/core/dflip/`, `lib/js/core/flipbook.js.bak`, `lib/js/libs/mockup.min.js`, `lib/css/min.css` | 1.7.3.5 | [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) – personal / non-commercial use only |
| pdf.js | `lib/js/libs/pdf.min.js`, `pdf.worker.min.js`, `compatibility.js`, `cmaps/` | 2.3.200 (one-line patch: the regenerator-runtime `Function()` fallback was replaced with a `globalThis` assignment so it runs under a CSP without `unsafe-eval`) | Apache-2.0 |
| three.js | `lib/js/libs/three.min.js` | r89-era build bundled with dFlip | MIT |
| jQuery | `lib/js/libs/jquery.min.js` | 3.x | MIT |
| Themify Icons | `lib/css/themify-icons.min.css`, `lib/fonts/` | 1.0.1 | SIL OFL 1.1 (fonts) / MIT (CSS) |
| Font Awesome Free | `lib/css/vendor/fontawesome.min.css`, `lib/fonts/webfonts/` (woff2 only) | 6.5.1 | CC BY 4.0 (icons) / SIL OFL 1.1 (fonts) / MIT (CSS) |
| Toastify JS | `lib/js/libs/toastify.min.js`, `lib/css/vendor/toastify.min.css` | 1.12.0 | MIT |
| marked | `lib/js/libs/marked.min.js` (changelog page only) | 12.0.2 | MIT |
| Tailwind CSS | precompiled to `lib/css/vendor/tailwind.css` from `lib/css/tailwind.src.css` (`npm run build:css`) | 3.4 | MIT |
| Tesseract.js | `lib/ocr/tesseract.min.js`, `lib/ocr/worker.min.js` (loaded only when the reader asks to recognise scanned pages) | 6.0.1 | Apache-2.0 |
| Tesseract.js-core (Tesseract OCR compiled to WebAssembly) | `lib/ocr/core/tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js` | 6.1.2 (Tesseract 5) | Apache-2.0 |
| tessdata_fast language packs | `lib/ocr/lang/ara.traineddata.gz`, `eng.traineddata.gz` | tessdata_fast (Tesseract 4/5 LSTM) | Apache-2.0 |
| IBM Plex Sans / Mono | `lib/fonts/plex/` (latin subset, self-hosted via `lib/css/vendor/fonts.css`) | 5.x (fontsource) | SIL OFL 1.1 |

Everything else in this repository is © ibra-kdbra and released under the MIT License (see `LICENSE`).

> **Important:** the DearFlip-derived files are *not* covered by the MIT license and may not be used commercially without a license from DearHive. See the roadmap in `README.md` for the plan to replace them.
