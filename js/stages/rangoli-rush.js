/**
 * STAGE 2 — RANGOLI RUSH
 * Match the target rangoli. Patterns are generated from real data
 * (petal count, petal shape, colour triplet, dot ring, layer count) and the
 * correct answer is decided by comparing that data — never by appearance luck.
 *
 * Scoring: correct +100 (×combo), all-perfect bonus +100, speed bonus +50.
 */

import { audio } from '../audio.js';
import { Backdrop, popScore } from './common.js';
import { choice, randInt, shuffle, TAU, mulberry32 } from '../core/utils.js';

export const DEF = {
  id: 'rangoli-rush',
  index: 1,
  name: 'RANGOLI RUSH',
  duration: 17,
  missionGoal: 3,
  missionLabel: 'Complete 3 Rangolis',
  icon: 'c-rangoli',
  hint: 'Study the pattern on top, then TAP the tile that matches it exactly.',
  story: 'The festive floor has lost its colours. Redraw the sacred patterns.',
  music: 'play'
};

const PALETTE = ['#FFC857', '#D946A6', '#39C6B0', '#9B5DE5', '#FF9F43', '#8CF0E2'];
const PETAL_COUNTS = [6, 8, 12];
const SHAPES = ['leaf', 'round', 'diamond'];
const ROUNDS = 4;
const POINTS = 100;
const PERFECT_BONUS = 100;
const SPEED_BONUS = 50;
const SPEED_WINDOW = 3.0;

/* ------------------------------ pattern data ------------------------------ */

export function randomSpec() {
  return {
    petals: choice(PETAL_COUNTS),
    shape: choice(SHAPES),
    petal: randInt(0, PALETTE.length - 1),
    inner: randInt(0, PALETTE.length - 1),
    core: randInt(0, PALETTE.length - 1),
    dots: Math.random() < 0.5,
    layers: choice([1, 2])
  };
}

export const specKey = (s) =>
  `${s.petals}|${s.shape}|${s.petal}|${s.inner}|${s.core}|${s.dots ? 1 : 0}|${s.layers}`;

export const specsEqual = (a, b) => specKey(a) === specKey(b);

/** Change `n` attributes so the result is guaranteed visually different. */
export function mutateSpec(spec, n = 1) {
  const out = { ...spec };
  const fields = shuffle(['petals', 'shape', 'petal', 'inner', 'core', 'dots', 'layers']).slice(0, n);
  for (const f of fields) {
    switch (f) {
      case 'petals': out.petals = choice(PETAL_COUNTS.filter((v) => v !== out.petals)); break;
      case 'shape': out.shape = choice(SHAPES.filter((v) => v !== out.shape)); break;
      case 'petal': out.petal = choice(PALETTE.map((_, i) => i).filter((i) => i !== out.petal && i !== out.inner)); break;
      case 'inner': out.inner = choice(PALETTE.map((_, i) => i).filter((i) => i !== out.inner && i !== out.petal)); break;
      case 'core': out.core = choice(PALETTE.map((_, i) => i).filter((i) => i !== out.core)); break;
      case 'dots': out.dots = !out.dots; break;
      case 'layers': out.layers = out.layers === 1 ? 2 : 1; break;
      default: break;
    }
  }
  return out;
}

/** One correct option + 3 guaranteed-distinct decoys. */
export function buildRound(difficulty = 1) {
  const target = randomSpec();
  const seen = new Set([specKey(target)]);
  const options = [target];
  const mutations = difficulty <= 1 ? 3 : difficulty === 2 ? 2 : 2;
  let guard = 0;
  while (options.length < 4 && guard++ < 60) {
    const n = Math.max(1, mutations - (options.length === 3 ? 1 : 0));
    const cand = mutateSpec(target, n);
    const key = specKey(cand);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(cand);
  }
  while (options.length < 4) {
    const cand = randomSpec();
    if (seen.has(specKey(cand))) continue;
    seen.add(specKey(cand));
    options.push(cand);
  }
  return { target, options: shuffle(options) };
}

/* ------------------------------ SVG renderer ------------------------------ */

function petalPath(shape, cy, scale, color) {
  if (shape === 'leaf') return `<ellipse cx="50" cy="${cy}" rx="${(5 * scale).toFixed(2)}" ry="${(12 * scale).toFixed(2)}" fill="${color}"/>`;
  if (shape === 'round') return `<circle cx="50" cy="${cy}" r="${(7.6 * scale).toFixed(2)}" fill="${color}"/>`;
  return `<path d="M50 ${(cy - 11 * scale).toFixed(2)} L${(50 + 7 * scale).toFixed(2)} ${cy} L50 ${(cy + 11 * scale).toFixed(2)} L${(50 - 7 * scale).toFixed(2)} ${cy} Z" fill="${color}"/>`;
}

