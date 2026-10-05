import { createCanvasScene, clamp, damp, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
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

/**
 * Iron Man: the red and gold armor flying over a city at night, boot and palm thrusters lit.
 * The armor is baked once per resize into shaded sprites (body, near arm, far arm) so each
 * frame only transforms them and layers the live light on top: eye slits, arc reactor,
 * repulsor palms and boot flames. Hostile drones drift in from the right; a HUD reticle locks
 * the closest one. A tap fires a palm repulsor (charge glow, bolt, impact flash, hit-stop and
 * shake); holding charges the chest and fires the unibeam until released. Left alone he flies
 * and fights on his own, so the tile always has something going on.
 */

interface Drone {
  x: number;
  y: number;
  vx: number;
  phase: number;
  depth: number;
  hp: number;
  flash: number;
  alive: boolean;
  respawn: number;
}

interface Ring {
  x: number;
  y: number;
  age: number;
  size: number;
}

interface State {
  // hero, in fractions of the canvas
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  lean: number;
  armNear: number;
  armFar: number;
  // input
  held: boolean;
  holdT: number;
  touched: boolean;
  idle: number;
  keys: number;
  autoT: number;
  autoUni: number;
  // weapons
  palm: number;
  fireQ: boolean;
  fireWait: number;
  shotLife: number;
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
  uni: number;
  beaming: boolean;
  beamT: number;
  beamMax: number;
  beamFade: number;
  beamA: number;
  target: number;
  lock: number;
  // world
  drones: Drone[];
  rings: Ring[];
  parts: Pool;
  scroll: number;
  stop: number;
  shake: number;
  flash: number;
  hum: Hum | null;
  // cached layout
  u: number;
  tileW: number;
  bg: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
  near: HTMLCanvasElement | null;
  body: HTMLCanvasElement | null;
  arm: HTMLCanvasElement | null;
  armDark: HTMLCanvasElement | null;
  drone: HTMLCanvasElement | null;
  cyan: HTMLCanvasElement;
  hot: HTMLCanvasElement;
  fire: HTMLCanvasElement;
  red: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const MAX_DRONES = 5;
const MAX_PARTS = 360;
const TAP = 0.26; // held longer than this becomes the unibeam
const UNI_CHARGE = 0.55;
const SHOULDER_N = [24, -86];
const SHOULDER_F = [-22, -88];
const ARM_LEN = 90;
const REACTOR = [3, -73];
const FEET = [
  [-40, 92],
  [2, 108],
];
const BODY_BOX = [-70, -142, 140, 270]; // x, y, w, h in figure units
const ARM_BOX = [-16, -18, 116, 36];
const DRONE_BOX = [-30, -18, 64, 36];

// palette: 3 to 4 values per material
const RED = ['#3d060a', '#8c1017', '#c41d25', '#f05a4e'];
const GOLD = ['#5e3a0c', '#a8741b', '#e0ad44', '#fff0b8'];
const STEEL = ['#15171d', '#2c313c', '#4a5263', '#8d98ad'];
const RIM = 'rgba(150,200,255,0.75)';

/* ---------- sprite painting (figure units) ---------- */

type C = CanvasRenderingContext2D;

function grad(c: C, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const n = cols.length - 1;
  cols.forEach((col, i) => g.addColorStop(i / n, col));
  return g;
}

/** Tapered capsule from (x0,y0) to (x1,y1) */
function capsule(c: C, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.arc(x0, y0, r0, a + Math.PI / 2, a - Math.PI / 2);
  c.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
  c.closePath();
}

/** Fill the current path lit from the upper right, then a cool rim along the lower left */
function shadeFill(c: C, cols: string[], x0: number, y0: number, x1: number, y1: number) {
  c.fillStyle = grad(c, x1, y0, x0, y1, [cols[3], cols[2], cols[1], cols[0]]);
  c.fill();
}

function panel(c: C, pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
}

function paintLeg(c: C, hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, near: boolean) {
  // thigh: red shell, gold front plate
  capsule(c, hx, hy, kx, ky, 13, 10);
  shadeFill(c, RED, hx - 14, hy, kx + 14, ky);
  capsule(c, lerp(hx, kx, 0.12) + 3, lerp(hy, ky, 0.12), lerp(hx, kx, 0.82) + 2, lerp(hy, ky, 0.82), 6.5, 5);
  shadeFill(c, GOLD, hx - 6, hy, kx + 8, ky);
  // shin and boot
  capsule(c, kx, ky, fx, fy, 10, 9);
  shadeFill(c, RED, kx - 12, ky, fx + 12, fy);
  // knee cap
  c.beginPath();
  c.ellipse(kx + 4, ky, 4.5, 6.5, 0.2, 0, TAU);
  shadeFill(c, GOLD, kx, ky - 6, kx + 8, ky + 6);
  c.strokeStyle = 'rgba(40,10,4,0.6)';
  c.lineWidth = 0.8;
  c.stroke();
  // ankle band and sole with the thruster nozzle
  const a = Math.atan2(fy - ky, fx - kx);
  const bx = lerp(kx, fx, 0.72);
  const by = lerp(ky, fy, 0.72);
  c.save();
  c.translate(bx, by);
  c.rotate(a);
  c.fillStyle = GOLD[1];
  c.fillRect(-2, -9.5, 4, 19);
  c.fillStyle = GOLD[3];
  c.fillRect(-2, -9.5, 1.2, 19);
  c.restore();
  c.save();
  c.translate(fx, fy);
  c.rotate(a);
  c.fillStyle = STEEL[1];
  c.beginPath();
  c.ellipse(6, 0, 4, 10, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#fff4d6';
  c.beginPath();
  c.ellipse(8, 0, 2, 6, 0, 0, TAU);
  c.fill();
  c.restore();
  // shin ridge highlight
  if (near) {
    c.strokeStyle = 'rgba(255,190,170,0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(kx + 7, ky + 6);
    c.lineTo(fx + 6, fy - 12);
    c.stroke();
  }
}

function paintBody(c: C) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // far leg is a touch darker
  paintLeg(c, -9, -6, -12, 50, FEET[0][0], FEET[0][1], false);
  c.fillStyle = 'rgba(10,4,20,0.35)';
  capsule(c, -9, -6, -12, 50, 13, 10);
  c.fill();
  capsule(c, -12, 50, FEET[0][0], FEET[0][1], 10, 9);
  c.fill();
  paintLeg(c, 9, -4, 8, 54, FEET[1][0], FEET[1][1], true);

  // pelvis: red hips, gold centre piece
  c.beginPath();
  c.moveTo(-19, -44);
  c.lineTo(19, -44);
  c.quadraticCurveTo(24, -20, 18, -4);
  c.lineTo(6, 6);
  c.lineTo(-6, 6);
  c.lineTo(-18, -6);
  c.quadraticCurveTo(-23, -22, -19, -44);
  shadeFill(c, RED, -22, -44, 22, 6);
  panel(c, [-6, -40, 6, -40, 5, -14, 0, -2, -5, -14]);
  c.closePath();
  shadeFill(c, GOLD, -6, -40, 6, 0);

  // torso: broad chest tapering to the waist
  c.beginPath();
  c.moveTo(-30, -94);
  c.quadraticCurveTo(0, -101, 30, -94);
  c.quadraticCurveTo(34, -80, 26, -68);
  c.quadraticCurveTo(20, -52, 17, -42);
  c.lineTo(-17, -42);
  c.quadraticCurveTo(-21, -54, -27, -68);
  c.quadraticCurveTo(-34, -80, -30, -94);
  shadeFill(c, RED, -32, -100, 32, -42);
  // gold abdomen plates
  for (let i = 0; i < 3; i++) {
    const y = -62 + i * 6.5;
    const hw = 12 - i * 1.2;
    panel(c, [-hw, y, hw, y, hw - 1, y + 5, -hw + 1, y + 5]);
    c.closePath();
    shadeFill(c, GOLD, -hw, y, hw, y + 5);
  }
  // pectoral plates and their seams
  c.strokeStyle = 'rgba(25,3,6,0.7)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-26, -70);
  c.quadraticCurveTo(-12, -63, -2, -66);
  c.moveTo(28, -70);
  c.quadraticCurveTo(14, -63, 6, -66);
  c.moveTo(-18, -94);
  c.lineTo(-10, -84);
  c.moveTo(20, -94);
  c.lineTo(13, -84);
  c.stroke();
  // chest highlight catching the moon
  c.strokeStyle = 'rgba(255,170,150,0.6)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(8, -93);
  c.quadraticCurveTo(24, -91, 27, -78);
  c.stroke();
  // arc reactor housing
  c.fillStyle = STEEL[0];
  c.beginPath();
  c.arc(REACTOR[0], REACTOR[1], 9, 0, TAU);
  c.fill();
  c.strokeStyle = STEEL[3];
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = '#bff4ff';
  c.beginPath();
  c.arc(REACTOR[0], REACTOR[1], 6, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(40,120,160,0.8)';
  c.lineWidth = 0.8;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    c.beginPath();
    c.moveTo(REACTOR[0] + Math.cos(a) * 3.5, REACTOR[1] + Math.sin(a) * 3.5);
    c.lineTo(REACTOR[0] + Math.cos(a) * 6, REACTOR[1] + Math.sin(a) * 6);
    c.stroke();
  }
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(REACTOR[0], REACTOR[1], 2.8, 0, TAU);
  c.fill();

  // neck
  c.fillStyle = STEEL[1];
  c.fillRect(-7, -104, 15, 12);
  c.fillStyle = STEEL[2];
  c.fillRect(-7, -101, 15, 1.5);
  c.fillRect(-7, -97, 15, 1.5);

  // helmet, turned a little to his left (screen right)
  c.beginPath();
  c.moveTo(-10, -101);
  c.bezierCurveTo(-15, -112, -14, -126, -5, -133);
  c.bezierCurveTo(3, -139, 16, -135, 20, -124);
  c.bezierCurveTo(23, -115, 22, -104, 16, -97);
  c.lineTo(3, -94);
  c.closePath();
  shadeFill(c, RED, -14, -138, 22, -94);
  // faceplate
  c.beginPath();
  c.moveTo(-1, -124);
  c.quadraticCurveTo(9, -128, 18, -123);
  c.quadraticCurveTo(22, -112, 18, -99);
  c.lineTo(13, -95.5);
  c.lineTo(4, -95.5);
  c.lineTo(0, -100);
  c.quadraticCurveTo(-3, -112, -1, -124);
  shadeFill(c, GOLD, -2, -128, 21, -95);
  c.strokeStyle = 'rgba(60,30,4,0.8)';
  c.lineWidth = 0.9;
  c.stroke();
  // mouth, cheek and brow lines
  c.beginPath();
  c.moveTo(5, -100.5);
  c.lineTo(14, -100.5);
  c.moveTo(1, -108);
  c.lineTo(4, -102);
  c.moveTo(19, -109);
  c.lineTo(16, -102);
  c.moveTo(8.5, -123);
  c.lineTo(8.5, -117);
  c.stroke();
  // eye slits (bright; the glow is layered live)
  c.fillStyle = '#e9fbff';
  panel(c, [1.5, -115, 7.5, -114, 7.2, -111.5, 2.5, -112.2]);
  c.closePath();
  c.fill();
  panel(c, [10.5, -114, 17, -115.5, 16.4, -112.5, 10.8, -111.5]);
  c.closePath();
  c.fill();
  // ear disc and helmet crest highlight
  c.beginPath();
  c.arc(-6, -112, 4.5, 0, TAU);
  shadeFill(c, RED, -10, -116, -2, -108);
  c.strokeStyle = 'rgba(20,2,4,0.7)';
  c.stroke();
  c.strokeStyle = 'rgba(255,190,170,0.7)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-3, -131);
  c.quadraticCurveTo(10, -137, 18, -126);
  c.stroke();
  // cool rim along the back of the figure
  c.strokeStyle = RIM;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-12, -106);
  c.bezierCurveTo(-15, -115, -13, -126, -5, -133);
  c.moveTo(-30, -92);
  c.quadraticCurveTo(-33, -80, -27, -68);
  c.stroke();
}

/** Arm pointing along +x from the shoulder: pauldron, gold upper arm, red gauntlet, open palm */
function paintArm(c: C) {
  c.lineJoin = 'round';
  capsule(c, 2, 0, 42, 0, 9, 7.5);
  shadeFill(c, GOLD, 0, -9, 42, 9);
  c.fillStyle = STEEL[1];
  c.beginPath();
  c.arc(44, 0, 6.5, 0, TAU);
  c.fill();
  capsule(c, 46, 0, 76, 0, 8.5, 8);
  shadeFill(c, RED, 44, -9, 78, 9);
  c.strokeStyle = 'rgba(25,3,6,0.7)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(58, -8);
  c.lineTo(58, 8);
  c.stroke();
  // hand bent back, palm out, fingers up
  c.beginPath();
  c.moveTo(76, -8);
  c.lineTo(88, -12);
  c.quadraticCurveTo(93, -8, 92, 2);
  c.lineTo(90, 9);
  c.lineTo(78, 8);
  c.closePath();
  shadeFill(c, RED, 76, -12, 93, 9);
  c.fillStyle = GOLD[2];
  for (let i = 0; i < 3; i++) c.fillRect(80 + i * 3.4, -17 + i * 0.6, 2.6, 7);
  c.fillStyle = STEEL[0];
  c.beginPath();
  c.ellipse(91, -1, 2.4, 5.5, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#e9fbff';
  c.beginPath();
  c.ellipse(91.6, -1, 1.2, 3.6, 0, 0, TAU);
  c.fill();
  // pauldron on top
  c.beginPath();
  c.ellipse(4, 0, 13, 12, 0, 0, TAU);
  shadeFill(c, RED, -9, -12, 17, 12);
  c.strokeStyle = 'rgba(255,190,170,0.6)';
  c.lineWidth = 1.3;
  c.beginPath();
  c.arc(4, 0, 10, -1.9, -0.3);
  c.stroke();
}

function paintDrone(c: C) {
  // hull: a gunmetal teardrop nosing left, toward the hero
  c.beginPath();
  c.moveTo(-26, 0);
  c.bezierCurveTo(-22, -12, 4, -14, 24, -6);
  c.lineTo(30, 0);
  c.lineTo(24, 6);
  c.bezierCurveTo(4, 14, -22, 12, -26, 0);
  c.fillStyle = grad(c, 0, -14, 0, 14, [STEEL[3], STEEL[2], STEEL[1], STEEL[0]]);
  c.fill();
  // fins
  c.fillStyle = STEEL[1];
  panel(c, [4, -9, 18, -17, 22, -16, 16, -6]);
  c.fill();
  panel(c, [4, 9, 18, 17, 22, 16, 16, 6]);
  c.fill();
  c.strokeStyle = 'rgba(160,180,210,0.5)';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-16, -8);
  c.quadraticCurveTo(0, -12, 20, -6);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.beginPath();
  c.moveTo(-6, -10);
  c.lineTo(-6, 10);
  c.moveTo(8, -9);
  c.lineTo(8, 9);
  c.stroke();
  // lens housing
  c.fillStyle = '#07080c';
  c.beginPath();
  c.arc(-15, 0, 6, 0, TAU);
  c.fill();
  c.fillStyle = '#ff3a2a';
  c.beginPath();
  c.arc(-16, 0, 3.2, 0, TAU);
  c.fill();
  c.fillStyle = '#ffd0c0';
  c.beginPath();
  c.arc(-17, -1, 1.2, 0, TAU);
  c.fill();
}

function bake(prev: HTMLCanvasElement | null, box: number[], k: number, paint: (c: C) => void) {
  const { cv, c } = layer(prev, box[2], box[3], k);
  if (c) {
    c.translate(-box[0], -box[1]);
    paint(c);
  }
  return cv;
}

/* ---------- backdrop ---------- */

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#02040d');
  sky.addColorStop(0.45, '#0a1433');
  sky.addColorStop(0.75, '#1d2150');
  sky.addColorStop(1, '#4a2a4a');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(11);
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    c.globalAlpha = 0.15 + rnd() * 0.6;
    c.fillStyle = rnd() < 0.2 ? '#bcd6ff' : '#ffffff';
    const r = rnd() < 0.07 ? 1.6 : 0.8;
    c.fillRect(rnd() * w, rnd() * h * 0.55, r, r);
  }
  c.globalAlpha = 1;
  const u = s.u;
  const mx = w * 0.82;
  const my = h * 0.2;
  const mr = 40 * u;
  const halo = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 6);
  halo.addColorStop(0, 'rgba(180,210,255,0.28)');
  halo.addColorStop(0.4, 'rgba(110,140,230,0.08)');
  halo.addColorStop(1, 'rgba(60,70,160,0)');
  c.fillStyle = halo;
  c.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
  const disc = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fbfcff');
  disc.addColorStop(0.75, '#dbe4ff');
  disc.addColorStop(1, '#aab8ee');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(120,135,200,0.2)';
  for (const [ox, oy, rr] of [
    [-0.3, -0.1, 0.22],
    [0.3, 0.3, 0.25],
    [0.05, -0.45, 0.1],
  ]) {
    c.beginPath();
    c.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU);
    c.fill();
  }
  // long moonlit cloud bands
  for (let i = 0; i < 7; i++) {
    const cy = h * (0.12 + rnd() * 0.35);
    const cx = rnd() * w;
    const cw = (160 + rnd() * 260) * u;
    const ch = (6 + rnd() * 10) * u;
    const g = c.createLinearGradient(0, cy - ch, 0, cy + ch);
    g.addColorStop(0, 'rgba(150,170,230,0.14)');
    g.addColorStop(1, 'rgba(40,40,90,0.05)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, cw, ch, 0, 0, TAU);
    c.fill();
  }
  // warm city glow on the horizon
  const haze = c.createLinearGradient(0, h * 0.55, 0, h);
  haze.addColorStop(0, 'rgba(255,120,70,0)');
  haze.addColorStop(1, 'rgba(255,130,80,0.28)');
  c.fillStyle = haze;
  c.fillRect(0, h * 0.55, w, h * 0.45);
}

