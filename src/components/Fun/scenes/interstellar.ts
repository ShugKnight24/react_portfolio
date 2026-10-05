import { createCanvasScene, clamp, damp, easeInOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { emit, freeCanvas, glow, glowSprite, layer, makePool, mulberry, shakeX, shakeY, stepPool } from './heroes-kit';
import type { Pool } from './heroes-kit';

/**
 * The Endurance docking spin. The camera rides with the Ranger, so the ring station turns in
 * frame while the starfield, the ice planet and Gargantua hold still. Holding fires the
 * Ranger's thrusters and spins it up: the universe starts to wheel around the frame and the
 * station's apparent spin slows. Let go when the station looks still and the Ranger closes
 * in and latches onto the hub with a clunk; let go too early or too late and the thrusters
 * bleed the spin off for another try. Then the joined ships de-spin together.
 *
 * Gargantua is baked once per resize per pixel: the shadow, a thin photon ring, the far side
 * of the disk lensed up over the top and under the bottom, and the near side of the disk
 * crossing in front. The station is a small 3D model (twelve modules, two of them blown off)
 * lit by the disk, sorted and painted face by face each frame. Sound waits for unmute: an
 * organ pad that swells while you hold, a running organ figure, the ticking clock, the clunk.
 */

type Phase = 'ready' | 'miss' | 'docking' | 'docked' | 'despin' | 'rest' | 'fade';

interface Face {
  z: number;
  /** 0 quad, 1 tube, 2 hub */
  kind: number;
  p: Float32Array;
  r: number;
  g: number;
  b: number;
  /** face role for details: 0 plain, 1 front panel, 2 outer band */
  role: number;
  w: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
}

interface Pad {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface State {
  phase: Phase;
  pt: number;
  phiE: number;
  phiR: number;
  wE: number;
  wR: number;
  /** approach 0 (standing off) to 1 (latched) */
  app: number;
  holding: boolean;
  touched: boolean;
  idle: number;
  auto: boolean;
  autoT: number;
  autoTarget: number;
  shudder: number;
  shake: number;
  flash: number;
  lock: number;
  missFlash: number;
  shock: number;
  thrust: number;
  wobT: number;
  parts: Pool;
  // audio
  pad: Pad | null;
  swell: number;
  seqT: number;
  seqI: number;
  tickT: number;
  // layout
  cx: number;
  cy: number;
  RS: number;
  u: number;
  half: number;
  stars: Star[];
  gx: number;
  gy: number;
  gW: number;
  garg: HTMLCanvasElement | null;
  planet: HTMLCanvasElement | null;
  pR: number;
  pX: number;
  pY: number;
  ranger: HTMLCanvasElement | null;
  rL: number;
  faces: Face[];
  nFaces: number;
  order: number[];
  vignette: CanvasGradient | null;
  warm: HTMLCanvasElement;
  cool: HTMLCanvasElement;
  white: HTMLCanvasElement;
}

const W_E = 2.05;
const ALPHA = 0.82;
const TOL = 0.13;
const MODS = 12;
const LOST = new Set([9, 10]);
const D_CAM = 4.2;
const APPROACH_DUR = 1.7;

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const wrapPi = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

/* ---------- value noise for the planet clouds ---------- */

function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  let s = 0;
  let amp = 0.5;
  for (let o = 0; o < 5; o++) {
    s += vnoise(x, y) * amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 3.7;
    amp *= 0.5;
  }
  return s;
}

/* ---------- Gargantua ---------- */

const RAMP: [number, number, number, number][] = [
  [0, 90, 28, 6],
  [0.3, 235, 110, 30],
  [0.6, 255, 186, 96],
  [0.85, 255, 228, 180],
  [1, 255, 250, 238],
];

function ramp(t: number, out: number[]) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * k;
      out[1] = a[2] + (b[2] - a[2]) * k;
      out[2] = a[3] + (b[3] - a[3]) * k;
      return;
    }
  }
  out[0] = 255;
  out[1] = 250;
  out[2] = 238;
}

