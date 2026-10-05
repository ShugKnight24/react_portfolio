import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, makePool, shakeX, shakeY, stepPool } from './heroes-kit';
import type { Pool } from './heroes-kit';
import {
  abilityKey,
  backdropLayer,
  depthSort,
  drawAbilityBar,
  drawBackdrop,
  drawHoldRing,
  drawMarker,
  drawMinion,
  gestureDown,
  gestureMove,
  gestureTick,
  gestureUp,
  halt,
  healthBar,
  inked,
  makeGesture,
  makeMarker,
  makeMinion,
  makeMover,
  mixSword,
  moveTo,
  paintRiver,
  place,
  pointerButtons,
  setMarker,
  snap,
  stepMover,
  swordHands,
  turnScale,
  turnToward,
  yasuo,
  yone,
} from './league-kit';
import type { AbilitySlot, Command, Gesture, Marker, Minion, Mover, RiverPalette, SwordPose } from './league-kit';

/**
 * Yasuo, Last Breath: the Unforgiven wades the Rift river at dawn against the red wave, topknot
 * streaming, blue tunic off one shoulder under a steel guard, tan trousers, katana wrapped in
 * wind. Click or tap the water to walk there, click a minion to cut it down. Steel Tempest (Q)
 * thrusts toward the pointer and stacks; the third thrust looses a whirlwind that throws the
 * wave into the air. Wind Wall (W) stops the casters' bolts. Sweeping Blade (E) dashes through
 * a minion, and Q during the dash spins a circle. Last Breath (R) blinks onto everything airborne,
 * cuts through the air and slams it into the water. Across the river his brother Yone watches.
 */

interface Tornado {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hit: number;
}

interface Slash {
  x: number;
  y: number;
  ang: number;
  len: number;
  life: number;
}

interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface State {
  m: Mover;
  g: Gesture;
  ac: AbortController | null;
  lift: number;
  // 0 idle, 1 basic attack, 2 thrust, 3 whirlwind cast, 4 sweeping blade, 5 last breath, 6 wind wall, 7 spin
  act: number;
  pt: number;
  dirX: number;
  dirY: number;
  stacks: number;
  stackGlow: number;
  cdQ: number;
  cdW: number;
  cdE: number;
  atkCd: number;
  atkN: number;
  chase: number;
  buf: Command;
  bufX: number;
  bufY: number;
  bufT: number;
  deny: number;
  hurt: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  eTarget: number;
  eQ: boolean;
  lbX: number;
  lbY: number;
  lbMask: number;
  lbCuts: number;
  tornado: Tornado;
  slashes: Slash[];
  bolts: Bolt[];
  wall: { x: number; y: number; nx: number; ny: number; life: number };
  marker: Marker;
  touched: boolean;
  idle: number;
  autoT: number;
  autoClock: number;
  stop: number;
  shake: number;
  flash: number;
  minions: Minion[];
  air: Float32Array;
  vair: Float32Array;
  held: Uint8Array;
  swing: Float32Array;
  eTag: Float32Array;
  parts: Pool;
  leaves: Float32Array;
  gusts: Float32Array;
  pose: SwordPose;
  cameo: SwordPose;
  u: number;
  top: number;
  bot: number;
  bg: HTMLCanvasElement | null;
  blue: HTMLCanvasElement;
  white: HTMLCanvasElement;
  red: HTMLCanvasElement;
  sun: HTMLCanvasElement;
  vignette: CanvasGradient | null;
  /** ability bar: pop timers and the reused slot records */
  pop: Float32Array;
  slots: AbilitySlot[];
}

type C = CanvasRenderingContext2D;

const MINIONS = 6;
/** Yasuo is drawn this much larger than a minion at the same depth */
const CH = 1.6;
/** ground plane foreshortening: a pixel up the screen is this many pixels of ground */
const FS = 1.6;
const SPEED = 330;
const ATTACK = 0.34;
const ATK_RANGE = 120;
const THRUST = 0.24;
const CAST = 0.34;
const Q_RANGE = 250;
const DASH = 0.2;
const SPIN = 0.3;
const WALL_CAST = 0.28;
const LB = 1.15;
const SLAM = 0.8;
const GRAV = 900;
const ORDER: number[] = [];
const DEPTH: number[] = [];

const IDLE: SwordPose = { arm: 0.75, blade: 0.45, arm2: 1.7, blade2: 0, crouch: 0.25, lunge: 0, wind: 0.45 };
const RUN: SwordPose = { arm: 1.2, blade: 2.3, arm2: 1.9, blade2: 0, crouch: 0.15, lunge: 0.2, wind: 0.8 };
const THRUST_P: SwordPose = { arm: -0.05, blade: 0.02, arm2: 2.5, blade2: 0, crouch: 0.45, lunge: 1, wind: 0.9 };
const CAST_P: SwordPose = { arm: -1.7, blade: -2.5, arm2: 2.2, blade2: 0, crouch: 0.1, lunge: 0.35, wind: 1 };
const CUT_A: SwordPose = { arm: -1.3, blade: -0.5, arm2: 2.6, blade2: 0, crouch: 0.5, lunge: 0.5, wind: 1 };
const CUT_B: SwordPose = { arm: 0.9, blade: 1.3, arm2: -2.2, blade2: 0, crouch: 0.6, lunge: 0.2, wind: 1 };
const DASH_P: SwordPose = { arm: 1.6, blade: 2.9, arm2: 2.4, blade2: 0, crouch: 0.7, lunge: 1, wind: 1 };
const WALL_P: SwordPose = { arm: 1.4, blade: 2.2, arm2: -0.4, blade2: 0, crouch: 0.3, lunge: 0.5, wind: 1 };
const CAMEO: SwordPose = { arm: 1.1, blade: 1.2, arm2: 0.9, blade2: 1.5, crouch: 0.15, lunge: 0, wind: 0.5 };

const DAWN: RiverPalette = {
  sky: ['#18233c', '#56618a', '#eaa47a'],
  trees: ['#39405a', '#243044', '#16241e'],
  bank: ['#3c5a3a', '#1f2c1e'],
  water: ['#8aa2bc', '#3e5c78', '#16283a'],
  shine: 'rgba(230,236,255,0.2)',
  brush: ['#173424', '#2a5038'],
};

const depthScale = (s: State, y: number) => s.u * lerp(0.84, 1.1, y);
const span = (s: State) => Math.max(1, s.bot - s.top - 34 * s.u);
const screenY = (s: State, y: number) => s.top + 34 * s.u + y * span(s);
const groundY = (s: State, py: number) => clamp((py - (s.top + 34 * s.u)) / span(s), 0, 1);
const snd = (s: State, env: SceneEnv) => (s.touched && env.interactive ? env.audio() : null);

/* ---------- terrain ---------- */

function paintScene(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const u = s.u;
  const { cv, c, m } = backdropLayer(s.bg, w, h, dpr, 16 * u);
  s.bg = cv;
  if (!c) return;
  c.fillStyle = DAWN.sky[0];
  c.fillRect(-m, -m, w + m * 2, h + m * 2);
  c.save();
  c.translate(-m, 0);
  paintRiver(c, w + m * 2, h + m, u, s.top, DAWN, 17);
  c.restore();
  // the low sun burning through the treeline on the right, and its path on the water
  const sun = c.createRadialGradient(w * 0.8, s.top - 60 * u, 0, w * 0.8, s.top - 60 * u, w * 0.55);
  sun.addColorStop(0, 'rgba(255,214,160,0.5)');
  sun.addColorStop(0.3, 'rgba(255,160,110,0.16)');
  sun.addColorStop(1, 'rgba(255,140,100,0)');
  c.fillStyle = sun;
  c.fillRect(-m, -m, w + m * 2, h + m * 2);
  // the sun's path on the water: hard edged glints breaking up toward the viewer
  const r = (i: number) => {
    const v = Math.sin(i * 127.1 + 17) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < 46; i++) {
    const q = r(i);
    const y = lerp(s.top + 6 * u, h, q * q);
    const spread = lerp(0.04, 0.2, q) * w;
    const x = w * 0.8 + (r(i + 99) - 0.5) * 2 * spread;
    const len = lerp(10, 46, q) * u * (0.5 + r(i + 7));
    c.fillStyle = `rgba(255,${Math.round(lerp(226, 190, q))},${Math.round(lerp(176, 140, q))},${(0.75 - q * 0.45).toFixed(3)})`;
    c.fillRect(Math.round(x - len / 2), Math.round(y), Math.round(len), Math.max(1, Math.round(1.5 * u)));
  }
  // push the far bank and the water back a step so Yasuo and the wave read in front
  const veil = c.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, 'rgba(12,16,34,0.12)');
  veil.addColorStop(0.5, 'rgba(12,16,34,0.2)');
  veil.addColorStop(1, 'rgba(8,12,26,0.32)');
  c.fillStyle = veil;
  c.fillRect(-m, -m, w + m * 2, h + m * 2);
}

