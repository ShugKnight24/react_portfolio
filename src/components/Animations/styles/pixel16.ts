/**
 * 16-bit series: shared look for the SNES-era pixel art cut-scenes (direct mode).
 *
 * Every frame is painted at 400 x 225 on a low-resolution buffer and blown up with nearest
 * neighbour, so each pixel lands as a crisp 4 x 4 block. Gradients are ordered (Bayer) dithers
 * between palette entries, sprites are baked once in setup (painted with paths, then snapped to
 * their palette and given a 1 px outline) and dynamic shapes go through `crisp`, which kills the
 * anti-aliasing so nothing ever looks smooth. On top: a bitmap font, JRPG window boxes, a Mode 7
 * floor renderer with palette-cycled water, iris wipes, mosaic and HDMA-style scanline waves.
 * Everything is deterministic and side-effect free per frame.
 */
import type { Ctx, Riso } from '../riso/engine';
import { TAU, clamp, lerp } from '../riso/kit';

export const LW = 400;
export const LH = 225;

/* ---------- canvases and colour ---------- */

export const mk = (w: number, h: number, read = false) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
};

export const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const h2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

/** Blend two #rrggbb colours */
export const mix = (a: string, b: string, k: number) => {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return `#${h2(lerp(A[0], B[0], k))}${h2(lerp(A[1], B[1], k))}${h2(lerp(A[2], B[2], k))}`;
};

/** Blend two palettes entry by entry, quantised so pattern caches stay small */
export const mixPal = (a: readonly string[], b: readonly string[], k: number, steps = 12) => {
  const q = Math.round(clamp(k) * steps) / steps;
  return a.map((c, i) => mix(c, b[i] ?? c, q));
};

/** Little-endian ABGR word for ImageData writes */
export const u32Of = (hex: string, a = 255) => {
  const [r, g, b] = rgbOf(hex);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

/** Palette cycling: the colour for slot i of a ramp that rotates `speed` steps per second */
export const cyc = (ramp: readonly string[], i: number, t: number, speed: number) => {
  const n = ramp.length;
  const k = Math.floor(i + t * speed);
  return ramp[((k % n) + n) % n];
};

/* ---------- the low-res frame ---------- */

export interface Px {
  canvas: HTMLCanvasElement;
  c: Ctx;
  img: ImageData;
  u32: Uint32Array;
  tmp: { canvas: HTMLCanvasElement; ctx: Ctx };
  small: { canvas: HTMLCanvasElement; ctx: Ctx };
}

export const makePx = (): Px => {
  const { canvas, ctx } = mk(LW, LH, true);
  const img = ctx.createImageData(LW, LH);
  return {
    canvas,
    c: ctx,
    img,
    u32: new Uint32Array(img.data.buffer),
    tmp: mk(LW, LH, true),
    small: mk(LW, LH),
  };
};

/** Reset the low-res frame for a new picture */
export const begin = (px: Px, col = '#000000') => {
  const c = px.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = false;
  c.fillStyle = col;
  c.fillRect(0, 0, LW, LH);
};

export interface PresentOpts {
  /** Pixel zoom of the finished frame (Mode 7 style scaling), around (zx, zy) in low-res px */
  zoom?: number;
  zx?: number;
  zy?: number;
  /** Mosaic block size in low-res px (1 = off) */
  mosaic?: number;
  /** HDMA wave: horizontal offset in low-res px for screen row y */
  wave?: (y: number) => number;
}

/** Blow the low-res frame up onto the film's 1600 x 900 frame */
export const present = (r: Riso, px: Px, o: PresentOpts = {}) => {
  const c = r.layers[0];
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  c.imageSmoothingEnabled = false;
  let src: HTMLCanvasElement = px.canvas;
  let sw = LW;
  let sh = LH;
  const m = Math.max(1, Math.round(o.mosaic ?? 1));
  if (m > 1) {
    sw = Math.ceil(LW / m);
    sh = Math.ceil(LH / m);
    const s = px.small.ctx;
    s.imageSmoothingEnabled = false;
    s.clearRect(0, 0, LW, LH);
    s.drawImage(px.canvas, 0, 0, sw * m, sh * m, 0, 0, sw, sh);
    src = px.small.canvas;
  }
  const z = Math.max(1, o.zoom ?? 1);
  const vw = sw / z;
  const vh = sh / z;
  const zx = ((o.zx ?? LW / 2) / LW) * sw;
  const zy = ((o.zy ?? LH / 2) / LH) * sh;
  const sx = clamp(zx - vw / 2, 0, sw - vw);
  const sy = clamp(zy - vh / 2, 0, sh - vh);
  const DW = 1600;
  const DH = 900;
  if (!o.wave) {
    c.drawImage(src, sx, sy, vw, vh, 0, 0, DW, DH);
  } else {
    // One slice per source row, shifted like an HDMA scroll table
    const rows = Math.ceil(vh);
    const rh = DH / vh;
    for (let j = 0; j < rows; j++) {
      const yy = sy + j;
      const off = Math.round(o.wave(((yy + 0.5) / sh) * LH)) * (DW / LW);
      const dy = j * rh;
      c.drawImage(src, sx, yy, vw, 1, off, dy, DW, rh + 0.6);
      if (off > 0) c.drawImage(src, sx, yy, vw, 1, off - DW, dy, DW, rh + 0.6);
      else if (off < 0) c.drawImage(src, sx, yy, vw, 1, off + DW, dy, DW, rh + 0.6);
    }
  }
  c.restore();
};

/* ---------- dithering ---------- */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/* Patterns are cached per context: a pattern made by one canvas and used on another can fall off the fast path */
const patCache = new WeakMap<Ctx, Map<string, CanvasPattern | string>>();

/** Fill style: ordered dither between colours a and b at mix k (17 levels) */
export const dither = (c: Ctx, a: string, b: string, k: number): CanvasPattern | string => {
  const lv = Math.round(clamp(k) * 16);
  if (lv <= 0) return a;
  if (lv >= 16) return b;
  const key = `${a}|${b}|${lv}`;
  let cache = patCache.get(c);
  if (!cache) {
    cache = new Map();
    patCache.set(c, cache);
  }
  const hit = cache.get(key);
  if (hit) return hit;
  // software-backed like the frame buffers, or every pattern fill pays a GPU readback
  const { canvas, ctx } = mk(4, 4, true);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillStyle = b;
  for (let i = 0; i < 16; i++) if (BAYER[i] < lv) ctx.fillRect(i % 4, Math.floor(i / 4), 1, 1);
  const p = c.createPattern(canvas, 'repeat') ?? b;
  cache.set(key, p);
  return p;
};

/** Vertical dithered gradient through the stops (top to bottom), drawn in bands */
export const vGrad = (c: Ctx, x: number, y: number, w: number, h: number, stops: readonly string[], band = 1) => {
  const n = stops.length - 1;
  for (let j = 0; j < h; j += band) {
    const p = (j / Math.max(1, h - 1)) * n;
    const i = Math.min(n - 1, Math.floor(p));
    c.fillStyle = dither(c, stops[i], stops[i + 1], p - i);
    c.fillRect(x, y + j, w, Math.min(band, h - j));
  }
};

/** Radial dithered glow: rings from the centre out (ramp[0] in the middle) */
export const radialGlow = (c: Ctx, cx: number, cy: number, R: number, ramp: readonly string[], ringW = 2) => {
  const n = ramp.length - 1;
  for (let rr = R; rr > 0; rr -= ringW) {
    const p = (rr / R) * n;
    const i = Math.min(n - 1, Math.floor(p));
    c.fillStyle = dither(c, ramp[i], ramp[i + 1], p - i);
    disc(c, cx, cy, rr);
  }
};

/* ---------- crisp primitives ---------- */

/** Clear the low-res frame to transparent (for overlay layers such as fixed UI) */
export const clearPx = (px: Px) => {
  const c = px.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, LW, LH);
};

