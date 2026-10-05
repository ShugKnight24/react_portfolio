import type { RisoFilm, Riso } from '../riso/engine';
import type { Pt } from '../riso/kit';
import { TAU, clamp, lerp, seg, ease, tween, hash, circlePts, morphPair, morph, smoothPath, mulberry, DISPLAY, MONO, spacedText } from '../riso/kit';

/**
 * Buzzer Beater: one shot, one arc. A jump shot under the arena lights flies so far it lands on
 * ice as a puck, a slapshot fires it into the shot clock, the clock runs out and the dial drops
 * back into the hoop as the ball. The arena erupts and the ball grows into a trophy.
 */

type Mix = [number, number, number];
const PI = Math.PI;

const GROUND = 785;
const ICE = 790;
const RIM: Pt = [1270, 262];
const RIM_RX = 44;
const RIM_RY = 11;
const BALL_R = 28;
const RELEASE_T = 2.45;
const LAND_T = 5.25;
const LAND: Pt = [2780, ICE - BALL_R];
const PUCK_REST = 3000;
const CONTACT_T = 6.3;
const ZERO_T = 10.6;
const DROP_T = 11.55;
const FLOOR_T = 12.4;
const G = 1550;

/* ---------- paint helpers ---------- */

const fillMix = (r: Riso, p: Path2D, m: Mix, rule: CanvasFillRule = 'nonzero') => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    const d = m[i];
    if (d <= 0.012) continue;
    const c = L[i];
    c.fillStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.fill(p, rule);
  }
};

const strokeMix = (r: Riso, p: Path2D, m: Mix, w: number, dash?: number[], dashOffset = 0) => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    const d = m[i];
    if (d <= 0.012) continue;
    const c = L[i];
    c.save();
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (dash) {
      c.setLineDash(dash);
      c.lineDashOffset = dashOffset;
    }
    c.strokeStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.stroke(p);
    c.restore();
  }
};

const knock = (r: Riso, p: Path2D, m: Mix = [1, 1, 1], rule: CanvasFillRule = 'nonzero') => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    const d = m[i];
    if (d <= 0.012) continue;
    const c = L[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.fill(p, rule);
    c.restore();
  }
};

const knockStroke = (r: Riso, p: Path2D, w: number, m: Mix = [1, 1, 1]) => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    if (m[i] <= 0.012) continue;
    const c = L[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = m[i] >= 0.985 ? '#000' : r.tone(c, m[i]);
    c.stroke(p);
    c.restore();
  }
};

/** Knock everything out under the shape, then paint it: a true opaque fill */
const opaque = (r: Riso, p: Path2D, m: Mix) => {
  knock(r, p);
  fillMix(r, p, m);
};
const opaqueStroke = (r: Riso, p: Path2D, m: Mix, w: number) => {
  knockStroke(r, p, w);
  strokeMix(r, p, m, w);
};

const circ = (x: number, y: number, rad: number, p: Path2D = new Path2D()) => {
  p.moveTo(x + rad, y);
  p.arc(x, y, Math.max(0.1, rad), 0, TAU);
  return p;
};
const ell = (x: number, y: number, rx: number, ry: number, rot = 0, p: Path2D = new Path2D()) => {
  p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  p.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  return p;
};
const rect = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};
const poly = (pts: Pt[], p: Path2D = new Path2D()) => {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
};
const line = (p: Path2D, ...pts: Pt[]) => {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
};

const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const add = (a: Pt, b: Pt, s = 1): Pt => [a[0] + b[0] * s, a[1] + b[1] * s];

/** Two-bone IK: elbow position for a limb from s reaching h */
const ik = (s: Pt, h: Pt, l1: number, l2: number, bend: number): Pt => {
  const dx = h[0] - s[0];
  const dy = h[1] - s[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  return [s[0] + Math.cos(base + bend * a) * l1, s[1] + Math.sin(base + bend * a) * l1];
};

/* ---------- camera ---------- */

type Cam = [number, number, number];
const lerpCam = (a: Cam, b: Cam, k: number): Cam => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const toScreen = (p: Pt, c: Cam): Pt => [(p[0] - c[0]) * c[2] + 800, (p[1] - c[1]) * c[2] + 450];

/* ---------- the shot ---------- */

interface Pose {
  torso: number;
  t1: number;
  s1: number;
  f1: number;
  t2: number;
  s2: number;
  f2: number;
  u1: number;
  a1: number;
  u2: number;
  a2: number;
}
const CROUCH: Pose = { torso: 0.34, t1: 1.2, s1: -0.5, f1: 1.45, t2: 1.0, s2: -0.62, f2: 1.45, u1: 0.5, a1: 1.95, u2: 0.75, a2: 1.75 };
const PEAK: Pose = { torso: 0.04, t1: 0.3, s1: -0.22, f1: 0.95, t2: 0.62, s2: -0.55, f2: 0.85, u1: PI - 0.22, a1: PI + 0.6, u2: PI - 0.62, a2: PI + 0.12 };
const RELEASE: Pose = { torso: -0.02, t1: 0.26, s1: -0.16, f1: 0.95, t2: 0.55, s2: -0.45, f2: 0.85, u1: PI - 0.5, a1: PI - 0.82, u2: PI - 0.95, a2: PI - 0.25 };
const STAND: Pose = { torso: 0.12, t1: 0.35, s1: -0.2, f1: 1.4, t2: 0.15, s2: -0.15, f2: 1.4, u1: 0.5, a1: 1.0, u2: 0.3, a2: 0.6 };

const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const o = { ...a };
  (Object.keys(a) as (keyof Pose)[]).forEach((key) => {
    o[key] = lerp(a[key], b[key], k);
  });
  return o;
};

const dirD = (a: number, f = 1): Pt => [f * Math.sin(a), Math.cos(a)];

const poseAt = (t: number): Pose => {
  let p = lerpPose(CROUCH, PEAK, tween(t, 0.85, 1.55));
  p = lerpPose(p, RELEASE, tween(t, 2.2, 2.5, ease.outCubic));
  p = lerpPose(p, STAND, tween(t, 3.0, 3.6));
  return p;
};
const jumpAt = (t: number) => {
  const up = tween(t, 0.98, 1.7, ease.outCubic) * 170 + tween(t, 1.7, 2.5, ease.inOutSine) * 8;
  return up * (1 - tween(t, 2.65, 3.25, ease.inQuint));
};

interface Fig {
  hip: Pt;
  neck: Pt;
  sh: Pt;
  head: Pt;
  k1: Pt;
  an1: Pt;
  toe1: Pt;
  k2: Pt;
  an2: Pt;
  toe2: Pt;
  e1: Pt;
  h1: Pt;
  e2: Pt;
  h2: Pt;
  ball: Pt;
}

const playerFig = (t: number): Fig => {
  const p = poseAt(t);
  const bob = Math.sin(seg(t, 0, 0.9) * PI) * 10;
  const ground = GROUND - (85 * Math.cos(p.t1) + 88 * Math.cos(p.s1)) - 8;
  const hip: Pt = [520 + tween(t, 1.0, 1.8) * 26, ground + bob - jumpAt(t)];
  const up: Pt = [Math.sin(p.torso), -Math.cos(p.torso)];
  const neck = add(hip, up, 118);
  const sh = add(neck, up, -12);
  const head = add(add(neck, up, 30), [6, 0]);
  const k1 = add(hip, dirD(p.t1), 85);
  const an1 = add(k1, dirD(p.s1), 88);
  const toe1 = add(an1, dirD(p.s1 + p.f1), 28);
  const k2 = add(add(hip, [-8, 0]), dirD(p.t2), 85);
  const an2 = add(k2, dirD(p.s2), 88);
  const toe2 = add(an2, dirD(p.s2 + p.f2), 28);
  const e1 = add(sh, dirD(p.u1), 62);
  const h1 = add(e1, dirD(p.a1), 58);
  const e2 = add(add(sh, [-10, 2]), dirD(p.u2), 60);
  const h2 = add(e2, dirD(p.a2), 56);
  const ball = add(h1, dirD(p.a1), BALL_R * 0.85);
  return { hip, neck, sh, head, k1, an1, toe1, k2, an2, toe2, e1, h1, e2, h2, ball };
};

