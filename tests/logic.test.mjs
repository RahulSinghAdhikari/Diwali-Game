/** Pure-logic tests: record rules, progression, rewards, patterns, sharing. */

import './setup-location.mjs';
import { describe, it, assert, equal, deepEqual, runAll } from './run.mjs';

import { evaluateRecord } from '../js/records.js';
import {
  comboMultiplier, comboLevel, comboTag, applyCombo,
  titleForScore, xpForStage, levelFromXp, xpForRun
} from '../js/progression.js';
import { ACHIEVEMENTS, COLLECTIBLES, evaluateAchievements, collectibleForStage } from '../js/rewards.js';
import { buildRound, specKey, specsEqual, mutateSpec, randomSpec, rangoliSVG } from '../js/stages/rangoli-rush.js';
import { buildShareText, parseChallenge, challengeUrl } from '../js/sharing.js';
import { sanitizeName } from '../js/core/utils.js';
import { STAGE_DEFS } from '../js/stages/index.js';

describe('High-score record rules (product spec §18)', () => {
  it('A — no previous record asks for a name', () => {
    const r = evaluateRecord(null, 1200);
    assert(r.shouldAskName, 'should ask');
    equal(r.reason, 'first');
  });

  it('B — a lower score never asks and never overwrites', () => {
    const r = evaluateRecord({ name: 'Asha', score: 2000 }, 1999);
    assert(!r.shouldAskName, 'must not ask');
    equal(r.reason, 'lower');
  });

  it('C — a strictly higher score celebrates and asks', () => {
    const r = evaluateRecord({ name: 'Asha', score: 2000 }, 2001);
    assert(r.shouldAskName, 'should ask');
    equal(r.reason, 'beat');
    equal(r.delta, 1);
  });

  it('D — an equal score keeps the original holder', () => {
    const r = evaluateRecord({ name: 'Asha', score: 2000 }, 2000);
    assert(!r.shouldAskName, 'must not ask');
    equal(r.reason, 'tie');
  });

  it('a zero score never creates a champion', () => {
    equal(evaluateRecord(null, 0).shouldAskName, false);
    equal(evaluateRecord(null, 0).reason, 'no-score');
  });

  it('names are sanitised but unicode/emoji survive', () => {
    equal(sanitizeName('   Rahul   Singh  '), 'Rahul Singh');
    equal(sanitizeName('A'.repeat(50)).length, 18);
    equal(sanitizeName('राहुल 🪔'), 'राहुल 🪔');
    equal(sanitizeName('bad\u0000name'), 'badname');
  });
});

describe('Combo + scoring maths', () => {
  it('multiplier tiers are 3→×1.5, 5→×2, 10→×3', () => {
    equal(comboMultiplier(0), 1);
    equal(comboMultiplier(2), 1);
    equal(comboMultiplier(3), 1.5);
    equal(comboMultiplier(4), 1.5);
    equal(comboMultiplier(5), 2);
    equal(comboMultiplier(9), 2);
    equal(comboMultiplier(10), 3);
    equal(comboMultiplier(99), 3);
  });

  it('combo levels drive the HUD state', () => {
    deepEqual([0, 3, 5, 10].map(comboLevel), [0, 1, 2, 3]);
  });

  it('escalating praise fires at the right chain lengths', () => {
    equal(comboTag(3), 'NICE!');
    equal(comboTag(5), 'GREAT!');
    equal(comboTag(10), 'AMAZING!');
    equal(comboTag(15), 'UNSTOPPABLE!');
    equal(comboTag(20), 'DIWALI LEGEND!');
    equal(comboTag(4), null);
  });

  it('applyCombo multiplies and rounds predictably', () => {
    equal(applyCombo(10, 0), 10);
    equal(applyCombo(10, 3), 15);
    equal(applyCombo(25, 5), 50);
    equal(applyCombo(20, 10), 60);
  });
});

