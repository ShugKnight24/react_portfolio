import { clamp, createCanvasScene, damp, lerp, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  aimCam,
  BALL_R,
  camX,
  camY,
  clonePose,
  copyPose,
  crowdRoar,
  drawAthlete,
  drawBall,
  drawCrowd,
  drawFlashes,
  drawHoopBack,
  drawHoopFront,
  drawVignette,
  fitCam,
  gripPoint,
  halftoneLayer,
  headline,
  label,
  legIK,
  lerpPose,
  makeCam,
  makeCrowd,
  makeHoop,
  makeRig,
  makeSkel,
  netSnap,
  numeralLine,
  numeralTone,
  pose,
  rimHit,
  sfxBounce,
  sfxRim,
  sfxSqueak,
  sfxSwish,
  smooth01,
  solve,
  standH,
  updateHoop,
} from './legends-hoops-kit';
import type { AthleteKit, Cam, Fan, Flash, Hoop, HoopStyle, Pose, RimLight, Skel } from './legends-hoops-kit';

/**
 * Kobe: The Elbow. A footwork-to-fadeaway tribute: catch at the elbow, jab, pump fake,
 * spin off the pivot foot and rise into the fadeaway with the lead knee up. Click (or Space)
 * to start the move, then again to let it go: a meter runs through the jump and the window
 * sits at the top. On time it is a swish with a snap of the net, a little off rattles in,
 * well off is short or long. The arc leaves a gold trail; makes in a row build a streak.
 */

const RIG = makeRig(1.98, 0.97);
const STAND = standH(RIG);
const K0 = -4.7;
const D0 = -3.42;
const VIEW_LO = -7.2;
const VIEW_HI = 1.7;

/** Seconds into the possession */
const T_TAKEOFF = 1.56;
const T_APEX = 1.92;
const T_LAND = 2.32;
const T_END = 3.9;
const PERFECT = 0.05;
const BEATS = [0.24, 0.44, 0.88, 1.3, 1.44, T_LAND];
const GOOD = 0.12;

const KOBE_KIT: AthleteKit = {
  skin: ['#1d0f2c', '#050208'],
  jersey: ['#43217a', '#130620'],
  shorts: ['#3a1c6b', '#10051c'],
  trim: 'rgba(253,185,39,0.75)',
  shoe: '#0d0814',
  sole: 'rgba(253,185,39,0.85)',
  number: '24',
  numberInk: '#fdb927',
  numberLine: 'rgba(30,8,50,0.9)',
  highTops: false,
  sleeve: { arm: 0, color: '#0b0612' },
  sock: '#22152e',
  hair: '#07030b',
};

const DEF_KIT: AthleteKit = {
  skin: ['#120c1a', '#030205'],
  jersey: ['#26222e', '#0a080d'],
  shorts: ['#211d28', '#08070b'],
  trim: 'rgba(210,200,235,0.3)',
  shoe: '#0a090c',
  sole: 'rgba(200,190,230,0.5)',
  number: '',
  numberInk: '#fff',
  numberLine: '#000',
  highTops: false,
  hair: '#050307',
};

const KOBE_LIGHT: RimLight = {
  key: '#ffe39a',
  back: '#b48cff',
  halo: '#f5b72a',
  kx: 0.72,
  ky: -0.69,
  sep: 'rgba(253,185,39,0.3)',
  haloAlpha: 0.42,
};

const DEF_LIGHT: RimLight = {
  key: '#c9adff',
  back: '#ff9a4a',
  halo: '#7a45c0',
  kx: 0.72,
  ky: -0.69,
  sep: 'rgba(201,173,255,0.22)',
  haloAlpha: 0.3,
};

const HOOP_STYLE: HoopStyle = {
  rim: '#ff9a3a',
  rimGlow: '#fdb927',
  net: 'rgba(255,236,206,0.85)',
  board: '#07030e',
  boardEdge: 'rgba(255,211,107,0.6)',
  pole: '#07030e',
};

/* ---------- keyframed tracks ---------- */

type Foot = [number, number, number] | null;

interface Key {
  t: number;
  p: Pose;
  /** Ankle targets (world x, ankle height, heel lift) for the near and far foot; null = use the pose's angles */
  feet: [Foot, Foot];
}

const Y0 = -12;
const A = RIG.ankleH;

/** k(t, x, y, yaw, lean, head, legs (only used in the air), arms, feet) */
const k = (
  t: number,
  x: number,
  y: number,
  yaw: number,
  lean: number,
  head: number,
  l0: [number, number, number],
  l1: [number, number, number],
  a0: [number, number, number, number],
  a1: [number, number, number, number],
  f0: Foot,
  f1: Foot
): Key => ({ t, p: pose(x, y, yaw, lean, head, l0, l1, a0, a1), feet: [f0, f1] });

const L0: [number, number, number] = [20, 40, 0];
const BALL_HIP_N: [number, number, number, number] = [24, -14, 84, 8];
const BALL_HIP_F: [number, number, number, number] = [40, -26, 78, 0];
const BALL_UP_N: [number, number, number, number] = [138, -12, 72, -26];
const BALL_UP_F: [number, number, number, number] = [130, -22, 72, -18];
const TUCK_N: [number, number, number, number] = [22, -20, 96, 6];
const TUCK_F: [number, number, number, number] = [30, -30, 92, 0];
const SET_N: [number, number, number, number] = [142, 4, 104, -40];
const SET_F: [number, number, number, number] = [128, 22, 92, -10];

