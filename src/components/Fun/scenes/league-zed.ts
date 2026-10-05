import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, makePool, mulberry, shakeX, shakeY, stepPool } from './heroes-kit';
import type { Pool } from './heroes-kit';
import { bone, chain, dirX, dirY, ik, lantern, pagoda, peaks, ribbon, roof, taper } from './ionia-kit';
import {
  abilityKey,
  backdropLayer,
  drawAbilityBar,
  drawBackdrop,
  drawHoldRing,
  drawMarker,
  gestureDown,
  gestureMove,
  gestureTick,
  gestureUp,
  halt,
  makeGesture,
  makeMarker,
  makeMover,
  moveTo,
  pointerButtons,
  setMarker,
  snap,
  stepMover,
  turnScale,
} from './league-kit';
import type { AbilitySlot, Command, Gesture, Marker, Mover } from './league-kit';

/**
 * Zed, Master of Shadows: on a temple rooftop under a huge Ionian moon, Zed stalks the ridge in
 * his horned shuriken helmet, eye slits burning red, blades out on both wrists and a torn red
 * scarf streaming behind him, with straw training posts lined up along the ridge.
 * Click or tap the roof to run there, click a post to cut it with the wrist blades.
 * Razor Shuriken (Q) throws toward the pointer and every Living Shadow throws one too.
 * Living Shadow (W) sends a shadow to the pointer; cast it again, or tap the shadow, to swap.
 * Shadow Slash (E) spins the blades around Zed and every shadow at once. Death Mark (R) melts
 * him into the dark, leaves a shadow behind, reappears behind the post and cuts; the mark spins
 * and stores every hit, then pops with hit-stop and he swaps back to where he started.
 * Everything is flat vector with an ink outline so it stays sharp at any pixel ratio.
 */

interface ZedPose {
  /** 0 standing, 1 deep crouch */
  cr: number;
  /** torso lean, forward positive */
  ln: number;
  hd: number;
  /** foot x and lift */
  fF: number;
  fB: number;
  lF: number;
  lB: number;
  /** shoulder and elbow angles, from straight down toward the facing side */
  sF: number;
  eF: number;
  sB: number;
  eB: number;
}

interface Shadow {
  x: number;
  tx: number;
  face: number;
  life: number;
  age: number;
  /** 0 Living Shadow, 1 the one Death Mark leaves behind */
  kind: number;
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  rot: number;
  hit: number;
  big: number;
}

interface Dummy {
  x: number;
  hp: number;
  wob: number;
  wobV: number;
  flash: number;
  /** side the last hit came from, for the impact spark */
  hitDir: number;
  dead: boolean;
  respawn: number;
  rise: number;
  cut: number;
  fx: number;
  fy: number;
  fvx: number;
  fvy: number;
  fr: number;
  fvr: number;
}

interface State {
  x: number;
  face: number;
  alpha: number;
  m: Mover;
  g: Gesture;
  ac: AbortController | null;
  marker: Marker;
  chase: number;
  atkCd: number;
  atkN: number;
  cdQ: number;
  cdW: number;
  cdE: number;
  cdR: number;
  slots: AbilitySlot[];
  slotFlash: Float32Array;
  buf: Command;
  bufX: number;
  bufY: number;
  bufT: number;
  // 0 idle, 1 throw, 2 death mark, 3 swap, 4 cast shadow, 5 step home, 6 shadow slash, 7 basic attack
  act: number;
  pt: number;
  /** the strike of the current action has landed */
  struck: boolean;
  aimX: number;
  aimY: number;
  fromX: number;
  toX: number;
  target: number;
  markI: number;
  markT: number;
  markHits: number;
  popT: number;
  swapTo: number;
  /** the crisp flash on both ends of a swap */
  swapFx: number;
  swapA: number;
  swapB: number;
  /** where the last basic attack landed */
  atkX: number;
  shadows: Shadow[];
  stars: Star[];
  dummies: Dummy[];
  pose: ZedPose;
  /** the pose as drawn: pose plus the run cycle */
  dpose: ZedPose;
  src: ZedPose;
  aimPose: ZedPose;
  wind: number;
  clock: number;
  touched: boolean;
  quiet: boolean;
  idle: number;
  still: number;
  autoT: number;
  autoStep: number;
  stop: number;
  shake: number;
  flash: number;
  parts: Pool;
  leaves: Float32Array;
  clouds: Float32Array;
  u: number;
  K: number;
  ridge: number;
  bg: HTMLCanvasElement | null;
  red: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

type C = CanvasRenderingContext2D;

const HOME = 0.24;
const POSTS = [0.55, 0.72, 0.89];
const THROW = 0.3;
const CAST = 0.3;
const SWAP = 0.24;
const STEP_HOME = 0.5;
const VANISH = 0.16;
const APPEAR = 0.3;
const MARK_END = 0.86;
const MARK = 1.7;
const SLASHE = 0.34;
const ATTACK = 0.3;
const ATK_RANGE = 96;
const SPEED = 430;
const LEAVES = 12;
/** cooldowns, short enough to play with, long enough that the bar means something */
const Q_CD = 0.9;
const W_CD = 2.6;
const E_CD = 1.2;
const R_CD = 5.5;
/** a command pressed this close to being ready is kept and fired the moment it can */
const BUFFER = 0.5;

const IDLE: ZedPose = { cr: 0.42, ln: 0.14, hd: -0.06, fF: 26, fB: -26, lF: 0, lB: 0, sF: 0.75, eF: 1.0, sB: -0.85, eB: 0.5 };
const WIND: ZedPose = { cr: 0.45, ln: -0.04, hd: 0, fF: 26, fB: -30, lF: 0, lB: 0, sF: -0.9, eF: 2.4, sB: 0.7, eB: 0.9 };
const LOOSE: ZedPose = { cr: 0.62, ln: 0.4, hd: 0.08, fF: 40, fB: -36, lF: 0, lB: 4, sF: 1.6, eF: 0.1, sB: -1.5, eB: 0.2 };
const CASTP: ZedPose = { cr: 0.5, ln: 0.3, hd: 0.05, fF: 34, fB: -32, lF: 0, lB: 0, sF: 1.3, eF: 0.15, sB: -0.9, eB: 1.9 };
const CROUCH: ZedPose = { cr: 1, ln: 0.5, hd: 0.2, fF: 24, fB: -30, lF: 0, lB: 0, sF: 0.3, eF: 0.4, sB: -0.4, eB: 0.4 };
const RAISE: ZedPose = { cr: 0.3, ln: -0.12, hd: -0.15, fF: 30, fB: -26, lF: 0, lB: 0, sF: 2.7, eF: 0.5, sB: 2.2, eB: 0.9 };
const SLASH: ZedPose = { cr: 0.95, ln: 0.55, hd: 0.15, fF: 46, fB: -38, lF: 0, lB: 6, sF: 0.55, eF: 0.25, sB: 1.2, eB: 0.2 };
const DASHP: ZedPose = { cr: 0.8, ln: 0.75, hd: -0.2, fF: 36, fB: -48, lF: 10, lB: 16, sF: -0.9, eF: 0.5, sB: -1.3, eB: 0.2 };
const LAND: ZedPose = { cr: 0.85, ln: 0.35, hd: 0.1, fF: 34, fB: -32, lF: 0, lB: 0, sF: 0.7, eF: 1.3, sB: -1.4, eB: 0.5 };
/** the ninja run: low, chest forward, both blades swept back */
const RUN: ZedPose = { cr: 0.5, ln: 0.5, hd: -0.25, fF: 6, fB: -6, lF: 0, lB: 0, sF: -0.75, eF: 0.4, sB: -1.1, eB: 0.3 };
const SPIN_A: ZedPose = { cr: 0.75, ln: 0.1, hd: 0, fF: 36, fB: -38, lF: 0, lB: 0, sF: 1.9, eF: 0.2, sB: -1.9, eB: 0.2 };
const SPIN_B: ZedPose = { cr: 0.85, ln: 0.3, hd: 0.1, fF: 40, fB: -36, lF: 0, lB: 0, sF: -1.6, eF: 0.3, sB: 1.7, eB: 0.2 };

const KEYS = Object.keys(IDLE) as (keyof ZedPose)[];
function mix(o: ZedPose, a: ZedPose, b: ZedPose, k: number) {
  for (const key of KEYS) o[key] = lerp(a[key], b[key], k);
}

/* ---------- the rig ---------- */

const R = {
  hx: 0, hy: 0, nx: 0, ny: 0, hdx: 0, hdy: 0, rot: 0,
  sFx: 0, sFy: 0, eFx: 0, eFy: 0, aFx: 0, aFy: 0,
  sBx: 0, sBy: 0, eBx: 0, eBy: 0, aBx: 0, aBy: 0,
  kFx: 0, kFy: 0, kBx: 0, kBy: 0,
};

/** Torso local point to figure space */
function tl(x: number, y: number, out: [number, number]) {
  const cs = Math.cos(R.rot);
  const sn = Math.sin(R.rot);
  out[0] = R.hx + x * cs - y * sn;
  out[1] = R.hy + x * sn + y * cs;
  return out;
}
const TMP: [number, number] = [0, 0];
const HIP: [number, number] = [0, 0];
/** helmet scale */
const HS = 1.04;

function rig(p: ZedPose) {
  R.hx = -p.cr * 4 + p.ln * 6;
  R.hy = -100 + p.cr * 24;
  R.rot = p.ln;
  tl(0, -62, TMP);
  R.nx = TMP[0];
  R.ny = TMP[1];
  tl(5, -80, TMP);
  R.hdx = TMP[0];
  R.hdy = TMP[1];
  tl(10, -56, TMP);
  R.sFx = TMP[0];
  R.sFy = TMP[1];
  tl(-8, -57, TMP);
  R.sBx = TMP[0];
  R.sBy = TMP[1];
  R.eFx = R.sFx + dirX(p.sF) * 31;
  R.eFy = R.sFy + dirY(p.sF) * 31;
  R.aFx = R.eFx + dirX(p.sF + p.eF) * 30;
  R.aFy = R.eFy + dirY(p.sF + p.eF) * 30;
  R.eBx = R.sBx + dirX(p.sB) * 31;
  R.eBy = R.sBy + dirY(p.sB) * 31;
  R.aBx = R.eBx + dirX(p.sB + p.eB) * 30;
  R.aBy = R.eBy + dirY(p.sB + p.eB) * 30;
  const hf = tl(4, 0, TMP);
  [R.kFx, R.kFy] = ik(hf[0], hf[1], p.fF, -p.lF - 4, 48, 50, 1);
  const hb = tl(-4, 0, TMP);
  [R.kBx, R.kBy] = ik(hb[0], hb[1], p.fB, -p.lB - 4, 48, 50, 1);
}

/** Where the eye slits sit after rig(p) */
const eyeX = (p: ZedPose) => R.hdx + (12 * Math.cos(R.rot + p.hd) + Math.sin(R.rot + p.hd)) * HS;
const eyeY = (p: ZedPose) => R.hdy + (12 * Math.sin(R.rot + p.hd) - Math.cos(R.rot + p.hd)) * HS;

/* ---------- Zed: flat plates, silver edges, red trim ---------- */

const PAL = {
  cloth: ['#0a090e', '#131219', '#1c1a24'],
  /** dark gunmetal, plate, raised plate */
  armor: ['#15151c', '#23242d', '#30323d', '#444757'],
  edge: '#b9c1d4',
  edgeDim: '#6d7386',
  red: ['#5a0812', '#a3101e', '#e3202f', '#ff5a60'],
  steel: ['#727b8e', '#c9d1e0', '#f6f9ff'],
};

const CX = new Float32Array(16);
const CY = new Float32Array(16);

/** Eye colour used by a flat pass; null paints the eyes in the flat colour too */
let eyeFlat: string | null = null;

function line(c: C, col: string, lw: number) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.stroke();
}

function blades(c: C, len: number, flat: string | null, front: boolean) {
  // two curved wrist blades riding the back of the forearm and reaching well past the fist
  const scale = front ? 1 : 0.92;
  for (let b = 0; b < 2; b++) {
    const off = b * 5;
    const L = (b ? 38 : 54) * scale;
    c.fillStyle = flat ?? (b ? PAL.steel[0] : front ? PAL.steel[1] : PAL.steel[0]);
    c.beginPath();
    c.moveTo(3 + off, 6);
    c.bezierCurveTo(12 + off, 20, 14 + off, len + L * 0.4, 7 + off * 0.6, len + L);
    c.bezierCurveTo(7.5 + off * 0.5, len + L * 0.45, 4.5 + off, 24, -1 + off, 12);
    c.closePath();
    c.fill();
    if (!flat) {
      c.beginPath();
      c.moveTo(4 + off, 8);
      c.bezierCurveTo(12.5 + off, 21, 13.5 + off, len + L * 0.4, 7 + off * 0.6, len + L);
      line(c, b ? PAL.steel[1] : PAL.steel[2], 1.1);
    }
  }
}

