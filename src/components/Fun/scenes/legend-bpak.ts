import { createCanvasScene, clamp, damp, lerp, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  MONO,
  callout,
  chip,
  clank,
  compositeFigure,
  ellipse,
  freeFigureLayer,
  grain,
  halftone,
  limb,
  makeFigureLayer,
  makeMotes,
  massAlong,
  paintFigure,
  paintNumeral,
  part,
  rays,
  smoothClosed,
  smoothOpen,
  spawnMote,
  stepMotes,
  strokeNumeral,
  swell,
  thump,
  vignette,
} from './legends-iron-kit';
import type { FigureLayer, Mote, RimStyle } from './legends-iron-kit';

/**
 * Pakulski: Leg Day. A steel blue gym after hours, one lamp over the platform, a giant halftone 40
 * on the wall. A tribute silhouette with the mass monster build (bald, full beard, huge traps and
 * quads) squats a loaded bar, seen from the side and a little behind so the plates clear his back.
 * The rig keeps the bar over the middle of the foot all the way down: the knees travel forward,
 * the hips sit back and down past parallel, and the torso leans only as much as balance needs.
 * Hold to sink slow (the controlled eccentric he teaches), let go in the hole to drive up. The
 * tempo meter counts the eccentric, deep controlled reps grow the quad sweep, plates rattle at
 * lockout.
 */

type Phase = 'stand' | 'down' | 'up';

interface State {
  phase: Phase;
  d: number;
  ecc: number;
  hole: number;
  held: boolean;
  keyHeld: boolean;
  touched: boolean;
  sweep: number;
  sweepShown: number;
  reps: number;
  good: number;
  streak: number;
  rattle: number;
  rattleT: number;
  shake: number;
  brace: number;
  toast: string;
  toastAge: number;
  toastGood: boolean;
  lastEcc: number;
  demoT: number;
  motes: Mote[];
  moteAcc: number;
  H: number;
  gx: number;
  gy: number;
  portrait: boolean;
  bg: HTMLCanvasElement | null;
  far: FigureLayer;
  body: FigureLayer;
  arm: FigureLayer;
}

/** Seconds of controlled descent to full depth; parallel arrives around two thirds of the way */
const DESC = 3.4;
const PARALLEL = 0.7;
const DEG = Math.PI / 180;
const YAW = 44 * DEG;

const RIM: RimStyle = {
  ink: ['#14202b', '#05090d'],
  key: '#d9f3ff',
  kx: 2,
  ky: 1.6,
  back: '#5fb4ff',
  bx: -2,
  by: 1.2,
  halo: '#5aa9d6',
  haloAlpha: 0.5,
  haloBlur: 18,
  bloom: 3,
};
const ARM_RIM: RimStyle = { ...RIM, ink: ['#1d2c3a', '#0a1219'], kx: 2.2, ky: 1.4, bx: -2.2, by: 0.8, backAlpha: 0.9, haloAlpha: 0 };
const FAR_RIM: RimStyle = { ...RIM, ink: ['#0b1219', '#04070a'], key: '#7fa9c6', backAlpha: 0.35, haloAlpha: 0, bloom: 0 };

/* ---------- the squat rig: side on, facing right, y up in body units ---------- */

interface Rig {
  ax: number;
  ay: number;
  kx: number;
  ky: number;
  hx: number;
  hy: number;
  sx: number;
  sy: number;
  /** torso lean from vertical */
  phi: number;
  bx: number;
  by: number;
  ex: number;
  ey: number;
  wx: number;
  wy: number;
  headX: number;
  headY: number;
  headTilt: number;
}

const MID_FOOT = 0.035;
const LS = 0.245;
const LT = 0.25;
const LB = 0.3;

function solve(d: number): Rig {
  const e = d * d * (3 - 2 * d);
  // Knees track forward early, the hips keep folding until the thighs pass parallel
  const ts = (4 + 32 * Math.sin((d * Math.PI) / 2)) * DEG;
  const tt = (3 + 109 * (0.35 * d + 0.65 * e)) * DEG;
  const ax = 0;
  const ay = 0.05;
  const kx = ax + Math.sin(ts) * LS;
  const ky = ay + Math.cos(ts) * LS;
  const hx = kx - Math.sin(tt) * LT;
  const hy = ky + Math.cos(tt) * LT;
  // Lean just enough to keep the bar (on the upper traps, behind the joint) over the mid foot
  let phi = 0.1;
  for (let i = 0; i < 4; i++) {
    phi = Math.asin(clamp((MID_FOOT - hx + 0.035 * Math.cos(phi)) / LB, -0.2, 0.92));
  }
  const ux = Math.sin(phi);
  const uy = Math.cos(phi);
  // back normal (pointing behind him)
  const bnx = -uy;
  const bny = ux;
  const sx = hx + ux * LB;
  const sy = hy + uy * LB;
  const bx = sx + bnx * 0.035 + ux * 0.012;
  const by = sy + bny * 0.035 + uy * 0.012;
  // Hands wide on the bar: in profile they sit at the bar, elbows driven down and back
  const wx = bx + 0.012;
  const wy = by + 0.004;
  // Elbows drive down and back under the bar, the forearm runs up to the hand on the bar
  const el = { x: sx - ux * 0.105 + bnx * 0.05, y: sy - uy * 0.105 + bny * 0.05 };
  // Head stays near neutral, eyes a little down the floor ahead
  const tilt = phi * 0.55;
  const headX = sx + ux * 0.105 + Math.cos(phi) * 0.03;
  const headY = sy + uy * 0.105 - Math.sin(phi) * 0.03;
  return { ax, ay, kx, ky, hx, hy, sx, sy, phi, bx, by, ex: el.x, ey: el.y, wx, wy, headX, headY, headTilt: tilt };
}

