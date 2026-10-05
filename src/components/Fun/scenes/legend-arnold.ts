import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutCubic, lerp, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  MONO,
  callout,
  chip,
  compositeFigure,
  ellipse,
  freeFigureLayer,
  grain,
  halftone,
  limb,
  makeFigureLayer,
  makeMotes,
  massAlong,
  paintFigure,
  part,
  rays,
  roar,
  shutter,
  smoothClosed,
  smoothOpen,
  spawnMote,
  stepMotes,
  swell,
  clank,
  vignette,
} from './legends-iron-kit';
import type { FigureLayer, Mote, RimStyle } from './legends-iron-kit';

/**
 * Arnold: The Pump. A 1970s Venice gym in sepia and gold, late afternoon light through the
 * windows. A tribute silhouette with the Golden Era build (wide delts, deep chest, vacuum waist,
 * high peaked arms) does strict alternating dumbbell curls in profile, facing the mirror on the
 * side wall. Every click or Space is one rep through the full range: elbow pinned, the forearm
 * swings from a straight arm up past 140 degrees and back down slow. Each rep pumps the arms a
 * little bigger (fuller bellies, a higher peak, veins rising), the pump meter fills, and at a
 * full pump he turns to the camera and hits a front double biceps under a storm of flashes.
 */

type Phase = 'curl' | 'pose';

interface Flash {
  x: number;
  y: number;
  age: number;
  size: number;
}

interface State {
  phase: Phase;
  // rep machine
  repT: number;
  repSide: number;
  queued: number;
  peaked: boolean;
  nearF: number;
  farF: number;
  pump: number;
  pumpShown: number;
  reps: number;
  sets: number;
  idle: number;
  poseT: number;
  poseDone: boolean;
  flashes: Flash[];
  flashCd: number;
  white: number;
  toast: string;
  toastAge: number;
  demoCd: number;
  keyHeld: boolean;
  breath: number;
  motes: Mote[];
  moteAcc: number;
  // layout
  H: number;
  gx: number;
  gy: number;
  mirrorL: number;
  mirrorR: number;
  mirrorTop: number;
  mirrorPlane: number;
  portrait: boolean;
  bg: HTMLCanvasElement | null;
  body: FigureLayer;
  far: FigureLayer;
  arm: FigureLayer;
  touchedRep: boolean;
}

const REP_UP = 0.55;
const REP_TOP = 0.2;
const REP_DOWN = 0.8;
const REP_T = REP_UP + REP_TOP + REP_DOWN;
const PUMP_STEP = 0.1;
const POSE_T = 3.6;

const RIM: RimStyle = {
  ink: ['#2a1b0c', '#0b0703'],
  key: '#fff1cf',
  kx: 1.5,
  ky: 1.8,
  back: '#ffcf86',
  bx: -1.6,
  by: 1.6,
  halo: '#ffbf5c',
  haloAlpha: 0.55,
  haloBlur: 18,
  bloom: 3,
};
const FAR_RIM: RimStyle = { ...RIM, ink: ['#160e06', '#080502'], key: '#d8b67a', backAlpha: 0.4, haloAlpha: 0, bloom: 0 };
const ARM_RIM: RimStyle = { ...RIM, ink: ['#3b2712', '#130b04'], kx: 2.4, ky: 1.4, bx: -2.4, by: 0.8, backAlpha: 0.95, haloAlpha: 0 };

/** Rep curve: 0 straight arm, 1 fully flexed */
function repCurve(q: number) {
  if (q < 0) return 0;
  if (q < REP_UP) return easeInOutCubic(q / REP_UP);
  if (q < REP_UP + REP_TOP) return 1;
  if (q < REP_T) return 1 - easeInOutCubic((q - REP_UP - REP_TOP) / REP_DOWN);
  return 0;
}

/* ---------- the profile rig (facing right) ---------- */

interface ArmPose {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  wx: number;
  wy: number;
  hx: number;
  hy: number;
  /** Forearm direction */
  fx: number;
  fy: number;
  flex: number;
}

function armPose(sx: number, sy: number, f: number, H: number): ArmPose {
  // Elbow stays pinned by the ribs, drifting forward a touch at the top like a strict curl
  const a = ((4 + 16 * Math.pow(f, 1.6)) * Math.PI) / 180;
  const ex = sx + Math.sin(a) * 0.19 * H;
  const ey = sy + Math.cos(a) * 0.19 * H;
  const theta = ((10 + 132 * f) * Math.PI) / 180 + a;
  const fx = Math.sin(theta);
  const fy = Math.cos(theta);
  const wx = ex + fx * 0.15 * H;
  const wy = ey + fy * 0.15 * H;
  // Wrist curls in a little at the top
  const wc = theta + 0.25 * f;
  return { sx, sy, ex, ey, wx, wy, hx: wx + Math.sin(wc) * 0.035 * H, hy: wy + Math.cos(wc) * 0.035 * H, fx, fy, flex: f };
}

function upperArm(c: CanvasRenderingContext2D, p: ArmPose, H: number, pump: number) {
  const k = p.flex;
  const peak = lerp(0.6, 0.52, k);
  const L = (t: number) => [lerp(p.sx, p.ex, t), lerp(p.sy, p.ey, t)];
  const biceps = 0.052 + 0.016 * k + 0.022 * pump;
  limb(c, [
    [...L(0), 0.05 * H, 0.054 * H],
    [...L(0.3), 0.05 * H, (0.06 + 0.006 * pump) * H],
    [...L(peak), biceps * H, (0.054 + 0.006 * pump) * H],
    [...L(0.84), (0.04 + 0.01 * k) * H, 0.04 * H],
    [...L(1), 0.031 * H, 0.032 * H],
  ]);
}

function forearm(c: CanvasRenderingContext2D, p: ArmPose, H: number, pump: number) {
  const L = (t: number) => [lerp(p.ex, p.wx, t), lerp(p.ey, p.wy, t)];
  const g = 1 + 0.12 * pump;
  limb(c, [
    [...L(0), 0.031 * H, 0.03 * H],
    [...L(0.22), 0.039 * g * H, 0.034 * g * H],
    [...L(0.6), 0.028 * g * H, 0.025 * H],
    [...L(1), 0.019 * H, 0.019 * H],
  ]);
  ellipse(c, p.hx, p.hy, 0.027 * H, 0.031 * H, Math.atan2(p.fy, p.fx));
}

/** Dumbbell heads either side of the fist; the axle runs into the screen at a slight angle */
function dumbbell(c: CanvasRenderingContext2D, p: ArmPose, H: number, which: 'near' | 'far' | 'bar') {
  const dx = -0.052 * H;
  const dy = 0.01 * H;
  if (which === 'bar') {
    limb(c, [
      [p.hx - dx * 0.9, p.hy - dy * 0.9, 0.007 * H],
      [p.hx + dx * 0.9, p.hy + dy * 0.9, 0.007 * H],
    ]);
    return;
  }
  const s = which === 'near' ? 1 : -1;
  const x = p.hx + dx * s;
  const y = p.hy + dy * s;
  ellipse(c, x, y, 0.03 * H, 0.04 * H);
}