/* ---------- minions ---------- */

function resetMinion(s: State, i: number, first: boolean) {
  const m = s.minions[i];
  m.alive = true;
  m.hp = 3;
  m.flash = 0;
  m.tag = 0;
  m.vx = 0;
  m.caster = i % 3 === 2;
  m.x = first ? 0.56 + (i % 3) * 0.07 + Math.floor(i / 3) * 0.16 : rand(1.04, 1.3);
  m.y = clamp(0.5 + ((i % 3) - 1) * 0.3 + rand(-0.05, 0.05), 0.05, 0.95);
  m.step = rand(0, TAU);
  s.air[i] = 0;
  s.vair[i] = 0;
  s.held[i] = 0;
  s.swing[i] = rand(0.5, 1.5);
  s.eTag[i] = 0;
}

/** Ground plane distance in pixels between two scene points */
function planeDist(s: State, env: SceneEnv, x0: number, y0: number, x1: number, y1: number) {
  return Math.hypot((x1 - x0) * env.w, (y1 - y0) * span(s) * FS);
}

function nearest(s: State, env: SceneEnv, x: number, y: number) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive || m.x > 0.99 || m.x < 0.01) continue;
    const d = planeDist(s, env, x, y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** The minion under a screen point, judged by its body rather than its feet */
function pick(s: State, env: SceneEnv, px: number, py: number) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive || m.x > 1.02) continue;
    const k = depthScale(s, m.y);
    const x = m.x * env.w;
    const y = screenY(s, m.y) - s.air[i] * k;
    if (Math.abs(px - x) > 26 * k || py < y - 80 * k || py > y + 14 * k) continue;
    const d = Math.abs(px - x) + Math.abs(py - (y - 30 * k)) * 0.5;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function onSelf(s: State, env: SceneEnv, px: number, py: number) {
  const k = depthScale(s, s.m.y) * CH;
  const x = s.m.x * env.w;
  const y = screenY(s, s.m.y) - (s.lift * k) / CH;
  return Math.abs(px - x) < 24 * k && py > y - 125 * k && py < y + 8 * k;
}

function hitMinion(s: State, env: SceneEnv, i: number, dmg: number, crit = false) {
  const m = s.minions[i];
  if (!m.alive) return;
  const k = depthScale(s, m.y);
  const x = m.x * env.w;
  const y = screenY(s, m.y) - 34 * k - s.air[i] * k;
  m.hp -= dmg;
  m.flash = 0.14;
  burst(s.parts, crit ? 16 : 8, x, y, 0, Math.PI, (crit ? 360 : 240) * k, 0.4, 3 * k, crit ? 1 : 3, 3, 0);
  if (m.hp <= 0) {
    m.alive = false;
    m.respawn = rand(1, 1.8);
    burst(s.parts, 18, x, y, -Math.PI / 2, 1.3, 300 * k, 0.8, 3.5 * k, 3, 2, 380 * k);
    burst(s.parts, 12, x, y, -Math.PI / 2, 1.2, 260 * k, 0.9, 3 * k, 0, 2, 200 * k);
  }
}

const airborne = (s: State, i: number) => s.minions[i].alive && s.air[i] > 12;

function anyAirborne(s: State) {
  for (let i = 0; i < s.minions.length; i++) if (airborne(s, i)) return true;
  return false;
}

/* ---------- abilities ---------- */

/** Point the cast at a screen point: dir is a unit vector on the ground plane */
function aim(s: State, env: SceneEnv, gx: number, gy: number) {
  const ax = gx - s.m.x * env.w;
  const ay = (gy - screenY(s, s.m.y)) * FS;
  const d = Math.hypot(ax, ay);
  if (d < 4) {
    s.dirX = s.m.face;
    s.dirY = 0;
  } else {
    s.dirX = ax / d;
    s.dirY = ay / d;
  }
  if (Math.abs(s.dirX) > 0.08) s.m.face = s.dirX > 0 ? 1 : -1;
  return d;
}

/** Where a screen point sits on the water, as scene units */
function groundAt(s: State, env: SceneEnv, gx: number, gy: number): [number, number] {
  return [clamp(gx / Math.max(1, env.w), 0.04, 0.96), clamp(groundY(s, gy), 0.02, 0.98)];
}

function lineHits(s: State, env: SceneEnv, len: number, wide: number, dmg: number) {
  const k = depthScale(s, s.m.y);
  const x0 = s.m.x * env.w;
  const y0 = screenY(s, s.m.y);
  let any = false;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive) continue;
    const mx = m.x * env.w - x0;
    const my = (screenY(s, m.y) - y0) * FS;
    const along = mx * s.dirX + my * s.dirY;
    const across = Math.abs(-mx * s.dirY + my * s.dirX);
    if (along > -14 * k && along < len * k && across < wide * k) {
      hitMinion(s, env, i, dmg);
      any = true;
    }
  }
  return any;
}

function steelTempest(s: State, env: SceneEnv, gx: number, gy: number) {
  aim(s, env, gx, gy);
  s.cdQ = 0.42;
  const bus = snd(s, env);
  if (s.stacks >= 2) {
    s.act = 3;
    s.pt = 0;
    s.stacks = 0;
    if (bus) {
      noise(bus, { duration: 0.8, gain: 0.18, freq: 700, q: 0.5 });
      tone(bus, 180, { type: 'triangle', attack: 0.05, decay: 0.6, gain: 0.05, glideTo: 520 });
    }
    return;
  }
  s.act = 2;
  s.pt = 0;
  const k = depthScale(s, s.m.y);
  const any = lineHits(s, env, Q_RANGE, 38, 0.8);
  if (any) {
    s.stacks++;
    s.stackGlow = 1;
    if (!env.reducedMotion) s.stop = 0.05;
  }
  const x0 = s.m.x * env.w;
  const y0 = screenY(s, s.m.y);
  const hx = x0 + s.dirX * 50 * k;
  const hy = y0 - 80 * k + (s.dirY * 50 * k) / FS;
  burst(s.parts, 14, hx, hy, Math.atan2(s.dirY / FS, s.dirX), 0.25, 560 * k, 0.35, 3 * k, 0, 4, 0);
  if (bus) {
    noise(bus, { duration: 0.18, gain: 0.12, freq: 2600, q: 1 });
    tone(bus, any ? 1320 : 880, { type: 'triangle', attack: 0.002, decay: 0.12, gain: 0.04, glideTo: any ? 1760 : 660 });
  }
}

function loose(s: State, env: SceneEnv) {
  const k = depthScale(s, s.m.y);
  const tn = s.tornado;
  tn.x = s.m.x * env.w + s.dirX * 40 * k;
  tn.y = screenY(s, s.m.y);
  const sp = 760 * k;
  tn.vx = s.dirX * sp;
  tn.vy = (s.dirY * sp) / FS;
  tn.life = 0.62;
  tn.hit = 0;
}

function knockUp(s: State, env: SceneEnv, i: number) {
  const m = s.minions[i];
  const k = depthScale(s, m.y);
  s.vair[i] = 560;
  s.air[i] = Math.max(s.air[i], 4);
  hitMinion(s, env, i, 0.5);
  burst(s.parts, 16, m.x * env.w, screenY(s, m.y) - 6 * k, -Math.PI / 2, 0.8, 380 * k, 0.7, 3.5 * k, 2, 1.5, 700 * k);
}

function windWall(s: State, env: SceneEnv, gx: number, gy: number) {
  aim(s, env, gx, gy);
  s.act = 6;
  s.pt = 0;
  s.cdW = 3.2;
  const k = depthScale(s, s.m.y);
  const wl = s.wall;
  wl.x = s.m.x * env.w + s.dirX * 90 * k;
  wl.y = screenY(s, s.m.y) + (s.dirY * 90 * k) / FS;
  wl.nx = s.dirX;
  wl.ny = s.dirY;
  wl.life = 3.2;
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.9, gain: 0.14, freq: 500, q: 0.4 });
    tone(bus, 260, { type: 'sine', attack: 0.08, decay: 0.7, gain: 0.04, glideTo: 390 });
  }
}

