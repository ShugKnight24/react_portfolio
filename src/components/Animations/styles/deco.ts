/**
 * Art deco helpers shared by the Art deco series (direct mode films).
 *
 * The look of a 1920s-30s travel poster: gold leaf (a metallic gradient with a moving sheen) on
 * deep navy, emerald and black, cream and coral accents, airbrushed soft gradients, sunbursts and
 * fans, stepped ziggurat forms, streamlined speed lines, wide-tracked geometric sans lettering and
 * ornamental frames that draw themselves in. Everything is deterministic and cheap per frame.
 */
import type { Ctx, Riso } from '../riso/engine';
import { TAU, clamp, lerp, mulberry, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const DECO = {
  midnight: '#0a1226',
  navy: '#14234a',
  blue: '#25407a',
  steel: '#5d7fa6',
  ink: '#0c0d11',
  emerald: '#0f4a41',
  jade: '#2c7866',
  deepGreen: '#082b26',
  cream: '#f3e6c8',
  ivory: '#fbf4e2',
  coral: '#e4704f',
  salmon: '#f1a07c',
  peach: '#f7c99a',
  orange: '#e3892b',
  rust: '#a5441f',
  maroon: '#5a1d1a',
  red: '#b8352b',
  gold: '#cfa349',
  goldHi: '#f7e3a1',
  goldLo: '#7a5520',
  goldDeep: '#4d3412',
} as const;

/** Wide-tracked geometric sans for the lettering */
export const DECO_SANS = '"Futura", "Century Gothic", "Avenir Next", "Josefin Sans", "Gill Sans", "Helvetica Neue", Arial, sans-serif';

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

/* ---------- paths ---------- */

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

export const rrect = (x: number, y: number, w: number, h: number, rad: number, p: Path2D = new Path2D()) => {
  const r = Math.max(0.1, Math.min(rad, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
};

/** Gear outline: trapezoid teeth around a rim */
export const gearPts = (cx: number, cy: number, rOut: number, rIn: number, teeth: number, rot = 0): Pt[] => {
  const pts: Pt[] = [];
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    const q = [
      [a - step * 0.5, rIn],
      [a - step * 0.24, rIn],
      [a - step * 0.15, rOut],
      [a + step * 0.15, rOut],
      [a + step * 0.24, rIn],
    ] as const;
    for (const [aa, rr] of q) pts.push([cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr]);
  }
  return pts;
};

/** Spiky sun outline (a disc with n rays) — morphs well into a gear of the same count */
export const sunPts = (cx: number, cy: number, r: number, rays: number, len: number, rot = 0, n = 360): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * TAU;
    const w = Math.abs(((((a - rot) / TAU) * rays) % 1) - 0.5) * 2; // 1 at ray centre .. 0 between
    const rr = r + len * Math.pow(Math.max(0, w), 3.2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Pt;
  });

/**
 * Symmetric stepped (ziggurat) outline. Tiers are listed bottom-up as [halfWidth, height].
 * Returns the closed outline, base centred at (cx, baseY).
 */
export const zigguratPts = (cx: number, baseY: number, tiers: [number, number][]): Pt[] => {
  const right: Pt[] = [];
  let y = baseY;
  for (const [hw, h] of tiers) {
    right.push([cx + hw, y]);
    y -= h;
    right.push([cx + hw, y]);
  }
  const left = right.map(([x, yy]) => [2 * cx - x, yy] as Pt).reverse();
  return [...right, ...left];
};

/** First k (0..1) of a polyline by arc length, as a path */
export const partial = (pts: Pt[], k: number, p: Path2D = new Path2D()) => {
  if (k <= 0 || pts.length < 2) return p;
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = clamp(k) * L[L.length - 1];
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (L[i] >= target) {
      const f = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
      p.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
      break;
    }
    p.lineTo(pts[i][0], pts[i][1]);
  }
  return p;
};

/* ---------- gold leaf ---------- */

/** Metallic gold gradient along (x0,y0)-(x1,y1); `warm` pushes it toward copper */
export const goldGrad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, warm = 0) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const lo = mix(DECO.goldLo, DECO.rust, warm);
  const mid = mix(DECO.gold, DECO.orange, warm);
  const hi = mix(DECO.goldHi, DECO.peach, warm * 0.7);
  g.addColorStop(0, lo);
  g.addColorStop(0.2, mid);
  g.addColorStop(0.36, hi);
  g.addColorStop(0.5, mid);
  g.addColorStop(0.66, lo);
  g.addColorStop(0.82, mid);
  g.addColorStop(0.93, hi);
  g.addColorStop(1, mid);
  return g;
};

