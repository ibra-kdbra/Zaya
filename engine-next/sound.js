/**
 * The page-turn sound.
 *
 * Optional in every sense: off unless `soundEnable` is set, silent until the reader has
 * interacted with the page (browsers refuse to play before that), and silent for good if the
 * file will not load. A turn must never wait on it.
 */

export class PageSound {
  /** @param {{enabled?: boolean, url?: string, volume?: number}} [opts] */
  constructor(opts = {}) {
    this.enabled = !!opts.enabled && !!opts.url;
    this.url = opts.url || "";
    this.volume = typeof opts.volume === "number" ? Math.max(0, Math.min(1, opts.volume)) : 0.5;
    /** A small pool, so two quick turns overlap instead of cutting each other off. */
    this.pool = [];
    this.next = 0;
    this.broken = false;
    if (this.enabled) this.prepare();
  }

  prepare() {
    if (this.pool.length || this.broken) return;
    for (let i = 0; i < 3; i++) {
      const audio = new Audio(this.url);
      audio.preload = "auto";
      audio.volume = this.volume;
      audio.addEventListener("error", () => { this.broken = true; });
      this.pool.push(audio);
    }
  }

  play() {
    if (!this.enabled || this.broken) return;
    this.prepare();
    const audio = this.pool[this.next % this.pool.length];
    this.next++;
    try {
      audio.currentTime = 0;
      const started = audio.play();
      // Autoplay policy rejects until the reader has interacted; that is not an error worth reporting.
      if (started && typeof started.catch === "function") started.catch(() => {});
    } catch (err) { /* nothing a reader needs to know about */ }
  }

  setEnabled(on) {
    this.enabled = !!on && !!this.url;
    if (this.enabled) this.prepare();
  }

  dispose() {
    this.pool.forEach((a) => { try { a.pause(); a.src = ""; } catch (err) { /* ignore */ } });
    this.pool = [];
    this.enabled = false;
  }
}
