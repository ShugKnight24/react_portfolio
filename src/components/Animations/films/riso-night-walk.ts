import type { Riso, RisoFilm } from '../riso/engine';
import { DISPLAY, TAU, clamp, ease, lerp, mulberry, polyPath, smooth, smoothPath, spacedText, type Pt } from '../riso/kit';

/**
 * Night Walk: a seamless loop of the evening walk around the block with Luna.
 * Format: the seamless loop. The world, the gait and the camera are all periodic in t, so the
 * last frame flows straight into the first at the corner lamp (the sign reads LUNA LN).
 * Beats along the block: the corner lamp, a push in past an oak to the cat on the fence (time
 * slows while Luna sails past, nose in the air), a wide crossing of the lamps, fireflies over
 * the park hedge (Luna watches one), porch lights, and back to the same corner.
 */

const T = 18;
const V = 250;
const L = V * T;
const STRIDES = 17;
const TROTS = 36;

const OWNER_GROUND = 772;
const DOG_GROUND = 794;
const OWNER_S = 2.0;
const DOG_S = 1.72;
const DOG_AHEAD = 196;
const CAT_S = 2.1;

const BACK_EDGE = 700;
const CURB_TOP = 806;
const ROAD_TOP = 822;
const GH = 662;

const P_FAR = 0.4;
const P_HOUSE = 0.78;
const P_FORE = 1.3;
const PER_FAR = P_FAR * L;
const PER_HOUSE = P_HOUSE * L;
const PER_FORE = P_FORE * L;

const LAMPS = [60, 1300, 2560, 3660];
const T_CAT = 6.85;

type Mix = [number, number, number];
interface Part {
  p: Path2D;
  m: Mix;
  /** Stroke width: drawn as a line over what is there, no knockout */
  w?: number;
}

/* ---------- periodic timing ---------- */

const om = (n: number) => (TAU * n) / T;
const per = (t: number, n: number, ph = 0) => Math.sin(om(n) * t + ph);
const frac = (x: number) => x - Math.floor(x);
const sstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a)));
/** Soft window: rises over [a, b], falls over [c, d] */
const win = (t: number, a: number, b: number, c: number, d: number) => sstep(a, b, t) * (1 - sstep(c, d, t));
/** The copy of a periodic x nearest to c */
const near = (x: number, P: number, c: number) => x + P * Math.round((c - x) / P);

/** Time warp: the walk slows while Luna passes the cat, a touch quicker elsewhere; warp(T) = T */
const WARP_N = 1800;
const WARP = (() => {
  const tab = new Float64Array(WARP_N + 1);
  let acc = 0;
  for (let i = 1; i <= WARP_N; i++) {
    const ta = ((i - 0.5) / WARP_N) * T;
    acc += (1 - 0.62 * Math.exp(22 * (Math.cos(om(1) * (ta - T_CAT)) - 1))) * (T / WARP_N);
    tab[i] = acc;
  }
  for (let i = 0; i <= WARP_N; i++) tab[i] = (tab[i] / acc) * T;
  tab[WARP_N] = T;
  return tab;
})();
const warp = (t: number) => {
  const f = (clamp(t, 0, T) / T) * WARP_N;
  const i = Math.floor(f);
  if (i >= WARP_N) return T;
  return lerp(WARP[i], WARP[i + 1], f - i);
};

const ownerX = (t: number) => V * warp(t);
const dogX = (t: number) => ownerX(t) + DOG_AHEAD + 14 * per(t, 2);
const CAT_X = dogX(T_CAT) + 20;

/* ---------- camera: cyclic Hermite through keys, so t = 0 and t = T meet exactly ---------- */

/** t, x offset from the owner, centre y, zoom, rotation */
type Key = [number, number, number, number, number];
const KEYS: Key[] = [
  [0.0, 120, 470, 1.0, 0],
  [2.5, -40, 410, 0.8, 0.0],
  [4.7, 230, 520, 1.12, 0.01],
  [6.85, 250, 575, 1.72, -0.028],
  [8.7, 170, 540, 1.32, 0.012],
  [10.4, 40, 440, 0.9, 0],
  [12.2, 150, 458, 1.24, -0.016],
  [14.2, 70, 470, 1.02, 0.01],
  [15.9, -110, 425, 0.8, 0],
];
const keyT = (j: number) => {
  const n = KEYS.length;
  return KEYS[((j % n) + n) % n][0] + T * Math.floor(j / n);
};
const keyV = (j: number, c: number) => {
  const n = KEYS.length;
  return KEYS[((j % n) + n) % n][c];
};
const camAt = (t: number) => {
  const n = KEYS.length;
  let i = n - 1;
  for (let j = 0; j < n; j++) if (KEYS[j][0] <= t) i = j;
  const t0 = keyT(i);
  const t1 = keyT(i + 1);
  const h = t1 - t0;
  const u = clamp((t - t0) / h);
  const h00 = 2 * u ** 3 - 3 * u * u + 1;
  const h10 = u ** 3 - 2 * u * u + u;
  const h01 = -2 * u ** 3 + 3 * u * u;
  const h11 = u ** 3 - u * u;
  const out: number[] = [];
  for (let c = 1; c <= 4; c++) {
    const m0 = ((keyV(i + 1, c) - keyV(i - 1, c)) / (keyT(i + 1) - keyT(i - 1))) * 0.85;
    const m1 = ((keyV(i + 2, c) - keyV(i, c)) / (keyT(i + 2) - keyT(i))) * 0.85;
    out.push(h00 * keyV(i, c) + h10 * h * m0 + h01 * keyV(i + 1, c) + h11 * h * m1);
  }
  return { ox: out[0], cy: out[1], z: out[2], rot: out[3] };
};

/* ---------- geometry helpers ---------- */

const add = (a: Pt, d: Pt, k = 1): Pt => [a[0] + d[0] * k, a[1] + d[1] * k];
const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const rotAbout = (p: Pt, a: number, o: Pt): Pt => add(o, rot([p[0] - o[0], p[1] - o[1]], a));
const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
};
const cw = (pts: Pt[]) => (area(pts) < 0 ? pts.slice().reverse() : pts);
const blob = (pts: Pt[], path = new Path2D(), tension = 0.5) => smoothPath(cw(pts), true, tension, path);
const ellPts = (c: Pt, rx: number, ry: number, a = 0, n = 18): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const q = (i / n) * TAU;
    return add(c, rot([Math.cos(q) * rx, Math.sin(q) * ry], a));
  });
const ell = (c: Pt, rx: number, ry: number, a = 0, path = new Path2D()) => polyPath(cw(ellPts(c, rx, ry, a, 24)), true, path);

/** Tapered limb a -> b. Side widths at s = 0, 0.5, 1 for the +normal and -normal sides, round caps */
const limb = (a: Pt, b: Pt, plus: [number, number, number], minus: [number, number, number], path = new Path2D()) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / len, dy / len];
  const n: Pt = [-u[1], u[0]];
  const w = (arr: [number, number, number], s: number) =>
    s < 0.5 ? lerp(arr[0], arr[1], smooth(s * 2)) : lerp(arr[1], arr[2], smooth((s - 0.5) * 2));
  const pts: Pt[] = [];
  const S = 6;
  for (let i = 0; i <= S; i++) pts.push(add(add(a, u, (len * i) / S), n, w(plus, i / S)));
  for (let k = 1; k < 4; k++) {
    const q = (k / 4) * Math.PI;
    const r = (plus[2] + minus[2]) / 2;
    const c = add(b, n, (plus[2] - minus[2]) / 2);
    pts.push(add(add(c, n, Math.cos(q) * r), u, Math.sin(q) * r));
  }
  for (let i = S; i >= 0; i--) pts.push(add(add(a, u, (len * i) / S), n, -w(minus, i / S)));
  for (let k = 1; k < 4; k++) {
    const q = (k / 4) * Math.PI;
    const r = (plus[0] + minus[0]) / 2;
    const c = add(a, n, (plus[0] - minus[0]) / 2);
    pts.push(add(add(c, n, -Math.cos(q) * r), u, -Math.sin(q) * r));
  }
  return blob(pts, path, 0.4);
};

