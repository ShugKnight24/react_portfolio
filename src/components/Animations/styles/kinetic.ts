/**
 * Kinetic helpers shared by the Kinetic series (direct mode films).
 *
 * The look: Swiss sports-broadcast motion graphics. Huge condensed type that moves (slides, scale
 * punches, mask reveals, letter-by-letter), a strict 12-column grid with registration ticks,
 * 2-3 flat colours plus black and white per film, rotoscope athlete silhouettes on a real rig
 * (tapered muscled limbs, profile head, shoes, hands or gloves, kit colours, cut lines between
 * near and far limbs), onion-skin trails, data overlays and hard banded wipes on the beat.
 *
 * The rig: side view, facing +x. Angles are degrees, 0 = straight down, positive swings toward
 * +x (forward). Torso lean is measured from straight up. Lengths are fractions of body height H.
 * Everything is deterministic and cheap: a figure is about a dozen Path2D fills.
 */
import type { Ctx } from '../riso/engine';
import { clamp, lerp, seg, smoothPath, TAU, type Pt } from '../riso/kit';

/* ---------- palette ---------- */

export const KIN = {
  black: '#0f0f10',
  ink: '#18181a',
  white: '#f6f4ef',
  bone: '#e9e5dc',
  grey: '#8c8a85',
  dim: '#2a2a2d',
} as const;

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};

/* ---------- type ---------- */

/** Heavy grotesk, condensed by measured horizontal scaling so every fallback face lands the same */
export const FACE = '"Arial Black", "Archivo Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const KMONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const sxCache = new Map<string, number>();
/** Horizontal squeeze for a weight so an 'N' is `nw` em wide */
const squeeze = (c: Ctx, weight: number, nw: number) => {
  const key = `${weight}|${nw}`;
  let v = sxCache.get(key);
  if (v === undefined) {
    c.save();
    c.font = `${weight} 100px ${FACE}`;
    const w = c.measureText('N').width / 100 || 0.75;
    c.restore();
    v = nw / w;
    sxCache.set(key, v);
  }
  return v;
};

export interface TypeOpts {
  align?: 'left' | 'center' | 'right';
  /** Width of an 'N' in em, smaller = more condensed. Default 0.5 */
  nw?: number;
  /** Letter spacing in em */
  track?: number;
  weight?: number;
  color?: string;
}

export interface CharFx {
  dx?: number;
  dy?: number;
  /** Scale about the character's baseline centre */
  s?: number;
  sy?: number;
  alpha?: number;
  color?: string;
  /** Skip this character */
  hide?: boolean;
}

/** Width of condensed text at size (logical px) */
export const kwidth = (c: Ctx, s: string, size: number, o: TypeOpts = {}) => {
  const sx = squeeze(c, o.weight ?? 900, o.nw ?? 0.5);
  c.save();
  c.font = `${o.weight ?? 900} 100px ${FACE}`;
  let w = 0;
  const chars = Array.from(s);
  for (const ch of chars) w += c.measureText(ch).width;
  c.restore();
  return (w * sx + (o.track ?? 0) * 100 * Math.max(0, chars.length - 1)) * (size / 100);
};

/**
 * Condensed display type. y is the baseline. fx (optional) animates each character.
 * Returns the drawn width.
 */
