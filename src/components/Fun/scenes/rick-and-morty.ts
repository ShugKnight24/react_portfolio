import { createCanvasScene, clamp, damp, easeOutBack, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, glow, glowSprite, layer } from './heroes-kit';

/**
 * Rick and Morty in the garage. Everything is flat colour with a thick dark outline, built
 * from point lists that get a small seeded jitter and are redrawn a few times a second, so the
 * lines boil the way a cartoon does. The garage is baked into three boil variants per resize;
 * Rick, Morty, the portals and whatever falls out of them are drawn live.
 *
 * A click fires the portal gun: Rick turns and aims, a green bolt flies and a swirling portal
 * opens where it lands, showing a random dimension through it (Cronenbergs, the giant heads,
 * an alien jungle, a lava world, a candy land). Portals on the floor lie flat. Dragging a
 * portal moves it. Portals spit out odd things, and anything that drops into one comes out
 * of the next, so a floor portal under a wall portal makes an endless fall. Click Morty and
 * he flinches; click Rick and he burps.
 */

type C = CanvasRenderingContext2D;

interface Portal {
  x: number;
  y: number;
  /** 0 to 1 while opening, then held; negative while closing */
  open: number;
  closing: boolean;
  floor: boolean;
  dim: number;
  age: number;
  spit: number;
  spin: number;
  drag: boolean;
}

interface Item {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  kind: number;
  size: number;
  age: number;
  cool: number;
  rest: number;
  gone: number;
}

interface Bolt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  floor: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface State {
  portals: Portal[];
  items: Item[];
  bolts: Bolt[];
  sparks: Spark[];
  dragging: Portal | null;
  dragDX: number;
  dragDY: number;
  aimX: number;
  aimY: number;
  aim: number;
  face: number;
  recoil: number;
  flinch: number;
  burp: number;
  blinkT: number;
  blink: number;
  rBlinkT: number;
  rBlink: number;
  drool: number;
  idle: number;
  touched: boolean;
  autoT: number;
  lastDim: number;
  // layout
  u: number;
  k: number;
  fy: number;
  rx: number;
  mx: number;
  portrait: boolean;
  bg: HTMLCanvasElement[];
  dims: HTMLCanvasElement[];
  dimSize: number;
  green: HTMLCanvasElement;
  warm: HTMLCanvasElement;
}

const INK = '#1c1a19';
const HAIR = '#a9d4e4';
const SKIN_R = '#ead6c3';
const SKIN_M = '#f6d8b8';
const COAT = '#f2f5f4';
const COAT_SH = '#c9d8dc';
const MAX_PORTALS = 3;
const MAX_ITEMS = 16;
const GRAV = 1500;

/* ---------- wobbly shapes ---------- */

const hsh = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const buf = new Float32Array(2048);

interface ShapeOpts {
  fill?: string | CanvasGradient | null;
  stroke?: string | null;
  lw?: number;
  closed?: boolean;
  smooth?: boolean;
  amp?: number;
  seed?: number;
  seg?: number;
}

/** Jitter and subdivide a point list, then fill and outline it */
function shape(c: C, pts: number[], boil: number, o: ShapeOpts) {
  const closed = o.closed ?? true;
  const amp = o.amp ?? 1;
  const seed = o.seed ?? 1;
  const seg = o.seg ?? 16;
  const n = pts.length / 2;
  let m = 0;
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = pts[j * 2];
    const by = pts[j * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ns = Math.max(1, Math.min(24, Math.ceil(len / seg)));
    for (let q = 0; q < ns; q++) {
      if (m >= 1020) break;
      const f = q / ns;
      const h = seed * 7.31 + m * 1.97 + boil * 13.7;
      buf[m * 2] = ax + (bx - ax) * f + (hsh(h) - 0.5) * 2 * amp;
      buf[m * 2 + 1] = ay + (by - ay) * f + (hsh(h + 3.3) - 0.5) * 2 * amp;
      m++;
    }
  }
  if (!closed && m < 1020) {
    const h = seed * 7.31 + m * 1.97 + boil * 13.7;
    buf[m * 2] = pts[(n - 1) * 2] + (hsh(h) - 0.5) * 2 * amp;
    buf[m * 2 + 1] = pts[(n - 1) * 2 + 1] + (hsh(h + 3.3) - 0.5) * 2 * amp;
    m++;
  }
  c.beginPath();
  if (o.smooth === false || m < 3) {
    c.moveTo(buf[0], buf[1]);
    for (let i = 1; i < m; i++) c.lineTo(buf[i * 2], buf[i * 2 + 1]);
    if (closed) c.closePath();
  } else if (closed) {
    c.moveTo((buf[0] + buf[2]) / 2, (buf[1] + buf[3]) / 2);
    for (let i = 1; i <= m; i++) {
      const a = i % m;
      const b = (i + 1) % m;
      c.quadraticCurveTo(buf[a * 2], buf[a * 2 + 1], (buf[a * 2] + buf[b * 2]) / 2, (buf[a * 2 + 1] + buf[b * 2 + 1]) / 2);
    }
    c.closePath();
  } else {
    c.moveTo(buf[0], buf[1]);
    for (let i = 1; i < m - 1; i++)
      c.quadraticCurveTo(buf[i * 2], buf[i * 2 + 1], (buf[i * 2] + buf[i * 2 + 2]) / 2, (buf[i * 2 + 1] + buf[i * 2 + 3]) / 2);
    c.lineTo(buf[(m - 1) * 2], buf[(m - 1) * 2 + 1]);
  }
  if (o.fill && closed) {
    c.fillStyle = o.fill;
    c.fill();
  }
  if (o.stroke !== null) {
    c.strokeStyle = o.stroke ?? INK;
    c.lineWidth = o.lw ?? 3;
    c.stroke();
  }
}

