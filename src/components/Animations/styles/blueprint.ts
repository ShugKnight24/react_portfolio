/**
 * Blueprint series: cyanotype / technical drawing look shared by the Blueprint films.
 *
 * Deep blueprint blue with a world-space grid that subdivides as the camera zooms, crisp white
 * and pale-cyan linework that draws itself on (stroke progress), hidden and centre lines,
 * dimension lines with arrowheads, callout leaders with balloons, section hatching, a title
 * block and a folded-sheet overlay (creases, edge wear). Line weights are kept in screen px, so
 * they stay crisp through camera zooms: call `pen(zoom)` once per frame after `r.camera`.
 */
import type { Riso, Ctx } from '../riso/engine';
import { mulberry, clamp, lerp, TAU, MONO, type Pt } from '../riso/kit';

export const BP = {
  paper: '#164a87',
  deep: '#0c2f5e',
  line: '#f3f8ff',
  cyan: '#9fd8f4',
  pale: '#6ea6dc',
  faint: 'rgba(170, 210, 250, 0.16)',
  accent: '#ff7a2e',
};

export const BP_INKS = [{ color: BP.paper }, { color: BP.line }, { color: BP.cyan }, { color: BP.accent }];

/** Technical lettering: monospace for notes, a condensed gothic for titles */
export const TECH = MONO;
export const GOTHIC = '"DIN Condensed", "DIN Alternate", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

export const DASH = {
  hidden: [11, 7],
  centre: [30, 6, 5, 6],
  phantom: [34, 6, 5, 6, 5, 6],
  fine: [3, 5],
};

/* ---------- pen: screen-constant weights under zoom ---------- */

let Z = 1;
/** Current camera zoom, so weights, dashes and arrowheads stay a constant size on screen */
export const pen = (zoom: number) => {
  Z = zoom;
};
export const px = (v: number) => v / Z;

export interface StrokeOpts {
  w?: number;
  color?: string;
  dash?: number[];
  alpha?: number;
  /** Soft cyan bloom behind the line, like light bleeding on cyanotype */
  glow?: number;
  cap?: CanvasLineCap;
}

export const stroke = (c: Ctx, p: Path2D, o: StrokeOpts = {}) => {
  const w = px(o.w ?? 2);
  c.save();
  c.lineCap = o.cap ?? 'round';
  c.lineJoin = 'round';
  const a = o.alpha ?? 1;
  if (a <= 0.004) {
    c.restore();
    return;
  }
  if (o.glow) {
    c.globalAlpha = a * 0.14 * o.glow;
    c.strokeStyle = BP.cyan;
    c.lineWidth = w * 4.5;
    c.setLineDash(o.dash ? o.dash.map(px) : []);
    c.stroke(p);
  }
  c.globalAlpha = a;
  c.strokeStyle = o.color ?? BP.line;
  c.lineWidth = w;
  c.setLineDash(o.dash ? o.dash.map(px) : []);
  c.stroke(p);
  c.restore();
};

/* ---------- partial (drawn-on) geometry ---------- */

export const lengths = (pts: Pt[], closed: boolean) => {
  const out = [0];
  const n = pts.length + (closed ? 1 : 0);
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    out.push(out[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
};

/** Path of the first k (0..1) of a polyline by arc length */
export const partial = (pts: Pt[], k: number, closed = false, path: Path2D = new Path2D()) => {
  if (k <= 0 || pts.length < 2) return path;
  if (k >= 1) {
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    if (closed) path.closePath();
    return path;
  }
  const L = lengths(pts, closed);
  const target = k * L[L.length - 1];
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < L.length; i++) {
    const b = pts[i % pts.length];
    if (L[i] >= target) {
      const a = pts[i - 1];
      const f = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
      path.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
      break;
    }
    path.lineTo(b[0], b[1]);
  }
  return path;
};

/** Sample a Catmull-Rom spline through pts into a dense polyline (for drawn-on curves) */
export const splinePts = (pts: Pt[], per = 8, closed = false): Pt[] => {
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
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c2: number, d: number) =>
        0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
};

/** Arc as points (for drawn-on outlines that include curves) */
export const arcPts = (cx: number, cy: number, rad: number, a0: number, a1: number, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  });

