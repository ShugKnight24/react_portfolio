import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
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

/**
 * Armored Titan: the plated titan charges Wall Maria's outer gate at sunset. Holding builds the
 * charge: he starts a run toward the wall that speeds up as the charge grows, every footfall
 * shakes the ground, and steam pours off his joints. Letting go (or reaching the launch line)
 * turns it into a flat out sprint that ends shoulder first in the gate: hit-stop, a flash and
 * a dust shock ring, then every stone around the gate is thrown out, the door planks break
 * and the arch collapses while the cannons on the parapet topple off. After a beat he backs
 * away and the wall rebuilds itself stone by stone. The figure is solved from a procedural
 * run cycle with two-bone IK; the wall, the field and the breach are baked once per resize.
 */

type C = CanvasRenderingContext2D;

interface Piece {
  /** outline around the centroid, units */
  pts: number[];
  /** 0 stone, 1 door plank */
  kind: number;
  rx: number;
  ry: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  rot: number;
  spin: number;
  rad: number;
  delay: number;
  loose: boolean;
  rest: boolean;
  sx: number;
  sy: number;
  sz: number;
  sr: number;
  tone: number;
}

interface Cannon {
  rx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  rot: number;
  spin: number;
  delay: number;
  state: number; // 0 mounted, 1 falling, 2 landed
  sx: number;
  sy: number;
  sr: number;
}

interface State {
  phase: number; // 0 ready or charging, 1 sprint, 2 breach, 3 settle, 4 rebuild
  pt: number;
  x: number;
  home: number;
  gateX: number;
  charge: number;
  power: number;
  vel: number;
  held: boolean;
  autoHold: boolean;
  touched: boolean;
  idle: number;
  autoT: number;
  // pose drivers
  phi: number;
  run: number;
  lean: number;
  crouch: number;
  tuck: number;
  lastCos: number[];
  steamAcc: number;
  // world
  pieces: Piece[];
  cannons: Cannon[];
  broken: boolean;
  breach: number;
  parts: Pool;
  shake: number;
  stop: number;
  flash: number;
  ring: number;
  thudCD: number;
  clackCD: number;
  hum: Hum | null;
  // layout
  u: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  soft: HTMLCanvasElement;
  dust: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  eye: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const MAX_PARTS = 640;
/** titan drawing scale over the joint units */
const TS = 1.15;
const WALL_H = 400;
const GATE_HW = 75;
const GATE_SIDE = 170;
const ARCH_OUT = 102;

// dust and steam sprites drawn soft, chips drawn as little stones
const CHIP = 0;
const DUST = 1;
const STEAM = 2;

const ARMOR = ['#5a4629', '#98794a', '#cdb27a', '#f4e4b4'];
const ARMOR_FAR = ['#3f311d', '#6c5735', '#94804f', '#b8a577'];
const MUSCLE = ['#3a0e0b', '#76211a', '#ad382b', '#d9674f'];
const MUSCLE_FAR = ['#2a0907', '#561812', '#7d281f', '#9c4636'];
const STONE = ['#6d665b', '#a8a092', '#c8c0af', '#e4dccb'];
const WOOD = ['#2c1c10', '#57391f', '#77522e', '#9a7446'];
const OUTLINE = '#24190c';

/* joints in local units (feet origin, facing right): hip, chest, head, near shoulder, near elbow,
   near hand, far shoulder, far elbow, far hand, near knee, near foot, far knee, far foot */
const J = new Array<number>(26).fill(0);

/* ---------- small geometry ---------- */

function ik(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number, out: number[], i: number) {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  d = Math.max(d, 1);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const k = base - bend * a;
  out[i] = hx + Math.cos(k) * l1;
  out[i + 1] = hy + Math.sin(k) * l1;
  out[i + 2] = hx + dx;
  out[i + 3] = hy + dy;
}

/** Solve the titan's joints from the pose drivers */
function solve(s: State) {
  const run = s.run;
  const lean = s.lean;
  const tuck = s.tuck;
  const hipX = lean * 10;
  const hipY = -118 + s.crouch * 18 + run * 10 - run * 6 * Math.cos(s.phi * 2);
  const a = lean;
  const cx = hipX + Math.sin(a) * 74;
  const cy = hipY - Math.cos(a) * 74;
  const ha = a + 0.22 + tuck * 0.35 - s.crouch * 0.1;
  J[0] = hipX;
  J[1] = hipY;
  J[2] = cx;
  J[3] = cy;
  J[4] = cx + Math.sin(ha) * 40 + 8;
  J[5] = cy - Math.cos(ha) * 40 + 4;
  // shoulders sit forward and low: the titan is hunched
  J[6] = cx + 4;
  J[7] = cy + 10;
  J[12] = cx - 8;
  J[13] = cy + 6;
  // legs: foot follows a loop, stance sweeps back, swing lifts and comes forward
  const stride = 10 + 54 * run;
  const lift = 48 * run;
  for (let leg = 0; leg < 2; leg++) {
    const p = s.phi + leg * Math.PI;
    const base = leg === 0 ? 10 : -12;
    const fx = hipX + base - stride * Math.sin(p);
    const fy = -Math.max(0, -Math.cos(p)) * lift;
    ik(hipX + (leg === 0 ? 4 : -4), hipY, fx, fy, 66, 66, 1, J, leg === 0 ? 18 : 22);
  }
  // arms pump opposite to the legs; tuck folds the near arm across the chest for the charge
  for (let arm = 0; arm < 2; arm++) {
    const p = s.phi + arm * Math.PI;
    const sx = arm === 0 ? J[6] : J[12];
    const sy = arm === 0 ? J[7] : J[13];
    let hx = sx + 12 + Math.sin(p) * 50 * run;
    let hy = sy + 96 - run * 28 - Math.max(0, Math.sin(p)) * 34 * run;
    if (arm === 0) {
      hx = lerp(hx, cx + 34, tuck);
      hy = lerp(hy, cy + 40, tuck);
    } else {
      hx = lerp(hx, sx - 66, tuck);
      hy = lerp(hy, sy + 58, tuck);
    }
    ik(sx, sy, hx, hy, 58, 56, -1, J, arm === 0 ? 8 : 14);
  }
}

/* ---------- drawing the titan ---------- */

function capsule(c: C, x0: number, y0: number, x1: number, y1: number, wd: number, col: string) {
  c.strokeStyle = col;
  c.lineWidth = wd;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** Red muscle limb with striation and a lit top edge */
function muscle(c: C, x0: number, y0: number, x1: number, y1: number, wd: number, cols: string[], flat: string | null) {
  if (flat) {
    capsule(c, x0, y0, x1, y1, wd, flat);
    return;
  }
  capsule(c, x0, y0, x1, y1, wd + 2.4, OUTLINE);
  capsule(c, x0, y0, x1, y1, wd, cols[1]);
  capsule(c, x0 - wd * 0.08, y0 - wd * 0.12, x1 - wd * 0.08, y1 - wd * 0.12, wd * 0.6, cols[2]);
  capsule(c, x0 - wd * 0.14, y0 - wd * 0.3, x1 - wd * 0.14, y1 - wd * 0.3, wd * 0.14, cols[3]);
  // fibres
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  c.strokeStyle = cols[0];
  c.lineWidth = 1;
  c.beginPath();
  for (let i = -1; i <= 1; i += 2) {
    c.moveTo(lerp(x0, x1, 0.15) + nx * wd * 0.22 * i, lerp(y0, y1, 0.15) + ny * wd * 0.22 * i);
    c.lineTo(lerp(x0, x1, 0.85) + nx * wd * 0.12 * i, lerp(y0, y1, 0.85) + ny * wd * 0.12 * i);
  }
  c.stroke();
}

/** Tapered armor plate over a segment from k0 to k1, bevelled with four values */
function plate(
  c: C,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  k0: number,
  k1: number,
  cols: string[],
  flat: string | null,
  ridge = true
) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  let nx = -Math.sin(a);
  let ny = Math.cos(a);
  // make n point to the lit side (up)
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const ax = lerp(x0, x1, k0);
  const ay = lerp(y0, y1, k0);
  const bx = lerp(x0, x1, k1);
  const by = lerp(y0, y1, k1);
  const dx = (bx - ax) / (Math.hypot(bx - ax, by - ay) || 1);
  const dy = (by - ay) / (Math.hypot(bx - ax, by - ay) || 1);
  const mx = lerp(ax, bx, 0.5);
  const my = lerp(ay, by, 0.5);
  const wm = (w0 + w1) * 0.29;
  c.beginPath();
  c.moveTo(ax + nx * w0 * 0.42, ay + ny * w0 * 0.42);
  c.quadraticCurveTo(mx + nx * wm * 1.15, my + ny * wm * 1.15, bx + nx * w1 * 0.42, by + ny * w1 * 0.42);
  c.bezierCurveTo(bx + dx * w1 * 0.3 + nx * w1 * 0.3, by + dy * w1 * 0.3 + ny * w1 * 0.3, bx + dx * w1 * 0.3 - nx * w1 * 0.3, by + dy * w1 * 0.3 - ny * w1 * 0.3, bx - nx * w1 * 0.42, by - ny * w1 * 0.42);
  c.quadraticCurveTo(mx - nx * wm * 1.1, my - ny * wm * 1.1, ax - nx * w0 * 0.42, ay - ny * w0 * 0.42);
  c.bezierCurveTo(ax - dx * w0 * 0.3 - nx * w0 * 0.3, ay - dy * w0 * 0.3 - ny * w0 * 0.3, ax - dx * w0 * 0.3 + nx * w0 * 0.3, ay - dy * w0 * 0.3 + ny * w0 * 0.3, ax + nx * w0 * 0.42, ay + ny * w0 * 0.42);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    return;
  }
  c.fillStyle = cols[1];
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.6;
  c.stroke();
  // shadow band on the underside
  c.fillStyle = cols[0];
  c.beginPath();
  c.moveTo(ax - nx * w0 * 0.5, ay - ny * w0 * 0.5);
  c.lineTo(bx - nx * w1 * 0.5, by - ny * w1 * 0.5);
  c.lineTo(bx - nx * w1 * 0.12, by - ny * w1 * 0.12);
  c.lineTo(ax - nx * w0 * 0.14, ay - ny * w0 * 0.14);
  c.closePath();
  c.fill();
  // light face and a bright edge
  c.fillStyle = cols[2];
  c.beginPath();
  c.moveTo(ax + nx * w0 * 0.4, ay + ny * w0 * 0.4);
  c.lineTo(bx + nx * w1 * 0.4, by + ny * w1 * 0.4);
  c.lineTo(bx + nx * w1 * 0.08, by + ny * w1 * 0.08);
  c.lineTo(ax + nx * w0 * 0.08, ay + ny * w0 * 0.08);
  c.closePath();
  c.fill();
  c.strokeStyle = cols[3];
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(lerp(ax, bx, 0.1) + nx * w0 * 0.42, lerp(ay, by, 0.1) + ny * w0 * 0.42);
  c.lineTo(lerp(ax, bx, 0.8) + nx * w1 * 0.42, lerp(ay, by, 0.8) + ny * w1 * 0.42);
  c.stroke();
  if (ridge) {
    // a centre ridge line like cracked stone
    c.strokeStyle = cols[0];
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(lerp(ax, bx, 0.2), lerp(ay, by, 0.2));
    c.lineTo(lerp(ax, bx, 0.75) + nx * 2, lerp(ay, by, 0.75) + ny * 2);
    c.stroke();
  }
}

