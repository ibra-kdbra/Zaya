/**
 * DFlip Constants and Defaults
 */

export const VERSION = "1.7.3.5";

export const PAGE_MODE = {
  SINGLE: 1,
  DOUBLE: 2,
  AUTO: null
};

export const SINGLE_PAGE_MODE = {
  ZOOM: 1,
  BOOKLET: 2,
  AUTO: null
};

export const CONTROLSPOSITION = {
  HIDDEN: "hide",
  TOP: "top",
  BOTTOM: "bottom"
};

export const DIRECTION = {
  LTR: 1,
  RTL: 2
};

export const LINK_TARGET = {
  NONE: 0,
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4
};

export const CORNERS = {
  TL: "tl",
  TR: "tr",
  BL: "bl",
  BR: "br",
  L: "l",
  R: "r",
  NONE: null
};

export const SOURCE_TYPE = {
  IMAGE: "image",
  PDF: "pdf",
  HTML: "html"
};

export const DISPLAY_TYPE = {
  WEBGL: "3D",
  HTML: "2D"
};

export const PAGE_SIZE = {
  AUTO: 0,
  SINGLE: 1,
  DOUBLEINTERNAL: 2
};

export const DEFAULTS = {
  webgl: true,
  webglShadow: true,
  soundEnable: true,
  search: false,
  height: "auto",
  autoEnableOutline: false,
  autoEnableThumbnail: false,
  overwritePDFOutline: false,
  enableDownload: true,
  duration: 800,
  direction: DIRECTION.LTR,
  pageMode: PAGE_MODE.AUTO,
  singlePageMode: SINGLE_PAGE_MODE.AUTO,
  backgroundColor: "#fff",
  forceFit: true,
  transparent: false,
  hard: "none",
  openPage: 1,
  annotationClass: "",
  autoPlay: false,
  autoPlayDuration: 5e3,
  autoPlayStart: false,
  maxTextureSize: 1600,
  minTextureSize: 256,
  rangeChunkSize: 524288,
  icons: {
    altnext: "ti-angle-right",
    altprev: "ti-angle-left",
    next: "ti-angle-right",
    prev: "ti-angle-left",
    end: "ti-angle-double-right",
    start: "ti-angle-double-left",
    share: "ti-sharethis",
    help: "ti-help-alt",
    more: "ti-more-alt",
    download: "ti-download",
    zoomin: "ti-zoom-in",
    zoomout: "ti-zoom-out",
    fullscreen: "ti-fullscreen",
    fitscreen: "ti-arrows-corner",
    thumbnail: "ti-layout-grid2",
    outline: "ti-menu-alt",
    close: "ti-close",
    search: "ti-search",
    doublepage: "ti-book",
    singlepage: "ti-file",
    sound: "ti-volume",
    facebook: "ti-facebook",
    google: "ti-google",
    twitter: "ti-twitter-alt",
    mail: "ti-email",
    play: "ti-control-play",
    pause: "ti-control-pause",
  },
  text: {
    toggleSound: "Turn on/off Sound",
    toggleThumbnails: "Toggle Thumbnails",
    toggleOutline: "Toggle Outline/Bookmark",
    previousPage: "Previous Page",
    nextPage: "Next Page",
    toggleFullscreen: "Toggle Fullscreen",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    toggleHelp: "Toggle Help",
    singlePageMode: "Single Page Mode",
    doublePageMode: "Double Page Mode",
    downloadPDFFile: "Download PDF File",
    gotoFirstPage: "Goto First Page",
    gotoLastPage: "Goto Last Page",
    play: "Start AutoPlay",
    pause: "Pause AutoPlay",
    share: "Share",
    mailSubject: "I wanted you to see this FlipBook",
    mailBody: "Check out this site {{url}}",
    loading: "Loading",
  },
  allControls: "altPrev,pageNumber,altNext,play,outline,thumbnail,searchPanel,zoomIn,zoomOut,fullScreen,share,download,search,more,pageMode,startPage,endPage,sound",
  moreControls: "download,pageMode,startPage,endPage,sound",
  hideControls: "",
  controlsPosition: CONTROLSPOSITION.BOTTOM,
  paddingTop: 30,
  paddingLeft: 20,
  paddingRight: 20,
  paddingBottom: 30,
  enableAnalytics: false,
  scrollWheel: true,
  onCreate: function (e) {},
  onCreateUI: function (e) {},
  onFlip: function (e) {},
  beforeFlip: function (e) {},
  onReady: function (e) {},
  zoomRatio: 1.5,
  pageSize: PAGE_SIZE.AUTO,
  pdfjsSrc: "vendor/js/pdf.min.js",
  pdfjsCompatibilitySrc: "vendor/js/compatibility.js",
  pdfjsWorkerSrc: "vendor/js/pdf.worker.min.js",
  threejsSrc: "vendor/js/three.min.js",
  mockupjsSrc: "vendor/js/mockup.min.js",
  soundFile: "lib/sound/turn2.mp3",
  imagesLocation: "lib/images",
  imageResourcesPath: "lib/images/pdfjs/",
  cMapUrl: "vendor/js/cmaps/",
  enableDebugLog: false,
  canvasToBlob: false,
  enableAnnotation: true,
  pdfRenderQuality: 0.9,
  textureLoadFallback: "blank",
  stiffness: 3,
  backgroundImage: "",
  pageRatio: null,
  pixelRatio: window.devicePixelRatio || 1,
  thumbElement: "div",
  spotLightIntensity: 0.22,
  ambientLightColor: "#fff",
  ambientLightIntensity: 0.8,
  shadowOpacity: 0.15,
  linkTarget: LINK_TARGET.BLANK,
  sharePrefix: "flipbook-",
};