interface View {
  X: (u: number) => number;
  Y: (v: number) => number;
  W: (v: number) => number;
}

function drawBody(c: CanvasRenderingContext2D, r: Rig, v: View, sweep: number, brace: number) {
  const { X, Y, W } = v;
  const ux = Math.sin(r.phi);
  const uy = Math.cos(r.phi);
  // Lifting shoe, flat on the floor
  part(c, () =>
    limb(c, [
      [X(-0.045), Y(0.024), W(0.024), W(0.024)],
      [X(0.04), Y(0.024), W(0.026), W(0.022)],
      [X(0.13), Y(0.018), W(0.017), W(0.016)],
    ])
  );
  // Shin: tibia down the front, huge calf behind
  const S = (x: number, y: number, a: number, b: number) => [X(x), Y(y), W(a), W(b)];
  const L = (x0: number, y0: number, x1: number, y1: number, t: number) => [lerp(x0, x1, t), lerp(y0, y1, t)] as const;
  const sh = (t: number) => L(r.kx, r.ky, r.ax, r.ay, t);
  part(c, () =>
    limb(c, [
      S(...sh(0), 0.046, 0.05),
      S(...sh(0.3), 0.038, 0.078),
      S(...sh(0.62), 0.031, 0.048),
      S(...sh(1), 0.024, 0.027),
    ])
  );
  // Thigh from hip to knee: left side is the quad, the sweep grows with good reps
  const th = (t: number) => L(r.hx, r.hy, r.kx, r.ky, t);
  part(c, () =>
    limb(c, [
      S(...th(0), 0.098, 0.094),
      S(...th(0.3), 0.104 + 0.022 * sweep, 0.092),
      S(...th(0.64), 0.09 + 0.028 * sweep, 0.074),
      S(...th(0.88), 0.064 + 0.012 * sweep, 0.054),
      S(...th(1), 0.047, 0.047),
    ])
  );
  // Glutes behind the hip, riding the pelvis
  const gx = r.hx - uy * 0.042 - ux * 0.0;
  const gy = r.hy + ux * 0.042 - uy * 0.0;
  part(c, () => ellipse(c, X(gx), Y(gy), W(0.066), W(0.074), r.phi * 0.8));
  // Torso: braced belly against the belt, thick lats, deep chest
  const b0x = r.hx - ux * 0.035;
  const b0y = r.hy - uy * 0.035;
  const nx = r.sx + ux * 0.05;
  const ny = r.sy + uy * 0.05;
  const bb = 1 + 0.04 * brace;
  part(c, () =>
    massAlong(
      c,
      X(b0x),
      Y(b0y),
      X(nx),
      Y(ny),
      [
        [0, W(0.088), W(0.09)],
        [0.14, W(0.085 * bb), W(0.084)],
        [0.3, W(0.088 * bb), W(0.08)],
        [0.46, W(0.096 * bb), W(0.092)],
        [0.6, W(0.11), W(0.108)],
        [0.72, W(0.122), W(0.11)],
        [0.84, W(0.112), W(0.106)],
        [0.93, W(0.078), W(0.094)],
        [1, W(0.05), W(0.066)],
      ],
      1
    )
  );
  // Traps rise like a ridge from the neck out to the shoulders
  const P = (along: number, back: number): [number, number] => [X(r.sx + ux * along - uy * back), Y(r.sy + uy * along + ux * back)];
  part(c, () => smoothClosed(c, [...P(0.1, 0.02), ...P(0.07, 0.08), ...P(0.02, 0.1), ...P(-0.02, 0.06), ...P(0.0, -0.02), ...P(0.07, -0.03)]));
  part(c, () => limb(c, [[...P(0.04, 0.0), W(0.058), W(0.058)], [...P(0.1, -0.012), W(0.05), W(0.05)]]));
  // Head: shaved dome, profile, full beard down onto the throat
  const hc = Math.cos(r.headTilt);
  const hs = Math.sin(r.headTilt);
  const HP = (pts: readonly number[]) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      out.push(X(r.headX + x * hc + y * hs), Y(r.headY - x * hs + y * hc));
    }
    return out;
  };
  part(c, () =>
    smoothClosed(
      c,
      HP([
        -0.048, -0.04, -0.062, 0.0, -0.052, 0.044, -0.016, 0.068, 0.024, 0.064, 0.05, 0.038, 0.057, 0.014, 0.053, 0.0, 0.072,
        -0.02, 0.058, -0.03, 0.06, -0.04, 0.03, -0.06, -0.01, -0.06,
      ])
    )
  );
  part(c, () =>
    smoothClosed(
      c,
      HP([0.006, -0.012, 0.03, -0.022, 0.054, -0.034, 0.064, -0.05, 0.06, -0.082, 0.04, -0.1, 0.0, -0.094, -0.022, -0.066, -0.018, -0.03])
    )
  );
}

