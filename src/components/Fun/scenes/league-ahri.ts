import { createCanvasScene, clamp, damp, easeOutBack, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, makePool, mulberry, shakeX, shakeY, stepPool } from './heroes-kit';
import type { Pool } from './heroes-kit';
import { bone, chain, dirX, dirY, ik, lantern, pagoda, peaks, petal, ribbon, taper } from './ionia-kit';
import {
  abilityKey,
  backdropLayer,
  drawAbilityBar,
  drawBackdrop,
  inked,
  snap,
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
  stepMover,
  turnScale,
} from './league-kit';
import type { AbilitySlot, Command, Gesture, Marker, Mover } from './league-kit';

/**
 * Ahri, the Nine-Tailed Fox: at twilight over a still Ionian pond ringed by spirit blossom
 * trees, Ahri hovers above the water with her nine cream tails fanned behind her, fox ears
 * up, black hair and wide sleeves drifting, her blue orb turning over one palm and three
 * fox-fires circling her. Little spirit wisps float in from the right.
 * Click or tap anywhere over the pond and she glides there; click a wisp to pelt it with
 * essence bolts. Orb of Deception (Q) flies out toward the pointer, stops, and comes back to her
 * hand, hitting on both passes. Fox-Fire (W) looses the three flames circling her at the nearest
 * wisps. Charm (E) blows a heart that turns a wisp's eyes to hearts and walks it toward her.
 * Spirit Rush (R) dashes toward the pointer, up to three times, throwing essence bolts at the
 * nearest wisps after every dash.
 */

interface AhriPose {
  ln: number;
  hd: number;
  sF: number;
  eF: number;
  sB: number;
  eB: number;
  /** feet relative to the hip line */
  fFx: number;
  fFy: number;
  fBx: number;
  fBy: number;
  /** how far the tails fan out */
  spread: number;
}

interface Wisp {
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  hp: number;
  flash: number;
  charm: number;
  alive: boolean;
  respawn: number;
  born: number;
  seed: number;
  hit: number;
}

interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: number;
  life: number;
  /** 0 essence bolt, 1 fox-fire */
  kind: number;
}

interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  m: Mover;
  g: Gesture;
  ac: AbortController | null;
  marker: Marker;
  chase: number;
  atkCd: number;
  buf: Command;
  bufX: number;
  bufY: number;
  bufT: number;
  // orb: 0 in hand, 1 out, 2 back
  orb: number;
  ot: number;
  ox: number;
  oy: number;
  oFromX: number;
  oFromY: number;
  oToX: number;
  oToY: number;
  oHit: number;
  heart: { x: number; y: number; vx: number; vy: number; life: number };
  charmCd: number;
  cast: number;
  castT: number;
  // spirit rush
  rushN: number;
  rushWin: number;
  rushCd: number;
  dashT: number;
  dashFromX: number;
  dashFromY: number;
  dashToX: number;
  dashToY: number;
  ghosts: Float32Array;
  /** orb path ring buffer: x, y pairs */
  otr: Float32Array;
  otrN: number;
  otrHead: number;
  rushMax: number;
  /** ability bar pop per slot */
  fl: Float32Array;
  ghostN: number;
  trail: number;
  fires: number;
  fireCd: number;
  wisps: Wisp[];
  bolts: Bolt[];
  pose: AhriPose;
  touched: boolean;
  idle: number;
  still: number;
  autoT: number;
  autoStep: number;
  stop: number;
  shake: number;
  flash: number;
  parts: Pool;
  petals: Float32Array;
  u: number;
  K: number;
  ground: number;
  bg: HTMLCanvasElement | null;
  pink: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  white: HTMLCanvasElement;
  violet: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  cyan: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

type C = CanvasRenderingContext2D;

const HOME_X = 0.25;
const HOME_Y = 0;
const WISPS = 5;
const ORB_OUT = 0.42;
const ORB_BACK = 0.5;
const ORB_RANGE = 400;
const DASH = 0.2;
const DASH_LEN = 240;
const SPEED = 300;
const ATK_RANGE = 330;
const PETALS = 24;
const GHOSTS = 3;
const ORB_TRAIL = 14;
const ACCEL = SPEED * 14;

const IDLE: AhriPose = { ln: 0.06, hd: 0.05, sF: 0.75, eF: 1.25, sB: -0.35, eB: 0.5, fFx: 22, fFy: 80, fBx: -6, fBy: 98, spread: 0.6 };
const THROWP: AhriPose = { ln: 0.2, hd: 0.08, sF: 1.55, eF: 0.05, sB: -0.9, eB: 0.4, fFx: 24, fFy: 82, fBx: -14, fBy: 94, spread: 0.85 };
const BLOW: AhriPose = { ln: -0.04, hd: -0.12, sF: 1.9, eF: 1.2, sB: -0.6, eB: 0.9, fFx: 20, fFy: 80, fBx: -6, fBy: 98, spread: 0.75 };
const DASHP: AhriPose = { ln: 0.5, hd: -0.1, sF: -0.5, eF: 0.3, sB: -0.9, eB: 0.2, fFx: -10, fFy: 88, fBx: -34, fBy: 70, spread: 0.2 };
const LANDP: AhriPose = { ln: 0.12, hd: 0.1, sF: 1.2, eF: 0.7, sB: -1.1, eB: 0.6, fFx: 26, fFy: 76, fBx: -12, fBy: 92, spread: 1 };
/** gliding: leaning into the flight, legs trailing, tails streaming */
const FLYP: AhriPose = { ln: 0.32, hd: -0.12, sF: 0.5, eF: 0.9, sB: -0.7, eB: 0.4, fFx: 4, fFy: 86, fBx: -24, fBy: 84, spread: 0.35 };
const ATKP: AhriPose = { ln: 0.12, hd: 0.06, sF: 1.75, eF: 0.15, sB: -0.5, eB: 0.6, fFx: 22, fFy: 82, fBx: -8, fBy: 96, spread: 0.7 };

/** Q W E R; cooldowns are filled in each frame */
const BAR: AbilitySlot[] = [
  { key: 'Q', cd: 0, max: 1, col: '110,180,255' },
  { key: 'W', cd: 0, max: 2.6, col: '160,120,255' },
  { key: 'E', cd: 0, max: 1.2, col: '255,110,180' },
  { key: 'R', cd: 0, max: 2.2, col: '255,180,220', pips: 3, pipMax: 3 },
];

const KEYS = Object.keys(IDLE) as (keyof AhriPose)[];
function mix(o: AhriPose, a: AhriPose, b: AhriPose, k: number) {
  for (const key of KEYS) o[key] = lerp(a[key], b[key], k);
}

/* ---------- the rig ---------- */

const R = {
  hx: 0, hy: 0, rot: 0, hdx: 0, hdy: 0,
  sFx: 0, sFy: 0, eFx: 0, eFy: 0, aFx: 0, aFy: 0,
  sBx: 0, sBy: 0, eBx: 0, eBy: 0, aBx: 0, aBy: 0,
  kFx: 0, kFy: 0, kBx: 0, kBy: 0, fFx: 0, fFy: 0, fBx: 0, fBy: 0,
};
const TMP: [number, number] = [0, 0];
function tl(x: number, y: number, out: [number, number]) {
  const cs = Math.cos(R.rot);
  const sn = Math.sin(R.rot);
  out[0] = R.hx + x * cs - y * sn;
  out[1] = R.hy + x * sn + y * cs;
  return out;
}

function rig(p: AhriPose) {
  R.hx = 0;
  R.hy = -100;
  R.rot = p.ln;
  tl(4, -72, TMP);
  R.hdx = TMP[0];
  R.hdy = TMP[1];
  tl(8, -46, TMP);
  R.sFx = TMP[0];
  R.sFy = TMP[1];
  tl(-6, -47, TMP);
  R.sBx = TMP[0];
  R.sBy = TMP[1];
  R.eFx = R.sFx + dirX(p.sF) * 29;
  R.eFy = R.sFy + dirY(p.sF) * 29;
  R.aFx = R.eFx + dirX(p.sF + p.eF) * 27;
  R.aFy = R.eFy + dirY(p.sF + p.eF) * 27;
  R.eBx = R.sBx + dirX(p.sB) * 29;
  R.eBy = R.sBy + dirY(p.sB) * 29;
  R.aBx = R.eBx + dirX(p.sB + p.eB) * 27;
  R.aBy = R.eBy + dirY(p.sB + p.eB) * 27;
  R.fFx = p.fFx;
  R.fFy = R.hy + p.fFy;
  R.fBx = p.fBx;
  R.fBy = R.hy + p.fBy;
  const hf = tl(4, 2, TMP);
  [R.kFx, R.kFy] = ik(hf[0], hf[1], R.fFx, R.fFy, 50, 50, 1);
  const hb = tl(-4, 2, TMP);
  [R.kBx, R.kBy] = ik(hb[0], hb[1], R.fBx, R.fBy, 50, 50, 1);
}

/** Where the orb rests above her front palm, after rig */
const palmX = () => R.aFx + 4;
const palmY = () => R.aFy - 16;

/* ---------- Ahri ---------- */

const PAL = {
  skin: ['#c98a80', '#efc2b2', '#fbe0d4'],
  hair: ['#120e1c', '#221a34', '#3a2e5a', '#7a6ab8'],
  white: ['#a898b8', '#d8cce0', '#f4eef6', '#ffffff'],
  red: ['#6a0e2a', '#b01a40', '#e0306a', '#ff7aa8'],
  gold: ['#8a5a1a', '#e2b04a', '#ffe08a'],
  tail: ['#c8a8c0', '#efe0dc', '#fff8f2', '#f6b4d0', '#e062a0'],
};

const CX = new Float32Array(24);
const CY = new Float32Array(24);
const TX = new Float32Array(24);
const TY = new Float32Array(24);
/** Ink for the figure's outline and the separating lines between overlapping shapes */
const INK = '#150a1c';
/** back to front: outer tails first, the middle ones on top */
const TAIL_ORDER = [8, 0, 7, 1, 6, 2, 5, 3, 4];

/**
 * Nine separate tails fanned behind her: each a tapered ribbon, narrow at the root, fullest
 * past the middle and drawn to a point, cream with a rose tip, inked so each reads on its own.
 */
function tails(c: C, t: number, p: AhriPose, flat: string | null, lagX: number, lagY: number, seed: number) {
  const base = tl(-9, -2, TMP);
  const bx = base[0];
  const by = base[1];
  const n = 14;
  const drag = clamp(lagX / 900, 0, 1) * 0.75;
  for (let k = 0; k < 9; k++) {
    const order = TAIL_ORDER[k];
    const q = order / 8;
    // tails radiate from low behind her legs to high over her head, each tip hooking up
    const tip = lerp(-0.8, -0.8 - (1.55 + p.spread * 1.25), q);
    const curl = lerp(1.15, 0.6, q);
    const a0 = tip + curl * 0.8;
    const ess = order % 2 ? 0.55 : -0.45;
    const ph = seed + order * 0.83;
    const len = 10.2 * (1 + Math.sin(order * 2.3) * 0.07 + q * 0.12);
    chain(CX, CY, n, bx, by, len, (i) => {
      const e = i / (n - 1);
      return (
        a0 -
        curl * Math.pow(e, 1.6) +
        ess * Math.sin(e * Math.PI) +
        Math.sin(t * 1.7 + ph - i * 0.38) * (0.03 + e * 0.2) +
        Math.sin(t * 0.6 + ph) * 0.05 * e * e
      );
    });
    // moving fast pulls the tails out behind her, still fanned so all nine read
    if (drag > 0.01) {
      for (let i = 1; i < n; i++) {
        const e = i / (n - 1);
        const kk = drag * e;
        const tx = CX[0] - e * len * (n - 1) * 0.95;
        const ty = CY[0] - lagY * 0.04 * e + Math.sin(t * 9 + ph + i * 0.5) * 3 * e + (q - 0.5) * 120 * e;
        CX[i] = lerp(CX[i], tx, kk);
        CY[i] = lerp(CY[i], ty, kk);
      }
    }
    const fat = 18 + Math.sin(order * 1.7) * 1.5;
    const hw = (e: number) => fat * (0.26 * (1 - e) + 0.86 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(e, 1.1))), 0.62));
    if (flat) {
      c.fillStyle = flat;
      ribbon(c, CX, CY, n, hw);
      c.fill();
      continue;
    }
    const back = k < 4;
    // ink edge so overlapping tails stay separate
    c.fillStyle = INK;
    ribbon(c, CX, CY, n, (e) => hw(e) + 1.4);
    c.fill();
    c.save();
    ribbon(c, CX, CY, n, hw);
    c.clip();
    c.fillStyle = back ? PAL.tail[1] : PAL.tail[2];
    c.fill();
    // lilac shade along the underside
    for (let i = 0; i < n; i++) {
      TX[i] = CX[i];
      TY[i] = CY[i] + hw(i / (n - 1)) * 0.62;
    }
    c.fillStyle = back ? 'rgba(120,80,130,0.4)' : 'rgba(190,150,200,0.32)';
    ribbon(c, TX, TY, n, (e) => hw(e) * 0.5);
    c.fill();
    // rose tip, two tones, opening like a flame into the cream
    for (let pass = 0; pass < 2; pass++) {
      const j0 = pass ? 9 : 7;
      const m = n - j0;
      for (let i = 0; i < m; i++) {
        TX[i] = CX[j0 + i];
        TY[i] = CY[j0 + i];
      }
      c.fillStyle = pass ? (back ? '#c8508c' : PAL.tail[4]) : back ? '#e08ab4' : PAL.tail[3];
      // starts as a point inside the cream, swells to the full width: a flame shaped tip
      ribbon(c, TX, TY, m, (e) => hw((j0 + e * (m - 1)) / (n - 1)) * 1.08 * Math.pow(Math.min(1, e * (pass ? 2.2 : 1.8)), 0.55));
      c.fill();
    }
    // a soft sheen along the top of the near tails
    if (!back) {
      for (let i = 0; i < n; i++) {
        TX[i] = CX[i];
        TY[i] = CY[i] - hw(i / (n - 1)) * 0.5;
      }
      c.fillStyle = 'rgba(255,255,255,0.55)';
      ribbon(c, TX, TY, 9, (e) => hw((e * 8) / (n - 1)) * 0.22);
      c.fill();
    }
    c.restore();
  }
}