const RELEASE_P = playerFig(RELEASE_T).ball;
const ARC_H = 700;
/** The shot: parabola from the release to the ice, with a touch of slow motion at the top */
const flightU = (t: number) => {
  const k = seg(t, RELEASE_T, LAND_T);
  return lerp(k, ease.inOutSine(k), 0.3);
};
const arcPt = (u: number): Pt => [
  lerp(RELEASE_P[0], LAND[0], u),
  lerp(RELEASE_P[1], LAND[1], u) - ARC_H * 4 * u * (1 - u),
];

/* ---------- camera timeline ---------- */

const camAt = (t: number): Cam => {
  if (t < 10.7) {
    const s1: Cam = [lerp(700, 800, tween(t, 0, 2.4)), 450, lerp(1.14, 1.0, tween(t, 0, 2.4))];
    const b = arcPt(flightU(t));
    const follow: Cam = [b[0] + 140, lerp(430, b[1], 0.55), lerp(1, 0.7, tween(t, 2.4, 3.7))];
    let c = lerpCam(s1, follow, tween(t, 2.35, 3.5));
    const rink: Cam = [2960, 610, lerp(1.12, 1.32, tween(t, 6.0, 7.6, ease.inCubic))];
    c = lerpCam(c, rink, tween(t, 4.6, 5.9));
    return c;
  }
  const hoop: Cam = [1270, 290, lerp(1.9, 1.8, tween(t, 10.7, 11.8))];
  const mid: Cam = [1120, 520, 1.12];
  const end: Cam = [800, 500, 1.0];
  return lerpCam(lerpCam(hoop, mid, tween(t, 11.85, 12.7)), end, tween(t, 12.9, 14.8));
};

/* ---------- ball after the drop ---------- */

const dropBall = (t: number): { p: Pt; rot: number } => {
  let y: number;
  if (t < FLOOR_T) {
    const d = t - DROP_T;
    y = 200 + 0.5 * G * d * d;
  } else {
    let v = G * (FLOOR_T - DROP_T) * 0.5;
    let t0 = FLOOR_T;
    y = 760;
    for (let i = 0; i < 4; i++) {
      const T = (2 * v) / G;
      if (t < t0 + T) {
        const d = t - t0;
        y = 760 - (v * d - 0.5 * G * d * d);
        break;
      }
      t0 += T;
      v *= 0.5;
    }
  }
  const x = lerp(RIM[0], 800, tween(t, FLOOR_T, 14.5, ease.outCubic));
  return { p: [x, y], rot: t * 2 - (x - RIM[0]) / BALL_R };
};

/* ---------- state ---------- */

interface CrowdGroup {
  body: Path2D;
  red: Path2D;
  arms: Path2D;
  row: number;
  par: number;
}
interface Conf {
  kind: 0 | 1;
  t0: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  spin: number;
  flip: number;
  ph: number;
  ink: number;
}
interface State {
  crowd: CrowdGroup[];
  lamps: { x: number; y: number; r: number; on: number; beam: boolean }[];
  bulbs: { x: number; y: number; col: number; band: number }[];
  side: { x: number; y: number; i: number }[];
  confetti: Conf[];
  ball2trophy: [Pt[], Pt[]];
  ball2puck: [Pt[], Pt[]];
  iceMarks: Path2D;
  planks: Path2D;
  glass: Path2D;
  spray: { a: number; v: number; s: number }[];
}

const ROWS = [
  { y: 478, r: 11, sp: 30, d: 0.34 },
  { y: 522, r: 12, sp: 33, d: 0.44 },
  { y: 568, r: 13, sp: 36, d: 0.54 },
  { y: 616, r: 14, sp: 39, d: 0.64 },
];

const trophyOutline = (): Pt[] => {
  const right: Pt[] = [
    [800, 450],
    [940, 450],
    [946, 462],
    [937, 478],
    [962, 473],
    [998, 481],
    [1021, 504],
    [1028, 538],
    [1014, 571],
    [984, 593],
    [946, 601],
    [905, 600],
    [888, 618],
    [856, 650],
    [826, 672],
    [816, 690],
    [814, 714],
    [842, 721],
    [848, 736],
    [822, 742],
    [870, 748],
    [886, 770],
    [892, 790],
    [800, 790],
  ];
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [1600 - x, y] as Pt);
  // clockwise: top centre -> right side -> bottom centre -> left side
  return [...right, ...left];
};

const puckOutline = (rx: number, ry: number, h: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = PI + (i / 24) * PI;
    pts.push([Math.cos(a) * rx, -h / 2 + Math.sin(a) * ry]);
  }
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * PI;
    pts.push([Math.cos(a) * rx, h / 2 + Math.sin(a) * ry]);
  }
  return pts;
};

/* ---------- drawing pieces ---------- */

const drawBall = (r: Riso, x: number, y: number, rad: number, rot: number, seams = 1, sx = 1, sy = 1) => {
  const c = ell(x, y, rad * sx, rad * sy);
  opaque(r, c, [1, 0, 1]);
  r.gradient(r.layers[1], c, { kind: 'radial', cx: x - rad * 0.4, cy: y - rad * 0.45, r0: 0, r1: rad * 1.6, from: 0, to: 0.6 }, 7);
  // soft highlight: lift the red so the yellow shines through
  const hl = ell(x - rad * 0.38, y - rad * 0.4, rad * 0.32 * sx, rad * 0.22 * sy, -0.6);
  knock(r, hl, [0.5, 0, 0]);
  if (seams > 0.02) {
    const p = new Path2D();
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const T = (px: number, py: number): Pt => [x + (px * cs - py * sn) * rad * sx, y + (px * sn + py * cs) * rad * sy];
    line(p, T(-1, 0), T(1, 0));
    line(p, T(0, -1), T(0, 1));
    const curve = (side: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -PI / 2 + (i / 12) * PI;
        pts.push(T(side * (1.35 - Math.cos(a) * 0.82), Math.sin(a) * 0.95));
      }
      line(p, ...pts);
    };
    curve(1);
    curve(-1);
    r.all((ctx, i) => {
      if (i === 2) return;
      ctx.clip(c);
      ctx.lineWidth = Math.max(1.6, rad * 0.075);
      ctx.lineCap = 'round';
      ctx.strokeStyle = r.tone(ctx, i === 1 ? seams : seams * 0.8);
      ctx.stroke(p);
    });
  }
};

const drawPuckSide = (r: Riso, x: number, y: number, rx: number, ry: number, h: number) => {
  const body = new Path2D();
  body.moveTo(x - rx, y - h / 2);
  body.ellipse(x, y - h / 2, rx, ry, 0, PI, TAU);
  body.lineTo(x + rx, y + h / 2);
  body.ellipse(x, y + h / 2, rx, ry, 0, 0, PI);
  body.closePath();
  opaque(r, body, [1, 1, 0]);
  const top = ell(x, y - h / 2, rx, ry);
  knock(r, top, [0.55, 0, 0]);
  const rim = new Path2D();
  rim.ellipse(x, y - h / 2, rx * 0.92, ry * 0.75, 0, PI * 1.1, PI * 1.6);
  knockStroke(r, rim, Math.max(1.5, rx * 0.06));
};