/** Kobe's possession (the shooting arm is overridden once the jump starts) */
const KOBE_KEYS: Key[] = [
  k(0, K0, STAND - 0.16, Y0, 18, -10, L0, L0, BALL_HIP_N, BALL_HIP_F, [K0 + 0.26, A, 0], [K0 - 0.26, A, 0]),
  // Jab step at the defender
  k(0.12, K0 + 0.05, STAND - 0.2, Y0, 22, -8, L0, L0, BALL_HIP_N, BALL_HIP_F, [K0 + 0.48, A + 0.1, 0.2], [K0 - 0.26, A, 0]),
  k(0.24, K0 + 0.13, STAND - 0.25, Y0, 26, -6, L0, L0, [16, -12, 92, 8], [34, -24, 88, 0], [K0 + 0.66, A, 0], [K0 - 0.26, A, 0.15]),
  k(0.44, K0 + 0.01, STAND - 0.17, Y0, 16, -10, L0, L0, BALL_HIP_N, BALL_HIP_F, [K0 + 0.27, A, 0], [K0 - 0.26, A, 0]),
  // Pump fake: rise on the toes, ball to the forehead, eyes at the rim
  k(0.6, K0 + 0.03, STAND - 0.07, Y0, 4, -20, L0, L0, BALL_UP_N, BALL_UP_F, [K0 + 0.27, A, 0.32], [K0 - 0.26, A, 0.32]),
  k(0.74, K0 + 0.03, STAND - 0.06, Y0, 3, -20, L0, L0, BALL_UP_N, BALL_UP_F, [K0 + 0.27, A, 0.34], [K0 - 0.26, A, 0.34]),
  k(0.88, K0, STAND - 0.2, Y0, 20, -6, L0, L0, TUCK_N, TUCK_F, [K0 + 0.27, A, 0], [K0 - 0.26, A, 0.1]),
  // Spin: a full turn on the far (pivot) foot, the near foot sweeping round
  k(1.02, K0 - 0.05, STAND - 0.18, Y0 - 100, 16, -4, L0, L0, TUCK_N, TUCK_F, [K0 + 0.1, A + 0.12, 0.3], [K0 - 0.26, A, 0.5]),
  k(1.16, K0 - 0.1, STAND - 0.17, Y0 - 200, 14, -4, L0, L0, TUCK_N, TUCK_F, [K0 - 0.2, A + 0.14, 0.3], [K0 - 0.26, A, 0.5]),
  k(1.3, K0 - 0.1, STAND - 0.22, Y0 - 300, 14, -6, L0, L0, TUCK_N, TUCK_F, [K0 + 0.02, A + 0.08, 0.2], [K0 - 0.26, A, 0.4]),
  // Gather: square up, sink, ball to the set point
  k(1.44, K0 - 0.08, STAND - 0.3, Y0 - 360, 10, -12, L0, L0, [74, -10, 104, -14], [70, -24, 100, 0], [K0 + 0.14, A, 0], [K0 - 0.28, A, 0]),
  k(T_TAKEOFF, K0 - 0.12, STAND - 0.18, Y0 - 360, 2, -16, L0, L0, SET_N, SET_F, [K0 + 0.14, A, 0.6], [K0 - 0.28, A, 0.7]),
  // The fadeaway: drift back, lead knee up, the other leg long
  k(T_TAKEOFF + 0.14, K0 - 0.3, STAND + 0.25, Y0 - 360, -6, -18, [44, 70, 30], [-6, 14, 40], SET_N, SET_F, null, null),
  k(T_APEX, K0 - 0.55, STAND + 0.52, Y0 - 360, -17, -18, [62, 88, 26], [-10, 16, 38], SET_N, SET_F, null, null),
  k(T_LAND - 0.1, K0 - 0.7, STAND + 0.16, Y0 - 360, -10, -12, [40, 40, 20], [-4, 18, 30], SET_N, SET_F, null, null),
  k(T_LAND, K0 - 0.74, STAND - 0.22, Y0 - 360, 8, -10, L0, L0, SET_N, SET_F, [K0 - 0.5, A, 0], [K0 - 0.95, A, 0.1]),
  k(T_LAND + 0.4, K0 - 0.76, STAND - 0.06, Y0 - 360, 2, -12, L0, L0, SET_N, SET_F, [K0 - 0.5, A, 0], [K0 - 0.95, A, 0]),
  k(T_END, K0 - 0.76, STAND - 0.04, Y0 - 360, 2, -6, L0, L0, [10, 8, 20, 0], [6, 10, 18, 0], [K0 - 0.5, A, 0], [K0 - 0.95, A, 0]),
];

const DY = 180 + 14;
const GUARD_N: [number, number, number, number] = [26, 62, 34, 0];
const GUARD_F: [number, number, number, number] = [128, 18, 30, 0];
const UP_N: [number, number, number, number] = [172, 10, 8, 0];
const UP_F: [number, number, number, number] = [166, 14, 10, 0];
const CONTEST_N: [number, number, number, number] = [158, 4, 6, 0];

