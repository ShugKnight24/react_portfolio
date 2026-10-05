import {
  clamp,
  createCanvasScene,
  damp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  noise,
  rand,
  TAU,
  tone,
} from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  BONE,
  burstPath,
  copyPose,
  drawDbzFighter,
  GOKU,
  makeMotes,
  makePose,
  mixPose,
  mulberry32,
  settleLimbs,
  smoothstep,
  VEGETA,
} from './dbz-kit';
import type { DbzPose, FigureAnchors, Mote } from './dbz-kit';

/**
 * Gravity Chamber: Goku and Vegeta train inside the round Capsule Corp dome. They cycle through
 * push-ups, pull-ups, crunches, sparring and heavy lifting. Raise the gravity and the room turns
 * red, every rep slows and shakes, sweat falls harder and the floor cracks under the load.
 */

const P = (a: number[]): DbzPose => ({
  hipX: a[0],
  hipY: a[1],
  neckX: a[2],
  neckY: a[3],
  tilt: a[4],
  nEx: a[5],
  nEy: a[6],
  nHx: a[7],
  nHy: a[8],
  fEx: a[9],
  fEy: a[10],
  fHx: a[11],
  fHy: a[12],
  nKx: a[13],
  nKy: a[14],
  nFx: a[15],
  nFy: a[16],
  fKx: a[17],
  fKy: a[18],
  fFx: a[19],
  fFy: a[20],
});

// hip, neck, tilt, near elbow/hand, far elbow/hand, near knee/ankle, far knee/ankle
const GUARD = P([0, 0.44, 0.03, 0.765, -0.05, 0.1, 0.6, 0.17, 0.72, 0.02, 0.58, 0.11, 0.68, 0.12, 0.25, 0.17, 0.06, -0.09, 0.25, -0.16, 0.06]);
const DASH = P([0.05, 0.42, 0.14, 0.72, 0, 0.22, 0.56, 0.3, 0.66, 0.14, 0.55, 0.23, 0.62, 0.2, 0.27, 0.2, 0.07, -0.05, 0.22, -0.2, 0.12]);
const PUNCH = P([0.05, 0.43, 0.12, 0.75, 0, 0.27, 0.72, 0.42, 0.72, -0.03, 0.6, 0.06, 0.52, 0.22, 0.25, 0.3, 0.06, -0.07, 0.24, -0.22, 0.07]);
const BLOCK = P([-0.03, 0.43, -0.04, 0.755, -0.1, 0.08, 0.63, 0.1, 0.78, 0.04, 0.6, 0.09, 0.72, 0.1, 0.25, 0.16, 0.06, -0.14, 0.24, -0.22, 0.06]);
const KICK = P([0, 0.47, -0.13, 0.77, 0.1, -0.1, 0.6, 0.0, 0.68, -0.25, 0.64, -0.3, 0.52, 0.2, 0.6, 0.41, 0.66, -0.02, 0.26, -0.06, 0.06]);
const POSES = [GUARD, DASH, PUNCH, BLOCK, KICK];
const [G_, D_, P_, B_, K_] = [0, 1, 2, 3, 4];
// Between stations: stand tall, then a tucked hop
const STAND = settleLimbs(P([0, 0.47, 0.02, 0.795, 0.02, -0.02, 0.6, 0.06, 0.5, -0.06, 0.6, -0.01, 0.49, 0.1, 0.27, 0.08, 0.06, -0.02, 0.27, -0.07, 0.06]));
const TUCK = settleLimbs(P([0, 0.5, 0.07, 0.815, 0.12, 0.14, 0.66, 0.22, 0.76, 0.02, 0.64, 0.1, 0.74, 0.22, 0.42, 0.08, 0.24, 0.14, 0.36, -0.02, 0.22]));

/** Keyframes in base seconds: t, Goku pose, Goku x, Vegeta pose, Vegeta x, impact id (0 none) */
const KF: readonly (readonly [number, number, number, number, number, number])[] = [
  [0.0, G_, -0.6, G_, 0.6, 0],
  [0.12, D_, -0.34, G_, 0.52, 0],
  [0.22, P_, -0.16, B_, 0.36, 1],
  [0.34, G_, -0.3, B_, 0.44, 0],
  [0.44, G_, -0.36, D_, 0.3, 0],
  [0.54, B_, -0.36, K_, 0.17, 2],
  [0.68, B_, -0.46, G_, 0.3, 0],
  [0.8, G_, -0.5, G_, 0.5, 0],
  [0.9, D_, -0.47, D_, 0.47, 0],
  [0.98, P_, -0.43, P_, 0.43, 3],
  [1.14, P_, -0.48, P_, 0.48, 0],
  [1.5, G_, -0.6, G_, 0.6, 0],
];
const EX_END = 1.5;
const HOP_A = 1.14;

/* ---------- training modes ---------- */

const M_PUSH = 0;
const M_PULL = 1;
const M_CRUNCH = 2;
const M_SPAR = 3;
const M_LIFT = 4;
const MODES = 5;
/** Seconds per mode when nobody has picked one */
const AUTO_CYCLE = 8;
/** Seconds to stand, hop across and settle into the next station */
const TR_TIME = 1.35;
/** Fighter origins per mode in figure heights from the centre: Goku, Vegeta */
const STATION: readonly (readonly [number, number])[] = [
  [-0.34, 0.34],
  [-0.62, 0.62],
  [-0.38, 0.38],
  [-0.6, 0.6],
  [-0.64, 0.64],
];
/** Seconds per rep at 1g, Goku and Vegeta */
const REP_TIME: readonly (readonly [number, number])[] = [
  [1.5, 1.5],
  [2.1, 2.1],
  [1.25, 1.25],
  [0, 0],
  [2.4, 1.9],
];
/** Phase at which a rep locks out and counts */
const COUNT_AT: readonly (readonly [number, number])[] = [
  [0.84, 0.84],
  [0.4, 0.4],
  [0.38, 0.38],
  [0, 0],
  [0.86, 0.36],
];
/** Where the floor takes the load, local x */
const LOAD_X = [0, -0.34, 0, 0, 0];
// Pull-up rig in local figure units: bar grip, the far end of the bar sits deeper in the room
const BAR = 1.0;
const BAR_X = 0.1;
const BAR_DX = -0.035;
const BAR_DY = 0.045;
const RIG_X = -0.34;

const SP = BONE.spine;
const HALF_PI = Math.PI / 2;

const MAX_MOTES = 260;
const GHOSTS = 6;
const STREAKS = 40;

interface Burst {
  x: number;
  y: number;
  age: number;
  str: number;
  seed: number;
}

interface Ghost {
  x: number;
  y: number;
  pose: DbzPose;
  age: number;
}

interface Crack {
  pts: Float32Array;
  lens: Float32Array;
  total: number;
  width: number;
}

interface Hum {
  bus: AudioBus;
  osc: OscillatorNode;
  sub: OscillatorNode;
  lp: BiquadFilterNode;
  gain: GainNode;
}

interface Trainee {
  pose: DbzPose;
  from: DbzPose;
  x: number;
  fromX: number;
  prevX: number;
  hop: number;
  speed: number;
  phase: number;
  reps: number;
  popT: number;
  effort: number;
  loadX: number;
  anchor: FigureAnchors | null;
  ghosts: Ghost[];
}

interface State {
  touched: boolean;
  G: number;
  g: number;
  mode: number;
  /** Transition progress 0..1, or -1 when settled at a station */
  tr: number;
  autoT: number;
  locked: boolean;
  modeFlash: number;
  boost: number;
  rig: number;
  prop: number;
  exT: number;
  queued: boolean;
  fired: number;
  hitStop: number;
  shake: number;
  flash: number;
  idleT: number;
  crack: number;
  bursts: Burst[];
  motes: Mote[];
  cursor: number;
  ghostT: number;
  streaks: Float32Array;
  cracks: Crack[];
  gk: Trainee;
  vg: Trainee;
  tmp: DbzPose;
  sweatAcc: number;
  // input
  downX: number;
  downY: number;
  downG: number;
  dragging: boolean;
  slider: boolean;
  ui: boolean;
  pointerDown: boolean;
  lastStep: number;
  hum: Hum | null;
  // layout
  cx: number;
  gy: number;
  H: number;
  floorY: number;
  rxF: number;
  ryF: number;
  domeH: number;
  shakeX: number;
  shakeY: number;
}

function makeCracks(): Crack[] {
  const rng = mulberry32(77);
  const out: Crack[] = [];
  for (let i = 0; i < 18; i++) {
    let a = rng() * TAU;
    let u = Math.cos(a) * 0.04;
    let d = Math.sin(a) * 0.04;
    const segs = 4 + Math.floor(rng() * 4);
    const pts = new Float32Array((segs + 1) * 2);
    const lens = new Float32Array(segs + 1);
    pts[0] = u;
    pts[1] = d;
    let total = 0;
    for (let s = 1; s <= segs; s++) {
      a += (rng() - 0.5) * 0.9;
      const len = 0.04 + rng() * 0.07;
      u += Math.cos(a) * len;
      d += Math.sin(a) * len;
      pts[s * 2] = u;
      pts[s * 2 + 1] = d;
      total += len;
      lens[s] = total;
    }
    out.push({ pts, lens, total, width: 0.6 + rng() * 0.9 });
  }
  return out;
}

const timeScale = (g: number) => 1 + 0.95 * g;

function emit(s: State, x: number, y: number, vx: number, vy: number, life: number, size: number, kind: number) {
  const p = s.motes[s.cursor];
  s.cursor = (s.cursor + 1) % MAX_MOTES;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.max = life;
  p.size = size;
  p.kind = kind;
  p.rot = rand(0, TAU);
}

/** Apply the weight of the room: lower hips, hunched shoulders, knees splayed */
function weigh(p: DbzPose, G: number, t: number) {
  const d = 0.075 * G;
  const tr = Math.sin(t * 31) * 0.003 * G;
  p.hipY -= d + tr;
  p.neckY -= d * 1.3 + tr;
  p.neckX += 0.035 * G;
  p.nEy -= d * 1.2;
  p.nHy -= d * 1.1;
  p.fEy -= d * 1.2;
  p.fHy -= d * 1.1;
  p.nKx += 0.05 * G;
  p.fKx -= 0.05 * G;
  p.nKy -= 0.025 * G;
  p.fKy -= 0.025 * G;
  p.nFx += 0.02 * G;
  p.fFx -= 0.02 * G;
  p.tilt -= 0.12 * G;
}

/* ---------- exercises ---------- */

/** Rep shape: eases 0 to 1 by a, holds until b, eases back to 0 by c, rests until the loop */
function cycle(ph: number, a: number, b: number, c: number) {
  if (ph < a) return easeInOutCubic(ph / a);
  if (ph < b) return 1;
  if (ph < c) return 1 - easeInOutCubic((ph - b) / (c - b));
  return 0;
}

/** How hard the rep is at this moment: the lifting half of the rep is the grind */
function effortOf(ph: number, a: number, b: number, c: number, downFirst: boolean) {
  if (downFirst) return ph < a ? 0.4 : ph < b ? 0.75 : ph < c ? 1 : 0.15;
  return ph < a ? 1 : ph < b ? 0.8 : ph < c ? 0.4 : 0.15;
}

