import {
  clamp,
  createCanvasScene,
  damp,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  noise,
  rand,
  TAU,
  tone,
} from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { BONE, drawDbzFighter, GOKU, makeMotes, makePose, mulberry32, settleLimbs, smoothstep } from './dbz-kit';
import type { DbzPose, HandShape, Mote } from './dbz-kit';

/**
 * Kamehameha: Goku in the cupped hands stance on a dusk wasteland.
 * Hold to charge a blue-white orb between the palms through four syllable beats
 * (aura, flutter, cracks, rising rocks, trembling screen); let go to fire a beam that
 * tears across the plain to the horizon and domes against a far mesa. Charge sets reach.
 */

/** Body key: hips, spine lean (neck offset ahead of the hips) and head tilt, in figure units */
interface BodyKey {
  hipX: number;
  hipY: number;
  leanX: number;
  tilt: number;
}
const IDLE_B: BodyKey = { hipX: 0.0, hipY: 0.395, leanX: 0.0, tilt: 0.02 };
// Wound back over the rear hip, weight on the back leg
const CHARGE_B: BodyKey = { hipX: -0.03, hipY: 0.36, leanX: -0.055, tilt: -0.12 };
// Driven forward into the push
const FIRE_B: BodyKey = { hipX: 0.05, hipY: 0.37, leanX: 0.105, tilt: 0.2 };
/** Feet stay planted in a wide stance through every pose */
const FOOT_NX = 0.25;
const FOOT_FX = -0.27;
const FOOT_Y = 0.06;
/** Seconds to draw the hands back to the hip, and to thrust them forward */
const DRAW_T = 0.32;
const THRUST = 0.15;

const MAX_MOTES = 260;
const CHARGE_RATE = 0.36;
const SNAP = 0.13;
const FADE = 0.55;
const RECOVER = 0.9;
const BEAM_N = 44;

interface Rock {
  u: number;
  z: number;
  size: number;
  th: number;
  maxLift: number;
  phase: number;
  spin: number;
  rot: number;
  lift: number;
  /** Blown away by the beam: offset and velocity in px */
  bx: number;
  by: number;
  vx: number;
  vy: number;
  gone: number;
  verts: Float32Array;
}

interface Crack {
  pts: Float32Array;
  lens: Float32Array;
  total: number;
  width: number;
}

interface Voice {
  bus: AudioBus;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  src: AudioBufferSourceNode;
  lp: BiquadFilterNode;
  gain: GainNode;
}

interface State {
  touched: boolean;
  pointerHeld: boolean;
  keyHeld: boolean;
  phase: 0 | 1 | 2; // idle, charge, fire
  level: number;
  c: number;
  stage: number;
  stagePulse: number;
  fireT: number;
  fireC: number;
  fired: boolean;
  impactT: number;
  impactStr: number;
  hitStop: number;
  flash: number;
  kick: number;
  shakeX: number;
  shakeY: number;
  demoT: number;
  motes: Mote[];
  cursor: number;
  rocks: Rock[];
  cracks: Crack[];
  crackReveal: number;
  moteAcc: number;
  dustAcc: number;
  pose: DbzPose;
  /** Idle to hands at the hip (0..1, linear) */
  drawK: number;
  /** Eased blend into the thrust pose */
  fireK: number;
  /** Energy anchor in screen px: between the cupped palms, then at the palm faces */
  ax: number;
  ay: number;
  /** Unit aim from the palms toward the target, screen space */
  aimX: number;
  aimY: number;
  /** Wrist bend: direction each hand points, figure space radians */
  dirN: number;
  dirF: number;
  voice: Voice | null;
  stars: Float32Array;
  far: Float32Array;
  mid: Float32Array;
  // layout
  gx: number;
  gy: number;
  H: number;
  horizon: number;
  tx: number;
  ty: number;
  /** Upper body pushed back by the beam, figure units (feet stay planted) */
  recoil: number;
}

/* ---------- setup ---------- */

function makeRocks(): Rock[] {
  const rng = mulberry32(17);
  const rocks: Rock[] = [];
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const verts = new Float32Array(14);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + rng() * 0.4;
      const r = 0.7 + rng() * 0.35;
      verts[k * 2] = Math.cos(a) * r;
      verts[k * 2 + 1] = Math.sin(a) * r * 0.8;
    }
    rocks.push({
      u: side * (0.25 + rng() * 0.75),
      z: rng() * 2 - 1,
      size: 0.016 + rng() * 0.03,
      th: 0.2 + rng() * 0.6,
      maxLift: 0.25 + rng() * 0.7,
      phase: rng() * TAU,
      spin: (rng() - 0.5) * 2.4,
      rot: rng() * TAU,
      lift: 0,
      bx: 0,
      by: 0,
      vx: 0,
      vy: 0,
      gone: 0,
      verts,
    });
  }
  return rocks;
}

function makeCracks(): Crack[] {
  const rng = mulberry32(41);
  const cracks: Crack[] = [];
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    let a = side > 0 ? rng() * 1.3 - 0.35 : Math.PI - (rng() * 1.3 - 0.35);
    let u = side * (0.04 + rng() * 0.1);
    let d = (rng() - 0.5) * 0.1;
    const segs = 5 + Math.floor(rng() * 4);
    const pts = new Float32Array((segs + 1) * 2);
    const lens = new Float32Array(segs + 1);
    pts[0] = u;
    pts[1] = d;
    let total = 0;
    for (let s = 1; s <= segs; s++) {
      a += (rng() - 0.5) * 0.8;
      const len = 0.05 + rng() * 0.09;
      u += Math.cos(a) * len;
      d += Math.sin(a) * len;
      pts[s * 2] = u;
      pts[s * 2 + 1] = d;
      total += len;
      lens[s] = total;
    }
    cracks.push({ pts, lens, total, width: 0.6 + rng() * 0.8 });
  }
  return cracks;
}

function ridge(w: number, baseY: number, height: number, seed: number, mesaAt: number) {
  const rng = mulberry32(seed);
  const pts: number[] = [];
  let x = -30;
  let y = baseY - height * 0.3;
  pts.push(x, y);
  while (x < w + 30) {
    const near = Math.abs(x - mesaAt) < height * 2.2;
    if (near || rng() < 0.3) {
      const top = baseY - height * (near ? 0.95 : 0.5 + rng() * 0.45);
      x += 8 + rng() * 10;
      pts.push(x, top);
      x += near ? 40 + rng() * 40 : 30 + rng() * 80;
      pts.push(x, top + rng() * 3);
      x += 8 + rng() * 12;
      y = baseY - height * (0.1 + rng() * 0.25);
      pts.push(x, y);
    } else {
      x += 20 + rng() * 50;
      y = clamp(y + (rng() - 0.5) * height * 0.35, baseY - height * 0.5, baseY - height * 0.05);
      pts.push(x, y);
    }
  }
  return new Float32Array(pts);
}

function fillRidge(ctx: CanvasRenderingContext2D, pts: Float32Array, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0], bottom);
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineTo(pts[pts.length - 2], bottom);
  ctx.closePath();
}

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

/* ---------- audio ---------- */

