/**
 * Recent documents in the Document tab: links and files the reader opened before, newest first.
 * A file reopens from the local store; a link reopens from the network. The current document is
 * marked and not clickable.
 *
 * Each file entry says whether its bytes are still kept in this browser, and the group carries a
 * line of storage usage plus a "Free up space" action that drops the stored copies (the entries and
 * their remembered pages stay). The list is a single tab stop: arrows move between entries and
 * between an entry's buttons, and Delete forgets the entry under the cursor.
 */
(function () {
    const list = () => document.getElementById('recentDocsList');
    const group = () => document.getElementById('recentDocsGroup');

    let storedNames = new Set();

    function formatSize(bytes) {
        const n = Number(bytes) || 0;
        if (!n) return '';
        if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
        if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
        return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
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

    /* ---- Storage summary and clean-up --------------------------------------------------------- */

    let storageBox = null;

    /** The usage line, the "Free up space" button and its inline confirmation, built once. */
    function ensureStorageUi() {
        if (storageBox) return storageBox;
        const box = group();
        if (!box) return null;

        storageBox = document.createElement('div');
        storageBox.className = 'storage-box';

        const usage = document.createElement('p');
        usage.className = 'storage-usage';
        usage.id = 'storageUsageLine';
        usage.hidden = true;

        const actions = document.createElement('div');
        actions.className = 'storage-actions';
        const free = document.createElement('button');
        free.type = 'button';
        free.id = 'freeUpSpaceBtn';
        free.className = 'ui-btn ui-btn-quiet ui-btn-small';
        free.textContent = 'Free up space';
        free.title = 'Remove the stored copies of your files, and recognised text for documents you no longer have in this list';
        actions.appendChild(free);

        const confirm = document.createElement('div');
        confirm.className = 'storage-confirm';
        confirm.id = 'freeUpSpaceConfirm';
        confirm.hidden = true;
        const question = document.createElement('span');
        question.className = 'storage-confirm-text';
        question.textContent = 'Remove the stored file copies and unused recognised text? The list and your remembered pages stay.';
        const yes = document.createElement('button');
        yes.type = 'button';
        yes.id = 'freeUpSpaceConfirmBtn';
        yes.className = 'ui-btn ui-btn-quiet ui-btn-small';
        yes.textContent = 'Free up space';
        const no = document.createElement('button');
        no.type = 'button';
        no.id = 'freeUpSpaceCancelBtn';
        no.className = 'ui-btn ui-btn-quiet ui-btn-small';
        no.textContent = 'Keep them';
        confirm.append(question, yes, no);

        const showConfirm = (on) => {
            confirm.hidden = !on;
            actions.hidden = on;
            if (on) yes.focus(); else free.focus();
        };
        free.addEventListener('click', () => showConfirm(true));
        no.addEventListener('click', () => showConfirm(false));
        confirm.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); showConfirm(false); } });
        yes.addEventListener('click', () => {
            yes.disabled = true;
            const store = window.ZayaLocalDocs;
            (store ? store.freeUpSpace() : Promise.resolve({ files: 0, bytes: 0, ocrPages: 0 })).then((result) => {
                yes.disabled = false;
                showConfirm(false);
                const freed = formatSize(result.bytes);
                toast(result.files || result.ocrPages
                    ? `Freed ${freed || 'some space'}. Your recent list and remembered pages are unchanged.`
                    : 'There was nothing to remove.');
                return render();
            });
        });

        storageBox.append(usage, actions, confirm);
        box.appendChild(storageBox);
        return storageBox;
    }

    /** "Using 312 MB of the space this browser allows", or nothing when the browser will not say. */
    function refreshUsage() {
        const line = document.getElementById('storageUsageLine');
        if (!line || !window.ZayaDB) return Promise.resolve();
        return window.ZayaDB.estimate().then((e) => {
            if (!e.supported) { line.hidden = true; return; }
            line.hidden = false;
            line.textContent = `Using ${formatSize(e.usage) || '0 KB'} of the space this browser allows`;
        }).catch(() => {});
    }

    /* ---- The list ----------------------------------------------------------------------------- */

    /** Buttons in the list, in tab order, so the arrow keys can walk them. */
    const buttonsOf = (li) => Array.from(li.querySelectorAll('button:not(:disabled)'));

    function focusItem(items, index, sameColumn) {
        const li = items[Math.max(0, Math.min(items.length - 1, index))];
        if (!li) return;
        const buttons = buttonsOf(li);
        const target = buttons[Math.min(sameColumn || 0, buttons.length - 1)] || buttons[0];
        if (target) target.focus();
    }

    function onListKeydown(e) {
        const ul = list();
        if (!ul) return;
        const items = Array.from(ul.querySelectorAll('.recent-item'));
        const li = e.target.closest('.recent-item');
        if (!li) return;
        const row = items.indexOf(li);
        const buttons = buttonsOf(li);
        const column = buttons.indexOf(e.target);

        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); focusItem(items, row + 1, column); break;
            case 'ArrowUp': e.preventDefault(); focusItem(items, row - 1, column); break;
            case 'Home': e.preventDefault(); focusItem(items, 0, column); break;
            case 'End': e.preventDefault(); focusItem(items, items.length - 1, column); break;
            case 'ArrowRight': if (buttons[column + 1]) { e.preventDefault(); buttons[column + 1].focus(); } break;
            case 'ArrowLeft': if (buttons[column - 1]) { e.preventDefault(); buttons[column - 1].focus(); } break;
            case 'Delete':
            case 'Backspace': {
                const remove = li.querySelector('.recent-remove');
                if (remove) { e.preventDefault(); remove.click(); }
                break;
            }
            default: break;
        }
    }

    function buildItem(entry, currentKey) {
        const li = document.createElement('li');
        li.className = 'recent-item';
        const isCurrent = entry.key === currentKey;
        if (isCurrent) li.classList.add('is-current');
        const kept = entry.type === 'local' && storedNames.has(entry.key);

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
        if (entry.type === 'url') {
            meta.textContent = entry.key.replace(/^https?:\/\//, '');
        } else {
            const state = document.createElement('span');
            state.className = kept ? 'recent-state is-kept' : 'recent-state';
            state.textContent = kept ? 'Kept in this browser' : 'Not kept';
            meta.append(state);
            const size = formatSize(entry.size);
            if (size) {
                const sizeEl = document.createElement('span');
                sizeEl.className = 'recent-size';
                sizeEl.textContent = size;
                meta.append(sizeEl);
            }
        }
        text.append(name, meta);
        btn.append(icon, text);
        btn.addEventListener('click', () => open(entry));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'recent-remove';
        remove.title = kept ? 'Remove from recent and delete the stored copy' : 'Remove from recent';
        remove.setAttribute('aria-label', `Remove ${name.textContent} from recent${kept ? ' and delete the copy kept in this browser' : ''}`);
        const x = document.createElement('i');
        x.className = 'fas fa-times';
        x.setAttribute('aria-hidden', 'true');
        remove.appendChild(x);
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            window.ZayaLocalDocs.forget(entry.key).then(render);
        });

        li.append(btn, remove);
        return li;
    }

    /** Redraw the list. Resolves once the "kept in this browser" state has been read back. */
    function render() {
        const ul = list();
        const box = group();
        if (!ul || !box || !window.ZayaLocalDocs) return Promise.resolve();
        return window.ZayaLocalDocs.listFiles().then((files) => {
            storedNames = new Set(files.map((f) => f.name));
            const sizes = new Map(files.map((f) => [f.name, f.size]));
            const entries = window.ZayaLocalDocs.recent();
            const currentKey = window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : '';
            ul.replaceChildren();
            box.hidden = entries.length === 0;
            entries.forEach((entry) => {
                const withSize = entry.size ? entry : { ...entry, size: sizes.get(entry.key) || 0 };
                ul.appendChild(buildItem(withSize, currentKey));
            });
            ensureStorageUi();
            return refreshUsage();
        });
    }

    function init() {
        render();
        const ul = list();
        if (ul) ul.addEventListener('keydown', onListKeydown);
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

    window.ZayaRecentDocs = { render, open, refreshUsage };
})();
