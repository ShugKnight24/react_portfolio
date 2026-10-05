import { createCanvasScene, clamp, damp, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, layer, mulberry, setHum, startHum, stopHum } from './heroes-kit';
import type { Hum } from './heroes-kit';

/**
 * Miles Morales's leap of faith: head first down a canyon of Brooklyn towers at night, in the
 * comic book look of the film. The far skyline is printed slightly off register (cyan and
 * magenta ghosts), shadows are Ben-Day dots, and Miles himself animates on twos: his pose and
 * position only update twelve times a second while the city streams past at full rate.
 *
 * Moving the pointer (or A and D) steers the fall. A tap, Space or Enter shoots a web at the
 * nearer tower: he swings in, kicks through a window in a burst of glass and a jagged comic
 * impact shape, and drops back into the fall. Left alone he steers and swings by himself.
 */

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  tint: number;
}

interface Burst {
  x: number;
  y: number;
  age: number;
  size: number;
  /** 0 impact, 1 web shot */
  kind: number;
  seed: number;
}

interface Swing {
  side: number;
  t: number;
  ax: number;
  ay: number;
  hit: boolean;
  x0: number;
}

interface State {
  scroll: number;
  speed: number;
  x: number;
  vx: number;
  tx: number;
  lean: number;
  // stepped (on twos) copies of what is drawn for Miles
  stepT: number;
  sx: number;
  sy: number;
  srot: number;
  pose: number;
  swing: Swing | null;
  nextSide: number;
  keys: number;
  shards: Shard[];
  bursts: Burst[];
  broken: Map<number, number>;
  shake: number;
  flash: number;
  idle: number;
  touched: boolean;
  autoT: number;
  // audio
  hum: Hum | null;
  beatT: number;
  beatI: number;
  // layout
  u: number;
  k: number;
  portrait: boolean;
  xl: number;
  xr: number;
  my: number;
  cell: number;
  colW: number;
  sky: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  farH: number;
  mid: HTMLCanvasElement | null;
  midH: number;
  dots: CanvasPattern | null;
  dotTile: HTMLCanvasElement | null;
  miles: HTMLCanvasElement | null;
  milesC: HTMLCanvasElement | null;
  milesM: HTMLCanvasElement | null;
  mSize: number;
}

const INK = '#0c0a12';
const SUIT = '#17151f';
const RED = '#e8222e';
const STEP = 1 / 12;
const FALL = 820;
const SWING_DUR = 0.95;

/* ---------- printed textures ---------- */

function dotTile(size: number, r: number, color: string, dpr: number) {
  const { cv, c } = layer(null, size, size, dpr);
  if (c) {
    c.fillStyle = color;
    for (const [x, y] of [
      [size * 0.25, size * 0.25],
      [size * 0.75, size * 0.75],
    ]) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
  }
  return cv;
}

