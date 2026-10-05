/**
 * Ink wash (sumi-e) helpers shared by the Ink wash series (direct mode films).
 *
 * The look: sumi ink on rice paper. Brush strokes with pressure (a pressed start, a long taper,
 * the bristles splitting into dry streaks at the end), wet blooms that spread and feather, grey
 * washes laid in layers for distance so mountains dissolve into mist, one vermilion accent, and
 * a red seal chop for the title. Strokes paint themselves on: every brush helper takes a
 * progress p (0..1) along the stroke, so the motion language is the brush itself.
 * Everything is deterministic (seeded) and static art is baked where it can be.
 */
import type { Ctx, Riso } from '../riso/engine';
import { SERIF, TAU, clamp, hash, lerp, noise1, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const SUMI = {
  paper: '#ece4d1',
  paperHi: '#f4efe3',
  ink: '#171513',
  verm: '#c23a22',
  vermDeep: '#9c2a17',
  vermSoft: '#d9694a',
} as const;

/** Sumi at a wash strength (0 = water, 1 = full black) */
export const ink = (a: number) => `rgba(23,21,19,${clamp(a).toFixed(3)})`;
/** Vermilion at an alpha */
export const verm = (a: number) => `rgba(194,58,34,${clamp(a).toFixed(3)})`;
/** Paper colour at an alpha, for mist and reserved highlights */
export const paperA = (a: number) => `rgba(236,228,209,${clamp(a).toFixed(3)})`;

/* ---------- timing ---------- */

/** Piecewise value through [time, value] keys, eased per span */
export const keys = (t: number, ks: [number, number][], fn: (k: number) => number = (k) => k * k * (3 - 2 * k)) => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const k = fn(clamp((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
      return lerp(ks[i - 1][1], ks[i][1], k);
    }
  }
  return ks[ks.length - 1][1];
};

/* ---------- camera ---------- */

export interface Cam {
  x: number;
  y: number;
  z: number;
  rot?: number;
}

/** Camera for a depth layer: p = 1 moves with the camera, p -> 0 barely moves (parallax) */
export const layerView = (C: Cam, p: number): Cam => ({
  x: 800 + (C.x - 800) * p,
  y: 450 + (C.y - 450) * p,
  z: Math.exp(Math.log(C.z) * p),
  rot: (C.rot ?? 0) * p,
});

export const applyCam = (r: Riso, v: Cam) => r.camera(v.x, v.y, v.z, v.rot ?? 0);

/** Screen position of a world point seen through a layer view */
export const toScreen = (v: Cam, x: number, y: number): Pt => {
  const dx = (x - v.x) * v.z;
  const dy = (y - v.y) * v.z;
  const c = Math.cos(v.rot ?? 0);
  const s = Math.sin(v.rot ?? 0);
  return [800 + dx * c - dy * s, 450 + dx * s + dy * c];
};

/* ---------- curves ---------- */

/** Open Catmull-Rom curve through control points, sampled per segment */
export const spline = (ctrl: Pt[], per = 10): Pt[] => {
  const n = ctrl.length;
  if (n < 3) return ctrl.slice();
  const out: Pt[] = [];
  const g = (i: number) => ctrl[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[n - 1]);
  return out;
};

/** Transform points: rotate by a about the origin, scale, then move */
export const place = (pts: Pt[], x: number, y: number, a = 0, s = 1): Pt[] => {
  const c = Math.cos(a) * s;
  const si = Math.sin(a) * s;
  return pts.map(([px, py]) => [x + px * c - py * si, y + px * si + py * c]);
};

/* ---------- the brush ---------- */

export interface Brush {
  /** Width at full pressure */
  w: number;
  /** Painted progress along the stroke, 0..1 */
  p?: number;
  /** Start of the visible part (for strokes that lift off the paper), 0..1 */
  from?: number;
  /** Fraction of the length the brush takes to press down */
  inT?: number;
  /** Fraction of the length over which it lifts off */
  outT?: number;
  /** 0..1: how much the end of the stroke splits into dry bristle streaks */
  dry?: number;
  bristles?: number;
  seed?: number;
  /** Extra pressure profile over u (0..1) */
  press?: (u: number) => number;
  /** Slow width wander (pressure) */
  jitter?: number;
  /** Fine edge roughness where the paper drags the hairs */
  rough?: number;
  /** Sample spacing in the stroke's own units */
  step?: number;
  /** Minimum relative width at the taper */
  minW?: number;
  /** Width of the press at the very start relative to full */
  startW?: number;
}

interface Samp {
  n: number;
  L: number;
  x: Float64Array;
  y: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  hw: Float64Array;
}

const sampleStroke = (pts: Pt[], o: Brush): Samp | null => {
  if (pts.length < 2) return null;
  const cum = [0];
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(L);
  }
  if (L < 0.3) return null;
  const step = o.step ?? 3;
  const n = Math.max(3, Math.min(1400, Math.ceil(L / step) + 1));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const hw = new Float64Array(n);
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * L;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const f = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    x[i] = lerp(pts[j - 1][0], pts[j][0], f);
    y[i] = lerp(pts[j - 1][1], pts[j][1], f);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = x[b] - x[a];
    let ty = y[b] - y[a];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    nx[i] = -ty;
    ny[i] = tx;
  }
  const seed = o.seed ?? 1;
  const jit = o.jitter ?? 0.12;
  const inT = o.inT ?? 0.07;
  const outT = o.outT ?? 0.3;
  const sw = o.startW ?? 0.55;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let k = 1;
    if (u < inT) k *= sw + (1 - sw) * Math.sin(((u / inT) * Math.PI) / 2);
    if (u > 1 - outT) k *= Math.pow(Math.max(0, (1 - u) / outT), 0.7);
    if (o.press) k *= o.press(u);
    k *= 1 + jit * noise1((u * L) / 70, seed);
    hw[i] = 0.5 * o.w * Math.max(o.minW ?? 0, k);
  }
  return { n, L, x, y, nx, ny, hw };
};