/** The black hole sprite, gW CSS pixels wide; the shadow radius is gW * 0.085 */
function bakeGargantua(gW: number, dpr: number) {
  const sc = Math.min(dpr, 1.5);
  const W = Math.max(8, Math.round(gW * sc));
  const H = Math.max(8, Math.round(gW * 0.6 * sc));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const img = g.createImageData(W, H);
  const d = img.data;
  const rs = gW * 0.085 * sc;
  const ci = 0.1;
  const RIN = 2.25;
  const col = [0, 0, 0];
  const stri = (R: number, th: number) =>
    0.8 + 0.1 * Math.sin(R * 10.5 + 1.8 * Math.sin(R * 2.9)) + 0.06 * Math.sin(R * 31 + th * 3) + 0.04 * Math.sin(th * 7 + R * 4);
  for (let py = 0; py < H; py++) {
    const y = (py + 0.5 - H / 2) / rs;
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - W / 2) / rs;
      const r = Math.hypot(x, y);
      const th = Math.atan2(y, x);
      // near and far sides of the disk, seen almost edge on
      const yd = y / ci;
      const Rd = Math.sqrt(x * x + yd * yd);
      let disk = 0;
      if (Rd > RIN) {
        disk =
          smoothstep(RIN, RIN + 0.35, Rd) *
          Math.pow(RIN / Rd, 1.25) *
          (1 - smoothstep(3.4, 5.7, Rd)) *
          stri(Rd, Math.atan2(yd, x)) *
          1.45;
      }
      const front = y >= 0;
      let I = 0;
      if (r < 1) {
        I = front ? disk : 0;
      } else {
        const wTop = smoothstep(0.3, -0.3, y / r);
        const top = Math.exp(-(r - 1.1) / 0.5) * smoothstep(1.0, 1.14, r) * (1 - smoothstep(2.1, 2.9, r));
        const bot = Math.exp(-(r - 1.04) / 0.16) * smoothstep(1.0, 1.06, r) * 0.85;
        const halo = lerp(bot, top, wTop) * (0.9 + 0.1 * Math.sin(r * 9 + th * 2)) * 1.1;
        // the halo fades where it meets the disk plane, which carries on as the disk itself
        const merge = smoothstep(0.02, 0.25, Math.abs(y) / r);
        // behind the hole the far disk is what the halo shows; only its outer reach peeks out
        const back = front ? 1 : smoothstep(2.4, 3.6, r);
        I = halo * lerp(0.45, 1, merge) + disk * back;
      }
      I += 1.5 * Math.exp(-Math.pow((r - 1.025) / 0.02, 2));
      const dop = 1 - 0.16 * clamp(x / Math.max(1, Math.max(Rd, r)), -1, 1);
      I *= dop;
      const o = (py * W + px) * 4;
      if (I <= 0.002) {
        d[o + 3] = 0;
        continue;
      }
      ramp(I / 1.55, col);
      const a = clamp(I * 1.15, 0, 1);
      d[o] = col[0];
      d[o + 1] = col[1];
      d[o + 2] = col[2];
      d[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/* ---------- the ice planet (soft clouds, baked at low resolution) ---------- */

function bakePlanet(half: number, pX: number, pY: number, pR: number) {
  const sc = 0.55;
  const S = Math.max(8, Math.round(half * 2 * sc));
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const img = g.createImageData(S, S);
  const d = img.data;
  const L = [-0.42, -0.62, 0.66];
  const ln = Math.hypot(L[0], L[1], L[2]);
  L[0] /= ln;
  L[1] /= ln;
  L[2] /= ln;
  for (let py = 0; py < S; py++) {
    const wy = py / sc - half;
    for (let px = 0; px < S; px++) {
      const wx = px / sc - half;
      const nx = (wx - pX) / (pR * 1.01);
      const ny = (wy - pY) / (pR * 1.01);
      const q = nx * nx + ny * ny;
      const o = (py * S + px) * 4;
      if (q >= 1) {
        d[o + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - q);
      const lon = Math.atan2(nx, nz);
      const lat = Math.asin(clamp(ny, -1, 1));
      const c = fbm(lon * 5 + 3, lat * 13 + fbm(lon * 3, lat * 4) * 2.2);
      const ice = fbm(lon * 11 + 40, lat * 22);
      const lit = clamp(nx * L[0] + ny * L[1] + nz * L[2], -1, 1);
      const day = smoothstep(-0.12, 0.45, lit);
      const cloud = smoothstep(0.42, 0.72, c);
      // ice plains: pale cyan grey; clouds: white; the night side: deep navy
      let r = lerp(118, 196, ice) ;
      let gg = lerp(150, 214, ice);
      let b = lerp(178, 230, ice);
      r = lerp(r, 246, cloud);
      gg = lerp(gg, 250, cloud);
      b = lerp(b, 255, cloud);
      const shade = 0.08 + 0.92 * day;
      r = lerp(8, r, shade);
      gg = lerp(14, gg, shade);
      b = lerp(30, b, shade);
      // limb haze
      const limb = Math.pow(1 - nz, 3);
      r = lerp(r, 150, limb * 0.6 * day);
      gg = lerp(gg, 200, limb * 0.6 * day);
      b = lerp(b, 255, limb * 0.7 * day);
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/* ---------- the Ranger, seen from above with its nose up ---------- */

function bakeRanger(L: number, dpr: number) {
  const W = L * 0.8;
  const H = L * 1.06;
  const { cv, c } = layer(null, W, H, dpr);
  if (!c) return cv;
  c.translate(W / 2, H * 0.5);
  c.scale(L, L);
  const hull = new Path2D();
  // a flat, blunt lifting body: squared nose, straight chines, short clipped wings
  hull.moveTo(-0.07, -0.5);
  hull.lineTo(0.07, -0.5);
  hull.lineTo(0.15, -0.38);
  hull.lineTo(0.19, -0.05);
  hull.lineTo(0.31, 0.18);
  hull.lineTo(0.31, 0.33);
  hull.lineTo(0.2, 0.36);
  hull.lineTo(0.17, 0.47);
  hull.lineTo(-0.17, 0.47);
  hull.lineTo(-0.2, 0.36);
  hull.lineTo(-0.31, 0.33);
  hull.lineTo(-0.31, 0.18);
  hull.lineTo(-0.19, -0.05);
  hull.lineTo(-0.15, -0.38);
  hull.closePath();

  // soft shadow so it lifts off the station behind it
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = 18 * dpr;
  c.shadowOffsetY = 0.01;
  c.fillStyle = '#d8dadc';
  c.fill(hull);
  c.restore();

  c.save();
  c.clip(hull);
  const body = c.createLinearGradient(-0.36, 0, 0.36, 0);
  body.addColorStop(0, '#9da3a9');
  body.addColorStop(0.32, '#e9ebec');
  body.addColorStop(0.5, '#f6f6f4');
  body.addColorStop(0.7, '#d8dbdd');
  body.addColorStop(1, '#868c93');
  c.fillStyle = body;
  c.fillRect(-0.4, -0.55, 0.8, 1.1);
  // spine ridge and lengthwise light
  const spine = c.createLinearGradient(-0.06, 0, 0.06, 0);
  spine.addColorStop(0, 'rgba(255,255,255,0)');
  spine.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  spine.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = spine;
  c.fillRect(-0.06, -0.48, 0.12, 0.92);
  // black thermal tiles: the nose and the wing leading edges
  c.fillStyle = '#16181b';
  c.beginPath();
  c.moveTo(-0.2, -0.41);
  c.lineTo(0.2, -0.41);
  c.lineTo(0.2, -0.6);
  c.lineTo(-0.2, -0.6);
  c.closePath();
  c.fill();
  c.lineWidth = 0.028;
  c.strokeStyle = '#1b1d21';
  c.beginPath();
  c.moveTo(0.19, -0.05);
  c.lineTo(0.31, 0.18);
  c.lineTo(0.31, 0.33);
  c.moveTo(-0.19, -0.05);
  c.lineTo(-0.31, 0.18);
  c.lineTo(-0.31, 0.33);
  c.stroke();
  // panel lines
  c.strokeStyle = 'rgba(40,46,54,0.35)';
  c.lineWidth = 0.004;
  c.beginPath();
  for (const y of [-0.26, -0.14, 0.1, 0.22, 0.34]) {
    c.moveTo(-0.3, y);
    c.lineTo(0.3, y);
  }
  for (const x of [-0.09, 0.09, -0.22, 0.22]) {
    c.moveTo(x, -0.3);
    c.lineTo(x, 0.45);
  }
  c.stroke();
  // engine deck
  c.fillStyle = '#2a2e33';
  c.fillRect(-0.17, 0.41, 0.34, 0.07);
  c.restore();

  // cockpit glazing
  c.fillStyle = '#0c1118';
  c.beginPath();
  c.moveTo(-0.055, -0.33);
  c.lineTo(0.055, -0.33);
  c.lineTo(0.075, -0.27);
  c.lineTo(-0.075, -0.27);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(160,200,255,0.35)';
  c.beginPath();
  c.moveTo(-0.045, -0.325);
  c.lineTo(0.0, -0.325);
  c.lineTo(-0.02, -0.28);
  c.lineTo(-0.065, -0.28);
  c.closePath();
  c.fill();

  // docking collar on the spine
  c.fillStyle = '#7d848b';
  c.beginPath();
  c.arc(0, 0.02, 0.07, 0, TAU);
  c.fill();
  c.fillStyle = '#c9cdd1';
  c.beginPath();
  c.arc(0, 0.02, 0.058, 0, TAU);
  c.fill();
  c.fillStyle = '#3a3f45';
  c.beginPath();
  c.arc(0, 0.02, 0.04, 0, TAU);
  c.fill();
  c.fillStyle = '#ffb347';
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 - Math.PI / 2;
    c.beginPath();
    c.arc(Math.cos(a) * 0.064, 0.02 + Math.sin(a) * 0.064, 0.007, 0, TAU);
    c.fill();
  }

  // engine bells
  c.fillStyle = '#0b0c0e';
  for (const x of [-0.06, 0.06]) {
    c.beginPath();
    c.ellipse(x, 0.465, 0.035, 0.016, 0, 0, TAU);
    c.fill();
  }
  // outline
  c.strokeStyle = 'rgba(20,24,30,0.7)';
  c.lineWidth = 0.006;
  c.stroke(hull);
  return cv;
}

/* ---------- station geometry ---------- */

const CORNERS: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
// [corner indices, normal in (r, t, z) box axes, role]
const BOX_FACES: [number[], [number, number, number], number][] = [
  [[4, 5, 6, 7], [0, 0, 1], 1],
  [[0, 3, 2, 1], [0, 0, -1], 0],
  [[1, 2, 6, 5], [1, 0, 0], 2],
  [[0, 4, 7, 3], [-1, 0, 0], 0],
  [[2, 3, 7, 6], [0, 1, 0], 0],
  [[0, 1, 5, 4], [0, -1, 0], 0],
];

interface View {
  ca: number;
  sa: number;
  ct: number;
  st: number;
  cb: number;
  sb: number;
  cx: number;
  cy: number;
  R: number;
}

const v3 = [0, 0, 0];

/** Station space to screen; returns depth (toward camera is positive) in v3[2] */
function project(v: View, x: number, y: number, z: number) {
  const x1 = x * v.ca - y * v.sa;
  const y1 = x * v.sa + y * v.ca;
  const y2 = y1 * v.ct - z * v.st;
  const z2 = y1 * v.st + z * v.ct;
  const x3 = x1 * v.cb + z2 * v.sb;
  const z3 = -x1 * v.sb + z2 * v.cb;
  const s = D_CAM / (D_CAM - z3);
  v3[0] = v.cx + x3 * v.R * s;
  v3[1] = v.cy + y2 * v.R * s;
  v3[2] = z3;
  return s;
}
/** Rotate a direction (no translation, no perspective) */
function rotDir(v: View, x: number, y: number, z: number) {
  const x1 = x * v.ca - y * v.sa;
  const y1 = x * v.sa + y * v.ca;
  const y2 = y1 * v.ct - z * v.st;
  const z2 = y1 * v.st + z * v.ct;
  v3[0] = x1 * v.cb + z2 * v.sb;
  v3[1] = y2;
  v3[2] = -x1 * v.sb + z2 * v.cb;
}

function makeFaces() {
  const faces: Face[] = [];
  for (let i = 0; i < 160; i++)
    faces.push({ z: 0, kind: 0, p: new Float32Array(8), r: 0, g: 0, b: 0, role: 0, w: 0 });
  return faces;
}

/* ---------- audio ---------- */

function startPad(bus: AudioBus): Pad {
  const { ctx, out } = bus;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.7;
  filter.connect(gain);
  const oscs: OscillatorNode[] = [];
  const notes = [55, 110, 164.81, 220, 261.63, 329.63];
  for (const f of notes) {
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = f < 100 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = f < 100 ? 0.5 : 0.11;
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o);
    }
  }
  return { oscs, filter, gain };
}

function setPad(p: Pad, level: number, cutoff: number, chord: number[] | null) {
  const now = p.filter.context.currentTime;
  p.gain.gain.setTargetAtTime(Math.max(0.0001, level), now, 0.35);
  p.filter.frequency.setTargetAtTime(cutoff, now, 0.3);
  if (chord)
    for (let i = 0; i < p.oscs.length; i++) p.oscs[i].frequency.setTargetAtTime(chord[i >> 1], now, 0.25);
}

function stopPad(p: Pad | null) {
  if (!p) return;
  try {
    const now = p.filter.context.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(0.0001, now, 0.1);
    for (const o of p.oscs) o.stop(now + 0.6);
  } catch {
    /* context already closed */
  }
}

// the organ figure walks A minor, F, C, G
const ROOTS = [220, 174.61, 261.63, 196];
const FIGURE = [0, 7, 12, 7, 15, 7, 12, 7];
const CHORDS: number[][] = [
  [55, 110, 164.81, 220, 261.63, 329.63],
  [43.65, 87.31, 130.81, 174.61, 220, 261.63],
  [65.41, 130.81, 196, 261.63, 329.63, 392],
  [49, 98, 146.83, 196, 246.94, 293.66],
];
const RESOLVE = [55, 110, 164.81, 220, 277.18, 329.63];

/* ---------- scene logic ---------- */

function setPhase(s: State, p: Phase) {
  s.phase = p;
  s.pt = 0;
}

function press(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  s.auto = false;
  if (s.phase === 'rest' || (s.phase === 'despin' && s.pt > 1.2)) {
    setPhase(s, 'fade');
    return;
  }
  if (s.phase !== 'ready' && s.phase !== 'miss') return;
  s.holding = true;
  if (s.phase === 'miss') setPhase(s, 'ready');
  const bus = env.audio();
  if (bus) {
    if (!s.pad) s.pad = startPad(bus);
    noise(bus, { duration: 0.25, gain: 0.05, freq: 2400, q: 0.6, type: 'highpass' });
  }
}

function release(s: State, env: SceneEnv) {
  if (!s.holding) return;
  s.holding = false;
  if (s.phase !== 'ready') return;
  attempt(s, env);
}

function attempt(s: State, env: SceneEnv) {
  const off = Math.abs(s.wR - s.wE) / s.wE;
  const bus = env.audio();
  if (off <= TOL) {
    setPhase(s, 'docking');
    if (bus) {
      tone(bus, 880, { type: 'sine', attack: 0.004, decay: 0.12, gain: 0.05 });
      tone(bus, 1318.5, { type: 'sine', attack: 0.004, decay: 0.18, gain: 0.04, delay: 0.09 });
    }
  } else {
    setPhase(s, 'miss');
    s.missFlash = 1;
    s.shudder = 1;
    if (bus) {
      tone(bus, 330, { type: 'square', attack: 0.004, decay: 0.1, gain: 0.04 });
      tone(bus, 247, { type: 'square', attack: 0.004, decay: 0.16, gain: 0.04, delay: 0.12 });
    }
  }
}

function clunk(s: State, env: SceneEnv) {
  s.shake = 1;
  s.flash = 1;
  s.lock = 1;
  s.shock = 0.001;
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU);
    const v = rand(60, 220) * s.u;
    emit(s.parts, s.cx + Math.cos(a) * 8 * s.u, s.cy + Math.sin(a) * 8 * s.u, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), rand(1.5, 3) * s.u, 1, 3, 0);
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.45, gain: 0.3, freq: 160, q: 0.8, type: 'lowpass' });
    tone(bus, 72, { type: 'sine', attack: 0.003, decay: 0.5, gain: 0.3, glideTo: 38 });
    tone(bus, 410, { type: 'square', attack: 0.002, decay: 0.09, gain: 0.05 });
    tone(bus, 1260, { type: 'triangle', attack: 0.002, decay: 0.35, gain: 0.04 });
    tone(bus, 940, { type: 'triangle', attack: 0.002, decay: 0.3, gain: 0.03, delay: 0.07 });
    noise(bus, { duration: 0.12, gain: 0.08, freq: 3200, q: 2, type: 'bandpass' });
    if (s.pad) setPad(s.pad, 0.16, 3200, RESOLVE);
  }
}

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const m = Math.min(w, h);
  const portrait = h > w * 1.1;
  s.u = m / 800;
  s.cx = w / 2;
  s.cy = portrait ? h * 0.44 : h * 0.45;
  s.RS = portrait ? w * 0.36 : m * 0.3;
  s.half = Math.hypot(Math.max(s.cx, w - s.cx), Math.max(s.cy, h - s.cy)) + 4;
  // stars across the whole disk the frame can sweep through
  const rnd = mulberry(4242);
  s.stars = [];
  const n = Math.round(clamp((w * h) / 2600, 160, 520));
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const r = Math.sqrt(rnd()) * s.half;
    const big = rnd() < 0.06;
    s.stars.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      r: (big ? 1.1 + rnd() * 0.8 : 0.35 + rnd() * 0.55) * Math.max(0.8, s.u),
      a: big ? 0.9 : 0.25 + rnd() * 0.6,
      tw: rnd() * TAU,
    });
  }
  // Gargantua hangs up and to the left; the ice planet curves under the station
  s.gW = portrait ? w * 1.15 : m * 1.25;
  // in a tall frame the backdrop wheels past the narrow sides, so keep both close to the middle
  s.gx = portrait ? -w * 0.06 : -w * 0.22;
  s.gy = portrait ? -w * 0.44 : -h * 0.29;
  freeCanvas(s.garg, s.planet, s.ranger);
  s.garg = bakeGargantua(s.gW, dpr);
  s.pR = Math.max(w, h) * 1.25;
  s.pX = portrait ? w * 0.1 : w * 0.12;
  s.pY = s.pR + (portrait ? w * 0.4 : s.RS * 0.82 + h * 0.08);
  s.planet = bakePlanet(s.half, s.pX, s.pY, s.pR);
  s.rL = s.RS * 0.82;
  s.ranger = bakeRanger(s.rL, dpr);
  const vg = env.ctx.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  s.vignette = vg;
}

