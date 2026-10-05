import { clamp, createCanvasScene, damp, lerp, rand, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  aimCam,
  BALL_R,
  camX,
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
  groundOffset,
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
  samplePoses,
  sfxBounce,
  sfxShutter,
  sfxSlam,
  sfxSqueak,
  sfxSwish,
  sfxWhoosh,
  smooth01,
  solve,
  standH,
  updateHoop,
} from './legends-hoops-kit';
import type { AthleteKit, Cam, Fan, Flash, Hoop, HoopStyle, Pose, RimLight, Skel } from './legends-hoops-kit';

/**
 * Jordan: Free Throw Line. A tribute to the 1988 takeoff from the free-throw line:
 * hold to gather and sprint, let go to plant and fly. Leave on the line and he glides the
 * whole way in slow motion, legs split and the ball cocked high, under a storm of camera
 * flashes; leave early or late and it is a regular one-hand dunk. The rim shakes, the net
 * whips and a giant halftone 23 hangs behind it all.
 */

const LINE = -4.19;
const START_X = -10;
const BASELINE = 1.575;
const VIEW_LO = -12.5;
const VIEW_HI = 2.2;

const RIG = makeRig(1.98, 0.98);
const STAND = standH(RIG);

const KIT: AthleteKit = {
  skin: ['#1d060a', '#050102'],
  jersey: ['#5e0716', '#1c0205'],
  shorts: ['#520614', '#160104'],
  trim: 'rgba(255,236,230,0.55)',
  shoe: '#0b0a0c',
  sole: 'rgba(214,32,58,0.9)',
  number: '23',
  numberInk: '#f7ece6',
  numberLine: 'rgba(10,2,3,0.9)',
  highTops: true,
  band: { arm: 0, color: '#b9a9a4' },
  sock: '#3a2f2e',
};

const LIGHT: RimLight = {
  key: '#fff0e4',
  back: '#ff2f48',
  halo: '#ff1d3a',
  kx: 0.72,
  ky: -0.69,
  sep: 'rgba(255,90,110,0.32)',
  haloAlpha: 0.45,
};

const HOOP_STYLE: HoopStyle = {
  rim: '#ff8a3d',
  rimGlow: '#ff6a2a',
  net: 'rgba(255,222,214,0.85)',
  board: '#0a0203',
  boardEdge: 'rgba(255,154,166,0.7)',
  pole: '#070203',
};

/* ---------- poses (degrees; index 0 is the near side, the ball hand) ---------- */

const YAW = -16;

const READY = pose(0, 0, YAW, 8, -4, [10, 20, 0], [-6, 18, 0], [26, 4, 64, 6], [8, 10, 22, 0]);
const TAKEOFF = pose(0, 0, YAW, 6, -10, [72, 96, 22], [-18, 8, 42], [150, 6, 48, -8], [82, 16, 28, 0]);

/** Flight from the line: split legs, ball cocked high, then the reach and the slam */
const GLIDE_KEYS: [number, Pose][] = [
  [0, TAKEOFF],
  [0.22, pose(0, 0, YAW, 14, -12, [78, 22, 36], [-30, 100, 40], [166, 8, 34, -18], [94, 24, 14, 0])],
  [0.6, pose(0, 0, YAW, 16, -10, [72, 18, 38], [-28, 106, 38], [174, 6, 44, -20], [88, 30, 10, 0])],
  [0.82, pose(0, 0, YAW, 20, -6, [58, 36, 30], [-8, 86, 30], [150, 5, 6, -6], [70, 34, 18, 0])],
  [1, pose(0, 0, YAW, 18, 6, [40, 52, 24], [6, 70, 30], [118, 5, 18, 28], [52, 40, 28, 0])],
];

/** Regular dunk: knees tucked, a one hand tomahawk */
const DUNK_KEYS: [number, Pose][] = [
  [0, TAKEOFF],
  [0.35, pose(0, 0, YAW, 6, -8, [86, 108, 30], [22, 98, 34], [172, 6, 76, 10], [100, 28, 28, 0])],
  [0.72, pose(0, 0, YAW, -2, -12, [72, 100, 30], [10, 108, 34], [188, 6, 84, 10], [96, 34, 22, 0])],
  [1, pose(0, 0, YAW, 22, 6, [46, 70, 24], [16, 80, 30], [122, 5, 22, 30], [52, 40, 28, 0])],
];

const HANG = pose(0, 0, YAW, -4, 0, [16, 32, 22], [4, 26, 20], [172, 4, 4, 0], [32, 34, 30, 0]);
const DROP = pose(0, 0, YAW, 8, 4, [24, 28, 10], [10, 24, 10], [60, 30, 30, 0], [40, 36, 30, 0]);
const LAND_ARMS = pose(0, 0, YAW, 22, -6, [0, 0, 0], [0, 0, 0], [2, 42, 30, 0], [8, 38, 28, 0]);
const STAND_ARMS = pose(0, 0, YAW, 3, -2, [0, 0, 0], [0, 0, 0], [10, 8, 18, 0], [6, 10, 16, 0]);

