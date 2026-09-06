/*
 * Print pages.
 *
 * The reader picks a range, the selected PDF pages are rendered with pdf.js at roughly 150 dpi
 * into #printSheet as one <img> per page, and the browser's own print dialogue takes it from
 * there (lib/css/page/print.css hides everything else). Page order follows the range as it was
 * typed, so a right-to-left book prints in the order the reader asked for, not the visual order.
 *
 * Exposed as window.ZayaPrint = { open(), print(range) }.
 */
(function () {
    "use strict";

    const DPI = 150;
    const PDF_DPI = 72;               // pdf.js scale 1 is 72 dpi
    const MAX_LONG_SIDE = 2200;       // a printed sheet gains nothing above this
    const LARGE_RANGE = 100;          // above this the reader is asked to confirm

    const el = (id) => document.getElementById(id);
    const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

    function toast(text, backgroundColor, duration) {
        if (typeof Toastify !== "function") return;
        Toastify({
            text,
            duration: duration || 3500,
            gravity: "bottom",
            position: "right",
            backgroundColor
        }).showToast();
    }

    let mode = "current";
    let includeMarks = false;
    let busy = false;
    let cancelled = false;
    let confirmPending = false;
    let isOpen = false;
    let objectUrls = [];

    function book() {
        return window.dFlipBook || window.flipbookInstance || (window.DFLIP && window.DFLIP.activeBook) || null;
    }

    function pdfDocument() {
        const fb = book();
        return (fb && fb.contentProvider && fb.contentProvider.pdfDocument) || null;
    }

    function pageCount() {
        const doc = pdfDocument();
        if (doc && doc.numPages) return doc.numPages;
        const fb = book();
        if (fb && fb.target && fb.target.pageCount) return fb.target.pageCount;
        return 0;
    }

    /** The page (or spread) the reader is looking at, as PDF page numbers. */
    function currentPages() {
        const fb = book();
        const total = pageCount();
        if (!total) return [];
        const active = (fb && fb.target && fb.target._activePage) || (fb && fb._activePage) || 1;
        const pageMode = (fb && fb.target && fb.target.pageMode) || (fb && fb.pageMode) || 0;
        if (pageMode !== 2) return [clamp(active, total)];
        // A double-page spread shows an even page beside the odd one that follows it.
        const left = active % 2 === 0 ? active : active - 1;
        return dedupe([left, left + 1].filter((n) => n >= 1 && n <= total));
    }

    function clamp(n, total) {
        return Math.max(1, Math.min(total, n));
    }

    function dedupe(list) {
        const seen = new Set();
        const out = [];
        list.forEach((n) => { if (!seen.has(n)) { seen.add(n); out.push(n); } });
        return out;
    }

    /**
     * Parse "3-7, 10, 12-14" into page numbers, keeping the order they were typed in.
     * Returns { pages, error }; `error` is a sentence for the reader when nothing is usable.
     */
    function parseRange(text, total) {
        const raw = String(text == null ? "" : text).trim();
        if (!raw) return { pages: [], error: "print.errorEmpty" };
        const parts = raw.split(",");
        const pages = [];
        for (const part of parts) {
            const token = part.trim();
            if (!token) return { pages: [], error: "print.errorEmptyEntry", vars: {} };
            const span = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
            const single = token.match(/^(\d+)$/);
            if (span) {
                const from = parseInt(span[1], 10);
                const to = parseInt(span[2], 10);
                if (from < 1 || to < 1 || from > total || to > total) {
                    return { pages: [], error: "print.errorRange", vars: { total } };
                }
                const step = from <= to ? 1 : -1;
                for (let n = from; step > 0 ? n <= to : n >= to; n += step) pages.push(n);
            } else if (single) {
                const n = parseInt(single[1], 10);
                if (n < 1 || n > total) return { pages: [], error: "print.errorRange", vars: { total } };
                pages.push(n);
            } else {
                return { pages: [], error: "print.errorToken", vars: { token } };
            }
        }
        return { pages: dedupe(pages), error: null };
    }

    /** The pages the current dialog settings select, with the reason they are unusable. */
    function selection() {
        const total = pageCount();
        if (!total) return { pages: [], error: "print.noDocument" };
        if (mode === "all") return { pages: allPages(total), error: null };
        if (mode === "current") return { pages: currentPages(), error: null };
        const input = el("printRangeInput");
        return parseRange(input ? input.value : "", total);
    }

    function allPages(total) {
        const out = [];
        for (let n = 1; n <= total; n++) out.push(n);
        return out;
    }

    /* ------------------------------------------------------------------ dialog */

    function setMode(next) {
        mode = next;
        ["current", "all", "custom"].forEach((name) => {
            const btn = document.querySelector(`#printRangeSwitch [data-print-range="${name}"]`);
            if (btn) btn.setAttribute("aria-selected", name === next ? "true" : "false");
        });
        const field = el("printCustomField");
        if (field) field.hidden = next !== "custom";
        if (next === "custom") {
            const input = el("printRangeInput");
            if (input) setTimeout(() => input.focus(), 40);
        }
        confirmPending = false;
        sync();
    }

    /** Repaint the count, the error line, the confirmation warning and the Print button. */
    function sync() {
        const result = selection();
        const errorLine = el("printRangeError");
        const input = el("printRangeInput");
        const showError = mode === "custom" && !!result.error;
        if (errorLine) {
            errorLine.textContent = showError ? t(result.error, result.vars) : "";
            errorLine.hidden = !showError;
        }
        if (input) input.setAttribute("aria-invalid", showError ? "true" : "false");

        const count = result.pages.length;
        const summary = el("printSummary");
        if (summary) {
            summary.textContent = result.error && mode !== "custom"
                ? t(result.error, result.vars)
                : t("print.pageCount", { n: count });
        }

        const warning = el("printWarning");
        if (warning) {
            if (count > LARGE_RANGE) {
                warning.textContent = t(confirmPending ? "print.confirmLarge" : "print.warnLarge", { n: count });
                warning.hidden = false;
            } else {
                warning.textContent = "";
                warning.hidden = true;
            }
        }

        const confirmBtn = el("printConfirmBtn");
        if (confirmBtn) confirmBtn.disabled = busy || count === 0 || !!result.error;
        const label = el("printConfirmLabel");
        if (label && !busy) label.textContent = confirmPending ? t("print.confirmButton", { n: count }) : t("print.button");
        // While pages are being prepared, Cancel is the way to stop it.
        const cancelLabel = el("printCancelLabel");
        if (cancelLabel) cancelLabel.textContent = busy ? t("print.stop") : t("action.cancel");
    }

    function setProgress(text) {
        const line = el("printProgress");
        if (!line) return;
        line.textContent = text || "";
        line.hidden = !text;
    }

    function open() {
        const overlay = el("printDialog");
        const panel = el("printDialogPanel");
        if (!overlay || !panel || isOpen) return;
        releaseSheet();
        isOpen = true;
        cancelled = false;
        busy = false;
        confirmPending = false;
        overlay.hidden = false;
        setProgress("");
        const marks = el("printMarksToggle");
        if (marks) marks.checked = includeMarks;
        setMode(mode);
        if (window.ZayaA11y) window.ZayaA11y.trap(panel, { onEscape: close });
    }

    function close() {
        const overlay = el("printDialog");
        const panel = el("printDialogPanel");
        if (!overlay || !isOpen) return;
        cancelled = true;
        isOpen = false;
        overlay.hidden = true;
        setProgress("");
        // ZayaA11y.release puts focus back where it was when the dialog opened.
        if (window.ZayaA11y && panel) window.ZayaA11y.release(panel);
    }

    /* ----------------------------------------------------------------- render */

    function releaseSheet() {
        const sheet = el("printSheet");
        if (sheet) sheet.replaceChildren();
        objectUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ } });
        objectUrls = [];
    }

    function canvasUrl(canvas) {
        return new Promise((resolve) => {
            if (typeof canvas.toBlob !== "function") {
                resolve(canvas.toDataURL("image/jpeg", 0.92));
                return;
            }
            canvas.toBlob((blob) => {
                if (!blob) { resolve(canvas.toDataURL("image/jpeg", 0.92)); return; }
                const url = URL.createObjectURL(blob);
                objectUrls.push(url);
                resolve(url);
            }, "image/jpeg", 0.92);
        });
    }

    async function renderPage(doc, pageNumber) {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        let scale = DPI / PDF_DPI;
        const longSide = Math.max(base.width, base.height) * scale;
        if (longSide > MAX_LONG_SIDE) scale *= MAX_LONG_SIDE / longSide;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext("2d");
        // Printed sheets are white; a transparent PDF would otherwise pick up the theme.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (includeMarks) {
            const cp = book() && book().contentProvider;
            if (cp && typeof cp.drawSearchHighlights === "function") {
                try { cp.drawSearchHighlights(ctx, viewport, pageNumber); } catch (e) { /* nothing to paint */ }
            }
        }

        const img = document.createElement("img");
        img.className = "print-page";
        img.alt = t("print.pageAlt", { n: pageNumber });
        img.src = await canvasUrl(canvas);
        if (typeof page.cleanup === "function") { try { page.cleanup(); } catch (e) { /* ignore */ } }
        return img;
    }

    /**
     * Render `pages` into #printSheet and hand over to the browser.
     * @param {number[]} pages PDF page numbers, in the order they should print.
     * @returns {Promise<boolean>} whether the print dialogue was reached.
     */
    async function renderAndPrint(pages) {
        const doc = pdfDocument();
        const sheet = el("printSheet");
        if (!doc || !sheet || !pages.length) return false;

        releaseSheet();
        busy = true;
        cancelled = false;
        sync();

        for (let i = 0; i < pages.length; i++) {
            if (cancelled) {
                releaseSheet(); busy = false; setProgress(""); sync();
                toast(t("print.stopped"), "#f59e0b");
                return false;
            }
            setProgress(t("print.progress", { n: i + 1, total: pages.length }));
            try {
                sheet.appendChild(await renderPage(doc, pages[i]));
            } catch (error) {
                console.error("Could not render page", pages[i], error);
            }
        }

        busy = false;
        if (cancelled || !sheet.childElementCount) {
            releaseSheet(); setProgress(""); sync();
            toast(t(cancelled ? "print.stopped" : "print.failed"), "#ef4444");
            return false;
        }

        setProgress("");
        close();
        // The dialogue has to be gone before the browser paints its own print preview.
        await new Promise((resolve) => setTimeout(resolve, 30));
        window.print();
        return true;
    }

    /** Turn whatever a caller passed into a list of PDF page numbers. */
    function resolveRange(range) {
        const total = pageCount();
        if (!total) return { pages: [], error: "print.noDocument" };
        if (range == null || range === "current") return { pages: currentPages(), error: null };
        if (range === "all") return { pages: allPages(total), error: null };
        if (Array.isArray(range)) {
            const pages = dedupe(range.map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= total));
            return { pages, error: pages.length ? null : "print.errorRange", vars: { total } };
        }
        return parseRange(range, total);
    }

    /* ------------------------------------------------------------------- wiring */

    function onConfirm() {
        if (busy) return;
        const result = selection();
        if (result.error || !result.pages.length) { sync(); return; }
        if (result.pages.length > LARGE_RANGE && !confirmPending) {
            confirmPending = true;
            sync();
            return;
        }
        confirmPending = false;
        renderAndPrint(result.pages).catch((error) => {
            console.error("Print failed:", error);
            busy = false;
            setProgress("");
            sync();
            toast(t("print.failed"), "#ef4444");
        });
    }

    function init() {
        const overlay = el("printDialog");
        if (!overlay) return;

        document.addEventListener("click", (event) => {
            const target = event.target && event.target.closest ? event.target : null;
            if (!target) return;

            if (target.closest("#menuPrintBtn")) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const menu = el("customMoreMenu");
                if (menu) menu.classList.remove("show");
                open();
                return;
            }
            if (!isOpen) return;
            if (target.closest("#printCancelBtn, #printCloseBtn")) { close(); return; }
            if (target.closest("#printConfirmBtn")) { onConfirm(); return; }
            const seg = target.closest("#printRangeSwitch [data-print-range]");
            if (seg) { setMode(seg.getAttribute("data-print-range")); return; }
            // A tap on the backdrop, outside the panel, dismisses like Cancel
            if (target === overlay) close();
        });

        const input = el("printRangeInput");
        if (input) {
            input.addEventListener("input", () => { confirmPending = false; sync(); });
            input.addEventListener("keydown", (event) => {
                event.stopPropagation();
                if (event.key === "Enter") { event.preventDefault(); onConfirm(); }
            });
        }

        const marks = el("printMarksToggle");
        if (marks) marks.addEventListener("change", () => { includeMarks = marks.checked; });

        // Ctrl/Cmd+P prints the document as a book rather than the page around it
        document.addEventListener("keydown", (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
            if (event.key !== "p" && event.key !== "P") return;
            event.preventDefault();
            if (!isOpen) open();
        });

        // The dialog draws its count, its warning and its buttons itself, so it repaints on a switch.
        document.addEventListener("zaya:languageChanged", () => { if (isOpen) sync(); });

        // The rendered pages are only needed while the browser is printing them.
        window.addEventListener("afterprint", () => releaseSheet());
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    window.ZayaPrint = {
        open,
        close,
        isOpen: () => isOpen,
        /**
         * Print a range without the dialog. Accepts "3-7, 10", an array of page numbers,
         * "all" or "current" (the default).
         */
        print(range) {
            const result = resolveRange(range);
            if (result.error || !result.pages.length) return Promise.resolve(false);
            return renderAndPrint(result.pages);
        },
        parseRange
    };
})();
