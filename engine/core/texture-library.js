/**
 * DFlip Texture Library Class
 */

import { SOURCE_TYPE, PAGE_SIZE, VERSION } from '../constants.js';
import { httpsCorrection, log, nearestPowerOfTwo, getBasePage, isBookletMode, isRTLMode, limitAt, createObjectURL, getScript } from '../utils.js';
import { PDFLinkService } from '../features/pdf-link-service.js';
import { initThumbPanel, initOutlinePanel, createSearchContainer } from '../features/side-panels.js';
import { renderPageAnnotations } from '../features/annotations.js';
import { createSearchPanel } from '../../lib/js/features/search/search-panel.js';

export class TextureLibrary {
  constructor(source, callback, options, flipbook) {
    const self = this;
    options = options || {};
    self.contentRawSource = source || [options.textureLoadFallback];
    self.contentSource = self.contentRawSource;
    self.contentSourceType = null;
    self.minDimension = options.minTextureSize || 256;
    self.maxDimension = options.maxTextureSize || 2048;
    self.pdfRenderQuality = options.pdfRenderQuality || 0.9;
    self.flipbook = flipbook;
    self.waitPeriod = 50;
    self.maxLength = 297;
    self.enableDebug = false;
    self.zoomScale = 1;
    self.maxZoom = 2;
    self.options = options;
    self.outline = options.outline;
    self.links = options.links;
    self.html = options.html;
    self.isCrossOrigin = options.isCrossOrigin;
    self.normalViewport = { height: 297, width: 210, scale: 1 };
    self.viewport = { height: 297, width: 210, scale: 1 };
    self.imageViewport = { height: 297, width: 210, scale: 1 };
    self.bookSize = { height: 297, width: 210 };
    self.zoomViewport = { height: 297, width: 210 };
    self.thumbsize = 128;
    self.cacheIndex = 256;
    self.cache = [];
    self.pageRatio = options.pageRatio || self.viewport.width / self.viewport.height;
    self.textureLoadTimeOut = null;
    self.type = "TextureLibrary";

    const $ = jQuery;

    if (Array.isArray(self.contentSource)) {
      self.contentSourceType = SOURCE_TYPE.IMAGE;
      self.pageCount = self.contentSource.length;
      for (let i = 0; i < self.contentSource.length; i++) {
        self.contentSource[i] = httpsCorrection(self.contentSource[i].toString());
      }
      $("<img/>")
        .attr("src", self.contentSource[0])
        .on("load", function () {
          self.viewport.height = this.height;
          self.viewport.width = this.width;
          self.pageRatio = self.viewport.width / self.viewport.height;
          self.bookSize = {
            width: (self.pageRatio > 1 ? 1 : self.pageRatio) * self.maxLength,
            height: self.maxLength / (self.pageRatio < 1 ? 1 : self.pageRatio),
          };
          self.zoomViewport = {
            width: (self.pageRatio > 1 ? 1 : self.pageRatio) * self.maxDimension,
            height: self.maxDimension / (self.pageRatio < 1 ? 1 : self.pageRatio),
          };
          self.linkService = new PDFLinkService();
          $(this).off();
          if (self.options.pageSize == PAGE_SIZE.DOUBLEINTERNAL) {
            self.pageCount = self.contentSource.length * 2 - 2;
            if (self.options.webgl == true) self.requiresImageTextureScaling = true;
          }
          if (callback != null) {
            callback(self);
            callback = null;
          }
          log(this.height + ":" + this.width);
        });
    } else if (typeof self.contentSource == "string") {
      const loadBase64 = () => {
        if (self.contentSource.indexOf(".base64") > 1) {
          $.ajax({
            url: self.contentSource,
            xhrFields: {
              onprogress: (e) => {
                if (e.lengthComputable) {
                  const percent = (100 * e.loaded) / e.total;
                  self.updateInfo(self.options.text.loading + " PDF " + percent.toString().split(".")[0] + "% ...");
                }
              },
            },
            success: (data) => {
              self.options.docParameters = { data: atob(data), isEvalSupported: false };
              loadPdf();
            },
          });
        } else {
          loadPdf();
        }
      };

      const loadPdf = () => {
        if (!self) return;
        // console.log("[DFlip] Setting Worker Path:", options.pdfjsWorkerSrc);
        pdfjsLib.GlobalWorkerOptions.workerSrc = options.pdfjsWorkerSrc;
        self.contentSourceType = SOURCE_TYPE.PDF;
        const o = (self.loading = pdfjsLib.getDocument(
          self.options.docParameters
            ? self.options.docParameters
            : {
                url: httpsCorrection(source),
                rangeChunkSize: isNaN(self.options.rangeChunkSize) ? 524288 : self.options.rangeChunkSize,
                cMapUrl: options.cMapUrl,
                cMapPacked: true,
                imageResourcesPath: options.imageResourcesPath,
                disableAutoFetch: true,
                disableStream: true,
                disableFontFace: self.options.disableFontFace,
                // Security: never let PDF-embedded font programs run through eval()
                // (mitigates CVE-2024-4367 on pdf.js < 4.2.67).
                isEvalSupported: false,
              }
        ));
        o.promise.then(
          (pdf) => {
            self.pdfDocument = pdf;
            pdf.getPage(1).then((page) => {
              self.normalViewport = page.getViewport({ scale: 1 });
              self.viewport = page.getViewport({ scale: 1 });
              self.viewport.height = self.viewport.height / 10;
              self.viewport.width = self.viewport.width / 10;
              self.pageRatio = self.viewport.width / self.viewport.height;
              self.bookSize = {
                width: (self.pageRatio > 1 ? 1 : self.pageRatio) * self.maxLength,
                height: self.maxLength / (self.pageRatio < 1 ? 1 : self.pageRatio),
              };
              self.zoomViewport = {
                width: (self.pageRatio > 1 ? 1 : self.pageRatio) * self.maxDimension,
                height: self.maxDimension / (self.pageRatio < 1 ? 1 : self.pageRatio),
              };
              self.refPage = page;
              if (pdf.numPages > 1) {
                pdf.getPage(2).then((page2) => {
                  if (self.options.pageSize == PAGE_SIZE.AUTO) {
                    const vp = page2.getViewport({ scale: 1 });
                    const ratio = vp.width / vp.height;
                    if (ratio > self.pageRatio * 1.5) {
                      self.options.pageSize = PAGE_SIZE.DOUBLEINTERNAL;
                      self.pageCount = pdf.numPages * 2 - 2;
                    } else {
                      self.options.pageSize = PAGE_SIZE.SINGLE;
                    }
                  }
                  if (callback != null) {
                    callback(self);
                    callback = null;
                  }
                });
              } else {
                if (callback != null) {
                  callback(self);
                  callback = null;
                }
              }
            });
            self.linkService = new PDFLinkService();
            self.linkService.setDocument(pdf, null);
            self.pageCount = pdf.numPages;
            self.contentSource = pdf;
          },
          (err) => {
            if (self) {
              const a = document.createElement("a");
              a.href = self.contentSource;
              const crossOrigin = a.hostname && a.hostname !== window.location.hostname;
              self.updateInfo(crossOrigin
                ? "This document could not be opened. The site hosting it does not allow other pages to load it."
                : "This document could not be opened. Check the link or try another file.");
              if (window.ZayaDocumentError) window.ZayaDocumentError(crossOrigin ? "cors" : "unreachable", self.contentSource);
            }
          }
        );
        o.onProgress = (progress) => {
          if (self) {
            const percent = (100 * progress.loaded) / progress.total;
            if (isNaN(percent)) {
              if (progress && progress.loaded) {
                self.updateInfo(self.options.text.loading + " PDF " + (Math.ceil(progress.loaded / 1e4) / 100).toString() + "MB ...");
              } else {
                self.updateInfo(self.options.text.loading + " PDF ...");
              }
            } else {
              self.updateInfo(self.options.text.loading + " PDF " + percent.toString().split(".")[0] + "% ...");
            }
          }
        };
      };

      const loadWorker = () => {
        if (!self) return;
        if (options.pdfjsWorkerSrc.indexOf("?ver") < 0) options.pdfjsWorkerSrc += "?ver=" + VERSION;
        self.updateInfo(self.options.text.loading + " PDF Worker ...");
        const a = document.createElement("a");
        a.href = options.pdfjsWorkerSrc;
        if (a.hostname !== window.location.hostname && a.hostname !== "") {
          self.updateInfo(self.options.text.loading + " PDF Worker CORS ...");
          $.ajax({
            url: options.pdfjsWorkerSrc,
            cache: true,
            success: (data) => {
              options.pdfjsWorkerSrc = createObjectURL(data, "text/javascript");
              loadBase64();
            },
          });
        } else {
          loadBase64();
        }
      };

      if (window.pdfjsLib == null) {
        self.updateInfo(self.options.text.loading + " PDF Service ...");
        getScript(options.pdfjsSrc + "?ver=" + VERSION, () => {
          loadWorker();
        }, () => {
          self.updateInfo("Unable to load PDF service..");
        });
      } else {
        loadWorker();
      }
    } else {
      console.error("Unknown source type. Please check documentation for help");
    }

    this.dispose = () => {
      if (self.loading && self.loading.destroy) {
        self.loading.destroy();
      }
      self.loading = null;
      if (self.searchPanel) {
        self.searchPanel.dispose();
        self.searchPanel = null;
      }
      self.searchController = null;
      if (self.textureLoadTimeOut) {
        clearTimeout(self.textureLoadTimeOut);
        self.textureLoadTimeOut = null;
      }
      if (this.targetObject) {
        if (this.targetObject.thumbContainer) this.targetObject.thumbContainer.remove();
        if (this.targetObject.outlineContainer) this.targetObject.outlineContainer.remove();
        if (this.targetObject.searchContainer) this.targetObject.searchContainer.remove();
        if (this.targetObject.dispose) this.targetObject.dispose();
        this.targetObject.processPage = null;
        this.targetObject.requestPage = null;
        if (this.targetObject.container) this.targetObject.container.off();
      }
      if (this.pdfDocument) this.pdfDocument.destroy();
      if (this.linkService) this.linkService.dispose();
      if (this.outlineViewer) this.outlineViewer.dispose();
      if (this.thumblist) this.thumblist.dispose();
      this.activeThumb = null;
      this.targetObject = null;
      this.pdfDocument = null;
      this.linkService = null;
      this.outlineViewer = null;
      this.thumblist = null;
    };
  }