function arm(c: C, front: boolean, flat: string | null) {
  const sx = front ? R.sFx : R.sBx;
  const sy = front ? R.sFy : R.sBy;
  const ex = front ? R.eFx : R.eBx;
  const ey = front ? R.eFy : R.eBy;
  const ax = front ? R.aFx : R.aBx;
  const ay = front ? R.aFy : R.aBy;
  bone(c, sx, sy, ex, ey, (len) => {
    c.fillStyle = flat ?? PAL.cloth[front ? 2 : 1];
    taper(c, len, 12, 10, 0.2);
    c.fill();
    if (!flat) {
      c.fillStyle = PAL.cloth[0];
      c.fillRect(-5, len * 0.55, 10, 2.2);
    }
  });
  bone(c, ex, ey, ax, ay, (len) => {
    c.fillStyle = flat ?? PAL.cloth[1];
    taper(c, len, 10, 8, 0.1);
    c.fill();
    blades(c, len, flat, front);
    // gauntlet with a flared cuff
    c.fillStyle = flat ?? PAL.armor[front ? 2 : 1];
    c.beginPath();
    c.moveTo(-6.5, len * 0.28);
    c.lineTo(8, len * 0.1);
    c.lineTo(6.5, len + 2);
    c.lineTo(-5, len + 1);
    c.closePath();
    c.fill();
    if (!flat) {
      c.beginPath();
      c.moveTo(8, len * 0.1);
      c.lineTo(6.5, len + 1.5);
      line(c, front ? PAL.edge : PAL.edgeDim, 1.2);
      c.beginPath();
      c.moveTo(1.5, len * 0.32);
      c.lineTo(1, len * 0.92);
      line(c, front ? PAL.red[2] : PAL.red[1], 1.6);
    }
    // fist
    c.fillStyle = flat ?? PAL.armor[front ? 1 : 0];
    c.beginPath();
    c.ellipse(0, len + 4, 5.5, 6, 0, 0, TAU);
    c.fill();
  });
}

function pauldron(c: C, front: boolean, flat: string | null, sway: number) {
  const x = front ? R.sFx : R.sBx;
  const y = front ? R.sFy : R.sBy;
  c.save();
  c.translate(x, y - 2);
  c.rotate(R.rot * 0.6 + sway);
  const s = front ? 0.92 : 0.82;
  c.scale(s, s);
  // a swept fin rising off the back of the guard
  c.fillStyle = flat ?? PAL.armor[0];
  c.beginPath();
  c.moveTo(2, -10);
  c.quadraticCurveTo(-10, -16, -24, -28);
  c.quadraticCurveTo(-16, -8, -11, 2);
  c.closePath();
  c.fill();
  // the rounded guard itself
  c.fillStyle = flat ?? PAL.armor[front ? 2 : 1];
  c.beginPath();
  c.moveTo(-12, 10);
  c.bezierCurveTo(-15, -8, -4, -15, 6, -13);
  c.bezierCurveTo(15, -11, 18, 0, 15, 11);
  c.quadraticCurveTo(2, 6, -12, 10);
  c.closePath();
  c.fill();
  if (!flat) {
    c.beginPath();
    c.moveTo(14, 9);
    c.quadraticCurveTo(2, 4, -11, 8);
    line(c, front ? PAL.red[2] : PAL.red[1], 1.8);
    c.beginPath();
    c.moveTo(-10, -4);
    c.bezierCurveTo(-8, -11, 2, -14, 10, -11);
    line(c, front ? PAL.edge : PAL.edgeDim, 1.3);
    c.beginPath();
    c.moveTo(1, -10);
    c.quadraticCurveTo(-10, -15, -22, -26);
    line(c, PAL.edgeDim, 1);
  }
  c.restore();
}

function leg(c: C, p: ZedPose, front: boolean, flat: string | null) {
  const hip = tl(front ? 4 : -4, 0, HIP);
  const hx = hip[0];
  const hy = hip[1];
  const kx = front ? R.kFx : R.kBx;
  const ky = front ? R.kFy : R.kBy;
  const fx = front ? p.fF : p.fB;
  const fy = -(front ? p.lF : p.lB) - 4;
  bone(c, hx, hy, kx, ky, (len) => {
    c.fillStyle = flat ?? PAL.cloth[front ? 2 : 1];
    taper(c, len, 17, 12, 0.2);
    c.fill();
    if (!flat) {
      c.fillStyle = PAL.cloth[0];
      c.fillRect(-7.5, len * 0.32, 15, 2);
      c.fillRect(-7, len * 0.64, 14, 2);
    }
  });
  bone(c, kx, ky, fx, fy, (len) => {
    c.fillStyle = flat ?? PAL.cloth[1];
    taper(c, len, 11, 8, 0.1);
    c.fill();
    // greave
    c.fillStyle = flat ?? PAL.armor[front ? 2 : 1];
    c.beginPath();
    c.moveTo(-6.5, len * 0.12);
    c.quadraticCurveTo(0, -3, 8, len * 0.08);
    c.lineTo(6, len * 0.95);
    c.lineTo(-5, len * 0.95);
    c.closePath();
    c.fill();
    if (!flat) {
      c.beginPath();
      c.moveTo(8, len * 0.1);
      c.lineTo(6, len * 0.93);
      line(c, front ? PAL.edge : PAL.edgeDim, 1.1);
      c.beginPath();
      c.moveTo(2.5, len * 0.22);
      c.lineTo(1.5, len * 0.86);
      line(c, front ? PAL.red[2] : PAL.red[1], 1.3);
    }
  });
  // knee guard with a forward spike
  c.fillStyle = flat ?? PAL.armor[front ? 3 : 1];
  c.beginPath();
  c.moveTo(kx - 6, ky - 5);
  c.quadraticCurveTo(kx + 3, ky - 10, kx + 13, ky - 3);
  c.lineTo(kx + 5, ky + 2);
  c.quadraticCurveTo(kx, ky + 7, kx - 5, ky + 3);
  c.closePath();
  c.fill();
  // split toe boot
  c.fillStyle = flat ?? PAL.armor[front ? 1 : 0];
  c.beginPath();
  c.moveTo(fx - 7, fy + 4);
  c.lineTo(fx - 6, fy - 6);
  c.quadraticCurveTo(fx + 4, fy - 7, fx + 17, fy + 3);
  c.lineTo(fx + 17, fy + 4);
  c.closePath();
  c.fill();
}

function torso(c: C, flat: string | null, breath: number) {
  c.save();
  c.translate(R.hx, R.hy);
  c.rotate(R.rot);
  c.scale(0.86, 1);
  // under layer
  c.fillStyle = flat ?? PAL.cloth[1];
  c.beginPath();
  c.moveTo(-14, 4);
  c.quadraticCurveTo(-17, -26, -20, -50);
  c.quadraticCurveTo(-16, -64, -7, -66);
  c.lineTo(11, -66);
  c.quadraticCurveTo(25, -61, 25, -48 - breath);
  c.quadraticCurveTo(18, -28, 15, 4);
  c.closePath();
  c.fill();
  // chest plate, broad at the top and cut in a V to the waist
  c.fillStyle = flat ?? PAL.armor[2];
  c.beginPath();
  c.moveTo(-17, -57);
  c.quadraticCurveTo(0, -67 - breath, 23, -59 - breath);
  c.quadraticCurveTo(29, -46, 20, -30);
  c.lineTo(6, -22);
  c.lineTo(-12, -29);
  c.quadraticCurveTo(-20, -42, -17, -57);
  c.closePath();
  c.fill();
  if (!flat) {
    // the darker side of the chest, a hard terminator instead of a gradient
    c.fillStyle = PAL.armor[1];
    c.beginPath();
    c.moveTo(-17, -57);
    c.quadraticCurveTo(-6, -62, 4, -63);
    c.quadraticCurveTo(8, -44, 5, -23);
    c.lineTo(-12, -29);
    c.quadraticCurveTo(-20, -42, -17, -57);
    c.closePath();
    c.fill();
    // the red chest lines: a V running down from the collar
    c.beginPath();
    c.moveTo(15, -59);
    c.quadraticCurveTo(22, -46, 9, -27);
    c.moveTo(-6, -60);
    c.quadraticCurveTo(-1, -44, 6, -27);
    line(c, PAL.red[2], 2);
    // cold edge along the top of the plate
    c.beginPath();
    c.moveTo(-14, -57);
    c.quadraticCurveTo(4, -65, 22, -58);
    line(c, PAL.edge, 1.3);
    // segmented abdomen
    for (let i = 0; i < 3; i++) {
      const y = -20 + i * 7;
      c.fillStyle = i % 2 ? PAL.armor[1] : PAL.armor[3];
      c.beginPath();
      c.moveTo(-10, y);
      c.lineTo(15 - i, y - 1);
      c.lineTo(14 - i, y + 4.5);
      c.lineTo(-10, y + 4.5);
      c.closePath();
      c.fill();
    }
  }
  // belt and the red knot
  c.fillStyle = flat ?? PAL.cloth[0];
  c.fillRect(-15, -2, 31, 7);
  if (!flat) {
    c.fillStyle = PAL.red[2];
    c.beginPath();
    c.moveTo(9, -3);
    c.lineTo(16, 1.5);
    c.lineTo(9, 6);
    c.lineTo(3, 1.5);
    c.closePath();
    c.fill();
  }
  // hip plates hanging over the thighs
  for (let sd = -1; sd <= 1; sd += 2) {
    c.fillStyle = flat ?? (sd > 0 ? PAL.armor[2] : PAL.armor[1]);
    c.beginPath();
    c.moveTo(sd * 4, 4);
    c.lineTo(sd * 18, 3);
    c.lineTo(sd * 21, 20);
    c.lineTo(sd * 9, 24);
    c.closePath();
    c.fill();
    if (!flat && sd > 0) {
      c.beginPath();
      c.moveTo(18, 4);
      c.lineTo(21, 19);
      line(c, PAL.edgeDim, 1);
    }
  }
  // high collar
  c.fillStyle = flat ?? PAL.armor[1];
  c.beginPath();
  c.moveTo(-10, -60);
  c.lineTo(-8, -74);
  c.quadraticCurveTo(4, -79, 14, -72);
  c.lineTo(17, -60);
  c.quadraticCurveTo(4, -64, -10, -60);
  c.closePath();
  c.fill();
  c.restore();
}

function helmet(c: C, p: ZedPose, flat: string | null, eyes: number) {
  c.save();
  c.translate(R.hdx, R.hdy);
  c.rotate(R.rot + p.hd);
  c.scale(HS, HS);
  // far horn blade, behind the dome
  c.fillStyle = flat ?? PAL.armor[0];
  c.beginPath();
  c.moveTo(-2, -8);
  c.bezierCurveTo(-8, -22, -22, -34, -44, -38);
  c.bezierCurveTo(-28, -28, -18, -16, -12, -2);
  c.closePath();
  c.fill();
  // hood falling from the back of the helmet
  c.fillStyle = flat ?? PAL.cloth[1];
  c.beginPath();
  c.moveTo(-8, -10);
  c.quadraticCurveTo(-19, 2, -13, 18);
  c.lineTo(4, 16);
  c.closePath();
  c.fill();
  // dome
  c.fillStyle = flat ?? PAL.armor[2];
  c.beginPath();
  c.moveTo(-12, 6);
  c.bezierCurveTo(-16, -10, -6, -18, 5, -16);
  c.bezierCurveTo(13, -14, 17, -6, 16, 2);
  c.lineTo(16, 6);
  c.lineTo(11, 15);
  c.lineTo(3, 17);
  c.lineTo(-4, 12);
  c.closePath();
  c.fill();
  // face plate: a dark visor with a pointed chin
  c.fillStyle = flat ?? '#060509';
  c.beginPath();
  c.moveTo(4, -6);
  c.lineTo(17, -5);
  c.lineTo(17, 5);
  c.lineTo(10.5, 16);
  c.lineTo(5, 13);
  c.quadraticCurveTo(2, 4, 4, -6);
  c.closePath();
  c.fill();
  if (!flat) {
    // cheek plate, the red brow and a cold edge over the dome
    c.fillStyle = PAL.armor[3];
    c.beginPath();
    c.moveTo(2, 2);
    c.lineTo(8.5, 5.5);
    c.lineTo(7.5, 14);
    c.lineTo(1, 10.5);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-4, -11);
    c.quadraticCurveTo(7, -11.5, 17, -5.5);
    line(c, PAL.red[2], 1.6);
    c.beginPath();
    c.moveTo(-10, -7);
    c.bezierCurveTo(-8, -14, 2, -17, 10, -14);
    line(c, PAL.edge, 1.2);
  }
  // burning eye slits, angled down toward the nose
  c.fillStyle = flat ? eyeFlat ?? flat : eyes > 0.5 ? '#ff4d55' : '#c01828';
  c.beginPath();
  c.moveTo(5.5, -3.6);
  c.lineTo(13, -0.6);
  c.lineTo(12.5, 1.5);
  c.lineTo(6, -1.1);
  c.closePath();
  c.moveTo(14.4, -0.4);
  c.lineTo(17.4, -2.7);
  c.lineTo(17.4, -0.9);
  c.lineTo(14.6, 1.4);
  c.closePath();
  c.fill();
  if (!flat) {
    // hot core in the slit
    c.fillStyle = '#ffd6d2';
    c.fillRect(8, -2.2, 3, 1.1);
  }
  // the crest: a great swept crescent and a forward hook, like a shuriken fixed to the helmet
  c.fillStyle = flat ?? PAL.armor[2];
  c.beginPath();
  c.moveTo(8, -13);
  c.bezierCurveTo(4, -30, -14, -48, -50, -56);
  c.bezierCurveTo(-30, -42, -20, -28, -14, -10);
  c.quadraticCurveTo(-4, -15, 8, -13);
  c.closePath();
  c.fill();
  c.fillStyle = flat ?? PAL.armor[1];
  c.beginPath();
  c.moveTo(-6, -15);
  c.bezierCurveTo(-2, -27, 10, -38, 32, -44);
  c.bezierCurveTo(19, -32, 14, -22, 12, -12);
  c.closePath();
  c.fill();
  // lower swept blade behind the ear
  c.fillStyle = flat ?? PAL.armor[1];
  c.beginPath();
  c.moveTo(-8, -4);
  c.bezierCurveTo(-18, -8, -32, -11, -48, -6);
  c.bezierCurveTo(-33, -2, -20, 2, -12, 6);
  c.closePath();
  c.fill();
  if (!flat) {
    c.beginPath();
    c.moveTo(4, -15);
    c.bezierCurveTo(0, -30, -16, -46, -48, -55);
    c.moveTo(-4, -16);
    c.bezierCurveTo(2, -27, 12, -36, 30, -43);
    line(c, PAL.red[2], 1.5);
    c.beginPath();
    c.moveTo(-12, -11);
    c.bezierCurveTo(-18, -26, -28, -42, -48, -54);
    c.moveTo(-10, -2);
    c.bezierCurveTo(-20, -6, -32, -9, -46, -6);
    line(c, PAL.edge, 1.1);
  }
  c.restore();
}

