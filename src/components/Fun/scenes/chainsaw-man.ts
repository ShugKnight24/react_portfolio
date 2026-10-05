import { createCanvasScene, clamp, damp, easeOutBack, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  burst,
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
import {
  BLOOD_DEEP,
  BLOOD_RED,
  CUT,
  LAND,
  OVERHEAD,
  REV,
  STANCE,
  blendPose,
  bladeTip,
  drawBlood,
  drawDenji,
  makeLook,
  stepLook,
} from './csm-kit';
import type { DenjiLook } from './csm-kit';

/**
 * Chainsaw Man vs the Bat Devil in a rain-slick alley at night. Denji, transformed, faces a
 * huge bat devil hovering over the street: leathery wings raised, tall ears, a nose leaf and a
 * grin full of fangs. Holding revs his saws (the chains blur, sparks and smoke pour off the
 * bars); every few seconds the devil dives to bite, and a revved guard knocks it back with a
 * spray of its blood while an idle Denji gets thrown across the wet ground. Letting go leaps
 * him up over his head with both saws and carves straight down: a weak rev leaves a gash and
 * a shriek, a full rev saws the devil in half top to bottom in a fountain of blood. Another
 * one flaps down out of the rain a moment later. The figure comes from csm-kit; the alley is
 * baked once per resize and the devil is posed live every frame.
 */

interface Gash {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  on: boolean;
}

interface State {
  // Denji
  look: DenjiLook;
  x: number;
  air: number;
  home: number;
  phase: number; // 0 ready, 1 leap, 2 carve down, 3 land, 4 hop back
  pt: number;
  from: number;
  to: number;
  airFrom: number;
  power: number;
  kill: boolean;
  held: boolean;
  touched: boolean;
  idle: number;
  autoT: number;
  autoRev: number;
  push: number;
  hurt: number;
  ghostT: number;
  ghosts: Float32Array;
  exhaust: number;
  carve: number;
  // the Bat Devil
  bx: number;
  bhome: number;
  hover: number;
  bState: number; // 0 alive, 1 sawn apart, 2 flying in
  bT: number;
  flap: number;
  hp: number;
  recoil: number;
  jaw: number;
  atk: number; // 0 idle, 1 wind up, 2 dive, 3 pull back
  atkT: number;
  atkK: number;
  atkNext: number;
  hitDone: boolean;
  screech: number;
  cutX: number;
  gashes: Gash[];
  // fx
  parts: Pool;
  splats: { x: number; w: number; life: number }[];
  slash: number;
  slashX: number;
  slashY0: number;
  slashY1: number;
  stop: number;
  shake: number;
  flash: number;
  rain: Float32Array;
  hum: Hum | null;
  // layout
  u: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  /** Scratch layer for the sawn halves */
  fxl: HTMLCanvasElement | null;
  orange: HTMLCanvasElement;
  neon: HTMLCanvasElement;
  white: HTMLCanvasElement;
  eye: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

type C = CanvasRenderingContext2D;

const MAX_PARTS = 640;
const RAIN = 130;
const GHOSTS = 4;
const J = new Array<number>(22).fill(0);
const TMP = new Array<number>(22).fill(0);
const TIP = [0, 0, 0];

// particle kinds
const SPARK = 0;
const BLOOD = 1;
const SMOKE = 2;
const DUST = 3;

/* ---------- the Bat Devil (local units, ground origin, facing right; drawn mirrored) ---------- */

const FUR = ['#140c0b', '#2c1a17', '#4b2f27', '#76503f'];
const FACE = ['#3d2622', '#6e4d45', '#9a7268', '#c49a8c'];
const WING_BONE = '#1a0f0e';
/** The devil is drawn this much larger than its local units */
const BS = 1.2;

/** Furry outline: an ellipse with a ragged edge */
function furBlob(c: C, x: number, y: number, rx: number, ry: number, rot: number, seed: number) {
  c.beginPath();
  const n = 34;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const tuft = i % 2 ? 1 : 0.9 + 0.06 * Math.sin(seed + i * 1.7);
    const px = Math.cos(a) * rx * tuft;
    const py = Math.sin(a) * ry * tuft;
    const X = x + px * Math.cos(rot) - py * Math.sin(rot);
    const Y = y + px * Math.sin(rot) + py * Math.cos(rot);
    if (i === 0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.closePath();
}

const WP = new Array<number>(20).fill(0);

/** A membrane wing from the shoulder: arm, wrist and four long fingers with scalloped skin */
function wing(c: C, sx: number, sy: number, base: number, spread: number, scale: number, far: boolean, flat: string | null) {
  const ex = sx + Math.cos(base) * 92 * scale;
  const ey = sy + Math.sin(base) * 92 * scale;
  const wa = base + 0.32;
  const wx = ex + Math.cos(wa) * 112 * scale;
  const wy = ey + Math.sin(wa) * 112 * scale;
  const lens = [200, 225, 196, 160];
  for (let i = 0; i < 4; i++) {
    const a = base - 0.05 - i * (0.42 + spread * 0.12);
    WP[i * 2] = wx + Math.cos(a) * lens[i] * scale;
    WP[i * 2 + 1] = wy + Math.sin(a) * lens[i] * scale;
  }
  // trailing edge meets the flank
  const hx = sx - 46;
  const hy = sy + 120;
  // membrane
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(ex, ey);
  c.lineTo(wx, wy);
  c.lineTo(WP[0], WP[1]);
  let px = WP[0];
  let py = WP[1];
  for (let i = 1; i <= 4; i++) {
    const nx = i < 4 ? WP[i * 2] : hx;
    const ny = i < 4 ? WP[i * 2 + 1] : hy;
    const mx = (px + nx) / 2;
    const my = (py + ny) / 2;
    c.quadraticCurveTo(lerp(mx, wx, 0.32), lerp(my, wy, 0.32), nx, ny);
    px = nx;
    py = ny;
  }
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = flat;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.lineTo(wx, wy);
    c.stroke();
    return;
  }
  const g = c.createRadialGradient(wx, wy, 10, wx, wy, 260 * scale);
  if (far) {
    g.addColorStop(0, 'rgba(70,28,30,0.96)');
    g.addColorStop(1, 'rgba(26,10,14,0.92)');
  } else {
    g.addColorStop(0, 'rgba(120,46,42,0.93)');
    g.addColorStop(0.6, 'rgba(72,26,28,0.9)');
    g.addColorStop(1, 'rgba(36,12,16,0.88)');
  }
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = '#0a0506';
  c.lineWidth = 2.4;
  c.stroke();
  // veins fanning from the wrist
  c.save();
  c.clip();
  c.strokeStyle = far ? 'rgba(120,50,50,0.25)' : 'rgba(170,70,64,0.35)';
  c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const tx = WP[i * 2];
    const ty = WP[i * 2 + 1];
    for (let k = 1; k < 3; k++) {
      const a = k * 0.33;
      c.moveTo(lerp(wx, tx, a), lerp(wy, ty, a));
      c.quadraticCurveTo(lerp(wx, tx, a) + 20, lerp(wy, ty, a) + 30, lerp(wx, hx, a + 0.2), lerp(wy, hy, a + 0.2));
    }
  }
  c.stroke();
  c.restore();
  // bones
  c.lineCap = 'round';
  c.strokeStyle = WING_BONE;
  c.lineWidth = 11 * scale;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(ex, ey);
  c.lineTo(wx, wy);
  c.stroke();
  c.strokeStyle = far ? '#3a2522' : '#5a3a33';
  c.lineWidth = 4 * scale;
  c.stroke();
  c.strokeStyle = WING_BONE;
  c.lineWidth = 4.5 * scale;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    c.moveTo(wx, wy);
    c.lineTo(WP[i * 2], WP[i * 2 + 1]);
  }
  c.stroke();
  // thumb claw
  c.fillStyle = '#d8cbb8';
  c.strokeStyle = '#0a0506';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(wx - 5, wy);
  c.quadraticCurveTo(wx - 4, wy - 20, wx + 12, wy - 26);
  c.quadraticCurveTo(wx + 2, wy - 14, wx + 5, wy + 2);
  c.closePath();
  c.fill();
  c.stroke();
  // elbow knuckle
  c.fillStyle = far ? '#2a1a18' : '#4b2f27';
  c.beginPath();
  c.arc(ex, ey, 8 * scale, 0, TAU);
  c.fill();
  c.stroke();
}

