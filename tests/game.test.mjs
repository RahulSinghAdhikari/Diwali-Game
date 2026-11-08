/**
 * End-to-end: boots the real game in jsdom and plays a complete five-stage
 * run (including the boss fight, power-ups, record capture and sharing).
 */

import { describe, it, assert, equal, runAll } from './run.mjs';
import { setupGame, advance, click, tapStage, activeScreen } from './harness.mjs';
import { specKey } from '../js/stages/rangoli-rush.js';

const STEP = 32;

function stage(api) { return api.engine.stage; }

function dragTo(window, x, y) {
  const area = window.document.querySelector('#stage-area');
  const down = new window.Event('pointerdown', { bubbles: true });
  down.clientX = x; down.clientY = y; down.pointerId = 1; down.pointerType = 'touch'; down.button = 0;
  area.dispatchEvent(down);
  const move = new window.Event('pointermove', { bubbles: true });
  move.clientX = x; move.clientY = y; move.pointerId = 1; move.pointerType = 'touch';
  area.dispatchEvent(move);
}

async function enterStage(ctx, expectName) {
  // stage intro → START
  for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'stage-intro'; i++) await advance(100, STEP);
  equal(activeScreen(ctx.document), 'stage-intro', 'stage intro should be visible');
  if (expectName) {
    equal(ctx.document.querySelector('#si-name').textContent, expectName);
  }
  click(ctx.document, '[data-action="begin-stage"]');
  for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'play'; i++) await advance(100, STEP);
  equal(activeScreen(ctx.document), 'play', 'play screen should be visible');
  await advance(800, STEP);   // lead-in
}

async function playLightRush(ctx) {
  const { api, window } = ctx;
  let guard = 0;
  while (stage(api) && stage(api).diyas && guard++ < 120) {
    for (const d of stage(api).diyas) {
      if (!d.lit) tapStage(window, d.x, d.y);
    }
    await advance(250, STEP);
  }
}

async function playRangoli(ctx) {
  const { api, document } = ctx;
  let guard = 0;
  while (stage(api) && stage(api).els && guard++ < 80) {
    const target = stage(api).current;
    if (target && !stage(api).locked) {
      const key = specKey(target);
      const btn = [...document.querySelectorAll('.rtile')].find((b) => b.dataset.spec === key);
      if (btn) {
        const ev = new ctx.window.Event('pointerdown', { bubbles: true, cancelable: true });
        ev.clientX = 50; ev.clientY = 50; ev.pointerId = 1; ev.pointerType = 'touch';
        btn.dispatchEvent(ev);
      }
    }
    await advance(300, STEP);
  }
}

async function playFireworks(ctx) {
  const { api, window } = ctx;
  let guard = 0;
  while (stage(api) && stage(api).rockets && guard++ < 140) {
    const rockets = stage(api).rockets;
    // The stage resolves a tap to the TOPMOST rocket under the point (it scans
    // the array backwards). A careful player therefore never aims at a good
    // rocket that has a dud drawn over it.
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.variant === 'dud') continue;
      const covered = rockets.slice(i + 1).some((o) => {
        if (o.variant !== 'dud') return false;
        const rr = Math.max(o.size * 0.46, 32);
        return (o.x - r.x) ** 2 + (o.y - r.y) ** 2 <= rr * rr;
      });
      if (!covered) tapStage(window, r.x, r.y);
    }
    await advance(150, STEP);
  }
}

async function playMithai(ctx) {
  const { api, window } = ctx;
  let guard = 0;
  while (stage(api) && stage(api).items && guard++ < 200) {
    const s = stage(api);
    const sweets = s.items.filter((i) => i.kind !== 'bad').sort((a, b) => b.y - a.y);
    if (sweets[0]) dragTo(window, sweets[0].x, s.basketY);
    await advance(90, STEP);
  }
}

