/**
 * STAGE 1 — LIGHT RUSH
 * Tap unlit diyas before they fade. Golden diyas pay more, dark wisps punish.
 *
 * Scoring: diya +10, golden +25, wisp −15 (combo reset). Missing costs nothing,
 * which keeps the very first stage friendly for first-time players.
 */

import { audio } from '../audio.js';
import { drawDiya, drawWisp, drawGlow } from '../core/art.js';
import { courtyardBackdrop, popScore, hitSplash, ambientEmbers, drawVignette } from './common.js';
import { rand, randInt, hitCircle, clamp, easeOutBack, TAU } from '../core/utils.js';

export const DEF = {
  id: 'light-rush',
  index: 0,
  name: 'LIGHT RUSH',
  duration: 15,
  missionGoal: 15,
  missionLabel: 'Light 15 diyas',
  icon: 'i-diya',
  hint: 'TAP the unlit diyas. Golden ones are worth more — never tap the dark wisps.',
  story: 'The courtyard of Diwalipur has gone cold. Bring its diyas back to life.',
  music: 'play'
};

const BASE = 10;
const GOLDEN = 25;
const PENALTY = -15;

export class LightRush {
  constructor(state) {
    this.state = state;
    this.diyas = [];
    this.wisps = [];
    this.spawnTimer = 0.35;
    this.wispTimer = 2.6;
    this.lit = 0;
    this.golden = 0;
    this.missed = 0;
    this.wispHits = 0;
  }

  init(engine) {
    this.diyas.length = 0;
    this.wisps.length = 0;
    this.spawnTimer = 0.3;
    this.wispTimer = 2.8;
    this.size = clamp(Math.min(engine.W, engine.H) * 0.17, 46, 86);
  }

  resize(engine) {
    this.size = clamp(Math.min(engine.W, engine.H) * 0.17, 46, 86);
  }

  /* ------------------------------- spawning ------------------------------ */

