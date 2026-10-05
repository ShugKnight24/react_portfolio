import { createCanvasScene, clamp, damp, easeInOutCubic, lerp, noise, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  burst,
  emit,
  freeCanvas,
  glow,
  glowSprite,
  layer,
  makePool,
  mulberry,
  setHum,
  shakeX,
  shakeY,
  startHum,
  stepPool,
  stopHum,
} from './heroes-kit';
import type { Hum, Pool } from './heroes-kit';
import { TW, earthTextures, makeGlobeView, shadeGlobe } from './superman-earth';
import type { EarthTex, GlobeView } from './superman-earth';

/**
 * Superman circling the Earth. The planet is shaded per pixel from baked day, city lights and
 * cloud maps (see superman-earth.ts) and turns slowly under a fixed sun, so the terminator,
 * the night side cities, the ocean glint and the atmosphere stay put while the continents
 * roll through them. Superman flies a tilted circular orbit projected in 3D: he passes in
 * front of the globe, then behind it, sized by perspective and dimmed in the planet's shadow.
 * He is painted each frame (the cape is live) into a small offscreen canvas so a sunlit rim
 * can be cut from his own silhouette. The pointer tilts and turns the orbit; a tap, Space or
 * Enter throws a loop; holding boosts him with a sonic boom and a hotter trail.
 */

interface Ring {
  x: number;
  y: number;
  ang: number;
  age: number;
  size: number;
  front: boolean;
}

interface State {
  // orbit
  a: number;
  roll: number;
  incl: number;
  tRoll: number;
  tIncl: number;
  // hero on screen
  hx: number;
  hy: number;
  hz: number;
  hp: number;
  ang: number;
  shadow: number;
  // moves
  boost: number;
  boosting: boolean;
  boostT: number;
  ringT: number;
  loopT: number;
  /** 1 loops out into space, -1 loops in front of the planet */
  loopDir: number;
  cone: number;
  // input
  held: boolean;
  holdT: number;
  touched: boolean;
  idle: number;
  fx: number;
  fy: number;
  autoT: number;
  autoBoost: number;
  // trail ring buffer: x, y, z, age, heat
  trail: Float32Array;
  tHead: number;
  tLen: number;
  rings: Ring[];
  parts: Pool;
  shake: number;
  flash: number;
  rot: number;
  crot: number;
  hum: Hum | null;
  // layout
  cx: number;
  cy: number;
  R: number;
  baseRoll: number;
  baseIncl: number;
  sunX: number;
  sunY: number;
  sun3: [number, number, number];
  tex: EarthTex;
  view: GlobeView | null;
  globe: HTMLCanvasElement | null;
  atmo: HTMLCanvasElement | null;
  bg: HTMLCanvasElement | null;
  hero: HTMLCanvasElement | null;
  rim: HTMLCanvasElement | null;
  side: number;
  vignette: CanvasGradient | null;
  white: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  sunGlow: HTMLCanvasElement;
}

const ORBIT = 1.36;
const FOCAL = 5;
const TRAIL = 160;
const TAP = 0.24;
const LOOP_DUR = 1.15;
const ROT_RATE = TW / 150; // texels per second, about 2.4 degrees
const FIG = 0.0025; // figure units to globe radii

// palette
const BLUE = ['#0a1d5c', '#1638a8', '#2a5ce0', '#6f9bff'];
const RED = ['#4a0710', '#8e0f1f', '#cf1a2c', '#ff5a4f'];
const GOLD = ['#a8700a', '#f2c230', '#ffe37a'];
const SKIN = ['#8a4f33', '#c98760', '#f0b98e', '#ffd9b8'];
const HAIR = '#07080d';

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/* ---------- painting Superman (figure units: +x forward, +y belly side) ---------- */

type C = CanvasRenderingContext2D;

function lin(c: C, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

/** Tapered limb through points (flat x, y list) with a width per point */
function tube(c: C, pts: number[], ws: number[]) {
  const n = ws.length;
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = pts[b * 2] - pts[a * 2];
    let dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const h = ws[i] / 2;
    lx.push(pts[i * 2] - dy * h);
    ly.push(pts[i * 2 + 1] + dx * h);
    rx.push(pts[i * 2] + dy * h);
    ry.push(pts[i * 2 + 1] - dx * h);
  }
  const ex = pts[n * 2 - 2] - pts[n * 2 - 4];
  const ey = pts[n * 2 - 1] - pts[n * 2 - 3];
  const el = Math.hypot(ex, ey) || 1;
  const sx = pts[2] - pts[0];
  const sy = pts[3] - pts[1];
  const sl = Math.hypot(sx, sy) || 1;
  c.beginPath();
  c.moveTo(lx[0], ly[0]);
  for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(lx[i], ly[i], (lx[i] + lx[i + 1]) / 2, (ly[i] + ly[i + 1]) / 2);
  c.lineTo(lx[n - 1], ly[n - 1]);
  const ew = ws[n - 1] * 0.75;
  c.quadraticCurveTo(pts[n * 2 - 2] + (ex / el) * ew, pts[n * 2 - 1] + (ey / el) * ew, rx[n - 1], ry[n - 1]);
  for (let i = n - 2; i > 0; i--) c.quadraticCurveTo(rx[i], ry[i], (rx[i] + rx[i - 1]) / 2, (ry[i] + ry[i - 1]) / 2);
  c.lineTo(rx[0], ry[0]);
  const sw = ws[0] * 0.6;
  c.quadraticCurveTo(pts[0] - (sx / sl) * sw, pts[1] - (sy / sl) * sw, lx[0], ly[0]);
  c.closePath();
}

function capeEdges(t: number, boost: number, top: number[], bot: number[]) {
  const n = 12;
  const len = 168 + boost * 34;
  const amp = 8.5 * (1 - boost * 0.45);
  const fr = 7 + boost * 10;
  top.length = 0;
  bot.length = 0;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = 44 - k * len;
    const w1 = Math.sin(k * 4.4 - t * fr) + 0.35 * Math.sin(k * 9.1 - t * fr * 1.7 + 1.3);
    const w2 = Math.sin(k * 4.4 - t * fr - 1.0) + 0.3 * Math.sin(k * 8.3 - t * fr * 1.6 + 2.1);
    top.push(x, -16 - 21 * Math.pow(k, 0.65) * (1 - boost * 0.3) + w1 * k * amp);
    bot.push(x + k * 6, -9 + 15 * k * (1 - boost * 0.35) + w2 * k * amp * 1.25);
  }
}

const capeTop: number[] = [];
const capeBot: number[] = [];

