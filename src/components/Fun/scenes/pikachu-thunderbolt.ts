import { createCanvasScene, clamp, damp, easeOutCubic, lerp, rand, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { Pool, hash, shapeHum, startHum, stopHum } from './games-kit';
import type { Hum } from './games-kit';

/**
 * Pikachu: a grassy battle field under a bright sky, Pikachu on the near patch and a wild
 * Rattata on the far one, in flat anime colours with clean ink outlines. Tap for Quick
 * Attack (a zigzag dash with speed lines), hold to charge until the cheeks crackle, then
 * let go for Thunderbolt: branching bolts, a screen flash and a shocked foe. Swipe toward
 * the foe or press V for Volt Tackle. When its HP runs out the foe faints with swirly eyes,
 * goes back into its ball in a red flash, and a fresh one is sent out.
 */

/* ---------- palette ---------- */

const INK = '#2a1a0c';
const YEL = '#ffd93b';
const YEL_S = '#eba21c';
const RED = '#f2452f';
const BROWN = '#8c4a17';
const TIP = '#1c1310';
const PUR = '#a274d6';
const PUR_S = '#7148a8';
const CREAM = '#f6e6bd';
const CREAM_S = '#d9bf88';

type Act = 'idle' | 'charge' | 'quick' | 'bolt' | 'volt' | 'cheer';
type FoeState = 'idle' | 'faint' | 'recall' | 'gone' | 'out';

interface Lay {
  k: number;
  ox: number;
  oy: number;
  compact: boolean;
  px: number;
  py: number;
  fx: number;
  fy: number;
  ps: number;
  fs: number;
  horizon: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Bolt {
  pts: number[];
  w: number;
}

interface State {
  L: Lay;
  bg: HTMLCanvasElement | null;
  time: number;
  // pikachu
  act: Act;
  actT: number;
  prevT: number;
  charge: number;
  power: number;
  pressing: boolean;
  pressT: number;
  keyDown: boolean;
  sx: number;
  sy: number;
  stT: number;
  hp: number;
  hpShow: number;
  blink: number;
  earTwitch: number;
  hum: Hum | null;
  // foe
  foe: FoeState;
  foeT: number;
  foeHp: number;
  foeHpShow: number;
  knock: number;
  shock: number;
  hurt: number;
  // effects
  bolts: Bolt[];
  boltClock: number;
  sparks: Pool;
  dust: Pool;
  flash: number;
  flashRGB: string;
  shake: number;
  rings: { x: number; y: number; age: number; max: number; rgb: string }[];
  trail: number[];
  // flow
  touched: boolean;
  idle: number;
  demoT: number;
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  const compact = w / Math.max(1, h) < 1;
  const W = compact ? 600 : 1000;
  const H = compact ? 980 : 760;
  const k = Math.max(0.05, Math.min(w / W, h / H));
  const L = s.L;
  L.k = k;
  L.compact = compact;
  L.ox = w / 2;
  L.oy = h / 2;
  if (compact) {
    L.px = -110;
    L.py = 300;
    L.fx = 120;
    L.fy = -90;
    L.ps = 1.05;
    L.fs = 0.88;
    L.horizon = -300;
  } else {
    L.px = -230;
    L.py = 230;
    L.fx = 250;
    L.fy = -40;
    L.ps = 1.22;
    L.fs = 0.98;
    L.horizon = -170;
  }
  L.left = -L.ox / k;
  L.right = L.ox / k;
  L.top = -L.oy / k;
  L.bottom = (h - L.oy) / k;
  s.bg = buildBackground(s, env, s.bg);
}

/* ---------- audio ---------- */

function bus(env: SceneEnv | null): AudioBus | null {
  return env ? env.audio() : null;
}

function noiseBuf(ctx: AudioContext, sec: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function sweepNoise(b: AudioBus, at: number, dur: number, f0: number, f1: number, gain: number, q = 1.2, type: BiquadFilterType = 'bandpass') {
  const { ctx, out } = b;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

function voice(b: AudioBus, at: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'square', vib = 0) {
  const { ctx, out } = b;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.value = vib;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A cute two or three syllable chirp */
function chirp(env: SceneEnv | null, long = false) {
  const b = bus(env);
  if (!b) return;
  voice(b, 0, 980, 1250, 0.08, 0.06);
  voice(b, 0.1, 860, 1120, 0.11, 0.06);
  if (long) voice(b, 0.25, 1180, 720, 0.55, 0.06, 'square', 40);
}

function crackle(env: SceneEnv | null, dur: number, gain: number) {
  const b = bus(env);
  if (!b) return;
  const { ctx, out } = b;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, dur + 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  // gated bursts read as sparks
  for (let x = 0; x < dur; x += 0.018) g.gain.setValueAtTime(Math.random() < 0.55 ? gain * rand(0.3, 1) : 0.0001, t + x);
  g.gain.setValueAtTime(0.0001, t + dur);
  src.connect(hp).connect(g).connect(out);
  src.start(t);
  // a low electric buzz under it
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.linearRampToValueAtTime(52, t + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.03);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  o.connect(lp).connect(og).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function thud(env: SceneEnv | null, big: boolean) {
  const b = bus(env);
  if (!b) return;
  voice(b, 0, big ? 160 : 220, 45, big ? 0.45 : 0.18, big ? 0.28 : 0.2, 'sine');
  sweepNoise(b, 0, big ? 0.5 : 0.12, big ? 1800 : 2600, 200, big ? 0.3 : 0.18, 0.7, 'lowpass');
}

/* ---------- actions ---------- */

const busy = (s: State) => s.act !== 'idle' && s.act !== 'charge';
const targetable = (s: State) => s.foe === 'idle';

function begin(s: State, env: SceneEnv | null, act: Act) {
  if (s.hum) {
    stopHum(s.hum);
    s.hum = null;
  }
  s.act = act;
  s.actT = 0;
  s.prevT = 0;
  if (env) env.wake(act === 'volt' ? 6500 : act === 'bolt' ? 6000 : 4500);
}

function quick(s: State, env: SceneEnv | null) {
  if (busy(s)) return;
  if (!targetable(s)) return cheer(s, env);
  begin(s, env, 'quick');
  const b = bus(env);
  if (b) {
    sweepNoise(b, 0, 0.3, 500, 3800, 0.16);
    voice(b, 0, 1050, 1300, 0.07, 0.05);
  }
}

function thunderbolt(s: State, env: SceneEnv | null, power: number) {
  if (busy(s)) return;
  if (!targetable(s)) return cheer(s, env);
  s.power = clamp(power, 0.3, 1);
  begin(s, env, 'bolt');
  chirp(env, true);
}

function voltTackle(s: State, env: SceneEnv | null) {
  if (busy(s)) return;
  if (!targetable(s)) return cheer(s, env);
  begin(s, env, 'volt');
  const b = bus(env);
  if (b) {
    sweepNoise(b, 0, 0.6, 200, 2400, 0.12, 2);
    voice(b, 0, 70, 140, 0.6, 0.12, 'sawtooth');
  }
}

function cheer(s: State, env: SceneEnv | null) {
  if (busy(s)) return;
  begin(s, env, 'cheer');
  chirp(env);
}

/** The first real input ends whatever the silent demo was doing */
function takeOver(s: State) {
  if (s.touched) return;
  s.touched = true;
  s.act = 'idle';
  s.actT = 0;
  s.charge = 0;
  s.bolts.length = 0;
  s.trail.length = 0;
}

function press(s: State, env: SceneEnv) {
  takeOver(s);
  s.idle = 0;
  s.pressing = true;
  s.pressT = 0;
  env.wake(5000);
}

function release(s: State, env: SceneEnv) {
  if (!s.pressing) return;
  s.pressing = false;
  if (s.act === 'charge') {
    const c = s.charge;
    s.act = 'idle';
    if (s.hum) {
      stopHum(s.hum);
      s.hum = null;
    }
    if (c >= 0.3) thunderbolt(s, env, c);
    else quick(s, env);
  } else if (s.act === 'idle') quick(s, env);
  s.charge = 0;
}

/* ---------- positions ---------- */

interface Pose {
  x: number;
  y: number;
  sc: number;
  squash: number;
  lean: number;
  run: number;
  eyes: number; // 0 open, 1 fierce, 2 happy
  mouth: number; // 0 smile, 1 open
  cheek: number;
  aura: number;
  blue: number;
  alpha: number;
}

const pose: Pose = { x: 0, y: 0, sc: 1, squash: 0, lean: 0, run: 0, eyes: 0, mouth: 0, cheek: 0, aura: 0, blue: 0, alpha: 1 };

/** Where Pikachu strikes the foe from, in stage units */
function strikePoint(s: State) {
  const L = s.L;
  return { x: L.fx - 112 * L.fs, y: L.fy + 6 };
}

function pikaPose(s: State): Pose {
  const L = s.L;
  const p = pose;
  const t = s.actT;
  const bob = Math.sin(s.time * 5.2);
  p.x = L.px;
  p.y = L.py;
  p.sc = L.ps;
  p.squash = bob * 0.025;
  p.lean = 0;
  p.run = 0;
  p.eyes = 0;
  p.mouth = 0;
  p.cheek = 0.15 + 0.1 * Math.max(0, Math.sin(s.time * 1.7));
  p.aura = 0;
  p.blue = 0;
  p.alpha = 1;
  const sp = strikePoint(s);
  const toward = (k: number, hop: number) => {
    p.x = lerp(L.px, sp.x, k);
    p.y = lerp(L.py, sp.y, k) - hop;
    p.sc = lerp(L.ps, L.fs * 1.1, k);
  };
  switch (s.act) {
    case 'charge': {
      const c = s.charge;
      p.squash = 0.07 * c + Math.sin(s.time * 40) * 0.012 * c;
      p.x += Math.sin(s.time * 47) * 1.6 * c;
      p.lean = 0.12 * c;
      p.eyes = 1;
      p.mouth = c > 0.7 ? 1 : 0;
      p.cheek = 0.4 + c * 0.6;
      p.aura = c;
      break;
    }
    case 'quick': {
      p.eyes = 1;
      if (t < 0.32) {
        const k = easeOutCubic(t / 0.32);
        toward(k, Math.abs(Math.sin(k * Math.PI * 3)) * 26 * (1 - k));
        // the zigzag: side steps across the path
        p.x += Math.sin(k * Math.PI * 3) * 22 * (1 - k);
        p.lean = 0.35;
        p.run = 1;
        p.alpha = 0.92;
      } else if (t < 0.42) {
        toward(1, 0);
        p.squash = 0.12;
        p.lean = 0.25;
      } else if (t < 0.88) {
        const k = (t - 0.42) / 0.46;
        toward(1 - easeOutCubic(k), Math.sin(k * Math.PI) * 120);
        p.lean = -0.25 + k * 0.25;
        p.squash = -0.08 * Math.sin(k * Math.PI);
      } else {
        const k = (t - 0.88) / 0.2;
        p.squash = 0.1 * (1 - k);
      }
      break;
    }
    case 'bolt': {
      p.eyes = 1;
      p.mouth = t > 0.12 && t < 0.95 ? 1 : 0;
      p.cheek = t < 1 ? 1 : 0.4;
      if (t < 0.18) p.squash = 0.12 * (t / 0.18);
      else if (t < 0.95) {
        const k = (t - 0.18) / 0.77;
        p.y -= Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * 70 - Math.max(0, k - 0.75) * 280;
        p.squash = -0.1;
        p.lean = -0.08;
        p.aura = 1;
      } else {
        const k = Math.min(1, (t - 0.95) / 0.3);
        p.squash = 0.12 * (1 - k);
      }
      break;
    }
    case 'volt': {
      p.eyes = 1;
      if (t < 0.55) {
        const k = t / 0.55;
        p.squash = 0.06;
        p.lean = 0.3 * k;
        p.run = 1;
        p.x -= k * 20;
        p.aura = k;
        p.blue = k;
        p.cheek = 1;
      } else if (t < 0.85) {
        const k = (t - 0.55) / 0.3;
        toward(k * k, 0);
        p.x -= (1 - k) * 20;
        p.lean = 0.5;
        p.run = 1;
        p.aura = 1;
        p.blue = 1;
        p.cheek = 1;
      } else if (t < 1.0) {
        toward(1, 0);
        p.squash = 0.15;
        p.blue = 1;
        p.aura = 1;
      } else if (t < 1.7) {
        const k = (t - 1.0) / 0.7;
        toward(1 - easeOutCubic(k), Math.sin(k * Math.PI) * 150);
        p.lean = -0.6 * Math.sin(k * Math.PI);
        p.blue = Math.max(0, 1 - k * 2);
        p.eyes = k < 0.6 ? 2 : 1;
      } else {
        p.squash = 0.12 * Math.max(0, 1 - (t - 1.7) / 0.2);
      }
      break;
    }
    case 'cheer': {
      const k = t / 0.9;
      p.y -= Math.abs(Math.sin(k * Math.PI * 2)) * 46;
      p.squash = -0.06 * Math.abs(Math.sin(k * Math.PI * 2));
      p.eyes = 2;
      p.mouth = 1;
      p.cheek = 0.7;
      break;
    }
  }
  return p;
}

/* ---------- effects ---------- */

function hitFoe(s: State, env: SceneEnv | null, dmg: number, push: number) {
  s.foeHp = Math.max(0, s.foeHp - dmg);
  s.knock = Math.max(s.knock, push);
  s.hurt = 1;
  if (s.foeHp <= 0) {
    s.foe = 'faint';
    s.foeT = 0;
    const b = bus(env);
    if (b) voice(b, 0.35, 760, 180, 0.9, 0.07, 'triangle', 18);
    if (env) env.wake(8000);
  }
}

function burst(s: State, x: number, y: number, n: number, rgb: number, speed: number) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(0.3, 1) * speed;
    s.sparks.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.5), rand(2, 4), rgb, 0, 3);
  }
}

function ring(s: State, x: number, y: number, max: number, rgb: string) {
  s.rings.push({ x, y, age: 0, max, rgb });
  if (s.rings.length > 8) s.rings.shift();
}

function dustAt(s: State, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    s.dust.spawn(x + rand(-20, 20), y + rand(-4, 4), rand(-90, 90), rand(-70, -10), rand(0.4, 0.8), rand(6, 13), 0, 120, 2);
  }
}

/** A jagged bolt from a to b, with a branch or two */
function makeBolt(out: Bolt[], ax: number, ay: number, bx: number, by: number, w: number, depth: number) {
  const pts = [ax, ay];
  const n = 9;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const off = rand(-1, 1) * len * 0.09 * Math.sin(k * Math.PI);
    pts.push(ax + dx * k + nx * off, ay + dy * k + ny * off);
  }
  pts.push(bx, by);
  out.push({ pts, w });
  if (depth > 0) {
    for (let b = 0; b < 2; b++) {
      const i = 2 + Math.floor(Math.random() * (n - 4));
      const sx = pts[i * 2];
      const sy = pts[i * 2 + 1];
      const a = Math.atan2(dy, dx) + rand(-0.9, 0.9);
      const l = len * rand(0.15, 0.3);
      makeBolt(out, sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, w * 0.5, depth - 1);
    }
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
  const L = s.L;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hy = L.oy + L.horizon * L.k;
  const sky = g.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#3d9cf0');
  sky.addColorStop(0.7, '#8fd0ff');
  sky.addColorStop(1, '#d8f1ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hy + 2);
  g.translate(L.ox, L.oy);
  g.scale(L.k, L.k);
  const k = L.k;
  const lw = 2.2;
  // far mountains, flat with a lighter face
  const hz = L.horizon;
  g.lineJoin = 'round';
  for (const [col, shade, base, amp, seed] of [
    ['#9ec8e6', '#86b4d8', 0, 150, 3],
    ['#7fbf8a', '#69a874', 10, 80, 9],
  ] as const) {
    g.beginPath();
    g.moveTo(L.left - 20, hz + base);
    let x = L.left - 20;
    let i = 0;
    while (x < L.right + 40) {
      const pw = 120 + hash(seed + i) * 160;
      const ph = amp * (0.5 + hash(seed + i + 50) * 0.6);
      g.lineTo(x + pw / 2, hz + base - ph);
      g.lineTo(x + pw, hz + base - ph * 0.25);
      x += pw;
      i++;
    }
    g.lineTo(L.right + 40, hz + base + 4);
    g.lineTo(L.left - 20, hz + base + 4);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = shade;
    g.lineWidth = lw;
    g.stroke();
  }
  // a tree line on the horizon
  for (let x = L.left - 30, i = 0; x < L.right + 30; i++) {
    const r = 26 + hash(i * 7 + 1) * 22;
    const ty = hz + 18 - r * 0.6;
    g.beginPath();
    g.arc(x, ty, r, 0, TAU);
    g.fillStyle = i % 2 ? '#3f9a4a' : '#4aa956';
    g.fill();
    g.strokeStyle = '#2d6e35';
    g.lineWidth = lw;
    g.stroke();
    x += r * 1.3;
  }
  // the field
  const field = g.createLinearGradient(0, hz + 10, 0, L.bottom);
  field.addColorStop(0, '#6cc35a');
  field.addColorStop(1, '#4fae46');
  g.fillStyle = field;
  g.fillRect(L.left - 10, hz + 10, L.right - L.left + 20, L.bottom - hz);
  g.strokeStyle = '#3f8f3a';
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(L.left - 10, hz + 10);
  g.lineTo(L.right + 10, hz + 10);
  g.stroke();
  // mowed stripes
  for (let i = 0; i < 10; i++) {
    const y0 = hz + 10 + Math.pow(i / 10, 1.6) * (L.bottom - hz);
    const y1 = hz + 10 + Math.pow((i + 0.5) / 10, 1.6) * (L.bottom - hz);
    g.fillStyle = 'rgba(255,255,220,0.06)';
    g.fillRect(L.left - 10, y0, L.right - L.left + 20, y1 - y0);
  }
  // the two battle patches
  for (const [x, y, sc] of [
    [L.fx, L.fy, L.fs],
    [L.px, L.py, L.ps],
  ]) {
    g.beginPath();
    g.ellipse(x, y + 6 * sc, 150 * sc, 38 * sc, 0, 0, TAU);
    g.fillStyle = '#c9b77a';
    g.fill();
    g.strokeStyle = '#8d7c45';
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.ellipse(x - 10 * sc, y + 2 * sc, 118 * sc, 26 * sc, 0, 0, TAU);
    g.fillStyle = '#dccb8f';
    g.fill();
  }
  // tufts and flowers scattered over the field
  for (let i = 0; i < 70; i++) {
    const x = L.left + hash(i * 3.1) * (L.right - L.left);
    const yk = hash(i * 5.7 + 2);
    const y = hz + 30 + yk * yk * (L.bottom - hz - 30);
    const sc = 0.5 + ((y - hz) / (L.bottom - hz)) * 1.1;
    const near = (px: number, py: number, r: number) => Math.hypot((x - px) / r, (y - py) / (r * 0.3)) < 1;
    if (near(L.px, L.py, 170 * L.ps) || near(L.fx, L.fy, 170 * L.fs)) continue;
    g.strokeStyle = '#3c8c36';
    g.lineWidth = 2.2 * sc;
    g.lineCap = 'round';
    g.beginPath();
    for (const a of [-0.5, 0, 0.45]) {
      g.moveTo(x, y);
      g.quadraticCurveTo(x + a * 10 * sc, y - 8 * sc, x + a * 16 * sc, y - 16 * sc);
    }
    g.stroke();
    if (i % 6 === 0) {
      g.fillStyle = i % 12 ? '#fff6f0' : '#ffd84d';
      g.beginPath();
      g.arc(x + 6 * sc, y - 3 * sc, 3.2 * sc, 0, TAU);
      g.fill();
    }
  }
  void k;
  return c;
}

/* ---------- drawing helpers ---------- */

function cel(ctx: CanvasRenderingContext2D, trace: () => void, base: string, shade: string, lx = 5, ly = -5) {
  ctx.save();
  ctx.beginPath();
  trace();
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.clip();
  ctx.translate(lx, ly);
  ctx.beginPath();
  trace();
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
}

function ink(ctx: CanvasRenderingContext2D, trace: () => void, w: number, col = INK) {
  ctx.beginPath();
  trace();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** One layered group: outlines first so overlaps inside the group merge into one silhouette */
function group(ctx: CanvasRenderingContext2D, parts: [() => void, string, string][], ow: number, mono: string | null) {
  for (const [tr] of parts) ink(ctx, tr, ow * 2, mono ? mono : INK);
  for (const [tr, base, shade] of parts) {
    if (mono) {
      ctx.beginPath();
      tr();
      ctx.fillStyle = mono;
      ctx.fill();
    } else cel(ctx, tr, base, shade);
  }
}

/* ---------- Pikachu ---------- */

// the lightning tail as a polygon, from the base on the back out to the flag
const TAIL = [
  0, 4, -14, -2, -10, -14, -34, -22, -28, -36, -66, -46, -56, -64, -104, -84, -84, -132, -46, -96, -38, -84, -10, -78, -16, -60, 8, -48, 6,
  -34, 6, -8,
];

function tailTrace(ctx: CanvasRenderingContext2D) {
  ctx.moveTo(TAIL[0], TAIL[1]);
  for (let i = 2; i < TAIL.length; i += 2) ctx.lineTo(TAIL[i], TAIL[i + 1]);
  ctx.closePath();
}

function drawPika(ctx: CanvasRenderingContext2D, s: State, p: Pose, mono: string | null = null) {
  const t = s.time;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.sc * (1 + p.squash * 0.6), p.sc * (1 - p.squash));
  ctx.rotate(p.lean);
  const ow = 2.6;
  const run = p.run ? Math.sin(t * 34) : 0;
  const wag = Math.sin(t * 3.1) * 0.08 + (s.act === 'charge' ? Math.sin(t * 30) * 0.05 : 0);
  const earA = Math.sin(t * 2.3) * 0.04 + (s.earTwitch > 0 ? Math.sin(s.earTwitch * 30) * 0.12 : 0);
  const blink = s.blink > 0 && p.eyes === 0;

  // back layer: tail, far ear, far foot
  const tail = () => {
    ctx.save();
    ctx.translate(-30, -32);
    ctx.rotate(wag - 0.05);
    tailTrace(ctx);
    ctx.restore();
  };
  const farEar = () => {
    ctx.save();
    ctx.translate(-10, -136);
    ctx.rotate(-0.42 + earA);
    ctx.moveTo(-14, 6);
    ctx.quadraticCurveTo(-18, -36, 0, -76);
    ctx.quadraticCurveTo(16, -36, 12, 4);
    ctx.closePath();
    ctx.restore();
  };
  const farFoot = () => ctx.ellipse(-16 - run * 6, -5, 15, 7, 0, 0, TAU);
  group(
    ctx,
    [
      [tail, YEL, YEL_S],
      [farEar, YEL, YEL_S],
      [farFoot, YEL, YEL_S],
    ],
    ow,
    mono
  );
  if (!mono) {
    // brown base of the tail and the black ear tip
    ctx.save();
    ctx.beginPath();
    tail();
    ctx.clip();
    ctx.fillStyle = BROWN;
    ctx.fillRect(-50, -40, 44, 22);
    ctx.restore();
    earTip(ctx, farEar, -10, -136, -0.42 + earA);
  }

  // front layer: body, head, near ear, near foot, arm
  const body = () => {
    ctx.moveTo(-30, -6);
    ctx.bezierCurveTo(-46, -34, -40, -74, -12, -86);
    ctx.bezierCurveTo(12, -94, 36, -80, 38, -52);
    ctx.bezierCurveTo(40, -24, 30, -4, 10, -2);
    ctx.closePath();
  };
  const head = () => ctx.ellipse(10, -115, 47, 39, -0.06, 0, TAU);
  const nearEar = () => {
    ctx.save();
    ctx.translate(30, -142);
    ctx.rotate(0.3 - earA);
    ctx.moveTo(-14, 6);
    ctx.quadraticCurveTo(-16, -38, 2, -80);
    ctx.quadraticCurveTo(18, -38, 14, 4);
    ctx.closePath();
    ctx.restore();
  };
  const nearFoot = () => ctx.ellipse(22 + run * 7, -4, 16, 8, 0.05, 0, TAU);
  const armY = p.run ? -58 + run * 4 : -60;
  const arm = () => ctx.ellipse(30, armY, 7, 13, s.act === 'cheer' ? -2.4 : 0.75 + run * 0.3, 0, TAU);
  group(
    ctx,
    [
      [nearEar, YEL, YEL_S],
      [body, YEL, YEL_S],
      [nearFoot, YEL, YEL_S],
      [head, YEL, YEL_S],
    ],
    ow,
    mono
  );
  if (mono) {
    ctx.restore();
    return;
  }
  earTip(ctx, nearEar, 30, -142, 0.3 - earA);
  // back stripes
  ctx.save();
  ctx.beginPath();
  body();
  ctx.clip();
  ctx.strokeStyle = BROWN;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const y of [-62, -46]) {
    ctx.beginPath();
    ctx.moveTo(-50, y - 4);
    ctx.quadraticCurveTo(-36, y, -26, y + 4);
    ctx.stroke();
  }
  ctx.restore();
  group(ctx, [[arm, YEL, YEL_S]], ow * 0.9, null);

  // face
  const eye = (x: number, y: number, r: number) => {
    if (blink || p.eyes === 2) {
      ctx.beginPath();
      if (p.eyes === 2) {
        ctx.moveTo(x - r, y + 2);
        ctx.quadraticCurveTo(x, y - r * 1.3, x + r, y + 2);
      } else {
        ctx.moveTo(x - r, y);
        ctx.quadraticCurveTo(x, y + r * 0.5, x + r, y);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.86, r, 0, 0, TAU);
    ctx.fillStyle = '#1a1210';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.22, y - r * 0.38, r * 0.38, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (p.eyes === 1) {
      // a determined brow line cutting the top of the eye
      ctx.beginPath();
      ctx.moveTo(x - r * 1.2, y - r * 1.15);
      ctx.lineTo(x + r * 1.1, y - r * 0.45);
      ctx.lineTo(x + r * 1.1, y - r * 1.6);
      ctx.lineTo(x - r * 1.2, y - r * 1.6);
      ctx.closePath();
      ctx.fillStyle = YEL;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 1.0, y - r * 1.08);
      ctx.lineTo(x + r * 1.0, y - r * 0.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  };
  eye(-4, -122, 8);
  eye(32, -120, 9.5);
  // cheeks, glowing with charge
  const cheekGlow = p.cheek;
  for (const [cx, cy, r] of [
    [-18, -98, 9],
    [44, -96, 10.5],
  ]) {
    if (cheekGlow > 0.3) {
      const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
      gl.addColorStop(0, `rgba(255,240,140,${(cheekGlow * 0.55).toFixed(3)})`);
      gl.addColorStop(1, 'rgba(255,240,140,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = cheekGlow > 0.8 && Math.sin(t * 50) > 0 ? '#ff7a5c' : RED;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  // nose and mouth
  ctx.beginPath();
  ctx.ellipse(20, -110, 2.4, 1.6, 0, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  if (p.mouth) {
    ctx.beginPath();
    ctx.moveTo(10, -102);
    ctx.quadraticCurveTo(18, -84, 28, -102);
    ctx.quadraticCurveTo(19, -98, 10, -102);
    ctx.fillStyle = '#7a1f1a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(19, -93, 5, 3, 0, 0, TAU);
    ctx.fillStyle = '#ff8a7a';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(12, -103);
    ctx.quadraticCurveTo(15, -99, 19, -102);
    ctx.quadraticCurveTo(23, -99, 26, -103);
    ctx.stroke();
  }
  ctx.restore();
}

function earTip(ctx: CanvasRenderingContext2D, trace: () => void, x: number, y: number, a: number) {
  ctx.save();
  ctx.beginPath();
  trace();
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = TIP;
  ctx.beginPath();
  ctx.moveTo(-30, -50);
  ctx.quadraticCurveTo(2, -44, 30, -54);
  ctx.lineTo(30, -100);
  ctx.lineTo(-30, -100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------- the wild Rattata ---------- */

function drawFoe(ctx: CanvasRenderingContext2D, s: State, x: number, y: number, sc: number, rot: number, mono: string | null) {
  const t = s.time;
  const fainted = s.foe === 'faint' || s.foe === 'recall';
  const shockOn = s.shock > 0 && Math.sin(t * 60) > 0;
  const fill = mono ?? (shockOn ? '#1a1f3a' : null);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.rotate(rot);
  const ow = 2.6;
  const breathe = fainted ? 0 : Math.sin(t * 4.4) * 1.5;
  const swish = Math.sin(t * 2.7) * 0.15;
  const tail = () => {
    ctx.moveTo(40, -22);
    ctx.bezierCurveTo(80, -20, 92, -70, 70, -84 + swish * 20);
    ctx.bezierCurveTo(56, -92, 46, -74, 58, -66);
  };
  // the tail is a thick stroke
  ctx.lineCap = 'round';
  ctx.beginPath();
  tail();
  ctx.strokeStyle = shockOn && !mono ? '#bfe6ff' : mono ?? INK;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = fill ?? PUR;
  ctx.lineWidth = 5;
  ctx.stroke();

  const body = () => ctx.ellipse(8, -32 - breathe * 0.5, 42, 28 + breathe, 0, 0, TAU);
  const head = () => ctx.arc(-30, -58 - breathe, 27, 0, TAU);
  const ear1 = () => ctx.ellipse(-14, -88 - breathe, 15, 19, 0.3, 0, TAU);
  const ear2 = () => ctx.ellipse(-44, -86 - breathe, 14, 18, -0.3, 0, TAU);
  const feet = () => {
    ctx.ellipse(-12, -3, 11, 6, 0, 0, TAU);
    ctx.moveTo(42, -3);
    ctx.ellipse(30, -3, 12, 6, 0, 0, TAU);
  };
  const muzzle = () => ctx.ellipse(-50, -48 - breathe, 15, 12, 0, 0, TAU);
  const outlineCol = shockOn && !mono ? '#bfe6ff' : null;
  const parts: [() => void, string, string][] = [
    [ear2, PUR, PUR_S],
    [ear1, PUR, PUR_S],
    [feet, CREAM, CREAM_S],
    [body, PUR, PUR_S],
    [head, PUR, PUR_S],
    [muzzle, CREAM, CREAM_S],
  ];
  if (fill) {
    for (const [tr] of parts) ink(ctx, tr, ow * 2, outlineCol ?? fill);
    for (const [tr] of parts) {
      ctx.beginPath();
      tr();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (shockOn && !mono) {
      // the cartoon x-ray: a pale skeleton flashing through
      ctx.strokeStyle = '#e9f6ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-30, -58, 14, 0, TAU);
      ctx.moveTo(-18, -46);
      ctx.lineTo(40, -32);
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(-4 + i * 12, -46 + i * 3);
        ctx.lineTo(-4 + i * 12, -20 + i * 1);
      }
      ctx.moveTo(-12, -24);
      ctx.lineTo(-12, -4);
      ctx.moveTo(30, -26);
      ctx.lineTo(30, -4);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  group(ctx, parts, ow, null);
  // inner ears and belly
  ctx.fillStyle = '#e9b7d8';
  ctx.beginPath();
  ctx.ellipse(-14, -86 - breathe, 8, 11, 0.3, 0, TAU);
  ctx.ellipse(-44, -84 - breathe, 7, 10, -0.3, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  body();
  ctx.clip();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(-8, -18, 26, 20, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // face
  const by = -breathe;
  ctx.fillStyle = '#ff9fb5';
  ctx.beginPath();
  ctx.ellipse(-63, -52 + by, 4.5, 3.6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // buck teeth
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.rect(-58, -38 + by, 9, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-53.5, -38 + by);
  ctx.lineTo(-53.5, -29 + by);
  ctx.stroke();
  // whiskers
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const a of [-0.35, 0, 0.35]) {
    ctx.moveTo(-58, -46 + by);
    ctx.lineTo(-58 - Math.cos(a) * 22, -46 + by + Math.sin(a) * 18);
  }
  ctx.stroke();
  // the eye
  const ex = -36;
  const ey = -64 + by;
  if (fainted) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = i * 0.55 + t * 8;
      const r = i * 0.42;
      if (i) ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
      else ctx.moveTo(ex, ey);
    }
    ctx.stroke();
  } else {
    const squint = s.hurt > 0.3;
    if (squint) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ex - 8, ey - 6);
      ctx.lineTo(ex + 6, ey);
      ctx.lineTo(ex - 8, ey + 6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 9, 10, 0, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ex - 2, ey + 1, 6, 7.5, 0, 0, TAU);
      ctx.fillStyle = '#d4232f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - 3, ey + 1, 3, 0, TAU);
      ctx.fillStyle = '#2a0a0e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - 0.5, ey - 2.5, 2, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, open: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = INK;
  // bottom half
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#f4f4f4';
  ctx.fill();
  ctx.stroke();
  // top half hinges open at the back
  ctx.save();
  ctx.translate(r, 0);
  ctx.rotate(open * 1.1);
  ctx.translate(-r, 0);
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, TAU);
  ctx.closePath();
  ctx.fillStyle = '#e8332b';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.5, r * 0.18, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.restore();
  if (open < 0.05) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- HP plates (bars only) ---------- */

function hpColor(f: number) {
  return f > 0.5 ? '#3fd16a' : f > 0.2 ? '#f5c932' : '#ef4a3a';
}

function drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, icon: 'pika' | 'foe') {
  const h = w * 0.2;
  ctx.save();
  ctx.fillStyle = 'rgba(255,252,236,0.94)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.45);
  ctx.fill();
  ctx.stroke();
  // a tiny face badge
  const r = h * 0.32;
  const bx = x + h * 0.5;
  const by = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, TAU);
  ctx.fillStyle = icon === 'pika' ? YEL : PUR;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = icon === 'pika' ? RED : CREAM;
  ctx.beginPath();
  ctx.arc(bx + r * 0.35, by + r * 0.25, r * 0.3, 0, TAU);
  ctx.fill();
  const bx0 = x + h * 1.05;
  const bw = w - h * 1.45;
  const bh = h * 0.32;
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.roundRect(bx0, by - bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = hpColor(f);
  if (f > 0.005) {
    ctx.beginPath();
    ctx.roundRect(bx0 + 1.5, by - bh / 2 + 1.5, Math.max(bh - 3, (bw - 3) * f), bh - 3, (bh - 3) / 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- the scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    touchAction: 'none',
    posterTime: 2.12,
    init: () => ({
      L: { k: 1, ox: 0, oy: 0, compact: false, px: 0, py: 0, fx: 0, fy: 0, ps: 1, fs: 1, horizon: 0, top: 0, bottom: 0, left: 0, right: 0 },
      bg: null,
      time: 0,
      act: 'idle',
      actT: 0,
      prevT: 0,
      charge: 0,
      power: 1,
      pressing: false,
      pressT: 0,
      keyDown: false,
      sx: 0,
      sy: 0,
      stT: 0,
      hp: 100,
      hpShow: 100,
      blink: 0,
      earTwitch: 0,
      hum: null,
      foe: 'idle',
      foeT: 0,
      foeHp: 100,
      foeHpShow: 100,
      knock: 0,
      shock: 0,
      hurt: 0,
      bolts: [],
      boltClock: 0,
      sparks: new Pool(220),
      dust: new Pool(70),
      flash: 0,
      flashRGB: '255,250,210',
      shake: 0,
      rings: [],
      trail: [],
      touched: false,
      idle: 0,
      demoT: 0,
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt) => {
      s.time += dt;
      const L = s.L;
      const live = s.touched ? env : null;
      // the idle demo: charge, Thunderbolt, then a Quick Attack, silently
      if (!s.touched) {
        s.demoT += dt;
        const c = s.demoT % 7;
        if (c > 0.5 && c < 1.9 && s.act === 'idle' && targetable(s)) {
          s.act = 'charge';
          s.charge = 0;
        }
        if (s.act === 'charge' && c >= 1.9) {
          s.act = 'idle';
          thunderbolt(s, null, s.charge);
        }
        if (c > 4.6 && c < 4.7 && s.act === 'idle') quick(s, null);
      } else if (!s.pressing && s.act === 'idle') {
        s.idle += dt;
        if (s.idle > 15) {
          s.touched = false;
          s.demoT = 0;
        }
      }
      // holding turns into a charge
      if (s.pressing) {
        s.pressT += dt;
        if (s.act === 'idle' && s.pressT > 0.16) {
          s.act = 'charge';
          s.charge = 0;
          const b = bus(live);
          if (b && !s.hum) s.hum = startHum(b, { type: 'sawtooth', freq: 90, ratio: 2.01, noise: 0.4, filter: 500, q: 4, gain: 0.05 });
        }
      }
      if (s.act === 'charge') {
        s.charge = Math.min(1, s.charge + dt / 1.15);
        if (s.hum) shapeHum(s.hum, 90 + s.charge * 140, 500 + s.charge * 3200, 0.05 + s.charge * 0.06, 2.01);
        if (!env.reducedMotion || Math.random() < 0.3) {
          const p = pikaPose(s);
          const n = s.charge > 0.5 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const cx = p.x + (side < 0 ? -26 : 54) * p.sc;
            const cy = p.y - 94 * p.sc;
            s.sparks.spawn(cx, cy, side * rand(40, 200) * s.charge, rand(-60, 90) * s.charge, rand(0.08, 0.2), rand(6, 14) * s.charge + 4, 2, 0, 0);
          }
        }
      }
      // actions
      if (s.act !== 'idle' && s.act !== 'charge') {
        s.prevT = s.actT;
        s.actT += dt;
        const cross = (at: number) => s.prevT < at && s.actT >= at;
        const sp = strikePoint(s);
        const fx = L.fx;
        const fy = L.fy - 40 * L.fs;
        if (s.act === 'quick') {
          if (s.actT < 0.32) {
            const p = pikaPose(s);
            s.trail.push(p.x, p.y - 60 * p.sc);
            if (s.trail.length > 16) s.trail.splice(0, 2);
          }
          if (cross(0.32)) {
            hitFoe(s, live, 14, 1);
            burst(s, sp.x + 40 * L.fs, fy, 14, 1, 420);
            ring(s, sp.x + 40 * L.fs, fy, 70, '255,255,255');
            s.shake = 0.35;
            thud(live, false);
          }
          if (s.actT > 1.08) s.act = 'idle';
        } else if (s.act === 'bolt') {
          if (s.actT > 0.18 && s.actT < 0.95) {
            s.boltClock -= dt;
            if (s.boltClock <= 0) {
              s.boltClock = 0.05;
              s.bolts.length = 0;
              const p = pikaPose(s);
              const hx = p.x + 12 * p.sc;
              const hy = p.y - 110 * p.sc;
              const n = 2 + Math.round(s.power * 2);
              for (let i = 0; i < n; i++) makeBolt(s.bolts, hx + rand(-20, 20), hy + rand(-20, 20), fx + rand(-30, 30), fy + rand(-30, 20), 9 * (0.6 + s.power * 0.5), 2);
              // a few bolts crackling out of the body, and one from the sky
              for (let i = 0; i < 3; i++) {
                const a = rand(0, TAU);
                makeBolt(s.bolts, hx, hy + 40, hx + Math.cos(a) * 120, hy + 40 + Math.sin(a) * 90, 4, 0);
              }
              if (s.power > 0.7) makeBolt(s.bolts, fx + rand(-80, 80), L.top, fx, fy, 8, 1);
            }
          } else s.bolts.length = 0;
          if (cross(0.24)) {
            s.flash = env.reducedMotion ? 0.2 : 0.7;
            s.flashRGB = '255,250,200';
            s.shock = 0.75;
            s.shake = 0.6 * s.power;
            ring(s, fx, fy, 160, '255,240,120');
            crackle(live, 0.75, 0.22 + s.power * 0.1);
            const b = bus(live);
            if (b) voice(b, 0, 200, 60, 0.4, 0.2, 'sawtooth');
          }
          if (s.actT > 0.24 && s.actT < 0.95 && Math.random() < 0.6) burst(s, fx + rand(-30, 30), fy + rand(-30, 20), 2, 2, 260);
          if (cross(0.9)) hitFoe(s, live, Math.round(22 + s.power * 28), 0.6);
          if (s.actT > 1.3) s.act = 'idle';
        } else if (s.act === 'volt') {
          if (s.actT < 0.85) {
            const p = pikaPose(s);
            if (s.actT > 0.55) {
              s.trail.push(p.x, p.y - 60 * p.sc);
              if (s.trail.length > 20) s.trail.splice(0, 2);
            }
            if (Math.random() < 0.8) s.sparks.spawn(p.x + rand(-60, 60) * p.sc, p.y - rand(10, 150) * p.sc, rand(-80, 80), rand(-80, 80), 0.12, rand(8, 16), 3, 0, 0);
            if (s.actT > 0.55 && Math.random() < 0.5) dustAt(s, p.x - 30, p.y, 1);
          }
          if (cross(0.85)) {
            s.flash = env.reducedMotion ? 0.25 : 0.85;
            s.flashRGB = '220,240,255';
            s.shake = 1;
            s.shock = 0.4;
            ring(s, sp.x + 40 * L.fs, fy, 220, '190,225,255');
            ring(s, sp.x + 40 * L.fs, fy, 130, '255,255,255');
            burst(s, sp.x + 40 * L.fs, fy, 36, 3, 700);
            dustAt(s, L.fx, L.fy, 10);
            thud(live, true);
            crackle(live, 0.4, 0.3);
            hitFoe(s, live, 48, 1.6);
          }
          if (cross(1.0)) s.hp = Math.max(20, s.hp - 12);
          if (cross(1.7)) dustAt(s, L.px, L.py, 6);
          if (s.actT > 1.9) s.act = 'idle';
        } else if (s.act === 'cheer') {
          if (s.actT > 0.9) s.act = 'idle';
        }
        if (s.act === 'idle' || (s.act === 'quick' && s.actT > 0.32) || (s.act === 'volt' && s.actT > 0.85)) {
          if (s.trail.length) s.trail.splice(0, Math.min(s.trail.length, 4));
        }
      }
      // the foe
      s.foeT += dt;
      if (s.foe === 'faint' && s.foeT > 1.4) {
        s.foe = 'recall';
        s.foeT = 0;
        const b = bus(live);
        if (b) {
          voice(b, 0, 300, 1300, 0.6, 0.05, 'sine', 30);
          sweepNoise(b, 0, 0.6, 600, 4000, 0.06);
        }
        if (s.act === 'idle') cheer(s, null);
      } else if (s.foe === 'recall' && s.foeT > 1.4) {
        s.foe = 'gone';
        s.foeT = 0;
      } else if (s.foe === 'gone' && s.foeT > 1.1) {
        s.foe = 'out';
        s.foeT = 0;
      } else if (s.foe === 'out') {
        if (s.foeT > 0.5 && s.foeT - dt <= 0.5) {
          s.foeHp = 100;
          s.hp = 100;
          ring(s, L.fx, L.fy - 40 * L.fs, 120, '255,255,255');
          burst(s, L.fx, L.fy - 40 * L.fs, 18, 1, 360);
          const b = bus(live);
          if (b) {
            sweepNoise(b, 0, 0.25, 4000, 900, 0.12);
            voice(b, 0, 620, 1500, 0.18, 0.05, 'triangle');
          }
        }
        if (s.foeT > 1.0) {
          s.foe = 'idle';
          s.foeT = 0;
          s.foeHpShow = s.foeHp;
        }
      }
      s.knock = damp(s.knock, 0, 5, dt);
      s.hurt = Math.max(0, s.hurt - dt * 2.2);
      s.shock = Math.max(0, s.shock - dt);
      s.flash = damp(s.flash, 0, 8, dt);
      s.shake = Math.max(0, s.shake - dt * 2.4);
      s.foeHpShow = damp(s.foeHpShow, s.foeHp, 5, dt);
      s.hpShow = damp(s.hpShow, s.hp, 5, dt);
      for (let i = s.rings.length - 1; i >= 0; i--) {
        s.rings[i].age += dt;
        if (s.rings[i].age > 0.45) s.rings.splice(i, 1);
      }
      // blinks and ear twitches
      s.blink -= dt;
      if (s.blink < -rand(2.2, 4.5)) s.blink = 0.12;
      s.earTwitch -= dt;
      if (s.earTwitch < -rand(3, 6)) s.earTwitch = 0.25;
      s.sparks.step(dt);
      s.dust.step(dt);
    },
    draw: (s, env) => {
      const { ctx, w, h } = env;
      const L = s.L;
      const t = s.time;
      ctx.save();
      if (s.shake > 0 && !env.reducedMotion) {
        const a = s.shake * s.shake * 9;
        ctx.translate(rand(-a, a), rand(-a, a));
      }
      if (s.bg) ctx.drawImage(s.bg, -12, -12, w + 24, h + 24);
      ctx.save();
      ctx.translate(L.ox, L.oy);
      ctx.scale(L.k, L.k);
      // drifting clouds
      for (let i = 0; i < 4; i++) {
        const span = L.right - L.left + 400;
        const cx = L.left - 200 + ((hash(i * 9) * span + t * (6 + i * 3)) % span);
        const cy = L.top + 60 + hash(i * 4 + 1) * Math.max(40, L.horizon - L.top - 220);
        const r = 30 + hash(i * 2 + 3) * 22;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 2.2, r * 0.7, 0, 0, TAU);
        ctx.ellipse(cx - r * 0.8, cy - r * 0.35, r * 0.9, r * 0.8, 0, 0, TAU);
        ctx.ellipse(cx + r * 0.5, cy - r * 0.5, r * 1.1, r, 0, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.35, r * 2, r * 0.3, 0, 0, TAU);
        ctx.fillStyle = '#d7ecfb';
        ctx.fill();
      }

      // the foe and its shadow
      const fScale = L.fs;
      const kx = s.knock * 40;
      let foeRot = Math.sin(s.knock * 3) * 0.1 * s.knock;
      let foeSc = fScale;
      let foeY = L.fy;
      let mono: string | null = null;
      let drawFoeNow = s.foe === 'idle' || s.foe === 'faint' || s.foe === 'recall';
      if (s.foe === 'idle') foeY -= Math.abs(Math.sin(t * 3.2)) * 4;
      if (s.foe === 'faint') {
        const k = Math.min(1, s.foeT / 0.5);
        foeRot = easeOutCubic(k) * 1.3;
        foeY += k * 10;
      }
      const ballX = L.fx + 120 * L.fs;
      const ballY = L.fy - 170 * L.fs;
      if (s.foe === 'recall') {
        foeRot = 1.3;
        mono = '#ff3b3b';
        const k = clamp((s.foeT - 0.35) / 0.4, 0, 1);
        foeSc = fScale * (1 - k);
        if (k >= 1) drawFoeNow = false;
      }
      if (s.foe === 'out') {
        const k = clamp((s.foeT - 0.5) / 0.3, 0, 1);
        foeSc = fScale * (k < 1 ? k * 1.15 : 1);
        drawFoeNow = k > 0;
        if (k < 1) mono = '#ffffff';
      }
      ctx.fillStyle = 'rgba(30,70,20,0.28)';
      if (drawFoeNow) {
        ctx.beginPath();
        ctx.ellipse(L.fx + kx, L.fy + 2, 62 * foeSc, 12 * foeSc, 0, 0, TAU);
        ctx.fill();
      }
      if (drawFoeNow) {
        const fxp = L.fx + kx + (s.foe === 'recall' ? (ballX - L.fx) * clamp((s.foeT - 0.35) / 0.4, 0, 1) : 0);
        const fyp = foeY + (s.foe === 'recall' ? (ballY - L.fy) * clamp((s.foeT - 0.35) / 0.4, 0, 1) : 0);
        if (s.foe === 'recall') {
          // the red return beam from the ball
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,60,50,0.6)';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ballX, ballY);
          ctx.lineTo(fxp - 20 * foeSc, fyp - 30 * foeSc);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,220,210,0.9)';
          ctx.lineWidth = 3;
          ctx.stroke();
          const gl = ctx.createRadialGradient(fxp, fyp - 30 * fScale, 0, fxp, fyp - 30 * fScale, 120 * fScale);
          gl.addColorStop(0, 'rgba(255,60,50,0.55)');
          gl.addColorStop(1, 'rgba(255,60,50,0)');
          ctx.fillStyle = gl;
          ctx.fillRect(fxp - 120 * fScale, fyp - 150 * fScale, 240 * fScale, 240 * fScale);
          ctx.restore();
          if (s.foeT < 0.35 && Math.sin(t * 40) > 0) mono = '#ffffff';
        }
        if (s.hurt > 0.7 && !mono && s.shock <= 0) mono = '#ffffff';
        drawFoe(ctx, s, fxp, fyp, foeSc, foeRot, mono);
      }
      // the ball during recall and send out
      if (s.foe === 'recall') {
        const k = clamp((s.foeT - 0.75) / 0.25, 0, 1);
        const away = clamp((s.foeT - 1.0) / 0.4, 0, 1);
        drawBall(ctx, ballX + away * 300, ballY - away * 260, 15 * L.fs * 1.4, 1 - k, away * 6);
      } else if (s.foe === 'out') {
        const k = clamp(s.foeT / 0.45, 0, 1);
        const bx = lerp(L.fx + 340, L.fx, k);
        const by = lerp(L.fy - 420, L.fy - 20 * L.fs, k) - Math.sin(k * Math.PI) * 120;
        if (s.foeT < 0.6) drawBall(ctx, bx, by, 15 * L.fs * 1.4, s.foeT > 0.45 ? 1 : 0, k * 10);
        if (s.foeT > 0.45 && s.foeT < 0.8) {
          const a = 1 - (s.foeT - 0.45) / 0.35;
          const gl = ctx.createRadialGradient(L.fx, L.fy - 40 * L.fs, 0, L.fx, L.fy - 40 * L.fs, 160 * L.fs);
          gl.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
          gl.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gl;
          ctx.fillRect(L.fx - 160 * L.fs, L.fy - 200 * L.fs, 320 * L.fs, 320 * L.fs);
        }
      }

      // Pikachu
      const p = pikaPose(s);
      ctx.fillStyle = 'rgba(30,70,20,0.3)';
      const lift = clamp((L.py - p.y) / 200, 0, 0.7);
      const shY = lerp(L.py, strikePoint(s).y, clamp((L.py - p.y) / Math.max(1, L.py - strikePoint(s).y), 0, 1));
      ctx.beginPath();
      ctx.ellipse(p.x, Math.max(p.y, shY) + 2, 46 * p.sc * (1 - lift * 0.5), 10 * p.sc * (1 - lift * 0.5), 0, 0, TAU);
      ctx.fill();
      // speed lines behind a dash
      if (s.trail.length > 3) {
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 2; i < s.trail.length; i += 2) {
          const a = i / s.trail.length;
          ctx.strokeStyle = s.act === 'volt' ? `rgba(200,235,255,${(a * 0.7).toFixed(3)})` : `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
          ctx.lineWidth = (s.act === 'volt' ? 40 : 18) * a * p.sc;
          ctx.beginPath();
          ctx.moveTo(s.trail[i - 2], s.trail[i - 1]);
          ctx.lineTo(s.trail[i], s.trail[i + 1]);
          ctx.stroke();
        }
        ctx.restore();
      }
      // charge aura
      if (p.aura > 0.02) {
        const cx = p.x;
        const cy = p.y - 80 * p.sc;
        const R = (110 + p.aura * 40) * p.sc;
        const rgb = p.blue > 0.5 ? '170,215,255' : '255,236,110';
        const gl = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
        gl.addColorStop(0, `rgba(${rgb},${(p.aura * 0.45).toFixed(3)})`);
        gl.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gl;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
      drawPika(ctx, s, p);
      if (p.blue > 0.05) {
        // Volt Tackle: an electric shell around the whole body
        const cx = p.x;
        const cy = p.y - 76 * p.sc;
        const R = 105 * p.sc;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
        gl.addColorStop(0, `rgba(255,250,200,${(p.blue * 0.12).toFixed(3)})`);
        gl.addColorStop(0.85, `rgba(225,240,255,${(p.blue * 0.6).toFixed(3)})`);
        gl.addColorStop(1, 'rgba(170,220,255,0)');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(235,248,255,${p.blue.toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          let a = rand(0, TAU);
          ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
          for (let i = 0; i < 5; i++) {
            a += rand(0.15, 0.35);
            const rr = R * rand(0.75, 1.02);
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // bolts
      if (s.bolts.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'round';
        for (const pass of [0, 1, 2]) {
          for (const b of s.bolts) {
            ctx.beginPath();
            ctx.moveTo(b.pts[0], b.pts[1]);
            for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
            ctx.strokeStyle = pass === 0 ? 'rgba(255,220,60,0.22)' : pass === 1 ? 'rgba(255,236,90,0.9)' : 'rgba(255,255,240,1)';
            ctx.lineWidth = pass === 0 ? b.w * 3.2 : pass === 1 ? b.w : b.w * 0.38;
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      // sparks, rings and dust
      ctx.save();
      for (const d of s.dust.items) {
        if (d.life <= 0) continue;
        const a = d.life / d.max;
        ctx.fillStyle = `rgba(230,214,160,${(a * 0.8).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size * (1.6 - a * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const q of s.sparks.items) {
        if (q.life <= 0) continue;
        const a = q.life / q.max;
        if (q.kind === 2 || q.kind === 3) {
          // tiny jagged arcs
          const col = q.kind === 3 ? '200,235,255' : '255,240,120';
          ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          const l = q.size;
          ctx.lineTo(q.x + rand(-l, l), q.y + rand(-l, l));
          ctx.lineTo(q.x + rand(-l, l) * 1.5, q.y + rand(-l, l) * 1.5);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(255,${q.kind === 1 ? 255 : 230},${q.kind === 1 ? 255 : 120},${a.toFixed(3)})`;
          ctx.lineWidth = q.size;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04);
          ctx.stroke();
        }
      }
      for (const r of s.rings) {
        const k = r.age / 0.45;
        ctx.strokeStyle = `rgba(${r.rgb},${((1 - k) * 0.9).toFixed(3)})`;
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.max * easeOutCubic(k), r.max * 0.55 * easeOutCubic(k), 0, 0, TAU);
        ctx.stroke();
      }
      // a hit star at the moment of impact
      if (s.hurt > 0.75 && s.foe !== 'gone') {
        const hx = strikePoint(s).x + 40 * L.fs;
        const hy = L.fy - 40 * L.fs;
        const R = 50 * (s.hurt - 0.6) * 2.5 * L.fs;
        ctx.fillStyle = 'rgba(255,250,220,0.9)';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          const rr = i % 2 ? R * 0.4 : R;
          if (i) ctx.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr);
          else ctx.moveTo(hx + rr, hy);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();

      // HP plates in the classic corners, bars only
      const pw = clamp(w * (L.compact ? 0.46 : 0.24), 130, 260);
      const m = Math.max(10, w * 0.025);
      drawPlate(ctx, m, m, pw, s.foeHpShow / 100, 'foe');
      drawPlate(ctx, w - pw - m, h - pw * 0.2 - m, pw, s.hpShow / 100, 'pika');

      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(${s.flashRGB},${(s.flash * 0.75).toFixed(3)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }
      ctx.restore();
    },
    onPointerDown: (s, env, x, y) => {
      s.sx = x;
      s.sy = y;
      s.stT = performance.now();
      press(s, env);
    },
    onPointerMove: (s, env, x, y) => {
      if (!s.pressing) return;
      const dx = x - s.sx;
      const dy = y - s.sy;
      const fast = performance.now() - s.stT < 450;
      // a swipe toward the foe (right and up the field) is Volt Tackle
      if (fast && dx > 60 && dx > -dy * 0.3 && Math.hypot(dx, dy) > 70) {
        s.pressing = false;
        if (s.act === 'charge') s.act = 'idle';
        s.charge = 0;
        voltTackle(s, env);
      }
    },
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      const code = e.code;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
        if (down) {
          if (!e.repeat && !s.keyDown) {
            takeOver(s);
            s.keyDown = true;
            press(s, env);
          }
        } else if (s.keyDown) {
          s.keyDown = false;
          release(s, env);
        }
        return true;
      }
      if (code !== 'KeyQ' && code !== 'KeyT' && code !== 'KeyV') return false;
      if (!down || e.repeat) return true;
      takeOver(s);
      s.idle = 0;
      if (s.act === 'charge') s.act = 'idle';
      if (code === 'KeyQ') quick(s, env);
      else if (code === 'KeyT') thunderbolt(s, env, 1);
      else voltTackle(s, env);
      return true;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
      if (s.bg) s.bg.width = 0;
      s.bg = null;
    },
  });
