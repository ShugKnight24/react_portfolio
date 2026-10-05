import { createCanvasScene, clamp, damp, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
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
import {
  BLOOD_DEEP,
  BLOOD_RED,
  LUNGE,
  REV,
  SLASH,
  STANCE,
  blendPose,
  bladeTip,
  capsule,
  drawBlood,
  drawDenji,
  makeLook,
  seg,
  stepLook,
} from './csm-kit';
import type { DenjiLook } from './csm-kit';

/**
 * Chainsaw Man vs Reze: a typhoon night on the school pool deck. Denji (the shared figure
 * from csm-kit) squares up to Reze in her Bomb Devil form: a round black bomb for a head with
 * a lit fuse, glowing slits for eyes, the grenade pin hanging from her choker, a dark purple
 * dress and forearms packed with charge that glow before they go off. She keeps lobbing
 * blasts across the deck; holding revs his saws so he can bat them apart in front of him.
 * Letting go sends him lunging straight through the point blank explosion she sets off to
 * stop him: the fireball, smoke ring and shock ring light up the rain, the pool and both of
 * them, and he cuts through to her in a spray of sparks and blood. She rides little blasts
 * off her boots back out of range in a backflip and lands ready for more.
 */

type C = CanvasRenderingContext2D;

interface Blast {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  big: boolean;
  on: boolean;
  puffs: Float32Array;
}

interface Shot {
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  on: boolean;
}

interface State {
  // Denji: the shared figure's live bits
  look: DenjiLook;
  x: number;
  home: number;
  phase: number; // 0 ready, 1 lunge, 2 follow through, 3 recover, 4 return
  pt: number;
  from: number;
  to: number;
  power: number;
  held: boolean;
  touched: boolean;
  idle: number;
  autoT: number;
  speed: number;
  ghostT: number;
  ghosts: number[];
  push: number;
  flinch: number;
  exhaust: number;
  clash: boolean;
  // Reze
  rx: number;
  rhome: number;
  rPhase: number; // 0 ready, 1 wind up, 2 throw, 3 blown back
  rT: number;
  throwT: number;
  rAir: number;
  rSpin: number;
  rFlinch: number;
  rHeat: number;
  rCut: number;
  // fx
  blasts: Blast[];
  shots: Shot[];
  parts: Pool;
  rain: Float32Array;
  splash: Float32Array;
  splashT: number;
  wind: number;
  bolt: number;
  boltT: number;
  slash: number;
  slashX: number;
  slashY: number;
  cutA: number;
  stop: number;
  shake: number;
  flash: number;
  light: number;
  lightX: number;
  lightY: number;
  hum: Hum | null;
  rainHum: Hum | null;
  // layout
  u: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  fire: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  orange: HTMLCanvasElement;
  white: HTMLCanvasElement;
  cool: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const MAX_PARTS = 520;
const RAIN = 260;
const SPLASH = 36;
const PUFFS = 9;

const J = new Array<number>(22).fill(0);
const TMP = new Array<number>(22).fill(0);
const TIP = [0, 0, 0];

/* ---------- Reze, the Bomb Devil (local units, feet origin, facing right; drawn mirrored) ---------- */

// same joint order as Denji's
const R_READY = [0, -117, 5, -192, 10, -226, 29, -161, 39, -192, -18, -164, -10, -135, 18, -60, 29, 0, -18, -60, -29, 0];
const R_WIND = [-5, -114, -5, -190, -3, -224, -34, -169, -60, -192, 13, -161, 31, -174, 21, -57, 36, 0, -21, -57, -36, 0];
const R_THROW = [8, -112, 23, -185, 36, -213, 57, -182, 99, -187, -10, -166, -34, -146, 31, -57, 49, 0, -23, -52, -42, 0];
const R_BLOWN = [-8, -112, -23, -182, -34, -211, 0, -195, 16, -229, -44, -195, -57, -229, 16, -68, 34, -18, -29, -65, -49, -31];
const RJ = new Array<number>(22).fill(0);
/** Reze is drawn a touch larger so she holds her own next to Denji */
const RS = 1.08;

const INK = '#0b0710';
const RSKIN = ['#7e5146', '#d9a48c', '#f4cdb6'];
const RSKIN_FAR = ['#57372f', '#a67a68', '#c49884'];
const TIGHTS = ['#050407', '#141019', '#2e2638'];
const TIGHTS_FAR = ['#030205', '#0b080f', '#1d1724'];
const DRESS = ['#08060c', '#1b1224', '#36244a', '#6a4a8c'];
const BOMB = ['#050507', '#1a1822', '#3a3446', '#a59ab8'];

/** Forearm packed with charge: a dark casing with seams that glow hotter before a throw */
function bombArm(c: C, x0: number, y0: number, x1: number, y1: number, heat: number, far: boolean, flat: string | null) {
  capsule(c, x0, y0, x1, y1, 6.6, 6);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    return;
  }
  const g = c.createLinearGradient(x0, y0 - 6, x0, y0 + 6);
  g.addColorStop(0, far ? '#2a2632' : '#4a4458');
  g.addColorStop(0.5, far ? '#14121a' : '#211e2a');
  g.addColorStop(1, '#08070b');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const hot = far ? heat * 0.6 : heat;
  c.strokeStyle = `rgba(255,${Math.round(110 + hot * 130)},${Math.round(60 + hot * 140)},${(0.4 + hot * 0.6).toFixed(3)})`;
  c.lineWidth = 1.4 + hot;
  c.beginPath();
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    c.moveTo(lerp(x0, x1, k) + nx * 5, lerp(y0, y1, k) + ny * 5);
    c.lineTo(lerp(x0, x1, k + 0.05) - nx * 5, lerp(y0, y1, k + 0.05) - ny * 5);
  }
  c.stroke();
  // fist
  c.beginPath();
  c.arc(x1 + Math.cos(a) * 3, y1 + Math.sin(a) * 3, 6, 0, TAU);
  c.fillStyle = far ? RSKIN_FAR[1] : RSKIN[1];
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.stroke();
}

