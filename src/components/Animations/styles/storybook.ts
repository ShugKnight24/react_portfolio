/**
 * Storybook helpers: soft watercolour on cold-press paper (direct mode films).
 *
 * The look: transparent washes glazed with multiply so the white of the paper is the light;
 * pigment that pools into darker wet edges; granulation that settles into the paper tooth;
 * cauliflower blooms where wet met damp; a loose pencil underdrawing that never quite lines up
 * with the paint; a limited soft palette (sky blues, sunset apricot, rose red, fox ochre); and a
 * gentle vignette. Static art is baked into plates in setup; characters are painted per frame
 * with a cheap version of the same wash (reserve, glaze, granulation, rim, pencil).
 * Everything is deterministic: seeded randomness only.
 */
import type { Ctx, Riso } from '../riso/engine';
import { SERIF, TAU, clamp, lerp, mulberry, smoothPath, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const SB = {
  paper: '#f8f3e8',
  graphite: '#4d4650',
  // sky
  skyHi: '#cfe0ec',
  sky: '#9fc0da',
  skyDeep: '#5f86b4',
  dusk: '#3f5a8c',
  night: '#27355f',
  nightDeep: '#1b2446',
  // sunset
  apricot: '#f4b282',
  apricotDeep: '#e48a5c',
  blush: '#eba7a0',
  gold: '#efc777',
  // wheat
  wheat: '#e2b862',
  wheatDeep: '#bf8a3c',
  wheatPale: '#efd79c',
  // rose
  rose: '#cf4a52',
  roseDeep: '#9d2f3d',
  leaf: '#7f9e6c',
  leafDeep: '#55744f',
  // fox (Luna)
  fox: '#d69a5a',
  foxDeep: '#aa6834',
  foxPale: '#f5ead9',
  foxEar: '#4a3328',
  nose: '#2c2322',
  // the prince
  coat: '#5779a6',
  coatDeep: '#3a5682',
  tunic: '#efe2c6',
  trousers: '#6c6782',
  boots: '#7c5541',
  skin: '#e6b28e',
  skinDeep: '#c4876a',
  beard: '#3a2d29',
  scarf: '#cc4b52',
  // ground
  planet: '#b9c49a',
  planetDeep: '#8a9a72',
  earth: '#c9a77a',
  stone: '#a7a1a6',
  wood: '#9b6b47',
} as const;

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

export const rgba = (h: string, a: number) => {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`;
};
export const mixHex = (a: string, b: string, k: number) => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return toHex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
};
const deepCache = new Map<string, string>();
/** A deeper, richer version of a pigment (as if it pooled), k 0..1 */
export const deepen = (h: string, k = 0.4) => {
  const key = h + k;
  let v = deepCache.get(key);
  if (!v) {
    const [r, g, b] = hexRgb(h);
    v = toHex(lerp(r, (r * r) / 255, k) * (1 - k * 0.15), lerp(g, (g * g) / 255, k) * (1 - k * 0.15), lerp(b, (b * b) / 255, k) * (1 - k * 0.1));
    deepCache.set(key, v);
  }
  return v;
};
/** Multi-stop colour ramp */
export const ramp = (stops: [number, string][], k: number) => {
  if (k <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) return mixHex(stops[i - 1][1], stops[i][1], (k - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return stops[stops.length - 1][1];
};

/* ---------- timing & camera ---------- */

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

export interface Cam {
  x: number;
  y: number;
  z: number;
  rot?: number;
}
export const applyCam = (r: Riso, v: Cam) => r.camera(v.x, v.y, v.z, v.rot ?? 0);
/** Camera for a depth layer: p = 1 moves with the camera, p -> 0 barely moves */
export const layerView = (C: Cam, p: number): Cam => ({
  x: 800 + (C.x - 800) * p,
  y: 450 + (C.y - 450) * p,
  z: Math.exp(Math.log(C.z) * p),
  rot: (C.rot ?? 0) * p,
});
/** Screen point of a world point under a camera */
export const toScreen = (v: Cam, x: number, y: number): Pt => {
  const dx = (x - v.x) * v.z;
  const dy = (y - v.y) * v.z;
  const c = Math.cos(v.rot ?? 0);
  const s = Math.sin(v.rot ?? 0);
  return [800 + dx * c - dy * s, 450 + dx * s + dy * c];
};
/** Reset to screen space */
export const screen = (r: Riso) => r.camera(800, 450, 1);

/* ---------- studio: textures and sprites ---------- */

export interface Studio {
  /** device px per logical px used for the tiles */
  ts: number;
  tile: HTMLCanvasElement;
  gran: Map<string, CanvasPattern>;
  tooth: CanvasPattern;
  star: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

const TILE = 180;

const makeTile = (ts: number, seed: number) => {
  const n = Math.round(TILE * ts);
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const g = cv.getContext('2d');
  if (!g) throw new Error('2d');
  const rng = mulberry(seed);
  const img = g.createImageData(n, n);
  const d = img.data;
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      // periodic low-frequency field: where pigment settles (paper valleys)
      const lf =
        0.5 +
        0.22 * Math.sin(TAU * (3 * u + 0.35 * Math.sin(TAU * 2 * v + ph[0])) + ph[1]) +
        0.18 * Math.sin(TAU * (4 * v + 2 * u) + ph[2]) +
        0.1 * Math.sin(TAU * (7 * u - 5 * v) + ph[3]);
      const dens = 0.05 + 0.32 * lf * lf;
      const i = (y * n + x) * 4;
      if (rng() < dens) d[i + 3] = Math.round((0.25 + 0.75 * rng()) * 255 * clamp(lf + 0.2));
    }
  }
  g.putImageData(img, 0, 0);
  // clumps
  for (let k = 0; k < 1300; k++) {
    const x = rng() * n;
    const y = rng() * n;
    const r = (0.35 + rng() * rng() * 1.3) * ts;
    g.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.5})`;
    for (const ox of [-n, 0, n])
      for (const oy of [-n, 0, n]) {
        if (x + ox < -3 || x + ox > n + 3 || y + oy < -3 || y + oy > n + 3) continue;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, TAU);
        g.fill();
      }
  }
  return cv;
};

const tinted = (tile: HTMLCanvasElement, color: string) => {
  const cv = document.createElement('canvas');
  cv.width = tile.width;
  cv.height = tile.height;
  const g = cv.getContext('2d');
  if (!g) throw new Error('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(tile, 0, 0);
  return cv;
};

const sprite = (size: number, stops: [number, string][]) => {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) throw new Error('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, c] of stops) gr.addColorStop(k, c);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return cv;
};

export const makeStudio = (r: Riso): Studio => {
  const ts = Math.min(2, Math.max(1, r.scale));
  const tile = makeTile(ts, 4242);
  const main = r.layers[0];
  const toothCv = tinted(makeTile(ts, 777), 'rgba(110,98,92,0.16)');
  const tooth = main.createPattern(toothCv, 'repeat');
  if (!tooth) throw new Error('pattern');
  tooth.setTransform(new DOMMatrix().scale(1 / ts));
  return {
    ts,
    tile,
    gran: new Map(),
    tooth,
    star: sprite(Math.round(48 * ts), [
      [0, 'rgba(255,253,240,1)'],
      [0.12, 'rgba(255,246,214,0.95)'],
      [0.3, 'rgba(255,236,190,0.35)'],
      [1, 'rgba(255,230,180,0)'],
    ]),
    glow: sprite(Math.round(128 * ts), [
      [0, 'rgba(255,236,190,0.55)'],
      [0.4, 'rgba(255,214,160,0.2)'],
      [1, 'rgba(255,210,150,0)'],
    ]),
  };
};

/** Granulation pattern in a pigment colour */
export const granFor = (st: Studio, color: string) => {
  let p = st.gran.get(color);
  if (!p) {
    const cv = tinted(st.tile, color);
    const g = cv.getContext('2d');
    const pat = g?.createPattern(cv, 'repeat') ?? null;
    if (!pat) throw new Error('pattern');
    pat.setTransform(new DOMMatrix().scale(1 / st.ts));
    st.gran.set(color, pat);
    p = pat;
  }
  return p;
};

/** Device px per local unit for the current transform */
export const unitPx = (g: Ctx) => {
  const m = g.getTransform();
  return Math.hypot(m.a, m.b) || 1;
};

/* ---------- paint ---------- */

export interface WashOpts {
  /** pigment alpha */
  a?: number;
  /** granulation alpha (0 = none) */
  gran?: number;
  granColor?: string;
  /** wet-edge width in logical screen px */
  rim?: number;
  rimA?: number;
  edge?: string;
  /** paper underlay so the glaze reads over anything behind it */
  reserve?: number;
  /** linear gradient to a second pigment: x0, y0, x1, y1, colour */
  grad?: [number, number, number, number, string];
  /** soft wet edge (plates only, costs a filter) */
  soft?: boolean;
}

/**
 * One watercolour wash: optional paper reserve, a multiply glaze, granulation settling into the
 * tooth, and a darker rim where the pigment pooled at the wet edge.
 */
export const wash = (g: Ctx, st: Studio, path: Path2D, color: string, o: WashOpts = {}) => {
  g.save();
  if (o.reserve) {
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = o.reserve;
    g.fillStyle = SB.paper;
    g.fill(path);
  }
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = o.a ?? 0.88;
  if (o.grad) {
    const [x0, y0, x1, y1, c2] = o.grad;
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, color);
    lg.addColorStop(1, c2);
    g.fillStyle = lg;
  } else g.fillStyle = color;
  g.fill(path);
  const gr = o.gran ?? 0.45;
  const u = unitPx(g);
  if (gr > 0) {
    g.globalAlpha = gr;
    const pat = granFor(st, o.granColor ?? deepen(color, 0.55));
    // granules stay paper-sized however close the camera is
    pat.setTransform(new DOMMatrix().scale(1 / u));
    g.fillStyle = pat;
    g.fill(path);
  }
  const rim = o.rim ?? 2.2;
  if (rim > 0) {
    g.clip(path);
    g.globalAlpha = o.rimA ?? 0.5;
    g.strokeStyle = o.edge ?? deepen(color, 0.5);
    g.lineWidth = (2 * rim * st.ts) / u;
    g.lineJoin = 'round';
    if (o.soft) g.filter = `blur(${(1.2 * st.ts).toFixed(1)}px)`;
    g.stroke(path);
    if (o.soft) {
      g.filter = 'none';
      g.lineWidth = (0.9 * st.ts) / u;
      g.globalAlpha = (o.rimA ?? 0.5) * 0.8;
      g.stroke(path);
    }
  }
  g.restore();
};