/** The defender: bites back on the jab, leaves his feet on the pump fake, recovers late to contest */
const DEF_KEYS: Key[] = [
  k(0, D0, STAND - 0.3, DY, 22, -10, L0, L0, GUARD_N, GUARD_F, [D0 - 0.18, A, 0], [D0 + 0.34, A, 0]),
  k(0.24, D0 + 0.04, STAND - 0.32, DY, 24, -10, L0, L0, GUARD_N, GUARD_F, [D0 - 0.14, A, 0], [D0 + 0.34, A, 0]),
  k(0.4, D0 + 0.14, STAND - 0.3, DY, 22, -10, L0, L0, GUARD_N, GUARD_F, [D0 - 0.02, A, 0], [D0 + 0.42, A, 0]),
  k(0.62, D0 + 0.14, STAND - 0.36, DY, 18, -14, L0, L0, [60, 30, 40, 0], [70, 26, 40, 0], [D0 - 0.02, A, 0], [D0 + 0.42, A, 0.2]),
  // Leaves his feet on the fake
  k(0.76, D0 + 0.12, STAND + 0.22, DY, 2, -18, [8, 14, 40], [2, 10, 40], UP_N, UP_F, null, null),
  k(0.98, D0 + 0.1, STAND + 0.42, DY, -2, -20, [14, 22, 40], [4, 16, 40], UP_N, UP_F, null, null),
  k(1.2, D0 + 0.08, STAND + 0.1, DY, 4, -14, [12, 30, 30], [4, 26, 30], UP_N, UP_F, null, null),
  k(1.34, D0 + 0.06, STAND - 0.34, DY, 26, -6, L0, L0, [40, 40, 50, 0], [50, 30, 50, 0], [D0 - 0.06, A, 0], [D0 + 0.38, A, 0]),
  // Recovers and flies at the shot, just late
  k(1.6, D0 - 0.08, STAND - 0.26, DY, 16, -10, L0, L0, GUARD_N, GUARD_F, [D0 - 0.24, A, 0.2], [D0 + 0.2, A, 0.3]),
  k(1.74, D0 - 0.2, STAND + 0.2, DY, 10, -16, [30, 50, 30], [4, 30, 40], CONTEST_N, [60, 30, 40, 0], null, null),
  k(1.98, D0 - 0.34, STAND + 0.4, DY, 12, -14, [36, 60, 30], [-2, 24, 40], CONTEST_N, [50, 34, 40, 0], null, null),
  k(2.22, D0 - 0.42, STAND + 0.08, DY, 10, -8, [24, 40, 20], [2, 30, 30], [120, 10, 20, 0], [40, 34, 40, 0], null, null),
  k(2.38, D0 - 0.44, STAND - 0.26, DY, 20, -4, L0, L0, [30, 30, 40, 0], [30, 30, 40, 0], [D0 - 0.62, A, 0], [D0 - 0.2, A, 0]),
  k(T_END, D0 - 0.44, STAND - 0.06, DY, 6, -2, L0, L0, [10, 10, 20, 0], [10, 10, 20, 0], [D0 - 0.62, A, 0], [D0 - 0.2, A, 0]),
];

function sampleTrack(out: Pose, keys: Key[], t: number) {
  let i = 1;
  while (i < keys.length - 1 && t > keys[i].t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const u = smooth01((t - a.t) / Math.max(1e-6, b.t - a.t));
  lerpPose(out, a.p, b.p, t <= a.t ? 0 : u);
  for (let f = 0; f < 2; f++) {
    const fa = a.feet[f];
    const fb = b.feet[f];
    const ff = fa && fb ? [lerp(fa[0], fb[0], u), lerp(fa[1], fb[1], u), lerp(fa[2], fb[2], u)] : u < 0.5 ? fa : fb;
    // Mid-step lift between two planted keys that move the foot
    if (ff) {
      const lift = fa && fb ? Math.sin(u * Math.PI) * clamp(Math.abs(fb[0] - fa[0]) * 0.25, 0, 0.08) : 0;
      legIK(RIG, out, f as 0 | 1, ff[0], ff[1] + lift, ff[2]);
    }
  }
  return out;
}

/* ---------- state ---------- */

type Phase = 'idle' | 'move' | 'poster';
type Grade = 'swish' | 'rattle' | 'short' | 'long';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  held: boolean;
  scored: boolean;
  touched: boolean;
  bounced: number;
}

interface State {
  cam: Cam;
  camCx: number;
  hoop: Hoop;
  kobe: Pose;
  def: Pose;
  tmp: Pose;
  ks: Skel;
  ds: Skel;
  phase: Phase;
  pt: number;
  auto: boolean;
  idle: number;
  demo: number;
  released: number;
  grade: Grade | null;
  timing: number;
  ball: Ball;
  grip: { x: number; y: number; d: number };
  grip2: { x: number; y: number; d: number };
  trail: number[];
  streak: number;
  best: number;
  banner: number;
  cheer: number;
  flashes: Flash[];
  fans: Fan[];
  bokeh: { x: number; y: number; r: number; a: number }[];
  bg: HTMLCanvasElement;
  buzzed: boolean;
  lastT: number;
  shake: number;
  fade: number;
}

const sfx = (env: SceneEnv, f: (b: NonNullable<ReturnType<SceneEnv['audio']>>) => void) => {
  const b = env.audio();
  if (b) f(b);
};

function startMove(s: State, env: SceneEnv, auto: boolean) {
  s.phase = 'move';
  s.pt = 0;
  s.auto = auto;
  s.released = -1;
  s.grade = null;
  s.trail.length = 0;
  s.buzzed = false;
  s.lastT = 0;
  s.ball.held = true;
  s.ball.scored = false;
  s.ball.touched = false;
  s.ball.bounced = 0;
  s.idle = 0;
  sfx(env, (b) => sfxSqueak(b));
  env.wake(5000);
}

