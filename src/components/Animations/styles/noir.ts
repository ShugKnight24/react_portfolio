/**
 * Noir series: shared look for the black-and-white cinematic films (direct mode).
 *
 * The film paints a grey-scale scene through `noirCam` (camera plus a stepped 24 fps gate weave),
 * then `finish` runs the print through the projector: highlight halation (the frame itself is
 * thresholded, blurred at low resolution and screened back), a lens vignette, exposure flicker,
 * dust, hairs and scratches, heavy grain that changes every frame (one of several cached tiles,
 * re-offset by the frame index so it stays deterministic) and the 2.39:1 letterbox.
 *
 * Shared drawing helpers: light shafts and venetian-blind beams, fog bands, rain, puddle
 * ripples, glows, serif title cards and a figure rig (trench coat and fedora, or a belted coat
 * and a wide brim) built from two-bone IK with tapered limbs, hands and a profile head. Figures
 * are filled as one silhouette with an offset rim pass, so a back light wraps their edges.
 */
import type { Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, hash, mulberry, noise1, smoothPath, type Pt } from '../riso/kit';

export const NOIR = {
  black: '#030303',
  night: '#0a0a0b',
  deep: '#121213',
  shadow: '#1b1b1c',
  dark: '#29292a',
  iron: '#3a3a3b',
  mid: '#565657',
  gray: '#7c7c7c',
  silver: '#a6a6a4',
  light: '#cfcecb',
  pale: '#e4e2dc',
  white: '#f6f4ee',
  /** Film 1 accent: a match flame */
  flame: '#ff9a3c',
  ember: '#ff5a1f',
  /** Film 2 accent: tail lights and one rule */
  red: '#d4252b',
} as const;

export const NOIR_SERIF = '"Didot", "Bodoni 72", "Bodoni MT", "Playfair Display", "Times New Roman", Georgia, serif';
export const NOIR_TEXT = '"Baskerville", "Libre Baskerville", "Times New Roman", Georgia, serif';

/** 2.39:1 picture inside the 1600 x 900 frame */
export const LB_H = 1600 / 2.39;
export const LB_TOP = (900 - LB_H) / 2;
export const LB_BOT = 900 - LB_TOP;

export const FPS = 24;
export const frameOf = (t: number) => Math.floor(t * FPS + 1e-6);

/** rgba() from a #rrggbb colour */
export const rgba = (col: string, a: number) => {
  const n = parseInt(col.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};

/** Grey of value v (0..1) */
export const grey = (v: number, a = 1) => {
  const g = Math.round(clamp(v) * 255);
  return `rgba(${g},${g},${g},${clamp(a)})`;
};

export const mixHex = (a: string, b: string, k: number) => {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((na >> s) & 255, (nb >> s) & 255, clamp(k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/* ---------- geometry ---------- */

export const poly = (pts: Pt[], p: Path2D = new Path2D(), closed = true) => {
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
};

export const circle = (cx: number, cy: number, r: number, p: Path2D = new Path2D()) => {
  p.moveTo(cx + Math.max(0.1, r), cy);
  p.arc(cx, cy, Math.max(0.1, r), 0, TAU);
  return p;
};

export const rect = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

export const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0, p: Path2D = new Path2D()) => {
  p.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx);
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  return p;
};

/** Convex hull (monotone chain) */
export const hull = (pts: Pt[]): Pt[] => {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up: Pt[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
};

export const linGrad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [k, col] of stops) g.addColorStop(clamp(k), col);
  return g;
};

export const radGrad = (c: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) => {
  const g = c.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(r0 + 0.1, r1));
  for (const [k, col] of stops) g.addColorStop(clamp(k), col);
  return g;
};

/* ---------- light ---------- */

