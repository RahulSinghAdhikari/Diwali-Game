/**
 * Smoke-tests the single-file build (play-offline.html): it must boot and reach
 * the home screen with no network and no module loader — exactly what happens
 * when someone double-clicks the file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, assert, equal, runAll } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'play-offline.html');

/** Minimal browser surface the game touches, installed before the page parses. */
function stub(window) {
  const ctxProxy = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: 390, height: 610 };
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' ||
          prop === 'createPattern') return () => ({ addColorStop() {} });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set() { return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = () => ctxProxy;
  window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new window.Blob([]));
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

  class Param { constructor() { this.value = 0; } setValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; }
    setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }

  // Any property a Web Audio node is asked for becomes an AudioParam, so the
  // stub never has to enumerate them (threshold, knee, ratio, pan, …).
  const makeNode = () => {
    const own = { type: 'sine', buffer: null, onended: null,
      connect: () => node, disconnect() {}, start() {}, stop() {} };
    const params = new Map();
    const node = new Proxy(own, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop !== 'string') return undefined;
        if (!params.has(prop)) params.set(prop, new Param());
        return params.get(prop);
      },
      set(t, prop, value) { t[prop] = value; return true; },
      has() { return true; }
    });
    return node;
  };
  const Node = function () { return makeNode(); };
  window.AudioContext = class {
    constructor() { this.destination = makeNode(); this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
    createOscillator() { return makeNode(); } createGain() { return makeNode(); }
    createBiquadFilter() { return makeNode(); } createBufferSource() { return makeNode(); }
    createDynamicsCompressor() { return makeNode(); } createStereoPanner() { return makeNode(); }
    createWaveShaper() { return makeNode(); } createConvolver() { return makeNode(); }
    createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
  };

  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 374, bottom: 610, width: 374, height: 610, toJSON() {} };
  };
  window.HTMLElement.prototype.setPointerCapture = function () {};
  window.HTMLElement.prototype.releasePointerCapture = function () {};
  window.scrollTo = () => {};
  Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
}

describe('Single-file build (play-offline.html)', () => {
  let dom, window, errors;

  it('exists and inlines everything', () => {
    assert(fs.existsSync(FILE), 'run: node tools/build-standalone.mjs');
    const src = fs.readFileSync(FILE, 'utf8');
    equal(/<link[^>]+href="css\//.test(src), false, 'no external stylesheet');
    equal(/src="js\//.test(src), false, 'no external script');
    equal(/fonts\.(googleapis|gstatic)\.com/.test(src), false, 'no font CDN call');
    assert(src.includes('DIWALI <em>DHAMAKA</em>'), 'wordmark present');
    equal(/<script[^>]*type="module"/.test(src), false, 'classic script only — modules are unreliable on file://');
    assert(/var \$\$ = \(sel, root = document\)/.test(src), 'the $$ helper survived bundling');
  });

  it('boots from the file system with no network', async () => {
    errors = [];
    dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), {
      url: 'file:///home/user/play-offline.html',
      runScripts: 'dangerously',
      pretendToBeVisual: false,
      resources: undefined,                 // never fetch anything
      beforeParse: stub
    });
    window = dom.window;
    window.addEventListener('error', (e) => errors.push(e.message));
    const origError = window.console.error;
    window.console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a); };

    // The build emits a classic script, so jsdom runs it exactly as a browser
    // opening the file from disk would — no manual evaluation needed.
    await new Promise((r) => setTimeout(r, 1500));
    assert(window.DiwaliDhamaka, 'the game announced itself on window');
  });

  it('renders a live screen and hides the boot-error panel', () => {
    const active = window.document.querySelector('.screen.is-active');
    assert(active, 'a screen is active');
    assert(['splash', 'home'].includes(active.dataset.screen), `unexpected screen: ${active?.dataset.screen}`);
    assert(window.document.getElementById('boot-error').hidden, 'no boot failure');
  });

  it('reaches home and can start a run', async () => {
    await new Promise((r) => setTimeout(r, 4000));
    equal(window.document.querySelector('.screen.is-active').dataset.screen, 'home');
    window.document.querySelector('.home__cta [data-action="play"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    equal(window.document.querySelector('.screen.is-active').dataset.screen, 'stage-intro');
    equal(window.document.querySelector('#si-name').textContent, 'LIGHT RUSH');
  });

  it('booted without console errors', () => {
    equal(errors.length, 0, `errors: ${errors.join(' | ')}`);
    dom.window.close();
  });
});

describe('index.html opened the wrong way', () => {
  it('warns clearly on file:// instead of showing a black screen', async () => {
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
      url: 'file:///home/user/Diwali-Game/index.html',
      runScripts: 'dangerously',
      beforeParse: stub
    });
    await new Promise((r) => setTimeout(r, 300));
    const doc = dom.window.document;
    equal(doc.getElementById('boot-error').hidden, false, 'the explanation is visible');
    const title = doc.getElementById('boot-error-title').textContent;
    assert(/http/i.test(title), `title should mention http: ${title}`);
    const detail = doc.getElementById('boot-error-detail').textContent;
    assert(detail.includes('play-offline.html'), 'points at the offline build');
    equal(doc.getElementById('boot-error-alt').hidden, false, 'offers a one-click way out');
    dom.window.close();
  });

  it('stays silent when served over http', async () => {
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost:8080/',
      runScripts: 'dangerously',
      beforeParse: stub
    });
    await new Promise((r) => setTimeout(r, 300));
    equal(dom.window.document.getElementById('boot-error').hidden, true, 'no warning over http');
    dom.window.close();
  });
});

runAll();