/** Lift pigment back to paper (a highlight), soft-edged by alpha */
export const lift = (g: Ctx, path: Path2D, a = 0.6) => {
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = a;
  g.fillStyle = SB.paper;
  g.fill(path);
  g.restore();
};

/** Loose graphite underdrawing, a touch off-register from the paint */
export const pencil = (g: Ctx, st: Studio, path: Path2D, a = 0.42, w = 0.85, dx = 0.8, dy = -0.6) => {
  const u = unitPx(g);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = a;
  g.strokeStyle = SB.graphite;
  g.lineWidth = (w * st.ts) / u;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.translate((dx * st.ts) / u, (dy * st.ts) / u);
  g.stroke(path);
  g.restore();
};

/** Pencil construction line through points, with overshoot past both ends */
export const sketchLine = (g: Ctx, st: Studio, pts: Pt[], a = 0.22, over = 6, w = 0.7) => {
  if (pts.length < 2) return;
  const p = new Path2D();
  const [a0, a1] = [pts[0], pts[1]];
  const l0 = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
  p.moveTo(a0[0] - ((a1[0] - a0[0]) / l0) * over, a0[1] - ((a1[1] - a0[1]) / l0) * over);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  const b0 = pts[pts.length - 2];
  const b1 = pts[pts.length - 1];
  const l1 = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) || 1;
  p.lineTo(b1[0] + ((b1[0] - b0[0]) / l1) * over, b1[1] + ((b1[1] - b0[1]) / l1) * over);
  pencil(g, st, p, a, w, 0, 0);
};

/** Irregular wet shape: periodic lobes so it closes cleanly */
export const blobPts = (cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.1, n = 40, rot = 0): Pt[] => {
  const rng = mulberry(seed * 7919 + 13);
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (0.55 * Math.sin(2 * a + ph[0]) + 0.35 * Math.sin(3 * a + ph[1]) + 0.25 * Math.sin(5 * a + ph[2]) + 0.15 * Math.sin(9 * a + ph[3]));
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    out.push([cx + x * cs - y * sn, cy + x * sn + y * cs]);
  }
  return out;
};
export const blob = (cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.1, rot = 0, p: Path2D = new Path2D()) =>
  smoothPath(blobPts(cx, cy, rx, ry, seed, wob, 40, rot), true, 0.5, p);

/** Cauliflower bloom (backrun): plates only, lifts pigment and leaves a darker frilled edge */
export const bloomAt = (g: Ctx, st: Studio, cx: number, cy: number, rad: number, color: string, seed: number, a = 0.3) => {
  const rng = mulberry(seed * 31 + 5);
  const pts: Pt[] = [];
  const n = 56;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU;
    const lobe = 0.82 + 0.18 * Math.abs(Math.sin(ang * (5 + Math.floor(rng() * 3)) + seed)) + (rng() - 0.5) * 0.06;
    pts.push([cx + Math.cos(ang) * rad * lobe, cy + Math.sin(ang) * rad * lobe * 0.8]);
  }
  const p = smoothPath(pts, true, 0.4);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = a;
  g.fill(p);
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = a * 1.1;
  g.strokeStyle = deepen(color, 0.35);
  g.lineWidth = (1.4 * st.ts) / unitPx(g);
  g.stroke(p);
  g.restore();
};

/** Wet-in-wet mottling: soft overlapping glazes in nearby hues */
export const mottle = (g: Ctx, x: number, y: number, w: number, h: number, colors: string[], n: number, seed: number, a = 0.12, size = 1) => {
  const rng = mulberry(seed);
  g.save();
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < n; i++) {
    const cx = x + rng() * w;
    const cy = y + rng() * h;
    const rr = (40 + rng() * 160) * size;
    const col = colors[Math.floor(rng() * colors.length)];
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, rgba(col, a * (0.5 + rng())));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
  g.restore();
};

/** Soft paper-white clouds or lifts scattered over an area */
export const lifts = (g: Ctx, x: number, y: number, w: number, h: number, n: number, seed: number, a = 0.25, size = 1) => {
  const rng = mulberry(seed);
  g.save();
  for (let i = 0; i < n; i++) {
    const cx = x + rng() * w;
    const cy = y + rng() * h;
    const rr = (30 + rng() * 120) * size;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, rgba(SB.paper, a * (0.4 + rng() * 0.6)));
    gr.addColorStop(1, rgba(SB.paper, 0));
    g.fillStyle = gr;
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
  g.restore();
};

/* ---------- plates ---------- */

export interface Plate {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bake static art for the world rect (x, y, w, h); fn draws in world coords. res = px per unit at scale 1 */
export const bake = (r: Riso, x: number, y: number, w: number, h: number, res: number, fn: (g: Ctx) => void, maxPx = 5.5e6): Plate => {
  let k = res * r.scale;
  if (w * h * k * k > maxPx) k = Math.sqrt(maxPx / (w * h));
  const { canvas, ctx } = r.scratch((w * k) / r.scale, (h * k) / r.scale);
  ctx.setTransform(k, 0, 0, k, -x * k, -y * k);
  fn(ctx);
  return { canvas, x, y, w, h };
};

export const drawPlate = (c: Ctx, p: Plate, alpha = 1, op: GlobalCompositeOperation = 'source-over') => {
  if (alpha <= 0.003) return;
  c.save();
  c.globalAlpha = alpha;
  c.globalCompositeOperation = op;
  c.drawImage(p.canvas, p.x, p.y, p.w, p.h);
  c.restore();
};

/* ---------- light: stars, glows, finish ---------- */

export const starAt = (c: Ctx, st: Studio, x: number, y: number, size: number, a = 1) => {
  if (a <= 0.01) return;
  c.globalAlpha = a;
  c.drawImage(st.star, x - size, y - size, size * 2, size * 2);
};
export const glowAt = (c: Ctx, st: Studio, x: number, y: number, size: number, a = 1) => {
  if (a <= 0.01) return;
  c.globalAlpha = a;
  c.drawImage(st.glow, x - size, y - size, size * 2, size * 2);
};
/** A four-point twinkle */
export const sparkle = (c: Ctx, x: number, y: number, len: number, w: number, color: string, a = 1, rot = 0) => {
  if (a <= 0.01) return;
  const p = new Path2D();
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const pt = (u: number, v: number): [number, number] => [x + u * cs - v * sn, y + u * sn + v * cs];
  const pts: [number, number][] = [pt(0, -len), pt(w, -w), pt(len, 0), pt(w, w), pt(0, len), pt(-w, w), pt(-len, 0), pt(-w, -w)];
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fill(p);
};

/** Paper tooth and a gentle vignette over the finished frame */
export const finish = (r: Riso, st: Studio, vig = 0.35, tooth = 1) => {
  const c = r.layers[0];
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  c.globalCompositeOperation = 'multiply';
  if (tooth > 0) {
    c.globalAlpha = tooth;
    c.fillStyle = st.tooth;
    c.fillRect(0, 0, 1600, 900);
  }
  if (vig > 0) {
    const g = c.createRadialGradient(800, 450, 260, 800, 470, 1000);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, `rgba(196,178,170,${(vig * 0.35).toFixed(3)})`);
    g.addColorStop(1, `rgba(120,98,100,${vig.toFixed(3)})`);
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
  }
  c.restore();
};

/* ---------- shapes ---------- */

const vec = (a: number, l: number): Pt => [Math.sin(a) * l, Math.cos(a) * l];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const rot = (p: Pt, a: number, o: Pt = [0, 0]): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - o[0];
  const y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
};
const angOf = (from: Pt, to: Pt) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/** Rounded tapered limb from a (width w0) to b (width w1), with an optional swell on one side */
export const limb = (a: Pt, b: Pt, w0: number, w1: number, p: Path2D = new Path2D(), bulge = 0) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const r0 = w0 / 2;
  const r1 = w1 / 2;
  const m = (k: number, side: number): Pt => [a[0] + dx * k + nx * side, a[1] + dy * k + ny * side];
  const pts: Pt[] = [
    [a[0] - ux * r0 * 0.8, a[1] - uy * r0 * 0.8],
    m(0.02, r0),
    m(0.4, lerp(r0, r1, 0.4) + Math.max(0, bulge)),
    m(0.98, r1),
    [b[0] + ux * r1 * 0.8, b[1] + uy * r1 * 0.8],
    m(0.98, -r1),
    m(0.4, -lerp(r0, r1, 0.4) - Math.max(0, -bulge)),
    m(0.02, -r0),
  ];
  return smoothPath(pts, true, 0.5, p);
};

