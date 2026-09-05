/**
 * Small accessibility helpers: focus trapping for modals and ARIA labelling of icon-only buttons.
 */
(function () {
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const traps = new Map();

    function trap(container, { onEscape } = {}) {
        if (!container || traps.has(container)) return;
        const previouslyFocused = document.activeElement;
        if (!container.getAttribute('role')) container.setAttribute('role', 'dialog');
        container.setAttribute('aria-modal', 'true');

        const handler = (e) => {
            if (e.key !== 'Tab') return;
            const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        container.addEventListener('keydown', handler);
        // Escape is handled at document level so it works even before focus moved into the dialog
        const escHandler = (e) => {
            if (e.key !== 'Escape' || typeof onEscape !== 'function') return;
            if (Array.from(traps.keys()).pop() !== container) return; // only the top-most dialog
            e.preventDefault();
            e.stopImmediatePropagation();
            onEscape();
        };
        document.addEventListener('keydown', escHandler, true);
        const state = { handler, escHandler, previouslyFocused, focusTimer: 0 };
        traps.set(container, state);

        // The dialog may still be arriving, so the first focus waits a beat. A dialog dismissed
        // inside that beat must not have focus pulled back into it, so release() cancels this.
        const firstItem = container.querySelector(FOCUSABLE);
        if (firstItem) state.focusTimer = setTimeout(() => firstItem.focus(), 50);
    }

    function release(container) {
        const t = traps.get(container);
        if (!t) return;
        if (t.focusTimer) clearTimeout(t.focusTimer);
        container.removeEventListener('keydown', t.handler);
        document.removeEventListener('keydown', t.escHandler, true);
        container.removeAttribute('aria-modal');
        traps.delete(container);
        if (t.previouslyFocused && typeof t.previouslyFocused.focus === 'function') {
            try { t.previouslyFocused.focus(); } catch (e) { /* ignore */ }
        }
    }

    // Icon-only buttons: promote title -> aria-label so screen readers announce them
    function labelIconButtons(root) {
        (root || document).querySelectorAll('button[title]:not([aria-label]), a[title]:not([aria-label])').forEach((el) => {
            if (!el.textContent.trim()) el.setAttribute('aria-label', el.getAttribute('title'));
        });
    }

    document.addEventListener('zaya:init', () => labelIconButtons());
    document.addEventListener('zaya:toolbarReady', () => labelIconButtons());

    window.ZayaA11y = { trap, release, labelIconButtons };
})();
