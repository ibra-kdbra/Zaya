/**
 * DFlip PDF Find Controller Class
 */

export const FindStates = {
  FIND_FOUND: 0,
  FIND_NOTFOUND: 1,
  FIND_WRAPPED: 2,
  FIND_PENDING: 3,
};

const CHARACTERS_TO_NORMALIZE = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
};

export class PDFFindController {
  constructor(options) {
    this.pdfViewer = options.pdfViewer || null;
    this.onUpdateResultsCount = null;
    this.onUpdateState = null;
    this.reset();
    const t = Object.keys(CHARACTERS_TO_NORMALIZE).join("");
    this.normalizationRegex = new RegExp("[" + t + "]", "g");
  }

  reset() {
    this.startedTextExtraction = false;
    this.extractTextPromises = [];
    this.pendingFindMatches = Object.create(null);
    this.active = false;
    this.pageContents = [];
    this.pageMatches = [];
    this.pageMatchesLength = null;
    this.matchCount = 0;
    this.selected = { pageIdx: -1, matchIdx: -1 };
    this.offset = { pageIdx: null, matchIdx: null };
    this.pagesToSearch = null;
    this.resumePageIdx = null;
    this.state = null;
    this.dirtyMatch = false;
    this.findTimeout = null;
    this.firstPagePromise = new Promise((resolve) => {
      this.resolveFirstPage = resolve;
    });
  }

  normalize(text) {
    return text.replace(this.normalizationRegex, (ch) => CHARACTERS_TO_NORMALIZE[ch]);
  }

  _prepareMatches(matches, pageMatches, pageMatchesLength) {
    function isOverlapping(list, idx) {
      let current, prev;
      current = list[idx];
      if (idx < list.length - 1 && current.match === list[idx + 1].match) {
        current.skipped = true;
        return true;
      }
      for (let i = idx - 1; i >= 0; i--) {
        prev = list[i];
        if (prev.skipped) continue;
        if (prev.match + prev.matchLength < current.match) break;
        if (prev.match + prev.matchLength >= current.match + current.matchLength) {
          current.skipped = true;
          return true;
        }
      }
      return false;
    }

    matches.sort((a, b) => (a.match === b.match ? a.matchLength - b.matchLength : a.match - b.match));

    for (let i = 0; i < matches.length; i++) {
      if (isOverlapping(matches, i)) continue;
      pageMatches.push(matches[i].match);
      pageMatchesLength.push(matches[i].matchLength);
    }
  }

  calcFindPhraseMatch(query, pageIdx, pageContent) {
    const matches = [];
    const queryLen = query.length;
    let matchIdx = -queryLen;
    while (true) {
      matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
      if (matchIdx === -1) break;
      matches.push(matchIdx);
    }
    this.pageMatches[pageIdx] = matches;
  }

  calcFindWordMatch(query, pageIdx, pageContent) {
    const matches = [];
    const words = query.match(/\S+/g);
    if (!words) return;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordLen = word.length;
      let matchIdx = -wordLen;
      while (true) {
        matchIdx = pageContent.indexOf(word, matchIdx + wordLen);
        if (matchIdx === -1) break;
        matches.push({ match: matchIdx, matchLength: wordLen, skipped: false });
      }
    }