function batLeg(c: C, hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, dark: boolean, flat: string | null) {
  c.lineCap = 'round';
  c.strokeStyle = flat ?? '#0a0506';
  c.lineWidth = 20;
  c.beginPath();
  c.moveTo(hx, hy);
  c.lineTo(kx, ky);
  c.lineTo(fx, fy);
  c.stroke();
  if (flat) return;
  c.strokeStyle = dark ? FUR[1] : FUR[2];
  c.lineWidth = 15;
  c.stroke();
  // hooked talons
  c.fillStyle = '#e4d6c0';
  c.strokeStyle = '#0a0506';
  c.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 0.5;
    const bx = fx + Math.cos(a) * 6;
    const by = fy + Math.sin(a) * 6;
    c.beginPath();
    c.moveTo(bx - 3, by);
    c.quadraticCurveTo(bx + Math.cos(a) * 18, by + Math.sin(a) * 18, bx + Math.cos(a + 1.2) * 10 + Math.cos(a) * 14, by + Math.sin(a + 1.2) * 10 + Math.sin(a) * 14);
    c.quadraticCurveTo(bx + Math.cos(a) * 8, by + Math.sin(a) * 8, bx + 3, by);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

function ear(c: C, bx: number, by: number, w: number, tx: number, ty: number, dark: boolean, flat: string | null) {
  c.beginPath();
  c.moveTo(bx - w, by);
  c.quadraticCurveTo(bx - w * 0.9, (by + ty) / 2, tx, ty);
  c.quadraticCurveTo(bx + w * 1.1, by - (by - ty) * 0.35, bx + w, by + 6);
  c.closePath();
  c.fillStyle = flat ?? (dark ? FUR[1] : FUR[2]);
  c.fill();
  if (flat) return;
  c.strokeStyle = '#0a0506';
  c.lineWidth = 2.4;
  c.stroke();
  // pink inner ear with ridges
  c.beginPath();
  c.moveTo(bx - w * 0.55, by - 4);
  c.quadraticCurveTo(bx - w * 0.5, (by + ty) / 2, lerp(bx, tx, 0.85), lerp(by, ty, 0.85));
  c.quadraticCurveTo(bx + w * 0.6, by - (by - ty) * 0.3, bx + w * 0.5, by);
  c.closePath();
  c.fillStyle = dark ? '#4a2224' : '#8a4a48';
  c.fill();
  c.strokeStyle = 'rgba(30,8,10,0.6)';
  c.lineWidth = 1.4;
  c.beginPath();
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    c.moveTo(lerp(bx - w * 0.4, tx, k * 0.8), lerp(by, ty, k * 0.8));
    c.lineTo(lerp(bx + w * 0.4, tx, k * 0.8), lerp(by, ty, k * 0.8) + 6);
  }
  c.stroke();
}

