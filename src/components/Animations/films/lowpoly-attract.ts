import type { RisoFilm, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, noise1, mulberry, DISPLAY, MONO } from '../riso/kit';
import {
  LowPoly,
  MeshB,
  mat,
  rgb,
  mixRGB,
  css,
  add,
  sub,
  mul,
  norm,
  lerp3,
  crt,
  hud,
  hudPanel,
  bounds,
  F_UNLIT,
  F_NOFOG,
  F_TWO,
  F_ADD,
  F_ALPHA,
  RW,
  type Mesh,
  type V3,
  type RGB,
  type Env,
  type Cam,
} from '../styles/lowpoly';

/* ---------- palette ---------- */

const HAZE = rgb('#f49a7c');
const SKY: [number, RGB][] = [
  [-1, rgb('#c47a8a')],
  [-0.02, rgb('#f2a07e')],
  [0.03, rgb('#ffb27a')],
  [0.12, rgb('#f07a78')],
  [0.3, rgb('#a4528c')],
  [0.6, rgb('#4a2e7a')],
  [1, rgb('#22184c')],
];
const SUN_COL = rgb('#fff4c8');
const SUN_GLOW = rgb('#ffb060');

/* ---------- the track ---------- */

const STEP = 1;
const TRACK = 920;
/** [start, end, total turn]: + is a left turn */
const BENDS: [number, number, number][] = [
  [0, 220, 0.23],
  [222, 345, -1.3],
  [560, 800, -1.5],
];
const BRIDGE0 = 382;
const BRIDGE1 = 472;
const GAP0 = 405;
const GAP1 = 437;
const RAMP0 = 397;
const ROAD_W = 6;

const sstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const elev = (s: number) => {
  const base = 3 + 1.4 * Math.sin(s / 70) + 0.8 * Math.sin(s / 31);
  const b = sstep(328, 384, s) * (1 - sstep(472, 522, s));
  let y = lerp(base, 12, b);
  if (s > RAMP0 && s <= GAP0) y += ((s - RAMP0) / (GAP0 - RAMP0)) ** 1.6 * 1.3;
  return y;
};
/** 1 inside the bridge inlet, where the land falls away into the sea */
const gorge = (s: number) => sstep(352, 386, s) * (1 - sstep(468, 500, s));

interface Path {
  x: Float32Array;
  z: Float32Array;
  a: Float32Array;
}

const buildPath = (): Path => {
  const n = Math.ceil(TRACK / STEP) + 2;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const a = new Float32Array(n);
  let px = 0;
  let pz = 0;
  let ya = 0;
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    x[i] = px;
    z[i] = pz;
    a[i] = ya;
    let k = 0;
    for (const [s0, s1, turn] of BENDS) {
      if (s >= s0 && s < s1) {
        const u = (s - s0) / (s1 - s0);
        k += (turn / (s1 - s0)) * (1 - Math.cos(TAU * u));
      }
    }
    ya += k * STEP;
    px += Math.sin(ya) * STEP;
    pz += Math.cos(ya) * STEP;
  }
  return { x, z, a };
};

/* ---------- motion: keyed distance along the track ---------- */

/** [t, s, v] — Hermite between keys */
const KEYS: [number, number, number][] = [
  [0, 0, 46],
  [2.6, 122, 47],
  [4.4, 206, 44],
  [5.4, 246, 36],
  [7.1, 318, 46],
  [8.55, 397, 56],
  [8.75, 407, 30],
  [9.75, 427, 14],
  [10.05, 442, 50],
  [11.8, 530, 50],
  [12.0, 540, 50],
  [15.9, 596, 50],
  [17.7, 686, 44],
  [18.6, 712, 14],
  [20, 728, 9],
];

const raceS = (t: number) => {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const [t0, s0, v0] = KEYS[i];
  const [t1, s1, v1] = KEYS[i + 1];
  const h = t1 - t0;
  const u = clamp((t - t0) / h);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * s0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * s1 + (u3 - u2) * h * v1;
};

const speedAt = (t: number) => (raceS(t + 0.02) - raceS(t - 0.02)) / 0.04;

/** Lane offset of the hero car (+ = right) */
const heroD = (t: number) => {
  let d = -2.4;
  d = lerp(d, 2.7, tween(t, 3.0, 3.7));
  d = lerp(d, -2.9, tween(t, 4.2, 5.0));
  d = lerp(d, 3.0, tween(t, 5.2, 6.2));
  d = lerp(d, 0.6, tween(t, 6.3, 7.2));
  d = lerp(d, 0, tween(t, 7.6, 8.4));
  // second run: the beach sweeper
  if (t > 15) {
    d = -2.6;
    d = lerp(d, 2.8, tween(t, 16.2, 17.6));
    d = lerp(d, 1.2, tween(t, 17.8, 20));
  }
  return d;
};

/** Drift slip angle: the tail hangs out, nose points into the right-hand bends */
const slipAt = (t: number) => {
  const a = tween(t, 4.6, 5.3) * (1 - tween(t, 6.6, 7.3)) * 0.5;
  const b = tween(t, 16.3, 17.2) * 0.55;
  const wob = Math.sin(t * 7) * 0.03;
  return (a + b) * (1 + wob);
};
const drifting = (t: number) => (t > 4.7 && t < 7.0) || t > 16.4;

const RIVAL0 = 68;
const rivalS = (t: number) => RIVAL0 + 30 * t;

/* ---------- meshes ---------- */