/** Seamless strip of towers; the tall tower with the lit crown shows up once per tile */
function paintSkyline(
  prev: HTMLCanvasElement | null,
  s: State,
  env: SceneEnv,
  seed: number,
  lo: number,
  hi: number,
  body: string,
  win: number,
  lit: number,
  landmark: boolean
) {
  const { h, dpr } = env;
  const u = s.u;
  const { cv, c } = layer(prev, s.tileW, h, dpr);
  if (!c) return cv;
  const rnd = mulberry(seed);
  let x = 0;
  let i = 0;
  const mark = Math.floor(3 + rnd() * 3);
  while (x < s.tileW - 1) {
    let bw = (26 + rnd() * 54) * u;
    if (s.tileW - (x + bw) < 26 * u) bw = s.tileW - x;
    let top = h * (lo + rnd() * (hi - lo));
    const isMark = landmark && i === mark;
    if (isMark) {
      bw = 46 * u;
      top = h * lo - 70 * u;
    }
    c.fillStyle = body;
    c.fillRect(x, top, bw + 0.5, h - top);
    if (isMark) {
      // the tower: a slanted crown, a landing pad and a lit spine
      c.beginPath();
      c.moveTo(x - 4 * u, top);
      c.lineTo(x + bw * 0.2, top - 34 * u);
      c.quadraticCurveTo(x + bw * 0.8, top - 46 * u, x + bw + 10 * u, top - 18 * u);
      c.lineTo(x + bw, top);
      c.fill();
      c.fillRect(x + bw, top + 30 * u, 26 * u, 4 * u);
      c.fillStyle = 'rgba(140,220,255,0.85)';
      c.fillRect(x + bw * 0.46, top - 26 * u, 3 * u, h - top);
      c.fillStyle = 'rgba(140,220,255,0.35)';
      c.fillRect(x + bw * 0.46 - 3 * u, top - 26 * u, 9 * u, h - top);
      c.fillStyle = 'rgba(160,230,255,0.9)';
      c.beginPath();
      c.moveTo(x + bw * 0.2, top - 34 * u);
      c.quadraticCurveTo(x + bw * 0.8, top - 46 * u, x + bw + 10 * u, top - 18 * u);
      c.lineTo(x + bw + 8 * u, top - 15 * u);
      c.quadraticCurveTo(x + bw * 0.8, top - 42 * u, x + bw * 0.22, top - 31 * u);
      c.fill();
    } else if (rnd() < 0.25) {
      c.fillRect(x + bw * 0.45, top - 22 * u, 2 * u, 22 * u);
      c.fillStyle = '#ff3b3b';
      c.fillRect(x + bw * 0.45 - 0.5 * u, top - 24 * u, 3 * u, 3 * u);
    }
    const gx = win * 1.9 * u;
    const gy = win * 2.4 * u;
    for (let wy = top + gy; wy < h; wy += gy) {
      const floorLit = rnd() < 0.3 ? lit * 2.2 : lit;
      for (let wx = x + gx * 0.6; wx < x + bw - gx * 0.6; wx += gx) {
        if (rnd() > floorLit) continue;
        c.globalAlpha = 0.35 + rnd() * 0.55;
        c.fillStyle = rnd() < 0.78 ? '#ffcf7a' : '#a8d4ff';
        c.fillRect(wx, wy, win * u, win * 1.3 * u);
      }
    }
    c.globalAlpha = 1;
    // moonlit edge
    c.fillStyle = 'rgba(150,175,255,0.12)';
    c.fillRect(x + bw - 1.5 * u, top, 1.5 * u, h - top);
    x += bw;
    i++;
  }
  return cv;
}