/** Two-bone IK. bend -1 puts the middle joint forward (+x) for a limb hanging down */
const ik = (a: Pt, target: Pt, l1: number, l2: number, bend: number): [Pt, Pt] => {
  const dx = target[0] - a[0];
  const dy = target[1] - a[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = base + bend * A;
  const mid: Pt = [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
  const e = Math.atan2(target[1] - mid[1], target[0] - mid[0]);
  return [mid, [mid[0] + Math.cos(e) * l2, mid[1] + Math.sin(e) * l2]];
};

/** Tapered tail / strand along a quadratic curve */
const strand = (p0: Pt, p1: Pt, p2: Pt, w0: number, wMid: number, w1: number, path = new Path2D()) => {
  const N = 10;
  const c: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const u = 1 - k;
    c.push([u * u * p0[0] + 2 * u * k * p1[0] + k * k * p2[0], u * u * p0[1] + 2 * u * k * p1[1] + k * k * p2[1]]);
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(N, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const k = i / N;
    const w = k < 0.5 ? lerp(w0, wMid, smooth(k * 2)) : lerp(wMid, w1, smooth((k - 0.5) * 2));
    left.push(add(c[i], n, w));
    right.push(add(c[i], n, -w));
  }
  return blob([...left, ...right.reverse()], path, 0.45);
};

/* ---------- painting ---------- */

const paintPart = (r: Riso, part: Part) => {
  const ls = r.layers;
  if (part.w) {
    for (let i = 0; i < ls.length; i++) {
      if (part.m[i] <= 0) continue;
      const l = ls[i];
      l.lineWidth = part.w;
      l.lineCap = 'round';
      l.lineJoin = 'round';
      l.strokeStyle = r.tone(l, part.m[i]);
      l.stroke(part.p);
    }
    return;
  }
  for (const l of ls) {
    l.globalCompositeOperation = 'destination-out';
    l.fillStyle = '#000';
    l.fill(part.p);
    l.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < ls.length; i++) {
    if (part.m[i] <= 0) continue;
    const l = ls[i];
    l.fillStyle = r.tone(l, part.m[i]);
    l.fill(part.p);
  }
};

const push = (r: Riso, x: number, y: number, s = 1) => {
  for (const l of r.layers) {
    l.save();
    l.translate(x, y);
    l.scale(s, s);
  }
};
const pop = (r: Riso) => {
  for (const l of r.layers) l.restore();
};

/** Gold rim from a lamp: a shifted copy of the silhouette, painted before the figure covers it */
const rim = (r: Riso, parts: Part[], dx: number, dy: number, k: number) => {
  if (k < 0.04) return;
  const [blue, pink, gold] = r.layers;
  for (const l of [blue, pink, gold]) l.save();
  for (const l of [blue, pink, gold]) l.translate(dx, dy);
  for (const part of parts) {
    if (part.w) continue;
    for (const l of [blue, pink]) {
      l.globalCompositeOperation = 'destination-out';
      l.fillStyle = r.tone(l, Math.min(1, k * 1.2));
      l.fill(part.p);
      l.globalCompositeOperation = 'source-over';
    }
    gold.fillStyle = r.tone(gold, Math.min(1, k * 1.1));
    gold.fill(part.p);
  }
  for (const l of [blue, pink, gold]) l.restore();
};

/** Lamp light falling on something at world x: strength and direction */
const lampLight = (x: number) => {
  let best = 0;
  let dir = 0;
  for (const lx of LAMPS) {
    const n = near(lx, L, x);
    const d = n - x;
    const k = Math.exp(-((d / 260) ** 2));
    if (k > best) {
      best = k;
      dir = clamp(d / 160, -1, 1);
    }
  }
  return { k: best, dir };
};

/* ---------- the owner ---------- */

const OW = { thigh: 47, shin: 46, ua: 30, fa: 27 };
const SHOE: Pt[] = [[-7, -4], [-8.5, 1], [-8, 7.5], [18, 8], [22.5, 6.5], [22, 2.5], [15, -0.5], [7, -4], [3, -6.5], [-4, -6.5]];
const shoeLow = (a: number) => {
  let m = -Infinity;
  for (const p of SHOE) m = Math.max(m, rot(p, a)[1]);
  return m;
};
const STANCE = 0.62;
const HALF = (STANCE * (L / STRIDES / OWNER_S)) / 2;

/** Ankle relative to the hip's x on flat ground (y = 0), and the shoe's angle */
const footAt = (q: number): { x: number; y: number; a: number } => {
  let x: number;
  let a: number;
  let lift = 0;
  if (q < STANCE) {
    const u = q / STANCE;
    x = lerp(HALF, -HALF, u);
    a = -0.22 * (1 - sstep(0, 0.16, u)) + 0.62 * sstep(0.62, 1, u);
  } else {
    const u = (q - STANCE) / (1 - STANCE);
    x = -HALF + 2 * HALF * ease.inOutSine(u);
    a = lerp(0.62, -0.22, sstep(0, 0.75, u));
    lift = 11 * Math.sin(Math.PI * u) + 4 * Math.sin(Math.PI * clamp(u * 2.2));
  }
  return { x: x + 3, y: -shoeLow(a) - lift, a };
};

const TORSO_S = [-7, -1, 8, 18, 28, 38, 47, 54, 60];
const TORSO_F = [13.5, 14, 13, 13, 16, 19, 18.5, 13.5, 7];
const TORSO_B = [15.5, 15.5, 12.5, 11.5, 13.5, 16.5, 17, 14.5, 8];

const headOutline = (): Pt[] => {
  const out: Pt[] = [];
  const bump = (a: number, c: number, w: number, amp: number) => {
    const d = Math.atan2(Math.sin(a - c), Math.cos(a - c));
    return amp * Math.exp(-(d * d) / (w * w));
  };
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU;
    const k = 1 + (bump(a, 0.12, 0.13, 3.4) + bump(a, 0.88, 0.32, 2.2) - bump(a, 0.36, 0.08, 0.7) + bump(a, -0.5, 0.25, 0.8) + bump(a, Math.PI + 0.5, 0.6, 1.4)) / 11;
    out.push([Math.cos(a) * 10.6 * k, Math.sin(a) * 12.4 * k]);
  }
  return out;
};
const HEAD = headOutline();

interface OwnerOut {
  parts: Part[];
  hand: Pt;
}

const ownerParts = (dist: number, t: number, look: number): OwnerOut => {
  const ph = frac((STRIDES * dist) / L);
  const qN = ph;
  const qF = frac(ph + 0.5);
  const lean = 0.07 + 0.012 * Math.cos(2 * TAU * ph);
  const hip: Pt = [0, -88 + 2.2 * Math.cos(2 * TAU * ph)];
  const u: Pt = [Math.sin(lean), -Math.cos(lean)];
  const n: Pt = [Math.cos(lean), Math.sin(lean)];
  const parts: Part[] = [];

  const JEANS_N: Mix = [0.95, 0.05, 0];
  const JEANS_F: Mix = [1, 0.5, 0];
  const COAT: Mix = [0.42, 1, 0.12];
  const COAT_F: Mix = [0.78, 1, 0.08];
  const SKIN: Mix = [0, 0.3, 0.55];
  const SKIN_D: Mix = [0.12, 0.45, 0.6];
  const HAIR: Mix = [0.88, 0.5, 0];
  const SHOE_M: Mix = [1, 0.7, 0.05];

  const leg = (q: number, far: boolean) => {
    const f = footAt(q);
    const hp: Pt = far ? add(hip, [-2, 0]) : hip;
    const ank: Pt = [f.x, f.y];
    const [knee, a2] = ik(hp, ank, OW.thigh, OW.shin, -1);
    const p = new Path2D();
    limb(hp, knee, [8.5, 9, 6], [8.5, 9.5, 6], p);
    limb(knee, a2, [6, 6.6, 4.6], [5.6, 5, 4.5], p);
    parts.push({ p, m: far ? JEANS_F : JEANS_N });
    parts.push({ p: smoothPath(cw(SHOE.map((s) => add(a2, rot(s, f.a)))), true, 0.3), m: SHOE_M });
    const sole = new Path2D();
    const s0 = add(a2, rot([-8.3, 5.6], f.a));
    const s1 = add(a2, rot([21.5, 5.6], f.a));
    const s2 = add(a2, rot([22, 7.5], f.a));
    const s3 = add(a2, rot([-8, 7.8], f.a));
    polyPath(cw([s0, s1, s2, s3]), true, sole);
    parts.push({ p: sole, m: far ? [0.4, 0.2, 0.1] : [0.06, 0, 0.12] });
    // Creases: behind the knee and stacked at the hem
    if (!far) {
      const c = new Path2D();
      const kd: Pt = [knee[0] - hp[0], knee[1] - hp[1]];
      const kl = Math.hypot(kd[0], kd[1]);
      const ku: Pt = [kd[0] / kl, kd[1] / kl];
      const kn: Pt = [-ku[1], ku[0]];
      const b0 = add(add(knee, kn, 6), ku, -4);
      c.moveTo(b0[0], b0[1]);
      const b1 = add(add(knee, kn, 2), ku, 1);
      c.lineTo(b1[0], b1[1]);
      const h0 = add(a2, [-4, -9]);
      c.moveTo(h0[0], h0[1]);
      c.quadraticCurveTo(a2[0], a2[1] - 6, a2[0] + 4.5, a2[1] - 9.5);
      const f0 = add(add(knee, kn, -4), ku, -14);
      c.moveTo(f0[0], f0[1]);
      const f1 = add(add(knee, kn, -1), ku, -5);
      c.lineTo(f1[0], f1[1]);
      parts.push({ p: c, m: [0, 0.75, 0.1], w: 1.1 });
    }
  };

  const sh: Pt = add(add(hip, u, 53), n, -1);
  // Far arm swings with the near leg
  const swing = Math.cos(TAU * ph);
  const uaF = 0.36 * swing;
  const faF = uaF + 0.25 + 0.2 * Math.max(0, swing);
  const shF = add(sh, [-3, 0]);
  const elF = add(shF, [Math.sin(uaF), Math.cos(uaF)], OW.ua);
  const wrF = add(elF, [Math.sin(faF), Math.cos(faF)], OW.fa);
  const armF = new Path2D();
  limb(shF, elF, [7.6, 6.8, 5.2], [7.6, 6.8, 5.2], armF);
  limb(elF, wrF, [5.2, 5, 4.2], [5.2, 4.8, 4.2], armF);
  parts.push({ p: armF, m: COAT_F });
  parts.push({ p: ell(add(wrF, [Math.sin(faF), Math.cos(faF)], 5), 3.4, 6, -faF), m: SKIN_D });

  leg(qF, true);
  leg(qN, false);

  // Torso: hooded jacket over a lifter's chest
  const tp: Pt[] = [];
  for (let i = 0; i < TORSO_S.length; i++) tp.push(add(add(hip, u, TORSO_S[i]), n, TORSO_F[i]));
  for (let i = TORSO_S.length - 1; i >= 0; i--) tp.push(add(add(hip, u, TORSO_S[i]), n, -TORSO_B[i]));
  parts.push({ p: blob(tp), m: COAT });
  // Hood bunched behind the neck
  parts.push({ p: ell(add(add(hip, u, 57), n, -8), 8.5, 6, lean - 0.5), m: COAT_F });

  // Neck
  const nb = add(hip, u, 56);
  const look2 = lean + look + 0.05 * Math.sin(2 * TAU * ph + 0.6);
  const hc = add(add(nb, rot([0, -1], look2), 15.5), rot([1, 0], look2), 2.5);
  const neck = blob([add(nb, n, 6), add(hc, rot([4.5, 7], look2)), add(hc, rot([-5, 6], look2)), add(nb, n, -6.5)]);
  parts.push({ p: neck, m: SKIN_D });

  // Head
  const H = (p: Pt) => add(hc, rot(p, look2));
  parts.push({ p: blob(HEAD.map(H)), m: SKIN });
  // Beard along the jaw, with a moustache
  const beard: Pt[] = [];
  for (let i = 0; i < HEAD.length; i++) {
    const a = (i / HEAD.length) * TAU;
    if (a > 0.42 && a < 1.95) beard.push(H([HEAD[i][0] * 1.03, HEAD[i][1] * 1.03]));
  }
  beard.push(H([-3.5, 3]), H([1.5, 5.2]), H([6.5, 6]), H([9.5, 4.3]), H([11.8, 4.6]), H([12.4, 3.4]), H([9, 2.6]));
  parts.push({ p: polyPath(cw(beard), true), m: HAIR });
  // Hair at the nape, ear
  parts.push({ p: blob([H([-5, -4]), H([-11.4, -4]), H([-11.8, 2]), H([-9.5, 7]), H([-5.5, 5.5])]), m: HAIR });
  parts.push({ p: ell(H([-2.2, 1]), 2.6, 3.7, look2), m: SKIN_D });
  // Beanie with a folded band
  const cap: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = lerp(-2.95, -0.5, i / 16);
    const bulge = 1.12 + 0.05 * Math.sin(((i / 16) * Math.PI) ** 1.3);
    cap.push(H([Math.cos(a) * 10.6 * bulge - 0.5, Math.sin(a) * 12.4 * bulge - 1]));
  }
  cap.push(H([8.5, -4.6]), H([-11.8, -3.4]));
  parts.push({ p: blob(cap), m: [0.12, 0.28, 1] });
  parts.push({ p: polyPath(cw([H([-12.2, -3.2]), H([9, -4.4]), H([9.6, -8.4]), H([-12.4, -7.6])]), true), m: [0.3, 0.45, 1] });
  // Eye and brow
  parts.push({ p: ell(H([6, -1.6]), 1.2, 1.05), m: [1, 0.4, 0] });
  const brow = new Path2D();
  const b0 = H([3.6, -4.2]);
  const b1 = H([9, -4.4]);
  brow.moveTo(b0[0], b0[1]);
  brow.lineTo(b1[0], b1[1]);
  parts.push({ p: brow, m: [1, 0.5, 0], w: 1.3 });

  // Jacket details: hem band, kangaroo pocket, back seam, drawstrings
  const det = new Path2D();
  const e0 = add(add(hip, u, -3), n, 14);
  const e1 = add(add(hip, u, -3), n, -15.5);
  det.moveTo(e0[0], e0[1]);
  det.lineTo(e1[0], e1[1]);
  const k0 = add(add(hip, u, 1), n, 13.5);
  const k1 = add(add(hip, u, 15), n, 9);
  const k2 = add(add(hip, u, 2), n, -3);
  det.moveTo(k0[0], k0[1]);
  det.quadraticCurveTo(k1[0], k1[1], k2[0], k2[1]);
  const sz0 = add(add(hip, u, 26), n, -6);
  const sz1 = add(add(hip, u, 44), n, -9);
  const szc = add(add(hip, u, 36), n, -4);
  det.moveTo(sz0[0], sz0[1]);
  det.quadraticCurveTo(szc[0], szc[1], sz1[0], sz1[1]);
  parts.push({ p: det, m: [1, 0.2, 0], w: 1.2 });
  const str = new Path2D();
  const d0 = add(add(hip, u, 52), n, 9);
  const sw = 1.5 * Math.sin(TAU * ph * 2);
  str.moveTo(d0[0], d0[1]);
  str.lineTo(d0[0] + 1.5 + sw, d0[1] + 12);
  str.moveTo(d0[0] - 2.5, d0[1] - 0.5);
  str.lineTo(d0[0] - 1.6 + sw, d0[1] + 10.5);
  parts.push({ p: str, m: [0, 0.15, 1], w: 1 });

  // Near arm holds the leash out toward Luna
  const tug = 0.05 * per(t, 7) + 0.03 * Math.sin(TAU * ph * 2);
  const ua = 0.22 + tug;
  const fa = 1.12 + tug * 1.6;
  const el = add(sh, [Math.sin(ua), Math.cos(ua)], OW.ua);
  const wr = add(el, [Math.sin(fa), Math.cos(fa)], OW.fa);
  const arm = new Path2D();
  limb(sh, el, [8.2, 7.4, 5.4], [8.6, 7.2, 5.4], arm);
  limb(el, wr, [5.4, 5.2, 4.3], [5.4, 5, 4.3], arm);
  parts.push({ p: arm, m: COAT });
  const crease = new Path2D();
  const c0 = add(el, [-3.5, -2.5]);
  crease.moveTo(c0[0], c0[1]);
  crease.quadraticCurveTo(el[0] + 1, el[1] + 1, el[0] + 4, el[1] - 2.5);
  const cf = add(wr, [Math.sin(fa), Math.cos(fa)], -3.5);
  const cn: Pt = [Math.cos(fa), -Math.sin(fa)];
  crease.moveTo(cf[0] + cn[0] * 4.5, cf[1] + cn[1] * 4.5);
  crease.lineTo(cf[0] - cn[0] * 4.5, cf[1] - cn[1] * 4.5);
  parts.push({ p: crease, m: [1, 0.2, 0], w: 1.1 });
  const fist = add(wr, [Math.sin(fa), Math.cos(fa)], 4.2);
  parts.push({ p: ell(fist, 5, 4.4, fa), m: SKIN });
  parts.push({ p: ell(add(fist, [2.6, -3]), 2.6, 1.6, -0.5), m: SKIN_D });
  return { parts, hand: add(fist, [1, 1.5]) };
};