/** Let it go: grade the timing against the top of the jump */
function shoot(s: State, env: SceneEnv) {
  if (s.released >= 0) return;
  s.released = s.pt;
  const e = s.pt - T_APEX;
  s.timing = e;
  const a = Math.abs(e);
  s.grade = a <= PERFECT ? 'swish' : a <= GOOD ? 'rattle' : e < 0 ? 'short' : 'long';
  env.wake(4000);
}

function press(s: State, env: SceneEnv) {
  s.idle = 0;
  if (s.phase === 'poster') {
    s.phase = 'idle';
    s.pt = 0;
  }
  if (s.phase === 'idle') {
    startMove(s, env, false);
    return;
  }
  if (s.auto) s.auto = false;
  if (s.pt >= T_TAKEOFF - 0.06 && s.pt < T_LAND && s.released < 0) shoot(s, env);
}

/** Launch the ball from the hand toward the rim, aimed by the grade */
function launchBall(s: State, env: SceneEnv) {
  const b = s.ball;
  b.held = false;
  const off = s.grade === 'swish' ? 0 : s.grade === 'rattle' ? (s.timing < 0 ? -0.2 : 0.2) : s.grade === 'short' ? -0.3 : 0.3;
  const tx = s.hoop.x + off;
  const ty = s.hoop.y + 0.04;
  const T = 0.98;
  b.vx = (tx - b.x) / T;
  b.vy = (ty - b.y + 0.5 * 9.8 * T * T) / T;
  b.spin = -14;
  s.trail.length = 0;
  sfx(env, (bus) => tone(bus, 220, { type: 'sine', decay: 0.08, gain: 0.08, glideTo: 160 }));
}

function update(s: State, env: SceneEnv, dt: number, t: number) {
  const rm = env.reducedMotion;
  if (s.phase === 'poster') {
    updateHoop(s.hoop, dt, null);
    return;
  }
  s.pt += dt;
  if (s.phase === 'idle') {
    s.idle += dt;
    const wait = env.interactive ? 8 : 0.6;
    if (s.idle > wait && !(rm && env.interactive)) {
      s.demo++;
      startMove(s, env, true);
    }
  }

  if (s.phase === 'move') {
    if (rm) env.wake(500);
    const tt = s.pt;
    // Demo shooter: mostly on time, now and then a hair off
    if (s.auto && s.released < 0) {
      const off = s.demo % 4 === 3 ? 0.09 : 0.01;
      if (tt >= T_APEX + off) shoot(s, env);
    }
    if (tt >= T_LAND - 0.08 && s.released < 0) shoot(s, env);
    if (!s.buzzed && tt >= 1.9) {
      s.buzzed = true;
      sfx(env, (b) => tone(b, 180, { type: 'square', decay: 0.5, gain: 0.05 }));
    }
    if (tt >= T_END) {
      s.phase = 'idle';
      s.pt = 0;
      s.fade = 1;
      if (rm) setPoster(s);
    }
  }

  // Poses
  const tt = s.phase === 'move' ? s.pt : 0;
  if (s.phase === 'move') {
    sampleTrack(s.kobe, KOBE_KEYS, tt);
    sampleTrack(s.def, DEF_KEYS, tt);
    shootingArm(s, tt);
    // Sneaker squeaks on the footwork beats
    for (const beat of BEATS) if (s.lastT < beat && tt >= beat) sfx(env, (b) => sfxSqueak(b));
    s.lastT = tt;
  } else {
    // Triple threat, rocking the ball hip to hip; the defender bounces on his toes
    sampleTrack(s.kobe, KOBE_KEYS, 0);
    sampleTrack(s.def, DEF_KEYS, 0);
    const r = Math.sin(t * 2.2);
    s.kobe.lean += r * 0.03;
    s.kobe.arms[0].sh += r * 0.12;
    s.kobe.arms[1].sh += r * 0.12;
    s.def.y += Math.abs(Math.sin(t * 4.4)) * 0.025;
    legIK(RIG, s.def, 0, D0 - 0.18, A, 0.15);
    legIK(RIG, s.def, 1, D0 + 0.34, A, 0.15);
  }

  updateBall(s, env, dt);
  updateHoop(s.hoop, dt, s.ball.held ? null : s.ball);

  // Camera: frame the matchup, ride along with the shot
  const fly = !s.ball.held && s.phase === 'move' ? smooth01((s.pt - s.released) / 0.7) : 0;
  const target = lerp(lerp(K0, D0, 0.5) + 0.6, -0.6, fly);
  s.camCx = rm || s.fade >= 1 ? target : damp(s.camCx, target, 3.5, dt);
  s.cheer = Math.max(0, s.cheer - dt * 0.35);
  for (const f of s.flashes) f.life -= dt * 3;
  s.flashes = s.flashes.filter((f) => f.life > 0);
  s.banner += dt;
  s.shake = Math.max(0, s.shake - dt * 3);
  s.fade = Math.max(0, s.fade - dt / 0.45);
  for (const m of s.bokeh) {
    m.x += 0.004 * dt * (m.r - 2);
    if (m.x > 1.05) m.x -= 1.1;
    if (m.x < -0.05) m.x += 1.1;
  }
}

