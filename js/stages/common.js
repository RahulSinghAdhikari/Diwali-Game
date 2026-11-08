/**
 * Shared stage helpers: cached backdrops, score popups and combo feedback.
 * Keeping these here lets each stage file stay focused on its mechanic.
 */

import { TAU, rand, mulberry32 } from '../core/utils.js';
import { cityscape, drawDiya, drawGlow } from '../core/art.js';

/** Re-renders an offscreen backdrop only when the playfield size changes. */
export class Backdrop {
  constructor(render) {
    this.render = render;
    this.canvas = null;
    this.w = 0; this.h = 0;
    this.dpr = 1;
  }

  get(engine) {
    const dpr = Math.min(2, engine.dpr);
    if (this.canvas && this.w === engine.W && this.h === engine.H && this.dpr === dpr) return this.canvas;
    const c = this.canvas || document.createElement('canvas');
    c.width = Math.ceil(engine.W * dpr);
    c.height = Math.ceil(engine.H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render(g, engine.W, engine.H);
    this.canvas = c;
    this.w = engine.W; this.h = engine.H; this.dpr = dpr;
    return c;
  }

  draw(ctx, engine) {
    ctx.drawImage(this.get(engine), 0, 0, engine.W, engine.H);
  }
}

/* ------------------------------ Backdrops -------------------------------- */

export const courtyardBackdrop = new Backdrop((g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1A0E31');
  sky.addColorStop(0.55, '#2B1550');
  sky.addColorStop(1, '#43205F');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // arches
  const rnd = mulberry32(11);
  g.strokeStyle = 'rgba(255,200,87,.14)';
  g.lineWidth = Math.max(1.5, w * 0.006);
  const archW = w / 3.2;
  for (let i = -0.5; i < 3.6; i++) {
    const x = i * archW + archW * 0.5;
    g.beginPath();
    g.moveTo(x - archW * 0.34, h * 0.42);
    g.quadraticCurveTo(x, h * 0.16, x + archW * 0.34, h * 0.42);
    g.stroke();
  }

  // floor
  g.fillStyle = 'rgba(23,13,43,.55)';
  g.beginPath();
  g.moveTo(0, h * 0.62);
  g.lineTo(w, h * 0.62);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fill();

  // floor rangoli
  const cx = w / 2, cy = h * 0.86;
  g.save();
  g.translate(cx, cy);
  g.scale(1, 0.38);
  for (let ring = 1; ring <= 3; ring++) {
    g.beginPath();
    g.arc(0, 0, w * 0.17 * ring, 0, TAU);
    g.strokeStyle = `rgba(${ring % 2 ? '217,70,166' : '255,200,87'},.13)`;
    g.lineWidth = Math.max(1, w * 0.004);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.beginPath();
    g.ellipse(Math.cos(a) * w * 0.34, Math.sin(a) * w * 0.34, w * 0.035, w * 0.016, a, 0, TAU);
    g.fillStyle = 'rgba(155,93,229,.14)';
    g.fill();
  }
  g.restore();

  // hanging string lights
  g.strokeStyle = 'rgba(255,200,87,.2)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-10, h * 0.07);
  g.quadraticCurveTo(w / 2, h * 0.17, w + 10, h * 0.07);
  g.stroke();
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const x = -10 + (w + 20) * t;
    const y = h * 0.07 + Math.sin(Math.PI * t) * h * 0.05;
    g.fillStyle = i % 2 ? 'rgba(255,159,67,.75)' : 'rgba(217,70,166,.6)';
    g.beginPath();
    g.arc(x, y + 5, Math.max(2, w * 0.007), 0, TAU);
    g.fill();
  }
  rnd();
});

