import { createCanvasScene, clamp, damp, lerp, rand, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Guitar: a sunburst single cut electric under stage lights, ready to play.
 * Swipe across the strings to strum (direction and speed set the stroke), tap a string over
 * the body to pick it, tap the neck to fret a single note. Chord pads (or the keyboard) set
 * the fret hand, which shows on the neck as glowing fingertips. Every string is a
 * Karplus-Strong plucked string synthesised on the fly, run through a small amp model with
 * an optional drive pedal, a cabinet filter and a convolution reverb. Strings shimmer and
 * settle with their own decay, and the stage lights swell with every strum.
 * Left alone it strums a quiet progression to itself, silently.
 */

/* ---------- the instrument, in millimetres along the strings ---------- */

const SCALE = 628; // nut to saddle
const FRETS = 22;
const NUT_SPREAD = 44;
const BRIDGE_SPREAD = 64;
const TAIL_X = 672;
const BOARD_END = 462;
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const GAUGE = [1.7, 1.4, 1.15, 0.85, 0.66, 0.52];
const WOUND = [true, true, true, false, false, false];
// sustain (seconds to -60 dB) per string
const T60 = [6, 5.4, 4.8, 4.2, 3.6, 3.2];
// local extents used to fit the guitar into the frame
const LEFT = -200;
const RIGHT = 822;
const HALF = 176;

const fretX = (n: number) => SCALE * (1 - Math.pow(2, -n / 12));
const stringY = (i: number, x: number) => ((i - 2.5) * lerp(NUT_SPREAD, BRIDGE_SPREAD, x / SCALE)) / 5;
const boardHalf = (x: number) => lerp(29, 37, clamp(x / BOARD_END, 0, 1));
const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Where a fingertip sits for a fret: just behind the wire */
const fingerX = (f: number) => lerp(fretX(f - 1), fretX(f), 0.62);

interface Chord {
  frets: number[];
  color: string;
  barre?: number;
}

// G C D Em Am E A F, low E first; -1 is a muted string
const CHORDS: Chord[] = [
  { frets: [3, 2, 0, 0, 0, 3], color: '#ffb347' },
  { frets: [-1, 3, 2, 0, 1, 0], color: '#ff6b6b' },
  { frets: [-1, -1, 0, 2, 3, 2], color: '#ffd93d' },
  { frets: [0, 2, 2, 0, 0, 0], color: '#62c6ff' },
  { frets: [-1, 0, 2, 2, 1, 0], color: '#b49cff' },
  { frets: [0, 2, 2, 1, 0, 0], color: '#5dffb0' },
  { frets: [-1, 0, 2, 2, 2, 0], color: '#ff8ad8' },
  { frets: [1, 3, 3, 2, 1, 1], color: '#7fe0ff', barre: 1 },
];
// power chords rooted on the low E string: E5 F5 G5 A5 B5 C5 D5 and E5 an octave up
const POWER_ROOTS = [0, 1, 3, 5, 7, 8, 10, 12];
const POWER_COLOR = '#ff6a2a';
const CHORD_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
const POWER_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
// idle progression G D Em C, one bar each, strummed D . D U . U D U
const DEMO_CHORDS = [0, 2, 3, 1];
const DEMO_PATTERN = [1, 0, 1, -1, 0, -1, 1, -1];
const EIGHTH = 60 / 92 / 2;

const DRIVE = 8;
const VERB = 9;
const MAX_MOTES = 90;
const BEAMS = 5;

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  stopped: boolean;
}

interface Amp {
  ctx: AudioContext;
  input: GainNode;
  clean: GainNode;
  drive: GainNode;
  wet: GainNode;
}

interface Pluck {
  at: number;
  i: number;
  fret: number;
  amp: number;
  x: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Item {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  cx: number;
  cy: number;
  rot: number;
  sc: number;
  cos: number;
  sin: number;
  lcx: number;
  portrait: boolean;
}

interface State {
  chord: number; // 0..7 open chords, 8..15 power chords
  frets: number[];
  color: string;
  dotX: Float32Array;
  dotA: Float32Array;
  dotF: number[];
  barreA: number;
  // strings
  amp: Float32Array;
  phase: Float32Array;
  vibFret: number[];
  lastPluck: Float64Array;
  tapF: number[];
  tapLife: Float32Array;
  plucks: Pluck[];
  clock: number;
  // pointer
  mode: 0 | 1 | 2;
  plx: number;
  ply: number;
  pt: number;
  px: number;
  py: number;
  over: boolean;
  pickTilt: number;
  // sound
  amp_: Amp | null;
  voices: (Voice | null)[];
  drive: boolean;
  verb: boolean;
  // flow
  touched: boolean;
  idle: number;
  demo: boolean;
  demoT: number;
  demoSlot: number;
  energy: number;
  press: Float32Array;
  motes: Mote[];
  moteNext: number;
  haze: Float32Array;
  // layout
  L: Layout;
  items: Item[];
  bg: HTMLCanvasElement | null;
  guitar: HTMLCanvasElement | null;
  body: Path2D;
  w: number;
  h: number;
}

/* ---------- small geometry helpers ---------- */

/** Closed Catmull-Rom spline through points as a Path2D */
function smooth(pts: number[]): Path2D {
  const p = new Path2D();
  const n = pts.length / 2;
  const X = (i: number) => pts[((i + n) % n) * 2];
  const Y = (i: number) => pts[((i + n) % n) * 2 + 1];
  p.moveTo(X(0), Y(0));
  for (let i = 0; i < n; i++) {
    p.bezierCurveTo(
      X(i) + (X(i + 1) - X(i - 1)) / 6,
      Y(i) + (Y(i + 1) - Y(i - 1)) / 6,
      X(i + 1) - (X(i + 2) - X(i)) / 6,
      Y(i + 1) - (Y(i + 2) - Y(i)) / 6,
      X(i + 1),
      Y(i + 1)
    );
  }
  p.closePath();
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
}

// Les Paul style single cut, bass side up (negative y), treble horn and cutaway below the neck
const BODY_PTS = [
  362, -36, 378, -84, 414, -122, 470, -140, 528, -134, 574, -122, 628, -150, 700, -168, 768, -150, 808,
  -84, 820, 0, 808, 84, 768, 150, 700, 168, 628, 152, 576, 126, 528, 130, 468, 128, 420, 120, 392, 102,
  390, 78, 404, 56, 432, 42, 440, 36,
];
const HEAD_PTS = [
  0, -29, -24, -31, -64, -40, -120, -50, -172, -54, -196, -44, -199, -24, -188, -6, -182, 0, -188, 6, -199,
  24, -196, 44, -172, 54, -120, 50, -64, 40, -24, 31, 0, 29,
];
const GUARD_PTS = [462, 44, 520, 46, 566, 66, 584, 98, 562, 122, 510, 126, 474, 106];

/* ---------- sound ---------- */

/**
 * Karplus-Strong plucked string rendered into a buffer: a burst of filtered noise circulates
 * through a delay line one period long, an averaging filter darkens it a little on every
 * pass and an allpass keeps the pitch exact. Pluck strength sets how bright the burst is.
 */
function stringBuffer(ctx: BaseAudioContext, freq: number, strength: number, sustain: number, dead: boolean) {
  const sr = ctx.sampleRate;
  const dur = dead ? 0.16 : clamp(sustain * 0.6, 1.4, 3.4);
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const L = sr / freq - 0.5; // the averaging filter adds half a sample
  let N = Math.floor(L);
  let frac = L - N;
  if (frac < 0.1) {
    N -= 1;
    frac += 1;
  }
  const C = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  // excitation: noise softened by a one-pole lowpass, then notched where the pick strikes
  const bright = dead ? 0.12 : 0.18 + strength * 0.72;
  let lp = 0;
  for (let n = 0; n < N; n++) {
    lp += bright * (Math.random() * 2 - 1 - lp);
    line[n] = lp;
  }
  const pick = Math.max(1, Math.round(N * 0.13));
  for (let n = N - 1; n >= pick; n--) line[n] -= line[n - pick] * 0.85;
  let mean = 0;
  let peak = 0;
  for (let n = 0; n < N; n++) mean += line[n];
  mean /= N;
  for (let n = 0; n < N; n++) {
    line[n] -= mean;
    peak = Math.max(peak, Math.abs(line[n]));
  }
  const norm = 1 / (peak || 1);
  for (let n = 0; n < N; n++) line[n] *= norm;
  const rho = Math.pow(0.001, 1 / ((dead ? 0.05 : sustain) * freq));
  let idx = 0;
  let last = 0;
  let apx = 0;
  let apy = 0;
  for (let n = 0; n < len; n++) {
    const cur = line[idx];
    out[n] = cur;
    const avg = 0.5 * (cur + last);
    last = cur;
    const ap = C * avg + apx - C * apy;
    apx = avg;
    apy = ap;
    line[idx] = ap * rho;
    if (++idx === N) idx = 0;
  }
  // ease out the last stretch so a long tail never clicks off
  const fade = Math.min(len, Math.floor(sr * (dead ? 0.03 : 0.35)));
  for (let n = 0; n < fade; n++) out[len - 1 - n] *= n / fade;
  return buf;
}

function driveCurve() {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // asymmetric soft clip, like a tube stage pushed hard
    c[i] = Math.tanh(x * 2.4 + 0.12) - Math.tanh(0.12);
  }
  return c;
}

