import {
  createCanvasScene,
  clamp,
  damp,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  noise,
  rand,
  tone,
  TAU,
} from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Gamma Slam: a hulking green giant in a ruined canyon street, winding up a double fist smash.
 * A cached dusk backdrop (canyon walls, broken towers, a cracked road) behind a giant built
 * from tapered, bulging limb shapes with highlight and separation lines, huge shoulders and a
 * small head. Holding crouches him and lifts both fists overhead while a green rim light and
 * glow build, pebbles float off the ground, the view trembles and a low rumble rises. Letting
 * go slams the fists down: a hit-stop frame, a flash, glowing cracks racing out along the
 * ground, an expanding shockwave ring, bouncing rock chunks, dust and a heavy screen shake.
 * A tap is a small slam, a long hold a big one. Left alone he keeps smashing.
 */

interface Chunk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floor: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  max: number;
}

interface Pebble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floor: number;
  size: number;
  hmax: number;
  phase: number;
  /** 0 resting or floating with the charge, 1 thrown */
  mode: number;
  rot: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

interface Voice {
  bus: AudioBus;
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
}

interface State {
  chunks: Chunk[];
  shapes: Float32Array;
  nextChunk: number;
  pebbles: Pebble[];
  dust: Dust[];
  nextDust: number;
  cracks: Float32Array[];
  held: boolean;
  touched: boolean;
  loud: boolean;
  idle: number;
  charge: number;
  wk: number;
  sk: number;
  slamT: number;
  swing: number;
  power: number;
  impacted: boolean;
  hitStop: number;
  flash: number;
  shake: number;
  crackAge: number;
  crackLife: number;
  crackPower: number;
  ringAge: number;
  autoIn: number;
  autoHold: number;
  autoCharging: boolean;
  voice: Voice | null;
  pose: Float32Array;
  // layout
  s: number;
  cx: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  glow: HTMLCanvasElement;
  dustSprite: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const W0 = 560;
const H0 = 460;
const MAX_CHUNKS = 90;
const MAX_PEBBLES = 46;
const MAX_DUST = 40;
const CRACKS = 18;
const GRAV = 1500;
const HOLD = 0.45;
const RECOVER = 0.9;
const CHARGE_TIME = 1.6;
const SKIN = '#3f822b';
const SKIN_DARK = '#25501a';
const PURPLE = '#4a2466';
const RIM = 'rgba(150,255,110,';

/* pose: pelvisY, shoulderY, shoulder half width, headY, elbow x/y, fist x/y, knee x/y, foot x */
const IDLE = [-100, -190, 60, -221, 86, -138, 80, -92, 40, -50, 46];
const WIND = [-82, -174, 66, -204, 72, -236, 17, -282, 56, -42, 58];
const SLAM = [-64, -128, 66, -148, 66, -84, 22, -6, 64, -34, 60];

function sprite(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jagged crack polylines on the ground plane (units, y squashed), longest first */
function makeCracks() {
  const rnd = mulberry(77);
  const out: Float32Array[] = [];
  for (let i = 0; i < CRACKS; i++) {
    let a = (i / CRACKS) * TAU + (rnd() - 0.5) * 0.3;
    const n = 9 + Math.floor(rnd() * 6);
    const pts = new Float32Array(n * 2);
    let r = 0;
    let x = 0;
    let y = 0;
    for (let j = 0; j < n; j++) {
      pts[j * 2] = x;
      pts[j * 2 + 1] = y * 0.3;
      const step = 14 + rnd() * 16;
      a += (rnd() - 0.5) * 0.7;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      r += step;
    }
    out.push(pts);
  }
  // a few forks splitting off the longer cracks
  for (let i = 0; i < 6; i++) {
    const src = out[Math.floor(rnd() * CRACKS)];
    const k = 3 + Math.floor(rnd() * 3);
    let x = src[k * 2];
    let y = src[k * 2 + 1] / 0.3;
    let a = Math.atan2(y, x) + (rnd() < 0.5 ? -0.7 : 0.7);
    const n = 5 + Math.floor(rnd() * 4);
    const pts = new Float32Array(n * 2);
    for (let j = 0; j < n; j++) {
      pts[j * 2] = x;
      pts[j * 2 + 1] = y * 0.3;
      a += (rnd() - 0.5) * 0.6;
      x += Math.cos(a) * (10 + rnd() * 12);
      y += Math.sin(a) * (10 + rnd() * 12);
    }
    out.push(pts);
  }
  return out;
}

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const bg = s.bg ?? document.createElement('canvas');
  s.bg = bg;
  bg.width = Math.max(1, Math.round(w * dpr));
  bg.height = Math.max(1, Math.round(h * dpr));
  const c = bg.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = s.s;
  const hy = s.gy - 70 * u;
  const rnd = mulberry(13);

  const sky = c.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#040605');
  sky.addColorStop(0.55, '#0c160d');
  sky.addColorStop(0.85, '#1f2c16');
  sky.addColorStop(1, '#46421f');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < Math.round((w * hy) / 3200); i++) {
    c.globalAlpha = 0.15 + rnd() * 0.4;
    c.fillStyle = '#e8ffe0';
    c.fillRect(rnd() * w, rnd() * hy * 0.6, 0.9, 0.9);
  }
  c.globalAlpha = 1;
  // smoke plumes smearing the sky
  for (let i = 0; i < 5; i++) {
    const x = rnd() * w;
    const r = (80 + rnd() * 120) * u;
    const g = c.createRadialGradient(x, hy - r * 0.4, 0, x, hy - r * 0.4, r);
    g.addColorStop(0, 'rgba(40,46,30,0.45)');
    g.addColorStop(1, 'rgba(40,46,30,0)');
    c.fillStyle = g;
    c.fillRect(x - r, hy - r * 1.4, r * 2, r * 2);
  }