function drawStrip(ctx: C, cv: HTMLCanvasElement | null, s: State, f: number, h: number, dy: number) {
  if (!cv) return;
  const off = (((s.scroll * s.u * f) % s.tileW) + s.tileW) % s.tileW;
  ctx.drawImage(cv, -off, dy, s.tileW, h);
  ctx.drawImage(cv, -off + s.tileW, dy, s.tileW, h);
}

/* ---------- helpers ---------- */

function resetDrone(d: Drone, first: boolean, i: number) {
  d.alive = true;
  d.hp = 2;
  d.flash = 0;
  d.depth = rand(0.75, 1.1);
  d.x = first ? 0.62 + i * 0.12 + rand(0, 0.06) : rand(1.08, 1.3);
  d.y = rand(0.16, 0.66);
  d.vx = -rand(0.05, 0.1);
  d.phase = rand(0, TAU);
  d.respawn = 0;
}

/** Figure-space point to screen */
function toScreen(s: State, env: SceneEnv, lx: number, ly: number, out: number[]) {
  const k = s.u * 0.98;
  const c = Math.cos(s.lean);
  const sn = Math.sin(s.lean);
  out[0] = s.x * env.w + (lx * c - ly * sn) * k;
  out[1] = s.y * env.h + (lx * sn + ly * c) * k;
}

