import { clamp, createCanvasScene, damp, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { glow, glowSprite, mulberry } from './heroes-kit';
import { inked } from './anime-more-kit';
import type { C } from './anime-more-kit';

/**
 * Sea Railway: the little train gliding over the flooded sea toward evening, Chihiro and
 * No-Face sitting quietly side by side at the window. Move across the scene to turn the
 * hour from golden afternoon to dusk, and stir the water as you go. Tap the sky to send
 * petals on the breeze, tap the sea to set soot sprites hopping across it. Space or Enter
 * sounds the whistle.
 */

type RGB = [number, number, number];

interface Look {
  top: RGB;
  mid: RGB;
  hor: RGB;
  sun: RGB;
  cloud: RGB;
  cloudLit: RGB;
  far: RGB;
  dark: number;
}

const HOURS: Look[] = [
  { top: [74, 140, 214], mid: [150, 198, 236], hor: [246, 230, 190], sun: [255, 246, 214], cloud: [236, 240, 248], cloudLit: [255, 255, 255], far: [118, 150, 170], dark: 0 },
  { top: [58, 70, 140], mid: [236, 140, 120], hor: [255, 206, 128], sun: [255, 214, 140], cloud: [170, 120, 150], cloudLit: [255, 196, 150], far: [120, 90, 120], dark: 0.25 },
  { top: [12, 16, 44], mid: [46, 44, 92], hor: [140, 82, 112], sun: [255, 150, 120], cloud: [60, 50, 90], cloudLit: [190, 110, 130], far: [40, 36, 70], dark: 0.7 },
];

const CREAM = '#efe3c4';
const CREAM_SH = '#c9b893';
const MAROON = '#8c2f27';
const MAROON_SH = '#5e1b16';
const ROOF = '#4a4a52';
const INK = '#21181c';

interface Soot {
  x: number;
  y: number;
  vx: number;
  ph: number;
  hop: number;
  life: number;
  size: number;
}
interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
  size: number;
}
interface Ripple {
  x: number;
  y: number;
  t: number;
  r: number;
}

interface State {
  touched: boolean;
  tod: number;
  todTarget: number;
  dist: number;
  whistle: number;
  soots: Soot[];
  petals: Petal[];
  ripples: Ripple[];
  lastRipple: number;
  lastPX: number;
  lastPY: number;
  t: number;
  // layout
  portrait: boolean;
  horizon: number;
  trackY: number;
  trainX: number;
  trainL: number;
  k: number;
  stars: Float32Array;
  isles: Float32Array;
  sprites: { sun: HTMLCanvasElement; warm: HTMLCanvasElement; soft: HTMLCanvasElement };
}

const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function lookAt(tod: number): Look {
  const x = clamp(tod, 0, 1) * 2;
  const i = Math.min(1, Math.floor(x));
  const k = x - i;
  const a = HOURS[i];
  const b = HOURS[i + 1];
  return {
    top: mixRGB(a.top, b.top, k),
    mid: mixRGB(a.mid, b.mid, k),
    hor: mixRGB(a.hor, b.hor, k),
    sun: mixRGB(a.sun, b.sun, k),
    cloud: mixRGB(a.cloud, b.cloud, k),
    cloudLit: mixRGB(a.cloudLit, b.cloudLit, k),
    far: mixRGB(a.far, b.far, k),
    dark: lerp(a.dark, b.dark, k),
  };
}

/* ---------- sky and sea ---------- */