function reset(s: State) {
  s.phiE = rand(0, TAU);
  s.phiR = 0;
  s.wE = W_E;
  s.wR = 0;
  s.app = 0;
  s.lock = 0;
  s.holding = false;
  setPhase(s, 'ready');
}

/* ---------- drawing ---------- */

function drawBackdrop(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  ctx.fillStyle = '#020307';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.rotate(-s.phiR);
  // stars
  for (const st of s.stars) {
    const tw = 0.75 + 0.25 * Math.sin(t * 1.7 + st.tw);
    ctx.globalAlpha = st.a * tw;
    ctx.fillStyle = st.r > 1 ? '#fff6e8' : '#dfe8ff';
    ctx.fillRect(st.x - st.r / 2, st.y - st.r / 2, st.r, st.r);
  }
  ctx.globalAlpha = 1;
  // Gargantua: a soft warm bloom, the shadow, then the disk and its lensed halo
  const gs = s.gW * 0.085;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s.warm, s.gx, s.gy, s.gW * 0.62, 0.42);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(s.gx, s.gy, gs * 1.01, 0, TAU);
  ctx.fill();
  if (s.garg) {
    const gh = s.gW * 0.6;
    ctx.drawImage(s.garg, s.gx - s.gW / 2, s.gy - gh / 2, s.gW, gh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + 0.05 * Math.sin(t * 0.8);
    ctx.drawImage(s.garg, s.gx - s.gW * 0.51, s.gy - gh * 0.51, s.gW * 1.02, gh * 1.02);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // the planet
  if (s.planet) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.pX, s.pY, s.pR, 0, TAU);
    ctx.clip();
    ctx.drawImage(s.planet, -s.half, -s.half, s.half * 2, s.half * 2);
    const rim = ctx.createRadialGradient(s.pX, s.pY, s.pR * 0.95, s.pX, s.pY, s.pR);
    rim.addColorStop(0, 'rgba(170,215,255,0)');
    rim.addColorStop(0.7, 'rgba(170,215,255,0.18)');
    rim.addColorStop(1, 'rgba(200,232,255,0.7)');
    ctx.fillStyle = rim;
    ctx.fillRect(-s.half, -s.half, s.half * 2, s.half * 2);
    ctx.restore();
  }
  ctx.lineWidth = 2.2 * s.u + 1;
  ctx.strokeStyle = 'rgba(170,215,255,0.55)';
  ctx.beginPath();
  ctx.arc(s.pX, s.pY, s.pR + 0.5, 0, TAU);
  ctx.stroke();
  // atmosphere: a soft blue glow just off the limb
  const ar = 22 * s.u + 6;
  const atm = ctx.createRadialGradient(s.pX, s.pY, s.pR, s.pX, s.pY, s.pR + ar);
  atm.addColorStop(0, 'rgba(140,195,255,0.42)');
  atm.addColorStop(0.35, 'rgba(110,170,255,0.14)');
  atm.addColorStop(1, 'rgba(90,140,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = ar;
  ctx.strokeStyle = atm;
  ctx.beginPath();
  ctx.arc(s.pX, s.pY, s.pR + ar / 2, 0, TAU);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function pushFace(s: State, z: number, kind: number, r: number, g: number, b: number, role: number, w: number) {
  if (s.nFaces >= s.faces.length) return null;
  const f = s.faces[s.nFaces++];
  f.z = z;
  f.kind = kind;
  f.r = r;
  f.g = g;
  f.b = b;
  f.role = role;
  f.w = w;
  return f;
}

function shadeRGB(nx: number, ny: number, nz: number, L: number[], P: number[], base: number, out: number[]) {
  const key = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const fill = Math.max(0, nx * P[0] + ny * P[1] + nz * P[2]);
  const amb = 0.16;
  const amb2 = amb + 0.12;
  out[0] = Math.min(255, base * (amb2 + key * 1.0 + fill * 0.14));
  out[1] = Math.min(255, base * (amb2 + key * 0.96 + fill * 0.2));
  out[2] = Math.min(255, base * (amb2 * 1.12 + key * 0.9 + fill * 0.3));
}

const rgb = [0, 0, 0];
const pts = new Float32Array(16);

function drawStation(s: State, env: SceneEnv, t: number) {
  const { ctx } = env;
  const a = wrapPi(s.phiE - s.phiR);
  const tilt = 0.55 + 0.06 * Math.sin(s.wobT * 0.53);
  const wob = 0.12 * Math.sin(s.wobT * 0.71 + 1);
  const view: View = {
    ca: Math.cos(a),
    sa: Math.sin(a),
    ct: Math.cos(tilt),
    st: Math.sin(tilt),
    cb: Math.cos(wob),
    sb: Math.sin(wob),
    cx: s.cx,
    cy: s.cy,
    R: s.RS,
  };
  // lights live in the world, so they turn with the frame
  const lw = -s.phiR;
  const Lx0 = -0.5;
  const Ly0 = -0.55;
  const L = [Lx0 * Math.cos(lw) - Ly0 * Math.sin(lw), Lx0 * Math.sin(lw) + Ly0 * Math.cos(lw), 0.62];
  const ll = Math.hypot(L[0], L[1], L[2]);
  L[0] /= ll;
  L[1] /= ll;
  L[2] /= ll;
  const P = [-Math.sin(lw) * 0.9, Math.cos(lw) * 0.9, 0.3];

  s.nFaces = 0;
  const step = TAU / MODS;
  const hr = 0.085;
  const ht = 0.2;
  const hz = 0.075;
  for (let i = 0; i < MODS; i++) {
    if (LOST.has(i)) continue;
    const th = i * step;
    const rx = Math.cos(th);
    const ry = Math.sin(th);
    const tx = -ry;
    const ty = rx;
    for (const [idx, n, role] of BOX_FACES) {
      // normal in station space
      const nx = n[0] * rx + n[1] * tx;
      const ny = n[0] * ry + n[1] * ty;
      const nz = n[2];
      rotDir(view, nx, ny, nz);
      const vx = v3[0];
      const vy = v3[1];
      const vz = v3[2];
      if (vz <= 0.0) continue;
      let zs = 0;
      for (let k = 0; k < 4; k++) {
        const cr = CORNERS[idx[k]];
        const px = rx * (1 + cr[0] * hr) + tx * cr[1] * ht;
        const py = ry * (1 + cr[0] * hr) + ty * cr[1] * ht;
        project(view, px, py, cr[2] * hz);
        pts[k * 2] = v3[0];
        pts[k * 2 + 1] = v3[1];
        zs += v3[2];
      }
      const base = role === 1 ? 240 : role === 2 ? 215 : 175;
      shadeRGB(vx, vy, vz, L, P, base, rgb);
      const f = pushFace(s, zs / 4, 0, rgb[0], rgb[1], rgb[2], role, 0);
      if (f) f.p.set(pts.subarray(0, 8));
    }
    // tube to the next module (skipped where the ring is broken)
    const j = (i + 1) % MODS;
    if (!LOST.has(j)) {
      const a0 = th + step * 0.5;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      project(view, Math.cos(th + ht * 0.95), Math.sin(th + ht * 0.95), 0);
      const x0 = v3[0];
      const y0 = v3[1];
      const z0 = v3[2];
      project(view, Math.cos(th + step - ht * 0.95), Math.sin(th + step - ht * 0.95), 0);
      rotDir(view, c0, s0, 0.4);
      shadeRGB(v3[0], v3[1], v3[2], L, P, 150, rgb);
      project(view, Math.cos(th + step - ht * 0.95), Math.sin(th + step - ht * 0.95), 0);
      const f = pushFace(s, (z0 + v3[2]) / 2 - 0.02, 1, rgb[0], rgb[1], rgb[2], 0, 0.034);
      if (f) {
        f.p[0] = x0;
        f.p[1] = y0;
        f.p[2] = v3[0];
        f.p[3] = v3[1];
      }
    }
  }
  // broken stubs where modules were lost
  for (const i of [8, 11]) {
    const th = i * step + (i === 8 ? 1 : -1) * (ht + 0.06);
    const th2 = i * step + (i === 8 ? 1 : -1) * (ht + 0.16);
    project(view, Math.cos(th), Math.sin(th), 0);
    const x0 = v3[0];
    const y0 = v3[1];
    const z0 = v3[2];
    project(view, Math.cos(th2), Math.sin(th2), 0.01);
    const f = pushFace(s, z0, 1, 120, 118, 112, 0, 0.03);
    if (f) {
      f.p[0] = x0;
      f.p[1] = y0;
      f.p[2] = v3[0];
      f.p[3] = v3[1];
    }
  }
  // four spokes out to the ring
  for (let k = 0; k < 4; k++) {
    const th = (k + 0.5) * (TAU / 4) + step * 0.5;
    project(view, Math.cos(th) * 0.16, Math.sin(th) * 0.16, 0.02);
    const x0 = v3[0];
    const y0 = v3[1];
    const z0 = v3[2];
    project(view, Math.cos(th) * 0.92, Math.sin(th) * 0.92, 0);
    const x1 = v3[0];
    const y1 = v3[1];
    const z1 = v3[2];
    rotDir(view, -Math.sin(th), Math.cos(th), 0.6);
    shadeRGB(v3[0], v3[1], v3[2], L, P, 160, rgb);
    const f = pushFace(s, (z0 + z1) / 2 - 0.05, 1, rgb[0], rgb[1], rgb[2], 0, 0.028);
    if (f) {
      f.p[0] = x0;
      f.p[1] = y0;
      f.p[2] = x1;
      f.p[3] = y1;
    }
  }
  // hub drawn as its own item
  project(view, 0, 0, 0.16);
  pushFace(s, v3[2] - 0.1, 2, 0, 0, 0, 0, 0);

  // painter's sort
  const order = s.order;
  order.length = s.nFaces;
  for (let i = 0; i < s.nFaces; i++) order[i] = i;
  order.sort((p, q) => s.faces[p].z - s.faces[q].z);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const oi of order) {
    const f = s.faces[oi];
    const col = `rgb(${f.r | 0},${f.g | 0},${f.b | 0})`;
    if (f.kind === 0) {
      const p = f.p;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[2], p[3]);
      ctx.lineTo(p[4], p[5]);
      ctx.lineTo(p[6], p[7]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,34,40,0.55)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (f.role === 1) panelDetail(ctx, p, f.r);
      else if (f.role === 2) bandDetail(ctx, p);
    } else if (f.kind === 1) {
      const lw = f.w * s.RS;
      ctx.strokeStyle = 'rgba(25,28,34,0.9)';
      ctx.lineWidth = lw + 1.6;
      ctx.beginPath();
      ctx.moveTo(f.p[0], f.p[1]);
      ctx.lineTo(f.p[2], f.p[3]);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,248,235,0.35)';
      ctx.lineWidth = lw * 0.3;
      ctx.stroke();
    } else drawHub(ctx, s, view, L, P, t);
  }
  return view;
}