const P = [0, 0];
const Q = [0, 0];

function hand(s: State, env: SceneEnv, near: boolean, out: number[]) {
  const sh = near ? SHOULDER_N : SHOULDER_F;
  const a = near ? s.armNear : s.armFar;
  toScreen(s, env, sh[0] + Math.cos(a) * ARM_LEN, sh[1] + Math.sin(a) * ARM_LEN, out);
}

function pickTarget(s: State, env: SceneEnv) {
  const hx = s.x * env.w;
  const hy = s.y * env.h;
  let best = -1;
  let score = Infinity;
  for (let i = 0; i < s.drones.length; i++) {
    const d = s.drones[i];
    if (!d.alive || d.x > 1.02 || d.x < 0) continue;
    const dx = d.x * env.w - hx;
    const dy = d.y * env.h - hy;
    if (dx < 40 * s.u) continue;
    const sc = Math.hypot(dx, dy) + Math.abs(dy) * 0.8 + (i === s.target ? -80 * s.u : 0);
    if (sc < score) {
      score = sc;
      best = i;
    }
  }
  if (best !== s.target) s.lock = 0;
  s.target = best;
}

/** Aim point for weapons: the locked drone, or straight ahead */
function aimPoint(s: State, env: SceneEnv, out: number[]) {
  const d = s.target >= 0 ? s.drones[s.target] : null;
  if (d) {
    out[0] = d.x * env.w;
    out[1] = d.y * env.h + Math.sin(d.phase) * 10 * s.u;
  } else {
    out[0] = s.x * env.w + env.w * 0.5;
    out[1] = s.y * env.h - 20 * s.u;
  }
}

function explode(s: State, env: SceneEnv, d: Drone, big: boolean) {
  const x = d.x * env.w;
  const y = d.y * env.h + Math.sin(d.phase) * 10 * s.u;
  const u = s.u;
  d.alive = false;
  d.respawn = rand(1.2, 2.4);
  burst(s.parts, 34, x, y, 0, Math.PI, 520 * u, 0.6, 2.4 * u, 0, 2.5, 380 * u);
  burst(s.parts, 12, x, y, 0, Math.PI, 260 * u, 1.2, 4 * u, 1, 1.2, 520 * u);
  burst(s.parts, 10, x, y, -Math.PI / 2, Math.PI, 70 * u, 1.3, 16 * u, 2, 1.5, -30 * u);
  let slot = s.rings[0];
  for (const r of s.rings) if (r.age > slot.age) slot = r;
  slot.x = x;
  slot.y = y;
  slot.age = 0;
  slot.size = big ? 1.4 : 1;
  s.flash = Math.max(s.flash, big ? 0.35 : 0.22);
  if (!env.reducedMotion) {
    s.stop = Math.max(s.stop, 0.07);
    s.shake = Math.max(s.shake, big ? 0.8 : 0.55);
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.55, gain: 0.32, freq: 380, q: 0.7, type: 'lowpass' });
    tone(bus, 110, { type: 'sine', attack: 0.004, decay: 0.45, gain: 0.22, glideTo: 38 });
  }
}

function fireRepulsor(s: State, env: SceneEnv, sound: boolean) {
  hand(s, env, true, P);
  pickTarget(s, env);
  aimPoint(s, env, Q);
  s.sx0 = P[0];
  s.sy0 = P[1];
  s.sx1 = Q[0];
  s.sy1 = Q[1];
  s.shotLife = 1;
  s.palm = 1.3;
  const u = s.u;
  burst(s.parts, 8, P[0], P[1], Math.atan2(Q[1] - P[1], Q[0] - P[0]), 0.5, 300 * u, 0.25, 2 * u, 3, 3);
  const bus = sound ? env.audio() : null;
  if (bus) {
    tone(bus, 260, { type: 'sawtooth', attack: 0.006, decay: 0.16, gain: 0.07, glideTo: 1400 });
    noise(bus, { duration: 0.14, gain: 0.12, freq: 2600, q: 0.7, type: 'highpass' });
  }
  const d = s.target >= 0 ? s.drones[s.target] : null;
  if (d) {
    d.hp -= 1;
    d.flash = 1;
    d.vx += 0.08;
    burst(s.parts, 16, Q[0], Q[1], Math.atan2(Q[1] - P[1], Q[0] - P[0]), 0.9, 360 * u, 0.4, 2 * u, 0, 3, 300 * u);
    if (d.hp <= 0) explode(s, env, d, false);
    else if (!env.reducedMotion) {
      s.stop = Math.max(s.stop, 0.04);
      s.shake = Math.max(s.shake, 0.3);
    }
  } else if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.15);
}