interface Body {
  H: number;
  gx: number;
  gy: number;
  lean: number;
  breath: number;
  pump: number;
  near: ArmPose;
  far: ArmPose;
}

function profileBody(b: Body) {
  const { H, gx, gy } = b;
  const X = (u: number) => gx + u * H;
  const Y = (v: number) => gy - v * H;
  // Lean pivots the torso around the hips
  const pivX = X(-0.005);
  const pivY = Y(0.52);
  const cl = Math.cos(b.lean);
  const sl = Math.sin(b.lean);
  const R = (u: number, v: number): [number, number] => {
    const x = X(u) - pivX;
    const y = Y(v) - pivY;
    return [pivX + x * cl + y * sl, pivY - x * sl + y * cl];
  };
  const br = b.breath;
  return { X, Y, R, br };
}

/** Shoulder joint in screen space, for the arm rigs */
function shoulderOf(b: Body, far: boolean): [number, number] {
  const { R } = profileBody(b);
  return far ? R(0.012, 0.81) : R(-0.006, 0.802);
}

function drawLegsAndTorso(c: CanvasRenderingContext2D, b: Body) {
  const { H } = b;
  const { X, Y, R, br } = profileBody(b);
  const W = (v: number) => v * H;
  // Shoes: low 70s trainers
  part(c, () =>
    limb(c, [
      [X(-0.035), Y(0.022), W(0.022), W(0.022)],
      [X(0.03), Y(0.02), W(0.022), W(0.02)],
      [X(0.11), Y(0.016), W(0.016), W(0.015)],
    ])
  );
  // Far leg sits a hair behind and forward
  for (const o of [0.02, 0]) {
    // Shin: the calf belly high on the back, the tibia straight down the front
    part(c, () =>
      limb(c, [
        [X(0.014 + o), Y(0.29), W(0.04), W(0.044)],
        [X(0.008 + o), Y(0.22), W(0.034), W(0.066)],
        [X(0.002 + o), Y(0.15), W(0.029), W(0.046)],
        [X(-0.002 + o), Y(0.05), W(0.021), W(0.025)],
      ])
    );
    // Thigh: the quad bulges forward above the knee, the hamstring and glute tie in behind
    part(c, () =>
      limb(c, [
        [X(-0.01 + o), Y(0.545), W(0.088), W(0.082)],
        [X(0.0 + o), Y(0.46), W(0.09), W(0.078)],
        [X(0.01 + o), Y(0.38), W(0.08), W(0.064)],
        [X(0.016 + o), Y(0.32), W(0.06), W(0.05)],
        [X(0.016 + o), Y(0.285), W(0.044), W(0.042)],
      ])
    );
  }
  // Glutes
  part(c, () => ellipse(c, ...R(-0.04, 0.485), W(0.058), W(0.064), -0.3));
  // Torso: deep chest, small waist, lats
  const [ax, ay] = R(-0.008, 0.49);
  const [nx, ny] = R(0.004, 0.84);
  const chest = 1 + br * 0.04;
  part(c, () =>
    massAlong(
      c,
      ax,
      ay,
      nx,
      ny,
      [
        [0, W(0.07), W(0.074)],
        [0.12, W(0.066), W(0.068)],
        [0.28, W(0.06), W(0.064)],
        [0.45, W(0.071 * chest), W(0.078)],
        [0.6, W(0.097 * chest), W(0.09)],
        [0.72, W(0.113 * chest), W(0.093)],
        [0.84, W(0.1 * chest), W(0.088)],
        [0.94, W(0.068), W(0.074)],
        [1, W(0.04), W(0.05)],
      ],
      1
    )
  );
  // Neck and traps
  part(c, () => limb(c, [[...R(0.0, 0.82), W(0.05), W(0.05)], [...R(0.026, 0.885), W(0.04), W(0.04)]]));
  part(c, () => {
    const p = [...R(-0.075, 0.83), ...R(-0.02, 0.88), ...R(0.02, 0.86), ...R(0.03, 0.83), ...R(-0.02, 0.8)];
    smoothClosed(c, p);
  });
}

/** Head in profile with 1970s hair: full on top, over the ears, flicked at the nape */
function drawHead(c: CanvasRenderingContext2D, b: Body) {
  const { H } = b;
  const { R } = profileBody(b);
  const [hx, hy] = R(0.034, 0.925);
  const P = (pts: readonly number[]) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(hx + pts[i] * H, hy - pts[i + 1] * H);
    return out;
  };
  part(c, () =>
    smoothClosed(
      c,
      P([
        -0.044, -0.05, -0.058, -0.005, -0.05, 0.04, -0.018, 0.066, 0.02, 0.064, 0.046, 0.04, 0.054, 0.016, 0.051, 0.003,
        0.068, -0.019, 0.055, -0.028, 0.059, -0.038, 0.054, -0.045, 0.06, -0.06, 0.042, -0.075, 0.004, -0.064, -0.012, -0.062,
      ])
    )
  );
  part(c, () =>
    smoothClosed(
      c,
      P([
        0.044, 0.046, 0.032, 0.078, -0.006, 0.092, -0.046, 0.084, -0.072, 0.054, -0.08, 0.012, -0.074, -0.03, -0.066, -0.052,
        -0.05, -0.046, -0.034, -0.022, -0.016, -0.004, -0.008, 0.022, 0.012, 0.034, 0.032, 0.036,
      ])
    )
  );
}

function headPoint(b: Body) {
  return profileBody(b).R(0.034, 0.925);
}

/* ---------- the front double biceps (facing camera) ---------- */

