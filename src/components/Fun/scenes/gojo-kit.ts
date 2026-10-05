import { clamp, lerp, TAU } from './runtime';
import { mulberry } from './heroes-kit';

/**
 * Gojo kit: the character shared by the Hollow Purple and Unlimited Void scenes, drawn as a
 * cel shaded anime figure. Hands are a small 3D rig (palm, thumb and three bone fingers)
 * projected orthographically so they foreshorten properly from any angle; hair is a seeded set
 * of tapered locks that can sweep up (blindfold) or fall over the brow (blindfold down); the
 * body is a 2D rig with a high collared uniform, folds and rim light. Plus a few shared film
 * effects: speed lines, impact frames, letterbox and subtitles.
 */

export type C = CanvasRenderingContext2D;
type Build = (c: C) => void;

/* ---------- palette ---------- */

export const SKIN = '#fde6d8';
export const SKIN_SH = '#eab7a6';
export const SKIN_DEEP = '#d0907f';
export const SKIN_INK = '#5a3134';
export const HAIR = '#f7f9ff';
export const HAIR_SH = '#c4cbe4';
export const HAIR_DEEP = '#97a0c6';
export const HAIR_INK = '#56608a';
export const CLOTH = '#1d2234';
export const CLOTH_SH = '#0c0f1b';
export const CLOTH_HI = '#39425f';
export const CLOTH_INK = '#05060c';
export const BAND = '#13141c';

export interface Light {
  /** Screen direction the key light comes from (unit vector pointing toward the light) */
  lx: number;
  ly: number;
  /** Rim light colour and strength (0 = none) */
  rim: string;
  rimK: number;
}

export const NEUTRAL: Light = { lx: -0.6, ly: -0.8, rim: '#9fc2ff', rimK: 0 };

/* ---------- path helpers ---------- */

/** Tapered capsule from (x0, y0, r0) to (x1, y1, r1) as its own subpath */
export function capsule(c: C, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(r0 - r1) + 1e-3) {
    const r = Math.max(r0, r1);
    const x = r0 > r1 ? x0 : x1;
    const y = r0 > r1 ? y0 : y1;
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, TAU);
    return;
  }
  const th = Math.atan2(dy, dx);
  const a = Math.acos(clamp((r0 - r1) / d, -1, 1));
  c.moveTo(x0 + Math.cos(th + a) * r0, y0 + Math.sin(th + a) * r0);
  c.arc(x0, y0, r0, th + a, th + TAU - a);
  c.arc(x1, y1, r1, th - a, th + a);
  c.closePath();
}

/** Closed smooth outline through flat [x, y, ...] points */
export function smooth(c: C, pts: ArrayLike<number>, close = true) {
  const n = pts.length / 2;
  if (n < 2) return;
  if (!close) {
    c.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2;
      const my = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
      c.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx, my);
    }
    c.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
    return;
  }
  c.moveTo((pts[(n - 1) * 2] + pts[0]) / 2, (pts[(n - 1) * 2 + 1] + pts[1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    c.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
  }
  c.closePath();
}

/** Polygon through flat points */
export function poly(c: C, pts: ArrayLike<number>) {
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}

/**
 * Cel shade a filled shape: a crisp shadow band on the edge away from the light (the area a
 * copy nudged toward the light does not cover) and an optional additive rim band on the lit
 * edge. Only nonzero fills and nested clips, so shapes built from overlapping parts are safe.
 */
export function celFill(c: C, build: Build, base: string | CanvasGradient, dark: string | CanvasGradient, light: Light, off: number, rimW = off * 0.5) {
  c.save();
  c.beginPath();
  build(c);
  c.clip();
  c.fillStyle = base;
  c.fillRect(-1e5, -1e5, 2e5, 2e5);
  const rim = light.rimK > 0.01 && rimW > 0.05;
  if (rim) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.min(1, light.rimK);
    c.fillStyle = light.rim;
    c.fillRect(-1e5, -1e5, 2e5, 2e5);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.translate(-light.lx * rimW, -light.ly * rimW);
    c.beginPath();
    build(c);
    c.translate(light.lx * rimW, light.ly * rimW);
    c.clip();
  }
  c.fillStyle = dark;
  c.fillRect(-1e5, -1e5, 2e5, 2e5);
  c.translate(light.lx * off, light.ly * off);
  c.beginPath();
  build(c);
  c.fillStyle = base;
  c.fill();
  c.restore();
}

/** Fill, cel shadow, rim and ink a shape in one go */
export function shade(
  c: C,
  build: Build,
  base: string | CanvasGradient,
  dark: string | CanvasGradient,
  light: Light,
  off: number,
  ink: string | null,
  lw: number,
  rimW = off * 0.5
) {
  celFill(c, build, base, dark, light, off, rimW);
  inkLine(c, build, ink, lw);
}

/** Like shade() but inked by a fat stroke under the fill: shapes built from several
 * overlapping pieces read as one clean silhouette */
export function shadeU(
  c: C,
  build: Build,
  base: string | CanvasGradient,
  dark: string | CanvasGradient,
  light: Light,
  off: number,
  ink: string,
  lw: number,
  rimW = off * 0.5
) {
  c.beginPath();
  build(c);
  c.lineJoin = 'round';
  c.strokeStyle = ink;
  c.lineWidth = lw * 2;
  c.stroke();
  celFill(c, build, base, dark, light, off, rimW);
}

function inkLine(c: C, build: Build, ink: string | null, lw: number) {
  if (ink && lw > 0) {
    c.beginPath();
    build(c);
    c.strokeStyle = ink;
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.stroke();
  }
}

/** Tapered brush stroke along a quadratic curve: sharp ends, w wide in the middle */
export function stroke(c: C, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, fill: string, alpha = 1) {
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const d = Math.hypot(nx, ny) || 1;
  const ox = (nx / d) * w;
  const oy = (ny / d) * w;
  c.globalAlpha = alpha;
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(cx + ox, cy + oy, x1, y1);
  c.quadraticCurveTo(cx - ox * 0.2, cy - oy * 0.2, x0, y0);
  c.fill();
  c.globalAlpha = 1;
}

/* ---------- 3D hand ---------- */

type V3 = [number, number, number];

export interface HandPose {
  /** index, middle, ring, little: [spread toward the thumb, knuckle, middle joint, tip joint] in radians */
  f: [number, number, number, number][];
  /** thumb: [swing out from the palm, opposition toward the palm, knuckle, tip joint] */
  th: [number, number, number, number];
}

const D = Math.PI / 180;
const fp = (sp: number, a: number, b: number, c: number): [number, number, number, number] => [sp * D, a * D, b * D, c * D];

export const HANDS = {
  relaxed: { f: [fp(2, 18, 28, 14), fp(0, 22, 34, 16), fp(-3, 26, 38, 18), fp(-7, 30, 42, 20)], th: [fp(38, 22, 14, 12)][0] },
  /** Fingers spread and softly curved, cupping a sphere */
  cup: { f: [fp(7, 22, 26, 16), fp(1, 20, 24, 14), fp(-6, 22, 26, 16), fp(-14, 26, 28, 18)], th: [fp(58, 30, 10, 14)][0] },
  /** Wide open, fingers flared back a touch */
  open: { f: [fp(9, 4, 6, 4), fp(1, 2, 4, 3), fp(-8, 4, 6, 4), fp(-17, 8, 8, 6)], th: [fp(64, 18, 4, 2)][0] },
  /** Index and middle straight, ring and little folded under the thumb */
  two: { f: [fp(3, 2, 2, 2), fp(-2, 2, 3, 2), fp(-3, 88, 100, 50), fp(-6, 92, 100, 50)], th: [fp(30, 62, 28, 22)][0] },
  /** Index pointing */
  point: { f: [fp(2, 4, 4, 2), fp(0, 84, 98, 46), fp(-3, 90, 100, 50), fp(-6, 94, 100, 50)], th: [fp(26, 58, 34, 20)][0] },
  /** The domain sign: index up, middle crossed over its back, ring and little folded */
  cross: { f: [fp(-9, 14, 8, 4), fp(18, -4, 10, 8), fp(-3, 92, 104, 50), fp(-6, 96, 104, 52)], th: [fp(26, 64, 30, 26)][0] },
  fist: { f: [fp(1, 88, 100, 60), fp(0, 90, 102, 60), fp(-2, 92, 104, 60), fp(-4, 94, 104, 60)], th: [fp(24, 60, 40, 28)][0] },
  /** Index hooked, the rest loose: pulling the blindfold */
  hook: { f: [fp(2, 34, 70, 40), fp(-1, 40, 66, 34), fp(-4, 46, 64, 32), fp(-8, 50, 62, 30)], th: [fp(36, 40, 18, 16)][0] },
} satisfies Record<string, HandPose>;

export type HandName = keyof typeof HANDS;

export function mixHand(a: HandPose, b: HandPose, k: number): HandPose {
  return {
    f: a.f.map((fa, i) => fa.map((v, j) => lerp(v, b.f[i][j], k)) as [number, number, number, number]),
    th: a.th.map((v, j) => lerp(v, b.th[j], k)) as [number, number, number, number],
  };
}

export interface HandView {
  /** Screen angle the fingers point along (0 = up) */
  roll: number;
  /** Turn about the finger axis: 0 shows the back of the hand, PI the palm */
  yaw: number;
  /** Tip the fingers toward (+) or away from the viewer */
  pitch: number;
}

// finger metrics in palm lengths: knuckle x (thumb side positive), knuckle y, bone lengths, radii
const FING = [
  { x: 0.29, y: 0.98, l: [0.45, 0.28, 0.23], r: [0.086, 0.079, 0.071, 0.06], sp: 0.07 },
  { x: 0.09, y: 1.03, l: [0.5, 0.32, 0.24], r: [0.089, 0.081, 0.073, 0.062], sp: 0 },
  { x: -0.11, y: 0.99, l: [0.47, 0.3, 0.23], r: [0.085, 0.077, 0.07, 0.059], sp: -0.06 },
  { x: -0.29, y: 0.89, l: [0.36, 0.23, 0.2], r: [0.075, 0.068, 0.062, 0.053], sp: -0.15 },
];
const PALM: [number, number][] = [
  [0.3, 0.02],
  [0.37, 0.3],
  [0.39, 0.72],
  [0.36, 0.95],
  [0.2, 1.03],
  [0.0, 1.06],
  [-0.2, 1.02],
  [-0.36, 0.92],
  [-0.39, 0.6],
  [-0.34, 0.08],
  [0, -0.03],
];

