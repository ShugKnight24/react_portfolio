import { createCanvasScene, clamp, damp, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, glow, glowSprite, layer, mulberry } from './heroes-kit';

/**
 * Hacker Hostel: 3 a.m. in a cluttered suburban house turned incubator. Five developers
 * (silhouettes rim-lit by their screens) chase an idea: one hunched over a monitor, one
 * slumped on the couch with a beer, one pacing, one at the whiteboard, one on a beanbag.
 * Hold to hack: keyboards clatter, code scrolls, the whiteboard fills with sketches and the
 * compression score on the wall TV climbs. Halfway up the idea hits a wall and the team
 * pivots (the board is crossed out and wiped); at the top comes the breakthrough, everyone
 * jumps and the screens burst into a confetti of code before the night settles again.
 * Everything is drawn on a fixed stage (landscape or portrait) fitted into the canvas; the
 * static room is baked into two layers per resize.
 */

type Phase = 'hack' | 'pivot' | 'win' | 'settle';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Layout {
  W: number;
  H: number;
  floor: number;
  lightsY: number;
  win: Box;
  tv: Box;
  clock: Pt & { r: number };
  board: Box;
  rack: Box;
  desk: Box;
  mon: Box;
  lap: Box;
  lamp: Pt & { top: number };
  couch: Box;
  table: Box;
  pizza: Pt;
  coder: Pt;
  guy: Pt;
  bg: { x0: number; x1: number; y: number };
  pacer: { x0: number; x1: number; y: number };
  kid: Pt;
}

interface Sketch {
  /** Board cell, -1 for the whole board, -2 for a centred square */
  cell: number;
  tpl: number;
  col: string;
  prog: number;
  speed: number;
}

interface Glyph {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  ch: string;
  col: string;
  size: number;
  rot: number;
  vr: number;
  grav: number;
}

interface State {
  L: Layout;
  k: number;
  ox: number;
  oy: number;
  phase: Phase;
  pt: number;
  hold: boolean;
  burst: number;
  heat: number;
  m: number;
  shown: number;
  floorM: number;
  pivoted: boolean;
  hist: number[];
  histT: number;
  sketches: Sketch[];
  wipe: number;
  cheer: number;
  hop: number;
  piv: number;
  scroll: [number, number, number];
  bgX: number;
  bgPh: number;
  bgHas: number;
  bgTX: number;
  bgTY: number;
  bgCol: string;
  pacerX: number;
  pacerDir: number;
  pacerPh: number;
  pacerWalk: number;
  sipT: number;
  glyphs: Glyph[];
  emitT: number;
  clickT: number;
  flash: number;
  shake: number;
  idle: number;
  touched: boolean;
  autoT: number;
  autoHold: boolean;
  lastTenth: number;
  back: HTMLCanvasElement | null;
  front: HTMLCanvasElement | null;
  cyan: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  green: HTMLCanvasElement;
  amber: HTMLCanvasElement;
}

const SIL = '#07080f';
const PEN = ['#2a62c9', '#d23c3c', '#2e9e57', '#2b2f36', '#7a3fc0'];
const CODE = ['#7fdbff', '#c792ea', '#ffcb6b', '#c3e88d', '#f78c6c', '#89ddff'];
const CONF = ['#3dff9a', '#7fdbff', '#ffcb6b', '#ff7ab6', '#ffffff', '#c792ea'];
const GLYPHS = ['{', '}', ';', '()', '=>', '</>', '01', '[]', '&&', '#', '++', '::', '!=', '*'];
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const CELLS = 6;
const TPL_PIVOT = 8;
const TPL_X = 9;
const TPL_STAR = 10;

/* ---------- stage layouts ---------- */

const LANDSCAPE: Layout = {
  W: 1280,
  H: 720,
  floor: 520,
  lightsY: 24,
  win: { x: 70, y: 84, w: 240, h: 196 },
  tv: { x: 382, y: 84, w: 300, h: 168 },
  clock: { x: 912, y: 168, r: 36 },
  board: { x: 762, y: 250, w: 300, h: 190 },
  rack: { x: 1150, y: 170, w: 106, h: 410 },
  desk: { x: 28, y: 432, w: 292, h: 136 },
  mon: { x: 92, y: 300, w: 172, h: 116 },
  lap: { x: 258, y: 386, w: 66, h: 46 },
  lamp: { x: 344, y: 604, top: 330 },
  couch: { x: 362, y: 456, w: 322, h: 180 },
  table: { x: 420, y: 642, w: 232, h: 48 },
  pizza: { x: 18, y: 714 },
  coder: { x: 172, y: 508 },
  guy: { x: 604, y: 553 },
  bg: { x0: 800, x1: 1118, y: 592 },
  pacer: { x0: 712, x1: 950, y: 672 },
  kid: { x: 1184, y: 714 },
};

const PORTRAIT: Layout = {
  W: 720,
  H: 1280,
  floor: 780,
  lightsY: 24,
  win: { x: 40, y: 84, w: 250, h: 206 },
  tv: { x: 330, y: 92, w: 350, h: 196 },
  clock: { x: 208, y: 372, r: 34 },
  board: { x: 282, y: 430, w: 400, h: 206 },
  rack: { x: 30, y: 420, w: 112, h: 390 },
  desk: { x: 18, y: 912, w: 272, h: 132 },
  mon: { x: 70, y: 782, w: 172, h: 116 },
  lap: { x: 228, y: 866, w: 64, h: 46 },
  lamp: { x: 306, y: 1124, top: 846 },
  couch: { x: 334, y: 940, w: 360, h: 180 },
  table: { x: 384, y: 1126, w: 232, h: 48 },
  pizza: { x: 18, y: 1270 },
  coder: { x: 152, y: 988 },
  guy: { x: 594, y: 1037 },
  bg: { x0: 330, x1: 708, y: 784 },
  pacer: { x0: 210, x1: 480, y: 1196 },
  kid: { x: 624, y: 1268 },
};

/* ---------- whiteboard sketch templates (unit square polylines) ---------- */

interface Tpl {
  lines: number[][];
  len: number;
}

const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
const circ = (cx: number, cy: number, r: number, n = 18) => {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) p.push(cx + Math.cos(-Math.PI / 2 + (i / n) * TAU) * r, cy + Math.sin(-Math.PI / 2 + (i / n) * TAU) * r);
  return p;
};
const arrow = (x0: number, y0: number, x1: number, y1: number, hs = 0.07) => {
  const a = Math.atan2(y1 - y0, x1 - x0);
  return [
    [x0, y0, x1, y1],
    [x1 - Math.cos(a - 0.55) * hs, y1 - Math.sin(a - 0.55) * hs, x1, y1, x1 - Math.cos(a + 0.55) * hs, y1 - Math.sin(a + 0.55) * hs],
  ];
};

function mk(lines: number[][]): Tpl {
  let len = 0;
  for (const l of lines) for (let i = 2; i < l.length; i += 2) len += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
  return { lines, len };
}

const TPLS: Tpl[] = (() => {
  const curve: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = 0.16 + (i / 16) * 0.76;
    curve.push(x, 0.84 - 0.7 * Math.pow((x - 0.16) / 0.76, 3));
  }
  const pivot: number[] = [];
  for (let i = 0; i <= 18; i++) {
    const k = i / 18;
    const q = 1 - k;
    pivot.push(q * q * 0.14 + 2 * q * k * 0.12 + k * k * 0.86, q * q * 0.84 + 2 * q * k * 0.12 + k * k * 0.2);
  }
  const net = [
    [0.18, 0.25],
    [0.55, 0.14],
    [0.84, 0.42],
    [0.6, 0.82],
    [0.22, 0.7],
  ];
  const star: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.15 : 0.34;
    star.push(0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r);
  }
  return [
    // 0 flow: box -> box -> box
    mk([rect(0.02, 0.38, 0.26, 0.62), ...arrow(0.27, 0.5, 0.37, 0.5), rect(0.38, 0.38, 0.62, 0.62), ...arrow(0.63, 0.5, 0.73, 0.5), rect(0.74, 0.38, 0.98, 0.62)]),
    // 1 bars
    mk([[0.1, 0.08, 0.1, 0.9, 0.94, 0.9], rect(0.2, 0.68, 0.32, 0.9), rect(0.4, 0.52, 0.52, 0.9), rect(0.6, 0.36, 0.72, 0.9), rect(0.8, 0.14, 0.9, 0.9)]),
    // 2 tree
    mk([rect(0.34, 0.08, 0.66, 0.3), [0.5, 0.3, 0.2, 0.62], [0.5, 0.3, 0.8, 0.62], rect(0.04, 0.62, 0.36, 0.88), rect(0.64, 0.62, 0.96, 0.88)]),
    // 3 hockey stick
    mk([[0.1, 0.08, 0.1, 0.9, 0.94, 0.9], curve, ...arrow(0.86, 0.22, 0.93, 0.13, 0.08)]),
    // 4 cycle
    mk([
      circ(0.5, 0.16, 0.1, 12),
      circ(0.84, 0.5, 0.1, 12),
      circ(0.5, 0.84, 0.1, 12),
      circ(0.16, 0.5, 0.1, 12),
      ...arrow(0.6, 0.22, 0.78, 0.4, 0.06),
      ...arrow(0.78, 0.6, 0.6, 0.78, 0.06),
      ...arrow(0.4, 0.78, 0.22, 0.6, 0.06),
      ...arrow(0.22, 0.4, 0.4, 0.22, 0.06),
    ]),
    // 5 venn
    mk([circ(0.37, 0.5, 0.27), circ(0.63, 0.5, 0.27)]),
    // 6 stack
    mk([rect(0.18, 0.06, 0.82, 0.26), ...arrow(0.5, 0.27, 0.5, 0.38, 0.05), rect(0.18, 0.4, 0.82, 0.6), ...arrow(0.5, 0.61, 0.5, 0.72, 0.05), rect(0.18, 0.74, 0.82, 0.94)]),
    // 7 network
    mk([
      ...net.map(([x, y]) => circ(x, y, 0.08, 10)),
      [0.18, 0.25, 0.55, 0.14],
      [0.55, 0.14, 0.84, 0.42],
      [0.84, 0.42, 0.6, 0.82],
      [0.6, 0.82, 0.22, 0.7],
      [0.22, 0.7, 0.18, 0.25],
      [0.18, 0.25, 0.84, 0.42],
    ]),
    // 8 pivot: a hard turn
    mk([rect(0.04, 0.76, 0.24, 0.94), pivot, ...arrow(0.7, 0.24, 0.9, 0.19, 0.12)]),
    // 9 cross-out
    mk([
      [0.04, 0.08, 0.96, 0.92],
      [0.96, 0.08, 0.04, 0.92],
    ]),
    // 10 circled star
    mk([star, circ(0.5, 0.52, 0.46, 26)]),
  ];
})();