function drawHead(c: C, hx: number, hy: number, a: number, flat: string | null, t: number, glowEye: HTMLCanvasElement) {
  c.save();
  c.translate(hx, hy);
  c.rotate(a);
  c.scale(1.2, 1.2);
  // thick red neck behind the skull
  c.fillStyle = flat ?? MUSCLE[1];
  c.beginPath();
  c.moveTo(-22, 4);
  c.quadraticCurveTo(-18, 30, 0, 36);
  c.lineTo(16, 26);
  c.lineTo(4, 4);
  c.closePath();
  c.fill();
  if (!flat) {
    c.strokeStyle = MUSCLE[0];
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-14, 10);
    c.quadraticCurveTo(-10, 24, 2, 30);
    c.moveTo(-6, 8);
    c.quadraticCurveTo(-2, 20, 8, 26);
    c.stroke();
  }
  // skull: domed cranium, sloped forehead, deep brow, blunt nose plate, long square jaw
  c.beginPath();
  c.moveTo(-20, 14);
  c.bezierCurveTo(-28, 2, -28, -18, -16, -27);
  c.bezierCurveTo(-4, -35, 14, -32, 21, -20);
  c.lineTo(27, -11);
  c.lineTo(24, -6);
  c.lineTo(29, 1);
  c.lineTo(25, 4);
  c.lineTo(27, 7);
  c.lineTo(27, 19);
  c.quadraticCurveTo(18, 25, 6, 25);
  c.lineTo(-8, 21);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.restore();
    return;
  }
  const g = c.createLinearGradient(14, -32, -16, 22);
  g.addColorStop(0, ARMOR[3]);
  g.addColorStop(0.3, ARMOR[2]);
  g.addColorStop(0.72, ARMOR[1]);
  g.addColorStop(1, ARMOR[0]);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.6;
  c.stroke();
  // plate seams across the cranium
  c.strokeStyle = ARMOR[0];
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-8, -31);
  c.quadraticCurveTo(-4, -12, -12, 12);
  c.moveTo(6, -31);
  c.quadraticCurveTo(8, -20, 4, -8);
  c.stroke();
  // short pale hair, cropped close
  c.fillStyle = '#eadca4';
  c.beginPath();
  c.moveTo(-24, -8);
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const ang = Math.PI * (1.05 + k * 0.62);
    const r = 28;
    const x = -4 + Math.cos(ang) * r;
    const y = -6 + Math.sin(ang) * r;
    c.lineTo(x + Math.cos(ang) * (5 + (i % 2) * 3), y + Math.sin(ang) * (5 + (i % 2) * 3));
    c.lineTo(x, y);
  }
  c.lineTo(12, -26);
  c.quadraticCurveTo(-6, -28, -22, -12);
  c.closePath();
  c.fill();
  c.strokeStyle = '#9b8a55';
  c.lineWidth = 0.9;
  c.stroke();
  // deep eye socket with a blank white eye
  c.fillStyle = '#2a1b0c';
  c.beginPath();
  c.ellipse(15, -6, 7.5, 4.6, 0.1, 0, TAU);
  c.fill();
  c.fillStyle = '#fbf8ee';
  c.beginPath();
  c.ellipse(16, -5.6, 4.6, 2.5, 0.1, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'lighter';
  glow(c, glowEye, 16, -5.6, 11 + Math.sin(t * 3) * 1.2, 0.5);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  // heavy brow catching the light
  c.strokeStyle = ARMOR[3];
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(6, -12.5);
  c.quadraticCurveTo(16, -14, 26, -11);
  c.stroke();
  // ridged cheek plate
  c.fillStyle = ARMOR[2];
  c.beginPath();
  c.moveTo(-4, -1);
  c.lineTo(22, 1);
  c.lineTo(24, 5);
  c.lineTo(-2, 6);
  c.closePath();
  c.fill();
  c.strokeStyle = ARMOR[0];
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    c.moveTo(1 + i * 4.6, 0);
    c.lineTo(1 + i * 4.6, 5.5);
  }
  c.stroke();
  // lipless mouth: a long row of teeth down the side of the jaw
  c.fillStyle = '#3a120c';
  c.beginPath();
  c.moveTo(-2, 6);
  c.lineTo(27, 6);
  c.lineTo(27, 15);
  c.lineTo(0, 13);
  c.closePath();
  c.fill();
  c.fillStyle = '#f3ecd6';
  for (let i = 0; i < 8; i++) {
    const x = 0.5 + i * 3.3;
    c.fillRect(x, 6.6, 2.4, 3.6);
    c.fillRect(x + 0.4, 10.2 + i * 0.1, 2.3, 3.4);
  }
  // jaw plate underneath
  c.fillStyle = ARMOR[1];
  c.beginPath();
  c.moveTo(0, 14);
  c.lineTo(27, 16);
  c.lineTo(26, 19);
  c.quadraticCurveTo(18, 24, 6, 24);
  c.lineTo(-6, 20);
  c.closePath();
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}

