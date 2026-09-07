/*
 * The one import of the page-turn engine.
 *
 * `engine-next/` is a set of ES modules; `lib/js/core/book.js`, the facade the rest of the
 * application talks to, is a classic script that has to publish `window.ZayaBook` the moment it
 * runs. This file is the join between the two: the loader lists it as a module, so the browser
 * defers it until the classic scripts of the same batch have run, and it hands the engine's
 * constructor over on `window.ZayaEngine` for the facade to pick up when a document is opened.
 *
 * That is the whole of it. No option is translated here and no behaviour is added: everything
 * the application asks of the engine goes through the facade, which is the only file under
 * `lib/` allowed to know that `engine-next/` exists at all.
 */
import { ZayaBook as Engine, LAZY_ASSETS } from "../../../engine-next/index.js";

window.ZayaEngine = Engine;
// What the engine fetches only when it first draws, so the worker can hold it for offline use.
window.ZayaEngine.lazyAssets = LAZY_ASSETS;
document.dispatchEvent(new CustomEvent("zaya:engineReady"));
