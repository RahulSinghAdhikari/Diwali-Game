/**
 * ART — procedural vector artwork for the canvas stages.
 *
 * Every object is drawn once into an offscreen sprite canvas and then blitted,
 * so the hot loop does `drawImage` instead of rebuilding paths + gradients
 * 60 times a second. Animated parts (flames, glows, eyes) are drawn live
 * because they must breathe.
 *
 * One consistent illustration style: warm clay + gold, flat shapes with soft
 * inner lighting and a glow pass — matching the SVG UI artwork.
 */

import { TAU, mulberry32 } from './utils.js';

const SPRITE_DPR = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
const cache = new Map();

/* roundRect fallback for older canvas implementations */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
    const rr = Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

function makeSprite(key, size, draw) {
  const k = `${key}@${size}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * SPRITE_DPR);
  c.height = Math.ceil(size * SPRITE_DPR);
  const g = c.getContext('2d');
  g.scale(SPRITE_DPR, SPRITE_DPR);
  draw(g, size);
  cache.set(k, c);
  return c;
}

/** Blit a sprite centred on (x, y) with a box size of `size`. */
export function blit(ctx, sprite, x, y, size, rotation = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/* --------------------------------- Glow ---------------------------------- */

export function glowSprite(color = '255,200,87') {
  return makeSprite(`glow-${color}`, 128, (g, s) => {
    const r = s / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `rgba(${color},0.95)`);
    grad.addColorStop(0.32, `rgba(${color},0.42)`);
    grad.addColorStop(0.65, `rgba(${color},0.12)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

/** Additive glow halo. */
export function drawGlow(ctx, x, y, radius, color = '255,200,87', alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glowSprite(color), x, y, radius * 2, 0, alpha);
  ctx.restore();
}

/* --------------------------------- Diya ---------------------------------- */

const diyaBowl = (golden) => makeSprite(`diya-${golden ? 'gold' : 'clay'}`, 128, (g, s) => {
  const cx = s / 2;
  const top = s * 0.52;
  const w = s * 0.42;

  // bowl body
  g.beginPath();
  g.moveTo(cx - w, top);
  g.bezierCurveTo(cx - w, top + s * 0.3, cx - w * 0.52, top + s * 0.36, cx, top + s * 0.36);
  g.bezierCurveTo(cx + w * 0.52, top + s * 0.36, cx + w, top + s * 0.3, cx + w, top);
  g.closePath();
  const body = g.createLinearGradient(0, top, 0, top + s * 0.36);
  if (golden) { body.addColorStop(0, '#FFE39A'); body.addColorStop(0.55, '#F0B13C'); body.addColorStop(1, '#A9681A'); }
  else { body.addColorStop(0, '#D9834F'); body.addColorStop(0.55, '#A85630'); body.addColorStop(1, '#6E331C'); }
  g.fillStyle = body;
  g.fill();

  // rim
  g.beginPath();
  g.ellipse(cx, top, w, s * 0.085, 0, 0, TAU);
  const rim = g.createLinearGradient(cx - w, 0, cx + w, 0);
  if (golden) { rim.addColorStop(0, '#FFD780'); rim.addColorStop(0.5, '#FFF3C9'); rim.addColorStop(1, '#E8A93A'); }
  else { rim.addColorStop(0, '#C2733F'); rim.addColorStop(0.5, '#E8A271'); rim.addColorStop(1, '#8A4428'); }
  g.fillStyle = rim;
  g.fill();

  // oil well
  g.beginPath();
  g.ellipse(cx, top + s * 0.01, w * 0.72, s * 0.055, 0, 0, TAU);
  g.fillStyle = golden ? '#7A4A08' : '#4A2113';
  g.fill();

  // decorative dots
  g.fillStyle = golden ? 'rgba(255,248,236,.55)' : 'rgba(255,200,87,.45)';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.arc(cx + i * w * 0.34, top + s * 0.17, s * 0.016, 0, TAU);
    g.fill();
  }

  // wick
  g.fillStyle = '#5B3A22';
  g.beginPath();
  g.ellipse(cx, top - s * 0.012, s * 0.028, s * 0.045, 0, 0, TAU);
  g.fill();
});