/** Plank on the knuckles; Vegeta goes one arm with the other hand on his back */
function pushUp(p: DbzPose, ph: number, g: number, t: number, oneArm: boolean) {
  const a = 0.4;
  const b = 0.5;
  const c = 0.84;
  const k = cycle(ph, a, b, c);
  const shake = Math.sin(t * 37) * 0.0035 * g * (0.4 + k);
  const ax = -0.72;
  const ay = 0.11;
  const leg = 0.42;
  const shY = lerp(0.3, 0.14, k) + shake;
  const th = Math.asin(clamp((shY - ay + 0.012) / (leg + SP - 0.035), -1, 1));
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  p.hipX = ax + cs * leg;
  p.hipY = ay + sn * leg - 0.014 * k * g;
  p.neckX = ax + cs * (leg + SP);
  p.neckY = ay + sn * (leg + SP);
  p.tilt = 0.55 + 0.2 * k;
  p.nFx = ax;
  p.nFy = ay;
  p.fFx = ax - 0.025;
  p.fFy = ay + 0.004;
  p.nKx = (p.hipX + ax) / 2;
  p.nKy = (p.hipY + ay) / 2 - 0.06;
  p.fKx = p.nKx - 0.01;
  p.fKy = p.nKy;
  p.nHx = oneArm ? 0.03 : 0;
  p.nHy = 0.045;
  p.nEx = p.neckX - 0.3;
  p.nEy = p.neckY + 0.02;
  if (oneArm) {
    // Free fist on the small of the back, elbow pointing at the ceiling
    p.fHx = p.hipX + cs * 0.08 - sn * 0.11;
    p.fHy = p.hipY + sn * 0.08 + cs * 0.11;
    p.fEx = p.hipX + cs * 0.22;
    p.fEy = p.hipY + 0.3;
  } else {
    p.fHx = 0.025;
    p.fHy = 0.05;
    p.fEx = p.nEx;
    p.fEy = p.nEy;
  }
  settleLimbs(p);
  return effortOf(ph, a, b, c, true);
}

/** Dead hang to chin over the bar; Goku tucks his legs, Vegeta holds an L-sit */
function pullUp(p: DbzPose, ph: number, g: number, t: number, lSit: boolean) {
  const a = 0.4;
  const b = 0.5;
  const c = 0.86;
  const k = cycle(ph, a, b, c);
  const shake = Math.sin(t * 37) * 0.003 * g * k;
  const ang = HALF_PI + lerp(0.05, 0.2, k) + (lSit ? 0.08 : 0);
  const sway = Math.sin(t * 1.7) * 0.01 * (1 - k);
  p.neckX = lerp(BAR_X - 0.03, BAR_X - 0.1, k) + sway;
  p.neckY = lerp(BAR - 0.235, BAR + 0.015, k) + shake;
  p.hipX = p.neckX - Math.cos(ang) * SP;
  p.hipY = p.neckY - Math.sin(ang) * SP;
  p.tilt = lerp(-0.05, 0.4, k);
  p.nHx = BAR_X;
  p.nHy = BAR;
  p.fHx = BAR_X + BAR_DX;
  p.fHy = BAR + BAR_DY;
  p.nEx = p.neckX + 0.2;
  p.nEy = p.neckY - 0.25;
  p.fEx = p.nEx;
  p.fEy = p.nEy;
  if (lSit) {
    p.nFx = p.hipX + 0.41;
    p.nFy = p.hipY - 0.07;
    p.fFx = p.nFx - 0.02;
    p.fFy = p.nFy + 0.012;
    p.nKx = p.hipX + 0.2;
    p.nKy = p.hipY - 0.12;
  } else {
    // Knees bent, ankles crossed behind
    p.nFx = p.hipX - 0.08;
    p.nFy = p.hipY - 0.26;
    p.fFx = p.hipX - 0.13;
    p.fFy = p.hipY - 0.23;
    p.nKx = p.hipX + 0.2;
    p.nKy = p.hipY - 0.12;
  }
  p.fKx = p.nKx;
  p.fKy = p.nKy;
  settleLimbs(p);
  return effortOf(ph, a, b, c, false);
}

/** On the back, knees bent, fingers laced behind the head, curl up and lower */
function crunch(p: DbzPose, ph: number, g: number, t: number) {
  const a = 0.38;
  const b = 0.5;
  const c = 0.86;
  const k = cycle(ph, a, b, c);
  const ang = Math.PI - lerp(0.14, 0.78, k) + Math.sin(t * 37) * 0.02 * g * k;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const fx = uy;
  const fy = -ux;
  p.hipX = 0;
  p.hipY = 0.11;
  p.neckX = ux * SP;
  p.neckY = 0.11 + uy * SP;
  const hx = p.neckX + ux * 0.098 + fx * 0.014;
  const hy = p.neckY + uy * 0.098 + fy * 0.014;
  p.nHx = hx - fx * 0.065 - ux * 0.005;
  p.nHy = hy - fy * 0.065 - uy * 0.005;
  p.fHx = hx - fx * 0.06 + ux * 0.01;
  p.fHy = hy - fy * 0.06 + uy * 0.01;
  p.nEx = p.neckX + fx * 0.2 + ux * 0.06;
  p.nEy = p.neckY + fy * 0.2 + uy * 0.06;
  p.fEx = p.nEx;
  p.fEy = p.nEy;
  p.nFx = 0.26;
  p.nFy = 0.06;
  p.fFx = 0.28;
  p.fFy = 0.062;
  p.nKx = 0.16;
  p.nKy = 0.45;
  p.fKx = 0.16;
  p.fKy = 0.45;
  p.tilt = -0.1 - 0.25 * k;
  settleLimbs(p);
  return effortOf(ph, a, b, c, false);
}

// Where the barbell rests: down the spine from the neck and back from it, on the upper traps
const BAR_DOWN = 0.065;
const BAR_BACK = 0.06;

/** Back squat with the bar across the traps */
function squat(p: DbzPose, ph: number, g: number, t: number) {
  const a = 0.42;
  const b = 0.5;
  const c = 0.86;
  const k = cycle(ph, a, b, c);
  const shake = Math.sin(t * 37) * 0.004 * g * (0.3 + k);
  p.nFx = 0.0;
  p.nFy = 0.06;
  p.fFx = -0.03;
  p.fFy = 0.064;
  p.hipX = lerp(-0.06, -0.2, k);
  p.hipY = lerp(0.46, 0.25, k) + shake;
  const ang = HALF_PI - lerp(0.12, 0.62, k);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const fx = uy;
  const fy = -ux;
  p.neckX = p.hipX + ux * SP;
  p.neckY = p.hipY + uy * SP;
  // Hands wrap the bar just in front of it, elbows driven back and down
  const bx = p.neckX - ux * BAR_DOWN - fx * BAR_BACK;
  const by = p.neckY - uy * BAR_DOWN - fy * BAR_BACK;
  p.nHx = bx + fx * 0.03;
  p.nHy = by + fy * 0.03;
  p.fHx = bx + fx * 0.035 + 0.008;
  p.fHy = by + fy * 0.035 + 0.02;
  p.nEx = bx - fx * 0.15 - ux * 0.18;
  p.nEy = by - fy * 0.15 - uy * 0.18;
  p.fEx = p.nEx;
  p.fEy = p.nEy;
  p.nKx = p.hipX + 0.35;
  p.nKy = p.hipY - 0.05;
  p.fKx = p.nKx;
  p.fKy = p.nKy;
  p.tilt = lerp(0.1, 0.5, k);
  settleLimbs(p);
  return effortOf(ph, a, b, c, true);
}

/** One-arm dumbbell press, free fist on the hip */
function press(p: DbzPose, ph: number, g: number, t: number) {
  const a = 0.36;
  const b = 0.48;
  const c = 0.86;
  const k = cycle(ph, a, b, c);
  const shake = Math.sin(t * 37) * 0.004 * g * (0.3 + k);
  p.hipX = 0;
  p.hipY = 0.46 - 0.02 * g;
  const ang = HALF_PI - 0.03 + 0.07 * k;
  p.neckX = p.hipX + Math.cos(ang) * SP;
  p.neckY = p.hipY + Math.sin(ang) * SP;
  p.nFx = 0.12;
  p.nFy = 0.06;
  p.fFx = -0.12;
  p.fFy = 0.06;
  p.nKx = 0.2;
  p.nKy = 0.3;
  p.fKx = 0.0;
  p.fKy = 0.3;
  p.nHx = lerp(0.13, 0.09, k) + Math.sin(k * Math.PI) * 0.03 + shake;
  p.nHy = lerp(0.76, 1.02, k);
  p.nEx = lerp(0.22, 0.2, k);
  p.nEy = lerp(0.55, 0.9, k);
  p.fHx = p.hipX - 0.01;
  p.fHy = p.hipY + 0.09;
  p.fEx = p.hipX - 0.2;
  p.fEy = p.hipY + 0.22;
  p.tilt = 0.05 + 0.3 * k;
  settleLimbs(p);
  return effortOf(ph, a, b, c, false);
}

/** Writes the pose for this mode and phase; returns the effort 0..1 */
function exercise(mode: number, p: DbzPose, ph: number, g: number, t: number, vegeta: boolean) {
  const q = Math.max(0, ph);
  if (mode === M_PUSH) return pushUp(p, q, g, t, vegeta);
  if (mode === M_PULL) return pullUp(p, q, g, t, vegeta);
  if (mode === M_CRUNCH) return crunch(p, q, g, t);
  if (mode === M_LIFT) return vegeta ? press(p, q, g, t) : squat(p, q, g, t);
  copyPose(p, GUARD);
  return 0.2;
}

/* ---------- audio ---------- */

function startHum(bus: AudioBus): Hum {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.connect(gain);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  osc.connect(lp);
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 27.5;
  sub.connect(gain);
  osc.start(now);
  sub.start(now);
  return { bus, osc, sub, lp, gain };
}

function stopHum(h: Hum) {
  const now = h.bus.ctx.currentTime;
  h.gain.gain.cancelScheduledValues(now);
  h.gain.gain.setTargetAtTime(0.0001, now, 0.05);
  for (const n of [h.osc, h.sub]) {
    try {
      n.stop(now + 0.3);
    } catch {
      /* already stopped */
    }
  }
}

function ensureHum(s: State, env: SceneEnv) {
  if (s.hum) return;
  const bus = env.audio();
  if (bus) s.hum = startHum(bus);
}

/* ---------- layout helpers ---------- */

const sliderX = (env: SceneEnv) => env.w - Math.max(30, env.w * 0.035);
const sliderTop = (env: SceneEnv) => env.h * 0.2;
const sliderBot = (env: SceneEnv) => env.h * 0.8;

function setFromSlider(s: State, env: SceneEnv, y: number) {
  s.G = clamp((sliderBot(env) - y) / (sliderBot(env) - sliderTop(env)), 0, 1);
}

