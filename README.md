# 🪔 Diwali Dhamaka — The Festival Quest

**Restore the Lights. Unlock the Magic. Become the Diwali Champion!**

A complete, mobile-first HTML5 arcade game built with vanilla ES modules, Canvas 2D and the
Web Audio API. Five hand-tuned stages, a three-phase boss fight, collectibles that turn into
real combat advantages, combos, XP, achievements, a single authoritative high score and
WhatsApp challenge links — in about 90 seconds per run.

No framework. No build step. No bundler. Open it on a phone and play.

---

## Table of contents

- [Play it](#play-it)
- [The game](#the-game)
- [Controls](#controls)
- [Scoring, combos and titles](#scoring-combos-and-titles)
- [Collectibles → boss powers](#collectibles--boss-powers)
- [Achievements](#achievements)
- [The high-score rule](#the-high-score-rule)
- [Sharing and challenge links](#sharing-and-challenge-links)
- [Running locally](#running-locally)
- [Deployment](#deployment)
- [Backend: a real global record (optional)](#backend-a-real-global-record-optional)
- [Configuration reference](#configuration-reference)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)
- [Tests](#tests)
- [Accessibility and performance](#accessibility-and-performance)
- [Browser support](#browser-support)
- [Licence and credits](#licence-and-credits)

---

## Play it

```bash
git clone https://github.com/RahulSinghAdhikari/Diwali-Game.git
cd Diwali-Game
npm start                        # python3 tools/dev-server.py 8080
```

Then open <http://localhost:8080>.

> ES modules need an HTTP origin. Opening `index.html` straight from the file system
> (`file://`) will not work — any static server will.

---

## The game

The darkness has swallowed the festival of lights. You have five stages to bring it back.

| # | Stage | Length | Mission | How it plays |
|---|-------|--------|---------|--------------|
| 1 | **Light Rush** | 15s | Light 15 diyas | Tap unlit diyas (+10). Golden diyas are worth +25. Tap a shadow wisp and you lose points and your combo. |
| 2 | **Rangoli Rush** | 17s | Match 3 patterns | A rangoli flashes up; pick the identical one from four options (+100). Options are generated from real pattern data — petals, rings, colours and symmetry — never from a hardcoded answer key. The last round is a bonus round. |
| 3 | **Firework Frenzy** | 15s | Launch 12 rockets | Tap rising rockets to burst them (+20), golden rockets (+50). Duds cost you (−20). |
| 4 | **Mithai Mania** | 15s | Catch 20 sweets | Drag the basket. Laddoo +10, jalebi +15, barfi +20, golden mithai +50, spoiled box −15. |
| 5 | **Defeat the Darkness** | 26s | Drain 100% darkness | Three-phase boss. Tap the glowing weak points, dodge the shadow orbs, spend your collectible powers, then land the final strike on the exposed core. |

A full run is roughly **88 seconds** of gameplay plus skippable stage intros.
Lose the boss fight and you get a friendly retry that keeps the score you have already earned —
you never have to replay the first four stages.

---

## Controls

| Input | Action |
|-------|--------|
| **Tap / click** | Light diyas, pop rockets, pick patterns, hit weak points |
| **Drag** | Steer the mithai basket and the guardian lamp in the boss fight |
| **Space / Enter** | Keyboard assist — hits the best available target (weak point, rocket, diya) |
| **1 – 4** | Fire a collectible power during the boss fight |
| **Esc / P** | Pause and resume |
| **Tab / Shift+Tab** | Move through every menu control; everything is reachable without a pointer |

The game auto-pauses when the tab is hidden or the phone is locked.

---

## Scoring, combos and titles

Chain hits without missing to build a combo. Missing a target never breaks a chain —
only a mistake does (a wisp, a dud, a spoiled sweet, a wrong pattern).

| Combo | Multiplier | Shout |
|-------|-----------|-------|
| 3 | ×1.5 | NICE! |
| 5 | ×2 | GREAT! |
| 10 | ×3 | AMAZING! |
| 15 | ×3 | UNSTOPPABLE! |
| 20 | ×3 | DIWALI LEGEND! |

Final score maps to a performance title:

| Score | Title |
|-------|-------|
| 0 – 499 | Diya Beginner |
| 500 – 999 | Light Keeper |
| 1000 – 1499 | Rangoli Master |
| 1500 – 1999 | Firework Star |
| 2000+ | **Diwali Legend** |

XP is earned on top of score (10 score = 1 XP, plus mission, combo, boss-damage and
achievement bonuses) and persists across runs as a profile level.

---

## Collectibles → boss powers

Each of the first four stages holds one collectible. **Score in a stage to earn it;
complete its mission and the power becomes EMPOWERED** (longer duration, stronger effect).
These are not cosmetic — they are the boss fight's difficulty dial.

| Collectible | Stage | Power in the boss fight |
|-------------|-------|--------------------------|
| 🔥 **Golden Flame** | Light Rush | Your hits deal double damage for 6 seconds |
| 🌸 **Rainbow Rangoli** | Rangoli Rush | A shield blocks dark energy for 6 seconds |
| ✨ **Spark of Celebration** | Firework Frenzy | Stuns the darkness for 3.5 seconds and clears every orb |
| 🍬 **Golden Mithai** | Mithai Mania | Restores a mistake allowance — one more hit survived |

---

## Achievements

Eight badges, all awarded from real gameplay events and stored in your profile.

| Badge | Condition | XP |
|-------|-----------|----|
| **First Light** | Complete stage one | 50 |
| **Pattern Master** | Match every Rangoli round without a mistake | 100 |
| **Sky Painter** | Hit 10 fireworks in a row | 100 |
| **Mithai Lover** | Collect 20 sweets in one market run | 75 |
| **Darkness Destroyer** | Defeat the darkness monster | 200 |
| **Combo King** | Reach a 10-hit combo | 100 |
| **Perfect Festival** | Clear all five stages and win the boss fight | 150 |
| **Diwali Legend** | Finish a run with 2000 points or more | 250 |

---

## The high-score rule

The game keeps **exactly one record: the highest score and the name behind it.**
Every run is evaluated against four cases, and nothing else is ever stored.

| Case | Situation | What happens |
|------|-----------|--------------|
| **A** | No record exists yet | Celebration → *"Enter your name"* → **CLAIM MY RECORD** |
| **B** | Your score is **lower** | No prompt, no overwrite. Results screen only. |
| **C** | Your score is **strictly higher** | *"NEW HIGH SCORE!"* → *"YOU'RE THE NEW DIWALI CHAMPION!"* → name entry → record replaced |
| **D** | Your score **equals** the record | No prompt, no overwrite — the original holder keeps the crown |

Out of the box the record lives in `localStorage` and is labelled **"THIS DEVICE"**.
The game never claims a local record is global. Wire up the optional backend
(below) and the same card is labelled **"GLOBAL RECORD"**, with the comparison and the
replacement performed atomically on the server.

---

## Sharing and challenge links

- **WhatsApp** — opens `https://wa.me/?text=…` with a fully `encodeURIComponent`-ed message.
- **Native share** — uses `navigator.share()` where available, including the generated PNG card.
- **Copy** — copies the message via the async clipboard API.
- **Share card** — a 1080×1350 image drawn on a canvas at share time: wordmark, trophy,
  your score, title, name, stage stats and the game URL. Download or share it directly.

Messages are built from the real result (no placeholder text), and the link is the actual URL
the game is served from — see [`publicUrl`](#configuration-reference).

A share link carries a challenge:

```
https://your-site/diwali/?c=Rahul%20Singh&s=2450
```

Opening it shows a **"RAHUL SINGH CHALLENGES YOU! Can you beat 2,450?"** banner with a
**PLAY NOW** button. The challenge is never confused with the device record.

---

## Running locally

```bash
npm start                        # http://localhost:8080
```

### No server? Use the single-file build

```bash
npm run build:standalone         # writes play-offline.html
```

`play-offline.html` is the entire game — every stylesheet and the whole module
graph inlined into one ~295 KB file with **zero external requests**. Double-click it,
e-mail it, put it on a USB stick; it plays offline with no server at all. (Web fonts are
dropped in this build, so it renders with the system font stack.)

That runs [`tools/dev-server.py`](tools/dev-server.py) — a ~90-line static server with three
things `python3 -m http.server` gets wrong for a 30-module ES project:

| | `http.server` | `tools/dev-server.py` |
|---|---|---|
| Protocol | HTTP/1.0 — a new TCP connection per module | HTTP/1.1 keep-alive |
| Nagle's algorithm | on — ~40 ms stall per response | disabled |
| Listen backlog | 5 — parallel fetches get refused | 128 |
| Caching | 304s serve stale JS after an edit | `Cache-Control: no-store` |

Measured on the full module graph: **1274 ms → 8 ms**.

Any other static server works too — nothing in the game depends on it:

```bash
python3 -m http.server 8080      # Python, stdlib
npx serve .                      # Node
php -S localhost:8080            # PHP
```

No install step is required to play — `npm install` only pulls in `jsdom` for the test suite.

---

## Deployment

The game is a static site at the repository root. Everything below works out of the box.

### GitHub Pages

1. **Settings → Pages → Build and deployment → Source: Deploy from a branch**
2. Branch `main`, folder `/ (root)` → **Save**
3. The game is live at `https://<user>.github.io/<repo>/` within a minute.

No `publicUrl` configuration needed: share links pick up the Pages URL automatically.

### Netlify / Vercel / Cloudflare Pages

Drag the folder in, or connect the repo and use:

- **Build command:** *(none)*
- **Publish directory:** `.`

### Any static host / CDN

Upload the repository contents. The only requirements are that `index.html` is served at the
root of its directory and that `.js` files are sent with a JavaScript MIME type (every normal
host does this).

---

## Backend: a real global record (optional)

Without a backend the game is fully functional with a device-local record. To make the record
genuinely global and tamper-resistant, point it at a Supabase project. The comparison happens
**server-side and atomically**, so two players finishing at the same moment cannot clobber
each other.

### 1. Create the table and the RPCs

Run this in the Supabase SQL editor:

```sql
-- One row, one champion.
create table if not exists public.diwali_record (
  id         int primary key default 1,
  name       text not null,
  score      int  not null check (score >= 0),
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table public.diwali_record enable row level security;

-- Nobody writes directly; the RPCs below are the only way in.
create policy "record is public" on public.diwali_record for select using (true);

-- Atomic: only a STRICTLY greater score replaces the champion (rules C vs D).
create or replace function public.submit_diwali_record(p_name text, p_score int)
returns public.diwali_record
language plpgsql security definer as $$
declare result public.diwali_record;
begin
  if p_score is null or p_score < 0 or p_score > 100000 then
    raise exception 'invalid score';
  end if;

  insert into public.diwali_record (id, name, score)
  values (1, left(btrim(p_name), 18), p_score)
  on conflict (id) do update
    set name = excluded.name,
        score = excluded.score,
        updated_at = now()
    where public.diwali_record.score < excluded.score   -- strictly greater only
  returning * into result;

  if result is null then
    select * into result from public.diwali_record where id = 1;
  end if;
  return result;
end $$;

create or replace function public.get_diwali_record()
returns public.diwali_record
language sql stable as $$
  select * from public.diwali_record where id = 1;
$$;
```

### 2. Point the game at it

In [`js/config.js`](js/config.js):

```js
supabase: Object.freeze({
  url:     'https://xxxxxxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOi...',          // public anon key — safe to ship
  rpc:     'submit_diwali_record',
  readRpc: 'get_diwali_record'
})
```

That is all. The record card switches to **GLOBAL RECORD**, reads go through `get_diwali_record`
and claims go through `submit_diwali_record`. If the network fails, the game degrades
gracefully to the local record and says so instead of silently losing the score.

> **Firebase instead?** Replace the two functions in [`js/records.js`](js/records.js)
> (`remoteFetch` and `remoteSubmit`) with a Firestore transaction that performs the same
> `score > current.score` check. Nothing else in the codebase touches the network.

---

## Configuration reference

All public configuration lives in [`js/config.js`](js/config.js).

| Key | Default | Meaning |
|-----|---------|---------|
| `version` | `'1.0.0'` | Shown on the settings sheet |
| `publicUrl` | `null` | Share-link base. `null` = use the real URL the game is served from (correct for Pages, Netlify, a custom domain or localhost). Set a string only for a vanity domain. |
| `supabase.url` / `supabase.anonKey` | `''` | Empty = local record labelled "THIS DEVICE". Filled = global record. |
| `supabase.rpc` / `supabase.readRpc` | see above | Names of the write/read RPCs |
| `titles` | 5 tiers | Score → performance title thresholds |
| `maxNameLength` | `18` | Champion name limit (sanitised, unicode-safe) |

Player preferences (music, SFX, reduced motion), the profile (XP, level, achievements, best
score) and the record are stored under the `diwali-dhamaka.v1.*` localStorage namespace, and
the whole lot can be wiped from **Settings → Reset local record & progress**. If localStorage is unavailable
(private mode, embedded webview) the game runs on an in-memory fallback and tells the player.

---

## Project structure

```
Diwali-Game/
├── index.html              # Shell, all 13 screens, inline SVG sprite sheet
├── css/
│   ├── base.css            # Reset, app frame, screen system, safe areas
│   ├── theme.css           # Design tokens (palette, type scale, surfaces)
│   ├── components.css      # Buttons, cards, HUD chrome, sheets, toasts
│   ├── animations.css      # Keyframes + prefers-reduced-motion
│   └── game.css            # Splash, stage intro, HUD, boss bar, power bar
├── js/
│   ├── app.js              # Boot, screen flow, run orchestration
│   ├── config.js           # Public configuration
│   ├── game-engine.js      # Canvas sizing, loop, input, stage lifecycle
│   ├── game-state.js       # Score, combo, missions, collectibles (event emitter)
│   ├── progression.js      # Combo tiers, XP, levels, titles
│   ├── records.js          # A/B/C/D record rules + local/remote store
│   ├── rewards.js          # Collectibles and the 8 achievements
│   ├── storage.js          # Namespaced localStorage with memory fallback
│   ├── audio.js            # Synthesised SFX + 3 music themes (Web Audio)
│   ├── hud.js              # Score, timer, mission and combo readouts
│   ├── sharing.js          # Challenge URLs, WhatsApp, native share, share card
│   ├── core/
│   │   ├── art.js          # Procedural vector artwork, sprite cache
│   │   ├── particles.js    # Pooled particle system (burst, firework, confetti…)
│   │   ├── screens.js      # Screen manager with transitions
│   │   ├── ambient.js      # Background canvas (embers, lanterns, celebration)
│   │   ├── emitter.js      # Tiny event emitter
│   │   └── utils.js        # Maths, timing, sanitising, DOM helpers
│   └── stages/
│       ├── index.js        # Stage registry and factory
│       ├── common.js       # Shared backdrops and feedback effects
│       ├── light-rush.js
│       ├── rangoli-rush.js
│       ├── firework-frenzy.js
│       ├── mithai-mania.js
│       └── boss-battle.js
├── play-offline.html       # Single-file build — open it directly, no server
├── tools/
│   ├── dev-server.py       # Local static server (keep-alive, no-store) — dev only
│   └── build-standalone.mjs# Inlines everything into play-offline.html
└── tests/
    ├── harness.mjs         # jsdom + virtual clock + canvas/audio stubs
    ├── logic.test.mjs      # Pure logic (records, combos, patterns, sharing)
    ├── game.test.mjs       # Plays the whole game headlessly
    └── run.mjs             # Zero-dependency runner
```

**Zero binary assets.** Every diya, rangoli, rocket, sweet, monster and badge is drawn with
SVG (UI) or procedurally on canvas (gameplay). Emoji are never used as artwork.

---

## Architecture notes

- **Stage contract.** Every stage is a class implementing
  `init / update(dt) / draw(ctx) / pointerDown / pointerMove / pointerUp / key / resize / onPause / onResume / destroy / summary()`.
  The engine owns the loop, DPR-correct sizing, input normalisation and the countdown;
  a stage only owns its own rules. Adding a sixth stage means writing one file and adding
  one entry to `js/stages/index.js`.
- **One source of truth for scoring.** Stages never touch the score directly — they call
  `state.registerHit()` / `state.award()` / `state.breakCombo()`, so combo multipliers,
  mission progress and HUD updates stay consistent everywhere.
- **Canvas units are CSS pixels.** The backing store is scaled by `min(2, devicePixelRatio)`;
  gameplay code never thinks about DPR. Sprites are pre-rendered once into offscreen canvases
  and blitted, which keeps the draw cost flat on low-end phones.
- **Deterministic patterns.** Rangoli options are generated by mutating a real spec
  (`petals / rings / palette / symmetry / centre`) and de-duplicated by key, so there is
  exactly one correct answer and no two identical tiles — verified by 300 generated rounds
  in the test suite.
- **Audio is synthesised**, not downloaded: no audio files, no licensing, instant start.
  The context is created on the first gesture to satisfy mobile autoplay policies.
- **Screen transitions are promise-based**, and every screen's buttons are wired up *before*
  the transition starts, so a tap during the 250–450 ms animation is never swallowed.

---

## Tests

A headless harness boots the real `index.html` in jsdom with a virtual clock, a stubbed
Canvas2D context and a fake Web Audio graph, then *plays the game* — tapping diyas, matching
rangolis by pattern data, dragging the basket, firing power-ups and finishing the boss.

```bash
npm install     # jsdom, dev-only
npm test
```

```
tests/logic.test.mjs     32 passed  record rules A–D, combos, XP, achievements,
                                   pattern generation, share/challenge URLs
tests/game.test.mjs      36 passed  full five-stage run, boss win and loss, retry,
                                   record capture, results, sharing, pause,
                                   keyboard play, reduced motion, a11y labels
tests/standalone.test.mjs 5 passed  the single-file build boots from disk with no
                                   network and reaches a playable stage
```

Every test asserts that nothing was written to `console.error` during the run.

---

## Accessibility and performance

- **60 fps budget** — object pooling, pre-rendered sprites, no per-frame allocations in the
  hot path, `contain` on the frame, particle caps that scale down on slow frames.
- **`prefers-reduced-motion`** is honoured at boot and can be toggled in Settings: particle
  counts drop, screen shake is disabled and transitions become instant.
- **Keyboard** — every control is focusable with visible focus rings; `Space`/`Enter` plays
  the action stages and `1`–`4` fires boss powers.
- **Screen readers** — semantic landmarks, a polite `aria-live` region for mission progress,
  achievement pops and toasts, plus labelled icon buttons and switches.
- **Safe areas** — `env(safe-area-inset-*)` padding throughout, so notches and home
  indicators never cover UI.
- **Touch** — `touch-action: none` only on the playfield; the rest of the UI keeps native
  scrolling and pinch zoom. Double-tap zoom is suppressed during play.
- **Responsive** — a fluid phone layout from 320 px up, becoming a centred 460×940 device
  frame on large screens.

---

## Browser support

Chrome/Edge 90+, Safari 15+ (iOS 15+), Firefox 90+, Samsung Internet 15+.
Requires ES modules, Canvas 2D and Web Audio — all baseline since 2021.
Without JavaScript the page shows a plain explanatory message.

---

## Licence and credits

Design, code, artwork and audio by the Diwali Dhamaka project.
Fonts: [Outfit](https://fonts.google.com/specimen/Outfit) and
[Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License).

Shubh Deepavali — may your score be high and your diyas brighter. 🪔
