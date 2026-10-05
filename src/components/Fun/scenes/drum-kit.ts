import { createCanvasScene, clamp, damp, lerp, rand, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { Pool, hash } from './games-kit';

/**
 * Drum Kit: a five piece rock kit on a lit riser (kick, snare, hi-hat, two rack toms,
 * floor tom, crash and ride). Tap or click any piece to play it; where you hit sets the
 * tone and how hard (centre is full, edges ring and thin out, the ride has a bell), and a
 * fast mouse swing hits harder. Drag across the drums for a fill. A pair of sticks swings
 * to every hit, skins flex and ripple, cymbals wobble and shimmer, and the stage lights
 * kick with the drums. Every voice is synthesised with Web Audio. A small drum machine on
 * the stage lip runs a click or a rock groove to play over. Left alone, the sticks keep a
 * quiet beat to themselves, silently.
 */

type PieceId = 'kick' | 'snare' | 'hat' | 'tom1' | 'tom2' | 'floor' | 'crash' | 'ride';

interface Geo {
  x: number;
  y: number;
  rx: number;
  ry: number;
  depth: number;
  tilt: number;
}

const FLOOR = 300;
const RISER_FRONT = 336;
const RISER_BASE = 376;
const STICK = 150;

// drummer's view: hats on the left, ride on the right
const WIDE: Record<PieceId, Geo> = {
  hat: { x: -372, y: -4, rx: 84, ry: 15, depth: 0, tilt: 0.04 },
  crash: { x: -258, y: -200, rx: 118, ry: 24, depth: 0, tilt: -0.14 },
  ride: { x: 338, y: -134, rx: 132, ry: 27, depth: 0, tilt: 0.1 },
  snare: { x: -206, y: 52, rx: 76, ry: 25, depth: 40, tilt: 0 },
  tom1: { x: -80, y: -66, rx: 60, ry: 22, depth: 52, tilt: 0 },
  tom2: { x: 84, y: -66, rx: 66, ry: 24, depth: 58, tilt: 0 },
  floor: { x: 246, y: 66, rx: 88, ry: 30, depth: 118, tilt: 0 },
  kick: { x: 0, y: 172, rx: 122, ry: 122, depth: 24, tilt: 0 },
};

// narrower screens pull the outer pieces in and lift the cymbals
const COMPACT: Record<PieceId, Geo> = {
  hat: { x: -292, y: -4, rx: 78, ry: 15, depth: 0, tilt: 0.04 },
  crash: { x: -190, y: -228, rx: 110, ry: 23, depth: 0, tilt: -0.12 },
  ride: { x: 240, y: -198, rx: 118, ry: 26, depth: 0, tilt: 0.1 },
  snare: { x: -170, y: 58, rx: 74, ry: 25, depth: 40, tilt: 0 },
  tom1: { x: -72, y: -66, rx: 58, ry: 22, depth: 52, tilt: 0 },
  tom2: { x: 74, y: -66, rx: 62, ry: 24, depth: 58, tilt: 0 },
  floor: { x: 206, y: 66, rx: 84, ry: 29, depth: 118, tilt: 0 },
  kick: { x: 0, y: 172, rx: 122, ry: 122, depth: 24, tilt: 0 },
};

const ORDER: PieceId[] = ['crash', 'ride', 'hat', 'tom1', 'tom2', 'snare', 'floor', 'kick'];
const TOM_F: Record<string, [number, number]> = { tom1: [200, 0.46], tom2: [152, 0.58], floor: [98, 0.85] };
/** Beam colours: magenta red, amber, ice blue */
const BEAM_RGB = ['255,70,90', '255,170,70', '120,170,255', '255,170,70', '255,70,90'];
const ACCENT = '#ff5a3c';
const BPM_MIN = 60;
const BPM_MAX = 180;
const LOOK = 0.1;

interface Piece {
  id: PieceId;
  g: Geo;
  /** Head flex or cymbal brightness, decays */
  flex: number;
  /** Cymbal wobble amplitude and time since the hit */
  wob: number;
  wobT: number;
  /** Hit point in local units, relative to the head centre */
  hx: number;
  hy: number;
  sparkle: number[];
}

interface Ripple {
  p: number;
  x: number;
  y: number;
  age: number;
  v: number;
}

interface Stick {
  side: -1 | 1;
  gx: number;
  gy: number;
  imp: number;
  last: number;
  tx: number;
  ty: number;
  px: number;
  py: number;
  trail: number;
}

interface Hit {
  id: PieceId;
  v: number;
  pos: number;
  open?: boolean;
}

interface Pending {
  at: number;
  hit: Hit;
  sticks: boolean;
  beat: number;
}

interface Kit {
  ctx: AudioContext;
  input: GainNode;
  out: GainNode;
  noise: AudioBuffer;
  hat: GainNode | null;
}

interface Btn {
  id: 'metro' | 'slower' | 'faster' | 'groove';
  x: number;
  y: number;
  r: number;
}

interface State {
  pieces: Piece[];
  byId: Record<PieceId, Piece>;
  ripples: Ripple[];
  sticks: [Stick, Stick];
  sparks: Pool;
  motes: Pool;
  pending: Pending[];
  kit: Kit | null;
  clock: number;
  // hi-hat pedal
  hatOpen: boolean;
  shiftOpen: boolean;
  gap: number;
  // sequencer
  bpm: number;
  groove: boolean;
  metro: boolean;
  demo: boolean;
  touched: boolean;
  idle: number;
  step: number;
  nextStep: number;
  stopAt: number;
  beat: number;
  beatFlash: number;
  pendulum: number;
  // light
  beams: Float32Array;
  wash: number;
  flash: number;
  // pointer
  drag: PieceId | null;
  lastX: number;
  lastY: number;
  speed: number;
  speedT: number;
  moveT: number;
  hover: string | null;
  press: Record<string, number>;
  // layout
  compact: boolean;
  k: number;
  ox: number;
  oy: number;
  pedal: { x: number; y: number };
  rest: [number, number, number, number];
  panel: { x: number; y: number; w: number; h: number };
  btns: Btn[];
  bg: HTMLCanvasElement | null;
  w: number;
  h: number;
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.w = w;
  s.h = h;
  s.compact = w / Math.max(1, h) < 1.25;
  const geo = s.compact ? COMPACT : WIDE;
  for (const p of s.pieces) p.g = geo[p.id];
  const dw = s.compact ? 760 : 960;
  const top = s.compact ? -282 : -262;
  const bottom = RISER_BASE + 4;
  const dh = bottom - top;
  const ph = clamp(Math.min(w, h) * 0.11, 50, 62);
  s.k = Math.max(0.05, Math.min((w * 0.97) / dw, (h - ph - 18) / dh));
  s.ox = w / 2;
  const used = dh * s.k + ph + 14;
  const y0 = Math.max(4, (h - used) * (s.compact ? 0.8 : 0.55));
  s.oy = y0 - top * s.k;
  // the drum machine sits on the stage just below the riser
  const bw = Math.min(w - 24, ph * 5.2);
  const py = Math.min(h - ph / 2 - 8, s.oy + bottom * s.k + ph / 2 + 8);
  s.panel = { x: w / 2 - bw / 2, y: py - ph / 2, w: bw, h: ph };
  const r = ph * 0.36;
  const u = bw / 10;
  s.btns = [
    { id: 'metro', x: s.panel.x + u, y: py, r },
    { id: 'slower', x: s.panel.x + u * 2.75, y: py, r: r * 0.8 },
    { id: 'faster', x: s.panel.x + u * 7.25, y: py, r: r * 0.8 },
    { id: 'groove', x: s.panel.x + u * 9, y: py, r },
  ];
  const hat = geo.hat;
  s.pedal = { x: hat.x + 16, y: FLOOR - 4 };
  const sx = s.compact ? 0.82 : 1;
  s.rest = [-250 * sx, -168, 236 * sx, -168];
  s.bg = buildBackground(s, env, s.bg);
}

const toX = (s: State, x: number) => (x - s.ox) / s.k;
const toY = (s: State, y: number) => (y - s.oy) / s.k;

/* ---------- hit testing ---------- */

/** Normalised distance from a piece's centre (0 centre, 1 rim), or -1 when outside */
function pieceHit(p: Piece, x: number, y: number, gap: number): number {
  const g = p.g;
  if (p.id === 'kick') {
    const d = Math.hypot(x - g.x, y - g.y) / g.rx;
    return d <= 1.02 ? d : -1;
  }
  if (p.id === 'crash' || p.id === 'ride' || p.id === 'hat') {
    const cy = p.id === 'hat' ? g.y - gap : g.y;
    const dx = (x - g.x) / (g.rx * 1.06);
    const dy = (y - cy - (x - g.x) * Math.sin(g.tilt)) / Math.max(g.ry * 1.9, 34);
    const d = Math.hypot(dx, dy);
    return d <= 1 ? Math.min(1, Math.hypot((x - g.x) / g.rx, (y - cy) / (g.ry * 1.4))) : -1;
  }
  const dx = (x - g.x) / g.rx;
  const dy = (y - g.y) / g.ry;
  const d = Math.hypot(dx, dy);
  if (d <= 1.15) return Math.min(1, d);
  // the shell counts as a rim hit
  if (Math.abs(x - g.x) < g.rx && y > g.y && y < g.y + g.depth + g.ry * 0.6) return 0.95;
  return -1;
}

function pickPiece(s: State, x: number, y: number): { p: Piece; pos: number } | null {
  let best: Piece | null = null;
  let bestD = 9;
  let bestPos = 0;
  for (const id of ORDER) {
    const p = s.byId[id];
    const d = pieceHit(p, x, y, s.gap);
    if (d < 0) continue;
    // cymbals are thin; let them win only when the press is clearly on them
    const score = d + (p.id === 'kick' ? 0.35 : 0);
    if (score < bestD) {
      bestD = score;
      best = p;
      bestPos = d;
    }
  }
  return best ? { p: best, pos: bestPos } : null;
}

const onPedal = (s: State, x: number, y: number) =>
  Math.hypot((x - s.pedal.x) / 48, (y - s.pedal.y) / 22) <= 1;

function btnAt(s: State, x: number, y: number): Btn | null {
  for (const b of s.btns) if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.3) return b;
  return null;
}