  updateInfo(msg) {
    if (this.flipbook && this.flipbook.updateInfo) {
      this.flipbook.updateInfo(msg);
    }
  }

  /** Thumbnail drawer (see features/side-panels.js). */
  initThumbs() {
    initThumbPanel(this);
  }

  /** Outline drawer (see features/side-panels.js). */
  initOutline() {
    initOutlinePanel(this);
  }

  /**
   * Full-text search side panel (issue #16). The engine owns the drawer element -- it needs the
   * stage to suppress orbiting and scrolling -- and the panel itself lives in
   * features/search/search-panel.js.
   */
  initSearch() {
    const self = this;
    if (!self.targetObject || !self.targetObject.container) return;
    if (self.contentSourceType !== SOURCE_TYPE.PDF || !self.pdfDocument) return;
    if (self.targetObject.searchContainer) return;

    const container = createSearchContainer(self);

    self.searchPanel = createSearchPanel({
      container,
      pdfDocument: self.pdfDocument,
      docKey: window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : "",
      pageCount: self.pageCount,
      activePage: () => (self.targetObject && self.targetObject._activePage) || 1,
      // PDF page -> flipbook page (mirrors PDFLinkService.navigateTo)
      toBookPage: (pdfPage) => {
        let p = pdfPage;
        if (self.options.pageSize === PAGE_SIZE.DOUBLEINTERNAL && p > 2) p = p * 2 - 1;
        return Math.max(1, Math.min(p, self.pageCount || p));
      },
      onHighlight: (query) => self.setSearchHighlight(query),
      onRefreshHighlights: (force) => {
        if (!force && !self.highlightQuery) return;
        self.highlightToken = String(Date.now() % 1e9);
        self.refreshVisiblePages();
      },
      onGotoPage: (page) => self.targetObject.gotoPage(page),
    });
    self.searchController = self.searchPanel.controller;
    self.targetObject.searchInput = self.searchPanel.input;
  }