export function rangoliSVG(spec, { glow = false } = {}) {
  const petalColor = PALETTE[spec.petal];
  const innerColor = PALETTE[spec.inner];
  const coreColor = PALETTE[spec.core];
  let out = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img">`;
  out += `<circle cx="50" cy="50" r="48" fill="#1B0F31"/>`;
  out += `<circle cx="50" cy="50" r="46" fill="none" stroke="${petalColor}" stroke-opacity=".32" stroke-width="1" stroke-dasharray="2.5 3.5"/>`;

  if (spec.dots) {
    let dots = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      dots += `<circle cx="${(50 + Math.cos(a) * 41).toFixed(2)}" cy="${(50 + Math.sin(a) * 41).toFixed(2)}" r="1.7" fill="${coreColor}" opacity=".9"/>`;
    }
    out += dots;
  }

  // outer petal ring
  let ring = '';
  for (let i = 0; i < spec.petals; i++) {
    const a = (360 / spec.petals) * i;
    ring += `<g transform="rotate(${a.toFixed(2)} 50 50)">${petalPath(spec.shape, 22, 1, petalColor)}</g>`;
  }
  out += ring;

  // second, offset ring
  if (spec.layers === 2) {
    let ring2 = '';
    const half = 360 / spec.petals / 2;
    for (let i = 0; i < spec.petals; i++) {
      const a = (360 / spec.petals) * i + half;
      ring2 += `<g transform="rotate(${a.toFixed(2)} 50 50)">${petalPath(spec.shape, 33, 0.62, innerColor)}</g>`;
    }
    out += ring2;
  }

  out += `<circle cx="50" cy="50" r="12" fill="${innerColor}" opacity=".9"/>`;
  out += `<circle cx="50" cy="50" r="7" fill="${coreColor}"/>`;
  out += `<circle cx="50" cy="50" r="3" fill="#FFF8EC" opacity=".85"/>`;
  if (glow) out += `<circle cx="50" cy="50" r="47" fill="none" stroke="#39C6B0" stroke-width="2" opacity=".8"/>`;
  out += `</svg>`;
  return out;
}

/* --------------------------------- stage --------------------------------- */