/**
 * @param {boolean} lit      draws the flame + glow
 * @param {number}  t        seconds, for the flicker
 * @param {number}  ignite   0..1 ignition animation progress
 */
export function drawDiya(ctx, x, y, size, { golden = false, lit = false, t = 0, ignite = 1, alpha = 1 } = {}) {
  if (lit) {
    const pulse = 0.85 + Math.sin(t * 6 + x * 0.05) * 0.1;
    drawGlow(ctx, x, y - size * 0.1, size * (golden ? 1.0 : 0.82) * pulse, golden ? '255,215,120' : '255,159,67', 0.75 * alpha * ignite);
  }
  blit(ctx, diyaBowl(golden), x, y, size, 0, alpha);
  if (lit && ignite > 0.02) drawFlame(ctx, x, y - size * 0.07, size * 0.42 * Math.min(1, ignite * 1.2), t, alpha);
}

export function drawFlame(ctx, x, y, h, t = 0, alpha = 1) {
  const f = 1 + Math.sin(t * 11 + x * 0.3) * 0.07 + Math.sin(t * 19.3) * 0.035;
  const w = h * 0.46 * f;
  const hh = h * f;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';

  // outer flame
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.bezierCurveTo(x + w, y - hh * 0.45, x + w * 0.92, y, x, y);
  ctx.bezierCurveTo(x - w * 0.92, y, x - w, y - hh * 0.45, x, y - hh);
  const grad = ctx.createLinearGradient(0, y - hh, 0, y);
  grad.addColorStop(0, 'rgba(255,248,236,0.98)');
  grad.addColorStop(0.35, 'rgba(255,200,87,0.95)');
  grad.addColorStop(0.78, 'rgba(249,115,22,0.85)');
  grad.addColorStop(1, 'rgba(217,70,166,0.25)');
  ctx.fillStyle = grad;
  ctx.fill();

  // inner core
  ctx.beginPath();
  ctx.moveTo(x, y - hh * 0.62);
  ctx.bezierCurveTo(x + w * 0.42, y - hh * 0.3, x + w * 0.36, y - hh * 0.04, x, y - hh * 0.04);
  ctx.bezierCurveTo(x - w * 0.36, y - hh * 0.04, x - w * 0.42, y - hh * 0.3, x, y - hh * 0.62);
  ctx.fillStyle = 'rgba(255,255,245,0.92)';
  ctx.fill();
  ctx.restore();
}

/* ------------------------------ Shadow wisp ------------------------------- */

