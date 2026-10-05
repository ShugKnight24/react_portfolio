import type { SceneEnv } from './runtime';
import { clamp, createCanvasScene, damp, rand, TAU, tone } from './runtime';
import type { MountScene } from './types';

/**
 * Pipe Hop: a little plumber running through a sunset platform world.
 * Parallax hills and clouds over a brick ground, green pipes of varying heights and floating
 * golden blocks scrolling past, a running leg cycle with squash and stretch, a variable height
 * jump (hold for higher), dust puffs on landing, and spinning coin bursts with a two note chime
 * when a block is bonked from below or a coin is grabbed. Running into a pipe just bumps him up
 * and over with a flash. Left alone, an autopilot times every jump.
 */

interface Pipe {
  on: boolean;
  x: number; // world units, left edge of the body
  h: number;
}

interface Block {
  on: boolean;
  x: number; // left edge
  y: number; // bottom height above ground
  used: boolean;
  bump: number;
}

interface Coin {
  on: boolean;
  x: number;
  y: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  kind: number; // 0 dust, 1 spinning coin, 2 sparkle
  spin: number;
}

interface Cloud {
  x: number;
  y: number;
  k: number;
}

interface State {
  pipes: Pipe[];
  blocks: Block[];
  coins: Coin[];
  parts: Particle[];
  nextPart: number;
  clouds: Cloud[];
  built: boolean;
  spawnX: number;
  dist: number;
  px: number;
  // player
  py: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  buffer: number;
  held: boolean;
  autoHold: number;
  jumpT: number;
  run: number;
  sqx: number;
  sqy: number;
  hurt: number;
  invuln: number;
  knock: number;
  slow: number;
  shake: number;
  idle: number;
  auto: boolean;
  lastBlock: number;
  // layout
  s: number;
  viewW: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  near: HTMLCanvasElement | null;
  ground: HTMLCanvasElement | null;
  cloud: HTMLCanvasElement;
  block: HTMLCanvasElement;
  usedBlock: HTMLCanvasElement;
  coin: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  pipeBody: CanvasGradient | null;
  pipeLip: CanvasGradient | null;
}

const W0 = 640;
const H0 = 400;
const SPEED = 200;
const G = 2300;
const V0 = 700;
const HOLD_G = 0.36;
const HOLD_MAX = 0.26;
const PW = 56; // pipe body width
const LIP = 5; // lip overhang each side
const LIP_H = 16;
const BS = 30; // block size
const BLOCK_Y = 128;
const PH = 40; // player height
const HW = 11; // player half width
const COIN_R = 9;
const MAX_PARTS = 200;
const IDLE = 4;
const POSTER = 2.6;
const TILE = 800; // hill tile width in units

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

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Golden block (or a spent brown one) with rivets and a dot pattern, 64px square */
function blockSprite(used: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return c;
  g.beginPath();
  roundRect(g, 1, 1, 62, 62, 7);
  g.fillStyle = '#2a1508';
  g.fill();
  const face = g.createLinearGradient(0, 0, 0, 64);
  if (used) {
    face.addColorStop(0, '#a0643a');
    face.addColorStop(1, '#6b3a1c');
  } else {
    face.addColorStop(0, '#ffe27a');
    face.addColorStop(0.5, '#ffbf2e');
    face.addColorStop(1, '#d97e12');
  }
  g.beginPath();
  roundRect(g, 4, 4, 56, 56, 5);
  g.fillStyle = face;
  g.fill();
  // bevel highlight and shade
  g.fillStyle = used ? 'rgba(255,220,180,0.25)' : 'rgba(255,255,230,0.7)';
  g.fillRect(6, 6, 52, 3);
  g.fillRect(6, 6, 3, 50);
  g.fillStyle = 'rgba(80,30,0,0.35)';
  g.fillRect(6, 55, 52, 3);
  g.fillRect(55, 8, 3, 50);
  // rivets
  g.fillStyle = used ? '#4a2410' : '#8a4a0a';
  for (const [x, y] of [
    [12, 12],
    [52, 12],
    [12, 52],
    [52, 52],
  ]) {
    g.beginPath();
    g.arc(x, y, 2.6, 0, TAU);
    g.fill();
  }
  if (!used) {
    // a diamond of dots in the middle
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if (Math.abs(i) + Math.abs(j) > 2) continue;
        const x = 32 + i * 7;
        const y = 32 + j * 7;
        g.fillStyle = '#8a4a0a';
        g.beginPath();
        g.arc(x + 0.8, y + 0.8, 2.4, 0, TAU);
        g.fill();
        g.fillStyle = '#fff4c2';
        g.beginPath();
        g.arc(x, y, 2.1, 0, TAU);
        g.fill();
      }
    }
  }
  return c;
}

function coinSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  if (!g) return c;
  g.beginPath();
  g.ellipse(24, 24, 22, 22, 0, 0, TAU);
  g.fillStyle = '#7a4300';
  g.fill();
  const face = g.createLinearGradient(0, 4, 0, 44);
  face.addColorStop(0, '#fff3a6');
  face.addColorStop(0.5, '#ffc93a');
  face.addColorStop(1, '#e08a0c');
  g.beginPath();
  g.ellipse(24, 24, 19, 19, 0, 0, TAU);
  g.fillStyle = face;
  g.fill();
  g.fillStyle = '#b86a06';
  g.fillRect(20, 12, 8, 24);
  g.fillStyle = '#fff6c8';
  g.fillRect(21, 13, 3, 20);
  return c;
}

function cloudSprite() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 80;
  const g = c.getContext('2d');
  if (!g) return c;
  const puffs: [number, number, number][] = [
    [40, 52, 22],
    [66, 38, 28],
    [98, 42, 26],
    [122, 54, 18],
  ];
  g.fillStyle = 'rgba(120,70,120,0.55)';
  g.beginPath();
  for (const [x, y, r] of puffs) {
    g.moveTo(x + r, y + 5);
    g.arc(x, y + 5, r, 0, TAU);
  }
  g.rect(22, 50, 116, 22);
  g.fill();
  g.fillStyle = '#ffd9c4';
  g.beginPath();
  for (const [x, y, r] of puffs) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.rect(22, 48, 116, 18);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.arc(64, 32, 16, Math.PI * 1.1, Math.PI * 1.8);
  g.arc(96, 36, 14, Math.PI * 1.1, Math.PI * 1.8);
  g.fill();
  return c;
}

function canvasFor(c: HTMLCanvasElement | null, w: number, h: number, dpr: number) {
  const out = c ?? document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * dpr));
  out.height = Math.max(1, Math.round(h * dpr));
  const g = out.getContext('2d');
  if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { out, g };
}

/** A seamless strip of rolling hills, TILE units wide, bottom at the canvas bottom */
function paintHills(
  prev: HTMLCanvasElement | null,
  u: number,
  dpr: number,
  height: number,
  seed: number,
  body: string,
  rim: string,
  dots: string
) {
  const W = TILE * u;
  const H = height * u;
  const { out, g } = canvasFor(prev, W, H, dpr);
  if (!g) return out;
  const rnd = mulberry(seed);
  const hills: [number, number, number][] = [];
  let x = 0;
  while (x < TILE) {
    const r = 70 + rnd() * 90;
    hills.push([x + r * 0.5, r, 0.5 + rnd() * 0.5]);
    x += r * (0.9 + rnd() * 0.6);
  }
  for (const pass of [0, 1]) {
    g.beginPath();
    for (const [hx, r, k] of hills) {
      for (const off of [-TILE, 0, TILE]) {
        const cx = (hx + off) * u;
        const top = H - r * k * u * 1.4;
        g.moveTo(cx - r * u, H + 2);
        g.bezierCurveTo(cx - r * u, top, cx + r * u, top, cx + r * u, H + 2);
        g.closePath();
      }
    }
    if (pass === 0) {
      g.strokeStyle = rim;
      g.lineWidth = 3 * u;
      g.stroke();
    } else {
      g.fillStyle = body;
      g.fill();
    }
  }
  // speckles
  g.fillStyle = dots;
  for (let i = 0; i < 40; i++) {
    const dx = rnd() * TILE * u;
    const dy = H - rnd() * H * 0.5;
    g.fillRect(dx, dy, 3 * u, 3 * u);
  }
  return out;
}

