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
  mixLeg,
  mixLuna,
  personArt,
  pinePts,
  roundTree,
  sheet,
  stampDraw,
  tornRidge,
  viewRect,
  warmLight,
  type Craft,
  type LegAngles,
  type LunaPose,
  type PersonLook,
  type PersonPose,
  type Plate,
  type Stamp,
  type View,
} from '../styles/papercut';

/**
 * Trail Day: a cut-paper hike with Luna.
 * Motif: the paper sun. It rises behind the ranges as the day starts, flickers between the
 * pines while they walk, breaks into gold slivers in the stream she hops across, and sets
 * behind the two of them, sitting together on the summit.
 */

const DURATION = 18.5;
const T_GO = 2.3;
const T_FOREST = 3.4;
const T_STREAM = 7.0;
const T_CLIMB = 9.6;
const T_SUMMIT = 14.2;

const V = 230;
const H_START = 560;
const LUNA_SCALE = 0.92;

/* ---------- world ---------- */

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const S_IN = 1650;
const S_OUT = 2050;
const STONES = [1712, 1802, 1892, 1982];
const C_IN = 2075;
const C_TOP = 2850;
const CLIFF = 3170;
const SUMMIT_Y = 40;

/** The line their feet walk on */
const walkY = (x: number) => {
  let y = 650 + 7 * Math.sin(x / 95) + 4 * Math.sin(x / 37);
  y += 62 * smoothstep(1400, S_IN, x);
  if (x > S_IN - 20 && x < S_OUT + 20) y = lerp(y, 712, smoothstep(S_IN - 40, S_IN, x) * (1 - smoothstep(S_OUT, S_OUT + 40, x)));
  // A long steep stair of rock, then a flat top
  const kc = clamp((x - C_IN) / (C_TOP - C_IN));
  const c = 0.6 * kc + 0.4 * kc * kc * (3 - 2 * kc);
  y = lerp(y, SUMMIT_Y + 4 * Math.sin(x / 31), c);
  return y;
};

/** Top of the ground sheet: the walk line, with the stream bed cut out */
const groundTop = (x: number) => {
  let y = walkY(x);
  const bed = smoothstep(S_IN - 50, S_IN + 50, x) * (1 - smoothstep(S_OUT - 50, S_OUT + 50, x));
  y = lerp(y, 812, bed);
  y += 950 * smoothstep(CLIFF, CLIFF + 160, x);
  return y;
};

/* ---------- walking ---------- */

/** Hiker speed through the day: start, a careful pace over the stones, slower up the climb, stop */
const speed = (t: number, x: number) => {
  let v = V * smoothstep(T_GO, T_GO + 0.7, t);
  if (x > S_IN - 30 && x < S_OUT + 30) v *= 0.85;
  v *= 1 - 0.25 * smoothstep(C_IN, C_IN + 120, x);
  return v * (1 - smoothstep(T_SUMMIT - 0.6, T_SUMMIT + 0.4, t));
};

const DT = 1 / 240;
const TABLE: number[] = (() => {
  const xs = [H_START];
  let x = H_START;
  for (let i = 1; i <= Math.ceil(DURATION / DT) + 2; i++) {
    x += speed(i * DT, x) * DT;
    xs.push(x);
  }
  return xs;
})();

const hikerX = (t: number) => {
  const f = clamp(t, 0, DURATION) / DT;
  const i = Math.floor(f);
  return lerp(TABLE[i], TABLE[Math.min(TABLE.length - 1, i + 1)], f - i);
};
const H_END = hikerX(DURATION);
const L_END = H_END + 62;

const lunaX = (t: number) => {
  const hx = hikerX(t);
  // She ranges ahead and drifts back, never far
  const off = 165 + 35 * Math.sin(t * 0.9 - 0.4) + 40 * smoothstep(T_STREAM - 0.5, T_STREAM + 0.4, t) * (1 - smoothstep(T_CLIMB - 0.4, T_CLIMB + 0.6, t));
  let x = hx + off * smoothstep(T_GO - 0.3, T_GO + 0.6, t) + 112 * (1 - smoothstep(T_GO - 0.3, T_GO + 0.6, t));
  x = lerp(x, L_END, tween(t, T_SUMMIT - 1.6, T_SUMMIT - 0.1, ease.inOutSine));
  return x;
};

const lunaSpeed = (t: number) => (lunaX(t + 0.02) - lunaX(t - 0.02)) / 0.04;

/** Leap height over the stream: one arc from stone to stone */
const LEAPS = [S_IN - 20, ...STONES, S_OUT + 20];
const leap = (x: number) => {
  for (let i = 0; i < LEAPS.length - 1; i++) {
    const a = LEAPS[i];
    const b = LEAPS[i + 1];
    if (x >= a && x < b) {
      const f = (x - a) / (b - a);
      return { h: 30 * Math.sin(Math.PI * f), f, i };
    }
  }
  return { h: 0, f: 0, i: -1 };
};

/* ---------- Luna's gait ---------- */

/** Body centre above the ground when she stands, in rig units */
const L_H0 = 49;
/** World px she covers per trot cycle */
const L_STRIDE = 112;
const L_DUTY = 0.58;

