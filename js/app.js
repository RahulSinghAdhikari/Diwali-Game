/**
 * APP — boots the game, owns the screen flow and wires every system together.
 *
 *   splash → home → (stage intro → play → stage clear) ×4
 *          → boss intro → boss fight → victory | retry
 *          → [new record? name capture] → results → share
 */

import { CONFIG, gameUrl, isBackendConfigured } from './config.js';
import { $, $$, formatInt, wait, clamp, sanitizeName, prefersReducedMotionOS } from './core/utils.js';
import { ScreenManager } from './core/screens.js';
import { Ambient } from './core/ambient.js';
import { GameEngine } from './game-engine.js';
import { gameState } from './game-state.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import {
  getPrefs, setPref, getProfile, updateProfile, clearAll,
  getFlag, setFlag, storageAvailable
} from './storage.js';
import { RecordStore } from './records.js';
import { titleForScore, xpForStage, levelFromXp, rankForLevel } from './progression.js';
import { ACHIEVEMENTS, COLLECTIBLES, collectibleForStage, evaluateAchievements } from './rewards.js';
import { STAGE_DEFS, STAGE_CLEAR_TITLES, createStage } from './stages/index.js';
import { comboCallout } from './stages/common.js';
import {
  buildShareText, challengeUrl, parseChallenge, renderShareCard,
  shareWhatsApp, nativeShare, canNativeShare, copyText, downloadCard
} from './sharing.js';

/* ------------------------------- DOM refs -------------------------------- */

const el = {
  frame: $('#frame'),
  screens: $('#screens'),
  ambient: $('#ambient-canvas'),
  victoryCanvas: $('#victory-canvas'),
  stageArea: $('#stage-area'),
  canvas: $('#game-canvas'),
  domLayer: $('#dom-layer'),
  hud: $('#hud'),
  powerbar: $('#powerbar'),
  pauseOverlay: $('#pause-overlay'),
  toastStack: $('#toast-stack'),
  achStack: $('#ach-pop-stack'),
  wipe: $('#screen-wipe'),
  settings: $('#settings-modal'),
  shareCanvas: $('#share-canvas')
};

const screens = new ScreenManager(el.screens);
const engine = new GameEngine({ canvas: el.canvas, container: el.stageArea, domLayer: el.domLayer });
const hud = new Hud(el.hud);
const ambient = new Ambient(el.ambient);
const victoryFx = new Ambient(el.victoryCanvas, { celebration: true });
const state = gameState;

let prefs = getPrefs();
let profile = getProfile();
let challenge = null;
let runToken = 0;
let currentDef = null;
let lastResult = null;
let audioUnlocked = false;

/* ------------------------------ preferences ------------------------------ */

function applyPrefs() {
  document.body.classList.toggle('reduce-motion', Boolean(prefs.reducedMotion));
  audio.setMusicEnabled(prefs.music);
  audio.setSfxEnabled(prefs.sfx);
  engine.fx.setReducedMotion(prefs.reducedMotion);
  ambient.setReducedMotion(prefs.reducedMotion);
  victoryFx.setReducedMotion(prefs.reducedMotion);

  $$('[data-toggle]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(Boolean(prefs[btn.dataset.toggle])));
  });
  const soundOn = prefs.music || prefs.sfx;
  $$('[data-action="toggle-sound"]').forEach((btn) => btn.setAttribute('aria-pressed', String(soundOn)));
}

function setPreference(key, value) {
  prefs = setPref(key, value);
  applyPrefs();
}

/* --------------------------------- toasts -------------------------------- */

function toast(message, ms = 2000) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  el.toastStack.appendChild(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 280);
  }, ms);
}