async function playBoss(ctx, { usePowers = true } = {}) {
  const { api, window, document } = ctx;
  let guard = 0;
  let powered = false;
  const report = { used: 0, livesGained: 0 };
  while (stage(api) && stage(api).weakPoints && guard++ < 260) {
    const s = stage(api);
    if (usePowers && !powered && s.hp < 80) {
      powered = true;
      const livesBefore = s.lives;
      document.querySelectorAll('.pw').forEach((btn) => {
        const ev = new window.Event('pointerdown', { bubbles: true, cancelable: true });
        btn.dispatchEvent(ev);
      });
      report.used = document.querySelectorAll('.pw.is-used').length;
      report.livesGained = s.lives - livesBefore;
      report.flameActive = s.powers.flame.active > 0;
      report.shieldActive = s.powers.shield.active > 0;
      report.stunned = s.stunTimer > 0;
    }
    if (s.finalStrike?.core) {
      tapStage(window, s.finalStrike.core.x, s.finalStrike.core.y);
    }
    for (const wp of s.weakPoints) tapStage(window, wp.x, wp.y);
    // dodge: keep the lamp far from the nearest orb
    const orb = s.orbs[0];
    if (orb) {
      const safeX = orb.x < api.engine.W / 2 ? api.engine.W - 30 : 30;
      dragTo(window, safeX, s.lampY);
    }
    await advance(110, STEP);
  }
  return report;
}

/** Click through whatever the game shows until it reaches the results flow. */
async function advanceToResults(ctx, { play = null } = {}) {
  for (let i = 0; i < 400; i++) {
    const screen = activeScreen(ctx.document);
    if (screen === 'results' || screen === 'name-entry') return screen;
    if (screen === 'stage-intro') click(ctx.document, '[data-action="begin-stage"]');
    else if (screen === 'stage-complete') click(ctx.document, '[data-action="next-stage"]');
    else if (screen === 'defeat') click(ctx.document, '[data-action="skip-to-results"]');
    else if (screen === 'victory') click(ctx.document, '[data-action="to-results"]');
    else if (screen === 'play' && play) await play(ctx);
    await advance(300, STEP);
  }
  return activeScreen(ctx.document);
}

/* ------------------------------- the tests ------------------------------- */

describe('Boot + home screen', () => {
  let ctx;

  it('boots to the splash then lands on home', async () => {
    ctx = await setupGame();
    equal(activeScreen(ctx.document), 'splash');
    await advance(4200, STEP);
    equal(activeScreen(ctx.document), 'home');
  });

  it('renders the record card, stats and no challenge banner', () => {
    const doc = ctx.document;
    equal(doc.querySelector('#record-name').textContent, 'No champion yet');
    equal(doc.querySelector('#record-score').textContent, '0');
    equal(doc.querySelector('#record-scope').textContent, 'THIS DEVICE');
    equal(doc.querySelector('#stat-ach').textContent, '0');
    assert(doc.querySelector('#challenge-banner').hidden, 'no challenge without params');
  });

  it('how-to-play opens and returns home', async () => {
    click(ctx.document, '[data-action="howto"]');
    await advance(600, STEP);
    equal(activeScreen(ctx.document), 'howto');
    assert(ctx.document.querySelectorAll('.howto-card').length === 5, 'one card per stage');
    click(ctx.document, '[data-screen="howto"] [data-action="back-home"]');
    await advance(600, STEP);
    equal(activeScreen(ctx.document), 'home');
  });

  it('the achievement collection lists all 8 badges as locked', async () => {
    click(ctx.document, '[data-action="open-achievements"]');
    await advance(600, STEP);
    equal(ctx.document.querySelectorAll('.ach-tile').length, 8);
    equal(ctx.document.querySelectorAll('.ach-tile.is-locked').length, 8);
    click(ctx.document, '[data-screen="achievements"] [data-action="back-home"]');
    await advance(600, STEP);
  });

  it('sound + settings toggles flip state', async () => {
    const doc = ctx.document;
    const sound = doc.querySelector('[data-action="toggle-sound"]');
    equal(sound.getAttribute('aria-pressed'), 'true');
    click(doc, '[data-action="toggle-sound"]');
    equal(sound.getAttribute('aria-pressed'), 'false');
    click(doc, '[data-action="toggle-sound"]');
    equal(sound.getAttribute('aria-pressed'), 'true');

    click(doc, '[data-action="open-settings"]');
    assert(!doc.querySelector('#settings-modal').hidden);
    const motion = doc.querySelector('[data-toggle="reducedMotion"]');
    click(doc, motion);
    equal(motion.getAttribute('aria-checked'), 'true');
    assert(doc.body.classList.contains('reduce-motion'));
    click(doc, motion);
    equal(motion.getAttribute('aria-checked'), 'false');
    click(doc, '[data-action="close-settings"]');
    assert(doc.querySelector('#settings-modal').hidden);
  });

  it('reports no console errors so far', () => {
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });
});