function E(cx: number, cy: number, rx: number, ry: number, n = 0) {
  const N = n || Math.max(10, Math.min(48, Math.round((rx + ry) * 0.5)));
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}
function R(x: number, y: number, w: number, h: number) {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

/* ---------- the garage (baked) ---------- */

function bakeGarage(s: State, w: number, h: number, dpr: number, boil: number) {
  const { cv, c } = layer(null, w, h, dpr);
  if (!c) return cv;
  const u = s.u;
  const fy = s.fy;
  const lw = 3 * u;
  const amp = 1.1 * u;
  const sh = (pts: number[], fill: string | null, seed: number, extra: ShapeOpts = {}) =>
    shape(c, pts, boil, { fill, lw, amp, seed, seg: 22 * u, ...extra });
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // back wall and floor
  c.fillStyle = '#93a397';
  c.fillRect(0, 0, w, fy);
  c.fillStyle = '#84948a';
  c.fillRect(0, fy - 70 * u, w, 70 * u);
  sh([-10, fy - 70 * u, w + 10, fy - 70 * u], null, 3, { closed: false });
  c.fillStyle = '#8e877a';
  c.fillRect(0, fy, w, h - fy);
  // floor stains
  for (let i = 0; i < 6; i++) {
    const x = hsh(i * 3.1) * w;
    const y = fy + 18 * u + hsh(i * 5.7) * (h - fy - 30 * u);
    sh(E(x, y, (30 + hsh(i) * 50) * u, (5 + hsh(i * 2) * 6) * u), 'rgba(128,120,107,0.35)', 40 + i, { stroke: null });
  }
  sh([-10, fy, w + 10, fy], null, 4, { closed: false, lw: lw * 1.2 });

  // the garage door on the right
  const dx = s.portrait ? w * 0.78 : w * 0.7;
  const dw = w - dx + 20;
  const dTop = fy - 330 * u;
  sh(R(dx, dTop, dw, fy - dTop), '#cdc5a6', 5);
  c.lineWidth = 2 * u;
  for (let y = dTop + 28 * u; y < fy - 6 * u; y += 30 * u) {
    sh([dx + 4 * u, y, dx + dw, y], null, 50 + y, { closed: false, lw: 2 * u });
    c.fillStyle = 'rgba(0,0,0,0.06)';
    c.fillRect(dx, y, dw, 10 * u);
  }
  sh(R(dx + 26 * u, fy - 160 * u, 40 * u, 12 * u), '#7a7466', 6);

  // pegboard with tool outlines
  const px = s.portrait ? w * 0.08 : w * 0.3;
  const pw = s.portrait ? w * 0.62 : w * 0.34;
  const pTop = fy - 380 * u;
  const pH = 140 * u;
  sh(R(px, pTop, pw, pH), '#c79f6d', 7);
  c.fillStyle = 'rgba(70,45,20,0.45)';
  for (let y = pTop + 12 * u; y < pTop + pH - 6 * u; y += 14 * u)
    for (let x = px + 12 * u; x < px + pw - 6 * u; x += 14 * u) {
      c.beginPath();
      c.arc(x, y, 1.6 * u, 0, TAU);
      c.fill();
    }
  // wrench
  const tx = px + pw * 0.16;
  const ty = pTop + pH * 0.5;
  sh([tx - 6 * u, ty - 40 * u, tx + 6 * u, ty - 40 * u, tx + 5 * u, ty + 38 * u, tx - 5 * u, ty + 38 * u], '#9aa3a8', 8);
  sh(E(tx, ty - 48 * u, 13 * u, 12 * u), '#9aa3a8', 9);
  sh(E(tx, ty - 54 * u, 5 * u, 7 * u), '#c79f6d', 10);
  // hammer
  const hx = px + pw * 0.36;
  sh(R(hx - 5 * u, ty - 30 * u, 10 * u, 70 * u), '#a8703c', 11);
  sh(R(hx - 22 * u, ty - 44 * u, 44 * u, 16 * u), '#5d6468', 12);
  // saw
  const sx = px + pw * 0.62;
  sh([sx - 34 * u, ty - 16 * u, sx + 40 * u, ty - 26 * u, sx + 40 * u, ty + 6 * u, sx - 34 * u, ty + 12 * u], '#b9c1c5', 13);
  sh(R(sx - 58 * u, ty - 20 * u, 26 * u, 34 * u), '#a8703c', 14);
  // coil of cable
  const cx = px + pw * 0.86;
  sh(E(cx, ty, 20 * u, 26 * u), null, 15, { lw: 4 * u });
  sh(E(cx, ty, 13 * u, 18 * u), null, 16, { lw: 4 * u, stroke: '#d0482f' });

  // shelf with jars
  const shx = s.portrait ? w * 0.12 : w * 0.05;
  const shw = s.portrait ? w * 0.5 : w * 0.2;
  const shy = fy - 300 * u;
  if (!s.portrait) {
    sh(R(shx, shy, shw, 12 * u), '#8a5a2e', 17);
    const jars = ['#7ad36b', '#e3c04a', '#d76b8f', '#6fb6d6', '#b48ad8'];
    for (let i = 0; i < 5; i++) {
      const jx = shx + 16 * u + i * (shw - 30 * u) / 4.4;
      const jh = (34 + hsh(i * 9) * 26) * u;
      sh(R(jx, shy - jh, 22 * u, jh), jars[i], 18 + i);
      sh(R(jx - 2 * u, shy - jh - 7 * u, 26 * u, 8 * u), '#5f5a52', 25 + i);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(jx + 4 * u, shy - jh + 6 * u, 4 * u, jh - 12 * u);
    }
  }

  // workbench
  const bx = s.portrait ? w * 0.04 : w * 0.27;
  const bw = s.portrait ? w * 0.7 : w * 0.4;
  const by = fy - 150 * u;
  sh(R(bx + 12 * u, by + 18 * u, 14 * u, fy - by - 18 * u), '#6f4524', 30);
  sh(R(bx + bw - 26 * u, by + 18 * u, 14 * u, fy - by - 18 * u), '#6f4524', 31);
  sh(R(bx + 18 * u, by + 80 * u, bw - 36 * u, 10 * u), '#6f4524', 32);
  sh(R(bx, by, bw, 20 * u), '#a8703c', 33);
  // clutter on the bench: beakers, a box of parts, a vice, a half built gadget
  const b1 = bx + bw * 0.1;
  sh([b1, by, b1 + 30 * u, by, b1 + 20 * u, by - 34 * u, b1 + 20 * u, by - 52 * u, b1 + 10 * u, by - 52 * u, b1 + 10 * u, by - 34 * u], '#d8eef0', 34, { smooth: false });
  sh([b1 + 4 * u, by - 2 * u, b1 + 26 * u, by - 2 * u, b1 + 19 * u, by - 18 * u, b1 + 11 * u, by - 18 * u], '#7cf05a', 35, { stroke: null, smooth: false });
  const b2 = bx + bw * 0.24;
  sh(R(b2, by - 44 * u, 20 * u, 44 * u), '#d8eef0', 36);
  sh(R(b2 + 2 * u, by - 22 * u, 16 * u, 20 * u), '#e45bb8', 37, { stroke: null });
  const b3 = bx + bw * 0.42;
  sh(R(b3, by - 30 * u, 70 * u, 30 * u), '#c9a46a', 38);
  sh([b3 + 10 * u, by - 30 * u, b3 + 22 * u, by - 46 * u, b3 + 36 * u, by - 32 * u], '#8d9599', 39, { closed: false });
  sh(E(b3 + 52 * u, by - 36 * u, 9 * u, 9 * u), '#9a6dd6', 40);
  const b4 = bx + bw * 0.74;
  sh(R(b4, by - 22 * u, 44 * u, 22 * u), '#5d6468', 41);
  sh(R(b4 + 10 * u, by - 40 * u, 24 * u, 18 * u), '#7b8388', 42);
  sh(R(b4 + 50 * u, by - 12 * u, 30 * u, 12 * u), '#d9534a', 43);

  // hanging lamp
  const lx = s.portrait ? w * 0.5 : w * 0.5;
  sh([lx, -10, lx, 70 * u], null, 44, { closed: false, lw: 2.4 * u });
  sh([lx - 46 * u, 112 * u, lx - 16 * u, 70 * u, lx + 16 * u, 70 * u, lx + 46 * u, 112 * u], '#3f6b57', 45, { smooth: false });
  sh(E(lx, 114 * u, 14 * u, 8 * u), '#fff3c4', 46);
  return cv;
}

/* ---------- dimensions seen through a portal (baked) ---------- */

function bakeDim(kind: number, S: number, dpr: number) {
  const { cv, c } = layer(null, S, S, dpr);
  if (!c) return cv;
  const u = S / 300;
  const lw = 3 * u;
  const sh = (pts: number[], fill: string | null, seed: number, extra: ShapeOpts = {}) =>
    shape(c, pts, 0, { fill, lw, amp: 0.8 * u, seed, seg: 16 * u, ...extra });
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const sky = (top: string, bot: string) => {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  };
  if (kind === 0) {
    // Cronenberg world: flesh sky, ruined skyline, a lumpy many eyed creature
    sky('#f0a7a0', '#c96d7a');
    for (let i = 0; i < 6; i++) {
      const x = i * 52 * u;
      const hh = (60 + hsh(i * 4) * 70) * u;
      sh([x, S * 0.66, x, S * 0.66 - hh, x + 18 * u, S * 0.66 - hh - 10 * u, x + 40 * u, S * 0.66 - hh + 6 * u, x + 46 * u, S * 0.66], '#8a5a6a', 100 + i, { smooth: false });
    }
    sh(R(-10, S * 0.66, S + 20, S * 0.4), '#a8536b', 110);
    sh([60 * u, 250 * u, 70 * u, 170 * u, 110 * u, 140 * u, 160 * u, 150 * u, 200 * u, 120 * u, 240 * u, 160 * u, 236 * u, 250 * u], '#e7a3b6', 111);
    sh(E(120 * u, 170 * u, 22 * u, 22 * u), '#fff', 112);
    sh(E(124 * u, 172 * u, 8 * u, 8 * u), INK, 113);
    sh(E(196 * u, 150 * u, 14 * u, 14 * u), '#fff', 114);
    sh(E(198 * u, 152 * u, 5 * u, 5 * u), INK, 115);
    sh(E(170 * u, 200 * u, 10 * u, 10 * u), '#fff', 116);
    sh(E(171 * u, 201 * u, 4 * u, 4 * u), INK, 117);
    sh([110 * u, 222 * u, 140 * u, 232 * u, 170 * u, 226 * u, 190 * u, 234 * u], null, 118, { closed: false });
    sh([80 * u, 160 * u, 50 * u, 130 * u, 40 * u, 140 * u], null, 119, { closed: false, lw: 6 * u, stroke: '#c9708a' });
  } else if (kind === 1) {
    // the giant heads hang over a green world
    sky('#62b6e8', '#bfe8f6');
    sh(E(70 * u, 60 * u, 30 * u, 14 * u), '#fff', 120, { stroke: null });
    sh(R(-10, S * 0.74, S + 20, S * 0.3), '#7ac74f', 121);
    const hx = 150 * u;
    const hy = 130 * u;
    sh([hx - 70 * u, hy - 40 * u, hx - 50 * u, hy - 92 * u, hx + 50 * u, hy - 92 * u, hx + 72 * u, hy - 40 * u, hx + 60 * u, hy + 60 * u, hx + 20 * u, hy + 90 * u, hx - 20 * u, hy + 90 * u, hx - 60 * u, hy + 60 * u], '#d6d2cc', 122);
    sh(E(hx - 28 * u, hy - 26 * u, 14 * u, 9 * u), '#fff', 123);
    sh(E(hx + 28 * u, hy - 26 * u, 14 * u, 9 * u), '#fff', 124);
    sh(E(hx - 26 * u, hy - 26 * u, 4 * u, 4 * u), INK, 125);
    sh(E(hx + 30 * u, hy - 26 * u, 4 * u, 4 * u), INK, 126);
    sh([hx - 48 * u, hy - 46 * u, hx - 10 * u, hy - 40 * u], null, 127, { closed: false, lw: 5 * u });
    sh([hx + 48 * u, hy - 46 * u, hx + 10 * u, hy - 40 * u], null, 128, { closed: false, lw: 5 * u });
    sh(E(hx, hy + 40 * u, 26 * u, 22 * u), '#5a2430', 129);
    sh(E(hx, hy + 52 * u, 14 * u, 8 * u), '#d9606f', 130, { stroke: null });
    sh([hx, hy - 10 * u, hx + 8 * u, hy + 12 * u, hx - 4 * u, hy + 14 * u], null, 131, { closed: false });
    sh(E(250 * u, 60 * u, 22 * u, 26 * u), '#d6d2cc', 132);
    sh(E(250 * u, 70 * u, 8 * u, 6 * u), '#5a2430', 133);
  } else if (kind === 2) {
    // alien jungle under two moons
    sky('#3b1d6e', '#a24fb0');
    sh(E(220 * u, 70 * u, 34 * u, 34 * u), '#ffe6a8', 140);
    sh(E(90 * u, 50 * u, 16 * u, 16 * u), '#b8f2ff', 141);
    sh(R(-10, S * 0.72, S + 20, S * 0.4), '#2b8a7a', 142);
    for (let i = 0; i < 5; i++) {
      const x = (30 + i * 60) * u;
      const top = (120 + hsh(i * 3) * 60) * u;
      sh([x - 5 * u, S * 0.74, x - 3 * u, top, x + 3 * u, top, x + 5 * u, S * 0.74], '#1f6b5c', 143 + i, { smooth: false });
      sh(E(x, top, 18 * u, 14 * u), i % 2 ? '#ff6fb5' : '#6fffd2', 150 + i);
      sh(E(x, top, 6 * u, 5 * u), '#fff6a8', 160 + i);
    }
    sh([140 * u, 260 * u, 150 * u, 230 * u, 170 * u, 226 * u, 180 * u, 244 * u, 176 * u, 262 * u], '#f4d03f', 170);
    sh(E(158 * u, 236 * u, 4 * u, 4 * u), INK, 171);
  } else if (kind === 3) {
    // lava world
    sky('#ff8a2a', '#5b1a12');
    sh(E(80 * u, 80 * u, 40 * u, 40 * u), '#ffd36a', 180);
    sh([-10, 200 * u, 60 * u, 150 * u, 120 * u, 190 * u, 190 * u, 130 * u, 260 * u, 180 * u, S + 10, 150 * u, S + 10, S + 10, -10, S + 10], '#2a1612', 181);
    sh([20 * u, S + 10, 110 * u, 230 * u, 170 * u, 260 * u, 230 * u, 220 * u, 300 * u, 250 * u, 300 * u, S + 10], '#ff5a1f', 182);
    sh([60 * u, S + 10, 120 * u, 250 * u, 180 * u, 280 * u, 220 * u, S + 10], '#ffd34a', 183, { stroke: null });
  } else {
    // candy land: pastel hills, a rainbow and a smiling cloud
    sky('#ffc6e8', '#bfe6ff');
    for (let i = 0; i < 5; i++) {
      const cols = ['#ff6b6b', '#ffb347', '#ffe66b', '#7be08a', '#7ab8ff'];
      c.strokeStyle = cols[i];
      c.lineWidth = 12 * u;
      c.beginPath();
      c.arc(150 * u, 250 * u, (150 - i * 12) * u, Math.PI, TAU);
      c.stroke();
    }
    sh(E(80 * u, 270 * u, 120 * u, 60 * u), '#ffb3d9', 190);
    sh(E(240 * u, 280 * u, 110 * u, 60 * u), '#b8f5c8', 191);
    sh([180 * u, 80 * u, 200 * u, 60 * u, 230 * u, 62 * u, 250 * u, 80 * u, 240 * u, 100 * u, 190 * u, 100 * u], '#ffffff', 192);
    sh(E(208 * u, 82 * u, 3 * u, 3 * u), INK, 193);
    sh(E(226 * u, 82 * u, 3 * u, 3 * u), INK, 194);
    sh([208 * u, 90 * u, 217 * u, 95 * u, 226 * u, 90 * u], null, 195, { closed: false, lw: 2 * u });
  }
  return cv;
}

/* ---------- characters ---------- */

function drawRick(c: C, s: State, boil: number, t: number) {
  const k = s.k;
  const lw = 3.2 * s.u / k;
  const amp = 0.9 / k;
  const sh = (pts: number[], fill: string | null, seed: number, extra: ShapeOpts = {}) =>
    shape(c, pts, boil, { fill, lw, amp, seed, seg: 14, ...extra });
  const breathe = Math.sin(t * 1.6) * 1.6;
  c.save();
  c.translate(s.rx, s.fy);
  c.scale(k * s.face, k);
  // shoes and trousers
  sh(E(-22, -6, 21, 9), '#33302e', 1);
  sh(E(26, -6, 21, 9), '#33302e', 2);
  sh([-36, -10, -10, -10, -6, -124, -38, -124], '#8a6a45', 3);
  sh([10, -10, 36, -10, 36, -124, 4, -124], '#8a6a45', 4);
  c.translate(0, breathe * 0.4);
  // back arm, hanging
  sh([-38, -226, -58, -220, -66, -142, -48, -138], COAT, 5);
  sh(E(-58, -130, 10, 12), SKIN_R, 6);
  // the coat, open over the blue shirt
  sh([-54, -72, 56, -72, 46, -204, 36, -240, -36, -240, -46, -204], COAT, 7);
  sh([-50, -76, -24, -76, -30, -204, -44, -204], COAT_SH, 8, { stroke: null });
  sh([-12, -238, 14, -238, 10, -150, -8, -150], '#8fc8dc', 9);
  sh([-8, -150, 10, -150, 16, -74, -14, -74], '#8a6a45', 10);
  sh([-12, -238, -24, -204, -8, -150, -14, -74], null, 11, { closed: false });
  sh([14, -238, 26, -204, 10, -150, 16, -74], null, 12, { closed: false });
  sh(E(30, -120, 7, 4), '#9fb2b8', 13, { lw: lw * 0.6 });
  // neck and head; the hair goes on first so the face sits over it
  sh([-9, -250, 9, -250, 9, -232, -9, -232], SKIN_R, 14);
  // spiky hair sweeping back from the brow, over the top and down behind the ear
  const spikes: number[] = [];
  const hcx = -6;
  const hcy = -300;
  const NS = 15;
  for (let i = 0; i <= NS; i++) {
    const a = lerp(Math.PI * 0.78, Math.PI * 1.9, i / NS);
    const back = Math.max(0, Math.cos(a) * -1);
    const r = i % 2 ? 36 : 58 + back * 16;
    spikes.push(hcx + Math.cos(a) * r * 1.05, hcy + Math.sin(a) * r);
  }
  spikes.push(hcx + 10, hcy + 10);
  sh(spikes, HAIR, 15, { smooth: false });
  sh([-24, -254, 24, -252, 34, -272, 36, -302, 30, -332, 2, -346, -26, -334, -34, -302, -32, -272], SKIN_R, 16);
  sh(E(-33, -292, 7, 11), SKIN_R, 17);
  // eyes look toward the aim point
  const lookX = clamp((s.aimX - s.rx) * s.face / 200, -1, 1) * 3;
  const lookY = clamp((s.aimY - (s.fy - 300 * k)) / 200, -1, 1) * 2.5;
  const lid = s.rBlink;
  sh(E(-10, -305, 11, 11 * (1 - lid * 0.9)), '#fff', 18);
  sh(E(17, -305, 12, 12 * (1 - lid * 0.9)), '#fff', 19);
  if (lid < 0.5) {
    c.fillStyle = INK;
    c.beginPath();
    c.arc(-9 + lookX, -305 + lookY, 2.6, 0, TAU);
    c.arc(18 + lookX, -305 + lookY, 2.6, 0, TAU);
    c.fill();
  }
  sh([-20, -292, -10, -289, -1, -293], null, 20, { closed: false, lw: lw * 0.6 });
  sh([8, -291, 18, -288, 28, -292], null, 21, { closed: false, lw: lw * 0.6 });
  // the unibrow
  const brow = s.burp > 0 ? -3 : 0;
  sh([-24, -318 + brow, -4, -323 + brow, 8, -317 + brow, 30, -324 + brow, 32, -317 + brow, 8, -310 + brow, -4, -316 + brow, -24, -312 + brow], HAIR, 22, { smooth: false });
  sh([5, -300, 13, -284, 4, -282], null, 23, { closed: false });
  // mouth, open for a burp
  if (s.burp > 0) {
    sh(E(4, -266, 14, 8 * s.burp + 2), '#5a2b2b', 24);
  } else {
    sh([-14, -268, 0, -264, 22, -268], null, 24, { closed: false });
    sh([-6, -260, 12, -260], null, 25, { closed: false, lw: lw * 0.6 });
  }
  // drool: a thin strand and a drop that swells and falls
  const d = s.drool;
  c.strokeStyle = '#d9f2ff';
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(-13, -266);
  c.quadraticCurveTo(-17, -258, -15, -252 + d * 10);
  c.stroke();
  sh(E(-15, -250 + d * 12, 3 + d * 2.5, 3.5 + d * 3.5), '#e3f6ff', 26, { lw: lw * 0.5, stroke: '#7fb4c8' });

  // front arm aims the portal gun from the shoulder
  c.save();
  c.translate(36, -226);
  const ang = s.aim;
  c.rotate(ang);
  c.translate(-s.recoil * 8, 0);
  sh([-10, -12, 74, -9, 76, 10, -8, 13], COAT, 27);
  sh([60, -10, 76, -9, 76, 10, 60, 11], COAT_SH, 28, { stroke: null });
  sh(E(84, 0, 11, 10), SKIN_R, 29);
  // the gun: a grey body, a green fluid tube on top, the emitter at the front
  sh(R(80, -10, 40, 20), '#d7dee0', 30);
  sh(R(88, -24, 24, 12), '#b7f7a0', 31);
  c.fillStyle = `rgba(110,255,80,${0.7 + 0.3 * Math.sin(t * 6)})`;
  c.fillRect(91, -21, 18, 6);
  sh(E(122, 0, 7, 9), '#7cff5a', 32);
  sh(R(84, 8, 10, 18), '#9aa5a8', 33);
  c.restore();
  c.restore();
}

function drawMorty(c: C, s: State, boil: number, t: number) {
  const k = s.k;
  const lw = 3.2 * s.u / k;
  const amp = 0.9 / k;
  const sh = (pts: number[], fill: string | null, seed: number, extra: ShapeOpts = {}) =>
    shape(c, pts, boil, { fill, lw, amp, seed: seed + 300, seg: 14, ...extra });
  const f = s.flinch;
  const hop = Math.sin(Math.min(1, f) * Math.PI) * 14 * (f > 0 ? 1 : 0);
  const shiver = f > 0 ? Math.sin(t * 50) * 1.4 * f : 0;
  c.save();
  c.translate(s.mx + shiver, s.fy);
  c.scale(k, k);
  sh(E(-16, -5, 16, 7), '#f4f4f2', 1);
  sh(E(18, -5, 16, 7), '#f4f4f2', 2);
  c.translate(0, -hop);
  const sq = 1 + Math.sin(t * 1.9) * 0.01;
  c.scale(1, sq);
  sh([-24, -10, -4, -10, -2, -82, -27, -82], '#3d6fb6', 3);
  sh([4, -10, 24, -10, 27, -82, 2, -82], '#3d6fb6', 4);
  // arms go up a little when he flinches
  const up = f * 26;
  sh([-30, -150, -40, -132, -38 - up * 0.3, -96 - up, -30 - up * 0.3, -96 - up], SKIN_M, 5);
  sh(E(-36 - up * 0.3, -90 - up, 8, 8), SKIN_M, 6);
  sh([30, -150, 40, -132, 38 + up * 0.3, -96 - up, 30 + up * 0.3, -96 - up], SKIN_M, 7);
  sh(E(36 + up * 0.3, -90 - up, 8, 8), SKIN_M, 8);
  sh([-30, -80, 30, -80, 33, -150, 18, -160, -18, -160, -33, -150], '#f2d74e', 9);
  sh([-33, -150, -44, -128, -32, -122, -26, -138], '#f2d74e', 10);
  sh([33, -150, 44, -128, 32, -122, 26, -138], '#f2d74e', 11);
  sh([-10, -160, 0, -150, 10, -160], null, 12, { closed: false, lw: lw * 0.7 });
  sh(R(-7, -170, 14, 12), SKIN_M, 13);
  sh(E(0, -200, 41, 40), SKIN_M, 14);
  sh(E(-41, -196, 6, 9), SKIN_M, 15);
  sh(E(41, -196, 6, 9), SKIN_M, 16);
  sh([-42, -206, -40, -228, -20, -243, 8, -246, 32, -236, 43, -212, 36, -216, 22, -226, -8, -229, -30, -222, -37, -206], '#6b4423', 17);
  const eye = 12 + f * 4;
  const lid = s.blink;
  sh(E(-13, -196, eye, eye * (1 - lid * 0.9)), '#fff', 18);
  sh(E(14, -196, eye, eye * (1 - lid * 0.9)), '#fff', 19);
  if (lid < 0.5) {
    const lx = clamp((s.aimX - s.mx) / 300, -1, 1) * 2;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(-12 + lx, -195, 2.2, 0, TAU);
    c.arc(15 + lx, -195, 2.2, 0, TAU);
    c.fill();
  }
  if (f > 0.2) sh(E(1, -170, 9, 6 + f * 4), '#5a2b2b', 20);
  else sh([-10, -172, -4, -169, 2, -172, 8, -169, 12, -172], null, 20, { closed: false, lw: lw * 0.7 });
  c.restore();
}

/* ---------- portals ---------- */

function portalR(s: State, p: Portal) {
  const base = (s.portrait ? 62 : 74) * s.u;
  const o = p.closing ? Math.max(0, p.open) : easeOutBack(clamp(p.open, 0, 1));
  return { rx: base * o * (p.floor ? 1.25 : 1), ry: base * o * (p.floor ? 0.3 : 1.28) };
}

function drawPortal(c: C, s: State, p: Portal, t: number) {
  const { rx, ry } = portalR(s, p);
  if (rx < 1) return;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.green, p.x, p.y, Math.max(rx, ry) * 2.1, 0.55);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  const N = 56;
  const edge = (scale: number, phase: number) => {
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const m = 1 + 0.05 * Math.sin(a * 5 + t * 4 + phase) + 0.035 * Math.sin(a * 9 - t * 6 + p.spin) + (p.drag ? 0.04 * Math.sin(a * 3 + t * 12) : 0);
      const x = p.x + Math.cos(a) * rx * m * scale;
      const y = p.y + Math.sin(a) * ry * m * scale;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  // through the portal
  c.save();
  edge(0.98, 0);
  c.clip();
  const dim = s.dims[p.dim];
  if (dim) {
    const W = Math.max(rx, ry * (p.floor ? 3.6 : 1)) * 2.2;
    const H = p.floor ? ry * 2.4 : W;
    c.drawImage(dim, p.x - W / 2, p.y - H / 2, W, H);
  }
  // swirl arms over the edge of the view
  c.translate(p.x, p.y);
  c.scale(rx, ry);
  const sw = c.createRadialGradient(0, 0, 0.35, 0, 0, 1);
  sw.addColorStop(0, 'rgba(90,230,60,0)');
  sw.addColorStop(0.6, 'rgba(90,230,60,0.35)');
  sw.addColorStop(1, 'rgba(60,200,40,1)');
  c.fillStyle = sw;
  c.fillRect(-1.2, -1.2, 2.4, 2.4);
  c.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    c.beginPath();
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      const a = arm * (TAU / 5) + p.spin + q * 2.6;
      const r = 1 - q * 0.62;
      if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.strokeStyle = arm % 2 ? 'rgba(200,255,140,0.55)' : 'rgba(40,170,30,0.5)';
    c.lineWidth = 0.09;
    c.stroke();
  }
  c.restore();
  // the rim: thick bright green with a dark outline and a pale inner edge
  c.lineJoin = 'round';
  edge(1, 0);
  c.strokeStyle = INK;
  c.lineWidth = 14 * s.u;
  c.stroke();
  c.strokeStyle = '#5ee83a';
  c.lineWidth = 9 * s.u;
  c.stroke();
  edge(0.97, 0.8);
  c.strokeStyle = '#d8ff9c';
  c.lineWidth = 3 * s.u;
  c.stroke();
}