function drawSky(c: C, s: State, env: SceneEnv, L: Look, t: number) {
  const { w } = env;
  const hz = s.horizon;
  const g = c.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, rgb(L.top));
  g.addColorStop(0.6, rgb(L.mid));
  g.addColorStop(1, rgb(L.hor));
  c.fillStyle = g;
  c.fillRect(0, 0, w, hz + 1);
  // stars come out at dusk
  const night = clamp((s.tod - 0.55) / 0.45, 0, 1);
  if (night > 0) {
    const st = s.stars;
    for (let i = 0; i < st.length; i += 3) {
      c.globalAlpha = night * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + st[i + 2] * 9)));
      c.fillStyle = '#fff6e6';
      c.fillRect(st[i] * w, st[i + 1] * hz * 0.75, 1.3, 1.3);
    }
    c.globalAlpha = 1;
  }
  // the sun lowers toward the horizon
  const sunX = s.portrait ? env.w * 0.7 : env.w * 0.78;
  const sunY = lerp(hz * 0.25, hz * 1.02, clamp(s.tod * 1.15, 0, 1));
  const sr = Math.min(env.w, env.h) * 0.05;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.sprites.sun, sunX, sunY, sr * 7, 0.55 * (1 - night * 0.7));
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  if (sunY < hz + sr) {
    c.fillStyle = rgb(L.sun);
    c.beginPath();
    c.arc(sunX, sunY, sr, 0, TAU);
    c.fill();
  }
  // long soft clouds, lit underneath by the low sun
  const rnd = mulberry(3);
  for (let i = 0; i < 9; i++) {
    const y = hz * (0.12 + rnd() * 0.7);
    const len = env.w * (0.18 + rnd() * 0.3);
    const x = ((rnd() * env.w * 1.6 + t * (4 + i)) % (env.w + len * 2)) - len;
    const th = (6 + rnd() * 16) * s.k;
    const cg = c.createLinearGradient(0, y - th, 0, y + th);
    cg.addColorStop(0, rgb(L.cloud, 0.95));
    cg.addColorStop(1, rgb(L.cloudLit, 0.95));
    c.fillStyle = cg;
    c.beginPath();
    c.ellipse(x, y, len / 2, th, 0, 0, TAU);
    c.ellipse(x - len * 0.2, y - th * 0.6, len * 0.25, th * 0.8, 0, 0, TAU);
    c.ellipse(x + len * 0.18, y - th * 0.4, len * 0.2, th * 0.7, 0, 0, TAU);
    c.fill();
  }
  // distant islands with a lone house
  c.fillStyle = rgb(L.far);
  const is = s.isles;
  for (let i = 0; i < is.length; i += 3) {
    const x = ((is[i] * env.w * 2 - s.dist * 0.04) % (env.w * 2) + env.w * 2) % (env.w * 2) - env.w * 0.4;
    const wd = is[i + 1] * env.w * 0.25;
    const ht = is[i + 2] * 24 * s.k;
    c.beginPath();
    c.ellipse(x, hz, wd, ht, 0, Math.PI, TAU);
    c.fill();
    if (i === 3) {
      c.fillRect(x - 6 * s.k, hz - ht - 8 * s.k, 12 * s.k, 9 * s.k);
      c.beginPath();
      c.moveTo(x - 8 * s.k, hz - ht - 8 * s.k);
      c.lineTo(x, hz - ht - 15 * s.k);
      c.lineTo(x + 8 * s.k, hz - ht - 8 * s.k);
      c.fill();
    }
  }
}