  // far mesas
  c.fillStyle = '#141b10';
  c.beginPath();
  c.moveTo(0, hy);
  let x = 0;
  while (x < w) {
    const bw = (40 + rnd() * 90) * u;
    const top = hy - (10 + rnd() * 50) * u;
    c.lineTo(x + bw * 0.15, top);
    c.lineTo(x + bw * 0.85, top + rnd() * 6 * u);
    x += bw;
    c.lineTo(x, hy - rnd() * 8 * u);
  }
  c.lineTo(w, hy);
  c.closePath();
  c.fill();

  // broken towers, some with a fire still burning inside
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = w / 2 + side * (140 + rnd() * 220) * u;
    const bw = (34 + rnd() * 40) * u;
    const top = hy - (60 + rnd() * 130) * u;
    c.fillStyle = '#0d120b';
    c.beginPath();
    c.moveTo(bx, hy + 2);
    c.lineTo(bx, top + rnd() * 20 * u);
    const steps = 4;
    for (let j = 1; j <= steps; j++) c.lineTo(bx + (bw * j) / steps, top + rnd() * 34 * u);
    c.lineTo(bx + bw, hy + 2);
    c.closePath();
    c.fill();
    for (let wy = top + 30 * u; wy < hy - 8 * u; wy += 14 * u) {
      for (let wx = bx + 5 * u; wx < bx + bw - 8 * u; wx += 10 * u) {
        const r = rnd();
        if (r < 0.05) {
          c.fillStyle = 'rgba(255,140,50,0.7)';
          c.fillRect(wx, wy, 5 * u, 7 * u);
          const fg = c.createRadialGradient(wx + 2.5 * u, wy, 0, wx + 2.5 * u, wy, 30 * u);
          fg.addColorStop(0, 'rgba(255,120,40,0.25)');
          fg.addColorStop(1, 'rgba(255,120,40,0)');
          c.fillStyle = fg;
          c.fillRect(wx - 28 * u, wy - 30 * u, 60 * u, 60 * u);
        } else if (r < 0.5) {
          c.fillStyle = '#060805';
          c.fillRect(wx, wy, 5 * u, 7 * u);
        }
      }
    }
  }

  // canyon walls closing in at the sides
  for (const side of [-1, 1]) {
    c.fillStyle = '#090d07';
    c.beginPath();
    const edge = side < 0 ? 0 : w;
    c.moveTo(edge, 0);
    let y = 0;
    let wx = w / 2 + side * Math.max(w * 0.36, 200 * u);
    c.lineTo(wx, 0);
    while (y < s.gy + 10 * u) {
      y += (18 + rnd() * 30) * u;
      wx += side * (rnd() * 26 - 6) * u;
      c.lineTo(wx, y);
    }
    c.lineTo(edge, s.gy + 40 * u);
    c.closePath();
    c.fill();
  }

  // ground: dusty road running into the distance
  const ground = c.createLinearGradient(0, hy, 0, h);
  ground.addColorStop(0, '#2a2c18');
  ground.addColorStop(0.3, '#191b10');
  ground.addColorStop(1, '#080906');
  c.fillStyle = ground;
  c.fillRect(0, hy, w, h - hy);
  const cx = w / 2;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.moveTo(cx - 20 * u, hy);
  c.lineTo(cx + 20 * u, hy);
  c.lineTo(cx + w * 0.9, h);
  c.lineTo(cx - w * 0.9, h);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(210,200,120,0.22)';
  for (let k = 0; k < 7; k++) {
    const a = k / 7;
    const b = (k + 0.5) / 7;
    const ya = hy + (h - hy) * a * a;
    const yb = hy + (h - hy) * b * b;
    const wa = 1 + a * 6 * u;
    const wb = 1 + b * 6 * u;
    c.beginPath();
    c.moveTo(cx - wa / 2, ya);
    c.lineTo(cx + wa / 2, ya);
    c.lineTo(cx + wb / 2, yb);
    c.lineTo(cx - wb / 2, yb);
    c.fill();
  }
  // scattered rubble
  for (let i = 0; i < 60; i++) {
    const rx = rnd() * w;
    const ry = hy + (h - hy) * Math.pow(rnd(), 0.7);
    const rr = (1 + rnd() * 4) * u * (0.4 + (ry - hy) / (h - hy));
    c.fillStyle = rnd() < 0.5 ? '#0e100a' : '#2c2e1c';
    c.fillRect(rx, ry, rr * 1.6, rr);
  }
  const haze = c.createLinearGradient(0, hy - 40 * u, 0, hy + 30 * u);
  haze.addColorStop(0, 'rgba(140,160,80,0)');
  haze.addColorStop(0.5, 'rgba(140,160,80,0.12)');
  haze.addColorStop(1, 'rgba(140,160,80,0)');
  c.fillStyle = haze;
  c.fillRect(0, hy - 40 * u, w, 70 * u);
}