/** The whole devil, facing right, flap in radians, jaw 0..1 */
function bat(c: C, s: State, flap: number, jaw: number, t: number, flat: string | null) {
  const f = Math.sin(flap);
  const spread = 0.5 + 0.5 * Math.sin(flap + 0.6);
  c.lineJoin = 'round';
  // far wing and far leg behind everything
  wing(c, -16, -256, -2.75 + f * 0.4, spread, 1.05, true, flat);
  batLeg(c, -22, -150, -48, -104, -30, -60, true, flat);
  // body: hunched furry barrel leaning toward the prey
  furBlob(c, -6, -196, 64, 88, 0.22, 1);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(40, -300, -60, -120);
    g.addColorStop(0, FUR[3]);
    g.addColorStop(0.35, FUR[2]);
    g.addColorStop(1, FUR[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#0a0506';
    c.lineWidth = 2.6;
    c.stroke();
    // pale chest ruff
    furBlob(c, 30, -222, 34, 50, 0.25, 4);
    c.fillStyle = 'rgba(150,108,88,0.55)';
    c.fill();
    // fur strokes
    c.strokeStyle = 'rgba(10,5,6,0.55)';
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = 0.3 + i * 0.45;
      const x = -6 + Math.cos(a) * 46;
      const y = -196 + Math.sin(a) * 64;
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a + 0.4) * 10, y + Math.sin(a + 0.4) * 14);
    }
    c.stroke();
    // wounds from earlier cuts
    for (const gsh of s.gashes) {
      if (!gsh.on) continue;
      const ga = Math.atan2(gsh.y1 - gsh.y0, gsh.x1 - gsh.x0);
      const gl = Math.hypot(gsh.x1 - gsh.x0, gsh.y1 - gsh.y0);
      c.save();
      c.translate(gsh.x0, gsh.y0);
      c.rotate(ga);
      for (const [wd, col] of [
        [11, '#1c0104'],
        [7, BLOOD_RED],
        [2.4, 'rgba(255,150,130,0.85)'],
      ] as const) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(gl * 0.35, -wd, gl * 0.5, -wd * 0.6);
        c.quadraticCurveTo(gl * 0.7, -wd * 0.9, gl, 0);
        c.quadraticCurveTo(gl * 0.6, wd * 0.8, gl * 0.45, wd * 0.5);
        c.quadraticCurveTo(gl * 0.3, wd, 0, 0);
        c.closePath();
        c.fill();
      }
      c.restore();
      c.strokeStyle = BLOOD_RED;
      c.lineCap = 'round';
      c.lineWidth = 2.6;
      c.beginPath();
      for (let i = 1; i < 5; i++) {
        const x = lerp(gsh.x0, gsh.x1, i / 5);
        const y = lerp(gsh.y0, gsh.y1, i / 5) + 4;
        c.moveTo(x, y);
        c.lineTo(x + 0.5, y + 8 + ((i * 7) % 5) * 4 + Math.sin(t * 2 + i) * 2);
      }
      c.stroke();
    }
  }
  // near leg dangling, talons hooked
  batLeg(c, 6, -140, -12, -96, 8, -52, false, flat);

  // near wing over the body, under the head
  wing(c, -4, -250, -1.95 + f * 0.45, spread, 0.9, false, flat);

  // head: tall ears, wrinkled snout with a nose leaf, a grin of fangs
  const hx = 64;
  const hy = -284;
  ear(c, hx - 34, hy - 30, 20, hx - 62, hy - 112, true, flat);
  ear(c, hx - 4, hy - 38, 22, hx + 6, hy - 124, false, flat);
  furBlob(c, hx - 8, hy, 54, 46, 0.1, 7);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(hx, hy - 50, hx - 20, hy + 40);
    g.addColorStop(0, FUR[3]);
    g.addColorStop(0.5, FUR[2]);
    g.addColorStop(1, FUR[1]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#0a0506';
    c.lineWidth = 2.6;
    c.stroke();
  }
  // lower jaw drops open
  const jo = jaw * 34;
  c.beginPath();
  c.moveTo(hx + 2, hy + 18);
  c.quadraticCurveTo(hx + 30, hy + 26 + jo * 1.1, hx + 58, hy + 22 + jo);
  c.quadraticCurveTo(hx + 50, hy + 40 + jo, hx + 18, hy + 42 + jo * 0.6);
  c.quadraticCurveTo(hx - 4, hy + 38, hx + 2, hy + 18);
  c.closePath();
  c.fillStyle = flat ?? FACE[1];
  c.fill();
  if (!flat) {
    c.strokeStyle = '#0a0506';
    c.lineWidth = 2.2;
    c.stroke();
  }
  // face and snout
  c.beginPath();
  c.moveTo(hx + 4, hy - 30);
  c.quadraticCurveTo(hx + 40, hy - 40, hx + 56, hy - 14);
  c.quadraticCurveTo(hx + 66, hy - 2, hx + 62, hy + 12);
  c.quadraticCurveTo(hx + 60, hy + 22, hx + 48, hy + 22);
  c.lineTo(hx + 4, hy + 18);
  c.quadraticCurveTo(hx - 8, hy - 4, hx + 4, hy - 30);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    return;
  }
  const fg = c.createLinearGradient(hx + 50, hy - 30, hx, hy + 20);
  fg.addColorStop(0, FACE[3]);
  fg.addColorStop(0.4, FACE[2]);
  fg.addColorStop(1, FACE[0]);
  c.fillStyle = fg;
  c.fill();
  c.strokeStyle = '#0a0506';
  c.lineWidth = 2.4;
  c.stroke();
  // wrinkles over the snout
  c.strokeStyle = 'rgba(40,20,18,0.7)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    c.moveTo(hx + 30 + i * 5, hy - 26 + i * 4);
    c.quadraticCurveTo(hx + 38 + i * 5, hy - 20 + i * 4, hx + 36 + i * 6, hy - 10 + i * 4);
  }
  c.stroke();
  // nose leaf
  c.beginPath();
  c.moveTo(hx + 54, hy + 2);
  c.quadraticCurveTo(hx + 46, hy - 16, hx + 58, hy - 34);
  c.quadraticCurveTo(hx + 70, hy - 16, hx + 64, hy + 2);
  c.closePath();
  c.fillStyle = FACE[2];
  c.fill();
  c.stroke();
  c.fillStyle = '#1a0a0a';
  c.beginPath();
  c.ellipse(hx + 57, hy + 6, 3, 2, 0.4, 0, TAU);
  c.ellipse(hx + 63, hy + 5, 2.2, 1.6, 0.4, 0, TAU);
  c.fill();
  // mouth interior when open
  if (jo > 2) {
    c.fillStyle = '#3a0408';
    c.beginPath();
    c.moveTo(hx + 6, hy + 18);
    c.lineTo(hx + 52, hy + 20);
    c.quadraticCurveTo(hx + 48, hy + 20 + jo, hx + 20, hy + 28 + jo * 0.6);
    c.closePath();
    c.fill();
    c.fillStyle = '#8a1a24';
    c.beginPath();
    c.ellipse(hx + 26, hy + 24 + jo * 0.4, 14, 3 + jo * 0.12, 0.1, 0, TAU);
    c.fill();
  }
  // teeth: a row of small needles and four long fangs
  c.fillStyle = '#f4eadb';
  c.strokeStyle = '#0a0506';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = hx + 8 + i * 5;
    const long = i === 6 || i === 2;
    const L = long ? 17 : 6 + (i % 2) * 2;
    c.moveTo(x, hy + 17 + i * 0.3);
    c.lineTo(x + 2.4, hy + 17 + L);
    c.lineTo(x + 4.8, hy + 17.5 + i * 0.3);
    const ly = hy + 24 + jo * (0.6 + i * 0.05);
    const lL = long ? 13 : 5;
    c.moveTo(x + 1, ly + 2);
    c.lineTo(x + 3.4, ly - lL);
    c.lineTo(x + 5.8, ly + 2);
  }
  c.fill();
  c.stroke();
  // eyes: sunk in dark sockets, a red glint
  c.fillStyle = '#120708';
  c.beginPath();
  c.ellipse(hx + 26, hy - 14, 10, 7, -0.2, 0, TAU);
  c.ellipse(hx + 50, hy - 18, 6, 5, -0.2, 0, TAU);
  c.fill();
  c.fillStyle = '#ff3a20';
  c.beginPath();
  c.arc(hx + 28, hy - 14, 3.6, 0, TAU);
  c.arc(hx + 51, hy - 18, 2.4, 0, TAU);
  c.fill();
  c.fillStyle = '#fff0c8';
  c.beginPath();
  c.arc(hx + 29, hy - 15, 1.2, 0, TAU);
  c.fill();
  // brow ridge scowl
  c.strokeStyle = '#0a0506';
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(hx + 12, hy - 24);
  c.quadraticCurveTo(hx + 30, hy - 20, hx + 40, hy - 28);
  c.stroke();

}

/* ---------- alley ---------- */

