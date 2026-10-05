import {
  clamp,
  createCanvasScene,
  damp,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  noise,
  rand,
  TAU,
  tone,
} from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Power Up: a fighter powering up in a golden aura on a dusk wasteland.
 * Ported from the old DBZ codex scene and rebuilt: a proper backlit silhouette with
 * rim light and flaring hair, a flame shaped aura, rocks that lift with the charge,
 * glowing ground cracks, anime speed lines, lightning and a charge-scaled screen shake.
 * Holding fills a meter through a ladder of forms (Super Saiyan, 2, 3, God, Blue and
 * Ultra Instinct), each with its own hair, palette, aura and particles, and a flash,
 * shockwave and roar at every threshold. Letting go keeps the form for a few seconds,
 * then it powers down a step at a time; a quick tap steps down at once.
 */

/* ---------- shared fighter figure (also used by the Spirit Bomb scene) ---------- */

/**
 * Joint layout in figure units: x to the viewer's right from the figure centre,
 * y up from the ground, 1 = standing height to the top of the head (hair excluded).
 */
export interface Pose {
  pelvisY: number;
  lean: number;
  chest: number;
  lEx: number;
  lEy: number;
  lHx: number;
  lHy: number;
  rEx: number;
  rEy: number;
  rHx: number;
  rHy: number;
  lKx: number;
  lKy: number;
  lFx: number;
  rKx: number;
  rKy: number;
  rFx: number;
}

const POSE_KEYS: readonly (keyof Pose)[] = [
  'pelvisY',
  'lean',
  'chest',
  'lEx',
  'lEy',
  'lHx',
  'lHy',
  'rEx',
  'rEy',
  'rHx',
  'rHy',
  'lKx',
  'lKy',
  'lFx',
  'rKx',
  'rKy',
  'rFx',
];

export const clonePose = (p: Pose): Pose => ({ ...p });

export function lerpPose(out: Pose, a: Pose, b: Pose, k: number): Pose {
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], k);
  return out;
}

export interface FighterStyle {
  body: string | CanvasGradient;
  pants: string | CanvasGradient;
  band: string;
  /** "r,g,b" */
  hair: string;
  rim: string | CanvasGradient;
  rimWidth: number;
  /** Muscle and fold lines */
  detail: string;
  eye: string;
  eyeAlpha: number;
  /** 0 relaxed spikes, 1 fully flared upward */
  hairUp: number;
  /**
   * Optional custom hair: replaces the default spikes (rim and fill) when set.
   * Called with the head centre in canvas pixels and the figure height H.
   */
  hairPath?: (ctx: CanvasRenderingContext2D, headX: number, headY: number, H: number) => void;
  /** Optional custom bangs drawn over the face, same arguments as hairPath */
  bangsPath?: (ctx: CanvasRenderingContext2D, headX: number, headY: number, H: number) => void;
  /** Hair fill override (defaults to rgb(hair)) */
  hairFill?: string | CanvasGradient;
  /** Hair outline colour override */
  hairLine?: string;
  /** Eye read: angled glare (default), flat heavy glare, or level and calm */
  eyeShape?: 'angry' | 'flat' | 'calm';
  /** Muscle mass: 0 athletic (default), 1 hulking, negative leaner. The head never scales */
  bulk?: number;
  /** Muscle definition 0..1: extra ab rows, lats, veins and striations */
  cut?: number;
}

/** Hair spikes: base angle, relaxed tip angle, relaxed length, flared tip angle, flared length (deg, 0 = up) */
const SPIKES: readonly (readonly [number, number, number, number, number])[] = [
  [-112, -128, 0.05, -96, 0.08],
  [-88, -104, 0.065, -70, 0.13],
  [-62, -72, 0.075, -46, 0.17],
  [-34, -40, 0.08, -24, 0.2],
  [-6, -10, 0.08, -4, 0.22],
  [22, 26, 0.08, 14, 0.2],
  [50, 60, 0.075, 38, 0.17],
  [78, 96, 0.065, 64, 0.13],
  [104, 124, 0.05, 92, 0.08],
];
const DEG = Math.PI / 180;

