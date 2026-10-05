import { TAU } from './runtime';
import type { AudioBus } from './runtime';

/**
 * Shared toolkit for the scenes that came over from the arcade theater (Detroit Code City,
 * Caucasus Origins, Iron Discipline, Jack Reacher): seeded randomness, cached glow sprites,
 * offscreen layers, a fixed particle pool, camera shake, a code glyph atlas built from
 * stroked polylines (never canvas text), a jointed figure rig with shaded limbs, and a
 * couple of percussive sounds.
 */

export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radial gradient baked once into a square canvas, drawn later with drawImage */
export function glowSprite(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

/** Glow sprite centred on x, y with radius r, scaled by the current alpha; caller sets the composite mode */
export function glow(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, r: number, alpha = 1) {
  if (alpha <= 0.003 || r <= 0.5) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = Math.min(1, alpha * prev);
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

/** Offscreen canvas sized in CSS pixels at the given pixel ratio */
export function layer(prev: HTMLCanvasElement | null, w: number, h: number, dpr: number) {
  const cv = prev ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, c };
}

export function freeCanvas(...list: (HTMLCanvasElement | null | undefined)[]) {
  for (const c of list) if (c) c.width = c.height = 0;
}

/* ---------- particle pool ---------- */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: number;
  drag: number;
  grav: number;
  rot: number;
  spin: number;
}

export interface Pool {
  items: Particle[];
  next: number;
}

export function makePool(n: number): Pool {
  const items: Particle[] = [];
  for (let i = 0; i < n; i++)
    items.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, kind: 0, drag: 0, grav: 0, rot: 0, spin: 0 });
  return { items, next: 0 };
}

export function emit(
  pool: Pool,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  kind: number,
  drag = 0,
  grav = 0
) {
  const p = pool.items[pool.next];
  pool.next = (pool.next + 1) % pool.items.length;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.max = life;
  p.size = size;
  p.kind = kind;
  p.drag = drag;
  p.grav = grav;
  p.rot = Math.random() * TAU;
  p.spin = (Math.random() - 0.5) * 6;
  return p;
}

/** Spray n particles from a point in a cone around dir */
export function burst(
  pool: Pool,
  n: number,
  x: number,
  y: number,
  dir: number,
  spread: number,
  speed: number,
  life: number,
  size: number,
  kind: number,
  drag = 0,
  grav = 0
) {
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() * 2 - 1) * spread;
    const v = speed * (0.3 + Math.random() * 0.7);
    emit(pool, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.6), kind, drag, grav);
  }
}

export function stepPool(pool: Pool, dt: number) {
  for (const p of pool.items) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.drag) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}

/** Smooth pseudo random offsets for a camera shake of amplitude amp at time t */
export const shakeX = (amp: number, t: number) => amp * (Math.sin(t * 57) * 0.6 + Math.sin(t * 31 + 1.7) * 0.4);
export const shakeY = (amp: number, t: number) => amp * (Math.sin(t * 49 + 0.6) * 0.6 + Math.sin(t * 27 + 2.3) * 0.4);

/* ---------- code glyphs ---------- */