function drawSea(c: C, s: State, env: SceneEnv, L: Look, t: number) {
  const { w, h } = env;
  const hz = s.horizon;
  // the sea mirrors the sky, darker toward the viewer
  const g = c.createLinearGradient(0, hz, 0, h);
  g.addColorStop(0, rgb(mixRGB(L.hor, L.mid, 0.3)));
  g.addColorStop(0.35, rgb(mixRGB(L.mid, L.top, 0.5)));
  g.addColorStop(1, rgb(mixRGB(L.top, [10, 14, 30], 0.35)));
  c.fillStyle = g;
  c.fillRect(0, hz, w, h - hz);
  // sun glitter path
  const sunX = s.portrait ? w * 0.7 : w * 0.78;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const q = i / 46;
    const y = hz + 2 + q * q * (h - hz);
    const spread = (6 + q * 120) * s.k;
    const off = Math.sin(t * 1.6 + i * 2.3) * spread * 0.6;
    c.fillStyle = rgb(L.sun, (0.28 * (1 - q) + 0.05) * (1 - L.dark * 0.6));
    c.fillRect(sunX + off - spread * 0.5, y, spread * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + t))), 1.4 + q * 2.5);
  }
  c.globalCompositeOperation = 'source-over';
  // gentle swell lines
  c.strokeStyle = rgb(L.cloudLit, 0.18);
  c.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const q = (i + ((t * 0.15) % 1)) / 24;
    const y = hz + q * q * (h - hz);
    const x = ((i * 137.5 + t * 8) % (w + 200)) - 100;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (40 + q * 160) * s.k, y);
    c.stroke();
  }
}

/* ---------- train ---------- */