const carMesh = (body: string, trim: string) => {
  const b = new MeshB();
  const B = rgb(body);
  const T = rgb(trim);
  // loft of cross sections: z, half width, bottom, belt, top, top half width
  const S: [number, number, number, number, number, number][] = [
    [-2.25, 0.9, 0.3, 0.62, 0.86, 0.78],
    [-1.95, 0.96, 0.26, 0.68, 0.95, 0.84],
    [-0.9, 0.98, 0.25, 0.68, 0.96, 0.85],
    [0.75, 0.98, 0.25, 0.64, 0.9, 0.84],
    [1.75, 0.93, 0.26, 0.56, 0.76, 0.78],
    [2.3, 0.82, 0.32, 0.44, 0.58, 0.66],
  ];
  const ring = (k: number): V3[] => {
    const [z, w, yb, ym, yt, tw] = S[k];
    return [
      [-w, yb, z],
      [w, yb, z],
      [w, ym, z],
      [tw, yt, z],
      [0, yt + 0.03, z],
      [-tw, yt, z],
      [-w, ym, z],
    ];
  };
  for (let k = 0; k < S.length - 1; k++) {
    const r0 = ring(k);
    const r1 = ring(k + 1);
    for (let e = 0; e < r0.length; e++) {
      const f = (e + 1) % r0.length;
      let col: RGB = B;
      if (e === 0) col = T;
      else if (e === 1 || e === 6) col = mixRGB(B, T, 0.25);
      b.quad(r0[e], r0[f], r1[f], r1[e], col);
    }
  }
  // rear panel with tail lights
  const rr = ring(0);
  b.poly([rr[6], rr[5], rr[4], rr[3], rr[2], rr[1], rr[0]], mixRGB(B, T, 0.4));
  // nose
  const nr = ring(S.length - 1);
  b.poly(nr, mixRGB(B, T, 0.15));
  // tail lights and headlights
  const z0 = -2.26;
  b.quad([0.78, 0.5, z0], [0.4, 0.5, z0], [0.4, 0.66, z0], [0.78, 0.66, z0], '#ff2a3a', F_UNLIT);
  b.quad([-0.4, 0.5, z0], [-0.78, 0.5, z0], [-0.78, 0.66, z0], [-0.4, 0.66, z0], '#ff2a3a', F_UNLIT);
  b.quad([-0.3, 0.42, z0], [-0.3, 0.32, z0], [0.3, 0.32, z0], [0.3, 0.42, z0], '#22222a');
  const z1 = 2.31;
  b.quad([-0.7, 0.46, z1], [-0.3, 0.46, z1], [-0.3, 0.55, z1], [-0.66, 0.56, z1], '#fff3c0', F_UNLIT);
  b.quad([0.3, 0.46, z1], [0.7, 0.46, z1], [0.66, 0.56, z1], [0.3, 0.55, z1], '#fff3c0', F_UNLIT);
  // cabin
  const glass = rgb('#1e2c4a');
  const base: V3[] = [
    [-0.82, 0.94, -1.3],
    [0.82, 0.94, -1.3],
    [0.82, 0.9, 0.85],
    [-0.82, 0.9, 0.85],
  ];
  const roof: V3[] = [
    [-0.62, 1.36, -0.6],
    [0.62, 1.36, -0.6],
    [0.62, 1.38, 0.12],
    [-0.62, 1.38, 0.12],
  ];
  b.quad(roof[0], roof[3], roof[2], roof[1], B);
  b.quad(base[3], base[2], roof[2], roof[3], glass); // windscreen
  b.quad(base[1], base[0], roof[0], roof[1], glass); // rear window
  b.quad(base[2], base[1], roof[1], roof[2], glass);
  b.quad(base[0], base[3], roof[3], roof[0], glass);
  // spoiler
  b.box(1.9, 0.07, 0.42, [B, T, B], mat(0, 1.18, -2.02, 0, -0.1, 0));
  b.box(0.08, 0.3, 0.16, T, mat(0.6, 1.0, -2.0));
  b.box(0.08, 0.3, 0.16, T, mat(-0.6, 1.0, -2.0));
  // wheels: octagonal drums along x, with hub caps
  for (const [x, z] of [
    [0.84, 1.42],
    [-0.84, 1.42],
    [0.84, -1.38],
    [-0.84, -1.38],
  ] as [number, number][]) {
    const M = mat(x + (x > 0 ? -0.16 : 0.16), 0.37, z, 0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.frustum(8, 0.37, 0.37, 0.32, '#17161c', M, { capCol: '#8a8a96' });
  }
  return b.build({ spec: 0.22, shin: 10 });
};

const palmB = (b: MeshB, x: number, y: number, z: number, h: number, lean: number, yaw: number, seed: number) => {
  const rng = mulberry(seed);
  const trunk = rgb('#7a5a44');
  const segs = 4;
  let p: V3 = [x, y, z];
  let r0 = 0.42;
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  for (let i = 0; i < segs; i++) {
    const k = (i + 1) / segs;
    const off = lean * k * k * h;
    const q: V3 = [x + dx * off, y + k * h, z + dz * off];
    const d = sub(q, p);
    const L = Math.hypot(d[0], d[1], d[2]);
    const pitch = Math.asin(clamp(Math.hypot(d[0], d[2]) / L, 0, 1));
    const M = mat(p[0], p[1], p[2], yaw, 0, 0);
    // tilt the segment toward the lean direction
    const Mt = mat(p[0], p[1], p[2], yaw, -pitch, 0);
    void M;
    b.frustum(5, r0, r0 * 0.86, L, i % 2 ? trunk : mixRGB(trunk, rgb('#5a4030'), 0.5), Mt, { caps: false });
    r0 *= 0.86;
    p = q;
  }
  // fronds
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.4;
    const l = h * (0.55 + rng() * 0.2);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = 0.9;
    const mid: V3 = [p[0] + ca * l * 0.5, p[1] + 0.5, p[2] + sa * l * 0.5];
    const tip: V3 = [p[0] + ca * l, p[1] - l * 0.45, p[2] + sa * l];
    const side: V3 = [-sa * w, 0, ca * w];
    const g1 = rgb(rng() < 0.5 ? '#3f7a3a' : '#4e8c3c');
    b.tri(b.vert(p), b.vert(add(mid, side)), b.vert(mid), g1, F_TWO);
    b.tri(b.vert(p), b.vert(mid), b.vert(sub(mid, side)), mixRGB(g1, [20, 40, 30], 0.3), F_TWO);
    b.tri(b.vert(mid), b.vert(add(mid, side)), b.vert(tip), g1, F_TWO);
    b.tri(b.vert(mid), b.vert(tip), b.vert(sub(mid, side)), mixRGB(g1, [20, 40, 30], 0.3), F_TWO);
  }
};

interface Chunk {
  ground: Mesh;
  objs: Mesh;
  marks: Mesh;
  under: Mesh;
  c: V3;
}

interface State {
  lp: LowPoly;
  path: Path;
  chunks: Chunk[];
  hero: Mesh;
  rival: Mesh;
  sea: Mesh;
  seaN: number;
  islands: { m: Mesh; p: V3 }[];
  clouds: { p: V3; r: number; sy: number; c: RGB }[];
  turntable: Mesh;
  grid: Mesh;
  mini: [number, number][];
  sun: V3;
}

/* ---------- path queries ---------- */

const at = (P: Path, s: number) => {
  const f = clamp(s, 0, TRACK) / STEP;
  const i = Math.min(P.x.length - 2, Math.floor(f));
  const k = f - i;
  const x = lerp(P.x[i], P.x[i + 1], k);
  const z = lerp(P.z[i], P.z[i + 1], k);
  const a = lerp(P.a[i], P.a[i + 1], k);
  return { x, z, a, y: elev(s) };
};
/** right-hand vector for heading a */
const rightOf = (a: number): V3 => [-Math.cos(a), 0, Math.sin(a)];
const fwdOf = (a: number): V3 => [Math.sin(a), 0, Math.cos(a)];

const pointAt = (P: Path, s: number, d: number, dy = 0): V3 => {
  const q = at(P, s);
  const r = rightOf(q.a);
  return [q.x + r[0] * d, q.y + dy, q.z + r[2] * d];
};

/* ---------- world building ---------- */

const CH = 40;