const floorBackdrop = new Backdrop((g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1C0F33');
  grad.addColorStop(0.5, '#2E1450');
  grad.addColorStop(1, '#451C5E');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(31);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 3;
    g.fillStyle = `rgba(255,200,87,${0.05 + rnd() * 0.12})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // tiled floor lines
  g.strokeStyle = 'rgba(255,248,236,.05)';
  g.lineWidth = 1;
  for (let i = -6; i < 12; i++) {
    g.beginPath();
    g.moveTo((i * w) / 6, 0);
    g.lineTo((i * w) / 6 + w * 0.3, h);
    g.stroke();
  }
});

export class RangoliRush {
  constructor(state) {
    this.state = state;
    this.round = 0;
    this.correct = 0;
    this.wrong = 0;
    this.locked = false;
    this.roundStart = 0;
    this.speedBonuses = 0;
    this.els = {};
  }

  init(engine) {
    this.engine = engine;
    this.round = 0;
    this.correct = 0;
    this.wrong = 0;
    this.locked = false;
    this.speedBonuses = 0;

    const root = document.createElement('div');
    root.className = 'rangoli';
    root.innerHTML = `
      <div class="rangoli__prompt">
        <p class="rangoli__label">MATCH THIS RANGOLI</p>
        <div class="rangoli__target" id="rg-target"></div>
        <div class="rangoli__rounds" id="rg-rounds">${Array.from({ length: ROUNDS }, () => '<i></i>').join('')}</div>
      </div>
      <div class="rangoli__options" id="rg-options"></div>
      <div class="rangoli__feedback" id="rg-feedback"></div>`;
    engine.domLayer.appendChild(root);

    this.els.root = root;
    this.els.target = root.querySelector('#rg-target');
    this.els.options = root.querySelector('#rg-options');
    this.els.rounds = Array.from(root.querySelectorAll('#rg-rounds i'));
    this.els.feedback = root.querySelector('#rg-feedback');

    this._nextRound();
  }

  _nextRound() {
    if (this.round >= ROUNDS) {
      this._finish();
      return;
    }
    const difficulty = this.round === 0 ? 1 : this.round === 1 ? 2 : 3;
    const { target, options } = buildRound(difficulty);
    this.current = target;
    this.locked = false;
    this.roundStart = this.engine ? this.engine.stageTime : 0;
    this.isBonus = this.round === ROUNDS - 1;

    this.els.target.innerHTML = rangoliSVG(target);
    this.els.target.classList.toggle('is-bonus', this.isBonus);
    this.els.target.style.animation = 'none';
    void this.els.target.offsetWidth;
    this.els.target.style.animation = '';

    this.els.options.innerHTML = '';
    options.forEach((spec) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rtile';
      btn.dataset.spec = specKey(spec);   // also makes the stage inspectable in QA
      btn.setAttribute('aria-label', 'Rangoli option');
      btn.innerHTML = `${rangoliSVG(spec)}<span class="rtile__ring"></span>`;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._choose(spec, btn);
      });
      this.els.options.appendChild(btn);
    });

    this.els.rounds.forEach((dot, i) => {
      dot.classList.toggle('is-now', i === this.round);
    });

    this.els.label = this.els.root.querySelector('.rangoli__label');
    if (this.els.label) {
      this.els.label.textContent = this.isBonus ? 'BONUS ROUND — BE QUICK!' : 'MATCH THIS RANGOLI';
      this.els.label.style.color = this.isBonus ? 'var(--magenta)' : 'var(--gold)';
    }
  }

  _flash(text, miss = false) {
    const el = this.els.feedback;
    el.textContent = text;
    el.classList.toggle('is-miss', miss);
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  _choose(spec, btn) {
    if (this.locked) return;
    const isMatch = specsEqual(spec, this.current);
    const rect = btn.getBoundingClientRect();
    const host = this.engine.canvas.getBoundingClientRect();
    const cx = rect.left - host.left + rect.width / 2;
    const cy = rect.top - host.top + rect.height / 2;

    if (!isMatch) {
      this.wrong += 1;
      this.state.bumpStat('wrong');
      this.state.breakCombo();
      btn.classList.add('is-wrong', 'is-dim');
      this._flash('NOT THIS ONE', true);
      audio.play('wrong');
      this.engine.fx.burst(cx, cy, { count: 10, color: '217,70,166', speed: 120, spread: TAU, size: 2.6, life: 0.4, gravity: 180 });
      this.engine.fx.shake(4);
      return;
    }

    this.locked = true;
    this.correct += 1;
    const info = this.state.registerHit();
    const pts = this.state.award(POINTS, { x: cx, y: cy, kind: 'rangoli' });
    this.state.addMissionProgress(1);
    this.state.setStat('correct', this.correct);
    this.state.setStat('rounds', ROUNDS);
    this.state.setStat('wrong', this.wrong);

    btn.classList.add('is-correct');
    Array.from(this.els.options.children).forEach((el) => { if (el !== btn) el.classList.add('is-dim'); });
    this.els.target.innerHTML = rangoliSVG(this.current, { glow: true });

    this._flash('PERFECT MATCH!');
    audio.play('match');
    popScore(this.engine, pts, cx, cy - 10, { level: info.level });
    this.engine.fx.firework(cx, cy, '57,198,176', 0.8);
    this.engine.fx.ring(cx, cy, { color: '255,200,87', r0: 10, r1: 150, life: 0.6, width: 3 });

    // Bonus round speed reward
    const elapsed = this.engine.stageTime - this.roundStart;
    if (this.isBonus && elapsed <= SPEED_WINDOW) {
      this.speedBonuses += 1;
      const bonus = this.state.award(SPEED_BONUS, { combo: false, kind: 'bonus' });
      this.engine.fx.floatText(this.engine.W / 2, this.engine.H * 0.52, `SPEED BONUS +${bonus}`, { color: '#FFC857', size: 22, life: 1.1 });
      audio.play('coin');
    }

    this.els.rounds[this.round]?.classList.remove('is-now');
    this.els.rounds[this.round]?.classList.add('is-done');
    this.round += 1;

    this._timer = setTimeout(() => this._nextRound(), 760);
  }

  _finish() {
    const perfect = this.correct === ROUNDS && this.wrong === 0;
    if (perfect) {
      const bonus = this.state.award(PERFECT_BONUS, { combo: false, kind: 'bonus' });
      this.engine.fx.floatText(this.engine.W / 2, this.engine.H * 0.45, `FLAWLESS +${bonus}`, { color: '#FFC857', size: 26, life: 1.3 });
      this.engine.fx.confetti(this.engine.W, this.engine.H, 30);
      audio.play('achievement');
    }
    this.state.setStat('correct', this.correct);
    this.state.setStat('rounds', ROUNDS);
    this.state.setStat('wrong', this.wrong);
    this.state.setStat('perfect', perfect);
    setTimeout(() => this.engine.finishStage('early'), perfect ? 900 : 420);
  }

  update(dt, engine) {
    // Bonus-round urgency: tint the target while the speed window is open.
    if (this.isBonus && !this.locked && this.els.target) {
      const left = Math.max(0, SPEED_WINDOW - (engine.stageTime - this.roundStart));
      this.els.target.style.filter = left > 0
        ? `drop-shadow(0 0 ${14 + left * 6}px rgba(217,70,166,.75))`
        : 'drop-shadow(0 0 10px rgba(185,169,207,.35))';
    }
  }

  draw(ctx, engine) {
    floorBackdrop.draw(ctx, engine);
  }

  summary() {
    return { correct: this.correct, wrong: this.wrong, rounds: ROUNDS, speedBonuses: this.speedBonuses };
  }

  destroy() {
    clearTimeout(this._timer);
    this.els = {};
  }
}