export const nightSkyBackdrop = new Backdrop((g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#120826');
  sky.addColorStop(0.5, '#24123F');
  sky.addColorStop(1, '#3A1A63');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const rnd = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h * 0.75;
    const r = rnd() * 1.5 + 0.4;
    g.fillStyle = `rgba(255,248,236,${0.2 + rnd() * 0.6})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  // moon
  const mx = w * 0.78, my = h * 0.14, mr = Math.min(w, h) * 0.07;
  const halo = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3.4);
  halo.addColorStop(0, 'rgba(255,243,208,.5)');
  halo.addColorStop(1, 'rgba(255,243,208,0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(mx, my, mr * 3.4, 0, TAU); g.fill();
  g.fillStyle = '#FFF3D0';
  g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();

  const city = cityscape(w, h * 0.42, 0.75);
  g.drawImage(city, 0, h * 0.58, w, h * 0.42);
});

export const marketBackdrop = new Backdrop((g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2A1246');
  sky.addColorStop(0.6, '#44205C');
  sky.addColorStop(1, '#5A2A4A');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // bunting
  const flags = 11;
  g.strokeStyle = 'rgba(255,248,236,.25)';
  g.beginPath();
  g.moveTo(-8, h * 0.05);
  g.quadraticCurveTo(w / 2, h * 0.12, w + 8, h * 0.05);
  g.stroke();
  const colors = ['#FFC857', '#D946A6', '#39C6B0', '#FF9F43', '#9B5DE5'];
  for (let i = 0; i < flags; i++) {
    const t = i / (flags - 1);
    const x = -8 + (w + 16) * t;
    const y = h * 0.05 + Math.sin(Math.PI * t) * h * 0.06;
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(x - w * 0.025, y);
    g.lineTo(x + w * 0.025, y);
    g.lineTo(x, y + h * 0.05);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;

  // stalls
  const stalls = 3;
  for (let i = 0; i < stalls; i++) {
    const sw = w / stalls;
    const x = i * sw;
    const top = h * (0.58 + (i % 2) * 0.03);
    g.fillStyle = i % 2 ? 'rgba(53,22,92,.85)' : 'rgba(36,18,63,.9)';
    g.fillRect(x + sw * 0.05, top, sw * 0.9, h - top);
    // canopy stripes
    for (let s = 0; s < 6; s++) {
      g.fillStyle = s % 2 ? 'rgba(249,115,22,.75)' : 'rgba(255,248,236,.55)';
      g.beginPath();
      g.moveTo(x + sw * 0.05 + (sw * 0.9 * s) / 6, top);
      g.lineTo(x + sw * 0.05 + (sw * 0.9 * (s + 1)) / 6, top);
      g.lineTo(x + sw * 0.05 + (sw * 0.9 * (s + 0.5)) / 6, top - h * 0.045);
      g.closePath();
      g.fill();
    }
    // lantern glow
    const lg = g.createRadialGradient(x + sw / 2, top + h * 0.06, 2, x + sw / 2, top + h * 0.06, sw * 0.5);
    lg.addColorStop(0, 'rgba(255,200,87,.35)');
    lg.addColorStop(1, 'rgba(255,200,87,0)');
    g.fillStyle = lg;
    g.fillRect(x, top, sw, h - top);
  }

  // warm floor glow
  const floor = g.createLinearGradient(0, h * 0.8, 0, h);
  floor.addColorStop(0, 'rgba(249,115,22,0)');
  floor.addColorStop(1, 'rgba(249,115,22,.22)');
  g.fillStyle = floor;
  g.fillRect(0, h * 0.8, w, h * 0.2);
});

export const bossBackdrop = new Backdrop((g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0D0618');
  sky.addColorStop(0.45, '#1E0E38');
  sky.addColorStop(1, '#35165C');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const rnd = mulberry32(5150);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(185,169,207,${0.1 + rnd() * 0.35})`;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h * 0.6, rnd() * 1.4 + 0.3, 0, TAU);
    g.fill();
  }

  // swirling dark clouds
  for (let i = 0; i < 5; i++) {
    const cx = rnd() * w, cy = h * (0.1 + rnd() * 0.3), r = w * (0.2 + rnd() * 0.3);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(74,42,115,.35)');
    grad.addColorStop(1, 'rgba(74,42,115,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  }

  const city = cityscape(w, h * 0.3, 0.12);
  g.globalAlpha = 0.9;
  g.drawImage(city, 0, h * 0.7, w, h * 0.3);
  g.globalAlpha = 1;
});

/* --------------------------- Gameplay feedback ---------------------------- */

const COMBO_COLORS = ['#FFF8EC', '#39C6B0', '#FFC857', '#FF8AD8'];

export function popScore(engine, points, x, y, opts = {}) {
  const positive = points >= 0;
  const color = opts.color || (positive ? COMBO_COLORS[Math.min(3, opts.level || 0)] : '#FF7AC8');
  engine.fx.floatText(x, y - 10, `${positive ? '+' : ''}${points}`, {
    color,
    size: opts.size || (positive ? 22 + Math.min(10, (opts.level || 0) * 4) : 20),
    life: 0.95,
    vy: -70
  });
}

export function hitSplash(engine, x, y, color = '255,200,87', power = 1) {
  engine.fx.burst(x, y, { count: 14 * power, color, speed: 150 * power, spread: TAU, size: 2.8, life: 0.5, gravity: 120 });
  engine.fx.ring(x, y, { color, r0: 4, r1: 46 * power, life: 0.34, width: 2.5 });
}

export function comboCallout(engine, tag, level) {
  const colors = ['#FFF8EC', '#39C6B0', '#FFC857', '#FF8AD8'];
  engine.fx.floatText(engine.W / 2, engine.H * 0.3, tag, {
    color: colors[Math.min(3, level)],
    size: 30 + level * 4,
    life: 1.0,
    vy: -34
  });
  engine.fx.shake(2 + level * 1.4);
}

/** Ambient floating embers used by several stages. */
export function ambientEmbers(engine, dt, rate = 2.4, color = '255,159,67') {
  if (Math.random() < dt * rate) {
    engine.fx.ember(rand(0, engine.W), engine.H * rand(0.75, 1.02), color);
  }
}

/** Decorative lit diyas along the bottom edge (boss + victory scenes). */
export function drawFloorDiyas(ctx, engine, count, t, size = 26) {
  const step = engine.W / (count + 1);
  for (let i = 1; i <= count; i++) {
    const x = step * i;
    const y = engine.H - size * 0.55;
    drawDiya(ctx, x, y, size, { lit: true, t: t + i * 0.7, golden: i % 3 === 0 });
  }
}

export function drawVignette(ctx, engine, strength = 0.5) {
  const g = ctx.createRadialGradient(engine.cx, engine.cy, Math.min(engine.W, engine.H) * 0.2, engine.cx, engine.cy, Math.max(engine.W, engine.H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(8,4,16,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, engine.W, engine.H);
}

export { drawGlow };
