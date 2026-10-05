import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { DISPLAY, TAU, clamp, ease, hash, lerp, mulberry, seg, spacedText, tween, type Pt } from '../riso/kit';
import {
  HIND_LEN,
  LUNA_LOOK,
  LUNA_SIT_HIND,
  LUNA_SIT_HIND_FAR,
  LUNA_SIT_TILT,
  bakePlate,
  blobPts,
  clipRect,
  cutPath,
  cutRidge,
  drawPlate,
  frontIK,
  gaitFoot,
  hindIK,
  keys,
  layerView,
  legFK,
  lunaArt,
  lunaRoots,
  lunaShape,
  makeCraft,
  makeStamp,
  mix,
  mixLuna,
  pinePts,
  sheet,
  stampDraw,
  taper,
  tornRidge,
  viewRect,
  warmLight,
  type Craft,
  type DogLook,
  type LunaPose,
  type Plate,
  type Rect,
  type Stamp,
  type View,
} from '../styles/papercut';

/**
 * Snow Day: a held cut-paper tableau of a Michigan backyard in fresh snow.
 * Luna does zoomies with her black-dog friend, they box and wrestle, she leaps for a snowball
 * thrown from the porch and it bursts in her mouth. Dusk comes down blue, the two of them sit
 * by the steps, and the porch light comes on.
 * Motif: the snow. Falling at every depth, kicked up in sprays, packed into a ball that
 * explodes, and finally lit gold in the porch light like the end of the day.
 */

const DURATION = 18;
const T_ZOOM = 0;
const T_WRESTLE = 5.6;
const T_BALL = 10.2;
const T_HOME = 12.7;
const T_LIGHT = 15.05;

const LS = 1.5;
const BS = 1.6;
/** Body centre above the ground when standing, rig units */
const L_H0 = 49;
/** Paw point above the ground, rig units */
const PAW = 3.5;

const BACK_G = 712;
const FRONT_G = 790;

/* ---------- palette ---------- */

const P = {
  skyTop: '#c9d1df',
  skyLow: '#efe7e2',
  far: '#b9bdd0',
  farDeep: '#a5abc3',
  houseA: '#9da5bf',
  houseB: '#b2a7b8',
  roof: '#f4f2ee',
  roofDk: '#8b8fa8',
  window: '#6f7593',
  spruce: '#4d6a68',
  spruceDk: '#3e5856',
  snow: '#f6f4ef',
  snowShade: '#dfe4ee',
  snowDeep: '#c9d2e3',
  fence: '#8e6c53',
  fenceLt: '#9c7a5f',
  fenceDk: '#6f533f',
  bark: '#4f4039',
  barkDk: '#3f332e',
  siding: '#a5473d',
  sidingDk: '#8d3a33',
  trim: '#eee8dc',
  door: '#3e4f63',
  lantern: '#2f2a28',
  glassOff: '#d9d3c0',
  glassOn: '#ffe9a8',
  sled: '#c7392f',
  grass: '#b79d6c',
  twig: '#4a3a33',
  berry: '#c8323a',
  cardinal: '#c8302c',
  ball: '#fbfaf6',
  title: '#c8453a',
  titleB: '#2f4a6b',
};

const BLACK_LOOK: DogLook = {
  coat: '#2e2d34',
  shade: '#1f1e24',
  pale: '#4f4d58',
  ear: '#1b1a1f',
  nose: '#0f0e12',
  scarf: '#3d8f9b',
};

/* ---------- dog rig: bodies, planted paws, gaits ---------- */

type Leg = 'ff' | 'fn' | 'bf' | 'bn';
const LEGS: Leg[] = ['ff', 'fn', 'bf', 'bn'];

interface Body {
  x: number;
  y: number;
  rot: number;
  flip: boolean;
  s: number;
  tilt: number;
  neck: number;
  head: number;
  tail: number;
}

interface DogFrame {
  b: Body;
  pose: LunaPose;
  /** Horizontal squash for the puppet turn: 1 = flat to the camera */
  sx: number;
  /** Height of the body above where it would stand, for the shadow */
  air: number;
}

const fs = (b: Body) => (b.flip ? -1 : 1);

const toWorld = (b: Body, p: Pt): Pt => {
  const lx = p[0] * fs(b) * b.s;
  const ly = p[1] * b.s;
  const cs = Math.cos(b.rot);
  const sn = Math.sin(b.rot);
  return [b.x + lx * cs - ly * sn, b.y + lx * sn + ly * cs];
};

const toLocal = (b: Body, w: Pt): Pt => {
  const dx = (w[0] - b.x) / b.s;
  const dy = (w[1] - b.y) / b.s;
  const cs = Math.cos(b.rot);
  const sn = Math.sin(b.rot);
  return [fs(b) * (dx * cs + dy * sn), -dx * sn + dy * cs];
};

/** A local paw spot pressed onto the ground at g */
const pin = (b: Body, p: Pt, g: number): Pt => toLocal(b, [toWorld(b, p)[0], g - PAW * b.s]);

const solve = (b: Body, paws: Record<Leg, Pt>, ang: Record<Leg, number>): LunaPose => {
  const roots = lunaRoots(b.tilt);
  return {
    tilt: b.tilt,
    neck: b.neck,
    head: b.head,
    tail: b.tail,
    ff: frontIK(roots.ff, paws.ff, ang.ff),
    fn: frontIK(roots.fn, paws.fn, ang.fn),
    bf: hindIK(roots.bf, paws.bf, ang.bf),
    bn: hindIK(roots.bn, paws.bn, ang.bn),
  };
};

const NEUTRAL: Record<Leg, number> = { ff: 28, fn: 34, bf: -41, bn: -34 };
const STAND_ANG: Record<Leg, number> = { ff: 0.22, fn: 0.22, bf: 0.08, bn: 0.08 };

interface StandOpts {
  tilt?: number;
  neck?: number;
  head?: number;
  tail?: number;
  /** Lower the body, rig units */
  drop?: number;
  rot?: number;
  /** Front paws further forward, rig units */
  reach?: number;
  /** Hind paws further back */
  back?: number;
}

const standFrame = (x: number, g: number, flip: boolean, s: number, o: StandOpts = {}): DogFrame => {
  const b: Body = {
    x,
    y: g - (L_H0 - (o.drop ?? 0)) * s,
    rot: o.rot ?? 0,
    flip,
    s,
    tilt: o.tilt ?? 0,
    neck: o.neck ?? -0.8,
    head: o.head ?? 0.12,
    tail: o.tail ?? 0.3,
  };
  const paws = {} as Record<Leg, Pt>;
  for (const l of LEGS) {
    const front = l[0] === 'f';
    paws[l] = pin(b, [NEUTRAL[l] + (front ? o.reach ?? 0 : -(o.back ?? 0)), L_H0 - PAW], g);
  }
  return { b, pose: solve(b, paws, STAND_ANG), sx: 1, air: 0 };
};

/** Piecewise path through keyed points, eased per span */
const pathKeys = (u: number, ks: [number, Pt][]): Pt => {
  if (u <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (u <= ks[i][0]) {
      const k = ease.inOutSine((u - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]));
      return [lerp(ks[i - 1][1][0], ks[i][1][0], k), lerp(ks[i - 1][1][1], ks[i][1][1], k)];
    }
  }
  return ks[ks.length - 1][1];
};
const numKeys = (u: number, ks: [number, number][]) => keys(u, ks, ease.inOutSine);

const GROUND_L = L_H0 - PAW;
/** Gallop: rig units the body travels per stride */
const G_STRIDE = 245;
const FRONT_SWING: [number, Pt][] = [
  [0, [6, GROUND_L]],
  [0.15, [-6, 30]],
  [0.4, [16, 14]],
  [0.7, [62, 22]],
  [0.88, [76, 34]],
  [1, [66, GROUND_L]],
];
const FRONT_SWING_PA: [number, number][] = [[0, -0.5], [0.2, -1.5], [0.45, -1.3], [0.75, 0.5], [1, 0.25]];
const HIND_SWING: [number, Pt][] = [
  [0, [-62, GROUND_L]],
  [0.15, [-84, 30]],
  [0.4, [-66, 12]],
  [0.65, [-30, 18]],
  [0.85, [-2, 32]],
  [1, [8, GROUND_L]],
];
const HIND_SWING_MA: [number, number][] = [[0, -0.7], [0.2, -1.3], [0.5, -0.6], [0.85, 0.1], [1, 0.1]];

const wrap1 = (v: number) => ((v % 1) + 1) % 1;
const bump = (q: number, c: number, w: number) => {
  let d = Math.abs(wrap1(q - c + 0.5) - 0.5);
  d = d / w;
  return d >= 1 ? 0 : Math.pow(Math.cos((d * Math.PI) / 2), 2);
};

/** A rotary gallop, phase from distance so planted paws stay put on the snow */
const gallopFrame = (x: number, g: number, flip: boolean, s: number, dist: number): DogFrame => {
  const q = wrap1(dist / (G_STRIDE * s));
  const f = flip ? -1 : 1;
  const bob = -10 * bump(q, 0.88, 0.14) - 5 * bump(q, 0.4, 0.08);
  const b: Body = {
    x,
    y: g - L_H0 * s + bob * s,
    rot: f * 0.075 * Math.sin(TAU * (q - 0.35)),
    flip,
    s,
    tilt: 0,
    neck: -0.52 + 0.07 * Math.sin(TAU * q),
    head: 0.24 - 0.05 * Math.sin(TAU * q),
    tail: 0.5 + 0.12 * Math.sin(TAU * q + 1),
  };
  const paws = {} as Record<Leg, Pt>;
  const ang = {} as Record<Leg, number>;
  const front = (l: Leg, off: number) => {
    const u = wrap1(q - 0.45 - off);
    if (u < 0.25) {
      paws[l] = pin(b, [lerp(66, 6, u / 0.25), GROUND_L], g);
      ang[l] = lerp(0.25, -0.5, u / 0.25);
    } else {
      const sw = (u - 0.25) / 0.75;
      paws[l] = pathKeys(sw, FRONT_SWING);
      ang[l] = numKeys(sw, FRONT_SWING_PA);
    }
  };
  const hind = (l: Leg, off: number) => {
    const u = wrap1(q - off);
    if (u < 0.28) {
      paws[l] = pin(b, [lerp(8, -62, u / 0.28), GROUND_L], g);
      ang[l] = lerp(0.1, -0.7, u / 0.28);
    } else {
      const sw = (u - 0.28) / 0.72;
      paws[l] = pathKeys(sw, HIND_SWING);
      ang[l] = numKeys(sw, HIND_SWING_MA);
    }
  };
  front('fn', 0);
  front('ff', 0.07);
  hind('bn', 0);
  hind('bf', 0.07);
  return { b, pose: solve(b, paws, ang), sx: 1, air: -bob * s };
};

