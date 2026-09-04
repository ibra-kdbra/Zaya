import { getAllQuotes, addOrUpdateQuote, deleteQuote, getQuotesByPdf, getQuoteById } from '/lib/js/features/quotes/db.js';
import { displayQuotes, exportQuotes, displayQuotesInModal, exportPdfQuotes } from '/lib/js/features/quotes/ui.js';

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

  $("#currentPdfInfo").text(pdfName || 'No PDF loaded');

  // Update quotes button state
  const quotesToggleBtn = $("#quotesToggleBtn");
  if (pdfUrl) {
    quotesToggleBtn.prop('title', `View quotes for ${pdfName}`);
    quotesToggleBtn.find('i').removeClass('fa-quote-left').addClass('fa-list');
  } else {
    quotesToggleBtn.prop('title', 'Load a PDF to view quotes');
    quotesToggleBtn.find('i').removeClass('fa-list').addClass('fa-quote-left');
  }
}

function loadQuotes() {
  getAllQuotes(displayQuotes);
}

$("#addQuoteBtn").on("click", function() {
  const quoteId = $(this).data("id");
    let newQuote = $("#quoteInput").val().trim();

    // Enhanced input validation and sanitization for security
    if (!newQuote) {
      Toastify({
        text: "Please enter a quote before adding.",
        duration: 3500,
        gravity: "bottom",
        position: "right",
        backgroundColor: "#ef4444"
      }).showToast();
      return;
    }

    // Sanitize input to prevent XSS and other injection attacks
    newQuote = window.ValidationUtils.sanitizeInput(newQuote);

    if (newQuote.length < 3) {
      Toastify({
        text: "Quote must be at least 3 characters long.",
        duration: 3000,
        gravity: "bottom",
        position: "right",
        backgroundColor: "#ef4444"
      }).showToast();
      return;
    }

    if (newQuote) {
    // Get current PDF context from AppState
    const pdfUrl = window.appState.get('currentPdf') || '';
    const pdfName = window.appState.get('currentPdfName') || 'Local PDF';

  

    addOrUpdateQuote(quoteId, newQuote, pdfUrl, pdfName, null, () => {

      loadQuotes();
      $("#quoteInput").val("").removeClass("ring-2 ring-blue-400");
      $(this).data("id", null).html('<i class="fas fa-plus"></i>').attr("title", "Add Quote");
    });
  } else {
    Toastify({
      text: "Please enter a quote before adding.",
      duration: 3500,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#ef4444"
    }).showToast();
  }
});

$(document).on("click", ".editQuoteBtn", function(event) {
  event.stopPropagation();
  event.preventDefault();
  const id = $(this).data("id");
  const button = $(this);


  if (!window.dbInitialized) {
    Toastify({
      text: "Database not ready. Please wait for the app to finish loading.",
      duration: 4000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#f59e0b"
    }).showToast();
    return;
  }

  // Add loading state to button
  button.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);

  getQuoteById(id, (quote) => {
    if (quote) {

      // Populate the input field with the current quote text
      $("#quoteInput").val(quote.quote).focus();

      // Change the add button to update button
      $("#addQuoteBtn").data("id", id).html('<i class="fas fa-save"></i>').attr("title", "Update Quote");

      // Close modal immediately if open
      const modal = $("#pdfSpecificQuotesModal");
      if (modal.hasClass("open")) {
        modal.removeClass("open").css({
          'display': 'none',
          'visibility': 'hidden',
          'opacity': '0'
        });
      }

      // Reset button state
      button.html('<i class="fas fa-edit"></i>').prop('disabled', false);


    } else {
      console.error("Quote not found with ID:", id);
      Toastify({
        text: "Quote not found. It may have been deleted.",
        duration: 3500,
        gravity: "bottom",
        position: "right",
        backgroundColor: "#f59e0b"
      }).showToast();
      button.html('<i class="fas fa-edit"></i>').prop('disabled', false);
    }
  });
});