function paintAlley(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const u = s.u;
  const gy = s.gy;
  const vx = w * 0.56;
  const vy = gy - 150 * u;
  const rnd = mulberry(4);
  // sky slit and the lit street at the far end
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#05040a');
  sky.addColorStop(0.5, '#120d1c');
  sky.addColorStop(1, '#1a0f14');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const street = c.createRadialGradient(vx, vy, 0, vx, vy, 260 * u);
  street.addColorStop(0, 'rgba(255,170,90,0.75)');
  street.addColorStop(0.3, 'rgba(230,110,60,0.3)');
  street.addColorStop(1, 'rgba(120,40,40,0)');
  c.fillStyle = street;
  c.fillRect(0, 0, w, h);
  // far buildings across the street
  c.fillStyle = '#140c14';
  for (let x = vx - 120 * u; x < vx + 120 * u; ) {
    const bw = (18 + rnd() * 26) * u;
    const top = vy - (40 + rnd() * 90) * u;
    c.fillRect(x, top, bw, vy - top + 40 * u);
    c.fillStyle = 'rgba(255,200,120,0.5)';
    for (let wy = top + 6 * u; wy < vy; wy += 9 * u) {
      if (rnd() < 0.3) c.fillRect(x + rnd() * (bw - 4 * u), wy, 2.5 * u, 3 * u);
    }
    c.fillStyle = '#140c14';
    x += bw + 2 * u;
  }
  // walls: left and right, converging on the far end
  const wall = (side: number) => {
    const x0 = side < 0 ? 0 : w;
    const x1 = vx + side * 110 * u;
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, side < 0 ? '#1d1117' : '#170f1c');
    g.addColorStop(1, '#2a1a1c');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, -10);
    c.lineTo(x1, vy - 220 * u);
    c.lineTo(x1, vy + 38 * u);
    c.lineTo(x0, gy + 60 * u);
    c.closePath();
    c.fill();
    // brick courses in perspective
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 40; i++) {
      const k = i / 40;
      const ya = lerp(-10, gy + 60 * u, k);
      const yb = lerp(vy - 220 * u, vy + 38 * u, k);
      c.moveTo(x0, ya);
      c.lineTo(x1, yb);
    }
    c.stroke();
    // windows with a few warm lights, fire escape rails
    for (let i = 0; i < 4; i++) {
      const k0 = 0.12 + i * 0.2;
      const k1 = k0 + 0.1;
      const xa = lerp(x0, x1, k0);
      const xb = lerp(x0, x1, k1);
      const t0a = lerp(60 * u, vy - 180 * u, k0);
      const t0b = lerp(60 * u, vy - 180 * u, k1);
      const hA = lerp(120 * u, 34 * u, k0);
      const hB = lerp(120 * u, 34 * u, k1);
      const lit = rnd() < 0.45;
      c.fillStyle = lit ? 'rgba(255,170,90,0.55)' : '#0b070c';
      c.beginPath();
      c.moveTo(xa, t0a);
      c.lineTo(xb, t0b);
      c.lineTo(xb, t0b + hB);
      c.lineTo(xa, t0a + hA);
      c.closePath();
      c.fill();
      c.strokeStyle = '#0a070c';
      c.lineWidth = 2 * u * (1 - k0 * 0.7);
      c.beginPath();
      c.moveTo(xa - side * 8 * u, t0a + hA + 8 * u);
      c.lineTo(xb - side * 4 * u, t0b + hB + 4 * u);
      c.moveTo(xa - side * 8 * u, t0a + hA - 10 * u);
      c.lineTo(xb - side * 4 * u, t0b + hB - 6 * u);
      c.stroke();
    }
  };
  wall(-1);
  wall(1);
  // hanging wires across the gap
  c.strokeStyle = 'rgba(0,0,0,0.8)';
  c.lineWidth = 1.4 * u;
  for (let i = 0; i < 3; i++) {
    const y = (40 + i * 38) * u;
    c.beginPath();
    c.moveTo(0, y);
    c.quadraticCurveTo(w * 0.5, y + 50 * u, w, y + 10 * u);
    c.stroke();
  }
  // wet ground
  const gnd = c.createLinearGradient(0, vy, 0, h);
  gnd.addColorStop(0, '#231417');
  gnd.addColorStop(0.3, '#120b10');
  gnd.addColorStop(1, '#07050a');
  c.fillStyle = gnd;
  c.beginPath();
  c.moveTo(vx - 110 * u, vy + 38 * u);
  c.lineTo(vx + 110 * u, vy + 38 * u);
  c.lineTo(w, gy + 60 * u);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.lineTo(0, gy + 60 * u);
  c.closePath();
  c.fill();
  // street light reflected down the wet middle
  const refl = c.createLinearGradient(0, vy + 38 * u, 0, h);
  refl.addColorStop(0, 'rgba(255,160,90,0.4)');
  refl.addColorStop(1, 'rgba(255,120,70,0)');
  c.fillStyle = refl;
  c.beginPath();
  c.moveTo(vx - 30 * u, vy + 38 * u);
  c.lineTo(vx + 30 * u, vy + 38 * u);
  c.lineTo(vx + 160 * u, h);
  c.lineTo(vx - 160 * u, h);
  c.closePath();
  c.fill();
  // puddles
  for (let i = 0; i < 6; i++) {
    const px = rnd() * w;
    const py = gy + (4 + rnd() * 60) * u;
    const pw = (40 + rnd() * 90) * u;
    c.fillStyle = 'rgba(255,120,160,0.08)';
    c.beginPath();
    c.ellipse(px, py, pw, pw * 0.12, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,200,220,0.12)';
    c.lineWidth = 1;
    c.stroke();
  }
  // dumpster on the left and trash bags
  const dx = w * 0.06;
  const dy = gy + 10 * u;
  c.fillStyle = '#0e1a16';
  c.fillRect(dx, dy - 70 * u, 120 * u, 70 * u);
  c.fillStyle = '#16261f';
  c.fillRect(dx - 4 * u, dy - 76 * u, 128 * u, 10 * u);
  c.fillStyle = 'rgba(255,90,150,0.3)';
  c.fillRect(dx + 116 * u, dy - 70 * u, 4 * u, 70 * u);
  c.fillStyle = '#08080b';
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(dx + 150 * u + i * 26 * u, dy - 12 * u, 20 * u, 16 * u, 0, 0, TAU);
    c.fill();
  }
  // neon sign bracket on the right wall (the glow is live)
  const nx = w * 0.88;
  const ny = gy - 300 * u;
  c.fillStyle = '#0b070c';
  c.fillRect(nx - 30 * u, ny - 4 * u, 34 * u, 4 * u);
  c.fillStyle = '#1a0d18';
  c.fillRect(nx - 18 * u, ny, 22 * u, 110 * u);
}

function neonShape(c: C, s: State, env: SceneEnv, on: number) {
  const u = s.u;
  const nx = env.w * 0.88;
  const ny = s.gy - 300 * u;
  c.strokeStyle = `rgba(255,80,150,${(0.35 + on * 0.65).toFixed(3)})`;
  c.lineWidth = 3 * u;
  c.beginPath();
  c.rect(nx - 15 * u, ny + 6 * u, 16 * u, 98 * u);
  c.moveTo(nx - 7 * u, ny + 16 * u);
  c.lineTo(nx - 7 * u, ny + 34 * u);
  c.moveTo(nx - 11 * u, ny + 46 * u);
  c.lineTo(nx - 3 * u, ny + 58 * u);
  c.moveTo(nx - 7 * u, ny + 70 * u);
  c.arc(nx - 7 * u, ny + 80 * u, 6 * u, -Math.PI / 2, Math.PI * 1.5);
  c.stroke();
}

/* ---------- placement ---------- */

/** How far forward the devil has to lunge for its jaws to reach Denji */
function atkReach(s: State) {
  return Math.max(0, s.bx - 126 * BS - s.x - 70);
}

/** Bat body pose this frame (local units: forward, down, tilt) */
const BP = { ox: 0, oy: 0, tilt: 0, drop: 0 };

function batPose(s: State, t: number) {
  let ox = 0;
  let oy = 0;
  let tilt = 0;
  if (s.atk === 1) {
    ox = -36 * s.atkK;
    oy = -18 * s.atkK;
    tilt = -0.12 * s.atkK;
  } else if (s.atk === 2) {
    const k = s.atkK;
    ox = lerp(-36, atkReach(s), k);
    oy = lerp(-18, 112, k);
    tilt = lerp(-0.12, 0.34, k);
  } else if (s.atk === 3) {
    const k = easeOutCubic(s.atkK);
    ox = lerp(atkReach(s), 0, k);
    oy = lerp(112, 0, k);
    tilt = lerp(0.34, 0, k);
  }
  ox -= s.recoil * 70;
  oy -= s.recoil * 20;
  tilt -= s.recoil * 0.32;
  BP.ox = ox;
  BP.oy = oy - Math.sin(t * 2.4) * 10;
  BP.tilt = tilt;
  BP.drop = s.bState === 2 ? (1 - easeOutBack(Math.min(1, s.bT / 1.15))) * 560 : 0;
}

function batTransform(c: C, s: State, u: number) {
  c.translate((s.bx - BP.ox) * u, s.gy + (-s.hover + BP.oy - BP.drop) * u);
  c.scale(-u * BS, u * BS);
  c.translate(20, -220);
  c.rotate(BP.tilt);
  c.translate(-20, 220);
}

/** World units of a point on the devil (local coords) for the current pose */
function batWorld(s: State, lx: number, ly: number, out: number[]) {
  const ca = Math.cos(BP.tilt);
  const sa = Math.sin(BP.tilt);
  const x = lx - 20;
  const y = ly + 220;
  const rx = x * ca - y * sa + 20;
  const ry = x * sa + y * ca - 220;
  out[0] = s.bx - BP.ox - rx * BS;
  out[1] = -s.hover + BP.oy - BP.drop + ry * BS;
}

/* ---------- sound ---------- */