/** Bright vertical gold for lettering between y0 (cap height) and y1 (baseline) */
export const letterGold = (c: Ctx, y0: number, y1: number) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, DECO.goldHi);
  g.addColorStop(0.45, '#e8c46e');
  g.addColorStop(0.55, DECO.gold);
  g.addColorStop(0.8, '#e9c873');
  g.addColorStop(1, '#a87a30');
  return g;
};

/** Transparent fill with one bright band at k (0..1) across x0..x1, for a sheen pass over text */
export const sheenGrad = (c: Ctx, x0: number, x1: number, k: number, a = 0.9) => {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  const p = clamp(k);
  g.addColorStop(0, 'rgba(255,252,240,0)');
  g.addColorStop(clamp(p - 0.08), 'rgba(255,252,240,0)');
  g.addColorStop(p, `rgba(255,253,245,${a})`);
  g.addColorStop(clamp(p + 0.08), 'rgba(255,252,240,0)');
  g.addColorStop(1, 'rgba(255,252,240,0)');
  return g;
};

export interface GiltOpts {
  /** Sheen sweep position 0..1 across the box (outside that range: no sheen) */
  sheen?: number;
  /** Angle of the gradient across the box (radians), default diagonal */
  angle?: number;
  warm?: number;
  /** Sheen strength */
  shine?: number;
  rule?: CanvasFillRule;
}

/** Fill a path with gold leaf; box is [x, y, w, h] the gradient and sheen span */
export const gilt = (c: Ctx, p: Path2D, box: [number, number, number, number], o: GiltOpts = {}) => {
  const [x, y, w, h] = box;
  const ang = o.angle ?? 0.9;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = (Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * h) / 2;
  const dx = Math.cos(ang) * R;
  const dy = Math.sin(ang) * R;
  c.fillStyle = goldGrad(c, cx - dx, cy - dy, cx + dx, cy + dy, o.warm ?? 0);
  c.fill(p, o.rule ?? 'nonzero');
  if (o.sheen !== undefined && o.sheen > -0.4 && o.sheen < 1.4) sheen(c, p, box, o.sheen, ang, o.shine ?? 0.85, o.rule);
};

/** Moving highlight band clipped to p */
export const sheen = (
  c: Ctx,
  p: Path2D,
  box: [number, number, number, number],
  k: number,
  ang = 0.9,
  a = 0.85,
  rule: CanvasFillRule = 'nonzero'
) => {
  const [x, y, w, h] = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = (Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * h) / 2 + 40;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const pos = lerp(-R * 1.2, R * 1.2, k);
  const bw = Math.max(26, R * 0.22);
  const g = c.createLinearGradient(cx + ux * (pos - bw), cy + uy * (pos - bw), cx + ux * (pos + bw), cy + uy * (pos + bw));
  g.addColorStop(0, 'rgba(255,248,220,0)');
  g.addColorStop(0.45, `rgba(255,250,228,${a * 0.7})`);
  g.addColorStop(0.5, `rgba(255,255,245,${a})`);
  g.addColorStop(0.56, `rgba(255,250,228,${a * 0.6})`);
  g.addColorStop(1, 'rgba(255,248,220,0)');
  c.save();
  c.clip(p, rule);
  c.fillStyle = g;
  c.fillRect(x - 20, y - 20, w + 40, h + 40);
  c.restore();
};

/** Gold stroke for a path (keylines, rings, pinstripes) */
export const giltStroke = (c: Ctx, p: Path2D, box: [number, number, number, number], lw: number, warm = 0) => {
  const [x, y, w, h] = box;
  c.strokeStyle = goldGrad(c, x, y, x + w, y + h, warm);
  c.lineWidth = lw;
  c.stroke(p);
};

/* ---------- airbrush ---------- */

/** Linear gradient from a list of [stop, colour] */
export const grad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [s, col] of stops) g.addColorStop(clamp(s), col);
  return g;
};

/** Radial gradient from a list of [stop, colour] */
export const radial = (c: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) => {
  const g = c.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(r0 + 0.1, r1));
  for (const [s, col] of stops) g.addColorStop(clamp(s), col);
  return g;
};