/** Mode selector: a row of icon buttons across the top */
function selector(env: SceneEnv) {
  const S = clamp(Math.min(env.w * 0.075, env.h * 0.085), 24, 40);
  const gap = S * 0.3;
  const x0 = env.w / 2 - (MODES * S + (MODES - 1) * gap) / 2 + S / 2;
  const y = Math.max(8, env.h * 0.025) + S / 2;
  return { S, gap, x0, y };
}

function hitSelector(env: SceneEnv, x: number, y: number) {
  const L = selector(env);
  if (Math.abs(y - L.y) > L.S * 0.75) return -1;
  const i = Math.round((x - L.x0) / (L.S + L.gap));
  if (i < 0 || i >= MODES) return -1;
  return Math.abs(x - (L.x0 + i * (L.S + L.gap))) <= (L.S + L.gap) / 2 ? i : -1;
}

function trigger(s: State, env: SceneEnv) {
  if (s.mode !== M_SPAR || s.tr >= 0) {
    // Outside sparring the same input is a burst of effort
    s.boost = 1;
    const bus = env.audio();
    if (bus) noise(bus, { duration: 0.16, freq: 700, q: 1.4, gain: 0.12 });
    env.wake(1800);
    return;
  }
  if (s.exT >= 0 && s.exT < EX_END * 0.8) {
    s.queued = true;
    return;
  }
  s.exT = 0;
  s.fired = 0;
  env.wake(4200);
}

function setMode(s: State, env: SceneEnv, mode: number, manual: boolean) {
  const next = ((mode % MODES) + MODES) % MODES;
  if (manual) s.locked = true;
  s.autoT = 0;
  if (next === s.mode && s.tr < 0) return;
  s.mode = next;
  s.modeFlash = 1;
  s.exT = -1;
  s.queued = false;
  s.gk.reps = 0;
  s.vg.reps = 0;
  for (const f of [s.gk, s.vg]) {
    copyPose(f.from, f.pose);
    f.fromX = f.x;
    f.hop = 0;
  }
  if (env.reducedMotion) {
    // No hop across the room: snap straight to the new station
    s.tr = -1;
    settle(s);
    s.rig = next === M_PULL ? 1 : 0;
    s.prop = next === M_LIFT ? 1 : 0;
    env.wake(1600);
  } else {
    s.tr = 0;
    env.wake(2600);
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, 520, { type: 'triangle', decay: 0.07, gain: 0.05 });
    tone(bus, 780, { type: 'triangle', decay: 0.1, gain: 0.05, delay: 0.06 });
    if (!env.reducedMotion) noise(bus, { duration: 0.35, freq: 900, q: 0.6, gain: 0.08 });
  }
}

/** Arrived at a station: start the reps, Vegeta half a rep behind so they alternate */
function settle(s: State) {
  const [gx, vx] = STATION[s.mode];
  s.gk.x = gx;
  s.vg.x = vx;
  s.gk.phase = 0;
  s.vg.phase = s.mode === M_CRUNCH || s.mode === M_PUSH ? -0.5 : -0.25;
  s.gk.hop = 0;
  s.vg.hop = 0;
  s.idleT = 0.5;
}

