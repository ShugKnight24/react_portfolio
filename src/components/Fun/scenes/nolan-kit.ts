import { TAU } from './runtime';

/**
 * Small shared toolkit for the three Nolan Batman scenes: gradient and shape helpers for the
 * baked sprites, a flapping bat silhouette that can be batched into one path, a scalloped
 * cape hem, the Nolan cowl in profile and from behind, and a flat pose array helper for the
 * jointed figures. Everything here draws in whatever units the caller has set up on the context.
 */

type C = CanvasRenderingContext2D;

export function grad(c: C, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const n = cols.length - 1;
  cols.forEach((col, i) => g.addColorStop(i / n, col));
  return g;
}

/** Tapered capsule from (x0,y0) to (x1,y1), left as the current path */
export function capsule(
  c: C,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number
) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.arc(x0, y0, r0, a + Math.PI / 2, a - Math.PI / 2);
  c.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
  c.closePath();
}

/** Closed polygon from a flat list of points, left as the current path */
export function poly(c: C, pts: number[], close = true) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
}

/**
 * Adds one bat to the current path (no beginPath), centred on x, y with half span r.
 * flap runs -1 (wings down) to 1 (wings up); dir flips it to face left.
 */
export function traceBat(c: C, x: number, y: number, r: number, flap: number, dir = 1) {
  const up = flap * r * 0.7;
  const tip = r;
  const d = dir;
  c.moveTo(x, y - r * 0.18);
  // right wing: leading edge up to the tip, scalloped trailing edge back to the body
  c.quadraticCurveTo(x + d * tip * 0.45, y - up * 0.9 - r * 0.2, x + d * tip, y - up);
  c.quadraticCurveTo(
    x + d * tip * 0.82,
    y - up * 0.55 + r * 0.12,
    x + d * tip * 0.66,
    y - up * 0.5 + r * 0.2
  );
  c.quadraticCurveTo(
    x + d * tip * 0.52,
    y - up * 0.3 + r * 0.12,
    x + d * tip * 0.36,
    y - up * 0.22 + r * 0.24
  );
  c.quadraticCurveTo(x + d * tip * 0.2, y + r * 0.1, x + d * r * 0.08, y + r * 0.22);
  // body and the other wing
  c.lineTo(x - d * r * 0.08, y + r * 0.22);
  c.quadraticCurveTo(x - d * tip * 0.2, y + r * 0.1, x - d * tip * 0.36, y - up * 0.22 + r * 0.24);
  c.quadraticCurveTo(
    x - d * tip * 0.52,
    y - up * 0.3 + r * 0.12,
    x - d * tip * 0.66,
    y - up * 0.5 + r * 0.2
  );
  c.quadraticCurveTo(x - d * tip * 0.82, y - up * 0.55 + r * 0.12, x - d * tip, y - up);
  c.quadraticCurveTo(x - d * tip * 0.45, y - up * 0.9 - r * 0.2, x, y - r * 0.18);
  // ears
  c.moveTo(x - r * 0.1, y - r * 0.16);
  c.lineTo(x - r * 0.09, y - r * 0.34);
  c.lineTo(x - r * 0.02, y - r * 0.2);
  c.lineTo(x + r * 0.02, y - r * 0.2);
  c.lineTo(x + r * 0.09, y - r * 0.34);
  c.lineTo(x + r * 0.1, y - r * 0.16);
  c.closePath();
}

/** Scalloped hem from (x0,y0) to (x1,y1) in n bites that bow toward (nx,ny) by depth */
export function scallops(
  c: C,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  depth: number
) {
  const dx = (x1 - x0) / n;
  const dy = (y1 - y0) / n;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  // bow inward, perpendicular to the hem
  const px = (-(y1 - y0) / len) * depth;
  const py = ((x1 - x0) / len) * depth;
  for (let i = 0; i < n; i++) {
    const ax = x0 + dx * (i + 0.5) + px;
    const ay = y0 + dy * (i + 0.5) + py;
    c.quadraticCurveTo(ax, ay, x0 + dx * (i + 1), y0 + dy * (i + 1));
  }
}

/** Soft ellipse of light, drawn with a cached radial sprite */
export function softEllipse(
  c: C,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha: number
) {
  if (alpha <= 0.003) return;
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(img, x - rx, y - ry, rx * 2, ry * 2);
}

