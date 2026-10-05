/**
 * Ukiyo-e woodblock helpers shared by the Ukiyo-e series (direct mode films).
 *
 * The look: flat carved colour fields with wood grain showing through, bold sumi keylines of
 * slightly uneven width, bokashi bands (hand-wiped graded colour) at the top of the sky, kasumi
 * cloud bands, a washi sheet, and a vertical vermilion cartouche for the title.
 * Everything is deterministic (seeded) and cached where it can be.
 */
import type { Ctx, Riso } from '../riso/engine';
import { bez, clamp, hash, lerp, mulberry, noise1, SERIF, TAU, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const UK = {
  washi: '#efe3c7',
  washiLight: '#f6eedb',
  prussian: '#1f4f82',
  blue: '#3f74a3',
  pale: '#a9c6cf',
  indigo: '#26365a',
  night: '#18223a',
  vermilion: '#cf4527',
  ochre: '#d39a3a',
  gold: '#e2b85c',
  sumi: '#1d1a17',
  pink: '#e7b3a6',
  sand: '#dcc79c',
  stone: '#b9a27c',
  green: '#6f8758',
  grey: '#8f9396',
} as const;

/** hex (#rrggbb) to rgba() */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};

/** Blend two hex colours */
export const mix = (a: string, b: string, k: number) => {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((na >> s) & 255, (nb >> s) & 255, clamp(k)));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
};

/* ---------- wood grain ---------- */

/**
 * A seamless tile of wood grain: long wavering fibres (dark and light) plus a few knots, on a
 * transparent ground. Filled over a flat colour it reads as the block's grain printed through.
 */
