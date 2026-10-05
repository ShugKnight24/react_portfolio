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
 * Yone, Fate Sealed: the Unforgotten wades the Rift river under a blood moon, the Azakana mask
 * tied to the side of his head, the blue spirit blade in one hand and the red Azakana blade in
 * the other, while the blue wave wades in and Yasuo watches from the far bank. Click or tap the
 * water to walk, click a minion to cut it. Mortal Steel (Q) thrusts and stacks; the third cast
 * dashes and throws everything on the line. Spirit Cleave (W) sweeps both blades through a cone
 * and wraps him in a shield. Soul Unbound (E) sends his spirit out to fight on its own while the
 * body waits, then snaps it back and every mark it left bursts. Fate Sealed (R) draws a long blue
 * line, drags the wave to its end and finishes with a crossed cut while the Azakana rises behind.
 */

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
  // 0 idle, 1 basic attack, 2 thrust, 3 third Q dash, 4 spirit cleave, 5 soul dash out,
  // 6 fate sealed, 7 snap back
  act: number;
  pt: number;
  dirX: number;
  dirY: number;
  stacks: number;
  cdQ: number;
  cdW: number;
  cdE: number;
  cdR: number;
  atkCd: number;
  atkN: number;
  chase: number;
  buf: Command;
  bufX: number;
  bufY: number;
  bufT: number;
  hurt: number;
  shield: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hitMask: number;
  pulled: number;
  // Soul Unbound: while soul > 0 the mover is the spirit and the body waits here
  soul: number;
  bodyX: number;
  bodyY: number;
  bodyFace: number;
  marks: number;
  spHit: number;
  azakana: number;
  bolts: Bolt[];
  marker: Marker;
  touched: boolean;
  idle: number;
  autoT: number;
  autoN: number;
  stop: number;
  shake: number;
  flash: number;
  minions: Minion[];
  air: Float32Array;
  vair: Float32Array;
  pullX: Float32Array;
  pullY: Float32Array;
  swing: Float32Array;
  parts: Pool;
  mist: Float32Array;
  pose: SwordPose;
  body: SwordPose;
  cameo: SwordPose;
  u: number;
  top: number;
  bot: number;
  bg: HTMLCanvasElement | null;
  blue: HTMLCanvasElement;
  red: HTMLCanvasElement;
  white: HTMLCanvasElement;
  moon: HTMLCanvasElement;
  vignette: CanvasGradient | null;
  /** ability bar: pop timers and the reused slot records */
  pop: Float32Array;
  slots: AbilitySlot[];
}

type C = CanvasRenderingContext2D;

const MINIONS = 6;
const CH = 1.6;
const FS = 1.6;
const SPEED = 320;
const HOME = 0.72;
const ATTACK = 0.34;
const ATK_RANGE = 125;
const THRUST = 0.26;
const Q_RANGE = 230;
const Q3 = 0.42;
const CLEAVE = 0.4;
const SOUL_OUT = 0.2;
const SOUL_TIME = 4.2;
const SNAP = 0.22;
const FATE_WIND = 0.22;
const FATE_DASH = 0.16;
const FATE = 1;
const GRAV = 900;
const ORDER: number[] = [];
const DEPTH: number[] = [];

const IDLE: SwordPose = { arm: 0.9, blade: 0.95, arm2: 1.2, blade2: 2.3, crouch: 0.3, lunge: 0, wind: 0.5 };
const RUN: SwordPose = { arm: 1.3, blade: 2.5, arm2: 1.5, blade2: 2.7, crouch: 0.2, lunge: 0.25, wind: 0.8 };
const RAISE: SwordPose = { arm: -1.5, blade: -1.9, arm2: 2.4, blade2: 2.9, crouch: 0.2, lunge: 0.3, wind: 0.8 };
const CUT: SwordPose = { arm: 0.8, blade: 1.3, arm2: -2.2, blade2: -2.6, crouch: 0.6, lunge: 1, wind: 1 };
const STAB: SwordPose = { arm: -0.05, blade: 0.02, arm2: 2.6, blade2: 3.0, crouch: 0.45, lunge: 1, wind: 0.9 };
const SWEEP_A: SwordPose = { arm: -1.4, blade: -2.4, arm2: -1.0, blade2: -2.0, crouch: 0.2, lunge: 0.3, wind: 0.9 };
const SWEEP_B: SwordPose = { arm: 1.1, blade: 1.6, arm2: 1.0, blade2: 1.9, crouch: 0.6, lunge: 0.8, wind: 1 };
const DASH: SwordPose = { arm: 0.15, blade: 0.05, arm2: 2.8, blade2: 3.1, crouch: 0.65, lunge: 1, wind: 1 };
const CROSS: SwordPose = { arm: -0.9, blade: -1, arm2: -0.5, blade2: -1.3, crouch: 0.3, lunge: 0.5, wind: 1 };
const KNEEL: SwordPose = { arm: 1.3, blade: 1.55, arm2: 1.5, blade2: 1.8, crouch: 1, lunge: 0, wind: 0.2 };
const CAMEO: SwordPose = { arm: 0.8, blade: 0.6, arm2: 1.6, blade2: 0, crouch: 0.2, lunge: 0, wind: 0.6 };

