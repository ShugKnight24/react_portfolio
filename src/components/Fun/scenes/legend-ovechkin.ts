import { createCanvasScene, clamp, damp, easeOutCubic, lerp, rand, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  DISPLAY,
  MONO,
  callout,
  chip,
  clank,
  compositeFigure,
  ellipse,
  freeFigureLayer,
  goalHorn,
  grain,
  halftone,
  ik2,
  limb,
  makeFigureLayer,
  makeMotes,
  massAlong,
  paintFigure,
  paintNumeral,
  part,
  rays,
  roar,
  smoothOpen,
  spawnMote,
  stepMotes,
  strokeNumeral,
  swell,
  thump,
  vignette,
} from './legends-iron-kit';
import type { FigureLayer, Mote, RimStyle } from './legends-iron-kit';

/**
 * Ovechkin: The Office. Power play, the left faceoff circle. A tribute silhouette of the big
 * right handed shooter waits facing the camera, stick on his right, the net to his left. Press
 * and the pass leaves the far point; hold to load the stick up over the right shoulder, let go
 * and it comes down through the ice: the shaft bows against the ice, the blade meets the puck
 * and the puck leaves as a streak. On time it beats the goalie high glove side (goal light, horn,
 * the knee slide); early pulls it wide, late runs it into the goalie's pad, way off fans on it.
 * The pass takes the same time every shift, and a closing ring at the blade shows when to swing.
 */

/* ---------- tuning ---------- */

const PASS_T = 1.05;
/** Downswing length; the blade meets the ice at IMPACT of the way through */
const SWING_T = 0.19;
const IMPACT = 0.55;
const LEAD = SWING_T * IMPACT;
const GOOD = 0.075;
const NEAR = 0.17;

const RIM: RimStyle = {
  ink: ['#170c1e', '#04060c'],
  key: '#eef7ff',
  kx: 2,
  ky: 1.8,
  back: '#ff3049',
  bx: -1.8,
  by: 0.4,
  backAlpha: 0.85,
  halo: '#d61a36',
  haloAlpha: 0.5,
  haloBlur: 18,
  bloom: 3,
};
const GOALIE_RIM: RimStyle = { ...RIM, ink: ['#0d0b14', '#03040a'], key: '#cfe3ff', haloAlpha: 0.25, haloBlur: 10, bloom: 0 };

type Outcome = 'goal' | 'wide' | 'save' | 'fanned' | 'missed';

/* ---------- the skater: front view, joints in body units, y up, x screen right ---------- */

interface J {
  hip: [number, number];
  hipL: [number, number];
  hipR: [number, number];
  kneeL: [number, number];
  kneeR: [number, number];
  ankleL: [number, number];
  ankleR: [number, number];
  neck: [number, number];
  shL: [number, number];
  shR: [number, number];
  elL: [number, number];
  elR: [number, number];
  hdL: [number, number];
  hdR: [number, number];
  head: [number, number];
  headTurn: number;
  /** Stick: the butt end, the heel and the blade direction (radians, y up) */
  butt: [number, number];
  heel: [number, number];
  blade: number;
  /** Shaft bow: positive bends the middle toward the left normal */
  flex: number;
  /** Screen right knee is down on the ice (knee slide) */
  kneeDown: number;
  /** Stick present */
  stick: number;
}

type V2 = [number, number];
const L2 = (a: V2, b: V2, k: number): V2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

function blendJ(a: J, b: J, k: number): J {
  const out = { ...a } as J;
  for (const key of Object.keys(a) as (keyof J)[]) {
    const va = a[key];
    const vb = b[key];
    if (Array.isArray(va) && Array.isArray(vb)) (out[key] as V2) = L2(va as V2, vb as V2, k);
    else (out[key] as number) = lerp(va as number, vb as number, k);
  }
  return out;
}

interface Key {
  hip: V2;
  tilt: number;
  top: V2;
  phi: number;
  look: number;
}

// Stick angle phi in degrees, y up, from the top hand toward the blade
const READY: Key = { hip: [0.0, 0.52], tilt: 0, top: [0.1, 0.56], phi: 246, look: 0.5 };
const WINDUP: Key = { hip: [-0.05, 0.55], tilt: 0.14, top: [-0.03, 0.8], phi: 148, look: 0.15 };
const STRIKE: Key = { hip: [0.05, 0.49], tilt: -0.12, top: [0.16, 0.47], phi: 240, look: -0.1 };
const FOLLOW: Key = { hip: [0.1, 0.54], tilt: -0.05, top: [0.24, 0.78], phi: 398, look: 0.6 };

function mixKey(a: Key, b: Key, k: number): Key {
  return { hip: L2(a.hip, b.hip, k), tilt: lerp(a.tilt, b.tilt, k), top: L2(a.top, b.top, k), phi: lerp(a.phi, b.phi, k), look: lerp(a.look, b.look, k) };
}

const ICE = 0.022;
const SHAFT = 0.58;