interface Part {
  z: number;
  /** capsules: x0, y0, r0, x1, y1, r1 in screen px */
  caps: number[];
  /** convex outline instead of capsules */
  hull?: number[];
  kind: 'palm' | 'finger' | 'thumb';
  nail?: { x: number; y: number; nx: number; ny: number; a: number; r: number; facing: number };
  /** joint crease positions: x, y, angle, r */
  creases: number[];
}

function hull(pts: number[]) {
  const n = pts.length / 2;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]);
  const cross = (o: number, a: number, b: number) =>
    (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  const out: number[] = [];
  for (const i of [...lower.slice(0, -1), ...upper.slice(0, -1)]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/**
 * Draw a hand. (x, y) is the wrist, s the palm length in px, side +1 for his left hand
 * (thumb on screen right when the back faces us) and -1 for his right.
 */
export interface HandInfo {
  /** Between the index and middle finger tips */
  tx: number;
  ty: number;
  /** Palm centre and the screen direction the palm faces (nz > 0: toward the viewer) */
  px: number;
  py: number;
  nx: number;
  ny: number;
  nz: number;
}

export function drawHand(c: C, x: number, y: number, s: number, side: number, pose: HandPose, view: HandView, light: Light, lw: number, skin = SKIN, dark = SKIN_SH): HandInfo {
  const cr = Math.cos(view.roll);
  const sr = Math.sin(view.roll);
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const spi = Math.sin(view.pitch);
  // local: X across (thumb side = side), Y along the fingers, Z out of the back of the hand
  const proj = (p: V3): V3 => {
    const lx = p[0] * side;
    // yaw about Y
    const x1 = lx * cy + p[2] * sy;
    const z1 = -lx * sy + p[2] * cy;
    // pitch about X
    const y2 = p[1] * cp - z1 * spi;
    const z2 = p[1] * spi + z1 * cp;
    // roll in the screen plane (fingers up = -y)
    const sx = x1 * cr + y2 * sr;
    const syy = x1 * sr - y2 * cr;
    return [x + sx * s, y + syy * s, z2];
  };
  const dirZ = (v: V3) => proj(v)[2] - proj([0, 0, 0])[2];
  const parts: Part[] = [];

  // palm: hull of the slab
  const hp: number[] = [];
  let pz = 0;
  for (const [px, py] of PALM) {
    for (const z of [-0.12, 0.12]) {
      const q = proj([px, py, z]);
      hp.push(q[0], q[1]);
      pz += q[2];
    }
  }
  const palmFacing = dirZ([0, 0, 1]);
  parts.push({ z: pz / (PALM.length * 2), caps: [], hull: hull(hp), kind: 'palm', creases: [] });

  // fingers
  let tipX = 0;
  let tipY = 0;
  FING.forEach((fm, i) => {
    const [spr, ...flex] = pose.f[i];
    const a = fm.sp + spr;
    const d: V3 = [Math.sin(a), Math.cos(a), 0];
    let p: V3 = [fm.x, fm.y, 0.02];
    let phi = 0;
    let run: Part = { z: 0, caps: [], kind: 'finger', creases: [] };
    let zs = 0;
    let zn = 0;
    const runs: Part[] = [];
    for (let k = 0; k < 3; k++) {
      const f = flex[k];
      if (k > 0 && Math.abs(f) > 0.95) {
        run.z = zs / zn;
        runs.push(run);
        run = { z: 0, caps: [], kind: 'finger', creases: [] };
        zs = 0;
        zn = 0;
      }
      phi += f;
      const dir: V3 = [d[0] * Math.cos(phi), d[1] * Math.cos(phi), -Math.sin(phi)];
      const q: V3 = [p[0] + dir[0] * fm.l[k], p[1] + dir[1] * fm.l[k], p[2] + dir[2] * fm.l[k]];
      const A = proj(p);
      const B = proj(q);
      run.caps.push(A[0], A[1], fm.r[k] * s, B[0], B[1], fm.r[k + 1] * s);
      zs += A[2] + B[2] + (k === 0 ? 0.1 : 0);
      zn += 2;
      // crease across the joint at the start of this bone
      if (k > 0) run.creases.push(A[0], A[1], Math.atan2(B[1] - A[1], B[0] - A[0]), fm.r[k] * s);
      if (k === 2 && i < 2) {
        tipX += B[0] / 2;
        tipY += B[1] / 2;
      }
      if (k === 2) {
        const n: V3 = [-d[0] * Math.sin(phi), -d[1] * Math.sin(phi), -Math.cos(phi)];
        // nail sits on the back of the tip bone, facing the -Z flexion side's opposite
        const nn: V3 = [-n[0], -n[1], -n[2]];
        const mid: V3 = [p[0] + dir[0] * fm.l[k] * 0.62, p[1] + dir[1] * fm.l[k] * 0.62, p[2] + dir[2] * fm.l[k] * 0.62];
        const M = proj(mid);
        const N = proj([mid[0] + nn[0] * fm.r[3], mid[1] + nn[1] * fm.r[3], mid[2] + nn[2] * fm.r[3]]);
        run.nail = { x: M[0], y: M[1], nx: N[0] - M[0], ny: N[1] - M[1], a: Math.atan2(B[1] - A[1], B[0] - A[0]), r: fm.r[3] * s, facing: N[2] - M[2] };
      }
      p = q;
    }
    run.z = zs / zn;
    runs.push(run);
    parts.push(...runs);
  });

  // thumb
  {
    const [sw, op, f1, f2] = pose.th;
    const base: V3 = [0.27, 0.16, -0.1];
    const dt: V3 = [Math.sin(sw) * Math.cos(op), Math.cos(sw) * Math.cos(op), -Math.sin(op)];
    // bend toward the palm centre, orthogonal to the bone
    let b: V3 = [-1, 0.1, -0.7];
    const dd = b[0] * dt[0] + b[1] * dt[1] + b[2] * dt[2];
    b = [b[0] - dd * dt[0], b[1] - dd * dt[1], b[2] - dd * dt[2]];
    const bl = Math.hypot(b[0], b[1], b[2]) || 1;
    b = [b[0] / bl, b[1] / bl, b[2] / bl];
    const L = [0.42, 0.3, 0.26];
    const R = [0.13, 0.098, 0.088, 0.073];
    let p = base;
    let phi = 0;
    const flex = [0, f1, f2];
    const meta: Part = { z: 0, caps: [], kind: 'palm', creases: [] };
    const tip: Part = { z: 0, caps: [], kind: 'thumb', creases: [] };
    for (let k = 0; k < 3; k++) {
      phi += flex[k];
      const dir: V3 = [dt[0] * Math.cos(phi) + b[0] * Math.sin(phi), dt[1] * Math.cos(phi) + b[1] * Math.sin(phi), dt[2] * Math.cos(phi) + b[2] * Math.sin(phi)];
      const q: V3 = [p[0] + dir[0] * L[k], p[1] + dir[1] * L[k], p[2] + dir[2] * L[k]];
      const A = proj(p);
      const B = proj(q);
      const part = k === 0 ? meta : tip;
      part.caps.push(A[0], A[1], R[k] * s, B[0], B[1], R[k + 1] * s);
      part.z += (A[2] + B[2]) / (k === 0 ? 2 : 4);
      if (k === 2) {
        part.creases.push(A[0], A[1], Math.atan2(B[1] - A[1], B[0] - A[0]), R[k] * s);
        const nn: V3 = [-(-dt[0] * Math.sin(phi) + b[0] * Math.cos(phi)), -(-dt[1] * Math.sin(phi) + b[1] * Math.cos(phi)), -(-dt[2] * Math.sin(phi) + b[2] * Math.cos(phi))];
        const mid: V3 = [p[0] + dir[0] * L[k] * 0.6, p[1] + dir[1] * L[k] * 0.6, p[2] + dir[2] * L[k] * 0.6];
        const M = proj(mid);
        const N = proj([mid[0] + nn[0] * R[3], mid[1] + nn[1] * R[3], mid[2] + nn[2] * R[3]]);
        part.nail = { x: M[0], y: M[1], nx: N[0] - M[0], ny: N[1] - M[1], a: Math.atan2(B[1] - A[1], B[0] - A[0]), r: R[3] * s * 1.08, facing: N[2] - M[2] };
      }
      p = q;
    }
    // the thumb's root bone is part of the palm mass
    const palm = parts[0];
    palm.caps.push(...meta.caps);
    parts.push(tip);
  }

  const P0 = proj([0, 0.55, -0.15]);
  const PN = proj([0, 0.55, -1.15]);
  const info: HandInfo = { tx: tipX, ty: tipY, px: P0[0], py: P0[1], nx: (PN[0] - P0[0]) / s, ny: (PN[1] - P0[1]) / s, nz: PN[2] - P0[2] };
  parts.sort((a, b) => a.z - b.z);
  const off = s * 0.05;
  // skin takes coloured rim light more gently than cloth
  const skinLight: Light = { ...light, rimK: light.rimK * 0.45 };
  for (const part of parts) {
    const build: Build = (g) => {
      if (part.hull) smooth(g, part.hull);
      for (let i = 0; i < part.caps.length; i += 6) capsule(g, part.caps[i], part.caps[i + 1], part.caps[i + 2], part.caps[i + 3], part.caps[i + 4], part.caps[i + 5]);
    };
    // ink as a fat stroke under the fill so overlapping bones of one part merge cleanly
    c.beginPath();
    build(c);
    c.lineJoin = 'round';
    c.strokeStyle = SKIN_INK;
    c.lineWidth = lw * 2;
    c.stroke();
    celFill(c, build, skin, dark, skinLight, off * 1.4, off * 0.7);
    // detail lines
    c.strokeStyle = SKIN_INK;
    c.lineCap = 'round';
    if (part.kind === 'palm') {
      const ctr = proj([0, 0.55, 0]);
      if (palmFacing < -0.25) {
        // palm side: two creases and the thenar fold
        c.globalAlpha = clamp(-palmFacing, 0, 1) * 0.7;
        c.lineWidth = lw * 0.7;
        c.beginPath();
        const ln = (pts: V3[]) => {
          const A = proj(pts[0]);
          const B = proj(pts[1]);
          const M = proj(pts[2]);
          c.moveTo(A[0], A[1]);
          c.quadraticCurveTo(M[0], M[1], B[0], B[1]);
        };
        ln([[-0.36, 0.72, -0.13], [0.2, 0.8, -0.13], [-0.05, 0.68, -0.13]]);
        ln([[-0.3, 0.6, -0.13], [0.33, 0.66, -0.13], [0.05, 0.5, -0.13]]);
        ln([[0.32, 0.62, -0.13], [0.12, 0.08, -0.13], [0.12, 0.38, -0.13]]);
        c.stroke();
        c.globalAlpha = 1;
      } else if (palmFacing > 0.3) {
        // back of the hand: knuckle bumps and faint tendons
        c.globalAlpha = clamp(palmFacing, 0, 1) * 0.35;
        c.lineWidth = lw * 0.6;
        c.beginPath();
        for (const fm of FING.slice(0, 3)) {
          const K = proj([fm.x, fm.y - 0.1, 0.14]);
          const T = proj([fm.x * 0.7, 0.62, 0.13]);
          c.moveTo(T[0], T[1]);
          c.lineTo(K[0], K[1]);
        }
        c.stroke();
        c.globalAlpha = clamp(palmFacing, 0, 1) * 0.9;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        for (const fm of FING.slice(0, 3)) {
          const K = proj([fm.x, fm.y - 0.02, 0.14]);
          c.beginPath();
          c.ellipse(K[0], K[1], s * 0.03, s * 0.018, view.roll, 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      }
      void ctr;
    }
    for (let i = 0; i < part.creases.length; i += 4) {
      const cx = part.creases[i];
      const cy2 = part.creases[i + 1];
      const a = part.creases[i + 2] + Math.PI / 2;
      const r = part.creases[i + 3] * 0.55;
      c.globalAlpha = 0.5;
      c.lineWidth = lw * 0.6;
      c.beginPath();
      c.moveTo(cx - Math.cos(a) * r, cy2 - Math.sin(a) * r);
      c.lineTo(cx + Math.cos(a) * r * 0.4, cy2 + Math.sin(a) * r * 0.4);
      c.stroke();
      c.globalAlpha = 1;
    }
    const n = part.nail;
    if (n && n.facing > 0.002) {
      const k = clamp(n.facing / (n.r / s) / 1.0, 0, 1);
      const nx = n.x + n.nx * 0.5;
      const ny = n.y + n.ny * 0.5;
      c.globalAlpha = 0.35 + 0.65 * k;
      c.fillStyle = '#ffeef0';
      c.strokeStyle = SKIN_DEEP;
      c.lineWidth = lw * 0.55;
      c.beginPath();
      c.ellipse(nx, ny, n.r * 0.85, n.r * (0.25 + 0.5 * k), n.a, 0, TAU);
      c.fill();
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  return info;
}

/* ---------- head ---------- */

export type Look = 'band' | 'shades' | 'bare';

export interface HeadOpts {
  /** Turn: + faces screen right, about -1..1 */
  yaw: number;
  look: Look;
  /** Blindfold 1 over the eyes, 0 pulled down to the collar */
  band: number;
  /** Hair 1 swept up, 0 fallen over the brow */
  up: number;
  /** Eyelids open 0..1 */
  open: number;
  /** Six Eyes glow 0..1 */
  glow: number;
  /** 0 neutral mouth, 1 full smirk */
  smirk: number;
  /** Sunglasses slid down the nose 0..1 */
  slide: number;
  /** Pupils look offset, -1..1 */
  gazeX: number;
  gazeY: number;
  /** Hair blown toward (wx, wy) in head units */
  wx: number;
  wy: number;
  t: number;
  light: Light;
  /** Ink width in px */
  lw: number;
}

export const headOpts = (o: Partial<HeadOpts> = {}): HeadOpts => ({
  yaw: 0,
  look: 'band',
  band: 1,
  up: 1,
  open: 1,
  glow: 0,
  smirk: 1,
  slide: 0,
  gazeX: 0,
  gazeY: 0,
  wx: 0,
  wy: 0,
  t: 0,
  light: NEUTRAL,
  lw: 1.5,
  ...o,
});

/** A lock of hair: root, angle from straight up (deg, clockwise), length, bend, root width */
type LockDef = [number, number, number, number, number, number];
interface LockPair {
  up: LockDef;
  down: LockDef;
  layer: 0 | 1 | 2;
}

// back mass, behind the head: [rx, ry, angle, length, bend, width]
const BACK_UP: LockDef[] = [
  [-36, -70, -70, 52, 0.14, 34],
  [-28, -84, -46, 66, 0.1, 40],
  [-12, -94, -20, 78, 0.06, 42],
  [6, -96, 6, 84, -0.04, 42],
  [22, -90, 30, 74, -0.08, 40],
  [34, -78, 56, 60, -0.12, 36],
  [40, -64, 82, 44, -0.16, 30],
  [-42, -58, -100, 38, 0.18, 26],
  [42, -52, 112, 30, -0.2, 22],
  [-40, -48, -130, 26, 0.2, 20],
];
const BACK_DOWN: LockDef[] = [
  [-36, -74, -92, 46, 0.14, 34],
  [-28, -88, -58, 56, 0.1, 40],
  [-12, -98, -24, 62, 0.06, 42],
  [6, -100, 8, 64, -0.04, 42],
  [22, -94, 36, 58, -0.08, 40],
  [34, -82, 68, 50, -0.12, 36],
  [40, -70, 112, 42, -0.16, 30],
  [-42, -62, -142, 44, 0.12, 26],
  [42, -58, 152, 42, -0.12, 22],
  [-40, -52, -166, 40, 0.1, 20],
];
// front locks springing off the blindfold
const FRONT_UP: LockDef[] = [
  [-34, -58, -52, 52, -0.12, 26],
  [-20, -59, -30, 66, -0.1, 28],
  [-6, -60, -10, 74, -0.05, 28],
  [8, -60, 10, 72, 0.05, 28],
  [22, -59, 30, 64, 0.1, 26],
  [34, -57, 52, 52, 0.14, 24],
  [-26, -62, -40, 52, 0.12, 18],
  [0, -62, -2, 58, 0.08, 18],
  [24, -62, 38, 52, -0.12, 18],
];
const FRONT_DOWN: LockDef[] = [
  [-32, -84, -158, 48, -0.16, 26],
  [-20, -92, -172, 52, -0.12, 28],
  [-7, -96, -178, 50, -0.06, 26],
  [7, -96, 174, 46, 0.06, 26],
  [20, -92, 166, 50, 0.1, 26],
  [32, -84, 156, 48, 0.14, 24],
  [-26, -96, -150, 34, 0.12, 18],
  [0, -100, -176, 40, 0.08, 18],
  [24, -96, 152, 34, -0.12, 18],
];
// a few strays that fall over the band
const STRAY: LockDef[] = [
  [-9, -66, -168, 15, 0.35, 3.2],
  [17, -65, 172, 11, -0.3, 2.6],
];

const LOCKS: LockPair[] = [
  ...BACK_UP.map((up, i) => ({ up, down: BACK_DOWN[i], layer: 0 as const })),
  ...FRONT_UP.map((up, i) => ({ up, down: FRONT_DOWN[i], layer: 1 as const })),
];

const lerpAng = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Build a lock outline in head units: a full belly that tapers late into a sharp curled tip.
 * With `open` the root is left unclosed so only the two long edges get inked.
 */
function lockPath(c: C, rx: number, ry: number, ang: number, len: number, bend: number, wid: number, wx: number, wy: number, sway: number, open = false) {
  const a = (ang + sway) * D;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const nx = -dy;
  const ny = dx;
  let tx = rx + dx * len + wx * len * 0.02;
  let ty = ry + dy * len + wy * len * 0.02;
  tx += nx * bend * len * 0.45;
  ty += ny * bend * len * 0.45;
  const hw = wid / 2;
  // two control points per edge: the belly stays wide, then whips into the tip
  const p1x = rx + dx * len * 0.35 + nx * bend * len * 0.15;
  const p1y = ry + dy * len * 0.35 + ny * bend * len * 0.15;
  const p2x = rx + dx * len * 0.7 + nx * bend * len * 0.45;
  const p2y = ry + dy * len * 0.7 + ny * bend * len * 0.45;
  if (!open) {
    // rounded root tucked back under the crown
    c.moveTo(rx + nx * hw, ry + ny * hw);
    c.quadraticCurveTo(rx - dx * hw * 0.9, ry - dy * hw * 0.9, rx - nx * hw, ry - ny * hw);
  } else c.moveTo(rx - nx * hw, ry - ny * hw);
  c.bezierCurveTo(p1x - nx * hw * 1.05, p1y - ny * hw * 1.05, p2x - nx * hw * 0.55, p2y - ny * hw * 0.55, tx, ty);
  c.bezierCurveTo(p2x + nx * hw * 0.35, p2y + ny * hw * 0.35, p1x + nx * hw * 0.95, p1y + ny * hw * 0.95, rx + nx * hw, ry + ny * hw);
  if (!open) c.closePath();
  return [rx, ry, p1x, p1y, tx, ty, nx, ny];
}

function lockAt(l: LockPair, up: number): LockDef {
  const a = l.down;
  const b = l.up;
  return [lerp(a[0], b[0], up), lerp(a[1], b[1], up), lerpAng(a[2], b[2], up), lerp(a[3], b[3], up), lerp(a[4], b[4], up), lerp(a[5], b[5], up)];
}

/** Map a frontal face point to the turned head (cylinder-ish face) */
function faceX(x: number, y: number, yaw: number) {
  const w = faceW(y);
  const th = yaw * 0.5;
  return x * Math.cos(th) + Math.sqrt(Math.max(0, w * w - x * x)) * 0.85 * Math.sin(th);
}

function faceW(y: number) {
  // half width of the face at height y (chin 0, crown -100)
  if (y > -6) return 4 + (-y / 6) * 7;
  if (y > -16) return 11 + ((-y - 6) / 10) * 11;
  if (y > -32) return 22 + ((-y - 16) / 16) * 9;
  if (y > -48) return 31 + ((-y - 32) / 16) * 3;
  return 34;
}

function drawLock(c: C, d: LockDef, o: HeadOpts, i: number, base: string | CanvasGradient, dark: string, ink: string, lw: number, sh: number, cast = 0) {
  const sway = Math.sin(o.t * 1.7 + i * 1.3) * 1.6 + Math.sin(o.t * 0.9 + i) * 1.2;
  let spine: number[] = [];
  const build: Build = (g) => {
    spine = lockPath(g, d[0], d[1], d[2], d[3], d[4], d[5], o.wx, o.wy, sway);
  };
  if (cast > 0) {
    // soft occlusion on whatever lies under this lock
    c.save();
    c.translate(-o.light.lx * cast, -o.light.ly * cast + cast * 0.4);
    c.beginPath();
    build(c);
    c.fillStyle = 'rgba(70,80,140,0.22)';
    c.fill();
    c.restore();
  }
  // each lock darkens toward its root, where it tucks under the others
  const a = (d[2] * Math.PI) / 180;
  const rg = c.createLinearGradient(d[0], d[1], d[0] + Math.sin(a) * d[3], d[1] - Math.cos(a) * d[3]);
  rg.addColorStop(0, HAIR_SH);
  rg.addColorStop(0.45, typeof base === 'string' ? base : HAIR);
  rg.addColorStop(1, '#ffffff');
  celFill(c, build, rg, dark, o.light, sh, sh * 0.7);
  // ink only the two long edges, the root tucks under its neighbours
  c.beginPath();
  lockPath(c, d[0], d[1], d[2], d[3], d[4], d[5], o.wx, o.wy, sway, true);
  c.strokeStyle = ink;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.stroke();
  // a fine inner strand line for texture
  const [rx, ry, mx, my, tx, ty, nx, ny] = spine;
  // strand lines hug the shaded edge, like separated clumps, never a centre vein
  const sd = nx * o.light.lx + ny * o.light.ly > 0 ? -1 : 1;
  c.globalAlpha = 0.45;
  c.lineWidth = lw * 0.5;
  c.beginPath();
  c.moveTo(lerp(rx, mx, 0.6) + nx * d[5] * 0.3 * sd, lerp(ry, my, 0.6) + ny * d[5] * 0.3 * sd);
  c.quadraticCurveTo(mx + nx * d[5] * 0.28 * sd, my + ny * d[5] * 0.28 * sd, lerp(mx, tx, 0.6) + nx * d[5] * 0.08 * sd, lerp(my, ty, 0.6) + ny * d[5] * 0.08 * sd);
  c.stroke();
  c.globalAlpha = 1;
}

/** Gojo's head with the chin at (x, y), s px per head unit (the head is 100 units tall) */
export function drawHead(c: C, x: number, y: number, s: number, tilt: number, o: HeadOpts) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(s, s);
  const lw = o.lw / s;
  const L = o.light;
  const yaw = o.yaw;
  const fx = (px: number, py: number) => faceX(px, py, yaw);
  const nose = yaw * 5;

  // back mass of hair
  LOCKS.forEach((l, i) => {
    if (l.layer !== 0) return;
    const d = lockAt(l, o.up);
    d[0] += yaw * 4;
    drawLock(c, d, o, i, HAIR, HAIR_DEEP, HAIR_INK, lw, 5, 2);
  });
  // a solid crown under the locks so no sky shows between them
  c.beginPath();
  c.ellipse(yaw * 4, lerp(-86, -80, o.up), 38, lerp(24, 28, o.up), 0, 0, TAU);
  c.fillStyle = HAIR_SH;
  c.fill();

  // ears
  for (const side of [-1, 1]) {
    const vis = 1 - side * yaw * 0.9;
    if (vis < 0.15) continue;
    const ex = fx(side * 34, -45) + side * 0.3;
    const ew = 7 * vis;
    const build: Build = (g) => {
      g.moveTo(ex, -54);
      g.quadraticCurveTo(ex + side * ew * 1.5, -60, ex + side * ew * 1.3, -46);
      g.quadraticCurveTo(ex + side * ew * 1.1, -34, ex, -30);
      g.closePath();
    };
    shade(c, build, SKIN, SKIN_SH, L, 2, SKIN_INK, lw);
    c.strokeStyle = SKIN_DEEP;
    c.lineWidth = lw * 0.8;
    c.beginPath();
    c.moveTo(ex + side * ew * 0.4, -51);
    c.quadraticCurveTo(ex + side * ew * 1.0, -50, ex + side * ew * 0.7, -38);
    c.stroke();
  }

  // neck
  const neck: Build = (g) => {
    g.moveTo(fx(-13, -14), -14);
    g.lineTo(fx(-14, -14) - 1, 40);
    g.lineTo(fx(14, -14) + 1, 40);
    g.lineTo(fx(13, -14), -14);
    g.closePath();
  };
  shade(c, neck, SKIN, SKIN_SH, L, 5, SKIN_INK, lw);
  // the jaw throws a hard shadow down the neck
  c.save();
  c.beginPath();
  neck(c);
  c.clip();
  c.fillStyle = SKIN_SH;
  c.beginPath();
  c.moveTo(-20, -14);
  c.lineTo(20, -14);
  c.lineTo(20, 2);
  c.quadraticCurveTo(yaw * 6, 14, -20, 4);
  c.closePath();
  c.fill();
  c.restore();

  // face
  const face: Build = (g) => {
    const pts: number[] = [];
    const prof: [number, number][] = [
      [-34, -72],
      [-34.5, -58],
      [-34, -46],
      [-31, -32],
      [-23, -17],
      [-12, -6.5],
      [-4, -0.8],
      [0, 0],
      [4, -0.8],
      [12, -6.5],
      [23, -17],
      [31, -32],
      [34, -46],
      [34.5, -58],
      [34, -72],
      [28, -92],
      [0, -102],
      [-28, -92],
    ];
    for (const [px, py] of prof) pts.push(py > -75 ? fx(px, py) + (px === 0 ? nose * 0.4 : 0) : px + yaw * 4, py);
    smooth(g, pts);
  };
  shade(c, face, SKIN, SKIN_SH, L, 2.6, SKIN_INK, lw * 1.1, 1.6);

  // shadow the hair throws on the brow
  if (o.up < 0.98 || o.look !== 'band') {
    c.save();
    c.beginPath();
    face(c);
    c.clip();
    c.fillStyle = SKIN_SH;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(-40, -100);
    const k = 1 - o.up;
    const brow = lerp(-74, -55, k);
    for (let i = 0; i <= 8; i++) {
      const px = -40 + i * 10;
      c.lineTo(px + yaw * 3, brow + (i % 2 ? 6 * k : 0) - Math.abs(px) * 0.08);
    }
    c.lineTo(40, -100);
    c.closePath();
    c.fill();
    c.restore();
    c.globalAlpha = 1;
  }

  // nose
  c.strokeStyle = SKIN_INK;
  c.lineCap = 'round';
  c.lineWidth = lw * 0.9;
  c.beginPath();
  const nx0 = fx(0, -28) + nose;
  c.moveTo(nx0 + 1.2, -34);
  c.quadraticCurveTo(nx0 + 3.2, -28.5, nx0 + 0.6, -26.5);
  c.stroke();
  c.fillStyle = SKIN_SH;
  c.beginPath();
  c.moveTo(nx0 - 3, -26.8);
  c.quadraticCurveTo(nx0 - 0.5, -25.4, nx0 + 0.8, -26.4);
  c.lineTo(nx0 - 0.5, -27.5);
  c.closePath();
  c.fill();

  // a touch of colour on the cheeks and a soft shadow down the side of the nose
  for (const side of [-1, 1]) {
    const bx = fx(side * 21, -33);
    const bg = c.createRadialGradient(bx, -33, 0, bx, -33, 9);
    bg.addColorStop(0, 'rgba(255,140,140,0.22)');
    bg.addColorStop(1, 'rgba(255,140,140,0)');
    c.fillStyle = bg;
    c.fillRect(bx - 10, -43, 20, 20);
  }
  c.strokeStyle = 'rgba(208,144,127,0.5)';
  c.lineWidth = lw * 1.4;
  c.beginPath();
  c.moveTo(nx0 - 2.5 * Math.sign(L.lx || 1), -44);
  c.quadraticCurveTo(nx0 - 2.8 * Math.sign(L.lx || 1), -36, nx0 - 1.5 * Math.sign(L.lx || 1), -31);
  c.stroke();

  // mouth: a confident smirk, the right corner pulled up
  {
    const mx = fx(0, -15) + nose * 0.6;
    const sm = o.smirk;
    c.lineWidth = lw * 1.05;
    c.strokeStyle = SKIN_INK;
    c.beginPath();
    c.moveTo(mx - 7.5, -15.2 + sm * 0.4);
    c.quadraticCurveTo(mx - 1, -14.2 + sm * 0.6, mx + 7.5, -15.6 - sm * 2.6);
    c.stroke();
    c.lineWidth = lw * 0.8;
    c.beginPath();
    c.moveTo(mx + 7.5, -15.6 - sm * 2.6);
    c.lineTo(mx + 9, -14.4 - sm * 2.2);
    c.stroke();
    c.globalAlpha = 0.45;
    c.beginPath();
    c.moveTo(mx - 2.6, -11.6);
    c.quadraticCurveTo(mx + 0.5, -10.8, mx + 3, -11.8);
    c.stroke();
    c.globalAlpha = 1;
  }

  // eyes, brows
  const showEyes = o.look !== 'band' || o.band < 0.99;
  if (showEyes) {
    for (const side of [-1, 1]) drawEye(c, fx(side * 14.5, -46), -46, side, (fx(side * 14.5 + 1, -46) - fx(side * 14.5 - 1, -46)) / 2, o, lw);
    // brows
    for (const side of [-1, 1]) {
      const bx = fx(side * 16, -58);
      const k = (fx(side * 16 + 1, -58) - fx(side * 16 - 1, -58)) / 2;
      const lift = o.glow * 1.5;
      const build: Build = (g) => {
        g.moveTo(bx - side * 9 * k, -60 - lift * 0.3);
        g.quadraticCurveTo(bx, -63 - lift, bx + side * 12 * k, -59.5 - lift * 0.6);
        g.quadraticCurveTo(bx + side * 1 * k, -60.8 - lift, bx - side * 9 * k, -60 - lift * 0.3);
        g.closePath();
      };
      c.beginPath();
      build(c);
      c.fillStyle = HAIR;
      c.fill();
      c.strokeStyle = HAIR_INK;
      c.lineWidth = lw * 0.7;
      c.stroke();
    }
  }

  // front hair
  const frontHair = () =>
    LOCKS.forEach((l, i) => {
    if (l.layer !== 1) return;
    const d = lockAt(l, o.look === 'band' ? Math.max(o.up, 0) : o.up);
    d[0] += yaw * 7 * (1 - Math.abs(d[0]) / 60);
    drawLock(c, d, o, i, HAIR, HAIR_SH, HAIR_INK, lw, 3.6, 3);
  });
  // with the band up the hair springs out from under it; once it slips, the hair falls over it
  const hairFirst = o.look === 'band' && o.band > 0.85;
  if (hairFirst) frontHair();

  // blindfold
  if (o.look === 'band') {
    const k = o.band;
    const dy = (1 - k) * 58;
    // the cloth narrows as it slips down over the jaw
    const shrink = 1 - (1 - k) * 0.18;
    const top = -64 + dy;
    const bot = -37 + dy + (1 - k) * 8;
    const bandB: Build = (g) => {
      const lx = fx(-36 * shrink, top) - 1.5;
      const rx2 = fx(36 * shrink, top) + 1.5;
      const rb = fx(34.5 * shrink, bot) + 1.2;
      const lb = fx(-34.5 * shrink, bot) - 1.2;
      g.moveTo(lx + 1.5, top + 2.5);
      g.quadraticCurveTo(fx(0, top) + nose * 0.5, top - 2.5, rx2 - 1.5, top + 2.5);
      // the ends round off as the cloth wraps behind the head
      g.quadraticCurveTo(rx2 + 2.2, (top + bot) / 2, rb - 1, bot - 1.5);
      g.quadraticCurveTo(fx(0, bot) + nose * 0.6, bot + 3 - (1 - k) * 6, lb + 1, bot - 1.5);
      g.quadraticCurveTo(lx - 2.2, (top + bot) / 2, lx + 1.5, top + 2.5);
      g.closePath();
    };
    const bg = c.createLinearGradient(0, top, 0, bot);
    bg.addColorStop(0, '#2a2c38');
    bg.addColorStop(0.35, BAND);
    bg.addColorStop(1, '#07070b');
    shade(c, bandB, bg, '#050508', L, 2.5, '#000', lw * 1.1, 1.4);
    // folds where the cloth wraps the temples and a soft sheen
    c.strokeStyle = 'rgba(120,130,170,0.35)';
    c.lineWidth = lw * 0.9;
    c.beginPath();
    for (const side of [-1, 1]) {
      const ex = fx(side * 27, top);
      c.moveTo(ex, top + 5);
      c.quadraticCurveTo(ex + side * 4, (top + bot) / 2, ex + side * 2, bot - 4);
    }
    c.stroke();
    c.strokeStyle = 'rgba(190,200,240,0.18)';
    c.lineWidth = lw * 2.2;
    c.beginPath();
    c.moveTo(fx(-24, top) , top + 6);
    c.quadraticCurveTo(fx(0, top) + nose * 0.5, top + 3, fx(20, top), top + 6);
    c.stroke();
  }

  // round sunglasses
  if (o.look === 'shades') {
    const dy = o.slide * 11;
    for (const side of [-1, 1]) {
      const ex = fx(side * 14.5, -46);
      const k = (fx(side * 14.5 + 1, -46) - fx(side * 14.5 - 1, -46)) / 2;
      const cy = -46 + dy;
      const lens: Build = (g) => g.ellipse(ex, cy, 10.5 * k, 10, 0, 0, TAU);
      const lg = c.createLinearGradient(ex - 8, cy - 10, ex + 8, cy + 10);
      lg.addColorStop(0, '#2c3246');
      lg.addColorStop(0.45, '#07080d');
      lg.addColorStop(1, '#141826');
      c.beginPath();
      lens(c);
      c.fillStyle = lg;
      c.fill();
      c.strokeStyle = '#05060a';
      c.lineWidth = lw * 2.4;
      c.stroke();
      c.strokeStyle = 'rgba(210,220,255,0.6)';
      c.lineWidth = lw * 0.6;
      c.beginPath();
      c.ellipse(ex, cy, 10.5 * k, 10, 0, Math.PI * 1.1, Math.PI * 1.45);
      c.stroke();
      // reflection streak
      c.fillStyle = 'rgba(200,215,255,0.22)';
      c.beginPath();
      c.moveTo(ex - 6 * k, cy - 3);
      c.lineTo(ex - 1 * k, cy - 8);
      c.lineTo(ex + 1.5 * k, cy - 6);
      c.lineTo(ex - 3.5 * k, cy - 1);
      c.closePath();
      c.fill();
      // temple arm toward the ear
      c.strokeStyle = '#0a0b10';
      c.lineWidth = lw * 1.6;
      c.beginPath();
      c.moveTo(ex + side * 10.5 * k, cy - 2);
      c.lineTo(fx(side * 34, -48) + side * 0.5, -49 + dy * 0.3);
      c.stroke();
    }
    c.strokeStyle = '#0a0b10';
    c.lineWidth = lw * 1.4;
    c.beginPath();
    c.moveTo(fx(-5, -48) , -48 + dy);
    c.quadraticCurveTo(fx(0, -48) + nose * 0.8, -51 + dy, fx(5, -48), -48 + dy);
    c.stroke();
  }

  if (!hairFirst) frontHair();
  if (o.look === 'band' && o.band > 0.9) {
    STRAY.forEach((d, i) => {
      const dd: LockDef = [d[0] + yaw * 6, d[1], d[2], d[3], d[4], d[5]];
      drawLock(c, dd, o, i + 40, HAIR, HAIR_SH, HAIR_INK, lw * 0.8, 1.2);
    });
  }
  c.restore();
}

function drawEye(c: C, ex: number, ey: number, side: number, k: number, o: HeadOpts, lw: number) {
  const open = clamp(o.open, 0, 1);
  if (k < 0.15) return;
  const w = 11 * k;
  // eye outline: inner corner toward the nose (-side), outer corner out
  const ix = ex - side * w * 0.95;
  const ox = ex + side * w * 1.0;
  const lidTop = ey - 6.2 * open;
  const lidBot = ey + 4.2 * open;
  const eyeB: Build = (g) => {
    g.moveTo(ix, ey + 0.8);
    g.bezierCurveTo(ex - side * w * 0.5, lidTop - 0.5, ex + side * w * 0.45, lidTop - 0.8, ox, ey - 1.6 * open);
    g.bezierCurveTo(ex + side * w * 0.6, lidBot + 0.2, ex - side * w * 0.4, lidBot + 0.6, ix, ey + 0.8);
    g.closePath();
  };
  if (open > 0.05) {
    c.save();
    c.beginPath();
    eyeB(c);
    c.fillStyle = '#ffffff';
    c.fill();
    c.clip();
    // lid shadow on the white
    const lg = c.createLinearGradient(0, lidTop - 1, 0, ey + 1);
    lg.addColorStop(0, 'rgba(130,150,210,0.6)');
    lg.addColorStop(1, 'rgba(130,150,210,0)');
    c.fillStyle = lg;
    c.fillRect(ex - 14, lidTop - 2, 28, ey - lidTop + 3);
    // iris
    const gx = ex + o.gazeX * 2.2 * k;
    const gy = ey - 0.6 + o.gazeY * 1.5;
    const ir = 6.6;
    const ig = c.createRadialGradient(gx, gy + 0.5, 0.3, gx, gy, ir);
    ig.addColorStop(0, '#f2ffff');
    ig.addColorStop(0.22, '#a6f1ff');
    ig.addColorStop(0.55, '#3cb6f5');
    ig.addColorStop(0.82, '#1767d0');
    ig.addColorStop(1, '#0b2c78');
    c.fillStyle = ig;
    c.beginPath();
    c.ellipse(gx, gy, ir * k * 0.92, ir, 0, 0, TAU);
    c.fill();
    // crystalline spokes
    c.lineWidth = Math.min(lw * 0.5, 0.45);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + 0.15;
      const r0 = 1.9;
      const r1 = i % 2 ? 5.2 : 4.1;
      c.strokeStyle = i % 2 ? 'rgba(220,255,255,0.75)' : 'rgba(10,60,150,0.55)';
      c.beginPath();
      c.moveTo(gx + Math.cos(a) * r0 * k, gy + Math.sin(a) * r0);
      c.lineTo(gx + Math.cos(a) * r1 * k, gy + Math.sin(a) * r1);
      c.stroke();
    }
    c.strokeStyle = 'rgba(190,250,255,0.7)';
    c.lineWidth = 0.35;
    c.beginPath();
    c.ellipse(gx, gy, 3.3 * k, 3.4, 0, 0, TAU);
    c.stroke();
    // shadow of the upper lid on the iris
    const sg = c.createLinearGradient(0, gy - ir, 0, gy);
    sg.addColorStop(0, 'rgba(8,28,90,0.8)');
    sg.addColorStop(1, 'rgba(8,28,90,0)');
    c.fillStyle = sg;
    c.fillRect(gx - 8, gy - ir - 1, 16, ir + 1);
    // pupil
    c.fillStyle = '#082261';
    c.beginPath();
    c.ellipse(gx, gy, 1.5 * k, 1.7, 0, 0, TAU);
    c.fill();
    // highlights
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(gx - 2.2 * k, gy - 2.3, 1.55 * k, 1.35, -0.4, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(gx + 2.4 * k, gy + 2.2, 0.7, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(200,255,255,0.9)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(gx, gy, 4.6, 0.6, 2.4);
    c.stroke();
    c.restore();
  }
  // lid lines and white lashes
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#3b4262';
  c.lineWidth = Math.max(lw * 1.5, 0.75);
  c.beginPath();
  c.moveTo(ix, ey + 0.8);
  c.bezierCurveTo(ex - side * w * 0.5, lidTop - 0.5, ex + side * w * 0.45, lidTop - 0.8, ox, ey - 1.6 * open);
  c.stroke();
  // lashes: tapered white flicks outlined in lilac grey
  const lash = (x0: number, y0: number, x1: number, y1: number, wd: number) => {
    const cx = (x0 + x1) / 2 + side * 0.6;
    const cy = (y0 + y1) / 2 - 0.8;
    stroke(c, x0, y0, cx, cy, x1, y1, wd + 0.5, HAIR_INK);
    stroke(c, x0, y0, cx, cy, x1, y1, wd, '#ffffff');
  };
  const topY = lidTop - 0.6;
  lash(ex - side * w * 0.45, topY + 0.3, ex - side * w * 0.05, topY - 3.4, 0.8);
  lash(ex - side * w * 0.1, topY - 0.2, ex + side * w * 0.5, topY - 4.2, 1.1);
  lash(ex + side * w * 0.3, topY, ex + side * w * 1.2, topY - 2.6, 1.3);
  lash(ex + side * w * 0.65, ey - 2.6 * open, ex + side * w * 1.7, ey - 3.2, 1.4);
  lash(ex + side * w * 0.85, ey - 1.6 * open, ex + side * w * 1.65, ey + 0.4, 1.0);
  // thick white upper lash line over the dark lid line
  c.strokeStyle = '#f5f7ff';
  c.lineWidth = Math.max(lw * 0.9, 1.1);
  c.beginPath();
  c.moveTo(ex - side * w * 0.3, lidTop - 0.4);
  c.bezierCurveTo(ex + side * w * 0.1, lidTop - 1.4, ex + side * w * 0.5, lidTop - 1.2, ox, ey - 1.8 * open);
  c.stroke();
  // crease above, lower lid and lower lashes
  c.strokeStyle = SKIN_DEEP;
  c.lineWidth = lw * 0.6;
  c.beginPath();
  c.moveTo(ex - side * w * 0.4, lidTop - 2.6);
  c.quadraticCurveTo(ex + side * w * 0.3, lidTop - 3.8, ex + side * w * 0.9, lidTop - 1.8);
  c.stroke();
  if (open > 0.1) {
    c.strokeStyle = '#8c93b4';
    c.lineWidth = lw * 0.6;
    c.beginPath();
    c.moveTo(ex - side * w * 0.2, lidBot + 0.5);
    c.quadraticCurveTo(ex + side * w * 0.5, lidBot + 0.6, ox - side * 0.5, ey - 0.8);
    c.stroke();
    lash(ex + side * w * 0.55, lidBot, ex + side * w * 0.8, lidBot + 1.6, 0.4);
  }
  if (o.glow > 0.01 && open > 0.05) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(ex, ey, 0, ex, ey, 16);
    g.addColorStop(0, `rgba(90,190,255,${0.32 * o.glow})`);
    g.addColorStop(0.4, `rgba(50,130,255,${0.16 * o.glow})`);
    g.addColorStop(1, 'rgba(40,90,255,0)');
    c.fillStyle = g;
    c.fillRect(ex - 16, ey - 16, 32, 32);
    c.restore();
  }
}

/* ---------- body ---------- */

export interface ArmPose {
  /** Wrist target relative to the shoulder, body units (the head is 100 tall) */
  hx: number;
  hy: number;
  /** Elbow bend side, +1 or -1 */
  bend: number;
  hand: HandPose;
  /** Added to the forearm's own direction */
  roll: number;
  yaw: number;
  pitch: number;
  /** Draw this arm behind the torso */
  back?: boolean;
  /** Hand tucked in the trouser pocket */
  pocket?: boolean;
  /** Screen roll of the hand regardless of the forearm (fingers up = 0) */
  aroll?: number;
  /** Draw this arm over the head (a hand at the face) */
  top?: boolean;
}

export interface LegPose {
  /** Ankle relative to the hip joint */
  fx: number;
  fy: number;
  bend: number;
  /** 0 foot flat on the ground, 1 toes pointed (floating) */
  point: number;
}

export interface GojoPose {
  /** Upper body lean around the hips (radians) */
  lean: number;
  /** Body turned toward screen right (+) or left (-), about -1..1 */
  turn: number;
  head: HeadOpts;
  headTilt: number;
  /** His left arm (screen right when he faces us) and his right */
  armL: ArmPose;
  armR: ArmPose;
  legL: LegPose;
  legR: LegPose;
  /** Jacket hem lifted by wind or motion, -1..1 */
  flow: number;
  light: Light;
  /** Ink width in px */
  lw: number;
}

// inverse of the rig's base transform while drawGojo runs, so outputs come back in rig units
let inv = new DOMMatrix();

export interface GojoOut {
  /** Wrists and palm centres in rig units (feet at the origin), plus the chin */
  lwx: number;
  lwy: number;
  rwx: number;
  rwy: number;
  lpx: number;
  lpy: number;
  rpx: number;
  rpy: number;
  cx: number;
  cy: number;
  /** Finger tips and palm facing per hand (rig units / unit vector) */
  ltx: number;
  lty: number;
  rtx: number;
  rty: number;
  lnx: number;
  lny: number;
  rnx: number;
  rny: number;
}

export const arm = (hx: number, hy: number, hand: HandPose, roll = 0, yaw = 0, pitch = 0, bend = 1, back = false, pocket = false): ArmPose => ({ hx, hy, bend, hand, roll, yaw, pitch, back, pocket });
/** Same arm with an absolute hand roll */
export const fixed = (a: ArmPose, roll: number, top = false): ArmPose => ({ ...a, aroll: roll, top });
export const leg = (fx: number, fy: number, bend = 1, point = 0): LegPose => ({ fx, fy, bend, point });

export function mixArm(a: ArmPose, b: ArmPose, k: number): ArmPose {
  return {
    hx: lerp(a.hx, b.hx, k),
    hy: lerp(a.hy, b.hy, k),
    bend: k < 0.5 ? a.bend : b.bend,
    hand: mixHand(a.hand, b.hand, k),
    roll: lerp(a.roll, b.roll, k),
    yaw: lerp(a.yaw, b.yaw, k),
    pitch: lerp(a.pitch, b.pitch, k),
    back: k < 0.5 ? a.back : b.back,
    pocket: k < 0.5 ? a.pocket : b.pocket,
    top: k < 0.5 ? a.top : b.top,
    aroll: a.aroll !== undefined && b.aroll !== undefined ? lerp(a.aroll, b.aroll, k) : k < 0.5 ? a.aroll : b.aroll,
  };
}

const UPPER = 142;
const FORE = 128;
const THIGH = 196;
const SHIN = 186;
const PALM_LEN = 46;

function ik(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, side: number) {
  let dx = hx - sx;
  let dy = hy - sy;
  let d = Math.hypot(dx, dy) || 1e-4;
  const reach = l1 + l2 - 0.5;
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
    d = reach;
  }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + a * side;
  return [sx + Math.cos(base) * l1, sy + Math.sin(base) * l1, sx + dx, sy + dy];
}

/**
 * Organic two bone limb outline through root, joint and end: five stations along the bones,
 * each with its own half width on the +normal (a) and -normal (b) side.
 */
function limbPath(g: C, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, ra: number[], rb: number[]) {
  const a1 = Math.atan2(y1 - y0, x1 - x0);
  const a2 = Math.atan2(y2 - y1, x2 - x1);
  let da = a2 - a1;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  const am = a1 + da / 2;
  const st: [number, number, number][] = [
    [x0, y0, a1],
    [lerp(x0, x1, 0.5), lerp(y0, y1, 0.5), a1],
    [x1, y1, am],
    [lerp(x1, x2, 0.5), lerp(y1, y2, 0.5), a2],
    [x2, y2, a2],
  ];
  const pts: number[] = [];
  st.forEach(([x, y, a], i) => {
    // the outside of a bent joint stretches, so push it out a little more
    const k = i === 2 ? Math.min(1.25, 1 / Math.max(0.55, Math.cos(da / 2))) : 1;
    pts.push(x + Math.cos(a + Math.PI / 2) * ra[i] * k, y + Math.sin(a + Math.PI / 2) * ra[i] * k);
  });
  // flat end at the cuff
  pts.push(x2 + Math.cos(a2) * 1.5 + Math.cos(a2 + Math.PI / 2) * ra[4] * 0.6, y2 + Math.sin(a2) * 1.5 + Math.sin(a2 + Math.PI / 2) * ra[4] * 0.6);
  pts.push(x2 + Math.cos(a2) * 1.5 - Math.cos(a2 + Math.PI / 2) * rb[4] * 0.6, y2 + Math.sin(a2) * 1.5 - Math.sin(a2 + Math.PI / 2) * rb[4] * 0.6);
  for (let i = 4; i >= 0; i--) {
    const [x, y, a] = st[i];
    const k = i === 2 ? 0.8 : 1;
    pts.push(x - Math.cos(a + Math.PI / 2) * rb[i] * k, y - Math.sin(a + Math.PI / 2) * rb[i] * k);
  }
  // round back past the root
  pts.push(x0 - Math.cos(a1) * Math.max(ra[0], rb[0]) * 0.8, y0 - Math.sin(a1) * Math.max(ra[0], rb[0]) * 0.8);
  smooth(g, pts);
}

/** Map a frontal body x to the turned body: the far side narrows, the centre slides */
const turnX = (x: number, turn: number) => x * (1 - 0.2 * turn * Math.sign(x) * Math.min(1, Math.abs(x) / 30)) + turn * 10;

function drawArm(c: C, sx: number, sy: number, a: ArmPose, side: number, p: GojoPose, lw: number, out: GojoOut, t: DOMMatrix) {
  const [ex, ey, wx, wy] = ik(sx, sy, sx + a.hx, sy + a.hy, UPPER, FORE, a.bend);
  const L = p.light;
  const sleeve: Build = (g) => {
    // outside of the arm is the +normal side when the elbow bends that way
    const o = a.bend > 0;
    const out = [27, 22, 19, 18, 17];
    const inn = [22, 19, 17, 16, 16.5];
    limbPath(g, sx, sy, ex, ey, wx, wy, o ? inn : out, o ? out : inn);
  };
  // hand first when it points back into the sleeve, otherwise after
  const fa = Math.atan2(wy - ey, wx - ex);
  const handX = wx + Math.cos(fa) * 4;
  const handY = wy + Math.sin(fa) * 4;
  const view: HandView = { roll: a.aroll ?? fa + Math.PI / 2 + a.roll, yaw: a.yaw, pitch: a.pitch };
  shadeU(c, sleeve, CLOTH, CLOTH_SH, L, 8, CLOTH_INK, lw * 1.2, 4);
  // folds: zig zags inside the elbow, a spiral on the forearm
  const bx = Math.cos(fa + Math.PI / 2);
  const by = Math.sin(fa + Math.PI / 2);
  const ua = Math.atan2(ey - sy, ex - sx);
  const inner = a.bend * side > 0 ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const k = 0.2 + i * 0.17;
    const px = lerp(ex, wx, k);
    const py = lerp(ey, wy, k);
    stroke(c, px - bx * 13 * inner, py - by * 13 * inner, px + Math.cos(fa) * 8, py + Math.sin(fa) * 8, px + bx * 6 * inner, py + by * 6 * inner, 2.2, CLOTH_INK, 0.85);
  }
  for (let i = 0; i < 2; i++) {
    const k = 0.55 + i * 0.2;
    const px = lerp(sx, ex, k);
    const py = lerp(sy, ey, k);
    const nx = Math.cos(ua + Math.PI / 2);
    const ny = Math.sin(ua + Math.PI / 2);
    stroke(c, px - nx * 16, py - ny * 16, px + Math.cos(ua) * 10, py + Math.sin(ua) * 10, px + nx * 4, py + ny * 4, 2.4, CLOTH_INK, 0.8);
    stroke(c, px - nx * 14 + Math.cos(ua) * 4, py - ny * 14 + Math.sin(ua) * 4, px + Math.cos(ua) * 13, py + Math.sin(ua) * 13, px + nx * 2 + Math.cos(ua) * 4, py + ny * 2 + Math.sin(ua) * 4, 1.2, CLOTH_HI, 0.7);
  }
  // cuff
  c.strokeStyle = CLOTH_INK;
  c.lineWidth = lw * 1.1;
  c.beginPath();
  const cxp = lerp(ex, wx, 0.86);
  const cyp = lerp(ey, wy, 0.86);
  c.moveTo(cxp - bx * 16, cyp - by * 16);
  c.quadraticCurveTo(cxp + Math.cos(fa) * 3, cyp + Math.sin(fa) * 3, cxp + bx * 16, cyp + by * 16);
  c.stroke();
  if (a.pocket) {
    c.strokeStyle = CLOTH_INK;
    c.lineWidth = lw * 1.4;
    c.beginPath();
    c.moveTo(wx - 4, wy - 18);
    c.quadraticCurveTo(wx + side * 10, wy + 4, wx + side * 4, wy + 26);
    c.stroke();
  }
  const info = a.pocket ? null : drawHand(c, handX, handY, PALM_LEN, side, a.hand, view, L, lw);
  const map = (px: number, py: number) => inv.transformPoint(t.transformPoint(new DOMPoint(px, py)));
  const W = map(handX, handY);
  const palm = info ? map(info.px, info.py) : W;
  const tip = info ? map(info.tx, info.ty) : W;
  const nrm = info ? map(info.px + info.nx * 10, info.py + info.ny * 10) : W;
  const nl = Math.hypot(nrm.x - palm.x, nrm.y - palm.y) || 1;
  if (side > 0) {
    out.lwx = W.x;
    out.lwy = W.y;
    out.lpx = palm.x;
    out.lpy = palm.y;
    out.ltx = tip.x;
    out.lty = tip.y;
    out.lnx = (nrm.x - palm.x) / nl;
    out.lny = (nrm.y - palm.y) / nl;
  } else {
    out.rwx = W.x;
    out.rwy = W.y;
    out.rpx = palm.x;
    out.rpy = palm.y;
    out.rtx = tip.x;
    out.rty = tip.y;
    out.rnx = (nrm.x - palm.x) / nl;
    out.rny = (nrm.y - palm.y) / nl;
  }
}

function drawLeg(c: C, hx: number, hy: number, lp: LegPose, side: number, p: GojoPose, lw: number) {
  const [kx, ky, ax, ay] = ik(hx, hy, hx + lp.fx, hy + lp.fy, THIGH, SHIN, lp.bend * -side);
  const L = p.light;
  // shoe
  // shoe: a toe that points out to his side and, floating, down
  const pt = lp.point;
  const shoe: Build = (g) => {
    const tx2 = ax + side * lerp(22, 8, pt) + p.turn * 10;
    const ty2 = ay + lerp(20, 40, pt);
    capsule(g, ax - side * 4, ay + 10, 17, tx2, ty2, lerp(13, 11, pt));
  };
  shadeU(c, shoe, '#171820', '#050508', L, 4, '#000', lw, 2.5);
  const pants: Build = (g) => {
    const o = lp.bend * -side > 0;
    const out = [44, 39, 35, 34, 35];
    const inn = [36, 33, 31, 31, 33];
    limbPath(g, hx, hy - 12, kx, ky, ax, ay + 4, o ? inn : out, o ? out : inn);
  };
  shadeU(c, pants, CLOTH, CLOTH_SH, L, 10, CLOTH_INK, lw * 1.2, 5);
  // knee folds and the break above the shoe
  const la = Math.atan2(ay - ky, ax - kx);
  const nx = Math.cos(la + Math.PI / 2);
  const ny = Math.sin(la + Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    const px = lerp(kx, ax, 0.05 + i * 0.13);
    const py = lerp(ky, ay, 0.05 + i * 0.13);
    stroke(c, px - nx * 20, py - ny * 20, px + Math.cos(la) * 12, py + Math.sin(la) * 12, px + nx * 8, py + ny * 8, 2.6, CLOTH_INK, 0.85);
  }
  for (let i = 0; i < 2; i++) {
    const px = lerp(kx, ax, 0.82 + i * 0.08);
    const py = lerp(ky, ay, 0.82 + i * 0.08);
    stroke(c, px - nx * 22, py - ny * 22, px - Math.cos(la) * 6, py - Math.sin(la) * 6, px + nx * 20, py + ny * 20, 2, CLOTH_INK, 0.8);
  }
  const ta = Math.atan2(ky - hy, kx - hx);
  stroke(c, lerp(hx, kx, 0.3) + side * 6, lerp(hy, ky, 0.3), lerp(hx, kx, 0.6) + Math.cos(ta + 1.57) * 10, lerp(hy, ky, 0.6), lerp(hx, kx, 0.92), lerp(hy, ky, 0.92), 2.4, CLOTH_INK, 0.7);
  stroke(c, lerp(hx, kx, 0.35) - side * 14, lerp(hy, ky, 0.35), lerp(hx, kx, 0.65) - side * 10, lerp(hy, ky, 0.65), lerp(hx, kx, 0.9) - side * 16, lerp(hy, ky, 0.9), 1.4, CLOTH_HI, 0.6);
}

/**
 * Gojo standing (or floating) with his feet centred on (x, y), s px per body unit; the head is
 * 100 units tall and he stands about 860 units including the hair. Fills `out` with where his
 * hands ended up, for orbs and effects.
 */
export function drawGojo(c: C, x: number, y: number, s: number, p: GojoPose, out: GojoOut) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  inv = c.getTransform().inverse();
  const lw = p.lw / s;
  const L = p.light;
  const turn = p.turn;
  const tx = (v: number) => turnX(v, turn);

  // legs in the hip frame
  const hipY = -392;
  const legOrder: [LegPose, number][] = turn >= 0 ? [[p.legR, -1], [p.legL, 1]] : [[p.legL, 1], [p.legR, -1]];
  for (const [lp, side] of legOrder) drawLeg(c, tx(side * 30), hipY, lp, side, p, lw);

  // upper body leans around the hips
  c.translate(0, hipY);
  c.rotate(p.lean);
  c.translate(0, -hipY);
  const t = c.getTransform();

  const shL = { x: tx(76), y: -638 };
  const shR = { x: tx(-76), y: -638 };
  if (p.armL.back) drawArm(c, shL.x, shL.y, p.armL, 1, p, lw, out, t);
  if (p.armR.back) drawArm(c, shR.x, shR.y, p.armR, -1, p, lw, out, t);

  // jacket
  const fl = p.flow;
  const torsoPts: [number, number][] = [
    [-26, -678],
    [-66, -664],
    [-90, -640],
    [-84, -596],
    [-74, -556],
    [-58, -486],
    [-62, -430],
    [-74 - fl * 12, -348],
    [-74 - fl * 12, -348],
    [-74 - fl * 12, -348],
    [-36, -344 - fl * 6],
    [0, -346],
    [36, -344 + fl * 6],
    [74 + fl * 12, -348],
    [74 + fl * 12, -348],
    [74 + fl * 12, -348],
    [62, -430],
    [58, -486],
    [74, -556],
    [84, -596],
    [90, -640],
    [66, -664],
    [26, -678],
  ];
  const torso: Build = (g) => {
    const pts: number[] = [];
    for (const [px, py] of torsoPts) pts.push(tx(px), py);
    smooth(g, pts);
  };
  const jg = c.createLinearGradient(tx(-80), 0, tx(80), 0);
  jg.addColorStop(0, CLOTH);
  jg.addColorStop(0.5, '#222840');
  jg.addColorStop(1, CLOTH);
  shadeU(c, torso, jg, CLOTH_SH, L, 13, CLOTH_INK, lw * 1.2, 5);
  const cx0 = tx(0);
  // centre placket and its shadow
  c.strokeStyle = CLOTH_INK;
  c.lineWidth = lw * 1.2;
  c.beginPath();
  c.moveTo(cx0 + 2, -676);
  c.quadraticCurveTo(cx0 + 4, -500, cx0 + 3, -350);
  c.stroke();
  stroke(c, cx0 + 5, -660, cx0 + 9, -500, cx0 + 6, -360, 2.5, CLOTH_SH, 0.9);
  // tension folds from the armpits, gathers at the waist, drape on the skirt
  stroke(c, tx(-70), -596, tx(-48), -556, tx(-26), -508, 3, CLOTH_INK, 0.85);
  stroke(c, tx(70), -596, tx(48), -556, tx(26), -508, 3, CLOTH_INK, 0.85);
  stroke(c, tx(-66), -590, tx(-50), -560, tx(-34), -526, 1.4, CLOTH_HI, 0.55);
  stroke(c, tx(64), -592, tx(48), -562, tx(32), -528, 1.4, CLOTH_HI, 0.55);
  for (const v of [-40, -18, 22, 42]) stroke(c, tx(v) - 4, -476, tx(v), -470, tx(v) + 6, -466, 2.2, CLOTH_INK, 0.7);
  for (const v of [-44, -20, 24, 46]) stroke(c, tx(v), -446, tx(v + Math.sign(v) * 4 + fl * 6), -396, tx(v + Math.sign(v) * 7 + fl * 10), -356, 2.4, CLOTH_INK, 0.75);
  for (const v of [-32, 34]) stroke(c, tx(v), -436, tx(v + Math.sign(v) * 3), -400, tx(v + Math.sign(v) * 5 + fl * 8), -360, 1.3, CLOTH_HI, 0.5);

  if (!p.armL.back && !p.armL.top) drawArm(c, shL.x, shL.y, p.armL, 1, p, lw, out, t);
  if (!p.armR.back && !p.armR.top) drawArm(c, shR.x, shR.y, p.armR, -1, p, lw, out, t);

  // high collar: dark inside, the head, then the front of the collar
  const chinX = tx(0) + turn * 4;
  c.fillStyle = '#07080e';
  c.beginPath();
  c.ellipse(chinX, -713, 31, 8, 0, 0, TAU);
  c.fill();
  drawHead(c, chinX, -720, 1, p.headTilt, { ...p.head, lw: p.lw / s, light: L });
  const collar: Build = (g) => {
    g.moveTo(tx(-34), -670);
    g.lineTo(chinX - 31, -716);
    g.quadraticCurveTo(chinX - 16, -706, chinX - 1.5, -709);
    g.lineTo(chinX + 1.5, -709);
    g.quadraticCurveTo(chinX + 16, -706, chinX + 31, -716);
    g.lineTo(tx(34), -670);
    g.quadraticCurveTo(chinX, -662, tx(-34), -670);
    g.closePath();
  };
  shade(c, collar, CLOTH, CLOTH_SH, L, 6, CLOTH_INK, lw * 1.2, 3);
  c.strokeStyle = CLOTH_INK;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(chinX, -709);
  c.lineTo(chinX + 1, -666);
  c.stroke();
  stroke(c, chinX - 22, -676, chinX, -671, chinX + 22, -676, 1.4, CLOTH_HI, 0.5);
  if (p.armL.top) drawArm(c, shL.x, shL.y, p.armL, 1, p, lw, out, t);
  if (p.armR.top) drawArm(c, shR.x, shR.y, p.armR, -1, p, lw, out, t);
  const ch = inv.transformPoint(t.transformPoint(new DOMPoint(chinX, -720)));
  out.cx = ch.x;
  out.cy = ch.y;
  c.restore();
}

export const makeOut = (): GojoOut => ({ lwx: 0, lwy: 0, rwx: 0, rwy: 0, lpx: 0, lpy: 0, rpx: 0, rpy: 0, cx: 0, cy: 0, ltx: 0, lty: 0, rtx: 0, rty: 0, lnx: 0, lny: -1, rnx: 0, rny: -1 });

/* ---------- film effects ---------- */

export interface Cam {
  /** Point of interest in the drawing's own units */
  x: number;
  y: number;
  /** px per unit */
  z: number;
  /** Dutch tilt */
  rot: number;
}

export const cam = (x: number, y: number, z: number, rot = 0): Cam => ({ x, y, z, rot });

/** Ink width in px for a rig drawn at zoom z: close ups get a bolder line, as in a key frame */
export const inkPx = (z: number) => 0.9 + Math.sqrt(z) * 0.9;

export function mixCam(a: Cam, b: Cam, k: number): Cam {
  // zoom mixes in log space so push-ins feel even
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)), rot: lerp(a.rot, b.rot, k) };
}