describe('A full five-stage run', () => {
  let ctx;
  let scoreAfterStage1 = 0;

  it('PLAY NOW starts stage 1', async () => {
    ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    equal(ctx.document.querySelector('#hud-stagenum').textContent, 'STAGE 1/5');
    equal(ctx.document.querySelector('#hud-missionlabel').textContent, 'Light 15 diyas');
  });

  it('Light Rush scores, builds combos and completes its mission', async () => {
    await playLightRush(ctx);
    const res = ctx.api.state.stageResults[0];
    assert(res, 'stage 1 result recorded');
    assert(res.score > 150, `expected a healthy score, got ${res.score}`);
    assert(res.bestCombo >= 5, `expected a combo chain, got ${res.bestCombo}`);
    assert(res.missionNow >= 15, `mission should complete, got ${res.missionNow}`);
    assert(res.missionDone, 'mission flag set');
    scoreAfterStage1 = ctx.api.state.score;
    equal(ctx.api.state.score, res.score);
  });

  it('shows the stage-clear screen with the Golden Flame collectible', async () => {
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'stage-complete'; i++) await advance(100, STEP);
    equal(activeScreen(ctx.document), 'stage-complete');
    equal(ctx.document.querySelector('#sc-collectible-name').textContent, 'GOLDEN FLAME');
    assert(ctx.document.querySelector('#sc-collectible-desc').textContent.includes('EMPOWERED'), 'mission makes the power empowered');
    assert(ctx.api.state.collectibles.includes('golden-flame'));
    assert(Number(ctx.document.querySelector('#sc-xp').textContent.replace('+', '')) > 0, 'XP awarded');
  });

  it('unlocks the First Light achievement from real gameplay', async () => {
    await advance(900, STEP);
    assert(ctx.api.state.achievementsUnlocked.some((a) => a.id === 'first-light'),
      `unlocked: ${ctx.api.state.achievementsUnlocked.map((a) => a.id).join(',') || 'none'}`);
    assert(ctx.document.querySelector('.ach-pop'), 'an unlock animation is shown');
  });

  it('Rangoli Rush matches patterns by data and awards the Rainbow Rangoli', async () => {
    click(ctx.document, '[data-action="next-stage"]');
    await enterStage(ctx, 'RANGOLI RUSH');
    await playRangoli(ctx);
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'stage-complete'; i++) await advance(100, STEP);
    await advance(900, STEP);
    const res = ctx.api.state.stageResults[1];
    equal(res.id, 'rangoli-rush');
    equal(res.stats.correct, 4, 'all four rounds matched');
    equal(res.stats.wrong, 0, 'no wrong taps when picking by pattern data');
    assert(res.score >= 500, `rangoli score ${res.score}`);
    assert(ctx.api.state.collectibles.includes('rainbow-rangoli'));
    assert(ctx.api.state.achievementsUnlocked.some((a) => a.id === 'pattern-master'), 'Pattern Master unlocked');
  });

  it('Firework Frenzy pops rockets and keeps a streak', async () => {
    click(ctx.document, '[data-action="next-stage"]');
    await enterStage(ctx, 'FIREWORK FRENZY');
    await playFireworks(ctx);
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'stage-complete'; i++) await advance(100, STEP);
    const res = ctx.api.state.stageResults[2];
    equal(res.id, 'firework-frenzy');
    assert(res.stats.hits >= 10, `hits ${res.stats.hits}`);
    equal(res.stats.duds, 0, 'never tapped a dud');
    assert(res.stats.bestStreak >= 10, `streak ${res.stats.bestStreak}`);
    assert(ctx.api.state.collectibles.includes('spark-celebration'));
  });

  it('Mithai Mania catches falling sweets with the dragged basket', async () => {
    click(ctx.document, '[data-action="next-stage"]');
    await enterStage(ctx, 'MITHAI MANIA');
    await playMithai(ctx);
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'stage-complete'; i++) await advance(100, STEP);
    const res = ctx.api.state.stageResults[3];
    equal(res.id, 'mithai-mania');
    assert(res.stats.sweets >= 10, `sweets ${res.stats.sweets}`);
    assert(ctx.api.state.collectibles.includes('golden-mithai'));
    equal(ctx.api.state.collectibles.length, 4, 'all four collectibles earned');
  });

  it('Boss battle: power-ups fire, health drains and the darkness falls', async () => {
    click(ctx.document, '[data-action="next-stage"]');
    await enterStage(ctx, 'DEFEAT THE DARKNESS');
    assert(!ctx.document.querySelector('#powerbar').hidden, 'power bar visible');
    equal(ctx.document.querySelectorAll('.pw').length, 4, 'four power-ups available');
    equal(ctx.document.querySelectorAll('.pw.is-ready').length, 4, 'all unlocked by collectibles');

    const report = await playBoss(ctx);
    equal(report.used, 4, 'all four collectible powers were spent');
    assert(report.flameActive, 'Golden Flame grants bonus damage time');
    assert(report.shieldActive, 'Rainbow Rangoli raises a barrier');
    assert(report.stunned, 'Spark of Celebration stuns the darkness');
    assert(report.livesGained >= 1, 'Golden Mithai grants an extra mistake');

    for (let i = 0; i < 60 && activeScreen(ctx.document) !== 'victory'; i++) await advance(100, STEP);
    equal(activeScreen(ctx.document), 'victory', 'victory cinematic shown');
    assert(ctx.api.state.boss.defeated, 'boss defeated flag');
    const res = ctx.api.state.stageResults[4];
    equal(res.stats.defeated, true);
    equal(res.stats.hpLeft, 0);
  });

  it('asks for a name because this is the first record (scenario A)', async () => {
    click(ctx.document, '[data-action="to-results"]');
    for (let i = 0; i < 60 && activeScreen(ctx.document) !== 'name-entry'; i++) await advance(100, STEP);
    await advance(700, STEP);
    equal(activeScreen(ctx.document), 'name-entry');
    assert(ctx.document.querySelector('#ne-prev').textContent.includes('first champion'));
    const score = ctx.api.state.score;
    assert(score > 1000, `full run should score well, got ${score}`);
  });

  it('claims the record and stores only name + score', async () => {
    const doc = ctx.document;
    doc.querySelector('#player-name').value = '  Rahul  ';
    doc.querySelector('#name-form').dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await advance(1200, STEP);
    const stored = JSON.parse(ctx.window.localStorage.getItem('diwali-dhamaka.v1.record'));
    equal(stored.name, 'Rahul');
    equal(stored.score, ctx.api.state.score);
    const keys = Object.keys(stored).sort();
    equal(keys.join(','), 'at,name,score', 'no extra personal data is stored');
  });

  it('shows the results summary with title, collection and breakdown', async () => {
    for (let i = 0; i < 60 && activeScreen(ctx.document) !== 'results'; i++) await advance(100, STEP);
    equal(activeScreen(ctx.document), 'results');
    const doc = ctx.document;
    await advance(1500, STEP);
    equal(doc.querySelector('#res-score').textContent.replace(/,/g, ''), String(ctx.api.state.score));
    equal(doc.querySelector('#res-stages').textContent, '5/5');
    assert(!doc.querySelector('#res-newrec').hidden, 'new-high-score flag shown');
    equal(doc.querySelectorAll('#res-collectibles .collect-item').length, 4);
    equal(doc.querySelectorAll('#res-collectibles .collect-item.is-missing').length, 0);
    equal(doc.querySelectorAll('#res-breakdown li').length, 5);
    assert(doc.querySelectorAll('#res-achievements .ach-chip').length >= 4, 'achievements listed');
    assert(doc.querySelector('#res-title').textContent.length > 3, 'performance title set');
    equal(doc.querySelector('#res-boss').textContent.includes('DEFEAT') || doc.querySelector('#res-boss').textContent === 'FLAWLESS', true);
  });

  it('persists XP, best score and achievements to the profile', () => {
    const profile = JSON.parse(ctx.window.localStorage.getItem('diwali-dhamaka.v1.profile'));
    equal(profile.bestScore, ctx.api.state.score);
    assert(profile.xp > 200, `xp ${profile.xp}`);
    equal(profile.runs, 1);
    assert(Object.keys(profile.achievements).length >= 4);
    equal(profile.lastName, 'Rahul');
  });

  it('builds a share card + challenge message', async () => {
    click(ctx.document, '[data-action="challenge-friends"]');
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'share'; i++) await advance(100, STEP);
    equal(activeScreen(ctx.document), 'share');
    const text = ctx.document.querySelector('#share-text').textContent;
    assert(text.includes('Diwali Dhamaka'), 'branded');
    assert(text.includes('Think you can beat me?'));
    assert(text.includes('play.example.com'), 'real deployment URL, not a placeholder');
    const note = ctx.document.querySelector('#share-url-note').textContent;
    assert(note.includes('c=Rahul'), `challenge link carries the name: ${note}`);
    assert(note.includes(`s=${ctx.api.state.score}`), 'challenge link carries the score');
  });

  it('copies the challenge to the clipboard', async () => {
    let copied = '';
    Object.defineProperty(ctx.window.navigator, 'clipboard', {
      value: { writeText: async (t) => { copied = t; return true; } }, configurable: true
    });
    click(ctx.document, '[data-action="share-copy"]');
    await advance(400, STEP);
    assert(copied.includes('Think you can beat me?'), 'clipboard received the challenge');
  });

  it('completed the whole run without console errors', () => {
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });
});