/** Ribbon along a centre line with a width profile */
export const ribbon = (pts: Pt[], width: (k: number) => number, p: Path2D = new Path2D()) => {
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = width(i / (n - 1)) / 2;
    left.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    right.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  return smoothPath([...left, ...right.reverse()], true, 0.45, p);
};

/** One clean outline along a jointed chain (shoulder-elbow-wrist...), widths per joint */
export const chain = (pts: Pt[], ws: number[], p: Path2D = new Path2D()) => {
  const P: Pt[] = [];
  const Wd: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const f = k / 3;
      P.push([lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]);
      Wd.push(lerp(ws[i], ws[i + 1], f));
    }
  }
  P.push(pts[pts.length - 1]);
  Wd.push(ws[ws.length - 1]);
  const n = P.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = Wd[i] / 2;
    left.push([P[i][0] - (dy / l) * w, P[i][1] + (dx / l) * w]);
    right.push([P[i][0] + (dy / l) * w, P[i][1] - (dx / l) * w]);
  }
  const d0x = P[1][0] - P[0][0];
  const d0y = P[1][1] - P[0][1];
  const l0 = Math.hypot(d0x, d0y) || 1;
  const d1x = P[n - 1][0] - P[n - 2][0];
  const d1y = P[n - 1][1] - P[n - 2][1];
  const l1 = Math.hypot(d1x, d1y) || 1;
  const cap0: Pt = [P[0][0] - (d0x / l0) * Wd[0] * 0.45, P[0][1] - (d0y / l0) * Wd[0] * 0.45];
  const cap1: Pt = [P[n - 1][0] + (d1x / l1) * Wd[n - 1] * 0.45, P[n - 1][1] + (d1y / l1) * Wd[n - 1] * 0.45];
  return smoothPath([cap0, ...left, cap1, ...right.reverse()], true, 0.5, p);
};

/* ---------- wheat ---------- */

export interface Stalk {
  x: number;
  y: number;
  h: number;
  /** thickness scale */
  s: number;
  ph: number;
  /** colour band 0..n-1 */
  c: number;
}

/**
 * A batch of wheat stalks: one stroke path for stems and awns, one fill path per colour band for
 * the ears. bend(x, y) gives the wind lean in radians at that spot.
 */
export const wheat = (
  c: Ctx,
  st: Studio,
  stalks: Stalk[],
  bend: (s: Stalk) => number,
  colors: string[],
  stem: string,
  o: { a?: number; awns?: boolean; reserve?: boolean } = {}
) => {
  const stems = new Path2D();
  const awns = new Path2D();
  const heads = colors.map(() => new Path2D());
  let maxS = 0;
  for (const s of stalks) {
    const b = bend(s);
    const sx = Math.sin(b);
    const cy = Math.cos(b);
    const tip: Pt = [s.x + sx * s.h, s.y - cy * s.h];
    const mid: Pt = [s.x + Math.sin(b * 0.45) * s.h * 0.55, s.y - s.h * 0.55];
    stems.moveTo(s.x, s.y);
    stems.quadraticCurveTo(mid[0], mid[1], tip[0], tip[1]);
    // ear: a plump tapered grain head continuing the stem direction
    const hl = s.h * 0.27;
    const hw = 2.5 * s.s;
    const ux = sx;
    const uy = -cy;
    const nx = -uy;
    const ny = ux;
    const b0: Pt = [tip[0] - ux * hl * 0.15, tip[1] - uy * hl * 0.15];
    const e: Pt = [tip[0] + ux * hl, tip[1] + uy * hl];
    const hp = heads[((s.c % heads.length) + heads.length) % heads.length];
    hp.moveTo(b0[0], b0[1]);
    hp.bezierCurveTo(b0[0] + ux * hl * 0.3 + nx * hw * 1.5, b0[1] + uy * hl * 0.3 + ny * hw * 1.5, b0[0] + ux * hl * 0.8 + nx * hw * 0.9, b0[1] + uy * hl * 0.8 + ny * hw * 0.9, e[0], e[1]);
    hp.bezierCurveTo(b0[0] + ux * hl * 0.8 - nx * hw * 0.9, b0[1] + uy * hl * 0.8 - ny * hw * 0.9, b0[0] + ux * hl * 0.3 - nx * hw * 1.5, b0[1] + uy * hl * 0.3 - ny * hw * 1.5, b0[0], b0[1]);
    if (o.awns) {
      for (let k = 0; k < 2; k++) {
        const q = 0.45 + k * 0.35;
        const ax = b0[0] + ux * hl * q;
        const ay = b0[1] + uy * hl * q;
        const side = k % 2 ? 1 : -1;
        awns.moveTo(ax + nx * hw * side * 0.8, ay + ny * hw * side * 0.8);
        awns.lineTo(ax + ux * hl * 0.55 + nx * hw * side * 2.6, ay + uy * hl * 0.55 + ny * hw * side * 2.6);
      }
    }
    maxS = Math.max(maxS, s.s);
  }
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = o.a ?? 0.85;
  c.lineCap = 'round';
  c.strokeStyle = stem;
  c.lineWidth = 0.75 * maxS;
  c.stroke(stems);
  if (o.awns) {
    c.globalAlpha = (o.a ?? 0.85) * 0.6;
    c.lineWidth = 0.5 * maxS;
    c.stroke(awns);
  }
  c.restore();
  heads.forEach((hp, i) => {
    if (o.reserve) lift(c, hp, 0.7);
    wash(c, st, hp, colors[i], { a: 1, gran: 0.35, rim: 1, rimA: 0.6, edge: deepen(colors[i], 0.55) });
  });
};

/* ---------- the prince ---------- */

export interface ManPose {
  /** torso lean from vertical, + forward */
  spine: number;
  /** head tilt relative to the torso, + nods forward/down, - looks up */
  head: number;
  /** arms: absolute angles from straight down, + forward: [upper, fore, hand] */
  aN: [number, number, number];
  aF: [number, number, number];
  /** legs: absolute angles: [thigh, shin, foot] (foot pi/2 = flat, pointing forward) */
  lN: [number, number, number];
  lF: [number, number, number];
  smile?: number;
  blink?: number;
  /** eye direction: - up, + down */
  look?: number;
}

const TORSO = 30;
const UA = 14.5;
const FA = 13.5;
const TH = 21;
const SH = 20;
const FOOT = 9;

export const MAN_STAND: ManPose = {
  spine: 0.02, head: 0, aN: [0.08, 0.16, 0.16], aF: [-0.06, 0.04, 0.04], lN: [0.04, -0.02, Math.PI / 2], lF: [-0.04, 0.02, Math.PI / 2], smile: 0.6,
};

export const mixMan = (a: ManPose, b: ManPose, k: number): ManPose => {
  const m3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
  return {
    spine: lerp(a.spine, b.spine, k),
    head: lerp(a.head, b.head, k),
    aN: m3(a.aN, b.aN),
    aF: m3(a.aF, b.aF),
    lN: m3(a.lN, b.lN),
    lF: m3(a.lF, b.lF),
    smile: lerp(a.smile ?? 0.6, b.smile ?? 0.6, k),
    blink: lerp(a.blink ?? 0, b.blink ?? 0, k),
    look: lerp(a.look ?? 0, b.look ?? 0, k),
  };
};

export interface ManJoints {
  pelvis: Pt;
  neck: Pt;
  head: Pt;
  headA: number;
  sN: Pt; eN: Pt; wN: Pt; hN: Pt;
  sF: Pt; eF: Pt; wF: Pt; hF: Pt;
  hipN: Pt; kN: Pt; anN: Pt; toeN: Pt;
  hipF: Pt; kF: Pt; anF: Pt; toeF: Pt;
}

export const manJoints = (p: ManPose): ManJoints => {
  const up: Pt = [Math.sin(p.spine), -Math.cos(p.spine)];
  const fw: Pt = [Math.cos(p.spine), Math.sin(p.spine)];
  const at = (h: number, d: number): Pt => [up[0] * h + fw[0] * d, up[1] * h + fw[1] * d];
  const neck = at(TORSO, 0);
  const headA = p.spine + p.head;
  const head = add(neck, [Math.sin(headA) * 11.5 + Math.cos(headA) * 0.5, -Math.cos(headA) * 11.5 + Math.sin(headA) * 0.5]);
  const sN = at(TORSO - 4, 1);
  const sF = at(TORSO - 3.5, -1.5);
  const arm = (s: Pt, a: [number, number, number]) => {
    const e = add(s, vec(a[0], UA));
    const w = add(e, vec(a[1], FA));
    const h = add(w, vec(a[2], 4));
    return [e, w, h];
  };
  const [eN, wN, hN] = arm(sN, p.aN);
  const [eF, wF, hF] = arm(sF, p.aF);
  const leg = (h: Pt, a: [number, number, number]) => {
    const k = add(h, vec(a[0], TH));
    const an = add(k, vec(a[1], SH));
    const toe = add(an, vec(a[2], FOOT));
    return [k, an, toe];
  };
  const hipN: Pt = at(1, 1.5);
  const hipF: Pt = at(1.5, -1.5);
  const [kN, anN, toeN] = leg(hipN, p.lN);
  const [kF, anF, toeF] = leg(hipF, p.lF);
  return { pelvis: [0, 0], neck, head, headA, sN, eN, wN, hN, sF, eF, wF, hF, hipN, kN, anN, toeN, hipF, kF, anF, toeF };
};