function startBeam(s: State, env: SceneEnv, max: number, sound: boolean) {
  s.beaming = true;
  s.beamT = 0;
  s.beamMax = max;
  s.beamFade = 1;
  toScreen(s, env, REACTOR[0], REACTOR[1], P);
  pickTarget(s, env);
  aimPoint(s, env, Q);
  s.beamA = clamp(Math.atan2(Q[1] - P[1], Q[0] - P[0]), -0.7, 0.7);
  s.flash = Math.max(s.flash, 0.3);
  if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.6);
  const bus = sound ? env.audio() : null;
  if (bus) {
    noise(bus, { duration: 0.4, gain: 0.2, freq: 900, q: 0.6 });
    stopHum(s.hum);
    s.hum = startHum(bus, { type: 'sawtooth', freq: 140, cutoff: 1800, noiseAmt: 0.5 });
    setHum(s.hum, 170, 0.12, 2400);
  }
}

function endBeam(s: State) {
  if (!s.beaming) return;
  s.beaming = false;
  stopHum(s.hum);
  s.hum = null;
}

function press(s: State, env: SceneEnv) {
  if (s.held) return;
  s.held = true;
  s.holdT = 0;
  s.touched = true;
  s.idle = 0;
  const bus = env.audio();
  if (bus) tone(bus, 420, { type: 'triangle', attack: 0.02, decay: 0.22, gain: 0.03, glideTo: 900 });
  env.wake(900);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  if (s.beaming) endBeam(s);
  else if (s.uni > 0.45) startBeam(s, env, 0.7, true);
  else {
    s.fireQ = true;
    s.fireWait = 0;
  }
  s.uni = s.beaming ? s.uni : 0;
  env.wake(1400);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.45,
    init: () => {
      const drones: Drone[] = [];
      for (let i = 0; i < MAX_DRONES; i++) {
        const d: Drone = { x: 0, y: 0, vx: 0, phase: 0, depth: 1, hp: 2, flash: 0, alive: true, respawn: 0 };
        resetDrone(d, true, i);
        drones.push(d);
      }
      // a fixed opening line up so the poster frame is always composed the same way
      drones[0].x = 0.72;
      drones[0].y = 0.36;
      drones[1].x = 0.9;
      drones[1].y = 0.58;
      drones[2].x = 1.05;
      drones[2].y = 0.22;
      return {
        x: 0.3,
        y: 0.46,
        vx: 0,
        vy: 0,
        tx: 0.3,
        ty: 0.46,
        lean: 0.5,
        armNear: 2.2,
        armFar: 2.3,
        held: false,
        holdT: 0,
        touched: false,
        idle: 0,
        keys: 0,
        autoT: 0.9,
        autoUni: 1.4,
        palm: 0,
        fireQ: false,
        fireWait: 0,
        shotLife: 0,
        sx0: 0,
        sy0: 0,
        sx1: 0,
        sy1: 0,
        uni: 0,
        beaming: false,
        beamT: 0,
        beamMax: 0,
        beamFade: 0,
        beamA: 0,
        target: -1,
        lock: 0,
        drones,
        rings: Array.from({ length: 6 }, () => ({ x: 0, y: 0, age: 9, size: 1 })),
        parts: makePool(MAX_PARTS),
        scroll: 0,
        stop: 0,
        shake: 0,
        flash: 0,
        hum: null,
        u: 1,
        tileW: 1,
        bg: null,
        far: null,
        mid: null,
        near: null,
        body: null,
        arm: null,
        armDark: null,
        drone: null,
        cyan: glowSprite(96, [
          [0, 'rgba(255,255,255,1)'],
          [0.18, 'rgba(200,245,255,0.85)'],
          [0.45, 'rgba(80,190,255,0.3)'],
          [1, 'rgba(30,120,255,0)'],
        ]),
        hot: glowSprite(96, [
          [0, 'rgba(255,255,240,1)'],
          [0.25, 'rgba(255,220,150,0.7)'],
          [0.55, 'rgba(255,120,40,0.25)'],
          [1, 'rgba(255,60,0,0)'],
        ]),
        fire: glowSprite(64, [
          [0, 'rgba(255,240,200,1)'],
          [0.4, 'rgba(255,150,60,0.6)'],
          [1, 'rgba(160,40,10,0)'],
        ]),
        red: glowSprite(48, [
          [0, 'rgba(255,200,190,1)'],
          [0.3, 'rgba(255,60,40,0.6)'],
          [1, 'rgba(255,0,0,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h, dpr } = env;
      s.u = Math.min(w / 900, h / 560);
      s.tileW = Math.max(w, 900 * s.u);
      paintBackdrop(s, env);
      s.far = paintSkyline(s.far, s, env, 3, 0.6, 0.78, '#141a3a', 2, 0.14, false);
      s.mid = paintSkyline(s.mid, s, env, 9, 0.7, 0.86, '#0c1130', 2.8, 0.2, true);
      s.near = paintSkyline(s.near, s, env, 17, 0.84, 0.96, '#070916', 3.6, 0.26, false);
      const k = s.u * 0.98 * dpr;
      s.body = bake(s.body, BODY_BOX, k, paintBody);
      s.arm = bake(s.arm, ARM_BOX, k, paintArm);
      s.armDark = bake(s.armDark, ARM_BOX, k, (c) => {
        paintArm(c);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = 'rgba(12,6,26,0.45)';
        c.fillRect(ARM_BOX[0], ARM_BOX[1], ARM_BOX[2], ARM_BOX[3]);
      });
      s.drone = bake(s.drone, DRONE_BOX, s.u * dpr * 1.1, paintDrone);
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w, h } = env;
      const u = s.u;
      const rm = env.reducedMotion;
      stepPool(s.parts, dt);
      for (const r of s.rings) r.age += dt;
      s.flash = Math.max(0, s.flash - dt * 3);
      s.shake = Math.max(0, s.shake - dt * 2.4);
      s.shotLife = Math.max(0, s.shotLife - dt * 6);
      if (s.stop > 0) {
        s.stop -= dt;
        return;
      }

      // input and autopilot
      if (s.held) {
        s.holdT += dt;
        if (rm) env.wake(300);
      }
      s.idle = s.held ? 0 : s.idle + dt;
      const auto = !env.interactive || !s.touched || s.idle > 6;
      if (s.keys) {
        const kx = (s.keys & 2 ? 1 : 0) - (s.keys & 1 ? 1 : 0);
        const ky = (s.keys & 8 ? 1 : 0) - (s.keys & 4 ? 1 : 0);
        s.tx = clamp(s.tx + kx * 0.5 * dt, 0.12, 0.6);
        s.ty = clamp(s.ty + ky * 0.6 * dt, 0.2, 0.78);
        if (rm) env.wake(300);
      } else if (auto) {
        const at = s.scroll * 0.004;
        s.tx = 0.3 + Math.sin(at * 0.7) * 0.06;
        s.ty = 0.46 + Math.sin(at * 1.1) * 0.12;
      }
      if (auto && !s.held) {
        s.autoT -= dt;
        s.autoUni -= dt;
        if (s.autoUni <= 0 && !s.beaming && s.uni === 0) {
          s.uni = 0.001;
          s.autoUni = rand(9, 13);
        }
        if (s.uni > 0 && !s.beaming) {
          s.uni = Math.min(1, s.uni + dt / UNI_CHARGE);
          if (s.uni >= 1) startBeam(s, env, 1.1, false);
        } else if (s.autoT <= 0 && !s.beaming) {
          s.autoT = rand(1.2, 1.9);
          s.fireQ = true;
          s.fireWait = 0;
        }
      }

      // unibeam charge while held
      if (s.held && !s.beaming && s.holdT > TAP) {
        s.uni = Math.min(1, s.uni + dt / UNI_CHARGE);
        if (s.uni >= 1) startBeam(s, env, 3, true);
      }
      if (!s.held && !s.beaming && !auto) s.uni = Math.max(0, s.uni - dt * 3);

      // flight
      const ax = (s.tx - s.x) * 30 - s.vx * 7;
      const ay = (s.ty - s.y) * 30 - s.vy * 7;
      s.vx += ax * dt;
      s.vy += ay * dt;
      if (s.beaming) s.vx -= 0.06 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const pace = 1 + clamp(s.vx * 3, -0.4, 1.2);
      s.scroll += dt * 520 * pace;
      s.lean = damp(s.lean, clamp(0.62 + s.vy * 1.6 + s.vx * 0.9, 0.3, 1.05), 6, dt);

      // targeting
      pickTarget(s, env);
      s.lock = s.target >= 0 ? Math.min(1, s.lock + dt * 2.6) : 0;

      // arms: the near arm rises to aim whenever a shot is coming
      const aiming = s.held || s.fireQ || s.shotLife > 0.2;
      toScreen(s, env, SHOULDER_N[0], SHOULDER_N[1], P);
      aimPoint(s, env, Q);
      const aimLocal = Math.atan2(Q[1] - P[1], Q[0] - P[0]) - s.lean;
      const bob = Math.sin(s.scroll * 0.01) * 0.06;
      s.armNear = damp(s.armNear, aiming && !s.beaming ? aimLocal : 2.2 + bob, aiming ? 22 : 6, dt);
      s.armFar = damp(s.armFar, 2.3 - bob, 6, dt);
      if (s.fireQ) {
        s.fireWait += dt;
        let err = s.armNear - aimLocal;
        err = Math.abs(((err + Math.PI) % TAU) - Math.PI);
        if (err < 0.12 || s.fireWait > 0.14) {
          s.fireQ = false;
          fireRepulsor(s, env, !auto || s.touched);
        }
      }
      s.palm = Math.max(s.held && !s.beaming && s.holdT <= TAP ? Math.min(1, s.holdT * 6) : 0, s.palm - dt * 4);

      // unibeam
      if (s.beaming) {
        s.beamT += dt;
        toScreen(s, env, REACTOR[0], REACTOR[1], P);
        pickTarget(s, env);
        aimPoint(s, env, Q);
        const want = clamp(Math.atan2(Q[1] - P[1], Q[0] - P[0]), -0.7, 0.7);
        s.beamA = damp(s.beamA, want, 3.5, dt);
        if (!rm) s.shake = Math.max(s.shake, 0.28);
        const cs = Math.cos(s.beamA);
        const sn = Math.sin(s.beamA);
        for (const d of s.drones) {
          if (!d.alive) continue;
          const dx = d.x * w - P[0];
          const dy = d.y * h + Math.sin(d.phase) * 10 * u - P[1];
          const along = dx * cs + dy * sn;
          const off = Math.abs(-dx * sn + dy * cs);
          if (along > 0 && off < 26 * u * d.depth + 14 * u) {
            d.flash = 1;
            d.hp -= dt * 5;
            if (Math.random() < 0.6) emit(s.parts, d.x * w, d.y * h, rand(-200, 200) * u, rand(-260, 60) * u, 0.4, 2 * u, 0, 2, 400 * u);
            if (d.hp <= 0) explode(s, env, d, true);
          }
        }
        if (s.hum) setHum(s.hum, 170 + Math.sin(s.beamT * 30) * 6, 0.12, 2400);
        if (s.beamT >= s.beamMax) endBeam(s);
        s.uni = 1;
        if (rm) env.wake(300);
      } else if (s.beamFade > 0) {
        s.beamFade = Math.max(0, s.beamFade - dt * 5);
        if (s.beamFade === 0) s.uni = 0;
      }
      if (s.uni > 0 && !s.beaming && Math.random() < 0.7) {
        // motes drawn into the reactor while it charges
        toScreen(s, env, REACTOR[0], REACTOR[1], P);
        const a = rand(0, TAU);
        const r = rand(40, 70) * u;
        emit(s.parts, P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r, -Math.cos(a) * r * 3.2, -Math.sin(a) * r * 3.2, 0.3, 1.6 * u, 3);
      }

      // drones
      for (let i = 0; i < s.drones.length; i++) {
        const d = s.drones[i];
        if (!d.alive) {
          d.respawn -= dt;
          if (d.respawn <= 0) resetDrone(d, false, i);
          continue;
        }
        d.phase += dt * 2.2;
        d.vx = damp(d.vx, -0.075 * d.depth, 1.5, dt);
        d.x += d.vx * dt;
        d.flash = Math.max(0, d.flash - dt * 5);
        if (d.x < -0.1) resetDrone(d, false, i);
      }

      // boot thruster exhaust
      {
        for (let f = 0; f < 2; f++) {
          toScreen(s, env, FEET[f][0], FEET[f][1] + 4, P);
          const a = s.lean + Math.PI / 2 + 0.25;
          emit(s.parts, P[0], P[1], Math.cos(a) * 160 * u - 300 * u, Math.sin(a) * 160 * u, 0.35, rand(4, 7) * u, 2, 2, -40 * u);
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 9 * u;
      const ox = shakeX(amp, t);
      const oy = shakeY(amp, t);
      ctx.save();
      ctx.translate(ox, oy);
      const lift = (s.y - 0.46) * 40 * u;
      drawStrip(ctx, s.far, s, 0.08, h, -lift * 0.3);
      drawStrip(ctx, s.mid, s, 0.2, h, -lift * 0.6);
      // low mist between layers
      ctx.fillStyle = 'rgba(90,70,140,0.14)';
      ctx.fillRect(0, h * 0.8 - lift * 0.8, w, h);
      drawStrip(ctx, s.near, s, 0.5, h, -lift);

      // wind streaks show the speed
      ctx.strokeStyle = 'rgba(200,215,255,0.16)';
      ctx.lineWidth = Math.max(0.7, u);
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const sp = 0.4 + ((i * 37) % 11) / 11;
        const x = w - ((s.scroll * u * sp * 1.6 + i * 173) % (w + 200 * u));
        const y = ((i * 97) % 100) / 100 * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 60 * u * sp, y);
      }
      ctx.stroke();

      // drones
      for (const d of s.drones) {
        if (!d.alive || !s.drone) continue;
        const x = d.x * w;
        const y = d.y * h + Math.sin(d.phase) * 10 * u;
        const k = d.depth * 1.1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(d.phase * 0.7) * 0.12);
        ctx.scale(k, k);
        ctx.drawImage(s.drone, DRONE_BOX[0] * u, DRONE_BOX[1] * u, DRONE_BOX[2] * u, DRONE_BOX[3] * u);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.red, x - 17 * u * k, y, 10 * u * k, 0.8 + Math.sin(t * 9 + d.phase) * 0.2);
        glow(ctx, s.fire, x + 32 * u * k, y, 9 * u * k, 0.7);
        if (d.flash > 0) glow(ctx, s.hot, x, y, 40 * u * k, d.flash * 0.8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // smoke under the hero, additive fire on top
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== 2) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = k * 0.22;
        ctx.fillStyle = '#6b6f8c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - k), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // hero
      toScreen(s, env, 0, 0, P);
      const hx = P[0];
      const hy = P[1];
      const k = u * 0.98;
      // boot flames
      ctx.globalCompositeOperation = 'lighter';
      for (let f = 0; f < 2; f++) {
        toScreen(s, env, FEET[f][0], FEET[f][1] + 6, Q);
        const a = s.lean + Math.PI / 2 + 0.2;
        const fl = (1 + Math.sin(t * 40 + f * 2) * 0.12) * (s.beaming ? 1.3 : 1);
        ctx.save();
        ctx.translate(Q[0], Q[1]);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,150,60,0.35)';
        ctx.beginPath();
        ctx.moveTo(-7 * k, 0);
        ctx.quadraticCurveTo(0, 60 * k * fl, 0, 70 * k * fl);
        ctx.quadraticCurveTo(0, 60 * k * fl, 7 * k, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,210,0.8)';
        ctx.beginPath();
        ctx.moveTo(-3.5 * k, 0);
        ctx.quadraticCurveTo(0, 30 * k * fl, 0, 36 * k * fl);
        ctx.quadraticCurveTo(0, 30 * k * fl, 3.5 * k, 0);
        ctx.fill();
        ctx.restore();
        glow(ctx, s.hot, Q[0], Q[1], 26 * k, 0.9);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(s.lean);
      ctx.scale(k, k);
      if (s.armDark) {
        ctx.save();
        ctx.translate(SHOULDER_F[0], SHOULDER_F[1]);
        ctx.rotate(s.armFar);
        ctx.drawImage(s.armDark, ARM_BOX[0], ARM_BOX[1], ARM_BOX[2], ARM_BOX[3]);
        ctx.restore();
      }
      if (s.body) ctx.drawImage(s.body, BODY_BOX[0], BODY_BOX[1], BODY_BOX[2], BODY_BOX[3]);
      if (s.arm) {
        ctx.save();
        ctx.translate(SHOULDER_N[0], SHOULDER_N[1]);
        ctx.rotate(s.armNear);
        ctx.drawImage(s.arm, ARM_BOX[0], ARM_BOX[1], ARM_BOX[2], ARM_BOX[3]);
        ctx.restore();
      }
      ctx.restore();

      // live light: eyes, reactor, palms
      ctx.globalCompositeOperation = 'lighter';
      toScreen(s, env, 9, -113, Q);
      glow(ctx, s.cyan, Q[0], Q[1], 14 * k, 0.75 + Math.sin(t * 3) * 0.1);
      toScreen(s, env, REACTOR[0], REACTOR[1], Q);
      const rx = Q[0];
      const ry = Q[1];
      glow(ctx, s.cyan, rx, ry, (20 + s.uni * 22) * k, 0.75 + s.uni * 0.25);
      if (s.uni > 0.2 && !s.beaming) glow(ctx, s.cyan, rx, ry, (50 + s.uni * 50) * k, s.uni * 0.22);
      hand(s, env, true, Q);
      glow(ctx, s.cyan, Q[0], Q[1], (16 + s.palm * 34) * k, 0.55 + s.palm * 0.45);
      hand(s, env, false, Q);
      glow(ctx, s.cyan, Q[0], Q[1], 14 * k, 0.45);

      // repulsor bolt
      if (s.shotLife > 0) {
        const L = s.shotLife;
        ctx.lineCap = 'round';
        const widths = [18, 9, 3.5];
        const cols = ['rgba(60,170,255,0.25)', 'rgba(150,225,255,0.6)', 'rgba(255,255,255,1)'];
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = cols[i];
          ctx.lineWidth = widths[i] * u * L;
          ctx.beginPath();
          ctx.moveTo(s.sx0, s.sy0);
          ctx.lineTo(s.sx1, s.sy1);
          ctx.stroke();
        }
        glow(ctx, s.cyan, s.sx1, s.sy1, 50 * u * (0.6 + L), L);
        glow(ctx, s.cyan, s.sx0, s.sy0, 30 * u * L, L);
      }

      // unibeam
      if (s.beaming || s.beamFade > 0) {
        const F = s.beaming ? Math.min(1, s.beamT * 8) : s.beamFade;
        const cs = Math.cos(s.beamA);
        const sn = Math.sin(s.beamA);
        const len = w * 1.6;
        const ex = rx + cs * len;
        const ey = ry + sn * len;
        const jit = 1 + Math.sin(t * 60) * 0.08;
        const widths = [56, 32, 17, 7];
        const cols = ['rgba(40,140,255,0.16)', 'rgba(90,200,255,0.3)', 'rgba(190,240,255,0.7)', 'rgba(255,255,255,1)'];
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = cols[i];
          ctx.lineWidth = widths[i] * u * F * jit;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        // pulses racing down the beam
        ctx.strokeStyle = 'rgba(200,245,255,0.5)';
        ctx.lineWidth = 2 * u;
        for (let i = 0; i < 6; i++) {
          const d = ((t * 900 * u + i * 160 * u) % (w * 1.2)) + 30 * u;
          const px = rx + cs * d;
          const py = ry + sn * d;
          ctx.beginPath();
          ctx.ellipse(px, py, 5 * u * F, 30 * u * F, s.beamA, 0, TAU);
          ctx.stroke();
        }
        glow(ctx, s.cyan, rx + cs * 14 * k, ry + sn * 14 * k, 46 * k * F, 0.9);
        glow(ctx, s.cyan, rx, ry, 150 * k * F, 0.18);
      }

      // sparks, debris embers and charge motes
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind === 2) continue;
        const k2 = p.life / p.max;
        if (p.kind === 0) {
          ctx.strokeStyle = k2 > 0.5 ? 'rgba(255,240,200,0.95)' : 'rgba(255,150,60,0.8)';
          ctx.lineWidth = p.size * 0.6;
          ctx.globalAlpha = k2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
        } else if (p.kind === 3) {
          glow(ctx, s.cyan, p.x, p.y, p.size * 5, k2);
        }
      }
      ctx.globalAlpha = 1;
      // explosion flashes and shock rings
      for (const r of s.rings) {
        if (r.age > 0.6) continue;
        const q = r.age / 0.6;
        glow(ctx, s.hot, r.x, r.y, (60 + q * 60) * u * r.size, (1 - q) * 1.2);
        ctx.strokeStyle = `rgba(255,220,170,${((1 - q) * 0.7).toFixed(3)})`;
        ctx.lineWidth = 3 * u * (1 - q);
        ctx.beginPath();
        ctx.arc(r.x, r.y, (20 + q * 110) * u * r.size, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // tumbling debris
      ctx.fillStyle = '#2a2f3a';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== 1) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.fillStyle = 'rgba(255,140,60,0.8)';
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 0.6, p.size);
        ctx.fillStyle = '#2a2f3a';
        ctx.restore();
      }

      // HUD reticle on the locked drone
      const d = s.target >= 0 ? s.drones[s.target] : null;
      if (d && d.alive) {
        const x = d.x * w;
        const y = d.y * h + Math.sin(d.phase) * 10 * u;
        const L = s.lock;
        const r = (70 - 36 * L) * u * d.depth;
        const col = L >= 1 ? 'rgba(255,90,70,0.9)' : 'rgba(150,230,255,0.85)';
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.5 * (1 - L * 0.7));
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, r, (i / 3) * TAU + 0.2, (i / 3) * TAU + 1.6);
          ctx.stroke();
        }
        ctx.rotate(-t * 3);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, 0, TAU);
        ctx.setLineDash([3 * u, 6 * u]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();
        const b = r * 0.72;
        const c = 10 * u;
        ctx.beginPath();
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          ctx.moveTo(x + sx * b, y + sy * (b - c));
          ctx.lineTo(x + sx * b, y + sy * b);
          ctx.lineTo(x + sx * (b - c), y + sy * b);
        }
        ctx.moveTo(x - 5 * u, y);
        ctx.lineTo(x + 5 * u, y);
        ctx.moveTo(x, y - 5 * u);
        ctx.lineTo(x, y + 5 * u);
        ctx.stroke();
        // lock-on pip trail back toward the hero
        ctx.fillStyle = col;
        for (let i = 1; i < 4; i++) {
          const q = i / 4;
          ctx.globalAlpha = 0.25 + L * 0.3;
          ctx.beginPath();
          ctx.arc(lerp(rx, x, q), lerp(ry, y, q), 1.6 * u, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // helmet HUD: frame arcs and the unibeam power gauge
      ctx.strokeStyle = 'rgba(150,220,255,0.22)';
      ctx.lineWidth = Math.max(1, 1.2 * u);
      const m = 26 * u;
      const cl = 40 * u;
      ctx.beginPath();
      ctx.moveTo(m, m + cl);
      ctx.lineTo(m, m);
      ctx.lineTo(m + cl, m);
      ctx.moveTo(w - m - cl, m);
      ctx.lineTo(w - m, m);
      ctx.lineTo(w - m, m + cl);
      ctx.moveTo(w - m, h - m - cl);
      ctx.lineTo(w - m, h - m);
      ctx.lineTo(w - m - cl, h - m);
      ctx.moveTo(m + cl, h - m);
      ctx.lineTo(m, h - m);
      ctx.lineTo(m, h - m - cl);
      ctx.stroke();
      const gx = m + 34 * u;
      const gy = h - m - 34 * u;
      const gr = 20 * u;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(170,235,255,0.85)';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, s.uni));
      ctx.stroke();
      ctx.fillStyle = `rgba(190,245,255,${(0.35 + s.uni * 0.6).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(gx, gy, 5 * u, 0, TAU);
      ctx.fill();
      // altitude ladder
      ctx.strokeStyle = 'rgba(150,220,255,0.25)';
      ctx.lineWidth = Math.max(1, u);
      ctx.beginPath();
      const lx = w - m - 10 * u;
      const step = 18 * u;
      const off = (s.y * h * 1.5) % step;
      for (let yy = h * 0.3 + off; yy < h * 0.7; yy += step) {
        ctx.moveTo(lx, yy);
        ctx.lineTo(lx - 10 * u, yy);
      }
      ctx.moveTo(lx - 18 * u, h * 0.5);
      ctx.lineTo(lx - 4 * u, h * 0.5 - 5 * u);
      ctx.lineTo(lx - 4 * u, h * 0.5 + 5 * u);
      ctx.closePath();
      ctx.stroke();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(190,230,255,${(s.flash * 0.4).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env, x, y) => {
      if (env.w > 0) {
        s.tx = clamp(x / env.w, 0.12, 0.6);
        s.ty = clamp(y / env.h, 0.2, 0.78);
      }
      press(s, env);
    },
    onPointerMove: (s, env, x, y) => {
      if (env.w <= 0) return;
      s.touched = true;
      s.idle = 0;
      s.tx = clamp(x / env.w, 0.12, 0.6);
      s.ty = clamp(y / env.h, 0.2, 0.78);
    },
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        if (down) {
          if (!e.repeat) press(s, env);
        } else release(s, env);
        return true;
      }
      const bit = k === 'a' ? 1 : k === 'd' ? 2 : k === 'w' ? 4 : k === 's' ? 8 : 0;
      if (!bit) return false;
      if (down) s.keys |= bit;
      else s.keys &= ~bit;
      s.touched = true;
      s.idle = 0;
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.bg, s.far, s.mid, s.near, s.body, s.arm, s.armDark, s.drone, s.cyan, s.hot, s.fire, s.red);
      s.bg = s.far = s.mid = s.near = s.body = s.arm = s.armDark = s.drone = null;
    },
  });
