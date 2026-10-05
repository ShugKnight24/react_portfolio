/**
 * Motion and geometry helpers shared by the riso films.
 * Everything here is deterministic: seeded randomness only, no Math.random.
 */

export { mulberry } from './engine';

export const TAU = Math.PI * 2;

/* ---------- timing ---------- */

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0..1 progress of t through [a, b] */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (k: number) => k * k * (3 - 2 * k);

export const ease = {
  linear: (k: number) => k,
  inSine: (k: number) => 1 - Math.cos((k * Math.PI) / 2),
  outSine: (k: number) => Math.sin((k * Math.PI) / 2),
  inOutSine: (k: number) => -(Math.cos(Math.PI * k) - 1) / 2,
  inCubic: (k: number) => k * k * k,
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inQuint: (k: number) => k ** 5,
  outQuint: (k: number) => 1 - Math.pow(1 - k, 5),
  inOutQuint: (k: number) => (k < 0.5 ? 16 * k ** 5 : 1 - Math.pow(-2 * k + 2, 5) / 2),
  inExpo: (k: number) => (k === 0 ? 0 : Math.pow(2, 10 * k - 10)),
  outExpo: (k: number) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutExpo: (k: number) =>
    k === 0 ? 0 : k === 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2,
  outBack: (k: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  inBack: (k: number) => 2.70158 * k * k * k - 1.70158 * k * k,
  outElastic: (k: number) =>
    k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** Eased progress through [a, b] */
export const tween = (t: number, a: number, b: number, fn: (k: number) => number = ease.inOutCubic) =>
  fn(seg(t, a, b));

/** Stable pseudo-random value in [0, 1) for an integer/float key */
export const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Smooth 1D value noise in [-1, 1] */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 101.3) * 2 - 1;
  const b = hash(i + 1 + seed * 101.3) * 2 - 1;
  return lerp(a, b, smooth(f));
};

/* ---------- points and outlines ---------- */

export type Pt = [number, number];

export const circlePts = (cx: number, cy: number, r: number, n = 96, start = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * TAU;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

export const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 96, start = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * TAU;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** Sample a closed polar shape r(a) */
export const polarPts = (cx: number, cy: number, r: (a: number) => number, n = 96, start = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * TAU;
    const rr = r(a);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

/** Resample a closed (or open) polyline to n points evenly spaced by arc length */
export const resample = (pts: Pt[], n: number, closed = true): Pt[] => {
  const src = closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let i = 1; i < src.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
  }
  const total = lens[lens.length - 1] || 1;
  const out: Pt[] = [];
  let j = 1;
  const count = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const target = (i / count) * total;
    while (j < lens.length - 1 && lens[j] < target) j++;
    const seglen = lens[j] - lens[j - 1] || 1;
    const k = (target - lens[j - 1]) / seglen;
    out.push([lerp(src[j - 1][0], src[j][0], k), lerp(src[j - 1][1], src[j][1], k)]);
  }
  return out;
};

/** Rotate the start index of b so it lines up with a, which keeps morphs from twisting */
export const align = (a: Pt[], b: Pt[]): Pt[] => {
  const n = a.length;
  let best = 0;
  let bestD = Infinity;
  const stride = Math.max(1, Math.floor(n / 48));
  for (let s = 0; s < n; s += 1) {
    let d = 0;
    for (let i = 0; i < n; i += stride) {
      const p = a[i];
      const q = b[(i + s) % n];
      d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    }
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return Array.from({ length: n }, (_, i) => b[(i + best) % n]);
};

/** Point-wise blend of two outlines with the same count */
export const morph = (a: Pt[], b: Pt[], k: number): Pt[] =>
  a.map((p, i) => [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]);

/** Prepare two outlines for morphing: resample both to n and align b to a */
export const morphPair = (a: Pt[], b: Pt[], n = 120): [Pt[], Pt[]] => {
  const ra = resample(a, n);
  return [ra, align(ra, resample(b, n))];
};

export const transformPts = (pts: Pt[], dx: number, dy: number, s = 1, rot = 0, ox = 0, oy = 0): Pt[] => {
  const c = Math.cos(rot);
  const si = Math.sin(rot);
  return pts.map(([x, y]) => {
    const px = (x - ox) * s;
    const py = (y - oy) * s;
    return [ox + px * c - py * si + dx, oy + px * si + py * c + dy];
  });
};

/** Hand-drawn wobble, stable for a given seed */
export const wobble = (pts: Pt[], amp: number, seed = 1, freq = 6): Pt[] =>
  pts.map(([x, y], i) => {
    const k = i / pts.length;
    return [x + noise1(k * freq * 4, seed) * amp, y + noise1(k * freq * 4, seed + 7) * amp];
  });

/** Polyline path */
export const polyPath = (pts: Pt[], closed = true, path: Path2D = new Path2D()) => {
  if (!pts.length) return path;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  if (closed) path.closePath();
  return path;
};

/** Smooth closed Catmull-Rom path through the points */
export const smoothPath = (pts: Pt[], closed = true, tension = 0.5, path: Path2D = new Path2D()) => {
  const n = pts.length;
  if (n < 3) return polyPath(pts, closed, path);
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  path.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const t = tension / 3;
    path.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * t,
      p1[1] + (p2[1] - p0[1]) * t,
      p2[0] - (p3[0] - p1[0]) * t,
      p2[1] - (p3[1] - p1[1]) * t,
      p2[0],
      p2[1]
    );
  }
  if (closed) path.closePath();
  return path;
};

/** Point along a polyline at fraction k (0..1) */
export const along = (pts: Pt[], k: number): Pt => {
  if (k <= 0) return pts[0];
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = clamp(k) * lens[lens.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] >= target) {
      const f = (target - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
    }
  }
  return pts[pts.length - 1];
};

/** Cubic bezier point */
export const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, k: number): Pt => {
  const u = 1 - k;
  return [
    u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0],
    u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1],
  ];
};

/* ---------- text ---------- */

export const DISPLAY = '"Archivo Black", "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif';
export const SERIF = '"EB Garamond", Georgia, "Times New Roman", serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Letter-spaced text centred on x */
export const spacedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) => {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = align;
};
