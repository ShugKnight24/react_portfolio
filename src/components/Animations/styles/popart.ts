/**
 * Pop art helpers shared by the Pop art series (direct mode films).
 *
 * The look: a 1960s comic page blown up to gallery size. Flat primaries (cadmium red, yellow,
 * cyan) and black on cream newsprint, big regular Ben-Day dots on the flat areas, thick brush
 * keylines that swell and thin, colour plates printed a hair off register from the black plate,
 * hand-lettered balloons and captions, bursts with onomatopoeia, focus lines and panel gutters.
 *
 * Lettering is drawn from a small built-in stroke alphabet (no web font needed), so balloons and
 * sound effects look hand-inked and render the same everywhere.
 * Everything is deterministic and cheap: dot fields are cached patterns, lines are batched.
 */
import type { Ctx } from '../riso/engine';
import { clamp, hash, lerp, noise1, smoothPath, TAU, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const POP = {
  paper: '#f2e7cf',
  cream: '#fbf4e2',
  white: '#fffdf6',
  red: '#e2231a',
  deepRed: '#a8141a',
  yellow: '#ffd21f',
  orange: '#f68b1f',
  cyan: '#13a3dc',
  blue: '#1f4ea3',
  navy: '#142a5c',
  black: '#15110f',
  skin: '#fcd2ae',
  skinShade: '#ee9f7d',
  pink: '#f7a6b2',
  green: '#22a650',
  grey: '#8d8a86',
} as const;

/** Colour plates sit this far off the black plate (logical px) */
export const REG: Pt = [2.6, 1.8];

/** hex (#rrggbb) to rgba() */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};

/** Blend two hex colours */
export const mix = (a: string, b: string, k: number) => {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((na >> s) & 255, (nb >> s) & 255, clamp(k)));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
};

/* ---------- Ben-Day dots ---------- */

const dotCache = new Map<string, CanvasPattern>();
const RES = 4;

/**
 * A repeating field of Ben-Day dots: a staggered grid (one dot at each corner and one in the
 * middle of every cell) with the given spacing and dot radius, in user units. The pattern lives
 * in the user space of the fill, so dots move and scale with the art like a printed page.
 */
export const dots = (c: Ctx, color: string, spacing: number, radius: number): CanvasPattern => {
  const key = `${color}|${spacing}|${radius}`;
  let p = dotCache.get(key);
  if (p) return p;
  const px = Math.max(4, Math.round(spacing * RES));
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is unavailable');
  const rr = radius * (px / spacing);
  g.fillStyle = color;
  g.beginPath();
  for (const [x, y] of [
    [0, 0],
    [px, 0],
    [0, px],
    [px, px],
    [px / 2, px / 2],
  ]) {
    g.moveTo(x + rr, y);
    g.arc(x, y, rr, 0, TAU);
  }
  g.fill();
  const made = c.createPattern(cv, 'repeat');
  if (!made) throw new Error('pattern failed');
  made.setTransform(new DOMMatrix().rotate(0).scale(spacing / px, spacing / px));
  dotCache.set(key, made);
  p = made;
  return p;
};

/** Fill a path with flat colour then a Ben-Day dot screen on top, both off register */
export const dotFill = (
  c: Ctx,
  path: Path2D,
  base: string | null,
  dot: string,
  spacing: number,
  radius: number,
  reg = 1
) => {
  c.save();
  c.translate(REG[0] * reg, REG[1] * reg);
  if (base) {
    c.fillStyle = base;
    c.fill(path);
  }
  c.fillStyle = dots(c, dot, spacing, radius);
  c.fill(path);
  c.restore();
};

/** A Path2D of dots whose radius varies over the field (for graded skies, cast shadows). */
export const dotField = (
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
  rad: (x: number, y: number) => number,
  path: Path2D = new Path2D()
) => {
  const rows = Math.ceil(h / (spacing / 2)) + 1;
  for (let j = 0; j <= rows; j++) {
    const yy = y + (j * spacing) / 2;
    const off = j % 2 ? spacing / 2 : 0;
    for (let xx = x + off; xx <= x + w + spacing; xx += spacing) {
      const r = rad(xx, yy);
      if (r <= 0.3) continue;
      path.moveTo(xx + r, yy);
      path.arc(xx, yy, Math.min(r, spacing * 0.72), 0, TAU);
    }
  }
  return path;
};

/* ---------- ink ---------- */

/** Flat colour plate, printed a little off register */
export const plate = (c: Ctx, path: Path2D, color: string, reg = 1) => {
  c.save();
  c.translate(REG[0] * reg, REG[1] * reg);
  c.fillStyle = color;
  c.fill(path);
  c.restore();
};

/** Black keyline with a brushy swell: a base stroke plus a heavier pass toward the shadow side */
export const keyline = (c: Ctx, path: Path2D, lw: number, color: string = POP.black) => {
  c.save();
  c.strokeStyle = color;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = lw;
  c.stroke(path);
  c.translate(lw * 0.22, lw * 0.26);
  c.lineWidth = lw * 0.8;
  c.stroke(path);
  c.restore();
};

/** Colour fill + keyline */
export const inked = (c: Ctx, path: Path2D, color: string | null, lw: number, reg = 1) => {
  if (color) plate(c, path, color, reg);
  if (lw > 0) keyline(c, path, lw);
};

/**
 * Union-outlined shapes: every path gets a heavy black stroke first, then the colours are laid
 * on top (off register), so only the outer contour of the group shows as a swelling brush line.
 */
export const group = (c: Ctx, parts: readonly (readonly [Path2D, string | CanvasPattern])[], lw: number, reg = 1) => {
  c.save();
  c.strokeStyle = POP.black;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = lw * 2;
  for (const [p] of parts) c.stroke(p);
  c.translate(REG[0] * reg, REG[1] * reg);
  for (const [p, col] of parts) {
    c.fillStyle = col;
    c.fill(p);
  }
  c.restore();
};

/** Outline of a tapered brush stroke along an open polyline: thin at both ends, w at the belly */
export const brushPts = (pts: Pt[], w: number, taper0 = 1, taper1 = 1, seed = 1): Pt[] => {
  const n = pts.length;
  if (n < 2) return [];
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const k = i / (n - 1);
    const t0 = taper0 > 0 ? Math.min(1, k / (0.5 * taper0)) : 1;
    const t1 = taper1 > 0 ? Math.min(1, (1 - k) / (0.5 * taper1)) : 1;
    const prof = Math.pow(Math.sin((Math.min(t0, t1) * Math.PI) / 2), 0.7);
    const ww = (w * 0.5 * (0.12 + 0.88 * prof)) * (1 + 0.12 * noise1(k * 7, seed));
    L.push([pts[i][0] + nx * ww, pts[i][1] + ny * ww]);
    R.push([pts[i][0] - nx * ww, pts[i][1] - ny * ww]);
  }
  return [...L, ...R.reverse()];
};

/** Add a tapered brush stroke (sampled smooth curve through pts) to a path */
export const brush = (pts: Pt[], w: number, path: Path2D = new Path2D(), taper0 = 1, taper1 = 1, seed = 1) => {
  const dense = densify(pts, 6);
  const o = brushPts(dense, w, taper0, taper1, seed);
  if (o.length) {
    path.moveTo(o[0][0], o[0][1]);
    for (let i = 1; i < o.length; i++) path.lineTo(o[i][0], o[i][1]);
    path.closePath();
  }
  return path;
};

/** Catmull-Rom resampling of an open polyline, `per` samples per span */
export const densify = (pts: Pt[], per = 6): Pt[] => {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: Pt[] = [];
  const get = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
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
  out.push(pts[n - 1]);
  return out;
};

export const fillInk = (c: Ctx, path: Path2D, color: string = POP.black) => {
  c.fillStyle = color;
  c.fill(path);
};

/* ---------- small geometry ---------- */