    if (!this.pageMatchesLength) this.pageMatchesLength = [];
    this.pageMatchesLength[pageIdx] = [];
    this.pageMatches[pageIdx] = [];
    this._prepareMatches(matches, this.pageMatches[pageIdx], this.pageMatchesLength[pageIdx]);
  }

  calcFindMatch(pageIdx) {
    const pageContent = this.normalize(this.pageContents[pageIdx]);
    const query = this.normalize(this.state.query);
    const caseSensitive = this.state.caseSensitive;
    const phraseSearch = this.state.phraseSearch;

    if (query.length === 0) return;

    let processedContent = pageContent;
    let processedQuery = query;

    if (!caseSensitive) {
      processedContent = pageContent.toLowerCase();
      processedQuery = query.toLowerCase();
    }

    if (phraseSearch) {
      this.calcFindPhraseMatch(processedQuery, pageIdx, processedContent);
    } else {
      this.calcFindWordMatch(processedQuery, pageIdx, processedContent);
    }

    this.updatePage(pageIdx);
    if (this.resumePageIdx === pageIdx) {
      this.resumePageIdx = null;
      this.nextPageMatch();
    }
    if (this.pageMatches[pageIdx].length > 0) {
      this.matchCount += this.pageMatches[pageIdx].length;
      this.updateUIResultsCount();
    }
  }

  extractText() {
    if (this.startedTextExtraction) return;
    this.startedTextExtraction = true;
    this.pageContents = [];
    const resolves = [];
    const numPages = this.pdfViewer.contentProvider.pdfDocument.numPages;

    for (let i = 0; i < numPages; i++) {
      this.extractTextPromises.push(new Promise((resolve) => resolves.push(resolve)));
    }

    const extractPage = (pageIdx) => {
      this.pdfViewer.getPageTextContent(pageIdx).then((content) => {
        const text = content.items.map((item) => item.str).join("");
        this.pageContents.push(text);
        resolves[pageIdx](pageIdx);
        console.log("extracting Page" + pageIdx);
        if (pageIdx + 1 < numPages) {
          extractPage(pageIdx + 1);
        }
      });
    };
    extractPage(0);
  }

  executeCommand(cmd, state) {
    if (this.state === null || cmd !== "findagain") {
      this.dirtyMatch = true;
    }
    this.state = state;
    this.updateUIState(FindStates.FIND_PENDING);
    this.firstPagePromise.then(() => {
      this.extractText();
      clearTimeout(this.findTimeout);
      if (cmd === "find") {
        this.findTimeout = setTimeout(() => this.nextMatch(), 250);
      } else {
        this.nextMatch();
      }
    });
  }

  updatePage(pageIdx) {
    if (this.selected.pageIdx === pageIdx) {
      this.pdfViewer.currentPageNumber = pageIdx + 1;
    }
    const pageView = this.pdfViewer.getPageView(pageIdx);
    if (pageView && pageView.textLayer) {
      pageView.textLayer.updateMatches();
    }
  }

  nextMatch() {
    const findPrevious = this.state.findPrevious;
    const currentPageIdx = this.pdfViewer.currentPageNumber - 1;
    const numPages = this.pdfViewer.contentProvider.pageCount;
    this.active = true;

    if (this.dirtyMatch) {
      this.dirtyMatch = false;
      this.selected.pageIdx = this.selected.matchIdx = -1;
      this.offset.pageIdx = currentPageIdx;
      this.offset.matchIdx = null;
      this.hadMatch = false;
      this.resumePageIdx = null;
      this.pageMatches = [];
      this.matchCount = 0;
      this.pageMatchesLength = null;

      for (let i = 0; i < numPages; i++) {
        this.updatePage(i);
        if (!(i in this.pendingFindMatches)) {
          this.pendingFindMatches[i] = true;
          this.extractTextPromises[i].then((idx) => {
            delete this.pendingFindMatches[idx];
            this.calcFindMatch(idx);
          });
        }
      }
    }

    if (this.state.query === "") {
      this.updateUIState(FindStates.FIND_FOUND);
      return;
    }
    if (this.resumePageIdx) return;

    this.pagesToSearch = numPages;
    if (this.offset.matchIdx !== null) {
      const numMatches = this.pageMatches[this.offset.pageIdx].length;
      if ((!findPrevious && this.offset.matchIdx + 1 < numMatches) || (findPrevious && this.offset.matchIdx > 0)) {
        this.hadMatch = true;
        this.offset.matchIdx = findPrevious ? this.offset.matchIdx - 1 : this.offset.matchIdx + 1;
        this.updateMatch(true);
        return;
      }
      this.advanceOffsetPage(findPrevious);
    }
    this.nextPageMatch();
  }

  matchesReady(matches) {
    const findPrevious = this.state.findPrevious;
    if (matches && matches.length) {
      this.hadMatch = true;
      this.offset.matchIdx = findPrevious ? matches.length - 1 : 0;
      this.updateMatch(true);
      return true;
    }
    this.advanceOffsetPage(findPrevious);
    if (this.offset.wrapped) {
      this.offset.matchIdx = null;
      if (this.pagesToSearch < 0) {
        this.updateMatch(false);
        return true;
      }
    }
    return false;
  }

  updateMatchPosition(pageIdx, matchIdx, textDivs, divIdx) {
    if (this.selected.matchIdx === matchIdx && this.selected.pageIdx === pageIdx) {
      // Note: scrollIntoView is available from utils.js, but needs to be handled
      // correctly if it's the global one or the imported one.
      // For now, assuming global or handled by caller.
    }
  }

  nextPageMatch() {
    if (this.resumePageIdx !== null) console.error("There can only be one pending page.");
    do {
      const pageIdx = this.offset.pageIdx;
      const matches = this.pageMatches[pageIdx];
      if (!matches) {
        this.resumePageIdx = pageIdx;
        break;
      }
    } while (!this.matchesReady(this.pageMatches[this.offset.pageIdx]));
  }

  advanceOffsetPage(findPrevious) {
    const numPages = this.extractTextPromises.length;
    this.offset.pageIdx = findPrevious ? this.offset.pageIdx - 1 : this.offset.pageIdx + 1;
    this.offset.matchIdx = null;
    this.pagesToSearch--;
    if (this.offset.pageIdx >= numPages || this.offset.pageIdx < 0) {
      this.offset.pageIdx = findPrevious ? numPages - 1 : 0;
      this.offset.wrapped = true;
    }
  }

  updateMatch(found) {
    let state = FindStates.FIND_NOTFOUND;
    const wrapped = this.offset.wrapped;
    this.offset.wrapped = false;
    if (found) {
      const prevPageIdx = this.selected.pageIdx;
      this.selected.pageIdx = this.offset.pageIdx;
      this.selected.matchIdx = this.offset.matchIdx;
      state = wrapped ? FindStates.FIND_WRAPPED : FindStates.FIND_FOUND;
      if (prevPageIdx !== -1 && prevPageIdx !== this.selected.pageIdx) {
        this.updatePage(prevPageIdx);
      }
    }
    this.updateUIState(state, this.state.findPrevious);
    if (this.selected.pageIdx !== -1) {
      this.updatePage(this.selected.pageIdx);
    }
  }

  updateUIResultsCount() {
    if (this.onUpdateResultsCount) this.onUpdateResultsCount(this.matchCount);
  }

  updateUIState(state, findPrevious) {
    if (this.onUpdateState) this.onUpdateState(state, findPrevious, this.matchCount);
  }
}