/* ---------- small helpers ---------- */

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
}

function poly(c: CanvasRenderingContext2D, p: number[], w: number) {
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.stroke();
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fill();
}

/** Blend two flat coordinate lists */
function mix(a: number[], b: number[], k: number) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return a.map((v, i) => lerp(v, b[i], k));
}

/** Two-bone reach from (sx, sy) toward (tx, ty); returns elbow and hand */
function reach(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: number) {
  const dx = tx - sx;
  const dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e = a + bend * A;
  return [sx, sy, sx + Math.cos(e) * l1, sy + Math.sin(e) * l1, sx + Math.cos(a) * d, sy + Math.sin(a) * d];
}

/* ---------- whiteboard ---------- */

function cellBox(L: Layout, cell: number): Box {
  const b = L.board;
  if (cell === -1) return { x: b.x + 8, y: b.y + 8, w: b.w - 16, h: b.h - 16 };
  if (cell === -2) {
    const z = Math.min(b.w, b.h) * 0.94;
    return { x: b.x + (b.w - z) / 2, y: b.y + (b.h - z) / 2, w: z, h: z };
  }
  const cw = b.w / 3;
  const ch = b.h / 2;
  const pad = Math.min(cw, ch) * 0.1;
  const col = cell % 3;
  const row = Math.floor(cell / 3);
  return { x: b.x + col * cw + pad, y: b.y + row * ch + pad, w: cw - pad * 2, h: ch - pad * 2 };
}

/** Stroke a template up to prog; returns the pen tip */
function traceSketch(c: CanvasRenderingContext2D | null, L: Layout, sk: Sketch): Pt {
  const tp = TPLS[sk.tpl];
  const bx = cellBox(L, sk.cell);
  let remain = clamp(sk.prog, 0, 1) * tp.len;
  let tip: Pt = { x: bx.x, y: bx.y };
  if (c) c.beginPath();
  for (const l of tp.lines) {
    if (remain <= 0) break;
    let px = bx.x + l[0] * bx.w;
    let py = bx.y + l[1] * bx.h;
    if (c) c.moveTo(px, py);
    tip = { x: px, y: py };
    for (let i = 2; i < l.length; i += 2) {
      const qx = bx.x + l[i] * bx.w;
      const qy = bx.y + l[i + 1] * bx.h;
      const sl = Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
      if (remain >= sl) {
        remain -= sl;
        if (c) c.lineTo(qx, qy);
        px = qx;
        py = qy;
        tip = { x: px, y: py };
      } else {
        const k = sl > 0 ? remain / sl : 1;
        tip = { x: lerp(px, qx, k), y: lerp(py, qy, k) };
        if (c) c.lineTo(tip.x, tip.y);
        remain = 0;
        break;
      }
    }
  }
  if (c) c.stroke();
  return tip;
}

function spawnSketch(s: State) {
  const used = new Set(s.sketches.map((k) => k.cell));
  const free: number[] = [];
  for (let i = 0; i < CELLS; i++) if (!used.has(i)) free.push(i);
  if (!free.length) return false;
  const cell = free[Math.floor(Math.random() * free.length)];
  const have = new Set(s.sketches.map((k) => k.tpl));
  let tpl = Math.floor(Math.random() * 8);
  for (let i = 0; i < 8 && have.has(tpl); i++) tpl = (tpl + 1) % 8;
  s.sketches.push({ cell, tpl, col: PEN[Math.floor(Math.random() * PEN.length)], prog: 0, speed: rand(0.7, 1) });
  return true;
}

/* ---------- baked room ---------- */