function achievementPop(ach) {
  const node = document.createElement('div');
  node.className = 'ach-pop';
  node.innerHTML = `
    <svg class="ach-pop__ic" viewBox="0 0 48 48" aria-hidden="true"><use href="#${ach.icon}"/></svg>
    <div>
      <p class="ach-pop__k">ACHIEVEMENT UNLOCKED</p>
      <p class="ach-pop__n">${ach.name}</p>
      <p class="ach-pop__xp">+${ach.xp} XP</p>
    </div>`;
  el.achStack.appendChild(node);
  audio.play('achievement');
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

function wipe() {
  el.wipe.classList.remove('is-on');
  void el.wipe.offsetWidth;
  el.wipe.classList.add('is-on');
}

/* ------------------------------- home screen ------------------------------ */

function refreshHome() {
  profile = getProfile();
  const record = RecordStore.record;

  $('#record-name').textContent = record ? record.name : 'No champion yet';
  $('#record-score').textContent = record ? formatInt(record.score) : '0';
  $('#record-scope').textContent = RecordStore.scopeLabel;

  $('#stat-best').textContent = formatInt(profile.bestScore || 0);
  $('#stat-ach').textContent = String(Object.keys(profile.achievements || {}).length);

  const lvl = levelFromXp(profile.xp);
  $('#stat-level').textContent = String(lvl.level);
  $('#xp-fill').style.width = `${Math.round(lvl.progress * 100)}%`;
  $('#xp-text').textContent = `${formatInt(profile.xp)} XP · ${rankForLevel(lvl.level)}`;
}

function renderChallengeBanner() {
  const banner = $('#challenge-banner');
  if (!challenge) { banner.hidden = true; return; }
  banner.hidden = false;
  $('#challenge-title').textContent = `${challenge.name.toUpperCase()} CHALLENGES YOU!`;
  $('#challenge-score').textContent = formatInt(challenge.score);
}

function renderAchievements() {
  const grid = $('#ach-grid');
  const unlocked = profile.achievements || {};
  grid.innerHTML = ACHIEVEMENTS.map((a) => {
    const has = Boolean(unlocked[a.id]);
    return `
      <div class="ach-tile ${has ? '' : 'is-locked'}">
        <div class="ach-tile__ic">
          <svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${has ? a.icon : 'i-lock'}"/></svg>
        </div>
        <div>
          <p class="ach-tile__name">${a.name}</p>
          <p class="ach-tile__desc">${a.desc}</p>
          <p class="ach-tile__xp">+${a.xp} XP</p>
        </div>
      </div>`;
  }).join('');
}

/* ------------------------------ game events ------------------------------- */

state.on('score', ({ total }) => hud.setScore(total));
state.on('combo', (info) => hud.setCombo(info));
state.on('combo-milestone', (info) => {
  comboCallout(engine, info.tag, info.level);
  audio.play('combo', { level: info.level });
});
state.on('mission', (info) => hud.setMission(info, { boss: currentDef?.id === 'boss-battle' }));
state.on('mission-complete', () => {
  toast('MISSION COMPLETE!', 1600);
  hud.flash();
  audio.play('stage-clear');
});

/* -------------------------------- run flow -------------------------------- */

const aborted = (token) => token !== runToken;

async function startRun() {
  const token = ++runToken;
  state.reset();
  hud.setScore(0, { bump: false });
  currentDef = null;
  wipe();

  for (let i = 0; i < 4; i++) {
    const def = STAGE_DEFS[i];
    await stageIntro(def);
    if (aborted(token)) return;
    const res = await playStage(def);
    if (aborted(token) || res.reason === 'abort') return;
    await stageComplete(def, res);
    if (aborted(token)) return;
  }

  // ---- boss loop (retry keeps the score earned so far)
  const bossDef = STAGE_DEFS[4];
  let settled = false;
  while (!settled) {
    await stageIntro(bossDef);
    if (aborted(token)) return;
    const res = await playStage(bossDef);
    if (aborted(token) || res.reason === 'abort') return;

    if (res.reason === 'victory') {
      settled = true;
      await victoryCinematic();
      if (aborted(token)) return;
    } else {
      const choice = await defeatScreen(res);
      if (aborted(token)) return;
      if (choice === 'retry') {
        state.stageResults.pop();      // drop the failed attempt, keep the score
        continue;
      }
      settled = true;
    }
  }

  await finishRun(token);
}

async function stageIntro(def) {
  currentDef = def;
  $('#si-num').textContent = `STAGE ${def.index + 1} OF 5`;
  $('#si-icon').innerHTML = `<svg viewBox="0 0 ${def.icon.startsWith('c-') ? 64 : 48} ${def.icon.startsWith('c-') ? 64 : 48}"><use href="#${def.icon}"/></svg>`;
  $('#si-name').textContent = def.name;
  $('#si-mission').textContent = def.id === 'boss-battle' ? 'Defeat the darkness monster!' : `${def.missionLabel}!`;
  $('#si-hint').textContent = def.hint;

  const bar = $('#si-bar');
  bar.style.transition = 'none';
  bar.style.width = '0%';

  const hold = 2600;
  // Arm the START button before the transition so an eager tap always lands.
  const choice = waitForChoice({ start: '[data-action="begin-stage"]' }, { timeout: hold + 420 });

  await screens.show('stage-intro');
  await wait(30);
  bar.style.transition = `width ${hold}ms linear`;
  bar.style.width = '100%';

  await choice;
}

async function playStage(def) {
  currentDef = def;
  state.beginStage({
    id: def.id,
    index: def.index,
    name: def.name,
    missionGoal: def.missionGoal,
    missionLabel: def.missionLabel
  });
  hud.setStage(def);
  hud.setScore(state.score, { bump: false });
  el.powerbar.hidden = def.id !== 'boss-battle';

  await screens.show('play');
  audio.startMusic(def.music || 'play');

  const stage = createStage(def.id, state, { powerbarEl: el.powerbar, hudEl: el.hud });
  const out = await engine.runStage(stage, def.duration, {
    onTick: (left) => hud.setTime(left, def.duration)
  });

  const stats = stage.summary ? stage.summary() : {};
  const stageResult = out.reason === 'abort' ? null : state.endStage(stats);
  engine.stopStage();
  el.powerbar.hidden = true;

  if (def.id === 'boss-battle' && stageResult) {
    state.boss.hpPercentLeft = stats.hpLeft ?? 0;
    state.boss.mistakes = stats.mistakes ?? 0;
    state.boss.defeated = Boolean(stats.defeated);
  }

  return { reason: out.reason, stats, stageResult };
}

async function stageComplete(def, res) {
  const result = res.stageResult;
  if (!result) return;

  // A collectible is a reward for actually playing the stage: you must make
  // progress on the mission to earn it. Finishing the mission empowers it.
  const earned = result.missionNow > 0;
  const collectible = earned ? state.awardCollectibleForStage(def.id) : collectibleForStage(def.id);
  const xp = xpForStage(result);
  state.xpEarned += xp;

  $('#sc-eyebrow').textContent = `STAGE ${def.index + 1} CLEARED`;
  $('#sc-title').textContent = STAGE_CLEAR_TITLES[def.id] || 'STAGE CLEARED';
  const reveal = $('#sc-collectible');
  reveal.classList.toggle('is-missed', !earned);
  if (collectible) {
    $('#sc-collectible-use').setAttribute('href', `#${collectible.icon}`);
    $('#sc-collectible-name').textContent = earned ? collectible.name : `${collectible.name} MISSED`;
    $('#sc-collectible-desc').textContent = !earned
      ? `Score in this stage to earn it — you will need its power against the darkness.`
      : result.missionDone
        ? `${collectible.desc} Mission complete — this power is EMPOWERED!`
        : collectible.desc;
  }
  $('#sc-score').textContent = formatInt(result.score);
  $('#sc-mission').textContent = `${result.missionNow}/${result.missionGoal}`;
  $('#sc-combo').textContent = `×${result.bestCombo || 0}`;
  $('#sc-xp').textContent = `+${xp}`;

  audio.play('stage-clear');
  const choice = waitForChoice({ next: '[data-action="next-stage"]' }, { timeout: 4000 });
  await screens.show('stage-complete');
  unlockAchievements();
  await choice;
}

/**
 * Arms the listeners for a set of buttons BEFORE the screen animates in, so a
 * fast tap during the transition is never swallowed. Returns the id of the
 * button that was pressed (or whatever the timeout resolves to).
 */
function waitForChoice(map, { timeout = 0, timeoutValue = 'timeout' } = {}) {
  const entries = Object.entries(map)
    .map(([value, selector]) => [value, $(selector)])
    .filter(([, node]) => node);

  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      entries.forEach(([value2, node]) => node.removeEventListener('click', handlers[value2]));
      resolve(value);
    };
    const handlers = {};
    entries.forEach(([value, node]) => {
      handlers[value] = () => finish(value);
      node.addEventListener('click', handlers[value]);
    });
    if (timeout > 0) timer = setTimeout(() => finish(timeoutValue), timeout);
  });
}