$(document).on("click", ".deleteQuoteBtn", function(event) {
  event.stopPropagation();
  event.preventDefault();

  // Clear any pending modal close timeout
  if (modalCloseTimeout) {
    clearTimeout(modalCloseTimeout);
    modalCloseTimeout = null;
  }

  const id = $(this).data("id");
  const button = $(this);

  // Use consistent dark theme for delete confirmation (always visible)
  const colors = {
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

  // Create centered modal confirmation dialog with theme colors
  const confirmModal = $(`
    <div id="deleteConfirmationModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${colors.overlay};
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000001;
      font-family: inherit;
    ">
      <div style="
        background: ${colors.background};
        border: 2px solid ${colors.border};
        border-radius: 8px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        text-align: center;
      ">
        <div style="
          color: ${colors.icon};
          font-size: 24px;
          margin-bottom: 12px;
        ">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 style="
          color: ${colors.title};
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 8px 0;
        ">Delete Quote?</h3>
        <p style="
          color: ${colors.text};
          margin: 0 0 20px 0;
          font-size: 14px;
        ">This action cannot be undone. The quote will be permanently removed.</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="cancelDeleteBtn" style="
            padding: 8px 16px;
            background: ${colors.cancelBg};
            color: ${colors.cancelText};
            border: 1px solid ${colors.cancelBorder};
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
          ">Cancel</button>
          <button id="confirmDeleteBtn" style="
            padding: 8px 16px;
            background: ${colors.deleteBg};
            color: white;
            border: 1px solid ${colors.deleteBg};
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
          ">Delete</button>
        </div>
      </div>
    </div>
  `);

  // Store current context
  window.currentDeleteButton = button;
  window.currentDeleteId = id;

  // Prevent quotes modal from closing
  isDeleteConfirmationOpen = true;

  // Add to body
  $('body').append(confirmModal);

  // Use a small delay to ensure DOM is ready
  setTimeout(() => {
    // Handle cancel - use namespaced event
    $(document).on('click.deleteModal', '#cancelDeleteBtn', function(e) {
      e.preventDefault();
      e.stopPropagation();
      confirmModal.remove();
      $(document).off('click.deleteModal');
      $(document).off('keydown.deleteConfirm');
      isDeleteConfirmationOpen = false;
    });

    // Handle confirm - use namespaced event
    $(document).on('click.deleteModal', '#confirmDeleteBtn', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const btn = window.currentDeleteButton;
      const deleteId = window.currentDeleteId;

      if (btn && deleteId) {
        btn.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);

        deleteQuote(deleteId, () => {
          // Update main quotes list immediately
          loadQuotes();

          // Update modal content immediately if open
          const modal = $("#pdfSpecificQuotesModal");
          const currentPdf = window.appState.get('currentPdf');
          if (modal.hasClass("open") && currentPdf) {
            getQuotesByPdf(currentPdf, (quotes) => {
              displayQuotesInModal(quotes);
            });
          }

          // Reset button state
          btn.html('<i class="fas fa-trash"></i>').prop('disabled', false);
          confirmModal.remove();
          $(document).off('click.deleteModal');
          $(document).off('keydown.deleteConfirm');
          isDeleteConfirmationOpen = false;
        });
      } else {
        confirmModal.remove();
        $(document).off('click.deleteModal');
        $(document).off('keydown.deleteConfirm');
        isDeleteConfirmationOpen = false;
      }
    });

    // Handle clicking outside modal
    confirmModal.on('click', function(e) {
      if (e.target === confirmModal[0]) {
        confirmModal.remove();
        $(document).off('click.deleteModal');
        $(document).off('keydown.deleteConfirm');
        isDeleteConfirmationOpen = false;
      }
    });

    // Handle escape key
    $(document).on('keydown.deleteConfirm', function(e) {
      if (e.key === 'Escape') {
        confirmModal.remove();
        $(document).off('keydown.deleteConfirm');
        $(document).off('click.deleteModal');
        isDeleteConfirmationOpen = false;
      }
    });
  }, 10);

  // Add hover effects using theme colors
  $('#cancelDeleteBtn').hover(
    function() { $(this).css('background', colors.cancelHover); },
    function() { $(this).css('background', colors.cancelBg); }
  );

  $('#confirmDeleteBtn').hover(
    function() { $(this).css('background', colors.deleteHover); },
    function() { $(this).css('background', colors.deleteBg); }
  );
});

$("#exportQuotesBtn").on("click", exportQuotes);

$(document).on("click", "#modalExportQuotesBtn", function(event) {
  event.stopPropagation();
  event.preventDefault();
  const button = $(this);

  const currentPdf = window.appState.get('currentPdf');
  const pdfName = window.appState.get('currentPdfName') || 'Local PDF';

  if (currentPdf) {
    // Add loading state to button
    button.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);

    getQuotesByPdf(currentPdf, (quotes) => {

      exportPdfQuotes(quotes, pdfName);

      // Reset button state
      button.html('<i class="fas fa-download"></i>').prop('disabled', false);
    });
  } else {
    Toastify({
      text: "No PDF loaded. Load a PDF first to export its quotes.",
      duration: 4000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#f59e0b"
    }).showToast();
  }
});

// PDF-specific quotes functionality
$("#quotesToggleBtn").on("click", function() {
  showPdfSpecificQuotesModal();
});

