// Pure WebAudio procedural sound effects (Minecraft / Stronghold cartoon tactile feel)
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastPlay = new Map();
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  canPlay(key, minGapMs = 45) {
    if (!this.enabled) return false;
    this.init();
    if (!this.ctx) return false;
    const now = performance.now();
    const prev = this.lastPlay.get(key) || 0;
    if (now - prev < minGapMs) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  // Crisp Minecraft-style block placement click/thud
  playPlaceBlock(type = 'stone') {
    if (!this.canPlay('place', 35)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type === 'wood' ? 'triangle' : 'square';
    const base = type === 'wood' ? 210 : (type === 'pitch' ? 140 : 280);
    osc.frequency.setValueAtTime(base + Math.random() * 60, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.07);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Bow twang
  playArrow(isFire = false) {
    if (!this.canPlay('arrow', 65)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isFire ? 520 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.09);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Sword / melee clash
  playHit() {
    if (!this.canPlay('hit', 75)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190 + Math.random() * 90, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.06);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // Trebuchet boulder smash & voxel wall crumble
  playExplosion() {
    if (!this.canPlay('boom', 110)) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.32;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.09));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.31);

    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(t);
  }

  // Pitch fire whoosh
  playFireIgnite() {
    if (!this.canPlay('fire', 180)) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.45;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(680, t);
    filter.frequency.linearRampToValueAtTime(320, t + 0.45);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(t);
  }

  // Nightfall siege bell
  playBell() {
    if (!this.canPlay('bell', 300)) return;
    const t = this.ctx.currentTime;
    [523.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(idx === 0 ? 0.22 : 0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.9);
    });
  }

  // Crusader charge war horn!
  playHorn(victory = false) {
    if (!this.canPlay('horn', 300)) return;
    const t = this.ctx.currentTime;
    const notes = victory ? [293.66, 369.99, 440, 587.33] : [220, 293.66, 329.63];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const start = t + i * 0.14;
      const dur = i === notes.length - 1 ? 0.55 : 0.16;
      osc.frequency.setValueAtTime(freq, start);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, start);

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(filter).connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }
}

export const sfx = new SoundEngine();