function paintCape(c: C, t: number, boost: number) {
  capeEdges(t, boost, capeTop, capeBot);
  const n = capeTop.length / 2;
  const tail = capeTop[n * 2 - 2];
  c.beginPath();
  c.moveTo(capeTop[0], capeTop[1]);
  for (let i = 1; i < n - 1; i++)
    c.quadraticCurveTo(capeTop[i * 2], capeTop[i * 2 + 1], (capeTop[i * 2] + capeTop[i * 2 + 2]) / 2, (capeTop[i * 2 + 1] + capeTop[i * 2 + 3]) / 2);
  c.lineTo(capeTop[n * 2 - 2], capeTop[n * 2 - 1]);
  // scalloped trailing edge
  const tx = capeTop[n * 2 - 2];
  const ty = capeTop[n * 2 - 1];
  const bx = capeBot[n * 2 - 2];
  const by = capeBot[n * 2 - 1];
  const wob = Math.sin(t * 13) * 4;
  c.quadraticCurveTo(tx - 14 + wob, lerp(ty, by, 0.25), lerp(tx, bx, 0.45) - 2, lerp(ty, by, 0.45));
  c.quadraticCurveTo(lerp(tx, bx, 0.6) - 16 - wob, lerp(ty, by, 0.7), bx, by);
  for (let i = n - 2; i > 0; i--)
    c.quadraticCurveTo(capeBot[i * 2], capeBot[i * 2 + 1], (capeBot[i * 2] + capeBot[i * 2 - 2]) / 2, (capeBot[i * 2 + 1] + capeBot[i * 2 - 1]) / 2);
  c.lineTo(capeBot[0], capeBot[1]);
  c.closePath();
  c.fillStyle = lin(c, 40, -20, tail, 10, [
    [0, RED[2]],
    [0.45, RED[2]],
    [1, RED[1]],
  ]);
  c.fill();
  c.save();
  c.clip();
  // folds following the wave
  c.lineCap = 'round';
  for (let f = 0; f < 4; f++) {
    const k = 0.22 + f * 0.2;
    c.beginPath();
    for (let i = 1; i < n; i++) {
      const x = lerp(capeTop[i * 2], capeBot[i * 2], k);
      const y = lerp(capeTop[i * 2 + 1], capeBot[i * 2 + 1], k);
      if (i === 1) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.strokeStyle = f % 2 ? 'rgba(60,0,10,0.35)' : 'rgba(255,120,110,0.16)';
    c.lineWidth = f % 2 ? 5 : 3;
    c.stroke();
  }
  // darker underside band along the lower edge
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = capeBot[i * 2];
    const y = capeBot[i * 2 + 1];
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.strokeStyle = RED[0];
  c.globalAlpha = 0.55;
  c.lineWidth = 9;
  c.stroke();
  c.globalAlpha = 1;
  // sheen on the upper edge
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = capeTop[i * 2];
    const y = capeTop[i * 2 + 1] + 2;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.strokeStyle = 'rgba(255,140,120,0.45)';
  c.lineWidth = 2.5;
  c.stroke();
  c.restore();
}

function torsoPath(c: C) {
  c.beginPath();
  c.moveTo(57, 3);
  c.quadraticCurveTo(55, 20, 36, 23);
  c.quadraticCurveTo(20, 25, 8, 15);
  c.quadraticCurveTo(-6, 11, -18, 11);
  c.lineTo(-22, 6);
  c.lineTo(-22, -10);
  c.quadraticCurveTo(-4, -12, 10, -16);
  c.quadraticCurveTo(30, -24, 46, -18);
  c.quadraticCurveTo(54, -14, 57, -8);
  c.closePath();
}

function paintLeg(c: C, pts: number[], ws: number[], dark: boolean) {
  tube(c, pts, ws);
  c.fillStyle = lin(c, 0, -12, 0, 12, dark
    ? [[0, BLUE[1]], [1, BLUE[0]]]
    : [[0, BLUE[3]], [0.35, BLUE[2]], [1, BLUE[1]]]);
  c.fill();
  c.save();
  c.clip();
  // boot: everything past the shin, with the V notch on the front
  const kx = pts[6];
  c.beginPath();
  c.moveTo(kx - 6, -60);
  c.lineTo(kx - 6, pts[7] - 4);
  c.lineTo(kx - 13, pts[7] + 3);
  c.lineTo(kx - 7, 60);
  c.lineTo(-260, 60);
  c.lineTo(-260, -60);
  c.closePath();
  c.fillStyle = lin(c, 0, -12, 0, 12, dark
    ? [[0, RED[1]], [1, RED[0]]]
    : [[0, RED[3]], [0.4, RED[2]], [1, RED[1]]]);
  c.fill();
  // knee and calf definition
  c.strokeStyle = dark ? 'rgba(0,0,20,0.35)' : 'rgba(5,15,60,0.4)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(pts[4] + 6, pts[5] + 3);
  c.quadraticCurveTo(pts[4] - 4, pts[5] + 6, pts[6] + 2, pts[7] + 3);
  c.stroke();
  c.restore();
}

function paintEmblem(c: C) {
  // pentagon shield; its top faces the head (+x), squashed by the three quarter turn
  c.save();
  c.translate(30, 9.5);
  c.rotate(Math.PI / 2);
  c.scale(0.68, 0.62);
  c.beginPath();
  c.moveTo(-12, -9);
  c.lineTo(12, -9);
  c.lineTo(16, -3);
  c.lineTo(0, 14);
  c.lineTo(-16, -3);
  c.closePath();
  c.fillStyle = GOLD[1];
  c.fill();
  c.lineJoin = 'round';
  c.lineWidth = 2.6;
  c.strokeStyle = RED[2];
  c.stroke();
  // the S as a ribbon shape
  c.beginPath();
  c.moveTo(8.5, -6);
  c.bezierCurveTo(1, -7.5, -9, -6.5, -8, -2.5);
  c.bezierCurveTo(-7, 1, 7, -1, 6, 3.5);
  c.bezierCurveTo(5, 7, -2, 8, -5, 6);
  c.lineCap = 'round';
  c.lineWidth = 3.2;
  c.stroke();
  c.restore();
}

function paintHead(c: C) {
  // neck
  c.beginPath();
  c.moveTo(50, -10);
  c.lineTo(62, -9);
  c.lineTo(66, 2);
  c.lineTo(52, 6);
  c.closePath();
  c.fillStyle = SKIN[1];
  c.fill();
  // head in profile, chin forward and up
  c.beginPath();
  c.moveTo(61, 2);
  c.quadraticCurveTo(66, 5, 73, 4);
  c.quadraticCurveTo(80, 3.5, 81.5, 0);
  c.lineTo(82.5, -3.5);
  c.lineTo(81.6, -5.5);
  c.lineTo(85.5, -8.6);
  c.lineTo(81.8, -11.6);
  c.quadraticCurveTo(81.5, -14.5, 80.2, -17.5);
  c.quadraticCurveTo(78, -24, 70, -25);
  c.quadraticCurveTo(60, -25.5, 56.5, -17);
  c.quadraticCurveTo(55, -9, 61, 2);
  c.closePath();
  c.fillStyle = lin(c, 58, -24, 80, 4, [
    [0, SKIN[2]],
    [0.6, SKIN[2]],
    [1, SKIN[1]],
  ]);
  c.fill();
  // jaw shadow and cheek plane
  c.fillStyle = 'rgba(120,60,35,0.45)';
  c.beginPath();
  c.moveTo(63, 1);
  c.quadraticCurveTo(70, 4.2, 79, 2);
  c.quadraticCurveTo(72, -1, 66, -4);
  c.closePath();
  c.fill();
  // ear
  c.beginPath();
  c.ellipse(64.5, -9.5, 2.6, 3.8, 0.2, 0, TAU);
  c.fillStyle = SKIN[1];
  c.fill();
  // brow and eye, narrowed and focused
  c.strokeStyle = '#2a170e';
  c.lineCap = 'round';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(75.5, -14);
  c.lineTo(80.6, -12.8);
  c.stroke();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(78.6, -10.9, 1.7, 0.95, 0.1, 0, TAU);
  c.fill();
  c.fillStyle = '#2b5fd0';
  c.beginPath();
  c.arc(79.4, -10.85, 0.8, 0, TAU);
  c.fill();
  // mouth line
  c.strokeStyle = 'rgba(90,35,25,0.8)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(82, -4.6);
  c.lineTo(79.4, -4.2);
  c.stroke();
  // hair: slicked back, black with a blue sheen
  c.beginPath();
  c.moveTo(80.4, -17.2);
  c.quadraticCurveTo(80, -25.5, 70, -26.8);
  c.quadraticCurveTo(58, -27.5, 54.5, -17);
  c.quadraticCurveTo(54, -11, 57.5, -6);
  c.quadraticCurveTo(60.5, -9.5, 62, -13.5);
  c.quadraticCurveTo(66, -14, 68.5, -12.2);
  c.quadraticCurveTo(70, -16.5, 74.5, -18.2);
  c.quadraticCurveTo(77.5, -17.6, 80.4, -17.2);
  c.closePath();
  c.fillStyle = HAIR;
  c.fill();
  c.strokeStyle = 'rgba(80,120,220,0.55)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(77, -22.5);
  c.quadraticCurveTo(68, -26, 59, -20);
  c.stroke();
  // the curl over the forehead
  c.strokeStyle = HAIR;
  c.lineWidth = 2.1;
  c.beginPath();
  c.moveTo(78.5, -19.5);
  c.bezierCurveTo(84, -20.5, 85, -14.5, 81.6, -14.6);
  c.bezierCurveTo(79.8, -14.7, 80, -17, 81.8, -16.6);
  c.stroke();
}

function paintArm(c: C, boost: number) {
  const reach = boost * 4;
  const pts = [40, 1, 58, 3.5, 77, 3, 96 + reach, -0.5, 109 + reach, -3];
  tube(c, pts, [17, 15, 11.5, 10.5, 8.5]);
  c.fillStyle = lin(c, 0, -8, 0, 9, [
    [0, BLUE[3]],
    [0.4, BLUE[2]],
    [1, BLUE[1]],
  ]);
  c.fill();
  // bicep and forearm definition
  c.strokeStyle = 'rgba(8,20,80,0.45)';
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(52, 8);
  c.quadraticCurveTo(64, 10, 76, 7);
  c.stroke();
  c.strokeStyle = 'rgba(170,200,255,0.4)';
  c.beginPath();
  c.moveTo(50, -5);
  c.quadraticCurveTo(62, -6, 74, -2.5);
  c.stroke();
  // fist
  const fx = 117 + reach;
  c.beginPath();
  c.moveTo(fx - 9, -9.5);
  c.quadraticCurveTo(fx + 1, -11, fx + 6, -7);
  c.quadraticCurveTo(fx + 8.5, -2, fx + 5.5, 2.8);
  c.quadraticCurveTo(fx - 1, 5, fx - 9, 3.4);
  c.closePath();
  c.fillStyle = lin(c, fx - 9, -10, fx + 4, 4, [
    [0, SKIN[3]],
    [0.6, SKIN[2]],
    [1, SKIN[1]],
  ]);
  c.fill();
  c.strokeStyle = 'rgba(110,55,30,0.6)';
  c.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(fx + 1.5 + i * 0.4, -7 + i * 3.4);
    c.lineTo(fx + 5.6, -6 + i * 3.4);
    c.stroke();
  }
  // deltoid
  c.beginPath();
  c.ellipse(41, -2, 14, 12.5, -0.15, 0, TAU);
  c.fillStyle = lin(c, 32, -14, 46, 10, [
    [0, BLUE[3]],
    [0.45, BLUE[2]],
    [1, BLUE[1]],
  ]);
  c.fill();
}

