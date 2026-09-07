/**
 * Pointer, wheel and touch gestures for the stage.
 *
 * Both renderers draw the same book, so both want the same gestures; keeping the recognition
 * here rather than in either of them means a gesture is defined once and the renderers are left
 * with nothing to do but draw. This module knows nothing about pages, textures or three.js — it
 * turns raw events into intentions and hands them to the engine.
 *
 * The intentions are:
 *
 * | gesture | at rest | zoomed in |
 * | --- | --- | --- |
 * | press and drag | the sheet follows the pointer and settles on release | the page pans |
 * | click or tap | turns the side that was tapped | nothing |
 * | double-click, double-tap | zooms in on that point | zooms back out to fit |
 * | ctrl and the wheel | zooms about the pointer | zooms about the pointer |
 * | two fingers apart or together | zooms about their midpoint | the same, and pans with them |
 *
 * A press that lands on a run of text in the text layer never starts a drag: the reader is
 * selecting, and the browser must be left alone to do it. If the press turns out to have
 * selected nothing and moved nowhere, it is treated as a tap after all, so a page can still be
 * turned by clicking the middle of a paragraph.
 */

/** How far across the stage a drag must travel for the turn to be complete. */
const DRAG_SPAN = 0.5;
/** Movement, in pixels, before a press counts as a drag rather than a click. */
const DRAG_SLOP = 6;
/** A second tap this soon after the first, and this close to it, is a double tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 40;
/**
 * A click on a run of text waits this long before it counts as a tap on the page. A reader
 * double-clicking a word clicks once first, and turning the page out from under them would take
 * the selection with it; the browser resolves click against double-click the same way.
 */
const TEXT_TAP_MS = 300;

export class Gestures {
  /**
   * @param {HTMLElement} stage
   * @param {{isZoomed: () => boolean, isInteractive: () => boolean, isBusy: () => boolean,
   *          direction: () => 'ltr'|'rtl',
   *          onTap: (forward: boolean) => void,
   *          onDragStart: (forward: boolean) => boolean|Promise<boolean>,
   *          onDragMove: (progress: number) => void,
   *          onDragEnd: (progress: number, velocity: number) => void,
   *          onPan: (dx: number, dy: number) => void,
   *          onZoomAt: (factor: number, x: number, y: number) => void,
   *          onDoubleTap: (x: number, y: number) => void}} handlers
   */
  constructor(stage, handlers) {
    this.stage = stage;
    this.on = handlers;
    this.disposed = false;
    /** @type {Map<number, {x: number, y: number}>} pointers currently down on the stage */
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.lastTap = null;
    this.pendingTap = null;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);

