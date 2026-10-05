import { clamp, lerp, TAU } from './runtime';

/**
 * Shared kit for the DBZ lane: a cel shaded, ink outlined anime fighter drawn in profile,
 * with costume looks for Goku and Vegeta, plus a few small helpers.
 *
 * Poses are authored in figure units for a fighter facing right: x forward, y up from the
 * ground, 1 = standing height to the top of the skull. The draw call mirrors for facing left.
 * Every body part is shaded with a hard stop gradient oriented toward a single point light,
 * which gives a lit band, a mid tone, a cel shadow and a coloured rim on the lit edge.
 */

export interface Mat {
  hi: string;
  base: string;
  shade: string;
  deep: string;
}

export interface DbzPose {
  hipX: number;
  hipY: number;
  neckX: number;
  neckY: number;
  /** Head tilt in radians, positive tips the chin up */
  tilt: number;
  nEx: number;
  nEy: number;
  nHx: number;
  nHy: number;
  fEx: number;
  fEy: number;
  fHx: number;
  fHy: number;
  nKx: number;
  nKy: number;
  nFx: number;
  nFy: number;
  fKx: number;
  fKy: number;
  fFx: number;
  fFy: number;
}

const KEYS: readonly (keyof DbzPose)[] = [
  'hipX',
  'hipY',
  'neckX',
  'neckY',
  'tilt',
  'nEx',
  'nEy',
  'nHx',
  'nHy',
  'fEx',
  'fEy',
  'fHx',
  'fHy',
  'nKx',
  'nKy',
  'nFx',
  'nFy',
  'fKx',
  'fKy',
  'fFx',
  'fFy',
];

export const copyPose = (out: DbzPose, a: DbzPose): DbzPose => {
  for (const k of KEYS) out[k] = a[k];
  return out;
};

export function mixPose(out: DbzPose, a: DbzPose, b: DbzPose, k: number): DbzPose {
  for (const key of KEYS) out[key] = lerp(a[key], b[key], k);
  return out;
}

/**
 * 'pushUp' / 'pushDown': open hand thrust along the forearm, palm facing forward, fingers
 * pointing up or down (the two halves of a two handed blast). 'cupUp' / 'cupDown': hand
 * cupped around a ball of energy, palm facing up or down.
 */
export type HandShape = 'fist' | 'palm' | 'cup' | 'pushUp' | 'pushDown' | 'cupUp' | 'cupDown';
export type HairStyle = 'goku' | 'vegeta';

export interface Look {
  skin: Mat;
  top: Mat;
  /** Undershirt or bodysuit: sleeves and the chest V */
  under: Mat;
  pants: Mat;
  boot: Mat;
  bootTrim: Mat;
  hair: Mat;
  /** Wristbands (Goku) */
  band: Mat | null;
  /** Gloves (Vegeta), cover the hand and part of the forearm */
  glove: Mat | null;
  belt: Mat | null;
  hairStyle: HairStyle;
  /** Fraction of the upper arm covered by the sleeve */
  sleeve: number;
  /** Fraction of the shin covered by the boot, from the ankle */
  bootLen: number;
  /** Top covers the torso as a gi with a chest V (Goku) or is the bodysuit (Vegeta) */
  gi: boolean;
  ink: string;
  /** Optional hair outline replacing the style's own, same valley/tip layout as GOKU_HAIR_PTS */
  hairPts?: ArrayLike<number>;
  /** Optional iris colour (defaults to near black) */
  iris?: string;
}

export const GOKU: Look = {
  skin: { hi: '#ffe2c4', base: '#f6c393', shade: '#d98f66', deep: '#a8604a' },
  top: { hi: '#ffb45a', base: '#f57c1f', shade: '#c9520f', deep: '#8a300c' },
  under: { hi: '#4f79d8', base: '#2448a8', shade: '#172f78', deep: '#0d1b4b' },
  pants: { hi: '#ffb45a', base: '#f07a1d', shade: '#c24f10', deep: '#852d0b' },
  boot: { hi: '#4f79d8', base: '#1f3f99', shade: '#142a6a', deep: '#0b1742' },
  bootTrim: { hi: '#ffe7a0', base: '#e9b64c', shade: '#b07e22', deep: '#6d4a12' },
  hair: { hi: '#3f4f86', base: '#1a1c30', shade: '#0f0f1c', deep: '#06060c' },
  band: { hi: '#4f79d8', base: '#2448a8', shade: '#172f78', deep: '#0d1b4b' },
  glove: null,
  belt: { hi: '#4f79d8', base: '#2448a8', shade: '#172f78', deep: '#0d1b4b' },
  hairStyle: 'goku',
  sleeve: 0.36,
  bootLen: 0.42,
  gi: true,
  ink: '#1a0f16',
};