/** The Armored Titan in local units; flat paints a single-colour silhouette (rim pass) */
function titan(c: C, s: State, flat: string | null, t: number) {
  const hx = J[0];
  const hy = J[1];
  const cx = J[2];
  const cy = J[3];
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // far leg and far arm, one value darker
  muscle(c, hx - 4, hy, J[22], J[23], 42, MUSCLE_FAR, flat);
  muscle(c, J[22], J[23], J[24], J[25], 32, MUSCLE_FAR, flat);
  plate(c, hx - 4, hy, J[22], J[23], 30, 22, 0.14, 0.88, ARMOR_FAR, flat);
  plate(c, J[22], J[23], J[24], J[25], 30, 24, 0.1, 0.9, ARMOR_FAR, flat);
  foot(c, J[24], J[25], ARMOR_FAR, flat);
  muscle(c, J[12], J[13], J[14], J[15], 38, MUSCLE_FAR, flat);
  muscle(c, J[14], J[15], J[16], J[17], 32, MUSCLE_FAR, flat);
  plate(c, J[14], J[15], J[16], J[17], 28, 24, 0.14, 0.9, ARMOR_FAR, flat);
  fist(c, J[16], J[17], ARMOR_FAR, flat);

  // torso in its own frame: hip at the origin, spine up the -y axis, front toward +x
  const ta = Math.atan2(cy - hy, cx - hx) + Math.PI / 2;
  c.save();
  c.translate(hx, hy);
  c.rotate(ta);
  c.beginPath();
  c.moveTo(-34, 6);
  c.bezierCurveTo(-46, -24, -58, -58, -48, -84);
  c.quadraticCurveTo(-30, -100, 0, -96);
  c.quadraticCurveTo(34, -96, 50, -84);
  c.bezierCurveTo(64, -66, 58, -44, 48, -34);
  c.bezierCurveTo(46, -16, 42, 0, 34, 8);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(40, -96, -30, 0);
    g.addColorStop(0, MUSCLE[3]);
    g.addColorStop(0.4, MUSCLE[2]);
    g.addColorStop(1, MUSCLE[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 2;
    c.stroke();
    // exposed flank muscle
    c.strokeStyle = MUSCLE[0];
    c.lineWidth = 1.3;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const y = -20 - i * 12;
      c.moveTo(-30 + i * 1.5, y + 6);
      c.quadraticCurveTo(-6, y - 2, 12, y + 4);
    }
    c.stroke();
    c.strokeStyle = MUSCLE[3];
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-40, -70);
    c.quadraticCurveTo(-46, -40, -36, -10);
    c.stroke();
  }
  const cols = flat ? null : ARMOR;
  const slab = (pts: number[], ridge: boolean) => {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 4) c.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    c.closePath();
    if (!cols) {
      c.fillStyle = flat as string;
      c.fill();
      return;
    }
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) {
      minY = Math.min(minY, pts[i]);
      maxY = Math.max(maxY, pts[i]);
    }
    const g = c.createLinearGradient(0, minY, 0, maxY);
    g.addColorStop(0, cols[3]);
    g.addColorStop(0.25, cols[2]);
    g.addColorStop(0.7, cols[1]);
    g.addColorStop(1, cols[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.6;
    c.stroke();
    if (ridge) {
      c.strokeStyle = cols[0];
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pts[0] + 6, pts[1] + 4);
      c.lineTo(pts[pts.length - 2] - 4, pts[pts.length - 1] - 2);
      c.stroke();
    }
  };
  // shoulder blade plate on the upper back
  slab([-50, -80, -40, -98, -10, -94, 0, -80, -8, -64, -30, -56, -48, -62, -56, -72, -50, -80], true);
  // chest: one great slab over the pecs
  slab([8, -92, 40, -100, 56, -84, 66, -66, 52, -50, 30, -44, 10, -52, 0, -72, 8, -92], true);
  // belly: stacked bands
  for (let i = 0; i < 3; i++) {
    const y = -40 + i * 14;
    const x0 = 14 - i * 2;
    const x1 = 50 - i * 4;
    slab([x0, y, (x0 + x1) / 2, y - 3, x1, y, x1 + 3, y + 6, x1 - 2, y + 11, (x0 + x1) / 2, y + 13, x0, y + 11, x0 - 3, y + 5, x0, y], false);
  }
  c.restore();

  // near leg
  muscle(c, hx + 4, hy, J[18], J[19], 44, MUSCLE, flat);
  muscle(c, J[18], J[19], J[20], J[21], 34, MUSCLE, flat);
  plate(c, hx + 4, hy, J[18], J[19], 30, 24, 0.16, 0.86, ARMOR, flat);
  plate(c, J[18], J[19], J[20], J[21], 32, 26, 0.1, 0.9, ARMOR, flat);
  // knee cap
  if (!flat) {
    c.fillStyle = ARMOR[2];
    c.beginPath();
    c.arc(J[18] + 4, J[19] - 2, 14, 0, TAU);
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = ARMOR[3];
    c.beginPath();
    c.arc(J[18] + 1, J[19] - 7, 5, 0, TAU);
    c.fill();
  }
  foot(c, J[20], J[21], ARMOR, flat);

  // head sits between the shoulders
  const headA = Math.atan2(J[5] - cy, J[4] - cx) + Math.PI / 2 - 0.25;
  drawHead(c, J[4], J[5], headA, flat, t, s.eye);

  // near arm: bicep, forearm plate and the great shoulder guard on top
  muscle(c, J[6], J[7], J[8], J[9], 42, MUSCLE, flat);
  plate(c, J[6], J[7], J[8], J[9], 26, 22, 0.45, 0.9, ARMOR, flat);
  muscle(c, J[8], J[9], J[10], J[11], 36, MUSCLE, flat);
  plate(c, J[8], J[9], J[10], J[11], 34, 28, 0.12, 0.9, ARMOR, flat);
  fist(c, J[10], J[11], ARMOR, flat);
  // pauldron
  const pa = Math.atan2(J[9] - J[7], J[8] - J[6]);
  c.save();
  c.translate(J[6], J[7]);
  c.rotate(pa - Math.PI / 2);
  c.beginPath();
  c.moveTo(-32, -8);
  c.bezierCurveTo(-34, -44, 32, -46, 34, -8);
  c.lineTo(28, 22);
  c.quadraticCurveTo(0, 30, -28, 20);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(0, -40, 0, 26);
    g.addColorStop(0, ARMOR[3]);
    g.addColorStop(0.35, ARMOR[2]);
    g.addColorStop(1, ARMOR[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.8;
    c.stroke();
    c.strokeStyle = ARMOR[0];
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-26, 4);
    c.quadraticCurveTo(0, 12, 26, 4);
    c.moveTo(-8, -34);
    c.lineTo(-5, -6);
    c.stroke();
  }
  c.restore();
}

function foot(c: C, x: number, y: number, cols: string[], flat: string | null) {
  c.fillStyle = flat ?? cols[1];
  c.beginPath();
  c.moveTo(x - 18, y - 9);
  c.lineTo(x + 26, y - 9);
  c.quadraticCurveTo(x + 36, y - 4, x + 34, y + 1);
  c.lineTo(x - 18, y + 1);
  c.closePath();
  c.fill();
  if (flat) return;
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.2;
  c.stroke();
  c.fillStyle = cols[3];
  c.fillRect(x - 14, y - 9, 36, 2);
}

function fist(c: C, x: number, y: number, cols: string[], flat: string | null) {
  c.fillStyle = flat ?? cols[1];
  c.beginPath();
  c.arc(x, y, 18, 0, TAU);
  c.fill();
  if (flat) return;
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.4;
  c.stroke();
  c.fillStyle = cols[2];
  c.beginPath();
  c.arc(x - 4, y - 4, 11, 0, TAU);
  c.fill();
  c.strokeStyle = cols[0];
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + 3, y - 14);
  c.lineTo(x + 4, y + 14);
  c.stroke();
}

/* ---------- wall pieces ---------- */

function rectPts(x0: number, y0: number, x1: number, y1: number) {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

function addPiece(list: Piece[], pts: number[], kind: number, seed: () => number) {
  let cx = 0;
  let cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    cx += pts[i * 2];
    cy += pts[i * 2 + 1];
  }
  cx /= n;
  cy /= n;
  let rad = 0;
  const rel: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2] - cx;
    const y = pts[i * 2 + 1] - cy;
    rel.push(x, y);
    rad = Math.max(rad, Math.hypot(x, y));
  }
  list.push({
    pts: rel,
    kind,
    rx: cx,
    ry: cy,
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    rot: 0,
    spin: 0,
    rad,
    delay: 0,
    loose: false,
    rest: false,
    sx: cx,
    sy: cy,
    sz: 0,
    sr: 0,
    tone: seed() * 0.16 - 0.08,
  });
}

