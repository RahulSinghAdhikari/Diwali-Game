/**
 * FX — pooled particles, floating score text, shockwave rings and screen shake.
 * One instance per canvas. Everything is capped so mobile stays at 60fps.
 */

import { TAU, rand, randInt, clamp } from './utils.js';
import { glowSprite, blit } from './art.js';

const MAX_PARTICLES = 320;

class Particle {
  constructor() { this.alive = false; }
  init(x, y, cfg) {
    this.alive = true;
    this.x = x; this.y = y;
    this.vx = cfg.vx; this.vy = cfg.vy;
    this.life = cfg.life; this.maxLife = cfg.life;
    this.size = cfg.size;
    this.color = cfg.color;
    this.gravity = cfg.gravity ?? 0;
    this.drag = cfg.drag ?? 0.995;
    this.kind = cfg.kind ?? 'spark';
    this.rot = cfg.rot ?? 0;
    this.spin = cfg.spin ?? 0;
    this.fade = cfg.fade ?? 1;
  }
}

export class FX {
  constructor() {
    this.pool = Array.from({ length: MAX_PARTICLES }, () => new Particle());
    this.cursor = 0;
    this.texts = [];
    this.rings = [];
    this.shakeAmount = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.quality = 1;       // scaled down for reduced motion
    this.reducedMotion = false;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    this.quality = on ? 0.35 : 1;
  }

  _spawn(x, y, cfg) {
    // Ring buffer: oldest particle is recycled when the pool is saturated.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (!p.alive) { p.init(x, y, cfg); return p; }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.init(x, y, cfg);
    return p;
  }

  /** Radial spark burst. */
  burst(x, y, {
    count = 12, color = '255,200,87', speed = 160, spread = TAU, angle = -Math.PI / 2,
    size = 3.2, life = 0.6, gravity = 260, kind = 'spark'
  } = {}) {
    const n = Math.max(2, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const sp = speed * rand(0.45, 1.25);
      this._spawn(x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * rand(0.7, 1.25),
        size: size * rand(0.6, 1.4),
        color, gravity, kind
      });
    }
  }

  /** Firework explosion: two-tone shell + lingering embers. */
  firework(x, y, color = '255,200,87', power = 1) {
    this.burst(x, y, { count: 26 * power, color, speed: 230 * power, spread: TAU, size: 3.4, life: 0.85, gravity: 130 });
    this.burst(x, y, { count: 14 * power, color: '255,248,236', speed: 120 * power, spread: TAU, size: 2.2, life: 0.55, gravity: 60 });
    this.ring(x, y, { color, r0: 6, r1: 90 * power, life: 0.42, width: 3 });
  }

  /** Falling celebration confetti (victory screens). */
  confetti(w, h, count = 40) {
    const colors = ['255,200,87', '217,70,166', '57,198,176', '155,93,229', '255,159,67', '255,248,236'];
    const n = Math.max(6, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      this._spawn(rand(0, w), rand(-h * 0.3, 0), {
        vx: rand(-40, 40),
        vy: rand(60, 170),
        life: rand(2.4, 4.2),
        size: rand(5, 11),
        color: colors[randInt(0, colors.length - 1)],
        gravity: 30,
        drag: 0.999,
        kind: 'confetti',
        rot: rand(0, TAU),
        spin: rand(-6, 6)
      });
    }
  }

  /** Soft drifting embers used as ambience. */
  ember(x, y, color = '255,159,67') {
    this._spawn(x, y, {
      vx: rand(-14, 14), vy: rand(-26, -8),
      life: rand(1.4, 2.6), size: rand(1.6, 3.4),
      color, gravity: -6, drag: 0.994, kind: 'ember'
    });
  }

  ring(x, y, { color = '255,200,87', r0 = 8, r1 = 70, life = 0.4, width = 3 } = {}) {
    if (this.rings.length > 14) this.rings.shift();
    this.rings.push({ x, y, r0, r1, life, maxLife: life, color, width });
  }

  floatText(x, y, text, { color = '#FFC857', size = 20, life = 0.9, vy = -58, bold = true } = {}) {
    if (this.texts.length > 18) this.texts.shift();
    this.texts.push({ x, y, text, color, size, life, maxLife: life, vy, bold });
  }

  shake(amount = 6) {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.min(22, this.shakeAmount + amount);
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.texts.length = 0;
    this.rings.length = 0;
    this.shakeAmount = 0;
    this.shakeX = this.shakeY = 0;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.94;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    if (this.shakeAmount > 0.1) {
      this.shakeAmount *= Math.pow(0.0016, dt);   // fast exponential decay
      this.shakeX = rand(-this.shakeAmount, this.shakeAmount);
      this.shakeY = rand(-this.shakeAmount, this.shakeAmount);
    } else {
      this.shakeAmount = 0;
      this.shakeX = this.shakeY = 0;
    }
  }

  draw(ctx) {
    // --- additive sparks
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive || p.kind === 'confetti') continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === 'ember') {
        blit(ctx, glowSprite(p.color), p.x, p.y, p.size * 7, 0, a * 0.5);
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(${p.color},1)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
      if (p.size > 2.6) {
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.1 * a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // --- confetti (normal blending, rotating quads)
    for (const p of this.pool) {
      if (!p.alive || p.kind !== 'confetti') continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(${p.color},1)`;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }

    // --- rings
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 3));
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = `rgba(${r.color},1)`;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // --- floating text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      const scale = k > 0.78 ? 1 + (1 - (k - 0.78) / 0.22) * 0.35 : 1;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `${t.bold ? '800' : '600'} ${Math.round(t.size * scale)}px Outfit, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, t.size * 0.22);
      ctx.strokeStyle = 'rgba(12,6,23,.72)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
