/**
 * GAME STATE — the single source of truth for one run (five stages).
 * Stages never mutate score/combo directly; they call these methods so that
 * scoring, combos, missions and achievements stay consistent and auditable.
 */

import { Emitter } from './core/emitter.js';
import { applyCombo, comboLevel, comboMultiplier, comboTag } from './progression.js';
import { collectibleForStage } from './rewards.js';

export class GameState extends Emitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.comboBest = 0;
    this.stageIndex = 0;
    this.stageResults = [];
    this.collectibles = [];
    this.boss = { defeated: false, hpPercentLeft: 100, mistakes: 0, phase: 1 };
    this.xpEarned = 0;
    this.achievementsUnlocked = [];
    this.startedAt = Date.now();
    this.current = null;
    this.emit('reset');
    return this;
  }

  /* ------------------------------ Stage scope ----------------------------- */

  beginStage(def) {
    this.current = {
      id: def.id,
      name: def.name,
      index: def.index,
      score: 0,
      combo: 0,
      bestCombo: 0,
      missionNow: 0,
      missionGoal: def.missionGoal,
      missionLabel: def.missionLabel,
      missionDone: false,
      stats: {}
    };
    this.combo = 0;
    this.emit('stage-begin', this.current);
    this.emit('combo', this.comboInfo());
    this.emit('mission', this.missionInfo());
    return this.current;
  }

  endStage(stats = {}) {
    if (!this.current) return null;
    const result = {
      ...this.current,
      stats: { ...this.current.stats, ...stats }
    };
    this.stageResults.push(result);
    this.emit('stage-end', result);
    this.current = null;
    return result;
  }

  /* -------------------------------- Scoring ------------------------------- */

  /**
   * Award points.
   * @param {number} base  base value before the combo multiplier
   * @param {object} opts  { combo: apply multiplier (default true), x, y, kind, label }
   * @returns {number} points actually added (can be negative for penalties)
   */
  award(base, opts = {}) {
    const useCombo = opts.combo !== false && base > 0;
    const points = useCombo ? applyCombo(base, this.combo) : Math.round(base);
    this.score = Math.max(0, this.score + points);
    if (this.current) this.current.score = Math.max(0, this.current.score + points);
    this.emit('score', {
      points,
      base,
      total: this.score,
      x: opts.x, y: opts.y,
      kind: opts.kind || 'generic',
      label: opts.label
    });
    return points;
  }

  /** A clean successful action: grows the combo chain. */
  registerHit() {
    this.combo += 1;
    if (this.combo > this.comboBest) this.comboBest = this.combo;
    if (this.current) {
      this.current.combo = this.combo;
      if (this.combo > this.current.bestCombo) this.current.bestCombo = this.combo;
    }
    const info = this.comboInfo();
    this.emit('combo', info);
    const tag = comboTag(this.combo);
    if (tag) this.emit('combo-milestone', { ...info, tag });
    return info;
  }

  /** A mistake: resets the chain (never the score). */
  breakCombo() {
    if (this.combo === 0) return;
    this.combo = 0;
    if (this.current) this.current.combo = 0;
    this.emit('combo', this.comboInfo());
    this.emit('combo-break');
  }

  comboInfo() {
    return {
      count: this.combo,
      mult: comboMultiplier(this.combo),
      level: comboLevel(this.combo),
      tag: comboTag(this.combo)
    };
  }

  /* -------------------------------- Mission ------------------------------- */

  addMissionProgress(n = 1) {
    if (!this.current) return;
    const goal = this.current.missionGoal || 0;
    this.current.missionNow = Math.max(0, this.current.missionNow + n);
    const justDone = !this.current.missionDone && goal > 0 && this.current.missionNow >= goal;
    if (justDone) {
      this.current.missionDone = true;
      this.emit('mission-complete', this.missionInfo());
    }
    this.emit('mission', this.missionInfo());
  }

  missionInfo() {
    if (!this.current) return { now: 0, goal: 0, done: false, label: '' };
    return {
      now: this.current.missionNow,
      goal: this.current.missionGoal,
      done: this.current.missionDone,
      label: this.current.missionLabel
    };
  }

  setStat(key, value) {
    if (this.current) this.current.stats[key] = value;
  }

  bumpStat(key, by = 1) {
    if (!this.current) return 0;
    this.current.stats[key] = (this.current.stats[key] || 0) + by;
    return this.current.stats[key];
  }

  /* ------------------------------ Collectibles ----------------------------- */

  awardCollectibleForStage(stageId) {
    const c = collectibleForStage(stageId);
    if (!c) return null;
    if (!this.collectibles.includes(c.id)) this.collectibles.push(c.id);
    this.emit('collectible', c);
    return c;
  }

  hasCollectible(id) { return this.collectibles.includes(id); }

  /* --------------------------------- Summary -------------------------------- */

  summary() {
    return {
      score: this.score,
      comboBest: this.comboBest,
      stageResults: this.stageResults,
      collectibles: this.collectibles.slice(),
      boss: { ...this.boss },
      achievementsUnlocked: this.achievementsUnlocked.slice(),
      durationMs: Date.now() - this.startedAt
    };
  }
}

export const gameState = new GameState();