/** Sky with a printed dot gradient and a moon */
function bakeSky(w: number, h: number, dpr: number, u: number) {
  const { cv, c } = layer(null, w, h, dpr);
  if (!c) return cv;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d0830');
  g.addColorStop(0.55, '#2c1260');
  g.addColorStop(1, '#7a1f6e');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Ben-Day dots that grow toward the bottom
  const step = 9 * u + 3;
  for (let y = 0; y < h; y += step) {
    const k = y / h;
    const r = step * 0.42 * k * k;
    if (r < 0.4) continue;
    c.fillStyle = `rgba(255,70,160,${0.18 + k * 0.2})`;
    for (let x = ((y / step) % 2) * step * 0.5; x < w; x += step) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
  }
  // the moon, off register
  const mx = w * 0.62;
  const my = h * 0.16;
  const mr = Math.min(w, h) * 0.07;
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(0,200,255,0.5)';
  c.beginPath();
  c.arc(mx - 3 * u, my, mr, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,40,120,0.5)';
  c.beginPath();
  c.arc(mx + 3 * u, my + 1, mr, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#fff2c9';
  c.beginPath();
  c.arc(mx, my, mr * 0.96, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(220,190,140,0.6)';
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.arc(mx + Math.cos(i * 2.1) * mr * 0.45, my + Math.sin(i * 1.7) * mr * 0.4, mr * (0.08 + (i % 3) * 0.05), 0, TAU);
    c.fill();
  }
  return cv;
}

/**
 * A vertically tiling strip of towers. Far towers get a misregistered print (cyan and magenta
 * copies to either side); mid towers are crisper with lit windows and a few neon panels.
 */
function bakeTowers(w: number, H: number, dpr: number, u: number, far: boolean, seed: number) {
  const { cv, c } = layer(null, w, H, dpr);
  if (!c) return cv;
  const rnd = mulberry(seed);
  const towers: { x: number; w: number; col: string }[] = [];
  let x = -20 * u;
  while (x < w) {
    const tw = (far ? 40 + rnd() * 60 : 90 + rnd() * 80) * u;
    const gap = (far ? 10 + rnd() * 40 : 110 + rnd() * 160) * u;
    const col = far ? ['#3a2a78', '#33296a', '#45307f'][Math.floor(rnd() * 3)] : ['#241a4a', '#1d1640', '#2b1d52'][Math.floor(rnd() * 3)];
    towers.push({ x, w: tw, col });
    x += tw + gap;
  }
  const paint = (dx: number, tint: string | null) => {
    for (const t of towers) {
      c.fillStyle = tint ?? t.col;
      c.fillRect(t.x + dx, 0, t.w, H);
    }
  };
  if (far) {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.55;
    paint(-4 * u, '#14c8ff');
    paint(4 * u, '#ff2a8a');
    c.globalAlpha = 1;
  }
  paint(0, null);
  // windows
  for (const t of towers) {
    const cw = (far ? 7 : 12) * u;
    const ch = (far ? 11 : 18) * u;
    const cols = Math.max(1, Math.floor((t.w - 8 * u) / (cw * 1.7)));
    const rows = Math.floor(H / (ch * 1.6));
    const x0 = t.x + (t.w - cols * cw * 1.7) / 2 + cw * 0.35;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const lit = rnd();
        if (lit < (far ? 0.7 : 0.68)) continue;
        c.fillStyle = far ? (lit > 0.95 ? 'rgba(127,243,255,0.6)' : 'rgba(255,170,110,0.45)') : lit > 0.95 ? '#7ff3ff' : lit > 0.85 ? '#ffd76a' : '#ffb25a';
        c.fillRect(x0 + k * cw * 1.7, r * ch * 1.6 + ch * 0.3, cw, ch);
      }
    }
    if (!far) {
      // edge light from the street signs and a dot shaded side
      c.fillStyle = 'rgba(255,60,150,0.55)';
      c.fillRect(t.x, 0, 2.5 * u, H);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      const ds = 6 * u + 2;
      for (let y = 0; y < H; y += ds)
        for (let xx = t.x + t.w - 22 * u; xx < t.x + t.w; xx += ds) {
          c.beginPath();
          c.arc(xx + ((y / ds) % 2) * ds * 0.5, y, ds * 0.32, 0, TAU);
          c.fill();
        }
      if (rnd() < 0.7) {
        const ny = rnd() * H;
        const nh = (50 + rnd() * 80) * u;
        c.fillStyle = rnd() < 0.5 ? '#ff2f7a' : '#2ff5ff';
        c.fillRect(t.x + t.w * 0.2, ny, t.w * 0.18, nh);
        c.strokeStyle = INK;
        c.lineWidth = 2 * u;
        c.strokeRect(t.x + t.w * 0.2, ny, t.w * 0.18, nh);
      }
      c.strokeStyle = INK;
      c.lineWidth = 2.5 * u;
      c.beginPath();
      c.moveTo(t.x, 0);
      c.lineTo(t.x, H);
      c.moveTo(t.x + t.w, 0);
      c.lineTo(t.x + t.w, H);
      c.stroke();
    }
  }
  return cv;
}

/* ---------- Miles ---------- */

function limb(c: CanvasRenderingContext2D, p: number[], wd: number, hi: boolean) {
  // two round capped segments, the upper one a touch thicker than the lower
  c.lineCap = 'round';
  for (const pass of [4.4, 0]) {
    c.strokeStyle = pass ? INK : SUIT;
    c.lineWidth = wd * 1.18 + pass;
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.lineTo(p[2], p[3]);
    c.stroke();
    c.lineWidth = wd * 0.92 + pass;
    c.beginPath();
    c.moveTo(p[2], p[3]);
    c.lineTo(p[4], p[5]);
    c.stroke();
  }
  if (hi) {
    c.strokeStyle = 'rgba(110,130,255,0.55)';
    c.lineWidth = wd * 0.2;
    c.beginPath();
    c.moveTo(p[0] - wd * 0.3, p[1]);
    c.lineTo(p[2] - wd * 0.3, p[3]);
    c.lineTo(p[4] - wd * 0.25, p[5]);
    c.stroke();
  }
}