function scarf(c: C, t: number, flat: string | null, wind: number, seed: number) {
  const a = tl(-6, -63, TMP);
  const ax = a[0];
  const ay = a[1];
  for (let k = 0; k < 2; k++) {
    const droop = k ? 0.95 : 0.55;
    const ph = seed + k * 1.9;
    chain(CX, CY, 13, ax - k * 2, ay + k * 3, k ? 8.5 : 10, (i) =>
      -Math.PI / 2 + droop - wind * (0.5 - k * 0.1) + i * 0.04 + Math.sin(t * (6 + wind * 4) + ph - i * 0.7) * (0.07 + i * 0.02) * (0.5 + wind)
    );
    c.fillStyle = flat ?? (k ? PAL.red[1] : PAL.red[2]);
    ribbon(c, CX, CY, 13, (q) => (k ? 5 : 6.5) * (1 - q * 0.5), 0.45);
    c.fill();
    if (!flat && !k) {
      c.beginPath();
      c.moveTo(CX[0], CY[0] - 2.5);
      for (let i = 1; i < 11; i++) c.lineTo(CX[i], CY[i] - 4 * (1 - i / 13));
      line(c, PAL.red[3], 1);
    }
  }
}

function waistCloth(c: C, t: number, flat: string | null, wind: number, seed: number, front: boolean) {
  const a = tl(front ? 9 : -11, 4, TMP);
  const n = front ? 6 : 10;
  chain(CX, CY, n, a[0], a[1], front ? 6.5 : 7, (i) =>
    (front ? 0.05 : -0.18) + R.rot * 0.3 - wind * (front ? 0.45 : 1.1) - i * 0.03 * wind + Math.sin(t * (5 + wind * 5) + seed + (front ? 2 : 0) - i * 0.6) * 0.05 * (1 + i * 0.2) * (0.4 + wind)
  );
  c.fillStyle = flat ?? (front ? PAL.red[2] : PAL.red[1]);
  ribbon(c, CX, CY, n, (q) => (front ? 7.5 * (1 - q * 0.8) : 8 * (1 - q * 0.25)), front ? 0 : 0.5);
  c.fill();
  if (!flat) {
    c.fillStyle = front ? PAL.red[1] : PAL.red[0];
    ribbon(c, CX, CY, n, (q) => (front ? 2 : 2.5) * (1 - q * 0.3), 0);
    c.fill();
  }
}

/** Zed facing right with his feet at the origin; flat draws a single colour silhouette */
function zed(c: C, t: number, p: ZedPose, flat: string | null, wind: number, seed: number, eyes = 1) {
  rig(p);
  const breath = Math.sin(t * 2.2 + seed) * 0.8;
  scarf(c, t, flat, wind, seed);
  waistCloth(c, t, flat, wind, seed, false);
  arm(c, false, flat);
  pauldron(c, false, flat, -0.1);
  leg(c, p, false, flat);
  torso(c, flat, breath);
  leg(c, p, true, flat);
  waistCloth(c, t, flat, wind, seed, true);
  helmet(c, p, flat, eyes);
  arm(c, true, flat);
  pauldron(c, true, flat, Math.sin(t * 2.2 + seed) * 0.02);
}

const INK_DX = new Float32Array(8);
const INK_DY = new Float32Array(8);
for (let i = 0; i < 8; i++) {
  INK_DX[i] = Math.cos((i / 8) * TAU);
  INK_DY[i] = Math.sin((i / 8) * TAU);
}

/** The ink pass: the silhouette stamped around itself in one colour, lw figure units wide */
function inkPass(c: C, draw: (flat: string) => void, ink: string, lw: number) {
  for (let i = 0; i < 8; i++) {
    c.save();
    c.translate(INK_DX[i] * lw, INK_DY[i] * lw);
    draw(ink);
    c.restore();
  }
}

/**
 * A Living Shadow: violet ink, a sliver of violet rim, a flat near black body and red eyes.
 * Everything is opaque, so overlapping copies never turn to mud.
 */
function shadowFigure(c: C, t: number, p: ZedPose, wind: number, seed: number, rimX: number) {
  const draw = (flat: string) => zed(c, t, p, flat, wind, seed, 1);
  inkPass(c, draw, '#9d6bff', 1.7);
  c.save();
  c.translate(rimX, -1.2);
  draw('#3c2370');
  c.restore();
  eyeFlat = '#ff3346';
  draw('#0b0713');
  eyeFlat = null;
}

/* ---------- vector effects ---------- */

/**
 * A tapered crescent along an ellipse from angle a0 to a1, thickest in the middle: the shape
 * of every blade swing. Filled, not stroked, so both ends come to a clean point.
 */
function crescent(c: C, cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, th: number) {
  const n = 14;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    const px = cx + x * cs - y * sn;
    const py = cy + x * sn + y * cs;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const f = i / n;
    const a = lerp(a0, a1, f);
    const k = 1 - (th * Math.sin(f * Math.PI)) / Math.max(1, rx);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    c.lineTo(cx + x * cs - y * sn, cy + x * sn + y * cs);
  }
  c.closePath();
}

/** A swing that sweeps through: the head leads, the tail catches up, q from 0 to 1 */
function swing(c: C, cx: number, cy: number, rx: number, ry: number, rot: number, from: number, span: number, q: number, th: number, dir: number) {
  const head = easeOutCubic(clamp(q / 0.6, 0, 1));
  const tail = easeInOutCubic(clamp((q - 0.25) / 0.75, 0, 1));
  if (head - tail < 0.02) return;
  const a0 = from + dir * span * tail;
  const a1 = from + dir * span * head;
  const w = th * (1 - tail * 0.6);
  c.fillStyle = '#e3202f';
  crescent(c, cx, cy, rx, ry, rot, a0, a1, w);
  c.fill();
  c.fillStyle = '#fff1ee';
  crescent(c, cx, cy, rx * 1.01, ry * 1.01, rot, lerp(a0, a1, 0.35), a1, w * 0.35);
  c.fill();
}

/** A thin four point spark: impacts and the swap flash */
function spark(c: C, x: number, y: number, r: number, w: number, rot: number) {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const ax = i % 2 ? -sn : cs;
    const ay = i % 2 ? cs : sn;
    const sg = i < 2 ? 1 : -1;
    const L = i % 2 ? r * 0.55 : r;
    c.moveTo(x + ax * L * sg, y + ay * L * sg);
    c.lineTo(x - ay * w, y + ax * w);
    c.lineTo(x + ay * w, y - ax * w);
    c.closePath();
  }
  c.fill();
}

/* ---------- training posts ---------- */

let strawCtx: C | null = null;
let strawG: CanvasGradient | null = null;

function dummyBody(c: C, d: Dummy, t: number) {
  // post
  c.fillStyle = '#1c130e';
  c.fillRect(-4.5, -150, 9, 150);
  c.fillStyle = '#3a2718';
  c.fillRect(-4.5, -150, 3, 150);
  // cross bar arms
  c.save();
  c.translate(0, -104);
  c.rotate(Math.sin(t * 1.3 + d.x * 20) * 0.02);
  c.fillStyle = '#2a1c12';
  c.fillRect(-40, -4, 80, 8);
  c.fillStyle = '#6a5436';
  for (let sx = -1; sx <= 1; sx += 2) {
    c.beginPath();
    c.ellipse(sx * 36, 0, 8, 7, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  // straw body bound with rope; the gradient lives in local space, so it is made once
  if (strawCtx !== c || !strawG) {
    strawCtx = c;
    strawG = c.createLinearGradient(-22, 0, 22, 0);
    strawG.addColorStop(0, '#3e3220');
    strawG.addColorStop(0.45, '#8a7446');
    strawG.addColorStop(0.46, '#7a6640');
    strawG.addColorStop(1, '#4a3a24');
  }
  c.fillStyle = strawG;
  c.beginPath();
  c.moveTo(-13, -40);
  c.bezierCurveTo(-18, -62, -14, -76, -17, -92);
  c.bezierCurveTo(-26, -104, -26, -116, -16, -120);
  c.quadraticCurveTo(0, -126, 16, -120);
  c.bezierCurveTo(26, -116, 26, -104, 17, -92);
  c.bezierCurveTo(14, -76, 18, -62, 13, -40);
  c.quadraticCurveTo(0, -35, -13, -40);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(40,30,16,0.8)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = -3; i <= 3; i++) {
    c.moveTo(i * 4, -42);
    c.quadraticCurveTo(i * 5.5, -84, i * 6.5, -120);
  }
  c.stroke();
  c.strokeStyle = '#2a1e12';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-15, -52);
  c.quadraticCurveTo(0, -47, 15, -52);
  c.moveTo(-16, -90);
  c.quadraticCurveTo(0, -85, 16, -90);
  c.moveTo(-22, -110);
  c.quadraticCurveTo(0, -105, 22, -110);
  c.stroke();
  // paper talisman with a red seal
  c.fillStyle = '#d8ceb4';
  c.fillRect(-7, -86, 14, 24);
  c.fillStyle = '#b01824';
  c.beginPath();
  c.arc(0, -76, 4.5, 0, TAU);
  c.fill();
  // head sack
  c.fillStyle = '#7a6440';
  c.beginPath();
  c.ellipse(0, -140, 15, 17, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#2a1e12';
  c.fillRect(-13, -126, 26, 4);
  c.strokeStyle = 'rgba(40,28,14,0.7)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-8, -150);
  c.quadraticCurveTo(-2, -140, -8, -128);
  c.moveTo(6, -154);
  c.quadraticCurveTo(10, -140, 5, -128);
  c.stroke();
  // moon rim on the left edge
  c.strokeStyle = 'rgba(200,210,255,0.4)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-13, -44);
  c.bezierCurveTo(-17, -64, -14, -78, -17, -92);
  c.bezierCurveTo(-25, -104, -25, -115, -15, -120);
  c.stroke();
}

/* ---------- scene ---------- */

const posX = (s: State, env: SceneEnv, i: number) => s.dummies[i].x * env.w;

function nearestPost(s: State, env: SceneEnv, px: number, alive = true) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.dummies.length; i++) {
    const d = s.dummies[i];
    if (alive && (d.dead || d.rise < 1)) continue;
    const dd = Math.abs(posX(s, env, i) - px);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}

const snd = (s: State, env: SceneEnv) => (s.touched && !s.quiet && env.interactive ? env.audio() : null);

/** A few hard edged shadow shards: kind 0 near black, 2 violet */
function shards(s: State, n: number, x: number, y: number, spread: number, speed: number, kind: number) {
  burst(s.parts, n, x, y, -Math.PI / 2, spread, speed, 0.5, 9 * s.K, kind, 3, -60 * s.K);
}

function hitPost(s: State, env: SceneEnv, i: number, dmg: number, dir: number) {
  const d = s.dummies[i];
  if (d.dead || d.rise < 1) return;
  const K = s.K;
  const x = posX(s, env, i);
  const y = s.ridge - 92 * K;
  d.hp -= dmg;
  d.flash = 0.16;
  d.hitDir = dir;
  d.wobV += dir * 5;
  burst(s.parts, 7, x, y, dir > 0 ? 0 : Math.PI, 0.9, 260 * K, 0.6, 3 * K, 4, 2, 500 * K);
  burst(s.parts, 5, x, y, dir > 0 ? 0 : Math.PI, 0.6, 520 * K, 0.22, 2.4 * K, 3, 5, 0);
  if (s.markI === i && s.markT > 0) {
    s.markHits++;
    burst(s.parts, 4, x, y, dir > 0 ? 0 : Math.PI, 0.8, 380 * K, 0.3, 3 * K, 1, 4, 0);
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.08, gain: 0.1, freq: 2600, q: 1.4 });
    tone(bus, 520, { type: 'square', attack: 0.002, decay: 0.06, gain: 0.02, glideTo: 300 });
  }
  if (d.hp <= 0) killPost(s, env, i, dir, 0.9);
}

function killPost(s: State, env: SceneEnv, i: number, dir: number, force: number) {
  const d = s.dummies[i];
  if (d.dead) return;
  const K = s.K;
  d.dead = true;
  d.respawn = 1.8;
  d.cut = rand(-0.5, -0.2) * dir;
  d.fx = 0;
  d.fy = 0;
  d.fvx = dir * rand(160, 260) * force;
  d.fvy = -rand(380, 520) * force;
  d.fr = 0;
  d.fvr = dir * rand(5, 9);
  const x = posX(s, env, i);
  burst(s.parts, 14, x, s.ridge - 100 * K, -Math.PI / 2, 1.6, 360 * K, 1, 3.4 * K, 4, 1.5, 600 * K);
}

