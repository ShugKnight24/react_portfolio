import { TAU, clamp } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';

/**
 * Shared kit for the Legends scenes (Ovechkin, Arnold, Pakulski): the poster language of the
 * Sports Legends feature in canvas form. Bodies are built from organic outlines (limbs with a
 * width per side at each station, torsos as rows along an axis), painted as one dark ink mass
 * with a crisp key rim on the lit edges, a kicker rim from the other side and a backlight halo.
 * Backgrounds use amplitude modulated halftone dots, light shafts, grain and a vignette.
 */

export type Shape = (c: CanvasRenderingContext2D) => void;

/* ---------- geometry ---------- */

/** Two bone IK: the middle joint for a chain from a to t; bend picks the side (+1 or -1) */
export function ik2(ax: number, ay: number, tx: number, ty: number, l1: number, l2: number, bend: number) {
  let dx = tx - ax;
  let dy = ty - ay;
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.999;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + a * bend;
  return { x: ax + Math.cos(base) * l1, y: ay + Math.sin(base) * l1 };
}

/** Closed Catmull-Rom outline through flat [x, y, x, y, ...] points, as a new subpath */
export function smoothClosed(c: CanvasRenderingContext2D, p: readonly number[]) {
  const n = p.length / 2;
  if (n < 3) return;
  c.moveTo(p[0], p[1]);
  for (let i = 0; i < n; i++) {
    const i0 = ((i - 1 + n) % n) * 2;
    const i1 = i * 2;
    const i2 = ((i + 1) % n) * 2;
    const i3 = ((i + 2) % n) * 2;
    c.bezierCurveTo(
      p[i1] + (p[i2] - p[i0]) / 6,
      p[i1 + 1] + (p[i2 + 1] - p[i0 + 1]) / 6,
      p[i2] - (p[i3] - p[i1]) / 6,
      p[i2 + 1] - (p[i3 + 1] - p[i1 + 1]) / 6,
      p[i2],
      p[i2 + 1]
    );
  }
  c.closePath();
}

/** Open Catmull-Rom curve through flat points (for contour accents) */
export function smoothOpen(c: CanvasRenderingContext2D, p: readonly number[]) {
  const n = p.length / 2;
  if (n < 2) return;
  c.moveTo(p[0], p[1]);
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(i - 1, 0) * 2;
    const i1 = i * 2;
    const i2 = (i + 1) * 2;
    const i3 = Math.min(i + 2, n - 1) * 2;
    c.bezierCurveTo(
      p[i1] + (p[i2] - p[i0]) / 6,
      p[i1 + 1] + (p[i2 + 1] - p[i0 + 1]) / 6,
      p[i2] - (p[i3] - p[i1]) / 6,
      p[i2 + 1] - (p[i3 + 1] - p[i1 + 1]) / 6,
      p[i2],
      p[i2 + 1]
    );
  }
}

/**
 * Organic limb outline. Each station is [x, y, left, right]: the centre and the half width on
 * each side (left is the side 90 degrees counterclockwise on screen from the direction of travel).
 * Ends get a rounded cap. Adds one closed subpath.
 */