const buildWorld = (P: Path) => {
  const rng = mulberry(77);
  const chunks: Chunk[] = [];
  const nh = (s: number, seed: number) => noise1(s / 23, seed) * 0.6 + noise1(s / 9, seed + 3) * 0.4;
  const asphalt = rgb('#4b4756');
  const asphalt2 = rgb('#45414f');
  const grass = rgb('#78a040');
  const grass2 = rgb('#6a9238');
  const rock = rgb('#a07a5c');
  const rockD = rgb('#7c5c48');
  const sand = rgb('#eccb92');
  const shoulder = rgb('#8a7c6e');
  const concrete = rgb('#c4b8aa');
  // lateral profiles: offsets (m) and height above/below road; land falls into the sea in the inlet
  const leftProf = (s: number) => {
    const g = gorge(s);
    const e = elev(s);
    const o = [-ROAD_W - 0.6, -ROAD_W - 3, -ROAD_W - 12, -ROAD_W - 30];
    const h = [e - 0.15, e - 1.4 - nh(s, 2) * 0.6, 0.5 + nh(s, 4) * 0.4, -1.8];
    return { o, h: h.map((v, i) => (i === 0 ? lerp(v, -6, g) : lerp(v, -6, g))) };
  };
  const rightProf = (s: number) => {
    const g = gorge(s);
    const e = elev(s);
    const cl = 1 - sstep(540, 600, s) * 0.6; // lower hills on the beach run
    const o = [ROAD_W + 0.6, ROAD_W + 4, ROAD_W + 16, ROAD_W + 38, ROAD_W + 75];
    const h = [e + 0.1, e + 0.7, e + (6 + nh(s, 6) * 4) * cl, e + (16 + nh(s, 8) * 9) * cl, e + (30 + nh(s, 9) * 14) * cl];
    return { o, h: h.map((v) => lerp(v, -6, g)) };
  };
  const SP = 5;
  for (let c0 = 0; c0 < TRACK; c0 += CH) {
    const G = new MeshB();
    const O = new MeshB();
    const K = new MeshB();
    const U = new MeshB();
    for (let s = c0; s < Math.min(TRACK, c0 + CH); s += SP) {
      const s1 = s + SP;
      const inGap = s1 > GAP0 && s < GAP1;
      const onBridge = s >= BRIDGE0 - SP && s1 <= BRIDGE1 + SP;
      const i5 = Math.round(s / SP);
      // road
      if (!inGap) {
        const a = pointAt(P, s, -ROAD_W);
        const b2 = pointAt(P, s, ROAD_W);
        const c = pointAt(P, s1, ROAD_W);
        const d = pointAt(P, s1, -ROAD_W);
        const m0 = pointAt(P, s, 0);
        const m1 = pointAt(P, s1, 0);
        G.quad(a, m0, m1, d, i5 % 2 ? asphalt : asphalt2);
        G.quad(m0, b2, c, m1, i5 % 2 ? asphalt2 : asphalt);
        // centre dashes
        if (i5 % 2 === 0) K.quad(pointAt(P, s + 0.5, -0.18, 0.02), pointAt(P, s + 0.5, 0.18, 0.02), pointAt(P, s + 3.2, 0.18, 0.02), pointAt(P, s + 3.2, -0.18, 0.02), '#f4eee0');
        // curbs
        const cc = i5 % 2 ? rgb('#e03a2e') : rgb('#f2ede2');
        K.quad(pointAt(P, s, -ROAD_W - 0.7, 0.12), pointAt(P, s, -ROAD_W + 0.25, 0.04), pointAt(P, s1, -ROAD_W + 0.25, 0.04), pointAt(P, s1, -ROAD_W - 0.7, 0.12), cc);
        K.quad(pointAt(P, s, ROAD_W - 0.25, 0.04), pointAt(P, s, ROAD_W + 0.7, 0.12), pointAt(P, s1, ROAD_W + 0.7, 0.12), pointAt(P, s1, ROAD_W - 0.25, 0.04), cc);
      }
      // terrain strips
      const L0 = leftProf(s);
      const L1 = leftProf(s1);
      for (let k = 0; k < L0.o.length - 1; k++) {
        const p0 = pointAt(P, s, L0.o[k]);
        const p1 = pointAt(P, s, L0.o[k + 1]);
        const p2 = pointAt(P, s1, L1.o[k + 1]);
        const p3 = pointAt(P, s1, L1.o[k]);
        p0[1] = L0.h[k];
        p1[1] = L0.h[k + 1];
        p2[1] = L1.h[k + 1];
        p3[1] = L1.h[k];
        const col = k === 0 ? shoulder : k === 1 ? mixRGB(rock, sand, 0.4) : sand;
        G.quad(p0, p3, p2, p1, mixRGB(col, [255, 255, 255], ((i5 * 7 + k) % 3) * 0.03));
      }
      const R0 = rightProf(s);
      const R1 = rightProf(s1);
      for (let k = 0; k < R0.o.length - 1; k++) {
        const p0 = pointAt(P, s, R0.o[k]);
        const p1 = pointAt(P, s, R0.o[k + 1]);
        const p2 = pointAt(P, s1, R1.o[k + 1]);
        const p3 = pointAt(P, s1, R1.o[k]);
        p0[1] = R0.h[k];
        p1[1] = R0.h[k + 1];
        p2[1] = R1.h[k + 1];
        p3[1] = R1.h[k];
        const slope = Math.abs(R0.h[k + 1] - R0.h[k]) / (R0.o[k + 1] - R0.o[k]);
        const gc = (i5 + k) % 2 ? grass : grass2;
        const col = slope > 0.5 || R0.h[k] < 1 ? (k % 2 ? rock : rockD) : gc;
        G.quad(p0, p1, p2, p3, col);
      }
      // bridge structure
      if (onBridge && !inGap && s >= BRIDGE0 - 1 && s1 <= BRIDGE1 + 1) {
        const e0 = elev(s);
        const e1 = elev(s1);
        for (const side of [-1, 1]) {
          const o = side * (ROAD_W + 0.8);
          const a = pointAt(P, s, o);
          const b2 = pointAt(P, s1, o);
          const a2: V3 = [a[0], e0 - 1.6, a[2]];
          const b3: V3 = [b2[0], e1 - 1.6, b2[2]];
          if (side < 0) U.quad(a, b2, b3, a2, concrete);
          else U.quad(b2, a, a2, b3, concrete);
          // railing
          const ra = pointAt(P, s, side * (ROAD_W + 0.7), 1.1);
          const rb = pointAt(P, s1, side * (ROAD_W + 0.7), 1.1);
          const rc = pointAt(P, s1, side * (ROAD_W + 0.7), 0.85);
          const rd = pointAt(P, s, side * (ROAD_W + 0.7), 0.85);
          O.quad(ra, rb, rc, rd, '#e8e2d8', F_TWO);
          O.box(0.18, 1.1, 0.18, '#d8d0c4', mat(...pointAt(P, s, side * (ROAD_W + 0.7), 0.55)));
        }
        // underside
        U.quad(pointAt(P, s, -ROAD_W - 0.8, -1.6), pointAt(P, s1, -ROAD_W - 0.8, -1.6), pointAt(P, s1, ROAD_W + 0.8, -1.6), pointAt(P, s, ROAD_W + 0.8, -1.6), mixRGB(concrete, [40, 30, 60], 0.4));
        // piers
        if (i5 % 4 === 0 && (s < GAP0 - 8 || s > GAP1 + 4)) {
          for (const side of [-1, 1]) {
            const q = pointAt(P, s, side * 3.6, -1.6);
            U.frustum(6, 1.2, 1.0, q[1] + 8, concrete, mat(q[0], -8, q[2], at(P, s).a), { shade: 0.2 });
          }
          const q = pointAt(P, s, 0, -1.6);
          U.box(ROAD_W * 2 + 1.6, 1.2, 1.6, concrete, mat(q[0], q[1] - 0.6, q[2], at(P, s).a));
        }
      }
      // guard rail on the sea side (not on the bridge)
      if (!onBridge && i5 % 1 === 0) {
        const o = -ROAD_W - 1.4;
        const pa = pointAt(P, s, o, 0.75);
        const pb = pointAt(P, s1, o, 0.75);
        const pc = pointAt(P, s1, o, 0.35);
        const pd = pointAt(P, s, o, 0.35);
        O.quad(pa, pb, pc, pd, '#d8dce4', F_TWO);
        if (i5 % 2 === 0) O.box(0.16, 0.8, 0.16, '#9aa0ac', mat(...pointAt(P, s, o, 0.4)));
      }
      // chevrons on the outside of the drift bend
      if (s > 232 && s < 335 && i5 % 3 === 0) {
        const a = at(P, s).a;
        const q = pointAt(P, s, -ROAD_W - 2.2, 1.6);
        const M = mat(q[0], q[1], q[2], a - Math.PI / 2, 0, 0);
        O.box(0.12, 1.3, 2.6, ['#222', '#222', '#222'], M);
        // arrow faces the road (local +x)
        const ch = new MeshB();
        ch.quad([0.07, -0.65, -1.3], [0.07, -0.65, 1.3], [0.07, 0.65, 1.3], [0.07, 0.65, -1.3], '#ffd23a', F_UNLIT);
        O.merge(ch, M);
        for (const dz of [-0.75, 0.15]) {
          O.poly([[0.09, 0, dz + 0.55], [0.09, -0.5, dz], [0.09, -0.5, dz + 0.3], [0.09, 0, dz + 0.85]].map((p) => p as V3), '#1a1420', F_UNLIT, M);
          O.poly([[0.09, 0, dz + 0.55], [0.09, 0, dz + 0.85], [0.09, 0.5, dz + 0.3], [0.09, 0.5, dz]].map((p) => p as V3), '#1a1420', F_UNLIT, M);
        }
        O.box(0.14, 1.0, 0.14, '#888', mat(q[0], q[1] - 1.1, q[2]));
      }
      // palms on the beach, rocks and cypresses on the hill side
      if (rng() < 0.42 && gorge(s) < 0.1) {
        const o = -ROAD_W - 5 - rng() * 14;
        const q = pointAt(P, s + rng() * 4, o);
        const lp = leftProf(s);
        const y = lerp(lp.h[1], lp.h[2], clamp((-o - ROAD_W - 3) / 9)) - 0.2;
        palmB(O, q[0], y, q[2], 6 + rng() * 4, 0.25 + rng() * 0.25, at(P, s).a + Math.PI / 2 + (rng() - 0.5), Math.floor(rng() * 1e6));
      }
      if (rng() < 0.22 && gorge(s) < 0.1) {
        const o = ROAD_W + 6 + rng() * 10;
        const q = pointAt(P, s, o);
        const rp = rightProf(s);
        q[1] = lerp(rp.h[1], rp.h[2], clamp((o - ROAD_W - 4) / 12)) - 0.3;
        if (rng() < 0.5) O.rock(1.2 + rng() * 1.6, Math.floor(rng() * 1e5), rockD, mat(q[0], q[1], q[2], rng() * 3), { sy: 0.7 });
        else {
          O.frustum(5, 0.25, 0.2, 1.2, '#6a4a34', mat(q[0], q[1], q[2]));
          O.frustum(6, 1.3, 0, 6 + rng() * 3, '#2f6a3c', mat(q[0], q[1] + 1, q[2], rng()), { shade: 0.15 });
        }
      }
    }
    // the broken bridge: jagged lips, the tilted slab and fallen chunks
    if (c0 <= GAP0 && c0 + CH > GAP0) {
      for (let k = 0; k < 6; k++) {
        const d0 = -ROAD_W + (k / 6) * ROAD_W * 2;
        const d1 = -ROAD_W + ((k + 1) / 6) * ROAD_W * 2;
        const lip = GAP0 + 0.6 + ((k * 37) % 5) * 0.5;
        G.poly([pointAt(P, GAP0, d0), pointAt(P, GAP0, d1), pointAt(P, lip, (d0 + d1) / 2)], '#5a5560');
        U.quad(pointAt(P, GAP0, d1), pointAt(P, GAP0, d0), pointAt(P, GAP0, d0, -1.6), pointAt(P, GAP0, d1, -1.6), '#9a8e84');
      }
      for (let k = 0; k < 7; k++) {
        const q = pointAt(P, GAP0 + 3 + k * 4.2, -5 + ((k * 53) % 11), 0);
        q[1] = -1 + (k % 3);
        U.rock(1.6 + (k % 3), 900 + k, k % 2 ? concrete : '#8a8078', mat(q[0], q[1], q[2], k, k * 0.7, k * 0.3), { sy: 0.5, jit: 0.4 });
      }
      // rebar
      for (let k = 0; k < 5; k++) {
        const p0 = pointAt(P, GAP0, -4 + k * 2, -0.6);
        const p1 = pointAt(P, GAP0 + 1.8 + (k % 2), -4 + k * 2 + 0.5, -1.4 + (k % 3) * 0.6);
        U.quad(p0, p1, add(p1, [0, 0.16, 0]), add(p0, [0, 0.16, 0]), '#3a2a2a', F_TWO);
      }
    }
    if (c0 <= GAP1 && c0 + CH > GAP1) {
      for (let k = 0; k < 6; k++) {
        const d0 = -ROAD_W + (k / 6) * ROAD_W * 2;
        const d1 = -ROAD_W + ((k + 1) / 6) * ROAD_W * 2;
        const lip = GAP1 - 0.6 - ((k * 23) % 5) * 0.5;
        G.poly([pointAt(P, GAP1, d1), pointAt(P, GAP1, d0), pointAt(P, lip, (d0 + d1) / 2)], '#5a5560');
        U.quad(pointAt(P, GAP1, d0), pointAt(P, GAP1, d1), pointAt(P, GAP1, d1, -1.6), pointAt(P, GAP1, d0, -1.6), '#9a8e84');
      }
    }
    // checkpoint arch
    if (c0 <= 520 && c0 + CH > 520) {
      const a = at(P, 520).a;
      for (const side of [-1, 1]) {
        const q = pointAt(P, 520, side * (ROAD_W + 1.5));
        O.box(0.9, 7, 0.9, ['#f2ede2', '#f2ede2', '#2a64d8'], mat(q[0], q[1] + 3.5, q[2], a));
      }
      const q = pointAt(P, 520, 0, 6.6);
      const M = mat(q[0], q[1], q[2], a);
      const W2 = ROAD_W + 2;
      for (let k = 0; k < 10; k++) {
        const x0 = -W2 + (k / 10) * W2 * 2;
        const x1 = -W2 + ((k + 1) / 10) * W2 * 2;
        for (let j = 0; j < 2; j++) {
          const col = (k + j) % 2 ? '#f6f2ea' : '#1a1622';
          const y0 = -0.8 + j * 0.8;
          O.quad([x1, y0, 0], [x0, y0, 0], [x0, y0 + 0.8, 0], [x1, y0 + 0.8, 0], col, F_TWO | F_UNLIT, M);
        }
      }
    }
    const mid = pointAt(P, Math.min(TRACK, c0 + CH / 2), 0);
    chunks.push({ ground: G.build(), objs: O.build(), marks: K.build(), under: U.build(), c: mid });
  }
  return chunks;
};