/** Soft airbrushed glow */
export const glow = (c: Ctx, x: number, y: number, r: number, color: string, a = 1) => {
  if (a <= 0 || r <= 0) return;
  c.fillStyle = radial(c, x, y, 0, r, [
    [0, rgba(color, a)],
    [0.35, rgba(color, a * 0.45)],
    [1, rgba(color, 0)],
  ]);
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

/**
 * Fine airbrush spatter tile (light and dark specks). Fill over a gradient at low alpha so the
 * airbrushed fields have the grain of a lithograph instead of digital smoothness.
 */
export const makeSpray = (r: Riso, seed = 5, size = 220): CanvasPattern => {
  const { canvas, ctx } = r.scratch(size, size);
  const rng = mulberry(seed);
  for (let i = 0; i < size * size * 0.06; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const dark = rng() < 0.55;
    ctx.fillStyle = dark ? `rgba(0,0,0,${0.08 + rng() * 0.16})` : `rgba(255,248,230,${0.06 + rng() * 0.14})`;
    const s = 0.5 + rng() * rng() * 1.6;
    ctx.fillRect(x, y, s, s);
  }
  const p = ctx.createPattern(canvas, 'repeat');
  if (!p) throw new Error('pattern');
  p.setTransform(new DOMMatrix().scale(1 / r.scale, 1 / r.scale));
  return p;
};

/* ---------- motifs ---------- */

export interface BurstOpts {
  r0: number;
  r1: number;
  /** Number of rays */
  n: number;
  /** Start angle and angular span; default a full circle */
  a0?: number;
  span?: number;
  /** Ray fraction of each slot (0..1) */
  width?: number;
  /** Build progress 0..1: rays grow out from the centre ray of the span */
  k?: number;
  stagger?: number;
  /** Alternate long/short rays */
  alt?: number;
  /** Wedge rays (wide outside) or tapered beams (thin outside) */
  taper?: boolean;
}

/** Path of sunburst rays */
export const burstPath = (cx: number, cy: number, o: BurstOpts, p: Path2D = new Path2D()) => {
  const span = o.span ?? TAU;
  const a0 = o.a0 ?? -Math.PI / 2;
  const width = o.width ?? 0.5;
  const k = o.k ?? 1;
  const st = o.stagger ?? 0.5;
  const full = span >= TAU - 1e-3;
  for (let i = 0; i < o.n; i++) {
    const f = full ? i / o.n : (i + 0.5) / o.n;
    const a = a0 + f * span;
    const d = full ? 0 : Math.abs(f - 0.5) * 2;
    const gk = clamp((k * (1 + st) - d * st) / 1);
    if (gk <= 0) continue;
    const long = o.alt && i % 2 ? 1 - o.alt : 1;
    const R = lerp(o.r0, o.r0 + (o.r1 - o.r0) * long, gk);
    const hw = ((span / o.n) * width) / 2;
    if (o.taper) {
      p.moveTo(cx + Math.cos(a - hw) * o.r0, cy + Math.sin(a - hw) * o.r0);
      p.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      p.lineTo(cx + Math.cos(a + hw) * o.r0, cy + Math.sin(a + hw) * o.r0);
    } else {
      p.moveTo(cx + Math.cos(a - hw * 0.25) * o.r0, cy + Math.sin(a - hw * 0.25) * o.r0);
      p.lineTo(cx + Math.cos(a - hw) * R, cy + Math.sin(a - hw) * R);
      p.lineTo(cx + Math.cos(a + hw) * R, cy + Math.sin(a + hw) * R);
      p.lineTo(cx + Math.cos(a + hw * 0.25) * o.r0, cy + Math.sin(a + hw * 0.25) * o.r0);
    }
    p.closePath();
  }
  return p;
};

/** A deco fan: a half disc (pointing up) made of n scalloped blades with ribs */
export const fanPath = (cx: number, cy: number, r: number, n: number, k = 1, p: Path2D = new Path2D()) => {
  if (k <= 0) return p;
  const span = Math.PI * k;
  const a0 = -Math.PI / 2 - span / 2;
  p.moveTo(cx, cy);
  for (let i = 0; i < n; i++) {
    const aa = a0 + (i / n) * span;
    const ab = a0 + ((i + 1) / n) * span;
    const am = (aa + ab) / 2;
    p.lineTo(cx + Math.cos(aa) * r * 0.94, cy + Math.sin(aa) * r * 0.94);
    p.quadraticCurveTo(cx + Math.cos(am) * r * 1.1, cy + Math.sin(am) * r * 1.1, cx + Math.cos(ab) * r * 0.94, cy + Math.sin(ab) * r * 0.94);
  }
  p.closePath();
  return p;
};

/** Fan ribs (stroke) */
export const fanRibs = (cx: number, cy: number, r: number, n: number, k = 1, p: Path2D = new Path2D()) => {
  const span = Math.PI * k;
  const a0 = -Math.PI / 2 - span / 2;
  for (let i = 1; i < n; i++) {
    const a = a0 + (i / n) * span;
    p.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
    p.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
  }
  return p;
};

/** Streamline speed lines: horizontal pinstripes whose dashes stream past; `phase` in px */
export const speedLines = (
  c: Ctx,
  x0: number,
  x1: number,
  ys: number[],
  phase: number,
  color: string,
  a = 1,
  lw = 3,
  dash = 420,
  gap = 260
) => {
  if (a <= 0) return;
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = rgba(color, a);
  c.lineWidth = lw;
  c.setLineDash([dash, gap]);
  ys.forEach((y, i) => {
    c.lineDashOffset = phase + i * 173;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  });
  c.restore();
};

/** Searchlight beam: a long soft wedge from (x, y) toward angle ang */
export const beam = (c: Ctx, x: number, y: number, ang: number, len: number, spread: number, color: string, a = 0.3) => {
  if (a <= 0) return;
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const w = len * Math.tan(spread);
  const g = c.createLinearGradient(x, y, ex, ey);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.6, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - nx * 3, y - ny * 3);
  c.lineTo(ex - nx * w, ey - ny * w);
  c.lineTo(ex + nx * w, ey + ny * w);
  c.lineTo(x + nx * 3, y + ny * 3);
  c.closePath();
  c.fill();
};