export function limb(c: CanvasRenderingContext2D, st: readonly (readonly number[])[]) {
  const n = st.length;
  const L: number[] = [];
  const R: number[] = [];
  let sx = 0;
  let sy = 0;
  let ex = 0;
  let ey = 0;
  for (let i = 0; i < n; i++) {
    const a = st[Math.max(i - 1, 0)];
    const b = st[Math.min(i + 1, n - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    // Screen space (y down): counterclockwise-left of the travel direction
    const nx = ty;
    const ny = -tx;
    const q = st[i];
    const wl = q[2];
    const wr = q[3] ?? q[2];
    L.push(q[0] + nx * wl, q[1] + ny * wl);
    R.push(q[0] - nx * wr, q[1] - ny * wr);
    if (i === 0) {
      sx = -tx;
      sy = -ty;
    }
    if (i === n - 1) {
      ex = tx;
      ey = ty;
    }
  }
  const pts: number[] = [...L];
  // End cap
  const lx = L[L.length - 2];
  const ly = L[L.length - 1];
  const rx = R[R.length - 2];
  const ry = R[R.length - 1];
  const er = Math.hypot(lx - rx, ly - ry) / 2;
  const emx = (lx + rx) / 2;
  const emy = (ly + ry) / 2;
  pts.push(emx + ex * er * 0.62 + (lx - emx) * 0.72, emy + ey * er * 0.62 + (ly - emy) * 0.72);
  pts.push(emx + ex * er * 0.95, emy + ey * er * 0.95);
  pts.push(emx + ex * er * 0.62 + (rx - emx) * 0.72, emy + ey * er * 0.62 + (ry - emy) * 0.72);
  for (let i = n - 1; i >= 0; i--) pts.push(R[i * 2], R[i * 2 + 1]);
  // Start cap
  const sr = Math.hypot(L[0] - R[0], L[1] - R[1]) / 2;
  const smx = (L[0] + R[0]) / 2;
  const smy = (L[1] + R[1]) / 2;
  pts.push(smx + sx * sr * 0.62 + (R[0] - smx) * 0.72, smy + sy * sr * 0.62 + (R[1] - smy) * 0.72);
  pts.push(smx + sx * sr * 0.95, smy + sy * sr * 0.95);
  pts.push(smx + sx * sr * 0.62 + (L[0] - smx) * 0.72, smy + sy * sr * 0.62 + (L[1] - smy) * 0.72);
  smoothClosed(c, pts);
}

/**
 * Body mass along an axis from a to b: rows of [t along the axis, offset to the front side,
 * offset to the back side]. front is the unit normal that counts as the front.
 */
export function massAlong(
  c: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rows: readonly (readonly [number, number, number])[],
  front: 1 | -1
) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = -uy * front;
  const ny = ux * front;
  const pts: number[] = [];
  for (const [t, fo] of rows) pts.push(ax + (bx - ax) * t + nx * fo, ay + (by - ay) * t + ny * fo);
  for (let i = rows.length - 1; i >= 0; i--) {
    const [t, , bo] = rows[i];
    pts.push(ax + (bx - ax) * t - nx * bo, ay + (by - ay) * t - ny * bo);
  }
  smoothClosed(c, pts);
}

export function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

/** Fill one part as its own path, so overlapping parts never cancel out */
export function part(c: CanvasRenderingContext2D, build: () => void) {
  c.beginPath();
  build();
  c.fill();
}

/* ---------- the rim lit silhouette ---------- */

export interface RimStyle {
  /** Ink gradient, top to bottom of the bounding box */
  ink: readonly [string, string];
  /** Key rim colour and its offset toward the shadow (the light sits opposite) */
  key: string;
  kx: number;
  ky: number;
  /** Kicker rim from the other side */
  back: string;
  bx: number;
  by: number;
  backAlpha?: number;
  /** Backlight halo hugging the silhouette (0 alpha for none) */
  halo: string;
  haloAlpha: number;
  haloBlur: number;
  /** Bloom on the key rim */
  bloom?: number;
}

export interface FigureLayer {
  layer: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  /** Last drawn box in CSS pixels */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeFigureLayer(): FigureLayer {
  return {
    layer: document.createElement('canvas'),
    scratch: document.createElement('canvas'),
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

export function freeFigureLayer(f: FigureLayer) {
  f.layer.width = f.layer.height = 0;
  f.scratch.width = f.scratch.height = 0;
}

const ctx2d = (cv: HTMLCanvasElement) => cv.getContext('2d') as CanvasRenderingContext2D;

/**
 * Paints a silhouette into the figure layer (box in CSS pixels): ink, then accents clipped to
 * the ink, then the rims. Call compositeFigure to put it on screen.
 */
export function paintFigure(
  f: FigureLayer,
  env: SceneEnv,
  box: { x: number; y: number; w: number; h: number },
  shape: Shape,
  st: RimStyle,
  accents?: (c: CanvasRenderingContext2D) => void
) {
  const dpr = env.dpr;
  const W = Math.max(1, Math.ceil(box.w * dpr));
  const Hh = Math.max(1, Math.ceil(box.h * dpr));
  for (const cv of [f.layer, f.scratch]) {
    if (cv.width < W || cv.height < Hh) {
      cv.width = Math.max(cv.width, W);
      cv.height = Math.max(cv.height, Hh);
    }
  }
  f.x = box.x;
  f.y = box.y;
  f.w = box.w;
  f.h = box.h;
  const c = ctx2d(f.layer);
  const s = ctx2d(f.scratch);
  for (const k of [c, s]) {
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.globalAlpha = 1;
    k.clearRect(0, 0, f.layer.width, f.layer.height);
    k.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    k.lineJoin = 'round';
    k.lineCap = 'round';
  }
  const g = c.createLinearGradient(0, box.y, 0, box.y + box.h);
  g.addColorStop(0, st.ink[0]);
  g.addColorStop(1, st.ink[1]);
  c.fillStyle = g;
  shape(c);
  if (accents) {
    c.save();
    c.globalCompositeOperation = 'source-atop';
    accents(c);
    c.restore();
  }
  const strip = (color: string, ox: number, oy: number) => {
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, f.scratch.width, f.scratch.height);
    s.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    s.fillStyle = color;
    shape(s);
    s.globalCompositeOperation = 'destination-out';
    s.fillStyle = '#000';
    s.translate(ox, oy);
    shape(s);
    s.globalCompositeOperation = 'source-over';
  };
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  // Kicker first, the key rim wins where they meet
  strip(st.back, st.bx, st.by);
  c.globalAlpha = st.backAlpha ?? 0.75;
  c.drawImage(f.scratch, 0, 0);
  strip(st.key, st.kx, st.ky);
  c.globalAlpha = 1;
  if (st.bloom) {
    c.shadowColor = st.key;
    c.shadowBlur = st.bloom * dpr;
  }
  c.drawImage(f.scratch, 0, 0);
  c.shadowBlur = 0;
  c.drawImage(f.scratch, 0, 0);
  c.restore();
}

/** Draws the painted layer on screen with its halo; optional mirror (about x = mirrorX) */
export function compositeFigure(
  ctx: CanvasRenderingContext2D,
  f: FigureLayer,
  env: SceneEnv,
  st: Pick<RimStyle, 'halo' | 'haloAlpha' | 'haloBlur'>,
  alpha = 1
) {
  const dpr = env.dpr;
  const sw = Math.ceil(f.w * dpr);
  const sh = Math.ceil(f.h * dpr);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (st.haloAlpha > 0) {
    ctx.shadowColor = st.halo;
    ctx.shadowBlur = st.haloBlur * dpr;
    ctx.globalAlpha = alpha * st.haloAlpha;
    ctx.drawImage(f.layer, 0, 0, sw, sh, f.x, f.y, sw / dpr, sh / dpr);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
  }
  ctx.drawImage(f.layer, 0, 0, sw, sh, f.x, f.y, sw / dpr, sh / dpr);
  ctx.restore();
}

/* ---------- halftone, rays, grain, vignette ---------- */

/**
 * Amplitude modulated halftone: paint grey levels (white with alpha) in CSS pixels and get back
 * a canvas of ink dots, one per screen cell, sized by the tone. Build it on resize, not per frame.
 */
export function halftone(
  env: SceneEnv,
  w: number,
  h: number,
  cell: number,
  angleDeg: number,
  ink: string,
  paint: (c: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const tone = document.createElement('canvas');
  tone.width = Math.max(1, Math.round(w));
  tone.height = Math.max(1, Math.round(h));
  const tc = ctx2d(tone);
  paint(tc);
  const data = tc.getImageData(0, 0, tone.width, tone.height).data;
  tone.width = tone.height = 0;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * env.dpr));
  out.height = Math.max(1, Math.round(h * env.dpr));
  const oc = ctx2d(out);
  oc.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  oc.fillStyle = ink;
  const a = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const reach = Math.hypot(w, h) / 2 + cell;
  const cx = w / 2;
  const cy = h / 2;
  const n = Math.ceil(reach / cell);
  const W = Math.round(w);
  const Hh = Math.round(h);
  oc.beginPath();
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = cx + (i * ca - j * sa) * cell;
      const y = cy + (i * sa + j * ca) * cell;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      const px = clamp(Math.round(x), 0, W - 1);
      const py = clamp(Math.round(y), 0, Hh - 1);
      const v = data[(py * W + px) * 4 + 3] / 255;
      if (v < 0.04) continue;
      const r = cell * 0.62 * Math.sqrt(v);
      oc.moveTo(x + r, y);
      oc.arc(x, y, r, 0, TAU);
    }
  }
  oc.fill();
  return out;
}

