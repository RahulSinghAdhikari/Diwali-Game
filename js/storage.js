/**
 * Local persistence (localStorage) — player profile, preferences and the
 * device record. Everything degrades gracefully when storage is unavailable
 * (private mode, disabled cookies): the game keeps working in memory only.
 */

const NS = 'diwali-dhamaka.v1';
const KEY_PROFILE = `${NS}.profile`;
const KEY_PREFS = `${NS}.prefs`;
const KEY_RECORD = `${NS}.record`;
const KEY_FLAGS = `${NS}.flags`;

const memory = new Map();
let available = null;

function storageOk() {
  if (available !== null) return available;
  try {
    const probe = `${NS}.probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export const storageAvailable = () => storageOk();

function readRaw(key) {
  if (!storageOk()) return memory.has(key) ? memory.get(key) : null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeRaw(key, value) {
  if (!storageOk()) { memory.set(key, value); return false; }
  try { localStorage.setItem(key, value); return true; } catch { memory.set(key, value); return false; }
}

function readJSON(key, fallback) {
  const raw = readRaw(key);
  if (!raw) return structuredCloneSafe(fallback);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : structuredCloneSafe(fallback);
  } catch {
    return structuredCloneSafe(fallback);
  }
}

function writeJSON(key, value) { return writeRaw(key, JSON.stringify(value)); }

function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }

/* ------------------------------ Preferences ------------------------------ */

const DEFAULT_PREFS = { music: true, sfx: true, reducedMotion: false };

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...readJSON(KEY_PREFS, DEFAULT_PREFS) };
}

export function setPref(key, value) {
  const prefs = getPrefs();
  prefs[key] = value;
  writeJSON(KEY_PREFS, prefs);
  return prefs;
}

/* -------------------------------- Profile -------------------------------- */

const DEFAULT_PROFILE = {
  xp: 0,
  bestScore: 0,
  runs: 0,
  lastName: '',
  achievements: {},   // id -> unlocked timestamp
  bestCombo: 0
};

export function getProfile() {
  const p = { ...DEFAULT_PROFILE, ...readJSON(KEY_PROFILE, DEFAULT_PROFILE) };
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  p.xp = Number(p.xp) || 0;
  p.bestScore = Number(p.bestScore) || 0;
  p.runs = Number(p.runs) || 0;
  p.bestCombo = Number(p.bestCombo) || 0;
  return p;
}

export function saveProfile(profile) {
  writeJSON(KEY_PROFILE, profile);
  return profile;
}

export function updateProfile(patch) {
  const next = { ...getProfile(), ...patch };
  return saveProfile(next);
}

/* ------------------------------ Device record ----------------------------- */
/** The record is a single authoritative row: { name, score, at }. */

export function getLocalRecord() {
  const r = readJSON(KEY_RECORD, null);
  if (!r || typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
  return { name: String(r.name || 'Guardian'), score: Math.max(0, Math.floor(r.score)), at: r.at || null };
}

export function saveLocalRecord(name, score) {
  const record = { name, score: Math.floor(score), at: new Date().toISOString() };
  writeJSON(KEY_RECORD, record);
  return record;
}

export function clearAll() {
  [KEY_PROFILE, KEY_PREFS, KEY_RECORD, KEY_FLAGS].forEach((k) => {
    memory.delete(k);
    if (storageOk()) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  });
}

/* --------------------------------- Flags --------------------------------- */

export function getFlag(name, fallback = false) {
  const flags = readJSON(KEY_FLAGS, {});
  return name in flags ? flags[name] : fallback;
}

export function setFlag(name, value) {
  const flags = readJSON(KEY_FLAGS, {});
  flags[name] = value;
  writeJSON(KEY_FLAGS, flags);
  return value;
}