export const rectPath = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};
export const rrPath = (x: number, y: number, w: number, h: number, r: number, p: Path2D = new Path2D()) => {
  p.roundRect(x, y, w, h, r);
  return p;
};
export const circPath = (x: number, y: number, r: number, p: Path2D = new Path2D()) => {
  p.moveTo(x + r, y);
  p.arc(x, y, Math.max(0.1, r), 0, TAU);
  return p;
};
export const ellPath = (x: number, y: number, rx: number, ry: number, rot = 0, p: Path2D = new Path2D()) => {
  p.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  return p;
};
export const polyP = (pts: Pt[], closed = true, p: Path2D = new Path2D()) => {
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
};
export const smoothP = (pts: Pt[], closed = true, p: Path2D = new Path2D()) => smoothPath(pts, closed, 0.5, p);

/** Camera shake offset from smooth noise */
export const shake = (t: number, amp: number, seed = 1, freq = 22): Pt => [
  noise1(t * freq, seed) * amp,
  noise1(t * freq, seed + 13) * amp,
];

/* ---------- hand lettering ---------- */

type Glyph = readonly [number, readonly (readonly number[])[]];

/** Stroke alphabet on a 6-unit cap height grid, y down */
const GLYPHS: Record<string, Glyph> = {
  A: [4.4, [[0, 6, 2.2, 0, 4.4, 6], [0.9, 3.9, 3.5, 3.9]]],
  B: [4, [[0, 3, 0, 0, 2.6, 0, 3.6, 0.8, 3.6, 2.2, 2.6, 3, 0, 3, 0, 6, 2.8, 6, 4, 5, 4, 4, 2.8, 3]]],
  C: [4, [[4, 1, 3, 0, 1.1, 0, 0, 1.3, 0, 4.7, 1.1, 6, 3, 6, 4, 5]]],
  D: [4, [[0, 0, 0, 6, 2.2, 6, 4, 4.3, 4, 1.7, 2.2, 0, 0, 0]]],
  E: [3.6, [[3.6, 0, 0, 0, 0, 6, 3.6, 6], [0, 3, 2.8, 3]]],
  F: [3.5, [[3.5, 0, 0, 0, 0, 6], [0, 3, 2.7, 3]]],
  G: [4.2, [[4, 1, 3, 0, 1.1, 0, 0, 1.3, 0, 4.7, 1.1, 6, 3, 6, 4.2, 4.9, 4.2, 3.3, 2.4, 3.3]]],
  H: [4, [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]]],
  I: [2.6, [[1.3, 0, 1.3, 6], [0, 0, 2.6, 0], [0, 6, 2.6, 6]]],
  J: [3.6, [[3.6, 0, 3.6, 4.8, 2.6, 6, 1, 6, 0, 4.8]]],
  K: [4, [[0, 0, 0, 6], [4, 0, 0, 3.6], [1.3, 2.7, 4, 6]]],
  L: [3.5, [[0, 0, 0, 6, 3.5, 6]]],
  M: [5, [[0, 6, 0, 0, 2.5, 3.8, 5, 0, 5, 6]]],
  N: [4, [[0, 6, 0, 0, 4, 6, 4, 0]]],
  O: [4.2, [[1.1, 0, 3.1, 0, 4.2, 1.3, 4.2, 4.7, 3.1, 6, 1.1, 6, 0, 4.7, 0, 1.3, 1.1, 0]]],
  P: [3.9, [[0, 6, 0, 0, 2.7, 0, 3.9, 1, 3.9, 2.3, 2.7, 3.3, 0, 3.3]]],
  Q: [4.2, [[1.1, 0, 3.1, 0, 4.2, 1.3, 4.2, 4.7, 3.1, 6, 1.1, 6, 0, 4.7, 0, 1.3, 1.1, 0], [2.6, 4.4, 4.4, 6.5]]],
  R: [4, [[0, 6, 0, 0, 2.7, 0, 3.9, 1, 3.9, 2.3, 2.7, 3.3, 0, 3.3], [2, 3.3, 4, 6]]],
  S: [4, [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]]],
  T: [4.2, [[0, 0, 4.2, 0], [2.1, 0, 2.1, 6]]],
  U: [4, [[0, 0, 0, 4.8, 1, 6, 3, 6, 4, 4.8, 4, 0]]],
  V: [4.4, [[0, 0, 2.2, 6, 4.4, 0]]],
  W: [5.6, [[0, 0, 1.3, 6, 2.8, 1.8, 4.3, 6, 5.6, 0]]],
  X: [4.2, [[0, 0, 4.2, 6], [4.2, 0, 0, 6]]],
  Y: [4.2, [[0, 0, 2.1, 3, 4.2, 0], [2.1, 3, 2.1, 6]]],
  Z: [4, [[0, 0, 4, 0, 0, 6, 4, 6]]],
  '0': [3.8, [[1, 0, 2.8, 0, 3.8, 1.3, 3.8, 4.7, 2.8, 6, 1, 6, 0, 4.7, 0, 1.3, 1, 0]]],
  '1': [2.6, [[0.4, 1.1, 1.5, 0, 1.5, 6], [0.2, 6, 2.6, 6]]],
  '2': [3.8, [[0, 1, 1, 0, 2.8, 0, 3.8, 1, 3.8, 2.1, 0, 6, 3.8, 6]]],
  '3': [3.8, [[0, 0.7, 1, 0, 2.8, 0, 3.8, 1, 3.8, 2, 2.8, 3, 1.4, 3], [2.8, 3, 3.8, 4, 3.8, 5, 2.8, 6, 1, 6, 0, 5.3]]],
  '4': [4, [[3, 6, 3, 0, 0, 4.2, 4, 4.2]]],
  '5': [3.8, [[3.8, 0, 0.4, 0, 0, 2.8, 2.7, 2.6, 3.8, 3.6, 3.8, 5, 2.8, 6, 1, 6, 0, 5.2]]],
  '6': [3.8, [[3.4, 0.4, 2.5, 0, 1, 0, 0, 1.3, 0, 4.8, 1, 6, 2.8, 6, 3.8, 5, 3.8, 4, 2.8, 3, 1, 3, 0, 4]]],
  '7': [3.8, [[0, 0, 3.8, 0, 1.5, 6]]],
  '8': [3.8, [[1.9, 3, 0.5, 2.2, 0.5, 0.8, 1.3, 0, 2.5, 0, 3.3, 0.8, 3.3, 2.2, 1.9, 3, 0, 4.2, 0, 5.2, 1, 6, 2.8, 6, 3.8, 5.2, 3.8, 4.2, 1.9, 3]]],
  '9': [3.8, [[3.8, 2, 2.8, 3, 1, 3, 0, 2, 0, 1, 1, 0, 2.8, 0, 3.8, 1.2, 3.8, 4.8, 2.8, 6, 1, 6, 0.4, 5.6]]],
  '!': [1.6, [[0.8, 0, 0.8, 4.1], [0.8, 5.6, 0.8, 5.75]]],
  '?': [3.8, [[0, 1, 1, 0, 2.8, 0, 3.8, 1, 3.8, 2, 1.9, 3.2, 1.9, 4.1], [1.9, 5.6, 1.9, 5.75]]],
  '.': [1.1, [[0.55, 5.6, 0.55, 5.75]]],
  ',': [1.2, [[0.9, 5.3, 0.3, 6.7]]],
  ':': [1.1, [[0.55, 1.8, 0.55, 1.95], [0.55, 5.6, 0.55, 5.75]]],
  "'": [1.1, [[0.55, 0, 0.55, 1.6]]],
  '-': [2.6, [[0, 3.1, 2.6, 3.1]]],
  '/': [3, [[3, 0, 0, 6]]],
  '%': [4.4, [[4.4, 0, 0, 6], [0.4, 0.2, 1.4, 0.2, 1.4, 1.8, 0.4, 1.8, 0.4, 0.2], [3, 4.2, 4, 4.2, 4, 5.8, 3, 5.8, 3, 4.2]]],
  '#': [4.2, [[1.4, 0.4, 1, 5.6], [3.2, 0.4, 2.8, 5.6], [0, 2, 4.2, 2], [0, 4, 4.2, 4]]],
  '>': [3.4, [[0, 0.8, 3.4, 3, 0, 5.2]]],
  _: [3.6, [[0, 6, 3.6, 6]]],
  '*': [3, [[1.5, 1, 1.5, 5], [0, 2, 3, 4], [3, 2, 0, 4]]],
};