function bakeBack(s: State, w: number, h: number, dpr: number) {
  const { cv, c } = layer(s.back, w, h, dpr);
  if (!c) return cv;
  const L = s.L;
  const fyc = s.oy + L.floor * s.k;
  // full-bleed wall and floor so the fitted stage never shows an edge
  const wall = c.createLinearGradient(0, 0, 0, fyc);
  wall.addColorStop(0, '#1a1f36');
  wall.addColorStop(1, '#262a44');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, fyc);
  const fl = c.createLinearGradient(0, fyc, 0, h);
  fl.addColorStop(0, '#2b2129');
  fl.addColorStop(1, '#17121a');
  c.fillStyle = fl;
  c.fillRect(0, fyc, w, h - fyc);

  c.save();
  c.translate(s.ox, s.oy);
  c.scale(s.k, s.k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const rnd = mulberry(23);
  const x0 = -s.ox / s.k;
  const x1 = (w - s.ox) / s.k;
  const yb = (h - s.oy) / s.k;

  // wallpaper stripes and floor planks
  c.fillStyle = 'rgba(255,255,255,0.018)';
  for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) c.fillRect(x, -s.oy / s.k, 18, L.floor + s.oy / s.k);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 2;
  for (let y = L.floor + 16, i = 0; y < yb; y += 20 + i * 5, i++) {
    poly(c, [x0, y, x1, y], 1.5);
    for (let x = x0 + rnd() * 120; x < x1; x += 110 + rnd() * 140) poly(c, [x, y, x, y + 20 + i * 5], 1.5);
  }
  c.fillStyle = '#332b3d';
  c.fillRect(x0, L.floor - 10, x1 - x0, 10);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(x0, L.floor, x1 - x0, 5);

  // string-light wire
  c.strokeStyle = '#0d0e16';
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x <= L.W; x += 8) {
    const y = lightY(L, x);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();

  // window onto the night street
  const wn = L.win;
  c.fillStyle = '#3b3550';
  rr(c, wn.x - 9, wn.y - 9, wn.w + 18, wn.h + 18, 4);
  c.fill();
  const sky = c.createLinearGradient(0, wn.y, 0, wn.y + wn.h);
  sky.addColorStop(0, '#070c22');
  sky.addColorStop(1, '#1d2856');
  c.fillStyle = sky;
  c.fillRect(wn.x, wn.y, wn.w, wn.h);
  c.save();
  c.beginPath();
  c.rect(wn.x, wn.y, wn.w, wn.h);
  c.clip();
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    c.fillRect(wn.x + rnd() * wn.w, wn.y + rnd() * wn.h * 0.6, 1.4, 1.4);
  }
  const mx = wn.x + wn.w * 0.74;
  const my = wn.y + wn.h * 0.24;
  const mg = c.createRadialGradient(mx, my, 4, mx, my, 60);
  mg.addColorStop(0, 'rgba(255,245,215,0.45)');
  mg.addColorStop(1, 'rgba(255,245,215,0)');
  c.fillStyle = mg;
  c.fillRect(mx - 60, my - 60, 120, 120);
  c.fillStyle = '#f4ecd2';
  disc(c, mx, my, 15);
  c.fillStyle = '#1b2550';
  disc(c, mx + 6, my - 4, 13);
  // neighbour's house, a street lamp and a palm
  const gy = wn.y + wn.h * 0.84;
  c.fillStyle = '#0a0e1e';
  c.beginPath();
  c.moveTo(wn.x - 5, gy);
  c.lineTo(wn.x + wn.w * 0.05, wn.y + wn.h * 0.6);
  c.lineTo(wn.x + wn.w * 0.3, wn.y + wn.h * 0.46);
  c.lineTo(wn.x + wn.w * 0.58, wn.y + wn.h * 0.6);
  c.lineTo(wn.x + wn.w * 0.58, gy);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffc861';
  c.fillRect(wn.x + wn.w * 0.12, wn.y + wn.h * 0.64, wn.w * 0.08, wn.h * 0.08);
  c.fillStyle = 'rgba(255,200,97,0.35)';
  c.fillRect(wn.x + wn.w * 0.36, wn.y + wn.h * 0.64, wn.w * 0.08, wn.h * 0.08);
  c.fillStyle = '#0d1226';
  c.fillRect(wn.x, gy, wn.w, wn.h);
  const lx = wn.x + wn.w * 0.66;
  c.strokeStyle = '#05070f';
  poly(c, [lx, gy, lx, wn.y + wn.h * 0.52, lx + 10, wn.y + wn.h * 0.5], 2.5);
  const lg = c.createRadialGradient(lx + 10, wn.y + wn.h * 0.52, 1, lx + 10, wn.y + wn.h * 0.52, 34);
  lg.addColorStop(0, 'rgba(255,214,140,0.8)');
  lg.addColorStop(1, 'rgba(255,214,140,0)');
  c.fillStyle = lg;
  c.fillRect(lx - 30, wn.y + wn.h * 0.52 - 34, 80, 68);
  const px = wn.x + wn.w * 0.9;
  c.strokeStyle = '#04060d';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(px, gy);
  c.quadraticCurveTo(px - 6, wn.y + wn.h * 0.5, px + 4, wn.y + wn.h * 0.3);
  c.stroke();
  const tx = px + 4;
  const ty = wn.y + wn.h * 0.3;
  c.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI + rnd() * 0.2;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * 22, ty + Math.sin(a) * 22 - 6, tx + Math.cos(a) * 38, ty + Math.sin(a) * 30 + 14);
    c.stroke();
  }
  c.restore();
  // blinds pulled half down, mullion and sill
  for (let y = wn.y; y < wn.y + wn.h * 0.26; y += 7) {
    c.fillStyle = '#8f8aa3';
    c.fillRect(wn.x, y, wn.w, 5);
    c.fillStyle = '#5b5670';
    c.fillRect(wn.x, y + 5, wn.w, 2);
  }
  c.fillStyle = '#3b3550';
  c.fillRect(wn.x + wn.w / 2 - 3, wn.y, 6, wn.h);
  c.fillRect(wn.x - 14, wn.y + wn.h + 6, wn.w + 28, 9);

  // wall TV frame
  const tv = L.tv;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  rr(c, tv.x + 6, tv.y + 8, tv.w, tv.h, 6);
  c.fill();
  c.fillStyle = '#0b0c12';
  rr(c, tv.x, tv.y, tv.w, tv.h, 6);
  c.fill();
  c.fillStyle = '#20222c';
  c.fillRect(tv.x + tv.w / 2 - 20, tv.y + tv.h, 40, 4);

  // clock at a little past three
  const ck = L.clock;
  c.fillStyle = '#0e1018';
  disc(c, ck.x, ck.y, ck.r + 4);
  c.fillStyle = '#8e8a99';
  disc(c, ck.x, ck.y, ck.r);
  c.strokeStyle = '#24232d';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    poly(c, [ck.x + Math.cos(a) * ck.r * 0.8, ck.y + Math.sin(a) * ck.r * 0.8, ck.x + Math.cos(a) * ck.r * 0.92, ck.y + Math.sin(a) * ck.r * 0.92], 2);
  }
  const ha = -Math.PI / 2 + ((3 + 7 / 60) / 12) * TAU;
  const ma = -Math.PI / 2 + (7 / 60) * TAU;
  poly(c, [ck.x, ck.y, ck.x + Math.cos(ha) * ck.r * 0.5, ck.y + Math.sin(ha) * ck.r * 0.5], 4);
  poly(c, [ck.x, ck.y, ck.x + Math.cos(ma) * ck.r * 0.75, ck.y + Math.sin(ma) * ck.r * 0.75], 2.5);

  // whiteboard frame, surface and tray
  const b = L.board;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(b.x + 6, b.y + 9, b.w, b.h);
  c.fillStyle = '#8c93a3';
  rr(c, b.x - 7, b.y - 7, b.w + 14, b.h + 14, 5);
  c.fill();
  const bs = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  bs.addColorStop(0, '#c9d1de');
  bs.addColorStop(1, '#aab3c4');
  c.fillStyle = bs;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.beginPath();
  c.moveTo(b.x + b.w * 0.55, b.y);
  c.lineTo(b.x + b.w * 0.7, b.y);
  c.lineTo(b.x + b.w * 0.45, b.y + b.h);
  c.lineTo(b.x + b.w * 0.3, b.y + b.h);
  c.fill();
  c.fillStyle = '#6d7484';
  c.fillRect(b.x - 4, b.y + b.h + 6, b.w + 8, 6);
  ['#2a62c9', '#d23c3c', '#2e9e57'].forEach((col, i) => {
    c.fillStyle = col;
    c.fillRect(b.x + 20 + i * 26, b.y + b.h + 2, 20, 5);
  });

  // server rack body
  const r = L.rack;
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.fillRect(r.x + 8, r.y + 10, r.w, r.h);
  c.fillStyle = '#101219';
  rr(c, r.x, r.y, r.w, r.h, 5);
  c.fill();
  const units = 9;
  const uh = (r.h - 24) / units;
  for (let i = 0; i < units; i++) {
    const uy = r.y + 12 + i * uh;
    c.fillStyle = i % 3 === 2 ? '#191c25' : '#1f232e';
    c.fillRect(r.x + 8, uy + 2, r.w - 16, uh - 4);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    for (let v = 0; v < 5; v++) c.fillRect(r.x + r.w * 0.52 + v * 7, uy + 6, 3, uh - 12);
  }
  c.fillStyle = '#0a0b10';
  c.fillRect(r.x + 6, r.y + r.h, 10, 8);
  c.fillRect(r.x + r.w - 16, r.y + r.h, 10, 8);
  // cables across the floor
  c.strokeStyle = '#0a0a10';
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(r.x + 20 + i * 12, r.y + r.h);
    const tx2 = L.desk.x + L.desk.w * 0.8;
    c.bezierCurveTo(r.x - 40, r.y + r.h + 40 + i * 14, tx2 + 200, L.desk.y + L.desk.h + 30 + i * 10, tx2, L.desk.y + L.desk.h - 4);
    c.stroke();
  }

  // rug under the coffee table
  const tb = L.table;
  c.fillStyle = '#3b1d2b';
  oval(c, tb.x + tb.w / 2, tb.y + tb.h * 0.62, tb.w * 0.95, 42);
  c.strokeStyle = 'rgba(220,150,90,0.25)';
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(tb.x + tb.w / 2, tb.y + tb.h * 0.62, tb.w * 0.8, 32, 0, 0, TAU);
  c.stroke();

  // desk, monitor and laptop
  const d = L.desk;
  c.fillStyle = '#1c1517';
  c.fillRect(d.x + 10, d.y + 14, 10, d.h - 14);
  c.fillRect(d.x + d.w - 20, d.y + 14, 10, d.h - 14);
  c.fillStyle = '#251c1f';
  c.fillRect(d.x + d.w - 90, d.y + 14, 70, d.h * 0.55);
  c.fillStyle = '#4a3730';
  c.fillRect(d.x, d.y, d.w, 14);
  c.fillStyle = '#5e463c';
  c.fillRect(d.x, d.y, d.w, 3);
  const m = L.mon;
  c.fillStyle = '#0a0b0f';
  c.fillRect(m.x + m.w / 2 - 6, m.y + m.h, 12, d.y - m.y - m.h);
  c.fillRect(m.x + m.w / 2 - 30, d.y - 5, 60, 5);
  rr(c, m.x, m.y, m.w, m.h, 5);
  c.fill();
  const lp = L.lap;
  c.fillStyle = '#16181f';
  rr(c, lp.x, lp.y, lp.w, lp.h, 3);
  c.fill();
  c.fillStyle = '#2a2d36';
  c.beginPath();
  c.moveTo(lp.x - 6, d.y);
  c.lineTo(lp.x + lp.w + 4, d.y);
  c.lineTo(lp.x + lp.w, lp.y + lp.h);
  c.lineTo(lp.x, lp.y + lp.h);
  c.fill();
  // mug and cans on the desk
  c.fillStyle = '#d9d2c4';
  rr(c, d.x + 18, d.y - 22, 18, 22, 3);
  c.fill();
  c.strokeStyle = '#d9d2c4';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(d.x + 15, d.y - 11, 6, Math.PI * 0.5, Math.PI * 1.5);
  c.stroke();
  can(c, d.x + 44, d.y, '#33c4dd');
  can(c, m.x + m.w + 6, d.y, '#d6df3e');

  // floor lamp (the shade is lit live)
  const la = L.lamp;
  c.strokeStyle = '#0b0b10';
  poly(c, [la.x, la.top + 30, la.x, la.y - 18], 5);
  poly(c, [la.x - 22, la.y, la.x, la.y - 22, la.x + 22, la.y], 4);

  // couch and coffee table
  const co = L.couch;
  c.fillStyle = '#1a1420';
  c.fillRect(co.x + 18, co.y + co.h - 6, 10, 8);
  c.fillRect(co.x + co.w - 28, co.y + co.h - 6, 10, 8);
  c.fillStyle = '#3a2c48';
  rr(c, co.x + 14, co.y, co.w - 28, co.h * 0.62, 20);
  c.fill();
  c.fillStyle = '#4a395a';
  rr(c, co.x + 20, co.y + co.h * 0.46, co.w - 40, co.h * 0.36, 12);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(co.x + co.w / 2 - 2, co.y + co.h * 0.48, 4, co.h * 0.3);
  c.fillStyle = '#33263f';
  rr(c, co.x, co.y + co.h * 0.3, 38, co.h * 0.68, 14);
  c.fill();
  rr(c, co.x + co.w - 38, co.y + co.h * 0.3, 38, co.h * 0.68, 14);
  c.fill();
  c.fillStyle = 'rgba(255,190,120,0.12)';
  rr(c, co.x + 14, co.y, co.w - 28, 10, 8);
  c.fill();
  // a throw pillow
  c.fillStyle = '#6b8a5a';
  rr(c, co.x + 44, co.y + co.h * 0.24, 54, 44, 12);
  c.fill();

  c.fillStyle = '#2a1f1c';
  c.fillRect(tb.x + 12, tb.y + 10, 9, tb.h - 10);
  c.fillRect(tb.x + tb.w - 21, tb.y + 10, 9, tb.h - 10);
  c.fillStyle = '#4b3529';
  c.fillRect(tb.x, tb.y, tb.w, 12);
  c.fillStyle = '#5f4535';
  c.fillRect(tb.x, tb.y, tb.w, 3);
  // open pizza box with a slice missing
  const pzx = tb.x + 112;
  c.fillStyle = '#9a7146';
  c.beginPath();
  c.moveTo(pzx, tb.y - 6);
  c.lineTo(pzx + 104, tb.y - 6);
  c.lineTo(pzx + 96, tb.y - 72);
  c.lineTo(pzx + 8, tb.y - 72);
  c.fill();
  c.fillStyle = '#b58a57';
  c.beginPath();
  c.moveTo(pzx - 6, tb.y + 1);
  c.lineTo(pzx + 110, tb.y + 1);
  c.lineTo(pzx + 104, tb.y - 8);
  c.lineTo(pzx, tb.y - 8);
  c.fill();
  c.fillStyle = '#e3a43f';
  c.beginPath();
  c.ellipse(pzx + 52, tb.y - 5, 44, 6, 0, 0.5, TAU - 0.1);
  c.lineTo(pzx + 52, tb.y - 5);
  c.fill();
  c.fillStyle = '#a8321f';
  for (let i = 0; i < 6; i++) oval(c, pzx + 24 + i * 11, tb.y - 6 + (i % 2) * 2, 3.5, 1.4);
  can(c, tb.x + 30, tb.y, '#e4573d');
  can(c, tb.x + 54, tb.y, '#33c4dd', true);
  c.restore();
  return cv;
}

