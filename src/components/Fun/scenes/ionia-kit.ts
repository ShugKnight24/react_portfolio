import { lerp, TAU } from './runtime';

/**
 * Shared pieces for the Ionian champion scenes (Zed, Ahri): a tiny two bone rig (bone frames
 * and a two joint solver), tapered limbs, cloth and tail ribbons driven by chains of points,
 * and background pieces for Ionia: layered peaks, pagoda roofs, spirit blossom trees,
 * paper lanterns and falling petals.
 * Angles in the rigs are measured from straight down, positive toward the facing side (+x).
 */

type C = CanvasRenderingContext2D;

/** Unit direction for an angle measured from straight down, positive toward +x */
export const dirX = (a: number) => Math.sin(a);
export const dirY = (a: number) => Math.cos(a);

/** Run fn in a frame whose +y runs from a to b; fn gets the bone length */
export function bone(c: C, ax: number, ay: number, bx: number, by: number, fn: (len: number) => void) {
  c.save();
  c.translate(ax, ay);
  c.rotate(Math.atan2(by - ay, bx - ax) - Math.PI / 2);
  fn(Math.hypot(bx - ax, by - ay));
  c.restore();
}

/** Two bone solver: the middle joint for a chain from a to b; bend +1 pushes it toward +x of a downward chain */
export function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bend: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.max(0.001, Math.min(l1 + l2 - 0.001, Math.hypot(dx, dy)));
  const dd = Math.hypot(dx, dy) || 0.001;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / dd;
  const uy = dy / dd;
  return [ax + ux * a + uy * h * bend, ay + uy * a - ux * h * bend];
}

/** A limb along +y of the current frame, w0 wide at the top and w1 at the far end, with a belly */
export function taper(c: C, len: number, w0: number, w1: number, belly = 0.15, shift = 0) {
  const m = (w0 + w1) * 0.5 * (1 + belly);
  c.beginPath();
  c.moveTo(-w0 / 2, 0);
  c.quadraticCurveTo(-m / 2 - shift, len * 0.45, -w1 / 2, len);
  c.arc(0, len, w1 / 2, Math.PI, 0, true);
  c.quadraticCurveTo(m / 2 - shift, len * 0.45, w0 / 2, 0);
  c.arc(0, 0, w0 / 2, 0, Math.PI, true);
  c.closePath();
}

/** Build a chain of n points from x0, y0 with segment length seg and per link angle ang(i) */
export function chain(xs: Float32Array, ys: Float32Array, n: number, x0: number, y0: number, seg: number, ang: (i: number) => number) {
  xs[0] = x0;
  ys[0] = y0;
  for (let i = 1; i < n; i++) {
    const a = ang(i);
    xs[i] = xs[i - 1] + Math.sin(a) * seg;
    ys[i] = ys[i - 1] + Math.cos(a) * seg;
  }
}

/**
 * Fill a ribbon along a chain with half width hw(q) at q in [0, 1]; ragged > 0 cuts a
 * torn end into the last stretch. The path is left open for the caller to fill or stroke.
 */
export function ribbon(c: C, xs: Float32Array, ys: Float32Array, n: number, hw: (q: number) => number, ragged = 0) {
  const L = LEFT;
  const R = RIGHT;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let nx = -(ys[i1] - ys[i0]);
    let ny = xs[i1] - xs[i0];
    const d = Math.hypot(nx, ny) || 1;
    nx /= d;
    ny /= d;
    const q = i / (n - 1);
    let w = hw(q);
    if (ragged > 0 && q > 0.7) w *= 1 + (i % 2 ? -ragged : ragged * 0.5);
    L[i * 2] = xs[i] + nx * w;
    L[i * 2 + 1] = ys[i] + ny * w;
    R[i * 2] = xs[i] - nx * w;
    R[i * 2 + 1] = ys[i] - ny * w;
  }
  c.beginPath();
  c.moveTo(L[0], L[1]);
  for (let i = 1; i < n - 1; i++) {
    c.quadraticCurveTo(L[i * 2], L[i * 2 + 1], (L[i * 2] + L[i * 2 + 2]) / 2, (L[i * 2 + 1] + L[i * 2 + 3]) / 2);
  }
  c.lineTo(xs[n - 1], ys[n - 1]);
  for (let i = n - 2; i > 0; i--) {
    c.quadraticCurveTo(R[i * 2], R[i * 2 + 1], (R[i * 2] + R[i * 2 - 2]) / 2, (R[i * 2 + 1] + R[i * 2 - 1]) / 2);
  }
  c.lineTo(R[0], R[1]);
  c.closePath();
}
const LEFT = new Float32Array(128);
const RIGHT = new Float32Array(128);

/* ---------- background pieces ---------- */