const wispSprite = () => makeSprite('wisp', 128, (g, s) => {
  const cx = s / 2, cy = s / 2;
  const grad = g.createRadialGradient(cx, cy - s * 0.06, s * 0.05, cx, cy, s * 0.48);
  grad.addColorStop(0, 'rgba(74,42,115,0.98)');
  grad.addColorStop(0.55, 'rgba(38,18,66,0.92)');
  grad.addColorStop(1, 'rgba(14,6,26,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, s * 0.46, 0, TAU);
  g.fill();

  // ragged edge
  g.strokeStyle = 'rgba(155,93,229,0.45)';
  g.lineWidth = s * 0.016;
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const r = s * (0.3 + (i % 2 ? 0.045 : 0.012));
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
  g.stroke();
});

export function drawWisp(ctx, x, y, size, t = 0, alpha = 1) {
  const wob = Math.sin(t * 3 + x * 0.04) * 0.06;
  blit(ctx, wispSprite(), x, y, size * (1 + wob), t * 0.4, alpha);
  // eyes
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#D946A6';
  const eo = size * 0.11;
  const blink = (Math.sin(t * 2.2 + x) > 0.96) ? 0.25 : 1;
  ctx.beginPath(); ctx.ellipse(x - eo, y - size * 0.03, size * 0.045, size * 0.055 * blink, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + eo, y - size * 0.03, size * 0.045, size * 0.055 * blink, 0.2, 0, TAU); ctx.fill();
  ctx.restore();
}

/* -------------------------------- Rockets --------------------------------- */

const rocketSprite = (variant) => makeSprite(`rocket-${variant}`, 128, (g, s) => {
  const cx = s / 2;
  const colors = {
    normal: ['#FF9F43', '#F97316', '#B9410B'],
    gold: ['#FFF0BE', '#FFC857', '#C98A12'],
    teal: ['#8CF0E2', '#39C6B0', '#157F70'],
    magenta: ['#F7A8DD', '#D946A6', '#8E1F68'],
    dud: ['#5A4876', '#3A2458', '#190C2C']
  }[variant] || ['#FF9F43', '#F97316', '#B9410B'];

  // body
  g.beginPath();
  g.moveTo(cx, s * 0.16);
  g.lineTo(cx + s * 0.13, s * 0.42);
  g.lineTo(cx + s * 0.13, s * 0.68);
  g.lineTo(cx - s * 0.13, s * 0.68);
  g.lineTo(cx - s * 0.13, s * 0.42);
  g.closePath();
  const body = g.createLinearGradient(cx - s * 0.13, 0, cx + s * 0.13, 0);
  body.addColorStop(0, colors[1]);
  body.addColorStop(0.42, colors[0]);
  body.addColorStop(1, colors[2]);
  g.fillStyle = body;
  g.fill();

  // nose highlight
  g.beginPath();
  g.moveTo(cx, s * 0.17);
  g.lineTo(cx + s * 0.055, s * 0.4);
  g.lineTo(cx - s * 0.055, s * 0.4);
  g.closePath();
  g.fillStyle = 'rgba(255,248,236,.55)';
  g.fill();

  // stripes
  g.fillStyle = variant === 'dud' ? 'rgba(155,93,229,.3)' : 'rgba(23,13,43,.35)';
  g.fillRect(cx - s * 0.13, s * 0.47, s * 0.26, s * 0.035);
  g.fillRect(cx - s * 0.13, s * 0.56, s * 0.26, s * 0.035);

  // fins
  g.beginPath();
  g.moveTo(cx - s * 0.13, s * 0.6);
  g.lineTo(cx - s * 0.24, s * 0.76);
  g.lineTo(cx - s * 0.13, s * 0.72);
  g.closePath();
  g.moveTo(cx + s * 0.13, s * 0.6);
  g.lineTo(cx + s * 0.24, s * 0.76);
  g.lineTo(cx + s * 0.13, s * 0.72);
  g.closePath();
  g.fillStyle = colors[2];
  g.fill();

  if (variant === 'dud') {
    // crossed-out warning marks so duds read instantly
    g.strokeStyle = 'rgba(217,70,166,.9)';
    g.lineWidth = s * 0.03;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - s * 0.07, s * 0.46); g.lineTo(cx + s * 0.07, s * 0.6);
    g.moveTo(cx + s * 0.07, s * 0.46); g.lineTo(cx - s * 0.07, s * 0.6);
    g.stroke();
  }
});