/** Trot with diagonal pairs, phase from distance */
const T_STRIDE = 122;
const trotFrame = (x: number, g: number, flip: boolean, s: number, dist: number, m: number, o: StandOpts = {}): DogFrame => {
  const phi = dist / (T_STRIDE * s);
  const nod = Math.sin(phi * TAU * 2) * 0.04 * m;
  const b: Body = {
    x,
    y: g - L_H0 * s - 1.6 * m * s * Math.cos(phi * TAU * 2 + 0.6),
    rot: 0,
    flip,
    s,
    tilt: 0,
    neck: (o.neck ?? -0.8) + nod,
    head: (o.head ?? 0.12) - nod,
    tail: o.tail ?? 0.4,
  };
  const roots = lunaRoots(0);
  const paws = {} as Record<Leg, Pt>;
  const ang = {} as Record<Leg, number>;
  const leg = (l: Leg, off: number) => {
    const front = l[0] === 'f';
    const f = gaitFoot(phi, off, 0.58);
    const rw = toWorld(b, [NEUTRAL[l], GROUND_L]);
    const fx = rw[0] + fs(b) * f.rel * T_STRIDE * s * m;
    const fy = g - f.lift * 9 * s * m - PAW * s;
    paws[l] = toLocal(b, [fx, fy]);
    const sw = f.swing >= 0 ? Math.sin(Math.PI * f.swing) * m : 0;
    ang[l] = front ? 0.22 - 1.55 * sw : 0.08 - 0.6 * sw;
  };
  leg('fn', 0);
  leg('bf', 0.03);
  leg('ff', 0.5);
  leg('bn', 0.53);
  void roots;
  return { b, pose: solve(b, paws, ang), sx: 1, air: 0 };
};

/** Up on the hind legs, a = 0 standing .. 1 reared; front paws box (local targets) */
const rearFrame = (x: number, g: number, flip: boolean, s: number, a: number, t: number, o: { punch?: number; lean?: number } = {}): DogFrame => {
  const f = flip ? -1 : 1;
  const st = standFrame(x, g, flip, s);
  const rise = ease.inOutSine(a);
  const rot = -f * (1.02 + (o.lean ?? 0)) * rise;
  // Keep the hip over the hind paws while the chest comes up
  const hipW = toWorld(st.b, [-38, 2]);
  const hipY = hipW[1] - 6 * s * rise;
  const hipX = hipW[0] + f * 4 * s * rise;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const hl: Pt = [-38 * f * s, 2 * s];
  const b: Body = {
    x: hipX - (hl[0] * cs - hl[1] * sn),
    y: hipY - (hl[0] * sn + hl[1] * cs),
    rot,
    flip,
    s,
    tilt: 0,
    neck: lerp(-0.8, 0.35, rise),
    head: lerp(0.12, 0.55, rise),
    tail: lerp(0.3, 0.55, rise),
  };
  const punch = o.punch ?? 1;
  const paws = {} as Record<Leg, Pt>;
  const ang = {} as Record<Leg, number>;
  for (const l of LEGS) {
    const front = l[0] === 'f';
    const groundW = toWorld(st.b, [NEUTRAL[l] + (front ? 0 : 8 * rise), GROUND_L]);
    groundW[1] = g - PAW * s;
    if (front) {
      const box = Math.sin(t * 9 + (l === 'fn' ? 0 : 2.4)) * punch;
      const air = toWorld(b, [50 + 10 * box, 24 - 8 * box]);
      paws[l] = toLocal(b, [lerp(groundW[0], air[0], rise), lerp(groundW[1], air[1], rise)]);
      ang[l] = lerp(0.22, -0.9, rise);
    } else {
      const hw: Pt = [lerp(groundW[0], hipX + f * (l === 'bn' ? 10 : 2) * s, rise), groundW[1]];
      paws[l] = toLocal(b, hw);
      ang[l] = lerp(0.08, 0.25, rise);
    }
  }
  return { b, pose: solve(b, paws, ang), sx: 1, air: 0 };
};

/** Her sit, grounded on rump and haunch with the front legs straight down */
const sitFrame = (x: number, g: number, flip: boolean, s: number, look: number, tail: number): DogFrame => {
  const roots = lunaRoots(LUNA_SIT_TILT);
  const pose: LunaPose = { tilt: LUNA_SIT_TILT, neck: -1.32, head: -0.25 + look, tail, ff: [0, 0, 0.15], fn: [0, 0, 0.15], bf: LUNA_SIT_HIND_FAR, bn: LUNA_SIT_HIND };
  const hb = legFK(roots.bn, LUNA_SIT_HIND, HIND_LEN);
  const low = Math.max(lunaShape(pose).low, hb[3][1] + 3.5);
  pose.fn = frontIK(roots.fn, [roots.fn[0] + 3, low - 3.5], 0.12);
  pose.ff = frontIK(roots.ff, [roots.ff[0] + 6, low - 4.5], 0.12);
  const low2 = lunaShape(pose).low;
  return {
    b: { x, y: g - low2 * s, rot: 0, flip, s, tilt: pose.tilt, neck: pose.neck, head: pose.head, tail },
    pose,
    sx: 1,
    air: 0,
  };
};

/** The leap: legs tucked, body tipped up toward the ball, u through the jump */
const leapFrame = (x: number, g: number, flip: boolean, s: number, h: number, up: number): DogFrame => {
  const f = flip ? -1 : 1;
  const b: Body = {
    x,
    y: g - L_H0 * s - h,
    rot: -f * up,
    flip,
    s,
    tilt: 0,
    neck: -0.95,
    head: -0.05,
    tail: 0.7,
  };
  const paws: Record<Leg, Pt> = { fn: [34, 24], ff: [28, 28], bn: [-68, 44], bf: [-74, 40] };
  const ang: Record<Leg, number> = { fn: -1.3, ff: -1.2, bn: -1.0, bf: -1.1 };
  return { b, pose: solve(b, paws, ang), sx: 1, air: h };
};

const mixFrame = (a: DogFrame, b: DogFrame, k: number): DogFrame => {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const A = a.b;
  const B = b.b;
  return {
    b: {
      x: lerp(A.x, B.x, k),
      y: lerp(A.y, B.y, k),
      rot: lerp(A.rot, B.rot, k),
      flip: k < 0.5 ? A.flip : B.flip,
      s: lerp(A.s, B.s, k),
      tilt: lerp(A.tilt, B.tilt, k),
      neck: lerp(A.neck, B.neck, k),
      head: lerp(A.head, B.head, k),
      tail: lerp(A.tail, B.tail, k),
    },
    pose: mixLuna(a.pose, b.pose, k),
    sx: lerp(a.sx, b.sx, k),
    air: lerp(a.air, b.air, k),
  };
};

/** The puppet turn: squash to edge-on, swap sides, open out again */
const turnSquash = (t: number, t0: number, d = 0.2) => {
  const u = seg(t, t0, t0 + d);
  return { flipped: u >= 0.5, sx: Math.max(0.06, Math.abs(Math.cos(Math.PI * u))) };
};

/* ---------- the choreography ---------- */

const outQuad = (k: number) => 1 - (1 - k) * (1 - k);
const wag = (t: number, rate = 9, amt = 0.22) => amt * Math.sin(t * rate);

/** Luna's x along the yard */
const lunaX = (t: number) => {
  if (t < 3.0) return -210 + 900 * t;
  if (t < 3.1) return 2500;
  if (t < 5.65) return lerp(2060, 930, outQuad(seg(t, 3.1, 5.65)));
  return 930;
};
/** The black dog's x */
const blackX = (t: number) => {
  if (t < 1.72) return 1020 + 6 * Math.sin(t * 2.2);
  if (t < 2.85) {
    const u = t - 1.72;
    const tau = 0.16;
    return 1020 + 6 * Math.sin(1.72 * 2.2) + 840 * (u - tau + tau * Math.exp(-u / tau));
  }
  if (t < 5.3) return lerp(1990, 570, outQuad(seg(t, 2.85, 5.3)));
  return 570;
};

const DT = 1 / 240;
const distTable = (fx: (t: number) => number) => {
  const d: number[] = [0];
  let acc = 0;
  let prev = fx(0);
  for (let i = 1; i <= Math.ceil(DURATION / DT) + 2; i++) {
    const x = fx(i * DT);
    const dx = Math.abs(x - prev);
    if (dx < 200) acc += dx;
    prev = x;
    d.push(acc);
  }
  return d;
};
const lookup = (tab: number[], t: number) => {
  const f = clamp(t, 0, DURATION) / DT;
  const i = Math.floor(f);
  return lerp(tab[i], tab[Math.min(tab.length - 1, i + 1)], f - i);
};

/** Slow walk home: x and distance travelled (analytic, eased) */
const HOME_L: [number, number, number] = [T_HOME + 0.05, 14.45, 430];
const HOME_B: [number, number, number] = [T_HOME + 0.2, 14.3, 600];

const L_DIST = distTable(lunaX);
const B_DIST = distTable(blackX);

/** Wrestle positions after the stop: they inch toward each other */
const L_W = (t: number) => 930 - 100 * tween(t, 6.08, 6.45, ease.inOutSine) + 18 * Math.sin(t * 2.3) * tween(t, 6.4, 7.0) * (1 - tween(t, 9.6, 10.2));
const B_W = (t: number) => 570 + 120 * tween(t, 6.05, 6.42, ease.inOutSine) - 75 * tween(t, 9.7, 10.3, ease.inOutSine) - 14 * Math.sin(t * 2.3 + 0.8) * tween(t, 6.4, 7.0) * (1 - tween(t, 9.6, 10.2));

const rearAmt = (t: number) =>
  tween(t, 6.3, 6.6, ease.inOutSine) * (1 - tween(t, 7.35, 7.7, ease.inOutSine)) + tween(t, 8.85, 9.12, ease.inOutSine) * (1 - tween(t, 9.45, 9.75, ease.inOutSine));

const bowAmt = (t: number, t0: number) => tween(t, t0, t0 + 0.25, ease.inOutSine) * (1 - tween(t, 6.15, 6.35, ease.inOutSine));

/** Lunges during the mouth-wrestle */
const lunge = (t: number, off: number) => tween(t, 7.7, 8.0) * (1 - tween(t, 8.75, 8.95)) * Math.sin((t - 7.7) * 7.5 + off);

const LEAP_0 = 11.22;
const LEAP_1 = 11.95;
const CATCH = 11.6;