  /**
   * Paint search-hit boxes onto a freshly rendered page canvas. Returns true when something was drawn.
   * Marks live in the texture itself, so they show identically in the 3D and 2D renderers.
   */
  drawSearchHighlights(ctx, viewport, pdfPageNumber) {
    const self = this;
    if (!self.highlightQuery || !self.searchController) return false;
    const rects = self.searchController.getHighlightRects(pdfPageNumber, self.highlightQuery);
    if (!rects.length) return false;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(255, 196, 0, 0.55)";
    for (const [x, y, w, h] of rects) {
      const r = viewport.convertToViewportRectangle([x, y, x + w, y + h]);
      const left = Math.min(r[0], r[2]), top = Math.min(r[1], r[3]);
      const width = Math.abs(r[2] - r[0]), height = Math.abs(r[3] - r[1]);
      ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
    }
    ctx.restore();
    return true;
  }

  /**
   * Set (or clear with an empty string) the query whose hits are painted on the pages,
   * then re-render whatever is currently visible.
   */
  setSearchHighlight(query) {
    const self = this;
    const q = (query || "").trim();
    const next = q.length >= 2 ? q : "";
    if (next === (self.highlightQuery || "")) return;
    self.highlightQuery = next;
    self.highlightToken = next ? String(Date.now() % 1e9) : "";
    self.refreshVisiblePages();
  }