function frontBody(c: CanvasRenderingContext2D, H: number, gx: number, gy: number, k: number, pump: number, breath: number) {
  const X = (u: number) => gx + u * H;
  const Y = (v: number) => gy - v * H;
  const W = (v: number) => v * H;
  const flare = 1 + 0.07 * k + breath * 0.02;
  for (const s of [-1, 1]) {
    // For a downward limb the left half width is screen right
    const io = (outer: number, inner: number) => (s > 0 ? [W(outer), W(inner)] : [W(inner), W(outer)]);
    part(c, () =>
      limb(c, [
        [X(s * 0.078), Y(0.53), ...io(0.068, 0.05)],
        [X(s * 0.094), Y(0.45), ...io(0.078, 0.058)],
        [X(s * 0.096), Y(0.37), ...io(0.064, 0.054)],
        [X(s * 0.092), Y(0.32), ...io(0.05, 0.056)],
        [X(s * 0.09), Y(0.285), ...io(0.04, 0.042)],
      ])
    );
    part(c, () =>
      limb(c, [
        [X(s * 0.09), Y(0.285), ...io(0.038, 0.036)],
        [X(s * 0.097), Y(0.2), ...io(0.048, 0.05)],
        [X(s * 0.1), Y(0.12), ...io(0.032, 0.03)],
        [X(s * 0.104), Y(0.05), ...io(0.022, 0.02)],
      ])
    );
    part(c, () => ellipse(c, X(s * 0.112), Y(0.02), W(0.032), W(0.02)));
  }
  // Torso with the lats spread
  part(c, () =>
    massAlong(
      c,
      X(0),
      Y(0.5),
      X(0),
      Y(0.84),
      [
        [0, W(0.1), W(0.1)],
        [0.14, W(0.096), W(0.096)],
        [0.3, W(0.084), W(0.084)],
        [0.46, W(0.098 * flare), W(0.098 * flare)],
        [0.6, W(0.132 * flare), W(0.132 * flare)],
        [0.72, W(0.148 * flare), W(0.148 * flare)],
        [0.84, W(0.152), W(0.152)],
        [0.93, W(0.12), W(0.12)],
        [1, W(0.05), W(0.05)],
      ],
      1
    )
  );
  part(c, () => limb(c, [[X(0), Y(0.82), W(0.05)], [X(0), Y(0.88), W(0.044)]]));
  // Arms: relaxed at k 0, double biceps at k 1
  for (const s of [-1, 1]) {
    const sx = X(s * 0.165);
    const sy = Y(0.8);
    part(c, () => ellipse(c, X(s * 0.158), Y(0.796), W(0.066), W(0.06)));
    const ua = lerp(-1.42, 0.08, k);
    const ex = sx + s * Math.cos(ua) * 0.19 * H;
    const ey = sy - Math.sin(ua) * 0.19 * H;
    const fa = ua + lerp(0.15, 1.62, k);
    const wx = ex + s * Math.cos(fa) * 0.155 * H;
    const wy = ey - Math.sin(fa) * 0.155 * H;
    // Travel outward: for s > 0 the left side is up (biceps on top)
    const top = 0.047 + 0.02 * k + 0.022 * pump;
    const tb = (up: number, down: number) => (s > 0 ? [W(up), W(down)] : [W(down), W(up)]);
    const L = (t: number) => [lerp(sx, ex, t), lerp(sy, ey, t)];
    part(c, () =>
      limb(c, [
        [...L(0), ...tb(0.045, 0.05)],
        [...L(0.5), ...tb(top, 0.052 + 0.005 * pump)],
        [...L(0.82), ...tb(0.036 + 0.012 * k, 0.04)],
        [...L(1), ...tb(0.03, 0.032)],
      ])
    );
    const F = (t: number) => [lerp(ex, wx, t), lerp(ey, wy, t)];
    const ff = 1 + 0.1 * pump;
    part(c, () =>
      limb(c, [
        [...F(0), ...tb(0.03, 0.03)],
        [...F(0.25), ...tb(0.034 * ff, 0.036 * ff)],
        [...F(0.65), ...tb(0.024, 0.026)],
        [...F(1), ...tb(0.019, 0.019)],
      ])
    );
    part(c, () => ellipse(c, wx + s * Math.cos(fa) * 0.03 * H, wy - Math.sin(fa) * 0.03 * H, W(0.032), W(0.034)));
  }
  // Head and hair, front on
  part(c, () => ellipse(c, X(0), Y(0.925), W(0.05), W(0.066)));
  part(c, () =>
    smoothClosed(c, [
      X(-0.058), Y(0.9), X(-0.064), Y(0.95), X(-0.04), Y(0.99), X(0.005), Y(1.0), X(0.048), Y(0.988), X(0.066), Y(0.95),
      X(0.06), Y(0.9), X(0.05), Y(0.93), X(0.03), Y(0.965), X(-0.02), Y(0.965), X(-0.05), Y(0.935),
    ])
  );
}

/** Muscle accents for the front pose: pecs, abs, sweep, peaks, veins */
function frontAccents(c: CanvasRenderingContext2D, H: number, gx: number, gy: number, k: number, pump: number) {
  const X = (u: number) => gx + u * H;
  const Y = (v: number) => gy - v * H;
  c.lineWidth = Math.max(1, H * 0.004);
  c.strokeStyle = 'rgba(255,224,170,0.32)';
  c.beginPath();
  // Pecs
  for (const s of [-1, 1]) {
    smoothOpen(c, [X(s * 0.004), Y(0.79), X(s * 0.06), Y(0.715), X(s * 0.12), Y(0.722), X(s * 0.15), Y(0.765)]);
  }
  c.moveTo(X(0), Y(0.8));
  c.lineTo(X(0), Y(0.55));
  // Abs: three pairs and the lower set
  for (let i = 0; i < 4; i++) {
    const y = 0.69 - i * 0.045;
    const w = 0.05 - i * 0.004;
    for (const s of [-1, 1]) {
      smoothOpen(c, [X(s * 0.006), Y(y - 0.035), X(s * w * 0.8), Y(y - 0.03), X(s * w), Y(y - 0.01)]);
    }
  }
  for (const s of [-1, 1]) {
    // Serratus and obliques
    for (let i = 0; i < 3; i++) {
      c.moveTo(X(s * (0.118 - i * 0.004)), Y(0.69 - i * 0.03));
      c.lineTo(X(s * (0.092 - i * 0.004)), Y(0.675 - i * 0.03));
    }
    smoothOpen(c, [X(s * 0.08), Y(0.58), X(s * 0.088), Y(0.53), X(s * 0.06), Y(0.49)]);
    // Quad teardrop and sweep
    smoothOpen(c, [X(s * 0.06), Y(0.48), X(s * 0.085), Y(0.4), X(s * 0.07), Y(0.32)]);
    smoothOpen(c, [X(s * 0.12), Y(0.47), X(s * 0.13), Y(0.39), X(s * 0.11), Y(0.31)]);
    // Delt separation
    smoothOpen(c, [X(s * 0.13), Y(0.74), X(s * 0.112), Y(0.79), X(s * 0.14), Y(0.84)]);
  }
  c.stroke();
  // Trunks
  c.fillStyle = 'rgba(6,3,1,0.55)';
  c.beginPath();
  smoothClosed(c, [X(-0.105), Y(0.545), X(0), Y(0.535), X(0.105), Y(0.545), X(0.1), Y(0.48), X(0.03), Y(0.43), X(0), Y(0.425), X(-0.03), Y(0.43), X(-0.1), Y(0.48)]);
  c.fill();
  // Peaks and veins on the raised arms
  if (k > 0.5) {
    c.globalAlpha = (k - 0.5) * 2;
    for (const s of [-1, 1]) {
      const g = c.createRadialGradient(X(s * 0.27), Y(0.87), 0, X(s * 0.27), Y(0.87), H * 0.07);
      g.addColorStop(0, `rgba(255,214,150,${0.18 + 0.12 * pump})`);
      g.addColorStop(1, 'rgba(255,214,150,0)');
      c.fillStyle = g;
      c.fillRect(X(s * 0.27) - H * 0.08, Y(0.87) - H * 0.08, H * 0.16, H * 0.16);
    }
    c.strokeStyle = `rgba(255,232,190,${0.2 + 0.4 * pump})`;
    c.lineWidth = Math.max(0.8, H * 0.0028);
    c.beginPath();
    for (const s of [-1, 1]) {
      smoothOpen(c, [X(s * 0.2), Y(0.835), X(s * 0.25), Y(0.85), X(s * 0.29), Y(0.842), X(s * 0.33), Y(0.86)]);
      smoothOpen(c, [X(s * 0.355), Y(0.86), X(s * 0.348), Y(0.92), X(s * 0.355), Y(0.96)]);
    }
    c.stroke();
    c.globalAlpha = 1;
  }
}