/* ---------- run cycle (per leg, phase 0 = touchdown, stance until 0.25) ---------- */

const C_HIP = [28, 6, -22, -14, 18, 52, 48, 38];
const C_KNEE = [14, 40, 20, 88, 118, 90, 42, 16];
const C_ANK = [10, -30, -12, 18, 12, 6, 2, 14];
const DEG = Math.PI / 180;

/** Periodic Catmull-Rom through eight evenly spaced keys */
function cyc(k: readonly number[], ph: number) {
  const n = k.length;
  const f = (((ph % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const t = f - i;
  const p0 = k[(i - 1 + n) % n];
  const p1 = k[i % n];
  const p2 = k[(i + 1) % n];
  const p3 = k[(i + 2) % n];
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t) * DEG
  );
}

function runPose(out: Pose, ph: number, amp: number, tmp: Pose) {
  for (let i = 0; i < 2; i++) {
    const p = ph + (i === 0 ? 0 : 0.5);
    const L = tmp.legs[i];
    L.hip = cyc(C_HIP, p);
    L.knee = cyc(C_KNEE, p);
    L.ankle = cyc(C_ANK, p);
  }
  const farHip = tmp.legs[1].hip;
  const nearHip = tmp.legs[0].hip;
  // Free arm pumps against its own leg; the ball arm carries the ball at the hip
  const fs = -1.15 * (farHip - 15 * DEG);
  tmp.arms[1].sh = fs;
  tmp.arms[1].abd = 8 * DEG;
  tmp.arms[1].el = 78 * DEG + Math.max(0, fs) * 0.45;
  tmp.arms[1].wr = 0;
  tmp.arms[0].sh = 24 * DEG - 0.3 * (nearHip - 15 * DEG);
  tmp.arms[0].abd = 6 * DEG;
  tmp.arms[0].el = 72 * DEG;
  tmp.arms[0].wr = 8 * DEG;
  tmp.lean = 14 * DEG;
  tmp.head = -10 * DEG;
  tmp.yaw = YAW * DEG;
  const x = out.x;
  lerpPose(out, READY, tmp, amp);
  out.x = x;
}

/** Forward reach of an ankle from the pelvis, for foot locking */
const ankleF = (p: Pose, i: number) => Math.sin(p.legs[i].hip) * RIG.thigh + Math.sin(p.legs[i].hip - p.legs[i].knee) * RIG.shin;

/* ---------- state ---------- */

type Phase = 'idle' | 'run' | 'plant' | 'fly' | 'hang' | 'drop' | 'land' | 'reset' | 'poster';
type Kind = 'line' | 'early' | 'late';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  held: boolean;
  bounces: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
}

interface State {
  cam: Cam;
  hoop: Hoop;
  pose: Pose;
  start: Pose;
  tmp: Pose;
  sk: Skel;
  phase: Phase;
  pt: number;
  holding: boolean;
  auto: boolean;
  idle: number;
  demoCount: number;
  // run
  ph: number;
  amp: number;
  cad: number;
  v: number;
  lockLeg: number;
  lockX: number;
  // takeoff and flight
  kind: Kind | null;
  plantX: number;
  ank0x: number;
  ank0y: number;
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  apex: number;
  dur: number;
  u: number;
  slammed: boolean;
  feet: [number, number];
  landY: number;
  vyFall: number;
  timeScale: number;
  zoom: number;
  camCx: number;
  ball: Ball;
  grip: { x: number; y: number; d: number };
  shake: number;
  cheer: number;
  flashes: Flash[];
  flashClock: number;
  fans: Fan[];
  motes: Mote[];
  bg: HTMLCanvasElement;
  numeral: { x: number; y: number; size: number; rot: number };
  fade: number;
  lineDunks: number;
  banner: number;
  bannerKind: Kind | null;
}

const sfx = (env: SceneEnv, f: (b: NonNullable<ReturnType<SceneEnv['audio']>>) => void) => {
  const b = env.audio();
  if (b) f(b);
};

function resetRun(s: State) {
  s.phase = 'idle';
  s.pt = 0;
  s.ph = 0.62;
  s.amp = 0;
  s.cad = 1.4;
  s.v = 0;
  s.lockLeg = -1;
  s.kind = null;
  s.slammed = false;
  s.timeScale = 1;
  copyPose(s.pose, READY);
  s.pose.x = START_X;
  s.pose.y = groundOffset(RIG, s.pose);
  s.ball.held = true;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.bounces = 0;
  s.hoop.pull = 0;
}

/** The iconic frame: mid glide from the line, for posters and reduced motion */
function setPoster(s: State) {
  s.phase = 'poster';
  s.kind = 'line';
  samplePoses(s.pose, GLIDE_KEYS, 0.5);
  const p = flightPos(LINE + 0.12, 1.18, -0.62, 2.06, 2.32, 0.5);
  s.pose.x = p[0];
  s.pose.y = p[1];
  s.ball.held = true;
  s.cheer = 0.8;
}

