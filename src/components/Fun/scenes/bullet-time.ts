import { createCanvasScene, clamp, damp, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { greenGrade, ik, limb, makeGlyphAtlas, poly, Rain, rimFill, seeded } from './matrix-kit';
import type { GlyphAtlas } from './matrix-kit';

/**
 * Bullet Time: Neo on a rooftop, bending back under a volley from an Agent.
 * Neo's head follows the pointer along the arc of his lean: down and back bends him into the
 * famous pose, up stands him tall. Before every burst the Agent sights along a faint laser
 * and the clock eases into slow motion, so each shot is telegraphed; every bullet in the air
 * draws its predicted path, pale when it will miss and red when it is on target, and turns
 * pale the moment he leans clear. Holding drops the world deeper into bullet time with the
 * camera sweeping around him. A clean dodge throws a ripple of air off the slug and a whoosh.
 * Left alone it demos itself.
 */

interface Bullet {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  dist: number;
  hit: boolean;
  /** Past Neo and no longer a threat */
  passed: boolean;
  /** Closest clearance to his body so far, and where it happened */
  minD: number;
  cx: number;
  cy: number;
  threat: boolean;
}

interface Wave {
  x: number;
  y: number;
  age: number;
  str: number;
}

interface Ring {
  x: number;
  y: number;
  a: number;
  age: number;
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

interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  life: number;
}

interface Chain {
  x: Float32Array;
  y: Float32Array;
}

interface State {
  atlas: GlyphAtlas;
  rain: Rain;
  bullets: Bullet[];
  rings: Ring[];
  ringNext: number;
  waves: Wave[];
  waveNext: number;
  sparks: Spark[];
  sparkNext: number;
  shells: Shell[];
  shellNext: number;
  motes: Float32Array;
  back: Chain;
  front: Chain;
  // pose, world pixels
  j: Float32Array;
  lean: number;
  leanTarget: number;
  keyBack: boolean;
  keyUp: boolean;
  keyMode: boolean;
  /** Head target guide opacity */
  guide: number;
  streak: number;
  pip: number;
  pipHit: number;
  // time
  ts: number;
  held: boolean;
  keyHeld: boolean;
  demo: boolean;
  demoT: number;
  idle: number;
  touched: boolean;
  btClock: number;
  orbit: number;
  hitStop: number;
  shake: number;
  flash: number;
  hitFlash: number;
  gust: number;
  // agent
  fireT: number;
  burst: number;
  /** 0 idle, rising to 1 while the Agent sights, held at 1 through the burst */
  aim: number;
  aimY: number;
  muzzle: number;
  recoil: number;
  beat: number;
  // layout
  s: number;
  gy: number;
  edge: number;
  nx: number;
  ax: number;
  ay: number;
  sky: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
  margin: number;
  vignette: CanvasGradient | null;
  haze: CanvasGradient | null;
  floorG: CanvasGradient | null;
}

const MAX_BULLETS = 12;
const MAX_RINGS = 520;
const MAX_SPARKS = 140;
const MAX_SHELLS = 16;
const LINKS = 7;
const LINK = 14;
const SLOW = 0.06;
/** The clock eases to this whenever a shot is coming, held or not */
const ASSIST = 0.24;
const BULLET_SPEED = 1800;
const AIM_TIME = 0.7;
// forgiving hit circles, in scene units: head, chest, belly
const HEAD_R = 9;
const CHEST_R = 14;
const BELLY_R = 12;
const MAX_WAVES = 12;
const PIPS = 10;

// joint slots in s.j (x, y pairs)
const HIP = 0;
const KNEE1 = 2;
const KNEE2 = 4;
const FOOT1 = 6;
const FOOT2 = 8;
const SHO = 10;
const HEAD = 12;
const ELB1 = 14;
const HAND1 = 16;
const ELB2 = 18;
const HAND2 = 20;
const NECK = 22;
const SPINE = 24; // x = theta

const chain = (): Chain => ({
  x: new Float32Array(LINKS + 1),
  y: new Float32Array(LINKS + 1),
});

function buildSkyline(w: number, h: number, margin: number, edge: number, s: number, seed: number, near: boolean) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = w + margin * 2;
  c.width = Math.max(1, Math.round(W * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(dpr, dpr);
  const r = seeded(seed);
  let x = -10;
  while (x < W + 10) {
    const bw = (near ? rand(60, 140) : rand(30, 80)) * s * (0.6 + r() * 0.6);
    const tall = r() < (near ? 0.12 : 0.3);
    const top = edge - (near ? (tall ? 60 + r() * 90 : -30 + r() * 50) : tall ? 70 + r() * 150 : 10 + r() * 50) * s;
    const body = near ? '#030b08' : '#08201a';
    g.fillStyle = body;
    g.fillRect(x, top, bw, h - top);
    // antenna or water tank on a few roofs
    if (r() < 0.3) {
      g.fillRect(x + bw * 0.5, top - 30 * s, 1.5 * s, 30 * s);
    }
    if (near && r() < 0.35) {
      const tw = 22 * s;
      g.fillRect(x + bw * 0.2, top - 26 * s, tw, 22 * s);
      g.beginPath();
      g.moveTo(x + bw * 0.2 - 2 * s, top - 26 * s);
      g.lineTo(x + bw * 0.2 + tw / 2, top - 36 * s);
      g.lineTo(x + bw * 0.2 + tw + 2 * s, top - 26 * s);
      g.fill();
    }
    // lit windows, a mix of green fluorescents and a few warm lamps
    const cols = Math.max(2, Math.floor(bw / (9 * s)));
    const rows = Math.floor((edge - top) / (11 * s));
    const cw = bw / cols;
    for (let yy = 0; yy < rows; yy++) {
      for (let xx = 0; xx < cols; xx++) {
        if (r() > (near ? 0.16 : 0.24)) continue;
        const warm = r() < 0.25;
        g.fillStyle = warm
          ? `rgba(230,190,110,${near ? 0.55 : 0.35})`
          : `rgba(110,240,160,${near ? 0.45 : 0.3})`;
        g.fillRect(x + xx * cw + cw * 0.25, top + 8 * s + yy * 11 * s, cw * 0.5, 5 * s);
      }
    }
    // rim of sky light on the roofline
    g.fillStyle = near ? 'rgba(120,255,170,0.14)' : 'rgba(120,255,170,0.1)';
    g.fillRect(x, top, bw, 1.2 * s);
    x += bw + (near ? rand(4, 20) : rand(2, 12)) * s;
  }
  return c;
}

/** The Agent's muzzle mapped into Neo's plane (the camera may be mid orbit), into tmp2 */
function muzzle(s: State) {
  const u = s.s;
  const gx = s.ax + 76 * 0.8 * u - s.orbit * 70 * u;
  const fx = s.nx - s.orbit * 20 * u;
  tmp2[0] = s.nx + (gx - fx) / Math.max(0.3, Math.cos(s.orbit * 0.55));
  tmp2[1] = s.ay - 124 * 0.8 * u;
}

function resetBullet(b: Bullet) {
  b.spin = rand(0, TAU);
  b.dist = 0;
  b.hit = false;
  b.passed = false;
  b.minD = 1e9;
  b.cx = 0;
  b.cy = 0;
  b.threat = false;
}

function spawnBullet(s: State) {
  const b = s.bullets.find((q) => !q.on);
  if (!b) return;
  const u = s.s;
  // a touch of scatter around the sighted line, never enough to change which way to dodge
  const aimY = s.aimY + rand(-8, 8) * u;
  b.on = true;
  muzzle(s);
  b.x = tmp2[0];
  b.y = tmp2[1];
  const dx = s.nx + 60 * u - b.x;
  const dy = aimY - b.y;
  const len = Math.hypot(dx, dy) || 1;
  const v = BULLET_SPEED * u;
  b.vx = (dx / len) * v;
  b.vy = (dy / len) * v;
  resetBullet(b);
  s.muzzle = 1;
  s.recoil = 1;
  const sh = s.shells[s.shellNext];
  s.shellNext = (s.shellNext + 1) % MAX_SHELLS;
  sh.x = s.ax + 36 * 0.8 * u;
  sh.y = s.ay - 124 * 0.8 * u;
  sh.vx = rand(-60, 20) * u;
  sh.vy = rand(-260, -180) * u;
  sh.r = rand(0, TAU);
  sh.vr = rand(-20, 20);
  sh.life = 2.5;
}

/** Where his head sits for a lean (no idle sway), into tmp */
function headAt(s: State, L: number) {
  const u = s.s;
  const hx = s.nx + lerp(4, 2, L) * u;
  const hy = s.gy - lerp(112, 74, L) * u;
  const th = lerp(0.14, 1.12, L);
  const sx = hx + Math.sin(th) * 80 * u;
  const sy = hy - Math.cos(th) * 80 * u;
  const ha = th + lerp(0.08, -0.05, L);
  tmp[0] = sx + Math.sin(ha) * 25 * u;
  tmp[1] = sy - Math.cos(ha) * 25 * u;
}

/** Hit circles (x, y, r) for head, chest and belly at a given lean, without sway */
function circlesAt(s: State, L: number, out: Float32Array) {
  const u = s.s;
  const hx = s.nx + lerp(4, 2, L) * u;
  const hy = s.gy - lerp(112, 74, L) * u;
  const th = lerp(0.14, 1.12, L);
  headAt(s, L);
  out[0] = tmp[0];
  out[1] = tmp[1];
  out[2] = HEAD_R * u;
  out[3] = hx + Math.sin(th) * 50 * u;
  out[4] = hy - Math.cos(th) * 50 * u;
  out[5] = CHEST_R * u;
  out[6] = hx + Math.sin(th) * 20 * u;
  out[7] = hy - Math.cos(th) * 20 * u;
  out[8] = BELLY_R * u;
}

/** Hit circles for the pose as it stands this frame */
function bodyCircles(s: State, out: Float32Array) {
  const u = s.s;
  const j = s.j;
  const th = j[SPINE];
  out[0] = j[HEAD];
  out[1] = j[HEAD + 1];
  out[2] = HEAD_R * u;
  out[3] = j[HIP] + Math.sin(th) * 50 * u;
  out[4] = j[HIP + 1] - Math.cos(th) * 50 * u;
  out[5] = CHEST_R * u;
  out[6] = j[HIP] + Math.sin(th) * 20 * u;
  out[7] = j[HIP + 1] - Math.cos(th) * 20 * u;
  out[8] = BELLY_R * u;
}

/**
 * Smallest clearance between a ray (unit direction) and the circles ahead of it; negative
 * means it will hit. The nearest point on the ray to the worst circle goes into tmp.
 */
function rayClear(c: Float32Array, px: number, py: number, dx: number, dy: number) {
  let best = 1e9;
  for (let i = 0; i < 9; i += 3) {
    const along = (c[i] - px) * dx + (c[i + 1] - py) * dy;
    if (along < -c[i + 2]) continue;
    const qx = px + dx * along;
    const qy = py + dy * along;
    const d = Math.hypot(c[i] - qx, c[i + 1] - qy) - c[i + 2];
    if (d < best) {
      best = d;
      tmp[0] = qx;
      tmp[1] = qy;
    }
  }
  return best;
}

function wave(s: State, x: number, y: number, str: number) {
  const w = s.waves[s.waveNext];
  s.waveNext = (s.waveNext + 1) % MAX_WAVES;
  w.x = x;
  w.y = y;
  w.age = 0;
  w.str = str;
}

function spark(s: State, x: number, y: number, speed: number) {
  const p = s.sparks[s.sparkNext];
  s.sparkNext = (s.sparkNext + 1) % MAX_SPARKS;
  const a = rand(0, TAU);
  const v = speed * rand(0.3, 1);
  p.x = x;
  p.y = y;
  p.vx = Math.cos(a) * v;
  p.vy = Math.sin(a) * v;
  p.max = rand(0.3, 0.8);
  p.life = p.max;
}

function pose(s: State, t: number) {
  const u = s.s;
  const L = s.lean;
  const j = s.j;
  const nx = s.nx;
  const gy = s.gy;
  j[FOOT1] = nx - 40 * u;
  j[FOOT1 + 1] = gy;
  j[FOOT2] = nx + 8 * u;
  j[FOOT2 + 1] = gy;
  const sway = Math.sin(t * 1.7) * 0.03;
  j[HIP] = nx + lerp(4, 2, L) * u;
  j[HIP + 1] = gy - lerp(112, 74, L) * u;
  ik(j[HIP], j[HIP + 1], j[FOOT1], j[FOOT1 + 1], 60 * u, 58 * u, 1, tmp);
  j[KNEE1] = tmp[0];
  j[KNEE1 + 1] = tmp[1];
  ik(j[HIP], j[HIP + 1], j[FOOT2], j[FOOT2 + 1], 60 * u, 58 * u, 1, tmp);
  j[KNEE2] = tmp[0];
  j[KNEE2 + 1] = tmp[1];
  const th = lerp(0.14, 1.12, L) + sway;
  j[SPINE] = th;
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  j[SHO] = j[HIP] + dx * 80 * u;
  j[SHO + 1] = j[HIP + 1] + dy * 80 * u;
  const ha = th + lerp(0.08, -0.05, L);
  j[NECK] = j[SHO] + Math.sin(ha) * 10 * u;
  j[NECK + 1] = j[SHO + 1] - Math.cos(ha) * 10 * u;
  j[HEAD] = j[SHO] + Math.sin(ha) * 25 * u;
  j[HEAD + 1] = j[SHO + 1] - Math.cos(ha) * 25 * u;
  // arms: the far one hangs back toward the roof, the near one is flung up and forward
  const a1 = lerp(1.75, 0.15, L) + Math.sin(t * 1.3) * 0.18;
  j[ELB1] = j[SHO] + Math.cos(a1) * 34 * u;
  j[ELB1 + 1] = j[SHO + 1] + Math.sin(a1) * 34 * u;
  const f1 = a1 + lerp(-0.3, 0.5, L);
  j[HAND1] = j[ELB1] + Math.cos(f1) * 32 * u;
  j[HAND1 + 1] = j[ELB1 + 1] + Math.sin(f1) * 32 * u;
  const a2 = lerp(1.9, -2.35, L) + Math.sin(t * 1.1 + 1) * 0.22;
  j[ELB2] = j[SHO] + Math.cos(a2) * 34 * u;
  j[ELB2 + 1] = j[SHO + 1] + Math.sin(a2) * 34 * u;
  const f2 = a2 + lerp(-0.2, -0.7, L);
  j[HAND2] = j[ELB2] + Math.cos(f2) * 32 * u;
  j[HAND2 + 1] = j[ELB2 + 1] + Math.sin(f2) * 32 * u;
}
const tmp = new Float32Array(2);
const tmp2 = new Float32Array(2);
const hitCircles = new Float32Array(9);
const testCircles = new Float32Array(9);

function anchor(s: State, which: 0 | 1) {
  const u = s.s;
  const th = s.j[SPINE];
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  const nx = Math.cos(th);
  const ny = Math.sin(th);
  // 0 hangs from the back of the shoulders, 1 from the hips
  if (which === 0) {
    tmp[0] = s.j[SHO] + nx * 17 * u - dx * 4 * u;
    tmp[1] = s.j[SHO + 1] + ny * 17 * u - dy * 4 * u;
  } else {
    tmp[0] = s.j[HIP] - nx * 4 * u + dx * 2 * u;
    tmp[1] = s.j[HIP + 1] - ny * 4 * u + dy * 2 * u;
  }
}

function resetChain(s: State, c: Chain, which: 0 | 1) {
  anchor(s, which);
  for (let i = 0; i <= LINKS; i++) {
    c.x[i] = tmp[0];
    c.y[i] = Math.min(tmp[1] + i * LINK * s.s, s.gy - 3 * s.s);
  }
}

/**
 * The coat tails: each node eases toward a hanging line that flares away from the shots.
 * In slow motion the easing slows too, so the leather lingers mid whip.
 */
function stepChain(s: State, c: Chain, which: 0 | 1, rdt: number, t: number, flare: number, k: number) {
  const u = s.s;
  anchor(s, which);
  c.x[0] = tmp[0];
  c.y[0] = tmp[1];
  const dir = which === 0 ? 1 : -0.55;
  const rate = lerp(16, 3.5, k);
  let floorRun = 0;
  for (let i = 1; i <= LINKS; i++) {
    const q = i / LINKS;
    const wave = Math.sin(t * 3.1 + i * 0.75 + which * 1.7) * (3 + flare * 6) * q * u;
    let tx = tmp[0] + dir * flare * q * q * 58 * u + wave;
    let ty = tmp[1] + i * LINK * u * (1 - flare * 0.12 * q);
    const floor = s.gy - 3 * u;
    if (ty > floor) {
      floorRun += ty - floor;
      ty = floor;
      tx += dir * floorRun * 0.8 + (dir > 0 ? 1 : -1) * floorRun * 0.2;
    }
    c.x[i] = damp(c.x[i], tx, rate * (1.4 - q * 0.6), rdt);
    c.y[i] = damp(c.y[i], ty, rate * (1.4 - q * 0.6), rdt);
  }
}

function enter(s: State, env: SceneEnv) {
  const bus = s.touched ? env.audio() : null;
  if (!bus) return;
  tone(bus, 240, { type: 'sine', attack: 0.02, decay: 1.1, gain: 0.12, glideTo: 48 });
  tone(bus, 120, { type: 'triangle', attack: 0.05, decay: 1.4, gain: 0.08, glideTo: 30 });
  noise(bus, { duration: 0.9, gain: 0.08, freq: 500, q: 0.6, type: 'lowpass' });
}

function exit(s: State, env: SceneEnv) {
  const bus = s.touched ? env.audio() : null;
  if (!bus) return;
  noise(bus, { duration: 0.35, gain: 0.1, freq: 2400, q: 0.5, type: 'highpass' });
  tone(bus, 60, { type: 'sine', attack: 0.01, decay: 0.35, gain: 0.1, glideTo: 260 });
}

function setHeld(s: State, env: SceneEnv, on: boolean) {
  const was = s.held || s.keyHeld;
  if (on) {
    s.touched = true;
    s.demo = false;
    s.idle = 0;
  }
  const now = on || (s.held || s.keyHeld);
  if (now && !was) enter(s, env);
  if (!now && was) exit(s, env);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.4,
    init: () => {
      const s: State = {
        atlas: makeGlyphAtlas(40),
        rain: new Rain(),
        bullets: Array.from({ length: MAX_BULLETS }, () => ({
          on: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          spin: 0,
          dist: 0,
          hit: false,
          passed: false,
          minD: 1e9,
          cx: 0,
          cy: 0,
          threat: false,
        })),
        rings: Array.from({ length: MAX_RINGS }, () => ({ x: 0, y: 0, a: 0, age: 1, max: 1 })),
        ringNext: 0,
        waves: Array.from({ length: MAX_WAVES }, () => ({ x: 0, y: 0, age: 1, str: 0 })),
        waveNext: 0,
        sparks: Array.from({ length: MAX_SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 })),
        sparkNext: 0,
        shells: Array.from({ length: MAX_SHELLS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, life: 0 })),
        shellNext: 0,
        motes: new Float32Array(60 * 3).map(() => Math.random()),
        back: chain(),
        front: chain(),
        j: new Float32Array(26),
        lean: 0.92,
        leanTarget: 0.92,
        keyBack: false,
        keyUp: false,
        keyMode: false,
        guide: 0,
        streak: 0,
        pip: 0,
        pipHit: 0,
        ts: SLOW,
        held: false,
        keyHeld: false,
        demo: true,
        demoT: 0,
        idle: 0,
        touched: false,
        btClock: 0.6,
        orbit: 0,
        hitStop: 0,
        shake: 0,
        flash: 0,
        hitFlash: 0,
        gust: 0,
        fireT: 0.5,
        burst: 0,
        aim: 0,
        aimY: 0,
        muzzle: 0,
        recoil: 0,
        beat: 0,
        s: 1,
        gy: 0,
        edge: 0,
        nx: 0,
        ax: 0,
        ay: 0,
        sky: null,
        far: null,
        mid: null,
        margin: 0,
        vignette: null,
        haze: null,
        floorG: null,
      };
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const first = s.gy === 0;
      s.s = Math.min(w / 700, h / 400);
      const u = s.s;
      s.gy = h * 0.9;
      s.edge = s.gy - 64 * u;
      s.nx = w * 0.6;
      s.ax = Math.max(w * 0.1 + 20 * u, s.nx - 400 * u);
      s.ay = s.gy - 34 * u;
      s.margin = 160 * u;
      s.rain.resize(w, s.edge, Math.max(8, 9 * u), 0.7);

      const sky = document.createElement('canvas');
      const dpr = env.dpr;
      sky.width = Math.max(1, Math.round(w * dpr));
      sky.height = Math.max(1, Math.round(h * dpr));
      const g = sky.getContext('2d');
      if (g) {
        g.scale(dpr, dpr);
        const grd = g.createLinearGradient(0, 0, 0, s.edge);
        grd.addColorStop(0, '#020909');
        grd.addColorStop(0.5, '#0a2a24');
        grd.addColorStop(0.85, '#2a6b58');
        grd.addColorStop(1, '#4f9a7c');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        // low cloud glow over the city
        const cg = g.createRadialGradient(w * 0.62, s.edge, 0, w * 0.62, s.edge, w * 0.55);
        cg.addColorStop(0, 'rgba(170,240,200,0.4)');
        cg.addColorStop(0.4, 'rgba(90,190,140,0.16)');
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = cg;
        g.fillRect(0, 0, w, h);
      }
      if (s.sky) s.sky.width = 0;
      s.sky = sky;
      if (s.far) s.far.width = 0;
      if (s.mid) s.mid.width = 0;
      s.far = buildSkyline(w, h, s.margin, s.edge - 30 * u, u, 7, false);
      s.mid = buildSkyline(w, h, s.margin, s.edge, u, 19, true);
      const v = ctx.createRadialGradient(w * 0.55, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.72)');
      s.vignette = v;
      const hz = ctx.createLinearGradient(0, s.edge - 150 * u, 0, s.edge);
      hz.addColorStop(0, 'rgba(120,220,170,0)');
      hz.addColorStop(0.6, 'rgba(120,220,170,0.28)');
      hz.addColorStop(1, 'rgba(170,245,205,0.55)');
      s.haze = hz;
      const fg = ctx.createLinearGradient(0, s.edge, 0, h);
      fg.addColorStop(0, '#2f5e4e');
      fg.addColorStop(0.25, '#13302a');
      fg.addColorStop(1, '#030806');
      s.floorG = fg;

      pose(s, 0);
      resetChain(s, s.back, 0);
      resetChain(s, s.front, 1);
      if (first) {
        // a volley already in the air around him for the opening frame
        const ys = [-196, -160, -214, -176];
        const xs = [-330, -40, 170, -190];
        for (let i = 0; i < 4; i++) {
          const b = s.bullets[i];
          b.on = true;
          b.x = s.nx + xs[i] * u;
          b.y = s.gy + ys[i] * u;
          b.vx = 2400 * u;
          b.vy = rand(-40, 60) * u;
          resetBullet(b);
          // pre-seed a wake behind each
          for (let k = 1; k < 26; k++) {
            const r = s.rings[s.ringNext];
            s.ringNext = (s.ringNext + 1) % MAX_RINGS;
            r.x = b.x - k * 14 * u;
            r.y = b.y - (b.vy / b.vx) * k * 14 * u;
            r.a = Math.atan2(b.vy, b.vx);
            r.max = 1.4;
            r.age = k * 0.05;
          }
        }
      }
    },
    update: (s, env, rdt, t) => {
      const u = s.s;
      // hit-stop freezes the world for a beat
      if (s.hitStop > 0) {
        s.hitStop -= rdt;
        s.shake = Math.max(0, s.shake - rdt * 2);
        return;
      }
      const deep = s.held || s.keyHeld || (s.demo && s.demoT % 7 < 4.2);
      if (s.demo) s.demoT += rdt;
      else {
        s.idle += rdt;
        if (!s.held && !s.keyHeld && !s.keyBack && !s.keyUp && s.idle > 8) {
          s.demo = true;
          s.demoT = 4.2;
          s.keyMode = false;
        }
      }
      // any shot sighted or in the air eases the clock down on its own; holding goes deeper
      let incoming = s.aim > 0;
      for (const b of s.bullets) if (b.on && !b.passed && !b.hit) incoming = true;
      const target = deep ? SLOW : incoming ? ASSIST : 1;
      s.ts = damp(s.ts, target, s.ts > target ? 4.5 : 7, rdt);
      const k = 1 - (s.ts - SLOW) / (1 - SLOW); // 1 in full bullet time
      const dt = rdt * s.ts;
      if (deep) s.btClock += rdt;
      else s.btClock = damp(s.btClock, 0, 2, rdt);
      // the camera circles while time is held and settles back after
      s.orbit = damp(s.orbit, deep ? Math.sin(s.btClock * 0.45) * 0.65 : Math.sin(t * 0.2) * 0.08, 2.2, rdt);

      // lean: pointer, keys, or in the demo whatever keeps him clear
      if (s.demo) {
        s.leanTarget = demoLean(s, deep);
      } else if (s.keyMode) {
        s.leanTarget = s.keyBack ? 1 : s.keyUp ? 0 : 0.12;
      }
      // his reflexes run faster than the world: lean follows in real time
      s.lean = damp(s.lean, s.leanTarget, 9, rdt);
      pose(s, t * lerp(1, 0.25, k));
      s.guide = damp(s.guide, !s.demo && s.idle < 3.5 ? 1 : 0, 4, rdt);

      // the Agent waits for the air to clear, sights along a laser, then fires a burst
      if (s.aim === 0) {
        if (!incoming) s.fireT -= rdt;
        if (s.fireT <= 0) {
          s.aim = 0.001;
          // anywhere from the head to the belly of a man standing tall; the full bend always clears
          s.aimY = s.gy - rand(148, 204) * u;
          const bus = s.touched ? env.audio() : null;
          if (bus) {
            noise(bus, { duration: 0.05, gain: 0.07, freq: 3200, q: 0.5, type: 'highpass' });
            tone(bus, 1800, { type: 'square', attack: 0.002, decay: 0.03, gain: 0.015, delay: 0.07 });
          }
        }
      } else if (s.aim < 1) {
        s.aim = Math.min(1, s.aim + rdt / AIM_TIME);
        if (s.aim >= 1) {
          s.burst = 2 + ((Math.random() * 2) | 0);
          s.fireT = 0;
        }
      } else {
        s.fireT -= dt;
        if (s.fireT <= 0 && s.burst > 0) {
          spawnBullet(s);
          s.burst -= 1;
          s.fireT = 0.2;
          const bus = s.touched ? env.audio() : null;
          if (bus) {
            if (k < 0.5) {
              noise(bus, { duration: 0.12, gain: 0.16, freq: 1600, q: 0.7 });
              tone(bus, 140, { type: 'square', attack: 0.002, decay: 0.08, gain: 0.05, glideTo: 60 });
            } else {
              tone(bus, 70, { type: 'sine', attack: 0.01, decay: 0.8, gain: 0.12, glideTo: 38 });
              noise(bus, { duration: 0.5, gain: 0.06, freq: 300, q: 0.7, type: 'lowpass' });
            }
          }
          if (s.burst <= 0) {
            s.aim = 0;
            s.fireT = rand(0.55, 0.95);
          }
        }
      }
      s.muzzle = Math.max(0, s.muzzle - dt * 14);
      s.recoil = Math.max(0, s.recoil - dt * 8);

      const circles = hitCircles;
      bodyCircles(s, circles);
      let backEdge = -1e9;
      for (let c = 0; c < 9; c += 3) backEdge = Math.max(backEdge, circles[c] + circles[c + 2]);

      for (const b of s.bullets) {
        if (!b.on) continue;
        const sx = b.vx * dt;
        const sy = b.vy * dt;
        b.x += sx;
        b.y += sy;
        b.spin += dt * 60;
        const moved = Math.hypot(sx, sy);
        b.dist += moved;
        // rings of rippled air behind the bullet
        const gap = 13 * u;
        while (b.dist > gap) {
          b.dist -= gap;
          const r = s.rings[s.ringNext];
          s.ringNext = (s.ringNext + 1) % MAX_RINGS;
          const back = b.dist / (moved || 1);
          r.x = b.x - sx * back;
          r.y = b.y - sy * back;
          r.a = Math.atan2(b.vy, b.vx);
          r.age = 0;
          r.max = 1.4;
        }
        if (!b.hit && !b.passed) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          b.threat = rayClear(circles, b.x, b.y, b.vx / sp, b.vy / sp) < 2 * u;
          for (let c = 0; c < 9; c += 3) {
            const d = Math.hypot(b.x - circles[c], b.y - circles[c + 1]) - circles[c + 2];
            if (d < b.minD) {
              b.minD = d;
              b.cx = b.x;
              b.cy = b.y;
            }
            if (d < 0) {
              b.hit = true;
              b.threat = false;
              if (!env.reducedMotion) {
                s.hitStop = 0.09;
                s.shake = 1;
              }
              s.hitFlash = 1;
              s.pipHit = 1;
              s.streak = 0;
              for (let q = 0; q < 26; q++) spark(s, b.x, b.y, 380 * u);
              const bus = s.touched ? env.audio() : null;
              if (bus) {
                noise(bus, { duration: 0.18, gain: 0.2, freq: 900, q: 0.8 });
                tone(bus, 90, { type: 'triangle', attack: 0.004, decay: 0.3, gain: 0.12, glideTo: 45 });
              }
              b.vy += rand(-300, 300) * u;
              break;
            }
          }
          if (!b.hit && b.x > backEdge + 6 * u) {
            // clean dodge: the slug tears a ripple out of the air where it passed closest
            b.passed = true;
            b.threat = false;
            s.streak += 1;
            s.pip = 1;
            const close = b.minD < 24 * u;
            wave(s, b.cx, b.cy, close ? 1.25 : 0.75);
            s.flash = Math.max(s.flash, close ? 0.6 : 0.3);
            s.gust = Math.min(1, s.gust + (close ? 0.9 : 0.5));
            const bus = s.touched ? env.audio() : null;
            if (bus) {
              noise(bus, { duration: close ? 0.5 : 0.32, gain: close ? 0.12 : 0.07, freq: 1500, q: 1.4 });
              tone(bus, close ? 1300 : 1000, {
                type: 'sine',
                attack: 0.02,
                decay: close ? 0.6 : 0.4,
                gain: close ? 0.05 : 0.03,
                glideTo: 240,
              });
            }
          }
        }
        if (b.x > env.w + 80 || b.y < -80 || b.y > env.h + 80) {
          b.on = false;
          b.passed = true;
        }
      }
      const ringRate = lerp(2.4, 0.55, k);
      for (const r of s.rings) if (r.age < r.max) r.age += rdt * ringRate;
      const waveRate = lerp(1.6, 0.7, k);
      for (const wv of s.waves) if (wv.age < 1) wv.age += rdt * waveRate;
      s.pip = Math.max(0, s.pip - rdt * 1.8);
      s.pipHit = Math.max(0, s.pipHit - rdt * 1.2);

      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        p.life -= lerp(rdt, dt * 3, k);
        const sd = lerp(rdt, dt * 3, k);
        p.vy += 700 * u * sd;
        p.x += p.vx * sd;
        p.y += p.vy * sd;
      }
      for (const sh of s.shells) {
        if (sh.life <= 0) continue;
        sh.life -= dt;
        sh.vy += 900 * u * dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        sh.r += sh.vr * dt;
        if (sh.y > s.ay - 2 * u && sh.vy > 0) {
          sh.y = s.ay - 2 * u;
          sh.vy *= -0.35;
          sh.vx *= 0.6;
        }
      }
      // dust motes hang in the air
      const m = s.motes;
      for (let i = 0; i < m.length; i += 3) {
        m[i + 1] += dt * (0.01 + m[i + 2] * 0.02);
        if (m[i + 1] > 1) m[i + 1] -= 1;
      }

      s.gust = Math.max(0, s.gust - rdt * 1.5);
      const flare = clamp(0.25 + k * 0.6 + s.gust + s.lean * 0.2, 0, 1.3);
      const ct = t * lerp(1, 0.3, k);
      stepChain(s, s.back, 0, rdt, ct, flare, k);
      stepChain(s, s.front, 1, rdt, ct, flare * 0.8, k);

      s.rain.update(dt * lerp(1, 5, k));
      s.shake = Math.max(0, s.shake - rdt * 2.5);
      s.flash = Math.max(0, s.flash - rdt * 2);
      s.hitFlash = Math.max(0, s.hitFlash - rdt * 2.5);
      // heartbeat under deep bullet time
      if (k > 0.9 && s.touched) {
        s.beat -= rdt;
        if (s.beat <= 0) {
          s.beat = 0.85;
          const bus = env.audio();
          if (bus) {
            tone(bus, 52, { type: 'sine', attack: 0.01, decay: 0.18, gain: 0.14 });
            tone(bus, 46, { type: 'sine', attack: 0.01, decay: 0.2, gain: 0.1, delay: 0.2 });
          }
        }
      } else s.beat = 0.2;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      const k = 1 - (s.ts - SLOW) / (1 - SLOW);
      const o = s.orbit;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#020806';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const amp = s.shake * s.shake * 10 * u;
      if (amp > 0.05) ctx.translate(Math.sin(t * 97) * amp, Math.cos(t * 83) * amp * 0.7);

      if (s.sky) ctx.drawImage(s.sky, 0, 0, w, h);
      // code in the sky, the world under the world
      ctx.globalCompositeOperation = 'lighter';
      skyEdge = s.edge;
      s.rain.draw(ctx, s.atlas, o * -20 * u, 0, 0.05 + k * 0.12, skyMask);
      ctx.globalCompositeOperation = 'source-over';

      // skyline layers slide against each other as the camera swings
      const M = s.margin;
      if (s.far) ctx.drawImage(s.far, -M - o * 40 * u, 0, w + M * 2, h);
      if (s.mid) ctx.drawImage(s.mid, -M - o * 95 * u, 0, w + M * 2, h);
      // haze rising off the streets, so he reads dark against light
      if (s.haze) {
        ctx.fillStyle = s.haze;
        ctx.fillRect(0, s.edge - 150 * u, w, 150 * u);
      }

      drawRoof(ctx, s, w, h, o);
      drawAgent(ctx, s, o, t);

      // shells
      ctx.fillStyle = '#c9b46a';
      for (const sh of s.shells) {
        if (sh.life <= 0) continue;
        ctx.save();
        ctx.translate(sh.x - o * 70 * u, sh.y);
        ctx.rotate(sh.r);
        ctx.fillRect(-3 * u, -1.3 * u, 6 * u, 2.6 * u);
        ctx.restore();
      }

      // floor glow and shadow under Neo
      const fx = s.nx - o * 20 * u;
      const pool = ctx.createRadialGradient(fx, s.gy, 0, fx, s.gy, 170 * u);
      pool.addColorStop(0, `rgba(80,255,140,${0.08 + k * 0.1})`);
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(fx - 170 * u, s.gy - 170 * u, 340 * u, 340 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(fx + 20 * u, s.gy + 2 * u, 90 * u, 8 * u, 0, 0, TAU);
      ctx.fill();

      // Neo, turned a touch by the orbit
      ctx.save();
      ctx.translate(fx, 0);
      ctx.scale(Math.cos(o * 0.55), 1);
      ctx.translate(-s.nx, 0);
      drawNeo(ctx, s, t, k);
      drawBullets(ctx, s, k);

      // sparks
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, 1.5 * u);
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life / p.max;
        ctx.strokeStyle = '#f4ffd8';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      // motes caught in the light, frozen in slow motion
      const m = s.motes;
      ctx.fillStyle = '#b6ffc9';
      for (let i = 0; i < m.length; i += 3) {
        const x = ((m[i] * (w + 200) - o * 260 * u * (0.5 + m[i + 2])) % (w + 200) + w + 200) % (w + 200) - 100;
        const y = m[i + 1] * h;
        ctx.globalAlpha = (0.1 + 0.25 * m[i + 2]) * (0.4 + k * 0.6);
        const r = (0.6 + m[i + 2] * 1.6) * u;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      ctx.restore();

      // the grade: bullet time drains the colour into the film's green
      greenGrade(ctx, w, h, 0.25 + k * 0.6);
      if (k > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(20,70,35,${(k * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        // letterbox bars slide in
        const bar = k * h * 0.045;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, bar);
        ctx.fillRect(0, h - bar, w, bar);
      }
      // telegraphs sit over the grade so a red line stays red
      ctx.save();
      if (amp > 0.05) ctx.translate(Math.sin(t * 97) * amp, Math.cos(t * 83) * amp * 0.7);
      ctx.translate(fx, 0);
      ctx.scale(Math.cos(o * 0.55), 1);
      ctx.translate(-s.nx, 0);
      drawTelegraph(ctx, s, w, t);
      ctx.restore();
      if (s.hitFlash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(200,255,210,${(s.hitFlash * s.hitFlash * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      drawPips(ctx, s, w, h, k);
    },
    onPointerDown: (s, env, x, y) => {
      s.held = true;
      takeOver(s);
      steer(s, x, y);
      setHeld(s, env, true);
    },
    onPointerMove: (s, env, x, y) => {
      // hovering steers on desktop; on touch the finger steers while it is down
      if (!env.interactive) return;
      takeOver(s);
      steer(s, x, y);
    },
    onPointerUp: (s, env) => {
      s.held = false;
      setHeld(s, env, false);
    },
    onKey: (s, env, e, down) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.repeat) return true;
        s.keyHeld = down;
        setHeld(s, env, down);
        return true;
      }
      const key = e.key.toLowerCase();
      if (key === 's' || key === 'd' || key === 'w' || key === 'a') {
        if (key === 's' || key === 'd') s.keyBack = down;
        else s.keyUp = down;
        if (down) {
          takeOver(s);
          s.keyMode = true;
          s.touched = true;
        }
        env.wake(3000);
        return true;
      }
      return false;
    },
    dispose: (s) => {
      s.atlas.canvas.width = 0;
      if (s.sky) s.sky.width = 0;
      if (s.far) s.far.width = 0;
      if (s.mid) s.mid.width = 0;
    },
  });

let skyEdge = 1;
const skyMask = (_x: number, y: number) => clamp(1.2 - y / skyEdge, 0, 1);

function takeOver(s: State) {
  if (s.demo) s.streak = 0;
  s.demo = false;
  s.idle = 0;
}

/**
 * Neo's head chases the pointer: the pointer is projected onto the arc his head travels
 * as he leans, so down and back bends him over and up and forward stands him tall.
 * The ends are padded so the full pose is easy to reach and hold.
 */
function steer(s: State, x: number, y: number) {
  s.keyMode = false;
  const u = s.s;
  // undo the camera turn so the head lands under the pointer even mid orbit
  const fx = s.nx - s.orbit * 20 * u;
  const wx = s.nx + (x - fx) / Math.max(0.3, Math.cos(s.orbit * 0.55));
  headAt(s, 0);
  const ax = tmp[0];
  const ay = tmp[1];
  headAt(s, 1);
  const dx = tmp[0] - ax;
  const dy = tmp[1] - ay;
  const along = ((wx - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1);
  s.leanTarget = clamp((along - 0.08) / 0.8, 0, 1);
}

/** The demo picks a lean that clears every incoming shot, preferring the full bend */
function demoLean(s: State, deep: boolean) {
  let any = false;
  for (const b of s.bullets) if (b.on && !b.passed && !b.hit) any = true;
  if (!any && s.aim <= 0) return deep ? 0.95 : 0.25;
  for (const L of DEMO_LEANS) {
    circlesAt(s, L, testCircles);
    let ok = true;
    for (const b of s.bullets) {
      if (!b.on || b.passed || b.hit) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if (rayClear(testCircles, b.x, b.y, b.vx / sp, b.vy / sp) < 6 * s.s) ok = false;
    }
    if (ok) return L;
  }
  return 0.95;
}
const DEMO_LEANS = [0.95, 0.1, 0.6];

function drawRoof(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, o: number) {
  const u = s.s;
  const edge = s.edge;
  // parapet wall along the far edge
  ctx.fillStyle = '#0b1a15';
  ctx.fillRect(-20, edge - 10 * u, w + 40, 12 * u);
  ctx.fillStyle = 'rgba(140,255,190,0.18)';
  ctx.fillRect(-20, edge - 10 * u, w + 40, 1.2 * u);
  ctx.fillStyle = s.floorG ?? '#07120e';
  ctx.fillRect(-20, edge + 2 * u, w + 40, h - edge);
  // perspective seams swing with the camera
  const vpx = w * 0.5 - o * w * 0.9;
  const vpy = edge - 260 * u;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20, edge + 2 * u, w + 40, h - edge);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,230,170,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -14; i <= 14; i++) {
    const bx = w * 0.5 + i * 90 * u - o * w * 0.25;
    ctx.moveTo(vpx, vpy);
    ctx.lineTo(bx + (bx - vpx) * 1.5, h + (h - vpy) * 1.5);
  }
  for (let i = 0; i < 7; i++) {
    const q = i / 7;
    const y = edge + (h - edge) * q * q * 1.1 + 6 * u;
    ctx.moveTo(-20, y);
    ctx.lineTo(w + 20, y);
  }
  ctx.stroke();
  ctx.restore();
  // a vent stack and a stairwell hut for depth
  const hx = w * 0.9 - o * 170 * u;
  ctx.fillStyle = '#050d0a';
  ctx.fillRect(hx, edge - 70 * u, 120 * u, 76 * u);
  ctx.fillStyle = 'rgba(140,255,190,0.16)';
  ctx.fillRect(hx, edge - 70 * u, 120 * u, 1.5 * u);
  ctx.fillStyle = 'rgba(200,255,210,0.1)';
  ctx.fillRect(hx + 22 * u, edge - 50 * u, 26 * u, 52 * u);
  const vx = w * 0.3 - o * 120 * u;
  ctx.fillStyle = '#06100c';
  ctx.fillRect(vx, edge - 26 * u, 34 * u, 32 * u);
  ctx.fillRect(vx + 12 * u, edge - 48 * u, 10 * u, 22 * u);
}