async function defeatScreen(res) {
  $('#df-hp').textContent = `${Math.max(0, 100 - (res.stats.hpLeft ?? 100))}%`;
  const choice = waitForChoice({
    retry: '[data-action="retry-boss"]',
    results: '[data-action="skip-to-results"]'
  });
  await screens.show('defeat');
  return choice;
}

async function victoryCinematic() {
  const choice = waitForChoice({ next: '[data-action="to-results"]' }, { timeout: 5600 });
  await screens.show('victory');
  victoryFx.start();
  audio.play('victory');
  audio.startMusic('menu');
  await choice;
  victoryFx.stop();
}

/* ------------------------------- achievements ----------------------------- */

function unlockAchievements() {
  const owned = new Set([
    ...Object.keys(profile.achievements || {}),
    ...state.achievementsUnlocked.map((a) => a.id)
  ]);
  const run = {
    score: state.score,
    comboBest: state.comboBest,
    stageResults: state.stageResults,
    boss: state.boss
  };
  const fresh = evaluateAchievements(run, owned);
  fresh.forEach((a, i) => {
    state.achievementsUnlocked.push(a);
    setTimeout(() => achievementPop(a), i * 620);
  });
  return fresh;
}

/* --------------------------------- results -------------------------------- */

async function finishRun(token) {
  unlockAchievements();

  const summary = state.summary();
  const score = summary.score;
  const title = titleForScore(score);
  const xpTotal = state.xpEarned + summary.achievementsUnlocked.reduce((s, a) => s + a.xp, 0);

  // persist profile
  const achMap = { ...(profile.achievements || {}) };
  const now = Date.now();
  summary.achievementsUnlocked.forEach((a) => { achMap[a.id] = now; });
  profile = updateProfile({
    xp: (profile.xp || 0) + xpTotal,
    runs: (profile.runs || 0) + 1,
    bestScore: Math.max(profile.bestScore || 0, score),
    bestCombo: Math.max(profile.bestCombo || 0, summary.comboBest),
    achievements: achMap
  });

  const decision = RecordStore.evaluate(score);
  lastResult = { score, title, summary, xpTotal, decision, name: profile.lastName || '' };

  // Scenario A / C → celebrate + capture the name BEFORE the summary.
  if (decision.shouldAskName) {
    const saved = await nameCapture(score, decision);
    if (aborted(token)) return;
    lastResult.name = saved;
  }

  populateResults();
  await screens.show('results');
  if (aborted(token)) return;
  animateCount($('#res-score'), score, 1100);
  refreshHome();
}

