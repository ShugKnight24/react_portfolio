import { createCanvasScene, clamp, damp, easeOutBack, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Are You Watching: two tesla coils on a theatre stage with a top hat on a stool between them.
 * Polish over the original: built coil towers (cabinet, primary, wound secondary, torus top)
 * drawn once into a cached stage layer, branching lightning from midpoint displacement that
 * re-forms at ~18Hz, idle streamers and bridges with crackle, and a discharge that lights the
 * room, strikes the hat and makes it vanish in a puff (the next discharge brings it back).
 */

enum Kind {
  Streamer,
  Bridge,
  Ground,
  Hat,
}

interface Arc {
  kind: Kind;
  side: -1 | 1;
  life: number;
  max: number;
  power: number;
  flicker: number;
  // endpoints, re-aimed on every regen
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Streamer direction and reach (units) so re-forms stay in the same place */
  dir: number;
  reach: number;
  pts: Float32Array;
  br: Float32Array[];
  brOn: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface State {
  arcs: Arc[];
  puffs: Puff[];
  sparks: Spark[];
  nextSpark: number;
  regen: number;
  streamerIn: number;
  bridgeIn: number;
  groundIn: number;
  /** Seconds since the last discharge started, or -1 */
  discharge: number;
  struck: boolean;
  /** Hat present (target), and its animated 0..1 visibility */
  hatOn: boolean;
  hatK: number;
  hatT: number;
  flash: number;
  glowL: number;
  glowR: number;
  heard: boolean;
  // layout
  s: number;
  /** Coil distance from centre in units, pulled in on narrow screens */
  coil: number;
  cx: number;
  gy: number;
  layer: HTMLCanvasElement | null;
  sprite: HTMLCanvasElement | null;
  smoke: HTMLCanvasElement | null;
}

const MAIN_DEPTH = 6;
const MAIN_N = (1 << MAIN_DEPTH) + 1;
const BR_DEPTH = 4;
const BR_N = (1 << BR_DEPTH) + 1;
const MAX_ARCS = 18;
const MAX_SPARKS = 120;
const MAX_PUFFS = 40;
const REGEN = 1 / 18;
const COIL_X = 205;
const TORUS_Y = 268;
const TORUS_RX = 54;
const TORUS_RY = 17;
const SEAT_Y = 92;
const HAT_H = 56;

const coilX = (s: State, side: -1 | 1) => s.cx + side * s.coil * s.s;
const torusY = (s: State) => s.gy - TORUS_Y * s.s;
const hatTop = (s: State) => s.gy - (SEAT_Y + HAT_H) * s.s;

/** Midpoint displacement between the two end points already written in pts */
function displace(pts: Float32Array, n: number, rough: number) {
  for (let step = n - 1; step > 1; step >>= 1) {
    const half = step >> 1;
    for (let i = 0; i + step < n; i += step) {
      const ax = pts[i * 2];
      const ay = pts[i * 2 + 1];
      const bx = pts[(i + step) * 2];
      const by = pts[(i + step) * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const off = (Math.random() - 0.5) * len * rough;
      const m = i + half;
      pts[m * 2] = (ax + bx) / 2 + (-dy / len) * off;
      pts[m * 2 + 1] = (ay + by) / 2 + (dx / len) * off;
    }
  }
}

function aim(s: State, a: Arc) {
  const u = s.s;
  const tx = coilX(s, a.side);
  const ty = torusY(s);
  switch (a.kind) {
    case Kind.Streamer: {
      const k = a.dir;
      a.x0 = tx + Math.cos(k) * TORUS_RX * u * 0.9;
      a.y0 = ty + Math.sin(k) * TORUS_RY * u * 0.9;
      a.x1 = a.x0 + Math.cos(k) * a.reach * u + rand(-8, 8) * u;
      a.y1 = a.y0 + Math.sin(k) * a.reach * u * 0.9 + rand(-8, 8) * u;
      break;
    }
    case Kind.Bridge:
      a.x0 = coilX(s, -1) + TORUS_RX * u * 0.85;
      a.y0 = ty + rand(-6, 4) * u;
      a.x1 = coilX(s, 1) - TORUS_RX * u * 0.85;
      a.y1 = ty + rand(-6, 4) * u;
      break;
    case Kind.Ground:
      a.x0 = tx + a.side * TORUS_RX * u * 0.8;
      a.y0 = ty + 4 * u;
      a.x1 = clamp(tx + a.side * a.reach * u, 12, s.cx * 2 - 12);
      a.y1 = s.gy + rand(2, 14) * u;
      break;
    case Kind.Hat:
      a.x0 = tx - a.side * TORUS_RX * u * 0.8;
      a.y0 = ty + 2 * u;
      a.x1 = s.cx + rand(-14, 14) * u;
      a.y1 = hatTop(s) + rand(-2, 10) * u;
      break;
  }
}

function build(s: State, a: Arc) {
  aim(s, a);
  const p = a.pts;
  p[0] = a.x0;
  p[1] = a.y0;
  p[(MAIN_N - 1) * 2] = a.x1;
  p[(MAIN_N - 1) * 2 + 1] = a.y1;
  displace(p, MAIN_N, a.kind === Kind.Streamer ? 0.9 : 0.62);
  a.flicker = rand(0.55, 1);
  const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
  a.brOn = a.kind === Kind.Streamer ? (Math.random() < 0.5 ? 1 : 0) : 1 + Math.floor(Math.random() * a.br.length);
  if (a.brOn > a.br.length) a.brOn = a.br.length;
  const main = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
  for (let b = 0; b < a.brOn; b++) {
    const q = a.br[b];
    const k = Math.floor(rand(0.15, 0.7) * (MAIN_N - 1));
    const bx = p[k * 2];
    const by = p[k * 2 + 1];
    const ang = main + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9);
    const bl = len * rand(0.18, 0.4);
    q[0] = bx;
    q[1] = by;
    q[(BR_N - 1) * 2] = bx + Math.cos(ang) * bl;
    q[(BR_N - 1) * 2 + 1] = by + Math.sin(ang) * bl;
    displace(q, BR_N, 0.8);
  }
}

function spawnArc(s: State, kind: Kind, side: -1 | 1, life: number, power: number) {
  let a = s.arcs.find((x) => x.life <= 0);
  if (!a) {
    // steal the weakest streamer
    a = s.arcs.reduce((m, x) => (x.kind === Kind.Streamer && x.life < m.life ? x : m), s.arcs[0]);
  }
  a.kind = kind;
  a.side = side;
  a.life = life;
  a.max = life;
  a.power = power;
  a.dir = side === -1 ? rand(-Math.PI * 0.95, -Math.PI * 0.35) : rand(-Math.PI * 0.65, -Math.PI * 0.05);
  if (Math.random() < 0.3) a.dir = side === -1 ? rand(Math.PI * 0.85, Math.PI * 1.1) : rand(-0.1, 0.15);
  a.reach = kind === Kind.Ground ? rand(70, 130) : rand(40, 115);
  build(s, a);
  return a;
}

function emitSparks(s: State, x: number, y: number, n: number, speed: number) {
  for (let i = 0; i < n; i++) {
    const p = s.sparks[s.nextSpark];
    s.nextSpark = (s.nextSpark + 1) % MAX_SPARKS;
    const a = rand(0, TAU);
    const v = speed * rand(0.2, 1);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - speed * 0.3;
    p.max = rand(0.3, 0.8);
    p.life = p.max;
  }
}

function puff(s: State, x: number, y: number, n: number) {
  const u = s.s;
  let made = 0;
  for (const p of s.puffs) {
    if (made >= n) break;
    if (p.life > 0) continue;
    const a = rand(0, TAU);
    const v = rand(15, 70) * u;
    p.x = x + rand(-22, 22) * u;
    p.y = y + rand(-26, 14) * u;
    p.vx = Math.cos(a) * v * 1.4;
    p.vy = Math.sin(a) * v * 0.6 - rand(10, 40) * u;
    p.r = rand(14, 26) * u;
    p.max = rand(0.8, 1.5);
    p.life = p.max;
    made++;
  }
}

function crackle(bus: AudioBus, big: boolean) {
  noise(bus, {
    duration: big ? rand(0.08, 0.16) : rand(0.03, 0.07),
    gain: big ? 0.22 : 0.05,
    freq: rand(2400, 5200),
    q: 0.6,
    type: 'highpass',
  });
}

/** Everything that never moves: stage, curtains, floor, coils and stool */
function paintStage(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const layer = s.layer ?? document.createElement('canvas');
  s.layer = layer;
  layer.width = Math.max(1, Math.round(w * dpr));
  layer.height = Math.max(1, Math.round(h * dpr));
  const c = layer.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = s.s;
  const { cx, gy } = s;

  // back wall
  const wall = c.createRadialGradient(cx, gy - 160 * u, 0, cx, gy - 120 * u, Math.max(w, h) * 0.8);
  wall.addColorStop(0, '#171628');
  wall.addColorStop(0.55, '#0c0b17');
  wall.addColorStop(1, '#06050c');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, h);

  // spotlight cone onto the stool
  const cone = c.createLinearGradient(0, 0, 0, gy);
  cone.addColorStop(0, 'rgba(255,236,200,0.09)');
  cone.addColorStop(1, 'rgba(255,236,200,0.02)');
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(cx - 18 * u, 0);
  c.lineTo(cx + 18 * u, 0);
  c.lineTo(cx + 90 * u, gy);
  c.lineTo(cx - 90 * u, gy);
  c.closePath();
  c.fill();

  // stage floor with boards converging to a far point
  const floor = c.createLinearGradient(0, gy, 0, h);
  floor.addColorStop(0, '#1a1420');
  floor.addColorStop(1, '#09070d');
  c.fillStyle = floor;
  c.fillRect(0, gy, w, h - gy);
  c.strokeStyle = 'rgba(255,220,190,0.05)';
  c.lineWidth = 1;
  const vy = gy - 900 * u;
  for (let i = -16; i <= 16; i++) {
    const bx = cx + i * 46 * u;
    const k = (gy - vy) / (h + 40 - vy);
    c.beginPath();
    c.moveTo(cx + (bx - cx) * k, gy);
    c.lineTo(bx, h + 40);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,220,190,0.12)';
  c.beginPath();
  c.moveTo(0, gy + 0.5);
  c.lineTo(w, gy + 0.5);
  c.stroke();
  const pool = c.createRadialGradient(cx, gy + 6 * u, 0, cx, gy + 6 * u, 120 * u);
  pool.addColorStop(0, 'rgba(255,236,200,0.14)');
  pool.addColorStop(1, 'rgba(255,236,200,0)');
  c.fillStyle = pool;
  c.save();
  c.translate(cx, gy + 6 * u);
  c.scale(1, 0.22);
  c.translate(-cx, -(gy + 6 * u));
  c.fillRect(cx - 120 * u, gy + 6 * u - 120 * u, 240 * u, 240 * u);
  c.restore();

  // side curtains and a scalloped valance
  const cw = Math.min(w * 0.045, 60);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w - cw;
    const g = c.createLinearGradient(x0, 0, x0 + cw, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, i % 2 ? '#3a0c16' : '#1a0509');
    c.fillStyle = g;
    c.fillRect(x0, 0, cw, h);
  }
  const vh = clamp(26 * u, 14, 34);
  const valance = c.createLinearGradient(0, 0, 0, vh * 1.5);
  valance.addColorStop(0, '#2a0710');
  valance.addColorStop(1, '#4a0f1c');
  c.fillStyle = valance;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(w, 0);
  c.lineTo(w, vh);
  const sc = Math.max(3, Math.round(w / (70 * Math.max(u, 0.6))));
  for (let i = sc; i >= 0; i--) {
    const x = (i / sc) * w;
    const xm = ((i - 0.5) / sc) * w;
    if (i > 0) c.quadraticCurveTo(xm, vh * 1.6, ((i - 1) / sc) * w, vh);
    else c.lineTo(x, vh);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(214,168,90,0.45)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(0, vh * 0.35);
  c.lineTo(w, vh * 0.35);
  c.stroke();

  // coils
  for (const side of [-1, 1] as const) drawCoil(c, coilX(s, side), gy, u);

  // stool
  c.strokeStyle = '#2b1d14';
  c.lineCap = 'round';
  c.lineWidth = 4 * u;
  const seatY = gy - SEAT_Y * u;
  c.beginPath();
  c.moveTo(cx - 20 * u, seatY + 4 * u);
  c.lineTo(cx - 30 * u, gy);
  c.moveTo(cx + 20 * u, seatY + 4 * u);
  c.lineTo(cx + 30 * u, gy);
  c.moveTo(cx, seatY + 6 * u);
  c.lineTo(cx + 2 * u, gy + 2 * u);
  c.moveTo(cx - 25 * u, gy - 34 * u);
  c.lineTo(cx + 25 * u, gy - 34 * u);
  c.stroke();
  const seat = c.createLinearGradient(0, seatY - 6 * u, 0, seatY + 8 * u);
  seat.addColorStop(0, '#6b4a33');
  seat.addColorStop(1, '#2a1b12');
  c.fillStyle = seat;
  c.beginPath();
  c.ellipse(cx, seatY + 3 * u, 32 * u, 8 * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#7d5a40';
  c.beginPath();
  c.ellipse(cx, seatY, 32 * u, 7 * u, 0, 0, TAU);
  c.fill();
}

function drawCoil(c: CanvasRenderingContext2D, x: number, gy: number, u: number) {
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath();
  c.ellipse(x, gy + 2 * u, 62 * u, 8 * u, 0, 0, TAU);
  c.fill();
  // cabinet
  const cab = c.createLinearGradient(x - 42 * u, 0, x + 42 * u, 0);
  cab.addColorStop(0, '#1b120c');
  cab.addColorStop(0.45, '#3b2718');
  cab.addColorStop(1, '#150e09');
  c.fillStyle = cab;
  c.fillRect(x - 42 * u, gy - 44 * u, 84 * u, 44 * u);
  c.fillStyle = '#b08a4a';
  c.fillRect(x - 44 * u, gy - 47 * u, 88 * u, 4 * u);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(x - 30 * u, gy - 34 * u, 60 * u, 22 * u);
  // dials
  c.fillStyle = '#c9a25c';
  c.beginPath();
  c.arc(x - 16 * u, gy - 23 * u, 4 * u, 0, TAU);
  c.arc(x + 16 * u, gy - 23 * u, 4 * u, 0, TAU);
  c.fill();
  // primary coil: a few fat copper turns
  c.lineWidth = 3 * u;
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = i % 2 ? '#8a4b22' : '#c7773a';
    c.beginPath();
    c.ellipse(x, gy - (54 + i * 6) * u, 30 * u, 6 * u, 0, 0, Math.PI);
    c.stroke();
  }
  // secondary: a tall wound column
  const top = gy - (TORUS_Y - 14) * u;
  const bot = gy - 50 * u;
  const col = c.createLinearGradient(x - 14 * u, 0, x + 14 * u, 0);
  col.addColorStop(0, '#3a1d0c');
  col.addColorStop(0.35, '#c37a45');
  col.addColorStop(0.5, '#f0b27a');
  col.addColorStop(0.7, '#9a5428');
  col.addColorStop(1, '#2a1408');
  c.fillStyle = col;
  c.fillRect(x - 14 * u, top, 28 * u, bot - top);
  c.strokeStyle = 'rgba(30,12,4,0.45)';
  c.lineWidth = Math.max(0.5, 0.8 * u);
  c.beginPath();
  for (let y = top + 3 * u; y < bot; y += 3.2 * u) {
    c.moveTo(x - 14 * u, y);
    c.lineTo(x + 14 * u, y + 1 * u);
  }
  c.stroke();
  c.fillStyle = '#22252d';
  c.fillRect(x - 17 * u, top - 3 * u, 34 * u, 6 * u);
  c.fillRect(x - 17 * u, bot - 3 * u, 34 * u, 6 * u);
  // torus
  const ty = gy - TORUS_Y * u;
  const tor = c.createLinearGradient(0, ty - TORUS_RY * u, 0, ty + TORUS_RY * u);
  tor.addColorStop(0, '#dfe6ef');
  tor.addColorStop(0.35, '#8993a3');
  tor.addColorStop(0.7, '#2c313b');
  tor.addColorStop(1, '#14161c');
  c.fillStyle = tor;
  c.beginPath();
  c.ellipse(x, ty, TORUS_RX * u, TORUS_RY * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#0d0e14';
  c.beginPath();
  c.ellipse(x, ty - 4 * u, 22 * u, 5 * u, 0, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.2 * u;
  c.beginPath();
  c.ellipse(x, ty - 2 * u, TORUS_RX * u * 0.82, TORUS_RY * u * 0.6, 0, Math.PI * 1.1, Math.PI * 1.9);
  c.stroke();
}

function drawHat(ctx: CanvasRenderingContext2D, s: State, k: number, rim: number) {
  if (k <= 0.01) return;
  const u = s.s;
  const x = s.cx;
  const y = s.gy - (SEAT_Y + 1) * u;
  ctx.save();
  ctx.translate(x, y);
  // vanishing stretches the hat up into the light; appearing pops it back
  const sx = s.hatOn ? k : 0.25 + 0.75 * k;
  const sy = s.hatOn ? k : 1 + (1 - k) * 0.8;
  ctx.scale(sx, sy);
  ctx.globalAlpha = s.hatOn ? 1 : k;
  // brim
  ctx.fillStyle = '#0c0b10';
  ctx.beginPath();
  ctx.ellipse(0, 0, 36 * u, 8 * u, 0, 0, TAU);
  ctx.fill();
  // crown
  const crown = ctx.createLinearGradient(-22 * u, 0, 22 * u, 0);
  crown.addColorStop(0, '#07060a');
  crown.addColorStop(0.3, '#23202c');
  crown.addColorStop(0.55, '#121018');
  crown.addColorStop(1, '#050408');
  ctx.fillStyle = crown;
  ctx.beginPath();
  ctx.moveTo(-21 * u, -2 * u);
  ctx.lineTo(-24 * u, -HAT_H * u);
  ctx.ellipse(0, -HAT_H * u, 24 * u, 5 * u, 0, Math.PI, 0);
  ctx.lineTo(21 * u, -2 * u);
  ctx.ellipse(0, -2 * u, 21 * u, 4.5 * u, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c1922';
  ctx.beginPath();
  ctx.ellipse(0, -HAT_H * u, 24 * u, 5 * u, 0, 0, TAU);
  ctx.fill();
  // band
  ctx.fillStyle = '#5a1020';
  ctx.beginPath();
  ctx.moveTo(-21.5 * u, -10 * u);
  ctx.lineTo(-22.2 * u, -19 * u);
  ctx.ellipse(0, -19 * u, 22.2 * u, 4.6 * u, 0, Math.PI, 0, true);
  ctx.lineTo(21.5 * u, -10 * u);
  ctx.ellipse(0, -10 * u, 21.5 * u, 4.5 * u, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  // electric rim light from both sides
  if (rim > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(140,225,255,${(rim * 0.8).toFixed(3)})`;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(-23.5 * u, -HAT_H * u);
    ctx.lineTo(-21 * u, -3 * u);
    ctx.moveTo(23.5 * u, -HAT_H * u);
    ctx.lineTo(21 * u, -3 * u);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function strokePts(ctx: CanvasRenderingContext2D, p: Float32Array, n: number) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
}

function drawArc(ctx: CanvasRenderingContext2D, a: Arc, u: number) {
  const fade = clamp(a.life / Math.min(a.max, 0.12), 0, 1);
  const I = a.power * a.flicker * fade;
  if (I < 0.02) return;
  const wmul = a.kind === Kind.Streamer ? 0.75 : 1;
  strokePts(ctx, a.pts, MAIN_N);
  ctx.strokeStyle = '#3aa8ff';
  ctx.globalAlpha = 0.14 * I;
  ctx.lineWidth = 10 * u * wmul;
  ctx.stroke();
  ctx.strokeStyle = '#8fe3ff';
  ctx.globalAlpha = 0.45 * I;
  ctx.lineWidth = 3.4 * u * wmul;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = Math.min(1, 1.1 * I);
  ctx.lineWidth = Math.max(0.8, 1.3 * u * wmul);
  ctx.stroke();
  for (let b = 0; b < a.brOn; b++) {
    strokePts(ctx, a.br[b], BR_N);
    ctx.strokeStyle = '#8fe3ff';
    ctx.globalAlpha = 0.35 * I;
    ctx.lineWidth = 2.2 * u * wmul;
    ctx.stroke();
    ctx.strokeStyle = '#e8fbff';
    ctx.globalAlpha = 0.7 * I;
    ctx.lineWidth = Math.max(0.6, 0.8 * u * wmul);
    ctx.stroke();
  }
}

function glowAt(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, r: number, a: number) {
  if (a < 0.01) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

function makeSprite(c0: string, c1: string, c2: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, c0);
    grd.addColorStop(0.2, c1);
    grd.addColorStop(0.55, c2);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  return c;
}

function discharge(s: State, env: SceneEnv) {
  s.heard = true;
  s.discharge = 0;
  s.struck = false;
  s.flash = Math.max(s.flash, 0.6);
  env.wake(2600);
  const bus = env.audio();
  if (bus) {
    tone(bus, 60, { type: 'sawtooth', attack: 0.02, decay: 0.9, gain: 0.07 });
    tone(bus, 120, { type: 'square', attack: 0.02, decay: 0.7, gain: 0.03 });
    crackle(bus, true);
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 2.5,
    init: () => ({
      arcs: Array.from({ length: MAX_ARCS }, () => ({
        kind: Kind.Streamer,
        side: 1 as const,
        life: 0,
        max: 1,
        power: 1,
        flicker: 1,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        dir: 0,
        reach: 60,
        pts: new Float32Array(MAIN_N * 2),
        br: [new Float32Array(BR_N * 2), new Float32Array(BR_N * 2), new Float32Array(BR_N * 2)],
        brOn: 0,
      })),
      puffs: Array.from({ length: MAX_PUFFS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1 })),
      sparks: Array.from({ length: MAX_SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 })),
      nextSpark: 0,
      regen: 0,
      streamerIn: 0.05,
      bridgeIn: 2.3,
      groundIn: 4,
      discharge: -1,
      struck: false,
      hatOn: true,
      hatK: 1,
      hatT: 1,
      flash: 0,
      glowL: 0.3,
      glowR: 0.3,
      heard: false,
      s: 1,
      coil: COIL_X,
      cx: 0,
      gy: 0,
      layer: null,
      sprite: makeSprite('rgba(210,245,255,1)', 'rgba(110,200,255,0.55)', 'rgba(50,120,255,0.14)'),
      smoke: makeSprite('rgba(200,195,220,0.9)', 'rgba(170,160,200,0.45)', 'rgba(120,110,160,0.12)'),
    }),
    resize: (s, env) => {
      s.s = Math.min(env.w / 520, env.h / 500);
      s.cx = env.w / 2;
      s.coil = Math.min(COIL_X, env.w / 2 / s.s - 75);
      s.gy = Math.min(env.h * 0.88, env.h * 0.55 + 200 * s.s);
      paintStage(s, env);
      for (const a of s.arcs) if (a.life > 0) build(s, a);
    },
    update: (s, env, dt) => {
      const u = s.s;
      const bus = s.heard ? env.audio() : null;

      // idle life: streamers off the tori, the odd bridge and ground strike
      s.streamerIn -= dt;
      if (s.streamerIn <= 0) {
        s.streamerIn = rand(0.04, 0.14);
        spawnArc(s, Kind.Streamer, Math.random() < 0.5 ? -1 : 1, rand(0.1, 0.32), rand(0.45, 0.85));
        if (bus && Math.random() < 0.35) crackle(bus, false);
      }
      s.bridgeIn -= dt;
      if (s.bridgeIn <= 0) {
        s.bridgeIn = rand(1.4, 3.4);
        spawnArc(s, Kind.Bridge, -1, rand(0.25, 0.45), 0.9);
        if (bus) crackle(bus, true);
      }
      s.groundIn -= dt;
      if (s.groundIn <= 0) {
        s.groundIn = rand(3.5, 7);
        const side = Math.random() < 0.5 ? -1 : 1;
        const a = spawnArc(s, Kind.Ground, side, 0.22, 0.85);
        emitSparks(s, a.x1, a.y1, 10, 160 * u);
        if (bus) crackle(bus, true);
      }

      // discharge: bridges and ground strikes build, then both coils strike the hat
      if (s.discharge >= 0) {
        const prev = s.discharge;
        s.discharge += dt;
        const d = s.discharge;
        if (d < 0.75 && Math.floor(prev / 0.09) !== Math.floor(d / 0.09)) {
          spawnArc(s, Kind.Bridge, -1, rand(0.12, 0.25), 1.2);
          if (Math.random() < 0.6) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const a = spawnArc(s, Kind.Ground, side, rand(0.12, 0.2), 1);
            emitSparks(s, a.x1, a.y1, 6, 180 * u);
          }
          spawnArc(s, Kind.Streamer, -1, 0.2, 1);
          spawnArc(s, Kind.Streamer, 1, 0.2, 1);
          if (bus) crackle(bus, Math.random() < 0.5);
        }
        if (d > 0.3 && !s.struck && Math.floor(prev / 0.07) !== Math.floor(d / 0.07)) {
          spawnArc(s, Kind.Hat, -1, 0.14, 1.3);
          spawnArc(s, Kind.Hat, 1, 0.14, 1.3);
        }
        if (d > 0.62 && !s.struck) {
          s.struck = true;
          s.flash = 1;
          s.hatOn = !s.hatOn;
          s.hatT = 0;
          const hy = s.gy - (SEAT_Y + HAT_H * 0.5) * u;
          puff(s, s.cx, hy, 16);
          emitSparks(s, s.cx, hy, 40, 260 * u);
          if (bus) {
            noise(bus, { duration: 0.5, gain: 0.3, freq: 700, q: 0.5, type: 'lowpass' });
            if (s.hatOn) {
              tone(bus, 523.25, { type: 'triangle', decay: 0.5, gain: 0.1, delay: 0.05 });
              tone(bus, 783.99, { type: 'triangle', decay: 0.7, gain: 0.08, delay: 0.14 });
            } else {
              tone(bus, 880, { type: 'sine', decay: 0.4, gain: 0.08, glideTo: 1760 });
            }
          }
        }
        if (d > 1.2) s.discharge = -1;
      }

      // re-form bolt geometry at ~18Hz so the lightning jitters without strobing
      s.regen += dt;
      const reform = s.regen >= REGEN;
      if (reform) s.regen = 0;
      let left = 0;
      let right = 0;
      for (const a of s.arcs) {
        if (a.life <= 0) continue;
        a.life -= dt;
        if (a.life <= 0) continue;
        if (reform) build(s, a);
        const e = a.power * a.flicker;
        if (a.kind === Kind.Bridge) {
          left += e;
          right += e;
        } else if (a.kind === Kind.Hat) {
          left += e * 0.5;
          right += e * 0.5;
        } else if (a.side < 0) left += e * 0.5;
        else right += e * 0.5;
      }
      s.glowL = damp(s.glowL, 0.25 + Math.min(1.2, left), 14, dt);
      s.glowR = damp(s.glowR, 0.25 + Math.min(1.2, right), 14, dt);
      s.flash = Math.max(0, s.flash - dt * 2.2);

      // hat: vanish fast, reappear with a little overshoot
      s.hatT = Math.min(1, s.hatT + dt / (s.hatOn ? 0.55 : 0.18));
      s.hatK = s.hatOn ? easeOutBack(s.hatT) : 1 - s.hatT;

      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy += 520 * u * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > s.gy && p.vy > 0) {
          p.y = s.gy;
          p.vy *= -0.35;
          p.vx *= 0.6;
        }
      }
      for (const p of s.puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 1.5;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += 18 * u * dt;
      }
    },
    draw: (s, env) => {
      const { ctx, w, h } = env;
      const u = s.s;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (s.layer) ctx.drawImage(s.layer, 0, 0, w, h);
      else {
        ctx.fillStyle = '#07060f';
        ctx.fillRect(0, 0, w, h);
      }
      const sprite = s.sprite;
      const ty = torusY(s);
      const lx = coilX(s, -1);
      const rx = coilX(s, 1);

      ctx.globalCompositeOperation = 'lighter';
      // room light from the coils and the discharge
      if (sprite) {
        glowAt(ctx, sprite, lx, ty, 150 * u * (0.8 + s.glowL * 0.4), 0.18 + s.glowL * 0.25);
        glowAt(ctx, sprite, rx, ty, 150 * u * (0.8 + s.glowR * 0.4), 0.18 + s.glowR * 0.25);
        // light pools on the floor
        ctx.save();
        ctx.translate(0, s.gy);
        ctx.scale(1, 0.18);
        glowAt(ctx, sprite, lx, 0, 190 * u, 0.12 * s.glowL);
        glowAt(ctx, sprite, rx, 0, 190 * u, 0.12 * s.glowR);
        glowAt(ctx, sprite, s.cx, 0, 260 * u, 0.4 * s.flash);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(120,200,255,${(s.flash * s.flash * 0.22).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';

      drawHat(ctx, s, s.hatK, Math.max(s.flash, (s.glowL + s.glowR) * 0.2 - 0.1));

      // lightning
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const a of s.arcs) if (a.life > 0) drawArc(ctx, a, u);
      // hot spots where bolts land
      if (sprite) {
        for (const a of s.arcs) {
          if (a.life <= 0 || a.kind === Kind.Streamer) continue;
          glowAt(ctx, sprite, a.x1, a.y1, 34 * u, 0.5 * a.flicker);
        }
      }

      ctx.strokeStyle = '#d8f6ff';
      ctx.lineWidth = Math.max(1, 1.4 * u);
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life / p.max;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // smoke from the trick
      const smoke = s.smoke;
      if (smoke) {
        for (const p of s.puffs) {
          if (p.life <= 0) continue;
          const k = p.life / p.max;
          glowAt(ctx, smoke, p.x, p.y, p.r * 1.6, 0.5 * k * k);
        }
      }
      ctx.globalAlpha = 1;
    },
    onPointerDown: (s, env) => discharge(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) discharge(s, env);
      return true;
    },
    dispose: (s) => {
      if (s.layer) s.layer.width = s.layer.height = 0;
      if (s.sprite) s.sprite.width = s.sprite.height = 0;
      if (s.smoke) s.smoke.width = s.smoke.height = 0;
      s.layer = null;
      s.sprite = null;
      s.smoke = null;
    },
  });