/* ---------- audio ---------- */

function ensureKit(s: State, env: SceneEnv): Kit | null {
  const bus = env.audio();
  if (!bus) return null;
  if (s.kit && s.kit.ctx === bus.ctx) return s.kit;
  const ctx = bus.ctx;
  const input = ctx.createGain();
  input.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.16;
  input.connect(comp);
  comp.connect(bus.out);
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, 0.9);
  const wet = ctx.createGain();
  wet.gain.value = 0.17;
  input.connect(room);
  room.connect(wet);
  wet.connect(bus.out);
  const len = Math.floor(ctx.sampleRate * 2);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  s.kit = { ctx, input, out: bus.out, noise, hat: null };
  return s.kit;
}

function roomImpulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const q = i / len;
      lp += 0.6 * (Math.random() * 2 - 1 - lp);
      d[i] = i < ctx.sampleRate * 0.006 ? 0 : lp * Math.pow(1 - q, 3.2);
    }
  }
  return buf;
}

function vca(k: Kit, t: number, peak: number, decay: number, dest: AudioNode = k.input, attack = 0.0015) {
  const g = k.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function filt(k: Kit, type: BiquadFilterType, f: number, q: number, dest: AudioNode, gain = 0) {
  const n = k.ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  n.gain.value = gain;
  n.connect(dest);
  return n;
}

function osc(k: Kit, type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode) {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function hiss(k: Kit, t: number, dur: number, dest: AudioNode) {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  src.connect(dest);
  const off = Math.random() * Math.max(0, k.noise.duration - dur - 0.1);
  src.start(t, off, dur + 0.05);
}

const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];

/** The classic six square bank: inharmonic partials that read as metal once filtered */
function metal(k: Kit, t: number, base: number, dur: number, dest: AudioNode, level = 0.16) {
  const g = k.ctx.createGain();
  g.gain.value = level;
  g.connect(dest);
  for (const r of METAL) osc(k, 'square', base * r * rand(0.995, 1.005), t, dur, g);
}

function chokeHat(k: Kit, t: number) {
  if (!k.hat) return;
  k.hat.gain.cancelScheduledValues(t);
  k.hat.gain.setTargetAtTime(0.0001, t, 0.012);
  k.hat = null;
}

function voice(k: Kit, hit: Hit, t: number) {
  const v = hit.v;
  const pos = hit.pos;
  switch (hit.id) {
    case 'kick': {
      const g = vca(k, t, 1.0 * v, 0.4 + 0.12 * v);
      const o = osc(k, 'sine', 115 + 70 * v, t, 0.6, g);
      o.frequency.exponentialRampToValueAtTime(54, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(43, t + 0.45);
      const sub = vca(k, t, 0.28 * v, 0.3);
      osc(k, 'sine', 48, t, 0.35, sub);
      const click = vca(k, t, 0.42 * v, 0.016);
      hiss(k, t, 0.03, filt(k, 'highpass', 1900, 0.7, click));
      const beat = vca(k, t, 0.22 * v, 0.025);
      osc(k, 'triangle', 1100, t, 0.04, beat).frequency.exponentialRampToValueAtTime(260, t + 0.03);
      break;
    }
    case 'snare': {
      const body = vca(k, t, 0.52 * v, 0.085 + 0.05 * pos);
      osc(k, 'triangle', 214 - pos * 10, t, 0.2, body).frequency.exponentialRampToValueAtTime(168, t + 0.08);
      const ring = vca(k, t, (0.07 + 0.2 * pos * pos) * v, 0.14 + pos * 0.12);
      osc(k, 'sine', 338 + pos * 40, t, 0.3, ring);
      osc(k, 'sine', 512, t, 0.3, ring);
      const n = vca(k, t, 0.66 * v, 0.15 + 0.1 * v - pos * 0.04);
      const pk = filt(k, 'peaking', 5200, 0.8, n, 5);
      hiss(k, t, 0.35, filt(k, 'highpass', 1300 + pos * 900, 0.6, pk));
      break;
    }
    case 'hat': {
      chokeHat(k, t);
      const open = !!hit.open;
      const dec = open ? 0.5 + 0.25 * v : 0.04 + 0.04 * v + pos * 0.025;
      const g = vca(k, t, (open ? 0.36 : 0.44) * v, dec);
      const hp = filt(k, 'highpass', open ? 6200 : 7200, 0.7, g);
      const bp = filt(k, 'bandpass', 10400, 0.8, hp);
      metal(k, t, 40, dec + 0.1, bp, 0.22);
      const ng = k.ctx.createGain();
      ng.gain.value = 0.32 + pos * 0.2;
      ng.connect(hp);
      hiss(k, t, dec + 0.1, ng);
      if (open) k.hat = g;
      break;
    }
    case 'crash': {
      const dec = 1.5 + 0.9 * v;
      const wash = vca(k, t, 0.46 * v, dec, k.input, 0.004);
      hiss(k, t, dec + 0.1, filt(k, 'highpass', 3000, 0.5, wash));
      const bite = vca(k, t, 0.36 * v, 0.09);
      hiss(k, t, 0.15, filt(k, 'highpass', 5500, 0.7, bite));
      const ring = vca(k, t, 0.2 * v, dec * 0.75);
      metal(k, t, 57, dec, filt(k, 'bandpass', 7000, 0.6, ring), 0.2);
      break;
    }
    case 'ride': {
      if (pos < 0.28) {
        // the bell: a cluster of bright, long sine partials
        const parts = [1, 1.47, 2.09, 2.76, 3.58];
        parts.forEach((r, i) => {
          const g = vca(k, t, (0.13 - i * 0.018) * v, 1.5 / (1 + i * 0.4));
          osc(k, 'sine', 812 * r, t, 1.6, g);
        });
        const tick = vca(k, t, 0.16 * v, 0.03);
        hiss(k, t, 0.05, filt(k, 'highpass', 4000, 0.7, tick));
      } else {
        const ping = vca(k, t, 0.22 * v, 0.9 + 0.3 * v);
        metal(k, t, 71, 1.3, filt(k, 'bandpass', 5200, 2.2, ping), 0.3);
        const wash = vca(k, t, (0.05 + pos * 0.16) * v, 1.1 + pos * 0.6);
        hiss(k, t, 1.8, filt(k, 'highpass', 6200, 0.6, wash));
        const tick = vca(k, t, 0.18 * v, 0.022);
        hiss(k, t, 0.04, filt(k, 'highpass', 3600, 0.7, tick));
      }
      break;
    }
    default: {
      const [f0, decay] = TOM_F[hit.id];
      const dec = decay * (0.8 + 0.3 * v);
      const g = vca(k, t, 0.9 * v, dec);
      const o = osc(k, 'sine', f0 * (1.34 + pos * 0.1), t, dec + 0.1, g);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.035);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.84, t + dec);
      const ov = vca(k, t, (0.12 + pos * 0.12) * v, dec * 0.35);
      osc(k, 'triangle', f0 * 2.12, t, dec, ov).frequency.exponentialRampToValueAtTime(f0 * 1.8, t + dec * 0.4);
      const att = vca(k, t, 0.24 * v, 0.03);
      hiss(k, t, 0.06, filt(k, 'lowpass', 3200, 0.7, att));
    }
  }
}