function quadPt(p: Float32Array, u: number, v: number, o: number[]) {
  const x0 = lerp(p[0], p[2], u);
  const y0 = lerp(p[1], p[3], u);
  const x1 = lerp(p[6], p[4], u);
  const y1 = lerp(p[7], p[5], u);
  o[0] = lerp(x0, x1, v);
  o[1] = lerp(y0, y1, v);
}
const qa = [0, 0];

function subQuad(ctx: CanvasRenderingContext2D, p: Float32Array, u0: number, v0: number, u1: number, v1: number) {
  ctx.beginPath();
  quadPt(p, u0, v0, qa);
  ctx.moveTo(qa[0], qa[1]);
  quadPt(p, u1, v0, qa);
  ctx.lineTo(qa[0], qa[1]);
  quadPt(p, u1, v1, qa);
  ctx.lineTo(qa[0], qa[1]);
  quadPt(p, u0, v1, qa);
  ctx.lineTo(qa[0], qa[1]);
  ctx.closePath();
  ctx.fill();
}

function panelDetail(ctx: CanvasRenderingContext2D, p: Float32Array, lit: number) {
  // gold foil band and a row of dark ports
  ctx.fillStyle = `rgba(${Math.min(255, lit * 0.95) | 0},${Math.min(255, lit * 0.72) | 0},${Math.min(255, lit * 0.3) | 0},0.85)`;
  subQuad(ctx, p, 0.08, 0.12, 0.92, 0.3);
  ctx.fillStyle = 'rgba(16,20,28,0.85)';
  for (let k = 0; k < 4; k++) subQuad(ctx, p, 0.14 + k * 0.2, 0.48, 0.24 + k * 0.2, 0.74);
}
function bandDetail(ctx: CanvasRenderingContext2D, p: Float32Array) {
  ctx.fillStyle = 'rgba(20,24,32,0.7)';
  subQuad(ctx, p, 0.1, 0.38, 0.9, 0.62);
}

