/**
 * Annotations – the pdf.js link/widget layer drawn over a page.
 *
 * The overlay is a plain DOM layer above the page image (`.df-page-content` in the 2D renderer,
 * the CSS3D planes in the WebGL one), so it belongs beside the page rather than in the texture
 * library, which is about rendering pixels.
 */

import { SOURCE_TYPE, PAGE_SIZE } from '../constants.js';

/**
 * Draw the annotation layer of a page into its content overlay.
 * @param {object} lib TextureLibrary instance
 * @param {number|string} idx flipbook page number
 */
export function renderPageAnnotations(lib, idx) {
  const self = lib;
  const $ = jQuery;
  if (self.options.enableAnnotation == false) return;
  const target = self.targetObject;
  const pageIdx = parseInt(idx, 10);
  const layer = $(target.getContentLayer(pageIdx));
  layer.empty();

  if (pageIdx > 0 && pageIdx <= self.pageCount) {
    if (self.contentSourceType == SOURCE_TYPE.PDF) {
      let srcIdx = pageIdx;
      if (self.options.pageSize == PAGE_SIZE.DOUBLEINTERNAL && pageIdx > 2) {
        srcIdx = Math.ceil((pageIdx - 1) / 2) + 1;
      }
      self.contentSource.getPage(srcIdx).then((page) => {
        if (layer.length > 0) {
          const vp = page.getViewport({ scale: self.viewport.height / page.getViewport({ scale: 1 }).height });
          setupAnnotations(self, page, vp, layer, pageIdx);
        }
      });
    }
    // Custom links and HTML annotations could be added here
  }
}

/** Hand one page's annotations to pdf.js' annotation layer. */
function setupAnnotations(lib, page, viewport, layer, idx) {
  const self = lib;
  const $ = jQuery;
  return page.getAnnotations().then((annotations) => {
    const vp = viewport.clone({ dontFlip: true });
    const $layer = $(layer);
    let annDiv = $layer.find(".annotationDiv");
    if (annDiv.length == 0) {
      annDiv = $("<div class='annotationDiv'>");
      $layer.append(annDiv);
    }
    annDiv.empty();

    if (self.options.pageSize == PAGE_SIZE.DOUBLEINTERNAL && idx > 2 && idx % 2 == 1) {
      annDiv.css({ left: "-100%" });
    } else if (idx == 1) {
      annDiv.css({ left: "" });
    }

    pdfjsLib.AnnotationLayer.render({
      annotations,
      div: annDiv[0],
      page,
      viewport: vp,
      imageResourcesPath: self.options.imageResourcesPath,
      linkService: self.linkService,
    });

    if (self.options.annotationClass) {
      annDiv.find("> section").addClass(self.options.annotationClass);
    }
  });
}