/** Soft additive glow (halation around a practical light) */
export const glow = (c: Ctx, x: number, y: number, r: number, a = 1, col: string = NOIR.white, core = 0) => {
  if (a <= 0.005 || r <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = radGrad(c, x, y, 0, r, [
    [0, rgba(col, a)],
    [clamp(core + 0.12), rgba(col, a * 0.55)],
    [0.45, rgba(col, a * 0.16)],
    [1, rgba(col, 0)],
  ]);
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
};

/** Volumetric beam from (x0, y0) toward (x1, y1), widening from w0 to w1, fading out along its length */
export const shaft = (
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  a: number,
  col: string = NOIR.white,
  fadeIn = 0.04
) => {
  if (a <= 0.004) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const p = poly([
    [x0 + nx * w0 * 0.5, y0 + ny * w0 * 0.5],
    [x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5],
    [x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5],
    [x0 - nx * w0 * 0.5, y0 - ny * w0 * 0.5],
  ]);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = linGrad(c, x0, y0, x1, y1, [
    [0, rgba(col, a * 0.4)],
    [fadeIn, rgba(col, a)],
    [0.35, rgba(col, a * 0.55)],
    [1, rgba(col, 0)],
  ]);
  c.fill(p);
  c.restore();
};

export interface BlindOpts {
  /** window rectangle */
  x: number;
  y: number;
  w: number;
  h: number;
  slats: number;
  /** fraction of each slat pitch that lets light through */
  open: number;
  /** light travel vector (length = how far the beams reach) */
  vx: number;
  vy: number;
  /** spread of the beams at their far end (multiplier) */
  spread?: number;
  a: number;
  col?: string;
}

/** Venetian-blind light: one swept sheet of light per gap between the slats */
export const blindShafts = (c: Ctx, o: BlindOpts) => {
  if (o.a <= 0.004) return;
  const pitch = o.h / o.slats;
  const gap = pitch * clamp(o.open);
  const sp = o.spread ?? 1.15;
  const col = o.col ?? NOIR.white;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const ccx = o.x + o.w / 2;
  const ccy = o.y + o.h / 2;
  const g = linGrad(c, ccx, ccy, ccx + o.vx, ccy + o.vy, [
    [0, rgba(col, o.a)],
    [0.3, rgba(col, o.a * 0.55)],
    [1, rgba(col, 0)],
  ]);
  c.fillStyle = g;
  const all = new Path2D();
  for (let i = 0; i < o.slats; i++) {
    const ya = o.y + i * pitch + (pitch - gap) * 0.5;
    const yb = ya + gap;
    // the far end spreads around the window centre
    const fy = (y: number) => ccy + (y - ccy) * sp + o.vy;
    const fx = (x: number) => ccx + (x - ccx) * sp + o.vx;
    poly(
      hull([
        [o.x, ya],
        [o.x + o.w, ya],
        [o.x + o.w, yb],
        [o.x, yb],
        [fx(o.x), fy(ya)],
        [fx(o.x + o.w), fy(ya)],
        [fx(o.x + o.w), fy(yb)],
        [fx(o.x), fy(yb)],
      ]),
      all
    );
  }
  c.fill(all);
  c.restore();
};

/* ---------- atmosphere ---------- */

export interface RainOpts {
  seed: number;
  n: number;
  /** box the drops live in (current transform) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** fall speed px/s and wind slant (dx per dy) */
  speed: number;
  slant: number;
  len: number;
  width: number;
  a: number;
  /** scroll offsets (for parallax), added before wrapping */
  ox?: number;
  oy?: number;
  col?: string;
}

/** Rain streaks: one batched stroke, positions wrap inside the box */
export const rain = (c: Ctx, t: number, o: RainOpts) => {
  if (o.a <= 0.004 || o.n <= 0) return;
  const w = o.x1 - o.x0;
  const h = o.y1 - o.y0;
  const p = new Path2D();
  const n = Math.floor(o.n);
  for (let i = 0; i < n; i++) {
    const sp = o.speed * (0.8 + hash(i * 3.17 + o.seed) * 0.4);
    let y = hash(i * 7.31 + o.seed * 1.7) * h + t * sp + (o.oy ?? 0);
    y = ((y % h) + h) % h;
    let x = hash(i * 1.93 + o.seed * 3.1) * w + y * o.slant + (o.ox ?? 0);
    x = ((x % w) + w) % w;
    const l = o.len * (0.6 + hash(i * 5.7 + o.seed) * 0.8);
    p.moveTo(o.x0 + x, o.y0 + y);
    p.lineTo(o.x0 + x - o.slant * l, o.y0 + y - l);
  }
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = rgba(o.col ?? NOIR.pale, o.a);
  c.lineWidth = o.width;
  c.stroke(p);
  c.restore();
};

/** Expanding rings of raindrops on standing water, inside an ellipse region */
export const ripples = (
  c: Ctx,
  t: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  seed: number,
  a: number,
  maxR = 26,
  col: string = NOIR.pale
) => {
  if (a <= 0.004 || n <= 0) return;
  const buckets = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < n; i++) {
    const period = 0.7 + hash(i * 2.3 + seed) * 0.9;
    const ph = hash(i * 9.1 + seed * 0.7);
    const u = (t / period + ph) % 1;
    const cyc = Math.floor(t / period + ph);
    const ang = hash(i * 4.4 + cyc * 1.3 + seed) * TAU;
    const rr = Math.sqrt(hash(i * 6.2 + cyc * 2.9 + seed));
    const x = cx + Math.cos(ang) * rx * rr * 0.92;
    const y = cy + Math.sin(ang) * ry * rr * 0.85;
    const R = maxR * (0.5 + hash(i + seed * 3) * 0.6) * u;
    const b = buckets[Math.min(2, Math.floor(u * 3))];
    b.moveTo(x + R, y);
    b.ellipse(x, y, Math.max(0.1, R), Math.max(0.1, R * (ry / rx) * 0.9), 0, 0, TAU);
    if (u > 0.25) {
      const R2 = R * 0.55;
      b.moveTo(x + R2, y);
      b.ellipse(x, y, Math.max(0.1, R2), Math.max(0.1, R2 * (ry / rx) * 0.9), 0, 0, TAU);
    }
  }
  c.save();
  c.lineWidth = 1.1;
  for (let k = 0; k < 3; k++) {
    c.strokeStyle = rgba(col, a * (1 - k * 0.33));
    c.stroke(buckets[k]);
  }
  c.restore();
};

/** Seeded fog sheet (tileable horizontally), soft blobs on transparent */
const makeFog = (seed: number) => {
  const W = 1024;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is unavailable');
  const rng = mulberry(seed);
  for (let i = 0; i < 150; i++) {
    const x = rng() * W;
    const y = H * (0.36 + rng() * 0.28);
    const r = 30 + rng() * 60;
    const a = 0.05 + rng() * 0.09;
    for (const ox of [-W, 0, W]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  return cv;
};

/* ---------- the projector ---------- */

export interface NoirFX {
  grain: CanvasPattern[];
  vignette: HTMLCanvasElement;
  b1: { canvas: HTMLCanvasElement; ctx: Ctx };
  b2: { canvas: HTMLCanvasElement; ctx: Ctx };
  fog: HTMLCanvasElement[];
}

const mk = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
};

const GRAIN_TILES = 6;

/** Build the grain tiles, vignette, halation buffers and fog sheets. Call from setup */
export const createNoirFX = (r: Riso): NoirFX => {
  const c0 = r.layers[0];
  const grain: CanvasPattern[] = [];
  for (let k = 0; k < GRAIN_TILES; k++) {
    const S = 256;
    const { canvas, ctx } = mk(S, S);
    const rng = mulberry(101 + k * 37);
    // coarse clumps at half resolution
    const coarse = mk(S / 2, S / 2);
    const ci = coarse.ctx.createImageData(S / 2, S / 2);
    for (let i = 0; i < ci.data.length; i += 4) {
      const v = 128 + (rng() + rng() + rng() - 1.5) * 70;
      ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = v;
      ci.data[i + 3] = 255;
    }
    coarse.ctx.putImageData(ci, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(coarse.canvas, 0, 0, S, S);
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const fine = (rng() + rng() - 1) * 60;
      const v = clamp((d[i] - 128) * 0.8 + fine + 128, 0, 255);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const p = c0.createPattern(canvas, 'repeat');
    if (p) grain.push(p);
  }
  const v = r.scratch(1600, 900);
  const g = v.ctx.createRadialGradient(800, 450, 220, 800, 470, 1020);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.12)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0.92)');
  v.ctx.fillStyle = g;
  v.ctx.fillRect(0, 0, 1600, 900);
  return {
    grain,
    vignette: v.canvas,
    b1: mk(400, 225),
    b2: mk(160, 90),
    fog: [makeFog(31), makeFog(57)],
  };
};