function chick(k: Kit, t: number) {
  chokeHat(k, t);
  const g = vca(k, t, 0.24, 0.035);
  metal(k, t, 40, 0.08, filt(k, 'bandpass', 8200, 1.2, g), 0.22);
}

function clickVoice(k: Kit, t: number, accent: boolean) {
  const g = vca(k, t, accent ? 0.3 : 0.2, 0.045, k.out, 0.001);
  osc(k, 'sine', accent ? 1760 : 1320, t, 0.08, g);
}

/* ---------- playing ---------- */

/** Visual side of a hit: skins, cymbals, lights, sparks and (for the player) a stick */
function strike(s: State, hit: Hit, withStick: boolean, x?: number, y?: number) {
  const p = s.byId[hit.id];
  const g = p.g;
  const v = hit.v;
  const isCym = hit.id === 'crash' || hit.id === 'ride' || hit.id === 'hat';
  const cy = hit.id === 'hat' ? g.y - s.gap : g.y;
  // a hit point on the playing surface
  let hx = x ?? g.x + (hit.id === 'kick' ? 0 : rand(-0.25, 0.15) * g.rx * (0.4 + hit.pos));
  let hy = y ?? cy + rand(-0.3, 0.3) * g.ry * 0.6;
  if (hit.id === 'ride' && x === undefined) hx = g.x + (hit.pos < 0.28 ? -6 : -g.rx * 0.55);
  if (hit.id === 'crash' && x === undefined) hx = g.x + g.rx * 0.62;
  if (hit.id === 'hat' && x === undefined) hx = g.x + g.rx * 0.5;
  if (hit.id !== 'kick') hy = clamp(hy, cy - g.ry, cy + g.ry);
  p.hx = hx - g.x;
  p.hy = hy - cy;
  p.flex = Math.max(p.flex * 0.5, v);
  if (isCym) {
    const amp = hit.id === 'hat' ? (hit.open ? 0.9 : 0.25) : hit.id === 'crash' ? 1.25 : 0.55;
    p.wob = Math.min(1.6, p.wob * Math.exp(-p.wobT * 2) * 0.5 + v * amp);
    p.wobT = 0;
    const n = Math.round((hit.id === 'crash' ? 16 : 7) * v);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(80, 260) * v;
      s.sparks.spawn(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp * 0.45 - 40, rand(0.25, 0.6), rand(1, 2.4), 0, 260, 2.5);
    }
  } else {
    s.ripples.push({ p: s.pieces.indexOf(p), x: p.hx, y: p.hy, age: 0, v });
    if (s.ripples.length > 18) s.ripples.shift();
    const n = Math.round(4 * v);
    for (let i = 0; i < n; i++) {
      s.motes.spawn(hx + rand(-20, 20), hy + rand(-6, 6), rand(-14, 14), rand(-60, -20), rand(1, 2.2), rand(1, 2.2), 1, -6, 0.6);
    }
  }
  // stage lights answer the kit
  const b = s.beams;
  switch (hit.id) {
    case 'kick':
      s.wash = Math.min(1.4, s.wash + v);
      b[2] = Math.min(1.5, b[2] + v * 0.7);
      break;
    case 'snare':
      b[1] = Math.min(1.5, b[1] + v * 0.9);
      b[3] = Math.min(1.5, b[3] + v * 0.5);
      break;
    case 'crash':
      for (let i = 0; i < 5; i++) b[i] = Math.min(1.6, b[i] + v);
      s.flash = Math.min(1, s.flash + v * 0.8);
      break;
    case 'ride':
      b[4] = Math.min(1.5, b[4] + v * 0.5);
      break;
    case 'hat':
      b[0] = Math.min(1.5, b[0] + v * 0.3);
      break;
    case 'tom1':
      b[0] = Math.min(1.5, b[0] + v * 0.9);
      break;
    case 'tom2':
      b[4] = Math.min(1.5, b[4] + v * 0.9);
      break;
    case 'floor':
      b[2] = Math.min(1.5, b[2] + v * 0.6);
      b[3] = Math.min(1.5, b[3] + v * 0.6);
      break;
  }
  if (withStick && hit.id !== 'kick') swing(s, hx, hy);
}

function swing(s: State, x: number, y: number) {
  const [L, R] = s.sticks;
  let st = x < -40 ? L : x > 40 ? R : L.last < R.last ? L : R;
  const other = st === L ? R : L;
  if (s.clock - st.last < 0.09 && s.clock - other.last > 0.06) st = other;
  const a = stickAngle(st, 0);
  st.px = st.tx;
  st.py = st.ty;
  st.tx = x;
  st.ty = y;
  st.gx = x - Math.cos(a) * STICK;
  st.gy = y - Math.sin(a) * STICK;
  st.imp = 1;
  st.trail = Math.hypot(st.px - x, st.py - y) > 30 ? 1 : 0;
  st.last = s.clock;
}

/** Stick angle from grip to tip; lift 0 is the impact pose, 1 is raised */
function stickAngle(st: Stick, lift: number) {
  const base = st.side < 0 ? 0.92 : Math.PI - 0.92;
  return st.side < 0 ? base - lift * 0.62 : base + lift * 0.62;
}

function play(s: State, env: SceneEnv | null, hit: Hit, x?: number, y?: number) {
  if (env) {
    const k = ensureKit(s, env);
    if (k) voice(k, hit, k.ctx.currentTime + 0.002);
  }
  strike(s, hit, true, x, y);
}

function interact(s: State) {
  s.idle = 0;
  if (!s.touched || s.demo) {
    s.touched = true;
    if (s.demo) {
      s.demo = false;
      s.pending.length = 0;
    }
  }
}

function velocityAt(s: State, pos: number, id: PieceId) {
  const fresh = performance.now() - s.speedT < 90 ? s.speed : 0;
  const centre = id === 'crash' || id === 'ride' || id === 'hat' ? 0.86 - 0.08 * pos : 0.9 - 0.24 * pos * pos;
  return clamp(centre - 0.06 + Math.min(0.24, fresh / 3500), 0.3, 1);
}

function toggle(s: State, env: SceneEnv, id: Btn['id']) {
  s.press[id] = 1;
  if (id === 'slower' || id === 'faster') {
    s.bpm = clamp(s.bpm + (id === 'faster' ? 8 : -8), BPM_MIN, BPM_MAX);
    return;
  }
  const was = s.groove || s.metro;
  if (id === 'metro') s.metro = !s.metro;
  else s.groove = !s.groove;
  const on = s.groove || s.metro;
  if (on && !was) {
    s.step = 0;
    s.nextStep = s.clock + 0.06;
  }
  if (on) {
    // there is no audio without a gesture, so make the bus here
    ensureKit(s, env);
    if (env.reducedMotion) {
      const bars = (60 / s.bpm) * 4 * 4;
      s.stopAt = s.clock + bars;
      env.wake(bars * 1000 + 300);
    }
  }
}

function setPedal(s: State, env: SceneEnv | null, open: boolean) {
  const was = s.hatOpen || s.shiftOpen;
  s.hatOpen = open;
  const now = s.hatOpen || s.shiftOpen;
  if (was && !now) closeHat(s, env);
}

function closeHat(s: State, env: SceneEnv | null) {
  const hat = s.byId.hat;
  hat.flex = Math.max(hat.flex, 0.4);
  if (!env) return;
  const k = ensureKit(s, env);
  if (k) chick(k, k.ctx.currentTime + 0.002);
}

/* ---------- the groove ---------- */

function pattern(bar: number, step: number, out: Hit[]) {
  out.length = 0;
  const fill = bar % 4 === 3 && step >= 12;
  if (fill) {
    const tom: PieceId = step < 14 ? 'tom1' : step === 14 ? 'tom2' : 'floor';
    out.push({ id: tom, v: 0.8 + (step % 2) * 0.1, pos: 0.15 });
    if (step === 12) out.push({ id: 'kick', v: 0.9, pos: 0 });
    return;
  }
  if (bar % 4 === 0 && step === 0) out.push({ id: 'crash', v: 0.9, pos: 0.6 });
  else if (step % 2 === 0) {
    const open = bar % 2 === 1 && step === 14;
    out.push({ id: 'hat', v: step % 4 === 0 ? 0.78 : 0.55, pos: 0.4, open });
  }
  if (step === 4 || step === 12) out.push({ id: 'snare', v: 0.92, pos: 0.15 });
  if (step === 0 || step === 8) out.push({ id: 'kick', v: 0.95, pos: 0 });
  if (step === 10) out.push({ id: 'kick', v: 0.75, pos: 0 });
  if (step === 7 && bar % 2 === 0) out.push({ id: 'snare', v: 0.32, pos: 0.4 });
}