function solveSkater(k: Key, flexState: number): J {
  const tilt = k.tilt;
  const hip = k.hip;
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  // Torso axis leans with the tilt (positive tilt raises the screen left shoulder)
  const up: V2 = [-sa * 0.35, 1];
  const len = Math.hypot(up[0], up[1]);
  const ux = up[0] / len;
  const uy = up[1] / len;
  const neck: V2 = [hip[0] + ux * 0.33, hip[1] + uy * 0.33];
  const sw = 0.165;
  const shL: V2 = [neck[0] - ca * sw, neck[1] - 0.035 + sa * sw];
  const shR: V2 = [neck[0] + ca * sw, neck[1] - 0.035 - sa * sw];
  const hipL: V2 = [hip[0] - 0.085, hip[1] + sa * 0.05];
  const hipR: V2 = [hip[0] + 0.085, hip[1] - sa * 0.05];
  const ankleL: V2 = [-0.215, 0.075];
  const ankleR: V2 = [0.21, 0.075];
  const kl = ik2(hipL[0], hipL[1], ankleL[0], ankleL[1], 0.25, 0.26, -1);
  const kr = ik2(hipR[0], hipR[1], ankleR[0], ankleR[1], 0.25, 0.26, 1);
  // Stick from the top hand; the blade can't go through the ice, the shaft bows instead
  const phi = (k.phi * Math.PI) / 180;
  const top = k.top;
  let heel: V2 = [top[0] + Math.cos(phi) * SHAFT, top[1] + Math.sin(phi) * SHAFT];
  let bow = 0;
  if (heel[1] < ICE) {
    const pen = ICE - heel[1];
    heel = [heel[0] - pen * 0.35, ICE];
    bow = Math.min(0.09, pen * 1.4);
  }
  bow = Math.max(bow, flexState);
  const dir: V2 = [heel[0] - top[0], heel[1] - top[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const butt: V2 = [top[0] - (dir[0] / dl) * 0.05, top[1] - (dir[1] / dl) * 0.05];
  const bottom: V2 = [top[0] + (dir[0] / dl) * 0.23, top[1] + (dir[1] / dl) * 0.23];
  const arm = (sh: V2, hand: V2, side: number) => {
    const a = ik2(sh[0], sh[1], hand[0], hand[1], 0.18, 0.18, 1);
    const b = ik2(sh[0], sh[1], hand[0], hand[1], 0.18, 0.18, -1);
    const sc = (p: { x: number; y: number }) => (p.x - hip[0]) * side * 1.0 - p.y * 0.6;
    const e = sc(a) > sc(b) ? a : b;
    return [e.x, e.y] as V2;
  };
  const head: V2 = [neck[0] + ux * 0.1 + k.look * 0.012, neck[1] + uy * 0.1];
  return {
    hip,
    hipL,
    hipR,
    kneeL: [kl.x, kl.y],
    kneeR: [kr.x, kr.y],
    ankleL,
    ankleR,
    neck,
    shL,
    shR,
    elR: arm(shR, top, 1),
    elL: arm(shL, bottom, -1),
    hdR: top,
    hdL: bottom,
    head,
    headTurn: k.look,
    butt,
    heel,
    blade: Math.atan2(dir[1], dir[0]) - (58 * Math.PI) / 180,
    flex: bow,
    kneeDown: 0,
    stick: 1,
  };
}

/** The knee slide: down on the left knee, right skate planted, fist up */
function slidePose(x: number, pump: number): J {
  const hip: V2 = [x, 0.33];
  const neck: V2 = [x - 0.02, 0.66];
  const shL: V2 = [neck[0] - 0.165, neck[1] - 0.04];
  const shR: V2 = [neck[0] + 0.165, neck[1] - 0.03];
  const fist: V2 = [x - 0.27, 0.92 + 0.05 * pump];
  const elL: V2 = [x - 0.36, 0.7 + 0.03 * pump];
  const hdR: V2 = [x + 0.26, 0.4];
  const elR: V2 = [x + 0.29, 0.53];
  const top = hdR;
  const phi = (-28 * Math.PI) / 180;
  const heel: V2 = [top[0] + Math.cos(phi) * SHAFT, Math.max(ICE, top[1] + Math.sin(phi) * SHAFT)];
  return {
    hip,
    hipL: [x - 0.085, 0.34],
    hipR: [x + 0.085, 0.32],
    kneeL: [x - 0.22, 0.33],
    kneeR: [x + 0.13, 0.06],
    ankleL: [x - 0.23, 0.075],
    ankleR: [x + 0.17, 0.05],
    neck,
    shL,
    shR,
    elL,
    elR,
    hdL: fist,
    hdR,
    head: [neck[0] - 0.015, neck[1] + 0.1],
    headTurn: 0.9,
    butt: [top[0] - Math.cos(phi) * 0.05, top[1] - Math.sin(phi) * 0.05],
    heel,
    blade: phi - 0.6,
    flex: 0,
    kneeDown: 1,
    stick: 1,
  };
}

interface View {
  X: (u: number) => number;
  Y: (v: number) => number;
  W: (v: number) => number;
}

function drawSkater(c: CanvasRenderingContext2D, j: J, v: View) {
  const { X, Y, W } = v;
  const P = (p: V2): V2 => [X(p[0]), Y(p[1])];
  // Skates: boot and runner, toes turned out in the wide stance
  const skate = (a: V2, out: number) => {
    const [ax, ay] = P(a);
    part(c, () => ellipse(c, ax + out * W(0.008), ay + W(0.035), W(0.045), W(0.045)));
    part(c, () => {
      c.moveTo(ax - W(0.06), ay + W(0.06));
      c.lineTo(ax + W(0.06), ay + W(0.06));
      c.lineTo(ax + W(0.055), ay + W(0.078));
      c.lineTo(ax - W(0.058), ay + W(0.078));
      c.closePath();
    });
  };
  skate(j.ankleL, -1);
  if (j.kneeDown < 0.5) skate(j.ankleR, 1);
  // Socks over the shin pads
  const shin = (k: V2, a: V2) => part(c, () => limb(c, [[...P(k), W(0.05)], [...P(L2(k, a, 0.4)), W(0.058)], [...P(a), W(0.04)]]));
  shin(j.kneeL, j.ankleL);
  shin(j.kneeR, j.ankleR);
  // Breezers: big padded pants from the belt to just above the knee
  const pants = (h: V2, k: V2) =>
    part(c, () => limb(c, [[...P(h), W(0.1)], [...P(L2(h, k, 0.5)), W(0.092)], [...P(L2(h, k, 0.85)), W(0.074)], [...P(k), W(0.05)]]));
  pants(j.hipL, j.kneeL);
  pants(j.hipR, j.kneeR);
  part(c, () => ellipse(c, X(j.hip[0]), Y(j.hip[1] + 0.02), W(0.17), W(0.1), -Math.atan2(j.hipR[1] - j.hipL[1], j.hipR[0] - j.hipL[0])));
  // Sweater over shoulder pads, hem flared
  part(c, () =>
    massAlong(
      c,
      X(j.hip[0]),
      Y(j.hip[1] - 0.02),
      X(j.neck[0]),
      Y(j.neck[1]),
      [
        [0, W(0.175), W(0.175)],
        [0.2, W(0.16), W(0.16)],
        [0.5, W(0.155), W(0.155)],
        [0.78, W(0.18), W(0.18)],
        [0.92, W(0.15), W(0.15)],
        [1, W(0.06), W(0.06)],
      ],
      1
    )
  );
  for (const sh of [j.shL, j.shR]) part(c, () => ellipse(c, X(sh[0]), Y(sh[1] - 0.01), W(0.062), W(0.056)));
  // Neck and helmet
  part(c, () => limb(c, [[...P(j.neck), W(0.045)], [...P(j.head), W(0.04)]]));
  const [hx, hy] = P(j.head);
  part(c, () => ellipse(c, hx, hy - W(0.008), W(0.058), W(0.064)));
  part(c, () => ellipse(c, hx + W(0.012) * j.headTurn, hy + W(0.04), W(0.04), W(0.03)));
  // Arms with elbow pads, big gloves on the stick
  const arm = (sh: V2, el: V2, hd: V2) => {
    part(c, () => limb(c, [[...P(sh), W(0.058)], [...P(L2(sh, el, 0.5)), W(0.056)], [...P(el), W(0.05)]]));
    part(c, () => limb(c, [[...P(el), W(0.05)], [...P(L2(el, hd, 0.5)), W(0.046)], [...P(hd), W(0.042)]]));
    part(c, () => ellipse(c, X(hd[0]), Y(hd[1]), W(0.05), W(0.046)));
  };
  arm(j.shL, j.elL, j.hdL);
  arm(j.shR, j.elR, j.hdR);
}

/** Stick drawn on top: a bowed shaft and a curved blade */
function drawStick(ctx: CanvasRenderingContext2D, j: J, v: View, color: string, rim: string) {
  if (j.stick < 0.5) return;
  const { X, Y, W } = v;
  const [bx, by] = [X(j.butt[0]), Y(j.butt[1])];
  const [hx, hy] = [X(j.heel[0]), Y(j.heel[1])];
  const dx = hx - bx;
  const dy = hy - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = W(j.flex) * 1.1;
  const cx = (bx + hx) / 2 + nx * bow;
  const cy = (by + hy) / 2 + ny * bow;
  const ba = -j.blade;
  const tx = hx + Math.cos(ba) * W(0.1);
  const ty = hy + Math.sin(ba) * W(0.1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [col, wd] of [
    [rim, W(0.017)],
    [color, W(0.011)],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = wd;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx, cy, hx, hy);
    ctx.stroke();
    ctx.lineWidth = wd * 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(hx + Math.cos(ba) * W(0.06), hy + Math.sin(ba) * W(0.06) + W(0.008), tx, ty - W(0.006));
    ctx.stroke();
  }
  // Tape
  ctx.strokeStyle = 'rgba(240,246,255,0.75)';
  ctx.lineWidth = W(0.011);
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(ba) * W(0.02), hy + Math.sin(ba) * W(0.02));
  ctx.lineTo(hx + Math.cos(ba) * W(0.07), hy + Math.sin(ba) * W(0.07) + W(0.003));
  ctx.stroke();
  ctx.restore();
}

function skaterAccents(c: CanvasRenderingContext2D, j: J, v: View) {
  const { X, Y, W } = v;
  const P = (p: V2): V2 => [X(p[0]), Y(p[1])];
  // Sleeve and hem stripes, visor, the shoulder pad line
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(200,16,46,0.75)';
  c.lineWidth = W(0.026);
  c.beginPath();
  for (const [sh, el] of [
    [j.shL, j.elL],
    [j.shR, j.elR],
  ] as const) {
    const [ax, ay] = P(L2(sh, el, 0.62));
    const dx = X(el[0]) - X(sh[0]);
    const dy = Y(el[1]) - Y(sh[1]);
    const l = Math.hypot(dx, dy) || 1;
    c.moveTo(ax - (dy / l) * W(0.07), ay + (dx / l) * W(0.07));
    c.lineTo(ax + (dy / l) * W(0.07), ay - (dx / l) * W(0.07));
  }
  const hem = (o: number) => {
    const a = L2(j.hip, j.neck, o);
    const ax = j.neck[0] - j.hip[0];
    const ay = j.neck[1] - j.hip[1];
    const l = Math.hypot(ax, ay) || 1;
    c.moveTo(X(a[0] + (ay / l) * 0.2), Y(a[1] - (ax / l) * 0.2));
    c.lineTo(X(a[0] - (ay / l) * 0.2), Y(a[1] + (ax / l) * 0.2));
  };
  hem(0.08);
  c.stroke();
  c.strokeStyle = 'rgba(238,247,255,0.5)';
  c.lineWidth = W(0.008);
  c.beginPath();
  hem(0.17);
  c.stroke();
  c.strokeStyle = 'rgba(238,247,255,0.28)';
  c.lineWidth = Math.max(1, W(0.004));
  c.beginPath();
  // Shoulder caps under the sweater, breezer seams
  for (const sh of [j.shL, j.shR]) {
    const [sx, sy] = P(sh);
    c.moveTo(sx - W(0.06), sy + W(0.02));
    c.quadraticCurveTo(sx, sy - W(0.05), sx + W(0.06), sy + W(0.02));
  }
  for (const [h, k] of [
    [j.hipL, j.kneeL],
    [j.hipR, j.kneeR],
  ] as const) {
    smoothOpen(c, [...P(L2(h, k, 0.15)), ...P(L2(h, k, 0.75))]);
  }
  c.stroke();
  // Visor glint
  const [hx, hy] = P(j.head);
  const g = c.createLinearGradient(hx - W(0.05), hy, hx + W(0.05), hy);
  g.addColorStop(0, 'rgba(160,200,255,0.15)');
  g.addColorStop(0.5, 'rgba(230,245,255,0.55)');
  g.addColorStop(1, 'rgba(160,200,255,0.15)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(hx + W(0.008) * j.headTurn, hy + W(0.012), W(0.05), W(0.014), 0, 0, TAU);
  c.fill();
}

/* ---------- goalie: profile facing left, butterfly ready ---------- */

function drawGoalie(c: CanvasRenderingContext2D, x: number, y: number, s: number, react: number, reach: V2, drop: number) {
  // Facing left, toward the shooter; units of his size, y up from the ice
  const X = (u: number) => x + u * s;
  const Y = (v: number) => y - v * s;
  const W = (v: number) => v * s;
  const hipY = lerp(0.46, 0.3, drop);
  const kneeY = lerp(0.3, 0.07, drop);
  // Pads: the far leg a step back, then the near one; knees forward over the toes
  for (const o of [0.07, 0]) {
    const kx = -0.1 + o - drop * 0.06;
    part(c, () =>
      limb(c, [
        [X(0.04 + o + drop * 0.14), Y(0.035), W(0.07)],
        [X(kx), Y(kneeY), W(0.085)],
        [X(kx + 0.02), Y(kneeY + 0.1), W(0.08)],
      ])
    );
    part(c, () => limb(c, [[X(kx), Y(kneeY + 0.04), W(0.075)], [X(0.05 + o), Y(hipY), W(0.085)]]));
  }
  // Hunched torso in the chest protector, mask forward
  part(c, () =>
    massAlong(c, X(0.06), Y(hipY), X(-0.06), Y(hipY + 0.32), [[0, W(0.09), W(0.1)], [0.45, W(0.12), W(0.105)], [0.85, W(0.115), W(0.1)], [1, W(0.07), W(0.065)]], 1)
  );
  part(c, () => ellipse(c, X(-0.1), Y(hipY + 0.365), W(0.058), W(0.066)));
  // Blocker hand and stick paddle flat on the ice
  part(c, () => limb(c, [[X(-0.02), Y(hipY + 0.26), W(0.05)], [X(-0.14), Y(hipY + 0.06), W(0.045)]]));
  part(c, () => {
    c.moveTo(X(-0.2), Y(hipY + 0.12));
    c.lineTo(X(-0.11), Y(hipY + 0.12));
    c.lineTo(X(-0.11), Y(hipY - 0.02));
    c.lineTo(X(-0.2), Y(hipY - 0.02));
    c.closePath();
  });
  part(c, () => limb(c, [[X(-0.16), Y(hipY + 0.02), W(0.012)], [X(-0.24), Y(0.03), W(0.014)], [X(-0.38), Y(0.02), W(0.022)]]));
  // Glove: ready at the hip, then a late lunge for the corner
  const rx = lerp(-0.24, reach[0], react);
  const ry = lerp(hipY + 0.16, reach[1], react);
  const sx = -0.04;
  const sy = hipY + 0.28;
  part(c, () => limb(c, [[X(sx), Y(sy), W(0.05)], [X(lerp(sx, rx, 0.5) - 0.03), Y(lerp(sy, ry, 0.5) - 0.04 * (1 - react)), W(0.045)], [X(rx), Y(ry), W(0.04)]]));
  part(c, () => ellipse(c, X(rx - 0.02), Y(ry), W(0.085), W(0.07), -0.4 * react));
}

/* ---------- scene state ---------- */

interface Shot {
  kind: Outcome;
  t: number;
  dur: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  done: boolean;
}

interface State {
  wind: number;
  held: boolean;
  keyHeld: boolean;
  passT: number;
  swingT: number;
  releaseAt: number;
  err: number;
  shot: Shot | null;
  puckX: number;
  puckY: number;
  puckVis: boolean;
  puckHit: boolean;
  flex: number;
  flexV: number;
  goals: number;
  shots: number;
  streak: number;
  resultT: number;
  celebrate: number;
  goalLight: number;
  redWash: number;
  fade: number;
  shake: number;
  toast: string;
  sub: string;
  toastAge: number;
  toastGood: boolean;
  goalieReact: number;
  goalieReach: V2;
  goalieShift: number;
  goalieDrop: number;
  bulge: number;
  bulgeX: number;
  bulgeY: number;
  spray: Mote[];
  touched: boolean;
  demoT: number;
  demoN: number;
  posterSet: boolean;
  H: number;
  gx: number;
  gy: number;
  netX: number;
  netY: number;
  ns: number;
  portrait: boolean;
  bg: HTMLCanvasElement | null;
  fig: FigureLayer;
  goalie: FigureLayer;
}

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.portrait = h > w * 1.05;
  if (s.portrait) {
    s.H = Math.min(w * 0.46, h * 0.36);
    s.gx = w * 0.33;
    s.gy = h * 0.86;
    s.netX = w * 0.7;
    s.netY = s.gy - s.H * 0.62;
    s.ns = 0.68;
  } else {
    s.H = Math.min(h * 0.6, w * 0.34);
    s.gx = w * 0.31;
    s.gy = h * 0.9;
    s.netX = s.gx + s.H * 1.3;
    s.netY = s.gy - s.H * 0.24;
    s.ns = 0.8;
  }
  s.bg = buildBackground(s, env);
}

/** Puck strike point and pass origin, screen space */
function strikePoint(s: State): V2 {
  return [s.gx - s.H * 0.15, s.gy - s.H * (ICE + 0.012)];
}
function passFrom(s: State, env: SceneEnv): V2 {
  return s.portrait ? [env.w * 1.05, s.gy - s.H * 0.95] : [Math.min(env.w * 1.04, s.gx + s.H * 2.3), s.gy - s.H * 0.5];
}

interface NetGeo {
  nearBase: V2;
  farBase: V2;
  nearTop: V2;
  farTop: V2;
  back: number;
  goalTarget: V2;
  wideTarget: V2;
  saveTarget: V2;
  goalieX: number;
  goalieY: number;
  gs: number;
}

function netGeo(s: State): NetGeo {
  const S = s.H * s.ns;
  const nearBase: V2 = [s.netX, s.netY];
  const farBase: V2 = [s.netX + S * 0.14, s.netY - S * 0.3];
  const ph = S * 0.62;
  const nearTop: V2 = [nearBase[0], nearBase[1] - ph];
  const farTop: V2 = [farBase[0], farBase[1] - ph * 0.9];
  const gs = S * 0.74;
  return {
    nearBase,
    farBase,
    nearTop,
    farTop,
    back: S * 0.42,
    goalTarget: [lerp(nearTop[0], farTop[0], 0.85) - S * 0.01, lerp(nearTop[1], farTop[1], 0.85) + ph * 0.08],
    wideTarget: [farTop[0] + S * 0.28, farTop[1] - S * 0.18],
    saveTarget: [s.netX - S * 0.44, s.netY - S * 0.2],
    goalieX: s.netX - S * 0.2,
    goalieY: s.netY - S * 0.13,
    gs,
  };
}

function buildBackground(s: State, env: SceneEnv) {
  const { w, h } = env;
  const H = s.H;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * env.dpr));
  cv.height = Math.max(1, Math.round(h * env.dpr));
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const boards = s.portrait ? s.gy - H * 1.25 : s.gy - H * 0.62;
  // Arena: red into navy, like the poster
  const g = c.createRadialGradient(w * 0.48, boards - H * 0.2, 0, w * 0.48, boards, Math.max(w, h) * 0.85);
  g.addColorStop(0, '#8a0f26');
  g.addColorStop(0.35, '#2a0f2e');
  g.addColorStop(0.7, '#071633');
  g.addColorStop(1, '#020711');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Crowd behind the glass as halftone, the big 8 over it
  c.drawImage(
    halftone(env, w, h, Math.max(4, H * 0.016), 15, 'rgba(255,53,80,0.32)', (t) => {
      const r = t.createLinearGradient(0, boards - H * 0.9, 0, boards);
      r.addColorStop(0, 'rgba(255,255,255,0.15)');
      r.addColorStop(1, 'rgba(255,255,255,0.75)');
      t.fillStyle = r;
      for (let i = 0; i < 80; i++) {
        const x = (i / 80) * w + Math.sin(i * 12.9) * 8;
        const y = boards - H * (0.12 + 0.5 * ((i * 37) % 11) / 11);
        t.beginPath();
        t.arc(x, y, H * 0.05, 0, TAU);
        t.fill();
      }
    }),
    0,
    0,
    w,
    h
  );
  const size = Math.min(H * 1.7, h * 0.9);
  const nx = s.portrait ? w * 0.55 : w * 0.52;
  const ny = boards + size * 0.2;
  c.globalAlpha = 0.6;
  c.drawImage(halftone(env, w, h, Math.max(4, size * 0.02), 30, '#e8203d', (t) => paintNumeral(t, '8', nx, ny, size)), 0, 0, w, h);
  c.globalAlpha = 1;
  strokeNumeral(c, '8', nx, ny, size, '#ff8090', 0.45);
  // Glass and boards
  c.fillStyle = 'rgba(180,210,240,0.06)';
  c.fillRect(0, boards - H * 0.42, w, H * 0.42);
  c.strokeStyle = 'rgba(232,242,255,0.18)';
  c.lineWidth = 1;
  for (let x = 0; x < w; x += H * 0.45) {
    c.beginPath();
    c.moveTo(x, boards - H * 0.42);
    c.lineTo(x, boards);
    c.stroke();
  }
  c.fillStyle = '#040a16';
  c.fillRect(0, boards, w, H * 0.12);
  c.fillStyle = 'rgba(232,242,255,0.4)';
  c.fillRect(0, boards, w, Math.max(1, H * 0.006));
  c.fillStyle = 'rgba(200,16,46,0.5)';
  c.fillRect(0, boards + H * 0.09, w, H * 0.012);
  // Ice: cool white going blue into the distance
  const iceTop = boards + H * 0.12;
  const ig = c.createLinearGradient(0, iceTop, 0, h);
  ig.addColorStop(0, '#9fb8d6');
  ig.addColorStop(0.35, '#c9d9ec');
  ig.addColorStop(1, '#6f86a6');
  c.fillStyle = ig;
  c.fillRect(0, iceTop, w, h - iceTop);
  // Reflections of the lights in the ice
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const fx of [0.2, 0.5, 0.8]) {
    const rg = c.createRadialGradient(w * fx, iceTop + H * 0.08, 0, w * fx, iceTop + H * 0.08, H * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,0.18)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.fillRect(0, iceTop, w, h - iceTop);
  }
  c.restore();
  c.save();
  c.beginPath();
  c.rect(0, iceTop, w, h - iceTop);
  c.clip();
  // The left faceoff circle: his office
  c.strokeStyle = 'rgba(200,16,46,0.75)';
  c.lineWidth = Math.max(2, H * 0.012);
  const fcx = s.gx + H * 0.05;
  const fcy = s.gy - H * 0.1;
  c.beginPath();
  c.ellipse(fcx, fcy, H * 0.95, H * 0.2, 0, 0, TAU);
  c.stroke();
  c.beginPath();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = fcx + sx * H * 0.12;
      const y = fcy + sy * H * 0.2;
      c.moveTo(x, y);
      c.lineTo(x, y + sy * H * 0.05);
    }
  }
  c.stroke();
  c.fillStyle = 'rgba(200,16,46,0.85)';
  c.beginPath();
  c.ellipse(fcx, fcy, H * 0.05, H * 0.014, 0, 0, TAU);
  c.fill();
  // Goal line and crease
  const n = netGeo(s);
  c.strokeStyle = 'rgba(200,16,46,0.7)';
  c.lineWidth = Math.max(1.5, H * 0.008);
  const gdx = n.farBase[0] - n.nearBase[0];
  const gdy = n.farBase[1] - n.nearBase[1];
  c.beginPath();
  c.moveTo(n.nearBase[0] - gdx * 3, n.nearBase[1] - gdy * 3);
  c.lineTo(n.nearBase[0] + gdx * 4, n.nearBase[1] + gdy * 4);
  c.stroke();
  c.fillStyle = 'rgba(60,120,220,0.35)';
  c.beginPath();
  c.moveTo(n.nearBase[0], n.nearBase[1]);
  c.quadraticCurveTo(n.nearBase[0] - H * 0.45 * s.ns, (n.nearBase[1] + n.farBase[1]) / 2 + H * 0.05, n.farBase[0], n.farBase[1]);
  c.closePath();
  c.fill();
  c.restore();
  return cv;
}