/** A generic basketball shooter, facing right */
const drawPlayer = (r: Riso, f: Fig) => {
  const far: Mix = [0.4, 1, 0];
  const near: Mix = [1, 1, 0];
  const farArm = line(new Path2D(), f.sh, f.e2, f.h2);
  const farLeg = line(new Path2D(), f.hip, f.k2, f.an2);
  opaqueStroke(r, farArm, far, 17);
  opaqueStroke(r, farLeg, far, 25);
  opaqueStroke(r, line(new Path2D(), f.an2, f.toe2), [1, 0, 0.6], 15);
  // torso (jersey)
  const up: Pt = [f.neck[0] - f.hip[0], f.neck[1] - f.hip[1]];
  const len = Math.hypot(up[0], up[1]) || 1;
  const n: Pt = [-up[1] / len, up[0] / len];
  const torso = smoothPath([add(f.hip, n, 26), lerpPt(add(f.hip, n, 30), add(f.neck, n, 32), 0.5), add(add(f.neck, n, 30), up, -0.04), add(f.neck, [up[0] / len, up[1] / len], 6), add(add(f.neck, n, -28), up, -0.04), lerpPt(add(f.hip, n, -24), add(f.neck, n, -28), 0.5), add(f.hip, n, -22)]);
  knock(r, torso);
  strokeMix(r, torso, [0, 1, 0], 6);
  fillMix(r, torso, [0, 1, 0]);
  // jersey piping
  const pipe = line(new Path2D(), add(add(f.hip, n, 24), up, 0.08), add(add(f.neck, n, 26), up, -0.08));
  strokeMix(r, pipe, [0, 0, 1], 5);
  // shorts
  const shorts = poly([add(f.hip, n, 32), add(f.hip, n, -28), lerpPt(f.hip, f.k2, 0.55), lerpPt(f.hip, f.k1, 0.6)]);
  opaque(r, shorts, [0.35, 1, 0]);
  strokeMix(r, shorts, [0.35, 1, 0], 12);
  const nearLeg = line(new Path2D(), lerpPt(f.hip, f.k1, 0.5), f.k1, f.an1);
  opaqueStroke(r, nearLeg, near, 22);
  opaqueStroke(r, line(new Path2D(), f.an1, f.toe1), [1, 0, 0.6], 16);
  opaqueStroke(r, line(new Path2D(), f.neck, f.head), near, 18);
  const nearArm = line(new Path2D(), f.sh, f.e1, f.h1);
  opaqueStroke(r, nearArm, near, 17);
  opaque(r, circ(f.head[0], f.head[1], 21), near);
  // headband
  const hb = new Path2D();
  hb.arc(f.head[0], f.head[1], 21, PI * 1.05, PI * 1.95);
  strokeMix(r, hb, [0, 0, 1], 5);
};

interface Skater {
  hip: Pt;
  neck: Pt;
  sh: Pt;
  head: Pt;
  k1: Pt;
  an1: Pt;
  k2: Pt;
  an2: Pt;
  top: Pt;
  bot: Pt;
  e1: Pt;
  e2: Pt;
  shaftEnd: Pt;
  bladeEnd: Pt;
}

const STICK = 212;
const skaterAt = (t: number): Skater => {
  const wind = tween(t, 4.9, 5.95, ease.inOutCubic);
  const down = tween(t, 6.05, CONTACT_T, ease.inCubic);
  const thru = tween(t, CONTACT_T, 6.8, ease.outCubic);
  const lean = lerp(lerp(lerp(0.78, 0.6, wind), 0.86, down), 0.92, thru);
  const hip: Pt = [3160 - down * 6 - thru * 16, 638 + down * 4];
  const up: Pt = [-Math.sin(lean), -Math.cos(lean)];
  const neck = add(hip, up, 120);
  const sh = add(neck, up, -14);
  const head = add(add(neck, up, 30), [-8, 0]);
  const k1 = add(hip, dirD(0.9, -1), 85);
  const an1 = add(k1, dirD(-0.05, -1), 88);
  const k2 = add(hip, dirD(-0.55, -1), 85);
  const an2 = add(k2, dirD(-1.0 + down * 0.25, -1), 88);
  // stick: top hand pivot and shaft angle
  const ready: Pt = [3140, 590];
  const tw: Pt = [3175, 505];
  const tc: Pt = [3130, 598];
  const tf: Pt = [3045, 556];
  let top = lerpPt(ready, tw, wind);
  top = lerpPt(top, tc, down);
  top = lerpPt(top, tf, thru);
  const deg = lerp(lerp(lerp(108, -58, wind), 115, down), 198, thru);
  const a = (deg * PI) / 180;
  const s: Pt = [Math.cos(a), Math.sin(a)];
  const bot = add(top, s, 72);
  const shaftEnd = add(top, s, STICK);
  const ba = a + (65 * PI) / 180;
  const bladeEnd = add(shaftEnd, [Math.cos(ba), Math.sin(ba)], 46);
  const e1 = ik(sh, top, 60, 56, 1);
  const e2 = ik(add(sh, [-8, 4]), bot, 60, 56, -1);
  return { hip, neck, sh, head, k1, an1, k2, an2, top, bot, e1, e2, shaftEnd, bladeEnd };
};

/** A generic hockey skater, facing left */
const drawSkater = (r: Riso, k: Skater) => {
  const dark: Mix = [1, 1, 0];
  const jersey: Mix = [1, 0.12, 0];
  // back leg
  opaqueStroke(r, line(new Path2D(), k.hip, k.k2), [1, 1, 0], 30);
  opaqueStroke(r, line(new Path2D(), k.k2, k.an2), jersey, 22);
  const skate2 = line(new Path2D(), add(k.an2, [-26, 6]), add(k.an2, [18, 8]));
  opaqueStroke(r, skate2, dark, 14);
  // far arm (to the lower hand)
  opaqueStroke(r, line(new Path2D(), add(k.sh, [-8, 4]), k.e2, k.bot), jersey, 19);
  opaque(r, circ(k.bot[0], k.bot[1], 10), dark);
  // torso with shoulder pads
  const up: Pt = [k.neck[0] - k.hip[0], k.neck[1] - k.hip[1]];
  const len = Math.hypot(up[0], up[1]) || 1;
  const n: Pt = [-up[1] / len, up[0] / len];
  const torso = poly([add(k.hip, n, 36), add(k.neck, n, 38), add(k.neck, n, -34), add(k.hip, n, -32)]);
  knock(r, torso);
  strokeMix(r, torso, jersey, 18);
  fillMix(r, torso, jersey);
  // hem stripes
  const hem = line(new Path2D(), add(add(k.hip, n, 40), up, 0.2), add(add(k.hip, n, -36), up, 0.2));
  knockStroke(r, hem, 9);
  const hem2 = line(new Path2D(), add(add(k.hip, n, 40), up, 0.32), add(add(k.hip, n, -36), up, 0.32));
  knockStroke(r, hem2, 4);
  // front leg: pants, sock, skate
  opaqueStroke(r, line(new Path2D(), k.hip, k.k1), dark, 32);
  opaqueStroke(r, line(new Path2D(), k.k1, k.an1), jersey, 22);
  knockStroke(r, line(new Path2D(), lerpPt(k.k1, k.an1, 0.45), add(lerpPt(k.k1, k.an1, 0.45), [3, 0])), 22, [1, 0, 0]);
  const boot = poly([add(k.an1, [-34, 2]), add(k.an1, [-30, -12]), add(k.an1, [10, -14]), add(k.an1, [14, 6])]);
  opaque(r, boot, dark);
  strokeMix(r, line(new Path2D(), add(k.an1, [-38, 12]), add(k.an1, [18, 12])), [0, 1, 0], 4);
  // stick
  const shaft = line(new Path2D(), k.top, k.shaftEnd);
  opaqueStroke(r, shaft, [0.5, 0, 1], 9);
  opaqueStroke(r, line(new Path2D(), k.shaftEnd, k.bladeEnd), dark, 10);
  // helmet & head
  opaqueStroke(r, line(new Path2D(), k.neck, k.head), dark, 18);
  const helmet = new Path2D();
  helmet.arc(k.head[0], k.head[1], 25, PI * 0.95, PI * 2.05);
  helmet.lineTo(k.head[0] + 25, k.head[1] + 14);
  helmet.lineTo(k.head[0] - 22, k.head[1] + 16);
  helmet.closePath();
  opaque(r, helmet, dark);
  const visor = line(new Path2D(), add(k.head, [-26, 2]), add(k.head, [-6, 4]));
  knockStroke(r, visor, 6, [1, 1, 1]);
  strokeMix(r, visor, [0, 0.25, 0], 6);
  // near arm & glove at the top of the stick
  opaqueStroke(r, line(new Path2D(), k.sh, k.e1, k.top), jersey, 21);
  opaque(r, circ(k.top[0], k.top[1], 12), dark);
};