function paintScene(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const u = s.s;
  const gy = s.gy;
  const bgc = canvasFor(s.bg, w, h, dpr);
  s.bg = bgc.out;
  const c = bgc.g;
  if (c) {
    const sky = c.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, '#120f33');
    sky.addColorStop(0.45, '#3a2c78');
    sky.addColorStop(0.8, '#c8577a');
    sky.addColorStop(1, '#ffae6b');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, gy + 2);
    const rnd = mulberry(5);
    for (let i = 0; i < Math.round((w * gy) / 5000); i++) {
      c.globalAlpha = (0.2 + rnd() * 0.6) * (1 - i / 300);
      c.fillStyle = '#ffffff';
      c.fillRect(rnd() * w, rnd() * gy * 0.45, 1.2, 1.2);
    }
    c.globalAlpha = 1;
    // low sun behind the hills
    const sx = w * 0.7;
    const sy = gy - 110 * u;
    const sr = 60 * u;
    const halo = c.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 5);
    halo.addColorStop(0, 'rgba(255,190,120,0.55)');
    halo.addColorStop(0.35, 'rgba(255,120,110,0.18)');
    halo.addColorStop(1, 'rgba(255,90,120,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, w, gy);
    const disc = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    disc.addColorStop(0, '#fff2c0');
    disc.addColorStop(1, '#ff9a5c');
    c.fillStyle = disc;
    c.beginPath();
    c.arc(sx, sy, sr, 0, TAU);
    c.fill();
    // sun stripes
    c.fillStyle = 'rgba(200,87,122,0.8)';
    for (let i = 0; i < 4; i++)
      c.fillRect(sx - sr, sy + sr * (0.2 + i * 0.2), sr * 2, sr * (0.04 + i * 0.02));
  }
  s.far = paintHills(
    s.far,
    u,
    dpr,
    190,
    21,
    '#4a3a8c',
    'rgba(255,170,150,0.55)',
    'rgba(255,255,255,0.05)'
  );
  s.near = paintHills(
    s.near,
    u,
    dpr,
    120,
    42,
    '#1c6b52',
    'rgba(140,255,170,0.7)',
    'rgba(10,50,40,0.5)'
  );

  // brick ground strip, one brick period wider than the view
  const gh = h - gy;
  const gw = w + 64 * u;
  const gc = canvasFor(s.ground, gw, gh + 2, dpr);
  s.ground = gc.out;
  const g = gc.g;
  if (g) {
    const base = g.createLinearGradient(0, 0, 0, gh);
    base.addColorStop(0, '#c0602f');
    base.addColorStop(1, '#6b2d17');
    g.fillStyle = base;
    g.fillRect(0, 0, gw, gh + 2);
    const bw = 32 * u;
    const bh = 16 * u;
    g.fillStyle = 'rgba(40,10,5,0.55)';
    for (let row = 0; row * bh < gh + bh; row++) {
      const y = row * bh;
      g.fillRect(0, y, gw, Math.max(1, 2 * u));
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < gw; x += bw) g.fillRect(x, y, Math.max(1, 2 * u), bh);
    }
    g.fillStyle = 'rgba(255,200,150,0.25)';
    for (let row = 0; row * bh < gh + bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < gw; x += bw)
        g.fillRect(x + 2 * u, row * bh + 2 * u, bw - 4 * u, Math.max(1, 1.5 * u));
    }
    // grassy lip
    g.fillStyle = '#2f9a4a';
    g.fillRect(0, 0, gw, 6 * u);
    g.fillStyle = '#8af07a';
    g.fillRect(0, 0, gw, 2 * u);
  }
  // pipe gradients are defined around x = 0 and used under a translate
  const body = env.ctx.createLinearGradient(0, 0, PW * u, 0);
  body.addColorStop(0, '#0d5a24');
  body.addColorStop(0.18, '#2bb14a');
  body.addColorStop(0.32, '#9cf58f');
  body.addColorStop(0.45, '#3cc55a');
  body.addColorStop(1, '#0a4a1c');
  s.pipeBody = body;
  const lip = env.ctx.createLinearGradient(-LIP * u, 0, (PW + LIP) * u, 0);
  lip.addColorStop(0, '#0d5a24');
  lip.addColorStop(0.18, '#34c056');
  lip.addColorStop(0.3, '#b4ffa6');
  lip.addColorStop(0.45, '#45d162');
  lip.addColorStop(1, '#0a4a1c');
  s.pipeLip = lip;
}

function addPart(
  s: State,
  kind: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: number,
  life: number
) {
  const p = s.parts[s.nextPart];
  s.nextPart = (s.nextPart + 1) % MAX_PARTS;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.r = r;
  p.life = life;
  p.max = life;
  p.spin = rand(0, TAU);
}

function freeSlot<T extends { on: boolean }>(list: T[]): T | null {
  for (const o of list) if (!o.on) return o;
  return null;
}

function addPipe(s: State, x: number, h: number) {
  const p = freeSlot(s.pipes);
  if (!p) return;
  p.on = true;
  p.x = x;
  p.h = h;
}

function addBlock(s: State, x: number, y: number) {
  const b = freeSlot(s.blocks);
  if (!b) return;
  b.on = true;
  b.x = x;
  b.y = y;
  b.used = false;
  b.bump = 0;
}

function addCoin(s: State, x: number, y: number) {
  const c = freeSlot(s.coins);
  if (!c) return;
  c.on = true;
  c.x = x;
  c.y = y;
  c.phase = rand(0, TAU);
}

/** Coins over a pipe, arcing through the path of a held jump */
function coinArc(s: State, cx: number) {
  const hs = [150, 175, 186, 175, 150];
  for (let i = 0; i < 5; i++) addCoin(s, cx + (i - 2) * 28, hs[i]);
}

/** A scripted opening stretch so the still frame lands mid-jump over a pipe */
function build(s: State) {
  s.built = true;
  const hero = s.px + SPEED * POSTER;
  addBlock(s, s.px + 190, BLOCK_Y);
  addBlock(s, s.px + 190 + BS, BLOCK_Y);
  addPipe(s, hero - PW / 2, 70);
  coinArc(s, hero);
  s.spawnX = hero + PW / 2 + 60;
}