/** Pen tip position at progress k, for a small bright nib */
export const tipAt = (pts: Pt[], k: number, closed = false): Pt => {
  const L = lengths(pts, closed);
  const target = clamp(k) * L[L.length - 1];
  for (let i = 1; i < L.length; i++) {
    if (L[i] >= target) {
      const a = pts[i - 1];
      const b = pts[i % pts.length];
      const f = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
      return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
    }
  }
  return pts[pts.length - 1];
};

/** Draw a polyline on with progress k; a little glowing nib rides the tip while drawing */
export const drawOn = (c: Ctx, pts: Pt[], k: number, o: StrokeOpts & { closed?: boolean; nib?: boolean } = {}) => {
  if (k <= 0) return;
  stroke(c, partial(pts, k, o.closed), o);
  if (o.nib !== false && k < 1) {
    const [x, y] = tipAt(pts, k, o.closed);
    c.save();
    c.globalAlpha = (o.alpha ?? 1) * 0.9;
    c.fillStyle = BP.line;
    c.beginPath();
    c.arc(x, y, px(2.6), 0, TAU);
    c.fill();
    c.globalAlpha = (o.alpha ?? 1) * 0.25;
    c.fillStyle = BP.cyan;
    c.beginPath();
    c.arc(x, y, px(9), 0, TAU);
    c.fill();
    c.restore();
  }
};

/** Arc drawn on from a0 sweeping `sweep` radians, by progress k */
export const arcOn = (c: Ctx, cx: number, cy: number, rad: number, k: number, o: StrokeOpts & { a0?: number; sweep?: number } = {}) => {
  if (k <= 0) return;
  const a0 = o.a0 ?? -Math.PI / 2;
  const sweep = o.sweep ?? TAU;
  const p = new Path2D();
  p.arc(cx, cy, Math.max(0.1, rad), a0, a0 + sweep * clamp(k));
  stroke(c, p, o);
};

export const circle = (cx: number, cy: number, rad: number, p: Path2D = new Path2D()) => {
  p.moveTo(cx + rad, cy);
  p.arc(cx, cy, Math.max(0.1, rad), 0, TAU);
  return p;
};
export const line = (x0: number, y0: number, x1: number, y1: number, p: Path2D = new Path2D()) => {
  p.moveTo(x0, y0);
  p.lineTo(x1, y1);
  return p;
};
export const rect = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

/** Translucent wash inside a part, the "filled" tone of a blueprint */
export const wash = (c: Ctx, p: Path2D, a = 0.12, color: string = BP.cyan) => {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fill(p);
  c.restore();
};

/** Section hatching at 45 degrees clipped to p */
export const hatch = (c: Ctx, p: Path2D, box: [number, number, number, number], o: StrokeOpts & { gap?: number; angle?: number } = {}) => {
  const [x, y, w, h] = box;
  const gap = o.gap ?? 12;
  const ang = o.angle ?? Math.PI / 4;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = Math.hypot(w, h) / 2 + gap;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const lines = new Path2D();
  for (let d = -R; d <= R; d += gap) {
    const ox = cx - sa * d;
    const oy = cy + ca * d;
    lines.moveTo(ox - ca * R, oy - sa * R);
    lines.lineTo(ox + ca * R, oy + sa * R);
  }
  c.save();
  c.clip(p);
  stroke(c, lines, { w: o.w ?? 1, color: o.color ?? BP.pale, alpha: o.alpha ?? 0.8 });
  c.restore();
};

/* ---------- annotation ---------- */

export const arrowHead = (c: Ctx, x: number, y: number, ang: number, color: string = BP.line, size = 13, alpha = 1) => {
  const s = px(size);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - Math.cos(ang - 0.26) * s, y - Math.sin(ang - 0.26) * s);
  c.lineTo(x - Math.cos(ang + 0.26) * s, y - Math.sin(ang + 0.26) * s);
  c.closePath();
  c.fill();
  c.restore();
};

export interface TextOpts {
  size?: number;
  color?: string;
  font?: string;
  weight?: number;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  alpha?: number;
  spacing?: number;
  /** Screen-constant size (divides by zoom) */
  screen?: boolean;
  rot?: number;
}