export function drawRocket(ctx, x, y, size, { variant = 'normal', t = 0, alpha = 1, wobble = 0 } = {}) {
  const color = variant === 'gold' ? '255,200,87'
    : variant === 'teal' ? '57,198,176'
      : variant === 'magenta' ? '217,70,166'
        : variant === 'dud' ? '110,60,160' : '255,159,67';
  if (variant !== 'dud') drawGlow(ctx, x, y, size * 0.52, color, 0.5 * alpha);
  blit(ctx, rocketSprite(variant), x, y, size, wobble, alpha);

  // exhaust
  const flick = 0.7 + Math.sin(t * 24 + x) * 0.3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  const ex = ctx.createLinearGradient(0, y + size * 0.3, 0, y + size * (0.3 + 0.36 * flick));
  ex.addColorStop(0, variant === 'dud' ? 'rgba(110,60,160,.65)' : 'rgba(255,248,236,.9)');
  ex.addColorStop(0.5, variant === 'dud' ? 'rgba(74,42,115,.3)' : 'rgba(255,159,67,.55)');
  ex.addColorStop(1, 'rgba(255,159,67,0)');
  ctx.fillStyle = ex;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.1, y + size * 0.3);
  ctx.lineTo(x + size * 0.1, y + size * 0.3);
  ctx.lineTo(x, y + size * (0.32 + 0.4 * flick));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* --------------------------------- Sweets --------------------------------- */

const laddooSprite = () => makeSprite('laddoo', 128, (g, s) => {
  const cx = s / 2, cy = s / 2, r = s * 0.34;
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#FFE6A0');
  grad.addColorStop(0.55, '#F2A93B');
  grad.addColorStop(1, '#C06A10');
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  // granules
  const rnd = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU, rr = Math.sqrt(rnd()) * r * 0.86;
    g.fillStyle = `rgba(${rnd() > 0.5 ? '255,243,196' : '183,99,16'},.5)`;
    g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s * 0.018, 0, TAU); g.fill();
  }
  // pistachio
  g.fillStyle = '#39C6B0';
  g.beginPath(); g.ellipse(cx + r * 0.1, cy - r * 0.62, s * 0.028, s * 0.018, 0.4, 0, TAU); g.fill();
});

const jalebiSprite = () => makeSprite('jalebi', 128, (g, s) => {
  const cx = s / 2, cy = s / 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const grad = g.createLinearGradient(cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy + s * 0.3);
  grad.addColorStop(0, '#FFC857');
  grad.addColorStop(0.5, '#FF9F43');
  grad.addColorStop(1, '#E2650C');
  g.strokeStyle = grad;
  g.lineWidth = s * 0.082;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU * 2.2;
    const r = s * (0.1 + 0.1 * (i / 64)) + Math.sin(a * 3) * s * 0.05;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,248,236,.35)';
  g.lineWidth = s * 0.02;
  g.stroke();
});

const barfiSprite = () => makeSprite('barfi', 128, (g, s) => {
  const cx = s / 2, cy = s / 2, r = s * 0.3;
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  const grad = g.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#FFF8EC');
  grad.addColorStop(0.5, '#F6E2C4');
  grad.addColorStop(1, '#D9B68A');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(-r, -r, r * 2, r * 2, s * 0.03);
  g.fill();
  // silver leaf
  g.fillStyle = 'rgba(217,232,255,.75)';
  g.beginPath(); g.roundRect(-r * 0.86, -r * 0.86, r * 1.72, r * 0.6, s * 0.02); g.fill();
  g.restore();
  // pistachio dots
  g.fillStyle = '#39C6B0';
  g.beginPath(); g.arc(cx, cy - s * 0.02, s * 0.03, 0, TAU); g.fill();
  g.fillStyle = '#D946A6';
  g.beginPath(); g.arc(cx - s * 0.09, cy + s * 0.07, s * 0.02, 0, TAU); g.fill();
});

const goldenSweetSprite = () => makeSprite('golden-sweet', 128, (g, s) => {
  const cx = s / 2, cy = s / 2, r = s * 0.32;
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.08, cx, cy, r);
  grad.addColorStop(0, '#FFFBE8');
  grad.addColorStop(0.45, '#FFD36B');
  grad.addColorStop(1, '#E09612');
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  // sparkle star
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 === 0 ? r * 0.55 : r * 0.2;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,248,236,.8)';
  g.lineWidth = s * 0.016;
  g.beginPath(); g.arc(cx, cy, r * 0.92, 0, TAU); g.stroke();
});