/** Put the camera's point of interest at (sx, sy) on screen */
export function applyCam(c: C, k: Cam, sx: number, sy: number) {
  c.translate(sx, sy);
  c.rotate(k.rot);
  c.scale(k.z, k.z);
  c.translate(-k.x, -k.y);
}

export function camToScreen(k: Cam, sx: number, sy: number, px: number, py: number): [number, number] {
  const dx = (px - k.x) * k.z;
  const dy = (py - k.y) * k.z;
  const cr = Math.cos(k.rot);
  const sr = Math.sin(k.rot);
  return [sx + dx * cr - dy * sr, sy + dx * sr + dy * cr];
}

export function screenToCam(k: Cam, sx: number, sy: number, px: number, py: number): [number, number] {
  const dx = px - sx;
  const dy = py - sy;
  const cr = Math.cos(-k.rot);
  const sr = Math.sin(-k.rot);
  return [k.x + (dx * cr - dy * sr) / k.z, k.y + (dx * sr + dy * cr) / k.z];
}

/** Manga speed lines converging on (fx, fy); they flicker by re-seeding every few frames */
export function speedLines(c: C, w: number, h: number, fx: number, fy: number, inner: number, n: number, color: string, alpha: number, t: number, thick = 1) {
  if (alpha <= 0.01) return;
  const rnd = mulberry(Math.floor(t * 14) + 3);
  const outer = Math.hypot(w, h);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const r0 = inner * (0.85 + rnd() * 0.7);
    const wd = (0.004 + rnd() * 0.014) * thick;
    c.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
    c.lineTo(fx + Math.cos(a - wd) * outer, fy + Math.sin(a - wd) * outer);
    c.lineTo(fx + Math.cos(a + wd) * outer, fy + Math.sin(a + wd) * outer);
    c.closePath();
  }
  c.fill();
  c.restore();
}

