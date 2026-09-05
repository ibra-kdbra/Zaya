import { getAllQuotes, addOrUpdateQuote, deleteQuote, getQuotesByPdf, getQuoteById } from '/lib/js/features/quotes/db.js';
import { displayQuotes, exportQuotes, displayQuotesInModal, exportPdfQuotes } from '/lib/js/features/quotes/ui.js';

const el = (id) => document.getElementById(id);
const closestFrom = (target, selector) => (target && target.closest ? target.closest(selector) : null);

/** Swap a button's contents for a spinner; the returned function puts the icon back. */
function busy(button, restoreIconClass) {
  const spinner = document.createElement('i');
  spinner.className = 'fas fa-spinner fa-spin';
  button.replaceChildren(spinner);
  button.disabled = true;
  return () => {
    const icon = document.createElement('i');
    icon.className = restoreIconClass;
    icon.setAttribute('aria-hidden', 'true');
    button.replaceChildren(icon);
    button.disabled = false;
  };
}

function toast(text, backgroundColor, duration) {
  Toastify({
    text,
    duration: duration || 3500,
    gravity: 'bottom',
    position: 'right',
    backgroundColor
  }).showToast();
}

// Subscribe to AppState changes for quotes system
window.appState.subscribe('currentPdf', (newValue) => {
    if (newValue && window.dbInitialized) {
        updateCurrentPdfContext();
    }
});

    // Subscribe to AppState changes for PDF type updates
    window.appState.subscribe('currentPdfType', (newValue) => {
        if (newValue && window.dbInitialized) {
            updateCurrentPdfContext();
        }
    });

// Expose the update function globally so it can be called from load.js
window.updateCurrentPdfContext = updateCurrentPdfContext;

/**
 * Quotes are filed under the same identity as page memory: the filename for a local
 * file (its blob: URL changes on every pick) and the URL for a remote document.
 */
function currentQuoteKey() {
  return window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : (window.appState.get('currentPdf') || '');
}

// Ensure the database is initialized before doing anything
function initializeApp() {
  // Use a more robust check for database readiness
  if (window.dbInitialized && typeof getAllQuotes === 'function') {
    loadQuotes();
    // Load current PDF context
    updateCurrentPdfContext();
  } else {
    // Retry after a short delay if the DB isn't initialized yet
    setTimeout(initializeApp, 200);
  }
}

function updateCurrentPdfContext() {
  // This will be called when a PDF is loaded to update the context
  const pdfUrl = window.appState.get('currentPdf') || '';
  const pdfName = window.appState.get('currentPdfName') || '';

  const info = el('currentPdfInfo');
  if (info) info.textContent = pdfName || 'No PDF loaded';

  // Update quotes button state
  const quotesToggleBtn = el('quotesToggleBtn');
  if (!quotesToggleBtn) return;
  const icon = quotesToggleBtn.querySelector('i');
  if (pdfUrl) {
    quotesToggleBtn.title = `View quotes for ${pdfName}`;
    if (icon) icon.classList.replace('fa-quote-left', 'fa-list');
  } else {
    quotesToggleBtn.title = 'Load a PDF to view quotes';
    if (icon) icon.classList.replace('fa-list', 'fa-quote-left');
  }
}

function loadQuotes() {
  getAllQuotes(displayQuotes);
}

// Keep the per-document modal in sync while it is open.
function refreshModalQuotes() {
  const modal = el('pdfSpecificQuotesModal');
  const pdfKey = currentQuoteKey();
  if (!modal || !modal.classList.contains('open') || !pdfKey) return;
  getQuotesByPdf(pdfKey, displayQuotesInModal);
}