/** Horizontal fog band centred on y, scrolled by `scroll`, in the current transform */
export const fogBand = (
  c: Ctx,
  fx: NoirFX,
  x0: number,
  x1: number,
  y: number,
  h: number,
  scroll: number,
  a: number,
  which = 0,
  tile = 1400
) => {
  if (a <= 0.004) return;
  const img = fx.fog[which % fx.fog.length];
  c.save();
  c.globalCompositeOperation = 'screen';
  c.globalAlpha = clamp(a);
  const off = ((scroll % tile) + tile) % tile;
  for (let x = x0 - off; x < x1; x += tile) c.drawImage(img, x, y - h / 2, tile + 1, h);
  c.restore();
};

/** Gate weave: stepped at 24 fps, in logical px */
export const weave = (t: number, amt = 1) => {
  const f = frameOf(t);
  return {
    dx: (noise1(f * 0.13, 3) * 1.5 + (hash(f * 1.7) - 0.5) * 0.5) * amt,
    dy: (noise1(f * 0.11, 9) * 1.2 + (hash(f * 2.3 + 4) - 0.5) * 0.45) * amt,
    rot: noise1(f * 0.07, 5) * 0.0009 * amt,
  };
};

/** Camera with the gate weave folded in */
export const noirCam = (r: Riso, t: number, cx: number, cy: number, z = 1, rot = 0, amt = 1) => {
  const w = weave(t, amt);
  r.camera(cx - w.dx / z, cy - w.dy / z, z, rot + w.rot);
};

/**
 * Highlight halation: threshold the finished frame at low resolution, blur it and screen it back.
 * Call with any transform; it works in device space.
 */
export const halation = (c: Ctx, fx: NoirFX, amt = 1, threshold = 0.62) => {
  if (amt <= 0.01) return;
  const src = c.canvas;
  const dw = src.width;
  const dh = src.height;
  const { b1, b2 } = fx;
  const thr = clamp(threshold, 0.2, 0.95);
  // brightness then contrast keeps only values above ~thr
  const bri = 0.5 / thr;
  b1.ctx.setTransform(1, 0, 0, 1, 0, 0);
  b1.ctx.globalCompositeOperation = 'copy';
  b1.ctx.filter = `brightness(${bri.toFixed(3)}) contrast(5) blur(2px)`;
  b1.ctx.drawImage(src, 0, 0, b1.canvas.width, b1.canvas.height);
  b1.ctx.filter = 'none';
  b2.ctx.setTransform(1, 0, 0, 1, 0, 0);
  b2.ctx.globalCompositeOperation = 'copy';
  b2.ctx.filter = 'blur(4px)';
  b2.ctx.drawImage(b1.canvas, 0, 0, b2.canvas.width, b2.canvas.height);
  b2.ctx.filter = 'none';
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'screen';
  c.globalAlpha = clamp(0.55 * amt);
  c.drawImage(b1.canvas, 0, 0, dw, dh);
  c.globalAlpha = clamp(0.85 * amt);
  c.drawImage(b2.canvas, 0, 0, dw, dh);
  c.restore();
};

export interface FinishOpts {
  halation?: number;
  threshold?: number;
  vignette?: number;
  grain?: number;
  damage?: number;
  flicker?: number;
  letterbox?: boolean;
  /** fade the picture to black (0..1), applied before grain */
  black?: number;
  /** flash the picture to white (0..1) */
  white?: number;
}

/** Dust specks, hairs and a running scratch: chosen per frame from the frame index */
const damage = (c: Ctx, t: number, dw: number, dh: number, sc: number, amt: number) => {
  if (amt <= 0.01) return;
  const f = frameOf(t);
  const rng = mulberry(f * 7919 + 13);
  c.save();
  // dust
  const n = rng() < 0.55 * amt ? 1 + Math.floor(rng() * 3 * amt) : 0;
  for (let i = 0; i < n; i++) {
    const x = rng() * dw;
    const y = (LB_TOP / 900) * dh + rng() * (LB_H / 900) * dh;
    const rr = (1 + rng() * rng() * 5) * sc;
    const white = rng() < 0.3;
    c.fillStyle = white ? 'rgba(235,235,230,0.55)' : 'rgba(0,0,0,0.75)';
    c.beginPath();
    const k = 5 + Math.floor(rng() * 4);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * TAU;
      const q = rr * (0.55 + rng() * 0.6);
      if (j === 0) c.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      else c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
    c.closePath();
    c.fill();
  }
  // a hair, rarely
  if (rng() < 0.05 * amt) {
    const x = rng() * dw;
    const y = (0.25 + rng() * 0.5) * dh;
    const L = (30 + rng() * 60) * sc;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1.1 * sc;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + L * 0.4, y - L * 0.3, x + L * 0.2, y + L * 0.5, x + L * (0.6 + rng() * 0.4), y + L * 0.2);
    c.stroke();
  }
  // running scratch: lives for a block of frames, wanders a little
  const b = Math.floor(f / 20);
  if (hash(b * 3.7 + 1) < 0.45 * amt && hash(f * 1.1) < 0.85) {
    const x = (hash(b * 5.3) * 0.9 + 0.05) * dw + noise1(f * 0.3, b) * 6 * sc;
    c.strokeStyle = hash(b * 9.1) < 0.5 ? 'rgba(240,240,235,0.22)' : 'rgba(0,0,0,0.35)';
    c.lineWidth = (0.7 + hash(f) * 0.6) * sc;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + noise1(f * 0.5, 2) * 3 * sc, dh);
    c.stroke();
  }
  c.restore();
};