const badBoxSprite = () => makeSprite('badbox', 128, (g, s) => {
  const cx = s / 2, cy = s / 2, w = s * 0.3;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.12);
  const grad = g.createLinearGradient(0, -w, 0, w);
  grad.addColorStop(0, '#4A2A73');
  grad.addColorStop(1, '#231040');
  g.fillStyle = grad;
  g.beginPath(); g.roundRect(-w, -w * 0.78, w * 2, w * 1.56, s * 0.03); g.fill();
  g.strokeStyle = 'rgba(155,93,229,.6)';
  g.lineWidth = s * 0.022;
  g.beginPath(); g.roundRect(-w, -w * 0.78, w * 2, w * 1.56, s * 0.03); g.stroke();
  // open lid
  g.fillStyle = '#35165C';
  g.beginPath(); g.moveTo(-w, -w * 0.78); g.lineTo(-w * 0.6, -w * 1.5); g.lineTo(w * 1.1, -w * 1.1); g.lineTo(w, -w * 0.78); g.closePath(); g.fill();
  g.restore();
  // "empty" cross
  g.strokeStyle = 'rgba(217,70,166,.9)';
  g.lineWidth = s * 0.03;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.08, cy - s * 0.06); g.lineTo(cx + s * 0.08, cy + s * 0.08);
  g.moveTo(cx + s * 0.08, cy - s * 0.06); g.lineTo(cx - s * 0.08, cy + s * 0.08);
  g.stroke();
});

const SWEETS = {
  laddoo: laddooSprite,
  jalebi: jalebiSprite,
  barfi: barfiSprite,
  golden: goldenSweetSprite,
  bad: badBoxSprite
};

export function drawSweet(ctx, kind, x, y, size, { rot = 0, alpha = 1 } = {}) {
  if (kind === 'golden') drawGlow(ctx, x, y, size * 0.62, '255,200,87', 0.6 * alpha);
  else if (kind === 'bad') drawGlow(ctx, x, y, size * 0.5, '155,93,229', 0.3 * alpha);
  blit(ctx, (SWEETS[kind] || laddooSprite)(), x, y, size, rot, alpha);
}

/* --------------------------------- Basket --------------------------------- */

const basketSprite = () => makeSprite('basket', 256, (g, s) => {
  const cx = s / 2;
  const topY = s * 0.3;
  const botY = s * 0.72;
  const topW = s * 0.42;
  const botW = s * 0.29;

  // body
  g.beginPath();
  g.moveTo(cx - topW, topY);
  g.lineTo(cx + topW, topY);
  g.lineTo(cx + botW, botY);
  g.quadraticCurveTo(cx, botY + s * 0.07, cx - botW, botY);
  g.closePath();
  const body = g.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, '#E0A368');
  body.addColorStop(0.5, '#B9763E');
  body.addColorStop(1, '#7B4524');
  g.fillStyle = body;
  g.fill();

  // weave
  g.strokeStyle = 'rgba(42,18,10,.3)';
  g.lineWidth = s * 0.012;
  for (let i = 1; i < 4; i++) {
    const yy = topY + ((botY - topY) * i) / 4;
    const ww = topW + ((botW - topW) * i) / 4;
    g.beginPath();
    g.moveTo(cx - ww, yy);
    g.quadraticCurveTo(cx, yy + s * 0.018, cx + ww, yy);
    g.stroke();
  }
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx + (topW * i) / 3.4, topY);
    g.lineTo(cx + (botW * i) / 3.4, botY);
    g.stroke();
  }

  // gold rim
  g.beginPath();
  g.ellipse(cx, topY, topW, s * 0.055, 0, 0, TAU);
  const rim = g.createLinearGradient(cx - topW, 0, cx + topW, 0);
  rim.addColorStop(0, '#E8A93A');
  rim.addColorStop(0.45, '#FFEFBF');
  rim.addColorStop(1, '#C98A12');
  g.fillStyle = rim;
  g.fill();
  g.beginPath();
  g.ellipse(cx, topY, topW * 0.88, s * 0.04, 0, 0, TAU);
  g.fillStyle = '#4A2113';
  g.fill();

  // hanging marigold garland
  g.fillStyle = '#FF9F43';
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.arc(cx + (topW * i) / 3.2, topY + s * 0.075 + Math.abs(i) * s * 0.006, s * 0.022, 0, TAU);
    g.fill();
  }
});