const SPACE = 2.6;
const TRACK = 1.15;

/** Width of lettered text at cap height `size` */
export const measure = (text: string, size: number, track = TRACK) => {
  let w = 0;
  const chars = Array.from(text.toUpperCase());
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch];
    w += (g ? g[0] : SPACE) + (i < chars.length - 1 ? track : 0);
  });
  return (w * size) / 6;
};

/**
 * Lettering as a Path2D of stroke centre lines (stroke it with round caps). Each letter gets a
 * tiny stable wobble and tilt so it reads hand-inked. align: 0 left, 0.5 centre, 1 right.
 */
export const letterPath = (
  text: string,
  x: number,
  y: number,
  size: number,
  align = 0.5,
  seed = 1,
  wob = 1,
  track = TRACK,
  path: Path2D = new Path2D()
) => {
  const u = size / 6;
  let pen = x - measure(text, size, track) * align;
  const chars = Array.from(text.toUpperCase());
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) {
      pen += (SPACE + track) * u;
      return;
    }
    const tilt = (hash(i * 3.7 + seed) - 0.5) * 0.09 * wob;
    const dy = (hash(i * 5.3 + seed * 1.7) - 0.5) * 0.35 * wob;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const cx = g[0] / 2;
    for (const s of g[1]) {
      for (let j = 0; j < s.length; j += 2) {
        const jx = (hash(i * 11 + j * 1.3 + seed) - 0.5) * 0.16 * wob;
        const jy = (hash(i * 7 + j * 2.1 + seed) - 0.5) * 0.16 * wob;
        const gx = s[j] - cx + jx;
        const gy = s[j + 1] - 3 + jy + dy;
        const px = pen + (cx + gx * ct - gy * st) * u;
        const py = y + (3 + gx * st + gy * ct) * u;
        if (j === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
    }
    pen += (g[0] + track) * u;
  });
  return path;
};

/** Plain hand lettering, y is the top of the caps */
export const letter = (
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  align = 0.5,
  color: string = POP.black,
  weight = 0.15,
  seed = 1
) => {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = size * weight;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke(letterPath(text, x, y, size, align, seed));
  c.restore();
};

/** Several centred lines of lettering, block centred on (x, y) */
export const letterLines = (
  c: Ctx,
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  color: string = POP.black,
  weight = 0.15,
  lead = 1.5,
  seed = 1
) => {
  const h = size * (lines.length + (lines.length - 1) * (lead - 1));
  lines.forEach((ln, i) => letter(c, ln, x, y - h / 2 + i * size * lead, size, 0.5, color, weight, seed + i * 9));
};

export interface BoomOpts {
  fill?: string;
  side?: string;
  /** extrusion direction per step and number of steps */
  ext?: Pt;
  steps?: number;
  weight?: number;
  outline?: number;
  rot?: number;
  scale?: number;
  track?: number;
  seed?: number;
}

/** Big extruded sound-effect lettering (KAPOW!), centred on (x, y) */
export const boom = (c: Ctx, text: string, x: number, y: number, size: number, o: BoomOpts = {}) => {
  const fill = o.fill ?? POP.yellow;
  const side = o.side ?? POP.red;
  const ext = o.ext ?? [1.2, 1.4];
  const steps = o.steps ?? 8;
  const lw = size * (o.weight ?? 0.3);
  const ol = size * (o.outline ?? 0.11);
  const track = o.track ?? 1.9;
  const p = letterPath(text, 0, -size / 2, size, 0.5, o.seed ?? 3, 1.4, track);
  c.save();
  c.translate(x, y);
  c.rotate(o.rot ?? 0);
  const sc = o.scale ?? 1;
  c.scale(sc, sc);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = POP.black;
  c.lineWidth = lw + ol * 2;
  for (let k = steps; k >= 0; k--) {
    c.save();
    c.translate(ext[0] * k * size * 0.02, ext[1] * k * size * 0.02);
    c.stroke(p);
    c.restore();
  }
  c.strokeStyle = side;
  c.lineWidth = lw;
  for (let k = steps; k >= 1; k--) {
    c.save();
    c.translate(ext[0] * k * size * 0.02, ext[1] * k * size * 0.02);
    c.stroke(p);
    c.restore();
  }
  c.strokeStyle = POP.black;
  c.lineWidth = lw + ol * 0.9;
  c.stroke(p);
  c.strokeStyle = fill;
  c.lineWidth = lw;
  c.stroke(p);
  // shine: a thin paper glint on the upper-left of every stroke
  c.translate(-lw * 0.18, -lw * 0.2);
  c.strokeStyle = rgba(POP.white, 0.75);
  c.lineWidth = lw * 0.16;
  c.stroke(p);
  c.restore();
};

/* ---------- bursts, balloons, captions ---------- */

/** Jagged star burst outline */
export const burstPts = (cx: number, cy: number, rIn: number, rOut: number, n: number, seed = 1, sx = 1, sy = 1): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + hash(seed + i * 0.37) * 0.12;
    const out = i % 2 === 0;
    const r = out ? rOut * (0.72 + hash(seed * 3 + i) * 0.4) : rIn * (0.85 + hash(seed * 5 + i) * 0.25);
    pts.push([cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy]);
  }
  return pts;
};

/** Burst with an inner burst and dot screen: the classic pow badge */
export const burst = (
  c: Ctx,
  cx: number,
  cy: number,
  r: number,
  k: number,
  seed = 1,
  outer: string = POP.yellow,
  inner: string = POP.red,
  lw = 7
) => {
  if (k <= 0) return;
  const R = r * k;
  const o = polyP(burstPts(cx, cy, R * 0.66, R, 14, seed));
  inked(c, o, outer, lw);
  dotFill(c, o, null, rgba(POP.orange, 0.8), Math.max(8, R * 0.07), Math.max(2, R * 0.022));
  const i = polyP(burstPts(cx, cy, R * 0.42, R * 0.66, 11, seed + 7));
  inked(c, i, inner, lw * 0.7);
};

/** Speech balloon with a pointed tail; text lines are centred inside */
export const balloon = (
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tail: Pt | null,
  lines: readonly string[],
  size: number,
  k = 1,
  lw = 5,
  fill: string = POP.white,
  ink: string = POP.black
) => {
  if (k <= 0) return;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  const p = new Path2D();
  p.ellipse(0, 0, rx, ry, 0, 0, TAU);
  let tailP: Path2D | null = null;
  if (tail) {
    const tx = tail[0] - x;
    const ty = tail[1] - y;
    const a = Math.atan2(ty, tx);
    const bx = Math.cos(a) * rx * 0.7;
    const by = Math.sin(a) * ry * 0.7;
    const w = Math.min(rx, ry) * 0.28;
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    const q = new Path2D();
    q.moveTo(bx + nx, by + ny);
    q.quadraticCurveTo(lerp(bx, tx, 0.5) + nx * 0.2, lerp(by, ty, 0.5) + ny * 0.2, tx, ty);
    q.quadraticCurveTo(lerp(bx, tx, 0.4) - nx * 0.5, lerp(by, ty, 0.4) - ny * 0.5, bx - nx, by - ny);
    q.closePath();
    tailP = q;
  }
  c.strokeStyle = POP.black;
  c.lineJoin = 'round';
  c.lineWidth = lw * 2;
  c.stroke(p);
  if (tailP) c.stroke(tailP);
  c.fillStyle = fill;
  c.fill(p);
  if (tailP) c.fill(tailP);
  letterLines(c, lines, 0, 0, size, ink);
  c.restore();
};