function drawHub(ctx: CanvasRenderingContext2D, s: State, view: View, L: number[], P: number[], t: number) {
  // the hub barrel: back rim, side, then the docking face
  const n = 28;
  const rH = 0.15;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    project(view, Math.cos(a) * rH, Math.sin(a) * rH, -0.12);
    if (i === 0) ctx.moveTo(v3[0], v3[1]);
    else ctx.lineTo(v3[0], v3[1]);
  }
  ctx.fillStyle = '#4b5057';
  ctx.fill();
  // barrel sides as a fat stroke between the two rims
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * TAU;
    rotDir(view, Math.cos(a), Math.sin(a), 0);
    if (v3[2] < -0.2) continue;
    shadeRGB(v3[0], v3[1], v3[2], L, P, 190, rgb);
    ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    ctx.beginPath();
    project(view, Math.cos(a0) * rH, Math.sin(a0) * rH, -0.12);
    ctx.moveTo(v3[0], v3[1]);
    project(view, Math.cos(a1) * rH, Math.sin(a1) * rH, -0.12);
    ctx.lineTo(v3[0], v3[1]);
    project(view, Math.cos(a1) * rH, Math.sin(a1) * rH, 0.16);
    ctx.lineTo(v3[0], v3[1]);
    project(view, Math.cos(a0) * rH, Math.sin(a0) * rH, 0.16);
    ctx.lineTo(v3[0], v3[1]);
    ctx.closePath();
    ctx.fill();
  }
  rotDir(view, 0, 0, 1);
  shadeRGB(v3[0], v3[1], v3[2], L, P, 235, rgb);
  const face = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
  const ring = (r: number, z: number, fill: string) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      project(view, Math.cos(a) * r, Math.sin(a) * r, z);
      if (i === 0) ctx.moveTo(v3[0], v3[1]);
      else ctx.lineTo(v3[0], v3[1]);
    }
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ring(rH, 0.16, face);
  ctx.strokeStyle = 'rgba(30,34,40,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ring(0.1, 0.165, '#80868d');
  ring(0.085, 0.17, '#c8ccd0');
  ring(0.058, 0.172, '#2b3036');
  // alignment marks; they glow when the Ranger is latched
  const lockGlow = s.lock;
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI / 2;
    const sc = project(view, Math.cos(a) * 0.093, Math.sin(a) * 0.093, 0.175);
    ctx.fillStyle = lockGlow > 0.05 ? `rgba(140,255,190,${0.6 + 0.4 * lockGlow})` : `rgba(255,170,60,${0.75 + 0.25 * Math.sin(t * 6)})`;
    ctx.beginPath();
    ctx.arc(v3[0], v3[1], 2.2 * s.u * sc + 0.6, 0, TAU);
    ctx.fill();
  }
}

