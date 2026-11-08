/** Stage registry — definitions in play order plus their implementations. */

import { LightRush, DEF as LIGHT_RUSH } from './light-rush.js';
import { RangoliRush, DEF as RANGOLI_RUSH } from './rangoli-rush.js';
import { FireworkFrenzy, DEF as FIREWORK_FRENZY } from './firework-frenzy.js';
import { MithaiMania, DEF as MITHAI_MANIA } from './mithai-mania.js';
import { BossBattle, DEF as BOSS_BATTLE } from './boss-battle.js';

export const STAGE_DEFS = [LIGHT_RUSH, RANGOLI_RUSH, FIREWORK_FRENZY, MITHAI_MANIA, BOSS_BATTLE];

const IMPLS = {
  'light-rush': LightRush,
  'rangoli-rush': RangoliRush,
  'firework-frenzy': FireworkFrenzy,
  'mithai-mania': MithaiMania,
  'boss-battle': BossBattle
};

export const defById = (id) => STAGE_DEFS.find((d) => d.id === id) || null;

export function createStage(id, state, opts = {}) {
  const Impl = IMPLS[id];
  if (!Impl) throw new Error(`Unknown stage: ${id}`);
  return new Impl(state, opts);
}

/** Flavour headline shown on the stage-complete screen. */
export const STAGE_CLEAR_TITLES = {
  'light-rush': 'COURTYARD GLOWING!',
  'rangoli-rush': 'PATTERNS RESTORED!',
  'firework-frenzy': 'SKY ON FIRE!',
  'mithai-mania': 'SWEET VICTORY!',
  'boss-battle': 'DARKNESS BROKEN!'
};

export { LIGHT_RUSH, RANGOLI_RUSH, FIREWORK_FRENZY, MITHAI_MANIA, BOSS_BATTLE };