/* ---------- Luna (rig after luna.ts, legs rebuilt with IK and tapered shapes) ---------- */

const TORSO_D: Pt[] = [
  [50, -6], [46, -17], [32, -26], [10, -22], [-14, -20], [-34, -22], [-48, -19], [-56, -7],
  [-52, 8], [-38, 14], [-20, 6], [0, 8], [22, 15], [40, 12],
];
const SKULL: Pt[] = [
  [-4, -2], [3, -11], [14, -13], [22, -9], [27, -4], [38, -2], [44, -1], [47, 3], [43, 8], [30, 10], [16, 12], [4, 10], [-3, 5],
];
const EAR: Pt[] = [[5, -8], [3, -17], [1, -27], [10, -20], [15, -10]];
const G_D = 47;
const D_STANCE = 0.52;
const D_HALF = (D_STANCE * (L / TROTS / DOG_S)) / 2;

interface DogPose {
  neck: number;
  head: number;
  tail: number;
  earBack: number;
  shut: number;
}

interface DogOut {
  parts: Part[];
  collar: Pt;
  eye: Pt;
  shut: number;
}

const pawAt = (q: number): Pt => {
  if (q < D_STANCE) return [lerp(D_HALF, -D_HALF, q / D_STANCE), 0];
  const u = (q - D_STANCE) / (1 - D_STANCE);
  return [-D_HALF + 2 * D_HALF * ease.inOutSine(u), -9 * Math.sin(Math.PI * u)];
};
const flexAt = (q: number) => (q < D_STANCE ? 0 : Math.sin(Math.PI * clamp(((q - D_STANCE) / (1 - D_STANCE)) * 1.25)));