function sweepingBlade(s: State, env: SceneEnv, gx: number, gy: number, picked: number) {
  const k = depthScale(s, s.m.y);
  // a minion near the aim point that has not been dashed through lately
  let tgt = picked >= 0 && s.eTag[picked] <= 0 ? picked : -1;
  if (tgt < 0) {
    let bd = Infinity;
    const [ax, ay] = groundAt(s, env, gx, gy);
    for (let i = 0; i < s.minions.length; i++) {
      const m = s.minions[i];
      if (!m.alive || s.eTag[i] > 0 || m.x > 0.98) continue;
      const fromMe = planeDist(s, env, s.m.x, s.m.y, m.x, m.y);
      const fromAim = planeDist(s, env, ax, ay, m.x, m.y);
      if (fromMe > 360 * k || fromAim > 150 * k) continue;
      if (fromAim < bd) {
        bd = fromAim;
        tgt = i;
      }
    }
  }
  let len = 250 * k;
  if (tgt >= 0) {
    const m = s.minions[tgt];
    aim(s, env, m.x * env.w, screenY(s, m.y));
    len = Math.min(400 * k, planeDist(s, env, s.m.x, s.m.y, m.x, m.y) + 140 * k);
    s.eTag[tgt] = 2.2;
  } else aim(s, env, gx, gy);
  s.eTarget = tgt;
  s.act = 4;
  s.pt = 0;
  s.cdE = 0.3;
  s.eQ = false;
  s.fromX = s.m.x;
  s.fromY = s.m.y;
  s.toX = clamp(s.m.x + (s.dirX * len) / env.w, 0.04, 0.96);
  s.toY = clamp(s.m.y + (s.dirY * len) / (span(s) * FS), 0.02, 0.98);
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.22, gain: 0.12, freq: 1800, q: 0.7 });
    tone(bus, 520, { type: 'triangle', attack: 0.003, decay: 0.16, gain: 0.03, glideTo: 1040 });
  }
}

function spin(s: State, env: SceneEnv) {
  // Q at the end of a dash: a full circle, a whirling knock up on the third stack
  s.act = 7;
  s.pt = 0;
  s.cdQ = 0.42;
  const k = depthScale(s, s.m.y);
  const third = s.stacks >= 2;
  let any = false;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive) continue;
    if (planeDist(s, env, s.m.x, s.m.y, m.x, m.y) < 150 * k) {
      if (third) knockUp(s, env, i);
      else hitMinion(s, env, i, 0.8);
      any = true;
    }
  }
  if (third) s.stacks = 0;
  else if (any) {
    s.stacks++;
    s.stackGlow = 1;
  }
  const x = s.m.x * env.w;
  const y = screenY(s, s.m.y);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    emit(s.parts, x + Math.cos(a) * 60 * k, y - 50 * k + Math.sin(a) * 22 * k, Math.cos(a) * 260 * k, Math.sin(a) * 90 * k, 0.45, 4 * k, third ? 0 : 1, 3, 0);
  }
  if (!env.reducedMotion && any) {
    s.stop = 0.06;
    s.shake = Math.max(s.shake, 0.35);
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.14, freq: 1400, q: 0.6 });
    tone(bus, third ? 300 : 700, { type: 'triangle', attack: 0.004, decay: 0.3, gain: 0.04, glideTo: third ? 900 : 1400 });
  }
}

function basicAttack(s: State, env: SceneEnv, i: number) {
  const m = s.minions[i];
  aim(s, env, m.x * env.w, screenY(s, m.y));
  s.act = 1;
  s.pt = 0;
  s.atkCd = 0.62;
  s.atkN++;
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.12, gain: 0.08, freq: 3000, q: 1.2 });
}

function lastBreath(s: State, env: SceneEnv) {
  let mask = 0;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < s.minions.length; i++) {
    if (!airborne(s, i)) continue;
    mask |= 1 << i;
    s.held[i] = 1;
    s.vair[i] = 0;
    s.air[i] = Math.max(s.air[i], 70);
    sx += s.minions[i].x;
    sy += s.minions[i].y;
    n++;
  }
  const bus = snd(s, env);
  if (!n) {
    // nothing in the air: a dry gust says not yet
    s.deny = 0.5;
    if (bus) tone(bus, 180, { type: 'sine', attack: 0.004, decay: 0.15, gain: 0.04, glideTo: 120 });
    return;
  }
  s.act = 5;
  s.pt = 0;
  s.lbMask = mask;
  s.lbCuts = 0;
  s.fromX = s.m.x;
  s.fromY = s.m.y;
  s.lbX = sx / n;
  s.lbY = sy / n;
  s.m.face = s.lbX >= s.m.x ? 1 : -1;
  halt(s.m);
  s.chase = -1;
  const k = depthScale(s, s.m.y);
  const x0 = s.m.x * env.w;
  const y0 = screenY(s, s.m.y) - 60 * k;
  const x1 = s.lbX * env.w;
  const y1 = screenY(s, s.lbY) - 120 * k;
  for (let i = 0; i < 16; i++) {
    const q = i / 15;
    emit(s.parts, lerp(x0, x1, q), lerp(y0, y1, q), rand(-20, 20) * k, rand(-20, 20) * k, rand(0.3, 0.6), rand(4, 8) * k, 0, 3, 0);
  }
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.14, freq: 1800, q: 0.7 });
    tone(bus, 440, { type: 'sine', attack: 0.01, decay: 0.5, gain: 0.05, glideTo: 1320 });
  }
}

function cut(s: State, env: SceneEnv) {
  s.lbCuts++;
  const k = depthScale(s, s.lbY);
  let slot = s.slashes[0];
  for (const sl of s.slashes) if (sl.life < slot.life) slot = sl;
  slot.x = s.lbX * env.w + rand(-30, 30) * k;
  slot.y = screenY(s, s.lbY) - rand(100, 150) * k;
  slot.ang = (s.lbCuts % 2 ? -0.5 : 0.6) + rand(-0.35, 0.35) + (s.lbCuts > 4 ? Math.PI / 2 : 0);
  slot.len = rand(160, 230) * k;
  slot.life = 0.28;
  for (let i = 0; i < s.minions.length; i++) if (s.lbMask & (1 << i) && s.minions[i].alive) hitMinion(s, env, i, 0.3);
  if (!env.reducedMotion) {
    s.stop = 0.035;
    s.shake = Math.max(s.shake, 0.3);
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.12, gain: 0.12, freq: 3800, q: 1.4 });
    tone(bus, 1600 + s.lbCuts * 120, { type: 'triangle', attack: 0.002, decay: 0.09, gain: 0.03, glideTo: 900 });
  }
}

function slam(s: State, env: SceneEnv) {
  const k = depthScale(s, s.lbY);
  const x = s.lbX * env.w;
  const y = screenY(s, s.lbY);
  for (let i = 0; i < s.minions.length; i++) {
    if (!(s.lbMask & (1 << i))) continue;
    s.held[i] = 0;
    s.vair[i] = -1400;
    if (s.minions[i].alive) hitMinion(s, env, i, 1.6);
  }
  burst(s.parts, 60, x, y - 4 * k, -Math.PI / 2, 1.2, 520 * k, 0.9, 4 * k, 2, 1.5, 900 * k);
  burst(s.parts, 30, x, y - 60 * k, 0, Math.PI, 600 * k, 0.5, 4 * k, 1, 3, 0);
  burst(s.parts, 30, x, y - 40 * k, 0, Math.PI, 420 * k, 0.8, 7 * k, 0, 2.5, -40 * k);
  s.flash = 1;
  if (!env.reducedMotion) {
    s.stop = 0.16;
    s.shake = 1;
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.7, gain: 0.3, freq: 420, q: 0.5, type: 'lowpass' });
    tone(bus, 80, { type: 'sine', attack: 0.004, decay: 0.8, gain: 0.3, glideTo: 34 });
    tone(bus, 1980, { type: 'triangle', attack: 0.002, decay: 0.5, gain: 0.04, glideTo: 2640 });
  }
}

/* ---------- commands ---------- */

/** Where keys aim when the pointer is not over the scene: the nearest minion, else straight ahead */
function keyAim(s: State, env: SceneEnv): [number, number] {
  if (env.pointer.inside) return [env.pointer.x, env.pointer.y];
  const i = nearest(s, env, s.m.x, s.m.y);
  if (i >= 0) return [s.minions[i].x * env.w, screenY(s, s.minions[i].y)];
  return [s.m.x * env.w + s.m.face * env.w * 0.3, screenY(s, s.m.y)];
}

function busy(s: State) {
  return s.act !== 0;
}

/** Run a command now, or hold it for a moment if Yasuo is mid swing */
function command(s: State, env: SceneEnv, c: Command, gx: number, gy: number) {
  if (!c) return;
  if (c === 'stop') {
    halt(s.m);
    s.chase = -1;
    return;
  }
  if (c === 'move' || c === 'tap') {
    const i = pick(s, env, gx, gy);
    if (c === 'tap' && i >= 0 && airborne(s, i)) return command(s, env, 'r', gx, gy);
    if (c === 'tap' && i >= 0) {
      s.chase = i;
      const m = s.minions[i];
      setMarker(s.marker, m.x * env.w, screenY(s, m.y), '255,90,80');
      return;
    }
    if (c === 'tap' && onSelf(s, env, gx, gy)) return command(s, env, 'w', s.m.x * env.w + s.m.face * 100, screenY(s, s.m.y));
    const [x, y] = groundAt(s, env, gx, gy);
    s.chase = -1;
    moveTo(s.m, x, y);
    setMarker(s.marker, x * env.w, screenY(s, y), '130,240,170');
    return;
  }
  if (c === 'double') c = 'e';
  if (c === 'q' && s.act === 4) {
    s.eQ = true;
    s.pop[0] = 0.25;
    return;
  }
  const cd = c === 'q' ? s.cdQ : c === 'w' ? s.cdW : c === 'e' ? s.cdE : 0;
  if (busy(s) || cd > 0) {
    if (cd < 0.4 && s.act !== 5) {
      s.buf = c;
      s.bufX = gx;
      s.bufY = gy;
      s.bufT = 0.4;
    }
    return;
  }
  if (c === 'q') steelTempest(s, env, gx, gy);
  else if (c === 'w') windWall(s, env, gx, gy);
  else if (c === 'e') sweepingBlade(s, env, gx, gy, pick(s, env, gx, gy));
  else if (c === 'r') lastBreath(s, env);
  const slot = c === 'q' ? 0 : c === 'w' ? 1 : c === 'e' ? 2 : 3;
  if (c !== 'r' || s.act === 5) s.pop[slot] = 0.25;
}

