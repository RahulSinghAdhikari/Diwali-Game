/**
 * REWARDS — stage collectibles (which become real boss power-ups) and the
 * achievement system. Every unlock is derived from recorded gameplay stats,
 * never from randomness.
 */

/* ------------------------------ Collectibles ------------------------------ */

export const COLLECTIBLES = [
  {
    id: 'golden-flame',
    stage: 'light-rush',
    name: 'GOLDEN FLAME',
    icon: 'c-flame',
    desc: 'Boss power: your next 6 seconds of hits deal double damage.',
    power: { key: 'flame', label: 'FLAME', icon: 'p-flame', duration: 6 }
  },
  {
    id: 'rainbow-rangoli',
    stage: 'rangoli-rush',
    name: 'RAINBOW RANGOLI',
    icon: 'c-rangoli',
    desc: 'Boss power: raises a shield that blocks dark energy for 6 seconds.',
    power: { key: 'shield', label: 'SHIELD', icon: 'p-shield', duration: 6 }
  },
  {
    id: 'spark-celebration',
    stage: 'firework-frenzy',
    name: 'SPARK OF CELEBRATION',
    icon: 'c-spark',
    desc: 'Boss power: stuns the darkness for 3.5 seconds.',
    power: { key: 'stun', label: 'STUN', icon: 'p-stun', duration: 3.5 }
  },
  {
    id: 'golden-mithai',
    stage: 'mithai-mania',
    name: 'GOLDEN MITHAI',
    icon: 'c-mithai',
    desc: 'Boss power: restores one mistake allowance.',
    power: { key: 'heal', label: 'HEAL', icon: 'p-heart', duration: 0 }
  }
];

export const collectibleForStage = (stageId) => COLLECTIBLES.find((c) => c.stage === stageId) || null;
export const collectibleById = (id) => COLLECTIBLES.find((c) => c.id === id) || null;

/* ------------------------------ Achievements ------------------------------ */

const stageOf = (run, id) => (run.stageResults || []).find((s) => s.id === id);

export const ACHIEVEMENTS = [
  {
    id: 'first-light',
    name: 'First Light',
    desc: 'Complete stage one.',
    icon: 'a-firstlight',
    xp: 50,
    test: (run) => Boolean(stageOf(run, 'light-rush'))
  },
  {
    id: 'pattern-master',
    name: 'Pattern Master',
    desc: 'Match every Rangoli round without a mistake.',
    icon: 'a-pattern',
    xp: 100,
    test: (run) => {
      const s = stageOf(run, 'rangoli-rush');
      return Boolean(s && s.stats && s.stats.rounds > 0 && s.stats.correct === s.stats.rounds && s.stats.wrong === 0);
    }
  },
  {
    id: 'sky-painter',
    name: 'Sky Painter',
    desc: 'Hit 10 fireworks in a row.',
    icon: 'a-sky',
    xp: 100,
    test: (run) => {
      const s = stageOf(run, 'firework-frenzy');
      return Boolean(s && (s.stats?.bestStreak || 0) >= 10);
    }
  },
  {
    id: 'mithai-lover',
    name: 'Mithai Lover',
    desc: 'Collect 20 sweets in one market run.',
    icon: 'a-mithai',
    xp: 75,
    test: (run) => {
      const s = stageOf(run, 'mithai-mania');
      return Boolean(s && (s.stats?.sweets || 0) >= 20);
    }
  },
  {
    id: 'darkness-destroyer',
    name: 'Darkness Destroyer',
    desc: 'Defeat the darkness monster.',
    icon: 'a-darkness',
    xp: 200,
    test: (run) => Boolean(run.boss?.defeated)
  },
  {
    id: 'combo-king',
    name: 'Combo King',
    desc: 'Reach a 10-hit combo.',
    icon: 'a-combo',
    xp: 100,
    test: (run) => (run.comboBest || 0) >= 10
  },
  {
    id: 'perfect-festival',
    name: 'Perfect Festival',
    desc: 'Clear all five stages and win the boss fight.',
    icon: 'a-festival',
    xp: 150,
    test: (run) => (run.stageResults || []).length >= 5 && Boolean(run.boss?.defeated)
  },
  {
    id: 'diwali-legend',
    name: 'Diwali Legend',
    desc: 'Finish a run with 2000 points or more.',
    icon: 'a-legend',
    xp: 250,
    test: (run) => (run.score || 0) >= 2000
  }
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

/**
 * Returns achievements whose conditions are met by `run` and that are not in
 * `alreadyUnlockedIds` (a Set/array of ids from the saved profile + this run).
 */
export function evaluateAchievements(run, alreadyUnlockedIds = []) {
  const owned = alreadyUnlockedIds instanceof Set ? alreadyUnlockedIds : new Set(alreadyUnlockedIds);
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (owned.has(a.id)) continue;
    let ok = false;
    try { ok = Boolean(a.test(run)); } catch { ok = false; }
    if (ok) out.push(a);
  }
  return out;
}