/** Wedge shaped light cone from (x,y) along angle a with half angle spread and length len */
export function cone(
  c: C,
  x: number,
  y: number,
  a: number,
  spread: number,
  len: number,
  inner: string,
  outer: string
) {
  const g = c.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, y);
  c.arc(x, y, len, a - spread, a + spread);
  c.closePath();
  c.fill();
}

/** Tileable monochrome film grain, baked once and drawn with a random offset each frame */
export function grainTile(size: number, seed: number, strength = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(size, size);
  let a = seed;
  for (let i = 0; i < size * size; i++) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const v = (a >>> 24) & 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.round(255 * strength);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function drawGrain(c: C, tile: HTMLCanvasElement, w: number, h: number, alpha: number) {
  if (alpha <= 0.003) return;
  const s = tile.width;
  const ox = -Math.floor(Math.random() * s);
  const oy = -Math.floor(Math.random() * s);
  c.save();
  c.globalAlpha = alpha;
  c.globalCompositeOperation = 'overlay';
  for (let y = oy; y < h; y += s) for (let x = ox; x < w; x += s) c.drawImage(tile, x, y);
  c.restore();
}

/**
 * Keep a reduced-motion loop alive from inside update(). Calling env.wake() directly there
 * would schedule a second frame alongside the one the loop is about to request, so the call
 * is deferred until the current frame has finished.
 */
export function keepAwake(env: { reducedMotion: boolean; wake(ms?: number): void }, ms = 300) {
  if (env.reducedMotion) queueMicrotask(() => env.wake(ms));
}

/** Blend two flat pose arrays into out */
export function mixPose(out: number[], a: readonly number[], b: readonly number[], k: number) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

/** Frame-rate independent ease of a flat pose array toward a target */
export function dampPose(cur: number[], target: readonly number[], rate: number, dt: number) {
  const k = 1 - Math.exp(-rate * dt);
  for (let i = 0; i < cur.length; i++) cur[i] += (target[i] - cur[i]) * k;
}

/** Fill a tapered limb */
export function limb(c: C, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) {
  capsule(c, x0, y0, x1, y1, r0, r1);
  c.fill();
}

/**
 * The Begins and Dark Knight cowl in profile, centred on the head and facing right in units of
 * about one head radius (13). Short, slightly swept ears, a heavy brow, the bare mouth and a
 * square jaw that meets the gorget.
 */
export function traceCowlProfile(c: C) {
  c.moveTo(-12, 12);
  c.bezierCurveTo(-16, 2, -15, -9, -10, -13);
  c.lineTo(-9, -22.5);
  c.lineTo(-3.5, -15.5);
  c.lineTo(1.5, -16);
  c.lineTo(4.4, -23);
  c.lineTo(8, -14);
  c.bezierCurveTo(11, -11, 13, -7, 14, -2.5);
  c.lineTo(13.2, 0.5);
  c.lineTo(15.4, 4.6);
  c.lineTo(14.6, 9.5);
  c.lineTo(9.5, 13.5);
  c.lineTo(2, 13.8);
  c.lineTo(-5, 16);
  c.closePath();
}

/**
 * The cowl seen from behind (or straight on), centred on the head with half width about 12:
 * two short ears, a broad skull and the cowl flaring into the shoulders.
 */
export function traceCowlBack(c: C) {
  c.moveTo(-13, 16);
  c.bezierCurveTo(-14, 6, -13.5, -4, -11, -10);
  c.lineTo(-10, -21);
  c.lineTo(-5, -13);
  c.quadraticCurveTo(0, -15, 5, -13);
  c.lineTo(10, -21);
  c.lineTo(11, -10);
  c.bezierCurveTo(13.5, -4, 14, 6, 13, 16);
  c.closePath();
}

/** Smooth 0..1 step */
export const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export const HALF_PI = Math.PI / 2;
export { TAU };

/* ---------- cloth cape ---------- */

/**
 * A cape as a small verlet cloth: cols x rows nodes, the top row pinned to the shoulders each
 * frame, with stiff vertical links, stretch-limited horizontal links that let it fold, and
 * shear links that keep it from collapsing. Any node can be softly pinned (a hand holding the
 * edge out). Units are whatever the caller works in, usually screen pixels.
 */
export interface Cape {
  cols: number;
  rows: number;
  x: Float32Array;
  y: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  /** horizontal rest length per row, so the cape can flare toward the hem */
  restH: Float32Array;
  restV: number;
  pinX: Float32Array;
  pinY: Float32Array;
  /** 0 free, 1 locked to the pin */
  pinW: Float32Array;
}

export function makeCape(cols: number, rows: number) {
  const n = cols * rows;
  const cape: Cape = {
    cols,
    rows,
    x: new Float32Array(n),
    y: new Float32Array(n),
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    restH: new Float32Array(rows),
    restV: 1,
    pinX: new Float32Array(n),
    pinY: new Float32Array(n),
    pinW: new Float32Array(n),
  };
  return cape;
}

/** Lay the cape out hanging straight down from a shoulder line centred on (cx, top) */
export function hangCape(
  cape: Cape,
  cx: number,
  top: number,
  topW: number,
  hemW: number,
  len: number
) {
  const { cols, rows } = cape;
  cape.restV = len / (rows - 1);
  for (let j = 0; j < rows; j++) {
    const k = j / (rows - 1);
    const width = lerpN(topW, hemW, Math.pow(k, 0.7));
    cape.restH[j] = width / (cols - 1);
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const x = cx + (i / (cols - 1) - 0.5) * lerpN(topW, hemW * 0.62, k);
      const y = top + k * len;
      cape.x[idx] = cape.ox[idx] = x;
      cape.y[idx] = cape.oy[idx] = y;
      cape.pinW[idx] = 0;
    }
  }
}