describe('Titles + XP + levels', () => {
  it('thresholds map to the documented titles', () => {
    equal(titleForScore(0).name, 'DIYA BEGINNER');
    equal(titleForScore(499).name, 'DIYA BEGINNER');
    equal(titleForScore(500).name, 'LIGHT KEEPER');
    equal(titleForScore(999).name, 'LIGHT KEEPER');
    equal(titleForScore(1000).name, 'RANGOLI MASTER');
    equal(titleForScore(1500).name, 'FIREWORK STAR');
    equal(titleForScore(2000).name, 'DIWALI LEGEND');
    equal(titleForScore(99999).name, 'DIWALI LEGEND');
  });

  it('stage XP rewards mission completion and combos', () => {
    const base = { id: 'light-rush', score: 300, missionDone: false, bestCombo: 0, stats: {} };
    const good = { id: 'light-rush', score: 300, missionDone: true, bestCombo: 10, stats: {} };
    assert(xpForStage(good) > xpForStage(base) + 60, 'mission + combo must pay');
  });

  it('boss XP includes damage, defeat and flawless bonuses', () => {
    const lost = { id: 'boss-battle', score: 200, missionDone: false, bestCombo: 3, stats: { damagePercent: 40, defeated: false, mistakes: 2 } };
    const won = { id: 'boss-battle', score: 600, missionDone: true, bestCombo: 8, stats: { damagePercent: 100, defeated: true, mistakes: 0 } };
    assert(xpForStage(won) > xpForStage(lost) * 2, 'winning the boss is worth much more');
  });

  it('levels accumulate monotonically', () => {
    equal(levelFromXp(0).level, 1);
    equal(levelFromXp(299).level, 1);
    equal(levelFromXp(300).level, 2);
    assert(levelFromXp(5000).level > levelFromXp(1000).level);
    const l = levelFromXp(350);
    assert(l.progress > 0 && l.progress < 1, 'progress is a 0..1 fraction');
  });

  it('run XP sums stages plus achievement XP', () => {
    const run = {
      stageResults: [{ id: 'light-rush', score: 100, missionDone: true, bestCombo: 3, stats: {} }],
      achievementsUnlocked: [{ xp: 50 }, { xp: 100 }]
    };
    equal(xpForRun(run), xpForStage(run.stageResults[0]) + 150);
  });
});

describe('Achievements unlock from real gameplay only', () => {
  const emptyRun = { score: 0, comboBest: 0, stageResults: [], boss: { defeated: false } };

  it('nothing unlocks from an empty run', () => {
    equal(evaluateAchievements(emptyRun, []).length, 0);
  });

  it('First Light needs stage one in the results', () => {
    const run = { ...emptyRun, stageResults: [{ id: 'light-rush', stats: {} }] };
    assert(evaluateAchievements(run, []).some((a) => a.id === 'first-light'));
  });

  it('Pattern Master requires a flawless rangoli stage', () => {
    const near = { ...emptyRun, stageResults: [{ id: 'rangoli-rush', stats: { rounds: 4, correct: 4, wrong: 1 } }] };
    const perfect = { ...emptyRun, stageResults: [{ id: 'rangoli-rush', stats: { rounds: 4, correct: 4, wrong: 0 } }] };
    assert(!evaluateAchievements(near, []).some((a) => a.id === 'pattern-master'), 'a mistake blocks it');
    assert(evaluateAchievements(perfect, []).some((a) => a.id === 'pattern-master'));
  });

  it('Sky Painter needs a 10-hit firework streak', () => {
    const nine = { ...emptyRun, stageResults: [{ id: 'firework-frenzy', stats: { bestStreak: 9 } }] };
    const ten = { ...emptyRun, stageResults: [{ id: 'firework-frenzy', stats: { bestStreak: 10 } }] };
    assert(!evaluateAchievements(nine, []).some((a) => a.id === 'sky-painter'));
    assert(evaluateAchievements(ten, []).some((a) => a.id === 'sky-painter'));
  });

  it('Darkness Destroyer + Perfect Festival need the boss win', () => {
    const run = {
      score: 100,
      comboBest: 2,
      stageResults: STAGE_DEFS.map((d) => ({ id: d.id, stats: {} })),
      boss: { defeated: true }
    };
    const ids = evaluateAchievements(run, []).map((a) => a.id);
    assert(ids.includes('darkness-destroyer'));
    assert(ids.includes('perfect-festival'));
  });

  it('Diwali Legend needs 2000+ points', () => {
    assert(!evaluateAchievements({ ...emptyRun, score: 1999 }, []).some((a) => a.id === 'diwali-legend'));
    assert(evaluateAchievements({ ...emptyRun, score: 2000 }, []).some((a) => a.id === 'diwali-legend'));
  });

  it('already-owned achievements are not re-awarded', () => {
    const run = { ...emptyRun, stageResults: [{ id: 'light-rush', stats: {} }] };
    equal(evaluateAchievements(run, ['first-light']).length, 0);
  });

  it('every achievement has icon, description and XP', () => {
    equal(ACHIEVEMENTS.length, 8);
    for (const a of ACHIEVEMENTS) {
      assert(a.icon && a.desc && a.xp > 0 && typeof a.test === 'function', `${a.id} incomplete`);
    }
  });

  it('each stage maps to exactly one collectible power-up', () => {
    equal(COLLECTIBLES.length, 4);
    for (const def of STAGE_DEFS.slice(0, 4)) {
      const c = collectibleForStage(def.id);
      assert(c && c.power && c.power.key, `${def.id} has no collectible`);
    }
  });
});