function inOpening(x: number, y: number) {
  if (Math.abs(x) < GATE_HW + 10 && y > -GATE_SIDE) return true;
  return y <= -GATE_SIDE && Math.hypot(x, y + GATE_SIDE) < GATE_HW + 14;
}

function buildPieces(): Piece[] {
  const rnd = mulberry(11);
  const list: Piece[] = [];
  // stone courses around the gate that will be thrown out
  const CH = 30;
  const BW = 56;
  for (let r = 0; r < 12; r++) {
    const y1 = -r * CH;
    const y0 = y1 - CH;
    const off = (r % 2) * BW * 0.5;
    for (let x = -252 - off; x < 252; x += BW) {
      const x0 = x;
      const x1 = x + BW;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const e = (mx / 190) ** 2 + ((my + 150) / 215) ** 2;
      if (e > 1) continue;
      // blocks sitting in the opening are skipped; ones overlapping the frame stay and sit under it
      if (inOpening(mx, my)) continue;
      addPiece(list, rectPts(x0 + 1, y0 + 1, x1 - 1, y1 - 1), 0, rnd);
    }
  }
  // jambs
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 6; i++) {
      const y1 = -i * (GATE_SIDE / 6);
      const y0 = y1 - GATE_SIDE / 6;
      const xa = side * GATE_HW;
      const xb = side * (GATE_HW + 27);
      addPiece(list, rectPts(Math.min(xa, xb) + 0.5, y0 + 0.5, Math.max(xa, xb) - 0.5, y1 - 0.5), 0, rnd);
    }
  }
  // arch stones, keystone a touch bigger
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI + (i / N) * Math.PI + 0.01;
    const a1 = Math.PI + ((i + 1) / N) * Math.PI - 0.01;
    const out = i === 4 ? ARCH_OUT + 12 : ARCH_OUT;
    const am = (a0 + a1) / 2;
    const pts = [
      Math.cos(a0) * GATE_HW,
      -GATE_SIDE + Math.sin(a0) * GATE_HW,
      Math.cos(a0) * out,
      -GATE_SIDE + Math.sin(a0) * out,
      Math.cos(am) * (out + 1),
      -GATE_SIDE + Math.sin(am) * (out + 1),
      Math.cos(a1) * out,
      -GATE_SIDE + Math.sin(a1) * out,
      Math.cos(a1) * GATE_HW,
      -GATE_SIDE + Math.sin(a1) * GATE_HW,
    ];
    addPiece(list, pts, 0, rnd);
  }
  // door: four planks whose tops follow the arch
  const top = (x: number) => -GATE_SIDE - Math.sqrt(Math.max(0, GATE_HW * GATE_HW - x * x));
  for (let i = 0; i < 4; i++) {
    const x0 = -GATE_HW + i * ((GATE_HW * 2) / 4);
    const x1 = x0 + (GATE_HW * 2) / 4;
    const pts = [x0 + 0.5, 0, x1 - 0.5, 0];
    for (let k = 0; k <= 4; k++) {
      const x = lerp(x1 - 0.5, x0 + 0.5, k / 4);
      pts.push(x, top(x) + 0.5);
    }
    addPiece(list, pts, 1, rnd);
  }
  return list;
}