/* ---------- scene ---------- */

function buildBackground(s: State, env: SceneEnv) {
  const { w, h } = env;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * env.dpr));
  cv.height = Math.max(1, Math.round(h * env.dpr));
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const H = s.H;
  // Warm room glow
  const g = c.createRadialGradient(w * 0.42, h * 0.3, 0, w * 0.42, h * 0.3, Math.max(w, h) * 0.85);
  g.addColorStop(0, '#f2cf86');
  g.addColorStop(0.24, '#b78845');
  g.addColorStop(0.56, '#4a3317');
  g.addColorStop(1, '#120c05');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Halftone sun behind the lifter
  c.drawImage(
    halftone(env, w, h, Math.max(5, H * 0.012), 45, 'rgba(255,227,163,0.42)', (t) => {
      const r = t.createRadialGradient(s.gx, s.gy - H * 0.62, 0, s.gx, s.gy - H * 0.62, H * 0.75);
      r.addColorStop(0, 'rgba(255,255,255,0.9)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      t.fillStyle = r;
      t.fillRect(0, 0, w, h);
    }),
    0,
    0,
    w,
    h
  );
  // Back wall: window panes on the left with the beach light, a brick course line
  const wallBase = s.gy - H * 0.06;
  c.fillStyle = 'rgba(28,18,8,0.55)';
  c.fillRect(0, wallBase - H * 0.02, w, H * 0.02);
  const winW = H * 0.34;
  for (let i = 0; i < 3; i++) {
    const x0 = s.gx - H * 1.25 + i * winW * 1.12;
    const y0 = s.gy - H * 1.02;
    if (x0 + winW < 0) continue;
    const wg = c.createLinearGradient(0, y0, 0, y0 + H * 0.5);
    wg.addColorStop(0, 'rgba(255,240,205,0.75)');
    wg.addColorStop(1, 'rgba(255,210,140,0.25)');
    c.fillStyle = wg;
    c.fillRect(x0, y0, winW, H * 0.5);
    c.fillStyle = 'rgba(40,26,10,0.85)';
    c.fillRect(x0 + winW / 2 - H * 0.006, y0, H * 0.012, H * 0.5);
    c.fillRect(x0, y0 + H * 0.25 - H * 0.006, winW, H * 0.012);
    // Palm tops through the glass
    c.fillStyle = 'rgba(60,38,14,0.55)';
    c.beginPath();
    const px = x0 + winW * (0.3 + 0.25 * i);
    const py = y0 + H * 0.2;
    c.moveTo(px, y0 + H * 0.5);
    c.quadraticCurveTo(px + H * 0.02, py + H * 0.12, px + H * 0.01, py);
    c.lineTo(px + H * 0.02, py);
    c.quadraticCurveTo(px + H * 0.035, py + H * 0.12, px + H * 0.02, y0 + H * 0.5);
    for (let f = 0; f < 6; f++) {
      const a = -Math.PI / 2 + (f - 2.5) * 0.55;
      c.moveTo(px + H * 0.015, py);
      c.quadraticCurveTo(
        px + H * 0.015 + Math.cos(a) * H * 0.07,
        py + Math.sin(a) * H * 0.07 - H * 0.02,
        px + H * 0.015 + Math.cos(a) * H * 0.11,
        py + Math.sin(a) * H * 0.05 + H * 0.03
      );
    }
    c.lineWidth = H * 0.008;
    c.strokeStyle = 'rgba(60,38,14,0.55)';
    c.stroke();
    c.fill();
    c.strokeStyle = 'rgba(40,26,10,0.9)';
    c.lineWidth = H * 0.012;
    c.strokeRect(x0, y0, winW, H * 0.5);
  }
  // Dumbbell rack along the back wall
  c.fillStyle = 'rgba(22,14,6,0.8)';
  const rackL = s.gx - H * 1.4;
  const rackR = s.mirrorL - H * 0.05;
  c.fillRect(rackL, wallBase - H * 0.16, rackR - rackL, H * 0.018);
  c.fillRect(rackL, wallBase - H * 0.06, rackR - rackL, H * 0.018);
  for (let x = rackL + H * 0.05; x < rackR - H * 0.04; x += H * 0.075) {
    for (const yy of [wallBase - H * 0.16, wallBase - H * 0.06]) {
      c.beginPath();
      ellipse(c, x - H * 0.02, yy - H * 0.022, H * 0.022, H * 0.026);
      ellipse(c, x + H * 0.02, yy - H * 0.022, H * 0.022, H * 0.026);
      c.fill();
      c.fillRect(x - H * 0.02, yy - H * 0.026, H * 0.04, H * 0.008);
    }
  }
  // Floor: worn boards with the window light pooled on them
  const fg = c.createLinearGradient(0, wallBase, 0, h);
  fg.addColorStop(0, '#3a2810');
  fg.addColorStop(0.4, '#24180a');
  fg.addColorStop(1, '#0e0904');
  c.fillStyle = fg;
  c.fillRect(0, wallBase, w, h - wallBase);
  c.strokeStyle = 'rgba(255,214,150,0.08)';
  c.lineWidth = 1;
  for (let i = 1; i < 9; i++) {
    const y = wallBase + (h - wallBase) * Math.pow(i / 9, 1.6);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  const pool = c.createRadialGradient(s.gx, s.gy, 0, s.gx, s.gy, H * 0.6);
  pool.addColorStop(0, 'rgba(255,214,150,0.28)');
  pool.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = pool;
  c.save();
  c.translate(s.gx, s.gy);
  c.scale(1, 0.18);
  c.translate(-s.gx, -s.gy);
  c.fillRect(s.gx - H * 0.6, s.gy - H * 0.6, H * 1.2, H * 1.2);
  c.restore();
  // Mirror glass: a darker, cooler copy of the room
  const mg = c.createLinearGradient(s.mirrorL, 0, s.mirrorR, 0);
  mg.addColorStop(0, '#5b4422');
  mg.addColorStop(0.5, '#3a2a14');
  mg.addColorStop(1, '#1c1309');
  c.fillStyle = mg;
  c.fillRect(s.mirrorL, s.mirrorTop, s.mirrorR - s.mirrorL, s.gy + H * 0.02 - s.mirrorTop);
  c.drawImage(
    halftone(env, w, h, Math.max(5, H * 0.012), 45, 'rgba(255,227,163,0.18)', (t) => {
      const r = t.createRadialGradient(s.mirrorPlane * 2 - s.gx, s.gy - H * 0.62, 0, s.mirrorPlane * 2 - s.gx, s.gy - H * 0.62, H * 0.6);
      r.addColorStop(0, 'rgba(255,255,255,0.8)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      t.fillStyle = r;
      t.fillRect(s.mirrorL, s.mirrorTop, s.mirrorR - s.mirrorL, h);
    }),
    0,
    0,
    w,
    h
  );
  return cv;
}

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.portrait = h > w * 1.05;
  s.H = s.portrait ? Math.min(h * 0.62, w * 0.78) : Math.min(h * 0.8, w * 0.6);
  s.gy = h * (s.portrait ? 0.86 : 0.93);
  s.gx = s.portrait ? w * 0.34 : w * 0.38;
  s.mirrorPlane = s.gx + s.H * 0.4;
  s.mirrorL = s.gx + s.H * 0.3;
  s.mirrorR = Math.min(w + 4, s.gx + s.H * 1.15);
  s.mirrorTop = s.gy - s.H * 1.18;
  s.bg = buildBackground(s, env);
}

function startRep(s: State) {
  if (s.phase !== 'curl') return;
  s.touchedRep = true;
  if (s.repT < 0) {
    s.repT = 0;
    s.peaked = false;
  } else s.queued = Math.min(2, s.queued + 1);
}

function drawScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const rm = env.reducedMotion;
  const H = s.H;
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

  // Window light shafts and drifting chalk
  rays(ctx, s.gx - H * 1.05, s.gy - H * 1.0, [18, 26, 34, 42, 50], 5, H * 1.9, 'rgba(255,236,190,0.9)', 0.16);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of s.motes) {
    if (m.life <= 0) continue;
    const a = Math.min(1, m.life / m.max * 2) * 0.5;
    ctx.fillStyle = `rgba(255,226,170,${a})`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const posing = s.phase === 'pose';
  const breath = Math.sin(t * 1.6) * (rm ? 0 : 1);
  const pump = s.pumpShown;
  let figBox: { x: number; y: number; w: number; h: number };

  if (!posing) {
    const body: Body = {
      H,
      gx: s.gx,
      gy: s.gy,
      lean: -0.025 * Math.max(s.nearF, s.farF) + breath * 0.004,
      breath: breath * 0.5 + 0.5,
      pump,
      near: armPose(0, 0, 0, H),
      far: armPose(0, 0, 0, H),
    };
    const [nsx, nsy] = shoulderOf(body, false);
    const [fsx, fsy] = shoulderOf(body, true);
    body.near = armPose(nsx, nsy, s.nearF, H);
    body.far = armPose(fsx, fsy, s.farF, H);
    figBox = { x: s.gx - H * 0.3, y: s.gy - H * 1.08, w: H * 0.62, h: H * 1.12 };

    // Far arm, behind the torso
    paintFigure(
      s.far,
      env,
      figBox,
      (c) => {
        part(c, () => dumbbell(c, body.far, H, 'far'));
        part(c, () => dumbbell(c, body.far, H, 'bar'));
        part(c, () => dumbbell(c, body.far, H, 'near'));
        part(c, () => upperArm(c, body.far, H, pump));
        part(c, () => forearm(c, body.far, H, pump));
        part(c, () => ellipse(c, fsx, fsy + H * 0.01, H * 0.05, H * 0.055));
      },
      FAR_RIM
    );
    // Torso, legs and head
    paintFigure(
      s.body,
      env,
      figBox,
      (c) => {
        drawLegsAndTorso(c, body);
        drawHead(c, body);
      },
      RIM,
      (c) => profileAccents(c, body)
    );
    // Near arm with its dumbbell, on top so the rim separates it from the chest
    paintFigure(
      s.arm,
      env,
      figBox,
      (c) => {
        part(c, () => dumbbell(c, body.near, H, 'far'));
        part(c, () => ellipse(c, nsx + H * 0.004, nsy + H * 0.012, H * 0.055, H * 0.06, 0.3));
        part(c, () => upperArm(c, body.near, H, pump));
        part(c, () => forearm(c, body.near, H, pump));
      },
      ARM_RIM,
      (c) => armAccents(c, body.near, H, pump)
    );
    // Reflection first, behind the glass streaks
    drawMirror(s, env, () => {
      compositeFigure(ctx, s.far, env, FAR_RIM, 1);
      compositeFigure(ctx, s.body, env, { ...RIM, haloAlpha: 0 }, 1);
      compositeFigure(ctx, s.arm, env, ARM_RIM, 1);
      drawDumbbellNear(ctx, body.near, H);
    });
    compositeFigure(ctx, s.far, env, FAR_RIM);
    compositeFigure(ctx, s.body, env, RIM);
    compositeFigure(ctx, s.arm, env, ARM_RIM);
    drawDumbbellNear(ctx, body.near, H);
    drawDumbbellNear(ctx, body.far, H, true);
  } else {
    const k = s.poseT < 0.2 ? 0 : easeOutCubic(clamp((s.poseT - 0.2) / 0.45, 0, 1));
    const cx = s.gx + H * 0.04;
    figBox = { x: cx - H * 0.5, y: s.gy - H * 1.12, w: H * 1.0, h: H * 1.16 };
    const shake = rm ? 0 : Math.sin(t * 40) * H * 0.0012 * k;
    paintFigure(
      s.body,
      env,
      figBox,
      (c) => frontBody(c, H, cx + shake, s.gy, k, pump, breath * 0.5 + 0.5),
      RIM,
      (c) => frontAccents(c, H, cx + shake, s.gy, k, pump)
    );
    drawMirror(s, env, () => compositeFigure(ctx, s.body, env, { ...RIM, haloAlpha: 0 }, 1));
    compositeFigure(ctx, s.body, env, RIM);
  }

  // Camera flashes
  for (const f of s.flashes) {
    if (f.age < 0 || f.age > 0.35) continue;
    const a = 1 - f.age / 0.35;
    const r = f.size * (0.6 + f.age * 2);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.15, `rgba(255,250,235,${a * 0.8})`);
    g.addColorStop(0.45, `rgba(255,236,190,${a * 0.22})`);
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    ctx.restore();
  }

  vignette(ctx, w, h, 0.78, 0.5);
  // Sepia print finish
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(190,140,70,0.35)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  grain(ctx, w, h, 0.08);

  if (s.white > 0) {
    ctx.fillStyle = `rgba(255,250,236,${s.white})`;
    ctx.fillRect(0, 0, w, h);
  }
  drawHud(s, env);
}