const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;

/** Set the top row along a shoulder line from (x0, y0) to (x1, y1), bowed by sag */
export function pinShoulders(cape: Cape, x0: number, y0: number, x1: number, y1: number, sag = 0) {
  const n = cape.cols;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    cape.pinX[i] = lerpN(x0, x1, k);
    cape.pinY[i] = lerpN(y0, y1, k) - Math.sin(k * Math.PI) * sag;
    cape.pinW[i] = 1;
  }
}

/** Kick every node by (vx, vy) per step, weighted toward the hem and the outer edges */
export function kickCape(cape: Cape, vx: number, vy: number, spread = 0) {
  const { cols, rows } = cape;
  for (let j = 1; j < rows; j++) {
    const kj = j / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const side = (i / (cols - 1)) * 2 - 1;
      cape.ox[idx] -= (vx + side * spread) * kj;
      cape.oy[idx] -= vy * kj * (0.6 + Math.abs(side) * 0.4);
    }
  }
}

/**
 * Advance the cloth. g is gravity, (wx, wy) the wind acceleration and turb how much it
 * gusts and billows across the cloth (0..1); t drives the gust pattern.
 */
export function stepCape(
  cape: Cape,
  dt: number,
  g: number,
  wx: number,
  wy: number,
  turb: number,
  t: number,
  drag = 0.985
) {
  const { cols, rows, x, y, ox, oy } = cape;
  const sub = 2;
  const h = dt / sub;
  const h2 = h * h;
  for (let s = 0; s < sub; s++) {
    for (let j = 1; j < rows; j++) {
      const kj = j / (rows - 1);
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const side = i / (cols - 1) - 0.5;
        const gust =
          1 + turb * Math.sin(t * 3.3 + i * 0.8 + j * 0.55) * Math.sin(t * 1.7 + j * 0.3);
        const lift = turb * Math.sin(t * 2.6 + i * 1.4 - j * 0.9) * kj;
        const fx = wx * (0.35 + 0.65 * kj) * gust + side * Math.abs(wx) * 0.25 * kj;
        const fy = g + wy * kj + lift * (Math.abs(wx) * 0.35 + Math.abs(wy) * 0.2 + g * 0.05);
        const vx = (x[idx] - ox[idx]) * drag;
        const vy = (y[idx] - oy[idx]) * drag;
        ox[idx] = x[idx];
        oy[idx] = y[idx];
        x[idx] += vx + fx * h2;
        y[idx] += vy + fy * h2;
      }
    }
    for (let it = 0; it < 7; it++) {
      for (let j = 0; j < rows; j++) {
        const rh = cape.restH[j];
        for (let i = 0; i < cols; i++) {
          const a = j * cols + i;
          if (i < cols - 1) link(cape, a, a + 1, rh, 0.25);
          if (j < rows - 1) {
            link(cape, a, a + cols, cape.restV, 1);
            const rd = Math.hypot((rh + cape.restH[j + 1]) * 0.5, cape.restV);
            if (i < cols - 1) link(cape, a, a + cols + 1, rd, 0.45);
            if (i > 0) link(cape, a, a + cols - 1, rd, 0.45);
          }
        }
      }
      const n = cols * rows;
      for (let idx = 0; idx < n; idx++) {
        const w = cape.pinW[idx];
        if (w <= 0) continue;
        x[idx] += (cape.pinX[idx] - x[idx]) * w;
        y[idx] += (cape.pinY[idx] - y[idx]) * w;
      }
    }
  }
}

