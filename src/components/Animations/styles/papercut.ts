import type { Ctx, Riso } from '../riso/engine';
import { TAU, clamp, hash, lerp, mulberry, noise1, polyPath, resample, smoothPath, type Pt } from '../riso/kit';

/**
 * Paper cut: shared helpers for the cut-paper diorama films.
 *
 * Every element is a flat sheet of coloured craft paper: a hand-cut outline (small stable
 * jitter, slightly faceted like scissor cuts), a fibre texture that travels with the sheet,
 * a soft warm drop shadow onto whatever is behind it, and a faint light catch along its top
 * edge. Some sheets get a torn white fringe. Figures are built from several paper parts in an
 * offscreen "stamp" so the whole cut-out casts one shadow, like a puppet on a stick.
 */

/* ---------- textures ---------- */

export interface Craft {
  r: Riso;
  /** Fibre, mottling and tooth, laid over a sheet with alpha */
  fibre: CanvasPattern;
  /** Tile size in logical px */
  size: number;
  /** Tile pixels per logical px */
  res: number;
}

export const makeCraft = (r: Riso, seed = 91): Craft => {
  const size = 320;
  const res = 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * res;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is unavailable');
  g.scale(res, res);
  const rng = mulberry(seed);
  // Draw at all wrap positions so the tile repeats without seams
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };
  for (let i = 0; i < 46; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rr = 20 + rng() * 70;
    const dark = rng() < 0.5;
    wrap((ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
      gr.addColorStop(0, dark ? 'rgba(70,40,15,0.09)' : 'rgba(255,250,235,0.14)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
    });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 1100; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const a = rng() * TAU;
    const l = 3 + rng() * rng() * 22;
    const light = rng() < 0.6;
    const alpha = light ? 0.16 + rng() * 0.22 : 0.06 + rng() * 0.1;
    const bend = (rng() - 0.5) * 1.4;
    const w = 0.35 + rng() * 0.6;
    wrap((ox, oy) => {
      g.strokeStyle = light ? `rgba(255,252,240,${alpha})` : `rgba(60,38,18,${alpha})`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(
        x + ox + Math.cos(a + bend) * l * 0.5,
        y + oy + Math.sin(a + bend) * l * 0.5,
        x + ox + Math.cos(a) * l,
        y + oy + Math.sin(a) * l
      );
      g.stroke();
    });
  }
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = rng();
    if (v < 0.22) {
      const dark = v < 0.1;
      const a = Math.floor(rng() * (dark ? 30 : 26));
      // Blend a speck of tooth over whatever the fibres left
      const sa = d[i + 3] / 255;
      const na = a / 255;
      const oa = na + sa * (1 - na);
      const c = dark ? 60 : 255;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = oa > 0 ? (c * na + d[i + ch] * sa * (1 - na)) / oa : 0;
      d[i + 3] = Math.round(oa * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const fibre = g.createPattern(cv, 'repeat');
  if (!fibre) throw new Error('Pattern unavailable');
  return { r, fibre, size, res };
};

/** Fibre pattern placed for a given sheet seed, in the current user space */
const placeFibre = (k: Craft, seed: number) => {
  const m = new DOMMatrix()
    .translate(hash(seed * 3.1) * k.size, hash(seed * 7.7) * k.size)
    .rotate(hash(seed * 1.3) * 360)
    .scale(1 / k.res);
  k.fibre.setTransform(m);
  return k.fibre;
};

/** Device px per logical px for the current transform */
const devScale = (c: Ctx) => {
  const m = c.getTransform();
  return Math.hypot(m.a, m.b);
};

/* ---------- sheets ---------- */

export interface SheetOpts {
  /** Distance to the layer behind, drives shadow offset and blur (logical px) */
  depth?: number;
  /** Shadow strength 0..1 */
  shadow?: number;
  /** Fibre texture strength */
  tex?: number;
  seed?: number;
  /** Light catch along the upper cut edge, 0..1 */
  edge?: number;
  /** Top-lit shading: [y0, y1] in local coords, lighter at y0 */
  shade?: [number, number];
  /** Shading strength, default 1 */
  shadeK?: number;
}

/** Shadow from a warm key light high on the left */
export const castShadow = (c: Ctx, depth: number, strength = 0.34) => {
  const z = devScale(c);
  c.shadowColor = `rgba(52,28,10,${strength})`;
  c.shadowBlur = depth * 1.6 * z;
  c.shadowOffsetX = depth * 0.35 * z;
  c.shadowOffsetY = depth * 0.8 * z;
};

export const noShadow = (c: Ctx) => {
  c.shadowColor = 'rgba(0,0,0,0)';
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
};

/** Paint one sheet of coloured paper */
export const sheet = (c: Ctx, k: Craft, path: Path2D, color: string, o: SheetOpts = {}) => {
  const depth = o.depth ?? 8;
  c.save();
  if (depth > 0) castShadow(c, depth, o.shadow ?? 0.34);
  c.fillStyle = color;
  c.fill(path);
  noShadow(c);
  const tex = o.tex ?? 0.85;
  const needClip = tex > 0 || o.shade || (o.edge ?? 0) > 0;
  if (needClip) {
    c.save();
    c.clip(path);
    if (o.shade) {
      const [y0, y1] = o.shade;
      const sk = o.shadeK ?? 1;
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, `rgba(255,236,200,${0.16 * sk})`);
      g.addColorStop(0.5, 'rgba(255,236,200,0)');
      g.addColorStop(1, `rgba(60,30,12,${0.16 * sk})`);
      c.fillStyle = g;
      c.fillRect(-1e5, y0 - 1e4, 2e5, y1 - y0 + 2e4);
    }
    if (tex > 0) {
      c.globalAlpha *= tex;
      c.fillStyle = placeFibre(k, o.seed ?? 1);
      c.fill(path);
      c.globalAlpha /= tex;
    }
    const edge = o.edge ?? 0;
    if (edge > 0) {
      // Keep the light catch a fixed size on screen, whatever the zoom
      const zoom = devScale(c) / Math.max(0.5, k.r.scale);
      c.strokeStyle = `rgba(255,246,224,${0.55 * edge})`;
      c.lineWidth = 2.2 / zoom;
      c.translate(0.5 / zoom, 1.3 / zoom);
      c.stroke(path);
    }
    c.restore();
  }
  c.restore();
};

/** Fibre texture only, for things filled some other way (text, gradients) */
export const fibreOver = (c: Ctx, k: Craft, path: Path2D, alpha: number, seed = 1) => {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = placeFibre(k, seed);
  c.fill(path);
  c.restore();
};

/* ---------- outlines ---------- */

/** Make the outline wind clockwise on screen so overlapping cut pieces union under nonzero */
export const orient = (pts: Pt[]): Pt[] => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a < 0 ? [...pts].reverse() : pts;
};

/**
 * Hand-cut outline: resampled into short scissor facets, each corner nudged a little.
 * Stable for a given seed. amp in px.
 */
export const cut = (pts: Pt[], amp = 1.4, seed = 1, step = 9): Pt[] => {
  let per = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    per += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const n = Math.max(8, Math.round(per / step));
  const rs = resample(pts, n);
  return rs.map(([x, y], i) => {
    const h1 = hash(seed * 17.3 + i * 1.91) - 0.5;
    const h2 = hash(seed * 5.9 + i * 3.37) - 0.5;
    // A slow wander so the cut drifts off the line like a real hand, plus per-facet nicks
    const w1 = noise1(i * 0.18, seed) * 0.8;
    const w2 = noise1(i * 0.18, seed + 3) * 0.8;
    return [x + (h1 + w1) * amp, y + (h2 + w2) * amp];
  });
};