/** Additive light with a dithered falloff (SNES colour math): sparse outside, solid at the core */
export const glow = (c: Ctx, x: number, y: number, R: number, col: string, core = 0.4) => {
  if (R < 1) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = dither(c, '#000000', col, 0.25);
  c.fill(discPath(x, y, R));
  c.fillStyle = dither(c, '#000000', col, 0.5);
  c.fill(discPath(x, y, R * 0.7));
  c.fillStyle = col;
  c.fill(discPath(x, y, R * core));
  c.restore();
};

/** Pixel-exact filled circle (rows of rects, no anti-aliasing) */
export const disc = (c: Ctx, cx: number, cy: number, R: number) => {
  if (R <= 0) return;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const rr = Math.ceil(R);
  for (let dy = -rr; dy <= rr; dy++) {
    const q = R * R - (dy + 0.5 * Math.sign(dy)) ** 2;
    if (q < 0) continue;
    const hw = Math.round(Math.sqrt(q));
    c.fillRect(x0 - hw, y0 + dy, hw * 2 + 1, 1);
  }
};

/** The same pixel circle as one Path2D of row rects (one fill call instead of one per row) */
export const discPath = (cx: number, cy: number, R: number, p = new Path2D()) => {
  if (R <= 0) return p;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const rr = Math.ceil(R);
  for (let dy = -rr; dy <= rr; dy++) {
    const q = R * R - (dy + 0.5 * Math.sign(dy)) ** 2;
    if (q < 0) continue;
    const hw = Math.round(Math.sqrt(q));
    p.rect(x0 - hw, y0 + dy, hw * 2 + 1, 1);
  }
  return p;
};

/** Black (or col) everywhere outside a pixel circle: the iris wipe */
export const iris = (c: Ctx, cx: number, cy: number, R: number, col = '#000000') => {
  c.fillStyle = col;
  if (R <= 0.5) {
    c.fillRect(0, 0, LW, LH);
    return;
  }
  const x0 = Math.round(cx);
  for (let y = 0; y < LH; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) >= R) {
      c.fillRect(0, y, LW, 1);
      continue;
    }
    const hw = Math.round(Math.sqrt(R * R - dy * dy));
    if (x0 - hw > 0) c.fillRect(0, y, x0 - hw, 1);
    if (x0 + hw < LW) c.fillRect(x0 + hw, y, LW - x0 - hw, 1);
  }
};

