/**
 * STAGE 3 — FIREWORK FRENZY
 * Tap climbing rockets before they leave the sky. Golden rockets pay double,
 * dark duds must be left alone.
 *
 * Scoring: rocket +20, golden +50, dud −20 (combo reset).
 */

import { audio } from '../audio.js';
import { drawRocket } from '../core/art.js';
import { nightSkyBackdrop, popScore, drawVignette } from './common.js';
import { rand, hitCircle, clamp, TAU } from '../core/utils.js';

export const DEF = {
  id: 'firework-frenzy',
  index: 2,
  name: 'FIREWORK FRENZY',
  duration: 15,
  missionGoal: 12,
  missionLabel: 'Hit 12 fireworks',
  icon: 'c-spark',
  hint: 'TAP the rockets as they climb. Dark duds with a cross cost you points.',
  story: 'Paint the Diwalipur sky — but watch out for the duds.',
  music: 'play'
};

const COLORS = {
  normal: '255,159,67',
  gold: '255,200,87',
  teal: '57,198,176',
  magenta: '217,70,166',
  dud: '155,93,229'
};

export class FireworkFrenzy {
  constructor(state) {
    this.state = state;
    this.rockets = [];
    this.spawnTimer = 0.25;
    this.hits = 0;
    this.golden = 0;
    this.duds = 0;
    this.streak = 0;
    this.bestStreak = 0;
  }

  init(engine) {
    this.rockets.length = 0;
    this.spawnTimer = 0.2;
    this.hits = this.golden = this.duds = this.streak = this.bestStreak = 0;
    this.size = clamp(Math.min(engine.W, engine.H) * 0.15, 44, 80);
    this.trailTimer = 0;
  }

  resize(engine) {
    this.size = clamp(Math.min(engine.W, engine.H) * 0.15, 44, 80);
  }

  _spawn(engine) {
    const r = Math.random();
    const variant = r < 0.12 ? 'dud'
      : r < 0.3 ? 'gold'
        : r < 0.46 ? 'teal'
          : r < 0.62 ? 'magenta' : 'normal';
    const margin = this.size * 0.75;
    this.rockets.push({
      x: rand(margin, engine.W - margin),
      y: engine.H + this.size * 0.6,
      vy: -rand(engine.H * 0.3, engine.H * 0.42) * (1 + engine.stageTime / engine.duration * 0.35),
      drift: rand(-26, 26),
      variant,
      size: this.size * (variant === 'gold' ? 1.08 : 1),
      wob: rand(0, TAU),
      alive: true,
      age: 0
    });
  }

  update(dt, engine) {
    const progress = engine.stageTime / engine.duration;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(engine);
      if (progress > 0.4 && Math.random() < 0.28) this._spawn(engine);
      this.spawnTimer = rand(0.62, 0.84) - progress * 0.18;
    }

    this.trailTimer -= dt;
    const emitTrail = this.trailTimer <= 0;
    if (emitTrail) this.trailTimer = 0.035;

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      r.y += r.vy * dt;
      r.x += Math.sin(engine.time * 2.2 + r.wob) * r.drift * dt;

      if (emitTrail) {
        engine.fx.burst(r.x, r.y + r.size * 0.34, {
          count: 2,
          color: COLORS[r.variant],
          speed: 26,
          spread: 1.1,
          angle: Math.PI / 2,
          size: 1.9,
          life: 0.34,
          gravity: 40
        });
      }

      // escaped the top — fizzles out, no penalty (keeps the stage friendly)
      if (r.y < -r.size) {
        this.rockets.splice(i, 1);
        if (r.variant !== 'dud') {
          engine.fx.burst(r.x, 6, { count: 5, color: '185,169,207', speed: 60, spread: TAU, size: 1.8, life: 0.4, gravity: 90 });
        }
      }
    }
  }

  pointerDown(x, y, engine) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      if (!hitCircle(x, y, r.x, r.y, r.size * 0.46, 32)) continue;
      this.rockets.splice(i, 1);

      if (r.variant === 'dud') {
        this.duds += 1;
        this.streak = 0;
        this.state.bumpStat('duds');
        const pts = this.state.award(-20, { combo: false, x: r.x, y: r.y, kind: 'penalty' });
        this.state.breakCombo();
        popScore(engine, pts, r.x, r.y);
        engine.fx.burst(r.x, r.y, { count: 18, color: COLORS.dud, speed: 150, spread: TAU, size: 3, life: 0.55, gravity: 220 });
        engine.fx.shake(7);
        audio.play('penalty');
        return;
      }

      const golden = r.variant === 'gold';
      const info = this.state.registerHit();
      const pts = this.state.award(golden ? 50 : 20, { x: r.x, y: r.y, kind: golden ? 'golden' : 'rocket' });
      this.state.addMissionProgress(1);
      this.hits += 1;
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      if (golden) this.golden += 1;
      this.state.setStat('hits', this.hits);
      this.state.setStat('golden', this.golden);
      this.state.setStat('bestStreak', this.bestStreak);

      popScore(engine, pts, r.x, r.y, { level: info.level });
      engine.fx.firework(r.x, r.y, COLORS[r.variant], golden ? 1.35 : 1);
      if (golden) engine.fx.firework(r.x, r.y, '255,248,236', 0.7);
      audio.play('firework');
      if (golden) audio.play('golden');
      if (info.level >= 2) engine.fx.shake(3 + info.level * 1.6);
      return;
    }
  }

  key(e) {
    if ((e.key === ' ' || e.key === 'Enter') && this._engine) {
      // Keyboard assist: pop the highest safe rocket.
      const target = this.rockets
        .filter((r) => r.variant !== 'dud')
        .sort((a, b) => a.y - b.y)[0];
      if (target) this.pointerDown(target.x, target.y, this._engine);
    }
  }

  draw(ctx, engine) {
    this._engine = engine;
    nightSkyBackdrop.draw(ctx, engine);

    for (const r of this.rockets) {
      const appear = Math.min(1, r.age / 0.18);
      drawRocket(ctx, r.x, r.y, r.size * appear, {
        variant: r.variant,
        t: engine.time,
        wobble: Math.sin(engine.time * 3 + r.wob) * 0.08
      });
    }

    drawVignette(ctx, engine, 0.4);
  }

  summary() {
    return { hits: this.hits, golden: this.golden, duds: this.duds, bestStreak: this.bestStreak };
  }

  destroy() { this.rockets.length = 0; }
}