export function drawBasket(ctx, x, y, width, { squash = 0, t = 0 } = {}) {
  const size = width * 1.42;
  const sx = 1 + squash * 0.16;
  const sy = 1 - squash * 0.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.drawImage(basketSprite(), -size / 2, -size / 2, size, size);
  ctx.restore();
  drawGlow(ctx, x, y - width * 0.1, width * 0.72, '255,200,87', 0.18 + Math.sin(t * 3) * 0.04);
}

/* ------------------------------- Cityscape -------------------------------- */

const cityCache = new Map();

/**
 * Distant Diwalipur silhouette, cached per size + lighting bucket.
 * `light` 0..1 controls how many windows are lit (used by the boss stage).
 */
export function cityscape(width, height, light = 0.5) {
  return buildCity(width, height, Math.round(light * 4) / 4);
}

function buildCity(width, height, light) {
  const key = `${Math.round(width)}x${Math.round(height)}-${light}`;
  const hit = cityCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.ceil(width * SPRITE_DPR);
  c.height = Math.ceil(height * SPRITE_DPR);
  const g = c.getContext('2d');
  g.scale(SPRITE_DPR, SPRITE_DPR);
  const rnd = mulberry32(20241104);

  const layers = [
    { y: height * 0.42, h: height * 0.58, color: '#2B1550', alpha: 0.75, count: 11 },
    { y: height * 0.55, h: height * 0.45, color: '#1E0F39', alpha: 0.9, count: 9 },
    { y: height * 0.7, h: height * 0.3, color: '#140A26', alpha: 1, count: 7 }
  ];

  layers.forEach((layer, li) => {
    g.globalAlpha = layer.alpha;
    let x = -10;
    while (x < width + 10) {
      const w = width * (0.07 + rnd() * 0.08);
      const h = layer.h * (0.42 + rnd() * 0.58);
      const top = layer.y + (layer.h - h);
      g.fillStyle = layer.color;
      g.fillRect(x, top, w, height - top);

      // dome or spire on some buildings
      const deco = rnd();
      if (deco > 0.72) {
        g.beginPath();
        g.ellipse(x + w / 2, top, w * 0.42, w * 0.38, 0, Math.PI, TAU);
        g.fill();
        g.fillRect(x + w / 2 - w * 0.025, top - w * 0.62, w * 0.05, w * 0.3);
      } else if (deco > 0.55) {
        g.beginPath();
        g.moveTo(x + w * 0.1, top);
        g.lineTo(x + w / 2, top - h * 0.16);
        g.lineTo(x + w * 0.9, top);
        g.closePath();
        g.fill();
      }

      // windows
      const cols = Math.max(1, Math.floor(w / (width * 0.028)));
      const rows = Math.max(1, Math.floor(h / (height * 0.07)));
      for (let r = 0; r < rows; r++) {
        for (let cI = 0; cI < cols; cI++) {
          if (rnd() > 0.25 + light * 0.6) continue;
          const wx = x + w * 0.16 + cI * ((w * 0.68) / Math.max(1, cols - 1 || 1));
          const wy = top + h * 0.16 + r * ((h * 0.7) / Math.max(1, rows));
          g.fillStyle = li === 2 ? 'rgba(255,200,87,.92)' : 'rgba(255,159,67,.6)';
          g.fillRect(wx, wy, width * 0.008, height * 0.012);
        }
      }
      x += w + width * (0.004 + rnd() * 0.02);
    }
  });
  g.globalAlpha = 1;
  cityCache.set(key, c);
  return c;
}