function drawNetBack(ctx: CanvasRenderingContext2D, n: NetGeo, s: State) {
  const { nearBase: nb, farBase: fb, nearTop: nt, farTop: ft, back } = n;
  ctx.save();
  // Mesh: from the posts back to the rear frame
  const rb: V2 = [nb[0] + back, nb[1] - back * 0.05];
  const rf: V2 = [fb[0] + back * 0.85, fb[1] - back * 0.05];
  ctx.fillStyle = 'rgba(230,240,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(nt[0], nt[1]);
  ctx.lineTo(ft[0], ft[1]);
  ctx.quadraticCurveTo(rf[0], ft[1] + (rf[1] - ft[1]) * 0.3, rf[0], rf[1]);
  ctx.lineTo(rb[0], rb[1]);
  ctx.quadraticCurveTo(rb[0], nt[1] + (rb[1] - nt[1]) * 0.3, nt[0], nt[1]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,240,255,0.28)';
  ctx.lineWidth = 1;
  const bul = s.bulge;
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const a = L2(nt, ft, k);
    const b = L2(rb, rf, k);
    const pull = bul * Math.exp(-Math.pow((k - 0.75) * 4, 2)) * s.H * 0.08;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(b[0] + pull, a[1] + (b[1] - a[1]) * 0.3, b[0] + pull * 0.5, b[1]);
    ctx.stroke();
  }
  for (let i = 1; i <= 5; i++) {
    const k = i / 6;
    ctx.beginPath();
    ctx.moveTo(lerp(nt[0], rb[0], k), lerp(nt[1], rb[1], k * k));
    ctx.lineTo(lerp(ft[0], rf[0], k), lerp(ft[1], rf[1], k * k));
    ctx.stroke();
  }
  // Far post
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = s.H * s.ns * 0.022;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fb[0], fb[1]);
  ctx.lineTo(ft[0], ft[1]);
  ctx.stroke();
  ctx.restore();
}