function populateResults() {
  const { score, title, summary, xpTotal, decision } = lastResult;
  const boss = summary.boss;

  $('#res-eyebrow').textContent = boss.defeated ? 'FESTIVAL QUEST COMPLETE' : 'THE QUEST CONTINUES';
  $('#res-title').textContent = title.name;
  $('#res-title-icon').setAttribute('href', `#${title.icon}`);
  $('#res-score').textContent = '0';
  $('#res-xp').textContent = `+${formatInt(xpTotal)}`;
  $('#res-stages').textContent = `${summary.stageResults.length}/5`;
  $('#res-combo').textContent = `×${summary.comboBest}`;
  $('#res-boss').textContent = boss.defeated
    ? (boss.mistakes === 0 ? 'FLAWLESS' : 'DEFEATED')
    : `${Math.max(0, 100 - boss.hpPercentLeft)}% DRAINED`;

  const newRec = $('#res-newrec');
  newRec.hidden = !(decision.shouldAskName && decision.reason !== 'no-score');

  // collectibles
  $('#res-collectibles').innerHTML = COLLECTIBLES.map((c) => {
    const has = summary.collectibles.includes(c.id);
    return `<div class="collect-item ${has ? '' : 'is-missing'}">
        <svg class="collect-item__art" viewBox="0 0 64 64" aria-hidden="true"><use href="#${c.icon}"/></svg>
        <p class="collect-item__name">${c.name}</p>
      </div>`;
  }).join('');

  // achievements
  const achRow = $('#res-achievements');
  achRow.innerHTML = summary.achievementsUnlocked.length
    ? summary.achievementsUnlocked.map((a) => `
        <span class="ach-chip"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${a.icon}"/></svg>${a.name}</span>`).join('')
    : '<p class="ach-row__empty">No new badges this run — try a different challenge!</p>';

  // breakdown
  $('#res-breakdown').innerHTML = STAGE_DEFS.map((def, i) => {
    const r = summary.stageResults.find((s) => s.id === def.id);
    if (!r) {
      return `<li><span class="stage-break__n">${i + 1}</span><span class="stage-break__name">${def.name}</span>
        <span class="stage-break__mission no">SKIPPED</span><span class="stage-break__score">—</span></li>`;
    }
    const ok = r.missionDone;
    return `<li><span class="stage-break__n">${i + 1}</span>
      <span class="stage-break__name">${def.name}</span>
      <span class="stage-break__mission ${ok ? 'ok' : 'no'}">${ok ? 'MISSION ✓' : `${r.missionNow}/${r.missionGoal}`}</span>
      <span class="stage-break__score">${formatInt(r.score)}</span></li>`;
  }).join('');
}