function paintHero(c: C, t: number, boost: number) {
  paintCape(c, t, boost);

  const st = boost * 5; // legs straighten and close up at speed
  paintLeg(
    c,
    [-14, -6, -36, -9 + st * 0.4, -56, -12 + st * 0.6, -74, -15 + st, -94, -18 + st * 1.4, -107, -16 + st * 1.4],
    [17, 14, 10.5, 10.5, 7.5, 5],
    true
  );

  torsoPath(c);
  c.fillStyle = lin(c, 0, -20, 0, 22, [
    [0, BLUE[3]],
    [0.3, BLUE[2]],
    [0.75, BLUE[1]],
    [1, BLUE[0]],
  ]);
  c.fill();
  c.save();
  c.clip();
  // pecs, lats and abs
  c.strokeStyle = 'rgba(6,16,70,0.5)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(48, 6);
  c.quadraticCurveTo(36, 13, 20, 16);
  c.moveTo(14, 4);
  c.quadraticCurveTo(4, 6, -6, 6);
  c.moveTo(6, 8);
  c.lineTo(5, 13);
  c.moveTo(-3, 8);
  c.lineTo(-4, 12);
  c.stroke();
  c.strokeStyle = 'rgba(150,190,255,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(44, -14);
  c.quadraticCurveTo(26, -18, 8, -12);
  c.stroke();
  paintEmblem(c);
  c.restore();

  paintLeg(
    c,
    [-12, 2, -38, 3, -60, 3.5, -78, 3, -98, 2.5 - st * 0.3, -112, 4.5 - st * 0.3],
    [19, 15.5, 11.5, 11.5, 8, 5.5],
    false
  );

  // trunks and belt
  c.beginPath();
  c.moveTo(-4, -11.5);
  c.lineTo(-4, 11.5);
  c.quadraticCurveTo(-16, 12.5, -27, 9);
  c.quadraticCurveTo(-31, 0, -26, -9.5);
  c.quadraticCurveTo(-15, -12, -4, -11.5);
  c.closePath();
  c.fillStyle = lin(c, 0, -12, 0, 12, [
    [0, RED[3]],
    [0.4, RED[2]],
    [1, RED[1]],
  ]);
  c.fill();
  c.fillStyle = lin(c, 0, -12, 0, 12, [
    [0, GOLD[2]],
    [0.5, GOLD[1]],
    [1, GOLD[0]],
  ]);
  c.beginPath();
  c.moveTo(-7, -12.6);
  c.lineTo(-2, -12.4);
  c.lineTo(-1.5, 11.6);
  c.lineTo(-6.5, 11.8);
  c.closePath();
  c.fill();
  c.fillStyle = GOLD[0];
  c.fillRect(-6, 4, 4, 5);

  paintArm(c, boost);
  paintHead(c);

  // cape collar over the near shoulder
  c.beginPath();
  c.moveTo(56, -9);
  c.quadraticCurveTo(52, -18, 42, -18);
  c.quadraticCurveTo(40, -13, 44, -11);
  c.quadraticCurveTo(50, -10, 56, -9);
  c.closePath();
  c.fillStyle = RED[2];
  c.fill();
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const portrait = h > w * 1.12;
  s.baseRoll = portrait ? -1.3 : 0.14;
  s.baseIncl = 0.62;
  const A = ORBIT * 1.12;
  const B = ORBIT * Math.sin(0.82) * 1.16;
  const cr = Math.cos(s.baseRoll);
  const sr = Math.sin(s.baseRoll);
  const ex = Math.max(1.16, Math.sqrt(A * A * cr * cr + B * B * sr * sr) + (portrait ? 0.05 : 0.26));
  const ey = Math.max(1.16, Math.sqrt(A * A * sr * sr + B * B * cr * cr) + 0.26);
  s.R = Math.max(30, Math.min(portrait ? w * 0.44 : (w * 0.5) / ex, (h * 0.5) / ey) * 0.97);
  s.cx = w * (portrait ? 0.47 : 0.53);
  s.cy = h * (portrait ? 0.56 : 0.5);
  s.sunX = portrait ? w * 0.2 : w * 0.11;
  s.sunY = portrait ? h * 0.075 : h * 0.13;
  const dx = s.sunX - s.cx;
  const dy = s.sunY - s.cy;
  const dl = Math.hypot(dx, dy) || 1;
  const sx = (dx / dl) * 0.9;
  const sy = (dy / dl) * 0.9;
  const sz = 0.3;
  const sl = Math.hypot(sx, sy, sz);
  s.sun3 = [sx / sl, sy / sl, sz / sl];

  const n = clamp(Math.round(s.R * 2 * dpr), 64, 720);
  s.view = makeGlobeView(n, s.sun3, -0.4, 0.38);
  if (!s.globe) s.globe = document.createElement('canvas');
  s.globe.width = s.globe.height = n;

  // atmosphere halo baked per pixel, bright toward the sun and fading on the night side
  const an = clamp(Math.round(s.R * 2.7 * Math.min(dpr, 1.5) * 0.6), 64, 420);
  if (!s.atmo) s.atmo = document.createElement('canvas');
  s.atmo.width = s.atmo.height = an;
  const ac = s.atmo.getContext('2d');
  if (ac) {
    const img = ac.createImageData(an, an);
    const d = img.data;
    const L2 = Math.hypot(s.sun3[0], s.sun3[1]) || 1;
    const lx = s.sun3[0] / L2;
    const ly = s.sun3[1] / L2;
    for (let j = 0; j < an; j++) {
      for (let i = 0; i < an; i++) {
        const x = (((i + 0.5) / an) * 2 - 1) * 1.35;
        const y = (((j + 0.5) / an) * 2 - 1) * 1.35;
        const r = Math.hypot(x, y);
        if (r < 0.9) continue;
        const facing = (x * lx + y * ly) / r;
        const lit = smoothstep(-0.55, 0.6, facing);
        const out = r > 1 ? Math.exp(-(r - 1) / 0.045) * 0.9 + Math.exp(-(r - 1) / 0.16) * 0.28 : 0;
        const inner = r <= 1 ? smoothstep(0.93, 1, r) * 0.55 : 0;
        const k = (out + inner) * (0.12 + lit * 0.88) * smoothstep(1.34, 1.12, r);
        const warm = Math.exp(-((facing / 0.28) ** 2)) * 0.6;
        const p = (j * an + i) * 4;
        d[p] = clamp(k * (90 + warm * 200), 0, 255);
        d[p + 1] = clamp(k * (160 + warm * 30), 0, 255);
        d[p + 2] = clamp(k * 255, 0, 255);
        d[p + 3] = 255;
      }
    }
    ac.putImageData(img, 0, 0);
  }

  // stars and a faint band of the galaxy
  const bg = layer(s.bg, w, h, dpr);
  s.bg = bg.cv;
  const c = bg.c;
  if (c) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.5, '#03040a');
    g.addColorStop(1, '#070514');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const rnd = mulberry(1938);
    c.globalCompositeOperation = 'lighter';
    const bx0 = w * 0.95;
    const by0 = -h * 0.05;
    const bx1 = w * 0.05;
    const by1 = h * 1.05;
    for (let i = 0; i < 70; i++) {
      const k = rnd();
      const x = lerp(bx0, bx1, k) + (rnd() - 0.5) * w * 0.18;
      const y = lerp(by0, by1, k) + (rnd() - 0.5) * h * 0.18;
      const r = (0.06 + rnd() * 0.12) * Math.max(w, h);
      const gg = c.createRadialGradient(x, y, 0, x, y, r);
      const hue = rnd() < 0.5 ? '90,80,170' : '60,90,170';
      gg.addColorStop(0, `rgba(${hue},0.05)`);
      gg.addColorStop(1, `rgba(${hue},0)`);
      c.fillStyle = gg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const count = Math.round((w * h) / 900);
    for (let i = 0; i < count; i++) {
      const band = rnd() < 0.45;
      const k = rnd();
      const x = band ? lerp(bx0, bx1, k) + (rnd() + rnd() - 1) * w * 0.12 : rnd() * w;
      const y = band ? lerp(by0, by1, k) + (rnd() + rnd() - 1) * h * 0.12 : rnd() * h;
      const m = rnd();
      const r = m > 0.985 ? 1.4 : m > 0.9 ? 0.95 : 0.55;
      const tint = rnd();
      const col = tint < 0.2 ? '255,214,180' : tint < 0.45 ? '190,210,255' : '255,255,255';
      c.fillStyle = `rgba(${col},${(0.35 + rnd() * 0.6).toFixed(2)})`;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      if (m > 0.985) glow(c, s.blue, x, y, 6, 0.35);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // Superman's offscreen canvases, big enough for the nearest point of the orbit
  const maxScale = s.R * FIG * (FOCAL / (FOCAL - ORBIT)) * 1.08;
  s.side = Math.ceil(330 * maxScale);
  const hero = layer(s.hero, s.side, s.side, dpr);
  s.hero = hero.cv;
  const rim = layer(s.rim, s.side, s.side, dpr);
  s.rim = rim.cv;

  const vg = env.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,8,0.55)');
  s.vignette = vg;
  s.tLen = 0;
  s.tRoll = s.roll = s.baseRoll;
  s.tIncl = s.incl = s.baseIncl;
}