export { buildCity };

/* ------------------------------ Boss monster ------------------------------ */

/**
 * The Darkness: a billowing cloud body with a crown of smoke lobes, glowing
 * eyes and drifting tendrils. Drawn live (single instance) so it can breathe,
 * flash on hit and shift colour per phase.
 */
export function drawMonster(ctx, x, y, size, {
  t = 0, phase = 1, hitFlash = 0, stunned = false, rage = 0, alpha = 1
} = {}) {
  const breathe = 1 + Math.sin(t * 1.6) * 0.035 + Math.sin(t * 3.1) * 0.012;
  const s = size * breathe;
  const tint = hitFlash > 0 ? hitFlash : 0;

  ctx.save();
  ctx.globalAlpha = alpha;

  // aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glowSprite(stunned ? '255,200,87' : phase >= 3 ? '217,70,166' : '155,93,229'), x, y, s * 2.3, 0, 0.3 + rage * 0.2);
  ctx.restore();

  // tendrils
  ctx.strokeStyle = `rgba(74,42,115,${0.55 * alpha})`;
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const bx = x + i * s * 0.16;
    const sway = Math.sin(t * 2 + i) * s * 0.1;
    ctx.beginPath();
    ctx.moveTo(bx, y + s * 0.2);
    ctx.quadraticCurveTo(bx + sway, y + s * 0.45, bx + sway * 1.6, y + s * 0.62);
    ctx.stroke();
  }

  // body lobes
  const lobes = [
    [0, -0.1, 0.56], [-0.42, 0.04, 0.4], [0.42, 0.04, 0.4],
    [-0.24, -0.34, 0.34], [0.24, -0.34, 0.34], [0, -0.46, 0.28],
    [-0.6, 0.2, 0.26], [0.6, 0.2, 0.26]
  ];
  for (const [ox, oy, r] of lobes) {
    const wob = Math.sin(t * 1.8 + ox * 6 + oy * 3) * 0.02;
    const lx = x + ox * s, ly = y + oy * s, lr = (r + wob) * s;
    const grad = ctx.createRadialGradient(lx - lr * 0.3, ly - lr * 0.35, lr * 0.1, lx, ly, lr);
    const c1 = tint > 0 ? `rgba(${180 + tint * 75},${120 + tint * 100},${220})` : 'rgba(78,44,122,1)';
    grad.addColorStop(0, c1);
    grad.addColorStop(0.55, tint > 0 ? 'rgba(96,52,150,1)' : 'rgba(45,22,78,1)');
    grad.addColorStop(1, 'rgba(18,8,34,0.96)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, TAU);
    ctx.fill();
  }

  // horns for phase 2+
  if (phase >= 2) {
    ctx.fillStyle = 'rgba(28,12,50,.98)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + dir * s * 0.34, y - s * 0.42);
      ctx.quadraticCurveTo(x + dir * s * 0.62, y - s * 0.86, x + dir * s * 0.3, y - s * 0.95);
      ctx.quadraticCurveTo(x + dir * s * 0.42, y - s * 0.66, x + dir * s * 0.2, y - s * 0.52);
      ctx.closePath();
      ctx.fill();
    }
  }

  // eyes
  const eyeY = y - s * 0.12;
  const eyeDx = s * 0.21;
  const eyeColor = stunned ? '255,200,87' : phase >= 3 ? '255,90,160' : '255,159,67';
  const blink = Math.sin(t * 1.3) > 0.985 ? 0.15 : 1;
  for (const dir of [-1, 1]) {
    const ex = x + dir * eyeDx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, glowSprite(eyeColor), ex, eyeY, s * 0.42, 0, 0.85);
    ctx.restore();
    ctx.fillStyle = `rgba(${eyeColor},1)`;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, s * 0.085, s * 0.065 * blink, dir * 0.22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(23,13,43,.92)';
    ctx.beginPath();
    ctx.ellipse(ex + dir * s * 0.012, eyeY, s * 0.028, s * 0.05 * blink, 0, 0, TAU);
    ctx.fill();
  }

  // mouth
  ctx.strokeStyle = `rgba(${stunned ? '255,200,87' : '217,70,166'},.85)`;
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  if (stunned) {
    ctx.arc(x, y + s * 0.18, s * 0.12, 0, Math.PI, false);
  } else {
    ctx.moveTo(x - s * 0.17, y + s * 0.14);
    ctx.quadraticCurveTo(x, y + s * (0.05 + rage * 0.02), x + s * 0.17, y + s * 0.14);
  }
  ctx.stroke();

  if (stunned) {
    // dizzy stars
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i / 3) * TAU;
      drawStar(ctx, x + Math.cos(a) * s * 0.52, y - s * 0.78 + Math.sin(a) * s * 0.12, s * 0.055, '#FFC857');
    }
  }
  ctx.restore();
}

