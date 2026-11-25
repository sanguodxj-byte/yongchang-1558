// Pure WebAudio Procedural Ming-Chinese Anti-Wokou & LingShu AI Sound Engine
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

  // Crisp Chinese mortise-and-tenon wood clack / granite stone thud
  playPlaceBlock(type = 'stone') {
    if (!this.canPlay('place', 35)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type === 'wood' ? 'triangle' : 'sine';
    const base = type === 'wood' ? 293.66 : (type === 'pitch' ? 164.81 : 220.0);
    osc.frequency.setValueAtTime(base + Math.random() * 35, t);
    osc.frequency.exponentialRampToValueAtTime(82, t + 0.08);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // Ming Matchlock Arquebus crack (`鸟铳击发`) or Crossbow snap
  playArrow(isFire = false) {
    if (!this.canPlay('arrow', 65)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isFire ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isFire ? 620 : 480, t);
    osc.frequency.exponentialRampToValueAtTime(135, t + 0.085);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.095);
  }

  // Yanling Saber / Bamboo Langxian clash
  playHit() {
    if (!this.canPlay('hit', 75)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220 + Math.random() * 95, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.06);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // Ming Folangji / Crouching-Tiger Cannon thunder!
  playExplosion() {
    if (!this.canPlay('boom', 110)) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.34;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.095));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(460, t);
    filter.frequency.exponentialRampToValueAtTime(65, t + 0.32);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.34, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.33);

    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(t);
  }

  // Fierce Fire-Oil Trench (`猛火油`) whoosh
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
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(320, t + 0.45);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(t);
  }

  // Yongchang Watchtower Bronze Alarm Gong + War Drum (`警世铜锣与牛皮战鼓`)!
  playBell() {
    if (!this.canPlay('bell', 300)) return;
    const t = this.ctx.currentTime;
    // Metallic bronze gong shimmer harmonics
    [261.63, 392.0, 554.37, 622.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.96, t + 0.95);
      gain.gain.setValueAtTime(idx === 0 ? 0.20 : 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.98);
    });
    // Deep war-drum double beat
    [0.0, 0.22].forEach((off) => {
      const drum = this.ctx.createOscillator();
      const dGain = this.ctx.createGain();
      drum.type = 'sine';
      drum.frequency.setValueAtTime(118, t + off);
      drum.frequency.exponentialRampToValueAtTime(46, t + off + 0.18);
      dGain.gain.setValueAtTime(0.24, t + off);
      dGain.gain.exponentialRampToValueAtTime(0.001, t + off + 0.19);
      drum.connect(dGain).connect(this.ctx.destination);
      drum.start(t + off);
      drum.stop(t + off + 0.20);
    });
  }

  // Chinese Pentatonic Rally Horn (`大明五声战号：宫商角徵羽`)!
  playHorn(victory = false) {
    if (!this.canPlay('horn', 300)) return;
    const t = this.ctx.currentTime;
    // Pentatonic D-E-G-A-D5!
    const notes = victory ? [293.66, 329.63, 392.0, 440.0, 587.33] : [220.0, 293.66, 392.0];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const start = t + i * 0.13;
      const dur = i === notes.length - 1 ? 0.58 : 0.15;
      osc.frequency.setValueAtTime(freq, start);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(980, start);

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(filter).connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // Ancestral Hall Bronze Chime & Scout Signal (`宗祠编钟与斥候传讯清音`)
  playScan() {
    if (!this.canPlay('scan', 250)) return;
    const t = this.ctx.currentTime;
    [587.33, 880.0, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const st = t + idx * 0.06;
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.09, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.36);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.38);
    });
  }
}

export const sfx = new SoundEngine();