function drawAgent(ctx: CanvasRenderingContext2D, s: State, o: number, t: number) {
  const u = s.s * 0.8;
  const x = s.ax - o * 70 * s.s;
  const y = s.ay;
  const rc = s.recoil * 6 * u;
  ctx.save();
  ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 1 * u, 40 * u, 5 * u, 0, 0, TAU);
  ctx.fill();
  const breathe = Math.sin(t * 1.4) * 0.6 * u;
  const trace = () => {
    // legs
    limb(ctx, -6 * u, -96 * u, -14 * u, 0, 8 * u, 6 * u);
    limb(ctx, 6 * u, -96 * u, 12 * u, 0, 8 * u, 6 * u);
    // suit jacket
    poly(ctx, [-19 * u, -160 * u + breathe, 19 * u, -160 * u + breathe, 17 * u, -88 * u, -17 * u, -88 * u]);
    // head
    ctx.moveTo(10 * u, -176 * u);
    ctx.ellipse(1 * u, -176 * u, 9.5 * u, 11.5 * u, 0, 0, TAU, true);
    // gun arm straight out at Neo
    limb(ctx, 12 * u, -154 * u, 60 * u - rc, -126 * u - rc * 0.6, 6.5 * u, 5 * u);
    // off hand supporting
    limb(ctx, -10 * u, -150 * u, 26 * u, -120 * u, 6 * u, 5 * u);
  };
  rimFill(ctx, trace, '#07100d', 'rgba(150,255,190,0.55)', 'rgba(40,110,70,0.9)', 2 * u, -1.5 * u);
  // white shirt and dark tie
  ctx.fillStyle = '#b7c9bd';
  ctx.beginPath();
  poly(ctx, [-5 * u, -160 * u, 5 * u, -160 * u, 0, -140 * u]);
  ctx.fill();
  ctx.fillStyle = '#050807';
  ctx.fillRect(-1.3 * u, -158 * u, 2.6 * u, 22 * u);
  // face, sunglasses and earpiece
  ctx.fillStyle = '#6f7d72';
  ctx.beginPath();
  ctx.ellipse(3 * u, -173 * u, 6.5 * u, 8.5 * u, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#020403';
  ctx.fillRect(1 * u, -179 * u, 10 * u, 3.4 * u);
  ctx.fillStyle = 'rgba(170,255,200,0.7)';
  ctx.fillRect(6 * u, -178.5 * u, 3 * u, 1 * u);
  ctx.strokeStyle = 'rgba(190,230,200,0.5)';
  ctx.lineWidth = 0.8 * u;
  ctx.beginPath();
  ctx.moveTo(-4 * u, -172 * u);
  ctx.quadraticCurveTo(-6 * u, -164 * u, -3 * u, -160 * u);
  ctx.stroke();
  // pistol
  ctx.fillStyle = '#121615';
  ctx.save();
  ctx.translate(60 * u - rc, -126 * u - rc * 0.6);
  ctx.rotate(0.12);
  ctx.fillRect(-2 * u, -4 * u, 16 * u, 5 * u);
  ctx.fillRect(-2 * u, 0, 4 * u, 8 * u);
  ctx.restore();
  ctx.restore();

  // muzzle flash
  if (s.muzzle > 0.02) {
    const mx = x + 78 * u - rc;
    const my = y - 124 * u;
    const r = (20 + s.muzzle * 26) * u;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 2);
    g.addColorStop(0, `rgba(255,250,220,${s.muzzle})`);
    g.addColorStop(0.3, `rgba(255,190,90,${s.muzzle * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - r * 2, my - r * 2, r * 4, r * 4);
    ctx.fillStyle = `rgba(255,240,200,${s.muzzle})`;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rr = i % 2 ? r * 0.35 : r * (i === 0 ? 1.3 : 0.8);
      ctx.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr * 0.6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function coatTrace(ctx: CanvasRenderingContext2D, s: State) {
  const u = s.s;
  const j = s.j;
  const th = j[SPINE];
  const nx = Math.cos(th);
  const ny = Math.sin(th);
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  const b = s.back;
  const f = s.front;
  const pts = coatPts;
  let n = 0;
  const push = (x: number, y: number) => {
    pts[n++] = x;
    pts[n++] = y;
  };
  // collar, the back of the shoulders, then the long panel hanging to the hem
  push(j[SHO] - nx * 6 * u + dx * 9 * u, j[SHO + 1] - ny * 6 * u + dy * 9 * u);
  push(j[SHO] + nx * 12 * u + dx * 8 * u, j[SHO + 1] + ny * 12 * u + dy * 8 * u);
  for (let i = 0; i <= LINKS; i++) push(b.x[i] + (i / LINKS) * 8 * u, b.y[i]);
  // a hem that curls rather than a straight cut
  const ex = b.x[LINKS] + 8 * u;
  const ey = b.y[LINKS];
  const fx = f.x[LINKS] - 5 * u;
  const fy = f.y[LINKS];
  push(lerp(ex, fx, 0.33), lerp(ey, fy, 0.33) - 5 * u);
  push(lerp(ex, fx, 0.66), lerp(ey, fy, 0.66) + 2 * u);
  for (let i = LINKS; i >= 1; i--) push(f.x[i] - (i / LINKS) * 5 * u, f.y[i]);
  push(j[HIP] - nx * 17 * u, j[HIP + 1] - ny * 17 * u);
  push(j[SHO] - nx * 17 * u, j[SHO + 1] - ny * 17 * u);
  // smooth through the points
  const count = n / 2;
  let area = 0;
  for (let i = 0; i < count; i++) {
    const q = (i + 1) % count;
    area += pts[i * 2] * pts[q * 2 + 1] - pts[q * 2] * pts[i * 2 + 1];
  }
  if (area > 0) {
    for (let i = 0; i < count / 2; i++) {
      const a = i * 2;
      const c = (count - 1 - i) * 2;
      const tx = pts[a];
      const ty = pts[a + 1];
      pts[a] = pts[c];
      pts[a + 1] = pts[c + 1];
      pts[c] = tx;
      pts[c + 1] = ty;
    }
  }
  ctx.moveTo((pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
  for (let i = 1; i <= count; i++) {
    const a = (i % count) * 2;
    const c = ((i + 1) % count) * 2;
    ctx.quadraticCurveTo(pts[a], pts[a + 1], (pts[a] + pts[c]) / 2, (pts[a + 1] + pts[c + 1]) / 2);
  }
  ctx.closePath();
}
const coatPts = new Float32Array(64);

function drawNeo(ctx: CanvasRenderingContext2D, s: State, t: number, k: number) {
  const u = s.s;
  const j = s.j;
  const th = j[SPINE];
  const rim = `rgba(150,255,185,${(0.55 + k * 0.35).toFixed(3)})`;
  const back = 'rgba(30,90,55,0.95)';
  const rx = -2.4 * u;
  const ry = -2.2 * u;

  // far arm, behind everything
  rimFill(
    ctx,
    () => {
      limb(ctx, j[SHO], j[SHO + 1], j[ELB1], j[ELB1 + 1], 8.5 * u, 7 * u);
      limb(ctx, j[ELB1], j[ELB1 + 1], j[HAND1], j[HAND1 + 1], 7 * u, 5.5 * u);
    },
    '#040706',
    'rgba(90,200,130,0.6)',
    'rgba(20,60,35,0.9)',
    rx,
    ry
  );

  // the coat, leather catching a green sheen
  const sheen = ctx.createLinearGradient(j[SHO], j[SHO + 1], s.back.x[LINKS], s.back.y[LINKS]);
  sheen.addColorStop(0, '#0b1411');
  sheen.addColorStop(0.45, '#142520');
  sheen.addColorStop(1, '#050908');
  rimFill(ctx, () => coatTrace(ctx, s), sheen, rim, back, rx * 1.2, ry * 1.2);
  // long folds catching the light down the leather
  const bc = s.back;
  const fc = s.front;
  ctx.lineCap = 'round';
  for (let q = 1; q <= 3; q++) {
    const f = q / 4;
    ctx.strokeStyle = q === 2 ? 'rgba(0,0,0,0.35)' : 'rgba(150,255,190,0.13)';
    ctx.lineWidth = (q === 2 ? 3 : 1.6) * u;
    ctx.beginPath();
    ctx.moveTo(lerp(bc.x[1], fc.x[1], f), lerp(bc.y[1], fc.y[1], f));
    ctx.quadraticCurveTo(
      lerp(bc.x[4], fc.x[4], f) + Math.sin(t * 2 + q) * 3 * u,
      lerp(bc.y[4], fc.y[4], f),
      lerp(bc.x[LINKS], fc.x[LINKS], f),
      lerp(bc.y[LINKS], fc.y[LINKS], f) - 4 * u
    );
    ctx.stroke();
  }
  // legs and boots
  rimFill(
    ctx,
    () => {
      limb(ctx, j[HIP], j[HIP + 1], j[KNEE2], j[KNEE2 + 1], 10 * u, 8.5 * u);
      limb(ctx, j[KNEE2], j[KNEE2 + 1], j[FOOT2], j[FOOT2 + 1] - 5 * u, 8.5 * u, 6 * u);
      limb(ctx, j[HIP], j[HIP + 1], j[KNEE1], j[KNEE1 + 1], 10.5 * u, 9 * u);
      limb(ctx, j[KNEE1], j[KNEE1 + 1], j[FOOT1], j[FOOT1 + 1] - 5 * u, 9 * u, 6 * u);
      poly(ctx, [
        j[FOOT1] - 14 * u, j[FOOT1 + 1],
        j[FOOT1] + 6 * u, j[FOOT1 + 1],
        j[FOOT1] + 6 * u, j[FOOT1 + 1] - 11 * u,
        j[FOOT1] - 6 * u, j[FOOT1 + 1] - 9 * u,
      ]);
      poly(ctx, [
        j[FOOT2] - 13 * u, j[FOOT2 + 1],
        j[FOOT2] + 7 * u, j[FOOT2 + 1],
        j[FOOT2] + 6 * u, j[FOOT2 + 1] - 11 * u,
        j[FOOT2] - 5 * u, j[FOOT2 + 1] - 9 * u,
      ]);
    },
    '#060a08',
    rim,
    back,
    rx,
    ry
  );

  // torso: black vest under the coat, with the coat's front panel and collar over it
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  const nx = Math.cos(th);
  const ny = Math.sin(th);
  rimFill(
    ctx,
    () => {
      poly(ctx, [
        j[HIP] - nx * 16 * u, j[HIP + 1] - ny * 16 * u,
        j[HIP] + nx * 18 * u, j[HIP + 1] + ny * 18 * u,
        j[SHO] + nx * 20 * u, j[SHO + 1] + ny * 20 * u,
        j[SHO] - nx * 16 * u, j[SHO + 1] - ny * 16 * u,
      ]);
      limb(ctx, j[SHO], j[SHO + 1], j[NECK], j[NECK + 1], 7 * u, 6.5 * u);
    },
    '#090f0d',
    rim,
    back,
    rx,
    ry
  );
  // coat lapel and front edge, a long highlight down the leather
  ctx.strokeStyle = 'rgba(170,255,200,0.28)';
  ctx.lineWidth = 1.3 * u;
  ctx.beginPath();
  ctx.moveTo(j[SHO] - nx * 11 * u + dx * 5 * u, j[SHO + 1] - ny * 11 * u + dy * 5 * u);
  ctx.quadraticCurveTo(
    j[HIP] - nx * 16 * u + dx * 30 * u,
    j[HIP + 1] - ny * 16 * u + dy * 30 * u,
    s.front.x[2],
    s.front.y[2]
  );
  ctx.stroke();
  // high collar
  ctx.fillStyle = '#0d1714';
  ctx.beginPath();
  poly(ctx, [
    j[SHO] + nx * 10 * u, j[SHO + 1] + ny * 10 * u,
    j[SHO] + nx * 8 * u + dx * 13 * u, j[SHO + 1] + ny * 8 * u + dy * 13 * u,
    j[SHO] - nx * 3 * u + dx * 7 * u, j[SHO + 1] - ny * 3 * u + dy * 7 * u,
  ]);
  ctx.fill();

  // head, thrown back
  const ha = th + lerp(0.08, -0.05, s.lean);
  const hx = j[HEAD];
  const hy = j[HEAD + 1];
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ha);
  // face profile toward -x (he faces the Agent)
  const face = () => {
    ctx.moveTo(10 * u, 0);
    ctx.ellipse(0, 0, 10 * u, 12.5 * u, 0, 0, TAU, true);
    // jaw and chin
    poly(ctx, [-9.5 * u, 2 * u, -7 * u, 11 * u, 2 * u, 13 * u, 4 * u, 4 * u]);
  };
  rimFill(ctx, face, '#9a9a88', 'rgba(230,255,225,0.95)', '#4d584b', -1.8 * u, -1.2 * u);
  // slicked short hair
  ctx.fillStyle = '#050706';
  ctx.beginPath();
  ctx.ellipse(1.5 * u, -3.5 * u, 10.5 * u, 10 * u, 0.2, Math.PI * 0.95, Math.PI * 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(4 * u, -4 * u, 6.5 * u, 10 * u);
  // the sunglasses: narrow black ovals with a green glint
  ctx.fillStyle = '#010202';
  ctx.beginPath();
  ctx.ellipse(-6.5 * u, -1 * u, 4.6 * u, 2.4 * u, -0.1, 0, TAU);
  ctx.fill();
  ctx.fillRect(-6 * u, -2 * u, 10 * u, 1.2 * u);
  const glint = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.fillStyle = `rgba(190,255,210,${(0.5 + glint * 0.5).toFixed(3)})`;
  ctx.fillRect(-9 * u, -2.2 * u, 3.2 * u, 0.9 * u);
  // ear shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3 * u, 1 * u, 2 * u, 3 * u, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // near arm, flung up
  rimFill(
    ctx,
    () => {
      limb(ctx, j[SHO], j[SHO + 1], j[ELB2], j[ELB2 + 1], 9 * u, 7.5 * u);
      limb(ctx, j[ELB2], j[ELB2 + 1], j[HAND2], j[HAND2 + 1], 7.5 * u, 5.5 * u);
    },
    '#0a1210',
    rim,
    back,
    rx,
    ry
  );
  ctx.fillStyle = '#8f9884';
  ctx.beginPath();
  ctx.arc(j[HAND2], j[HAND2 + 1], 4.4 * u, 0, TAU);
  ctx.arc(j[HAND1], j[HAND1 + 1], 4 * u, 0, TAU);
  ctx.fill();
}

function drawBullets(ctx: CanvasRenderingContext2D, s: State, k: number) {
  const u = s.s;
  ctx.globalCompositeOperation = 'lighter';
  // rippled air: flattened rings standing across each bullet's path
  ctx.lineWidth = Math.max(0.8, 1.1 * u);
  for (const r of s.rings) {
    if (r.age >= r.max) continue;
    const q = r.age / r.max;
    const rad = (4 + q * 26) * u;
    const a = (1 - q) * (1 - q) * (0.18 + k * 0.5);
    if (a < 0.01) continue;
    ctx.strokeStyle = `rgba(170,255,200,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rad * 0.28, rad, r.a, 0, TAU);
    ctx.stroke();
  }
  // dodge ripples: the air shoved aside where a slug just missed him
  for (const wv of s.waves) {
    if (wv.age >= 1) continue;
    const q = wv.age;
    const e = 1 - (1 - q) * (1 - q);
    for (let i = 0; i < 3; i++) {
      const qi = clamp(e - i * 0.12, 0, 1);
      if (qi <= 0) continue;
      const rad = (6 + qi * 62 * wv.str) * u;
      const a = (1 - q) * (1 - q) * (0.75 - i * 0.2) * Math.min(1, wv.str);
      ctx.strokeStyle = `rgba(205,255,220,${a.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, (2.4 - i * 0.6) * u * (1 - q * 0.6));
      ctx.beginPath();
      ctx.ellipse(wv.x, wv.y, rad, rad * 0.62, 0, 0, TAU);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(wv.x, wv.y, 0, wv.x, wv.y, 30 * u * wv.str);
    glow.addColorStop(0, `rgba(220,255,230,${((1 - q) * 0.35 * wv.str).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(wv.x - 30 * u * wv.str, wv.y - 30 * u * wv.str, 60 * u * wv.str, 60 * u * wv.str);
  }
  for (const b of s.bullets) {
    if (!b.on) continue;
    const a = Math.atan2(b.vy, b.vx);
    // streak in real time, a clean slug with a hot wake in slow motion
    const len = lerp(160, 34, k) * u;
    const g = ctx.createLinearGradient(b.x, b.y, b.x - Math.cos(a) * len, b.y - Math.sin(a) * len);
    g.addColorStop(0, 'rgba(230,255,230,0.9)');
    g.addColorStop(1, 'rgba(60,255,120,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = lerp(2, 3.2, k) * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len);
    ctx.stroke();
    const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 18 * u);
    glow.addColorStop(0, 'rgba(200,255,210,0.45)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(b.x - 18 * u, b.y - 18 * u, 36 * u, 36 * u);
    // the slug itself, brass with a spin glint
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = '#6d6a4c';
    ctx.beginPath();
    ctx.moveTo(-6 * u, -2.2 * u);
    ctx.lineTo(3 * u, -2.2 * u);
    ctx.quadraticCurveTo(8 * u, 0, 3 * u, 2.2 * u);
    ctx.lineTo(-6 * u, 2.2 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,250,220,${(0.5 + 0.5 * Math.sin(b.spin)).toFixed(3)})`;
    ctx.fillRect(-5 * u, -1.6 * u, 8 * u, 0.9 * u);
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
  }
  ctx.globalCompositeOperation = 'source-over';
}

const SAFE = '200,255,215';
const RED = '255,84,60';

/**
 * Over the grade: the Agent's sighting laser while he aims, each live bullet's predicted
 * path (pale when it will miss the pose he holds now, red when it is on target, with a
 * pulsing mark where it would land), and a faint guide for where the pointer puts his head.
 */
function drawTelegraph(ctx: CanvasRenderingContext2D, s: State, w: number, t: number) {
  const u = s.s;
  const c = hitCircles;
  bodyCircles(s, c);
  const far = w + 200 * u;
  ctx.lineCap = 'round';
  const pulse = 0.5 + 0.5 * Math.sin(t * 9);

  const marker = (x: number, y: number, a: number) => {
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${RED},${(a * (0.5 + pulse * 0.5)).toFixed(3)})`;
    ctx.lineWidth = 1.6 * u;
    const r = (7 + pulse * 3) * u;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + Math.PI / 4;
      ctx.moveTo(x + Math.cos(ang) * r * 1.3, y + Math.sin(ang) * r * 1.3);
      ctx.lineTo(x + Math.cos(ang) * r * 1.9, y + Math.sin(ang) * r * 1.9);
    }
    ctx.stroke();
  };

  // the sighting laser, firming up as he takes aim
  if (s.aim > 0) {
    muzzle(s);
    const px = tmp2[0];
    const py = tmp2[1];
    let dx = s.nx + 60 * u - px;
    let dy = s.aimY - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const threat = rayClear(c, px, py, dx, dy) < 2 * u;
    const ix = tmp[0];
    const iy = tmp[1];
    const a = Math.min(1, s.aim * 1.6) * 0.85;
    const col = threat ? RED : SAFE;
    const reach = (far - px) / Math.max(0.2, dx);
    const g = ctx.createLinearGradient(px, py, px + dx * reach, py + dy * reach);
    g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
    g.addColorStop(0.6, `rgba(${col},${(a * 0.7).toFixed(3)})`);
    g.addColorStop(1, `rgba(${col},${(a * 0.1).toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([5 * u, 5 * u]);
    ctx.lineDashOffset = -t * 60 * u;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + dx * reach, py + dy * reach);
    ctx.stroke();
    if (threat) marker(ix, iy, a * 1.3);
  }

  // predicted paths for bullets still on their way
  for (const b of s.bullets) {
    if (!b.on || b.passed || b.hit) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const dx = b.vx / sp;
    const dy = b.vy / sp;
    const clear = rayClear(c, b.x, b.y, dx, dy);
    const threat = clear < 2 * u;
    const ix = tmp[0];
    const iy = tmp[1];
    const col = threat ? RED : SAFE;
    const reach = Math.max(0, (far - b.x) / Math.max(0.2, dx));
    const g = ctx.createLinearGradient(b.x, b.y, b.x + dx * reach, b.y + dy * reach);
    g.addColorStop(0, `rgba(${col},${threat ? 0.75 : 0.45})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = (threat ? 1.8 : 1.2) * u;
    ctx.setLineDash([7 * u, 6 * u]);
    ctx.lineDashOffset = -t * 40 * u;
    ctx.beginPath();
    ctx.moveTo(b.x + dx * 10 * u, b.y + dy * 10 * u);
    ctx.lineTo(b.x + dx * reach, b.y + dy * reach);
    ctx.stroke();
    // a halo on the slug in the same colour, so it reads at a glance
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${col},${threat ? 0.8 : 0.4})`;
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.arc(b.x, b.y, (threat ? 11 + pulse * 2 : 9) * u, 0, TAU);
    ctx.stroke();
    if (threat) marker(ix, iy, 1);
  }
  ctx.setLineDash([]);

  // the head guide: a soft ring where the pointer is taking his head
  if (s.guide > 0.02) {
    headAt(s, s.leanTarget);
    const away = Math.hypot(tmp[0] - s.j[HEAD], tmp[1] - s.j[HEAD + 1]);
    const a = s.guide * clamp(away / (14 * u), 0.25, 1) * 0.4;
    ctx.strokeStyle = `rgba(${SAFE},${a.toFixed(3)})`;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.arc(tmp[0], tmp[1], 15 * u, 0, TAU);
    ctx.stroke();
  }
}

/** A row of small marks along the top: one lights per clean dodge, a hit clears them */
function drawPips(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, k: number) {
  if (s.demo || (!s.touched && s.streak === 0 && s.pipHit <= 0)) return;
  const u = s.s;
  const size = 3.2 * u;
  const gap = 12 * u;
  const y = k * h * 0.045 + 16 * u;
  const x0 = w / 2 - ((PIPS - 1) * gap) / 2;
  const lit = s.streak === 0 ? 0 : ((s.streak - 1) % PIPS) + 1;
  const lap = Math.floor(Math.max(0, s.streak - 1) / PIPS);
  for (let i = 0; i < PIPS; i++) {
    const x = x0 + i * gap;
    const on = i < lit;
    const fresh = on && i === lit - 1 ? s.pip : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    const r = size * (1 + fresh * 0.8);
    if (on) {
      ctx.fillStyle = lap > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(170,255,200,0.9)';
      ctx.shadowColor = 'rgba(120,255,170,0.9)';
      ctx.shadowBlur = (4 + fresh * 10) * u;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    } else {
      ctx.strokeStyle = s.pipHit > 0 ? `rgba(${RED},${(0.3 + s.pipHit * 0.6).toFixed(3)})` : 'rgba(170,255,200,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