function drawNetFront(ctx: CanvasRenderingContext2D, n: NetGeo, s: State) {
  const { nearBase: nb, nearTop: nt, farTop: ft } = n;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d4142f';
  ctx.lineWidth = s.H * s.ns * 0.028;
  ctx.beginPath();
  ctx.moveTo(nb[0], nb[1]);
  ctx.lineTo(nt[0], nt[1]);
  ctx.lineTo(ft[0], ft[1]);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,235,0.7)';
  ctx.lineWidth = Math.max(1, s.H * 0.005);
  ctx.beginPath();
  ctx.moveTo(nb[0] - s.H * 0.006, nb[1]);
  ctx.lineTo(nt[0] - s.H * 0.006, nt[1] + s.H * 0.01);
  ctx.stroke();
  ctx.restore();
}

/* ---------- interaction ---------- */

function toast(s: State, text: string, sub: string, good: boolean) {
  s.toast = text;
  s.sub = sub;
  s.toastAge = 0;
  s.toastGood = good;
}

function press(s: State, env: SceneEnv) {
  s.held = true;
  if (s.passT < 0 && !s.shot && s.celebrate <= 0 && s.fade <= 0) {
    s.touched = true;
    s.passT = 0;
    s.swingT = -1;
    s.puckVis = true;
    s.puckHit = false;
    const bus = env.audio();
    if (bus) swell(bus, { attack: 0.02, hold: 0.1, release: 0.2, gain: 0.05, type: 'highpass', freq: 2500 });
  }
}