/** Paint Miles upright (head up) into an offscreen canvas; the scene flips and turns it */
function paintMiles(s: State, pose: number, swinging: number) {
  const cv = s.miles;
  if (!cv) return;
  const c = cv.getContext('2d');
  if (!c) return;
  const S = s.mSize;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  const sc = cv.width / S;
  c.setTransform(sc, 0, 0, sc, 0, 0);
  c.translate(S / 2, S / 2);
  const k = S / 300;
  c.scale(k, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const w1 = Math.sin(pose * 1.7) * 4;
  const w2 = Math.sin(pose * 1.3 + 1) * 5;
  // reach: arms forward (up in this frame) while falling, one arm high while swinging
  const sw = swinging;
  // legs trail behind (down in this frame), one knee bent
  limb(c, [-10, 8, -30 + w2 * 0.4, 46, -18 + w2, 90], 17, true);
  limb(c, [10, 8, 34 - w1 * 0.3, 40, 58 + w1 * 0.6, 66 - sw * 10], 17, false);
  // sneakers: white toe, red overlays, black heel
  const shoe = (x: number, y: number, a: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#f4f1ea';
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.beginPath();
    c.ellipse(0, 6, 9, 15, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = RED;
    c.beginPath();
    c.ellipse(0, 1, 8, 8, 0, 0, TAU);
    c.fill();
    c.fillStyle = INK;
    c.fillRect(-8, 13, 16, 5);
    c.restore();
  };
  shoe(-20 + w2, 98, 0.1);
  shoe(58 + w1 * 0.6, 72 - sw * 10, -0.9);
  // torso
  c.fillStyle = SUIT;
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-25, -64);
  c.quadraticCurveTo(-27, -36, -13, -6);
  c.lineTo(-16, 14);
  c.lineTo(16, 14);
  c.lineTo(13, -6);
  c.quadraticCurveTo(27, -36, 25, -64);
  c.quadraticCurveTo(0, -74, -25, -64);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(110,130,255,0.5)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-15, -58);
  c.quadraticCurveTo(-19, -36, -11, 6);
  c.stroke();
  // the spray painted spider, with drips
  c.fillStyle = RED;
  c.strokeStyle = RED;
  c.beginPath();
  c.ellipse(0, -44, 4.5, 6, 0, 0, TAU);
  c.ellipse(0, -32, 5.5, 8, 0, 0, TAU);
  c.fill();
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const yy = -46 + i * 5;
    const sp = 16 - Math.abs(i - 1.5) * 2;
    for (const sd of [-1, 1]) {
      c.moveTo(sd * 3, yy);
      c.lineTo(sd * 10, yy - 6 + i * 2);
      c.lineTo(sd * sp, yy + (i - 1.5) * 6);
    }
  }
  c.stroke();
  c.lineWidth = 1.6;
  c.beginPath();
  for (const [dx, len] of [
    [-2, 9],
    [3, 14],
    [-9, 6],
    [10, 8],
  ]) {
    c.moveTo(dx, -26);
    c.lineTo(dx, -26 + len);
  }
  c.stroke();
  for (const [dx, len] of [
    [-2, 9],
    [3, 14],
    [-9, 6],
    [10, 8],
  ]) {
    c.beginPath();
    c.arc(dx, -26 + len, 1.6, 0, TAU);
    c.fill();
  }
  // arms
  const armL = sw > 0.5 ? [-21, -60, -26, -100, -18, -140] : [-21, -60, -46 + w1, -84, -60 + w1, -118];
  const armR = sw > 0.5 ? [21, -60, 42, -76, 54, -100] : [21, -60, 46 - w2 * 0.5, -86, 58 - w2 * 0.5, -120];
  limb(c, armL, 13, true);
  limb(c, armR, 13, false);
  // gloves: red web lines over the forearms and the hands
  const glove = (p: number[]) => {
    const hx = p[4];
    const hy = p[5];
    c.strokeStyle = RED;
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const f = 0.35 + i * 0.22;
      const x = lerp(p[2], hx, f);
      const y = lerp(p[3], hy, f);
      c.moveTo(x - 6, y + 2);
      c.lineTo(x + 6, y - 2);
    }
    c.moveTo(p[2], p[3]);
    c.lineTo(hx, hy);
    c.stroke();
    c.fillStyle = SUIT;
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(hx, hy, 8, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = RED;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(hx - 5, hy);
    c.lineTo(hx + 5, hy);
    c.moveTo(hx, hy - 5);
    c.lineTo(hx, hy + 5);
    c.stroke();
    // spread fingers
    c.strokeStyle = INK;
    c.lineWidth = 4;
    const ang = Math.atan2(hy - p[3], hx - p[2]);
    c.beginPath();
    for (let f = -2; f <= 2; f++) {
      const a = ang + f * 0.35;
      c.moveTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6);
      c.lineTo(hx + Math.cos(a) * 14, hy + Math.sin(a) * 14);
    }
    c.stroke();
  };
  glove(armL);
  glove(armR);
  // head: black mask, red web lines, big white lenses
  c.fillStyle = SUIT;
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(0, -90, 19, 23, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(232,34,46,0.85)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    c.moveTo(0, -86);
    c.lineTo(Math.cos(a) * 30, -86 + Math.sin(a) * 30);
  }
  for (const r of [8, 15, 23]) {
    c.moveTo(r, -86);
    c.ellipse(0, -86, r, r * 1.1, 0, 0, TAU);
  }
  c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(110,130,255,0.5)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.ellipse(0, -88, 12, 16, 0, Math.PI * 1.05, Math.PI * 1.55);
  c.stroke();
  // lenses: wide, angled, outlined thick
  const lens = (sd: number) => {
    c.fillStyle = '#ffffff';
    c.strokeStyle = INK;
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(sd * 2.5, -92);
    c.quadraticCurveTo(sd * 15, -100, sd * 13.5, -86);
    c.quadraticCurveTo(sd * 8, -80, sd * 2.5, -88);
    c.closePath();
    c.fill();
    c.stroke();
  };
  lens(-1);
  lens(1);
}