/** Closed cut path from points */
export const cutPath = (pts: Pt[], amp = 1.4, seed = 1, step = 9, path: Path2D = new Path2D()) =>
  polyPath(orient(cut(pts, amp, seed, step)), true, path);

/** Ridge polygon: bottom-left, along y(x), bottom-right */
export const ridgePts = (y: (x: number) => number, x0: number, x1: number, bottom: number, step = 10): Pt[] => {
  const pts: Pt[] = [[x0, bottom]];
  for (let x = x0; x < x1; x += step) pts.push([x, y(x)]);
  pts.push([x1, y(x1)], [x1, bottom]);
  return pts;
};

/** A ridge sheet whose top edge is cut by hand (jitter keyed to x so it is stable as it moves) */
export const cutRidge = (y: (x: number) => number, x0: number, x1: number, bottom: number, seed = 1, amp = 1.5, step = 9, path: Path2D = new Path2D()) => {
  const pts: Pt[] = [[x0, bottom]];
  for (let x = x0; x < x1; x += step) {
    const j = (hash(seed * 13.7 + x * 0.071) - 0.5) * amp * 2 + noise1(x / 40, seed) * amp;
    pts.push([x, y(x) + j]);
  }
  pts.push([x1, y(x1)], [x1, bottom]);
  return polyPath(orient(pts), true, path);
};

/** The torn white fringe that peeks out above a ridge: rough, fibrous, a few px proud */
export const tornRidge = (y: (x: number) => number, x0: number, x1: number, bottom: number, lift = 5, seed = 1, path: Path2D = new Path2D()) => {
  const pts: Pt[] = [[x0, bottom]];
  for (let x = x0; x < x1; x += 3.2) {
    const big = 0.5 + 0.5 * noise1(x / 26, seed + 9);
    const jag = hash(seed * 3.3 + x * 0.37) * 2.6;
    pts.push([x, y(x) - lift * (0.35 + big) - jag]);
  }
  pts.push([x1, y(x1) - lift], [x1, bottom]);
  return polyPath(orient(pts), true, path);
};

/** Torn outline of a closed shape: pushes every point outward by a ragged amount */
export const tornPts = (pts: Pt[], lift = 4, seed = 1, step = 3.5): Pt[] => {
  const o = orient(pts);
  let per = 0;
  for (let i = 0; i < o.length; i++) {
    const p = o[i];
    const q = o[(i + 1) % o.length];
    per += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const n = Math.max(12, Math.round(per / step));
  const rs = resample(o, n);
  return rs.map((p, i) => {
    const a = rs[(i - 1 + n) % n];
    const b = rs[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // Outward normal for a clockwise (screen) outline
    const nx = -ty / l;
    const ny = tx / l;
    const big = 0.5 + 0.5 * noise1(i * 0.12, seed + 9);
    const d = lift * (0.3 + big) + hash(seed * 3.3 + i * 0.77) * 2.2;
    return [p[0] - nx * d, p[1] - ny * d];
  });
};

/** Irregular hand-cut ellipse */
export const blobPts = (cx: number, cy: number, rx: number, ry: number, seed = 1, wob = 0.07, n = 40, rot = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const k = 1 + wob * noise1(i * 0.45, seed) + wob * 0.6 * (hash(seed + i * 1.3) - 0.5);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });

/** Stacked-tier pine, hand-cut: points clockwise from the tip */
export const pinePts = (x: number, base: number, h: number, w: number, seed: number, tiers = 5): Pt[] => {
  const right: Pt[] = [];
  for (let k = 1; k <= tiers; k++) {
    const y = base - h + (h * 0.88 * k) / tiers;
    const ww = (w * (0.28 + 0.72 * (k / tiers))) / 2;
    const j = 0.88 + hash(seed + k * 7.1) * 0.24;
    right.push([x + ww * j, y], [x + ww * 0.42, y - h * 0.035]);
  }
  const pts: Pt[] = [[x + (hash(seed) - 0.5) * 3, base - h]];
  pts.push(...right.slice(0, -1));
  pts.push(right[right.length - 1]);
  const tw = Math.max(3, w * 0.07);
  pts.push([x + tw, base - h * 0.1], [x + tw, base + 40], [x - tw, base + 40], [x - tw, base - h * 0.1]);
  for (let i = right.length - 1; i >= 0; i--) {
    const jj = hash(seed + i * 3.9) * 0.16 - 0.08;
    pts.push([2 * x - right[i][0] - jj * w * 0.2, right[i][1]]);
  }
  return pts;
};

/** Leafy round tree: lumpy crown on a trunk, two sub-paths, both clockwise */
export const roundTree = (path: Path2D, x: number, base: number, h: number, w: number, seed: number) => {
  cutPath([[x - w * 0.06, base + 30], [x - w * 0.05, base - h * 0.5], [x + w * 0.05, base - h * 0.5], [x + w * 0.06, base + 30]], 0.8, seed, 8, path);
  const cy = base - h * 0.62;
  const pts: Pt[] = [];
  const n = 9;
  for (let i = 0; i < n * 6; i++) {
    const a = (i / (n * 6)) * TAU;
    const lobe = Math.abs(Math.sin((a * n) / 2));
    const k = 0.86 + 0.14 * lobe + 0.05 * noise1(i * 0.3, seed);
    pts.push([x + Math.cos(a) * w * 0.5 * k, cy + Math.sin(a) * h * 0.4 * k]);
  }
  cutPath(pts, 1, seed + 1, 7, path);
};

/* ---------- light ---------- */

/**
 * Warm soft light over the finished diorama, in screen space: one multiply pass, brightest
 * around the light and falling off to a warm vignette at the edges.
 */
export const warmLight = (c: Ctx, lx: number, ly: number, strength = 1, tint = '255,214,150') => {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const W = c.canvas.width;
  const H = c.canvas.height;
  const s = W / 1600;
  const [tr, tg, tb] = tint.split(',').map(Number);
  // Pull the light toward the frame centre so the vignette stays balanced
  const cx = lerp(800, lx, 0.45) * s;
  const cy = lerp(450, ly, 0.45) * s;
  const g = c.createRadialGradient(cx, cy, 120 * s, cx, cy, 1150 * s);
  const edge = (v: number, k: number) => Math.round(255 - (255 - v) * k);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.45, `rgb(255,${edge(tg + 30, 0.25 * strength)},${edge(tb + 40, 0.3 * strength)})`);
  g.addColorStop(1, `rgb(${edge(tr - 40, 0.55 * strength)},${edge(tg - 50, 0.6 * strength)},${edge(tb - 60, 0.65 * strength)})`);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.restore();
};

/* ---------- stamps: multi-part cut-outs with one shadow ---------- */

export interface Stamp {
  cv: HTMLCanvasElement;
  g: Ctx;
  w: number;
  h: number;
  /** Pixels per logical px */
  res: number;
  /** Origin from the top, as a fraction of h */
  oy: number;
}

export const makeStamp = (w: number, h: number, res: number, oy = 0.8): Stamp => {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * res);
  cv.height = Math.ceil(h * res);
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is unavailable');
  return { cv, g, w, h, res, oy };
};

/**
 * Paint a cut-out: art() draws its paper parts in local coords (origin = ground point), then the
 * whole figure gets fibre and lands on c at (x, y) with one shadow.
 */