/** Start an action from whatever pose he is in */
function begin(s: State, act: number) {
  s.act = act;
  s.pt = 0;
  s.struck = false;
  mix(s.src, s.pose, s.pose, 0);
}

function throwStars(s: State, env: SceneEnv, gx: number, gy: number) {
  begin(s, 1);
  s.aimX = gx;
  s.aimY = gy;
  s.face = gx >= s.x * env.w ? 1 : -1;
  s.m.face = s.face;
  s.m.turn = s.face;
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.12, gain: 0.06, freq: 3000, q: 0.7 });
}

function launch(s: State, fromX: number, fromY: number, gx: number, gy: number, big: number) {
  let slot = s.stars[0];
  for (const st of s.stars)
    if (st.life <= 0) {
      slot = st;
      break;
    }
  const dx = gx - fromX;
  const dy = gy - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const v = 1250 * s.K;
  slot.x = fromX;
  slot.y = fromY;
  slot.vx = (dx / d) * v;
  slot.vy = (dy / d) * v;
  slot.life = 1.1;
  slot.rot = 0;
  slot.hit = 0;
  slot.big = big;
}

function releaseStars(s: State, env: SceneEnv) {
  const K = s.K;
  const zx = s.x * env.w;
  const hx = zx + R.aFx * K * s.face;
  const hy = s.ridge + R.aFy * K;
  launch(s, hx, hy, s.aimX, s.aimY, 1);
  for (const sh of s.shadows) {
    if (sh.life <= 0) continue;
    const sx = sh.x * env.w;
    sh.face = s.aimX >= sx ? 1 : -1;
    launch(s, sx + 40 * K * sh.face, s.ridge - 112 * K, s.aimX, s.aimY, 0.85);
  }
  burst(s.parts, 4, hx, hy, Math.atan2(s.aimY - hy, s.aimX - hx), 0.35, 420 * K, 0.18, 2.4 * K, 3, 5, 0);
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 1500, { type: 'triangle', attack: 0.002, decay: 0.18, gain: 0.03, glideTo: 900 });
    noise(bus, { duration: 0.25, gain: 0.09, freq: 4200, q: 1.2 });
  }
}

function addShadow(s: State, env: SceneEnv, x: number, tx: number, kind: number, face: number) {
  let slot = s.shadows[0];
  let oldest = Infinity;
  for (const sh of s.shadows) {
    if (sh.life <= 0) {
      slot = sh;
      break;
    }
    if (sh.kind === kind) {
      slot = sh;
      oldest = -1;
      break;
    }
    if (sh.life < oldest) {
      oldest = sh.life;
      slot = sh;
    }
  }
  slot.x = x;
  slot.tx = clamp(tx, 0.06, 0.96);
  slot.face = face;
  slot.life = kind ? 6 : 4.2;
  slot.age = 0;
  slot.kind = kind;
  shards(s, 6, x * env.w, s.ridge - 20 * s.K, 1.1, 260 * s.K, 2);
  return slot;
}

function castShadow(s: State, env: SceneEnv, gx: number) {
  const tx = gx / Math.max(1, env.w);
  const face = tx >= s.x ? 1 : -1;
  addShadow(s, env, s.x, tx, 0, face);
  begin(s, 4);
  s.face = face;
  s.m.face = face;
  s.m.turn = face;
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 110, { type: 'sawtooth', attack: 0.02, decay: 0.35, gain: 0.05, glideTo: 55 });
    noise(bus, { duration: 0.35, gain: 0.08, freq: 500, q: 0.6, type: 'lowpass' });
  }
}

function swapWith(s: State, env: SceneEnv, i: number) {
  const sh = s.shadows[i];
  if (sh.life <= 0 || (s.act === 2 && s.pt < MARK_END) || s.act === 3) return;
  begin(s, 3);
  s.swapTo = i;
  s.fromX = s.x;
  s.toX = sh.x;
  s.swapFx = 0.2;
  s.swapA = s.x;
  s.swapB = sh.x;
  const K = s.K;
  shards(s, 5, s.x * env.w, s.ridge - 100 * K, Math.PI, 300 * K, 2);
  shards(s, 5, sh.x * env.w, s.ridge - 100 * K, Math.PI, 300 * K, 2);
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.22, gain: 0.12, freq: 900, q: 0.9 });
    tone(bus, 220, { type: 'sine', attack: 0.004, decay: 0.2, gain: 0.08, glideTo: 440 });
  }
}

function deathMark(s: State, env: SceneEnv, i: number) {
  if (i < 0 || s.act === 2 || s.markT > 0) return;
  halt(s.m);
  s.chase = -1;
  begin(s, 2);
  s.cdR = R_CD;
  s.target = i;
  s.fromX = s.x;
  const tx = s.dummies[i].x;
  const side = tx > s.x ? 1 : -1;
  const off = (72 * s.K) / Math.max(1, env.w);
  s.toX = tx + side * off;
  if (s.toX > 0.97 || s.toX < 0.03) s.toX = tx - side * off;
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 60, { type: 'sawtooth', attack: 0.06, decay: 0.5, gain: 0.08, glideTo: 30 });
    noise(bus, { duration: 0.4, gain: 0.1, freq: 400, q: 0.6, type: 'lowpass' });
  }
}

function applyMark(s: State, env: SceneEnv) {
  const i = s.target;
  s.markI = i;
  s.markT = MARK;
  s.markHits = 0;
  const K = s.K;
  const x = posX(s, env, i);
  burst(s.parts, 10, x, s.ridge - 92 * K, 0, Math.PI, 520 * K, 0.3, 3 * K, 1, 4, 0);
  s.flash = Math.max(s.flash, 0.35);
  const bus = snd(s, env);
  if (bus) {
    tone(bus, 880, { type: 'square', attack: 0.002, decay: 0.12, gain: 0.03, glideTo: 440 });
    tone(bus, 49, { type: 'sine', attack: 0.004, decay: 0.6, gain: 0.25, glideTo: 36 });
  }
}

function popMark(s: State, env: SceneEnv) {
  const i = s.markI;
  const K = s.K;
  const x = posX(s, env, i);
  const y = s.ridge - 92 * K;
  const power = 1 + Math.min(4, s.markHits) * 0.25;
  s.popT = 0.001;
  burst(s.parts, 18, x, y, 0, Math.PI, 760 * K * power, 0.45, 4 * K, 1, 3, 0);
  burst(s.parts, 8, x, y, 0, Math.PI, 620 * K, 0.3, 3 * K, 3, 4, 0);
  shards(s, 8, x, y, Math.PI, 420 * K, 0);
  killPost(s, env, i, s.x * env.w < x ? 1 : -1, 1.3);
  s.flash = 1;
  if (!env.reducedMotion) {
    s.stop = 0.13;
    s.shake = 1;
  }
  const bus = snd(s, env);
  if (bus) {
    noise(bus, { duration: 0.7, gain: 0.3, freq: 420, q: 0.5, type: 'lowpass' });
    tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.9, gain: 0.34, glideTo: 28 });
    tone(bus, 1240, { type: 'sawtooth', attack: 0.002, decay: 0.3, gain: 0.03, glideTo: 180 });
  }
}

/** The post under a screen point, judged by its straw body */
function pickPost(s: State, env: SceneEnv, px: number, py: number) {
  const K = s.K;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.dummies.length; i++) {
    const d = s.dummies[i];
    if (d.dead || d.rise < 1) continue;
    const dx = Math.abs(px - posX(s, env, i));
    if (dx < 42 * K && py > s.ridge - 175 * K && py < s.ridge + 12 * K && dx < bd) {
      bd = dx;
      best = i;
    }
  }
  return best;
}

function pickShadow(s: State, env: SceneEnv, px: number, py: number) {
  const K = s.K;
  for (let i = 0; i < s.shadows.length; i++) {
    const sh = s.shadows[i];
    if (sh.life <= 0 || sh.age < 0.2) continue;
    if (Math.abs(px - sh.x * env.w) < 40 * K && py > s.ridge - 220 * K && py < s.ridge + 10 * K) return i;
  }
  return -1;
}

function onSelf(s: State, env: SceneEnv, px: number, py: number) {
  const K = s.K;
  return Math.abs(px - s.x * env.w) < 38 * K && py > s.ridge - 200 * K && py < s.ridge + 12 * K;
}

/** Shadow Slash: a short wind-up, then Zed and every shadow spin their blades at once */
function shadowSlash(s: State, env: SceneEnv) {
  begin(s, 6);
  s.cdE = E_CD;
  const bus = snd(s, env);
  if (bus) tone(bus, 880, { type: 'sawtooth', attack: 0.004, decay: 0.2, gain: 0.025, glideTo: 220 });
}

function slashLands(s: State, env: SceneEnv) {
  const K = s.K;
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.24, gain: 0.14, freq: 2200, q: 0.8 });
  let hits = 0;
  for (let i = 0; i < s.dummies.length; i++) {
    const px = posX(s, env, i);
    let best = Infinity;
    let dir = 1;
    const consider = (ox: number) => {
      const d = Math.abs(px - ox * env.w);
      if (d < best) {
        best = d;
        dir = px >= ox * env.w ? 1 : -1;
      }
    };
    consider(s.x);
    for (const sh of s.shadows) if (sh.life > 0) consider(sh.x);
    if (best < 130 * K) {
      hitPost(s, env, i, 1, dir);
      hits++;
    }
  }
  if (hits && !env.reducedMotion) {
    s.stop = Math.max(s.stop, 0.06);
    s.shake = Math.max(s.shake, 0.4);
  }
}

function basicAttack(s: State, env: SceneEnv, i: number) {
  s.face = posX(s, env, i) >= s.x * env.w ? 1 : -1;
  s.m.face = s.face;
  s.m.turn = s.face;
  begin(s, 7);
  s.atkCd = 0.55;
  s.atkN++;
  s.atkX = posX(s, env, i);
  const bus = snd(s, env);
  if (bus) noise(bus, { duration: 0.08, gain: 0.06, freq: 3200, q: 1.2 });
}

/** Keys aim at the pointer, else the post he is facing */
function keyAim(s: State, env: SceneEnv): [number, number] {
  if (env.pointer.inside) return [env.pointer.x, env.pointer.y];
  const i = nearestPost(s, env, s.x * env.w + s.face * env.w * 0.3);
  if (i >= 0) return [posX(s, env, i), s.ridge - 90 * s.K];
  return [s.x * env.w + s.face * env.w * 0.4, s.ridge - 90 * s.K];
}

/**
 * Wind-ups and blinks lock him in; the follow-through of a throw, cast or cut does not, so the
 * next order cuts it short instead of waiting for the animation to finish.
 */
function locked(s: State) {
  switch (s.act) {
    case 1:
      return s.pt < THROW * 0.45;
    case 4:
      return s.pt < CAST * 0.4;
    case 6:
      return s.pt < SLASHE * 0.5;
    case 7:
      return s.pt < ATTACK * 0.5;
    case 2:
    case 3:
      return true;
    default:
      return false;
  }
}

function slotIndex(c: Command) {
  return c === 'q' ? 0 : c === 'w' ? 1 : c === 'e' ? 2 : 3;
}

function command(s: State, env: SceneEnv, c: Command, gx: number, gy: number) {
  if (!c) return;
  if (c === 'stop') {
    halt(s.m);
    s.chase = -1;
    s.buf = null;
    s.bufT = 0;
    return;
  }
  if (c === 'move' || c === 'tap') {
    if (c === 'tap') {
      const sh = pickShadow(s, env, gx, gy);
      if (sh >= 0) {
        swapWith(s, env, sh);
        return;
      }
      const i = pickPost(s, env, gx, gy);
      if (i >= 0) {
        s.chase = i;
        setMarker(s.marker, posX(s, env, i), s.ridge + 4 * s.K, '255,70,80');
        return;
      }
      if (onSelf(s, env, gx, gy)) return command(s, env, 'e', gx, gy);
    }
    s.chase = -1;
    const x = clamp(gx / Math.max(1, env.w), 0.04, 0.96);
    moveTo(s.m, x, 0);
    setMarker(s.marker, x * env.w, s.ridge + 4 * s.K, '255,120,120');
    return;
  }
  if (c === 'double') c = 'w';
  // W while a shadow is out swaps with it, like recasting in League
  if (c === 'w') {
    const r = s.shadows.findIndex((sh) => sh.kind === 0 && sh.life > 0 && sh.age > 0.2);
    if (r >= 0) {
      if (s.act === 2 || s.act === 3) {
        s.buf = c;
        s.bufX = gx;
        s.bufY = gy;
        s.bufT = BUFFER;
      } else {
        swapWith(s, env, r);
        s.slotFlash[1] = 0.25;
      }
      return;
    }
  }
  const cd = c === 'q' ? s.cdQ : c === 'w' ? s.cdW : c === 'e' ? s.cdE : s.markT > 0 ? 9 : s.cdR;
  if (locked(s) || cd > 0) {
    // a press just before it is ready is kept, not dropped
    if (cd < BUFFER && !(c === 'r' && s.act === 2)) {
      s.buf = c;
      s.bufX = gx;
      s.bufY = gy;
      s.bufT = BUFFER;
    }
    return;
  }
  s.buf = null;
  s.bufT = 0;
  if (c === 'q') {
    s.cdQ = Q_CD;
    throwStars(s, env, gx, gy);
  } else if (c === 'w') {
    s.cdW = W_CD;
    castShadow(s, env, gx);
  } else if (c === 'e') shadowSlash(s, env);
  else if (c === 'r') {
    const i = nearestPost(s, env, gx);
    if (i < 0) return;
    deathMark(s, env, i);
  }
  s.slotFlash[slotIndex(c)] = 0.25;
}