/* ---------- frame ---------- */

const ease3 = (k: number) => 1 - Math.pow(1 - clamp(k), 3);

export interface FrameOpts {
  inset?: number;
  color?: string;
  /** Second, thinner line colour */
  color2?: string;
  alpha?: number;
  /** Sheen along the gold, 0..1 */
  sheenK?: number;
  /** Fill the margin outside the frame with this colour */
  margin?: string;
}

/**
 * Ornamental poster frame that builds itself: a double rule draws out from the top centre both
 * ways round to the bottom centre, stepped corner brackets snap in as the lines reach the
 * corners, and a fan crest opens at top and bottom centre. Drawn in screen space (1600 x 900).
 */
export const decoFrame = (c: Ctx, k: number, o: FrameOpts = {}) => {
  if (k <= 0) return;
  const ins = o.inset ?? 26;
  const W = 1600;
  const H = 900;
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  if (o.margin) {
    const m = new Path2D();
    m.rect(-20, -20, W + 40, H + 40);
    m.rect(ins, ins, W - ins * 2, H - ins * 2);
    c.fillStyle = o.margin;
    c.globalAlpha = (o.alpha ?? 1) * clamp(k * 3);
    c.fill(m, 'evenodd');
    c.globalAlpha = o.alpha ?? 1;
  }
  const gold = goldGrad(c, 0, 0, W, H);
  const half = (d: number): Pt[] => [
    [W / 2, ins + d],
    [W - ins - d, ins + d],
    [W - ins - d, H - ins - d],
    [W / 2, H - ins - d],
  ];
  const mirror = (pts: Pt[]) => pts.map(([x, y]) => [W - x, y] as Pt);
  const line = new Path2D();
  const thin = new Path2D();
  const kk = clamp(k * 1.25);
  for (const pts of [half(0), mirror(half(0))]) partial(pts, kk, line);
  for (const pts of [half(9), mirror(half(9))]) partial(pts, clamp(kk * 1.03 - 0.03), thin);
  c.lineJoin = 'miter';
  c.strokeStyle = gold;
  c.lineWidth = 4;
  c.stroke(line);
  c.strokeStyle = o.color2 ? o.color2 : gold;
  c.lineWidth = 1.5;
  c.stroke(thin);
  // corner brackets: nested steps
  const perim = (W / 2 - ins) + (H - ins * 2) + (W / 2 - ins);
  const cornerAt = [(W / 2 - ins) / perim, (W / 2 - ins + H - ins * 2) / perim];
  const corners: [number, number, number, number, number][] = [
    [ins, ins, 1, 1, cornerAt[0]],
    [W - ins, ins, -1, 1, cornerAt[0]],
    [ins, H - ins, 1, -1, cornerAt[1]],
    [W - ins, H - ins, -1, -1, cornerAt[1]],
  ];
  const br = new Path2D();
  const dots = new Path2D();
  for (const [x, y, sx, sy, at] of corners) {
    const ck = clamp((kk - at) * 6);
    if (ck <= 0) continue;
    const s = 34 * ck;
    for (let j = 0; j < 3; j++) {
      const d = 16 + j * 9;
      const L = s + j * 12 * ck;
      br.moveTo(x + sx * d, y + sy * (d + L));
      br.lineTo(x + sx * d, y + sy * d);
      br.lineTo(x + sx * (d + L), y + sy * d);
    }
    circle(x + sx * 15, y + sy * 15, 3.2 * ck, dots);
  }
  c.lineWidth = 2;
  c.strokeStyle = gold;
  c.stroke(br);
  c.fillStyle = gold;
  c.fill(dots);
  // fan crests hanging off the rule at top and bottom centre
  const ck = clamp(k * 2.5);
  if (ck > 0) {
    for (const [y, dir] of [
      [ins, -1],
      [H - ins, 1],
    ] as const) {
      c.save();
      c.translate(W / 2, y);
      c.scale(1, dir);
      const fr = 34 * ease3(ck);
      const fan = fanPath(0, 0, fr, 7, 1);
      c.fillStyle = o.color ?? DECO.midnight;
      c.fill(circle(0, 0, fr + 6));
      c.fillStyle = goldGrad(c, -fr, -fr, fr, 0);
      c.fill(fan);
      c.strokeStyle = DECO.goldDeep;
      c.lineWidth = 1.4;
      c.stroke(fanRibs(0, 0, fr, 7, 1));
      c.fillStyle = o.color ?? DECO.midnight;
      c.fill(circle(0, 0, fr * 0.32));
      c.fillStyle = goldGrad(c, -fr, -fr, fr, 0);
      c.fill(circle(0, 0, fr * 0.18));
      c.restore();
    }
  }
  if (o.sheenK !== undefined && o.sheenK > -0.2 && o.sheenK < 1.2) {
    const sp = new Path2D();
    sp.rect(ins - 4, ins - 4, W - ins * 2 + 8, 14);
    sp.rect(ins - 4, H - ins - 10, W - ins * 2 + 8, 14);
    sp.rect(ins - 4, ins - 4, 14, H - ins * 2 + 8);
    sp.rect(W - ins - 10, ins - 4, 14, H - ins * 2 + 8);
    c.save();
    c.clip(sp);
    c.lineWidth = 4;
    const g = c.createLinearGradient(0, 0, W, H);
    const pos = clamp(o.sheenK);
    g.addColorStop(clamp(pos - 0.06), 'rgba(255,250,230,0)');
    g.addColorStop(pos, 'rgba(255,252,240,0.95)');
    g.addColorStop(clamp(pos + 0.06), 'rgba(255,250,230,0)');
    c.strokeStyle = g;
    c.stroke(line);
    c.restore();
  }
  c.restore();
};