/** The shooting arm: hold the set point until release, then extend and snap the wrist */
function shootingArm(s: State, tt: number) {
  if (tt < T_TAKEOFF || s.released < 0) return;
  const a = s.kobe.arms[0];
  const g = s.kobe.arms[1];
  const k = smooth01((tt - s.released) / 0.12);
  a.sh = lerp(a.sh, (164 * Math.PI) / 180, k);
  a.el = lerp(a.el, (12 * Math.PI) / 180, k);
  a.wr = lerp(a.wr, (62 * Math.PI) / 180, smooth01((tt - s.released - 0.03) / 0.1));
  g.sh = lerp(g.sh, (112 * Math.PI) / 180, k);
  g.abd = lerp(g.abd, (40 * Math.PI) / 180, k);
  g.el = lerp(g.el, (34 * Math.PI) / 180, k);
  // Hold the follow through, then let it fall after landing
  const drop = smooth01((tt - T_LAND - 0.7) / 0.6);
  if (drop > 0) {
    a.sh = lerp(a.sh, (10 * Math.PI) / 180, drop);
    a.el = lerp(a.el, (20 * Math.PI) / 180, drop);
    a.wr = lerp(a.wr, 0, drop);
    g.sh = lerp(g.sh, (6 * Math.PI) / 180, drop);
    g.abd = lerp(g.abd, (10 * Math.PI) / 180, drop);
    g.el = lerp(g.el, (18 * Math.PI) / 180, drop);
  }
}

function updateBall(s: State, env: SceneEnv, dt: number) {
  const b = s.ball;
  const h = s.hoop;
  if (b.held) {
    solve(RIG, s.kobe, s.ks, false);
    const tt = s.phase === 'move' ? s.pt : 0;
    if (tt >= T_TAKEOFF - 0.12) {
      // Shooting pocket: on top of the shooting hand
      gripPoint(s.ks, 0, 'up', s.grip);
      b.x = s.grip.x;
      b.y = s.grip.y;
    } else {
      gripPoint(s.ks, 0, 'palm', s.grip);
      gripPoint(s.ks, 1, 'palm', s.grip2);
      b.x = (s.grip.x + s.grip2.x) / 2;
      b.y = (s.grip.y + s.grip2.y) / 2;
    }
    b.rot += dt * 0.6;
    if (s.released >= 0 && s.pt - s.released >= 0.07) launchBall(s, env);
    return;
  }
  const prevY = b.y;
  b.vy -= 9.8 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += b.spin * dt;
  if (s.trail.length < 240 && !b.scored && b.bounced === 0) s.trail.push(b.x, b.y);
  // Rim: the front and back of the ring as two small posts
  for (const rx of [h.x - h.r, h.x + h.r]) {
    const ry = h.y + h.dy;
    const dx = b.x - rx;
    const dy = b.y - ry;
    const d = Math.hypot(dx, dy);
    const min = BALL_R + 0.012;
    if (d < min && d > 1e-4) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = rx + nx * min;
      b.y = ry + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= 1.55 * vn * nx;
        b.vy -= 1.55 * vn * ny;
        b.vx *= 0.8;
        if (!b.touched) {
          if (s.grade === 'rattle') {
            // Shooter's roll: pops up off the iron and drops through
            b.vx = (h.x - b.x) * 2.2;
            b.vy = 1.6;
          } else {
            // Clanks out back toward the shooter
            b.vx = s.grade === 'short' ? -1.5 : -1.9;
            b.vy = s.grade === 'short' ? 1.4 : 2.6;
          }
        }
        b.touched = true;
        rimHit(h, 0.6 + Math.abs(vn) * 0.4);
        sfx(env, (bus) => sfxRim(bus, clamp(Math.abs(vn) / 5, 0.3, 1)));
      }
    }
  }
  // Backboard
  if (b.x + BALL_R > h.board && b.y > 2.9 && b.y < 3.95 && b.vx > 0) {
    b.x = h.board - BALL_R;
    b.vx = -b.vx * 0.55;
    sfx(env, (bus) => sfxBounce(bus, 0.5));
  }
  // Through the ring
  if (!b.scored && prevY >= h.y && b.y < h.y && Math.abs(b.x - h.x) < h.r - BALL_R * 0.4) {
    b.scored = true;
    const clean = !b.touched;
    netSnap(h, clean ? 3 : 2, b.vx);
    b.vx *= 0.3;
    b.vy *= 0.6;
    s.streak++;
    s.best = Math.max(s.best, s.streak);
    s.banner = 0;
    s.cheer = 1;
    if (!env.reducedMotion) for (let i = 0; i < 10; i++) spawnFlash(s);
    sfx(env, (bus) => {
      sfxSwish(bus, clean ? 0.26 : 0.18);
      crowdRoar(bus, 2, 0.13);
    });
  }
  if (b.y < h.y && b.y > h.y - 0.45 && Math.abs(b.x - h.x) < h.r) b.vy = Math.max(b.vy, -3.6);
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (Math.abs(b.vy) > 0.8) sfx(env, (bus) => sfxBounce(bus, clamp(Math.abs(b.vy) / 6, 0.15, 1)));
    if (b.bounced === 0 && !b.scored) {
      // Missed: the streak ends
      s.streak = 0;
      s.banner = 0;
    }
    b.bounced++;
    b.vy = Math.abs(b.vy) * 0.6;
    if (b.vy < 0.4) b.vy = 0;
    b.vx *= 0.8;
    b.spin = b.vx / BALL_R;
  }
  if (b.x > VIEW_HI + 1) b.vx = -Math.abs(b.vx) * 0.4;
}