/** Pelvis along the flight: a quadratic arc through an apex height */
function flightPos(x0: number, y0: number, x1: number, y1: number, apex: number, u: number): [number, number] {
  const cy = 2 * apex - (y0 + y1) / 2;
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [lerp(x0, x1, u), a * y0 + b * cy + c * y1];
}

function press(s: State, env: SceneEnv) {
  s.idle = 0;
  if (s.phase === 'poster') {
    resetRun(s);
    s.fade = 0;
  }
  if (s.auto && (s.phase === 'idle' || s.phase === 'run')) s.auto = false;
  if (s.phase === 'idle') {
    s.phase = 'run';
    s.pt = 0;
    s.holding = true;
    sfx(env, (b) => sfxSqueak(b));
  } else if (s.phase === 'run') {
    s.holding = true;
  }
  env.wake(6000);
}

function release(s: State, env: SceneEnv) {
  if (!s.holding) return;
  s.holding = false;
  if (s.phase === 'run') takeoff(s, env, false);
}

/** Decide the jump at the moment of release (or when forced close to the rim) */
function takeoff(s: State, env: SceneEnv, forced: boolean) {
  const plant = s.pose.x + 0.55;
  const d = plant - LINE;
  let kind: Kind;
  if (forced) kind = s.kind === 'early' ? 'early' : 'late';
  else if (d < -0.55) kind = 'early';
  else if (d <= 0.32) kind = 'line';
  else kind = 'late';
  if (kind === 'early' && !forced) {
    // Too soon: he keeps driving and goes up from close range
    s.kind = 'early';
    return;
  }
  s.kind = kind;
  s.phase = 'plant';
  s.pt = 0;
  s.plantX = kind === 'line' ? LINE - 0.03 : plant;
  solve(RIG, s.pose, s.sk, true);
  s.ank0x = s.sk.ankle[1].x;
  s.ank0y = s.sk.ankle[1].y;
  copyPose(s.start, s.pose);
  s.bannerKind = kind;
  s.banner = 0;
  sfx(env, (b) => sfxSqueak(b));
  env.wake(8000);
}

function launch(s: State, env: SceneEnv) {
  s.phase = 'fly';
  s.pt = 0;
  s.u = 0;
  s.fx0 = s.pose.x;
  s.fy0 = s.pose.y;
  const line = s.kind === 'line';
  s.fx1 = -0.62;
  s.fy1 = 2.06;
  const dist = s.fx1 - s.fx0;
  s.apex = line ? 2.32 : 2.1 + clamp(dist / 4, 0, 0.25);
  s.dur = line ? 0.98 : clamp(0.36 + dist * 0.09, 0.42, 0.68);
  sfx(env, (b) => {
    sfxWhoosh(b, line ? 0.18 : 0.1);
    if (line) crowdRoar(b, 2.6, 0.14);
  });
}

function finishRun(s: State) {
  s.phase = 'reset';
  s.pt = 0;
}

/* ---------- update ---------- */