describe('Record rules in the live game', () => {
  it('a lower score never asks for a name (scenario B)', async () => {
    const ctx = await setupGame();
    ctx.window.localStorage.setItem('diwali-dhamaka.v1.record', JSON.stringify({ name: 'Asha', score: 99999, at: null }));
    await ctx.api.RecordStore.load();
    await advance(4200, STEP);
    equal(ctx.document.querySelector('#record-name').textContent, 'Asha');

    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx);
    // tap a couple of diyas only, then idle through the rest of the run
    for (let i = 0; i < 3; i++) {
      const s = stage(ctx.api);
      if (s?.diyas?.length) tapStage(ctx.window, s.diyas[0].x, s.diyas[0].y);
      await advance(500, STEP);
    }
    assert(ctx.api.state.score > 0, 'scored something');

    // let the rest of the run play itself out without any further input
    const reached = await advanceToResults(ctx);
    await advance(900, STEP);

    equal(activeScreen(ctx.document), 'results', 'goes straight to results');
    assert(ctx.document.querySelector('#res-newrec').hidden, 'no new-record flag');
    const stored = JSON.parse(ctx.window.localStorage.getItem('diwali-dhamaka.v1.record'));
    equal(stored.name, 'Asha', 'record untouched');
    equal(stored.score, 99999);
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });

  it('an equal score keeps the existing champion (scenario D)', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    const evalTie = ctx.api.RecordStore.evaluate.bind(ctx.api.RecordStore);
    ctx.api.RecordStore.record = { name: 'Asha', score: 1500 };
    equal(evalTie(1500).shouldAskName, false);
    equal(evalTie(1500).reason, 'tie');
    equal(evalTie(1501).shouldAskName, true);
  });

  it('a stored record survives a reload', async () => {
    const seeded = { name: 'Priya', score: 3210, at: new Date().toISOString() };
    const ctx = await setupGame({ url: 'https://play.example.com/diwali/' });
    ctx.window.localStorage.setItem('diwali-dhamaka.v1.record', JSON.stringify(seeded));
    // simulate a reload: re-read through the public API
    await ctx.api.RecordStore.load();
    equal(ctx.api.RecordStore.record.name, 'Priya');
    equal(ctx.api.RecordStore.record.score, 3210);
    equal(ctx.api.RecordStore.isGlobal, false, 'never claims to be global without a backend');
  });
});