function can(c: CanvasRenderingContext2D, x: number, y: number, col: string, tipped = false) {
  c.fillStyle = col;
  if (tipped) {
    rr(c, x, y - 10, 22, 10, 3);
    c.fill();
    c.fillStyle = '#c9ccd4';
    c.fillRect(x + 20, y - 10, 3, 10);
    return;
  }
  rr(c, x, y - 22, 12, 22, 2);
  c.fill();
  c.fillStyle = '#c9ccd4';
  c.fillRect(x, y - 23, 12, 3);
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(x + 2, y - 19, 2, 15);
}

function bakeFront(s: State, w: number, h: number, dpr: number) {
  const { cv, c } = layer(s.front, w, h, dpr);
  if (!c) return cv;
  const L = s.L;
  c.translate(s.ox, s.oy);
  c.scale(s.k, s.k);
  // a leaning tower of pizza boxes and a can on the floor
  const p = L.pizza;
  for (let i = 0; i < 5; i++) {
    const ox = Math.sin(i * 2.1) * 6;
    const y = p.y - (i + 1) * 15;
    c.fillStyle = i % 2 ? '#a77c4c' : '#b88b59';
    c.fillRect(p.x + ox, y, 104, 14);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(p.x + ox, y + 11, 104, 3);
    c.fillStyle = 'rgba(160,40,30,0.55)';
    c.fillRect(p.x + ox + 40, y + 4, 24, 4);
  }
  can(c, p.x + 70, p.y - 75, '#d6df3e');
  can(c, p.x + 124, p.y, '#33c4dd', true);
  return cv;
}

function lightY(L: Layout, x: number) {
  const half = L.W / 2;
  const k = ((x % half) / half) * 2 - 1;
  return L.lightsY + 22 * (1 - k * k);
}

/* ---------- live props ---------- */

function drawCode(c: CanvasRenderingContext2D, b: Box, scroll: number, seed: number, lh: number, heat: number, t: number) {
  c.save();
  c.beginPath();
  c.rect(b.x, b.y, b.w, b.h);
  c.clip();
  c.fillStyle = '#081019';
  c.fillRect(b.x, b.y, b.w, b.h);
  const first = Math.floor(scroll);
  const frac = scroll - first;
  const rows = Math.ceil(b.h / lh) + 1;
  for (let i = 0; i < rows; i++) {
    const n = first + i;
    const y = b.y + (i - frac) * lh + lh * 0.3;
    if (hash(n * 7 + seed) < 0.13) continue;
    let x = b.x + lh * 0.5 + Math.floor(hash(n * 13 + seed) * 4) * lh;
    const segs = 1 + Math.floor(hash(n * 31 + seed) * 4);
    for (let j = 0; j < segs; j++) {
      const sw = (0.6 + hash(n * 17 + j * 5 + seed) * 2.4) * lh;
      if (x + sw > b.x + b.w - 3) break;
      c.fillStyle = CODE[Math.floor(hash(n * 3 + j * 11 + seed) * CODE.length)];
      c.globalAlpha = 0.85;
      c.fillRect(x, y, sw, lh * 0.46);
      x += sw + lh * 0.45;
    }
  }
  c.globalAlpha = 1;
  if (Math.sin(t * (heat > 0.3 ? 14 : 5)) > 0) {
    c.fillStyle = '#e8fff4';
    c.fillRect(b.x + b.w * 0.3, b.y + b.h - lh * 1.1, lh * 0.5, lh * 0.7);
  }
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fillRect(b.x, b.y, b.w, b.h * 0.4);
  c.restore();
}

