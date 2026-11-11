#!/usr/bin/env node
/**
 * NEW EARTH — original background score, synthesised offline and rendered to MP3.
 *
 *   node scripts/compose-score.mjs          → public/music/*.mp3  (needs ffmpeg on PATH)
 *
 * Pre-rendered loops play from an AudioBuffer (decoded once, played by the browser's audio
 * thread), so the score never crackles when the game's main thread is busy — unlike notes
 * scheduled live from JavaScript timers. Every track is written as a seamless loop: the reverb
 * tail is wrapped back onto the start, and the game additionally cross-fades each repeat.
 *
 * All material here is original (generated from the chord plans below); no samples are used.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'music');
const TMP = join(OUT, '.tmp');
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// deterministic randomness so a re-render produces the same score
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------------------------------------------------------------- wavetables
const TN = 4096;
function table(harmonics) {
  const t = new Float32Array(TN + 1);
  for (let i = 0; i <= TN; i++) { let v = 0; for (const [n, a] of harmonics) v += a * Math.sin((TAU * n * i) / TN); t[i] = v; }
  let peak = 0; for (const v of t) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i <= TN; i++) t[i] /= peak;
  return t;
}
const WT = {
  warm: table(Array.from({ length: 12 }, (_, i) => [i + 1, Math.exp(-i * 0.42) / (i + 1)])), // soft saw
  dark: table(Array.from({ length: 6 }, (_, i) => [i + 1, Math.exp(-i * 0.9) / (i + 1)])),
  string: table(Array.from({ length: 16 }, (_, i) => [i + 1, 1 / (i + 1)])),
  sine: table([[1, 1]]),
  hollow: table([[1, 1], [3, 0.3], [5, 0.12], [7, 0.05]]),
};
const look = (t, ph) => { const x = ph * TN, i = x | 0, f = x - i; return t[i] + (t[i + 1] - t[i]) * f; };

// ---------------------------------------------------------------- track buffer
function makeTrack(sec) {
  const n = Math.round(sec * SR);
  return { sec, n, L: new Float32Array(n + 8 * SR), R: new Float32Array(n + 8 * SR) };
}

/** One sustained voice with attack/release, stereo position and optional tremolo. */
function voice(T, { f, t0, dur, amp, wt = 'warm', att = 1.5, rel = 2.5, pan = 0, detune = 0, trem = 0, tremRate = 6, vib = 0.0025 }) {
  const s0 = Math.round(t0 * SR), len = Math.round((dur + rel) * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const tab = WT[wt];
  let ph = rnd();
  const fr = f * Math.pow(2, detune / 1200) / SR;
  const vr = 0.18 + rnd() * 0.2;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = t < att ? Math.sin((t / att) * Math.PI / 2) ** 2 : t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel) ** 2;
    if (env <= 0) continue;
    ph += fr * (1 + vib * Math.sin(TAU * vr * t)); ph -= ph | 0;
    let v = look(tab, ph) * env * amp;
    if (trem) v *= 1 - trem * 0.5 * (1 + Math.sin(TAU * tremRate * t));
    const k = s0 + i; if (k >= T.L.length) break;
    T.L[k] += v * gl; T.R[k] += v * gr;
  }
}

/** Bell / pluck: decaying sine with an inharmonic partial. */
function bell(T, { f, t0, amp, decay = 2.4, pan = 0, ratio = 2.76, bright = 0.28 }) {
  const s0 = Math.round(t0 * SR), len = Math.round(decay * 2.5 * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len; i++) {
    const t = i / SR, e = Math.exp(-t / (decay * 0.42)) * Math.min(1, t * 400);
    const v = (Math.sin(TAU * f * t) + bright * Math.sin(TAU * f * ratio * t) * Math.exp(-t * 3)) * e * amp;
    const k = s0 + i; if (k >= T.L.length) break;
    T.L[k] += v * gl; T.R[k] += v * gr;
  }
}