/** Run the frame through the projector: halation, vignette, flicker, damage, grain, letterbox */
export const finish = (c: Ctx, fx: NoirFX, t: number, o: FinishOpts = {}) => {
  const dw = c.canvas.width;
  const dh = c.canvas.height;
  const sc = dw / 1600;
  const f = frameOf(t);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  halation(c, fx, o.halation ?? 1, o.threshold ?? 0.62);
  if ((o.white ?? 0) > 0.005) {
    c.fillStyle = `rgba(250,248,242,${clamp(o.white ?? 0)})`;
    c.fillRect(0, 0, dw, dh);
  }
  const vg = o.vignette ?? 1;
  if (vg > 0.01) {
    c.globalAlpha = clamp(vg);
    c.drawImage(fx.vignette, 0, 0, dw, dh);
    c.globalAlpha = 1;
  }
  const fl = (o.flicker ?? 1) * (hash(f * 0.77 + 2) - 0.5) * 0.09;
  if (fl > 0) {
    c.fillStyle = `rgba(0,0,0,${fl})`;
    c.fillRect(0, 0, dw, dh);
  } else if (fl < 0) {
    c.globalCompositeOperation = 'screen';
    c.fillStyle = `rgba(255,255,255,${-fl * 0.35})`;
    c.fillRect(0, 0, dw, dh);
    c.globalCompositeOperation = 'source-over';
  }
  if ((o.black ?? 0) > 0.005) {
    c.fillStyle = `rgba(0,0,0,${clamp(o.black ?? 0)})`;
    c.fillRect(0, 0, dw, dh);
  }
  damage(c, t, dw, dh, sc, o.damage ?? 1);
  const gr = o.grain ?? 0.6;
  if (gr > 0.01 && fx.grain.length) {
    const p = fx.grain[f % fx.grain.length];
    const s = Math.max(1, sc * 1.1);
    p.setTransform(new DOMMatrix().translate(hash(f * 1.31) * 256, hash(f * 2.77 + 1) * 256).scale(s, s));
    c.fillStyle = p;
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = clamp(gr);
    c.fillRect(0, 0, dw, dh);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  if (o.letterbox !== false) {
    c.fillStyle = '#000';
    const bh = Math.round((LB_TOP / 900) * dh);
    c.fillRect(0, 0, dw, bh);
    c.fillRect(0, dh - bh, dw, bh);
  }
  c.restore();
};

/* ---------- title cards ---------- */

export interface TitleOpts {
  size: number;
  spacing?: number;
  weight?: number | string;
  italic?: boolean;
  font?: string;
  col?: string;
  a?: number;
  /** soft bloom behind the letters */
  bloom?: number;
  align?: 'center' | 'left' | 'right';
}

/** Width of letter-spaced text */
export const spacedWidth = (c: Ctx, text: string, spacing: number) => {
  const chars = Array.from(text);
  return chars.reduce((s, ch) => s + c.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
};

/** Letter-spaced serif line, centred on x by default */
export const title = (c: Ctx, text: string, x: number, y: number, o: TitleOpts) => {
  const a = o.a ?? 1;
  if (a <= 0.004) return;
  c.save();
  c.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${o.font ?? NOIR_SERIF}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const sp = o.spacing ?? 0;
  const chars = Array.from(text);
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + sp * Math.max(0, chars.length - 1);
  let cx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
  const col = o.col ?? NOIR.white;
  const passes: [number, number][] = [];
  if ((o.bloom ?? 0) > 0) passes.push([o.bloom ?? 0, 0]);
  passes.push([0, 1]);
  for (const [bl, solid] of passes) {
    c.save();
    if (bl > 0) {
      c.filter = `blur(${(o.size * 0.12).toFixed(1)}px)`;
      c.globalAlpha = clamp(a * bl);
      c.globalCompositeOperation = 'lighter';
    } else {
      c.globalAlpha = clamp(a * solid);
    }
    c.fillStyle = col;
    let xx = cx;
    chars.forEach((ch, i) => {
      c.fillText(ch, xx, y);
      xx += widths[i] + sp;
    });
    c.restore();
  }
  cx += total;
  c.restore();
  return total;
};

/** Pre-render static art (title blocks with bloom) into a scratch canvas of logical size w x h */
export const bake = (r: Riso, w: number, h: number, draw: (g: Ctx) => void) => {
  const sc = r.scratch(w, h);
  draw(sc.ctx);
  return sc.canvas;
};

/** Thin rule with a diamond in the middle */
export const rule = (c: Ctx, x: number, y: number, w: number, a = 1, col: string = NOIR.pale, lw = 1.2) => {
  if (a <= 0.004 || w <= 0) return;
  c.save();
  c.globalAlpha = clamp(a);
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.lineTo(x - 9, y);
  c.moveTo(x + 9, y);
  c.lineTo(x + w / 2, y);
  c.stroke();
  c.beginPath();
  c.moveTo(x, y - 4);
  c.lineTo(x + 4, y);
  c.lineTo(x, y + 4);
  c.lineTo(x - 4, y);
  c.closePath();
  c.fill();
  c.restore();
};

/* ---------- figure rig ---------- */

/** Bone lengths at scale 1 (a figure ~345 px tall with a hat; ground is RIG.ground below the hip) */
export const RIG = {
  thigh: 84,
  shin: 82,
  ua: 60,
  fa: 55,
  torso: 112,
  neck: 13,
  ground: 172,
} as const;

export type Hand = 'relaxed' | 'fist' | 'cup' | 'pinch' | 'pocket' | 'open';

export interface Pose {
  /** torso lean forward from vertical (rad) */
  lean: number;
  /** head tilt relative to the torso (rad, positive nods forward / down) */
  head?: number;
  /** ankle targets relative to the hip (local units, +x forward, +y down) */
  ankleN: Pt;
  ankleF: Pt;
  /** foot pitch (rad, positive toes down) */
  footN?: number;
  footF?: number;
  /** wrist targets relative to the hip */
  wristN: Pt;
  wristF: Pt;
  /** elbow side: +1 elbow back (default), -1 forward */
  elbowN?: number;
  elbowF?: number;
  handN?: Hand;
  handF?: Hand;
  /** extra hand rotation (rad) */
  rotN?: number;
  rotF?: number;
  /** coat-tail flutter (-1..1) */
  flare?: number;
  /** seated: the coat drapes over the thighs instead of hanging to the knees */
  seated?: boolean;
}

export interface Bones {
  hip: Pt;
  neck: Pt;
  neckTop: Pt;
  headAng: number;
  shN: Pt;
  shF: Pt;
  elN: Pt;
  elF: Pt;
  wrN: Pt;
  wrF: Pt;
  knN: Pt;
  knF: Pt;
  anN: Pt;
  anF: Pt;
  /** hand frames: angle of the hand axis (rad, canvas convention) */
  haN: number;
  haF: number;
  /** points in local units: mouth, eye, hand tips */
  mouth: Pt;
  eye: Pt;
  tipN: Pt;
  tipF: Pt;
}

/** Two-bone IK: the middle joint between a and t, bending to the `bend` side */
export const ik = (a: Pt, t: Pt, l1: number, l2: number, bend: number): Pt => {
  const dx = t[0] - a[0];
  const dy = t[1] - a[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const al = Math.acos(cosA) * bend;
  return [a[0] + Math.cos(base + al) * l1, a[1] + Math.sin(base + al) * l1];
};

const reachEnd = (a: Pt, j: Pt, t: Pt, l2: number): Pt => {
  const dx = t[0] - j[0];
  const dy = t[1] - j[1];
  const d = Math.hypot(dx, dy) || 1;
  return [j[0] + (dx / d) * l2, j[1] + (dy / d) * l2];
};

const rotP = (p: Pt, a: number): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

/** Hand outlines in a wrist frame: +y along the forearm, +x the thumb side */
const HANDS: Record<Exclude<Hand, 'pocket'>, Pt[]> = {
  relaxed: [
    [-4.6, 0],
    [4.4, 0],
    [6.2, 4.5],
    [8.4, 10.5],
    [6.6, 12],
    [5, 11],
    [5.2, 15],
    [4.4, 19.5],
    [2.2, 22.6],
    [-0.6, 22],
    [-3.6, 18.5],
    [-5.4, 12],
    [-5.6, 5],
  ],
  open: [
    [-4.6, 0],
    [4.4, 0],
    [7, 3.6],
    [11, 8.4],
    [9.6, 10],
    [5.6, 9.2],
    [5.6, 15.5],
    [5, 22],
    [2.6, 25],
    [-1, 24.6],
    [-3.6, 20],
    [-5.4, 12],
    [-5.6, 5],
  ],
  fist: [
    [-5, 0],
    [4.8, 0],
    [7, 5],
    [8.4, 10.6],
    [7.4, 14.6],
    [4, 17.4],
    [-1.4, 17.6],
    [-5.6, 14.4],
    [-6.6, 8],
  ],
  cup: [
    [-4.8, 0],
    [4.4, 0],
    [6.4, 5],
    [9.4, 9.6],
    [12.8, 11.8],
    [13.6, 15],
    [11.4, 17.6],
    [7.2, 18.6],
    [2.4, 18.4],
    [-2.4, 16.2],
    [-5.6, 11],
    [-6, 5],
  ],
  pinch: [
    [-5, 0],
    [4.8, 0],
    [6.8, 4.6],
    [10.6, 8.4],
    [14.6, 10.6],
    [14, 12.4],
    [9, 13],
    [6, 15.4],
    [1.4, 17.4],
    [-3.6, 16],
    [-6.2, 11],
    [-6.2, 5],
  ],
};
const HAND_TIPS: Record<Hand, Pt> = {
  relaxed: [2, 22],
  open: [2.6, 24.5],
  fist: [3, 16],
  cup: [9, 13],
  pinch: [14.6, 11.4],
  pocket: [0, 0],
};

/** Head in profile facing +x, origin at the top of the neck */
const HEAD: Pt[] = [
  [-6.5, 2],
  [-12.5, -9],
  [-16, -20],
  [-15.5, -31],
  [-10, -39.5],
  [-1, -42.5],
  [8, -39.5],
  [12.6, -33],
  [14, -27.2],
  [12.8, -24.6],
  [14.4, -22],
  [18.4, -15.6],
  [17.6, -13.8],
  [15.2, -13],
  [15.8, -10.6],
  [14.6, -9],
  [15.4, -7.4],
  [14.4, -4.6],
  [13.4, -1.6],
  [9.4, 0.4],
  [4, -1.4],
  [3, 3.6],
];

export interface Look {
  /** silhouette fill */
  body: string;
  /** far limbs (defaults to body) */
  far?: string;
  /** rim light colour and its offset in world px (the rim shows on that side) */
  rim?: string;
  rimDx?: number;
  rimDy?: number;
  /** second, softer rim on the other side */
  rim2?: string;
  rim2Dx?: number;
  rim2Dy?: number;
  /** fold lines, belt, hat band */
  detail?: string;
  /** top light: a gradient laid over the shoulders and hat */
  top?: string;
  hat?: 'fedora' | 'brim' | 'none';
  kind?: 'man' | 'woman';
  /** warm light on face and hands, local units */
  light?: { x: number; y: number; r: number; col: string; a: number };
  /** cigarette in the mouth: ember brightness 0..1 (negative: no cigarette) */
  smoke?: number;
}

/** Solve the rig for a pose; everything in local units, hip at the origin, facing +x */
export const solve = (p: Pose): Bones => {
  const lean = p.lean;
  const up: Pt = [Math.sin(lean), -Math.cos(lean)];
  const hip: Pt = [0, 0];
  const neck: Pt = [up[0] * RIG.torso, up[1] * RIG.torso];
  const hAng = lean + (p.head ?? 0) * 0.5;
  const neckTop: Pt = [neck[0] + Math.sin(hAng) * RIG.neck, neck[1] - Math.cos(hAng) * RIG.neck];
  const shN: Pt = [up[0] * 100 + 1.5, up[1] * 100];
  const shF: Pt = [up[0] * 100 - 4, up[1] * 100 + 1];
  const elN = ik(shN, p.wristN, RIG.ua, RIG.fa, p.elbowN ?? 1);
  const elF = ik(shF, p.wristF, RIG.ua, RIG.fa, p.elbowF ?? 1);
  const wrN = reachEnd(shN, elN, p.wristN, RIG.fa);
  const wrF = reachEnd(shF, elF, p.wristF, RIG.fa);
  const knN = ik(hip, p.ankleN, RIG.thigh, RIG.shin, -1);
  const knF = ik([-3, 1], p.ankleF, RIG.thigh, RIG.shin, -1);
  const anN = reachEnd(hip, knN, p.ankleN, RIG.shin);
  const anF = reachEnd([-3, 1], knF, p.ankleF, RIG.shin);
  const haN = Math.atan2(wrN[1] - elN[1], wrN[0] - elN[0]) - Math.PI / 2 + (p.rotN ?? 0);
  const haF = Math.atan2(wrF[1] - elF[1], wrF[0] - elF[0]) - Math.PI / 2 + (p.rotF ?? 0);
  const head = hAng + (p.head ?? 0) * 0.5;
  const mouth = add(neckTop, rotP([15.6, -9.4], head));
  const eye = add(neckTop, rotP([10.6, -25], head));
  // hand frame: +y along the forearm; for a right-facing figure the thumb is on +x when hanging
  const tipN = add(wrN, rotP(HAND_TIPS[p.handN ?? 'relaxed'], haN));
  const tipF = add(wrF, rotP(HAND_TIPS[p.handF ?? 'relaxed'], haF));
  return { hip, neck, neckTop, headAng: head, shN, shF, elN, elF, wrN, wrF, knN, knF, anN, anF, haN, haF, mouth, eye, tipN, tipF };
};

/** Tapered capsule from a to b: radius r0 at a, rm in the middle, r1 at b */
export const taper = (a: Pt, b: Pt, r0: number, rm: number, r1: number, p: Path2D = new Path2D(), n = 6) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 0.001;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const rad = (k: number) => (k < 0.5 ? lerp(r0, rm, Math.sin(k * Math.PI)) : lerp(r1, rm, Math.sin(k * Math.PI)));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const r = rad(k);
    pts.push([a[0] + ux * L * k + nx * r, a[1] + uy * L * k + ny * r]);
  }
  for (let j = 1; j < 6; j++) {
    const th = (j / 6) * Math.PI;
    pts.push([b[0] + (nx * Math.cos(th) + ux * Math.sin(th)) * r1, b[1] + (ny * Math.cos(th) + uy * Math.sin(th)) * r1]);
  }
  for (let i = n; i >= 0; i--) {
    const k = i / n;
    const r = rad(k);
    pts.push([a[0] + ux * L * k - nx * r, a[1] + uy * L * k - ny * r]);
  }
  for (let j = 1; j < 6; j++) {
    const th = (j / 6) * Math.PI;
    pts.push([a[0] + (-nx * Math.cos(th) - ux * Math.sin(th)) * r0, a[1] + (-ny * Math.cos(th) - uy * Math.sin(th)) * r0]);
  }
  return poly(pts, p);
};

const handPath = (kind: Hand, wr: Pt, ang: number, p: Path2D) => {
  if (kind === 'pocket') return p;
  const pts = HANDS[kind].map((q) => add(wr, rotP(q, ang)));
  return smoothPath(pts, true, 0.45, p);
};

const footPath = (an: Pt, pitch: number, woman: boolean, p: Path2D) => {
  const pts: Pt[] = woman
    ? [
        [-4.5, -3],
        [4, -3.5],
        [12, 1],
        [22, 5.5],
        [24, 8],
        [20, 9],
        [8, 6],
        [-1, 4],
        [-3.5, 11],
        [-5.5, 11],
        [-6, 3],
      ]
    : [
        [-5.5, -4],
        [5, -4.5],
        [11, -1],
        [22, 3],
        [27, 5.6],
        [27.6, 9.2],
        [24, 10.4],
        [-4, 10.4],
        [-7.4, 9.4],
        [-7.6, 2],
      ];
  return smoothPath(
    pts.map((q) => add(an, rotP(q, pitch))),
    true,
    0.3,
    p
  );
};

/** Coat/torso outline from the solved bones */
const coatPts = (b: Bones, p: Pose, woman: boolean): Pt[] => {
  const lean = p.lean;
  const L = (x: number, y: number): Pt => rotP([x, y], lean);
  const fl = p.flare ?? 0;
  const kneeFront = Math.max(b.knN[0], b.knF[0]);
  const kneeBack = Math.min(b.knN[0], b.knF[0]);
  const kneeY = (b.knN[1] + b.knF[1]) / 2;
  if (p.seated) {
    const thighEnd: Pt = [lerp(b.hip[0], kneeFront, 0.92), lerp(b.hip[1], b.knN[1], 0.92)];
    return [
      L(-6, -124),
      L(-17, -108),
      L(-20, -84),
      L(-17, -40),
      L(-19, -4),
      [-20, 12],
      [thighEnd[0] - 6, thighEnd[1] + 14],
      [thighEnd[0] + 4, thighEnd[1] + 4],
      [thighEnd[0] + 2, thighEnd[1] - 12],
      L(20, -10),
      L(18, -36),
      L(22, -74),
      L(18, -102),
      L(10, -124),
    ];
  }
  if (woman) {
    const hemY = Math.max(kneeY + 34, 118);
    return [
      L(-5, -122),
      L(-15, -106),
      L(-16, -82),
      L(-11, -42),
      L(-17, -6),
      [kneeBack - 16 - fl * 14, hemY + 2],
      [lerp(kneeBack, kneeFront, 0.5) - 2, hemY + 6],
      [kneeFront + 13, hemY],
      L(18, -6),
      L(13, -40),
      L(19, -72),
      L(16, -100),
      L(9, -122),
    ];
  }
  const hemY = kneeY + 10;
  return [
    L(-4, -125),
    L(-11, -117),
    L(-20, -106),
    L(-22, -86),
    L(-19, -44),
    L(-24, -8),
    [kneeBack - 17 - fl * 22, hemY + 4],
    [lerp(kneeBack, kneeFront, 0.5) - 4 - fl * 8, hemY + 9],
    [kneeFront + 19 - fl * 4, hemY + 2],
    L(25, -6),
    L(22, -38),
    L(25, -76),
    L(22, -99),
    L(16, -114),
    L(10, -124),
  ];
};

export interface FigureParts {
  far: Path2D;
  body: Path2D;
  head: Path2D;
  hat: Path2D;
  hands: Path2D;
  bones: Bones;
}

/** Build the silhouette parts in local units */
export const figureParts = (p: Pose, look: Look): FigureParts => {
  const b = solve(p);
  const woman = look.kind === 'woman';
  const far = new Path2D();
  const body = new Path2D();
  const head = new Path2D();
  const hat = new Path2D();
  const hands = new Path2D();
  const sl = woman ? 0.82 : 1;
  // far arm and leg
  taper(b.shF, b.elF, 12 * sl, 11.5 * sl, 9.6 * sl, far);
  taper(b.elF, b.wrF, 9.6 * sl, 9 * sl, 7.4 * sl, far);
  handPath(p.handF ?? 'relaxed', b.wrF, b.haF, far);
  taper([-3, 1], b.knF, 14, 13, 9.6, far);
  taper(b.knF, b.anF, woman ? 7 : 9.4, woman ? 7.4 : 9.6, woman ? 4.4 : 7.4, far);
  footPath(b.anF, p.footF ?? 0, woman, far);
  // coat and near leg
  poly(coatPts(b, p, woman), body);
  taper(b.hip, b.knN, 14, 13, 9.6, body);
  taper(b.knN, b.anN, woman ? 7 : 9.4, woman ? 7.6 : 9.8, woman ? 4.4 : 7.4, body);
  footPath(b.anN, p.footN ?? 0, woman, body);
  // neck
  taper(b.neck, b.neckTop, 8, 7, 7.4, body);
  // near arm (sleeve over shoulder)
  circle(b.shN[0] - 1, b.shN[1] + 5, 11.5 * sl, body);
  taper(b.shN, b.elN, 12.5 * sl, 12 * sl, 10 * sl, body);
  taper(b.elN, b.wrN, 10 * sl, 9.4 * sl, 8 * sl, body);
  handPath(p.handN ?? 'relaxed', b.wrN, b.haN, hands);
  // head
  const ha = b.headAng;
  const H = (q: Pt): Pt => add(b.neckTop, rotP(q, ha));
  const hp = woman
    ? HEAD.map((q) => H([q[0] * 0.93, q[1] * 0.95]))
    : HEAD.map((q) => H(q));
  smoothPath(hp, true, 0.42, head);
  if (woman) {
    // shoulder-length waves under the brim
    smoothPath(
      [
        H([-5, -35]),
        H([-15, -31]),
        H([-19.5, -21]),
        H([-18, -11]),
        H([-12.5, -7]),
        H([-9.5, -14]),
        H([-7.5, -25]),
      ],
      true,
      0.5,
      head
    );
  }
  const hatKind = look.hat ?? (woman ? 'brim' : 'fedora');
  if (hatKind === 'fedora') {
    smoothPath(
      [
        H([-23.5, -33]),
        H([-14, -33.4]),
        H([2, -33.8]),
        H([16, -32.8]),
        H([25, -29.8]),
        H([29, -26.4]),
        H([25, -26]),
        H([14, -29]),
        H([0, -30.6]),
        H([-14, -30.2]),
        H([-22, -30.8]),
      ],
      true,
      0.3,
      hat
    );
    smoothPath(
      [
        H([-13.5, -32]),
        H([-13.2, -42]),
        H([-10.8, -48.4]),
        H([-4.5, -50.4]),
        H([0, -48.4]),
        H([5, -50.6]),
        H([11, -49.4]),
        H([14.6, -43]),
        H([15.6, -32]),
      ],
      true,
      0.15,
      hat
    );
  } else if (hatKind === 'brim') {
    smoothPath(
      [H([-30, -24]), H([-16, -33]), H([6, -36.5]), H([26, -36]), H([38, -32]), H([34, -30.4]), H([12, -32]), H([-10, -29]), H([-28, -21.5])],
      true,
      0.35,
      hat
    );
    smoothPath([H([-12, -32]), H([-11, -42]), H([-2, -47]), H([9, -46]), H([14, -40]), H([14, -33])], true, 0.4, hat);
  }
  return { far, body, head, hat, hands, bones: b };
};

/** Map a local rig point to world coordinates */
export const toWorld = (q: Pt, x: number, y: number, s: number, dir: number): Pt => [x + q[0] * s * dir, y + q[1] * s];
/** Map a world point to local rig units */
export const toLocal = (q: Pt, x: number, y: number, s: number, dir: number): Pt => [(q[0] - x) / (s * dir), (q[1] - y) / s];

/**
 * Draw a figure with its hip at (x, y), scale s, facing dir (+1 right, -1 left).
 * Returns the bones (local units) so callers can attach props.
 */
export const drawFigure = (c: Ctx, p: Pose, look: Look, x: number, y: number, s: number, dir = 1) => {
  const parts = figureParts(p, look);
  const b = parts.bones;
  const all = [parts.far, parts.body, parts.head, parts.hat, parts.hands];
  c.save();
  c.translate(x, y);
  c.scale(s * dir, s);
  const fillAll = (col: string, dx: number, dy: number) => {
    c.save();
    c.translate(dx / (s * dir), dy / s);
    c.fillStyle = col;
    for (const q of all) c.fill(q);
    c.restore();
  };
  if (look.rim2) fillAll(look.rim2, look.rim2Dx ?? 0, look.rim2Dy ?? 0);
  if (look.rim) fillAll(look.rim, look.rimDx ?? 0, look.rimDy ?? 0);
  c.fillStyle = look.far ?? look.body;
  c.fill(parts.far);
  c.fillStyle = look.body;
  c.fill(parts.body);
  c.fill(parts.head);
  c.fill(parts.hands);
  c.fill(parts.hat);
  if (look.top) {
    // light from above catching the hat crown and shoulders
    c.save();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(0, b.neckTop[1] - 60, 0, b.neck[1] + 60);
    g.addColorStop(0, look.top);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fill(parts.hat);
    c.fill(parts.body);
    c.restore();
  }
  if (look.detail) {
    c.save();
    c.strokeStyle = look.detail;
    c.lineWidth = 1.3;
    c.lineCap = 'round';
    const L = (xx: number, yy: number): Pt => rotP([xx, yy], p.lean);
    const d = new Path2D();
    const woman = look.kind === 'woman';
    if (!p.seated) {
      // belt
      const b0 = L(-17, -44);
      const b1 = L(woman ? 13 : 19, -40);
      d.moveTo(b0[0], b0[1]);
      d.lineTo(b1[0], b1[1]);
      const b2 = L(-17, -38);
      const b3 = L(woman ? 13 : 19, -34);
      d.moveTo(b2[0], b2[1]);
      d.lineTo(b3[0], b3[1]);
      // lapel and front edge
      const l0 = L(10, -128);
      const l1 = L(17, -92);
      const l2 = L(11, -60);
      d.moveTo(l0[0], l0[1]);
      d.quadraticCurveTo(l1[0], l1[1], l2[0], l2[1]);
      const f0 = L(16, -38);
      const kneeFront = Math.max(b.knN[0], b.knF[0]);
      d.moveTo(f0[0], f0[1]);
      d.lineTo(kneeFront + 8, (b.knN[1] + b.knF[1]) / 2 + 8);
      // skirt folds
      for (const k of [0.3, 0.62]) {
        const top = L(lerp(-15, 16, k), -30);
        d.moveTo(top[0], top[1]);
        d.lineTo(lerp(Math.min(b.knN[0], b.knF[0]) - 12, kneeFront + 10, k) + (p.flare ?? 0) * -6, (b.knN[1] + b.knF[1]) / 2 + 6);
      }
    }
    // elbow crease
    d.moveTo(b.elN[0] - 4, b.elN[1] - 3);
    d.quadraticCurveTo(b.elN[0], b.elN[1] + 2, b.elN[0] + 5, b.elN[1] - 1);
    c.stroke(d);
    c.restore();
  }
  if (look.light && look.light.a > 0.01) {
    const lt = look.light;
    for (const [part, k] of [
      [parts.head, 1],
      [parts.hands, 1],
      [parts.hat, 0.55],
      [parts.body, 0.35],
    ] as [Path2D, number][]) {
      c.save();
      c.clip(part);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = radGrad(c, lt.x, lt.y, 0, lt.r, [
        [0, rgba(lt.col, lt.a * k)],
        [0.3, rgba(lt.col, lt.a * k * 0.45)],
        [1, rgba(lt.col, 0)],
      ]);
      c.fillRect(lt.x - lt.r, lt.y - lt.r, lt.r * 2, lt.r * 2);
      c.restore();
    }
    // the brim keeps the eyes in shadow
    if ((look.hat ?? 'fedora') !== 'none') {
      c.save();
      c.clip(parts.head);
      const e = b.eye;
      c.fillStyle = radGrad(c, e[0] - 2, e[1] - 3, 0, 9, [
        [0, 'rgba(0,0,0,0.85)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      c.fillRect(e[0] - 12, e[1] - 12, 24, 24);
      c.restore();
    }
  }
  if (look.smoke !== undefined && look.smoke >= 0) {
    const m = b.mouth;
    const ang = b.headAng + 0.18;
    const tip: Pt = [m[0] + Math.cos(ang) * 11, m[1] + Math.sin(ang) * 11];
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = NOIR.light;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(m[0] - 0.5, m[1]);
    c.lineTo(tip[0], tip[1]);
    c.stroke();
    const e = clamp(look.smoke);
    c.fillStyle = mixHex(NOIR.mid, NOIR.ember, 0.4 + e * 0.6);
    c.beginPath();
    c.arc(tip[0], tip[1], 1.6, 0, TAU);
    c.fill();
    c.restore();
    if (e > 0.02) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = radGrad(c, tip[0], tip[1], 0, 6 + e * 10, [
      [0, rgba(NOIR.ember, 0.5 + e * 0.5)],
      [0.3, rgba(NOIR.ember, 0.25 * (0.4 + e))],
      [1, rgba(NOIR.ember, 0)],
    ]);
    c.fillRect(tip[0] - 20, tip[1] - 20, 40, 40);
    c.restore();
    }
  }
  c.restore();
  return b;
};

/* ---------- poses ---------- */


/** Neutral stance; hands hang (or sit in pockets) */
export const standPose = (o: { lean?: number; head?: number; pockets?: boolean; spread?: number; breathe?: number } = {}): Pose => {
  const sp = o.spread ?? 10;
  const br = o.breathe ?? 0;
  const pk = o.pockets;
  return {
    lean: o.lean ?? 0.02,
    head: o.head ?? 0.04,
    ankleN: [sp * 0.6, 160],
    ankleF: [-sp * 0.5, 160.5],
    wristN: pk ? [12, -30 + br] : [4, -2 + br],
    wristF: pk ? [6, -32 + br] : [-8, -3 + br],
    handN: pk ? 'pocket' : 'relaxed',
    handF: pk ? 'pocket' : 'relaxed',
    elbowN: 1,
    elbowF: 1,
  };
};

/**
 * Walk cycle at phase u (cycles). Returns the pose plus the hip bob (local units) to add to the
 * hip height. A full cycle covers WALK_CYCLE local units of ground with planted feet.
 */
export const WALK_CYCLE = 190;
export const walkPose = (u: number, o: { lean?: number; arms?: number; head?: number } = {}): { pose: Pose; bob: number } => {
  const S = 56;
  const stance = 0.6;
  const foot = (q: number): [Pt, number] => {
    const k = ((q % 1) + 1) % 1;
    if (k < stance) {
      const x = lerp(S, -S, k / stance);
      return [[x, 159], x < -20 ? ((-x - 20) / 36) * 0.35 : 0];
    }
    const s = (k - stance) / (1 - stance);
    const e = s * s * (3 - 2 * s);
    return [[lerp(-S, S, e), 159 - Math.sin(Math.PI * s) * 20], lerp(0.45, -0.15, s)];
  };
  const [aN, fN] = foot(u);
  const [aF, fF] = foot(u + 0.5);
  const sw = Math.sin(u * TAU) * (o.arms ?? 1);
  const bob = -Math.abs(Math.cos(u * TAU)) * 4 + 2;
  return {
    pose: {
      lean: o.lean ?? 0.07,
      head: o.head ?? 0.05,
      ankleN: aN,
      ankleF: aF,
      footN: fN,
      footF: fF,
      wristN: [-sw * 26 + 4, -4 + Math.abs(sw) * -4],
      wristF: [sw * 26 - 6, -5 + Math.abs(sw) * -4],
      elbowN: 1,
      elbowF: 1,
      handN: 'relaxed',
      handF: 'relaxed',
      flare: Math.sin(u * TAU * 2) * 0.25,
    },
    bob,
  };
};

