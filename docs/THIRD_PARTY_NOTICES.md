# Third-party notices

| Component | Location | Version | License |
| --- | --- | --- | --- |
| pdf.js | `vendor/pdfjs/pdf.min.mjs`, `pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`, `vendor/pdfjs/LICENSE` | 4.10.38 (unmodified ESM build) | Apache-2.0 |
| three.js | `vendor/three/three.module.min.js`, `vendor/three/LICENSE` | r169 (0.169.0, unmodified ESM build) | MIT |
| Themify Icons | `vendor/css/themify-icons.min.css`, `vendor/fonts/` | 1.0.1 | SIL OFL 1.1 (fonts) / MIT (CSS) |
| Font Awesome Free | `vendor/css/fontawesome.min.css`, `vendor/fonts/webfonts/` (woff2 only) | 6.5.1 | CC BY 4.0 (icons) / SIL OFL 1.1 (fonts) / MIT (CSS) |
| Toastify JS | `vendor/js/toastify.min.js`, `vendor/css/toastify.min.css` | 1.12.0 | MIT |
| marked | `vendor/js/marked.min.js` (changelog page only) | 12.0.2 | MIT |
| Tailwind CSS | precompiled to `vendor/css/tailwind.css` from `lib/css/tailwind.src.css` (`npm run build:css`) | 3.4 | MIT |
| Tesseract.js | `vendor/ocr/tesseract.min.js`, `vendor/ocr/worker.min.js` (loaded only when the reader asks to recognise scanned pages) | 6.0.1 | Apache-2.0 |
| Tesseract.js-core (Tesseract OCR compiled to WebAssembly) | `vendor/ocr/core/tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js` | 6.1.2 (Tesseract 5) | Apache-2.0 |
| tessdata_fast language packs | `vendor/ocr/lang/ara.traineddata.gz`, `eng.traineddata.gz` | tessdata_fast (Tesseract 4/5 LSTM) | Apache-2.0 |
| IBM Plex Sans / Mono | `vendor/fonts/plex/` (latin subset, self-hosted via `vendor/css/fonts.css`) | 5.x (fontsource) | SIL OFL 1.1 |

Everything else in this repository is © ibra-kdbra and released under the MIT License (see `LICENSE`).

## The non-commercial component is gone

Up to and including 6.3.0 the page-turn engine was `engine/`, a modularised fork of DearFlip
(dFlip) Lite, distributed under CC BY-NC-ND 4.0 — personal and non-commercial use only. It was
covered by neither the MIT licence above nor anything like it, and this file carried a warning
saying so.

That engine was replaced in 7.0.0 by `engine-next/`, which was written from `docs/engine-api.md`
— the contract the application publishes — rather than from the code it replaced, and which is
MIT like the rest of the first-party tree. In the same release `engine/`, its stylesheet and the
vendored builds that existed only to feed it (the classic three.js and pdf.js with its worker,
compatibility shim and CMaps, and `mockup.min.js`) were deleted from the repository, and jQuery
went with them.

So the repository now contains no component under a non-commercial or no-derivatives licence.
Zaya's own code is MIT, and the third-party code that remains is the permissively-licensed set
listed in the table above — chiefly three.js under MIT and pdf.js under Apache-2.0, each with its
licence file beside it. That is a statement about what is in this repository and under what
terms; it is not legal advice, and anyone redistributing Zaya should read the licences above and
satisfy themselves in their own situation. The history of this repository still contains the
removed files, as git history does.
