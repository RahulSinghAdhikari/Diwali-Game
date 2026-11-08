/**
 * GAME ENGINE — canvas sizing, the single rAF loop, pointer/keyboard input,
 * stage lifecycle and timing.
 *
 * A "stage" is any object implementing:
 *   init(engine)      — build state (engine.W / engine.H are ready)
 *   update(dt, engine)
 *   draw(ctx, engine)
 *   pointerDown/Move/Up(x, y, engine)   (optional)
 *   key(event, engine)                  (optional)
 *   resize(engine)                      (optional)
 *   destroy()                           (optional)
 *
 * engine.runStage(stage, seconds) resolves when the clock runs out, when the
 * stage calls engine.finishStage(), or when the run is aborted.
 */

import { FX } from './core/particles.js';
import { clamp } from './core/utils.js';

const MAX_DT = 1 / 20;   // never simulate more than 50ms in one step

export class GameEngine {
  constructor({ canvas, container, domLayer }) {
    this.canvas = canvas;
    this.container = container;
    this.domLayer = domLayer;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.fx = new FX();

    this.W = 0; this.H = 0; this.dpr = 1;
    this.stage = null;
    this.running = false;
    this.paused = false;
    this.rafId = 0;
    this.lastTs = 0;
    this.time = 0;            // seconds since stage start (incl. lead-in)
    this.stageTime = 0;       // seconds of actual play
    this.duration = 0;
    this.timeLeft = 0;
    this.leadIn = 0;
    this.pointer = { x: 0, y: 0, down: false, id: null };
    this.keys = new Set();
    this._resolve = null;
    this._onTick = null;
    this._lowFpsFrames = 0;
    this.fps = 60;

    this._bindInput();
    this._observeSize();
  }

  /* ------------------------------- sizing -------------------------------- */

  _observeSize() {
    const apply = () => this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(apply);
      this._ro.observe(this.container);
    } else {
      window.addEventListener('resize', apply);
    }
    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.stage?.resize) this.stage.resize(this);
  }

  /* -------------------------------- input -------------------------------- */

  _localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.W,
      y: ((e.clientY - rect.top) / rect.height) * this.H
    };
  }

  _bindInput() {
    const el = this.container;

    this._onDown = (e) => {
      if (!this.stage || this.paused) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = this._localPoint(e);
      this.pointer.x = p.x; this.pointer.y = p.y;
      this.pointer.down = true; this.pointer.id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.stage.pointerDown?.(p.x, p.y, this);
    };

    this._onMove = (e) => {
      if (!this.stage || this.paused) return;
      const p = this._localPoint(e);
      this.pointer.x = p.x; this.pointer.y = p.y;
      this.stage.pointerMove?.(p.x, p.y, this);
    };

    this._onUp = (e) => {
      if (!this.stage) return;
      const p = this._localPoint(e);
      this.pointer.down = false; this.pointer.id = null;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      this.stage.pointerUp?.(p.x, p.y, this);
    };

    el.addEventListener('pointerdown', this._onDown, { passive: true });
    el.addEventListener('pointermove', this._onMove, { passive: true });
    el.addEventListener('pointerup', this._onUp, { passive: true });
    el.addEventListener('pointercancel', this._onUp, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this._onKeyDown = (e) => {
      if (!this.stage) return;
      this.keys.add(e.key);
      this.stage.key?.(e, this);
    };
    this._onKeyUp = (e) => this.keys.delete(e.key);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /* ----------------------------- stage runner ----------------------------- */

  /**
   * @param {object} stage
   * @param {number} seconds   playable duration
   * @param {object} opts      { leadIn, onTick }
   * @returns {Promise<{reason:'time'|'early'|'abort', stage:object}>}
   */
  runStage(stage, seconds, opts = {}) {
    this.stopStage();
    this.stage = stage;
    this.duration = seconds;
    this.timeLeft = seconds;
    this.time = 0;
    this.stageTime = 0;
    this.leadIn = opts.leadIn ?? 0.65;
    this._onTick = opts.onTick || null;
    this.paused = false;
    this.fx.clear();
    this.resize();
    stage.init?.(this);
    if (this.leadIn > 0) this._showGo();

    return new Promise((resolve) => {
      this._resolve = resolve;
      this.lastTs = 0;
      this.running = true;
      this.rafId = requestAnimationFrame(this._loop);
    });
  }

  _showGo() {
    if (!this.domLayer) return;
    const el = document.createElement('div');
    el.className = 'countdown';
    el.innerHTML = '<span class="go">GO!</span>';
    this.domLayer.appendChild(el);
    setTimeout(() => el.remove(), 720);
  }

  _loop = (ts) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._loop);
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
    dt = Math.min(dt, MAX_DT);

    if (!this.paused) {
      this.time += dt;
      if (this.leadIn > 0) {
        this.leadIn -= dt;
      } else {
        this.stageTime += dt;
        if (this.duration > 0) {
          this.timeLeft = Math.max(0, this.duration - this.stageTime);
        }
        try {
          this.stage?.update?.(dt, this);
        } catch (err) {
          console.error('[engine] stage update failed', err);
        }
        this.fx.update(dt);
        this._onTick?.(this.timeLeft, this);
        if (this.duration > 0 && this.timeLeft <= 0) {
          this._finish('time');
          return;
        }
      }
    }

    this._render();
  };

  _render() {
    const { ctx } = this;
    ctx.save();
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.fx.shakeAmount > 0) ctx.translate(this.fx.shakeX, this.fx.shakeY);
    try {
      this.stage?.draw?.(ctx, this);
    } catch (err) {
      console.error('[engine] stage draw failed', err);
    }
    this.fx.draw(ctx);
    ctx.restore();
  }

  /** Called by a stage that ends before the clock (e.g. boss defeated). */
  finishStage(reason = 'early') { this._finish(reason); }

  _finish(reason) {
    if (!this.running) return;
    const stage = this.stage;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.({ reason, stage });
  }

  abort() {
    if (this.running) this._finish('abort');
    this.stopStage();
  }

  stopStage() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.stage?.destroy) {
      try { this.stage.destroy(); } catch (err) { console.error(err); }
    }
    this.stage = null;
    this.fx.clear();
    if (this.domLayer) this.domLayer.innerHTML = '';
    if (this.ctx) this.ctx.clearRect(0, 0, this.W, this.H);
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.stage?.onPause?.(this);
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastTs = 0;     // avoids a giant dt spike after a long pause
    this.stage?.onResume?.(this);
  }

  destroy() {
    this.stopStage();
    this._ro?.disconnect();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  /* ------------------------------ conveniences ---------------------------- */

  get cx() { return this.W / 2; }
  get cy() { return this.H / 2; }

  /** Scales a design value for the current playfield (keeps targets tappable). */
  unit(v) { return v * Math.min(this.W / 380, this.H / 560, 1.45); }
}