function spawnFlash(s: State) {
  const c = s.cam;
  s.flashes.push({ x: rand(0, c.w), y: c.gy - rand(0.05, 1.1) * c.ppm * 0.45, life: rand(0.6, 1), size: Math.max(1.2, c.ppm * rand(0.015, 0.03)) });
}

/** The iconic frame for posters and reduced motion: the top of the fadeaway, ball just away */
function setPoster(s: State) {
  s.phase = 'poster';
  sampleTrack(s.kobe, KOBE_KEYS, T_APEX + 0.08);
  sampleTrack(s.def, DEF_KEYS, T_APEX + 0.08);
  s.released = T_APEX;
  shootingArm(s, T_APEX + 0.08);
  solve(RIG, s.kobe, s.ks, false);
  gripPoint(s.ks, 0, 'up', s.grip);
  const b = s.ball;
  b.held = false;
  b.x = s.grip.x + 0.25;
  b.y = s.grip.y + 0.22;
  // Predicted arc to the rim for the dotted trail
  s.trail.length = 0;
  const T = 0.9;
  const vx = (s.hoop.x - b.x) / T;
  const vy = (s.hoop.y + 0.04 - b.y + 0.5 * 9.8 * T * T) / T;
  for (let i = 0; i <= 40; i++) {
    const tt = (i / 40) * T;
    s.trail.push(b.x + vx * tt, b.y + vy * tt - 4.9 * tt * tt);
  }
  s.cheer = 0.6;
}

/* ---------- layout and draw ---------- */

function fit(s: State, env: SceneEnv) {
  const portrait = env.h > env.w * 1.05;
  fitCam(s.cam, env.w, env.h, portrait ? 3.8 : 6.4, 5.0, 2.1, 0.55);
}

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  fit(s, env);
  const portrait = h > w * 1.05;
  const base = document.createElement('canvas');
  base.width = Math.max(1, Math.round(w * env.dpr));
  base.height = Math.max(1, Math.round(h * env.dpr));
  const bc = base.getContext('2d');
  if (!bc) return;
  bc.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const g = bc.createRadialGradient(w * 0.42, h * 0.4, 0, w * 0.42, h * 0.4, Math.hypot(w, h) * 0.66);
  g.addColorStop(0, '#6a35a8');
  g.addColorStop(0.35, '#36175f');
  g.addColorStop(0.7, '#140726');
  g.addColorStop(1, '#06020c');
  bc.fillStyle = g;
  bc.fillRect(0, 0, w, h);
  const cell = clamp(Math.min(w, h) / 60, 4, 9);
  const glow = halftoneLayer(w, h, env.dpr, cell, 45, '#fdb927', (c) => {
    const t = c.createRadialGradient(w * 0.38, h * 0.42, 0, w * 0.38, h * 0.42, Math.max(w, h) * 0.6);
    t.addColorStop(0, 'rgba(255,255,255,0.6)');
    t.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = t;
    c.fillRect(0, 0, w, h);
  });
  const size = Math.min(h * 0.82, w * (portrait ? 0.8 : 0.5));
  const nx = portrait ? w * 0.5 : w * 0.3;
  const ny = portrait ? s.cam.gy - s.cam.ppm * 1.3 : s.cam.gy - size * 0.06;
  const num = halftoneLayer(w, h, env.dpr, cell * 0.8, 30, '#fdb927', (c) => numeralTone(c, '24', nx, ny, size, -4));
  bc.save();
  bc.setTransform(1, 0, 0, 1, 0, 0);
  bc.globalAlpha = 0.18;
  bc.drawImage(glow, 0, 0);
  bc.globalAlpha = 0.34;
  bc.drawImage(num, 0, 0);
  bc.restore();
  numeralLine(bc, '24', nx, ny, size, -4, '#ffe08a', 0.3);
  const gold = bc.createRadialGradient(w * 0.34, h * 0.42, 0, w * 0.34, h * 0.42, Math.max(w, h) * 0.4);
  gold.addColorStop(0, 'rgba(253,185,39,0.3)');
  gold.addColorStop(1, 'rgba(253,185,39,0)');
  bc.fillStyle = gold;
  bc.fillRect(0, 0, w, h);
  bc.save();
  bc.globalCompositeOperation = 'lighter';
  const ox = w * 0.97;
  const oy = -h * 0.08;
  for (const [a, wd] of [
    [110, 3.5],
    [118, 2.4],
    [126, 4],
    [134, 2.6],
    [142, 3.2],
  ]) {
    const len = Math.hypot(w, h) * 1.1;
    const a0 = ((a - wd / 2) * Math.PI) / 180;
    const a1 = ((a + wd / 2) * Math.PI) / 180;
    const rg = bc.createRadialGradient(ox, oy, 0, ox, oy, len);
    rg.addColorStop(0, 'rgba(255,233,176,0.15)');
    rg.addColorStop(1, 'rgba(255,233,176,0)');
    bc.fillStyle = rg;
    bc.beginPath();
    bc.moveTo(ox, oy);
    bc.lineTo(ox + Math.cos(a0) * len, oy + Math.sin(a0) * len);
    bc.lineTo(ox + Math.cos(a1) * len, oy + Math.sin(a1) * len);
    bc.closePath();
    bc.fill();
  }
  bc.restore();
  s.bg = base;
}