function spawnSparks(s: State, x: number, y: number, n: number, spd: number) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(0.3, 1) * spd * s.u;
    if (s.sparks.length > 160) s.sparks.shift();
    s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9) });
  }
}

/* ---------- things that fall out ---------- */

function drawItem(c: C, s: State, it: Item, boil: number) {
  const z = it.size * s.u * (it.gone > 0 ? 1 - it.gone : 1);
  if (z <= 0.5) return;
  c.save();
  c.translate(it.x, it.y);
  c.rotate(it.rot);
  c.scale(z / 20, z / 20);
  const lw = 3 * s.u * (20 / z);
  const sh = (pts: number[], fill: string | null, seed: number, extra: ShapeOpts = {}) =>
    shape(c, pts, boil, { fill, lw: Math.min(lw, 4.5), amp: 0.5, seed: seed + it.kind * 30, seg: 8, ...extra });
  switch (it.kind) {
    case 0: // a pink household gadget with a knob, a nub and a fin
      sh([-16, 10, -18, -2, -8, -14, 8, -12, 18, -2, 16, 10, 4, 16, -6, 16], '#f29ac0', 1);
      sh(E(0, -16, 6, 5), '#e06d9d', 2);
      sh([10, -6, 24, -14, 22, -2], '#f7c2d8', 3);
      sh(E(-6, 4, 4, 3), '#c2507e', 4);
      break;
    case 1: // a pickle with a familiar face
      sh(E(0, 0, 9, 21), '#5fae3a', 5);
      sh(E(-3, -8, 3.4, 3.4), '#fff', 6, { lw: 1.4 });
      sh(E(4, -8, 3.4, 3.4), '#fff', 7, { lw: 1.4 });
      c.fillStyle = INK;
      c.fillRect(-4, -9, 1.6, 1.6);
      c.fillRect(3.4, -9, 1.6, 1.6);
      sh([-5, -13, 0, -14, 6, -13], null, 8, { closed: false, lw: 1.6 });
      sh([-4, 0, 0, 2, 5, 0], null, 9, { closed: false, lw: 1.6 });
      break;
    case 2: // a blue box with a big button
      sh(R(-14, -10, 28, 22), '#5aa9e6', 10);
      sh(E(0, -12, 7, 4), '#e8e8e8', 11);
      break;
    case 3: // a golden seed
      sh([0, -18, 10, -4, 8, 12, 0, 18, -8, 12, -10, -4], '#f2c84b', 12);
      sh([0, -12, 0, 12], null, 13, { closed: false, lw: 1.5 });
      break;
    case 4: // a small blob with too many eyes
      sh([-16, 12, -14, -6, -4, -14, 10, -10, 16, 2, 12, 14], '#e7a3b6', 14);
      sh(E(-4, -2, 4, 4), '#fff', 15, { lw: 1.4 });
      sh(E(7, 2, 3, 3), '#fff', 16, { lw: 1.4 });
      c.fillStyle = INK;
      c.fillRect(-4, -2, 1.8, 1.8);
      c.fillRect(7, 2, 1.6, 1.6);
      break;
    default: // a flask of something green
      sh([-4, -16, 4, -16, 4, -6, 14, 14, -14, 14, -4, -6], '#dff3f4', 17, { smooth: false });
      sh([-11, 12, 11, 12, 6, 4, -6, 4], '#7cf05a', 18, { stroke: null, smooth: false });
  }
  c.restore();
}