function piecePath(c: C, p: Piece) {
  const pts = p.pts;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => clamp(Math.round(v * (1 + k)), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawPiece(c: C, s: State, p: Piece) {
  const u = s.u;
  const sc = u * (1 + p.z * 0.4);
  c.save();
  c.translate((s.gateX + p.x) * u, s.gy + p.y * u);
  c.rotate(p.rot);
  c.scale(sc, sc);
  const cols = p.kind === 1 ? WOOD : STONE;
  // bevel: light rim toward the sky, dark rim away, face on top
  const lx = -Math.cos(p.rot) - Math.sin(p.rot);
  const ly = Math.sin(p.rot) - Math.cos(p.rot);
  const dim = p.z < 0 ? p.z * 0.6 : 0;
  c.translate(lx * 1.3, ly * 1.3);
  piecePath(c, p);
  c.fillStyle = shadeHex(cols[3], p.tone + dim);
  c.fill();
  c.translate(-lx * 2.8, -ly * 2.8);
  piecePath(c, p);
  c.fillStyle = shadeHex(cols[0], p.tone + dim);
  c.fill();
  c.translate(lx * 1.5, ly * 1.5);
  c.scale(0.9, 0.9);
  piecePath(c, p);
  c.fillStyle = shadeHex(cols[1], p.tone + dim);
  c.fill();
  c.scale(1 / 0.9, 1 / 0.9);
  piecePath(c, p);
  c.strokeStyle = 'rgba(30,24,16,0.75)';
  c.lineWidth = 1.2;
  c.stroke();
  if (p.kind === 1) {
    // iron bands and rivets across the plank
    c.fillStyle = '#1c1a18';
    for (const by of [-40, -100, -160]) {
      const yy = by - p.ry;
      if (yy < -p.rad || yy > p.rad) continue;
      c.fillRect(-22, yy - 4, 44, 8);
      c.fillStyle = '#6e6a62';
      c.fillRect(-18, yy - 1.5, 3, 3);
      c.fillRect(12, yy - 1.5, 3, 3);
      c.fillStyle = '#1c1a18';
    }
    c.strokeStyle = 'rgba(20,12,6,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-6, -p.rad * 0.8);
    c.lineTo(-5, p.rad * 0.8);
    c.moveTo(7, -p.rad * 0.6);
    c.lineTo(8, p.rad * 0.7);
    c.stroke();
  } else {
    // a chip of lighter stone on the top face
    c.fillStyle = 'rgba(255,248,230,0.18)';
    c.fillRect(p.pts[0] * 0.8, p.pts[1] * 0.8, Math.abs(p.pts[0]) * 0.9, 2);
  }
  c.restore();
}

/* ---------- cannons ---------- */

const CANNON_X = [-190, -20, 150];

function drawCannon(c: C, s: State, k: Cannon) {
  const u = s.u;
  const sc = u * (1 + k.z * 0.4);
  c.save();
  c.translate((s.gateX + k.x) * u, s.gy + k.y * u);
  c.rotate(k.rot);
  c.scale(sc, sc);
  // carriage
  c.fillStyle = '#3d2a18';
  c.beginPath();
  c.moveTo(-14, -2);
  c.lineTo(18, -2);
  c.lineTo(22, -12);
  c.lineTo(-10, -14);
  c.closePath();
  c.fill();
  c.fillStyle = '#6a4a2a';
  c.fillRect(-12, -14, 30, 2.5);
  // barrel pointing out over the wall
  c.fillStyle = '#17181b';
  c.beginPath();
  c.moveTo(-40, -21);
  c.lineTo(10, -23);
  c.quadraticCurveTo(18, -18, 10, -12);
  c.lineTo(-40, -15);
  c.closePath();
  c.fill();
  c.fillStyle = '#56585e';
  c.fillRect(-38, -21.5, 44, 1.8);
  c.fillStyle = '#0b0b0d';
  c.fillRect(-43, -22, 4, 8);
  // wheels
  for (const wx of [-6, 12]) {
    c.fillStyle = '#26190d';
    c.beginPath();
    c.arc(wx, -2, 6, 0, TAU);
    c.fill();
    c.strokeStyle = '#7d5a34';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(wx, -2, 4, 0, TAU);
    c.stroke();
  }
  c.restore();
}

/* ---------- baked backdrop ---------- */

function paintBg(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const u = s.u;
  const gy = s.gy;
  const gx = s.gateX * u;
  const rnd = mulberry(7);
  const horizon = gy - 70 * u;
  // late afternoon sky, the sun low behind the titan
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#46546d');
  sky.addColorStop(0.45, '#9b8a86');
  sky.addColorStop(0.8, '#e2b484');
  sky.addColorStop(1, '#f6d3a0');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const sx = w * 0.12;
  const sy = horizon - 40 * u;
  const sun = c.createRadialGradient(sx, sy, 0, sx, sy, 420 * u);
  sun.addColorStop(0, 'rgba(255,244,210,0.95)');
  sun.addColorStop(0.08, 'rgba(255,220,160,0.7)');
  sun.addColorStop(0.35, 'rgba(250,170,110,0.25)');
  sun.addColorStop(1, 'rgba(240,140,90,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, w, h);
  // long cloud bands
  for (let i = 0; i < 7; i++) {
    const cy = (30 + rnd() * 220) * u;
    const cx = rnd() * w;
    const cw = (160 + rnd() * 300) * u;
    c.fillStyle = `rgba(${i % 2 ? '255,214,170' : '120,110,130'},${(0.16 + rnd() * 0.14).toFixed(3)})`;
    c.beginPath();
    c.ellipse(cx, cy, cw, (6 + rnd() * 8) * u, 0, 0, TAU);
    c.fill();
  }
  // far hills
  c.fillStyle = '#8c8494';
  c.beginPath();
  c.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 20 * u) c.lineTo(x, horizon - (18 + Math.sin(x / (90 * u)) * 12 + Math.sin(x / (37 * u)) * 5) * u);
  c.lineTo(w, horizon);
  c.closePath();
  c.fill();
  // the wall curving away behind the district, a thin band to the left horizon
  const wallL = gx - 250 * u;
  const top = gy - WALL_H * u;
  const farX = wallL - 420 * u;
  const farTop = horizon - 46 * u;
  const haze = c.createLinearGradient(wallL, 0, farX, 0);
  haze.addColorStop(0, '#8e8479');
  haze.addColorStop(1, '#c7a88f');
  c.fillStyle = haze;
  c.beginPath();
  c.moveTo(wallL, top);
  c.lineTo(farX, farTop);
  c.lineTo(-10, farTop + 8 * u);
  c.lineTo(-10, horizon + 2 * u);
  c.lineTo(farX, horizon + 2 * u);
  c.lineTo(wallL, gy);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(60,50,45,0.22)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    c.moveTo(wallL, lerp(top, gy, k));
    c.lineTo(farX, lerp(farTop, horizon + 2 * u, k));
  }
  c.stroke();
  // sunlit top edge running away
  c.strokeStyle = 'rgba(255,226,180,0.7)';
  c.lineWidth = 2 * u;
  c.beginPath();
  c.moveTo(wallL, top - 8 * u);
  c.lineTo(farX, farTop - 2 * u);
  c.lineTo(-10, farTop + 7 * u);
  c.stroke();
  // field and a dirt road into the gate
  const gnd = c.createLinearGradient(0, horizon, 0, h);
  gnd.addColorStop(0, '#8d8a5a');
  gnd.addColorStop(0.35, '#6b6a3e');
  gnd.addColorStop(1, '#383620');
  c.fillStyle = gnd;
  c.fillRect(0, horizon, w, h - horizon);
  c.fillStyle = 'rgba(170,140,100,0.55)';
  c.beginPath();
  c.moveTo(gx - 90 * u, gy);
  c.lineTo(gx + 90 * u, gy);
  c.lineTo(w * 0.5, h);
  c.lineTo(-w * 0.3, h);
  c.closePath();
  c.fill();
  // grass tufts
  c.strokeStyle = 'rgba(60,64,30,0.6)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w;
    const y = horizon + 10 * u + rnd() * (h - horizon);
    const l = (2 + rnd() * 5) * u * (0.5 + (y - horizon) / (h - horizon));
    c.moveTo(x, y);
    c.lineTo(x + l * 0.3, y - l);
  }
  c.stroke();

  // the wall face: pale stone, courses, weathering
  const face = c.createLinearGradient(wallL, 0, w, 0);
  face.addColorStop(0, '#b3aa99');
  face.addColorStop(0.5, '#a29987');
  face.addColorStop(1, '#8b8272');
  c.fillStyle = face;
  c.fillRect(wallL, top, w - wallL + 10, gy - top);
  const shade = c.createLinearGradient(0, top, 0, gy);
  shade.addColorStop(0, 'rgba(255,230,190,0.18)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(30,20,10,0.35)');
  c.fillStyle = shade;
  c.fillRect(wallL, top, w - wallL + 10, gy - top);
  // the same bevelled blocks as the live gate stones, so the breakable patch is invisible
  c.save();
  c.beginPath();
  c.rect(wallL, top, w - wallL + 10, gy - top);
  c.clip();
  for (let r = 0; r * 30 < WALL_H; r++) {
    const y1 = -r * 30;
    const off = (r % 2) * 28;
    for (let x = -252 - off - 56 * 6; gx + x * u < w + 60 * u; x += 56) {
      if (gx + (x + 56) * u < wallL) continue;
      const tn = rnd() * 0.16 - 0.08;
      const X = gx + x * u;
      const Y = gy + (y1 - 30) * u;
      c.fillStyle = shadeHex(STONE[3], tn);
      c.fillRect(X + 1.2 * u, Y + 1.2 * u, 54 * u, 28 * u);
      c.fillStyle = shadeHex(STONE[0], tn);
      c.fillRect(X + 2.6 * u, Y + 2.6 * u, 54 * u, 28 * u);
      c.fillStyle = shadeHex(STONE[1], tn);
      c.fillRect(X + 3.4 * u, Y + 3.2 * u, 50 * u, 24.4 * u);
      c.strokeStyle = 'rgba(30,24,16,0.75)';
      c.lineWidth = 1.2 * u;
      c.strokeRect(X + 1 * u, Y + 1 * u, 54 * u, 28 * u);
    }
  }
  c.restore();
  for (let i = 0; i < 26; i++) {
    const x = wallL + rnd() * (w - wallL);
    const y0 = top + rnd() * 60 * u;
    c.fillStyle = `rgba(70,60,50,${(0.05 + rnd() * 0.08).toFixed(3)})`;
    c.fillRect(x, y0, (3 + rnd() * 10) * u, (80 + rnd() * 220) * u);
  }
  // parapet lip with a lit top
  c.fillStyle = '#7c7364';
  c.fillRect(wallL - 4 * u, top - 10 * u, w - wallL + 20, 12 * u);
  c.fillStyle = '#e6d6b8';
  c.fillRect(wallL - 4 * u, top - 10 * u, w - wallL + 20, 2.5 * u);
  c.fillStyle = 'rgba(40,30,20,0.3)';
  c.fillRect(wallL, top + 2 * u, w - wallL + 10, 6 * u);
  // near edge of the face, lit by the sun
  c.fillStyle = '#e8d8b8';
  c.fillRect(wallL - 1, top - 8 * u, 3 * u, gy - top + 8 * u);
  // ground occlusion along the base
  const occ = c.createLinearGradient(0, gy - 20 * u, 0, gy + 30 * u);
  occ.addColorStop(0, 'rgba(20,16,10,0)');
  occ.addColorStop(0.5, 'rgba(20,16,10,0.35)');
  occ.addColorStop(1, 'rgba(20,16,10,0)');
  c.fillStyle = occ;
  c.fillRect(wallL, gy - 20 * u, w - wallL + 10, 50 * u);

  // the breach behind the gate pieces: tunnel dark with the town lit beyond
  c.save();
  c.beginPath();
  for (const p of s.pieces) {
    const pts = p.pts;
    const ox = gx + p.rx * u;
    const oy = gy + p.ry * u;
    const g = 1.08;
    c.moveTo(ox + pts[0] * u * g, oy + pts[1] * u * g);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(ox + pts[i] * u * g, oy + pts[i + 1] * u * g);
    c.closePath();
  }
  c.clip('nonzero');
  const hole = c.createRadialGradient(gx, gy - 110 * u, 20 * u, gx, gy - 130 * u, 260 * u);
  hole.addColorStop(0, '#2e2923');
  hole.addColorStop(0.6, '#1a1612');
  hole.addColorStop(1, '#0c0a08');
  c.fillStyle = hole;
  c.fillRect(gx - 300 * u, gy - 420 * u, 600 * u, 440 * u);
  // far mouth of the tunnel: the district in warm light
  const mx = gx + 6 * u;
  const mw = 70 * u;
  const mh = 110 * u;
  const town = c.createLinearGradient(0, gy - mh, 0, gy);
  town.addColorStop(0, '#f7dca6');
  town.addColorStop(1, '#d8a26a');
  c.fillStyle = town;
  c.beginPath();
  c.moveTo(mx - mw / 2, gy - 4 * u);
  c.lineTo(mx - mw / 2, gy - mh + mw / 2);
  c.arc(mx, gy - mh + mw / 2, mw / 2, Math.PI, 0);
  c.lineTo(mx + mw / 2, gy - 4 * u);
  c.closePath();
  c.fill();
  c.fillStyle = '#7a5a44';
  c.beginPath();
  c.moveTo(mx - mw / 2, gy - 4 * u);
  for (let i = 0; i <= 6; i++) {
    const x = mx - mw / 2 + (i / 6) * mw;
    const roof = gy - (26 + ((i * 37) % 22)) * u;
    c.lineTo(x, roof + 8 * u);
    c.lineTo(x + mw / 12, roof);
  }
  c.lineTo(mx + mw / 2, gy - 4 * u);
  c.closePath();
  c.fill();
  // tunnel walls converging on the mouth
  c.strokeStyle = 'rgba(80,70,58,0.5)';
  c.lineWidth = 1.2 * u;
  c.beginPath();
  for (const k of [-1, 1]) {
    c.moveTo(gx + k * GATE_HW * u, gy);
    c.lineTo(mx + (k * mw) / 2, gy - 4 * u);
    c.moveTo(gx + k * GATE_HW * u, gy - GATE_SIDE * u);
    c.lineTo(mx + (k * mw) / 2, gy - mh + mw / 2);
  }
  c.stroke();
  // rubble lip and ragged inner edges read as broken stone
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(gx - 300 * u, gy - 12 * u, 600 * u, 14 * u);
  c.restore();
}