function update(s: State, env: SceneEnv, dtReal: number, t: number) {
  const rm = env.reducedMotion;
  if (s.phase === 'poster') {
    updateBall(s, env, 0, t);
    updateHoop(s.hoop, dtReal, null);
    return;
  }

  // Demo when no one is playing (tiles always, the player after a quiet spell)
  if (!env.interactive || s.auto || s.phase === 'idle') {
    if (s.phase === 'idle') s.idle += dtReal;
    const wait = env.interactive ? 7 : 0.35;
    if (s.phase === 'idle' && s.idle > wait && !(rm && env.interactive)) {
      s.auto = true;
      s.idle = 0;
      s.phase = 'run';
      s.pt = 0;
      s.holding = true;
    }
    if (s.auto && s.phase === 'run' && s.holding) {
      // Release on the line; every third demo leaves a little late
      const late = s.demoCount % 3 === 2;
      const target = late ? LINE + 0.25 : LINE - 0.1;
      if (s.pose.x + 0.55 >= target) {
        s.holding = false;
        s.demoCount++;
        takeoff(s, env, false);
      }
    }
  }

  // Slow motion through the heart of the glide
  let ts = 1;
  if (s.phase === 'fly' && s.kind === 'line' && !rm) {
    const k = smooth01((s.u - 0.1) / 0.14) * (1 - smooth01((s.u - 0.7) / 0.14));
    ts = lerp(1, 0.3, k);
  }
  s.timeScale = damp(s.timeScale, ts, 12, dtReal);
  const dt = dtReal * s.timeScale;
  s.pt += dt;

  const P = s.pose;
  const tmp = s.tmp;

  switch (s.phase) {
    case 'idle': {
      // Ready stance, ball on the hip, a slow breath
      copyPose(P, READY);
      P.x = START_X;
      P.lean += Math.sin(t * 1.8) * 0.02;
      P.y = groundOffset(RIG, P) - Math.abs(Math.sin(t * 1.8)) * 0.012;
      break;
    }
    case 'run': {
      if (rm) env.wake(500);
      s.amp = Math.min(1, s.amp + dt / 0.55);
      s.cad = lerp(1.25, 2.25, smooth01(s.pt / 1.1));
      s.ph += s.cad * dt;
      const prevX = P.x;
      runPose(P, s.ph, smooth01(s.amp), tmp);
      // Foot lock: the stance foot stays put, the pelvis travels over it
      let stance = -1;
      for (let i = 0; i < 2; i++) {
        const ph = (((s.ph + (i === 0 ? 0 : 0.5)) % 1) + 1) % 1;
        if (ph < 0.25) stance = i;
      }
      const c = Math.cos(P.yaw);
      const sn = Math.sin(P.yaw);
      if (stance >= 0) {
        const l = (stance === 0 ? 1 : -1) * RIG.hipHalf;
        const off = ankleF(P, stance) * c + l * sn;
        if (stance !== s.lockLeg) {
          s.lockLeg = stance;
          s.lockX = P.x + off;
          if (s.amp > 0.3) sfx(env, (b) => sfxSqueak(b));
        }
        P.x = Math.max(prevX, s.lockX - off);
        if (dt > 0) s.v = damp(s.v, (P.x - prevX) / dt, 10, dt);
      } else {
        s.lockLeg = -1;
        P.x += s.v * dt;
      }
      const q = ((s.ph % 0.5) + 0.5) % 0.5;
      const bump = q > 0.25 ? Math.sin(((q - 0.25) / 0.25) * Math.PI) * 0.07 * s.amp : 0;
      P.y = groundOffset(RIG, P) + bump;
      // An early release keeps driving: he goes up from close range
      if (s.kind === 'early' && P.x + 0.55 >= -2.35) takeoff(s, env, true);
      else if (s.holding && P.x + 0.55 >= -1.9) {
        s.holding = false;
        takeoff(s, env, true);
      }
      break;
    }
    case 'plant': {
      if (rm) env.wake(500);
      const D = 0.16;
      const k = clamp(s.pt / D, 0, 1);
      lerpPose(P, s.start, TAKEOFF, smooth01(k));
      P.x = lerp(s.start.x, s.plantX + 0.16, smooth01(k));
      P.y = lerp(s.start.y, 1.18, smooth01(k)) - Math.sin(k * Math.PI) * 0.08;
      const fk = smooth01(k / 0.45);
      legIK(RIG, P, 1, lerp(s.ank0x, s.plantX, fk), lerp(s.ank0y, RIG.ankleH, fk), k * 0.9);
      if (k >= 1) launch(s, env);
      break;
    }
    case 'fly': {
      if (rm) env.wake(500);
      s.u = Math.min(1, s.pt / s.dur);
      const keys = s.kind === 'line' ? GLIDE_KEYS : DUNK_KEYS;
      samplePoses(P, keys, s.u);
      const [x, y] = flightPos(s.fx0, s.fy0, s.fx1, s.fy1, s.apex, s.u);
      P.x = x;
      P.y = y;
      if (s.kind === 'line' && !rm) {
        s.cheer = Math.max(s.cheer, smooth01(s.u * 3));
        s.flashClock += dtReal;
        while (s.flashClock > 0.035) {
          s.flashClock -= 0.035;
          if (Math.random() < 0.65) spawnFlash(s, env);
        }
      }
      if (s.u >= 1) {
        // Slam: ball through, rim and backboard take the hit
        s.phase = 'hang';
        s.pt = 0;
        copyPose(s.start, P);
        slam(s, env);
      }
      break;
    }
    case 'hang': {
      if (rm) env.wake(500);
      const k = smooth01(s.pt / 0.22);
      lerpPose(P, s.start, HANG, k);
      P.x = s.start.x;
      P.y = s.start.y;
      s.hoop.pull = 0.07 * (1 - smooth01((s.pt - 0.3) / 0.08));
      anchorToRim(s, k);
      if (s.pt > 0.38) {
        s.phase = 'drop';
        s.pt = 0;
        s.vyFall = 0;
        copyPose(s.start, P);
        s.hoop.pull = 0;
      }
      break;
    }
    case 'drop': {
      if (rm) env.wake(500);
      const k = smooth01(s.pt / 0.3);
      lerpPose(P, s.start, DROP, k);
      s.vyFall -= 9.8 * dt;
      P.x = s.start.x + s.pt * 0.35;
      P.y = s.start.y + s.vyFall * s.pt * 0.5;
      const floor = groundOffset(RIG, P);
      if (P.y <= floor) {
        P.y = floor;
        solve(RIG, P, s.sk, true);
        s.feet = [s.sk.ankle[0].x, s.sk.ankle[1].x];
        s.landY = P.y;
        copyPose(s.start, P);
        s.phase = 'land';
        s.pt = 0;
        if (!rm) s.shake = Math.max(s.shake, 0.25);
        sfx(env, (b) => sfxBounce(b, 0.6));
      }
      break;
    }
    case 'land': {
      if (rm) env.wake(500);
      const absorb = Math.sin(clamp(s.pt / 0.5, 0, 1) * Math.PI * 0.5);
      const rise = smooth01((s.pt - 0.35) / 0.6);
      const low = STAND - 0.32;
      lerpPose(P, s.start, LAND_ARMS, smooth01(s.pt / 0.2));
      if (rise > 0) lerpPose(P, P, STAND_ARMS, rise);
      P.x = s.start.x + Math.min(s.pt, 0.3) * 0.25;
      P.y = lerp(lerp(s.landY, low, absorb), STAND - 0.03, rise);
      legIK(RIG, P, 0, s.feet[0], RIG.ankleH, 0);
      legIK(RIG, P, 1, s.feet[1], RIG.ankleH, 0);
      if (s.pt > 2.1) finishRun(s);
      break;
    }
    case 'reset': {
      if (rm) env.wake(500);
      s.fade = Math.min(1, s.pt / 0.35);
      if (s.pt >= 0.35) {
        resetRun(s);
        s.pt = 0;
        s.fade = 1;
        s.cheer = 0;
        if (rm) setPoster(s);
      }
      break;
    }
  }
  if (s.phase !== 'reset') s.fade = Math.max(0, s.fade - dtReal / 0.4);

  // Camera: track ahead of him on the run, frame him and the rim in the air; zoom into the glide
  const glide = s.kind === 'line' && (s.phase === 'fly' || (s.phase as Phase) === 'poster') ? 1 : 0;
  s.zoom = rm ? glide : damp(s.zoom, glide, 3, dtReal);
  const target = clamp(aim(s, env), VIEW_LO, VIEW_HI);
  if (rm || s.phase === 'idle' || s.fade >= 1) s.camCx = target;
  else s.camCx = damp(s.camCx, target, 5, dtReal);

  updateBall(s, env, dt, t);
  updateHoop(s.hoop, dt, s.ball.held ? null : s.ball);

  // Effects
  s.cheer = Math.max(0, s.cheer - dtReal * (s.phase === 'land' ? 0.25 : 0.4));
  for (const f of s.flashes) f.life -= dtReal * 3.2;
  s.flashes = s.flashes.filter((f) => f.life > 0);
  s.shake = Math.max(0, s.shake - dtReal * 2.2);
  s.banner += dtReal;
  for (const m of s.motes) {
    m.x += (-0.05 - m.r * 0.02) * dt;
    m.y += 0.08 * dt;
    if (m.y > 1.05) m.y -= 1.1;
    if (m.x < -0.05) m.x += 1.1;
  }
}