/**
 * A thick limb that bulges at its middle, with a light gradient across it, a highlight
 * along the outer edge and a separation line underneath. flat draws the shape only.
 */
function limb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  bf: number,
  flat: string | null
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.1) return;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const bulge = Math.max(w1, w2) * 1.2 * bf;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
  ctx.quadraticCurveTo(mx + nx * bulge, my + ny * bulge, x2 + nx * w2, y2 + ny * w2);
  ctx.lineTo(x2 - nx * w2, y2 - ny * w2);
  ctx.quadraticCurveTo(mx - nx * bulge, my - ny * bulge, x1 - nx * w1, y1 - ny * w1);
  ctx.closePath();
  ctx.fillStyle = flat ?? SKIN;
  ctx.fill();
  if (flat) return;
  const g = ctx.createLinearGradient(mx + nx * bulge, my + ny * bulge, mx - nx * bulge, my - ny * bulge);
  g.addColorStop(0, 'rgba(200,255,150,0.16)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,20,0,0.3)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(200,255,150,0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1 * 0.75, y1 + ny * w1 * 0.75);
  ctx.quadraticCurveTo(mx + nx * bulge * 0.8, my + ny * bulge * 0.8, x2 + nx * w2 * 0.75, y2 + ny * w2 * 0.75);
  ctx.stroke();
  // muscle split
  ctx.strokeStyle = 'rgba(10,40,5,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(lerp(x1, mx, 0.4) - nx * bulge * 0.2, lerp(y1, my, 0.4) - ny * bulge * 0.2);
  ctx.quadraticCurveTo(mx - nx * bulge * 0.45, my - ny * bulge * 0.45, lerp(mx, x2, 0.5) - nx * w2 * 0.3, lerp(my, y2, 0.5) - ny * w2 * 0.3);
  ctx.stroke();
}