/** Light shafts fanning out of a point (additive) */
export function rays(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angles: readonly number[],
  widthDeg: number,
  len: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, color);
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  angles.forEach((deg, i) => {
    const a0 = ((deg - widthDeg / 2) * Math.PI) / 180;
    const a1 = ((deg + widthDeg / 2) * Math.PI) / 180;
    ctx.globalAlpha = alpha * (0.55 + (i % 3) * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a0) * len, y + Math.sin(a0) * len);
    ctx.lineTo(x + Math.cos(a1) * len, y + Math.sin(a1) * len);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

let grainTile: HTMLCanvasElement | null = null;
/** Film grain tile, shared by every scene */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 160;
    const g = ctx2d(grainTile);
    const img = g.createImageData(160, 160);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = seed >>> 24;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const pat = ctx.createPattern(grainTile, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.8, cy = 0.46) {
  const g = ctx.createRadialGradient(w / 2, h * cy, Math.min(w, h) * 0.25, w / 2, h * cy, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** White numeral tone for halftone(): fades toward the bottom like the posters */
export function paintNumeral(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rot = 0) {
  c.save();
  c.translate(x, y);
  c.rotate((rot * Math.PI) / 180);
  c.font = `900 ${size}px Geist, 'Arial Black', Impact, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const g = c.createLinearGradient(0, -size * 0.75, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0.35)');
  c.fillStyle = g;
  c.fillText(text, 0, 0);
  c.restore();
}

/** Hairline outline for a halftone numeral */
export function strokeNumeral(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
  rot = 0
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.font = `900 ${size}px Geist, 'Arial Black', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size / 260);
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

/* ---------- HUD ---------- */

export const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const DISPLAY = "Geist, 'Arial Black', Impact, sans-serif";

/** A small all caps label with a dark backing chip */
export function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fg: string,
  bg: string,
  align: CanvasTextAlign = 'left'
) {
  ctx.save();
  ctx.font = `700 ${size}px ${MONO}`;
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.75;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x0, y, w, h, size * 0.35);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0 + size * 0.55, y + h / 2 + size * 0.04);
  ctx.restore();
  return w;
}