/** Lettering. With `k` < 1 only the first characters are typed out */
export const letter = (c: Ctx, text: string, x: number, y: number, o: TextOpts = {}, k = 1) => {
  if (k <= 0) return;
  const shown = k >= 1 ? text : text.slice(0, Math.ceil(text.length * k));
  const size = o.screen ? px(o.size ?? 16) : (o.size ?? 16);
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  c.fillStyle = o.color ?? BP.line;
  c.font = `${o.weight ?? 500} ${size}px ${o.font ?? TECH}`;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.base ?? 'alphabetic';
  c.translate(x, y);
  if (o.rot) c.rotate(o.rot);
  if (o.spacing) {
    const sp = o.screen ? px(o.spacing) : o.spacing;
    const full = Array.from(text);
    const widths = full.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + sp * (full.length - 1);
    const al = c.textAlign;
    let cx = al === 'center' ? -total / 2 : al === 'right' || al === 'end' ? -total : 0;
    c.textAlign = 'left';
    Array.from(shown).forEach((ch, i) => {
      c.fillText(ch, cx, 0);
      cx += widths[i] + sp;
    });
  } else c.fillText(shown, 0, 0);
  c.restore();
};

/**
 * Dimension line between a and b, offset perpendicular by `off`, with extension lines,
 * arrowheads and a centred value. k draws it on (extensions, then the line, then the text).
 */
export const dim = (c: Ctx, a: Pt, b: Pt, off: number, label: string, k = 1, o: { color?: string; size?: number; alpha?: number } = {}) => {
  if (k <= 0) return;
  const color = o.color ?? BP.cyan;
  const alpha = o.alpha ?? 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const A: Pt = [a[0] + nx * off, a[1] + ny * off];
  const B: Pt = [b[0] + nx * off, b[1] + ny * off];
  const ke = clamp(k / 0.3);
  const ext = new Path2D();
  const sg = Math.sign(off) || 1;
  const gap = px(6) * sg;
  const over = px(10) * sg;
  ext.moveTo(a[0] + nx * gap, a[1] + ny * gap);
  ext.lineTo(a[0] + nx * lerp(gap, off + over, ke), a[1] + ny * lerp(gap, off + over, ke));
  ext.moveTo(b[0] + nx * gap, b[1] + ny * gap);
  ext.lineTo(b[0] + nx * lerp(gap, off + over, ke), b[1] + ny * lerp(gap, off + over, ke));
  stroke(c, ext, { w: 1, color, alpha: alpha * 0.85 });
  const kl = clamp((k - 0.2) / 0.5);
  if (kl > 0) {
    const mx = (A[0] + B[0]) / 2;
    const my = (A[1] + B[1]) / 2;
    const p = new Path2D();
    p.moveTo(lerp(mx, A[0], kl), lerp(my, A[1], kl));
    p.lineTo(lerp(mx, B[0], kl), lerp(my, B[1], kl));
    stroke(c, p, { w: 1.2, color, alpha });
    const ang = Math.atan2(dy, dx);
    if (kl > 0.95) {
      arrowHead(c, A[0], A[1], ang + Math.PI, color, 12, alpha);
      arrowHead(c, B[0], B[1], ang, color, 12, alpha);
    }
  }
  const kt = clamp((k - 0.6) / 0.4);
  if (kt > 0) {
    let ang = Math.atan2(dy, dx);
    if (ang > Math.PI / 2 - 1e-3 || ang < -Math.PI / 2 - 1e-3) ang += Math.PI;
    const mx = (A[0] + B[0]) / 2 + nx * px(4) * sg;
    const my = (A[1] + B[1]) / 2 + ny * px(4) * sg;
    // Paper-coloured gap behind the value
    const size = px(o.size ?? 15);
    c.save();
    c.translate(mx, my);
    c.rotate(ang);
    c.font = `600 ${size}px ${TECH}`;
    const w = c.measureText(label).width;
    c.fillStyle = BP.paper;
    c.globalAlpha = alpha;
    c.fillRect(-w / 2 - px(5), -size * 0.62, w + px(10), size * 1.2);
    c.restore();
    letter(c, label, mx, my, { size, color, align: 'center', base: 'middle', alpha, weight: 600, rot: ang }, kt);
  }
};

/**
 * Callout: dot on the part, leader to an elbow, a short shelf and a label (with an optional
 * numbered balloon). k draws leader then types the label.
 */
