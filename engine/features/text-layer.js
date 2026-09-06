/**
 * DFlip Text Layer Builder Class
 */

export class TextLayerBuilder {
  constructor(options) {
    this.textLayerDiv = options.textLayerDiv;
    this.renderingDone = false;
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = options.viewport;
    this.textDivs = [];
    this.findController = options.findController || null;
    this.textLayerRenderTask = null;
    this.enhanceTextSelection = options.enhanceTextSelection;
    this._bindMouse();
  }

  _finishRendering() {
    this.renderingDone = true;
    if (!this.enhanceTextSelection) {
      const endOfContent = document.createElement("div");
      endOfContent.className = "endOfContent";
      this.textLayerDiv.appendChild(endOfContent);
    }
  }

  render(timeout) {
    if (!this.divContentDone || this.renderingDone) return;

    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }

    this.textDivs = [];
    const fragment = document.createDocumentFragment();
    this.textLayerRenderTask = pdfjsLib.renderTextLayer({
      textContent: this.textContent,
      container: fragment,
      viewport: this.viewport,
      textDivs: this.textDivs,
      timeout: timeout,
      enhanceTextSelection: this.enhanceTextSelection,
    });

    this.textLayerRenderTask.promise.then(
      () => {
        this.textLayerDiv.appendChild(fragment);
        this._finishRendering();
        this.updateMatches();
      },
      (err) => {}
    );
  }

  setTextContent(textContent) {
    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }
    this.textContent = textContent;
    this.divContentDone = true;
  }

  convertMatches(matches, matchesLength) {
    let divIdx = 0;
    let offset = 0;
    const items = this.textContent.items;
    const lastIdx = items.length - 1;
    const queryLen = this.findController === null ? 0 : this.findController.state.query.length;
    const result = [];

    if (!matches) return result;

    for (let i = 0; i < matches.length; i++) {
      let matchIdx = matches[i];
      while (divIdx !== lastIdx && matchIdx >= offset + items[divIdx].str.length) {
        offset += items[divIdx].str.length;
        divIdx++;
      }
      if (divIdx === items.length) {
        console.error("Could not find a matching mapping");
      }
      const match = { begin: { divIdx: divIdx, offset: matchIdx - offset } };
      if (matchesLength) {
        matchIdx += matchesLength[i];
      } else {
        matchIdx += queryLen;
      }
      while (divIdx !== lastIdx && matchIdx > offset + items[divIdx].str.length) {
        offset += items[divIdx].str.length;
        divIdx++;
      }
      match.end = { divIdx: divIdx, offset: matchIdx - offset };
      result.push(match);
    }
    return result;
  }

  renderMatches(matches) {
    if (matches.length === 0) return;

    const items = this.textContent.items;
    const textDivs = this.textDivs;
    let prevEnd = null;
    const pageIdx = this.pageIdx;
    const isSelectedPage = this.findController === null ? false : pageIdx === this.findController.selected.pageIdx;
    const selectedMatchIdx = this.findController === null ? -1 : this.findController.selected.matchIdx;
    const highlightAll = this.findController === null ? false : this.findController.state.highlightAll;

    const infinity = { divIdx: -1, offset: undefined };

    function resetText(match, className) {
      const idx = match.divIdx;
      textDivs[idx].textContent = "";
      appendText(idx, 0, match.offset, className);
    }

    function appendText(idx, from, to, className) {
      const div = textDivs[idx];
      const text = items[idx].str.substring(from, to);
      const node = document.createTextNode(text);
      if (className) {
        const span = document.createElement("span");
        span.className = className;
        span.appendChild(node);
        div.appendChild(span);
        return;
      }
      div.appendChild(node);
    }

    let startIdx = selectedMatchIdx, endIdx = startIdx + 1;
    if (highlightAll) {
      startIdx = 0;
      endIdx = matches.length;
    } else if (!isSelectedPage) {
      return;
    }

    for (let i = startIdx; i < endIdx; i++) {
      const match = matches[i];
      const begin = match.begin;
      const end = match.end;
      const isSelected = isSelectedPage && i === selectedMatchIdx;
      const highlightSuffix = isSelected ? " selected" : "";

      if (this.findController) {
        this.findController.updateMatchPosition(pageIdx, i, textDivs, begin.divIdx);
      }

      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        if (prevEnd !== null) {
          appendText(prevEnd.divIdx, prevEnd.offset, infinity.offset);
        }
        resetText(begin);
      } else {
        appendText(prevEnd.divIdx, prevEnd.offset, begin.offset);
      }

      if (begin.divIdx === end.divIdx) {
        appendText(begin.divIdx, begin.offset, end.offset, "highlight" + highlightSuffix);
      } else {
        appendText(begin.divIdx, begin.offset, infinity.offset, "highlight begin" + highlightSuffix);
        for (let j = begin.divIdx + 1; j < end.divIdx; j++) {
          textDivs[j].className = "highlight middle" + highlightSuffix;
        }
        resetText(end, "highlight end" + highlightSuffix);
      }
      prevEnd = end;
    }

    if (prevEnd) {
      appendText(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  updateMatches() {
    if (!this.renderingDone) return;

    const matches = this.matches;
    const textDivs = this.textDivs;
    const items = this.textContent.items;
    let lastDivIdx = -1;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIdx = Math.max(lastDivIdx, match.begin.divIdx);
      for (let j = startIdx; j <= match.end.divIdx; j++) {
        const div = textDivs[j];
        div.textContent = items[j].str;
        div.className = "";
      }
      lastDivIdx = match.end.divIdx + 1;
    }

    if (this.findController === null || !this.findController.active) return;

    let pageMatches, pageMatchesLength;
    if (this.findController !== null) {
      pageMatches = this.findController.pageMatches[this.pageIdx] || null;
      pageMatchesLength = this.findController.pageMatchesLength
        ? this.findController.pageMatchesLength[this.pageIdx] || null
        : null;
    }

    this.matches = this.convertMatches(pageMatches, pageMatchesLength);
    this.renderMatches(this.matches);
  }

  _bindMouse() {
    const div = this.textLayerDiv;
    const self = this;
    div.addEventListener("mousedown", (e) => {
      if (self.enhanceTextSelection && self.textLayerRenderTask) {
        self.textLayerRenderTask.expandTextDivs(true);
        return;
      }
      const endOfContent = div.querySelector(".endOfContent");
      if (!endOfContent) return;

      const isTargetDiv = e.target !== div;
      const isSelectable = isTargetDiv && window.getComputedStyle(endOfContent).getPropertyValue("-moz-user-select") !== "none";
      if (isSelectable) {
        const rect = div.getBoundingClientRect();
        const topRatio = Math.max(0, (e.pageY - rect.top) / rect.height);
        endOfContent.style.top = (topRatio * 100).toFixed(2) + "%";
      }
      endOfContent.classList.add("active");
    });

    div.addEventListener("mouseup", (e) => {
      if (self.enhanceTextSelection && self.textLayerRenderTask) {
        self.textLayerRenderTask.expandTextDivs(false);
        return;
      }
      const endOfContent = div.querySelector(".endOfContent");
      if (!endOfContent) return;
      endOfContent.style.top = "";
      endOfContent.classList.remove("active");
    });
  }
}