/** Big punchy call-out (GOAL, PR, etc.) that scales in and fades */
export function callout(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  age: number,
  life: number,
  fill: string,
  glow: string,
  rm: boolean
) {
  if (age < 0 || age > life) return;
  const k = age / life;
  const pop = rm ? 1 : age < 0.14 ? 0.6 + (age / 0.14) * 0.48 : 1.08 - Math.min(0.08, (age - 0.14) * 0.3);
  const a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.globalAlpha = a;
  ctx.font = `900 italic ${size}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.5;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* ---------- particles ---------- */

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

export const makeMotes = (n: number): Mote[] =>
  Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1 }));

export function spawnMote(pool: Mote[], x: number, y: number, vx: number, vy: number, life: number, size: number) {
  let best = pool[0];
  for (const m of pool) {
    if (m.life <= 0) {
      best = m;
      break;
    }
    if (m.life < best.life) best = m;
  }
  best.x = x;
  best.y = y;
  best.vx = vx;
  best.vy = vy;
  best.life = best.max = life;
  best.size = size;
}

export function stepMotes(pool: Mote[], dt: number, gravity: number, drag: number) {
  const k = Math.exp(-drag * dt);
  for (const m of pool) {
    if (m.life <= 0) continue;
    m.life -= dt;
    m.vy += gravity * dt;
    m.vx *= k;
    m.vy *= k;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }
}

/* ---------- sound (only ever called with a live bus, i.e. unmuted) ---------- */

function noiseBuffer(bus: AudioBus, seconds: number) {
  const { ctx } = bus;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Shaped noise: attack, hold, release, through a filter that can sweep */
export function swell(
  bus: AudioBus,
  {
    attack = 0.02,
    hold = 0.1,
    release = 0.3,
    gain = 0.2,
    type = 'bandpass' as BiquadFilterType,
    freq = 900,
    freqTo,
    q = 0.7,
    delay = 0,
  }: {
    attack?: number;
    hold?: number;
    release?: number;
    gain?: number;
    type?: BiquadFilterType;
    freq?: number;
    freqTo?: number;
    q?: number;
    delay?: number;
  } = {}
) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  const dur = attack + hold + release;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(bus, dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** Struck metal: inharmonic partials plus a click (plates, posts, bars) */
export function clank(bus: AudioBus, base = 380, gain = 0.12, delay = 0) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  for (const [ratio, amp, dec] of [
    [1, 1, 0.5],
    [2.76, 0.6, 0.32],
    [5.4, 0.35, 0.18],
    [8.9, 0.2, 0.1],
  ] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = base * ratio * (0.99 + Math.random() * 0.02);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * amp, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dec + 0.05);
  }
  swell(bus, { attack: 0.002, hold: 0, release: 0.05, gain: gain * 0.8, type: 'highpass', freq: 3500, delay });
}

/** Low body thump with a pitch drop */
export function thump(bus: AudioBus, freq = 90, gain = 0.3, delay = 0) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.45, t0 + 0.25);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.4);
}

/** Arena goal horn: a fat detuned chord through a low pass */
export function goalHorn(bus: AudioBus, seconds = 1.8, gain = 0.12) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.06);
  g.gain.setValueAtTime(gain, t0 + seconds - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  lp.connect(g).connect(out);
  for (const f of [138.6, 139.4, 174.6, 207.7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + seconds + 0.05);
  }
}

/** Crowd roar swelling and fading */
export function roar(bus: AudioBus, seconds = 2.4, gain = 0.16) {
  swell(bus, { attack: 0.35, hold: seconds * 0.4, release: seconds * 0.6, gain, type: 'bandpass', freq: 700, freqTo: 1100, q: 0.45 });
  swell(bus, { attack: 0.5, hold: seconds * 0.3, release: seconds * 0.7, gain: gain * 0.6, type: 'lowpass', freq: 400, q: 0.3 });
}

/** Camera shutter and flash whine */
export function shutter(bus: AudioBus, delay = 0) {
  swell(bus, { attack: 0.001, hold: 0.008, release: 0.03, gain: 0.12, type: 'highpass', freq: 2500, delay });
  swell(bus, { attack: 0.001, hold: 0.01, release: 0.04, gain: 0.08, type: 'bandpass', freq: 1300, q: 2, delay: delay + 0.05 });
}