export const stampDraw = (
  c: Ctx,
  k: Craft,
  st: Stamp,
  x: number,
  y: number,
  art: (g: Ctx) => void,
  o: { scale?: number; rot?: number; flip?: boolean; depth?: number; shadow?: number; tex?: number; seed?: number; alpha?: number } = {}
) => {
  const g = st.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, st.cv.width, st.cv.height);
  g.setTransform(st.res, 0, 0, st.res, (st.w * st.res) / 2, st.h * st.res * st.oy);
  g.save();
  art(g);
  g.restore();
  const tex = o.tex ?? 0.8;
  if (tex > 0) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = tex;
    g.fillStyle = placeFibre(k, o.seed ?? 5);
    g.fillRect(-st.w, -st.h, st.w * 2, st.h * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  c.save();
  c.translate(x, y);
  if (o.rot) c.rotate(o.rot);
  const s = o.scale ?? 1;
  c.scale(o.flip ? -s : s, s);
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  castShadow(c, o.depth ?? 7, o.shadow ?? 0.36);
  c.drawImage(st.cv, -st.w / 2, -st.h * st.oy, st.w, st.h);
  c.restore();
};

/** A small paper part inside a stamp: flat colour, optional little shadow onto the parts below */
export const part = (g: Ctx, p: Path2D, color: string, depth = 0, strength = 0.3) => {
  g.save();
  if (depth > 0) castShadow(g, depth, strength);
  g.fillStyle = color;
  g.fill(p);
  g.restore();
};

/** Capsule from a to b with width w, as a path */
export const limb = (a: Pt, b: Pt, w: number, w2 = w, p: Path2D = new Path2D()) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const ang = Math.atan2(dy, dx);
  p.moveTo(a[0] + nx * (w / 2), a[1] + ny * (w / 2));
  p.arc(a[0], a[1], w / 2, ang + Math.PI / 2, ang - Math.PI / 2);
  p.lineTo(b[0] - nx * (w2 / 2), b[1] - ny * (w2 / 2));
  p.arc(b[0], b[1], w2 / 2, ang - Math.PI / 2, ang + Math.PI / 2);
  p.closePath();
  return p;
};

/* ---------- the dog (adapted from the Luna riso film's rig) ---------- */

export interface DogPose {
  tilt: number;
  bob: number;
  neck: number;
  head: number;
  tail: number;
  /** [upper, lower] absolute angles from vertical, + is forward */
  ff: [number, number];
  fn: [number, number];
  /** Femur, tibia, metatarsal */
  bn: [number, number, number];
  bf: [number, number, number];
  /** 1 when sitting */
  sit: number;
}

export const SIT: DogPose = {
  tilt: -0.78,
  bob: 0,
  neck: -1.38,
  head: -0.3,
  tail: -0.35,
  fn: [0.1, 0.06],
  ff: [0.02, -0.02],
  bn: [1.42, -1.1, 1.57],
  bf: [1.36, -1.2, 1.5],
  sit: 1,
};

export const STAND: DogPose = {
  tilt: 0,
  bob: 0,
  neck: -0.85,
  head: 0.12,
  tail: 0.3,
  fn: [0.08, 0.04],
  ff: [-0.04, -0.06],
  bn: [0.5, -0.65, 0.05],
  bf: [0.42, -0.72, 0.0],
  sit: 0,
};

/** Gallop cycle, p in cycles */
export const run = (p: number): DogPose => {
  const front = (q: number): [number, number] => {
    const s = Math.sin(q * TAU);
    const c = Math.cos(q * TAU);
    const a = 0.12 + 0.85 * s;
    return [a, a - 1.25 * Math.max(0, c) + 0.1];
  };
  const back = (q: number): [number, number, number] => {
    const s = Math.sin(q * TAU);
    const c = Math.cos(q * TAU);
    const f = 0.5 - 0.8 * s;
    const ti = f - 1.15 - 0.45 * Math.max(0, -c);
    return [f, ti, ti + 0.7];
  };
  return {
    tilt: 0.08 * Math.sin(p * TAU + 0.6),
    bob: -5 * Math.max(0, Math.cos(p * TAU)),
    neck: -0.8 + 0.1 * Math.sin(p * TAU),
    head: 0.15 + 0.07 * Math.cos(p * TAU),
    tail: 0.25 + 0.2 * Math.sin(p * TAU * 2),
    fn: front(p),
    ff: front(p + 0.12),
    bn: back(p + 0.5),
    bf: back(p + 0.62),
    sit: 0,
  };
};

export const blendPose = (a: DogPose, b: DogPose, k: number): DogPose => {
  const l = (x: number[], y: number[]) => x.map((v, i) => lerp(v, y[i], k));
  return {
    tilt: lerp(a.tilt, b.tilt, k),
    bob: lerp(a.bob, b.bob, k),
    neck: lerp(a.neck, b.neck, k),
    head: lerp(a.head, b.head, k),
    tail: lerp(a.tail, b.tail, k),
    fn: l(a.fn, b.fn) as [number, number],
    ff: l(a.ff, b.ff) as [number, number],
    bn: l(a.bn, b.bn) as [number, number, number],
    bf: l(a.bf, b.bf) as [number, number, number],
    sit: lerp(a.sit, b.sit, k),
  };
};

/** An easy lope: the gallop with its swing scaled down toward standing */
export const lope = (p: number, amount = 0.62) => blendPose(STAND, run(p), amount);

const TORSO: Pt[] = [
  [50, -6], [46, -17], [32, -26], [10, -22], [-14, -20], [-34, -22], [-48, -19], [-56, -7],
  [-52, 8], [-38, 14], [-20, 6], [0, 8], [22, 15], [40, 12],
];
const SKULL: Pt[] = [
  [-4, -2], [3, -11], [14, -13], [22, -9], [27, -4], [38, -2], [44, -1], [47, 3], [43, 8], [30, 10], [16, 12], [4, 10], [-3, 5],
];
const EAR: Pt[] = [[5, -8], [3, -17], [1, -27], [10, -20], [15, -10]];
/** Rose ear that folds over at the tip */
const EAR_FOLD: Pt[] = [[1, -26], [10, -27], [16, -21], [9, -19]];
const MUZZLE: Pt[] = [[26, -3], [38, -2], [44, -1], [47, 3], [43, 8], [30, 10], [24, 6]];

const rotPt = ([x, y]: Pt, a: number, o: Pt): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - o[0];
  const dy = y - o[1];
  return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c];
};

type Seg = [Pt, Pt, number];

export interface DogShape {
  torso: Path2D;
  neck: Path2D;
  skull: Path2D;
  earFar: Path2D;
  earNear: Path2D;
  earFold: Path2D;
  muzzle: Path2D;
  chest: Path2D;
  /** Far legs then near legs */
  far: Seg[];
  near: Seg[];
  pawsFar: Pt[];
  pawsNear: Pt[];
  thighFar: [Pt, number];
  thighNear: [Pt, number];
  tail: Pt[];
  eye: Pt;
  nose: Pt;
  mouth: Pt;
  collar: [Pt, Pt];
  /** Lowest point, for standing her on the ground */
  low: number;
}