/** Lowest point of the boots below the pelvis, in rig units */
export const manLow = (p: ManPose) => {
  const j = manJoints(p);
  return Math.max(j.anN[1], j.anF[1], j.toeN[1], j.toeF[1]) + 3.2;
};

const bootPath = (an: Pt, toe: Pt, p: Path2D) => {
  const a = Math.atan2(toe[1] - an[1], toe[0] - an[0]);
  const P = (x: number, y: number): Pt => add(an, rot([x, y], a));
  return smoothPath([P(-4, -3.5), P(-1.5, -5), P(3, -3.8), P(9.5, -1.6), P(11.5, 1.2), P(10, 3.4), P(-3.5, 3.4), P(-5, 0.5)], true, 0.45, p);
};

const handPath = (w: Pt, h: Pt, p: Path2D, grip = 0.5) => {
  const a = Math.atan2(h[1] - w[1], h[0] - w[0]);
  const P = (x: number, y: number): Pt => add(w, rot([x, y], a));
  smoothPath([P(-0.5, -2.6), P(3, -3.1), P(6, -2.2 + grip), P(7, 0.4), P(5.5, 2.6), P(1.5, 2.9), P(-0.6, 2.2)], true, 0.5, p);
  // thumb
  smoothPath([P(1.5, -2), P(4.2, -4.3), P(5.6, -3.6), P(3.8, -1.2)], true, 0.5, p);
  return p;
};

export interface ManOpts {
  t: number;
  /** wind for scarf and coat: + blows the scarf backwards (to -x in rig space) */
  wind?: number;
  /** extra lift for the scarf tails (rising, falling) */
  scarfLift?: number;
  /** multiply tint over the whole figure: [colour, alpha] (night, dusk) */
  tint?: [string, number];
  /** warm rim light from one side: alpha */
  glow?: number;
  /** rig y of the ground, so a seated coat drapes on it */
  ground?: number;
  /** hide the far arm (it holds something drawn elsewhere) */
  noFarArm?: boolean;
  /** draw the far arm over the body (a flex, a wave toward camera) */
  farFront?: boolean;
  /** called between the far arm and the body (props held behind) */
  behind?: (j: ManJoints) => void;
  /** called after the near arm (props held in front) */
  front?: (j: ManJoints) => void;
  pencil?: number;
}

/**
 * The prince: broad, bearded, shaved head, a long coat over a cream tunic, a rose-red scarf.
 * Draws in rig space with the pelvis at (0, 0), facing +x. Caller translates/scales/flips.
 */