/* ---------- actions ---------- */

function setAim(s: State, x: number, y: number) {
  s.aimX = x;
  s.aimY = y;
  s.face = x < s.rx - 20 * s.u ? -1 : 1;
}

function gunTip(s: State) {
  const k = s.k;
  const sx = s.rx + 36 * k * s.face;
  const sy = s.fy - 226 * k;
  const ang = Math.atan2(s.aimY - sy, s.aimX - sx);
  return { x: sx + Math.cos(ang) * 124 * k, y: sy + Math.sin(ang) * 124 * k, ang };
}

function fire(s: State, env: SceneEnv, x: number, y: number) {
  setAim(s, x, y);
  const floor = y > s.fy - 34 * s.u;
  const ty = floor ? s.fy + 6 * s.u : clamp(y, 80 * s.u, s.fy - 110 * s.u);
  const tx = clamp(x, 70 * s.u, env.w - 70 * s.u);
  const tip = gunTip(s);
  s.bolts.push({ x0: tip.x, y0: tip.y, x1: tx, y1: ty, t: 0, floor });
  s.recoil = 1;
  const bus = env.audio();
  if (bus) {
    tone(bus, 900, { type: 'sine', attack: 0.004, decay: 0.16, gain: 0.08, glideTo: 2400 });
    noise(bus, { duration: 0.12, gain: 0.05, freq: 3000, q: 1.2, type: 'bandpass' });
  }
}