function drawGiant(ctx: CanvasRenderingContext2D, P: Float32Array, flat: string | null, glow: number, t: number) {
  const pel = P[0];
  const sh = P[1];
  const sw = P[2];
  const hd = P[3];
  const skin = flat ?? SKIN;

  // legs and feet
  for (const side of [-1, 1]) {
    limb(ctx, side * 30, pel + 4, side * P[8], P[9], 27, 20, 1.3, flat);
    limb(ctx, side * P[8], P[9], side * P[10], -9, 20, 13, 1.2, flat);
    ctx.fillStyle = flat ?? SKIN_DARK;
    ctx.beginPath();
    ctx.ellipse(side * (P[10] + 7), -6, 21, 8, 0, 0, TAU);
    ctx.fill();
  }
  // torn shorts
  ctx.fillStyle = flat ?? PURPLE;
  ctx.beginPath();
  ctx.moveTo(-44, pel - 24);
  ctx.lineTo(44, pel - 24);
  const hemR = lerp(pel, P[9], 0.5);
  const kx = P[8];
  ctx.lineTo(lerp(44, kx + 22, 0.55), hemR - 4);
  ctx.lineTo(lerp(40, kx + 8, 0.6), hemR + 6);
  ctx.lineTo(lerp(34, kx, 0.55), hemR - 2);
  ctx.lineTo(lerp(28, kx - 10, 0.6), hemR + 8);
  ctx.lineTo(lerp(18, kx - 20, 0.55), hemR);
  ctx.lineTo(0, pel + 14);
  ctx.lineTo(-lerp(18, kx - 20, 0.55), hemR + 2);
  ctx.lineTo(-lerp(28, kx - 10, 0.6), hemR - 6);
  ctx.lineTo(-lerp(34, kx, 0.55), hemR + 7);
  ctx.lineTo(-lerp(40, kx + 8, 0.6), hemR - 3);
  ctx.lineTo(-lerp(44, kx + 22, 0.55), hemR + 4);
  ctx.closePath();
  ctx.fill();
  if (!flat) {
    ctx.strokeStyle = 'rgba(160,110,220,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-40, pel - 20);
    ctx.lineTo(40, pel - 20);
    ctx.stroke();
  }

  // V torso with lat flare
  const waist = pel - 18;
  const chestY = lerp(sh, waist, 0.3);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-sw, sh);
  ctx.lineTo(sw, sh);
  ctx.quadraticCurveTo(sw * 1.12, chestY, 40, waist);
  ctx.lineTo(44, pel - 16);
  ctx.lineTo(-44, pel - 16);
  ctx.lineTo(-40, waist);
  ctx.quadraticCurveTo(-sw * 1.12, chestY, -sw, sh);
  ctx.fill();
  if (!flat) {
    const lg = ctx.createLinearGradient(0, sh, 0, pel);
    lg.addColorStop(0, 'rgba(210,255,160,0.12)');
    lg.addColorStop(1, 'rgba(0,20,0,0.35)');
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,40,5,0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    // pecs
    ctx.moveTo(-sw * 0.85, sh + 10);
    ctx.quadraticCurveTo(-sw * 0.4, chestY + 22, 0, chestY + 8);
    ctx.quadraticCurveTo(sw * 0.4, chestY + 22, sw * 0.85, sh + 10);
    // centre line and abs
    ctx.moveTo(0, sh + 6);
    ctx.lineTo(0, waist);
    const top = chestY + 22;
    for (let i = 0; i < 3; i++) {
      const y = lerp(top, waist - 4, (i + 1) / 3.4);
      ctx.moveTo(-18, y);
      ctx.quadraticCurveTo(-9, y + 3, 0, y);
      ctx.quadraticCurveTo(9, y + 3, 18, y);
    }
    // obliques
    ctx.moveTo(-30, top + 6);
    ctx.quadraticCurveTo(-26, waist - 10, -36, waist);
    ctx.moveTo(30, top + 6);
    ctx.quadraticCurveTo(26, waist - 10, 36, waist);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,255,150,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-sw * 0.8, sh + 6);
    ctx.quadraticCurveTo(-sw * 0.4, chestY + 14, -4, chestY + 2);
    ctx.moveTo(sw * 0.8, sh + 6);
    ctx.quadraticCurveTo(sw * 0.4, chestY + 14, 4, chestY + 2);
    ctx.stroke();
  }

  // traps swallowing the neck
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-sw * 0.85, sh + 4);
  ctx.quadraticCurveTo(-sw * 0.45, hd + 4, -12, hd + 10);
  ctx.lineTo(12, hd + 10);
  ctx.quadraticCurveTo(sw * 0.45, hd + 4, sw * 0.85, sh + 4);
  ctx.closePath();
  ctx.fill();

  // small head, heavy brow, flat-top hair
  ctx.beginPath();
  ctx.ellipse(0, hd, 16, 18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flat ?? '#0c140a';
  ctx.beginPath();
  ctx.moveTo(-17, hd - 3);
  ctx.lineTo(-18, hd - 14);
  ctx.lineTo(-12, hd - 21);
  ctx.lineTo(-6, hd - 18);
  ctx.lineTo(-1, hd - 23);
  ctx.lineTo(5, hd - 19);
  ctx.lineTo(11, hd - 22);
  ctx.lineTo(18, hd - 13);
  ctx.lineTo(17, hd - 3);
  ctx.quadraticCurveTo(0, hd - 14, -17, hd - 3);
  ctx.fill();
  if (!flat) {
    // brow, eyes that flare with the charge, a clenched mouth
    ctx.fillStyle = SKIN_DARK;
    ctx.beginPath();
    ctx.moveTo(-13, hd - 5);
    ctx.lineTo(0, hd - 1);
    ctx.lineTo(13, hd - 5);
    ctx.lineTo(13, hd - 2);
    ctx.lineTo(0, hd + 2);
    ctx.lineTo(-13, hd - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = glow > 0.2 ? `rgba(200,255,170,${clamp(glow, 0, 1).toFixed(3)})` : '#0b1408';
    ctx.fillRect(-10, hd + 1, 6, 2.4);
    ctx.fillRect(4, hd + 1, 6, 2.4);
    ctx.fillStyle = '#0d1a0a';
    ctx.fillRect(-6, hd + 10, 12, 2.2);
    ctx.fillStyle = 'rgba(230,240,210,0.5)';
    ctx.fillRect(-5, hd + 10, 10, 0.9);
  }

  // deltoids, then arms and fists over everything
  const pump = 1 + glow * 0.06 + Math.sin(t * 2.4) * 0.01;
  for (const side of [-1, 1]) {
    const sx = side * sw;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(sx, sh + 8, 27 * pump, 23 * pump, side * 0.4, 0, TAU);
    ctx.fill();
    if (!flat) {
      ctx.strokeStyle = 'rgba(200,255,150,0.3)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(sx, sh + 8, 22 * pump, 18 * pump, side * 0.4, side < 0 ? Math.PI * 1.05 : Math.PI * 1.55, side < 0 ? Math.PI * 1.45 : Math.PI * 1.95);
      ctx.stroke();
    }
    limb(ctx, sx + side * 4, sh + 12, side * P[4], P[5], 23 * pump, 17, 1.45, flat);
    limb(ctx, side * P[4], P[5], side * P[6], P[7], 18, 14, 1.3, flat);
    ctx.fillStyle = flat ?? SKIN_DARK;
    ctx.beginPath();
    ctx.ellipse(side * P[6], P[7], 17, 15, 0, 0, TAU);
    ctx.fill();
    if (!flat) {
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(side * P[6] - side * 2, P[7] - 3, 13, 10, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,40,5,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(side * P[6] + k * 6, P[7] - 9);
        ctx.lineTo(side * P[6] + k * 6, P[7] + 2);
      }
      ctx.stroke();
    }
  }
}

function drawPebbles(ctx: CanvasRenderingContext2D, s: State, front: boolean) {
  const u = s.s;
  const cx = s.cx;
  const gy = s.gy;
  ctx.fillStyle = '#2d2f1f';
  ctx.beginPath();
  for (const p of s.pebbles) {
    if (p.floor > 8 !== front) continue;
    const x = cx + p.x * u;
    const y = gy + p.y * u;
    const r = p.size * u;
    const c = Math.cos(p.rot) * r;
    const sn = Math.sin(p.rot) * r;
    ctx.moveTo(x + c, y + sn);
    ctx.lineTo(x - sn * 0.7, y + c * 0.7);
    ctx.lineTo(x - c, y - sn);
    ctx.lineTo(x + sn * 0.8, y - c * 0.8);
    ctx.closePath();
  }
  ctx.fill();
  if (s.charge > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(140,255,100,${(s.charge * 0.5).toFixed(3)})`;
    for (const p of s.pebbles) {
      if (p.floor > 8 !== front || p.mode !== 0) continue;
      ctx.fillRect(cx + p.x * u - p.size * u * 0.6, gy + p.y * u - p.size * u, p.size * u * 1.2, 1.2 * u);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function addChunk(s: State, x: number, y: number, vx: number, vy: number, size: number, floor: number) {
  const c = s.chunks[s.nextChunk];
  s.nextChunk = (s.nextChunk + 1) % MAX_CHUNKS;
  c.x = x;
  c.y = y;
  c.vx = vx;
  c.vy = vy;
  c.size = size;
  c.floor = floor;
  c.rot = rand(0, TAU);
  c.vr = rand(-9, 9);
  c.max = rand(2.2, 3.4);
  c.life = c.max;
}

function addDust(s: State, x: number, y: number, vx: number, vy: number, r: number, life: number) {
  const d = s.dust[s.nextDust];
  s.nextDust = (s.nextDust + 1) % MAX_DUST;
  d.x = x;
  d.y = y;
  d.vx = vx;
  d.vy = vy;
  d.r = r;
  d.life = life;
  d.max = life;
}

function startRumble(bus: AudioBus): Voice {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime;
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'sine';
  a.frequency.setValueAtTime(34, t0);
  a.frequency.linearRampToValueAtTime(58, t0 + CHARGE_TIME);
  b.frequency.setValueAtTime(40, t0);
  b.frequency.linearRampToValueAtTime(54, t0 + CHARGE_TIME);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 220;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.09, t0 + CHARGE_TIME);
  a.connect(f);
  b.connect(f);
  f.connect(gain).connect(out);
  a.start(t0);
  b.start(t0);
  return { bus, a, b, gain };
}

function stopRumble(v: Voice) {
  const now = v.bus.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0.0001, now, 0.06);
  for (const n of [v.a, v.b]) {
    try {
      n.stop(now + 0.4);
    } catch {
      /* already stopped */
    }
  }
}

function beginCharge(s: State, env: SceneEnv) {
  const bus = env.audio();
  if (bus && !s.voice) s.voice = startRumble(bus);
}

function release(s: State, loud: boolean) {
  if (s.voice) {
    stopRumble(s.voice);
    s.voice = null;
  }
  // a new slam can start once the last one has landed
  if (s.slamT >= 0 && !s.impacted) return;
  s.power = 0.25 + 0.75 * s.charge;
  s.slamT = 0;
  s.swing = 0.08 + 0.05 * s.power;
  s.impacted = false;
  s.loud = loud;
}

function impact(s: State, env: SceneEnv) {
  const p = s.power;
  s.impacted = true;
  s.hitStop = 0.05 + 0.06 * p;
  s.flash = 0.55 + 0.45 * p;
  s.shake = 0.45 + 0.55 * p;
  s.crackAge = 0;
  s.crackLife = 1;
  s.crackPower = p;
  s.ringAge = 0;
  s.charge = 0;
  s.wk = 0;
  const n = Math.round(18 + 50 * p);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rand(-1.25, 1.25);
    const v = rand(260, 820) * (0.5 + p * 0.6);
    addChunk(s, rand(-26, 26), rand(-4, 2), Math.cos(a) * v * 1.2, Math.sin(a) * v, rand(3, 9) * (0.7 + p * 0.5), rand(-14, 40));
  }
  const dn = Math.round(8 + 14 * p);
  for (let i = 0; i < dn; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    addDust(s, side * rand(10, 40), rand(-10, 6), side * rand(80, 260) * (0.6 + p * 0.6), -rand(10, 60), rand(26, 52) * (0.7 + p * 0.5), rand(1.2, 2.2));
  }
  for (const pb of s.pebbles) {
    if (pb.mode !== 0) continue;
    const d = Math.max(20, Math.abs(pb.x));
    const kick = clamp(1.4 - d / 300, 0.2, 1.2) * (0.4 + p);
    pb.mode = 1;
    pb.vx = Math.sign(pb.x || 1) * rand(80, 260) * kick;
    pb.vy = -rand(260, 560) * kick;
  }
  const bus = s.loud ? env.audio() : null;
  if (bus) {
    tone(bus, 52, { type: 'sine', attack: 0.005, decay: 1.2 + p * 0.6, gain: 0.12, glideTo: 26 });
    noise(bus, { duration: 0.8 + 0.6 * p, gain: 0.1, freq: 220, q: 0.6, type: 'lowpass' });
    noise(bus, { duration: 0.25, gain: 0.05, freq: 1600, q: 0.7 });
    tone(bus, 110, { type: 'square', attack: 0.003, decay: 0.25, gain: 0.035, glideTo: 40 });
  }
  s.loud = false;
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.72,
    init: () => {
      const rnd = mulberry(3);
      const shapes = new Float32Array(MAX_CHUNKS * 5);
      for (let i = 0; i < shapes.length; i++) shapes[i] = 0.55 + rnd() * 0.6;
      return {
        chunks: Array.from({ length: MAX_CHUNKS }, () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          floor: 0,
          rot: 0,
          vr: 0,
          size: 1,
          life: 0,
          max: 1,
        })),
        shapes,
        nextChunk: 0,
        pebbles: Array.from({ length: MAX_PEBBLES }, () => {
          const side = rnd() < 0.5 ? -1 : 1;
          const floor = rnd() * 50 - 12;
          return {
            x: side * (40 + rnd() * 230),
            y: floor,
            vx: 0,
            vy: 0,
            floor,
            size: 1.6 + rnd() * 3.4,
            hmax: 20 + rnd() * 90,
            phase: rnd() * TAU,
            mode: 0,
            rot: rnd() * TAU,
          };
        }),
        dust: Array.from({ length: MAX_DUST }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1 })),
        nextDust: 0,
        cracks: makeCracks(),
        held: false,
        touched: false,
        loud: false,
        idle: 0,
        charge: 0,
        wk: 0,
        sk: 0,
        slamT: -1,
        swing: 0.1,
        power: 0,
        impacted: true,
        hitStop: 0,
        flash: 0,
        shake: 0,
        crackAge: 9,
        crackLife: 0,
        crackPower: 0,
        ringAge: 9,
        autoIn: 0.2,
        autoHold: 0,
        autoCharging: false,
        voice: null,
        pose: new Float32Array(IDLE),
        s: 1,
        cx: 0,
        gy: 0,
        bg: null,
        glow: sprite(128, [
          [0, 'rgba(200,255,160,0.9)'],
          [0.25, 'rgba(110,255,70,0.45)'],
          [0.6, 'rgba(60,200,40,0.12)'],
          [1, 'rgba(40,160,30,0)'],
        ]),
        dustSprite: sprite(64, [
          [0, 'rgba(120,122,92,0.7)'],
          [0.5, 'rgba(90,92,68,0.35)'],
          [1, 'rgba(70,72,52,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.s = Math.min(w / W0, h / H0);
      const u = s.s;
      s.cx = w / 2;
      s.gy = Math.min(h * 0.8, h * 0.5 + 190 * u);
      paintBackdrop(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      if (s.hitStop > 0) {
        // the frame hangs on the impact
        s.hitStop -= dt;
        return;
      }
      if (s.held) s.idle = 0;
      else s.idle += dt;
      if (env.reducedMotion && (s.held || s.idle < 2.5)) env.wake(300);

      // demo: wind up and smash every few seconds
      const autop = !env.interactive || !s.touched || s.idle > 5;
      // under reduced motion only the warm-up slam for the still frame plays
      const demo = !env.reducedMotion || (!s.touched && t < 2);
      if (autop && !s.held && demo) {
        if (s.autoCharging) {
          s.autoHold -= dt;
          if (s.autoHold <= 0) {
            s.autoCharging = false;
            s.autoIn = rand(2.2, 3.2);
            release(s, false);
          }
        } else if (s.slamT < 0) {
          s.autoIn -= dt;
          if (s.autoIn <= 0) {
            s.autoCharging = true;
            s.autoHold = s.touched || t > 3 ? rand(0.5, 1.5) : 1.1;
          }
        }
      } else if (s.autoCharging && (!autop || !demo)) {
        s.autoCharging = false;
      }

      const charging = s.held || s.autoCharging;
      if (charging && (s.slamT < 0 || s.impacted)) s.charge = Math.min(1, s.charge + dt / CHARGE_TIME);
      else if (!charging && s.slamT < 0) s.charge = Math.max(0, s.charge - dt * 2);
      s.wk = damp(s.wk, charging ? Math.min(1, 0.2 + s.charge * 2.4) : 0, 8, dt);

      // slam timeline: swing down, impact, hold, stand back up
      let skT = 0;
      if (s.slamT >= 0) {
        s.slamT += dt;
        const q = s.slamT;
        if (q < s.swing) skT = (q / s.swing) * (q / s.swing);
        else {
          if (!s.impacted) impact(s, env);
          if (q < s.swing + HOLD) skT = 1;
          else if (q < s.swing + HOLD + RECOVER) skT = 1 - easeInOutCubic((q - s.swing - HOLD) / RECOVER);
          else s.slamT = -1;
        }
        if (charging && q > s.swing + HOLD * 0.5) skT = Math.min(skT, 1 - s.wk);
      }
      s.sk = s.slamT >= 0 && s.slamT < s.swing ? skT : damp(s.sk, skT, 16, dt);
      for (let i = 0; i < 11; i++) s.pose[i] = lerp(lerp(IDLE[i], WIND[i], s.wk), SLAM[i], s.sk);

      s.flash = Math.max(0, s.flash - dt * 3);
      s.shake = Math.max(0, s.shake - dt * 1.6);
      s.crackAge += dt;
      s.ringAge += dt;
      s.crackLife = Math.max(0, s.crackLife - dt / 7);

      // debris with gravity, bouncing on its own patch of ground
      for (const c of s.chunks) {
        if (c.life <= 0) continue;
        c.life -= dt;
        c.vy += GRAV * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.vr * dt;
        if (c.y > c.floor && c.vy > 0) {
          c.y = c.floor;
          c.vy *= -0.32;
          c.vx *= 0.6;
          c.vr *= 0.6;
          if (Math.abs(c.vy) < 40) c.vy = 0;
        }
      }
      for (const d of s.dust) {
        if (d.life <= 0) continue;
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vx *= 1 - dt * 1.6;
        d.vy *= 1 - dt * 1.2;
        d.r += dt * 26;
      }
      // pebbles float with the charge, fly on the slam, then settle where they land
      for (const p of s.pebbles) {
        if (p.mode === 1) {
          p.vy += GRAV * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vx * 0.02 * dt;
          if (p.y > p.floor && p.vy > 0) {
            p.y = p.floor;
            p.vy *= -0.3;
            p.vx *= 0.5;
            if (Math.abs(p.vy) < 50) {
              p.mode = 0;
              p.x = clamp(p.x, -300, 300);
            }
          }
        } else {
          const lift = s.charge * s.charge * p.hmax * (0.6 + 0.4 * Math.sin(t * 1.3 + p.phase));
          const jitter = s.charge > 0.05 ? Math.sin(t * 40 + p.phase * 7) * s.charge * 1.2 : 0;
          p.y = damp(p.y, p.floor - lift + jitter, 5, dt);
          p.rot += dt * s.charge * 1.5;
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      const glow = Math.max(s.charge, s.flash * 0.8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050705';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      const amp = (s.shake * s.shake * 20 * (0.5 + s.crackPower * 0.6) + s.charge * s.charge * 2.5) * u;
      if (amp > 0.05) ctx.translate(Math.sin(t * 87) * amp, Math.cos(t * 71) * amp * 0.8);
      if (s.bg) ctx.drawImage(s.bg, -4 * u, -4 * u, w + 8 * u, h + 8 * u);

      const cx = s.cx;
      const gy = s.gy;
      // gamma glow building behind him
      ctx.globalCompositeOperation = 'lighter';
      const P = s.pose;
      if (glow > 0.02) {
        ctx.globalAlpha = clamp(glow * 0.9, 0, 1);
        const gr = (170 + glow * 90) * u;
        ctx.drawImage(s.glow, cx - gr, gy + P[1] * u - gr * 0.8, gr * 2, gr * 2);
        ctx.globalAlpha = clamp(glow * 0.5, 0, 1);
        ctx.drawImage(s.glow, cx - gr * 1.4, gy - gr * 0.25, gr * 2.8, gr * 0.5);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // cracks: dark gouges with green light welling up out of them
      const cp = easeOutCubic(clamp(s.crackAge / 0.4, 0, 1)) * (0.4 + 0.6 * s.crackPower);
      if (s.crackLife > 0.01) {
        const count = Math.min(s.cracks.length, 8 + Math.round(s.crackPower * 16));
        ctx.save();
        ctx.translate(cx, gy);
        ctx.scale(u, u);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const heat = clamp(s.crackLife * s.crackLife * 1.2 + s.charge * 0.5, 0, 1);
        for (let pass = 0; pass < 3; pass++) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const pts = s.cracks[i];
            const n = pts.length / 2;
            const reach = cp * (n - 1) * (i < CRACKS ? 1 : 0.8);
            const whole = Math.floor(reach);
            ctx.moveTo(pts[0], pts[1]);
            for (let j = 1; j <= whole && j < n; j++) ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
            if (whole + 1 < n) {
              const f = reach - whole;
              ctx.lineTo(lerp(pts[whole * 2], pts[whole * 2 + 2], f), lerp(pts[whole * 2 + 1], pts[whole * 2 + 3], f));
            }
          }
          if (pass === 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = `rgba(4,6,3,${(0.85 * s.crackLife + 0.1).toFixed(3)})`;
            ctx.lineWidth = 4;
          } else if (pass === 1) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(90,255,60,${(heat * 0.28).toFixed(3)})`;
            ctx.lineWidth = 11;
          } else {
            ctx.strokeStyle = `rgba(210,255,170,${(heat * 0.9).toFixed(3)})`;
            ctx.lineWidth = 1.6;
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(s.crackLife * s.crackLife * 0.8, 0, 1);
        const cr = (120 + 120 * s.crackPower) * u;
        ctx.drawImage(s.glow, cx - cr, gy - cr * 0.3, cr * 2, cr * 0.6);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      // shockwave ring along the ground
      if (s.ringAge < 0.75) {
        const k = s.ringAge / 0.75;
        const r = easeOutCubic(k) * (200 + 300 * s.crackPower) * u;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(190,255,150,${((1 - k) * 0.75).toFixed(3)})`;
        ctx.lineWidth = (2 + 12 * (1 - k)) * u;
        ctx.beginPath();
        ctx.ellipse(cx, gy, r, r * 0.26, 0, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(120,118,90,${((1 - k) * 0.5).toFixed(3)})`;
        ctx.lineWidth = (4 + 16 * (1 - k)) * u;
        ctx.beginPath();
        ctx.ellipse(cx, gy + 2 * u, r * 0.82, r * 0.22, 0, 0, TAU);
        ctx.stroke();
      }

      // pebbles behind his feet line
      drawPebbles(ctx, s, false);

      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(cx, gy + 2 * u, 120 * u, 14 * u, 0, 0, TAU);
      ctx.fill();

      // the giant: two rim passes in gamma green, then the body
      const rimA = clamp(0.3 + glow * 0.65, 0, 1).toFixed(3);
      const off = 2 + glow * 3;
      const breathe = 1 + Math.sin(t * 2) * 0.008 * (1 - s.sk);
      for (let pass = 0; pass < 3; pass++) {
        ctx.save();
        ctx.translate(cx + (pass === 0 ? -off : pass === 1 ? off : 0) * u, gy - (pass < 2 ? 1.5 * u : 0));
        ctx.scale(u, u * breathe);
        drawGiant(ctx, P, pass < 2 ? `${RIM}${rimA})` : null, glow, t);
        ctx.restore();
      }

      // flash bloom where the fists landed
      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(s.flash, 0, 1);
        const fr = (160 + 160 * s.crackPower) * u;
        ctx.drawImage(s.glow, cx - fr, gy - fr, fr * 2, fr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      drawPebbles(ctx, s, true);

      // flying chunks
      ctx.lineJoin = 'round';
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const c = s.chunks[i];
        if (c.life <= 0) continue;
        const a = Math.min(1, c.life / 0.6);
        const x = cx + c.x * u;
        const y = gy + c.y * u;
        const r = c.size * u;
        ctx.globalAlpha = a;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const ang = c.rot + (k / 5) * TAU;
          const rr = r * s.shapes[i * 5 + k];
          if (k === 0) ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
          else ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = '#2b2c1d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,255,110,0.35)';
        ctx.lineWidth = Math.max(0.6, 0.8 * u);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // dust
      for (const d of s.dust) {
        if (d.life <= 0) continue;
        const k = d.life / d.max;
        const r = d.r * u;
        ctx.globalAlpha = k * Math.min(1, (1 - k) * 6) * 0.8;
        ctx.drawImage(s.dustSprite, cx + d.x * u - r, gy + d.y * u - r * 0.7, r * 2, r * 1.4);
      }
      ctx.globalAlpha = 1;

      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(210,255,190,${(s.flash * s.flash * 0.45).toFixed(3)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      if (glow > 0.02) {
        // green tint creeping in from the edges while he charges
        const e = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
        e.addColorStop(0, 'rgba(60,200,40,0)');
        e.addColorStop(1, `rgba(60,200,40,${(glow * 0.12).toFixed(3)})`);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = e;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => letGo(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else letGo(s, env);
      return true;
    },
    dispose: (s) => {
      if (s.voice) stopRumble(s.voice);
      s.voice = null;
      if (s.bg) s.bg.width = s.bg.height = 0;
      s.glow.width = s.glow.height = 0;
      s.dustSprite.width = s.dustSprite.height = 0;
      s.bg = null;
    },
  });

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.touched = true;
  s.idle = 0;
  if (s.autoCharging) {
    s.autoCharging = false;
    s.charge = Math.min(s.charge, 0.2);
  }
  beginCharge(s, env);
  env.wake(600);
}

function letGo(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  release(s, true);
  env.wake(3000);
}
