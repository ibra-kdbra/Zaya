import { getAllQuotes } from '/lib/js/features/quotes/db.js';

const t = (key, vars) => (window.ZayaI18n ? window.ZayaI18n.t(key, vars) : key);

/*
 * Notes are rendered as elements, never as markup: a note is text the reader typed, so it only
 * ever reaches the page through `textContent`.
 */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function iconButton(className, iconClass, title, quoteId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.dataset.id = String(Number(quoteId));
  const icon = element('i', iconClass);
  icon.setAttribute('aria-hidden', 'true');
  btn.appendChild(icon);
  return btn;
}

export function displayQuotes(quotes) {
  const quoteList = document.getElementById('quoteList');
  if (!quoteList) return;
  quoteList.replaceChildren(); // Clear the current list

  if (quotes.length === 0) {
    quoteList.appendChild(element('div', 'no-quotes', t('notes.emptyShort')));
    return;
  }

  quotes.forEach((quote) => {
    const timestamp = new Date(quote.timestamp).toLocaleDateString();

    const item = element('div', 'quote-item');
    const content = element('div', 'quote-content');
    content.appendChild(element('span', 'quote-text', quote.quote));

    const meta = element('div', 'quote-meta');
    meta.appendChild(element('span', 'quote-timestamp', timestamp));
    meta.appendChild(element('span', 'quote-pdf-info', quote.pdfName ? ` • ${quote.pdfName}` : ''));
    meta.appendChild(element('span', 'quote-page-info',
      quote.pageNumber ? ' • ' + t('notes.page', { n: Number(quote.pageNumber) }) : ''));
    content.appendChild(meta);

    const actions = element('div', 'quote-actions');
    actions.appendChild(iconButton('panel-button editQuoteBtn', 'fas fa-edit', t('notes.edit'), quote.id));
    actions.appendChild(iconButton('panel-button deleteQuoteBtn', 'fas fa-trash', t('notes.delete'), quote.id));

    item.append(content, actions);
    quoteList.appendChild(item);
  });
}

export function displayQuotesInModal(quotes) {
  const modalQuoteList = document.getElementById('modalQuoteList');
  if (!modalQuoteList) return;
  modalQuoteList.replaceChildren();

  // Apply current theme to modal elements
  const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
  const themeClass = `theme-${currentTheme}`;
  const themed = (base) => `${base} ${themeClass} theme-applied`;

  if (quotes.length === 0) {
    const empty = element('div', themed('no-quotes-modal'));
    const icon = element('i', 'fas fa-quote-left');
    icon.setAttribute('aria-hidden', 'true');
    empty.append(icon, element('h3', null, t('notes.modalEmptyTitle')),
      element('p', null, t('notes.modalEmptyText')));
    modalQuoteList.appendChild(empty);
    return;
  }

  // Add header with quote count and export button
  const header = element('div', themed('modal-quotes-header'));
  const headerLeft = element('div', 'modal-header-left');
  headerLeft.append(element('h3', null, t('notes.modalHeading')),
    element('span', 'quotes-count', t('notes.count', { n: quotes.length })));
  const headerActions = element('div', 'modal-header-actions');
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.id = 'modalExportQuotesBtn';
  exportBtn.className = themed('panel-button modal-export-btn');
  exportBtn.title = t('notes.exportAll');
  exportBtn.setAttribute('aria-label', t('notes.exportAll'));
  const exportIcon = element('i', 'fas fa-download');
  exportIcon.setAttribute('aria-hidden', 'true');
  exportBtn.appendChild(exportIcon);
  headerActions.appendChild(exportBtn);
  header.append(headerLeft, headerActions);
  modalQuoteList.appendChild(header);

  // Add quotes in table-like format
  quotes.forEach((quote) => {
    const timestamp = new Date(quote.timestamp).toLocaleDateString();
    const time = new Date(quote.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = element('div', themed('modal-quote-item'));
    const content = element('div', 'modal-quote-content');
    content.appendChild(element('div', 'modal-quote-text', `"${quote.quote}"`));

    const meta = element('div', 'modal-quote-meta');
    meta.appendChild(element('span', 'modal-quote-timestamp', `${timestamp} · ${time}`));
    meta.appendChild(element('span', 'modal-quote-pdf', quote.pdfName || t('notes.unknownDocument')));
    if (quote.pageNumber) meta.appendChild(element('span', 'modal-quote-page', t('notes.pageLong', { n: Number(quote.pageNumber) })));
    content.appendChild(meta);

    const actions = element('div', 'modal-quote-actions');
    actions.appendChild(iconButton(themed('panel-button editQuoteBtn'), 'fas fa-edit', t('notes.edit'), quote.id));
    actions.appendChild(iconButton(themed('panel-button deleteQuoteBtn'), 'fas fa-trash', t('notes.delete'), quote.id));

    item.append(content, actions);
    modalQuoteList.appendChild(item);
  });
}

export function exportQuotes() {
  getAllQuotes((quotes) => {
    if (quotes.length === 0) {
      Toastify({
        text: t('notes.noneToExport'),
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
      const pageInfo = q.pageNumber ? ` page ${q.pageNumber}` : '';
      return `"${q.quote}"\n- ${timestamp}${pdfInfo}${pageInfo}\n`;
    }).join('\n');

    downloadText(quotesText, 'quotes.txt');
  });
}

export function exportPdfQuotes(quotes, pdfName) {
  if (quotes.length === 0) {
    Toastify({
      text: t('notes.noneHereToExport'),
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
    const pageInfo = q.pageNumber ? ` — page ${q.pageNumber}` : '';
    return `"${q.quote}"\n- ${timestamp} at ${time}${pageInfo}\n`;
  }).join('\n');

  const filename = pdfName ? `quotes_${pdfName.replace(/[^a-z0-9]/gi, '_')}.txt` : 'pdf_quotes.txt';
  downloadText(quotesText, filename);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