export const VEGETA: Look = {
  skin: { hi: '#ffe0c6', base: '#f1bf95', shade: '#d38b66', deep: '#9f5a46' },
  top: { hi: '#5d7fe6', base: '#2c4fb8', shade: '#1c3383', deep: '#101d52' },
  under: { hi: '#5d7fe6', base: '#2c4fb8', shade: '#1c3383', deep: '#101d52' },
  pants: { hi: '#5d7fe6', base: '#2a4cb2', shade: '#1b327f', deep: '#0f1c4e' },
  boot: { hi: '#ffffff', base: '#eef0f6', shade: '#b9bfd0', deep: '#7e8599' },
  bootTrim: { hi: '#fff0a8', base: '#f0c43c', shade: '#b8891c', deep: '#6f5010' },
  hair: { hi: '#46507e', base: '#181a2c', shade: '#0e0e1a', deep: '#06060b' },
  band: null,
  glove: { hi: '#ffffff', base: '#eef0f6', shade: '#b9bfd0', deep: '#7e8599' },
  belt: null,
  hairStyle: 'vegeta',
  sleeve: 0.55,
  bootLen: 0.5,
  gi: false,
  ink: '#140d18',
};

export interface DrawOpts {
  /** Screen x of the figure origin (between the feet) and ground y */
  x: number;
  gy: number;
  H: number;
  facing: 1 | -1;
  /** Key light position in screen space */
  lightX: number;
  lightY: number;
  /** Rim colour "r,g,b" and its strength 0..1 */
  rim: string;
  rimK: number;
  t: number;
  /** 0 still, 1 whipping in a strong wind */
  flutter: number;
  /** Pushes hair tips upward (aura updraft), 0..1 */
  hairLift: number;
  handN: HandShape;
  handF: HandShape;
  /**
   * Optional wrist bend: the direction each hand points, in radians in figure space
   * (0 forward, positive up). Defaults to following the forearm.
   */
  handDirN?: number;
  handDirF?: number;
  /** 0 closed, 1 shouting */
  mouth: number;
  /** Strain: lowers the brows and narrows the eyes, 0..1 */
  strain: number;
}

export interface FigureAnchors {
  headX: number;
  headY: number;
  nHandX: number;
  nHandY: number;
  fHandX: number;
  fHandY: number;
  chestX: number;
  chestY: number;
}

/* ---------- geometry helpers (local figure space) ---------- */

/** Adds a tapered capsule as its own subpath */
export function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(r1 - r2) + 1e-4) {
    const big = r1 > r2;
    const x = big ? x1 : x2;
    const y = big ? y1 : y2;
    const r = Math.max(r1, r2);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
    return;
  }
  const th = Math.atan2(dy, dx);
  const a = Math.acos(clamp((r1 - r2) / d, -1, 1));
  ctx.moveTo(x1 + Math.cos(th + a) * r1, y1 + Math.sin(th + a) * r1);
  ctx.arc(x1, y1, r1, th + a, th + TAU - a);
  ctx.arc(x2, y2, r2, th - a, th + a);
  ctx.closePath();
}

/** Closed smooth curve through the points (midpoint quadratic smoothing) */
function smoothClosed(ctx: CanvasRenderingContext2D, pts: Float64Array, n: number) {
  const mx = (pts[(n - 1) * 2] + pts[0]) / 2;
  const my = (pts[(n - 1) * 2 + 1] + pts[1]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
  }
  ctx.closePath();
}

/* ---------- lighting ---------- */

// Light position in the current local space, set per draw
let LX = 0;
let LY = 0;
let RIM = '#fff';
let RIM_W = 0;

function stops(g: CanvasGradient, m: Mat, far: boolean) {
  if (far) {
    g.addColorStop(0, RIM_W > 0.02 ? RIM : m.base);
    g.addColorStop(Math.max(0.02, RIM_W * 0.6), m.base);
    g.addColorStop(0.36, m.shade);
    g.addColorStop(1, m.deep);
    return g;
  }
  g.addColorStop(0, RIM_W > 0.02 ? RIM : m.hi);
  g.addColorStop(Math.max(0.02, RIM_W), RIM_W > 0.02 ? RIM : m.hi);
  g.addColorStop(Math.max(0.05, RIM_W) + 0.04, m.hi);
  g.addColorStop(0.26, m.base);
  g.addColorStop(0.56, m.base);
  g.addColorStop(0.6, m.shade);
  g.addColorStop(1, m.deep);
  return g;
}

/** Gradient across a limb segment, lit edge toward the light */
function limbGrad(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  m: Mat,
  far: boolean
) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let nx = -(by - ay);
  let ny = bx - ax;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  if (nx * (LX - mx) + ny * (LY - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return stops(ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r), m, far);
}

/** Gradient across a blob, lit side toward the light */
function blobGrad(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, m: Mat, far: boolean) {
  let dx = LX - cx;
  let dy = LY - cy;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  return stops(ctx.createLinearGradient(cx + dx * r, cy + dy * r, cx - dx * r, cy - dy * r), m, far);
}

/* ---------- figure ---------- */

// Scratch joints: [x, y] pairs
const J = new Float64Array(40);
const TORSO = new Float64Array(24);
const HAIR = new Float64Array(64);