function releaseStick(s: State, env: SceneEnv) {
  s.held = false;
  if (s.passT >= 0 && s.swingT < 0 && !s.shot) {
    s.swingT = 0;
    s.releaseAt = s.passT;
    s.err = s.passT + LEAD - PASS_T;
    const bus = env.audio();
    if (bus) swell(bus, { attack: 0.04, hold: 0.02, release: 0.12, gain: 0.06, type: 'bandpass', freq: 900, freqTo: 2400, q: 0.8 });
  }
}

function impact(s: State, env: SceneEnv) {
  const n = netGeo(s);
  const [px, py] = strikePoint(s);
  const e = s.err;
  let kind: Outcome;
  if (Math.abs(e) <= GOOD) kind = 'goal';
  else if (e < -NEAR || e > NEAR) kind = 'fanned';
  else kind = e < 0 ? 'wide' : 'save';
  // A weak half wind up can't beat him even on time
  if (kind === 'goal' && s.wind < 0.35) kind = 'save';
  s.shots += 1;
  s.flexV = -3;
  const bus = env.audio();
  const H = s.H;
  if (kind === 'fanned') {
    s.shot = { kind, t: 0, dur: 0.6, fx: s.puckX, fy: s.puckY, tx: s.puckX - H * 0.9, ty: s.puckY + H * 0.05, done: false };
    toast(s, e < 0 ? 'TOO EARLY' : 'TOO LATE', 'FANNED ON IT', false);
    s.streak = 0;
    if (bus) swell(bus, { attack: 0.01, hold: 0.02, release: 0.2, gain: 0.08, type: 'bandpass', freq: 600 });
    return;
  }
  const to = kind === 'goal' ? n.goalTarget : kind === 'wide' ? n.wideTarget : n.saveTarget;
  s.shot = { kind, t: 0, dur: 0.13 + s.ns * 0.02, fx: px, fy: py, tx: to[0], ty: to[1], done: false };
  s.shake = 1;
  for (let i = 0; i < 46; i++) {
    const a = rand(-2.6, -0.4);
    const sp = H * rand(0.6, 2.4);
    spawnMote(s.spray, px + rand(-1, 1) * H * 0.03, py, Math.cos(a) * sp + H * 0.6, Math.sin(a) * sp * 0.6, rand(0.3, 0.8), rand(1, 3.2));
  }
  if (bus) {
    swell(bus, { attack: 0.001, hold: 0.01, release: 0.09, gain: 0.32, type: 'highpass', freq: 1800 });
    swell(bus, { attack: 0.001, hold: 0.02, release: 0.18, gain: 0.22, type: 'bandpass', freq: 700, q: 1.2 });
    thump(bus, 110, 0.3);
  }
  s.goalieReach = kind === 'goal' ? [0.1, 0.72] : [-0.3, 0.35];
}