const addQuoteBtn = el('addQuoteBtn');
if (addQuoteBtn) addQuoteBtn.addEventListener('click', function () {
  const quoteInput = el('quoteInput');
  const quoteId = this.dataset.editing ? Number(this.dataset.editing) : null;
  let newQuote = (quoteInput && quoteInput.value ? quoteInput.value : '').trim();

    // Enhanced input validation and sanitization for security
    if (!newQuote) {
      toast('Please enter a quote before adding.', '#ef4444');
      return;
    }

    // Sanitize input to prevent XSS and other injection attacks
    newQuote = window.ValidationUtils.sanitizeInput(newQuote);

    if (newQuote.length < 3) {
      toast('Quote must be at least 3 characters long.', '#ef4444', 3000);
      return;
    }

    if (newQuote) {
    // Get current PDF context from AppState
    const pdfKey = currentQuoteKey();
    const pdfName = window.appState.get('currentPdfName') || 'Local PDF';
    const pageNumber = window.appState.get('lastPage') || null;

    addOrUpdateQuote(quoteId, newQuote, pdfKey, pdfName, pageNumber, () => {

      loadQuotes();
      refreshModalQuotes();
      if (quoteInput) {
        quoteInput.value = '';
        quoteInput.classList.remove('ring-2', 'ring-blue-400');
      }
      delete this.dataset.editing;
      const icon = document.createElement('i');
      icon.className = 'fas fa-plus';
      icon.setAttribute('aria-hidden', 'true');
      this.replaceChildren(icon);
      this.title = 'Add Quote';
    });
  } else {
    toast('Please enter a quote before adding.', '#ef4444');
  }
});

document.addEventListener('click', function (event) {
  const button = closestFrom(event.target, '.editQuoteBtn');
  if (!button) return;
  event.stopPropagation();
  event.preventDefault();
  const id = Number(button.dataset.id);

  if (!window.dbInitialized) {
    toast('Database not ready. Please wait for the app to finish loading.', '#f59e0b', 4000);
    return;
  }

  // Add loading state to button
  const restore = busy(button, 'fas fa-edit');

  getQuoteById(id, (quote) => {
    if (quote) {

      // Populate the input field with the current quote text
      const quoteInput = el('quoteInput');
      if (quoteInput) {
        quoteInput.value = quote.quote;
        quoteInput.focus();
      }

      // Change the add button to update button
      const addBtn = el('addQuoteBtn');
      if (addBtn) {
        addBtn.dataset.editing = String(id);
        const icon = document.createElement('i');
        icon.className = 'fas fa-save';
        icon.setAttribute('aria-hidden', 'true');
        addBtn.replaceChildren(icon);
        addBtn.title = 'Update Quote';
      }

      // Close modal immediately if open
      const modal = el('pdfSpecificQuotesModal');
      if (modal && modal.classList.contains('open')) hideQuotesModal(modal);

      // Reset button state
      restore();

    } else {
      console.error('Quote not found with ID:', id);
      toast('Quote not found. It may have been deleted.', '#f59e0b');
      restore();
    }
  });
});

/* The delete confirmation dialog: fixed dark colours, so it reads on every theme. */
const DELETE_COLORS = {
  overlay: 'rgba(0,0,0,0.7)',
  background: '#1f2937',
  border: '#374151',
  icon: '#ef4444',
  title: '#f9fafb',
  text: '#d1d5db',
  cancelBg: '#374151',
  cancelText: '#d1d5db',
  cancelBorder: '#4b5563',
  cancelHover: '#4b5563',
  deleteBg: '#dc2626',
  deleteHover: '#b91c1c'
};