/** Polygon along the samples between fractional indices a..b, at an offset (in half-widths) */
const ribbon = (
  path: Path2D,
  s: Samp,
  a: number,
  b: number,
  off: number,
  sc: number,
  rough: number,
  seed: number,
  capA: boolean,
  capB: boolean
) => {
  if (b - a < 0.05) return;
  const at = (fi: number) => {
    const i = Math.max(0, Math.min(s.n - 2, Math.floor(fi)));
    const f = Math.min(1, fi - i);
    return {
      x: lerp(s.x[i], s.x[i + 1], f),
      y: lerp(s.y[i], s.y[i + 1], f),
      nx: lerp(s.nx[i], s.nx[i + 1], f),
      ny: lerp(s.ny[i], s.ny[i + 1], f),
      hw: lerp(s.hw[i], s.hw[i + 1], f),
    };
  };
  const idx: number[] = [a];
  for (let i = Math.floor(a) + 1; i < b; i++) idx.push(i);
  idx.push(b);
  const L: Pt[] = [];
  const R: Pt[] = [];
  const C: { x: number; y: number; nx: number; ny: number; hw: number }[] = [];
  for (const fi of idx) {
    const q = at(fi);
    C.push(q);
    const e1 = 1 + rough * noise1(fi * 0.9, seed + 3);
    const e2 = 1 + rough * noise1(fi * 0.9, seed + 9);
    const c = off * q.hw;
    const w = sc * q.hw;
    L.push([q.x + q.nx * (c + w * e1), q.y + q.ny * (c + w * e1)]);
    R.push([q.x + q.nx * (c - w * e2), q.y + q.ny * (c - w * e2)]);
  }
  path.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) path.lineTo(L[i][0], L[i][1]);
  const last = C[C.length - 1];
  if (capB) {
    // round lift: a half disc ahead of the last sample
    const cx = last.x + last.nx * off * last.hw;
    const cy = last.y + last.ny * off * last.hw;
    const w = sc * last.hw;
    const tx = last.ny;
    const ty = -last.nx;
    for (let k = 1; k < 6; k++) {
      const ang = (k / 6) * Math.PI;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      path.lineTo(cx + (last.nx * cs + tx * sn) * w, cy + (last.ny * cs + ty * sn) * w);
    }
  }
  for (let i = R.length - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]);
  if (capA) {
    const first = C[0];
    const cx = first.x + first.nx * off * first.hw;
    const cy = first.y + first.ny * off * first.hw;
    const w = sc * first.hw * 1.05;
    const tx = -first.ny;
    const ty = first.nx;
    for (let k = 1; k < 6; k++) {
      const ang = (k / 6) * Math.PI;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      path.lineTo(cx - (first.nx * cs - tx * sn) * w, cy - (first.ny * cs - ty * sn) * w);
    }
  }
  path.closePath();
};

