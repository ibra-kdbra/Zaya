# Zaya

A PDF flipbook website designed to make your life easier. It can take a PDF as input and generate a flipbook, whether it's a URL, local file, or a featured YouTube playlist to play while reading.

![Sample](/assets/captured.png)

## 📋 Changelog

For a complete history of changes, features, and updates, please visit the changelog:
**[View Changelog](https://zaya.vercel.app/changelog.html)**

## ✨ Features

- Realistic 3D page turning (WebGL) with a CSS fallback, single/double page modes, RTL support
- **Full-text search** across the whole PDF with highlighted snippets (`Ctrl/Cmd+F`)
- Thumbnails and outline/bookmarks side panels
- 50+ colour themes, quotes notebook stored locally (IndexedDB), remembered last page per document
- Built-in media player: YouTube videos/playlists or local audio, with loop
- Works offline as a PWA; every third-party asset is vendored, no runtime CDN
- Strict Content-Security-Policy and validated inputs

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | previous / next page |
| `Ctrl/Cmd + F` | open in-document search |
| `F` | toggle fullscreen |
| `Ctrl/Cmd + K` | toggle control panel |
| `Esc` | close panel / leave fullscreen |

## 🛠 Development

```bash
npm install     # dev tooling only (eslint, playwright, tailwind, http-server)
npm start       # http://localhost:8080
npm run check   # syntax-check every script
npm run lint    # eslint
npm test        # Playwright smoke tests (desktop + mobile emulation)
npm run build   # recompile Tailwind CSS and the changelog bundle
```

See `CONTRIBUTING.md`, `SECURITY.md` and `ROADMAP.md`.

## Tech Stack

[![Tech Stack](https://skillicons.dev/icons?i=threejs,js,jquery,css,html,tailwindcss,svg)](https://skillicons.dev)

## Issues

### Flipbook pages are not visible/defective in PDF

Check the pdf if using the link Make sure that cross-origin resource sharing is enabled

## 🔧 Custom Default PDF

You can change the default PDF that loads when opening `index.html` in two ways:

### Method 1: Edit `config.js`

`config.js` is loaded before the app and is the place for per-deployment settings (inline scripts in `index.html` are blocked by the Content-Security-Policy). Uncomment and set the URL:

```js
window.ZAYA_DEFAULT_PDF = "https://your-server.com/your-document.pdf";
```

You can also use a relative path if the PDF is on the same server:

```js
window.ZAYA_DEFAULT_PDF = "./documents/my-book.pdf";
```

### Method 2: URL Parameter

Append `?pdf=` to the URL to load any PDF directly:

```
https://your-site.com/index.html?pdf=https://example.com/document.pdf
```

You can also specify a starting page:

```
https://your-site.com/index.html?pdf=https://example.com/document.pdf&page=5
```

> **Note:** Remote PDFs must have CORS enabled on their server for cross-origin loading to work.

## 🔁 Media Loop

The media player supports looping for both local audio files and YouTube videos/playlists. Toggle **Media Loop** in the Settings panel (control panel → Settings → Media Loop). The setting is remembered across sessions.

## File Structure

<details>
<summary>Click to expand!</summary>
This flipbook plugin is jQuery-based. Basically, you can copy the files in folder to your working directory. You don't need to include the lib folder..

```git
└── 📁pdf-flipbook
    └── 📁assets
    └── 📁lib
        └── 📁css
            └── 📁page
            └── 📁themes
                ├── themes.css
            ├── min.css
            ├── style.css
            ├── themify-icons.min.css
        └── 📁fonts
        └── 📁images
            └── 📁pdfjs
            ├── loading.gif
        └── 📁js
            └── 📁core
                └── 📁dflip        (modular flipbook engine)
                ├── load.js
            └── 📁features
                └── 📁changelog
                    └── 📁services
                        ├── ChangelogApiService.js
                        ├── ChangelogParserService.js
                    └── 📁ui
                        ├── ChangelogRenderer.js
                    └── 📁utils
                        ├── ChangelogConfig.js
                        ├── ChangelogUtils.js
                    ├── changelog.js
                └── 📁media
                    ├── media.js
                └── 📁quotes
                    ├── db.js
                    ├── main.js
                    ├── ui.js
                └── 📁search
                    ├── pdf-search.js
                └── 📁themes
                    ├── manager.js
                    ├── selector.js
            └── 📁libs
                └── 📁cmaps
                ├── compatibility.js
                ├── jquery.min.js
                ├── mockup.min.js
                ├── pdf.min.js
                ├── pdf.worker.min.js
                ├── three.min.js
            └── 📁ui
                ├── controls.js
            └── 📁utils
                ├── app-state.js
                ├── browser-compatibility.js
                ├── memory-manager.js
                ├── mobile-support.js
                ├── pageMemory.js
                ├── performance-monitor.js
                ├── service-worker.js
                ├── theme-utils.js
                ├── validation.js
            ├── app.js
        └── 📁sound
```

## File Template

And ensure the following files are included in the html.

CSS:

```css
<!-- Flipbook StyleSheet -->
<link href="http://www.yoursite.com/dflip/css/dflip.css" rel="stylesheet" type="text/css">

<!-- Icons Stylesheet -->
<link href="http://www.yoursite.com/dflip/css/themify-icons.css" rel="stylesheet" type="text/css">     
```

JavaScript:

Note: Include them just before </body> tag. Don't use them in head.

```javascript
<!-- jQuery 1.9.1 or above -->
<script src="http://www.yoursite.com/dflip/js/libs/jquery.min.js" type="text/javascript"></script>

<!-- Flipbook main Js file -->
<script src="http://www.yoursite.com/dflip/js/dflip.min.js" type="text/javascript"></script>     
```

Basic HTML Template

```html
    <html>
    <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Basic HTML Template</title>

    <!-- Flipbook StyleSheet -->
    <link href="http://www.yoursite.com/dflip/css/dflip.css" rel="stylesheet" type="text/css">

    <!-- Icons Stylesheet -->
    <link href="http://www.yoursite.com/dflip/css/themify-icons.css" rel="stylesheet" type="text/css">

    </head>
    <body>
    <div class="_df_thumb" id="df_manual_thumb" source="location of pdf.pdf" thumb="location of thumbnail.jpg"> PDF Example</div >
    <!-- Refer to other examples on how to create different types of flipbook -->

    <!-- jQuery 1.9.1 or above -->
    <script src="http://www.yoursite.com/dflip/js/libs/jquery.min.js" type="text/javascript"></script>

    <!-- Flipbook main Js file -->
    <script src="http://www.yoursite.com/dflip/js/dflip.min.js" type="text/javascript"></script>

    </body>
    </html>
```

Create Flipbook through Button lightbox.

```html
<div class="_df_button"
    source="http://www.yoursite.com/books/dflip manual.pdf"
    id="df_manual_button">
    Button
</div>
```

</details>

### 🔗 Libraries & Tools

- **[PDF.js](https://mozilla.github.io/pdf.js/)**  
  _A powerful open-source library for rendering PDF files directly in the browser._

- **[Three.js](https://threejs.org/)**  
  _A flexible JavaScript 3D library for creating immersive WebGL experiences._

- **[DFlip](https://github.com/dearhive/dearflip-js-flipbook)**  
  _A smooth and customizable flipbook plugin, perfect for converting PDFs into interactive books._

- **[JQuery_DFlip](https://www.icootoo.com/pdf/documentation.html)**  
  _An extension of DFlip with support for jQuery, adding easy-to-use flipbook effects to your documents._
