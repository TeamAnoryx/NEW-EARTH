/**
 * Fully procedural audio (no sample files, works offline).
 * Everything is synthesised with WebAudio: station hum, alarm, infected groans/screams,
 * door impacts, glass cracks, footsteps, duct clanks, heartbeat and a dark ambient score.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this._loops = {};
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);

    // shared reverb (synthetic impulse — metal hull)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.2);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.sfx = c.createGain(); this.sfx.gain.value = 1;
    this.sfx.connect(this.master); this.sfx.connect(this.reverbSend);
    this.music = c.createGain(); this.music.gain.value = 0.0;
    this.music.connect(this.master); this.music.connect(this.reverbSend);

    this._noise = this._noiseBuffer(3);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  _noiseBuffer(sec, brown = false) {
    const c = this.ctx, len = Math.floor(sec * c.sampleRate);
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  _impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(sec * c.sampleRate);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 40 ? 0 : 1);
    }
    return b;
  }

  _noiseSrc(loop = false, buf = this._noise) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s;
  }

  /** Spatial output node: panning + distance attenuation relative to listener. */
  _spatial(pos, ref = 3, maxGain = 1) {
    const c = this.ctx;
    const g = c.createGain();
    if (!pos) { g.gain.value = maxGain; g.connect(this.sfx); return g; }
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    const att = Math.min(1, ref / Math.max(ref, dist)) * maxGain;
    // listener forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw) in our convention
    const rx = -Math.cos(this.listener.yaw), rz = Math.sin(this.listener.yaw);
    const pan = dist > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    g.gain.value = att;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = pan * 0.85;
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  // ---------------------------------------------------------------- loops
  startAmbience() {
    if (!this.ready || this._loops.hum) return;
    const c = this.ctx, t = this.now;
    const out = c.createGain(); out.gain.value = 0; out.gain.linearRampToValueAtTime(0.5, t + 3);
    out.connect(this.sfx);
    // brown-noise air handling
    const n = this._noiseSrc(true, this._noiseBuffer(4, true));
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const ng = c.createGain(); ng.gain.value = 0.55;
    n.connect(lp).connect(ng).connect(out); n.start();
    // reactor hum: 50Hz + harmonics with slow beating
    const oscs = [49.5, 50.2, 100.3, 150.1].map((f, i) => {
      const o = c.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = [0.08, 0.06, 0.03, 0.015][i];
      o.connect(g).connect(out); o.start(); return o;
    });
    this._loops.hum = { out, nodes: [n, ...oscs] };
  }

  setAmbienceLevel(v, time = 1) { const l = this._loops.hum; if (l) l.out.gain.setTargetAtTime(v, this.now, time / 3); }

  startAlarm() {
    // the klaxon beeping was removed from play (feedback: no beeping). Kept for reference; enable with alarmEnabled.
    if (!this.alarmEnabled) return;
    if (!this.ready || this._loops.alarm) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0.0; out.connect(this.sfx);
    const o = c.createOscillator(); o.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2.5;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(bp); o2.connect(bp); bp.connect(g).connect(out);
    o.start(); o2.start();
    // two-tone klaxon pattern scheduled ahead
    let next = this.now + 0.05;
    const schedule = () => {
      if (!this._loops.alarm) return;
      while (next < this.now + 2) {
        o.frequency.setValueAtTime(620, next); o2.frequency.setValueAtTime(622, next);
        o.frequency.linearRampToValueAtTime(820, next + 0.55); o2.frequency.linearRampToValueAtTime(823, next + 0.55);
        g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(0.18, next + 0.04);
        g.gain.setValueAtTime(0.18, next + 0.6); g.gain.linearRampToValueAtTime(0, next + 0.7);
        next += 1.25;
      }
    };
    schedule();
    const iv = setInterval(schedule, 500);
    this._loops.alarm = { out, nodes: [o, o2], iv };
  }

  setAlarmLevel(v, time = 1) { const l = this._loops.alarm; if (l) l.out.gain.setTargetAtTime(v, this.now, time / 3); }

  /** Dark ambient score: detuned saws through a slow-moving low-pass. */
  startMusic(mood = 'dread') {
    if (!this.ready) return;
    this.stopMusic(0.1);
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.music);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = c.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    lp.connect(out);
    const LEVEL_MOODS = {
      l0: [55, 65.41, 82.41, 110],      // A minor, open and still
      l1: [49, 61.74, 73.42, 98],       // G, warm and low
      l2: [41.2, 49, 61.74, 82.41],     // E minor, deep and sparse
      l3: [46.25, 58.27, 69.3, 92.5],   // F# — hopeful lift
    };
    const roots = LEVEL_MOODS[mood] || (mood === 'calm' ? [55, 82.4, 110, 164.8] : mood === 'tension' ? [41.2, 43.65, 61.7, 87.3] : [36.7, 55, 58.27, 73.4]);
    const peaceful = mood in LEVEL_MOODS;
    const nodes = [lfo];
    roots.forEach((f) => {
      for (const d of [-6, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        const g = c.createGain(); g.gain.value = 0.05; o.connect(g).connect(lp); o.start(); nodes.push(o);
      }
    });
    // high shimmer
    const sh = c.createOscillator(); sh.type = 'sine'; sh.frequency.value = roots[2] * 8;
    const shg = c.createGain(); shg.gain.value = 0.006; sh.connect(shg).connect(out); sh.start(); nodes.push(sh);
    out.gain.linearRampToValueAtTime(peaceful ? 0.45 : mood === 'tension' ? 0.9 : 0.7, this.now + 4);
    if (peaceful) lp.frequency.value = 300;
    this.music.gain.setTargetAtTime(0.55, this.now, 0.5);
    this._loops.music = { out, nodes };
  }

  /** Peaceful bed for a level (0–3). */
  startLevelMusic(level) { if (this._levelMood !== level || !this._loops.music) { this._levelMood = level; this.startMusic(`l${level}`); } }

  /**
   * Infected / terror layer, cross-faded by threat (0 = absent, 1 = they are on you):
   * a tremolo string cluster, a pounding sub pulse and a sweeping metallic screech.
   */
  setThreat(t) {
    if (!this.ready) return;
    t = Math.max(0, Math.min(1, t));
    if (t > 0.02 && !this._terror) this._startTerror();
    if (!this._terror) return;
    if (Math.abs(t - this._terror.t) < 0.02) return;
    const rising = t > this._terror.t;
    this._terror.t = t;
    this._terror.out.gain.setTargetAtTime(t * 0.75, this.now, rising ? 0.25 : 0.9);
    // the calm bed ducks while they are close
    this.music?.gain.setTargetAtTime(0.55 * (1 - t * 0.7), this.now, 0.5);
  }

  _startTerror() {
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master); out.connect(this.reverbSend);
    const nodes = [];
    // string cluster with fast tremolo
    const trem = c.createGain(); trem.gain.value = 0.5;
    const tl = c.createOscillator(); tl.frequency.value = 7.5; const tlg = c.createGain(); tlg.gain.value = 0.45; tl.connect(tlg).connect(trem.gain); tl.start(); nodes.push(tl);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    [220, 233.1, 246.9, 329.6, 349.2].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 2) * 9; const g = c.createGain(); g.gain.value = 0.035; o.connect(g).connect(bp); o.start(); nodes.push(o); });
    bp.connect(trem).connect(out);
    // pounding sub pulse
    const sub = c.createOscillator(); sub.frequency.value = 38; const sg = c.createGain(); sg.gain.value = 0;
    const pl = c.createOscillator(); pl.type = 'square'; pl.frequency.value = 2.2; const pg = c.createGain(); pg.gain.value = 0.16; pl.connect(pg).connect(sg.gain);
    sub.connect(sg).connect(out); sub.start(); pl.start(); nodes.push(sub, pl);
    // metallic screech sweeping
    const n = this._noiseSrc(true); const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 14; hp.frequency.value = 2400;
    const sw = c.createOscillator(); sw.frequency.value = 0.13; const swg = c.createGain(); swg.gain.value = 1400; sw.connect(swg).connect(hp.frequency); sw.start();
    const ng = c.createGain(); ng.gain.value = 0.05; n.connect(hp).connect(ng).connect(out); n.start(); nodes.push(n, sw);
    this._terror = { out, nodes, t: 0 };
  }

  stopTerror() {
    const tr = this._terror; if (!tr) return;
    this._terror = null;
    tr.out.gain.setTargetAtTime(0, this.now, 0.4);
    this.music?.gain.setTargetAtTime(0.55, this.now, 0.5);
    setTimeout(() => tr.nodes.forEach((x) => { try { x.stop(); } catch (e) { console.info('terror node already stopped', e?.message || e); } }), 2500);
  }

  stopMusic(fade = 2) {
    const l = this._loops.music; if (!l) return;
    delete this._loops.music;
    l.out.gain.setTargetAtTime(0, this.now, fade / 3);
    setTimeout(() => l.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), fade * 1000 + 500);
  }

  // Heartbeat loop for stealth
  setHeartbeat(rate) {
    if (!this.ready) return;
    if (rate <= 0) { clearInterval(this._hb); this._hb = null; this._hbRate = 0; return; }
    if (this._hb && Math.abs(this._hbRate - rate) < 0.1) return;
    clearInterval(this._hb);
    this._hbRate = rate;
    const beat = () => { this._thump(55, 0.35); setTimeout(() => this._thump(48, 0.22), 180); };
    beat();
    this._hb = setInterval(beat, 60000 / (rate * 60));
  }

  _thump(f, v) {
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.25);
  }

  // ---------------------------------------------------------------- one-shots
  groan(pos, intensity = 1) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now, dur = 1.2 + Math.random() * 1.4;
    const out = this._spatial(pos, 3, 0.5 * intensity);
    const o = c.createOscillator(); o.type = 'sawtooth';
    const base = 70 + Math.random() * 45;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.5), t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5 + Math.random() * 6;
    const vg = c.createGain(); vg.gain.value = 8; vib.connect(vg).connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 + Math.random() * 300; f1.Q.value = 5;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100 + Math.random() * 500; f2.Q.value = 7;
    const n = this._noiseSrc(); const ng = c.createGain(); ng.gain.value = 0.25;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
    o.connect(f1); o.connect(f2); n.connect(ng).connect(f1);
    f1.connect(g); f2.connect(g); g.connect(out);
    o.start(t); vib.start(t); n.start(t, Math.random()); o.stop(t + dur + 0.5); vib.stop(t + dur + 0.5); n.stop(t + dur + 0.5);
  }

  scream(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 6, 1.0);
    for (let k = 0; k < 2; k++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(260 + k * 7, t); o.frequency.exponentialRampToValueAtTime(720 + k * 13, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(380, t + 1.8);
      const vib = c.createOscillator(); vib.frequency.value = 23; const vg = c.createGain(); vg.gain.value = 35;
      vib.connect(vg).connect(o.frequency);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.5;
      const ws = c.createWaveShaper(); ws.curve = this._distCurve(40);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.08); g.gain.setTargetAtTime(0, t + 1.4, 0.25);
      o.connect(ws).connect(bp).connect(g).connect(out);
      o.start(t); vib.start(t); o.stop(t + 2.6); vib.stop(t + 2.6);
    }
    const n = this._noiseSrc(); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.4, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    n.connect(hp).connect(ng).connect(out); n.start(t); n.stop(t + 2);
  }

  _distCurve(k) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); }
    return curve;
  }

  impact(pos, strength = 1, metallic = true) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 4, strength);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const og = c.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.5);
    const n = this._noiseSrc(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(lp).connect(ng).connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.25);
    if (metallic) {
      [523, 787, 1243, 1871].forEach((f, i) => {
        const m = c.createOscillator(); m.frequency.value = f * (0.95 + Math.random() * 0.1);
        const mg = c.createGain(); mg.gain.setValueAtTime(0.06 / (i + 1), t); mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 + i * 0.2);
        m.connect(mg).connect(out); m.start(t); m.stop(t + 1.3);
      });
    }
  }

  glassCrack(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 4, 0.8);
    for (let i = 0; i < 7; i++) {
      const tt = t + i * 0.012 + Math.random() * 0.03;
      const n = this._noiseSrc(); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000 + Math.random() * 3000;
      const g = c.createGain(); g.gain.setValueAtTime(0.6, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
      n.connect(hp).connect(g).connect(out); n.start(tt, Math.random() * 2); n.stop(tt + 0.08);
    }
  }

  footstep(pos, loud = 0.5, metal = true) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 2.5, loud * 0.5);
    const n = this._noiseSrc(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = metal ? 900 + Math.random() * 300 : 400; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(bp).connect(g).connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.12);
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.06);
    const og = c.createGain(); og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.1);
  }

  ductClank(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 2, 0.25);
    [180, 271, 433].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
      const g = c.createGain(); g.gain.setValueAtTime(0.25 / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.55);
    });
  }

  doorSlide(pos, closing = true) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 4, 0.7);
    const n = this._noiseSrc(); const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(closing ? 300 : 700, t); bp.frequency.linearRampToValueAtTime(closing ? 700 : 300, t + 0.6); bp.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05); g.gain.setTargetAtTime(0, t + 0.55, 0.06);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + 1);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t); o.frequency.linearRampToValueAtTime(90, t + 0.6);
    const og = c.createGain(); og.gain.setValueAtTime(0.07, t); og.gain.setTargetAtTime(0, t + 0.6, 0.05);
    const lp = c.createBiquadFilter(); lp.frequency.value = 300;
    o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + 1);
    if (closing) setTimeout(() => this.impact(pos, 0.45), 600);
  }

  /** Mag-lock engage chirp + clunk. */
  lock(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const out = this._spatial(pos, 3, 0.6);
    [880, 1320].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.06, t + i * 0.09 + 0.005); g.gain.linearRampToValueAtTime(0, t + i * 0.09 + 0.08);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    });
    setTimeout(() => this.impact(pos, 0.3), 200);
  }

  ui(kind = 'blip') {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.type = 'sine';
    const f = kind === 'objective' ? [660, 990] : kind === 'error' ? [220, 180] : kind === 'tablet' ? [1200, 1800] : [1400, 1400];
    o.frequency.setValueAtTime(f[0], t); o.frequency.linearRampToValueAtTime(f[1], t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(kind === 'objective' ? 0.12 : 0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'objective' ? 0.6 : 0.15));
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.7);
  }

  /** Cinematic low boom / riser hit. */
  stinger(strength = 1) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.8 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 3);
    o.connect(g).connect(this.master); o.connect(g).connect(this.reverbSend); o.start(t); o.stop(t + 3);
    const n = this._noiseSrc(); const lp = c.createBiquadFilter(); lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(100, t + 1.5);
    const ng = c.createGain(); ng.gain.setValueAtTime(0.4 * strength, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 2);
    n.connect(lp).connect(ng).connect(this.reverbSend); n.start(t); n.stop(t + 2);
  }

  rustle() {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const n = this._noiseSrc(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.6);
    n.connect(bp).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.7);
  }

  // ================================================================ intro / menu sound design
  _envelope(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  /** Countdown tick: glassy two-partial ping; `final` = deeper, longer hit. */
  countBeep(final = false) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    [[final ? 440 : 880, 0.18], [final ? 660 : 1760, 0.07]].forEach(([f, v]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); this._envelope(g, t, 0.005, v, final ? 1.4 : 0.45);
      o.connect(g).connect(this.master); o.connect(g).connect(this.reverbSend); o.start(t); o.stop(t + 1.6);
    });
    if (final) this.stinger(0.6);
  }

  /** Air whoosh with a rising/falling band — for things flying past. */
  whoosh(dur = 1.2, up = true, vol = 0.5) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const n = this._noiseSrc(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 250 : 3000, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 220, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g); g.connect(this.master); g.connect(this.reverbSend); n.start(t, Math.random()); n.stop(t + dur + 0.1);
  }

  /** Per-letter sci-fi tick (pitch rises across the word). */
  letterTick(i = 0) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(600 + i * 90, t); o.frequency.exponentialRampToValueAtTime(1800 + i * 120, t + 0.05);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
    const g = c.createGain(); this._envelope(g, t, 0.002, 0.05, 0.12);
    o.connect(f).connect(g).connect(this.master); g.connect(this.reverbSend); o.start(t); o.stop(t + 0.2);
    const n = this._noiseSrc(); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const ng = c.createGain(); this._envelope(ng, t, 0.001, 0.08, 0.05); n.connect(hp).connect(ng).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.1);
  }

  /** Big impact for title lock-in. */
  titleHit() {
    if (!this.ready) return;
    this.stinger(0.9);
    const c = this.ctx, t = this.now;
    [55, 110, 164.8, 220, 329.6].forEach((f, i) => {
      const o = c.createOscillator(); o.type = i ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = c.createGain(); this._envelope(g, t, 0.01, 0.12 / (i + 1), 3.5);
      o.connect(g).connect(this.master); o.connect(g).connect(this.reverbSend); o.start(t); o.stop(t + 4);
    });
  }

  /** ANORYX logo signature: rising shimmer → crystalline chord → sub drop. ~3 s. */
  logoSting() {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    this.whoosh(1.1, true, 0.35);
    // shimmer arpeggio (pentatonic)
    [0, 0.12, 0.24, 0.36, 0.48, 0.6].forEach((dt, i) => {
      const f = [523.3, 659.3, 784, 987.8, 1174.7, 1568][i];
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); this._envelope(g, t + 0.5 + dt, 0.004, 0.06, 1.6);
      o.connect(g).connect(this.master); o.connect(g).connect(this.reverbSend); o.start(t + 0.5 + dt); o.stop(t + 2.6 + dt);
    });
    // chord bloom
    [130.8, 196, 261.6, 329.6, 392].forEach((f, i) => {
      for (const d of [-7, 7]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t + 1.1); lp.frequency.exponentialRampToValueAtTime(3500, t + 1.6); lp.frequency.exponentialRampToValueAtTime(600, t + 3.2);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + 1.1); g.gain.exponentialRampToValueAtTime(0.03 / (1 + i * 0.3), t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        o.connect(lp).connect(g).connect(this.master); g.connect(this.reverbSend); o.start(t + 1.1); o.stop(t + 3.5);
      }
    });
    setTimeout(() => this._thump(42, 0.6), 1100);
  }

  /** Implode suck-in for the logo vanishing. */
  implode() { this.whoosh(0.6, false, 0.4); setTimeout(() => this._thump(60, 0.3), 550); }

  /** UI sounds: hover, press, toggle on/off, open/close panel. */
  uiSound(kind = 'press') {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const spec = {
      hover: [[2200, 2600, 0.02, 0.05]], press: [[900, 1400, 0.07, 0.09], [1800, 2400, 0.03, 0.06]],
      on: [[700, 1100, 0.06, 0.08], [1100, 1650, 0.05, 0.1]], off: [[1100, 700, 0.06, 0.08], [700, 480, 0.05, 0.1]],
      open: [[400, 1200, 0.05, 0.18]], close: [[1200, 400, 0.05, 0.16]], play: [[330, 990, 0.08, 0.35], [495, 1485, 0.05, 0.4]],
    }[kind] || [[1000, 1000, 0.05, 0.08]];
    spec.forEach(([f0, f1, v, d], i) => {
      const o = c.createOscillator(); o.type = i ? 'triangle' : 'sine';
      const st = t + i * 0.045;
      o.frequency.setValueAtTime(f0, st); o.frequency.exponentialRampToValueAtTime(f1, st + d);
      const g = c.createGain(); this._envelope(g, st, 0.003, v, d + 0.05);
      o.connect(g).connect(this.master); o.start(st); o.stop(st + d + 0.1);
    });
  }

  /**
   * Generative ambient loop for the main console: evolving pad (Am9 → Fmaj7 → Cmaj9 → G6sus),
   * sub bass, and a sparse bell arpeggio with echo. Runs until stopMenuMusic().
   */
  startMenuMusic() {
    if (!this.ready || this._menu) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0.0001; out.connect(this.master); out.connect(this.reverbSend);
    out.gain.exponentialRampToValueAtTime(0.5, this.now + 4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3; lp.connect(out);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const delay = c.createDelay(1.5); delay.delayTime.value = 0.42; const fb = c.createGain(); fb.gain.value = 0.38;
    delay.connect(fb).connect(delay); delay.connect(out);
    const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 62, 64], [55, 57, 62, 64, 67]];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BAR = 8; let next = this.now + 0.1, idx = 0;
    const state = { out, nodes: [lfo], iv: null };
    const schedule = () => {
      if (this._menu !== state) return;
      while (next < this.now + 3) {
        const ch = chords[idx % chords.length];
        ch.forEach((m, i) => {
          for (const d of [-8, 8]) {
            const o = c.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = mtof(m); o.detune.value = d;
            const g = c.createGain(); g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.022, next + 2.5); g.gain.setValueAtTime(0.022, next + BAR - 2); g.gain.exponentialRampToValueAtTime(0.0001, next + BAR + 1.5);
            o.connect(g).connect(lp); o.start(next); o.stop(next + BAR + 1.6);
          }
        });
        const sub = c.createOscillator(); sub.frequency.value = mtof(ch[0] - 24);
        const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, next); sg.gain.exponentialRampToValueAtTime(0.09, next + 1.5); sg.gain.exponentialRampToValueAtTime(0.0001, next + BAR + 0.5);
        sub.connect(sg).connect(out); sub.start(next); sub.stop(next + BAR + 0.6);
        // bells
        for (let k = 0; k < 6; k++) {
          if (Math.random() < 0.35) continue;
          const bt = next + 0.5 + k * (BAR / 6) + Math.random() * 0.2;
          const m = ch[(k * 2 + idx) % ch.length] + 24;
          const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
          const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m) * 2.76;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, bt); g.gain.exponentialRampToValueAtTime(0.03, bt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, bt + 2.2);
          const g2 = c.createGain(); g2.gain.value = 0.25;
          o.connect(g); o2.connect(g2).connect(g); g.connect(out); g.connect(delay);
          o.start(bt); o2.start(bt); o.stop(bt + 2.3); o2.stop(bt + 2.3);
        }
        next += BAR; idx++;
      }
    };
    this._menu = state;
    schedule(); state.iv = setInterval(schedule, 700);
  }

  stopMenuMusic(fade = 1.5) {
    const m = this._menu; if (!m) return;
    this._menu = null; clearInterval(m.iv);
    m.out.gain.setTargetAtTime(0.0001, this.now, fade / 4);
    setTimeout(() => { m.nodes.forEach((n) => { try { n.stop(); } catch { /* stopped */ } }); m.out.disconnect(); }, fade * 1000 + 600);
  }

  setMusicMuted(muted) { this.musicMuted = muted; if (this.master && this._menu) this._menu.out.gain.setTargetAtTime(muted ? 0.0001 : 0.5, this.now, 0.2); }

  stopAll() {
    this.stopTerror();
    Object.keys(this._loops).forEach((k) => {
      const l = this._loops[k];
      if (l.iv) clearInterval(l.iv);
      l.out.gain.setTargetAtTime(0, this.now, 0.2);
      setTimeout(() => l.nodes.forEach((n) => { try { n.stop(); } catch { /* noop */ } }), 1500);
    });
    this._loops = {};
    this.setHeartbeat(0);
  }
}
