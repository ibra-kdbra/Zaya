/**
 * Recent documents in the Document tab: links and files the reader opened before, newest first.
 * A file reopens from the local store; a link reopens from the network. The current document is
 * marked and not clickable.
 */
(function () {
    const list = () => document.getElementById('recentDocsList');
    const group = () => document.getElementById('recentDocsGroup');

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    }

    function hostOf(url) {
        try { return new URL(url).hostname; } catch (e) { return url; }
    }

    function toast(text, color) {
        if (!window.Toastify) return;
        const opts = { text, duration: 4500, gravity: 'bottom', position: 'right' };
        if (color) opts.backgroundColor = color;
        window.Toastify(opts).showToast();
    }

    function open(entry) {
        if (!window.ZayaDocuments) return;
        if (entry.type === 'url') {
            const safe = window.ValidationUtils && window.ValidationUtils.safePdfUrl ? window.ValidationUtils.safePdfUrl(entry.key) : entry.key;
            if (!safe) { toast('That link is not a valid PDF address.', '#ef4444'); return; }
            window.ZayaDocuments.openRemoteUrl(safe);
            return;
        }
        const store = window.ZayaLocalDocs;
        (store ? store.getFile(entry.key) : Promise.resolve(null)).then((rec) => {
            if (rec && rec.blob) {
                const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], entry.key, { type: 'application/pdf' });
                window.ZayaDocuments.openLocalFile(file, { skipSave: true });
                return;
            }
            toast(`"${entry.name}" is no longer kept in this browser. Pick it again to reopen it.`);
            const picker = document.getElementById('pdfFile');
            if (picker) picker.click();
        });
    }

    function render() {
        const ul = list();
        const box = group();
        if (!ul || !box || !window.ZayaLocalDocs) return;
        const entries = window.ZayaLocalDocs.recent();
        const currentKey = window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : '';
        ul.replaceChildren();
        box.hidden = entries.length === 0;
        entries.forEach((entry) => {
            const li = document.createElement('li');
            li.className = 'recent-item';
            const isCurrent = entry.key === currentKey;
            if (isCurrent) li.classList.add('is-current');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'recent-open';
            btn.disabled = isCurrent;
            btn.title = isCurrent ? 'This is the open document' : (entry.type === 'url' ? 'Open this link' : 'Reopen this file');
            btn.setAttribute('aria-current', isCurrent ? 'true' : 'false');

            const icon = document.createElement('i');
            icon.className = entry.type === 'url' ? 'fas fa-link' : 'fas fa-file-pdf';
            icon.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.className = 'recent-text';
            const name = document.createElement('span');
            name.className = 'recent-name';
            name.textContent = entry.type === 'url' ? hostOf(entry.key) : entry.name;
            const meta = document.createElement('span');
            meta.className = 'recent-meta';
            meta.textContent = entry.type === 'url' ? entry.key.replace(/^https?:\/\//, '') : ['From this device', formatSize(entry.size)].filter(Boolean).join(' · ');
            text.append(name, meta);
            btn.append(icon, text);
            btn.addEventListener('click', () => open(entry));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'recent-remove';
            remove.title = 'Remove from recent';
            remove.setAttribute('aria-label', `Remove ${name.textContent} from recent`);
            const x = document.createElement('i');
            x.className = 'fas fa-times';
            x.setAttribute('aria-hidden', 'true');
            remove.appendChild(x);
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                window.ZayaLocalDocs.forget(entry.key).then(render);
            });

            li.append(btn, remove);
            ul.appendChild(li);
        });
    }

    function init() {
        render();
        document.addEventListener('zaya:recentChanged', render);
        if (window.appState && window.appState.subscribe) window.appState.subscribe('currentPdf', render);
        const clear = document.getElementById('clearRecentBtn');
        if (clear) {
            clear.addEventListener('click', () => {
                const entries = window.ZayaLocalDocs ? window.ZayaLocalDocs.recent() : [];
                Promise.all(entries.map((e) => window.ZayaLocalDocs.forget(e.key))).then(render);
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.ZayaRecentDocs = { render, open };
})();