function buildDeleteConfirmation() {
  const colors = DELETE_COLORS;
  const overlay = document.createElement('div');
  overlay.id = 'deleteConfirmationModal';
  overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${colors.overlay};` +
    'display:flex;align-items:center;justify-content:center;z-index:1000001;font-family:inherit';

  const card = document.createElement('div');
  card.style.cssText = `background:${colors.background};border:2px solid ${colors.border};border-radius:8px;` +
    'padding:24px;max-width:400px;width:90%;box-shadow:0 10px 25px rgba(0,0,0,0.3);text-align:center';

  const iconRow = document.createElement('div');
  iconRow.style.cssText = `color:${colors.icon};font-size:24px;margin-bottom:12px`;
  const icon = document.createElement('i');
  icon.className = 'fas fa-exclamation-triangle';
  icon.setAttribute('aria-hidden', 'true');
  iconRow.appendChild(icon);

  const title = document.createElement('h3');
  title.textContent = 'Delete Quote?';
  title.style.cssText = `color:${colors.title};font-size:18px;font-weight:600;margin:0 0 8px 0`;

  const body = document.createElement('p');
  body.textContent = 'This action cannot be undone. The quote will be permanently removed.';
  body.style.cssText = `color:${colors.text};margin:0 0 20px 0;font-size:14px`;

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:center';

  const buttonBase = 'padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'cancelDeleteBtn';
  cancel.textContent = 'Cancel';
  cancel.style.cssText = `${buttonBase};background:${colors.cancelBg};color:${colors.cancelText};border:1px solid ${colors.cancelBorder}`;
  cancel.addEventListener('mouseenter', () => { cancel.style.background = colors.cancelHover; });
  cancel.addEventListener('mouseleave', () => { cancel.style.background = colors.cancelBg; });

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.id = 'confirmDeleteBtn';
  confirm.textContent = 'Delete';
  confirm.style.cssText = `${buttonBase};background:${colors.deleteBg};color:white;border:1px solid ${colors.deleteBg}`;
  confirm.addEventListener('mouseenter', () => { confirm.style.background = colors.deleteHover; });
  confirm.addEventListener('mouseleave', () => { confirm.style.background = colors.deleteBg; });

  actions.append(cancel, confirm);
  card.append(iconRow, title, body, actions);
  overlay.appendChild(card);
  return { overlay, cancel, confirm };
}

document.addEventListener('click', function (event) {
  const button = closestFrom(event.target, '.deleteQuoteBtn');
  if (!button) return;
  event.stopPropagation();
  event.preventDefault();

  // Clear any pending modal close timeout
  if (modalCloseTimeout) {
    clearTimeout(modalCloseTimeout);
    modalCloseTimeout = null;
  }

  const id = Number(button.dataset.id);
  const { overlay, cancel, confirm } = buildDeleteConfirmation();

  // Prevent quotes modal from closing
  isDeleteConfirmationOpen = true;

  function dismiss() {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
    isDeleteConfirmationOpen = false;
  }

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
  }

  cancel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); dismiss(); });

  confirm.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const restore = busy(button, 'fas fa-trash');
    deleteQuote(id, () => {
      // Update main quotes list immediately
      loadQuotes();

      // Update modal content immediately if open
      refreshModalQuotes();

      // Reset button state (the row itself is usually gone by now)
      restore();
      dismiss();
    });
  });

  // Handle clicking outside the dialog
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
});

const exportQuotesBtn = el('exportQuotesBtn');
if (exportQuotesBtn) exportQuotesBtn.addEventListener('click', exportQuotes);

document.addEventListener('click', function (event) {
  const button = closestFrom(event.target, '#modalExportQuotesBtn');
  if (!button) return;
  event.stopPropagation();
  event.preventDefault();

  const pdfKey = currentQuoteKey();
  const pdfName = window.appState.get('currentPdfName') || 'Local PDF';

  if (pdfKey) {
    // Add loading state to button
    const restore = busy(button, 'fas fa-download');

    getQuotesByPdf(pdfKey, (quotes) => {
      exportPdfQuotes(quotes, pdfName);
      restore();
    });
  } else {
    toast('No PDF loaded. Load a PDF first to export its quotes.', '#f59e0b', 4000);
  }
});

// PDF-specific quotes functionality
const quotesToggleBtn = el('quotesToggleBtn');
if (quotesToggleBtn) quotesToggleBtn.addEventListener('click', showPdfSpecificQuotesModal);

function themeClassFor() {
  const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
  return `theme-${currentTheme}`;
}

/** A single centred block (icon, heading, sentence) used for the modal's loading and empty states. */
function modalState(className, iconClass, heading, text) {
  const box = document.createElement('div');
  box.className = `${className} ${themeClassFor()} theme-applied`;
  const icon = document.createElement('i');
  icon.className = iconClass;
  icon.setAttribute('aria-hidden', 'true');
  box.appendChild(icon);
  if (heading) {
    const h = document.createElement('h3');
    h.textContent = heading;
    box.appendChild(h);
  }
  const p = document.createElement('p');
  p.textContent = text;
  box.appendChild(p);
  return box;
}

function showPdfSpecificQuotesModal() {
  const modal = el('pdfSpecificQuotesModal');
  const modalQuoteList = el('modalQuoteList');
  if (!modal || !modalQuoteList) return;

  // Apply current theme to modal
  const themeClass = themeClassFor();
  modal.classList.add(themeClass, 'theme-applied');
  document.querySelectorAll('.modal-content, .modal-header, .modal-body, .modal-loading')
    .forEach((node) => node.classList.add(themeClass, 'theme-applied'));

  // Show loading state
  modalQuoteList.replaceChildren(modalState('modal-loading', 'fas fa-spinner fa-spin', null, 'Loading quotes...'));

  modal.classList.add('open');
  if (window.ZayaA11y) window.ZayaA11y.trap(modal, { onEscape: closePdfSpecificQuotesModal });

  // The modal sits over the flipbook stage, so its visibility is asserted inline
  modal.style.display = 'flex';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.style.zIndex = '1000000';

  const pdfKey = currentQuoteKey();
  if (pdfKey) {
    // Ensure database is initialized
    if (!window.dbInitialized) {
      modalQuoteList.replaceChildren(modalState('no-quotes-modal', 'fas fa-exclamation-triangle',
        'Database Not Ready', 'Please wait for the application to fully load and try again.'));
      return;
    }

    // Get quotes for current PDF
    getQuotesByPdf(pdfKey, (quotes) => {
      displayQuotesInModal(quotes);
    });
  } else {
    modalQuoteList.replaceChildren(modalState('no-quotes-modal', 'fas fa-file-pdf',
      'No PDF Loaded', 'Load a PDF document first to view its quotes here.'));
  }
}

function hideQuotesModal(modal) {
  modal.classList.remove('open');
  modal.style.display = 'none';
  modal.style.visibility = 'hidden';
  modal.style.opacity = '0';
}

function closePdfSpecificQuotesModal() {
  const modal = el('pdfSpecificQuotesModal');
  if (!modal) return;
  if (window.ZayaA11y) window.ZayaA11y.release(modal);
  hideQuotesModal(modal);
}

// Close modal functionality
document.addEventListener('click', function (event) {
  if (!closestFrom(event.target, '.modal-close')) return;
  event.stopPropagation(); // Prevent event bubbling
  event.preventDefault(); // Prevent default action
  closePdfSpecificQuotesModal();
});

// Re-render both views after a backup import
document.addEventListener('zaya:quotesChanged', () => {
  loadQuotes();
  refreshModalQuotes();
});

// Clicks inside the modal must never reach the book behind it
const MODAL_PARTS = '#pdfSpecificQuotesModal, .modal-content, .modal-header, .modal-body, .modal-quote-list, ' +
  '.modal-quotes-header, .modal-quote-item, .modal-quote-content, .modal-quote-actions, .modal-quote-text, ' +
  '.modal-quote-meta, #deleteConfirmationModal';

document.addEventListener('click', function (event) {
  if (closestFrom(event.target, MODAL_PARTS)) event.stopPropagation();
});

// More robust click-outside detection with timeout to prevent immediate closing
let modalCloseTimeout;
let isDeleteConfirmationOpen = false;

document.addEventListener('click', function (event) {
  const modal = el('pdfSpecificQuotesModal');

  if (!modal || !modal.classList.contains('open')) {
    return; // Modal is not open, nothing to do
  }

  // Don't close modal if delete confirmation is open
  if (isDeleteConfirmationOpen) {
    return;
  }

  // Anything inside the dialog, its rows or their buttons counts as "inside"
  const isModalElement = !!closestFrom(event.target, `${MODAL_PARTS}, .modal-close, .panel-button, .editQuoteBtn, .deleteQuoteBtn, .quotes-count, .modal-export-btn`);

  // Also check coordinates as backup: the container fills the viewport, so a click that
  // lands on the scrim is still "inside" it and leaves the dialog open.
  const box = modal.getBoundingClientRect();
  const isInsideModal = event.clientX >= box.left && event.clientX <= box.right &&
                        event.clientY >= box.top && event.clientY <= box.bottom;

  // Clear any existing timeout
  if (modalCloseTimeout) {
    clearTimeout(modalCloseTimeout);
  }

  // Only close modal if click is clearly outside both element hierarchy and boundaries
  if (!isModalElement && !isInsideModal) {
    modalCloseTimeout = setTimeout(() => {
      if (modal.classList.contains('open') && !isDeleteConfirmationOpen) {
        modal.classList.remove('open');
      }
    }, 100); // Small delay to allow other handlers to process first
  }
});

// Add error handling for uncaught errors
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
});

// Add unhandled promise rejection handling
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize app once the database is ready
initializeApp();
