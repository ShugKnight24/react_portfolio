import {
  clamp,
  createCanvasScene,
  damp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  noise,
  rand,
  tone,
  TAU,
} from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Baku to Detroit: a six panel comic of the trip from the Caspian to Motor City.
 * Polish over the original: panels ink in one after another (paper rim traced, then the
 * art wiped in behind a brush stroke), static art is cached per panel and size so a frame
 * is a few drawImage calls plus small live layers (sea shimmer, a plane with its contrail,
 * twinkling windows, a barbell rep, phosphor code rain, a typing monitor). Hover or tap
 * brings a panel forward with a thicker ink border and warmer light while the rest dim.
 */

type Ctx = CanvasRenderingContext2D;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Light {
  x: number;
  y: number;
  s: number;
  ph: number;
  rate: number;
}

interface RainCol {
  x: number;
  y: number;
  speed: number;
  len: number;
  chars: string[];
  swap: number;
}

interface Panel {
  rect: Rect;
  back: HTMLCanvasElement | null;
  front: HTMLCanvasElement | null;
  focus: number;
  lights: Light[];
  rain: RainCol[];
  lines: number[];
  fs: number;
  label: string;
  cap: string[];
}

interface State {
  panels: Panel[];
  /** Reveal clock */
  age: number;
  /** Ambient clock, frozen under reduced motion */
  at: number;
  pinned: number;
  lastHit: number;
  anyFocus: number;
  compact: boolean;
  order: number[];
}

interface PanelDef {
  label: string;
  short: string;
  caption: string;
  tag: string;
  rot: number;
  back(c: Ctx, w: number, h: number, p: Panel, rng: () => number): void;
  front?(c: Ctx, w: number, h: number, p: Panel, rng: () => number): void;
  live?(c: Ctx, w: number, h: number, p: Panel, at: number): void;
}

const BG = '#07060f';
const INK = '#0b0a10';
const PAPER = '#f6ecd2';
const YELLOW = '#ffd84d';
const PHOS = '#5dffb0';

const REVEAL_DELAY = 0.2;
const STAGGER = 0.3;
const REVEAL_DUR = 0.85;
/** Ambient time used for the still frame: plane mid flight, bar locked out, code half typed */
const AT_STILL = 3.4;

const GLYPHS = '01アイウエオカキクケコサシスセソタチツテトナニヌネハヒフヘホマミムメモヤユヨラリルレロワン<>{}=+*';