function draw(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const cam = s.cam;
  fit(s, env);
  aimCam(cam, s.camCx, VIEW_LO, VIEW_HI);
  cam.sx = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.05 * cam.ppm : 0;
  cam.sy = 0;
  ctx.drawImage(s.bg, 0, 0, w, h);

  drawCrowd(ctx, cam, s.fans, 0.42, cam.gy - 0.2 * cam.ppm, 0.3, 'rgba(18,6,31,0.9)', s.cheer, t);
  drawFlashes(ctx, s.flashes, 'rgba(255,224,150,0.55)');
  drawFloor(s, env);

  // Bokeh along the baseline seats
  ctx.save();
  ctx.fillStyle = '#ffd36b';
  for (const m of s.bokeh) {
    ctx.globalAlpha = m.a * 0.2;
    ctx.beginPath();
    ctx.arc(m.x * w, cam.gy - m.y * cam.ppm * 0.5, m.r * Math.max(1, cam.ppm / 90), 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  drawHoopBack(ctx, cam, s.hoop, HOOP_STYLE);
  drawTrail(s, env);

  const b = s.ball;
  solve(RIG, s.def, s.ds, false);
  solve(RIG, s.kobe, s.ks, false);
  shadow(ctx, cam, s.def.x, s.def.y);
  shadow(ctx, cam, s.kobe.x, s.kobe.y);
  if (!b.held) drawBall(ctx, cam, b.x, b.y, b.rot, KOBE_LIGHT);
  drawAthlete(ctx, cam, RIG, s.ds, DEF_KIT, DEF_LIGHT);
  const layers = b.held ? [{ d: s.grip.d + 0.05, draw: (c: CanvasRenderingContext2D) => drawBall(c, cam, b.x, b.y, b.rot, KOBE_LIGHT) }] : [];
  drawAthlete(ctx, cam, RIG, s.ks, KOBE_KIT, KOBE_LIGHT, layers);
  drawHoopFront(ctx, cam, s.hoop, HOOP_STYLE);

  drawVignette(ctx, w, h, 0.55);
  drawHud(s, env, t);
  if (s.fade > 0) {
    ctx.fillStyle = `rgba(6,2,12,${s.fade})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function shadow(ctx: CanvasRenderingContext2D, cam: Cam, x: number, y: number) {
  const air = clamp(y - STAND, 0, 1.5);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(camX(cam, x), cam.gy + 0.05 * cam.ppm, (0.4 - air * 0.12) * cam.ppm, 0.055 * cam.ppm, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFloor(s: State, env: SceneEnv) {
  const { ctx, w, h } = env;
  const cam = s.cam;
  const gy = cam.gy;
  const g = ctx.createLinearGradient(0, gy, 0, h);
  g.addColorStop(0, '#2b1647');
  g.addColorStop(1, '#07030d');
  ctx.fillStyle = g;
  ctx.fillRect(0, gy, w, h - gy);
  const depth = h - gy;
  const skew = 0.45;
  const ex = camX(cam, -4.6);
  const bx = camX(cam, 1.575);
  ctx.save();
  ctx.fillStyle = 'rgba(253,185,39,0.07)';
  ctx.beginPath();
  ctx.moveTo(ex, gy);
  ctx.lineTo(bx, gy);
  ctx.lineTo(bx - depth * skew, h);
  ctx.lineTo(ex - depth * skew, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,224,150,0.45)';
  ctx.lineWidth = Math.max(1, 0.025 * cam.ppm);
  ctx.beginPath();
  ctx.moveTo(ex, gy);
  ctx.lineTo(ex - depth * skew, h);
  ctx.moveTo(bx, gy);
  ctx.lineTo(bx - depth * skew, h);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(253,185,39,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, gy + 0.5);
  ctx.lineTo(w, gy + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** The gold arc the shot leaves behind */
function drawTrail(s: State, env: SceneEnv) {
  const tr = s.trail;
  if (tr.length < 4) return;
  const { ctx } = env;
  const cam = s.cam;
  const n = tr.length / 2;
  const age = s.phase === 'move' && s.released >= 0 ? clamp((s.pt - s.released - 1.6) / 0.8, 0, 1) : 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffd36b';
  ctx.shadowColor = '#fdb927';
  ctx.shadowBlur = 8;
  const r = Math.max(1, cam.ppm * 0.012);
  ctx.fillStyle = '#ffd36b';
  const step = Math.max(1, Math.round(n / 40));
  for (let i = 0; i < n; i += step) {
    ctx.globalAlpha = (0.25 + 0.6 * (i / n)) * (1 - age);
    ctx.beginPath();
    ctx.arc(camX(cam, tr[i * 2]), camY(cam, tr[i * 2 + 1]), r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawHud(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  if (!env.interactive || w < 260) return;
  const cam = s.cam;
  const fs = clamp(Math.min(w, h) / 34, 9, 13);
  const pad = Math.max(12, fs * 1.3);
  label(ctx, 'STREAK', pad, pad + fs, fs, '#ffd36b', 'left', 0.8);
  label(ctx, String(s.streak).padStart(2, '0'), pad, pad + fs * 2.6, fs * 1.6, '#fff3d0', 'left', 0.95);
  if (s.best > 0) label(ctx, `BEST ${String(s.best).padStart(2, '0')}`, pad, pad + fs * 3.9, fs * 0.85, '#ffd36b', 'left', 0.55);
  // Game clock runs out at the top of the jump
  const clock = s.phase === 'move' ? Math.max(0, 1.9 - s.pt) : 1.9;
  label(ctx, clock.toFixed(1), w - pad, pad + fs * 1.9, fs * 1.9, '#ffcf5a', 'right', 0.9);
  label(ctx, '4TH QTR', w - pad, pad + fs * 3.1, fs * 0.8, '#ffcf5a', 'right', 0.55);

  // Release meter over the jump, window at the top
  if (s.phase === 'move' && s.pt > T_TAKEOFF - 0.4 && s.pt < T_LAND + 1.2) {
    const a = smooth01((s.pt - (T_TAKEOFF - 0.4)) / 0.25) * (1 - smooth01((s.pt - T_LAND - 0.7) / 0.4));
    const span = T_LAND - 0.08 - T_TAKEOFF;
    const bw = clamp(cam.ppm * 1.3, 90, 220);
    const bh = Math.max(6, cam.ppm * 0.07);
    const cx = clamp(camX(cam, s.kobe.x), bw / 2 + pad, w - bw / 2 - pad);
    const cy = Math.max(pad + fs * 5, camY(cam, 3.75));
    const x0 = cx - bw / 2;
    const at = (tt: number) => x0 + clamp((tt - T_TAKEOFF) / span, 0, 1) * bw;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,4,20,0.7)';
    ctx.strokeStyle = 'rgba(255,211,107,0.6)';
    ctx.lineWidth = 1;
    ctx.fillRect(x0, cy - bh / 2, bw, bh);
    ctx.strokeRect(x0 + 0.5, cy - bh / 2 + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = 'rgba(253,185,39,0.35)';
    ctx.fillRect(at(T_APEX - GOOD), cy - bh / 2, at(T_APEX + GOOD) - at(T_APEX - GOOD), bh);
    ctx.fillStyle = '#fdb927';
    ctx.fillRect(at(T_APEX - PERFECT), cy - bh / 2, at(T_APEX + PERFECT) - at(T_APEX - PERFECT), bh);
    const mt = s.released >= 0 ? s.released : s.pt;
    const mx = at(mt);
    ctx.fillStyle = '#fff6dc';
    ctx.shadowColor = '#fdb927';
    ctx.shadowBlur = 8;
    ctx.fillRect(mx - 1.5, cy - bh * 1.1, 3, bh * 2.2);
    ctx.restore();
    if (s.released < 0 && s.pt >= T_TAKEOFF - 0.1) label(ctx, 'RELEASE', cx, cy - bh * 1.4, fs * 0.8, '#ffe7a8', 'center', a * (0.6 + 0.4 * Math.sin(t * 12)));
  }

  // Verdict
  if (s.grade && s.phase === 'move' && !s.ball.held) {
    const done = s.ball.scored || s.ball.bounced > 0;
    if (done) {
      const al = smooth01(s.banner / 0.15) * (1 - smooth01((s.banner - 1.6) / 0.4));
      const made = s.ball.scored;
      const word = made ? (s.grade === 'swish' ? 'SWISH' : 'BUCKET') : s.grade === 'short' || s.timing < 0 ? 'SHORT' : 'LONG';
      const size = clamp(Math.min(w * (made ? 0.09 : 0.06), h * 0.11), 16, 64);
      const band = h - cam.gy;
      const y = band > size * 1.25 ? cam.gy + band * 0.52 : h * 0.13;
      headline(ctx, word, w / 2, y, size, made ? '#fff3d0' : '#d8c6f5', made ? 'rgba(253,185,39,0.9)' : 'rgba(120,70,200,0.7)', al);
    }
  }
  if (s.phase === 'idle' && !s.auto) {
    const a = 0.55 + 0.25 * Math.sin(t * 2.4);
    label(ctx, 'CLICK TO GO  ·  CLICK AT THE TOP TO SHOOT', w / 2, h - pad * 0.9, fs, '#ffe7a8', 'center', a);
  }
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2.62,
    cursor: 'pointer',
    init(env) {
      const s: State = {
        cam: makeCam(),
        camCx: -3,
        hoop: makeHoop(0, 3.05),
        kobe: clonePose(KOBE_KEYS[0].p),
        def: clonePose(DEF_KEYS[0].p),
        tmp: clonePose(KOBE_KEYS[0].p),
        ks: makeSkel(),
        ds: makeSkel(),
        phase: 'idle',
        pt: 0,
        auto: false,
        idle: 0,
        demo: 0,
        released: -1,
        grade: null,
        timing: 0,
        ball: { x: K0, y: 1, vx: 0, vy: 0, rot: 0, spin: 0, held: true, scored: false, touched: false, bounced: 0 },
        grip: { x: 0, y: 0, d: 0 },
        grip2: { x: 0, y: 0, d: 0 },
        trail: [],
        streak: 0,
        best: 0,
        banner: 0,
        cheer: 0,
        flashes: [],
        fans: makeCrowd(24, -14, 8, 3, 3.2),
        bokeh: Array.from({ length: 40 }, () => ({ x: Math.random(), y: rand(0.1, 1.4), r: rand(1.5, 4.5), a: rand(0.3, 1) })),
        bg: document.createElement('canvas'),
        buzzed: false,
        lastT: 0,
        shake: 0,
        fade: 0,
      };
      copyPose(s.tmp, s.kobe);
      if (env.reducedMotion) setPoster(s);
      return s;
    },
    resize(s, env) {
      layout(s, env);
      s.camCx = lerp(K0, D0, 0.5) + 0.6;
    },
    update,
    draw,
    onPointerDown(s, env) {
      press(s, env);
    },
    onKey(s, env, e, down) {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) press(s, env);
      return true;
    },
  });