/** Code symbols on a 4 x 6 grid as lists of polylines [x0, y0, x1, y1, ...] */
const CODE_GLYPHS: number[][][] = [
  [[3, 0.3, 2, 0.6, 1.8, 2.4, 0.8, 3, 1.8, 3.6, 2, 5.4, 3, 5.7]], // {
  [[1, 0.3, 2, 0.6, 2.2, 2.4, 3.2, 3, 2.2, 3.6, 2, 5.4, 1, 5.7]], // }
  [[3.5, 1, 0.5, 3, 3.5, 5]], // <
  [[0.5, 1, 3.5, 3, 0.5, 5]], // >
  [[3.4, 0.3, 0.6, 5.7]], // /
  [[0.6, 0.3, 3.4, 5.7]], // backslash
  [[0.5, 2.2, 3.5, 2.2], [0.5, 3.8, 3.5, 3.8]], // =
  [[2.8, 0.3, 1.2, 2, 1.2, 4, 2.8, 5.7]], // (
  [[1.2, 0.3, 2.8, 2, 2.8, 4, 1.2, 5.7]], // )
  [[2.8, 0.4, 1.2, 0.4, 1.2, 5.6, 2.8, 5.6]], // [
  [[1.2, 0.4, 2.8, 0.4, 2.8, 5.6, 1.2, 5.6]], // ]
  [[0.3, 5.6, 3.7, 5.6]], // _
  [[2, 1.5, 2, 4.5], [0.5, 3, 3.5, 3]], // +
  [[2, 1.4, 2, 4.6], [0.7, 2.2, 3.3, 3.8], [3.3, 2.2, 0.7, 3.8]], // *
  [[2, 1.8, 2, 2.4], [2, 3.8, 2.2, 4.4, 1.6, 5.4]], // ;
  [[2, 0.5, 3.5, 1.5, 3.5, 4.5, 2, 5.5, 0.5, 4.5, 0.5, 1.5, 2, 0.5], [3.2, 1, 0.8, 5]], // 0
  [[1, 1.5, 2.2, 0.5, 2.2, 5.5], [1, 5.5, 3.4, 5.5]], // 1
  [[1, 1, 3, 3, 1, 5], [2.4, 5.4, 3.8, 5.4]], // prompt >_
  [[0.6, 2, 1.6, 0.6], [2.4, 0.6, 3.4, 2]], // quote
  [[0.4, 3, 1.4, 3], [1.5, 3, 2.5, 3], [2.6, 3, 3.6, 3]], // ...
  [[3.2, 1, 1.2, 1, 0.8, 2.4, 3, 3.2, 3.2, 4.6, 0.8, 5]], // S
  [[0.5, 5.5, 2, 0.5, 3.5, 5.5], [1, 3.8, 3, 3.8]], // A
];

export const CODE_GLYPH_COUNT = CODE_GLYPHS.length;

export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  cell: number;
  tints: number;
}

