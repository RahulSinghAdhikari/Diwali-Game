/**
 * SHARING — WhatsApp challenge links, native share (with image when the
 * browser supports it), clipboard copy and a Canvas-rendered share card.
 *
 * The game URL always comes from the real deployment (config.gameUrl()),
 * never a hardcoded placeholder.
 */

import { CONFIG, gameUrl } from './config.js';
import { sanitizeName, formatInt, TAU } from './core/utils.js';
import { drawDiya, drawGlow } from './core/art.js';

/* ------------------------------ challenge URL ----------------------------- */

export function challengeUrl(name, score) {
  const base = gameUrl();
  if (!base) return '';
  try {
    const url = new URL(base);
    url.searchParams.set('c', sanitizeName(name, CONFIG.maxNameLength) || 'A friend');
    url.searchParams.set('s', String(Math.max(0, Math.floor(score))));
    return url.toString();
  } catch {
    return base;
  }
}

/** Reads an incoming challenge from the URL (never treated as a global record). */
export function parseChallenge(search = (typeof location !== 'undefined' ? location.search : '')) {
  const params = new URLSearchParams(search);
  const rawName = params.get('c') ?? params.get('challenger') ?? '';
  const rawScore = params.get('s') ?? params.get('score') ?? '';
  const name = sanitizeName(rawName, CONFIG.maxNameLength);
  const score = Number.parseInt(rawScore, 10);
  if (!name || !Number.isFinite(score) || score <= 0) return null;
  return { name, score: Math.min(9_999_999, score) };
}

/* ------------------------------- share text ------------------------------- */

export function buildShareText({ score, title, name }) {
  const url = challengeUrl(name || 'A friend', score);
  const who = name ? ` — ${name}` : '';
  const lines = [
    `🪔 I just scored ${formatInt(score)} in Diwali Dhamaka!${who}`,
    '',
    `I restored the magic of Diwalipur and became a ${title}.`,
    '',
    'Think you can beat me?',
    ''
  ];
  if (url) lines.push(`Play here: ${url}`);
  return lines.join('\n');
}

/* --------------------------------- actions -------------------------------- */

export function shareWhatsApp(text) {
  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const win = window.open(href, '_blank', 'noopener,noreferrer');
  if (!win) location.href = href;      // popup blocked → navigate instead
  return true;
}

export function canNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function nativeShare({ text, title = 'Diwali Dhamaka', canvas }) {
  if (!canNativeShare()) return { ok: false, reason: 'unsupported' };
  const data = { title, text };
  if (canvas && typeof navigator.canShare === 'function') {
    try {
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], 'diwali-dhamaka-score.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) data.files = [file];
    } catch { /* fall back to text-only */ }
  }
  try {
    await navigator.share(data);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'cancelled' : 'failed' };
  }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export async function downloadCard(canvas, filename = 'diwali-dhamaka-score.png') {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/* ------------------------------- share card ------------------------------- */

function spacedText(ctx, text, x, y, spacing) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, cx + widths[i] / 2, y);
    cx += widths[i] + spacing;
  });
}

function trophy(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  drawGlow(ctx, 0, 0, s * 1.3, '255,200,87', 0.75);

  const grad = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.6);
  grad.addColorStop(0, '#FFE9A8');
  grad.addColorStop(0.45, '#FFC857');
  grad.addColorStop(1, '#E0890F');

  // cup
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.6);
  ctx.lineTo(s * 0.42, -s * 0.6);
  ctx.lineTo(s * 0.33, -s * 0.02);
  ctx.quadraticCurveTo(0, s * 0.3, -s * 0.33, -s * 0.02);
  ctx.closePath();
  ctx.fill();

  // handles
  ctx.lineWidth = s * 0.09;
  ctx.strokeStyle = '#FFC857';
  ctx.beginPath();
  ctx.arc(-s * 0.52, -s * 0.36, s * 0.2, Math.PI * 0.4, Math.PI * 1.6, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.52, -s * 0.36, s * 0.2, Math.PI * 1.4, Math.PI * 0.6, true);
  ctx.stroke();

  // stem + base
  ctx.fillStyle = '#F97316';
  ctx.fillRect(-s * 0.1, s * 0.22, s * 0.2, s * 0.2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-s * 0.38, s * 0.4, s * 0.76, s * 0.16, s * 0.06);
  ctx.fill();

  // star
  ctx.fillStyle = 'rgba(255,248,236,.85)';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? s * 0.17 : s * 0.075;
    const px = Math.cos(a) * r;
    const py = -s * 0.3 + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders the shareable score card (1080×1350) onto `canvas`.
 * Waits for webfonts so the typography matches the game.
 */