  refreshVisiblePages() {
    const self = this;
    const target = self.targetObject;
    if (!target) return;
    if (target.refresh) target.refresh();
    if (target.stage) target.stage.renderRequestPending = true;
    self.review("highlight");
  }

  checkViewportSize(width, height, scale) {
    const self = this;
    const target = self.targetObject;
    const cacheIdx = self.cacheIndex;

    if (self.contentSourceType == SOURCE_TYPE.PDF) {
      self.cacheIndex = Math.floor(Math.max(width * scale, height * scale));
      self.cacheIndex = limitAt(self.cacheIndex * (window.devicePixelRatio || 1), self.minDimension, self.maxDimension);

      if (self.cache[self.cacheIndex] == null) self.cache[self.cacheIndex] = [];
      if (cacheIdx !== self.cacheIndex) {
        target.refresh();
      }
      self.imageViewport = self.refPage.getViewport({ scale: (height * scale) / self.normalViewport.height });
      self.viewport = target.mode == "css" ? self.imageViewport : self.refPage.getViewport({ scale: self.bookSize.height / self.normalViewport.height });
      self.annotedPage = undefined;
      self.review();
    } else {
      if (self.cache[self.cacheIndex] == null) self.cache[self.cacheIndex] = [];
    }
  }

  getCache(idx, isThumb) {
    const cacheIdx = isThumb ? this.thumbsize : this.cacheIndex;
    return this.cache[cacheIdx] ? this.cache[cacheIdx][idx] : null;
  }

  setCache(idx, data, isThumb, forcedIdx) {
    const cacheIdx = isThumb ? this.thumbsize : (forcedIdx || this.cacheIndex);
    if (!this.cache[cacheIdx]) this.cache[cacheIdx] = [];
    this.cache[cacheIdx][idx] = data;
  }

  setTarget(target) {
    const self = this;
    if (target == null) return this.targetObject;
    this.targetObject = target;
    target.contentProvider = this;
    target.container.removeClass("df-loading df-init");
    if (self.linkService != null) {
      self.linkService.setViewer(target);
      self.initOutline();
      self.initSearch();
    }
    target.processPage = (idx, callback) => {
      if (idx > 0 && idx <= self.pageCount) {
        self.getPage(idx, callback);
      } else {
        self.setPage(idx, self.options.textureLoadFallback, callback);
      }
    };
    target.requestPage = () => {
      self.review("Request");
    };
    if (target.resize != null) target.resize();
  }