function interact(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  env.wake(2600);
}

/* ---------- autopilot ---------- */

function brain(s: State, env: SceneEnv, dt: number) {
  s.autoT -= dt;
  s.autoClock += dt;
  if (s.autoT > 0 || busy(s)) return;
  const k = depthScale(s, s.m.y);
  const x = (i: number) => s.minions[i].x * env.w;
  const y = (i: number) => screenY(s, s.minions[i].y);
  if (anyAirborne(s)) {
    command(s, env, 'r', 0, 0);
    s.autoT = 2.4;
    return;
  }
  for (const b of s.bolts) {
    if (b.life > 0 && s.cdW <= 0 && s.autoClock > 4 && Math.hypot(b.x - s.m.x * env.w, b.y - screenY(s, s.m.y)) < 260 * k) {
      command(s, env, 'w', b.x, b.y);
      s.autoT = 0.3;
      return;
    }
  }
  const i = nearest(s, env, s.m.x, s.m.y);
  if (i < 0) {
    moveTo(s.m, 0.3, 0.55);
    s.autoT = 0.5;
    return;
  }
  const d = planeDist(s, env, s.m.x, s.m.y, s.minions[i].x, s.minions[i].y);
  if (d > Q_RANGE * 0.85 * k) {
    if (d < 300 * k && s.cdE <= 0 && s.eTag[i] <= 0) command(s, env, 'e', x(i), y(i));
    else moveTo(s.m, clamp(s.minions[i].x - 0.14, 0.05, 0.9), s.minions[i].y);
    s.autoT = 0.3;
    return;
  }
  halt(s.m);
  if (s.cdQ <= 0) command(s, env, 'q', x(i), y(i));
  else s.chase = i;
  s.autoT = 0.55;
}

/* ---------- drawing ---------- */