export const callout = (
  c: Ctx,
  at: Pt,
  elbow: Pt,
  label: string,
  k = 1,
  o: { num?: string; color?: string; alpha?: number; size?: number; shelf?: number } = {}
) => {
  if (k <= 0) return;
  const color = o.color ?? BP.line;
  const alpha = o.alpha ?? 1;
  const dir = elbow[0] >= at[0] ? 1 : -1;
  const shelf = px(o.shelf ?? 26) * dir;
  const pts: Pt[] = [at, elbow, [elbow[0] + shelf, elbow[1]]];
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.arc(at[0], at[1], px(3.2), 0, TAU);
  c.fill();
  c.restore();
  drawOn(c, pts, clamp(k / 0.5), { w: 1.1, color, alpha, nib: false });
  const kt = clamp((k - 0.45) / 0.55);
  if (kt <= 0) return;
  const size = px(o.size ?? 15);
  let tx = elbow[0] + shelf + px(8) * dir;
  if (o.num) {
    const br = size * 0.95;
    const bx = tx + br * dir;
    arcOn(c, bx, elbow[1], br, kt, { w: 1.2, color, alpha });
    letter(c, o.num, bx, elbow[1] + size * 0.05, { size: size * 0.92, color, align: 'center', base: 'middle', alpha, weight: 700 }, kt);
    tx = bx + (br + px(8)) * dir;
  }
  letter(c, label, tx, elbow[1], { size, color, align: dir > 0 ? 'left' : 'right', base: 'middle', alpha, weight: 600, spacing: px(1.5) }, kt);
};

/** Small centre cross for circles */
export const centreMark = (c: Ctx, x: number, y: number, size: number, alpha = 1) => {
  const p = new Path2D();
  p.moveTo(x - size, y);
  p.lineTo(x + size, y);
  p.moveTo(x, y - size);
  p.lineTo(x, y + size);
  stroke(c, p, { w: 1, color: BP.cyan, dash: DASH.centre, alpha });
};

/* ---------- sheet: background, grid, creases, border, title block ---------- */

export interface Sheet {
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
}

