/**
 * STAGE 5 — DEFEAT THE DARKNESS (boss battle)
 *
 * Three escalating phases. Tap glowing weak points to drain DARKNESS ENERGY,
 * drag the Guardian Lamp away from falling dark energy, and spend the four
 * collectibles earned in stages 1–4 as real power-ups:
 *
 *   Golden Flame   → double damage for a few seconds
 *   Rainbow Rangoli→ protective barrier
 *   Spark          → stuns the boss
 *   Golden Mithai  → restores a mistake allowance
 *
 * Completing a stage mission makes its power EMPOWERED (longer / stronger),
 * so playing well earlier genuinely pays off here.
 */

import { audio } from '../audio.js';
import { drawMonster, drawWeakPoint, drawDarkOrb, drawGuardianLamp, drawDiya, drawGlow } from '../core/art.js';
import { bossBackdrop, popScore, drawVignette } from './common.js';
import { rand, randInt, clamp, lerp, hitCircle, TAU } from '../core/utils.js';
import { COLLECTIBLES } from '../rewards.js';

export const DEF = {
  id: 'boss-battle',
  index: 4,
  name: 'DEFEAT THE DARKNESS',
  duration: 26,
  missionGoal: 100,
  missionLabel: 'Drain the darkness',
  icon: 'a-darkness',
  hint: 'TAP the glowing weak points. DRAG to dodge dark energy. Fire your power-ups!',
  story: 'The monster that stole Diwalipur’s light is here. End this, Guardian.',
  music: 'boss'
};

const MAX_HP = 100;
const DMG_WEAK = 5;
const DMG_CORE = 12;
const PTS_WEAK = 10;
const PTS_CORE = 30;
const PTS_FINAL = 20;
const VICTORY_BONUS = 250;
const TIME_BONUS_PER_SEC = 5;
const FLAWLESS_BONUS = 75;
const FINAL_STRIKE_AT = 12;
const FINAL_STRIKE_COUNT = 5;

export class BossBattle {
  constructor(state, { powerbarEl, hudEl } = {}) {
    this.state = state;
    this.powerbarEl = powerbarEl || null;
    this.hudEl = hudEl || null;
  }

  /* -------------------------------- setup -------------------------------- */

  init(engine) {
    this.engine = engine;
    this.hp = MAX_HP;
    this.phase = 1;
    this.lives = 3;
    this.maxLives = 3;
    this.mistakes = 0;
    this.weakPoints = [];
    this.orbs = [];
    this.telegraphs = [];
    this.spawnTimer = 0.8;
    this.attackTimer = 2.2;
    this.coreTimer = 6.5;
    this.hitFlash = 0;
    this.stunTimer = 0;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.defeated = false;
    this.failed = false;
    this.ending = false;
    this.endTimer = 0;
    this.finalStrike = null;
    this.hits = 0;
    this.cores = 0;
    this.timeScale = 1;
    this.bannerEl = null;

    this.bossSize = clamp(Math.min(engine.W, engine.H) * 0.42, 150, 260);
    this.lampSize = clamp(engine.W * 0.14, 44, 70);
    this.lampX = engine.W / 2;
    this.lampTargetX = engine.W / 2;
    this.lampY = engine.H - this.lampSize * 0.7;

    this.floatDiyas = Array.from({ length: 4 }, (_, i) => ({
      x: engine.W * (i % 2 === 0 ? 0.1 : 0.9),
      y: engine.H * (0.38 + (i >> 1) * 0.2),
      phase: rand(0, TAU),
      size: this.lampSize * 0.62
    }));

    this._buildPowers();
    this._buildHud(engine);
    this._banner('THE DARKNESS AWAKENS');
    audio.play('boss-attack');
  }

  resize(engine) {
    this.bossSize = clamp(Math.min(engine.W, engine.H) * 0.42, 150, 260);
    this.lampSize = clamp(engine.W * 0.14, 44, 70);
    this.lampY = engine.H - this.lampSize * 0.7;
    this.lampX = clamp(this.lampX, this.lampSize * 0.6, engine.W - this.lampSize * 0.6);
  }

  /* -------------------------------- powers ------------------------------- */