function spawn(s: State) {
  while (s.spawnX < s.dist + s.viewW + 200) {
    const gap = rand(230, 400);
    const h = Math.round(rand(40, 104));
    const x = s.spawnX + gap;
    if (gap > 290 && Math.random() < 0.75) {
      const n = 1 + Math.floor(Math.random() * 3);
      const bx = s.spawnX + gap / 2 - (n * BS) / 2;
      for (let i = 0; i < n; i++)
        addBlock(s, bx + i * BS, BLOCK_Y + (Math.random() < 0.2 ? 60 : 0));
    } else if (Math.random() < 0.6) {
      for (let i = 0; i < 4; i++) addCoin(s, s.spawnX + gap / 2 + (i - 1.5) * 26, 60);
    }
    addPipe(s, x, h);
    if (Math.random() < 0.45) coinArc(s, x + PW / 2);
    s.spawnX = x + PW;
  }
  const cut = s.dist - 120;
  for (const p of s.pipes) if (p.on && p.x + PW < cut) p.on = false;
  for (const b of s.blocks) if (b.on && b.x + BS < cut) b.on = false;
  for (const c of s.coins) if (c.on && c.x < cut) c.on = false;
}

/** Time for the feet to rise by `rise` units from a standing jump held for `hold` seconds */
function timeToRise(rise: number, hold: number) {
  const dt = 1 / 120;
  let y = 0;
  let v = V0;
  let t = 0;
  while (t < 1) {
    const g = v > 0 && t < hold && t < HOLD_MAX ? G * HOLD_G : G;
    v -= g * dt;
    y += v * dt;
    t += dt;
    if (y >= rise) return t;
    if (v < 0) return -1;
  }
  return -1;
}

function jump(s: State, env: SceneEnv, loud: boolean) {
  s.vy = V0;
  s.grounded = false;
  s.coyote = 0;
  s.buffer = 0;
  s.jumpT = 0;
  s.sqx = 0.82;
  s.sqy = 1.2;
  const wx = s.dist + s.px;
  for (let i = 0; i < 4; i++)
    addPart(s, 0, wx + rand(-8, 8), s.py + 2, rand(-60, 20), rand(10, 40), rand(4, 7), 0.4);
  const bus = loud ? env.audio() : null;
  if (bus)
    tone(bus, 300, { type: 'square', attack: 0.004, decay: 0.12, gain: 0.035, glideTo: 620 });
}

function chime(env: SceneEnv) {
  const bus = env.audio();
  if (!bus) return;
  tone(bus, 988, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.04 });
  tone(bus, 1319, { type: 'square', attack: 0.002, decay: 0.28, gain: 0.04, delay: 0.07 });
}

function coinBurst(s: State, x: number, y: number, n: number) {
  addPart(s, 1, x, y, 0, 520, 1, 0.6);
  for (let i = 0; i < n; i++)
    addPart(s, 1, x, y, rand(-120, 160), rand(240, 460), 0.7, rand(0.6, 0.9));
  for (let i = 0; i < 6; i++)
    addPart(
      s,
      2,
      x + rand(-14, 14),
      y + rand(-10, 14),
      rand(-30, 30),
      rand(-10, 60),
      1,
      rand(0.3, 0.5)
    );
}

function press(s: State, env: SceneEnv) {
  s.idle = 0;
  s.held = true;
  s.buffer = 0.14;
  s.autoHold = 0;
  if (s.grounded || s.coyote > 0) jump(s, env, true);
  env.wake(2400);
}