function arrive(s: State, env: SceneEnv) {
  const shot = s.shot;
  if (!shot) return;
  shot.done = true;
  const bus = env.audio();
  if (shot.kind === 'goal') {
    s.goals += 1;
    s.streak += 1;
    s.bulge = 1;
    s.bulgeX = shot.tx;
    s.bulgeY = shot.ty;
    s.goalLight = 1;
    s.redWash = 1;
    s.celebrate = 0.001;
    toast(s, 'GOAL', Math.abs(s.err) < 0.035 ? 'ONE TIMER · PERFECT' : 'ONE TIMER', true);
    if (bus) {
      goalHorn(bus, 2.2, 0.11);
      roar(bus, 3.2, 0.14);
    }
  } else if (shot.kind === 'wide') {
    toast(s, 'WIDE', 'A HAIR EARLY', false);
    s.streak = 0;
    if (bus) clank(bus, 820, 0.08);
  } else if (shot.kind === 'save') {
    toast(s, 'SAVE', 'A HAIR LATE', false);
    s.streak = 0;
    if (bus) thump(bus, 160, 0.18);
  }
}

function resetShift(s: State) {
  s.passT = -1;
  s.swingT = -1;
  s.shot = null;
  s.puckVis = false;
  s.wind = 0;
  s.celebrate = 0;
  s.goalieReact = 0;
  s.flex = 0;
  s.flexV = 0;
  s.resultT = 0;
}

function currentPose(s: State): J {
  if (s.celebrate > 0) {
    const k = clamp(s.celebrate / 0.3, 0, 1);
    const slide = easeOutCubic(clamp((s.celebrate - 0.1) / 1.4, 0, 1)) * 0.5;
    const pump = Math.abs(Math.sin(s.celebrate * 9));
    return blendJ(solveSkater(FOLLOW, 0), slidePose(slide, pump), k);
  }
  let key: Key;
  if (s.swingT >= 0) {
    const d = clamp(s.swingT / SWING_T, 0, 1);
    const top = mixKey(READY, WINDUP, s.wind);
    if (d < IMPACT) {
      const k = d / IMPACT;
      key = mixKey(top, STRIKE, k * k);
    } else {
      const k = (d - IMPACT) / (1 - IMPACT);
      key = mixKey(STRIKE, FOLLOW, easeOutCubic(k));
    }
    // Hold the follow through a moment, then settle back
    if (s.swingT > SWING_T + 0.6) key = mixKey(FOLLOW, READY, clamp((s.swingT - SWING_T - 0.6) / 0.5, 0, 1));
  } else {
    key = mixKey(READY, WINDUP, easeOutCubic(s.wind));
  }
  return solveSkater(key, s.flex);
}

/* ---------- draw ---------- */

function drawScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const rm = env.reducedMotion;
  const H = s.H;
  const shx = rm ? 0 : Math.sin(t * 71) * s.shake * H * 0.008;
  const shy = rm ? 0 : Math.sin(t * 53) * s.shake * H * 0.006;
  ctx.save();
  ctx.translate(shx, shy);
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
  rays(ctx, w * 0.5, -H * 0.3, [70, 80, 90, 100, 110], 4, Math.max(w, h) * 1.1, 'rgba(207,230,255,0.9)', 0.14);

  // Goal light over the glass
  const n = netGeo(s);
  const lx = n.farTop[0] + H * 0.25 * s.ns;
  const ly = (s.portrait ? s.gy - H * 1.25 : s.gy - H * 0.62) - H * 0.5;
  ctx.save();
  ctx.fillStyle = '#16060a';
  ctx.fillRect(lx - H * 0.035, ly, H * 0.07, H * 0.06);
  if (s.goalLight > 0) {
    const a = rm ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(t * 9));
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, H * 0.6);
    lg.addColorStop(0, `rgba(255,60,70,${0.9 * a * s.goalLight})`);
    lg.addColorStop(1, 'rgba(255,30,50,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx - H * 0.6, ly - H * 0.6, H * 1.2, H * 1.2);
    const sweep = rm ? 0.8 : t * 7;
    ctx.fillStyle = `rgba(255,70,80,${0.22 * s.goalLight})`;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, Math.max(w, h), sweep, sweep + 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = s.goalLight > 0 ? '#ff5560' : '#4a1018';
  ctx.beginPath();
  ctx.arc(lx, ly, H * 0.03, Math.PI, 0);
  ctx.fill();
  ctx.restore();

  // Net, goalie, puck, near post
  drawNetBack(ctx, n, s);
  const gr = s.goalieReact;
  const gshift = s.goalieShift * H * 0.05;
  paintFigure(
    s.goalie,
    env,
    { x: n.goalieX - n.gs * 0.6, y: n.goalieY - n.gs * 1.2, w: n.gs * 1.0, h: n.gs * 1.3 },
    (c) => drawGoalie(c, n.goalieX + gshift, n.goalieY, n.gs, gr, s.goalieReach, s.goalieDrop),
    GOALIE_RIM
  );
  compositeFigure(ctx, s.goalie, env, GOALIE_RIM);

  const shot = s.shot;
  const puck = (x: number, y: number, scale: number) => {
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.ellipse(x, y, H * 0.026 * scale, H * 0.011 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y - H * 0.003 * scale, H * 0.026 * scale, H * 0.011 * scale, 0, Math.PI, TAU);
    ctx.stroke();
  };
  if (s.puckVis) {
    if (shot && shot.kind !== 'fanned') {
      const k = clamp(shot.t / shot.dur, 0, 1);
      const x = lerp(shot.fx, shot.tx, k);
      const y = lerp(shot.fy, shot.ty, k) - Math.sin(k * Math.PI) * H * 0.04;
      // Streak
      const tail = clamp(k - 0.5, 0, 1);
      const sx = lerp(shot.fx, shot.tx, tail);
      const sy = lerp(shot.fy, shot.ty, tail);
      if (!shot.done || shot.t < shot.dur + 0.15) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sg = ctx.createLinearGradient(sx, sy, x, y);
        sg.addColorStop(0, 'rgba(200,230,255,0)');
        sg.addColorStop(1, 'rgba(235,248,255,0.95)');
        ctx.strokeStyle = sg;
        ctx.lineCap = 'round';
        ctx.lineWidth = H * 0.018;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
      }
      if (!shot.done) puck(x, y, 0.85);
      else if (shot.kind === 'save') {
        const a = shot.t - shot.dur;
        puck(shot.tx - a * H * 1.2, shot.ty - a * H * 1.4 + a * a * H * 3, 0.8);
      } else if (shot.kind === 'goal') {
        const a = Math.min(0.5, shot.t - shot.dur);
        puck(shot.tx + H * 0.06 * Math.min(1, a * 6), shot.ty + a * a * H * 1.4, 0.75);
      }
    } else {
      puck(s.puckX, s.puckY, s.portrait ? 1 : lerp(0.7, 1, clamp((s.puckY - (s.gy - H * 0.5)) / (H * 0.5), 0, 1)));
    }
  }
  drawNetFront(ctx, n, s);

  // Timing ring at the blade while the pass is on its way
  if (s.passT >= 0 && s.swingT < 0 && !shot) {
    const [px, py] = strikePoint(s);
    const remain = PASS_T - LEAD - s.passT;
    const r0 = H * 0.06;
    const r = r0 * (1 + Math.max(0, remain) * 2.6);
    ctx.save();
    ctx.strokeStyle = 'rgba(238,247,255,0.45)';
    ctx.lineWidth = Math.max(1, H * 0.005);
    ctx.beginPath();
    ctx.ellipse(px, py, r0, r0 * 0.35, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = Math.abs(remain) < GOOD ? 'rgba(255,90,110,0.95)' : 'rgba(238,247,255,0.8)';
    ctx.lineWidth = Math.max(1.5, H * 0.008);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.35, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // The skater
  const j = currentPose(s);
  const slideX = 0;
  const v: View = { X: (u) => s.gx + (u + slideX) * H, Y: (y) => s.gy - y * H, W: (x) => x * H };
  const box = { x: s.gx - H * 0.75, y: s.gy - H * 1.35, w: H * 1.9, h: H * 1.42 };
  paintFigure(s.fig, env, box, (c) => drawSkater(c, j, v), RIM, (c) => skaterAccents(c, j, v));
  // Shadow on the ice
  ctx.save();
  const sh = ctx.createRadialGradient(v.X(j.hip[0]), s.gy, 0, v.X(j.hip[0]), s.gy, H * 0.4);
  sh.addColorStop(0, 'rgba(10,20,40,0.45)');
  sh.addColorStop(1, 'rgba(10,20,40,0)');
  ctx.translate(v.X(j.hip[0]), s.gy);
  ctx.scale(1, 0.15);
  ctx.translate(-v.X(j.hip[0]), -s.gy);
  ctx.fillStyle = sh;
  ctx.fillRect(v.X(j.hip[0]) - H * 0.4, s.gy - H * 0.4, H * 0.8, H * 0.8);
  ctx.restore();
  compositeFigure(ctx, s.fig, env, RIM);
  drawStick(ctx, j, v, '#0a0710', 'rgba(238,247,255,0.7)');

  // Ice spray
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of s.spray) {
    if (m.life <= 0) continue;
    const a = Math.min(1, (m.life / m.max) * 1.5);
    ctx.fillStyle = `rgba(235,246,255,${a * 0.85})`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();

  if (s.redWash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = `rgba(255,30,50,${(rm ? 0.25 : 0.45) * s.redWash})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  vignette(ctx, w, h, 0.75, 0.5);
  grain(ctx, w, h, 0.07);
  if (s.fade > 0) {
    ctx.fillStyle = `rgba(2,6,16,${Math.sin(Math.min(1, s.fade) * Math.PI)})`;
    ctx.fillRect(0, 0, w, h);
  }
  drawHud(s, env);
}

function drawHud(s: State, env: SceneEnv) {
  const { ctx, w, h } = env;
  const u = Math.min(w, h);
  const fs = Math.max(9, Math.round(u * 0.028));
  const pad = Math.round(u * 0.04);
  chip(ctx, 'POWER PLAY · 5 ON 4', pad, pad, fs, '#ffd9df', 'rgba(150,10,30,0.7)');
  chip(ctx, `SHOTS ${s.shots}`, pad, pad + fs * 2.2, fs, '#eef7ff', 'rgba(2,8,20,0.65)');
  // Goal counter, scoreboard style
  ctx.save();
  const big = Math.round(u * 0.09);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${fs}px ${MONO}`;
  ctx.fillStyle = 'rgba(238,247,255,0.8)';
  ctx.fillText('GOALS', w - pad, pad);
  ctx.font = `900 ${big}px ${DISPLAY}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff3049';
  ctx.shadowBlur = s.goalLight > 0 ? big * 0.4 : 0;
  ctx.fillText(String(s.goals).padStart(2, '0'), w - pad, pad + fs * 1.3);
  ctx.restore();
  if (s.toastAge >= 0) {
    const size = Math.max(18, Math.min(u * 0.13, (w * 0.8) / (s.toast.length * 0.7)));
    const y = s.portrait ? h * 0.24 : h * 0.2;
    callout(ctx, s.toast, w * 0.5, y, size, s.toastAge, 1.8, s.toastGood ? '#ffffff' : '#cfe3ff', s.toastGood ? '#ff3049' : '#4a7dff', env.reducedMotion);
    if (s.sub) callout(ctx, s.sub, w * 0.5, y + size * 0.85, Math.max(10, size * 0.28), s.toastAge, 1.8, '#eef7ff', 'rgba(0,0,0,0.8)', env.reducedMotion);
  }
  if (!s.touched && env.interactive) {
    ctx.save();
    ctx.font = `600 ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238,247,255,0.85)';
    ctx.fillText('HOLD FOR THE PASS · RELEASE WHEN THE RING CLOSES', w / 2, h - pad * 0.7);
    ctx.restore();
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2,
    cursor: 'pointer',
    init: () => ({
      wind: 0,
      held: false,
      keyHeld: false,
      passT: -1,
      swingT: -1,
      releaseAt: 0,
      err: 0,
      shot: null,
      puckX: 0,
      puckY: 0,
      puckVis: false,
      puckHit: false,
      flex: 0,
      flexV: 0,
      goals: 0,
      shots: 0,
      streak: 0,
      resultT: 0,
      celebrate: 0,
      goalLight: 0,
      redWash: 0,
      fade: 0,
      shake: 0,
      toast: '',
      sub: '',
      toastAge: -1,
      toastGood: true,
      goalieReact: 0,
      goalieReach: [-0.05, 0.98],
      goalieShift: 0,
      goalieDrop: 0,
      bulge: 0,
      bulgeX: 0,
      bulgeY: 0,
      spray: makeMotes(90),
      touched: false,
      demoT: 0,
      demoN: 0,
      posterSet: false,
      H: 1,
      gx: 0,
      gy: 0,
      netX: 0,
      netY: 0,
      ns: 1,
      portrait: false,
      bg: null,
      fig: makeFigureLayer(),
      goalie: makeFigureLayer(),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt) => {
      const rm = env.reducedMotion;
      const poster = !env.interactive && rm;
      if (poster) {
        // Still: the instant after contact, shaft bowed, puck leaving as a streak, spray up
        if (!s.posterSet) {
          s.posterSet = true;
          s.goals = 8;
          s.shots = 8;
          s.wind = 1;
          s.passT = PASS_T;
          s.err = 0;
          s.puckVis = true;
          s.swingT = SWING_T * (IMPACT + 0.04);
          impact(s, env);
          if (s.shot) s.shot.t = s.shot.dur * 0.55;
          for (let i = 0; i < 12; i++) stepMotes(s.spray, 1 / 60, s.H * 2.2, 1.5);
          s.flex = 0.035;
          s.shake = 0;
          s.toastAge = -1;
        }
        return;
      }
      if (!env.interactive) {
        // Demo shift: call for it, load up, let it go on time (most of the time)
        s.demoT += dt;
        if (s.passT < 0 && !s.shot && s.celebrate <= 0 && s.fade <= 0 && s.demoT > 0.8) {
          press(s, env);
          s.demoT = 0;
          s.demoN += 1;
        }
        const aim = PASS_T - LEAD + (s.demoN % 4 === 0 ? -0.12 : 0);
        if (s.held && s.passT >= aim) releaseStick(s, env);
      }
      if (s.toastAge >= 0) s.toastAge += dt;
      if (s.toastAge > 2.2) s.toastAge = -1;
      const active = s.passT >= 0 || s.shot || s.celebrate > 0 || s.fade > 0 || s.goalLight > 0;
      if (rm && active) env.wake(300);

      // Wind up while held during the pass
      const loading = s.held && s.passT >= 0 && s.swingT < 0;
      s.wind = loading ? Math.min(1, s.wind + dt / 0.5) : s.swingT >= 0 ? s.wind : Math.max(0, s.wind - dt * 3);

      // Pass
      const [px, py] = strikePoint(s);
      const [ox, oy] = passFrom(s, env);
      if (s.passT >= 0 && (!s.shot || s.shot.kind === 'fanned')) {
        s.passT += dt;
        const k = s.passT / PASS_T;
        if (!s.shot) {
          s.puckX = lerp(ox, px, k);
          s.puckY = lerp(oy, py, k);
        }
        if (s.passT > PASS_T + NEAR + 0.05 && s.swingT < 0 && !s.shot) {
          // Never swung: the pass slides through
          s.shot = { kind: 'missed', t: 0, dur: 0.6, fx: s.puckX, fy: s.puckY, tx: s.puckX - s.H * 0.8, ty: s.puckY + s.H * 0.04, done: false };
          toast(s, 'MISSED IT', 'LET GO TO SHOOT', false);
          s.held = false;
        }
      }
      // Swing
      if (s.swingT >= 0) {
        const before = s.swingT / SWING_T;
        s.swingT += dt;
        const after = s.swingT / SWING_T;
        if (before < IMPACT && after >= IMPACT && !s.shot) impact(s, env);
      }
      // Shaft flex: a spring that loads on the ice and whips back
      s.flexV += (-s.flex * 260 - s.flexV * 14) * dt;
      s.flex += s.flexV * dt;
      if (rm) s.flex = 0;
      // Shot flight
      const shot = s.shot;
      if (shot) {
        shot.t += dt;
        if (shot.kind === 'fanned' || shot.kind === 'missed') {
          const k = clamp(shot.t / shot.dur, 0, 1);
          s.puckX = lerp(shot.fx, shot.tx, k);
          s.puckY = lerp(shot.fy, shot.ty, k);
        } else if (!shot.done && shot.t >= shot.dur) arrive(s, env);
        s.resultT += dt;
        const hold = shot.kind === 'goal' ? 3.4 : 1.5;
        if (s.resultT > hold && s.fade <= 0) s.fade = 0.001;
      }
      // Goalie: tracks the pass, reacts to the shot (late on a good one)
      const wantShift = s.passT >= 0 ? clamp(s.passT / PASS_T, 0, 1) * -0.6 : 0;
      s.goalieShift = damp(s.goalieShift, wantShift, 5, dt);
      const react = shot && shot.kind !== 'fanned' && shot.kind !== 'missed' ? (shot.kind === 'goal' ? clamp((shot.t - 0.08) / 0.25, 0, 1) : clamp(shot.t / 0.12, 0, 1)) : 0;
      s.goalieReact = damp(s.goalieReact, react, 18, dt);
      s.goalieDrop = damp(s.goalieDrop, shot && shot.kind === 'save' ? 1 : shot && shot.kind === 'goal' ? 0.5 : 0, 14, dt);
      // Celebration
      if (s.celebrate > 0) {
        s.celebrate += dt;
        if (!rm && s.celebrate > 0.15 && s.celebrate < 1.4) {
          const j = currentPose(s);
          const kx = s.gx + j.kneeR[0] * s.H;
          if (Math.random() < 0.7) spawnMote(s.spray, kx + rand(-4, 4), s.gy - s.H * 0.03, -s.H * rand(0.3, 1.0), -s.H * rand(0.1, 0.5), rand(0.3, 0.6), rand(1, 2.4));
        }
      }
      s.goalLight = s.goalLight > 0 ? (s.resultT > 3.2 ? Math.max(0, s.goalLight - dt * 2) : 1) : 0;
      s.redWash = Math.max(0, s.redWash - dt * 0.8);
      s.bulge = Math.max(0, s.bulge - dt * 2.5);
      s.shake = Math.max(0, s.shake - dt * 4);
      stepMotes(s.spray, dt, s.H * 2.2, 1.5);
      // Fade between shifts
      if (s.fade > 0) {
        s.fade += dt / 0.5;
        if (s.fade >= 0.5 && s.shot) resetShift(s);
        if (s.fade >= 1) s.fade = 0;
      }
    },
    draw: (s, env, t) => drawScene(s, env, t),
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => releaseStick(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !s.keyHeld) press(s, env);
      if (!down && s.keyHeld) releaseStick(s, env);
      s.keyHeld = down;
      return true;
    },
    dispose: (s) => {
      freeFigureLayer(s.fig);
      freeFigureLayer(s.goalie);
      if (s.bg) s.bg.width = s.bg.height = 0;
    },
  });