/** Cached sheet: blue wash with mottling, uneven exposure and edge burn (under), folds (over) */
export const makeSheet = (r: Riso, seed: number): Sheet => {
  const W = r.W;
  const H = r.H;
  const rng = mulberry(seed);
  const u = r.scratch(W, H);
  const c = u.ctx;
  const g = c.createRadialGradient(W * 0.46, H * 0.42, 80, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#1b5598');
  g.addColorStop(0.65, BP.paper);
  g.addColorStop(1, '#0e386c');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Uneven exposure: big soft blooms, lighter and darker
  for (let i = 0; i < 46; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const rad = 80 + rng() * 300;
    const gg = c.createRadialGradient(x, y, 0, x, y, rad);
    const light = rng() < 0.5;
    gg.addColorStop(0, light ? 'rgba(120,180,240,0.07)' : 'rgba(5,20,50,0.09)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Fine fibre streaks
  c.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const a = rng() * TAU;
    const l = 2 + rng() * 8;
    c.strokeStyle = rng() < 0.5 ? 'rgba(200,230,255,0.06)' : 'rgba(0,10,30,0.08)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  // Edge burn
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(3,14,36,0.42)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);

  const o = r.scratch(W, H);
  const d = o.ctx;
  // Folds: one vertical, one horizontal, each a dark valley next to a lit ridge
  const fold = (vertical: boolean, at: number, jitter: number) => {
    const n = 18;
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const off = (rng() - 0.5) * jitter;
      pts.push(vertical ? [at + off, k * H] : [k * W, at + off]);
    }
    const draw = (dx: number, dy: number, col: string, w: number) => {
      d.strokeStyle = col;
      d.lineWidth = w;
      d.beginPath();
      pts.forEach(([x, y], i) => (i ? d.lineTo(x + dx, y + dy) : d.moveTo(x + dx, y + dy)));
      d.stroke();
    };
    const sx = vertical ? 1 : 0;
    const sy = vertical ? 0 : 1;
    draw(-sx * 3, -sy * 3, 'rgba(2,12,32,0.16)', 10);
    draw(-sx, -sy, 'rgba(2,12,32,0.22)', 2.2);
    draw(sx * 1.5, sy * 1.5, 'rgba(200,232,255,0.14)', 1.6);
    draw(sx * 5, sy * 5, 'rgba(160,210,255,0.05)', 9);
  };
  fold(true, W * 0.5 + 3, 2.4);
  fold(false, H * 0.5 - 2, 2.4);
  fold(true, W * 0.25 - 4, 1.6);
  // Edge wear / small nicks
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    const x = side === 0 ? t * W : side === 1 ? W : side === 2 ? t * W : 0;
    const y = side === 0 ? 0 : side === 1 ? t * H : side === 2 ? H : t * H;
    const rad = 10 + rng() * 40;
    const gg = d.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, 'rgba(180,220,250,0.10)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = gg;
    d.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return { under: u.canvas, over: o.canvas };
};

/** Paint the cached sheet in screen space (resets the transform for the draw) */
export const sheetUnder = (r: Riso, c: Ctx, s: Sheet) => {
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  c.drawImage(s.under, 0, 0, r.W, r.H);
  c.restore();
};
export const sheetOver = (r: Riso, c: Ctx, s: Sheet) => {
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  c.drawImage(s.over, 0, 0, r.W, r.H);
  c.restore();
};

/**
 * World-space grid that subdivides as you zoom: the visible region is computed from the camera.
 * Each decade of spacing fades in as it reaches a readable size on screen.
 */
export const grid = (c: Ctx, cx: number, cy: number, zoom: number, W = 1600, H = 900, rot = 0, alpha = 1) => {
  const halfW = W / 2 / zoom;
  const halfH = H / 2 / zoom;
  const R = rot ? Math.hypot(halfW, halfH) : 0;
  const x0 = cx - (R || halfW);
  const x1 = cx + (R || halfW);
  const y0 = cy - (R || halfH);
  const y1 = cy + (R || halfH);
  const levels = [5, 25, 125, 625];
  for (const sp of levels) {
    const screen = sp * zoom;
    const a = clamp((screen - 8) / 30) * (screen > 900 ? clamp(1 - (screen - 900) / 900) : 1);
    if (a <= 0.01) continue;
    const major = sp >= 125 || screen > 150;
    const p = new Path2D();
    for (let x = Math.ceil(x0 / sp) * sp; x <= x1; x += sp) {
      p.moveTo(x, y0);
      p.lineTo(x, y1);
    }
    for (let y = Math.ceil(y0 / sp) * sp; y <= y1; y += sp) {
      p.moveTo(x0, y);
      p.lineTo(x1, y);
    }
    c.save();
    c.globalAlpha = a * alpha * (major ? 0.2 : 0.11);
    c.strokeStyle = '#bfe0ff';
    c.lineWidth = px(major ? 1 : 0.7);
    c.stroke(p);
    c.restore();
  }
};

export interface TitleFields {
  title: string;
  sub: string;
  dwg: string;
  scale: string;
  sheet: string;
  by: string;
}

/** Border with zone ticks and a title block in the lower-right, in screen space. k fills it in */
export const border = (r: Riso, c: Ctx, f: TitleFields, k: number, titleK: number) => {
  const W = r.W;
  const H = r.H;
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  const prev = Z;
  Z = 1;
  const m = 22;
  const outer: Pt[] = [
    [m, m],
    [W - m, m],
    [W - m, H - m],
    [m, H - m],
  ];
  drawOn(c, outer, k, { closed: true, w: 2, color: BP.line, alpha: 0.75, nib: false });
  // Zone ticks and letters along the border
  if (k > 0.6) {
    const a = clamp((k - 0.6) / 0.4) * 0.6;
    const ticks = new Path2D();
    for (let i = 1; i < 8; i++) {
      const x = m + ((W - 2 * m) * i) / 8;
      ticks.moveTo(x, m);
      ticks.lineTo(x, m + 9);
      ticks.moveTo(x, H - m);
      ticks.lineTo(x, H - m - 9);
    }
    for (let i = 1; i < 4; i++) {
      const y = m + ((H - 2 * m) * i) / 4;
      ticks.moveTo(m, y);
      ticks.lineTo(m + 9, y);
      ticks.moveTo(W - m, y);
      ticks.lineTo(W - m - 9, y);
    }
    stroke(c, ticks, { w: 1.2, alpha: a });
    for (let i = 0; i < 8; i++) {
      letter(c, String(i + 1), m + ((W - 2 * m) * (i + 0.5)) / 8, m + 14, { size: 10, align: 'center', alpha: a, color: BP.cyan });
    }
    for (let i = 0; i < 4; i++) {
      letter(c, 'ABCD'[i], m + 8, m + ((H - 2 * m) * (i + 0.5)) / 4 + 4, { size: 10, align: 'center', alpha: a, color: BP.cyan });
    }
  }
  // Title block
  if (titleK > 0) {
    const bw = 400;
    const bh = 118;
    const bx = W - m - bw;
    const by = H - m - bh;
    const kk = clamp(titleK / 0.4);
    const box = new Path2D();
    box.rect(bx, by, bw, bh);
    c.save();
    c.globalAlpha = 0.55 * kk;
    c.fillStyle = BP.deep;
    c.fill(box);
    c.restore();
    drawOn(c, [[bx, by + bh], [bx, by], [W - m, by]], kk, { w: 2, alpha: 0.85, nib: false });
    const rows = new Path2D();
    rows.moveTo(bx, by + 62);
    rows.lineTo(bx + bw, by + 62);
    rows.moveTo(bx, by + 90);
    rows.lineTo(bx + bw, by + 90);
    rows.moveTo(bx + 150, by + 62);
    rows.lineTo(bx + 150, by + bh);
    rows.moveTo(bx + 270, by + 62);
    rows.lineTo(bx + 270, by + bh);
    stroke(c, rows, { w: 1, alpha: 0.6 * kk, color: BP.cyan });
    const kt = clamp((titleK - 0.3) / 0.7);
    letter(c, 'TITLE', bx + 10, by + 15, { size: 9, color: BP.cyan, alpha: 0.8 * kk, spacing: 1.5 });
    letter(c, f.title, bx + 10, by + 50, { size: 34, font: GOTHIC, weight: 700, spacing: 2.5 }, kt);
    letter(c, f.sub, bx + bw - 10, by + 15, { size: 9, color: BP.cyan, align: 'right', spacing: 1.2, alpha: 0.9 }, kt);
    const cell = (x: number, y: number, head: string, val: string) => {
      letter(c, head, x + 8, y + 11, { size: 8, color: BP.cyan, alpha: 0.75 * kk, spacing: 1.2 });
      letter(c, val, x + 8, y + 24, { size: 12, weight: 700, spacing: 1 }, kt);
    };
    cell(bx, by + 62, 'DWG NO.', f.dwg);
    cell(bx + 150, by + 62, 'SCALE', f.scale);
    cell(bx + 270, by + 62, 'SHEET', f.sheet);
    cell(bx, by + 90, 'DRAWN', f.by);
    cell(bx + 150, by + 90, 'CHECKED', '—');
    cell(bx + 270, by + 90, 'REV', 'A');
  }
  Z = prev;
  c.restore();
};

/** A soft accent glow (combustion, signal) */
export const flare = (c: Ctx, x: number, y: number, rad: number, a: number, color: string = BP.accent) => {
  if (a <= 0.01) return;
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, 'rgba(255,122,46,0)');
  c.save();
  c.globalAlpha = a;
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, rad, 0, TAU);
  c.fill();
  c.restore();
};