/** Turn what is on the canvas into a stark negative impact frame, optionally tinted */
export function impactFrame(c: C, w: number, h: number, k: number, tint: string | null = null) {
  if (k <= 0.01) return;
  c.save();
  c.globalAlpha = Math.min(1, k);
  c.globalCompositeOperation = 'saturation';
  c.fillStyle = '#808080';
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'difference';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  if (tint) {
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint;
    c.fillRect(0, 0, w, h);
  }
  c.restore();
}

/** Cinematic bars, k 0..1; returns the bar height */
export function letterbox(c: C, w: number, h: number, k: number) {
  const bh = Math.round(h * 0.1 * clamp(k, 0, 1));
  if (bh < 1) return 0;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, bh);
  c.fillRect(0, h - bh, w, bh);
  return bh;
}

/** Subtitle centred in the lower bar (or just above the bottom edge) */
export function subtitle(c: C, w: number, h: number, text: string, alpha: number, accent = '#ffffff') {
  if (alpha <= 0.01 || !text) return;
  const fs = clamp(Math.min(w, h) * 0.046, 11, 26);
  c.save();
  c.globalAlpha = clamp(alpha, 0, 1);
  c.font = `italic 600 ${Math.round(fs)}px ui-serif, Georgia, "Times New Roman", serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let size = fs;
  while (c.measureText(text).width > w * 0.92 && size > 9) {
    size -= 1;
    c.font = `italic 600 ${Math.round(size)}px ui-serif, Georgia, "Times New Roman", serif`;
  }
  const y = h - Math.max(h * 0.05, size * 1.2);
  c.lineWidth = Math.max(2, size * 0.16);
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.strokeText(text, w / 2, y);
  c.fillStyle = accent;
  c.fillText(text, w / 2, y);
  c.restore();
}

/**
 * Big technique title: kanji above, English below, tracked out. Drawn where the caller says,
 * so scenes can keep it clear of the characters.
 */
export function techTitle(c: C, cx: number, cy: number, size: number, jp: string, en: string, alpha: number, glow: string, spread = 0) {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha = clamp(alpha, 0, 1);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${Math.round(size)}px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", ui-serif, serif`;
  c.shadowColor = glow;
  c.shadowBlur = size * 0.35;
  c.fillStyle = '#ffffff';
  c.fillText(jp, cx, cy - size * 0.2);
  c.shadowBlur = size * 0.2;
  const es = Math.round(size * 0.3);
  c.font = `700 ${es}px ui-serif, Georgia, "Times New Roman", serif`;
  const letters = en.toUpperCase().split('');
  const gap = es * (0.32 + spread);
  let tw = 0;
  for (const ch of letters) tw += c.measureText(ch).width + gap;
  tw -= gap;
  let x = cx - tw / 2;
  c.textAlign = 'left';
  for (const ch of letters) {
    c.fillText(ch, x, cy + size * 0.62);
    x += c.measureText(ch).width + gap;
  }
  c.restore();
}

export { mulberry };