function drawDumbbellNear(ctx: CanvasRenderingContext2D, p: ArmPose, H: number, far = false) {
  // Iron heads catch the window light; the handle shows between them
  ctx.save();
  ctx.lineCap = 'round';
  if (!far) {
    ctx.fillStyle = '#1a120a';
    ctx.beginPath();
    dumbbell(ctx, p, H, 'bar');
    ctx.fill();
  }
  const dx = -0.052 * H;
  const dy = 0.01 * H;
  const x = p.hx + (far ? -dx : dx);
  const y = p.hy + (far ? -dy : dy);
  if (!far) {
    const g = ctx.createLinearGradient(x - H * 0.03, y - H * 0.04, x + H * 0.03, y + H * 0.04);
    g.addColorStop(0, '#5d4526');
    g.addColorStop(0.5, '#1e150b');
    g.addColorStop(1, '#0c0804');
    ctx.fillStyle = g;
    ctx.beginPath();
    ellipse(ctx, x, y, H * 0.031, H * 0.041);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,180,0.65)';
    ctx.lineWidth = Math.max(1, H * 0.003);
    ctx.beginPath();
    ctx.ellipse(x, y, H * 0.031, H * 0.041, 0, Math.PI * 0.95, Math.PI * 1.75);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,232,180,0.22)';
    ctx.beginPath();
    ellipse(ctx, x, y, H * 0.016, H * 0.022);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMirror(s: State, env: SceneEnv, reflect: () => void) {
  const { ctx } = env;
  const H = s.H;
  const top = s.mirrorTop;
  const bottom = s.gy + H * 0.02;
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.mirrorL, top, s.mirrorR - s.mirrorL, bottom - top);
  ctx.clip();
  // Reflection: mirrored about the glass plane, a step further back, dimmer and cooler
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(s.mirrorPlane * 2, 0);
  ctx.scale(-1, 1);
  const sc = 0.95;
  ctx.translate(s.gx, s.gy);
  ctx.scale(sc, sc);
  ctx.translate(-s.gx, -s.gy);
  reflect();
  ctx.restore();
  ctx.fillStyle = 'rgba(90,60,25,0.22)';
  ctx.fillRect(s.mirrorL, top, s.mirrorR - s.mirrorL, bottom - top);
  // Glass streaks
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,236,200,0.06)';
  for (const [o, wd] of [
    [0.15, 0.1],
    [0.42, 0.04],
    [0.6, 0.14],
  ]) {
    const x = s.mirrorL + (s.mirrorR - s.mirrorL) * o;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + H * wd, top);
    ctx.lineTo(x + H * wd - H * 0.3, bottom);
    ctx.lineTo(x - H * 0.3, bottom);
    ctx.fill();
  }
  ctx.restore();
  // Frame
  ctx.save();
  ctx.strokeStyle = '#120b04';
  ctx.lineWidth = H * 0.022;
  ctx.strokeRect(s.mirrorL, top, s.mirrorR - s.mirrorL + H * 0.05, bottom - top);
  ctx.strokeStyle = 'rgba(255,214,140,0.35)';
  ctx.lineWidth = Math.max(1, H * 0.003);
  ctx.strokeRect(s.mirrorL + H * 0.011, top + H * 0.011, s.mirrorR - s.mirrorL, bottom - top - H * 0.022);
  ctx.restore();
}