/* ---------- review marks: revision clouds, stamps, dimension chains ---------- */

/** Revision cloud: scalloped outline around a box, drawn on by k, with a delta tag */
export const revCloud = (c: Ctx, x: number, y: number, w: number, h: number, rev: string, k = 1, o: { size?: number; alpha?: number; color?: string } = {}) => {
  if (k <= 0) return;
  const color = o.color ?? BP.line;
  const alpha = o.alpha ?? 1;
  const s = o.size ?? Math.max(14, Math.min(w, h) / 5);
  const per = 2 * (w + h);
  const n = Math.max(8, Math.round(per / s));
  const corner = (d: number): Pt => {
    const p = ((d % per) + per) % per;
    if (p < w) return [x + p, y];
    if (p < w + h) return [x + w, y + p - w];
    if (p < 2 * w + h) return [x + w - (p - w - h), y + h];
    return [x, y + h - (p - 2 * w - h)];
  };
  const shown = Math.ceil(n * clamp(k));
  const p = new Path2D();
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let i = 0; i < shown; i++) {
    const a = corner((i / n) * per);
    const b = corner(((i + 1) / n) * per);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    // Bulge away from the centre
    const ox = mx - cx;
    const oy = my - cy;
    const ol = Math.hypot(ox, oy) || 1;
    const bump = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.55;
    if (i === 0) p.moveTo(a[0], a[1]);
    p.quadraticCurveTo(mx + (ox / ol) * bump, my + (oy / ol) * bump, b[0], b[1]);
  }
  stroke(c, p, { w: 1.5, color, alpha });
  if (k >= 1) {
    const tx = x + w + s * 0.9;
    const ty = y - s * 0.6;
    const ts = px(15);
    const tri = new Path2D();
    tri.moveTo(tx, ty - ts);
    tri.lineTo(tx + ts * 0.95, ty + ts * 0.65);
    tri.lineTo(tx - ts * 0.95, ty + ts * 0.65);
    tri.closePath();
    stroke(c, tri, { w: 1.4, color, alpha });
    letter(c, rev, tx, ty + ts * 0.18, { size: ts * 0.8, color, align: 'center', base: 'middle', weight: 700, alpha });
  }
};