/* ---------- the arena (world space) ---------- */

interface ArenaOpts {
  cheer: number;
  rays: number;
  flash: boolean;
  netStretch: number;
  netBall: Pt | null;
  netSway: number;
}

const drawArena = (r: Riso, t: number, s: State, o: ArenaOpts) => {
  const [R, B, Y] = r.layers;
  // rafters
  const sky = rect(-3000, -1600, 9000, 2100);
  r.gradient(B, sky, { kind: 'linear', x0: 0, y0: -700, x1: 0, y1: 480, from: 0.88, to: 0.32 }, 12);
  // hanging scoreboard above centre court (a hint of the shot clock to come)
  const cube = rect(1260, -470, 300, 170);
  opaque(r, cube, [0.45, 1, 0]);
  opaqueStroke(r, line(new Path2D(), [1310, -470], [1290, -1600]), [0, 1, 0], 6);
  opaqueStroke(r, line(new Path2D(), [1510, -470], [1530, -1600]), [0, 1, 0], 6);
  const face = circ(1410, -385, 52);
  knock(r, face);
  fillMix(r, face, [0, 0, 0.15]);
  const tick = new Path2D();
  tick.arc(1410, -385, 52, -PI / 2, -PI / 2 + TAU * clamp(1 - seg(t, 2.4, 6)));
  strokeMix(r, tick, [1, 0, 1], 9);
  const bandP = new Path2D();
  for (let i = 0; i < 9; i++) {
    circ(1282 + i * 32, -322, 5, bandP);
    circ(1282 + i * 32, -448, 5, bandP);
  }
  knock(r, bandP);
  fillMix(r, bandP, [0, 0, 1]);

  // light beams + lamps
  const beams = new Path2D();
  const lit = new Path2D();
  const glow = new Path2D();
  for (const l of s.lamps) {
    if (t < l.on) continue;
    circ(l.x, l.y, l.r + 7, glow);
    circ(l.x, l.y, l.r, lit);
    if (l.beam) poly([[l.x - 10, l.y + 10], [l.x + 10, l.y + 10], [l.x + 80, 470], [l.x - 80, 470]], beams);
  }
  knock(r, beams, [0, 0.32, 0]);
  knock(r, glow, [0, 0.7, 0]);
  knock(r, lit, [0, 1, 0]);
  fillMix(r, lit, [0, 0, 1]);
  const housing = new Path2D();
  for (const l of s.lamps) rect(l.x - l.r - 4, l.y - l.r - 10, (l.r + 4) * 2, 7, housing);
  fillMix(r, housing, [0.5, 1, 0]);

  // stands + crowd
  const stands = rect(-3000, 445, 9000, 185);
  knock(r, stands, [0, 0.6, 0]);
  fillMix(r, stands, [0.12, 0.26, 0]);
  for (const g of s.crowd) {
    const row = ROWS[g.row];
    const idle = Math.sin(t * 1.7 + g.row * 1.9 + g.par * 2.4) * 1.6;
    const jump = Math.max(0, Math.sin(t * 10 + g.par * 2.1 + g.row * 1.3)) * o.cheer * (10 + g.row * 2);
    r.all((ctx, i) => {
      ctx.translate(0, idle - jump);
      if (i === 1) {
        ctx.fillStyle = r.tone(ctx, row.d);
        ctx.fill(g.body);
        if (o.cheer > 0.05) {
          ctx.lineWidth = row.r * 0.6;
          ctx.lineCap = 'round';
          ctx.strokeStyle = r.tone(ctx, row.d);
          ctx.stroke(g.arms);
        }
      } else if (i === 0) {
        ctx.fillStyle = r.tone(ctx, 0.42);
        ctx.fill(g.red);
      }
    });
  }
  // rink glass over the crowd on the hockey side
  const glassBand = rect(1905, 420, 4000, 170);
  knock(r, glassBand, [0.3, 0.3, 0]);
  strokeMix(r, s.glass, [0, 0.55, 0], 3);

  // court floor
  const court = new Path2D();
  court.rect(-3000, 624, 4850, 1000);
  knock(r, court);
  r.gradient(Y, court, { kind: 'linear', x0: 0, y0: 624, x1: 0, y1: 950, from: 0.34, to: 0.7 }, 9);
  R.fillStyle = r.tone(R, 0.14);
  R.fill(court);
  strokeMix(r, s.planks, [0.3, 0, 0], 1.5);
  const paint = poly([[1150, 646], [1390, 646], [1440, 790], [1100, 790]]);
  fillMix(r, paint, [0.4, 0, 0.3]);
  const markings = new Path2D();
  line(markings, [-3000, 644], [1850, 644]);
  markings.moveTo(1270 + 640, 648);
  markings.ellipse(1270, 648, 640, 230, 0, 0, PI);
  poly([[1150, 646], [1390, 646], [1440, 790], [1100, 790]], markings);
  markings.moveTo(1270 + 170, 790);
  markings.ellipse(1270, 790, 170, 34, 0, 0, TAU);
  strokeMix(r, markings, [0, 1, 0], 5);

  // ice
  const ice = new Path2D();
  ice.rect(1850, 650, 4000, 1000);
  knock(r, ice);
  r.gradient(B, ice, { kind: 'linear', x0: 0, y0: 650, x1: 0, y1: 1000, from: 0.2, to: 0.05 }, 8);
  knockStroke(r, s.iceMarks, 3, [0, 1, 0]);
  const blueLine = poly([[2330, 650], [2372, 650], [2318, 1600], [2240, 1600]]);
  fillMix(r, blueLine, [0, 1, 0]);
  const redLine = poly([[3420, 650], [3446, 650], [3460, 1600], [3410, 1600]]);
  fillMix(r, redLine, [1, 0, 0]);
  const fo = new Path2D();
  fo.ellipse(2700, 810, 180, 44, 0, 0, TAU);
  strokeMix(r, fo, [1, 0, 0], 5);
  fillMix(r, ell(2700, 810, 16, 5), [1, 0, 0]);
  // boards
  const boards = new Path2D();
  boards.moveTo(1940, 588);
  boards.lineTo(5900, 588);
  boards.lineTo(5900, 652);
  boards.lineTo(1905, 652);
  boards.quadraticCurveTo(1898, 588, 1940, 588);
  knock(r, boards);
  fillMix(r, boards, [0, 0, 0.1]);
  const cap = rect(1900, 586, 4000, 9);
  fillMix(r, cap, [0, 1, 0]);
  const kick = rect(1900, 640, 4000, 12);
  fillMix(r, kick, [0.2, 0, 1]);

  // spotlight pool under the shooter (fades as the shot leaves)
  const pool = ell(540, 788, 230, 46);
  r.gradient(Y, pool, { kind: 'radial', cx: 540, cy: 788, r0: 0, r1: 230, from: 0.95, to: 0.4 }, 6);

  // buzzer rays
  if (o.rays > 0.01) {
    const rays = new Path2D();
    const rr = 300 + o.rays * 1400;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + t * 0.25;
      rays.moveTo(RIM[0], RIM[1]);
      rays.lineTo(RIM[0] + Math.cos(a - 0.07) * rr, RIM[1] + Math.sin(a - 0.07) * rr);
      rays.lineTo(RIM[0] + Math.cos(a + 0.07) * rr, RIM[1] + Math.sin(a + 0.07) * rr);
      rays.closePath();
    }
    knock(r, rays, [0, 0.5 * (1 - o.rays * 0.6), 0]);
    fillMix(r, rays, [0, 0, 0.5 * (1 - o.rays * 0.7)]);
  }

  // stanchion and backboard
  const pad = new Path2D();
  pad.roundRect(1395, 640, 100, 82, 10);
  opaque(r, pad, [0.4, 1, 0]);
  opaqueStroke(r, line(new Path2D(), [1445, 650], [1445, 170], [1372, 176]), [0.4, 1, 0], 14);
  const board = rect(1168, 112, 204, 134);
  knock(r, board);
  fillMix(r, board, [0, 0.12, 0]);
  strokeMix(r, board, o.flash ? [1, 0, 1] : [0, 1, 0], 8);
  const sq = rect(1236, 176, 68, 56);
  strokeMix(r, sq, [1, 0, 0], 5);
  const brace = line(new Path2D(), [1270, 246], [1270, 255]);
  strokeMix(r, brace, [0.5, 1, 0], 8);
  // back half of the rim
  const back = new Path2D();
  back.ellipse(RIM[0], RIM[1], RIM_RX, RIM_RY, 0, PI, TAU);
  strokeMix(r, back, [1, 0.3, 1], 5);
};