describe('Rangoli pattern matching is data-driven', () => {
  it('a round always has exactly one correct, fully distinct option', () => {
    for (let i = 0; i < 300; i++) {
      const { target, options } = buildRound((i % 3) + 1);
      equal(options.length, 4);
      const matches = options.filter((o) => specsEqual(o, target));
      equal(matches.length, 1, 'exactly one option must match the target data');
      const keys = new Set(options.map(specKey));
      equal(keys.size, 4, 'all four tiles must be visually distinct');
    }
  });

  it('mutations always change the pattern', () => {
    for (let i = 0; i < 200; i++) {
      const s = randomSpec();
      const m = mutateSpec(s, 1);
      assert(specKey(s) !== specKey(m), 'a mutation must differ');
    }
  });

  it('renders deterministic SVG for a given spec', () => {
    const s = randomSpec();
    equal(rangoliSVG(s), rangoliSVG(s));
    assert(rangoliSVG(s).startsWith('<svg'), 'valid svg string');
    assert(rangoliSVG(s).includes('</svg>'));
  });
});

describe('Sharing + challenge links', () => {
  it('builds a challenge message with the real score and title', () => {
    const text = buildShareText({ score: 2450, title: 'DIWALI LEGEND', name: 'Rahul' });
    assert(text.includes('2,450'), 'score present');
    assert(text.includes('DIWALI LEGEND'), 'title present');
    assert(text.includes('Think you can beat me?'));
  });

  it('round-trips a challenge through the URL', () => {
    const url = challengeUrl('Rahul Singh', 2450);
    const parsed = parseChallenge(new URL(url).search);
    equal(parsed.name, 'Rahul Singh');
    equal(parsed.score, 2450);
  });

  it('handles long names and special characters', () => {
    const nasty = 'Śrī & “Ravi” <script>alert(1)</script> 🪔';
    const url = challengeUrl(nasty, 999);
    const parsed = parseChallenge(new URL(url).search);
    equal(parsed.name, sanitizeName(nasty, 18));
    assert(!url.includes('<script>'), 'query is percent-encoded');
    const text = buildShareText({ score: 999, title: 'LIGHT KEEPER', name: parsed.name });
    assert(encodeURIComponent(text).length > 0);
  });

  it('ignores malformed or hostile challenge params', () => {
    equal(parseChallenge('?c=&s=100'), null);
    equal(parseChallenge('?c=Rahul&s=abc'), null);
    equal(parseChallenge('?c=Rahul&s=-5'), null);
    equal(parseChallenge(''), null);
  });
});

describe('Stage definitions', () => {
  it('has five stages with sane timings and missions', () => {
    equal(STAGE_DEFS.length, 5);
    let total = 0;
    for (const d of STAGE_DEFS) {
      assert(d.id && d.name && d.hint && d.icon, `${d.id} metadata missing`);
      assert(d.duration >= 12 && d.duration <= 30, `${d.id} duration ${d.duration} out of range`);
      assert(d.missionGoal > 0, `${d.id} needs a mission goal`);
      total += d.duration;
    }
    assert(total >= 75 && total <= 95, `total gameplay ${total}s should sit in the 75–95s window`);
  });
});

runAll();