/** The dog in profile, facing right, origin at her body centre */
export const dogShape = (pose: DogPose): DogShape => {
  const hip: Pt = [-38, 2];
  const tp = (p: Pt) => rotPt(p, pose.tilt, hip);
  const torso = smoothPath(TORSO.map(tp), true, 0.5);

  const base = tp([38, -14]);
  const dir: Pt = [Math.cos(pose.neck), Math.sin(pose.neck)];
  const back: Pt = [Math.sin(pose.neck), -Math.cos(pose.neck)];
  const end: Pt = [base[0] + dir[0] * 26, base[1] + dir[1] * 26];
  const neck = smoothPath(
    [tp([20, -24]), [end[0] + back[0] * 10, end[1] + back[1] * 10], [end[0] - back[0] * 11, end[1] - back[1] * 11], tp([48, -2])],
    true,
    0.35
  );
  const hr = (q: Pt) => rotPt(q, pose.head, [0, 0]);
  const anchor = hr([5, 6]);
  const hp = (q: Pt): Pt => {
    const r = hr(q);
    return [r[0] - anchor[0] + end[0], r[1] - anchor[1] + end[1]];
  };
  const earFar = smoothPath(EAR.map(([x, y]) => hp([x - 6, y + 2])), true, 0.35);
  const skull = smoothPath(SKULL.map(hp), true, 0.5);
  const earNear = smoothPath(EAR.map(hp), true, 0.35);
  const earFold = smoothPath(EAR_FOLD.map(hp), true, 0.4);
  const muzzle = smoothPath(MUZZLE.map(hp), true, 0.5);
  // Pale chest: throat down to the front of the brisket
  const chest = smoothPath([tp([30, -8]), [end[0] + back[0] * -2, end[1] + back[1] * -2], hp([20, 10]), tp([50, -2]), tp([44, 12]), tp([30, 10])], true, 0.45);

  const far: Seg[] = [];
  const near: Seg[] = [];
  const pawsFar: Pt[] = [];
  const pawsNear: Pt[] = [];
  const step = (from: Pt, a: number, len: number): Pt => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];
  const sh = tp([30, 2]);
  const hj = tp([-38, 2]);
  const front = (a: number, b: number, out: Seg[], paws: Pt[]) => {
    const k = step(sh, a, 26);
    const f = step(k, b, 25);
    out.push([sh, k, 12], [k, f, 8.5]);
    paws.push(f);
  };
  front(pose.ff[0], pose.ff[1], far, pawsFar);
  front(pose.fn[0], pose.fn[1], near, pawsNear);
  let thighFar: [Pt, number] = [[0, 0], 0];
  let thighNear: [Pt, number] = [[0, 0], 0];
  const hind = (a: number, b: number, c: number, out: Seg[], paws: Pt[]): [Pt, number] => {
    const st = step(hj, a, 24);
    const hk = step(st, b, 22);
    const f = step(hk, c, 13);
    out.push([st, hk, 9], [hk, f, 7.5]);
    paws.push(f);
    return [[(hj[0] + st[0]) / 2, (hj[1] + st[1]) / 2], Math.atan2(st[1] - hj[1], st[0] - hj[0])];
  };
  thighFar = hind(pose.bf[0], pose.bf[1], pose.bf[2], far, pawsFar);
  thighNear = hind(pose.bn[0], pose.bn[1], pose.bn[2], near, pawsNear);
  const rump = tp([-53, -12]);
  const tail: Pt[] = [
    rump,
    [rump[0] - 16, rump[1] - 4 - 16 * pose.tail],
    [rump[0] - 30, rump[1] + 6 - 26 * pose.tail],
  ];
  let low = -Infinity;
  for (const p of [...pawsFar, ...pawsNear]) low = Math.max(low, p[1] + 3.5);
  low = Math.max(low, tp([-52, 8])[1]);
  return {
    torso, neck, skull, earFar, earNear, earFold, muzzle, chest, far, near, pawsFar, pawsNear, thighFar, thighNear, tail,
    eye: hp([19, -5]), nose: hp([46, 2]), mouth: hp([41, 7]),
    collar: [[base[0] - back[0] * 2 - dir[0] * 4, base[1] - back[1] * 2 - dir[1] * 4], [end[0], end[1]]],
    low,
  };
};

export interface DogLook {
  coat: string;
  shade: string;
  pale: string;
  ear: string;
  nose: string;
  scarf?: string;
}

/** Luna: fawn coat, cream chest and muzzle, darker ears */
export const LUNA_LOOK: DogLook = {
  coat: '#c8904f',
  shade: '#a06d38',
  pale: '#f1e3c4',
  ear: '#7d5530',
  nose: '#2b1d16',
  scarf: '#d24a3a',
};

/** Paint the dog's paper parts with her paws on y = 0 (call inside a stamp) */
export const dogArt = (g: Ctx, pose: DogPose, look: DogLook) => {
  const d = dogShape(pose);
  g.translate(0, -(d.low - pose.bob));
  const legs = (segs: Seg[], paws: Pt[], thigh: [Pt, number] | null, color: string, depth: number) => {
    const p = new Path2D();
    for (const [a, b, w] of segs) limb(a, b, w, w * 0.9, p);
    for (const f of paws) p.ellipse(f[0] + 3, f[1], 7, 4, 0, 0, TAU);
    if (thigh) p.ellipse(thigh[0][0], thigh[0][1], 17, 12, thigh[1], 0, TAU);
    part(g, p, color, depth, 0.25);
  };
  part(g, d.earFar, look.ear);
  legs(d.far, d.pawsFar, d.thighFar, look.shade, 0);
  // Tail
  const tl = new Path2D();
  limb(d.tail[0], d.tail[1], 8, 7, tl);
  limb(d.tail[1], d.tail[2], 7, 4, tl);
  part(g, tl, look.coat);
  part(g, d.torso, look.coat, 1.4);
  part(g, d.neck, look.coat);
  legs(d.near, d.pawsNear, d.thighNear, look.coat, 1.6);
  part(g, d.chest, look.pale, 0.8, 0.18);
  if (look.scarf) {
    const [a, b] = d.collar;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const sc = new Path2D();
    sc.moveTo(a[0] - 2, a[1] - 4);
    sc.lineTo(b[0] + 6, b[1] + 2);
    sc.lineTo(mx + 9, my + 16);
    sc.closePath();
    part(g, sc, look.scarf, 1.2, 0.3);
  }
  part(g, d.skull, look.coat, 1.2, 0.25);
  part(g, d.muzzle, look.pale, 0.6, 0.2);
  part(g, d.earNear, look.ear, 1.6, 0.3);
  part(g, d.earFold, look.shade, 0.6, 0.2);
  const nose = new Path2D();
  nose.ellipse(d.nose[0], d.nose[1], 4.2, 3.4, 0.2, 0, TAU);
  part(g, nose, look.nose);
  const eye = new Path2D();
  eye.arc(d.eye[0], d.eye[1], 2.3, 0, TAU);
  part(g, eye, look.nose);
};

/* ---------- people ---------- */

export interface PersonPose {
  /** Walk phase in cycles */
  q: number;
  /** Stride amount 0..1 */
  stride: number;
  /** 0 standing/walking, 1 seated */
  sit: number;
  /** Body lean forward, radians */
  lean: number;
  /** Near arm override: [upper, fore] absolute angles from vertical, + forward */
  arm?: [number, number];
  /**
   * Planted-foot walking: ankle targets [far, near] relative to the ground point under the hip
   * (solved with IK so boots stay put), and each boot's tilt
   */
  ankles?: [Pt, Pt];
  bootRot?: [number, number];
}

export interface PersonLook {
  skin: string;
  hat: string;
  hatKind: 'cap' | 'papakha';
  coat: string;
  coatShade: string;
  coatLong?: boolean;
  pants: string;
  pantsShade: string;
  boots: string;
  pack?: string;
  packShade?: string;
  staff?: string;
  /** Cut-paper limbs: tapered, faceted pieces instead of rounded strokes */
  cut?: boolean;
}

const THIGH = 44;
const SHIN = 42;
const TORSO_LEN = 60;

export interface PersonShape {
  hip: Pt;
  shoulder: Pt;
  head: Pt;
  legs: { hip: Pt; knee: Pt; ankle: Pt }[];
  arms: { sh: Pt; el: Pt; hand: Pt }[];
  dir: Pt;
  low: number;
}