    stage.addEventListener("pointerdown", this.onPointerDown);
    stage.addEventListener("pointermove", this.onPointerMove);
    stage.addEventListener("pointerup", this.onPointerUp);
    stage.addEventListener("pointercancel", this.onPointerUp);
    stage.addEventListener("wheel", this.onWheel, { passive: false });
    stage.addEventListener("dblclick", this.onDoubleClick);
  }

  /** Pointer position relative to the stage. */
  local(event) {
    const rect = this.stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  }

  /** Whether a press here means "forward": the outer edge of the book in reading order. */
  forwardSide(fraction) {
    return this.on.direction() === "rtl" ? fraction < 0.5 : fraction > 0.5;
  }

  /* ---- pointers ---------------------------------------------------------------------------- */

  onPointerDown(event) {
    if (this.disposed || !this.on.isInteractive()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.cancelPendingTap();
    const point = this.local(event);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      this.endDrag(null);
      this.pinch = { distance: this.spread(), centre: this.centre() };
      return;
    }
    if (this.pointers.size > 2) return;

    // A press on the text layer belongs to the selection, not to the book.
    const onText = !!(event.target && event.target.closest && event.target.closest(".zn-textlayer"));
    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      time: event.timeStamp || performance.now(),
      width: point.width,
      forward: this.forwardSide(point.x / point.width),
      onText,
      moved: false,
      preview: null,
      progress: 0,
      velocity: 0,
    };
    if (!onText) {
      try { this.stage.setPointerCapture(event.pointerId); } catch (err) { /* not capturable */ }
    }
  }

  onPointerMove(event) {
    if (this.disposed) return;
    const tracked = this.pointers.get(event.pointerId);
    if (!tracked) return;
    tracked.x = event.clientX;
    tracked.y = event.clientY;

    if (this.pinch && this.pointers.size >= 2) {
      const distance = this.spread();
      const centre = this.centre();
      if (this.pinch.distance > 0 && distance > 0) {
        const rect = this.stage.getBoundingClientRect();
        this.on.onZoomAt(distance / this.pinch.distance, centre.x - rect.left, centre.y - rect.top);
      }
      if (this.on.isZoomed()) this.on.onPan(centre.x - this.pinch.centre.x, centre.y - this.pinch.centre.y);
      this.pinch = { distance, centre };
      return;
    }

    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    drag.moved = true;

    if (this.on.isZoomed()) {
      this.on.onPan(event.clientX - drag.lastX, event.clientY - drag.lastY);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    if (drag.onText) return;                      // the reader is selecting text, not turning

    if (!drag.preview) {
      drag.preview = Promise.resolve(this.on.onDragStart(drag.forward)).then((ok) => {
        drag.previewing = !!ok;
        return !!ok;
      });
    }
    // Dragging away from the outer edge advances the turn; the sign follows the direction.
    const sign = this.on.direction() === "rtl" ? -1 : 1;
    const travel = (drag.forward ? -dx : dx) * sign;
    const progress = Math.max(0, Math.min(1, travel / (drag.width * DRAG_SPAN)));
    const now = event.timeStamp || performance.now();
    const elapsed = Math.max(1, now - drag.time);
    drag.velocity = ((progress - drag.progress) / elapsed) * 1000;
    drag.progress = progress;
    drag.time = now;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.preview.then((ok) => { if (ok && this.drag === drag) this.on.onDragMove(progress); });
  }

  onPointerUp(event) {
    if (this.disposed) return;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    try { this.stage.releasePointerCapture(event.pointerId); } catch (err) { /* already gone */ }
    this.endDrag(event);
  }

  endDrag(event) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (drag.preview) {
      drag.preview.then((ok) => { if (ok) this.on.onDragEnd(drag.progress, drag.velocity); });
      return;
    }
    if (!event || drag.moved) return;
    // A press that neither moved nor left a selection behind is a tap on the page.
    if (drag.onText) {
      const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (selection && !selection.isCollapsed) return;
    }
    if (this.isDoubleTap(event)) return;
    if (this.on.isZoomed()) return;
    if (drag.onText) { this.deferTap(drag.forward); return; }
    if (!this.on.isBusy()) this.on.onTap(drag.forward);
  }

  /** Turn the page in a moment, unless a second click or a selection arrives first. */
  deferTap(forward) {
    this.cancelPendingTap();
    this.pendingTap = setTimeout(() => {
      this.pendingTap = null;
      if (this.disposed || this.on.isBusy() || this.on.isZoomed()) return;
      const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (selection && !selection.isCollapsed) return;
      this.on.onTap(forward);
    }, TEXT_TAP_MS);
  }

  cancelPendingTap() {
    if (this.pendingTap == null) return;
    clearTimeout(this.pendingTap);
    this.pendingTap = null;
  }

  /**
   * Recognise a double tap on a touch screen, where no `dblclick` is dispatched reliably.
   * @returns {boolean} whether this tap was the second of a pair
   */
  isDoubleTap(event) {
    if (event.pointerType === "mouse") return false;  // `dblclick` covers the mouse
    const now = event.timeStamp || performance.now();
    const last = this.lastTap;
    this.lastTap = { x: event.clientX, y: event.clientY, time: now };
    if (!last || now - last.time > DOUBLE_TAP_MS) return false;
    if (Math.hypot(event.clientX - last.x, event.clientY - last.y) > DOUBLE_TAP_PX) return false;
    this.lastTap = null;
    const point = this.local(event);
    this.on.onDoubleTap(point.x, point.y);
    return true;
  }

  /* ---- multi-touch helpers ------------------------------------------------------------------ */

  spread() {
    const [a, b] = Array.from(this.pointers.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  centre() {
    const [a, b] = Array.from(this.pointers.values());
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* ---- wheel and double-click ---------------------------------------------------------------- */

  onWheel(event) {
    if (this.disposed || !this.on.isInteractive()) return;
    // A trackpad pinch arrives as a wheel with the control key held; so does the keyboard zoom.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const point = this.local(event);
    // Exponential in the wheel delta, so a fast scroll and several slow ones agree.
    const factor = Math.exp(-event.deltaY / 260);
    this.on.onZoomAt(factor, point.x, point.y);
  }

  onDoubleClick(event) {
    if (this.disposed || !this.on.isInteractive()) return;
    this.cancelPendingTap();
    const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
    if (selection && !selection.isCollapsed) return;   // a double-click selected a word
    const point = this.local(event);
    this.on.onDoubleTap(point.x, point.y);
  }

  dispose() {
    this.disposed = true;
    this.cancelPendingTap();
    this.stage.removeEventListener("pointerdown", this.onPointerDown);
    this.stage.removeEventListener("pointermove", this.onPointerMove);
    this.stage.removeEventListener("pointerup", this.onPointerUp);
    this.stage.removeEventListener("pointercancel", this.onPointerUp);
    this.stage.removeEventListener("wheel", this.onWheel);
    this.stage.removeEventListener("dblclick", this.onDoubleClick);
    this.pointers.clear();
  }
}
