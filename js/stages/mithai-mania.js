/**
 * STAGE 4 — MITHAI MANIA
 * Steer the festive basket and catch falling sweets; dodge the empty boxes.
 * Drag anywhere on the playfield (touch / mouse / stylus) or use ← → / A D.
 *
 * Scoring: laddoo +10, jalebi +15, barfi +20, golden +50, empty box −15.
 */

import { audio } from '../audio.js';
import { drawSweet, drawBasket } from '../core/art.js';
import { marketBackdrop, popScore, drawVignette } from './common.js';
import { rand, clamp, lerp, TAU } from '../core/utils.js';

export const DEF = {
  id: 'mithai-mania',
  index: 3,
  name: 'MITHAI MANIA',
  duration: 15,
  missionGoal: 20,
  missionLabel: 'Collect 20 sweets',
  icon: 'c-mithai',
  hint: 'DRAG to move the basket (or use ← →). Catch the sweets, dodge empty boxes.',
  story: 'The sweet shops are overflowing — catch the mithai before it falls!',
  music: 'play'
};

const KINDS = [
  { kind: 'laddoo', points: 10, weight: 0.34, color: '255,200,87' },
  { kind: 'jalebi', points: 15, weight: 0.24, color: '255,159,67' },
  { kind: 'barfi', points: 20, weight: 0.18, color: '255,248,236' },
  { kind: 'golden', points: 50, weight: 0.07, color: '255,215,120' },
  { kind: 'bad', points: -15, weight: 0.17, color: '155,93,229' }
];

function pickKind() {
  let r = Math.random();
  for (const k of KINDS) {
    if (r < k.weight) return k;
    r -= k.weight;
  }
  return KINDS[0];
}

export class MithaiMania {
  constructor(state) {
    this.state = state;
    this.items = [];
    this.sweets = 0;
    this.golden = 0;
    this.bad = 0;
    this.squash = 0;
    this.spawnTimer = 0.3;
  }

  init(engine) {
    this.items.length = 0;
    this.sweets = this.golden = this.bad = 0;
    this.spawnTimer = 0.25;
    this.basketW = clamp(engine.W * 0.26, 76, 132);
    this.basketX = engine.W / 2;
    this.targetX = engine.W / 2;
    this.basketY = engine.H - this.basketW * 0.42;
    this.itemSize = clamp(Math.min(engine.W, engine.H) * 0.12, 36, 62);
    this.squash = 0;
    this.hurt = 0;
  }

  resize(engine) {
    this.basketW = clamp(engine.W * 0.26, 76, 132);
    this.basketY = engine.H - this.basketW * 0.42;
    this.itemSize = clamp(Math.min(engine.W, engine.H) * 0.12, 36, 62);
    this.basketX = clamp(this.basketX, this.basketW * 0.5, engine.W - this.basketW * 0.5);
    this.targetX = this.basketX;
  }

  pointerDown(x) { this.targetX = x; }
  pointerMove(x, _y, engine) { if (engine.pointer.down) this.targetX = x; }

  key(e) {
    const step = this.basketW * 0.75;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.targetX -= step;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.targetX += step;
  }

  _spawn(engine) {
    const k = pickKind();
    const margin = this.itemSize * 0.7;
    this.items.push({
      ...k,
      x: rand(margin, engine.W - margin),
      y: -this.itemSize * 0.6,
      vy: rand(engine.H * 0.38, engine.H * 0.52) * (1 + (engine.stageTime / engine.duration) * 0.45),
      vx: rand(-20, 20),
      rot: rand(0, TAU),
      spin: rand(-2.4, 2.4),
      size: this.itemSize * (k.kind === 'golden' ? 1.06 : rand(0.92, 1.05))
    });
  }

  update(dt, engine) {
    const progress = engine.stageTime / engine.duration;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(engine);
      if (progress > 0.5 && Math.random() < 0.3) this._spawn(engine);
      this.spawnTimer = rand(0.42, 0.6) - progress * 0.1;
    }

