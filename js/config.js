/**
 * Public, non-secret configuration.
 *
 * SHARE LINK
 * ----------
 * `publicUrl` is used inside WhatsApp / native share messages.
 * Leave it null and the game uses the real URL it is being served from
 * (origin + path, query/hash stripped) — correct for GitHub Pages, Netlify,
 * a custom domain or a local test server, with no placeholder to forget.
 * Set it explicitly only if you serve the game behind a nicer vanity domain.
 *
 * GLOBAL RECORD (optional)
 * ------------------------
 * Fill in `supabase.url` + `supabase.anonKey` to turn the single authoritative
 * record into a shared global one. Both values are public by design
 * (the anon key is safe to ship; the table is protected by RLS + an atomic
 * RPC that refuses lower or equal scores server-side). See README §Backend.
 * When these are empty the game runs a fully functional local record and
 * clearly labels it "THIS DEVICE" — it never pretends to be global.
 */
export const CONFIG = Object.freeze({
  version: '1.0.0',
  publicUrl: null,

  supabase: Object.freeze({
    url: '',          // e.g. 'https://xxxxxxxx.supabase.co'
    anonKey: '',      // public anon key
    rpc: 'submit_diwali_record',
    readRpc: 'get_diwali_record'
  }),

  // Score thresholds → performance titles (tuned against playtest runs)
  titles: Object.freeze([
    { min: 2000, name: 'DIWALI LEGEND', icon: 'a-legend' },
    { min: 1500, name: 'FIREWORK STAR', icon: 'a-sky' },
    { min: 1000, name: 'RANGOLI MASTER', icon: 'a-pattern' },
    { min: 500, name: 'LIGHT KEEPER', icon: 'a-firstlight' },
    { min: 0, name: 'DIYA BEGINNER', icon: 'i-diya' }
  ]),

  maxNameLength: 18
});

/** Real, shareable URL of this deployment (never a placeholder). */
export function gameUrl() {
  if (CONFIG.publicUrl) return CONFIG.publicUrl;
  if (typeof location === 'undefined') return '';
  const { origin, pathname } = location;
  if (origin === 'null' || origin.startsWith('file:')) return '';
  return origin + pathname.replace(/index\.html?$/i, '');
}

export function isBackendConfigured() {
  return Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);
}