/** Thought balloon: a cloud and a trail of bubbles toward `tail` */
export const thought = (
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tail: Pt,
  lines: readonly string[],
  size: number,
  k = 1,
  lw = 5,
  seed = 2
) => {
  if (k <= 0) return;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  const p = new Path2D();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const bx = Math.cos(a) * rx * 0.86;
    const by = Math.sin(a) * ry * 0.82;
    const br = Math.min(rx, ry) * (0.36 + hash(seed + i) * 0.12);
    p.moveTo(bx + br, by);
    p.arc(bx, by, br, 0, TAU);
  }
  p.moveTo(rx * 0.9, 0);
  p.ellipse(0, 0, rx * 0.9, ry * 0.86, 0, 0, TAU);
  const tx = tail[0] - x;
  const ty = tail[1] - y;
  for (let i = 0; i < 3; i++) {
    const f = 0.62 + i * 0.16;
    const bx = Math.cos(Math.atan2(ty, tx)) * rx * 0.9;
    const by = Math.sin(Math.atan2(ty, tx)) * ry * 0.9;
    const px = lerp(bx, tx, (f - 0.62) / 0.48 + 0.25);
    const py = lerp(by, ty, (f - 0.62) / 0.48 + 0.25);
    const rr = Math.min(rx, ry) * (0.16 - i * 0.04);
    p.moveTo(px + rr, py);
    p.arc(px, py, rr, 0, TAU);
  }
  c.strokeStyle = POP.black;
  c.lineWidth = lw * 2;
  c.stroke(p);
  c.fillStyle = POP.white;
  c.fill(p);
  letterLines(c, lines, 0, 0, size);
  c.restore();
};

/** Rectangular caption box, lettering left aligned */
export const caption = (
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  lines: readonly string[],
  size: number,
  bg: string = POP.yellow,
  lw = 4,
  k = 1
) => {
  if (k <= 0) return;
  if (w <= 0) w = Math.max(...lines.map((l) => measure(l, size))) + size * 1.5;
  c.save();
  c.translate(x, y);
  c.scale(1, k);
  const p = rectPath(0, 0, w, h);
  inked(c, p, bg, lw);
  const lead = 1.5;
  const th = size * (lines.length + (lines.length - 1) * (lead - 1));
  lines.forEach((ln, i) => letter(c, ln, size * 0.7, h / 2 - th / 2 + i * size * lead, size, 0, POP.black, 0.15, 5 + i));
  c.restore();
};

/* ---------- motion lines ---------- */

/**
 * Radial focus lines toward (cx, cy): tapered black wedges from beyond rOuter in to a ragged
 * radius near rInner. Re-seeded per `beat` so they flicker like hand-drawn frames.
 */
export const focusLines = (
  c: Ctx,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  n: number,
  beat: number,
  w = 0.012,
  color: string = POP.black
) => {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const h0 = hash(i * 1.37 + beat * 7.1);
    const a = (i / n) * TAU + (h0 - 0.5) * (TAU / n) * 1.6;
    const r0 = rInner * (1 + hash(i * 2.1 + beat) * 0.7);
    const da = w * (0.5 + hash(i * 3.3 + beat * 1.3) * 1.5);
    p.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    p.lineTo(cx + Math.cos(a - da) * rOuter, cy + Math.sin(a - da) * rOuter);
    p.lineTo(cx + Math.cos(a + da) * rOuter, cy + Math.sin(a + da) * rOuter);
    p.closePath();
  }
  c.fillStyle = color;
  c.fill(p);
};

/** Parallel speed lines behind a moving thing, along direction angle `a` */
export const speedLines = (
  c: Ctx,
  x: number,
  y: number,
  len: number,
  spread: number,
  a: number,
  n: number,
  beat: number,
  w = 5,
  color: string = POP.black
) => {
  const p = new Path2D();
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const o = (hash(i * 1.9 + beat * 3.3) - 0.5) * spread;
    const l = len * (0.45 + hash(i * 2.7 + beat) * 0.55);
    const s = hash(i * 4.1 + beat * 0.7) * len * 0.3;
    const bx = x - uy * o - ux * s;
    const by = y + ux * o - uy * s;
    brush(
      [
        [bx, by],
        [bx - ux * l, by - uy * l],
      ],
      w * (0.5 + hash(i * 5.5) * 0.7),
      p,
      0.3,
      1.6,
      i
    );
  }
  c.fillStyle = color;
  c.fill(p);
};

/* ---------- panels ---------- */

/** Draw `body` clipped to a panel, then its black border */
export const panel = (c: Ctx, x: number, y: number, w: number, h: number, body: () => void, lw = 8, bg: string | null = POP.cream) => {
  const p = rectPath(x, y, w, h);
  c.save();
  c.clip(p);
  if (bg) {
    c.fillStyle = bg;
    c.fill(p);
  }
  body();
  c.restore();
  c.save();
  c.strokeStyle = POP.black;
  c.lineWidth = lw;
  c.lineJoin = 'miter';
  c.stroke(p);
  c.restore();
};

/* ---------- drops, eyes ---------- */

/** Teardrop / sweat drop with its point up, round end centred on (x, y) */
export const dropPath = (x: number, y: number, r: number, lean = 0, p: Path2D = new Path2D()) => {
  const tx = x + lean * r;
  const ty = y - r * 2.4;
  p.moveTo(tx, ty);
  p.bezierCurveTo(tx + r * 0.25, y - r * 1.4, x + r * 1.05, y - r * 0.7, x + r, y);
  p.arc(x, y, r, 0, Math.PI);
  p.bezierCurveTo(x - r * 1.05, y - r * 0.7, tx - r * 0.25, y - r * 1.4, tx, ty);
  p.closePath();
  return p;
};

export const drop = (c: Ctx, x: number, y: number, r: number, lean = 0, lw = 4, color: string = POP.cyan) => {
  const p = dropPath(x, y, r, lean);
  c.save();
  c.strokeStyle = POP.black;
  c.lineJoin = 'round';
  c.lineWidth = lw * 2;
  c.stroke(p);
  c.fillStyle = POP.white;
  c.fill(p);
  c.save();
  c.clip(p);
  c.fillStyle = color;
  c.fill(circPath(x + r * 0.35, y + r * 0.25, r * 1.05));
  c.restore();
  c.fillStyle = POP.white;
  c.fill(ellPath(x - r * 0.38, y - r * 0.5, r * 0.18, r * 0.38, 0.3));
  c.restore();
};

export interface EyeOpts {
  /** gaze in -1..1 */
  look?: Pt;
  /** 0 open .. 1 shut */
  lid?: number;
  /** eyebrow raise in eye units, and tilt (positive: inner end up, worried) */
  brow?: number;
  browTilt?: number;
  iris?: string;
  /** narrow the eye into a glare */
  glare?: number;
  lashes?: boolean;
}

/**
 * A comic close-up eye facing the viewer (left eye: inner corner at -x). Eye units: the almond
 * spans -1..1 in x; call with c already translated/scaled so 1 unit = half the eye width.
 * The surrounding skin is the caller's; this draws white, iris, lids, crease and brow.
 */