const SEA_N = 28;
const SEA_CELL = 24;
const buildSea = () => {
  const b = new MeshB();
  for (let j = 0; j <= SEA_N; j++) for (let i = 0; i <= SEA_N; i++) b.vert([i * SEA_CELL, 0, j * SEA_CELL]);
  const W1 = SEA_N + 1;
  for (let j = 0; j < SEA_N; j++)
    for (let i = 0; i < SEA_N; i++) {
      const a = j * W1 + i;
      const c1 = (i + j) % 2 ? rgb('#2e74a8') : rgb('#2a6aa0');
      b.tri(a, a + W1, a + W1 + 1, c1);
      b.tri(a, a + W1 + 1, a + 1, mixRGB(c1, [20, 50, 90], 0.25));
    }
  return b.build({ spec: 0.55, shin: 8 });
};

const updateSea = (m: Mesh, cx: number, cz: number, t: number) => {
  const ox = Math.floor(cx / SEA_CELL) * SEA_CELL - (SEA_N / 2) * SEA_CELL;
  const oz = Math.floor(cz / SEA_CELL) * SEA_CELL - (SEA_N / 2) * SEA_CELL;
  const v = m.v;
  const W1 = SEA_N + 1;
  for (let j = 0; j <= SEA_N; j++)
    for (let i = 0; i <= SEA_N; i++) {
      const x = ox + i * SEA_CELL;
      const z = oz + j * SEA_CELL;
      const k = (j * W1 + i) * 3;
      v[k] = x;
      v[k + 1] = 0.9 * Math.sin(x * 0.07 + t * 1.5) + 0.7 * Math.sin(z * 0.09 - t * 1.2 + x * 0.03) - 0.2;
      v[k + 2] = z;
    }
  bounds(m);
};

/* ---------- timing ---------- */

const T_LOGO_OUT = 2.4;
const T_CUT_SIDE = 8.62;
const T_CUT_BACK = 9.9;
const T_WIPE1 = 11.7;
const T_TABLE = 12.15;
const T_WIPE2 = 15.75;
const T_BACK = 16.2;
const T_SWING = 17.5;
const T_FINAL = 18.55;
const FINAL_PHI = 0.45;
const FINAL_OFF = 0.25;

const wipeK = (t: number) => {
  // 0 open, 1 closed
  if (t < T_WIPE1 || t > T_BACK + 0.4) return 0;
  if (t < T_TABLE) return tween(t, T_WIPE1, T_TABLE - 0.05, ease.inOutCubic);
  if (t < T_TABLE + 0.45) return 1 - tween(t, T_TABLE, T_TABLE + 0.45, ease.outCubic);
  if (t < T_WIPE2) return 0;
  if (t < T_BACK) return tween(t, T_WIPE2, T_BACK - 0.05, ease.inOutCubic);
  return 1 - tween(t, T_BACK, T_BACK + 0.4, ease.outCubic);
};
const inTable = (t: number) => t >= T_TABLE && t < T_BACK;

/* ---------- car state ---------- */

interface CarState {
  p: V3;
  yaw: number;
  pitch: number;
  roll: number;
  head: number;
  s: number;
}