export const personShape = (p: PersonPose): PersonShape => {
  const step = (from: Pt, a: number, len: number): Pt => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];
  const hip: Pt = [0, -(THIGH + SHIN + 8) + 2 * Math.cos(p.q * TAU * 2) * p.stride * (1 - p.sit)];
  const legs = [0.5, 0].map((off) => {
    const q = (p.q + off) * TAU;
    const th = 0.44 * p.stride * Math.sin(q);
    const bend = (0.08 + 0.95 * Math.max(0, Math.cos(q)) ** 2) * p.stride;
    const a = lerp(th, 1.42, p.sit);
    const b = lerp(th - bend, 0.12 + off * 0.3, p.sit);
    const knee = step(hip, a, THIGH);
    const ankle = step(knee, b, SHIN);
    return { hip, knee, ankle };
  });
  const dir: Pt = [Math.sin(p.lean), -Math.cos(p.lean)];
  const shoulder: Pt = [hip[0] + dir[0] * TORSO_LEN, hip[1] + dir[1] * TORSO_LEN];
  const head: Pt = [shoulder[0] + dir[0] * 20 + 2, shoulder[1] + dir[1] * 20];
  const arms = [0, 0.5].map((off, i) => {
    const q = (p.q + off) * TAU;
    let ua = -0.42 * p.stride * Math.sin(q) + p.lean * 0.5;
    let fa = ua + 0.35 + 0.2 * p.stride;
    ua = lerp(ua, 0.5, p.sit);
    fa = lerp(fa, 1.25, p.sit);
    if (i === 1 && p.arm) [ua, fa] = p.arm;
    const sh: Pt = [shoulder[0] - dir[0] * 4, shoulder[1] - dir[1] * 4];
    const el = step(sh, ua, 29);
    const hand = step(el, fa, 27);
    return { sh, el, hand };
  });
  let low = -Infinity;
  for (const l of legs) low = Math.max(low, l.ankle[1] + 7);
  if (p.ankles) {
    // IK legs: the hip rides a little below full reach so the knees keep a soft bend.
    // Everything is grounded (y = 0 at the ground under the hip), blending toward the seat
    const k = 1 - p.sit;
    const ih: Pt = [0, -(THIGH + SHIN + 3) + 2 * Math.cos(p.q * TAU * 2) * p.stride];
    const gr = (q: Pt): Pt => [q[0], q[1] - low];
    const mixPt = (a: Pt, b: Pt): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    const ik = legs.map((l, i) => {
      const target: Pt = [p.ankles![i][0], p.ankles![i][1] - 7];
      const knee = ik2(ih, target, THIGH, SHIN, -1);
      const dx = target[0] - knee[0];
      const dy = target[1] - knee[1];
      const d = Math.hypot(dx, dy) || 1;
      const ankle: Pt = [knee[0] + (dx / d) * SHIN, knee[1] + (dy / d) * SHIN];
      return { hip: mixPt(gr(l.hip), ih), knee: mixPt(gr(l.knee), knee), ankle: mixPt(gr(l.ankle), ankle) };
    });
    const fh = gr(hip);
    const nh = ik[0].hip;
    const move = (q: Pt): Pt => [q[0] + nh[0] - fh[0], q[1] - low + nh[1] - fh[1]];
    return {
      hip: nh,
      shoulder: move(shoulder),
      head: move(head),
      legs: ik,
      arms: arms.map((a) => ({ sh: move(a.sh), el: move(a.el), hand: move(a.hand) })),
      dir,
      low: 0,
    };
  }
  return { hip, shoulder, head, legs, arms, dir, low };
};

/**
 * A walker in profile, facing right, feet on y = 0. parts: 'body' leaves out the near arm,
 * 'arm' draws only the near arm (so it can rest on someone drawn in between).
 */
export const personArt = (g: Ctx, pose: PersonPose, look: PersonLook, parts: 'all' | 'body' | 'arm' = 'all') => {
  const s = personShape(pose);
  g.translate(0, -s.low);
  const boot = (ankle: Pt, knee: Pt, color: string, i: number) => {
    const p = new Path2D();
    const a = pose.bootRot ? pose.bootRot[i] / 0.4 : Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]) - Math.PI / 2;
    const c = Math.cos(a * 0.4);
    const si = Math.sin(a * 0.4);
    const pts: Pt[] = [[-6, -6], [6, -7], [8, -1], [17, 1], [18, 7], [-7, 7]];
    polyPath(pts.map(([x, y]) => [ankle[0] + x * c - y * si, ankle[1] + x * si + y * c] as Pt), true, p);
    part(g, p, color);
  };
  const leg = (i: number, color: string) => {
    const l = s.legs[i];
    const p = new Path2D();
    if (look.cut) {
      taper(l.hip, l.knee, 19, 14, p, { ext0: 6, ext1: 4, seed: i * 7 + 1 });
      joint(l.knee, 7.2, p, i * 7 + 2);
      taper(l.knee, l.ankle, 14, 10, p, { ext0: 3, ext1: 4, seed: i * 7 + 3, bulge: 1.5 });
    } else {
      limb(l.hip, l.knee, 17, 14, p);
      limb(l.knee, l.ankle, 14, 11, p);
    }
    part(g, p, color, i === 1 ? 1.2 : 0, 0.25);
    boot(l.ankle, l.knee, look.boots, i);
  };
  const arm = (i: number, color: string, depth: number) => {
    const a = s.arms[i];
    const p = new Path2D();
    if (look.cut) {
      taper(a.sh, a.el, 14, 11, p, { ext0: 4, ext1: 3, seed: i * 5 + 40 });
      joint(a.el, 5.6, p, i * 5 + 41);
      taper(a.el, a.hand, 11, 8.5, p, { ext0: 2, ext1: 2, seed: i * 5 + 42 });
    } else {
      limb(a.sh, a.el, 12, 11, p);
      limb(a.el, a.hand, 11, 9, p);
    }
    part(g, p, color, depth, 0.28);
    const h = new Path2D();
    h.arc(a.hand[0], a.hand[1], 5.2, 0, TAU);
    part(g, h, look.skin);
  };
  if (parts === 'arm') {
    arm(1, look.coat, 1.6);
    return;
  }
  const { hip, shoulder, dir } = s;
  const nx = -dir[1];
  const ny = dir[0];
  if (look.staff) {
    const a = s.arms[0];
    const st = new Path2D();
    const top: Pt = [a.hand[0] + 6, a.hand[1] - 34];
    limb(top, [a.hand[0] + 16, s.low - 2], 4, 4, st);
    st.arc(top[0] - 7, top[1], 7, 0, Math.PI, true);
    part(g, st, look.staff);
    const hook = new Path2D();
    hook.arc(top[0] - 7, top[1], 7, Math.PI, TAU);
    hook.arc(top[0] - 7, top[1], 3.2, TAU, Math.PI, true);
    hook.closePath();
    part(g, hook, look.staff);
  }
  arm(0, look.coatShade, 0);
  leg(0, look.pantsShade);
  if (look.pack) {
    // Pack behind the back
    const pk = new Path2D();
    const bx = shoulder[0] - nx * 14;
    const by = shoulder[1] - ny * 14;
    const pts: Pt[] = [
      [bx - nx * 14 - dir[0] * 4, by - ny * 14 - dir[1] * 4],
      [bx + nx * 6 - dir[0] * 6, by + ny * 6 - dir[1] * 6],
      [bx + nx * 8 - dir[0] * 50, by + ny * 8 - dir[1] * 50],
      [bx - nx * 16 - dir[0] * 46, by - ny * 16 - dir[1] * 46],
    ];
    smoothPath(pts, true, 0.25, pk);
    part(g, pk, look.pack, 0, 0);
    const roll = new Path2D();
    roll.ellipse(bx - nx * 4 + dir[0] * 4, by - ny * 4 + dir[1] * 4, 14, 7, Math.atan2(ny, nx), 0, TAU);
    part(g, roll, look.packShade ?? look.pack, 0.8, 0.25);
  }
  leg(1, look.pants);
  // Torso: a tapered jacket from hips to shoulders, a coat flares to the knee
  const tor = new Path2D();
  const hw = 14;
  const sw = 15;
  const tpts: Pt[] = look.coatLong
    ? [
        [shoulder[0] - nx * sw, shoulder[1] - ny * sw],
        [shoulder[0] + nx * (sw - 2), shoulder[1] + ny * (sw - 2)],
        [hip[0] + nx * (hw + 4), hip[1] + ny * (hw + 4)],
        [hip[0] + nx * 22 + 4, hip[1] + 40],
        [hip[0] - nx * 18 - 6, hip[1] + 42],
        [hip[0] - nx * (hw + 2), hip[1] - ny * (hw + 2)],
      ]
    : [
        [shoulder[0] - nx * sw, shoulder[1] - ny * sw],
        [shoulder[0] + nx * (sw - 2), shoulder[1] + ny * (sw - 2)],
        [hip[0] + nx * (hw + 1), hip[1] + ny * (hw + 1) + 6],
        [hip[0] - nx * hw, hip[1] - ny * hw + 6],
      ];
  smoothPath(tpts, true, 0.2, tor);
  part(g, tor, look.coat, 1.4, 0.28);
  if (look.pack) {
    const strap = new Path2D();
    limb([shoulder[0] + nx * 2, shoulder[1] + ny * 2], [hip[0] + nx * 6 - dir[0] * 16, hip[1] + ny * 6 - dir[1] * 16], 4, 4, strap);
    part(g, strap, look.packShade ?? look.pack);
  }
  // Head, hair, hat
  const hd = s.head;
  const neck = new Path2D();
  limb(shoulder, hd, 9, 9, neck);
  part(g, neck, look.skin);
  const head = new Path2D();
  head.ellipse(hd[0], hd[1], 12, 13.5, pose.lean * 0.6, 0, TAU);
  part(g, head, look.skin, 0.8, 0.2);
  const nose = new Path2D();
  nose.moveTo(hd[0] + 10, hd[1] - 3);
  nose.lineTo(hd[0] + 16, hd[1] + 3);
  nose.lineTo(hd[0] + 10, hd[1] + 4);
  part(g, nose, look.skin);
  const hat = new Path2D();
  if (look.hatKind === 'cap') {
    hat.ellipse(hd[0] - 1, hd[1] - 5, 13.5, 10, pose.lean * 0.6, Math.PI, TAU);
    hat.closePath();
    const brim = new Path2D();
    brim.ellipse(hd[0] + 11 + pose.lean * 6, hd[1] - 5 + pose.lean * 3, 11, 3.2, 0.12 + pose.lean * 0.6, 0, TAU);
    part(g, hat, look.hat, 0.6, 0.2);
    part(g, brim, look.hat, 0.6, 0.2);
  } else {
    // Tall sheepskin hat: a woolly drum, cut with a scalloped top
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push([hd[0] - 15 + i * 3, hd[1] - 30 - (i % 2 ? 2.2 : 0)]);
    pts.push([hd[0] + 15, hd[1] - 5], [hd[0] - 15, hd[1] - 6]);
    polyPath(pts, true, hat);
    part(g, hat, look.hat, 0.8, 0.25);
  }
  const eye = new Path2D();
  eye.arc(hd[0] + 6, hd[1] - 1.5, 1.6, 0, TAU);
  part(g, eye, '#2a1d16');
  if (parts === 'all') arm(1, look.coat, 1.6);
};