function screechSound(bus: AudioBus | null, big: boolean) {
  if (!bus) return;
  tone(bus, big ? 1900 : 1500, { type: 'sawtooth', attack: 0.02, decay: big ? 0.7 : 0.4, gain: 0.05, glideTo: big ? 500 : 700 });
  tone(bus, big ? 2600 : 2100, { type: 'square', attack: 0.02, decay: big ? 0.5 : 0.3, gain: 0.025, glideTo: 900, delay: 0.03 });
  noise(bus, { duration: big ? 0.6 : 0.35, gain: 0.08, freq: 3200, q: 2 });
}

function gore(bus: AudioBus | null, big: boolean) {
  if (!bus) return;
  noise(bus, { duration: big ? 0.7 : 0.35, gain: big ? 0.4 : 0.25, freq: 380, q: 0.7, type: 'lowpass' });
  noise(bus, { duration: 0.3, gain: 0.3, freq: 2600, q: 0.5, type: 'highpass' });
  tone(bus, 140, { type: 'square', attack: 0.004, decay: 0.3, gain: 0.08, glideTo: 45 });
}

/* ---------- actions ---------- */

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.touched = true;
  s.idle = 0;
  const bus = env.audio();
  if (bus) {
    // cord yank
    noise(bus, { duration: 0.12, gain: 0.12, freq: 1600, q: 1.2 });
    stopHum(s.hum);
    s.hum = startHum(bus, { type: 'sawtooth', freq: 55, cutoff: 700, noiseAmt: 0.35 });
  }
  s.look.cvx -= 80;
  s.look.cvy += 60;
  env.wake(800);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  leap(s, env, true);
  env.wake(3200);
}

function leap(s: State, env: SceneEnv, sound: boolean) {
  if (s.phase !== 0 || s.bState !== 0) return;
  s.power = 0.35 + s.look.rev * 0.65;
  s.kill = s.hp + s.power * s.power * 1.1 + 0.2 >= 1;
  s.phase = 1;
  s.pt = 0;
  s.from = s.x;
  s.airFrom = 0;
  // the devil flinches back out of its dive when he jumps
  if (s.atk === 1 || s.atk === 2) {
    s.atk = 3;
    s.atkT = 0;
  }
  // the cut runs down through the head and chest, measured from its rest spot
  s.cutX = s.bx - 34 * BS;
  s.to = s.cutX - 96;
  s.ghostT = 0;
  s.look.cvx -= 200;
  const bus = sound ? env.audio() : null;
  if (bus) noise(bus, { duration: 0.3, gain: 0.14, freq: 700, q: 0.5 });
}

/** Top of the carve: hit stop, the slash streak and the devil's reaction */
function impact(s: State, env: SceneEnv) {
  const P = s.power;
  s.slash = 1;
  s.slashX = s.cutX;
  s.slashY0 = -480;
  s.slashY1 = -480;
  s.flash = 0.5 + P * 0.5;
  if (!env.reducedMotion) {
    s.stop = 0.06 + P * 0.06;
    s.shake = 0.6 + P * 0.5;
  }
  const bus = env.audio();
  if (s.kill) {
    s.bState = 1;
    s.bT = 0;
    s.atk = 0;
    s.recoil = 0;
    gore(bus, true);
    screechSound(bus, true);
  } else {
    s.hp += P * P * 1.1 + 0.2;
    s.recoil = 1;
    s.screech = 1;
    // a diagonal gash across the chest that stays until it dies
    for (const g of s.gashes) {
      if (g.on) continue;
      g.on = true;
      const off = rand(-14, 14);
      g.x0 = 52 + off;
      g.y0 = -250 + off * 0.5;
      g.x1 = -20 + off;
      g.y1 = -164 + off;
      break;
    }
    gore(bus, false);
    screechSound(bus, false);
  }
}

/** The devil's dive lands: a revved guard bats it away, otherwise Denji is thrown */
function biteLands(s: State, env: SceneEnv) {
  s.hitDone = true;
  const mx = s.x + 70;
  const my = -170;
  const bus = env.audio();
  if (s.look.rev > 0.3) {
    burst(s.parts, 34, mx, my, Math.PI + 0.4, 1, 820, 0.4, 2.4, SPARK, 2, 700);
    burst(s.parts, 24, mx + 10, my, -0.5, 0.9, 620, 1.1, 2.4, BLOOD, 0.4, 900);
    s.recoil = 1;
    s.screech = 1;
    s.push = Math.min(30, s.push + 16);
    s.atk = 3;
    s.atkT = 0;
    s.flash = Math.max(s.flash, 0.4);
    if (!env.reducedMotion) {
      s.stop = 0.05;
      s.shake = Math.max(s.shake, 0.5);
    }
    if (bus) {
      noise(bus, { duration: 0.25, gain: 0.3, freq: 2600, q: 0.6, type: 'highpass' });
      screechSound(bus, false);
    }
  } else {
    burst(s.parts, 28, s.x + 20, -180, Math.PI + 0.6, 0.9, 560, 1.1, 2.4, BLOOD, 0.4, 900);
    s.push = 90;
    s.hurt = 1;
    s.flash = Math.max(s.flash, 0.3);
    if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.7);
    gore(bus, false);
  }
}