function showPdfSpecificQuotesModal() {
  const modal = $("#pdfSpecificQuotesModal");
  const modalQuoteList = $("#modalQuoteList");

  // Apply current theme to modal
  const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
  const themeClass = `theme-${currentTheme}`;
  modal.addClass(`${themeClass} theme-applied`);
  $('.modal-content, .modal-header, .modal-body, .modal-loading').addClass(`${themeClass} theme-applied`);

  // Show loading state
  modalQuoteList.html(`
    <div class="modal-loading ${themeClass} theme-applied">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading quotes...</p>
    </div>
  `);

  modal.addClass("open");
  if (window.ZayaA11y) window.ZayaA11y.trap(modal[0], { onEscape: closePdfSpecificQuotesModal });

  // Force a style recalculation and ensure visibility
  modal.hide().show(0);

  // Add inline styles as a test to ensure modal is visible
  modal.css({
    'display': 'flex',
    'visibility': 'visible',
    'opacity': '1',
    'z-index': '1000000'
  });

  const currentPdf = window.appState.get('currentPdf');
  if (currentPdf) {
    // Ensure database is initialized
    if (!window.dbInitialized) {
      modalQuoteList.html(`
        <div class="no-quotes-modal ${themeClass} theme-applied">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Database Not Ready</h3>
          <p>Please wait for the application to fully load and try again.</p>
        </div>
      `);
      return;
    }

    // Get quotes for current PDF
    getQuotesByPdf(currentPdf, (quotes) => {
      displayQuotesInModal(quotes);
    });
  } else {
    modalQuoteList.html(`
      <div class="no-quotes-modal ${themeClass} theme-applied">
        <i class="fas fa-file-pdf"></i>
        <h3>No PDF Loaded</h3>
        <p>Load a PDF document first to view its quotes here.</p>
      </div>
    `);
  }
}

function closePdfSpecificQuotesModal() {
  const modal = $("#pdfSpecificQuotesModal");
  if (window.ZayaA11y) window.ZayaA11y.release(modal[0]);
  modal.removeClass("open").css({
    'display': 'none',
    'visibility': 'hidden',
    'opacity': '0'
  });
}

// Close modal functionality
$(document).on("click", ".modal-close", function(event) {
  event.stopPropagation(); // Prevent event bubbling
  event.preventDefault(); // Prevent default action
  closePdfSpecificQuotesModal();
});

// Re-render the list after a backup import
document.addEventListener('zaya:quotesChanged', loadQuotes);

// Prevent modal clicks from bubbling up to canvas - comprehensive coverage
$(document).on("click", "#pdfSpecificQuotesModal", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-content", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-header", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-body", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-list", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quotes-header", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-item", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-content", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-actions", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-text", function(event) {
  event.stopPropagation();
});

$(document).on("click", ".modal-quote-meta", function(event) {
  event.stopPropagation();
});

// More robust click-outside detection with timeout to prevent immediate closing
let modalCloseTimeout;
let isDeleteConfirmationOpen = false;

$(document).on("click", function(event) {
  const modal = $("#pdfSpecificQuotesModal");

  if (!modal.hasClass("open")) {
    return; // Modal is not open, nothing to do
  }

  // Don't close modal if delete confirmation is open
  if (isDeleteConfirmationOpen) {
    return;
  }

  // Get the actual click target and its hierarchy
  const target = $(event.target);
  const targetClasses = target.attr('class') || '';
  const targetId = target.attr('id') || '';

  // Define all elements that should be considered "inside" the modal
  const modalElements = [
    'modal-container',
    'modal-content',
    'modal-header',
    'modal-body',
    'modal-quote-list',
    'modal-quotes-header',
    'modal-header-left',
    'modal-header-actions',
    'modal-export-btn',
    'modal-quote-item',
    'modal-quote-content',
    'modal-quote-text',
    'modal-quote-meta',
    'modal-quote-timestamp',
    'modal-quote-pdf',
    'modal-quote-page',
    'modal-quote-actions',
    'modal-close',
    'panel-button',
    'editQuoteBtn',
    'deleteQuoteBtn',
    'quotes-count',
    'deleteConfirmationModal' // Prevent modal close when clicking delete confirmation
  ];

  // Check if click target is part of the modal or its children
  const isModalElement = modalElements.some(className => {
    // Check class-based selectors
    if (target.hasClass(className) ||
        target.closest(`.${className}`).length > 0 ||
        target.is(`.${className}`)) {
      return true;
    }

    // Check ID-based selector only if targetId is valid
    if (targetId && targetId.trim() !== '' && !targetId.includes('#') && !targetId.includes(' ')) {
      try {
        return target.closest(`#${targetId}`).length > 0;
      } catch (e) {
        // Invalid selector, skip
        return false;
      }
    }

    return false;
  });

  // Also check coordinates as backup
  const clickX = event.clientX;
  const clickY = event.clientY;
  const modalOffset = modal.offset();
  const modalWidth = modal.outerWidth();
  const modalHeight = modal.outerHeight();
  const modalLeft = modalOffset.left;
  const modalTop = modalOffset.top;
  const modalRight = modalLeft + modalWidth;
  const modalBottom = modalTop + modalHeight;
  const isInsideModal = clickX >= modalLeft && clickX <= modalRight &&
                       clickY >= modalTop && clickY <= modalBottom;

  // Clear any existing timeout
  if (modalCloseTimeout) {
    clearTimeout(modalCloseTimeout);
  }

  // Only close modal if click is clearly outside both element hierarchy and boundaries
  if (!isModalElement && !isInsideModal) {
    modalCloseTimeout = setTimeout(() => {
      if (modal.hasClass("open") && !isDeleteConfirmationOpen) {
        modal.removeClass("open");
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