export const eye = (c: Ctx, o: EyeOpts = {}) => {
  const look = o.look ?? [0, 0];
  const lid = clamp(o.lid ?? 0);
  const glare = clamp(o.glare ?? 0);
  const top = lerp(-0.62, -0.3, glare);
  const bot = lerp(0.4, 0.26, glare);
  const upY = lerp(top, bot - 0.02, lid);
  const almond = new Path2D();
  almond.moveTo(-1, 0.06);
  almond.bezierCurveTo(-0.62, upY * 1.05, 0.38, upY * 1.08, 1, -0.06);
  almond.bezierCurveTo(0.55, bot * 1.1, -0.45, bot * 1.05, -1, 0.06);
  almond.closePath();
  c.save();
  c.fillStyle = POP.white;
  c.fill(almond);
  c.clip(almond);
  const ix = look[0] * 0.38;
  const iy = look[1] * 0.14 - 0.06;
  const iris = circPath(ix, iy, 0.44);
  c.fillStyle = o.iris ?? POP.cyan;
  c.fill(iris);
  c.fillStyle = dots(c, POP.blue, 0.11, 0.03);
  c.fill(iris);
  c.lineWidth = 0.05;
  c.strokeStyle = POP.black;
  c.stroke(iris);
  c.fillStyle = POP.black;
  c.fill(circPath(ix, iy, 0.2));
  // lid shadow over the top of the eyeball
  c.fillStyle = rgba(POP.blue, 0.28);
  c.fill(ellPath(0, upY - 0.05, 1.2, 0.26));
  c.fillStyle = POP.white;
  c.fill(circPath(ix + 0.14, iy - 0.14, 0.09));
  c.fill(circPath(ix - 0.14, iy + 0.13, 0.04));
  c.restore();
  // lids
  const ink = new Path2D();
  brush(
    [
      [-1.06, 0.1],
      [-0.7, upY * 0.8],
      [-0.1, upY * 1.02],
      [0.5, upY * 0.86],
      [1.08, -0.04],
    ],
    0.16,
    ink,
    0.5,
    0.7,
    3
  );
  brush(
    [
      [-0.9, 0.14],
      [-0.3, bot * 0.98],
      [0.4, bot * 0.92],
      [0.98, 0.02],
    ],
    0.06,
    ink,
    1,
    1,
    4
  );
  // crease
  const cy0 = lerp(top - 0.3, upY - 0.12, lid * 0.6);
  brush(
    [
      [-0.8, cy0 * 0.6],
      [-0.2, cy0],
      [0.55, cy0 * 0.86],
      [0.96, cy0 * 0.4],
    ],
    0.07,
    ink,
    1,
    1,
    5
  );
  if (o.lashes) {
    for (let i = 0; i < 5; i++) {
      const k = 0.35 + i * 0.15;
      const bx = lerp(-0.2, 1.05, k);
      const by = lerp(upY, -0.04, k * k);
      brush(
        [
          [bx, by],
          [bx + 0.16, by - 0.18 - i * 0.02],
          [bx + 0.3, by - 0.24],
        ],
        0.06,
        ink,
        0.2,
        1.2,
        i
      );
    }
  }
  // brow
  const bh = (o.brow ?? 0) - 0.95 + glare * 0.25;
  const bt = o.browTilt ?? 0;
  brush(
    [
      [-1.05, bh - bt * 0.3 + 0.1],
      [-0.5, bh - bt * 0.15 - 0.12],
      [0.2, bh - 0.22],
      [0.9, bh + bt * 0.2 - 0.04],
      [1.2, bh + bt * 0.25 + 0.14],
    ],
    0.3,
    ink,
    0.7,
    1.2,
    6
  );
  c.fillStyle = POP.black;
  c.fill(ink);
};

/* ---------- figure rig ---------- */

type Prof = readonly (readonly [number, number])[];

const profAt = (p: Prof, k: number) => {
  if (k <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (k <= p[i][0]) {
      const f = (k - p[i - 1][0]) / (p[i][0] - p[i - 1][0] || 1);
      const s = f * f * (3 - 2 * f);
      return lerp(p[i - 1][1], p[i][1], s);
    }
  }
  return p[p.length - 1][1];
};

/**
 * Outline of a limb segment a -> b with separate front/back half-width profiles, capped round
 * at both ends. "Front" is the left-hand normal of a -> b, i.e. +x for a segment pointing down.
 */
export const limbPts = (a: Pt, b: Pt, front: Prof, back: Prof, k0 = 0, k1 = 1, add = 0, n = 12): Pt[] => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = uy;
  const ny = -ux;
  const pts: Pt[] = [];
  const at = (k: number, side: number) => {
    const w = (side > 0 ? profAt(front, k) : profAt(back, k)) + add;
    return [a[0] + ux * L * k + nx * w * side, a[1] + uy * L * k + ny * w * side] as Pt;
  };
  const cap = (k: number, sign: number) => {
    const f = profAt(front, k) + add;
    const bk = profAt(back, k) + add;
    const r = Math.max(0.5, (f + bk) / 2);
    const ox = a[0] + ux * L * k + nx * (f - bk) * 0.5;
    const oy = a[1] + uy * L * k + ny * (f - bk) * 0.5;
    for (let j = 1; j < 6; j++) {
      const th = (j / 6) * Math.PI;
      pts.push([
        ox + sign * (nx * Math.cos(th) * r + ux * Math.sin(th) * r),
        oy + sign * (ny * Math.cos(th) * r + uy * Math.sin(th) * r),
      ]);
    }
  };
  for (let i = 0; i <= n; i++) pts.push(at(lerp(k0, k1, i / n), 1));
  cap(k1, 1);
  for (let i = n; i >= 0; i--) pts.push(at(lerp(k0, k1, i / n), -1));
  cap(k0, -1);
  return pts;
};

