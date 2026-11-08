/**
 * PROGRESSION — combo tiers, XP, guardian levels and performance titles.
 * Pure functions only: no DOM, no side effects (unit-tested).
 */

import { CONFIG } from './config.js';

/** Multiplier tiers: 3 hits ×1.5, 5 hits ×2, 10 hits ×3. */
export const COMBO_TIERS = [
  { hits: 10, mult: 3, level: 3 },
  { hits: 5, mult: 2, level: 2 },
  { hits: 3, mult: 1.5, level: 1 }
];

/** Escalating praise shown in the HUD + as floating text. */
export const COMBO_TAGS = [
  { hits: 20, tag: 'DIWALI LEGEND!' },
  { hits: 15, tag: 'UNSTOPPABLE!' },
  { hits: 10, tag: 'AMAZING!' },
  { hits: 5, tag: 'GREAT!' },
  { hits: 3, tag: 'NICE!' }
];

export function comboMultiplier(hits) {
  for (const t of COMBO_TIERS) if (hits >= t.hits) return t.mult;
  return 1;
}

export function comboLevel(hits) {
  for (const t of COMBO_TIERS) if (hits >= t.hits) return t.level;
  return 0;
}

export function comboTag(hits) {
  for (const t of COMBO_TAGS) if (hits === t.hits) return t.tag;
  return null;
}

/** Points helper used by every stage so scoring stays consistent. */
export function applyCombo(base, hits) {
  return Math.round(base * comboMultiplier(hits));
}

/* --------------------------------- Titles -------------------------------- */

export function titleForScore(score) {
  const s = Number(score) || 0;
  return CONFIG.titles.find((t) => s >= t.min) ?? CONFIG.titles[CONFIG.titles.length - 1];
}

/* ----------------------------------- XP ---------------------------------- */

export const XP_RULES = Object.freeze({
  perScore: 0.1,        // 10 score = 1 XP
  missionComplete: 40,
  stageClear: 15,
  comboMilestone: 12,   // per combo tier reached in a stage
  perfectRangoli: 50,
  bossDamage: 0.6,      // per % of darkness removed
  bossDefeat: 120,
  flawlessBoss: 60
});

/** XP for one finished stage. */
export function xpForStage(stage) {
  let xp = XP_RULES.stageClear + Math.round((stage.score || 0) * XP_RULES.perScore);
  if (stage.missionDone) xp += XP_RULES.missionComplete;
  xp += comboLevel(stage.bestCombo || 0) * XP_RULES.comboMilestone;
  if (stage.id === 'rangoli-rush' && stage.stats?.correct === stage.stats?.rounds) xp += XP_RULES.perfectRangoli;
  if (stage.id === 'boss-battle') {
    xp += Math.round((stage.stats?.damagePercent || 0) * XP_RULES.bossDamage);
    if (stage.stats?.defeated) xp += XP_RULES.bossDefeat;
    if (stage.stats?.defeated && stage.stats?.mistakes === 0) xp += XP_RULES.flawlessBoss;
  }
  return Math.max(0, Math.round(xp));
}

/** Total XP for a finished run (stage XP + achievement XP). */
export function xpForRun(run) {
  const stageXp = (run.stageResults || []).reduce((sum, s) => sum + xpForStage(s), 0);
  const achXp = (run.achievementsUnlocked || []).reduce((sum, a) => sum + (a.xp || 0), 0);
  return stageXp + achXp;
}

/* --------------------------------- Levels -------------------------------- */

/** XP needed to go from `level` to `level + 1`. */
export function xpForNextLevel(level) {
  return 300 + (level - 1) * 180;
}

export function levelFromXp(totalXp) {
  let xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  let need = xpForNextLevel(level);
  while (xp >= need && level < 99) {
    xp -= need;
    level += 1;
    need = xpForNextLevel(level);
  }
  return { level, into: xp, need, progress: Math.min(1, xp / need) };
}

export const GUARDIAN_RANKS = ['Lamp Bearer', 'Spark Keeper', 'Light Weaver', 'Festival Guardian', 'Radiant Champion'];

export function rankForLevel(level) {
  return GUARDIAN_RANKS[Math.min(GUARDIAN_RANKS.length - 1, Math.floor((level - 1) / 3))];
}
