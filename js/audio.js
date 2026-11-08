/**
 * AUDIO — 100% synthesised with the Web Audio API.
 * No external files, no copyrighted music, nothing to preload.
 *
 * The context is created lazily on the first real user gesture so browser
 * autoplay policies are respected, and every voice disconnects itself when it
 * finishes so long sessions never leak nodes.
 */

const SCALES = {
  // Major pentatonic (bright, festive) and a minor-ish mode for the boss.
  festive: [0, 2, 4, 7, 9, 12, 14, 16],
  boss: [0, 1, 5, 7, 8, 12, 13, 17]
};

const THEMES = {
  menu: { root: 261.63, bpm: 84, scale: 'festive', density: 0.55, perc: 0.35, gain: 0.5 },
  play: { root: 293.66, bpm: 104, scale: 'festive', density: 0.8, perc: 0.75, gain: 0.62 },
  boss: { root: 196.00, bpm: 118, scale: 'boss', density: 0.9, perc: 0.95, gain: 0.7 }
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabledSfx = true;
    this.enabledMusic = true;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this._timer = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._theme = null;
    this._themeName = null;
    this._noiseBuffer = null;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  init() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.enabledMusic ? 0.14 : 0;

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.enabledSfx ? 0.85 : 0;

    const reverb = this.ctx.createConvolver();
    reverb.buffer = this._impulse(1.1, 2.6);
    const reverbSend = this.ctx.createGain();
    reverbSend.gain.value = 0.16;
    reverb.connect(this.master);
    this.reverbSend = reverbSend;
    reverbSend.connect(reverb);

    this.musicBus.connect(comp);
    this.sfxBus.connect(comp);
    this.sfxBus.connect(reverbSend);
    this.musicBus.connect(reverbSend);
    comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    this._noiseBuffer = this._noise(1.4);
    this.ready = true;
    return this.ctx;
  }

  /** Call from a pointer/key handler. Safe to call repeatedly. */
  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ready;
  }

  setSfxEnabled(on) {
    this.enabledSfx = Boolean(on);
    if (this.sfxBus) this._ramp(this.sfxBus.gain, this.enabledSfx ? 0.85 : 0, 0.08);
  }

  setMusicEnabled(on) {
    this.enabledMusic = Boolean(on);
    if (!this.ctx) return;
    if (this.enabledMusic) {
      this._ramp(this.musicBus.gain, 0.14 * (this._theme?.gain ?? 1), 0.4);
      if (!this._timer && this._themeName) this.startMusic(this._themeName);
    } else {
      this._ramp(this.musicBus.gain, 0, 0.3);
    }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  /* -------------------------------- helpers ------------------------------- */

  _ramp(param, value, time = 0.05) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + time);
  }

  _noise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** One oscillator voice with an ADSR-ish envelope. */
  _voice(bus, { freq = 440, type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, release, slideTo, detune = 0, delay = 0, curve = 'exp' } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);

    const rel = release ?? dur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + rel);
    else g.gain.linearRampToValueAtTime(0.0001, t0 + attack + rel);

    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + attack + rel + 0.05);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* noop */ } };
    return osc;
  }

  /** Filtered noise burst (sparks, explosions, percussion). */
  _noiseBurst(bus, { dur = 0.25, gain = 0.3, filter = 'bandpass', freq = 1200, q = 1.2, sweepTo, delay = 0 } = {}) {
    if (!this.ctx || !this._noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(freq, t0);
    bq.Q.value = q;
    if (sweepTo) bq.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq); bq.connect(g); g.connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => { try { src.disconnect(); bq.disconnect(); g.disconnect(); } catch { /* noop */ } };
  }

  /* --------------------------------- SFX --------------------------------- */

  play(name, opts = {}) {
    if (!this.enabledSfx) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const bus = this.sfxBus;
    const n = Math.min(12, Math.max(0, opts.step || 0)); // pitch step for combos

    switch (name) {
      case 'click':
        this._voice(bus, { freq: 660, type: 'triangle', dur: 0.08, gain: 0.22, slideTo: 880 });
        this._noiseBurst(bus, { dur: 0.05, gain: 0.08, freq: 2600, q: 0.8 });
        break;

      case 'back':
        this._voice(bus, { freq: 520, type: 'triangle', dur: 0.1, gain: 0.18, slideTo: 330 });
        break;

      case 'diya': {
        const base = 520 * Math.pow(2 ** (1 / 12), n);
        this._voice(bus, { freq: base, type: 'sine', dur: 0.26, gain: 0.26, slideTo: base * 1.6, attack: 0.004 });
        this._voice(bus, { freq: base * 2, type: 'sine', dur: 0.2, gain: 0.1, delay: 0.02 });
        this._noiseBurst(bus, { dur: 0.16, gain: 0.07, freq: 900, sweepTo: 3200, q: 0.9 });
        break;
      }

      case 'golden': {
        const base = 784 * Math.pow(2 ** (1 / 12), Math.min(n, 7));
        this._voice(bus, { freq: base, type: 'triangle', dur: 0.18, gain: 0.22 });
        this._voice(bus, { freq: base * 1.5, type: 'sine', dur: 0.3, gain: 0.18, delay: 0.07 });
        this._voice(bus, { freq: base * 2, type: 'sine', dur: 0.34, gain: 0.12, delay: 0.14 });
        break;
      }

      case 'coin':
        this._voice(bus, { freq: 988, type: 'square', dur: 0.06, gain: 0.12 });
        this._voice(bus, { freq: 1319, type: 'square', dur: 0.14, gain: 0.1, delay: 0.06 });
        break;

      case 'sweet': {
        const base = 392 * Math.pow(2 ** (1 / 12), n);
        this._voice(bus, { freq: base, type: 'triangle', dur: 0.14, gain: 0.26, slideTo: base * 1.35 });
        this._noiseBurst(bus, { dur: 0.08, gain: 0.05, freq: 1800, q: 1.4 });
        break;
      }

      case 'match':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this._voice(bus, { freq: f, type: 'triangle', dur: 0.34 - i * 0.03, gain: 0.2, delay: i * 0.055 });
        });
        break;

      case 'wrong':
        this._voice(bus, { freq: 220, type: 'sawtooth', dur: 0.2, gain: 0.16, slideTo: 150 });
        this._noiseBurst(bus, { dur: 0.16, gain: 0.08, freq: 420, q: 2.2 });
        break;

      case 'penalty':
        this._voice(bus, { freq: 180, type: 'square', dur: 0.26, gain: 0.16, slideTo: 90 });
        break;

      case 'launch':
        this._noiseBurst(bus, { dur: 0.42, gain: 0.1, filter: 'bandpass', freq: 380, sweepTo: 2600, q: 1.1 });
        this._voice(bus, { freq: 200, type: 'sawtooth', dur: 0.4, gain: 0.06, slideTo: 760 });
        break;

      case 'firework':
        this._noiseBurst(bus, { dur: 0.55, gain: 0.3, filter: 'lowpass', freq: 4200, sweepTo: 240, q: 0.6 });
        this._voice(bus, { freq: 120, type: 'sine', dur: 0.3, gain: 0.3, slideTo: 44 });
        this._noiseBurst(bus, { dur: 0.7, gain: 0.08, filter: 'highpass', freq: 2200, delay: 0.06 });
        break;

      case 'combo': {
        const step = Math.min(opts.level || 1, 4);
        const notes = [0, 4, 7, 11, 14].slice(0, 2 + step);
        notes.forEach((semi, i) => {
          this._voice(bus, { freq: 440 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.3, gain: 0.17, delay: i * 0.05 });
        });
        break;
      }

      case 'achievement':
        [523.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          this._voice(bus, { freq: f, type: 'sine', dur: 0.75, gain: 0.16, delay: i * 0.08 });
        });
        this._noiseBurst(bus, { dur: 0.6, gain: 0.05, filter: 'highpass', freq: 3200 });
        break;

      case 'boss-hit':
        this._voice(bus, { freq: 150, type: 'sawtooth', dur: 0.22, gain: 0.26, slideTo: 60 });
        this._noiseBurst(bus, { dur: 0.3, gain: 0.16, filter: 'bandpass', freq: 900, sweepTo: 180, q: 0.8 });
        break;

      case 'boss-core':
        this._voice(bus, { freq: 880, type: 'triangle', dur: 0.4, gain: 0.26, slideTo: 1760 });
        this._noiseBurst(bus, { dur: 0.45, gain: 0.14, filter: 'bandpass', freq: 2400, sweepTo: 600 });
        break;

      case 'boss-attack':
        this._voice(bus, { freq: 320, type: 'sawtooth', dur: 0.5, gain: 0.1, slideTo: 110 });
        break;

      case 'hurt':
        this._voice(bus, { freq: 260, type: 'square', dur: 0.3, gain: 0.2, slideTo: 80 });
        this._noiseBurst(bus, { dur: 0.35, gain: 0.14, filter: 'lowpass', freq: 1400, sweepTo: 200 });
        break;

      case 'shield':
        this._voice(bus, { freq: 523, type: 'sine', dur: 0.5, gain: 0.18, slideTo: 1046 });
        this._noiseBurst(bus, { dur: 0.5, gain: 0.06, filter: 'highpass', freq: 1800 });
        break;

      case 'power':
        this._voice(bus, { freq: 392, type: 'triangle', dur: 0.4, gain: 0.22, slideTo: 1176 });
        break;

      case 'stun':
        this._noiseBurst(bus, { dur: 0.6, gain: 0.16, filter: 'bandpass', freq: 3000, sweepTo: 400, q: 0.7 });
        this._voice(bus, { freq: 1200, type: 'square', dur: 0.2, gain: 0.08, slideTo: 300 });
        break;

      case 'boss-defeat':
        this._noiseBurst(bus, { dur: 1.6, gain: 0.3, filter: 'lowpass', freq: 3600, sweepTo: 90, q: 0.5 });
        [110, 82.4, 65.4].forEach((f, i) => this._voice(bus, { freq: f, type: 'sawtooth', dur: 1.2, gain: 0.18, delay: i * 0.1, slideTo: f * 0.5 }));
        break;

      case 'victory':
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => {
          this._voice(bus, { freq: f, type: 'triangle', dur: 0.9, gain: 0.18, delay: i * 0.1 });
          this._voice(bus, { freq: f * 2, type: 'sine', dur: 0.6, gain: 0.06, delay: i * 0.1 + 0.02 });
        });
        this._noiseBurst(bus, { dur: 1.2, gain: 0.06, filter: 'highpass', freq: 3600, delay: 0.3 });
        break;

      case 'stage-clear':
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this._voice(bus, { freq: f, type: 'triangle', dur: 0.5, gain: 0.18, delay: i * 0.07 }));
        break;

      case 'record':
        [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => this._voice(bus, { freq: f, type: 'sine', dur: 1.0, gain: 0.17, delay: i * 0.09 }));
        break;

      case 'tick':
        this._voice(bus, { freq: 1200, type: 'square', dur: 0.04, gain: 0.08 });
        break;

      case 'whoosh':
        this._noiseBurst(bus, { dur: 0.35, gain: 0.1, filter: 'bandpass', freq: 600, sweepTo: 2400, q: 0.8 });
        break;

      default:
        break;
    }
  }

  /* -------------------------------- Music -------------------------------- */

  startMusic(themeName = 'menu') {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this._themeName = themeName;
    const theme = THEMES[themeName] || THEMES.menu;
    const changed = this._theme !== theme;
    this._theme = theme;
    if (!this.enabledMusic) return;

    this._ramp(this.musicBus.gain, 0.14 * theme.gain, 0.6);
    if (this._timer) {
      if (changed) { this._step = 0; this._nextNoteTime = this.ctx.currentTime + 0.08; }
      return;
    }
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic(fade = 0.5) {
    if (!this.ctx) return;
    this._ramp(this.musicBus.gain, 0, fade);
    clearInterval(this._timer);
    this._timer = null;
  }

  _scheduler() {
    if (!this.ctx || !this._theme) return;
    const theme = this._theme;
    const spb = 60 / theme.bpm / 2; // eighth notes
    while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(this._step, this._nextNoteTime, theme);
      this._nextNoteTime += spb;
      this._step = (this._step + 1) % 32;
    }
  }

  _playStep(step, time, theme) {
    const bus = this.musicBus;
    const scale = SCALES[theme.scale];
    const bar = Math.floor(step / 8) % 4;

    // --- bass / drone on bar starts
    if (step % 8 === 0) {
      const root = theme.root * (bar === 2 ? 1.1892 : bar === 3 ? 0.8909 : 1);
      this._schedVoice(bus, root / 2, 'sawtooth', time, 0.9, 0.09, 420);
      this._schedVoice(bus, root, 'sine', time, 0.85, 0.05);
    }

    // --- melodic arpeggio
    const pattern = [0, 2, 4, 2, 3, 5, 4, 2];
    if (Math.random() < theme.density) {
      const degree = scale[pattern[step % 8] % scale.length];
      const octave = step % 16 >= 8 ? 2 : 1;
      const freq = theme.root * Math.pow(2, degree / 12) * octave;
      this._schedVoice(bus, freq, step % 4 === 0 ? 'triangle' : 'sine', time, 0.26, 0.055);
      if (step % 8 === 4) this._schedVoice(bus, freq * 2, 'sine', time + 0.02, 0.2, 0.025);
    }

    // --- percussion (tabla-ish): resonant low thump + crisp tick
    if (step % 4 === 0 && Math.random() < theme.perc) {
      this._schedNoise(bus, time, 0.14, 0.05, 'lowpass', 220, 90);
      this._schedVoice(bus, 110, 'sine', time, 0.12, 0.06, null, 70);
    }
    if ((step % 8 === 3 || step % 8 === 6) && Math.random() < theme.perc * 0.8) {
      this._schedNoise(bus, time, 0.07, 0.03, 'bandpass', 2600, 1800);
    }
  }

  _schedVoice(bus, freq, type, time, dur, gain, filterFreq = null, slideTo = null) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let node = osc;
    if (filterFreq) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = filterFreq;
      osc.connect(bq); node = bq;
    }
    node.connect(g); g.connect(bus);
    osc.start(time); osc.stop(time + dur + 0.05);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* noop */ } };
  }

  _schedNoise(bus, time, dur, gain, filter, freq, sweepTo) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(freq, time);
    if (sweepTo) bq.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bq); bq.connect(g); g.connect(bus);
    src.start(time); src.stop(time + dur + 0.05);
    src.onended = () => { try { src.disconnect(); bq.disconnect(); g.disconnect(); } catch { /* noop */ } };
  }
}

export const audio = new AudioEngine();