function hairBack(c: C, t: number, flat: string | null, lagX: number, seed: number) {
  // long hair from the back of the head down past the shoulder blades
  const hx = R.hdx;
  const hy = R.hdy;
  for (let k = 0; k < 3; k++) {
    chain(CX, CY, 11, hx - 6 - k * 3, hy - 4 + k * 2, 8.5, (i) =>
      -0.45 - k * 0.12 + R.rot * 0.6 + Math.sin(t * 1.9 + seed + k - i * 0.5) * 0.06 * (1 + i * 0.1) - lagX * 0.0007 * (i / 10)
    );
    c.fillStyle = flat ?? PAL.hair[k === 1 ? 0 : 1];
    ribbon(c, CX, CY, 11, (e) => (14 - k * 2.5) * (1 - e * 0.75));
    c.fill();
  }
  if (!flat) {
    c.strokeStyle = PAL.hair[2];
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(CX[0], CY[0]);
    for (let i = 1; i < 9; i++) c.lineTo(CX[i] + 2, CY[i]);
    c.stroke();
  }
}

function sleeve(c: C, t: number, front: boolean, flat: string | null, seed: number, lagX: number) {
  const ex = front ? R.eFx : R.eBx;
  const ey = front ? R.eFy : R.eBy;
  const ax = front ? R.aFx : R.aBx;
  const ay = front ? R.aFy : R.aBy;
  // a detached white bell sleeve from above the elbow to the wrist, flaring wide and hanging
  // below the forearm, swaying and lagging behind her motion
  const sw = Math.sin(t * 2.1 + seed + (front ? 0 : 1.3)) * 3.5 - clamp(lagX * 0.012, -14, 18);
  const wx = lerp(ex, ax, 0.88);
  const wy = lerp(ey, ay, 0.88);
  const lo = Math.max(ey, wy);
  // bottom of the bell, hanging under the wrist end
  const hx = wx + sw - 2;
  const hy = lo + 34;
  const path = (d: number) => {
    c.beginPath();
    c.moveTo(ex - 1, ey - 4.5 - d);
    c.quadraticCurveTo((ex + wx) / 2, (ey + wy) / 2 - 6 - d, wx + 2 + d, wy - 4 - d);
    // the open front edge swinging out and down
    c.quadraticCurveTo(wx + 14 + d + sw * 0.4, (wy + hy) / 2, hx + 10 + d, hy + d * 0.6);
    // rounded hem
    c.quadraticCurveTo(hx - 4, hy + 9 + d, hx - 20 - d + sw * 0.2, hy - 6 + d * 0.4);
    // back edge up to the elbow
    c.quadraticCurveTo(ex - 9 - d, (ey + hy) / 2 - 2, ex - 4 - d, ey + 1);
    c.closePath();
  };
  if (flat) {
    c.fillStyle = flat;
    path(0);
    c.fill();
    return;
  }
  c.fillStyle = INK;
  path(1.4);
  c.fill();
  c.fillStyle = front ? PAL.white[3] : PAL.white[1];
  path(0);
  c.fill();
  c.save();
  c.clip();
  // fold shadows under the forearm and down the back
  c.fillStyle = front ? 'rgba(160,140,190,0.4)' : 'rgba(100,80,130,0.45)';
  c.beginPath();
  c.moveTo(ex - 6, ey + 4);
  c.quadraticCurveTo(lerp(ex, hx, 0.5) - 2, lerp(ey, hy, 0.6), hx - 6, hy + 4);
  c.lineTo(hx - 22, hy);
  c.quadraticCurveTo(ex - 10, (ey + hy) / 2, ex - 8, ey);
  c.closePath();
  c.fill();
  // red trim along the hem with a gold line inside it
  c.lineCap = 'butt';
  c.strokeStyle = PAL.red[1];
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(hx + 14, hy + 1);
  c.quadraticCurveTo(hx - 4, hy + 10, hx - 24 + sw * 0.2, hy - 5);
  c.stroke();
  c.strokeStyle = PAL.gold[1];
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(hx + 12, hy - 3.6);
  c.quadraticCurveTo(hx - 4, hy + 5, hx - 22 + sw * 0.2, hy - 9.4);
  c.stroke();
  // red band where it is tied above the elbow
  c.strokeStyle = PAL.red[1];
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(ex + 1, ey - 8);
  c.lineTo(ex - 5, ey + 4);
  c.stroke();
  c.restore();
  // a red tassel cord from the cuff
  c.strokeStyle = PAL.red[1];
  c.lineWidth = 1.3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(hx + 8, hy + 2);
  c.quadraticCurveTo(hx + 8 + sw * 0.4, hy + 9, hx + 7 + sw * 0.6, hy + 15);
  c.stroke();
  c.fillStyle = PAL.red[2];
  c.beginPath();
  c.ellipse(hx + 7 + sw * 0.6, hy + 17, 1.8, 3.2, 0, 0, TAU);
  c.fill();
}

function arm(c: C, front: boolean, flat: string | null) {
  const sx = front ? R.sFx : R.sBx;
  const sy = front ? R.sFy : R.sBy;
  const ex = front ? R.eFx : R.eBx;
  const ey = front ? R.eFy : R.eBy;
  const ax = front ? R.aFx : R.aBx;
  const ay = front ? R.aFy : R.aBy;
  const sk = front ? PAL.skin[1] : PAL.skin[0];
  bone(c, sx, sy, ex, ey, (len) => {
    c.fillStyle = flat ?? sk;
    taper(c, len, 8.5, 6.5, 0.15);
    c.fill();
  });
  bone(c, ex, ey, ax, ay, (len) => {
    c.fillStyle = flat ?? sk;
    taper(c, len, 6.5, 4.8, 0.1);
    c.fill();
    c.fillStyle = flat ?? sk;
    c.beginPath();
    c.ellipse(0.5, len + 4, 3.6, 5.2, 0.2, 0, TAU);
    c.fill();
  });
}

function leg(c: C, front: boolean, flat: string | null) {
  const hip = tl(front ? 4 : -4, 2, [0, 0]);
  const kx = front ? R.kFx : R.kBx;
  const ky = front ? R.kFy : R.kBy;
  const fx = front ? R.fFx : R.fBx;
  const fy = front ? R.fFy : R.fBy;
  const sk = front ? PAL.skin[1] : PAL.skin[0];
  const sock = front ? PAL.white[3] : PAL.white[1];
  bone(c, hip[0], hip[1], kx, ky, (len) => {
    c.fillStyle = flat ?? sk;
    taper(c, len, 14, 9, 0.12);
    c.fill();
    if (flat) return;
    // thigh-high white stocking from mid thigh, red band at the top
    c.fillStyle = sock;
    c.save();
    c.translate(0, len * 0.55);
    taper(c, len * 0.45, 12.6, 9.4, 0.06);
    c.fill();
    c.restore();
    c.strokeStyle = PAL.red[1];
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-6.4, len * 0.57);
    c.lineTo(6.4, len * 0.57);
    c.stroke();
  });
  bone(c, kx, ky, fx, fy, (len) => {
    c.fillStyle = flat ?? sock;
    taper(c, len, 9.4, 5.4, 0.12, -1);
    c.fill();
    if (!flat) {
      c.fillStyle = front ? 'rgba(170,150,190,0.35)' : 'rgba(110,90,140,0.35)';
      c.beginPath();
      c.moveTo(-4.6, len * 0.1);
      c.quadraticCurveTo(-6, len * 0.5, -2.6, len);
      c.lineTo(-1.2, len);
      c.quadraticCurveTo(-3, len * 0.5, -1.6, len * 0.1);
      c.closePath();
      c.fill();
    }
    // pointed foot
    c.fillStyle = flat ?? sock;
    c.beginPath();
    c.moveTo(-4, len - 1);
    c.quadraticCurveTo(6, len + 2, 3, len + 14);
    c.quadraticCurveTo(-2, len + 8, -4, len - 1);
    c.fill();
  });
}

function skirt(c: C, t: number, flat: string | null, front: boolean, lagX: number, seed: number) {
  c.save();
  c.translate(R.hx, R.hy);
  c.rotate(R.rot);
  const sw = Math.sin(t * 2.3 + seed) * 2 - clamp(lagX * 0.005, -6, 9);
  if (!front) {
    c.fillStyle = flat ?? PAL.red[0];
    c.beginPath();
    c.moveTo(-12, -6);
    c.quadraticCurveTo(-26 + sw, 10, -30 + sw * 1.5, 30);
    c.lineTo(10 + sw, 30);
    c.lineTo(10, -6);
    c.closePath();
    c.fill();
  } else {
    // layered skirt: white over red, flaring back in a point
    c.fillStyle = flat ?? PAL.red[1];
    c.beginPath();
    c.moveTo(-13, -8);
    c.lineTo(14, -8);
    c.quadraticCurveTo(22 + sw, 8, 24 + sw, 22);
    c.lineTo(8 + sw, 26);
    c.lineTo(-6 + sw, 22);
    c.lineTo(-24 + sw * 1.5, 28);
    c.quadraticCurveTo(-18, 8, -13, -8);
    c.closePath();
    c.fill();
    if (!flat) {
      const g = c.createLinearGradient(0, -8, 0, 22);
      g.addColorStop(0, PAL.white[3]);
      g.addColorStop(1, PAL.white[1]);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-12, -8);
      c.lineTo(13, -8);
      c.quadraticCurveTo(19 + sw, 6, 20 + sw, 17);
      c.lineTo(7 + sw, 21);
      c.lineTo(-6 + sw, 17);
      c.lineTo(-20 + sw * 1.5, 22);
      c.quadraticCurveTo(-16, 6, -12, -8);
      c.closePath();
      c.fill();
      c.strokeStyle = PAL.gold[1];
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(20 + sw, 17);
      c.lineTo(7 + sw, 21);
      c.lineTo(-6 + sw, 17);
      c.lineTo(-20 + sw * 1.5, 22);
      c.stroke();
    }
  }
  c.restore();
}