  review(reason) {
    const self = this;
    clearTimeout(self.textureLoadTimeOut);
    self.textureLoadTimeOut = setTimeout(() => {
      self.textureLoadTimeOut = setTimeout(() => self.reviewPages(self, reason), self.waitPeriod / 2);
    }, self.waitPeriod);
  }

  reviewPages(self, reason) {
    const target = self.targetObject;
    if (!target) return;
    const isBooklet = isBookletMode(target);
    let isFlipping = false;

    for (let i = 0; i < target.children.length; i++) {
      if (target.children[i].isFlipping) {
        isFlipping = true;
        break;
      }
    }

    if (!isFlipping) {
      const numVisible = Math.min(target.children.length, 3);
      const activeIdx = isBooklet ? target._activePage : getBasePage(target._activePage);
      self.baseNumber = activeIdx;
      const range = self.zoomScale > 1 ? 1 : numVisible;

      for (let i = 0; i < range; i++) {
        const offset = Math.floor(i / 2);
        const delta = i % 2 == 0 ? -offset * (isBooklet ? 1 : 2) : (offset == 0 ? 1 : offset) * (isBooklet ? 1 : 2);
        const p1 = activeIdx + delta, p2 = activeIdx + delta + 1;
        const page1 = target.getPageByNumber(p1), page2 = target.getPageByNumber(p2);
        const token = self.highlightToken ? "|" + self.highlightToken : "";
        const stamp1 = p1 + "|" + self.cacheIndex + token, stamp2 = p2 + "|" + self.cacheIndex + token;
        let loaded = 0;

        if (page1 && page1.frontPageStamp != stamp1 && page1.visible) {
          page1.frontTextureLoaded = false;
          target.processPage(p1, () => self.review("Batch Call"));
          page1.frontPageStamp = stamp1;
          loaded++;
        }
        if (page2 && page2.backPageStamp != stamp2 && page2.visible && !isBooklet) {
          page2.backTextureLoaded = false;
          target.processPage(p2, () => self.review("Batch Call"));
          page2.backPageStamp = stamp2;
          loaded++;
        }

        if (delta == 0 && self.annotedPage !== activeIdx) {
          self.getAnnotations(p1);
          if (!isBooklet) self.getAnnotations(p2);
          self.annotedPage = activeIdx;
        }
        if (loaded > 0) break;
      }
    } else {
      self.review("Revisit request");
    }
  }