const dogParts = (dist: number, pose: DogPose): DogOut => {
  const ph = frac((TROTS * dist) / L);
  const by = -1.3 * Math.cos(2 * TAU * ph);
  const B = (p: Pt): Pt => [p[0], p[1] + by];
  const parts: Part[] = [];
  const COAT: Mix = [1, 0.1, 0];
  const FAR: Mix = [1, 0.6, 0];

  const front = (q: number, far: boolean) => {
    const pw = pawAt(q);
    const fl = flexAt(q);
    const paw: Pt = [34 + pw[0] + (far ? -2 : 0), G_D - 3.5 + pw[1]];
    const wrist = add(paw, rot([-1.5, -8], fl * 1.7));
    const shj = B([28 + (far ? -2 : 0), -2]);
    const [elbow, wr] = ik(shj, wrist, 23, 23, 1);
    const p = new Path2D();
    limb(shj, elbow, [7, 7.5, 4.6], [8.5, 8, 4.6], p);
    limb(elbow, wr, [4.2, 3.4, 3], [4.4, 3.6, 3], p);
    limb(wr, paw, [3, 2.8, 2.7], [3, 2.8, 2.7], p);
    ell(add(paw, [2.6, 0.4]), 5.2, 3.4, 0, p);
    parts.push({ p, m: far ? FAR : COAT });
  };
  const back = (q: number, far: boolean) => {
    const pw = pawAt(q);
    const fl = flexAt(q);
    const paw: Pt = [-42 + pw[0] + (far ? -2 : 0), G_D - 3.5 + pw[1]];
    const hock = add(paw, rot([-4.5, -13], -fl * 0.9));
    const hj = B([-38 + (far ? -2 : 0), 0]);
    const [stifle, hk] = ik(hj, hock, 23, 23, -1);
    const p = new Path2D();
    const th = add(hj, [stifle[0] - hj[0], stifle[1] - hj[1]], 0.45);
    ell(th, 17, 12.5, Math.atan2(stifle[1] - hj[1], stifle[0] - hj[0]), p);
    limb(stifle, hk, [6.5, 5, 2.8], [4.5, 3.4, 2.8], p);
    limb(hk, paw, [2.8, 2.6, 2.6], [2.8, 2.6, 2.6], p);
    ell(add(paw, [2.4, 0.4]), 5, 3.3, 0, p);
    parts.push({ p, m: far ? FAR : COAT });
  };

  // Trot: diagonal pairs move together
  front(frac(ph + 0.5), true);
  back(frac(ph), true);

  const body = new Path2D();
  smoothPath(cw(TORSO_D.map(B)), true, 0.5, body);
  const base = B([38, -14]);
  const dir: Pt = [Math.cos(pose.neck), Math.sin(pose.neck)];
  const bk: Pt = [Math.sin(pose.neck), -Math.cos(pose.neck)];
  const end = add(base, dir, 26);
  blob([B([20, -24]), add(end, bk, 10), add(end, bk, -11), B([48, -2])], body, 0.35);
  // Tail plume, wagging
  const rump = B([-53, -12]);
  const tail = pose.tail;
  strand(rump, [rump[0] - 17, rump[1] - 5 - 17 * tail], [rump[0] - 31, rump[1] + 5 - 28 * tail], 4.6, 5.2, 1.4, body);
  parts.push({ p: body, m: COAT });
  const saddle = new Path2D();
  blob([B([34, -22]), B([10, -23.5]), B([-14, -21]), B([-36, -23]), B([-50, -18]), B([-40, -14]), B([-14, -14]), B([12, -16]), B([30, -16])], saddle);
  parts.push({ p: saddle, m: [1, 0.6, 0] });
  const chest = new Path2D();
  blob([B([48, -4]), B([44, 6]), B([36, 13]), B([26, 13]), B([34, 4]), B([40, -6])], chest);
  parts.push({ p: chest, m: [0.78, 0.12, 0.12] });

  // Head
  const hr = (q: Pt) => rot(q, pose.head);
  const anchor = hr([5, 6]);
  const hp = (q: Pt): Pt => {
    const r = hr(q);
    return [r[0] - anchor[0] + end[0], r[1] - anchor[1] + end[1]];
  };
  const earPts = (dx: number, dy: number) => {
    const pivot: Pt = [5 + dx, -9 + dy];
    return EAR.map(([x, y]) => hp(rotAbout([x + dx, y + dy], -pose.earBack, pivot)));
  };
  const head = new Path2D();
  blob(earPts(-6, 2), head, 0.35);
  blob(SKULL.map(hp), head, 0.5);
  parts.push({ p: head, m: COAT });
  parts.push({ p: blob(earPts(0, 0), new Path2D(), 0.35), m: COAT });
  // Inner ear catches a little pink
  const inner = earPts(0, 0);
  parts.push({ p: blob([inner[1], inner[2], add(inner[3], [inner[1][0] - inner[3][0], inner[1][1] - inner[3][1]], 0.35)]), m: [1, 0.55, 0] });

  // Collar
  const c0 = add(base, dir, 5);
  const c1 = add(base, dir, 10);
  parts.push({ p: polyPath(cw([add(c0, bk, 13.2), add(c1, bk, 12), add(c1, bk, -13), add(c0, bk, -14)]), true), m: [0, 1, 0.8] });
  parts.push({ p: ell(add(add(c0, dir, 2.5), bk, -13.5), 2.2, 2.2), m: [0, 0.1, 1] });

  back(frac(ph + 0.5), false);
  front(frac(ph), false);

  return { parts, collar: add(add(c0, dir, 2.5), bk, 12.5), eye: hp([19, -5]), shut: pose.shut };
};

const dogPose = (t: number): DogPose => {
  const smug = win(t, 5.5, 6.2, 7.7, 8.4);
  const up = win(t, 11.2, 11.8, 12.9, 13.6);
  const wag = per(t, 36);
  return {
    neck: lerp(lerp(-0.78 + 0.03 * per(t, 60), -1.2, smug), -1.32, up),
    head: lerp(lerp(0.12 + 0.03 * per(t, 30, 1), -0.34, smug), -0.62, up),
    tail: lerp(0.35 + 0.22 * wag, 0.92 + 0.04 * wag, smug) + 0.12 * up * per(t, 54),
    earBack: 0.55 * win(t, 7.4, 7.7, 8.5, 8.9) - 0.15 * smug,
    shut: win(t, 6.0, 6.25, 7.45, 7.7),
  };
};

/* ---------- the cat ---------- */

const catParts = (lk: number, wide: number, flick: number): Part[] => {
  const parts: Part[] = [];
  const CAT: Mix = [1, 0.42, 0];
  const body = new Path2D();
  blob([[-10.5, 0], [-11, -7], [-9.5, -15], [-7, -21], [-3, -24], [3, -22.5], [9, -17], [13.5, -9], [15, -2], [14, 0.5], [2, 1]], body);
  // Tail hangs over the post and flicks
  const puff = 1 + 0.45 * wide;
  strand([12, -2], [16.5, 6], [15 + flick * 0.5, 17], 1.9 * puff, 1.7 * puff, 1.5 * puff, body);
  strand([15 + flick * 0.5, 17], [14.5 + flick, 23], [18 + flick, 24], 1.5 * puff, 1.4 * puff, 1.2 * puff, body);
  ell([-7.5, -1.2], 3.3, 1.9, 0, body);
  ell([-2.6, -1], 3.3, 1.9, 0, body);
  parts.push({ p: body, m: CAT });
  const down = 1 - Math.abs(lk);
  const hc: Pt = [-3 + lk * 1.6, -31 + down * 1.6];
  const head = new Path2D();
  blob(ellPts(hc, 10, 8.6, 0, 16), head);
  polyPath(cw([add(hc, [-9.5, -3]), add(hc, [-8.5 + lk * 0.6, -15.5 + wide]), add(hc, [-2.5, -7.5])]), true, head);
  polyPath(cw([add(hc, [2.5, -7.5]), add(hc, [8.5 + lk * 0.6, -15.5 + wide]), add(hc, [9.5, -3])]), true, head);
  parts.push({ p: head, m: CAT });
  const eyes = new Path2D();
  const pupils = new Path2D();
  for (const sx of [-3.7, 3.7]) {
    const e = add(hc, [sx + lk * 1.4, -0.4 + down * 0.4]);
    ell(e, 2.5 + wide * 0.4, 1.6 + wide * 0.9, 0, eyes);
    ell(add(e, [lk * 0.9, 0]), lerp(0.55, 1.75, wide), 1.5 + wide * 0.6, 0, pupils);
  }
  parts.push({ p: eyes, m: [0, 0.05, 1] });
  parts.push({ p: pupils, m: [1, 0.3, 0] });
  parts.push({ p: polyPath(cw([add(hc, [-1.2 + lk * 1.8, 3.2]), add(hc, [1.2 + lk * 1.8, 3.2]), add(hc, [lk * 1.8, 4.6])]), true), m: [0, 1, 0.3] });
  const wh = new Path2D();
  for (const s of [-1, 1]) {
    const o = add(hc, [s * 4.5 + lk * 1.8, 4.5]);
    wh.moveTo(o[0], o[1]);
    wh.lineTo(o[0] + s * 9, o[1] - 1.5);
    wh.moveTo(o[0], o[1] + 1);
    wh.lineTo(o[0] + s * 8.5, o[1] + 2);
  }
  parts.push({ p: wh, m: [0.25, 0.1, 0], w: 0.5 });
  return parts;
};