/** Adds a tapered capsule as its own clockwise subpath */
function capsule(
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
  if (d <= Math.abs(r1 - r2) + 0.01) {
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

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

/**
 * Draws an anime fighter silhouette, backlit: a rim stroke pass under a fill pass
 * leaves a clean outline around the union of all body parts.
 */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  x0: number,
  gy: number,
  H: number,
  p: Pose,
  st: FighterStyle,
  t: number
) {
  const X = (u: number) => x0 + u * H;
  const Y = (v: number) => gy - v * H;
  const sY = p.pelvisY + 0.31 + p.chest;
  const b = st.bulk ?? 0;
  const cut = st.cut ?? 0;
  // Limb thickness, torso width, neck and hip scale with the bulk
  const lm = 1 + 0.34 * b;
  const tw = 1 + 0.2 * b;
  const nk = 1 + 0.5 * b;
  const hp = 1 + 0.1 * b;
  const sx = 0.125 * (1 + 0.22 * b);
  const hx = p.lean * 1.2;
  const hy = sY + 0.128 + p.chest * 0.5;
  const hr = 0.061;

  const legs = () => {
    for (const side of [-1, 1]) {
      const kx = side < 0 ? p.lKx : p.rKx;
      const ky = side < 0 ? p.lKy : p.rKy;
      const fx = side < 0 ? p.lFx : p.rFx;
      const lg = 1 + 0.26 * b;
      capsule(ctx, X(side * 0.068 * hp), Y(p.pelvisY), 0.062 * lg * H, X(kx), Y(ky), 0.047 * lg * H);
      capsule(ctx, X(kx), Y(ky), 0.047 * lg * H, X(fx), Y(0.075), 0.043 * lg * H);
    }
    // Pelvis block, clockwise on screen
    ctx.moveTo(X(-0.105 * hp + p.lean * 0.3), Y(p.pelvisY + 0.07));
    ctx.lineTo(X(0.105 * hp + p.lean * 0.3), Y(p.pelvisY + 0.07));
    ctx.lineTo(X(0.11 * hp), Y(p.pelvisY - 0.03));
    ctx.lineTo(X(-0.11 * hp), Y(p.pelvisY - 0.03));
    ctx.closePath();
  };
  const boots = () => {
    for (const fx of [p.lFx, p.rFx]) {
      const out = Math.sign(fx) || 1;
      capsule(ctx, X(fx), Y(0.085), 0.036 * H, X(fx), Y(0.025), 0.034 * H);
      capsule(ctx, X(fx - out * 0.01), Y(0.02), 0.024 * H, X(fx + out * 0.05), Y(0.014), 0.016 * H);
    }
  };
  const torso = () => {
    const l = p.lean;
    const wy = p.pelvisY + 0.05;
    ctx.moveTo(X(-sx + l), Y(sY + 0.015));
    // Lats flare wider than the chest as the bulk grows, the waist stays tighter
    const lat = 1 + 0.32 * b;
    const ws = 1 + 0.08 * b;
    ctx.quadraticCurveTo(X(-0.06 * tw + l), Y(sY + 0.06), X(-0.03 * nk + l), Y(sY + 0.07));
    ctx.lineTo(X(0.03 * nk + l), Y(sY + 0.07));
    ctx.quadraticCurveTo(X(0.06 * tw + l), Y(sY + 0.06), X(sx + l), Y(sY + 0.015));
    ctx.quadraticCurveTo(X(0.15 * lat + l), Y(sY - 0.06), X(0.118 * lat + l * 0.6), Y(sY - 0.13));
    ctx.quadraticCurveTo(X(0.085 * ws + l * 0.3), Y(wy + 0.06), X(0.088 * ws + l * 0.2), Y(wy));
    ctx.lineTo(X(-0.088 * ws + l * 0.2), Y(wy));
    ctx.quadraticCurveTo(X(-0.085 * ws + l * 0.3), Y(wy + 0.06), X(-0.118 * lat + l * 0.6), Y(sY - 0.13));
    ctx.quadraticCurveTo(X(-0.15 * lat + l), Y(sY - 0.06), X(-sx + l), Y(sY + 0.015));
    ctx.closePath();
    capsule(ctx, X(hx * 0.8), Y(sY + 0.02), 0.036 * nk * H, X(hx), Y(hy - 0.05), 0.028 * Math.max(1, nk * 0.9) * H);
    if (b > 0.05) {
      // Traps: slopes from the neck down to the shoulders, rising with the bulk
      const tr = Math.min(1, b);
      for (const side of [-1, 1]) {
        ctx.moveTo(X(hx * 0.9 + side * 0.012), Y(hy - 0.045));
        ctx.quadraticCurveTo(
          X(l + side * 0.07 * tw),
          Y(sY + 0.03 + 0.05 * tr),
          X(l + side * sx * 1.02),
          Y(sY + 0.012)
        );
        ctx.lineTo(X(l + side * 0.03), Y(sY + 0.0));
        ctx.closePath();
      }
    }
  };
  const arms = () => {
    for (const side of [-1, 1]) {
      const ex = side < 0 ? p.lEx : p.rEx;
      const ey = side < 0 ? p.lEy : p.rEy;
      const hxx = side < 0 ? p.lHx : p.rHx;
      const hyy = side < 0 ? p.lHy : p.rHy;
      const shx = side * sx + p.lean;
      circle(ctx, X(shx), Y(sY - 0.005), 0.05 * (1 + 0.4 * b) * H);
      // Upper arm with a biceps belly a third of the way down
      const bx = lerp(shx, ex, 0.45);
      const by = lerp(sY - 0.01, ey, 0.45);
      capsule(ctx, X(shx), Y(sY - 0.01), 0.045 * lm * H, X(bx), Y(by), 0.047 * (1 + 0.42 * b) * H);
      capsule(ctx, X(bx), Y(by), 0.047 * (1 + 0.42 * b) * H, X(ex), Y(ey), 0.034 * lm * H);
      // Forearm bulges near the elbow then tapers to the wrist
      const fx = lerp(ex, hxx, 0.3);
      const fy = lerp(ey, hyy, 0.3);
      capsule(ctx, X(ex), Y(ey), 0.034 * lm * H, X(fx), Y(fy), 0.039 * lm * H);
      capsule(ctx, X(fx), Y(fy), 0.039 * lm * H, X(hxx), Y(hyy), 0.027 * (1 + 0.2 * b) * H);
      circle(ctx, X(hxx), Y(hyy), 0.036 * (1 + 0.12 * b) * H);
    }
  };
  const bands = () => {
    for (const side of [-1, 1]) {
      const ex = side < 0 ? p.lEx : p.rEx;
      const ey = side < 0 ? p.lEy : p.rEy;
      const hxx = side < 0 ? p.lHx : p.rHx;
      const hyy = side < 0 ? p.lHy : p.rHy;
      capsule(
        ctx,
        X(lerp(ex, hxx, 0.62)),
        Y(lerp(ey, hyy, 0.62)),
        0.034 * lerp(lm, 1 + 0.2 * b, 0.6) * H,
        X(lerp(ex, hxx, 0.82)),
        Y(lerp(ey, hyy, 0.82)),
        0.031 * (1 + 0.2 * b) * H
      );
    }
    // Belt sash
    ctx.moveTo(X(-0.1 * hp + p.lean * 0.3), Y(p.pelvisY + 0.075));
    ctx.lineTo(X(0.1 * hp + p.lean * 0.3), Y(p.pelvisY + 0.075));
    ctx.lineTo(X(0.1 * hp + p.lean * 0.25), Y(p.pelvisY + 0.04));
    ctx.lineTo(X(-0.1 * hp + p.lean * 0.25), Y(p.pelvisY + 0.04));
    ctx.closePath();
    // Knot tails
    ctx.moveTo(X(0.03), Y(p.pelvisY + 0.05));
    ctx.lineTo(X(0.06), Y(p.pelvisY + 0.05));
    ctx.lineTo(X(0.075), Y(p.pelvisY - 0.04));
    ctx.lineTo(X(0.05), Y(p.pelvisY - 0.045));
    ctx.closePath();
  };
  const head = () => {
    ctx.moveTo(X(hx + hr), Y(hy));
    ctx.ellipse(X(hx), Y(hy), hr * H, hr * 1.1 * H, 0, 0, TAU);
    ctx.moveTo(X(hx - hr * 0.95), Y(hy - 0.005));
    ctx.lineTo(X(hx + hr * 0.95), Y(hy - 0.005));
    ctx.lineTo(X(hx + hr * 0.72), Y(hy - 0.05));
    ctx.lineTo(X(hx + 0.008), Y(hy - 0.08));
    ctx.lineTo(X(hx - 0.008), Y(hy - 0.08));
    ctx.lineTo(X(hx - hr * 0.72), Y(hy - 0.05));
    ctx.closePath();
  };
  const hair = () => {
    if (st.hairPath) {
      st.hairPath(ctx, X(hx), Y(hy), H);
      return;
    }
    const up = st.hairUp;
    const R = hr * 1.02;
    const polar = (deg: number, dist: number) => {
      ctx.lineTo(X(hx + Math.sin(deg * DEG) * dist), Y(hy + Math.cos(deg * DEG) * dist));
    };
    ctx.moveTo(X(hx + Math.sin(-100 * DEG) * R * 1.05), Y(hy + Math.cos(-100 * DEG) * R * 1.05));
    for (let i = 0; i < SPIKES.length; i++) {
      const [base, ca, cl, ua, ul] = SPIKES[i];
      const flick = Math.sin(t * 17 + i * 1.7) * 3 * up;
      const len = lerp(cl, ul, up) * (1 + 0.06 * Math.sin(t * 23 + i * 2.1) * up);
      if (i > 0) polar((base + SPIKES[i - 1][0]) / 2, R * lerp(1.45, 1.75, up));
      polar(lerp(ca, ua, up) + flick, R + len);
    }
    polar(100, R * 1.05);
    ctx.lineTo(X(hx), Y(hy + 0.022));
    ctx.closePath();
  };
  const bangs = () => {
    if (st.bangsPath) {
      st.bangsPath(ctx, X(hx), Y(hy), H);
      return;
    }
    const up = st.hairUp;
    for (const side of [-1, 1]) {
      const tipX = hx + side * lerp(0.02, 0.03, up);
      const tipY = hy - lerp(0.02, 0.0, up);
      ctx.moveTo(X(hx + side * 0.004), Y(hy + 0.05));
      ctx.lineTo(X(hx + side * 0.045), Y(hy + 0.045));
      ctx.lineTo(X(tipX), Y(tipY));
      ctx.closePath();
    }
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Pass 1: rim light around the whole silhouette
  ctx.beginPath();
  legs();
  boots();
  torso();
  arms();
  head();
  hair();
  ctx.strokeStyle = st.rim;
  ctx.lineWidth = st.rimWidth * 2;
  ctx.stroke();

  // Pass 2: fills by material
  ctx.beginPath();
  legs();
  ctx.fillStyle = st.pants;
  ctx.fill();
  ctx.beginPath();
  boots();
  ctx.fillStyle = st.band;
  ctx.fill();
  ctx.fillStyle = st.body;
  ctx.beginPath();
  torso();
  ctx.fill();
  ctx.beginPath();
  arms();
  ctx.fill();
  ctx.beginPath();
  head();
  ctx.fill();
  ctx.beginPath();
  bands();
  ctx.fillStyle = st.band;
  ctx.fill();

  // Details: pecs, abs, gi folds
  const l = p.lean;
  ctx.strokeStyle = st.detail;
  ctx.lineWidth = Math.max(1, H * 0.005);
  ctx.beginPath();
  const pd = 0.1 + 0.025 * Math.max(0, b);
  ctx.moveTo(X(-0.095 * tw + l), Y(sY - 0.07));
  ctx.quadraticCurveTo(X(-0.05 * tw + l), Y(sY - pd), X(-0.004 + l), Y(sY - 0.075));
  ctx.moveTo(X(0.095 * tw + l), Y(sY - 0.07));
  ctx.quadraticCurveTo(X(0.05 * tw + l), Y(sY - pd), X(0.004 + l), Y(sY - 0.075));
  ctx.moveTo(X(l * 0.8), Y(sY - 0.1));
  ctx.lineTo(X(l * 0.5), Y(p.pelvisY + 0.09));
  for (let i = 0; i < 3; i++) {
    const ay = lerp(sY - 0.14, p.pelvisY + 0.1, i / 2.5);
    const aw = lerp(0.045, 0.035, i / 3);
    const ax = lerp(l * 0.8, l * 0.5, i / 3);
    ctx.moveTo(X(ax - aw), Y(ay));
    ctx.quadraticCurveTo(X(ax), Y(ay - 0.008), X(ax + aw), Y(ay));
  }
  for (const side of [-1, 1]) {
    const kx = side < 0 ? p.lKx : p.rKx;
    const ky = side < 0 ? p.lKy : p.rKy;
    ctx.moveTo(X(side * 0.05), Y(p.pelvisY - 0.03));
    ctx.quadraticCurveTo(X(lerp(side * 0.05, kx, 0.5) - side * 0.02), Y(lerp(p.pelvisY, ky, 0.5)), X(kx), Y(ky + 0.02));
  }
  ctx.stroke();

  // Extra definition with mass or cut: lower ab row, obliques, delt and biceps striations, forearm veins
  const def = Math.max(cut, b);
  if (def > 0.05) {
    ctx.globalAlpha = Math.min(1, def * 1.2);
    ctx.beginPath();
    const ay = p.pelvisY + 0.075;
    ctx.moveTo(X(l * 0.5 - 0.03), Y(ay));
    ctx.quadraticCurveTo(X(l * 0.5), Y(ay - 0.008), X(l * 0.5 + 0.03), Y(ay));
    for (const side of [-1, 1]) {
      // Obliques and serratus notches down the flank
      ctx.moveTo(X(l + side * 0.1 * tw), Y(sY - 0.11));
      ctx.quadraticCurveTo(X(l + side * 0.085 * tw), Y(sY - 0.2), X(l * 0.4 + side * 0.06), Y(p.pelvisY + 0.07));
      for (let i = 0; i < 3; i++) {
        const yy = sY - 0.12 - i * 0.025;
        ctx.moveTo(X(l + side * 0.108 * tw), Y(yy));
        ctx.lineTo(X(l + side * 0.085 * tw), Y(yy - 0.012));
      }
    }
    ctx.stroke();
    if (b > 0.45) {
      // Striations on the delts and veins along the forearms
      ctx.globalAlpha = Math.min(1, (b - 0.45) * 2);
      ctx.lineWidth = Math.max(0.8, H * 0.0035);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const shx = side * sx + l;
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(X(shx + side * 0.012 * i), Y(sY + 0.03));
          ctx.lineTo(X(shx + side * (0.02 + 0.012 * i)), Y(sY - 0.035));
        }
        const ex = side < 0 ? p.lEx : p.rEx;
        const ey = side < 0 ? p.lEy : p.rEy;
        const hxx = side < 0 ? p.lHx : p.rHx;
        const hyy = side < 0 ? p.lHy : p.rHy;
        const nx = -(hyy - ey);
        const ny = hxx - ex;
        const nl = Math.hypot(nx, ny) || 1;
        ctx.moveTo(X(lerp(ex, hxx, 0.1)), Y(lerp(ey, hyy, 0.1)));
        for (let k = 1; k <= 4; k++) {
          const q = 0.1 + k * 0.12;
          const o = (k % 2 ? 0.012 : -0.006) * side;
          ctx.lineTo(X(lerp(ex, hxx, q) + (nx / nl) * o), Y(lerp(ey, hyy, q) + (ny / nl) * o));
        }
        // Biceps split
        const bx = lerp(shx, ex, 0.3);
        const by = lerp(sY - 0.01, ey, 0.3);
        ctx.moveTo(X(bx), Y(by));
        ctx.lineTo(X(lerp(shx, ex, 0.65)), Y(lerp(sY - 0.01, ey, 0.65)));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Hair on top, then bangs
  ctx.fillStyle = st.hairFill ?? `rgb(${st.hair})`;
  ctx.beginPath();
  hair();
  ctx.fill();
  ctx.strokeStyle = st.hairLine ?? 'rgba(90,50,20,0.55)';
  ctx.lineWidth = Math.max(1, H * 0.004);
  ctx.stroke();
  ctx.beginPath();
  bangs();
  ctx.fill();

  // Eyes
  if (st.eyeAlpha > 0.01) {
    ctx.globalAlpha = st.eyeAlpha;
    ctx.strokeStyle = st.eye;
    ctx.lineWidth = Math.max(1.2, H * 0.009);
    ctx.beginPath();
    const shape = st.eyeShape ?? 'angry';
    // Inner and outer eye corner heights for each read
    const [outer, inner] = shape === 'flat' ? [-0.012, -0.017] : shape === 'calm' ? [-0.012, -0.012] : [-0.006, -0.016];
    ctx.moveTo(X(hx - 0.034), Y(hy + outer));
    ctx.lineTo(X(hx - 0.012), Y(hy + inner));
    ctx.moveTo(X(hx + 0.034), Y(hy + outer));
    ctx.lineTo(X(hx + 0.012), Y(hy + inner));
    ctx.stroke();
  }
  ctx.restore();

  return { headX: X(hx), headY: Y(hy), shoulderY: Y(sY) };
}

/** Deterministic PRNG so terrain and props stay put across resizes */
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

/** Flat-topped mesa skyline as x,y pairs in CSS pixels */
export function mesaSkyline(w: number, baseY: number, height: number, seed: number) {
  const rng = mulberry32(seed);
  const pts: number[] = [-20, baseY];
  let x = -20;
  let y = baseY - height * (0.2 + rng() * 0.3);
  pts.push(x, y);
  while (x < w + 20) {
    const kind = rng();
    if (kind < 0.35) {
      // Mesa: steep rise, flat top, steep drop
      const top = baseY - height * (0.55 + rng() * 0.45);
      x += 6 + rng() * 10;
      pts.push(x, top);
      x += 30 + rng() * 90;
      pts.push(x, top + rng() * 3);
      x += 6 + rng() * 12;
      y = baseY - height * (0.1 + rng() * 0.25);
      pts.push(x, y);
    } else {
      x += 20 + rng() * 50;
      y = clamp(y + (rng() - 0.5) * height * 0.35, baseY - height * 0.5, baseY - height * 0.05);
      pts.push(x, y);
    }
  }
  pts.push(w + 20, baseY);
  return new Float32Array(pts);
}

export function fillSkyline(ctx: CanvasRenderingContext2D, pts: Float32Array, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0], bottom);
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineTo(pts[pts.length - 2], bottom);
  ctx.closePath();
  ctx.fill();
}

export function strokeSkyline(ctx: CanvasRenderingContext2D, pts: Float32Array) {
  ctx.beginPath();
  ctx.moveTo(pts[2], pts[3]);
  for (let i = 4; i < pts.length - 2; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/* ---------- scene ---------- */

const CALM: Pose = {
  pelvisY: 0.5,
  lean: 0,
  chest: 0,
  lEx: -0.185,
  lEy: 0.635,
  lHx: -0.19,
  lHy: 0.47,
  rEx: 0.185,
  rEy: 0.635,
  rHx: 0.19,
  rHy: 0.47,
  lKx: -0.1,
  lKy: 0.27,
  lFx: -0.125,
  rKx: 0.1,
  rKy: 0.27,
  rFx: 0.125,
};
const CHARGED: Pose = {
  pelvisY: 0.465,
  lean: 0,
  chest: 0.012,
  lEx: -0.255,
  lEy: 0.625,
  lHx: -0.165,
  lHy: 0.505,
  rEx: 0.255,
  rEy: 0.625,
  rHx: 0.165,
  rHy: 0.505,
  lKx: -0.165,
  lKy: 0.255,
  lFx: -0.205,
  rKx: 0.165,
  rKy: 0.255,
  rFx: 0.205,
};
/** The burst at each threshold: fists driven down and out, chest thrown open */
const SCREAM: Pose = {
  pelvisY: 0.45,
  lean: 0,
  chest: 0.022,
  lEx: -0.27,
  lEy: 0.6,
  lHx: -0.32,
  lHy: 0.45,
  rEx: 0.27,
  rEy: 0.6,
  rHx: 0.32,
  rHy: 0.45,
  lKx: -0.19,
  lKy: 0.25,
  lFx: -0.235,
  rKx: 0.19,
  rKy: 0.25,
  rFx: 0.235,
};
/** Ultra Instinct: upright and loose, a lead hand raised in a quiet guard */
const STILL: Pose = {
  pelvisY: 0.49,
  lean: 0.004,
  chest: 0.004,
  lEx: -0.215,
  lEy: 0.6,
  lHx: -0.13,
  lHy: 0.665,
  rEx: 0.19,
  rEy: 0.615,
  rHx: 0.215,
  rHy: 0.47,
  lKx: -0.115,
  lKy: 0.265,
  lFx: -0.15,
  rKx: 0.125,
  rKy: 0.265,
  rFx: 0.17,
};
const STILL_CHARGED: Pose = {
  ...STILL,
  pelvisY: 0.478,
  chest: 0.01,
  lEx: -0.225,
  lHx: -0.115,
  lHy: 0.68,
  rEx: 0.215,
  rHx: 0.245,
  rHy: 0.48,
  lKx: -0.14,
  lFx: -0.18,
  rKx: 0.15,
  rFx: 0.2,
};

const MAX_PARTS = 320;
const MAX_BOLTS = 8;
const BOLT_PTS = 12;
const SPEED_LINES = 30;
/** Seconds without input before the form starts to fade, then seconds per step down */
const IDLE_HOLD = 5;
const IDLE_STEP = 1.6;
/** A press shorter than this is a tap, which powers down one form */
const TAP = 0.22;

type RGB = readonly [number, number, number];

/** Everything about a form that blends while it morphs into the next one */
interface Look {
  /* hair: spike spread (tip angle / base angle), lengths, notch depth, energy, SSJ3 mane, single bang, bang drop */
  spread: number;
  lenMid: number;
  lenEdge: number;
  valley: number;
  hairEnergy: number;
  mane: number;
  bang: number;
  bangDrop: number;
  fringe: number;
  bulk: number;
  cut: number;
  /** Additive glow over the hair; low keeps a saturated colour from washing out */
  hairGlow: number;
  /* aura shape */
  auraW: number;
  auraH: number;
  auraBase: number;
  auraAmp: number;
  auraSpeed: number;
  auraSharp: number;
  auraAlpha: number;
  core: number;
  flicker: number;
  /* behaviour */
  rest: number;
  chargeLo: number;
  chargeHi: number;
  bolts: number;
  shake: number;
  idleShake: number;
  rocks: number;
  lift: number;
  crack: number;
  speed: number;
  streaks: number;
  embers: number;
  wisps: number;
  sparks: number;
  debris: number;
  still: number;
  eyeA: number;
  /* palette */
  edge: RGB;
  mid: RGB;
  hot: RGB;
  glow: RGB;
  rimTop: RGB;
  rimLow: RGB;
  streak: RGB;
  crackC: RGB;
  hairC: RGB;
  hairHi: RGB;
  hairLine: RGB;
  eye: RGB;
  flashC: RGB;
  sky: RGB;
  bolt: RGB;
}

interface Form {
  name: string;
  /** Seconds of holding to fill this form's meter */
  fill: number;
  /** Aura outline points; even so the tongues alternate cleanly */
  n: number;
  eyeShape: 'angry' | 'flat' | 'calm';
  look: Look;
}

const GOLD: Pick<Look, 'edge' | 'mid' | 'hot' | 'glow' | 'rimTop' | 'rimLow' | 'streak' | 'crackC' | 'flashC'> = {
  edge: [255, 120, 30],
  mid: [255, 200, 70],
  hot: [255, 236, 170],
  glow: [255, 190, 70],
  rimTop: [255, 240, 190],
  rimLow: [255, 170, 70],
  streak: [255, 205, 90],
  crackC: [255, 120, 30],
  flashC: [255, 236, 190],
};

const BASE_LOOK: Look = {
  spread: 1.12,
  lenMid: 0.085,
  lenEdge: 0.055,
  valley: 1.42,
  hairEnergy: 0.15,
  mane: 0,
  bang: 0,
  bangDrop: 1,
  fringe: 0,
  bulk: 0,
  cut: 0.2,
  hairGlow: 1,
  auraW: 1,
  auraH: 1,
  auraBase: 0.12,
  auraAmp: 0.3,
  auraSpeed: 9,
  auraSharp: 1,
  auraAlpha: 0.75,
  core: 0,
  flicker: 0,
  rest: 0.12,
  chargeLo: 0.3,
  chargeHi: 0.86,
  bolts: 0,
  shake: 0.6,
  idleShake: 0,
  rocks: 0,
  lift: 1,
  crack: 0,
  speed: 0.7,
  streaks: 0.7,
  embers: 0,
  wisps: 0,
  sparks: 0,
  debris: 0,
  still: 0,
  eyeA: 0.25,
  edge: [120, 140, 255],
  mid: [190, 205, 255],
  hot: [240, 244, 255],
  glow: [170, 180, 255],
  rimTop: [225, 230, 255],
  rimLow: [150, 160, 240],
  streak: [210, 220, 255],
  crackC: [140, 150, 255],
  hairC: [26, 22, 44],
  hairHi: [60, 56, 96],
  hairLine: [10, 8, 20],
  eye: [200, 210, 255],
  flashC: [230, 236, 255],
  sky: [44, 26, 60],
  bolt: [140, 200, 255],
};

const SSJ_LOOK: Look = {
  ...BASE_LOOK,
  ...GOLD,
  spread: 0.86,
  lenMid: 0.22,
  lenEdge: 0.08,
  valley: 1.72,
  hairEnergy: 1,
  bulk: 0.32,
  cut: 0.4,
  rest: 0.32,
  chargeLo: 0.4,
  chargeHi: 1,
  shake: 1,
  rocks: 0.3,
  crack: 0.35,
  speed: 1,
  streaks: 1,
  eyeA: 1,
  hairC: [255, 220, 90],
  hairHi: [255, 248, 200],
  hairLine: [150, 80, 20],
  eye: [125, 255, 224],
  sky: [70, 36, 30],
};

const FORMS: readonly Form[] = [
  { name: 'Base', fill: 1.7, n: 34, eyeShape: 'angry', look: BASE_LOOK },
  { name: 'Super Saiyan', fill: 1.9, n: 34, eyeShape: 'angry', look: SSJ_LOOK },
  {
    name: 'Super Saiyan 2',
    fill: 2.1,
    n: 46,
    eyeShape: 'angry',
    look: {
      ...SSJ_LOOK,
      spread: 0.8,
      lenMid: 0.27,
      lenEdge: 0.1,
      valley: 1.5,
      bang: 1,
      bulk: 0.62,
      cut: 0.7,
      auraBase: 0.18,
      auraAmp: 0.38,
      auraSpeed: 12,
      auraSharp: 1.5,
      rest: 0.36,
      bolts: 1,
      shake: 1.1,
      rocks: 0.45,
      crack: 0.55,
      sparks: 0.6,
      debris: 0.3,
      edge: [255, 140, 30],
      mid: [255, 212, 80],
      hot: [255, 246, 200],
      hairC: [255, 232, 110],
      hairHi: [255, 252, 225],
    },
  },
  {
    name: 'Super Saiyan 3',
    fill: 2.4,
    n: 40,
    eyeShape: 'flat',
    look: {
      ...SSJ_LOOK,
      spread: 0.5,
      lenMid: 0.15,
      lenEdge: 0.02,
      valley: 1.55,
      hairEnergy: 0.6,
      mane: 1,
      bangDrop: 0.4,
      fringe: 1,
      bulk: 1,
      cut: 1,
      auraW: 1.22,
      auraH: 1.2,
      auraBase: 0.2,
      auraAmp: 0.42,
      auraSpeed: 10,
      auraSharp: 1.3,
      rest: 0.45,
      bolts: 1.5,
      shake: 1.6,
      idleShake: 0.35,
      rocks: 0.75,
      lift: 1.3,
      crack: 0.95,
      speed: 1.2,
      streaks: 1.25,
      sparks: 1,
      debris: 1,
      edge: [255, 130, 20],
      mid: [255, 190, 50],
      hot: [255, 232, 150],
      glow: [255, 170, 50],
      hairC: [255, 206, 64],
      hairHi: [255, 240, 170],
      sky: [86, 40, 22],
    },
  },
  {
    name: 'Super Saiyan God',
    fill: 2.2,
    n: 26,
    eyeShape: 'calm',
    look: {
      ...BASE_LOOK,
      spread: 1.14,
      lenMid: 0.058,
      lenEdge: 0.05,
      valley: 1.3,
      hairEnergy: 0.2,
      bangDrop: 1.2,
      bulk: -0.28,
      cut: 0.15,
      auraW: 0.86,
      auraH: 1.02,
      auraBase: 0.08,
      auraAmp: 0.16,
      auraSpeed: 4,
      auraSharp: 0.8,
      auraAlpha: 0.85,
      core: 0.25,
      rest: 0.34,
      chargeLo: 0.38,
      chargeHi: 0.9,
      shake: 0.4,
      rocks: 0.4,
      crack: 0.3,
      speed: 0.55,
      streaks: 0.45,
      embers: 1,
      eyeA: 0.9,
      edge: [255, 50, 40],
      mid: [255, 110, 60],
      hot: [255, 196, 150],
      glow: [255, 80, 50],
      rimTop: [255, 200, 170],
      rimLow: [255, 80, 60],
      streak: [255, 140, 90],
      crackC: [255, 70, 40],
      hairC: [178, 8, 48],
      hairHi: [255, 46, 92],
      hairLine: [214, 30, 150],
      hairGlow: 0.2,
      eye: [255, 64, 76],
      flashC: [255, 200, 180],
      sky: [84, 22, 30],
    },
  },
  {
    name: 'Super Saiyan Blue',
    fill: 2.3,
    n: 32,
    eyeShape: 'angry',
    look: {
      ...SSJ_LOOK,
      spread: 0.84,
      lenMid: 0.2,
      lenEdge: 0.085,
      valley: 1.66,
      hairEnergy: 0.8,
      bulk: 0.06,
      cut: 0.45,
      auraW: 1.02,
      auraBase: 0.1,
      auraAmp: 0.24,
      auraSpeed: 7,
      auraSharp: 0.9,
      auraAlpha: 0.85,
      core: 1,
      rest: 0.36,
      shake: 0.8,
      rocks: 0.6,
      crack: 0.5,
      speed: 0.9,
      streaks: 0.9,
      sparks: 0.9,
      edge: [30, 100, 255],
      mid: [70, 180, 255],
      hot: [225, 250, 255],
      glow: [60, 150, 255],
      rimTop: [220, 245, 255],
      rimLow: [70, 150, 255],
      streak: [150, 220, 255],
      crackC: [40, 120, 255],
      hairC: [76, 200, 255],
      hairHi: [210, 248, 255],
      hairLine: [10, 50, 130],
      eye: [140, 225, 255],
      flashC: [200, 235, 255],
      sky: [20, 34, 80],
    },
  },
  {
    name: 'Ultra Instinct',
    fill: 2.8,
    n: 44,
    eyeShape: 'calm',
    look: {
      ...SSJ_LOOK,
      spread: 0.9,
      lenMid: 0.18,
      lenEdge: 0.08,
      valley: 1.62,
      hairEnergy: 0.35,
      bulk: -0.12,
      cut: 0.85,
      auraW: 0.84,
      auraH: 1.06,
      auraBase: 0.1,
      auraAmp: 0.3,
      auraSpeed: 14,
      auraSharp: 1.6,
      auraAlpha: 0.95,
      core: 0.7,
      flicker: 1,
      rest: 0.42,
      chargeLo: 0.45,
      chargeHi: 0.8,
      bolts: 0,
      shake: 0,
      rocks: 0.85,
      lift: 1.1,
      crack: 0.25,
      speed: 0.12,
      streaks: 0.35,
      sparks: 0.3,
      wisps: 1,
      still: 1,
      edge: [120, 150, 255],
      mid: [200, 215, 255],
      hot: [248, 250, 255],
      glow: [160, 180, 255],
      rimTop: [240, 244, 255],
      rimLow: [150, 170, 255],
      streak: [220, 230, 255],
      crackC: [130, 160, 255],
      hairC: [214, 218, 234],
      hairHi: [255, 255, 255],
      hairLine: [80, 86, 120],
      eye: [235, 240, 255],
      flashC: [225, 232, 255],
      sky: [34, 38, 74],
      bolt: [170, 200, 255],
    },
  },
];
const LAST = FORMS.length - 1;
/** Tile poster: Super Saiyan, mid charge */
const POSTER_FORM = 1;

const LOOK_KEYS = Object.keys(BASE_LOOK) as (keyof Look)[];

function mixLook(out: Look, a: Look, b: Look, k: number) {
  const o = out as unknown as Record<string, number | number[]>;
  const A = a as unknown as Record<string, number | readonly number[]>;
  const B = b as unknown as Record<string, number | readonly number[]>;
  for (const key of LOOK_KEYS) {
    const va = A[key];
    const vb = B[key];
    if (typeof va === 'number') o[key] = lerp(va, vb as number, k);
    else {
      const arr = o[key] as number[];
      const bb = vb as readonly number[];
      for (let i = 0; i < 3; i++) arr[i] = lerp(va[i], bb[i], k);
    }
  }
}

const cloneLook = (l: Look): Look => {
  const out = { ...l } as unknown as Record<string, unknown>;
  for (const key of LOOK_KEYS) {
    const v = l[key];
    if (typeof v !== 'number') out[key] = [...v];
  }
  return out as unknown as Look;
};

const rgb = (c: RGB) => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`;
const rgbMix = (a: RGB, b: RGB, k: number) =>
  `${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))}`;

const Kind = { Streak: 0, Dust: 1, Debris: 2, Spark: 3, Ember: 4, Wisp: 5 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: Kind;
  rot: number;
  phase: number;
}

interface Rock {
  u: number;
  z: number;
  size: number;
  th: number;
  maxLift: number;
  phase: number;
  spin: number;
  rot: number;
  lift: number;
  verts: Float32Array;
}

interface Bolt {
  pts: Float32Array;
  life: number;
  max: number;
}

interface Crack {
  pts: Float32Array;
  lens: Float32Array;
  total: number;
  width: number;
}

interface Ring {
  age: number;
  str: number;
}

interface Voice {
  bus: AudioBus;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  src: AudioBufferSourceNode;
  lp: BiquadFilterNode;
  bp: BiquadFilterNode;
  gain: GainNode;
}

interface State {
  pointerHeld: boolean;
  keyHeld: boolean;
  demoHold: boolean;
  demoWait: number;
  touched: boolean;
  pressAt: number;
  time: number;
  /** Current form and the one it is morphing from */
  form: number;
  prev: number;
  morph: number;
  morphRate: number;
  look: Look;
  meter: number;
  /** Ascension wind-up: target form, elapsed, duration (target -1 when idle) */
  pendTo: number;
  pendT: number;
  pendDur: number;
  idle: number;
  /** Simulation time scale (slow motion for Ultra Instinct) and the scaled clock */
  ts: number;
  at: number;
  silence: number;
  bloom: number;
  banner: number;
  level: number;
  c: number;
  flash: number;
  kick: number;
  scream: number;
  parts: Particle[];
  partCursor: number;
  rocks: Rock[];
  bolts: Bolt[];
  cracks: Crack[];
  rings: Ring[];
  crackReveal: number;
  speed: Float32Array;
  speedTimer: number;
  boltTimer: number;
  energyAcc: number;
  dustAcc: number;
  fxAcc: number;
  stars: Float32Array;
  far: Float32Array;
  near: Float32Array;
  cx: number;
  gy: number;
  H: number;
  horizon: number;
  pose: Pose;
  voice: Voice | null;
  shakeX: number;
  shakeY: number;
  zoom: number;
  /** Live muscle mass: the form's bulk plus the ascension pump and charge twitch */
  bulk: number;
}

function makeRocks(): Rock[] {
  const rng = mulberry32(7);
  const rocks: Rock[] = [];
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const z = rng() * 2 - 1;
    const u = side * (0.28 + rng() * 0.95);
    const verts = new Float32Array(14);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + rng() * 0.4;
      const r = 0.7 + rng() * 0.35;
      verts[k * 2] = Math.cos(a) * r;
      verts[k * 2 + 1] = Math.sin(a) * r * 0.8;
    }
    rocks.push({
      u,
      z,
      size: 0.018 + rng() * 0.035,
      th: 0.22 + rng() * 0.55,
      maxLift: 0.25 + rng() * 0.75,
      phase: rng() * TAU,
      spin: (rng() - 0.5) * 2.4,
      rot: rng() * TAU,
      lift: 0,
      verts,
    });
  }
  return rocks;
}

function makeCracks(): Crack[] {
  const rng = mulberry32(21);
  const cracks: Crack[] = [];
  for (let i = 0; i < 13; i++) {
    const side = i % 2 ? 1 : -1;
    let a = side > 0 ? rng() * 1.3 - 0.35 : Math.PI - (rng() * 1.3 - 0.35);
    let u = side * (0.05 + rng() * 0.08);
    let d = (rng() - 0.5) * 0.1;
    const segs = 5 + Math.floor(rng() * 4);
    const pts = new Float32Array((segs + 1) * 2);
    const lens = new Float32Array(segs + 1);
    pts[0] = u;
    pts[1] = d;
    let total = 0;
    for (let s = 1; s <= segs; s++) {
      a += (rng() - 0.5) * 0.8;
      const len = 0.05 + rng() * 0.09;
      u += Math.cos(a) * len;
      d += Math.sin(a) * len;
      pts[s * 2] = u;
      pts[s * 2 + 1] = d;
      total += len;
      lens[s] = total;
    }
    cracks.push({ pts, lens, total, width: 0.6 + rng() * 0.8 });
  }
  return cracks;
}

function spawnBolt(s: State, b: Bolt, c: number) {
  const L = s.look;
  const cy = s.gy - s.H * 0.52;
  const rx = s.H * (0.28 + 0.16 * c) * L.auraW;
  const ry = s.H * (0.5 + 0.2 * c) * L.auraH;
  const a0 = rand(0, TAU);
  const a1 = a0 + rand(0.6, 1.8) * (Math.random() < 0.5 ? -1 : 1);
  const r0 = rand(0.7, 1.05);
  const r1 = rand(0.35, 0.9);
  const x0 = s.cx + Math.cos(a0) * rx * r0;
  const y0 = cy + Math.sin(a0) * ry * r0;
  const x1 = s.cx + Math.cos(a1) * rx * r1;
  const y1 = cy + Math.sin(a1) * ry * r1;
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 0; i < BOLT_PTS; i++) {
    const k = i / (BOLT_PTS - 1);
    const j = i === 0 || i === BOLT_PTS - 1 ? 0 : rand(-1, 1) * s.H * 0.04;
    b.pts[i * 2] = lerp(x0, x1, k) + (nx / nl) * j;
    b.pts[i * 2 + 1] = lerp(y0, y1, k) + (ny / nl) * j;
  }
  b.max = rand(0.08, 0.18);
  b.life = b.max;
}

function emit(s: State, x: number, y: number, vx: number, vy: number, life: number, size: number, kind: Kind) {
  const p = s.parts[s.partCursor];
  s.partCursor = (s.partCursor + 1) % MAX_PARTS;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.max = life;
  p.size = size;
  p.kind = kind;
  p.rot = rand(0, TAU);
  p.phase = rand(0, TAU);
}

function addRing(s: State, str: number, delay = 0) {
  let slot = s.rings[0];
  for (const r of s.rings) if (r.age > slot.age) slot = r;
  slot.age = -delay;
  slot.str = str;
}

function startVoice(bus: AudioBus): Voice {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  lp.Q.value = 3;
  lp.connect(gain);
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 50;
  oscA.connect(lp);
  const oscB = ctx.createOscillator();
  oscB.type = 'square';
  oscB.frequency.value = 75.4;
  const oscBGain = ctx.createGain();
  oscBGain.gain.value = 0.35;
  oscB.connect(oscBGain).connect(lp);
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 500;
  bp.Q.value = 0.8;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.5;
  src.connect(bp).connect(nGain).connect(gain);
  oscA.start(now);
  oscB.start(now);
  src.start(now);
  return { bus, oscA, oscB, src, lp, bp, gain };
}

function stopVoice(v: Voice) {
  const now = v.bus.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0.0001, now, 0.12);
  for (const n of [v.oscA, v.oscB, v.src]) {
    try {
      n.stop(now + 0.8);
    } catch {
      /* already stopped */
    }
  }
}

/** Scream per form: start and peak pitch, length, two vowel formants, loudness */
const SCREAMS: readonly (readonly [number, number, number, number, number, number])[] = [
  [150, 210, 1.3, 700, 1150, 0.09],
  [150, 220, 1.4, 720, 1180, 0.1],
  [175, 265, 1.5, 760, 1250, 0.1],
  [130, 240, 2.2, 650, 1050, 0.11],
  [160, 200, 1.4, 600, 950, 0.06],
  [170, 240, 1.3, 780, 1300, 0.09],
];

/** The roar at each threshold, synthesised: a formant-filtered saw, a noise roar and a low boom */
function scream(bus: AudioBus, to: number) {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  if (to === LAST) {
    // Ultra Instinct answers the silence with a deep bloom and a bell shimmer, no scream
    tone(bus, 62, { attack: 0.02, decay: 2.4, gain: 0.3, glideTo: 40 });
    [1318.5, 1975.5, 2637].forEach((f, i) =>
      tone(bus, f, { attack: 0.35, decay: 2.6, gain: 0.04, delay: 0.1 + i * 0.14 })
    );
    noise(bus, { duration: 1.8, freq: 3200, q: 0.4, gain: 0.05 });
    return;
  }
  const [f0, f1, dur, fa, fb, gain] = SCREAMS[to - 1];
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(f1, now + dur * 0.3);
  osc.frequency.exponentialRampToValueAtTime(f1 * 0.9, now + dur);
  const vib = ctx.createOscillator();
  vib.frequency.value = 6.5;
  const vibG = ctx.createGain();
  vibG.gain.value = f1 * 0.035;
  vib.connect(vibG).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.08);
  g.gain.setValueAtTime(gain, now + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  for (const [f, q] of [
    [fa, 5],
    [fb, 7],
  ] as const) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    osc.connect(bp).connect(g);
  }
  g.connect(out);
  osc.start(now);
  vib.start(now);
  osc.stop(now + dur + 0.05);
  vib.stop(now + dur + 0.05);
  noise(bus, { duration: dur, freq: 900, q: 0.6, gain: 0.12 });
  tone(bus, 110, { type: 'sawtooth', glideTo: 36, decay: 1.2, gain: 0.2 });
  if (to === 4) {
    // God: a warm chord under a quieter roar
    for (const f of [220, 277.2, 329.6]) tone(bus, f, { attack: 0.25, decay: 1.8, gain: 0.045 });
  } else if (to === 5) {
    tone(bus, 880, { type: 'triangle', attack: 0.02, decay: 0.9, gain: 0.05 });
    tone(bus, 1320, { type: 'triangle', attack: 0.02, decay: 0.7, gain: 0.035, delay: 0.06 });
  } else if (to === 3) {
    noise(bus, { duration: 2, freq: 160, type: 'lowpass', gain: 0.4 });
  }
}

interface AuraShape {
  w: number;
  h: number;
  base: number;
  amp: number;
  speed: number;
  sharp: number;
  n: number;
}

/** Flame-shaped aura: rounded base, tongues licking upward */
function flame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  H: number,
  grow: number,
  t: number,
  seed: number,
  sh: AuraShape
) {
  const N = sh.n;
  const cy = footY - H * 0.46;
  const rx = H * (0.26 + 0.2 * grow) * sh.w;
  const ryUp = H * (0.6 + 0.45 * grow) * sh.h;
  const ryDown = H * 0.5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * TAU; // 0 = up, clockwise
    const sx = Math.sin(th);
    const cyv = Math.cos(th);
    const up = Math.max(0, cyv);
    const tip = i % 2 === 1;
    const lick = 0.55 + 0.45 * Math.sin(t * (sh.speed + seed) + i * 2.3 + seed * 5);
    const amp = up * up * (sh.base + sh.amp * grow);
    const m = tip ? 1 + amp * lick : 1 - amp * 0.15;
    let x = sx * rx * m * (1 - up * 0.25 * (tip ? 1 : 0.3) * sh.sharp);
    let y = -cyv * (cyv > 0 ? ryUp : ryDown) * m;
    x += Math.sin(t * 3 + i + seed) * H * 0.006;
    y = Math.min(y, H * 0.48);
    if (i === 0) ctx.moveTo(cx + x, cy + y);
    else ctx.lineTo(cx + x, cy + y);
  }
  ctx.closePath();
}

const SPK = 11;
/** Fixed per-spike irregularity so the hair reads hand drawn: [angle jitter, length jitter] */
const SPK_JIT: readonly (readonly [number, number])[] = [
  [4, -0.1],
  [-3, 0.12],
  [5, -0.05],
  [-4, 0.1],
  [3, -0.08],
  [0, 0.1],
  [-3, -0.06],
  [4, 0.08],
  [-5, -0.04],
  [3, 0.1],
  [-4, -0.1],
];
const HEAD_R = 0.062;

/** Builds the morphing hair outline from the blended look */
function hairOutline(ctx: CanvasRenderingContext2D, hX: number, hY: number, H: number, L: Look, t: number, rm: boolean) {
  const R = HEAD_R * H;
  const up = L.hairEnergy;
  const P = (deg: number, dist: number) =>
    ctx.lineTo(hX + Math.sin(deg * DEG) * dist, hY - Math.cos(deg * DEG) * dist);
  ctx.moveTo(hX + Math.sin(-100 * DEG) * R * 1.05, hY - Math.cos(-100 * DEG) * R * 1.05);
  let prev = 0;
  for (let i = 0; i < SPK; i++) {
    const base = -115 + (230 * i) / (SPK - 1);
    const edge = Math.pow(Math.abs(base) / 115, 1.4);
    const [ja, jl] = SPK_JIT[i];
    const flick = rm ? 0 : Math.sin(t * 17 + i * 1.7) * 3 * up;
    const breathe = rm ? 0 : 0.06 * Math.sin(t * 23 + i * 2.1) * up;
    const len = lerp(L.lenMid, L.lenEdge, edge) * (1 + jl + breathe) * H;
    if (i > 0) P((base + prev) / 2, R * L.valley);
    P(base * L.spread + ja + flick, R + len);
    prev = base;
  }
  P(100, R * 1.05);
  ctx.lineTo(hX, hY - 0.022 * H);
  ctx.closePath();
}

function bangsOutline(ctx: CanvasRenderingContext2D, hX: number, hY: number, H: number, L: Look, t: number) {
  const u = (v: number) => v * H;
  const drop = L.bangDrop;
  for (const side of [-1, 1]) {
    ctx.moveTo(hX + u(side * 0.004), hY - u(0.05));
    ctx.lineTo(hX + u(side * 0.045), hY - u(0.045));
    ctx.lineTo(hX + u(side * lerp(0.02, 0.03, L.hairEnergy)), hY + u(lerp(0.02, 0.0, L.hairEnergy) * drop + 0.012 * (drop - 1)));
    ctx.closePath();
  }
  if (L.fringe > 0.02) {
    // Third form fringe: a few heavy locks over the brow, which hides the eyebrows
    const f = L.fringe;
    for (const [u0, len, lean] of [
      [-0.03, 0.05, -0.012],
      [0.0, 0.058, 0.004],
      [0.032, 0.048, 0.014],
    ] as const) {
      const sway = Math.sin(t * 4 + u0 * 90) * 0.003;
      ctx.moveTo(hX + u(u0 - 0.017), hY - u(0.052));
      ctx.lineTo(hX + u(u0 + 0.017), hY - u(0.052));
      ctx.lineTo(hX + u(u0 + lean + sway), hY - u(0.052 - len * f));
      ctx.closePath();
    }
  }
  if (L.bang > 0.02) {
    // The lone forehead strand of the second form
    const sway = Math.sin(t * 9) * 0.003;
    const b = L.bang;
    ctx.moveTo(hX - u(0.002), hY - u(0.058));
    ctx.quadraticCurveTo(hX - u(0.03), hY - u(0.03), hX - u(0.016 + sway), hY + u(0.032 * b));
    ctx.quadraticCurveTo(hX - u(0.012), hY - u(0.015), hX + u(0.012), hY - u(0.05));
    ctx.closePath();
  }
}

/**
 * Third form mane: thick tapered locks that fall behind the body to the backs of the knees,
 * plus a couple of spikes over the shoulders. Each lock is a curved centreline
 * (root, bend, tip in figure units from the head centre, v up) with a root width.
 * Mirrored for both sides; the centre lock (u = 0) is drawn once.
 */
const MANE_LOCKS: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [0, 0.03, 0, -0.3, 0, -0.72, 0.1],
  [0.02, 0.01, 0.09, -0.25, 0.085, -0.7, 0.06],
  [0.035, 0.05, 0.17, -0.06, 0.19, -0.64, 0.065],
  [0.05, 0.03, 0.25, -0.1, 0.26, -0.5, 0.055],
  [0.06, 0.0, 0.21, -0.12, 0.31, -0.26, 0.045],
  [0.06, 0.05, 0.2, 0.07, 0.28, -0.07, 0.035],
];
const LOCK_STEPS = 10;

function maneOutline(ctx: CanvasRenderingContext2D, hX: number, hY: number, H: number, k: number, t: number, c: number) {
  for (let li = 0; li < MANE_LOCKS.length; li++) {
    const [ru, rv, cu, cv, tu, tv, w0] = MANE_LOCKS[li];
    for (const side of ru === 0 && tu === 0 ? [1] : [-1, 1]) {
      // The aura wind: tips sway, and the mass flares outward as the charge rises
      const phase = li * 1.3 + (side > 0 ? 0 : 2.1);
      const sway = Math.sin(t * 2.2 + phase) * 0.018 + Math.sin(t * 5.3 + phase * 1.7) * 0.006;
      const flare = (tu === 0 ? 0 : 0.05) * c;
      const len = 0.35 + 0.65 * k;
      const X = (u: number) => hX + side * u * H;
      const Y = (v: number) => hY - v * H;
      const tipU = (tu + flare) * (0.5 + 0.5 * k) + sway * side;
      const tipV = tv * len + 0.03 * c;
      const ctrlU = cu * (0.6 + 0.4 * k) + sway * side * 0.4;
      const ctrlV = cv * len;
      const left: number[] = [];
      const right: number[] = [];
      for (let i = 0; i <= LOCK_STEPS; i++) {
        const q = i / LOCK_STEPS;
        const a = (1 - q) * (1 - q);
        const b2 = 2 * (1 - q) * q;
        const d = q * q;
        const u = a * ru + b2 * ctrlU + d * tipU;
        const v = a * rv + b2 * ctrlV + d * tipV;
        // Tangent for the normal
        const du = 2 * (1 - q) * (ctrlU - ru) + 2 * q * (tipU - ctrlU);
        const dv = 2 * (1 - q) * (ctrlV - rv) + 2 * q * (tipV - ctrlV);
        const n = Math.hypot(du, dv) || 1;
        // Thick through the middle, tapering to a point
        const wd = w0 * (0.55 + 0.45 * Math.sin(Math.min(1, q * 1.6) * Math.PI * 0.5)) * (1 - q) * 1.75;
        left.push(u - (dv / n) * wd, v + (du / n) * wd);
        right.push(u + (dv / n) * wd, v - (du / n) * wd);
      }
      ctx.moveTo(X(left[0]), Y(left[1]));
      for (let i = 2; i < left.length; i += 2) ctx.lineTo(X(left[i]), Y(left[i + 1]));
      for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(X(right[i]), Y(right[i + 1]));
      ctx.closePath();
    }
  }
}

/** Where drawFighter will put the head centre, so the mane can be drawn behind the body first */
function headOf(p: Pose, x0: number, gy: number, H: number) {
  const sY = p.pelvisY + 0.31 + p.chest;
  return { x: x0 + p.lean * 1.2 * H, y: gy - (sY + 0.128 + p.chest * 0.5) * H };
}

function beginAscend(s: State, env: SceneEnv) {
  const to = s.form + 1;
  s.pendTo = to;
  s.pendT = 0;
  s.pendDur = to === LAST ? (env.reducedMotion ? 0.9 : 1.5) : 0.34;
  const bus = env.audio();
  if (bus && to !== LAST) tone(bus, 200 + to * 30, { type: 'triangle', glideTo: 700 + to * 80, attack: 0.02, decay: 0.32, gain: 0.05 });
}

function ascend(s: State, env: SceneEnv) {
  const rm = env.reducedMotion;
  const to = s.pendTo;
  s.pendTo = -1;
  s.prev = s.form;
  s.form = to;
  s.morph = 0;
  s.morphRate = rm ? 2 : 7;
  s.meter = 0;
  s.banner = 0;
  s.idle = 0;
  const ui = to === LAST;
  s.flash = rm ? 0.35 : ui ? 0.75 : 1;
  s.kick = ui ? 0.25 : 1;
  s.scream = ui ? 0 : 1;
  s.bloom = ui ? 0 : 1;
  addRing(s, 1);
  addRing(s, 0.6, 0.16);
  if (to === 3) addRing(s, 0.8, 0.34);
  // Debris and sparks thrown off the ground
  const H = s.H;
  const L = FORMS[to].look;
  const n = ui ? 10 : 18 + Math.round(20 * L.debris);
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    emit(s, s.cx + side * rand(0.05, 0.4) * H, s.gy + rand(-0.02, 0.03) * H, side * rand(0.2, 1.3) * H, -rand(0.6, 1.6) * H, rand(0.8, 1.5), rand(2, 5), Kind.Debris);
  }
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU);
    const v = rand(0.6, 1.6) * H;
    emit(s, s.cx, s.gy - H * 0.55, Math.cos(a) * v, Math.sin(a) * v, rand(0.25, 0.6), rand(1, 2.2), ui ? Kind.Wisp : Kind.Spark);
  }
  const bus = env.audio();
  if (bus) scream(bus, to);
}

function powerDown(s: State, env: SceneEnv) {
  if (s.form === 0 || s.pendTo >= 0) return;
  s.prev = s.form;
  s.form -= 1;
  s.morph = 0;
  s.morphRate = env.reducedMotion ? 2 : 1.3;
  s.meter = 0;
  s.banner = 0;
  addRing(s, 0.35);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.7, freq: 380, type: 'lowpass', gain: 0.16 });
    tone(bus, 320, { glideTo: 110, decay: 0.6, gain: 0.05, type: 'triangle' });
  }
}

/** Tile preview: climbs the whole ladder, holds Ultra Instinct, then rests back down */
function runDemo(s: State, dt: number) {
  if (s.demoHold) {
    if (s.form === LAST && s.pendTo < 0 && s.morph >= 1) {
      s.demoWait += dt;
      if (s.demoWait > 2.5) {
        s.demoHold = false;
        s.demoWait = 0;
      }
    }
  } else if (s.form === 0 && s.morph >= 1) {
    s.demoWait += dt;
    if (s.demoWait > 1.6) {
      s.demoHold = true;
      s.demoWait = 0;
    }
  }
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv) {
  const L = s.look;
  const x = 16;
  const y = 18;
  const seg = Math.min(20, (env.w - 32) / 7 - 3);
  const gap = 3;
  const pulse = env.reducedMotion ? 0 : Math.max(0, 1 - s.banner / 0.6);
  const fade = clamp(s.banner / 0.25, 0, 1);
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `700 ${11 + pulse * 2}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const name = FORMS[s.form].name.toUpperCase();
  ctx.globalAlpha = fade;
  ctx.shadowColor = `rgba(${rgb(L.hot)},0.8)`;
  ctx.shadowBlur = 8 + pulse * 14;
  ctx.fillStyle = `rgb(${rgbMix(L.hot, [255, 255, 255], pulse)})`;
  ctx.fillText(name, x + (1 - fade) * -8, y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // Ladder: reached forms solid in their colour, the current one fills, locked ones wait dimly
  const ly = y + 20;
  for (let i = 0; i < FORMS.length; i++) {
    const sx = x + i * (seg + gap);
    const col = FORMS[i].look.hot;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(sx, ly, seg, 3);
    const reached = i <= s.form;
    const k = reached ? 1 : i === s.form + 1 ? (s.pendTo === i ? 1 : s.meter) : 0;
    if (k > 0.005) {
      ctx.fillStyle = `rgba(${rgb(reached ? col : FORMS[i].look.hot)},${reached ? 0.95 : 0.7})`;
      ctx.fillRect(sx, ly, seg * k, 3);
    }
  }
  ctx.restore();
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2.8,
    cursor: 'pointer',
    init: (env) => {
      const rng = mulberry32(3);
      const stars = new Float32Array(70 * 3);
      for (let i = 0; i < stars.length; i += 3) {
        stars[i] = rng();
        stars[i + 1] = rng() * rng();
        stars[i + 2] = rng() * TAU;
      }
      const poster = !env.interactive && env.reducedMotion;
      const start = poster ? POSTER_FORM : 0;
      return {
        pointerHeld: false,
        keyHeld: false,
        demoHold: !env.interactive && !env.reducedMotion,
        demoWait: 0,
        touched: false,
        pressAt: -1,
        time: 0,
        form: start,
        prev: start,
        morph: 1,
        morphRate: 1,
        look: cloneLook(FORMS[start].look),
        meter: 0,
        pendTo: -1,
        pendT: 0,
        pendDur: 1,
        idle: 0,
        ts: 1,
        at: 0,
        silence: 0,
        bloom: 1,
        banner: 1,
        level: 0.12,
        c: 0.12,
        flash: 0,
        kick: 0,
        scream: 0,
        parts: Array.from({ length: MAX_PARTS }, () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          max: 1,
          size: 1,
          kind: Kind.Streak,
          rot: 0,
          phase: 0,
        })),
        partCursor: 0,
        rocks: makeRocks(),
        bolts: Array.from({ length: MAX_BOLTS }, () => ({
          pts: new Float32Array(BOLT_PTS * 2),
          life: 0,
          max: 1,
        })),
        cracks: makeCracks(),
        rings: Array.from({ length: 5 }, () => ({ age: 9, str: 0 })),
        crackReveal: 0,
        speed: new Float32Array(SPEED_LINES * 2),
        speedTimer: 0,
        boltTimer: 0,
        energyAcc: 0,
        dustAcc: 0,
        fxAcc: 0,
        stars,
        far: new Float32Array(0),
        near: new Float32Array(0),
        cx: 0,
        gy: 0,
        H: 1,
        horizon: 0,
        pose: clonePose(CALM),
        voice: null,
        shakeX: 0,
        shakeY: 0,
        zoom: 1,
        bulk: FORMS[start].look.bulk,
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.H = Math.min(h * 0.46, w * 0.62);
      s.cx = w / 2;
      s.gy = h * 0.84;
      s.horizon = s.gy - s.H * 0.36;
      s.far = mesaSkyline(w, s.horizon, s.H * 0.55, 11);
      s.near = mesaSkyline(w, s.horizon + s.H * 0.06, s.H * 0.3, 29);
    },
    update: (s, env, dt, t) => {
      const rm = env.reducedMotion;
      const poster = !env.interactive && rm;
      s.time = t;
      if (!env.interactive && !rm) runDemo(s, dt);
      const holding = s.pointerHeld || s.keyHeld || s.demoHold || poster;
      const uiPending = s.pendTo === LAST;
      if (rm && (holding || s.pendTo >= 0 || s.morph < 1)) env.wake(400);

      // Ladder: fill the meter while held; a full meter winds up and ascends
      if (s.pendTo >= 0) {
        s.pendT += dt;
        if (s.pendT >= s.pendDur) ascend(s, env);
      } else if (holding) {
        s.idle = 0;
        s.meter = Math.min(1, s.meter + dt / (FORMS[s.form].fill * (env.interactive ? 1 : 0.8)));
        if (poster) s.meter = Math.min(s.meter, 0.5);
        if (s.meter >= 1 && s.form < LAST) beginAscend(s, env);
      } else {
        s.meter = Math.max(0, s.meter - dt * 0.16);
        s.idle += dt;
        const first = env.interactive ? IDLE_HOLD : 2.2;
        const step = env.interactive ? IDLE_STEP : 1;
        if (s.form > 0 && s.idle >= first) {
          powerDown(s, env);
          s.idle = first - step;
        }
      }
      s.morph = Math.min(1, s.morph + dt * s.morphRate);
      mixLook(s.look, FORMS[s.prev].look, FORMS[s.form].look, easeInOutCubic(s.morph));
      const L = s.look;
      s.banner += dt;

      // Ultra Instinct: the world slows and goes quiet, then the aura blooms
      const tsTarget = uiPending ? 0.04 : s.form === LAST ? 0.6 : 1;
      s.ts = damp(s.ts, tsTarget, uiPending ? 8 : 1.6, dt);
      s.silence = damp(s.silence, uiPending ? 1 : 0, uiPending ? 5 : 2.4, dt);
      s.bloom = Math.min(1, s.bloom + dt / (rm ? 0.6 : 1.1));
      const dtS = dt * s.ts;
      s.at += dtS;

      let target = holding ? lerp(L.chargeLo, L.chargeHi, s.meter) : L.rest;
      if (s.pendTo >= 0) target = uiPending ? 0.2 : 1;
      if (!s.touched && rm && env.interactive) target = 0.3;
      s.level = damp(s.level, target, target > s.level ? 2.2 : 1.1, dt);
      s.c = damp(s.c, s.level, 7, dt);
      const c = s.c;

      s.flash = Math.max(0, s.flash - dt * 2.2);
      s.kick = Math.max(0, s.kick - dt * 2.2);
      s.scream = Math.max(0, s.scream - dt * 1.6);
      const amp = rm
        ? 0
        : s.H * (0.018 * L.shake * Math.pow(c, 2.4) + 0.03 * s.kick * (1 - L.still * 0.8) + 0.004 * L.idleShake);
      s.shakeX = amp * (Math.sin(t * 53) * 0.6 + Math.sin(t * 37 + 1.3) * 0.4);
      s.shakeY = amp * (Math.sin(t * 47 + 0.7) * 0.6 + Math.sin(t * 29 + 2.1) * 0.4);
      const windup = s.pendTo >= 0 && !uiPending ? s.pendT / s.pendDur : 0;
      s.zoom = rm ? 1 : 1 + 0.04 * s.kick * (1 - L.still) + 0.02 * windup + 0.03 * s.silence;

      // Audio voice follows the charge while held, and drops out for the silence
      if (holding && !s.voice && env.interactive) {
        const bus = env.audio();
        if (bus) s.voice = startVoice(bus);
      }
      if (s.voice) {
        const v = s.voice;
        const now = v.bus.ctx.currentTime;
        const pitch = 1 + s.form * 0.1;
        const quiet = (1 - s.silence) * (1 - 0.6 * L.still);
        v.gain.gain.setTargetAtTime(Math.max(0.0001, (0.05 + 0.15 * c) * quiet), now, s.silence > 0.1 ? 0.05 : 0.08);
        v.oscA.frequency.setTargetAtTime((46 + 44 * c) * pitch, now, 0.1);
        v.oscB.frequency.setTargetAtTime((69 + 66 * c) * pitch, now, 0.1);
        v.lp.frequency.setTargetAtTime(160 + 1600 * c * c * (1 - 0.5 * L.still), now, 0.08);
        v.bp.frequency.setTargetAtTime(400 + 2600 * c + 1500 * L.still, now, 0.08);
      }

      const H = s.H;
      // Energy streaks rising through the aura
      s.energyAcc += dtS * (18 + 150 * c * c) * L.streaks * (1 - s.silence);
      while (s.energyAcc >= 1) {
        s.energyAcc -= 1;
        const spread = H * (0.22 + 0.2 * c) * L.auraW;
        const x = s.cx + rand(-1, 1) * spread;
        const y = s.gy - rand(0, 0.95) * H * (0.8 + 0.3 * c);
        emit(s, x, y, (s.cx - x) * 0.3, -H * rand(0.6, 1.1) * (0.5 + 1.3 * c), rand(0.35, 0.8), rand(1, 2.4), Kind.Streak);
      }
      // Dust kicked off the ground
      s.dustAcc += dtS * 60 * Math.max(0, c - 0.35) * (1 - L.still * 0.7);
      while (s.dustAcc >= 1) {
        s.dustAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        emit(s, s.cx + side * rand(0.1, 0.5) * H, s.gy + rand(-0.02, 0.04) * H, side * rand(0.4, 1.4) * H, -rand(0.05, 0.3) * H, rand(0.6, 1.2), rand(2, 5), Kind.Dust);
      }
      // Form particles: debris, sparks, embers, wisps
      s.fxAcc += dtS * (1 - s.silence);
      while (s.fxAcc >= 1 / 30) {
        s.fxAcc -= 1 / 30;
        const k = 0.3 + c;
        if (Math.random() < L.debris * k * 0.5) {
          const side = Math.random() < 0.5 ? -1 : 1;
          emit(s, s.cx + side * rand(0.08, 0.45) * H, s.gy + rand(-0.01, 0.03) * H, side * rand(0.05, 0.4) * H, -rand(0.5, 1.2) * H * k, rand(0.8, 1.4), rand(1.5, 3.5), Kind.Debris);
        }
        if (Math.random() < L.sparks * k * 0.7) {
          const a = rand(0, TAU);
          const rx = H * (0.3 + 0.15 * c) * L.auraW;
          emit(s, s.cx + Math.cos(a) * rx, s.gy - H * 0.5 + Math.sin(a) * rx * 1.4, rand(-0.3, 0.3) * H, -rand(0.2, 0.6) * H, rand(0.15, 0.35), rand(0.8, 1.6), Kind.Spark);
        }
        if (Math.random() < L.embers * k * 0.8) {
          emit(s, s.cx + rand(-0.3, 0.3) * H, s.gy - rand(0, 0.9) * H, rand(-0.05, 0.05) * H, -rand(0.15, 0.4) * H, rand(1.2, 2.4), rand(1.2, 2.6), Kind.Ember);
        }
        if (Math.random() < L.wisps * k * 0.9) {
          const side = Math.random() < 0.5 ? -1 : 1;
          emit(s, s.cx + side * rand(0.06, 0.3) * H, s.gy - rand(0.05, 0.9) * H, side * rand(0.02, 0.1) * H, -rand(0.25, 0.5) * H, rand(1, 1.8), rand(1, 2), Kind.Wisp);
        }
      }
      for (const p of s.parts) {
        if (p.life <= 0) continue;
        p.life -= dtS;
        p.x += p.vx * dtS;
        p.y += p.vy * dtS;
        if (p.kind === Kind.Dust) {
          p.vy += H * 0.5 * dtS;
          p.vx *= Math.exp(-1.5 * dtS);
        } else if (p.kind === Kind.Debris) {
          p.vy += H * 1.6 * dtS;
          p.rot += dtS * 8;
          if (p.y > s.gy + H * 0.04 && p.vy > 0) {
            p.y = s.gy + H * 0.04;
            p.vy *= -0.3;
            p.vx *= 0.5;
          }
        } else if (p.kind === Kind.Ember || p.kind === Kind.Wisp) {
          p.vx += Math.sin(s.at * 2 + p.phase) * H * 0.3 * dtS;
          p.vx *= Math.exp(-1.2 * dtS);
        } else {
          p.vx *= Math.exp(-3 * dtS);
        }
      }

      // Lightning crackles in the second and third forms
      s.boltTimer -= dtS;
      if (L.bolts > 0.05 && s.boltTimer <= 0 && s.silence < 0.5) {
        const k = clamp((c - 0.25) / 0.75, 0, 1);
        s.boltTimer = rand(0.5, 1.3) * lerp(0.45, 0.06, k) / L.bolts;
        for (const b of s.bolts) {
          if (b.life <= 0) {
            spawnBolt(s, b, c);
            break;
          }
        }
      }
      for (const b of s.bolts) b.life -= dtS;

      // Speed line lengths re-roll on a fixed clock, anime style
      s.speedTimer -= dtS;
      if (s.speedTimer <= 0) {
        s.speedTimer = 0.07;
        for (let i = 0; i < SPEED_LINES; i++) {
          s.speed[i * 2] = (i / SPEED_LINES) * TAU + rand(-0.08, 0.08);
          s.speed[i * 2 + 1] = rand(0.55, 1);
        }
      }

      // Rocks lift above their threshold; higher forms keep some floating at rest
      const rp = Math.max(c, L.rocks);
      for (const r of s.rocks) {
        const over = clamp((rp - r.th) / (1 - r.th), 0, 1);
        const bob = Math.sin(s.at * 1.7 + r.phase) * H * 0.02 * over;
        const target = over > 0 ? easeOutCubic(over) * r.maxLift * H * 0.8 * L.lift + bob : 0;
        const before = r.lift;
        r.lift = damp(r.lift, target, target > r.lift ? 2.2 : 6, dtS);
        r.rot += r.spin * dtS * clamp(r.lift / (H * 0.05), 0, 1);
        if (before > H * 0.04 && r.lift <= H * 0.04 && target === 0) {
          for (let k = 0; k < 3; k++)
            emit(s, s.cx + r.u * H, s.gy + r.z * H * 0.1, rand(-0.3, 0.3) * H, -rand(0.05, 0.2) * H, rand(0.4, 0.8), rand(2, 4), Kind.Dust);
        }
      }

      const revealTarget = Math.max(smoothstep(0.3, 0.95, s.level), L.crack);
      s.crackReveal = damp(s.crackReveal, revealTarget, revealTarget > s.crackReveal ? 3 : 0.35, dt);
      for (const r of s.rings) r.age += dt;

      // Pose: charge crouch, Ultra Instinct's quiet guard, and the scream burst
      lerpPose(s.pose, CALM, CHARGED, easeInOutCubic(c));
      if (L.still > 0.01) {
        const sp = lerpPose(clonePose(STILL), STILL, STILL_CHARGED, easeInOutCubic(clamp((c - 0.3) / 0.6, 0, 1)));
        lerpPose(s.pose, s.pose, sp, L.still);
      }
      const burst = Math.max(easeOutCubic(s.scream), windup * 0.6);
      if (burst > 0.01) lerpPose(s.pose, s.pose, SCREAM, burst);
      // Muscle: swells with each burst, twitches under a heavy charge, then settles to the form
      const pump = rm ? 0 : 0.18 * easeOutCubic(s.scream) + 0.1 * windup;
      const twitch = rm || !holding ? 0 : Math.sin(t * 29) * Math.sin(t * 7.3) * 0.03 * c * c * (1 - L.still);
      s.bulk = L.bulk + pump + twitch;
      const bk = s.bulk;
      const bkPos = Math.max(0, bk);
      s.pose.lEx -= 0.05 * bk;
      s.pose.rEx += 0.05 * bk;
      s.pose.lHx -= 0.03 * bk;
      s.pose.rHx += 0.03 * bk;
      s.pose.lKx -= 0.025 * bkPos;
      s.pose.rKx += 0.025 * bkPos;
      s.pose.lFx -= 0.035 * bkPos;
      s.pose.rFx += 0.035 * bkPos;
      s.pose.chest += Math.sin(t * 2.2) * 0.004 * (1 - c);
      const tremble = rm ? 0 : c * c * 0.004 * (1 - L.still);
      s.pose.lHx += Math.sin(t * 41) * tremble;
      s.pose.rHx += Math.sin(t * 43 + 1) * tremble;
      s.pose.lHy += Math.sin(t * 37 + 2) * tremble;
      s.pose.rHy += Math.sin(t * 39 + 3) * tremble;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const { cx, gy, H, horizon } = s;
      const L = s.look;
      const rm = env.reducedMotion;
      const c = s.c;
      const at = s.at;
      const figCY = gy - H * 0.5;
      const pad = H * 0.12;
      const quiet = 1 - s.silence;
      const bloom = easeOutCubic(s.bloom);
      const windup = s.pendTo >= 0 && s.pendTo !== LAST ? s.pendT / s.pendDur : 0;
      const flick = rm ? 1 : 1 - L.flicker * (0.35 + 0.35 * Math.sin(t * 31) * Math.sin(t * 13.7 + 1));

      ctx.save();
      ctx.translate(cx, figCY);
      ctx.scale(s.zoom, s.zoom);
      ctx.translate(-cx + s.shakeX, -figCY + s.shakeY);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#07060f');
      sky.addColorStop(0.6, '#110a22');
      sky.addColorStop(1, `rgb(${rgbMix([40, 16, 48], L.sky, c * quiet)})`);
      ctx.fillStyle = sky;
      ctx.fillRect(-pad, -pad, w + pad * 2, horizon + pad);

      // Stars fade as the aura takes over, and hang bright in the silence
      ctx.fillStyle = '#cfd6ff';
      for (let i = 0; i < s.stars.length; i += 3) {
        const a = (0.25 + 0.35 * Math.sin(at * 1.3 + s.stars[i + 2])) * (1 - c * 0.7 * quiet);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(s.stars[i] * w, s.stars[i + 1] * horizon * 0.9, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;

      const glow = rgb(L.glow);
      const edgeS = rgb(L.edge);
      const aura = quiet * bloom;
      ctx.globalCompositeOperation = 'lighter';
      const back = ctx.createRadialGradient(cx, figCY, 0, cx, figCY, Math.max(w, h) * 0.7);
      back.addColorStop(0, `rgba(${glow},${(0.08 + 0.3 * c) * aura})`);
      back.addColorStop(0.35, `rgba(${edgeS},${(0.03 + 0.12 * c) * aura})`);
      back.addColorStop(1, `rgba(${edgeS},0)`);
      ctx.fillStyle = back;
      ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);

      // Speed lines
      const sl = smoothstep(0.45, 0.95, c) * L.speed * quiet;
      if (sl > 0.01) {
        const r0 = H * 0.75;
        const r1 = Math.max(w, h);
        ctx.fillStyle = `rgba(${rgbMix(L.hot, [255, 255, 255], 0.3)},${Math.min(0.2, 0.14 * sl)})`;
        ctx.beginPath();
        for (let i = 0; i < SPEED_LINES; i++) {
          const a = s.speed[i * 2];
          const k = s.speed[i * 2 + 1];
          const wd = 0.006 + 0.008 * k;
          const inner = r0 * (1 + (1 - k) * 0.8);
          ctx.moveTo(cx + Math.cos(a) * inner, figCY + Math.sin(a) * inner);
          ctx.lineTo(cx + Math.cos(a - wd) * r1, figCY + Math.sin(a - wd) * r1);
          ctx.lineTo(cx + Math.cos(a + wd) * r1, figCY + Math.sin(a + wd) * r1);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Mesas with aura-lit rims
      ctx.fillStyle = '#1a1030';
      fillSkyline(ctx, s.far, horizon + 2);
      ctx.fillStyle = '#120b20';
      fillSkyline(ctx, s.near, horizon + 2);
      const rimC = rgb(L.rimTop);
      const rimG = ctx.createLinearGradient(0, 0, w, 0);
      const rimA = (0.06 + 0.4 * c) * aura;
      rimG.addColorStop(0, `rgba(${rimC},0)`);
      rimG.addColorStop(clamp(0.5 - H / w, 0, 0.49), `rgba(${rimC},0)`);
      rimG.addColorStop(0.5, `rgba(${rimC},${rimA})`);
      rimG.addColorStop(clamp(0.5 + H / w, 0.51, 1), `rgba(${rimC},0)`);
      rimG.addColorStop(1, `rgba(${rimC},0)`);
      ctx.strokeStyle = rimG;
      ctx.lineWidth = 1.2;
      strokeSkyline(ctx, s.far);
      strokeSkyline(ctx, s.near);

      // Ground
      const ground = ctx.createLinearGradient(0, horizon, 0, h);
      ground.addColorStop(0, '#1b1228');
      ground.addColorStop(0.5, '#110b1b');
      ground.addColorStop(1, '#07060f');
      ctx.fillStyle = ground;
      ctx.fillRect(-pad, horizon, w + pad * 2, h - horizon + pad);

      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(cx, gy);
      ctx.scale(1, 0.24);
      const poolR = H * (0.7 + 0.8 * c) * L.auraW;
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, poolR);
      pool.addColorStop(0, `rgba(${glow},${(0.12 + 0.35 * c) * aura})`);
      pool.addColorStop(1, `rgba(${edgeS},0)`);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, poolR, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // Cracks: dark scar with a molten core that glows with the charge
      if (s.crackReveal > 0.01) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const glowC = Math.max(c, L.crack * 0.6);
        for (let pass = 0; pass < 3; pass++) {
          if (pass === 0) {
            ctx.strokeStyle = 'rgba(4,2,8,0.85)';
            ctx.globalCompositeOperation = 'source-over';
          } else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle =
              pass === 1
                ? `rgba(${rgb(L.crackC)},${0.25 * glowC * quiet})`
                : `rgba(${rgb(L.hot)},${(0.3 + 0.6 * glowC) * quiet})`;
          }
          for (const cr of s.cracks) {
            const lim = cr.total * s.crackReveal;
            ctx.lineWidth = Math.max(0.8, H * 0.006 * cr.width) * (pass === 1 ? 4 : pass === 2 ? 0.5 : 1.2);
            ctx.beginPath();
            ctx.moveTo(cx + cr.pts[0] * H, gy + cr.pts[1] * H * 0.28);
            for (let i = 1; i < cr.lens.length; i++) {
              const px = cr.pts[(i - 1) * 2];
              const pd = cr.pts[(i - 1) * 2 + 1];
              let ux = cr.pts[i * 2];
              let ud = cr.pts[i * 2 + 1];
              if (cr.lens[i] > lim) {
                const k = (lim - cr.lens[i - 1]) / (cr.lens[i] - cr.lens[i - 1]);
                ux = lerp(px, ux, k);
                ud = lerp(pd, ud, k);
                ctx.lineTo(cx + ux * H, gy + ud * H * 0.28);
                break;
              }
              ctx.lineTo(cx + ux * H, gy + ud * H * 0.28);
            }
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Ground shockwaves
      const ringC = rgbMix(L.hot, L.flashC, 0.5);
      for (const r of s.rings) {
        if (r.age < 0 || r.age > 1.1) continue;
        const k = r.age / 1.1;
        const rx = easeOutCubic(k) * H * (1.1 + 1.6 * r.str);
        ctx.strokeStyle = `rgba(${ringC},${(1 - k) * 0.7 * r.str})`;
        ctx.lineWidth = Math.max(1, H * 0.02 * (1 - k));
        ctx.beginPath();
        ctx.ellipse(cx, gy, rx, rx * 0.22, 0, 0, TAU);
        ctx.stroke();
      }

      const spreadK = Math.min(1, (w * 0.46) / (1.25 * H));
      const rockRim = rgb(L.rimTop);
      const drawRocks = (front: boolean) => {
        for (const r of s.rocks) {
          if (r.z >= 0 !== front) continue;
          const baseY = gy + r.z * H * 0.1;
          const x = cx + r.u * H * spreadK;
          const size = r.size * H * (1 + r.z * 0.2);
          const lifted = clamp(r.lift / (H * 0.2), 0, 1);
          // Contact shadow shrinks as it rises
          ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - lifted * 0.7)})`;
          ctx.beginPath();
          ctx.ellipse(x, baseY + size * 0.4, size * (1.2 - lifted * 0.5), size * 0.3, 0, 0, TAU);
          ctx.fill();
          const jit = c > 0.75 && !rm ? Math.sin(t * 60 + r.phase) * H * 0.003 * (1 - L.still) : 0;
          ctx.save();
          ctx.translate(x + jit, baseY - r.lift);
          ctx.rotate(r.rot);
          ctx.beginPath();
          for (let k = 0; k < 7; k++) {
            const vx = r.verts[k * 2] * size;
            const vy = r.verts[k * 2 + 1] * size;
            if (k === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          ctx.fillStyle = '#231a33';
          ctx.fill();
          ctx.strokeStyle = `rgba(${rockRim},${(0.15 + 0.6 * c) * (0.4 + 0.6 * aura)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      };
      drawRocks(false);

      // Aura behind the fighter
      const shape: AuraShape = {
        w: L.auraW,
        h: L.auraH,
        base: L.auraBase,
        amp: L.auraAmp,
        speed: L.auraSpeed,
        sharp: L.auraSharp,
        n: FORMS[s.form].n,
      };
      const suck = 1 - 0.3 * windup;
      const auraA = aura * L.auraAlpha * flick;
      if (auraA > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const hot = rgb(L.hot);
        const mid = rgb(L.mid);
        const layers: readonly (readonly [number, number, string, string, number])[] = [
          [1.15, 0.2 / 0.75, edgeS, mid, 1],
          [0.95, 0.28 / 0.75, mid, hot, 2],
          [0.65, 0.2 / 0.75, hot, mid, 3],
        ];
        for (const [gk, a, edge, core, seed] of layers) {
          const grow = c * gk * suck * (0.6 + 0.4 * bloom);
          const alpha = a * (0.3 + 0.7 * c) * auraA;
          const g = ctx.createRadialGradient(cx, gy - H * 0.35, H * 0.05, cx, gy - H * 0.5, H * (0.7 + 0.6 * grow));
          g.addColorStop(0, `rgba(${core},${alpha})`);
          g.addColorStop(0.6, `rgba(${edge},${alpha * 0.7})`);
          g.addColorStop(1, `rgba(${edge},${alpha * 0.25})`);
          ctx.fillStyle = g;
          flame(ctx, cx, gy, H, grow, at, seed, shape);
          ctx.fill();
        }
        if (L.core > 0.02) {
          // Bright inner sheath hugging the body (Blue, God, Ultra Instinct)
          const g = ctx.createRadialGradient(cx, gy - H * 0.5, H * 0.05, cx, gy - H * 0.5, H * 0.55);
          g.addColorStop(0, `rgba(255,255,255,${0.32 * L.core * auraA})`);
          g.addColorStop(0.5, `rgba(${hot},${0.2 * L.core * auraA})`);
          g.addColorStop(1, `rgba(${hot},0)`);
          ctx.fillStyle = g;
          flame(ctx, cx, gy, H, c * 0.35 * suck, at * 1.4, 5, { ...shape, w: shape.w * 0.82, h: shape.h * 0.86 });
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Dust and debris
      for (const p of s.parts) {
        if (p.life <= 0) continue;
        const k = p.life / p.max;
        if (p.kind === Kind.Dust) {
          ctx.fillStyle = `rgba(120,96,110,${0.35 * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
          ctx.fill();
        } else if (p.kind === Kind.Debris) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = '#2a2038';
          ctx.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          ctx.strokeStyle = `rgba(${rockRim},0.6)`;
          ctx.lineWidth = 0.8;
          ctx.strokeRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      // Fighter
      const top = gy - H * 1.2;
      const body = ctx.createLinearGradient(0, top, 0, gy);
      body.addColorStop(0, '#1c2140');
      body.addColorStop(1, '#0c0e1d');
      const pants = ctx.createLinearGradient(0, gy - H * 0.55, 0, gy);
      pants.addColorStop(0, '#4a2616');
      pants.addColorStop(1, '#23110b');
      const lit = (0.4 + 0.6 * aura) * flick;
      const rim = ctx.createLinearGradient(0, top, 0, gy);
      rim.addColorStop(0, `rgba(${rgb(L.rimTop)},${(0.55 + 0.45 * c) * lit})`);
      rim.addColorStop(1, `rgba(${rgb(L.rimLow)},${(0.35 + 0.4 * c) * lit})`);
      const form = FORMS[s.form];
      // Just before each threshold the hair flickers toward the next form
      let nextK = 0;
      if (!rm && s.form < LAST && s.pendTo < 0 && s.meter > 0.72 && Math.sin(t * 38) > 0.2) nextK = (s.meter - 0.72) / 0.28;
      if (s.pendTo >= 0 && !rm && Math.sin(t * 30) > -0.2) nextK = s.pendTo === LAST ? s.pendT / s.pendDur : 0.9;
      const nextL = FORMS[Math.min(LAST, s.form + 1)].look;
      // God keeps its red: only a faint hint of the next form shows through
      const hintK = nextK * (s.form === 4 ? (s.pendTo < 0 ? 0.15 : 0.4) : 0.8);
      const hairC = rgbMix(L.hairC, nextL.hairC, hintK);
      const hairHiC = rgbMix(L.hairHi, nextL.hairHi, hintK);
      const energy = L.hairEnergy * smoothstep(0, 0.7, c + 0.25);
      const hairLook = energy === L.hairEnergy ? L : { ...L, hairEnergy: energy };
      const head = headOf(s.pose, cx, gy, H);
      const hairFill = ctx.createLinearGradient(0, head.y - H * 0.28, 0, head.y + H * 0.05);
      hairFill.addColorStop(0, `rgb(${hairHiC})`);
      hairFill.addColorStop(0.55, `rgb(${hairC})`);
      hairFill.addColorStop(1, `rgb(${rgbMix(L.hairC, [0, 0, 0], 0.25)})`);
      const hairLine = `rgba(${rgb(L.hairLine)},${lerp(0.85, 0.6, clamp(L.hairGlow, 0, 1))})`;

      if (L.mane > 0.02) {
        // Third-form mane behind the body: rim, then fill
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.beginPath();
        maneOutline(ctx, head.x, head.y, H, L.mane, at, c);
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(2, H * (0.012 + 0.012 * c));
        ctx.globalAlpha = Math.min(1, L.mane * 1.5);
        ctx.stroke();
        const mf = ctx.createLinearGradient(0, head.y - H * 0.1, 0, head.y + H * 0.72);
        mf.addColorStop(0, `rgb(${hairHiC})`);
        mf.addColorStop(0.35, `rgb(${hairC})`);
        mf.addColorStop(1, `rgb(${rgbMix(L.hairC, [120, 50, 10], 0.5)})`);
        ctx.fillStyle = mf;
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb(L.hairLine)},0.85)`;
        ctx.lineWidth = Math.max(1, H * 0.005);
        ctx.stroke();
        ctx.restore();
      }

      const fig = drawFighter(
        ctx,
        cx,
        gy,
        H,
        s.pose,
        {
          body,
          pants,
          band: '#141a3a',
          hair: hairC,
          rim,
          rimWidth: Math.max(1, H * (0.006 + 0.006 * c)),
          detail: `rgba(${rgb(L.rimTop)},${(0.12 + 0.2 * c) * lit})`,
          eye: `rgb(${rgb(L.eye)})`,
          eyeAlpha: L.eyeA * (0.4 + 0.6 * smoothstep(0.2, 0.6, c)),
          hairUp: energy,
          hairPath: (g, hX, hY, HH) => hairOutline(g, hX, hY, HH, hairLook, at, rm),
          bangsPath: (g, hX, hY, HH) => bangsOutline(g, hX, hY, HH, hairLook, at),
          hairFill,
          hairLine,
          eyeShape: form.eyeShape,
          bulk: s.bulk,
          cut: L.cut,
        },
        at
      );

      ctx.globalCompositeOperation = 'lighter';
      // Hair glow and an inner aura wash over the figure
      const hg = ctx.createRadialGradient(fig.headX, fig.headY - H * 0.08, 0, fig.headX, fig.headY - H * 0.08, H * 0.28);
      hg.addColorStop(0, `rgba(${hairC},${0.35 * smoothstep(0.15, 0.85, c) * Math.min(1, L.hairEnergy + 0.3) * (s.form > 0 ? 1 : 0.3) * L.hairGlow})`);
      hg.addColorStop(1, `rgba(${hairC},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(fig.headX - H * 0.3, fig.headY - H * 0.38, H * 0.6, H * 0.6);
      if (auraA > 0.01) {
        ctx.fillStyle = `rgba(${rgb(L.hot)},${(0.05 + 0.08 * c) * auraA})`;
        flame(ctx, cx, gy, H, c * 0.6 * suck, at * 1.3, 4, shape);
        ctx.fill();
      }

      // Energy streaks, sparks, embers and wisps
      ctx.lineCap = 'round';
      const streakHot = rgbMix(L.hot, [255, 255, 255], 0.5);
      const streakCool = rgb(L.streak);
      const sparkC = rgbMix(L.bolt, [255, 255, 255], 0.5);
      for (const p of s.parts) {
        if (p.life <= 0) continue;
        const k = p.life / p.max;
        if (p.kind === Kind.Streak) {
          ctx.strokeStyle = `rgba(${k > 0.6 ? streakHot : streakCool},${0.9 * k})`;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
        } else if (p.kind === Kind.Spark) {
          ctx.strokeStyle = `rgba(${sparkC},${k})`;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03 + Math.sin(p.phase) * 2, p.y - p.vy * 0.03);
          ctx.stroke();
        } else if (p.kind === Kind.Ember) {
          const tw = 0.6 + 0.4 * Math.sin(at * 12 + p.phase);
          ctx.fillStyle = `rgba(255,${Math.round(120 + 80 * k)},90,${0.85 * Math.min(1, k * 2) * tw})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        } else if (p.kind === Kind.Wisp) {
          const a = Math.min(1, k * 2) * (1 - k * 0.3);
          ctx.strokeStyle = `rgba(130,175,255,${0.7 * a})`;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          const sw = Math.sin(at * 3 + p.phase) * H * 0.03;
          ctx.quadraticCurveTo(p.x + sw, p.y + H * 0.03, p.x - sw * 0.5, p.y + H * 0.065);
          ctx.stroke();
          ctx.fillStyle = `rgba(235,242,255,${0.8 * a})`;
          ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
        }
      }

      // Lightning: wide glow then bright core
      const boltC = rgb(L.bolt);
      for (const b of s.bolts) {
        if (b.life <= 0) continue;
        const k = b.life / b.max;
        const a = (k > 0.5 ? 1 : 0.55) * quiet;
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 1; i < BOLT_PTS; i++) ctx.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
        ctx.strokeStyle = `rgba(${boltC},${0.3 * a})`;
        ctx.lineWidth = Math.max(3, H * 0.018);
        ctx.stroke();
        ctx.strokeStyle = `rgba(235,248,255,${0.95 * a})`;
        ctx.lineWidth = Math.max(1, H * 0.005);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      if (L.hairGlow < 0.6) {
        // Saturated hair (God) goes back over the additive wash so it stays red
        ctx.save();
        ctx.globalAlpha = clamp((0.6 - L.hairGlow) * 2.5, 0, 1) * 0.85;
        ctx.lineJoin = 'round';
        ctx.fillStyle = hairFill;
        ctx.beginPath();
        hairOutline(ctx, fig.headX, fig.headY, H, hairLook, at, rm);
        ctx.fill();
        ctx.strokeStyle = hairLine;
        ctx.lineWidth = Math.max(1, H * 0.004);
        ctx.stroke();
        ctx.beginPath();
        bangsOutline(ctx, fig.headX, fig.headY, H, hairLook, at);
        ctx.fill();
        ctx.restore();
      }

      drawRocks(true);

      // Air shockwave
      ctx.globalCompositeOperation = 'lighter';
      for (const r of s.rings) {
        if (r.age < 0 || r.age > 0.8) continue;
        const k = r.age / 0.8;
        ctx.strokeStyle = `rgba(${ringC},${(1 - k) * 0.45 * r.str})`;
        ctx.lineWidth = Math.max(1, H * 0.03 * (1 - k));
        ctx.beginPath();
        ctx.ellipse(cx, figCY, easeOutCubic(k) * H * 1.3, easeOutCubic(k) * H * 1.5, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // The silence before Ultra Instinct: the world dims and cools
      if (s.silence > 0.01) {
        ctx.fillStyle = `rgba(8,10,26,${0.5 * s.silence})`;
        ctx.fillRect(0, 0, w, h);
        // The fighter alone stays lit, a faint silver outline
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, figCY, 0, cx, figCY, H * 0.7);
        g.addColorStop(0, `rgba(200,212,255,${0.12 * s.silence})`);
        g.addColorStop(1, 'rgba(200,212,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - H, figCY - H, H * 2, H * 2);
        ctx.globalCompositeOperation = 'source-over';
      }

      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${rgb(L.flashC)},${s.flash * 0.55})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      const vig = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
      vig.addColorStop(0, 'rgba(7,6,15,0)');
      vig.addColorStop(1, `rgba(7,6,15,${0.6 + 0.3 * s.silence})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      if (env.interactive) drawHud(ctx, s, env);
    },
    onPointerDown: (s) => {
      if (!s.pointerHeld && !s.keyHeld) s.pressAt = s.time;
      s.pointerHeld = true;
      s.touched = true;
    },
    onPointerUp: (s, env) => {
      s.pointerHeld = false;
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!s.keyHeld && !s.pointerHeld) s.pressAt = s.time;
        s.keyHeld = true;
        s.touched = true;
      } else {
        s.keyHeld = false;
        release(s, env);
      }
      return true;
    },
    dispose: (s) => {
      if (s.voice) stopVoice(s.voice);
      s.voice = null;
    },
  });

function release(s: State, env: SceneEnv) {
  if (s.keyHeld || s.pointerHeld) return;
  if (s.voice) {
    stopVoice(s.voice);
    s.voice = null;
  }
  // A quick tap steps down one form
  if (s.pressAt >= 0 && s.time - s.pressAt < TAP && s.form > 0 && s.pendTo < 0) {
    s.pressAt = -1;
    s.idle = 0;
    powerDown(s, env);
    return;
  }
  s.pressAt = -1;
  if (s.level > 0.35 && s.pendTo < 0) {
    const calm = 1 - s.look.still * 0.7;
    addRing(s, s.level * 0.6 * calm);
    s.kick = Math.max(s.kick, s.level * 0.3 * calm);
    const bus = env.audio();
    if (bus) noise(bus, { duration: 0.6, freq: 420, type: 'lowpass', gain: 0.18 * s.level });
  }
}