/** Two-bone IK: the middle joint between a and target, bending to the `bend` side (+1 / -1) */
export const ik = (a: Pt, t: Pt, l1: number, l2: number, bend: number): Pt => {
  const dx = t[0] - a[0];
  const dy = t[1] - a[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const al = Math.acos(cosA) * bend;
  return [a[0] + Math.cos(base + al) * l1, a[1] + Math.sin(base + al) * l1];
};

/** Lengths of the rig at scale 1 (a figure ~580 px tall standing) */
export const RIG = {
  thigh: 152,
  shin: 144,
  uarm: 112,
  farm: 102,
  torso: 168,
} as const;

export type Hand = 'fist' | 'open' | 'point' | 'grip';

export interface Pose {
  /** hip joint position */
  hip: Pt;
  /** torso lean forward from vertical (rad) */
  lean: number;
  /** head tilt relative to the torso (rad, positive nods down / forward) */
  head?: number;
  /** ankle targets (near / far) and foot pitch (rad, 0 flat, positive toes down) */
  ankleN: Pt;
  ankleF: Pt;
  footN?: number;
  footF?: number;
  /** wrist targets */
  wristN: Pt;
  wristF: Pt;
  /** elbow bend side (+1 elbows back/down, -1 forward) */
  elbowN?: number;
  elbowF?: number;
  handN?: Hand;
  handF?: Hand;
  /** chest puff 0..1 (triumph) */
  puff?: number;
  /** leg length multiplier (stockier builds), default 1 */
  legs?: number;
  /** mouth: 0 neutral, 1 open shout, -1 grit teeth, 0.5 smile */
  mouth?: number;
  /** eyes: 0 open, 1 squeezed shut */
  squint?: number;
}

export interface Look {
  skin: string;
  top: string;
  topDots?: string;
  topKind: 'tank' | 'tee' | 'hoodie';
  bottom: string;
  bottomKind: 'shorts' | 'pants';
  shoe: string;
  hair: string;
  glasses?: boolean;
  beard?: boolean;
  /** brush keyline width (half shows outside the shape) */
  lw: number;
  /** muscle mass multiplier for limb and torso widths, default 1 */
  build?: number;
  /** muscle definition lines 0..1 */
  ripped?: number;
}

const darker = (col: string, k = 0.22) => mix(col, POP.navy, k);

/* limb profiles: [k, half width], written for a right-facing figure */
const THIGH_F: Prof = [
  [0, 34],
  [0.3, 38],
  [0.75, 27],
  [0.92, 23],
  [1, 22],
];
const THIGH_B: Prof = [
  [0, 34],
  [0.35, 32],
  [0.8, 23],
  [1, 21],
];
const SHIN_F: Prof = [
  [0, 22],
  [0.15, 18],
  [0.7, 12],
  [1, 11],
];
const SHIN_B: Prof = [
  [0, 20],
  [0.24, 29],
  [0.55, 21],
  [0.86, 12],
  [1, 11],
];
const UARM_F: Prof = [
  [0, 25],
  [0.18, 24],
  [0.5, 20],
  [0.85, 14],
  [1, 14],
];
const UARM_B: Prof = [
  [0, 26],
  [0.3, 22],
  [0.65, 18],
  [1, 14],
];
const FARM_F: Prof = [
  [0, 14],
  [0.22, 18],
  [0.8, 10],
  [1, 10],
];
const FARM_B: Prof = [
  [0, 14],
  [0.3, 16],
  [0.8, 10],
  [1, 10],
];

const scaleProf = (p: Prof, s: number): Prof => p.map(([k, w]) => [k, w * s] as const);

/** Torso outline in torso-local coords (x forward, y up), origin at the hip joint */
const torsoLocal = (puff: number, bulk: number): Pt[] => {
  const ch = (46 + puff * 8) * bulk;
  const bk = 36 * bulk;
  return [
    [16, -24],
    [32, 4],
    [34 * Math.min(1.1, bulk), 40],
    [30 * Math.min(1.1, bulk), 72],
    [ch - 4, 100],
    [ch, 124],
    [ch - 6, 146],
    [24, 160],
    [6, 166],
    [-16, 166],
    [-bk - 2 - puff * 2, 150],
    [-bk - 4, 120],
    [-bk + 6, 82],
    [-34, 46],
    [-46, 12],
    [-42, -16],
    [-20, -32],
  ];
};

/** Fist / hand shapes at the wrist, along direction `dir` (radians), facing `side` */
const handPath = (w: Pt, dir: number, s: number, kind: Hand, side: number, p: Path2D) => {
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const nx = -uy * side;
  const ny = ux * side;
  const at = (a: number, b: number): Pt => [w[0] + (ux * a + nx * b) * s, w[1] + (uy * a + ny * b) * s];
  if (kind === 'open') {
    smoothP([at(-4, 12), at(18, 15), at(26, 24), at(32, 22), at(28, 12), at(46, 9), at(50, 0), at(44, -8), at(18, -12), at(-4, -12)], true, p);
    return;
  }
  if (kind === 'point') {
    smoothP([at(-4, 12), at(14, 15), at(30, 12), at(30, 4), at(56, 4), at(58, -2), at(52, -6), at(30, -8), at(24, -14), at(6, -14), at(-4, -12)], true, p);
    return;
  }
  // fist: squarish knuckle block, knuckles forward along the forearm
  smoothP([at(-4, 13), at(10, 17), at(28, 15), at(34, 6), at(34, -6), at(28, -14), at(10, -15), at(-4, -12)], true, p);
};

const handLines = (w: Pt, dir: number, s: number, kind: Hand, side: number, lw: number, ink: Path2D) => {
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const nx = -uy * side;
  const ny = ux * side;
  const at = (a: number, b: number): Pt => [w[0] + (ux * a + nx * b) * s, w[1] + (uy * a + ny * b) * s];
  if (kind === 'fist' || kind === 'grip') {
    // thumb wrapped over the fingers and finger splits
    brush([at(6, 12), at(18, 10), at(26, 2)], lw * 0.8, ink);
    brush([at(24, -4), at(32, -5)], lw * 0.5, ink, 0.4, 0.4);
    brush([at(22, -10), at(30, -11)], lw * 0.5, ink, 0.4, 0.4);
  } else if (kind === 'point') {
    brush([at(8, 10), at(24, 8)], lw * 0.7, ink);
  } else {
    brush([at(20, 2), at(42, 2)], lw * 0.4, ink, 0.4, 0.4);
  }
};

const shoePath = (ankle: Pt, pitch: number, s: number, dir: number, p: Path2D) => {
  smoothP(shoePts(ankle, pitch, s, dir), true, p);
};
const shoePts = (ankle: Pt, pitch: number, s: number, dir: number): Pt[] => {
  const c = Math.cos(pitch);
  const si = Math.sin(pitch);
  return (
    [
      [-20, -14],
      [8, -18],
      [24, -8],
      [52, 2],
      [66, 12],
      [66, 22],
      [-20, 24],
      [-27, 10],
    ] as Pt[]
  ).map(([x, y]) => [ankle[0] + (x * c - y * si) * s * dir, ankle[1] + (x * si + y * c) * s] as Pt);
};

/** Profile head (facing +x), origin at the top of the neck */
const HEAD: Pt[] = [
  [-18, 4],
  [-30, -22],
  [-35, -52],
  [-25, -79],
  [0, -91],
  [25, -85],
  [35, -67],
  [37, -55],
  [36, -48],
  [47, -35],
  [37, -30],
  [39, -22],
  [36, -18],
  [37, -12],
  [31, -2],
  [16, 3],
  [8, 0],
  [6, 12],
];
const HAIR: Pt[] = [
  [-32, -38],
  [-35, -60],
  [-25, -84],
  [0, -97],
  [27, -91],
  [39, -72],
  [26, -74],
  [12, -70],
  [0, -62],
  [-10, -52],
  [-16, -38],
];

export interface Bones {
  hip: Pt;
  neck: Pt;
  shoulder: Pt;
  kneeN: Pt;
  kneeF: Pt;
  elbowN: Pt;
  elbowF: Pt;
  /** head origin (top of neck) and rotation */
  head: Pt;
  headRot: number;
  /** torso-local to world */
  toW: (x: number, y: number) => Pt;
  /** head-local to world */
  toH: (x: number, y: number) => Pt;
}

/** Solve the joints of a pose (scale s, facing +x when dir = 1) */
export const solve = (p: Pose, s: number, dir: number): Bones => {
  const lean = p.lean * dir;
  const fwd: Pt = [Math.cos(lean), Math.sin(lean)];
  const up: Pt = [Math.sin(lean), -Math.cos(lean)];
  const toW = (x: number, y: number): Pt => [
    p.hip[0] + fwd[0] * x * s * dir + up[0] * y * s,
    p.hip[1] + fwd[1] * x * s * dir + up[1] * y * s,
  ];
  const neck = toW(4, RIG.torso);
  const shoulder = toW(2, 142);
  const lg = p.legs ?? 1;
  const kneeN = ik(p.hip, p.ankleN, RIG.thigh * s * lg, RIG.shin * s * lg, -dir);
  const kneeF = ik(p.hip, p.ankleF, RIG.thigh * s * lg, RIG.shin * s * lg, -dir);
  const elbowN = ik(shoulder, p.wristN, RIG.uarm * s, RIG.farm * s, (p.elbowN ?? 1) * dir);
  const elbowF = ik(shoulder, p.wristF, RIG.uarm * s, RIG.farm * s, (p.elbowF ?? 1) * dir);
  const headRot = lean * 0.45 + (p.head ?? 0) * dir;
  const head = toW(6, 176);
  const hc = Math.cos(headRot);
  const hs = Math.sin(headRot);
  const toH = (x: number, y: number): Pt => [head[0] + (x * hc * dir - y * hs) * s, head[1] + (x * hs * dir + y * hc) * s];
  return { hip: p.hip, neck, shoulder, kneeN, kneeF, elbowN, elbowF, head, headRot, toW, toH };
};

/**
 * Draw a comic figure in profile. Union-outlined body parts in back-to-front order: far arm,
 * far leg, torso + head, (between), near leg, near arm. dir = 1 faces right, -1 faces left.
 * Each part gets a Ben-Day dot shadow down its back edge (light comes from the front).
 */
export const figure = (c: Ctx, pose: Pose, look: Look, s: number, dir = 1, between?: (b: Bones) => void) => {
  const b = solve(pose, s, dir);
  const { toW, toH } = b;
  const lw = look.lw;
  const bulk = look.build ?? 1;
  const sp = (pr: Prof) => scaleProf(pr, s * bulk);
  const L = (a: Pt, e: Pt, f: Prof, bk: Prof, k0 = 0, k1 = 1, add = 0) =>
    dir > 0 ? limbPts(a, e, sp(f), sp(bk), k0, k1, add * s) : limbPts(a, e, sp(bk), sp(f), k0, k1, add * s);
  // shadow strip: the back ~45% of a limb
  const shadeProf = (pr: Prof, back: Prof): Prof => pr.map(([k, w], i) => [k, -w * 0.15 - (back[Math.min(i, back.length - 1)][1] - back[Math.min(i, back.length - 1)][1])] as const);
  const Lshade = (a: Pt, e: Pt, f: Prof, bk: Prof, k0 = 0, k1 = 1, add = 0) =>
    dir > 0 ? limbPts(a, e, sp(shadeProf(f, bk)), sp(bk), k0, k1, add * s) : limbPts(a, e, sp(bk), sp(shadeProf(f, bk)), k0, k1, add * s);

  const skinF = darker(look.skin, 0.18);
  const topF = darker(look.top, 0.25);
  const botF = darker(look.bottom, 0.25);
  const ink = new Path2D();
  const dotR = 2.3 * s;
  const dotS = 9 * s;

  const shade = (path: Path2D, base: string) => {
    c.save();
    c.translate(REG[0], REG[1]);
    c.fillStyle = dots(c, darker(base, 0.42), dotS, dotR);
    c.fill(path);
    c.restore();
  };

  const arm = (wrist: Pt, elbow: Pt, far: boolean, hand: Hand) => {
    const parts: [Path2D, string | CanvasPattern][] = [];
    const sk = far ? skinF : look.skin;
    const tp = far ? topF : look.top;
    const hd = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]);
    const hp = new Path2D();
    handPath(wrist, hd, s * Math.min(1.12, bulk), hand, dir, hp);
    const sleeve = look.topKind === 'hoodie';
    parts.push([polyP(L(b.shoulder, elbow, UARM_F, UARM_B)), sleeve ? tp : sk]);
    parts.push([polyP(L(elbow, wrist, FARM_F, FARM_B)), sleeve ? tp : sk]);
    if (sleeve) parts.push([polyP(L(elbow, wrist, FARM_F, FARM_B, 0.86, 1, -1)), darker(tp, 0.1)]);
    parts.push([hp, sk]);
    if (look.topKind === 'tee') parts.push([polyP(L(b.shoulder, elbow, UARM_F, UARM_B, 0, 0.45, 4)), tp]);
    group(c, parts, lw);
    // shadows
    shade(polyP(Lshade(b.shoulder, elbow, UARM_F, UARM_B, 0.05, 0.95)), sleeve ? tp : sk);
    shade(polyP(Lshade(elbow, wrist, FARM_F, FARM_B, 0.05, 0.9)), sleeve ? tp : sk);
    handLines(wrist, hd, s * Math.min(1.12, bulk), hand, dir, lw, ink);
    const ad = Math.atan2(elbow[1] - b.shoulder[1], elbow[0] - b.shoulder[0]);
    const anx = Math.sin(ad) * dir;
    const any = -Math.cos(ad) * dir;
    const au = (k: number, o: number): Pt => [
      lerp(b.shoulder[0], elbow[0], k) + anx * o * s * bulk,
      lerp(b.shoulder[1], elbow[1], k) + any * o * s * bulk,
    ];
    if (sleeve) {
      // sleeve folds at the elbow
      brush([au(0.72, -6), au(0.86, 4), au(0.92, 12)], lw * 0.6, ink);
      brush([au(0.55, 14), au(0.66, 6)], lw * 0.45, ink);
    } else if ((look.ripped ?? 0) > 0.3) {
      // deltoid cap and bicep / tricep split
      brush([au(0.05, 22), au(0.25, 14), au(0.32, 2)], lw * 0.6, ink);
      brush([au(0.4, -4), au(0.62, 2), au(0.78, 6)], lw * 0.5, ink);
    }
  };

  const leg = (ankle: Pt, knee: Pt, far: boolean, pitch: number) => {
    const parts: [Path2D, string | CanvasPattern][] = [];
    const sk = far ? skinF : look.skin;
    const bt = far ? botF : look.bottom;
    const pants = look.bottomKind === 'pants';
    const shoe = new Path2D();
    shoePath(ankle, pitch, s, dir, shoe);
    if (pants) {
      parts.push([polyP(L(b.hip, knee, THIGH_F, THIGH_B, 0, 1, 2)), bt], [polyP(L(knee, ankle, SHIN_F, SHIN_B, 0, 0.93, 6)), bt]);
    } else {
      parts.push([polyP(L(b.hip, knee, THIGH_F, THIGH_B)), sk], [polyP(L(knee, ankle, SHIN_F, SHIN_B)), sk]);
      parts.push([polyP(L(b.hip, knee, THIGH_F, THIGH_B, 0, 0.5, 5)), bt]);
    }
    parts.push([shoe, far ? darker(look.shoe, 0.2) : look.shoe]);
    group(c, parts, lw);
    shade(polyP(Lshade(b.hip, knee, THIGH_F, THIGH_B, pants ? 0.05 : 0.5, 0.95)), pants ? bt : sk);
    shade(polyP(Lshade(knee, ankle, SHIN_F, SHIN_B, 0.05, 0.85)), pants ? bt : sk);
    if (!pants) shade(polyP(Lshade(b.hip, knee, THIGH_F, THIGH_B, 0.05, 0.48, 5)), bt);
    const td = Math.atan2(knee[1] - b.hip[1], knee[0] - b.hip[0]);
    const tnx = Math.sin(td) * dir;
    const tny = -Math.cos(td) * dir;
    const tu = (k: number, o: number): Pt => [lerp(b.hip[0], knee[0], k) + tnx * o * s * bulk, lerp(b.hip[1], knee[1], k) + tny * o * s * bulk];
    const sd = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]);
    const snx = Math.sin(sd) * dir;
    const sny = -Math.cos(sd) * dir;
    const su = (k: number, o: number): Pt => [lerp(knee[0], ankle[0], k) + snx * o * s * bulk, lerp(knee[1], ankle[1], k) + sny * o * s * bulk];
    if (pants) {
      // knee folds and the break over the shoe
      brush([tu(0.82, -12), tu(0.95, 2), tu(1.0, 14)], lw * 0.6, ink);
      brush([su(0.1, -14), su(0.18, -2)], lw * 0.5, ink);
      brush([su(0.84, -10), su(0.9, 2), su(0.86, 12)], lw * 0.5, ink);
    } else {
      // kneecap and shin line
      brush([tu(0.9, 18), tu(1.02, 22), su(0.1, 16)], lw * 0.55, ink);
      brush([su(0.25, -16), su(0.42, -12)], lw * 0.45, ink);
      if ((look.ripped ?? 0) > 0.3) {
        brush([tu(0.55, 22), tu(0.75, 16), tu(0.88, 8)], lw * 0.55, ink);
        brush([su(0.15, -18), su(0.3, -26), su(0.45, -20)], lw * 0.45, ink);
      }
    }
    const sh = shoePts(ankle, pitch, s, dir);
    brush([lerp2(sh[6], sh[7], 0.4), lerp2(sh[5], sh[4], 0.3)], lw * 0.5, ink, 0.1, 0.1);
    brush([sh[1], lerp2(sh[2], sh[3], 0.6)], lw * 0.45, ink, 0.2, 0.6);
  };

  // far side
  arm(pose.wristF, b.elbowF, true, pose.handF ?? 'fist');
  leg(pose.ankleF, b.kneeF, true, pose.footF ?? 0);

  // torso + head
  {
    const parts: [Path2D, string | CanvasPattern][] = [];
    const tb = Math.max(1, bulk * 0.95);
    const tl = torsoLocal(pose.puff ?? 0, tb);
    const torso = smoothP(tl.map(([x, y]) => toW(x, y)));
    const nb = bulk > 1.1 ? 1.25 : 1;
    const neck = polyP(L(toW(2, 148), toW(6, 184), [[0, 20 * nb], [1, 15]], [[0, 22 * nb], [1, 16]]));
    const head = smoothP(HEAD.map(([x, y]) => toH(x, y)));
    const hair = smoothP(HAIR.map(([x, y]) => toH(x, y)));
    const topShape =
      look.topKind === 'tank'
        ? smoothP(
            tl.map(([x, y]) => {
              const yy = y > 136 ? 136 + (y - 136) * 0.5 : y;
              return toW(x * 1.04 - (y > 136 ? 6 : 0), yy + 2);
            })
          )
        : smoothP(tl.map(([x, y]) => toW(x * 1.05, y + 3)));
    const waist = 62;
    const bl = tl.filter(([, y]) => y < waist).map(([x, y]) => toW(x * 1.05, y - 3));
    bl.unshift(toW(33 * Math.min(1.1, tb), waist));
    bl.push(toW(-34, waist));
    const bottom = smoothP(bl);
    parts.push([neck, look.skin], [head, look.skin], [torso, look.skin], [topShape, look.top], [bottom, look.bottom], [hair, look.hair]);
    if (look.topKind === 'hoodie') {
      parts.push([smoothP(([[-12, 150], [-36, 164], [-30, 186], [-6, 184], [12, 170]] as Pt[]).map(([x, y]) => toW(x, y))), darker(look.top, 0.12)]);
    }
    group(c, parts, lw);
    // torso shadow down the back and the jaw shadow
    const back = smoothP(tl.map(([x, y]) => toW(x > 0 ? -x * 0.1 - 8 : x * 1.04, y + 3)));
    c.save();
    c.clip(topShape);
    shade(back, look.top);
    c.restore();
    c.save();
    c.clip(bottom);
    shade(back, look.bottom);
    c.restore();
    if (look.topDots) {
      c.save();
      c.clip(topShape);
      c.fillStyle = dots(c, look.topDots, 13 * s, 2.6 * s);
      c.fill(topShape);
      c.restore();
    }
    c.save();
    c.clip(head);
    shade(smoothP([toH(-40, -40), toH(-6, -46), toH(4, -30), toH(14, -8), toH(30, 4), toH(-30, 10)]), look.skin);
    c.restore();
    // face details
    const fi = new Path2D();
    const sq = clamp(pose.squint ?? 0);
    if (sq < 0.5) {
      // open eye: almond, iris
      fi.addPath(smoothP([toH(19, -52), toH(25, -55), toH(31, -52), toH(25, -49.5)]));
      c.save();
      c.fillStyle = POP.white;
      c.fill(smoothP([toH(19, -52), toH(25, -55), toH(31, -52), toH(25, -49.5)]));
      c.restore();
      fi.addPath(circPath(...toH(27, -52), 2.4 * s));
      brush([toH(18, -53), toH(25, -56.5), toH(32, -53)], lw * 0.8, fi, 0.4, 0.4);
    } else {
      brush([toH(18, -54), toH(25, -51), toH(32, -53)], lw * 1.2, fi, 0.4, 0.4);
      brush([toH(22, -46), toH(28, -44)], lw * 0.5, fi);
    }
    // brow
    brush([toH(14, -60 + sq * 2), toH(25, -63 + sq * 4), toH(36, -61 + sq * 3)], lw * 1.3, fi, 0.6, 0.8);
    // nose wing, ear, cheek
    brush([toH(37, -34), toH(33, -32)], lw * 0.5, fi, 0.5, 0.5);
    brush([toH(-4, -56), toH(-14, -52), toH(-13, -38), toH(-4, -34)], lw * 0.6, fi);
    brush([toH(-8, -50), toH(-9, -42)], lw * 0.4, fi);
    const m = pose.mouth ?? 0;
    if (m > 0.7) {
      const mp = smoothP([toH(25, -25), toH(37, -27), toH(36, -11), toH(25, -13)]);
      c.fillStyle = POP.black;
      c.fill(mp);
      c.fillStyle = POP.white;
      c.fill(smoothP([toH(27, -24), toH(36, -25.5), toH(36, -22), toH(27, -21.5)]));
    } else if (m < -0.2) {
      c.fillStyle = POP.white;
      const tp = smoothP([toH(25, -22), toH(37, -24), toH(37, -15), toH(25, -15)]);
      c.fill(tp);
      fi.addPath(new Path2D());
      brush([toH(24, -22), toH(31, -23), toH(38, -24)], lw * 0.7, fi, 0.2, 0.2);
      brush([toH(24, -15), toH(38, -15)], lw * 0.7, fi, 0.2, 0.2);
      brush([toH(25, -18.5), toH(37, -19.5)], lw * 0.35, fi, 0.1, 0.1);
      brush([toH(30, -23), toH(30, -15)], lw * 0.3, fi, 0.1, 0.1);
    } else if (m > 0.3) {
      brush([toH(24, -21), toH(31, -17), toH(37, -21)], lw * 0.7, fi, 0.4, 0.4);
    } else brush([toH(26, -19), toH(36, -19.5)], lw * 0.6, fi, 0.3, 0.6);
    brush([toH(8, -12), toH(20, -4)], lw * 0.45, fi);
    if (look.beard) {
      c.fillStyle = look.hair;
      c.fill(smoothP([toH(6, -14), toH(24, -6), toH(32, -12), toH(36, -6), toH(31, 0), toH(16, 4), toH(6, 0)]));
    }
    if (look.glasses) {
      c.save();
      c.strokeStyle = POP.black;
      c.lineWidth = lw * 0.75;
      c.lineJoin = 'round';
      c.stroke(smoothP([toH(17, -58), toH(34, -58), toH(34, -46), toH(18, -46)]));
      c.beginPath();
      c.moveTo(...toH(17, -55));
      c.lineTo(...toH(-6, -52));
      c.stroke();
      c.restore();
    }
    // waist band, chest / pec line, folds
    brush([toW(-35, waist), toW(0, waist + 1), toW(34, waist)], lw * 0.6, fi, 0.1, 0.1);
    if (look.topKind === 'tank') {
      brush([toW(8, 162), toW(20, 140), toW(40 * tb, 120)], lw * 0.5, fi);
      if ((look.ripped ?? 0) > 0.3) brush([toW(14, 104), toW(34, 98), toW(44 * tb, 108)], lw * 0.55, fi);
    }
    if (look.topKind === 'hoodie') {
      brush([toW(18, 152), toW(22, 124)], lw * 0.4, fi);
      brush([toW(-12, 104), toW(8, 86), toW(26, 80)], lw * 0.45, fi);
      brush([toW(-20, 72), toW(4, 66), toW(30, 70)], lw * 0.4, fi);
      // kangaroo pocket
      brush([toW(4, 66), toW(10, 92), toW(34, 94)], lw * 0.45, fi);
    }
    c.fillStyle = POP.black;
    c.fill(fi);
  }
  between?.(b);
  leg(pose.ankleN, b.kneeN, false, pose.footN ?? 0);
  arm(pose.wristN, b.elbowN, false, pose.handN ?? 'fist');
  c.fillStyle = POP.black;
  c.fill(ink);
  return b;
};