const lunaFrame = (t: number): DogFrame => {
  const sBack = LS * 0.86;
  if (t < 3.05) {
    const s = sBack;
    const fr = gallopFrame(lunaX(t), BACK_G, false, s, lookup(L_DIST, t));
    return fr;
  }
  if (t < 5.75) {
    const x = lunaX(t);
    const v = Math.abs((lunaX(t + 0.02) - lunaX(t - 0.02)) / 0.04);
    const gal = gallopFrame(x, FRONT_G, true, LS, lookup(L_DIST, t));
    const skid = standFrame(x, FRONT_G, true, LS, { reach: 22, back: -10, drop: 6, rot: 0.1, neck: -0.95, head: 0.0, tail: 0.6 });
    const k = 1 - clamp((v - 60) / 340);
    return mixFrame(gal, skid, ease.inOutSine(k));
  }
  const x = L_W(t);
  const g = FRONT_G;
  const tailW = 0.45 + wag(t, 10, 0.25);
  // Wrestle: bow, box, lunge, box
  if (t < T_BALL) {
    const bow = bowAmt(t, 5.7);
    const lg = lunge(t, 0);
    const skidEnd = standFrame(x, g, true, LS, { reach: 22, back: -10, drop: 6, rot: 0.1, neck: -0.95, head: 0.0, tail: 0.6 });
    let base = standFrame(x - 16 * lg, g, true, LS, {
      tilt: 0.42 * bow + 0.08 * Math.max(0, lg),
      reach: 26 * bow,
      drop: 4 * bow,
      neck: lerp(-0.8, -0.55, bow) + 0.35 * Math.max(0, lg),
      head: 0.12 + 0.3 * Math.max(0, lg),
      tail: tailW + 0.2 * bow,
    });
    base = mixFrame(skidEnd, base, tween(t, 5.62, 5.95, ease.inOutSine));
    const ra = rearAmt(t);
    if (ra > 0) return mixFrame(base, rearFrame(x, g, true, LS, 1, t, { lean: -0.05 }), ra);
    return base;
  }
  // The ball: watch it come, crouch, leap, land, shake
  const look = tween(t, T_BALL + 0.1, T_BALL + 0.6, ease.inOutSine);
  const watch = standFrame(x, g, true, LS, { neck: lerp(-0.8, -1.25, look), head: lerp(0.12, -0.25, look), tail: tailW + 0.15 });
  if (t < LEAP_0) {
    const cr = tween(t, LEAP_0 - 0.25, LEAP_0, ease.inOutSine);
    const crouch = standFrame(x, g, true, LS, { drop: 9, back: -4, neck: -1.15, head: -0.2, tail: 0.6 });
    return mixFrame(watch, crouch, cr);
  }
  if (t < LEAP_1 + 0.55) {
    const u = seg(t, LEAP_0, LEAP_1);
    // Hang at the top: a flattened arc
    const h = 170 * (1 - Math.pow(Math.abs(2 * u - 1), 2.6));
    const lx = x - 40 * ease.inOutSine(u);
    const air = leapFrame(lx, g, true, LS, h, 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
    const land = standFrame(lx, g, true, LS, { drop: 8 * (1 - tween(t, LEAP_1, LEAP_1 + 0.25)), neck: -0.85, head: 0.1, tail: tailW });
    const into = tween(t, LEAP_0, LEAP_0 + 0.08);
    const outK = tween(t, LEAP_1 - 0.1, LEAP_1 + 0.05, ease.inOutSine);
    const crouch = standFrame(x, g, true, LS, { drop: 9, back: -4, neck: -1.15, head: -0.2, tail: 0.6 });
    // Shake off the snow
    const sh = tween(t, LEAP_1 + 0.15, LEAP_1 + 0.25) * (1 - tween(t, LEAP_1 + 0.45, LEAP_1 + 0.55));
    if (sh > 0) {
      const w = Math.sin(t * 44);
      const shaken = standFrame(lx, g, true, LS, { rot: 0.05 * w * sh, neck: -0.75 + 0.3 * w * sh, head: 0.1 - 0.35 * w * sh, tail: tailW + 0.3 * w });
      return shaken;
    }
    return mixFrame(mixFrame(crouch, air, into), land, outK);
  }
  // Home: trot to the steps and sit
  const x0 = x - 40;
  const [h0, h1, hx] = HOME_L;
  const k = tween(t, h0, h1, ease.inOutSine);
  const hxNow = lerp(x0, hx, k);
  const dist = (x0 - hxNow);
  const m = clamp(Math.sin(Math.PI * seg(t, h0, h1)) * 1.6);
  const tr = trotFrame(hxNow, g - 12 * k, true, LS, dist, m, { tail: tailW });
  const sitK = tween(t, h1 - 0.05, h1 + 0.5, ease.inOutSine);
  if (sitK > 0) {
    const sit = sitFrame(hx, g - 12, true, LS, 0.05 + 0.04 * Math.sin(t * 1.1) - 0.2 * tween(t, T_LIGHT, T_LIGHT + 0.6), -0.2 + wag(t, 7, 0.12));
    return mixFrame(tr, sit, sitK);
  }
  return tr;
};

const blackFrame = (t: number): DogFrame => {
  const sB = BS * 0.9;
  const tailW = 0.4 + wag(t, 11, 0.28);
  if (t < 1.82) {
    // Nose in the snow, then up into a bow as she comes
    const x = blackX(t);
    const sniff = 1 - tween(t, 0.9, 1.25, ease.inOutSine);
    const bow = tween(t, 1.1, 1.35, ease.inOutSine);
    const dig = Math.sin(t * 7) * sniff;
    const fr = standFrame(x, BACK_G + 26, true, sB, {
      tilt: 0.2 * sniff + 0.4 * bow,
      neck: lerp(-0.8, 0.35, sniff) - 0.25 * bow,
      head: lerp(0.12, 0.7, sniff) + 0.06 * dig,
      reach: 24 * bow,
      drop: 4 * bow,
      tail: tailW + 0.2 * bow,
    });
    const tn = turnSquash(t, 1.62, 0.2);
    if (tn.flipped) {
      const g = gallopFrame(x, BACK_G + 26, false, sB, lookup(B_DIST, t));
      return { ...mixFrame(fr, g, 0.5), b: { ...mixFrame(fr, g, 0.5).b, flip: false }, sx: tn.sx };
    }
    return { ...fr, sx: tn.sx };
  }
  if (t < 2.85) return gallopFrame(blackX(t), BACK_G + 26, false, sB, lookup(B_DIST, t));
  if (t < 5.42) {
    const x = blackX(t);
    const v = Math.abs((blackX(t + 0.02) - blackX(t - 0.02)) / 0.04);
    const gal = gallopFrame(x, FRONT_G - 10, true, BS, lookup(B_DIST, t));
    const skid = standFrame(x, FRONT_G - 10, true, BS, { reach: 22, back: -10, drop: 6, rot: 0.1, neck: -0.95, head: 0.0, tail: 0.6 });
    const k = 1 - clamp((v - 60) / 340);
    const fr = mixFrame(gal, skid, ease.inOutSine(k));
    const tn = turnSquash(t, 5.22, 0.2);
    if (tn.flipped) {
      const st = standFrame(x, FRONT_G - 10, false, BS, { tail: tailW });
      return { ...st, sx: tn.sx };
    }
    return { ...fr, sx: tn.sx };
  }
  const g = FRONT_G - 10;
  if (t < T_BALL + 0.15) {
    const x = B_W(t);
    const bow = bowAmt(t, 5.45);
    const lg = lunge(t, 1.6);
    const base = standFrame(x + 16 * lg, g, false, BS, {
      tilt: 0.42 * bow + 0.08 * Math.max(0, lg),
      reach: 26 * bow,
      drop: 4 * bow,
      neck: lerp(-0.8, -0.55, bow) + 0.35 * Math.max(0, lg),
      head: 0.12 + 0.3 * Math.max(0, lg),
      tail: tailW + 0.2 * bow,
    });
    const ra = rearAmt(t + 0.05);
    if (ra > 0) return mixFrame(base, rearFrame(x, g, false, BS, 1, t + 1.3, { lean: 0.04 }), ra);
    return base;
  }
  // Turn to watch the ball, a little hop when she leaps
  const x = B_W(t);
  const tn = turnSquash(t, T_BALL + 0.18, 0.2);
  const look = tween(t, T_BALL + 0.3, T_BALL + 0.8, ease.inOutSine);
  if (!tn.flipped) return { ...standFrame(x, g, false, BS, { tail: tailW }), sx: tn.sx };
  if (t < T_HOME + 0.2) {
    const hop = Math.sin(Math.PI * seg(t, 11.3, 11.75));
    const st = standFrame(x, g, true, BS, {
      neck: lerp(-0.8, -1.2, look) + 0.15 * tween(t, 12.0, 12.4),
      head: lerp(0.12, -0.2, look),
      tail: tailW + 0.1,
      drop: -2 * hop,
    });
    st.b.y -= 34 * hop;
    st.air = 34 * hop;
    return { ...st, sx: tn.sx };
  }
  const [h0, h1, hx] = HOME_B;
  const k = tween(t, h0, h1, ease.inOutSine);
  const hxNow = lerp(x, hx, k);
  const m = clamp(Math.sin(Math.PI * seg(t, h0, h1)) * 1.4);
  const tr = trotFrame(hxNow, g + 6 * k, true, BS, x - hxNow, m, { tail: tailW });
  const sitK = tween(t, h1 - 0.05, h1 + 0.5, ease.inOutSine);
  if (sitK > 0) {
    const sit = sitFrame(hx, g + 6, true, BS, 0.1 + 0.05 * Math.sin(t * 0.9 + 1) - 0.15 * tween(t, T_LIGHT + 0.1, T_LIGHT + 0.8), -0.2 + wag(t, 8, 0.15));
    return mixFrame(tr, sit, sitK);
  }
  return tr;
};

/* ---------- camera ---------- */

function camera(t: number): View {
  const x = keys(t, [[0, 800], [2.4, 880], [3.6, 960], [5.4, 800], [7.4, 765], [9.6, 760], [10.6, 690], [11.6, 745], [12.9, 700], [14.6, 560], [DURATION, 560]], ease.inOutSine);
  const y = keys(t, [[0, 440], [2.4, 455], [3.6, 480], [5.4, 560], [7.4, 590], [9.6, 595], [10.6, 545], [11.6, 520], [12.9, 560], [14.6, 560], [DURATION, 552]], ease.inOutSine);
  let z = keys(t, [[0, 1.0], [2.4, 1.04], [3.6, 1.07], [5.4, 1.2], [7.4, 1.38], [9.6, 1.45], [10.6, 1.3], [11.6, 1.34], [12.9, 1.2], [14.6, 1.22], [DURATION, 1.28]], ease.inOutSine);
  z += 0.035 * Math.exp(-Math.pow((t - CATCH - 0.04) / 0.12, 2));
  return { x: x + 4 * Math.sin(t * 0.7), y: y + 3 * Math.sin(t * 0.9 + 1), z };
}

const camFor = (r: Riso, C: View, p: number) => {
  const l = layerView(C, p);
  r.camera(l.x, l.y, l.z);
};

/** Where a point on layer p lands on screen */
const toScreen = (C: View, p: number, w: Pt): Pt => {
  const l = layerView(C, p);
  return [(w[0] - l.x) * l.z + 800, (w[1] - l.y) * l.z + 450];
};

/* ---------- state ---------- */

interface Flakes {
  p: number;
  rect: Rect;
  xs: Float32Array;
  ys: Float32Array;
  sp: Float32Array;
  sw: Float32Array;
  ph: Float32Array;
  sz: Float32Array;
  depth: number;
  alpha: number;
}

interface State {
  k: Craft;
  dog: Stamp;
  sky: Plate;
  plates: Plate[];
  ground: Plate;
  fore: Plate;
  flakes: Flakes[];
  flake: Pt[];
  ball: { from: Pt; to: Pt };
  windows: { p: number; x: number; y: number; w: number; h: number; on: number }[];
  smoke: Pt;
}

const PORCH_LIGHT: Pt = [238, 452];

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** Spruce with a white drape of snow on each tier */
const spruce = (green: Path2D, snow: Path2D, x: number, base: number, h: number, w: number, seed: number) => {
  const tiers = 6;
  cutPath(pinePts(x, base, h, w, seed, tiers), 0.9, seed, 6, green);
  for (let k = 1; k <= tiers; k++) {
    const y = base - h + (h * 0.88 * k) / tiers;
    const ww = (w * (0.28 + 0.72 * (k / tiers))) / 2;
    const j = 0.88 + hash(seed + k * 7.1) * 0.24;
    const yTop = k === 1 ? base - h : base - h + (h * 0.88 * (k - 1)) / tiers - h * 0.035;
    const xin = k === 1 ? 0 : ((w * (0.28 + 0.72 * ((k - 1) / tiers))) / 2) * 0.42;
    for (const sd of [1, -1]) {
      const tip: Pt = [x + sd * ww * j, y];
      const inner: Pt = [x + sd * xin, yTop];
      const pts: Pt[] = [inner, [lerp(inner[0], tip[0], 0.5), lerp(inner[1], tip[1], 0.5) - 3], tip, [tip[0] - sd * 8, tip[1] + 5], [lerp(inner[0], tip[0], 0.45), lerp(inner[1], tip[1], 0.45) + 6], [inner[0], inner[1] + 7]];
      cutPath(pts, 0.6, seed + k * 3 + sd, 5, snow);
    }
  }
};

/** A bare maple: tapering limbs, snow lying along the top of every branch */
const maple = (wood: Path2D, snow: Path2D, x: number, y: number, a: number, len: number, w: number, d: number, rng: () => number) => {
  const x2 = x + Math.sin(a) * len;
  const y2 = y - Math.cos(a) * len;
  taper([x, y], [x2, y2], w, w * 0.68, wood, { ext0: w * 0.15, ext1: 1, seed: x * 0.1 + d });
  if (Math.abs(Math.sin(a)) > 0.3 && w > 2.2) {
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    let nx = -uy;
    let ny = ux;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const o0 = w * 0.42;
    const o1 = w * 0.68 * 0.42;
    taper([x + ux * len * 0.08 + nx * o0, y + uy * len * 0.08 + ny * o0], [x2 + nx * o1, y2 + ny * o1], w * 0.5, w * 0.3, snow, { seed: y * 0.1 + d });
  }
  if (d <= 0) return;
  const n = d > 3 ? 2 : 2 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const spread = n === 2 ? (i ? 0.42 : -0.38) : (i - 1) * 0.5;
    maple(wood, snow, x2, y2, a + spread + (rng() - 0.5) * 0.3, len * (0.7 + rng() * 0.12), w * 0.66, d - 1, rng);
  }
};