function drawPassengers(c: C, x: number, wy: number, wh: number, t: number) {
  // Chihiro: brown hair in a ponytail, pink and white shirt, sitting very still
  const cx = x;
  c.save();
  c.fillStyle = '#e7a7a4';
  c.beginPath();
  c.ellipse(cx, wy + wh * 0.95, wh * 0.2, wh * 0.3, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#ffffff';
  c.fillRect(cx - wh * 0.18, wy + wh * 0.82, wh * 0.36, wh * 0.06);
  // head and hair
  c.fillStyle = '#ffe0c8';
  c.beginPath();
  c.ellipse(cx + wh * 0.04, wy + wh * 0.52, wh * 0.13, wh * 0.15, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#5a3a26';
  c.beginPath();
  c.ellipse(cx - wh * 0.01, wy + wh * 0.47, wh * 0.15, wh * 0.14, 0, Math.PI * 0.95, Math.PI * 2.15);
  c.fill();
  c.beginPath();
  c.ellipse(cx - wh * 0.13, wy + wh * 0.55, wh * 0.05, wh * 0.14, 0.3, 0, TAU);
  c.fill();
  // purple hair tie, a glint
  c.fillStyle = '#b48cff';
  c.beginPath();
  c.arc(cx - wh * 0.12, wy + wh * 0.43, wh * 0.03, 0, TAU);
  c.fill();
  // No-Face: tall shadow with the white mask
  const nx = x + wh * 0.55;
  const sway = Math.sin(t * 0.6) * wh * 0.01;
  c.fillStyle = '#121014';
  c.beginPath();
  c.moveTo(nx - wh * 0.22, wy + wh * 1.3);
  c.bezierCurveTo(nx - wh * 0.26, wy + wh * 0.6, nx - wh * 0.2, wy + wh * 0.06 + sway, nx, wy + wh * 0.04 + sway);
  c.bezierCurveTo(nx + wh * 0.2, wy + wh * 0.06 + sway, nx + wh * 0.26, wy + wh * 0.6, nx + wh * 0.22, wy + wh * 1.3);
  c.closePath();
  c.fill();
  const mask = (g: C) => g.ellipse(nx + wh * 0.02, wy + wh * 0.3 + sway, wh * 0.11, wh * 0.16, 0, 0, TAU);
  inked(c, mask, '#f4f1ea', null, 0);
  c.fillStyle = '#1a1418';
  for (const ex of [-0.045, 0.075]) {
    c.beginPath();
    c.ellipse(nx + wh * ex, wy + wh * 0.27 + sway, wh * 0.025, wh * 0.014, 0, 0, TAU);
    c.fill();
  }
  c.fillStyle = '#8a5aa8';
  for (const ex of [-0.045, 0.075]) {
    c.beginPath();
    c.moveTo(nx + wh * (ex - 0.02), wy + wh * 0.235 + sway);
    c.lineTo(nx + wh * ex, wy + wh * 0.18 + sway);
    c.lineTo(nx + wh * (ex + 0.02), wy + wh * 0.235 + sway);
    c.fill();
    c.beginPath();
    c.moveTo(nx + wh * (ex - 0.015), wy + wh * 0.3 + sway);
    c.lineTo(nx + wh * ex, wy + wh * 0.36 + sway);
    c.lineTo(nx + wh * (ex + 0.015), wy + wh * 0.3 + sway);
    c.fill();
  }
  c.fillStyle = '#2a2026';
  c.fillRect(nx - wh * 0.005, wy + wh * 0.38 + sway, wh * 0.05, wh * 0.012);
  c.restore();
}

/** The train body in its own frame: left end at x 0, rail at y 0, length 400 units */
function drawTrain(c: C, s: State, L: Look, t: number, reflect: boolean) {
  const lw = reflect ? 0 : 2.4;
  const ink = reflect ? null : INK;
  // pantograph up to the wire
  if (!reflect) {
    c.strokeStyle = '#2b2a30';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(150, -132);
    c.lineTo(175, -158);
    c.lineTo(200, -132);
    c.moveTo(165, -158);
    c.lineTo(190, -158);
    c.stroke();
  }
  // roof
  inked(
    c,
    (g) => {
      g.moveTo(4, -118);
      g.quadraticCurveTo(10, -134, 30, -136);
      g.lineTo(370, -136);
      g.quadraticCurveTo(392, -134, 398, -118);
      g.closePath();
    },
    ROOF,
    ink,
    lw
  );
  // body: cream above, maroon below
  const body = (g: C) => {
    g.moveTo(2, -120);
    g.lineTo(400, -120);
    g.quadraticCurveTo(406, -60, 400, -14);
    g.lineTo(2, -14);
    g.quadraticCurveTo(-4, -60, 2, -120);
    g.closePath();
  };
  inked(c, body, CREAM, ink, lw);
  c.fillStyle = MAROON;
  c.beginPath();
  c.moveTo(-1, -50);
  c.lineTo(403, -50);
  c.quadraticCurveTo(404, -30, 400, -14);
  c.lineTo(2, -14);
  c.quadraticCurveTo(-2, -30, -1, -50);
  c.fill();
  c.fillStyle = MAROON_SH;
  c.fillRect(0, -22, 402, 8);
  c.fillStyle = CREAM_SH;
  c.fillRect(2, -120, 398, 6);
  if (!reflect) {
    c.strokeStyle = INK;
    c.lineWidth = lw;
    c.beginPath();
    body(c);
    c.stroke();
  }
  // the hour's light falls on the paintwork
  if (L.dark > 0.02) {
    c.fillStyle = rgb([24, 22, 60], L.dark * 0.4);
    c.beginPath();
    body(c);
    c.rect(4, -136, 394, 18);
    c.fill();
  }
  // windows, lit warm at dusk; the far windows show the sky straight through
  const winY = -104;
  const winH = 44;
  const lit = clamp((s.tod - 0.35) * 1.6, 0, 1);
  for (let i = 0; i < 7; i++) {
    const x = 26 + i * 52;
    const wW = 38;
    const door = i === 1 || i === 5;
    if (door) {
      inked(c, (g) => g.rect(x - 2, winY - 4, wW + 4, 92), CREAM_SH, ink, lw * 0.8);
    }
    const g = c.createLinearGradient(0, winY, 0, winY + winH);
    g.addColorStop(0, rgb(mixRGB(L.mid, [255, 214, 150], lit)));
    g.addColorStop(1, rgb(mixRGB(L.hor, [255, 190, 120], lit)));
    c.fillStyle = g;
    c.fillRect(x, winY, wW, winH);
    if (!reflect && i === 3) {
      c.save();
      c.beginPath();
      c.rect(x, winY, wW, winH);
      c.clip();
      drawPassengers(c, x + 9, winY, winH, t);
      c.restore();
    }
    if (!reflect && i === 2) {
      // a faint shadow passenger
      c.fillStyle = 'rgba(20,18,30,0.55)';
      c.beginPath();
      c.ellipse(x + 24, winY + winH * 0.5, 7, 9, 0, 0, TAU);
      c.fill();
      c.fillRect(x + 14, winY + winH * 0.62, 20, winH * 0.4);
    }
    if (!reflect && i === 4) {
      // No-Face's spot spills into the next window, Chihiro's side bench
      c.fillStyle = 'rgba(20,18,30,0.35)';
      c.fillRect(x, winY + winH * 0.78, wW, winH * 0.22);
    }
    if (!reflect) {
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.8;
      c.strokeRect(x, winY, wW, winH);
      c.beginPath();
      c.moveTo(x, winY + winH * 0.35);
      c.lineTo(x + wW, winY + winH * 0.35);
      c.stroke();
    }
  }
  // headlight and destination plate at the front (right) end
  c.fillStyle = '#fff5cf';
  c.beginPath();
  c.arc(398, -64, 5, 0, TAU);
  c.fill();
  if (!reflect) {
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.stroke();
  }
  // bogies, barely clear of the water
  c.fillStyle = '#26232a';
  c.fillRect(40, -14, 70, 10);
  c.fillRect(290, -14, 70, 10);
}

/* ---------- critters ---------- */

function drawSoot(c: C, x: number, y: number, r: number, t: number, i: number) {
  // fuzzy black ball with spiky edge and two wide eyes
  c.fillStyle = '#0d0c10';
  c.beginPath();
  const n = 16;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const rr = r * (k % 2 ? 1.25 + Math.sin(t * 20 + k + i) * 0.08 : 0.92);
    if (k === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(x - r * 0.35, y - r * 0.15, r * 0.34, 0, TAU);
  c.arc(x + r * 0.35, y - r * 0.15, r * 0.34, 0, TAU);
  c.fill();
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.1, r * 0.13, 0, TAU);
  c.arc(x + r * 0.4, y - r * 0.1, r * 0.13, 0, TAU);
  c.fill();
}

function addRipple(s: State, x: number, y: number, r: number) {
  s.ripples.push({ x, y, t: 0, r });
  if (s.ripples.length > 40) s.ripples.shift();
}

function tapAt(s: State, env: SceneEnv, x: number, y: number) {
  const bus = s.touched ? env.audio() : null;
  if (y > s.horizon + 6) {
    // soot sprites scatter across the water
    for (let i = 0; i < 5; i++) {
      s.soots.push({ x: x + rand(-20, 20) * s.k, y: y + rand(-6, 6) * s.k, vx: rand(-90, 90) * s.k, ph: rand(0, 1), hop: rand(16, 34) * s.k, life: rand(3, 5), size: rand(8, 12) * s.k * (0.6 + (y - s.horizon) / (env.h - s.horizon)) });
    }
    while (s.soots.length > 40) s.soots.shift();
    addRipple(s, x, y, 40 * s.k);
    if (bus) [880, 1175, 1397].forEach((f, i) => tone(bus, f, { type: 'triangle', decay: 0.12, gain: 0.04, delay: i * 0.06 }));
  } else {
    for (let i = 0; i < 18; i++) {
      s.petals.push({ x, y, vx: rand(20, 120) * s.k, vy: rand(-60, 30) * s.k, rot: rand(0, TAU), spin: rand(-4, 4), life: rand(4, 7), size: rand(3, 6) * s.k });
    }
    while (s.petals.length > 140) s.petals.shift();
    if (bus) [659, 784, 988].forEach((f, i) => tone(bus, f, { type: 'sine', decay: 0.9, gain: 0.05, delay: i * 0.09 }));
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 3,
    init: () => {
      const rnd = mulberry(77);
      const stars = new Float32Array(120 * 3);
      for (let i = 0; i < stars.length; i++) stars[i] = rnd();
      const isles = new Float32Array(6 * 3);
      for (let i = 0; i < isles.length; i += 3) {
        isles[i] = rnd();
        isles[i + 1] = 0.2 + rnd() * 0.6;
        isles[i + 2] = 0.3 + rnd() * 0.7;
      }
      return {
        touched: false,
        tod: 0.48,
        todTarget: 0.48,
        dist: 0,
        whistle: 0,
        soots: [],
        petals: [],
        ripples: [],
        lastRipple: 0,
        lastPX: 0,
        lastPY: 0,
        t: 0,
        portrait: false,
        horizon: 0,
        trackY: 0,
        trainX: 0,
        trainL: 0,
        k: 1,
        stars,
        isles,
        sprites: {
          sun: glowSprite(128, [
            [0, 'rgba(255,240,200,0.9)'],
            [0.2, 'rgba(255,200,140,0.45)'],
            [0.5, 'rgba(255,150,110,0.12)'],
            [1, 'rgba(255,120,90,0)'],
          ]),
          warm: glowSprite(64, [
            [0, 'rgba(255,220,160,0.7)'],
            [1, 'rgba(255,180,120,0)'],
          ]),
          soft: glowSprite(64, [
            [0, 'rgba(255,255,255,0.8)'],
            [1, 'rgba(255,255,255,0)'],
          ]),
        },
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.portrait = h > w * 1.1;
      s.k = Math.min(w, h) / 600;
      if (s.portrait) {
        s.horizon = h * 0.44;
        s.trackY = h * 0.66;
        s.trainL = w * 1.05;
        s.trainX = w * 0.5 - s.trainL * 0.62;
      } else {
        s.horizon = h * 0.5;
        s.trackY = h * 0.72;
        s.trainL = Math.min(w * 0.62, h * 1.25);
        s.trainX = w * 0.44 - s.trainL / 2;
      }
    },
    update: (s, env, dt, t) => {
      s.t = t;
      const p = env.pointer;
      if (s.touched && p.inside && env.interactive) {
        s.todTarget = clamp(p.x / Math.max(1, env.w), 0, 1);
        const moved = Math.hypot(p.x - s.lastPX, p.y - s.lastPY);
        if (p.y > s.horizon && moved > 8 * s.k && t - s.lastRipple > 0.06) {
          addRipple(s, p.x, p.y, 26 * s.k);
          s.lastRipple = t;
        }
        s.lastPX = p.x;
        s.lastPY = p.y;
      } else if (!s.touched && !env.reducedMotion) {
        // drift slowly through the evening on its own
        s.todTarget = 0.45 + Math.sin(t * 0.05) * 0.3;
      }
      s.tod = damp(s.tod, s.todTarget, 2.2, dt);
      s.dist += dt * 160 * s.k;
      s.whistle = Math.max(0, s.whistle - dt * 0.8);

      for (const r of s.ripples) r.t += dt;
      while (s.ripples.length && s.ripples[0].t > 2.4) s.ripples.shift();
      for (const so of s.soots) {
        so.life -= dt;
        so.ph += dt * 1.8;
        so.x += so.vx * dt;
        if (so.ph >= 1) {
          so.ph -= 1;
          addRipple(s, so.x, so.y, 14 * s.k);
        }
      }
      s.soots = s.soots.filter((so) => so.life > 0);
      for (const pe of s.petals) {
        pe.life -= dt;
        pe.vx = damp(pe.vx, 70 * s.k, 0.6, dt);
        pe.vy = damp(pe.vy, 18 * s.k + Math.sin(t * 2 + pe.rot) * 24 * s.k, 1, dt);
        pe.x += pe.vx * dt;
        pe.y += pe.vy * dt;
        pe.rot += pe.spin * dt;
        if (pe.y > s.horizon && pe.life > 0.6 && Math.random() < dt * 0.4) {
          addRipple(s, pe.x, pe.y, 8 * s.k);
          pe.life = 0.6;
        }
      }
      s.petals = s.petals.filter((pe) => pe.life > 0);
      if (env.reducedMotion && s.touched && (s.soots.length || s.petals.length || s.ripples.length)) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx: c, w, h } = env;
      const L = lookAt(s.tod);
      drawSky(c, s, env, L, t);
      drawSea(c, s, env, L, t);

      const tk = s.trainL / 400;
      const bob = Math.sin(t * 3.1) * 0.6 * s.k;
      const ty = s.trackY;

      // poles marching through the water, with the wire overhead
      const spacing = s.trainL * 0.42;
      const off = s.dist % spacing;
      const poleH = 190 * tk;
      c.strokeStyle = rgb(mixRGB(L.top, [20, 16, 24], 0.7));
      c.lineWidth = Math.max(1.5, 4 * tk);
      const tops: number[] = [];
      for (let x = -spacing - off; x < w + spacing; x += spacing) {
        c.beginPath();
        c.moveTo(x, ty + 6 * tk);
        c.lineTo(x, ty - poleH);
        c.moveTo(x - 16 * tk, ty - poleH + 10 * tk);
        c.lineTo(x + 16 * tk, ty - poleH + 10 * tk);
        c.stroke();
        tops.push(x);
      }
      c.lineWidth = Math.max(1, 1.4 * tk);
      c.beginPath();
      for (let i = 0; i < tops.length - 1; i++) {
        const a = tops[i];
        const b = tops[i + 1];
        c.moveTo(a, ty - poleH + 10 * tk);
        c.quadraticCurveTo((a + b) / 2, ty - poleH + 22 * tk, b, ty - poleH + 10 * tk);
      }
      c.stroke();

      // reflection of the train, rippled and dim
      c.save();
      c.beginPath();
      c.rect(0, ty, w, h - ty);
      c.clip();
      for (let i = 0; i < 36; i++) {
        const y0 = ty + i * 4 * tk;
        c.save();
        c.beginPath();
        c.rect(0, y0, w, 4 * tk + 0.5);
        c.clip();
        c.globalAlpha = 0.24 * (1 - i / 36);
        c.translate(s.trainX + Math.sin(t * 2.4 + i * 0.7) * tk * (0.6 + i / 24), ty + 2 * tk);
        c.scale(tk, -tk);
        drawTrain(c, s, L, t, true);
        c.restore();
      }
      c.restore();
      c.globalAlpha = 1;

      // rails just under the surface
      c.strokeStyle = rgb(mixRGB(L.hor, [60, 50, 60], 0.5), 0.6);
      c.lineWidth = Math.max(1, 2 * tk);
      c.beginPath();
      c.moveTo(0, ty + 1);
      c.lineTo(w, ty + 1);
      c.stroke();

      c.save();
      c.translate(s.trainX, ty + bob);
      c.scale(tk, tk);
      c.lineJoin = 'round';
      drawTrain(c, s, L, t, false);
      c.restore();
      if (L.dark > 0.02) {
        // and the windows glowing out over the water
        c.globalCompositeOperation = 'lighter';
        if (L.dark > 0.4) for (let i = 0; i < 7; i++) glow(c, s.sprites.warm, s.trainX + (45 + i * 52) * tk, ty - 82 * tk, 26 * tk, (L.dark - 0.4) * 0.9);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
      // headlight beam at night
      if (L.dark > 0.3) {
        c.globalCompositeOperation = 'lighter';
        glow(c, s.sprites.warm, s.trainX + 400 * tk, ty - 64 * tk, 60 * tk, L.dark);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      // spray and wake where the wheels cut the water
      c.strokeStyle = 'rgba(255,255,255,0.65)';
      c.lineWidth = Math.max(1, 1.5 * tk);
      for (const wx of [75, 325]) {
        const x = s.trainX + wx * tk;
        for (let i = 0; i < 5; i++) {
          const q = (t * 2 + i / 5) % 1;
          c.globalAlpha = 1 - q;
          c.beginPath();
          c.moveTo(x - q * 70 * tk, ty + 2 + q * 6 * tk);
          c.lineTo(x - q * 70 * tk - 14 * tk, ty + 2 + q * 10 * tk);
          c.stroke();
        }
      }
      c.globalAlpha = 1;

      // ripples
      for (const r of s.ripples) {
        const q = r.t / 2.4;
        const R = r.r * (0.3 + q * 2.4);
        c.strokeStyle = rgb(L.cloudLit, 0.55 * (1 - q));
        c.lineWidth = 1.2;
        c.beginPath();
        c.ellipse(r.x, r.y, R, R * 0.22, 0, 0, TAU);
        c.stroke();
        if (q < 0.6) {
          c.beginPath();
          c.ellipse(r.x, r.y, R * 0.55, R * 0.12, 0, 0, TAU);
          c.stroke();
        }
      }

      // soot sprites hopping on the water
      for (let i = 0; i < s.soots.length; i++) {
        const so = s.soots[i];
        const a = clamp(so.life, 0, 1);
        const lift = Math.sin(so.ph * Math.PI) * so.hop;
        c.globalAlpha = a * 0.3;
        c.fillStyle = '#000';
        c.beginPath();
        c.ellipse(so.x, so.y + 2, so.size * (1 - lift / so.hop * 0.4), so.size * 0.25, 0, 0, TAU);
        c.fill();
        c.globalAlpha = a;
        drawSoot(c, so.x, so.y - so.size - lift, so.size, t, i);
      }
      c.globalAlpha = 1;

      // petals
      for (const pe of s.petals) {
        c.globalAlpha = clamp(pe.life, 0, 1);
        c.save();
        c.translate(pe.x, pe.y);
        c.rotate(pe.rot);
        c.fillStyle = '#ffc9d6';
        c.beginPath();
        c.ellipse(0, 0, pe.size, pe.size * 0.55, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#ff9fb8';
        c.beginPath();
        c.ellipse(pe.size * 0.3, 0, pe.size * 0.4, pe.size * 0.25, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      c.globalAlpha = 1;

      // the whistle: a soft white puff from the roof
      if (s.whistle > 0) {
        c.globalAlpha = s.whistle * 0.8;
        const q = 1 - s.whistle;
        glow(c, s.sprites.soft, s.trainX + 380 * tk - q * 60 * tk, ty - 150 * tk - q * 50 * tk, (20 + q * 50) * tk, s.whistle * 0.8);
        c.globalAlpha = 1;
      }

      // warm haze over everything at golden hour
      const haze = c.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, rgb(L.hor, 0));
      haze.addColorStop(0.5, rgb(L.hor, 0.08 * (1 - L.dark)));
      haze.addColorStop(1, rgb([0, 0, 20], 0.2 + L.dark * 0.2));
      c.fillStyle = haze;
      c.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.lastPX = x;
      s.lastPY = y;
      tapAt(s, env, x, y);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (!down || e.repeat) return true;
      s.touched = true;
      s.whistle = 1;
      const bus = env.audio();
      if (bus) {
        tone(bus, 587, { type: 'triangle', attack: 0.05, decay: 0.7, gain: 0.07 });
        tone(bus, 740, { type: 'triangle', attack: 0.05, decay: 0.7, gain: 0.05 });
        noise(bus, { duration: 0.6, freq: 2500, q: 2, gain: 0.04 });
      }
      for (let i = 0; i < 10; i++) {
        s.petals.push({ x: rand(0, env.w * 0.3), y: rand(0, s.horizon), vx: rand(60, 140) * s.k, vy: rand(-20, 20) * s.k, rot: rand(0, TAU), spin: rand(-4, 4), life: rand(4, 7), size: rand(3, 6) * s.k });
      }
      return true;
    },
  });