const GOKU_HAIR: readonly number[] = [
  // tip/valley pairs in head radius units, x forward, y up; tips on even indices
  0.78, 0.62,
  0.98, 1.45,
  0.5, 1.02,
  0.3, 1.98,
  -0.02, 1.08,
  -0.72, 1.9,
  -0.58, 0.86,
  -1.72, 1.28,
  -0.9, 0.46,
  -1.92, 0.22,
  -0.98, 0.02,
  -1.62, -0.6,
  -0.82, -0.36,
  -1.05, -1.02,
  -0.42, -0.55,
];
/** Goku's base hair outline, for scenes that morph it */
export const GOKU_HAIR_PTS = GOKU_HAIR;
const VEGETA_HAIR: readonly number[] = [
  0.78, 0.56,
  1.02, 1.62,
  0.62, 1.75,
  0.8, 2.92,
  0.3, 2.2,
  0.24, 3.32,
  -0.12, 2.28,
  -0.42, 3.05,
  -0.56, 2.0,
  -1.02, 2.52,
  -0.9, 1.48,
  -1.32, 1.58,
  -1.0, 0.8,
  -1.16, 0.18,
  -0.68, -0.36,
];

export function drawDbzFighter(
  ctx: CanvasRenderingContext2D,
  look: Look,
  p: DbzPose,
  o: DrawOpts,
  ghost?: { color: string; alpha: number }
): FigureAnchors {
  const H = o.H;
  const fc = o.facing;
  const inkW = Math.max(1, H * 0.0055) / H;

  // Spine frame
  let ux = p.neckX - p.hipX;
  let uy = p.neckY - p.hipY;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const fx = uy;
  const fy = -ux;

  // Joints
  const shNx = p.neckX - ux * 0.035 + fx * 0.012;
  const shNy = p.neckY - uy * 0.035 + fy * 0.012;
  const shFx = p.neckX - ux * 0.035 - fx * 0.03;
  const shFy = p.neckY - uy * 0.035 - fy * 0.03;
  const hpNx = p.hipX + fx * 0.012;
  const hpNy = p.hipY + fy * 0.012;
  const hpFx = p.hipX - fx * 0.026;
  const hpFy = p.hipY - fy * 0.026;
  const HR = 0.072;
  const headX = p.neckX + ux * 0.098 + fx * 0.014;
  const headY = p.neckY + uy * 0.098 + fy * 0.014;
  const headA = Math.atan2(uy, ux) - Math.PI / 2 + p.tilt;

  const toSX = (lx: number) => o.x + lx * fc * H;
  const toSY = (ly: number) => o.gy - ly * H;
  const anchors: FigureAnchors = {
    headX: toSX(headX),
    headY: toSY(headY),
    nHandX: toSX(p.nHx),
    nHandY: toSY(p.nHy),
    fHandX: toSX(p.fHx),
    fHandY: toSY(p.fHy),
    chestX: toSX(lerp(p.neckX, p.hipX, 0.3)),
    chestY: toSY(lerp(p.neckY, p.hipY, 0.3)),
  };

  ctx.save();
  ctx.translate(o.x, o.gy);
  ctx.scale(fc * H, -H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  LX = (o.lightX - o.x) / (fc * H);
  LY = (o.gy - o.lightY) / H;
  RIM = `rgb(${o.rim})`;
  RIM_W = 0.1 * clamp(o.rimK, 0, 1);

  const flat = !!ghost;
  if (ghost) {
    ctx.globalAlpha = ghost.alpha;
    ctx.fillStyle = ghost.color;
    ctx.beginPath();
  }
  ctx.strokeStyle = look.ink;
  ctx.lineWidth = inkW;

  const part = (fill: CanvasGradient | string) => {
    if (flat) return;
    // Outline pass at double width, then the fill covers the inner half: clean union outline
    ctx.lineWidth = inkW * 2;
    ctx.stroke();
    ctx.lineWidth = inkW;
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const begin = () => {
    if (!flat) ctx.beginPath();
  };

  const seg = (
    ax: number,
    ay: number,
    ra: number,
    bx: number,
    by: number,
    rb: number,
    m: Mat,
    far: boolean
  ) => {
    begin();
    capsule(ctx, ax, ay, ra, bx, by, rb);
    part(flat ? '' : limbGrad(ctx, ax, ay, bx, by, Math.max(ra, rb), m, far));
  };

  const hand = (hx: number, hy: number, ex: number, ey: number, shape: HandShape, far: boolean, dir?: number) => {
    const m = look.glove ?? look.skin;
    let dx = hx - ex;
    let dy = hy - ey;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    if (dir !== undefined) {
      dx = Math.cos(dir);
      dy = Math.sin(dir);
    }
    const cx = hx + dx * 0.012;
    const cy = hy + dy * 0.012;
    const a = Math.atan2(dy, dx);
    if (shape === 'pushUp' || shape === 'pushDown' || shape === 'cupUp' || shape === 'cupDown') {
      // Perpendicular to the forearm, on the requested side (up or down in figure space)
      const want = shape === 'pushUp' || shape === 'cupUp' ? 1 : -1;
      let qx = -dy;
      let qy = dx;
      if (qy * want < 0) {
        qx = -qx;
        qy = -qy;
      }
      const push = shape === 'pushUp' || shape === 'pushDown';
      const wx = hx + dx * (push ? 0.014 : 0.01);
      const wy = hy + dy * (push ? 0.014 : 0.01);
      // Local hand frame: u along the forearm, v toward the fingers' side
      const X = (u: number, v: number) => wx + dx * u + qx * v;
      const Y = (u: number, v: number) => wy + dy * u + qy * v;
      begin();
      if (push) {
        capsule(ctx, X(0, -0.006), Y(0, -0.006), 0.021, X(0.004, 0.04), Y(0.004, 0.04), 0.019);
        capsule(ctx, X(0.004, 0.04), Y(0.004, 0.04), 0.016, X(0.017, 0.072), Y(0.017, 0.072), 0.011);
        capsule(ctx, X(0, 0.008), Y(0, 0.008), 0.011, X(0.03, 0.018), Y(0.03, 0.018), 0.008);
      } else {
        capsule(ctx, X(0, 0), Y(0, 0), 0.024, X(0.034, 0.004), Y(0.034, 0.004), 0.022);
        capsule(ctx, X(0.034, 0.004), Y(0.034, 0.004), 0.016, X(0.056, 0.024), Y(0.056, 0.024), 0.011);
        capsule(ctx, X(0, 0.012), Y(0, 0.012), 0.01, X(0.02, 0.03), Y(0.02, 0.03), 0.008);
      }
      part(flat ? '' : blobGrad(ctx, X(0.01, 0.02), Y(0.01, 0.02), 0.045, m, far));
      if (!flat) {
        // Finger separations
        ctx.beginPath();
        if (push) {
          ctx.moveTo(X(0.012, 0.046), Y(0.012, 0.046));
          ctx.lineTo(X(0.02, 0.066), Y(0.02, 0.066));
          ctx.moveTo(X(-0.002, 0.048), Y(-0.002, 0.048));
          ctx.lineTo(X(0.006, 0.07), Y(0.006, 0.07));
        } else {
          ctx.moveTo(X(0.036, 0.012), Y(0.036, 0.012));
          ctx.lineTo(X(0.05, 0.026), Y(0.05, 0.026));
        }
        ctx.lineWidth = inkW * 0.7;
        ctx.stroke();
        ctx.lineWidth = inkW;
      }
      return;
    }
    begin();
    if (shape === 'fist') {
      ctx.moveTo(cx + 0.034, cy);
      ctx.ellipse(cx, cy, 0.034, 0.03, a, 0, TAU);
    } else if (shape === 'palm') {
      // Open palm facing forward: flat and tall across the arm
      ctx.moveTo(cx + Math.cos(a) * 0.022, cy + Math.sin(a) * 0.022);
      ctx.ellipse(cx, cy, 0.022, 0.042, a, 0, TAU);
      capsule(
        ctx,
        cx + Math.cos(a + 1.5) * 0.02,
        cy + Math.sin(a + 1.5) * 0.02,
        0.012,
        cx + Math.cos(a + 0.9) * 0.05,
        cy + Math.sin(a + 0.9) * 0.05,
        0.009
      );
    } else {
      ctx.moveTo(cx + 0.03, cy);
      ctx.ellipse(cx, cy, 0.03, 0.036, a, 0, TAU);
    }
    part(flat ? '' : blobGrad(ctx, cx, cy, 0.04, m, far));
    if (!flat && shape === 'fist') {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a + 1.1) * 0.02, cy + Math.sin(a + 1.1) * 0.02);
      ctx.lineTo(cx + Math.cos(a + 0.2) * 0.028, cy + Math.sin(a + 0.2) * 0.028);
      ctx.lineWidth = inkW * 0.7;
      ctx.stroke();
      ctx.lineWidth = inkW;
    }
  };

  const arm = (
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    hx: number,
    hy: number,
    shape: HandShape,
    far: boolean,
    dir?: number
  ) => {
    // Upper arm skin, sleeve over its top, forearm, band or glove, hand
    seg(sx, sy, 0.05, ex, ey, 0.037, look.skin, far);
    const kx = lerp(sx, ex, look.sleeve);
    const ky = lerp(sy, ey, look.sleeve);
    seg(sx, sy, 0.05, kx, ky, 0.045, look.under, far);
    const mx = lerp(ex, hx, 0.3);
    const my = lerp(ey, hy, 0.3);
    begin();
    capsule(ctx, ex, ey, 0.036, mx, my, 0.041);
    capsule(ctx, mx, my, 0.041, hx, hy, 0.029);
    part(flat ? '' : limbGrad(ctx, ex, ey, hx, hy, 0.041, look.skin, far));
    if (look.band) seg(lerp(ex, hx, 0.58), lerp(ey, hy, 0.58), 0.038, lerp(ex, hx, 0.9), lerp(ey, hy, 0.9), 0.034, look.band, far);
    if (look.glove) seg(lerp(ex, hx, 0.5), lerp(ey, hy, 0.5), 0.041, hx, hy, 0.033, look.glove, far);
    hand(hx, hy, ex, ey, shape, far, dir);
  };

  const leg = (hx: number, hy: number, kx: number, ky: number, ax: number, ay: number, far: boolean) => {
    // Baggy trousers taper into the boot
    begin();
    const sx = lerp(kx, ax, 0.4);
    const sy = lerp(ky, ay, 0.4);
    capsule(ctx, hx, hy, 0.08, kx, ky, 0.06);
    capsule(ctx, kx, ky, 0.06, sx, sy, 0.064);
    capsule(ctx, sx, sy, 0.064, ax, ay, 0.046);
    part(flat ? '' : limbGrad(ctx, hx, hy, ax, ay, 0.08, look.pants, far));
    if (!flat && look.gi) {
      // Baggy gi folds: one at the knee, one down the shin
      ctx.beginPath();
      ctx.moveTo(lerp(hx, kx, 0.55), lerp(hy, ky, 0.55));
      ctx.quadraticCurveTo(lerp(hx, kx, 0.85) + 0.02, lerp(hy, ky, 0.85), kx + 0.01, ky - 0.02);
      ctx.moveTo(lerp(kx, ax, 0.25) - 0.02, lerp(ky, ay, 0.25));
      ctx.quadraticCurveTo(lerp(kx, ax, 0.5), lerp(ky, ay, 0.5) + 0.01, lerp(kx, ax, 0.62) + 0.015, lerp(ky, ay, 0.62));
      ctx.strokeStyle = far ? look.pants.deep : look.pants.shade;
      ctx.lineWidth = inkW * 0.8;
      ctx.stroke();
      ctx.strokeStyle = look.ink;
      ctx.lineWidth = inkW;
    }
    let dx = ax - kx;
    let dy = ay - ky;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const tx = -dy;
    const ty = dx;
    const bx = lerp(ax, kx, look.bootLen);
    const by = lerp(ay, ky, look.bootLen);
    // Foot
    const heelX = ax + dx * 0.035 - tx * 0.02;
    const heelY = ay + dy * 0.035 - ty * 0.02;
    const toeX = ax + dx * 0.045 + tx * 0.085;
    const toeY = ay + dy * 0.045 + ty * 0.085;
    begin();
    capsule(ctx, heelX, heelY, 0.036, toeX, toeY, 0.026);
    part(flat ? '' : limbGrad(ctx, heelX, heelY, toeX, toeY, 0.036, look.boot, far));
    begin();
    capsule(ctx, ax, ay, 0.044, bx, by, 0.05);
    part(flat ? '' : limbGrad(ctx, ax, ay, bx, by, 0.05, look.boot, far));
    if (!flat) {
      // Top trim and the toe cap / lace line
      seg(bx - tx * 0.04, by - ty * 0.04, 0.013, bx + tx * 0.04, by + ty * 0.04, 0.013, look.bootTrim, far);
      if (look.hairStyle === 'vegeta') {
        begin();
        capsule(ctx, lerp(heelX, toeX, 0.62), lerp(heelY, toeY, 0.62), 0.03, toeX, toeY, 0.025);
        part(blobGrad(ctx, toeX, toeY, 0.035, look.bootTrim, far));
      } else {
        ctx.beginPath();
        ctx.moveTo(lerp(ax, bx, 0.15) + tx * 0.04, lerp(ay, by, 0.15) + ty * 0.04);
        ctx.lineTo(lerp(ax, bx, 0.85) + tx * 0.044, lerp(ay, by, 0.85) + ty * 0.044);
        ctx.strokeStyle = look.bootTrim.base;
        ctx.lineWidth = inkW * 1.4;
        ctx.stroke();
        ctx.strokeStyle = look.ink;
        ctx.lineWidth = inkW;
      }
    }
  };

  // Far side first
  arm(shFx, shFy, p.fEx, p.fEy, p.fHx, p.fHy, o.handF, true, o.handDirF);
  leg(hpFx, hpFy, p.fKx, p.fKy, p.fFx, p.fFy, true);
  leg(hpNx, hpNy, p.nKx, p.nKy, p.nFx, p.nFy, false);

  // Torso
  const P = (i: number, k: number, off: number) => {
    TORSO[i * 2] = lerp(p.neckX, p.hipX, k) + fx * off;
    TORSO[i * 2 + 1] = lerp(p.neckY, p.hipY, k) + fy * off;
  };
  P(0, -0.02, 0.04);
  P(1, 0.1, 0.104);
  P(2, 0.36, 0.1);
  P(3, 0.66, 0.072);
  P(4, 0.98, 0.084);
  P(5, 1.1, 0.0);
  P(6, 0.98, -0.088);
  P(7, 0.66, -0.078);
  P(8, 0.3, -0.1);
  P(9, 0.06, -0.1);
  P(10, -0.04, -0.035);
  begin();
  smoothClosed(ctx, TORSO, 11);
  part(flat ? '' : limbGrad(ctx, p.neckX, p.neckY, p.hipX, p.hipY, 0.1, look.top, false));

  if (!flat) {
    const at = (k: number, off: number, axis: 0 | 1) =>
      axis === 0 ? lerp(p.neckX, p.hipX, k) + fx * off : lerp(p.neckY, p.hipY, k) + fy * off;
    if (look.gi) {
      // Blue undershirt V at the chest
      ctx.beginPath();
      ctx.moveTo(at(-0.02, 0.036, 0), at(-0.02, 0.036, 1));
      ctx.lineTo(at(0.08, 0.1, 0), at(0.08, 0.1, 1));
      ctx.lineTo(at(0.34, 0.094, 0), at(0.34, 0.094, 1));
      ctx.lineTo(at(0.06, 0.0, 0), at(0.06, 0.0, 1));
      ctx.closePath();
      ctx.fillStyle = limbGrad(ctx, p.neckX, p.neckY, p.hipX, p.hipY, 0.1, look.under, false);
      ctx.fill();
      ctx.stroke();
      // Chest emblem: a small white disc with a simple mark
      const ex = at(0.28, 0.045, 0);
      const ey = at(0.28, 0.045, 1);
      ctx.beginPath();
      ctx.ellipse(ex, ey, 0.024, 0.028, 0, 0, TAU);
      ctx.fillStyle = '#fbf6ea';
      ctx.fill();
      ctx.lineWidth = inkW * 0.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex - 0.01, ey + 0.012);
      ctx.lineTo(ex + 0.01, ey + 0.012);
      ctx.moveTo(ex, ey + 0.016);
      ctx.lineTo(ex, ey - 0.016);
      ctx.moveTo(ex - 0.011, ey - 0.002);
      ctx.lineTo(ex + 0.011, ey - 0.002);
      ctx.lineWidth = inkW * 0.9;
      ctx.stroke();
      ctx.lineWidth = inkW;
      // Gi folds
      ctx.beginPath();
      ctx.moveTo(at(0.45, -0.05, 0), at(0.45, -0.05, 1));
      ctx.quadraticCurveTo(at(0.55, 0.0, 0), at(0.55, 0.0, 1), at(0.6, 0.04, 0), at(0.6, 0.04, 1));
      ctx.moveTo(at(0.2, -0.06, 0), at(0.2, -0.06, 1));
      ctx.quadraticCurveTo(at(0.3, -0.02, 0), at(0.3, -0.02, 1), at(0.32, 0.01, 0), at(0.32, 0.01, 1));
      ctx.strokeStyle = look.top.deep;
      ctx.lineWidth = inkW * 0.8;
      ctx.stroke();
      ctx.strokeStyle = look.ink;
      ctx.lineWidth = inkW;
    } else {
      // Bodysuit: pec and ab lines
      ctx.beginPath();
      ctx.moveTo(at(0.12, 0.085, 0), at(0.12, 0.085, 1));
      ctx.quadraticCurveTo(at(0.32, 0.07, 0), at(0.32, 0.07, 1), at(0.34, 0.0, 0), at(0.34, 0.0, 1));
      ctx.moveTo(at(0.5, 0.06, 0), at(0.5, 0.06, 1));
      ctx.lineTo(at(0.52, 0.02, 0), at(0.52, 0.02, 1));
      ctx.moveTo(at(0.66, 0.055, 0), at(0.66, 0.055, 1));
      ctx.lineTo(at(0.68, 0.015, 0), at(0.68, 0.015, 1));
      ctx.strokeStyle = look.top.deep;
      ctx.lineWidth = inkW * 0.8;
      ctx.stroke();
      ctx.strokeStyle = look.ink;
      ctx.lineWidth = inkW;
    }
    if (look.belt) {
      ctx.beginPath();
      ctx.moveTo(at(0.8, 0.076, 0), at(0.8, 0.076, 1));
      ctx.lineTo(at(0.92, 0.082, 0), at(0.92, 0.082, 1));
      ctx.lineTo(at(0.92, -0.088, 0), at(0.92, -0.088, 1));
      ctx.lineTo(at(0.8, -0.082, 0), at(0.8, -0.082, 1));
      ctx.closePath();
      ctx.fillStyle = limbGrad(ctx, p.neckX, p.neckY, p.hipX, p.hipY, 0.1, look.belt, false);
      ctx.fill();
      ctx.stroke();
      // Knot tails flutter in the wind
      const kx = at(0.86, 0.066, 0);
      const ky = at(0.86, 0.066, 1);
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const sway = Math.sin(o.t * (9 + i * 3) + i * 2) * 0.035 * o.flutter;
        const back = -0.05 * o.flutter;
        const len = 0.12 - i * 0.02;
        const ex = kx + 0.012 + back + sway + i * 0.012;
        const ey = ky - len + Math.abs(sway) * 0.4 + o.flutter * 0.03;
        ctx.moveTo(kx - 0.008 + i * 0.01, ky);
        ctx.quadraticCurveTo(kx + back * 0.4 + sway * 0.5, ky - len * 0.5, ex, ey);
        ctx.lineTo(ex + 0.018, ey + 0.004);
        ctx.quadraticCurveTo(kx + 0.02 + back * 0.4 + sway * 0.5, ky - len * 0.45, kx + 0.014 + i * 0.01, ky);
        ctx.closePath();
      }
      ctx.fillStyle = look.belt.base;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(kx + 0.004, ky, 0.018, 0.014, 0, 0, TAU);
      ctx.fillStyle = look.belt.hi;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Neck
  seg(p.neckX - ux * 0.02, p.neckY - uy * 0.02, 0.04, headX - ux * 0.03, headY - uy * 0.03, 0.034, look.skin, false);

  // Head in its own frame: units of head radius, x forward
  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(headA);
  ctx.scale(HR, HR);
  const hInk = inkW / HR;
  ctx.lineWidth = hInk;
  const lx0 = (LX - headX) / HR;
  const ly0 = (LY - headY) / HR;
  const ca = Math.cos(-headA);
  const sa = Math.sin(-headA);
  const saveLX = LX;
  const saveLY = LY;
  LX = lx0 * ca - ly0 * sa;
  LY = lx0 * sa + ly0 * ca;

  // Hair shape with flutter
  const src = look.hairPts ?? (look.hairStyle === 'goku' ? GOKU_HAIR : VEGETA_HAIR);
  const n = src.length / 2;
  for (let i = 0; i < n; i++) {
    let x = src[i * 2];
    let y = src[i * 2 + 1];
    const tip = i % 2 === 1;
    if (look.hairStyle === 'vegeta' && y > 1) {
      // One tall solid flame: stretch it up and fill in the notches
      if (!tip && y > 1.3) y += 0.45;
      y = 1 + (y - 1) * 1.15;
    }
    if (tip) {
      if (look.hairStyle === 'goku') {
        x *= 1.16;
        y = y * 1.16 - 0.08;
      }
      const r = Math.hypot(x, y);
      const k = clamp((r - 1) / 1.2, 0, 1);
      x += Math.sin(o.t * (11 + i) + i * 1.9) * 0.1 * o.flutter * k - 0.12 * o.flutter * k;
      y += Math.cos(o.t * (13 + i) + i * 1.3) * 0.08 * o.flutter * k + o.hairLift * 0.35 * k * (y < 0.5 ? 1.6 : 1);
    }
    HAIR[i * 2] = x;
    HAIR[i * 2 + 1] = y;
  }
  const hairPath = () => {
    ctx.moveTo(HAIR[0], HAIR[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(HAIR[i * 2], HAIR[i * 2 + 1]);
    ctx.lineTo(-0.2, -0.05);
    if (look.hairStyle === 'goku') ctx.lineTo(0.35, 0.52);
    else {
      // High forehead with a sharp widow's peak
      ctx.lineTo(0.3, 0.46);
      ctx.lineTo(0.56, 0.24);
    }
    ctx.closePath();
  };

  if (flat) {
    ctx.moveTo(1, 0);
    ctx.arc(0, 0, 1, 0, TAU);
    hairPath();
    ctx.restore();
    ctx.fill();
    ctx.restore();
    LX = saveLX;
    LY = saveLY;
    return anchors;
  }

  // Skull and face profile
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.arc(0, 0, 1, 0, TAU);
  // Same winding as the arc so the union fills solid
  ctx.moveTo(-0.2, 0.2);
  ctx.lineTo(-0.3, -0.55);
  ctx.lineTo(0.3, -0.98);
  ctx.lineTo(0.8, -0.82);
  ctx.lineTo(0.96, -0.44);
  ctx.lineTo(0.98, -0.26);
  ctx.lineTo(1.2, -0.14);
  ctx.lineTo(1.0, 0.1);
  ctx.lineTo(0.96, 0.36);
  ctx.lineTo(0.55, 0.62);
  ctx.closePath();
  ctx.lineWidth = hInk * 2;
  ctx.stroke();
  ctx.lineWidth = hInk;
  ctx.fillStyle = blobGrad(ctx, 0.1, 0, 1.2, look.skin, false);
  ctx.fill();
  // Jaw shadow
  ctx.beginPath();
  ctx.moveTo(0.3, -0.98);
  ctx.lineTo(-0.3, -0.55);
  ctx.lineTo(0.1, -0.62);
  ctx.closePath();
  ctx.fillStyle = look.skin.shade;
  ctx.fill();

  // Eye: sclera wedge, dark iris toward the front, heavy upper lid
  const sq = o.strain;
  ctx.beginPath();
  ctx.moveTo(0.46, 0.12 - sq * 0.04);
  ctx.lineTo(0.84, 0.08 - sq * 0.05);
  ctx.lineTo(0.76, -0.12 + sq * 0.05);
  ctx.lineTo(0.52, -0.06 + sq * 0.02);
  ctx.closePath();
  ctx.fillStyle = '#fbfaf6';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.72, -0.01, 0.075, 0.1 - sq * 0.04, 0, 0, TAU);
  ctx.fillStyle = look.iris ?? '#1b1422';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.42, 0.14 - sq * 0.04);
  ctx.lineTo(0.88, 0.09 - sq * 0.05);
  ctx.lineWidth = hInk * 1.8;
  ctx.stroke();
  // Brow: Vegeta scowls harder
  const vb = look.hairStyle === 'vegeta' ? 0.08 : 0;
  ctx.beginPath();
  ctx.moveTo(0.36, 0.34 + vb);
  ctx.lineTo(0.94, 0.22 - sq * 0.08 - vb);
  ctx.lineWidth = hInk * 2.2;
  ctx.stroke();
  ctx.lineWidth = hInk;
  // Mouth
  ctx.beginPath();
  if (o.mouth > 0.05) {
    const m = o.mouth;
    ctx.moveTo(0.97, -0.44);
    ctx.lineTo(0.66, -0.42 - m * 0.05);
    ctx.lineTo(0.9, -0.44 - m * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#4a1420';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.moveTo(0.95, -0.46);
    ctx.lineTo(0.72, -0.46);
    ctx.stroke();
  }

  // Hair
  ctx.beginPath();
  hairPath();
  ctx.fillStyle = blobGrad(ctx, -0.2, 0.9, 1.6, look.hair, false);
  ctx.fill();
  ctx.lineWidth = hInk * 1.1;
  ctx.stroke();
  // Hair strand highlights
  ctx.beginPath();
  for (let i = 1; i < n; i += 2) {
    const tx = HAIR[i * 2];
    const ty = HAIR[i * 2 + 1];
    ctx.moveTo(lerp(tx, 0, 0.3), lerp(ty, 0.6, 0.3));
    ctx.lineTo(lerp(tx, 0, 0.62), lerp(ty, 0.6, 0.62));
  }
  ctx.strokeStyle = look.hair.hi;
  ctx.lineWidth = hInk * 1.4;
  ctx.stroke();
  ctx.strokeStyle = look.ink;
  ctx.lineWidth = hInk;
  if (look.hairStyle === 'goku') {
    // Bangs falling over the forehead
    ctx.beginPath();
    const fl = Math.sin(o.t * 12) * 0.05 * o.flutter;
    ctx.moveTo(0.3, 0.6);
    ctx.lineTo(0.62, 0.52);
    ctx.lineTo(1.2 + fl, 0.14 + o.hairLift * 0.25);
    ctx.lineTo(0.86, 0.56);
    ctx.lineTo(1.16 - fl, 0.52 + o.hairLift * 0.25);
    ctx.lineTo(0.8, 0.8);
    ctx.lineTo(0.4, 0.95);
    ctx.closePath();
    ctx.fillStyle = look.hair.base;
    ctx.fill();
    ctx.stroke();
  }
  // Ear sits over the sideburn
  ctx.beginPath();
  ctx.ellipse(-0.2, -0.1, 0.17, 0.26, 0.2, 0, TAU);
  ctx.fillStyle = look.skin.base;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-0.18, -0.1, 0.07, 0.13, 0.2, 0, TAU);
  ctx.fillStyle = look.skin.shade;
  ctx.fill();
  ctx.restore();
  LX = saveLX;
  LY = saveLY;
  ctx.lineWidth = inkW;

  // Near arm on top
  arm(shNx, shNy, p.nEx, p.nEy, p.nHx, p.nHy, o.handN, false, o.handDirN);

  ctx.restore();
  return anchors;
}

