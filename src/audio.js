// Every sound is synthesised with WebAudio at run time: there are no audio files in this project.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 3, 5, 7, 10];
const ROOTS = [45, 41, 48, 43]; // A, F, C, G

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.last = {};
    this.intensity = 0;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.combo = 0;
    this.comboT = 0;
  }

  /** Must be called from a user gesture: browsers block audio until then. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.34;
    this.musicLp = ctx.createBiquadFilter();
    this.musicLp.type = 'lowpass';
    this.musicLp.frequency.value = 900;
    this.music.connect(this.musicLp);
    this.musicLp.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setOn(this.on);
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.9 : 0;
  }

  tone(dest, freq, dur, type, vol, slide, when = 0, attack = 0.005) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dest, dur, vol, freq, when = 0, type = 'lowpass') {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }

  /** Play a named effect. Each name is rate-limited so hundreds of hits per second stay listenable. */
  play(name) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const gap = { dmg: 0.045, kill: 0.04, shoot: 0.07, pick: 0.03, boom: 0.06, eshoot: 0.2 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const S = this.sfx;
    switch (name) {
      case 'shoot': this.tone(S, 880, 0.07, 'triangle', 0.1, 440); break;
      case 'dmg': this.tone(S, 220 + Math.random() * 60, 0.04, 'square', 0.035); break;
      case 'kill': this.noise(S, 0.09, 0.12, 1800); this.tone(S, 300, 0.09, 'sawtooth', 0.05, 90); break;
      case 'boom': this.noise(S, 0.3, 0.3, 700); this.tone(S, 120, 0.25, 'sine', 0.3, 40); break;
      case 'ring': this.tone(S, 200, 0.35, 'sine', 0.22, 60); this.noise(S, 0.25, 0.1, 2400, 0, 'highpass'); break;
      case 'arc': this.noise(S, 0.08, 0.14, 5000, 0, 'highpass'); this.tone(S, 1400, 0.06, 'sawtooth', 0.04, 500); break;
      case 'beam': this.tone(S, 1200, 0.22, 'sawtooth', 0.09, 200); break;
      case 'pick': {
        // Collecting shards quickly climbs a scale.
        if (now - this.comboT > 0.6) this.combo = 0;
        this.comboT = now;
        const n = PENTA[this.combo % 5] + 12 * Math.floor(this.combo / 5);
        this.combo = Math.min(14, this.combo + 1);
        this.tone(S, mtof(72 + n), 0.09, 'sine', 0.09);
        break;
      }
      case 'item': [0, 4, 7].forEach((n, i) => this.tone(S, mtof(76 + n), 0.14, 'triangle', 0.14, 0, i * 0.05)); break;
      case 'levelup': [0, 3, 7, 12, 15].forEach((n, i) => this.tone(S, mtof(69 + n), 0.22, 'triangle', 0.16, 0, i * 0.06)); break;
      case 'select': this.tone(S, 660, 0.08, 'triangle', 0.14, 990); break;
      case 'hurt': this.tone(S, 160, 0.25, 'sawtooth', 0.28, 50); this.noise(S, 0.15, 0.2, 900); break;
      case 'dash': this.noise(S, 0.16, 0.16, 3000, 0, 'bandpass'); break;
      case 'eshoot': this.tone(S, 330, 0.12, 'square', 0.05, 160); break;
      case 'charge': this.tone(S, 80, 0.6, 'sawtooth', 0.2, 320); break;
      case 'warn': [0, 0.35, 0.7].forEach((w) => this.tone(S, 196, 0.3, 'sawtooth', 0.2, 185, w)); break;
      case 'boss': this.tone(S, 55, 1.4, 'sawtooth', 0.35, 30); this.noise(S, 1.2, 0.2, 400); break;
      case 'bossdie': this.noise(S, 1.4, 0.4, 1200); [0, 7, 12, 19].forEach((n, i) => this.tone(S, mtof(57 + n), 0.9, 'triangle', 0.16, 0, i * 0.12)); break;
      case 'death': this.tone(S, 440, 1.2, 'sawtooth', 0.25, 40); this.noise(S, 0.9, 0.25, 600); break;
      case 'win': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(S, mtof(60 + n), 0.5, 'triangle', 0.16, 0, i * 0.11)); break;
    }
  }

  // ------------------------------------------------------------ generative music

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** 0 = calm title screen, 1 = late-game frenzy. Layers and tempo follow it. */
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.musicLp) this.musicLp.frequency.setTargetAtTime(700 + this.intensity * 5200, this.ctx.currentTime, 0.5);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + 0.25) {
      this.note(this.step, this.nextT - ctx.currentTime);
      this.nextT += 60 / (88 + this.intensity * 44) / 4;
      this.step++;
    }
  }

  note(step, when) {
    const I = this.intensity, M = this.music;
    const bar = Math.floor(step / 16) % 4, s = step % 16, root = ROOTS[bar];
    if (s === 0) {
      // pad: root, fifth and tenth with a slow attack
      for (const n of [0, 7, 15]) this.tone(M, mtof(root + 12 + n), 2.6, 'sawtooth', 0.045, 0, when, 0.5);
    }
    if (s % 8 === 0 || (I > 0.45 && s % 4 === 2) || (I > 0.8 && s % 2 === 0)) this.tone(M, mtof(root), 0.3, 'triangle', 0.22, 0, when);
    // arpeggio: a hash of the step picks notes, so the line wanders but repeats every four bars
    const h = (step * 7 + bar * 3 + ((step >> 2) % 3) * 2) % 5;
    const play = I > 0.25 ? s % 2 === 0 || (I > 0.6 && (step * 5) % 3 === 0) : s % 4 === 0;
    if (play) this.tone(M, mtof(root + 24 + PENTA[h] + (s % 8 === 6 ? 12 : 0)), 0.18, 'square', 0.035 + I * 0.02, 0, when);
    if (I > 0.3 && s % 4 === 0) {
      this.tone(M, 130, 0.14, 'sine', 0.4, 38, when);
    }
    if (I > 0.55 && s % 4 === 2) this.noise(M, 0.04, 0.09, 7000, when, 'highpass');
    if (I > 0.75 && s % 8 === 4) this.noise(M, 0.12, 0.14, 1800, when, 'bandpass');
  }
}