function drawArm(c: CanvasRenderingContext2D, r: Rig, v: View) {
  const { X, Y, W } = v;
  part(c, () => ellipse(c, X(r.sx - 0.004), Y(r.sy - 0.012), W(0.056), W(0.062), r.phi));
  const L = (x0: number, y0: number, x1: number, y1: number, t: number) => [X(lerp(x0, x1, t)), Y(lerp(y0, y1, t))];
  const ua = (t: number) => L(r.sx, r.sy, r.ex, r.ey, t);
  const fa = (t: number) => L(r.ex, r.ey, r.wx, r.wy, t);
  // Which side faces front depends on the arm direction; keep the belly toward the outside of the fold
  part(c, () => limb(c, [[...ua(0), W(0.056)], [...ua(0.45), W(0.064), W(0.06)], [...ua(0.85), W(0.044)], [...ua(1), W(0.034)]]));
  part(c, () => limb(c, [[...fa(0), W(0.034)], [...fa(0.25), W(0.038)], [...fa(0.7), W(0.027)], [...fa(1), W(0.022)]]));
  part(c, () => ellipse(c, X(r.wx), Y(r.wy), W(0.03), W(0.034)));
}

/** Contours and form light inside the silhouette */
function bodyAccents(c: CanvasRenderingContext2D, r: Rig, v: View, sweep: number) {
  const { X, Y, W } = v;
  const ux = Math.sin(r.phi);
  const uy = Math.cos(r.phi);
  const glow = (x: number, y: number, rad: number, a: number) => {
    const g = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), W(rad));
    g.addColorStop(0, `rgba(170,215,245,${a})`);
    g.addColorStop(1, 'rgba(170,215,245,0)');
    c.fillStyle = g;
    c.fillRect(X(x) - W(rad), Y(y) - W(rad), W(rad) * 2, W(rad) * 2);
  };
  const tq = (t: number, o: number) => {
    // point on the thigh, o toward the quad side
    const dx = r.kx - r.hx;
    const dy = r.ky - r.hy;
    const len = Math.hypot(dx, dy) || 1;
    return [lerp(r.hx, r.kx, t) - (dy / len) * o, lerp(r.hy, r.ky, t) + (dx / len) * o] as const;
  };
  glow(...tq(0.45, 0.06), 0.09, 0.16 + 0.16 * sweep);
  glow(r.sx + ux * 0.0 + uy * 0.06, r.sy - 0.06, 0.08, 0.12);
  glow(lerp(r.kx, r.ax, 0.3) - 0.04, lerp(r.ky, r.ay, 0.3), 0.05, 0.12);
  c.strokeStyle = 'rgba(200,232,255,0.3)';
  c.lineWidth = Math.max(1, W(0.0035));
  c.beginPath();
  // Quad heads: the sweep (vastus lateralis), rectus line, teardrop above the knee
  const q = (t: number, o: number) => {
    const p = tq(t, o);
    return [X(p[0]), Y(p[1])];
  };
  smoothOpen(c, [...q(0.12, 0.02), ...q(0.45, 0.035 + 0.01 * sweep), ...q(0.8, 0.03), ...q(0.95, 0.012)]);
  smoothOpen(c, [...q(0.5, -0.03), ...q(0.75, -0.02), ...q(0.92, -0.01)]);
  if (sweep > 0.2) {
    c.globalAlpha = Math.min(1, (sweep - 0.2) * 1.5);
    smoothOpen(c, [...q(0.25, 0.07 + 0.02 * sweep), ...q(0.55, 0.075 + 0.025 * sweep), ...q(0.78, 0.06)]);
    smoothOpen(c, [...q(0.3, 0.0), ...q(0.4, 0.02), ...q(0.5, 0.0), ...q(0.62, 0.025)]);
    c.globalAlpha = 1;
  }
  // Calf split, hamstring tie in, lat and serratus
  smoothOpen(c, [X(lerp(r.kx, r.ax, 0.15) - 0.04), Y(lerp(r.ky, r.ay, 0.15)), X(lerp(r.kx, r.ax, 0.38) - 0.05), Y(lerp(r.ky, r.ay, 0.38)), X(lerp(r.kx, r.ax, 0.6) - 0.025), Y(lerp(r.ky, r.ay, 0.6))]);
  const T = (along: number, fwd: number) => [X(r.hx + ux * along + uy * fwd), Y(r.hy + uy * along - ux * fwd)];
  smoothOpen(c, [...T(0.24, -0.07), ...T(0.18, -0.03), ...T(0.12, 0.0)]);
  for (let i = 0; i < 3; i++) smoothOpen(c, [...T(0.2 - i * 0.03, 0.06), ...T(0.19 - i * 0.03, 0.03)]);
  c.stroke();
  // Lifting belt and shorts hem
  c.fillStyle = 'rgba(3,6,9,0.7)';
  c.beginPath();
  const B = (along: number, fwd: number) => [X(r.hx + ux * along + uy * fwd), Y(r.hy + uy * along - ux * fwd)];
  smoothClosed(c, [...B(0.08, 0.12), ...B(0.15, 0.12), ...B(0.15, -0.12), ...B(0.08, -0.12)]);
  c.fill();
  c.strokeStyle = 'rgba(200,232,255,0.4)';
  c.beginPath();
  c.moveTo(...(B(0.15, 0.12) as [number, number]));
  c.lineTo(...(B(0.15, -0.12) as [number, number]));
  c.stroke();
  c.fillStyle = 'rgba(2,4,7,0.55)';
  c.beginPath();
  const hem = tq(0.55, 0);
  smoothClosed(c, [...B(0.09, 0.14), ...B(0.09, -0.14), ...q(0.0, -0.12), X(hem[0] - 0.02), Y(hem[1] - 0.12), ...q(0.55, 0.13), ...q(0.1, 0.13)]);
  c.fill();
  // Beard texture and the ear
  const hc = Math.cos(r.headTilt);
  const hs = Math.sin(r.headTilt);
  const HP = (x: number, y: number) => [X(r.headX + x * hc + y * hs), Y(r.headY - x * hs + y * hc)];
  c.strokeStyle = 'rgba(200,232,255,0.26)';
  c.lineWidth = Math.max(0.8, W(0.0025));
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = 0.01 + i * 0.011;
    smoothOpen(c, [...HP(x, -0.02 - i * 0.004), ...HP(x + 0.004, -0.05 - i * 0.006), ...HP(x - 0.004, -0.08 + i * 0.004)]);
  }
  c.stroke();
  c.strokeStyle = 'rgba(200,232,255,0.32)';
  c.beginPath();
  const [ex, ey] = HP(-0.006, 0.0);
  c.ellipse(ex, ey, W(0.009), W(0.015), -r.headTilt, -1.2, 1.9);
  c.stroke();
  // Light across the dome
  const [dx, dy] = HP(-0.01, 0.04);
  const g = c.createRadialGradient(dx, dy, 0, dx, dy, W(0.05));
  g.addColorStop(0, 'rgba(200,232,255,0.22)');
  g.addColorStop(1, 'rgba(200,232,255,0)');
  c.fillStyle = g;
  c.fillRect(dx - W(0.05), dy - W(0.05), W(0.1), W(0.1));
}

