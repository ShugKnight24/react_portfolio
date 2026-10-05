import { clamp, TAU } from './runtime';

/**
 * Small drawing kit for the second batch of anime scenes (Gojo, Saitama, Spirited Away,
 * Tanjiro): cel shaded ink shapes, two bone limbs, simple hands and a hold or tap press
 * tracker. Shapes are described by a builder callback so the same outline can be filled,
 * clipped for a hard shadow band and inked without repeating the path code.
 */

export type C = CanvasRenderingContext2D;
export type Build = (c: C) => void;

/** Fill a shape flat, then ink its outline */
export function inked(c: C, build: Build, fill: string | CanvasGradient, ink: string | null, lw: number) {
  c.beginPath();
  build(c);
  c.fillStyle = fill;
  c.fill();
  if (ink && lw > 0) {
    c.strokeStyle = ink;
    c.lineWidth = lw;
    c.stroke();
  }
}

/**
 * Cel shading: the shape is filled with its shadow tone, then a copy nudged toward the light
 * by (dx, dy) is filled with the base tone inside a clip, which leaves a crisp shadow band on
 * the far edge. Inked afterward.
 */
export function cel(
  c: C,
  build: Build,
  base: string,
  shade: string,
  dx: number,
  dy: number,
  ink: string | null,
  lw: number
) {
  c.save();
  c.beginPath();
  build(c);
  c.fillStyle = shade;
  c.fill();
  c.clip();
  c.translate(dx, dy);
  c.beginPath();
  build(c);
  c.fillStyle = base;
  c.fill();
  c.restore();
  if (ink && lw > 0) {
    c.beginPath();
    build(c);
    c.strokeStyle = ink;
    c.lineWidth = lw;
    c.stroke();
  }
}

/** Run draw() clipped to the shape */
export function within(c: C, build: Build, draw: () => void) {
  c.save();
  c.beginPath();
  build(c);
  c.clip();
  draw();
  c.restore();
}

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

/** Spiky outline: alternating tip and valley points joined with gently curved edges */
export function spiky(c: C, pts: ArrayLike<number>, bulge = 0.18) {
  const n = pts.length / 2;
  c.moveTo(pts[0], pts[1]);
  for (let i = 1; i <= n; i++) {
    const a = (i - 1) % n;
    const b = i % n;
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const bx = pts[b * 2];
    const by = pts[b * 2 + 1];
    const mx = (ax + bx) / 2 - (by - ay) * bulge;
    const my = (ay + by) / 2 + (bx - ax) * bulge;
    c.quadraticCurveTo(mx, my, bx, by);
  }
  c.closePath();
}

/** Two bone IK: writes the elbow into out given root, target, bone lengths and bend side */
export function elbow(out: number[], sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, side: number) {
  let dx = hx - sx;
  let dy = hy - sy;
  let d = Math.hypot(dx, dy) || 1e-4;
  const reach = l1 + l2 - 1e-3;
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
    d = reach;
  }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + a * side;
  out[0] = sx + Math.cos(base) * l1;
  out[1] = sy + Math.sin(base) * l1;
  out[2] = sx + dx;
  out[3] = sy + dy;
  return out;
}

/** Hand shapes drawn in a local frame pointing along +x */
export type Grip = 'open' | 'fist' | 'point' | 'cross';

/**
 * A simple anime hand at (x, y), pointing along angle a. `flip` mirrors the thumb side.
 * Size s is the palm half length.
 */
export function hand(c: C, x: number, y: number, a: number, s: number, grip: Grip, flip: number, skin: string, shade: string, ink: string, lw: number) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.scale(1, flip);
  const fingers = (build: Build) => cel(c, build, skin, shade, -s * 0.12, -s * 0.12, ink, lw);
  if (grip === 'open') {
    for (let i = 0; i < 4; i++) {
      const fa = -0.42 + i * 0.28;
      const len = s * (i === 1 || i === 2 ? 1.35 : 1.15);
      fingers((g) => capsule(g, s * 0.55, Math.sin(fa) * s * 0.9, s * 0.2, s * 0.55 + Math.cos(fa) * len, Math.sin(fa) * s * 0.9 + Math.sin(fa) * len * 0.6, s * 0.16));
    }
    fingers((g) => capsule(g, s * 0.1, s * 0.55, s * 0.24, s * 0.7, s * 1.15, s * 0.17));
    fingers((g) => g.ellipse(s * 0.2, 0, s * 0.72, s * 0.78, 0, 0, TAU));
  } else {
    // knuckles block, with optional raised fingers
    if (grip === 'point') {
      fingers((g) => capsule(g, s * 0.6, -s * 0.38, s * 0.2, s * 2.0, -s * 0.42, s * 0.16));
    } else if (grip === 'cross') {
      fingers((g) => capsule(g, s * 0.55, -s * 0.15, s * 0.19, s * 1.95, -s * 0.62, s * 0.15));
      fingers((g) => capsule(g, s * 0.55, -s * 0.55, s * 0.19, s * 1.95, -s * 0.05, s * 0.15));
    }
    fingers((g) => {
      g.moveTo(-s * 0.4, -s * 0.7);
      g.quadraticCurveTo(s * 0.4, -s * 0.85, s * 0.95, -s * 0.55);
      g.quadraticCurveTo(s * 1.15, 0, s * 0.95, s * 0.55);
      g.quadraticCurveTo(s * 0.3, s * 0.85, -s * 0.4, s * 0.7);
      g.closePath();
    });
    c.strokeStyle = ink;
    c.lineWidth = lw * 0.7;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const fy = -s * 0.3 + i * s * 0.3;
      c.moveTo(s * 0.62, fy);
      c.lineTo(s * 0.98, fy + s * 0.04);
    }
    c.stroke();
    fingers((g) => capsule(g, s * 0.05, s * 0.55, s * 0.22, s * 0.6, s * 0.5, s * 0.17));
  }
  c.restore();
}

/* ---------- press tracker: tap versus hold from pointer or Space / Enter ---------- */

export interface Press {
  pointer: boolean;
  key: boolean;
  /** A press began since the last update (catches taps shorter than a frame) */
  began: boolean;
  /** Seconds the current press has been held */
  held: number;
  /** Set for one update after a short press is released */
  tapped: boolean;
  /** Set for one update after a long press is released */
  released: boolean;
  /** The current press has passed the hold threshold */
  long: boolean;
  touched: boolean;
  prev: boolean;
}

export const makePress = (): Press => ({
  pointer: false,
  key: false,
  began: false,
  held: 0,
  tapped: false,
  released: false,
  long: false,
  touched: false,
  prev: false,
});

export const pressing = (p: Press) => p.pointer || p.key;

/** Start a press from the pointer or a key */
export function pressDown(p: Press, from: 'pointer' | 'key') {
  if (from === 'pointer') p.pointer = true;
  else p.key = true;
  p.began = true;
  p.touched = true;
}

/** Call once per update before reading tapped / released / long */
export function stepPress(p: Press, dt: number, threshold: number) {
  const down = pressing(p);
  p.tapped = false;
  p.released = false;
  if (down) {
    p.held += dt;
    if (p.held >= threshold) p.long = true;
  } else if (p.prev || p.began) {
    if (p.long) p.released = true;
    else p.tapped = true;
    p.held = 0;
    p.long = false;
  }
  p.began = false;
  p.prev = down;
  return down;
}
