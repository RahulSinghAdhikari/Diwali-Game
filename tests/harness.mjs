/**
 * Headless harness: boots the real game in jsdom with a virtual clock, a
 * stubbed Canvas2D context and a stubbed Web Audio graph, so the full
 * 90-second run can be played end-to-end in milliseconds.
 */

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------- virtual clock ----------------------------- */

const realSetTimeout = globalThis.setTimeout;
let vnow = 0;
let seq = 1;
const timers = new Map();
const rafs = new Map();
let rafSeq = 1;

function installClock() {
  vnow = 0;
  timers.clear();
  rafs.clear();
  globalThis.setTimeout = (fn, ms = 0, ...args) => {
    const id = seq++;
    timers.set(id, { at: vnow + Math.max(0, ms), fn, args, every: null });
    return id;
  };
  globalThis.setInterval = (fn, ms = 0, ...args) => {
    const id = seq++;
    timers.set(id, { at: vnow + Math.max(1, ms), fn, args, every: Math.max(1, ms) });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.clearInterval = (id) => timers.delete(id);
  globalThis.requestAnimationFrame = (cb) => { const id = rafSeq++; rafs.set(id, cb); return id; };
  globalThis.cancelAnimationFrame = (id) => rafs.delete(id);
  globalThis.performance = { now: () => vnow };
}

/** Advance the virtual clock, firing timers + animation frames. */
export async function advance(ms, step = 16) {
  const target = vnow + ms;
  while (vnow < target) {
    vnow = Math.min(target, vnow + step);
    const due = [...timers.entries()].filter(([, t]) => t.at <= vnow).sort((a, b) => a[1].at - b[1].at);
    for (const [id, t] of due) {
      if (t.every) t.at = vnow + t.every;
      else timers.delete(id);
      try { t.fn(...t.args); } catch (err) { console.error('[timer]', err); }
    }
    const frames = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of frames) {
      try { cb(vnow); } catch (err) { console.error('[raf]', err); }
    }
    // let promise chains settle between frames
    await new Promise((r) => realSetTimeout(r, 0));
  }
}

export const clockNow = () => vnow;

/* ------------------------------ canvas stub ------------------------------ */

function makeCtx(canvas) {
  const base = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDashOffset: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    filter: 'none',
    shadowBlur: 0,
    measureText: (t) => ({ width: String(t).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
    drawImage() {}
  };
  return new Proxy(base, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => undefined;      // any other 2D method is a no-op
    },
    set(t, prop, value) { t[prop] = value; return true; }
  });
}

/* ----------------------------- web audio stub ---------------------------- */

class FakeParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(440);
    this.Q = new FakeParam(1);
    this.detune = new FakeParam(0);
    this.threshold = new FakeParam(0);
    this.knee = new FakeParam(0);
    this.ratio = new FakeParam(1);
    this.attack = new FakeParam(0);
    this.release = new FakeParam(0);
    this.type = 'sine';
    this.buffer = null;
    this.loop = false;
    this.onended = null;
  }
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = new FakeNode();
  }
  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createConvolver() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(channels, length) {
    return { length, numberOfChannels: channels, getChannelData: () => new Float32Array(length) };
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

/* --------------------------------- setup --------------------------------- */

export async function setupGame({ url = 'https://play.example.com/diwali/', width = 390, height = 760, reducedMotion = false } = {}) {
  installClock();

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: false, runScripts: 'outside-only' });
  const { window } = dom;

  // Layout: jsdom has no layout engine, so hand every element the playfield box.
  window.Element.prototype.getBoundingClientRect = function () {
    const isCanvasArea = this.id === 'stage-area' || this.id === 'game-canvas' || this.tagName === 'CANVAS';
    const w = isCanvasArea ? width - 16 : width;
    const h = isCanvasArea ? height - 150 : height;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON() {} };
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = makeCtx(this);
    return this.__ctx;
  };
  window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new window.Blob([''], { type: 'image/png' })); };
  window.HTMLElement.prototype.setPointerCapture = function () {};
  window.HTMLElement.prototype.releasePointerCapture = function () {};
  window.HTMLElement.prototype.focus = function () {};
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = (q) => ({
    matches: reducedMotion && /prefers-reduced-motion/.test(q),
    media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  window.devicePixelRatio = 2;
  window.AudioContext = FakeAudioContext;
  window.confirm = () => true;
  window.open = () => ({ focus() {} });
  window.scrollTo = () => {};
  Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async () => true }, configurable: true
  });

  // Expose jsdom globals to the module graph.
  const globals = [
    'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'Element', 'Node', 'Event',
    'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'Blob', 'File', 'FileReader',
    'getComputedStyle', 'DOMParser', 'XMLSerializer', 'SVGElement', 'Image', 'ResizeObserver',
    'matchMedia', 'devicePixelRatio', 'AudioContext', 'URL', 'Node'
  ];
  for (const key of globals) {
    if (!(key in window)) continue;
    // Node 22 exposes some of these (navigator, performance) as getter-only globals.
    Object.defineProperty(globalThis, key, {
      value: window[key], configurable: true, writable: true, enumerable: true
    });
  }
  globalThis.addEventListener = window.addEventListener.bind(window);
  globalThis.removeEventListener = window.removeEventListener.bind(window);
  globalThis.dispatchEvent = window.dispatchEvent.bind(window);

  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };
  window.addEventListener('error', (e) => errors.push(`window.error: ${e.message}`));

  // Boot the real app (fresh module graph each time).
  const stamp = Date.now() + Math.random();
  const app = await import(`${path.join(ROOT, 'js/app.js')}?t=${stamp}`);
  await advance(60);

  return { dom, window, document: window.document, app, errors, api: window.DiwaliDhamaka };
}

/* ------------------------------- interaction ------------------------------ */

export function click(doc, selector) {
  const node = typeof selector === 'string' ? doc.querySelector(selector) : selector;
  if (!node) throw new Error(`click: no element for ${selector}`);
  const win = doc.defaultView;
  node.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  return node;
}

export function pointerDown(doc, selector) {
  const node = typeof selector === 'string' ? doc.querySelector(selector) : selector;
  if (!node) throw new Error(`pointerDown: no element for ${selector}`);
  const win = doc.defaultView;
  const ev = new win.Event('pointerdown', { bubbles: true, cancelable: true });
  ev.clientX = 10; ev.clientY = 10; ev.pointerId = 1; ev.pointerType = 'mouse'; ev.button = 0;
  node.dispatchEvent(ev);
  return node;
}

/** Tap the playfield at engine-space coordinates. */
export function tapStage(window, x, y) {
  const area = window.document.querySelector('#stage-area');
  const ev = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  ev.clientX = x; ev.clientY = y; ev.pointerId = 1; ev.pointerType = 'mouse'; ev.button = 0;
  area.dispatchEvent(ev);
  const up = new window.Event('pointerup', { bubbles: true, cancelable: true });
  up.clientX = x; up.clientY = y; up.pointerId = 1; up.pointerType = 'mouse';
  area.dispatchEvent(up);
}

export function activeScreen(doc) {
  const node = doc.querySelector('.screen.is-active');
  return node ? node.dataset.screen : null;
}