  _freeSpot(engine, radius) {
    const mx = radius * 0.9;
    const top = engine.H * 0.16;
    const bottom = engine.H * 0.92 - radius * 0.4;
    let best = null;
    let bestDist = -1;
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = rand(mx, engine.W - mx);
      const y = rand(top, bottom);
      let nearest = Infinity;
      for (const d of this.diyas) {
        if (d.dead) continue;
        nearest = Math.min(nearest, Math.hypot(d.x - x, d.y - y));
      }
      for (const wsp of this.wisps) {
        nearest = Math.min(nearest, Math.hypot(wsp.x - x, wsp.y - y));
      }
      if (nearest > radius * 1.85) return { x, y };
      if (nearest > bestDist) { bestDist = nearest; best = { x, y }; }
    }
    return best;
  }

  _spawnDiya(engine) {
    const spot = this._freeSpot(engine, this.size);
    if (!spot) return;
    const golden = Math.random() < 0.22;
    this.diyas.push({
      x: spot.x,
      y: spot.y,
      size: this.size * (golden ? 1.05 : rand(0.92, 1.06)),
      golden,
      lit: false,
      dead: false,
      age: 0,
      ignite: 0,
      life: golden ? rand(1.45, 1.75) : rand(1.9, 2.5),
      bob: rand(0, TAU),
      fade: 1
    });
  }

  _spawnWisp(engine) {
    const spot = this._freeSpot(engine, this.size);
    if (!spot) return;
    this.wisps.push({
      x: spot.x,
      y: spot.y,
      size: this.size * 0.92,
      age: 0,
      life: rand(1.9, 2.6),
      vx: rand(-26, 26),
      vy: rand(-16, 16),
      dead: false
    });
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, engine) {
    const progress = engine.stageTime / engine.duration;

    // Spawn cadence tightens as the stage goes on (~22 diyas over 15s).
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnDiya(engine);
      if (progress > 0.45 && Math.random() < 0.3) this._spawnDiya(engine);
      this.spawnTimer = rand(0.68, 0.86) - progress * 0.22;
    }

    this.wispTimer -= dt;
    if (this.wispTimer <= 0) {
      this._spawnWisp(engine);
      this.wispTimer = rand(2.4, 3.6) - progress * 0.6;
    }

    for (let i = this.diyas.length - 1; i >= 0; i--) {
      const d = this.diyas[i];
      d.age += dt;
      if (d.lit) {
        d.ignite = Math.min(1, d.ignite + dt * 5);
        d.fade = Math.max(0, 1 - Math.max(0, d.age - d.litAt - 1.1) / 0.5);
        if (d.fade <= 0) this.diyas.splice(i, 1);
      } else {
        if (d.age > d.life) {
          d.fade -= dt * 3.4;
          if (d.fade <= 0) {
            this.diyas.splice(i, 1);
            this.missed += 1;
            this.state.bumpStat('missed');
          }
        }
      }
    }

    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.age += dt;
      w.x = clamp(w.x + w.vx * dt, this.size * 0.5, engine.W - this.size * 0.5);
      w.y = clamp(w.y + w.vy * dt, engine.H * 0.16, engine.H * 0.9);
      if (w.age > w.life) {
        w.fadeOut = (w.fadeOut ?? 1) - dt * 3;
        if (w.fadeOut <= 0) this.wisps.splice(i, 1);
      }
    }

    ambientEmbers(engine, dt, 2.2);
  }

  /* --------------------------------- input ------------------------------- */

  pointerDown(x, y, engine) {
    // Wisps first — they sit "in front" visually.
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      if (hitCircle(x, y, w.x, w.y, w.size * 0.42, 28)) {
        this.wisps.splice(i, 1);
        this.wispHits += 1;
        this.state.bumpStat('wispHits');
        const pts = this.state.award(PENALTY, { combo: false, x: w.x, y: w.y, kind: 'penalty' });
        this.state.breakCombo();
        popScore(engine, pts, w.x, w.y);
        engine.fx.burst(w.x, w.y, { count: 16, color: '155,93,229', speed: 140, spread: TAU, size: 3, life: 0.5, gravity: 60 });
        engine.fx.shake(6);
        audio.play('penalty');
        return;
      }
    }

    for (let i = this.diyas.length - 1; i >= 0; i--) {
      const d = this.diyas[i];
      if (d.lit) continue;
      if (!hitCircle(x, y, d.x, d.y, d.size * 0.5, 30)) continue;

      d.lit = true;
      d.litAt = d.age;
      d.ignite = 0.05;
      d.fade = 1;

      const info = this.state.registerHit();
      const pts = this.state.award(d.golden ? GOLDEN : BASE, { x: d.x, y: d.y, kind: d.golden ? 'golden' : 'diya' });
      this.state.addMissionProgress(1);
      this.lit += 1;
      if (d.golden) this.golden += 1;
      this.state.setStat('lit', this.lit);
      this.state.setStat('golden', this.golden);

      popScore(engine, pts, d.x, d.y, { level: info.level });
      hitSplash(engine, d.x, d.y - d.size * 0.1, d.golden ? '255,215,120' : '255,159,67', d.golden ? 1.35 : 1);
      if (d.golden) engine.fx.ring(d.x, d.y, { color: '255,200,87', r0: 8, r1: 90, life: 0.5, width: 3 });
      audio.play(d.golden ? 'golden' : 'diya', { step: Math.min(10, this.state.combo) });
      return;
    }
  }

  key(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      // Keyboard assist: light the oldest unlit diya on screen.
      const target = this.diyas.find((d) => !d.lit);
      if (target) this.pointerDown(target.x, target.y, this._engine);
    }
  }

  /* --------------------------------- draw -------------------------------- */

  draw(ctx, engine) {
    this._engine = engine;
    courtyardBackdrop.draw(ctx, engine);

    // The courtyard warms up as the player lights more diyas.
    const warmth = clamp(this.lit / Math.max(1, DEF.missionGoal), 0, 1.25);
    if (warmth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(engine.cx, engine.H * 0.95, 10, engine.cx, engine.H * 0.95, engine.H * 0.85);
      g.addColorStop(0, `rgba(255,159,67,${0.18 * warmth})`);
      g.addColorStop(1, 'rgba(255,159,67,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, engine.W, engine.H);
      ctx.restore();
    }

    const t = engine.time;

    for (const w of this.wisps) {
      const appear = Math.min(1, w.age / 0.3);
      drawWisp(ctx, w.x, w.y, w.size * easeOutBack(appear), t, (w.fadeOut ?? 1) * appear);
    }

    for (const d of this.diyas) {
      const appear = Math.min(1, d.age / 0.26);
      const scale = easeOutBack(appear);
      const bob = Math.sin(t * 2.4 + d.bob) * d.size * 0.03;
      if (!d.lit) {
        // subtle pulse ring so unlit targets are easy to find
        const pulse = (Math.sin(t * 4 + d.bob) + 1) / 2;
        ctx.save();
        ctx.globalAlpha = 0.16 + pulse * 0.2 * d.fade;
        ctx.strokeStyle = d.golden ? 'rgba(255,200,87,1)' : 'rgba(185,169,207,1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(d.x, d.y + bob, d.size * (0.5 + pulse * 0.08), 0, TAU);
        ctx.stroke();
        ctx.restore();
        if (d.golden) drawGlow(ctx, d.x, d.y + bob, d.size * 0.6, '255,200,87', 0.25 * d.fade);
      }
      drawDiya(ctx, d.x, d.y + bob, d.size * scale, {
        golden: d.golden,
        lit: d.lit,
        t: t + d.bob,
        ignite: d.ignite,
        alpha: d.fade
      });
    }

    drawVignette(ctx, engine, 0.45);
  }

  summary() {
    return { lit: this.lit, golden: this.golden, missed: this.missed, wispHits: this.wispHits };
  }

  destroy() {
    this.diyas.length = 0;
    this.wisps.length = 0;
  }
}