function interact(s: State, env: SceneEnv) {
  // the demo spends cooldowns; the first real input gets a full kit
  if (!s.touched) s.cdQ = s.cdW = s.cdE = s.cdR = 0;
  s.touched = true;
  s.idle = 0;
  env.wake(2600);
}

/* ---------- background ---------- */

/** A flat cloud band: a long rounded bar with a few soft lobes on top, filled as one shape */
function cloudBand(c: C, x: number, y: number, wd: number, ht: number, seed: number) {
  c.beginPath();
  const r = ht * 0.5;
  c.moveTo(x - wd / 2 + r, y - r);
  c.lineTo(x + wd / 2 - r, y - r);
  c.arc(x + wd / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
  c.lineTo(x - wd / 2 + r, y + r);
  c.arc(x - wd / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5);
  c.closePath();
  const n = Math.max(2, Math.round(wd / (ht * 5)));
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const lx = x - wd * 0.42 + f * wd * 0.84;
    const lr = ht * (0.7 + 0.5 * Math.sin(f * Math.PI)) * (0.75 + 0.25 * Math.sin(seed + i * 2.1));
    c.moveTo(lx + lr * 1.8, y - r * 0.4);
    c.ellipse(lx, y - r * 0.4, lr * 1.8, lr, 0, Math.PI, 0, false);
  }
  c.fill();
}