/* ---------- lettering ---------- */

/**
 * Wide-tracked deco lettering, centred on x. Letters arrive from the centre outward as k goes
 * 0..1 (each rises a little and opens vertically). fill may be a colour or a gradient.
 */
export const decoText = (
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  spacing: number,
  k: number,
  fill: string | CanvasGradient,
  weight = 500
) => {
  if (k <= 0) return;
  c.save();
  c.font = `${weight} ${size}px ${DECO_SANS}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const chars = Array.from(text);
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const n = chars.length;
  c.fillStyle = fill;
  chars.forEach((ch, i) => {
    const d = Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
    const lk = clamp((k * 1.6 - d * 0.6) / 1);
    if (lk > 0 && ch !== ' ') {
      c.save();
      c.globalAlpha *= clamp(lk * 1.5);
      c.translate(cx + widths[i] / 2, y - size * 0.36);
      c.scale(1, lerp(0.2, 1, lk));
      c.translate(0, (1 - lk) * size * 0.25);
      c.fillText(ch, -widths[i] / 2, size * 0.36);
      c.restore();
    }
    cx += widths[i] + spacing;
  });
  c.restore();
  return total;
};

/** Measured width of tracked text */
export const textWidth = (c: Ctx, text: string, size: number, spacing: number, weight = 500) => {
  c.save();
  c.font = `${weight} ${size}px ${DECO_SANS}`;
  const chars = Array.from(text);
  const w = chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + spacing * (chars.length - 1);
  c.restore();
  return w;
};

/** Thin rule with a diamond in the middle, drawn out from the centre */
export const ruleDiamond = (c: Ctx, x: number, y: number, w: number, k: number, color: string | CanvasGradient, lw = 2) => {
  if (k <= 0) return;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = lw;
  const hw = (w / 2) * clamp(k);
  c.beginPath();
  c.moveTo(x - hw, y);
  c.lineTo(x - 12, y);
  c.moveTo(x + 12, y);
  c.lineTo(x + hw, y);
  c.stroke();
  const d = 7 * clamp(k * 2);
  c.beginPath();
  c.moveTo(x, y - d);
  c.lineTo(x + d, y);
  c.lineTo(x, y + d);
  c.lineTo(x - d, y);
  c.closePath();
  c.fill();
  c.restore();
};

/* ---------- stars ---------- */

export interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}

export const makeStars = (n: number, seed: number, x0: number, x1: number, y0: number, y1: number): Star[] => {
  const rng = mulberry(seed);
  return Array.from({ length: n }, () => ({
    x: lerp(x0, x1, rng()),
    y: lerp(y0, y1, rng() * rng()),
    r: 0.8 + rng() * rng() * 2.4,
    ph: rng() * TAU,
  }));
};

export const drawStars = (c: Ctx, stars: Star[], t: number, color: string, a = 1) => {
  if (a <= 0) return;
  const p = new Path2D();
  const big = new Path2D();
  for (const s of stars) {
    const tw = 0.6 + 0.4 * Math.sin(t * 2.3 + s.ph);
    const r = s.r * tw;
    if (s.r > 2.2) {
      // four-point deco star
      big.moveTo(s.x, s.y - r * 3);
      big.lineTo(s.x + r * 0.6, s.y - r * 0.6);
      big.lineTo(s.x + r * 3, s.y);
      big.lineTo(s.x + r * 0.6, s.y + r * 0.6);
      big.lineTo(s.x, s.y + r * 3);
      big.lineTo(s.x - r * 0.6, s.y + r * 0.6);
      big.lineTo(s.x - r * 3, s.y);
      big.lineTo(s.x - r * 0.6, s.y - r * 0.6);
      big.closePath();
    } else circle(s.x, s.y, r, p);
  }
  c.fillStyle = rgba(color, a);
  c.fill(p);
  c.fill(big);
};

/** Dark soft vignette in screen space */
export const vignette = (c: Ctx, a = 0.5, color: string = DECO.midnight) => {
  if (a <= 0) return;
  c.fillStyle = radial(c, 800, 450, 380, 980, [
    [0, rgba(color, 0)],
    [1, rgba(color, a)],
  ]);
  c.fillRect(-50, -50, 1700, 1000);
};

/* ---------- streamliner (side view, facing right) ---------- */

export interface LinerPalette {
  hi: string;
  top: string;
  mid: string;
  low: string;
  /** Stripes and whiskers */
  stripe?: 'gold' | string;
  window: [string, string];
}

export const NAVY_TRAIN: LinerPalette = {
  hi: '#7e9cc0',
  top: '#3f5d8f',
  mid: DECO.navy,
  low: '#070b18',
  window: ['#ffe6b0', '#f2a46a'],
};

export const EMERALD_TRAIN: LinerPalette = {
  hi: '#9fd0b8',
  top: '#3b8a72',
  mid: DECO.emerald,
  low: '#04150f',
  window: ['#fff0c4', '#f4b072'],
};

/** Local length of a streamliner with this many passenger cars */
export const streamlinerLength = (cars: number) => 560 + cars * 486;
export const STREAMLINER_H = 150;

/**
 * Streamlined train, drawn live (crisp at any zoom). x is the nose, y the rail, s local->world.
 * Local units: the locomotive is 560 long and 142 tall; each car 470 long with a 16 gap.
 */
export const drawStreamliner = (
  c: Ctx,
  x: number,
  y: number,
  s: number,
  pal: LinerPalette,
  o: { cars?: number; lamp?: number; wheelRot?: number; lit?: number } = {}
) => {
  const cars = o.cars ?? 3;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const body = () =>
    grad(c, 0, -142, 0, -12, [
      [0, pal.hi],
      [0.12, pal.top],
      [0.4, pal.mid],
      [1, pal.low],
    ]);
  const stripe = !pal.stripe || pal.stripe === 'gold' ? null : pal.stripe;
  // wheels and rods under the skirts
  const w = new Path2D();
  for (const wx of [-150, -235, -320]) circle(wx, -20, 20, w);
  for (let k = 0; k < cars; k++) {
    const x0 = -560 - 16 - k * 486;
    for (const bx of [-60, -100, -380, -420]) circle(x0 + bx, -13, 13, w);
  }
  c.fillStyle = '#121218';
  c.fill(w);
  const rot = o.wheelRot ?? 0;
  c.strokeStyle = DECO.goldHi;
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-320 + Math.cos(rot) * 9, -20 + Math.sin(rot) * 9);
  c.lineTo(-150 + Math.cos(rot) * 9, -20 + Math.sin(rot) * 9);
  c.stroke();
  const winLit = o.lit ?? 1;
  for (let k = cars - 1; k >= 0; k--) {
    const x1 = -560 - 16 - k * 486;
    const x0 = x1 - 470;
    c.fillStyle = '#050608';
    c.fillRect(x1 - 4, -128, 24, 104);
    const p = rrect(x0, -136, 470, 122, k === cars - 1 ? 40 : 14);
    c.fillStyle = body();
    c.fill(p);
    const wins = new Path2D();
    for (let j = 0; j < 7; j++) rrect(x0 + 30 + j * 62, -116, 40, 30, 7, wins);
    c.fillStyle = grad(c, 0, -116, 0, -86, [
      [0, mix('#2a2a30', pal.window[0], winLit)],
      [1, mix('#1a1a20', pal.window[1], winLit)],
    ]);
    c.fill(wins);
    c.strokeStyle = DECO.gold;
    c.lineWidth = 2;
    c.stroke(wins);
    c.fillStyle = stripe ?? goldGrad(c, x0, -70, x0 + 470, -40);
    c.fillRect(x0 + 6, -66, 458, 5);
    c.fillRect(x0 + 6, -56, 458, 3);
    c.fillStyle = '#05070d';
    c.fillRect(x0 + 8, -26, 454, 12);
  }
  const loco = new Path2D();
  loco.moveTo(-560, -14);
  loco.lineTo(-40, -14);
  loco.quadraticCurveTo(0, -14, 0, -42);
  loco.bezierCurveTo(0, -94, -64, -140, -210, -142);
  loco.lineTo(-560, -142);
  loco.closePath();
  c.fillStyle = body();
  c.fill(loco);
  c.save();
  c.clip(loco);
  c.fillStyle = radial(c, -60, -110, 0, 160, [
    [0, 'rgba(230,240,255,0.42)'],
    [1, 'rgba(230,240,255,0)'],
  ]);
  c.fillRect(-260, -160, 280, 160);
  c.restore();
  const wh = new Path2D();
  for (let i = 0; i < 3; i++) {
    const yy = -58 - i * 12;
    wh.moveTo(-560, yy);
    wh.lineTo(-170, yy);
    wh.bezierCurveTo(-90, yy, -40, -54 + i * 2, -4, -46 + i * 1.5);
  }
  c.strokeStyle = stripe ?? goldGrad(c, -560, -90, 0, -40);
  c.lineWidth = 5;
  c.stroke(wh);
  const cw = rrect(-196, -130, 70, 22, 9);
  c.fillStyle = mix('#2a2a30', '#ffe1a6', winLit);
  c.fill(cw);
  c.strokeStyle = DECO.gold;
  c.lineWidth = 2;
  c.stroke(cw);
  c.fillStyle = '#05070d';
  c.fillRect(-556, -28, 520, 14);
  c.fillStyle = goldGrad(c, -28, -94, 0, -66);
  c.fill(circle(-14, -80, 13));
  c.fillStyle = '#fff8e0';
  c.fill(circle(-13, -80, 8));
  c.restore();
  const lamp = o.lamp ?? 1;
  if (lamp > 0) {
    const lx = x - 14 * s;
    const ly = y - 80 * s;
    beam(c, lx, ly, 0.03, 620 * s, 0.1, '#fff2c8', 0.35 * lamp);
    glow(c, lx, ly, 80 * s, '#fff2c8', 0.9 * lamp);
  }
};