function drawTV(c: CanvasRenderingContext2D, s: State, t: number) {
  const tv = s.L.tv;
  const b = { x: tv.x + 8, y: tv.y + 8, w: tv.w - 16, h: tv.h - 16 };
  const win = s.phase === 'win';
  const piv = s.phase === 'pivot';
  c.fillStyle = win ? '#0b2116' : piv ? '#24130a' : '#08121a';
  c.fillRect(b.x, b.y, b.w, b.h);
  const accent = win ? '#5dffa8' : piv ? '#ffb347' : '#6fe3c1';
  c.textBaseline = 'top';
  c.textAlign = 'left';
  c.fillStyle = accent;
  c.font = `600 ${Math.round(b.h * 0.1)}px ${FONT}`;
  const label = win ? (Math.sin(t * 10) > -0.3 ? 'BREAKTHROUGH' : '') : piv ? (Math.sin(t * 12) > 0 ? 'PIVOT' : '') : 'COMPRESSION SCORE';
  c.fillText(label, b.x + 10, b.y + 9);
  // the score
  c.textAlign = 'right';
  c.font = `700 ${Math.round(b.h * 0.3)}px ${FONT}`;
  c.fillStyle = '#e9fff6';
  c.fillText((1 + s.shown * 4.2).toFixed(2), b.x + b.w - 10, b.y + b.h * 0.12);
  // history graph
  const gx = b.x + 10;
  const gy = b.y + b.h * 0.86;
  const gw = b.w * 0.5;
  const gh = b.h * 0.5;
  c.strokeStyle = 'rgba(111,227,193,0.22)';
  c.lineWidth = 1;
  for (let i = 1; i < 4; i++) poly(c, [gx, gy - (gh * i) / 4, gx + gw, gy - (gh * i) / 4], 1);
  c.strokeStyle = accent;
  c.lineWidth = 2.5;
  c.beginPath();
  const n = s.hist.length;
  s.hist.forEach((v, i) => {
    const x = gx + (i / Math.max(1, 59)) * gw;
    const y = gy - v * gh;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  c.stroke();
  if (n) {
    c.fillStyle = accent;
    disc(c, gx + ((n - 1) / 59) * gw, gy - s.hist[n - 1] * gh, 3.5);
  }
  // fill bar with the pivot mark
  const bx = b.x + b.w * 0.58;
  const by = b.y + b.h * 0.66;
  const bw = b.w * 0.42 - 10;
  const bh = b.h * 0.14;
  c.fillStyle = 'rgba(255,255,255,0.08)';
  rr(c, bx, by, bw, bh, bh / 2);
  c.fill();
  const g = c.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, '#2e9e57');
  g.addColorStop(0.6, '#6fe3c1');
  g.addColorStop(1, '#f2e36b');
  c.fillStyle = g;
  rr(c, bx, by, Math.max(bh, bw * s.shown), bh, bh / 2);
  c.fill();
  c.fillStyle = s.pivoted || win ? 'rgba(255,179,71,0.4)' : '#ffb347';
  c.fillRect(bx + bw * 0.5 - 1, by - 4, 2, bh + 8);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fillRect(b.x, b.y, b.w, b.h * 0.45);
}

function drawRack(c: CanvasRenderingContext2D, s: State, t: number) {
  const r = s.L.rack;
  const units = 9;
  const uh = (r.h - 24) / units;
  const rate = 3 + s.heat * 14;
  const win = s.phase === 'win';
  for (let i = 0; i < units; i++) {
    const uy = r.y + 12 + i * uh + uh / 2;
    for (let j = 0; j < 4; j++) {
      const x = r.x + 16 + j * 9;
      const on = hash(i * 97 + j * 13 + Math.floor(t * rate + i * 0.37 + j)) > 0.42;
      let col = j === 3 ? '#ffb347' : '#3dff8a';
      if (s.phase === 'pivot') col = j % 2 ? '#ff5a4a' : '#ffb347';
      let a = on ? 1 : 0.15;
      if (win) {
        const wave = Math.sin(t * 12 - i * 0.8);
        a = wave > 0 ? 1 : 0.25;
        col = '#5dffa8';
      }
      c.globalAlpha = a;
      c.fillStyle = col;
      c.fillRect(x, uy - 2, 5, 4);
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.green, r.x + 32, r.y + r.h * 0.5, r.h * 0.45, 0.1 + s.heat * 0.08 + (win ? 0.2 : 0));
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

function drawLights(c: CanvasRenderingContext2D, s: State, t: number) {
  const L = s.L;
  const win = s.phase === 'win';
  c.globalCompositeOperation = 'lighter';
  let i = 0;
  for (let x = 18; x < L.W; x += 44, i++) {
    const y = lightY(L, x) + 6;
    const tw = 0.65 + 0.35 * Math.sin(t * 1.7 + i * 1.9);
    const img = win && (i + Math.floor(t * 10)) % 3 === 0 ? s.green : s.warm;
    glow(c, img, x, y, 16, tw * 0.55);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  i = 0;
  for (let x = 18; x < L.W; x += 44, i++) {
    const y = lightY(L, x) + 6;
    c.fillStyle = win ? CONF[(i + Math.floor(t * 10)) % CONF.length] : '#ffd99a';
    disc(c, x, y, 3.2);
  }
}

function drawBoard(c: CanvasRenderingContext2D, s: State) {
  const L = s.L;
  const b = L.board;
  c.save();
  c.beginPath();
  if (s.wipe >= 0) {
    const ex = b.x + s.wipe * b.w;
    c.rect(ex, b.y, b.x + b.w - ex, b.h);
  } else c.rect(b.x, b.y, b.w, b.h);
  c.clip();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const sk of s.sketches) {
    c.strokeStyle = sk.col;
    c.lineWidth = sk.cell < 0 ? 5 : 3;
    traceSketch(c, L, sk);
  }
  c.restore();
  if (s.wipe >= 0) {
    const ex = b.x + s.wipe * b.w;
    // marker ghosting behind the eraser
    c.fillStyle = 'rgba(120,130,150,0.18)';
    c.fillRect(b.x, b.y, ex - b.x, b.h);
  }
}

/* ---------- the developers ---------- */

function figure(c: CanvasRenderingContext2D, x: number, y: number, k: number, dir: number, rim: string, rdx: number, rdy: number, body: (col: string) => void) {
  c.save();
  c.translate(x, y);
  c.scale(k * dir, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.save();
  c.translate(rdx, rdy);
  body(rim);
  c.restore();
  body(SIL);
}

function drawCoder(c: CanvasRenderingContext2D, s: State, t: number) {
  const P = s.L.coder;
  const heat = s.heat;
  const ch = s.cheer;
  const yb = -s.hop * 16 * ch;
  const lift = s.piv;
  const j1 = Math.sin(t * 33) * 2.5 * heat;
  const j2 = Math.sin(t * 29 + 1.3) * 2.5 * heat;
  const armL = mix([-36, -96, -62, -64, -26, -78 + j1], [-36, -100, -64, -152, -50, -200], ch);
  const armR = mix([36, -96, 62, -64, 26, -78 + j2], [36, -100, 64, -152, 50, -200], ch);
  const hx = Math.sin(t * 1.3) * 2 + Math.sin(t * 9) * 1.4 * heat;
  const hy = -116 - lift * 12 - ch * 10;
  figure(c, P.x, P.y, 1.15, 1, '#55c8ff', 0, -2.5, (col) => {
    c.fillStyle = c.strokeStyle = col;
    c.save();
    c.translate(0, yb);
    poly(c, armL, 15);
    poly(c, armR, 15);
    oval(c, 0, -62, 44, 50);
    oval(c, 0, -94 - lift * 4, 48, 22);
    oval(c, hx, hy, 22, 25);
    // hood peak
    c.beginPath();
    c.moveTo(hx - 12, hy - 18);
    c.lineTo(hx + 3, hy - 32);
    c.lineTo(hx + 14, hy - 16);
    c.fill();
    c.restore();
    // the chair stays put
    rr(c, -36, -76, 72, 68, 14);
    c.fill();
    c.fillRect(-4, -10, 8, 46);
    poly(c, [-36, 52, 0, 38, 36, 52], 6);
    disc(c, -36, 54, 4);
    disc(c, 36, 54, 4);
    disc(c, 0, 50, 4);
  });
  c.restore();
}

function drawCouchGuy(c: CanvasRenderingContext2D, s: State, t: number) {
  const L = s.L;
  const P = L.guy;
  const k = 1.15;
  const ch = s.cheer;
  const lean = s.heat * 0.6 + s.piv * 0.5;
  const sipK = clamp(Math.sin(clamp(s.sipT / 1.4, 0, 1) * Math.PI) * 1.4, 0, 1) * (1 - s.piv);
    const footX = (L.table.x + 70 - P.x) / k;
  const footY = (L.table.y - 6 - P.y) / k;
  const hopY = -s.hop * 16 * ch;
  const hip = mix([0, 0], [4, -6 + hopY], ch);
  const sh = mix([24 - lean * 26, -72 + lean * 6], [hip[0] - 4, hip[1] - 78], ch);
  const head = mix([30 - lean * 30, -101 + lean * 8], [sh[0] - 2, sh[1] - 28], ch);
  const knee = mix([-56, -10], [-50, -16 + hopY * 0.5], ch);
  const foot = mix([footX, footY], [footX + 8, footY], ch);
  const far = mix([sh[0], sh[1], 60, -84, 82, -72], [sh[0], sh[1], sh[0] + 26, sh[1] - 36, sh[0] + 44, sh[1] - 76], ch);
  let beer = mix([sh[0], sh[1], 4 - lean * 10, -36, -18 - lean * 14, -50], [sh[0], sh[1], -14 - lean * 10, -62, head[0] - 14, head[1] + 6], sipK);
  beer = mix(beer, [sh[0], sh[1], sh[0] - 26, sh[1] - 36, sh[0] - 40, sh[1] - 78], ch);
  figure(c, P.x, P.y, k, 1, '#ffad66', 2.2, -1.6, (col) => {
    c.fillStyle = c.strokeStyle = col;
    poly(c, [hip[0] + 6, hip[1] - 2, knee[0] + 4, knee[1] - 4, foot[0] + 10, foot[1] - 2], 14);
    poly(c, [hip[0], hip[1], knee[0], knee[1], foot[0], foot[1]], 15);
    oval(c, foot[0] - 4, foot[1] - 2, 11, 5);
    poly(c, far, 11);
    poly(c, [hip[0], hip[1], sh[0], sh[1]], 28);
    oval(c, lerp(hip[0], sh[0], 0.55), lerp(hip[1], sh[1], 0.55), 17, 30, Math.atan2(sh[0] - hip[0], -(sh[1] - hip[1])) * -1);
    disc(c, head[0], head[1], 18);
    // beanie with a pom
    c.beginPath();
    c.arc(head[0] + 1, head[1] - 4, 19, Math.PI, TAU);
    c.fill();
    disc(c, head[0] + 2, head[1] - 25, 6);
    poly(c, beer, 11);
  });
  // the bottle
  const bx = beer[4];
  const by = beer[5];
  const ang = lerp(lerp(-0.25, -2.1, sipK), 0.15, ch);
  c.save();
  c.translate(bx, by);
  c.rotate(ang);
  c.fillStyle = '#7a3f10';
  rr(c, -5, -24, 10, 26, 3);
  c.fill();
  c.fillRect(-2.5, -34, 5, 12);
  c.fillStyle = 'rgba(255,190,110,0.55)';
  c.fillRect(-3, -21, 2, 18);
  c.fillStyle = '#e8d9b0';
  c.fillRect(-5, -14, 10, 6);
  c.restore();
  c.restore();
}

function drawPacer(c: CanvasRenderingContext2D, s: State, t: number) {
  const P = s.L.pacer;
  const ph = s.pacerPh;
  const st = s.pacerWalk;
  const ch = s.cheer;
  const hop = s.hop * 36 * ch;
  const bob = Math.abs(Math.sin(ph)) * 3 * st;
  const hy = -84 - bob - hop;
  const fA = [Math.sin(ph) * 18 * st, -Math.max(0, Math.cos(ph)) * 7 * st - hop];
  const fB = [-Math.sin(ph) * 18 * st, -Math.max(0, -Math.cos(ph)) * 7 * st - hop];
  const sh = [8, hy - 64];
  const g = s.heat * (1 - s.piv);
  let near = mix([sh[0], sh[1], 30, hy - 30, 26, hy - 80], [sh[0], sh[1], 36, hy - 48, 54 + Math.sin(t * 7) * 8, hy - 80 + Math.cos(t * 7) * 10], g);
  let farA = mix([-4, sh[1], -22, hy - 36, -12, hy - 12], [-4, sh[1], -24, hy - 40, -30 + Math.sin(t * 5) * 6, hy - 22], g);
  near = mix(near, [sh[0], sh[1], 36, hy - 104, 16, hy - 116], s.piv);
  farA = mix(farA, [-4, sh[1], -24, hy - 102, 4, hy - 118], s.piv);
  near = mix(near, [sh[0], sh[1], 30, hy - 102, 48, hy - 144], ch);
  farA = mix(farA, [-4, sh[1], -20, hy - 102, -34, hy - 144], ch);
  figure(c, s.pacerX, P.y, 1.2, s.pacerDir, '#93a8ff', -2, -2, (col) => {
    c.fillStyle = c.strokeStyle = col;
    poly(c, farA, 13);
    for (const f of [fB, fA]) {
      poly(c, [0, hy, (f[0] + 0) / 2 + 5, (hy + f[1]) / 2, f[0], f[1]], 18);
      oval(c, f[0] + 5, f[1] - 3, 11, 5);
    }
    oval(c, 2, hy - 34, 32, 44);
    oval(c, 4, hy - 64, 30, 14);
    c.fillRect(2, hy - 82, 12, 16);
    disc(c, 9, hy - 96, 20);
    oval(c, 6, hy - 106, 22, 13);
    c.fillRect(-12, hy - 106, 10, 14);
    poly(c, near, 13);
  });
  // glasses glint
  c.strokeStyle = '#bfe9ff';
  c.lineWidth = 2;
  poly(c, [19, hy - 99, 30, hy - 99], 2);
  c.fillStyle = 'rgba(191,233,255,0.5)';
  disc(c, 26, hy - 99, 3);
  c.restore();
}

function drawBoardGuy(c: CanvasRenderingContext2D, s: State) {
  const P = s.L.bg;
  const k = 1.3;
  const dir = -1;
  const ch = s.cheer;
  const hop = s.hop * 34 * ch;
  const st = clamp(s.bgPh > 0 ? 1 : 0, 0, 1);
  const ph = s.bgPh;
  const shLocal = [2, -154 - hop];
  // reach for the pen tip, rising onto the toes when it is high
  const tx = (s.bgTX - s.bgX) / (k * dir);
  const ty = (s.bgTY - P.y) / k;
  const dist = Math.hypot(tx - shLocal[0], ty - shLocal[1]);
  const rise = clamp(dist - 98, 0, 14) * s.bgHas * (1 - ch);
  const hy = -96 - hop - rise;
  const sh = [2, hy - 58];
  const ik = reach(sh[0], sh[1], tx, ty, 50, 50, -1);
  let arm = mix([sh[0], sh[1], 10, sh[1] + 30, 18, sh[1] + 56], ik, s.bgHas);
  arm = mix(arm, [sh[0], sh[1], 24, sh[1] - 38, 42, sh[1] - 80], ch);
  const other = mix([0, sh[1], -8, sh[1] + 32, -2, sh[1] + 60], [0, sh[1], -20, sh[1] - 38, -38, sh[1] - 80], ch);
  const sw = Math.sin(ph) * 12 * st * (s.bgHas < 0.5 ? 1 : 0.6);
  figure(c, s.bgX, P.y, k, dir, '#d6e4ff', 1.8, -1.6, (col) => {
    c.fillStyle = c.strokeStyle = col;
    poly(c, other, 10);
    poly(c, [0, hy, -2 - sw * 0.5, hy / 2, -6 - sw, -hop - rise * 0.3], 13);
    poly(c, [0, hy, 4 + sw * 0.5, hy / 2, 6 + sw, -hop], 13);
    oval(c, -2 - sw, -3 - hop - rise * 0.3, 10, 4.5);
    oval(c, 10 + sw, -3 - hop, 10, 4.5);
    poly(c, [0, hy, sh[0], sh[1]], 24);
    oval(c, 2, hy - 30, 15, 31);
    c.fillRect(0, sh[1] - 16, 8, 14);
    disc(c, 6, sh[1] - 26, 17);
    // spiky hair
    c.beginPath();
    c.moveTo(-10, sh[1] - 32);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.05 + i * 0.16);
      c.lineTo(6 + Math.cos(a) * 25, sh[1] - 28 + Math.sin(a) * 25);
      c.lineTo(6 + Math.cos(a + 0.08) * 15, sh[1] - 28 + Math.sin(a + 0.08) * 15);
    }
    c.lineTo(22, sh[1] - 30);
    c.fill();
    poly(c, arm, 10);
  });
  // marker
  c.save();
  c.translate(arm[4], arm[5]);
  c.rotate(Math.atan2(arm[5] - arm[3], arm[4] - arm[2]));
  c.fillStyle = '#e8e8ee';
  c.fillRect(-2, -3, 13, 6);
  c.fillStyle = s.bgCol;
  c.fillRect(9, -2.5, 5, 5);
  c.restore();
  c.restore();
}

function drawKid(c: CanvasRenderingContext2D, s: State, t: number) {
  const P = s.L.kid;
  const ch = s.cheer;
  const hop = s.hop * 14 * ch;
  const j = Math.sin(t * 31) * 2 * s.heat;
  c.save();
  c.translate(P.x, P.y);
  c.scale(-1, 1);
  c.fillStyle = '#4a2f5c';
  oval(c, 0, -26, 66, 28);
  oval(c, -10, -46, 46, 24);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  oval(c, -14, -56, 30, 9);
  c.restore();
  const hipY = -54 - hop;
  const arm = mix([2, hipY - 34, 18, hipY - 12, 34, hipY - 14 + j], [2, hipY - 34, 22, hipY - 66, 36, hipY - 100], ch);
  const arm2 = mix([-2, hipY - 34, 12, hipY - 10, 28, hipY - 12 - j], [-2, hipY - 34, -18, hipY - 66, -30, hipY - 100], ch);
  figure(c, P.x, P.y, 1, -1, '#5fe6ff', 1.6, -1.6, (col) => {
    c.fillStyle = c.strokeStyle = col;
    poly(c, arm2, 9);
    oval(c, 22, hipY + 4, 30, 10);
    poly(c, [4, hipY, 0, hipY - 40], 26);
    disc(c, 6, hipY - 60, 16);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.9 + i * 0.2);
      disc(c, 4 + Math.cos(a) * 15, hipY - 64 + Math.sin(a) * 14, 7.5);
    }
    poly(c, arm, 9);
  });
  // laptop on the lap, screen toward the kid
  c.fillStyle = '#20232c';
  c.fillRect(14, hipY - 4, 32, 4);
  c.strokeStyle = '#2a2e3a';
  poly(c, [44, hipY - 2, 52, hipY - 30], 4);
  c.strokeStyle = '#7fe8ff';
  poly(c, [41, hipY - 4, 49, hipY - 30], 1.6);
  c.restore();
  c.globalCompositeOperation = 'lighter';
  glow(c, s.cyan, P.x - 34, P.y + hipY - 30, 46, 0.35 + s.heat * 0.25);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/* ---------- beats ---------- */

function setPhase(s: State, p: Phase) {
  s.phase = p;
  s.pt = 0;
}

function emitGlyph(s: State, x: number, y: number, confetti: boolean) {
  if (s.glyphs.length > 220) return;
  const a = confetti ? rand(-Math.PI * 0.92, -Math.PI * 0.08) : rand(-Math.PI * 0.65, -Math.PI * 0.35);
  const v = confetti ? rand(200, 560) : rand(20, 50);
  const max = confetti ? rand(1.6, 2.8) : rand(0.8, 1.3);
  s.glyphs.push({
    x,
    y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    life: max,
    max,
    ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    col: confetti ? CONF[Math.floor(Math.random() * CONF.length)] : CODE[Math.floor(Math.random() * CODE.length)],
    size: confetti ? [16, 20, 26][Math.floor(Math.random() * 3)] : 12,
    rot: confetti ? rand(-0.5, 0.5) : 0,
    vr: confetti ? rand(-4, 4) : 0,
    grav: confetti ? 520 : -10,
  });
}

function breakthrough(s: State, env: SceneEnv) {
  setPhase(s, 'win');
  s.flash = 1;
  s.shake = 1;
  s.m = 1;
  s.sketches.push({ cell: -2, tpl: TPL_STAR, col: '#d9a21b', prog: 0, speed: 1.4 });
  const L = s.L;
  const srcs: Pt[] = [
    { x: L.tv.x + L.tv.w / 2, y: L.tv.y + L.tv.h / 2 },
    { x: L.mon.x + L.mon.w / 2, y: L.mon.y + L.mon.h / 2 },
    { x: L.board.x + L.board.w / 2, y: L.board.y + 20 },
    { x: L.kid.x - 40, y: L.kid.y - 80 },
  ];
  for (let i = 0; i < 96; i++) {
    const p = srcs[i % srcs.length];
    emitGlyph(s, p.x + rand(-30, 30), p.y + rand(-20, 20), true);
  }
  const bus = env.audio();
  if (bus) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(bus, f, { type: 'square', attack: 0.005, decay: 0.32, gain: 0.035, delay: i * 0.08 }));
    tone(bus, 130.8, { type: 'triangle', attack: 0.01, decay: 1.2, gain: 0.08 });
    noise(bus, { duration: 0.6, gain: 0.06, freq: 3000, q: 0.5, type: 'highpass' });
  }
}