const drawHoopFront = (r: Riso, t: number, o: ArenaOpts) => {
  // net: diamond mesh from the rim to a narrower ring, bulging round the ball as it passes
  const n = 9;
  const depth = 82 + o.netStretch * 26;
  const sway = Math.sin(t * 14) * o.netSway * 8;
  const net = new Path2D();
  const pt = (k: number, v: number): Pt => {
    // k across 0..1 (left to right on the front face), v down 0..1
    const y = RIM[1] + v * depth;
    let half = lerp(RIM_RX, 22 - o.netStretch * 6, v);
    if (o.netBall) {
      const dy = (y - o.netBall[1]) / (BALL_R * 1.4);
      half = Math.max(half, BALL_R * 1.05 * Math.max(0, 1 - dy * dy));
    }
    const ang = PI - k * PI;
    return [RIM[0] + Math.cos(ang) * half + sway * v * v, y + Math.sin(ang) * RIM_RY * (1 - v * 0.6)];
  };
  for (let i = 0; i <= n; i++) {
    const a: Pt[] = [];
    const b: Pt[] = [];
    for (let j = 0; j <= 6; j++) {
      const v = j / 6;
      a.push(pt(clamp((i + v * 1.0) / n), v));
      b.push(pt(clamp((i - v * 1.0) / n), v));
    }
    line(net, ...a);
    line(net, ...b);
  }
  knockStroke(r, net, 3.4);
  strokeMix(r, net, [0, 0.35, 0], 1.2);
  const front = new Path2D();
  front.ellipse(RIM[0], RIM[1], RIM_RX, RIM_RY, 0, 0, PI);
  opaqueStroke(r, front, [1, 0.25, 1], 6);
};

/* ---------- shot clock board (screen space) ---------- */

const drawBoard = (r: Riso, t: number, s: State) => {
  const bg = rect(-20, -20, 1640, 940);
  fillMix(r, bg, [0.42, 1, 0]);
  const rem = clamp((ZERO_T - t) / 3);
  const zero = t >= ZERO_T;
  const chase = Math.floor(t * 12);
  const on = new Path2D();
  const off = new Path2D();
  for (const b of s.bulbs) {
    const lit = zero ? Math.floor(t * 8) % 2 === 0 : (b.col + chase + b.band * 2) % 5 < 2;
    circ(b.x, b.y, 7, lit ? on : off);
  }
  const sideOn = new Path2D();
  const sideOff = new Path2D();
  for (const b of s.side) circ(b.x, b.y, 9, b.i < Math.ceil(rem * 12) ? sideOn : sideOff);
  const all = new Path2D();
  all.addPath(on);
  all.addPath(off);
  all.addPath(sideOn);
  all.addPath(sideOff);
  knock(r, all);
  fillMix(r, on, [0, 0, 1]);
  fillMix(r, off, [0.25, 0.3, 0.25]);
  fillMix(r, sideOn, [1, 0, 1]);
  fillMix(r, sideOff, [0.3, 0.35, 0]);
  const ctx = r.layers[2];
  ctx.font = `700 22px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  r.layers.forEach((c, i) => {
    if (i === 2) return;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.font = ctx.font;
    c.fillStyle = '#000';
    spacedText(c, 'SHOT CLOCK', 800, 148, 9);
    c.restore();
  });
  spacedText(ctx, 'SHOT CLOCK', 800, 148, 9);
};

/** The dial: the puck face, then the clock, then the ball */
const drawDial = (r: Riso, t: number, cx: number, cy: number, R: number, ballK: number) => {
  const disc = circ(cx, cy, R);
  opaque(r, disc, [1, 1, 0]);
  const faceR = R * 0.9 * tween(t, 7.3, 7.85, ease.outCubic);
  const rem = clamp((ZERO_T - t) / 3);
  const sweep = tween(t, 7.35, 7.75, ease.outCubic);
  const zero = t >= ZERO_T;
  if (faceR > 1) {
    const face = circ(cx, cy, faceR);
    knock(r, face);
    r.gradient(r.layers[2], face, { kind: 'radial', cx: cx - R * 0.3, cy: cy - R * 0.3, r0: 0, r1: R * 1.3, from: 0.04, to: 0.3 }, 6);
    // ticks
    const ticks = new Path2D();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU;
      const r0 = faceR * (i % 5 === 0 ? 0.84 : 0.89);
      line(ticks, [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * faceR * 0.95, cy + Math.sin(a) * faceR * 0.95]);
    }
    strokeMix(r, ticks, [0, 1, 0], Math.max(1, R * 0.012));
    // digit
    const digit = zero ? '0' : String(Math.min(3, Math.ceil(ZERO_T - t)));
    const start = zero ? ZERO_T : ZERO_T - Math.ceil(ZERO_T - t);
    const punch = 1 + 0.35 * (1 - ease.outBack(seg(t, start, start + 0.32)));
    const fs = R * 1.05 * punch * clamp(faceR / (R * 0.9));
    r.layers.forEach((c, i) => {
      c.save();
      c.font = `900 ${fs}px ${DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (i === 1) {
        c.fillStyle = r.tone(c, 0.55);
        c.fillText(digit, cx + R * 0.035, cy + R * 0.1);
      }
      if (i === 0) {
        c.fillStyle = '#000';
        c.fillText(digit, cx, cy + R * 0.07);
      }
      if (i === 2 && zero) {
        c.fillStyle = '#000';
        c.fillText(digit, cx, cy + R * 0.07);
      }
      c.restore();
    });
  }
  // countdown ring: the arc again, running out
  const track = new Path2D();
  track.arc(cx, cy, R * 0.95, 0, TAU);
  strokeMix(r, track, [0.3, 0, 0.3], R * 0.07);
  if (!zero) {
    const ring = new Path2D();
    const a0 = -PI / 2;
    ring.arc(cx, cy, R * 0.95, a0, a0 + TAU * rem * sweep);
    strokeMix(r, ring, [1, 0, 1], R * 0.075);
  } else if (Math.floor((t - ZERO_T) * 10) % 2 === 0) {
    strokeMix(r, track, [1, 0, 0], R * 0.075);
  }
  if (ballK > 0.001) {
    const br = R * ballK;
    const clip = circ(cx, cy, br);
    r.layers.forEach((c) => {
      c.save();
      c.clip(clip);
    });
    drawBall(r, cx, cy, R, 0.4 + t * 1.5, tween(t, 11.0, 11.45));
    r.layers.forEach((c) => c.restore());
  }
};