/* ---------- orbit ---------- */

const P = { x: 0, y: 0, z: 0, p: 1 };

function orbit(s: State, a: number) {
  const si = Math.sin(s.incl);
  const ci = Math.cos(s.incl);
  const x = -Math.cos(a) * ORBIT;
  const f = Math.sin(a) * ORBIT;
  const y = f * si;
  const z = f * ci;
  const cr = Math.cos(s.roll);
  const sr = Math.sin(s.roll);
  const p = FOCAL / (FOCAL - z);
  P.x = s.cx + (x * cr - y * sr) * p * s.R;
  P.y = s.cy + (x * sr + y * cr) * p * s.R;
  P.z = z;
  P.p = p;
}

function ring(s: State, size: number) {
  let r = s.rings[0];
  for (const it of s.rings) if (it.age > r.age) r = it;
  r.x = s.hx;
  r.y = s.hy;
  r.ang = s.ang;
  r.age = 0;
  r.size = size;
  r.front = s.hz >= 0 || Math.hypot(s.hx - s.cx, s.hy - s.cy) > s.R;
}

function boom(s: State, env: SceneEnv, big: boolean) {
  ring(s, big ? 1 : 0.6);
  s.shake = Math.max(s.shake, big ? 7 : 3.5);
  s.flash = Math.max(s.flash, big ? 0.5 : 0.18);
  if (big) s.cone = 1;
  const u = s.R / 220;
  burst(s.parts, big ? 26 : 10, s.hx, s.hy, s.ang + Math.PI, 1.3, 260 * u, 0.7, 7 * u, 1, 3);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: big ? 0.9 : 0.45, gain: big ? 0.38 : 0.18, freq: 260, q: 0.6, type: 'lowpass' });
    tone(bus, big ? 70 : 90, { type: 'sine', attack: 0.005, decay: big ? 0.7 : 0.35, gain: big ? 0.3 : 0.14, glideTo: 32 });
  }
}