/** Soft low thump (heartbeat / pulse). */
function thump(T, { f = 55, t0, amp = 0.3, decay = 0.35 }) {
  const s0 = Math.round(t0 * SR), len = Math.round(decay * 4 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR, fr = f * (1 + 0.8 * Math.exp(-t * 30));
    const v = Math.sin(TAU * fr * t) * Math.exp(-t / decay) * Math.min(1, t * 300) * amp;
    const k = s0 + i; if (k >= T.L.length) break;
    T.L[k] += v; T.R[k] += v;
  }
}

/** Filtered noise bed ("air", rumble). */
function noise(T, { t0 = 0, dur, amp, cutoff = 600, swell = 0.08 }) {
  const s0 = Math.round(t0 * SR), len = Math.round(dur * SR);
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  let l = 0, r = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, m = amp * (0.7 + 0.3 * Math.sin(TAU * swell * t));
    l += a * ((rnd() * 2 - 1) - l); r += a * ((rnd() * 2 - 1) - r);
    const k = s0 + i; if (k >= T.L.length) break;
    T.L[k] += l * m; T.R[k] += r * m;
  }
}

// ---------------------------------------------------------------- reverb (Freeverb-style)
function reverb(T, { wet = 0.32, room = 0.86, damp = 0.35 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const run = (inp, spread) => {
    const out = new Float32Array(inp.length);
    const cb = combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, f: 0 }));
    const ab = aps.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let n = 0; n < inp.length; n++) {
      const x = inp[n] * 0.015;
      let s = 0;
      for (const c of cb) {
        const y = c.buf[c.i]; c.f = y * (1 - damp) + c.f * damp; c.buf[c.i] = x + c.f * room; c.i = (c.i + 1) % c.buf.length; s += y;
      }
      for (const a of ab) { const y = a.buf[a.i]; a.buf[a.i] = s + y * 0.5; a.i = (a.i + 1) % a.buf.length; s = y - s; }
      out[n] = s;
    }
    return out;
  };
  const rl = run(T.L, 0), rr = run(T.R, 23);
  for (let n = 0; n < T.L.length; n++) { T.L[n] = T.L[n] * (1 - wet * 0.4) + rl[n] * wet; T.R[n] = T.R[n] * (1 - wet * 0.4) + rr[n] * wet; }
}

// ---------------------------------------------------------------- building blocks
/** Chord pads + sub, one chord per `beat` seconds. */
function pads(T, chords, beat, { amp = 0.05, wt = 'warm', sub = 0.12, spread = 0.7, att = 2.2, rel = 3 } = {}) {
  chords.forEach((ch, ci) => {
    const t0 = ci * beat;
    ch.forEach((m, i) => {
      const pan = ((i / Math.max(1, ch.length - 1)) * 2 - 1) * spread;
      for (const d of [-7, 7]) voice(T, { f: mtof(m), t0, dur: beat, amp: amp / Math.sqrt(ch.length), wt, att, rel, pan: pan + d * 0.01, detune: d });
    });
    if (sub) voice(T, { f: mtof(ch[0] - 12), t0, dur: beat, amp: sub, wt: 'sine', att: 1.2, rel: 2.5, vib: 0 });
  });
}

function bells(T, chords, beat, { density = 0.5, amp = 0.06, octave = 24, per = 6, decay = 2.6 } = {}) {
  chords.forEach((ch, ci) => {
    for (let k = 0; k < per; k++) {
      if (rnd() > density) continue;
      const m = ch[(k * 2 + ci) % ch.length] + octave;
      bell(T, { f: mtof(m), t0: ci * beat + 0.4 + (k * beat) / per + rnd() * 0.15, amp, decay, pan: rnd() * 1.4 - 0.7 });
    }
  });
}

function arp(T, chords, beat, { bpm = 90, sub = 2, amp = 0.05, octave = 12, decay = 0.9, start = 0, pattern = [0, 2, 1, 3, 2, 4, 1, 3] } = {}) {
  const step = 60 / bpm / sub;
  for (let t = start; t < chords.length * beat; t += step) {
    const ch = chords[Math.floor(t / beat)], k = Math.round(t / step);
    const m = ch[pattern[k % pattern.length] % ch.length] + octave;
    bell(T, { f: mtof(m), t0: t, amp: amp * (k % sub === 0 ? 1 : 0.7), decay, ratio: 2.0, bright: 0.15, pan: Math.sin(k * 0.9) * 0.5 });
  }
}

