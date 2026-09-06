/**
 * DFlip Lightbox Class
 */

export class DFLightBox {
  constructor(closeCallback) {
    const $ = jQuery;
    const n = this;
    n.duration = 300;
    n.lightboxWrapper = $("<div>").addClass("df-lightbox-wrapper");
    n.container = $("<div>")
      .addClass("df-container")
      .appendTo(n.lightboxWrapper);
    n.controls = $("<div>")
      .addClass("df-lightbox-controls")
      .appendTo(n.lightboxWrapper);
    n.closeButton = $("<div>")
      .addClass("df-lightbox-close df-ui-btn")
      .on("click", () => {
        n.close(closeCallback);
      })
      .appendTo(n.controls);
    n.lightboxWrapper.append(n.container);
  }

  show(onShow) {
    const $ = jQuery;
    if (this.lightboxWrapper.parent().length == 0)
      $("body").append(this.lightboxWrapper);
    $("html,body").addClass("df-lightbox-open");
    this.lightboxWrapper.fadeIn(this.duration, onShow);
    return this;
  }

  close(onClose) {
    const $ = jQuery;
    this.lightboxWrapper.fadeOut(this.duration);
    setTimeout(onClose, this.duration);
    $("html,body").removeClass("df-lightbox-open");
    return this;
  }
}