/** A band of peaks from x 0 to w with its base at y, filled with col */
export function peaks(c: C, w: number, h: number, y: number, amp: number, col: string | CanvasGradient, rnd: () => number, jag = 1) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, h);
  let x = 0;
  let py = y - amp * rnd();
  c.lineTo(0, py);
  while (x < w) {
    const step = (40 + rnd() * 110) * jag;
    const top = y - amp * (0.35 + rnd() * 0.65);
    const mx = x + step * (0.35 + rnd() * 0.3);
    c.quadraticCurveTo(mx - step * 0.1, lerp(py, top, 0.4), mx, top);
    x += step;
    py = y - amp * rnd() * 0.5;
    c.quadraticCurveTo(mx + step * 0.1, lerp(top, py, 0.4), x, py);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

/** Upturned Ionian roof: eave line centred on x at y, half width hw, height rh */
export function roof(c: C, x: number, y: number, hw: number, rh: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x - hw * 1.12, y - rh * 0.42);
  c.quadraticCurveTo(x - hw * 0.9, y + rh * 0.1, x - hw * 0.5, y + rh * 0.06);
  c.lineTo(x + hw * 0.5, y + rh * 0.06);
  c.quadraticCurveTo(x + hw * 0.9, y + rh * 0.1, x + hw * 1.12, y - rh * 0.42);
  c.quadraticCurveTo(x + hw * 0.7, y - rh * 0.25, x + hw * 0.34, y - rh);
  c.lineTo(x - hw * 0.34, y - rh);
  c.quadraticCurveTo(x - hw * 0.7, y - rh * 0.25, x - hw * 1.12, y - rh * 0.42);
  c.closePath();
  c.fill();
}

/** A pagoda of stacked roofs; lit windows go on with lit set */
export function pagoda(c: C, x: number, base: number, s: number, floors: number, body: string, roofCol: string, lit: string | null) {
  let y = base;
  for (let f = 0; f < floors; f++) {
    const hw = s * (1 - f * 0.14);
    const fh = s * 0.62;
    c.fillStyle = body;
    c.fillRect(x - hw * 0.62, y - fh, hw * 1.24, fh);
    if (lit) {
      c.fillStyle = lit;
      for (let k = -1; k <= 1; k++) c.fillRect(x + k * hw * 0.36 - hw * 0.08, y - fh * 0.7, hw * 0.16, fh * 0.4);
    }
    y -= fh;
    roof(c, x, y, hw, s * 0.34, roofCol);
    y -= s * 0.3;
  }
  c.strokeStyle = roofCol;
  c.lineWidth = Math.max(1, s * 0.05);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - s * 0.7);
  c.stroke();
}

/** A spirit blossom tree: a crooked trunk and clustered blooms, baked into the background */
export function blossomTree(
  c: C,
  x: number,
  base: number,
  s: number,
  rnd: () => number,
  trunk: string,
  blooms: string[],
  lean = 0
) {
  c.strokeStyle = trunk;
  c.lineCap = 'round';
  const tips: number[] = [];
  const branch = (bx: number, by: number, a: number, len: number, wd: number, depth: number) => {
    const ex = bx + Math.sin(a) * len;
    const ey = by - Math.cos(a) * len;
    c.lineWidth = wd;
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(bx + Math.sin(a + 0.4) * len * 0.5, by - Math.cos(a + 0.4) * len * 0.5, ex, ey);
    c.stroke();
    if (depth <= 0) {
      tips.push(ex, ey);
      return;
    }
    const n = depth > 2 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(ex, ey, a + (rnd() - 0.5) * 1.4 + (i - (n - 1) / 2) * 0.5, len * (0.62 + rnd() * 0.2), wd * 0.66, depth - 1);
  };
  branch(x, base, lean, s * 0.9, s * 0.14, 4);
  for (let i = 0; i < tips.length; i += 2) {
    const tx = tips[i];
    const ty = tips[i + 1];
    for (let j = 0; j < 7; j++) {
      c.fillStyle = blooms[Math.floor(rnd() * blooms.length)];
      c.beginPath();
      c.arc(tx + (rnd() - 0.5) * s * 0.5, ty + (rnd() - 0.6) * s * 0.36, s * (0.07 + rnd() * 0.1), 0, TAU);
      c.fill();
    }
  }
}

/** Five petal blossom or a single falling petal, centred on the current origin */
export function petal(c: C, size: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, -size);
  c.quadraticCurveTo(size * 0.9, -size * 0.2, 0, size);
  c.quadraticCurveTo(-size * 0.9, -size * 0.2, 0, -size);
  c.fill();
}

/** Paper lantern hanging from its cord at the origin, body r tall; glow is drawn by the caller */
export function lantern(c: C, r: number, body: string, dark: string, cap: string) {
  c.strokeStyle = cap;
  c.lineWidth = r * 0.08;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, r * 0.5);
  c.stroke();
  c.fillStyle = cap;
  c.fillRect(-r * 0.32, r * 0.46, r * 0.64, r * 0.18);
  c.fillRect(-r * 0.32, r * 1.96, r * 0.64, r * 0.18);
  const g = c.createLinearGradient(-r * 0.7, 0, r * 0.7, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.45, body);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, r * 1.3, r * 0.7, r * 0.72, 0, 0, TAU);
  c.fill();
  c.strokeStyle = dark;
  c.lineWidth = r * 0.05;
  c.beginPath();
  for (let i = -2; i <= 2; i++) {
    const k = i / 2.6;
    c.moveTo(-r * 0.7 * Math.sqrt(1 - k * k), r * 1.3 + k * r * 0.72);
    c.lineTo(r * 0.7 * Math.sqrt(1 - k * k), r * 1.3 + k * r * 0.72);
  }
  c.stroke();
  c.strokeStyle = cap;
  c.beginPath();
  c.moveTo(0, r * 2.14);
  c.lineTo(0, r * 2.6);
  c.stroke();
}