/** Contours and form shading on the profile body */
function profileAccents(c: CanvasRenderingContext2D, b: Body) {
  const { H } = b;
  const { R, X, Y } = profileBody(b);
  const pts = (...uv: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < uv.length; i += 2) out.push(...R(uv[i], uv[i + 1]));
    return out;
  };
  // Light falling on the chest and quads from the windows
  const shade = (u: number, v: number, r: number, a: number) => {
    const [x, y] = R(u, v);
    const g = c.createRadialGradient(x, y, 0, x, y, r * H);
    g.addColorStop(0, `rgba(255,210,140,${a})`);
    g.addColorStop(1, 'rgba(255,210,140,0)');
    c.fillStyle = g;
    c.fillRect(x - r * H, y - r * H, r * H * 2, r * H * 2);
  };
  shade(0.06, 0.73, 0.09, 0.2);
  shade(0.04, 0.58, 0.06, 0.1);
  shade(-0.07, 0.62, 0.07, 0.1);
  shade(-0.04, 0.48, 0.06, 0.1);
  const sq = (u: number, v: number, r: number, a: number) => {
    const x = X(u);
    const y = Y(v);
    const g = c.createRadialGradient(x, y, 0, x, y, r * H);
    g.addColorStop(0, `rgba(255,210,140,${a})`);
    g.addColorStop(1, 'rgba(255,210,140,0)');
    c.fillStyle = g;
    c.fillRect(x - r * H, y - r * H, r * H * 2, r * H * 2);
  };
  sq(0.04, 0.44, 0.07, 0.14);
  sq(0.0, 0.2, 0.05, 0.1);
  c.strokeStyle = 'rgba(255,226,170,0.3)';
  c.lineWidth = Math.max(1, H * 0.0035);
  c.beginPath();
  // Pec underline into the armpit, abs along the front, serratus, lat edge
  smoothOpen(c, pts(0.1, 0.68, 0.05, 0.67, 0.0, 0.7, -0.03, 0.74));
  for (let i = 0; i < 4; i++) {
    const v = 0.66 - i * 0.04;
    smoothOpen(c, pts(0.078 - i * 0.004, v, 0.05 - i * 0.003, v - 0.006));
  }
  for (let i = 0; i < 3; i++) smoothOpen(c, pts(0.035, 0.66 - i * 0.026, 0.012, 0.65 - i * 0.026));
  smoothOpen(c, pts(-0.06, 0.74, -0.05, 0.64, -0.03, 0.56));
  // Glute and hamstring tie in, quad sweep, calf
  smoothOpen(c, [X(-0.08), Y(0.44), X(-0.04), Y(0.42), X(-0.01), Y(0.44)]);
  smoothOpen(c, [X(-0.03), Y(0.5), X(0.0), Y(0.42), X(0.0), Y(0.33)]);
  smoothOpen(c, [X(0.04), Y(0.33), X(0.05), Y(0.3)]);
  smoothOpen(c, [X(-0.03), Y(0.26), X(-0.02), Y(0.18), X(0.0), Y(0.13)]);
  // Trunks waistband and leg line
  c.stroke();
  c.fillStyle = 'rgba(6,3,1,0.55)';
  c.beginPath();
  smoothClosed(c, pts(-0.1, 0.545, 0.07, 0.55, 0.075, 0.5, 0.065, 0.455, -0.02, 0.43, -0.105, 0.44, -0.115, 0.5));
  c.fill();
  // Ear and brow
  const [hx, hy] = headPoint(b);
  c.strokeStyle = 'rgba(255,226,170,0.28)';
  c.beginPath();
  c.ellipse(hx - H * 0.004, hy + H * 0.002, H * 0.009, H * 0.015, 0, -1.2, 1.9);
  c.moveTo(hx + H * 0.03, hy - H * 0.012);
  c.lineTo(hx + H * 0.05, hy - H * 0.016);
  c.stroke();
  // Hair: swept back from a side part, full over the ears, flicked at the nape
  const hp = (pts: readonly number[]) => pts.map((v, i) => (i % 2 ? hy - v * H : hx + v * H));
  c.strokeStyle = 'rgba(255,226,170,0.34)';
  c.lineWidth = Math.max(0.8, H * 0.0028);
  c.beginPath();
  smoothOpen(c, hp([0.04, 0.05, 0.02, 0.078, -0.02, 0.084, -0.055, 0.064, -0.07, 0.02]));
  smoothOpen(c, hp([0.03, 0.044, 0.006, 0.068, -0.03, 0.07, -0.058, 0.04, -0.066, -0.01, -0.06, -0.044]));
  smoothOpen(c, hp([0.012, 0.036, -0.012, 0.05, -0.04, 0.042, -0.052, 0.0, -0.05, -0.036]));
  smoothOpen(c, hp([-0.012, 0.026, -0.026, 0.014, -0.03, -0.012]));
  c.stroke();
  c.strokeStyle = 'rgba(255,236,196,0.5)';
  c.beginPath();
  smoothOpen(c, hp([0.044, 0.046, 0.03, 0.04, 0.012, 0.034, -0.008, 0.022, -0.014, 0.0, -0.018, -0.012]));
  c.stroke();
}