function openPortal(s: State, env: SceneEnv, x: number, y: number, floor: boolean) {
  const live = s.portals.filter((p) => !p.closing);
  if (live.length >= MAX_PORTALS) live[0].closing = true;
  let dim = Math.floor(Math.random() * 5);
  if (dim === s.lastDim) dim = (dim + 1 + Math.floor(Math.random() * 4)) % 5;
  s.lastDim = dim;
  s.portals.push({ x, y, open: 0, closing: false, floor, dim, age: 0, spit: rand(0.9, 1.8), spin: rand(0, TAU), drag: false });
  spawnSparks(s, x, y, 18, 260);
  s.flinch = 1;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.6, gain: 0.12, freq: 700, q: 0.8, type: 'bandpass' });
    tone(bus, 180, { type: 'sawtooth', attack: 0.02, decay: 0.45, gain: 0.04, glideTo: 90 });
    tone(bus, 320, { type: 'sine', attack: 0.03, decay: 0.5, gain: 0.06, glideTo: 760 });
    tone(bus, 760, { type: 'square', attack: 0.004, decay: 0.08, gain: 0.02, delay: 0.25, glideTo: 1100 });
  }
}

function spit(s: State, env: SceneEnv, p: Portal) {
  if (s.items.length >= MAX_ITEMS) {
    const old = s.items.find((i) => i.gone === 0);
    if (old) old.gone = 0.001;
  }
  const up = p.floor ? -rand(700, 980) : -rand(200, 420);
  s.items.push({
    x: p.x + rand(-10, 10) * s.u,
    y: p.y - (p.floor ? 10 * s.u : 0),
    vx: rand(-260, 260) * s.u,
    vy: up * s.u,
    rot: rand(0, TAU),
    vr: rand(-6, 6),
    kind: Math.floor(Math.random() * 6),
    size: rand(18, 26),
    age: 0,
    cool: 0.45,
    rest: 0,
    gone: 0,
  });
  spawnSparks(s, p.x, p.y, 6, 150);
  const bus = env.audio();
  if (bus) tone(bus, 420, { type: 'triangle', attack: 0.004, decay: 0.14, gain: 0.06, glideTo: 880 });
}