function drawRanger(s: State, env: SceneEnv, t: number) {
  const { ctx } = env;
  if (!s.ranger) return;
  const k = easeInOutCubic(s.app);
  const x = s.cx + Math.sin(t * 0.9) * 2 * s.u * (1 - k);
  const y = lerp(s.cy + s.RS * 0.66, s.cy - s.rL * 0.02 * 0.58, k) + Math.sin(t * 1.3) * 2.5 * s.u * (1 - k);
  const sc = lerp(1, 0.58, k);
  const shud = s.shudder > 0 ? Math.sin(t * 60) * 0.035 * s.shudder : 0;
  const W = s.rL * 0.8 * sc;
  const H = s.rL * 1.06 * sc;
  // engine glow
  const ex = 0.47 * s.rL * sc;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(shud);
  ctx.globalCompositeOperation = 'lighter';
  const eg = 0.35 + s.thrust * 0.65;
  for (const sx of [-0.06, 0.06]) {
    glow(ctx, s.cool, sx * s.rL * sc, ex, 26 * s.u * sc * (0.7 + s.thrust), eg);
    glow(ctx, s.white, sx * s.rL * sc, ex, 6 * s.u * sc, eg);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(s.ranger, -W / 2, -H / 2, W, H);
  ctx.restore();
}

function drawParts(s: State, env: SceneEnv) {
  const { ctx } = env;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of s.parts.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 0) {
      // thruster vapour
      glow(ctx, s.white, p.x, p.y, p.size * (2.4 - k), k * 0.35);
    } else {
      glow(ctx, s.warm, p.x, p.y, p.size * 2, k * 0.9);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawDebris(s: State, env: SceneEnv, view: View, t: number) {
  // a few panels and shards drifting out from the broken side of the ring
  const { ctx } = env;
  const step = TAU / MODS;
  for (let i = 0; i < 9; i++) {
    const seed = i * 1.618;
    const th = 9.5 * step + Math.sin(seed * 3) * 0.5;
    const out = 1.05 + ((t * 0.04 + seed * 0.37) % 1) * 0.55;
    const z = Math.sin(seed * 5) * 0.2;
    const sc = project(view, Math.cos(th) * out, Math.sin(th) * out, z);
    const size = (2 + (i % 3) * 1.6) * s.u * sc;
    ctx.save();
    ctx.translate(v3[0], v3[1]);
    ctx.rotate(t * (0.6 + (i % 4) * 0.4) + seed);
    ctx.fillStyle = i % 3 === 0 ? '#c9a24a' : '#b9bec4';
    ctx.globalAlpha = 0.9 * (1 - smoothstep(1.35, 1.6, out));
    ctx.fillRect(-size, -size * 0.55, size * 2, size * 1.1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHud(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const m = Math.min(w, h);
  const gx = w / 2;
  const gy = h - m * 0.07;
  const R = m * 0.085;
  const a0 = Math.PI + 0.42;
  const a1 = TAU - 0.42;
  const q = clamp(s.wR / s.wE, 0, 1.6) / 1.6;
  const ang = lerp(a0, a1, q);
  const inBand = Math.abs(s.wR - s.wE) / s.wE <= TOL;
  const base = 'rgba(175,215,255,';
  // a dark backing so the dial reads over the bright planet
  const bg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 1.6);
  bg.addColorStop(0, 'rgba(0,4,12,0.55)');
  bg.addColorStop(1, 'rgba(0,4,12,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(gx - R * 1.6, gy - R * 1.6, R * 3.2, R * 2.2);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = base + '0.35)';
  ctx.beginPath();
  ctx.arc(gx, gy, R, a0, a1);
  ctx.stroke();
  // ticks
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = lerp(a0, a1, i / 16);
    const r0 = R - (i % 4 === 0 ? 7 : 4) * s.u - 1;
    ctx.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
    ctx.lineTo(gx + Math.cos(a) * R, gy + Math.sin(a) * R);
  }
  ctx.stroke();
  // target band
  const b0 = lerp(a0, a1, (1 - TOL) / 1.6);
  const b1 = lerp(a0, a1, (1 + TOL) / 1.6);
  const live = s.phase === 'ready' || s.phase === 'miss';
  const glowK = s.lock > 0 ? 1 : inBand && live ? 0.75 + 0.25 * Math.sin(t * 14) : 0.45;
  ctx.lineWidth = 4 * s.u + 2;
  ctx.strokeStyle = s.missFlash > 0.05 ? `rgba(255,110,80,${0.5 + s.missFlash * 0.5})` : inBand || s.lock > 0 ? `rgba(140,255,190,${glowK})` : `rgba(255,180,80,${glowK})`;
  ctx.beginPath();
  ctx.arc(gx, gy, R, b0, b1);
  ctx.stroke();
  // needle
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(240,248,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(gx + Math.cos(ang) * R * 0.18, gy + Math.sin(ang) * R * 0.18);
  ctx.lineTo(gx + Math.cos(ang) * (R + 5 * s.u), gy + Math.sin(ang) * (R + 5 * s.u));
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,248,255,0.9)';
  ctx.beginPath();
  ctx.arc(gx, gy, 2.4 * s.u + 1, 0, TAU);
  ctx.fill();

  // brackets around the hub; they close in and turn green on the latch
  const br = s.RS * lerp(0.42, 0.24, s.lock > 0 ? 1 : easeInOutCubic(s.app));
  const blen = br * 0.28;
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = s.lock > 0 ? `rgba(140,255,190,${0.5 + 0.4 * s.lock})` : base + '0.3)';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const sx = i & 1 ? 1 : -1;
    const sy = i & 2 ? 1 : -1;
    const x = s.cx + sx * br;
    const y = s.cy + sy * br;
    ctx.moveTo(x, y - sy * blen);
    ctx.lineTo(x, y);
    ctx.lineTo(x - sx * blen, y);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    touchAction: 'none',
    posterTime: 3.1,
    init: () => ({
      phase: 'ready',
      pt: 0,
      phiE: 0.4,
      phiR: 0,
      wE: W_E,
      wR: 0,
      app: 0,
      holding: false,
      touched: false,
      idle: 0,
      auto: true,
      autoT: 1.2,
      autoTarget: W_E,
      shudder: 0,
      shake: 0,
      flash: 0,
      lock: 0,
      missFlash: 0,
      shock: 0,
      thrust: 0,
      wobT: 0,
      parts: makePool(220),
      pad: null,
      swell: 0,
      seqT: 0,
      seqI: 0,
      tickT: 0,
      cx: 0,
      cy: 0,
      RS: 100,
      u: 1,
      half: 100,
      stars: [],
      gx: 0,
      gy: 0,
      gW: 100,
      garg: null,
      planet: null,
      pR: 100,
      pX: 0,
      pY: 0,
      ranger: null,
      rL: 50,
      faces: makeFaces(),
      nFaces: 0,
      order: [],
      vignette: null,
      warm: glowSprite(128, [
        [0, 'rgba(255,200,130,0.9)'],
        [0.35, 'rgba(255,150,60,0.25)'],
        [1, 'rgba(255,120,40,0)'],
      ]),
      cool: glowSprite(96, [
        [0, 'rgba(200,225,255,0.95)'],
        [0.4, 'rgba(110,160,255,0.35)'],
        [1, 'rgba(80,120,255,0)'],
      ]),
      white: glowSprite(64, [
        [0, 'rgba(255,255,255,1)'],
        [0.5, 'rgba(255,255,255,0.35)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      s.pt += dt;
      s.wobT += dt;
      s.idle += dt;
      if (!env.interactive || (!s.holding && s.idle > (s.touched ? 7 : 1.2))) s.auto = true;

      // the autopilot gives the tile and an idle player something to watch
      if (s.auto && !s.holding && s.phase === 'ready') {
        s.autoT -= dt;
        if (s.autoT <= 0) {
          s.holding = true;
          s.autoTarget = s.wE * (Math.random() < 0.2 ? rand(1.18, 1.3) : rand(0.93, 1.06));
        }
      }
      if (s.auto && s.holding && s.phase === 'ready' && s.wR >= s.autoTarget) {
        s.holding = false;
        s.autoT = rand(1.4, 2.2);
        attempt(s, env);
      }

      const bus = env.audio();
      if (bus && !s.pad) s.pad = startPad(bus);

      s.thrust = damp(s.thrust, s.holding || s.phase === 'docking' ? 1 : 0, 6, dt);
      switch (s.phase) {
        case 'ready':
        case 'miss':
          if (s.holding) {
            s.wR = Math.min(s.wE * 1.6, s.wR + ALPHA * dt);
            // wingtip thrusters fire against the spin
            if (Math.random() < dt * 40) {
              const sc = 1;
              const rx = s.cx;
              const ry = s.cy + s.RS * 0.66;
              for (const side of [-1, 1]) {
                const wx = rx + side * s.rL * 0.35 * sc;
                const wy = ry + s.rL * 0.27 * sc;
                emit(s.parts, wx, wy, side * rand(-10, 10) * s.u, side * -rand(60, 120) * s.u, rand(0.35, 0.6), rand(6, 10) * s.u, 0, 3, 0);
              }
            }
          } else if (s.phase === 'miss') {
            const dir = Math.sign(s.wR);
            s.wR -= dir * 1.5 * dt;
            if (Math.sign(s.wR) !== dir) s.wR = 0;
            if (Math.random() < dt * 30) {
              for (const side of [-1, 1]) {
                const wx = s.cx + side * s.rL * 0.35;
                const wy = s.cy + s.RS * 0.66 + s.rL * 0.27;
                emit(s.parts, wx, wy, 0, side * rand(60, 120) * s.u, rand(0.35, 0.6), rand(6, 10) * s.u, 0, 3, 0);
              }
            }
            if (s.wR === 0 && s.pt > 0.6) setPhase(s, 'ready');
          }
          break;
        case 'docking': {
          // trim the phase so the marks line up while closing in
          const rel = wrapPi(s.phiE - s.phiR);
          const off = wrapPi(rel * 4) / 4;
          const want = s.wE + clamp(off * 3.2, -0.8, 0.8);
          s.wR = damp(s.wR, want, 5, dt);
          s.app = Math.min(1, s.pt / APPROACH_DUR);
          if (s.app >= 1) {
            s.phiR = s.phiE - Math.round(wrapPi(s.phiE - s.phiR) / (TAU / 4)) * (TAU / 4);
            s.wR = s.wE;
            setPhase(s, 'docked');
            clunk(s, env);
          }
          break;
        }
        case 'docked':
          s.wR = s.wE;
          s.phiR = s.phiE - Math.round(wrapPi(s.phiE - s.phiR) / (TAU / 4)) * (TAU / 4);
          if (s.pt > 1.6) setPhase(s, 'despin');
          break;
        case 'despin': {
          // the joined ships bleed the spin off together
          const w = Math.max(0, s.wE - 0.55 * dt);
          s.wE = w;
          s.wR = w;
          s.phiR = s.phiE - Math.round(wrapPi(s.phiE - s.phiR) / (TAU / 4)) * (TAU / 4);
          if (Math.random() < dt * 24 && w > 0.05) {
            const sc = 0.58;
            for (const side of [-1, 1]) {
              emit(s.parts, s.cx + side * s.rL * 0.35 * sc, s.cy + s.rL * 0.27 * sc, side * rand(40, 90) * s.u, rand(-20, 20) * s.u, rand(0.3, 0.5), rand(5, 8) * s.u, 0, 3, 0);
            }
          }
          if (w <= 0) setPhase(s, 'rest');
          break;
        }
        case 'rest':
          if (s.pt > 2.6) setPhase(s, 'fade');
          break;
        case 'fade':
          if (s.pt > 0.55 && s.app > 0) {
            reset(s);
            s.phase = 'fade';
            s.pt = 0.56;
          }
          if (s.pt > 1.1) setPhase(s, 'ready');
          break;
      }
      s.phiE += s.wE * dt;
      s.phiR += s.wR * dt;
      if (s.phase !== 'docking' && s.phase !== 'docked' && s.phase !== 'despin' && s.phase !== 'rest' && s.phase !== 'fade')
        s.app = damp(s.app, 0, 3, dt);

      // venting gas from the torn end of the ring is placed during draw; age the pool here
      stepPool(s.parts, dt);
      s.shudder = Math.max(0, s.shudder - dt * 2.2);
      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.flash = Math.max(0, s.flash - dt * 2.2);
      s.missFlash = Math.max(0, s.missFlash - dt * 1.4);
      if (s.lock > 0 && (s.phase === 'ready' || s.phase === 'fade')) s.lock = Math.max(0, s.lock - dt * 2);
      if (s.shock > 0) s.shock = s.shock + dt * 1.6;
      if (s.shock > 1) s.shock = 0;

      // the score
      if (bus) {
        const ratio = clamp(s.wR / s.wE, 0, 1.5);
        let target = 0.025;
        let cut = 500;
        if (s.holding) {
          target = 0.04 + 0.1 * Math.min(1, ratio);
          cut = 600 + 2600 * Math.min(1, ratio);
        } else if (s.phase === 'docking') {
          target = 0.13;
          cut = 3000;
        } else if (s.phase === 'docked' || s.phase === 'despin') {
          target = 0.15 - Math.min(0.1, s.pt * 0.02);
          cut = 3200;
        } else if (s.phase === 'rest' || s.phase === 'fade') {
          target = 0.03;
          cut = 700;
        }
        s.swell = damp(s.swell, target, 2, dt);
        const intense = s.holding || s.phase === 'docking';
        s.seqT -= dt;
        if (s.seqT <= 0) {
          s.seqT += 0.15;
          const bar = (s.seqI >> 4) % 4;
          if (s.pad && (s.seqI & 15) === 0) setPad(s.pad, s.swell, cut, s.phase === 'docked' || s.phase === 'despin' ? RESOLVE : CHORDS[bar]);
          if (intense || s.phase === 'docked') {
            const f = ROOTS[bar] * Math.pow(2, FIGURE[s.seqI & 7] / 12);
            const g = 0.016 + 0.03 * Math.min(1, ratio);
            tone(bus, f, { type: 'square', attack: 0.004, decay: 0.12, gain: g * 0.6 });
            tone(bus, f * 2, { type: 'sine', attack: 0.004, decay: 0.1, gain: g * 0.5 });
          }
          s.seqI++;
        }
        if (s.pad) setPad(s.pad, s.swell, cut, null);
        s.tickT -= dt;
        if (s.tickT <= 0) {
          s.tickT += 1.25;
          tone(bus, 2400, { type: 'triangle', attack: 0.001, decay: 0.03, gain: 0.025 });
          noise(bus, { duration: 0.02, gain: 0.03, freq: 4200, q: 3, type: 'bandpass' });
        }
      }
      if (env.reducedMotion && (s.holding || s.phase === 'docking' || s.phase === 'docked' || s.phase === 'miss')) env.wake(300);
      void t;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      ctx.save();
      if (s.shake > 0.02 && !env.reducedMotion) {
        const a = s.shake * s.shake * 7 * s.u;
        ctx.translate(shakeX(a, t), shakeY(a, t));
      }
      drawBackdrop(s, env, t);
      const view = drawStation(s, env, t);
      drawDebris(s, env, view, t);
      // vapour from the torn end of the ring, emitted in screen space from where it is now
      if (!env.reducedMotion || s.holding) {
        const th = 8 * (TAU / MODS) + 0.28;
        project(view, Math.cos(th), Math.sin(th), 0);
        const vx = v3[0];
        const vy = v3[1];
        project(view, Math.cos(th + 0.3) * 1.05, Math.sin(th + 0.3) * 1.05, 0);
        const dx = v3[0] - vx;
        const dy = v3[1] - vy;
        if (Math.random() < 0.55)
          emit(s.parts, vx, vy, dx * rand(1.5, 3), dy * rand(1.5, 3), rand(0.5, 0.9), rand(4, 7) * s.u, 0, 1.2, 0);
      }
      drawParts(s, env);
      drawRanger(s, env, t);
      if (s.shock > 0) {
        ctx.strokeStyle = `rgba(200,255,220,${(1 - s.shock) * 0.7})`;
        ctx.lineWidth = 2 + 4 * (1 - s.shock);
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.RS * (0.08 + s.shock * 0.7), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      drawHud(s, env, t);
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(255,245,225,${(s.flash * 0.28).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      if (s.phase === 'fade') {
        const k = s.pt < 0.55 ? s.pt / 0.55 : 1 - (s.pt - 0.55) / 0.55;
        ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 1).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      stopPad(s.pad);
      s.pad = null;
      freeCanvas(s.garg, s.planet, s.ranger, s.warm, s.cool, s.white);
      s.garg = s.planet = s.ranger = null;
    },
  });