const lerp2 = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/**
 * Poster finish: the frame settles into a print on cream stock (a mat with a heavier bottom
 * margin and a black panel line), with the title lettered in the bottom margin. k 0..1.
 * Draw in screen space (camera reset) after everything else.
 */
export const posterFinish = (c: Ctx, k: number, title: string, size = 64, color: string = POP.black, accent: string = POP.red) => {
  if (k <= 0) return;
  const m = 34 * k;
  const bm = 128 * k;
  const frame = rectPath(-20, -20, 1640, 940);
  frame.rect(m, m, 1600 - m * 2, 900 - m - bm);
  c.save();
  c.fillStyle = POP.cream;
  c.fill(frame, 'evenodd');
  c.fillStyle = dots(c, rgba(POP.paper, 0.9), 10, 1.2);
  c.fill(frame, 'evenodd');
  c.strokeStyle = POP.black;
  c.lineWidth = 7;
  c.strokeRect(m, m, 1600 - m * 2, 900 - m - bm);
  const a = clamp((k - 0.4) / 0.6);
  if (a > 0) {
    c.globalAlpha = a;
    const y = 900 - bm / 2 - size / 2 + (1 - a) * 20;
    // red plate a hair off the black, like a two-colour title
    letter(c, title, 800 + REG[0] * 1.6, y + REG[1] * 1.6, size, 0.5, accent, 0.17, 11);
    letter(c, title, 800, y, size, 0.5, color, 0.17, 11);
    const rule = new Path2D();
    const w = measure(title, size) / 2 + 40;
    brush([[800 - w - 180, y + size / 2], [800 - w, y + size / 2]], 6, rule, 0.4, 0.1);
    brush([[800 + w, y + size / 2], [800 + w + 180, y + size / 2]], 6, rule, 0.1, 0.4);
    c.fillStyle = color;
    c.fill(rule);
  }
  c.restore();
};