export const drawMan = (c: Ctx, st: Studio, p: ManPose, o: ManOpts) => {
  const j = manJoints(p);
  const t = o.t;
  const wind = o.wind ?? 0.4;
  const up: Pt = [Math.sin(p.spine), -Math.cos(p.spine)];
  const fw: Pt = [Math.cos(p.spine), Math.sin(p.spine)];
  const at = (h: number, d: number): Pt => [up[0] * h + fw[0] * d, up[1] * h + fw[1] * d];
  const sil = new Path2D();
  const penA = o.pencil ?? 0.34;
  const part = (path: Path2D, color: string, opt: WashOpts = {}, inSil = true) => {
    wash(c, st, path, color, { reserve: 0.96, a: 0.86, gran: 0.4, rim: 1.6, rimA: 0.45, ...opt });
    if (inSil) sil.addPath(path);
    if (penA > 0) pencil(c, st, path, penA, 0.8);
  };
  const ground = o.ground ?? 1e9;

  // ---- scarf tails (behind everything) ----
  const neckBack = add(j.neck, add(vec(p.spine + Math.PI, 0), [-fw[0] * 4, -fw[1] * 4]));
  const tails: Pt[][] = [0, 1].map((k) => {
    const pts: Pt[] = [add(neckBack, [0, 2 + k * 2])];
    // angle from straight down, + forward; the wind swings the tails back (-x)
    let ang = -0.12 - k * 0.15 - wind * 1.15 + (o.scarfLift ?? 0);
    for (let i = 1; i < 9; i++) {
      const wave = Math.sin(t * (4.2 + k * 0.7) - i * 0.8 + k * 1.7) * (0.06 + 0.2 * wind);
      ang += wave * 0.45 - wind * 0.035;
      const prev = pts[i - 1];
      const len = 6.2 - i * 0.15;
      const nx = prev[0] + Math.sin(ang) * len;
      const ny = Math.min(ground - 1, prev[1] + Math.cos(ang) * len);
      pts.push([nx, ny]);
    }
    return pts;
  });
  const tailPaths = tails.map((pts) => ribbon(pts, (k) => lerp(6.4, 5.2, k)));
  part(tailPaths[1], deepen(SB.scarf, 0.25), { gran: 0.5 });
  // fringe
  const fringe = new Path2D();
  for (const pts of tails) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    for (let i = -2; i <= 2; i++) {
      const bx = b[0] + (-dy / l) * i * 1.2;
      const by = b[1] + (dx / l) * i * 1.2;
      fringe.moveTo(bx, by);
      fringe.lineTo(bx + (dx / l) * 2.6, by + (dy / l) * 2.6);
    }
  }

  // ---- far arm ----
  o.behind?.(j);
  const farArm = () => {
    const fa = chain([j.sF, j.eF, j.wF], [10.5, 8.6, 6.6]);
    part(fa, o.farFront ? SB.coat : deepen(SB.coat, 0.3), { gran: 0.35 });
    part(handPath(j.wF, j.hF, new Path2D()), o.farFront ? SB.skin : deepen(SB.skin, 0.18));
  };
  if (!o.noFarArm && !o.farFront) farArm();

  // ---- far leg ----
  const legPaths = (hip: Pt, k: Pt, an: Pt) => chain([hip, k, an], [12, 8.6, 6.2]);
  part(legPaths(j.hipF, j.kF, j.anF), deepen(SB.trousers, 0.3));
  part(bootPath(j.anF, j.toeF, new Path2D()), deepen(SB.boots, 0.25));
  part(legPaths(j.hipN, j.kN, j.anN), SB.trousers);
  part(bootPath(j.anN, j.toeN, new Path2D()), SB.boots);

  // ---- coat ----
  const thighs = [p.lN[0], p.lF[0]];
  const aMax = Math.max(...thighs);
  const aMin = Math.min(...thighs);
  const sit = clamp((aMax - 0.6) / 0.8);
  const flutter = Math.sin(t * 3.1) * 1.2 * wind;
  // knees drawn up: the coat hem stays draped over the lap instead of climbing the thigh
  const aHem = Math.min(aMax, 1.65);
  const frontHem = add(j.hipN, add(vec(aHem + 0.06, aMax > 1.7 ? 26 : 33), vec(aHem + Math.PI / 2, 8.5 - sit * 2)));
  const frontLow = add(frontHem, [0, 9 * sit]);
  const backHemBase = add(j.hipF, add(vec(Math.min(aMin, 0.25) - 0.12, 34 - sit * 24), vec(Math.min(aMin, 0.25) - Math.PI / 2, 8.5)));
  const backHem: Pt = [backHemBase[0] - wind * 3 + flutter - sit * 4, Math.min(backHemBase[1], ground - 1)];
  const spread = clamp((aMax - aMin - 0.25) / 0.5) * (1 - sit);
  const slit: Pt = lerp(0, 1, spread) > 0 ? [lerp((frontLow[0] + backHem[0]) / 2, j.pelvis[0], spread * 0.5), lerp(Math.max(frontLow[1], backHem[1]), 22, spread)] : [(frontLow[0] + backHem[0]) / 2, Math.max(frontLow[1], backHem[1]) + 1];
  const coatPts: Pt[] = [
    at(TORSO + 0.5, -4),
    at(TORSO - 3, -11.5),
    at(TORSO - 14, -12.5),
    at(5, -11.5),
    backHem,
    slit,
    frontLow,
    frontHem,
    at(5, 11.5),
    at(13, 13.5),
    at(21, 13.8),
    at(27.5, 9),
    at(TORSO + 0.5, 4),
  ];
  const coat = smoothPath(coatPts, true, 0.35);
  part(coat, SB.coat, { grad: [...at(TORSO, 0), ...frontHem, deepen(SB.coat, 0.25)] as [number, number, number, number, string], gran: 0.5, rim: 2 });
  // tunic in the opening of the coat
  const tunic = smoothPath([at(TORSO - 0.5, 2), at(TORSO - 1, 7), at(21, 11.6), at(14, 11.4), at(22, 7.6)], true, 0.4);
  part(tunic, SB.tunic, { gran: 0.25, rim: 1 });
  // coat seams and fold lines (pencil + pooled pigment)
  const folds = new Path2D();
  const ln = (a: Pt, b: Pt, m?: Pt) => {
    folds.moveTo(a[0], a[1]);
    if (m) folds.quadraticCurveTo(m[0], m[1], b[0], b[1]);
    else folds.lineTo(b[0], b[1]);
  };
  ln(at(27.5, 8), at(6, 9.8), at(16, 6));
  ln(at(4, -8), add(backHem, [3, -6]), add(at(-6, -8), [0, 0]));
  ln(at(3, 2), add(frontHem, [-5, -1]), add(at(-6, 4), [2, 0]));
  ln(at(6, -9.5), at(6.5, 9.5));
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.35;
  c.strokeStyle = deepen(SB.coat, 0.6);
  c.lineWidth = 1.1;
  c.lineCap = 'round';
  c.stroke(folds);
  c.restore();
  if (penA > 0) pencil(c, st, folds, penA * 0.7, 0.7);
  // a small gold star pin on the lapel
  const pin = at(23, 10);
  sparkle(c, pin[0], pin[1], 2.2, 0.8, SB.gold, 0.95);
  c.globalAlpha = 1;

  // ---- coat lap ----
  const lapK = sit * clamp(1 - (aMax - 1.7) / 0.2);
  if (lapK > 0.2) {
    // coat lap over the near thigh when seated
    const lap = smoothPath([at(6, 10), add(j.kN, [2, -4.5]), add(frontHem, [1, 0]), frontLow, add(j.kN, [0, 3.5]), add(j.hipN, [0, 5])], true, 0.4);
    part(lap, SB.coat, { a: 0.8 * lapK, gran: 0.4 });
  }

  // ---- scarf wrap & front tail ----
  part(tailPaths[0], SB.scarf, { gran: 0.5 });
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.6;
  c.strokeStyle = deepen(SB.scarf, 0.4);
  c.lineWidth = 0.9;
  c.stroke(fringe);
  c.restore();

  // ---- neck & head ----
  const hA = j.headA;
  const H = (x: number, y: number): Pt => add(j.head, rot([x, y], hA));
  const neckP = limb(at(TORSO - 2, 0.5), H(0.5, 9), 8.2, 7.2);
  part(neckP, deepen(SB.skin, 0.12), { rim: 1 });
  const wrap = smoothPath([at(TORSO + 1.5, -6), at(TORSO + 3.4, 0), at(TORSO + 2.5, 6.2), at(TORSO - 2.5, 6.5), at(TORSO - 3.6, 0), at(TORSO - 2.8, -6.4)], true, 0.5);
  part(wrap, SB.scarf, { gran: 0.5 });
  const skull = smoothPath(
    [H(0, -10.6), H(5.8, -9.4), H(9, -5.2), H(9.8, -1.2), H(11, 1.6), H(12.6, 4), H(10.8, 5.4), H(11.2, 7.6), H(8.5, 12), H(2, 12), H(-4.5, 9.2), H(-8.8, 3.4), H(-9.4, -3), H(-6.4, -8.6)],
    true,
    0.5
  );
  part(skull, SB.skin, { grad: [...H(-6, -8), ...H(4, 10), SB.skinDeep] as [number, number, number, number, string], gran: 0.3, rim: 1.4 });
  // shaved-head shadow: a faint stubble glaze on the back of the crown
  const crown = smoothPath([H(-1, -10.4), H(4, -9.8), H(1, -6), H(-5, -2), H(-9.2, -2.6), H(-6.5, -8.4)], true, 0.5);
  wash(c, st, crown, SB.beard, { a: 0.1, gran: 0.25, rim: 0 });
  // lift: the light on the crown
  lift(c, smoothPath([H(-2.5, -8.6), H(2.5, -9), H(1.6, -7.4), H(-3, -6.6)], true, 0.5), 0.55);
  // ear
  const ear = smoothPath([H(-2.6, -1.5), H(-0.6, -1.8), H(0.2, 1), H(-0.8, 3.6), H(-2.8, 3), H(-3.4, 0.6)], true, 0.5);
  part(ear, SB.skinDeep, { a: 0.7, rim: 0.8 });
  // beard: full, dark, covering the jaw
  const smile = p.smile ?? 0.6;
  const beard = smoothPath(
    [H(0.4, -2.2), H(1.2, 2.6), H(4.2, 3.4), H(6.6, 5.2), H(9.4, 5.1), H(11.6, 6.6), H(11.6, 9.4), H(9.8, 13.2), H(5, 15.4), H(0.6, 13.2), H(-1.6, 8), H(-1.4, 2.6)],
    true,
    0.5
  );
  part(beard, SB.beard, { a: 0.92, gran: 0.6, rim: 1.2, granColor: '#1b1414' });
  // cheek blush
  const cheek = new Path2D();
  const ck = H(6.4, 2);
  cheek.ellipse(ck[0], ck[1], 2.4, 1.6, hA, 0, TAU);
  wash(c, st, cheek, SB.blush, { a: 0.35, gran: 0, rim: 0 });
  // mouth: a warm smile in the beard
  const mouth = new Path2D();
  const m0 = H(7.8, 7.5 - smile * 0.6);
  const m1 = H(11, 7.4);
  const mc = H(9.6, 7.6 + smile * 1.6);
  mouth.moveTo(m0[0], m0[1]);
  mouth.quadraticCurveTo(mc[0], mc[1], m1[0], m1[1]);
  c.save();
  c.lineCap = 'round';
  c.globalCompositeOperation = 'source-over';
  c.strokeStyle = rgba('#c46b62', 0.9);
  c.lineWidth = 1.5;
  c.stroke(mouth);
  if (smile > 0.75) {
    c.strokeStyle = rgba(SB.paper, 0.85);
    c.lineWidth = 0.7;
    c.stroke(mouth);
  }
  c.restore();
  // nose shading
  const noseS = smoothPath([H(10.6, 1.4), H(12.4, 4), H(10.6, 5), H(9.8, 3.6)], true, 0.5);
  wash(c, st, noseS, SB.skinDeep, { a: 0.35, gran: 0, rim: 0.6 });
  // eye and brow
  const blink = p.blink ?? 0;
  const look = p.look ?? 0;
  const eyeC = H(6.4, -1.4 + look * 0.5);
  const eye = new Path2D();
  const happy = smile > 0.85 || blink > 0.6;
  if (happy) {
    const e0 = H(5, -1);
    const e1 = H(8, -1);
    const em = H(6.5, -2.4);
    eye.moveTo(e0[0], e0[1]);
    eye.quadraticCurveTo(em[0], em[1], e1[0], e1[1]);
    c.save();
    c.strokeStyle = rgba(SB.beard, 0.95);
    c.lineWidth = 1.1;
    c.lineCap = 'round';
    c.stroke(eye);
    c.restore();
  } else {
    eye.ellipse(eyeC[0], eyeC[1], 1.15, 1.45 * (1 - blink), hA, 0, TAU);
    c.fillStyle = rgba(SB.beard, 0.95);
    c.fill(eye);
    c.fillStyle = rgba('#ffffff', 0.85);
    const hi = H(6.8, -1.9 + look * 0.5);
    c.beginPath();
    c.arc(hi[0], hi[1], 0.38, 0, TAU);
    c.fill();
  }
  const brow = new Path2D();
  const b0 = H(4.2, -4 + look * 0.3);
  const b1 = H(8.8, -3.6 + look * 0.2);
  const bm = H(6.6, -4.9 + look * 0.3);
  brow.moveTo(b0[0], b0[1]);
  brow.quadraticCurveTo(bm[0], bm[1], b1[0], b1[1]);
  c.save();
  c.strokeStyle = rgba(SB.beard, 0.85);
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  c.stroke(brow);
  c.restore();
  // beard texture strokes
  const bt = new Path2D();
  for (let i = 0; i < 7; i++) {
    const a0 = H(0.5 + i * 1.5, 6 + (i % 3));
    const a1 = H(1 + i * 1.5, 9.5 + (i % 2) * 2);
    bt.moveTo(a0[0], a0[1]);
    bt.lineTo(a1[0], a1[1]);
  }
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.25;
  c.strokeStyle = '#6a5a52';
  c.lineWidth = 0.5;
  c.stroke(bt);
  c.restore();

  // ---- near arm ----
  const na = chain([j.sN, j.eN, j.wN], [10.5, 8.4, 6.6]);
  part(na, SB.coat, { grad: [...j.sN, ...j.wN, deepen(SB.coat, 0.2)] as [number, number, number, number, string], gran: 0.45 });
  const cuff = limb(add(j.wN, vec(p.aN[1] + Math.PI, 2.6)), j.wN, 6.6, 6.6);
  part(cuff, deepen(SB.coat, 0.35), { rim: 0.8 });
  part(handPath(j.wN, j.hN, new Path2D()), SB.skin);
  if (!o.noFarArm && o.farFront) farArm();
  o.front?.(j);

  // ---- tints and light ----
  if (o.tint && o.tint[1] > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = o.tint[1];
    c.fillStyle = o.tint[0];
    c.fill(sil);
    c.restore();
  }
  if (o.glow && o.glow > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = o.glow * 0.35;
    c.fillStyle = SB.apricot;
    c.fill(sil);
    c.restore();
  }
  return j;
};

/* ---------- Luna, the fox ---------- */

/** Paw targets: x forward from the body origin, y height above the ground */
export interface FoxFeet {
  ff: Pt;
  fn: Pt;
  bf: Pt;
  bn: Pt;
}