const scratch: Hit[] = [];

function sequence(s: State, env: SceneEnv) {
  const running = s.groove || s.metro || s.demo;
  if (!running) return;
  const stepDur = 60 / s.bpm / 4;
  const k = s.groove || s.metro ? ensureKit(s, env) : null;
  while (s.nextStep <= s.clock + LOOK) {
    const at = s.nextStep;
    const step = s.step % 16;
    const bar = Math.floor(s.step / 16);
    const audioAt = k ? k.ctx.currentTime + Math.max(0, at - s.clock) + 0.01 : 0;
    if (s.groove || s.demo) {
      pattern(bar, step, scratch);
      for (const hit of scratch) {
        const h = { ...hit };
        // the groove sits a touch under the player
        if (s.groove) h.v *= 0.82;
        if (k && s.groove) {
          if (h.id === 'hat' && s.hatOpen) h.open = true;
          voice(k, h, audioAt);
        }
        s.pending.push({ at, hit: h, sticks: s.demo && !s.groove, beat: -1 });
      }
    }
    if (step % 4 === 0) {
      if (k && s.metro) clickVoice(k, audioAt, step === 0);
      s.pending.push({ at, hit: { id: 'kick', v: 0, pos: 0 }, sticks: false, beat: step / 4 });
    }
    s.step++;
    s.nextStep += stepDur;
  }
}

/* ---------- background ---------- */

function buildBackground(s: State, env: SceneEnv, old: HTMLCanvasElement | null) {
  const { w, h, dpr } = env;
  const c = old ?? document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  if (!g) return c;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#050309');
  wall.addColorStop(0.5, '#0f0811');
  wall.addColorStop(1, '#170b12');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  // a black stage curtain with soft folds
  let seed = 7;
  const r = () => hash(seed++);
  for (let x = -10; x < w; x += 14 + r() * 22) {
    const fw = 12 + r() * 26;
    const fold = g.createLinearGradient(x, 0, x + fw, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(0.5, `rgba(110,40,70,${(0.035 + r() * 0.04).toFixed(3)})`);
    fold.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fold;
    g.fillRect(x, 0, fw, s.oy + FLOOR * s.k);
  }
  // the lighting truss across the top, with its cans
  const ty = trussY(s);
  g.fillStyle = '#1a171d';
  g.fillRect(0, ty - 5, w, 10);
  g.strokeStyle = '#2a2630';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let x = 0; x < w; x += 16) {
    g.moveTo(x, ty - 5);
    g.lineTo(x + 8, ty + 5);
    g.lineTo(x + 16, ty - 5);
  }
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const bx = beamX(s, i);
    g.fillStyle = '#0c0b0f';
    g.beginPath();
    g.roundRect(bx - 11, ty, 22, 24, 4);
    g.fill();
    g.fillStyle = '#2b2733';
    g.fillRect(bx - 11, ty, 22, 3);
  }
  const k = s.k;
  g.save();
  g.translate(s.ox, s.oy);
  g.scale(k, k);
  // amp stacks either side of the riser
  for (const side of [-1, 1]) {
    const ax = side * (s.compact ? 520 : 600);
    for (let j = 0; j < 2; j++) {
      const y0 = FLOOR - 40 - (j + 1) * 150;
      const x0 = ax - 90;
      g.fillStyle = '#0e0c10';
      g.beginPath();
      g.roundRect(x0, y0, 180, 146, 6);
      g.fill();
      g.fillStyle = '#18151b';
      g.beginPath();
      g.roundRect(x0 + 10, y0 + 10, 160, 126, 3);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.03)';
      for (let gy = y0 + 14; gy < y0 + 134; gy += 5) g.fillRect(x0 + 12, gy, 156, 1);
      g.fillStyle = '#3a363f';
      for (const [cx, cy] of [[x0 + 4, y0 + 4], [x0 + 176, y0 + 4], [x0 + 4, y0 + 142], [x0 + 176, y0 + 142]]) {
        g.beginPath();
        g.arc(cx, cy, 4, 0, TAU);
        g.fill();
      }
    }
  }
  // the riser: carpeted top, a front face with a lit edge
  const rw = s.compact ? 470 : 540;
  const top = g.createLinearGradient(0, FLOOR - 70, 0, RISER_FRONT);
  top.addColorStop(0, '#120b0f');
  top.addColorStop(1, '#22141a');
  g.fillStyle = top;
  g.beginPath();
  g.moveTo(-rw + 40, FLOOR - 70);
  g.lineTo(rw - 40, FLOOR - 70);
  g.lineTo(rw, RISER_FRONT);
  g.lineTo(-rw, RISER_FRONT);
  g.closePath();
  g.fill();
  // the drum rug
  const rug = g.createLinearGradient(0, FLOOR - 40, 0, RISER_FRONT - 6);
  rug.addColorStop(0, '#3a0f17');
  rug.addColorStop(1, '#5a1822');
  g.fillStyle = rug;
  g.beginPath();
  g.moveTo(-rw + 90, FLOOR - 40);
  g.lineTo(rw - 90, FLOOR - 40);
  g.lineTo(rw - 50, RISER_FRONT - 8);
  g.lineTo(-rw + 50, RISER_FRONT - 8);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,180,120,0.12)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-rw + 104, FLOOR - 34);
  g.lineTo(rw - 104, FLOOR - 34);
  g.lineTo(rw - 64, RISER_FRONT - 14);
  g.lineTo(-rw + 64, RISER_FRONT - 14);
  g.closePath();
  g.stroke();
  const face = g.createLinearGradient(0, RISER_FRONT, 0, RISER_BASE);
  face.addColorStop(0, '#1b1217');
  face.addColorStop(1, '#09060a');
  g.fillStyle = face;
  g.fillRect(-rw, RISER_FRONT, rw * 2, RISER_BASE - RISER_FRONT);
  g.fillStyle = 'rgba(255,120,80,0.35)';
  g.fillRect(-rw, RISER_FRONT, rw * 2, 2);
  g.restore();
  // stage floor in front of the riser
  const fy = s.oy + RISER_BASE * k;
  const floor = g.createLinearGradient(0, fy, 0, h);
  floor.addColorStop(0, '#120c10');
  floor.addColorStop(1, '#050306');
  g.fillStyle = floor;
  g.fillRect(0, fy, w, h - fy);
  g.strokeStyle = 'rgba(255,255,255,0.025)';
  g.lineWidth = 1;
  for (let y = fy + 8, step = 8; y < h; step *= 1.25, y += step) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  return c;
}

function trussY(s: State) {
  return Math.max(10, Math.min(s.oy - 300 * s.k - 34, s.h * 0.1));
}

function beamX(s: State, i: number) {
  const span = Math.min(s.w * 0.86, 900 * s.k);
  return s.w / 2 + (i - 2) * (span / 4);
}

/* ---------- drawing the kit ---------- */

const CHROME = '#c9ced6';
const CHROME_D = '#6b717b';

function chromeLine(ctx: CanvasRenderingContext2D, pts: number[], w: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = CHROME_D;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.strokeStyle = CHROME;
  ctx.lineWidth = w * 0.45;
  ctx.stroke();
}