function torso(c: C, t: number, flat: string | null, lagX: number, seed: number) {
  c.save();
  c.translate(R.hx, R.hy);
  c.rotate(R.rot);
  // obi bow ribbons trailing behind
  if (!flat) {
    c.restore();
    const a = tl(-12, -16, [0, 0]);
    for (let k = 0; k < 2; k++) {
      chain(CX, CY, 9, a[0], a[1] + k * 3, 6, (i) =>
        -0.7 - k * 0.4 + Math.sin(t * 2.6 + seed + k * 1.2 - i * 0.6) * 0.18 - lagX * 0.0008 * (i / 8)
      );
      c.fillStyle = k ? PAL.red[0] : PAL.red[1];
      ribbon(c, CX, CY, 9, (e) => 4.5 - e * 1.5);
      c.fill();
    }
    c.save();
    c.translate(R.hx, R.hy);
    c.rotate(R.rot);
  }
  // body
  c.fillStyle = flat ?? PAL.white[2];
  c.beginPath();
  c.moveTo(-11, -4);
  c.quadraticCurveTo(-9, -26, -13, -40);
  c.quadraticCurveTo(-12, -52, -4, -54);
  c.lineTo(8, -54);
  c.quadraticCurveTo(17, -50, 16, -40);
  c.quadraticCurveTo(12, -26, 12, -4);
  c.closePath();
  c.fill();
  if (!flat) {
    const g = c.createLinearGradient(16, 0, -13, 0);
    g.addColorStop(0, PAL.white[3]);
    g.addColorStop(0.5, PAL.white[2]);
    g.addColorStop(1, PAL.white[0]);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-11, -4);
    c.quadraticCurveTo(-9, -26, -13, -40);
    c.quadraticCurveTo(-12, -52, -4, -54);
    c.lineTo(8, -54);
    c.quadraticCurveTo(17, -50, 16, -40);
    c.quadraticCurveTo(12, -26, 12, -4);
    c.closePath();
    c.fill();
    // neckline: skin at the collar, crossed red lapels with gold edges
    c.fillStyle = PAL.skin[1];
    c.beginPath();
    c.moveTo(-3, -54);
    c.lineTo(9, -54);
    c.lineTo(7, -42);
    c.closePath();
    c.fill();
    c.strokeStyle = PAL.red[1];
    c.lineWidth = 3.2;
    c.beginPath();
    c.moveTo(-4, -55);
    c.lineTo(8, -34);
    c.moveTo(11, -54);
    c.lineTo(6, -38);
    c.stroke();
    c.strokeStyle = PAL.gold[1];
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-2.5, -56);
    c.lineTo(9.5, -35);
    c.stroke();
    // soft chest shading
    c.fillStyle = 'rgba(150,120,170,0.25)';
    c.beginPath();
    c.ellipse(10, -38, 6, 4, 0.3, 0, TAU);
    c.fill();
  }
  // obi with a gold cord
  c.fillStyle = flat ?? PAL.red[1];
  c.beginPath();
  c.moveTo(-11, -26);
  c.lineTo(13, -27);
  c.lineTo(13, -10);
  c.lineTo(-11, -10);
  c.closePath();
  c.fill();
  if (!flat) {
    c.fillStyle = PAL.red[2];
    c.fillRect(-11, -26, 24, 3);
    c.strokeStyle = PAL.gold[1];
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-11, -18);
    c.quadraticCurveTo(1, -16, 13, -19);
    c.stroke();
    c.fillStyle = PAL.gold[2];
    c.beginPath();
    c.arc(7, -18, 2.2, 0, TAU);
    c.fill();
    // the bow knot at her back
    c.fillStyle = PAL.red[1];
    c.beginPath();
    c.ellipse(-14, -22, 6, 9, -0.5, 0, TAU);
    c.fill();
    c.fillStyle = PAL.red[0];
    c.beginPath();
    c.ellipse(-12, -18, 3, 4, 0, 0, TAU);
    c.fill();
  }
  c.restore();
}

function head(c: C, t: number, p: AhriPose, flat: string | null, blink: number, lagX: number) {
  c.save();
  c.translate(R.hdx, R.hdy);
  c.rotate(R.rot + p.hd);
  c.scale(1.08, 1.08);
  const F = (col: string) => flat ?? col;
  const tw = Math.sin(t * 3.1) > 0.97 ? 0.25 : 0;
  // fox ears, far one first
  const ear = (x: number, y: number, a: number, s: number, near: boolean) => {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.scale(s, s);
    c.fillStyle = F(near ? PAL.hair[1] : PAL.hair[0]);
    c.beginPath();
    c.moveTo(-8, 2);
    c.quadraticCurveTo(-9, -12, -1, -24);
    c.quadraticCurveTo(7, -12, 9, 2);
    c.closePath();
    c.fill();
    if (!flat) {
      c.fillStyle = near ? '#f4c2d4' : '#c8909e';
      c.beginPath();
      c.moveTo(-4.5, 0);
      c.quadraticCurveTo(-5, -10, -1, -18);
      c.quadraticCurveTo(4, -10, 5, 0);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,248,250,0.9)';
      c.beginPath();
      c.moveTo(-5, 2);
      c.quadraticCurveTo(-3, -6, 0, -3);
      c.quadraticCurveTo(3, -7, 5, 2);
      c.closePath();
      c.fill();
      c.strokeStyle = PAL.hair[3];
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(-8, 1);
      c.quadraticCurveTo(-9, -12, -1, -24);
      c.stroke();
    }
    c.restore();
  };
  ear(4, -14, 0.3 + tw, 0.9, false);
  // skull and back hair cap
  c.fillStyle = F(PAL.hair[0]);
  c.beginPath();
  c.ellipse(-2, -2, 15, 15.5, 0, 0, TAU);
  c.fill();
  // face
  c.fillStyle = F(PAL.skin[1]);
  c.beginPath();
  c.moveTo(-5, -8);
  c.bezierCurveTo(2, -12, 12, -11, 14.5, -5);
  c.bezierCurveTo(16.5, 0, 16.5, 5, 14, 9);
  c.quadraticCurveTo(12, 14, 9, 15.5);
  c.quadraticCurveTo(4, 15, 0, 11);
  c.bezierCurveTo(-5, 7, -7, 0, -5, -8);
  c.closePath();
  c.fill();
  if (!flat) {
    c.fillStyle = PAL.skin[2];
    c.beginPath();
    c.ellipse(9, 1, 5.5, 7, 0.1, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(190,120,120,0.35)';
    c.beginPath();
    c.moveTo(0, 11);
    c.quadraticCurveTo(4, 15, 9, 15.5);
    c.quadraticCurveTo(4, 13, 1, 9);
    c.closePath();
    c.fill();
    // blush and her whisker marks
    c.fillStyle = 'rgba(255,120,150,0.3)';
    c.beginPath();
    c.ellipse(4.5, 7.5, 3.6, 2, 0, 0, TAU);
    c.ellipse(14.2, 6.5, 1.5, 1.4, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(150,50,80,0.85)';
    c.lineWidth = 0.6;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      c.moveTo(1.2, 5.6 + i * 1.5);
      c.lineTo(4.6, 6.2 + i * 1.2);
    }
    c.moveTo(14.4, 5.8);
    c.lineTo(15.4, 5.6);
    c.moveTo(14.5, 7.1);
    c.lineTo(15.5, 7.1);
    c.stroke();
    // eyes: golden and a little sly, with a flicked outer lash
    const open = 1 - blink;
    const eye = (x: number, y: number, wdt: number, ht: number, near: boolean) => {
      if (open > 0.15) {
        c.fillStyle = '#fffaf6';
        c.beginPath();
        c.ellipse(x, y, wdt, ht * open, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#c8780e';
        c.beginPath();
        c.ellipse(x + wdt * 0.12, y + ht * 0.08 * open, wdt * 0.66, ht * 0.9 * open, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.ellipse(x + wdt * 0.12, y + ht * 0.38 * open, wdt * 0.46, ht * 0.44 * open, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#2a1008';
        c.beginPath();
        c.ellipse(x + wdt * 0.14, y + ht * 0.05 * open, wdt * 0.2, ht * 0.55 * open, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(x - wdt * 0.12, y - ht * 0.34 * open, Math.max(0.5, wdt * 0.2), 0, TAU);
        c.fill();
      }
      c.strokeStyle = '#1a0c14';
      c.lineWidth = near ? 1.3 : 1;
      c.beginPath();
      c.moveTo(x - wdt * 1.15, y - ht * 0.1);
      c.quadraticCurveTo(x - wdt * 0.1, y - ht * 1.15 * open - 0.3, x + wdt * 1.05, y - ht * 0.3);
      c.stroke();
      if (near) {
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(x - wdt * 1.1, y - ht * 0.15);
        c.quadraticCurveTo(x - wdt * 1.5, y - ht * 0.5, x - wdt * 1.75, y - ht * 1);
        c.stroke();
      }
      c.strokeStyle = 'rgba(120,60,70,0.5)';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(x - wdt * 0.7, y + ht * 0.95 * open);
      c.quadraticCurveTo(x, y + ht * 1.1 * open, x + wdt * 0.7, y + ht * 0.8 * open);
      c.stroke();
    };
    eye(6, 1, 3.7, 4, true);
    eye(13.6, 0.6, 1.8, 3.7, false);
    c.strokeStyle = '#2a1a2a';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(2.4, -5.4);
    c.quadraticCurveTo(6, -7.4, 9.4, -6.2);
    c.moveTo(12.4, -6.2);
    c.quadraticCurveTo(14, -6.8, 15.4, -5.6);
    c.stroke();
    // nose and a small sly smile
    c.strokeStyle = '#c0807a';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(16, 3.6);
    c.lineTo(16.3, 5.2);
    c.stroke();
    c.strokeStyle = '#b84a66';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(11, 10.2);
    c.quadraticCurveTo(12.8, 11.2, 14.4, 9.6);
    c.stroke();
  }
  // bangs: pointed locks over the brow
  c.fillStyle = F(PAL.hair[1]);
  c.beginPath();
  c.moveTo(-15, 2);
  c.bezierCurveTo(-16, -17, 2, -22, 14, -13);
  c.lineTo(17.5, -4);
  c.lineTo(12.5, -8);
  c.lineTo(11, -3);
  c.lineTo(8, -8.5);
  c.lineTo(4.5, -2.5);
  c.lineTo(2, -8);
  c.lineTo(-2.5, 1);
  c.lineTo(-5, -4);
  c.quadraticCurveTo(-8, 6, -8, 16);
  c.closePath();
  c.fill();
  // side lock falling in front of the ear down past the jaw
  const sw = Math.sin(t * 2 + 1) * 1.5 - clamp(lagX * 0.003, -3, 5);
  c.beginPath();
  c.moveTo(-6, -4);
  c.quadraticCurveTo(-2 + sw, 10, -4 + sw * 2, 30);
  c.lineTo(-7 + sw * 2, 27);
  c.quadraticCurveTo(-9 + sw, 12, -12, 0);
  c.closePath();
  c.fill();
  if (!flat) {
    c.strokeStyle = PAL.hair[3];
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-11, -8);
    c.bezierCurveTo(-8, -15, 0, -18, 8, -15);
    c.stroke();
    c.strokeStyle = PAL.hair[2];
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-6, 0);
    c.quadraticCurveTo(-3 + sw, 12, -5 + sw * 2, 26);
    c.stroke();
    // a gold hair ornament
    c.fillStyle = PAL.gold[1];
    c.beginPath();
    c.arc(-9, -10, 2.6, 0, TAU);
    c.fill();
    c.fillStyle = PAL.red[2];
    c.beginPath();
    c.arc(-9, -10, 1.3, 0, TAU);
    c.fill();
  }
  ear(-7, -13, -0.25 - tw * 0.6, 1.05, true);
  c.restore();
}

/** Ahri facing right, hovering with her toes at about the origin */
function ahri(c: C, t: number, p: AhriPose, flat: string | null, lagX: number, lagY: number, seed: number, blink = 0) {
  rig(p);
  tails(c, t, p, flat, lagX, lagY, seed);
  hairBack(c, t, flat, lagX, seed);
  sleeve(c, t, false, flat, seed, lagX);
  arm(c, false, flat);
  leg(c, false, flat);
  skirt(c, t, flat, false, lagX, seed);
  torso(c, t, flat, lagX, seed);
  leg(c, true, flat);
  skirt(c, t, flat, true, lagX, seed);
  // neck
  const n0 = tl(2, -52, [0, 0]);
  c.strokeStyle = flat ?? PAL.skin[0];
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(n0[0], n0[1]);
  c.lineTo(R.hdx - 1, R.hdy + 10);
  c.stroke();
  head(c, t, p, flat, blink, lagX);
  arm(c, true, flat);
  sleeve(c, t, true, flat, seed, lagX);
}

/* ---------- scene ---------- */

function wispScreen(s: State, env: SceneEnv, wi: Wisp, t: number): [number, number] {
  return [wi.x * env.w, wi.y * env.h + Math.sin(t * 1.8 + wi.seed) * 6 * s.u];
}

function ahriBase(s: State, env: SceneEnv): [number, number] {
  return [s.x * env.w, s.ground - (18 + s.y) * s.K];
}

function resetWisp(s: State, wi: Wisp, first: boolean, i: number) {
  wi.alive = true;
  wi.hp = 3;
  wi.flash = 0;
  wi.charm = 0;
  wi.hit = 0;
  wi.hx = first ? [0.58, 0.72, 0.86, 0.66, 0.82][i] : rand(0.55, 0.92);
  wi.hy = first ? [0.5, 0.36, 0.52, 0.66, 0.24][i] : rand(0.22, 0.66);
  wi.x = first ? wi.hx : 1.1;
  wi.y = wi.hy;
  wi.vx = 0;
  wi.vy = 0;
  wi.born = first ? 1 : 0;
  wi.seed = rand(0, TAU);
}

function nearestWisp(s: State, env: SceneEnv, x: number, y: number, skip = 0) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.wisps.length; i++) {
    const wi = s.wisps[i];
    if (!wi.alive || wi.born < 1 || skip & (1 << i)) continue;
    const d = Math.hypot(wi.x * env.w - x, wi.y * env.h - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function hitWisp(s: State, env: SceneEnv, i: number, dmg: number, col: number, sound: boolean) {
  const wi = s.wisps[i];
  if (!wi.alive) return;
  const K = s.K;
  const x = wi.x * env.w;
  const y = wi.y * env.h;
  wi.hp -= wi.charm > 0 ? dmg * 1.5 : dmg;
  wi.flash = 0.15;
  burst(s.parts, 6, x, y, 0, Math.PI, 280 * K, 0.35, 4 * K, col, 4, 0);
  const bus = sound && s.touched ? env.audio() : null;
  if (bus) tone(bus, 1200 + Math.random() * 300, { type: 'triangle', attack: 0.002, decay: 0.12, gain: 0.03, glideTo: 1800 });
  if (wi.hp <= 0) {
    wi.alive = false;
    wi.respawn = rand(1.2, 2);
    burst(s.parts, 8, x, y, 0, Math.PI, 260 * K, 0.8, 4 * K, 4, 2, 60 * K);
    burst(s.parts, 8, x, y, 0, Math.PI, 300 * K, 0.4, 4 * K, 3, 4, 0);
    if (!env.reducedMotion) {
      s.shake = Math.max(s.shake, 0.3);
      s.stop = Math.max(s.stop, 0.045);
    }
    const b2 = sound && s.touched ? env.audio() : null;
    if (b2) {
      tone(b2, 660, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.05, glideTo: 1320 });
      tone(b2, 990, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.03, glideTo: 1980, delay: 0.05 });
    }
  }
}

function castOrb(s: State, env: SceneEnv, gx: number, gy: number, sound: boolean) {
  if (s.orb !== 0 || s.dashT > 0) return false;
  rig(s.pose);
  const [ax, ay] = ahriBase(s, env);
  const K = s.K;
  const px = ax + palmX() * K * s.face;
  const py = ay + palmY() * K;
  s.face = gx >= ax ? 1 : -1;
  const dx = gx - px;
  const dy = gy - py;
  const d = Math.hypot(dx, dy) || 1;
  const r = ORB_RANGE * K;
  s.orb = 1;
  s.ot = 0;
  s.oHit = 0;
  s.otrN = 0;
  s.oFromX = px;
  s.oFromY = py;
  // stop short of the frame edges so the orb never leaves the picture
  let k = r;
  const mx = 34 * K;
  if (dx > 0) k = Math.min(k, ((env.w - mx - px) / dx) * d);
  if (dx < 0) k = Math.min(k, ((mx - px) / dx) * d);
  if (dy > 0) k = Math.min(k, ((s.ground - 20 * K - py) / dy) * d);
  if (dy < 0) k = Math.min(k, ((mx - py) / dy) * d);
  k = Math.max(k, 60 * K);
  s.oToX = px + (dx / d) * k;
  s.oToY = py + (dy / d) * k;
  s.cast = 1;
  s.castT = 0;
  const bus = sound ? env.audio() : null;
  if (bus) {
    tone(bus, 520, { type: 'sine', attack: 0.01, decay: 0.35, gain: 0.05, glideTo: 1040 });
    noise(bus, { duration: 0.3, gain: 0.05, freq: 3000, q: 0.8 });
  }
  return true;
}

function castCharm(s: State, env: SceneEnv, gx: number, gy: number, sound: boolean) {
  if (s.charmCd > 0 || s.heart.life > 0 || s.dashT > 0) return false;
  const [ax, ay] = ahriBase(s, env);
  const K = s.K;
  rig(s.pose);
  const hx = ax + (R.hdx + 14) * K * s.face;
  const hy = ay + (R.hdy + 10) * K;
  s.face = gx >= ax ? 1 : -1;
  const dx = gx - hx;
  const dy = gy - hy;
  const d = Math.hypot(dx, dy) || 1;
  const v = 560 * K;
  s.heart.x = hx;
  s.heart.y = hy;
  s.heart.vx = (dx / d) * v;
  s.heart.vy = (dy / d) * v;
  s.heart.life = 1;
  s.charmCd = 1.2;
  s.cast = 2;
  s.castT = 0;
  const bus = sound ? env.audio() : null;
  if (bus) {
    tone(bus, 880, { type: 'sine', attack: 0.01, decay: 0.25, gain: 0.04, glideTo: 1320 });
    tone(bus, 1320, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.03, glideTo: 1760, delay: 0.06 });
  }
  return true;
}