export interface FoxPose {
  /** body pitch about the hip, - lifts the chest */
  tilt: number;
  /** body origin height above the ground */
  y: number;
  /** neck direction (radians, 0 = straight forward, - = up) */
  neck: number;
  /** head rotation (0 = muzzle level, + = nose down) */
  head: number;
  /** ears: 0 perked, 1 back */
  ears: number;
  /** tail base raise: 0 hangs, 1 level, 1.5 high */
  tail: number;
  /** tail curl per segment (+ curls under/forward) */
  curl: number;
  feet: FoxFeet;
  /** pastern angles (front far, near), metatarsal angles (hind far, near) */
  pa: [number, number];
  ma: [number, number];
  blink?: number;
  /** 0 closed, 1 open happy pant */
  mouth?: number;
}

const FL: [number, number, number] = [20, 22, 9];
const HL: [number, number, number] = [23, 23, 15];
const F_HIP: Pt = [-38, 2];
const PAW = 3.5;

const ik2 = (r: Pt, t: Pt, a: number, b: number, bend: 1 | -1): Pt => {
  const dx = t[0] - r[0];
  const dy = t[1] - r[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.01, a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const ang = base + bend * Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  return [r[0] + Math.cos(ang) * a, r[1] + Math.sin(ang) * a];
};

export const foxRoots = (tilt: number) => ({
  fn: rot([30, 0], tilt, F_HIP),
  ff: rot([25, -2], tilt, F_HIP),
  bn: rot([-36, -2], tilt, F_HIP),
  bf: rot([-41, -4], tilt, F_HIP),
});

const frontLeg = (root: Pt, paw: Pt, pa: number): Pt[] => {
  const carpus = add(paw, vec(pa + Math.PI, FL[2]));
  const d = Math.hypot(carpus[0] - root[0], carpus[1] - root[1]);
  // a straight leg when the target is at full reach
  const elbow = d > FL[0] + FL[1] - 0.5 ? add(root, [(carpus[0] - root[0]) * (FL[0] / d), (carpus[1] - root[1]) * (FL[0] / d)]) : ik2(root, carpus, FL[0], FL[1], 1);
  return [root, elbow, carpus, paw];
};
const hindLeg = (root: Pt, paw: Pt, ma: number): Pt[] => {
  const hock = add(paw, vec(ma + Math.PI, HL[2]));
  const stifle = ik2(root, hock, HL[0], HL[1], -1);
  return [root, stifle, hock, paw];
};

export const mixFox = (a: FoxPose, b: FoxPose, k: number): FoxPose => {
  const mp = (x: Pt, y: Pt): Pt => [lerp(x[0], y[0], k), lerp(x[1], y[1], k)];
  return {
    tilt: lerp(a.tilt, b.tilt, k),
    y: lerp(a.y, b.y, k),
    neck: lerp(a.neck, b.neck, k),
    head: lerp(a.head, b.head, k),
    ears: lerp(a.ears, b.ears, k),
    tail: lerp(a.tail, b.tail, k),
    curl: lerp(a.curl, b.curl, k),
    feet: { ff: mp(a.feet.ff, b.feet.ff), fn: mp(a.feet.fn, b.feet.fn), bf: mp(a.feet.bf, b.feet.bf), bn: mp(a.feet.bn, b.feet.bn) },
    pa: [lerp(a.pa[0], b.pa[0], k), lerp(a.pa[1], b.pa[1], k)],
    ma: [lerp(a.ma[0], b.ma[0], k), lerp(a.ma[1], b.ma[1], k)],
    blink: lerp(a.blink ?? 0, b.blink ?? 0, k),
    mouth: lerp(a.mouth ?? 0, b.mouth ?? 0, k),
  };
};

export const FOX_STAND: FoxPose = {
  tilt: 0, y: 52, neck: -0.75, head: 0.15, ears: 0, tail: 0.55, curl: 0.06,
  feet: { ff: [26, 0], fn: [31, 0], bf: [-36, 0], bn: [-31, 0] }, pa: [0.25, 0.25], ma: [0.12, 0.12],
};
/** Watchful crouch in the wheat: belly low, head forward, ears up */
export const FOX_CROUCH: FoxPose = {
  tilt: 0.05, y: 33, neck: -0.45, head: 0.12, ears: 0, tail: 0.75, curl: 0.03,
  feet: { ff: [38, 0], fn: [44, 0], bf: [-30, 0], bn: [-24, 0] }, pa: [1.2, 1.25], ma: [1.15, 1.2],
};
/** Sitting tall, tail wrapped around the front paws */
export const FOX_SIT: FoxPose = {
  tilt: -0.58, y: 30, neck: -1.02, head: 0.22, ears: 0, tail: 0.95, curl: -0.08,
  feet: { ff: [10, 0], fn: [15, 0], bf: [-24, 0], bn: [-20, 0] }, pa: [0.15, 0.15], ma: [1.5, 1.5],
};
/** Lying down, chin forward */
export const FOX_LIE: FoxPose = {
  tilt: 0.02, y: 17, neck: -0.55, head: 0.25, ears: 0.35, tail: 1.0, curl: 0.04,
  feet: { ff: [58, 0], fn: [64, 0], bf: [-12, 0], bn: [-6, 0] }, pa: [1.5, 1.5], ma: [1.5, 1.5],
};

/** A walk cycle (p 0..1), feet travelling in a stride; stride in rig units */
export const foxWalk = (p: number, stride = 34): FoxPose => {
  const foot = (off: number, base: number) => {
    const q = (((p + off) % 1) + 1) % 1;
    const duty = 0.62;
    if (q < duty) return { x: base + stride * (0.5 - q / duty), y: 0 };
    const s = (q - duty) / (1 - duty);
    const e = s * s * (3 - 2 * s);
    return { x: base + stride * (-0.5 + e), y: Math.sin(Math.PI * s) * 7 };
  };
  const bn = foot(0, -31);
  const fn = foot(0.25, 31);
  const bf = foot(0.5, -36);
  const ff = foot(0.75, 26);
  const bob = Math.sin(p * TAU * 2) * 1.2;
  return {
    ...FOX_STAND,
    y: 51 + bob,
    neck: -0.6 + Math.sin(p * TAU * 2 + 1) * 0.05,
    head: 0.22,
    feet: { ff: [ff.x, ff.y], fn: [fn.x, fn.y], bf: [bf.x, bf.y], bn: [bn.x, bn.y] },
    pa: [ff.y > 0.5 ? 0.9 : 0.25, fn.y > 0.5 ? 0.9 : 0.25],
    ma: [bf.y > 0.5 ? 0.5 : 0.12, bn.y > 0.5 ? 0.5 : 0.12],
    tail: 0.65,
    curl: 0.05 + Math.sin(p * TAU) * 0.03,
  };
};

/** A bounding gallop (p 0..1) */
export const foxRun = (p: number): FoxPose => {
  const a = p * TAU;
  const ext = Math.sin(a); // + stretched, - gathered
  const fx = 30 + ext * 26;
  const bx = -34 - ext * 22;
  const fl = Math.max(0, Math.sin(a + 0.6)) * 18;
  const bl = Math.max(0, Math.sin(a + Math.PI + 0.4)) * 16;
  return {
    tilt: -ext * 0.12,
    y: 46 + Math.max(0, Math.sin(a + 0.3)) * 10,
    neck: -0.4 - ext * 0.12,
    head: 0.18,
    ears: 0.55,
    tail: 0.9 + ext * 0.1,
    curl: 0.03,
    feet: { ff: [fx - 8, fl * 0.9], fn: [fx, fl], bf: [bx + 6, bl * 0.8], bn: [bx, bl] },
    pa: [0.6 + ext * 0.8, 0.7 + ext * 0.8],
    ma: [0.2 - ext * 0.9, 0.25 - ext * 0.9],
    mouth: 0.8,
  };
};

const F_TORSO: Pt[] = [
  [53, -7], [49, -19], [35, -27], [14, -24], [-10, -21], [-32, -23], [-48, -21], [-58, -9],
  [-55, 7], [-42, 13], [-24, 5], [-4, 7], [16, 19], [37, 18], [50, 8],
];
/** Skull and a long fox muzzle with a soft stop */
const F_HEAD: Pt[] = [[-6, -2], [-2, -12], [8, -17], [18, -15.5], [25, -10], [34, -6.5], [44, -3.5], [51, -0.5], [51.5, 3], [44, 6.5], [31, 10.5], [18, 14], [6, 13], [-3, 8]];
const F_MASK: Pt[] = [[20, 1], [33, -1.5], [45, -0.5], [51.5, 2.5], [44, 6.5], [31, 10.5], [18, 14], [9, 13], [13, 6]];
const F_EAR: Pt[] = [[3, -12], [5.5, -26], [9, -37], [14, -29], [17.5, -14]];
const F_EAR_IN: Pt[] = [[6.5, -15], [8, -26], [9.6, -32], [12.6, -26], [14.2, -15.5]];
const F_EAR_TIP: Pt[] = [[6.6, -27.5], [9, -37], [13.6, -29.4], [10.5, -29.6]];

export interface FoxOpts {
  t: number;
  tint?: [string, number];
  glow?: number;
  pencil?: number;
  /** extra tail swish amplitude */
  wag?: number;
  /** head look-up offset added to neck */
  lookUp?: number;
}

/** Luna as a fox: fawn coat, cream chest and muzzle, dark-tipped ears, a full brush of a tail. Ground at y = 0, body origin above it, facing +x */
export const drawFox = (c: Ctx, st: Studio, pose: FoxPose, o: FoxOpts) => {
  const t = o.t;
  const tp = (q: Pt): Pt => {
    const r = rot(q, pose.tilt, F_HIP);
    return [r[0], r[1] - pose.y];
  };
  const roots = foxRoots(pose.tilt);
  const R = (q: Pt): Pt => [q[0], q[1] - pose.y];
  const foot = (q: Pt): Pt => [q[0], -q[1] - PAW];
  const legs = {
    ff: frontLeg(R(roots.ff), foot(pose.feet.ff), pose.pa[0]),
    fn: frontLeg(R(roots.fn), foot(pose.feet.fn), pose.pa[1]),
    bf: hindLeg(R(roots.bf), foot(pose.feet.bf), pose.ma[0]),
    bn: hindLeg(R(roots.bn), foot(pose.feet.bn), pose.ma[1]),
  };
  const sil = new Path2D();
  const penA = o.pencil ?? 0.32;
  const part = (path: Path2D, color: string, opt: WashOpts = {}) => {
    wash(c, st, path, color, { reserve: 0.96, a: 0.86, gran: 0.45, rim: 1.6, rimA: 0.45, ...opt });
    sil.addPath(path);
    if (penA > 0) pencil(c, st, path, penA, 0.8);
  };
  const pawP = (pt: Pt, a: number, p: Path2D) => {
    const P = (x: number, y: number): Pt => add(pt, rot([x, y], a));
    return smoothPath([P(-5, -3.5), P(2, -5), P(7.5, -3), P(9.5, 0.5), P(8.5, 3.5), P(-4.5, 3.5)], true, 0.5, p);
  };
  const frontPath = (j: Pt[]) => {
    const p = chain([j[0], j[1], j[2], j[3]], [17, 11.5, 8.6, 7.6]);
    pawP([j[3][0] + 2, j[3][1]], (angOf(j[2], j[3]) - 0.25) * 0.4 - Math.max(0, -(j[3][1] + PAW) / 30), p);
    return p;
  };
  const hindPath = (j: Pt[]) => {
    const [hip, s, h, paw] = j;
    const p = new Path2D();
    // muscular thigh
    const dx = s[0] - hip[0];
    const dy = s[1] - hip[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const A = (k: number, side: number): Pt => [hip[0] + dx * k + nx * side, hip[1] + dy * k + ny * side];
    smoothPath([A(-0.4, 14), A(-0.4, -11), A(0.35, -12), A(1.05, -5.5), A(1.12, 0), A(1.0, 6.5), A(0.55, 14), A(0.05, 18.5)], true, 0.5, p);
    chain([s, h, paw], [12.5, 7, 6.4], p);
    pawP([paw[0] + 2, paw[1]], (angOf(h, paw) - 0.1) * 0.4, p);
    return p;
  };

  // tail
  const rump = tp([-55, -12]);
  const wag = (o.wag ?? 0) * Math.sin(t * 7);
  const tailPts: Pt[] = [rump];
  let ang = Math.PI / 2 + 0.35 + pose.tail * 0.9 + pose.tilt; // atan2 direction, y down: pi/2 hangs, pi points back
  ang = ang + 0.05 * Math.sin(t * 1.3) + wag * 0.15;
  for (let i = 1; i < 8; i++) {
    const prev = tailPts[i - 1];
    const len = 10 - i * 0.4;
    ang -= pose.curl + 0.03 * Math.sin(t * 1.7 - i * 0.6) + wag * 0.04 * i;
    let nx = prev[0] + Math.cos(ang) * len;
    let ny = prev[1] + Math.sin(ang) * len;
    if (ny > -5) ny = -5;
    if (ny > -5.5 && i > 2) nx = prev[0] + Math.sign(Math.cos(ang) || 1) * len;
    tailPts.push([nx, ny]);
  }
  const prof = (k: number) => (k < 0.08 ? 7 : 7 + Math.sin(Math.min(1, k * 1.15) * Math.PI) * 9.5 + (k > 0.9 ? -6 * (k - 0.9) * 10 : 0));
  const tail = ribbon(tailPts, prof);
  const tipPts = tailPts.slice(5);
  const tailTip = ribbon(tipPts, (k) => lerp(prof(0.71), Math.max(1, prof(1)), k));

  // far legs and ear first
  const hp = (q: Pt) => {
    const neckBase = tp([40, -15]);
    const nd: Pt = [Math.cos(pose.neck + (o.lookUp ?? 0)), Math.sin(pose.neck + (o.lookUp ?? 0))];
    const end: Pt = [neckBase[0] + nd[0] * 25, neckBase[1] + nd[1] * 25];
    const r = rot([q[0] * 1.14, q[1] * 1.14], pose.head + pose.tilt * 0.2);
    const anc = rot([5 * 1.14, 6 * 1.14], pose.head + pose.tilt * 0.2);
    return [r[0] - anc[0] + end[0], r[1] - anc[1] + end[1]] as Pt;
  };
  const earRot = (pts: Pt[], dx: number, dy: number) => pts.map((q) => hp(add(rot(q, -pose.ears * 0.75 - 0.08 * Math.sin(t * 0.9), [10, -13]), [dx, dy])));
  part(frontPath(legs.ff), deepen(SB.fox, 0.32), { gran: 0.4 });
  part(hindPath(legs.bf), deepen(SB.fox, 0.32), { gran: 0.4 });
  part(smoothPath(earRot(F_EAR, -7, 1.5), true, 0.4), deepen(SB.foxEar, 0.1), { gran: 0.3 });
  const paintTail = () => {
    part(tail, SB.fox, { grad: [...tailPts[0], ...tailPts[7], deepen(SB.fox, 0.25)] as [number, number, number, number, string], gran: 0.55 });
    part(tailTip, SB.foxPale, { gran: 0.2, rim: 1 });
  };
  const wrapped = pose.curl > 0.2;
  if (!wrapped) paintTail();
  // body
  const torso = smoothPath(F_TORSO.map(tp), true, 0.5);
  const tTop = tp([0, -26]);
  const tBot = tp([0, 18]);
  part(torso, SB.fox, { grad: [tTop[0], tTop[1], tBot[0], tBot[1], deepen(SB.fox, 0.2)], gran: 0.55, rim: 2 });
  // back lift: the light along the spine
  lift(c, smoothPath([tp([-44, -19]), tp([-10, -19.5]), tp([30, -24]), tp([10, -15]), tp([-30, -15])], true, 0.5), 0.3);
  // neck
  const neckBase = tp([40, -15]);
  const nAng = pose.neck + (o.lookUp ?? 0);
  const nd: Pt = [Math.cos(nAng), Math.sin(nAng)];
  const nb: Pt = [Math.sin(nAng), -Math.cos(nAng)];
  const end: Pt = [neckBase[0] + nd[0] * 25, neckBase[1] + nd[1] * 25];
  const neck = smoothPath([tp([16, -24]), [end[0] + nb[0] * 11, end[1] + nb[1] * 11], [end[0] - nb[0] * 12, end[1] - nb[1] * 12], tp([50, 1])], true, 0.35);
  part(neck, SB.fox, { gran: 0.5 });
  // near legs
  part(hindPath(legs.bn), SB.fox, { grad: [...legs.bn[0], ...legs.bn[3], deepen(SB.fox, 0.15)] as [number, number, number, number, string] });
  part(frontPath(legs.fn), SB.fox, { grad: [...legs.fn[0], ...legs.fn[3], SB.foxPale] as [number, number, number, number, string] });
  if (wrapped) paintTail();
  // chest bib
  const chest = smoothPath([tp([30, -8]), [end[0] - nb[0] * 3, end[1] - nb[1] * 3], hp([20, 12]), tp([53, -4]), tp([47, 12]), tp([35, 18]), tp([26, 12])], true, 0.45);
  part(chest, SB.foxPale, { gran: 0.2, rim: 1.2, edge: deepen(SB.fox, 0.2), rimA: 0.35 });
  // head
  const head = smoothPath(F_HEAD.map(hp), true, 0.5);
  part(head, SB.fox, { gran: 0.5, rim: 1.6 });
  const mask = smoothPath(F_MASK.map(hp), true, 0.5);
  part(mask, SB.foxPale, { gran: 0.15, rim: 1, edge: deepen(SB.fox, 0.15), rimA: 0.3 });
  // near ear
  const ear = smoothPath(earRot(F_EAR, 0, 0), true, 0.4);
  part(ear, SB.fox, { gran: 0.4 });
  wash(c, st, smoothPath(earRot(F_EAR_IN, 0, 0), true, 0.4), SB.foxPale, { a: 0.8, gran: 0.1, rim: 0.6 });
  wash(c, st, smoothPath(earRot(F_EAR_TIP, 0, 0), true, 0.4), SB.foxEar, { a: 0.9, gran: 0.3, rim: 0.6 });
  // eye: almond, dark-rimmed, with a light
  const blink = pose.blink ?? 0;
  const e = hp([24, -6]);
  const ha = pose.head + pose.tilt * 0.2;
  const eye = new Path2D();
  const ex = (x: number, y: number) => {
    const q = rot([x, y], ha);
    return [e[0] + q[0], e[1] + q[1]] as Pt;
  };
  const eo = 2.4 * (1 - blink);
  const E = [ex(-4, 0.4), ex(0, -eo), ex(4.2, -0.6), ex(0, eo * 0.8)];
  eye.moveTo(E[0][0], E[0][1]);
  eye.quadraticCurveTo(E[1][0], E[1][1], E[2][0], E[2][1]);
  eye.quadraticCurveTo(E[3][0], E[3][1], E[0][0], E[0][1]);
  c.save();
  c.fillStyle = rgba('#2a1d17', 0.95);
  c.fill(eye);
  c.strokeStyle = rgba('#2a1d17', 0.9);
  c.lineWidth = 1;
  c.stroke(eye);
  if (blink < 0.6) {
    const hi = ex(1, -0.8);
    c.fillStyle = rgba('#fff8e8', 0.9);
    c.beginPath();
    c.arc(hi[0], hi[1], 0.75, 0, TAU);
    c.fill();
  }
  c.restore();
  // brow tuft and cheek fur
  const fur = new Path2D();
  const fl = (a: Pt, b: Pt) => {
    const A = hp(a);
    const B = hp(b);
    fur.moveTo(A[0], A[1]);
    fur.lineTo(B[0], B[1]);
  };
  fl([18, -11], [23, -10]);
  fl([9, 13], [4, 16]);
  fl([13, 13.5], [9, 17]);
  fl([5, 10], [1, 13]);
  // nose & mouth
  const nose = new Path2D();
  const np = hp([50, 0.8]);
  nose.ellipse(np[0], np[1], 3.4, 2.7, ha, 0, TAU);
  c.fillStyle = rgba(SB.nose, 0.95);
  c.fill(nose);
  const mo = pose.mouth ?? 0;
  const mouth = new Path2D();
  const m0 = hp([48, 5]);
  const m1 = hp([36, 8.5 + mo * 3]);
  const m2 = hp([32, 7.5 + mo * 1.5]);
  mouth.moveTo(m0[0], m0[1]);
  mouth.quadraticCurveTo(hp([42, 8 + mo * 3])[0], hp([42, 8 + mo * 3])[1], m1[0], m1[1]);
  mouth.lineTo(m2[0], m2[1]);
  if (mo > 0.3) {
    const tongue = smoothPath([hp([40, 8.5]), hp([44, 9 + mo * 5]), hp([39, 11 + mo * 5]), hp([36, 9])], true, 0.5);
    wash(c, st, tongue, SB.rose, { a: 0.75, gran: 0, rim: 0.6, reserve: 0.9 });
  }
  c.save();
  c.strokeStyle = rgba(SB.nose, 0.8);
  c.lineWidth = 1;
  c.lineCap = 'round';
  c.stroke(mouth);
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.5;
  c.strokeStyle = SB.foxDeep;
  c.lineWidth = 0.8;
  c.stroke(fur);
  // body fur marks along the back and chest
  const bf = new Path2D();
  for (let i = 0; i < 9; i++) {
    const a = tp([-46 + i * 10, -18 + (i % 2) * 2]);
    const b = tp([-40 + i * 10, -14 + (i % 2) * 2]);
    bf.moveTo(a[0], a[1]);
    bf.lineTo(b[0], b[1]);
  }
  c.globalAlpha = 0.28;
  c.stroke(bf);
  c.restore();

  if (o.tint && o.tint[1] > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = o.tint[1];
    c.fillStyle = o.tint[0];
    c.fill(sil);
    c.restore();
  }
  if (o.glow && o.glow > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = o.glow * 0.35;
    c.fillStyle = SB.apricot;
    c.fill(sil);
    c.restore();
  }
  return { nose: np, eye: e, head: hp([20, 0]), rump, chest: tp([45, 0]) };
};

/* ---------- the rose ---------- */

/** The rose, base at (0, 0), about 46 units tall. open 0..1 */
export const drawRose = (c: Ctx, st: Studio, sway: number, open: number, t: number, glow = 0) => {
  const top: Pt = [Math.sin(sway) * 40, -Math.cos(sway) * 40];
  const stem = new Path2D();
  stem.moveTo(0, 0);
  stem.quadraticCurveTo(-3 + sway * 6, -20, top[0], top[1]);
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.strokeStyle = SB.leafDeep;
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.stroke(stem);
  c.restore();
  const thorns = new Path2D();
  for (const k of [0.3, 0.55]) {
    const x = lerp(0, top[0], k) - 1;
    const y = lerp(0, top[1], k);
    thorns.moveTo(x, y);
    thorns.lineTo(x + (k > 0.4 ? 3.5 : -3.5), y - 2.5);
    thorns.lineTo(x, y - 2);
  }
  c.save();
  c.fillStyle = rgba(SB.leafDeep, 0.9);
  c.fill(thorns);
  c.restore();
  const leaf1 = smoothPath([[-1, -14], [-9, -20 + Math.sin(t * 1.3) * 1.2], [-16, -18], [-8, -13]], true, 0.5);
  const leaf2 = smoothPath([[1, -24], [9, -30 + Math.sin(t * 1.1 + 1) * 1.2], [16, -29], [8, -23]], true, 0.5);
  wash(c, st, leaf1, SB.leaf, { reserve: 0.9, gran: 0.4, rim: 1.2 });
  wash(c, st, leaf2, SB.leaf, { reserve: 0.9, gran: 0.4, rim: 1.2 });
  c.save();
  c.translate(top[0], top[1]);
  c.rotate(sway * 0.8);
  if (glow > 0.01) glowAt(c, st, 0, -6, 34, glow);
  c.globalAlpha = 1;
  const o = open;
  const sepal = smoothPath([[-7, 2], [0, -2], [7, 2], [3, 5], [-3, 5]], true, 0.5);
  wash(c, st, sepal, SB.leafDeep, { reserve: 0.9, gran: 0.3, rim: 1 });
  const back = smoothPath([[-9 - o * 3, -6], [-6, -17 - o * 2], [0, -14], [6, -17 - o * 2], [9 + o * 3, -6], [0, 1]], true, 0.5);
  wash(c, st, back, SB.roseDeep, { reserve: 0.94, gran: 0.5, rim: 1.4 });
  const bud = smoothPath([[-5, -6], [-3, -15], [3, -16], [5, -7], [0, -3]], true, 0.5);
  wash(c, st, bud, SB.rose, { reserve: 0.9, gran: 0.4, rim: 1.4 });
  const leftP = smoothPath([[-10 - o * 2, -9], [-7, -2], [0, 1.5], [-2, -6], [-6, -14]], true, 0.5);
  const rightP = smoothPath([[10 + o * 2, -9], [7, -2], [0, 1.5], [2, -6], [6, -14]], true, 0.5);
  wash(c, st, leftP, SB.rose, { reserve: 0.9, gran: 0.45, rim: 1.6 });
  wash(c, st, rightP, SB.rose, { reserve: 0.9, gran: 0.45, rim: 1.6 });
  const front = smoothPath([[-7, -5], [0, -9], [7, -5], [4, 1], [-4, 1]], true, 0.5);
  wash(c, st, front, mixHex(SB.rose, SB.blush, 0.3), { reserve: 0.9, gran: 0.35, rim: 1.4 });
  const sw = new Path2D();
  sw.moveTo(-2, -12);
  sw.quadraticCurveTo(1, -14, 2, -10);
  sw.quadraticCurveTo(0, -8, -1.5, -10);
  pencil(c, st, sw, 0.5, 0.9, 0, 0);
  const pen = new Path2D();
  pen.addPath(back);
  pen.addPath(leftP);
  pen.addPath(rightP);
  pen.addPath(front);
  pencil(c, st, pen, 0.3, 0.8);
  c.restore();
  return top;
};

/* ---------- the paper star ---------- */

/** A folded paper star lantern centred at (0, 0), radius r, glowing */
export const drawPaperStar = (c: Ctx, st: Studio, r: number, spin: number, glow: number) => {
  if (glow > 0) {
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, st, 0, 0, r * 4.2, glow * 0.9);
    c.restore();
  }
  c.save();
  c.rotate(spin);
  const outer: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    outer.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const star = new Path2D();
  star.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < 10; i++) star.lineTo(outer[i][0], outer[i][1]);
  star.closePath();
  wash(c, st, star, SB.gold, { reserve: 1, a: 0.9, gran: 0.25, rim: 1.4, edge: SB.apricotDeep });
  // folded facets: the half of each point away from the light is a deeper glaze
  const facets = new Path2D();
  for (let i = 0; i < 10; i += 2) {
    const tip = outer[i];
    const valley = outer[(i + 1) % 10];
    facets.moveTo(0, 0);
    facets.lineTo(tip[0], tip[1]);
    facets.lineTo(valley[0], valley[1]);
    facets.closePath();
  }
  wash(c, st, facets, SB.apricot, { a: 0.55, gran: 0.2, rim: 0 });
  const creases = new Path2D();
  for (const q of outer) {
    creases.moveTo(0, 0);
    creases.lineTo(q[0], q[1]);
  }
  pencil(c, st, creases, 0.35, 0.7, 0, 0);
  // the warm heart of the lantern
  c.globalCompositeOperation = 'screen';
  glowAt(c, st, 0, 0, r * 0.9, 0.7 * glow);
  c.restore();
  c.globalAlpha = 1;
};

/* ---------- text ---------- */

/** Small hand-lettered title in sepia ink */
export const title = (c: Ctx, text: string, x: number, y: number, size: number, a: number, color = '#5a4038') => {
  if (a <= 0.01) return;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `italic 500 ${size}px ${SERIF}`;
  c.fillText(text, x, y);
  c.restore();
};