function startBoost(s: State, env: SceneEnv) {
  if (s.boosting) return;
  s.boosting = true;
  s.boostT = 0;
  s.ringT = 0;
  boom(s, env, true);
  const bus = env.audio();
  if (bus && !s.hum) s.hum = startHum(bus, { type: 'sawtooth', freq: 48, cutoff: 420, noiseAmt: 0.9 });
}

function endBoost(s: State) {
  s.boosting = false;
  stopHum(s.hum);
  s.hum = null;
}

function startLoop(s: State, env: SceneEnv) {
  if (s.loopT >= 0) return;
  s.loopT = 0;
  s.loopDir = s.hz >= 0 ? -1 : 1;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.8, gain: 0.16, freq: 700, q: 0.7 });
    tone(bus, 300, { type: 'triangle', attack: 0.05, decay: 0.6, gain: 0.05, glideTo: 620 });
  }
}

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.holdT = 0;
  s.touched = true;
  s.idle = 0;
  env.wake(1200);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  if (s.boosting) endBoost(s);
  else startLoop(s, env);
  env.wake(1800);
}

function steer(s: State, env: SceneEnv, x: number, y: number) {
  if (env.w <= 0 || env.h <= 0) return;
  s.touched = true;
  s.idle = 0;
  s.fx = clamp(x / env.w, 0, 1);
  s.fy = clamp(y / env.h, 0, 1);
}

/* ---------- drawing pieces ---------- */

const TX = new Float32Array(TRAIL * 2);
const TY = new Float32Array(TRAIL * 2);
const TK = new Float32Array(TRAIL);
const TZ = new Float32Array(TRAIL);
const TH2 = new Float32Array(TRAIL);