/** Paint vector shapes onto the frame with anti-aliasing snapped away (alpha threshold) */
export const crisp = (px: Px, draw: (c: Ctx) => void, bx = 0, by = 0, bw = LW, bh = LH, cut = 120) => {
  bx = Math.max(0, Math.floor(bx));
  by = Math.max(0, Math.floor(by));
  bw = Math.min(LW - bx, Math.ceil(bw));
  bh = Math.min(LH - by, Math.ceil(bh));
  if (bw <= 0 || bh <= 0) return;
  const t = px.tmp.ctx;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.clearRect(0, 0, bw, bh);
  t.save();
  t.translate(-bx, -by);
  draw(t);
  t.restore();
  const img = t.getImageData(0, 0, bw, bh);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
  t.putImageData(img, 0, 0);
  px.c.drawImage(px.tmp.canvas, 0, 0, bw, bh, bx, by, bw, bh);
};

/** n-point star outline */
export const starPath = (cx: number, cy: number, R: number, r: number, n = 4, rot = 0, p = new Path2D()) => {
  for (let i = 0; i < n * 2; i++) {
    const a = rot - Math.PI / 2 + (i / (n * 2)) * TAU;
    const rr = i % 2 ? r : R;
    if (i === 0) p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  p.closePath();
  return p;
};

/** Twinkling pixel star field (seeded points, crisp) */
export const starfield = (c: Ctx, pts: readonly [number, number, number][], t: number, cols: readonly string[], dx = 0, dy = 0, h = LH) => {
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0, ph] = pts[i];
    const x = Math.round((((x0 + dx) % LW) + LW) % LW);
    const y = Math.round(y0 + dy);
    if (y < 0 || y >= h) continue;
    const tw = Math.sin(t * (2 + (i % 5)) + ph * 6.28);
    const b = tw > 0.6 ? 2 : tw > -0.3 ? 1 : 0;
    c.fillStyle = cols[Math.min(cols.length - 1, b)];
    c.fillRect(x, y, 1, 1);
    if (b === 2 && i % 4 === 0) {
      c.fillRect(x - 1, y, 3, 1);
      c.fillRect(x, y - 1, 1, 3);
    }
  }
};

/* ---------- sprites ---------- */

export interface BakeOpts {
  /** Snap every opaque pixel to the nearest of these colours */
  pal?: readonly string[];
  /** 1 px outline colour (null for none) */
  outline?: string | null;
  /** Alpha threshold 0..255 */
  cut?: number;
  /** Also outline diagonally (thicker, rounder silhouette) */
  diag?: boolean;
}

/**
 * Paint a sprite with paths, then turn it into real pixel art: it is painted 4x oversized and
 * every output pixel takes the majority colour of its 16 sub-pixels (so no blended edge
 * colours), then snaps to the palette and gets a 1 px outline.
 */