function release(s: State, env: SceneEnv) {
  s.held = false;
  env.wake(1200);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: POSTER,
    init: () => ({
      pipes: Array.from({ length: 10 }, () => ({ on: false, x: 0, h: 0 })),
      blocks: Array.from({ length: 16 }, () => ({ on: false, x: 0, y: 0, used: false, bump: 0 })),
      coins: Array.from({ length: 40 }, () => ({ on: false, x: 0, y: 0, phase: 0 })),
      parts: Array.from({ length: MAX_PARTS }, () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        r: 1,
        kind: 0,
        spin: 0,
      })),
      nextPart: 0,
      clouds: Array.from({ length: 7 }, (_, i) => ({
        x: i * 190 + rand(0, 90),
        y: rand(0.12, 0.5),
        k: rand(0.6, 1.1),
      })),
      built: false,
      spawnX: 0,
      dist: 0,
      px: 180,
      py: 0,
      vy: 0,
      grounded: true,
      coyote: 0,
      buffer: 0,
      held: false,
      autoHold: 0,
      jumpT: 0,
      run: 0,
      sqx: 1,
      sqy: 1,
      hurt: 0,
      invuln: 0,
      knock: 0,
      slow: 0,
      shake: 0,
      idle: 99,
      auto: true,
      lastBlock: -1,
      s: 1,
      viewW: W0,
      gy: 0,
      bg: null,
      far: null,
      near: null,
      ground: null,
      cloud: cloudSprite(),
      block: blockSprite(false),
      usedBlock: blockSprite(true),
      coin: coinSprite(),
      glow: sprite(64, [
        [0, 'rgba(255,245,190,1)'],
        [0.3, 'rgba(255,200,80,0.5)'],
        [1, 'rgba(255,150,40,0)'],
      ]),
      pipeBody: null,
      pipeLip: null,
    }),
    resize: (s, env) => {
      const { w, h } = env;
      s.s = Math.min(w / W0, h / H0);
      s.viewW = w / s.s;
      s.gy = h - Math.max(48 * s.s, h * 0.16);
      if (!s.built) s.px = s.viewW * 0.28;
      paintScene(s, env);
    },
    update: (s, env, dt) => {
      if (!s.built) build(s);
      s.idle += dt;
      s.auto = !env.interactive || s.idle > IDLE;
      if (s.auto) s.held = false;

      s.slow = Math.max(0, s.slow - dt * 1.2);
      const speed = SPEED * (1 - 0.7 * s.slow);
      s.dist += speed * dt;
      spawn(s);
      for (const c of s.clouds) {
        c.x -= speed * 0.12 * dt + 6 * dt;
        if (c.x < -200) c.x += 7 * 190;
      }

      const wx = s.dist + s.px;
      // autopilot: jump each pipe with just enough lead, bonk fresh blocks
      if (s.auto && s.grounded) {
        let target: Pipe | null = null;
        for (const p of s.pipes) {
          if (!p.on || p.x + PW + LIP < wx - HW) continue;
          if (!target || p.x < target.x) target = p;
        }
        let jumped = false;
        if (target && target.h + 3 > s.py) {
          const hold = target.h > 60 ? 0.2 : 0.06;
          const tr = timeToRise(target.h + 3 - s.py, hold);
          const d = target.x - LIP - (wx + HW);
          const lead = tr < 0 ? 40 : speed * tr + 6;
          if (d <= lead && d >= -2) {
            jump(s, env, false);
            s.autoHold = hold;
            jumped = true;
          }
        }
        if (!jumped) {
          for (let i = 0; i < s.blocks.length; i++) {
            const b = s.blocks[i];
            if (!b.on || b.used || b.y > BLOCK_Y + 1) continue;
            const dx = b.x + BS / 2 - wx;
            // only when the landing leaves room to line up the next pipe
            const pipeNear = target && target.x - wx < speed * 0.75 + 70;
            if (dx > 6 && dx <= speed * 0.16 && !pipeNear) {
              jump(s, env, false);
              s.autoHold = 0;
              break;
            }
          }
        }
      }

      // buffered presses land as soon as he touches down
      s.buffer = Math.max(0, s.buffer - dt);
      s.coyote = Math.max(0, s.coyote - dt);
      if (s.buffer > 0 && (s.grounded || s.coyote > 0)) jump(s, env, true);

      // physics with a lighter gravity while the jump is held
      s.autoHold = Math.max(0, s.autoHold - dt);
      const holding = s.held || s.autoHold > 0;
      s.jumpT += dt;
      const g = s.vy > 0 && holding && s.jumpT < HOLD_MAX ? G * HOLD_G : G;
      const prevY = s.py;
      s.vy -= g * dt;
      s.py += s.vy * dt;

      const x0 = wx - HW;
      const x1 = wx + HW;
      let support = 0;
      for (const p of s.pipes) {
        if (!p.on || p.x - LIP > x1 || p.x + PW + LIP < x0) continue;
        if (prevY >= p.h - 0.5) support = Math.max(support, p.h);
      }
      for (const b of s.blocks) {
        if (!b.on || b.x > x1 || b.x + BS < x0) continue;
        const top = b.y + BS;
        if (prevY >= top - 0.5) support = Math.max(support, top);
      }
      const wasGrounded = s.grounded;
      if (s.vy <= 0 && s.py <= support) {
        if (!wasGrounded && prevY - s.py > 0) {
          const impact = clamp(-s.vy / 900, 0.2, 1);
          s.sqx = 1 + 0.28 * impact;
          s.sqy = 1 - 0.3 * impact;
          for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1;
            addPart(
              s,
              0,
              wx + side * rand(4, 12),
              support + 2,
              side * rand(40, 110),
              rand(10, 50),
              rand(4, 8),
              rand(0.35, 0.6)
            );
          }
        }
        s.py = support;
        s.vy = 0;
        s.grounded = true;
      } else {
        if (wasGrounded) s.coyote = 0.1;
        s.grounded = false;
      }

      // head bonks on blocks
      if (s.vy > 0) {
        for (let i = 0; i < s.blocks.length; i++) {
          const b = s.blocks[i];
          if (!b.on || b.x > x1 - 3 || b.x + BS < x0 + 3) continue;
          if (prevY + PH <= b.y + 0.5 && s.py + PH > b.y) {
            s.py = b.y - PH;
            s.vy = -60;
            b.bump = 1;
            if (!b.used) {
              b.used = true;
              coinBurst(s, b.x + BS / 2, b.y + BS, 4);
              if (!s.auto) chime(env);
            } else if (!s.auto) {
              const bus = env.audio();
              if (bus) tone(bus, 140, { type: 'square', attack: 0.003, decay: 0.08, gain: 0.04 });
            }
            break;
          }
        }
      }

      // running into a pipe: bump up and over, never a game over
      s.invuln = Math.max(0, s.invuln - dt);
      if (s.invuln <= 0) {
        for (const p of s.pipes) {
          if (!p.on || p.x > x1 || p.x + PW < x0) continue;
          if (s.py < p.h - 2) {
            s.vy = Math.sqrt(2 * G * (p.h - s.py + 26));
            s.jumpT = HOLD_MAX;
            s.grounded = false;
            s.invuln = 0.7;
            s.hurt = 1;
            s.knock = 1;
            s.slow = 1;
            s.shake = 0.6;
            s.sqx = 1.25;
            s.sqy = 0.78;
            for (let i = 0; i < 6; i++)
              addPart(s, 2, p.x, s.py + rand(8, 34), rand(-80, -20), rand(-40, 80), 1, 0.35);
            const bus = s.auto ? null : env.audio();
            if (bus) {
              tone(bus, 170, {
                type: 'square',
                attack: 0.003,
                decay: 0.16,
                gain: 0.05,
                glideTo: 80,
              });
              tone(bus, 90, { type: 'triangle', attack: 0.003, decay: 0.2, gain: 0.06 });
            }
            break;
          }
        }
      }

      // coins
      for (const c of s.coins) {
        if (!c.on) continue;
        if (c.x + COIN_R < x0 || c.x - COIN_R > x1) continue;
        if (c.y + COIN_R < s.py || c.y - COIN_R > s.py + PH) continue;
        c.on = false;
        coinBurst(s, c.x, c.y, 1);
        if (!s.auto) chime(env);
      }

      for (const b of s.blocks) b.bump = Math.max(0, b.bump - dt * 5);
      s.hurt = Math.max(0, s.hurt - dt * 2.5);
      s.knock = damp(s.knock, 0, 5, dt);
      s.shake = Math.max(0, s.shake - dt * 3);
      s.sqx = damp(s.sqx, 1, 14, dt);
      s.sqy = damp(s.sqy, 1, 14, dt);
      s.run += dt * speed * (s.grounded ? 0.075 : 0);

      for (const p of s.parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.kind === 1) p.vy -= 1500 * dt;
        else if (p.kind === 0) {
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 2;
          p.r += dt * 14;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 16;
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      const gy = s.gy;
      const dist = s.dist;
      const X = (wx: number) => (wx - dist) * u;
      const Y = (y: number) => gy - y * u;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

      ctx.save();
      const amp = s.shake * s.shake * 6 * u;
      if (amp > 0.05) ctx.translate(Math.sin(t * 87) * amp, Math.cos(t * 71) * amp);

      // clouds and hills in parallax
      for (const c of s.clouds) {
        const cw = 160 * u * c.k;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(s.cloud, c.x * u, c.y * (gy - 120 * u), cw, cw * 0.5);
      }
      ctx.globalAlpha = 1;
      const tw = TILE * u;
      if (s.far) {
        const fh = 190 * u;
        let ox = -((dist * 0.2 * u) % tw);
        for (; ox < w; ox += tw) ctx.drawImage(s.far, ox, gy - fh + 30 * u, tw, fh);
      }
      if (s.near) {
        const nh = 120 * u;
        let ox = -((dist * 0.5 * u) % tw);
        for (; ox < w; ox += tw) ctx.drawImage(s.near, ox, gy - nh + 4 * u, tw, nh);
      }
      // warm haze near the horizon
      ctx.globalCompositeOperation = 'lighter';
      const haze = ctx.createLinearGradient(0, gy - 80 * u, 0, gy);
      haze.addColorStop(0, 'rgba(255,140,90,0)');
      haze.addColorStop(1, 'rgba(255,140,90,0.14)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, gy - 80 * u, w, 80 * u);
      ctx.globalCompositeOperation = 'source-over';

      // ground
      if (s.ground) {
        const gx = -((dist * u) % (64 * u));
        ctx.drawImage(s.ground, gx, gy, w + 64 * u, h - gy + 2);
      }

      // pipes
      const lw = Math.max(1, 2 * u);
      for (const p of s.pipes) {
        if (!p.on) continue;
        const px = X(p.x);
        if (px > w + 20 || px + (PW + LIP) * u < -20) continue;
        const top = Y(p.h);
        ctx.save();
        ctx.translate(px, 0);
        // cast shadow on the ground
        ctx.fillStyle = 'rgba(40,10,20,0.35)';
        ctx.beginPath();
        ctx.ellipse(PW * u * 0.5 + 8 * u, gy + 3 * u, PW * 0.62 * u, 5 * u, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#062d12';
        ctx.fillRect(-lw, top + LIP_H * u - lw, PW * u + lw * 2, gy - top - LIP_H * u + lw);
        if (s.pipeBody) ctx.fillStyle = s.pipeBody;
        ctx.fillRect(0, top + LIP_H * u, PW * u, gy - top - LIP_H * u);
        ctx.fillStyle = '#062d12';
        ctx.fillRect(-LIP * u - lw, top - lw, (PW + LIP * 2) * u + lw * 2, LIP_H * u + lw * 2);
        if (s.pipeLip) ctx.fillStyle = s.pipeLip;
        ctx.fillRect(-LIP * u, top, (PW + LIP * 2) * u, LIP_H * u);
        ctx.fillStyle = 'rgba(0,30,10,0.35)';
        ctx.fillRect(0, top + LIP_H * u, PW * u, 4 * u);
        // sun rim on the right edge
        ctx.fillStyle = 'rgba(255,190,140,0.45)';
        ctx.fillRect((PW + LIP) * u - 2 * u, top + 2 * u, 2 * u, LIP_H * u - 4 * u);
        ctx.fillRect(PW * u - 2 * u, top + LIP_H * u + 2 * u, 2 * u, gy - top - LIP_H * u - 2 * u);
        ctx.restore();
      }

      // blocks
      for (const b of s.blocks) {
        if (!b.on) continue;
        const bx = X(b.x);
        if (bx > w + 10 || bx + BS * u < -10) continue;
        const lift = Math.sin(b.bump * Math.PI) * 8 * u;
        const by = Y(b.y + BS) - lift;
        if (!b.used) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 3 + b.x);
          const gr = BS * 1.3 * u;
          ctx.drawImage(s.glow, bx + (BS / 2) * u - gr, by + (BS / 2) * u - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(b.used ? s.usedBlock : s.block, bx, by, BS * u, BS * u);
      }

      // floating coins, spinning
      for (const c of s.coins) {
        if (!c.on) continue;
        const cx = X(c.x);
        if (cx < -20 || cx > w + 20) continue;
        const cy = Y(c.y + Math.sin(t * 3 + c.phase) * 2);
        drawCoin(ctx, s, cx, cy, COIN_R * u, t * 5 + c.phase, 1);
      }

      drawPlayer(ctx, s, t);

      // particles
      for (const p of s.parts) {
        if (p.life <= 0) continue;
        const k = p.life / p.max;
        const px = X(p.x);
        const py = Y(p.y);
        if (p.kind === 0) {
          ctx.globalAlpha = k * 0.55;
          ctx.fillStyle = '#ffe2c8';
          ctx.beginPath();
          ctx.arc(px, py, p.r * u, 0, TAU);
          ctx.fill();
        } else if (p.kind === 1) {
          drawCoin(ctx, s, px, py, COIN_R * u * (0.8 + p.r * 0.3), p.spin, Math.min(1, k * 3));
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k;
          ctx.fillStyle = '#fff6c0';
          const r = (1 + 4 * k) * u;
          ctx.fillRect(px - r, py - 0.8 * u, r * 2, 1.6 * u);
          ctx.fillRect(px - 0.8 * u, py - r, 1.6 * u, r * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;

      if (s.hurt > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,220,200,${(s.hurt * s.hurt * 0.18).toFixed(3)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      const v = ctx.createRadialGradient(
        w / 2,
        h * 0.5,
        Math.min(w, h) * 0.4,
        w / 2,
        h * 0.5,
        Math.max(w, h) * 0.8
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10,0,20,0.45)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k !== ' ' && k !== 'w') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      for (const c of [
        s.bg,
        s.far,
        s.near,
        s.ground,
        s.cloud,
        s.block,
        s.usedBlock,
        s.coin,
        s.glow,
      ]) {
        if (c) c.width = c.height = 0;
      }
      s.bg = s.far = s.near = s.ground = null;
    },
  });

function drawCoin(
  ctx: CanvasRenderingContext2D,
  s: State,
  x: number,
  y: number,
  r: number,
  spin: number,
  alpha: number
) {
  const sx = Math.abs(Math.cos(spin));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * alpha;
  ctx.drawImage(s.glow, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  const cw = Math.max(r * 0.25, r * sx);
  ctx.drawImage(s.coin, x - cw, y - r, cw * 2, r * 2);
  ctx.globalAlpha = 1;
}

const OUTLINE = '#1c0f1a';
const CAP = '#e8322e';
const SHIRT = '#d9262a';
const OVERALL = '#2f5fd6';
const SKIN = '#ffc9a0';
const SHOE = '#5b2a12';
const HAIR = '#3a1d0e';

function limb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  len: number,
  width: number,
  color: string
) {
  const ex = x + Math.sin(a) * len;
  const ey = y + Math.cos(a) * len;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  return { ex, ey };
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
}

/** The plumber, facing right, feet at the origin, drawn in local units (about 44 tall) */
function drawPlayer(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const u = s.s;
  const x = s.px * u - s.knock * 18 * u;
  const y = s.gy - s.py * u;
  const air = !s.grounded;

  // ground shadow shrinks as he rises
  let floor = 0;
  const wx = s.dist + s.px;
  for (const p of s.pipes) {
    if (!p.on || p.x - LIP > wx + HW || p.x + PW + LIP < wx - HW) continue;
    if (p.h <= s.py + 0.5) floor = Math.max(floor, p.h);
  }
  const lift = clamp((s.py - floor) / 200, 0, 1);
  ctx.fillStyle = `rgba(30,5,20,${(0.35 * (1 - lift * 0.7)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, s.gy - floor * u + 2 * u, 14 * u * (1 - lift * 0.5), 3.5 * u, 0, 0, TAU);
  ctx.fill();

  if (s.invuln > 0 && Math.sin(t * 60) > 0.3) ctx.globalAlpha = 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u * s.sqx, u * s.sqy);
  const lean = air ? -0.05 : 0.08 + Math.sin(s.run * 2) * 0.02;
  ctx.rotate(lean);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;

  const cyc = s.run;
  const bob = air ? 0 : Math.abs(Math.sin(cyc)) * 1.6;
  ctx.translate(0, -bob);
  const hipY = -13;
  // legs: back leg first
  const la = air ? -0.9 : Math.sin(cyc) * 0.8;
  const ra = air ? 0.7 : -Math.sin(cyc) * 0.8;
  const back = limb(ctx, -2, hipY, la, 11, 6, '#244ab0');
  blob(ctx, back.ex + 2, back.ey + 1, 5, 3.2, SHOE);
  // back arm
  const baA = air ? 2.6 : -Math.sin(cyc) * 0.9 + 0.1;
  const ba = limb(ctx, -4, -25, baA, 10, 5, '#b01e22');
  blob(ctx, ba.ex, ba.ey, 3, 3, '#f4f0ea');

  // torso: shirt under overalls
  ctx.beginPath();
  roundRect(ctx, -9, -28, 18, 12, 5);
  ctx.fillStyle = SHIRT;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, -21);
  ctx.lineTo(9, -21);
  ctx.lineTo(10, -11);
  ctx.quadraticCurveTo(0, -8, -10, -11);
  ctx.closePath();
  ctx.fillStyle = OVERALL;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OVERALL;
  ctx.fillRect(-6, -27, 3, 7);
  ctx.fillRect(3, -27, 3, 7);
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.arc(-4.5, -20, 1.4, 0, TAU);
  ctx.arc(4.5, -20, 1.4, 0, TAU);
  ctx.fill();

  // front leg
  const front = limb(ctx, 3, hipY, ra, 11, 6, OVERALL);
  blob(ctx, front.ex + 2.5, front.ey + 1, 5.2, 3.4, SHOE);

  // head
  blob(ctx, 2, -35, 8.5, 8, SKIN);
  // hair tuft and sideburn
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-6.5, -38);
  ctx.quadraticCurveTo(-9, -33, -5, -30);
  ctx.lineTo(-3, -35);
  ctx.closePath();
  ctx.fill();
  // ear
  blob(ctx, -1.5, -34.5, 2, 2.4, '#f2b58a');
  // eye
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(5.5, -39, 1.8, 3.6);
  // moustache: a wide dark swoop under the nose
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(3, -31.5);
  ctx.quadraticCurveTo(8, -34, 14, -31);
  ctx.quadraticCurveTo(12, -28, 9, -29.5);
  ctx.quadraticCurveTo(6, -28, 3, -31.5);
  ctx.closePath();
  ctx.fill();
  // nose
  blob(ctx, 10.5, -34, 3.2, 2.8, SKIN);
  // cap: dome plus a forward brim
  ctx.beginPath();
  ctx.moveTo(-7, -38);
  ctx.bezierCurveTo(-7, -48, 10, -48, 10, -39);
  ctx.lineTo(15, -38.5);
  ctx.quadraticCurveTo(15.5, -36.5, 13, -36.5);
  ctx.lineTo(-7, -37);
  ctx.closePath();
  ctx.fillStyle = CAP;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -43.5, 4, 1.4, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f4f0ea';
  ctx.beginPath();
  ctx.arc(2, -42, 2.4, 0, TAU);
  ctx.fill();

  // front arm: pumping, or a fist raised when airborne
  const faA = air ? Math.PI - 0.35 : Math.sin(cyc) * 0.9 - 0.1;
  const fa = limb(ctx, 5, -25, faA, 10, 5, SHIRT);
  blob(ctx, fa.ex, fa.ey, 3.2, 3.2, '#ffffff');
  ctx.restore();
  ctx.globalAlpha = 1;
}