function armAccents(c: CanvasRenderingContext2D, r: Rig, v: View) {
  const { X, Y, W } = v;
  const mx = lerp(r.sx, r.ex, 0.45);
  const my = lerp(r.sy, r.ey, 0.45);
  const g = c.createRadialGradient(X(mx), Y(my), 0, X(mx), Y(my), W(0.07));
  g.addColorStop(0, 'rgba(170,215,245,0.2)');
  g.addColorStop(1, 'rgba(170,215,245,0)');
  c.fillStyle = g;
  c.fillRect(X(mx) - W(0.07), Y(my) - W(0.07), W(0.14), W(0.14));
  // Tee sleeve
  c.strokeStyle = 'rgba(200,232,255,0.3)';
  c.lineWidth = Math.max(1, W(0.0035));
  c.beginPath();
  const s = (t: number, o: number) => {
    const dx = r.ex - r.sx;
    const dy = r.ey - r.sy;
    const len = Math.hypot(dx, dy) || 1;
    return [X(lerp(r.sx, r.ex, t) - (dy / len) * o), Y(lerp(r.sy, r.ey, t) + (dx / len) * o)];
  };
  smoothOpen(c, [...s(0.42, 0.065), ...s(0.46, 0.0), ...s(0.42, -0.065)]);
  c.stroke();
}

/* ---------- the bar ---------- */

interface Plates {
  n: number;
  rattle: number;
  t: number;
}

function plateWobble(i: number, p: Plates) {
  return p.rattle * Math.sin(p.t * 46 + i * 1.9) * 0.006;
}