export function drawStar(ctx, x, y, r, color = '#FFC857') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ------------------------------- Weak point ------------------------------- */

export function drawWeakPoint(ctx, x, y, r, { t = 0, golden = false, life = 1 } = {}) {
  const pulse = 1 + Math.sin(t * 7) * 0.09;
  const color = golden ? '255,200,87' : '57,198,176';
  drawGlow(ctx, x, y, r * 2.1 * pulse, color, 0.75);

  ctx.save();
  // rotating ring
  ctx.strokeStyle = `rgba(${color},.95)`;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.setLineDash([r * 0.7, r * 0.5]);
  ctx.lineDashOffset = -t * r * 2.2;
  ctx.beginPath();
  ctx.arc(x, y, r * pulse, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // core
  const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 0.72);
  grad.addColorStop(0, '#FFF8EC');
  grad.addColorStop(0.5, `rgba(${color},.95)`);
  grad.addColorStop(1, `rgba(${color},.25)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72 * pulse, 0, TAU);
  ctx.fill();

  // life ring (how long it stays)
  ctx.strokeStyle = 'rgba(255,248,236,.85)';
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.28, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, life));
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------ Dark energy ------------------------------- */

export function drawDarkOrb(ctx, x, y, r, t = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glowSprite('155,93,229'), x, y, r * 4, 0, 0.5);
  ctx.restore();

  const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, 'rgba(217,70,166,.95)');
  grad.addColorStop(0.5, 'rgba(96,40,150,.95)');
  grad.addColorStop(1, 'rgba(23,13,43,.9)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = 'rgba(217,70,166,.7)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * TAU + t * 2;
    const rr = r * (1.18 + (i % 2 ? 0.1 : -0.04));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

/* --------------------------------- Lamp ----------------------------------- */

/** The guardian lamp the player steers during the boss fight. */
export function drawGuardianLamp(ctx, x, y, size, { t = 0, shielded = false, hurt = 0 } = {}) {
  drawGlow(ctx, x, y - size * 0.1, size * 1.1, hurt > 0 ? '255,90,120' : '255,200,87', 0.55);
  drawDiya(ctx, x, y, size, { golden: true, lit: true, t });
  if (shielded) {
    const pulse = 1 + Math.sin(t * 6) * 0.05;
    ctx.save();
    ctx.strokeStyle = 'rgba(57,198,176,.9)';
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.beginPath();
    ctx.arc(x, y - size * 0.05, size * 0.78 * pulse, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(57,198,176,.12)';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.05, size * 0.78 * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** Clear cached sprites (called on heavy resizes to avoid unbounded growth). */
export function clearArtCache() {
  cityCache.clear();
}