/** Distance link; compress (0..1) is how hard it resists being squeezed shorter than rest */
function link(cape: Cape, a: number, b: number, rest: number, compress: number) {
  const { x, y } = cape;
  const dx = x[b] - x[a];
  const dy = y[b] - y[a];
  const d = Math.hypot(dx, dy) || 1e-4;
  let diff = (d - rest) / d;
  if (diff < 0) diff *= compress;
  const wa = cape.pinW[a] >= 1 ? 0 : 0.5;
  const wb = cape.pinW[b] >= 1 ? 0 : 0.5;
  const tot = wa + wb;
  if (tot <= 0) return;
  const kx = (dx * diff) / tot;
  const ky = (dy * diff) / tot;
  x[a] += kx * wa;
  y[a] += ky * wa;
  x[b] -= kx * wb;
  y[b] -= ky * wb;
}

/**
 * The cape outline as the current path: smooth top and sides, and a scalloped hem with one
 * bite between each pair of bottom nodes. Offset (dx, dy) lets the caller draw rim passes.
 */
export function traceCape(c: C, cape: Cape, bite: number, dx = 0, dy = 0) {
  const { cols, rows, x, y } = cape;
  const last = (rows - 1) * cols;
  c.beginPath();
  c.moveTo(x[0] + dx, y[0] + dy);
  for (let i = 1; i < cols; i++) c.lineTo(x[i] + dx, y[i] + dy);
  // right edge down
  for (let j = 1; j < rows; j++) {
    const a = (j - 1) * cols + cols - 1;
    const b = j * cols + cols - 1;
    c.quadraticCurveTo(x[a] + dx, y[a] + dy, (x[a] + x[b]) / 2 + dx, (y[a] + y[b]) / 2 + dy);
  }
  c.lineTo(x[last + cols - 1] + dx, y[last + cols - 1] + dy);
  // scalloped hem, right to left; each bite bows up toward the cloth
  for (let i = cols - 1; i > 0; i--) {
    const a = last + i;
    const b = last + i - 1;
    const mx = (x[a] + x[b]) / 2;
    const my = (y[a] + y[b]) / 2;
    const ux = x[a] - x[a - cols];
    const uy = y[a] - y[a - cols];
    const ul = Math.hypot(ux, uy) || 1;
    c.quadraticCurveTo(
      mx - (ux / ul) * bite + dx,
      my - (uy / ul) * bite + dy,
      x[b] + dx,
      y[b] + dy
    );
  }
  // left edge up
  for (let j = rows - 1; j > 0; j--) {
    const a = j * cols;
    const b = (j - 1) * cols;
    c.quadraticCurveTo(x[a] + dx, y[a] + dy, (x[a] + x[b]) / 2 + dx, (y[a] + y[b]) / 2 + dy);
  }
  c.closePath();
}

/**
 * How bunched each column of the cape is (0 flat .. 1 tightly folded), written into out, for
 * shading the folds.
 */
export function capeFolds(cape: Cape, out: Float32Array) {
  const { cols, rows, x, y } = cape;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * cols + i;
      const l = i > 0 ? a - 1 : a;
      const r = i < cols - 1 ? a + 1 : a;
      const span = Math.hypot(x[r] - x[l], y[r] - y[l]) / ((r - l) * cape.restH[j] || 1);
      out[a] = Math.max(0, Math.min(1, 1 - span));
    }
}