function animateCount(node, target, duration = 900) {
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = formatInt(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else node.textContent = formatInt(target);
  };
  requestAnimationFrame(step);
}

/* ------------------------------ name capture ------------------------------ */

async function nameCapture(score, decision) {
  $('#ne-score').textContent = formatInt(score);
  $('#ne-prev').textContent = decision.previous
    ? `Previous record: ${decision.previous.name} — ${formatInt(decision.previous.score)}`
    : 'You are the first champion of Diwalipur!';
  const input = $('#player-name');
  input.value = profile.lastName || '';

  // Listeners go on before the transition: the player may type and hit enter fast.
  const namePromise = new Promise((resolve) => {
    const form = $('#name-form');
    const skip = $('[data-action="skip-name"]');
    const onSubmit = (e) => {
      e.preventDefault();
      const value = sanitizeName(input.value, CONFIG.maxNameLength);
      if (!value) { input.focus(); return; }
      cleanup();
      resolve(value);
    };
    const onSkip = () => { cleanup(); resolve(''); };
    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      skip.removeEventListener('click', onSkip);
    };
    form.addEventListener('submit', onSubmit);
    skip.addEventListener('click', onSkip);
  });

  await screens.show('name-entry');
  audio.play('record');
  setTimeout(() => input.focus({ preventScroll: true }), 420);

  const name = await namePromise;

  const finalName = name || 'Guardian';
  const res = await RecordStore.submit(finalName, score);
  profile = updateProfile({ lastName: name ? finalName : profile.lastName });
  audio.play('achievement');
  toast(res.global ? 'Record saved to the global board!' : 'Record saved on this device!', 2400);
  refreshHome();
  return finalName;
}

/* --------------------------------- sharing -------------------------------- */

let shareReady = null;