/* ---------- static scenery ---------- */

interface Group {
  p: Path2D;
  m: Mix;
}

interface Fly {
  x: number;
  y: number;
  ax: number;
  ay: number;
  nx: number;
  ny: number;
  p1: number;
  p2: number;
  nb: number;
  p3: number;
}

interface State {
  far: Group[];
  house: Group[];
  main: Group[];
  fore: Group[];
  porch: Pt[];
  tv: [number, number, number, number][];
  stars: [number, number, number][];
  flies: Fly[];
}

const groupSet = (names: string[], mixes: Mix[]) => {
  const map: Record<string, Path2D> = {};
  names.forEach((n) => (map[n] = new Path2D()));
  const list = (): Group[] => names.map((n, i) => ({ p: map[n], m: mixes[i] }));
  return { map, list };
};

const tiled = (r: Riso, groups: Group[], P: number, camX: number, half: number, x0: number, x1: number) => {
  const k0 = Math.floor((camX - half - x1) / P);
  const k1 = Math.ceil((camX + half - x0) / P);
  for (let k = k0; k <= k1; k++) {
    const off = k * P;
    if (off + x1 < camX - half || off + x0 > camX + half) continue;
    push(r, off, 0);
    for (const g of groups) paintPart(r, g);
    pop(r);
  }
};

const buildFar = (rng: () => number): Group[] => {
  const { map, list } = groupSet(['trees', 'steeple'], [[0.74, 0.42, 0], [0.74, 0.42, 0]]);
  const y = (x: number) => {
    const k = (x / PER_FAR) * TAU;
    return 520 + 26 * Math.sin(3 * k) + 16 * Math.sin(7 * k + 1) + 9 * Math.sin(13 * k + 2);
  };
  const p = map.trees;
  p.moveTo(-60, 760);
  for (let x = -60; x <= PER_FAR + 60; x += 10) p.lineTo(x, y(x));
  p.lineTo(PER_FAR + 60, 760);
  p.closePath();
  for (let x = 20; x < PER_FAR - 40; x += 40 + rng() * 50) {
    const rr = 22 + rng() * 26;
    ell([x, y(x) - rr * 0.3], rr, rr * 0.8, 0, p);
  }
  // A distant steeple and water tower
  polyPath(cw([[880, 760], [880, 380], [893, 340], [906, 380], [906, 760]]), true, map.steeple);
  polyPath(cw([[874, 420], [912, 420], [912, 760], [874, 760]]), true, map.steeple);
  ell([1420, 405], 34, 20, 0, map.steeple);
  polyPath(cw([[1398, 410], [1442, 410], [1436, 760], [1404, 760]]), true, map.steeple);
  return list();
};

const buildHouses = (rng: () => number, porch: Pt[], tv: [number, number, number, number][]): Group[] => {
  const names = ['wall', 'siding', 'roof', 'chimney', 'trim', 'winDark', 'winWarm', 'winYellow', 'mullion', 'door', 'porch', 'tree', 'treeLit', 'bush', 'lawn'];
  const mixes: Mix[] = [
    [0.4, 0.16, 0], [0.62, 0.24, 0], [1, 0.5, 0], [0.8, 0.75, 0], [0.22, 0.1, 0.04], [1, 0.55, 0], [0, 0.42, 1], [0, 0.06, 0.88],
    [0.95, 0.4, 0], [0.55, 0.95, 0.05], [0.26, 0.12, 0.04], [0.92, 0.32, 0], [0.66, 0.22, 0.12], [1, 0.28, 0], [0.86, 0.16, 0],
  ];
  const { map: G, list } = groupSet(names, mixes);
  const win2 = (x: number, y: number, w: number, h: number) => {
    G.trim.rect(x - 4, y - 4, w + 8, h + 8);
    const lit = rng();
    const glass = lit < 0.42 ? G.winWarm : lit < 0.62 ? G.winYellow : G.winDark;
    glass.rect(x, y, w, h);
    G.mullion.rect(x + w / 2 - 1.5, y, 3, h);
    G.mullion.rect(x, y + h * 0.48 - 1.5, w, 3);
    G.trim.rect(x - 7, y + h + 3, w + 14, 5);
    return lit < 0.42;
  };
  const house = (x: number, w: number, h: number, kind: number) => {
    const top = GH - h;
    G.wall.rect(x, top, w, h);
    for (let y = top + 9; y < GH - 6; y += 11) G.siding.rect(x, y, w, 2.2);
    const over = 20;
    if (kind === 1) {
      const rh = h * 0.42;
      polyPath(cw([[x - over, top + 3], [x + w * 0.2, top - rh], [x + w * 0.8, top - rh], [x + w + over, top + 3]]), true, G.roof);
      G.chimney.rect(x + w * 0.68, top - rh - 30, 30, 36);
      G.trim.rect(x + w * 0.68 - 3, top - rh - 34, 36, 6);
    } else {
      const rh = h * (kind === 2 ? 0.75 : 0.6);
      polyPath(cw([[x - over, top + 4], [x + w / 2, top - rh], [x + w + over, top + 4]]), true, G.roof);
      G.chimney.rect(x + w * 0.22, top - rh * 0.62 - 26, 28, 44);
      G.trim.rect(x + w * 0.22 - 3, top - rh * 0.62 - 30, 34, 6);
      // Attic window
      if (kind === 2) win2(x + w / 2 - 16, top - rh * 0.42, 32, 34);
    }
    G.trim.rect(x - over, top - 2, w + over * 2, 7);
    G.trim.rect(x, top, 9, h);
    G.trim.rect(x + w - 9, top, 9, h);
    const floors = h > 235 ? 2 : 1;
    const doorX = kind === 1 ? x + w * 0.3 : x + w * 0.5 - 24;
    const doorW = 48;
    for (let f = 0; f < floors; f++) {
      const wy = GH - 112 - f * 120;
      const n = Math.max(2, Math.floor(w / 125));
      for (let i = 0; i < n; i++) {
        const wx = x + ((i + 0.5) * w) / n - 23;
        if (f === 0 && wx + 52 > doorX - 30 && wx < doorX + doorW + 30) continue;
        if (win2(wx, wy, 46, 62) && rng() < 0.35 && tv.length < 3) tv.push([wx, wy, 46, 62]);
      }
    }
    // Door and porch
    G.door.rect(doorX, GH - 96, doorW, 92);
    G.mullion.rect(doorX + 8, GH - 86, doorW - 16, 22);
    G.porch.rect(doorX - 40, GH - 128, doorW + 80, 12);
    polyPath(cw([[doorX - 46, GH - 128], [doorX + doorW / 2, GH - 152], [doorX + doorW + 46, GH - 128]]), true, G.roof);
    G.porch.rect(doorX - 34, GH - 116, 7, 112);
    G.porch.rect(doorX + doorW + 27, GH - 116, 7, 112);
    G.porch.rect(doorX - 40, GH - 8, doorW + 80, 8);
    G.porch.rect(doorX - 30, GH, doorW + 60, 7);
    porch.push([doorX - 14, GH - 96]);
    // Bushes along the front
    for (let bx = x - 10; bx < x + w + 10; bx += 34 + rng() * 26) {
      if (bx > doorX - 50 && bx < doorX + doorW + 40) continue;
      const rr = 15 + rng() * 12;
      ell([bx, GH - rr * 0.55], rr, rr * 0.8, 0, G.bush);
    }
  };
  house(150, 470, 250, 0);
  house(720, 430, 205, 1);
  house(1330, 560, 268, 2);
  // Park: big trees, no houses
  for (const [tx, th, tr] of [[2120, 300, 110], [2330, 360, 140], [2560, 280, 100], [2790, 340, 130]] as [number, number, number][]) {
    polyPath(cw([[tx - 12, GH], [tx - 8, GH - th + tr * 0.6], [tx + 8, GH - th + tr * 0.6], [tx + 13, GH]]), true, G.tree);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      ell([tx + Math.cos(a) * tr * 0.55, GH - th + Math.sin(a) * tr * 0.4], tr * (0.55 + rng() * 0.2), tr * 0.48, 0, G.tree);
    }
    for (let k = 0; k < 9; k++) {
      const a = -2.6 + rng() * 1.6;
      ell([tx + Math.cos(a) * tr * 1.0, GH - th + Math.sin(a) * tr * 0.75], tr * 0.16, tr * 0.1, a + 1.6, G.treeLit);
    }
  }
  house(3010, 360, 220, 0);
  house(3450, 170, 175, 1);
  G.lawn.rect(-100, GH, PER_HOUSE + 300, 200);
  return list();
};