describe('Losing the boss fight', () => {
  let ctx;

  it('idling through the run reaches a friendly defeat screen', async () => {
    ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');

    // walk to the boss without playing any stage
    for (let i = 0; i < 400; i++) {
      const screen = activeScreen(ctx.document);
      if (screen === 'defeat') break;
      if (screen === 'stage-intro') click(ctx.document, '[data-action="begin-stage"]');
      else if (screen === 'stage-complete') click(ctx.document, '[data-action="next-stage"]');
      await advance(300, STEP);
    }
    equal(activeScreen(ctx.document), 'defeat');
    assert(ctx.document.querySelector('#df-hp').textContent.endsWith('%'), 'shows damage dealt');
    assert(!ctx.api.state.boss.defeated);
  });

  it('RETRY replays only the boss and keeps the score', async () => {
    const scoreBefore = ctx.api.state.score;
    const resultsBefore = ctx.api.state.stageResults.length;
    click(ctx.document, '[data-action="retry-boss"]');
    for (let i = 0; i < 60 && activeScreen(ctx.document) !== 'stage-intro'; i++) await advance(100, STEP);
    equal(ctx.document.querySelector('#si-name').textContent, 'DEFEAT THE DARKNESS', 'retries the boss, not stage 1');
    equal(ctx.api.state.score, scoreBefore, 'score is kept across the retry');
    equal(ctx.api.state.stageResults.length, resultsBefore - 1,
      `the failed attempt is discarded (before ${resultsBefore}, now ${ctx.api.state.stageResults.length})`);

    click(ctx.document, '[data-action="begin-stage"]');
    for (let i = 0; i < 40 && activeScreen(ctx.document) !== 'play'; i++) await advance(100, STEP);
    await advance(800, STEP);
    const report = await playBoss(ctx);
    for (let i = 0; i < 60 && activeScreen(ctx.document) !== 'victory'; i++) await advance(100, STEP);
    equal(activeScreen(ctx.document), 'victory', 'the retry can be won');
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });

  it('SEE RESULTS from a defeat still produces a full summary', async () => {
    const c2 = await setupGame();
    c2.window.localStorage.setItem('diwali-dhamaka.v1.record', JSON.stringify({ name: 'Asha', score: 99999 }));
    await c2.api.RecordStore.load();
    await advance(4200, STEP);
    click(c2.document, '.home__cta [data-action="play"]');
    const screen = await advanceToResults(c2);
    await advance(1200, STEP);
    equal(screen, 'results');
    equal(c2.document.querySelector('#res-eyebrow').textContent, 'THE QUEST CONTINUES');
    assert(c2.document.querySelector('#res-boss').textContent.includes('DRAINED'));
    assert(c2.document.querySelectorAll('#res-collectibles .collect-item.is-missing').length >= 3,
      'collectibles are only earned by actually playing a stage');
    equal(c2.document.querySelectorAll('#res-breakdown .stage-break__mission.ok').length, 0, 'no missions completed');
    equal(c2.errors.length, 0, `errors: ${c2.errors.join(' | ')}`);
  });
});