function paintScene(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const u = s.u;
  const { cv, c, m } = backdropLayer(s.bg, w, h, dpr, 16 * u);
  s.bg = cv;
  if (!c) return;
  const rnd = mulberry(29);
  const ridge = s.ridge;
  // paint past the edges so a shake never shows the margin
  const x0 = -m;
  const W = w + m * 2;
  const sky = c.createLinearGradient(0, 0, 0, ridge);
  sky.addColorStop(0, '#04040a');
  sky.addColorStop(0.4, '#0e0a18');
  sky.addColorStop(0.72, '#22101e');
  sky.addColorStop(1, '#46141c');
  c.fillStyle = sky;
  c.fillRect(x0, -m, W, h + m * 2);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(220,215,255,${(0.2 + rnd() * 0.55).toFixed(3)})`;
    const r = Math.max(1 / dpr, Math.round((0.5 + rnd() * 0.9) * u * dpr) / dpr);
    c.fillRect(Math.round(rnd() * w * dpr) / dpr, Math.round(rnd() * h * 0.55 * dpr) / dpr, r, r);
  }
  // the moon, huge and pale behind Zed's shoulders, with a hard edge
  const mx = w * 0.27;
  const my = h * 0.35;
  const mr = Math.min(h * 0.24, w * 0.2);
  const halo = c.createRadialGradient(mx, my, mr, mx, my, mr * 2.2);
  halo.addColorStop(0, 'rgba(255,215,220,0.2)');
  halo.addColorStop(0.35, 'rgba(200,80,100,0.07)');
  halo.addColorStop(1, 'rgba(120,20,40,0)');
  c.fillStyle = halo;
  c.fillRect(x0, -m, W, h + m * 2);
  c.fillStyle = 'rgba(255,225,228,0.12)';
  c.beginPath();
  c.arc(mx, my, mr * 1.06, 0, TAU);
  c.fill();
  c.fillStyle = '#f2ebe6';
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  // a hard shaded crescent on the lower right instead of a soft falloff
  c.save();
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.clip();
  c.fillStyle = '#ddd0d0';
  c.beginPath();
  c.arc(mx - mr * 0.22, my - mr * 0.22, mr * 1.02, 0, TAU);
  c.rect(mx + mr * 2, my - mr * 2, -mr * 4, mr * 4);
  c.fill('evenodd');
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const d = rnd() * mr * 0.7;
    const cr = mr * (0.05 + rnd() * 0.13);
    const cx = mx + Math.cos(a) * d;
    const cy = my + Math.sin(a) * d;
    c.fillStyle = '#d4c6c8';
    c.beginPath();
    c.arc(cx, cy, cr, 0, TAU);
    c.fill();
    c.fillStyle = '#c4b4b8';
    c.beginPath();
    c.arc(cx + cr * 0.18, cy + cr * 0.18, cr * 0.82, 0, TAU);
    c.fill();
  }
  c.restore();
  // flat cloud bands across the lower moon
  for (let i = 0; i < 3; i++) {
    const cy = my + mr * (0.3 + i * 0.3) + rnd() * 10 * u;
    const cx = mx + (rnd() - 0.5) * mr * 1.6;
    const cw = mr * (1.1 + rnd() * 1.1);
    const ch = (9 + rnd() * 6) * u;
    const seed = rnd() * 10;
    // moonlit dusk cloud: a lit top edge, then the body slightly lower
    c.fillStyle = '#8a6a80';
    cloudBand(c, cx, cy - 1.5 * u, cw, ch, seed);
    c.fillStyle = '#3a2440';
    cloudBand(c, cx, cy, cw, ch, seed);
  }
  // far peaks in red haze
  const hz = ridge - 150 * u;
  peaks(c, w, h, hz, 90 * u, '#1c1020', rnd, u * 1.4);
  const mist = c.createLinearGradient(0, hz - 40 * u, 0, hz + 40 * u);
  mist.addColorStop(0, 'rgba(120,30,50,0)');
  mist.addColorStop(1, 'rgba(120,30,50,0.3)');
  c.fillStyle = mist;
  c.fillRect(x0, hz - 40 * u, W, 80 * u);
  peaks(c, w, h, hz + 40 * u, 60 * u, '#120a16', rnd, u * 1.1);
  // the town below: pagodas and roofs with warm windows
  const town = ridge - 60 * u;
  for (let i = 0; i < 9; i++) {
    const x = (i + rnd() * 0.6) * (w / 8.4);
    const sz = (18 + rnd() * 16) * u;
    pagoda(c, x, town + rnd() * 20 * u, sz, 2 + Math.floor(rnd() * 3), '#0c0810', '#0a070d', rnd() < 0.6 ? 'rgba(255,150,70,0.45)' : null);
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * w;
    roof(c, x, town + 30 * u + rnd() * 20 * u, (30 + rnd() * 40) * u, (14 + rnd() * 10) * u, '#08060b');
  }
  c.fillStyle = '#07050a';
  c.fillRect(x0, town + 40 * u, W, h + m - town);
  for (let i = 0; i < 30; i++) {
    c.fillStyle = `rgba(255,${Math.round(120 + rnd() * 60)},60,${(0.3 + rnd() * 0.4).toFixed(3)})`;
    c.fillRect(Math.round(rnd() * w), Math.round(town + 34 * u + rnd() * 30 * u), Math.max(1, Math.round(2 * u)), Math.max(1, Math.round(2.5 * u)));
  }
  // the rooftop we stand on: ridge beam, then tiles rolling down toward us
  c.fillStyle = '#100d15';
  c.fillRect(x0, ridge, W, h + m - ridge);
  let y = ridge + 12 * u;
  let row = 0;
  while (y < h + m + 20 * u) {
    const tw = (14 + row * 5) * u;
    const th = (9 + row * 4) * u;
    const off = row % 2 ? tw / 2 : 0;
    const dark = Math.max(0, 1 - row * 0.14);
    const body = `rgb(${Math.round(14 + 14 * dark)},${Math.round(12 + 12 * dark)},${Math.round(18 + 18 * dark)})`;
    for (let x = x0 - tw + off; x < w + m + tw; x += tw) {
      c.fillStyle = body;
      c.beginPath();
      c.moveTo(x - tw / 2, y - th);
      c.lineTo(x - tw / 2, y);
      c.arc(x, y, tw / 2, Math.PI, 0, true);
      c.lineTo(x + tw / 2, y - th);
      c.closePath();
      c.fill();
      // the groove between tiles and the moonlit lip
      c.fillStyle = '#060508';
      c.fillRect(x + tw / 2 - Math.max(1, tw * 0.08), y - th, Math.max(1, tw * 0.08), th);
      c.strokeStyle = `rgba(170,170,235,${(0.18 * dark + 0.05).toFixed(3)})`;
      c.lineWidth = Math.max(1, 1.2 * u);
      c.beginPath();
      c.arc(x, y, tw / 2 - u, Math.PI * 0.95, Math.PI * 0.35, true);
      c.stroke();
    }
    y += th;
    row++;
  }
  c.fillStyle = '#0c0a10';
  c.fillRect(x0, ridge - 4 * u, W, 12 * u);
  c.fillStyle = '#2c2836';
  c.fillRect(x0, Math.round(ridge - 4 * u), W, Math.max(1, Math.round(2 * u)));
  for (let x = x0 + 6 * u; x < w + m; x += 22 * u) {
    c.fillStyle = '#14111a';
    c.beginPath();
    c.arc(x, ridge + 8 * u, 6 * u, 0, TAU);
    c.fill();
    c.fillStyle = '#25212e';
    c.beginPath();
    c.arc(x - 1.5 * u, ridge + 6.5 * u, 3 * u, 0, TAU);
    c.fill();
  }
}

/* ---------- drawing helpers ---------- */

/** Razor Shuriken: a four point steel star with red edges and a hard red trail */
function drawStar(c: C, st: Star, r: number) {
  const sp = Math.hypot(st.vx, st.vy) || 1;
  const ux = st.vx / sp;
  const uy = st.vy / sp;
  // the trail: a tapered red wedge behind the star, with a white core
  const L = r * 4.2;
  c.fillStyle = '#c0142a';
  c.beginPath();
  c.moveTo(st.x + uy * r * 0.7, st.y - ux * r * 0.7);
  c.lineTo(st.x - ux * L, st.y - uy * L);
  c.lineTo(st.x - uy * r * 0.7, st.y + ux * r * 0.7);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffd8d4';
  c.beginPath();
  c.moveTo(st.x + uy * r * 0.18, st.y - ux * r * 0.18);
  c.lineTo(st.x - ux * L * 0.6, st.y - uy * L * 0.6);
  c.lineTo(st.x - uy * r * 0.18, st.y + ux * r * 0.18);
  c.closePath();
  c.fill();
  c.save();
  c.translate(st.x, st.y);
  c.rotate(st.rot);
  for (let pass = 0; pass < 2; pass++) {
    const k = pass ? 1 : 1.16;
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      // one curved blade: out along +x, hooked back
      const pts = [-0.16, -0.12, 0.5, -0.36, 1.05, -0.04, 0.45, 0.04, 0.18, 0.2];
      c.fillStyle = pass ? (i % 2 ? '#a9b2c4' : '#e9eef8') : '#07060a';
      c.beginPath();
      c.moveTo((pts[0] * cs - pts[1] * sn) * r * k, (pts[0] * sn + pts[1] * cs) * r * k);
      c.quadraticCurveTo((pts[2] * cs - pts[3] * sn) * r * k, (pts[2] * sn + pts[3] * cs) * r * k, (pts[4] * cs - pts[5] * sn) * r * k, (pts[4] * sn + pts[5] * cs) * r * k);
      c.quadraticCurveTo((pts[6] * cs - pts[7] * sn) * r * k, (pts[6] * sn + pts[7] * cs) * r * k, (pts[8] * cs - pts[9] * sn) * r * k, (pts[8] * sn + pts[9] * cs) * r * k);
      c.closePath();
      c.fill();
      if (pass) {
        c.strokeStyle = '#ff2f40';
        c.lineWidth = Math.max(1, r * 0.08);
        c.beginPath();
        c.moveTo((0.22 * cs + 0.2 * sn) * r, (0.22 * sn - 0.2 * cs) * r);
        c.quadraticCurveTo((0.55 * cs + 0.28 * sn) * r, (0.55 * sn - 0.28 * cs) * r, (1.0 * cs + 0.05 * sn) * r, (1.0 * sn - 0.05 * cs) * r);
        c.stroke();
      }
    }
  }
  c.fillStyle = '#16121a';
  c.beginPath();
  c.arc(0, 0, r * 0.26, 0, TAU);
  c.fill();
  c.fillStyle = '#ff3a44';
  c.beginPath();
  c.arc(0, 0, r * 0.11, 0, TAU);
  c.fill();
  c.restore();
}

/** Zed's Death Mark sigil: a red ring holding three hooked blades around a hot core */
function drawSigil(c: C, x: number, y: number, r: number, rot: number, squash: number, hot: number) {
  c.save();
  c.translate(x, y);
  c.scale(1, squash);
  c.rotate(rot);
  // dark backing so the red reads over the straw and the moon alike
  c.fillStyle = 'rgba(16,2,8,0.6)';
  c.beginPath();
  c.arc(0, 0, r * 1.2, 0, TAU);
  c.fill();
  c.strokeStyle = '#e3202f';
  c.lineWidth = r * 0.09;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.stroke();
  c.strokeStyle = '#ff6a70';
  c.lineWidth = Math.max(1, r * 0.035);
  c.beginPath();
  c.arc(0, 0, r * 1.16, 0, TAU);
  c.stroke();
  for (let i = 0; i < 3; i++) {
    c.rotate(TAU / 3);
    c.fillStyle = '#ff2a3c';
    c.beginPath();
    c.moveTo(r * 0.12, -r * 0.1);
    c.bezierCurveTo(r * 0.45, -r * 0.55, r * 0.92, -r * 0.45, r * 1.12, r * 0.02);
    c.bezierCurveTo(r * 0.85, -r * 0.18, r * 0.5, -r * 0.08, r * 0.2, r * 0.18);
    c.closePath();
    c.fill();
  }
  c.fillStyle = hot > 0.5 ? '#fff0ec' : '#ffb0b0';
  c.beginPath();
  c.arc(0, 0, r * (0.14 + hot * 0.06), 0, TAU);
  c.fill();
  c.restore();
}

/** Clip to the part of a figure still above the dark: it sinks into the roof as a goes to 0 */
function sinkClip(c: C, x: number, ridge: number, K: number, a: number) {
  const top = ridge - 250 * K * a + 6 * K;
  c.beginPath();
  c.rect(x - 160 * K, top, 320 * K, ridge + 40 * K - top);
  c.clip();
  return top;
}

function sinkEdge(c: C, x: number, top: number, K: number, a: number) {
  if (a >= 1 || a <= 0) return;
  c.fillStyle = '#b48aff';
  c.fillRect(x - 44 * K, top - 1, 88 * K, 2);
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.35,
    init: (env) => {
      const leaves = new Float32Array(LEAVES * 6);
      for (let i = 0; i < LEAVES; i++) {
        leaves[i * 6] = Math.random();
        leaves[i * 6 + 1] = Math.random();
        leaves[i * 6 + 2] = Math.random() * TAU;
        leaves[i * 6 + 3] = 0.5 + Math.random();
        leaves[i * 6 + 4] = Math.random() * TAU;
        leaves[i * 6 + 5] = Math.random();
      }
      const clouds = new Float32Array(4 * 3);
      for (let i = 0; i < 4; i++) {
        clouds[i * 3] = Math.random();
        clouds[i * 3 + 1] = 0.12 + Math.random() * 0.3;
        clouds[i * 3 + 2] = 0.5 + Math.random();
      }
      const g = makeGesture();
      const s: State = {
        x: HOME,
        face: 1,
        alpha: 1,
        m: makeMover(HOME, 0, 1),
        g,
        ac: env.interactive ? pointerButtons(env.canvas, g) : null,
        marker: makeMarker(),
        chase: -1,
        atkCd: 0,
        atkN: 0,
        cdQ: 0,
        cdW: 0,
        cdE: 0,
        cdR: 0,
        slots: [
          { key: 'Q', cd: 0, max: Q_CD, col: '235,240,250' },
          { key: 'W', cd: 0, max: W_CD, col: '170,120,255' },
          { key: 'E', cd: 0, max: E_CD, col: '255,70,85' },
          { key: 'R', cd: 0, max: R_CD, col: '255,40,60' },
        ],
        slotFlash: new Float32Array(4),
        buf: null,
        bufX: 0,
        bufY: 0,
        bufT: 0,
        act: 0,
        pt: 0,
        struck: false,
        aimX: 0,
        aimY: 0,
        fromX: HOME,
        toX: HOME,
        target: 0,
        markI: -1,
        markT: 0,
        markHits: 0,
        popT: 0,
        swapTo: -1,
        swapFx: 0,
        swapA: 0,
        swapB: 0,
        atkX: 0,
        shadows: Array.from({ length: 3 }, () => ({ x: 0, tx: 0, face: 1, life: 0, age: 0, kind: 0 })),
        stars: Array.from({ length: 14 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, rot: 0, hit: 0, big: 1 })),
        dummies: POSTS.map((x) => ({
          x, hp: 3, wob: 0, wobV: 0, flash: 0, hitDir: 1, dead: false, respawn: 0, rise: 1, cut: 0, fx: 0, fy: 0, fvx: 0, fvy: 0, fr: 0, fvr: 0,
        })),
        pose: { ...IDLE },
        dpose: { ...IDLE },
        src: { ...IDLE },
        aimPose: { ...LOOSE },
        wind: 0.4,
        clock: 0,
        touched: false,
        quiet: false,
        idle: 0,
        still: 0,
        autoT: 0,
        autoStep: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        parts: makePool(240),
        leaves,
        clouds,
        u: 1,
        K: 1,
        ridge: 0,
        bg: null,
        red: glowSprite(64, [
          [0, 'rgba(255,90,90,0.9)'],
          [0.3, 'rgba(255,30,50,0.45)'],
          [1, 'rgba(140,0,20,0)'],
        ]),
        warm: glowSprite(160, [
          [0, 'rgba(255,200,130,0.7)'],
          [0.3, 'rgba(255,120,40,0.25)'],
          [1, 'rgba(200,60,0,0)'],
        ]),
        vignette: null,
      };
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.u = Math.min(w / (w < h ? 520 : 760), h / 560);
      s.K = s.u * (w < h ? 1.08 : 0.98);
      s.ridge = h * 0.84;
      strawG = null;
      paintScene(s, env);
      const v = ctx.createRadialGradient(w * 0.45, h * 0.5, Math.min(w, h) * 0.4, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,4,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w, h } = env;
      const K = s.K;
      s.clock += dt;
      // holds run on real time, ahead of hit-stop
      const held = gestureTick(s.g);
      if (held) {
        interact(s, env);
        command(s, env, held, s.g.x, s.g.y);
      }
      for (let i = 0; i < 4; i++) s.slotFlash[i] = Math.max(0, s.slotFlash[i] - dt);
      if (s.stop > 0) {
        s.stop -= dt;
        dt *= 0.05;
      }
      stepPool(s.parts, dt);
      s.shake = Math.max(0, s.shake - dt * 3);
      s.flash = Math.max(0, s.flash - dt * 3.2);
      s.swapFx = Math.max(0, s.swapFx - dt);
      s.cdQ = Math.max(0, s.cdQ - dt);
      s.cdW = Math.max(0, s.cdW - dt);
      s.cdE = Math.max(0, s.cdE - dt);
      s.cdR = Math.max(0, s.cdR - dt);
      s.atkCd = Math.max(0, s.atkCd - dt);
      s.marker.life = Math.max(0, s.marker.life - dt);
      if (s.bufT > 0) {
        s.bufT -= dt;
        const c = s.buf;
        // fire the kept press the first frame it can go
        const cd = c === 'q' ? s.cdQ : c === 'w' ? s.cdW : c === 'e' ? s.cdE : c === 'r' ? s.cdR : 0;
        if (c && !locked(s) && cd <= 0) {
          s.buf = null;
          s.bufT = 0;
          command(s, env, c, s.bufX, s.bufY);
        } else if (s.bufT <= 0) s.buf = null;
      }

      // autopilot: shadow, shuriken, Death Mark, shuriken into the mark, swap
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 8;
      if (auto) {
        s.autoT += dt;
        s.quiet = !s.touched;
        const aimAt = (i: number, c: Command) => command(s, env, c, posX(s, env, i), s.ridge - rand(80, 110) * K);
        const step = s.autoStep;
        if (step === 0 && s.autoT >= 0.2) command(s, env, 'w', w * 0.44, s.ridge - 100 * K);
        else if (step === 1 && s.autoT >= 0.7) aimAt(0, 'q');
        else if (step === 2 && s.autoT >= 1.05) aimAt(1, 'r');
        else if (step === 3 && s.autoT >= 1.75) aimAt(Math.max(0, s.markI), 'q');
        else if (step === 4 && s.autoT >= 4.3) aimAt(2, 'q');
        else if (step === 5 && s.autoT >= 6.2) {
          s.autoT = 0;
          s.autoStep = -1;
        }
        const thresholds = [0.2, 0.7, 1.05, 1.75, 4.3, 6.2];
        if (s.autoStep >= 0 && s.autoT >= thresholds[s.autoStep]) s.autoStep++;
        if (s.autoStep < 0) s.autoStep = 0;
        s.quiet = false;
      } else {
        s.autoT = 0;
        s.autoStep = 0;
      }

      // chase a clicked post into reach, then cut
      if (s.chase >= 0) {
        const d = s.dummies[s.chase];
        if (d.dead || d.rise < 1) s.chase = -1;
        else if (!locked(s)) {
          const px = posX(s, env, s.chase);
          const side = px >= s.x * w ? 1 : -1;
          if (Math.abs(px - s.x * w) > ATK_RANGE * K) moveTo(s.m, (px - side * ATK_RANGE * 0.7 * K) / w, 0);
          else {
            halt(s.m);
            if (s.atkCd <= 0) basicAttack(s, env, s.chase);
          }
        }
      }

      // running along the ridge; wind-ups root him, Death Mark and swaps move him on their own,
      // and a move order cuts any follow-through short
      if (s.act === 2 || s.act === 3 || s.act === 5) {
        s.m.x = s.x;
        s.m.vx = 0;
        halt(s.m);
        s.m.face = s.face;
        s.m.turn = s.face;
      } else {
        if (s.act !== 0 && !locked(s) && s.m.going && Math.abs(s.m.tx - s.x) * w > 6) s.act = 0;
        s.m.x = s.x;
        stepMover(s.m, dt, w, 1, SPEED * K, SPEED * 16 * K, 64 * K, s.act !== 0);
        s.x = clamp(s.m.x, 0.04, 0.96);
        s.face = s.m.face;
      }

      // Zed's body
      const pose = s.pose;
      s.pt += dt;
      let targetWind = 0.35;
      if (s.act === 1) {
        const q = s.pt / THROW;
        // aim the throwing arm at the target
        const hx = s.x * w + R.sFx * K * s.face;
        const hy = s.ridge + R.sFy * K;
        const ang = Math.atan2((s.aimX - hx) * s.face, s.aimY - hy);
        s.aimPose.sF = clamp(ang - 0.1, 0.2, 2.9);
        if (q < 0.38) mix(pose, s.src, WIND, easeOutCubic(q / 0.38));
        else if (q < 0.58) mix(pose, WIND, s.aimPose, easeOutBack((q - 0.38) / 0.2));
        else mix(pose, s.aimPose, IDLE, easeInOutCubic(clamp((q - 0.58) / 0.42, 0, 1)));
        if (!s.struck && q >= 0.42) {
          s.struck = true;
          rig(pose);
          releaseStars(s, env);
        }
        targetWind = 0.7;
        if (q >= 1) s.act = 0;
      } else if (s.act === 4) {
        const q = s.pt / CAST;
        if (q < 0.35) mix(pose, s.src, CASTP, easeOutBack(q / 0.35));
        else mix(pose, CASTP, IDLE, easeInOutCubic((q - 0.35) / 0.65));
        targetWind = 0.8;
        if (q >= 1) s.act = 0;
      } else if (s.act === 2) {
        const before = s.pt - dt;
        if (s.pt < VANISH) {
          const q = s.pt / VANISH;
          mix(pose, s.src, CROUCH, easeOutCubic(q));
          s.alpha = 1 - easeInOutCubic(q);
          if (before < 0.03 && s.pt >= 0.03) addShadow(s, env, s.x, s.x, 1, s.face);
        } else if (s.pt < APPEAR) {
          s.alpha = 0;
        } else {
          if (before < APPEAR) {
            s.x = s.toX;
            s.face = s.dummies[s.target].x > s.x ? 1 : -1;
            s.m.face = s.face;
            s.m.turn = s.face;
            applyMark(s, env);
            shards(s, 6, s.x * w, s.ridge - 40 * K, 1.2, 300 * K, 2);
          }
          s.alpha = Math.min(1, (s.pt - APPEAR) / 0.05);
          const q = (s.pt - APPEAR) / (MARK_END - APPEAR);
          if (q < 0.2) mix(pose, CROUCH, RAISE, easeOutCubic(q / 0.2));
          else if (q < 0.38) mix(pose, RAISE, SLASH, easeOutBack((q - 0.2) / 0.18));
          else mix(pose, SLASH, IDLE, easeInOutCubic(clamp((q - 0.45) / 0.55, 0, 1)));
          if (!s.struck && q >= 0.28) {
            s.struck = true;
            hitPost(s, env, s.target, 1, -s.face);
            if (!env.reducedMotion) {
              s.stop = 0.07;
              s.shake = Math.max(s.shake, 0.5);
            }
            const bus = snd(s, env);
            if (bus) noise(bus, { duration: 0.3, gain: 0.18, freq: 2200, q: 0.9 });
          }
        }
        targetWind = 1;
        if (s.pt >= MARK_END) {
          s.act = 0;
          s.alpha = 1;
        }
        if (env.reducedMotion) env.wake(500);
      } else if (s.act === 3) {
        const before = s.pt - dt;
        const q = s.pt / SWAP;
        if (before < 0.05 && s.pt >= 0.05) {
          const sh = s.shadows[s.swapTo];
          const ox = s.x;
          s.x = sh.x;
          sh.x = ox;
          sh.tx = ox;
          sh.face = s.face;
          s.face = s.x < 0.5 ? 1 : -1;
          const i = nearestPost(s, env, s.x * w);
          if (i >= 0) s.face = s.dummies[i].x >= s.x ? 1 : -1;
          s.m.face = s.face;
          s.m.turn = s.face;
        }
        mix(pose, LAND, IDLE, easeOutCubic(clamp(q, 0, 1)));
        s.alpha = s.pt < 0.05 ? 1 - s.pt / 0.05 : Math.min(1, (s.pt - 0.05) / 0.06);
        targetWind = 1;
        if (q >= 1) {
          s.act = 0;
          s.alpha = 1;
        }
      } else if (s.act === 6) {
        const q = s.pt / SLASHE;
        if (q < 0.28) mix(pose, s.src, SPIN_A, easeOutCubic(q / 0.28));
        else if (q < 0.6) mix(pose, SPIN_A, SPIN_B, easeOutBack((q - 0.28) / 0.32));
        else mix(pose, SPIN_B, IDLE, easeInOutCubic((q - 0.6) / 0.4));
        if (!s.struck && q >= 0.3) {
          s.struck = true;
          slashLands(s, env);
        }
        targetWind = 1;
        if (q >= 1) s.act = 0;
      } else if (s.act === 7) {
        const q = s.pt / ATTACK;
        const right = s.atkN % 2 === 0;
        if (q < 0.38) mix(pose, s.src, right ? WIND : CASTP, easeOutCubic(q / 0.38));
        else if (q < 0.58) mix(pose, right ? WIND : CASTP, SLASH, easeOutBack((q - 0.38) / 0.2));
        else mix(pose, SLASH, IDLE, easeInOutCubic((q - 0.58) / 0.42));
        if (!s.struck && q >= 0.44) {
          s.struck = true;
          if (s.chase >= 0) {
            hitPost(s, env, s.chase, 1, s.face);
            if (!env.reducedMotion) {
              s.stop = Math.max(s.stop, 0.05);
              s.shake = Math.max(s.shake, 0.22);
            }
          }
        }
        targetWind = 0.7;
        if (q >= 1) s.act = 0;
      } else if (s.act === 5) {
        const q = s.pt / STEP_HOME;
        s.alpha = q < 0.4 ? 1 - q / 0.4 : q < 0.6 ? 0 : (q - 0.6) / 0.4;
        if (s.pt - dt < STEP_HOME * 0.5 && s.pt >= STEP_HOME * 0.5) {
          shards(s, 5, s.x * w, s.ridge - 30 * K, 1.1, 240 * K, 2);
          s.x = HOME;
          s.face = 1;
          s.m.face = 1;
          s.m.turn = 1;
          shards(s, 5, s.x * w, s.ridge - 30 * K, 1.1, 240 * K, 2);
        }
        mix(pose, pose, q < 0.5 ? CROUCH : IDLE, 1 - Math.exp(-12 * dt));
        if (q >= 1) {
          s.act = 0;
          s.alpha = 1;
        }
      } else {
        const running = s.m.stride > 0.08;
        mix(pose, pose, running ? RUN : IDLE, 1 - Math.exp(-(running ? 18 : 10) * dt));
        if (running) targetWind = 0.5 + s.m.stride * 0.6;
        s.alpha = 1;
        // left alone, he shadow steps back to his spot after a while
        s.still += dt;
        const far = Math.abs(s.x - HOME) > 0.05;
        if (auto && far && s.still > 2.6 && s.markT <= 0) begin(s, 5);
      }
      // the drawn pose: the run cycle swings the feet and arms through on top of the pose
      {
        const d = s.dpose;
        mix(d, pose, pose, 0);
        const st = s.act === 0 ? s.m.stride : 0;
        if (st > 0.01) {
          const ph = s.m.gait;
          d.fF += Math.sin(ph) * 34 * st;
          d.fB -= Math.sin(ph) * 34 * st;
          d.lF += Math.max(0, -Math.cos(ph)) * 18 * st;
          d.lB += Math.max(0, Math.cos(ph)) * 18 * st;
          d.cr += Math.abs(Math.cos(ph)) * 0.08 * st;
          d.sF += Math.sin(ph) * 0.25 * st;
          d.sB -= Math.sin(ph) * 0.25 * st;
        }
      }
      if (env.reducedMotion && (s.m.going || s.chase >= 0 || s.act !== 0)) env.wake(400);
      if (s.act !== 0 || s.m.going) s.still = 0;
      s.wind = damp(s.wind, targetWind, 5, dt);

      // the mark ticks, then pops and Zed swaps back to the shadow he left
      if (s.markT > 0) {
        s.markT -= dt;
        if (s.markT <= 0) {
          s.markT = 0;
          popMark(s, env);
        }
        if (env.reducedMotion) env.wake(400);
      }
      if (s.popT > 0) {
        s.popT += dt;
        if (s.popT > 0.4) {
          s.popT = 0;
          const r = s.shadows.findIndex((sh) => sh.kind === 1 && sh.life > 0);
          if (r >= 0 && (s.act === 0 || !locked(s))) swapWith(s, env, r);
          s.markI = -1;
        }
      }

      // shadows dash out, linger and sink away
      for (const sh of s.shadows) {
        if (sh.life <= 0) continue;
        sh.life -= dt;
        sh.age += dt;
        sh.x = damp(sh.x, sh.tx, 14, dt);
        if (Math.random() < 0.08) emit(s.parts, sh.x * w + rand(-20, 20) * K, s.ridge - rand(10, 160) * K, rand(-10, 10) * K, rand(-90, -40) * K, rand(0.3, 0.5), rand(5, 8) * K, 2, 1, 0);
        if (sh.life <= 0) shards(s, 5, sh.x * w, s.ridge - 20 * K, 1.1, 200 * K, 2);
      }

      // shurikens
      for (const st of s.stars) {
        if (st.life <= 0) continue;
        st.life -= dt;
        st.x += st.vx * dt;
        st.y += st.vy * dt;
        st.rot += dt * 28;
        if (st.x < -80 || st.x > w + 80 || st.y < -80 || st.y > h + 80) st.life = 0;
        for (let i = 0; i < s.dummies.length; i++) {
          if (st.hit & (1 << i)) continue;
          const d = s.dummies[i];
          if (d.dead || d.rise < 1) continue;
          const dx = posX(s, env, i);
          if (Math.abs(st.x - dx) < 26 * K && st.y > s.ridge - 160 * K && st.y < s.ridge - 30 * K) {
            st.hit |= 1 << i;
            hitPost(s, env, i, 1, st.vx >= 0 ? 1 : -1);
            if (!env.reducedMotion) s.stop = Math.max(s.stop, 0.04);
          }
        }
      }

      // posts wobble, split and grow back out of the dark
      for (const d of s.dummies) {
        d.flash = Math.max(0, d.flash - dt);
        d.wobV += (-d.wob * 90 - d.wobV * 7) * dt;
        d.wob += d.wobV * dt * 0.02;
        if (d.dead) {
          d.fvy += 1300 * K * dt;
          d.fx += d.fvx * dt;
          d.fy += d.fvy * dt;
          d.fr += d.fvr * dt;
          d.respawn -= dt;
          if (d.respawn <= 0) {
            d.dead = false;
            d.hp = 3;
            d.rise = 0;
            d.wob = 0;
            d.wobV = 0;
          }
        } else if (d.rise < 1) d.rise = Math.min(1, d.rise + dt * 2.2);
      }

      // falling maple leaves on the wind
      for (let i = 0; i < LEAVES; i++) {
        const o = i * 6;
        s.leaves[o] -= dt * 0.05 * s.leaves[o + 3] * (1 + s.wind);
        s.leaves[o + 1] += dt * 0.05 * s.leaves[o + 3];
        s.leaves[o + 2] += dt * 3 * s.leaves[o + 3];
        if (s.leaves[o] < -0.05 || s.leaves[o + 1] > 1.05) {
          s.leaves[o] = 0.3 + Math.random() * 0.8;
          s.leaves[o + 1] = -0.05;
        }
      }
      for (let i = 0; i < 4; i++) {
        s.clouds[i * 3] += dt * 0.006 * s.clouds[i * 3 + 2];
        if (s.clouds[i * 3] > 1.3) s.clouds[i * 3] = -0.3;
      }

      // the ability bar mirrors the cooldowns
      const sl = s.slots;
      sl[0].cd = s.cdQ;
      sl[1].cd = s.cdW;
      sl[1].lit = s.shadows.some((sh) => sh.kind === 0 && sh.life > 0);
      sl[2].cd = s.cdE;
      sl[3].cd = s.cdR;
      sl[3].lit = s.markT > 0;
    },
    draw: (s, env, t) => {
      const { ctx, w, h, dpr } = env;
      const u = s.u;
      const K = s.K;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 14 * u;
      ctx.save();
      ctx.translate(snap(shakeX(amp, t), dpr), snap(shakeY(amp, t), dpr));
      drawBackdrop(ctx, s.bg);

      // drifting flat cloud bands
      for (let i = 0; i < 2; i++) {
        const cx = s.clouds[i * 3] * w;
        const cy = s.clouds[i * 3 + 1] * h;
        ctx.fillStyle = '#5a4058';
        cloudBand(ctx, cx, cy - 1.5 * u, 170 * u * s.clouds[i * 3 + 2], 9 * u, i * 3.7);
        ctx.fillStyle = '#2a1a30';
        cloudBand(ctx, cx, cy, 170 * u * s.clouds[i * 3 + 2], 9 * u, i * 3.7);
      }

      // paper lanterns on a cord across the upper right
      {
        const x0 = w * 0.5;
        const x1 = w * 1.04;
        const y0 = -6 * u;
        const sag = 60 * u;
        ctx.strokeStyle = '#140c10';
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0 + 20 * u);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const q = 0.18 + i * 0.22;
          const lx = lerp(lerp(x0, (x0 + x1) / 2, q), lerp((x0 + x1) / 2, x1, q), q);
          const ly = lerp(lerp(y0, y0 + sag * 2, q), lerp(y0 + sag * 2, y0 + 20 * u, q), q);
          const sway = Math.sin(t * 1.4 + i * 1.3) * 0.08 - s.wind * 0.05;
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, s.warm, lx - Math.sin(sway) * 17 * u, ly + 17 * u, 40 * u, 0.6 + Math.sin(t * 5 + i) * 0.04);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(sway);
          lantern(ctx, 13 * u, '#c8321e', '#5a120c', '#1a0e0a');
          ctx.restore();
        }
      }

      // training posts
      for (let i = 0; i < s.dummies.length; i++) {
        const d = s.dummies[i];
        const x = posX(s, env, i);
        const y = s.ridge;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4 * K, 28 * K, 4.5 * K, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(K, K);
        if (d.dead) {
          // lower half stays, the top flies
          const cutY = -96;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(-60, cutY + 60 * d.cut);
          ctx.lineTo(60, cutY - 60 * d.cut);
          ctx.lineTo(60, 10);
          ctx.lineTo(-60, 10);
          ctx.closePath();
          ctx.clip();
          dummyBody(ctx, d, t);
          ctx.restore();
          ctx.save();
          ctx.translate(d.fx / K, d.fy / K + cutY);
          ctx.rotate(d.fr);
          ctx.translate(0, -cutY);
          ctx.beginPath();
          ctx.moveTo(-60, cutY + 60 * d.cut);
          ctx.lineTo(60, cutY - 60 * d.cut);
          ctx.lineTo(60, -200);
          ctx.lineTo(-60, -200);
          ctx.closePath();
          ctx.clip();
          dummyBody(ctx, d, t);
          ctx.restore();
        } else {
          // regrowth rises out of the roof with a hard edge, no smoke blob
          if (d.rise < 1) {
            ctx.beginPath();
            ctx.rect(-80, -200 * easeOutCubic(d.rise), 160, 220);
            ctx.clip();
          }
          ctx.rotate(d.wob);
          dummyBody(ctx, d, t);
        }
        ctx.restore();
        if (d.flash > 0 && !d.dead) {
          const f = d.flash / 0.16;
          const sx = x - d.hitDir * 14 * K;
          const sy = y - 92 * K;
          ctx.fillStyle = '#e3202f';
          spark(ctx, sx, sy, (30 + 30 * (1 - f)) * K, 3.2 * K * f, 0.5 * d.hitDir);
          ctx.fillStyle = '#fff4f0';
          spark(ctx, sx, sy, (20 + 22 * (1 - f)) * K, 1.6 * K * f, 0.5 * d.hitDir);
        }
        if (!d.dead && d.rise < 1 && d.rise > 0) {
          const top = y - 200 * K * easeOutCubic(d.rise);
          ctx.fillStyle = '#b48aff';
          ctx.fillRect(x - 26 * K, top, 52 * K, Math.max(1, 1.5 * K));
        }
      }

      // Death Mark: the ground seal and the spinning mark over the target
      if (s.markI >= 0 && (s.markT > 0 || s.popT > 0)) {
        const x = posX(s, env, s.markI);
        const q = 1 - s.markT / MARK;
        const spin = t * (3 + q * 9);
        const beat = s.markT > 0 ? 0.9 + 0.1 * Math.sin(t * (10 + q * 30)) : 1;
        const pop = s.popT > 0 ? easeOutCubic(s.popT / 0.4) : 0;
        const late = s.markT > 0 ? Math.max(0, q - 0.75) * 4 : 0;
        if (pop < 1) {
          drawSigil(ctx, x, s.ridge + 2 * K, 62 * K * (1 + pop * 0.4), -spin * 0.6, 0.24, 0);
          const my = s.ridge - 132 * K;
          const r = 26 * K * beat * (1 + late * 0.25) * (1 - pop);
          if (r > 1) {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, s.red, x, my, r * 1.9, 0.5 + late * 0.3);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            drawSigil(ctx, x, my, r, spin, 1, late);
                        // stored hits as red diamonds around the mark
            ctx.fillStyle = '#ff4a55';
            for (let k = 0; k < Math.min(4, s.markHits); k++) {
              const a = -Math.PI / 2 + (k - 1.5) * 0.5;
              const hx = x + Math.cos(a) * r * 1.75;
              const hy = my + Math.sin(a) * r * 1.75;
              ctx.beginPath();
              ctx.moveTo(hx, hy - 4 * K);
              ctx.lineTo(hx + 2.5 * K, hy);
              ctx.lineTo(hx, hy + 4 * K);
              ctx.lineTo(hx - 2.5 * K, hy);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
        if (s.popT > 0) {
          // the pop: a hard ring and blade lines through the target
          const y = s.ridge - 92 * K;
          const fade = 1 - pop;
          ctx.strokeStyle = '#ff2a3c';
          ctx.lineWidth = Math.max(1, 7 * K * fade);
          ctx.beginPath();
          ctx.arc(x, y, 30 * K + pop * 200 * K, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = '#fff0ec';
          ctx.lineWidth = Math.max(1, 2 * K * fade);
          ctx.stroke();
          for (let k = 0; k < 6; k++) {
            const a = k * 1.05 + 0.3;
            const r0 = 26 * K + pop * 70 * K;
            const r1 = 110 * K + pop * 170 * K;
            const wd = (k % 2 ? 2.5 : 6) * K * fade;
            const cs = Math.cos(a);
            const sn = Math.sin(a);
            ctx.fillStyle = k % 2 ? '#fff0ec' : '#e3202f';
            ctx.beginPath();
            ctx.moveTo(x + cs * r0, y + sn * r0);
            ctx.lineTo(x + cs * (r0 + r1) * 0.5 - sn * wd, y + sn * (r0 + r1) * 0.5 + cs * wd);
            ctx.lineTo(x + cs * r1, y + sn * r1);
            ctx.lineTo(x + cs * (r0 + r1) * 0.5 + sn * wd, y + sn * (r0 + r1) * 0.5 - cs * wd);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Living Shadows: opaque dark copies with a violet edge and red eyes, sinking in and out
      for (const sh of s.shadows) {
        if (sh.life <= 0) continue;
        const x = sh.x * w;
        const a = Math.min(1, sh.age / 0.1) * Math.min(1, sh.life / 0.3);
        ctx.fillStyle = 'rgba(60,20,110,0.45)';
        ctx.beginPath();
        ctx.ellipse(x, s.ridge + 4 * K, 40 * K, 5 * K, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        const top = a < 1 ? sinkClip(ctx, x, s.ridge, K, a) : 0;
        ctx.translate(x, s.ridge);
        ctx.scale(K * sh.face, K);
        const dashing = Math.abs(sh.x - sh.tx) * w > 24 * K;
        shadowFigure(ctx, t, dashing ? DASHP : s.pose, s.wind + 0.3, 3.1 + sh.kind, -0.8 * sh.face);
        ctx.restore();
        sinkEdge(ctx, x, top, K, a);
        if (a > 0.6) {
          rig(dashing ? DASHP : s.pose);
          const ex = x + eyeX(dashing ? DASHP : s.pose) * K * sh.face;
          const ey = s.ridge + eyeY(dashing ? DASHP : s.pose) * K;
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, s.red, ex, ey, 9 * K, 0.7);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }

      drawMarker(ctx, s.marker, K);
      // the post he is chasing, and the one under the pointer, get a red ring at the base
      const hover = env.pointer.inside ? pickPost(s, env, env.pointer.x, env.pointer.y) : -1;
      for (const i of [s.chase, hover]) {
        if (i < 0 || s.dummies[i].dead) continue;
        ctx.strokeStyle = i === s.chase ? 'rgba(255,60,70,0.9)' : 'rgba(255,90,100,0.55)';
        ctx.lineWidth = Math.max(1, 2 * K);
        ctx.beginPath();
        ctx.ellipse(posX(s, env, i), s.ridge + 4 * K, 34 * K, 7 * K, 0, 0, TAU);
        ctx.stroke();
      }

      // Zed: ink outline, a cold silver rim from the moon, then the figure
      if (s.alpha > 0.01) {
        const x = s.x * w;
        const y = s.ridge;
        const ts = turnScale(s.m);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4 * K, 40 * K, 5 * K, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        const top = s.alpha < 1 ? sinkClip(ctx, x, y, K, s.alpha) : 0;
        ctx.translate(x, y);
        ctx.scale(K * ts, K);
        const p = s.dpose;
        const draw = (flat: string | null) => zed(ctx, t, p, flat, s.wind, 0.7);
        inkPass(ctx, draw, '#030205', 1.9);
        ctx.save();
        ctx.translate(-0.7 * Math.sign(ts), -1.4);
        draw('#9aa4bf');
        ctx.restore();
        draw(null);
        ctx.restore();
        sinkEdge(ctx, x, top, K, s.alpha);
        if (s.alpha > 0.6) {
          rig(p);
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, s.red, x + eyeX(p) * K * ts, y + eyeY(p) * K, 10 * K, 0.75 + Math.sin(t * 9) * 0.08);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        // basic attack: a red crescent off the wrist blades, sweeping through the post
        if (s.act === 7) {
          const q = (s.pt / ATTACK - 0.34) / 0.6;
          if (q > 0 && q < 1) {
            const up = s.atkN % 2 ? 1 : -1;
            const cx = lerp(x + s.face * 50 * K, s.atkX, 0.5);
            swing(ctx, cx, y - 100 * K, 70 * K, 30 * K, up * 0.5 * s.face, s.face > 0 ? -2.4 : -0.7, 2.2, q, 9 * K, s.face);
          }
        }
        // Death Mark cut: two crossing crescents through the target
        if (s.act === 2 && s.pt > APPEAR) {
          const q = ((s.pt - APPEAR) / (MARK_END - APPEAR) - 0.22) / 0.55;
          if (q > 0 && q < 1) {
            const tx = posX(s, env, s.target);
            swing(ctx, tx, y - 100 * K, 92 * K, 34 * K, -0.7 * s.face, -2.6, 2.4, q, 12 * K, 1);
            swing(ctx, tx, y - 96 * K, 84 * K, 30 * K, 0.6 * s.face, -0.4, -2.4, clamp(q - 0.12, 0, 1), 9 * K, -1);
          }
        }
      }

      // Shadow Slash: a ring of blades around Zed and every shadow
      if (s.act === 6) {
        const q = (s.pt / SLASHE - 0.22) / 0.72;
        if (q > 0 && q < 1) {
          for (let o = -1; o < s.shadows.length; o++) {
            if (o >= 0 && s.shadows[o].life <= 0) continue;
            const cx = (o < 0 ? s.x : s.shadows[o].x) * w;
            const cy = s.ridge - 74 * K;
            const r = lerp(70, 128, easeOutCubic(q)) * K;
            for (let k = 0; k < 3; k++) {
              const a0 = (k * TAU) / 3 + q * 2.2;
              swing(ctx, cx, cy, r, r * 0.42, 0, a0, 1.9, q, 15 * K, 1);
            }
            // the outer ring: a thin hard line that fades by thinning
            ctx.strokeStyle = '#ff4656';
            ctx.lineWidth = Math.max(1, 2.2 * K * (1 - q));
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 1.08, r * 0.45, 0, 0, TAU);
            ctx.stroke();
          }
        }
      }

      // swap: a violet slit on both ends
      if (s.swapFx > 0) {
        const q = 1 - s.swapFx / 0.2;
        for (let k = 0; k < 2; k++) {
          const x = (k ? s.swapB : s.swapA) * w;
          const cy = s.ridge - 100 * K;
          const hh = (90 + 60 * q) * K;
          const ww = 10 * K * (1 - q);
          ctx.fillStyle = '#9d6bff';
          ctx.beginPath();
          ctx.moveTo(x, cy - hh);
          ctx.lineTo(x + ww, cy);
          ctx.lineTo(x, cy + hh * 0.9);
          ctx.lineTo(x - ww, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#f4ecff';
          ctx.beginPath();
          ctx.moveTo(x, cy - hh * 0.8);
          ctx.lineTo(x + ww * 0.35, cy);
          ctx.lineTo(x, cy + hh * 0.7);
          ctx.lineTo(x - ww * 0.35, cy);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#9d6bff';
          ctx.lineWidth = Math.max(1, 2 * K * (1 - q));
          ctx.beginPath();
          ctx.ellipse(x, s.ridge + 3 * K, (20 + 50 * q) * K, (4 + 6 * q) * K, 0, 0, TAU);
          ctx.stroke();
        }
      }

      // Death Mark travel: one shadow form racing along hard speed lines
      if (s.act === 2 && s.pt > VANISH * 0.5 && s.pt < APPEAR + 0.05) {
        const q = clamp((s.pt - VANISH * 0.5) / (APPEAR - VANISH * 0.5), 0, 1);
        const x0 = s.fromX * w;
        const x1 = lerp(s.fromX, s.toX, easeInOutCubic(q)) * w;
        const dir = s.toX >= s.fromX ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const ly = s.ridge - (60 + k * 45) * K;
          const lx0 = lerp(x0, x1, 0.15 + k * 0.12);
          const th = (k === 1 ? 3 : 2) * K;
          ctx.fillStyle = k === 1 ? '#e3202f' : '#9d6bff';
          ctx.beginPath();
          ctx.moveTo(lx0, ly);
          ctx.lineTo(x1 - dir * 30 * K, ly - th);
          ctx.lineTo(x1 - dir * 30 * K, ly + th);
          ctx.closePath();
          ctx.fill();
        }
        if (s.pt < APPEAR) {
          ctx.save();
          ctx.translate(x1, s.ridge);
          ctx.scale(K * dir, K);
          shadowFigure(ctx, t, DASHP, 1.4, 5, -0.8 * dir);
          ctx.restore();
        }
      }

      // particles, batched by look: hard shards and streaks, no soft blobs
      const items = s.parts.items;
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? '#9d6bff' : '#120a1c';
        ctx.beginPath();
        for (const p of items) {
          if (p.life <= 0 || p.kind !== (pass ? 2 : 0)) continue;
          const q = p.life / p.max;
          const L = p.size * q;
          const W = L * 0.32;
          const cs = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          ctx.moveTo(p.x + cs * L, p.y + sn * L);
          ctx.lineTo(p.x - sn * W, p.y + cs * W);
          ctx.lineTo(p.x - cs * L * 0.6, p.y - sn * L * 0.6);
          ctx.lineTo(p.x + sn * W, p.y - cs * W);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.fillStyle = '#b49a5a';
      ctx.beginPath();
      for (const p of items) {
        if (p.life <= 0 || p.kind !== 4) continue;
        const cs = Math.cos(p.rot) * p.size * 1.5;
        const sn = Math.sin(p.rot) * p.size * 1.5;
        const nx = -Math.sin(p.rot) * p.size * 0.22;
        const ny = Math.cos(p.rot) * p.size * 0.22;
        ctx.moveTo(p.x - cs - nx, p.y - sn - ny);
        ctx.lineTo(p.x + cs - nx, p.y + sn - ny);
        ctx.lineTo(p.x + cs + nx, p.y + sn + ny);
        ctx.lineTo(p.x - cs + nx, p.y - sn + ny);
        ctx.closePath();
      }
      ctx.fill();
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? '#fff4ee' : '#ff3446';
        ctx.beginPath();
        for (const p of items) {
          if (p.life <= 0 || p.kind !== (pass ? 3 : 1)) continue;
          const q = p.life / p.max;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp;
          const uy = p.vy / sp;
          const L = Math.min(sp * 0.035, 40 * K) + p.size;
          const W = p.size * 0.45 * q + 0.4;
          ctx.moveTo(p.x + ux * p.size, p.y + uy * p.size);
          ctx.lineTo(p.x - uy * W, p.y + ux * W);
          ctx.lineTo(p.x - ux * L, p.y - uy * L);
          ctx.lineTo(p.x + uy * W, p.y - ux * W);
          ctx.closePath();
        }
        ctx.fill();
      }

      // shurikens on top
      for (const st of s.stars) if (st.life > 0) drawStar(ctx, st, 17 * K * st.big);

      // maple leaves
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? '#b0141e' : '#6e0c16';
        ctx.beginPath();
        for (let i = 0; i < LEAVES; i++) {
          const o = i * 6;
          if (s.leaves[o + 5] > 0.5 !== (pass === 1)) continue;
          const lx = s.leaves[o] * w + Math.sin(t * 1.3 + s.leaves[o + 4]) * 14 * u;
          const ly = s.leaves[o + 1] * h;
          const rot = s.leaves[o + 2];
          const fl = Math.sin(rot * 1.7);
          const sz = (2.5 + s.leaves[o + 5] * 2.5) * u;
          const cs = Math.cos(rot);
          const sn = Math.sin(rot);
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU;
            const rr = k % 2 ? sz * 0.5 : sz * 1.4;
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr * fl;
            const X = lx + px * cs - py * sn;
            const Y = ly + px * sn + py * cs;
            if (k) ctx.lineTo(X, Y);
            else ctx.moveTo(X, Y);
          }
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,40,60,${(s.flash * 0.16).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      drawHoldRing(ctx, s.g, u, '255,70,80');
      if (env.interactive) {
        const k = Math.max(0.8, Math.min(1.25, u * 0.9));
        drawAbilityBar(ctx, w / 2, h - Math.round(30 * k) - Math.max(14, 18 * k), k, s.slots, s.slotFlash);
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
      freeCanvas(s.bg, s.red, s.warm);
      s.bg = null;
    },
  });