/* ---------- small utilities ---------- */

/** Ease a camera value through a list of keys: [time, value] */
export const keys = (t: number, ks: [number, number][], fn: (k: number) => number) => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const k = fn(clamp((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
      return lerp(ks[i - 1][1], ks[i][1], k);
    }
  }
  return ks[ks.length - 1][1];
};

/** Mix two colours given as #rrggbb (returns #rrggbb, so results can be mixed again) */
export const mix = (a: string, b: string, k: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp(k)));
  return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');
};

/* ---------- plates: static layers baked once, then moved by the camera ---------- */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  x: number;
  y: number;
  z: number;
}

export interface Plate extends Rect {
  p: number;
  cv: HTMLCanvasElement | null;
}

/** The camera for a layer at parallax depth p (1 = the ground plane) */
export const layerView = (v: View, p: number): View => ({
  x: 800 + (v.x - 800) * p,
  y: 450 + (v.y - 450) * p,
  z: 1 + (v.z - 1) * p,
});

/** Union of everything a layer at depth p shows over a set of camera samples */
export const viewRect = (views: View[], p: number, pad = 50): Rect => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of views) {
    const l = layerView(v, p);
    const hw = 800 / l.z;
    const hh = 450 / l.z;
    x0 = Math.min(x0, l.x - hw);
    x1 = Math.max(x1, l.x + hw);
    y0 = Math.min(y0, l.y - hh);
    y1 = Math.max(y1, l.y + hh);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
};

export const clipRect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(1, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(1, Math.min(a.y + a.h, b.y + b.h) - y) };
};