function tintCopies(s: State) {
  const src = s.miles;
  if (!src) return;
  for (const [cv, col] of [
    [s.milesC, '#00d2ff'],
    [s.milesM, '#ff2d8a'],
  ] as [HTMLCanvasElement | null, string][]) {
    if (!cv) continue;
    const c = cv.getContext('2d');
    if (!c) continue;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = col;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
  }
  // Ben-Day shading on one side of Miles himself
  const c = src.getContext('2d');
  if (c && s.dots) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = s.dots;
    c.beginPath();
    c.moveTo(src.width * 0.58, 0);
    c.lineTo(src.width, 0);
    c.lineTo(src.width, src.height);
    c.lineTo(src.width * 0.42, src.height);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/* ---------- comic impact shapes (no lettering) ---------- */

function drawBurst(c: CanvasRenderingContext2D, s: State, b: Burst) {
  // pops in on twos, holds, then shrinks away
  const age = Math.floor(b.age / STEP) * STEP;
  const pop = age < 0.08 ? 0.6 : age < 0.17 ? 1.12 : age < 0.5 ? 1 : Math.max(0, 1 - (age - 0.5) / 0.25);
  if (pop <= 0) return;
  const R = b.size * pop;
  const rnd = mulberry(b.seed + Math.floor(age / (STEP * 2)));
  const spikes = b.kind === 0 ? 14 : 9;
  const star = (r0: number, r1: number) => {
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU + b.seed;
      const r = i % 2 ? r0 * (0.85 + rnd() * 0.2) : r1 * (0.8 + rnd() * 0.4);
      const x = b.x + Math.cos(a) * r;
      const y = b.y + Math.sin(a) * r * 0.82;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  c.lineJoin = 'miter';
  if (b.kind === 0) {
    // misregistered shadow, yellow star, red core, white center
    c.save();
    c.translate(5 * s.u, 4 * s.u);
    star(R * 0.55, R);
    c.fillStyle = '#00c8ff';
    c.fill();
    c.restore();
    star(R * 0.55, R);
    c.fillStyle = '#ffe23a';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 4 * s.u;
    c.stroke();
    star(R * 0.32, R * 0.62);
    c.fillStyle = RED;
    c.fill();
    c.lineWidth = 3 * s.u;
    c.stroke();
    c.fillStyle = '#fff7d6';
    c.beginPath();
    c.ellipse(b.x, b.y, R * 0.2, R * 0.16, b.seed, 0, TAU);
    c.fill();
  } else {
    star(R * 0.45, R);
    c.fillStyle = '#ffffff';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3 * s.u;
    c.stroke();
    star(R * 0.25, R * 0.55);
    c.fillStyle = '#7ff3ff';
    c.fill();
  }
}

/* ---------- near towers with breakable glass ---------- */

const paneKey = (side: number, col: number, row: number) => row * 8 + (side > 0 ? 4 : 0) + col;

function drawNear(c: CanvasRenderingContext2D, s: State, env: SceneEnv, side: number, t: number) {
  const { w, h } = env;
  const x0 = side < 0 ? -10 : s.xr;
  const x1 = side < 0 ? s.xl : w + 10;
  // concrete face
  const g = c.createLinearGradient(x0, 0, x1, 0);
  if (side < 0) {
    g.addColorStop(0, '#120c26');
    g.addColorStop(1, '#2d2150');
  } else {
    g.addColorStop(0, '#2d2150');
    g.addColorStop(1, '#120c26');
  }
  c.fillStyle = g;
  c.fillRect(x0, 0, x1 - x0, h);
  // panes in world rows
  const ch = s.cell;
  const cols = Math.max(1, Math.floor((x1 - x0 - 16 * s.u) / s.colW));
  const pw = (x1 - x0 - 16 * s.u) / cols;
  const r0 = Math.floor(s.scroll / ch) - 1;
  const r1 = Math.floor((s.scroll + h) / ch) + 1;
  c.lineJoin = 'miter';
  for (let r = r0; r <= r1; r++) {
    const y = r * ch - s.scroll;
    // floor slab
    c.fillStyle = '#3a2b66';
    c.fillRect(x0, y + ch - 12 * s.u, x1 - x0, 12 * s.u);
    for (let k = 0; k < cols; k++) {
      const px = x0 + 8 * s.u + k * pw + 5 * s.u;
      const py = y + 8 * s.u;
      const ww = pw - 10 * s.u;
      const hh = ch - 28 * s.u;
      const key = paneKey(side, k, r);
      const broke = s.broken.get(key);
      const lit = (Math.sin(r * 12.9898 + k * 78.233 + side * 3) * 43758.5453) % 1;
      if (broke !== undefined) {
        // a dark hole with jagged teeth of glass left in the frame
        c.fillStyle = '#05030c';
        c.fillRect(px, py, ww, hh);
        c.fillStyle = 'rgba(160,240,255,0.85)';
        c.strokeStyle = INK;
        c.lineWidth = 2 * s.u;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + ww * 0.3, py);
        c.lineTo(px + ww * 0.12, py + hh * 0.35);
        c.lineTo(px, py + hh * 0.5);
        c.closePath();
        c.moveTo(px + ww, py + hh);
        c.lineTo(px + ww * 0.6, py + hh);
        c.lineTo(px + ww * 0.85, py + hh * 0.62);
        c.lineTo(px + ww, py + hh * 0.4);
        c.closePath();
        c.fill();
        c.stroke();
      } else {
        const warm = Math.abs(lit) > 0.72;
        c.fillStyle = warm ? '#ffb347' : '#1b3a7a';
        c.fillRect(px, py, ww, hh);
        // reflection streaks
        c.fillStyle = warm ? 'rgba(255,240,180,0.6)' : 'rgba(120,220,255,0.35)';
        c.beginPath();
        c.moveTo(px + ww * 0.15, py + hh);
        c.lineTo(px + ww * 0.45, py);
        c.lineTo(px + ww * 0.6, py);
        c.lineTo(px + ww * 0.3, py + hh);
        c.closePath();
        c.fill();
        c.fillStyle = warm ? 'rgba(255,240,180,0.35)' : 'rgba(255,80,170,0.3)';
        c.beginPath();
        c.moveTo(px + ww * 0.62, py + hh);
        c.lineTo(px + ww * 0.82, py);
        c.lineTo(px + ww * 0.88, py);
        c.lineTo(px + ww * 0.68, py + hh);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = INK;
      c.lineWidth = 3 * s.u;
      c.strokeRect(px, py, ww, hh);
    }
  }
  // dot shading toward the outer side, and a hot rim on the inner corner
  if (s.dots) {
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = s.dots;
    const dw = (x1 - x0) * 0.4;
    if (side < 0) c.fillRect(x0, 0, dw, h);
    else c.fillRect(x1 - dw, 0, dw, h);
    c.restore();
  }
  const edge = side < 0 ? s.xl : s.xr;
  c.fillStyle = side < 0 ? '#ff3ea5' : '#3ee7ff';
  c.fillRect(edge - (side < 0 ? 5 * s.u : 0), 0, 5 * s.u, h);
  c.strokeStyle = INK;
  c.lineWidth = 4 * s.u;
  c.beginPath();
  c.moveTo(edge, 0);
  c.lineTo(edge, h);
  c.stroke();
  void t;
}

/* ---------- audio ---------- */

function beat(bus: AudioBus, i: number) {
  // a laid back boom bap: kick, snare on two and four, hats on the off beats
  const step = i % 16;
  if (step === 0 || step === 7 || step === 10) {
    tone(bus, 130, { type: 'sine', attack: 0.002, decay: 0.28, gain: 0.22, glideTo: 42 });
  }
  if (step === 4 || step === 12) {
    noise(bus, { duration: 0.16, gain: 0.12, freq: 1900, q: 0.9, type: 'bandpass' });
    tone(bus, 210, { type: 'triangle', attack: 0.002, decay: 0.08, gain: 0.05 });
  }
  if (step % 2 === 1) noise(bus, { duration: 0.035, gain: step % 4 === 3 ? 0.05 : 0.03, freq: 8000, q: 0.7, type: 'highpass' });
  if (step === 0 || step === 8) {
    const bar = Math.floor(i / 16) % 4;
    const notes = [55, 55, 49, 61.74];
    tone(bus, notes[bar], { type: 'sawtooth', attack: 0.01, decay: 0.5, gain: 0.05 });
  }
}

/* ---------- actions ---------- */

function shootWeb(s: State, env: SceneEnv, side?: number) {
  if (s.swing) return;
  const sd = side ?? (s.x < (s.xl + s.xr) / 2 ? -1 : 1);
  const edge = sd < 0 ? s.xl : s.xr;
  s.swing = { side: sd, t: 0, ax: edge, ay: s.my - env.h * 0.42, hit: false, x0: s.x };
  s.bursts.push({ x: edge, y: s.my - env.h * 0.42, age: 0, size: 26 * s.u, kind: 1, seed: rand(0, 100) });
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.09, gain: 0.12, freq: 5200, q: 1.4, type: 'bandpass' });
    tone(bus, 1900, { type: 'sine', attack: 0.002, decay: 0.12, gain: 0.05, glideTo: 520 });
  }
}