  getPage(idx, callback, isThumb) {
    const self = this;
    const pageIdx = parseInt(idx, 10);
    let sourceIdx = pageIdx;
    const source = self.contentSource;

    if (pageIdx <= 0 && pageIdx >= self.pageCount) {
      self.setPage(pageIdx, self.options.textureLoadFallback, callback, isThumb);
    } else {
      // Full-size pages are rendered fresh while a search highlight is active (never cached with marks)
      const cached = (!isThumb && self.highlightQuery) ? null : self.getCache(pageIdx, isThumb);
      if (cached) {
        self.setPage(pageIdx, cached, callback, isThumb);
      } else {
        if (!isThumb) self.setLoading(pageIdx, true);
        if (self.options.pageSize == PAGE_SIZE.DOUBLEINTERNAL && pageIdx > 2) {
          sourceIdx = Math.ceil((pageIdx - 1) / 2) + 1;
        }

        if (self.contentSourceType == SOURCE_TYPE.PDF) {
          source.getPage(sourceIdx).then((page) => {
            renderPdfPage(page, pageIdx, callback, isThumb);
          });
        } else {
          const imgSrc = source[sourceIdx - 1];
          const img = new Image();
          if (self.isCrossOrigin) img.crossOrigin = "Anonymous";
          img.onload = () => {
            self.setCache(pageIdx, imgSrc, isThumb, self.cacheIndex);
            self.setPage(pageIdx, imgSrc, callback, isThumb);
            if (callback) callback();
          };
          img.src = imgSrc;
        }
      }
    }

    function renderPdfPage(page, idx, callback, isThumb) {
      const forceFit = self.options.forceFit;
      const isInternalDouble = self.options.pageSize == PAGE_SIZE.DOUBLEINTERNAL && idx > 1 && idx < self.pageCount;
      const ratio = (isInternalDouble && forceFit) ? 2 : 1;
      const baseViewport = forceFit ? page.getViewport({ scale: 1 }) : self.normalViewport;
      let scale = self.cacheIndex / Math.max(baseViewport.width / ratio, baseViewport.height);

      if (self.webgl) {
        scale = nearestPowerOfTwo(self.cacheIndex) / (self.pageRatio > 1 ? baseViewport.width / ratio : baseViewport.height);
      }

      if (isThumb) {
        scale = self.thumbsize / self.normalViewport.height;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.height = Math.round(baseViewport.height * scale);
      canvas.width = Math.round((baseViewport.width / ratio) * scale);

      if (self.targetObject.mode == "css" && Math.abs(self.targetObject.zoomHeight - canvas.height) < 2) {
        canvas.height = self.targetObject.zoomHeight;
        canvas.width = self.targetObject.zoomWidth;
      }

      const viewport = page.getViewport({ scale });
      if (isInternalDouble) {
        if (isRTLMode(self.targetObject)) {
          if (idx % 2 == 0) viewport.transform[4] = -canvas.width;
        } else {
          if (idx % 2 == 1) viewport.transform[4] = -canvas.width;
        }
      }

      page.cleanupAfterRender = true;
      page.render({ canvasContext: ctx, viewport }).promise.then(() => {
        const highlighted = !isThumb && self.drawSearchHighlights(ctx, viewport, page.pageNumber);
        if (isThumb || (self.options.canvasToBlob && !self.webgl && !highlighted)) {
          canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            self.setCache(idx, url, isThumb, self.cacheIndex);
            self.setPage(idx, url, callback, isThumb);
          }, "image/jpeg", self.pdfRenderQuality);
        } else {
          self.setPage(idx, canvas, callback, isThumb);
        }
      });
    }
  }

  setLoading(idx, loading) {
    const $ = jQuery;
    if (!this.targetObject) return;
    if (this.webgl) {
      const container = this.targetObject.container;
      if (loading) {
        if (!container.isLoading) {
          container.addClass("df-loading");
          container.isLoading = true;
        }
      } else {
        if (container.isLoading) {
          container.removeClass("df-loading");
          container.isLoading = null;
        }
      }
    } else {
      const layer = $(this.targetObject.getContentLayer(idx));
      if (layer) {
        if (loading) layer.addClass("df-page-loading");
        else layer.removeClass("df-page-loading");
      }
    }
  }

  /** Draw a page's link/widget layer (see features/annotations.js). */
  getAnnotations(idx) {
    renderPageAnnotations(this, idx);
  }

  setPage(idx, data, callback, isThumb) {
    const self = this;
    const target = self.targetObject;
    const isRTL = isRTLMode(target);
    const isBooklet = isBookletMode(target);

    if (isThumb) {
      // The thumb container is re-parented into the Navigator drawer, so it is not under target.container.
      const thumb = (target.thumbContainer || target.container).find("#df-thumb" + idx);
      thumb.css({ backgroundImage: `url(${data})` });
    } else {
      const page = target.getPageByNumber(idx);
      if (page) {
        const isBack = (idx % 2 != 0 && !isRTL) || (idx % 2 != 1 && isRTL && !isBooklet) || (isBooklet && !isRTL);
        if (isBack) {
          page.backImage(data, (img, tex) => {
            page.backTextureLoaded = true;
            self.setLoading(idx, false);
            if (self.requiresImageTextureScaling && tex && idx != 1 && idx != self.pageCount) {
              tex.repeat.x = 0.5;
              tex.offset.x = 0.5;
            }
            if (callback) callback();
          });
        } else {
          page.frontImage(data, (img, tex) => {
            page.frontTextureLoaded = true;
            self.setLoading(idx, false);
            if (self.requiresImageTextureScaling && tex && idx != 1 && idx != self.pageCount) {
              tex.repeat.x = 0.5;
            }
            if (callback) callback();
          });
        }
      }
    }
  }
}