/** Build a glyph atlas: one row per tint, glowing strokes on transparent */
export function makeGlyphAtlas(tints: string[], cell = 36): GlyphAtlas {
  const c = document.createElement('canvas');
  c.width = cell * CODE_GLYPHS.length;
  c.height = cell * tints.length;
  const g = c.getContext('2d');
  if (g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const k = (cell * 0.62) / 6;
    for (let row = 0; row < tints.length; row++) {
      for (let i = 0; i < CODE_GLYPHS.length; i++) {
        const ox = i * cell + (cell - 4 * k) / 2;
        const oy = row * cell + (cell - 6 * k) / 2;
        for (const pass of [0, 1]) {
          g.strokeStyle = tints[row];
          g.globalAlpha = pass === 0 ? 0.28 : 1;
          g.lineWidth = pass === 0 ? k * 1.5 : k * 0.55;
          g.beginPath();
          for (const line of CODE_GLYPHS[i]) {
            g.moveTo(ox + line[0] * k, oy + line[1] * k);
            for (let j = 2; j < line.length; j += 2) g.lineTo(ox + line[j] * k, oy + line[j + 1] * k);
          }
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
  }
  return { canvas: c, cell, tints: tints.length };
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  atlas: GlyphAtlas,
  glyph: number,
  tint: number,
  x: number,
  y: number,
  size: number
) {
  const c = atlas.cell;
  ctx.drawImage(atlas.canvas, glyph * c, tint * c, c, c, x - size / 2, y - size / 2, size, size);
}

/* ---------- jointed figure ---------- */

/**
 * Joint indices of a side or three quarter view figure in figure units (ankles on y = 0,
 * about 180 tall, y grows downward like the canvas). "Near" limbs are drawn in front of
 * the torso, "far" ones behind it. +x is the way the figure faces.
 */
export const J = {
  HEAD: 0,
  NECK: 1,
  SHO: 2,
  ELB_N: 3,
  HAND_N: 4,
  ELB_F: 5,
  HAND_F: 6,
  HIP: 7,
  KNEE_N: 8,
  FOOT_N: 9,
  KNEE_F: 10,
  FOOT_F: 11,
} as const;
export const JOINTS = 12;

export type Pose = Float32Array;

export const newPose = (): Pose => new Float32Array(JOINTS * 2);

export function makePose(pts: number[]): Pose {
  return Float32Array.from(pts);
}

/** out = a + (b - a) * k */
export function lerpPose(out: Pose, a: Pose, b: Pose, k: number) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

export function setJ(p: Pose, j: number, x: number, y: number) {
  p[j * 2] = x;
  p[j * 2 + 1] = y;
}

/**
 * Two bone IK: places joint `mid` between a (root joint) and the end point (ex, ey).
 * bend +1 or -1 picks the side the joint folds to.
 */
export function ik(p: Pose, root: number, mid: number, end: number, ex: number, ey: number, l1: number, l2: number, bend: number) {
  const ax = p[root * 2];
  const ay = p[root * 2 + 1];
  let dx = ex - ax;
  let dy = ey - ay;
  let d = Math.hypot(dx, dy) || 0.0001;
  const maxD = l1 + l2 - 0.01;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  const minD = Math.abs(l1 - l2) + 0.01;
  if (d < minD) {
    dx *= minD / d;
    dy *= minD / d;
    d = minD;
  }
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const base = Math.atan2(dy, dx);
  const ang = base + bend * a;
  setJ(p, mid, ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1);
  setJ(p, end, ax + dx, ay + dy);
}

export interface FigureStyle {
  skin: string;
  skinDark: string;
  hair: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  pantsDark: string;
  shoes: string;
  /** Rim light along the top edges, or null */
  rim: string | null;
  /** Limb thickness multiplier */
  bulk: number;
  /** Sleeves: t shirt, long jacket sleeves, or bare arms */
  sleeve: 'tee' | 'long' | 'none';
  /** Optional belt colour around the waist */
  belt?: string;
  /** Shirt showing down the front of an open jacket */
  under?: string;
  hairCut: 'short' | 'buzz' | 'bald';
  /** Shorts end at the knee and show the shins */
  shorts?: boolean;
}

function capsule(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 0.0001;
  const nx = -dy / len;
  const ny = dx / len;
  const a = Math.atan2(dy, dx);
  c.beginPath();
  c.moveTo(x0 + nx * r0, y0 + ny * r0);
  c.lineTo(x1 + nx * r1, y1 + ny * r1);
  c.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2, true);
  c.lineTo(x0 - nx * r0, y0 - ny * r0);
  c.arc(x0, y0, r0, a - Math.PI / 2, a + Math.PI / 2, true);
  c.closePath();
}

/** Tapered limb lit from above: base fill, a shaded lower half and a rim on the top edge */
export function limb(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number,
  fill: string,
  shade: string,
  rim: string | null
) {
  capsule(c, x0, y0, x1, y1, r0, r1);
  c.fillStyle = fill;
  c.fill();
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 0.0001;
  // normal pointing down (away from the light)
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0 || (Math.abs(ny) < 0.05 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  c.save();
  c.clip();
  c.fillStyle = shade;
  const r = Math.max(r0, r1);
  c.beginPath();
  c.moveTo(x0 + nx * r0 * 0.1 - dx * 0.2, y0 + ny * r0 * 0.1 - dy * 0.2);
  c.lineTo(x1 + nx * r1 * 0.1 + dx * 0.2, y1 + ny * r1 * 0.1 + dy * 0.2);
  c.lineTo(x1 + nx * r * 3 + dx * 0.2, y1 + ny * r * 3 + dy * 0.2);
  c.lineTo(x0 + nx * r * 3 - dx * 0.2, y0 + ny * r * 3 - dy * 0.2);
  c.closePath();
  c.fill();
  c.restore();
  if (rim) {
    c.strokeStyle = rim;
    c.lineWidth = Math.min(2, Math.max(0.8, Math.min(r0, r1) * 0.16));
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x0 - nx * r0 * 0.9, y0 - ny * r0 * 0.9);
    c.lineTo(x1 - nx * r1 * 0.9, y1 - ny * r1 * 0.9);
    c.stroke();
  }
}

/**
 * Draw a figure facing dir (1 right, -1 left) in the current transform (figure units).
 * extra(c, stage) draws props between layers: 'back' after the far limbs, 'front' after
 * the head and before the near limbs, 'top' after everything.
 */
export function drawFigure(
  c: CanvasRenderingContext2D,
  p: Pose,
  st: FigureStyle,
  dir: number,
  extra?: (c: CanvasRenderingContext2D, stage: 'back' | 'front' | 'top') => void
) {
  const b = st.bulk;
  const X = (i: number) => p[i * 2] * dir;
  const Y = (i: number) => p[i * 2 + 1];
  c.lineJoin = 'round';
  const shadeSkin = 'rgba(40,14,4,0.38)';
  const shadeCloth = 'rgba(0,0,0,0.38)';

  const arm = (e: number, h: number, near: boolean) => {
    const sx = X(J.SHO) + (near ? 1 : -3) * dir;
    const sy = Y(J.SHO) + (near ? 2 : 0);
    const skin = near ? st.skin : st.skinDark;
    const rim = near ? st.rim : null;
    const cloth = near ? st.shirt : st.shirtDark;
    // forearm, then fist
    if (st.sleeve === 'long') limb(c, X(e), Y(e), X(h), Y(h), 6.6 * b, 5.6 * b, cloth, shadeCloth, rim);
    else limb(c, X(e), Y(e), X(h), Y(h), 6.4 * b, 4.8 * b, skin, shadeSkin, rim);
    c.fillStyle = skin;
    c.beginPath();
    c.ellipse(X(h), Y(h), 6.2 * b, 5.6 * b, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(40,14,4,0.3)';
    c.beginPath();
    c.ellipse(X(h), Y(h) + 2, 4.6 * b, 3.4 * b, 0, 0, TAU);
    c.fill();
    // upper arm with sleeve
    if (st.sleeve === 'none') {
      limb(c, sx, sy, X(e), Y(e), 9.4 * b, 6.6 * b, skin, shadeSkin, rim);
    } else if (st.sleeve === 'tee') {
      limb(c, sx, sy, X(e), Y(e), 9.4 * b, 6.6 * b, skin, shadeSkin, rim);
      const ex = sx + (X(e) - sx) * 0.48;
      const ey = sy + (Y(e) - sy) * 0.48;
      limb(c, sx, sy, ex, ey, 10.6 * b, 9.4 * b, cloth, shadeCloth, rim);
    } else {
      limb(c, sx, sy, X(e), Y(e), 10 * b, 7.4 * b, cloth, shadeCloth, rim);
    }
  };

  const leg = (k: number, f: number, near: boolean) => {
    const hx = X(J.HIP) + (near ? 2 : -2) * dir;
    const hy = Y(J.HIP);
    const fill = near ? st.pants : st.pantsDark;
    const rim = near ? st.rim : null;
    const skin = near ? st.skin : st.skinDark;
    if (st.shorts) limb(c, X(k), Y(k), X(f), Y(f) - 4, 7.6 * b, 5 * b, skin, shadeSkin, rim);
    else limb(c, X(k), Y(k), X(f), Y(f) - 3, 8.4 * b, 6.4 * b, fill, shadeCloth, rim);
    limb(c, hx, hy, X(k), Y(k), 12.5 * b, 8.8 * b, fill, shadeCloth, rim);
    if (st.shorts) {
      // hem just above the knee
      const ex = hx + (X(k) - hx) * 0.86;
      const ey = hy + (Y(k) - hy) * 0.86;
      limb(c, hx, hy, ex, ey, 13 * b, 10 * b, fill, shadeCloth, rim);
    }
    // shoe along the floor in the facing direction
    const fx = X(f);
    const fy = Y(f);
    c.fillStyle = near ? st.shoes : 'rgba(6,6,8,0.95)';
    c.beginPath();
    c.moveTo(fx - 8 * dir, fy - 7);
    c.quadraticCurveTo(fx + 6 * dir, fy - 9, fx + 19 * dir, fy - 1);
    c.quadraticCurveTo(fx + 21 * dir, fy + 3.5, fx + 17 * dir, fy + 4);
    c.lineTo(fx - 9 * dir, fy + 4);
    c.closePath();
    c.fill();
    if (near) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(Math.min(fx - 9 * dir, fx + 17 * dir), fy + 2, 26, 2);
    }
  };

  arm(J.ELB_F, J.HAND_F, false);
  leg(J.KNEE_F, J.FOOT_F, false);
  extra?.(c, 'back');

  // torso in a frame running up the spine: +x toward the shoulders, +y toward the chest
  const hx = X(J.HIP);
  const hy = Y(J.HIP);
  const sx = X(J.SHO);
  const sy = Y(J.SHO);
  const len = Math.hypot(sx - hx, sy - hy);
  const ang = Math.atan2(sy - hy, sx - hx);
  const F = dir; // chest side in the rotated frame
  c.save();
  c.translate(hx, hy);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(-6, 13.5 * b * F);
  c.quadraticCurveTo(len * 0.35, 14 * b * F, len * 0.68, 20.5 * b * F);
  c.quadraticCurveTo(len + 3, 21 * b * F, len + 9, 10 * b * F);
  c.quadraticCurveTo(len + 15, 0, len + 8, -15 * b * F);
  c.quadraticCurveTo(len * 0.62, -21.5 * b * F, len * 0.25, -15 * b * F);
  c.quadraticCurveTo(0, -14 * b * F, -6, -14 * b * F);
  c.closePath();
  const tg = c.createLinearGradient(0, -18 * b * F, 0, 18 * b * F);
  tg.addColorStop(0, st.shirtDark);
  tg.addColorStop(0.55, st.shirt);
  tg.addColorStop(1, st.shirtDark);
  c.fillStyle = tg;
  c.fill();
  // fold under the chest and the lat edge
  c.strokeStyle = 'rgba(0,0,0,0.28)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(len * 0.5, 15 * b * F);
  c.quadraticCurveTo(len * 0.6, 8 * b * F, len * 0.72, 6 * b * F);
  c.stroke();
  if (st.under) {
    // the open front of the jacket with the shirt underneath and a turned collar
    c.fillStyle = st.under;
    c.beginPath();
    c.moveTo(len * 0.05, 13.5 * b * F);
    c.quadraticCurveTo(len * 0.4, 15 * b * F, len * 0.68, 20 * b * F);
    c.quadraticCurveTo(len + 3, 20.5 * b * F, len + 8, 10 * b * F);
    c.lineTo(len + 6, 4 * b * F);
    c.quadraticCurveTo(len * 0.6, 12 * b * F, len * 0.05, 8.5 * b * F);
    c.closePath();
    c.fill();
    c.fillStyle = st.shirtDark;
    c.beginPath();
    c.moveTo(len + 9, 9 * b * F);
    c.lineTo(len - 6, 13 * b * F);
    c.lineTo(len + 2, 2 * b * F);
    c.closePath();
    c.fill();
  }
  if (st.belt) {
    c.fillStyle = st.belt;
    c.fillRect(-2, -14 * b, 13, 28 * b);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(-2, -14 * b, 1.4, 28 * b);
  }
  c.restore();

  // pelvis joins legs and torso, glutes behind
  c.fillStyle = st.pants;
  c.beginPath();
  c.ellipse(hx, hy, 14.5 * b, 12 * b, ang, 0, TAU);
  c.fill();
  const bx = Math.cos(ang + Math.PI / 2) * -F;
  const by = Math.sin(ang + Math.PI / 2) * -F;
  c.beginPath();
  c.ellipse(hx + bx * 4, hy + by * 4 + 2, 8.5 * b, 9.5, ang, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(hx + bx * 4, hy + by * 4 + 5, 7 * b, 6, ang, 0, TAU);
  c.fill();

  // neck and head
  const nx = X(J.NECK);
  const ny = Y(J.NECK);
  const hdx = X(J.HEAD);
  const hdy = Y(J.HEAD);
  limb(c, nx, ny, hdx - dir * 2, hdy + 5, 7.2 * b, 6.2 * b, st.skinDark, 'rgba(40,14,4,0.25)', null);
  const tilt = Math.atan2(hdx - nx, ny - hdy) * 0.6;
  c.save();
  c.translate(hdx, hdy);
  c.rotate(tilt);
  c.fillStyle = st.skin;
  c.beginPath();
  c.ellipse(0, 0, 9.6, 11.2, 0, 0, TAU);
  c.fill();
  // jaw and chin
  c.beginPath();
  c.moveTo(-dir * 5, 3);
  c.quadraticCurveTo(dir * 9, 4, dir * 8.5, 10);
  c.quadraticCurveTo(dir * 4, 13.5, -dir * 4, 10.5);
  c.closePath();
  c.fill();
  // back of the head in shadow
  c.fillStyle = 'rgba(40,14,4,0.3)';
  c.beginPath();
  c.ellipse(-dir * 4, 2, 6, 9.5, 0, 0, TAU);
  c.fill();
  // brow ridge and nose
  c.fillStyle = st.skin;
  c.beginPath();
  c.moveTo(dir * 7, -3.5);
  c.lineTo(dir * 11.8, 2.8);
  c.lineTo(dir * 8.4, 3.8);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(20,8,4,0.75)';
  c.beginPath();
  c.ellipse(dir * 5.6, -1.2, 1.5, 1.1, 0, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(20,8,4,0.5)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(dir * 3.5, -3.6);
  c.lineTo(dir * 8.2, -3.2);
  c.stroke();
  // ear
  c.fillStyle = st.skinDark;
  c.beginPath();
  c.ellipse(-dir * 1.5, 0.5, 2.3, 3.4, 0, 0, TAU);
  c.fill();
  // hair
  if (st.hairCut !== 'bald') {
    c.fillStyle = st.hair;
    c.beginPath();
    const top = st.hairCut === 'buzz' ? 11.9 : 12.9;
    const nape = st.hairCut === 'buzz' ? 1 : 3;
    c.moveTo(dir * 8.4, -6.4);
    c.quadraticCurveTo(dir * 7.5, -top + 1, dir * 1, -top);
    c.quadraticCurveTo(-dir * 8.8, -top + 0.8, -dir * 10.2, -3);
    c.quadraticCurveTo(-dir * 10, nape, -dir * 7.6, nape + 1.5);
    c.lineTo(-dir * 4.6, -1);
    c.quadraticCurveTo(-dir * 0.5, -6, dir * 8.4, -6.4);
    c.closePath();
    c.fill();
  }
  if (st.rim) {
    c.strokeStyle = st.rim;
    c.lineWidth = 1.1;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.ellipse(0, -0.8, 10, 11.6, 0, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
    c.globalAlpha = 1;
  }
  c.restore();

  extra?.(c, 'front');
  leg(J.KNEE_N, J.FOOT_N, true);
  arm(J.ELB_N, J.HAND_N, true);
  extra?.(c, 'top');
}


/* ---------- sounds ---------- */

let sharedNoise: AudioBuffer | null = null;

function noiseBuffer(bus: AudioBus) {
  if (!sharedNoise || sharedNoise.sampleRate !== bus.ctx.sampleRate) {
    const len = Math.floor(bus.ctx.sampleRate * 0.6);
    sharedNoise = bus.ctx.createBuffer(1, len, bus.ctx.sampleRate);
    const d = sharedNoise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return sharedNoise;
}

/** Filtered noise hit with a fast exponential tail */
export function hit(
  bus: AudioBus,
  { freq = 300, q = 0.9, gain = 0.4, decay = 0.18, delay = 0, type = 'lowpass' as BiquadFilterType } = {}
) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(bus);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + decay + 0.05);
}

/** Struck metal: a few inharmonic partials with different decays */
export function clang(bus: AudioBus, base = 220, gain = 0.18, delay = 0) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  const ratios = [1, 2.76, 5.4, 8.93];
  for (let i = 0; i < ratios.length; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * ratios[i];
    const g = ctx.createGain();
    const d = 0.9 / (1 + i * 0.9);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain / (1 + i * 0.6), t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }
}
