/**
 * DFlip Entry Point
 */

import * as CONSTANTS from './constants.js';
import * as UTILS from './utils.js';
import { FlipBook } from './factory.js';
import { DFLightBox } from './ui/lightbox.js';
import { Share } from './ui/share.js';
import { Popup } from './ui/popup.js';

// Setup Global DFLIP object for backward compatibility
const DFLIP = window.DFLIP || {};

Object.assign(DFLIP, CONSTANTS);
DFLIP.utils = UTILS;
DFLIP.FlipBook = FlipBook;
DFLIP.DFLightBox = DFLightBox;
DFLIP.Share = Share;
DFLIP.Popup = Popup;

// Adapter for original DFLIP.defaults.extendOptions usage
DFLIP.defaults = CONSTANTS.DEFAULTS;
DFLIP.defaults.extendOptions = (target, options) => jQuery.extend(true, {}, target, options);

// Initialization Logic from original flipbook.js
DFLIP.getOptions = function (t) {
  const $ = jQuery;
  t = $(t);
  const i = t.attr("id");
  let a = "option_" + i;
  const o = t.attr("source") || t.attr("df-source");
  a = a == null || a == "" || window[a] == null ? {} : window[a];
  a.source = o == null || o == "" ? a.source : o;
  const r = {
    webgl: t.attr("webgl"),
    height: t.attr("height"),
    soundEnable: t.attr("sound"),
    bookTitle: t.data("title"),
    transparent: t.attr("transparent"),
    enableDownload: t.attr("download"),
    search: t.attr("search"),
    duration: t.attr("duration"),
    hard: t.attr("hard"),
    openPage: t.data("page"),
    pageMode: t.attr("pagemode"),
    direction: t.attr("direction"),
    backgroundColor: t.attr("backgroundcolor"),
    scrollWheel: t.attr("scrollwheel"),
    backgroundImage: t.attr("backgroundimage"),
    paddingTop: t.attr("paddingtop"),
    paddingRight: t.attr("paddingright"),
    paddingBottom: t.attr("paddingbottom"),
    paddingLeft: t.attr("paddingleft"),
    wpOptions: t.attr("wpoptions"),
  };
  a = $.extend(true, {}, a, r);
  
  // Basic parsing of string booleans/ints
  if (a.webgl != null) a.webgl = (a.webgl == "true" || a.webgl == true);
  if (a.soundEnable != null) a.soundEnable = (a.soundEnable == "true" || a.soundEnable == true);
  // ... more parsing if needed
  
  return a;
};

DFLIP.parseBooks = function () {
  const $ = jQuery;
  $("._df_button, ._df_thumb, ._df_custom, ._df_book").each(function () {
    const t = $(this);
    const i = t.attr("parsed") || t.attr("df-parsed");
    if (i !== "true") {
      t.attr("df-parsed", "true");
      if (t.hasClass("_df_book")) {
        const n = t.attr("id"),
          a = t.attr("slug");
        const o = DFLIP.getOptions(t);
        o.id = n;
        if (a != null) o.slug = a;
        if (n) {
          window[n.toString()] = $(t).flipBook(o.source, o);
        } else {
          $(t).flipBook(o.source, o);
        }
      } else if (t.hasClass("_df_thumb")) {
        const r = $("<div class='_df_book-cover'>");
        const s = t.html().trim();
        t.html("");
        $("<span class='_df_book-title'>").html(s).appendTo(r);
        const c = t.attr("thumb") || t.attr("df-thumb"),
          u = t.attr("thumbtype") || DFLIP.defaults.thumbElement || "div",
          d = t.attr("tags") || t.attr("df-tags");
        if (d) {
          const tags = d.split(",");
          for (let f = 0; f < tags.length; f++) {
            t.append("<span class='_df_book-tag'>" + tags[f] + "</span>");
          }
        }
        if (c != null && c.toString().trim() != "") {
          if (u == "img") {
            r.append('<img src="' + c + '" alt="' + s + '"/>');
            t.attr("thumb-type", "img");
          } else {
            r.css({ backgroundImage: "url('" + c + "')" });
          }
        } else {
          r.addClass("_df_thumb-not-found");
        }
        t.append(r);
      }
    }
  });
};

// jQuery Plugin Registration
(function ($) {
  if ($.fn) {
    $.fn.flipBook = function (source, options) {
      const mergedOptions = $.extend(true, {}, DFLIP.defaults, options);
      return new FlipBook(this, source, mergedOptions);
    };
  }
})(jQuery);

// Global Setup on evaluation
(function ($) {
  $(document).ready(function () {
    // Auto-detect dFlipLocation if not defined. It is the site root: the engine's own assets are
    // vendored under vendor/, its sounds and images are first-party under lib/.
    if (typeof window.dFlipLocation === "undefined") {
      // Try to use import.meta.url (modern modules)
      try {
        const url = import.meta.url;
        if (url) {
          const parts = url.split("/");
          // From .../lib/js/core/dflip/index.js to the site root: drop the last 5 parts
          window.dFlipLocation = parts.slice(0, -5).join("/") + "/";
        }
      } catch (e) {
        // Fallback to scanning script tags (classic)
        $("script").each(function () {
          const src = $(this).attr("src") || "";
          if (src.indexOf("core/dflip") > -1) {
            window.dFlipLocation = src.split("/").slice(0, -5).join("/") + "/";
            return false;
          }
        });
      }
    }

    if (typeof window.dFlipLocation !== "undefined") {
      let loc = window.dFlipLocation;
      if (loc.length > 2 && loc.slice(-1) !== "/") {
        loc += "/";
        window.dFlipLocation = loc;
      }
      DFLIP.defaults.mockupjsSrc = loc + "vendor/js/mockup.min.js";
      DFLIP.defaults.pdfjsSrc = loc + "vendor/js/pdf.min.js";
      DFLIP.defaults.pdfjsCompatibilitySrc = loc + "vendor/js/compatibility.js";
      DFLIP.defaults.threejsSrc = loc + "vendor/js/three.min.js";
      DFLIP.defaults.pdfjsWorkerSrc = loc + "vendor/js/pdf.worker.min.js";
      DFLIP.defaults.soundFile = loc + "lib/sound/turn2.mp3";
      DFLIP.defaults.imagesLocation = loc + "lib/images";
      DFLIP.defaults.imageResourcesPath = loc + "lib/images/pdfjs/";
      DFLIP.defaults.cMapUrl = loc + "vendor/js/cmaps/";
    }

    $("body").on("click", "._df_button, ._df_thumb, ._df_custom", function (e) {
      e.preventDefault();
      const $this = $(this);
      if (!window.dfLightBox) {
        window.dfLightBox = new DFLightBox(() => {
          if (window.dfActiveLightBoxBook) {
            window.dfActiveLightBoxBook.dispose();
            window.dfActiveLightBoxBook = null;
          }
        });
      }
      window.dfLightBox.show(() => {
        const options = DFLIP.getOptions($this);
        options.transparent = false;
        options.height = "100%";
        options.isLightBox = true;
        window.dfActiveLightBoxBook = $(window.dfLightBox.container).flipBook(options.source, options);
      });
    });

    DFLIP.parseBooks();
  });
})(jQuery);

window.DFLIP = DFLIP;
export default DFLIP;