/* ---------- confetti ---------- */

const drawConfetti = (r: Riso, t: number, s: State) => {
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const c of s.confetti) {
    const d = t - c.t0;
    if (d < 0) continue;
    let x: number;
    let y: number;
    if (c.kind === 0) {
      const drag = 1 - Math.exp(-d * 1.6);
      x = c.x + (c.vx / 1.6) * drag;
      y = c.y + (c.vy / 1.6) * drag + 260 * d * d * 0.5 + 90 * d;
    } else {
      x = c.x + Math.sin(d * 1.7 + c.ph) * 38;
      y = c.y + c.vy * d;
    }
    if (y > 960 || y < -60 || x < -40 || x > 1640) continue;
    const a = c.ph + d * c.spin;
    const w = c.w * Math.cos(d * c.flip + c.ph);
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const P = (px: number, py: number): Pt => [x + px * cs - py * sn, y + px * sn + py * cs];
    const quad = [P(-w, -c.h), P(w, -c.h), P(w, c.h), P(-w, c.h)];
    const inks = c.ink === 3 ? [0, 2] : [c.ink];
    for (const i of inks) poly(quad, paths[i]);
  }
  paths.forEach((p, i) => {
    const c = r.layers[i];
    c.fillStyle = '#000';
    c.fill(p);
  });
};

/* ---------- film ---------- */