const rectPath = (x: number, y: number, w: number, h: number, seed: number, p: Path2D = new Path2D(), amp = 0.6) =>
  cutPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], amp, seed, 8, p);

const build = (r: Riso): State => {
  const k = makeCraft(r, 61);
  const rng = mulberry(29);
  const views: View[] = [];
  for (let t = 0; t <= DURATION; t += 0.05) views.push(camera(t));
  const X0 = -1200;
  const X1 = 3200;
  const BOTTOM = 1600;

  /* sky */
  const sky = bakePlate(r, 0, { x: 0, y: 0, w: 1600, h: 900 }, (g) => {
    g.fillStyle = P.skyTop;
    g.fillRect(0, 0, 1600, 900);
    [60, 190, 300, 390].forEach((y, i) => {
      const band = cutRidge((x) => y + 12 * Math.sin(x / 210 + i * 1.9) + 6 * Math.sin(x / 73 + i), -60, 1660, 1000, 70 + i, 1.4, 12);
      sheet(g, k, band, mix(P.skyTop, P.skyLow, (i + 1) / 4), { depth: 3, edge: 0.35, seed: 70 + i, tex: 0.6 });
    });
  }, 1);

  const plates: Plate[] = [];
  const plate = (p: number, top: number, draw: (g: Ctx) => void, res = 1.25) =>
    plates.push(bakePlate(r, p, clipRect(viewRect(views, p), { x: -1e4, y: top, w: 2e4, h: 2e4 }), draw, res));

  /* far treeline and a water tower-free Michigan horizon: lumpy bare woods */
  plate(0.14, 240, (g) => {
    const y = (x: number) => 395 - 26 * Math.sin(x / 160 + 1) - 14 * Math.sin(x / 47) - 10 * Math.abs(Math.sin(x / 23));
    sheet(g, k, tornRidge(y, X0, X1, BOTTOM, 3, 81), P.snow, { depth: 2, tex: 0.4, seed: 81 });
    sheet(g, k, cutRidge(y, X0, X1, BOTTOM, 82, 1.6, 7), P.far, { depth: 2, edge: 0.4, seed: 82, shade: [330, 600] });
    const trunks = new Path2D();
    for (let x = X0; x < X1; x += 20 + rng() * 40) {
      const top = y(x) - 20 - rng() * 30;
      taper([x, y(x) + 30], [x + (rng() - 0.5) * 8, top], 3, 1.2, trunks, { seed: x });
    }
    sheet(g, k, trunks, P.farDeep, { depth: 1.5, edge: 0, seed: 83, tex: 0.5 });
  }, 1);

  /* neighbours' houses */
  const windows: State['windows'] = [];
  let smoke: Pt = [0, 0];
  plate(0.3, 220, (g) => {
    const homes = [[-380, 300, 175], [120, 340, 205], [640, 280, 160], [1120, 380, 215], [1640, 300, 180], [2150, 340, 200]];
    homes.forEach(([hx, w, h], i) => {
      const base = 560;
      const wall = new Path2D();
      const wallTop = base - h * 0.55;
      rectPath(hx, wallTop, w, base - wallTop + 40, 90 + i, wall);
      sheet(g, k, wall, i % 2 ? P.houseB : P.houseA, { depth: 3, edge: 0.4, seed: 90 + i, shade: [wallTop, base] });
      const peak = base - h;
      const roof = new Path2D();
      cutPath([[hx - 20, wallTop + 6], [hx + w / 2, peak], [hx + w + 20, wallTop + 6], [hx + w + 14, wallTop + 16], [hx + w / 2, peak + 12], [hx - 14, wallTop + 16]], 1, 100 + i, 8, roof);
      sheet(g, k, roof, P.roofDk, { depth: 3, edge: 0, seed: 100 + i });
      const snowRoof = new Path2D();
      cutPath(tornRidgePts(hx - 22, wallTop + 4, hx + w / 2, peak - 6, hx + w + 22, 110 + i), 0.6, 110 + i, 5, snowRoof);
      sheet(g, k, snowRoof, P.roof, { depth: 2.5, edge: 0.5, seed: 110 + i, tex: 0.5 });
      // Chimney
      if (i === 3) {
        const cx = hx + w * 0.72;
        const cy = lerp(peak, wallTop, 0.44) - 32;
        const ch = new Path2D();
        rectPath(cx, cy, 24, 60, 120, ch);
        sheet(g, k, ch, '#8f6f6a', { depth: 2.5, edge: 0.3, seed: 120 });
        const cap = new Path2D();
        cutPath(blobPts(cx + 12, cy - 2, 17, 6, 121, 0.1, 18), 0.5, 121, 5, cap);
        sheet(g, k, cap, P.roof, { depth: 2, edge: 0.4, seed: 121 });
        smoke = [cx + 12, cy - 8];
      }
      // Upper windows
      const nw = Math.max(2, Math.floor(w / 110));
      for (let j = 0; j < nw; j++) {
        const wx = hx + (w / (nw + 1)) * (j + 1) - 15;
        const wy = wallTop + 18;
        const win = new Path2D();
        rectPath(wx, wy, 30, 38, 130 + i * 5 + j, win, 0.4);
        sheet(g, k, win, P.window, { depth: 1.5, edge: 0, seed: 130 + i * 5 + j, tex: 0.5 });
      }
      const gw = new Path2D();
      const gx = hx + w / 2 - 11;
      const gy = lerp(peak, wallTop, 0.52) - 4;
      rectPath(gx, gy, 22, 26, 150 + i, gw, 0.3);
      sheet(g, k, gw, P.window, { depth: 1.2, edge: 0, seed: 150 + i, tex: 0.5 });
      windows.push({ p: 0.3, x: gx, y: gy, w: 22, h: 26, on: 12.2 + hash(i * 7) * 2.4 });
    });
  }, 1);

  /* spruces behind the fence */
  plate(0.5, 150, (g) => {
    const green = new Path2D();
    const snow = new Path2D();
    const xs = [-260, 60, 380, 700, 960, 1500, 1820, 2150, 2480];
    xs.forEach((x, i) => {
      const h = 250 + hash(i + 3) * 120;
      spruce(green, snow, x + (hash(i) - 0.5) * 80, 590, h, h * 0.42, 140 + i * 11);
    });
    sheet(g, k, green, P.spruce, { depth: 6, edge: 0.5, seed: 141, shade: [300, 600] });
    sheet(g, k, snow, P.snow, { depth: 2.5, edge: 0.5, seed: 142, tex: 0.5 });
  });

  /* fence, maple, sled */
  plate(0.78, -400, (g) => {
    const boards = new Path2D();
    const boardsB = new Path2D();
    const caps = new Path2D();
    for (let x = -900, i = 0; x < 2600; x += 36, i++) {
      const top = 470 + (hash(i * 3.3) - 0.5) * 4;
      const pts: Pt[] = [[x, top + 6], [x + 17, top - 4], [x + 34, top + 6], [x + 34, 680], [x, 680]];
      cutPath(pts, 0.5, 160 + i, 7, i % 2 ? boards : boardsB);
      cutPath(blobPts(x + 17, top - 3, 18, 5.5 + hash(i) * 2.5, 300 + i, 0.12, 16), 0.5, 300 + i, 4, caps);
    }
    sheet(g, k, boards, P.fence, { depth: 6, edge: 0.4, seed: 161, shade: [460, 680] });
    sheet(g, k, boardsB, P.fenceLt, { depth: 1, edge: 0.4, seed: 162, shade: [460, 680] });
    const rail = new Path2D();
    rectPath(-900, 520, 3500, 9, 163, rail);
    sheet(g, k, rail, P.fenceDk, { depth: 2, edge: 0.2, seed: 163 });
    const railSnow = new Path2D();
    cutPath([[-900, 521], [2600, 521], [2600, 516], [-900, 515]], 0.8, 164, 9, railSnow);
    sheet(g, k, railSnow, P.snow, { depth: 1, tex: 0.4, seed: 164 });
    sheet(g, k, caps, P.snow, { depth: 2.5, edge: 0.5, seed: 165, tex: 0.5 });
    // The sled leaning on the boards
    const sled = new Path2D();
    const sx = 860;
    cutPath([[sx, 640], [sx + 20, 520], [sx + 40, 506], [sx + 62, 512], [sx + 76, 528], [sx + 60, 645]], 0.8, 170, 6, sled);
    sheet(g, k, sled, P.sled, { depth: 5, edge: 0.6, seed: 170, shade: [500, 650] });
    const slats = new Path2D();
    for (let j = 0; j < 3; j++) cutPath([[sx + 18 + j * 13, 535], [sx + 24 + j * 13, 535], [sx + 14 + j * 13, 632], [sx + 8 + j * 13, 632]], 0.3, 171 + j, 5, slats);
    sheet(g, k, slats, '#a62c25', { depth: 0.8, edge: 0, seed: 171 });
    const rope = new Path2D();
    taper([sx + 40, 512], [sx + 18, 560], 3, 3, rope, { seed: 175 });
    taper([sx + 18, 560], [sx + 44, 600], 3, 3, rope, { seed: 176 });
    sheet(g, k, rope, '#e6d6b3', { depth: 1.5, edge: 0, seed: 177 });
    // Maple
    const wood = new Path2D();
    const snow = new Path2D();
    const mr = mulberry(44);
    maple(wood, snow, 1090, 700, 0.02, 230, 44, 0, mr);
    maple(wood, snow, 1092, 480, -0.55, 170, 26, 4, mr);
    maple(wood, snow, 1095, 470, 0.5, 190, 28, 4, mr);
    maple(wood, snow, 1093, 420, 0.08, 200, 26, 4, mr);
    sheet(g, k, wood, P.bark, { depth: 7, edge: 0.3, seed: 180, shade: [-300, 700] });
    sheet(g, k, snow, P.snow, { depth: 1.5, edge: 0.4, seed: 181, tex: 0.5 });
    // Drift along the foot of the fence
    sheet(g, k, cutRidge((x) => 640 + 10 * Math.sin(x / 90) + 6 * Math.sin(x / 31), -900, 2600, BOTTOM, 185, 1.2, 8), P.snow, { depth: 6, edge: 0.6, seed: 185, shade: [620, 720] });
  });

  /* yard and house */
  const groundTop = (x: number) => 640 + 8 * Math.sin(x / 170) + 4 * Math.sin(x / 53);
  const ground = bakePlate(r, 1, clipRect(viewRect(views, 1), { x: -1e4, y: -420, w: 2e4, h: 2e4 }), (g) => {
    sheet(g, k, cutRidge(groundTop, X0, X1, BOTTOM, 200, 1.2, 8), P.snow, { depth: 9, edge: 0.6, seed: 200, shade: [620, 980], shadeK: 0.8 });
    // Long blue drifts so the yard reads deep
    [[690, 0], [760, 2], [840, 4]].forEach(([y0, s0], i) => {
      const top: Pt[] = [];
      for (let x = X0; x <= X1; x += 12) top.push([x, y0 + 10 * Math.sin(x / 140 + s0) + 5 * Math.sin(x / 47)]);
      const strip: Pt[] = [...top, ...[...top].reverse().map(([x, y]) => [x, y + 9 + 5 * Math.sin(x / 60 + i)] as Pt)];
      sheet(g, k, cutPath(strip, 0.8, 210 + i, 9), P.snowShade, { depth: 0, edge: 0, seed: 210 + i, tex: 0.5 });
    });
    /* the house */
    const wallR = 300;
    const wall = new Path2D();
    rectPath(-900, -420, wallR + 900, 1170, 220, wall, 0.8);
    sheet(g, k, wall, P.siding, { depth: 10, edge: 0.5, seed: 220, shade: [-420, 760], shadeK: 0.6 });
    const laps = new Path2D();
    for (let y = -400; y < 740; y += 20) cutPath([[-900, y], [wallR - 2, y], [wallR - 2, y + 3], [-900, y + 3]], 0.3, 230 + y, 14, laps);
    sheet(g, k, laps, P.sidingDk, { depth: 0, edge: 0, seed: 230, tex: 0.3 });
    const corner = new Path2D();
    rectPath(wallR - 20, -420, 22, 1170, 231, corner, 0.5);
    sheet(g, k, corner, P.trim, { depth: 2, edge: 0.5, seed: 231 });
    // Door with a glass pane
    const door = new Path2D();
    rectPath(78, 478, 118, 220, 240, door);
    const doorTrim = new Path2D();
    rectPath(66, 466, 142, 236, 241, doorTrim);
    sheet(g, k, doorTrim, P.trim, { depth: 3, edge: 0.5, seed: 241 });
    sheet(g, k, door, P.door, { depth: 2, edge: 0.4, seed: 240, shade: [478, 700] });
    const pane = new Path2D();
    rectPath(98, 498, 78, 70, 242, pane);
    sheet(g, k, pane, P.window, { depth: 1, edge: 0, seed: 242 });
    windows.push({ p: 1, x: 98, y: 498, w: 78, h: 70, on: 13.6 });
    // Window left of the door, and one upstairs
    for (const [wx, wy, ww, wh, sd] of [[-250, 470, 150, 150, 250], [-140, 130, 130, 150, 260]]) {
      const tr = new Path2D();
      rectPath(wx - 12, wy - 12, ww + 24, wh + 24, sd, tr);
      sheet(g, k, tr, P.trim, { depth: 3, edge: 0.5, seed: sd });
      const gl = new Path2D();
      rectPath(wx, wy, ww, wh, sd + 1, gl);
      sheet(g, k, gl, P.window, { depth: 1, edge: 0, seed: sd + 1 });
      const mull = new Path2D();
      rectPath(wx + ww / 2 - 3, wy, 6, wh, sd + 2, mull, 0.2);
      rectPath(wx, wy + wh / 2 - 3, ww, 6, sd + 3, mull, 0.2);
      sheet(g, k, mull, P.trim, { depth: 1, edge: 0, seed: sd + 2 });
      const sill = new Path2D();
      cutPath(blobPts(wx + ww / 2, wy + wh + 13, ww / 2 + 16, 6, sd + 4, 0.08, 20), 0.5, sd + 4, 5, sill);
      sheet(g, k, sill, P.snow, { depth: 2, edge: 0.4, seed: sd + 4 });
      windows.push({ p: 1, x: wx, y: wy, w: ww, h: wh, on: sd === 250 ? 13.9 : 14.4 });
    }
    // Porch roof with snow on it and icicles below
    const roof = new Path2D();
    cutPath([[-900, 372], [wallR + 70, 380], [wallR + 70, 400], [-900, 396]], 0.8, 270, 9, roof);
    sheet(g, k, roof, P.trim, { depth: 6, edge: 0.6, seed: 270 });
    const roofSnow = new Path2D();
    cutPath(tornRidgePts(-900, 376, wallR - 100, 350, wallR + 80, 271), 0.8, 271, 6, roofSnow);
    sheet(g, k, roofSnow, P.snow, { depth: 3, edge: 0.6, seed: 271, tex: 0.5 });
    const ice = new Path2D();
    for (let x = -880; x < wallR + 60; x += 18 + rng() * 26) {
      const len = 12 + rng() * rng() * 46;
      cutPath([[x - 4, 398], [x + 4, 398], [x + 0.5, 398 + len]], 0.2, 280 + x, 4, ice);
    }
    sheet(g, k, ice, '#e8eef4', { depth: 2, edge: 0.6, seed: 280, tex: 0.3 });
    const post = new Path2D();
    rectPath(wallR + 44, 398, 18, 300, 290, post);
    sheet(g, k, post, P.trim, { depth: 6, edge: 0.5, seed: 290 });
    // Porch lantern
    const [lx, ly] = PORCH_LIGHT;
    const lan = new Path2D();
    rectPath(lx - 4, ly - 34, 8, 20, 300, lan, 0.2);
    cutPath([[lx - 18, ly - 16], [lx + 18, ly - 16], [lx + 12, ly - 24], [lx - 12, ly - 24]], 0.3, 301, 4, lan);
    rectPath(lx - 15, ly + 20, 30, 7, 302, lan, 0.2);
    sheet(g, k, lan, P.lantern, { depth: 3, edge: 0.3, seed: 300 });
    // Porch deck and steps
    const deck = new Path2D();
    rectPath(-900, 698, wallR + 970, 18, 310, deck);
    sheet(g, k, deck, P.trim, { depth: 5, edge: 0.6, seed: 310 });
    const lattice = new Path2D();
    rectPath(-900, 716, wallR + 960, 40, 311, lattice);
    sheet(g, k, lattice, '#6d5a52', { depth: 3, edge: 0, seed: 311 });
    const steps = new Path2D();
    rectPath(wallR + 50, 722, 70, 16, 312, steps);
    rectPath(wallR + 90, 744, 70, 16, 313, steps);
    sheet(g, k, steps, P.trim, { depth: 5, edge: 0.6, seed: 312 });
    const stepSnow = new Path2D();
    cutPath(blobPts(wallR - 60, 699, 300, 7, 314, 0.06, 40), 0.6, 314, 6, stepSnow);
    cutPath(blobPts(wallR + 92, 722, 34, 5, 315, 0.08, 20), 0.5, 315, 5, stepSnow);
    cutPath(blobPts(wallR + 130, 744, 30, 5, 316, 0.08, 20), 0.5, 316, 5, stepSnow);
    sheet(g, k, stepSnow, P.snow, { depth: 2, edge: 0.5, seed: 314, tex: 0.5 });
    // Snow banked against the house
    sheet(g, k, cutRidge((x) => 742 + 14 * Math.sin(x / 80) - 30 * smoothstep(wallR + 220, wallR - 40, x), -900, wallR + 260, BOTTOM, 320, 1.2, 8), P.snow, { depth: 7, edge: 0.6, seed: 320, shade: [700, 900] });
  });

  /* foreground: a snowbank, dry grass and a winterberry bush */
  const foreP = 1.35;
  const fore = bakePlate(r, foreP, clipRect(viewRect(views, foreP), { x: -1e4, y: 400, w: 2e4, h: 2e4 }), (g) => {
    const bank = (x: number) => 868 + 22 * Math.sin(x / 170) + 9 * Math.sin(x / 61);
    const grass = new Path2D();
    for (let x = -900; x < 2600; x += 30 + rng() * 60) {
      if (rng() < 0.4) continue;
      const n = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const a = (j / (n - 1) - 0.5) * 0.7 + (rng() - 0.5) * 0.2;
        const len = 40 + rng() * 55;
        taper([x + j * 3, bank(x) + 12], [x + j * 3 + Math.sin(a) * len, bank(x) + 12 - Math.cos(a) * len], 4, 1.2, grass, { seed: x + j });
      }
    }
    sheet(g, k, grass, P.grass, { depth: 4, edge: 0.3, seed: 400 });
    const twigs = new Path2D();
    const twigSnow = new Path2D();
    const berries = new Path2D();
    for (const bx of [1560, -60]) {
      const br = mulberry(bx + 5);
      for (let j = 0; j < 9; j++) {
        const a = (j / 8 - 0.5) * 1.5 + (br() - 0.5) * 0.2;
        maple(twigs, twigSnow, bx + (j - 4) * 6, bank(bx) + 20, a, 70 + br() * 50, 5, 2, br);
        for (let b = 0; b < 6; b++) {
          const d = 40 + br() * 90;
          const bxp = bx + (j - 4) * 6 + Math.sin(a) * d + (br() - 0.5) * 16;
          const byp = bank(bx) + 20 - Math.cos(a) * d + (br() - 0.5) * 16;
          cutPath(blobPts(bxp, byp, 5, 5, bx + j * 9 + b, 0.08, 10), 0.3, b, 4, berries);
        }
      }
    }
    sheet(g, k, twigs, P.twig, { depth: 6, edge: 0.2, seed: 410 });
    sheet(g, k, berries, P.berry, { depth: 3, edge: 0.6, seed: 411 });
    sheet(g, k, twigSnow, P.snow, { depth: 1, edge: 0.3, seed: 412, tex: 0.4 });
    sheet(g, k, tornRidge(bank, -1100, 3000, BOTTOM, 4, 420), P.snow, { depth: 12, edge: 0.5, seed: 420, tex: 0.5 });
    sheet(g, k, cutRidge(bank, -1100, 3000, BOTTOM, 421, 1.3, 8), P.snowShade, { depth: 2, edge: 0.6, seed: 421, shade: [800, 1000] });
  });

  /* snowfall at four depths */
  const flakes: Flakes[] = [];
  const addFlakes = (p: number, n: number, sp: [number, number], sz: [number, number], depth: number, alpha: number, seed: number) => {
    const fr = mulberry(seed);
    const rect = viewRect(views, p, 60);
    const f: Flakes = {
      p,
      rect,
      xs: new Float32Array(n),
      ys: new Float32Array(n),
      sp: new Float32Array(n),
      sw: new Float32Array(n),
      ph: new Float32Array(n),
      sz: new Float32Array(n),
      depth,
      alpha,
    };
    for (let i = 0; i < n; i++) {
      f.xs[i] = rect.x + fr() * rect.w;
      f.ys[i] = fr() * rect.h;
      f.sp[i] = lerp(sp[0], sp[1], fr());
      f.sw[i] = 6 + fr() * 14;
      f.ph[i] = fr() * TAU;
      f.sz[i] = lerp(sz[0], sz[1], fr());
    }
    flakes.push(f);
  };
  addFlakes(0.3, 170, [26, 40], [1.8, 3], 1, 0.9, 501);
  addFlakes(0.6, 130, [45, 65], [3, 4.6], 2, 1, 502);
  addFlakes(1.0, 90, [70, 100], [4.5, 7], 3.5, 1, 503);
  addFlakes(1.75, 16, [120, 170], [10, 16], 6, 0.92, 504);

  // The ball flies from the porch to her mouth at the top of the leap
  const at = lunaFrame(CATCH);
  const nose = toWorld(at.b, lunaShape(at.pose).nose);

  return {
    k,
    dog: makeStamp(300, 300, Math.max(1.8, r.scale * 1.9), 0.6),
    sky,
    plates,
    ground,
    fore,
    flakes,
    flake: blobPts(0, 0, 1, 1, 9, 0.12, 9),
    ball: { from: [40, 470], to: [nose[0] - 8, nose[1] - 2] },
    windows,
    smoke,
  };
};