function rep(s: State, env: SceneEnv, f: Trainee, facing: 1 | -1) {
  f.reps++;
  f.popT = 0;
  const H = s.H;
  const g = s.g;
  const lx = s.cx + f.loadX * H;
  if (f.anchor) {
    // A flick of sweat off the brow at every lockout
    for (let i = 0; i < 2 + Math.round(3 * g); i++) {
      emit(s, f.anchor.headX, f.anchor.headY, facing * H * rand(-0.1, 0.35), -H * rand(0.1, 0.5) * (1 - 0.7 * g), 3, rand(1.3, 2.2) * (0.6 + H / 500), 0);
    }
  }
  if (g > 0.4) {
    s.crack = Math.min(1, s.crack + 0.04 * g);
    s.shake = Math.max(s.shake, 0.12 * g);
    for (let i = 0; i < Math.round(4 * g); i++) {
      emit(s, lx + rand(-0.15, 0.15) * H, s.gy, rand(-0.35, 0.35) * H, -rand(0.15, 0.45) * H, rand(0.5, 0.9), rand(1.3, 2.6), 3);
    }
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, 120 - 55 * g, { type: 'sine', glideTo: 45, decay: 0.16 + 0.25 * g, gain: 0.12 + 0.12 * g });
    noise(bus, { duration: 0.08, freq: 500 + Math.random() * 300, q: 1.2, gain: 0.05 + 0.05 * g });
    if (s.mode === M_LIFT) tone(bus, 1400 + Math.random() * 200, { type: 'triangle', decay: 0.18, gain: 0.03 });
    if (f.reps % 10 === 0) tone(bus, 880, { type: 'triangle', decay: 0.25, gain: 0.05 });
  }
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    // Lifting: Goku sits at the bottom of a squat while Vegeta locks the dumbbell out overhead
    posterTime: 0.46 * REP_TIME[M_LIFT][0] * timeScale(0.62),
    cursor: 'ns-resize',
    touchAction: 'none',
    init: (env) => {
      const demo = !env.interactive || env.reducedMotion;
      const streaks = new Float32Array(STREAKS * 3);
      for (let i = 0; i < STREAKS; i++) {
        streaks[i * 3] = Math.random();
        streaks[i * 3 + 1] = Math.random();
        streaks[i * 3 + 2] = 0.5 + Math.random() * 0.5;
      }
      const ghost = (): Ghost => ({ x: 0, y: 0, pose: copyPose(makePose(), GUARD), age: 9 });
      const trainee = (x: number): Trainee => ({
        pose: copyPose(makePose(), GUARD),
        from: copyPose(makePose(), GUARD),
        x,
        fromX: x,
        prevX: x,
        hop: 0,
        speed: 0,
        phase: 0,
        reps: 0,
        popT: 9,
        effort: 0,
        loadX: x,
        anchor: null,
        ghosts: Array.from({ length: GHOSTS }, ghost),
      });
      const s: State = {
        touched: false,
        G: demo ? 0.62 : 0.3,
        g: demo ? 0.62 : 0.3,
        mode: demo ? M_LIFT : M_PUSH,
        tr: -1,
        autoT: 0,
        locked: false,
        modeFlash: 0,
        boost: 0,
        rig: 0,
        prop: 0,
        exT: -1,
        queued: false,
        fired: 0,
        hitStop: 0,
        shake: 0,
        flash: 0,
        idleT: 0.5,
        crack: 0,
        bursts: Array.from({ length: 4 }, () => ({ x: 0, y: 0, age: 9, str: 0, seed: 0 })),
        motes: makeMotes(MAX_MOTES),
        cursor: 0,
        ghostT: 0,
        streaks,
        cracks: makeCracks(),
        gk: trainee(-0.6),
        vg: trainee(0.6),
        tmp: makePose(),
        sweatAcc: 0,
        downX: 0,
        downY: 0,
        downG: 0,
        dragging: false,
        slider: false,
        ui: false,
        pointerDown: false,
        lastStep: -1,
        hum: null,
        cx: 0,
        gy: 0,
        H: 1,
        floorY: 0,
        rxF: 0,
        ryF: 0,
        domeH: 0,
        shakeX: 0,
        shakeY: 0,
      };
      settle(s);
      s.rig = s.mode === M_PULL ? 1 : 0;
      s.prop = s.mode === M_LIFT ? 1 : 0;
      return s;
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.cx = w / 2;
      s.H = Math.min(h * 0.5, w * 0.3);
      s.gy = h * 0.88;
      s.floorY = h * 0.66;
      s.rxF = Math.max(w * 0.78, s.H * 2.4);
      s.ryF = h * 0.2;
      s.domeH = h * 0.95;
    },
    update: (s, env, dtIn, t) => {
      const rm = env.reducedMotion;
      const demo = !s.touched && (!env.interactive || rm);
      const H = s.H;
      s.g = damp(s.g, s.G, 5, dtIn);
      const g = s.g;
      const { gk, vg } = s;

      let dt = dtIn;
      if (s.hitStop > 0) {
        s.hitStop -= dtIn;
        dt = 0;
      }
      s.flash = Math.max(0, s.flash - dtIn * 4);
      s.shake = Math.max(0, s.shake - dtIn * 3);
      s.modeFlash = Math.max(0, s.modeFlash - dtIn * 2.5);
      s.boost = Math.max(0, s.boost - dtIn * 0.8);
      gk.popT += dtIn;
      vg.popT += dtIn;

      // Gravity steps tick like a dial
      const step = Math.round(s.G * 10);
      if (step !== s.lastStep) {
        if (s.lastStep >= 0) {
          const bus = env.audio();
          if (bus) tone(bus, 600 + step * 90, { type: 'square', decay: 0.04, gain: 0.03 });
        }
        s.lastStep = step;
      }
      if (s.hum) {
        const now = s.hum.bus.ctx.currentTime;
        s.hum.gain.gain.setTargetAtTime(0.025 + 0.07 * g, now, 0.1);
        s.hum.osc.frequency.setTargetAtTime(48 + 34 * g, now, 0.1);
        s.hum.sub.frequency.setTargetAtTime(24 + 17 * g, now, 0.1);
        s.hum.lp.frequency.setTargetAtTime(260 + 900 * g, now, 0.1);
      }

      // Nobody picked a workout yet: rotate through them
      if (!s.locked && s.tr < 0 && s.exT < 0) {
        s.autoT += dtIn;
        if (s.autoT >= AUTO_CYCLE) setMode(s, env, s.mode + 1, false);
      }

      gk.prevX = gk.x;
      vg.prevX = vg.x;
      let stand = 0;

      if (s.tr >= 0) {
        // Stand up, hop to the next station, drop into the first rep
        s.tr = Math.min(1, s.tr + dt / (TR_TIME * (1 + 0.3 * g)));
        const q = s.tr;
        const [gx, vx] = STATION[s.mode];
        for (const [f, x, veg] of [
          [gk, gx, false],
          [vg, vx, true],
        ] as const) {
          if (q < 0.3) {
            const k = easeInOutCubic(q / 0.3);
            mixPose(f.pose, f.from, STAND, k);
            f.x = f.fromX;
            f.hop = 0;
            stand = k;
          } else if (q < 0.7) {
            const k = (q - 0.3) / 0.4;
            const arc = Math.sin(Math.PI * k);
            mixPose(f.pose, STAND, TUCK, arc);
            f.x = lerp(f.fromX, x, easeInOutCubic(k));
            f.hop = arc * (0.26 - 0.14 * g);
            stand = 1;
          } else {
            const k = easeInOutCubic((q - 0.7) / 0.3);
            f.effort = exercise(s.mode, s.tmp, 0, g, t, veg);
            mixPose(f.pose, STAND, s.tmp, k);
            f.x = x;
            f.hop = 0;
            stand = 1 - k;
          }
          settleLimbs(f.pose);
        }
        if (s.tr >= 1) {
          s.tr = -1;
          settle(s);
        }
      } else if (s.mode === M_SPAR) {
        // Until someone takes over, they spar on their own
        if (!s.touched || demo) {
          s.idleT -= dt;
          if (s.idleT <= 0 && s.exT < 0) {
            s.exT = 0;
            s.fired = 0;
            s.idleT = demo ? 2.6 : 3.8;
          }
        }
        gk.hop = 0;
        vg.hop = 0;
        if (s.exT >= 0) {
          s.exT += dt / timeScale(g);
          const et = Math.min(s.exT, EX_END);
          let i = 0;
          while (i < KF.length - 2 && KF[i + 1][0] <= et) i++;
          const a = KF[i];
          const b = KF[i + 1];
          const raw = clamp((et - a[0]) / (b[0] - a[0]), 0, 1);
          // Snap into contact, ease out of it
          const k = b[5] ? raw * raw : a[5] ? easeOutCubic(raw) : easeInOutCubic(raw);
          mixPose(gk.pose, POSES[a[1]], POSES[b[1]], k);
          mixPose(vg.pose, POSES[a[3]], POSES[b[3]], k);
          gk.x = lerp(a[2], b[2], k);
          vg.x = lerp(a[4], b[4], k);
          if (et > HOP_A) {
            const hop = Math.sin(Math.PI * clamp((et - HOP_A) / (EX_END - HOP_A), 0, 1)) * (0.13 - 0.09 * g);
            gk.hop = hop;
            vg.hop = hop;
          }
          // Impacts
          for (const kf of KF) {
            const id = kf[5];
            if (!id || s.fired & (1 << id) || et < kf[0]) continue;
            s.fired |= 1 << id;
            impact(s, env, id);
          }
          if (s.exT >= EX_END) {
            s.exT = -1;
            if (s.queued) {
              s.queued = false;
              s.exT = 0;
              s.fired = 0;
              env.wake(4200);
            }
          }
        } else {
          copyPose(gk.pose, GUARD);
          copyPose(vg.pose, GUARD);
          const bob = Math.sin(t * 3.2) * 0.006;
          gk.pose.hipY += bob;
          gk.pose.neckY += bob;
          vg.pose.hipY -= bob;
          vg.pose.neckY -= bob;
          gk.x = damp(gk.x, -0.6 + Math.sin(t * 0.9) * 0.02, 4, dt);
          vg.x = damp(vg.x, 0.6 + Math.sin(t * 0.8 + 1) * 0.02, 4, dt);
        }
        gk.effort = s.exT >= 0 ? 0.8 : 0.3;
        vg.effort = gk.effort;
        stand = 1;
      } else {
        // Reps on a tempo: heavier air, slower grind; a burst of effort speeds one up
        for (const [f, veg, facing] of [
          [gk, false, 1],
          [vg, true, -1],
        ] as const) {
          const period = REP_TIME[s.mode][veg ? 1 : 0] * timeScale(g) / (1 + 0.9 * s.boost);
          const before = f.phase;
          let ph = before + dt / period;
          const at = COUNT_AT[s.mode][veg ? 1 : 0];
          if (before < at && ph >= at) rep(s, env, f, facing);
          if (ph >= 1) ph -= 1;
          f.phase = ph;
          const e = exercise(s.mode, f.pose, ph, g, t + (veg ? 1.3 : 0), veg);
          f.effort = damp(f.effort, e, 8, dtIn);
          f.hop = 0;
        }
        gk.x = damp(gk.x, STATION[s.mode][0], 6, dt);
        vg.x = damp(vg.x, STATION[s.mode][1], 6, dt);
      }
      if (stand > 0) {
        weigh(gk.pose, g * stand, t);
        weigh(vg.pose, g * stand, t + 1.3);
      }
      s.ghostT -= dt;

      // Where each fighter pushes into the floor
      const settled = s.tr < 0;
      gk.loadX = gk.x + LOAD_X[s.mode];
      vg.loadX = vg.x - LOAD_X[s.mode];

      // The rig rises before they jump for it; weights pop out of capsules once they arrive
      const rigOn = s.mode === M_PULL && (settled || s.tr > 0.2);
      const propOn = s.mode === M_LIFT && (settled || s.tr > 0.72);
      const prevProp = s.prop;
      s.rig = clamp(s.rig + (rigOn ? dtIn : -dtIn) / 0.7, 0, 1);
      s.prop = clamp(s.prop + (propOn ? dtIn : -dtIn) / 0.45, 0, 1);
      if ((prevProp === 0 && s.prop > 0) || (prevProp === 1 && s.prop < 1)) capsulePop(s, env);
      if (s.rig > 0 && s.rig < 1 && rigOn && Math.random() < dtIn * 30) {
        for (const f of [gk, vg]) {
          const side = f === gk ? 1 : -1;
          emit(s, s.cx + (f.x + side * RIG_X) * H + rand(-0.08, 0.08) * H, s.gy, rand(-0.2, 0.2) * H, -rand(0.1, 0.35) * H, rand(0.4, 0.7), rand(1.2, 2.2), 3);
        }
      }

      // Afterimages while they move fast
      for (const f of [gk, vg]) {
        if (dt > 0) f.speed = Math.abs(f.x - f.prevX) / dt;
        for (const gh of f.ghosts) gh.age += dt;
      }
      if (s.ghostT <= 0 && dt > 0 && !rm) {
        s.ghostT = 0.035;
        for (const f of [gk, vg]) {
          if (f.speed < 1.1) continue;
          let slot = f.ghosts[0];
          for (const gh of f.ghosts) if (gh.age > slot.age) slot = gh;
          slot.age = 0;
          slot.x = f.x;
          slot.y = f.hop;
          copyPose(slot.pose, f.pose);
        }
      }

      // Sweat: drips from both faces, falls harder as gravity and effort rise
      if (gk.anchor && vg.anchor && dt > 0) {
        const work = s.mode === M_SPAR ? 0.6 : 0.4 + 0.6 * Math.max(gk.effort, vg.effort);
        s.sweatAcc += dt * (1.5 + 16 * g * g) * work;
        while (s.sweatAcc >= 1) {
          s.sweatAcc -= 1;
          const an = Math.random() < 0.5 ? gk.anchor : vg.anchor;
          const side = an === gk.anchor ? 1 : -1;
          emit(s, an.headX + side * H * rand(0.0, 0.06), an.headY + H * rand(-0.03, 0.04), side * H * rand(0.05, 0.3), -H * rand(0.05, 0.4) * (1 - g * 0.8), 3, rand(1.4, 2.4) * (0.6 + H / 500), 0);
        }
      }
      const grav = H * (1.4 + 7 * g);
      for (const p of s.motes) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 0) {
          p.vy += grav * dt;
          if (p.y > s.gy + H * 0.02) {
            p.life = 0;
            for (let i = 0; i < 3; i++) emit(s, p.x, s.gy + H * 0.02, rand(-0.25, 0.25) * H, -rand(0.05, 0.2) * H * (1 - g * 0.6), 0.25, p.size * 0.6, 1);
          }
        } else if (p.kind === 1) {
          p.vy += grav * dt;
        } else if (p.kind === 2) {
          // Hit sparks: heavy air drags them down faster at high gravity
          p.vx *= Math.exp(-3 * dt);
          p.vy = p.vy * Math.exp(-3 * dt) + grav * 0.25 * dt;
        } else if (p.kind === 3) {
          // Floor chips
          p.vy += grav * dt;
          if (p.y > s.gy + H * 0.03) {
            p.y = s.gy + H * 0.03;
            p.vy *= -0.3;
            p.vx *= 0.6;
          }
        } else {
          // Capsule smoke: billows out, slows, pressed down by the gravity
          p.vx *= Math.exp(-4 * dt);
          p.vy = p.vy * Math.exp(-4 * dt) + grav * 0.04 * dt;
        }
      }
      for (const b of s.bursts) b.age += dtIn;

      // Pressure streaks pour down faster as gravity rises
      for (let i = 0; i < STREAKS; i++) {
        s.streaks[i * 3 + 1] += dt * (0.25 + 2.4 * g) * s.streaks[i * 3 + 2];
        if (s.streaks[i * 3 + 1] > 1.1) {
          s.streaks[i * 3 + 1] -= 1.2;
          s.streaks[i * 3] = Math.random();
        }
      }

      // Cracks close while they move and open again under the new load
      const crackTarget = settled ? smoothstep(0.35, 1, g) : 0;
      s.crack = Math.max(damp(s.crack, crackTarget, crackTarget > s.crack ? 2 : settled ? 0.3 : 5, dt), 0);

      const amp = rm ? 0 : H * (0.05 * s.shake + 0.0016 * g * g);
      s.shakeX = amp * (Math.sin(t * 61) * 0.6 + Math.sin(t * 37 + 1.3) * 0.4);
      s.shakeY = amp * (Math.sin(t * 53 + 0.7) * 0.6 + Math.sin(t * 29 + 2.1) * 0.4);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const { cx, gy, H } = s;
      const { gk, vg } = s;
      const g = s.g;
      const pad = H * 0.1;
      const alarm = smoothstep(0.55, 1, g) * (0.6 + 0.4 * Math.sin(t * (4 + 3 * g)));
      const red = 0.15 + 0.6 * g;

      ctx.save();
      ctx.translate(s.shakeX, s.shakeY);

      drawRoom(ctx, s, env, t, alarm);
      if (s.crack > 0.01) {
        drawCracks(ctx, s, cx + gk.loadX * H, 0);
        drawCracks(ctx, s, cx + vg.loadX * H, 9);
      }

      // The red of the warning light soaks the room
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(255,${Math.round(255 - 150 * red - 40 * alarm)},${Math.round(255 - 160 * red - 40 * alarm)})`;
      ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
      ctx.globalCompositeOperation = 'source-over';

      // Contact shadows sized to whatever is touching the floor
      ctx.fillStyle = 'rgba(30,26,40,0.35)';
      ctx.beginPath();
      for (const [f, facing] of [
        [gk, 1],
        [vg, -1],
      ] as const) {
        const p = f.pose;
        const lo = Math.min(p.nFx, p.fFx, p.hipX, p.neckX, p.nHx);
        const hi = Math.max(p.nFx, p.fFx, p.hipX, p.neckX, p.nHx);
        const lift = Math.min(p.nFy, p.fFy, p.hipY - 0.1) - 0.06 + f.hop;
        const k = 1 - clamp(lift * 2.2, 0, 0.75);
        const mid = cx + (f.x + ((lo + hi) / 2) * facing) * H;
        const rx = ((hi - lo) / 2 + 0.14) * H * k;
        ctx.moveTo(mid + rx, gy + H * 0.01);
        ctx.ellipse(mid, gy + H * 0.01, rx, H * 0.03 * k, 0, 0, TAU);
      }
      ctx.fill();

      // Light and rim shared by the fighters and their kit
      const rim = `${255},${Math.round(lerp(225, 90, g))},${Math.round(lerp(210, 80, g))}`;
      const rimK = 0.35 + 0.55 * g;
      const lightY = s.floorY - H * 0.9;

      if (s.rig > 0) {
        drawRig(ctx, s, cx + gk.x * H, 1, cx - w * 0.1, rim, rimK);
        drawRig(ctx, s, cx + vg.x * H, -1, cx + w * 0.1, rim, rimK);
      }

      // Afterimages
      const ghostOpts = (x: number, hop: number, facing: 1 | -1) => ({
        x: cx + x * H,
        gy: gy - hop * H,
        H,
        facing,
        lightX: cx,
        lightY: -h * 0.3,
        rim: '255,255,255',
        rimK: 0,
        t,
        flutter: 0,
        hairLift: 0,
        handN: 'fist' as const,
        handF: 'fist' as const,
        mouth: 0,
        strain: 0,
      });
      for (const gh of gk.ghosts) {
        if (gh.age > 0.2) continue;
        drawDbzFighter(ctx, GOKU, gh.pose, ghostOpts(gh.x, gh.y, 1), { color: 'rgb(255,150,70)', alpha: 0.28 * (1 - gh.age / 0.2) });
      }
      for (const gh of vg.ghosts) {
        if (gh.age > 0.2) continue;
        drawDbzFighter(ctx, VEGETA, gh.pose, ghostOpts(gh.x, gh.y, -1), { color: 'rgb(90,130,255)', alpha: 0.28 * (1 - gh.age / 0.2) });
      }

      // The fighters: lit from the ceiling, rimmed by the warning light
      const moving = s.tr >= 0 || s.exT >= 0;
      const fOpts = (f: Trainee, facing: 1 | -1, shout: number) => ({
        x: cx + f.x * H,
        gy: gy - f.hop * H,
        H,
        facing,
        lightX: cx - facing * w * 0.1,
        lightY,
        rim,
        rimK,
        t,
        flutter: 0.1 + (moving ? 0.35 : 0) + 0.3 * s.boost,
        hairLift: -0.25 * g,
        handN: 'fist' as const,
        handF: 'fist' as const,
        mouth: shout,
        strain: clamp(0.2 + 0.5 * g + 0.35 * f.effort, 0, 1),
      });
      const shoutOf = (f: Trainee) => {
        if (s.mode === M_SPAR && s.tr < 0) return s.exT >= 0 && s.exT < 1.1 ? 0.6 : 0;
        return Math.max(smoothstep(0.85, 1, f.effort) * (0.25 + 0.5 * g), s.boost * 0.7);
      };
      const lifting = s.prop > 0;
      if (lifting) drawDumbbell(ctx, s, vg, -1, cx + w * 0.1, lightY, rim, rimK, false);
      vg.anchor = drawDbzFighter(ctx, VEGETA, vg.pose, fOpts(vg, -1, shoutOf(vg) * 0.8));
      if (lifting) drawDumbbell(ctx, s, vg, -1, cx + w * 0.1, lightY, rim, rimK, true);
      if (lifting) drawBarbell(ctx, s, gk, 1, cx - w * 0.1, lightY, rim, rimK, false);
      gk.anchor = drawDbzFighter(ctx, GOKU, gk.pose, fOpts(gk, 1, shoutOf(gk)));
      if (lifting) drawBarbell(ctx, s, gk, 1, cx - w * 0.1, lightY, rim, rimK, true);

      // Sweat, splashes and capsule smoke
      for (const p of s.motes) {
        if (p.life <= 0 || p.kind === 2 || p.kind === 3) continue;
        const k = clamp(p.life / p.max, 0, 1);
        ctx.beginPath();
        if (p.kind === 0) {
          ctx.fillStyle = 'rgba(220,240,255,0.9)';
          const st = clamp(Math.abs(p.vy) / (H * 2), 1, 2.6);
          ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * st, Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, TAU);
        } else if (p.kind === 1) {
          ctx.fillStyle = `rgba(220,240,255,${0.6 * k})`;
          ctx.arc(p.x, p.y, p.size * 0.6, 0, TAU);
        } else {
          ctx.fillStyle = `rgba(250,246,244,${0.55 * k * k})`;
          ctx.arc(p.x, p.y, p.size * (1.6 - 0.8 * k), 0, TAU);
        }
        ctx.fill();
      }
      // Floor chips
      ctx.fillStyle = '#6f7384';
      for (const p of s.motes) {
        if (p.life <= 0 || p.kind !== 3) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.life * 8);
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      }

      // Hit bursts and sparks
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bursts) {
        if (b.age > 0.45) continue;
        const k = b.age / 0.45;
        const R = H * (0.1 + 0.16 * b.str);
        // Shockwave ring
        ctx.strokeStyle = `rgba(255,240,220,${(1 - k) * 0.7})`;
        ctx.lineWidth = Math.max(1, H * 0.014 * (1 - k));
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, R * (0.6 + 2.6 * easeOutCubic(k)), R * (0.6 + 2.6 * easeOutCubic(k)) * 0.7, 0, 0, TAU);
        ctx.stroke();
        if (b.age < 0.18) {
          const q = b.age / 0.18;
          const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R * 2.2);
          glow.addColorStop(0, `rgba(255,250,230,${0.9 * (1 - q)})`);
          glow.addColorStop(0.4, `rgba(255,${Math.round(200 - 100 * g)},120,${0.5 * (1 - q)})`);
          glow.addColorStop(1, 'rgba(255,120,80,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(b.x - R * 2.2, b.y - R * 2.2, R * 4.4, R * 4.4);
          ctx.fillStyle = `rgba(255,${Math.round(230 - 90 * g)},140,${1 - q})`;
          ctx.beginPath();
          burstPath(ctx, b.x, b.y, R * (1.1 + 0.4 * q), 9, b.seed);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${1 - q})`;
          ctx.beginPath();
          burstPath(ctx, b.x, b.y, R * 0.55 * (1 + 0.3 * q), 9, b.seed + 0.3);
          ctx.fill();
        }
      }
      ctx.lineCap = 'round';
      for (const p of s.motes) {
        if (p.life <= 0 || p.kind !== 2) continue;
        const k = p.life / p.max;
        ctx.strokeStyle = `rgba(255,${Math.round(180 + 70 * k)},${Math.round(120 + 110 * k)},${k})`;
        ctx.lineWidth = p.size * (0.5 + 0.5 * k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // A lighter wash over everything ties the fighters into the red room
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(255,${Math.round(255 - 55 * red - 20 * alarm)},${Math.round(255 - 60 * red - 20 * alarm)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,40,30,${0.03 + 0.1 * g * (0.6 + 0.4 * alarm)})`;
      ctx.fillRect(0, 0, w, h);
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(255,240,220,${s.flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';

      const vig = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.78);
      vig.addColorStop(0, 'rgba(20,6,10,0)');
      vig.addColorStop(1, `rgba(20,6,10,${0.35 + 0.25 * g})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Gravity slider
      if (env.interactive) {
        const x = sliderX(env);
        const top = sliderTop(env);
        const bot = sliderBot(env);
        const hy = lerp(bot, top, g);
        ctx.fillStyle = 'rgba(15,10,16,0.55)';
        roundRect(ctx, x - 7, top - 7, 14, bot - top + 14, 7);
        ctx.fill();
        const fill = ctx.createLinearGradient(0, bot, 0, top);
        fill.addColorStop(0, '#ffb070');
        fill.addColorStop(1, '#ff2a2a');
        ctx.fillStyle = fill;
        roundRect(ctx, x - 3, hy, 6, bot - hy, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const y = lerp(bot, top, i / 10);
          const len = i % 5 === 0 ? 9 : 5;
          ctx.moveTo(x - 12 - len, y);
          ctx.lineTo(x - 12, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, hy, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(255,${Math.round(200 - 170 * g)},${Math.round(160 - 140 * g)})`;
        ctx.beginPath();
        ctx.arc(x, hy, 4.5, 0, TAU);
        ctx.fill();
      }

      drawHud(ctx, s, env);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.pointerDown = true;
      s.downX = x;
      s.downY = y;
      s.downG = s.G;
      s.dragging = false;
      ensureHum(s, env);
      const icon = hitSelector(env, x, y);
      s.ui = icon >= 0;
      if (s.ui) {
        setMode(s, env, icon, true);
        s.slider = false;
        return;
      }
      s.slider = x > sliderX(env) - 36 && y > sliderTop(env) - 24 && y < sliderBot(env) + 24;
      if (s.slider) setFromSlider(s, env, y);
    },
    onPointerMove: (s, env, x, y) => {
      if (!s.pointerDown || s.ui) return;
      if (s.slider) {
        setFromSlider(s, env, y);
        return;
      }
      if (!s.dragging && Math.hypot(x - s.downX, y - s.downY) > 8) s.dragging = true;
      if (s.dragging) s.G = clamp(s.downG - (y - s.downY) / (env.h * 0.55), 0, 1);
    },
    onPointerUp: (s, env, x) => {
      if (s.pointerDown && !s.ui && !s.slider && !s.dragging) {
        // Sparring: a tap trades blows. Workouts: tap a half of the room to step through them
        if (s.mode === M_SPAR && s.tr < 0) trigger(s, env);
        else setMode(s, env, s.mode + (x < env.w / 2 ? -1 : 1), true);
      }
      s.pointerDown = false;
      s.slider = false;
      s.dragging = false;
      s.ui = false;
    },
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === '+' || k === '=' || k === 's' || k === '-' || k === '_') {
        if (!down) return true;
        s.touched = true;
        ensureHum(s, env);
        const up = k === 'w' || k === '+' || k === '=';
        s.G = clamp(Math.round(s.G * 10 + (up ? 1 : -1)) / 10, 0, 1);
        env.wake(1200);
        return true;
      }
      if (k === 'q' || k === 'e' || (k >= '1' && k <= '5' && k.length === 1)) {
        if (down && !e.repeat) {
          s.touched = true;
          ensureHum(s, env);
          const next = k === 'q' ? s.mode - 1 : k === 'e' ? s.mode + 1 : Number(k) - 1;
          setMode(s, env, next, true);
        }
        return true;
      }
      if (k === ' ' || k === 'enter') {
        if (down && !e.repeat) {
          s.touched = true;
          ensureHum(s, env);
          trigger(s, env);
        }
        return true;
      }
      return false;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
    },
  });

const PT = new Float64Array(2);
const WINDOWS = [-1.1, -0.55, 0.55, 1.1];

function impact(s: State, env: SceneEnv, id: number) {
  const H = s.H;
  const g = s.g;
  const rm = env.reducedMotion;
  const { gk, vg } = s;
  // Contact point from the striking limb
  let x: number;
  let y: number;
  if (id === 1) {
    x = s.cx + (gk.x + gk.pose.nHx + 0.03) * H;
    y = s.gy - gk.pose.nHy * H;
  } else if (id === 2) {
    x = s.cx + (vg.x - vg.pose.nFx - 0.02) * H;
    y = s.gy - vg.pose.nFy * H;
  } else {
    x = s.cx + (gk.x + gk.pose.nHx + (vg.x - vg.pose.nHx)) * 0.5 * H;
    y = s.gy - (gk.pose.nHy + vg.pose.nHy) * 0.5 * H;
  }
  y -= gk.hop * H;
  // Landed blows count as reps: Goku lands the jab, Vegeta the kick, both the clash
  if (id !== 2) {
    gk.reps++;
    gk.popT = 0;
  }
  if (id !== 1) {
    vg.reps++;
    vg.popT = 0;
  }
  const str = (id === 3 ? 1 : 0.6) * (0.55 + 0.45 * g);
  let slot = s.bursts[0];
  for (const b of s.bursts) if (b.age > slot.age) slot = b;
  slot.x = x;
  slot.y = y;
  slot.age = 0;
  slot.str = str;
  slot.seed = rand(0, TAU);
  if (!rm) {
    s.hitStop = (id === 3 ? 0.08 : 0.045) + 0.07 * g;
    s.shake = Math.max(s.shake, str * (0.4 + 0.6 * g));
  }
  s.flash = Math.max(s.flash, id === 3 ? 0.7 : 0.35);
  const n = id === 3 ? 34 : 18;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = H * rand(0.6, 2.2) * (0.6 + 0.6 * str);
    emit(s, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.8, rand(0.2, 0.5), rand(1.2, 2.6), 2);
  }
  // Heavier gravity: the floor takes it too
  if (g > 0.4) {
    s.crack = Math.min(1, s.crack + 0.12 * g);
    for (let i = 0; i < Math.round(8 * g); i++) {
      const fx = s.cx + (Math.random() < 0.5 ? gk.x : vg.x) * H + rand(-0.2, 0.2) * H;
      emit(s, fx, s.gy, rand(-0.4, 0.4) * H, -rand(0.2, 0.6) * H, rand(0.6, 1), rand(1.5, 3), 3);
    }
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.14 + 0.12 * g, freq: 1900 - 1100 * g, q: 0.9, gain: 0.22 + 0.2 * str });
    tone(bus, 150 - 70 * g, { type: 'sine', glideTo: 40, decay: 0.2 + 0.35 * g, gain: 0.18 + 0.22 * str });
    if (id === 3) noise(bus, { duration: 0.5 + 0.4 * g, freq: 300, type: 'lowpass', gain: 0.3 });
  }
}

/** Weights appear out of a Capsule Corp capsule in a puff of smoke */
function capsulePop(s: State, env: SceneEnv) {
  const H = s.H;
  for (const [f, facing] of [
    [s.gk, 1],
    [s.vg, -1],
  ] as const) {
    const x = s.cx + (f.x + f.pose.nHx * facing) * H;
    const y = s.gy - f.pose.nHy * H;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const v = H * rand(0.3, 0.9);
      emit(s, x + Math.cos(a) * H * 0.05, y + Math.sin(a) * H * 0.05, Math.cos(a) * v, Math.sin(a) * v * 0.7, rand(0.4, 0.7), H * rand(0.03, 0.06), 4);
    }
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.25, freq: 2400, q: 0.7, gain: 0.08 });
    tone(bus, 900, { type: 'sine', glideTo: 1500, decay: 0.12, gain: 0.04 });
  }
}

/* ---------- room ---------- */

function drawRoom(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number, alarm: number) {
  const { w, h } = env;
  const { cx, H, floorY, rxF, ryF, domeH } = s;
  const g = s.g;
  const pad = H * 0.1;

  // Dome interior
  const wall = ctx.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#9aa0ae');
  wall.addColorStop(0.55, '#e3e6ec');
  wall.addColorStop(1, '#f4f5f8');
  ctx.fillStyle = wall;
  ctx.fillRect(-pad, -pad, w + pad * 2, floorY + pad);
  const side = ctx.createLinearGradient(cx - rxF, 0, cx + rxF, 0);
  side.addColorStop(0, 'rgba(60,64,80,0.55)');
  side.addColorStop(0.3, 'rgba(60,64,80,0)');
  side.addColorStop(0.7, 'rgba(60,64,80,0)');
  side.addColorStop(1, 'rgba(60,64,80,0.55)');
  ctx.fillStyle = side;
  ctx.fillRect(-pad, -pad, w + pad * 2, floorY + pad);

  // Latitude rings and longitude ribs of the dome
  const domePt = (lat: number, th: number, out: Float64Array) => {
    out[0] = cx + rxF * Math.cos(lat) * Math.sin(th);
    out[1] = floorY - ryF * Math.cos(lat) * Math.cos(th) - domeH * Math.sin(lat);
  };
  const pt = PT;
  ctx.strokeStyle = 'rgba(90,96,115,0.35)';
  ctx.lineWidth = Math.max(1, H * 0.004);
  ctx.beginPath();
  for (let k = 1; k <= 4; k++) {
    const lat = k * 0.2;
    for (let i = 0; i <= 24; i++) {
      domePt(lat, -Math.PI / 2 + (i / 24) * Math.PI, pt);
      if (i === 0) ctx.moveTo(pt[0], pt[1]);
      else ctx.lineTo(pt[0], pt[1]);
    }
  }
  for (let j = -5; j <= 5; j++) {
    const th = j * 0.28;
    for (let i = 0; i <= 10; i++) {
      domePt(i * 0.12, th, pt);
      if (i === 0) ctx.moveTo(pt[0], pt[1]);
      else ctx.lineTo(pt[0], pt[1]);
    }
  }
  ctx.stroke();

  // Round windows on the wall band
  for (const th of WINDOWS) {
    domePt(0.3, th, pt);
    const wx = pt[0];
    const wy = pt[1];
    const rr = Math.min(h * 0.07, H * 0.13);
    const sx = Math.max(0.2, Math.cos(th));
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.28, 0, TAU);
    ctx.fillStyle = '#8c93a3';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.12, 0, TAU);
    ctx.fillStyle = '#c9ced8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    const sky = ctx.createLinearGradient(0, -rr, 0, rr);
    sky.addColorStop(0, '#3b7fd9');
    sky.addColorStop(1, '#a8d4ff');
    ctx.fillStyle = sky;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const drift = ((t * 0.02 + th) % 1) * rr * 2 - rr;
    ctx.beginPath();
    ctx.ellipse(drift, rr * 0.35, rr * 0.5, rr * 0.18, 0, 0, TAU);
    ctx.ellipse(drift + rr * 0.35, rr * 0.25, rr * 0.3, rr * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(-rr * 0.9, -rr * 0.2);
    ctx.lineTo(-rr * 0.2, -rr * 0.9);
    ctx.lineTo(0.05 * rr, -rr * 0.75);
    ctx.lineTo(-rr * 0.75, 0.05 * rr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(1, H * 0.005) / sx;
    ctx.strokeStyle = '#5d6475';
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.28, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Floor
  ctx.save();
  ctx.beginPath();
  ctx.rect(-pad, floorY - ryF - 2, w + pad * 2, h - floorY + ryF + pad * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx, floorY, rxF, ryF * 2.4, 0, 0, TAU);
  const floor = ctx.createLinearGradient(0, floorY - ryF, 0, h);
  floor.addColorStop(0, '#aeb3bf');
  floor.addColorStop(0.3, '#d3d6de');
  floor.addColorStop(1, '#b9bdc8');
  ctx.fillStyle = floor;
  ctx.fill();
  // Panel seams: rings and spokes from the machine
  ctx.strokeStyle = 'rgba(80,86,104,0.35)';
  ctx.lineWidth = Math.max(1, H * 0.003);
  ctx.beginPath();
  for (const k of [0.3, 0.62, 1.0, 1.45, 2.0]) {
    ctx.moveTo(cx + rxF * k * 0.5, floorY);
    ctx.ellipse(cx, floorY, rxF * k * 0.5, ryF * k * 0.5 * 1.2, 0, 0, TAU);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.moveTo(cx + Math.cos(a) * rxF * 0.15, floorY + Math.sin(a) * ryF * 0.18);
    ctx.lineTo(cx + Math.cos(a) * rxF * 1.2, floorY + Math.sin(a) * ryF * 1.44 * 1.8);
  }
  ctx.stroke();
  ctx.restore();
  // Floor meets wall: soft occlusion
  ctx.strokeStyle = 'rgba(40,44,58,0.35)';
  ctx.lineWidth = Math.max(2, H * 0.012);
  ctx.beginPath();
  ctx.ellipse(cx, floorY, rxF, ryF, 0, Math.PI, TAU);
  ctx.stroke();

  // Pressure streaks in the air
  if (g > 0.05) {
    ctx.strokeStyle = `rgba(255,${Math.round(200 - 120 * g)},${Math.round(200 - 130 * g)},${0.12 * g})`;
    ctx.lineWidth = Math.max(1, H * 0.003);
    ctx.beginPath();
    for (let i = 0; i < STREAKS; i++) {
      const x = s.streaks[i * 3] * w;
      const y = s.streaks[i * 3 + 1] * h;
      const len = H * (0.06 + 0.2 * g) * s.streaks[i * 3 + 2];
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawMachine(ctx, s, t, alarm);

  // Rotating warning beams sweep the dome
  const bx = cx;
  const by = floorY - H * 0.62;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const ph = t * (1.6 + 2 * g) + i * Math.PI;
    const facing = (Math.cos(ph) + 1) / 2;
    const dir = Math.sin(ph);
    const reach = w * 0.9;
    const ex = bx + dir * reach;
    const spread = H * (0.25 + 0.3 * facing);
    const a = (0.05 + 0.2 * g) * (0.3 + 0.7 * facing);
    const bg = ctx.createLinearGradient(bx, by, ex, by);
    bg.addColorStop(0, `rgba(255,60,50,${a})`);
    bg.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, by - spread - H * 0.3);
    ctx.lineTo(ex, by + spread - H * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Floor cracks spreading from where a fighter bears down */
function drawCracks(ctx: CanvasRenderingContext2D, s: State, fx: number, first: number) {
  const { gy, H } = s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Shallow crater
  ctx.fillStyle = `rgba(60,55,70,${0.25 * s.crack})`;
  ctx.beginPath();
  ctx.ellipse(fx, gy + H * 0.01, H * 0.32 * s.crack, H * 0.045 * s.crack, 0, 0, TAU);
  ctx.fill();
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(40,36,48,0.8)' : 'rgba(255,255,255,0.45)';
    for (let i = first; i < first + 9; i++) {
      const cr = s.cracks[i];
      const lim = cr.total * s.crack;
      ctx.lineWidth = Math.max(0.8, H * 0.005 * cr.width) * (pass === 0 ? 1 : 0.4);
      const oy = pass === 0 ? 0 : 1;
      ctx.beginPath();
      ctx.moveTo(fx + cr.pts[0] * H * 1.4, gy + cr.pts[1] * H * 0.3 + oy);
      for (let k = 1; k < cr.lens.length; k++) {
        let ux = cr.pts[k * 2];
        let ud = cr.pts[k * 2 + 1];
        if (cr.lens[k] > lim) {
          const q = (lim - cr.lens[k - 1]) / (cr.lens[k] - cr.lens[k - 1]);
          ux = lerp(cr.pts[(k - 1) * 2], ux, q);
          ud = lerp(cr.pts[(k - 1) * 2 + 1], ud, q);
          ctx.lineTo(fx + ux * H * 1.4, gy + ud * H * 0.3 + oy);
          break;
        }
        ctx.lineTo(fx + ux * H * 1.4, gy + ud * H * 0.3 + oy);
      }
      ctx.stroke();
    }
  }
}

/* ---------- training kit ---------- */

const INK = '#1a0f16';

/** Brushed metal gradient across a span, lit edge toward the light */
function metal(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, hi: string, base: string, deep: string, rim: string, rimK: number) {
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, rimK > 0.05 ? `rgb(${rim})` : hi);
  gr.addColorStop(0.08, hi);
  gr.addColorStop(0.35, base);
  gr.addColorStop(0.62, base);
  gr.addColorStop(0.66, deep);
  gr.addColorStop(1, deep);
  return gr;
}

/**
 * Wall-style pull-up station behind a fighter: a post, a braced beam, and the bar running into
 * the room so the near hand grips close and the far hand deeper. It rises out of a floor hatch.
 */
function drawRig(ctx: CanvasRenderingContext2D, s: State, x: number, facing: 1 | -1, lightX: number, rim: string, rimK: number) {
  const { gy, H } = s;
  const e = easeInOutCubic(s.rig);
  const drop = (1 - e) * (BAR + 0.3) * H;
  const px = x + facing * RIG_X * H;
  const ink = Math.max(1, H * 0.0055);

  // The hatch opens while the rig is travelling
  const hatch = smoothstep(0, 0.12, s.rig) * (1 - smoothstep(0.85, 1, s.rig));
  if (hatch > 0.01) {
    ctx.fillStyle = `rgba(20,16,26,${0.85 * hatch})`;
    ctx.beginPath();
    ctx.ellipse(px, gy, H * 0.16 * hatch, H * 0.035 * hatch, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,190,70,${0.8 * hatch})`;
    ctx.lineWidth = ink;
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x - H * 1.5, gy - H * 2, H * 3, H * 2 + H * 0.012);
  ctx.clip();
  ctx.translate(x, gy + drop);
  ctx.scale(facing * H, -H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink / H;
  // Local light direction picks which edge catches the rim
  const lit = (lightX - x) * facing > 0 ? 1 : -1;

  const postW = 0.032;
  const top = BAR + 0.16;
  const farX = BAR_X + BAR_DX * 2.3;
  const farY = BAR + BAR_DY * 2.3;

  // Base plate
  ctx.beginPath();
  ctx.ellipse(RIG_X, 0.004, 0.12, 0.02, 0, 0, TAU);
  ctx.fillStyle = '#5a6070';
  ctx.fill();
  ctx.stroke();

  // Post
  ctx.beginPath();
  ctx.rect(RIG_X - postW, 0, postW * 2, top);
  ctx.fillStyle = metal(ctx, RIG_X + lit * postW, 0, RIG_X - lit * postW, 0, '#ffffff', '#dfe3ea', '#8a90a0', rim, rimK);
  ctx.fill();
  ctx.stroke();
  // Hazard bands near the base and at eye level
  ctx.fillStyle = '#f2b632';
  for (const y0 of [0.08, 0.62]) {
    ctx.beginPath();
    ctx.rect(RIG_X - postW, y0, postW * 2, 0.05);
    ctx.fill();
    ctx.stroke();
  }

  // Brace and top beam out to the bar
  ctx.beginPath();
  ctx.moveTo(RIG_X, top - 0.3);
  ctx.lineTo(RIG_X + 0.2, top - 0.02);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 0.018;
  ctx.strokeStyle = '#b9bfcc';
  ctx.stroke();
  ctx.lineWidth = ink / H;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.rect(RIG_X - postW, top - 0.05, farX - RIG_X + postW + 0.02, 0.06);
  ctx.fillStyle = metal(ctx, 0, top + 0.01, 0, top - 0.05, '#ffffff', '#dfe3ea', '#8a90a0', rim, rimK);
  ctx.fill();
  ctx.stroke();
  // Drop bracket to the far end of the bar
  ctx.beginPath();
  ctx.rect(farX - 0.012, farY, 0.024, top - 0.05 - farY);
  ctx.fillStyle = '#9aa0ae';
  ctx.fill();
  ctx.stroke();

  // The bar: chrome, running from deep in the room out toward the viewer
  const nx = BAR_X - BAR_DX * 1.6;
  const ny = BAR - BAR_DY * 1.6;
  ctx.beginPath();
  ctx.moveTo(farX, farY);
  ctx.lineTo(nx, ny);
  ctx.lineWidth = 0.048 + (2 * ink) / H;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 0.048;
  ctx.strokeStyle = '#c8ccd6';
  ctx.stroke();
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = rimK > 0.05 ? `rgba(${rim},0.9)` : '#ffffff';
  ctx.beginPath();
  ctx.moveTo(farX + 0.006, farY + 0.008);
  ctx.lineTo(nx + 0.006, ny + 0.008);
  ctx.stroke();
  // End cap facing the viewer
  ctx.lineWidth = ink / H;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.ellipse(nx, ny, 0.03, 0.027, 0, 0, TAU);
  ctx.fillStyle = '#f2b632';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Depth axis on screen for props held across the body: the near end swings outward and down
const DEPTH_X = 0.93;
const DEPTH_Y = 0.36;
/** Plates face the bar axis, so they read as ellipses squashed along it */
const FORE = 0.36;

/** Iron plate on the bar axis, its thickness showing along the axis */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, th: number, dx: number, dy: number, lightX: number, lightY: number, rim: string, rimK: number, ink: number, blue: 0 | 1, fore = FORE) {
  const rx = r * fore;
  const rot = Math.atan2(dy, dx);
  const bx = x - dx * th;
  const by = y - dy * th;
  // Rim band between the back and front faces
  ctx.beginPath();
  ctx.ellipse(bx, by, rx, r, rot, Math.PI / 2, Math.PI * 1.5);
  ctx.ellipse(x, y, rx, r, rot, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = blue ? '#232a3a' : '#211b21';
  ctx.fill();
  ctx.lineWidth = ink * 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Front face lit toward the key light
  let lx = lightX - x;
  let ly = lightY - y;
  const ll = Math.hypot(lx, ly) || 1;
  lx /= ll;
  ly /= ll;
  const face = ctx.createLinearGradient(x + lx * r, y + ly * r, x - lx * r, y - ly * r);
  face.addColorStop(0, blue ? '#7584a6' : '#72656b');
  face.addColorStop(0.3, blue ? '#414c66' : '#40363c');
  face.addColorStop(0.6, blue ? '#2c3447' : '#2b2429');
  face.addColorStop(0.64, blue ? '#171b26' : '#161115');
  face.addColorStop(1, blue ? '#0e1118' : '#0d0a0d');
  ctx.beginPath();
  ctx.ellipse(x, y, rx, r, rot, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.stroke();
  // Capsule Corp stripe and the hub
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.72, r * 0.72, rot, 0, TAU);
  ctx.strokeStyle = blue ? 'rgba(150,180,255,0.55)' : 'rgba(242,182,50,0.7)';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.22, r * 0.22, rot, 0, TAU);
  ctx.fillStyle = '#c9ced8';
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Rim light on the edge facing the warning lamp
  if (rimK > 0.05) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx - ink), r - ink, rot, -2.2, -0.9);
    ctx.strokeStyle = `rgba(${rim},${0.85 * rimK})`;
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.stroke();
  }
}

function barSeg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number, ink: number) {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = r * 2 + ink * 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = r * 2;
  ctx.strokeStyle = '#aeb4c2';
  ctx.stroke();
  ctx.lineWidth = r * 0.7;
  ctx.strokeStyle = '#f1f3f8';
  ctx.beginPath();
  ctx.moveTo(x0, y0 - r * 0.45);
  ctx.lineTo(x1, y1 - r * 0.45);
  ctx.stroke();
}

/** Axis of a held prop on screen, pointing at the near end: outward behind the lifter or out front */
function propAxis(facing: 1 | -1, out: Float64Array, front = false, depthY = DEPTH_Y) {
  const dx = (front ? facing : -facing) * DEPTH_X;
  const dl = Math.hypot(dx, depthY);
  out[0] = dx / dl;
  out[1] = depthY / dl;
}
/**
 * Goku is drawn side on, so a bar across his shoulders points almost straight at the camera:
 * the plates face the viewer as near circles and only a short stub of bar shows beside them.
 */
const BAR_END_ON = 0.13;
const BAR_PLATE_SCALE = 0.62;
const BAR_FORE = 0.9;
const AX = new Float64Array(2);

/** Goku's barbell across his traps, seen end on; near half drawn over him, far half behind */
function drawBarbell(ctx: CanvasRenderingContext2D, s: State, f: Trainee, facing: 1 | -1, lightX: number, lightY: number, rim: string, rimK: number, near: boolean) {
  const { cx, gy, H } = s;
  const p = f.pose;
  let ux = p.neckX - p.hipX;
  let uy = p.neckY - p.hipY;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  // Bar sits on the upper back behind the neck
  const lx = p.neckX - ux * BAR_DOWN - uy * BAR_BACK;
  const ly = p.neckY - uy * BAR_DOWN + ux * BAR_BACK;
  const bx = cx + (f.x + lx * facing) * H;
  const by = gy - f.hop * H - ly * H;
  const k = easeOutBack(clamp(s.prop, 0, 1));
  propAxis(facing, AX);
  const sgn = near ? 1 : -1;
  const ddx = AX[0] * sgn;
  const ddy = AX[1] * sgn;
  // Screen length along the bar is foreshortened; plate sizes are not
  const len = H * BAR_END_ON * k;
  const ink = Math.max(1, H * 0.0055);
  ctx.save();
  barSeg(ctx, bx, by, bx + ddx * len * 0.66, by + ddy * len * 0.66, H * 0.013 * k, ink);
  // Collar, then plates stacked outward with the biggest inside
  const stack = [
    [0.38, 0.045, 0.03],
    [0.45, 0.2, 0.045],
    [0.51, 0.17, 0.045],
    [0.57, 0.13, 0.04],
  ] as const;
  const order = near ? [0, 1, 2, 3] : [3, 2, 1, 0];
  for (const i of order) {
    const [at, rad, th] = stack[i];
    const px = bx + ddx * len * at;
    const py = by + ddy * len * at;
    const r = H * rad * k * BAR_PLATE_SCALE;
    if (i === 0) {
      ctx.beginPath();
      ctx.ellipse(px, py, r * BAR_FORE, r, Math.atan2(ddy, ddx), 0, TAU);
      ctx.fillStyle = '#d6dae2';
      ctx.fill();
      ctx.lineWidth = ink;
      ctx.strokeStyle = INK;
      ctx.stroke();
      continue;
    }
    plate(ctx, px, py, r, len * th, ddx, ddy, lightX, lightY, rim, rimK, ink, 0, BAR_FORE);
  }
  ctx.restore();
}

/** Vegeta's giant dumbbell in his pressing hand */
function drawDumbbell(ctx: CanvasRenderingContext2D, s: State, f: Trainee, facing: 1 | -1, lightX: number, lightY: number, rim: string, rimK: number, near: boolean) {
  const { cx, gy, H } = s;
  const p = f.pose;
  const hx = cx + (f.x + p.nHx * facing) * H;
  const hy = gy - f.hop * H - p.nHy * H;
  const k = easeOutBack(clamp(s.prop, 0, 1));
  // Near head swings out in front so it never covers his face
  propAxis(facing, AX, true);
  const sgn = near ? 1 : -1;
  const ddx = AX[0] * sgn;
  const ddy = AX[1] * sgn;
  const ink = Math.max(1, H * 0.0055);
  ctx.save();
  barSeg(ctx, hx, hy, hx + ddx * H * 0.13 * k, hy + ddy * H * 0.13 * k, H * 0.014 * k, ink);
  const heads = [
    [0.08, 0.12, 0.04],
    [0.125, 0.1, 0.04],
  ] as const;
  const order = near ? [0, 1] : [1, 0];
  for (const i of order) {
    const [at, rad, th] = heads[i];
    plate(ctx, hx + ddx * H * at * k, hy + ddy * H * at * k, H * rad * k, H * th * k, ddx, ddy, lightX, lightY, rim, rimK, ink, 1);
  }
  ctx.restore();
}

/* ---------- HUD ---------- */

/** Mode icons as simple line glyphs in a -1..1 box */
function glyph(ctx: CanvasRenderingContext2D, mode: number, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.beginPath();
  if (mode === M_PUSH) {
    ctx.moveTo(-0.9, 0.46);
    ctx.lineTo(0.3, 0.02);
    ctx.lineTo(0.4, 0.5);
    ctx.moveTo(0.76, -0.12);
    ctx.arc(0.59, -0.12, 0.17, 0, TAU);
  } else if (mode === M_PULL) {
    ctx.moveTo(-0.85, -0.78);
    ctx.lineTo(0.85, -0.78);
    ctx.moveTo(-0.34, -0.78);
    ctx.lineTo(-0.34, -0.06);
    ctx.lineTo(0.34, -0.06);
    ctx.lineTo(0.34, -0.78);
    ctx.moveTo(0, -0.06);
    ctx.lineTo(0, 0.42);
    ctx.lineTo(-0.24, 0.84);
    ctx.moveTo(0, 0.42);
    ctx.lineTo(0.24, 0.84);
    ctx.moveTo(0.17, -0.36);
    ctx.arc(0, -0.36, 0.17, 0, TAU);
  } else if (mode === M_CRUNCH) {
    ctx.moveTo(-0.85, 0.62);
    ctx.lineTo(0.85, 0.62);
    ctx.moveTo(-0.46, 0.0);
    ctx.lineTo(0.02, 0.48);
    ctx.lineTo(0.38, -0.02);
    ctx.lineTo(0.68, 0.5);
    ctx.moveTo(-0.46, -0.24);
    ctx.arc(-0.62, -0.24, 0.16, 0, TAU);
  } else if (mode === M_SPAR) {
    burstPath(ctx, 0, 0, 0.9, 7, 0.4);
  } else {
    ctx.moveTo(-0.88, 0);
    ctx.lineTo(0.88, 0);
    for (const sx of [-1, 1]) {
      ctx.moveTo(sx * 0.62, -0.5);
      ctx.lineTo(sx * 0.62, 0.5);
      ctx.moveTo(sx * 0.44, -0.34);
      ctx.lineTo(sx * 0.44, 0.34);
    }
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv) {
  const L = selector(env);
  const { S, gap, x0, y } = L;
  const hover = env.interactive && env.pointer.inside ? hitSelector(env, env.pointer.x, env.pointer.y) : -1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < MODES; i++) {
    const x = x0 + i * (S + gap);
    const on = i === s.mode;
    const pop = on ? 1 + 0.18 * easeOutCubic(s.modeFlash) : 1;
    const R = (S / 2) * pop;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    if (on) {
      const bg = ctx.createRadialGradient(x, y - R * 0.4, R * 0.1, x, y, R);
      bg.addColorStop(0, '#ff8a4a');
      bg.addColorStop(1, '#c81e1e');
      ctx.fillStyle = bg;
    } else {
      ctx.fillStyle = i === hover ? 'rgba(40,16,20,0.75)' : 'rgba(15,10,16,0.55)';
    }
    ctx.fill();
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeStyle = on ? 'rgba(255,240,230,0.95)' : i === hover ? 'rgba(255,220,210,0.7)' : 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,225,215,0.78)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1.5, S * 0.065);
    glyph(ctx, i, x, y, R * 0.56);
    if (i === M_SPAR) ctx.fill();
    else ctx.stroke();
    // Countdown to the next workout while it rotates by itself
    if (on && !s.locked && s.tr < 0) {
      ctx.beginPath();
      ctx.arc(x, y, R + 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.autoT / AUTO_CYCLE, 0, 1));
      ctx.strokeStyle = 'rgba(255,190,120,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Rep counters: Goku's orange pips run left from the centre, Vegeta's blue ones run right
  const py = y + S / 2 + Math.max(9, S * 0.34);
  const pw = Math.max(5, S * 0.2);
  const ph = Math.max(4, S * 0.13);
  const pg = Math.max(2, S * 0.07);
  for (const [f, dir, lit, dim] of [
    [s.gk, -1, '#ffa040', 'rgba(255,160,64,0.18)'],
    [s.vg, 1, '#6f9bff', 'rgba(111,155,255,0.18)'],
  ] as const) {
    const n = f.reps === 0 ? 0 : ((f.reps - 1) % 10) + 1;
    const full = n === 10 && f.popT < 0.6;
    for (let i = 0; i < 10; i++) {
      const px = env.w / 2 + dir * (pg * 2 + i * (pw + pg)) + (dir < 0 ? -pw : 0);
      const fresh = i === n - 1 ? 1 + 0.6 * (1 - easeOutCubic(clamp(f.popT / 0.3, 0, 1))) : 1;
      const hh = ph * fresh;
      ctx.fillStyle = full ? '#ffffff' : i < n ? lit : dim;
      roundRect(ctx, px, py - hh / 2, pw, hh, Math.min(2, hh / 2));
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMachine(ctx: CanvasRenderingContext2D, s: State, t: number, alarm: number) {
  const { cx, floorY, H } = s;
  const g = s.g;
  const cw = H * 0.16;
  // Pillar up into the dome
  const pil = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0);
  pil.addColorStop(0, '#7d8494');
  pil.addColorStop(0.3, '#f4f6fa');
  pil.addColorStop(0.55, '#d5d9e2');
  pil.addColorStop(1, '#6a7080');
  ctx.fillStyle = pil;
  ctx.fillRect(cx - cw * 0.55, -H, cw * 1.1, floorY + H);
  ctx.strokeStyle = 'rgba(60,64,80,0.6)';
  ctx.lineWidth = Math.max(1, H * 0.004);
  ctx.strokeRect(cx - cw * 0.55, -H, cw * 1.1, floorY + H);
  // Ribs on the pillar
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const y = floorY - H * (0.72 + i * 0.12);
    ctx.moveTo(cx - cw * 0.55, y);
    ctx.quadraticCurveTo(cx, y + H * 0.02, cx + cw * 0.55, y);
  }
  ctx.stroke();

  // Base plinth
  ctx.fillStyle = '#9aa0ae';
  ctx.beginPath();
  ctx.ellipse(cx, floorY, cw * 1.25, cw * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pil;
  ctx.beginPath();
  ctx.moveTo(cx - cw * 1.25, floorY);
  ctx.lineTo(cx - cw * 1.05, floorY - H * 0.08);
  ctx.lineTo(cx + cw * 1.05, floorY - H * 0.08);
  ctx.lineTo(cx + cw * 1.25, floorY);
  ctx.ellipse(cx, floorY, cw * 1.25, cw * 0.3, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Console body
  const top = floorY - H * 0.6;
  const bot = floorY - H * 0.08;
  const bw = cw * 1.05;
  ctx.fillStyle = pil;
  roundRect(ctx, cx - bw, top, bw * 2, bot - top, H * 0.03);
  ctx.fill();
  ctx.stroke();
  // Screen panel
  const px = cx - bw * 0.78;
  const pw = bw * 1.56;
  const py = top + H * 0.05;
  const ph = H * 0.3;
  ctx.fillStyle = '#141820';
  roundRect(ctx, px, py, pw, ph, H * 0.015);
  ctx.fill();
  // Dial gauge: red sweep shows the gravity
  const dx = cx;
  const dy = py + ph * 0.5;
  const R = Math.min(pw, ph) * 0.36;
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  ctx.lineCap = 'butt';
  ctx.lineWidth = R * 0.28;
  ctx.strokeStyle = 'rgba(255,80,70,0.18)';
  ctx.beginPath();
  ctx.arc(dx, dy, R, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = `rgb(255,${Math.round(90 - 60 * g)},${Math.round(70 - 50 * g)})`;
  ctx.beginPath();
  ctx.arc(dx, dy, R, a0, lerp(a0, a1, Math.max(0.02, g)));
  ctx.stroke();
  // Ticks and needle
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.strokeStyle = 'rgba(255,200,190,0.6)';
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = lerp(a0, a1, i / 10);
    ctx.moveTo(dx + Math.cos(a) * R * 0.62, dy + Math.sin(a) * R * 0.62);
    ctx.lineTo(dx + Math.cos(a) * R * (i % 5 === 0 ? 0.42 : 0.5), dy + Math.sin(a) * R * (i % 5 === 0 ? 0.42 : 0.5));
  }
  ctx.stroke();
  const na = lerp(a0, a1, g) + Math.sin(t * 40) * 0.015 * g;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, R * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(dx, dy);
  ctx.lineTo(dx + Math.cos(na) * R * 0.8, dy + Math.sin(na) * R * 0.8);
  ctx.stroke();
  ctx.fillStyle = '#ff5040';
  ctx.beginPath();
  ctx.arc(dx, dy, R * 0.12, 0, TAU);
  ctx.fill();
  // Bar readout under the dial
  const segs = 10;
  const sw = (pw * 0.8) / segs;
  const sy = py + ph * 0.86;
  for (let i = 0; i < segs; i++) {
    const on = i < Math.round(g * segs);
    ctx.fillStyle = on ? (i > 6 ? '#ff3b30' : '#ff8a3d') : 'rgba(255,90,70,0.15)';
    ctx.fillRect(px + pw * 0.1 + i * sw + 1, sy - ph * 0.05, sw - 2, ph * 0.08);
  }
  // Buttons
  const btnY = bot - H * 0.07;
  const cols = ['#ffcf3a', '#3ad07a', '#ff4a3a'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.arc(cx + (i - 1) * bw * 0.45, btnY, H * 0.018, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Warning lamp on top of the console
  const ly = top - H * 0.02;
  ctx.fillStyle = '#5a5f6e';
  ctx.fillRect(cx - bw * 0.35, ly, bw * 0.7, H * 0.025);
  const lamp = ctx.createRadialGradient(cx, ly - H * 0.02, 0, cx, ly, H * 0.06);
  const on = 0.35 + 0.65 * Math.max(alarm, g * 0.5);
  lamp.addColorStop(0, `rgba(255,${Math.round(200 * on)},${Math.round(180 * on)},1)`);
  lamp.addColorStop(1, `rgb(${Math.round(150 + 105 * on)},20,20)`);
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.ellipse(cx, ly, bw * 0.3, H * 0.055, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(cx, ly - H * 0.02, 0, cx, ly - H * 0.02, H * (0.25 + 0.4 * g));
  halo.addColorStop(0, `rgba(255,60,40,${0.25 + 0.5 * on * g})`);
  halo.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - H, ly - H, H * 2, H * 2);
  ctx.globalCompositeOperation = 'source-over';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