function bombHead(c: C, x: number, y: number, a: number, flat: string | null, t: number, s: State) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  // fuse: a curled wick out of the crown
  c.strokeStyle = flat ?? '#3a2a22';
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(2, -24);
  c.bezierCurveTo(4, -34, 14, -32, 12, -42);
  c.stroke();
  // cap where the fuse enters
  c.fillStyle = flat ?? '#5a5466';
  c.fillRect(-5, -27, 13, 6);
  // the bomb: a big round shell
  c.beginPath();
  c.arc(0, 0, 25, 0, TAU);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.restore();
    return;
  }
  const g = c.createRadialGradient(-8, -11, 2, 0, 0, 27);
  g.addColorStop(0, BOMB[3]);
  g.addColorStop(0.22, BOMB[2]);
  g.addColorStop(0.7, BOMB[1]);
  g.addColorStop(1, BOMB[0]);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = '#000';
  c.lineWidth = 2;
  c.stroke();
  c.save();
  c.clip();
  // purple sheen along the lower rim
  c.strokeStyle = 'rgba(160,110,220,0.35)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, 0, 23, 0.3, 1.9);
  c.stroke();
  // riveted seam band
  c.strokeStyle = '#4a4458';
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(0, -4, 26, 7, 0, 0.1, Math.PI - 0.1);
  c.stroke();
  c.restore();
  c.fillStyle = '#8a8298';
  for (let i = 0; i < 6; i++) {
    const k = 0.25 + i * 0.5;
    c.beginPath();
    c.arc(Math.cos(k) * 24, -4 + Math.sin(k) * 6.5, 1.2, 0, TAU);
    c.fill();
  }
  // specular glint
  c.fillStyle = 'rgba(225,215,245,0.6)';
  c.beginPath();
  c.ellipse(-10, -13, 6, 3, -0.6, 0, TAU);
  c.fill();
  // eyes: two hot slits under the band
  const hot = 0.6 + s.light * 0.4 + s.rHeat * 0.4;
  c.fillStyle = `rgba(255,${Math.round(150 + Math.min(1, hot) * 80)},90,${Math.min(1, 0.6 + 0.4 * hot).toFixed(3)})`;
  c.beginPath();
  c.ellipse(13, 5, 4.5, 1.8, -0.15, 0, TAU);
  c.ellipse(23, 4, 2.6, 1.5, -0.15, 0, TAU);
  c.fill();
  // a jagged grin glowing from inside
  c.fillStyle = '#140806';
  c.beginPath();
  c.moveTo(0, 12);
  c.quadraticCurveTo(12, 17, 23, 10);
  c.lineTo(21, 17);
  c.quadraticCurveTo(10, 22, 1, 16);
  c.closePath();
  c.fill();
  c.fillStyle = `rgba(255,${Math.round(140 + Math.min(1, hot) * 70)},70,${Math.min(1, 0.5 + 0.4 * hot).toFixed(3)})`;
  c.beginPath();
  for (let i = 0; i < 7; i++) {
    const tx = 1.5 + i * 3;
    c.moveTo(tx, 13 + i * 0.1);
    c.lineTo(tx + 1.5, 16.5);
    c.lineTo(tx + 3, 13 + i * 0.1);
  }
  c.fill();
  // spark at the fuse tip
  c.globalCompositeOperation = 'lighter';
  const fl = 0.75 + Math.sin(t * 40) * 0.15 + Math.sin(t * 23) * 0.1;
  glow(c, s.fire, 12, -42, 13 * fl, 1);
  glow(c, s.white, 12, -42, 4 * fl, 1);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.restore();
}

function reze(c: C, s: State, flat: string | null, t: number, heat: number) {
  const px = RJ[0];
  const py = RJ[1];
  const cx = RJ[2];
  const cy = RJ[3];
  const tl = Math.hypot(cx - px, cy - py) || 1;
  const dx = (cx - px) / tl;
  const dy = (cy - py) / tl;
  const nx = -dy;
  const ny = dx;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // far leg in dark tights and a tall boot, far arm behind
  seg(c, px - nx * 4, py - ny * 4, RJ[18], RJ[19], 8, 6.4, TIGHTS_FAR, flat);
  seg(c, RJ[18], RJ[19], RJ[20], RJ[21] - 5, 6.4, 5, TIGHTS_FAR, flat);
  boot(c, RJ[20], RJ[21], flat);
  seg(c, cx - nx * 6, cy - ny * 6, RJ[10], RJ[11], 5.4, 4.8, RSKIN_FAR, flat);
  bombArm(c, RJ[10], RJ[11], RJ[12], RJ[13], heat, true, flat);
  // near leg
  seg(c, px + nx * 4, py + ny * 4, RJ[14], RJ[15], 8.4, 6.6, TIGHTS, flat);
  seg(c, RJ[14], RJ[15], RJ[16], RJ[17] - 5, 6.6, 5.2, TIGHTS, flat);
  boot(c, RJ[16], RJ[17], flat);

  // fitted dark dress: bodice, a cinched waist and a skirt whipping in the wind
  const wind = s.wind * 30 + Math.sin(t * 7) * 3;
  const hemY = 34;
  c.beginPath();
  c.moveTo(cx - nx * 13 + dx * 4, cy - ny * 13 + dy * 4);
  c.quadraticCurveTo(cx + nx * 6 + dx * 8, cy + ny * 6 + dy * 8, cx + nx * 15, cy + ny * 15);
  c.quadraticCurveTo(lerp(cx, px, 0.6) + nx * 9, lerp(cy, py, 0.6) + ny * 9, px + nx * 11, py + ny * 11);
  c.lineTo(px + nx * 24 + wind * 0.4, py + hemY - 4);
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const hx = lerp(px + nx * 24 + wind * 0.4, px - nx * 26 + wind, k);
    const hy = py + hemY + (i % 2 ? 6 : 0) + Math.sin(t * 9 + i) * 2;
    c.lineTo(hx, hy);
  }
  c.lineTo(px - nx * 12, py - ny * 12);
  c.quadraticCurveTo(lerp(cx, px, 0.5) - nx * 11, lerp(cy, py, 0.5) - ny * 11, cx - nx * 13 + dx * 4, cy - ny * 13 + dy * 4);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(cx + nx * 15, cy, px - nx * 20, py + 30);
    g.addColorStop(0, DRESS[3]);
    g.addColorStop(0.25, DRESS[2]);
    g.addColorStop(0.7, DRESS[1]);
    g.addColorStop(1, DRESS[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2.2;
    c.stroke();
    // skirt folds and the purple trim at the hem
    c.strokeStyle = 'rgba(150,110,200,0.45)';
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const k = 0.15 + i * 0.23;
      c.moveTo(lerp(px + nx * 10, px - nx * 10, k), lerp(py + ny * 10, py - ny * 10, k));
      c.lineTo(lerp(px + nx * 24 + wind * 0.4, px - nx * 26 + wind, k), py + hemY);
    }
    c.stroke();
    c.strokeStyle = '#8a5cc0';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(px + nx * 24 + wind * 0.4, py + hemY - 2);
    c.lineTo(px - nx * 26 + wind, py + hemY + 2);
    c.stroke();
    // belt
    capsule(c, px - nx * 12, py - ny * 12 - 2, px + nx * 11, py + ny * 11 - 2, 2.6, 2.6);
    c.fillStyle = '#060509';
    c.fill();
    // bare shoulders over the neckline
    c.fillStyle = RSKIN[1];
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(cx + dx * 5, cy + dy * 5, 13, 6, Math.atan2(dy, dx) + Math.PI / 2, Math.PI, TAU);
    c.fill();
    c.stroke();
  }
  // neck, choker and the grenade pin hanging off it
  const hx = RJ[4];
  const hy = RJ[5];
  const nbx = cx + dx * 8 + nx * 2;
  const nby = cy + dy * 8 + ny * 2;
  seg(c, nbx, nby, lerp(nbx, hx, 0.7), lerp(nby, hy, 0.7), 5.2, 4.8, RSKIN, flat);
  if (!flat) {
    const kx = lerp(nbx, hx, 0.3);
    const ky = lerp(nby, hy, 0.3);
    capsule(c, kx - nx * 5.5, ky - ny * 5.5, kx + nx * 5.5, ky + ny * 5.5, 2.4, 2.4);
    c.fillStyle = '#050407';
    c.fill();
    c.strokeStyle = '#dfe4ec';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(kx + nx * 6, ky + ny * 6 + 7, 5.4, 0, TAU);
    c.stroke();
    c.strokeStyle = '#9aa0ac';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(kx + nx * 6, ky + ny * 6 + 1.6);
    c.lineTo(kx + nx * 6, ky + ny * 6);
    c.stroke();
  }
  bombHead(c, hx, hy, Math.atan2(dy, dx) + Math.PI / 2 - 0.1, flat, t, s);

  // near arm: bare upper arm, bomb forearm, a glowing fist
  seg(c, cx + nx * 5, cy + ny * 5, RJ[6], RJ[7], 5.8, 5, RSKIN, flat);
  bombArm(c, RJ[6], RJ[7], RJ[8], RJ[9], heat, false, flat);
  // fresh cut from Denji's saw
  if (!flat && s.rCut > 0) {
    c.globalAlpha = Math.min(1, s.rCut * 2);
    c.strokeStyle = BLOOD_DEEP;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(cx + nx * 14, cy + ny * 14 + 6);
    c.lineTo(px - nx * 10, py - ny * 10 - 14);
    c.stroke();
    c.strokeStyle = BLOOD_RED;
    c.lineWidth = 3;
    c.stroke();
    c.globalAlpha = 1;
  }
}