/** Snow on a gable: ragged along the top, points left-eave, peak, right-eave */
function tornRidgePts(x0: number, y0: number, xp: number, yp: number, x1: number, seed: number): Pt[] {
  const pts: Pt[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = lerp(x0, x1, u);
    const y = x < xp ? lerp(y0, yp, (x - x0) / (xp - x0)) : lerp(yp, y0, (x - xp) / (x1 - xp));
    pts.push([x, y - 4 - hash(seed + i * 1.7) * 4]);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    const x = lerp(x0, x1, u);
    const y = x < xp ? lerp(y0, yp, (x - x0) / (xp - x0)) : lerp(yp, y0, (x - xp) / (x1 - xp));
    pts.push([x, y + 7 + 3 * Math.sin(i * 1.3 + seed)]);
  }
  return pts;
}

/* ---------- live drawing ---------- */

const drawFlakes = (c: Ctx, k: Craft, f: Flakes, shape: Pt[], t: number, color: string) => {
  const p = new Path2D();
  const { x: rx, y: ry, w: rw, h: rh } = f.rect;
  for (let i = 0; i < f.xs.length; i++) {
    const y = ry + ((((f.ys[i] + f.sp[i] * t) % rh) + rh) % rh);
    let x = f.xs[i] + f.sw[i] * Math.sin(t * 0.8 + f.ph[i]) + 14 * t * (0.5 + f.p * 0.5);
    x = rx + ((((x - rx) % rw) + rw) % rw);
    const s = f.sz[i];
    const a = f.ph[i] + t * 0.5;
    const cs = Math.cos(a) * s;
    const sn = Math.sin(a) * s;
    for (let j = 0; j < shape.length; j++) {
      const [u, v] = shape[j];
      const px = x + u * cs - v * sn;
      const py = y + u * sn + v * cs;
      if (j) p.lineTo(px, py);
      else p.moveTo(px, py);
    }
    p.closePath();
  }
  c.save();
  c.globalAlpha = f.alpha;
  sheet(c, k, p, color, { depth: f.depth, shadow: 0.22, edge: 0, tex: 0.3, seed: f.p * 10 });
  c.restore();
};