export function woodGrain(r: Riso, seed: number, size = 420, strength = 1): CanvasPattern {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const rng = mulberry(seed);
  // periodic wobble so the tile wraps horizontally
  const waves = Array.from({ length: 4 }, (_, i) => ({
    k: i + 1,
    a: (6 / (i + 1)) * (0.4 + rng()),
    p: rng() * TAU,
  }));
  const knots = Array.from({ length: 3 }, () => ({
    x: rng() * size,
    y: rng() * size,
    r: 10 + rng() * 22,
  }));
  const yAt = (x: number, y0: number) => {
    let y = y0;
    for (const w of waves) y += w.a * Math.sin((x / size) * TAU * w.k + w.p + y0 * 0.004);
    for (const k of knots) {
      const dx = ((x - k.x + size * 1.5) % size) - size / 2;
      const dy = ((y0 - k.y + size * 1.5) % size) - size / 2;
      const d = Math.hypot(dx, dy);
      if (d < k.r * 3) y += Math.sign(dy || 1) * k.r * 0.9 * Math.exp(-((d / (k.r * 1.6)) ** 2));
    }
    return y;
  };
  const lines = Math.round(size / 3.2);
  for (let i = 0; i < lines; i++) {
    const y0 = (i / lines) * size + rng() * 2;
    const dark = rng() < 0.62;
    const a = (dark ? 0.04 + rng() * 0.09 : 0.05 + rng() * 0.09) * strength;
    ctx.strokeStyle = dark ? `rgba(30,18,6,${a})` : `rgba(255,251,238,${a})`;
    ctx.lineWidth = 0.5 + rng() * rng() * 2.4;
    for (const oy of [-size, 0, size]) {
      ctx.beginPath();
      // fibres break up a little, like uneven pressure from the baren
      let pen = false;
      for (let x = -8; x <= size + 8; x += 6) {
        const gap =
          Math.sin((x / size) * TAU * 3 + i * 1.7) + Math.sin((x / size) * TAU * 7 + i * 0.9) >
          1.25;
        const y = yAt(x, y0) + oy;
        if (gap) {
          pen = false;
          continue;
        }
        if (!pen) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        pen = true;
      }
      ctx.stroke();
    }
  }
  for (const k of knots) {
    for (let j = 0; j < 4; j++) {
      ctx.strokeStyle = `rgba(30,18,6,${0.05 * strength})`;
      ctx.lineWidth = 1;
      for (const ox of [-size, 0, size])
        for (const oy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.ellipse(
            k.x + ox,
            k.y + oy,
            k.r * (0.3 + j * 0.25),
            k.r * (0.12 + j * 0.1),
            0,
            0,
            TAU
          );
          ctx.stroke();
        }
    }
  }
  // baren mottling: soft lighter patches where the ink took less
  for (let i = 0; i < 26; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rr = 20 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(255,250,235,${0.06 * strength})`);
    g.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = g;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        ctx.setTransform(1, 0, 0, 1, ox, oy);
        ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const p = r.layers[0].createPattern(canvas, 'repeat');
  if (!p) throw new Error('pattern failed');
  return p;
}

/** Overlay grain on a filled region. rot in radians, the grain moves with (ox, oy) */
export const grainOver = (
  c: Ctx,
  path: Path2D,
  pat: CanvasPattern,
  alpha = 1,
  rot = 0,
  ox = 0,
  oy = 0,
  sc = 1
) => {
  pat.setTransform(
    new DOMMatrix()
      .translate(ox, oy)
      .rotate((rot * 180) / Math.PI)
      .scale(sc, sc)
  );
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = pat;
  c.fill(path);
  c.restore();
};

/** Flat carved colour field: solid fill + grain */
export const block = (
  c: Ctx,
  path: Path2D,
  color: string,
  pat: CanvasPattern | null,
  alpha = 1,
  rot = 0,
  ox = 0,
  oy = 0,
  sc = 1
) => {
  c.fillStyle = color;
  c.fill(path);
  if (pat) grainOver(c, path, pat, alpha, rot, ox, oy, sc);
};

/* ---------- keylines ---------- */

const dashCache = new Map<number, number[]>();
const dashes = (seed: number) => {
  let d = dashCache.get(seed);
  if (!d) {
    const rng = mulberry(seed * 7 + 3);
    d = [];
    for (let i = 0; i < 14; i++) d.push(40 + rng() * 110, 14 + rng() * 50);
    dashCache.set(seed, d);
  }
  return d;
};

/**
 * Sumi keyline with slightly uneven width: a base stroke plus thicker carved swells along it.
 * `w` is in current user units.
 */
export const keyline = (c: Ctx, path: Path2D, w: number, seed = 1, color: string = UK.sumi) => {
  c.save();
  c.strokeStyle = color;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = w;
  c.stroke(path);
  const d = dashes(seed).map((v) => v * Math.max(0.35, w / 3));
  c.setLineDash(d);
  c.lineDashOffset = hash(seed) * 90;
  c.lineWidth = w * 1.4;
  c.stroke(path);
  c.restore();
};

/** Outline points of a tapered brush ribbon along an open polyline (width w0 -> w1) */
export const ribbonPts = (
  pts: Pt[],
  w0: number,
  w1: number,
  seed = 1,
  wob = 0.22,
  pow = 1
): Pt[] => {
  const n = pts.length;
  if (n < 2) return [];
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const k = i / (n - 1);
    const w = lerp(w0, w1, Math.pow(k, pow)) * (1 + wob * noise1(k * 9, seed)) * 0.5;
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [...L, ...R.reverse()];
};

/** Tapered brush ribbon along an open polyline, added to path as a filled outline */
export const ribbon = (
  pts: Pt[],
  w0: number,
  w1: number,
  seed = 1,
  wob = 0.22,
  path: Path2D = new Path2D(),
  pow = 1
) => {
  const o = ribbonPts(pts, w0, w1, seed, wob, pow);
  if (!o.length) return path;
  path.moveTo(o[0][0], o[0][1]);
  for (let i = 1; i < o.length; i++) path.lineTo(o[i][0], o[i][1]);
  path.closePath();
  return path;
};

/** Sample a Catmull-Rom curve through control points into a dense polyline */
export const sampleSmooth = (pts: Pt[], per: number, closed = true): Pt[] => {
  const n = pts.length;
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let j = 0; j < per; j++) {
      const u = j / per;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
};

/** Closed polygon path from points */
export const poly = (pts: Pt[], path: Path2D = new Path2D()) => {
  if (!pts.length) return path;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
  return path;
};

/* ---------- the hook / claw ---------- */

/**
 * A curling hook (wind curl, wave lip, flame tongue): a spiral whose radius shrinks from R and
 * whose thickness tapers to a point, as a closed outline. Curls clockwise from angle a0.
 * flip mirrors it horizontally. Returns n*2 points.
 */
export const hookPts = (
  cx: number,
  cy: number,
  R: number,
  turns: number,
  thick: number,
  a0 = Math.PI,
  flip = false,
  n = 80,
  shrink = 0.78,
  tail = 0
): Pt[] => {
  const span = turns * TAU;
  const mid: Pt[] = [];
  const ws: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const th = a0 + k * span;
    let rr = R * (1 - shrink * Math.pow(k, 0.9));
    let x = Math.cos(th) * rr;
    let y = Math.sin(th) * rr;
    if (tail > 0 && k < 0.25) {
      // straighten the base into a tail that sweeps in from below-left
      const q = 1 - k / 0.25;
      rr += tail * q * q;
      x = Math.cos(th) * rr;
      y = Math.sin(th) * rr;
    }
    mid.push([cx + (flip ? -x : x), cy + y]);
    ws.push(thick * Math.pow(1 - k, 0.75) + thick * 0.04);
  }
  const L: Pt[] = [];
  const Rr: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = mid[Math.max(0, i - 1)];
    const b = mid[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const w = ws[i] / 2;
    L.push([mid[i][0] + nx * w, mid[i][1] + ny * w]);
    Rr.push([mid[i][0] - nx * w, mid[i][1] - ny * w]);
  }
  return [...L, ...Rr.reverse()];
};

/**
 * Foam claws hanging off an edge: forked, tapering fingers that curl toward `dir` side.
 * edge is a polyline (outside to the left of travel when side = 1). Adds into path.
 */
export const claws = (
  edge: Pt[],
  count: number,
  len: number,
  t: number,
  seed: number,
  path: Path2D = new Path2D(),
  side = 1,
  k0 = 0,
  k1 = 1
) => {
  const n = edge.length;
  for (let j = 0; j < count; j++) {
    const k = lerp(k0, k1, (j + 0.5) / count);
    const fi = Math.min(n - 2, Math.max(1, Math.floor(k * (n - 1))));
    const p = edge[fi];
    const a = edge[fi - 1];
    const b = edge[fi + 1];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    const ux = tx / tl;
    const uy = ty / tl;
    // outward normal
    const nx = uy * side;
    const ny = -ux * side;
    const h = hash(j * 13.7 + seed);
    const L = len * (0.6 + 0.6 * h) * (0.55 + 0.45 * Math.sin(k * Math.PI));
    const flex = Math.sin(t * 2.6 + j * 1.9 + seed) * 0.25;
    const base = L * 0.28;
    // a talon: three fingers that reach out and hook forward, like Hokusai's foam
    for (let f = 0; f < 3; f++) {
      const fl = L * [1, 0.68, 0.42][f];
      const tilt = [0.35, 0.05, -0.25][f] + flex;
      const sx = p[0] - ux * base * f * 0.55;
      const sy = p[1] - uy * base * f * 0.55;
      const pts: Pt[] = [[sx, sy]];
      const m = 10;
      let x = sx;
      let y = sy;
      for (let i = 1; i < m; i++) {
        const q = i / (m - 1);
        const curl = tilt + q * q * 1.5;
        x += (nx * Math.cos(curl) + ux * Math.sin(curl)) * (fl / (m - 1));
        y += (ny * Math.cos(curl) + uy * Math.sin(curl)) * (fl / (m - 1));
        pts.push([x, y]);
      }
      ribbon(pts, base * [1, 0.8, 0.6][f], 0.4, seed + j * 3 + f, 0.08, path, 0.8);
    }
  }
  return path;
};

/* ---------- sky, clouds, bands ---------- */

/** Bokashi: hand-wiped graded band, colour at y0 (alpha a0) fading to a1 at y1 */
export const bokashi = (
  c: Ctx,
  x: number,
  y0: number,
  w: number,
  y1: number,
  color: string,
  a0 = 1,
  a1 = 0
) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(color, a0));
  g.addColorStop(0.35, rgba(color, lerp(a0, a1, 0.2)));
  g.addColorStop(1, rgba(color, a1));
  c.fillStyle = g;
  c.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0));
};

const pill = (p: Path2D, x0: number, x1: number, y: number, h: number) => {
  const rr = h / 2;
  p.moveTo(x0 + rr, y - rr);
  p.lineTo(x1 - rr, y - rr);
  p.arc(x1 - rr, y, rr, -Math.PI / 2, Math.PI / 2);
  p.lineTo(x0 + rr, y + rr);
  p.arc(x0 + rr, y, rr, Math.PI / 2, (Math.PI * 3) / 2);
  p.closePath();
};

/** Kasumi (stylised mist band): stacked rounded strips centred on the origin */
export const kasumiPath = (w: number, h: number, seed: number) => {
  const rng = mulberry(seed);
  const p = new Path2D();
  pill(p, -w / 2, w / 2, 0, h);
  const up = 0.45 + rng() * 0.2;
  const ux = (rng() - 0.5) * w * 0.4;
  pill(p, ux - (w * up) / 2, ux + (w * up) / 2, -h * 0.72, h * 0.85);
  const dn = 0.35 + rng() * 0.25;
  const dx = (rng() - 0.5) * w * 0.5;
  pill(p, dx - (w * dn) / 2, dx + (w * dn) / 2, h * 0.7, h * 0.8);
  if (rng() < 0.6) {
    const s = 0.2 + rng() * 0.15;
    const sx = (rng() - 0.5) * w * 0.6;
    pill(p, sx - (w * s) / 2, sx + (w * s) / 2, -h * 1.35, h * 0.7);
  }
  return p;
};

/** Draw a kasumi band at (x, y) with a soft bokashi underside */
export const kasumi = (
  c: Ctx,
  path: Path2D,
  x: number,
  y: number,
  color: string,
  alpha = 1,
  edge: string = UK.washiLight
) => {
  c.save();
  c.translate(x, y);
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fill(path);
  c.clip(path);
  const g = c.createLinearGradient(0, -60, 0, 60);
  g.addColorStop(0, rgba(edge, 0.55));
  g.addColorStop(0.6, rgba(edge, 0));
  c.fillStyle = g;
  c.fillRect(-2000, -80, 4000, 160);
  c.restore();
};

/* ---------- rain and blossoms ---------- */

/** Slanted rain lines, Hiroshige style. Pure function of t */
export const rainPath = (
  t: number,
  seed: number,
  n: number,
  slant: number,
  speed: number,
  len: number,
  x0 = -200,
  x1 = 1800
) => {
  const p = new Path2D();
  const H = 900 + len + 200;
  for (let i = 0; i < n; i++) {
    const hx = hash(i * 1.37 + seed);
    const hy = hash(i * 2.71 + seed * 3);
    const hs = 0.75 + hash(i * 4.1 + seed) * 0.5;
    const l = len * (0.6 + hash(i * 5.3 + seed) * 0.8);
    const y = ((hy * H + t * speed * hs) % H) - len - 100;
    const x = lerp(x0, x1, hx) - y * slant;
    p.moveTo(x, y);
    p.lineTo(x - l * slant, y + l);
  }
  return p;
};

/** Sakura petal outline: base at the origin, notched tip at y = -s */
export const petalPts = (s: number, n = 24): Pt[] => {
  const right: Pt[] = [];
  const P: Pt[] = [
    [0, 0],
    [0.3, -0.12],
    [0.56, -0.72],
    [0.3, -0.98],
  ];
  for (let i = 0; i <= n; i++) right.push(bez(P[0], P[1], P[2], P[3], i / n));
  for (let i = 1; i <= 4; i++)
    right.push([lerp(0.3, 0, i / 4), lerp(-0.98, -0.86, Math.sqrt(i / 4))]);
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y] as Pt);
  return [...right, ...left].map(([x, y]) => [x * s, y * s] as Pt);
};

/* ---------- title cartouche and seal ---------- */

/**
 * Vertical vermilion cartouche with the title written down it (rotated text), a thin inner
 * keyline, and a small square seal below. k (0..1) presses it in.
 */
export const cartouche = (
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  k = 1,
  sub = ''
) => {
  if (k <= 0) return;
  c.save();
  const press = clamp(k * 1.4);
  c.globalAlpha = press;
  c.translate(x, y);
  const sq = lerp(1.06, 1, press);
  c.scale(sq, sq);
  // slightly irregular block
  const p = new Path2D();
  p.moveTo(-w / 2 + 1, -h / 2);
  p.lineTo(w / 2, -h / 2 + 1.5);
  p.lineTo(w / 2 - 1, h / 2);
  p.lineTo(-w / 2, h / 2 - 1);
  p.closePath();
  c.fillStyle = UK.vermilion;
  c.fill(p);
  c.strokeStyle = UK.sumi;
  c.lineWidth = 2.4;
  c.stroke(p);
  c.strokeStyle = rgba(UK.washiLight, 0.85);
  c.lineWidth = 1.4;
  c.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
  // vertical text
  c.save();
  c.rotate(Math.PI / 2);
  c.fillStyle = UK.washiLight;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let fs = w * 0.52;
  c.font = `600 ${fs}px ${SERIF}`;
  const avail = h - 34;
  const tw = c.measureText(title).width;
  if (tw > avail) {
    fs *= avail / tw;
    c.font = `600 ${fs}px ${SERIF}`;
  }
  c.fillText(title, 0, 1);
  c.restore();
  c.restore();
  if (sub) {
    // small square seal with the subtitle
    const sk = clamp((k - 0.45) * 2.2);
    if (sk > 0) {
      c.save();
      c.globalAlpha = sk;
      const s = w * 0.72;
      c.translate(x, y + h / 2 + s / 2 + 12);
      c.rotate(0.03);
      c.fillStyle = UK.vermilion;
      c.fillRect(-s / 2, -s / 2, s, s);
      c.strokeStyle = UK.washiLight;
      c.lineWidth = 1.6;
      c.strokeRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8);
      c.fillStyle = UK.washiLight;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${s * 0.24}px ${SERIF}`;
      c.fillText(sub, 0, 1);
      c.restore();
    }
  }
};

/** Horizontal print border: a thin double keyline just inside the frame, as on a print sheet */
export const printBorder = (c: Ctx, inset = 18, alpha = 1) => {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = UK.sumi;
  c.lineWidth = 3;
  c.strokeRect(inset, inset, 1600 - inset * 2, 900 - inset * 2);
  c.lineWidth = 1;
  c.strokeRect(inset + 7, inset + 7, 1600 - inset * 2 - 14, 900 - inset * 2 - 14);
  c.restore();
};

/** Margin wash outside the border so the print sits on its sheet */
export const sheetMargin = (c: Ctx, inset = 18, color: string = UK.washi) => {
  c.save();
  c.fillStyle = color;
  const p = new Path2D();
  p.rect(-10, -10, 1620, 920);
  p.rect(inset, inset, 1600 - inset * 2, 900 - inset * 2);
  c.fill(p, 'evenodd');
  c.restore();
};