function drawDust(c: C, s: State, parity: number, alpha: number) {
  const u = s.u;
  const items = s.parts.items;
  for (let i = parity; i < items.length; i += 2) {
    const p = items[i];
    if (p.life <= 0 || p.kind !== DUST) continue;
    const k = p.life / p.max;
    const r = p.size * (1 + (1 - k) * 1.6) * u;
    c.globalAlpha = Math.min(1, k * 1.8) * alpha;
    c.drawImage(s.dust, p.x * u - r, s.gy + p.y * u - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;
}

/* ---------- actions ---------- */

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.touched = true;
  s.idle = 0;
  if (s.phase !== 0) return;
  const bus = env.audio();
  if (bus) {
    stopHum(s.hum);
    s.hum = startHum(bus, { type: 'sawtooth', freq: 38, cutoff: 260, noiseAmt: 0.5 });
  }
  env.wake(800);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  if (s.phase === 0 && s.charge > 0) launch(s, env, true);
  env.wake(6500);
}

function launch(s: State, env: SceneEnv, sound: boolean) {
  if (s.phase !== 0) return;
  s.phase = 1;
  s.pt = 0;
  s.power = 0.35 + 0.65 * s.charge;
  s.vel = 420 + s.power * 380;
  s.autoHold = false;
  const bus = sound ? env.audio() : null;
  if (bus) {
    // a low roar as he breaks into the sprint
    tone(bus, 120, { type: 'sawtooth', attack: 0.06, decay: 0.9, gain: 0.09, glideTo: 62 });
    tone(bus, 90, { type: 'square', attack: 0.08, decay: 0.8, gain: 0.05, glideTo: 50 });
    noise(bus, { duration: 0.7, gain: 0.12, freq: 420, q: 0.7 });
  }
}

function impact(s: State, env: SceneEnv) {
  const P = s.power;
  s.phase = 2;
  s.pt = 0;
  s.broken = true;
  s.breach = 0;
  s.flash = 0.7 + P * 0.3;
  s.ring = 1;
  if (!env.reducedMotion) {
    s.stop = 0.1 + P * 0.06;
    s.shake = 1;
  }
  // impact point: the titan's leading shoulder
  const ix = -40;
  const iy = -150;
  for (const p of s.pieces) {
    const dx = p.rx - ix;
    const dy = p.ry - iy;
    const d = Math.hypot(dx, dy) || 1;
    const near = clamp(1 - d / 320, 0, 1);
    p.loose = true;
    p.rest = false;
    p.delay = near > 0.45 ? 0 : (1 - near) * 0.45 * rand(0.6, 1.3);
    const sp = (200 + 560 * P) * (0.25 + near * 0.9) * rand(0.7, 1.15);
    p.vx = (dx / d) * sp + rand(-60, 60);
    p.vy = (dy / d) * sp * 0.8 - rand(120, 360) * (0.4 + near);
    p.vz = p.kind === 1 ? rand(-1.2, -0.4) : rand(0.1, 1.6) * near * P;
    p.spin = rand(-7, 7) * (0.3 + near);
    if (p.kind === 1) {
      // the door buckles inward and drops
      p.vx = dx * 1.5 + 160 * P;
      p.vy = -rand(60, 200);
    }
  }
  for (const k of s.cannons) {
    k.delay = 0.12 + Math.abs(k.rx + 20) / 500 + rand(0, 0.25);
    k.state = 0;
  }
  // stone chips and a dust burst around the shoulder
  const gx = s.gateX;
  for (let i = 0; i < 80 + P * 60; i++) {
    const a = rand(-Math.PI, Math.PI);
    const v = rand(200, 1100) * (0.4 + P);
    emit(s.parts, gx + ix + rand(-40, 40), iy + rand(-60, 60), Math.cos(a) * v, Math.sin(a) * v - 200, rand(0.7, 1.5), rand(2, 6), CHIP, 0.4, 1500);
  }
  for (let i = 0; i < 16; i++) {
    const a = rand(-Math.PI, 0.3);
    const v = rand(60, 320);
    emit(s.parts, gx + ix + rand(-60, 80), iy + rand(-40, 120), Math.cos(a) * v, Math.sin(a) * v * 0.6, rand(1.6, 3), rand(40, 80), DUST, 1.2, -12);
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 1.4, gain: 0.7, freq: 170, q: 0.5, type: 'lowpass' });
    noise(bus, { duration: 0.5, gain: 0.35, freq: 1500, q: 0.6 });
    noise(bus, { duration: 0.25, gain: 0.25, freq: 3200, q: 0.4, type: 'highpass' });
    tone(bus, 64, { type: 'square', attack: 0.004, decay: 0.9, gain: 0.16, glideTo: 26 });
    tone(bus, 42, { type: 'sine', attack: 0.004, decay: 1.4, gain: 0.35, glideTo: 24 });
  }
}

function footfall(s: State, env: SceneEnv, fx: number) {
  const k = s.run;
  if (k < 0.2) return;
  if (!env.reducedMotion) s.shake = Math.min(1, s.shake + 0.18 + k * 0.28);
  for (let i = 0; i < 6 + k * 8; i++) {
    const a = rand(-Math.PI, 0);
    emit(s.parts, fx + rand(-20, 20), rand(-6, 0), Math.cos(a) * rand(40, 160) - 80, Math.sin(a) * rand(20, 90), rand(0.8, 1.6), rand(14, 30) * (0.6 + k * 0.6), DUST, 1.4, -10);
  }
  for (let i = 0; i < 4; i++) emit(s.parts, fx, -4, rand(-160, 40), rand(-340, -120), rand(0.4, 0.8), rand(2, 4), CHIP, 0.3, 1500);
  const bus = env.audio();
  if (bus && s.thudCD <= 0) {
    s.thudCD = 0.08;
    tone(bus, 58, { type: 'sine', attack: 0.004, decay: 0.35, gain: 0.18 + k * 0.2, glideTo: 32 });
    noise(bus, { duration: 0.18, gain: 0.1 + k * 0.1, freq: 240, q: 0.6, type: 'lowpass' });
  }
}