/** Snow kicked up by paws: paper crumbs popping out and settling */
const sprayAt = (p: Path2D, x: number, y: number, age: number, dir: number, seed: number, n = 5, power = 1) => {
  if (age < 0 || age > 0.55) return;
  for (let j = 0; j < n; j++) {
    const h = hash(seed * 3.1 + j * 7.7);
    const h2 = hash(seed * 1.7 + j * 3.3);
    const vx = dir * (-40 - 140 * h) * power;
    const vy = (-120 - 160 * h2) * power;
    const px = x + vx * age;
    const py = y + vy * age + 520 * age * age;
    if (py > y + 6) continue;
    const r = (3 + 5 * h2) * (1 - age / 0.6) * Math.sqrt(power);
    if (r < 0.6) continue;
    const pts: Pt[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + h * 3;
      const rr = r * (0.75 + 0.5 * hash(seed + j + i * 1.3));
      pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]);
    }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  }
};

/** Sprays behind a running dog, emitted on a fixed time grid so they are a pure function of t */
const runSpray = (p: Path2D, t: number, fx: (t: number) => number, g: number, s: number, t0: number, t1: number, seed: number) => {
  const step = 0.07;
  const n0 = Math.floor(t / step);
  for (let j = 0; j < 9; j++) {
    const te = (n0 - j) * step;
    if (te < t0 || te > t1) continue;
    const v = (fx(te + 0.01) - fx(te - 0.01)) / 0.02;
    if (Math.abs(v) < 160) continue;
    const dir = Math.sign(v);
    const x = fx(te) - dir * 40 * s + (hash(te * 13 + seed) - 0.5) * 30;
    sprayAt(p, x, g - 2, t - te, dir, Math.round(te * 100) + seed, 4, clamp(Math.abs(v) / 700, 0.4, 1.2));
  }
};

/** Paw prints in the trampled snow behind each pass */
const tracks = (p: Path2D, x0: number, x1: number, g: number, stride: number, seed: number) => {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  for (let x = a + (hash(seed) * stride) % stride; x < b; x += stride / 2) {
    const i = Math.round(x);
    for (let j = 0; j < 2; j++) {
      const px = x + j * 16 + (hash(i + j) - 0.5) * 8;
      const py = g + 1 + (hash(i * 3 + j) - 0.5) * 8;
      p.moveTo(px + 7, py);
      p.ellipse(px, py, 7, 2.6, 0, 0, TAU);
    }
  }
};

const drawDog = (c: Ctx, s: State, fr: DogFrame, look: DogLook, seed: number, eyeCatch: boolean) => {
  const b = fr.b;
  const draw = () =>
    stampDraw(
      c,
      s.k,
      s.dog,
      b.x,
      b.y,
      (g) => {
        lunaArt(g, fr.pose, look);
        if (eyeCatch) {
          const e = lunaShape(fr.pose).eye;
          g.fillStyle = '#d9d4cc';
          g.beginPath();
          g.arc(e[0] + 0.8, e[1] - 0.8, 0.9, 0, TAU);
          g.fill();
        }
      },
      { scale: b.s, rot: b.rot, flip: b.flip, depth: 6 + fr.air * 0.12, seed }
    );
  if (fr.sx < 0.999) {
    c.save();
    c.translate(b.x, 0);
    c.scale(fr.sx, 1);
    c.translate(-b.x, 0);
    draw();
    c.restore();
  } else draw();
};