export const buzzerBeaterFilm: RisoFilm<State> = {
  id: 'buzzer-beater',
  title: 'Buzzer Beater',
  caption: 'One shot, one arc: from the hardwood to the ice to the horn.',
  theme: 'Sports',
  motif: 'The arc of a shot',
  duration: 18.5,
  paper: '#f3ead8',
  inks: [
    { color: '#ff665e', angle: 15, offset: [1.6, -1] },
    { color: '#3255a4', angle: 75, offset: [-1.2, 0.9] },
    { color: '#ffb511', angle: 45, offset: [0, 0] },
  ],
  scenes: [
    { at: 0, label: 'The rise' },
    { at: 2.4, label: 'The arc' },
    { at: 6.3, label: 'Shot clock' },
    { at: 10.7, label: 'The buzzer' },
    { at: 14.6, label: 'The trophy' },
  ],
  posterTime: 2.9,

  setup() {
    const rng = mulberry(808);
    const crowd: CrowdGroup[] = [];
    ROWS.forEach((row, ri) => {
      for (let par = 0; par < 2; par++) {
        const body = new Path2D();
        const red = new Path2D();
        const arms = new Path2D();
        let k = 0;
        for (let x = -2600 + ri * 13; x < 5600; x += row.sp) {
          k++;
          if (k % 2 !== par) continue;
          const jx = x + (rng() - 0.5) * row.sp * 0.4;
          const jy = row.y + (rng() - 0.5) * 6;
          const hr = row.r * (0.9 + rng() * 0.2);
          ell(jx, jy, hr * 1.55, hr * 1.15, 0, body);
          circ(jx, jy - hr * 1.65, hr, body);
          if (rng() < 0.32) ell(jx, jy + 2, hr * 1.5, hr * 1.05, 0, red);
          if (rng() < 0.45) {
            line(arms, [jx - hr * 1.1, jy - hr * 0.6], [jx - hr * 1.9, jy - hr * 3.6]);
            line(arms, [jx + hr * 1.1, jy - hr * 0.6], [jx + hr * 1.9, jy - hr * 3.6]);
          }
        }
        crowd.push({ body, red, arms, row: ri, par });
      }
    });
    const lamps: State['lamps'] = [];
    for (let i = 0, x = -1700; x < 5600; x += 170, i++) lamps.push({ x, y: 46, r: 12, on: 0.12 + clamp((x + 200) / 1800) * 0.75, beam: i % 2 === 0 });
    for (let x = -1800; x < 5600; x += 230) lamps.push({ x, y: -300, r: 9, on: 0.4, beam: false });
    const bulbs: State['bulbs'] = [];
    for (let band = 0; band < 4; band++) {
      const y = [44, 76, 824, 856][band];
      for (let col = 0, x = 30; x < 1590; x += 30, col++) bulbs.push({ x, y, col, band });
    }
    const side: State['side'] = [];
    for (let i = 0; i < 12; i++) {
      side.push({ x: 150, y: 690 - i * 44, i });
      side.push({ x: 1450, y: 690 - i * 44, i });
    }
    const confetti: Conf[] = [];
    for (let i = 0; i < 70; i++) {
      const left = i % 2 === 0;
      confetti.push({
        kind: 0,
        t0: 11.95 + rng() * 0.25,
        x: left ? -10 : 1610,
        y: 900,
        vx: (left ? 1 : -1) * (500 + rng() * 900),
        vy: -(1100 + rng() * 900),
        w: 4 + rng() * 3,
        h: 7 + rng() * 5,
        spin: (rng() - 0.5) * 9,
        flip: 4 + rng() * 6,
        ph: rng() * TAU,
        ink: Math.floor(rng() * 4),
      });
    }
    for (let i = 0; i < 120; i++) {
      confetti.push({
        kind: 1,
        t0: 12.0 + (i / 120) * 4.2 + rng() * 0.3,
        x: rng() * 1600,
        y: -40,
        vx: 0,
        vy: 150 + rng() * 140,
        w: 4 + rng() * 3,
        h: 7 + rng() * 5,
        spin: (rng() - 0.5) * 5,
        flip: 3 + rng() * 5,
        ph: rng() * TAU,
        ink: Math.floor(rng() * 4),
      });
    }
    const iceMarks = new Path2D();
    for (let i = 0; i < 70; i++) {
      const x = 1900 + rng() * 3600;
      const y = 665 + rng() * rng() * 400;
      const l = 30 + rng() * 120;
      iceMarks.moveTo(x, y);
      iceMarks.quadraticCurveTo(x + l * 0.5, y - 3 + rng() * 6, x + l, y + (rng() - 0.5) * 8);
    }
    const planks = new Path2D();
    let py = 640;
    for (let i = 0; i < 14; i++) {
      py += 8 + i * 3.5;
      line(planks, [-3000, py], [1850, py]);
    }
    const glass = new Path2D();
    for (let x = 1960; x < 5600; x += 190) line(glass, [x, 424], [x, 586]);
    line(glass, [1905, 422], [5600, 422]);
    const spray: State['spray'] = [];
    for (let i = 0; i < 22; i++) spray.push({ a: -PI + 0.2 + rng() * 1.3, v: 200 + rng() * 420, s: 2 + rng() * 4 });

    const ball2trophy = morphPair(circlePts(800, 762, BALL_R, 160), trophyOutline(), 160);
    const ball2puck = morphPair(circlePts(0, 0, BALL_R, 96), puckOutline(32, 9, 18), 96);
    return { crowd, lamps, bulbs, side, confetti, ball2trophy, ball2puck, iceMarks, planks, glass, spray };
  },

  draw(r, t, s) {
    const cam = camAt(t);
    const boardIris = t >= 7.28 && t < DROP_T;

    // iris radius and dial geometry for the clock act
    let irisC: Pt = [800, 450];
    let irisR = 0;
    let dialC: Pt = [800, 450];
    let dialR = 0;
    let ballK = 0;
    let puckScreen: { c: Pt; rx: number; ry: number; h: number } | null = null;
    if (t >= CONTACT_T && t < 7.55) {
      const c0 = toScreen([PUCK_REST, ICE - 9], camAt(CONTACT_T));
      const k = seg(t, CONTACT_T, 7.55);
      const grow = ease.inOutCubic(k);
      const rx = lerp(32 * camAt(CONTACT_T)[2], 300, grow);
      const ratio = lerp(0.28, 1, ease.inOutSine(seg(t, 6.6, 7.5)));
      const c: Pt = [lerp(c0[0], 800, ease.outCubic(k)) - Math.sin(k * PI) * 120, lerp(c0[1], 450, ease.inOutSine(k)) - Math.sin(k * PI) * 160];
      puckScreen = { c, rx, ry: rx * ratio, h: rx * 0.56 * (1 - ratio) };
      irisC = c;
      irisR = t >= 7.28 ? lerp(rx * 1.01, 1150, tween(t, 7.28, 7.55, ease.inSine)) : 0;
    } else if (t >= 7.55 && t < 10.75) {
      irisR = 2000;
      dialR = 300;
    } else if (t >= 10.75 && t < DROP_T) {
      const k = ease.inOutCubic(seg(t, 10.75, DROP_T));
      const target = toScreen([RIM[0], 200], camAt(DROP_T));
      dialR = lerp(300, BALL_R * camAt(DROP_T)[2], k);
      dialC = lerpPt([800, 450], target, k);
      irisC = dialC;
      irisR = dialR + (1300 - dialR) * (1 - ease.inOutCubic(seg(t, 10.75, 11.5)));
      ballK = tween(t, 10.8, 11.3, ease.outCubic);
    }

    // ---------- the world ----------
    const worldVisible = !(t >= 7.55 && t < 10.75);
    if (worldVisible) {
      r.camera(cam[0], cam[1], cam[2]);
      const swish = t >= 11.75 && t < 12.15;
      const db = t >= DROP_T ? dropBall(t) : null;
      const o: ArenaOpts = {
        cheer: t > 11.95 ? 1 - 0.6 * tween(t, 13, 15) : 0,
        rays: t > 11.95 && t < 13.6 ? seg(t, 11.95, 13.6) : 0,
        flash: t > 11.95 && t < 13.2 && Math.floor(t * 8) % 2 === 0,
        netStretch: t > 11.75 ? Math.exp(-(t - 12.0) * (t - 12.0) * 20) : 0,
        netBall: swish && db ? db.p : null,
        netSway: t > 11.9 ? Math.exp(-(t - 11.9) * 2.2) : 0,
      };
      drawArena(r, t, s, o);

      if (t < 3.9) drawPlayer(r, playerFig(t));
      if (t > 4.6 && t < 7.6) drawSkater(r, skaterAt(t));

      if (t < RELEASE_T) {
        drawHoopFront(r, t, o);
        const f = playerFig(t);
        drawBall(r, f.ball[0], f.ball[1], BALL_R, 0.3 + t * 0.4);
        // re-draw the shooting hand over the ball
        opaqueStroke(r, line(new Path2D(), f.e1, f.h1), [1, 1, 0], 17);
      } else if (t < CONTACT_T) {
        drawHoopFront(r, t, o);
        // the arc trail
        const u = flightU(t);
        const pts: Pt[] = [];
        const nSeg = 60;
        for (let i = 0; i <= nSeg; i++) pts.push(arcPt((i / nSeg) * Math.min(u, 1)));
        const trail = line(new Path2D(), ...pts);
        strokeMix(r, trail, [1, 0, 0.55], 6, [12, 16], -t * 60);
        if (t < LAND_T) {
          const b = arcPt(u);
          drawBall(r, b[0], b[1], BALL_R, (t - RELEASE_T) * 9);
        } else {
          // land, squash, become a puck, slide to the stick
          const mk = tween(t, LAND_T, LAND_T + 0.32, ease.inOutCubic);
          const slide = tween(t, LAND_T + 0.15, 6.15, ease.outCubic);
          const x = lerp(LAND[0], PUCK_REST, slide);
          const y = lerp(LAND[1], ICE - 9, mk);
          if (mk < 1) {
            const sq = Math.sin(seg(t, LAND_T, LAND_T + 0.2) * PI) * 0.18;
            const shape = morph(s.ball2puck[0], s.ball2puck[1], mk).map(([px, py]) => [x + px * (1 + sq), y + py * (1 - sq)] as Pt);
            const p = smoothPath(shape);
            opaque(r, p, [1, mk, 1 - mk]);
            if (mk < 0.4) drawBall(r, x, y, BALL_R, (t - RELEASE_T) * 9, 1 - mk * 2.5, 1 + sq, 1 - sq);
          } else {
            drawPuckSide(r, x, y, 32, 9, 18);
          }
          // landing splash of ice
          const ls = seg(t, LAND_T, LAND_T + 0.5);
          if (ls > 0 && ls < 1) {
            const chips = new Path2D();
            for (let i = 0; i < 10; i++) {
              const a = -PI + (i / 9) * PI;
              const d = ls * (60 + (i % 3) * 25);
              circ(LAND[0] + Math.cos(a) * d * 1.6, ICE - 4 + Math.sin(a) * d * 0.6 + ls * ls * 40, 3 * (1 - ls), chips);
            }
            fillMix(r, chips, [0, 0.8, 0]);
          }
        }
      } else if (t < 7.6) {
        // ice spray off the slapshot
        const d = t - CONTACT_T;
        const chips = new Path2D();
        for (const sp of s.spray) {
          const x = PUCK_REST + Math.cos(sp.a) * sp.v * d;
          const y = ICE - 6 + Math.sin(sp.a) * sp.v * d * 0.7 + 500 * d * d;
          if (y < ICE + 20) circ(x, y, sp.s * (1 - seg(d, 0, 0.8)), chips);
        }
        fillMix(r, chips, [0, 0.9, 0]);
      }

      if (t >= DROP_T) {
        const b = dropBall(t);
        const fade = tween(t, 14.4, 15.4, ease.inOutSine);
        if (t < 14.4) {
          drawBall(r, b.p[0], b.p[1], BALL_R, b.rot);
          drawHoopFront(r, t, o);
        } else {
          drawHoopFront(r, t, o);
        }
        // the arena dissolves back to paper around the spotlight
        if (fade > 0) {
          r.layers.forEach((c) => {
            c.save();
            c.globalCompositeOperation = 'destination-out';
          });
          r.layers.forEach((c) => {
            r.gradient(c, null, { kind: 'radial', cx: 800, cy: 600, r0: 0, r1: 1100, from: fade * 1.8 - 0.8, to: fade * 1.8 }, 10);
          });
          r.layers.forEach((c) => c.restore());
        }
        if (t >= 14.4) drawFinale(r, t, s);
      }
    }

    // ---------- screen space: puck flight, board, dial ----------
    r.camera(800, 450, 1);
    if (puckScreen && irisR <= 0) {
      drawPuckSide(r, puckScreen.c[0], puckScreen.c[1], puckScreen.rx, puckScreen.ry, puckScreen.h);
    }
    if (irisR > 0 && (boardIris || puckScreen)) {
      const clip = circ(irisC[0], irisC[1], irisR);
      r.layers.forEach((c) => {
        c.save();
        c.clip(clip);
        c.clearRect(-50, -50, 1700, 1000);
      });
      drawBoard(r, t, s);
      if (puckScreen) {
        drawPuckSide(r, puckScreen.c[0], puckScreen.c[1], puckScreen.rx, puckScreen.ry, puckScreen.h);
        if (t > 7.3) drawDial(r, t, puckScreen.c[0], puckScreen.c[1], puckScreen.rx, 0);
      } else if (dialR > 0) {
        drawDial(r, t, dialC[0], dialC[1], dialR, ballK);
      }
      r.layers.forEach((c) => c.restore());
      // iris rim
      if (irisR < 1300 && irisR > dialR + 2) {
        const rim = circ(irisC[0], irisC[1], irisR);
        strokeMix(r, rim, [1, 0, 1], 6);
      }
    }

    if (t > 11.9) drawConfetti(r, t, s);
    if (t >= 14.4) drawTitle(r, t);
  },
};