function pivot(s: State, env: SceneEnv) {
  setPhase(s, 'pivot');
  s.sketches.push({ cell: -1, tpl: TPL_X, col: '#d23c3c', prog: 0, speed: 1.6 });
  s.shake = 0.4;
  const bus = env.audio();
  if (bus) {
    tone(bus, 440, { type: 'triangle', attack: 0.01, decay: 0.45, gain: 0.08, glideTo: 220 });
    tone(bus, 330, { type: 'triangle', attack: 0.01, decay: 0.6, gain: 0.06, glideTo: 150, delay: 0.25 });
  }
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  s.L = h > w * 1.1 ? PORTRAIT : LANDSCAPE;
  const L = s.L;
  s.k = Math.min(w / L.W, h / L.H);
  s.ox = (w - L.W * s.k) / 2;
  // sit the stage on the bottom so any spare height becomes wall and ceiling
  s.oy = h - L.H * s.k;
  s.bgX = clamp(s.bgX || L.bg.x1, L.bg.x0, L.bg.x1);
  s.pacerX = clamp(s.pacerX || (L.pacer.x0 + L.pacer.x1) / 2, L.pacer.x0, L.pacer.x1);
  s.back = bakeBack(s, w, h, dpr);
  s.front = bakeFront(s, w, h, dpr);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 3,
    init: () => ({
      L: LANDSCAPE,
      k: 1,
      ox: 0,
      oy: 0,
      phase: 'hack',
      pt: 0,
      hold: false,
      burst: 0,
      heat: 0,
      m: 0.3,
      shown: 0.3,
      floorM: 0,
      pivoted: false,
      hist: Array.from({ length: 60 }, (_, i) => 0.3 * (i / 59) + Math.sin(i * 0.7) * 0.02),
      histT: 0,
      sketches: [
        { cell: 0, tpl: 0, col: PEN[0], prog: 1, speed: 1 },
        { cell: 4, tpl: 3, col: PEN[2], prog: 1, speed: 1 },
      ],
      wipe: -1,
      cheer: 0,
      hop: 0,
      piv: 0,
      scroll: [0, 40, 90],
      bgX: 0,
      bgPh: 0,
      bgHas: 0,
      bgTX: 0,
      bgTY: 0,
      bgCol: PEN[0],
      pacerX: 0,
      pacerDir: 1,
      pacerPh: 0,
      pacerWalk: 1,
      sipT: 3,
      glyphs: [],
      emitT: 0,
      clickT: 0,
      flash: 0,
      shake: 0,
      idle: 0,
      touched: false,
      autoT: 0.3,
      autoHold: false,
      lastTenth: 3,
      back: null,
      front: null,
      cyan: glowSprite(128, [
        [0, 'rgba(120,220,255,0.7)'],
        [0.45, 'rgba(70,170,255,0.22)'],
        [1, 'rgba(40,120,255,0)'],
      ]),
      warm: glowSprite(96, [
        [0, 'rgba(255,214,150,0.85)'],
        [0.4, 'rgba(255,170,90,0.25)'],
        [1, 'rgba(255,150,60,0)'],
      ]),
      green: glowSprite(96, [
        [0, 'rgba(140,255,190,0.8)'],
        [0.4, 'rgba(60,230,130,0.25)'],
        [1, 'rgba(40,200,100,0)'],
      ]),
      amber: glowSprite(96, [
        [0, 'rgba(255,190,110,0.7)'],
        [1, 'rgba(255,140,60,0)'],
      ]),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      const L = s.L;
      s.pt += dt;
      s.idle += dt;
      const auto = !env.interactive || s.idle > (s.touched ? 8 : 3);
      if (auto) {
        s.autoT -= dt;
        if (s.autoT <= 0) {
          s.autoHold = !s.autoHold;
          s.autoT = s.autoHold ? rand(1.8, 3.2) : rand(0.6, 1.3);
        }
      } else s.autoHold = false;
      s.burst = Math.max(0, s.burst - dt);
      const acting = s.phase === 'hack' && (s.hold || s.burst > 0 || (auto && s.autoHold));
      s.heat = damp(s.heat, acting ? 1 : s.phase === 'win' ? 0.6 : 0, acting ? 7 : 3, dt);
      const bus = env.audio();

      switch (s.phase) {
        case 'hack': {
          if (acting) s.m += dt * (s.pivoted ? 0.11 : 0.095);
          else s.m = Math.max(s.floorM, s.m - dt * 0.012);
          if (!s.pivoted && s.m >= 0.5) pivot(s, env);
          else if (s.m >= 1) breakthrough(s, env);
          // sketch while hacking: one at a time, into a free cell
          if (acting && !s.sketches.some((k) => k.prog < 1)) spawnSketch(s);
          break;
        }
        case 'pivot': {
          s.m = damp(s.m, 0.4, 3, dt);
          if (s.pt > 0.95 && s.pt < 1.5 && s.wipe < 0 && !s.pivoted) s.wipe = 0;
          if (s.pt > 2.0 && !s.pivoted) {
            s.pivoted = true;
            s.floorM = 0.4;
            s.sketches.push({ cell: 0, tpl: TPL_PIVOT, col: '#d23c3c', prog: 0, speed: 1.5 });
            if (bus) tone(bus, 520, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.06, glideTo: 780 });
          }
          if (s.pt > 2.6) setPhase(s, 'hack');
          break;
        }
        case 'win':
          s.m = 1;
          if (s.pt < 1.2 && Math.random() < dt * 30) emitGlyph(s, L.tv.x + rand(0, L.tv.w), L.tv.y + L.tv.h * 0.5, true);
          if (s.pt > 4.4) setPhase(s, 'settle');
          break;
        case 'settle':
          s.m = damp(s.m, 0, 3, dt);
          if (s.wipe < 0 && s.sketches.length) s.wipe = 0;
          if (s.pt > 1.6 && s.wipe < 0) {
            s.m = 0;
            s.pivoted = false;
            s.floorM = 0;
            setPhase(s, 'hack');
          }
          break;
      }
      s.m = clamp(s.m, 0, 1);
      s.shown = damp(s.shown, s.m, 8, dt);
      s.histT += dt;
      if (s.histT > 0.1) {
        s.histT = 0;
        s.hist.push(s.shown + (acting ? rand(-0.012, 0.012) : 0));
        if (s.hist.length > 60) s.hist.shift();
      }
      const tenth = Math.floor(s.m * 10);
      if (tenth > s.lastTenth && bus && s.phase === 'hack') tone(bus, 440 + tenth * 60, { type: 'sine', attack: 0.004, decay: 0.12, gain: 0.04 });
      s.lastTenth = tenth;

      // the wipe, and every sketch drawing itself
      if (s.wipe >= 0) {
        s.wipe += dt * 1.25;
        if (s.wipe >= 1) {
          s.wipe = -1;
          s.sketches = [];
        }
      }
      const speedK = acting ? 1.5 : 0.35;
      for (const sk of s.sketches) if (sk.prog < 1) sk.prog = Math.min(1, sk.prog + dt * sk.speed * (sk.cell < 0 ? 1.4 : speedK) / Math.max(0.6, TPLS[sk.tpl].len / 3));

      // the whiteboard guy follows the pen (or the eraser)
      const b = L.board;
      let target: Pt | null = null;
      if (s.wipe >= 0) target = { x: b.x + s.wipe * b.w, y: b.y + b.h * (0.5 + 0.32 * Math.sin(t * 9)) };
      else {
        const sk = s.sketches.find((k) => k.prog < 1);
        if (sk) {
          target = traceSketch(null, L, sk);
          s.bgCol = sk.col;
        }
      }
      s.bgHas = damp(s.bgHas, target ? 1 : 0, 9, dt);
      if (target) {
        s.bgTX = target.x;
        s.bgTY = target.y;
      }
      const want = clamp(target ? target.x + 66 : L.bg.x1 - 10, L.bg.x0, L.bg.x1);
      const nx = damp(s.bgX, want, target ? 4 : 1.2, dt);
      const v = Math.abs(nx - s.bgX) / Math.max(dt, 1e-3);
      s.bgPh = v > 12 ? s.bgPh + dt * clamp(v * 0.06, 2, 10) : 0;
      s.bgX = nx;

      // the pacer
      const paceStop = s.phase === 'pivot' || s.phase === 'win';
      s.pacerWalk = damp(s.pacerWalk, paceStop ? 0 : 1, 6, dt);
      const pv = (55 + s.heat * 75) * s.pacerWalk;
      s.pacerX += s.pacerDir * pv * dt;
      if (s.pacerX > L.pacer.x1) {
        s.pacerX = L.pacer.x1;
        s.pacerDir = -1;
      } else if (s.pacerX < L.pacer.x0) {
        s.pacerX = L.pacer.x0;
        s.pacerDir = 1;
      }
      s.pacerPh += pv * dt * 0.075;

      // the couch sips
      s.sipT -= dt;
      if (s.sipT < -rand(3, 6)) s.sipT = 1.4;

      // envelopes for the beats
      const winE = s.phase === 'win' ? clamp(s.pt / 0.2, 0, 1) * clamp((4.4 - s.pt) / 0.6, 0, 1) : 0;
      s.cheer = damp(s.cheer, winE, 12, dt);
      s.hop = s.phase === 'win' ? Math.abs(Math.sin(s.pt * 7.5)) : damp(s.hop, 0, 6, dt);
      s.piv = damp(s.piv, s.phase === 'pivot' ? 1 : 0, 6, dt);

      // code scrolls on every screen; keyboards spit glyphs while hacking
      const sp = 0.6 + s.heat * 14;
      s.scroll[0] += dt * sp;
      s.scroll[1] += dt * sp * 0.8;
      s.scroll[2] += dt * sp * 1.1;
      if (acting) {
        s.emitT -= dt;
        if (s.emitT <= 0) {
          s.emitT = rand(0.05, 0.12);
          const which = Math.floor(Math.random() * 3);
          const p = which === 0 ? { x: L.coder.x + rand(-30, 30), y: L.desk.y - 6 } : which === 1 ? { x: L.lap.x + L.lap.w / 2, y: L.lap.y } : { x: L.kid.x - 40, y: L.kid.y - 66 };
          emitGlyph(s, p.x, p.y, false);
        }
        s.clickT -= dt;
        if (bus && s.clickT <= 0) {
          s.clickT = rand(0.035, 0.1);
          noise(bus, { duration: 0.02, gain: 0.05, freq: rand(2600, 5200), q: 3, type: 'bandpass' });
        }
      }
      for (const g of s.glyphs) {
        g.life -= dt;
        g.vy += g.grav * dt;
        g.vx *= Math.exp(-0.8 * dt);
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.rot += g.vr * dt;
      }
      s.glyphs = s.glyphs.filter((g) => g.life > 0 && g.y < L.H + 60);
      s.flash = Math.max(0, s.flash - dt * 2.5);
      s.shake = Math.max(0, s.shake - dt * 2.5);
      if (env.reducedMotion && (acting || s.phase !== 'hack' || s.glyphs.length || s.wipe >= 0 || s.sketches.some((k) => k.prog < 1))) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const L = s.L;
      ctx.save();
      if (s.shake > 0.02 && !env.reducedMotion) {
        const a = s.shake * s.shake * 7 * s.k;
        ctx.translate(Math.sin(t * 61) * a, Math.cos(t * 47) * a);
      }
      if (s.back) ctx.drawImage(s.back, 0, 0, w, h);
      ctx.save();
      ctx.translate(s.ox, s.oy);
      ctx.scale(s.k, s.k);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // screens and the board
      drawTV(ctx, s, t);
      drawCode(ctx, { x: L.mon.x + 6, y: L.mon.y + 6, w: L.mon.w - 12, h: L.mon.h - 12 }, s.scroll[0], 11, 8, s.heat, t);
      drawCode(ctx, { x: L.lap.x + 4, y: L.lap.y + 4, w: L.lap.w - 8, h: L.lap.h - 8 }, s.scroll[1], 57, 5, s.heat, t + 0.3);
      drawBoard(ctx, s);
      drawRack(ctx, s, t);

      // light pools
      ctx.globalCompositeOperation = 'lighter';
      const sg = 0.4 + s.heat * 0.25 + (s.phase === 'win' ? 0.3 : 0);
      glow(ctx, s.cyan, L.mon.x + L.mon.w / 2, L.mon.y + L.mon.h / 2, L.mon.w * 1.1, sg);
      glow(ctx, s.phase === 'pivot' ? s.amber : s.phase === 'win' ? s.green : s.cyan, L.tv.x + L.tv.w / 2, L.tv.y + L.tv.h / 2, L.tv.w * 0.95, 0.3 + s.heat * 0.15);
      glow(ctx, s.warm, L.lamp.x, L.lamp.top + 20, 190, 0.55);
      glow(ctx, s.warm, L.lamp.x, L.lamp.y, 120, 0.18);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // lamp shade
      ctx.fillStyle = '#e8b56c';
      ctx.beginPath();
      ctx.moveTo(L.lamp.x - 22, L.lamp.top);
      ctx.lineTo(L.lamp.x + 22, L.lamp.top);
      ctx.lineTo(L.lamp.x + 32, L.lamp.top + 36);
      ctx.lineTo(L.lamp.x - 32, L.lamp.top + 36);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.6)';
      ctx.fillRect(L.lamp.x - 30, L.lamp.top + 33, 60, 3);
      drawLights(ctx, s, t);

      // the team, back to front
      drawBoardGuy(ctx, s);
      drawCoder(ctx, s, t);
      drawCouchGuy(ctx, s, t);
      drawPacer(ctx, s, t);
      drawKid(ctx, s, t);
      ctx.restore();
      if (s.front) ctx.drawImage(s.front, 0, 0, w, h);

      // glyphs: typing sparks and the code confetti
      ctx.save();
      ctx.translate(s.ox, s.oy);
      ctx.scale(s.k, s.k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let font = 0;
      for (const g of s.glyphs) {
        if (g.size !== font) {
          font = g.size;
          ctx.font = `700 ${font}px ${FONT}`;
        }
        ctx.globalAlpha = clamp(g.life / Math.min(0.6, g.max), 0, 1) * (g.grav < 0 ? 0.8 : 1);
        ctx.fillStyle = g.col;
        if (g.rot) {
          ctx.save();
          ctx.translate(g.x, g.y);
          ctx.rotate(g.rot);
          ctx.fillText(g.ch, 0, 0);
          ctx.restore();
        } else ctx.fillText(g.ch, g.x, g.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.restore();

      // night grade, and the breakthrough flash
      const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(5,6,18,0)');
      vg.addColorStop(1, 'rgba(5,6,18,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      if (s.flash > 0.02) {
        ctx.fillStyle = `rgba(210,255,230,${(s.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => {
      s.touched = true;
      s.idle = 0;
      s.hold = true;
      s.burst = 0.4;
      env.audio();
    },
    onPointerUp: (s) => {
      s.hold = false;
      s.idle = 0;
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      s.touched = true;
      s.idle = 0;
      if (down) {
        s.hold = true;
        if (!e.repeat) s.burst = 0.4;
        env.audio();
      } else s.hold = false;
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.back, s.front, s.cyan, s.warm, s.green, s.amber);
      s.back = s.front = null;
    },
  });