function impulse(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const q = i / len;
      // a short gap before the room answers, then a darkening exponential tail
      const env = i < sr * 0.012 ? 0 : Math.pow(1 - q, 2.2) * Math.exp(-q * 3);
      lp += (0.55 - q * 0.35) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * env;
    }
  }
  return buf;
}

/** Amp: clean and drive channels, a cabinet filter, a gentle compressor and a spring-ish reverb */
function ensureAmp(s: State, env: SceneEnv): Amp | null {
  const bus = env.audio();
  if (!bus) return null;
  if (s.amp_ && s.amp_.ctx === bus.ctx) return s.amp_;
  const ctx = bus.ctx;
  const input = ctx.createGain();
  const clean = ctx.createGain();
  clean.gain.value = s.drive ? 0 : 1;
  const pre = ctx.createGain();
  pre.gain.value = 9;
  const tight = ctx.createBiquadFilter();
  tight.type = 'highpass';
  tight.frequency.value = 150;
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve();
  shaper.oversample = '4x';
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 850;
  mid.Q.value = 0.9;
  mid.gain.value = 5;
  const fizz = ctx.createBiquadFilter();
  fizz.type = 'lowpass';
  fizz.frequency.value = 3600;
  fizz.Q.value = 0.6;
  const drive = ctx.createGain();
  drive.gain.value = s.drive ? 0.3 : 0;
  input.connect(clean);
  input.connect(pre);
  pre.connect(tight);
  tight.connect(shaper);
  shaper.connect(mid);
  mid.connect(fizz);
  fizz.connect(drive);
  const cabLo = ctx.createBiquadFilter();
  cabLo.type = 'highpass';
  cabLo.frequency.value = 75;
  const cabHi = ctx.createBiquadFilter();
  cabHi.type = 'lowpass';
  cabHi.frequency.value = 6200;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  clean.connect(cabLo);
  drive.connect(cabLo);
  cabLo.connect(cabHi);
  cabHi.connect(comp);
  const dry = ctx.createGain();
  dry.gain.value = 0.95;
  comp.connect(dry);
  dry.connect(bus.out);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = s.verb ? 0.42 : 0;
  comp.connect(verb);
  verb.connect(wet);
  wet.connect(bus.out);
  s.amp_ = { ctx, input, clean, drive, wet };
  return s.amp_;
}

function choke(s: State, i: number, at: number, tau: number) {
  const v = s.voices[i];
  if (!v || v.stopped) return;
  v.stopped = true;
  v.g.gain.cancelScheduledValues(at);
  v.g.gain.setTargetAtTime(0, at, tau);
  try {
    v.src.stop(at + tau * 8);
  } catch {
    /* already stopped */
  }
  s.voices[i] = null;
}

function sound(s: State, env: SceneEnv, i: number, fret: number, strength: number, delay: number) {
  const a = ensureAmp(s, env);
  if (!a) return;
  const ctx = a.ctx;
  const dead = fret < 0;
  const freq = midiFreq(OPEN_MIDI[i] + Math.max(0, fret));
  const buf = stringBuffer(ctx, freq, strength, T60[i], dead);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  // low strings sit a touch quieter so chords stay balanced
  g.gain.value = (dead ? 0.12 : 0.2 + strength * 0.22) * (0.82 + i * 0.04);
  src.connect(g);
  g.connect(a.input);
  const t0 = ctx.currentTime + delay;
  choke(s, i, t0, 0.012);
  src.start(t0);
  const v: Voice = { src, g, stopped: false };
  if (!dead) s.voices[i] = v;
  src.onended = () => {
    src.disconnect();
    g.disconnect();
    if (s.voices[i] === v) s.voices[i] = null;
  };
}

function setMix(s: State) {
  const a = s.amp_;
  if (!a) return;
  const t = a.ctx.currentTime;
  a.clean.gain.setTargetAtTime(s.drive ? 0 : 1, t, 0.03);
  a.drive.gain.setTargetAtTime(s.drive ? 0.3 : 0, t, 0.03);
  a.wet.gain.setTargetAtTime(s.verb ? 0.42 : 0, t, 0.08);
}

/* ---------- playing ---------- */

function chordFrets(c: number): number[] {
  if (c < 8) return CHORDS[c].frets;
  const r = POWER_ROOTS[c - 8];
  return [r, r + 2, r + 2, -1, -1, -1];
}

function setChord(s: State, env: SceneEnv | null, c: number) {
  const next = chordFrets(c);
  const at = s.amp_ ? s.amp_.ctx.currentTime : 0;
  for (let i = 0; i < 6; i++) {
    if (next[i] !== s.frets[i]) {
      // lifting or moving a finger stops that string ringing
      if (env) choke(s, i, at, 0.03);
      s.amp[i] *= 0.35;
    }
  }
  s.chord = c;
  s.frets = next.slice();
  s.color = c < 8 ? CHORDS[c].color : POWER_COLOR;
}

function pluck(s: State, env: SceneEnv | null, i: number, fret: number, strength: number, delay: number, x: number) {
  s.plucks.push({ at: s.clock + delay, i, fret, amp: strength, x });
  s.lastPluck[i] = s.clock + delay;
  if (env) sound(s, env, i, fret, strength, delay);
}

/** dir 1 strums low to high (down), -1 high to low (up) */
function strum(s: State, env: SceneEnv | null, dir: number, strength: number, gap = 0.014) {
  let k = 0;
  for (let n = 0; n < 6; n++) {
    const i = dir > 0 ? n : 5 - n;
    const f = s.frets[i];
    if (f < 0) continue;
    pluck(s, env, i, f, strength * (1 - k * 0.04), k * gap, 560);
    k++;
  }
}