const NIGHT: RiverPalette = {
  sky: ['#06060f', '#1a1430', '#3a1a2c'],
  trees: ['#1e1a30', '#141426', '#0c1418'],
  bank: ['#1e2c28', '#0e1614'],
  water: ['#34344e', '#1c2034', '#0a0c16'],
  shine: 'rgba(170,190,255,0.16)',
  brush: ['#0e2020', '#163230'],
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
  c.fillStyle = NIGHT.sky[0];
  c.fillRect(-m, -m, w + m * 2, h + m * 2);
  const r = (() => {
    let a = 5;
    return () => ((a = (a * 16807) % 2147483647) - 1) / 2147483646;
  })();
  c.save();
  c.translate(-m, 0);
  paintRiver(c, w + m * 2, h + m, u, s.top, NIGHT, 41);
  c.restore();
  // stars on whole device pixels so they stay pin sharp
  const px = 1 / dpr;
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(230,220,255,${(0.2 + r() * 0.5).toFixed(3)})`;
    const sz = Math.max(px, Math.round(1.2 * u * dpr) / dpr);
    c.fillRect(Math.round(r() * w * dpr) / dpr, Math.round(r() * (s.top - 140 * u) * dpr) / dpr, sz, sz);
  }
  // the blood moon over the treeline, its broken reflection on the water
  const mx = w * 0.3;
  const my = s.top * 0.34;
  c.fillStyle = '#e8584a';
  c.beginPath();
  c.arc(mx, my, 30 * u, 0, TAU);
  c.fill();
  c.fillStyle = '#ff8a72';
  c.beginPath();
  c.arc(mx, my, 30 * u, -2.4, 0.2);
  c.arc(mx + 3 * u, my + 2 * u, 27 * u, 0.2, -2.4, true);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(120,20,30,0.4)';
  c.beginPath();
  c.arc(mx - 9 * u, my - 6 * u, 7 * u, 0, TAU);
  c.arc(mx + 10 * u, my + 9 * u, 5 * u, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,110,90,0.16)';
  c.lineWidth = 2 * u;
  c.beginPath();
  for (let i = 0; i < 14; i++) {
    const y = s.top + 8 * u + i * 9 * u;
    const hw = (26 - i) * u * (0.6 + r() * 0.6);
    c.moveTo(mx - hw + (r() - 0.5) * 8 * u, y);
    c.lineTo(mx + hw + (r() - 0.5) * 8 * u, y);
  }
  c.stroke();
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
  m.x = first ? 0.44 - (i % 3) * 0.07 - Math.floor(i / 3) * 0.16 : rand(-0.3, -0.04);
  m.y = clamp(0.5 + ((i % 3) - 1) * 0.3 + rand(-0.05, 0.05), 0.05, 0.95);
  m.step = rand(0, TAU);
  s.air[i] = 0;
  s.vair[i] = 0;
  s.swing[i] = rand(0.5, 1.5);
}

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

function pick(s: State, env: SceneEnv, px: number, py: number) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive || m.x < -0.02) continue;
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
  const y = screenY(s, s.m.y);
  return Math.abs(px - x) < 24 * k && py > y - 125 * k && py < y + 8 * k;
}

function hitMinion(s: State, env: SceneEnv, i: number, dmg: number, kind = 3) {
  const m = s.minions[i];
  if (!m.alive) return;
  const k = depthScale(s, m.y);
  const x = m.x * env.w;
  const y = screenY(s, m.y) - 34 * k - s.air[i] * k;
  m.hp -= dmg;
  m.flash = 0.14;
  burst(s.parts, 9, x, y, 0, Math.PI, 250 * k, 0.4, 3 * k, kind, 3, 0);
  if (m.hp <= 0) {
    m.alive = false;
    m.respawn = rand(1, 1.8);
    burst(s.parts, 16, x, y, -Math.PI / 2, 1.3, 300 * k, 0.8, 3.5 * k, 3, 2, 380 * k);
    burst(s.parts, 12, x, y, -Math.PI / 2, 1.2, 260 * k, 0.9, 3 * k, 0, 2, 200 * k);
  }
}

/* ---------- abilities ---------- */

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

function groundAt(s: State, env: SceneEnv, gx: number, gy: number): [number, number] {
  return [clamp(gx / Math.max(1, env.w), 0.04, 0.96), clamp(groundY(s, gy), 0.02, 0.98)];
}

/** Set up a dash of len plane pixels along the current aim */
function dashAlong(s: State, env: SceneEnv, len: number) {
  s.fromX = s.m.x;
  s.fromY = s.m.y;
  s.toX = clamp(s.m.x + (s.dirX * len) / env.w, 0.04, 0.96);
  s.toY = clamp(s.m.y + (s.dirY * len) / (span(s) * FS), 0.02, 0.98);
}

/** Everything inside a band along the current aim; returns the mask */
function lineMask(s: State, env: SceneEnv, x0: number, y0: number, len: number, wide: number) {
  const k = depthScale(s, y0);
  let mask = 0;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive) continue;
    const mx = (m.x - x0) * env.w;
    const my = (m.y - y0) * span(s) * FS;
    const along = mx * s.dirX + my * s.dirY;
    const across = Math.abs(-mx * s.dirY + my * s.dirX);
    if (along > -20 * k && along < len * k && across < wide * k) mask |= 1 << i;
  }
  return mask;
}

function spiritHit(s: State, i: number) {
  // while the soul is out every hit leaves a mark that bursts on the snap back
  if (s.soul > 0) s.marks |= 1 << i;
}

function mortalSteel(s: State, env: SceneEnv, gx: number, gy: number) {
  aim(s, env, gx, gy);
  s.cdQ = 0.45;
  const bus = snd(s, env);
  if (s.stacks >= 2) {
    // the third cast: dash along the line and throw everything on it
    s.stacks = 0;
    s.act = 3;
    s.pt = 0;
    const k = depthScale(s, s.m.y);
    s.hitMask = lineMask(s, env, s.m.x, s.m.y, 300, 46);
    dashAlong(s, env, 260 * k);
    if (bus) {
      noise(bus, { duration: 0.4, gain: 0.14, freq: 1400, q: 0.6 });
      tone(bus, 220, { type: 'sawtooth', attack: 0.01, decay: 0.3, gain: 0.04, glideTo: 660 });
    }
    return;
  }
  s.act = 2;
  s.pt = 0;
  const mask = lineMask(s, env, s.m.x, s.m.y, Q_RANGE, 40);
  for (let i = 0; i < s.minions.length; i++) if (mask & (1 << i)) {
    hitMinion(s, env, i, 0.9, 0);
    spiritHit(s, i);
  }
  if (mask) {
    s.stacks++;
    if (!env.reducedMotion) s.stop = 0.05;
  }
  const k = depthScale(s, s.m.y);
  const hx = s.m.x * env.w + s.dirX * 50 * k;
  const hy = screenY(s, s.m.y) - 80 * k + (s.dirY * 50 * k) / FS;
  burst(s.parts, 12, hx, hy, Math.atan2(s.dirY / FS, s.dirX), 0.22, 540 * k, 0.35, 3 * k, 0, 4, 0);
  if (bus) {
    noise(bus, { duration: 0.16, gain: 0.1, freq: 2400, q: 1 });
    tone(bus, mask ? 1240 : 820, { type: 'triangle', attack: 0.002, decay: 0.12, gain: 0.04, glideTo: mask ? 1660 : 620 });
  }
}

function spiritCleave(s: State, env: SceneEnv, gx: number, gy: number) {
  aim(s, env, gx, gy);
  s.act = 4;
  s.pt = 0;
  s.cdW = 2;
  s.hitMask = 0;
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.3, gain: 0.14, freq: 1500, q: 0.7 });
    tone(bus, 330, { type: 'triangle', attack: 0.004, decay: 0.25, gain: 0.04, glideTo: 660 });
  }
}

function cleaveHits(s: State, env: SceneEnv) {
  const k = depthScale(s, s.m.y);
  let any = false;
  for (let i = 0; i < s.minions.length; i++) {
    const m = s.minions[i];
    if (!m.alive) continue;
    const mx = (m.x - s.m.x) * env.w;
    const my = (m.y - s.m.y) * span(s) * FS;
    const d = Math.hypot(mx, my);
    const along = mx * s.dirX + my * s.dirY;
    if (d < 175 * k && along > d * 0.45) {
      hitMinion(s, env, i, 1, i % 2 ? 3 : 0);
      spiritHit(s, i);
      any = true;
    }
  }
  s.shield = any ? 2.2 : 1.2;
  if (any && !env.reducedMotion) {
    s.stop = 0.06;
    s.shake = Math.max(s.shake, 0.3);
  }
  const bus = snd(s, env);
  if (bus && any) tone(bus, 1100, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.025, glideTo: 520 });
}

function soulUnbound(s: State, env: SceneEnv, gx: number, gy: number) {
  if (s.soul > 0) {
    snapBack(s, env);
    return;
  }
  aim(s, env, gx, gy);
  s.cdE = 0.6;
  s.soul = SOUL_TIME;
  s.bodyX = s.m.x;
  s.bodyY = s.m.y;
  s.bodyFace = s.m.face;
  mixSword(s.body, s.pose, KNEEL, 0);
  s.marks = 0;
  s.spHit = 0;
  s.azakana = 1;
  s.act = 5;
  s.pt = 0;
  const k = depthScale(s, s.m.y);
  dashAlong(s, env, 210 * k);
  burst(s.parts, 24, s.m.x * env.w, screenY(s, s.m.y) - 70 * k, -Math.PI / 2, 1.4, 220 * k, 0.8, 5 * k, 0, 2, -60 * k);
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 220, { type: 'sine', attack: 0.05, decay: 0.8, gain: 0.06, glideTo: 440 });
    tone(bus, 330, { type: 'sine', attack: 0.05, decay: 0.8, gain: 0.04, glideTo: 660 });
  }
}

function snapBack(s: State, env: SceneEnv) {
  if (s.soul <= 0 || s.act === 7) return;
  s.act = 7;
  s.pt = 0;
  s.fromX = s.m.x;
  s.fromY = s.m.y;
  halt(s.m);
  s.chase = -1;
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.2, gain: 0.12, freq: 3000, q: 1 });
}

function soulBurst(s: State, env: SceneEnv) {
  let any = false;
  for (let i = 0; i < s.minions.length; i++) {
    if (!(s.marks & (1 << i)) || !s.minions[i].alive) continue;
    const m = s.minions[i];
    const k = depthScale(s, m.y);
    burst(s.parts, 20, m.x * env.w, screenY(s, m.y) - 30 * k, 0, Math.PI, 360 * k, 0.6, 5 * k, 0, 3, 0);
    hitMinion(s, env, i, 1.5, 0);
    any = true;
  }
  s.marks = 0;
  const k = depthScale(s, s.m.y);
  burst(s.parts, 30, s.m.x * env.w, screenY(s, s.m.y) - 70 * k, 0, Math.PI, 300 * k, 0.6, 5 * k, 0, 3, 0);
  if (any) {
    s.flash = 0.6;
    if (!env.reducedMotion) {
      s.stop = 0.12;
      s.shake = 0.8;
    }
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.5, gain: 0.2, freq: 700, q: 0.6, type: 'lowpass' });
    tone(bus, 660, { type: 'sine', attack: 0.004, decay: 0.5, gain: 0.06, glideTo: 1320 });
    tone(bus, 90, { type: 'sine', attack: 0.004, decay: 0.5, gain: 0.2, glideTo: 45 });
  }
}

function fateSealed(s: State, env: SceneEnv, gx: number, gy: number) {
  aim(s, env, gx, gy);
  s.act = 6;
  s.pt = 0;
  s.cdR = 3;
  s.pulled = 0;
  s.azakana = 1;
  halt(s.m);
  s.chase = -1;
  const k = depthScale(s, s.m.y);
  dashAlong(s, env, 380 * k);
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 140, { type: 'sawtooth', attack: 0.15, decay: 0.3, gain: 0.05, glideTo: 70 });
    noise(bus, { duration: 0.5, gain: 0.1, freq: 600, q: 0.6 });
  }
}

function fateDash(s: State, env: SceneEnv) {
  // everything near the line is dragged to the end and thrown up
  const k = depthScale(s, s.fromY);
  const len = planeDist(s, env, s.fromX, s.fromY, s.toX, s.toY) / k;
  const mask = lineMask(s, env, s.fromX, s.fromY, len + 40, 64);
  for (let i = 0; i < s.minions.length; i++) {
    if (!(mask & (1 << i))) continue;
    s.pulled |= 1 << i;
    s.pullX[i] = clamp(s.toX + s.dirX * rand(0.02, 0.06), 0.02, 0.98);
    s.pullY[i] = clamp(s.toY + rand(-0.1, 0.1), 0.04, 0.96);
    s.vair[i] = 420;
    s.air[i] = Math.max(1, s.air[i]);
    hitMinion(s, env, i, 0.5, 0);
    spiritHit(s, i);
  }
  const x0 = s.fromX * env.w;
  const y0 = screenY(s, s.fromY);
  const x1 = s.toX * env.w;
  const y1 = screenY(s, s.toY);
  for (let q = 0; q <= 1; q += 0.05) emit(s.parts, lerp(x0, x1, q), lerp(y0, y1, q) - 50 * k, rand(-40, 40) * k, rand(-60, 0) * k, rand(0.4, 0.8), rand(3, 6) * k, 0, 2, 0);
  if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.4);
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.3, gain: 0.16, freq: 2400, q: 0.9 });
    tone(bus, 880, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.05, glideTo: 220 });
  }
}

function fateCross(s: State, env: SceneEnv) {
  const k = depthScale(s, s.toY);
  const x = s.toX * env.w + s.m.face * 40 * k;
  const y = screenY(s, s.toY) - 90 * k;
  for (let i = 0; i < s.minions.length; i++) if (s.pulled & (1 << i)) hitMinion(s, env, i, 2, i % 2 ? 0 : 3);
  burst(s.parts, 40, x, y, 0, Math.PI, 560 * k, 0.6, 4 * k, 0, 3, 0);
  burst(s.parts, 40, x, y, 0, Math.PI, 560 * k, 0.6, 4 * k, 3, 3, 0);
  burst(s.parts, 20, x, y + 80 * k, -Math.PI / 2, 1, 300 * k, 0.8, 3 * k, 2, 1.5, 700 * k);
  s.flash = 1;
  if (!env.reducedMotion) {
    s.stop = 0.15;
    s.shake = 1;
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.6, gain: 0.28, freq: 500, q: 0.5, type: 'lowpass' });
    tone(bus, 72, { type: 'sine', attack: 0.004, decay: 0.8, gain: 0.3, glideTo: 32 });
    tone(bus, 1320, { type: 'triangle', attack: 0.002, decay: 0.4, gain: 0.04, glideTo: 660 });
    tone(bus, 1760, { type: 'triangle', attack: 0.002, decay: 0.4, gain: 0.03, glideTo: 880, delay: 0.05 });
  }
}

function basicAttack(s: State, env: SceneEnv, i: number) {
  const m = s.minions[i];
  aim(s, env, m.x * env.w, screenY(s, m.y));
  s.act = 1;
  s.pt = 0;
  s.atkCd = 0.6;
  s.atkN++;
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.12, gain: 0.08, freq: s.atkN % 2 ? 2600 : 1800, q: 1.2 });
}

/* ---------- commands ---------- */

function keyAim(s: State, env: SceneEnv): [number, number] {
  if (env.pointer.inside) return [env.pointer.x, env.pointer.y];
  const i = nearest(s, env, s.m.x, s.m.y);
  if (i >= 0) return [s.minions[i].x * env.w, screenY(s, s.minions[i].y)];
  return [s.m.x * env.w + s.m.face * env.w * 0.3, screenY(s, s.m.y)];
}

const busy = (s: State) => s.act !== 0;

function command(s: State, env: SceneEnv, c: Command, gx: number, gy: number) {
  if (!c) return;
  if (c === 'stop') {
    halt(s.m);
    s.chase = -1;
    return;
  }
  if (c === 'move' || c === 'tap') {
    if (s.act === 7) return;
    const i = pick(s, env, gx, gy);
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
  // E while the soul is out always snaps back, even mid swing
  if (c === 'e' && s.soul > 0 && s.act !== 5) {
    snapBack(s, env);
    s.pop[2] = 0.25;
    return;
  }
  const cd = c === 'q' ? s.cdQ : c === 'w' ? s.cdW : c === 'e' ? s.cdE : s.cdR;
  if (busy(s) || cd > 0) {
    if (cd < 0.4 && s.act !== 6 && s.act !== 7) {
      s.buf = c;
      s.bufX = gx;
      s.bufY = gy;
      s.bufT = 0.4;
    }
    return;
  }
  if (c === 'q') mortalSteel(s, env, gx, gy);
  else if (c === 'w') spiritCleave(s, env, gx, gy);
  else if (c === 'e') soulUnbound(s, env, gx, gy);
  else if (c === 'r') fateSealed(s, env, gx, gy);
  s.pop[c === 'q' ? 0 : c === 'w' ? 1 : c === 'e' ? 2 : 3] = 0.25;
}

function interact(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  env.wake(2600);
}

/* ---------- autopilot ---------- */

function brain(s: State, env: SceneEnv, dt: number) {
  s.autoT -= dt;
  if (s.autoT > 0 || busy(s)) return;
  const k = depthScale(s, s.m.y);
  const i = nearest(s, env, s.m.x, s.m.y);
  if (i < 0) {
    if (s.soul > 0) command(s, env, 'e', 0, 0);
    else moveTo(s.m, HOME, 0.55);
    s.autoT = 0.5;
    return;
  }
  const m = s.minions[i];
  const mx = m.x * env.w;
  const my = screenY(s, m.y);
  const d = planeDist(s, env, s.m.x, s.m.y, m.x, m.y);
  if (d > Q_RANGE * 0.85 * k) {
    moveTo(s.m, clamp(m.x + 0.15, 0.1, 0.95), m.y);
    s.autoT = 0.3;
    return;
  }
  halt(s.m);
  s.autoN++;
  if (s.soul > 0 && s.autoN % 4 === 0) command(s, env, 'e', 0, 0);
  else if (s.stacks >= 2 && s.cdR <= 0 && s.autoN % 3 === 0) command(s, env, 'r', mx - 120, my);
  else if (s.cdE <= 0 && s.soul <= 0 && s.autoN % 5 === 1) command(s, env, 'e', mx, my);
  else if (s.cdW <= 0 && s.autoN % 3 === 2) command(s, env, 'w', mx, my);
  else if (s.cdQ <= 0) command(s, env, 'q', mx, my);
  else s.chase = i;
  s.autoT = 0.55;
}

/* ---------- drawing ---------- */

function crescent(ctx: C, x: number, y: number, r: number, a0: number, a1: number, k: number, a: number, col: string) {
  ctx.strokeStyle = col.replace('A', (0.35 * a).toFixed(3));
  ctx.lineWidth = 14 * k * a;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.55, 0, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
  ctx.lineWidth = 2.4 * k;
  ctx.stroke();
}

/** The Azakana rising behind him: a smoky red demon with horns, a pale grin and burning eyes */
function azakana(c: C, s: State, x: number, y: number, r: number, a: number, t: number, face: number) {
  if (a <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.scale(face, 1);
  c.globalCompositeOperation = 'lighter';
  glow(c, s.red, 0, r * 0.4, r * 1.9, 0.45 * a);
  c.globalAlpha = a;
  // smoky shoulders curling up
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 2; i++) {
    const sd = i ? 1 : -1;
    c.fillStyle = `rgba(120,10,24,${(0.55 * a).toFixed(3)})`;
    c.beginPath();
    c.moveTo(sd * r * 0.3, r * 0.4);
    c.bezierCurveTo(sd * r * 1.1, r * 0.3, sd * r * 1.3, r * 1.2 + Math.sin(t * 2 + i) * r * 0.1, sd * r * 0.9, r * 1.6);
    c.quadraticCurveTo(sd * r * 0.5, r * 1.1, 0, r * 1.3);
    c.closePath();
    c.fill();
  }
  // horns
  c.fillStyle = `rgba(200,24,40,${(0.85 * a).toFixed(3)})`;
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.moveTo(sd * r * 0.3, -r * 0.45);
    c.bezierCurveTo(sd * r * 0.6, -r * 1.1, sd * r * 1.1, -r * 1.3, sd * r * 1.4, -r * 1.2);
    c.bezierCurveTo(sd * r * 0.9, -r * 0.95, sd * r * 0.65, -r * 0.6, sd * r * 0.55, -r * 0.2);
    c.closePath();
    c.fill();
  }
  // the face: dark red, a white brow streak, slit eyes and a fanged grin
  const fg = c.createRadialGradient(0, -r * 0.1, r * 0.1, 0, 0, r * 0.75);
  fg.addColorStop(0, `rgba(170,20,34,${(0.9 * a).toFixed(3)})`);
  fg.addColorStop(1, `rgba(60,4,12,${(0.85 * a).toFixed(3)})`);
  c.fillStyle = fg;
  c.beginPath();
  c.moveTo(0, -r * 0.62);
  c.bezierCurveTo(r * 0.62, -r * 0.6, r * 0.66, r * 0.2, r * 0.3, r * 0.62);
  c.lineTo(0, r * 0.74);
  c.lineTo(-r * 0.3, r * 0.62);
  c.bezierCurveTo(-r * 0.66, r * 0.2, -r * 0.62, -r * 0.6, 0, -r * 0.62);
  c.closePath();
  c.fill();
  c.fillStyle = `rgba(255,236,220,${(0.9 * a).toFixed(3)})`;
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.moveTo(sd * r * 0.08, -r * 0.1);
    c.lineTo(sd * r * 0.46, -r * 0.24);
    c.lineTo(sd * r * 0.4, -r * 0.08);
    c.closePath();
    c.fill();
  }
  c.beginPath();
  c.moveTo(-r * 0.36, r * 0.22);
  c.quadraticCurveTo(0, r * 0.5, r * 0.36, r * 0.22);
  c.quadraticCurveTo(0, r * 0.36, -r * 0.36, r * 0.22);
  c.fill();
  c.fillStyle = `rgba(40,0,6,${(0.9 * a).toFixed(3)})`;
  for (let i = -2; i <= 2; i++) c.fillRect(i * r * 0.12 - r * 0.015, r * 0.27, r * 0.03, r * 0.08);
  c.globalCompositeOperation = 'lighter';
  for (const sd of [-1, 1]) glow(c, s.red, sd * r * 0.28, -r * 0.16, r * 0.22, a);
  c.restore();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.62,
    init: (env) => {
      const mist = new Float32Array(16 * 3);
      for (let i = 0; i < 16; i++) {
        mist[i * 3] = Math.random();
        mist[i * 3 + 1] = Math.random();
        mist[i * 3 + 2] = 0.5 + Math.random();
      }
      const g = makeGesture();
      const s: State = {
        m: makeMover(HOME, 0.55, -1),
        g,
        ac: env.interactive ? pointerButtons(env.canvas, g) : null,
        act: 0,
        pt: 0,
        dirX: -1,
        dirY: 0,
        stacks: 0,
        cdQ: 0,
        cdW: 0,
        cdE: 0,
        cdR: 0,
        atkCd: 0,
        atkN: 0,
        chase: -1,
        buf: null,
        bufX: 0,
        bufY: 0,
        bufT: 0,
        hurt: 0,
        shield: 0,
        fromX: HOME,
        fromY: 0.55,
        toX: HOME,
        toY: 0.55,
        hitMask: 0,
        pulled: 0,
        soul: 0,
        bodyX: HOME,
        bodyY: 0.55,
        bodyFace: -1,
        marks: 0,
        spHit: 0,
        azakana: 0,
        bolts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
        marker: makeMarker(),
        touched: false,
        idle: 0,
        autoT: 0.35,
        autoN: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        minions: Array.from({ length: MINIONS }, () => makeMinion()),
        air: new Float32Array(MINIONS),
        vair: new Float32Array(MINIONS),
        pullX: new Float32Array(MINIONS),
        pullY: new Float32Array(MINIONS),
        swing: new Float32Array(MINIONS),
        parts: makePool(440),
        mist,
        pose: { ...IDLE, walk: 0, stride: 0 },
        body: { ...KNEEL },
        cameo: { ...CAMEO },
        u: 1,
        top: 0,
        bot: 0,
        bg: null,
        blue: glowSprite(64, [
          [0, 'rgba(240,250,255,1)'],
          [0.3, 'rgba(110,190,255,0.6)'],
          [1, 'rgba(40,90,255,0)'],
        ]),
        red: glowSprite(48, [
          [0, 'rgba(255,220,210,1)'],
          [0.3, 'rgba(255,50,60,0.6)'],
          [1, 'rgba(150,0,20,0)'],
        ]),
        white: glowSprite(48, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(220,230,255,0.4)'],
          [1, 'rgba(200,210,255,0)'],
        ]),
        moon: glowSprite(64, [
          [0, 'rgba(255,140,120,0.8)'],
          [0.4, 'rgba(220,50,60,0.2)'],
          [1, 'rgba(120,0,20,0)'],
        ]),
        vignette: null,
        pop: new Float32Array(4),
        slots: [
          { key: 'Q', cd: 0, max: 0.45, col: '120,190,255', pipMax: 2 },
          { key: 'W', cd: 0, max: 2, col: '190,220,255' },
          { key: 'E', cd: 0, max: 0.6, col: '120,190,255' },
          { key: 'R', cd: 0, max: 3, col: '255,90,110' },
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
      const v = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(2,2,10,0.7)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w } = env;
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
      s.hurt = Math.max(0, s.hurt - dt);
      s.shield = Math.max(0, s.shield - dt);
      s.cdQ = Math.max(0, s.cdQ - dt);
      s.cdW = Math.max(0, s.cdW - dt);
      s.cdE = Math.max(0, s.cdE - dt);
      s.cdR = Math.max(0, s.cdR - dt);
      s.atkCd = Math.max(0, s.atkCd - dt);
      s.marker.life = Math.max(0, s.marker.life - dt);
      for (let i = 0; i < 4; i++) s.pop[i] = Math.max(0, s.pop[i] - dt);
      s.azakana = Math.max(s.soul > 0 ? 0.35 : 0, s.azakana - dt * 0.9);

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

      // the soul runs out on its own
      if (s.soul > 0 && s.act !== 7) {
        s.soul -= dt;
        if (s.soul <= 0) {
          s.soul = 0.001;
          snapBack(s, env);
        }
      }

      const k0 = depthScale(s, s.m.y);
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

      const dashing = s.act === 3 || s.act === 5 || s.act === 6 || s.act === 7;
      const rooted = s.act === 1 || s.act === 2 || s.act === 4;
      if (!dashing) {
        const sp = SPEED * (s.soul > 0 ? 1.3 : 1) * k0;
        stepMover(s.m, dt, w, span(s) * FS, sp, sp * 16, 46 * k0 * CH, rooted);
        s.m.x = clamp(s.m.x, 0.04, 0.96);
        s.m.y = clamp(s.m.y, 0.02, 0.98);
      } else turnToward(s.m, dt);

      const pose = s.pose;
      if (s.act === 1) {
        const before = s.pt;
        s.pt += dt;
        const q = s.pt / ATTACK;
        const red = s.atkN % 2 === 0;
        // alternate the blue blade and the red one
        if (q < 0.4) mixSword(pose, IDLE, red ? SWEEP_A : RAISE, easeOutCubic(q / 0.4));
        else mixSword(pose, red ? SWEEP_A : RAISE, red ? SWEEP_B : CUT, easeOutBack(Math.min(1, (q - 0.4) / 0.35)));
        if (before < ATTACK * 0.5 && s.pt >= ATTACK * 0.5 && s.chase >= 0) {
          hitMinion(s, env, s.chase, 1, red ? 3 : 0);
          spiritHit(s, s.chase);
          if (!env.reducedMotion) s.stop = 0.04;
          const bus = snd(s, env);
          if (bus) tone(bus, red ? 900 : 1300, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.025, glideTo: 520 });
        }
        if (q >= 1) s.act = 0;
      } else if (s.act === 2) {
        s.pt += dt;
        const q = s.pt / THRUST;
        mixSword(pose, IDLE, STAB, q < 0.35 ? easeOutCubic(q / 0.35) : 1 - easeInOutCubic((q - 0.35) / 0.65) * 0.9);
        if (q >= 1) s.act = 0;
      } else if (s.act === 3) {
        const before = s.pt;
        s.pt += dt;
        const q = Math.min(1, s.pt / Q3);
        const e = easeOutCubic(Math.min(1, q / 0.5));
        place(s.m, lerp(s.fromX, s.toX, e), lerp(s.fromY, s.toY, e));
        if (q < 0.5) mixSword(pose, pose, DASH, 1 - Math.exp(-30 * dt));
        else mixSword(pose, DASH, CUT, easeOutBack(Math.min(1, (q - 0.5) / 0.3)));
        if (before < Q3 * 0.25 && s.pt >= Q3 * 0.25) {
          for (let i = 0; i < s.minions.length; i++) {
            if (!(s.hitMask & (1 << i)) || !s.minions[i].alive) continue;
            s.vair[i] = 520;
            s.air[i] = Math.max(s.air[i], 4);
            hitMinion(s, env, i, 0.9, 0);
            spiritHit(s, i);
          }
          if (s.hitMask && !env.reducedMotion) {
            s.stop = 0.06;
            s.shake = Math.max(s.shake, 0.4);
          }
        }
        if (q < 0.5) emit(s.parts, s.m.x * w + rand(-10, 10) * k0, screenY(s, s.m.y) - rand(30, 110) * k0, -s.dirX * 160 * k0, 0, 0.35, 4 * k0, 0, 3, 0);
        if (q >= 1) {
          s.act = 0;
          halt(s.m);
        }
      } else if (s.act === 4) {
        const before = s.pt;
        s.pt += dt;
        const q = s.pt / CLEAVE;
        if (q < 0.35) mixSword(pose, IDLE, SWEEP_A, easeOutCubic(q / 0.35));
        else mixSword(pose, SWEEP_A, SWEEP_B, easeOutBack(Math.min(1, (q - 0.35) / 0.3)));
        if (before < CLEAVE * 0.45 && s.pt >= CLEAVE * 0.45) cleaveHits(s, env);
        if (q >= 1) s.act = 0;
      } else if (s.act === 5) {
        s.pt += dt;
        const q = Math.min(1, s.pt / SOUL_OUT);
        place(s.m, lerp(s.fromX, s.toX, easeOutCubic(q)), lerp(s.fromY, s.toY, easeOutCubic(q)));
        mixSword(pose, pose, DASH, 1 - Math.exp(-30 * dt));
        // the spirit cuts whatever it passes through on the way out
        for (let i = 0; i < s.minions.length; i++) {
          const m = s.minions[i];
          if (!m.alive || s.spHit & (1 << i)) continue;
          if (planeDist(s, env, s.m.x, s.m.y, m.x, m.y) < 60 * k0) {
            s.spHit |= 1 << i;
            hitMinion(s, env, i, 0.5, 0);
            spiritHit(s, i);
          }
        }
        if (q >= 1) {
          s.act = 0;
          halt(s.m);
        }
      } else if (s.act === 6) {
        const before = s.pt;
        s.pt += dt;
        const t1 = FATE_WIND;
        const t2 = FATE_WIND + FATE_DASH;
        if (s.pt < t1) mixSword(pose, IDLE, DASH, easeOutCubic(s.pt / t1));
        else if (s.pt < t2) {
          const q = (s.pt - t1) / FATE_DASH;
          place(s.m, lerp(s.fromX, s.toX, easeInOutCubic(q)), lerp(s.fromY, s.toY, easeInOutCubic(q)));
          mixSword(pose, DASH, DASH, 1);
        } else {
          place(s.m, s.toX, s.toY);
          const q = clamp((s.pt - t2) / 0.25, 0, 1);
          if (s.pt < t2 + 0.3) mixSword(pose, DASH, CROSS, easeOutBack(q));
          else mixSword(pose, CROSS, IDLE, easeInOutCubic(clamp((s.pt - t2 - 0.3) / 0.4, 0, 1)));
        }
        if (before < t1 && s.pt >= t1) fateDash(s, env);
        if (before < t2 + 0.2 && s.pt >= t2 + 0.2) fateCross(s, env);
        if (s.pt >= FATE) s.act = 0;
      } else if (s.act === 7) {
        const before = s.pt;
        s.pt += dt;
        const q = Math.min(1, s.pt / SNAP);
        place(s.m, lerp(s.fromX, s.bodyX, easeInOutCubic(q)), lerp(s.fromY, s.bodyY, easeInOutCubic(q)));
        s.m.face = s.bodyFace;
        mixSword(pose, KNEEL, IDLE, easeOutCubic(q));
        if (before < SNAP && s.pt >= SNAP) {
          s.soul = 0;
          soulBurst(s, env);
        }
        if (s.pt >= SNAP + 0.12) s.act = 0;
      } else {
        const target = s.m.stride > 0.05 ? RUN : IDLE;
        mixSword(pose, pose, target, 1 - Math.exp(-(s.m.stride > 0.05 ? 10 : 6) * dt));
      }
      pose.walk = s.m.gait;
      pose.stride = s.act === 0 || s.act === 1 ? s.m.stride : 0;
      if (s.soul > 0) mixSword(s.body, s.body, KNEEL, 1 - Math.exp(-8 * dt));
      if (env.reducedMotion && (s.m.going || s.act !== 0 || s.chase >= 0 || s.soul > 0)) env.wake(400);

      // caster bolts at Yone, stopped by the cleave shield
      const yx = s.m.x * w;
      const yy = screenY(s, s.m.y) - 70 * k0;
      for (const b of s.bolts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (Math.hypot(b.x - yx, (b.y - yy) * 0.7) < 26 * k0 * CH && !dashing) {
          b.life = 0;
          if (s.shield > 0) burst(s.parts, 12, b.x, b.y, 0, Math.PI, 220 * k0, 0.4, 3 * k0, 0, 3, 0);
          else {
            s.hurt = 0.25;
            burst(s.parts, 10, b.x, b.y, 0, Math.PI, 200 * k0, 0.4, 3 * k0, 3, 3, 0);
          }
        }
      }

      // minions: the blue wave wades right, fights back, gets pulled, thrown and dropped
      for (let i = 0; i < s.minions.length; i++) {
        const m = s.minions[i];
        if (!m.alive && s.air[i] <= 0) {
          m.respawn -= dt;
          if (m.respawn <= 0 && !(s.act === 6 && s.pulled & (1 << i))) resetMinion(s, i, false);
          continue;
        }
        m.flash = Math.max(0, m.flash - dt);
        if (s.act === 6 && s.pulled & (1 << i)) {
          m.x = damp(m.x, s.pullX[i], 12, dt);
          m.y = damp(m.y, s.pullY[i], 12, dt);
        }
        if (s.air[i] > 0 || s.vair[i] > 0) {
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
        if (s.air[i] <= 0 && !(s.act === 6 && s.pulled & (1 << i))) {
          const d = planeDist(s, env, m.x, m.y, s.m.x, s.m.y);
          const reach = (m.caster ? 300 : 70) * depthScale(s, m.y);
          if (d < reach && m.x > 0.02) {
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
                slot.x = m.x * w + 16 * k;
                slot.y = screenY(s, m.y) - 46 * k;
                const tx = yx - slot.x;
                const ty = yy - slot.y;
                const dd = Math.hypot(tx, ty) || 1;
                slot.vx = (tx / dd) * 300 * k;
                slot.vy = (ty / dd) * 300 * k;
                slot.life = 2;
              } else if (!dashing && s.shield <= 0) s.hurt = Math.max(s.hurt, 0.15);
            }
          } else {
            m.x += dt * 0.035;
            m.step += dt * 7;
            for (let j = 0; j < s.minions.length; j++) {
              if (j === i || !s.minions[j].alive) continue;
              const o = s.minions[j];
              if (Math.abs(o.x - m.x) < 0.04 && Math.abs(o.y - m.y) < 0.12) m.y += Math.sign(m.y - o.y || 1) * dt * 0.08;
            }
            m.y = clamp(m.y, 0.04, 0.96);
          }
        }
        if (m.x > 1.06) resetMinion(s, i, false);
      }

      for (let i = 0; i < 16; i++) {
        s.mist[i * 3] += dt * 0.012 * s.mist[i * 3 + 2];
        if (s.mist[i * 3] > 1.2) s.mist[i * 3] = -0.2;
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
      glow(ctx, s.moon, w * 0.3, s.top * 0.34, 90 * u0, 0.7);
      // low mist: thin hard edged bands drifting over the water instead of a soft haze
      ctx.fillStyle = 'rgba(120,150,230,0.05)';
      for (let i = 0; i < 8; i++) {
        const mx = s.mist[i * 3] * w;
        const my = Math.round(lerp(s.top + 20 * u0, h, s.mist[i * 3 + 1]));
        const len = 220 * u0 * s.mist[i * 3 + 2];
        ctx.fillRect(Math.round(mx - len / 2), my, Math.round(len), Math.max(1, Math.round(3 * u0)));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Yasuo on the far bank, facing his brother
      {
        const k = u0 * 0.62;
        const x = w * 0.08;
        const y = s.top - 14 * u0;
        s.cameo.wind = 0.6 + Math.sin(t * 1.3) * 0.2;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        const cam = s.cameo;
        inked(ctx, (f) => yasuo(ctx, t, cam, f), '#06060c', 1.2, 'rgba(255,110,96,0.9)', -1.6, -1.2);
        ctx.restore();
        ctx.globalAlpha = 1;
        const hd = swordHands(s.cameo);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.white, x + hd.x * k, y + hd.y * k, 16 * k, 0.35);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      drawMarker(ctx, s.marker, depthScale(s, groundY(s, s.marker.y)));
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

      // Fate Sealed: the blue line on the water, telegraphed then cut
      if (s.act === 6) {
        const k = depthScale(s, s.fromY);
        const x0 = s.fromX * w;
        const y0 = screenY(s, s.fromY);
        const x1 = s.toX * w;
        const y1 = screenY(s, s.toY);
        const wind = clamp(s.pt / FATE_WIND, 0, 1);
        const fade = s.pt > FATE_WIND + FATE_DASH ? 1 - clamp((s.pt - FATE_WIND - FATE_DASH) / 0.6, 0, 1) : 1;
        const grow = easeOutCubic(wind);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineCap = 'butt';
        ctx.strokeStyle = `rgba(50,120,255,${(0.28 * fade).toFixed(3)})`;
        ctx.lineWidth = 30 * k;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(lerp(x0, x1, grow), lerp(y0, y1, grow));
        ctx.stroke();
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(150,210,255,${(0.8 * fade).toFixed(3)})`;
        ctx.lineWidth = (s.pt > FATE_WIND ? 7 : 2.5) * k;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
        ctx.lineWidth = 1.6 * k;
        ctx.stroke();
        glow(ctx, s.blue, lerp(x0, x1, grow), lerp(y0, y1, grow) - 10 * k, 30 * k, 0.8 * fade);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // Soul Unbound: the tether from the waiting body to the spirit
      const soul = s.soul > 0;
      if (soul) {
        const k = depthScale(s, s.bodyY);
        const bx = s.bodyX * w;
        const by = screenY(s, s.bodyY) - 60 * k;
        const sx = s.m.x * w;
        const sy = screenY(s, s.m.y) - 70 * depthScale(s, s.m.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(120,190,255,0.5)';
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + sx) / 2, Math.min(by, sy) - 40 * k + Math.sin(t * 6) * 8 * k, sx, sy);
        ctx.stroke();
        // how long the soul has left, as a ring closing around the body
        ctx.strokeStyle = 'rgba(150,200,255,0.6)';
        ctx.lineWidth = 2.5 * k;
        ctx.beginPath();
        ctx.ellipse(s.bodyX * w, screenY(s, s.bodyY), 40 * k, 12 * k, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (s.soul / SOUL_TIME));
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      // depth sort Yone (-1), the waiting body (-2) and the minions
      ORDER.length = 0;
      DEPTH.length = 0;
      ORDER.push(-1);
      DEPTH.push(s.m.y + 0.001);
      if (soul) {
        ORDER.push(-2);
        DEPTH.push(s.bodyY + 0.002);
      }
      for (let i = 0; i < s.minions.length; i++) {
        if (!s.minions[i].alive && s.air[i] <= 0) continue;
        ORDER.push(i);
        DEPTH.push(s.minions[i].y);
      }
      depthSort(ORDER, DEPTH);

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
          ctx.save();
          ctx.translate(x, y - air);
          if (s.air[idx] > 0) ctx.rotate(Math.sin(s.air[idx] * 0.02 + idx) * 0.5);
          ctx.globalAlpha = m.alive ? 1 : Math.max(0, s.air[idx] / 60);
          const faceIn = m.x > s.m.x ? 1 : -1;
          ctx.scale(k * faceIn * 1.08, k * 1.08);
          drawMinion(ctx, m, t, 'blue');
          ctx.restore();
          ctx.globalAlpha = 1;
          if (m.alive) {
            healthBar(ctx, x, y - air - 78 * k, 32 * k, k, m.hp / 3, '#e8413c');
            if (s.marks & (1 << idx)) {
              // the spirit's mark waiting to burst
              ctx.globalCompositeOperation = 'lighter';
              glow(ctx, s.blue, x, y - air - 34 * k, 30 * k, 0.5 + Math.sin(t * 14) * 0.2);
              ctx.strokeStyle = 'rgba(170,220,255,0.8)';
              ctx.lineWidth = 1.6 * k;
              ctx.beginPath();
              ctx.moveTo(x - 10 * k, y - air - 96 * k);
              ctx.lineTo(x + 10 * k, y - air - 86 * k);
              ctx.moveTo(x + 10 * k, y - air - 96 * k);
              ctx.lineTo(x - 10 * k, y - air - 86 * k);
              ctx.stroke();
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = 1;
            }
          }
          continue;
        }
        if (idx === -2) {
          // the body, kneeling and dimmed while the spirit is away
          const k = depthScale(s, s.bodyY) * CH;
          const x = s.bodyX * w;
          const y = screenY(s, s.bodyY);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(x, y, 34 * k, 8 * k, 0, 0, TAU);
          ctx.fill();
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(k * s.bodyFace, k);
          const body = s.body;
          inked(ctx, (f) => yone(ctx, t, body, f), '#05060c', 1.2, null);
          ctx.restore();
          ctx.globalAlpha = 1;
          continue;
        }
        // Yone, or his spirit while the soul is out
        const k = depthScale(s, s.m.y) * CH;
        const x = s.m.x * w;
        const y = screenY(s, s.m.y);
        const ts = turnScale(s.m);
        // the Azakana looming over his shoulder
        azakana(ctx, s, x - s.m.face * 40 * k, y - 150 * k + Math.sin(t * 1.7) * 4 * k, 34 * k, s.azakana, t, s.m.face);
        if (!soul) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.ellipse(x, y, 34 * k, 8 * k, 0, 0, TAU);
          ctx.fill();
        }
        for (let i = 0; i < 2; i++) {
          const on = s.stacks > i;
          const px = Math.round(x + (i - 0.5) * 14 * k);
          const py = Math.round(y + 13 * k);
          ctx.fillStyle = on ? '#d6ecff' : 'rgba(16,20,40,0.75)';
          ctx.strokeStyle = on ? '#4a8cff' : 'rgba(140,160,220,0.5)';
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
        const fast = (s.act === 6 && s.pt > FATE_WIND && s.pt < FATE_WIND + FATE_DASH) || s.act === 3 || s.act === 5;
        if (fast) {
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i <= 4; i++) {
            const q = i / 5;
            ctx.save();
            ctx.translate(lerp(x, s.fromX * w, q * 0.6), lerp(y, screenY(s, s.fromY), q * 0.6));
            ctx.scale(k * s.m.face, k);
            ctx.globalAlpha = 0.3 * (1 - q);
            yone(ctx, t, s.pose, 'rgba(90,160,255,1)');
            ctx.restore();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k * ts, k);
        const pose = s.pose;
        if (soul) {
          // the spirit: a solid blue double with a bright crisp edge and his features ghosted in
          inked(ctx, (f) => yone(ctx, t, pose, f), '#cfeaff', 1.1, null);
          yone(ctx, t, pose, '#2a5cc4');
          ctx.globalAlpha = 0.3;
          yone(ctx, t, pose, null);
          ctx.globalAlpha = 1;
        } else {
          // ink outline, a blood moon rim on the moon side (hot red when hit), then Yone
          inked(ctx, (f) => yone(ctx, t, pose, f), '#05060c', 1.25, s.hurt > 0 ? '#ff4a3c' : '#c24a46', -1.4, -1);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        const hd = swordHands(s.pose);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.blue, x + hd.x * k * ts, y + hd.y * k, 22 * k, 0.55 + Math.sin(t * 3) * 0.1);
        glow(ctx, s.red, x + hd.x2 * k * ts, y + hd.y2 * k, 16 * k, 0.45);
        if (soul) glow(ctx, s.blue, x, y - 70 * k, 50 * k, 0.25);
        if (s.shield > 0) {
          // the Spirit Cleave shield: a pale shell around him
          const a = Math.min(1, s.shield * 2);
          ctx.strokeStyle = `rgba(190,225,255,${(0.45 * a).toFixed(3)})`;
          ctx.lineWidth = 2 * k / CH;
          ctx.beginPath();
          ctx.ellipse(x, y - 62 * k, 44 * k, 70 * k, 0, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = `rgba(190,225,255,${(0.25 * a).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x, y - 62 * k, 48 * k, 75 * k, 0, 0, TAU);
          ctx.stroke();
        }
        // the thrust streak, attack and cleave crescents
        const k1 = k / CH;
        if (s.act === 2) {
          const q = s.pt / THRUST;
          const a = Math.sin(Math.min(1, q) * Math.PI);
          const x1 = x + s.dirX * Q_RANGE * k1;
          const y1 = y - 80 * k1 + (s.dirY * Q_RANGE * k1) / FS;
          const x0 = x + s.dirX * 40 * k1;
          const y0 = y - 80 * k1 + (s.dirY * 40 * k1) / FS;
          const grow = easeOutCubic(Math.min(1, q * 2.2));
          const ex = lerp(x0, x1, grow);
          const ey = lerp(y0, y1, grow);
          const nl = Math.hypot(ey - y0, ex - x0) || 1;
          const nx = -(ey - y0) / nl;
          const ny = (ex - x0) / nl;
          const hw = 8 * k1 * a;
          ctx.fillStyle = `rgba(90,160,255,${(0.55 * a).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(x0 + nx * hw * 0.4, y0 + ny * hw * 0.4);
          ctx.lineTo(lerp(x0, ex, 0.7) + nx * hw, lerp(y0, ey, 0.7) + ny * hw);
          ctx.lineTo(ex, ey);
          ctx.lineTo(lerp(x0, ex, 0.7) - nx * hw, lerp(y0, ey, 0.7) - ny * hw);
          ctx.lineTo(x0 - nx * hw * 0.4, y0 - ny * hw * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.lineWidth = 2 * k1;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          glow(ctx, s.blue, ex, ey, 14 * k1, a * 0.8);
        }
        if (s.act === 4 || s.act === 1) {
          const dur = s.act === 4 ? CLEAVE : ATTACK;
          const q = s.pt / dur;
          const a = q > 0.35 ? Math.sin(clamp((q - 0.35) / 0.65, 0, 1) * Math.PI) : 0;
          if (a > 0) {
            const big = s.act === 4 ? 1 : 0.6;
            const cx = x + s.dirX * 60 * k1;
            const cy = y - 60 * k1 + (s.dirY * 30 * k1) / FS;
            const base = Math.atan2(s.dirY * 0.55, s.dirX);
            if (s.act === 4 || s.atkN % 2 === 1) crescent(ctx, cx, cy, 100 * k1 * big, base - 1.1, base + 1.1, k1, a, 'rgba(90,170,255,A)');
            if (s.act === 4 || s.atkN % 2 === 0) crescent(ctx, cx, cy + 6 * k1, 84 * k1 * big, base - 0.9, base + 0.9, k1, a * 0.8, 'rgba(255,50,70,A)');
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // the crossed cut at the end of Fate Sealed
      if (s.act === 6 && s.pt > FATE_WIND + FATE_DASH + 0.15) {
        const q = clamp((s.pt - FATE_WIND - FATE_DASH - 0.15) / 0.5, 0, 1);
        const a = 1 - q;
        const k = depthScale(s, s.toY);
        const x = s.toX * w + s.m.face * 40 * k;
        const y = screenY(s, s.toY) - 90 * k;
        const r = lerp(60, 130, easeOutCubic(q)) * k;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.blue, x, y, r, 0.35 * a);
        ctx.lineCap = 'round';
        for (const [sgn, col] of [
          [1, '90,170,255'],
          [-1, '255,60,80'],
        ] as const) {
          ctx.strokeStyle = `rgba(${col},${(0.5 * a).toFixed(3)})`;
          ctx.lineWidth = 12 * k * a + 1;
          ctx.beginPath();
          ctx.moveTo(x - r, y - r * sgn * 0.8);
          ctx.lineTo(x + r, y + r * sgn * 0.8);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.lineWidth = 2.5 * k;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bolts) if (b.life > 0) glow(ctx, s.blue, b.x, b.y, 12 * u0, 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // particles: 0 blue spirit, 1 white, 2 water spray, 3 red Azakana sparks
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== 2) continue;
        const q = p.life / p.max;
        ctx.fillStyle = `rgba(170,190,230,${(0.55 * q).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + q * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind === 2) continue;
        const q = p.life / p.max;
        // short streaks along the motion, sharp at any pixel ratio
        const sp = Math.hypot(p.vx, p.vy);
        const len = clamp(sp * 0.03, p.size * 0.6, p.size * 6);
        const ux = sp > 1 ? p.vx / sp : 1;
        const uy = sp > 1 ? p.vy / sp : 0;
        ctx.strokeStyle =
          p.kind === 0
            ? `rgba(130,190,255,${(0.85 * q).toFixed(3)})`
            : p.kind === 1
              ? `rgba(255,255,255,${q.toFixed(3)})`
              : `rgba(255,70,80,${q.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, p.size * 0.45 * (0.5 + q * 0.5));
        ctx.beginPath();
        ctx.moveTo(p.x - ux * len, p.y - uy * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      drawHoldRing(ctx, s.g, u0, '120,190,255');
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(110,170,255,${(s.flash * 0.2).toFixed(3)})`;
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
        sl[1].lit = s.shield > 0;
        sl[2].cd = s.soul > 0 ? 0 : s.cdE;
        sl[2].lit = s.soul > 0;
        sl[3].cd = s.cdR;
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
      freeCanvas(s.bg, s.blue, s.red, s.white, s.moon);
      s.bg = null;
    },
  });