function drawTornado(ctx: C, s: State, t: number) {
  const tn = s.tornado;
  if (tn.life <= 0) return;
  const k = depthScale(s, groundY(s, tn.y));
  const a = Math.min(1, tn.life * 4) * Math.min(1, (0.62 - tn.life) * 14 + 0.3);
  const H = 170 * k;
  const N = 14;
  // the funnel: narrow at the water, flaring at the top, its spine whipping side to side
  const cxAt = (q: number) => tn.x + Math.sin(t * 16 + q * 4) * 7 * k * q;
  const rAt = (q: number) => (7 + Math.pow(q, 1.5) * 52) * k;
  ctx.fillStyle = `rgba(196,226,250,${(0.22 * a).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    ctx.lineTo(cxAt(q) - rAt(q), tn.y - q * H);
  }
  for (let i = N; i >= 0; i--) {
    const q = i / N;
    ctx.lineTo(cxAt(q) + rAt(q), tn.y - q * H);
  }
  ctx.closePath();
  ctx.fill();
  // a darker core band so the white wind reads against the dawn water
  ctx.fillStyle = `rgba(60,96,150,${(0.22 * a).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    ctx.lineTo(cxAt(q) - rAt(q) * 0.35, tn.y - q * H);
  }
  for (let i = N; i >= 0; i--) {
    const q = i / N;
    ctx.lineTo(cxAt(q) + rAt(q) * 0.35, tn.y - q * H);
  }
  ctx.closePath();
  ctx.fill();
  // spiral bands wrapping the funnel, front halves bright, crisp strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const q = (i + 0.5) / 9;
    const cy = tn.y - q * H;
    const rx = rAt(q);
    const ry = (2.5 + q * 8) * k;
    const off = (t * 22 + i * 1.3) % TAU;
    ctx.strokeStyle = `rgba(236,248,255,${(0.85 * a * (1 - q * 0.3)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (2.4 - q) * k);
    ctx.beginPath();
    ctx.ellipse(cxAt(q), cy, rx, ry, 0, off, off + 2.6);
    ctx.stroke();
  }
  // the outer edges
  ctx.strokeStyle = `rgba(220,240,255,${(0.6 * a).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.3 * k);
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const q = i / N;
      ctx.lineTo(cxAt(q) + sd * rAt(q), tn.y - q * H);
    }
    ctx.stroke();
  }
  // churned water ring at the base
  ctx.strokeStyle = `rgba(226,242,255,${(0.7 * a).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.6 * k);
  ctx.beginPath();
  ctx.ellipse(tn.x, tn.y, 26 * k, 7 * k, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSlash(ctx: C, sl: Slash) {
  if (sl.life <= 0) return;
  const q = sl.life / 0.28;
  const g = 1 - q;
  const dx = Math.cos(sl.ang) * sl.len * 0.5;
  const dy = Math.sin(sl.ang) * sl.len * 0.5;
  const x0 = sl.x - dx * (0.4 + g * 0.6);
  const y0 = sl.y - dy * (0.4 + g * 0.6);
  const x1 = sl.x + dx;
  const y1 = sl.y + dy;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(120,190,255,${(0.5 * q).toFixed(3)})`;
  ctx.lineWidth = 10 * q + 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${q.toFixed(3)})`;
  ctx.lineWidth = 2.5 * q + 0.5;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** Wind Wall: a curved sheet of wind standing across the aim, shimmering */
function drawWall(ctx: C, s: State, t: number) {
  const wl = s.wall;
  if (wl.life <= 0) return;
  const k = depthScale(s, groundY(s, wl.y));
  const a = Math.min(1, wl.life * 2) * Math.min(1, (3.2 - wl.life) * 6);
  const tx = -wl.ny;
  const ty = wl.nx / FS;
  const half = 110 * k;
  const hgt = 130 * k;
  ctx.globalCompositeOperation = 'lighter';
  for (let layerI = 0; layerI < 3; layerI++) {
    const g = ctx.createLinearGradient(wl.x, wl.y, wl.x, wl.y - hgt);
    g.addColorStop(0, `rgba(160,220,255,${(0.2 * a).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(120,190,255,${(0.08 * a).toFixed(3)})`);
    g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g;
    const bow = (12 + layerI * 6) * k;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const q = i / 12 - 0.5;
      const b = (1 - 4 * q * q) * bow;
      const px = wl.x + tx * q * 2 * half + wl.nx * b;
      const py = wl.y + ty * q * 2 * half + (wl.ny * b) / FS;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = 12; i >= 0; i--) {
      const q = i / 12 - 0.5;
      const b = (1 - 4 * q * q) * bow;
      const px = wl.x + tx * q * 2 * half + wl.nx * b;
      const py = wl.y + ty * q * 2 * half + (wl.ny * b) / FS;
      const top = hgt * (0.7 + 0.3 * (1 - 4 * q * q)) * (0.9 + 0.1 * Math.sin(t * 4 + i + layerI));
      ctx.lineTo(px, py - top);
    }
    ctx.closePath();
    ctx.fill();
  }
  // a crisp crest along the top of the wall and its foot in the water
  ctx.strokeStyle = `rgba(220,242,255,${(0.75 * a).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.6 * k);
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const q = i / 12 - 0.5;
    const b = (1 - 4 * q * q) * 24 * k;
    const px = wl.x + tx * q * 2 * half + wl.nx * b;
    const py = wl.y + ty * q * 2 * half + (wl.ny * b) / FS;
    const top = hgt * (0.7 + 0.3 * (1 - 4 * q * q)) * (0.9 + 0.1 * Math.sin(t * 4 + i + 2));
    if (i === 0) ctx.moveTo(px, py - top);
    else ctx.lineTo(px, py - top);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const q = i / 12 - 0.5;
    const b = (1 - 4 * q * q) * 12 * k;
    const px = wl.x + tx * q * 2 * half + wl.nx * b;
    const py = wl.y + ty * q * 2 * half + (wl.ny * b) / FS;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // streaks of wind running sideways along the wall
  ctx.strokeStyle = `rgba(230,246,255,${(0.6 * a).toFixed(3)})`;
  ctx.lineWidth = 1.6 * k;
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const q = ((t * (0.8 + (i % 3) * 0.25) + i / 14) % 1) - 0.5;
    const h = hgt * (0.1 + ((i * 37) % 10) / 13);
    const px = wl.x + tx * q * 2 * half;
    const py = wl.y + ty * q * 2 * half - h;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + tx * 30 * k, py + ty * 30 * k);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 1.6,
    init: (env) => {
      const leaves = new Float32Array(26 * 3);
      for (let i = 0; i < 26; i++) {
        leaves[i * 3] = Math.random();
        leaves[i * 3 + 1] = Math.random();
        leaves[i * 3 + 2] = Math.random() * TAU;
      }
      const gusts = new Float32Array(10 * 3);
      for (let i = 0; i < 10; i++) {
        gusts[i * 3] = Math.random() * 1.4 - 0.2;
        gusts[i * 3 + 1] = Math.random();
        gusts[i * 3 + 2] = 0.6 + Math.random() * 0.8;
      }
      const g = makeGesture();
      const s: State = {
        m: makeMover(0.26, 0.55, 1),
        g,
        ac: env.interactive ? pointerButtons(env.canvas, g) : null,
        lift: 0,
        act: 0,
        pt: 0,
        dirX: 1,
        dirY: 0,
        stacks: 0,
        stackGlow: 0,
        cdQ: 0,
        cdW: 0,
        cdE: 0,
        atkCd: 0,
        atkN: 0,
        chase: -1,
        buf: null,
        bufX: 0,
        bufY: 0,
        bufT: 0,
        deny: 0,
        hurt: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        eTarget: -1,
        eQ: false,
        lbX: 0,
        lbY: 0,
        lbMask: 0,
        lbCuts: 0,
        tornado: { x: 0, y: 0, vx: 0, vy: 0, life: 0, hit: 0 },
        slashes: Array.from({ length: 8 }, () => ({ x: 0, y: 0, ang: 0, len: 0, life: 0 })),
        bolts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
        wall: { x: 0, y: 0, nx: 1, ny: 0, life: 0 },
        marker: makeMarker(),
        touched: false,
        idle: 0,
        autoT: 0.3,
        autoClock: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        minions: Array.from({ length: MINIONS }, () => makeMinion()),
        air: new Float32Array(MINIONS),
        vair: new Float32Array(MINIONS),
        held: new Uint8Array(MINIONS),
        swing: new Float32Array(MINIONS),
        eTag: new Float32Array(MINIONS),
        parts: makePool(460),
        leaves,
        gusts,
        pose: { ...IDLE, walk: 0, stride: 0 },
        cameo: { ...CAMEO },
        u: 1,
        top: 0,
        bot: 0,
        bg: null,
        blue: glowSprite(64, [
          [0, 'rgba(240,250,255,1)'],
          [0.3, 'rgba(130,200,255,0.55)'],
          [1, 'rgba(60,120,255,0)'],
        ]),
        white: glowSprite(48, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(230,240,255,0.4)'],
          [1, 'rgba(200,220,255,0)'],
        ]),
        red: glowSprite(48, [
          [0, 'rgba(255,220,200,1)'],
          [0.3, 'rgba(255,70,50,0.6)'],
          [1, 'rgba(160,0,0,0)'],
        ]),
        sun: glowSprite(64, [
          [0, 'rgba(255,236,200,0.9)'],
          [0.35, 'rgba(255,170,110,0.3)'],
          [1, 'rgba(255,120,80,0)'],
        ]),
        vignette: null,
        pop: new Float32Array(4),
        slots: [
          { key: 'Q', cd: 0, max: 0.42, col: '150,210,255', pipMax: 2 },
          { key: 'W', cd: 0, max: 3.2, col: '150,210,255' },
          { key: 'E', cd: 0, max: 0.3, col: '150,210,255' },
          { key: 'R', cd: 0, max: 0, col: '200,236,255' },
        ],
      };
      for (let i = 0; i < MINIONS; i++) resetMinion(s, i, true);
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.u = Math.min(w / (w < h ? 520 : 800), h / 500);
      s.top = h * 0.44;
      s.bot = h * 0.94;
      paintScene(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(4,6,16,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w } = env;
      // the hold gesture runs on real time, before hit-stop slows the world
      const held = gestureTick(s.g);
      if (held) {
        interact(s, env);
        command(s, env, held, s.g.x, s.g.y);
      }
      if (s.stop > 0) {
        s.stop -= dt;
        dt *= 0.05;
      }
      stepPool(s.parts, dt);
      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.flash = Math.max(0, s.flash - dt * 3);
      s.stackGlow = Math.max(0, s.stackGlow - dt * 2);
      s.deny = Math.max(0, s.deny - dt);
      s.hurt = Math.max(0, s.hurt - dt);
      s.cdQ = Math.max(0, s.cdQ - dt);
      s.cdW = Math.max(0, s.cdW - dt);
      s.cdE = Math.max(0, s.cdE - dt);
      s.atkCd = Math.max(0, s.atkCd - dt);
      s.marker.life = Math.max(0, s.marker.life - dt);
      for (let i = 0; i < 4; i++) s.pop[i] = Math.max(0, s.pop[i] - dt);
      for (const sl of s.slashes) sl.life = Math.max(0, sl.life - dt);
      for (let i = 0; i < MINIONS; i++) s.eTag[i] = Math.max(0, s.eTag[i] - dt);
      if (s.wall.life > 0) s.wall.life -= dt;

      // a buffered cast fires as soon as he is free
      if (s.bufT > 0) {
        s.bufT -= dt;
        if (!busy(s)) {
          const c = s.buf;
          s.buf = null;
          s.bufT = 0;
          command(s, env, c, s.bufX, s.bufY);
        }
      }

      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 9;
      if (auto) brain(s, env, dt);

      const k0 = depthScale(s, s.m.y);
      // chase a clicked minion into range, then cut
      if (s.chase >= 0) {
        const m = s.minions[s.chase];
        if (!m.alive) s.chase = -1;
        else if (!busy(s)) {
          const d = planeDist(s, env, s.m.x, s.m.y, m.x, m.y);
          if (d > ATK_RANGE * k0) moveTo(s.m, m.x - Math.sign(m.x - s.m.x || 1) * (ATK_RANGE * 0.6 * k0) / w, m.y);
          else {
            halt(s.m);
            if (s.atkCd <= 0) basicAttack(s, env, s.chase);
          }
        }
      }

      // movement: casting roots him in place but keeps the move order
      const rooted = s.act === 1 || s.act === 2 || s.act === 3 || s.act === 6 || s.act === 7;
      if (s.act !== 4 && s.act !== 5) {
        stepMover(s.m, dt, w, span(s) * FS, SPEED * k0, SPEED * 16 * k0, 46 * k0 * CH, rooted);
        s.m.x = clamp(s.m.x, 0.04, 0.96);
        s.m.y = clamp(s.m.y, 0.02, 0.98);
      } else turnToward(s.m, dt);

      const pose = s.pose;
      if (s.act === 1) {
        const before = s.pt;
        s.pt += dt;
        const q = s.pt / ATTACK;
        const crit = s.atkN % 3 === 0;
        if (q < 0.4) mixSword(pose, IDLE, CUT_A, easeOutCubic(q / 0.4));
        else mixSword(pose, CUT_A, CUT_B, easeOutBack(Math.min(1, (q - 0.4) / 0.35)));
        if (before < ATTACK * 0.5 && s.pt >= ATTACK * 0.5 && s.chase >= 0) {
          hitMinion(s, env, s.chase, crit ? 1.6 : 1, crit);
          const m = s.minions[s.chase];
          const k = depthScale(s, m.y);
          let slot = s.slashes[0];
          for (const sl of s.slashes) if (sl.life < slot.life) slot = sl;
          slot.x = m.x * w;
          slot.y = screenY(s, m.y) - 40 * k - s.air[s.chase] * k;
          slot.ang = s.m.face > 0 ? 0.8 : Math.PI - 0.8;
          slot.len = (crit ? 150 : 100) * k;
          slot.life = 0.28;
          if (!env.reducedMotion) {
            s.stop = crit ? 0.07 : 0.035;
            if (crit) s.shake = Math.max(s.shake, 0.3);
          }
          const bus = snd(s, env);
          if (bus) tone(bus, crit ? 1500 : 1100, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.025, glideTo: 520 });
        }
        if (q >= 1) s.act = 0;
      } else if (s.act === 2) {
        s.pt += dt;
        const q = s.pt / THRUST;
        mixSword(pose, IDLE, THRUST_P, q < 0.35 ? easeOutCubic(q / 0.35) : 1 - easeInOutCubic((q - 0.35) / 0.65) * 0.9);
        if (q >= 1) s.act = 0;
      } else if (s.act === 3) {
        const before = s.pt;
        s.pt += dt;
        const q = s.pt / CAST;
        if (q < 0.45) mixSword(pose, IDLE, CAST_P, easeOutCubic(q / 0.45));
        else mixSword(pose, CAST_P, THRUST_P, easeInOutCubic(Math.min(1, (q - 0.45) / 0.3)));
        if (before < CAST * 0.55 && s.pt >= CAST * 0.55) loose(s, env);
        emit(s.parts, s.m.x * w + rand(-50, 50) * k0, screenY(s, s.m.y) - rand(0, 120) * k0, s.m.face * rand(80, 200) * k0, rand(-60, 20) * k0, 0.4, 3 * k0, 0, 2, 0);
        if (q >= 1) s.act = 0;
      } else if (s.act === 4) {
        const before = s.pt;
        s.pt += dt;
        const q = Math.min(1, s.pt / DASH);
        const e = easeOutCubic(q);
        place(s.m, lerp(s.fromX, s.toX, e), lerp(s.fromY, s.toY, e));
        mixSword(pose, pose, DASH_P, 1 - Math.exp(-30 * dt));
        for (let k = 0; k < 2; k++) emit(s.parts, s.m.x * w + rand(-20, 20) * k0, screenY(s, s.m.y) - rand(10, 120) * k0, -s.dirX * 200 * k0, rand(-30, 30) * k0, 0.4, 4 * k0, 0, 3, 0);
        if (before < DASH * 0.5 && s.pt >= DASH * 0.5 && s.eTarget >= 0) {
          hitMinion(s, env, s.eTarget, 0.8);
          if (!env.reducedMotion) s.stop = 0.04;
          const bus = snd(s, env);
          if (bus) tone(bus, 1250, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.025, glideTo: 620 });
        }
        if (q >= 1) {
          s.act = 0;
          halt(s.m);
          if (s.eQ) spin(s, env);
        }
      } else if (s.act === 5) {
        s.pt += dt;
        const q = s.pt / LB;
        const blink = clamp(s.pt / 0.12, 0, 1);
        const land = clamp((s.pt - SLAM) / (LB - SLAM), 0, 1);
        place(s.m, lerp(s.fromX, clamp(s.lbX - s.m.face * 0.075, 0.04, 0.96), easeOutCubic(blink)), lerp(s.fromY, s.lbY, easeOutCubic(blink)));
        s.lift = s.pt < SLAM ? lerp(0, 120, easeOutCubic(blink)) + Math.sin(s.pt * 8) * 6 : lerp(120, 0, easeInOutCubic(Math.min(1, land * 2.5)));
        if (s.pt > 0.14 && s.pt < SLAM - 0.08 && s.pt > 0.14 + s.lbCuts * 0.1) cut(s, env);
        if (s.pt < SLAM) {
          const ck = clamp((s.pt - 0.14 - (s.lbCuts - 1) * 0.1) / 0.1, 0, 1);
          mixSword(pose, s.lbCuts % 2 ? CUT_A : CUT_B, s.lbCuts % 2 ? CUT_B : CUT_A, easeOutCubic(ck));
        } else mixSword(pose, CUT_B, IDLE, easeInOutCubic(land));
        if (s.pt >= SLAM && s.pt - dt < SLAM) slam(s, env);
        if (q >= 1) {
          s.act = 0;
          s.lift = 0;
        }
      } else if (s.act === 6) {
        s.pt += dt;
        const q = s.pt / WALL_CAST;
        mixSword(pose, IDLE, WALL_P, q < 0.4 ? easeOutBack(q / 0.4) : 1 - easeInOutCubic((q - 0.4) / 0.6) * 0.8);
        if (q >= 1) s.act = 0;
      } else if (s.act === 7) {
        s.pt += dt;
        const q = s.pt / SPIN;
        mixSword(pose, q < 0.5 ? CUT_A : CUT_B, q < 0.5 ? CUT_B : IDLE, easeOutCubic((q % 0.5) * 2));
        if (q >= 1) s.act = 0;
      } else {
        // standing or walking: the sword trails low while he moves
        const target = s.m.stride > 0.05 ? RUN : IDLE;
        mixSword(pose, pose, target, 1 - Math.exp(-(s.m.stride > 0.05 ? 10 : 6) * dt));
        s.lift = damp(s.lift, 0, 10, dt);
      }
      pose.walk = s.m.gait;
      pose.stride = s.act === 0 || s.act === 1 ? s.m.stride : 0;
      if (env.reducedMotion && (s.m.going || s.act !== 0 || s.chase >= 0)) env.wake(400);

      // the whirlwind: travels, throws minions up once each
      const tn = s.tornado;
      if (tn.life > 0) {
        tn.life -= dt;
        tn.x += tn.vx * dt;
        tn.y += tn.vy * dt;
        const k = depthScale(s, groundY(s, tn.y));
        for (let i = 0; i < s.minions.length; i++) {
          const m = s.minions[i];
          if (!m.alive || tn.hit & (1 << i)) continue;
          const d = Math.hypot(m.x * w - tn.x, (screenY(s, m.y) - tn.y) * FS);
          if (d < 62 * k) {
            tn.hit |= 1 << i;
            knockUp(s, env, i);
            if (!env.reducedMotion) s.stop = Math.max(s.stop, 0.04);
            const bus = snd(s, env);
            if (bus) tone(bus, 520, { type: 'triangle', attack: 0.004, decay: 0.2, gain: 0.04, glideTo: 1040 });
          }
        }
        if (Math.random() < 0.8) emit(s.parts, tn.x + rand(-30, 30) * k, tn.y - rand(0, 140) * k, rand(-80, 80) * k, rand(-160, -40) * k, 0.5, 3 * k, 0, 2, 0);
        if (Math.random() < 0.6) emit(s.parts, tn.x + rand(-20, 20) * k, tn.y - 4 * k, rand(-160, 160) * k, rand(-260, -80) * k, 0.5, 2.5 * k, 2, 1, 700 * k);
        if (env.reducedMotion) env.wake(400);
      }

      // caster bolts: blocked by the wall, a flinch if they land
      const yx = s.m.x * w;
      const yy = screenY(s, s.m.y);
      for (const b of s.bolts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const wl = s.wall;
        if (wl.life > 0) {
          const k = depthScale(s, groundY(s, wl.y));
          const rx = b.x - wl.x;
          const ry = (b.y + 40 * k - wl.y) * FS;
          const along = rx * -wl.ny + ry * wl.nx;
          const across = rx * wl.nx + ry * wl.ny;
          if (Math.abs(along) < 115 * k && Math.abs(across) < 22 * k) {
            b.life = 0;
            burst(s.parts, 10, b.x, b.y, Math.atan2(-b.vy, -b.vx), 0.8, 220 * k, 0.4, 3 * k, 0, 3, 0);
            continue;
          }
        }
        if (Math.hypot(b.x - yx, (b.y - (yy - 70 * k0 * CH * 0.6 - s.lift * k0)) * 0.7) < 26 * k0 * CH && s.act !== 4 && s.act !== 5) {
          b.life = 0;
          s.hurt = 0.25;
          burst(s.parts, 10, b.x, b.y, 0, Math.PI, 200 * k0, 0.4, 3 * k0, 3, 3, 0);
          const bus = snd(s, env);
          if (bus) tone(bus, 240, { type: 'square', attack: 0.002, decay: 0.08, gain: 0.02, glideTo: 160 });
        }
      }

      // minions: march, fight back, get thrown and fall back into the water
      for (let i = 0; i < s.minions.length; i++) {
        const m = s.minions[i];
        if (!m.alive && s.air[i] <= 0) {
          m.respawn -= dt;
          if (m.respawn <= 0 && !(s.act === 5 && s.lbMask & (1 << i))) resetMinion(s, i, false);
          continue;
        }
        m.flash = Math.max(0, m.flash - dt);
        if (s.held[i]) {
          s.air[i] = damp(s.air[i], 110, 3, dt);
        } else if (s.air[i] > 0 || s.vair[i] > 0) {
          const apex = Math.abs(s.vair[i]) < 140 ? 0.35 : 1;
          s.vair[i] -= GRAV * apex * dt;
          s.air[i] += s.vair[i] * dt;
          if (s.air[i] <= 0) {
            s.air[i] = 0;
            s.vair[i] = 0;
            const k = depthScale(s, m.y);
            burst(s.parts, 10, m.x * w, screenY(s, m.y), -Math.PI / 2, 1, 200 * k, 0.6, 2.5 * k, 2, 1, 700 * k);
          }
        }
        if (!m.alive) continue;
        if (s.air[i] <= 0) {
          const d = planeDist(s, env, m.x, m.y, s.m.x, s.m.y);
          const reach = (m.caster ? 300 : 70) * depthScale(s, m.y);
          if (d < reach && m.x < 0.98) {
            // in range: turn on Yasuo and swing or shoot every so often
            s.swing[i] -= dt;
            if (s.swing[i] <= 0) {
              s.swing[i] = m.caster ? rand(2, 2.8) : rand(1.1, 1.6);
              m.step += 1.2;
              if (m.caster) {
                let slot = s.bolts[0];
                for (const b of s.bolts) if (b.life <= 0) {
                  slot = b;
                  break;
                }
                const k = depthScale(s, m.y);
                slot.x = m.x * w - 16 * k;
                slot.y = screenY(s, m.y) - 46 * k;
                const tx = yx - slot.x;
                const ty = yy - 70 * k0 - slot.y;
                const dd = Math.hypot(tx, ty) || 1;
                slot.vx = (tx / dd) * 300 * k;
                slot.vy = (ty / dd) * 300 * k;
                slot.life = 2;
              } else if (s.act !== 4 && s.act !== 5) s.hurt = Math.max(s.hurt, 0.15);
            }
          } else {
            m.x -= dt * 0.035;
            m.step += dt * 7;
            // drift toward their lane, apart from each other
            for (let j = 0; j < s.minions.length; j++) {
              if (j === i || !s.minions[j].alive) continue;
              const o = s.minions[j];
              if (Math.abs(o.x - m.x) < 0.04 && Math.abs(o.y - m.y) < 0.12) m.y += Math.sign(m.y - o.y || 1) * dt * 0.08;
            }
            m.y = clamp(m.y, 0.04, 0.96);
          }
        }
        if (m.x < -0.06) resetMinion(s, i, false);
      }

      // wind: gusts and leaves blowing across
      for (let i = 0; i < 10; i++) {
        s.gusts[i * 3] += dt * 0.35 * s.gusts[i * 3 + 2];
        if (s.gusts[i * 3] > 1.3) {
          s.gusts[i * 3] = -0.4;
          s.gusts[i * 3 + 1] = Math.random();
        }
      }
      for (let i = 0; i < 26; i++) {
        s.leaves[i * 3] += dt * (0.08 + (i % 5) * 0.02);
        s.leaves[i * 3 + 1] += Math.sin(s.leaves[i * 3 + 2] + s.leaves[i * 3] * 9) * dt * 0.05;
        s.leaves[i * 3 + 2] += dt * 3;
        if (s.leaves[i * 3] > 1.05) {
          s.leaves[i * 3] = -0.05;
          s.leaves[i * 3 + 1] = Math.random();
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u0 = s.u;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 12 * u0;
      ctx.save();
      ctx.translate(snap(shakeX(amp, t), env.dpr), snap(shakeY(amp, t), env.dpr));
      drawBackdrop(ctx, s.bg);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.sun, w * 0.8, s.top - 60 * u0, 150 * u0, 0.8);
      ctx.globalCompositeOperation = 'source-over';

      // Yone on the far bank, facing his brother, blades catching the dawn
      {
        const k = u0 * 0.62;
        const x = w * 0.9;
        const y = s.top - 14 * u0;
        s.cameo.wind = 0.5 + Math.sin(t * 1.4) * 0.15;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-k, k);
        const cam = s.cameo;
        inked(ctx, (f) => yone(ctx, t, cam, f), '#0e0c16', 1.2, 'rgba(255,206,160,0.9)', -1.8, -1.2);
        ctx.restore();
        ctx.globalAlpha = 1;
        const hd = swordHands(s.cameo);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.blue, x - hd.x * k, y + hd.y * k, 30 * k, 0.4 + Math.sin(t * 2) * 0.1);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // gusts across the water
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const gx = s.gusts[i * 3] * w;
        const gy = lerp(s.top * 0.6, h * 0.95, s.gusts[i * 3 + 1]);
        const len = 140 * u0 * s.gusts[i * 3 + 2];
        ctx.strokeStyle = `rgba(220,236,255,${(0.07 + 0.05 * s.gusts[i * 3 + 2]).toFixed(3)})`;
        ctx.lineWidth = 1.5 * u0;
        ctx.beginPath();
        ctx.moveTo(gx - len, gy);
        ctx.bezierCurveTo(gx - len * 0.5, gy - 12 * u0, gx - len * 0.2, gy + 8 * u0, gx, gy - 6 * u0);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      drawMarker(ctx, s.marker, depthScale(s, groundY(s, s.marker.y)));

      // the target he is chasing, and the minion under the pointer, get a red ring
      const hover = env.pointer.inside ? pick(s, env, env.pointer.x, env.pointer.y) : -1;
      for (const i of [s.chase, hover]) {
        if (i < 0 || !s.minions[i].alive) continue;
        const m = s.minions[i];
        const k = depthScale(s, m.y);
        ctx.strokeStyle = i === s.chase ? 'rgba(255,90,80,0.85)' : 'rgba(255,120,110,0.55)';
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.ellipse(m.x * w, screenY(s, m.y), 22 * k, 7 * k, 0, 0, TAU);
        ctx.stroke();
      }

      // depth sort Yasuo (-1) and the minions
      ORDER.length = 0;
      DEPTH.length = 0;
      ORDER.push(-1);
      DEPTH.push(s.m.y + 0.001);
      for (let i = 0; i < s.minions.length; i++) {
        if (!s.minions[i].alive && s.air[i] <= 0) continue;
        ORDER.push(i);
        DEPTH.push(s.minions[i].y);
      }
      depthSort(ORDER, DEPTH);

      const lbOn = s.act === 5;
      for (const idx of ORDER) {
        if (idx >= 0) {
          const m = s.minions[idx];
          const k = depthScale(s, m.y);
          const x = m.x * w;
          const y = screenY(s, m.y);
          const air = s.air[idx] * k;
          const sh = 1 - Math.min(0.7, s.air[idx] / 200);
          ctx.fillStyle = `rgba(0,0,0,${(0.3 * sh).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x, y, 14 * k * sh, 4 * k * sh, 0, 0, TAU);
          ctx.fill();
          if (s.air[idx] > 12 && m.alive) {
            // the knock up: a wind ring under the thrown minion, ready for Last Breath
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(150,210,255,${(0.5 + Math.sin(t * 14) * 0.2).toFixed(3)})`;
            ctx.lineWidth = 2 * k;
            ctx.beginPath();
            ctx.ellipse(x, y, 24 * k, 7 * k, 0, 0, TAU);
            ctx.stroke();
            glow(ctx, s.blue, x, y - air - 30 * k, 30 * k, 0.35);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
          }
          ctx.save();
          ctx.translate(x, y - air);
          if (s.air[idx] > 0) ctx.rotate(Math.sin(s.air[idx] * 0.02 + idx) * 0.5);
          ctx.globalAlpha = m.alive ? 1 : Math.max(0, s.air[idx] / 60);
          // minions turn to face Yasuo once he is close
          const faceIn = m.x > s.m.x ? 1 : -1;
          ctx.scale(k * faceIn * 1.08, k * 1.08);
          drawMinion(ctx, m, t, 'red');
          ctx.restore();
          ctx.globalAlpha = 1;
          if (m.alive) healthBar(ctx, x, y - air - 78 * k, 32 * k, k, m.hp / 3, '#e8413c');
          continue;
        }
        // Yasuo
        const k = depthScale(s, s.m.y) * CH;
        const x = s.m.x * w;
        const y = screenY(s, s.m.y);
        const lift = (s.lift * k) / CH;
        const sh = 1 - Math.min(0.6, s.lift / 200);
        ctx.fillStyle = `rgba(0,0,0,${(0.4 * sh).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 34 * k * sh, 8 * k * sh, 0, 0, TAU);
        ctx.fill();
        const blinkA = lbOn && s.pt < 0.12 ? 0.35 : 1;
        // wind stacks as pips at his feet
        for (let i = 0; i < 2; i++) {
          const on = s.stacks > i;
          const px = Math.round(x + (i - 0.5) * 14 * k);
          const py = Math.round(y + 13 * k);
          ctx.fillStyle = on ? '#d6f0ff' : 'rgba(20,30,50,0.75)';
          ctx.strokeStyle = on ? '#4a9cff' : 'rgba(150,180,220,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py - 4 * k);
          ctx.lineTo(px + 4 * k, py);
          ctx.lineTo(px, py + 4 * k);
          ctx.lineTo(px - 4 * k, py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        if (s.act === 4) {
          // Sweeping Blade afterimages
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i <= 3; i++) {
            const q = i / 4;
            ctx.save();
            ctx.translate(lerp(x, s.fromX * w, q * 0.7), lerp(y, screenY(s, s.fromY), q * 0.7));
            ctx.scale(k * s.m.face, k);
            ctx.globalAlpha = 0.3 * (1 - q);
            yasuo(ctx, t, s.pose, 'rgba(120,190,255,1)');
            ctx.restore();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(x, y - lift);
        const ts = turnScale(s.m);
        ctx.scale(k * ts, k);
        ctx.globalAlpha = blinkA;
        // crisp ink outline, a warm dawn rim on the sun side (red when a minion lands a hit), then the figure
        const pose = s.pose;
        inked(ctx, (f) => yasuo(ctx, t, pose, f), '#090b14', 1.25, s.hurt > 0 ? '#ff5a46' : '#ffc896', 1.6, -1.2);
        ctx.restore();
        ctx.globalAlpha = 1;
        const hd = swordHands(s.pose);
        ctx.globalCompositeOperation = 'lighter';
        const charged = s.stacks >= 2 ? 0.5 + Math.sin(t * 10) * 0.15 : 0;
        const bx = x + hd.x * k * ts;
        const by = y - lift + hd.y * k;
        glow(ctx, s.blue, bx, by, 26 * k, Math.max(charged, s.stackGlow * 0.6, anyAirborne(s) ? 0.6 : 0, 0.18));
        // wind curling along the blade, stronger with the stacks
        {
          const dxs = Math.cos(s.pose.blade) * Math.sign(ts);
          const dys = Math.sin(s.pose.blade);
          ctx.strokeStyle = `rgba(200,232,255,${(0.25 + s.stacks * 0.15).toFixed(3)})`;
          ctx.lineWidth = 1.4 * k;
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) {
            const q = i / 10;
            const px = bx + dxs * q * 80 * k + Math.sin(t * 14 + q * 9) * 3 * k * -dys;
            const py = by + dys * q * 80 * k + Math.sin(t * 14 + q * 9) * 3 * k * dxs;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        if (s.stacks >= 2) {
          // the charged third tempest: wind circling him
          ctx.strokeStyle = 'rgba(190,225,255,0.5)';
          ctx.lineWidth = 1.5 * k;
          ctx.beginPath();
          ctx.ellipse(x, y - lift - 60 * k, 38 * k, 70 * k, 0, t * 6, t * 6 + 2.6);
          ctx.stroke();
        }
        if (s.deny > 0) {
          ctx.strokeStyle = `rgba(200,210,230,${(s.deny * 1.2).toFixed(3)})`;
          ctx.lineWidth = 2 * k;
          ctx.beginPath();
          ctx.ellipse(x, y, (30 + (0.5 - s.deny) * 60) * k, (9 + (0.5 - s.deny) * 18) * k, 0, 0, TAU);
          ctx.stroke();
        }
        // thrust streak
        if (s.act === 2) {
          const q = s.pt / THRUST;
          const a = Math.sin(Math.min(1, q) * Math.PI);
          const k1 = k / CH;
          const x0 = x + s.dirX * 40 * k1;
          const y0 = y - 80 * k1 + (s.dirY * 40 * k1) / FS;
          const x1 = x + s.dirX * Q_RANGE * k1;
          const y1 = y - 80 * k1 + (s.dirY * Q_RANGE * k1) / FS;
          const grow = easeOutCubic(Math.min(1, q * 2.2));
          const ex = lerp(x0, x1, grow);
          const ey = lerp(y0, y1, grow);
          const nx = -(ey - y0);
          const ny = ex - x0;
          const nl = Math.hypot(nx, ny) || 1;
          const hw = 9 * k1 * a;
          ctx.fillStyle = `rgba(120,190,255,${(0.55 * a).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(x0 + (nx / nl) * hw * 0.4, y0 + (ny / nl) * hw * 0.4);
          ctx.lineTo(lerp(x0, ex, 0.7) + (nx / nl) * hw, lerp(y0, ey, 0.7) + (ny / nl) * hw);
          ctx.lineTo(ex, ey);
          ctx.lineTo(lerp(x0, ex, 0.7) - (nx / nl) * hw, lerp(y0, ey, 0.7) - (ny / nl) * hw);
          ctx.lineTo(x0 - (nx / nl) * hw * 0.4, y0 - (ny / nl) * hw * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.lineWidth = 2 * k1;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          glow(ctx, s.white, ex, ey, 14 * k1, a * 0.8);
        }
        // the spin circle after a dash
        if (s.act === 7) {
          const q = s.pt / SPIN;
          const a = 1 - q;
          const k1 = k / CH;
          ctx.strokeStyle = `rgba(170,220,255,${(0.7 * a).toFixed(3)})`;
          ctx.lineWidth = 10 * k1 * a + 1;
          ctx.beginPath();
          ctx.ellipse(x, y - 30 * k1, lerp(60, 150, easeOutCubic(q)) * k1, lerp(20, 50, easeOutCubic(q)) * k1, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      drawWall(ctx, s, t);
      drawTornado(ctx, s, t);
      for (const sl of s.slashes) drawSlash(ctx, sl);

      // caster bolts
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bolts) if (b.life > 0) glow(ctx, s.red, b.x, b.y, 12 * u0, 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Last Breath: a dome of wind over the suspended targets
      if (lbOn && s.pt < SLAM + 0.2) {
        const k = depthScale(s, s.lbY);
        const x = s.lbX * w;
        const y = screenY(s, s.lbY) - 110 * k;
        const a = s.pt < SLAM ? Math.min(1, s.pt * 6) : 1 - (s.pt - SLAM) / 0.2;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.blue, x, y, 90 * k, 0.28 * a);
        ctx.strokeStyle = `rgba(214,238,255,${(0.7 * a).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 1.8 * k);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x, y, (90 + i * 16) * k, (30 + i * 6) * k, 0, t * (5 + i) + i, t * (5 + i) + i + 2.2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      // the slam shock ring on the water
      if (lbOn && s.pt >= SLAM) {
        const k = depthScale(s, s.lbY);
        const q = (s.pt - SLAM) / (LB - SLAM);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(210,236,255,${(0.7 * (1 - q)).toFixed(3)})`;
        ctx.lineWidth = 4 * k * (1 - q) + 1;
        ctx.beginPath();
        ctx.ellipse(s.lbX * w, screenY(s, s.lbY), lerp(20, 200, easeOutCubic(q)) * k, lerp(6, 50, easeOutCubic(q)) * k, 0, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      // particles: 0 wind, 1 white sparks, 2 water spray, 3 red hit sparks
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== 2) continue;
        const q = p.life / p.max;
        ctx.fillStyle = `rgba(200,224,245,${(0.6 * q).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + q * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind === 2) continue;
        const q = p.life / p.max;
        // each spark is a short streak along its motion, sharp at any pixel ratio
        const sp = Math.hypot(p.vx, p.vy);
        const len = clamp(sp * 0.03, p.size * 0.6, p.size * 6);
        const ux = sp > 1 ? p.vx / sp : 1;
        const uy = sp > 1 ? p.vy / sp : 0;
        ctx.strokeStyle =
          p.kind === 0
            ? `rgba(196,230,255,${(0.75 * q).toFixed(3)})`
            : p.kind === 1
              ? `rgba(255,255,255,${q.toFixed(3)})`
              : `rgba(255,120,90,${q.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, p.size * 0.45 * (0.5 + q * 0.5));
        ctx.beginPath();
        ctx.moveTo(p.x - ux * len, p.y - uy * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // leaves riding the wind
      for (let i = 0; i < 26; i += 2) {
        const lx = s.leaves[i * 3] * w;
        const ly = (((s.leaves[i * 3 + 1] % 1) + 1) % 1) * h;
        const r = s.leaves[i * 3 + 2];
        ctx.fillStyle = i % 3 ? '#d88c4c' : '#f0c27a';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 4 * u0, 1.6 * u0 * Math.abs(Math.cos(r)) + 0.4, r * 0.5, 0, TAU);
        ctx.fill();
      }
      drawHoldRing(ctx, s.g, u0, '150,210,255');
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(160,210,255,${(s.flash * 0.22).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      if (env.interactive) {
        const sl = s.slots;
        sl[0].cd = s.cdQ;
        sl[0].pips = s.stacks;
        sl[0].lit = s.stacks >= 2;
        sl[1].cd = s.cdW;
        sl[2].cd = s.cdE;
        const air = anyAirborne(s);
        sl[3].off = !air && s.act !== 5;
        sl[3].lit = air;
        const bk = clamp(u0 * 0.95, 0.75, 1.2);
        drawAbilityBar(ctx, w / 2, h - 50 * bk, bk, sl, s.pop);
      }
    },
    onPointerDown: (s, env, x, y) => {
      interact(s, env);
      command(s, env, gestureDown(s.g, x, y), x, y);
    },
    onPointerMove: (s, _env, x, y) => gestureMove(s.g, x, y),
    onPointerUp: (s, env, x, y) => {
      const c = gestureUp(s.g, x, y);
      if (!c) return;
      interact(s, env);
      command(s, env, c, x, y);
    },
    onKey: (s, env, e, down) => {
      const c = abilityKey(e);
      if (!c) return false;
      if (!down || e.repeat) return true;
      interact(s, env);
      const [gx, gy] = keyAim(s, env);
      command(s, env, c, gx, gy);
      return true;
    },
    dispose: (s) => {
      s.ac?.abort();
      freeCanvas(s.bg, s.blue, s.white, s.red, s.sun);
      s.bg = null;
    },
  });