function anchorToRim(s: State, w: number) {
  solve(RIG, s.pose, s.sk, true);
  const k = s.sk.knuckle[0];
  const tx = s.hoop.x - s.hoop.r * 0.85;
  const ty = s.hoop.y + s.hoop.dy + 0.03;
  s.pose.x += (tx - k.x) * w;
  s.pose.y += (ty - k.y) * w;
}

function slam(s: State, env: SceneEnv) {
  s.slammed = true;
  solve(RIG, s.pose, s.sk, true);
  gripPoint(s.sk, 0, 'palm', s.grip);
  s.ball.held = false;
  s.ball.x = clamp(s.grip.x, s.hoop.x - 0.06, s.hoop.x + 0.06);
  s.ball.y = Math.max(s.grip.y, s.hoop.y + 0.02);
  s.ball.vx = 0.4;
  s.ball.vy = -6.5;
  rimHit(s.hoop, s.kind === 'line' ? 3.2 : 2.4);
  if (!env.reducedMotion) s.shake = s.kind === 'line' ? 1 : 0.7;
  if (s.kind === 'line') s.lineDunks++;
  s.cheer = 1;
  sfx(env, (b) => {
    sfxSlam(b);
    crowdRoar(b, 2.2, 0.16);
  });
}

function updateBall(s: State, env: SceneEnv, dt: number, t: number) {
  const b = s.ball;
  if (b.held) {
    // In the hand: dribbles while idle, carried at the hip, cocked overhead in flight
    solve(RIG, s.pose, s.sk, true);
    const flying = s.phase === 'fly' || s.phase === 'plant' || s.phase === 'poster';
    gripPoint(s.sk, 0, flying ? 'up' : 'palm', s.grip);
    if (s.phase === 'idle') {
      const per = 0.62;
      const u = ((t % per) + per) % per / per;
      const top = s.grip.y;
      const fall = Math.sin(u * Math.PI);
      b.x = s.grip.x + 0.06;
      b.y = lerp(top, BALL_R, Math.pow(fall, 0.85));
    } else {
      b.x = s.grip.x;
      b.y = s.grip.y;
    }
    b.rot += dt * (s.phase === 'run' ? 4 : 1.2);
    return;
  }
  const prevY = b.y;
  b.vy -= 9.8 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += (b.vx / BALL_R) * dt;
  const h = s.hoop;
  // Through the hoop: the net catches and slows it, then whips
  if (prevY >= h.y && b.y < h.y && Math.abs(b.x - h.x) < h.r) {
    netSnap(h, s.kind === 'line' ? 3.4 : 2.6, b.vx);
    b.vy *= 0.55;
    b.vx *= 0.5;
    sfx(env, (bus) => sfxSwish(bus, 0.2));
  }
  if (b.y < h.y && b.y > h.y - 0.45 && Math.abs(b.x - h.x) < h.r) b.vy = Math.max(b.vy, -4.2);
  if (b.x + BALL_R > h.board && b.y > 2.9 && b.y < 3.95) {
    b.x = h.board - BALL_R;
    b.vx = -Math.abs(b.vx) * 0.6;
  }
  if (b.x + BALL_R > BASELINE + 1.3) {
    b.x = BASELINE + 1.3 - BALL_R;
    b.vx = -Math.abs(b.vx) * 0.5;
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (Math.abs(b.vy) > 0.8) {
      const k = clamp(Math.abs(b.vy) / 6, 0.15, 1);
      sfx(env, (bus) => sfxBounce(bus, k));
      b.bounces++;
    }
    b.vy = Math.abs(b.vy) * 0.62;
    if (b.vy < 0.4) b.vy = 0;
    b.vx *= 0.82;
  }
}