describe('Accessibility + preferences', () => {
  it('plays with the keyboard alone', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    const before = ctx.api.state.score;
    for (let i = 0; i < 20; i++) {
      ctx.window.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await advance(200, STEP);
    }
    assert(ctx.api.state.score > before, `keyboard assist should score, got ${ctx.api.state.score}`);
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });

  it('honours prefers-reduced-motion from the OS', async () => {
    const ctx = await setupGame({ reducedMotion: true });
    await advance(4200, STEP);
    assert(ctx.document.body.classList.contains('reduce-motion'), 'reduced-motion class applied at boot');
  });

  it('Escape and P pause an active stage', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    ctx.window.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(ctx.api.engine.paused, 'Escape pauses');
    ctx.window.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!ctx.api.engine.paused, 'Escape resumes');
    ctx.window.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    assert(ctx.api.engine.paused, 'P pauses');
  });

  it('every interactive control has an accessible name', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    const unlabelled = [...ctx.document.querySelectorAll('button, [role="switch"], input')].filter((el) => {
      const text = (el.textContent || '').trim();
      return !text && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.labels?.length;
    });
    equal(unlabelled.length, 0, `unlabelled: ${unlabelled.map((e) => e.outerHTML.slice(0, 70)).join(' | ')}`);
  });

  it('reset data clears the record and profile', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    ctx.window.localStorage.setItem('diwali-dhamaka.v1.record', JSON.stringify({ name: 'Asha', score: 900 }));
    await ctx.api.RecordStore.load();
    click(ctx.document, '[data-action="open-settings"]');
    click(ctx.document, '[data-action="reset-data"]');
    await advance(600, STEP);
    equal(ctx.window.localStorage.getItem('diwali-dhamaka.v1.record'), null);
    equal(ctx.document.querySelector('#record-name').textContent, 'No champion yet');
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });
});