function boot(c: C, x: number, y: number, flat: string | null) {
  c.beginPath();
  c.moveTo(x - 6, y - 10);
  c.quadraticCurveTo(x + 4, y - 10, x + 13, y - 3);
  c.quadraticCurveTo(x + 14, y, x + 11, y + 0.5);
  c.lineTo(x - 7, y + 0.5);
  c.lineTo(x - 8, y - 6);
  c.closePath();
  c.fillStyle = flat ?? '#050407';
  c.fill();
  if (!flat) {
    c.fillStyle = '#2a2234';
    c.fillRect(x - 7, y - 1.5, 4, 2);
  }
}

/* ---------- blasts ---------- */

function spawnBlast(s: State, x: number, y: number, r: number, big: boolean) {
  let slot = s.blasts[0];
  for (const b of s.blasts) {
    if (!b.on) {
      slot = b;
      break;
    }
    if (b.t / b.dur > slot.t / slot.dur) slot = b;
  }
  slot.on = true;
  slot.x = x;
  slot.y = y;
  slot.r = r;
  slot.t = 0;
  slot.dur = big ? 1.5 : 0.95;
  slot.big = big;
  for (let i = 0; i < PUFFS; i++) {
    const a = (i / PUFFS) * TAU + rand(-0.3, 0.3);
    const d = i === 0 ? 0 : rand(0.25, 0.55);
    slot.puffs[i * 3] = Math.cos(a) * d;
    slot.puffs[i * 3 + 1] = Math.sin(a) * d * 0.8 - 0.1;
    slot.puffs[i * 3 + 2] = i === 0 ? 0.7 : rand(0.34, 0.55);
  }
  // embers and a little debris
  const n = big ? 60 : 26;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(0.4, 1) * r * (big ? 9 : 7);
    emit(s.parts, x, y, Math.cos(a) * v, Math.sin(a) * v - r * 2, rand(0.3, 0.8), rand(1.5, 3), 0, 2.5, 600);
  }
}

function boom(bus: AudioBus | null, big: boolean) {
  if (!bus) return;
  noise(bus, { duration: big ? 1.4 : 0.8, gain: big ? 0.6 : 0.35, freq: big ? 150 : 220, q: 0.5, type: 'lowpass' });
  noise(bus, { duration: big ? 0.5 : 0.3, gain: big ? 0.3 : 0.18, freq: 900, q: 0.6 });
  noise(bus, { duration: 0.2, gain: 0.14, freq: 3000, q: 0.5, type: 'highpass' });
  tone(bus, big ? 70 : 90, { type: 'sine', attack: 0.004, decay: big ? 1 : 0.5, gain: big ? 0.35 : 0.22, glideTo: 28 });
}