/** The light trail as quads between ribbon edges, so translucent passes never overlap */
function drawTrail(ctx: C, s: State, front: boolean) {
  if (s.tLen < 2) return;
  const u = s.R / 220;
  const tr = s.trail;
  const n = s.tLen;
  // oldest first
  for (let j = 0; j < n; j++) {
    const o = ((s.tHead - (n - 1 - j) + TRAIL) % TRAIL) * 5;
    const heat = tr[o + 4];
    const age = tr[o + 3];
    TK[j] = clamp(1 - age / (1.1 + heat * 0.9), 0, 1);
    TZ[j] = tr[o + 2];
    TH2[j] = heat;
    TX[j] = tr[o];
    TY[j] = tr[o + 1];
  }
  ctx.globalCompositeOperation = 'lighter';
  // stacked passes from a wide blue haze in to a white hot core give a soft falloff
  for (let pass = 0; pass < PASSES.length; pass++) {
    const [scale, base, hot, col] = PASSES[pass];
    for (let j = 0; j < n - 1; j++) {
      const z = (TZ[j] + TZ[j + 1]) * 0.5;
      if (front ? z < 0 : z >= 0) continue;
      const k = TK[j + 1];
      if (k <= 0.001) continue;
      const heat = TH2[j + 1];
      const a = (base + hot * heat) * (pass === PASSES.length - 1 ? k * k : k);
      if (a < 0.004) continue;
      const pa = Math.max(0, j - 1);
      const pb = Math.min(n - 1, j + 2);
      const wA = halfWidth(j, n, u, scale);
      const wB = halfWidth(j + 1, n, u, scale);
      const nA = normalAt(pa, j + 1);
      const ax = -nA[1];
      const ay = nA[0];
      const nB = normalAt(j, pb);
      const bx = -nB[1];
      const by = nB[0];
      ctx.beginPath();
      ctx.moveTo(TX[j] + ax * wA, TY[j] + ay * wA);
      ctx.lineTo(TX[j + 1] + bx * wB, TY[j + 1] + by * wB);
      ctx.lineTo(TX[j + 1] - bx * wB, TY[j + 1] - by * wB);
      ctx.lineTo(TX[j] - ax * wA, TY[j] - ay * wA);
      ctx.closePath();
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

const PASSES: [number, number, number, string][] = [
  [4.2, 0.05, 0.06, '70,120,255'],
  [3.0, 0.06, 0.08, '100,150,255'],
  [2.0, 0.05, 0.12, '255,90,90'],
  [1.3, 0.12, 0.12, '255,220,190'],
  [0.65, 0.45, 0.3, '255,252,240'],
];

const NRM = [0, 0];
function normalAt(a: number, b: number) {
  const dx = TX[b] - TX[a];
  const dy = TY[b] - TY[a];
  const d = Math.hypot(dx, dy) || 1;
  NRM[0] = dx / d;
  NRM[1] = dy / d;
  return NRM;
}

function halfWidth(j: number, n: number, u: number, scale: number) {
  const k = TK[j];
  const heat = TH2[j];
  const depth = FOCAL / (FOCAL - TZ[j]);
  // pinched where it leaves him so it reads as coming off his heels
  const lead = smoothstep(0, 5, n - 1 - j);
  return (2.5 + 11 * k * k * (1 + heat * 0.9)) * u * depth * (0.3 + 0.7 * lead) * scale * 0.5;
}

function drawRings(ctx: C, s: State, front: boolean) {
  const u = s.R / 220;
  for (const r of s.rings) {
    if (r.age >= 1 || r.front !== front) continue;
    const k = r.age;
    const rad = (14 + 150 * Math.pow(k, 0.55)) * u * r.size;
    const a = Math.pow(1 - k, 1.6);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.ang);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.ellipse(-rad * 0.25, 0, rad * 0.3, rad, 0, 0, TAU);
    ctx.lineWidth = (2 + 7 * (1 - k)) * u;
    ctx.strokeStyle = `rgba(200,225,255,${(0.75 * a).toFixed(3)})`;
    ctx.stroke();
    ctx.lineWidth = (1 + 2 * (1 - k)) * u;
    ctx.strokeStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(-rad * 0.25, 0, rad * 0.3 * 0.92, rad * 0.92, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawParts(ctx: C, s: State) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of s.parts.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 0) {
      ctx.strokeStyle = `rgba(210,230,255,${(k * 0.9).toFixed(3)})`;
      ctx.lineWidth = p.size * 0.35;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.stroke();
    } else {
      glow(ctx, s.white, p.x, p.y, p.size * (2.4 - k), k * 0.4);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawHero(ctx: C, s: State, env: SceneEnv, t: number) {
  const hero = s.hero;
  const rimCv = s.rim;
  if (!hero || !rimCv) return;
  const hc = hero.getContext('2d');
  const rc = rimCv.getContext('2d');
  if (!hc || !rc) return;
  const { dpr } = env;
  const side = s.side;
  const sc = s.R * FIG * s.hp * (1 + s.boost * 0.05);
  hc.setTransform(1, 0, 0, 1, 0, 0);
  hc.clearRect(0, 0, hero.width, hero.height);
  hc.setTransform(dpr, 0, 0, dpr, 0, 0);
  hc.translate(side / 2, side / 2);
  hc.rotate(s.ang);
  hc.scale(sc, sc);
  hc.translate(-12, 0);
  paintHero(hc, t, s.boost);
  hc.setTransform(1, 0, 0, 1, 0, 0);
  // far side haze and the planet's shadow
  const haze = s.hz < 0 ? Math.min(0.35, -s.hz * 0.3) : 0;
  if (haze > 0.01 || s.shadow > 0.01) {
    hc.globalCompositeOperation = 'source-atop';
    if (s.shadow > 0.01) {
      hc.fillStyle = `rgba(4,8,24,${(s.shadow * 0.5).toFixed(3)})`;
      hc.fillRect(0, 0, hero.width, hero.height);
    }
    if (haze > 0.01) {
      hc.fillStyle = `rgba(40,70,140,${haze.toFixed(3)})`;
      hc.fillRect(0, 0, hero.width, hero.height);
    }
    hc.globalCompositeOperation = 'source-over';
  }
  // sunlit rim: his silhouette minus itself nudged away from the sun
  let lx = s.sunX - s.hx;
  let ly = s.sunY - s.hy;
  const ll = Math.hypot(lx, ly) || 1;
  lx /= ll;
  ly /= ll;
  const d = Math.max(1.5, sc * 3.4 * dpr);
  rc.setTransform(1, 0, 0, 1, 0, 0);
  rc.globalCompositeOperation = 'source-over';
  rc.clearRect(0, 0, rimCv.width, rimCv.height);
  rc.drawImage(hero, 0, 0);
  rc.globalCompositeOperation = 'source-in';
  rc.fillStyle = '#ffe7b8';
  rc.fillRect(0, 0, rimCv.width, rimCv.height);
  rc.globalCompositeOperation = 'destination-out';
  rc.drawImage(hero, -lx * d, -ly * d);
  rc.globalCompositeOperation = 'source-over';

  const x0 = s.hx - side / 2;
  const y0 = s.hy - side / 2;
  if (s.boost > 0.05) {
    // speed ghosts
    const bx = Math.cos(s.ang);
    const by = Math.sin(s.ang);
    const gap = 16 * sc * 3;
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = s.boost * 0.14 * (4 - i) * 0.5;
      ctx.drawImage(hero, x0 - bx * gap * i, y0 - by * gap * i, side, side);
    }
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(hero, x0, y0, side, side);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75 * (1 - s.shadow * 0.85);
  ctx.drawImage(rimCv, x0, y0, side, side);
  ctx.globalAlpha = 1;
  // fist leads with a hot glow at speed
  const ca = Math.cos(s.ang);
  const sa = Math.sin(s.ang);
  const fd = (119 - 12) * sc;
  glow(ctx, s.white, s.hx + ca * fd, s.hy + sa * fd, (10 + 26 * s.boost) * sc * 4, 0.12 + s.boost * 0.5);
  // vapour cone at the moment he breaks the barrier
  if (s.cone > 0.01) {
    ctx.save();
    ctx.translate(s.hx, s.hy);
    ctx.rotate(s.ang);
    ctx.scale(sc, sc);
    const k = s.cone;
    const g = ctx.createLinearGradient(110, 0, -60, 0);
    g.addColorStop(0, `rgba(255,255,255,${(0.55 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200,225,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(118, 0);
    ctx.quadraticCurveTo(40, -70 - (1 - k) * 30, -70, -86 - (1 - k) * 40);
    ctx.quadraticCurveTo(-40, 0, -70, 86 + (1 - k) * 40);
    ctx.quadraticCurveTo(40, 70 + (1 - k) * 30, 118, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.6,
    init: (env) => {
      const rings: Ring[] = [];
      for (let i = 0; i < 5; i++) rings.push({ x: 0, y: 0, ang: 0, age: 1, size: 1, front: true });
      return {
        // the still frame and the live start both find him on the near side, lower left
        a: Math.PI / 2 - 0.62 - (env.reducedMotion || !env.interactive ? 0.7 * 2.6 : 0.2),
        roll: 0,
        incl: 0.62,
        tRoll: 0,
        tIncl: 0.62,
        hx: 0,
        hy: 0,
        hz: 0,
        hp: 1,
        ang: 0,
        shadow: 0,
        boost: 0,
        boosting: false,
        boostT: 0,
        ringT: 0,
        loopT: -1,
        loopDir: 1,
        cone: 0,
        held: false,
        holdT: 0,
        touched: false,
        idle: 99,
        fx: 0.5,
        fy: 0.5,
        autoT: 0,
        autoBoost: 0,
        trail: new Float32Array(TRAIL * 5),
        tHead: 0,
        tLen: 0,
        rings,
        parts: makePool(220),
        shake: 0,
        flash: 0,
        rot: (32 / 360) * TW - ROT_RATE * 2.6,
        crot: 40,
        hum: null,
        cx: 0,
        cy: 0,
        R: 100,
        baseRoll: 0,
        baseIncl: 0.62,
        sunX: 0,
        sunY: 0,
        sun3: [-0.7, -0.5, 0.3],
        tex: earthTextures(),
        view: null,
        globe: null,
        atmo: null,
        bg: null,
        hero: null,
        rim: null,
        side: 100,
        vignette: null,
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.25, 'rgba(255,250,235,0.6)'],
          [1, 'rgba(255,240,220,0)'],
        ]),
        blue: glowSprite(64, [
          [0, 'rgba(200,225,255,1)'],
          [0.3, 'rgba(120,170,255,0.35)'],
          [1, 'rgba(60,100,255,0)'],
        ]),
        sunGlow: glowSprite(256, [
          [0, 'rgba(255,255,255,1)'],
          [0.06, 'rgba(255,252,236,1)'],
          [0.12, 'rgba(255,236,190,0.55)'],
          [0.35, 'rgba(255,190,120,0.14)'],
          [1, 'rgba(255,160,90,0)'],
        ]),
      };
    },
    resize: (s, env) => {
      layout(s, env);
      orbit(s, s.a);
      s.hx = P.x;
      s.hy = P.y;
      s.hz = P.z;
      s.hp = P.p;
    },
    update: (s, env, dt, t) => {
      // steering: pointer, else a slow autopilot drift
      s.idle += dt;
      const auto = !s.touched || s.idle > 5;
      if (auto) {
        s.tRoll = s.baseRoll + 0.2 * Math.sin(t * 0.21);
        s.tIncl = s.baseIncl + 0.16 * Math.sin(t * 0.13 + 0.8);
      } else {
        s.tRoll = s.baseRoll + (s.fx - 0.5) * 0.9;
        s.tIncl = lerp(0.95, 0.28, s.fy);
      }
      s.roll = damp(s.roll, s.tRoll, 2.2, dt);
      s.incl = damp(s.incl, s.tIncl, 2.2, dt);

      // hold to boost
      if (s.held) {
        s.holdT += dt;
        if (s.holdT > TAP && !s.boosting) startBoost(s, env);
      }
      // left alone he shows off now and then (not in still frames)
      if (auto && !env.reducedMotion && !s.held) {
        s.autoT += dt;
        if (s.autoT > 7.5) {
          s.autoT = 0;
          if (Math.random() < 0.5) startLoop(s, env);
          else {
            s.autoBoost = 1.7;
            startBoost(s, env);
          }
        }
        if (s.autoBoost > 0) {
          s.autoBoost -= dt;
          if (s.autoBoost <= 0) endBoost(s);
        }
      } else if (s.autoBoost > 0) {
        s.autoBoost = 0;
        if (!s.held) endBoost(s);
      }
      if (s.boosting) {
        s.boostT += dt;
        s.ringT += dt;
        if (s.ringT > 0.85) {
          s.ringT = 0;
          boom(s, env, false);
        }
      }
      s.boost = damp(s.boost, s.boosting ? 1 : 0, s.boosting ? 5 : 2.5, dt);
      if (s.hum) setHum(s.hum, 44 + s.boost * 30, 0.06 * s.boost + 0.005, 300 + s.boost * 900);

      // orbit and loop
      const looping = s.loopT >= 0;
      const w = lerp(0.7, 2.2, s.boost) * (looping ? 0.5 : 1);
      s.a += w * dt;
      orbit(s, s.a);
      let x = P.x;
      let y = P.y;
      if (looping) {
        s.loopT += dt / LOOP_DUR;
        if (s.loopT >= 1) {
          s.loopT = -1;
          boom(s, env, false);
        } else {
          const ph = easeInOutCubic(s.loopT) * TAU;
          // loop in the plane of the orbit tangent and the radial side: across the planet's face on the near side, out into space on the far side
          const bx = P.x;
          const by = P.y;
          const bz = P.z;
          const bp = P.p;
          orbit(s, s.a + 0.02);
          let hx = P.x - bx;
          let hy = P.y - by;
          const hl = Math.hypot(hx, hy) || 1;
          hx /= hl;
          hy /= hl;
          P.x = bx;
          P.y = by;
          P.z = bz;
          P.p = bp;
          let ox = -hy;
          let oy = hx;
          if ((ox * (bx - s.cx) + oy * (by - s.cy)) * s.loopDir < 0) {
            ox = -ox;
            oy = -oy;
          }
          const rl = s.R * 0.32 * P.p;
          x += rl * (Math.sin(ph) * hx + (1 - Math.cos(ph)) * ox);
          y += rl * (Math.sin(ph) * hy + (1 - Math.cos(ph)) * oy);
        }
      }
      const dx = x - s.hx;
      const dy = y - s.hy;
      if (dx * dx + dy * dy > 0.01) {
        const target = Math.atan2(dy, dx);
        let da = target - s.ang;
        da -= Math.round(da / TAU) * TAU;
        s.ang += da * (1 - Math.exp(-(looping ? 30 : 14) * dt));
      }
      s.hx = x;
      s.hy = y;
      s.hz = P.z;
      s.hp = P.p;

      // in the planet's shadow?
      const px = (x - s.cx) / s.R;
      const py = (y - s.cy) / s.R;
      const pz = P.z;
      const along = px * s.sun3[0] + py * s.sun3[1] + pz * s.sun3[2];
      if (along < 0) {
        const qx = px - along * s.sun3[0];
        const qy = py - along * s.sun3[1];
        const qz = pz - along * s.sun3[2];
        s.shadow = smoothstep(1.06, 0.9, Math.hypot(qx, qy, qz));
      } else s.shadow = 0;

      // trail
      const tr = s.trail;
      for (let i = 0; i < s.tLen; i++) tr[((s.tHead - i + TRAIL) % TRAIL) * 5 + 3] += dt;
      // a new point every few pixels; in between the newest point just follows him
      const prev = ((s.tHead - 1 + TRAIL) % TRAIL) * 5;
      if (s.tLen < 2 || Math.hypot(tr[s.tHead * 5] - tr[prev], tr[s.tHead * 5 + 1] - tr[prev + 1]) > 5) {
        s.tHead = (s.tHead + 1) % TRAIL;
        s.tLen = Math.min(TRAIL, s.tLen + 1);
      }
      const o = s.tHead * 5;
      tr[o] = x;
      tr[o + 1] = y;
      tr[o + 2] = P.z;
      tr[o + 3] = 0;
      tr[o + 4] = Math.max(s.boost, s.loopT >= 0 ? 0.4 : 0);
      while (s.tLen > 2 && tr[((s.tHead - s.tLen + 1 + TRAIL) % TRAIL) * 5 + 3] > 2.2) s.tLen--;

      if (s.boost > 0.3 && Math.random() < s.boost * 0.8) {
        const u = s.R / 220;
        emit(
          s.parts,
          x + (Math.random() - 0.5) * 20 * u,
          y + (Math.random() - 0.5) * 20 * u,
          -Math.cos(s.ang) * 160 * u + (Math.random() - 0.5) * 60 * u,
          -Math.sin(s.ang) * 160 * u + (Math.random() - 0.5) * 60 * u,
          0.5,
          5 * u,
          0,
          2
        );
      }
      stepPool(s.parts, dt);
      for (const r of s.rings) r.age = Math.min(1, r.age + dt / 0.85);
      s.cone = Math.max(0, s.cone - dt * 2.2);
      s.shake = Math.max(0, s.shake - dt * 14);
      s.flash = Math.max(0, s.flash - dt * 2.5);
      s.rot += ROT_RATE * dt * (1 + s.boost * 0.15);
      s.crot += ROT_RATE * 0.5 * 1.18 * dt;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const view = s.view;
      ctx.save();
      if (s.shake > 0.05) ctx.translate(shakeX(s.shake, t), shakeY(s.shake, t));
      if (s.bg) ctx.drawImage(s.bg, -10, -10, w + 20, h + 20);
      else {
        ctx.fillStyle = '#04050c';
        ctx.fillRect(0, 0, w, h);
      }

      // the sun
      const sr = Math.min(w, h) * 0.5;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.sunGlow, s.sunX, s.sunY, sr, 1);
      glow(ctx, s.white, s.sunX, s.sunY, sr * 0.08, 1);
      // anamorphic streak
      const sg = ctx.createLinearGradient(s.sunX - sr * 1.6, 0, s.sunX + sr * 1.6, 0);
      sg.addColorStop(0, 'rgba(120,170,255,0)');
      sg.addColorStop(0.5, 'rgba(210,230,255,0.28)');
      sg.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(s.sunX - sr * 1.6, s.sunY - 0.8, sr * 3.2, 1.6);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      const behind = s.hz < 0;
      drawTrail(ctx, s, false);
      drawRings(ctx, s, false);
      if (behind) {
        drawHero(ctx, s, env, t);
        drawParts(ctx, s);
      }

      // planet
      if (view && s.globe) {
        shadeGlobe(view, s.tex, s.rot, s.crot);
        const gc = s.globe.getContext('2d');
        if (gc) gc.putImageData(view.img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(s.globe, s.cx - s.R, s.cy - s.R, s.R * 2, s.R * 2);
      }
      if (s.atmo) {
        const ar = s.R * 1.35;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s.atmo, s.cx - ar, s.cy - ar, ar * 2, ar * 2);
        ctx.globalCompositeOperation = 'source-over';
      }

      drawTrail(ctx, s, true);
      drawRings(ctx, s, true);
      if (!behind) {
        drawHero(ctx, s, env, t);
        drawParts(ctx, s);
      }

      // lens ghosts along the line from the sun through the middle of the frame
      ctx.globalCompositeOperation = 'lighter';
      const mx = w / 2 - s.sunX;
      const my = h / 2 - s.sunY;
      const ghosts = [
        [0.55, 0.05, 0.1],
        [0.9, 0.025, 0.14],
        [1.35, 0.09, 0.06],
        [1.75, 0.04, 0.09],
      ];
      for (const [k, r, a] of ghosts) glow(ctx, s.blue, s.sunX + mx * k, s.sunY + my * k, r * sr * 2, a);
      ctx.globalAlpha = 1;
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(220,235,255,${(s.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env, x, y) => {
      steer(s, env, x, y);
      press(s, env);
    },
    onPointerMove: (s, env, x, y) => steer(s, env, x, y),
    onPointerUp: (s, env) => release(s, env),
    onPointerLeave: (s) => {
      s.idle = Math.max(s.idle, 3.5);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.globe, s.atmo, s.bg, s.hero, s.rim, s.white, s.blue, s.sunGlow);
      s.globe = s.atmo = s.bg = s.hero = s.rim = null;
      s.view = null;
    },
  });