function interact(s: State) {
  s.touched = true;
  s.idle = 0;
  if (s.demo) {
    s.demo = false;
    for (let i = 0; i < s.press.length; i++) s.press[i] = 0;
  }
}

function toLocal(s: State, x: number, y: number) {
  const L = s.L;
  const dx = x - L.cx;
  const dy = y - L.cy;
  tmp[0] = (dx * L.cos + dy * L.sin) / L.sc + L.lcx;
  tmp[1] = (-dx * L.sin + dy * L.cos) / L.sc;
}
const tmp = new Float32Array(2);

/** Inside the band the strings cover, from just behind the nut to the bridge */
function onStrings(lx: number, ly: number) {
  if (lx < -4 || lx > SCALE + 8) return false;
  const half = lerp(NUT_SPREAD, BRIDGE_SPREAD, lx / SCALE) / 2;
  return Math.abs(ly) < half + 14;
}

function nearestString(lx: number, ly: number) {
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(ly - stringY(i, clamp(lx, 0, SCALE)));
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function fretAt(lx: number) {
  for (let f = 1; f <= FRETS; f++) if (lx < fretX(f)) return f;
  return FRETS;
}

function itemAt(s: State, x: number, y: number) {
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return i;
  }
  return -1;
}

function pressItem(s: State, env: SceneEnv, i: number) {
  s.press[i] = 1;
  if (i < 8) {
    setChord(s, env, i);
    strum(s, env, 1, 0.72);
  } else if (i === DRIVE) {
    s.drive = !s.drive;
    setMix(s);
    blip(env, s.drive ? 660 : 440);
  } else if (i === VERB) {
    s.verb = !s.verb;
    setMix(s);
    blip(env, s.verb ? 660 : 440);
  }
}