function startVoice(bus: AudioBus): Voice {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  lp.Q.value = 4;
  lp.connect(gain);
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 70;
  oscA.connect(lp);
  const oscB = ctx.createOscillator();
  oscB.type = 'triangle';
  oscB.frequency.value = 140.8;
  oscB.connect(lp);
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  src.connect(bp).connect(ng).connect(gain);
  oscA.start(now);
  oscB.start(now);
  src.start(now);
  return { bus, oscA, oscB, src, lp, gain };
}

function stopVoice(v: Voice) {
  const now = v.bus.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0.0001, now, 0.06);
  for (const n of [v.oscA, v.oscB, v.src]) {
    try {
      n.stop(now + 0.5);
    } catch {
      /* already stopped */
    }
  }
}

/* ---------- geometry ---------- */

const beamLayout = (s: State) => {
  // Rooted on the palms every frame: the anchor follows the rig, recoil and tremble included
  const ox = s.ax;
  const oy = s.ay;
  const dx = s.tx - ox;
  const dy = s.ty - oy;
  const len = Math.hypot(dx, dy);
  return { ox, oy, ang: Math.atan2(dy, dx), len };
};

/** Beam timeline for the current shot: tip and tail distance in px, width multiplier */
function beamState(s: State) {
  const c = s.fireC;
  const ext = 0.3 + 0.3 * c;
  const sustain = 0.45 + 1.25 * c;
  const t = s.fireT - SNAP;
  const { len } = beamLayout(s);
  const reach = len * Math.min(1, 0.32 + 0.85 * c);
  if (t < 0) return { tip: 0, tail: 0, wk: 0, ext, sustain, reach, end: false };
  const tip = reach * easeOutCubic(clamp(t / ext, 0, 1));
  const fk = clamp((t - ext - sustain) / FADE, 0, 1);
  const tail = reach * fk * fk;
  const wk = (1 - fk * 0.6) * (0.85 + 0.15 * easeOutCubic(clamp(t / 0.12, 0, 1)));
  return { tip, tail, wk, ext, sustain, reach, end: fk >= 1 };
}

function beamEdge(s: State, d: number, len: number, w0: number, t: number, turb: number, phase: number) {
  const k = d / Math.max(1, len);
  // Pinched to palm width at the root, flaring out over the first stretch
  const root = 0.38 + 0.62 * smoothstep(0, s.H * 0.3, d);
  const base = w0 * (1 - 0.68 * k) * root;
  const u = d / s.H;
  const n =
    Math.sin(u * 14 - t * 38 + phase) * 0.55 +
    Math.sin(u * 31 + t * 27 + phase * 2) * 0.3 +
    Math.sin(u * 5 - t * 11 + phase) * 0.15;
  return base * (1 + turb * n);
}

/** Orb strength: forms as the hands reach the hip, rides the thrust, gone once the beam fires */
function orbLevel(s: State) {
  // Carried forward whole on the thrust, swelling as the palms open, spent the instant it fires
  if (s.phase === 2) return s.fired ? 0 : s.fireC * (1 + 0.25 * clamp(s.fireT / SNAP, 0, 1));
  return s.c * easeInOutCubic(s.drawK);
}

/** Orb radius in px, with flicker and the syllable swell */
function orbRadius(s: State, t: number) {
  const k = orbLevel(s);
  const flick = 1 + Math.sin(t * 43) * 0.06 + Math.sin(t * 29) * 0.05;
  return s.H * (0.016 + 0.06 * k) * flick * (1 + s.stagePulse * 0.25) * (k > 0.005 ? 1 : 0);
}

/** Fists at rest, cupped top and bottom around the orb, then open palms stacked wrist to wrist */
function handShape(s: State, near: boolean): HandShape {
  if (s.fireK > 0.45) return near ? 'pushUp' : 'pushDown';
  if (s.drawK > 0.35 || s.fireK > 0) return near ? 'cupDown' : 'cupUp';
  return 'fist';
}

/* ---------- rig ---------- */

const POLE = new Float64Array(2);

/** Pole for a two bone chain: off the root to tip line on the given side (-1 clockwise) */
function pole(ax: number, ay: number, bx: number, by: number, side: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1;
  POLE[0] = (ax + bx) / 2 - (dy / d) * 0.12 * side;
  POLE[1] = (ay + by) / 2 + (dx / d) * 0.12 * side;
}

/**
 * Builds the pose from three layers: idle stance, hands drawn back to the rear hip around the
 * orb, and the two handed thrust aimed at the target. Hands are placed first, then elbows and
 * knees are solved with two bone IK so the limbs keep their length. Writes the energy anchor.
 * `orb` is the orb radius in figure units, `jit` a small tremble for the hands.
 */