function drawPlates(ctx: CanvasRenderingContext2D, r: Rig, v: View, side: 'near' | 'far', p: Plates) {
  const { X, Y, W } = v;
  const dirx = -Math.sin(YAW);
  const diry = -0.05;
  const sgn = side === 'near' ? 1 : -1;
  const bx = r.bx;
  const by = r.by;
  const R = 0.122;
  const at = (z: number) => [X(bx + dirx * z * sgn), Y(by + diry * z * sgn)] as const;
  // Sleeve
  ctx.save();
  ctx.lineCap = 'round';
  const [s0x, s0y] = at(0.3);
  const [s1x, s1y] = at(0.6);
  ctx.strokeStyle = side === 'near' ? '#8aa3b6' : '#4a5d6c';
  ctx.lineWidth = W(0.016);
  ctx.beginPath();
  ctx.moveTo(s0x, s0y);
  ctx.lineTo(s1x, s1y);
  ctx.stroke();
  const order = side === 'near' ? [...Array(p.n).keys()] : [...Array(p.n).keys()].reverse();
  for (const i of order) {
    const z = 0.37 + i * 0.032;
    const [cx, cy0] = at(z);
    const cy = cy0 + W(plateWobble(i, p));
    const rx = W(R) * Math.cos(YAW);
    const ry = W(R);
    // Edge then face
    ctx.fillStyle = side === 'near' ? '#0b1218' : '#06090c';
    ctx.beginPath();
    ellipse(ctx, cx - W(0.012) * sgn, cy, rx, ry);
    ctx.fill();
    const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    if (side === 'near') {
      g.addColorStop(0, '#3a5266');
      g.addColorStop(0.45, '#16222c');
      g.addColorStop(1, '#070b0f');
    } else {
      g.addColorStop(0, '#1d2a35');
      g.addColorStop(1, '#05080b');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ellipse(ctx, cx, cy, rx, ry);
    ctx.fill();
    ctx.strokeStyle = side === 'near' ? 'rgba(217,243,255,0.7)' : 'rgba(127,169,198,0.4)';
    ctx.lineWidth = Math.max(1, W(0.003));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.9, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,205,235,0.25)';
    ctx.beginPath();
    ellipse(ctx, cx, cy, rx * 0.8, ry * 0.8);
    ellipse(ctx, cx, cy, rx * 0.2, ry * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBar(ctx: CanvasRenderingContext2D, r: Rig, v: View) {
  const { X, Y, W } = v;
  const dirx = -Math.sin(YAW);
  ctx.save();
  ctx.strokeStyle = '#9fb7c9';
  ctx.lineWidth = W(0.011);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X(r.bx - dirx * 0.36), Y(r.by + 0.05 * 0.36));
  ctx.lineTo(X(r.bx + dirx * 0.36), Y(r.by - 0.05 * 0.36));
  ctx.stroke();
  ctx.restore();
}

/* ---------- scene ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.portrait = h > w * 1.05;
  s.H = s.portrait ? Math.min(h * 0.6, w * 0.95) : Math.min(h * 0.8, w * 0.6);
  s.gy = h * (s.portrait ? 0.82 : 0.92);
  s.gx = w * (s.portrait ? 0.5 : 0.47);
  s.bg = buildBackground(s, env);
}

function buildBackground(s: State, env: SceneEnv) {
  const { w, h } = env;
  const H = s.H;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * env.dpr));
  cv.height = Math.max(1, Math.round(h * env.dpr));
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const g = c.createRadialGradient(s.gx, s.gy - H * 1.05, 0, s.gx, s.gy - H * 0.9, Math.max(w, h) * 0.95);
  g.addColorStop(0, '#6f8aa3');
  g.addColorStop(0.3, '#2c3c4d');
  g.addColorStop(0.7, '#111922');
  g.addColorStop(1, '#05080b');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.drawImage(
    halftone(env, w, h, Math.max(5, H * 0.012), 45, 'rgba(159,198,228,0.32)', (t) => {
      const r = t.createRadialGradient(s.gx, s.gy - H * 0.95, 0, s.gx, s.gy - H * 0.95, H * 0.9);
      r.addColorStop(0, 'rgba(255,255,255,0.85)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      t.fillStyle = r;
      t.fillRect(0, 0, w, h);
    }),
    0,
    0,
    w,
    h
  );
  // The 40, in halftone dots with a hairline
  const size = Math.min(H * 0.95, w * 0.62);
  const nx = s.gx + (s.portrait ? 0 : H * 0.02);
  const ny = s.gy - H * 0.2;
  c.globalAlpha = 0.45;
  c.drawImage(
    halftone(env, w, h, Math.max(4, size * 0.02), 30, '#7fb6dd', (t) => paintNumeral(t, '40', nx, ny, size)),
    0,
    0,
    w,
    h
  );
  c.globalAlpha = 1;
  strokeNumeral(c, '40', nx, ny, size, '#bfe2ff', 0.4);
  // Power rack behind him: two uprights, the safety arms, a crossmember
  c.fillStyle = '#070b10';
  const rackW = H * 0.5;
  const top = s.gy - H * 1.2;
  for (const x of [s.gx - rackW * 0.62, s.gx + rackW * 0.55]) {
    c.fillRect(x - H * 0.018, top, H * 0.036, s.gy - top);
  }
  c.fillRect(s.gx - rackW * 0.62, top, rackW * 1.17, H * 0.03);
  c.fillRect(s.gx - rackW * 0.7, s.gy - H * 0.36, rackW * 1.35, H * 0.022);
  c.strokeStyle = 'rgba(159,210,245,0.22)';
  c.lineWidth = 1;
  for (const x of [s.gx - rackW * 0.62, s.gx + rackW * 0.55]) {
    for (let y = top + H * 0.06; y < s.gy - H * 0.05; y += H * 0.05) {
      c.beginPath();
      c.arc(x, y, H * 0.005, 0, TAU);
      c.stroke();
    }
  }
  // Platform and rubber floor
  const fy = s.gy - H * 0.01;
  const fg = c.createLinearGradient(0, fy, 0, h);
  fg.addColorStop(0, '#1a2632');
  fg.addColorStop(1, '#05080b');
  c.fillStyle = fg;
  c.fillRect(0, fy, w, h - fy);
  c.fillStyle = 'rgba(120,160,190,0.12)';
  c.fillRect(s.gx - H * 0.75, fy, H * 1.5, H * 0.012);
  c.strokeStyle = 'rgba(159,210,245,0.25)';
  c.beginPath();
  c.moveTo(0, fy + 0.5);
  c.lineTo(w, fy + 0.5);
  c.stroke();
  const pool = c.createRadialGradient(s.gx, fy, 0, s.gx, fy, H * 0.7);
  pool.addColorStop(0, 'rgba(200,235,255,0.3)');
  pool.addColorStop(1, 'rgba(200,235,255,0)');
  c.save();
  c.translate(s.gx, fy);
  c.scale(1, 0.16);
  c.fillStyle = pool;
  c.fillRect(-H * 0.7, -H * 0.7, H * 1.4, H * 1.4);
  c.restore();
  return cv;
}

function drawScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const rm = env.reducedMotion;
  const H = s.H;
  const shx = rm ? 0 : Math.sin(t * 61) * s.shake * H * 0.004;
  const shy = rm ? 0 : Math.sin(t * 47 + 1) * s.shake * H * 0.004;
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
  // Lamp over the platform
  const lampX = s.gx;
  const lampY = Math.max(6, s.gy - H * 1.32);
  rays(ctx, lampX, lampY, [72, 80, 88, 96, 104, 112], 6, H * 1.5, 'rgba(220,240,255,0.9)', 0.16);
  ctx.save();
  ctx.fillStyle = '#05080b';
  ctx.beginPath();
  ctx.moveTo(lampX - H * 0.06, lampY);
  ctx.quadraticCurveTo(lampX, lampY - H * 0.05, lampX + H * 0.06, lampY);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(lampX - H * 0.003, 0, H * 0.006, lampY - H * 0.02);
  const lg = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, H * 0.12);
  lg.addColorStop(0, 'rgba(240,250,255,0.9)');
  lg.addColorStop(1, 'rgba(240,250,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(lampX - H * 0.12, lampY - H * 0.12, H * 0.24, H * 0.24);
  ctx.restore();

  const r = solve(s.d);
  const v: View = {
    X: (u) => s.gx + shx + (u - MID_FOOT) * H,
    Y: (y) => s.gy + shy - y * H,
    W: (x) => x * H,
  };
  const plates: Plates = { n: 3 + Math.min(2, Math.floor(s.good / 6)), rattle: s.rattle, t: s.rattleT };
  const box = { x: s.gx - H * 0.5, y: s.gy - H * 1.1, w: H * 1.0, h: H * 1.16 };
  // Far plates and bar end behind everything
  drawPlates(ctx, r, v, 'far', plates);
  paintFigure(s.far, env, box, (c) => {
    // The far leg peeks out just ahead of the near one
    const o = 0.022;
    const vv: View = { ...v, X: (u) => v.X(u + o) };
    part(c, () => limb(c, [[vv.X(r.kx), vv.Y(r.ky), H * 0.045], [vv.X(r.ax), vv.Y(r.ay), H * 0.03]]));
    part(c, () => limb(c, [[vv.X(r.hx), vv.Y(r.hy), H * 0.09], [vv.X(r.kx), vv.Y(r.ky), H * 0.05]]));
    part(c, () => limb(c, [[vv.X(-0.04), vv.Y(0.024), H * 0.022], [vv.X(0.13), vv.Y(0.018), H * 0.016]]));
  }, FAR_RIM);
  compositeFigure(ctx, s.far, env, FAR_RIM);
  drawBar(ctx, r, v);
  paintFigure(s.body, env, box, (c) => drawBody(c, r, v, s.sweepShown, s.brace), RIM, (c) => bodyAccents(c, r, v, s.sweepShown));
  compositeFigure(ctx, s.body, env, RIM);
  paintFigure(s.arm, env, box, (c) => drawArm(c, r, v), ARM_RIM, (c) => armAccents(c, r, v));
  compositeFigure(ctx, s.arm, env, ARM_RIM);
  drawPlates(ctx, r, v, 'near', plates);

  // Chalk in the lamp light
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of s.motes) {
    if (m.life <= 0) continue;
    ctx.fillStyle = `rgba(230,245,255,${Math.min(1, (m.life / m.max) * 2) * 0.45})`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  vignette(ctx, w, h, 0.8, 0.5);
  grain(ctx, w, h, 0.08);
  drawHud(s, env);
}

function drawHud(s: State, env: SceneEnv) {
  const { ctx, w, h } = env;
  const u = Math.min(w, h);
  const fs = Math.max(9, Math.round(u * 0.028));
  const pad = Math.round(u * 0.04);
  chip(ctx, `REPS ${String(s.good).padStart(2, '0')}`, pad, pad, fs, '#d9f3ff', 'rgba(4,8,12,0.65)');
  chip(ctx, `SWEEP ${Math.round(s.sweepShown * 100)}%`, pad, pad + fs * 2.2, fs, '#d9f3ff', 'rgba(4,8,12,0.65)');
  // Tempo meter: a depth rail with the parallel line and the hole, and the eccentric clock
  const mh = h * 0.44;
  const mw = Math.max(8, u * 0.024);
  const mx = w - pad - mw;
  const my = pad + fs * 2.4;
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,12,0.65)';
  ctx.beginPath();
  ctx.roundRect(mx - 3, my - 3, mw + 6, mh + 6, mw);
  ctx.fill();
  // Target band: parallel and below
  ctx.fillStyle = 'rgba(95,180,255,0.25)';
  ctx.fillRect(mx, my + mh * PARALLEL, mw, mh * (1 - PARALLEL));
  ctx.strokeStyle = 'rgba(217,243,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx - 4, my + mh * PARALLEL);
  ctx.lineTo(mx + mw + 4, my + mh * PARALLEL);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, my, 0, my + mh);
  g.addColorStop(0, '#9fd2f5');
  g.addColorStop(1, '#e6f6ff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, Math.max(mw, mh * s.d), mw / 2);
  ctx.fill();
  ctx.font = `700 ${fs}px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d9f3ff';
  ctx.fillText('DEPTH', w - pad, pad);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(fs * 0.8)}px ${MONO}`;
  ctx.fillStyle = 'rgba(217,243,255,0.75)';
  ctx.fillText('PARALLEL', mx - 8, my + mh * PARALLEL);
  // Eccentric clock
  const shown = s.phase === 'down' ? s.ecc : s.lastEcc;
  if (shown > 0 || s.phase === 'down') {
    const big = Math.round(u * 0.07);
    ctx.font = `800 ${big}px ${MONO}`;
    const cx = s.portrait ? pad : mx - 10;
    const cy = s.portrait ? pad + fs * 4.4 + big : my + mh;
    ctx.textAlign = s.portrait ? 'left' : 'right';
    ctx.textBaseline = 'alphabetic';
    const ok = shown >= 2.2;
    ctx.fillStyle = s.phase === 'down' ? (ok ? '#9fe3ff' : '#ffffff') : 'rgba(217,243,255,0.55)';
    ctx.fillText(`${shown.toFixed(1)}s`, cx, cy);
    ctx.font = `600 ${Math.round(fs * 0.8)}px ${MONO}`;
    ctx.fillStyle = 'rgba(217,243,255,0.7)';
    ctx.fillText('ECCENTRIC · AIM 3s', cx, cy + fs * 1.3);
  }
  ctx.restore();
  if (s.toastAge >= 0) {
    const size = Math.max(14, Math.min(u * 0.075, (w * 0.86) / (s.toast.length * 0.62)));
    callout(ctx, s.toast, w * 0.5, h - pad - size * 0.7, size, s.toastAge, 1.4, s.toastGood ? '#e6f6ff' : '#ffd0c4', s.toastGood ? '#5fb4ff' : '#ff6a4a', env.reducedMotion);
  }
  if (!s.touched && env.interactive) {
    ctx.save();
    ctx.font = `600 ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(217,243,255,0.8)';
    ctx.fillText('HOLD TO SINK SLOW · RELEASE TO DRIVE UP', w / 2, h - pad);
    ctx.restore();
  }
}

function press(s: State, env: SceneEnv) {
  s.touched = true;
  s.held = true;
  if (s.phase === 'stand') {
    s.phase = 'down';
    s.ecc = 0;
    s.hole = 0;
    s.brace = 1;
    const bus = env.audio();
    if (bus) swell(bus, { attack: 0.15, hold: 0.1, release: 0.4, gain: 0.05, type: 'bandpass', freq: 500, freqTo: 300, q: 0.6 });
  }
}

function release(s: State, env: SceneEnv) {
  s.held = false;
  if (s.phase !== 'down') return;
  drive(s, env);
}

function toast(s: State, text: string, good: boolean) {
  s.toast = text;
  s.toastAge = 0;
  s.toastGood = good;
}

function drive(s: State, env: SceneEnv) {
  s.phase = 'up';
  s.lastEcc = s.ecc;
  const bus = env.audio();
  if (s.d < PARALLEL) {
    toast(s, s.d < 0.35 ? 'SIT INTO IT' : 'HIGH · BREAK PARALLEL', false);
    s.streak = 0;
  } else {
    s.good += 1;
    s.streak += 1;
    s.sweep = Math.min(1, s.sweep + 0.1);
    const paused = s.hole > 0.3 && s.hole < 2.4;
    toast(s, paused ? 'PAUSED IN THE HOLE' : s.ecc >= 2.2 ? 'DEEP AND CONTROLLED' : 'GOOD DEPTH', true);
    if (bus) tone(bus, 330 + s.sweep * 220, { type: 'triangle', attack: 0.01, decay: 0.3, gain: 0.06 });
  }
  if (bus) swell(bus, { attack: 0.05, hold: 0.25, release: 0.3, gain: 0.07, type: 'lowpass', freq: 380, q: 0.8 });
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2,
    cursor: 'pointer',
    touchAction: 'manipulation',
    init: () => ({
      phase: 'stand',
      d: 0,
      ecc: 0,
      hole: 0,
      held: false,
      keyHeld: false,
      touched: false,
      sweep: 0.15,
      sweepShown: 0.15,
      reps: 0,
      good: 0,
      streak: 0,
      rattle: 0,
      rattleT: 0,
      shake: 0,
      brace: 0,
      toast: '',
      toastAge: -1,
      toastGood: true,
      lastEcc: 0,
      demoT: 0,
      motes: makeMotes(40),
      moteAcc: 0,
      H: 1,
      gx: 0,
      gy: 0,
      portrait: false,
      bg: null,
      far: makeFigureLayer(),
      body: makeFigureLayer(),
      arm: makeFigureLayer(),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt) => {
      const rm = env.reducedMotion;
      if (!env.interactive && rm) {
        // Poster: in the hole, below parallel, bar over the mid foot
        s.d = 0.94;
        s.sweep = s.sweepShown = 0.6;
        s.good = 8;
        s.phase = 'down';
        s.ecc = 3.1;
        s.touched = true;
        return;
      }
      if (!env.interactive) {
        // Demo: slow negatives, a pause, drive
        s.demoT += dt;
        if (s.phase === 'stand' && s.demoT > 1.1) {
          s.demoT = 0;
          press(s, env);
        } else if (s.phase === 'down' && s.demoT > 3.5) {
          s.demoT = 0;
          release(s, env);
        }
      }
      if (s.toastAge >= 0) s.toastAge += dt;
      if (s.toastAge > 2) s.toastAge = -1;
      if (s.phase === 'down') {
        s.ecc += dt;
        s.d = Math.min(1, s.d + dt / DESC);
        if (s.d >= 1) s.hole += dt;
        if (s.hole > 3) drive(s, env);
        if (rm) env.wake(300);
      } else if (s.phase === 'up') {
        // Fast out of the hole, a sticking point a third of the way up, then lockout
        const v = 1.15 * (0.5 + 0.5 * Math.abs(s.d - 0.5) / 0.5);
        s.d = Math.max(0, s.d - dt * v);
        s.shake = Math.max(s.shake, 0.5 * (1 - Math.abs(s.d - 0.5) * 2));
        if (s.d <= 0) {
          s.phase = 'stand';
          s.demoT = 0;
          s.rattle = 1;
          s.rattleT = 0;
          s.brace = 0;
          const bus = env.audio();
          if (bus) {
            clank(bus, 300, 0.09);
            clank(bus, 410, 0.06, 0.06);
            thump(bus, 80, 0.12);
          }
          if (s.held && s.touched) {
            // Still holding at lockout: go straight into the next rep
            s.phase = 'down';
            s.ecc = 0;
            s.hole = 0;
          }
        }
        if (rm) env.wake(300);
      }
      s.rattleT += dt;
      s.rattle = Math.max(0, s.rattle - dt * 1.6);
      s.shake = Math.max(0, s.shake - dt * 2);
      s.brace = damp(s.brace, s.phase === 'stand' ? 0 : 1, 4, dt);
      s.sweepShown = damp(s.sweepShown, s.sweep, 3, dt);
      if (rm && (s.rattle > 0.05 || Math.abs(s.sweepShown - s.sweep) > 0.01)) env.wake(200);
      if (!rm) {
        s.moteAcc += dt * 5;
        while (s.moteAcc >= 1) {
          s.moteAcc -= 1;
          spawnMote(s.motes, s.gx + s.H * rand(-0.5, 0.5), s.gy - s.H * rand(0.2, 1.2), rand(-5, 5), rand(-8, -2), rand(3, 6), rand(0.6, 1.6));
        }
        stepMotes(s.motes, dt, 0, 0.1);
      }
    },
    draw: (s, env, t) => drawScene(s, env, t),
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !s.keyHeld) press(s, env);
      if (!down && s.keyHeld) release(s, env);
      s.keyHeld = down;
      return true;
    },
    dispose: (s) => {
      freeFigureLayer(s.far);
      freeFigureLayer(s.body);
      freeFigureLayer(s.arm);
      if (s.bg) s.bg.width = s.bg.height = 0;
    },
  });