/**
 * A brush stroke along a centreline as a fillable path: pressure taper in and out, edge drag,
 * and (dry > 0) the body splitting into bristle streaks toward the end. While p < 1 the stroke
 * ends in the round, pressed head of the brush.
 */
export function strokePath(pts: Pt[], o: Brush, path: Path2D = new Path2D()): Path2D {
  const p = clamp(o.p ?? 1);
  const from = clamp(o.from ?? 0);
  if (p <= from + 1e-4) return path;
  const s = sampleStroke(pts, o);
  if (!s) return path;
  const seed = o.seed ?? 1;
  const rough = o.rough ?? 0.06;
  const iA = from * (s.n - 1);
  const iB = p * (s.n - 1);
  const dry = clamp(o.dry ?? 0);
  const dryStart = dry > 0 ? 1 - 0.62 * dry : 1;
  const bodyEnd = Math.min(iB, dryStart * (s.n - 1));
  if (bodyEnd > iA) ribbon(path, s, iA, bodyEnd, 0, 1, rough, seed, true, true);
  if (dry > 0 && iB > dryStart * (s.n - 1) - 2) {
    const B = o.bristles ?? Math.round(clamp(o.w / 2.2, 5, 15));
    const start = Math.max(iA, dryStart * (s.n - 1) - Math.max(2, 0.03 * s.n));
    for (let b = 0; b < B; b++) {
      const off = (((b + 0.5) / B) * 2 - 1) * 0.86 + (hash(seed * 13 + b) - 0.5) * 0.14;
      const bw = (1.25 + hash(b * 7 + seed) * 0.6) / B;
      const freq = s.L / (16 + hash(b * 3 + seed * 5) * 34);
      let run = -1;
      const i0 = Math.ceil(start);
      const i1 = Math.floor(iB);
      for (let i = i0; i <= i1; i++) {
        const u = i / (s.n - 1);
        const d = clamp((u - dryStart) / (1 - dryStart));
        const thr = -1.05 + 2.1 * Math.pow(d, 0.85) * (0.5 + 0.5 * dry) + Math.abs(off) * 0.45 * d;
        const on = noise1(u * freq + b * 17.3, seed + b * 2) > thr;
        if (on && run < 0) run = i;
        if ((!on || i === i1) && run >= 0) {
          const end = on ? i : i - 1;
          if (end - run >= 1) ribbon(path, s, run, end, off, bw, rough * 0.6, seed + b, false, false);
          run = -1;
        }
      }
    }
  }
  return path;
}

/** Paint a stroke now */
export const stroke = (c: Ctx, pts: Pt[], o: Brush, color: string) => {
  const p = strokePath(pts, o);
  c.fillStyle = color;
  c.fill(p);
};

/** Points along a straight line (with a little hand wobble) */
export const linePts = (a: Pt, b: Pt, n = 12, wob = 0, seed = 1): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const w = wob * noise1(k * 4, seed) * Math.sin(k * Math.PI);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [lerp(a[0], b[0], k) - (dy / l) * w, lerp(a[1], b[1], k) + (dx / l) * w];
  });

/* ---------- wet ink: blooms, feathering, splatter ---------- */

export interface BloomOpts {
  seed?: number;
  /** rgb triple */
  rgb?: [number, number, number];
  alpha?: number;
  /** strength of the darker tide line where the wet edge dried */
  ring?: number;
  /** how far the edge wanders */
  irr?: number;
  /** capillary feathers at the edge */
  feather?: number;
  sy?: number;
}