const buildMain = (rng: () => number): Group[] => {
  const names = ['lawn', 'drive', 'rail', 'picket', 'post', 'hedge', 'hedgeLit', 'shrub', 'lamp', 'sign', 'mailbox', 'mailFlag', 'walk', 'joint', 'curbTop', 'curb', 'road', 'roadTex'];
  const mixes: Mix[] = [
    [0.9, 0.18, 0], [0.48, 0.1, 0], [0.7, 0.28, 0], [0.34, 0.16, 0.08], [0.66, 0.24, 0.04], [0.95, 0.3, 0.05], [0.62, 0.22, 0.22], [1, 0.3, 0],
    [1, 0.45, 0], [1, 0.05, 0], [0.2, 1, 0.75], [0.1, 0.2, 1], [0.3, 0.07, 0], [0.62, 0.15, 0], [0.12, 0.04, 0], [0.62, 0.16, 0], [0.86, 0.22, 0], [1, 0.4, 0],
  ];
  const { map: G, list } = groupSet(names, mixes);
  const X0 = -40;
  const X1 = L + 40;
  G.lawn.rect(X0, 620, X1 - X0, BACK_EDGE - 618);
  // Picket fence around the cat's post
  const f0 = CAT_X - 430;
  const f1 = CAT_X + 440;
  G.rail.rect(f0, 560, f1 - f0, 9);
  G.rail.rect(f0, 640, f1 - f0, 9);
  for (let x = f0; x < f1; x += 21) {
    if (Math.abs(x - CAT_X) < 20) continue;
    polyPath(cw([[x, BACK_EDGE], [x, 538], [x + 6.5, 528], [x + 13, 538], [x + 13, BACK_EDGE]]), true, G.picket);
  }
  for (const px of [f0 - 8, CAT_X - 13, f1 - 4]) {
    G.post.rect(px, 522, 26, BACK_EDGE - 522);
    G.post.rect(px - 3, 516, 32, 8);
  }
  // Driveway between fence and hedge
  G.drive.rect(f1 + 30, 620, 180, BACK_EDGE - 620);
  // Park hedge
  const h0 = 2690;
  const h1 = 3630;
  const hy = (x: number) => 520 + 14 * Math.sin(x / 37) + 9 * Math.sin(x / 13 + 2);
  G.hedge.moveTo(h0, BACK_EDGE);
  for (let x = h0; x <= h1; x += 8) G.hedge.lineTo(x, hy(x) + (x - h0 < 30 ? (30 - (x - h0)) * 1.4 : 0) + (h1 - x < 30 ? (30 - (h1 - x)) * 1.4 : 0));
  G.hedge.lineTo(h1, BACK_EDGE);
  G.hedge.closePath();
  for (let x = h0 + 30; x < h1 - 30; x += 22 + rng() * 26) ell([x, hy(x) + 14 + rng() * 60], 9 + rng() * 9, 5 + rng() * 4, rng() - 0.5, G.hedgeLit);
  // Shrubs in front of the houses
  for (let x = 120; x < 1450; x += 60 + rng() * 120) {
    const rr = 18 + rng() * 16;
    ell([x, BACK_EDGE - rr * 0.6], rr, rr * 0.75, 0, G.shrub);
  }
  for (let x = 3760; x < L - 60; x += 70 + rng() * 120) {
    const rr = 18 + rng() * 16;
    ell([x, BACK_EDGE - rr * 0.6], rr, rr * 0.75, 0, G.shrub);
  }
  // Lamp posts: acorn lanterns
  for (const lx of LAMPS) {
    const p = G.lamp;
    polyPath(cw([[lx - 15, BACK_EDGE + 4], [lx - 8, BACK_EDGE - 50], [lx + 8, BACK_EDGE - 50], [lx + 15, BACK_EDGE + 4]]), true, p);
    polyPath(cw([[lx - 5.5, BACK_EDGE - 50], [lx - 4, 212], [lx + 4, 212], [lx + 5.5, BACK_EDGE - 50]]), true, p);
    p.rect(lx - 9, BACK_EDGE - 58, 18, 8);
    p.rect(lx - 8, 300, 16, 6);
    polyPath(cw([[lx - 13, 214], [lx + 13, 214], [lx + 9, 202], [lx - 9, 202]]), true, p);
    polyPath(cw([[lx - 19, 140], [lx + 19, 140], [lx + 6, 124], [lx, 108], [lx - 6, 124]]), true, p);
    ell([lx, 106], 4, 4, 0, p);
  }
  // Corner sign on the first lamp
  const sx = LAMPS[0];
  G.sign.rect(sx + 5, 318, 152, 34);
  G.lamp.rect(sx + 4, 312, 6, 46);
  // Mailbox at the corner house
  G.lamp.rect(372, 604, 7, BACK_EDGE - 604);
  G.mailbox.rect(352, 578, 46, 28);
  ell([375, 578], 23, 9, 0, G.mailbox);
  G.mailFlag.rect(394, 566, 4, 22);
  G.mailFlag.rect(394, 566, 12, 8);
  // Sidewalk, joints, curb, road
  G.walk.rect(X0, BACK_EDGE, X1 - X0, CURB_TOP - BACK_EDGE);
  for (let x = 0; x < L; x += 94) polyPath([[x, BACK_EDGE], [x + 2.2, BACK_EDGE], [x - 9.8, CURB_TOP], [x - 12, CURB_TOP]], true, G.joint);
  G.joint.rect(X0, BACK_EDGE, X1 - X0, 3);
  G.curbTop.rect(X0, CURB_TOP - 3, X1 - X0, 6);
  G.curb.rect(X0, CURB_TOP + 3, X1 - X0, ROAD_TOP - CURB_TOP - 3);
  G.road.rect(X0, ROAD_TOP, X1 - X0, 700);
  for (let i = 0; i < 260; i++) ell([rng() * L, ROAD_TOP + 14 + rng() * 300], 1.5 + rng() * 3, 1 + rng() * 1.5, 0, G.roadTex);
  // Grass at the walk's back edge
  for (let x = X0; x < X1; x += 7 + rng() * 7) {
    if (x > 2690 && x < 3630) continue;
    const h = 5 + rng() * 9;
    polyPath(cw([[x, BACK_EDGE + 1], [x + 1.5 + rng() * 2, BACK_EDGE - h], [x + 4, BACK_EDGE + 1]]), true, G.lawn);
  }
  return list();
};

const buildFore = (rng: () => number): Group[] => {
  const { map: G, list } = groupSet(['trunk', 'leaf', 'leafLit', 'hydrant', 'hydrantCap'], [
    [1, 0.55, 0], [1, 0.48, 0], [0.75, 0.3, 0.1], [0.15, 1, 0.75], [0.3, 1, 0.9],
  ]);
  for (const tx of [1500, 5000]) {
    const p = G.trunk;
    polyPath(
      cw([[tx - 70, 1150], [tx - 56, 900], [tx - 40, 500], [tx - 48, 200], [tx - 90, -80], [tx - 50, -90], [tx - 10, 150], [tx + 30, -100],
        [tx + 70, -90], [tx + 34, 220], [tx + 40, 520], [tx + 58, 900], [tx + 80, 1150]]),
      true,
      p
    );
    for (let k = 0; k < 16; k++) {
      const x = tx - 420 + rng() * 840;
      const y = -170 + rng() * 170 + Math.abs(x - tx) * -0.12;
      ell([x, y], 70 + rng() * 80, 46 + rng() * 40, rng() - 0.5, G.leaf);
    }
    for (let k = 0; k < 5; k++) ell([tx - 24 + k * 9, 400 + k * 130], 3, 26, 0.1, G.leafLit);
  }
  // Hydrant at the near curb, high enough to read whole
  const hx = 4200;
  G.hydrant.rect(hx - 22, 830, 44, 110);
  ell([hx, 830], 22, 18, 0, G.hydrant);
  G.hydrant.rect(hx - 34, 860, 68, 16);
  G.hydrantCap.rect(hx - 6, 803, 12, 12);
  G.hydrantCap.rect(hx - 28, 930, 56, 14);
  return list();
};

/* ---------- film ---------- */

