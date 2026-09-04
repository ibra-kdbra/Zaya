import { getAllQuotes } from '/lib/js/features/quotes/db.js';

export function displayQuotes(quotes) {
  const quoteList = $("#quoteList");
  quoteList.empty(); // Clear the current list

  if (quotes.length === 0) {
    quoteList.append('<div class="no-quotes">No quotes saved yet. Add your first quote!</div>');
    return;
  }

  const esc = window.ValidationUtils.escapeHtml;
  quotes.forEach(quote => {
    const timestamp = new Date(quote.timestamp).toLocaleDateString();
    const pdfInfo = quote.pdfName ? ` • ${esc(quote.pdfName)}` : '';

    quoteList.append(`
      <div class="quote-item">
        <div class="quote-content">
          <span class="quote-text">${esc(quote.quote)}</span>
          <div class="quote-meta">
            <span class="quote-timestamp">${timestamp}</span>
            <span class="quote-pdf-info">${pdfInfo}</span>
          </div>
        </div>
        <div class="quote-actions">
          <button class="panel-button editQuoteBtn" data-id="${Number(quote.id)}" title="Edit Quote">
            <i class="fas fa-edit"></i>
          </button>
          <button class="panel-button deleteQuoteBtn" data-id="${Number(quote.id)}" title="Delete Quote">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `);
  });
}

export function displayQuotesInModal(quotes) {
  const modalQuoteList = $("#modalQuoteList");
  modalQuoteList.empty();

  // Apply current theme to modal elements
  const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
  const themeClass = `theme-${currentTheme}`;

  if (quotes.length === 0) {
    modalQuoteList.append(`
      <div class="no-quotes-modal ${themeClass} theme-applied">
        <i class="fas fa-quote-left"></i>
        <h3>No quotes for this PDF yet</h3>
        <p>Add quotes while reading this PDF to see them here.</p>
      </div>
    `);
    return;
  }

  // Add header with quote count and export button
  modalQuoteList.append(`
    <div class="modal-quotes-header ${themeClass} theme-applied">
      <div class="modal-header-left">
        <h3>📝 Quotes from Current PDF</h3>
        <span class="quotes-count">${quotes.length} quote${quotes.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="modal-header-actions">
        <button id="modalExportQuotesBtn" class="panel-button modal-export-btn ${themeClass} theme-applied" title="Export PDF Quotes">
          <i class="fas fa-download"></i>
        </button>
      </div>
    </div>
  `);

  // Add quotes in table-like format
  const esc = window.ValidationUtils.escapeHtml;
  quotes.forEach(quote => {
    const timestamp = new Date(quote.timestamp).toLocaleDateString();
    const time = new Date(quote.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    modalQuoteList.append(`
      <div class="modal-quote-item ${themeClass} theme-applied">
        <div class="modal-quote-content">
          <div class="modal-quote-text">"${esc(quote.quote)}"</div>
          <div class="modal-quote-meta">
            <span class="modal-quote-timestamp">📅 ${timestamp} at ${time}</span>
            <span class="modal-quote-pdf">📄 ${esc(quote.pdfName || 'Unknown PDF')}</span>
            ${quote.pageNumber ? `<span class="modal-quote-page">📍 Page ${Number(quote.pageNumber)}</span>` : ''}
          </div>
        </div>
        <div class="modal-quote-actions">
          <button class="panel-button editQuoteBtn ${themeClass} theme-applied" data-id="${Number(quote.id)}" title="Edit Quote">
            <i class="fas fa-edit"></i>
          </button>
          <button class="panel-button deleteQuoteBtn ${themeClass} theme-applied" data-id="${Number(quote.id)}" title="Delete Quote">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `);
  });

  // Ensure all newly created buttons have proper event handling
  setTimeout(() => {
    $(`.editQuoteBtn, .deleteQuoteBtn, #modalExportQuotesBtn`).each(function() {
      if (!$(this).hasClass('event-attached')) {
        $(this).addClass('event-attached');
        // console.log('Button event handling verified for:', this);
      }
    });
  }, 100);
}

export function exportQuotes() {
  getAllQuotes((quotes) => {
    if (quotes.length === 0) {
      Toastify({
        text: "No quotes available to export. Add some quotes first!",
        duration: 4000,
        gravity: "bottom",
        position: "right",
        backgroundColor: "#f59e0b"
      }).showToast();
      return;
    }

    const quotesText = quotes.map(q => {
      const timestamp = new Date(q.timestamp).toLocaleDateString();
      const pdfInfo = q.pdfName ? ` [${q.pdfName}]` : '';
      return `"${q.quote}"\n- ${timestamp}${pdfInfo}\n`;
    }).join('\n');

    const blob = new Blob([quotesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'quotes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

export function exportPdfQuotes(quotes, pdfName) {
  if (quotes.length === 0) {
    Toastify({
      text: "No quotes available for this PDF. Add some quotes first!",
      duration: 4000,
      gravity: "bottom",
      position: "right",
      backgroundColor: "#f59e0b"
    }).showToast();
    return;
  }

  const quotesText = quotes.map(q => {
    const timestamp = new Date(q.timestamp).toLocaleDateString();
    const time = new Date(q.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    return `"${q.quote}"\n- ${timestamp} at ${time}\n`;
  }).join('\n');

  const filename = pdfName ? `quotes_${pdfName.replace(/[^a-z0-9]/gi, '_')}.txt` : 'pdf_quotes.txt';

  const blob = new Blob([quotesText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// export function toggleQuotePanel() {
//   // This function is now handled by the unified panel system
//   console.log("Quotes panel toggle - now handled by unified panel");
// }

// export function closeQuotePanelOnClickOutside() {
//   // This function is now handled by the unified panel system
//   console.log("Quote panel click outside - now handled by unified panel");
// }