function spawnFlash(s: State, env: SceneEnv) {
  const c = s.cam;
  s.flashes.push({
    x: rand(0, c.w),
    y: c.gy - rand(0.05, 1.3) * c.ppm * 0.55,
    life: 1,
    size: Math.max(1.2, c.ppm * rand(0.015, 0.03)),
  });
  if (Math.random() < 0.18) sfx(env, (b) => sfxShutter(b));
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  const portrait = h > w * 1.05;
  fitCam(s.cam, w, h, portrait ? 4.6 : 6.6, 5.2, 2.2, 0.62);
  // Poster backdrop: arena glow, halftone screen and the giant 23
  const size = Math.min(h * 0.82, w * (portrait ? 0.78 : 0.5));
  s.numeral = {
    x: portrait ? w * 0.5 : w * 0.3,
    y: portrait ? s.cam.gy - s.cam.ppm * 1.2 : s.cam.gy - size * 0.08,
    size,
    rot: -6,
  };
  const base = document.createElement('canvas');
  base.width = Math.max(1, Math.round(w * env.dpr));
  base.height = Math.max(1, Math.round(h * env.dpr));
  const bc = base.getContext('2d');
  if (!bc) return;
  bc.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const g = bc.createRadialGradient(w * 0.55, h * 0.42, 0, w * 0.55, h * 0.42, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, '#c4122f');
  g.addColorStop(0.38, '#6d0718');
  g.addColorStop(0.75, '#1e0307');
  g.addColorStop(1, '#070102');
  bc.fillStyle = g;
  bc.fillRect(0, 0, w, h);
  const cell = clamp(Math.min(w, h) / 60, 4, 9);
  const glow = halftoneLayer(w, h, env.dpr, cell, 45, '#ff3b52', (c) => {
    const t = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.6);
    t.addColorStop(0, 'rgba(255,255,255,0.62)');
    t.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = t;
    c.fillRect(0, 0, w, h);
  });
  bc.save();
  bc.setTransform(1, 0, 0, 1, 0, 0);
  bc.globalAlpha = 0.35;
  bc.drawImage(glow, 0, 0);
  const n = s.numeral;
  const num = halftoneLayer(w, h, env.dpr, cell * 0.8, 30, '#ff4a5e', (c) => numeralTone(c, '23', n.x, n.y, n.size, n.rot));
  bc.globalAlpha = 0.55;
  bc.drawImage(num, 0, 0);
  bc.restore();
  numeralLine(bc, '23', n.x, n.y, n.size, n.rot, '#ff8a96', 0.28);
  // Spot from the upper right and soft rays toward the rim
  const sp = bc.createRadialGradient(w * 0.86, h * 0.06, 0, w * 0.86, h * 0.06, Math.max(w, h) * 0.6);
  sp.addColorStop(0, 'rgba(255,210,194,0.5)');
  sp.addColorStop(1, 'rgba(255,210,194,0)');
  bc.fillStyle = sp;
  bc.fillRect(0, 0, w, h);
  bc.save();
  bc.globalCompositeOperation = 'lighter';
  const ox = w * 0.92;
  const oy = -h * 0.08;
  for (const [a, wd] of [
    [112, 3.5],
    [121, 2.6],
    [128, 4],
    [136, 2.8],
    [144, 3.4],
  ]) {
    const len = Math.hypot(w, h) * 1.1;
    const a0 = ((a - wd / 2) * Math.PI) / 180;
    const a1 = ((a + wd / 2) * Math.PI) / 180;
    const rg = bc.createRadialGradient(ox, oy, 0, ox, oy, len);
    rg.addColorStop(0, 'rgba(255,216,204,0.16)');
    rg.addColorStop(1, 'rgba(255,216,204,0)');
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

function aim(s: State, env: SceneEnv) {
  const P = s.pose;
  let focus = P.x + Math.min(2.4, (env.w / s.cam.ppm) * 0.22);
  if (s.phase === 'fly' || s.phase === 'hang' || s.phase === 'drop' || s.phase === 'land' || s.phase === 'poster' || s.phase === 'plant') focus = lerp(P.x, 0, 0.55);
  return focus;
}

/* ---------- draw ---------- */

function draw(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const cam = s.cam;
  layoutZoom(s, env);
  aimCam(cam, s.camCx, VIEW_LO, VIEW_HI);
  cam.sx = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.08 * cam.ppm : 0;
  cam.sy = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.08 * cam.ppm : 0;

  ctx.drawImage(s.bg, 0, 0, w, h);

  // Motes in the lights
  ctx.save();
  ctx.fillStyle = '#ffb3a6';
  for (const m of s.motes) {
    ctx.globalAlpha = m.a * 0.5;
    ctx.beginPath();
    ctx.arc(m.x * w, m.y * h, m.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // Far side crowd behind the court
  drawCrowd(ctx, cam, s.fans, 0.42, cam.gy - 0.22 * cam.ppm, 0.3, 'rgba(26,3,6,0.88)', s.cheer, t);
  drawFlashes(ctx, s.flashes, 'rgba(255,214,200,0.55)');

  drawFloor(s, env, t);
  drawHoopBack(ctx, cam, s.hoop, HOOP_STYLE);

  // Athlete with the ball in his depth order while held
  solve(RIG, s.pose, s.sk, true);
  const b = s.ball;
  const layers = b.held
    ? [{ d: s.grip.d + 0.03, draw: (c: CanvasRenderingContext2D) => drawBall(c, cam, b.x, b.y, b.rot, LIGHT) }]
    : [];
  const shadowX = camX(cam, s.pose.x);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const air = clamp(s.pose.y - STAND, 0, 2);
  ctx.beginPath();
  ctx.ellipse(shadowX, cam.gy + 0.05 * cam.ppm, (0.42 - air * 0.12) * cam.ppm, 0.06 * cam.ppm, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (!b.held) drawBall(ctx, cam, b.x, b.y, b.rot, LIGHT);
  drawAthlete(ctx, cam, RIG, s.sk, KIT, LIGHT, layers);
  drawHoopFront(ctx, cam, s.hoop, HOOP_STYLE);

  drawVignette(ctx, w, h, 0.55);
  drawHud(s, env, t);
  if (s.fade > 0) {
    ctx.fillStyle = `rgba(7,1,2,${s.fade})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function layoutZoom(s: State, env: SceneEnv) {
  const portrait = env.h > env.w * 1.05;
  fitCam(s.cam, env.w, env.h, portrait ? 4.6 : 6.6, 5.2, 2.2, 0.62);
  const z = 1 + 0.06 * smooth01(s.zoom);
  s.cam.ppm *= z;
  s.cam.gy = Math.min(env.h - 0.5 * s.cam.ppm, env.h / 2 + 2.2 * s.cam.ppm);
}

function drawFloor(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const cam = s.cam;
  const gy = cam.gy;
  const g = ctx.createLinearGradient(0, gy, 0, h);
  g.addColorStop(0, '#2a0409');
  g.addColorStop(1, '#050102');
  ctx.fillStyle = g;
  ctx.fillRect(0, gy, w, h - gy);
  const depth = h - gy;
  const skew = 0.45;
  // Lane paint from the free-throw line to the baseline
  const lx = camX(cam, LINE);
  const bx = camX(cam, BASELINE);
  ctx.save();
  ctx.fillStyle = 'rgba(160,10,32,0.28)';
  ctx.beginPath();
  ctx.moveTo(lx, gy);
  ctx.lineTo(bx, gy);
  ctx.lineTo(bx - depth * skew, h);
  ctx.lineTo(lx - depth * skew, h);
  ctx.closePath();
  ctx.fill();
  // Floor sheen under the lights
  const sh = ctx.createRadialGradient(camX(cam, -1), gy, 0, camX(cam, -1), gy, w * 0.5);
  sh.addColorStop(0, 'rgba(255,120,130,0.16)');
  sh.addColorStop(1, 'rgba(255,120,130,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, gy, w, depth);
  // Baseline and the free-throw line; the line glows as he closes in
  ctx.strokeStyle = 'rgba(255,236,230,0.5)';
  ctx.lineWidth = Math.max(1, 0.025 * cam.ppm);
  ctx.beginPath();
  ctx.moveTo(bx, gy);
  ctx.lineTo(bx - depth * skew, h);
  ctx.stroke();
  const near = s.phase === 'run' ? clamp(1 - Math.abs(s.pose.x + 0.55 - LINE) / 3, 0, 1) : 0;
  const lit = s.kind === 'line' && s.phase !== 'idle' ? 1 : near;
  ctx.shadowColor = '#ffd3c8';
  ctx.shadowBlur = 6 + lit * 18;
  ctx.strokeStyle = `rgba(255,243,238,${0.7 + lit * 0.3})`;
  ctx.lineWidth = Math.max(1.5, (0.035 + lit * 0.025) * cam.ppm);
  ctx.beginPath();
  ctx.moveTo(lx, gy);
  ctx.lineTo(lx - depth * skew, h);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,90,108,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, gy + 0.5);
  ctx.lineTo(w, gy + 0.5);
  ctx.stroke();
  ctx.restore();
  // Takeoff mark label on the floor
  if (env.interactive && (s.phase === 'idle' || s.phase === 'run') && w > 300) {
    const pulse = 0.55 + 0.35 * Math.sin(t * 4);
    label(ctx, 'FREE THROW LINE', lx - depth * skew * 0.5, gy + depth * 0.62, clamp(cam.ppm * 0.09, 8, 12), '#ffd9cf', 'center', pulse * (1 - near * 0.4));
  }
}

function drawHud(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  if (w < 260 || !env.interactive) return;
  const fs = clamp(Math.min(w, h) / 34, 9, 13);
  const pad = Math.max(12, fs * 1.3);
  if (s.lineDunks > 0 || env.interactive) {
    label(ctx, 'FROM THE LINE', pad, pad + fs, fs, '#ffd9cf', 'left', 0.8);
    label(ctx, String(s.lineDunks).padStart(2, '0'), pad, pad + fs * 2.6, fs * 1.6, '#fff0e4', 'left', 0.95);
  }
  // Verdict at the takeoff
  if (s.bannerKind && s.phase !== 'idle' && s.phase !== 'reset') {
    const a = smooth01(s.banner / 0.2) * (1 - smooth01((s.banner - 2.6) / 0.5));
    // On the floor band when there is room, else across the top
    const band = h - s.cam.gy;
    const line = s.bannerKind === 'line';
    const size = line ? clamp(Math.min(w * 0.075, h * 0.1), 16, 60) : clamp(Math.min(w * 0.045, h * 0.065), 12, 32);
    const y = band > size * 1.25 ? s.cam.gy + band * 0.52 : h * 0.13;
    if (line) headline(ctx, 'FROM THE LINE', w / 2, y, size, '#fff0e4', 'rgba(255,40,70,0.9)', a);
    else headline(ctx, s.bannerKind === 'early' ? 'EARLY · DUNK' : 'LATE · DUNK', w / 2, y, size, '#ffd9cf', 'rgba(255,40,70,0.6)', a * 0.9);
  }
  if (env.interactive && s.phase === 'idle' && !s.auto) {
    const a = 0.55 + 0.25 * Math.sin(t * 2.4);
    label(ctx, 'HOLD TO RUN  ·  LET GO AT THE LINE', w / 2, h - pad * 0.9, fs, '#ffe3dc', 'center', a);
  }
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2.75,
    cursor: 'pointer',
    init(env) {
      const s: State = {
        cam: makeCam(),
        hoop: makeHoop(0, 3.05),
        pose: clonePose(READY),
        start: clonePose(READY),
        tmp: clonePose(READY),
        sk: makeSkel(),
        phase: 'idle',
        pt: 0,
        holding: false,
        auto: false,
        idle: 0,
        demoCount: 0,
        ph: 0,
        amp: 0,
        cad: 1.4,
        v: 0,
        lockLeg: -1,
        lockX: 0,
        kind: null,
        plantX: LINE,
        ank0x: 0,
        ank0y: 0,
        fx0: 0,
        fy0: 0,
        fx1: 0,
        fy1: 0,
        apex: 0,
        dur: 1,
        u: 0,
        slammed: false,
        feet: [0, 0],
        landY: 0,
        vyFall: 0,
        timeScale: 1,
        zoom: 0,
        camCx: START_X,
        ball: { x: START_X, y: 1, vx: 0, vy: 0, rot: 0, held: true, bounces: 0 },
        grip: { x: 0, y: 0, d: 0 },
        shake: 0,
        cheer: 0,
        flashes: [],
        flashClock: 0,
        fans: makeCrowd(23, -26, 8, 3, 3.2),
        motes: Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.6, 1.8), a: rand(0.25, 1) })),
        bg: document.createElement('canvas'),
        numeral: { x: 0, y: 0, size: 100, rot: -6 },
        fade: 0,
        lineDunks: 0,
        banner: 0,
        bannerKind: null,
      };
      resetRun(s);
      if (env.reducedMotion) setPoster(s);
      return s;
    },
    resize(s, env) {
      layout(s, env);
      s.camCx = clamp(aim(s, env), VIEW_LO, VIEW_HI);
    },
    update,
    draw,
    onPointerDown(s, env) {
      press(s, env);
    },
    onPointerUp(s, env) {
      release(s, env);
    },
    onKey(s, env, e, down) {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) press(s, env);
      else if (!down) release(s, env);
      return true;
    },
  });