    // Keyboard hold support
    if (engine.keys.has('ArrowLeft') || engine.keys.has('a')) this.targetX -= engine.W * 1.1 * dt;
    if (engine.keys.has('ArrowRight') || engine.keys.has('d')) this.targetX += engine.W * 1.1 * dt;

    const half = this.basketW * 0.5;
    this.targetX = clamp(this.targetX, half, engine.W - half);
    // Snappy but smooth follow — feels responsive on touch without jitter.
    this.basketX = lerp(this.basketX, this.targetX, Math.min(1, dt * 18));
    this.squash = Math.max(0, this.squash - dt * 4);
    this.hurt = Math.max(0, this.hurt - dt * 2);

    const catchY = this.basketY - this.basketW * 0.18;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.y += it.vy * dt;
      it.x += it.vx * dt;
      it.rot += it.spin * dt;
      if (it.x < it.size * 0.4 || it.x > engine.W - it.size * 0.4) it.vx *= -1;

      const inBasketX = Math.abs(it.x - this.basketX) < half * 0.92;
      if (it.y + it.size * 0.3 >= catchY && it.y < this.basketY + this.basketW * 0.3 && inBasketX) {
        this.items.splice(i, 1);
        this._collect(it, engine);
        continue;
      }

      if (it.y - it.size > engine.H) {
        this.items.splice(i, 1);
        if (it.kind !== 'bad') this.state.bumpStat('dropped');
      }
    }
  }

  _collect(it, engine) {
    const x = this.basketX;
    const y = this.basketY - this.basketW * 0.22;

    if (it.kind === 'bad') {
      this.bad += 1;
      this.hurt = 1;
      this.state.bumpStat('bad');
      const pts = this.state.award(it.points, { combo: false, x, y, kind: 'penalty' });
      this.state.breakCombo();
      popScore(engine, pts, x, y);
      engine.fx.burst(x, y, { count: 16, color: '155,93,229', speed: 160, spread: Math.PI, angle: -Math.PI / 2, size: 3, life: 0.5, gravity: 240 });
      engine.fx.shake(6);
      audio.play('penalty');
      return;
    }

    const info = this.state.registerHit();
    const pts = this.state.award(it.points, { x, y, kind: it.kind });
    this.state.addMissionProgress(1);
    this.sweets += 1;
    if (it.kind === 'golden') this.golden += 1;
    this.state.setStat('sweets', this.sweets);
    this.state.setStat('golden', this.golden);

    this.squash = 1;
    popScore(engine, pts, x, y, { level: info.level });
    engine.fx.burst(x, y, {
      count: it.kind === 'golden' ? 20 : 10,
      color: it.color,
      speed: it.kind === 'golden' ? 190 : 120,
      spread: Math.PI * 1.2,
      angle: -Math.PI / 2,
      size: 2.6,
      life: 0.45,
      gravity: 300
    });
    if (it.kind === 'golden') {
      engine.fx.ring(x, y, { color: '255,200,87', r0: 8, r1: 90, life: 0.45, width: 3 });
      audio.play('golden');
    } else {
      audio.play('sweet', { step: Math.min(10, this.state.combo) });
    }
  }

  draw(ctx, engine) {
    marketBackdrop.draw(ctx, engine);

    for (const it of this.items) {
      drawSweet(ctx, it.kind, it.x, it.y, it.size, { rot: it.rot });
    }

    drawBasket(ctx, this.basketX, this.basketY, this.basketW, { squash: this.squash, t: engine.time });

    if (this.hurt > 0) {
      ctx.save();
      ctx.globalAlpha = this.hurt * 0.3;
      ctx.fillStyle = 'rgba(217,70,166,1)';
      ctx.fillRect(0, 0, engine.W, engine.H);
      ctx.restore();
    }

    drawVignette(ctx, engine, 0.4);
  }

  summary() {
    return { sweets: this.sweets, golden: this.golden, bad: this.bad };
  }

  destroy() { this.items.length = 0; }
}