const lerpKeys = (f: number, ks: [number, LegAngles][]): LegAngles => {
  if (f <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (f <= ks[i][0]) return mixLeg(ks[i - 1][1], ks[i][1], ease.inOutSine((f - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
  }
  return ks[ks.length - 1][1];
};

/** The bound over the stream: push off with the hind legs, reach, land on the fronts, gather */
const BOUND_FRONT: [number, LegAngles][] = [
  [0, [0.55, -0.05, -1.25]],
  [0.45, [1.0, 1.1, 1.05]],
  [0.82, [0.42, 0.32, 0.3]],
  [1, [0.2, 0.05, 0.22]],
];
const BOUND_HIND: [number, LegAngles][] = [
  [0, [-0.15, -0.95, -0.95]],
  [0.45, [-0.4, -1.15, -1.4]],
  [0.82, [0.95, -0.35, -0.45]],
  [1, [0.5, -0.6, 0.08]],
];

interface LunaFrame {
  x: number;
  y: number;
  rot: number;
  pose: LunaPose;
}

/** Her sit, grounded on rump and haunch with the front legs straight down */
const lunaSit = (look: number, tail: number): { pose: LunaPose; low: number } => {
  const roots = lunaRoots(LUNA_SIT_TILT);
  const base: LunaPose = { tilt: LUNA_SIT_TILT, neck: -1.32, head: -0.25 + look, tail, ff: [0, 0, 0.15], fn: [0, 0, 0.15], bf: LUNA_SIT_HIND_FAR, bn: LUNA_SIT_HIND };
  const hb = legFK(roots.bn, LUNA_SIT_HIND, HIND_LEN);
  const low = Math.max(lunaShape(base).low, hb[3][1] + 3.5);
  base.fn = frontIK(roots.fn, [roots.fn[0] + 3, low - 3.5], 0.12);
  base.ff = frontIK(roots.ff, [roots.ff[0] + 6, low - 4.5], 0.12);
  return { pose: base, low: lunaShape(base).low };
};

const lunaFrame = (t: number): LunaFrame => {
  const LS = LUNA_SCALE;
  const X = lunaX(t);
  const v = lunaSpeed(t);
  const m = clamp(Math.abs(v) / 80);
  const lp = leap(X);
  const climb = smoothstep(C_IN - 40, C_IN + 80, X) * (1 - smoothstep(C_TOP - 80, C_TOP + 20, X));
  // Body follows the ground under shoulders and hips
  const xF = X + 30 * LS;
  const xH = X - 38 * LS;
  const gF = walkY(xF);
  const gH = walkY(xH);
  const phi = X / L_STRIDE;
  // Pitch with the hill but not all the way: on the stair she keeps her back fairly level,
  // folding the front legs high onto the step and reaching down behind
  let rot = clamp(Math.atan2(gF - gH, xF - xH) * 0.85, -0.42, 0.42);
  const up = clamp((gH - gF) / (xF - xH));
  let y = lerp(gF, gH, 0.5 + 0.12 * up) - L_H0 * LS * Math.cos(rot) - 1.6 * m * Math.cos(phi * TAU * 2 + 0.6);
  // Leg IK to planted paws: a trot, diagonal pairs together (near fore with far hind)
  const roots = lunaRoots(0);
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const toWorld = (p: Pt): Pt => [X + (p[0] * cs - p[1] * sn) * LS, y + (p[0] * sn + p[1] * cs) * LS];
  const toLocal = (w: Pt): Pt => {
    const dx = (w[0] - X) / LS;
    const dy = (w[1] - y) / LS;
    return [dx * cs + dy * sn, -dx * sn + dy * cs];
  };
  // Higher, more deliberate steps on the stair
  const liftH = (8 + 9 * climb) * m;
  const leg = (key: 'ff' | 'fn' | 'bf' | 'bn', off: number): LegAngles => {
    const front = key[0] === 'f';
    const rw = toWorld(roots[key]);
    const f = gaitFoot(phi, off, L_DUTY);
    // On the stair the front paws reach forward onto the next step
    const fx = rw[0] + (front ? 3 + 14 * climb : 5) * LS + f.rel * L_STRIDE * m;
    const fy = walkY(fx) - f.lift * liftH - 3.5 * LS;
    const tgt = toLocal([fx, fy]);
    const sw = f.swing >= 0 ? Math.sin(Math.PI * f.swing) * m : 0;
    return front ? frontIK(roots[key], tgt, 0.22 - 1.55 * sw) : hindIK(roots[key], tgt, 0.08 - 0.6 * sw);
  };
  const nod = Math.sin(phi * TAU * 2) * 0.04 * m;
  let pose: LunaPose = {
    tilt: 0,
    neck: -0.8 + 0.12 * climb + nod,
    head: 0.12 + 0.12 * climb - nod,
    tail: 0.3 + 0.22 * Math.sin(t * 7) * (1 - 0.5 * m),
    fn: leg('fn', 0),
    bf: leg('bf', 0.03),
    ff: leg('ff', 0.5),
    bn: leg('bn', 0.53),
  };
  // The bound: keyed angles take over through the air
  if (lp.i >= 0) {
    const w = Math.pow(Math.sin(Math.PI * lp.f), 0.6);
    pose = {
      ...pose,
      fn: mixLeg(pose.fn, lerpKeys(lp.f, BOUND_FRONT), w),
      ff: mixLeg(pose.ff, lerpKeys(lp.f - 0.05, BOUND_FRONT), w),
      bn: mixLeg(pose.bn, lerpKeys(lp.f, BOUND_HIND), w),
      bf: mixLeg(pose.bf, lerpKeys(lp.f - 0.05, BOUND_HIND), w),
      tail: pose.tail + 0.3 * w,
    };
    rot += -0.2 * Math.cos(Math.PI * lp.f) * w;
    y -= lp.h;
  }
  // Sitting at the trailhead and at the top
  const sitA = 1 - tween(t, T_GO - 0.4, T_GO + 0.1, ease.inOutSine);
  const sitB = tween(t, T_SUMMIT + 0.05, T_SUMMIT + 0.7, ease.inOutSine);
  const sitK = Math.max(sitA, sitB);
  if (sitK > 0) {
    const look = sitA > 0 ? 0.22 * Math.sin(t * 1.4) - 0.08 : 0.1 + 0.05 * Math.sin(t * 1.1);
    const sit = lunaSit(look, -0.25 + 0.15 * Math.sin(t * 6));
    pose = mixLuna(pose, sit.pose, sitK);
    y = lerp(y, walkY(X) - sit.low * LS, sitK);
    rot = lerp(rot, 0, sitK);
  }
  return { x: X, y, rot, pose };
};

/* ---------- the hiker's planted steps ---------- */

const H_STRIDE = 150;
const H_DUTY = 0.62;

const hikerFeet = (hx: number, m: number, climb: number) => {
  const phi = hx / H_STRIDE;
  const feet = [0.5, 0].map((off) => {
    const f = gaitFoot(phi, off, H_DUTY);
    const fx = hx + f.rel * H_STRIDE * m;
    const lift = f.lift * (12 + 8 * climb) * m;
    const fy = walkY(fx) - lift;
    const slope = Math.atan((walkY(fx + 8) - walkY(fx - 8)) / 16);
    const s = f.swing;
    // Heel lifts as the foot leaves, toe comes up a touch before it lands
    const rot = (s >= 0 ? (0.5 * Math.sin(Math.PI * s) * (1 - s) - 0.18 * Math.sin(Math.PI * s) * s) * m : 0) + slope;
    return { a: [fx - hx, fy - walkY(hx)] as Pt, rot };
  });
  return { phi, ankles: [feet[0].a, feet[1].a] as [Pt, Pt], bootRot: [feet[0].rot, feet[1].rot] as [number, number] };
};

/* ---------- palette ---------- */

const P = {
  skyDawnTop: '#f1d4b3',
  skyDawnLow: '#f7c393',
  skyDayTop: '#b9d6db',
  skyDayLow: '#eef0d8',
  skyDuskTop: '#efbf9c',
  skyDuskLow: '#f6d39c',
  sun: '#f4b43c',
  sunDusk: '#ee8636',
  sunHalo: '#f8dd8e',
  cloud: '#fbf6ea',
  rangeA: '#b5c0da',
  snow: '#f8f4ea',
  rangeB: '#90a5c8',
  rangeC: '#6d9aa4',
  hillD: '#86ab6b',
  treeD: '#6a985b',
  hillE: '#5e8b5b',
  treeE: '#4a7a52',
  treeF: '#3a654a',
  ground: '#87a256',
  groundShade: '#6f8d48',
  trail: '#dcc193',
  rock: '#a59d90',
  rockShade: '#8c857b',
  water: '#4f8fb3',
  waterLight: '#7fbdd0',
  foam: '#f5f2e8',
  fore: '#2f5a3f',
  foreDeep: '#22432f',
  wood: '#8a5d38',
  flower: '#f3e2a2',
  flower2: '#e98f73',
};

const HIKER: PersonLook = {
  cut: true,
  skin: '#e1b18c',
  hat: '#2f6f73',
  hatKind: 'cap',
  coat: '#cf553b',
  coatShade: '#a8412e',
  pants: '#45506d',
  pantsShade: '#343d56',
  boots: '#5a3a26',
  pack: '#e3a43c',
  packShade: '#c2842a',
};

/* ---------- layers ---------- */

interface SheetDef {
  path: Path2D;
  color: string;
  depth: number;
  edge: number;
  seed: number;
  torn?: boolean;
  shade?: [number, number];
}

interface Layer {
  p: number;
  /** Highest point of its art, so its plate is no taller than needed */
  top: number;
  /** A vellum haze sheet: baked into the plate of the layer in front of it */
  haze?: boolean;
  sheets: SheetDef[];
}

interface State {
  k: Craft;
  dog: Stamp;
  person: Stamp;
  arm: Stamp;
  sky: Plate[];
  clouds: { path: Path2D; x: number; y: number; p: number; drift: number }[];
  plates: Plate[];
  ground: Plate;
  fore: Plate;
  trunks: Path2D;
  bark: Path2D;
  sunCut: Pt[];
}

/** Fold each vellum sheet into the plate of the layer just in front (they barely part) */
const mergeHaze = (layers: Layer[]) => {
  const out: Layer[] = [];
  layers.forEach((L, i) => {
    const N = layers[i + 1];
    if (L.haze && N) {
      N.sheets = [...L.sheets, ...N.sheets];
      N.top = Math.min(N.top, L.top);
    } else out.push(L);
  });
  return out;
};

/** Rough camera x per layer-space x, for deciding what grows where */
const camAt = (lx: number, p: number) => 800 + (lx - 800) / p;

const drawSheets = (g: Ctx, k: Craft, sheets: SheetDef[]) => {
  for (const s of sheets) sheet(g, k, s.path, s.color, { depth: s.depth, edge: s.edge, seed: s.seed, tex: s.torn ? 0.5 : 0.85, shade: s.shade });
};

const build = (r: Riso): State => {
  const k = makeCraft(r, 91);
  const res = Math.max(1.6, r.scale * 1.6);
  const rng = mulberry(17);
  const views: View[] = [];
  for (let t = 0; t <= DURATION; t += 0.05) views.push(camera(t));

  /* sky: four cut bands in screen space, baked for dawn, day and dusk */
  const bands: Path2D[] = [];
  [-40, 170, 330, 470].forEach((y, i) => {
    bands.push(cutRidge((x) => y + 14 * Math.sin(x / 180 + i * 1.7) + 8 * Math.sin(x / 71 + i), -60, 1660, 1000, 30 + i, 1.4, 12));
  });
  const skyPlate = (topC: string, lowC: string) =>
    bakePlate(r, 0, { x: 0, y: 0, w: 1600, h: 900 }, (g) => {
      g.fillStyle = topC;
      g.fillRect(0, 0, 1600, 900);
      bands.forEach((b, i) => sheet(g, k, b, mix(topC, lowC, (i + 1) / bands.length), { depth: 4, edge: 0.4, seed: 30 + i, tex: 0.7 }));
    }, 1);
  const sky = [skyPlate(P.skyDawnTop, P.skyDawnLow), skyPlate(P.skyDayTop, P.skyDayLow), skyPlate(P.skyDuskTop, P.skyDuskLow)];

  const clouds: State['clouds'] = [];
  const cloud = (w: number, seed: number) => {
    const p = new Path2D();
    const lobes = 4 + Math.floor(hash(seed) * 2);
    for (let i = 0; i < lobes; i++) {
      const f = i / (lobes - 1);
      const rr = w * (0.16 + 0.12 * Math.sin(f * Math.PI)) * (0.85 + hash(seed + i) * 0.3);
      cutPath(blobPts(-w / 2 + f * w, -rr * 0.35, rr, rr * 0.85, seed + i, 0.05, 28), 1, seed + i, 8, p);
    }
    cutPath([[-w * 0.62, 0], [w * 0.62, 0], [w * 0.56, w * 0.09], [-w * 0.58, w * 0.09]], 1, seed + 9, 8, p);
    return p;
  };
  clouds.push(
    { path: cloud(210, 3), x: 330, y: 150, p: 0.05, drift: 7 },
    { path: cloud(150, 7), x: 1350, y: 90, p: 0.07, drift: 10 },
    { path: cloud(260, 11), x: 2050, y: 200, p: 0.06, drift: 8 },
    { path: cloud(170, 15), x: 2800, y: 120, p: 0.08, drift: 12 },
    { path: cloud(220, 19), x: 3500, y: 230, p: 0.07, drift: 9 }
  );

  const layers: Layer[] = [];
  const BOTTOM = 3200;
  const X0 = -1200;
  const X1 = 4800;


  // Vellum: a sheet of translucent paper between ranges, so distance reads as haze
  const vellum = (p: number, y0: number, seed: number, alpha: number): Layer => ({
    p,
    haze: true,
    top: y0 - 40,
    sheets: [{ path: cutRidge((x) => y0 + 16 * Math.sin(x / 230 + seed) + 8 * Math.sin(x / 83), X0, X1, BOTTOM, seed, 1.2), color: `rgba(250,244,232,${alpha})`, depth: 0, edge: 0.3, seed, torn: true }],
  });
  // A: far snowy peaks
  {
    const y = (x: number) => 470 - 150 * Math.pow(Math.abs(Math.sin(x / 260 + 0.6)), 1.6) - 40 * Math.sin(x / 97) * Math.sin(x / 151) - 30 * Math.sin(x / 600);
    const snowLine = (x: number) => 360 + 14 * Math.sin(x / 23) + 10 * Math.sin(x / 57);
    const snow = new Path2D();
    const caps: Pt[] = [];
    for (let x = X0; x <= X1; x += 6) caps.push([x, Math.min(y(x), snowLine(x))]);
    for (let x = X1; x >= X0; x -= 6) caps.push([x, snowLine(x) + 0.01]);
    cutPath(caps, 1.1, 4, 6, snow);
    layers.push({
      p: 0.08,
      top: 200,
      sheets: [
        { path: tornRidge(y, X0, X1, BOTTOM, 4, 2), color: P.snow, depth: 3, edge: 0, seed: 2, torn: true },
        { path: cutRidge(y, X0, X1, BOTTOM, 1, 1.6, 8), color: P.rangeA, depth: 2, edge: 0.6, seed: 1, shade: [300, 700] },
        { path: snow, color: P.snow, depth: 1.5, edge: 0.4, seed: 3 },
      ],
    });
  }
  // B: rounded blue mountains
  {
    const y = (x: number) => 540 - 95 * Math.pow(Math.abs(Math.sin(x / 330 + 2.1)), 1.3) - 22 * Math.sin(x / 120 + 1);
    layers.push(vellum(0.12, 470, 101, 0.22));
    layers.push({ p: 0.16, top: 400, sheets: [{ path: cutRidge(y, X0, X1, BOTTOM, 5, 1.6), color: P.rangeB, depth: 5, edge: 0.6, seed: 5, shade: [380, 800] }] });
  }
  // C: teal hills with a pine fringe
  {
    const y = (x: number) => 572 - 60 * Math.sin(x / 260 + 0.7) - 24 * Math.sin(x / 90);
    const fringe = new Path2D();
    for (let x = X0 + 20; x < X1; x += 14 + rng() * 22) {
      if (rng() < 0.35) continue;
      const h = 22 + rng() * 26;
      cutPath(pinePts(x, y(x) + 8, h, h * 0.5, x, 4), 0.6, x, 5, fringe);
    }
    layers.push(vellum(0.22, 525, 103, 0.2));
    layers.push({
      p: 0.28,
      top: 420,
      sheets: [
        { path: fringe, color: P.rangeC, depth: 4, edge: 0.5, seed: 8 },
        { path: cutRidge(y, X0, X1, BOTTOM, 7, 1.5), color: P.rangeC, depth: 6, edge: 0.5, seed: 7, shade: [460, 900] },
      ],
    });
  }
  layers.push(vellum(0.35, 580, 105, 0.18));
  // D: green hill with round trees and a torn white top
  {
    const y = (x: number) => 600 - 48 * Math.sin(x / 210 + 2.2) - 18 * Math.sin(x / 77);
    const trees = new Path2D();
    for (let x = X0 + 20; x < X1; x += 30 + rng() * 50) {
      if (rng() < 0.3) continue;
      const h = 50 + rng() * 40;
      if (rng() < 0.6) roundTree(trees, x, y(x) + 10, h, h * 0.6, x * 0.3);
      else cutPath(pinePts(x, y(x) + 10, h * 1.2, h * 0.5, x, 5), 0.8, x, 6, trees);
    }
    layers.push({
      p: 0.42,
      top: 400,
      sheets: [
        { path: trees, color: P.treeD, depth: 6, edge: 0.5, seed: 11 },
        { path: tornRidge(y, X0, X1, BOTTOM, 5, 12), color: P.snow, depth: 6, edge: 0, seed: 12, torn: true },
        { path: cutRidge(y, X0, X1, BOTTOM, 9, 1.6), color: P.hillD, depth: 3, edge: 0.6, seed: 9, shade: [520, 900] },
      ],
    });
  }
  // E: forest ridge, dense through the woods
  {
    const p = 0.62;
    const y = (x: number) => 618 - 30 * Math.sin(x / 170 + 0.4) - 12 * Math.sin(x / 61);
    const trees = new Path2D();
    for (let x = X0 + 20; x < X1; x += 18 + rng() * 26) {
      const c = camAt(x, p);
      const dense = smoothstep(500, 850, c) * (1 - smoothstep(1650, 1950, c));
      if (rng() > 0.25 + 0.75 * dense) continue;
      const h = (70 + rng() * 70) * (1 + dense * 0.9);
      cutPath(pinePts(x, y(x) + 14, h, h * 0.42, x * 1.1, 5 + Math.floor(rng() * 2)), 0.9, x, 6, trees);
    }
    layers.push({
      p,
      top: 300,
      sheets: [
        { path: trees, color: P.treeE, depth: 6, edge: 0.5, seed: 14 },
        { path: cutRidge(y, X0, X1, BOTTOM, 13, 1.4), color: P.hillE, depth: 6, edge: 0.5, seed: 13, shade: [560, 900] },
      ],
    });
  }
  // F: the near pines, only in the woods
  {
    const p = 0.82;
    const base = (x: number) => 660 + 10 * Math.sin(x / 80);
    const trees = new Path2D();
    for (let x = -500; x < X1; x += 40 + rng() * 60) {
      const c = camAt(x, p);
      const dense = smoothstep(420, 820, c) * (1 - smoothstep(1500, 1800, c));
      const alpine = smoothstep(2150, 2400, c) * (1 - smoothstep(2750, 2900, c));
      if (rng() > dense * 0.95 + alpine * 0.35) continue;
      const h = dense > 0.3 ? 300 + rng() * 260 : 140 + rng() * 90;
      cutPath(pinePts(x, base(x), h, h * 0.36, x * 0.7, 7 + Math.floor(rng() * 3)), 1, x, 7, trees);
    }
    layers.push({ p, top: 80, sheets: [{ path: trees, color: P.treeF, depth: 9, edge: 0.45, seed: 15 }] });
  }

  const plates = mergeHaze(layers).map((L) =>
    bakePlate(r, L.p, clipRect(viewRect(views, L.p), { x: -1e4, y: L.top - 30, w: 2e4, h: 2e4 }), (g) => drawSheets(g, k, L.sheets), L.p < 0.3 ? 1 : 1.25)
  );

  /* ground plane: walk line, stream bed, the stair of rocks, the summit */
  const ground: SheetDef[] = [];
  ground.push({ path: cutRidge(groundTop, -700, X1, BOTTOM, 21, 1.3, 7), color: P.ground, depth: 10, edge: 0.6, seed: 21, shade: [0, 950] });
  const tufts = new Path2D();
  for (let x = -680; x < CLIFF; x += 26 + rng() * 40) {
    if (x > S_IN - 40 && x < S_OUT + 40) continue;
    const y = groundTop(x) + 2;
    for (let j = 0; j < 3; j++) {
      const bx = x + j * 5;
      cutPath([[bx - 3, y + 4], [bx + (j - 1) * 4, y - 9 - rng() * 8], [bx + 3, y + 4]], 0.4, x + j, 4, tufts);
    }
  }
  ground.push({ path: tufts, color: P.groundShade, depth: 2, edge: 0.3, seed: 22 });
  const trail = new Path2D();
  for (const [a, b] of [[-700, S_IN - 10], [S_OUT + 10, CLIFF - 40]]) {
    const top: Pt[] = [];
    for (let x = a; x <= b; x += 8) top.push([x, walkY(x) + 4]);
    const strip: Pt[] = [...top, ...[...top].reverse().map(([x, y]) => [x, y + 16 + 3 * Math.sin(x / 20)] as Pt)];
    cutPath(strip, 1, a, 8, trail);
  }
  ground.push({ path: trail, color: P.trail, depth: 2.5, edge: 0.8, seed: 23 });
  // Stair slabs up the climb and boulders on the top
  const rocks = new Path2D();
  const slabs = new Path2D();
  for (let x = C_IN + 60; x < C_TOP; x += 52) {
    const y = walkY(x) + 8;
    cutPath([[x - 30, y - 3], [x + 26, y - 6], [x + 30, y + 10], [x - 28, y + 12]], 1, x, 7, slabs);
  }
  for (let x = C_IN + 120; x < CLIFF + 60; x += 70 + rng() * 90) {
    const y = groundTop(x) + 26;
    cutPath(blobPts(x, y, 30 + rng() * 34, 18 + rng() * 14, x, 0.12, 22, (rng() - 0.5) * 0.4), 1, x, 7, rocks);
  }
  // Meadow bands across the climb face, lighter paper laid in strips
  const meadow = new Path2D();
  for (let j = 0; j < 4; j++) {
    const off = 70 + j * 95;
    const top: Pt[] = [];
    for (let x = C_IN - 40 + j * 30; x <= CLIFF + 10; x += 10) top.push([x, Math.max(walkY(x) + off + 12 * Math.sin(x / 70 + j), groundTop(x) + 30)]);
    const strip: Pt[] = [...top, ...[...top].reverse().map(([x, y]) => [x, y + 26 + 8 * Math.sin(x / 45 + j)] as Pt)];
    cutPath(strip, 1.2, 120 + j, 9, meadow);
  }
  ground.push({ path: meadow, color: '#9bb465', depth: 3, edge: 0.5, seed: 29 });
  const facePines = new Path2D();
  for (let x = C_IN + 90; x < CLIFF; x += 90 + rng() * 110) {
    const y = walkY(x) + 130 + rng() * 220;
    const h = 50 + rng() * 40;
    cutPath(pinePts(x, y, h, h * 0.45, x, 4), 0.7, x, 6, facePines);
  }
  ground.push({ path: facePines, color: P.treeE, depth: 5, edge: 0.5, seed: 30 });
  ground.push({ path: rocks, color: P.rockShade, depth: 6, edge: 0.6, seed: 24 });
  ground.push({ path: slabs, color: P.rock, depth: 4, edge: 0.8, seed: 28 });
  const seat = new Path2D();
  cutPath(blobPts(H_END - 12, walkY(H_END) - 20, 36, 30, 77, 0.1, 26), 1, 77, 7, seat);
  ground.push({ path: seat, color: P.rock, depth: 5, edge: 0.7, seed: 78 });
  const cx0 = Math.min(H_END + 220, CLIFF - 70);
  [[0, 0, 30, 14], [2, -22, 23, 11], [-1, -40, 17, 9], [1, -54, 11, 7]].forEach(([dx, dy, rx, ry], i) => {
    const pp = new Path2D();
    cutPath(blobPts(cx0 + dx, walkY(cx0) - 10 + dy, rx, ry, 90 + i, 0.08, 22), 0.8, 90 + i, 6, pp);
    ground.push({ path: pp, color: i % 2 ? P.rockShade : P.rock, depth: 4, edge: 0.6, seed: 27 + i });
  });
  // Trailhead sign
  const post = new Path2D();
  const sy = walkY(H_START) - 120;
  cutPath([[H_START - 98, walkY(H_START - 95) + 10], [H_START - 98, sy], [H_START - 88, sy], [H_START - 88, walkY(H_START - 95) + 10]], 0.6, 61, 6, post);
  ground.push({ path: post, color: P.wood, depth: 5, edge: 0.4, seed: 25 });
  const board = new Path2D();
  cutPath([[H_START - 140, sy - 2], [H_START - 50, sy - 6], [H_START - 30, sy + 12], [H_START - 50, sy + 30], [H_START - 140, sy + 26]], 0.8, 62, 6, board);
  ground.push({ path: board, color: '#b07b4a', depth: 4, edge: 0.6, seed: 26 });
  // Stepping stones
  const stones = new Path2D();
  const lit = new Path2D();
  STONES.forEach((sx, i) => {
    cutPath(blobPts(sx, 734, 34 + (i % 2) * 5, 24, 40 + i, 0.09, 32), 1, 40 + i, 7, stones);
    cutPath(blobPts(sx - 6, 722, 20, 8, 50 + i, 0.1, 24), 0.8, 50 + i, 6, lit);
  });
  ground.push({ path: stones, color: P.rockShade, depth: 5, edge: 0.6, seed: 31 });
  ground.push({ path: lit, color: P.rock, depth: 1, edge: 0.5, seed: 32 });
  const groundPlate = bakePlate(r, 1, clipRect(viewRect(views, 1), { x: -1e4, y: SUMMIT_Y - 110, w: 2e4, h: 2e4 }), (g) => drawSheets(g, k, ground));

  /* foreground: ferns, grass and flowers along the bottom edge */
  const foreP = 1.3;
  const baseY = (x: number) => 835 + 30 * Math.sin(x / 140) + 0.4 * (walkY(camAt(x, foreP)) - 650);
  const fern = new Path2D();
  for (let x = -1200; x < 5400; x += 40 + rng() * 70) {
    if (rng() < 0.35) continue;
    const y = baseY(x);
    const blades = 5 + Math.floor(rng() * 3);
    const hgt = 60 + rng() * 70;
    for (let j = 0; j < blades; j++) {
      const a = -Math.PI / 2 + (j / (blades - 1) - 0.5) * 1.7 + (rng() - 0.5) * 0.2;
      const len = hgt * (0.7 + 0.3 * Math.sin((j / (blades - 1)) * Math.PI));
      const tip: Pt = [x + Math.cos(a) * len, y + Math.sin(a) * len];
      const w = 7 + rng() * 4;
      const nx = -Math.sin(a) * w;
      const ny = Math.cos(a) * w;
      const mid: Pt = [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5];
      cutPath([[x - nx * 0.3, y - ny * 0.3], [mid[0] - nx, mid[1] - ny], tip, [mid[0] + nx, mid[1] + ny], [x + nx * 0.3, y + ny * 0.3]], 0.6, x + j, 6, fern);
    }
  }
  const dots = new Path2D();
  const dots2 = new Path2D();
  for (let x = -1180; x < 5400; x += 60 + rng() * 120) {
    const y = baseY(x) - 30 - rng() * 50;
    const pp = rng() < 0.6 ? dots : dots2;
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * TAU;
      cutPath(blobPts(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.5, 4.5, x + j, 0.1, 12), 0.4, x + j, 4, pp);
    }
  }
  const foreSheets: SheetDef[] = [
    { path: fern, color: P.fore, depth: 10, edge: 0.4, seed: 72 },
    { path: cutRidge((x) => baseY(x) + 20, -1200, 5400, BOTTOM, 71, 1.4), color: P.fore, depth: 10, edge: 0.4, seed: 73 },
    { path: dots, color: P.flower, depth: 4, edge: 0, seed: 74 },
    { path: dots2, color: P.flower2, depth: 4, edge: 0, seed: 75 },
  ];
  const fore = bakePlate(r, foreP, clipRect(viewRect(views, foreP), { x: -1e4, y: 300, w: 2e4, h: 2e4 }), (g) => drawSheets(g, k, foreSheets));

  /* the big trunks that sweep past close to the lens (live: few and simple) */
  const trunks = new Path2D();
  const bark = new Path2D();
  for (const cxw of [1300, 1560, 1790]) {
    const lx = 800 + (cxw - 800) * TRUNK_P + (hash(cxw) - 0.5) * 80;
    const w = 70 + hash(cxw + 1) * 40;
    cutPath([[lx - w / 2, -3200], [lx + w / 2, -3200], [lx + w / 2 + 10, 1600], [lx - w / 2 - 10, 1600]], 1.6, cxw, 14, trunks);
    cutPath([[lx + w / 2 - 4, 130], [lx + w / 2 + 110, 70], [lx + w / 2 + 116, 86], [lx + w / 2 - 4, 170]], 1, cxw + 2, 8, trunks);
    for (let j = 0; j < 3; j++) {
      const bx = lx - w * 0.25 + j * w * 0.22;
      cutPath([[bx, -400 + j * 90], [bx + 9, -400 + j * 90], [bx + 11, 1200], [bx + 2, 1200]], 0.8, cxw + j * 7, 12, bark);
    }
  }

  return {
    k,
    dog: makeStamp(280, 260, res, 0.6),
    person: makeStamp(190, 270, res, 0.86),
    arm: makeStamp(190, 270, res, 0.86),
    sky,
    clouds,
    plates,
    ground: groundPlate,
    fore,
    trunks,
    bark,
    sunCut: blobPts(0, 0, 1, 1, 5, 0.025, 64),
  };
};

const TRUNK_P = 1.8;

/* ---------- camera ---------- */

function camera(t: number): View {
  const hx = hikerX(t);
  const track = { x: hx + 170, y: walkY(hx) - 205 };
  // Opening: high on the ranges, crane down to the trailhead
  const down = tween(t, 0, 3.5, ease.inOutSine);
  let x = lerp(700, track.x, down);
  let y = lerp(-330, track.y, down);
  let z = lerp(0.94, 1, down);
  // Closer over the stones
  const st = tween(t, T_STREAM - 0.4, T_STREAM + 0.8, ease.inOutSine) * (1 - tween(t, T_CLIMB - 0.4, T_CLIMB + 0.8, ease.inOutSine));
  z = lerp(z, 1.07, st);
  y += 18 * st;
  // Climb: look up the hill, then open out at the top for the view
  const climb = tween(t, T_CLIMB - 0.4, T_CLIMB + 1.4, ease.inOutSine);
  y -= 50 * climb;
  const top = tween(t, T_SUMMIT - 1.8, T_SUMMIT + 1.6, ease.inOutCubic);
  x = lerp(x, H_END + 230, top);
  y = lerp(y, walkY(H_END) - 175, top);
  z = lerp(z, 1.06, top);
  z *= 1 + 0.035 * tween(t, T_SUMMIT + 1.2, DURATION, ease.inOutSine);
  return { x, y, z };
}

const camFor = (r: Riso, C: View, p: number) => {
  const l = layerView(C, p);
  r.camera(l.x, l.y, l.z);
};

/** Sun in screen space through the day */
const sunAt = (t: number) => {
  const sx = keys(t, [[0, 1040], [3.6, 1080], [8, 1170], [11.5, 1230], [15, 1190], [DURATION, 1170]], ease.inOutSine);
  const sy = keys(t, [[0, 455], [3.0, 290], [8, 175], [11, 150], [14.6, 330], [DURATION, 440]], ease.inOutSine);
  const sr = keys(t, [[0, 74], [8, 64], [13, 66], [DURATION, 92]], ease.inOutSine);
  return { x: sx, y: sy, r: sr };
};

/* ---------- drawing ---------- */

const waterBand = (c: Ctx, k: Craft, t: number, y0: number, amp: number, spd: number, seed: number, color: string, depth: number, x0: number, x1: number) => {
  const p = new Path2D();
  p.moveTo(x0, 900);
  for (let x = x0; x <= x1; x += 8) {
    const w = amp * Math.sin(x / 36 + t * spd + seed) + amp * 0.5 * Math.sin(x / 13 - t * spd * 1.6);
    p.lineTo(x, y0 + w + (hash(seed + Math.round(x / 8)) - 0.5) * 1.2);
  }
  p.lineTo(x1, 900);
  p.closePath();
  sheet(c, k, p, color, { depth, edge: 0.6, seed });
};

/** The stream behind the banks: two wavy sheets and the sun broken into gold slivers */
const drawWater = (c: Ctx, k: Craft, t: number, sunWX: number, glint: number) => {
  waterBand(c, k, t, 728, 3, 1.8, 1, P.waterLight, 3, S_IN - 80, S_OUT + 80);
  waterBand(c, k, t, 742, 3.5, -1.4, 2, P.water, 5, S_IN - 80, S_OUT + 80);
  if (glint > 0.01) {
    c.save();
    c.globalAlpha = glint;
    for (let i = 0; i < 6; i++) {
      const y = 754 + i * 9;
      const w = (74 - i * 9) * (0.8 + 0.3 * Math.sin(t * 3 + i * 1.7));
      const x = sunWX + Math.sin(t * 2.2 + i * 2.1) * 8;
      const p = new Path2D();
      cutPath([[x - w / 2, y], [x + w / 2, y - 1], [x + w / 2 - 4, y + 3.5], [x - w / 2 + 3, y + 4]], 0.6, i + 300, 6, p);
      sheet(c, k, p, i % 2 ? P.sunHalo : P.sun, { depth: 1.5, tex: 0.5, seed: i });
    }
    c.restore();
  }
};

const SPLASH = [0, 1, 2, 3, 4];

export const paperTrailFilm: RisoFilm<State> = {
  id: 'paper-trail',
  title: 'Trail Day',
  caption: 'A cut-paper hike with Luna: pines, a stream to hop, and the view from the top.',
  theme: 'Luna',
  motif: 'The paper sun: sunrise, light through pines, gold in the stream, sunset for two',
  duration: DURATION,
  series: 'Paper cut',
  mode: 'direct',
  paper: '#efe6d3',
  paperTexture: true,
  grain: 0.12,
  inks: [{ color: P.sun }, { color: HIKER.coat }, { color: LUNA_LOOK.coat }, { color: P.treeE }, { color: P.rangeB }],
  scenes: [
    { at: 0, label: 'Sunrise' },
    { at: T_FOREST, label: 'The pines' },
    { at: T_STREAM, label: 'Stream' },
    { at: T_CLIMB, label: 'The climb' },
    { at: T_SUMMIT, label: 'Summit' },
  ],
  posterTime: 17.4,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const k = s.k;
    const C = camera(t);
    const sun = sunAt(t);
    const day = tween(t, 1.5, 6, ease.inOutSine);
    const dusk = tween(t, 12.5, 17.5, ease.inOutSine);

    /* ----- sky ----- */
    r.camera(800, 450, 1);
    if (dusk < 1) drawPlate(c, s.sky[day < 1 ? 0 : 1]);
    c.save();
    if (day > 0 && day < 1) {
      c.globalAlpha = day;
      drawPlate(c, s.sky[1]);
    }
    if (dusk > 0) {
      c.globalAlpha = dusk;
      drawPlate(c, s.sky[2]);
    }
    c.restore();

    /* ----- sun: halo, disc, a lighter inner disc ----- */
    const sunPath = (rad: number, dx = 0, dy = 0) => {
      const p = new Path2D();
      s.sunCut.forEach(([x, y], i) => (i ? p.lineTo(sun.x + dx + x * rad, sun.y + dy + y * rad) : p.moveTo(sun.x + dx + x * rad, sun.y + dy + y * rad)));
      p.closePath();
      return p;
    };
    const breathe = 1 + 0.02 * Math.sin(t * 1.6);
    sheet(c, k, sunPath(sun.r * 1.45 * breathe), mix(P.sunHalo, '#f7c89a', dusk), { depth: 3, edge: 0.3, seed: 41, tex: 0.6 });
    sheet(c, k, sunPath(sun.r), mix(P.sun, P.sunDusk, dusk), { depth: 5, edge: 0.6, seed: 42 });
    sheet(c, k, sunPath(sun.r * 0.62, -sun.r * 0.12, -sun.r * 0.12), mix('#f8cc5c', '#f3a050', dusk), { depth: 2, edge: 0.3, seed: 43 });

    /* ----- clouds ----- */
    for (const cl of s.clouds) {
      camFor(r, C, cl.p);
      c.save();
      c.translate(cl.x + cl.drift * t, cl.y);
      sheet(c, k, cl.path, P.cloud, { depth: 6, edge: 0.4, seed: cl.x, tex: 0.6 });
      c.restore();
    }

    /* ----- ranges and forest ----- */
    for (const pl of s.plates) {
      camFor(r, C, pl.p);
      drawPlate(c, pl);
    }

    /* ----- stream, ground plane ----- */
    camFor(r, C, 1);
    // Sunlight sparkles on the stretch of water nearest the sun
    const sunWX = clamp(C.x + (sun.x - 800) / C.z, S_IN + 70, S_OUT - 70);
    const glint = tween(t, T_STREAM - 0.6, T_STREAM + 0.5) * (1 - tween(t, T_CLIMB, T_CLIMB + 1));
    if (C.x > S_IN - 1100 && C.x < S_OUT + 1100) drawWater(c, k, t, sunWX, glint);
    drawPlate(c, s.ground);
    if (C.x > S_IN - 1100 && C.x < S_OUT + 1100) {
      waterBand(c, k, t, 770, 3, 1.1, 3, P.water, 6, S_IN + 6, S_OUT - 6);
      const foam = new Path2D();
      for (let i = 0; i < 4; i++) {
        const x = STONES[i];
        const ph = (t * 0.9 + i * 0.27) % 1;
        const w = 26 + 10 * Math.sin(ph * Math.PI);
        cutPath([[x - w - 18, 751], [x - 18, 747], [x + w - 10, 751], [x - 18, 754]], 0.5, i + 400, 5, foam);
      }
      sheet(c, k, foam, P.foam, { depth: 1.5, tex: 0.4, seed: 401 });
      // The near bank, so the stream reads as a ribbon seen from the trail
      const bank = new Path2D();
      bank.moveTo(S_IN - 60, 1000);
      for (let x = S_IN - 60; x <= S_OUT + 60; x += 10) bank.lineTo(x, 800 + 6 * Math.sin(x / 47) + 4 * Math.sin(x / 19) + (hash(x) - 0.5) * 1.5);
      bank.lineTo(S_OUT + 60, 1000);
      bank.closePath();
      sheet(c, k, bank, P.groundShade, { depth: 8, edge: 0.6, seed: 402 });
    }

    /* ----- the hiker and Luna ----- */
    const hx = hikerX(t);
    const hv = speed(t, hx);
    const sitK = tween(t, T_SUMMIT + 0.3, T_SUMMIT + 1.1, ease.inOutSine);
    const slope = (walkY(hx + 12) - walkY(hx - 12)) / 24;
    const hm = clamp(hv / 120) * (1 - sitK);
    const climbH = smoothstep(C_IN - 40, C_IN + 80, hx) * (1 - smoothstep(C_TOP - 80, C_TOP + 20, hx));
    const feet = hikerFeet(hx, hm, climbH);
    const pose: PersonPose = {
      q: feet.phi - 0.25,
      stride: hm,
      sit: sitK,
      lean: clamp(-slope * 0.35, -0.1, 0.32) * (1 - sitK) + 0.05,
      ankles: feet.ankles,
      bootRot: [lerp(feet.bootRot[0], 0, sitK), lerp(feet.bootRot[1], 0, sitK)],
    };
    const hug = tween(t, T_SUMMIT + 1.2, T_SUMMIT + 2.1, ease.inOutSine);
    if (hug > 0) pose.arm = [lerp(0.5, 0.95, hug), lerp(1.25, 1.5, hug)];
    const hy = lerp(walkY(hx), walkY(H_END) + 1, sitK);
    stampDraw(c, k, s.person, hx, hy + 2, (g) => personArt(g, pose, HIKER, hug > 0 ? 'body' : 'all'), { depth: 7, seed: 5 });

    const lx = lunaX(t);
    const lp = leap(lx);
    const lf = lunaFrame(t);
    stampDraw(c, k, s.dog, lf.x, lf.y, (g) => lunaArt(g, lf.pose, LUNA_LOOK), {
      scale: LUNA_SCALE,
      rot: lf.rot,
      depth: 6 + lp.h * 0.25,
      seed: 9,
    });
    if (hug > 0) stampDraw(c, k, s.arm, hx, hy + 2, (g) => personArt(g, pose, HIKER, 'arm'), { depth: 5, seed: 5 });

    // Splashes where she lands on a stone
    if (lp.i > 0) {
      const land = LEAPS[lp.i];
      const age = (lx - land) / 70;
      if (age >= 0 && age <= 1) {
        const p = new Path2D();
        for (const j of SPLASH) {
          const a = -Math.PI / 2 + (j - 2) * 0.45;
          const d = 10 + age * 60;
          cutPath(blobPts(land + Math.cos(a) * d, 735 + Math.sin(a) * d + age * age * 60, 4 * (1 - age) + 1, 4 * (1 - age) + 1, j, 0.1, 10), 0.3, j, 4, p);
        }
        sheet(c, k, p, P.foam, { depth: 2, tex: 0.3, seed: 7 });
      }
    }

    /* ----- foreground ----- */
    camFor(r, C, s.fore.p);
    drawPlate(c, s.fore);
    camFor(r, C, TRUNK_P);
    sheet(c, k, s.trunks, '#4a3526', { depth: 18, edge: 0.3, seed: 81 });
    sheet(c, k, s.bark, '#3a2a1f', { depth: 0, edge: 0, seed: 82, tex: 0.4 });

    /* ----- light ----- */
    warmLight(c, sun.x, sun.y, 0.8 + 0.6 * dusk, dusk > 0.5 ? '255,190,120' : '255,214,150');

    /* ----- title: letters cut from scraps, dropped on one by one ----- */
    const tk = tween(t, 15.9, 16.9, ease.outCubic);
    if (tk > 0) {
      r.camera(800, 450, 1);
      const word = 'TRAIL DAY';
      c.save();
      c.font = `400 76px ${DISPLAY}`;
      c.textAlign = 'center';
      const widths = Array.from(word).map((ch) => c.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + 10 * (word.length - 1);
      let x = 560 - total / 2;
      Array.from(word).forEach((ch, i) => {
        const kk = ease.outBack(seg(t, 15.9 + i * 0.07, 16.5 + i * 0.07));
        if (kk > 0 && ch !== ' ') {
          c.save();
          c.translate(x + widths[i] / 2, 170 - (1 - kk) * 40);
          c.rotate((hash(i + 3) - 0.5) * 0.08 + (1 - kk) * 0.3);
          c.globalAlpha = clamp(kk * 2);
          const p = new Path2D();
          const bw = widths[i] / 2 + 9;
          cutPath([[-bw, -66], [bw, -64], [bw + 2, 14], [-bw - 1, 12]], 1.4, i + 600, 8, p);
          sheet(c, k, p, '#fbf5e6', { depth: 6, edge: 0, seed: i + 600, tex: 0.6 });
          c.fillStyle = i < 5 ? HIKER.coat : '#3d6b55';
          c.shadowColor = 'rgba(52,28,10,0.3)';
          c.shadowBlur = 3 * r.scale;
          c.shadowOffsetY = 2 * r.scale;
          c.fillText(ch, 0, 0);
          c.restore();
        }
        x += widths[i] + 10;
      });
      const sub = tween(t, 16.7, 17.5, ease.outCubic);
      if (sub > 0) {
        c.globalAlpha = sub;
        c.font = `400 25px ${DISPLAY}`;
        c.fillStyle = '#6a4a2e';
        spacedText(c, 'WITH LUNA', 560, 232, 7);
      }
      c.restore();
    }
  },
};