function spiritRush(s: State, env: SceneEnv, gx: number, gy: number, sound: boolean) {
  if (s.dashT > 0 || s.rushCd > 0) return false;
  if (s.rushN <= 0) {
    s.rushN = 3;
    s.rushWin = 3.2;
  }
  s.rushN--;
  const K = s.K;
  const [ax, ay] = ahriBase(s, env);
  const cy = ay - 100 * K;
  const dx = gx - ax;
  const dy = gy - cy;
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(d, DASH_LEN * K);
  s.face = dx >= 0 ? 1 : -1;
  s.dashFromX = s.x;
  s.dashFromY = s.y;
  s.dashToX = clamp(s.x + ((dx / d) * reach) / env.w, 0.08, 0.92);
  // y is her height above the water in rig units
  s.dashToY = clamp(s.y - ((dy / d) * reach) / K, 0, Math.max(0, (s.ground - env.h * 0.06) / K - 250));
  s.dashT = 0.0001;
  s.ghostN = 0;
  s.trail = 1;
  if (s.rushN <= 0) {
    s.rushCd = 2.2;
    s.rushMax = 2.2;
    s.rushN = 0;
  }
  const bus = sound ? env.audio() : null;
  if (bus) {
    noise(bus, { duration: 0.3, gain: 0.1, freq: 1800, q: 0.7 });
    tone(bus, 330, { type: 'triangle', attack: 0.004, decay: 0.3, gain: 0.04, glideTo: 990 });
  }
  return true;
}

function fireBolts(s: State, env: SceneEnv, n: number, kind: number, fromX: number, fromY: number, prefer = -1) {
  let used = 0;
  for (let k = 0; k < n; k++) {
    let target = prefer >= 0 && s.wisps[prefer].alive ? prefer : nearestWisp(s, env, fromX, fromY, used);
    if (target < 0) target = nearestWisp(s, env, fromX, fromY);
    if (target < 0) return;
    used |= 1 << target;
    let slot = s.bolts[0];
    for (const b of s.bolts) if (b.life <= 0) {
      slot = b;
      break;
    }
    const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.9 + rand(-0.2, 0.2);
    slot.x = fromX;
    slot.y = fromY;
    slot.vx = Math.cos(a) * 380 * s.K;
    slot.vy = Math.sin(a) * 380 * s.K;
    slot.target = target;
    slot.life = 2;
    slot.kind = kind;
  }
}

/** The wisp under a screen point */
function pickWisp(s: State, env: SceneEnv, px: number, py: number) {
  let best = -1;
  let bd = 40 * s.K;
  for (let i = 0; i < s.wisps.length; i++) {
    const wi = s.wisps[i];
    if (!wi.alive || wi.born < 1) continue;
    const d = Math.hypot(wi.x * env.w - px, wi.y * env.h - py);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function onSelf(s: State, env: SceneEnv, px: number, py: number) {
  const [ax, ay] = ahriBase(s, env);
  const K = s.K;
  return Math.abs(px - ax) < 34 * K && py > ay - 190 * K && py < ay + 6 * K;
}

/** Fox-Fire: the three flames circling her leap at the nearest wisps */
function foxFire(s: State, env: SceneEnv) {
  if (s.fires <= 0) return false;
  const [ax, ay] = ahriBase(s, env);
  fireBolts(s, env, s.fires, 1, ax, ay - 110 * s.K);
  s.fires = 0;
  s.fireCd = 2.6;
  s.cast = 3;
  s.castT = 0;
  const bus = s.touched ? env.audio() : null;
  if (bus) {
    tone(bus, 660, { type: 'sine', attack: 0.004, decay: 0.25, gain: 0.04, glideTo: 1320 });
    noise(bus, { duration: 0.25, gain: 0.06, freq: 2600, q: 0.8 });
  }
  return true;
}

/** Her basic attack: a single essence bolt that homes in on the wisp */
function basicAttack(s: State, env: SceneEnv, i: number) {
  const [ax, ay] = ahriBase(s, env);
  s.face = s.wisps[i].x * env.w >= ax ? 1 : -1;
  rig(s.pose);
  fireBolts(s, env, 1, 0, ax + palmX() * s.K * s.face, ay + palmY() * s.K, i);
  s.atkCd = 0.7;
  s.cast = 1;
  s.castT = 0.1;
  const bus = s.touched ? env.audio() : null;
  if (bus) tone(bus, 1180, { type: 'sine', attack: 0.004, decay: 0.12, gain: 0.03, glideTo: 1560 });
}

/** Where a screen point puts her: x across the pond, y her height so her body sits at the point */
function flyTarget(s: State, env: SceneEnv, gx: number, gy: number): [number, number] {
  const top = Math.max(0, (s.ground - env.h * 0.06) / s.K - 250);
  return [clamp(gx / Math.max(1, env.w), 0.06, 0.94), clamp((s.ground - gy) / s.K - 18 - 100, 0, top)];
}

const busy = (s: State) => s.dashT > 0;

function command(s: State, env: SceneEnv, c: Command, gx: number, gy: number) {
  if (!c) return;
  if (c === 'stop') {
    halt(s.m);
    s.chase = -1;
    return;
  }
  if (c === 'move' || c === 'tap') {
    const i = c === 'tap' ? pickWisp(s, env, gx, gy) : -1;
    if (i >= 0) {
      s.chase = i;
      setMarker(s.marker, s.wisps[i].x * env.w, s.wisps[i].y * env.h + 26 * s.K, '255,110,170');
      return;
    }
    if (c === 'tap' && onSelf(s, env, gx, gy)) return command(s, env, 'w', gx, gy);
    s.chase = -1;
    const [x, y] = flyTarget(s, env, gx, gy);
    moveTo(s.m, x, y);
    setMarker(s.marker, gx, Math.min(gy, s.ground + 30 * s.K), '255,190,230');
    return;
  }
  if (c === 'double') c = 'e';
  if (busy(s)) {
    s.buf = c;
    s.bufX = gx;
    s.bufY = gy;
    s.bufT = 0.35;
    return;
  }
  if (c === 'q') {
    if (s.orb !== 0) {
      // the orb is still out: hold the cast until it is back in her palm
      s.buf = c;
      s.bufX = gx;
      s.bufY = gy;
      s.bufT = 0.5;
      return;
    }
    if (castOrb(s, env, gx, gy, true)) s.fl[0] = 0.25;
  } else if (c === 'w') {
    if (foxFire(s, env)) s.fl[1] = 0.25;
  } else if (c === 'e') {
    if (castCharm(s, env, gx, gy, true)) s.fl[2] = 0.25;
  } else if (c === 'r') {
    if (spiritRush(s, env, gx, gy, true)) {
      s.fl[3] = 0.25;
      halt(s.m);
      s.chase = -1;
    }
  }
}

function interact(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  env.wake(2600);
}

function keyAim(s: State, env: SceneEnv): [number, number] {
  if (env.pointer.inside) return [env.pointer.x, env.pointer.y];
  const [ax, ay] = ahriBase(s, env);
  const i = nearestWisp(s, env, ax, ay - 100 * s.K);
  if (i >= 0) return [s.wisps[i].x * env.w, s.wisps[i].y * env.h];
  return [ax + env.w * 0.4, ay - 120 * s.K];
}

/* ---------- background ---------- */

/** Margin around the baked backdrop, in scene pixels per unit u, covering the largest shake */
const BG_MARGIN = 10;

/** Five round petals around a centre, added to the current path */
function flowerPath(c: C, x: number, y: number, r: number, rot: number) {
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * TAU) / 5;
    const px = x + Math.cos(a) * r * 0.55;
    const py = y + Math.sin(a) * r * 0.55;
    c.moveTo(px + r * 0.48, py);
    c.arc(px, py, r * 0.48, 0, TAU);
  }
}