function tripod(ctx: CanvasRenderingContext2D, x: number, top: number, spread = 40) {
  const hub = FLOOR - 46;
  chromeLine(ctx, [x, top, x, hub], 6);
  chromeLine(ctx, [x, hub, x - spread, FLOOR], 4.5);
  chromeLine(ctx, [x, hub, x + spread, FLOOR], 4.5);
  chromeLine(ctx, [x, hub, x + spread * 0.2, FLOOR - 8], 4);
  ctx.fillStyle = '#141216';
  for (const fx of [x - spread, x + spread]) {
    ctx.beginPath();
    ctx.ellipse(fx, FLOOR + 1, 6, 3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = CHROME_D;
  ctx.fillRect(x - 5, hub - 6, 10, 12);
}

function shellPath(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, depth: number) {
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.lineTo(x - rx, y + depth);
  ctx.ellipse(x, y + depth, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
}

function wrapGradient(ctx: CanvasRenderingContext2D, x: number, rx: number, metalShell: boolean) {
  const gr = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  if (metalShell) {
    gr.addColorStop(0, '#3d4148');
    gr.addColorStop(0.22, '#e8ebef');
    gr.addColorStop(0.36, '#9aa0a9');
    gr.addColorStop(0.7, '#5b616b');
    gr.addColorStop(1, '#22252b');
  } else {
    gr.addColorStop(0, '#2a0409');
    gr.addColorStop(0.18, '#9e1b2f');
    gr.addColorStop(0.3, '#ff6b7c');
    gr.addColorStop(0.42, '#b3213a');
    gr.addColorStop(0.8, '#5e0c18');
    gr.addColorStop(1, '#1c0206');
  }
  return gr;
}

function drawDrum(ctx: CanvasRenderingContext2D, s: State, p: Piece, t: number) {
  const g = p.g;
  const metalShell = p.id === 'snare';
  const dip = p.flex * 2.2;
  const x = g.x;
  const y = g.y + dip * 0.5;
  const { rx, ry, depth } = g;
  // shell
  shellPath(ctx, x, y, rx, ry, depth);
  ctx.fillStyle = wrapGradient(ctx, x, rx, metalShell);
  ctx.fill();
  // sparkle in the wrap
  if (!metalShell) {
    for (let i = 0; i < p.sparkle.length; i += 3) {
      const u = p.sparkle[i];
      const sx = x + (u * 2 - 1) * rx * 0.94;
      const sy = y + p.sparkle[i + 1] * depth + Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2)) * ry;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.6 + p.sparkle[i + 2] * 20 + s.wash * 3);
      ctx.fillStyle = `rgba(255,${190 + Math.round(tw * 60)},210,${(0.18 + tw * 0.5).toFixed(3)})`;
      ctx.fillRect(sx, sy, 1.4, 1.4);
    }
  }
  // lugs
  const lugs = metalShell ? 7 : 5;
  for (let i = 0; i < lugs; i++) {
    const a = ((i + 0.5) / lugs) * Math.PI;
    const lx = x + Math.cos(a) * rx * 0.98;
    const ly = y + Math.sin(a) * ry;
    const lw = 5.5 * (0.5 + 0.5 * Math.sin(a));
    const lugH = Math.min(26, depth * 0.55);
    ctx.fillStyle = CHROME_D;
    ctx.beginPath();
    ctx.roundRect(lx - lw / 2 - 0.6, ly + depth * 0.5 - lugH / 2, lw + 1.2, lugH, 2);
    ctx.fill();
    ctx.fillStyle = CHROME;
    ctx.fillRect(lx - lw * 0.2, ly + depth * 0.5 - lugH / 2 + 2, lw * 0.35, lugH - 4);
    if (metalShell || depth > 50) {
      chromeLine(ctx, [lx, ly + 3, lx, ly + depth - 2], 1.6);
    }
  }
  // bottom hoop
  ctx.beginPath();
  ctx.ellipse(x, y + depth, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = CHROME_D;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = CHROME;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (p.id === 'snare') {
    // the snare throw off on the side
    ctx.fillStyle = CHROME_D;
    ctx.fillRect(x + rx * 0.55, y + ry * 0.7 + 8, 10, 16);
    ctx.fillStyle = CHROME;
    ctx.fillRect(x + rx * 0.55 + 2, y + ry * 0.7 + 4, 3, 12);
  }
  // head
  const hg = ctx.createRadialGradient(x - rx * 0.25, y - ry * 0.3, 2, x, y, rx);
  const lit = 0.5 + p.flex * 0.5;
  hg.addColorStop(0, `rgb(${Math.round(240 + 15 * lit)},${Math.round(234 + 14 * lit)},${Math.round(222 + 10 * lit)})`);
  hg.addColorStop(0.7, '#d8cfbf');
  hg.addColorStop(1, '#a89d8a');
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = hg;
  ctx.fill();
  // the skin dents where it was struck, then ripples out
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx - 2, ry - 1, 0, 0, TAU);
  ctx.clip();
  if (p.flex > 0.02) {
    const dx = x + p.hx * 0.8;
    const dy = y + p.hy * 0.8;
    const dent = ctx.createRadialGradient(dx, dy, 0, dx, dy, rx * 0.55);
    dent.addColorStop(0, `rgba(70,50,30,${(p.flex * 0.32).toFixed(3)})`);
    dent.addColorStop(1, 'rgba(70,50,30,0)');
    ctx.fillStyle = dent;
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  }
  const pi = s.pieces.indexOf(p);
  ctx.lineWidth = 1.6;
  for (const r of s.ripples) {
    if (r.p !== pi) continue;
    const k = r.age / 0.42;
    if (k >= 1) continue;
    const rr = 6 + k * rx * 1.5;
    ctx.strokeStyle = `rgba(255,255,255,${((1 - k) * 0.55 * r.v).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x + r.x, y + r.y, rr, rr * (ry / rx), 0, 0, TAU);
    ctx.stroke();
  }
  // a stage light sheen across the coated head
  const sheen = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.2, y + ry);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, `rgba(255,236,220,${(0.12 + p.flex * 0.25).toFixed(3)})`);
  sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  ctx.restore();
  // top hoop
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = CHROME_D;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = CHROME;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5, rx, ry, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawKick(ctx: CanvasRenderingContext2D, s: State, p: Piece, t: number) {
  const g = p.g;
  const r = g.rx;
  const sc = 1 + p.flex * 0.022;
  ctx.save();
  ctx.translate(g.x, g.y + p.flex * 1.5);
  ctx.scale(sc, sc);
  // spurs
  chromeLine(ctx, [-r * 0.82, r * 0.34, -r * 1.12, FLOOR - g.y], 4.5);
  chromeLine(ctx, [r * 0.82, r * 0.34, r * 1.12, FLOOR - g.y], 4.5);
  // the shell behind the front hoop
  ctx.beginPath();
  ctx.arc(0, -g.depth, r * 0.99, Math.PI, 0);
  ctx.lineTo(r, 0);
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = wrapGradient(ctx, 0, r, false);
  ctx.fill();
  // front hoop with a wrap inlay
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = wrapGradient(ctx, 0, r, false);
  ctx.fill();
  ctx.strokeStyle = CHROME;
  ctx.lineWidth = 2;
  ctx.stroke();
  // claws and rods
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.31;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    ctx.save();
    ctx.translate(cx * (r - 6), cy * (r - 6));
    ctx.rotate(a);
    ctx.fillStyle = CHROME_D;
    ctx.fillRect(-4, -5, 12, 10);
    ctx.fillStyle = CHROME;
    ctx.fillRect(-3, -2, 9, 3);
    ctx.restore();
  }
  // the black resonant head
  const hr = r - 13;
  const hg = ctx.createRadialGradient(-hr * 0.35, -hr * 0.4, 4, 0, 0, hr);
  hg.addColorStop(0, '#2c2329');
  hg.addColorStop(1, '#070508');
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, TAU);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = CHROME_D;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // emblem: a ring and a five point star, lit by the kick
  const glowA = 0.55 + p.flex * 0.45 + s.wash * 0.15;
  ctx.lineWidth = 7;
  ctx.strokeStyle = `rgba(255,90,60,${(0.25 + p.flex * 0.35).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(0, 0, hr * 0.6, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255,190,120,${Math.min(1, glowA).toFixed(3)})`;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? hr * 0.17 : hr * 0.42;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  const star = ctx.createLinearGradient(0, -hr * 0.42, 0, hr * 0.42);
  star.addColorStop(0, '#ffd27a');
  star.addColorStop(1, ACCENT);
  ctx.fillStyle = star;
  ctx.globalAlpha = Math.min(1, 0.7 + p.flex * 0.3);
  ctx.fill();
  ctx.globalAlpha = 1;
  // port hole
  ctx.beginPath();
  ctx.arc(hr * 0.5, hr * 0.5, hr * 0.13, 0, TAU);
  ctx.fillStyle = '#010101';
  ctx.fill();
  ctx.strokeStyle = CHROME;
  ctx.lineWidth = 2;
  ctx.stroke();
  // a shock ring and gloss
  for (const rp of s.ripples) {
    if (rp.p !== s.pieces.indexOf(p)) continue;
    const k = rp.age / 0.4;
    if (k >= 1) continue;
    ctx.beginPath();
    ctx.arc(0, 0, hr * (0.3 + k * 0.7), 0, TAU);
    ctx.strokeStyle = `rgba(255,170,120,${((1 - k) * 0.4 * rp.v).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, hr * 0.92, Math.PI * 1.08, Math.PI * 1.42);
  ctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.04 * Math.sin(t)).toFixed(3)})`;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function drawCymbal(ctx: CanvasRenderingContext2D, s: State, p: Piece, cx: number, cy: number, rx: number, ry: number, t: number, under = false) {
  const g = p.g;
  const e = p.wob * Math.exp(-p.wobT * (p.id === 'crash' ? 1.7 : p.id === 'hat' ? 4 : 2.6));
  const ang = g.tilt + e * 0.13 * Math.sin(p.wobT * 17);
  const ryk = Math.max(3, ry * (1 + e * 0.7 * Math.sin(p.wobT * 12 + 1)));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.scale(1, ryk / rx);
  // underside edge
  ctx.beginPath();
  ctx.arc(0, (2.2 * rx) / ryk, rx, 0, TAU);
  ctx.fillStyle = '#5a3a10';
  ctx.fill();
  const bronze = ctx.createRadialGradient(-rx * 0.3, -rx * 0.3, rx * 0.05, 0, 0, rx);
  const b = Math.min(1, p.flex * 0.6 + s.flash * 0.3);
  bronze.addColorStop(0, `rgb(255,${Math.round(226 + 29 * b)},${Math.round(140 + 90 * b)})`);
  bronze.addColorStop(0.5, under ? '#b88a2e' : '#d9a640');
  bronze.addColorStop(1, '#8a5f1a');
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fillStyle = bronze;
  ctx.fill();
  // lathe grooves
  ctx.lineWidth = 1.1;
  for (let i = 2; i < 12; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(90,55,10,0.28)' : 'rgba(255,240,190,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, (rx * i) / 12, 0, TAU);
    ctx.stroke();
  }
  // shimmer: radial streaks that turn with the wobble
  if (!under && 'createConicGradient' in ctx) {
    const turn = t * 0.25 + e * 2.2 * Math.sin(p.wobT * 9) + g.x * 0.01;
    const cg = ctx.createConicGradient(turn, 0, 0);
    const a = 0.18 + Math.min(0.55, e * 0.45 + p.flex * 0.25);
    for (let i = 0; i <= 8; i++) {
      cg.addColorStop(i / 8, `rgba(255,248,220,${i % 2 ? (a * 0.15).toFixed(3) : a.toFixed(3)})`);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // bell
  const bell = ctx.createRadialGradient(-rx * 0.06, -rx * 0.08, 1, 0, 0, rx * 0.2);
  bell.addColorStop(0, '#fff2c4');
  bell.addColorStop(0.6, '#d9a640');
  bell.addColorStop(1, '#8a5f1a');
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.2, 0, TAU);
  ctx.fillStyle = bell;
  ctx.fill();
  ctx.fillStyle = '#2a2a2e';
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.035, 0, TAU);
  ctx.fill();
  // rim
  ctx.beginPath();
  ctx.arc(0, 0, rx, Math.PI * 1.05, Math.PI * 1.95);
  ctx.strokeStyle = 'rgba(255,240,200,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawStick(ctx: CanvasRenderingContext2D, st: Stick) {
  const lift = 1 - st.imp;
  const a = stickAngle(st, lift);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const tx = st.gx + ca * STICK;
  const ty = st.gy + sa * STICK;
  // a short swing streak from the last hit
  if (st.trail > 0.02) {
    const sx = lerp(tx, st.px, 0.45);
    const sy = lerp(ty, st.py, 0.45) - 18;
    const tr = ctx.createLinearGradient(sx, sy, tx, ty);
    tr.addColorStop(0, 'rgba(255,220,170,0)');
    tr.addColorStop(1, `rgba(255,220,170,${(st.trail * 0.35).toFixed(3)})`);
    ctx.strokeStyle = tr;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(lerp(sx, tx, 0.5), Math.min(sy, ty) - 22, tx, ty);
    ctx.stroke();
  }
  const nx = -sa;
  const ny = ca;
  const shaft = ctx.createLinearGradient(st.gx + nx * 4, st.gy + ny * 4, st.gx - nx * 4, st.gy - ny * 4);
  shaft.addColorStop(0, '#f7d9a4');
  shaft.addColorStop(0.5, '#d9a868');
  shaft.addColorStop(1, '#8a5a2c');
  ctx.beginPath();
  ctx.moveTo(st.gx + nx * 4, st.gy + ny * 4);
  ctx.lineTo(st.gx + ca * STICK * 0.82 + nx * 2.6, st.gy + sa * STICK * 0.82 + ny * 2.6);
  ctx.lineTo(tx + nx * 1.4, ty + ny * 1.4);
  ctx.lineTo(tx - nx * 1.4, ty - ny * 1.4);
  ctx.lineTo(st.gx + ca * STICK * 0.82 - nx * 2.6, st.gy + sa * STICK * 0.82 - ny * 2.6);
  ctx.lineTo(st.gx - nx * 4, st.gy - ny * 4);
  ctx.arc(st.gx, st.gy, 4, a + Math.PI / 2, a - Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = shaft;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,34,14,0.8)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(tx, ty, 3.6, 2.6, a, 0, TAU);
  ctx.fillStyle = '#f2d39a';
  ctx.fill();
  ctx.stroke();
  // grip tape
  ctx.strokeStyle = 'rgba(40,24,12,0.35)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(st.gx + ca * 6, st.gy + sa * 6);
  ctx.lineTo(st.gx + ca * 30, st.gy + sa * 30);
  ctx.stroke();
}

function drawKit(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const P = s.byId;
  const crash = P.crash.g;
  const ride = P.ride.g;
  const hat = P.hat.g;
  const snare = P.snare.g;
  const floor = P.floor.g;
  const kick = P.kick.g;
  // stands behind everything
  const crashBase = crash.x + 46;
  tripod(ctx, crashBase, crash.y + 96, 44);
  chromeLine(ctx, [crashBase, crash.y + 96, crash.x + 6, crash.y + 10], 4.5);
  const rideBase = ride.x - 40;
  tripod(ctx, rideBase, ride.y + 110, 44);
  chromeLine(ctx, [rideBase, ride.y + 110, ride.x - 6, ride.y + 10], 4.5);
  // tom holder on the kick
  const t1 = P.tom1.g;
  const t2 = P.tom2.g;
  chromeLine(ctx, [0, kick.y - kick.rx + 4, 0, t1.y + 30], 7);
  chromeLine(ctx, [0, t1.y + 30, t1.x + t1.rx * 0.5, t1.y + t1.depth * 0.5], 5);
  chromeLine(ctx, [0, t2.y + 30, t2.x - t2.rx * 0.5, t2.y + t2.depth * 0.5], 5);
  drawDrum(ctx, s, P.tom1, t);
  drawDrum(ctx, s, P.tom2, t);
  drawKick(ctx, s, P.kick, t);
  // floor tom legs, then the tom
  for (const [ax, fx] of [[-0.86, -1.02], [0.86, 1.02], [0.2, 0.32]]) {
    chromeLine(ctx, [floor.x + floor.rx * ax, floor.y + floor.depth * 0.42, floor.x + floor.rx * fx, FLOOR - (ax === 0.2 ? 10 : 0)], 4);
  }
  drawDrum(ctx, s, P.floor, t);
  // snare on its basket stand
  tripod(ctx, snare.x, snare.y + snare.depth + snare.ry, 38);
  chromeLine(ctx, [snare.x - snare.rx * 0.6, snare.y + snare.depth + 14, snare.x, snare.y + snare.depth + snare.ry + 4, snare.x + snare.rx * 0.6, snare.y + snare.depth + 14], 3.5);
  drawDrum(ctx, s, P.snare, t);
  // hi-hat: stand, pedal, then the pair
  tripod(ctx, hat.x, hat.y + 4, 40);
  const pd = s.hatOpen || s.shiftOpen ? -5 : 0;
  ctx.save();
  ctx.translate(s.pedal.x, s.pedal.y);
  ctx.fillStyle = '#18161b';
  ctx.beginPath();
  ctx.moveTo(-15, -4 + pd);
  ctx.lineTo(15, -4 + pd);
  ctx.lineTo(20, 8);
  ctx.lineTo(-20, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = s.hover === 'pedal' ? '#ffd27a' : CHROME;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  chromeLine(ctx, [hat.x, hat.y - s.gap - 30, hat.x, hat.y - s.gap + 2], 2.5);
  drawCymbal(ctx, s, { ...P.hat, flex: P.hat.flex * 0.3 } as Piece, hat.x, hat.y + 2, hat.rx, hat.ry, t, true);
  drawCymbal(ctx, s, P.hat, hat.x, hat.y - s.gap, hat.rx, hat.ry, t);
  ctx.fillStyle = CHROME_D;
  ctx.fillRect(hat.x - 4, hat.y - s.gap - 10, 8, 7);
  drawCymbal(ctx, s, P.crash, crash.x, crash.y, crash.rx, crash.ry, t);
  drawCymbal(ctx, s, P.ride, ride.x, ride.y, ride.rx, ride.ry, t);
  for (const g of [crash, ride]) {
    ctx.fillStyle = '#1b1a1f';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y - 4, 5, 3, 0, 0, TAU);
    ctx.fill();
  }
}

/* ---------- the drum machine ---------- */

function drawPanel(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const { x, y, w, h } = s.panel;
  ctx.save();
  ctx.fillStyle = 'rgba(16,12,18,0.88)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const running = s.groove || s.metro;
  for (const b of s.btns) {
    const on = (b.id === 'metro' && s.metro) || (b.id === 'groove' && s.groove);
    const pr = s.press[b.id] ?? 0;
    const hov = s.hover === b.id;
    const r = b.r * (1 - pr * 0.08);
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fillStyle = on ? ACCENT : hov ? '#2c2531' : '#211b25';
    ctx.fill();
    ctx.strokeStyle = on ? '#ffb199' : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = on ? '#1a0a06' : '#e9e2ea';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1.6, r * 0.12);
    ctx.lineCap = 'round';
    const u = r * 0.5;
    if (b.id === 'metro') {
      ctx.beginPath();
      ctx.moveTo(b.x - u * 0.7, b.y + u);
      ctx.lineTo(b.x + u * 0.7, b.y + u);
      ctx.lineTo(b.x + u * 0.3, b.y - u);
      ctx.lineTo(b.x - u * 0.3, b.y - u);
      ctx.closePath();
      ctx.stroke();
      const sw = s.metro ? Math.sin(s.pendulum) * 0.6 : 0.35;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + u * 0.7);
      ctx.lineTo(b.x + Math.sin(sw) * u * 1.3, b.y + u * 0.7 - Math.cos(sw) * u * 1.3);
      ctx.stroke();
    } else if (b.id === 'groove') {
      ctx.beginPath();
      if (s.groove) ctx.rect(b.x - u * 0.6, b.y - u * 0.6, u * 1.2, u * 1.2);
      else {
        ctx.moveTo(b.x - u * 0.5, b.y - u * 0.75);
        ctx.lineTo(b.x + u * 0.8, b.y);
        ctx.lineTo(b.x - u * 0.5, b.y + u * 0.75);
        ctx.closePath();
      }
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x - u * 0.6, b.y);
      ctx.lineTo(b.x + u * 0.6, b.y);
      if (b.id === 'faster') {
        ctx.moveTo(b.x, b.y - u * 0.6);
        ctx.lineTo(b.x, b.y + u * 0.6);
      }
      ctx.stroke();
    }
  }
  // beat lights and a tempo bar between the tempo buttons
  const lx0 = s.btns[1].x + s.btns[1].r + 8;
  const lx1 = s.btns[2].x - s.btns[2].r - 8;
  const lw = lx1 - lx0;
  const cy = y + h * 0.4;
  const dr = Math.min(h * 0.09, lw / 14);
  for (let i = 0; i < 4; i++) {
    const dx = lx0 + (lw * (i + 0.5)) / 4;
    const lit = running && s.beat === i ? s.beatFlash : 0;
    ctx.beginPath();
    ctx.arc(dx, cy, dr, 0, TAU);
    ctx.fillStyle = lit > 0.02 ? `rgba(255,${i === 0 ? 120 : 200},${i === 0 ? 80 : 120},${(0.35 + lit * 0.65).toFixed(3)})` : 'rgba(255,255,255,0.12)';
    ctx.fill();
    if (lit > 0.05) {
      const gl = ctx.createRadialGradient(dx, cy, 0, dx, cy, dr * 4);
      gl.addColorStop(0, `rgba(255,140,90,${(lit * 0.4).toFixed(3)})`);
      gl.addColorStop(1, 'rgba(255,140,90,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(dx - dr * 4, cy - dr * 4, dr * 8, dr * 8);
    }
  }
  const by = y + h * 0.72;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(lx0, by - 2, lw, 4, 2);
  ctx.fill();
  const q = (s.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN);
  ctx.fillStyle = '#ffb27a';
  ctx.beginPath();
  ctx.roundRect(lx0, by - 2, Math.max(4, lw * q), 4, 2);
  ctx.fill();
  ctx.restore();
  void t;
}

/* ---------- the scene ---------- */

function makePiece(id: PieceId, i: number): Piece {
  const sparkle: number[] = [];
  for (let n = 0; n < 26; n++) sparkle.push(hash(i * 97 + n * 3), hash(i * 97 + n * 3 + 1), hash(i * 97 + n * 3 + 2));
  return { id, g: WIDE[id], flex: 0, wob: 0, wobT: 9, hx: 0, hy: 0, sparkle };
}

const makeStick = (side: -1 | 1): Stick => ({ side, gx: side * 240, gy: -168, imp: 0, last: -9, tx: 0, ty: 0, px: 0, py: 0, trail: 0 });

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    touchAction: 'none',
    posterTime: 2.35,
    init: () => {
      const ids: PieceId[] = ['kick', 'snare', 'hat', 'tom1', 'tom2', 'floor', 'crash', 'ride'];
      const pieces = ids.map(makePiece);
      const byId = {} as Record<PieceId, Piece>;
      for (const p of pieces) byId[p.id] = p;
      return {
        pieces,
        byId,
        ripples: [],
        sticks: [makeStick(-1), makeStick(1)],
        sparks: new Pool(160),
        motes: new Pool(80),
        pending: [],
        kit: null,
        clock: 0,
        hatOpen: false,
        shiftOpen: false,
        gap: 3,
        bpm: 104,
        groove: false,
        metro: false,
        demo: true,
        touched: false,
        idle: 0,
        step: 0,
        nextStep: 0.4,
        stopAt: 0,
        beat: -1,
        beatFlash: 0,
        pendulum: 0,
        beams: new Float32Array(5),
        wash: 0,
        flash: 0,
        drag: null,
        lastX: 0,
        lastY: 0,
        speed: 0,
        speedT: 0,
        moveT: 0,
        hover: null,
        press: {},
        compact: false,
        k: 1,
        ox: 0,
        oy: 0,
        pedal: { x: 0, y: 0 },
        rest: [-250, -168, 236, -168],
        panel: { x: 0, y: 0, w: 0, h: 0 },
        btns: [],
        bg: null,
        w: 0,
        h: 0,
      };
    },
    resize: (s, env) => {
      layout(s, env);
      s.sticks[0].gx = s.rest[0];
      s.sticks[0].gy = s.rest[1];
      s.sticks[1].gx = s.rest[2];
      s.sticks[1].gy = s.rest[3];
    },
    update: (s, env, dt) => {
      s.clock += dt;
      if (!s.demo) {
        s.idle += dt;
        if (s.idle > 14 && !s.groove && !s.metro && !env.pointer.down) {
          s.demo = true;
          s.step = 0;
          s.nextStep = s.clock + 0.2;
        }
      }
      if (env.reducedMotion && (s.groove || s.metro) && s.stopAt && s.clock > s.stopAt) {
        s.groove = false;
        s.metro = false;
        s.stopAt = 0;
      }
      sequence(s, env);
      // land scheduled hits on the kit
      for (let i = s.pending.length - 1; i >= 0; i--) {
        const e = s.pending[i];
        if (e.at > s.clock) continue;
        s.pending.splice(i, 1);
        if (e.beat >= 0) {
          s.beat = e.beat;
          s.beatFlash = 1;
          continue;
        }
        strike(s, e.hit, e.sticks);
      }
      for (const p of s.pieces) {
        p.flex *= Math.exp(-dt * (p.id === 'kick' ? 9 : 12));
        p.wobT += dt;
      }
      for (let i = s.ripples.length - 1; i >= 0; i--) {
        s.ripples[i].age += dt;
        if (s.ripples[i].age > 0.5) s.ripples.splice(i, 1);
      }
      const open = s.hatOpen || s.shiftOpen;
      const hatHit = s.byId.hat.flex;
      s.gap = damp(s.gap, (open ? 13 : 3) - hatHit * (open ? 3 : 1.5), 18, dt);
      for (const st of s.sticks) {
        st.imp *= Math.exp(-dt * 15);
        st.trail *= Math.exp(-dt * 16);
        if (s.clock - st.last > 1.1) {
          const rx = st.side < 0 ? s.rest[0] : s.rest[2];
          const ry = (st.side < 0 ? s.rest[1] : s.rest[3]) + Math.sin(s.clock * 1.6 + st.side) * 3;
          st.gx = damp(st.gx, rx, 3, dt);
          st.gy = damp(st.gy, ry, 3, dt);
        }
      }
      for (let i = 0; i < 5; i++) s.beams[i] = damp(s.beams[i], 0, 5, dt);
      s.wash = damp(s.wash, 0, 6, dt);
      s.flash = damp(s.flash, 0, 7, dt);
      s.beatFlash = damp(s.beatFlash, 0, 7, dt);
      for (const key in s.press) s.press[key] = damp(s.press[key], 0, 14, dt);
      if (s.metro) s.pendulum = ((s.clock * s.bpm) / 60) * Math.PI;
      s.sparks.step(dt);
      s.motes.step(dt);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      const k = s.k;
      // light beams from the truss
      const ty = trussY(s) + 22;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const bx = beamX(s, i);
        const fx = s.ox + (i - 2) * 150 * k * (s.compact ? 0.8 : 1);
        const fy = s.oy + (FLOOR - 10) * k;
        const lvl = 0.22 + Math.min(1.3, s.beams[i]) + Math.sin(t * 0.7 + i * 1.9) * 0.04;
        const spread = (70 + i * 3) * k;
        const gr = ctx.createLinearGradient(bx, ty, fx, fy);
        gr.addColorStop(0, `rgba(${BEAM_RGB[i]},${(0.32 * lvl).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${BEAM_RGB[i]},${(0.05 * lvl).toFixed(3)})`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(bx - 6, ty);
        ctx.lineTo(bx + 6, ty);
        ctx.lineTo(fx + spread, fy);
        ctx.lineTo(fx - spread, fy);
        ctx.closePath();
        ctx.fill();
        // a pool of light on the riser
        const pool = ctx.createRadialGradient(fx, fy + 18 * k, 0, fx, fy + 18 * k, spread * 1.5);
        pool.addColorStop(0, `rgba(${BEAM_RGB[i]},${(0.16 * lvl).toFixed(3)})`);
        pool.addColorStop(1, `rgba(${BEAM_RGB[i]},0)`);
        ctx.fillStyle = pool;
        ctx.fillRect(fx - spread * 1.5, fy - spread * 1.5 + 18 * k, spread * 3, spread * 3);
        // the lens
        const lens = ctx.createRadialGradient(bx, ty, 0, bx, ty, 12);
        lens.addColorStop(0, `rgba(255,255,240,${Math.min(1, 0.4 + lvl * 0.5).toFixed(3)})`);
        lens.addColorStop(1, `rgba(${BEAM_RGB[i]},0)`);
        ctx.fillStyle = lens;
        ctx.fillRect(bx - 12, ty - 12, 24, 24);
      }
      // the kick pumps a warm wash across the floor
      if (s.wash > 0.01) {
        const wy = s.oy + FLOOR * k;
        const wg = ctx.createRadialGradient(s.ox, wy, 0, s.ox, wy, 520 * k);
        wg.addColorStop(0, `rgba(255,90,50,${(0.22 * s.wash).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(255,90,50,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(0, wy - 520 * k, w, 1040 * k);
      }
      ctx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.translate(s.ox, s.oy);
      ctx.scale(k, k);
      // contact shadows on the rug
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (const p of s.pieces) {
        if (p.id === 'crash' || p.id === 'ride') continue;
        const sw = p.id === 'kick' ? p.g.rx * 1.2 : p.id === 'floor' ? p.g.rx : 50;
        const sx = p.id === 'tom1' || p.id === 'tom2' ? null : p.id === 'hat' ? p.g.x : p.g.x;
        if (sx === null) continue;
        ctx.beginPath();
        ctx.ellipse(sx, FLOOR + 2, sw, 9, 0, 0, TAU);
        ctx.fill();
      }
      drawKit(ctx, s, t);
      // sparks and dust in the light
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.sparks.items) {
        if (p.life <= 0) continue;
        const a = p.life / p.max;
        ctx.strokeStyle = `rgba(255,${200 + Math.round(a * 50)},140,${a.toFixed(3)})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
      for (const p of s.motes.items) {
        if (p.life <= 0) continue;
        const a = Math.sin((p.life / p.max) * Math.PI) * 0.4;
        ctx.fillStyle = `rgba(255,230,210,${a.toFixed(3)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const st of s.sticks) drawStick(ctx, st);
      ctx.restore();

      // haze and the crash flash
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(255,244,230,${(s.flash * (env.reducedMotion ? 0.04 : 0.12)).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      if (env.interactive) drawPanel(ctx, s, t);
    },
    onPointerDown: (s, env, x, y) => {
      const b = btnAt(s, x, y);
      if (b) {
        interact(s);
        toggle(s, env, b.id);
        env.wake(1200);
        return;
      }
      const dx = toX(s, x);
      const dy = toY(s, y);
      s.lastX = x;
      s.lastY = y;
      if (onPedal(s, dx, dy)) {
        interact(s);
        setPedal(s, env, !s.hatOpen);
        s.drag = null;
        return;
      }
      const hit = pickPiece(s, dx, dy);
      s.drag = hit ? hit.p.id : null;
      if (!hit) return;
      interact(s);
      const id = hit.p.id;
      play(s, env, { id, v: velocityAt(s, hit.pos, id), pos: hit.pos, open: s.hatOpen || s.shiftOpen }, dx, dy);
    },
    onPointerMove: (s, env, x, y) => {
      const now = performance.now();
      const dist = Math.hypot(x - s.lastX, y - s.lastY);
      const dtm = Math.max(4, now - s.moveT);
      s.speed = (dist / dtm) * 1000;
      s.speedT = now;
      s.moveT = now;
      const dx = toX(s, x);
      const dy = toY(s, y);
      const b = btnAt(s, x, y);
      const hit = b ? null : pickPiece(s, dx, dy);
      s.hover = b ? b.id : onPedal(s, dx, dy) ? 'pedal' : null;
      env.canvas.style.cursor = b || hit || s.hover ? 'pointer' : 'default';
      if (env.pointer.down && !b) {
        const id = hit ? hit.p.id : null;
        // a drag across the kit plays each piece it enters; a long jump is another finger
        if (id && id !== s.drag && dist < 90) {
          interact(s);
          const v = clamp(0.42 + s.speed / 3200, 0.38, 1);
          play(s, env, { id, v, pos: hit!.pos, open: s.hatOpen || s.shiftOpen }, dx, dy);
        }
        if (dist < 90) s.drag = id;
      }
      s.lastX = x;
      s.lastY = y;
    },
    onPointerUp: (s) => {
      s.drag = null;
    },
    onPointerLeave: (s, env) => {
      s.hover = null;
      env.canvas.style.cursor = 'default';
    },
    onKey: (s, env, e, down) => {
      const code = e.code;
      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        if (s.shiftOpen === down) return false;
        const was = s.hatOpen || s.shiftOpen;
        s.shiftOpen = down;
        if (was && !(s.hatOpen || s.shiftOpen)) closeHat(s, env);
        return true;
      }
      let id: PieceId | null = null;
      let pos = 0.2;
      let open = false;
      switch (code) {
        case 'Space':
        case 'KeyB':
          id = 'kick';
          break;
        case 'KeyJ':
        case 'KeyS':
          id = 'snare';
          break;
        case 'KeyK':
        case 'KeyH':
          id = 'hat';
          pos = 0.45;
          open = e.shiftKey || s.hatOpen;
          break;
        case 'KeyD':
          id = 'tom1';
          break;
        case 'KeyF':
          id = 'tom2';
          break;
        case 'KeyG':
          id = 'floor';
          break;
        case 'KeyU':
          id = 'crash';
          pos = 0.6;
          break;
        case 'KeyI':
          id = 'ride';
          pos = 0.6;
          break;
        case 'KeyO':
          id = 'ride';
          pos = 0;
          break;
        case 'Enter':
        case 'NumpadEnter':
        case 'KeyM':
        case 'Minus':
        case 'Equal':
        case 'BracketLeft':
        case 'BracketRight':
          if (down && !e.repeat) {
            interact(s);
            const map: Record<string, Btn['id']> = {
              Enter: 'groove',
              NumpadEnter: 'groove',
              KeyM: 'metro',
              Minus: 'slower',
              BracketLeft: 'slower',
              Equal: 'faster',
              BracketRight: 'faster',
            };
            toggle(s, env, map[code]);
          }
          return true;
        default:
          return false;
      }
      if (!down || e.repeat) return true;
      interact(s);
      play(s, env, { id, v: clamp(0.84 + rand(-0.05, 0.05), 0, 1), pos, open });
      return true;
    },
    dispose: (s) => {
      if (s.bg) s.bg.width = 0;
      s.bg = null;
      s.kit = null;
      s.pending.length = 0;
    },
  });