async function openShare() {
  if (!lastResult) return;
  const data = {
    score: lastResult.score,
    title: lastResult.title.name,
    name: lastResult.name,
    collectibles: lastResult.summary.collectibles.length,
    achievements: Object.keys(profile.achievements || {}).length,
    combo: lastResult.summary.comboBest
  };
  $('#share-text').textContent = buildShareText(data);
  const url = gameUrl();
  $('#share-url-note').textContent = url
    ? `Challenge link: ${challengeUrl(data.name || 'A friend', data.score)}`
    : 'Deploy the game (GitHub Pages / Netlify) to generate a shareable link.';
  $('#btn-native-share').hidden = !canNativeShare();

  await screens.show('share');
  shareReady = renderShareCard(el.shareCanvas, data);
  await shareReady;
}

function currentShareText() {
  if (!lastResult) return '';
  return buildShareText({
    score: lastResult.score,
    title: lastResult.title.name,
    name: lastResult.name
  });
}

/* --------------------------------- actions -------------------------------- */

const actions = {
  async play() {
    audio.play('click');
    await startRun();
  },
  howto() { audio.play('click'); screens.show('howto'); },
  'open-achievements'() { audio.play('click'); renderAchievements(); screens.show('achievements'); },
  'back-home'() {
    audio.play('back');
    runToken += 1;              // cancels any in-flight run
    engine.abort();
    el.powerbar.hidden = true;
    audio.startMusic('menu');
    refreshHome();
    screens.show('home');
  },
  'back-results'() { audio.play('back'); screens.show('results'); },
  'skip-splash'() { audio.play('click'); finishSplash(); },
  'toggle-sound'() {
    const on = !(prefs.music || prefs.sfx);
    setPreference('music', on);
    setPreference('sfx', on);
    audio.unlock();
    if (on) { audio.play('click'); audio.startMusic(currentDef ? (currentDef.music || 'play') : 'menu'); }
    else audio.stopMusic(0.3);
  },
  'open-settings'() { audio.play('click'); el.settings.hidden = false; },
  'close-settings'() { audio.play('back'); el.settings.hidden = true; },
  'reset-data'() {
    if (!window.confirm('Reset the local record, XP and achievements on this device?')) return;
    clearAll();
    profile = getProfile();
    prefs = getPrefs();
    RecordStore.reset();
    applyPrefs();
    refreshHome();
    renderAchievements();
    toast('Local progress cleared.');
  },
  pause() {
    if (!engine.running) return;
    engine.pause();
    el.pauseOverlay.hidden = false;
    audio.play('click');
  },
  resume() {
    el.pauseOverlay.hidden = true;
    engine.resume();
    audio.play('click');
  },
  'restart-run'() {
    el.pauseOverlay.hidden = true;
    engine.abort();
    audio.play('click');
    startRun();
  },
  'quit-run'() {
    el.pauseOverlay.hidden = true;
    actions['back-home']();
  },
  'play-again'() { audio.play('click'); startRun(); },
  'challenge-friends'() { audio.play('click'); openShare(); },
  async 'share-score'() {
    audio.play('click');
    if (canNativeShare()) {
      await openShare();
      if (shareReady) await shareReady;
      const res = await nativeShare({ text: currentShareText(), canvas: el.shareCanvas });
      if (!res.ok && res.reason === 'failed') toast('Sharing was not possible — try Copy instead.');
      return;
    }
    openShare();
  },
  'share-whatsapp'() {
    audio.play('click');
    shareWhatsApp(currentShareText());
  },
  async 'share-native'() {
    audio.play('click');
    if (shareReady) await shareReady;
    const res = await nativeShare({ text: currentShareText(), canvas: el.shareCanvas });
    if (!res.ok && res.reason === 'unsupported') toast('Native sharing is not supported here.');
  },
  async 'share-copy'() {
    audio.play('click');
    const ok = await copyText(currentShareText());
    toast(ok ? 'Challenge copied to clipboard!' : 'Could not copy — select the text instead.');
  },
  async 'share-download'() {
    audio.play('click');
    if (shareReady) await shareReady;
    try {
      await downloadCard(el.shareCanvas);
      toast('Score card saved!');
    } catch {
      toast('Could not save the card on this device.');
    }
  }
};