export const risoNightWalkFilm: RisoFilm<State> = {
  id: 'riso-night-walk',
  title: 'Night Walk',
  caption: 'Once around the block with Luna: lamps, porch lights, a cat she pretends not to see, fireflies.',
  theme: 'Luna',
  category: 'Luna',
  motif: 'Pools of lamplight, one after another, back to the same corner',
  duration: T,
  paper: '#f2e9d6',
  inks: [
    { color: '#2e4688', angle: 15, offset: [0, 0], opacity: 0.94 },
    { color: '#ff48b0', angle: 75, offset: [1.5, -1.1], opacity: 0.82 },
    { color: '#ffb511', angle: 45, offset: [-1.2, 1.2], opacity: 0.9 },
  ],
  scenes: [
    { at: 0, label: 'The corner' },
    { at: 4.2, label: 'The cat' },
    { at: 9.2, label: 'Lamps' },
    { at: 10.8, label: 'Fireflies' },
    { at: 14.6, label: 'Porch lights' },
  ],
  posterTime: 6.85,

  setup() {
    const rng = mulberry(814);
    const porch: Pt[] = [];
    const tv: [number, number, number, number][] = [];
    const far = buildFar(rng);
    const house = buildHouses(rng, porch, tv);
    const main = buildMain(rng);
    const fore = buildFore(rng);
    const stars: [number, number, number][] = [];
    for (let i = 0; i < 110; i++) stars.push([-300 + rng() * 2200, -260 + rng() * 680, rng()]);
    const flies: Fly[] = [];
    for (let i = 0; i < 46; i++) {
      const inPark = i < 34;
      flies.push({
        x: inPark ? 2700 + rng() * 940 : rng() * L,
        y: inPark ? 440 + rng() * 270 : 430 + rng() * 220,
        ax: 18 + rng() * 40,
        ay: 12 + rng() * 26,
        nx: 1 + Math.floor(rng() * 3),
        ny: 2 + Math.floor(rng() * 3),
        p1: rng() * TAU,
        p2: rng() * TAU,
        nb: 7 + Math.floor(rng() * 8),
        p3: rng() * TAU,
      });
    }
    return { far, house, main, fore, porch, tv, stars, flies };
  },

  draw(r, tIn, s) {
    // The loop's last instant is its first: wrap so t = T renders exactly the t = 0 frame
    const t = tIn >= T ? tIn - T : tIn;
    const [blue, pink, gold] = r.layers;
    const cam = camAt(t);
    const XO = ownerX(t);
    const XL = dogX(t);
    const cx = XO + cam.ox;
    const { cy, z, rot: cr } = cam;
    const layerCam = (p: number) => {
      const X = 800 + (cx - 800) * p;
      const Z = 1 + (z - 1) * p;
      r.camera(X, 450 + (cy - 450) * p, Z, cr);
      return { X, half: 800 / Z + 320 };
    };

    /* ----- sky ----- */
    r.camera(800 + cam.ox * 0.04, 450 + (cy - 450) * 0.12, 1 + (z - 1) * 0.12, cr);
    r.gradient(blue, null, { kind: 'linear', x0: 0, y0: -150, x1: 0, y1: 640, from: 0.95, to: 0.5 }, 14);
    r.gradient(pink, null, { kind: 'linear', x0: 0, y0: 660, x1: 0, y1: 160, from: 0.42, to: 0.02 }, 12);
    blue.globalCompositeOperation = 'destination-out';
    blue.fillStyle = '#000';
    for (let i = 0; i < s.stars.length; i++) {
      const [x, y, k] = s.stars[i];
      const tw = 0.55 + 0.45 * per(t, 3 + (i % 7), i * 1.7);
      blue.beginPath();
      blue.arc(x, y, (0.7 + k * 1.7) * tw, 0, TAU);
      blue.fill();
    }
    blue.globalCompositeOperation = 'source-over';
    // Moon, with a soft halo
    const moon: Pt = [300, 130];
    const md = new Path2D();
    md.arc(moon[0], moon[1], 62, 0, TAU);
    r.gradient(gold, null, { kind: 'radial', cx: moon[0], cy: moon[1], r0: 60, r1: 200, from: 0.32, to: 0 }, 8);
    blue.globalCompositeOperation = 'destination-out';
    r.gradient(blue, null, { kind: 'radial', cx: moon[0], cy: moon[1], r0: 60, r1: 220, from: 0.45, to: 0 }, 8);
    blue.globalCompositeOperation = 'source-over';
    paintPart(r, { p: md, m: [0, 0, 1] });
    r.gradient(pink, md, { kind: 'radial', cx: moon[0] + 22, cy: moon[1] + 18, r0: 0, r1: 80, from: 0.02, to: 0.4 }, 7);
    for (const [ax, ay, ar] of [[-18, -16, 13], [16, 8, 17], [-8, 26, 9], [24, -24, 7]] as [number, number, number][]) {
      blue.fillStyle = r.tone(blue, 0.18);
      blue.beginPath();
      blue.arc(moon[0] + ax, moon[1] + ay, ar, 0, TAU);
      blue.fill();
    }

    /* ----- far tree line ----- */
    let c = layerCam(P_FAR);
    tiled(r, s.far, PER_FAR, c.X, c.half, -60, PER_FAR + 60);

    /* ----- houses ----- */
    c = layerCam(P_HOUSE);
    tiled(r, s.house, PER_HOUSE, c.X, c.half, -100, PER_HOUSE + 140);
    // TV glow in a few windows, porch lamps
    for (let i = 0; i < s.tv.length; i++) {
      const [wx, wy, ww, wh] = s.tv[i];
      const x = near(wx, PER_HOUSE, c.X);
      if (Math.abs(x - c.X) > c.half) continue;
      const k = 0.5 + 0.5 * per(t, 23 + i * 6, i);
      const p = new Path2D();
      p.rect(x, wy, ww / 2 - 1.5, wh * 0.48 - 1.5);
      p.rect(x + ww / 2 + 1.5, wy, ww / 2 - 1.5, wh * 0.48 - 1.5);
      p.rect(x, wy + wh * 0.48 + 1.5, ww / 2 - 1.5, wh * 0.52 - 1.5);
      p.rect(x + ww / 2 + 1.5, wy + wh * 0.48 + 1.5, ww / 2 - 1.5, wh * 0.52 - 1.5);
      paintPart(r, { p, m: [0.35 + 0.4 * k, 0.15 + 0.2 * (1 - k), 0.25 * (1 - k)] });
    }
    for (let i = 0; i < s.porch.length; i++) {
      const [px, py] = s.porch[i];
      const x = near(px, PER_HOUSE, c.X);
      if (Math.abs(x - c.X) > c.half + 200) continue;
      const fl = 0.92 + 0.08 * per(t, 41 + i * 4, i);
      const halo = new Path2D();
      halo.arc(x, py, 120, 0, TAU);
      blue.globalCompositeOperation = 'destination-out';
      r.gradient(blue, halo, { kind: 'radial', cx: x, cy: py, r0: 6, r1: 120, from: 0.6 * fl, to: 0 }, 7);
      blue.globalCompositeOperation = 'source-over';
      r.gradient(gold, halo, { kind: 'radial', cx: x, cy: py, r0: 6, r1: 120, from: 0.7 * fl, to: 0 }, 7);
      const lamp = new Path2D();
      lamp.rect(x - 5, py - 9, 10, 15);
      paintPart(r, { p: lamp, m: [0, 0.15, 1] });
    }

    /* ----- the street ----- */
    c = layerCam(1);
    tiled(r, s.main, L, c.X, c.half, -40, L + 40);
    // Sign text
    {
      const sx = near(LAMPS[0], L, cx);
      if (Math.abs(sx - cx) < c.half) {
        for (const l of r.layers) {
          l.save();
          l.globalCompositeOperation = 'destination-out';
          l.fillStyle = '#000';
          l.font = `400 19px ${DISPLAY}`;
          l.textBaseline = 'middle';
          spacedText(l, 'LUNA LN', sx + 81, 336, 3);
          l.restore();
        }
        blue.globalCompositeOperation = 'destination-out';
        blue.strokeStyle = '#000';
        const inset = new Path2D();
        inset.rect(sx + 9, 322, 144, 26);
        blue.lineWidth = 1.6;
        blue.stroke(inset);
        blue.globalCompositeOperation = 'source-over';
      }
    }
    // Lamp light: halos, feathered cones, pools, then the lit globes
    for (let i = 0; i < LAMPS.length; i++) {
      const lx = near(LAMPS[i], L, cx);
      if (Math.abs(lx - cx) > c.half + 300) continue;
      const fl = 0.95 + 0.05 * per(t, 47 + i * 5, i);
      for (const [spread, kd] of [[290, 0.12], [210, 0.16], [140, 0.2]] as [number, number][]) {
        const cone = new Path2D();
        polyPath([[lx - 12, 190], [lx + 12, 190], [lx + spread, CURB_TOP], [lx - spread, CURB_TOP]], true, cone);
        blue.globalCompositeOperation = 'destination-out';
        r.gradient(blue, cone, { kind: 'radial', cx: lx, cy: 175, r0: 30, r1: 650, from: kd * 2.6 * fl, to: kd * 0.3 }, 7);
        blue.globalCompositeOperation = 'source-over';
        r.gradient(gold, cone, { kind: 'radial', cx: lx, cy: 175, r0: 30, r1: 650, from: kd * 2 * fl, to: kd * 0.2 }, 7);
      }
      const halo = new Path2D();
      halo.arc(lx, 172, 150, 0, TAU);
      blue.globalCompositeOperation = 'destination-out';
      r.gradient(blue, halo, { kind: 'radial', cx: lx, cy: 172, r0: 20, r1: 150, from: 0.7 * fl, to: 0 }, 8);
      blue.globalCompositeOperation = 'source-over';
      r.gradient(gold, halo, { kind: 'radial', cx: lx, cy: 172, r0: 20, r1: 150, from: 0.75 * fl, to: 0 }, 8);
      const pool = new Path2D();
      pool.ellipse(lx, 756, 260, 50, 0, 0, TAU);
      blue.globalCompositeOperation = 'destination-out';
      r.gradient(blue, pool, { kind: 'radial', cx: lx, cy: 756, r0: 0, r1: 260, from: 0.55 * fl, to: 0.05 }, 7);
      blue.globalCompositeOperation = 'source-over';
      r.gradient(gold, pool, { kind: 'radial', cx: lx, cy: 756, r0: 0, r1: 260, from: 0.5 * fl, to: 0.08 }, 7);
      const globe = new Path2D();
      globe.ellipse(lx, 171, 20, 31, 0, 0, TAU);
      paintPart(r, { p: globe, m: [0, 0.1, 1] });
      const core = new Path2D();
      core.ellipse(lx - 2, 166, 9, 17, 0, 0, TAU);
      gold.globalCompositeOperation = 'destination-out';
      gold.fillStyle = r.tone(gold, 0.8);
      gold.fill(core);
      gold.globalCompositeOperation = 'source-over';
      const ribs = new Path2D();
      ribs.moveTo(lx, 142);
      ribs.lineTo(lx, 201);
      ribs.moveTo(lx - 12, 148);
      ribs.quadraticCurveTo(lx - 22, 172, lx - 12, 196);
      ribs.moveTo(lx + 12, 148);
      ribs.quadraticCurveTo(lx + 22, 172, lx + 12, 196);
      blue.lineWidth = 1.6;
      blue.strokeStyle = r.tone(blue, 0.7);
      blue.stroke(ribs);
    }

    /* ----- the cat on the fence ----- */
    const catX = near(CAT_X, L, cx);
    const dogHead = XL + 60 * DOG_S;
    const lk = clamp((near(dogHead, L, catX) - catX) / 300, -1, 1);
    const wide = win(t, 5.9, 6.4, 7.6, 8.3);
    if (Math.abs(catX - cx) < c.half + 100) {
      const flick = 3 * per(t, 9) + 4 * wide * per(t, 27);
      push(r, catX, 516, CAT_S);
      for (const part of catParts(lk, wide, flick)) paintPart(r, part);
      pop(r);
      if (wide > 0.05) {
        const hc: Pt = [catX + (-3 + lk * 1.6) * CAT_S, 516 + (-31 + (1 - Math.abs(lk)) * 1.6) * CAT_S];
        const glow = new Path2D();
        glow.arc(hc[0], hc[1], 70, 0, TAU);
        r.gradient(gold, glow, { kind: 'radial', cx: hc[0], cy: hc[1], r0: 14, r1: 70, from: 0.35 * wide, to: 0 }, 6);
      }
    }

    /* ----- fireflies ----- */
    const drawFly = (x: number, y: number, b: number) => {
      const g = new Path2D();
      g.arc(x, y, 24, 0, TAU);
      blue.globalCompositeOperation = 'destination-out';
      blue.fillStyle = r.tone(blue, 0.25 * b);
      blue.fill(g);
      gold.fillStyle = r.tone(gold, 0.2 * b);
      gold.fill(g);
      const g2 = new Path2D();
      g2.arc(x, y, 12, 0, TAU);
      blue.fillStyle = r.tone(blue, 0.55 * b);
      blue.fill(g2);
      gold.fillStyle = r.tone(gold, 0.5 * b);
      gold.fill(g2);
      const core = new Path2D();
      core.arc(x, y, 2.4 + 2 * b, 0, TAU);
      blue.fillStyle = '#000';
      blue.fill(core);
      pink.globalCompositeOperation = 'destination-out';
      pink.fillStyle = '#000';
      pink.fill(core);
      pink.globalCompositeOperation = 'source-over';
      blue.globalCompositeOperation = 'source-over';
      gold.fillStyle = '#000';
      gold.fill(core);
    };
    for (let i = 0; i < s.flies.length; i++) {
      const f = s.flies[i];
      const fx = near(f.x, L, cx);
      if (Math.abs(fx - cx) > c.half) continue;
      const b = Math.max(0, Math.sin(om(f.nb) * t + f.p3)) ** 2.2;
      if (b < 0.04) continue;
      drawFly(fx + f.ax * Math.sin(om(f.nx) * t + f.p1), f.y + f.ay * Math.sin(om(f.ny) * t + f.p2), b);
    }

    /* ----- the owner ----- */
    const look = 0.17 * win(t, 2.7, 3.1, 3.9, 4.3) + 0.2 * win(t, 6.3, 6.8, 7.8, 8.3) - 0.14 * win(t, 11.6, 12.1, 13.0, 13.5) + 0.14 * win(t, 15.2, 15.6, 16.2, 16.6);
    const owner = ownerParts(XO, t, look);
    const ol = lampLight(XO);
    push(r, XO, OWNER_GROUND, OWNER_S);
    rim(r, owner.parts, ol.dir * 1.6, -1.3, ol.k * 0.95);
    for (const part of owner.parts) paintPart(r, part);
    pop(r);

    /* ----- Luna ----- */
    const pose = dogPose(t);
    const dog = dogParts(XL, pose);
    const dl = lampLight(XL);
    const dogY = DOG_GROUND - G_D * DOG_S;
    push(r, XL, dogY, DOG_S);
    rim(r, dog.parts, dl.dir * 1.4, -1.2, dl.k * 0.95);
    for (const part of dog.parts) paintPart(r, part);
    // Eye: a bright catchlight, or a smug closed curve
    const [ex, ey] = dog.eye;
    for (const l of r.layers) {
      l.globalCompositeOperation = 'destination-out';
      l.fillStyle = '#000';
      l.strokeStyle = '#000';
    }
    if (dog.shut < 0.5) {
      blue.beginPath();
      blue.arc(ex, ey, 2.4, 0, TAU);
      blue.fill();
      pink.beginPath();
      pink.arc(ex, ey, 2.4, 0, TAU);
      pink.fill();
    } else {
      blue.lineWidth = 1.3;
      blue.lineCap = 'round';
      blue.beginPath();
      blue.arc(ex, ey - 1.6, 3, 0.35, Math.PI - 0.35);
      blue.stroke();
    }
    for (const l of r.layers) l.globalCompositeOperation = 'source-over';
    if (dog.shut < 0.5) {
      gold.fillStyle = '#000';
      gold.beginPath();
      gold.arc(ex + 0.5, ey + 0.3, 1.2, 0, TAU);
      gold.fill();
    }
    pop(r);

    /* ----- the leash ----- */
    const hand: Pt = [XO + owner.hand[0] * OWNER_S, OWNER_GROUND + owner.hand[1] * OWNER_S];
    const col: Pt = [XL + dog.collar[0] * DOG_S, dogY + dog.collar[1] * DOG_S];
    const sag = 34 + 12 * per(t, 3) + 6 * per(t, 8, 1) - 18 * win(t, 5.5, 6.2, 7.7, 8.4);
    const leash = new Path2D();
    leash.moveTo(hand[0], hand[1]);
    leash.quadraticCurveTo((hand[0] + col[0]) / 2, Math.max(hand[1], col[1]) + sag, col[0], col[1]);
    blue.globalCompositeOperation = 'destination-out';
    blue.lineWidth = 4.2;
    blue.strokeStyle = '#000';
    blue.stroke(leash);
    blue.globalCompositeOperation = 'source-over';
    for (const [l, d] of [[pink, 1], [gold, 0.75]] as const) {
      l.lineWidth = 3.6;
      l.lineCap = 'round';
      l.strokeStyle = r.tone(l, d);
      l.stroke(leash);
    }
    // Loop of leash around the fist
    const loop = new Path2D();
    loop.ellipse(hand[0] - 3, hand[1] + 8, 5, 9, 0.3, 0, TAU);
    pink.lineWidth = 3;
    pink.strokeStyle = '#000';
    pink.stroke(loop);

    /* ----- the firefly Luna watches ----- */
    const watch = win(t, 10.9, 11.5, 13.3, 13.9);
    if (watch > 0.02) {
      const fx = XL + 150 + 40 * per(t, 1, 0.5) + 14 * per(t, 5);
      const fy = 560 - 60 * watch + 18 * per(t, 7, 1);
      const b = watch * (0.65 + 0.35 * Math.max(0, per(t, 16)));
      drawFly(fx, fy, b);
      const ring = new Path2D();
      ring.arc(fx, fy, 42, 0, TAU);
      r.gradient(gold, ring, { kind: 'radial', cx: fx, cy: fy, r0: 10, r1: 42, from: 0.4 * b, to: 0 }, 5);
    }

    /* ----- foreground ----- */
    c = layerCam(P_FORE);
    tiled(r, s.fore, PER_FORE, c.X, c.half, 900, 5500);
  },
};
