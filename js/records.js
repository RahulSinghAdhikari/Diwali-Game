/**
 * THE RECORD — a single authoritative "Diwali Champion" row: { name, score }.
 *
 * Product rule (strict): the game captures ONLY a name and a score, and only
 * when the player actually sets a new record.
 *
 *   A. no record yet        -> ask for a name
 *   B. score < record       -> do not ask, do not write
 *   C. score > record       -> celebrate + ask for a name
 *   D. score === record     -> do not ask, do not replace (first holder keeps it)
 *
 * Storage: localStorage by default (labelled "THIS DEVICE" in the UI).
 * If Supabase is configured the same single row lives server-side and the
 * comparison is re-done inside an atomic RPC, because a browser-side
 * comparison can always be tampered with.
 */

import { CONFIG, isBackendConfigured } from './config.js';
import { getLocalRecord, saveLocalRecord } from './storage.js';
import { sanitizeName } from './core/utils.js';

/** Pure decision function — unit-tested in tests/logic.test.mjs. */
export function evaluateRecord(record, score) {
  const s = Math.floor(Number(score) || 0);

  // A zero-score run never creates a champion entry.
  if (s <= 0) return { shouldAskName: false, reason: 'no-score', previous: record ?? null, delta: 0 };
  if (!record || typeof record.score !== 'number') {
    return { shouldAskName: true, reason: 'first', previous: null, delta: s };
  }
  if (s > record.score) {
    return { shouldAskName: true, reason: 'beat', previous: record, delta: s - record.score };
  }
  if (s === record.score) {
    return { shouldAskName: false, reason: 'tie', previous: record, delta: 0 };
  }
  return { shouldAskName: false, reason: 'lower', previous: record, delta: s - record.score };
}

/* ----------------------------- Supabase layer ----------------------------- */

const sbHeaders = () => ({
  'Content-Type': 'application/json',
  apikey: CONFIG.supabase.anonKey,
  Authorization: `Bearer ${CONFIG.supabase.anonKey}`
});

async function remoteFetchRecord(signal) {
  const url = `${CONFIG.supabase.url.replace(/\/$/, '')}/rest/v1/rpc/${CONFIG.supabase.readRpc}`;
  const res = await fetch(url, { method: 'POST', headers: sbHeaders(), body: '{}', signal });
  if (!res.ok) throw new Error(`record read failed (${res.status})`);
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.score !== 'number') return null;
  return { name: String(row.name || 'Guardian'), score: Math.floor(row.score), at: row.updated_at || null };
}

/**
 * Atomic server-side submit. The RPC itself re-checks `new > current`, so two
 * concurrent submissions can never let a lower score overwrite a higher one.
 * Returns the authoritative record after the attempt.
 */
async function remoteSubmit(name, score) {
  const url = `${CONFIG.supabase.url.replace(/\/$/, '')}/rest/v1/rpc/${CONFIG.supabase.rpc}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_name: name, p_score: Math.floor(score) })
  });
  if (!res.ok) throw new Error(`record submit failed (${res.status})`);
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.score !== 'number') return null;
  return { name: String(row.name || name), score: Math.floor(row.score), at: row.updated_at || null };
}

/* ------------------------------ Record store ------------------------------ */

export const RecordStore = {
  /** Current best-known record, or null. */
  record: null,
  /** True only when a backend is configured AND reachable. Never faked. */
  isGlobal: false,
  lastError: null,

  get scopeLabel() { return this.isGlobal ? 'GLOBAL' : 'THIS DEVICE'; },

  async load() {
    this.record = getLocalRecord();
    if (!isBackendConfigured()) { this.isGlobal = false; return this.record; }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const remote = await remoteFetchRecord(controller.signal);
      clearTimeout(timer);
      this.isGlobal = true;
      this.record = remote;
      if (remote) saveLocalRecord(remote.name, remote.score); // offline mirror
    } catch (err) {
      this.isGlobal = false;
      this.lastError = err;
      console.warn('[records] global record unavailable, using device record:', err.message);
    }
    return this.record;
  },

  evaluate(score) { return evaluateRecord(this.record, score); },

  /**
   * Persist a new record. Always writes locally; additionally performs the
   * authoritative atomic write when a backend is configured.
   * @returns {Promise<{record:object, global:boolean, accepted:boolean}>}
   */
  async submit(rawName, score) {
    const name = sanitizeName(rawName, CONFIG.maxNameLength) || 'Guardian';
    const value = Math.floor(Number(score) || 0);

    if (isBackendConfigured()) {
      try {
        const remote = await remoteSubmit(name, value);
        if (remote) {
          this.isGlobal = true;
          this.record = remote;
          saveLocalRecord(remote.name, remote.score);
          return { record: remote, global: true, accepted: remote.score === value && remote.name === name };
        }
      } catch (err) {
        this.lastError = err;
        console.warn('[records] global submit failed, saved locally:', err.message);
      }
    }

    const local = saveLocalRecord(name, value);
    this.record = local;
    this.isGlobal = false;
    return { record: local, global: false, accepted: true };
  },

  reset() {
    this.record = getLocalRecord();
    return this.record;
  }
};