/** The stompbox footswitch click */
function blip(env: SceneEnv, f: number) {
  const bus = env.audio();
  if (!bus) return;
  const { ctx, out } = bus;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = f;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.06);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/* ---------- layout and cached art ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  const portrait = w / h < 1.05;
  const cols = portrait ? 5 : 10;
  const rows = portrait ? 2 : 1;
  const gap = clamp(Math.min(w, h) * 0.014, 5, 10);
  const side = clamp(w * 0.03, 12, 40);
  // in a single row the two pedals sit a little apart from the chord pads
  const split = portrait ? 0 : gap * 2;
  const maxW = (w - side * 2 - gap * (cols - 1) - split) / cols;
  const ph = clamp(Math.min(maxW * 0.95, h * (portrait ? 0.1 : 0.15)), 34, 86);
  const pw = Math.min(maxW, ph * 1.05);
  const totalW = pw * cols + gap * (cols - 1) + split;
  const x0 = (w - totalW) / 2;
  const bottom = h - clamp(h * 0.03, 8, 20);
  const y0 = bottom - ph * rows - gap * (rows - 1);
  s.items = [];
  for (let i = 0; i < 10; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    s.items.push({ x: x0 + c * (pw + gap) + (i >= 8 ? split : 0), y: y0 + r * (ph + gap), w: pw, h: ph });
  }

  const top = 8;
  const areaH = y0 - gap * 1.5 - top;
  const areaW = w - side;
  const L = s.L;
  L.portrait = portrait;
  L.lcx = (LEFT + RIGHT) / 2;
  if (portrait) {
    L.rot = Math.PI / 2 - 0.02;
    L.sc = Math.min((areaH * 0.97) / (RIGHT - LEFT), (areaW * 0.97) / (HALF * 2));
  } else {
    L.rot = -0.045;
    L.sc = Math.min((areaW * 0.97) / (RIGHT - LEFT), (areaH * 0.93) / (HALF * 2));
  }
  L.cx = w / 2;
  L.cy = top + areaH / 2;
  L.cos = Math.cos(L.rot);
  L.sin = Math.sin(L.rot);
}

function applyGuitar(ctx: CanvasRenderingContext2D, L: Layout) {
  ctx.translate(L.cx, L.cy);
  ctx.rotate(L.rot);
  ctx.scale(L.sc, L.sc);
  ctx.translate(-L.lcx, 0);
}

const CAN_X = [0.1, 0.3, 0.5, 0.7, 0.9];
const BEAM_COLORS = ['255,170,80', '255,80,170', '120,200,255', '255,80,170', '255,170,80'];

function buildBackground(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#05040a');
  sky.addColorStop(0.55, '#110a1d');
  sky.addColorStop(1, '#1b0d16');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // a velvet backdrop with soft folds
  const r = seeded(11);
  for (let x = 0; x < w; x += 18 + r() * 26) {
    const fw = 10 + r() * 30;
    const fold = g.createLinearGradient(x, 0, x + fw, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(0.5, `rgba(120,60,140,${(0.03 + r() * 0.04).toFixed(3)})`);
    fold.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fold;
    g.fillRect(x, 0, fw, h * 0.86);
  }
  // stage floor with a sheen
  const fy = h * 0.82;
  const floor = g.createLinearGradient(0, fy, 0, h);
  floor.addColorStop(0, '#1d1218');
  floor.addColorStop(1, '#07050a');
  g.fillStyle = floor;
  g.fillRect(0, fy, w, h - fy);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = -12; i <= 12; i++) {
    g.moveTo(w / 2 + i * w * 0.02, fy);
    g.lineTo(w / 2 + i * w * 0.16, h);
  }
  g.stroke();
  // amp stacks at both wings
  const u = Math.min(w / 900, h / 520);
  for (const side of [-1, 1]) {
    const cw = 150 * u;
    const ch = 170 * u;
    const x = side < 0 ? 6 * u : w - cw - 6 * u;
    const y = fy - ch + 26 * u;
    g.fillStyle = '#0c0a0d';
    roundRect(g, x, y, cw, ch, 6 * u);
    g.fill();
    g.fillStyle = '#18141a';
    g.fillRect(x + 8 * u, y + 34 * u, cw - 16 * u, ch - 44 * u);
    // grille weave
    g.strokeStyle = 'rgba(200,170,120,0.06)';
    g.beginPath();
    for (let k = -ch; k < cw; k += 5 * u) {
      g.moveTo(x + 8 * u + k, y + 34 * u);
      g.lineTo(x + 8 * u + k + (ch - 44 * u), y + ch - 10 * u);
    }
    g.stroke();
    // the head on top with its control strip and a jewel light
    g.fillStyle = '#0f0c0f';
    roundRect(g, x, y - 46 * u, cw, 44 * u, 5 * u);
    g.fill();
    g.fillStyle = '#c9a65a';
    g.fillRect(x + 10 * u, y - 24 * u, cw - 20 * u, 3 * u);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.arc(x + 22 * u + k * 19 * u, y - 13 * u, 4.5 * u, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x, fy + 24 * u, cw, 6 * u);
  }
  // lighting truss
  const ty = Math.max(14, h * 0.05);
  g.strokeStyle = '#2a2530';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, ty);
  g.lineTo(w, ty);
  g.moveTo(0, ty + 10);
  g.lineTo(w, ty + 10);
  for (let x = 0; x < w; x += 14) {
    g.moveTo(x, ty);
    g.lineTo(x + 7, ty + 10);
    g.lineTo(x + 14, ty);
  }
  g.stroke();
  return c;
}

function buildGuitar(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(dpr, dpr);
  applyGuitar(g, s.L);
  const body = s.body;
  const head = smooth(HEAD_PTS);
  const board = new Path2D();
  board.moveTo(-2, -boardHalf(0));
  board.lineTo(BOARD_END, -boardHalf(BOARD_END));
  board.lineTo(BOARD_END, boardHalf(BOARD_END));
  board.lineTo(-2, boardHalf(0));
  board.closePath();

  // one soft shadow for the whole instrument on the backdrop
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 40 * s.L.sc;
  g.shadowOffsetX = 10 * s.L.sc;
  g.shadowOffsetY = 22 * s.L.sc;
  g.fillStyle = '#000';
  g.fill(body);
  g.fill(head);
  g.fill(board);
  g.restore();

  // the side of the body, seen past the top's edge
  g.save();
  g.translate(3, 7);
  g.fillStyle = '#2a0e05';
  g.fill(body);
  g.restore();

  // sunburst top
  const burst = g.createRadialGradient(626, 8, 16, 618, 0, 236);
  burst.addColorStop(0, '#ffd774');
  burst.addColorStop(0.32, '#f2a93c');
  burst.addColorStop(0.58, '#c0501b');
  burst.addColorStop(0.8, '#5c170a');
  burst.addColorStop(1, '#240604');
  g.fillStyle = burst;
  g.fill(body);
  // book matched flame in the maple
  g.save();
  g.clip(body);
  g.lineCap = 'round';
  const r = seeded(5);
  for (let k = -16; k <= 16; k++) {
    const x0 = 610 + k * 15 + r() * 6;
    g.strokeStyle = k % 2 ? 'rgba(255,232,170,0.07)' : 'rgba(70,20,0,0.09)';
    g.lineWidth = 5 + r() * 5;
    g.beginPath();
    for (let y = -176; y <= 176; y += 8) {
      const x = x0 - Math.abs(y) * 0.32 + Math.sin(y * 0.07 + k * 1.3) * 3.5;
      if (y === -176) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // carved top: light rolls off toward the edges
  const carve = g.createRadialGradient(610, -30, 60, 620, 0, 220);
  carve.addColorStop(0, 'rgba(255,255,255,0.08)');
  carve.addColorStop(0.7, 'rgba(0,0,0,0)');
  carve.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = carve;
  g.fill(body);
  g.restore();
  // cream binding
  g.strokeStyle = '#eadcb8';
  g.lineWidth = 4.5;
  g.stroke(body);
  g.strokeStyle = 'rgba(40,10,0,0.55)';
  g.lineWidth = 1;
  g.stroke(body);

  // raised pickguard
  const guard = smooth(GUARD_PTS);
  g.save();
  g.translate(2, 4);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fill(guard);
  g.restore();
  g.fillStyle = '#efe3c3';
  g.fill(guard);
  g.strokeStyle = 'rgba(60,40,10,0.4)';
  g.lineWidth = 1;
  g.stroke(guard);

  // humbuckers: cream rings, chrome covers, one row of pole screws
  for (const px of [498, 594]) {
    g.fillStyle = '#e9ddbd';
    g.beginPath();
    roundRect(g, px - 27, -48, 54, 96, 7);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.stroke();
    const chrome = g.createLinearGradient(px - 21, 0, px + 21, 0);
    chrome.addColorStop(0, '#7d848b');
    chrome.addColorStop(0.3, '#f1f4f6');
    chrome.addColorStop(0.55, '#9aa1a8');
    chrome.addColorStop(0.8, '#e6e9ec');
    chrome.addColorStop(1, '#6f767c');
    g.fillStyle = chrome;
    g.beginPath();
    roundRect(g, px - 21, -41, 42, 82, 4);
    g.fill();
    for (let i = 0; i < 6; i++) {
      const y = stringY(i, px);
      g.fillStyle = '#5b6167';
      g.beginPath();
      g.arc(px - 8, y, 2.6, 0, TAU);
      g.fill();
      g.fillStyle = '#dfe3e6';
      g.beginPath();
      g.arc(px - 8.4, y - 0.5, 1.6, 0, TAU);
      g.fill();
    }
  }
  // tune-o-matic bridge and stopbar tailpiece
  const metal = (x0: number, x1: number) => {
    const m = g.createLinearGradient(x0, 0, x1, 0);
    m.addColorStop(0, '#80878e');
    m.addColorStop(0.45, '#f4f6f8');
    m.addColorStop(1, '#6d747a');
    return m;
  };
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  roundRect(g, 624, -42, 16, 88, 4);
  g.fill();
  g.fillStyle = metal(621, 635);
  g.beginPath();
  roundRect(g, 621, -44, 14, 88, 4);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const y = stringY(i, SCALE);
    g.fillStyle = '#c9ced3';
    g.fillRect(625 + (i % 2) * 1.5, y - 2.4, 7, 4.8);
  }
  for (const y of [-47, 47]) {
    g.fillStyle = metal(621, 635);
    g.beginPath();
    g.arc(628, y, 5, 0, TAU);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  roundRect(g, 666, -46, 22, 98, 10);
  g.fill();
  g.fillStyle = metal(662, 684);
  g.beginPath();
  roundRect(g, 662, -49, 20, 98, 10);
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#3b4045';
    g.beginPath();
    g.arc(668, stringY(i, SCALE) * 1.04, 1.3, 0, TAU);
    g.fill();
  }

  // gold top hat knobs and the pickup selector
  for (const [kx, ky] of [
    [690, 82],
    [748, 96],
    [700, 128],
    [756, 140],
  ]) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.arc(kx + 2, ky + 3, 13, 0, TAU);
    g.fill();
    g.fillStyle = '#1b130a';
    g.beginPath();
    g.arc(kx, ky, 13, 0, TAU);
    g.fill();
    const gold = g.createRadialGradient(kx - 4, ky - 4, 1, kx, ky, 11);
    gold.addColorStop(0, '#fff3c0');
    gold.addColorStop(0.45, '#e2b04a');
    gold.addColorStop(1, '#7a5512');
    g.fillStyle = gold;
    g.beginPath();
    g.arc(kx, ky, 9.6, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(60,35,0,0.8)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(kx, ky);
    g.lineTo(kx + 6, ky - 5);
    g.stroke();
  }
  g.fillStyle = '#e9dfc4';
  g.beginPath();
  g.arc(430, -112, 10, 0, TAU);
  g.fill();
  g.fillStyle = '#3a2a1a';
  g.beginPath();
  g.arc(430, -112, 4.5, 0, TAU);
  g.fill();
  g.strokeStyle = '#f2ead6';
  g.lineWidth = 3.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(430, -112);
  g.lineTo(425, -122);
  g.stroke();

  // gloss on the lacquer
  g.save();
  g.clip(body);
  const gl = g.createRadialGradient(560, -96, 4, 560, -96, 120);
  gl.addColorStop(0, 'rgba(255,255,255,0.22)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath();
  g.ellipse(560, -96, 120, 34, -0.18, 0, TAU);
  g.fill();
  g.restore();

  // rosewood fretboard with cream binding
  const wood = g.createLinearGradient(0, -36, 0, 36);
  wood.addColorStop(0, '#24150c');
  wood.addColorStop(0.5, '#3d2516');
  wood.addColorStop(1, '#1f1209');
  g.fillStyle = wood;
  g.fill(board);
  g.save();
  g.clip(board);
  const gr = seeded(23);
  for (let k = 0; k < 40; k++) {
    const y = -36 + gr() * 72;
    g.strokeStyle = gr() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(120,70,40,0.12)';
    g.lineWidth = 0.4 + gr() * 0.9;
    g.beginPath();
    g.moveTo(-2, y);
    g.bezierCurveTo(150, y + gr() * 4 - 2, 300, y + gr() * 4 - 2, BOARD_END, y + (y / 29) * 8);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#e8dab4';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(-2, -boardHalf(0));
  g.lineTo(BOARD_END, -boardHalf(BOARD_END));
  g.moveTo(-2, boardHalf(0));
  g.lineTo(BOARD_END, boardHalf(BOARD_END));
  g.stroke();
  // trapezoid inlays
  for (const n of [1, 3, 5, 7, 9, 12, 15, 17, 19, 21]) {
    const a = fretX(n - 1);
    const b = fretX(n);
    const cx = (a + b) / 2;
    const half = (b - a) * 0.24;
    const hw = boardHalf(cx) * 0.72;
    const pearl = g.createLinearGradient(cx - half, -hw, cx + half, hw);
    pearl.addColorStop(0, '#f3efe4');
    pearl.addColorStop(0.5, '#cfc6b0');
    pearl.addColorStop(1, '#f6f1e2');
    g.fillStyle = pearl;
    g.beginPath();
    g.moveTo(cx - half * 0.8, -hw);
    g.lineTo(cx + half, -hw * 0.86);
    g.lineTo(cx + half, hw * 0.86);
    g.lineTo(cx - half * 0.8, hw);
    g.closePath();
    g.fill();
  }
  // fret wires
  for (let n = 1; n <= FRETS; n++) {
    const x = fretX(n);
    const hw = boardHalf(x) - 0.6;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x + 1, -hw);
    g.lineTo(x + 1, hw);
    g.stroke();
    g.strokeStyle = '#c3c8cc';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, -hw);
    g.lineTo(x, hw);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(x - 0.4, -hw);
    g.lineTo(x - 0.4, hw);
    g.stroke();
  }

  // black headstock, truss rod cover, tuners
  const hg = g.createLinearGradient(-200, -50, -20, 50);
  hg.addColorStop(0, '#16120f');
  hg.addColorStop(0.5, '#0b0908');
  hg.addColorStop(1, '#1a1512');
  g.fillStyle = hg;
  g.fill(head);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  g.stroke(head);
  g.fillStyle = '#050404';
  g.beginPath();
  g.moveTo(-8, -9);
  g.lineTo(-40, -13);
  g.quadraticCurveTo(-54, 0, -40, 13);
  g.lineTo(-8, 9);
  g.closePath();
  g.fill();
  g.strokeStyle = '#e8dcc0';
  g.lineWidth = 1.1;
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const { px, py, edge } = postOf(i);
    const sgn = Math.sign(py);
    // keystone button out past the edge
    g.fillStyle = '#9aa0a5';
    g.fillRect(px - 2, py + sgn * 6, 4, (edge - Math.abs(py)) * sgn + sgn * 4);
    g.fillStyle = '#f1e9d2';
    g.beginPath();
    g.ellipse(px, sgn * (edge + 14), 7.5, 10.5, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.stroke();
    // bushing and post
    g.fillStyle = metal(px - 6, px + 6);
    g.beginPath();
    g.arc(px, py, 6, 0, TAU);
    g.fill();
    g.fillStyle = '#5a6066';
    g.beginPath();
    g.arc(px, py, 3.4, 0, TAU);
    g.fill();
  }
  // bone nut
  g.fillStyle = '#efe6cd';
  g.fillRect(-6, -boardHalf(0), 5, boardHalf(0) * 2);
  return c;
}

/** Tuner post for a string: bass side up for E A D, nearest the nut first */
function postOf(i: number) {
  const bass = i < 3;
  const order = bass ? i : 5 - i;
  const px = -64 - order * 42;
  const edge = lerp(41, 52, order / 2);
  return { px, py: bass ? -33 : 33, edge };
}