describe('Challenge links', () => {
  it('shows a challenge banner and still plays normally', async () => {
    const ctx = await setupGame({ url: 'https://play.example.com/diwali/?c=Rahul%20Singh&s=2450' });
    await advance(4200, STEP);
    const banner = ctx.document.querySelector('#challenge-banner');
    assert(!banner.hidden, 'banner visible');
    equal(ctx.document.querySelector('#challenge-title').textContent, 'RAHUL SINGH CHALLENGES YOU!');
    equal(ctx.document.querySelector('#challenge-score').textContent, '2,450');
    // the challenge is NOT treated as the device record
    equal(ctx.document.querySelector('#record-name').textContent, 'No champion yet');
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    equal(activeScreen(ctx.document), 'play');
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });
});

describe('Pause, quit and resilience', () => {
  it('pauses, resumes and quits back home', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');

    click(ctx.document, '[data-action="pause"]');
    assert(!ctx.document.querySelector('#pause-overlay').hidden, 'overlay shown');
    assert(ctx.api.engine.paused, 'engine paused');
    const t = ctx.api.engine.timeLeft;
    await advance(1000, STEP);
    equal(ctx.api.engine.timeLeft, t, 'the clock does not run while paused');

    click(ctx.document, '[data-action="resume"]');
    assert(!ctx.api.engine.paused);
    await advance(500, STEP);
    assert(ctx.api.engine.timeLeft < t, 'the clock resumes');

    click(ctx.document, '[data-action="pause"]');
    click(ctx.document, '[data-action="quit-run"]');
    await advance(800, STEP);
    equal(activeScreen(ctx.document), 'home');
    assert(!ctx.api.engine.running, 'engine stopped');
    assert(ctx.document.querySelector('#powerbar').hidden);
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });

  it('auto-pauses when the tab is hidden', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    Object.defineProperty(ctx.document, 'hidden', { value: true, configurable: true });
    ctx.document.dispatchEvent(new ctx.window.Event('visibilitychange'));
    assert(ctx.api.engine.paused, 'paused when hidden');
    assert(!ctx.document.querySelector('#pause-overlay').hidden);
  });

  it('survives a mid-stage resize', async () => {
    const ctx = await setupGame();
    await advance(4200, STEP);
    click(ctx.document, '.home__cta [data-action="play"]');
    await enterStage(ctx, 'LIGHT RUSH');
    ctx.window.Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 500, width: 320, height: 500, toJSON() {} };
    };
    ctx.api.engine.resize();
    await advance(1500, STEP);
    equal(ctx.api.engine.W, 320);
    assert(ctx.api.engine.running, 'still playing after a resize');
    equal(ctx.errors.length, 0, `errors: ${ctx.errors.join(' | ')}`);
  });
});

runAll();