function drawBlastFire(c: C, s: State, b: Blast) {
  const u = s.u;
  const k = b.t / b.dur;
  const grow = easeOutCubic(Math.min(1, k * (b.big ? 5 : 3.5)));
  const R = b.r * u * grow * (1 + k * 0.35);
  const bx = b.x * u;
  const by = s.gy + b.y * u;
  const rise = k * k * b.r * u * 0.8;
  // smoke first, thickening as the fire cools
  const sm = Math.min(1, k * 2.6) * (1 - k);
  if (sm > 0.01) {
    c.globalAlpha = 1;
    for (let i = 0; i < PUFFS; i++) {
      const px = bx + b.puffs[i * 3] * R * 1.1;
      const py = by + b.puffs[i * 3 + 1] * R * 1.1 - rise;
      const pr = b.puffs[i * 3 + 2] * R * (1.3 + k * 0.6);
      c.globalAlpha = sm * 0.8;
      c.drawImage(s.smoke, px - pr, py - pr, pr * 2, pr * 2);
    }
  }
  // the fireball
  c.globalCompositeOperation = 'lighter';
  const fire = Math.pow(1 - k, 1.6);
  for (let i = 0; i < PUFFS; i++) {
    const px = bx + b.puffs[i * 3] * R;
    const py = by + b.puffs[i * 3 + 1] * R - rise * 0.6;
    const pr = b.puffs[i * 3 + 2] * R * 1.35 * (1 - k * 0.35);
    glow(c, s.fire, px, py, pr, fire);
  }
  glow(c, s.white, bx, by - rise * 0.4, R * 0.55 * (1 - k * 0.5), Math.pow(1 - k, 3));
  // shock ring
  if (k < 0.35) {
    const q = k / 0.35;
    c.globalAlpha = (1 - q) * 0.8;
    c.strokeStyle = '#ffe6c0';
    c.lineWidth = Math.max(1, (b.big ? 5 : 3) * u * (1 - q));
    c.beginPath();
    c.ellipse(bx, by, b.r * u * (0.6 + q * 2.6), b.r * u * (0.6 + q * 2.6) * 0.82, 0, 0, TAU);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  // a smoke ring rolling up off the big ones
  if (b.big && k > 0.12) {
    const q = (k - 0.12) / 0.88;
    const rr = b.r * u * (0.5 + q * 0.9);
    const ry = by - b.r * u * (0.4 + q * 1.8);
    c.globalAlpha = (1 - q) * 0.5;
    c.strokeStyle = '#2c2528';
    c.lineWidth = b.r * u * 0.16 * (1 - q * 0.5);
    c.beginPath();
    c.ellipse(bx, ry, rr, rr * 0.3, 0, 0, TAU);
    c.stroke();
    c.globalAlpha = (1 - q) * 0.5 * (1 - q);
    c.strokeStyle = '#ff9a48';
    c.lineWidth = Math.max(1, 3 * u);
    c.beginPath();
    c.ellipse(bx, ry + c.lineWidth, rr, rr * 0.3, 0, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  c.globalAlpha = 1;
}

/* ---------- the night deck ---------- */

function paintNight(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const u = s.u;
  const gy = s.gy;
  const rnd = mulberry(9);
  const sky = c.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#04050b');
  sky.addColorStop(0.55, '#0e1426');
  sky.addColorStop(1, '#1b1d33');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  // storm clouds tearing past
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w;
    const y = rnd() * gy * 0.5;
    const rx = (80 + rnd() * 200) * u;
    const ry = (18 + rnd() * 30) * u;
    c.fillStyle = `rgba(${22 + Math.round(rnd() * 14)},${26 + Math.round(rnd() * 14)},${44 + Math.round(rnd() * 20)},0.7)`;
    c.beginPath();
    c.ellipse(x, y, rx, ry, -0.12, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(90,100,140,0.08)';
    c.beginPath();
    c.ellipse(x - rx * 0.2, y - ry * 0.4, rx * 0.7, ry * 0.4, -0.12, 0, TAU);
    c.fill();
  }
  // city behind the school
  const hz = gy - 190 * u;
  for (let x = -10; x < w; ) {
    const bw = (26 + rnd() * 50) * u;
    const top = hz - (20 + rnd() * 110) * u;
    c.fillStyle = '#0a0c16';
    c.fillRect(x, top, bw, gy - top);
    for (let wy = top + 8 * u; wy < hz + 40 * u; wy += 10 * u) {
      for (let wx = x + 5 * u; wx < x + bw - 6 * u; wx += 9 * u) {
        if (rnd() < 0.1) {
          c.fillStyle = rnd() < 0.7 ? 'rgba(255,200,120,0.5)' : 'rgba(150,200,255,0.4)';
          c.fillRect(wx, wy, 3 * u, 4 * u);
        }
      }
    }
    x += bw + 3 * u;
  }
  // the school block on the left
  const sx1 = w * 0.42;
  const stop = gy - 330 * u;
  const sg = c.createLinearGradient(0, stop, 0, gy);
  sg.addColorStop(0, '#1a1d2e');
  sg.addColorStop(1, '#10121d');
  c.fillStyle = sg;
  c.fillRect(-10, stop, sx1 + 10, gy - stop);
  c.fillStyle = 'rgba(160,170,210,0.18)';
  c.fillRect(-10, stop, sx1 + 10, 3 * u);
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 7; col++) {
      const wx = (14 + col * 50) * u;
      const wy = stop + (26 + r * 58) * u;
      if (wx > sx1 - 30 * u) continue;
      const lit = rnd() < 0.12;
      c.fillStyle = lit ? 'rgba(240,210,140,0.55)' : '#1f2539';
      c.fillRect(wx, wy, 36 * u, 30 * u);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(wx + 17 * u, wy, 2 * u, 30 * u);
    }
  }
  // chain link fence
  const f0 = gy - 160 * u;
  const f1 = gy - 60 * u;
  c.strokeStyle = 'rgba(120,130,160,0.16)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = -f1; x < w + f1; x += 9 * u) {
    c.moveTo(x, f0);
    c.lineTo(x + (f1 - f0), f1);
    c.moveTo(x, f1);
    c.lineTo(x + (f1 - f0), f0);
  }
  c.stroke();
  c.fillStyle = '#23283a';
  for (let x = 20 * u; x < w; x += 110 * u) c.fillRect(x, f0 - 4 * u, 4 * u, f1 - f0 + 4 * u);
  c.fillRect(0, f0 - 4 * u, w, 3 * u);
  // the pool
  const p0 = gy - 60 * u;
  const p1 = gy - 16 * u;
  const pg = c.createLinearGradient(0, p0, 0, p1);
  pg.addColorStop(0, '#0b2a33');
  pg.addColorStop(1, '#0f3a44');
  c.fillStyle = pg;
  c.fillRect(0, p0, w, p1 - p0);
  for (let i = 0; i < 3; i++) {
    const y = p0 + (10 + i * 12) * u;
    for (let x = (i * 7) * u; x < w; x += 14 * u) {
      c.fillStyle = (x / (14 * u)) % 2 < 1 ? 'rgba(220,70,70,0.5)' : 'rgba(230,230,240,0.45)';
      c.fillRect(x, y, 6 * u, 2.2 * u);
    }
  }
  c.strokeStyle = 'rgba(140,200,220,0.12)';
  c.beginPath();
  for (let i = 0; i < 20; i++) {
    const x = rnd() * w;
    const y = p0 + rnd() * (p1 - p0);
    c.moveTo(x, y);
    c.lineTo(x + (20 + rnd() * 40) * u, y);
  }
  c.stroke();
  c.fillStyle = '#6e7486';
  c.fillRect(0, p0 - 2 * u, w, 2.5 * u);
  c.fillStyle = '#9aa0b4';
  c.fillRect(0, p1 - 1, w, 3 * u);
  // wet tiled deck
  const dg = c.createLinearGradient(0, p1, 0, h);
  dg.addColorStop(0, '#2a2c3c');
  dg.addColorStop(1, '#0d0e16');
  c.fillStyle = dg;
  c.fillRect(0, p1 + 2 * u, w, h - p1);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  const vx = w * 0.5;
  const vy = gy - 260 * u;
  for (let i = -20; i <= 20; i++) {
    const x = vx + i * 60 * u;
    const k0 = (p1 + 2 * u - vy) / (h - vy);
    c.moveTo(lerp(vx, x, k0), p1 + 2 * u);
    c.lineTo(x, h);
  }
  for (let y = p1 + 8 * u, step = 6 * u; y < h; y += step, step *= 1.35) {
    c.moveTo(0, y);
    c.lineTo(w, y);
  }
  c.stroke();
  // street lamp over the gate on the right
  const lx = w * 0.9;
  c.fillStyle = '#10121a';
  c.fillRect(lx - 3 * u, gy - 340 * u, 6 * u, 330 * u);
  c.fillRect(lx - 40 * u, gy - 340 * u, 44 * u, 5 * u);
  c.fillStyle = '#2a2d3a';
  c.fillRect(lx - 48 * u, gy - 338 * u, 18 * u, 7 * u);
}

/* ---------- actions ---------- */

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.touched = true;
  s.idle = 0;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.12, gain: 0.12, freq: 1600, q: 1.2 });
    stopHum(s.hum);
    s.hum = startHum(bus, { type: 'sawtooth', freq: 55, cutoff: 700, noiseAmt: 0.35 });
    if (!s.rainHum) s.rainHum = startHum(bus, { type: 'sine', freq: 30, cutoff: 1800, noiseAmt: 1 });
  }
  s.look.cvx -= 80;
  s.look.cvy += 60;
  env.wake(800);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  lunge(s, env, true);
  env.wake(3200);
}

function lunge(s: State, env: SceneEnv, sound: boolean) {
  if (s.phase !== 0) return;
  s.power = 0.35 + s.look.rev * 0.65;
  s.phase = 1;
  s.pt = 0;
  s.from = s.x;
  s.to = s.rx - 112;
  s.ghostT = 0;
  s.clash = false;
  const bus = sound ? env.audio() : null;
  if (bus) noise(bus, { duration: 0.3, gain: 0.14, freq: 700, q: 0.5 });
}