const font = (px: number) =>
  `italic 800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const MONO = '12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const mulberry = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ---------- drawing helpers ---------- */

/** Halftone dots on a 45 degree screen; fn(u, v) gives coverage 0..1 across the area */
function halftone(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  step: number,
  maxR: number,
  fn: (u: number, v: number) => number
) {
  if (w <= 0 || h <= 0) return;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = color;
  c.beginPath();
  const k = Math.SQRT1_2;
  const half = Math.hypot(w, h) / 2 + step;
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let a = -half; a <= half; a += step) {
    for (let b = -half; b <= half; b += step) {
      const px = cx + (a - b) * k;
      const py = cy + (a + b) * k;
      if (px < x - step || px > x + w + step || py < y - step || py > y + h + step) continue;
      const cov = fn((px - x) / w, (py - y) / h);
      if (cov <= 0.03) continue;
      const r = maxR * Math.sqrt(Math.min(1, cov));
      c.moveTo(px + r, py);
      c.arc(px, py, r, 0, TAU);
    }
  }
  c.fill();
  c.restore();
}

function radial(c: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function linear(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

/** Paper grain and a soft inner vignette so every panel reads as printed */
function finish(c: Ctx, w: number, h: number, rng: () => number) {
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const n = Math.round((w * h) / 900);
  for (let i = 0; i < n; i++) {
    c.fillStyle = rng() < 0.5 ? 'rgba(246,236,210,0.06)' : 'rgba(0,0,0,0.09)';
    c.fillRect(rng() * w, rng() * h, 1, 1);
  }
}

/** Comic cloud: ink the union outline by stroking first and filling over it */
function cloud(c: Ctx, cx: number, cy: number, r: number) {
  const puffs: [number, number, number][] = [
    [0, 0, 1],
    [0.9, 0.15, 0.72],
    [-0.9, 0.2, 0.68],
    [0.35, -0.45, 0.7],
    [-0.4, -0.35, 0.6],
    [1.55, 0.35, 0.45],
    [-1.5, 0.4, 0.42],
  ];
  c.beginPath();
  for (const [dx, dy, s] of puffs) {
    c.moveTo(cx + dx * r + s * r, cy + dy * r);
    c.arc(cx + dx * r, cy + dy * r, s * r, 0, TAU);
  }
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = '#eef2ff';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#b3c3ea';
  c.fillRect(cx - r * 2.2, cy + r * 0.25, r * 4.4, r * 1.5);
  halftone(c, cx - r * 2.2, cy - r, r * 4.4, r * 2.2, 'rgba(60,80,140,0.35)', 3.5, 1.3, (_u, v) => v * 1.2 - 0.3);
  c.restore();
}

/* ---------- panel 1: Baku ---------- */

const bakuBack = (c: Ctx, w: number, h: number, _p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  const seaY = h * 0.64;
  c.fillStyle = linear(c, 0, 0, 0, seaY, [
    [0, '#2a1206'],
    [0.45, '#8a3e12'],
    [0.8, '#e08a42'],
    [1, '#f7c77c'],
  ]);
  c.fillRect(0, 0, w, seaY + 2);
  const sx = w * 0.7;
  const sy = seaY - h * 0.2;
  radial(c, sx, sy, m * 0.45, [
    [0, 'rgba(255,220,150,0.55)'],
    [0.4, 'rgba(255,170,80,0.18)'],
    [1, 'rgba(255,150,60,0)'],
  ]);
  c.fillStyle = '#ffe6a8';
  c.beginPath();
  c.arc(sx, sy, m * 0.1, 0, TAU);
  c.fill();
  halftone(c, 0, 0, w, seaY, 'rgba(42,14,2,0.6)', 5, 2.2, (u, v) => (1 - v) * (1 - u * 0.55) * 1.1);
  // Caspian
  c.fillStyle = linear(c, 0, seaY, 0, h, [
    [0, '#3d5d82'],
    [1, '#0f1d33'],
  ]);
  c.fillRect(0, seaY, w, h - seaY);
  c.fillStyle = 'rgba(255,190,110,0.22)';
  c.beginPath();
  c.moveTo(sx - m * 0.06, seaY);
  c.lineTo(sx + m * 0.06, seaY);
  c.lineTo(sx + m * 0.22, h);
  c.lineTo(sx - m * 0.22, h);
  c.fill();
  halftone(c, 0, seaY, w, h - seaY, 'rgba(4,10,24,0.65)', 5, 2, (_u, v) => v * 0.95);
  // City: low blocks, Maiden Tower, a minaret and the three Flame Towers
  const base = seaY + 1;
  c.fillStyle = '#1a0b04';
  c.beginPath();
  const blocks: [number, number, number][] = [
    [0, 0.06, 0.07],
    [0.06, 0.11, 0.1],
    [0.11, 0.16, 0.06],
    [0.28, 0.34, 0.09],
    [0.34, 0.4, 0.12],
    [0.4, 0.47, 0.07],
    [0.47, 0.54, 0.1],
    [0.82, 0.88, 0.09],
    [0.88, 0.94, 0.13],
    [0.94, 1.01, 0.07],
  ];
  for (const [a, b, hh] of blocks) c.rect(w * a, base - h * hh, w * (b - a), h * hh + 2);
  const tx = w * 0.2;
  const tw = w * 0.055;
  const th = h * 0.2;
  c.rect(tx - tw / 2, base - th, tw, th + 2);
  c.rect(tx + tw / 2, base - th * 0.75, tw * 0.28, th * 0.75);
  for (let i = 0; i < 4; i++) c.rect(tx - tw / 2 + (i * tw) / 3.4, base - th - tw * 0.16, tw * 0.16, tw * 0.17);
  c.rect(w * 0.255, base - h * 0.25, w * 0.012, h * 0.25);
  c.moveTo(w * 0.253, base - h * 0.25);
  c.lineTo(w * 0.261, base - h * 0.3);
  c.lineTo(w * 0.269, base - h * 0.25);
  c.fill();
  const flame = (cx: number, ht: number, wd: number, lean: number) => {
    c.moveTo(cx - wd / 2, base + 1);
    c.quadraticCurveTo(cx - wd * 0.6, base - ht * 0.55, cx + lean, base - ht);
    c.quadraticCurveTo(cx + wd * 0.62, base - ht * 0.5, cx + wd / 2, base + 1);
    c.closePath();
  };
  c.beginPath();
  flame(w * 0.62, h * 0.3, w * 0.07, w * 0.012);
  flame(w * 0.69, h * 0.37, w * 0.075, w * 0.01);
  flame(w * 0.76, h * 0.28, w * 0.068, -w * 0.006);
  c.fill();
  c.lineWidth = 1.3;
  c.strokeStyle = 'rgba(255,170,80,0.75)';
  c.stroke();
  // Scattered lit windows in the old city
  c.fillStyle = 'rgba(255,200,110,0.7)';
  for (let i = 0; i < 26; i++) {
    const [a, b, hh] = blocks[Math.floor(rng() * blocks.length)];
    c.fillRect(w * (a + rng() * (b - a)), base - h * hh * rng() * 0.9 - 2, 1.5, 1.5);
  }
  c.fillStyle = INK;
  c.fillRect(0, base, w, 2);
  finish(c, w, h, rng);
};

const bakuFront = (c: Ctx, w: number, h: number) => {
  const m = Math.min(w, h);
  const seaY = h * 0.64;
  const py = seaY + h * 0.13;
  // Boulevard pier with a kid pointing at the towers
  c.fillStyle = INK;
  c.fillRect(-2, py, w * 0.3, Math.max(3, m * 0.018));
  for (let x = w * 0.02; x < w * 0.29; x += w * 0.06) c.fillRect(x, py, Math.max(2, m * 0.01), h * 0.1);
  const S = m * 0.0048;
  c.save();
  c.translate(w * 0.13, py);
  c.scale(S, S);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,170,80,0.7)';
  c.fillStyle = INK;
  const kid = () => {
    c.beginPath();
    c.arc(0, -27, 5, 0, TAU);
    c.moveTo(-4.5, -21);
    c.lineTo(4.5, -21);
    c.lineTo(5.5, -8);
    c.lineTo(-5.5, -8);
    c.closePath();
  };
  c.lineWidth = 2;
  kid();
  c.stroke();
  c.lineWidth = 3.4;
  c.beginPath();
  c.moveTo(-2.5, -9);
  c.lineTo(-3.5, 0);
  c.moveTo(2.5, -9);
  c.lineTo(3.5, 0);
  c.moveTo(3.5, -19);
  c.lineTo(13, -26);
  c.moveTo(-3.5, -19);
  c.lineTo(-6, -11);
  c.strokeStyle = INK;
  c.stroke();
  kid();
  c.fill();
  c.restore();
};

const bakuLive = (c: Ctx, w: number, h: number, _p: Panel, at: number) => {
  const seaY = h * 0.64;
  const sx = w * 0.7;
  c.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const depth = hash(i * 3.1);
    const y = seaY + 4 + depth * h * 0.3;
    const spread = w * (0.05 + depth * 0.22);
    const x = sx + (hash(i * 7.7) - 0.5) * 2 * spread + Math.sin(at * 0.8 + i) * 4;
    const a = Math.max(0, Math.sin(at * (1.3 + hash(i * 1.3) * 1.8) + i * 2.1));
    const len = (5 + depth * 14) * (0.4 + 0.6 * a);
    c.strokeStyle = `rgba(255,220,160,${((0.12 + 0.7 * a) * (1 - depth * 0.4)).toFixed(3)})`;
    c.lineWidth = 1 + depth * 1.3;
    c.beginPath();
    c.moveTo(x - len / 2, y);
    c.lineTo(x + len / 2, y);
    c.stroke();
  }
  c.lineWidth = 1.2;
  for (let k = 0; k < 2; k++) {
    const y0 = seaY + h * (0.07 + k * 0.12);
    c.strokeStyle = 'rgba(180,210,245,0.2)';
    c.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin(x * 0.05 + at * (1.1 + k * 0.4) + k) * 2;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
};

/* ---------- panel 2: the flight ---------- */

const flightPath = (w: number, h: number, u: number) => {
  const x0 = -0.14 * w;
  const y0 = 0.5 * h;
  const x1 = 0.5 * w;
  const y1 = 0.08 * h;
  const x2 = 1.14 * w;
  const y2 = 0.44 * h;
  const a = (1 - u) * (1 - u);
  const b = 2 * u * (1 - u);
  const d = u * u;
  return {
    x: a * x0 + b * x1 + d * x2,
    y: a * y0 + b * y1 + d * y2,
    dx: 2 * (1 - u) * (x1 - x0) + 2 * u * (x2 - x1),
    dy: 2 * (1 - u) * (y1 - y0) + 2 * u * (y2 - y1),
  };
};

const flightBack = (c: Ctx, w: number, h: number, _p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  const hz = h * 0.78;
  c.fillStyle = linear(c, 0, 0, 0, hz, [
    [0, '#0c1733'],
    [0.5, '#1f4580'],
    [0.8, '#7593c2'],
    [1, '#f3a45c'],
  ]);
  c.fillRect(0, 0, w, hz);
  radial(c, w * 0.88, hz, m * 0.55, [
    [0, 'rgba(255,200,120,0.7)'],
    [0.5, 'rgba(255,150,70,0.2)'],
    [1, 'rgba(255,150,70,0)'],
  ]);
  c.fillStyle = '#ffd98a';
  c.beginPath();
  c.arc(w * 0.88, hz, m * 0.09, Math.PI, TAU);
  c.fill();
  halftone(c, 0, 0, w, hz, 'rgba(4,8,26,0.6)', 5, 2.2, (_u, v) => 1 - v * 1.5);
  halftone(c, 0, hz - h * 0.18, w, h * 0.18, 'rgba(255,196,120,0.45)', 4.5, 1.6, (u, v) => v * (0.4 + u * 0.8));
  c.fillStyle = linear(c, 0, hz, 0, h, [
    [0, '#23385c'],
    [1, '#0a1428'],
  ]);
  c.fillRect(0, hz, w, h - hz);
  halftone(c, 0, hz, w, h - hz, 'rgba(0,4,16,0.6)', 5, 2, (_u, v) => v);
  c.fillStyle = INK;
  c.fillRect(0, hz - 1, w, 2);
  // Dotted route the plane follows
  c.save();
  c.setLineDash([2, 7]);
  c.lineCap = 'round';
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(246,236,210,0.45)';
  c.beginPath();
  for (let u = 0.08; u <= 0.93; u += 0.01) {
    const q = flightPath(w, h, u);
    if (u === 0.08) c.moveTo(q.x, q.y);
    else c.lineTo(q.x, q.y);
  }
  c.stroke();
  c.restore();
  cloud(c, w * 0.12, h * 0.66, m * 0.075);
  cloud(c, w * 0.52, h * 0.7, m * 0.1);
  cloud(c, w * 0.86, h * 0.6, m * 0.06);
  cloud(c, w * 0.34, h * 0.28, m * 0.045);
  finish(c, w, h, rng);
};

function drawPlane(c: Ctx) {
  c.lineJoin = 'round';
  c.lineWidth = 2.2;
  c.strokeStyle = INK;
  const poly = (pts: number[], fill: string) => {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.stroke();
  };
  poly([-2, -2, -12, -15, -6, -15, 10, -2], '#aeb9d2');
  poly([-33, -4, -46, -22, -38, -22, -24, -4], '#e24a2a');
  c.beginPath();
  c.moveTo(-40, -3);
  c.lineTo(30, -5);
  c.quadraticCurveTo(44, -4, 47, 1);
  c.quadraticCurveTo(42, 6, 30, 6);
  c.lineTo(-38, 4);
  c.quadraticCurveTo(-45, 1, -40, -3);
  c.closePath();
  c.fillStyle = PAPER;
  c.fill();
  c.stroke();
  c.strokeStyle = '#e24a2a';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-36, 2.5);
  c.lineTo(41, 2.5);
  c.stroke();
  c.fillStyle = INK;
  for (let x = -24; x <= 26; x += 6) c.fillRect(x, -2, 2.4, 2);
  c.fillRect(36, -2.5, 5, 2.2);
  c.strokeStyle = INK;
  c.lineWidth = 2.2;
  poly([-6, 2, -20, 19, -11, 19, 12, 2], '#dfe4ee');
  poly([-33, 2, -44, 9, -38, 9, -27, 2], '#dfe4ee');
}

const flightLive = (c: Ctx, w: number, h: number, _p: Panel, at: number) => {
  const m = Math.min(w, h);
  const u = ((at + 1) / 8) % 1;
  const q = flightPath(w, h, u);
  const S = m * 0.0042;
  const pathLen = w * 1.4;
  const du0 = (44 * S) / pathLen;
  const n = 30;
  c.lineCap = 'round';
  let prev = flightPath(w, h, u - du0);
  for (let j = 1; j <= n; j++) {
    const uj = u - du0 - j * 0.011;
    if (uj < 0) break;
    const pt = flightPath(w, h, uj);
    const k = 1 - j / n;
    c.strokeStyle = `rgba(255,248,232,${(0.75 * k * k).toFixed(3)})`;
    c.lineWidth = (2 + j * 0.16) * S * 1.4;
    c.beginPath();
    c.moveTo(prev.x, prev.y + j * 0.05);
    c.lineTo(pt.x, pt.y + j * 0.05);
    c.stroke();
    prev = pt;
  }
  c.save();
  c.translate(q.x, q.y + Math.sin(at * 2.2) * 1.2);
  c.rotate(Math.atan2(q.dy, q.dx));
  c.scale(S, S);
  drawPlane(c);
  c.restore();
};

/* ---------- panel 3: Detroit ---------- */

const detroitBack = (c: Ctx, w: number, h: number, p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  const sk = h * 0.7;
  c.fillStyle = linear(c, 0, 0, 0, sk, [
    [0, '#1a0a00'],
    [0.3, '#5a2206'],
    [0.6, '#c8501a'],
    [0.85, '#ff9a2e'],
    [1, '#ffd66a'],
  ]);
  c.fillRect(0, 0, w, sk + 1);
  const sunX = w * 0.62;
  radial(c, sunX, sk, m * 0.7, [
    [0, 'rgba(255,240,170,0.75)'],
    [0.35, 'rgba(255,190,90,0.25)'],
    [1, 'rgba(255,160,60,0)'],
  ]);
  c.fillStyle = '#ffeeb0';
  c.beginPath();
  c.arc(sunX, sk, m * 0.18, Math.PI, TAU);
  c.fill();
  halftone(c, 0, 0, w, sk, 'rgba(255,244,200,0.5)', 5, 1.9, (u, v) => {
    const d = Math.hypot((u - 0.62) * w, (v - 1) * sk) / (m * 0.6);
    return 1 - d;
  });
  halftone(c, 0, 0, w, sk, 'rgba(40,10,0,0.55)', 5, 2.2, (_u, v) => 1 - v * 1.7);
  // Distant blocks
  c.fillStyle = '#4a1a06';
  for (let x = -5; x < w; ) {
    const bw = w * (0.04 + rng() * 0.05);
    const bh = h * (0.06 + rng() * 0.12);
    c.fillRect(x, sk - bh, bw - 1, bh);
    x += bw;
  }
  const lights: Light[] = [];
  const step = Math.max(4, m * 0.024);
  const addWindows = (x: number, y: number, bw: number, bh: number) => {
    for (let wy = y + step * 0.6; wy < sk - step; wy += step) {
      for (let wx = x + step * 0.4; wx < x + bw - step * 0.4; wx += step) {
        if (rng() < 0.32 && lights.length < 150)
          lights.push({ x: wx, y: wy, s: Math.max(1.4, step * 0.34), ph: rng() * TAU, rate: 0.6 + rng() * 2.2 });
      }
    }
  };
  // RenCen: back pair lighter, central tower and front pair in ink
  const cx = w * 0.45;
  const cw = w * 0.065;
  const cyl = (x: number, cwid: number, th: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x - cwid / 2, sk - th, cwid, th + 1);
    c.beginPath();
    c.ellipse(x, sk - th, cwid / 2, cwid * 0.16, 0, 0, TAU);
    c.fill();
  };
  cyl(cx - cw * 0.9, cw * 0.72, h * 0.34, '#2a0e04');
  cyl(cx + cw * 0.9, cw * 0.72, h * 0.34, '#2a0e04');
  cyl(cx, cw, h * 0.47, '#120604');
  c.fillStyle = '#120604';
  c.fillRect(cx - cw * 0.58, sk - h * 0.47 + cw * 0.3, cw * 1.16, Math.max(2, h * 0.012));
  cyl(cx - cw * 0.55, cw * 0.66, h * 0.29, '#160704');
  cyl(cx + cw * 0.55, cw * 0.66, h * 0.29, '#160704');
  addWindows(cx - cw / 2, sk - h * 0.44, cw, h * 0.44);
  // Downtown blocks with setbacks; the tallest carries a beacon
  const blocks: [number, number, number][] = [
    [-0.01, 0.07, 0.16],
    [0.07, 0.12, 0.23],
    [0.12, 0.18, 0.13],
    [0.26, 0.32, 0.19],
    [0.32, 0.37, 0.12],
    [0.54, 0.6, 0.24],
    [0.6, 0.65, 0.16],
    [0.65, 0.71, 0.27],
  ];
  c.fillStyle = '#120604';
  for (const [a, b, hh] of blocks) {
    const x = w * a;
    const bw = w * (b - a) - 1;
    c.fillRect(x, sk - h * hh, bw, h * hh + 1);
    c.fillRect(x + bw * 0.2, sk - h * hh * 1.1, bw * 0.6, h * hh * 0.1 + 1);
    addWindows(x, sk - h * hh, bw, h * hh);
  }
  const px = w * 0.2;
  const pw = w * 0.06;
  c.fillRect(px, sk - h * 0.3, pw, h * 0.3 + 1);
  c.fillRect(px + pw * 0.15, sk - h * 0.36, pw * 0.7, h * 0.06 + 1);
  c.fillRect(px + pw * 0.32, sk - h * 0.4, pw * 0.36, h * 0.04 + 1);
  c.fillRect(px + pw * 0.48, sk - h * 0.46, Math.max(1.5, pw * 0.05), h * 0.06);
  addWindows(px, sk - h * 0.3, pw, h * 0.3);
  // Bridge on the right
  const deck = sk - h * 0.05;
  const t1 = w * 0.84;
  const top = sk - h * 0.22;
  c.strokeStyle = '#120604';
  c.lineWidth = Math.max(1, m * 0.006);
  c.beginPath();
  c.moveTo(w * 0.73, deck);
  c.quadraticCurveTo(w * 0.8, deck, t1, top);
  c.quadraticCurveTo(w * 0.95, deck + h * 0.02, w * 1.05, top + h * 0.06);
  c.stroke();
  c.lineWidth = 1;
  c.beginPath();
  for (let x = w * 0.75; x < w; x += Math.max(4, m * 0.02)) {
    const k = x < t1 ? (x - w * 0.73) / (t1 - w * 0.73) : 1 - (x - t1) / (w * 0.21);
    c.moveTo(x, deck);
    c.lineTo(x, deck - Math.max(0, k) * (deck - top) * 0.9);
  }
  c.stroke();
  c.fillStyle = '#120604';
  c.fillRect(w * 0.72, deck, w * 0.3, Math.max(2, h * 0.012));
  c.fillRect(t1 - 2, top, 4, sk - top);
  // River
  c.fillStyle = linear(c, 0, sk, 0, h, [
    [0, '#4a1c08'],
    [1, '#120402'],
  ]);
  c.fillRect(0, sk, w, h - sk);
  c.fillStyle = INK;
  c.fillRect(0, sk, w, 2);
  halftone(c, 0, sk, w, h - sk, 'rgba(0,0,0,0.55)', 5, 2, (_u, v) => v);
  c.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const y = sk + 5 + (i / 16) * (h - sk) * 0.8;
    const len = m * (0.05 + (1 - i / 16) * 0.12) * (0.5 + rng());
    c.strokeStyle = `rgba(255,200,110,${(0.55 - i * 0.025).toFixed(3)})`;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(sunX - len / 2 + (rng() - 0.5) * m * 0.1, y);
    c.lineTo(sunX + len / 2 + (rng() - 0.5) * m * 0.1, y);
    c.stroke();
  }
  p.lights = lights;
  finish(c, w, h, rng);
};

const detroitLive = (c: Ctx, w: number, h: number, p: Panel, at: number) => {
  for (const L of p.lights) {
    const v = 0.5 + 0.5 * Math.sin(at * L.rate + L.ph);
    if (v < 0.22) continue;
    c.fillStyle = `rgba(255,214,120,${(0.3 + 0.65 * v).toFixed(3)})`;
    c.fillRect(L.x, L.y, L.s, L.s * 1.3);
  }
  const bx = w * 0.2 + w * 0.06 * 0.5;
  const by = h * 0.7 - h * 0.46;
  const blink = Math.max(0, Math.sin(at * 2.4));
  radial(c, bx, by, Math.min(w, h) * 0.04, [
    [0, `rgba(255,70,50,${(0.9 * blink).toFixed(3)})`],
    [1, 'rgba(255,70,50,0)'],
  ]);
};

/* ---------- panel 4: the iron temple ---------- */

const repK = (at: number) => {
  const u = (at / 2.6 + 0.14) % 1;
  if (u < 0.35) return easeInOutCubic(u / 0.35);
  if (u < 0.55) return 1;
  if (u < 0.9) return 1 - easeInOutCubic((u - 0.55) / 0.35);
  return 0;
};

const ironBack = (c: Ctx, w: number, h: number, _p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.hypot(w, h);
  c.fillStyle = BG;
  c.fillRect(0, 0, w, h);
  radial(c, cx, cy, R * 0.7, [
    [0, '#ffc15a'],
    [0.25, '#f07a22'],
    [0.6, '#7a2208'],
    [1, '#2a0802'],
  ]);
  c.fillStyle = 'rgba(255,236,170,0.14)';
  c.beginPath();
  const rays = 20;
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * TAU;
    const a1 = ((i + 1) / rays) * TAU;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    c.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    c.closePath();
  }
  c.fill();
  halftone(c, 0, 0, w, h, 'rgba(30,6,0,0.6)', 5, 2.3, (u, v) => {
    const d = Math.hypot((u - 0.5) * w, (v - 0.5) * h) / (m * 0.9);
    return d - 0.35;
  });
  const fy = h * 0.8;
  // Squat rack and dumbbell rack in the dark
  c.fillStyle = '#2a0a02';
  const rx = w * 0.06;
  c.fillRect(rx, fy - h * 0.46, Math.max(3, m * 0.02), h * 0.46);
  c.fillRect(rx + w * 0.12, fy - h * 0.46, Math.max(3, m * 0.02), h * 0.46);
  c.fillRect(rx - 2, fy - h * 0.47, w * 0.12 + m * 0.02 + 4, Math.max(3, m * 0.015));
  c.fillRect(rx - w * 0.03, fy - h * 0.3, w * 0.2, Math.max(2, m * 0.01));
  c.fillRect(rx - w * 0.03, fy - h * 0.34, m * 0.03, h * 0.08);
  c.fillRect(rx + w * 0.155, fy - h * 0.34, m * 0.03, h * 0.08);
  const dx = w * 0.8;
  for (let t = 0; t < 3; t++) {
    const ty = fy - h * (0.08 + t * 0.1);
    c.fillRect(dx, ty, w * 0.17, Math.max(2, m * 0.01));
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.arc(dx + w * 0.03 + k * w * 0.055, ty - m * 0.025, m * 0.022, 0, TAU);
      c.fill();
    }
  }
  c.fillRect(dx, fy - h * 0.3, Math.max(2, m * 0.012), h * 0.3);
  c.fillRect(dx + w * 0.16, fy - h * 0.3, Math.max(2, m * 0.012), h * 0.3);
  // Floor and platform
  c.fillStyle = '#140502';
  c.fillRect(0, fy, w, h - fy);
  c.fillStyle = '#5a2208';
  c.fillRect(w * 0.22, fy - 1, w * 0.56, Math.max(4, h * 0.02));
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.strokeRect(w * 0.22, fy - 1, w * 0.56, Math.max(4, h * 0.02));
  halftone(c, 0, fy, w, h - fy, 'rgba(255,120,40,0.12)', 5, 1.6, (_u, v) => 1 - v);
  finish(c, w, h, rng);
};

const ironLive = (c: Ctx, w: number, h: number, _p: Panel, at: number) => {
  const k = repK(at);
  const vel = (k - repK(at - 0.06)) / 0.06;
  const S = Math.min(w * 0.0042, h * 0.0036);
  const cx = w * 0.5;
  const fy = h * 0.8;
  const pulse = 1 + 0.08 * k + 0.03 * Math.sin(at * 6);
  radial(c, cx, fy - 95 * S, 110 * S * pulse, [
    [0, `rgba(255,236,150,${(0.3 + 0.3 * k).toFixed(3)})`],
    [0.5, 'rgba(255,130,30,0.14)'],
    [1, 'rgba(255,120,20,0)'],
  ]);
  c.save();
  c.translate(cx, fy);
  c.scale(S, S);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const barY = lerp(-86, -142, k);
  const ex = lerp(34, 27, k);
  const ey = lerp(-68, -116, k);
  const limbs = () => {
    c.beginPath();
    c.moveTo(-8, -48);
    c.lineTo(-15, -24);
    c.lineTo(-14, -2);
    c.moveTo(8, -48);
    c.lineTo(15, -24);
    c.lineTo(14, -2);
    c.stroke();
    c.beginPath();
    c.moveTo(-17, -84);
    c.lineTo(-ex, ey);
    c.lineTo(-25, barY);
    c.moveTo(17, -84);
    c.lineTo(ex, ey);
    c.lineTo(25, barY);
    c.stroke();
  };
  const body = () => {
    c.beginPath();
    c.moveTo(-20, -90);
    c.lineTo(20, -90);
    c.lineTo(12, -46);
    c.lineTo(-12, -46);
    c.closePath();
    c.moveTo(9.5, -102);
    c.arc(0, -102, 9.5, 0, TAU);
    c.rect(-24, -5, 15, 5);
    c.rect(9, -5, 15, 5);
  };
  // Rim light pass, then ink on top
  c.strokeStyle = 'rgba(255,190,90,0.85)';
  c.lineWidth = 15;
  limbs();
  body();
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = '#120402';
  c.fillStyle = '#120402';
  c.lineWidth = 12;
  limbs();
  body();
  c.fill();
  // Barbell
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-72, barY);
  c.lineTo(72, barY);
  c.stroke();
  c.strokeStyle = 'rgba(255,190,90,0.9)';
  c.lineWidth = 1.5;
  for (const sg of [-1, 1]) {
    const plates: [number, number, number][] = [
      [44, 10, 40],
      [55, 7, 28],
      [63, 4, 12],
    ];
    for (const [off, pw, ph] of plates) {
      const x = sg > 0 ? off : -off - pw;
      c.fillRect(x, barY - ph / 2, pw, ph);
      c.strokeRect(x, barY - ph / 2, pw, ph);
    }
  }
  // Speed lines while the bar moves
  const sp = Math.min(1, Math.abs(vel) * 0.45);
  if (sp > 0.08) {
    const dir = vel > 0 ? 1 : -1;
    c.strokeStyle = `rgba(20,4,0,${(0.8 * sp).toFixed(3)})`;
    c.lineWidth = 2;
    c.beginPath();
    for (const sg of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const x = sg * (48 + j * 7);
        const y0 = barY + dir * (24 + j * 3);
        c.moveTo(x, y0);
        c.lineTo(x, y0 + dir * (10 + 12 * sp));
      }
    }
    c.stroke();
  }
  c.restore();
};

/* ---------- panel 5: awakening ---------- */

const awakeScreen = (w: number, h: number): Rect => {
  const sw = Math.min(w * 0.44, h * 0.52);
  const sh = sw * 0.68;
  return { x: w * 0.64 - sw / 2, y: h * 0.4 - sh / 2, w: sw, h: sh };
};

const awakeBack = (c: Ctx, w: number, h: number, _p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  c.fillStyle = linear(c, 0, 0, 0, h, [
    [0, '#02070a'],
    [0.6, '#05241a'],
    [1, '#010a05'],
  ]);
  c.fillRect(0, 0, w, h);
  const sc = awakeScreen(w, h);
  radial(c, sc.x + sc.w / 2, sc.y + sc.h / 2, m * 0.75, [
    [0, 'rgba(93,255,176,0.22)'],
    [1, 'rgba(93,255,176,0)'],
  ]);
  halftone(c, 0, 0, w, h, 'rgba(93,255,176,0.16)', 5, 1.9, (u, v) => {
    const d = Math.hypot((u - 0.64) * w, (v - 0.4) * h) / (m * 0.7);
    return 0.9 - d;
  });
  finish(c, w, h, rng);
};

const awakeFront = (c: Ctx, w: number, h: number) => {
  const m = Math.min(w, h);
  const sc = awakeScreen(w, h);
  const fy = h * 0.8;
  // Floor with the screen's reflection
  c.fillStyle = '#010603';
  c.fillRect(0, fy, w, h - fy);
  c.fillStyle = linear(c, 0, fy, 0, h, [
    [0, 'rgba(93,255,176,0.22)'],
    [1, 'rgba(93,255,176,0)'],
  ]);
  c.fillRect(sc.x, fy, sc.w, h - fy);
  c.fillStyle = PHOS;
  c.globalAlpha = 0.5;
  c.fillRect(0, fy, w, 1);
  c.globalAlpha = 1;
  // Bezel ring and stand
  const b = Math.max(3, sc.w * 0.05);
  c.fillStyle = '#020a05';
  c.beginPath();
  c.rect(sc.x - b, sc.y - b, sc.w + b * 2, sc.h + b * 2);
  c.rect(sc.x, sc.y, sc.w, sc.h);
  c.fill('evenodd');
  c.strokeStyle = 'rgba(93,255,176,0.55)';
  c.lineWidth = 1;
  c.strokeRect(sc.x - b, sc.y - b, sc.w + b * 2, sc.h + b * 2);
  c.fillRect(sc.x + sc.w * 0.44, sc.y + sc.h + b, sc.w * 0.12, fy - (sc.y + sc.h + b));
  c.fillRect(sc.x + sc.w * 0.3, fy - 3, sc.w * 0.4, 3);
  // Figure in a long coat, reaching for the screen
  const S = Math.min(h * 0.0046, m * 0.0055);
  c.save();
  c.translate(sc.x - m * 0.2, fy);
  c.scale(S, S);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const shape = () => {
    c.beginPath();
    c.arc(2, -92, 7.5, 0, TAU);
    c.moveTo(-9, -80);
    c.lineTo(10, -80);
    c.lineTo(13, -42);
    c.lineTo(19, -8);
    c.lineTo(-16, -8);
    c.lineTo(-11, -42);
    c.closePath();
    c.rect(-8, -10, 6, 10);
    c.rect(2, -10, 6, 10);
  };
  const arm = () => {
    c.beginPath();
    c.moveTo(6, -76);
    c.lineTo(28, -68);
    c.lineTo(42, -66);
    c.stroke();
  };
  c.strokeStyle = 'rgba(93,255,176,0.8)';
  c.lineWidth = 8;
  arm();
  shape();
  c.lineWidth = 2.4;
  c.stroke();
  c.strokeStyle = '#010402';
  c.fillStyle = '#010402';
  c.lineWidth = 5.5;
  arm();
  shape();
  c.fill();
  c.restore();
};

const makeRain = (w: number, h: number, rng: () => number): RainCol[] => {
  const n = Math.max(6, Math.floor(w / 13));
  return Array.from({ length: n }, (_, i) => ({
    x: ((i + 0.5) * w) / n + (rng() - 0.5) * 3,
    y: rng() * h * 1.2,
    speed: 40 + rng() * 70,
    len: 6 + Math.floor(rng() * 9),
    chars: Array.from({ length: 16 }, () => GLYPHS[Math.floor(rng() * GLYPHS.length)]),
    swap: rng() * 0.2,
  }));
};

const awakeLive = (c: Ctx, w: number, h: number, p: Panel, at: number) => {
  const gh = 13;
  c.font = MONO;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const fy = h * 0.8;
  for (const col of p.rain) {
    for (let j = 0; j < col.len; j++) {
      const y = col.y - j * gh;
      if (y < -gh || y > fy) continue;
      const ch = col.chars[j % col.chars.length];
      if (j === 0) {
        c.globalAlpha = 0.95;
        c.fillStyle = '#e4fff1';
      } else {
        c.globalAlpha = (1 - j / col.len) * 0.5;
        c.fillStyle = PHOS;
      }
      c.fillText(ch, col.x, y);
    }
  }
  c.globalAlpha = 1;
  // Screen
  const sc = awakeScreen(w, h);
  const flick = 0.85 + 0.15 * Math.sin(at * 3.1) * Math.sin(at * 7.3);
  c.fillStyle = linear(c, 0, sc.y, 0, sc.y + sc.h, [
    [0, '#0b4a2c'],
    [1, '#03170d'],
  ]);
  c.fillRect(sc.x, sc.y, sc.w, sc.h);
  c.save();
  c.beginPath();
  c.rect(sc.x, sc.y, sc.w, sc.h);
  c.clip();
  const lh = Math.max(2, sc.h * 0.06);
  const scroll = (at * lh * 1.6) % (lh * 2);
  c.fillStyle = PHOS;
  for (let i = 0; i < 14; i++) {
    const y = sc.y + sc.h * 0.08 + i * lh * 2 - scroll;
    const ind = (hash(i + Math.floor(at * 0.8)) * 3) | 0;
    const len = 0.25 + hash(i * 5.3 + Math.floor((at * 1.6) / 2)) * 0.55;
    c.globalAlpha = 0.55 * flick;
    c.fillRect(sc.x + sc.w * (0.08 + ind * 0.07), y, sc.w * len * 0.8, lh);
  }
  c.globalAlpha = 0.12;
  c.fillStyle = '#000';
  for (let y = sc.y; y < sc.y + sc.h; y += 3) c.fillRect(sc.x, y, sc.w, 1);
  c.restore();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'lighter';
  radial(c, sc.x + sc.w / 2, sc.y + sc.h / 2, sc.w * 0.9, [
    [0, `rgba(93,255,176,${(0.16 * flick).toFixed(3)})`],
    [1, 'rgba(93,255,176,0)'],
  ]);
  c.globalCompositeOperation = 'source-over';
};

/* ---------- panel 6: the builder ---------- */

const monitorRect = (w: number, h: number) => {
  const dy = h * 0.72;
  const mw = Math.min(w * 0.4, h * 0.56);
  const mh = mw * 0.62;
  return { x: w * 0.5, y: dy - mh - h * 0.07, w: mw, h: mh, dy };
};

const builderBack = (c: Ctx, w: number, h: number, p: Panel, rng: () => number) => {
  const m = Math.min(w, h);
  c.fillStyle = linear(c, 0, 0, 0, h, [
    [0, '#0e1d36'],
    [1, '#070f1c'],
  ]);
  c.fillRect(0, 0, w, h);
  radial(c, w * 0.95, h * 0.55, m * 0.7, [
    [0, 'rgba(255,160,70,0.32)'],
    [1, 'rgba(255,160,70,0)'],
  ]);
  // Window with the night skyline
  const wx = w * 0.07;
  const wy = h * 0.08;
  const ww = w * 0.46;
  const wh = h * 0.42;
  c.fillStyle = linear(c, 0, wy, 0, wy + wh, [
    [0, '#050a1c'],
    [1, '#1c2446'],
  ]);
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = PAPER;
  c.beginPath();
  c.arc(wx + ww * 0.78, wy + wh * 0.22, m * 0.035, 0, TAU);
  c.fill();
  c.fillStyle = '#0a1226';
  c.beginPath();
  c.arc(wx + ww * 0.78 + m * 0.014, wy + wh * 0.2, m * 0.032, 0, TAU);
  c.fill();
  const stars: Light[] = [];
  for (let i = 0; i < 18; i++)
    stars.push({ x: wx + rng() * ww, y: wy + rng() * wh * 0.45, s: 0.6 + rng() * 0.8, ph: rng() * TAU, rate: 1 + rng() * 2 });
  p.lights = stars;
  const base = wy + wh;
  let x = wx;
  while (x < wx + ww) {
    const bw = ww * (0.06 + rng() * 0.08);
    const bh = wh * (0.12 + rng() * 0.38);
    c.fillStyle = '#060b18';
    c.fillRect(x, base - bh, bw - 1, bh);
    c.fillStyle = 'rgba(255,200,110,0.75)';
    for (let yy = base - bh + 3; yy < base - 2; yy += 4)
      for (let xx = x + 2; xx < x + bw - 3; xx += 4) if (rng() < 0.18) c.fillRect(xx, yy, 1.4, 1.4);
    x += bw;
  }
  c.strokeStyle = '#02060c';
  c.lineWidth = Math.max(3, m * 0.02);
  c.strokeRect(wx, wy, ww, wh);
  c.lineWidth = Math.max(2, m * 0.01);
  c.beginPath();
  c.moveTo(wx + ww / 2, wy);
  c.lineTo(wx + ww / 2, wy + wh);
  c.moveTo(wx, wy + wh / 2);
  c.lineTo(wx + ww, wy + wh / 2);
  c.stroke();
  halftone(c, 0, 0, w, h, 'rgba(0,0,0,0.5)', 5, 2, (u, v) => v * 0.9 - 0.2 + (1 - u) * 0.2);
  p.lines = Array.from({ length: 16 }, () => 0.35 + rng() * 0.6);
  finish(c, w, h, rng);
};

const builderFront = (c: Ctx, w: number, h: number) => {
  const m = Math.min(w, h);
  const mr = monitorRect(w, h);
  const dy = mr.dy;
  const S = m * 0.0046;
  // Chair and the builder, hunched toward the keyboard
  const px = mr.x - 58 * S;
  c.save();
  c.translate(px, dy);
  c.scale(S, S);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.fillStyle = '#04030a';
  c.fillRect(-30, -58, 7, 58);
  const shape = () => {
    c.beginPath();
    c.arc(2, -66, 9, 0, TAU);
    c.moveTo(-14, -52);
    c.lineTo(16, -50);
    c.lineTo(12, 0);
    c.lineTo(-14, 0);
    c.closePath();
  };
  const arms = () => {
    c.beginPath();
    c.moveTo(12, -46);
    c.lineTo(30, -24);
    c.lineTo(52, -8);
    c.stroke();
  };
  c.strokeStyle = 'rgba(0,212,170,0.75)';
  c.lineWidth = 10;
  arms();
  shape();
  c.lineWidth = 2.4;
  c.stroke();
  c.strokeStyle = '#05040a';
  c.fillStyle = '#05040a';
  c.lineWidth = 7.5;
  arms();
  shape();
  c.fill();
  c.restore();
  // Desk
  c.fillStyle = '#110d1a';
  c.fillRect(0, dy, w, h - dy);
  c.fillStyle = '#2c2440';
  c.fillRect(0, dy, w, Math.max(3, h * 0.015));
  c.fillStyle = INK;
  c.fillRect(0, dy + Math.max(3, h * 0.015), w, 1.5);
  // Keyboard
  c.fillStyle = '#1c1830';
  c.fillRect(mr.x - mr.w * 0.02, dy - Math.max(2, m * 0.012), mr.w * 0.5, Math.max(2, m * 0.012));
  // Monitor bezel and stand
  const b = Math.max(3, mr.w * 0.045);
  c.fillStyle = '#05050c';
  c.beginPath();
  c.rect(mr.x - b, mr.y - b, mr.w + b * 2, mr.h + b * 2);
  c.rect(mr.x, mr.y, mr.w, mr.h);
  c.fill('evenodd');
  c.strokeStyle = 'rgba(126,160,255,0.35)';
  c.lineWidth = 1;
  c.strokeRect(mr.x - b, mr.y - b, mr.w + b * 2, mr.h + b * 2);
  c.fillRect(mr.x + mr.w * 0.44, mr.y + mr.h + b, mr.w * 0.12, dy - (mr.y + mr.h + b));
  c.fillRect(mr.x + mr.w * 0.3, dy - 3, mr.w * 0.4, 3);
  // Mug and lamp, warm against the cool screen
  const mx = mr.x + mr.w + b + m * 0.05;
  if (mx + m * 0.05 < w) {
    c.fillStyle = '#ff8a2a';
    c.fillRect(mx, dy - m * 0.07, m * 0.05, m * 0.07);
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.strokeRect(mx, dy - m * 0.07, m * 0.05, m * 0.07);
  }
  c.strokeStyle = '#05040a';
  c.lineWidth = Math.max(2, m * 0.012);
  c.beginPath();
  c.moveTo(w * 0.97, dy);
  c.lineTo(w * 0.99, dy - h * 0.26);
  c.lineTo(w * 0.93, dy - h * 0.36);
  c.stroke();
  c.fillStyle = '#05040a';
  c.beginPath();
  c.moveTo(w * 0.93 - m * 0.06, dy - h * 0.3);
  c.lineTo(w * 0.93 + m * 0.02, dy - h * 0.38);
  c.lineTo(w * 0.93 + m * 0.04, dy - h * 0.32);
  c.closePath();
  c.fill();
};

const CODE_COLORS = [PHOS, '#7fb8ff', YELLOW, '#ff8a2a', '#c49bff'];
const INDENT = [0, 1, 1, 2, 2, 1, 0, 1, 2, 2, 1, 0, 0, 1, 1, 0];

const builderLive = (c: Ctx, w: number, h: number, p: Panel, at: number) => {
  for (const L of p.lights) {
    const v = 0.35 + 0.65 * Math.abs(Math.sin(at * L.rate + L.ph));
    c.fillStyle = `rgba(255,255,255,${(v * 0.9).toFixed(3)})`;
    c.fillRect(L.x, L.y, L.s, L.s);
  }
  const mr = monitorRect(w, h);
  const flick = 0.9 + 0.1 * Math.sin(at * 5.3);
  c.globalCompositeOperation = 'lighter';
  radial(c, mr.x + mr.w / 2, mr.y + mr.h / 2, mr.w * 1.1, [
    [0, `rgba(0,212,170,${(0.2 * flick).toFixed(3)})`],
    [0.6, 'rgba(79,127,255,0.06)'],
    [1, 'rgba(79,127,255,0)'],
  ]);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#04121a';
  c.fillRect(mr.x, mr.y, mr.w, mr.h);
  const pad = Math.max(3, mr.w * 0.06);
  const lh = Math.max(2, mr.h * 0.07);
  const gap = lh * 0.75;
  const rows = Math.min(p.lines.length, Math.floor((mr.h - pad * 2 + gap) / (lh + gap)));
  const cyc = 9;
  const typed = (at % cyc) * 2.1;
  let cx = mr.x + pad;
  let cy = mr.y + pad;
  for (let r = 0; r < rows; r++) {
    const ind = INDENT[r] * mr.w * 0.07;
    const full = (mr.w - pad * 2 - ind) * p.lines[r];
    const prog = clamp(typed - r, 0, 1);
    if (prog <= 0) break;
    const x = mr.x + pad + ind;
    const y = mr.y + pad + r * (lh + gap);
    const len = full * prog;
    const split = full * 0.3;
    c.fillStyle = CODE_COLORS[r % CODE_COLORS.length];
    c.fillRect(x, y, Math.min(len, split), lh);
    if (len > split + 2) {
      c.fillStyle = CODE_COLORS[(r + 2) % CODE_COLORS.length];
      c.globalAlpha = 0.8;
      c.fillRect(x + split + 2, y, len - split - 2, lh);
      c.globalAlpha = 1;
    }
    cx = x + len + 1;
    cy = y;
  }
  if (Math.sin(at * 9) > -0.2) {
    c.fillStyle = '#e4fff1';
    c.fillRect(cx, cy - lh * 0.1, Math.max(2, lh * 0.7), lh * 1.2);
  }
};

/* ---------- panels ---------- */

const DEFS: PanelDef[] = [
  {
    label: 'Baku, Azerbaijan',
    short: 'Baku',
    caption: 'Born by the Caspian Sea',
    tag: YELLOW,
    rot: -0.018,
    back: bakuBack,
    front: bakuFront,
    live: bakuLive,
  },
  {
    label: 'The flight',
    short: 'The flight',
    caption: '6,000 miles west',
    tag: YELLOW,
    rot: 0.014,
    back: flightBack,
    live: flightLive,
  },
  {
    label: 'Detroit, Michigan',
    short: 'Detroit',
    caption: 'A new home, a fresh start',
    tag: YELLOW,
    rot: -0.01,
    back: detroitBack,
    live: detroitLive,
  },
  {
    label: 'The iron temple',
    short: 'Iron temple',
    caption: 'Discipline, one rep at a time',
    tag: '#ff8a2a',
    rot: 0.012,
    back: ironBack,
    live: ironLive,
  },
  {
    label: 'Awakening',
    short: 'Awakening',
    caption: 'Then I saw it. Reality is code.',
    tag: PHOS,
    rot: -0.014,
    back: awakeBack,
    front: awakeFront,
    live: awakeLive,
  },
  {
    label: 'The builder',
    short: 'Builder',
    caption: 'Now I build it. Made in Detroit.',
    tag: YELLOW,
    rot: 0.01,
    back: builderBack,
    front: builderFront,
    live: builderLive,
  },
];

/* ---------- layout and caches ---------- */

function layout(w: number, h: number): Rect[] {
  const m = Math.min(w, h);
  const pad = clamp(m * 0.035, 10, 22);
  const gut = clamp(m * 0.024, 8, 14);
  const cols = w / h >= 1.15 ? 3 : 2;
  const rows = 6 / cols;
  const weights =
    cols === 3
      ? [
          [1.15, 0.85, 1],
          [0.9, 1, 1.1],
        ]
      : [
          [1.12, 0.88],
          [0.88, 1.12],
          [1.05, 0.95],
        ];
  const rowH = (h - pad * 2 - gut * (rows - 1)) / rows;
  const avail = w - pad * 2 - gut * (cols - 1);
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    const ws = weights[r];
    const sum = ws.reduce((a, b) => a + b, 0);
    let x = pad;
    const y = Math.round(pad + r * (rowH + gut));
    for (let c = 0; c < cols; c++) {
      const pw = (avail * ws[c]) / sum;
      const x0 = Math.round(x);
      out.push({ x: x0, y, w: Math.max(1, Math.round(x + pw) - x0), h: Math.max(1, Math.round(rowH)) });
      x += pw + gut;
    }
  }
  return out;
}

function makeLayer(
  w: number,
  h: number,
  dpr: number,
  paint: (c: Ctx) => void,
  reuse: HTMLCanvasElement | null
): HTMLCanvasElement | null {
  const cv = reuse ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d');
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  paint(c);
  return cv;
}

function wrap(c: Ctx, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (line && c.measureText(test).width > maxW) {
      lines.push(line);
      line = wd;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function rebuild(s: State, env: SceneEnv) {
  const rects = env.w > 20 && env.h > 20 ? layout(env.w, env.h) : [];
  if (rects.length !== 6) return;
  const minW = Math.min(...rects.map((r) => r.w));
  const minH = Math.min(...rects.map((r) => r.h));
  s.compact = minW < 200 || minH < 170;
  const c = env.ctx;
  s.panels.forEach((p, i) => {
    const r = rects[i];
    p.rect = r;
    const d = DEFS[i];
    const rng = mulberry(1000 + i * 77);
    p.back = makeLayer(r.w, r.h, env.dpr, (lc) => d.back(lc, r.w, r.h, p, rng), p.back);
    if (d.front) {
      const f = d.front;
      p.front = makeLayer(r.w, r.h, env.dpr, (lc) => f(lc, r.w, r.h, p, rng), p.front);
    }
    if (i === 4) p.rain = makeRain(r.w, r.h * 0.8, mulberry(42));
    p.fs = clamp(Math.min(r.w * 0.06, r.h * 0.075), 12, 16);
    c.font = font(p.fs);
    const full = d.label.toUpperCase();
    p.label = !s.compact && c.measureText(full).width < r.w - 24 ? full : d.short.toUpperCase();
    p.cap = wrap(c, d.caption.toUpperCase(), r.w - 16 - p.fs * 1.4).slice(0, 3);
  });
}

/* ---------- text boxes ---------- */

function textBox(
  c: Ctx,
  lines: string[],
  fs: number,
  ax: number,
  ay: number,
  anchor: 'tl' | 'bc',
  rot: number,
  bg: string,
  pop: number,
  alpha: number
) {
  if (alpha <= 0.01 || !lines.length) return;
  c.font = font(fs);
  const lh = fs * 1.12;
  const padX = fs * 0.6;
  const padY = fs * 0.38;
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, c.measureText(l).width);
  const bw = tw + padX * 2;
  const bh = lines.length * lh + padY * 2;
  const cx = anchor === 'tl' ? ax + bw / 2 : ax;
  const cy = anchor === 'tl' ? ay + bh / 2 : ay - bh / 2;
  c.save();
  c.globalAlpha *= alpha;
  c.translate(cx, cy);
  c.rotate(rot);
  const k = easeOutBack(pop);
  c.scale(k, k);
  c.fillStyle = INK;
  c.fillRect(-bw / 2 + 2.5, -bh / 2 + 2.5, bw, bh);
  c.fillStyle = bg;
  c.fillRect(-bw / 2, -bh / 2, bw, bh);
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.strokeRect(-bw / 2, -bh / 2, bw, bh);
  c.fillStyle = INK;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, 0, -bh / 2 + padY + lh * (i + 0.5) + fs * 0.04));
  c.restore();
}

/* ---------- per panel compositing ---------- */

function drawPanel(c: Ctx, s: State, env: SceneEnv, i: number) {
  const p = s.panels[i];
  const r = p.rect;
  if (!p.back || r.w < 4 || r.h < 4) return;
  const pr = clamp((s.age - REVEAL_DELAY - i * STAGGER) / REVEAL_DUR, 0, 1);
  if (pr <= 0) return;
  const trace = easeOutCubic(clamp(pr / 0.45, 0, 1));
  const wipe = easeInOutCubic(clamp((pr - 0.18) / 0.6, 0, 1));
  const pop = clamp((pr - 0.62) / 0.38, 0, 1);
  const f = p.focus;
  const W = r.w;
  const H = r.h;
  const scale = (0.965 + 0.035 * easeOutCubic(pr)) * (1 + 0.045 * f);
  const sw = W * scale;
  const sh = H * scale;
  const cx = Math.max(sw / 2 + 3, Math.min(env.w - sw / 2 - 3, r.x + W / 2));
  const cy = Math.max(sh / 2 + 3, Math.min(env.h - sh / 2 - 3, r.y + H / 2));
  c.save();
  c.translate(cx, cy);
  c.scale(scale, scale);
  c.translate(-W / 2, -H / 2);
  if (f > 0.01) {
    c.fillStyle = `rgba(0,0,0,${(0.65 * f).toFixed(3)})`;
    c.fillRect(6 * f, 7 * f, W, H);
  }
  c.globalAlpha = trace;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 1;
  const sl = H * 0.55;
  const D = wipe * (W + sl);
  if (wipe > 0) {
    c.save();
    c.beginPath();
    if (wipe < 1) {
      c.moveTo(0, 0);
      c.lineTo(D, 0);
      c.lineTo(D - sl, H);
      c.lineTo(0, H);
      c.closePath();
    } else c.rect(0, 0, W, H);
    c.clip();
    c.drawImage(p.back, 0, 0, W, H);
    DEFS[i].live?.(c, W, H, p, s.at);
    if (p.front) c.drawImage(p.front, 0, 0, W, H);
    if (f > 0.01) {
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, Math.hypot(W, H));
      g.addColorStop(0, `rgba(255,228,170,${(0.16 * f).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,228,170,${(0.03 * f).toFixed(3)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();
  }
  if (wipe > 0 && wipe < 1) {
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(D, 0);
    c.lineTo(D - sl, H);
    c.stroke();
    c.restore();
  }
  const d = DEFS[i];
  textBox(c, [p.label], p.fs, 7, 7, 'tl', -0.02, d.tag, pop, pop);
  const capAlpha = s.compact ? pop * clamp(f * 1.4 - 0.2, 0, 1) : pop;
  textBox(c, p.cap, p.fs, W / 2, H - 8, 'bc', d.rot, PAPER, s.compact ? Math.max(pop * 0.6, capAlpha) : pop, capAlpha);
  const dim = s.anyFocus * (1 - f) * 0.36 * wipe;
  if (dim > 0.005) {
    c.fillStyle = `rgba(7,6,15,${dim.toFixed(3)})`;
    c.fillRect(0, 0, W, H);
  }
  const inkW = 3 + 2.6 * f;
  c.globalAlpha = wipe;
  c.lineWidth = inkW;
  c.strokeStyle = INK;
  c.strokeRect(inkW / 2, inkW / 2, W - inkW, H - inkW);
  c.globalAlpha = 1;
  const L = 2 * (W + H) + 8;
  c.lineWidth = 2;
  c.strokeStyle = `rgba(246,236,210,${(0.7 + 0.3 * f).toFixed(3)})`;
  if (trace < 1) c.setLineDash([L * trace, L]);
  c.strokeRect(-1, -1, W + 2, H + 2);
  c.setLineDash([]);
  c.restore();
}

const hitPanel = (s: State, x: number, y: number) =>
  s.panels.findIndex((p) => x >= p.rect.x && x <= p.rect.x + p.rect.w && y >= p.rect.y && y <= p.rect.y + p.rect.h);

function select(s: State, env: SceneEnv, i: number) {
  s.pinned = s.pinned === i ? -1 : i;
  const bus = env.audio();
  if (bus && i >= 0) {
    noise(bus, { duration: 0.09, gain: 0.06, freq: 2600, q: 0.7 });
    tone(bus, 330 + i * 55, { type: 'triangle', decay: 0.22, gain: 0.07 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 3,
    init: (env) => ({
      panels: DEFS.map(() => ({
        rect: { x: 0, y: 0, w: 0, h: 0 },
        back: null,
        front: null,
        focus: 0,
        lights: [],
        rain: [],
        lines: [],
        fs: 12,
        label: '',
        cap: [],
      })),
      age: env.reducedMotion ? 99 : 0,
      at: AT_STILL,
      pinned: -1,
      lastHit: -1,
      anyFocus: 0,
      compact: false,
      order: [0, 1, 2, 3, 4, 5],
    }),
    resize: (s, env) => rebuild(s, env),
    update: (s, env, dt) => {
      s.age += dt;
      if (!env.reducedMotion) {
        s.at += dt;
        const rain = s.panels[4].rain;
        const lim = s.panels[4].rect.h * 0.8;
        for (const col of rain) {
          col.y += col.speed * dt;
          if (col.y - col.len * 13 > lim) {
            col.y = -rand(0, lim * 0.4);
            col.speed = rand(40, 110);
          }
          col.swap -= dt;
          if (col.swap < 0) {
            col.swap = rand(0.06, 0.25);
            col.chars[Math.floor(Math.random() * col.chars.length)] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
        }
      }
      const { pointer } = env;
      const hover = env.interactive && pointer.inside ? hitPanel(s, pointer.x, pointer.y) : -1;
      const want = hover >= 0 ? hover : s.pinned;
      s.panels.forEach((p, i) => {
        p.focus = damp(p.focus, i === want ? 1 : 0, 11, dt);
      });
      s.anyFocus = damp(s.anyFocus, want >= 0 ? 1 : 0, 9, dt);
    },
    draw: (s, env) => {
      const { ctx: c, w, h } = env;
      c.fillStyle = BG;
      c.fillRect(0, 0, w, h);
      s.order.sort((a, b) => s.panels[a].focus - s.panels[b].focus);
      for (const i of s.order) drawPanel(c, s, env, i);
    },
    onPointerMove: (s, env, x, y) => {
      const i = hitPanel(s, x, y);
      if (i !== s.lastHit) {
        s.lastHit = i;
        env.wake(900);
      }
    },
    onPointerDown: (s, env, x, y) => {
      select(s, env, hitPanel(s, x, y));
    },
    onKey: (s, env, e, down) => {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 6) return false;
      if (down && !e.repeat) select(s, env, n - 1);
      return true;
    },
    dispose: (s) => {
      for (const p of s.panels) {
        if (p.back) p.back.width = p.back.height = 0;
        if (p.front) p.front.width = p.front.height = 0;
        p.back = null;
        p.front = null;
      }
    },
  });