export async function renderShareCard(canvas, { score, title, name, collectibles = 0, achievements = 0, combo = 0 }) {
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#170D2B');
  bg.addColorStop(0.55, '#2A1248');
  bg.addColorStop(1, '#35165C');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const warm = ctx.createRadialGradient(W / 2, H * 0.82, 20, W / 2, H * 0.82, W * 0.95);
  warm.addColorStop(0, 'rgba(249,115,22,.28)');
  warm.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);

  // stars + confetti specks
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.8;
    const r = Math.random() * 3 + 0.6;
    ctx.fillStyle = `rgba(255,248,236,${0.08 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  const confettiColors = ['#FFC857', '#D946A6', '#39C6B0', '#9B5DE5', '#FF9F43'];
  for (let i = 0; i < 46; i++) {
    ctx.save();
    ctx.translate(Math.random() * W, Math.random() * H * 0.9);
    ctx.rotate(Math.random() * TAU);
    ctx.globalAlpha = 0.5 + Math.random() * 0.4;
    ctx.fillStyle = confettiColors[i % confettiColors.length];
    ctx.fillRect(0, 0, 18, 7);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // frame
  ctx.strokeStyle = 'rgba(255,200,87,.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(36, 36, W - 72, H - 72, 44);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,87,.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(54, 54, W - 108, H - 108, 34);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // wordmark
  ctx.font = '900 92px Outfit, system-ui, sans-serif';
  const titleGrad = ctx.createLinearGradient(0, 130, 0, 215);
  titleGrad.addColorStop(0, '#FFF8EC');
  titleGrad.addColorStop(0.55, '#FFC857');
  titleGrad.addColorStop(1, '#F97316');
  ctx.fillStyle = titleGrad;
  ctx.fillText('DIWALI DHAMAKA', W / 2, 178);

  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(185,169,207,1)';
  spacedText(ctx, 'THE FESTIVAL QUEST', W / 2, 238, 11);

  // trophy
  trophy(ctx, W / 2, 430, 180);

  // score
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(185,169,207,1)';
  spacedText(ctx, 'PLAYER SCORE', W / 2, 606, 9);

  ctx.font = '900 190px Outfit, system-ui, sans-serif';
  const scoreGrad = ctx.createLinearGradient(0, 640, 0, 790);
  scoreGrad.addColorStop(0, '#FFF8EC');
  scoreGrad.addColorStop(0.6, '#FFC857');
  scoreGrad.addColorStop(1, '#F97316');
  ctx.fillStyle = scoreGrad;
  ctx.fillText(formatInt(score), W / 2, 730);

  // title badge
  const badgeText = title.toUpperCase();
  ctx.font = '800 42px Outfit, system-ui, sans-serif';
  const bw = Math.min(W - 180, ctx.measureText(badgeText).width + 110);
  const bx = (W - bw) / 2;
  const by = 836;
  const badgeGrad = ctx.createLinearGradient(bx, by, bx + bw, by + 92);
  badgeGrad.addColorStop(0, 'rgba(255,200,87,.3)');
  badgeGrad.addColorStop(1, 'rgba(217,70,166,.3)');
  ctx.fillStyle = badgeGrad;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 92, 46);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,87,.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#FFC857';
  ctx.fillText(badgeText, W / 2, by + 48);

  // player name
  if (name) {
    ctx.font = '700 40px Outfit, system-ui, sans-serif';
    ctx.fillStyle = '#FFF8EC';
    const label = `— ${name} —`;
    ctx.fillText(label.length > 30 ? `${label.slice(0, 29)}…` : label, W / 2, 968);
  }

  // stat chips
  const chips = [
    ['BEST COMBO', `×${combo || 1}`],
    ['COLLECTIBLES', `${collectibles}/4`],
    ['BADGES', `${achievements}`]
  ];
  const chipW = 260;
  const gap = 24;
  const totalW = chips.length * chipW + (chips.length - 1) * gap;
  let cx = (W - totalW) / 2;
  const cy = name ? 1022 : 990;
  chips.forEach(([k, v]) => {
    ctx.fillStyle = 'rgba(255,248,236,.06)';
    ctx.beginPath();
    ctx.roundRect(cx, cy, chipW, 96, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,169,207,.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(185,169,207,1)';
    ctx.fillText(k, cx + chipW / 2, cy + 32);
    ctx.font = '800 38px Outfit, system-ui, sans-serif';
    ctx.fillStyle = '#FFF8EC';
    ctx.fillText(v, cx + chipW / 2, cy + 68);
    cx += chipW + gap;
  });

  // challenge line
  ctx.font = '800 46px Outfit, system-ui, sans-serif';
  ctx.fillStyle = '#FFF8EC';
  ctx.fillText('Think you can beat my score?', W / 2, 1186);

  // diyas
  for (let i = 0; i < 5; i++) {
    const x = W / 2 + (i - 2) * 118;
    drawDiya(ctx, x, 1268, 86, { lit: true, golden: i === 2, t: i * 0.7 });
  }

  // url
  const url = gameUrl();
  if (url) {
    ctx.font = '600 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(185,169,207,.9)';
    const pretty = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillText(pretty.length > 54 ? `${pretty.slice(0, 53)}…` : pretty, W / 2, 1316);
  }

  return canvas;
}