function throwShot(s: State) {
  let slot = s.shots[0];
  for (const sh of s.shots) if (!sh.on) slot = sh;
  // leaves her near hand (mirrored), lands on or in front of Denji
  slot.on = true;
  slot.t = 0;
  slot.dur = 0.5;
  slot.fx = s.rx - RJ[8] * RS;
  slot.fy = RJ[9] * RS - s.rAir;
  slot.x = slot.fx;
  slot.y = slot.fy;
  slot.tx = s.x + 40;
  slot.ty = -110;
}

function shotLands(s: State, env: SceneEnv, sh: Shot) {
  sh.on = false;
  const parry = s.look.rev > 0.3 && s.phase === 0;
  const x = parry ? s.x + 78 : s.x + 26;
  spawnBlast(s, x, sh.ty + 10, parry ? 46 : 52, false);
  if (parry) {
    // the saws bat it apart: sparks fan off the chains
    burst(s.parts, 26, x - 20, -110, Math.PI + 0.3, 0.9, 700, 0.4, 2.2, 1, 2, 800);
    s.push = Math.min(40, s.push + 10);
  } else {
    s.push = Math.min(60, s.push + 34);
    s.flinch = 1;
  }
  if (!env.reducedMotion) s.shake = Math.min(1, s.shake + (parry ? 0.35 : 0.5));
  s.flash = Math.max(s.flash, 0.3);
  boom(env.audio(), false);
}

function clashBlast(s: State, env: SceneEnv) {
  s.clash = true;
  const x = lerp(s.from, s.to, 0.58);
  spawnBlast(s, x, -112, 120, true);
  s.rPhase = 2;
  s.rT = 0;
  s.flash = 1;
  if (!env.reducedMotion) {
    s.stop = 0.06;
    s.shake = 1;
  }
  boom(env.audio(), true);
}