const carAt = (P: Path, t: number): CarState => {
  const s = raceS(t);
  const q = at(P, s);
  const d = heroD(t);
  const r = rightOf(q.a);
  let y = elev(s);
  let pitch = Math.atan2(elev(s + 1.5) - elev(s - 1.5), 3);
  if (s > GAP0 - 0.2 && s < GAP1 + 6) {
    // the ballistic arc off the tilted slab
    const u = clamp((s - GAP0) / (GAP1 + 5 - GAP0));
    const lip = elev(GAP0);
    const land = elev(GAP1 + 5);
    y = lerp(lip, land, u) + 7.5 * u * (1 - u) * 1.6;
    const dy = (land - lip) + 7.5 * 1.6 * (1 - 2 * u);
    pitch = Math.atan2(dy, GAP1 + 5 - GAP0) * 0.9;
  }
  const slip = slipAt(t);
  const roll = -slip * 0.18 + (s > GAP0 && s < GAP1 + 5 ? Math.sin(seg(s, GAP0, GAP1 + 5) * Math.PI) * 0.12 : 0);
  return { p: [q.x + r[0] * d, y, q.z + r[2] * d], yaw: q.a - slip, pitch, roll, head: q.a, s };
};

const carM = (c: CarState, bump = 0) => mat(c.p[0], c.p[1] + bump, c.p[2], c.yaw, c.pitch, c.roll);

/* ---------- film ---------- */

const ENV_RACE = (): Env => ({
  fog: HAZE,
  fogNear: 70,
  fogFar: 330,
  sun: [0, 0, 0],
  sunCol: rgb('#ffd2a0'),
  amb: rgb('#6a4a7a'),
  hemi: 0.35,
  snap: 1,
});

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${m}'${String(s).padStart(2, '0')}"${String(cs).padStart(2, '0')}`;
};