/**
 * A spirit blossom tree: a crooked inked trunk with clustered bloom clumps, each a dark
 * underside, a lit crown and a scatter of five petal flowers, instead of loose circles.
 * cols: [shadow, body, light, flower, centre]
 */
function sakura(c: C, x: number, base: number, s: number, rnd: () => number, trunk: string, cols: string[], lean: number, ink: string) {
  c.strokeStyle = trunk;
  c.lineCap = 'round';
  const tips: number[] = [];
  const branch = (bx: number, by: number, a: number, len: number, wd: number, depth: number) => {
    const ex = bx + Math.sin(a) * len;
    const ey = by - Math.cos(a) * len;
    c.lineWidth = wd;
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(bx + Math.sin(a + 0.4) * len * 0.5, by - Math.cos(a + 0.4) * len * 0.5, ex, ey);
    c.stroke();
    if (depth <= 0) {
      tips.push(ex, ey);
      return;
    }
    const n = depth > 2 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(ex, ey, a + (rnd() - 0.5) * 1.4 + (i - (n - 1) / 2) * 0.5, len * (0.62 + rnd() * 0.2), wd * 0.66, depth - 1);
  };
  branch(x, base, lean, s * 0.9, s * 0.14, 4);
  // clumps: positions first so every layer shares them
  const cl: number[] = [];
  for (let i = 0; i < tips.length; i += 2) {
    const n = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < n; j++) cl.push(tips[i] + (rnd() - 0.5) * s * 0.34, tips[i + 1] + (rnd() - 0.65) * s * 0.26, s * (0.1 + rnd() * 0.07));
  }
  const lobes = (dx: number, dy: number, k: number, grow: number) => {
    c.beginPath();
    for (let i = 0; i < cl.length; i += 3) {
      const r = cl[i + 2] * k + grow;
      c.moveTo(cl[i] + dx + r, cl[i + 1] + dy);
      c.arc(cl[i] + dx, cl[i + 1] + dy, r, 0, TAU);
    }
  };
  const lw = Math.max(1, s * 0.012);
  c.fillStyle = ink;
  lobes(0, 0, 1, lw * 1.4);
  c.fill();
  c.fillStyle = cols[0];
  lobes(0, 0, 1, 0);
  c.fill();
  c.fillStyle = cols[1];
  lobes(-s * 0.012, -s * 0.03, 0.82, 0);
  c.fill();
  c.fillStyle = cols[2];
  lobes(-s * 0.025, -s * 0.06, 0.5, 0);
  c.fill();
  // little five petal flowers over the lit side of each clump
  c.fillStyle = cols[3];
  c.beginPath();
  const fr = s * 0.026;
  const dots: number[] = [];
  for (let i = 0; i < cl.length; i += 3) {
    const r = cl[i + 2];
    for (let j = 0; j < 4; j++) {
      const a = -Math.PI * 0.5 + (rnd() - 0.5) * 2.6;
      const d = r * (0.25 + rnd() * 0.6);
      const fx = cl[i] + Math.cos(a) * d;
      const fy = cl[i + 1] + Math.sin(a) * d;
      flowerPath(c, fx, fy, fr * (0.7 + rnd() * 0.6), rnd() * TAU);
      dots.push(fx, fy);
    }
  }
  c.fill();
  c.fillStyle = cols[4];
  c.beginPath();
  for (let i = 0; i < dots.length; i += 2) {
    c.moveTo(dots[i] + fr * 0.22, dots[i + 1]);
    c.arc(dots[i], dots[i + 1], fr * 0.22, 0, TAU);
  }
  c.fill();
}

function paintScene(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c, m } = backdropLayer(s.bg, w, h, dpr, BG_MARGIN * s.u + 2);
  s.bg = cv;
  if (!c) return;
  const u = s.u;
  const rnd = mulberry(77);
  const g0 = s.ground;
  const W = w + m * 2;
  const sky = c.createLinearGradient(0, 0, 0, g0);
  sky.addColorStop(0, '#120f30');
  sky.addColorStop(0.38, '#30235c');
  sky.addColorStop(0.66, '#6e3c7c');
  sky.addColorStop(0.86, '#c46e90');
  sky.addColorStop(1, '#f0a898');
  c.fillStyle = sky;
  c.fillRect(-m, -m, W, g0 + m + 2);
  for (let i = 0; i < 70; i++) {
    c.fillStyle = `rgba(255,240,255,${(0.2 + rnd() * 0.6).toFixed(3)})`;
    const r = Math.max(1 / dpr, Math.round((0.5 + rnd()) * u * dpr) / dpr);
    c.fillRect(Math.round(rnd() * w * dpr) / dpr, Math.round(rnd() * h * 0.35 * dpr) / dpr, r, r);
  }
  // a thin crescent moon high on the right
  const mx = w * 0.8;
  const my = h * 0.15;
  const mr = 22 * u;
  const halo = c.createRadialGradient(mx, my, mr, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(255,230,250,0.22)');
  halo.addColorStop(1, 'rgba(255,200,240,0)');
  c.fillStyle = halo;
  c.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  c.save();
  c.beginPath();
  c.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
  c.arc(mx - mr * 0.45, my - mr * 0.2, mr * 0.92, 0, TAU);
  c.clip('evenodd');
  c.fillStyle = '#fff4f8';
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  c.restore();
  // layered peaks fading into the dusk haze
  c.save();
  c.translate(-m, 0);
  const bands = ['rgba(130,80,150,0.55)', 'rgba(96,56,120,0.75)', '#4c2c62', '#321e48'];
  for (let i = 0; i < bands.length; i++) {
    const y = g0 - (150 - i * 34) * u;
    peaks(c, W, h, y, (80 - i * 12) * u, bands[i], rnd, u * (1.8 - i * 0.25));
    const mist = c.createLinearGradient(0, y - 20 * u, 0, y + 30 * u);
    mist.addColorStop(0, 'rgba(255,190,210,0)');
    mist.addColorStop(1, 'rgba(240,160,200,0.18)');
    c.fillStyle = mist;
    c.fillRect(0, y - 20 * u, W, 50 * u);
  }
  c.restore();
  // a far temple on the ridge
  pagoda(c, w * 0.62, g0 - 60 * u, 16 * u, 4, '#2c1a3c', '#24142f', 'rgba(255,200,150,0.6)');
  // the far bank
  c.fillStyle = '#20132f';
  c.beginPath();
  c.moveTo(-m, g0 - 18 * u);
  for (let x = -m; x <= w + m + 30 * u; x += 30 * u) c.lineTo(x, g0 - 18 * u - Math.sin(x * 0.01) * 6 * u - rnd() * 4 * u);
  c.lineTo(w + m, g0);
  c.lineTo(-m, g0);
  c.closePath();
  c.fill();
  // spirit blossom trees, far then near; muted so Ahri reads against them
  const far = ['#5a3466', '#7a4682', '#9a5e9c', '#c48ab8', '#f0d0e0'];
  sakura(c, w * 0.44, g0 - 16 * u, 60 * u, rnd, '#22142c', far, 0.1, '#22142c');
  sakura(c, w * 0.95, g0 - 14 * u, 70 * u, rnd, '#22142c', far, -0.2, '#22142c');
  // water
  const water = c.createLinearGradient(0, g0, 0, h);
  water.addColorStop(0, '#c87a98');
  water.addColorStop(0.25, '#6e3e7c');
  water.addColorStop(1, '#181238');
  c.fillStyle = water;
  c.fillRect(-m, g0, W, h - g0 + m);
  // reflections of the peaks and the temple
  c.save();
  c.globalAlpha = 0.22;
  c.translate(0, g0 * 2);
  c.scale(1, -1);
  c.drawImage(cv, 0, 0, cv.width, (g0 + m) * dpr, -m, -m, W, g0 + m);
  c.restore();
  c.globalAlpha = 1;
  const fog = c.createLinearGradient(0, g0, 0, h);
  fog.addColorStop(0, 'rgba(255,170,190,0.12)');
  fog.addColorStop(1, 'rgba(16,10,40,0.72)');
  c.fillStyle = fog;
  c.fillRect(-m, g0, W, h - g0 + m);
  c.strokeStyle = 'rgba(255,220,235,0.2)';
  c.lineWidth = Math.max(1 / dpr, Math.round(1.2 * u * dpr) / dpr);
  c.beginPath();
  for (let i = 0; i < 40; i++) {
    const y = Math.round((g0 + Math.pow(rnd(), 1.6) * (h - g0)) * dpr) / dpr + 0.5 / dpr;
    const x = rnd() * w;
    const l = (20 + rnd() * 80) * u * (1 + (y - g0) / (h - g0));
    c.moveTo(x, y);
    c.lineTo(x + l, y);
  }
  c.stroke();
  // near blossom trees framing the pond: darker, rosier, cleanly inked
  const near = ['#4a1e48', '#7a3466', '#a8507e', '#e4a0c0', '#fff0c8'];
  sakura(c, -w * 0.02, h * 1.02, 150 * u, rnd, '#140a18', near, 0.35, '#0e0612');
  sakura(c, w * 1.03, h * 1.04, 130 * u, rnd, '#140a18', near, -0.45, '#0e0612');
}

/* ---------- drawing helpers ---------- */

function heartPath(c: C, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.3, y, x - r * 0.9, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.3, y, x, y + r * 0.9);
  c.closePath();
}

/** A crisp inked heart with a highlight */
function heart(c: C, x: number, y: number, r: number, lw: number, alpha = 1) {
  c.globalAlpha = alpha;
  heartPath(c, x, y, r);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = lw * 2;
  c.stroke();
  c.fillStyle = '#ff4f98';
  c.fill();
  heartPath(c, x - r * 0.08, y - r * 0.1, r * 0.66);
  c.fillStyle = '#ff9cc8';
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(x - r * 0.42, y - r * 0.32, r * 0.16, r * 0.1, -0.6, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
}

/** Orb of Deception: an inked blue sphere with a white core and turning swirl */
function drawOrb(c: C, s: State, x: number, y: number, r: number, t: number, back: boolean) {
  c.globalCompositeOperation = 'lighter';
  glow(c, back ? s.white : s.blue, x, y, r * 2.6, 0.45);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.fillStyle = INK;
  c.beginPath();
  c.arc(x, y, r + Math.max(1.2, r * 0.12), 0, TAU);
  c.fill();
  c.fillStyle = back ? '#4a8cf0' : '#2a64d8';
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.fillStyle = back ? '#b8e4ff' : '#6cc4ff';
  c.beginPath();
  c.arc(x - r * 0.08, y - r * 0.1, r * 0.72, 0, TAU);
  c.fill();
  c.fillStyle = '#e6f8ff';
  c.beginPath();
  c.arc(x - r * 0.12, y - r * 0.14, r * 0.38, 0, TAU);
  c.fill();
  // swirling bands inside the orb
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(1, r * 0.13);
  c.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const a = t * 5 + k * Math.PI;
    c.beginPath();
    c.ellipse(x, y, r * 0.74, r * 0.3, a, 0, Math.PI * 0.75);
    c.stroke();
  }
  // a few sharp pink motes circling it
  c.fillStyle = '#ff9ed0';
  c.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = t * 3.4 + (k * TAU) / 3;
    const mx = x + Math.cos(a) * r * 1.6;
    const my = y + Math.sin(a) * r * 0.6;
    const mr = r * 0.16;
    c.moveTo(mx, my - mr * 1.6);
    c.lineTo(mx + mr, my);
    c.lineTo(mx, my + mr * 1.6);
    c.lineTo(mx - mr, my);
    c.closePath();
  }
  c.fill();
}