function startRebuild(s: State) {
  s.phase = 4;
  s.pt = 0;
  for (const p of s.pieces) {
    p.sx = p.x;
    p.sy = p.y;
    p.sz = p.z;
    p.sr = p.rot;
    // bottom courses set first, the arch and keystone last
    p.delay = clamp(-p.ry / 360, 0, 1) * 0.9 + rand(0, 0.12);
  }
  for (const k of s.cannons) {
    k.sx = k.x;
    k.sy = k.y;
    k.sr = k.rot;
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.97,
    init: () => ({
      phase: 0,
      pt: 0,
      x: 0,
      home: 0,
      gateX: 0,
      charge: 0,
      power: 0,
      vel: 0,
      held: false,
      autoHold: false,
      touched: false,
      idle: 0,
      autoT: 0.1,
      phi: 0,
      run: 0,
      lean: 0.12,
      crouch: 0,
      tuck: 0,
      lastCos: [1, -1],
      steamAcc: 0,
      pieces: buildPieces(),
      cannons: CANNON_X.map((rx) => ({ rx, x: rx, y: -WALL_H - 10, vx: 0, vy: 0, z: 0, rot: 0, spin: 0, delay: 0, state: 0, sx: rx, sy: -WALL_H - 10, sr: 0 })),
      broken: false,
      breach: 0,
      parts: makePool(MAX_PARTS),
      shake: 0,
      stop: 0,
      flash: 0,
      ring: 0,
      thudCD: 0,
      clackCD: 0,
      hum: null,
      u: 1,
      gy: 0,
      bg: null,
      soft: glowSprite(64, [
        [0, 'rgba(255,255,255,0.9)'],
        [0.5, 'rgba(250,248,244,0.45)'],
        [1, 'rgba(240,236,230,0)'],
      ]),
      dust: glowSprite(64, [
        [0, 'rgba(176,154,120,0.85)'],
        [0.55, 'rgba(150,128,98,0.45)'],
        [1, 'rgba(130,110,84,0)'],
      ]),
      warm: glowSprite(96, [
        [0, 'rgba(255,240,200,1)'],
        [0.25, 'rgba(255,190,120,0.55)'],
        [1, 'rgba(255,140,60,0)'],
      ]),
      eye: glowSprite(32, [
        [0, 'rgba(255,255,255,1)'],
        [0.4, 'rgba(255,250,230,0.4)'],
        [1, 'rgba(255,240,200,0)'],
      ]),
      vignette: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const first = s.home === 0;
      s.u = Math.min(w / 900, h / 560);
      s.gy = h * 0.88;
      s.home = (w * 0.13) / s.u;
      s.gateX = (w * 0.74) / s.u;
      if (first) s.x = s.home;
      else s.x = Math.min(s.x, s.gateX - 40);
      paintBg(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10,6,4,0.55)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const rm = env.reducedMotion;
      stepPool(s.parts, dt);
      s.flash = Math.max(0, s.flash - dt * 2.6);
      s.shake = Math.max(0, s.shake - dt * 2.4);
      s.ring = Math.max(0, s.ring - dt * 0.9);
      s.thudCD -= dt;
      s.clackCD -= dt;
      if (s.stop > 0) {
        s.stop -= dt;
        return;
      }
      s.pt += dt;
      const impactX = s.gateX - 58;
      const launchX = impactX - 150;

      // autopilot for the tile and idle viewers
      s.idle = s.held ? 0 : s.idle + dt;
      const auto = !env.interactive || !s.touched || s.idle > 7;
      if (!auto) s.autoHold = false;
      if (auto && s.phase === 0 && !s.held) {
        s.autoT -= dt;
        if (s.autoT <= 0) s.autoHold = true;
        if (s.autoHold && s.charge >= 0.8) {
          launch(s, env, false);
          s.autoT = rand(1.2, 2);
        }
      }

      if (s.phase === 0) {
        const charging = s.held || s.autoHold;
        if (charging) {
          s.charge = Math.min(1, s.charge + dt / 1.5);
          s.x += (22 + 130 * s.charge) * dt;
          s.run = damp(s.run, 0.3 + 0.7 * s.charge, 6, dt);
          s.phi += dt * (3.5 + s.charge * 7.5);
          s.lean = damp(s.lean, 0.3 + s.charge * 0.35, 5, dt);
          s.crouch = damp(s.crouch, 0.4 + s.charge * 0.3, 6, dt);
          if (s.held && rm) env.wake(300);
          if (s.x >= launchX) {
            s.x = launchX;
            launch(s, env, s.held);
            if (s.held) s.held = false;
          }
        } else {
          s.charge = Math.max(0, s.charge - dt * 1.5);
          s.run = damp(s.run, 0, 6, dt);
          s.lean = damp(s.lean, 0.12, 4, dt);
          s.crouch = damp(s.crouch, 0, 4, dt);
          // settle the stride so both feet land
          const target = Math.round(s.phi / Math.PI) * Math.PI;
          s.phi = damp(s.phi, target, 6, dt);
        }
        s.tuck = damp(s.tuck, 0, 6, dt);
      } else if (s.phase === 1) {
        s.x += s.vel * dt;
        s.run = damp(s.run, 1, 10, dt);
        s.phi += dt * 15;
        s.lean = damp(s.lean, 0.78, 8, dt);
        s.crouch = damp(s.crouch, 0.5, 8, dt);
        const near = clamp(1 - (impactX - s.x) / 90, 0, 1);
        s.tuck = Math.max(s.tuck, easeOutCubic(near));
        if (s.x >= impactX) {
          s.x = impactX;
          impact(s, env);
        }
      } else if (s.phase === 2) {
        const k = Math.min(1, s.pt / 0.6);
        s.x = impactX + easeOutCubic(k) * 34;
        s.run = damp(s.run, 0.25, 6, dt);
        s.phi += dt * 4 * (1 - k);
        s.lean = damp(s.lean, 0.45, 4, dt);
        s.crouch = damp(s.crouch, 0.35, 4, dt);
        s.tuck = damp(s.tuck, 0.2, 3, dt);
        if (k >= 1) {
          s.phase = 3;
          s.pt = 0;
        }
      } else if (s.phase === 3) {
        s.run = damp(s.run, 0, 4, dt);
        s.lean = damp(s.lean, 0.2 + Math.sin(s.pt * 2) * 0.03, 3, dt);
        s.crouch = damp(s.crouch, 0.1, 3, dt);
        s.tuck = damp(s.tuck, 0, 3, dt);
        s.phi = damp(s.phi, Math.round(s.phi / Math.PI) * Math.PI, 4, dt);
        if (s.pt > 2.4) startRebuild(s);
      } else if (s.phase === 4) {
        const k = Math.min(1, s.pt / 1.8);
        const from = impactX + 34;
        s.x = lerp(from, s.home, easeInOutCubic(k));
        s.run = damp(s.run, k < 0.9 ? 0.45 : 0, 5, dt);
        s.phi -= dt * 7 * (k < 0.92 ? 1 : 0);
        s.lean = damp(s.lean, 0.05, 4, dt);
        s.crouch = damp(s.crouch, 0.15, 4, dt);
        let done = k >= 1;
        for (const p of s.pieces) {
          const q = clamp((s.pt - p.delay) / 0.55, 0, 1);
          const e = easeInOutCubic(q);
          p.x = lerp(p.sx, p.rx, e);
          p.y = lerp(p.sy, p.ry, e) - Math.sin(q * Math.PI) * 40;
          p.z = lerp(p.sz, 0, e);
          p.rot = lerp(p.sr, 0, e);
          if (q < 1) done = false;
        }
        for (const c of s.cannons) {
          const q = clamp((s.pt - 1.1) / 0.6, 0, 1);
          const e = easeInOutCubic(q);
          c.x = lerp(c.sx, c.rx, e);
          c.y = lerp(c.sy, -WALL_H - 10, e);
          c.rot = lerp(c.sr, 0, e);
          c.z = lerp(c.z, 0, e);
          if (q < 1) done = false;
        }
        if (done) {
          s.phase = 0;
          s.pt = 0;
          s.x = s.home;
          s.broken = false;
          s.charge = 0;
          for (const p of s.pieces) {
            p.loose = false;
            p.x = p.rx;
            p.y = p.ry;
            p.z = 0;
            p.rot = 0;
          }
          for (const c of s.cannons) c.state = 0;
          const bus = env.audio();
          if (bus) tone(bus, 180, { type: 'triangle', attack: 0.02, decay: 0.4, gain: 0.05, glideTo: 260 });
        }
      }
      solve(s);

      // footfalls: a foot lands when its cycle crosses into stance
      for (let leg = 0; leg < 2; leg++) {
        const cs = Math.cos(s.phi + leg * Math.PI);
        if (s.lastCos[leg] < 0 && cs >= 0 && (s.phase <= 1 || s.phase === 4)) footfall(s, env, s.x + J[leg === 0 ? 20 : 24] * TS);
        s.lastCos[leg] = cs;
      }

      // steam off the joints, more with the charge and after the hit
      const heat = s.phase === 0 ? s.charge : s.phase === 1 ? 1 : s.phase <= 3 ? 0.8 : 0.2;
      s.steamAcc += dt * (4 + heat * 36);
      while (s.steamAcc > 1) {
        s.steamAcc -= 1;
        const pick = Math.floor(Math.random() * 5);
        const jx = [J[4], J[6], J[2], J[18], J[8]][pick];
        const jy = [J[5], J[7], J[3], J[19], J[9]][pick];
        emit(s.parts, s.x + jx * TS + rand(-10, 10), jy * TS + rand(-10, 10), rand(-40, 20) - (s.phase === 1 ? 160 : 0), rand(-90, -40), rand(0.9, 1.8), rand(10, 20), STEAM, 0.8, -30);
      }

      // wall pieces fly, bounce, and settle as rubble
      if (s.broken && s.phase !== 4) {
        s.breach = Math.min(1, s.breach + dt * 1.5);
        for (const p of s.pieces) {
          if (!p.loose || p.rest) continue;
          if (p.delay > 0) {
            p.delay -= dt;
            if (p.delay <= 0) {
              // outer stones crumble: a shove and a drop
              p.vx *= 0.5;
              p.vy = Math.max(p.vy * 0.4, -120);
            }
            continue;
          }
          p.vy += 1700 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z = clamp(p.z + p.vz * dt, -0.7, 1.4);
          p.rot += p.spin * dt;
          const ground = p.z * 46 - p.rad * 0.5 * (1 + p.z * 0.4);
          if (p.y > ground && p.vy > 0) {
            p.y = ground;
            const hard = p.vy;
            p.vy *= -0.28;
            p.vx *= 0.55;
            p.spin *= 0.5;
            p.vz *= 0.3;
            if (hard > 300) {
              emit(s.parts, s.gateX + p.x, p.y + 4, rand(-60, 60), -rand(20, 60), rand(1, 1.8), rand(18, 34), DUST, 1.5, -8);
              const bus = env.audio();
              if (bus && s.clackCD <= 0) {
                s.clackCD = 0.05;
                noise(bus, { duration: 0.12, gain: 0.08, freq: rand(500, 1100), q: 1.2 });
              }
            }
            if (Math.abs(p.vy) < 60) {
              p.rest = true;
              p.vy = 0;
            }
          }
        }
        for (const k of s.cannons) {
          if (k.state === 2) continue;
          if (k.state === 0) {
            k.delay -= dt;
            if (k.delay <= 0) {
              k.state = 1;
              k.vx = rand(-70, 70);
              k.vy = -rand(80, 180);
              k.spin = rand(-4, 4);
            }
            continue;
          }
          k.vy += 1500 * dt;
          k.x += k.vx * dt;
          k.y += k.vy * dt;
          k.z = Math.min(0.8, k.z + dt * 0.5);
          k.rot += k.spin * dt;
          const ground = k.z * 46;
          if (k.y > ground) {
            k.y = ground;
            k.state = 2;
            k.rot = Math.round(k.rot / Math.PI) * Math.PI + rand(-0.3, 0.3);
            for (let i = 0; i < 12; i++)
              emit(s.parts, s.gateX + k.x + rand(-20, 20), ground, rand(-120, 120), -rand(30, 100), rand(1.2, 2.2), rand(20, 40), DUST, 1.4, -10);
            if (!rm) s.shake = Math.min(1, s.shake + 0.3);
            const bus = env.audio();
            if (bus) {
              tone(bus, 90, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.14, glideTo: 50 });
              noise(bus, { duration: 0.2, gain: 0.12, freq: 900, q: 1.4 });
            }
          }
        }
        // a slow dust cloud rolls out of the breach
        if (s.phase === 2 && Math.random() < 0.9) {
          emit(s.parts, s.gateX + rand(-120, 120), -rand(0, 200), rand(-80, 80), rand(-30, 10), rand(2, 3.4), rand(40, 80), DUST, 0.8, -6);
        }
      }

      // engine noise of the charge: rumble climbs with it
      if (s.hum) {
        const lvl = s.phase === 0 ? 0.04 + s.charge * 0.12 : s.phase === 1 ? 0.18 : 0;
        setHum(s.hum, 38 + s.charge * 26 + (s.phase === 1 ? 20 : 0), lvl, 220 + s.charge * 500);
        if (s.phase >= 2) {
          stopHum(s.hum);
          s.hum = null;
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      const gy = s.gy;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 16 * u + (s.phase === 0 ? s.charge * 1.4 * u : 0);
      ctx.save();
      // a constant 4% overscan keeps the frame edges covered while the camera shakes
      ctx.translate(w / 2, h / 2);
      ctx.scale(1.04, 1.04);
      ctx.translate(-w / 2 + shakeX(amp, t), -h / 2 + shakeY(amp, t));
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      const gx = s.gateX * u;

      // warm light spilling out of the breach
      if (s.broken) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.warm, gx, gy - 90 * u, 220 * u, 0.35 * s.breach);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // cannons on the parapet, and the pieces falling back into the tunnel
      for (const k of s.cannons) if (k.state === 0 || k.z < 0.2) drawCannon(ctx, s, k);
      for (const p of s.pieces) if (p.z <= 0.12) drawPiece(ctx, s, p);

      // most of the dust rolls behind him so he stays readable
      drawDust(ctx, s, 0, 0.75);

      // ground shadow under the titan
      const tx = s.x * u;
      ctx.fillStyle = 'rgba(30,22,10,0.35)';
      ctx.beginPath();
      ctx.ellipse(tx + 14 * u, gy + 2 * u, 110 * u, 12 * u, 0, 0, TAU);
      ctx.fill();

      // speed smear during the sprint
      if (s.phase === 1) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.translate(tx - 30 * u, gy);
        ctx.scale(u * TS, u * TS);
        titan(ctx, s, '#e8c890', t);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // rim light from the low sun behind him, then the titan
      ctx.save();
      ctx.translate(tx - 3.5 * u, gy - 2 * u);
      ctx.scale(u * TS, u * TS);
      titan(ctx, s, 'rgba(255,214,150,0.9)', t);
      ctx.restore();
      ctx.save();
      ctx.translate(tx, gy);
      ctx.scale(u * TS, u * TS);
      titan(ctx, s, null, t);
      ctx.restore();

      // steam on and around him
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== STEAM) continue;
        const k = p.life / p.max;
        const r = p.size * (1 + (1 - k) * 2) * u;
        ctx.globalAlpha = Math.min(1, k * 1.4) * 0.38;
        ctx.drawImage(s.soft, p.x * u - r, gy + p.y * u - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      // the stones thrown toward us and fallen cannons
      for (const k of s.cannons) if (k.state !== 0 && k.z >= 0.2) drawCannon(ctx, s, k);
      for (const p of s.pieces) if (p.z > 0.12) drawPiece(ctx, s, p);

      // a thin veil of dust in front, then flying chips
      drawDust(ctx, s, 1, 0.3);
      ctx.fillStyle = '#5d564b';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== CHIP) continue;
        ctx.save();
        ctx.translate(p.x * u, gy + p.y * u);
        ctx.rotate(p.rot);
        const r = p.size * u;
        ctx.fillStyle = '#5d564b';
        ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
        ctx.fillStyle = '#c9bfaa';
        ctx.fillRect(-r, -r * 0.7, r * 2, r * 0.45);
        ctx.restore();
      }

      // dust shock ring along the ground
      if (s.ring > 0) {
        const k = 1 - s.ring;
        const rr = (60 + easeOutCubic(k) * 520) * u;
        ctx.globalAlpha = s.ring * 0.55;
        ctx.strokeStyle = '#d8c6a4';
        ctx.lineWidth = (14 * s.ring + 2) * u;
        ctx.beginPath();
        ctx.ellipse(gx - 40 * u, gy, rr, rr * 0.12, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        glow(ctx, s.warm, gx - 20 * u, gy - 170 * u, 240 * u * (0.7 + s.flash * 0.5), s.flash * 0.55);
        ctx.fillStyle = `rgba(255,236,200,${(s.flash * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
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
      s.hum = null;
      freeCanvas(s.bg, s.soft, s.dust, s.warm, s.eye);
      s.bg = null;
    },
  });