function rig(s: State, t: number, orb: number, pulse: number, jit: number) {
  const p = s.pose;
  const dk = easeInOutCubic(s.drawK);
  const fk = s.fireK;
  const mixB = (k: keyof BodyKey) => lerp(lerp(IDLE_B[k], CHARGE_B[k], dk), FIRE_B[k], fk);

  const breath = Math.sin(t * 2) * 0.004 * (1 - dk) * (1 - fk);
  const hipX = mixB('hipX') + s.recoil * 0.6;
  const hipY = mixB('hipY') + breath - pulse * 0.012;
  const leanX = mixB('leanX') + s.recoil * 0.7;
  p.hipX = hipX;
  p.hipY = hipY;
  p.tilt = mixB('tilt');

  // Spine frame and shoulder roots, same offsets the figure uses
  let ux = leanX;
  let uy = 0.32;
  const ul = Math.hypot(ux, uy);
  ux /= ul;
  uy /= ul;
  p.neckX = hipX + ux * BONE.spine;
  p.neckY = hipY + uy * BONE.spine;
  const fx = uy;
  const fy = -ux;
  const sNx = p.neckX - ux * 0.035 + fx * 0.012;
  const sNy = p.neckY - uy * 0.035 + fy * 0.012;
  const sFx = p.neckX - ux * 0.035 - fx * 0.03;
  const sFy = p.neckY - uy * 0.035 - fy * 0.03;

  // Idle: loose fists low in front
  const iNx = sNx + 0.11;
  const iNy = sNy - 0.215;
  const iFx = sFx + 0.15;
  const iFy = sFy - 0.19;

  // Charge: palms cupped facing each other at the rear hip, the orb between them
  const cx = hipX - 0.06 - pulse * 0.012;
  const cy = hipY + 0.09;
  const gap = orb + 0.026;
  const cNx = cx - 0.05;
  const cNy = cy + gap;
  const cFx = cx - 0.06;
  const cFy = cy - gap;

  // Thrust: wrists together, aimed from the shoulders at the target
  const tgx = (s.tx - s.gx) / s.H;
  const tgy = (s.gy - s.ty) / s.H;
  const smx = (sNx + sFx) / 2;
  const smy = (sNy + sFy) / 2;
  let ax = tgx - smx;
  let ay = tgy - smy;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al;
  ay /= al;
  const px = -ay;
  const py = ax;
  const wx = sFx + ax * 0.28 + px * jit;
  const wy = sFy + ay * 0.28 + py * jit;
  const fNx = wx + ax * 0.018 + px * 0.008;
  const fNy = wy + ay * 0.018 + py * 0.008;
  const fFx = wx - px * 0.008;
  const fFy = wy - py * 0.008;

  // Layered blend of the hand targets
  p.nHx = lerp(lerp(iNx, cNx, dk), fNx, fk);
  p.nHy = lerp(lerp(iNy, cNy, dk), fNy, fk);
  p.fHx = lerp(lerp(iFx, cFx, dk), fFx, fk);
  p.fHy = lerp(lerp(iFy, cFy, dk), fFy, fk);

  // Energy anchor: orb centre between the cups, then just ahead of the palm faces
  const chX = lerp(cx, (fNx + fFx) / 2 + ax * 0.042, fk);
  const chY = lerp(cy, (fNy + fFy) / 2 + ay * 0.042, fk);
  const ox = lerp((cNx + cFx) / 2, (fNx + fFx) / 2, fk);
  const oy = lerp((cNy + cFy) / 2, (fNy + fFy) / 2, fk);
  const mx = (p.nHx + p.fHx) / 2 + (chX - ox);
  const my = (p.nHy + p.fHy) / 2 + (chY - oy);
  s.ax = s.gx + mx * s.H;
  s.ay = s.gy - my * s.H;
  s.aimX = ax;
  s.aimY = -ay;

  // Feet planted; elbows fold back and down, knees forward
  p.nFx = FOOT_NX;
  p.nFy = FOOT_Y;
  p.fFx = FOOT_FX;
  p.fFy = FOOT_Y;
  pole(sNx, sNy, p.nHx, p.nHy, -1);
  p.nEx = POLE[0];
  p.nEy = POLE[1];
  pole(sFx, sFy, p.fHx, p.fHy, -1);
  p.fEx = POLE[0];
  p.fEy = POLE[1];
  pole(hipX, hipY, p.nFx, p.nFy, 1);
  p.nKx = POLE[0];
  p.nKy = POLE[1];
  pole(hipX, hipY, p.fFx, p.fFy, 1);
  p.fKx = POLE[0];
  p.fKy = POLE[1];
  settleLimbs(p);

  // Wrists: follow the forearm at rest, bend to cup the orb, then square the palms to the aim
  const aim = Math.atan2(ay, ax);
  const bend = Math.max(dk, fk);
  const foreN = Math.atan2(p.nHy - p.nEy, p.nHx - p.nEx);
  const foreF = Math.atan2(p.fHy - p.fEy, p.fHx - p.fEx);
  s.dirN = lerp(foreN, lerp(-0.3, aim, fk), bend);
  s.dirF = lerp(foreF, lerp(0.3, aim, fk), bend);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 4.1,
    cursor: 'pointer',
    init: () => {
      const rng = mulberry32(5);
      const stars = new Float32Array(80 * 3);
      for (let i = 0; i < stars.length; i += 3) {
        stars[i] = rng();
        stars[i + 1] = rng() * rng();
        stars[i + 2] = rng() * TAU;
      }
      return {
        touched: false,
        pointerHeld: false,
        keyHeld: false,
        phase: 0,
        level: 0.08,
        c: 0.08,
        stage: 0,
        stagePulse: 0,
        fireT: 0,
        fireC: 0,
        fired: false,
        impactT: -1,
        impactStr: 0,
        hitStop: 0,
        flash: 0,
        kick: 0,
        shakeX: 0,
        shakeY: 0,
        demoT: 0,
        motes: makeMotes(MAX_MOTES),
        cursor: 0,
        rocks: makeRocks(),
        cracks: makeCracks(),
        crackReveal: 0,
        moteAcc: 0,
        dustAcc: 0,
        pose: makePose(),
        drawK: 0,
        fireK: 0,
        ax: 0,
        ay: 0,
        aimX: 1,
        aimY: 0,
        dirN: 0,
        dirF: 0,
        voice: null,
        stars,
        far: new Float32Array(0),
        mid: new Float32Array(0),
        gx: 0,
        gy: 0,
        H: 1,
        horizon: 0,
        tx: 0,
        ty: 0,
        recoil: 0,
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.H = Math.min(h * 0.5, w * 0.44);
      s.gx = Math.max(w * 0.2, s.H * 0.42);
      s.gy = h * 0.87;
      s.horizon = h * 0.58;
      s.tx = w * 0.86;
      s.ty = s.horizon - Math.min(h * 0.03, s.H * 0.05);
      s.far = ridge(w, s.horizon, Math.min(h * 0.16, s.H * 0.32), 11, s.tx);
      s.mid = ridge(w, s.horizon + h * 0.02, Math.min(h * 0.07, s.H * 0.14), 23, -9999);
    },
    update: (s, env, dtIn, t) => {
      const rm = env.reducedMotion;
      const demo = !s.touched && (!env.interactive || rm);
      const H = s.H;

      // Hit-stop freezes the simulation, effects still settle
      let dt = dtIn;
      if (s.hitStop > 0) {
        s.hitStop -= dtIn;
        dt = 0;
      }
      s.flash = Math.max(0, s.flash - dtIn * 2.4);
      s.kick = Math.max(0, s.kick - dtIn * 2.2);
      s.stagePulse = Math.max(0, s.stagePulse - dtIn * 3);

      // Demo loop for tiles and the reduced motion still: charge, fire, recover
      let holding = s.pointerHeld || s.keyHeld;
      if (demo) {
        s.demoT += dt;
        const ph = s.demoT % 7.2;
        holding = ph > 0.3 && ph < 2.7;
      }

      if (s.phase === 0 && holding) {
        s.phase = 1;
        s.stage = 0;
      }
      if (s.phase === 1) {
        if (holding) {
          s.level = Math.min(1, s.level + dt * CHARGE_RATE * (demo ? 1.25 : 1) * (1.15 - s.level * 0.3));
          if (rm && s.touched) env.wake(300);
        } else {
          fire(s, env);
        }
        // Syllable beats: KA, ME, HA, ME
        const st = Math.min(4, Math.floor(s.level * 4 + 0.02));
        if (st > s.stage) {
          s.stage = st;
          s.stagePulse = 1;
          const bus = env.audio();
          if (bus) {
            tone(bus, [196, 247, 294, 392][st - 1], { type: 'triangle', decay: 0.35, gain: 0.08 });
            tone(bus, [392, 494, 587, 784][st - 1], { type: 'sine', decay: 0.25, gain: 0.04, delay: 0.02 });
            // Crackle burst, brighter on each beat
            noise(bus, { duration: 0.16, freq: 2200 + 700 * st, q: 2.5, gain: 0.05 + 0.02 * st });
          }
        }
      } else if (s.phase === 0) {
        s.level = damp(s.level, 0.08, 1.5, dt);
      }
      s.c = damp(s.c, s.phase === 2 ? s.fireC * (1 - clamp(s.fireT / 0.4, 0, 1)) : s.level, 8, dt);
      const c = s.c;

      // Charge hum
      if (s.phase === 1 && !s.voice) {
        const bus = env.audio();
        if (bus) s.voice = startVoice(bus);
      }
      if (s.voice) {
        const v = s.voice;
        const now = v.bus.ctx.currentTime;
        v.gain.gain.setTargetAtTime(0.04 + 0.14 * c, now, 0.08);
        v.oscA.frequency.setTargetAtTime(70 + 90 * c, now, 0.1);
        v.oscB.frequency.setTargetAtTime(140.8 + 260 * c * c, now, 0.1);
        v.lp.frequency.setTargetAtTime(300 + 2400 * c * c, now, 0.08);
      }

      // Fire timeline
      let beamOn = 0;
      if (s.phase === 2) {
        s.fireT += dt;
        if (!s.fired && s.fireT >= SNAP) {
          s.fired = true;
          if (!rm) s.hitStop = 0.07;
          s.flash = rm ? 0.3 : 0.75;
          s.kick = 0.6 + 0.4 * s.fireC;
          const bus = env.audio();
          if (bus) {
            const b = beamState(s);
            tone(bus, 150, { type: 'sawtooth', glideTo: 45, decay: 0.9, gain: 0.16 });
            noise(bus, { duration: b.ext + b.sustain + 0.4, freq: 900, q: 0.5, gain: 0.3 });
            noise(bus, { duration: 0.5, freq: 3000, q: 0.7, gain: 0.12 });
          }
          // Rocks near the beam get blasted along it
          for (const r of s.rocks) {
            if (r.lift > H * 0.03) {
              r.vx = H * rand(1.5, 3.5) * (0.5 + s.fireC);
              r.vy = -H * rand(0.2, 0.9);
            }
          }
        }
        const b = beamState(s);
        if (s.fired && !b.end) beamOn = b.wk;
        // Impact when a full charge reaches the far mesa
        const { len } = beamLayout(s);
        if (s.impactT < 0 && s.fired && b.tip >= len - 1) {
          s.impactT = 0;
          s.impactStr = s.fireC;
          if (!rm) s.hitStop = 0.09;
          s.flash = Math.max(s.flash, rm ? 0.35 : 0.9);
          s.kick = 1;
          const bus = env.audio();
          if (bus) {
            tone(bus, 70, { type: 'sine', glideTo: 26, decay: 1.6, gain: 0.35 });
            noise(bus, { duration: 1.8, freq: 360, type: 'lowpass', gain: 0.4 });
          }
        }
        const endT = SNAP + b.ext + b.sustain + FADE;
        if (s.fireT > endT + RECOVER) {
          s.phase = holding ? 1 : 0;
          s.level = 0.08;
          s.stage = 0;
        }
        // Recoil: upper body driven back while the beam pours out, feet stay put
        const push = beamOn > 0 ? -0.035 * s.fireC : 0;
        s.recoil = damp(s.recoil, push, beamOn > 0 ? 3 : 1.5, dt);
      } else {
        s.recoil = damp(s.recoil, 0, 2, dt);
      }
      if (s.impactT >= 0) {
        s.impactT += dt;
        if (s.impactT > 4.5) s.impactT = -1;
      }

      // Shake
      const amp = rm
        ? 0
        : H * (0.014 * Math.pow(s.phase === 1 ? c : 0, 2.2) + 0.03 * s.kick + 0.006 * beamOn);
      s.shakeX = amp * (Math.sin(t * 53) * 0.6 + Math.sin(t * 37 + 1.3) * 0.4);
      s.shakeY = amp * (Math.sin(t * 47 + 0.7) * 0.6 + Math.sin(t * 29 + 2.1) * 0.4);

      // Pose: draw the hands back to the hip, thrust them forward, hold, recover
      if (s.phase === 1) s.drawK = Math.min(1, s.drawK + dt / DRAW_T);
      else if (s.phase === 0) s.drawK = damp(s.drawK, 0, 6, dt);
      if (s.phase === 2) {
        const b = beamState(s);
        const endT = SNAP + b.ext + b.sustain + FADE * 0.6;
        const thrust = easeOutCubic(clamp(s.fireT / THRUST, 0, 1));
        const back = easeInOutCubic(clamp((s.fireT - endT) / RECOVER, 0, 1));
        s.fireK = thrust * (1 - back);
        // Once the arms are out, the recovery blends straight back to the stance
        if (thrust >= 1) s.drawK = 0;
      } else {
        s.fireK = 0;
      }
      const orbR = orbRadius(s, t) / H;
      const jit = rm ? 0 : Math.sin(t * 47) * 0.004 * beamOn + Math.sin(t * 41) * 0.003 * (s.phase === 1 ? c * c : 0);
      rig(s, t, orbR * 0.8, s.phase === 1 ? s.stagePulse : 0, jit);

      // Particles
      const orbX = s.ax;
      const orbY = s.ay;
      if (s.phase === 1 && dt > 0) {
        s.moteAcc += dt * (20 + 110 * c);
        while (s.moteAcc >= 1) {
          s.moteAcc -= 1;
          const a = rand(0, TAU);
          const r = H * rand(0.35, 0.7);
          const life = rand(0.35, 0.6);
          emit(s, orbX + Math.cos(a) * r, orbY + Math.sin(a) * r * 0.8, (-Math.cos(a) * r) / life, (-Math.sin(a) * r * 0.8) / life, life, rand(1, 2.2), 0);
        }
      }
      const dustRate = s.phase === 1 ? 50 * Math.max(0, c - 0.3) : beamOn * 90;
      s.dustAcc += dt * dustRate;
      while (s.dustAcc >= 1) {
        s.dustAcc -= 1;
        const side = s.phase === 2 ? -1 : Math.random() < 0.5 ? -1 : 1;
        emit(
          s,
          s.gx + side * rand(0.1, 0.4) * H,
          s.gy + rand(-0.01, 0.03) * H,
          side * rand(0.4, 1.6) * H,
          -rand(0.05, 0.35) * H,
          rand(0.6, 1.2),
          rand(2, 6) * (H / 400 + 0.4),
          1
        );
      }
      // Embers peel off the beam
      if (beamOn > 0 && dt > 0) {
        const L = beamLayout(s);
        const b = beamState(s);
        for (let i = 0; i < 3; i++) {
          const d = rand(b.tail, b.tip);
          const k = d / L.len;
          const off = rand(-1, 1) * H * 0.12 * (1 - 0.5 * k) * s.fireC;
          const x = L.ox + Math.cos(L.ang) * d - Math.sin(L.ang) * off;
          const y = L.oy + Math.sin(L.ang) * d + Math.cos(L.ang) * off;
          emit(s, x, y, rand(-0.3, 0.6) * H, rand(-0.5, 0.3) * H, rand(0.3, 0.7), rand(1, 2.5), 2);
        }
      }
      if (s.impactT >= 0 && s.impactT < 0.05 && dt > 0) {
        for (let i = 0; i < 40; i++) {
          const a = rand(Math.PI, TAU);
          const v = H * rand(0.3, 1.4) * (0.4 + s.impactStr);
          emit(s, s.tx, s.ty, Math.cos(a) * v, Math.sin(a) * v * 0.6, rand(0.6, 1.4), rand(1.5, 3.5), 3);
        }
      }
      for (const p of s.motes) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 1) {
          p.vy += H * 0.4 * dt;
          p.vx *= Math.exp(-1.6 * dt);
        } else if (p.kind === 2) {
          p.vx *= Math.exp(-2 * dt);
          p.vy *= Math.exp(-2 * dt);
        } else if (p.kind === 3) {
          p.vy += H * 0.9 * dt;
        }
      }

      // Rocks lift with the charge, the beam blasts them away
      for (const r of s.rocks) {
        if (r.vx !== 0 || r.gone > 0) {
          r.bx += r.vx * dt;
          r.by += r.vy * dt;
          r.vy += H * 1.2 * dt;
          r.rot += r.spin * 6 * dt;
          if (r.bx > env.w * 1.2 || r.by > H * 0.6) {
            r.vx = 0;
            r.vy = 0;
            r.gone = 1;
          }
          if (r.gone > 0 && s.phase !== 2) {
            // Reappear quietly on the ground once the shot is over
            r.gone = 0;
            r.bx = 0;
            r.by = 0;
            r.lift = 0;
          }
          continue;
        }
        const cc = s.phase === 1 ? c : 0;
        const over = clamp((cc - r.th) / (1 - r.th), 0, 1);
        const target = over > 0 ? easeOutCubic(over) * r.maxLift * H * 0.7 + Math.sin(t * 1.7 + r.phase) * H * 0.02 * over : 0;
        r.lift = damp(r.lift, target, target > r.lift ? 2.4 : 6, dt);
        r.rot += r.spin * dt * clamp(r.lift / (H * 0.05), 0, 1);
      }

      const reveal = s.phase === 1 ? smoothstep(0.25, 0.9, s.level) : s.phase === 2 ? Math.max(s.crackReveal, s.fireC) : 0;
      s.crackReveal = damp(s.crackReveal, reveal, reveal > s.crackReveal ? 3 : 0.4, dt);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const { gy, H, horizon, tx, ty } = s;
      const gx = s.gx;
      const c = s.c;
      const pad = H * 0.1;
      const L = beamLayout(s);
      const b = s.phase === 2 && s.fired ? beamState(s) : null;
      const beamOn = b && !b.end ? b.wk : 0;
      const ik = s.impactT >= 0 ? s.impactT : -1;
      const glow = Math.max(c * 0.6, beamOn * s.fireC);

      ctx.save();
      ctx.translate(s.shakeX, s.shakeY);

      // Dusk sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#090a1f');
      sky.addColorStop(0.45, '#221a45');
      sky.addColorStop(0.8, '#6e3858');
      sky.addColorStop(1, '#e27a4c');
      ctx.fillStyle = sky;
      ctx.fillRect(-pad, -pad, w + pad * 2, horizon + pad);
      ctx.fillStyle = '#dfe6ff';
      for (let i = 0; i < s.stars.length; i += 3) {
        const a = (0.2 + 0.3 * Math.sin(t * 1.1 + s.stars[i + 2])) * (1 - glow * 0.8);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(s.stars[i] * w, s.stars[i + 1] * horizon * 0.7, 1.3, 1.3);
      }
      ctx.globalAlpha = 1;

      // Sunset glow low on the right and long cloud bands
      ctx.globalCompositeOperation = 'lighter';
      const sun = ctx.createRadialGradient(tx, horizon, 0, tx, horizon, w * 0.55);
      sun.addColorStop(0, 'rgba(255,150,90,0.35)');
      sun.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(-pad, -pad, w + pad * 2, horizon + pad);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 4; i++) {
        const cy = horizon * (0.3 + i * 0.14);
        const cw = w * (0.5 + 0.12 * i);
        const cx = ((i * 0.37 + t * 0.004 * (i + 1)) % 1.4) * w * 1.1 - w * 0.2;
        ctx.fillStyle = `rgba(${i > 1 ? '255,150,120' : '120,90,150'},${0.12 + 0.05 * i})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw * 0.5, H * 0.012 * (1 + i * 0.5), 0, 0, TAU);
        ctx.fill();
      }

      // Blue light spill from the energy
      if (glow > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const sx = beamOn > 0 ? lerp(L.ox, tx, 0.4) : gx - H * 0.25;
        const sy = beamOn > 0 ? lerp(L.oy, ty, 0.4) : gy - H * 0.5;
        const sp = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.75);
        sp.addColorStop(0, `rgba(90,170,255,${0.32 * glow})`);
        sp.addColorStop(1, 'rgba(60,120,255,0)');
        ctx.fillStyle = sp;
        ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Far mesas with warm rims
      ctx.fillStyle = '#3a2447';
      fillRidge(ctx, s.far, horizon + 4);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,170,120,0.35)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Impact dome on the far mesa
      if (ik >= 0) {
        const str = s.impactStr;
        const R = Math.min(h * 0.24, w * 0.16) * (0.6 + 0.4 * str);
        const grow = easeOutCubic(clamp(ik / 0.7, 0, 1));
        const beamLeft = b && !b.end ? 1 : 0;
        const fade = beamLeft ? 1 : clamp(1 - (ik - 1.4 - (b ? b.sustain : 0)) / 2.2, 0, 1);
        const r = R * (0.25 + 0.75 * grow) * (1 + (1 - fade) * 0.3);
        const pulse = 1 + Math.sin(t * 30) * 0.03 * beamLeft;
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 2.6);
        halo.addColorStop(0, `rgba(140,210,255,${0.5 * fade})`);
        halo.addColorStop(0.4, `rgba(90,160,255,${0.18 * fade})`);
        halo.addColorStop(1, 'rgba(80,140,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(tx - r * 2.6, ty - r * 2.6, r * 5.2, r * 5.2);
        ctx.globalCompositeOperation = 'source-over';
        // Solid dome: bright crown, cooler edge, a rim that ripples
        ctx.globalAlpha = Math.min(1, fade * 1.4);
        const dome = ctx.createRadialGradient(tx - r * 0.15, ty - r * 0.45, r * 0.05, tx, ty, r * pulse);
        dome.addColorStop(0, '#ffffff');
        dome.addColorStop(0.45, '#d4f0ff');
        dome.addColorStop(0.8, '#7cc2ff');
        dome.addColorStop(1, '#3f7fe8');
        ctx.fillStyle = dome;
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const a = Math.PI + (i / 28) * Math.PI;
          const rr = r * pulse * (1 + Math.sin(i * 2.7 + t * 18) * 0.025 * beamLeft);
          const x = tx + Math.cos(a) * rr;
          const y = ty + Math.sin(a) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        // Ground ring
        const rk = clamp(ik / 1.6, 0, 1);
        ctx.strokeStyle = `rgba(200,235,255,${(1 - rk) * 0.7})`;
        ctx.lineWidth = Math.max(1, H * 0.012 * (1 - rk));
        ctx.beginPath();
        ctx.ellipse(tx, ty + 2, R * (0.4 + 2.2 * easeOutCubic(rk)), R * 0.12 * (0.4 + 2.2 * easeOutCubic(rk)), 0, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        // Smoke left behind
        const smoke = clamp((ik - 1) / 1.5, 0, 1) * fade;
        if (smoke > 0.01 && !beamLeft) {
          ctx.fillStyle = `rgba(40,30,60,${0.45 * smoke})`;
          for (let i = 0; i < 5; i++) {
            const a = Math.PI + (i + 0.5) * (Math.PI / 5);
            ctx.beginPath();
            ctx.arc(tx + Math.cos(a) * r * 0.6, ty + Math.sin(a) * r * 0.55 - (ik - 1) * H * 0.04, r * 0.42, 0, TAU);
            ctx.fill();
          }
        }
      }

      // Plain
      const ground = ctx.createLinearGradient(0, horizon, 0, h);
      ground.addColorStop(0, '#4a2c45');
      ground.addColorStop(0.35, '#2b1a31');
      ground.addColorStop(1, '#120b18');
      ctx.fillStyle = ground;
      ctx.fillRect(-pad, horizon, w + pad * 2, h - horizon + pad);
      ctx.fillStyle = '#2a1a33';
      fillRidge(ctx, s.mid, horizon + h * 0.05);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,160,120,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Ground streaks give the plain depth
      ctx.strokeStyle = 'rgba(255,190,160,0.06)';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = lerp(horizon + h * 0.06, h, Math.pow(i / 8, 1.7));
        ctx.moveTo(-pad, y);
        ctx.lineTo(w + pad, y + (i % 2 ? 2 : -2));
      }
      ctx.stroke();

      // Beam light on the ground under its path
      if (beamOn > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const x0 = L.ox + Math.cos(L.ang) * b!.tail;
        const x1 = L.ox + Math.cos(L.ang) * b!.tip;
        const mx = (x0 + x1) / 2;
        const my = lerp(gy, ty + h * 0.03, clamp((mx - gx) / (tx - gx), 0, 1));
        const half = Math.max(1, (x1 - x0) / 2);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(Math.atan2(ty + h * 0.03 - gy, tx - gx));
        ctx.scale(1, 0.07);
        const lg = ctx.createRadialGradient(-half * 0.3, 0, 0, 0, 0, half * 1.1);
        lg.addColorStop(0, `rgba(110,190,255,${0.22 * beamOn})`);
        lg.addColorStop(1, 'rgba(110,190,255,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(0, 0, half * 1.1, 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }

      // Ground pool of light under Goku
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(gx - H * 0.1, gy);
      ctx.scale(1, 0.22);
      const pr = H * (0.5 + 0.9 * glow);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
      pool.addColorStop(0, `rgba(120,200,255,${0.08 + 0.4 * glow})`);
      pool.addColorStop(1, 'rgba(80,150,255,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // Contact shadow
      ctx.fillStyle = 'rgba(8,4,14,0.5)';
      ctx.beginPath();
      ctx.ellipse(gx, gy + H * 0.012, H * 0.34, H * 0.035, 0, 0, TAU);
      ctx.fill();

      // Cracks with a glowing core
      if (s.crackReveal > 0.01) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 3; pass++) {
          if (pass === 0) ctx.strokeStyle = 'rgba(6,3,10,0.85)';
          else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = pass === 1 ? `rgba(60,140,255,${0.3 * glow + 0.05})` : `rgba(210,240,255,${0.25 + 0.6 * glow})`;
          }
          for (const cr of s.cracks) {
            const lim = cr.total * s.crackReveal;
            ctx.lineWidth = Math.max(0.8, H * 0.006 * cr.width) * (pass === 1 ? 4 : pass === 2 ? 0.5 : 1.2);
            ctx.beginPath();
            ctx.moveTo(gx + cr.pts[0] * H, gy + cr.pts[1] * H * 0.25);
            for (let i = 1; i < cr.lens.length; i++) {
              let ux = cr.pts[i * 2];
              let ud = cr.pts[i * 2 + 1];
              if (cr.lens[i] > lim) {
                const k = (lim - cr.lens[i - 1]) / (cr.lens[i] - cr.lens[i - 1]);
                ux = lerp(cr.pts[(i - 1) * 2], ux, k);
                ud = lerp(cr.pts[(i - 1) * 2 + 1], ud, k);
                ctx.lineTo(gx + ux * H, gy + ud * H * 0.25);
                break;
              }
              ctx.lineTo(gx + ux * H, gy + ud * H * 0.25);
            }
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      const drawRocks = (front: boolean) => {
        for (const r of s.rocks) {
          if (r.gone > 0 || r.z >= 0 !== front) continue;
          const baseY = gy + r.z * H * 0.08;
          const x = s.gx + r.u * H + r.bx;
          const size = r.size * H * (1 + r.z * 0.2);
          const lifted = clamp(r.lift / (H * 0.2), 0, 1);
          if (r.vx === 0) {
            ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - lifted * 0.7)})`;
            ctx.beginPath();
            ctx.ellipse(x, baseY + size * 0.4, size * (1.2 - lifted * 0.5), size * 0.3, 0, 0, TAU);
            ctx.fill();
          }
          const jit = s.phase === 1 && c > 0.7 ? Math.sin(t * 60 + r.phase) * H * 0.003 : 0;
          ctx.save();
          ctx.translate(x + jit, baseY - r.lift + r.by);
          ctx.rotate(r.rot);
          ctx.beginPath();
          for (let k = 0; k < 7; k++) {
            const vx = r.verts[k * 2] * size;
            const vy = r.verts[k * 2 + 1] * size;
            if (k === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          ctx.fillStyle = '#3a2838';
          ctx.fill();
          ctx.strokeStyle = `rgba(170,220,255,${0.15 + 0.6 * glow})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      };
      drawRocks(false);

      // Aura: blue-white flame around the body while charging
      const auraK = s.phase === 1 ? Math.min(1.2, c + s.stagePulse * 0.3) : s.phase === 2 ? beamOn * 0.5 * s.fireC : c * 0.3;
      if (auraK > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        const acx = gx - H * 0.03;
        for (let layer = 0; layer < 3; layer++) {
          const grow = auraK * (1.1 - layer * 0.25);
          const alpha = (0.05 + 0.04 * layer) * (0.3 + 0.7 * auraK);
          ctx.fillStyle = layer === 2 ? `rgba(230,248,255,${alpha})` : `rgba(90,170,255,${alpha})`;
          flame(ctx, acx, gy, H, grow, t, layer + 1);
          ctx.fill();
          // Bright edge on each shell, the way cel auras are inked
          ctx.strokeStyle = `rgba(${layer === 2 ? '235,250,255' : '130,200,255'},${(0.25 + 0.1 * layer) * auraK})`;
          ctx.lineWidth = Math.max(1, H * (0.006 - layer * 0.0015));
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Dust behind the figure
      for (const p of s.motes) {
        if (p.life <= 0 || p.kind !== 1) continue;
        const k = p.life / p.max;
        ctx.fillStyle = `rgba(150,110,130,${0.3 * k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.8 - k * 0.8), 0, TAU);
        ctx.fill();
      }

      // Goku
      const orbX = s.ax;
      const orbY = s.ay;
      const firing = s.phase === 2 && s.fireT > SNAP * 0.5 && (!b || !b.end || s.fireT < SNAP + b.ext + b.sustain + FADE);
      const lightX = firing ? L.ox + H * 0.3 : s.phase === 1 ? orbX : w * 1.2;
      const lightY = firing ? L.oy : s.phase === 1 ? orbY : horizon;
      const mouth =
        s.phase === 2 && s.fireT < SNAP + (b ? b.ext + b.sustain : 0)
          ? 1
          : s.phase === 1
            ? 0.25 + 0.55 * s.stagePulse
            : 0;
      drawDbzFighter(ctx, GOKU, s.pose, {
        x: gx,
        gy,
        H,
        facing: 1,
        lightX,
        lightY,
        rim: firing || s.phase === 1 ? '190,235,255' : '255,180,130',
        rimK: firing ? 1 : s.phase === 1 ? 0.35 + 0.65 * c : 0.55,
        t,
        flutter: 0.15 + (s.phase === 1 ? c : 0) + beamOn * 0.9,
        hairLift: s.phase === 1 ? c * 0.8 : beamOn * 0.3,
        handN: handShape(s, true),
        handF: handShape(s, false),
        handDirN: s.dirN,
        handDirF: s.dirF,
        mouth,
        strain: s.phase === 0 ? 0.2 : Math.max(c, beamOn),
      });

      ctx.globalCompositeOperation = 'lighter';
      // Blue wash over the figure from the energy
      if (glow > 0.02) {
        const wx = firing ? L.ox : orbX;
        const wy = firing ? L.oy : orbY;
        const wash = ctx.createRadialGradient(wx, wy, 0, wx, wy, H * 0.6);
        wash.addColorStop(0, `rgba(120,200,255,${0.35 * glow})`);
        wash.addColorStop(1, 'rgba(90,160,255,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(wx - H * 0.6, wy - H * 0.6, H * 1.2, H * 1.2);
      }

      // Orb between the cupped palms
      const orbK = orbLevel(s);
      if (orbK > 0.01) {
        const r = orbRadius(s, t);
        const og = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, r * 4);
        og.addColorStop(0, `rgba(255,255,255,${0.9 * Math.min(1, orbK * 2)})`);
        og.addColorStop(0.18, `rgba(200,240,255,${0.8 * Math.min(1, orbK * 2)})`);
        og.addColorStop(0.35, `rgba(80,170,255,${0.45 * orbK + 0.1})`);
        og.addColorStop(1, 'rgba(40,110,255,0)');
        ctx.fillStyle = og;
        ctx.fillRect(orbX - r * 4, orbY - r * 4, r * 8, r * 8);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(orbX, orbY, r * 0.55, 0, TAU);
        ctx.fill();
        // Crackling arcs around the orb
        if (orbK > 0.4) {
          ctx.strokeStyle = `rgba(200,240,255,${(orbK - 0.4) * 1.4})`;
          ctx.lineWidth = Math.max(1, H * 0.003);
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a0 = t * (7 + i * 3) + i * 2.1;
            let px = orbX + Math.cos(a0) * r * 1.1;
            let py = orbY + Math.sin(a0) * r * 1.1;
            ctx.moveTo(px, py);
            for (let k = 1; k <= 4; k++) {
              const a = a0 + k * 0.35;
              const rr = r * (1.2 + k * 0.35 + Math.sin(t * 90 + k * 3 + i) * 0.25);
              px = orbX + Math.cos(a) * rr;
              py = orbY + Math.sin(a) * rr;
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
        }
        // Syllable pulse ring
        if (s.stagePulse > 0.01) {
          const k = 1 - s.stagePulse;
          ctx.strokeStyle = `rgba(190,235,255,${s.stagePulse * 0.8})`;
          ctx.lineWidth = Math.max(1, H * 0.012 * s.stagePulse);
          ctx.beginPath();
          ctx.arc(orbX, orbY, r * (1.5 + 6 * easeOutCubic(k)), 0, TAU);
          ctx.stroke();
        }
      }

      // Energy motes streaming into the orb
      ctx.lineCap = 'round';
      for (const p of s.motes) {
        if (p.life <= 0 || p.kind !== 0) continue;
        const k = p.life / p.max;
        ctx.strokeStyle = `rgba(190,235,255,${0.85 * (1 - k * 0.5)})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      }

      // The beam
      if (b && beamOn > 0 && b.tip > b.tail + 1) {
        const w0 = H * (0.035 + 0.075 * s.fireC) * beamOn;
        ctx.save();
        ctx.translate(L.ox, L.oy);
        ctx.rotate(L.ang);
        const layers: readonly (readonly [number, number, string])[] = [
          [1.9, 0.18, 'rgba(50,120,255,0.13)'],
          [1.45, 0.16, 'rgba(60,150,255,0.5)'],
          [1.05, 0.12, 'rgba(120,205,255,0.85)'],
          [0.62, 0.08, 'rgba(225,246,255,0.95)'],
          [0.3, 0.05, 'rgba(255,255,255,1)'],
        ];
        for (let li = 0; li < layers.length; li++) {
          const [mul, turb, col] = layers[li];
          ctx.fillStyle = col;
          ctx.beginPath();
          for (let i = 0; i <= BEAM_N; i++) {
            const d = lerp(b.tail, b.tip, i / BEAM_N);
            const e = beamEdge(s, d, L.len, w0, t, turb, li) * mul;
            if (i === 0) ctx.moveTo(d, -e);
            else ctx.lineTo(d, -e);
          }
          const endR = beamEdge(s, b.tip, L.len, w0, t, 0, 0) * mul;
          ctx.arc(b.tip, 0, endR, -Math.PI / 2, Math.PI / 2);
          for (let i = BEAM_N; i >= 0; i--) {
            const d = lerp(b.tail, b.tip, i / BEAM_N);
            const e = beamEdge(s, d, L.len, w0, t, turb, li + 3) * mul;
            ctx.lineTo(d, e);
          }
          ctx.closePath();
          ctx.fill();
        }
        // Spiral strands winding along the beam
        ctx.lineWidth = Math.max(1, H * 0.004);
        for (let k = 0; k < 2; k++) {
          ctx.strokeStyle = `rgba(210,240,255,${0.55 * beamOn})`;
          ctx.beginPath();
          for (let i = 0; i <= BEAM_N; i++) {
            const d = lerp(b.tail, b.tip, i / BEAM_N);
            const e = beamEdge(s, d, L.len, w0, t, 0, 0) * 1.25;
            const y = Math.sin((d / H) * 9 - t * 26 + k * Math.PI) * e;
            if (i === 0) ctx.moveTo(d, y);
            else ctx.lineTo(d, y);
          }
          ctx.stroke();
        }
        // Leading bulb and bow shock at the tip
        if (b.tip < L.len - 1 || s.impactT < 0) {
          const er = beamEdge(s, b.tip, L.len, w0, t, 0, 0) * 1.9;
          const hg = ctx.createRadialGradient(b.tip, 0, 0, b.tip, 0, er);
          hg.addColorStop(0, 'rgba(255,255,255,1)');
          hg.addColorStop(0.4, 'rgba(170,230,255,0.8)');
          hg.addColorStop(1, 'rgba(70,150,255,0)');
          ctx.fillStyle = hg;
          ctx.fillRect(b.tip - er, -er, er * 2, er * 2);
          ctx.strokeStyle = `rgba(200,240,255,0.5)`;
          ctx.lineWidth = Math.max(1, H * 0.004);
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const rr = er * (1 + k * 0.35 + ((t * 4 + k * 0.33) % 1) * 0.3);
            ctx.moveTo(b.tip + Math.cos(-0.9) * rr, Math.sin(-0.9) * rr);
            ctx.arc(b.tip, 0, rr, -0.9, 0.9);
          }
          ctx.stroke();
        }
        ctx.restore();

        // Muzzle flare at the palms with an anamorphic streak
        // Kept tight so the arms still read through the glow
        const attached = 1 - clamp(b.tail / (H * 0.25), 0, 1);
        const mr = H * (0.07 + 0.09 * s.fireC) * beamOn * attached * (1 + Math.sin(t * 50) * 0.05);
        if (mr > 0.5) {
          const mg = ctx.createRadialGradient(L.ox, L.oy, 0, L.ox, L.oy, mr);
          mg.addColorStop(0, 'rgba(255,255,255,1)');
          mg.addColorStop(0.3, 'rgba(190,235,255,0.85)');
          mg.addColorStop(1, 'rgba(60,140,255,0)');
          ctx.fillStyle = mg;
          ctx.fillRect(L.ox - mr, L.oy - mr, mr * 2, mr * 2);
        }
        const streak = ctx.createLinearGradient(L.ox - w * 0.5, 0, L.ox + w * 0.5, 0);
        streak.addColorStop(0, 'rgba(120,190,255,0)');
        streak.addColorStop(0.5, `rgba(200,235,255,${0.55 * beamOn * attached})`);
        streak.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = streak;
        ctx.beginPath();
        ctx.ellipse(L.ox, L.oy, w * 0.5, Math.max(1.5, w0 * 0.12), 0, 0, TAU);
        ctx.fill();
        // Lens ghosts along the line through the frame centre
        const gxv = w / 2 - L.ox;
        const gyv = h / 2 - L.oy;
        const ghosts: readonly (readonly [number, number, string])[] = [
          [0.7, 0.05, '120,200,255'],
          [1.25, 0.03, '170,140,255'],
          [1.6, 0.08, '120,255,230'],
          [2.05, 0.04, '255,190,140'],
        ];
        for (const [k, rr, col] of ghosts) {
          const x = L.ox + gxv * k;
          const y = L.oy + gyv * k;
          const R = Math.min(w, h) * rr;
          const gg = ctx.createRadialGradient(x, y, R * 0.6, x, y, R);
          gg.addColorStop(0, `rgba(${col},${0.07 * beamOn})`);
          gg.addColorStop(0.9, `rgba(${col},${0.12 * beamOn})`);
          gg.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(x, y, R, 0, TAU);
          ctx.fill();
        }
      }

      // Embers and impact sparks
      for (const p of s.motes) {
        if (p.life <= 0 || (p.kind !== 2 && p.kind !== 3)) continue;
        const k = p.life / p.max;
        ctx.fillStyle = p.kind === 2 ? `rgba(200,240,255,${k})` : `rgba(255,${Math.round(200 + 55 * k)},${Math.round(160 + 95 * k)},${k})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalCompositeOperation = 'source-over';

      drawRocks(true);
      ctx.restore();

      // Flash
      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(200,235,255,${s.flash * 0.55})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Vignette
      const vig = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
      vig.addColorStop(0, 'rgba(6,4,14,0)');
      vig.addColorStop(1, 'rgba(6,4,14,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Four syllable pips
      if (env.interactive) {
        const n = s.phase === 1 ? s.stage : s.phase === 2 && s.fireT < 1.2 ? 4 : 0;
        const py = h - Math.max(18, h * 0.05);
        const gap = 18;
        for (let i = 0; i < 4; i++) {
          const x = w / 2 + (i - 1.5) * gap;
          const lit = i < n;
          const sz = lit ? 5 + (i === n - 1 ? s.stagePulse * 3 : 0) : 4;
          ctx.beginPath();
          ctx.moveTo(x, py - sz);
          ctx.lineTo(x + sz, py);
          ctx.lineTo(x, py + sz);
          ctx.lineTo(x - sz, py);
          ctx.closePath();
          if (lit) {
            ctx.fillStyle = s.phase === 2 ? 'rgba(255,255,255,0.95)' : 'rgba(150,215,255,0.95)';
            ctx.fill();
          } else {
            ctx.strokeStyle = 'rgba(220,230,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    },
    onPointerDown: (s) => {
      s.pointerHeld = true;
      s.touched = true;
    },
    onPointerUp: (s) => {
      s.pointerHeld = false;
    },
    onKey: (s, _env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat && down) return true;
      s.keyHeld = down;
      if (down) s.touched = true;
      return true;
    },
    dispose: (s) => {
      if (s.voice) stopVoice(s.voice);
      s.voice = null;
    },
  });

function fire(s: State, env: SceneEnv) {
  if (s.voice) {
    stopVoice(s.voice);
    s.voice = null;
  }
  s.phase = 2;
  s.fireT = 0;
  s.fired = false;
  s.fireC = clamp(s.level, 0.15, 1);
  s.impactT = -1;
  if (s.touched) env.wake(6000);
}

/** Flame-shaped aura: rounded base, tongues licking upward */
function flame(ctx: CanvasRenderingContext2D, cx: number, footY: number, H: number, grow: number, t: number, seed: number) {
  const N = 30;
  const cy = footY - H * 0.46;
  const rx = H * (0.3 + 0.16 * grow);
  const ryUp = H * (0.62 + 0.36 * grow);
  const ryDown = H * 0.5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * TAU;
    const sx = Math.sin(th);
    const cyv = Math.cos(th);
    const up = Math.max(0, cyv);
    const tip = i % 2 === 1;
    const lick = 0.55 + 0.45 * Math.sin(t * (10 + seed) + i * 2.3 + seed * 5);
    const amp = up * up * (0.1 + 0.28 * grow);
    const m = tip ? 1 + amp * lick : 1 - amp * 0.15;
    const x = sx * rx * m * (1 - up * 0.25 * (tip ? 1 : 0.3)) + Math.sin(t * 3 + i + seed) * H * 0.006;
    const y = Math.min(-cyv * (cyv > 0 ? ryUp : ryDown) * m, H * 0.48);
    FLAME[i * 2] = cx + x;
    FLAME[i * 2 + 1] = cy + y;
  }
  // Midpoint quadratic smoothing keeps the tongues soft
  ctx.moveTo((FLAME[0] + FLAME[2]) / 2, (FLAME[1] + FLAME[3]) / 2);
  for (let i = 1; i <= N; i++) {
    const j = i === N ? 1 : i + 1;
    ctx.quadraticCurveTo(FLAME[i * 2], FLAME[i * 2 + 1], (FLAME[i * 2] + FLAME[j * 2]) / 2, (FLAME[i * 2 + 1] + FLAME[j * 2 + 1]) / 2);
  }
  ctx.closePath();
}
const FLAME = new Float64Array(64);