function hitPortal(s: State, x: number, y: number) {
  for (let i = s.portals.length - 1; i >= 0; i--) {
    const p = s.portals[i];
    if (p.closing) continue;
    const { rx, ry } = portalR(s, p);
    const ex = (x - p.x) / Math.max(1, rx * 1.15);
    const ey = (y - p.y) / Math.max(1, Math.max(ry, 26 * s.u) * 1.15);
    if (ex * ex + ey * ey <= 1) return p;
  }
  return null;
}

function hitChar(s: State, x: number, y: number, cx: number, top: number, half: number) {
  return Math.abs(x - cx) < half * s.k && y > s.fy - top * s.k && y < s.fy;
}

function press(s: State, env: SceneEnv, x: number, y: number) {
  s.touched = true;
  s.idle = 0;
  const p = hitPortal(s, x, y);
  if (p) {
    s.dragging = p;
    p.drag = true;
    s.dragDX = p.x - x;
    s.dragDY = p.y - y;
    return;
  }
  const bus = env.audio();
  if (hitChar(s, x, y, s.mx, 250, 46)) {
    s.flinch = 1;
    if (bus) {
      tone(bus, 620, { type: 'square', attack: 0.004, decay: 0.12, gain: 0.03, glideTo: 980 });
      tone(bus, 900, { type: 'square', attack: 0.004, decay: 0.1, gain: 0.025, delay: 0.12, glideTo: 700 });
    }
    return;
  }
  if (hitChar(s, x, y, s.rx, 350, 60)) {
    s.burp = 1;
    if (bus) {
      tone(bus, 95, { type: 'sawtooth', attack: 0.02, decay: 0.45, gain: 0.08, glideTo: 62 });
      noise(bus, { duration: 0.4, gain: 0.06, freq: 260, q: 1.5, type: 'lowpass' });
    }
    return;
  }
  fire(s, env, x, y);
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  s.portrait = h > w * 1.1;
  s.u = s.portrait ? clamp(w / 520, 0.55, 1.2) : clamp(Math.min(w / 1200, h / 720), 0.5, 1.6);
  s.k = s.portrait ? w / 560 : h / 760;
  s.fy = s.portrait ? h * 0.82 : h * 0.83;
  s.rx = s.portrait ? w * 0.28 : w * 0.2;
  s.mx = s.portrait ? w * 0.72 : w * 0.35;
  freeCanvas(...s.bg, ...s.dims);
  s.bg = [0, 1, 2].map((b) => bakeGarage(s, w, h, dpr, b));
  s.dimSize = 300 * Math.max(s.u, 0.6);
  s.dims = [0, 1, 2, 3, 4].map((k) => bakeDim(k, s.dimSize, dpr));
  // keep anything already open on screen
  for (const p of s.portals) {
    p.x = clamp(p.x, 60 * s.u, w - 60 * s.u);
    p.y = p.floor ? s.fy + 6 * s.u : clamp(p.y, 80 * s.u, s.fy - 110 * s.u);
  }
  if (!s.portals.length) {
    // something to look at from the start: a wall portal over a floor portal
    const wx = s.portrait ? w * 0.5 : w * 0.62;
    s.portals.push({ x: wx, y: s.portrait ? h * 0.3 : h * 0.34, open: 1, closing: false, floor: false, dim: 1, age: 1, spit: 0.6, spin: 0, drag: false });
    s.portals.push({ x: s.portrait ? w * 0.5 : w * 0.56, y: s.fy + 6 * s.u, open: 1, closing: false, floor: true, dim: 0, age: 1, spit: 3, spin: 1, drag: false });
    s.aimX = wx;
    s.aimY = h * 0.34;
    s.aim = -0.5;
  }
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.2,
    init: () => ({
      portals: [],
      items: [],
      bolts: [],
      sparks: [],
      dragging: null,
      dragDX: 0,
      dragDY: 0,
      aimX: 0,
      aimY: 0,
      aim: -0.4,
      face: 1,
      recoil: 0,
      flinch: 0,
      burp: 0,
      blinkT: 2,
      blink: 0,
      rBlinkT: 3.3,
      rBlink: 0,
      drool: 0,
      idle: 0,
      touched: false,
      autoT: 2.5,
      lastDim: -1,
      u: 1,
      k: 1,
      fy: 0,
      rx: 0,
      mx: 0,
      portrait: false,
      bg: [],
      dims: [],
      dimSize: 300,
      green: glowSprite(128, [
        [0, 'rgba(140,255,90,0.8)'],
        [0.4, 'rgba(80,230,60,0.25)'],
        [1, 'rgba(40,200,40,0)'],
      ]),
      warm: glowSprite(128, [
        [0, 'rgba(255,240,190,0.55)'],
        [0.5, 'rgba(255,220,150,0.12)'],
        [1, 'rgba(255,210,140,0)'],
      ]),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      const { w } = env;
      s.idle += dt;
      // aim follows the target; the arm stays in a believable range
      const sx = s.rx + 36 * s.k * s.face;
      const sy = s.fy - 226 * s.k;
      let want = Math.atan2(s.aimY - sy, (s.aimX - sx) * s.face);
      want = clamp(want, -1.35, 0.9);
      s.aim = damp(s.aim, want, 14, dt);
      s.recoil = Math.max(0, s.recoil - dt * 5);
      s.flinch = Math.max(0, s.flinch - dt * 1.6);
      s.burp = Math.max(0, s.burp - dt * 1.5);
      s.drool += dt * 0.35;
      if (s.drool > 1) s.drool = 0;
      s.blinkT -= dt;
      if (s.blinkT <= 0) {
        s.blink = 1;
        s.blinkT = rand(2, 4.5);
      }
      s.blink = Math.max(0, s.blink - dt * 7);
      s.rBlinkT -= dt;
      if (s.rBlinkT <= 0) {
        s.rBlink = 1;
        s.rBlinkT = rand(2.5, 5);
      }
      s.rBlink = Math.max(0, s.rBlink - dt * 6);

      // the autopilot keeps the tile and an idle garage busy
      if (!env.interactive || s.idle > (s.touched ? 8 : 3)) {
        s.autoT -= dt;
        if (s.autoT <= 0) {
          s.autoT = rand(2.6, 4);
          // pick the spot farthest from the portals already open
          let bx = 0;
          let by = 0;
          let best = -1;
          for (let k = 0; k < 8; k++) {
            const floor = Math.random() < 0.3;
            const x = rand(s.portrait ? env.w * 0.2 : env.w * 0.48, env.w * 0.9);
            const y = floor ? s.fy : rand(env.h * 0.18, s.fy - 140 * s.u);
            let d = Infinity;
            for (const p of s.portals) if (!p.closing) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
            if (d > best) {
              best = d;
              bx = x;
              by = y;
            }
          }
          fire(s, env, bx, by);
        }
      }

      for (const b of s.bolts) {
        b.t += dt / 0.2;
        if (b.t >= 1) openPortal(s, env, b.x1, b.y1, b.floor);
      }
      s.bolts = s.bolts.filter((b) => b.t < 1);

      const live = s.portals.filter((p) => !p.closing && p.open > 0.6);
      for (const p of s.portals) {
        p.age += dt;
        p.spin += dt * 2.4;
        if (p.closing) p.open -= dt * 3;
        else p.open = Math.min(1, p.open + dt * 2.6);
        if (!p.closing && p.open >= 1) {
          p.spit -= dt;
          if (p.spit <= 0) {
            p.spit = rand(2.2, 4.2);
            spit(s, env, p);
          }
        }
        if (!p.closing && Math.random() < dt * 8) {
          const { rx, ry } = portalR(s, p);
          const a = rand(0, TAU);
          spawnSparks(s, p.x + Math.cos(a) * rx, p.y + Math.sin(a) * ry, 1, 50);
        }
      }
      s.portals = s.portals.filter((p) => !(p.closing && p.open <= 0));

      // items: gravity, bounces, and the trip through the portals
      const bus = env.audio();
      for (const it of s.items) {
        it.age += dt;
        it.cool -= dt;
        if (it.gone > 0) {
          it.gone += dt * 3;
          continue;
        }
        it.vy += GRAV * s.u * dt;
        const vmax = 2200 * s.u;
        it.vy = clamp(it.vy, -vmax, vmax);
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        const r = it.size * s.u;
        if (it.cool <= 0 && live.length >= 2) {
          for (let i = 0; i < live.length; i++) {
            const p = live[i];
            const { rx, ry } = portalR(s, p);
            const ex = (it.x - p.x) / (rx * 0.8);
            const ey = (it.y - p.y) / (Math.max(ry, 22 * s.u) * 0.8);
            if (ex * ex + ey * ey < 1 && (!p.floor || it.vy > 0)) {
              const out = live[(i + 1) % live.length];
              it.x = out.x;
              it.y = out.y + (out.floor ? -24 * s.u : 0);
              if (out.floor) it.vy = -Math.max(Math.abs(it.vy), 700 * s.u);
              it.cool = 0.3;
              it.rest = 0;
              spawnSparks(s, p.x, p.y, 5, 140);
              spawnSparks(s, out.x, out.y, 5, 140);
              if (bus) tone(bus, 1100, { type: 'sine', attack: 0.003, decay: 0.12, gain: 0.04, glideTo: 380 });
              break;
            }
          }
        }
        if (it.y > s.fy - r * 0.6) {
          it.y = s.fy - r * 0.6;
          if (it.vy > 160 * s.u && bus) tone(bus, 140 + it.kind * 20, { type: 'triangle', attack: 0.002, decay: 0.08, gain: Math.min(0.06, it.vy / (s.u * 20000)) });
          it.vy = -it.vy * 0.42;
          it.vx *= 0.72;
          it.vr = it.vx / (r * 1.2);
          if (Math.abs(it.vy) < 60 * s.u) it.vy = 0;
        }
        if (it.x < r) {
          it.x = r;
          it.vx = Math.abs(it.vx) * 0.6;
        } else if (it.x > w - r) {
          it.x = w - r;
          it.vx = -Math.abs(it.vx) * 0.6;
        }
        if (it.vy === 0 && it.y >= s.fy - r * 0.61) {
          it.vx = damp(it.vx, 0, 4, dt);
          it.vr = it.vx / (r * 1.2);
          it.rest += dt;
          if (it.rest > 7) it.gone = 0.001;
        }
      }
      s.items = s.items.filter((it) => it.gone < 1);
      for (const sp of s.sparks) {
        sp.life -= dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= Math.exp(-3 * dt);
        sp.vy *= Math.exp(-3 * dt);
      }
      s.sparks = s.sparks.filter((sp) => sp.life > 0);
      if (env.reducedMotion && (s.dragging || s.bolts.length || s.portals.some((p) => p.open < 1))) env.wake(300);
      void t;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const boil = env.reducedMotion ? 0 : Math.floor(t * 8) % 3;
      const bg = s.bg[boil];
      if (bg) ctx.drawImage(bg, 0, 0, w, h);
      else {
        ctx.fillStyle = '#93a397';
        ctx.fillRect(0, 0, w, h);
      }
      // lamp light pooling on the floor
      const lx = w * 0.5;
      ctx.fillStyle = 'rgba(255,240,190,0.08)';
      ctx.beginPath();
      ctx.moveTo(lx - 40 * s.u, 114 * s.u);
      ctx.lineTo(lx + 40 * s.u, 114 * s.u);
      ctx.lineTo(lx + 260 * s.u, s.fy + 40 * s.u);
      ctx.lineTo(lx - 260 * s.u, s.fy + 40 * s.u);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.warm, lx, 118 * s.u, 90 * s.u, 0.8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const p of s.portals) if (p.floor) drawPortal(ctx, s, p, t);
      for (const p of s.portals) if (!p.floor) drawPortal(ctx, s, p, t);
      // the portals throw green light on the floor
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.portals) {
        const { rx } = portalR(s, p);
        if (rx > 2) {
          ctx.save();
          ctx.translate(p.x, s.fy + 10 * s.u);
          ctx.scale(1, 0.18);
          glow(ctx, s.green, 0, 0, rx * 2.4, p.floor ? 0.25 : 0.35);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // shadows under the characters
      ctx.fillStyle = 'rgba(40,36,30,0.25)';
      ctx.beginPath();
      ctx.ellipse(s.rx, s.fy + 2, 70 * s.k, 10 * s.k, 0, 0, TAU);
      ctx.ellipse(s.mx, s.fy + 2, 50 * s.k, 8 * s.k, 0, 0, TAU);
      ctx.fill();
      drawMorty(ctx, s, boil, t);
      drawRick(ctx, s, boil, t);

      for (const it of s.items) drawItem(ctx, s, it, boil);

      // bolts and sparks
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bolts) {
        const x = lerp(b.x0, b.x1, b.t);
        const y = lerp(b.y0, b.y1, b.t);
        const tx = lerp(b.x0, b.x1, Math.max(0, b.t - 0.25));
        const ty = lerp(b.y0, b.y1, Math.max(0, b.t - 0.25));
        ctx.strokeStyle = 'rgba(140,255,90,0.9)';
        ctx.lineWidth = 6 * s.u;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        glow(ctx, s.green, x, y, 26 * s.u, 1);
      }
      if (s.recoil > 0.5) {
        const tip = gunTip(s);
        glow(ctx, s.green, tip.x, tip.y, 40 * s.u * s.recoil, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      for (const sp of s.sparks) {
        const a = clamp(sp.life * 1.6, 0, 1);
        ctx.fillStyle = `rgba(190,255,130,${a})`;
        ctx.strokeStyle = `rgba(28,26,25,${a})`;
        ctx.lineWidth = 1.5 * s.u;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.2 * s.u, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      // a soft vignette keeps the eye on the middle
      const vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.4, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(20,24,20,0)');
      vg.addColorStop(1, 'rgba(20,24,20,0.3)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x, y) => press(s, env, x, y),
    onPointerMove: (s, env, x, y) => {
      const p = s.dragging;
      if (!p) return;
      s.idle = 0;
      p.x = clamp(x + s.dragDX, 60 * s.u, env.w - 60 * s.u);
      const ny = y + s.dragDY;
      p.floor = ny > s.fy - 34 * s.u;
      p.y = p.floor ? s.fy + 6 * s.u : clamp(ny, 80 * s.u, s.fy - 110 * s.u);
      setAim(s, p.x, p.y);
    },
    onPointerUp: (s) => {
      if (s.dragging) s.dragging.drag = false;
      s.dragging = null;
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) {
        s.touched = true;
        s.idle = 0;
        const floor = Math.random() < 0.3;
        fire(s, env, rand(env.w * 0.45, env.w * 0.9), floor ? s.fy : rand(env.h * 0.18, s.fy - 140 * s.u));
      }
      return true;
    },
    dispose: (s) => {
      freeCanvas(...s.bg, ...s.dims, s.green, s.warm);
      s.bg = [];
      s.dims = [];
    },
  });