  _buildPowers() {
    const missionDone = new Map(
      (this.state.stageResults || []).map((s) => [s.id, Boolean(s.missionDone)])
    );

    this.powers = {};
    for (const c of COLLECTIBLES) {
      const owned = this.state.hasCollectible(c.id);
      const empowered = Boolean(missionDone.get(c.stage));
      this.powers[c.power.key] = {
        key: c.power.key,
        label: c.power.label,
        icon: c.power.icon,
        owned,
        empowered,
        used: false,
        active: 0,
        duration: c.power.duration * (empowered ? 1.4 : 1)
      };
    }
    if (this.powers.heal?.owned && this.powers.heal.empowered) this.powers.heal.heals = 2;

    if (!this.powerbarEl) return;
    this.powerbarEl.hidden = false;
    this.powerbarEl.innerHTML = '';
    for (const key of ['flame', 'shield', 'stun', 'heal']) {
      const p = this.powers[key];
      if (!p) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pw ${p.owned ? 'is-ready' : 'is-locked'}`;
      btn.dataset.power = key;
      btn.disabled = !p.owned;
      btn.setAttribute('aria-label', `${p.label} power-up`);
      btn.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><use href="#${p.icon}"/></svg><span>${p.label}${p.empowered ? '<br>★' : ''}</span>`;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._usePower(key); });
      this.powerbarEl.appendChild(btn);
    }
  }

  _usePower(key) {
    const p = this.powers?.[key];
    if (!p || !p.owned || p.used || this.ending) return;
    p.used = true;
    const btn = this.powerbarEl?.querySelector(`[data-power="${key}"]`);
    btn?.classList.remove('is-ready');
    btn?.classList.add('is-used');

    const engine = this.engine;
    switch (key) {
      case 'flame':
        p.active = p.duration;
        engine.fx.floatText(this.lampX, this.lampY - this.lampSize, 'DOUBLE DAMAGE!', { color: '#FFC857', size: 22, life: 1.2 });
        engine.fx.burst(this.lampX, this.lampY, { count: 26, color: '255,200,87', speed: 200, spread: TAU, size: 3, life: 0.7, gravity: 40 });
        audio.play('power');
        break;
      case 'shield':
        p.active = p.duration;
        engine.fx.ring(this.lampX, this.lampY, { color: '57,198,176', r0: 10, r1: 140, life: 0.6, width: 4 });
        engine.fx.floatText(this.lampX, this.lampY - this.lampSize, 'BARRIER UP!', { color: '#39C6B0', size: 22, life: 1.2 });
        audio.play('shield');
        break;
      case 'stun':
        this.stunTimer = p.duration;
        this.orbs.length = 0;
        this.telegraphs.length = 0;
        engine.fx.shake(10);
        engine.fx.ring(engine.cx, this.bossY ?? engine.H * 0.32, { color: '255,200,87', r0: 20, r1: 260, life: 0.7, width: 5 });
        this._banner('STUNNED!');
        audio.play('stun');
        break;
      case 'heal': {
        const heals = p.heals || 1;
        this.lives = Math.min(this.maxLives + heals, this.lives + heals);
        this.maxLives = Math.max(this.maxLives, this.lives);
        engine.fx.floatText(this.lampX, this.lampY - this.lampSize, `+${heals} LIFE`, { color: '#FF8AD8', size: 22, life: 1.2 });
        audio.play('power');
        this._renderLives();
        break;
      }
      default: break;
    }
  }

  /* ---------------------------------- HUD -------------------------------- */

  _buildHud(engine) {
    const el = document.createElement('div');
    el.className = 'boss-hp';
    el.innerHTML = `
      <div class="boss-hp__label"><span>DARKNESS ENERGY</span><span class="boss-hp__phase" id="bp-phase">PHASE 1</span></div>
      <div class="boss-hp__bar" id="bp-bar"><i></i></div>
      <div class="boss-hp__lives" id="bp-lives"></div>`;
    engine.domLayer.appendChild(el);
    this.hpEl = el.querySelector('#bp-bar');
    this.hpFill = el.querySelector('#bp-bar i');
    this.phaseEl = el.querySelector('#bp-phase');
    this.livesEl = el.querySelector('#bp-lives');
    this._renderLives();

    const banner = document.createElement('div');
    banner.className = 'boss-banner';
    engine.domLayer.appendChild(banner);
    this.bannerEl = banner;
  }

  _renderLives() {
    if (!this.livesEl) return;
    const total = Math.max(this.maxLives, this.lives);
    let html = '';
    for (let i = 0; i < total; i++) {
      html += `<svg viewBox="0 0 32 32" class="${i < this.lives ? '' : 'is-lost'}" aria-hidden="true"><use href="#p-heart"/></svg>`;
    }
    this.livesEl.innerHTML = html;
    this.livesEl.setAttribute('aria-label', `${this.lives} of ${total} lives remaining`);
  }

  _banner(text, isFinal = false) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.toggle('final', isFinal);
    this.bannerEl.classList.remove('is-on');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('is-on');
  }

  _syncHp() {
    const pct = clamp(this.hp / MAX_HP, 0, 1);
    if (this.hpFill) this.hpFill.style.transform = `scaleX(${pct})`;
    if (this.hpEl) {
      this.hpEl.classList.add('is-hit');
      clearTimeout(this._hpTimer);
      this._hpTimer = setTimeout(() => this.hpEl?.classList.remove('is-hit'), 240);
    }
    const phase = this.hp > 66 ? 1 : this.hp > 33 ? 2 : 3;
    if (phase !== this.phase) {
      this.phase = phase;
      this.state.boss.phase = phase;
      if (this.phaseEl) this.phaseEl.textContent = `PHASE ${phase}`;
      this._banner(phase === 3 ? 'FINAL PHASE!' : `PHASE ${phase}`);
      this.engine.fx.shake(9);
      audio.play('boss-attack');
    }
    // Mission progress = % of darkness drained.
    const damage = Math.round(MAX_HP - this.hp);
    const delta = damage - (this._lastDamage || 0);
    if (delta > 0) {
      this._lastDamage = damage;
      this.state.addMissionProgress(delta);
    }
  }

  /* -------------------------------- spawning ------------------------------ */

  _spawnWeakPoint(engine, golden = false) {
    const maxActive = this.phase >= 3 ? 3 : 2;
    if (this.weakPoints.length >= maxActive) return;
    const r = (golden ? this.lampSize * 0.62 : this.lampSize * 0.46);
    const angle = rand(-Math.PI * 0.95, Math.PI * 0.15);
    const dist = this.bossSize * rand(0.38, 0.62);
    const x = clamp(this.bossX + Math.cos(angle) * dist, r + 10, engine.W - r - 10);
    const y = clamp(this.bossY + Math.sin(angle) * dist * 0.8, engine.H * 0.14, engine.H * 0.6);
    const base = this.phase === 1 ? 2.3 : this.phase === 2 ? 1.9 : 1.6;
    const life = (golden ? 1.9 : base) * (this.stunTimer > 0 ? 1.6 : 1);
    this.weakPoints.push({ x, y, r, life, maxLife: life, golden, age: 0 });
  }

  _spawnAttack(engine) {
    if (this.stunTimer > 0 || this.ending) return;
    const count = this.phase === 3 ? randInt(1, 2) : 1;
    for (let i = 0; i < count; i++) {
      this.telegraphs.push({
        x: this.bossX + rand(-this.bossSize * 0.3, this.bossSize * 0.3),
        y: this.bossY + this.bossSize * 0.2,
        t: 0,
        delay: 0.55 + i * 0.22,
        aimX: this.lampX + rand(-30, 30)
      });
    }
    audio.play('boss-attack');
  }

  /* --------------------------------- input -------------------------------- */

  pointerDown(x, y, engine) {
    this.lampTargetX = x;
    if (this.ending) return;

    // Final strike cores first
    if (this.finalStrike) {
      const c = this.finalStrike.core;
      if (c && hitCircle(x, y, c.x, c.y, c.r, 34)) {
        this._finalStrikeHit(engine);
        return;
      }
    }

    for (let i = this.weakPoints.length - 1; i >= 0; i--) {
      const wp = this.weakPoints[i];
      if (!hitCircle(x, y, wp.x, wp.y, wp.r, 32)) continue;
      this.weakPoints.splice(i, 1);
      this._damage(wp.golden ? DMG_CORE : DMG_WEAK, wp, engine);
      return;
    }
  }

  pointerMove(x, _y, engine) {
    if (engine.pointer.down) this.lampTargetX = x;
  }

  key(e) {
    const step = this.engine ? this.engine.W * 0.12 : 40;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.lampTargetX -= step;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.lampTargetX += step;
    if (e.key === ' ' || e.key === 'Enter') {
      // Keyboard assist: strike the nearest weak point.
      const target = this.finalStrike?.core || this.weakPoints[0];
      if (target) this.pointerDown(target.x, target.y, this.engine);
    }
    if (e.key === '1') this._usePower('flame');
    if (e.key === '2') this._usePower('shield');
    if (e.key === '3') this._usePower('stun');
    if (e.key === '4') this._usePower('heal');
  }

  /* -------------------------------- damage -------------------------------- */

  _damage(amount, wp, engine) {
    const doubled = (this.powers?.flame?.active || 0) > 0;
    const dmg = amount * (doubled ? 2 : 1);
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlash = 1;
    this.hits += 1;
    if (wp.golden) this.cores += 1;

    const info = this.state.registerHit();
    const pts = this.state.award(wp.golden ? PTS_CORE : PTS_WEAK, { x: wp.x, y: wp.y, kind: 'boss' });
    popScore(engine, pts, wp.x, wp.y, { level: info.level });
    engine.fx.burst(wp.x, wp.y, {
      count: wp.golden ? 26 : 16,
      color: wp.golden ? '255,200,87' : '57,198,176',
      speed: wp.golden ? 220 : 160,
      spread: TAU, size: 3, life: 0.6, gravity: 60
    });
    engine.fx.ring(wp.x, wp.y, { color: wp.golden ? '255,200,87' : '57,198,176', r0: 6, r1: 90, life: 0.4, width: 3 });
    engine.fx.shake(wp.golden ? 9 : 4);
    audio.play(wp.golden ? 'boss-core' : 'boss-hit');

    this.state.setStat('hits', this.hits);
    this.state.setStat('cores', this.cores);
    this._syncHp();

    if (this.hp <= FINAL_STRIKE_AT && !this.finalStrike && !this.ending) this._startFinalStrike(engine);
  }

  _takeHit(engine, x, y) {
    if (this.invuln > 0 || this.ending) return;
    if ((this.powers?.shield?.active || 0) > 0) {
      engine.fx.ring(x, y, { color: '57,198,176', r0: 6, r1: 70, life: 0.35, width: 3 });
      engine.fx.burst(x, y, { count: 14, color: '57,198,176', speed: 150, spread: TAU, size: 2.6, life: 0.4, gravity: 60 });
      audio.play('shield');
      return;
    }
    this.lives -= 1;
    this.mistakes += 1;
    this.invuln = 1.4;
    this.hurtFlash = 1;
    this.state.breakCombo();
    this.state.boss.mistakes = this.mistakes;
    this._renderLives();
    engine.fx.shake(14);
    engine.fx.burst(x, y, { count: 22, color: '217,70,166', speed: 190, spread: TAU, size: 3.2, life: 0.6, gravity: 120 });
    audio.play('hurt');
    if (this.lives <= 0) this._fail(engine);
  }

  /* ----------------------------- final strike ----------------------------- */

  _startFinalStrike(engine) {
    this.finalStrike = { done: 0, needed: FINAL_STRIKE_COUNT, timer: 6, core: null, cooldown: 0 };
    this.orbs.length = 0;
    this.telegraphs.length = 0;
    this.weakPoints.length = 0;
    this.stunTimer = Math.max(this.stunTimer, 6);
    this.timeScale = 0.72;
    this._banner('FINAL STRIKE!', true);
    engine.fx.shake(16);
    engine.fx.ring(engine.cx, engine.cy, { color: '255,200,87', r0: 20, r1: 320, life: 0.8, width: 6 });
    audio.play('achievement');
    this._spawnFinalCore(engine);
  }

  _spawnFinalCore(engine) {
    const r = this.lampSize * 0.6;
    this.finalStrike.core = {
      x: clamp(this.bossX + rand(-this.bossSize * 0.45, this.bossSize * 0.45), r + 12, engine.W - r - 12),
      y: clamp(this.bossY + rand(-this.bossSize * 0.25, this.bossSize * 0.3), engine.H * 0.16, engine.H * 0.58),
      r,
      life: 1.2,
      maxLife: 1.2
    };
  }

  _finalStrikeHit(engine) {
    const c = this.finalStrike.core;
    this.finalStrike.done += 1;
    this.finalStrike.core = null;
    this.hp = Math.max(0, this.hp - FINAL_STRIKE_AT / FINAL_STRIKE_COUNT);
    this.hitFlash = 1;
    const info = this.state.registerHit();
    const pts = this.state.award(PTS_FINAL, { x: c.x, y: c.y, kind: 'boss' });
    popScore(engine, pts, c.x, c.y, { level: info.level });
    engine.fx.firework(c.x, c.y, '255,200,87', 1.2);
    engine.fx.shake(10);
    audio.play('boss-core');
    this._syncHp();

    if (this.finalStrike.done >= this.finalStrike.needed) this._win(engine);
    else this._spawnFinalCore(engine);
  }

  /* ------------------------------- outcomes ------------------------------- */

  _win(engine) {
    if (this.ending) return;
    this.ending = true;
    this.defeated = true;
    this.hp = 0;
    this.timeScale = 1;
    this.endTimer = 2.4;
    this.state.boss.defeated = true;
    this.state.boss.hpPercentLeft = 0;

    const bonus = this.state.award(VICTORY_BONUS, { combo: false, kind: 'bonus' });
    const timeBonus = this.state.award(Math.floor(engine.timeLeft) * TIME_BONUS_PER_SEC, { combo: false, kind: 'bonus' });
    let flawless = 0;
    if (this.mistakes === 0) flawless = this.state.award(FLAWLESS_BONUS, { combo: false, kind: 'bonus' });
    this._syncHp();

    engine.fx.floatText(engine.cx, engine.H * 0.42, `+${bonus}`, { color: '#FFC857', size: 34, life: 1.6 });
    if (timeBonus > 0) engine.fx.floatText(engine.cx, engine.H * 0.5, `TIME BONUS +${timeBonus}`, { color: '#39C6B0', size: 20, life: 1.6 });
    if (flawless > 0) engine.fx.floatText(engine.cx, engine.H * 0.56, `FLAWLESS +${flawless}`, { color: '#FF8AD8', size: 20, life: 1.6 });

    this._banner('THE LIGHT WINS!', true);
    engine.fx.shake(18);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        engine.fx.firework(rand(engine.W * 0.15, engine.W * 0.85), rand(engine.H * 0.15, engine.H * 0.55), ['255,200,87', '217,70,166', '57,198,176'][i % 3], 1.3);
        audio.play('firework');
      }, i * 220);
    }
    engine.fx.confetti(engine.W, engine.H, 50);
    audio.play('boss-defeat');
  }

  _fail(engine) {
    if (this.ending) return;
    this.ending = true;
    this.failed = true;
    this.endTimer = 1.5;
    this.state.boss.defeated = false;
    this.state.boss.hpPercentLeft = Math.round(this.hp);
    this._banner('THE DARKNESS HOLDS…');
    engine.fx.shake(16);
    audio.play('hurt');
  }

  /* -------------------------------- update -------------------------------- */

  update(rawDt, engine) {
    const dt = rawDt * this.timeScale;
    const t = engine.time;

    this.bossX = engine.cx + Math.sin(t * 0.5) * engine.W * 0.1;
    this.bossY = engine.H * 0.3 + Math.sin(t * 0.8) * engine.H * 0.015;

    if (this.ending) {
      this.endTimer -= rawDt;
      this.hitFlash = Math.max(0, this.hitFlash - rawDt * 2);
      if (this.defeated) {
        if (Math.random() < rawDt * 26) {
          engine.fx.burst(this.bossX + rand(-this.bossSize * 0.5, this.bossSize * 0.5), this.bossY + rand(-this.bossSize * 0.4, this.bossSize * 0.4), {
            count: 5, color: '255,200,87', speed: 120, spread: TAU, size: 3, life: 1, gravity: -20
          });
        }
      }
      if (this.endTimer <= 0) engine.finishStage(this.defeated ? 'victory' : 'defeat');
      return;
    }

    // timers
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    this.invuln = Math.max(0, this.invuln - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    for (const key of Object.keys(this.powers)) {
      const p = this.powers[key];
      if (p.active > 0) {
        p.active = Math.max(0, p.active - dt);
        const btn = this.powerbarEl?.querySelector(`[data-power="${key}"]`);
        if (p.active === 0) btn?.classList.remove('is-active');
        else btn?.classList.add('is-active');
      }
    }

    // lamp
    const half = this.lampSize * 0.6;
    if (engine.keys.has('ArrowLeft') || engine.keys.has('a')) this.lampTargetX -= engine.W * 1.05 * dt;
    if (engine.keys.has('ArrowRight') || engine.keys.has('d')) this.lampTargetX += engine.W * 1.05 * dt;
    this.lampTargetX = clamp(this.lampTargetX, half, engine.W - half);
    this.lampX = lerp(this.lampX, this.lampTargetX, Math.min(1, dt * 16));

    // final strike handling
    if (this.finalStrike) {
      this.finalStrike.timer -= rawDt;
      const c = this.finalStrike.core;
      if (c) {
        c.life -= dt;
        if (c.life <= 0) this._spawnFinalCore(engine);
      }
      if (this.finalStrike.timer <= 0) {
        // Missed the window: the boss recovers a little and the fight resumes.
        this.finalStrike = null;
        this.timeScale = 1;
        this.hp = Math.min(MAX_HP, this.hp + 8);
        this.stunTimer = 0;
        this._banner('IT RECOVERED!');
        this._syncHp();
        audio.play('boss-attack');
      }
      return;
    }

    // weak points
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnWeakPoint(engine, false);
      const base = this.phase === 1 ? 1.15 : this.phase === 2 ? 0.92 : 0.72;
      this.spawnTimer = (this.stunTimer > 0 ? base * 0.55 : base) * rand(0.85, 1.15);
    }
    this.coreTimer -= dt;
    if (this.coreTimer <= 0) {
      this._spawnWeakPoint(engine, true);
      this.coreTimer = rand(6.5, 8.5) - this.phase * 0.6;
    }
    for (let i = this.weakPoints.length - 1; i >= 0; i--) {
      const wp = this.weakPoints[i];
      wp.age += dt;
      wp.life -= dt;
      if (wp.life <= 0) {
        this.weakPoints.splice(i, 1);
        this.state.bumpStat('missedWeak');
      }
    }

    // attacks
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this._spawnAttack(engine);
      const base = this.phase === 1 ? 1.9 : this.phase === 2 ? 1.45 : 1.1;
      this.attackTimer = base * rand(0.85, 1.2);
    }

    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i];
      tg.t += dt;
      if (tg.t >= tg.delay) {
        this.telegraphs.splice(i, 1);
        const speed = engine.H * (this.phase === 1 ? 0.42 : this.phase === 2 ? 0.52 : 0.62);
        const dx = tg.aimX - tg.x;
        const dy = this.lampY - tg.y;
        const len = Math.hypot(dx, dy) || 1;
        this.orbs.push({
          x: tg.x, y: tg.y,
          vx: (dx / len) * speed,
          vy: (dy / len) * speed,
          r: this.lampSize * 0.3
        });
      }
    }

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (Math.random() < dt * 22) {
        engine.fx.burst(o.x, o.y, { count: 1, color: '155,93,229', speed: 20, spread: TAU, size: 2.2, life: 0.45, gravity: 20 });
      }
      const hitR = o.r + this.lampSize * 0.42;
      if (Math.hypot(o.x - this.lampX, o.y - this.lampY) < hitR) {
        this.orbs.splice(i, 1);
        this._takeHit(engine, o.x, o.y);
        continue;
      }
      if (o.y > engine.H + o.r * 2 || o.x < -o.r * 3 || o.x > engine.W + o.r * 3) {
        this.orbs.splice(i, 1);
      }
    }

    // running out of time without a kill
    if (engine.timeLeft <= 0.05 && !this.ending) {
      this.state.boss.hpPercentLeft = Math.round(this.hp);
    }
  }

  /* --------------------------------- draw --------------------------------- */

  draw(ctx, engine) {
    bossBackdrop.draw(ctx, engine);
    const t = engine.time;

    // floating golden diyas
    for (const d of this.floatDiyas) {
      const y = d.y + Math.sin(t * 1.3 + d.phase) * engine.H * 0.02;
      drawDiya(ctx, d.x, y, d.size, { golden: true, lit: true, t: t + d.phase });
    }

    // boss
    if (!this.ending || this.endTimer > 0) {
      const dissolve = this.defeated ? clamp(this.endTimer / 2.4, 0, 1) : 1;
      drawMonster(ctx, this.bossX, this.bossY, this.bossSize, {
        t,
        phase: this.phase,
        hitFlash: this.hitFlash,
        stunned: this.stunTimer > 0,
        rage: (MAX_HP - this.hp) / MAX_HP,
        alpha: dissolve
      });
    }

    // telegraphs
    for (const tg of this.telegraphs) {
      const k = clamp(tg.t / tg.delay, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.25 + k * 0.5;
      ctx.strokeStyle = 'rgba(217,70,166,1)';
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, this.lampSize * (0.45 - k * 0.2), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([6, 8]);
      ctx.globalAlpha = 0.18 + k * 0.25;
      ctx.beginPath();
      ctx.moveTo(tg.x, tg.y);
      ctx.lineTo(tg.aimX, this.lampY);
      ctx.stroke();
      ctx.restore();
    }

    // orbs
    for (const o of this.orbs) drawDarkOrb(ctx, o.x, o.y, o.r, t);

    // weak points
    for (const wp of this.weakPoints) {
      const appear = Math.min(1, wp.age / 0.18);
      drawWeakPoint(ctx, wp.x, wp.y, wp.r * appear, { t, golden: wp.golden, life: wp.life / wp.maxLife });
    }

    // final strike core
    if (this.finalStrike?.core) {
      const c = this.finalStrike.core;
      drawGlow(ctx, c.x, c.y, c.r * 3, '255,200,87', 0.6);
      drawWeakPoint(ctx, c.x, c.y, c.r, { t, golden: true, life: c.life / c.maxLife });
      ctx.save();
      ctx.fillStyle = '#FFF8EC';
      ctx.font = `800 ${Math.round(c.r * 0.6)}px Outfit, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.finalStrike.needed - this.finalStrike.done), c.x, c.y);
      ctx.restore();
    }

    // lamp
    const flicker = this.invuln > 0 && Math.floor(t * 14) % 2 === 0 ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = flicker;
    drawGuardianLamp(ctx, this.lampX, this.lampY, this.lampSize, {
      t,
      shielded: (this.powers?.shield?.active || 0) > 0,
      hurt: this.hurtFlash
    });
    if ((this.powers?.flame?.active || 0) > 0) {
      drawGlow(ctx, this.lampX, this.lampY - this.lampSize * 0.4, this.lampSize * 1.3, '255,200,87', 0.5);
    }
    ctx.restore();

    if (this.hurtFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.hurtFlash * 0.35;
      ctx.fillStyle = '#D946A6';
      ctx.fillRect(0, 0, engine.W, engine.H);
      ctx.restore();
    }

    if (this.defeated) {
      const k = 1 - clamp(this.endTimer / 2.4, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.6;
      ctx.fillStyle = '#FFE9A8';
      ctx.fillRect(0, 0, engine.W, engine.H);
      ctx.restore();
    }

    drawVignette(ctx, engine, 0.5);
  }

  summary() {
    return {
      defeated: this.defeated,
      hpLeft: Math.round(this.hp),
      damagePercent: Math.round(MAX_HP - this.hp),
      mistakes: this.mistakes,
      hits: this.hits,
      cores: this.cores,
      phase: this.phase
    };
  }

  onPause() { /* engine freezes dt; nothing to do */ }

  destroy() {
    clearTimeout(this._hpTimer);
    this.weakPoints.length = 0;
    this.orbs.length = 0;
    this.telegraphs.length = 0;
    if (this.powerbarEl) {
      this.powerbarEl.hidden = true;
      this.powerbarEl.innerHTML = '';
    }
  }
}