export const ktext = (
  c: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  o: TypeOpts = {},
  fx?: (i: number, n: number) => CharFx | null
) => {
  const weight = o.weight ?? 900;
  const sx = squeeze(c, weight, o.nw ?? 0.5);
  const k = size / 100;
  c.save();
  c.font = `${weight} 100px ${FACE}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const chars = Array.from(s);
  const ws = chars.map((ch) => c.measureText(ch).width * sx);
  const tr = (o.track ?? 0) * 100;
  const total = ws.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
  const align = o.align ?? 'left';
  const x0 = align === 'left' ? 0 : align === 'center' ? -total / 2 : -total;
  c.translate(x, y);
  c.scale(k, k);
  if (o.color) c.fillStyle = o.color;
  const base = c.fillStyle;
  const baseA = c.globalAlpha;
  let cx = x0;
  for (let i = 0; i < chars.length; i++) {
    const f = fx ? fx(i, chars.length) : null;
    if (!f?.hide) {
      c.save();
      const mx = cx + ws[i] / 2 + (f?.dx ?? 0) / k;
      c.translate(mx, (f?.dy ?? 0) / k);
      const sc = f?.s ?? 1;
      c.scale(sc * sx, sc * (f?.sy ?? 1));
      c.globalAlpha = baseA * (f?.alpha ?? 1);
      c.fillStyle = f?.color ?? base;
      c.fillText(chars[i], -ws[i] / 2 / sx, 0);
      c.restore();
    }
    cx += ws[i] + tr;
  }
  c.restore();
  return total * k;
};

/** Cap height of the display face as a fraction of size */
export const CAP = 0.72;

/** Run fn clipped to a rectangle (mask reveal) */
export const masked = (c: Ctx, x: number, y: number, w: number, h: number, fn: () => void) => {
  if (w <= 0 || h <= 0) return;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  fn();
  c.restore();
};

/** Small mono label */
export const label = (c: Ctx, s: string, x: number, y: number, size = 15, color: string = KIN.black, align: CanvasTextAlign = 'left') => {
  c.save();
  c.font = `600 ${size}px ${KMONO}`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = color;
  c.fillText(s, x, y);
  c.restore();
};

/** Fixed decimals with a leading pad, e.g. fmt(3.2, 2) = "3.20" */
export const fmt = (v: number, dp = 2, pad = 0) => {
  const s = v.toFixed(dp);
  return pad ? s.padStart(pad, '0') : s;
};

/* ---------- grid and furniture ---------- */

export const GRID = { cols: 12, margin: 64, gutter: 16 };
/** x of a 12-column grid line (0..12) */
export const col = (i: number) => GRID.margin + ((1600 - GRID.margin * 2) / GRID.cols) * i;
/** y of a 6-row grid line (0..6) */
export const row = (i: number) => 54 + ((900 - 108) / 6) * i;

/** Thin grid lines, corner crops and tick marks (screen space) */
export const drawGrid = (c: Ctx, color: string, alpha = 0.14, ticks = true) => {
  c.save();
  c.strokeStyle = rgba(color, alpha);
  c.lineWidth = 1;
  const p = new Path2D();
  for (let i = 0; i <= GRID.cols; i++) {
    const x = Math.round(col(i)) + 0.5;
    p.moveTo(x, 40);
    p.lineTo(x, 860);
  }
  for (let j = 0; j <= 6; j++) {
    const y = Math.round(row(j)) + 0.5;
    p.moveTo(40, y);
    p.lineTo(1560, y);
  }
  c.stroke(p);
  if (ticks) {
    c.strokeStyle = rgba(color, Math.min(1, alpha * 4));
    c.lineWidth = 2;
    const q = new Path2D();
    const L = 18;
    for (const [x, y, sx, sy] of [
      [24, 24, 1, 1],
      [1576, 24, -1, 1],
      [24, 876, 1, -1],
      [1576, 876, -1, -1],
    ]) {
      q.moveTo(x, y + sy * L);
      q.lineTo(x, y);
      q.lineTo(x + sx * L, y);
    }
    for (let i = 0; i <= GRID.cols; i++) {
      const x = col(i);
      q.moveTo(x, 24);
      q.lineTo(x, i % 3 === 0 ? 36 : 30);
      q.moveTo(x, 876);
      q.lineTo(x, i % 3 === 0 ? 864 : 870);
    }
    c.stroke(q);
  }
  c.restore();
};

/* ---------- wipes ---------- */

/**
 * A banded broadcast wipe across the frame at progress k (0..1). Bars sweep in from the left
 * with a stagger, then their tails sweep out. `revealed` is the region behind the tails (the
 * incoming scene), `covered` the coloured bars. dir -1 sweeps right to left.
 */
export const wipeBands = (k: number, o: { n?: number; slant?: number; stagger?: number; span?: number; lag?: number; dir?: 1 | -1 } = {}) => {
  const n = o.n ?? 5;
  const slant = o.slant ?? 260;
  const stagger = o.stagger ?? 0.07;
  const lag = o.lag ?? 0.22;
  const span = o.span ?? 1 - stagger * (n - 1) - lag;
  const dir = o.dir ?? 1;
  const covered = new Path2D();
  const revealed = new Path2D();
  const bh = 900 / n;
  const X = (x: number) => (dir === 1 ? x : 1600 - x);
  const ez = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  for (let i = 0; i < n; i++) {
    const d = i * stagger;
    const f = lerp(-slant - 40, 1640, ez(seg(k, d, d + span)));
    const b = lerp(-slant - 40, 1640, ez(seg(k, d + lag, d + lag + span)));
    const y0 = i * bh - 1;
    const y1 = (i + 1) * bh + 1;
    const s0 = (slant * y0) / 900;
    const s1 = (slant * y1) / 900;
    if (f > b + 0.5) {
      covered.moveTo(X(b + s0), y0);
      covered.lineTo(X(f + s0), y0);
      covered.lineTo(X(f + s1), y1);
      covered.lineTo(X(b + s1), y1);
      covered.closePath();
    }
    revealed.moveTo(X(-slant - 60), y0);
    revealed.lineTo(X(b + s0), y0);
    revealed.lineTo(X(b + s1), y1);
    revealed.lineTo(X(-slant - 60), y1);
    revealed.closePath();
  }
  return { covered, revealed };
};

/* ---------- data ---------- */

/** One heartbeat (PQRST) for phase u in [0, 1), output roughly -0.3..1 */
export const ecg = (u: number) => {
  const g = (m: number, w: number) => Math.exp(-(((u - m) / w) ** 2));
  return 0.12 * g(0.14, 0.035) - 0.14 * g(0.27, 0.012) + 1 * g(0.3, 0.012) - 0.3 * g(0.335, 0.013) + 0.24 * g(0.55, 0.06);
};

/** Polyline through pts drawn up to fraction k of its points */
export const partialLine = (pts: Pt[], k: number) => {
  const p = new Path2D();
  const n = pts.length;
  if (n < 2 || k <= 0) return p;
  const end = clamp(k) * (n - 1);
  const last = Math.floor(end);
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= last; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (last < n - 1) {
    const f = end - last;
    p.lineTo(lerp(pts[last][0], pts[last + 1][0], f), lerp(pts[last][1], pts[last + 1][1], f));
  }
  return p;
};

/* ---------- the rig ---------- */

const D = Math.PI / 180;
/** Unit vector for an angle (deg), 0 = down, + toward +x */
export const dir = (a: number): Pt => [Math.sin(a * D), Math.cos(a * D)];
export const angOf = (v: Pt) => Math.atan2(v[0], v[1]) / D;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
export const lerpAng = (a: number, b: number, k: number) => a + wrap(b - a) * k;

export const BODY = { thigh: 0.245, shin: 0.25, torso: 0.29, neck: 0.05, ua: 0.172, fa: 0.152, ankle: 0.038, ball: 0.088 };

export interface Pose {
  /** Torso from straight up, + leans forward */
  lean: number;
  /** Head axis from straight up, + tips forward */
  head: number;
  thN: number;
  shN: number;
  /** Toe direction, 90 = level forward, lower = toes down */
  ftN: number;
  thF: number;
  shF: number;
  ftF: number;
  uaN: number;
  faN: number;
  /** Hand direction */
  hdN: number;
  uaF: number;
  faF: number;
  hdF: number;
  /** Torso rotation -1..1, + brings the far shoulder forward */
  twist: number;
  /** Forearm length factor (foreshortening) */
  flN: number;
  flF: number;
}

const POSE_KEYS = Object.keys({
  lean: 0, head: 0, thN: 0, shN: 0, ftN: 0, thF: 0, shF: 0, ftF: 0, uaN: 0, faN: 0, hdN: 0, uaF: 0, faF: 0, hdF: 0, twist: 0, flN: 0, flF: 0,
} satisfies Pose) as (keyof Pose)[];
const LINEAR: (keyof Pose)[] = ['twist', 'flN', 'flF'];

export const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const o = { ...a };
  for (const key of POSE_KEYS) o[key] = LINEAR.includes(key) ? lerp(a[key], b[key], k) : lerpAng(a[key], b[key], k);
  return o;
};

/** Pose builder: shin/forearm/foot/hand angles default from relative flexes */
export const pose = (p: Partial<Pose> & { lean: number }): Pose => ({
  head: p.head ?? p.lean * 0.6,
  thN: 0,
  shN: 0,
  ftN: 90,
  thF: 0,
  shF: 0,
  ftF: 90,
  uaN: 0,
  faN: 0,
  hdN: 0,
  uaF: 0,
  faF: 0,
  hdF: 0,
  twist: 0,
  flN: 1,
  flF: 1,
  ...p,
});

export interface Joints {
  H: number;
  hip: Pt;
  up: Pt;
  fw: Pt;
  sh: Pt;
  shN: Pt;
  shF: Pt;
  neckTop: Pt;
  headUp: Pt;
  kN: Pt;
  aN: Pt;
  kF: Pt;
  aF: Pt;
  ftN: number;
  ftF: number;
  eN: Pt;
  wN: Pt;
  eF: Pt;
  wF: Pt;
  hdN: number;
  hdF: number;
  twist: number;
}

/** Forward kinematics */
export const fk = (p: Pose, hip: Pt, H: number): Joints => {
  const up: Pt = [Math.sin(p.lean * D), -Math.cos(p.lean * D)];
  const fw: Pt = [Math.cos(p.lean * D), Math.sin(p.lean * D)];
  const sh = add(hip, up, BODY.torso * H);
  const shN = add(sh, fw, (0.006 - p.twist * 0.026) * H);
  const shF = add(add(sh, fw, (-0.012 + p.twist * 0.03) * H), up, -0.004 * H);
  const headUp: Pt = [Math.sin(p.head * D), -Math.cos(p.head * D)];
  const nb = add(hip, up, (BODY.torso + 0.02) * H);
  const neckTop = add(nb, headUp, BODY.neck * H);
  const hipF = add(hip, fw, -0.01 * H);
  const kN = add(hip, dir(p.thN), BODY.thigh * H);
  const aN = add(kN, dir(p.shN), BODY.shin * H);
  const kF = add(hipF, dir(p.thF), BODY.thigh * H);
  const aF = add(kF, dir(p.shF), BODY.shin * H);
  const eN = add(shN, dir(p.uaN), BODY.ua * H);
  const wN = add(eN, dir(p.faN), BODY.fa * H * p.flN);
  const eF = add(shF, dir(p.uaF), BODY.ua * H);
  const wF = add(eF, dir(p.faF), BODY.fa * H * p.flF);
  return { H, hip, up, fw, sh, shN, shF, neckTop, headUp, kN, aN, kF, aF, ftN: p.ftN, ftF: p.ftF, eN, wN, eF, wF, hdN: p.hdN, hdF: p.hdF, twist: p.twist };
};

/**
 * Two-bone IK from root a toward target b. bend +1 puts the middle joint on the +x side of a
 * downward chain (knees), -1 on the other (elbows hanging behind). Returns segment angles.
 */
export const ik2 = (a: Pt, b: Pt, l1: number, l2: number, bend: 1 | -1) => {
  const v = sub(b, a);
  const d = clamp(Math.hypot(v[0], v[1]), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const base = angOf(v);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const al = Math.acos(cosA) / D;
  const a1 = base + bend * al;
  const j = add(a, dir(a1), l1);
  const end = add(a, dir(base), d);
  const a2 = angOf(sub(end, j));
  return { a1, a2, j, end };
};

/** Ankle position for a foot whose ball rests at `ball` with toe direction ft */
export const ankleFromBall = (ball: Pt, ft: number, H: number): Pt => {
  const d = dir(ft);
  const n: Pt = [-d[1], d[0]];
  return [ball[0] - d[0] * BODY.ball * H - n[0] * BODY.ankle * H, ball[1] - d[1] * BODY.ball * H - n[1] * BODY.ankle * H];
};
/** Ball of the foot for an ankle and toe direction */
export const ballOf = (ankle: Pt, ft: number, H: number): Pt => {
  const d = dir(ft);
  const n: Pt = [-d[1], d[0]];
  return [ankle[0] + d[0] * BODY.ball * H + n[0] * BODY.ankle * H, ankle[1] + d[1] * BODY.ball * H + n[1] * BODY.ankle * H];
};

/* ----- outlines ----- */

const W_THIGH: [number[], number[]] = [
  [0.062, 0.058, 0.05, 0.04, 0.031],
  [0.05, 0.06, 0.056, 0.045, 0.031],
];
const W_SHIN: [number[], number[]] = [
  [0.031, 0.043, 0.035, 0.022, 0.017],
  [0.03, 0.027, 0.023, 0.019, 0.016],
];
const W_UA: [number[], number[]] = [
  [0.044, 0.036, 0.03, 0.026, 0.022],
  [0.04, 0.038, 0.034, 0.026, 0.021],
];
const W_FA: [number[], number[]] = [
  [0.023, 0.028, 0.023, 0.018, 0.015],
  [0.023, 0.026, 0.021, 0.016, 0.014],
];

/** Tapered limb: plus side (+n, behind a downward limb facing +x) and minus side widths */
const limb = (a: Pt, b: Pt, w: [number[], number[]], H: number, k = 1, path = new Path2D()) => {
  const v = sub(b, a);
  const len = Math.hypot(v[0], v[1]) || 1;
  const u: Pt = [v[0] / len, v[1] / len];
  const n: Pt = [-u[1], u[0]];
  const [P, M] = w;
  const pts: Pt[] = [];
  for (let i = 0; i < 5; i++) pts.push(add(add(a, u, (len * i) / 4), n, P[i] * H * k));
  const rb = ((P[4] + M[4]) / 2) * H * k;
  pts.push(add(add(b, u, rb * 0.75), n, P[4] * H * k * 0.55));
  pts.push(add(b, u, rb));
  pts.push(add(add(b, u, rb * 0.75), n, -M[4] * H * k * 0.55));
  for (let i = 4; i >= 0; i--) pts.push(add(add(a, u, (len * i) / 4), n, -M[i] * H * k));
  const ra = ((P[0] + M[0]) / 2) * H * k;
  pts.push(add(add(a, u, -ra * 0.75), n, -M[0] * H * k * 0.55));
  pts.push(add(a, u, -ra));
  pts.push(add(add(a, u, -ra * 0.75), n, P[0] * H * k * 0.55));
  return smoothPath(pts, true, 0.5, path);
};

/** Shape in a local frame (origin o, axis x = ax, axis y = ay), coordinates in H */
const local = (o: Pt, ax: Pt, ay: Pt, pts: readonly (readonly [number, number])[], H: number, sy = 1, path = new Path2D()) =>
  smoothPath(
    pts.map(([x, y]) => [o[0] + (ax[0] * x + ay[0] * y * sy) * H, o[1] + (ax[1] * x + ay[1] * y * sy) * H] as Pt),
    true,
    0.5,
    path
  );

// [along up, forward]
const TORSO = [
  [-0.04, 0.012],
  [-0.004, 0.056],
  [0.06, 0.06],
  [0.12, 0.054],
  [0.18, 0.062],
  [0.232, 0.074],
  [0.272, 0.062],
  [0.3, 0.036],
  [0.318, 0.012],
  [0.318, -0.024],
  [0.3, -0.05],
  [0.262, -0.066],
  [0.2, -0.064],
  [0.135, -0.05],
  [0.08, -0.056],
  [0.03, -0.074],
  [-0.02, -0.068],
  [-0.048, -0.034],
] as const;

// [along head up, forward], origin at the top of the neck
const HEAD = [
  [-0.012, -0.024],
  [0.022, -0.056],
  [0.07, -0.066],
  [0.112, -0.048],
  [0.133, -0.008],
  [0.127, 0.032],
  [0.104, 0.056],
  [0.084, 0.062],
  [0.07, 0.064],
  [0.057, 0.079],
  [0.046, 0.066],
  [0.036, 0.068],
  [0.024, 0.062],
  [0.01, 0.06],
  [-0.004, 0.044],
  [-0.008, 0.016],
] as const;

// [along toe, toward sole], origin at the ankle
const SHOE = [
  [-0.03, -0.03],
  [-0.05, 0.004],
  [-0.046, 0.042],
  [0.03, 0.047],
  [0.118, 0.043],
  [0.146, 0.028],
  [0.136, 0.008],
  [0.07, -0.01],
  [0.025, -0.028],
] as const;

// [along hand, side], origin at the wrist
const KNIFE = [
  [-0.008, -0.016],
  [0.04, -0.019],
  [0.074, -0.012],
  [0.086, 0.0],
  [0.074, 0.013],
  [0.042, 0.022],
  [0.03, 0.03],
  [0.012, 0.024],
  [-0.008, 0.016],
] as const;

const FIST = [
  [-0.008, -0.02],
  [0.03, -0.026],
  [0.056, -0.016],
  [0.06, 0.012],
  [0.044, 0.028],
  [0.012, 0.026],
  [-0.008, 0.016],
] as const;

const GLOVE = [
  [-0.012, -0.03],
  [0.024, -0.05],
  [0.07, -0.05],
  [0.1, -0.024],
  [0.1, 0.022],
  [0.074, 0.05],
  [0.03, 0.052],
  [0.004, 0.034],
  [-0.012, 0.028],
] as const;

export type Hands = 'knife' | 'glove' | 'fist';

export interface FigPaths {
  armF: Path2D;
  handF: Path2D;
  legF: Path2D;
  footF: Path2D;
  torso: Path2D;
  head: Path2D;
  legN: Path2D;
  footN: Path2D;
  armN: Path2D;
  handN: Path2D;
  shortsN: { leg: Path2D; clip: Path2D };
  shortsF: { leg: Path2D; clip: Path2D };
}

export const figurePaths = (j: Joints, hands: Hands = 'knife'): FigPaths => {
  const H = j.H;
  const armF = limb(j.shF, j.eF, W_UA, H, 0.96);
  limb(j.eF, j.wF, W_FA, H, 0.96, armF);
  const legF = limb(add(j.hip, j.fw, -0.01 * H), j.kF, W_THIGH, H, 0.97);
  limb(j.kF, j.aF, W_SHIN, H, 0.97, legF);
  const legN = limb(j.hip, j.kN, W_THIGH, H);
  limb(j.kN, j.aN, W_SHIN, H, 1, legN);
  const armN = limb(j.shN, j.eN, W_UA, H);
  limb(j.eN, j.wN, W_FA, H, 1, armN);
  const chest = 1 + Math.abs(j.twist) * 0.18;
  const torso = local(j.hip, j.up, j.fw, TORSO, H, chest);
  // neck
  const nb = add(j.hip, j.up, (BODY.torso - 0.01) * H);
  limb(nb, j.neckTop, [[0.03, 0.028, 0.027, 0.027, 0.028], [0.028, 0.026, 0.024, 0.024, 0.026]], H, 1, torso);
  const hf: Pt = [-j.headUp[1], j.headUp[0]];
  const head = local(j.neckTop, j.headUp, hf, HEAD, H);
  const foot = (a: Pt, ft: number) => {
    const d = dir(ft);
    return local(a, d, [-d[1], d[0]], SHOE, H * 0.88, 0.9);
  };
  const hand = (w: Pt, hd: number) => {
    const d = dir(hd);
    return local(w, d, [-d[1], d[0]], hands === 'glove' ? GLOVE : hands === 'fist' ? FIST : KNIFE, H);
  };
  /** Thigh-shaped shorts leg cut square at a hem `len` along the thigh */
  const shorts = (k: Pt, sideK: number, len = 0.38) => {
    const a = add(j.hip, j.fw, sideK * H);
    const leg = limb(a, k, W_THIGH, H, 1.05);
    const v = sub(k, a);
    const L = Math.hypot(v[0], v[1]) || 1;
    const u: Pt = [v[0] / L, v[1] / L];
    const n: Pt = [-u[1], u[0]];
    const hemC = add(a, u, L * len);
    const back = add(a, u, -0.2 * H);
    const w = 0.16 * H;
    const clip = new Path2D();
    clip.moveTo(back[0] + n[0] * w, back[1] + n[1] * w);
    clip.lineTo(hemC[0] + n[0] * w, hemC[1] + n[1] * w);
    clip.lineTo(hemC[0] - n[0] * w, hemC[1] - n[1] * w);
    clip.lineTo(back[0] - n[0] * w, back[1] - n[1] * w);
    clip.closePath();
    return { leg, clip };
  };
  return {
    armF,
    handF: hand(j.wF, j.hdF),
    legF,
    footF: foot(j.aF, j.ftF),
    torso,
    head,
    legN,
    footN: foot(j.aN, j.ftN),
    armN,
    handN: hand(j.wN, j.hdN),
    shortsN: shorts(j.kN, 0),
    shortsF: shorts(j.kF, -0.01),
  };
};

export interface FigStyle {
  skin: string;
  /** Far limbs */
  far: string;
  /** Cut line colour between overlapping parts (usually the background) */
  cut?: string;
  cutW?: number;
  shorts?: string;
  top?: string;
  shoe?: string;
  hand?: string;
  hands?: Hands;
  /** Small bib/number patch on the top */
  bib?: string;
  bibText?: string;
  bibInk?: string;
}

const strokeFill = (c: Ctx, p: Path2D, fill: string, cut: string | undefined, w: number) => {
  if (cut) {
    c.strokeStyle = cut;
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.stroke(p);
  }
  c.fillStyle = fill;
  c.fill(p);
};

const clipFill = (c: Ctx, p: { leg: Path2D; clip: Path2D }, fill: string) => {
  c.save();
  c.clip(p.clip);
  c.fillStyle = fill;
  c.fill(p.leg);
  c.restore();
};

/** Torso-frame band clipped to the torso (for tops and waistbands) */
const torsoBand = (c: Ctx, j: Joints, torso: Path2D, u0: number, u1: number, color: string) => {
  c.save();
  c.clip(torso);
  const H = j.H;
  const a = add(j.hip, j.up, u0 * H);
  const b = add(j.hip, j.up, u1 * H);
  const f = j.fw;
  const p = new Path2D();
  const W2 = 0.2 * H;
  p.moveTo(a[0] - f[0] * W2, a[1] - f[1] * W2);
  p.lineTo(a[0] + f[0] * W2, a[1] + f[1] * W2);
  p.lineTo(b[0] + f[0] * W2, b[1] + f[1] * W2);
  p.lineTo(b[0] - f[0] * W2, b[1] - f[1] * W2);
  p.closePath();
  c.fillStyle = color;
  c.fill(p);
  c.restore();
};

/** Full figure with kit colours and cut lines */
export const drawFigure = (c: Ctx, j: Joints, st: FigStyle) => {
  const P = figurePaths(j, st.hands ?? 'knife');
  const cw = st.cutW ?? Math.max(2, j.H * 0.008);
  const shoe = st.shoe ?? st.skin;
  const hand = st.hand ?? (st.hands === 'glove' ? st.skin : st.far);
  c.save();
  // far side
  strokeFill(c, P.armF, st.far, undefined, cw);
  strokeFill(c, P.handF, st.hands === 'glove' ? hand : st.far, undefined, cw);
  strokeFill(c, P.legF, st.far, undefined, cw);
  if (st.shorts) clipFill(c, P.shortsF, st.shorts);
  strokeFill(c, P.footF, st.shoe ? shoe : st.far, undefined, cw);
  // body
  strokeFill(c, P.torso, st.skin, st.cut, cw);
  if (st.top) torsoBand(c, j, P.torso, 0.05, 0.288, st.top);
  if (st.shorts) torsoBand(c, j, P.torso, -0.1, 0.06, st.shorts);
  if (st.bib && st.top) {
    const H = j.H;
    const o = add(add(j.hip, j.up, 0.13 * H), j.fw, 0.022 * H);
    c.save();
    c.translate(o[0], o[1]);
    c.rotate(Math.atan2(j.fw[1], j.fw[0]));
    c.fillStyle = st.bib;
    c.fillRect(-0.032 * H, -0.03 * H, 0.062 * H, 0.058 * H);
    if (st.bibText) {
      c.fillStyle = st.bibInk ?? KIN.black;
      ktext(c, st.bibText, 0, 0.02 * H, 0.05 * H, { align: 'center', nw: 0.46 });
    }
    c.restore();
  }
  strokeFill(c, P.head, st.skin, st.cut, cw);
  // near side
  strokeFill(c, P.legN, st.skin, st.cut, cw);
  if (st.shorts) clipFill(c, P.shortsN, st.shorts);
  strokeFill(c, P.footN, shoe, st.cut, cw);
  strokeFill(c, P.armN, st.skin, st.cut, cw);
  strokeFill(c, P.handN, st.hands === 'glove' ? hand : st.skin, st.cut, cw);
  c.restore();
};

/** One-colour silhouette (onion skins, shadows) */
export const drawSilhouette = (c: Ctx, j: Joints, color: string, hands: Hands = 'knife') => {
  const P = figurePaths(j, hands);
  c.fillStyle = color;
  for (const p of [P.armF, P.handF, P.legF, P.footF, P.torso, P.head, P.legN, P.footN, P.armN, P.handN]) c.fill(p);
};

/* ---------- gait ---------- */

/** Swing keys: [phase, thigh, knee flex, toe-down tilt]. Touchdown at 0, stance until contact */
type Key = readonly [number, number, number, number];
const SPRINT: Key[] = [
  [0, 20, 16, 12],
  [0.22, -34, 26, 50],
  [0.34, -26, 78, 45],
  [0.45, -6, 126, 20],
  [0.57, 28, 124, -6],
  [0.69, 60, 98, -10],
  [0.8, 62, 58, -6],
  [0.9, 44, 26, 2],
  [1, 20, 16, 12],
];
const JOG: Key[] = [
  [0, 16, 12, 2],
  [0.3, -24, 22, 34],
  [0.42, -18, 66, 30],
  [0.55, 2, 92, 10],
  [0.68, 26, 82, -4],
  [0.8, 36, 52, -6],
  [0.9, 28, 24, -2],
  [1, 16, 12, 2],
];

const sampleKeys = (keys: Key[], u: number): [number, number, number] => {
  const x = ((u % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= x) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = (x - a[0]) / (b[0] - a[0] || 1);
  const s = k * k * (3 - 2 * k);
  // Catmull-ish: blend linear with smooth to keep velocity through keys
  const m = lerp(k, s, 0.5);
  return [lerp(a[1], b[1], m), lerp(a[2], b[2], m), lerp(a[3], b[3], m)];
};

/** Swing leg angles: [thigh, shin, foot] for a leg at phase u. sprint 0 = jog, 1 = sprint */
export const swingLeg = (u: number, sprint: number, thighBias = 0): [number, number, number] => {
  const s = sampleKeys(SPRINT, u);
  const j = sampleKeys(JOG, u);
  const th = lerp(j[0], s[0], sprint) + thighBias;
  const kf = lerp(j[1], s[1], sprint);
  const pf = lerp(j[2], s[2], sprint);
  const sh = th - kf;
  return [th, sh, sh + 90 - pf];
};

/** Arm angles for a running arm, driven by the opposite leg's phase */
export const runArm = (uOpp: number, sprint: number): [number, number] => {
  const w = Math.sin(TAU * (uOpp - 0.5));
  const amp = lerp(30, 60, sprint);
  const ua = 4 + amp * w;
  const flex = lerp(lerp(88, 96, (w + 1) / 2), lerp(58, 104, (w + 1) / 2), sprint);
  return [ua, ua + flex];
};

export interface GaitSpec {
  H: number;
  /** Time range the table covers */
  t0: number;
  t1: number;
  /** Near-leg cycle count (continuous, increases with time); the far leg is +0.5 */
  phase(t: number): number;
  hip(t: number, uN: number): Pt;
  /** Ground y under x */
  ground(x: number): number;
  /** Contact fraction of the cycle */
  contact(t: number): number;
  /** 0 jog .. 1 sprint keys */
  sprint(t: number): number;
  thighBias?(t: number): number;
  /** Override a touchdown: return the ball position and toe tilt range for that step */
  override?(leg: 0 | 1, k: number): { ball: Pt; p0: number; p1: number } | null;
}

export interface Gait {
  /** Legs part of a pose plus a flag per leg if it is planted */
  legs(t: number): { thN: number; shN: number; ftN: number; thF: number; shF: number; ftF: number; hip: Pt; uN: number; uF: number };
  /** Touchdowns per leg in time order */
  steps: { t: number; ball: Pt }[][];
}

export const makeGait = (g: GaitSpec): Gait => {
  const H = g.H;
  const L1 = BODY.thigh * H;
  const L2 = BODY.shin * H;
  const tables: Map<number, { ball: Pt; p0: number; p1: number; t?: number }>[] = [new Map(), new Map()];
  const dt = 1 / 480;
  for (let leg = 0; leg < 2; leg++) {
    const off = leg * 0.5;
    let prev = Math.floor(g.phase(g.t0 - dt) + off);
    for (let t = g.t0; t <= g.t1 + 0.6; t += dt) {
      const ph = g.phase(t) + off;
      const k = Math.floor(ph);
      if (k !== prev) {
        prev = k;
        const ov = g.override?.(leg as 0 | 1, k);
        if (ov) {
          tables[leg].set(k, { ...ov, t });
          continue;
        }
        const uN = g.phase(t) - Math.floor(g.phase(t));
        const hip = g.hip(t, uN);
        const sp = g.sprint(t);
        const [th, sh, ft] = swingLeg(0, sp, g.thighBias?.(t) ?? 0);
        const hipL = leg === 1 ? add(hip, [-0.01 * H, 0]) : hip;
        const knee = add(hipL, dir(th), L1);
        const ank = add(knee, dir(sh), L2);
        const ball = ballOf(ank, ft, H);
        tables[leg].set(k, { ball: [ball[0], g.ground(ball[0])], p0: lerp(2, 12, sp), p1: lerp(34, 52, sp), t });
      }
    }
    // Make sure every step that started before t0 exists
    const k0 = Math.floor(g.phase(g.t0) + off);
    if (!tables[leg].has(k0)) {
      const ov = g.override?.(leg as 0 | 1, k0);
      if (ov) tables[leg].set(k0, ov);
    }
  }

  const legAt = (t: number, leg: 0 | 1, hip: Pt) => {
    const ph = g.phase(t) + leg * 0.5;
    const k = Math.floor(ph);
    const u = ph - k;
    const sp = g.sprint(t);
    const bias = g.thighBias?.(t) ?? 0;
    const c = g.contact(t);
    const hipL = leg === 1 ? add(hip, [-0.01 * H, 0]) : hip;
    const stanceAt = (uu: number, kk: number) => {
      const step = tables[leg].get(kk);
      if (!step) return null;
      const p = lerp(step.p0, step.p1, clamp(uu / c));
      const ft = 90 - p;
      const ank = ankleFromBall(step.ball, ft, H);
      const s = ik2(hipL, ank, L1, L2, 1);
      return [s.a1, s.a2, ft] as [number, number, number];
    };
    if (u < c) {
      const s = stanceAt(u, k);
      if (s) return s;
    }
    const sw = swingLeg(u, sp, bias);
    // Blend out of the stance just after toe-off
    const B = 0.12;
    if (u >= c && u < c + B) {
      const s = stanceAt(c, k);
      if (s) {
        const m = (u - c) / B;
        const e = m * m * (3 - 2 * m);
        return [lerpAng(s[0], sw[0], e), lerpAng(s[1], sw[1], e), lerpAng(s[2], sw[2], e)] as [number, number, number];
      }
    }
    return sw;
  };

  const steps = tables.map((m) =>
    [...m.values()].map((v) => ({ t: v.t ?? g.t0, ball: v.ball })).sort((a, b) => a.t - b.t)
  );
  return {
    steps,
    legs(t) {
      const ph = g.phase(t);
      const uN = ph - Math.floor(ph);
      const uF = (uN + 0.5) % 1;
      const hip = g.hip(t, uN);
      const n = legAt(t, 0, hip);
      const f = legAt(t, 1, hip);
      return { thN: n[0], shN: n[1], ftN: n[2], thF: f[0], shF: f[1], ftF: f[2], hip, uN, uF };
    },
  };
};