/* ---------- finale (world space, camera at the end frame) ---------- */

function drawFinale(r: Riso, t: number, s: State) {
  const k = tween(t, 14.9, 16.0, ease.inOutCubic);
  // sunburst behind
  const burst = tween(t, 15.0, 16.0, ease.outCubic);
  if (burst > 0) {
    const rays = new Path2D();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + t * 0.06;
      const r0 = 150;
      const r1 = 150 + burst * 900;
      rays.moveTo(800 + Math.cos(a - 0.05) * r0, 590 + Math.sin(a - 0.05) * r0);
      rays.lineTo(800 + Math.cos(a - 0.08) * r1, 590 + Math.sin(a - 0.08) * r1);
      rays.lineTo(800 + Math.cos(a + 0.08) * r1, 590 + Math.sin(a + 0.08) * r1);
      rays.lineTo(800 + Math.cos(a + 0.05) * r0, 590 + Math.sin(a + 0.05) * r0);
      rays.closePath();
    }
    fillMix(r, rays, [0, 0, 0.32]);
    const halo = circ(800, 590, 230 * burst);
    r.gradient(r.layers[2], halo, { kind: 'radial', cx: 800, cy: 590, r0: 0, r1: 230, from: 0.55, to: 0.1 }, 6);
  }
  // floor shadow
  const sh = ell(800, 792, lerp(34, 170, k), lerp(8, 18, k));
  fillMix(r, sh, [0, 0.45, 0]);

  const b = dropBall(t);
  if (k <= 0) {
    drawBall(r, b.p[0], b.p[1], BALL_R, b.rot, 1);
    return;
  }
  const shape = morph(s.ball2trophy[0], s.ball2trophy[1], k);
  const path = smoothPath(shape, true, 0.3);
  opaque(r, path, [1, 0, 1]);
  const [, B] = r.layers;
  r.gradient(B, path, { kind: 'linear', x0: 760, y0: 0, x1: 1040, y1: 0, from: 0, to: 0.7 }, 8);
  if (k < 0.5) {
    // the seams fade as the ball grows
    const seams = 1 - seg(k, 0, 0.35);
    if (seams > 0) drawBall(r, b.p[0], b.p[1] - k * 120, BALL_R * (1 + k * 2), b.rot, seams);
  }
  const hole = seg(k, 0.8, 1);
  if (hole > 0) {
    const holes = new Path2D();
    ell(980, 538, 24 * hole, 33 * hole, 0.2, holes);
    ell(620, 538, 24 * hole, 33 * hole, -0.2, holes);
    knock(r, holes);
    fillMix(r, holes, [0, 0, 0.32]);
    // dark plinth
    r.layers.forEach((c) => {
      c.save();
      c.clip(path);
    });
    fillMix(r, rect(600, 757, 400, 40), [0.55, 1, 0]);
    fillMix(r, rect(600, 726, 400, 10), [0, 0.8, 0]);
    r.layers.forEach((c) => c.restore());
    // highlight streak, with a glint sliding across in the hold
    const hi = new Path2D();
    hi.moveTo(708, 470);
    hi.quadraticCurveTo(712, 580, 790, 668);
    knockStroke(r, hi, 14 * hole, [1, 0, 0]);
    const g = seg(t, 17.1, 17.8);
    if (g > 0 && g < 1) {
      const gx = lerp(640, 960, ease.inOutSine(g));
      r.layers.forEach((c) => {
        c.save();
        c.clip(path);
      });
      knock(r, poly([[gx - 10, 440], [gx + 20, 440], [gx - 40, 800], [gx - 70, 800]]), [1, 0, 0.6]);
      r.layers.forEach((c) => c.restore());
    }
  }
  // the arc, one last time, landing in the cup
  const ak = tween(t, 15.9, 16.9, ease.inOutCubic);
  if (ak > 0) {
    const A: Pt = [260, 780];
    const C: Pt = [800, 440];
    const pts: Pt[] = [];
    for (let i = 0; i <= 50; i++) {
      const u = (i / 50) * ak;
      pts.push([lerp(A[0], C[0], u), lerp(A[1], C[1], u) - 520 * 4 * u * (1 - u) * 0.75]);
    }
    strokeMix(r, line(new Path2D(), ...pts), [1, 0, 0.5], 6, [12, 14], -t * 25);
    const head = pts[pts.length - 1];
    if (ak < 1) drawBall(r, head[0], head[1], 12, t * 6, 1);
  }
}

function drawTitle(r: Riso, t: number) {
  const k = tween(t, 16.4, 17.0, ease.outCubic);
  if (k <= 0) return;
  const [R, B] = r.layers;
  r.layers.forEach((c) => {
    c.save();
    c.beginPath();
    c.rect(0, 770, 1600, 130);
    c.clip();
  });
  const dy = (1 - k) * 70;
  r.layers.forEach((c) => c.restore());
  const plate = new Path2D();
  plate.roundRect(800 - 330 * k, 786, 660 * k, 96, 8);
  knock(r, plate);
  r.layers.forEach((c) => {
    c.save();
    c.beginPath();
    c.rect(0, 770, 1600, 130);
    c.clip();
  });
  B.font = `900 52px ${DISPLAY}`;
  B.textAlign = 'center';
  B.textBaseline = 'alphabetic';
  B.fillStyle = '#000';
  spacedText(B, 'BUZZER BEATER', 800, 832 + dy, 10);
  const k2 = tween(t, 16.7, 17.2, ease.outCubic);
  R.font = `700 20px ${MONO}`;
  R.fillStyle = '#000';
  spacedText(R, 'FINAL  ·  0.0', 800, 866 + (1 - k2) * 60, 7);
  r.layers.forEach((c) => c.restore());
}