// ---------------------------------------------------------------- finishing
/** Wrap everything past the loop point onto the start, normalise, write WAV. */
function finish(T, name, { gain = 0.85, loop = true } = {}) {
  if (loop) for (let i = T.n; i < T.L.length; i++) { T.L[i - T.n] += T.L[i]; T.R[i - T.n] += T.R[i]; }
  let peak = 0;
  for (let i = 0; i < T.n; i++) peak = Math.max(peak, Math.abs(T.L[i]), Math.abs(T.R[i]));
  const g = (gain / Math.max(peak, 1e-6));
  const data = Buffer.alloc(44 + T.n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + T.n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(T.n * 4, 40);
  // gentle soft clip after normalising
  const sc = (x) => Math.tanh(x * 1.1) / Math.tanh(1.1);
  for (let i = 0; i < T.n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(T.L[i] * g))) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(T.R[i] * g))) * 32767), 46 + i * 4);
  }
  const wav = join(TMP, `${name}.wav`), mp3 = join(OUT, `${name}.mp3`);
  writeFileSync(wav, data);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '112k', '-ar', '44100', mp3]);
  console.log(`  ${name}.mp3  ${T.sec}s`);
}

// ---------------------------------------------------------------- the score
const TRACKS = {
  /** Main console: wide, calm, a little melancholic. */
  menu() {
    const T = makeTrack(48), B = 12;
    const ch = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 62, 64], [55, 57, 62, 64, 67]];
    pads(T, ch, B, { amp: 0.06, sub: 0.1 });
    bells(T, ch, B, { density: 0.55, amp: 0.05, per: 8 });
    noise(T, { dur: 48, amp: 0.006, cutoff: 900 });
    reverb(T, { wet: 0.38 });
    return T;
  },
  /** Prologue: uneasy stillness in the crew quarters. */
  l0() {
    const T = makeTrack(40), B = 10;
    const ch = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [38, 50, 53, 57, 62], [40, 47, 52, 57, 59]];
    pads(T, ch, B, { amp: 0.05, wt: 'dark', sub: 0.1 });
    bells(T, ch, B, { density: 0.3, amp: 0.04, per: 5, decay: 3.2 });
    noise(T, { dur: 40, amp: 0.008, cutoff: 500 });
    reverb(T, { wet: 0.4 });
    return T;
  },
  /** Salvage: quiet, careful, low plucks. */
  l1() {
    const T = makeTrack(40), B = 10;
    const ch = [[43, 50, 55, 58, 62], [39, 46, 51, 55, 58], [36, 48, 51, 55, 60], [38, 50, 54, 57, 62]];
    pads(T, ch, B, { amp: 0.045, wt: 'hollow', sub: 0.11 });
    arp(T, ch, B, { bpm: 66, sub: 1, amp: 0.035, octave: 0, decay: 1.4, pattern: [0, 2, 1, 3] });
    noise(T, { dur: 40, amp: 0.006, cutoff: 400 });
    reverb(T, { wet: 0.36 });
    return T;
  },
  /** Blackout: deep, dark, a slow pulse in the dark. */
  l2() {
    const T = makeTrack(40), B = 10;
    const ch = [[40, 47, 52, 55], [36, 43, 48, 52], [45, 52, 57, 60], [47, 54, 59, 63]];
    pads(T, ch, B, { amp: 0.05, wt: 'dark', sub: 0.16, spread: 0.9 });
    for (let t = 0; t < 40; t += 2.5) thump(T, { f: 48, t0: t, amp: 0.16, decay: 0.4 });
    bells(T, ch, B, { density: 0.22, amp: 0.03, octave: 12, per: 4, decay: 3.5 });
    noise(T, { dur: 40, amp: 0.012, cutoff: 220, swell: 0.05 });
    reverb(T, { wet: 0.42, room: 0.88 });
    return T;
  },
  /** Lockdown: urgent ostinato under the plan. */
  l3() {
    const T = makeTrack(40), B = 10;
    const ch = [[38, 50, 53, 57, 62], [34, 46, 50, 53, 58], [41, 48, 53, 57, 60], [36, 48, 52, 55, 60]];
    pads(T, ch, B, { amp: 0.045, wt: 'string', sub: 0.12 });
    arp(T, ch, B, { bpm: 100, sub: 2, amp: 0.05, octave: -12, decay: 0.45, pattern: [0, 0, 1, 0, 0, 2, 0, 1] });
    arp(T, ch, B, { bpm: 100, sub: 1, amp: 0.025, octave: 12, decay: 1.2, start: 0.3, pattern: [2, 3, 4, 3] });
    reverb(T, { wet: 0.3 });
    return T;
  },
  /** New Earth: tense but hopeful — the way out. */
  l4() {
    const T = makeTrack(48), B = 12;
    const ch = [[43, 50, 55, 59, 62], [40, 52, 55, 59, 64], [36, 48, 52, 55, 60, 64], [38, 50, 54, 57, 62]];
    pads(T, ch, B, { amp: 0.05, wt: 'warm', sub: 0.11 });
    arp(T, ch, B, { bpm: 84, sub: 2, amp: 0.035, octave: 12, decay: 0.9 });
    bells(T, ch, B, { density: 0.4, amp: 0.035, per: 6 });
    reverb(T, { wet: 0.36 });
    return T;
  },
  /** Threat layer: tremolo string cluster, sub pulse, metallic air. Mixed in by proximity. */
  terror() {
    const T = makeTrack(16);
    [220, 233.1, 246.9, 329.6, 349.2].forEach((f, i) => voice(T, { f, t0: 0, dur: 16, amp: 0.05, wt: 'string', att: 0.01, rel: 0.01, pan: (i - 2) * 0.35, detune: (i - 2) * 9, trem: 0.85, tremRate: 7.5, vib: 0.004 }));
    for (let t = 0; t < 16; t += 60 / 132) thump(T, { f: 40, t0: t, amp: 0.22, decay: 0.22 });
    noise(T, { dur: 16, amp: 0.03, cutoff: 3000, swell: 0.25 });
    noise(T, { dur: 16, amp: 0.05, cutoff: 90, swell: 0.125 });
    reverb(T, { wet: 0.25, room: 0.7 });
    return T;
  },
  /** The ending: departure, six months, Mars — swelling, hopeful. */
  finale() {
    const T = makeTrack(80), B = 10;
    const ch = [[36, 48, 52, 55, 60, 64], [35, 47, 50, 55, 59, 62], [33, 45, 52, 57, 60, 64], [29, 41, 48, 53, 57, 60],
      [28, 40, 48, 52, 55, 60], [29, 41, 48, 53, 57, 60], [31, 43, 50, 55, 60, 62], [31, 43, 50, 55, 59, 62]];
    pads(T, ch, B, { amp: 0.06, wt: 'warm', sub: 0.12, att: 3 });
    pads(T, ch.map((c) => c.slice(2).map((m) => m + 12)), B, { amp: 0.025, wt: 'string', sub: 0, att: 4 });
    arp(T, ch, B, { bpm: 76, sub: 2, amp: 0.03, octave: 12, decay: 1.1, start: 20 });
    bells(T, ch, B, { density: 0.5, amp: 0.04, per: 6 });
    noise(T, { dur: 80, amp: 0.005, cutoff: 1200 });
    reverb(T, { wet: 0.4, room: 0.9 });
    return T;
  },
};

mkdirSync(TMP, { recursive: true });
const only = process.argv.slice(2);
console.log('Rendering score →', OUT);
for (const [name, fn] of Object.entries(TRACKS)) {
  if (only.length && !only.includes(name)) continue;
  seed = 1 + name.length * 7919;
  finish(fn(), name);
}
rmSync(TMP, { recursive: true, force: true });