function armAccents(c: CanvasRenderingContext2D, p: ArmPose, H: number, pump: number) {
  // Biceps belly catches the light; the split from the triceps runs down the arm
  const mx = lerp(p.sx, p.ex, 0.55);
  const my = lerp(p.sy, p.ey, 0.55);
  const ux = (p.ex - p.sx) / (0.19 * H);
  const uy = (p.ey - p.sy) / (0.19 * H);
  // Front normal of the upper arm (towards the biceps)
  const nx = uy;
  const ny = -ux;
  const bx = mx + nx * H * 0.03;
  const by = my + ny * H * 0.03;
  const g = c.createRadialGradient(bx, by - H * 0.01, 0, bx, by, H * (0.05 + 0.02 * pump));
  g.addColorStop(0, `rgba(255,214,150,${0.16 + 0.22 * pump})`);
  g.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = g;
  c.fillRect(bx - H * 0.1, by - H * 0.1, H * 0.2, H * 0.2);
  c.lineWidth = Math.max(1, H * 0.0032);
  c.strokeStyle = 'rgba(255,226,170,0.3)';
  c.beginPath();
  // Delt cap and biceps / triceps split
  c.moveTo(p.sx + nx * H * 0.05 + ux * H * 0.02, p.sy + ny * H * 0.05 + uy * H * 0.02);
  c.quadraticCurveTo(p.sx + ux * H * 0.07, p.sy + uy * H * 0.07, p.sx - nx * H * 0.045 + ux * H * 0.06, p.sy - ny * H * 0.045 + uy * H * 0.06);
  c.moveTo(lerp(p.sx, p.ex, 0.38) - nx * H * 0.006, lerp(p.sy, p.ey, 0.38) - ny * H * 0.006);
  c.lineTo(lerp(p.sx, p.ex, 0.86) - nx * H * 0.004, lerp(p.sy, p.ey, 0.86) - ny * H * 0.004);
  c.stroke();
  if (pump > 0.15) {
    // Veins rise with the pump: the cephalic vein over the biceps, branches over the forearm
    c.strokeStyle = `rgba(255,236,196,${Math.min(0.75, (pump - 0.15) * 0.9)})`;
    c.lineWidth = Math.max(0.8, H * (0.0022 + 0.0016 * pump));
    c.beginPath();
    const vx = (t: number, o: number) => lerp(p.sx, p.ex, t) + nx * H * o;
    const vy = (t: number, o: number) => lerp(p.sy, p.ey, t) + ny * H * o;
    smoothOpen(c, [vx(0.3, 0.02), vy(0.3, 0.02), vx(0.5, 0.034), vy(0.5, 0.034), vx(0.7, 0.03), vy(0.7, 0.03), vx(0.95, 0.018), vy(0.95, 0.018)]);
    const fnx = p.fy;
    const fny = -p.fx;
    const fx = (t: number, o: number) => lerp(p.ex, p.wx, t) + fnx * H * o;
    const fy = (t: number, o: number) => lerp(p.ey, p.wy, t) + fny * H * o;
    smoothOpen(c, [fx(0.05, 0.016), fy(0.05, 0.016), fx(0.35, 0.02), fy(0.35, 0.02), fx(0.6, 0.008), fy(0.6, 0.008), fx(0.9, 0.006), fy(0.9, 0.006)]);
    smoothOpen(c, [fx(0.35, 0.02), fy(0.35, 0.02), fx(0.55, 0.026), fy(0.55, 0.026), fx(0.8, 0.014), fy(0.8, 0.014)]);
    c.stroke();
  }
}

