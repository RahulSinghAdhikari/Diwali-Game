/**
 * AMBIENT — the living background used behind menus and the victory screen.
 * Floating embers, drifting glows and distant fireworks. Pauses itself when
 * the tab is hidden or when gameplay takes over the screen.
 */

import { TAU, rand, randInt, clamp } from './utils.js';

const PALETTE = ['255,200,87', '255,159,67', '217,70,166', '155,93,229', '57,198,176'];

export class Ambient {
  constructor(canvas, { intensity = 1, celebration = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.embers = [];
    this.bursts = [];
    this.raf = 0;
    this.last = 0;
    this.running = false;
    this.intensity = intensity;
    this.celebration = celebration;
    this.reducedMotion = false;
    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    this.intensity = on ? 0.35 : 1;
  }

  start() {
    if (this.running) return;
    this._resize();
    window.addEventListener('resize', this._resize);
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize);
    this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
  }

  _spawnEmber() {
    this.embers.push({
      x: rand(0, this.w),
      y: this.h + rand(0, 40),
      vx: rand(-10, 10),
      vy: -rand(10, 32),
      r: rand(1.2, 3.2),
      life: rand(4, 9),
      age: 0,
      color: PALETTE[randInt(0, this.celebration ? 4 : 1)],
      phase: rand(0, TAU)
    });
  }

  _spawnBurst(x, y, color) {
    const parts = [];
    const n = this.reducedMotion ? 12 : 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.1, 0.1);
      const sp = rand(40, 120);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.8, 1.5), age: 0 });
    }
    this.bursts.push({ parts, color });
  }

  _loop(ts) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._loop);
    if (!this.last) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const maxEmbers = Math.round((this.celebration ? 50 : 26) * this.intensity);
    if (this.embers.length < maxEmbers && Math.random() < dt * 10) this._spawnEmber();

    // fireworks
    const rate = this.celebration ? 1.6 : 0.22;
    if (Math.random() < dt * rate * this.intensity) {
      this._spawnBurst(rand(this.w * 0.1, this.w * 0.9), rand(this.h * 0.08, this.h * 0.42), PALETTE[randInt(0, 4)]);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.age += dt;
      if (e.age > e.life || e.y < -20) { this.embers.splice(i, 1); continue; }
      e.x += (e.vx + Math.sin(e.age * 1.4 + e.phase) * 12) * dt;
      e.y += e.vy * dt;
      const k = 1 - e.age / e.life;
      const alpha = Math.sin(Math.min(1, e.age / 0.8) * Math.PI * 0.5) * k * 0.75;
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
      grad.addColorStop(0, `rgba(${e.color},${alpha})`);
      grad.addColorStop(1, `rgba(${e.color},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 6, 0, TAU);
      ctx.fill();
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      let alive = false;
      for (const p of b.parts) {
        p.age += dt;
        if (p.age > p.life) continue;
        alive = true;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 40 * dt;
        p.vx *= 0.985;
        const k = 1 - p.age / p.life;
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = `rgba(${b.color},1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + k * 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!alive) this.bursts.splice(i, 1);
    }

    ctx.restore();
  }
}