/* ---------- the scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    touchAction: 'none',
    posterTime: 2.2,
    init: () => {
      const s: State = {
        chord: 0,
        frets: CHORDS[0].frets.slice(),
        color: CHORDS[0].color,
        dotX: new Float32Array(6),
        dotA: new Float32Array(6),
        dotF: CHORDS[0].frets.slice(),
        barreA: 0,
        amp: new Float32Array(6),
        phase: new Float32Array(6).map(() => rand(0, TAU)),
        vibFret: [0, 0, 0, 0, 0, 0],
        lastPluck: new Float64Array(6).fill(-1),
        tapF: [0, 0, 0, 0, 0, 0],
        tapLife: new Float32Array(6),
        plucks: [],
        clock: 0,
        mode: 0,
        plx: 0,
        ply: 0,
        pt: 0,
        px: -100,
        py: -100,
        over: false,
        pickTilt: 0,
        amp_: null,
        voices: [null, null, null, null, null, null],
        drive: false,
        verb: true,
        touched: false,
        idle: 0,
        demo: true,
        demoT: 0,
        demoSlot: -1,
        energy: 0,
        press: new Float32Array(10),
        motes: Array.from({ length: MAX_MOTES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff' })),
        moteNext: 0,
        haze: new Float32Array(70 * 3).map(() => Math.random()),
        L: { cx: 0, cy: 0, rot: 0, sc: 1, cos: 1, sin: 0, lcx: 0, portrait: false },
        items: [],
        bg: null,
        guitar: null,
        body: smooth(BODY_PTS),
        w: 0,
        h: 0,
      };
      for (let i = 0; i < 6; i++) {
        const f = s.frets[i];
        s.dotX[i] = f > 0 ? fingerX(f) : -14;
        s.dotA[i] = f > 0 ? 1 : 0;
      }
      return s;
    },
    resize: (s, env) => {
      s.w = env.w;
      s.h = env.h;
      layout(s, env);
      if (s.bg) s.bg.width = 0;
      if (s.guitar) s.guitar.width = 0;
      s.bg = buildBackground(s, env);
      s.guitar = buildGuitar(s, env);
    },
    update: (s, env, dt) => {
      s.clock += dt;
      // the idle strummer: a bar per chord, silent
      if (s.demo) {
        s.demoT += dt;
        const slot = Math.floor(s.demoT / EIGHTH);
        if (slot !== s.demoSlot) {
          s.demoSlot = slot;
          const bar = Math.floor(slot / 8) % DEMO_CHORDS.length;
          const step = slot % 8;
          if (step === 0) {
            setChord(s, null, DEMO_CHORDS[bar]);
            s.press[DEMO_CHORDS[bar]] = 1;
          }
          const dir = DEMO_PATTERN[step];
          if (dir) strum(s, null, dir, dir > 0 ? 0.62 : 0.45, 0.012);
        }
      } else {
        s.idle += dt;
        if (s.idle > 14 && s.mode === 0) {
          s.demo = true;
          s.demoT = 0;
          s.demoSlot = -1;
        }
      }

      // land scheduled plucks on the strings
      for (let n = s.plucks.length - 1; n >= 0; n--) {
        const p = s.plucks[n];
        if (p.at > s.clock) continue;
        s.plucks.splice(n, 1);
        const i = p.i;
        s.vibFret[i] = Math.max(0, p.fret);
        s.amp[i] = p.fret < 0 ? Math.max(s.amp[i], 0.5) : Math.max(s.amp[i] * 0.4, p.amp * (2.6 + (5 - i) * 0.06 + (i < 3 ? 0.8 : 0)));
        s.energy = Math.min(1.6, s.energy + p.amp * 0.12);
        if (p.amp > 0.55 && !env.reducedMotion) {
          const m = s.motes[s.moteNext];
          s.moteNext = (s.moteNext + 1) % MAX_MOTES;
          m.x = p.x + rand(-10, 10);
          m.y = stringY(i, p.x);
          m.vx = rand(-30, 30);
          m.vy = rand(-50, 50);
          m.max = rand(0.5, 1.1);
          m.life = m.max;
          m.color = s.color;
        }
      }
      const sustain = s.drive ? 0.55 : 1;
      for (let i = 0; i < 6; i++) {
        s.amp[i] *= Math.exp(-dt * (0.9 + i * 0.22) * sustain);
        if (s.amp[i] < 0.01) s.amp[i] = 0;
        s.phase[i] += dt * TAU * (12 + i * 2.6);
        s.tapLife[i] = Math.max(0, s.tapLife[i] - dt * 1.6);
        // fingertips glide between shapes
        const f = s.frets[i];
        const tx = f > 0 ? fingerX(f) : s.dotX[i];
        s.dotX[i] = damp(s.dotX[i], tx, 22, dt);
        s.dotA[i] = damp(s.dotA[i], f > 0 ? 1 : 0, 16, dt);
      }
      const barre = s.chord < 8 ? CHORDS[s.chord].barre ?? 0 : 0;
      s.barreA = damp(s.barreA, barre ? 1 : 0, 14, dt);
      for (let i = 0; i < s.press.length; i++) s.press[i] = Math.max(0, s.press[i] - dt * 3);
      s.energy = Math.max(0, s.energy - dt * 0.9);
      s.pickTilt = damp(s.pickTilt, 0, 6, dt);
      for (const m of s.motes) {
        if (m.life <= 0) continue;
        m.life -= dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= 0.97;
        m.vy *= 0.97;
      }
      const hz = s.haze;
      for (let i = 0; i < hz.length; i += 3) {
        hz[i] += dt * (0.004 + hz[i + 2] * 0.01);
        if (hz[i] > 1) hz[i] -= 1;
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const L = s.L;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      else {
        ctx.fillStyle = '#05040a';
        ctx.fillRect(0, 0, w, h);
      }

      // stage beams that swell with the playing
      const e = clamp(s.energy, 0, 1.4);
      const ty = Math.max(14, h * 0.05) + 12;
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < BEAMS; b++) {
        const x0 = w * CAN_X[b];
        const sway = Math.sin(t * 0.32 + b * 1.7) * w * 0.1;
        const x1 = x0 + sway + (b - 2) * w * 0.04;
        const y1 = h * 0.86;
        const spread = w * (0.07 + e * 0.015);
        const a = 0.07 + e * 0.1 + (b === 2 ? 0.03 : 0);
        const col = BEAM_COLORS[b];
        const grad = ctx.createLinearGradient(x0, ty, x1, y1);
        grad.addColorStop(0, `rgba(${col},${(a * 1.6).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0 - 5, ty);
        ctx.lineTo(x0 + 5, ty);
        ctx.lineTo(x1 + spread, y1);
        ctx.lineTo(x1 - spread, y1);
        ctx.closePath();
        ctx.fill();
        // pool of light on the floor
        const pool = ctx.createRadialGradient(x1, y1, 0, x1, y1, spread * 1.6);
        pool.addColorStop(0, `rgba(${col},${(a * 0.9).toFixed(3)})`);
        pool.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = pool;
        ctx.fillRect(x1 - spread * 1.6, y1 - spread * 0.5, spread * 3.2, spread);
        // the lamp itself
        const lamp = ctx.createRadialGradient(x0, ty, 0, x0, ty, 16);
        lamp.addColorStop(0, `rgba(255,255,255,${(0.6 + e * 0.3).toFixed(3)})`);
        lamp.addColorStop(0.3, `rgba(${col},0.5)`);
        lamp.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = lamp;
        ctx.fillRect(x0 - 16, ty - 16, 32, 32);
      }
      // haze drifting through the light
      const hz = s.haze;
      for (let i = 0; i < hz.length; i += 3) {
        const x = (hz[i] * (w + 40)) - 20;
        const y = h * 0.12 + hz[i + 1] * h * 0.72 + Math.sin(t * 0.4 + i) * 6;
        ctx.globalAlpha = (0.04 + hz[i + 2] * 0.08) * (0.7 + e * 0.5);
        ctx.fillStyle = '#ffd9f0';
        const r = 1 + hz[i + 2] * 1.6;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // cans on the truss
      for (let b = 0; b < BEAMS; b++) {
        const x0 = w * CAN_X[b];
        ctx.fillStyle = '#16131a';
        ctx.beginPath();
        roundRect(ctx, x0 - 9, ty - 16, 18, 15, 3);
        ctx.fill();
      }

      if (s.guitar) ctx.drawImage(s.guitar, 0, 0, w, h);

      ctx.save();
      applyGuitar(ctx, L);
      // stage light sliding across the lacquer
      ctx.save();
      ctx.clip(s.body);
      ctx.globalCompositeOperation = 'lighter';
      const sx = 600 + Math.sin(t * 0.32 + 1.2) * 170;
      const shine = ctx.createRadialGradient(sx, -40, 0, sx, -40, 140);
      shine.addColorStop(0, `rgba(255,200,170,${(0.05 + e * 0.07).toFixed(3)})`);
      shine.addColorStop(1, 'rgba(255,200,170,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(sx - 140, -180, 280, 360);
      ctx.restore();

      drawFingers(ctx, s);
      drawStrings(ctx, s);

      // motes knocked off the strings by a hard strum
      ctx.globalCompositeOperation = 'lighter';
      for (const m of s.motes) {
        if (m.life <= 0) continue;
        const q = m.life / m.max;
        ctx.globalAlpha = q * 0.8;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.2 + q * 1.4, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      drawItems(ctx, s);
      drawPick(ctx, s, env);

      // vignette
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x, y) => {
      s.px = x;
      s.py = y;
      const it = itemAt(s, x, y);
      if (it >= 0) {
        interact(s);
        s.mode = 2;
        pressItem(s, env, it);
        env.wake(2400);
        return;
      }
      toLocal(s, x, y);
      const lx = tmp[0];
      const ly = tmp[1];
      s.plx = lx;
      s.ply = ly;
      s.pt = performance.now();
      // a swipe can start anywhere off the pads; only a press on the strings picks
      interact(s);
      s.mode = 1;
      env.wake(2400);
      if (!onStrings(lx, ly)) return;
      s.over = true;
      const i = nearestString(lx, ly);
      if (Math.abs(ly - stringY(i, lx)) > 9) return;
      if (lx > 0 && lx < BOARD_END - 4) {
        // over the neck: fret that note under the fingertip
        const f = fretAt(lx);
        s.tapF[i] = f;
        s.tapLife[i] = 1;
        pluck(s, env, i, f, 0.7, 0, lx);
      } else {
        const f = s.frets[i];
        pluck(s, env, i, f < 0 ? -1 : f, 0.7, 0, lx);
      }
      env.wake(2400);
    },
    onPointerMove: (s, env, x, y) => {
      s.px = x;
      s.py = y;
      toLocal(s, x, y);
      const lx = tmp[0];
      const ly = tmp[1];
      const overItem = itemAt(s, x, y) >= 0;
      s.over = !overItem && onStrings(lx, ly);
      env.canvas.style.cursor = overItem ? 'pointer' : s.over ? 'none' : 'default';
      if (s.mode !== 1) {
        s.plx = lx;
        s.ply = ly;
        return;
      }
      const now = performance.now();
      const dtMs = Math.max(4, now - s.pt);
      const dx = lx - s.plx;
      const dy = ly - s.ply;
      const speed = (Math.hypot(dx, dy) / dtMs) * 1000;
      const strength = clamp(speed / 1500, 0.22, 1);
      s.pickTilt = clamp(dy * 0.02, -0.5, 0.5);
      // every string the stroke crossed this move, in order, spread over the move's time
      const cross: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = s.ply - stringY(i, clamp(s.plx, 0, SCALE));
        const b = ly - stringY(i, clamp(lx, 0, SCALE));
        if (a === 0 || Math.sign(a) === Math.sign(b)) continue;
        const q = a / (a - b);
        const cx = s.plx + dx * q;
        if (cx < -4 || cx > SCALE + 8) continue;
        cross.push(q, i, cx);
      }
      const order: number[] = [];
      for (let k = 0; k < cross.length; k += 3) order.push(k);
      order.sort((p, q) => cross[p] - cross[q]);
      const span = Math.min(dtMs / 1000, 0.05);
      for (const k of order) {
        const i = cross[k + 1];
        if (s.clock - s.lastPluck[i] < 0.025) continue;
        const f = s.frets[i];
        pluck(s, env, i, f, strength, cross[k] * span, cross[k + 2]);
      }
      if (cross.length) {
        s.idle = 0;
        env.wake(2400);
      }
      s.plx = lx;
      s.ply = ly;
      s.pt = now;
    },
    onPointerUp: (s) => {
      s.mode = 0;
    },
    onPointerLeave: (s, env) => {
      s.over = false;
      env.canvas.style.cursor = 'default';
    },
    onKey: (s, env, e, down) => {
      const code = e.code;
      const ci = CHORD_KEYS.indexOf(code);
      const pi = POWER_KEYS.indexOf(code);
      if (ci < 0 && pi < 0 && code !== 'Space' && code !== 'Enter' && code !== 'NumpadEnter' && code !== 'KeyQ' && code !== 'KeyW') {
        return false;
      }
      if (!down) return true;
      if (e.repeat) return true;
      interact(s);
      if (ci >= 0) pressItem(s, env, ci);
      else if (pi >= 0) {
        setChord(s, env, 8 + pi);
        strum(s, env, 1, 0.8, 0.01);
      } else if (code === 'Space') strum(s, env, 1, 0.75);
      else if (code === 'Enter' || code === 'NumpadEnter') strum(s, env, -1, 0.6);
      else if (code === 'KeyQ') pressItem(s, env, DRIVE);
      else if (code === 'KeyW') pressItem(s, env, VERB);
      env.wake(2400);
      return true;
    },
    dispose: (s) => {
      for (let i = 0; i < 6; i++) {
        const v = s.voices[i];
        if (!v) continue;
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
        s.voices[i] = null;
      }
      s.amp_ = null;
      if (s.bg) s.bg.width = 0;
      if (s.guitar) s.guitar.width = 0;
    },
  });

/** The fret hand: glowing fingertips for the chord, a barre bar, open and muted marks at the nut */
function drawFingers(ctx: CanvasRenderingContext2D, s: State) {
  const rgb = hexRgb(s.color);
  ctx.save();
  if (s.barreA > 0.02) {
    const x = fingerX(1);
    ctx.globalAlpha = s.barreA * 0.85;
    ctx.fillStyle = `rgba(${rgb},0.55)`;
    ctx.beginPath();
    roundRect(ctx, x - 5.5, stringY(0, x) - 7, 11, stringY(5, x) - stringY(0, x) + 14, 5.5);
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},0.9)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 6; i++) {
    const a = s.dotA[i];
    if (a > 0.02) {
      const x = s.dotX[i];
      const y = stringY(i, x);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 17);
      glow.addColorStop(0, `rgba(${rgb},${(a * 0.55).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - 17, y - 17, 34, 34);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(${rgb},0.92)`;
      ctx.beginPath();
      ctx.arc(x, y, 6.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(x - 1.6, y - 1.8, 2.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // open ring or muted cross just behind the nut
    const f = s.frets[i];
    const nx = -14;
    const ny = stringY(i, 0);
    ctx.lineWidth = 1.3;
    if (f === 0) {
      ctx.strokeStyle = `rgba(${rgb},0.9)`;
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, TAU);
      ctx.stroke();
    } else if (f < 0) {
      ctx.strokeStyle = 'rgba(255,120,110,0.85)';
      ctx.beginPath();
      ctx.moveTo(nx - 2.6, ny - 2.6);
      ctx.lineTo(nx + 2.6, ny + 2.6);
      ctx.moveTo(nx + 2.6, ny - 2.6);
      ctx.lineTo(nx - 2.6, ny + 2.6);
      ctx.stroke();
    }
    // a tapped note flashes where the finger landed
    if (s.tapLife[i] > 0.01) {
      const tx = fingerX(s.tapF[i]);
      const tyy = stringY(i, tx);
      const q = s.tapLife[i];
      ctx.strokeStyle = `rgba(255,255,255,${(q * 0.9).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(tx, tyy, 5 + (1 - q) * 9, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(q * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(tx, tyy, 4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Strings: static runs to the tuners and tailpiece, a shimmering standing wave between fret and saddle */
function drawStrings(ctx: CanvasRenderingContext2D, s: State) {
  const rgb = hexRgb(s.color);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const wgt = GAUGE[i];
    const base = WOUND[i] ? '#cdc4b4' : '#e9eef1';
    const { px, py } = postOf(i);
    const ny = stringY(i, 0);
    // shadow on the wood
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = wgt;
    ctx.beginPath();
    ctx.moveTo(-2, ny + 2);
    ctx.lineTo(SCALE, stringY(i, SCALE) + 2.6);
    ctx.stroke();
    // headstock run and tailpiece run
    ctx.strokeStyle = base;
    ctx.beginPath();
    ctx.moveTo(px, py - Math.sign(py) * 3.4);
    ctx.lineTo(-2, ny);
    ctx.moveTo(SCALE, stringY(i, SCALE));
    ctx.lineTo(668, stringY(i, SCALE) * 1.04);
    ctx.stroke();

    const fret = s.vibFret[i];
    const x0 = fret > 0 ? fretX(fret) : 0;
    const A = s.amp[i];
    if (x0 > 0) {
      ctx.beginPath();
      ctx.moveTo(-2, ny);
      ctx.lineTo(x0, stringY(i, x0));
      ctx.stroke();
    }
    const len = SCALE - x0;
    const c = Math.cos(s.phase[i]);
    if (A > 0.04) {
      // the blur of the swing: a soft lens between the two extremes
      ctx.fillStyle = `rgba(${rgb},${Math.min(0.28, A * 0.09).toFixed(3)})`;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const x = x0 + (len * k) / 16;
        const y = stringY(i, x) - A * Math.sin((Math.PI * k) / 16);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let k = 16; k >= 0; k--) {
        const x = x0 + (len * k) / 16;
        ctx.lineTo(x, stringY(i, x) + A * Math.sin((Math.PI * k) / 16));
      }
      ctx.closePath();
      ctx.fill();
    }
    const path = () => {
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const x = x0 + (len * k) / 20;
        const y = stringY(i, x) + A * c * Math.sin((Math.PI * k) / 20);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    ctx.strokeStyle = base;
    ctx.lineWidth = wgt;
    path();
    ctx.stroke();
    if (WOUND[i]) {
      // the winding catches light in fine ticks
      ctx.strokeStyle = 'rgba(70,60,50,0.55)';
      ctx.lineWidth = wgt * 0.8;
      ctx.setLineDash([0.6, 1.2]);
      path();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // a hot glint along a ringing string
    if (A > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${rgb},${Math.min(0.85, A * 0.3).toFixed(3)})`;
      ctx.lineWidth = wgt + 1.2;
      path();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // specular highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(0.3, wgt * 0.35);
    ctx.beginPath();
    ctx.moveTo(x0, stringY(i, x0) - wgt * 0.3);
    ctx.lineTo(SCALE, stringY(i, SCALE) - wgt * 0.3);
    ctx.stroke();
  }
}

/** The chord pads show their shapes as little chord boxes; the pedals are stompboxes */
function drawItems(ctx: CanvasRenderingContext2D, s: State) {
  for (let n = 0; n < s.items.length; n++) {
    const it = s.items[n];
    const pr = s.press[n];
    const k = 1 - pr * 0.05;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    const w = it.w * k;
    const h = it.h * k;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const r = Math.min(10, w * 0.14);
    ctx.save();
    if (n < 8) {
      const col = CHORDS[n].color;
      const rgb = hexRgb(col);
      const on = s.chord === n;
      if (on) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 14 + pr * 10;
      }
      const bg = ctx.createLinearGradient(0, y, 0, y + h);
      bg.addColorStop(0, on ? `rgba(${rgb},0.26)` : 'rgba(30,24,38,0.92)');
      bg.addColorStop(1, on ? `rgba(${rgb},0.12)` : 'rgba(16,12,22,0.92)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = on ? col : `rgba(${rgb},0.35)`;
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.stroke();
      if (pr > 0.01) {
        ctx.fillStyle = `rgba(${rgb},${(pr * 0.35).toFixed(3)})`;
        ctx.fill();
      }
      chordBox(ctx, CHORDS[n], x + w * 0.2, y + h * 0.24, w * 0.6, h * 0.56, on ? '#fff' : 'rgba(235,228,245,0.7)', col);
      // colour bar along the foot
      ctx.fillStyle = `rgba(${rgb},${on ? 0.95 : 0.5})`;
      ctx.fillRect(x + w * 0.3, y + h - 4, w * 0.4, 2);
    } else {
      const drive = n === DRIVE;
      const on = drive ? s.drive : s.verb;
      const body = drive ? '#e8742a' : '#2a9fb0';
      const bg = ctx.createLinearGradient(x, y, x + w, y + h);
      bg.addColorStop(0, body);
      bg.addColorStop(1, drive ? '#a3441a' : '#16606b');
      ctx.fillStyle = bg;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // two knobs, an LED and the footswitch
      const kr = Math.min(w, h) * 0.09;
      for (const kx of [0.3, 0.7]) {
        ctx.fillStyle = '#141114';
        ctx.beginPath();
        ctx.arc(x + w * kx, y + h * 0.2, kr, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * kx, y + h * 0.2);
        ctx.lineTo(x + w * kx + kr * 0.6, y + h * 0.2 - kr * 0.7);
        ctx.stroke();
      }
      const lx = x + w * 0.5;
      const ly = y + h * 0.4;
      if (on) {
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, kr * 3.2);
        glow.addColorStop(0, 'rgba(255,60,50,0.9)');
        glow.addColorStop(1, 'rgba(255,60,50,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lx - kr * 3.2, ly - kr * 3.2, kr * 6.4, kr * 6.4);
      }
      ctx.fillStyle = on ? '#ff6a5a' : '#4a1612';
      ctx.beginPath();
      ctx.arc(lx, ly, kr * 0.5, 0, TAU);
      ctx.fill();
      // an icon in place of a name: a clipped wave or rings of echo
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const ix = x + w * 0.5;
      const iy = y + h * 0.58;
      const iw = w * 0.22;
      ctx.beginPath();
      if (drive) {
        ctx.moveTo(ix - iw, iy);
        ctx.lineTo(ix - iw * 0.6, iy - iw * 0.35);
        ctx.lineTo(ix - iw * 0.1, iy - iw * 0.35);
        ctx.lineTo(ix + iw * 0.1, iy + iw * 0.35);
        ctx.lineTo(ix + iw * 0.6, iy + iw * 0.35);
        ctx.lineTo(ix + iw, iy);
      } else {
        for (let q = 1; q <= 3; q++) {
          ctx.moveTo(ix + Math.cos(-0.7) * iw * q * 0.33, iy + Math.sin(-0.7) * iw * q * 0.33);
          ctx.arc(ix, iy, iw * q * 0.33, -0.7, 0.7);
        }
      }
      ctx.stroke();
      const fx = x + w * 0.5;
      const fy = y + h * 0.82;
      ctx.fillStyle = '#c9ced3';
      ctx.beginPath();
      ctx.arc(fx, fy, kr * (1.1 - pr * 0.2), 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7d848a';
      ctx.beginPath();
      ctx.arc(fx, fy, kr * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A tiny chord box: six strings, four frets, dots for fingers, marks for open and muted */
function chordBox(
  ctx: CanvasRenderingContext2D,
  c: Chord,
  x: number,
  y: number,
  w: number,
  h: number,
  ink: string,
  col: string
) {
  const gx = w / 5;
  const gy = h / 4;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    ctx.moveTo(x + i * gx, y);
    ctx.lineTo(x + i * gx, y + h);
  }
  for (let f = 1; f <= 4; f++) {
    ctx.moveTo(x, y + f * gy);
    ctx.lineTo(x + w, y + f * gy);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  const dot = Math.max(1.6, Math.min(gx, gy) * 0.36);
  if (c.barre) {
    ctx.fillStyle = col;
    ctx.beginPath();
    roundRect(ctx, x - dot * 0.6, y + (c.barre - 0.5) * gy - dot, w + dot * 1.2, dot * 2, dot);
    ctx.fill();
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const f = c.frets[i];
    const sx = x + i * gx;
    if (f > 0) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sx, y + (f - 0.5) * gy, dot, 0, TAU);
      ctx.fill();
    } else if (f === 0) {
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.arc(sx, y - dot * 1.6, dot * 0.7, 0, TAU);
      ctx.stroke();
    } else {
      const m = dot * 0.7;
      const my = y - dot * 1.6;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(sx - m, my - m);
      ctx.lineTo(sx + m, my + m);
      ctx.moveTo(sx + m, my - m);
      ctx.lineTo(sx - m, my + m);
      ctx.stroke();
    }
  }
}

/** A tortoiseshell pick that follows the pointer over the strings */
function drawPick(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv) {
  if (!env.interactive || !s.over || !env.pointer.inside) return;
  const r = clamp(s.L.sc * 16, 9, 18);
  ctx.save();
  ctx.translate(s.px, s.py);
  ctx.rotate(s.L.rot + 0.5 + s.pickTilt);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#7a3a12');
  g.addColorStop(0.35, '#c8752a');
  g.addColorStop(0.6, '#5a2408');
  g.addColorStop(1, '#a85a20');
  ctx.fillStyle = g;
  ctx.beginPath();
  // rounded triangle, tip at the pointer
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-r * 0.35, -r * 0.4, -r * 1.05, -r * 1.2, -r * 0.6, -r * 1.6);
  ctx.bezierCurveTo(-r * 0.2, -r * 1.95, r * 0.2, -r * 1.95, r * 0.6, -r * 1.6);
  ctx.bezierCurveTo(r * 1.05, -r * 1.2, r * 0.35, -r * 0.4, 0, 0);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,220,170,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