function shatter(s: State, env: SceneEnv, side: number, y: number) {
  const ch = s.cell;
  const row = Math.floor((s.scroll + y) / ch);
  const x0 = side < 0 ? -10 : s.xr;
  const x1 = side < 0 ? s.xl : env.w + 10;
  const cols = Math.max(1, Math.floor((x1 - x0 - 16 * s.u) / s.colW));
  const col = side < 0 ? cols - 1 : 0;
  s.broken.set(paneKey(side, col, row), 1);
  if (s.broken.size > 60) {
    const first = s.broken.keys().next().value;
    if (first !== undefined) s.broken.delete(first);
  }
  const ex = side < 0 ? s.xl : s.xr;
  for (let i = 0; i < 26; i++) {
    s.shards.push({
      x: ex + rand(-10, 10) * s.u,
      y: y + rand(-30, 30) * s.u,
      vx: -side * rand(120, 520) * s.u,
      vy: rand(-420, 120) * s.u,
      rot: rand(0, TAU),
      vr: rand(-10, 10),
      size: rand(5, 16) * s.u,
      life: rand(0.8, 1.6),
      tint: Math.random(),
    });
  }
  if (s.shards.length > 140) s.shards.splice(0, s.shards.length - 140);
  s.bursts.push({ x: ex - side * 30 * s.u, y, age: 0, size: 78 * s.u, kind: 0, seed: rand(0, 100) });
  s.shake = 1;
  s.flash = 1;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.5, gain: 0.18, freq: 4200, q: 0.6, type: 'highpass' });
    noise(bus, { duration: 0.2, gain: 0.2, freq: 260, q: 0.8, type: 'lowpass' });
    for (let i = 0; i < 7; i++)
      tone(bus, rand(2400, 6200), { type: 'triangle', attack: 0.001, decay: rand(0.05, 0.2), gain: 0.025, delay: i * 0.03 + rand(0, 0.03) });
  }
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  s.portrait = h > w * 1.1;
  const m = Math.min(w, h);
  s.u = clamp(m / 760, 0.5, 1.6);
  s.k = s.portrait ? w / 380 : h / 720;
  s.xl = s.portrait ? w * 0.13 : w * 0.17;
  s.xr = s.portrait ? w * 0.87 : w * 0.83;
  s.my = s.portrait ? h * 0.42 : h * 0.44;
  s.cell = 120 * s.u;
  s.colW = 74 * s.u;
  if (!s.x) s.x = w / 2;
  s.tx = clamp(s.tx || w / 2, s.xl + 60 * s.u, s.xr - 60 * s.u);
  freeCanvas(s.sky, s.far, s.mid, s.dotTile, s.miles, s.milesC, s.milesM);
  s.sky = bakeSky(w, h, dpr, s.u);
  s.farH = Math.round(h * 1.2);
  s.far = bakeTowers(w, s.farH, dpr, s.u * 0.8, true, 11);
  s.midH = Math.round(h * 1.5);
  s.mid = bakeTowers(w, s.midH, dpr, s.u, false, 23);
  s.dotTile = dotTile(8 * s.u + 2, (8 * s.u + 2) * 0.17, 'rgba(10,6,30,0.75)', dpr);
  s.dots = env.ctx.createPattern(s.dotTile, 'repeat');
  if (s.dots) s.dots.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr));
  s.mSize = 300 * s.k * 0.92;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.max(8, Math.round(s.mSize * dpr));
    return cv;
  };
  s.miles = mk();
  s.milesC = mk();
  s.milesM = mk();
  s.pose = -1;
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.4,
    init: () => ({
      scroll: 0,
      speed: FALL,
      x: 0,
      vx: 0,
      tx: 0,
      lean: 0,
      stepT: 0,
      sx: 0,
      sy: 0,
      srot: Math.PI,
      pose: -1,
      swing: null,
      nextSide: 1,
      keys: 0,
      shards: [],
      bursts: [],
      broken: new Map(),
      shake: 0,
      flash: 0,
      idle: 0,
      touched: false,
      autoT: 1.6,
      hum: null,
      beatT: 0,
      beatI: 0,
      u: 1,
      k: 1,
      portrait: false,
      xl: 0,
      xr: 0,
      my: 0,
      cell: 120,
      colW: 74,
      sky: null,
      far: null,
      farH: 1,
      mid: null,
      midH: 1,
      dots: null,
      dotTile: null,
      miles: null,
      milesC: null,
      milesM: null,
      mSize: 200,
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      const { w, h } = env;
      s.idle += dt;
      const auto = !env.interactive || s.idle > (s.touched ? 6 : 1.5);
      if (auto) {
        s.tx = lerp(s.xl + 80 * s.u, s.xr - 80 * s.u, 0.5 + 0.42 * Math.sin(t * 0.55) * Math.cos(t * 0.21));
        s.autoT -= dt;
        if (s.autoT <= 0 && !s.swing) {
          s.autoT = rand(2.4, 3.6);
          s.nextSide = -s.nextSide;
          shootWeb(s, env, s.nextSide);
        }
      }
      if (s.keys) {
        s.tx += ((s.keys & 2 ? 1 : 0) - (s.keys & 1 ? 1 : 0)) * 520 * s.u * dt;
        s.idle = 0;
      }
      s.tx = clamp(s.tx, s.xl + 60 * s.u, s.xr - 60 * s.u);

      let rot = Math.PI;
      const sw = s.swing;
      if (sw) {
        sw.t += dt / SWING_DUR;
        const k = sw.t;
        // swing in toward the tower, kick the glass at the peak, then drop away
        const inK = Math.sin(Math.min(1, k / 0.55) * Math.PI * 0.5);
        const outK = k > 0.55 ? easeOutCubic((k - 0.55) / 0.45) : 0;
        const edge = sw.side < 0 ? s.xl : s.xr;
        const contact = edge - sw.side * 46 * s.u;
        s.x = lerp(lerp(sw.x0, contact, inK), lerp(contact, w / 2 + sw.side * -40 * s.u, 0.6), outK);
        s.speed = lerp(FALL, -160, Math.sin(Math.min(1, k / 0.7) * Math.PI));
        sw.ay -= s.speed * dt;
        if (!sw.hit && k >= 0.55) {
          sw.hit = true;
          shatter(s, env, sw.side, s.my);
        }
        const hang = Math.atan2(sw.ay - s.my, sw.ax - s.x) + Math.PI / 2;
        const blend = k < 0.15 ? k / 0.15 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        rot = lerp(Math.PI, hang < 0 ? hang + TAU : hang, clamp(blend, 0, 1));
        if (k >= 1) {
          s.swing = null;
          s.tx = clamp(s.x, s.xl + 60 * s.u, s.xr - 60 * s.u);
        }
      } else {
        s.speed = damp(s.speed, FALL, 2, dt);
        const ax = (s.tx - s.x) * 9 - s.vx * 5;
        s.vx += ax * dt;
        s.x += s.vx * dt;
        s.lean = damp(s.lean, clamp(s.vx / (900 * s.u), -0.5, 0.5), 8, dt);
        rot = Math.PI - s.lean;
      }
      s.scroll += s.speed * s.u * dt;

      // Miles updates on twos
      s.stepT += dt;
      if (s.stepT >= STEP || s.pose < 0) {
        s.stepT = s.pose < 0 ? 0 : s.stepT % STEP;
        s.sx = s.x;
        s.sy = s.my + Math.sin(t * 2.2) * 6 * s.u;
        s.srot = rot;
        s.pose = Math.floor(t / STEP) * STEP;
        paintMiles(s, s.pose * 3, sw ? 1 : 0);
        tintCopies(s);
      }

      for (const sh of s.shards) {
        sh.life -= dt;
        sh.vy += 900 * s.u * dt;
        sh.x += sh.vx * dt;
        sh.y += (sh.vy - s.speed * s.u) * dt;
        sh.rot += sh.vr * dt;
      }
      s.shards = s.shards.filter((sh) => sh.life > 0 && sh.y > -80 && sh.y < h + 80);
      for (const b of s.bursts) {
        b.age += dt;
        b.y -= s.speed * s.u * dt;
      }
      s.bursts = s.bursts.filter((b) => b.age < 0.8);
      s.shake = Math.max(0, s.shake - dt * 3);
      s.flash = Math.max(0, s.flash - dt * 4);

      const bus = env.audio();
      if (bus) {
        if (!s.hum) s.hum = startHum(bus, { type: 'sine', freq: 60, cutoff: 900, noiseAmt: 1.4 });
        setHum(s.hum, 50 + Math.abs(s.speed) * 0.02, 0.018 + Math.abs(s.speed) / 60000, 500 + Math.abs(s.speed) * 1.2);
        s.beatT -= dt;
        if (s.beatT <= 0) {
          s.beatT += 60 / 88 / 4;
          beat(bus, s.beatI++);
        }
      }
      if (env.reducedMotion && (s.swing || s.keys)) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      ctx.save();
      if (s.shake > 0.02 && !env.reducedMotion) {
        // the camera jolts on twos as well
        const q = Math.floor(t / STEP);
        const a = s.shake * 10 * s.u;
        ctx.translate(Math.sin(q * 12.9) * a, Math.cos(q * 7.3) * a);
      }
      if (s.sky) ctx.drawImage(s.sky, 0, 0, w, h);
      // far and mid towers stream up at their own depths
      const tile = (img: HTMLCanvasElement | null, H: number, par: number) => {
        if (!img) return;
        const off = ((s.scroll * par) % H + H) % H;
        ctx.drawImage(img, 0, -off, w, H);
        ctx.drawImage(img, 0, H - off, w, H);
      };
      ctx.globalAlpha = 0.9;
      tile(s.far, s.farH, 0.1);
      ctx.globalAlpha = 1;
      // haze between the far skyline and the nearer towers
      ctx.fillStyle = 'rgba(60,20,110,0.35)';
      ctx.fillRect(0, 0, w, h);
      tile(s.mid, s.midH, 0.35);
      // the street far below glows through the canyon
      const sg = ctx.createLinearGradient(0, h * 0.62, 0, h);
      sg.addColorStop(0, 'rgba(255,120,60,0)');
      sg.addColorStop(1, 'rgba(255,140,60,0.35)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      // speed lines
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5 * s.u;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const x = s.xl + ((i * 97.13) % 1) * (s.xr - s.xl) + ((i * 53) % (s.xr - s.xl));
        const lx = s.xl + (x % (s.xr - s.xl));
        const len = (80 + (i % 5) * 50) * s.u;
        const y = (((-s.scroll * (1.4 + (i % 3) * 0.3) + i * 211) % (h + len)) + h + len) % (h + len) - len;
        ctx.moveTo(lx, y);
        ctx.lineTo(lx, y + len);
      }
      ctx.stroke();

      drawNear(ctx, s, env, -1, t);
      drawNear(ctx, s, env, 1, t);

      // the web line from his hand to the anchor
      const sw = s.swing;
      if (sw && sw.t < 0.7) {
        const q = s.mSize / 300;
        const lx = -18 * q;
        const ly = -140 * q;
        const cr = Math.cos(s.srot);
        const sr = Math.sin(s.srot);
        const handX = s.sx + lx * cr - ly * sr;
        const handY = s.sy + lx * sr + ly * cr;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5 * s.u;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(sw.ax, sw.ay);
        ctx.stroke();
        ctx.strokeStyle = '#f4f8ff';
        ctx.lineWidth = 2.5 * s.u;
        ctx.stroke();
      }

      // Miles: cyan and magenta ghosts off register, then the print itself
      const S = s.mSize;
      const drawM = (img: HTMLCanvasElement | null, dx: number, dy: number, a: number) => {
        if (!img) return;
        ctx.save();
        ctx.translate(s.sx + dx, s.sy + dy);
        ctx.rotate(s.srot);
        ctx.globalAlpha = a;
        ctx.drawImage(img, -S / 2, -S / 2, S, S);
        ctx.restore();
      };
      const off = (3 + Math.min(4, Math.abs(s.vx) / (200 * s.u))) * s.u;
      drawM(s.milesC, -off, 0, 0.75);
      drawM(s.milesM, off, off * 0.4, 0.75);
      drawM(s.miles, 0, 0, 1);
      ctx.globalAlpha = 1;

      // glass
      for (const sh of s.shards) {
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.rot);
        ctx.globalAlpha = clamp(sh.life * 1.5, 0, 1);
        ctx.fillStyle = sh.tint > 0.7 ? '#ffb347' : sh.tint > 0.35 ? '#a8f0ff' : '#ff8ad0';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6 * s.u;
        ctx.beginPath();
        ctx.moveTo(0, -sh.size);
        ctx.lineTo(sh.size * 0.7, sh.size * 0.5);
        ctx.lineTo(-sh.size * 0.5, sh.size * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (const b of s.bursts) drawBurst(ctx, s, b);
      ctx.restore();

      // a print wash over everything: faint dots and a flash on impact
      if (s.dots) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = s.dots;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      if (s.flash > 0.02) {
        ctx.fillStyle = `rgba(255,240,120,${(s.flash * 0.25).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(8,4,24,0)');
      vg.addColorStop(1, 'rgba(8,4,24,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x) => {
      s.touched = true;
      s.idle = 0;
      s.tx = x;
      shootWeb(s, env, x < env.w / 2 ? -1 : 1);
    },
    onPointerMove: (s, env, x) => {
      if (!env.pointer.inside && !env.pointer.down) return;
      s.touched = true;
      s.idle = 0;
      s.tx = x;
    },
    onPointerLeave: (s) => {
      s.idle = Math.max(s.idle, 4);
    },
    onKey: (s, env, e, down) => {
      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'd') {
        const bit = key === 'a' ? 1 : 2;
        s.keys = down ? s.keys | bit : s.keys & ~bit;
        s.touched = true;
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) {
        s.touched = true;
        s.idle = 0;
        shootWeb(s, env);
      }
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.sky, s.far, s.mid, s.dotTile, s.miles, s.milesC, s.milesM);
      s.sky = s.far = s.mid = s.dotTile = s.miles = s.milesC = s.milesM = null;
    },
  });

