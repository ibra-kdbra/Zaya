/**
 * DFlip Share Class
 */

export class Share {
  constructor(container, options) {
    const $ = jQuery;
    const n = this;
    const a = "<div>";
    const o = "df-share-button";
    const r = "width=500,height=400";
    n.isOpen = false;
    n.shareUrl = "";
    n.wrapper = $('<div class="df-share-wrapper" style="display: none;">').on(
      "click",
      () => {
        n.close();
      }
    );
    n.box = $('<div class="df-share-box">')
      .on("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      })
      .appendTo(n.wrapper);

    const titleContainer = $('<div class="df-share-header">').appendTo(n.box);
    titleContainer.append($('<span class="df-share-title">').html(options.text.share));
    
    n.closeBtn = $('<div class="df-share-close ti-close">').on("click", () => {
      n.close();
    }).appendTo(titleContainer);

    n.urlInput = $('<textarea class="df-share-url">').on("click", function () {
      $(this).select();
    });
    n.facebook = $(a, {
      class: o + " df-share-facebook " + options.icons["facebook"],
    }).on("click", () => {
      window.open(
        "https://www.facebook.com/sharer/sharer.php?u=" +
          encodeURIComponent(n.shareUrl),
        "Sharer",
        r
      );
    });
    n.twitter = $(a, {
      class: o + " df-share-twitter " + options.icons["twitter"],
    }).on("click", () => {
      window.open(
        "http://twitter.com/share?url=" + encodeURIComponent(n.shareUrl),
        "Sharer",
        r
      );
    });
    n.mail = $("<a>", {
      class: o + " df-share-mail " + options.icons["mail"],
      href:
        "mailto:?subject=" +
        options.text["mailSubject"] +
        "&body=" +
        options.text["mailBody"].replace("{{url}}", encodeURIComponent(n.shareUrl)),
      target: "_blank",
    }).on("click", function (e) {
      $(this).attr(
        "href",
        "mailto:?subject=" +
          options.text["mailSubject"] +
          "&body=" +
          options.text["mailBody"].replace("{{url}}", encodeURIComponent(n.shareUrl))
      );
      e.stopPropagation();
    });
    const buttonsContainer = $('<div class="df-share-buttons-container">').appendTo(n.box);
    buttonsContainer
      .append(n.facebook)
      .append(n.twitter)
      .append(n.mail);

    n.box.append(n.urlInput);
    $(container).append(n.wrapper);
  }

  show() {
    this.wrapper.css("display", "flex").hide().fadeIn(300);
    this.urlInput.val(this.shareUrl);
    this.urlInput.trigger("click");
    this.isOpen = true;
  }

  dispose() {
    const e = this;
    e.box.off();
    e.twitter.off();
    e.facebook.off();
    e.mail.off();
    e.urlInput.off();
    e.wrapper.off().remove();
  }

  close() {
    this.wrapper.fadeOut(300);
    this.isOpen = false;
  }

  update(url) {
    this.shareUrl = url;
  }
}