export const bake = (w: number, h: number, draw: (c: Ctx) => void, o: BakeOpts = {}) => {
  const SS = 4;
  const big = mk(w * SS, h * SS, true);
  big.ctx.imageSmoothingEnabled = true;
  big.ctx.scale(SS, SS);
  draw(big.ctx);
  const src = big.ctx.getImageData(0, 0, w * SS, h * SS).data;
  const { canvas, ctx } = mk(w, h, true);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cut = Math.round(((o.cut ?? 110) / 255) * SS * SS);
  const pal = (o.pal ?? []).map(rgbOf);
  const solid = new Uint8Array(w * h);
  const cols = new Int32Array(SS * SS);
  const cnt = new Int32Array(SS * SS);
  const BW = w * SS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      let m = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const k = ((y * SS + sy) * BW + x * SS + sx) * 4;
          if (src[k + 3] < 128) continue;
          n++;
          // quantise a little so near-identical edge colours vote together
          const col = ((src[k] >> 2) << 12) | ((src[k + 1] >> 2) << 6) | (src[k + 2] >> 2);
          let j = 0;
          while (j < m && cols[j] !== col) j++;
          if (j === m) {
            cols[m] = col;
            cnt[m] = 0;
            m++;
          }
          // fully opaque sub-pixels outvote anti-aliased ones
          cnt[j] += src[k + 3] === 255 ? 4 : 1;
        }
      }
      const i = y * w + x;
      const k = i * 4;
      if (n < Math.max(1, cut)) continue;
      let best = 0;
      for (let j = 1; j < m; j++) if (cnt[j] > cnt[best]) best = j;
      const col = cols[best];
      d[k] = ((col >> 12) & 63) << 2;
      d[k + 1] = ((col >> 6) & 63) << 2;
      d[k + 2] = (col & 63) << 2;
      d[k + 3] = 255;
      solid[i] = 1;
      if (pal.length) {
        let bi = 0;
        let bd = Infinity;
        for (let j = 0; j < pal.length; j++) {
          const q = pal[j];
          const dd = (q[0] - d[k]) ** 2 * 0.8 + (q[1] - d[k + 1]) ** 2 + (q[2] - d[k + 2]) ** 2 * 0.7;
          if (dd < bd) {
            bd = dd;
            bi = j;
          }
        }
        d[k] = pal[bi][0];
        d[k + 1] = pal[bi][1];
        d[k + 2] = pal[bi][2];
      }
    }
  }
  if (o.outline) {
    const [or, og, ob] = rgbOf(o.outline);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        const n =
          (x > 0 && solid[i - 1]) ||
          (x < w - 1 && solid[i + 1]) ||
          (y > 0 && solid[i - w]) ||
          (y < h - 1 && solid[i + w]) ||
          (o.diag &&
            ((x > 0 && y > 0 && solid[i - w - 1]) ||
              (x < w - 1 && y > 0 && solid[i - w + 1]) ||
              (x > 0 && y < h - 1 && solid[i + w - 1]) ||
              (x < w - 1 && y < h - 1 && solid[i + w + 1])));
        if (!n) continue;
        const k = i * 4;
        d[k] = or;
        d[k + 1] = og;
        d[k + 2] = ob;
        d[k + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Sprite from rows of characters; '.' and ' ' are transparent */
export const fromRows = (rows: readonly string[], map: Record<string, string>) => {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const { canvas, ctx } = mk(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = map[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
};

export const flipX = (src: HTMLCanvasElement) => {
  const { canvas, ctx } = mk(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
};

/** Solid-colour silhouette of a sprite (hit flashes, shadows, impact frames) */
export const tint = (src: HTMLCanvasElement, col: string) => {
  const { canvas, ctx } = mk(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, src.width, src.height);
  return canvas;
};

/** Draw a sprite with its anchor at (x, y), optionally pixel-scaled and mirrored */
export const spr = (c: Ctx, s: HTMLCanvasElement, x: number, y: number, ax: number, ay: number, scale = 1, flip = false) => {
  const w = s.width * scale;
  const h = s.height * scale;
  if (!flip) {
    c.drawImage(s, Math.round(x - ax * scale), Math.round(y - ay * scale), Math.round(w), Math.round(h));
  } else {
    c.save();
    c.translate(Math.round(x), 0);
    c.scale(-1, 1);
    c.drawImage(s, Math.round(-ax * scale), Math.round(y - ay * scale), Math.round(w), Math.round(h));
    c.restore();
  }
};

/* ---------- figures ---------- */

export type P2 = [number, number];

export interface Look {
  skin: string;
  skinS: string;
  hair: string;
  hairS: string;
  top: string;
  topS: string;
  bot: string;
  botS: string;
  shoe: string;
  shoeS: string;
  eye: string;
  headR: number;
  torso: number;
  thigh: number;
  shin: number;
  uarm: number;
  farm: number;
  legW: number;
  armW: number;
  chestW: number;
  hipW: number;
  /** Sleeve colours for the arms (defaults to top) */
  sleeve?: string;
  sleeveS?: string;
  /** Hands (defaults to skin: gloves, gauntlets) */
  hand?: string;
  /** Hair over the head; back = drawn before the head */
  hairFn?: (c: Ctx, j: Joints, look: Look, back: boolean) => void;
  /** Extra layers: behind everything, over the torso, in the front hand */
  behind?: (c: Ctx, j: Joints, look: Look) => void;
  over?: (c: Ctx, j: Joints, look: Look) => void;
  front?: (c: Ctx, j: Joints, look: Look) => void;
  /** A skirt / robe from the hip down (length in px) */
  robe?: number;
}

export interface Pose {
  /** Torso lean from vertical, + forward */
  lean: number;
  /** Hip height offset (negative = up) */
  bob: number;
  /** [thigh angle from down, knee bend] */
  legB: [number, number];
  legF: [number, number];
  /** [upper arm angle from down, elbow bend] */
  armB: [number, number];
  armF: [number, number];
  head?: number;
}

export interface Joints {
  hip: P2;
  shoulder: P2;
  neck: P2;
  head: P2;
  kneeB: P2;
  footB: P2;
  kneeF: P2;
  footF: P2;
  elbowB: P2;
  handB: P2;
  elbowF: P2;
  handF: P2;
  lean: number;
  shinB: number;
  shinF: number;
  farmF: number;
  farmB: number;
}

const dirDown = (a: number, l: number, p: P2): P2 => [p[0] + Math.sin(a) * l, p[1] + Math.cos(a) * l];

export const joints = (look: Look, pose: Pose, hx: number, hy: number): Joints => {
  const hip: P2 = [hx, hy + pose.bob];
  const shoulder: P2 = [hip[0] + Math.sin(pose.lean) * look.torso, hip[1] - Math.cos(pose.lean) * look.torso];
  const hl = pose.lean + (pose.head ?? 0);
  const neck: P2 = [shoulder[0] + Math.sin(pose.lean) * 1.5, shoulder[1] - Math.cos(pose.lean) * 1.5];
  const head: P2 = [neck[0] + Math.sin(hl) * look.headR * 0.9 + 0.6, neck[1] - Math.cos(hl) * look.headR * 0.95];
  const kneeB = dirDown(pose.legB[0], look.thigh, hip);
  const shinB = pose.legB[0] - pose.legB[1];
  const footB = dirDown(shinB, look.shin, kneeB);
  const kneeF = dirDown(pose.legF[0], look.thigh, hip);
  const shinF = pose.legF[0] - pose.legF[1];
  const footF = dirDown(shinF, look.shin, kneeF);
  const elbowB = dirDown(pose.armB[0], look.uarm, shoulder);
  const farmB = pose.armB[0] + pose.armB[1];
  const handB = dirDown(farmB, look.farm, elbowB);
  const elbowF = dirDown(pose.armF[0], look.uarm, shoulder);
  const farmF = pose.armF[0] + pose.armF[1];
  const handF = dirDown(farmF, look.farm, elbowF);
  return { hip, shoulder, neck, head, kneeB, footB, kneeF, footF, elbowB, handB, elbowF, handF, lean: pose.lean, shinB, shinF, farmF, farmB };
};

/** Tapered capsule from (x0, y0, r0) to (x1, y1, r1), added to path p */
export const capsule = (p: Path2D, a: P2, r0: number, b: P2, r1: number) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / L;
  const ny = dx / L;
  // wind the quad the same way as the end arcs, or nonzero filling punches holes at the joints
  const q: P2[] = [
    [a[0] + nx * r0, a[1] + ny * r0],
    [b[0] + nx * r1, b[1] + ny * r1],
    [b[0] - nx * r1, b[1] - ny * r1],
    [a[0] - nx * r0, a[1] - ny * r0],
  ];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const u = q[i];
    const v = q[(i + 1) % 4];
    area += u[0] * v[1] - v[0] * u[1];
  }
  if (area < 0) q.reverse();
  p.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) p.lineTo(q[i][0], q[i][1]);
  p.closePath();
  p.moveTo(a[0] + r0, a[1]);
  p.arc(a[0], a[1], r0, 0, TAU);
  p.moveTo(b[0] + r1, b[1]);
  p.arc(b[0], b[1], r1, 0, TAU);
  return p;
};

/** Fill a path with a shadow crescent on the side away from (lx, ly) */
export const shade = (c: Ctx, p: Path2D, base: string, dark: string, lx = 1.2, ly = -0.6) => {
  c.fillStyle = dark;
  c.fill(p);
  c.save();
  c.clip(p);
  c.translate(lx, ly);
  c.fillStyle = base;
  c.fill(p);
  c.restore();
};

const shoe = (c: Ctx, foot: P2, shinA: number, look: Look, base: string, dark: string) => {
  const p = new Path2D();
  const fx = Math.cos(shinA);
  const fy = -Math.sin(shinA);
  const L = look.legW * 1.15;
  capsule(p, [foot[0] - fx * 0.4, foot[1] - fy * 0.4], look.legW * 0.55, [foot[0] + fx * L, foot[1] + fy * L + 0.3], look.legW * 0.42);
  shade(c, p, base, dark, 0.2, -0.9);
};

/** Paint a posed figure facing right with its hip at (hx, hy) */
export const figure = (c: Ctx, look: Look, pose: Pose, hx: number, hy: number) => {
  const j = joints(look, pose, hx, hy);
  const lw = look.legW / 2;
  const aw = look.armW / 2;
  const sl = look.sleeve ?? look.top;
  const slS = look.sleeveS ?? look.topS;
  look.behind?.(c, j, look);
  look.hairFn?.(c, j, look, true);
  // back arm (in shadow)
  {
    const p = new Path2D();
    capsule(p, j.shoulder, aw * 1.05, j.elbowB, aw * 0.9);
    capsule(p, j.elbowB, aw * 0.9, j.handB, aw * 0.75);
    c.fillStyle = slS;
    c.fill(p);
    c.fillStyle = look.hand ? mix(look.hand, '#000000', 0.25) : look.skinS;
    const h = new Path2D();
    h.arc(j.handB[0], j.handB[1], aw * 1.05, 0, TAU);
    c.fill(h);
  }
  // back leg
  {
    const p = new Path2D();
    capsule(p, j.hip, lw * 1.15, j.kneeB, lw * 0.95);
    capsule(p, j.kneeB, lw * 0.95, j.footB, lw * 0.75);
    c.fillStyle = look.botS;
    c.fill(p);
    shoe(c, j.footB, j.shinB, look, look.shoeS, mix(look.shoeS, '#000000', 0.3));
  }
  // front leg
  {
    const p = new Path2D();
    capsule(p, j.hip, lw * 1.2, j.kneeF, lw);
    capsule(p, j.kneeF, lw, j.footF, lw * 0.78);
    shade(c, p, look.bot, look.botS, 1, -0.5);
    shoe(c, j.footF, j.shinF, look, look.shoe, look.shoeS);
  }
  // robe / skirt over the legs
  if (look.robe) {
    const p = new Path2D();
    const s = Math.sin(j.lean);
    const co = Math.cos(j.lean);
    const sw = (j.kneeF[0] - j.kneeB[0]) * 0.5;
    const top = look.hipW * 0.55;
    p.moveTo(j.hip[0] - top * co, j.hip[1] - top * s - 2);
    p.lineTo(j.hip[0] + top * co, j.hip[1] + top * s - 2);
    p.lineTo(j.hip[0] + top + 2.2 + Math.max(0, sw), j.hip[1] + look.robe);
    p.quadraticCurveTo(j.hip[0], j.hip[1] + look.robe + 1.5, j.hip[0] - top - 2.2 + Math.min(0, sw), j.hip[1] + look.robe);
    p.closePath();
    shade(c, p, look.top, look.topS, 1.4, -0.4);
  }
  // torso
  {
    const p = new Path2D();
    const s = Math.sin(j.lean);
    const co = Math.cos(j.lean);
    // local frame: u = up the spine, v = forward
    const P = (v: number, u: number): P2 => [j.hip[0] + v * co + u * s, j.hip[1] + v * s - u * co];
    const T = look.torso;
    const cw = look.chestW / 2;
    const hw = look.hipW / 2;
    const a = P(-hw, 0);
    const b = P(-cw, T * 0.72);
    const d = P(-cw * 0.7, T + 0.5);
    const e = P(cw * 0.75, T + 0.5);
    const f = P(cw, T * 0.7);
    const g = P(hw, 0);
    p.moveTo(...a);
    p.quadraticCurveTo(...P(-cw * 1.05, T * 0.35), ...b);
    p.quadraticCurveTo(...P(-cw, T + 0.4), ...d);
    p.lineTo(...e);
    p.quadraticCurveTo(...P(cw * 1.1, T), ...f);
    p.quadraticCurveTo(...P(cw * 0.95, T * 0.3), ...g);
    p.quadraticCurveTo(...P(0, -1.2), ...a);
    p.closePath();
    shade(c, p, look.top, look.topS, 1.5, -0.3);
  }
  look.over?.(c, j, look);
  // neck + head
  {
    const n = new Path2D();
    capsule(n, j.neck, 1.4, [j.head[0] - 0.5, j.head[1] + look.headR * 0.5], 1.4);
    c.fillStyle = look.skinS;
    c.fill(n);
    const h = new Path2D();
    h.arc(j.head[0], j.head[1], look.headR, 0, TAU);
    // jaw toward the front
    h.moveTo(j.head[0] + look.headR * 0.95, j.head[1] + look.headR * 0.1);
    h.arc(j.head[0] + look.headR * 0.35, j.head[1] + look.headR * 0.45, look.headR * 0.62, 0, TAU);
    shade(c, h, look.skin, look.skinS, 1, -0.6);
    look.hairFn?.(c, j, look, false);
    // eye: 1 x 2 px, set on whole pixels so it survives the bake
    c.fillStyle = look.eye;
    c.fillRect(Math.round(j.head[0] + look.headR * 0.45), Math.round(j.head[1] - 0.5), 1, 2);
  }
  // front arm
  {
    const p = new Path2D();
    capsule(p, j.shoulder, aw * 1.1, j.elbowF, aw * 0.95);
    capsule(p, j.elbowF, aw * 0.95, j.handF, aw * 0.8);
    shade(c, p, sl, slS, 0.8, -0.8);
    look.front?.(c, j, look);
    const h = new Path2D();
    h.arc(j.handF[0], j.handF[1], aw * 1.1, 0, TAU);
    c.fillStyle = look.hand ?? look.skin;
    c.fill(h);
  }
  return j;
};

/** Every colour a look uses (for the bake palette) */
export const lookPal = (look: Look, extra: readonly string[] = []) => [
  look.skin,
  look.skinS,
  look.hair,
  look.hairS,
  look.top,
  look.topS,
  look.bot,
  look.botS,
  look.shoe,
  look.shoeS,
  mix(look.shoeS, '#000000', 0.3),
  look.eye,
  ...(look.sleeve ? [look.sleeve, look.sleeveS ?? look.sleeve] : []),
  ...(look.hand ? [look.hand, mix(look.hand, '#000000', 0.25)] : []),
  ...extra,
];

/* One leg through a sprint, 8 keys of [thigh, knee] from foot contact */
const RUN_KEYS: [number, number][] = [
  [0.55, 0.25],
  [0.25, 0.6],
  [-0.15, 0.4],
  [-0.55, 0.55],
  [-0.45, 1.75],
  [0.15, 2.15],
  [0.75, 1.45],
  [0.85, 0.6],
];
const RUN_BOB = [0.2, 1.2, 0.4, -1.2, -1.4, 1.2, 0.4, -1.2];

const keyAt = <T extends number[]>(keys: T[], ph: number): number[] => {
  const n = keys.length;
  const p = (((ph % 1) + 1) % 1) * n;
  const i = Math.floor(p);
  const f = p - i;
  const a = keys[i % n];
  const b = keys[(i + 1) % n];
  return a.map((v, k) => lerp(v, b[k], f));
};

/** A sprint cycle, phase 0..1 */
export const runPose = (ph: number, lean = 0.22): Pose => {
  const f = keyAt(RUN_KEYS, ph);
  const b = keyAt(RUN_KEYS, ph + 0.5);
  const bob = keyAt(RUN_BOB.map((v) => [v]), ph)[0];
  return {
    lean,
    bob,
    legF: [f[0], f[1]],
    legB: [b[0], b[1]],
    armF: [-b[0] * 0.95 + 0.05, 1.7 + 0.25 * b[0]],
    armB: [-f[0] * 0.95 + 0.05, 1.7 + 0.25 * f[0]],
  };
};

/** A gentle walk cycle, phase 0..1 */
export const walkPose = (ph: number, lean = 0.05): Pose => {
  const a = ph * TAU;
  const leg = (q: number): [number, number] => [0.45 * Math.sin(q), 0.1 + (Math.cos(q) > 0 ? 0.55 * Math.cos(q) : 0)];
  return {
    lean,
    bob: -Math.abs(Math.sin(a)) * 0.9 + 0.4,
    legF: leg(a),
    legB: leg(a + Math.PI),
    armF: [-0.4 * Math.sin(a), 0.35],
    armB: [0.4 * Math.sin(a), 0.35],
  };
};

/* ---------- bitmap font (5 x 7) ---------- */

const G: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '.###.|#....|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '.': '.....|.....|.....|.....|.....|.....|..#..',
  ':': '.....|..#..|.....|.....|.....|..#..|.....',
  '-': '.....|.....|.....|.###.|.....|.....|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  ',': '.....|.....|.....|.....|.....|..#..|.#...',
  '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  '*': '..#..|..#..|#####|.###.|.#.#.|#...#|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const GLYPHS = new Map<string, boolean[][]>();
for (const [k, v] of Object.entries(G)) GLYPHS.set(k, v.split('|').map((r) => Array.from(r).map((ch) => ch === '#')));

export interface TextStyle {
  /** One colour, or one per glyph row (7) for gradient lettering */
  fill: string | readonly string[];
  outline?: string;
  shadow?: string;
  bold?: boolean;
  spacing?: number;
}

const textCache = new Map<string, HTMLCanvasElement>();

/** Bake a line of bitmap text (cached by string + style) */
export const textSprite = (str: string, st: TextStyle) => {
  const key = `${str}|${JSON.stringify(st)}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const gw = st.bold ? 6 : 5;
  const adv = gw + (st.spacing ?? 1);
  const chars = Array.from(str.toUpperCase());
  const pad = st.outline ? 1 : 0;
  const sh = st.shadow ? 1 : 0;
  const w = chars.length * adv - (st.spacing ?? 1) + pad * 2 + sh;
  const h = 7 + pad * 2 + sh;
  const { canvas, ctx } = mk(w, h);
  const on = (dx: number, dy: number, fill: (row: number) => string) => {
    chars.forEach((ch, i) => {
      const g = GLYPHS.get(ch) ?? GLYPHS.get(' ');
      if (!g) return;
      for (let y = 0; y < 7; y++) {
        ctx.fillStyle = fill(y);
        for (let x = 0; x < 5; x++) {
          if (!g[y][x]) continue;
          ctx.fillRect(pad + i * adv + x + dx, pad + y + dy, st.bold ? 2 : 1, 1);
        }
      }
    });
  };
  if (st.shadow) {
    const s = st.shadow;
    on(1, 1, () => s);
    if (st.outline) {
      on(2, 1, () => s);
      on(1, 2, () => s);
    }
  }
  if (st.outline) {
    const o = st.outline;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      on(dx, dy, () => o);
  }
  on(0, 0, (y) => (typeof st.fill === 'string' ? st.fill : st.fill[Math.min(st.fill.length - 1, y)]));
  textCache.set(key, canvas);
  return canvas;
};

/** Draw bitmap text; align 0 = left, 0.5 = centre, 1 = right */
export const text = (c: Ctx, str: string, x: number, y: number, st: TextStyle, scale = 1, align = 0) => {
  const s = textSprite(str, st);
  c.drawImage(s, Math.round(x - s.width * scale * align), Math.round(y), s.width * scale, s.height * scale);
  return s.width * scale;
};

/* ---------- JRPG window box ---------- */

export interface WinTheme {
  top: string;
  bottom: string;
  edge: string;
  edgeS: string;
  dark: string;
}

export const WIN_BLUE: WinTheme = { top: '#3a4fc0', bottom: '#121a5a', edge: '#f2f2ff', edgeS: '#9aa0c8', dark: '#06061a' };

/** Bevelled window with a dithered vertical gradient, opened by k (0..1, grows from its centre line) */
export const windowBox = (c: Ctx, x: number, y: number, w: number, h: number, th: WinTheme = WIN_BLUE, k = 1) => {
  if (k <= 0) return;
  const hh = Math.max(4, Math.round(h * k));
  y = Math.round(y + (h - hh) / 2);
  h = hh;
  x = Math.round(x);
  w = Math.round(w);
  vGrad(c, x + 2, y + 2, w - 4, h - 4, [th.top, th.bottom], 1);
  c.fillStyle = th.dark;
  c.fillRect(x + 1, y, w - 2, 1);
  c.fillRect(x + 1, y + h - 1, w - 2, 1);
  c.fillRect(x, y + 1, 1, h - 2);
  c.fillRect(x + w - 1, y + 1, 1, h - 2);
  c.fillStyle = th.edge;
  c.fillRect(x + 2, y + 1, w - 4, 1);
  c.fillRect(x + 1, y + 2, 1, h - 4);
  c.fillStyle = th.edgeS;
  c.fillRect(x + 2, y + h - 2, w - 4, 1);
  c.fillRect(x + w - 2, y + 2, 1, h - 4);
  c.fillStyle = th.edge;
  c.fillRect(x + 2, y + 2, 1, 1);
};

/* ---------- Mode 7 ---------- */

export interface Tex {
  w: number;
  h: number;
  d: Uint32Array;
}

/** Texture from a canvas. Width and height must be powers of two (it wraps) */
export const texFrom = (cv: HTMLCanvasElement): Tex => {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  return { w: cv.width, h: cv.height, d: new Uint32Array(img.data.buffer.slice(0)) };
};

export interface Cam7 {
  /** Camera position on the texture */
  x: number;
  y: number;
  /** Heading: 0 looks toward -y */
  a: number;
  /** Height above the floor */
  h: number;
  /** Screen row of the horizon */
  hor: number;
  /** Focal length in px */
  f: number;
}

export interface Mode7Opts {
  /** Last row to fill (exclusive) */
  y1?: number;
  fog?: string;
  /** Distance where fog is full */
  fogFar?: number;
  fogNear?: number;
  /** Max fog amount 0..1 */
  fogMax?: number;
  /** Palette-cycled texels: alpha 254 texels look up cycle[red channel % length] */
  cycle?: readonly number[];
}

/** Render a perspective floor (one texture lookup per pixel) under the horizon */
export const mode7 = (px: Px, tex: Tex, cam: Cam7, o: Mode7Opts = {}) => {
  const y0 = Math.max(0, Math.floor(cam.hor) + 1);
  const y1 = Math.min(LH, o.y1 ?? LH);
  if (y1 <= y0) return;
  const out = px.u32;
  const fx = Math.sin(cam.a);
  const fy = -Math.cos(cam.a);
  const rx = Math.cos(cam.a);
  const ry = Math.sin(cam.a);
  const wm = tex.w - 1;
  const hm = tex.h - 1;
  const td = tex.d;
  const [fr, fg, fb] = rgbOf(o.fog ?? '#000000');
  const far = o.fogFar ?? 1e9;
  const near = o.fogNear ?? 0;
  const fmax = o.fogMax ?? 1;
  const cyc = o.cycle;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cam.hor;
    const z = (cam.h * cam.f) / dy;
    const step = z / cam.f;
    let u = cam.x + fx * z - rx * step * (LW / 2);
    let v = cam.y + fy * z - ry * step * (LW / 2);
    const du = rx * step;
    const dv = ry * step;
    const fk = o.fog ? Math.round(clamp((z - near) / (far - near)) * fmax * 255) : 0;
    const ik = 255 - fk;
    const row = y * LW;
    for (let x = 0; x < LW; x++) {
      let p = td[(Math.floor(v) & hm) * tex.w + (Math.floor(u) & wm)];
      if (cyc && p >>> 24 === 254) p = cyc[(p & 255) % cyc.length];
      if (fk > 0) {
        const r = ((p & 255) * ik + fr * fk) >> 8;
        const g = (((p >> 8) & 255) * ik + fg * fk) >> 8;
        const b = (((p >> 16) & 255) * ik + fb * fk) >> 8;
        p = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
      out[row + x] = p | 0xff000000;
      u += du;
      v += dv;
    }
  }
  px.c.putImageData(px.img, 0, 0, 0, y0, LW, y1 - y0);
};

/** Project a floor point to the screen: x, y (ground contact) and px per world unit */
export const project7 = (cam: Cam7, wx: number, wy: number) => {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const fx = Math.sin(cam.a);
  const fy = -Math.cos(cam.a);
  const z = dx * fx + dy * fy;
  if (z < 1) return null;
  const lat = dx * Math.cos(cam.a) + dy * Math.sin(cam.a);
  const s = cam.f / z;
  return { x: LW / 2 + lat * s, y: cam.hor + cam.h * s, s, z };
};

/** Turn every texel of colour hex into a palette-cycling texel with slot idx (see Mode7Opts.cycle) */
export const markCycle = (tex: Tex, hex: string, idx: number) => {
  const want = u32Of(hex);
  const code = ((254 << 24) | (idx & 255)) >>> 0;
  for (let i = 0; i < tex.d.length; i++) if (tex.d[i] === want) tex.d[i] = code;
};
