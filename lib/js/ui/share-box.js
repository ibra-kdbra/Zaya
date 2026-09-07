/*
 * The share box: a link to the page being read, and three ways to pass it on.
 *
 * It knows nothing about the book. The engine facade works out the address (`ZayaBook.current
 * .share()` asks the engine for this page's link) and hands it here; everything below is
 * ordinary chrome, in the reader's own surface and the reader's own language.
 */
window.ZayaShareBox = (function () {
    "use strict";

    const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);
    let overlay = null;

    function close() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        document.removeEventListener("keydown", onKeydown, true);
    }

    function onKeydown(event) {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
    }

    function iconButton(tag, className, label) {
        const node = document.createElement(tag);
        node.className = className;
        node.setAttribute("aria-label", label);
        node.setAttribute("title", label);
        if (tag === "button") node.type = "button";
        return node;
    }

    /**
     * Show the box for `url`. Opening it twice replaces the first one.
     * @param {string} url the address to share
     */
    function open(url) {
        close();
        const host = document.getElementById("flipbookContainer") || document.body;
        const address = String(url || (typeof location !== "undefined" ? location.href : ""));

        overlay = document.createElement("div");
        overlay.className = "share-overlay";

        const box = document.createElement("div");
        box.className = "share-box";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-label", t("action.share"));

        const header = document.createElement("div");
        header.className = "share-header";
        const title = document.createElement("span");
        title.className = "share-title";
        title.textContent = t("action.share");
        const dismiss = iconButton("button", "share-close ti-close", t("action.close"));
        header.append(title, dismiss);

        const actions = document.createElement("div");
        actions.className = "share-actions";
        const facebook = iconButton("a", "share-action share-facebook ti-facebook", t("share.facebook"));
        facebook.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(address);
        const twitter = iconButton("a", "share-action share-twitter ti-twitter-alt", t("share.twitter"));
        twitter.href = "https://twitter.com/intent/tweet?url=" + encodeURIComponent(address);
        const mail = iconButton("a", "share-action share-mail ti-email", t("share.email"));
        mail.href = "mailto:?subject=" + encodeURIComponent(t("engine.mailSubject"))
            + "&body=" + encodeURIComponent(t("engine.mailBody", { url: address }));
        [facebook, twitter, mail].forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
        actions.append(facebook, twitter, mail);

        const field = document.createElement("textarea");
        field.className = "share-url";
        field.readOnly = true;
        field.setAttribute("aria-label", t("share.address"));
        field.value = address;

        box.append(header, actions, field);
        overlay.appendChild(box);
        host.appendChild(overlay);

        dismiss.addEventListener("click", close);
        overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
        document.addEventListener("keydown", onKeydown, true);

        // The address is what the reader came for: it is selected and ready to copy.
        field.focus();
        field.select();
    }

    return { open, close, isOpen: () => !!overlay };
})();
