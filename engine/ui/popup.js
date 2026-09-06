/**
 * DFlip Popup Class
 */

export class Popup {
  constructor(container) {
    const $ = jQuery;
    const n = this;
    n.isOpen = false;
    n.wrapper = $('<div class="df-popup-wrapper" style="display: none;">').on(
      "click",
      () => {
        n.close();
      }
    );
    n.box = $('<div class="df-popup-box">')
      .on("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      })
      .appendTo(n.wrapper);
    $(container).append(n.wrapper);
  }

  show() {
    this.wrapper.fadeIn(300);
    this.isOpen = true;
  }

  dispose() {
    const e = this;
    e.box.off();
    e.wrapper.off().remove();
  }

  close() {
    this.wrapper.fadeOut(300);
    this.isOpen = false;
  }
}