const rgbA = (rgb: [number, number, number], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a).toFixed(3)})`;

/** Closed wandering outline for a wet spot */
export const blotPts = (x: number, y: number, R: number, seed: number, irr = 0.14, n = 56, sy = 1): Pt[] => {
  const ph = [hash(seed) * TAU, hash(seed + 1) * TAU, hash(seed + 2) * TAU, hash(seed + 3) * TAU];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const k = 1 + irr * (0.55 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2]) + 0.12 * Math.sin(17 * a + ph[3]));
    return [x + Math.cos(a) * R * k, y + Math.sin(a) * R * k * sy];
  });
};

const closedPath = (pts: Pt[], path: Path2D = new Path2D()) => {
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
  return path;
};

/**
 * A wet bloom spreading into the paper: a soft pale centre, a darker tide line at the edge,
 * a faint halo and capillary feathers. k (0..1) is how far it has spread.
 */
export function bloom(c: Ctx, x: number, y: number, R: number, k: number, o: BloomOpts = {}) {
  if (k <= 0.001 || R <= 0) return;
  const seed = o.seed ?? 1;
  const rgb = o.rgb ?? [23, 21, 19];
  const a = o.alpha ?? 0.5;
  const rr = R * k;
  const irr = (o.irr ?? 0.14) * (0.35 + 0.65 * k);
  const sy = o.sy ?? 1;
  const pts = blotPts(x, y, rr, seed, irr, 64, sy);
  const body = closedPath(pts);
  // halo where water ran ahead of the pigment
  const halo = closedPath(blotPts(x, y, rr * 1.08 + 3, seed + 5, irr * 1.2, 48, sy));
  c.fillStyle = rgbA(rgb, a * 0.12);
  c.fill(halo);
  const g = c.createRadialGradient(x, y, 0, x, y, rr * 1.12);
  g.addColorStop(0, rgbA(rgb, a * 0.82));
  g.addColorStop(0.55, rgbA(rgb, a * 0.62));
  g.addColorStop(0.86, rgbA(rgb, a * 0.72));
  g.addColorStop(1, rgbA(rgb, a * 0.95));
  c.fillStyle = g;
  c.fill(body);
  const ring = o.ring ?? 0.5;
  if (ring > 0) {
    c.strokeStyle = rgbA(rgb, a * ring);
    c.lineWidth = Math.max(0.6, rr * 0.035);
    c.stroke(body);
  }
  const fe = o.feather ?? 1;
  if (fe > 0) {
    const f = new Path2D();
    const m = 30;
    for (let i = 0; i < m; i++) {
      const p = pts[Math.floor((i / m) * pts.length)];
      const ang = Math.atan2((p[1] - y) / sy, p[0] - x) + (hash(seed * 7 + i) - 0.5) * 0.5;
      const len = rr * (0.04 + 0.12 * hash(seed + i * 3)) * fe;
      const w = Math.max(0.4, rr * 0.008);
      f.moveTo(p[0] - Math.sin(ang) * w, p[1] + Math.cos(ang) * w);
      f.lineTo(p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len);
      f.lineTo(p[0] + Math.sin(ang) * w, p[1] - Math.cos(ang) * w);
      f.closePath();
    }
    c.fillStyle = rgbA(rgb, a * 0.45);
    c.fill(f);
  }
}

/** Ink droplets thrown from a point along a direction; k (0..1) is how far they flew */
export function splatterPath(
  x: number,
  y: number,
  ang: number,
  spread: number,
  dist: number,
  n: number,
  size: number,
  k: number,
  seed = 1,
  path: Path2D = new Path2D()
) {
  if (k <= 0) return path;
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed * 31 + i);
    const h2 = hash(seed * 17 + i * 3);
    const h3 = hash(seed * 7 + i * 11);
    const a = ang + (h1 - 0.5) * spread;
    const d = dist * (0.25 + 0.75 * h2) * k;
    const r = size * (0.25 + h3 * h3 * 1.1);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    const stretch = 1 + (1 - k) * 2.5 + h2;
    path.moveTo(px + Math.cos(a) * r * stretch, py + Math.sin(a) * r * stretch);
    path.ellipse(px, py, r * stretch, r, a, 0, TAU);
    // a satellite droplet
    if (h3 > 0.55) {
      const sx = px - Math.cos(a) * r * 3.2;
      const syy = py - Math.sin(a) * r * 3.2;
      path.moveTo(sx + r * 0.4, syy);
      path.arc(sx, syy, r * 0.4, 0, TAU);
    }
  }
  return path;
}

/* ---------- washes and mountains ---------- */

export interface Plate {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bake static art for a logical rect at the press scale times res */
export const bake = (r: Riso, x: number, y: number, w: number, h: number, res: number, draw: (g: Ctx) => void): Plate => {
  const s = Math.max(0.25, r.scale * res);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * s));
  cv.height = Math.max(1, Math.round(h * s));
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is unavailable');
  g.setTransform(s, 0, 0, s, -x * s, -y * s);
  draw(g);
  return { cv, x, y, w, h };
};

export const drawPlate = (c: Ctx, pl: Plate) => c.drawImage(pl.cv, pl.x, pl.y, pl.w, pl.h);

/** Ridge contour points */
export const ridgeLine = (ridge: (x: number) => number, x0: number, x1: number, step = 6): Pt[] => {
  const out: Pt[] = [];
  for (let x = x0; x <= x1; x += step) out.push([x, ridge(x)]);
  return out;
};

export interface MountainOpts {
  /** Wash strength at the ridge */
  alpha: number;
  /** How far below the ridge the wash fades out into mist */
  fade: number;
  seed: number;
  /** Texture strokes (cun) per 100 px */
  cun?: number;
  /** Moss dots on the peaks */
  dots?: number;
  /** Softening blur in px */
  blur?: number;
  /** Strength of the dark texture strokes */
  cunAlpha?: number;
}

/**
 * A mountain range painted the sumi way: the wash is darkest along the ridge and fades down the
 * slopes into mist; slope strokes and moss dots texture the rock. Paint into a bake.
 */
export function mountain(g: Ctx, ridge: (x: number) => number, x0: number, x1: number, o: MountainOpts) {
  // nested washes that all start at the ridge and end at different depths: the overlap is
  // darkest along the ridge and thins smoothly down the slope, with no seams
  const K = 40;
  const la = 1 - Math.pow(1 - Math.min(0.95, o.alpha), 1 / K);
  g.save();
  if (o.blur) g.filter = `blur(${o.blur}px)`;
  const top: Pt[] = [];
  for (let x = x0; x <= x1; x += 6) top.push([x, ridge(x)]);
  g.fillStyle = ink(la);
  for (let k = 0; k < K; k++) {
    const depth = o.fade * Math.pow(1 - k / K, 1.5) + 2;
    const p = new Path2D();
    p.moveTo(top[0][0], top[0][1]);
    for (const q of top) p.lineTo(q[0], q[1]);
    for (let i = top.length - 1; i >= 0; i--) p.lineTo(top[i][0], top[i][1] + depth * (0.85 + 0.3 * noise1(top[i][0] / 160 + k * 0.05, o.seed)));
    p.closePath();
    g.fill(p);
  }
  // pooled darker patches just under the ridge
  const pool = new Path2D();
  for (let x = x0; x < x1; x += 50) {
    if (hash(x * 0.37 + o.seed) < 0.45) continue;
    const w = 30 + hash(x + o.seed) * 70;
    pool.moveTo(x - w, ridge(x - w) + 2);
    for (let s = -w; s <= w; s += 8) pool.lineTo(x + s, ridge(x + s) + 1);
    for (let s = w; s >= -w; s -= 8) pool.lineTo(x + s, ridge(x + s) + (1 - Math.abs(s / w)) * (20 + hash(x) * 30) + 4);
    pool.closePath();
  }
  g.fillStyle = ink(o.alpha * 0.35);
  g.fill(pool);
  g.restore();

  // slope strokes: short dry strokes running down the fall line
  const ca = o.cunAlpha ?? o.alpha * 1.4;
  const cun = new Path2D();
  const per = o.cun ?? 2.5;
  const N = Math.floor(((x1 - x0) / 100) * per);
  for (let i = 0; i < N; i++) {
    const x = x0 + hash(o.seed * 11 + i) * (x1 - x0);
    const slope = (ridge(x + 4) - ridge(x - 4)) / 8;
    const y = ridge(x) + 4 + hash(o.seed + i * 7) * o.fade * 0.32;
    const dir = Math.atan2(1, -slope * 1.4) + (hash(i * 3 + o.seed) - 0.5) * 0.4;
    const len = 18 + hash(i * 5 + o.seed) * 46;
    const pts = spline([[x, y], [x + Math.cos(dir) * len * 0.5 + 3, y + Math.sin(dir) * len * 0.5], [x + Math.cos(dir) * len, y + Math.sin(dir) * len]], 5);
    strokePath(pts, { w: 2.2 + hash(i + o.seed * 3) * 3.5, dry: 0.8, outT: 0.6, seed: i + o.seed, step: 2 }, cun);
  }
  g.fillStyle = ink(ca);
  g.fill(cun);
  // moss dots on the peaks
  const dots = new Path2D();
  const nd = o.dots ?? 0;
  for (let x = x0 + 10; x < x1 - 10 && nd > 0; x += 4) {
    const y = ridge(x);
    if (!(y < ridge(x - 10) && y < ridge(x + 10))) continue;
    if (hash(x * 1.3 + o.seed) > 0.5) continue;
    const m = Math.round(nd * (0.5 + hash(x)));
    for (let j = 0; j < m; j++) {
      const dx = (hash(x + j * 3.1) - 0.5) * 36;
      const dy = ridge(x + dx) + 1 + hash(x * 2 + j) * 8;
      const rr = 1.6 + hash(x + j) * 2.6;
      dots.moveTo(x + dx + rr * 1.3, dy);
      dots.ellipse(x + dx, dy, rr * 1.3, rr, 0.3, 0, TAU);
    }
  }
  g.fillStyle = ink(Math.min(0.9, o.alpha * 2.6));
  g.fill(dots);
}

/** Soft mist band in the current space (paper colour, transparent at both edges) */
export const mist = (c: Ctx, y0: number, y1: number, a: number, x0 = -600, x1 = 2200) => {
  if (a <= 0) return;
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, paperA(0));
  g.addColorStop(0.45, paperA(a));
  g.addColorStop(0.6, paperA(a));
  g.addColorStop(1, paperA(0));
  c.fillStyle = g;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
};

/** Wavy-edged region sweeping left to right across a rect, for washes being laid in */
export const sweepPath = (x0: number, y0: number, x1: number, y1: number, k: number, seed = 1, dir = 1): Path2D => {
  const p = new Path2D();
  const X = lerp(x0 - 120, x1 + 120, clamp(k));
  const pts: Pt[] = [];
  for (let y = y0; y <= y1 + 20; y += 20) pts.push([X + 40 * Math.sin(y / 47 + seed) + 22 * Math.sin(y / 17 + seed * 2), y]);
  if (dir > 0) {
    p.moveTo(x0 - 200, y0);
    for (const q of pts) p.lineTo(q[0], q[1]);
    p.lineTo(x0 - 200, y1 + 20);
  } else {
    p.moveTo(x1 + 200, y0);
    for (const q of pts) p.lineTo(x0 + x1 - q[0], q[1]);
    p.lineTo(x1 + 200, y1 + 20);
  }
  p.closePath();
  return p;
};

/* ---------- enso ---------- */

/** A hand-drawn circle: slightly uneven radius, ending a little inside where the brush lifts */
export const ensoPts = (cx: number, cy: number, R: number, a0 = 2.1, sweep = TAU * 0.92, seed = 3, n = 140): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const a = a0 + sweep * u;
    const rr = R * (1 + 0.025 * noise1(u * 5, seed) - 0.035 * u * u);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

/** Paint an enso: a pressed start, a full belly and a long dry tail */
export const enso = (c: Ctx, cx: number, cy: number, R: number, p: number, color: string = SUMI.ink, seed = 3, a0 = 2.1) => {
  if (p <= 0) return;
  const pts = ensoPts(cx, cy, R, a0, TAU * 0.93, seed);
  const w = R * 0.15;
  stroke(c, pts, {
    w,
    p,
    inT: 0.05,
    outT: 0.5,
    dry: 0.85,
    bristles: 16,
    seed,
    step: 2.5,
    startW: 0.8,
    jitter: 0.18,
    press: (u) => 1.1 - 0.25 * u + 0.12 * Math.sin(u * 9),
  }, color);
};

/* ---------- seal and title ---------- */

/** Bake a vermilion seal chop: a rough square, uneven ink, the mark carved out of it (bai-wen) */
export function makeSeal(r: Riso, size: number, carve: (g: Ctx, s: number) => void, seed = 5): HTMLCanvasElement {
  const pad = size * 0.12;
  const W = size + pad * 2;
  const pl = bake(r, -W / 2, -W / 2, W, W, 2, (g) => {
    const h = size / 2;
    const pts: Pt[] = [];
    const side = (ax: number, ay: number, bx: number, by: number, sd: number) => {
      for (let i = 0; i < 14; i++) {
        const k = i / 14;
        const j = (hash(sd * 13 + i) - 0.5) * size * 0.018;
        pts.push([lerp(ax, bx, k) + (ay === by ? 0 : j), lerp(ay, by, k) + (ay === by ? j : 0)]);
      }
    };
    side(-h, -h, h, -h, seed);
    side(h, -h, h, h, seed + 1);
    side(h, h, -h, h, seed + 2);
    side(-h, h, -h, -h, seed + 3);
    const body = new Path2D();
    body.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) body.lineTo(q[0], q[1]);
    body.closePath();
    g.fillStyle = SUMI.verm;
    g.fill(body);
    // uneven pressure: darker and lighter patches
    for (let i = 0; i < 26; i++) {
      const x = (hash(seed + i * 3) - 0.5) * size;
      const y = (hash(seed + i * 5 + 1) - 0.5) * size;
      const rr = size * (0.08 + hash(i + seed) * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      const dark = hash(i * 7 + seed) < 0.5;
      gr.addColorStop(0, dark ? 'rgba(130,25,12,0.22)' : 'rgba(246,190,160,0.2)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.clip(body);
      g.fillStyle = gr;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    carve(g, size);
    // where the stone did not take ink
    const sp = new Path2D();
    for (let i = 0; i < 140; i++) {
      const x = (hash(seed * 3 + i * 1.7) - 0.5) * size;
      const y = (hash(seed * 5 + i * 2.3) - 0.5) * size;
      const rr = size * (0.002 + hash(i * 9 + seed) ** 3 * 0.014);
      sp.moveTo(x + rr, y);
      sp.arc(x, y, rr, 0, TAU);
    }
    // a few nicks out of the border
    for (let i = 0; i < 7; i++) {
      const a = hash(seed + i * 19) * 4;
      const e = (hash(seed + i * 23) - 0.5) * size;
      const x = a < 1 ? e : a < 2 ? h : a < 3 ? e : -h;
      const y = a < 1 ? -h : a < 2 ? e : a < 3 ? h : e;
      const rr = size * (0.012 + hash(i + seed * 2) * 0.02);
      sp.moveTo(x + rr, y);
      sp.arc(x, y, rr, 0, TAU);
    }
    g.fill(sp);
    g.globalCompositeOperation = 'source-over';
  });
  return pl.cv;
}

/** Press the seal: it comes down a touch large, lands, and the ink settles. k: 0..1 */
export const stampSeal = (c: Ctx, seal: HTMLCanvasElement, x: number, y: number, size: number, k: number, rot = -0.03) => {
  if (k <= 0) return;
  const land = clamp(k / 0.28);
  const s = 1 + 0.32 * Math.pow(1 - land, 2) - 0.03 * Math.sin(clamp((k - 0.28) / 0.25) * Math.PI);
  const W = size * 1.24 * s;
  c.save();
  c.globalAlpha = clamp(k / 0.14);
  c.translate(x, y);
  c.rotate(rot);
  c.drawImage(seal, -W / 2, -W / 2, W, W);
  c.restore();
};

/** A short inscription in ink, revealed down or across as if written. k: 0..1 */
export const inscription = (c: Ctx, text: string, x: number, y: number, size: number, k: number, spacing = 0, weight = 500, alpha = 0.92) => {
  if (k <= 0) return;
  c.save();
  c.font = `${weight} ${size}px ${SERIF}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const chars = Array.from(text);
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x;
  const m = chars.length;
  chars.forEach((ch, i) => {
    const a = clamp((k * (m + 2) - i) / 2.5);
    if (a > 0) {
      c.fillStyle = ink(alpha * a);
      c.fillText(ch, cx, y + (1 - a) * size * 0.06);
    }
    cx += widths[i] + spacing;
  });
  c.restore();
  return total;
};

/** Warm age on the sheet: a faint tea-coloured vignette, in screen space */
export const paperAge = (c: Ctx, a = 1) => {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const W = c.canvas.width;
  const H = c.canvas.height;
  const g = c.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H / 2, W * 0.66);
  g.addColorStop(0, 'rgba(120,92,52,0)');
  g.addColorStop(1, `rgba(120,92,52,${0.16 * a})`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.restore();
};