function impact(s: State, env: SceneEnv) {
  const u = s.u;
  const hx = s.rx - 18;
  const hy = -160;
  const P = s.power;
  s.cutA = -0.6 + rand(-0.12, 0.12);
  s.slash = 1;
  s.slashX = hx * u;
  s.slashY = s.gy + hy * u;
  s.flash = Math.max(s.flash, 0.5 + P * 0.3);
  s.rPhase = 3;
  s.rT = 0;
  s.rFlinch = 1;
  if (!env.reducedMotion) {
    s.stop = 0.08 + P * 0.05;
    s.shake = Math.max(s.shake, 0.8);
  }
  const dir = s.cutA;
  burst(s.parts, Math.round(28 + P * 36), hx, hy, dir, 0.7, 900, 0.5, 2.4, 1, 2.2, 700);
  burst(s.parts, Math.round(28 + P * 36), hx, hy, dir + Math.PI, 0.7, 700, 0.5, 2.4, 1, 2.2, 700);
  // blood sprays off the cut both ways
  burst(s.parts, Math.round(16 + P * 20), hx, hy, dir, 0.55, 640, 1.1, 2.6, 2, 0.5, 900);
  burst(s.parts, Math.round(10 + P * 12), hx, hy, -Math.PI / 2 - 0.3, 0.9, 480, 1.1, 2.4, 2, 0.5, 900);
  s.rCut = 1;
  // she kicks off her own blast to get clear
  spawnBlast(s, s.rx + 20, -10, 40, false);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.4, gain: 0.35, freq: 2400, q: 0.4, type: 'highpass' });
    tone(bus, 150, { type: 'square', attack: 0.004, decay: 0.25, gain: 0.08, glideTo: 50 });
    boom(bus, false);
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.45,
    init: () => {
      const rain = new Float32Array(RAIN * 3);
      for (let i = 0; i < RAIN; i++) {
        rain[i * 3] = Math.random() * 1.4;
        rain[i * 3 + 1] = Math.random();
        rain[i * 3 + 2] = rand(0.55, 1);
      }
      return {
        look: makeLook(),
        x: 0,
        home: 0,
        phase: 0,
        pt: 0,
        from: 0,
        to: 0,
        power: 0,
        held: false,
        touched: false,
        idle: 0,
        autoT: 0.15,
        speed: 0,
        ghostT: 0,
        ghosts: [0, 0, 0, 0],
        push: 0,
        flinch: 0,
        exhaust: 0,
        clash: false,
        rx: 0,
        rhome: 0,
        rPhase: 0,
        rT: 0,
        throwT: 0.25,
        rAir: 0,
        rSpin: 0,
        rFlinch: 0,
        rHeat: 0,
        rCut: 0,
        blasts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, r: 0, t: 0, dur: 1, big: false, on: false, puffs: new Float32Array(PUFFS * 3) })),
        shots: Array.from({ length: 3 }, () => ({ x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 0.5, on: false })),
        parts: makePool(MAX_PARTS),
        rain,
        splash: new Float32Array(SPLASH * 3),
        splashT: 0,
        wind: -0.4,
        bolt: 0,
        boltT: 3,
        slash: 0,
        slashX: 0,
        slashY: 0,
        cutA: -0.6,
        stop: 0,
        shake: 0,
        flash: 0,
        light: 0,
        lightX: 0,
        lightY: 0,
        hum: null,
        rainHum: null,
        u: 1,
        gy: 0,
        bg: null,
        fire: glowSprite(96, [
          [0, 'rgba(255,255,235,1)'],
          [0.2, 'rgba(255,220,120,0.95)'],
          [0.45, 'rgba(255,130,40,0.7)'],
          [0.75, 'rgba(200,50,10,0.25)'],
          [1, 'rgba(120,20,0,0)'],
        ]),
        smoke: glowSprite(64, [
          [0, 'rgba(40,34,38,0.95)'],
          [0.55, 'rgba(34,30,36,0.6)'],
          [1, 'rgba(30,28,34,0)'],
        ]),
        orange: glowSprite(96, [
          [0, 'rgba(255,200,130,0.9)'],
          [0.3, 'rgba(255,130,50,0.4)'],
          [1, 'rgba(200,60,10,0)'],
        ]),
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(255,240,210,0.55)'],
          [1, 'rgba(255,200,150,0)'],
        ]),
        cool: glowSprite(96, [
          [0, 'rgba(200,225,255,0.8)'],
          [0.35, 'rgba(140,180,240,0.25)'],
          [1, 'rgba(100,140,220,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const first = s.home === 0;
      s.u = Math.min(w / 900, h / 560);
      s.gy = h * 0.86;
      s.home = (w * 0.22) / s.u;
      s.rhome = (w * 0.74) / s.u;
      if (first || s.phase === 0) s.x = s.home;
      if (first || s.rPhase !== 3) s.rx = s.rhome;
      paintNight(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,6,0.65)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const rm = env.reducedMotion;
      stepPool(s.parts, dt);
      s.flash = Math.max(0, s.flash - dt * 3.2);
      s.shake = Math.max(0, s.shake - dt * 2.8);
      s.slash = Math.max(0, s.slash - dt * 2.6);
      s.bolt = Math.max(0, s.bolt - dt * 5);
      // typhoon wind gusting
      s.wind = -0.42 + Math.sin(t * 0.37) * 0.14 + Math.sin(t * 1.9) * 0.05;
      for (let i = 0; i < RAIN; i++) {
        const sp = s.rain[i * 3 + 2];
        s.rain[i * 3 + 1] += dt * 2.4 * sp;
        s.rain[i * 3] += dt * 2.4 * sp * s.wind * 0.6;
        if (s.rain[i * 3 + 1] > 1) {
          s.rain[i * 3 + 1] -= 1;
          s.rain[i * 3] = Math.random() * 1.4;
        }
        if (s.rain[i * 3] < -0.05) s.rain[i * 3] += 1.4;
      }
      s.splashT += dt * 50;
      while (s.splashT > 1) {
        s.splashT -= 1;
        let j = 0;
        for (let i = 0; i < SPLASH; i++) if (s.splash[i * 3 + 2] < s.splash[j * 3 + 2]) j = i;
        s.splash[j * 3] = Math.random();
        s.splash[j * 3 + 1] = Math.random();
        s.splash[j * 3 + 2] = 1;
      }
      for (let i = 0; i < SPLASH; i++) s.splash[i * 3 + 2] = Math.max(0, s.splash[i * 3 + 2] - dt * 4);
      s.boltT -= dt;
      if (s.boltT <= 0) {
        s.bolt = 1;
        s.boltT = rand(5, 9);
      }
      // blasts age; the brightest one lights the scene
      s.light = 0;
      for (const b of s.blasts) {
        if (!b.on) continue;
        b.t += dt;
        if (b.t >= b.dur) {
          b.on = false;
          continue;
        }
        const k = b.t / b.dur;
        const I = Math.pow(1 - k, 2) * (b.big ? 1.3 : 0.8);
        if (I > s.light) {
          s.light = I;
          s.lightX = b.x;
          s.lightY = b.y;
        }
      }
      if (s.stop > 0) {
        s.stop -= dt;
        return;
      }

      // autopilot for the tile and idle viewers
      s.idle = s.held ? 0 : s.idle + dt;
      const auto = !env.interactive || !s.touched || s.idle > 6;
      if (auto && s.phase === 0) {
        s.autoT -= dt;
        if (s.autoT <= 0 && s.autoT > -1.1) s.look.rev = Math.min(1, s.look.rev + dt / 1.1);
        else if (s.autoT <= -1.1) {
          lunge(s, env, false);
          s.autoT = rand(2.2, 3.2);
        }
      }
      if (s.held) {
        s.look.rev = Math.min(1, s.look.rev + dt / 1.1);
        if (rm) env.wake(300);
      } else if (!(auto && s.autoT <= 0)) s.look.rev = Math.max(0, s.look.rev - dt * (s.phase === 0 ? 1.5 : 0.6));
      s.look.chain += dt * (20 + s.look.rev * 520 + (s.phase === 1 ? 300 : 0));
      if (s.hum) setHum(s.hum, 55 + s.look.rev * 120, 0.05 + s.look.rev * 0.1, 600 + s.look.rev * 2600);
      if (s.rainHum) setHum(s.rainHum, 30, 0.035, 1600 + Math.abs(s.wind) * 1200);
      if (!s.held && s.hum && s.look.rev < 0.02) {
        stopHum(s.hum);
        s.hum = null;
      }

      // Denji
      s.pt += dt;
      s.push = damp(s.push, 0, s.phase === 0 ? 2.2 : 8, dt);
      s.flinch = Math.max(0, s.flinch - dt * 3);
      let lean = 0;
      if (s.phase === 0) {
        s.x = s.home - s.push;
      } else if (s.phase === 1) {
        const dur = 0.4 - s.power * 0.06;
        const k = Math.min(1, s.pt / dur);
        const prev = s.x;
        // near linear so he is seen crossing the fireball, not just arriving
        s.x = lerp(s.from, s.to, k * (1.2 - 0.2 * k));
        s.speed = (s.x - prev) / Math.max(dt, 1e-3);
        s.ghostT += dt;
        if (s.ghostT > 0.025) {
          s.ghostT = 0;
          s.ghosts.copyWithin(1, 0);
          s.ghosts[0] = prev;
        }
        if (!s.clash) clashBlast(s, env);
        if (k >= 1) {
          impact(s, env);
          s.phase = 2;
          s.pt = 0;
        }
      } else if (s.phase === 2) {
        s.x += s.speed * dt * 0.12;
        s.speed = damp(s.speed, 0, 9, dt);
        if (s.pt > 0.55) {
          s.phase = 3;
          s.pt = 0;
        }
      } else if (s.phase === 3) {
        if (s.pt > 0.35) {
          s.phase = 4;
          s.pt = 0;
          s.from = s.x;
        }
      } else if (s.phase === 4) {
        const k = Math.min(1, s.pt / 0.6);
        s.x = lerp(s.from, s.home, easeOutCubic(k));
        lean = Math.sin(k * Math.PI);
        if (k >= 1) {
          s.phase = 0;
          s.x = s.home;
        }
      }
      if (s.phase !== 1) for (let i = 0; i < 4; i++) s.ghosts[i] = damp(s.ghosts[i], s.x, 12, dt);
      if (s.phase === 0) blendPose(J, STANCE, REV, easeOutCubic(s.look.rev));
      else if (s.phase === 1) blendPose(J, REV, LUNGE, Math.min(1, s.pt / 0.08));
      else if (s.phase === 2) blendPose(J, LUNGE, SLASH, Math.min(1, s.pt / 0.08));
      else if (s.phase === 3) blendPose(J, SLASH, STANCE, easeOutCubic(Math.min(1, s.pt / 0.35)) * 0.3);
      else {
        blendPose(TMP, SLASH, STANCE, 0.3);
        blendPose(J, TMP, STANCE, Math.min(1, s.pt / 0.4));
        for (let i = 1; i < 14; i += 2) J[i] -= lean * 26;
        J[15] -= lean * 20;
        J[17] -= lean * 16;
        J[19] -= lean * 20;
        J[21] -= lean * 16;
      }
      if (s.flinch > 0) {
        // knocked back by a blast he did not block
        for (let i = 2; i < 14; i += 2) J[i] -= s.flinch * 16;
      }
      if (s.look.rev > 0.05 && s.phase === 0 && !rm) {
        const j = s.look.rev * 1.6;
        for (let i = 2; i < 14; i++) J[i] += (Math.random() - 0.5) * j;
      }
      const drag = (s.phase === 1 ? -2200 : s.phase === 2 ? -s.speed * 0.6 : 0) + s.wind * 300;
      const jaw = s.phase === 1 || s.phase === 2 ? 1 : Math.max(s.flinch, s.look.rev * 0.5);
      stepLook(s.look, dt, drag, 0, s.phase === 1 ? -1.2 : s.phase === 4 ? 0.6 : 0.2 + s.wind * 0.8 + Math.sin(t * 6) * 0.08, jaw);
      // exhaust smoke and sparks off the chains
      if (s.look.rev > 0.08) {
        s.exhaust += dt * (6 + s.look.rev * 30);
        while (s.exhaust > 1) {
          s.exhaust -= 1;
          emit(s.parts, s.x + J[4] - 20, J[5] - 10, rand(-90, -30), rand(-80, -30), rand(0.6, 1.1), rand(6, 11), 3, 1.5, -40);
          for (let a = 0; a < 2; a++) {
            if (Math.random() > s.look.rev * (a ? 0.6 : 0.9)) continue;
            bladeTip(J, a, TIP);
            burst(s.parts, 2, s.x + TIP[0], TIP[1], TIP[2] + 0.5, 0.6, 560 * s.look.rev, 0.3, 2, 1, 1.5, 900);
          }
        }
      }

      // Reze
      s.rT += dt;
      s.rFlinch = Math.max(0, s.rFlinch - dt * 3);
      s.rCut = Math.max(0, s.rCut - dt * 0.6);
      let heat = 0;
      if (s.rPhase === 0) {
        blendPose(RJ, R_READY, R_READY, 0);
        RJ[1] += Math.sin(t * 2.4) * 1.2;
        RJ[3] += Math.sin(t * 2.4) * 1.6;
        RJ[5] += Math.sin(t * 2.4) * 1.8;
        s.rx = damp(s.rx, s.rhome, 6, dt);
        s.rAir = damp(s.rAir, 0, 10, dt);
        heat = 0.2 + Math.sin(t * 5) * 0.1;
        if (s.phase === 0) s.throwT -= dt;
        if (s.throwT <= 0 && s.phase === 0) {
          s.rPhase = 1;
          s.rT = 0;
        }
      } else if (s.rPhase === 1) {
        const k = Math.min(1, s.rT / 0.28);
        blendPose(RJ, R_READY, R_WIND, easeOutCubic(k));
        heat = 0.3 + k * 0.7;
        if (k >= 1) {
          s.rPhase = 2;
          s.rT = 0;
          blendPose(RJ, R_WIND, R_THROW, 1);
          throwShot(s);
          const bus = env.audio();
          if (bus) {
            noise(bus, { duration: 0.25, gain: 0.1, freq: 800, q: 0.7 });
            tone(bus, 320, { type: 'triangle', attack: 0.01, decay: 0.2, gain: 0.04, glideTo: 520 });
          }
        }
      } else if (s.rPhase === 2) {
        const k = Math.min(1, s.rT / 0.4);
        blendPose(RJ, R_THROW, R_READY, easeOutCubic(Math.max(0, k - 0.3) / 0.7));
        heat = 1 - k * 0.7;
        if (k >= 1) {
          s.rPhase = 0;
          s.rT = 0;
          s.throwT = rand(1.1, 1.8);
        }
      } else if (s.rPhase === 3) {
        // blown back, riding her own blast in a backflip, then down on her feet
        const k = Math.min(1, s.rT / 1.05);
        blendPose(RJ, R_BLOWN, R_READY, clamp((k - 0.6) / 0.4, 0, 1));
        s.rx = s.rhome + Math.sin(k * Math.PI) * 70;
        s.rAir = Math.sin(k * Math.PI) * 90;
        s.rSpin = -easeOutCubic(clamp((k - 0.05) / 0.8, 0, 1)) * TAU;
        heat = 0.8 * (1 - k);
        // she rides little blasts off her boots
        if (k < 0.7 && Math.random() < 0.5) {
          const bx = s.rx + rand(-10, 10);
          const by = -s.rAir - 4;
          burst(s.parts, 3, bx, by, Math.PI / 2, 0.8, 260, 0.35, 2.4, 0, 2, 200);
          emit(s.parts, bx, by, rand(-30, 30), rand(10, 50), rand(0.4, 0.8), rand(7, 12), 3, 1.5, -30);
        }
        if (k >= 1) {
          s.rPhase = 0;
          s.rT = 0;
          s.rSpin = 0;
          s.throwT = rand(0.9, 1.5);
        }
      }
      s.rHeat = heat;

      // shots in flight
      for (const sh of s.shots) {
        if (!sh.on) continue;
        sh.t += dt;
        const k = Math.min(1, sh.t / sh.dur);
        sh.tx = s.x + 40;
        sh.x = lerp(sh.fx, sh.tx, k);
        sh.y = lerp(sh.fy, sh.ty, k) - Math.sin(k * Math.PI) * 60;
        if (Math.random() < 0.9) emit(s.parts, sh.x, sh.y, rand(-20, 20), rand(-40, -10), rand(0.3, 0.6), rand(5, 9), 3, 1.5, -30);
        if (k >= 1) shotLands(s, env, sh);
      }
      // under reduced motion only a viewer's own action keeps the loop awake
      if (rm && s.touched && (s.phase !== 0 || s.rPhase !== 0)) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      const gy = s.gy;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 14 * u + (s.phase === 0 ? s.look.rev * 1.2 * u : 0);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1.04, 1.04);
      ctx.translate(-w / 2 + shakeX(amp, t), -h / 2 + shakeY(amp, t));
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      const L = s.light;
      const lx = s.lightX * u;
      const ly = gy + s.lightY * u;

      // lightning somewhere in the clouds
      if (s.bolt > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,170,230,${(s.bolt * 0.18).toFixed(3)})`;
        ctx.fillRect(0, 0, w, gy * 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }

      // lamp pool, blast light on the pool and the wet deck
      ctx.globalCompositeOperation = 'lighter';
      const lampX = w * 0.9 - 40 * u;
      const lampY = gy - 330 * u;
      glow(ctx, s.cool, lampX, lampY, 60 * u, 0.9);
      ctx.save();
      ctx.translate(lampX, gy);
      ctx.scale(1, 0.2);
      glow(ctx, s.cool, 0, 0, 200 * u, 0.5);
      ctx.restore();
      for (const b of s.blasts) {
        if (!b.on) continue;
        const k = b.t / b.dur;
        const I = Math.pow(1 - k, 2) * (b.big ? 1 : 0.7);
        const bx = b.x * u;
        glow(ctx, s.orange, bx, gy + b.y * u, b.r * u * 3.2, I * 0.7);
        ctx.save();
        ctx.translate(bx, gy - 38 * u);
        ctx.scale(2.4, 0.16);
        glow(ctx, s.orange, 0, 0, b.r * u * 2, I);
        ctx.restore();
        ctx.save();
        ctx.translate(bx, gy + 20 * u);
        ctx.scale(0.6, 1.4);
        glow(ctx, s.orange, 0, 0, b.r * u * 1.6, I * 0.8);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // ground splashes
      ctx.strokeStyle = 'rgba(170,190,230,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < SPLASH; i++) {
        const life = s.splash[i * 3 + 2];
        if (life <= 0) continue;
        const x = s.splash[i * 3] * w;
        const y = gy - 12 * u + s.splash[i * 3 + 1] * (h - gy + 12 * u);
        const r = (1 - life) * 7 * u + 1;
        ctx.moveTo(x + r, y);
        ctx.ellipse(x, y, r, r * 0.3, 0, 0, TAU);
      }
      ctx.stroke();

      // smoke from engines and shots behind the fighters
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== 3) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = k * 0.28;
        ctx.fillStyle = '#56505a';
        ctx.beginPath();
        ctx.arc(p.x * u, gy + p.y * u, p.size * u * (1.6 - k * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Reze: cool rim, blast rim, then the figure (mirrored to face Denji)
      const rxp = s.rx * u;
      const rheat = s.rHeat;
      const drawReze = (flat: string | null, ox: number, oy: number) => {
        ctx.save();
        ctx.translate(rxp + ox * u, gy - s.rAir * u + oy * u);
        if (s.rSpin !== 0) {
          ctx.translate(0, -120 * u);
          ctx.rotate(-s.rSpin);
          ctx.translate(0, 120 * u);
        }
        ctx.scale(-u * RS, u * RS);
        reze(ctx, s, flat, t, rheat);
        ctx.restore();
      };
      drawReze('rgba(185,140,255,0.75)', -2, -1.5);
      if (L > 0.02) drawReze(`rgba(255,150,60,${Math.min(1, L).toFixed(3)})`, lx < rxp ? -3 : 3, -1);
      drawReze(null, 0, 0);
      // her fist before a throw
      if (rheat > 0.35) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.fire, rxp - RJ[8] * RS * u, gy - s.rAir * u + RJ[9] * RS * u, 26 * u * rheat, rheat);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // Denji: afterimages, rims, then the figure; he is drawn over the clash fireball when bursting through it
      const fx = s.x * u;
      const heat = s.look.rev * 0.8 + (s.phase === 1 || s.phase === 2 ? 0.6 : 0) + 0.15;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.orange, fx + 30 * u, gy - 120 * u, 150 * u, heat * 0.28);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const paintDenji = () => {
        if (s.phase === 1 || s.phase === 2) {
          const fade = s.phase === 1 ? 1 : Math.max(0, 1 - s.pt * 4);
          for (let i = 3; i >= 0; i--) {
            const gx = s.ghosts[i] * u;
            if (Math.abs(gx - fx) < 8 * u) continue;
            ctx.save();
            ctx.globalAlpha = (0.32 - i * 0.07) * fade;
            ctx.translate(gx, gy);
            ctx.scale(u, u);
            drawDenji(ctx, J, s.look, i % 2 ? '#ff7a2a' : '#ffb36a');
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(fx - 2 * u, gy - 1.5 * u);
        ctx.scale(u, u);
        drawDenji(ctx, J, s.look, 'rgba(150,190,255,0.7)');
        ctx.restore();
        if (L > 0.02) {
          ctx.save();
          ctx.translate(fx + (lx > fx ? 3 : -3) * u, gy - 1 * u);
          ctx.scale(u, u);
          drawDenji(ctx, J, s.look, `rgba(255,150,60,${Math.min(1, L).toFixed(3)})`);
          ctx.restore();
        }
        ctx.save();
        ctx.translate(fx, gy);
        ctx.scale(u, u);
        drawDenji(ctx, J, s.look, null);
        ctx.restore();
      };
      const through = s.phase === 1 || s.phase === 2;
      if (!through) paintDenji();

      // fireballs
      for (const b of s.blasts) if (b.on) drawBlastFire(ctx, s, b);
      if (through) paintDenji();

      // shots in flight
      ctx.globalCompositeOperation = 'lighter';
      for (const sh of s.shots) {
        if (!sh.on) continue;
        const x = sh.x * u;
        const y = gy + sh.y * u;
        glow(ctx, s.fire, x, y, 22 * u, 1);
        glow(ctx, s.white, x, y, 9 * u, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // slash arc
      if (s.slash > 0) {
        const k = s.slash;
        const r = 160 * u * (1.1 - k * 0.1);
        ctx.save();
        ctx.translate(s.slashX, s.slashY);
        ctx.rotate(s.cutA);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,150,50,${(k * 0.8).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.25, r * 0.22, 0, 0, TAU);
        ctx.ellipse(0, r * 0.05, r * 1.2, r * 0.12, 0, TAU, 0, true);
        ctx.fill();
        ctx.fillStyle = `rgba(255,250,230,${k.toFixed(3)})`;
        ctx.fillRect(-r * 1.4, -3 * u * k, r * 2.8, 6 * u * k);
        glow(ctx, s.white, 0, 0, 90 * u * k, k);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // sparks and embers
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of s.parts.items) {
        if (p.life <= 0 || (p.kind !== 0 && p.kind !== 1)) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.strokeStyle = p.kind === 1 ? (k > 0.5 ? '#fff1c8' : '#ff8a2a') : k > 0.5 ? '#ffd79a' : '#ff5a1a';
        ctx.lineWidth = p.size * 0.7 * u;
        ctx.beginPath();
        ctx.moveTo(p.x * u, gy + p.y * u);
        ctx.lineTo((p.x - p.vx * 0.025) * u, gy + (p.y - p.vy * 0.025) * u);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      drawBlood(ctx, s.parts, 2, u, 0, gy);

      // typhoon rain: sheets of spray, the drops, then drops near the fire catch its light
      const slant = s.wind * 0.9;
      ctx.fillStyle = 'rgba(160,175,210,0.05)';
      for (let i = 0; i < 3; i++) {
        const x = ((t * 0.18 * (1 + i * 0.3) + i * 0.37) % 1.4) * w * 1.2 - w * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 120 * u, 0);
        ctx.lineTo(x + 120 * u + slant * h, h);
        ctx.lineTo(x + slant * h, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(180,195,235,0.28)';
      ctx.lineWidth = Math.max(0.6, 0.9 * u);
      ctx.beginPath();
      for (let i = 0; i < RAIN; i++) {
        const x = s.rain[i * 3] * w - w * 0.2;
        const y = s.rain[i * 3 + 1] * h;
        const Ld = 22 * u * s.rain[i * 3 + 2];
        ctx.moveTo(x, y);
        ctx.lineTo(x + slant * Ld, y + Ld);
      }
      ctx.stroke();
      if (L > 0.05) {
        const R2 = (260 * u) ** 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,170,90,${Math.min(0.9, L * 0.8).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.8, 1.2 * u);
        ctx.beginPath();
        for (let i = 0; i < RAIN; i++) {
          const x = s.rain[i * 3] * w - w * 0.2;
          const y = s.rain[i * 3 + 1] * h;
          if ((x - lx) ** 2 + (y - ly) ** 2 > R2) continue;
          const Ld = 22 * u * s.rain[i * 3 + 2];
          ctx.moveTo(x, y);
          ctx.lineTo(x + slant * Ld, y + Ld);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // manga speed lines while dashing
      if (s.phase === 1 || (s.phase === 2 && s.pt < 0.2)) {
        const k = s.phase === 1 ? 1 : Math.max(0, 1 - s.pt * 5);
        ctx.strokeStyle = `rgba(255,240,225,${(0.4 * k).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 1.6 * u);
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
          const y = (((i * 71 + Math.floor(t * 30) * 13) % 97) / 97) * h;
          const x = (((i * 53 + Math.floor(t * 30) * 29) % 89) / 89) * w;
          ctx.moveTo(x, y);
          ctx.lineTo(x - (120 + (i % 5) * 60) * u, y);
        }
        ctx.stroke();
      }
      // warm wash from the fire and the white flash
      if (L > 0.02 || s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,40,${Math.min(0.2, L * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        if (s.flash > 0) {
          ctx.fillStyle = `rgba(255,210,160,${(s.flash * 0.3).toFixed(3)})`;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      stopHum(s.rainHum);
      s.hum = s.rainHum = null;
      freeCanvas(s.bg, s.fire, s.smoke, s.orange, s.white, s.cool);
      s.bg = null;
    },
  });