/** A small cardinal on the fence, gone in a flurry as Luna tears past */
const drawCardinal = (c: Ctx, k: Craft, t: number) => {
  const fly = seg(t, 1.55, 3.0);
  if (fly >= 1) return;
  const x = 1172 + 520 * fly * fly + 40 * fly;
  const y = 458 - 360 * ease.outSine(fly) + 6 * fly;
  const flap = fly > 0 ? Math.sin(t * 46) : 0;
  const hop = fly === 0 ? Math.abs(Math.sin(t * 3.1)) * 2 * (Math.sin(t * 0.9) > 0.3 ? 1 : 0) : 0;
  c.save();
  c.translate(x, y - hop);
  c.scale(1.15, 1.15);
  const body = new Path2D();
  cutPath(blobPts(0, -9, 11, 7.5, 601, 0.06, 20, -0.25), 0.3, 601, 4, body);
  cutPath([[-8, -6], [-26, -4 + (fly ? 4 : 2)], [-24, 1 + (fly ? 4 : 1)], [-6, -2]], 0.3, 602, 4, body);
  cutPath([[4, -15], [6, -26], [12, -18], [13, -12]], 0.3, 603, 4, body);
  cutPath(blobPts(9, -14, 6.5, 6, 604, 0.05, 14), 0.3, 604, 4, body);
  sheet(c, k, body, P.cardinal, { depth: 3, edge: 0.5, seed: 605 });
  const mask = new Path2D();
  cutPath([[9, -17], [15, -15], [14, -10], [8, -10]], 0.2, 606, 3, mask);
  sheet(c, k, mask, '#231a18', { depth: 0, edge: 0, seed: 606, tex: 0.2 });
  const beak = new Path2D();
  cutPath([[14, -15], [21, -12.5], [14, -10]], 0.15, 607, 3, beak);
  sheet(c, k, beak, '#e98f3a', { depth: 0.5, edge: 0, seed: 607, tex: 0.2 });
  const wing = new Path2D();
  const wa = fly > 0 ? -0.9 * flap : 0;
  const wpts: Pt[] = [[-6, -10], [6, -10], [-14 + 4 * Math.abs(flap), -10 - 18 * Math.max(0, -wa) + 14 * Math.max(0, wa)]];
  cutPath(fly > 0 ? wpts : [[-8, -11], [5, -10], [-14, -4]], 0.2, 608, 3, wing);
  sheet(c, k, wing, '#9e2421', { depth: 1.5, edge: 0.3, seed: 608 });
  if (fly === 0) {
    const legs = new Path2D();
    taper([-1, -3], [-2, 4], 1.6, 1.4, legs, { seed: 609 });
    taper([3, -3], [3, 4], 1.6, 1.4, legs, { seed: 610 });
    sheet(c, k, legs, '#5b3e33', { depth: 0.5, edge: 0, seed: 609, tex: 0 });
  }
  c.restore();
};

const ballAt = (s: State, t: number): Pt | null => {
  const u = seg(t, T_BALL + 0.05, CATCH);
  if (t < T_BALL + 0.05 || t >= CATCH) return null;
  const [x0, y0] = s.ball.from;
  const [x1, y1] = s.ball.to;
  return [lerp(x0, x1, u), lerp(y0, y1, u) - 190 * Math.sin(Math.PI * u) * (1 - 0.2 * u)];
};