function landDust(s: State) {
  burst(s.parts, 16, s.x + 10, -4, -Math.PI / 2, 1.2, 220, 0.8, 9, DUST, 2.5, -20);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.14,
    init: () => {
      const rain = new Float32Array(RAIN * 3);
      for (let i = 0; i < RAIN; i++) {
        rain[i * 3] = Math.random();
        rain[i * 3 + 1] = Math.random();
        rain[i * 3 + 2] = rand(0.5, 1);
      }
      return {
        look: makeLook(),
        x: 0,
        air: 0,
        home: 0,
        phase: 0,
        pt: 0,
        from: 0,
        to: 0,
        airFrom: 0,
        power: 0,
        kill: false,
        held: false,
        touched: false,
        idle: 0,
        autoT: 0.15,
        autoRev: 0.62,
        push: 0,
        hurt: 0,
        ghostT: 0,
        ghosts: new Float32Array(GHOSTS * 2),
        exhaust: 0,
        carve: 0,
        bx: 0,
        bhome: 0,
        hover: 12,
        bState: 0,
        bT: 0,
        flap: 0,
        hp: 0,
        recoil: 0,
        jaw: 0,
        atk: 0,
        atkT: 0,
        atkK: 0,
        atkNext: 2.6,
        hitDone: false,
        screech: 0,
        cutX: 0,
        gashes: Array.from({ length: 3 }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0, on: false })),
        parts: makePool(MAX_PARTS),
        splats: Array.from({ length: 14 }, () => ({ x: 0, w: 0, life: 0 })),
        slash: 0,
        slashX: 0,
        slashY0: 0,
        slashY1: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        rain,
        hum: null,
        u: 1,
        gy: 0,
        bg: null,
        fxl: null,
        orange: glowSprite(96, [
          [0, 'rgba(255,245,220,1)'],
          [0.2, 'rgba(255,190,90,0.75)'],
          [0.5, 'rgba(255,100,30,0.25)'],
          [1, 'rgba(200,40,0,0)'],
        ]),
        neon: glowSprite(96, [
          [0, 'rgba(255,120,190,0.8)'],
          [0.4, 'rgba(255,60,140,0.25)'],
          [1, 'rgba(255,0,100,0)'],
        ]),
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(255,240,220,0.5)'],
          [1, 'rgba(255,200,160,0)'],
        ]),
        eye: glowSprite(48, [
          [0, 'rgba(255,240,200,1)'],
          [0.3, 'rgba(255,60,30,0.8)'],
          [1, 'rgba(200,0,0,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const first = s.home === 0;
      s.u = Math.min(w / 900, h / 560);
      s.gy = h * 0.88;
      s.home = (w * 0.2) / s.u;
      s.bhome = (w * 0.72) / s.u;
      s.bx = s.bhome;
      if (first || s.phase === 0) s.x = s.home;
      paintAlley(s, env);
      s.fxl = layer(s.fxl, w, h, env.dpr).cv;
      const v = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const rm = env.reducedMotion;
      const L = s.look;
      stepPool(s.parts, dt);
      s.flash = Math.max(0, s.flash - dt * 3.5);
      s.shake = Math.max(0, s.shake - dt * 2.8);
      s.slash = Math.max(0, s.slash - dt * 3);
      s.screech = Math.max(0, s.screech - dt * 1.6);
      for (const sp of s.splats) sp.life = Math.max(0, sp.life - dt * 0.18);
      // blood that reaches the ground pools
      for (const p of s.parts.items) {
        if (p.life > 0 && p.kind === BLOOD && p.y > 4 && p.vy > 0) {
          p.life = 0;
          let slot = s.splats[0];
          for (const sp of s.splats) if (sp.life < slot.life) slot = sp;
          slot.x = p.x;
          slot.w = p.size * rand(2.5, 5);
          slot.life = 1;
        }
      }
      // rain
      for (let i = 0; i < RAIN; i++) {
        const sp = s.rain[i * 3 + 2];
        s.rain[i * 3 + 1] += dt * 1.6 * sp;
        s.rain[i * 3] -= dt * 0.12 * sp;
        if (s.rain[i * 3 + 1] > 1) {
          s.rain[i * 3 + 1] -= 1;
          s.rain[i * 3] = Math.random() * 1.1;
        }
      }
      if (s.stop > 0) {
        s.stop -= dt;
        return;
      }

      // autopilot for the tile and idle viewers
      s.idle = s.held ? 0 : s.idle + dt;
      const auto = !env.interactive || !s.touched || s.idle > 6;
      let autoRev = false;
      if (auto && s.phase === 0 && s.bState === 0) {
        if (s.atk === 1 || s.atk === 2) autoRev = true;
        else {
          s.autoT -= dt;
          if (s.autoT <= 0) {
            autoRev = true;
            if (L.rev >= s.autoRev) {
              leap(s, env, false);
              s.autoT = rand(1.8, 2.6);
              s.autoRev = s.autoRev < 0.9 ? 1 : 0.62;
            }
          }
        }
      }
      if (s.held || autoRev) {
        L.rev = Math.min(1, L.rev + dt / (autoRev && !s.held ? 0.7 : 1.1));
        if (rm && s.held) env.wake(300);
      } else L.rev = Math.max(0, L.rev - dt * (s.phase === 0 ? 1.5 : 0.5));
      L.chain += dt * (20 + L.rev * 560 + (s.phase === 1 || s.phase === 2 ? 400 : 0));
      if (s.hum) setHum(s.hum, 55 + L.rev * 120, 0.05 + L.rev * 0.1, 600 + L.rev * 2600);
      if (!s.held && s.hum && L.rev < 0.02) {
        stopHum(s.hum);
        s.hum = null;
      }

      // Denji
      s.pt += dt;
      s.push = damp(s.push, 0, s.phase === 0 ? 2.4 : 8, dt);
      s.hurt = Math.max(0, s.hurt - dt * 2.2);
      let jaw = L.rev * 0.5;
      if (s.phase === 0) {
        s.x = s.home - s.push;
        s.air = 0;
        blendPose(J, STANCE, REV, easeOutCubic(L.rev));
      } else if (s.phase === 1) {
        const k = Math.min(1, s.pt / 0.36);
        s.x = lerp(s.from, s.to, easeOutCubic(k));
        s.air = Math.sin((k * Math.PI) / 2) * 170;
        blendPose(TMP, STANCE, REV, easeOutCubic(L.rev));
        blendPose(J, TMP, OVERHEAD, easeOutCubic(Math.min(1, k / 0.55)));
        jaw = 1;
        if (k >= 1) {
          s.phase = 2;
          s.pt = 0;
          impact(s, env);
        }
      } else if (s.phase === 2) {
        const k = Math.min(1, s.pt / 0.26);
        s.air = 170 * (1 - k * k);
        s.x = s.to + k * 8;
        blendPose(J, OVERHEAD, CUT, easeOutCubic(Math.min(1, k / 0.4)));
        jaw = 1;
        // the saw carves down through the devil, blood fanning off both sides of the bar
        bladeTip(J, 0, TIP);
        const cy = -s.air + lerp(J[7], TIP[1], 0.6);
        s.slashY1 = Math.max(s.slashY1, cy);
        if (!rm || Math.random() < 0.5) {
          const n = s.kill ? 5 : 3;
          burst(s.parts, n, s.cutX, cy, Math.PI + 0.5, 0.6, 700, 1.1, 2.5, BLOOD, 0.5, 900);
          burst(s.parts, n, s.cutX + 6, cy, -0.5, 0.6, 700, 1.1, 2.5, BLOOD, 0.5, 900);
          burst(s.parts, 2, s.cutX, cy, -Math.PI / 2, 1.2, 600, 0.3, 2.2, SPARK, 2, 800);
        }
        if (k >= 1) {
          s.phase = 3;
          s.pt = 0;
          s.air = 0;
          landDust(s);
          if (!rm) s.shake = Math.max(s.shake, 0.45);
        }
      } else if (s.phase === 3) {
        const k = Math.min(1, s.pt / 0.12);
        blendPose(J, CUT, LAND, easeOutCubic(k));
        jaw = 0.7;
        if (s.pt > 0.5) {
          s.phase = 4;
          s.pt = 0;
          s.from = s.x;
        }
      } else if (s.phase === 4) {
        const k = Math.min(1, s.pt / 0.55);
        s.x = lerp(s.from, s.home, easeOutCubic(k));
        s.air = Math.sin(k * Math.PI) * 46;
        blendPose(J, LAND, STANCE, easeOutCubic(k));
        if (k >= 1) {
          s.phase = 0;
          s.x = s.home;
          s.air = 0;
        }
      }
      if (s.hurt > 0) {
        // thrown back by the bite
        for (let i = 2; i < 14; i += 2) J[i] -= s.hurt * 22;
        for (let i = 3; i < 14; i += 2) J[i] += s.hurt * 10;
        jaw = Math.max(jaw, s.hurt);
      }
      if (L.rev > 0.05 && s.phase === 0 && !rm) {
        const j = L.rev * 1.6;
        for (let i = 2; i < 14; i++) J[i] += (Math.random() - 0.5) * j;
      }
      // afterimages trail the jump
      s.ghostT += dt;
      if (s.phase === 1 || s.phase === 2) {
        if (s.ghostT > 0.03) {
          s.ghostT = 0;
          s.ghosts.copyWithin(2, 0);
          s.ghosts[0] = s.x;
          s.ghosts[1] = s.air;
        }
      } else
        for (let i = 0; i < GHOSTS; i++) {
          s.ghosts[i * 2] = damp(s.ghosts[i * 2], s.x, 12, dt);
          s.ghosts[i * 2 + 1] = damp(s.ghosts[i * 2 + 1], s.air, 12, dt);
        }
      const drag = s.phase === 1 ? -1800 : s.phase === 2 ? -1400 : s.phase === 4 ? 900 : 0;
      stepLook(L, dt, drag, s.phase === 1 ? -900 : s.phase === 2 ? -1600 : 0, s.phase === 1 || s.phase === 2 ? -1.2 : s.phase === 4 ? 0.6 : 0.15 + Math.sin(L.chain * 0.02) * 0.06 * L.rev, jaw);

      // smoke off the head bar and sparks off the arm chains while revving
      if (L.rev > 0.08) {
        s.exhaust += dt * (6 + L.rev * 30);
        while (s.exhaust > 1) {
          s.exhaust -= 1;
          emit(s.parts, s.x + J[4] - 20, -s.air + J[5] - 10, rand(-90, -30), rand(-90, -30), rand(0.6, 1.2), rand(8, 14), SMOKE, 1.5, -40);
          for (let a = 0; a < 2; a++) {
            if (Math.random() > L.rev * (a ? 0.6 : 0.9)) continue;
            bladeTip(J, a, TIP);
            burst(s.parts, 2, s.x + TIP[0], -s.air + TIP[1], TIP[2] + 0.5, 0.6, 600 * L.rev, 0.3, 2.2, SPARK, 1.5, 900);
          }
        }
      }

      // the Bat Devil
      s.bT += dt;
      s.recoil = Math.max(0, s.recoil - dt * 1.8);
      s.flap += dt * (s.bState === 2 ? 14 : s.atk === 1 ? 11 : 6.5);
      let bjaw = 0.12 + Math.max(s.screech, s.recoil * 0.8);
      if (s.bState === 0) {
        if (s.atk === 0) {
          if (s.phase === 0) s.atkNext -= dt;
          if (s.atkNext <= 0) {
            s.atk = 1;
            s.atkT = 0;
            s.hitDone = false;
            screechSound(env.audio(), false);
          }
        } else {
          s.atkT += dt;
          if (s.atk === 1) {
            s.atkK = easeOutCubic(Math.min(1, s.atkT / 0.5));
            bjaw = Math.max(bjaw, s.atkK);
            if (s.atkT >= 0.5) {
              s.atk = 2;
              s.atkT = 0;
            }
          } else if (s.atk === 2) {
            s.atkK = Math.min(1, s.atkT / 0.16);
            bjaw = 1;
            if (s.atkK >= 1 && !s.hitDone) biteLands(s, env);
            if (s.atkK >= 1 && s.atk === 2) {
              s.atk = 3;
              s.atkT = 0;
            }
          } else {
            s.atkK = Math.min(1, s.atkT / 0.55);
            bjaw = Math.max(bjaw, 1 - s.atkK);
            if (s.atkK >= 1) {
              s.atk = 0;
              s.atkNext = rand(2.6, 4);
            }
          }
        }
      } else if (s.bState === 1) {
        // sawn in half: blood keeps gushing out of both halves for a moment
        const k = s.bT;
        if (k < 0.9 && (!rm || Math.random() < 0.4)) {
          const y = -rand(140, 420) * (1 - k * 0.5) + k * k * 120;
          burst(s.parts, 3, s.cutX - 8 - k * 40, y, Math.PI + 0.3, 0.8, 520 * (1 - k * 0.6), 1.2, 2.6, BLOOD, 0.4, 900);
          burst(s.parts, 3, s.cutX + 8 + k * 50, y, -0.3, 0.8, 520 * (1 - k * 0.6), 1.2, 2.6, BLOOD, 0.4, 900);
          if (Math.random() < 0.5) burst(s.parts, 2, s.cutX, y, -Math.PI / 2, 0.4, 700, 1.2, 3, BLOOD, 0.3, 900);
        }
        if (s.bT > 2.1) {
          s.bState = 2;
          s.bT = 0;
          s.hp = 0;
          for (const g of s.gashes) g.on = false;
          s.atk = 0;
          s.atkNext = rand(2.2, 3);
        }
      } else if (s.bState === 2 && s.bT > 1.15) {
        s.bState = 0;
        s.bT = 0;
      }
      s.jaw = damp(s.jaw, bjaw, 16, dt);
      s.hover = 12;
      batPose(s, t);
      if (s.recoil > 0.6 && s.bState === 0 && Math.random() < 0.5) {
        // it bleeds from the gash while it reels
        const g = s.gashes.find((q) => q.on);
        if (g) {
          batWorld(s, lerp(g.x0, g.x1, Math.random()), lerp(g.y0, g.y1, Math.random()), TIP);
          emit(s.parts, TIP[0], TIP[1], rand(-160, 40), rand(-200, 0), 1, rand(1.8, 3), BLOOD, 0.4, 900);
        }
      }
      // under reduced motion only a viewer's own action keeps the loop awake
      if (rm && s.touched && (s.phase !== 0 || s.bState !== 0)) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      const gy = s.gy;
      const L = s.look;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 14 * u + (s.phase === 0 ? L.rev * 1.2 * u : 0);
      ctx.save();
      ctx.translate(shakeX(amp, t), shakeY(amp, t));
      if (s.bg) ctx.drawImage(s.bg, -12 * u, -12 * u, w + 24 * u, h + 24 * u);

      // neon flicker
      const flick = Math.sin(t * 13) > -0.85 || Math.sin(t * 3.1) > 0.4 ? 1 : 0.2;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.neon, w * 0.88 - 7 * u, gy - 245 * u, 120 * u, 0.55 * flick);
      glow(ctx, s.neon, w * 0.84, gy + 20 * u, 90 * u, 0.2 * flick);
      ctx.globalAlpha = 1;
      neonShape(ctx, s, env, flick);
      ctx.globalCompositeOperation = 'source-over';

      // blood pooling on the wet ground
      for (const sp of s.splats) {
        if (sp.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, sp.life * 1.4) * 0.85;
        ctx.fillStyle = BLOOD_DEEP;
        ctx.beginPath();
        ctx.ellipse(sp.x * u, gy + 8 * u, sp.w * 1.8 * u, sp.w * 0.32 * u, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,90,90,0.25)';
        ctx.beginPath();
        ctx.ellipse(sp.x * u - sp.w * 0.4 * u, gy + 7 * u, sp.w * 0.7 * u, sp.w * 0.1 * u, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // the devil's shadow
      if (s.bState !== 1) {
        const lift = clamp(1 - BP.drop / 400, 0, 1);
        ctx.fillStyle = `rgba(0,0,0,${(0.45 * lift).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse((s.bx - BP.ox - 10) * u, gy + 6 * u, 150 * u, 14 * u, 0, 0, TAU);
        ctx.fill();
      }

      // the Bat Devil: warm rim from the street behind, then the body
      const drawBat = (flat: string | null, ox: number, oy: number) => {
        ctx.save();
        ctx.translate(ox * u, oy * u);
        batTransform(ctx, s, u);
        bat(ctx, s, s.flap, s.jaw, t, flat);
        ctx.restore();
      };
      if (s.bState !== 1) {
        drawBat('rgba(255,150,90,0.75)', -3, -2);
        drawBat(null, 0, 0);
        // eye glow
        ctx.globalCompositeOperation = 'lighter';
        batWorld(s, 92, -298, TIP);
        glow(ctx, s.eye, TIP[0] * u, gy + TIP[1] * u, 16 * u, 0.9 + Math.sin(t * 6) * 0.1);
        batWorld(s, 115, -302, TIP);
        glow(ctx, s.eye, TIP[0] * u, gy + TIP[1] * u, 10 * u, 0.7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      } else {
        // sawn apart: each half is drawn on a scratch layer, its cut face painted red only
        // where the body is, then the halves peel away from the cut and drop
        const k = s.bT;
        const fade = clamp(1 - (k - 1.1) / 0.9, 0, 1);
        const sep = easeOutCubic(Math.min(1, k / 0.9));
        const cx = s.cutX * u;
        const lc = s.fxl?.getContext('2d');
        if (s.fxl && lc && fade > 0) {
          for (let half = 0; half < 2; half++) {
            const sg = half === 0 ? -1 : 1;
            lc.setTransform(1, 0, 0, 1, 0, 0);
            lc.clearRect(0, 0, s.fxl.width, s.fxl.height);
            lc.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
            const px = cx;
            const py = gy - 40 * u;
            const place = () => {
              lc.translate(px + sg * sep * (half === 0 ? 40 : 56) * u, py + Math.min(1, k * k) * 60 * u);
              lc.rotate(sg * sep * (half === 0 ? 0.16 : 0.22));
              lc.translate(-px, -py);
            };
            lc.save();
            place();
            lc.beginPath();
            if (half === 0) lc.rect(-w, -h, cx + w, h * 3);
            else lc.rect(cx, -h, w * 2, h * 3);
            lc.clip();
            lc.save();
            batTransform(lc, s, u);
            bat(lc, s, s.flap * 0.2, 1, t, null);
            lc.restore();
            // raw cut face
            lc.globalCompositeOperation = 'source-atop';
            const ex = cx - sg * 22 * u;
            const g = lc.createLinearGradient(ex, 0, cx, 0);
            g.addColorStop(0, 'rgba(90,0,8,0)');
            g.addColorStop(0.35, BLOOD_DEEP);
            g.addColorStop(0.8, BLOOD_RED);
            g.addColorStop(1, '#ff8a7a');
            lc.fillStyle = g;
            lc.fillRect(Math.min(ex, cx), -h, 22 * u, h * 3);
            lc.restore();
            lc.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = fade;
            ctx.drawImage(s.fxl, 0, 0, w, h);
          }
          ctx.globalAlpha = 1;
        }
      }

      // screech rings toward Denji
      if (s.screech > 0 && s.bState === 0) {
        batWorld(s, 122, -262, TIP);
        const mx = TIP[0] * u;
        const my = gy + TIP[1] * u;
        ctx.strokeStyle = 'rgba(255,220,230,0.5)';
        ctx.lineWidth = 2.4 * u;
        for (let i = 0; i < 3; i++) {
          const q = (1 - s.screech + i * 0.18) % 1;
          ctx.globalAlpha = (1 - q) * s.screech;
          ctx.beginPath();
          ctx.arc(mx, my, (20 + q * 220) * u, Math.PI - 0.5, Math.PI + 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // smoke and dust behind Denji
      for (const p of s.parts.items) {
        if (p.life <= 0 || (p.kind !== SMOKE && p.kind !== DUST)) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = p.kind === SMOKE ? k * 0.28 : k * 0.35;
        ctx.fillStyle = p.kind === SMOKE ? '#5d5660' : '#3a3036';
        ctx.beginPath();
        ctx.arc(p.x * u, gy + p.y * u, p.size * u * (1.6 - k * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // warm light spilling from the saws onto the ground
      const fx = s.x * u;
      const fy = gy - s.air * u;
      ctx.globalCompositeOperation = 'lighter';
      const heat = L.rev * 0.8 + (s.phase === 1 || s.phase === 2 ? 0.6 : 0) + 0.15;
      glow(ctx, s.orange, fx + 40 * u, fy - 170 * u, 200 * u, heat * 0.32);
      ctx.save();
      ctx.translate(fx + 30 * u, gy + 6 * u);
      ctx.scale(1, 0.18);
      glow(ctx, s.orange, 0, 0, 190 * u, heat * 0.5);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Denji's shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(fx + 6 * u, gy + 4 * u, 52 * u * (1 - s.air / 400), 8 * u, 0, 0, TAU);
      ctx.fill();

      // afterimages through the jump
      if (s.phase === 1 || s.phase === 2) {
        for (let i = GHOSTS - 1; i >= 0; i--) {
          const gx = s.ghosts[i * 2] * u;
          const ga = s.ghosts[i * 2 + 1] * u;
          if (Math.abs(gx - fx) < 6 * u && Math.abs(gy - ga - fy) < 6 * u) continue;
          ctx.save();
          ctx.globalAlpha = 0.3 - i * 0.06;
          ctx.translate(gx, gy - ga);
          ctx.scale(u, u);
          drawDenji(ctx, J, L, i % 2 ? '#ff7a2a' : '#ffb36a');
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      // Denji: neon rim pass then the full figure
      ctx.save();
      ctx.translate(fx + 2.5 * u, fy - 1.5 * u);
      ctx.scale(u, u);
      drawDenji(ctx, J, L, 'rgba(255,110,170,0.8)');
      ctx.restore();
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(u, u);
      drawDenji(ctx, J, L, null);
      ctx.restore();

      // the carve: a white hot streak down the cut line
      if (s.slash > 0) {
        const k = s.slash;
        const x = s.slashX * u;
        const y0 = gy + s.slashY0 * u;
        const y1 = gy + Math.max(s.slashY1, s.slashY0 + 40) * u;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,120,50,${(k * 0.45).toFixed(3)})`;
        ctx.lineWidth = 16 * u * k;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,248,232,${k.toFixed(3)})`;
        ctx.lineWidth = 3.5 * u * k;
        ctx.stroke();
        glow(ctx, s.white, x, y1, 60 * u * k, k);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // sparks
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== SPARK) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.strokeStyle = k > 0.5 ? '#fff1c8' : '#ff8a2a';
        ctx.lineWidth = p.size * 0.7 * u;
        ctx.beginPath();
        ctx.moveTo(p.x * u, gy + p.y * u);
        ctx.lineTo((p.x - p.vx * 0.025) * u, gy + (p.y - p.vy * 0.025) * u);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // blood spray
      drawBlood(ctx, s.parts, BLOOD, u, 0, gy);

      // rain in front of everything
      ctx.strokeStyle = 'rgba(190,190,230,0.22)';
      ctx.lineWidth = Math.max(0.6, 0.9 * u);
      ctx.beginPath();
      for (let i = 0; i < RAIN; i++) {
        const x = s.rain[i * 3] * w;
        const y = s.rain[i * 3 + 1] * h;
        const Lr = 16 * u * s.rain[i * 3 + 2];
        ctx.moveTo(x, y);
        ctx.lineTo(x - Lr * 0.12, y + Lr);
      }
      ctx.stroke();
      ctx.restore();

      // manga speed lines through the jump
      if (s.phase === 1 || (s.phase === 2 && s.pt < 0.2)) {
        const k = s.phase === 1 ? 1 : Math.max(0, 1 - s.pt * 5);
        ctx.strokeStyle = `rgba(255,240,225,${(0.35 * k).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 1.6 * u);
        ctx.beginPath();
        const vertical = s.phase === 2;
        for (let i = 0; i < 26; i++) {
          const y = (((i * 71 + Math.floor(t * 30) * 13) % 97) / 97) * h;
          const x = (((i * 53 + Math.floor(t * 30) * 29) % 89) / 89) * w;
          ctx.moveTo(x, y);
          if (vertical) ctx.lineTo(x, y - (120 + (i % 5) * 60) * u);
          else ctx.lineTo(x - (120 + (i % 5) * 60) * u, y + (60 + (i % 3) * 20) * u);
        }
        ctx.stroke();
      }

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,170,130,${(s.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
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
      freeCanvas(s.bg, s.fxl, s.orange, s.neon, s.white, s.eye);
      s.bg = s.fxl = null;
    },
  });