function drawHud(s: State, env: SceneEnv) {
  const { ctx, w, h } = env;
  const u = Math.min(w, h);
  const fs = Math.max(9, Math.round(u * 0.028));
  const pad = Math.round(u * 0.04);
  chip(ctx, `REPS ${String(s.reps).padStart(2, '0')}`, pad, pad, fs, '#ffe7b0', 'rgba(20,12,4,0.6)');
  if (s.sets > 0) chip(ctx, `PUMPS ${s.sets}`, pad, pad + fs * 2.2, fs, '#ffe7b0', 'rgba(20,12,4,0.6)');
  // Pump meter: a vertical tube on the right
  const mh = h * 0.42;
  const mw = Math.max(8, u * 0.025);
  const mx = w - pad - mw;
  const my = pad + fs * 2.4;
  ctx.save();
  ctx.fillStyle = 'rgba(20,12,4,0.6)';
  ctx.beginPath();
  ctx.roundRect(mx - 3, my - 3, mw + 6, mh + 6, mw);
  ctx.fill();
  const fill = clamp(s.pumpShown, 0, 1);
  const g = ctx.createLinearGradient(0, my + mh, 0, my);
  g.addColorStop(0, '#a3621c');
  g.addColorStop(0.6, '#f0b04a');
  g.addColorStop(1, '#fff0c4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(mx, my + mh * (1 - fill), mw, mh * fill, mw / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,231,176,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const y = my + (mh * i) / 10;
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx + mw * 0.35, y);
    ctx.stroke();
  }
  ctx.font = `700 ${fs}px ${MONO}`;
  ctx.fillStyle = '#ffe7b0';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('PUMP', w - pad, pad);
  ctx.restore();
  if (s.toastAge >= 0) {
    const long = s.toast.length > 10;
    const size = Math.max(14, Math.min(u * (long ? 0.06 : 0.085), (w * 0.86) / (s.toast.length * 0.62)));
    callout(ctx, s.toast, w * 0.5, h - pad - size * 0.7, size, s.toastAge, s.phase === 'pose' ? 2.4 : 1.1, '#fff1cf', '#ffbf5c', env.reducedMotion);
  }
  if (!s.touchedRep && env.interactive && s.reps === 0) {
    ctx.save();
    ctx.font = `600 ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,231,176,0.8)';
    ctx.fillText('CLICK OR SPACE FOR A REP', w / 2, h - pad);
    ctx.restore();
  }
}

type S = State;

function setToast(s: S, text: string) {
  s.toast = text;
  s.toastAge = 0;
}

function beginPose(s: S, env: SceneEnv) {
  s.phase = 'pose';
  s.poseT = 0;
  s.poseDone = false;
  s.white = env.reducedMotion ? 0.5 : 1;
  s.flashCd = 0.25;
  s.sets += 1;
  setToast(s, 'FRONT DOUBLE BICEPS');
  const bus = env.audio();
  if (bus) {
    shutter(bus);
    roar(bus, 2.6, 0.1);
  }
}

function popFlash(s: S, env: SceneEnv) {
  const { w, h } = env;
  const fromLeft = Math.random() < 0.5;
  s.flashes.push({
    x: fromLeft ? rand(-0.02, 0.3) * w : rand(0.6, 1.02) * w,
    y: rand(0.55, 1.0) * h,
    age: 0,
    size: Math.min(w, h) * rand(0.18, 0.32),
  });
  if (s.flashes.length > 10) s.flashes.shift();
  s.white = Math.max(s.white, env.reducedMotion ? 0.08 : 0.22);
  const bus = env.audio();
  if (bus) shutter(bus);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<S>(container, opts, {
    posterTime: 2,
    cursor: 'pointer',
    init: () => ({
      phase: 'curl',
      repT: -1,
      repSide: 0,
      queued: 0,
      peaked: false,
      nearF: 0,
      farF: 0,
      pump: 0.15,
      pumpShown: 0.15,
      reps: 0,
      sets: 0,
      idle: 0,
      poseT: 0,
      poseDone: false,
      flashes: [],
      flashCd: 0,
      white: 0,
      toast: '',
      toastAge: -1,
      demoCd: 0.4,
      keyHeld: false,
      breath: 0,
      motes: makeMotes(40),
      moteAcc: 0,
      H: 1,
      gx: 0,
      gy: 0,
      mirrorL: 0,
      mirrorR: 0,
      mirrorTop: 0,
      mirrorPlane: 0,
      portrait: false,
      bg: null,
      body: makeFigureLayer(),
      far: makeFigureLayer(),
      arm: makeFigureLayer(),
      touchedRep: false,
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt) => {
      const rm = env.reducedMotion;
      const poster = !env.interactive && rm;
      if (poster) {
        // Still frame: the top of a near arm rep with a good pump in the mirror
        s.phase = 'curl';
        s.nearF = 0.72;
        s.farF = 0;
        s.pump = s.pumpShown = 0.8;
        s.reps = 8;
        s.toastAge = -1;
        return;
      }
      if (!env.interactive) {
        s.demoCd -= dt;
        if (s.demoCd <= 0) {
          s.demoCd = s.phase === 'pose' ? 0.5 : 1.25;
          startRep(s);
        }
      }
      s.idle += dt;
      if (s.toastAge >= 0) s.toastAge += dt;
      if (s.toastAge > 3) s.toastAge = -1;
      s.white = Math.max(0, s.white - dt * (rm ? 1.5 : 3.2));
      for (const f of s.flashes) f.age += dt;

      if (s.phase === 'curl') {
        if (s.repT >= 0) {
          s.idle = 0;
          s.repT += dt;
          const f = repCurve(s.repT);
          if (s.repSide === 0) s.nearF = f;
          else s.farF = f;
          if (!s.peaked && s.repT >= REP_UP) {
            s.peaked = true;
            s.reps += 1;
            s.pump = Math.min(1, s.pump + PUMP_STEP);
            const bus = env.audio();
            if (bus) {
              tone(bus, 220 + s.pump * 330, { type: 'triangle', attack: 0.01, decay: 0.25, gain: 0.07 });
              swell(bus, { attack: 0.03, hold: 0.05, release: 0.25, gain: 0.05, type: 'lowpass', freq: 600 });
            }
            if (s.pump >= 1) setToast(s, 'FULL PUMP');
          }
          if (s.repT >= REP_T) {
            s.repT = -1;
            if (s.repSide === 0) s.nearF = 0;
            else s.farF = 0;
            s.repSide = 1 - s.repSide;
            const bus = env.audio();
            if (bus) clank(bus, 520, 0.03);
            if (s.pump >= 1) beginPose(s, env);
            else if (s.queued > 0) {
              s.queued -= 1;
              s.repT = 0;
              s.peaked = false;
            }
          }
          if (rm) env.wake(300);
        } else if (s.idle > 3) {
          s.pump = Math.max(0.15, s.pump - dt * 0.03);
        }
      } else {
        s.poseT += dt;
        if (rm) env.wake(300);
        s.flashCd -= dt;
        if (s.flashCd <= 0 && s.poseT > 0.4 && s.poseT < POSE_T - 0.3) {
          s.flashCd = rand(0.12, 0.45) * (rm ? 3 : 1);
          popFlash(s, env);
        }
        if (s.poseT >= POSE_T) {
          s.phase = 'curl';
          s.white = rm ? 0.4 : 0.9;
          s.pump = 0.6;
          s.repT = -1;
          s.queued = 0;
          s.nearF = s.farF = 0;
          s.flashes.length = 0;
        }
      }
      s.pumpShown = damp(s.pumpShown, s.pump, 5, dt);

      if (!rm) {
        s.moteAcc += dt * 6;
        while (s.moteAcc >= 1) {
          s.moteAcc -= 1;
          spawnMote(s.motes, s.gx - s.H * rand(0.2, 1.2), s.gy - s.H * rand(0.3, 1.1), rand(4, 14), rand(-6, 6), rand(3, 6), rand(0.6, 1.8));
        }
        stepMotes(s.motes, dt, 0, 0.1);
      }
    },
    draw: (s, env, t) => drawScene(s, env, t),
    onPointerDown: (s, env) => {
      if (s.phase === 'pose') popFlash(s, env);
      else startRep(s);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !s.keyHeld) {
        if (s.phase === 'pose') popFlash(s, env);
        else startRep(s);
      }
      s.keyHeld = down;
      return true;
    },
    dispose: (s) => {
      freeFigureLayer(s.body);
      freeFigureLayer(s.far);
      freeFigureLayer(s.arm);
      if (s.bg) s.bg.width = s.bg.height = 0;
    },
  });