/**
 * Rubber stamp in the accent ink: double border, spaced capitals, slammed in at k (scale
 * overshoot) with seeded ink skips so it reads as a hand stamp.
 */
export const stamp = (c: Ctx, x: number, y: number, text: string, k: number, o: { size?: number; rot?: number; sub?: string; seed?: number; color?: string } = {}) => {
  if (k <= 0) return;
  const size = o.size ?? 40;
  const color = o.color ?? BP.accent;
  const slam = k < 1 ? 1 + 0.9 * Math.pow(1 - k, 3) : 1;
  const a = clamp(k * 3) * 0.92;
  c.save();
  c.translate(x, y);
  c.rotate(o.rot ?? -0.12);
  c.scale(slam, slam);
  c.font = `700 ${size}px ${GOTHIC}`;
  const sp = size * 0.18;
  const tw = Array.from(text).reduce((acc, ch) => acc + c.measureText(ch).width, 0) + sp * (text.length - 1);
  const w = tw + size * 1.1;
  const h = size * (o.sub ? 1.75 : 1.35);
  c.globalAlpha = a;
  c.strokeStyle = color;
  c.lineWidth = size * 0.07;
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, size * 0.16);
  c.stroke();
  c.lineWidth = size * 0.03;
  c.beginPath();
  c.roundRect(-w / 2 + size * 0.12, -h / 2 + size * 0.12, w - size * 0.24, h - size * 0.24, size * 0.1);
  c.stroke();
  c.restore();
  c.save();
  c.translate(x, y);
  c.rotate(o.rot ?? -0.12);
  c.scale(slam, slam);
  c.globalAlpha = a;
  c.fillStyle = color;
  c.font = `700 ${size}px ${GOTHIC}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  let cx = -tw / 2;
  for (const ch of Array.from(text)) {
    c.fillText(ch, cx, o.sub ? -size * 0.16 : size * 0.04);
    cx += c.measureText(ch).width + sp;
  }
  if (o.sub) {
    c.font = `600 ${size * 0.32}px ${TECH}`;
    c.textAlign = 'center';
    c.fillText(o.sub, 0, size * 0.5);
  }
  // Ink skips (paper showing through)
  const rng = mulberry(o.seed ?? 5);
  c.globalAlpha = 0.8 * a;
  c.fillStyle = BP.paper;
  for (let i = 0; i < 70; i++) {
    const sx = (rng() - 0.5) * w;
    const sy = (rng() - 0.5) * h;
    c.beginPath();
    c.arc(sx, sy, size * (0.01 + rng() * rng() * 0.05), 0, TAU);
    c.fill();
  }
  c.restore();
};

/** A chain of dimensions sharing one baseline: pts along a line, one label per span */
export const dimChain = (c: Ctx, pts: Pt[], off: number, labels: string[], k = 1, o: { color?: string; size?: number; alpha?: number } = {}) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const kk = clamp(k * (pts.length - 1) * 1.25 - i * 1.0);
    dim(c, pts[i], pts[i + 1], off, labels[i] ?? '', kk, o);
  }
};