/* ---------- pose helpers ---------- */

/** Bone lengths in figure units, matched to the authored poses */
export const BONE = {
  upperArm: 0.145,
  foreArm: 0.14,
  thigh: 0.225,
  shin: 0.205,
  spine: 0.325,
};

const IK = new Float64Array(2);

/**
 * Two bone IK: writes the middle joint (elbow or knee) into out, bending toward the pole.
 * Targets out of reach straighten the limb along the line to the target.
 */
export function solveJoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  poleX: number,
  poleY: number,
  out: Float64Array
) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-6 ? dx / d : 1;
  const uy = d > 1e-6 ? dy / d : 0;
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const nx = -uy;
  const ny = ux;
  const side = (poleX - ax) * nx + (poleY - ay) * ny >= 0 ? 1 : -1;
  out[0] = ax + ux * a + nx * h * side;
  out[1] = ay + uy * a + ny * h * side;
}

/**
 * Keeps the bones honest: puts the neck a spine length from the hips, then re-solves both
 * elbows and knees for the current hands and feet. Each elbow or knee already in the pose
 * acts as the pole, so authors place it roughly and the solver fixes the lengths.
 */
export function settleLimbs(p: DbzPose, spine = BONE.spine) {
  let ux = p.neckX - p.hipX;
  let uy = p.neckY - p.hipY;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  p.neckX = p.hipX + ux * spine;
  p.neckY = p.hipY + uy * spine;
  const fx = uy;
  const fy = -ux;
  // Joint roots, same offsets the figure uses when it draws
  const sNx = p.neckX - ux * 0.035 + fx * 0.012;
  const sNy = p.neckY - uy * 0.035 + fy * 0.012;
  const sFx = p.neckX - ux * 0.035 - fx * 0.03;
  const sFy = p.neckY - uy * 0.035 - fy * 0.03;
  const hNx = p.hipX + fx * 0.012;
  const hNy = p.hipY + fy * 0.012;
  const hFx = p.hipX - fx * 0.026;
  const hFy = p.hipY - fy * 0.026;
  solveJoint(sNx, sNy, p.nHx, p.nHy, BONE.upperArm, BONE.foreArm, p.nEx, p.nEy, IK);
  p.nEx = IK[0];
  p.nEy = IK[1];
  solveJoint(sFx, sFy, p.fHx, p.fHy, BONE.upperArm, BONE.foreArm, p.fEx, p.fEy, IK);
  p.fEx = IK[0];
  p.fEy = IK[1];
  solveJoint(hNx, hNy, p.nFx, p.nFy, BONE.thigh, BONE.shin, p.nKx, p.nKy, IK);
  p.nKx = IK[0];
  p.nKy = IK[1];
  solveJoint(hFx, hFy, p.fFx, p.fFy, BONE.thigh, BONE.shin, p.fKx, p.fKy, IK);
  p.fKx = IK[0];
  p.fKy = IK[1];
  return p;
}

/** Blank pose to fill in place */
export const makePose = (): DbzPose => {
  const p = {} as DbzPose;
  for (const k of KEYS) p[k] = 0;
  return p;
};

/* ---------- misc helpers ---------- */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** Pooled particle used by both scenes */
export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: number;
  rot: number;
}

export const makeMotes = (n: number): Mote[] =>
  Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, kind: 0, rot: 0 }));

/** Anime impact star: a jagged burst polygon */
export function burstPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spikes: number,
  seed: number
) {
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + seed;
    const k = i % 2 === 0 ? 1 - 0.35 * ((Math.sin(seed * 7 + i * 3.1) + 1) / 2) : 0.38;
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