/** A fox-fire: a small blue-violet flame whose tail trails away from its motion */
function drawFire(c: C, s: State, x: number, y: number, r: number, dx: number, dy: number, t: number) {
  const a = Math.atan2(dy, dx) + Math.PI;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.violet, x, y, r * 2.4, 0.5);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.save();
  c.translate(x, y);
  c.rotate(a);
  const fl = 1 + Math.sin(t * 20 + x) * 0.12;
  const flame = (k: number, len: number) => {
    c.beginPath();
    c.moveTo(-r * k, 0);
    c.bezierCurveTo(-r * k, -r * k * 1.1, r * 0.8 * k, -r * 0.8 * k, r * len * fl, 0);
    c.bezierCurveTo(r * 0.8 * k, r * 0.8 * k, -r * k, r * k * 1.1, -r * k, 0);
  };
  c.fillStyle = '#2a1458';
  flame(1.18, 3.1);
  c.fill();
  c.fillStyle = '#8a5cff';
  flame(1, 2.8);
  c.fill();
  c.fillStyle = '#62b8ff';
  flame(0.72, 1.8);
  c.fill();
  c.fillStyle = '#f0fbff';
  c.beginPath();
  c.arc(-r * 0.15, 0, r * 0.42, 0, TAU);
  c.fill();
  c.restore();
}