/** Bake a static layer at about screen resolution (capped so big plates stay within memory) */
export const bakePlate = (r: Riso, p: number, rect: Rect, draw: (g: Ctx) => void, maxRes = 1.25, maxPx = 12e6): Plate => {
  let res = Math.min(r.scale, maxRes);
  if (rect.w * rect.h * res * res > maxPx) res = Math.sqrt(maxPx / (rect.w * rect.h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(rect.w * res));
  cv.height = Math.max(1, Math.ceil(rect.h * res));
  const g = cv.getContext('2d');
  if (!g) return { ...rect, p, cv: null };
  g.setTransform(res, 0, 0, res, -rect.x * res, -rect.y * res);
  draw(g);
  return { ...rect, p, cv };
};

export const drawPlate = (c: Ctx, pl: Plate) => {
  if (pl.cv) c.drawImage(pl.cv, pl.x, pl.y, pl.w, pl.h);
};

/* ---------- cut-paper limbs ---------- */

/** Two-bone IK: the middle joint for a chain root -> target. bend -1 puts it in front (+x) of the line, +1 behind */
export const ik2 = (r: Pt, t: Pt, a: number, b: number, bend: 1 | -1): Pt => {
  const dx = t[0] - r[0];
  const dy = t[1] - r[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.01, a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const ang = base + bend * Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  return [r[0] + Math.cos(ang) * a, r[1] + Math.sin(ang) * a];
};

/**
 * A tapered limb piece cut from paper: flat-ended, faceted, w0 at a narrowing to w1 at b.
 * bulge swells one side at 40% along (+ is the side to the left of a -> b, i.e. the rear of a
 * leg pointing down and forward).
 */
export const taper = (
  a: Pt,
  b: Pt,
  w0: number,
  w1: number,
  p: Path2D = new Path2D(),
  o: { ext0?: number; ext1?: number; bulge?: number; seed?: number } = {}
) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const e0 = o.ext0 ?? 0;
  const e1 = o.ext1 ?? 0;
  const A: Pt = [a[0] - ux * e0, a[1] - uy * e0];
  const B: Pt = [b[0] + ux * e1, b[1] + uy * e1];
  const m = 0.4;
  const M: Pt = [lerp(A[0], B[0], m), lerp(A[1], B[1], m)];
  const wm = lerp(w0, w1, m) / 2;
  const bg = o.bulge ?? 0;
  const pts: Pt[] = [
    [A[0] + nx * (w0 / 2), A[1] + ny * (w0 / 2)],
    [M[0] + nx * (wm + Math.max(0, bg)), M[1] + ny * (wm + Math.max(0, bg))],
    [B[0] + nx * (w1 / 2), B[1] + ny * (w1 / 2)],
    [B[0] - nx * (w1 / 2), B[1] - ny * (w1 / 2)],
    [M[0] - nx * (wm + Math.max(0, -bg)), M[1] - ny * (wm + Math.max(0, -bg))],
    [A[0] - nx * (w0 / 2), A[1] - ny * (w0 / 2)],
  ];
  return cutPath(pts, 0.3, o.seed ?? 1, 4, p);
};

/** A small faceted joint piece so bends read as a knuckle of paper, not a gap */
export const joint = (c: Pt, r: number, p: Path2D = new Path2D(), seed = 1) => {
  const pts: Pt[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + seed;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return cutPath(pts, 0.2, seed, 3, p);
};

/* ---------- Luna: a dog rig with real leg anatomy ---------- */

/** Absolute angles from vertical (+ forward): front [upper arm, forearm, pastern], hind [thigh, gaskin, metatarsal] */
export type LegAngles = [number, number, number];

export interface LunaPose {
  /** Body pitch about the hip, - lifts the chest (sitting) */
  tilt: number;
  neck: number;
  head: number;
  tail: number;
  ff: LegAngles;
  fn: LegAngles;
  bf: LegAngles;
  bn: LegAngles;
}

export const FRONT_LEN: [number, number, number] = [20, 24, 9];
export const HIND_LEN: [number, number, number] = [23, 23, 15];

const vec = (a: number, l: number): Pt => [Math.sin(a) * l, Math.cos(a) * l];
const angOf = (from: Pt, to: Pt) => Math.atan2(to[0] - from[0], to[1] - from[1]);

const L_HIP: Pt = [-38, 2];
const lrot = (p: Pt, a: number) => rotPt(p, a, L_HIP);

/** Leg roots for a given body pitch: shoulder and hip, near and far */
export const lunaRoots = (tilt: number) => ({
  fn: lrot([30, 0], tilt),
  ff: lrot([25, -2], tilt),
  bn: lrot([-36, -2], tilt),
  bf: lrot([-41, -4], tilt),
});

/** Joint positions from angles: [root, elbow|stifle, carpus|hock, paw] */
export const legFK = (root: Pt, a: LegAngles, len: [number, number, number]): Pt[] => {
  const j1: Pt = [root[0] + vec(a[0], len[0])[0], root[1] + vec(a[0], len[0])[1]];
  const j2: Pt = [j1[0] + vec(a[1], len[1])[0], j1[1] + vec(a[1], len[1])[1]];
  const j3: Pt = [j2[0] + vec(a[2], len[2])[0], j2[1] + vec(a[2], len[2])[1]];
  return [root, j1, j2, j3];
};

/** Front leg reaching a paw target: the elbow folds back, pastern held at angle pa */
export const frontIK = (root: Pt, paw: Pt, pa: number): LegAngles => {
  const v = vec(pa, FRONT_LEN[2]);
  const carpus: Pt = [paw[0] - v[0], paw[1] - v[1]];
  const elbow = ik2(root, carpus, FRONT_LEN[0], FRONT_LEN[1], 1);
  return [angOf(root, elbow), angOf(elbow, carpus), pa];
};

/** Hind leg reaching a paw target: stifle forward, hock behind, metatarsal held at angle ma */
export const hindIK = (root: Pt, paw: Pt, ma: number): LegAngles => {
  const v = vec(ma, HIND_LEN[2]);
  const hock: Pt = [paw[0] - v[0], paw[1] - v[1]];
  const stifle = ik2(root, hock, HIND_LEN[0], HIND_LEN[1], -1);
  return [angOf(root, stifle), angOf(stifle, hock), ma];
};

export const mixLeg = (a: LegAngles, b: LegAngles, k: number): LegAngles => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export const mixLuna = (a: LunaPose, b: LunaPose, k: number): LunaPose => ({
  tilt: lerp(a.tilt, b.tilt, k),
  neck: lerp(a.neck, b.neck, k),
  head: lerp(a.head, b.head, k),
  tail: lerp(a.tail, b.tail, k),
  ff: mixLeg(a.ff, b.ff, k),
  fn: mixLeg(a.fn, b.fn, k),
  bf: mixLeg(a.bf, b.bf, k),
  bn: mixLeg(a.bn, b.bn, k),
});

/**
 * Foot placement through a gait cycle, in stride units relative to the leg's neutral spot.
 * During stance (q < duty) the foot is planted and slides back relative to the body exactly
 * as fast as the body moves forward, so in the world it stays put.
 */
export const gaitFoot = (phi: number, off: number, duty: number) => {
  const q = (((phi + off) % 1) + 1) % 1;
  if (q < duty) return { rel: duty / 2 - q, lift: 0, swing: -1 };
  const s = (q - duty) / (1 - duty);
  const e = s * s * (3 - 2 * s);
  return { rel: lerp(-duty / 2, duty / 2, e), lift: Math.sin(Math.PI * s), swing: s };
};

/** The sit, built for the new legs: chest up, front legs straight, haunch folded */
export const LUNA_SIT_HIND: LegAngles = [1.42, -1.32, 1.5];
export const LUNA_SIT_HIND_FAR: LegAngles = [1.36, -1.36, 1.46];
export const LUNA_SIT_TILT = -0.62;

const L_TORSO: Pt[] = [
  [52, -6], [48, -18], [34, -27], [12, -23], [-12, -21], [-34, -23], [-48, -20], [-57, -8],
  [-54, 7], [-42, 13], [-24, 7], [-4, 9], [16, 18], [36, 17], [48, 8],
];
/** Broad skull, clear stop, a deeper blunt muzzle: shepherd-mastiff */
const L_SKULL: Pt[] = [
  [-5, -1], [2, -12], [13, -15], [22, -11], [26, -6], [36, -5], [43, -3], [46, 2], [45, 8], [37, 12], [25, 13], [12, 13], [2, 10], [-4, 5],
];
const L_MUZZLE: Pt[] = [[25, -5], [36, -5], [43, -3], [46, 2], [45, 8], [37, 12], [25, 12], [21, 4]];
/** Rose ear: up from the skull, tip folded forward */
const L_EAR: Pt[] = [[4, -9], [1, -18], [5, -24], [13, -20], [15, -10]];
const L_EAR_FOLD: Pt[] = [[5, -24], [14, -24], [18, -17], [12, -18]];

export interface LunaShape {
  torso: Path2D;
  neck: Path2D;
  skull: Path2D;
  earFar: Path2D;
  earNear: Path2D;
  earFold: Path2D;
  muzzle: Path2D;
  chest: Path2D;
  tail: Pt[];
  eye: Pt;
  nose: Pt;
  collar: [Pt, Pt];
  legs: { ff: Pt[]; fn: Pt[]; bf: Pt[]; bn: Pt[] };
  /** Lowest point of paws, hocks and rump */
  low: number;
}

export const lunaShape = (pose: LunaPose): LunaShape => {
  const tp = (p: Pt) => lrot(p, pose.tilt);
  const torso = smoothPath(L_TORSO.map(tp), true, 0.5);
  const base = tp([40, -15]);
  const dir: Pt = [Math.cos(pose.neck), Math.sin(pose.neck)];
  const back: Pt = [Math.sin(pose.neck), -Math.cos(pose.neck)];
  const end: Pt = [base[0] + dir[0] * 25, base[1] + dir[1] * 25];
  const neck = smoothPath(
    [tp([18, -25]), [end[0] + back[0] * 11, end[1] + back[1] * 11], [end[0] - back[0] * 12, end[1] - back[1] * 12], tp([50, 0])],
    true,
    0.35
  );
  const hr = (q: Pt) => rotPt(q, pose.head, [0, 0]);
  const anchor = hr([5, 6]);
  const hp = (q: Pt): Pt => {
    const r = hr(q);
    return [r[0] - anchor[0] + end[0], r[1] - anchor[1] + end[1]];
  };
  const chest = smoothPath([tp([32, -8]), [end[0] - back[0] * 2, end[1] - back[1] * 2], hp([22, 12]), tp([52, -4]), tp([46, 12]), tp([34, 17]), tp([26, 12])], true, 0.45);
  const roots = lunaRoots(pose.tilt);
  const legs = {
    ff: legFK(roots.ff, pose.ff, FRONT_LEN),
    fn: legFK(roots.fn, pose.fn, FRONT_LEN),
    bf: legFK(roots.bf, pose.bf, HIND_LEN),
    bn: legFK(roots.bn, pose.bn, HIND_LEN),
  };
  const rump = tp([-55, -10]);
  const tail: Pt[] = [
    rump,
    [rump[0] - 13, rump[1] + 6 - 10 * pose.tail],
    [rump[0] - 22, rump[1] + 20 - 18 * pose.tail],
    [rump[0] - 26 - 6 * pose.tail, rump[1] + 34 - 30 * pose.tail],
  ];
  let low = -Infinity;
  for (const l of [legs.ff, legs.fn, legs.bf, legs.bn]) low = Math.max(low, l[3][1] + 3.5, l[2][1] + 3);
  low = Math.max(low, tp([-54, 7])[1]);
  return {
    torso, neck, chest, tail, legs, low,
    skull: smoothPath(L_SKULL.map(hp), true, 0.5),
    earFar: smoothPath(L_EAR.map(([x, y]) => hp([x - 6, y + 2])), true, 0.35),
    earNear: smoothPath(L_EAR.map(hp), true, 0.35),
    earFold: smoothPath(L_EAR_FOLD.map(hp), true, 0.4),
    muzzle: smoothPath(L_MUZZLE.map(hp), true, 0.5),
    eye: hp([19, -6]),
    nose: hp([45, 1]),
    collar: [[base[0] - back[0] * 2 - dir[0] * 4, base[1] - back[1] * 2 - dir[1] * 4], [end[0], end[1]]],
  };
};

/** A compact paw: toes forward, flat pad on the ground; rot tips it when the foot is lifted */
const pawPath = (c: Pt, rot: number, p: Path2D, seed: number) => {
  const pts: Pt[] = [[-5, -4], [2, -5.5], [7, -4], [9.5, -0.5], [9, 3.5], [-5, 3.5]];
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return cutPath(pts.map(([x, y]) => [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs] as Pt), 0.25, seed, 3, p);
};

const frontLegPath = (j: Pt[], seed: number) => {
  const upper = new Path2D();
  taper(j[0], j[1], 16, 12, upper, { ext0: 6, ext1: 3, seed });
  joint(j[1], 5.6, upper, seed + 1);
  taper(j[1], j[2], 10, 8, upper, { ext0: 2, ext1: 2.5, seed: seed + 2 });
  const lower = new Path2D();
  joint(j[2], 4.2, lower, seed + 3);
  taper(j[2], j[3], 7.6, 6.6, lower, { ext0: 1.5, ext1: 0, seed: seed + 4 });
  pawPath([j[3][0] + 2, j[3][1]], (angOf(j[2], j[3]) - 0.25) * 0.5, lower, seed + 5);
  return { upper, lower };
};

const hindLegPath = (j: Pt[], seed: number) => {
  const [hip, st, hock, paw] = j;
  // Muscular thigh: wide at the hip, swelling behind, narrowing to the stifle
  const dx = st[0] - hip[0];
  const dy = st[1] - hip[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const at = (k: number, side: number): Pt => [hip[0] + dx * k + nx * side, hip[1] + dy * k + ny * side];
  const thigh = new Path2D();
  cutPath(
    [at(-0.35, 15), at(-0.4, -10), at(0.3, -12), at(1.0, -5.5), [st[0] + ux * 5, st[1] + uy * 5], at(1.0, 6.5), at(0.55, 14), at(0.1, 19)],
    0.3,
    seed,
    4,
    thigh
  );
  const lower = new Path2D();
  taper(st, hock, 12.5, 7, lower, { ext0: 3, ext1: 2, bulge: 2.5, seed: seed + 1 });
  joint(hock, 4, lower, seed + 2);
  taper(hock, paw, 6.8, 6.2, lower, { ext0: 1.5, ext1: 0, seed: seed + 3 });
  pawPath([paw[0] + 2, paw[1]], (angOf(hock, paw) - 0.1) * 0.5, lower, seed + 4);
  return { thigh, lower };
};

/** Paint Luna, origin at her body centre (call inside a stamp) */
export const lunaArt = (g: Ctx, pose: LunaPose, look: DogLook) => {
  const d = lunaShape(pose);
  const farPale = mix(look.pale, look.shade, 0.45);
  part(g, d.earFar, look.ear);
  // Far legs: a darker sheet tucked behind the body
  const ff = frontLegPath(d.legs.ff, 11);
  part(g, ff.upper, look.shade);
  part(g, ff.lower, farPale);
  const bf = hindLegPath(d.legs.bf, 21);
  part(g, bf.lower, look.shade);
  part(g, bf.thigh, look.shade);
  // Tail: three tapering cuts, hanging low with a lift at the tip
  const tl = new Path2D();
  taper(d.tail[0], d.tail[1], 10, 8, tl, { ext0: 4, ext1: 2, seed: 31 });
  taper(d.tail[1], d.tail[2], 8, 6.5, tl, { ext0: 2, ext1: 2, seed: 32 });
  taper(d.tail[2], d.tail[3], 6.5, 3.5, tl, { ext0: 1, ext1: 2, seed: 33 });
  part(g, tl, look.coat);
  part(g, d.torso, look.coat, 1.4);
  part(g, d.neck, look.coat);
  // Near legs over the body, each with a whisper of shadow onto it
  const bn = hindLegPath(d.legs.bn, 41);
  part(g, bn.lower, look.coat, 1);
  part(g, bn.thigh, look.coat, 1.4, 0.26);
  const fn = frontLegPath(d.legs.fn, 51);
  part(g, fn.upper, look.coat, 1.2, 0.24);
  part(g, fn.lower, look.pale, 0.8, 0.2);
  part(g, d.chest, look.pale, 0.8, 0.18);
  if (look.scarf) {
    const [a, b] = d.collar;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const sc = new Path2D();
    cutPath([[a[0] - 2, a[1] - 4], [b[0] + 6, b[1] + 2], [mx + 9, my + 16]], 0.3, 61, 4, sc);
    part(g, sc, look.scarf, 1.2, 0.3);
  }
  part(g, d.skull, look.coat, 1.2, 0.25);
  part(g, d.muzzle, look.pale, 0.6, 0.2);
  part(g, d.earNear, look.ear, 1.6, 0.3);
  part(g, d.earFold, look.shade, 0.6, 0.2);
  const nose = new Path2D();
  nose.ellipse(d.nose[0], d.nose[1], 4.6, 3.6, 0.2, 0, TAU);
  part(g, nose, look.nose);
  const eye = new Path2D();
  eye.arc(d.eye[0], d.eye[1], 2.2, 0, TAU);
  part(g, eye, look.nose);
};