const ord = (n: number) => (n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`);

const SCORES: [string, string, string][] = [
  ['SHU', "1'58\"20", '#ffd23a'],
  ['LNA', "2'01\"07", '#ffffff'],
  ['BKU', "2'03\"55", '#ffffff'],
  ['DET', "2'04\"18", '#ffffff'],
  ['ACE', "2'06\"92", '#ffffff'],
  ['RIO', "2'09\"40", '#ffffff'],
  ['AAA', "2'11\"03", '#ffffff'],
];

const drawLogo = (c: Ctx, x: number, y: number, s: number, a: number) => {
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a;
  c.translate(x, y);
  c.scale(s, s);
  // sunset disc behind the word
  const g = c.createLinearGradient(0, -150, 0, 30);
  g.addColorStop(0, '#ffe680');
  g.addColorStop(1, '#ff4a6a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, -40, 120, Math.PI, 0);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(40,16,70,1)';
  for (let k = 0; k < 5; k++) c.fillRect(-130, -40 - 18 - k * 20 + 18, 260, 3 + k * 1.2);
  hud(c, 'SUNSET', 0, -10, 112, { align: 'center', fill: ['#fffbe8', '#ffb0c8'], stroke: '#2a0e44', sw: 16 });
  hud(c, 'RUSH', 0, 90, 132, { align: 'center', fill: ['#ffe066', '#ff6a3a'], stroke: '#2a0e44', sw: 18 });
  c.restore();
};

const blink = (t: number, rate = 1.6) => Math.floor(t * rate * 2) % 2 === 0;

export const lowpolyAttractFilm: RisoFilm<State> = {
  id: 'lowpoly-attract',
  title: 'Attract Mode',
  caption: 'An arcade racer plays itself at sunset: chase cam, a drift, a jump over a broken bridge, the high-score table, and INSERT COIN forever.',
  theme: 'Video game',
  category: 'Video game',
  motif: 'the low sun the car keeps racing toward',
  series: 'Low poly',
  mode: 'direct',
  duration: 20,
  paper: '#1a1030',
  grain: 0,
  inks: [{ color: '#f0482c' }, { color: '#ffb27a' }, { color: '#2e74a8' }, { color: '#4a2e7a' }, { color: '#ffd23a' }],
  scenes: [
    { at: 0, label: 'Attract' },
    { at: T_LOGO_OUT, label: 'Chase cam' },
    { at: 4.6, label: 'Drift' },
    { at: 7.6, label: 'Broken bridge' },
    { at: T_TABLE, label: 'High scores' },
    { at: T_BACK, label: 'Insert coin' },
  ],
  posterTime: 9.1,

  setup() {
    const path = buildPath();
    const chunks = buildWorld(path);
    const ha = at(path, 420).a;
    const sunAz = ha + Math.PI / 2;
    const sun: V3 = norm([Math.sin(sunAz), 0.15, Math.cos(sunAz)]);
    // islands far out to sea, pre-hazed silhouettes
    const islands: { m: Mesh; p: V3 }[] = [];
    const rng = mulberry(5);
    for (let k = 0; k < 7; k++) {
      const az = sunAz + (rng() - 0.5) * 2.2;
      const dist = 520 + rng() * 260;
      const ib = new MeshB();
      const col = mixRGB(rgb('#6a3a7a'), HAZE, 0.25 + (dist - 520) / 600);
      ib.rock(1, 300 + k, col, undefined, { jit: 0.5, sy: 0.45, vary: 0.18, flags: F_NOFOG | F_UNLIT });
      const m = ib.build();
      islands.push({ m, p: [Math.sin(az) * dist + path.x[400], 0, Math.cos(az) * dist + path.z[400]] });
    }
    const clouds: State['clouds'] = [];
    for (let k = 0; k < 14; k++) {
      const az = sunAz + (rng() - 0.5) * 3.4;
      const dist = 900;
      const el = 0.05 + rng() * 0.25;
      clouds.push({
        p: [Math.sin(az) * dist + path.x[400], Math.sin(el) * dist, Math.cos(az) * dist + path.z[400]],
        r: 40 + rng() * 70,
        sy: 0.16 + rng() * 0.1,
        c: mixRGB(rgb('#ffb48a'), rgb('#c66a8e'), clamp(el * 3)),
      });
    }
    const tt = new MeshB();
    tt.frustum(16, 4.2, 4.0, 0.4, '#3a2a6a', mat(0, -0.4, 0), { capCol: '#4a3a86' });
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU;
      const a1 = ((k + 0.5) / 16) * TAU;
      tt.quad([Math.cos(a0) * 4.21, -0.3, Math.sin(a0) * 4.21], [Math.cos(a0) * 4.21, -0.1, Math.sin(a0) * 4.21], [Math.cos(a1) * 4.21, -0.1, Math.sin(a1) * 4.21], [Math.cos(a1) * 4.21, -0.3, Math.sin(a1) * 4.21], '#ff5aa0', F_UNLIT | F_TWO);
    }
    const gr = new MeshB();
    for (let i = -8; i <= 8; i++) {
      gr.quad([i * 4 - 0.07, -0.45, -32], [i * 4 - 0.07, -0.45, 32], [i * 4 + 0.07, -0.45, 32], [i * 4 + 0.07, -0.45, -32], '#ff5aa0', F_UNLIT);
      gr.quad([-32, -0.45, i * 4 + 0.07], [32, -0.45, i * 4 + 0.07], [32, -0.45, i * 4 - 0.07], [-32, -0.45, i * 4 - 0.07], '#ff5aa0', F_UNLIT);
    }
    // minimap
    const mini: [number, number][] = [];
    for (let s = 0; s <= TRACK; s += 10) mini.push([path.x[s], path.z[s]]);
    return {
      lp: new LowPoly(),
      path,
      chunks,
      hero: carMesh('#f0482c', '#2a1830'),
      rival: carMesh('#2f6fe0', '#141a30'),
      sea: buildSea(),
      seaN: SEA_N,
      islands,
      clouds,
      turntable: tt.build(),
      grid: gr.build(),
      mini,
      sun,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    r.camera(800, 450, 1);
    if (inTable(t)) drawTable(c, t, s);
    else drawRace(c, t, s);
    crt(c, 0.9);
    // blinds wipe
    const k = wipeK(t);
    if (k > 0) {
      const n = 10;
      const bh = 900 / n;
      for (let i = 0; i < n; i++) {
        const kk = clamp(k * 1.5 - (i / n) * 0.5);
        if (kk <= 0) continue;
        const w = 1600 * ease.inOutCubic(kk);
        c.fillStyle = i % 2 ? '#1a1030' : '#2a1850';
        if (i % 2) c.fillRect(1600 - w, i * bh, w + 1, bh + 1);
        else c.fillRect(0, i * bh, w, bh + 1);
        c.fillStyle = '#ff5aa0';
        c.fillRect(i % 2 ? 1600 - w : w - 6, i * bh, 6, bh + 1);
      }
    }
    // the attract-mode constant
    if (blink(t, 1.1) || t > T_FINAL + 0.2) {
      const fin = t > T_FINAL;
      hud(c, 'INSERT COIN', 800, fin ? 842 : 850, fin ? 50 : 42, { align: 'center', fill: ['#ffffff', '#ffd23a'], stroke: '#2a0e44', spacing: 4, alpha: fin && !blink(t, 1.1) ? 0.0 : 1 });
    }
    hud(c, 'CREDIT 0', 1560, 884, 20, { align: 'right', fill: '#ffffff', italic: false, font: MONO, sw: 5 });
  },
};

/* ---------- race ---------- */

function raceCam(t: number, s: State, car: CarState): Cam {
  const P = s.path;
  const shake = (amp: number, f = 23) => [noise1(t * f, 1) * amp, noise1(t * f, 2) * amp, noise1(t * f, 3) * amp] as V3;
  // chase rig: lagging heading so the camera swings out on bends
  const lagA = at(P, Math.max(0, car.s - 10)).a;
  const hA = lerp(car.head, lagA, 0.55) - slipAt(t) * 0.35;
  const f = fwdOf(hA);
  const rv = rightOf(hA);
  const base = add(car.p, [0, 0, 0]);
  const v = speedAt(t);
  const pull = 8.5 + (v - 40) * 0.05;
  let eye = add(add(base, mul(f, -pull)), [0, 3.0, 0]);
  let tgt = add(add(base, mul(f, 7)), [0, 1.1, 0]);
  let fov = 58 + (v - 40) * 0.35;
  let roll = slipAt(t) * 0.05;

  // opening crane: high over the coast, falling into the chase position
  if (t < T_LOGO_OUT + 0.4) {
    const k = tween(t, 0, T_LOGO_OUT + 0.4, ease.inOutCubic);
    const hiEye = add(add(base, mul(f, -36)), add(mul(rv, -26), [0, 38, 0]));
    const hiTgt = add(base, add(mul(f, 70), [0, 2, 0]));
    eye = lerp3(hiEye, eye, k);
    tgt = lerp3(hiTgt, tgt, k);
    fov = lerp(50, fov, k);
  }
  // drift: swing out to the outside of the bend, looking back across the car's nose
  const sw = tween(t, 4.5, 5.4) * (1 - tween(t, 6.7, 7.5));
  if (sw > 0) {
    const ca = car.yaw;
    const cf = fwdOf(ca);
    const cr = rightOf(ca);
    const sEye = add(car.p, add(add(mul(cf, 6.0), mul(cr, 7.0)), [0, 2.3, 0]));
    const sTgt = add(car.p, add(mul(cf, -1), [0, 0.8, 0]));
    eye = lerp3(eye, sEye, sw);
    tgt = lerp3(tgt, sTgt, sw);
    fov = lerp(fov, 54, sw);
    roll = lerp(roll, 0.05, sw);
  }
  // side camera for the jump: on the land side at deck level, looking into the sun past the car
  if (t >= T_CUT_SIDE && t < T_CUT_BACK) {
    const mid = at(P, (GAP0 + GAP1) / 2);
    const mf = fwdOf(mid.a);
    const sh: V3 = norm([s.sun[0], 0, s.sun[2]]);
    const k = seg(t, T_CUT_SIDE, T_CUT_BACK);
    const gp = pointAt(P, (GAP0 + GAP1) / 2 + 1, 0);
    eye = add(gp, add(add(mul(sh, -21), mul(mf, lerp(-5, 5, k))), [0, 3.4, 0]));
    tgt = lerp3(add(car.p, [0, 0.4, 0]), add(gp, [0, 2.0, 0]), lerp(0.5, 0.2, k));
    fov = lerp(56, 40, ease.inOutSine(k));
    roll = 0.05;
  }
  // landing: bump the camera
  const land = Math.exp(-Math.max(0, t - 10.02) * 6) * (t > 10.02 ? 1 : 0);
  if (land > 0.01) {
    eye = add(eye, add(shake(0.5 * land), [0, -0.8 * land, 0]));
    tgt = add(tgt, mul(shake(0.3 * land, 31), 1));
  }
  // final: from chase, an orbit round to the front three-quarter, low, the car against the sun
  if (t > T_SWING) {
    const k = tween(t, T_SWING, T_FINAL + 0.3, ease.inOutCubic);
    const sh: V3 = norm([s.sun[0], 0, s.sun[2]]);
    const away = Math.atan2(-sh[0], -sh[2]) + FINAL_PHI;
    const dir: V3 = [Math.sin(away), 0, Math.cos(away)];
    const oEye = add(car.p, add(mul(dir, 8.2), [0, 0.95, 0]));
    const toCar = norm(sub(car.p, oEye));
    const oTgt = add(oEye, add(mul(norm(add(mul(toCar, 1 + FINAL_OFF), sh)), 10), [0, 1.4, 0]));
    eye = lerp3(eye, oEye, k);
    tgt = lerp3(tgt, oTgt, k);
    fov = lerp(fov, 52, k);
    roll = lerp(roll, 0.07, k);
    eye = add(eye, mul(shake(0.04, 7), 1));
  }
  return { eye, at: tgt, fov, roll };
}

function drawRace(c: Ctx, t: number, s: State) {
  const lp = s.lp;
  const P = s.path;
  const car = carAt(P, t);
  const cam = raceCam(t, s, car);
  const env = ENV_RACE();
  env.sun = s.sun;
  lp.far = 950;
  lp.begin(cam, env);
  lp.sky(SKY, { dir: s.sun, col: SUN_COL, size: 0.075, glow: SUN_GLOW, glowPow: 14, glowAmt: 0.62 });
  // clouds and islands (layer 0, far)
  for (const cl of s.clouds) lp.sprite(cl.p, cl.r, cl.c, { flags: F_UNLIT | F_NOFOG, layer: 0, sides: 7, sy: cl.sy, bias: -2000 });
  for (const is of s.islands) {
    const d = Math.hypot(is.p[0] - cam.eye[0], is.p[2] - cam.eye[2]);
    void d;
    lp.mesh(is.m, mat(is.p[0], -6, is.p[2], 0, 0, 0, 70, 70, 70), { layer: 0, bias: -1500 });
  }
  updateSea(s.sea, cam.eye[0], cam.eye[2], t);
  lp.mesh(s.sea, mat(0, 0, 0), { layer: 0 });
  // world chunks near the camera
  for (const ch of s.chunks) {
    const dx = ch.c[0] - cam.eye[0];
    const dz = ch.c[2] - cam.eye[2];
    if (dx * dx + dz * dz > 460 * 460) continue;
    if (ch.under.f.length) lp.mesh(ch.under, mat(0, 0, 0), { layer: 1, clipY: -0.2 });
    lp.mesh(ch.ground, mat(0, 0, 0), { layer: 2, clipY: -0.1 });
    lp.mesh(ch.marks, mat(0, 0, 0), { layer: 2, bias: 1.5 });
    lp.mesh(ch.objs, mat(0, 0, 0), { layer: 3, clipY: -0.2 });
  }
  // rival
  const rs = rivalS(t);
  if (rs < raceS(t) + 400 && t < 12) {
    const q = at(P, rs);
    const rr = rightOf(q.a);
    const rd = -2.5 + Math.sin(t * 0.7) * 0.4;
    lp.mesh(s.rival, mat(q.x + rr[0] * rd, elev(rs), q.z + rr[2] * rd, q.a, Math.atan2(elev(rs + 1.5) - elev(rs - 1.5), 3), 0), { layer: 3 });
  }
  // hero car: a little engine shimmy
  const bump = t > 10.02 ? Math.exp(-(t - 10.02) * 9) * -0.25 : 0;
  lp.mesh(s.hero, carM(car, bump + Math.sin(t * 31) * 0.015), { layer: 3 });
  // shadow blob
  const shY = car.s > GAP0 && car.s < GAP1 ? -100 : elev(car.s) + 0.06;
  if (shY > -50) {
    const sh = new MeshB();
    const M = mat(car.p[0], shY, car.p[2], car.yaw);
    sh.poly([[-1.1, 0, -2.4], [1.1, 0, -2.4], [1.2, 0, 2.3], [-1.2, 0, 2.3]].map((p) => p as V3).reverse(), '#2a1e3a', F_UNLIT | F_ALPHA, M);
    lp.mesh(sh.build(), mat(0, 0, 0), { layer: 2, bias: 3, alpha: 0.55 });
  }
  // tyre smoke: puffs emitted on a fixed clock along the car's own past, pure function of t
  {
    const DT = 0.03;
    const k0 = Math.floor(t / DT);
    for (let i = 0; i < 40; i++) {
      const id = k0 - i;
      const te = id * DT;
      if (!drifting(te)) continue;
      const pc = carAt(P, te);
      const age = t - te;
      const fwd = fwdOf(pc.yaw);
      const rt = rightOf(pc.yaw);
      for (const side of [-1, 1]) {
        const hsh = Math.sin(id * 12.9898 + side * 78.233) * 43758.5453;
        const rn = hsh - Math.floor(hsh);
        const w = add(pc.p, add(add(mul(fwd, -1.5 - age * 2), mul(rt, side * (0.9 + age * (rn - 0.3) * 2))), [0, 0.3 + age * 1.6, 0]));
        const g = (0.35 + age * 1.5) * (0.75 + rn * 0.5);
        const k = 1 - age / 1.2;
        if (k <= 0) continue;
        const dc = Math.hypot(w[0] - cam.eye[0], w[1] - cam.eye[1], w[2] - cam.eye[2]);
        const near = clamp((dc - 2.5) / 4);
        if (near <= 0) continue;
        lp.sprite(w, g, mixRGB(rgb('#ffe8e0'), rgb('#f0a0b8'), clamp(age * 1.2)), { flags: F_ALPHA | F_UNLIT, alpha: 0.6 * k * k * near, sides: 7, rot: rn * 6, layer: 3, bias: -0.5 });
      }
    }
  }
  // sparks on landing
  if (t > 10.0 && t < 10.7) {
    const age = t - 10.0;
    for (let i = 0; i < 24; i++) {
      const a = i * 2.39;
      const sp = 5 + (i % 5) * 2;
      const fwd = fwdOf(car.yaw);
      const p0 = add(carAt(P, 10.02).p, [0, 0.2, 0]);
      const w = add(p0, [Math.cos(a) * sp * age - fwd[0] * age * 10, 3 * age - 9 * age * age + 0.3, Math.sin(a) * sp * age - fwd[2] * age * 10]);
      lp.sprite(w, 0.18, rgb('#ffe070'), { flags: F_ADD | F_UNLIT | F_NOFOG, alpha: 1 - age / 0.7, sides: 4, layer: 3, bias: 2 });
    }
  }
  // tail-light streaks while drifting
  lp.flush();
  // impact frame when the car leaves the lip
  const air = t > 8.85 && t < 8.97;
  if (air) lp.impact(rgb('#fff4d0'), rgb('#2a0e44'), 150);
  lp.blit(c);
  drawRaceHud(c, t, s, car, cam);
}

function drawRaceHud(c: Ctx, t: number, s: State, car: CarState, cam: Cam) {
  void cam;
  const P = s.path;
  const logoK = 1 - tween(t, T_LOGO_OUT - 0.4, T_LOGO_OUT + 0.2, ease.inCubic);
  const final = t > T_FINAL;
  const hudIn = final ? 1 - tween(t, T_FINAL - 0.3, T_FINAL + 0.2) : tween(t, T_LOGO_OUT - 0.2, T_LOGO_OUT + 0.5, ease.outBack);
  const jumpCam = t >= T_CUT_SIDE && t < T_CUT_BACK;
  // letterbox on the replay angle
  if (jumpCam) {
    const k = tween(t, T_CUT_SIDE, T_CUT_SIDE + 0.2) * (1 - tween(t, T_CUT_BACK - 0.15, T_CUT_BACK));
    c.fillStyle = '#120a20';
    c.fillRect(0, 0, 1600, 90 * k);
    c.fillRect(0, 900 - 90 * k, 1600, 90 * k);
    if (blink(t, 2)) hud(c, '● REPLAY', 60, 64, 30, { fill: '#ff4a4a', italic: false, sw: 6 });
  }
  if (hudIn > 0.01 && !jumpCam) {
    c.save();
    const sl = (1 - hudIn) * 300;
    // top left: lap + time
    const lap = t > 11.25 ? 3 : 2;
    const raceT = 72.4 + t;
    c.translate(-sl, 0);
    hudPanel(c, 28, 26, 340, 118);
    hud(c, 'LAP', 52, 70, 30, { fill: ['#ffffff', '#c8d8ff'] });
    hud(c, `${lap}/3`, 128, 74, 44, { fill: ['#ffffff', '#ffd23a'] });
    hud(c, 'TIME', 52, 124, 26, { fill: ['#ffffff', '#c8d8ff'] });
    hud(c, fmtTime(raceT), 140, 128, 40, { fill: ['#ffffff', '#7af0ff'] });
    c.restore();
    // top right: position
    c.save();
    c.translate(sl, 0);
    const pos = t < 3.95 ? 2 : 1;
    const pop = t > 3.95 && t < 4.6 ? ease.outElastic(seg(t, 3.95, 4.6)) : 1;
    const ps = 1 + (1 - pop) * 0.6;
    c.translate(1450, 120);
    c.scale(ps, ps);
    hud(c, ord(pos).replace(/[A-Z]+$/, ''), 0, 0, 120, { align: 'right', fill: pos === 1 ? ['#fff6b0', '#ffb020'] : ['#ffffff', '#b0b8d0'], stroke: '#2a0e44', sw: 16 });
    hud(c, ord(pos).replace(/^\d+/, ''), 6, -44, 46, { fill: pos === 1 ? ['#fff6b0', '#ffb020'] : ['#ffffff', '#b0b8d0'], sw: 9 });
    hud(c, '/8', 6, 0, 36, { fill: '#ffffff', sw: 8 });
    c.restore();
    // bottom right: speedo
    c.save();
    c.translate(sl, 0);
    const v = speedAt(t);
    const kmh = Math.round(v * 5.1);
    const cx = 1430;
    const cy = 790;
    c.lineCap = 'butt';
    c.lineWidth = 18;
    c.strokeStyle = 'rgba(12,8,40,0.6)';
    c.beginPath();
    c.arc(cx, cy, 104, Math.PI * 0.8, Math.PI * 2.2);
    c.stroke();
    const n = 20;
    const lit = clamp(kmh / 320) * n;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * 0.8 + (i / n) * Math.PI * 1.4;
      c.strokeStyle = i < lit ? (i > 15 ? '#ff4a4a' : i > 11 ? '#ffd23a' : '#7af0ff') : 'rgba(255,255,255,0.15)';
      c.beginPath();
      c.arc(cx, cy, 104, a0 + 0.01, a0 + (Math.PI * 1.4) / n - 0.02);
      c.stroke();
    }
    hud(c, String(kmh), cx + 10, cy + 22, 64, { align: 'center', fill: ['#ffffff', '#ffd23a'] });
    hud(c, 'km/h', cx + 10, cy + 56, 22, { align: 'center', fill: '#ffffff', sw: 5 });
    c.restore();
    // bottom left: minimap
    c.save();
    c.translate(-sl, 0);
    const mx = 150;
    const my = 760;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of s.mini) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const sc = 200 / Math.max(x1 - x0, z1 - z0);
    const mp = (x: number, z: number): [number, number] => [mx + (x - (x0 + x1) / 2) * -sc, my - (z - (z0 + z1) / 2) * sc];
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,8,40,0.65)';
    c.lineWidth = 14;
    c.beginPath();
    s.mini.forEach(([x, z], i) => (i ? c.lineTo(...mp(x, z)) : c.moveTo(...mp(x, z))));
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 5;
    c.stroke();
    const cp = mp(car.p[0], car.p[2]);
    const rp = at(P, rivalS(t));
    const rpp = mp(rp.x, rp.z);
    c.fillStyle = '#2f6fe0';
    c.beginPath();
    c.arc(rpp[0], rpp[1], 8, 0, TAU);
    c.fill();
    c.fillStyle = '#ff4a2a';
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cp[0], cp[1], 11, 0, TAU);
    c.fill();
    c.stroke();
    c.restore();
    // DEMO tag
    if (blink(t, 0.8)) hud(c, 'DEMO PLAY', 800, 60, 30, { align: 'center', fill: '#ffffff', italic: false, spacing: 6, sw: 7, alpha: hudIn });
  }
  // event callouts
  const pop = (t0: number, t1: number, text: string, sub: string, y: number, size: number, fill: [string, string]) => {
    if (t < t0 || t > t1) return;
    const k = seg(t, t0, t0 + 0.35);
    const out = tween(t, t1 - 0.25, t1);
    const sc = (1 + (1 - ease.outBack(k)) * 1.4) * (1 + out * 0.4);
    c.save();
    c.globalAlpha = 1 - out;
    c.translate(800, y);
    c.scale(sc, sc);
    c.rotate(-0.06);
    hud(c, text, 0, 0, size, { align: 'center', fill, stroke: '#2a0e44', sw: size * 0.16 });
    if (sub) hud(c, sub, 0, size * 0.62, size * 0.36, { align: 'center', fill: ['#ffffff', '#7af0ff'] });
    c.restore();
  };
  pop(3.95, 4.9, 'OVERTAKE!', '', 300, 76, ['#ffffff', '#7af0ff']);
  if (t > 5.1 && t < 7.2) {
    const mult = 1 + Math.floor(seg(t, 5.1, 7.0) * 3);
    const pts = Math.round(seg(t, 5.1, 7.0) * 3800);
    pop(5.1, 7.2, `DRIFT x${mult}`, `+${pts}`, 250, 70, ['#ffe680', '#ff6a3a']);
  }
  pop(8.95, T_CUT_BACK - 0.05, 'BIG AIR!', '+5000', 215, 104, ['#fff6b0', '#ff3a6a']);
  pop(11.1, 11.8, 'FINAL LAP', 'CHECKPOINT  +10 SEC', 300, 90, ['#ffffff', '#ffd23a']);
  // opening logo
  if (logoK > 0) {
    const k = tween(t, 0, 0.6, ease.outBack);
    drawLogo(c, 800, 380 - (1 - logoK) * 120, 0.6 + k * 0.4 + (1 - logoK) * 0.2, logoK);
    if (t > 0.6) hud(c, 'PRESS START', 800, 600, 34, { align: 'center', fill: '#ffffff', italic: false, spacing: 6, alpha: blink(t, 1.6) ? logoK : 0 });
  }
  // final poster: the logo settles in the sky over the car
  if (t > T_FINAL - 0.1) {
    const k = tween(t, T_FINAL - 0.1, T_FINAL + 0.5, ease.outBack);
    drawLogo(c, 470, 215, 0.55 * k + 0.001, clamp(k * 2));
    if (t > T_FINAL + 0.6) hud(c, 'HI-SCORE  SHU  1\'58"20', 470, 315, 28, { align: 'center', fill: ['#ffffff', '#ffd23a'], sw: 6, alpha: tween(t, T_FINAL + 0.6, T_FINAL + 1) });
  }
}

/* ---------- high-score interstitial ---------- */

function drawTable(c: Ctx, t: number, s: State) {
  const lp = s.lp;
  const lt = t - T_TABLE;
  const orbit = 0.9 + lt * 0.35;
  const eye: V3 = [Math.sin(orbit) * 11.5, 3.2 + Math.sin(lt * 0.6) * 0.4, Math.cos(orbit) * 11.5];
  // aim right of the car so it sits on the left third
  const rv = norm([Math.cos(orbit), 0, -Math.sin(orbit)]);
  const tgt: V3 = add([0, 1.0, 0], mul(rv, 4.4));
  const env: Env = { fog: rgb('#2a1850'), fogNear: 18, fogFar: 40, sun: norm([0.4, 0.8, 0.5]), sunCol: rgb('#ffd8b0'), amb: rgb('#5a3a8a'), hemi: 0.5, snap: 1 };
  lp.far = 200;
  lp.begin({ eye, at: tgt, fov: 50, roll: 0.03 }, env);
  lp.sky(
    [
      [-1, rgb('#1a1030')],
      [-0.05, rgb('#2a1850')],
      [0.05, rgb('#ff7a6a')],
      [0.25, rgb('#a4528c')],
      [1, rgb('#22184c')],
    ],
    { dir: norm([Math.sin(orbit + Math.PI) * 1, 0.12, Math.cos(orbit + Math.PI)]), col: SUN_COL, size: 0.1, glow: SUN_GLOW, glowPow: 6, glowAmt: 0.5 },
  );
  lp.mesh(s.grid, mat(0, 0, 0), { layer: 0 });
  const spin = lt * 0.9;
  lp.mesh(s.turntable, mat(0, 0, 0, spin), { layer: 1 });
  lp.mesh(s.hero, mat(0, 0, 0, spin + 0.6, 0, 0, 1.25), { layer: 3 });
  lp.flush();
  lp.blit(c);
  // table
  const tx = 1110;
  const inK = tween(lt, 0.1, 0.6, ease.outBack);
  hud(c, 'HIGH SCORES', tx, 150, 74 * inK + 0.01, { align: 'center', fill: ['#fff6b0', '#ff6a3a'], stroke: '#2a0e44', sw: 12 });
  hud(c, 'COAST CIRCUIT  •  3 LAPS', tx, 196, 22, { align: 'center', fill: '#ffffff', italic: false, spacing: 3, sw: 5, alpha: inK > 0.5 ? 1 : 0 });
  SCORES.forEach(([name, time, col], i) => {
    const k = tween(lt, 0.45 + i * 0.16, 0.85 + i * 0.16, ease.outCubic);
    if (k <= 0) return;
    const y = 280 + i * 76;
    const x = tx + (1 - k) * 700;
    const top = i === 0;
    const cy = top ? ['#ffffff', '#ffd23a', '#ff6a3a', '#7af0ff'][Math.floor(lt * 8) % 4] : col;
    c.save();
    c.globalAlpha = k;
    hudPanel(c, x - 330, y - 50, 660, 64, top ? 'rgba(255,90,160,0.35)' : 'rgba(12,8,40,0.55)', 'rgba(255,255,255,0.35)', 16);
    c.restore();
    hud(c, ord(i + 1), x - 300, y, 40, { fill: top ? ['#fff6b0', '#ffb020'] : ['#ffffff', '#b8c0e0'], alpha: k });
    hud(c, name, x - 110, y, 44, { fill: cy, alpha: k, spacing: 8 });
    hud(c, time, x + 300, y, 42, { align: 'right', fill: top ? ['#ffffff', '#ffd23a'] : ['#ffffff', '#c8d8ff'], alpha: k, font: DISPLAY });
  });
  // car stats tag
  const tg = tween(lt, 1.2, 1.6, ease.outBack);
  if (tg > 0) {
    c.save();
    c.translate(360, 760);
    c.scale(tg, tg);
    hudPanel(c, -230, -50, 460, 92);
    hud(c, 'TYPE-R  CORAL', 0, -6, 38, { align: 'center', fill: ['#ffffff', '#ff8a5a'] });
    hud(c, 'MAX 312 km/h  •  6 SPD', 0, 30, 22, { align: 'center', fill: '#ffffff', italic: false, sw: 5 });
    c.restore();
  }
}