function bindActions() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const name = target.dataset.action;
    const fn = actions[name];
    if (!fn) return;             // handled locally (begin-stage, next-stage, …)
    e.preventDefault();
    fn(target);
  });

  $$('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      const next = btn.getAttribute('aria-checked') !== 'true';
      setPreference(key, next);
      audio.unlock();
      audio.play('click');
      if (key === 'music') {
        if (next) audio.startMusic(currentDef ? (currentDef.music || 'play') : 'menu');
        else audio.stopMusic(0.3);
      }
    });
  });
}

/* --------------------------------- splash --------------------------------- */

let splashResolved = false;
function finishSplash() {
  if (splashResolved) return;
  splashResolved = true;
  setFlag('seenSplash', true);
  refreshHome();
  screens.show('home');
  if (prefs.music && audioUnlocked) audio.startMusic('menu');
}

async function runSplash() {
  const seen = getFlag('seenSplash', false);
  const splash = screens.get('splash');
  splash.classList.toggle('splash--quick', seen);
  await screens.show('splash', { instant: true });
  const delay = seen ? 1300 : 3400;
  const timer = setTimeout(finishSplash, delay);
  const skip = () => { clearTimeout(timer); finishSplash(); };
  splash.addEventListener('pointerdown', skip, { once: true });
  window.addEventListener('keydown', skip, { once: true });
}

/* ------------------------------ global events ----------------------------- */

function bindGlobal() {
  // First gesture unlocks WebAudio (browser autoplay policy).
  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = audio.unlock();
    if (prefs.music) audio.startMusic(currentDef ? (currentDef.music || 'play') : 'menu');
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (engine.running && !engine.paused) {
        engine.pause();
        el.pauseOverlay.hidden = false;
      }
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.settings.hidden) { actions['close-settings'](); return; }
      if (engine.running && !engine.paused) { actions.pause(); return; }
      if (engine.running && engine.paused) { actions.resume(); }
    }
    if (e.key === 'p' || e.key === 'P') {
      if (engine.running) engine.paused ? actions.resume() : actions.pause();
    }
  });

  // Stop iOS/Android rubber-band scrolling while a stage is live.
  el.stageArea.addEventListener('touchmove', (e) => {
    if (engine.running) e.preventDefault();
  }, { passive: false });

  screens.onChange = (name) => {
    const menuish = ['splash', 'home', 'howto', 'achievements', 'results', 'share', 'name-entry', 'stage-intro', 'stage-complete', 'defeat'];
    if (menuish.includes(name)) ambient.start();
    else ambient.stop();
  };
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  if (!getFlag('prefsInit', false)) {
    if (prefersReducedMotionOS()) prefs = setPref('reducedMotion', true);
    setFlag('prefsInit', true);
  }
  applyPrefs();
  bindActions();
  bindGlobal();

  challenge = parseChallenge();
  renderChallengeBanner();

  $('#storage-note').textContent = storageAvailable()
    ? (isBackendConfigured()
      ? 'Records sync to the shared global board.'
      : 'Record, XP and badges are saved on this device only.')
    : 'Storage is blocked in this browser — progress will not persist.';
  const versionEl = $('#app-version');
  if (versionEl) versionEl.textContent = `v${CONFIG.version}`;

  renderAchievements();
  refreshHome();
  await runSplash();

  // Load the record in the background so the splash never waits on the network.
  RecordStore.load().then(() => refreshHome()).catch(() => {});
}

boot().catch((err) => {
  console.error('[app] boot failed', err);
  document.body.innerHTML = '<p style="padding:24px;color:#FFF8EC;font-family:system-ui">Something went wrong while starting Diwali Dhamaka. Please reload.</p>';
});

// Expose a tiny debug handle (useful for manual QA, harmless in production).
window.DiwaliDhamaka = { state, engine, RecordStore, audio, startRun };