export const paperSnowDayFilm: RisoFilm<State> = {
  id: 'paper-snow-day',
  title: 'Snow Day',
  caption: 'A cut-paper backyard in fresh Michigan snow: zoomies, a wrestle, a snowball, and the porch light at dusk.',
  theme: 'Luna',
  category: 'Luna',
  motif: 'Snow: falling at every depth, kicked into sprays, packed into a ball that bursts, lit gold by the porch light',
  duration: DURATION,
  series: 'Paper cut',
  mode: 'direct',
  paper: '#efe6d3',
  paperTexture: true,
  grain: 0.12,
  inks: [{ color: P.siding }, { color: LUNA_LOOK.coat }, { color: BLACK_LOOK.coat }, { color: P.spruce }, { color: '#6d7bb0' }],
  scenes: [
    { at: T_ZOOM, label: 'Zoomies' },
    { at: T_WRESTLE, label: 'Wrestle' },
    { at: T_BALL, label: 'Snowball' },
    { at: T_HOME, label: 'Dusk' },
    { at: T_LIGHT, label: 'Porch light' },
  ],
  posterTime: 17.2,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const k = s.k;
    const C = camera(t);
    const dusk = tween(t, 8.5, 15.2, ease.inOutSine);

    /* ----- sky and the far planes ----- */
    r.camera(800, 450, 1);
    drawPlate(c, s.sky);
    const flakeCol = P.snow;
    let fi = 0;
    for (const pl of s.plates) {
      camFor(r, C, pl.p);
      drawPlate(c, pl);
      if (pl.p === 0.3) {
        // Chimney smoke drifting off
        const sm = new Path2D();
        for (let j = 0; j < 6; j++) {
          const age = (t * 0.32 + j / 6) % 1;
          const px = s.smoke[0] + age * 90 + 8 * Math.sin(t + j);
          const py = s.smoke[1] - age * 150;
          const rr = 8 + age * 22;
          cutPath(blobPts(px, py, rr, rr * 0.75, 700 + j, 0.1, 16), 0.6, 700 + j, 5, sm);
        }
        c.save();
        c.globalAlpha = 0.75;
        sheet(c, k, sm, '#ecebf0', { depth: 2, shadow: 0.15, tex: 0.4, seed: 700 });
        c.restore();
      }
      // Snow between the planes
      while (fi < s.flakes.length && s.flakes[fi].p <= pl.p + 0.15 && s.flakes[fi].p < 0.9) {
        camFor(r, C, s.flakes[fi].p);
        drawFlakes(c, k, s.flakes[fi], s.flake, t, flakeCol);
        fi++;
        camFor(r, C, pl.p);
      }
      if (pl.p === 0.78) drawCardinal(c, k, t);
    }

    /* ----- the yard ----- */
    camFor(r, C, 1);
    drawPlate(c, s.ground);
    // Trampled tracks behind every pass, and the churned patch where they wrestle
    const tr = new Path2D();
    tracks(tr, -260, Math.min(1900, lunaX(Math.min(t, 2.99))), BACK_G - 2, 300, 1);
    if (t > 1.8) tracks(tr, 1020, Math.min(1900, blackX(Math.min(t, 2.84))), BACK_G + 22, 330, 2);
    if (t > 2.86) {
      tracks(tr, 1900, Math.max(570, blackX(Math.min(t, 5.3))), FRONT_G - 12, 360, 3);
      if (t > 3.1) tracks(tr, 1900, Math.max(930, lunaX(Math.min(t, 5.65))), FRONT_G + 2, 340, 4);
    }
    const churn = clamp((t - 5.6) / 4.5);
    for (let i = 0; i < Math.floor(churn * 36); i++) {
      const px = 540 + hash(i * 1.7) * 430;
      const py = FRONT_G - 16 + hash(i * 3.1) * 26;
      tr.moveTo(px + 7, py);
      tr.ellipse(px, py, 7, 2.6, (hash(i) - 0.5) * 0.4, 0, TAU);
    }
    c.save();
    c.fillStyle = P.snowDeep;
    c.globalAlpha = 0.7;
    c.fill(tr);
    c.restore();

    const lf = lunaFrame(t);
    const bf = blackFrame(t);
    const spray = new Path2D();
    runSpray(spray, t, lunaX, BACK_G, LS, 0.0, 2.95, 11);
    runSpray(spray, t, blackX, BACK_G + 26, BS, 1.75, 2.84, 12);
    runSpray(spray, t, lunaX, FRONT_G, LS, 3.15, 5.6, 13);
    runSpray(spray, t, blackX, FRONT_G - 10, BS, 2.87, 5.3, 14);
    // Skids: big sprays thrown forward as they brake
    sprayAt(spray, 570 - 70, FRONT_G - 12, t - 5.0, -1, 31, 9, 1.4);
    sprayAt(spray, 570 - 50, FRONT_G - 12, t - 5.18, -1, 32, 7, 1.2);
    sprayAt(spray, 930 - 70, FRONT_G, t - 5.3, -1, 33, 9, 1.4);
    sprayAt(spray, 930 - 50, FRONT_G, t - 5.48, -1, 34, 7, 1.1);
    // Thumps when they drop out of the boxing
    for (const td of [7.62, 9.7]) {
      sprayAt(spray, L_W(td) - 50, FRONT_G, t - td, -1, 40 + td, 6, 0.8);
      sprayAt(spray, B_W(td) + 55, FRONT_G - 10, t - td, 1, 50 + td, 6, 0.8);
    }
    sprayAt(spray, L_W(LEAP_1) - 40, FRONT_G, t - LEAP_1, -1, 61, 8, 1.1);
    sprayAt(spray, L_W(LEAP_1) - 40, FRONT_G, t - LEAP_1, 1, 62, 8, 1.1);
    sprayAt(spray, L_W(LEAP_0), FRONT_G, t - LEAP_0, 1, 63, 7, 1.0);

    // Back to front: whoever stands further back is drawn first
    const dogs: [DogFrame, DogLook, number, boolean, number][] = [
      [lf, LUNA_LOOK, 9, false, t < 3.05 ? BACK_G : t > T_HOME ? 900 : FRONT_G],
      [bf, BLACK_LOOK, 19, true, t < 2.85 ? BACK_G + 26 : FRONT_G - 10 + (t > T_HOME ? 6 * tween(t, HOME_B[0], HOME_B[1]) + 16 : 0)],
    ];
    dogs.sort((a, b) => a[4] - b[4]);
    for (const [fr, look, seed, eye] of dogs) drawDog(c, s, fr, look, seed, eye);
    sheet(c, k, spray, P.snow, { depth: 4, shadow: 0.25, tex: 0.3, seed: 77 });

    // Snow shaken off her coat
    const shake = seg(t, LEAP_1 + 0.15, LEAP_1 + 0.8);
    if (shake > 0 && shake < 1) {
      const fl = new Path2D();
      const cx = lf.b.x;
      const cy = lf.b.y - 10;
      for (let j = 0; j < 22; j++) {
        const a = hash(j * 2.3) * TAU;
        const sp = 140 + hash(j * 5.1) * 220;
        const age = shake * 0.65 - hash(j) * 0.15;
        if (age <= 0) continue;
        const px = cx + Math.cos(a) * sp * age;
        const py = cy + Math.sin(a) * sp * age * 0.6 + 380 * age * age;
        const rr = 3.5 * (1 - shake) + 1;
        fl.moveTo(px + rr, py);
        fl.arc(px, py, rr, 0, TAU);
      }
      sheet(c, k, fl, P.snow, { depth: 3, shadow: 0.25, tex: 0, seed: 78 });
    }

    /* ----- the snowball ----- */
    const bp = ballAt(s, t);
    if (bp) {
      const ball = new Path2D();
      cutPath(blobPts(bp[0], bp[1], 25, 24, 801, 0.1, 24, t * 6), 0.6, 801, 4, ball);
      const trail = new Path2D();
      for (let i = 1; i <= 5; i++) {
        const q = ballAt(s, t - i * 0.035);
        if (!q) continue;
        const rr = 13 - i * 2;
        cutPath(blobPts(q[0] - 6 * i, q[1] + (hash(i) - 0.5) * 10, rr, rr * 0.8, 830 + i, 0.15, 10), 0.4, 830 + i, 4, trail);
      }
      sheet(c, k, trail, P.snow, { depth: 3, shadow: 0.2, tex: 0.3, seed: 830 });
      const gs = new Path2D();
      gs.ellipse(bp[0], FRONT_G - 4, 16, 4, 0, 0, TAU);
      c.save();
      c.globalAlpha = 0.25 * clamp((bp[1] - 200) / 400);
      c.fillStyle = '#6a7290';
      c.fill(gs);
      c.restore();
      sheet(c, k, ball, P.ball, { depth: 7 + 20 * Math.sin(Math.PI * seg(t, T_BALL, CATCH)), edge: 0.5, seed: 801, tex: 0.6 });
      const sh = new Path2D();
      const a = t * 6;
      cutPath([[bp[0] + Math.cos(a) * 22, bp[1] + Math.sin(a) * 22], [bp[0] + Math.cos(a + 1.6) * 23, bp[1] + Math.sin(a + 1.6) * 23], [bp[0] + Math.cos(a + 0.8) * 9, bp[1] + Math.sin(a + 0.8) * 9]], 0.4, 802, 4, sh);
      sheet(c, k, sh, P.snowDeep, { depth: 0, edge: 0, seed: 802, tex: 0.3 });
    }
    // The burst: a jagged star, then shards
    const bt = t - CATCH;
    if (bt >= 0 && bt < 0.9) {
      const [cx, cy] = s.ball.to;
      if (bt < 0.16) {
        const star = new Path2D();
        const pts: Pt[] = [];
        const R = 40 + 520 * bt;
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * TAU + 0.2;
          const rr = i % 2 ? R * (0.45 + 0.15 * hash(i)) : R * (0.85 + 0.3 * hash(i + 9));
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        cutPath(pts, 1, 820, 8, star);
        sheet(c, k, star, '#fffdf6', { depth: 10, shadow: 0.25, edge: 0.4, seed: 820, tex: 0.4 });
      }
      const sh = new Path2D();
      for (let j = 0; j < 26; j++) {
        const a = hash(j * 4.1) * TAU;
        const sp = 220 + hash(j * 2.7) * 380;
        const px = cx + Math.cos(a) * sp * bt;
        const py = cy + Math.sin(a) * sp * bt + 420 * bt * bt;
        const rr = (4 + 6 * hash(j * 1.3)) * (1 - bt / 0.95);
        const pts: Pt[] = [];
        for (let i = 0; i < 5; i++) {
          const aa = (i / 5) * TAU + j + bt * 8;
          pts.push([px + Math.cos(aa) * rr * (0.7 + 0.5 * hash(i + j)), py + Math.sin(aa) * rr]);
        }
        sh.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 5; i++) sh.lineTo(pts[i][0], pts[i][1]);
        sh.closePath();
      }
      sheet(c, k, sh, P.ball, { depth: 5, shadow: 0.3, edge: 0, seed: 821, tex: 0.3 });
    }

    /* ----- near snow and foreground ----- */
    for (; fi < s.flakes.length && s.flakes[fi].p <= 1.2; fi++) {
      camFor(r, C, s.flakes[fi].p);
      drawFlakes(c, k, s.flakes[fi], s.flake, t, flakeCol);
    }
    camFor(r, C, s.fore.p);
    drawPlate(c, s.fore);
    for (; fi < s.flakes.length; fi++) {
      camFor(r, C, s.flakes[fi].p);
      drawFlakes(c, k, s.flakes[fi], s.flake, t, flakeCol);
    }

    /* ----- dusk: the blue hour comes down over everything ----- */
    r.camera(800, 450, 1);
    const lamp = toScreen(C, 1, PORCH_LIGHT);
    warmLight(c, lerp(1100, lamp[0], dusk), lerp(200, lamp[1], dusk), 0.55 + 0.4 * dusk, '250,226,200');
    if (dusk > 0) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      const W = c.canvas.width;
      const H = c.canvas.height;
      const gr = c.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, mix('#ffffff', '#4f5b93', dusk * 0.9));
      gr.addColorStop(0.55, mix('#ffffff', '#7a7cad', dusk * 0.85));
      gr.addColorStop(1, mix('#ffffff', '#9a9cc4', dusk * 0.8));
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = gr;
      c.fillRect(0, 0, W, H);
      c.restore();
    }

    /* ----- lights: windows, then the porch light ----- */
    c.save();
    const fenceTop = toScreen(C, 0.78, [0, 460])[1];
    const houseR = toScreen(C, 1, [300, 0])[0];
    for (const w of s.windows) {
      const on = tween(t, w.on, w.on + 0.25, ease.outCubic);
      if (on <= 0) continue;
      if (w.p < 1) {
        const sp = toScreen(C, w.p, [w.x, w.y + w.h]);
        if (sp[1] > fenceTop || sp[0] < houseR) continue;
      }
      camFor(r, C, w.p);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = on;
      c.fillStyle = w.p < 1 ? '#f2c77a' : '#f6cf86';
      const pp = new Path2D();
      cutPath([[w.x + 2, w.y + 2], [w.x + w.w - 2, w.y + 2], [w.x + w.w - 2, w.y + w.h - 2], [w.x + 2, w.y + w.h - 2]], 0.3, w.x, 6, pp);
      c.fill(pp);
      if (w.p === 1) {
        c.fillStyle = P.trim;
        c.globalAlpha = on * 0.9;
        if (w.w > 100) {
          c.fillRect(w.x + w.w / 2 - 3, w.y, 6, w.h);
          c.fillRect(w.x, w.y + w.h / 2 - 3, w.w, 6);
        }
      }
    }
    c.restore();
    const flick = (u: number) => {
      if (u < 0) return 0;
      if (u < 0.06) return 0.7;
      if (u < 0.14) return 0.1;
      if (u < 0.2) return 0.85;
      if (u < 0.26) return 0.35;
      return clamp(0.85 + (u - 0.26) * 0.6);
    };
    const on = flick(t - T_LIGHT);
    if (on > 0) {
      camFor(r, C, 1);
      const [lx, ly] = PORCH_LIGHT;
      const glass = new Path2D();
      cutPath([[lx - 12, ly - 16], [lx + 12, ly - 16], [lx + 11, ly + 20], [lx - 11, ly + 20]], 0.3, 900, 4, glass);
      c.save();
      c.fillStyle = mix(P.glassOff, P.glassOn, on);
      c.fill(glass);
      c.fillStyle = '#fff8dc';
      c.globalAlpha = on;
      c.beginPath();
      c.ellipse(lx, ly + 2, 5, 9, 0, 0, TAU);
      c.fill();
      c.restore();
      // Glow in screen space
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      const sc = c.canvas.width / 1600;
      const z = C.z;
      const gx = lamp[0] * sc;
      const gy = lamp[1] * sc;
      c.globalCompositeOperation = 'screen';
      const gr = c.createRadialGradient(gx, gy, 0, gx, gy, 560 * z * sc);
      gr.addColorStop(0, `rgba(255,232,160,${1 * on})`);
      gr.addColorStop(0.05, `rgba(255,210,125,${0.75 * on})`);
      gr.addColorStop(0.22, `rgba(245,170,95,${0.38 * on})`);
      gr.addColorStop(0.5, `rgba(215,130,80,${0.14 * on})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      const GR = 560 * z * sc;
      c.fillRect(Math.max(0, gx - GR), Math.max(0, gy - GR), GR * 2, GR * 2);
      // A pool of light on the snow by the steps
      const pool = toScreen(C, 1, [470, 790]);
      c.translate(pool[0] * sc, pool[1] * sc);
      c.scale(1, 0.28);
      const pg = c.createRadialGradient(0, 0, 0, 0, 0, 420 * z * sc);
      pg.addColorStop(0, `rgba(255,200,120,${0.5 * on})`);
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = pg;
      c.fillRect(-420 * z * sc, -420 * z * sc, 840 * z * sc, 840 * z * sc);
      c.restore();
      // The flakes nearest the lamp catch it
      camFor(r, C, 1);
      c.save();
      c.globalCompositeOperation = 'screen';
      const f = s.flakes[2];
      const lit = new Path2D();
      const { x: rx, y: ry, w: rw, h: rh } = f.rect;
      for (let i = 0; i < f.xs.length; i++) {
        const y = ry + ((((f.ys[i] + f.sp[i] * t) % rh) + rh) % rh);
        let x = f.xs[i] + f.sw[i] * Math.sin(t * 0.8 + f.ph[i]) + 14 * t;
        x = rx + ((((x - rx) % rw) + rw) % rw);
        const d = Math.hypot(x - lx, y - ly);
        if (d > 380) continue;
        const rr = f.sz[i] * 1.1;
        lit.moveTo(x + rr, y);
        lit.arc(x, y, rr, 0, TAU);
      }
      c.fillStyle = `rgba(255,214,140,${0.8 * on})`;
      c.fill(lit);
      c.restore();
    }

    /* ----- title: letters cut from scraps ----- */
    const tk = tween(t, 15.8, 16.6, ease.outCubic);
    if (tk > 0) {
      r.camera(800, 450, 1);
      const word = 'SNOW DAY';
      c.save();
      c.font = `400 76px ${DISPLAY}`;
      c.textAlign = 'center';
      const widths = Array.from(word).map((ch) => c.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + 10 * (word.length - 1);
      let x = 1180 - total / 2;
      Array.from(word).forEach((ch, i) => {
        const kk = ease.outBack(seg(t, 15.8 + i * 0.07, 16.4 + i * 0.07));
        if (kk > 0 && ch !== ' ') {
          c.save();
          c.translate(x + widths[i] / 2, 150 - (1 - kk) * 40);
          c.rotate((hash(i + 11) - 0.5) * 0.09 + (1 - kk) * 0.3);
          c.globalAlpha = clamp(kk * 2);
          const p = new Path2D();
          const bw = widths[i] / 2 + 9;
          cutPath([[-bw, -66], [bw, -64], [bw + 2, 14], [-bw - 1, 12]], 1.4, i + 610, 8, p);
          sheet(c, k, p, '#f8f3e6', { depth: 6, edge: 0, seed: i + 610, tex: 0.6 });
          c.fillStyle = i < 4 ? P.title : P.titleB;
          c.shadowColor = 'rgba(30,20,30,0.3)';
          c.shadowBlur = 3 * r.scale;
          c.shadowOffsetY = 2 * r.scale;
          c.fillText(ch, 0, 0);
          c.restore();
        }
        x += widths[i] + 10;
      });
      const sub = tween(t, 16.6, 17.3, ease.outCubic);
      if (sub > 0) {
        c.globalAlpha = sub;
        c.font = `400 24px ${DISPLAY}`;
        c.fillStyle = '#f3e6cf';
        spacedText(c, 'LUNA LOVED THE SNOW', 1180, 212, 6);
      }
      c.restore();
    }
  },
};