function drawWisp(c: C, s: State, wi: Wisp, x: number, y: number, t: number) {
  const K = s.K;
  const r = 15 * K * (wi.born < 1 ? easeOutBack(wi.born) : 1);
  if (r <= 0.5) return;
  const charmed = wi.charm > 0;
  c.globalCompositeOperation = 'lighter';
  glow(c, charmed ? s.pink : s.cyan, x, y, r * 2.2, 0.32 + (wi.flash > 0 ? 0.4 : 0));
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  const sw = Math.sin(t * 5 + wi.seed) * r * 0.5;
  const body = (d: number) => {
    c.beginPath();
    // wavering tail
    c.moveTo(x - r * 0.8 - d, y);
    c.quadraticCurveTo(x - r * 0.6 + sw - d, y + r * 1.6, x + r * 0.2 + sw * 1.6, y + r * 2.4 + d * 1.5);
    c.quadraticCurveTo(x + r * 0.2 + sw * 0.4 + d, y + r * 1.2, x + r * 0.8 + d, y);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(x, y, r + d, 0, TAU);
    c.fill();
    c.beginPath();
    // little ears
    c.moveTo(x - r * 0.8 - d, y - r * 0.45);
    c.lineTo(x - r * 0.58, y - r * 1.28 - d * 1.4);
    c.lineTo(x - r * 0.12 + d, y - r * 0.85);
    c.closePath();
    c.moveTo(x + r * 0.8 + d, y - r * 0.45);
    c.lineTo(x + r * 0.58, y - r * 1.28 - d * 1.4);
    c.lineTo(x + r * 0.12 - d, y - r * 0.85);
    c.closePath();
    c.fill();
  };
  c.fillStyle = charmed ? '#4a0a2c' : '#0a2a3c';
  body(Math.max(1.2, 1.5 * K));
  c.fillStyle = wi.flash > 0 ? '#ffffff' : charmed ? '#f27ab4' : '#46c4e4';
  body(0);
  if (wi.flash <= 0) {
    c.fillStyle = charmed ? '#ffc4e0' : '#bff6ff';
    c.beginPath();
    c.ellipse(x - r * 0.22, y - r * 0.3, r * 0.58, r * 0.5, -0.4, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(x - r * 0.42, y - r * 0.5, r * 0.2, r * 0.12, -0.6, 0, TAU);
    c.fill();
  }
  // eyes look at Ahri; hearts when charmed
  const look = wi.x > s.x ? -1 : 1;
  const ex = x + look * r * 0.18;
  if (charmed) {
    c.fillStyle = '#e0206a';
    heartPath(c, ex - r * 0.32, y - r * 0.05, r * 0.24);
    c.fill();
    heartPath(c, ex + r * 0.32, y - r * 0.05, r * 0.24);
    c.fill();
    // the charm pops a heart over its head
    const age = 1.8 - wi.charm;
    const pop = easeOutBack(Math.min(1, age / 0.22));
    const fade = Math.min(1, wi.charm / 0.3);
    heart(c, x, y - r * 2 - Math.sin(t * 4) * 2 * K, r * 0.55 * pop, Math.max(1, 1.1 * K), fade);
  } else {
    c.fillStyle = '#0c2a38';
    c.beginPath();
    c.ellipse(ex - r * 0.3, y - r * 0.05, r * 0.11, r * 0.2, 0, 0, TAU);
    c.ellipse(ex + r * 0.3, y - r * 0.05, r * 0.11, r * 0.2, 0, 0, TAU);
    c.fill();
  }
  c.fillStyle = charmed ? 'rgba(255,90,150,0.7)' : 'rgba(255,150,190,0.6)';
  c.beginPath();
  c.ellipse(ex - r * 0.52, y + r * 0.28, r * 0.14, r * 0.08, 0, 0, TAU);
  c.ellipse(ex + r * 0.52, y + r * 0.28, r * 0.14, r * 0.08, 0, 0, TAU);
  c.fill();
}

/** A tapered ribbon through a ring buffer of points, oldest to newest, widening toward the head */
function trailRibbon(c: C, buf: Float32Array, head: number, count: number, cap: number, width: number) {
  const n = Math.min(count, cap);
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const j = (head - n + i + cap * 2) % cap;
    TX[i] = buf[j * 2];
    TY[i] = buf[j * 2 + 1];
  }
  // ribbon tapers to a point at its last index, so run it newest to oldest
  for (let i = 0; i < n >> 1; i++) {
    const a = TX[i];
    const b = TY[i];
    TX[i] = TX[n - 1 - i];
    TY[i] = TY[n - 1 - i];
    TX[n - 1 - i] = a;
    TY[n - 1 - i] = b;
  }
  ribbon(c, TX, TY, n, (q) => width * (1 - q * 0.9));
  return true;
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 1.05,
    init: (env) => {
      const petals = new Float32Array(PETALS * 6);
      for (let i = 0; i < PETALS; i++) {
        petals[i * 6] = Math.random();
        petals[i * 6 + 1] = Math.random();
        petals[i * 6 + 2] = Math.random() * TAU;
        petals[i * 6 + 3] = 0.4 + Math.random();
        petals[i * 6 + 4] = Math.random() * TAU;
        petals[i * 6 + 5] = Math.random();
      }
      const g = makeGesture();
      const s: State = {
        x: HOME_X,
        y: HOME_Y,
        vx: 0,
        vy: 0,
        face: 1,
        m: makeMover(HOME_X, HOME_Y, 1),
        g,
        ac: env.interactive ? pointerButtons(env.canvas, g) : null,
        marker: makeMarker(),
        chase: -1,
        atkCd: 0,
        buf: null,
        bufX: 0,
        bufY: 0,
        bufT: 0,
        orb: 0,
        ot: 0,
        ox: 0,
        oy: 0,
        oFromX: 0,
        oFromY: 0,
        oToX: 0,
        oToY: 0,
        oHit: 0,
        heart: { x: 0, y: 0, vx: 0, vy: 0, life: 0 },
        charmCd: 0,
        cast: 0,
        castT: 0,
        rushN: 0,
        rushWin: 0,
        rushCd: 0,
        dashT: 0,
        dashFromX: 0,
        dashFromY: 0,
        dashToX: 0,
        dashToY: 0,
        ghosts: new Float32Array(GHOSTS * 3),
        otr: new Float32Array(ORB_TRAIL * 2),
        otrN: 0,
        otrHead: 0,
        rushMax: 2.2,
        fl: new Float32Array(4),
        ghostN: 0,
        trail: 0,
        fires: 3,
        fireCd: 0,
        wisps: Array.from({ length: WISPS }, () => ({
          x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, hp: 3, flash: 0, charm: 0, alive: true, respawn: 0, born: 1, seed: 0, hit: 0,
        })),
        bolts: Array.from({ length: 16 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, target: -1, life: 0, kind: 0 })),
        pose: { ...IDLE },
        touched: false,
        idle: 0,
        still: 0,
        autoT: 0,
        autoStep: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        parts: makePool(200),
        petals,
        u: 1,
        K: 1,
        ground: 0,
        bg: null,
        pink: glowSprite(64, [
          [0, 'rgba(255,230,245,1)'],
          [0.3, 'rgba(255,100,180,0.6)'],
          [1, 'rgba(200,40,140,0)'],
        ]),
        blue: glowSprite(64, [
          [0, 'rgba(230,245,255,1)'],
          [0.3, 'rgba(100,170,255,0.55)'],
          [1, 'rgba(40,80,255,0)'],
        ]),
        white: glowSprite(48, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(255,240,250,0.4)'],
          [1, 'rgba(255,230,250,0)'],
        ]),
        violet: glowSprite(48, [
          [0, 'rgba(240,210,255,0.9)'],
          [0.35, 'rgba(170,100,255,0.4)'],
          [1, 'rgba(100,40,200,0)'],
        ]),
        warm: glowSprite(64, [
          [0, 'rgba(255,230,170,0.95)'],
          [0.35, 'rgba(255,150,80,0.35)'],
          [1, 'rgba(255,90,40,0)'],
        ]),
        cyan: glowSprite(48, [
          [0, 'rgba(230,255,255,1)'],
          [0.35, 'rgba(110,230,255,0.5)'],
          [1, 'rgba(40,160,255,0)'],
        ]),
        vignette: null,
      };
      for (let i = 0; i < WISPS; i++) resetWisp(s, s.wisps[i], true, i);
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.u = Math.min(w / (w < h ? 520 : 760), h / 560);
      s.K = s.u * 1.6;
      s.ground = h * 0.8;
      paintScene(s, env);
      const v = ctx.createRadialGradient(w * 0.45, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10,4,24,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const { w, h } = env;
      const K = s.K;
      if (s.stop > 0) {
        s.stop -= dt;
        dt *= 0.08;
      }
      stepPool(s.parts, dt);
      for (let i = 0; i < 4; i++) s.fl[i] = Math.max(0, s.fl[i] - dt);
      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.flash = Math.max(0, s.flash - dt * 2.5);
      s.charmCd = Math.max(0, s.charmCd - dt);
      s.rushCd = Math.max(0, s.rushCd - dt);
      if (s.rushWin > 0) {
        s.rushWin -= dt;
        if (s.rushWin <= 0 && s.rushN > 0) {
          s.rushN = 0;
          s.rushCd = 1.2;
          s.rushMax = 1.2;
        }
      }

      // holds run on real time, ahead of hit-stop
      const held = gestureTick(s.g);
      if (held) {
        interact(s, env);
        command(s, env, held, s.g.x, s.g.y);
      }
      s.atkCd = Math.max(0, s.atkCd - dt);
      s.marker.life = Math.max(0, s.marker.life - dt);
      if (s.bufT > 0) {
        s.bufT -= dt;
        if (!busy(s) && !(s.buf === 'q' && s.orb !== 0)) {
          const c = s.buf;
          s.buf = null;
          s.bufT = 0;
          command(s, env, c, s.bufX, s.bufY);
        }
      }

      // autopilot: orb, charm while it is out, three dashes, repeat
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 8;
      if (auto) {
        s.autoT += dt;
        const at = (i: number): [number, number] => {
          const [ax, ay] = ahriBase(s, env);
          const k = nearestWisp(s, env, ax + (i === 1 ? w * 0.5 : 0), ay - (i === 1 ? 200 : 100) * K);
          return k >= 0 ? [s.wisps[k].x * w, s.wisps[k].y * h] : [ax + w * 0.4, ay - 140 * K];
        };
        const steps: [number, () => void][] = [
          [0.3, () => castOrb(s, env, ...at(0), false)],
          [0.62, () => castCharm(s, env, ...at(1), false)],
          [1.9, () => spiritRush(s, env, w * 0.5, h * 0.3, false)],
          [2.4, () => spiritRush(s, env, w * 0.66, h * 0.62, false)],
          [2.9, () => spiritRush(s, env, w * 0.3, h * 0.5, false)],
          [4.4, () => castOrb(s, env, ...at(0), false)],
          [6.4, () => (s.autoT = 0)],
        ];
        while (s.autoStep < steps.length && s.autoT >= steps[s.autoStep][0]) {
          steps[s.autoStep][1]();
          s.autoStep++;
        }
        if (s.autoT === 0) s.autoStep = 0;
      } else {
        s.autoT = 0;
        s.autoStep = 0;
      }

      // chase a clicked wisp into range, then pelt it
      if (s.chase >= 0) {
        const wi = s.wisps[s.chase];
        if (!wi.alive) s.chase = -1;
        else if (!busy(s)) {
          const [ax, ay] = ahriBase(s, env);
          const dx = wi.x * w - ax;
          const dy = wi.y * h - (ay - 100 * K);
          const d = Math.hypot(dx, dy);
          if (d > ATK_RANGE * K) {
            const k = (d - ATK_RANGE * K * 0.8) / d;
            const [tx, ty] = flyTarget(s, env, ax + dx * k, ay - 100 * K + dy * k);
            moveTo(s.m, tx, ty);
          } else {
            halt(s.m);
            if (s.atkCd <= 0) basicAttack(s, env, s.chase);
          }
        }
      }

      // gliding: the mover drives her unless a dash has her
      if (s.dashT > 0) {
        s.m.x = s.x;
        s.m.y = s.y;
        s.m.vx = 0;
        s.m.vy = 0;
        halt(s.m);
        s.m.face = s.face;
        s.m.turn = s.face;
      } else {
        s.m.x = s.x;
        s.m.y = s.y;
        s.m.face = s.face;
        stepMover(s.m, dt, w, K, SPEED * K, ACCEL * K, 80 * K, s.cast === 2);
        s.x = s.m.x;
        s.y = Math.max(0, s.m.y);
        s.face = s.m.face;
      }

      // body pose and motion
      const pose = s.pose;
      const px = s.x;
      const py = s.y;
      if (s.dashT > 0) {
        const before = s.dashT;
        s.dashT += dt;
        const q = Math.min(1, s.dashT / DASH);
        // fast off the mark, eased into the landing
        const e = 1 - Math.pow(1 - q, 3.2);
        s.x = lerp(s.dashFromX, s.dashToX, e);
        s.y = lerp(s.dashFromY, s.dashToY, e);
        mix(pose, pose, DASHP, 1 - Math.exp(-40 * dt));
        // afterimages every few frames
        if (s.ghostN < GHOSTS && q > s.ghostN / GHOSTS) {
          s.ghosts[s.ghostN * 3] = s.x;
          s.ghosts[s.ghostN * 3 + 1] = s.y;
          s.ghosts[s.ghostN * 3 + 2] = 1;
          s.ghostN++;
        }
        const [ax, ay] = ahriBase(s, env);
        if (Math.random() < 0.5) emit(s.parts, ax + rand(-30, 30) * K, ay - rand(30, 170) * K, rand(-60, 60) * K, rand(-60, 60) * K, rand(0.5, 0.9), rand(3, 5) * K, 4, 2, 0);
        if (q >= 1 && before < DASH + 1) {
          s.dashT = 0;
          const cx = ax;
          const cy = ay - 110 * K;
          fireBolts(s, env, 3, 0, cx, cy);
          burst(s.parts, 8, cx, cy, 0, Math.PI, 260 * K, 0.35, 4 * K, 5, 5, 0);
          const bus = s.touched ? env.audio() : null;
          if (bus) {
            tone(bus, 990, { type: 'sine', attack: 0.004, decay: 0.2, gain: 0.03, glideTo: 1480 });
            tone(bus, 1480, { type: 'sine', attack: 0.004, decay: 0.2, gain: 0.02, glideTo: 1980, delay: 0.05 });
          }
          if (s.fires > 0 && s.rushN === 0) {
            fireBolts(s, env, s.fires, 1, cx, cy);
            s.fires = 0;
            s.fireCd = 2.6;
          }
          s.cast = 3;
          s.castT = 0;
        }
        if (env.reducedMotion) env.wake(500);
      } else if (s.cast > 0) {
        s.castT += dt;
        const target = s.cast === 1 ? (s.orb === 0 ? ATKP : THROWP) : s.cast === 2 ? BLOW : LANDP;
        const q = s.castT / 0.45;
        if (q < 0.28) mix(pose, pose, target, 1 - Math.exp(-36 * dt));
        else mix(pose, pose, IDLE, 1 - Math.exp(-7 * dt));
        if (q >= 1) s.cast = 0;
      } else {
        const flying = s.m.stride > 0.1;
        mix(pose, pose, flying ? FLYP : IDLE, 1 - Math.exp(-(flying ? 8 : 4) * dt));
        s.still += dt;
        if (auto && s.still > 1.8 && s.rushN === 0) {
          s.x = damp(s.x, HOME_X, 1.6, dt);
          s.y = damp(s.y, HOME_Y, 1.6, dt);
          if (Math.abs(s.x - HOME_X) > 0.01) s.face = s.x > HOME_X ? -1 : 1;
          else {
            const i = nearestWisp(s, env, w, h * 0.5);
            s.face = i < 0 || s.wisps[i].x >= s.x ? 1 : -1;
          }
        }
      }
      if (s.dashT > 0 || s.cast > 0 || s.m.going) s.still = 0;
      if (env.reducedMotion && (s.m.going || s.chase >= 0)) env.wake(400);
      s.vx = damp(s.vx, ((s.x - px) * w) / Math.max(dt, 1e-4), 10, dt);
      s.vy = damp(s.vy, ((s.y - py) * K) / Math.max(dt, 1e-4), 10, dt);
      for (let k = 0; k < GHOSTS; k++) s.ghosts[k * 3 + 2] = Math.max(0, s.ghosts[k * 3 + 2] - dt * 6);
      if (s.dashT <= 0) s.trail = Math.max(0, s.trail - dt * 5);

      // the orb: out with easing, a beat at the end, then pulled home to her hand
      rig(pose);
      const [bx, by] = ahriBase(s, env);
      const hx = bx + palmX() * K * s.face;
      const hy = by + palmY() * K;
      if (s.orb === 0) {
        s.ox = hx;
        s.oy = hy + Math.sin(t * 2.4) * 2 * K;
      } else {
        s.ot += dt;
        const ppx = s.ox;
        const ppy = s.oy;
        if (s.orb === 1) {
          const q = Math.min(1, s.ot / ORB_OUT);
          const e = easeOutCubic(q);
          s.ox = lerp(s.oFromX, s.oToX, e);
          s.oy = lerp(s.oFromY, s.oToY, e);
          if (q >= 1) {
            s.orb = 2;
            s.ot = 0;
            s.oHit = 0;
            s.oFromX = s.ox;
            s.oFromY = s.oy;
          }
        } else {
          const q = Math.min(1, s.ot / ORB_BACK);
          const e = q * q * q;
          s.ox = lerp(s.oFromX, hx, e);
          s.oy = lerp(s.oFromY, hy, e);
          if (q >= 1) {
            s.orb = 0;
            burst(s.parts, 6, hx, hy, 0, Math.PI, 180 * K, 0.3, 3.5 * K, 1, 4, 0);
            s.otrN = 0;
          }
        }
        const sp = Math.hypot(s.ox - ppx, s.oy - ppy);
        const lx = s.otr[((s.otrHead + ORB_TRAIL - 1) % ORB_TRAIL) * 2];
        const ly = s.otr[((s.otrHead + ORB_TRAIL - 1) % ORB_TRAIL) * 2 + 1];
        if (s.otrN === 0 || Math.hypot(s.ox - lx, s.oy - ly) > 7 * K) {
          s.otr[s.otrHead * 2] = s.ox;
          s.otr[s.otrHead * 2 + 1] = s.oy;
          s.otrHead = (s.otrHead + 1) % ORB_TRAIL;
          s.otrN = Math.min(ORB_TRAIL, s.otrN + 1);
        } else if (sp < 0.2 && s.otrN > 0) s.otrN--;
        for (let i = 0; i < s.wisps.length; i++) {
          const wi = s.wisps[i];
          if (!wi.alive || wi.born < 1 || s.oHit & (1 << i)) continue;
          if (Math.hypot(wi.x * w - s.ox, wi.y * h - s.oy) < 30 * K) {
            s.oHit |= 1 << i;
            hitWisp(s, env, i, 1, s.orb === 1 ? 1 : 3, true);
            if (!env.reducedMotion) s.stop = Math.max(s.stop, 0.03);
          }
        }
        if (env.reducedMotion) env.wake(400);
      }

      // the charm heart
      const hrt = s.heart;
      if (hrt.life > 0) {
        hrt.life -= dt;
        hrt.x += hrt.vx * dt;
        hrt.y += hrt.vy * dt;
        if (Math.random() < 0.25) emit(s.parts, hrt.x, hrt.y, rand(-30, 30) * K, rand(-50, -10) * K, rand(0.4, 0.6), rand(4, 6) * K, 6, 2, 0);
        for (let i = 0; i < s.wisps.length; i++) {
          const wi = s.wisps[i];
          if (!wi.alive || wi.born < 1) continue;
          if (Math.hypot(wi.x * w - hrt.x, wi.y * h - hrt.y) < 34 * K) {
            wi.charm = 1.8;
            hrt.life = 0;
            hitWisp(s, env, i, 0.5, 5, true);
            burst(s.parts, 6, wi.x * w, wi.y * h, -Math.PI / 2, 1.1, 200 * K, 0.7, 7 * K, 6, 2.5, -40 * K);
            if (s.fires > 0) {
              fireBolts(s, env, s.fires, 1, bx, by - 120 * K, i);
              s.fires = 0;
              s.fireCd = 2.6;
            }
            if (!env.reducedMotion) s.stop = Math.max(s.stop, 0.06);
            const bus = s.touched ? env.audio() : null;
            if (bus) {
              tone(bus, 784, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.05 });
              tone(bus, 1046, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.04, delay: 0.08 });
              tone(bus, 1318, { type: 'sine', attack: 0.004, decay: 0.4, gain: 0.03, delay: 0.16 });
            }
            break;
          }
        }
        if (hrt.x < -40 || hrt.x > w + 40 || hrt.y < -40 || hrt.y > h + 40) hrt.life = 0;
      }

      // fox-fires come back after a moment
      if (s.fires < 3) {
        s.fireCd -= dt;
        if (s.fireCd <= 0) {
          s.fires = 3;
          burst(s.parts, 5, bx, by - 110 * K, 0, Math.PI, 140 * K, 0.35, 3.5 * K, 1, 4, 0);
        }
      }

      // essence bolts and fox-fires home in on their targets
      for (const b of s.bolts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        let wi = s.wisps[b.target];
        if (!wi || !wi.alive) {
          const n = nearestWisp(s, env, b.x, b.y);
          if (n < 0) {
            b.life = Math.min(b.life, 0.2);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            continue;
          }
          b.target = n;
          wi = s.wisps[n];
        }
        const tx = wi.x * w;
        const ty = wi.y * h;
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = (b.kind ? 620 : 760) * K;
        const steer = (b.kind ? 7 : 9) * dt;
        b.vx += ((dx / d) * sp - b.vx) * Math.min(1, steer);
        b.vy += ((dy / d) * sp - b.vy) * Math.min(1, steer);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (d < 18 * K) {
          b.life = 0;
          hitWisp(s, env, b.target, b.kind ? 1 : 0.7, b.kind ? 1 : 5, true);
        }
      }

      // wisps drift, bob, get walked in by the charm and grow back
      for (let i = 0; i < s.wisps.length; i++) {
        const wi = s.wisps[i];
        if (!wi.alive) {
          wi.respawn -= dt;
          if (wi.respawn <= 0) resetWisp(s, wi, false, i);
          continue;
        }
        wi.flash = Math.max(0, wi.flash - dt);
        if (wi.born < 1) wi.born = Math.min(1, wi.born + dt * 2);
        if (wi.charm > 0) {
          wi.charm -= dt;
          const dx = s.x - wi.x;
          const dy = (by - 120 * K) / h - wi.y;
          wi.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.05);
          wi.y += Math.sign(dy) * Math.min(Math.abs(dy), dt * 0.04);
          if (Math.random() < 0.05) emit(s.parts, wi.x * w, wi.y * h - 20 * K, rand(-10, 10) * K, -40 * K, 0.9, 6 * K, 6, 0.5, -20 * K);
        } else {
          const tx = wi.hx + Math.sin(t * 0.4 + wi.seed) * 0.03;
          const ty = wi.hy + Math.cos(t * 0.5 + wi.seed) * 0.03;
          wi.x = damp(wi.x, tx, 1.2, dt);
          wi.y = damp(wi.y, ty, 1.2, dt);
        }
      }

      // petals on the evening breeze
      for (let i = 0; i < PETALS; i++) {
        const o = i * 6;
        s.petals[o] += dt * 0.025 * s.petals[o + 3];
        s.petals[o + 1] += dt * 0.04 * s.petals[o + 3];
        s.petals[o + 2] += dt * 2 * s.petals[o + 3];
        if (s.petals[o] > 1.05 || s.petals[o + 1] > 1.05) {
          s.petals[o] = Math.random() * 0.8 - 0.1;
          s.petals[o + 1] = -0.05;
        }
      }
      // spirit motes rising from the water
      if (Math.random() < 0.08) emit(s.parts, rand(0, w), rand(s.ground, h), rand(-8, 8) * K, rand(-40, -15) * K, rand(1.5, 3), rand(2, 4) * K, 7, 0, 0);
    },
    draw: (s, env, t) => {
      const { ctx, w, h, dpr } = env;
      const u = s.u;
      const K = s.K;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : Math.min(BG_MARGIN * u, s.shake * s.shake * 10 * u);
      ctx.save();
      ctx.translate(snap(shakeX(amp, t), dpr), snap(shakeY(amp, t), dpr));
      drawBackdrop(ctx, s.bg);

      // floating lanterns on the pond
      for (let i = 0; i < 6; i++) {
        const lx = ((i * 0.19 + t * 0.006 * (1 + (i % 3) * 0.3)) % 1.1) * w - 0.05 * w;
        const ly = s.ground + (10 + ((i * 37) % 5) * 12) * u;
        const bob = Math.sin(t * 1.4 + i) * 1.5 * u;
        const sz = (5 + ((i * 13) % 4)) * u;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.warm, lx, ly - sz * 0.6 + bob, sz * 3.4, 0.35);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd89a';
        ctx.fillRect(lx - sz, ly - sz * 1.2 + bob, sz * 2, sz * 1.2);
        ctx.fillStyle = '#5a2232';
        ctx.fillRect(lx - sz * 1.2, ly + bob, sz * 2.4, sz * 0.3);
      }

      // hanging lanterns on the near tree branches
      for (let i = 0; i < 3; i++) {
        const lx = [0.07, 0.15, 0.93][i] * w;
        const ly = [0.12, 0.3, 0.2][i] * h;
        const sway = Math.sin(t * 1.1 + i * 2) * 0.06;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.warm, lx - Math.sin(sway) * 14 * u, ly + 14 * u, 24 * u, 0.45);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(sway);
        lantern(ctx, 11 * u, '#ff9a6a', '#8a2a3a', '#2a1020');
        ctx.restore();
      }

      const [bx, by] = ahriBase(s, env);
      // ripples and a soft glow on the water under her
      {
        const hgt = s.ground - by;
        const near = Math.max(0, 1 - hgt / (200 * K));
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.pink, bx, s.ground + 4 * K, 60 * K, 0.22 * near + 0.05);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1, 1.4 * u);
        for (let k = 0; k < 3; k++) {
          const q = (t * 0.5 + k / 3) % 1;
          ctx.strokeStyle = `rgba(255,220,240,${((1 - q) * 0.45 * (0.3 + near)).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(bx, s.ground + 6 * K, (20 + q * 100) * K, (4 + q * 16) * K, 0, 0, TAU);
          ctx.stroke();
        }
      }

      // wisps
      for (let i = 0; i < s.wisps.length; i++) {
        const wi = s.wisps[i];
        if (!wi.alive) continue;
        const [x, y] = wispScreen(s, env, wi, t);
        drawWisp(ctx, s, wi, x, y, t);
      }

      const hover = Math.sin(t * 1.6) * 4 * K;
      // Spirit Rush: a short crisp streak along the dash, pointed at the start
      if (s.trail > 0.02) {
        const x0 = s.dashFromX * w;
        const y0 = s.ground - (18 + s.dashFromY) * K - 100 * K;
        const x1 = s.x * w;
        const y1 = s.ground - (18 + s.y) * K - 100 * K + hover;
        const d = Math.hypot(x1 - x0, y1 - y0);
        if (d > 4) {
          const a = s.trail;
          const nx = -(y1 - y0) / d;
          const ny = (x1 - x0) / d;
          const streak = (wd: number, col: string) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo(lerp(x0, x1, 0.7) + nx * wd, lerp(y0, y1, 0.7) + ny * wd, x1 + nx * wd * 0.5, y1 + ny * wd * 0.5);
            ctx.lineTo(x1 - nx * wd * 0.5, y1 - ny * wd * 0.5);
            ctx.quadraticCurveTo(lerp(x0, x1, 0.7) - nx * wd, lerp(y0, y1, 0.7) - ny * wd, x0, y0);
            ctx.fill();
          };
          ctx.globalAlpha = a;
          streak(26 * K, 'rgba(176,96,230,0.45)');
          streak(14 * K, 'rgba(255,140,205,0.75)');
          streak(4 * K, '#fff4fa');
          ctx.globalAlpha = 1;
        }
      }

      // Spirit Rush afterimages: a few flat silhouettes that fade fast
      for (let k = 0; k < GHOSTS; k++) {
        const a = s.ghosts[k * 3 + 2];
        if (a <= 0.02) continue;
        const gx = s.ghosts[k * 3] * w;
        const gy = s.ground - (18 + s.ghosts[k * 3 + 1]) * K;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(K * s.face, K);
        ctx.globalAlpha = a * 0.35;
        ahri(ctx, t, s.pose, k % 2 ? '#ff7ac4' : '#b080ff', (s.vx * s.face) / Math.max(0.001, K), s.vy, 1.3);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // the orb's path: blue going out, white and pink coming back
      if (s.orb !== 0 && s.otrN > 2) {
        const r = 10 * K * 1.2;
        const back = s.orb === 2;
        ctx.fillStyle = back ? 'rgba(255,150,210,0.5)' : 'rgba(70,150,255,0.5)';
        if (trailRibbon(ctx, s.otr, s.otrHead, s.otrN, ORB_TRAIL, r * 0.95)) ctx.fill();
        ctx.fillStyle = back ? '#ffffff' : '#bfe6ff';
        if (trailRibbon(ctx, s.otr, s.otrHead, s.otrN, ORB_TRAIL, r * 0.35)) ctx.fill();
      }

      drawMarker(ctx, s.marker, K);
      const hovered = env.pointer.inside ? pickWisp(s, env, env.pointer.x, env.pointer.y) : -1;
      for (const i of [s.chase, hovered]) {
        if (i < 0 || !s.wisps[i].alive) continue;
        const [x, y] = wispScreen(s, env, s.wisps[i], t);
        ctx.strokeStyle = i === s.chase ? 'rgba(255,90,150,0.9)' : 'rgba(255,140,190,0.6)';
        ctx.lineWidth = Math.max(1.5, 2 * K);
        ctx.beginPath();
        ctx.arc(x, y, 26 * K, 0, TAU);
        ctx.stroke();
      }

      // fox-fires behind her
      const fires = (front: boolean) => {
        for (let k = 0; k < s.fires; k++) {
          const a = t * 2.4 + (k * TAU) / 3;
          if (Math.sin(a) >= 0 !== front) continue;
          const fx = bx + Math.cos(a) * 70 * K;
          const fy = by + hover - 110 * K + Math.sin(a) * 24 * K;
          drawFire(ctx, s, fx, fy, (front ? 6.5 : 5.5) * K, -Math.sin(a), Math.cos(a) * 0.4, t);
        }
      };
      fires(false);

      // Ahri: inked outline, a warm rose rim from the sunset, then the figure
      const ts = turnScale(s.m);
      const lagX = (s.vx * s.face) / Math.max(0.001, K);
      const lagY = s.vy;
      const blink = t % 4.2 > 4.05 ? 1 : 0;
      ctx.save();
      ctx.translate(bx, by + hover);
      ctx.scale(K * ts, K);
      inked(ctx, (flat) => ahri(ctx, t, s.pose, flat, lagX, lagY, 1.3, flat ? 0 : blink), INK, 1.5, '#ffb2d4', -1.5, -1);
      ctx.restore();

      fires(true);

      // orb
      rig(s.pose);
      const orbR = 10 * K;
      if (s.orb === 0) drawOrb(ctx, s, bx + palmX() * K * ts, by + hover + palmY() * K, orbR, t, false);
      else drawOrb(ctx, s, s.ox, s.oy, orbR * 1.2, t, s.orb === 2);

      // charm heart
      if (s.heart.life > 0) {
        const r = 13 * K * (1 + Math.sin(t * 16) * 0.06);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.pink, s.heart.x, s.heart.y, r * 2.4, 0.45);
        ctx.globalCompositeOperation = 'source-over';
        heart(ctx, s.heart.x, s.heart.y, r, Math.max(1, 1.4 * K));
      }

      // essence bolts: pink darts with a short streak; fox-fires
      for (const b of s.bolts) {
        if (b.life <= 0) continue;
        if (b.kind) {
          drawFire(ctx, s, b.x, b.y, 6.5 * K, b.vx, b.vy, t);
          continue;
        }
        const v = Math.hypot(b.vx, b.vy) || 1;
        const dx = b.vx / v;
        const dy = b.vy / v;
        const L = 20 * K;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,110,190,0.75)';
        ctx.lineWidth = 5 * K;
        ctx.beginPath();
        ctx.moveTo(b.x - dx * L, b.y - dy * L);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#fff4fa';
        ctx.lineWidth = 2 * K;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.4 * K, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ff8ccc';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.4 * K, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 1.7 * K, 0, TAU);
        ctx.fill();
      }

      // particles, all small solid shapes: 1 blue, 3 white, 4 petals, 5 pink, 6 hearts, 7 motes
      for (const p of s.parts.items) {
        if (p.life <= 0) continue;
        const q = p.life / p.max;
        if (p.kind === 4) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, q * 2);
          petal(ctx, p.size, '#ffb0d4');
          ctx.restore();
        } else if (p.kind === 6) {
          ctx.globalAlpha = Math.min(1, q * 2);
          ctx.fillStyle = '#ff5aa0';
          heartPath(ctx, p.x, p.y, p.size * 0.6);
          ctx.fill();
        } else if (p.kind === 7) {
          ctx.globalAlpha = Math.sin(q * Math.PI) * 0.7;
          ctx.fillStyle = '#bff4ff';
          const r = Math.max(1, p.size * 0.35);
          ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
        } else {
          // a four point spark shrinking along its life
          ctx.globalAlpha = Math.min(1, q * 1.6);
          ctx.fillStyle = p.kind === 1 ? '#7cc8ff' : p.kind === 3 ? '#ffffff' : '#ff8cc8';
          const r = p.size * (0.4 + q * 0.6);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r);
          ctx.lineTo(p.x + r * 0.28, p.y);
          ctx.lineTo(p.x, p.y + r);
          ctx.lineTo(p.x - r * 0.28, p.y);
          ctx.closePath();
          ctx.moveTo(p.x - r, p.y);
          ctx.lineTo(p.x, p.y - r * 0.28);
          ctx.lineTo(p.x + r, p.y);
          ctx.lineTo(p.x, p.y + r * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // falling petals in front
      for (let i = 0; i < PETALS; i++) {
        const o = i * 6;
        const px = s.petals[o] * w + Math.sin(t * 1.2 + s.petals[o + 4]) * 18 * u;
        const py = s.petals[o + 1] * h;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(s.petals[o + 2]);
        ctx.scale(1, 0.4 + Math.abs(Math.sin(s.petals[o + 2] * 1.3)) * 0.6);
        petal(ctx, (2.5 + s.petals[o + 5] * 3) * u, s.petals[o + 5] > 0.5 ? '#ffc0dc' : '#f08ab8');
        ctx.restore();
      }
      drawHoldRing(ctx, s.g, u, '255,140,200');
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,200,${(s.flash * 0.18).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }

      // Q W E R
      if (env.interactive) {
        const k = clamp(u * 1.15, 0.9, 1.25);
        const out = s.orb !== 0;
        const rushOpen = s.rushWin > 0 && s.rushN > 0;
        BAR[0].lit = out;
        BAR[1].cd = s.fires < 3 ? Math.max(0, s.fireCd) : 0;
        BAR[2].cd = s.charmCd;
        BAR[3].cd = s.rushCd;
        BAR[3].max = s.rushMax;
        BAR[3].lit = rushOpen;
        BAR[3].pips = rushOpen ? s.rushN : 3;
        drawAbilityBar(ctx, w / 2, h - 30 * k - Math.max(16, 22 * k), k, BAR, s.fl);
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
      freeCanvas(s.bg, s.pink, s.blue, s.white, s.violet, s.warm, s.cyan);
      s.bg = null;
    },
  });
